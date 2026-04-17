/* ================================================================
   API Middleware — CORS + RBAC helpers for Vercel serverless functions
   Usage: import { cors, requireAuth, requireRole } from './_middleware';
   ================================================================ */

const DEV_ORIGIN = "http://localhost:5173";

/**
 * Return the canonical public URL of this app deployment.
 * Priority: PUBLIC_APP_URL (set in Vercel dashboard, stable prod domain)
 *          > VERCEL_URL (auto-injected per-deployment, changes on preview)
 *          > localhost dev fallback
 */
export function getPublicAppUrl() {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return DEV_ORIGIN;
}

/**
 * Get allowed CORS origin from request
 */
export function getAllowedOrigin(req) {
  const origin = req.headers.origin || "";
  const appUrl = getPublicAppUrl();
  if (origin === appUrl || origin === DEV_ORIGIN) return origin;
  // Allow any Vercel preview deployment of this project
  if (origin.startsWith("https://workflow-app-") && origin.endsWith(".vercel.app")) return origin;
  return appUrl;
}

/**
 * Set CORS headers on response
 */
export function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", getAllowedOrigin(req));
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

/**
 * Verify Supabase JWT and extract user info
 * Returns { userId, email, role } or null
 */
export async function verifyAuth(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  try {
    // Use Supabase Admin to verify the token
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseKey,
      },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return {
      userId: user.id,
      email: user.email,
      role: user.user_metadata?.role || user.app_metadata?.role || "staff",
    };
  } catch {
    return null;
  }
}

/**
 * Middleware: require authenticated user
 * Returns user object or sends 401
 */
export async function requireAuth(req, res) {
  const user = await verifyAuth(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized — invalid or missing token" });
    return null;
  }
  return user;
}

/**
 * Middleware: require specific role(s)
 * @param {string[]} allowedRoles - e.g. ["owner", "manager"]
 * Returns user object or sends 403
 */
export async function requireRole(req, res, allowedRoles) {
  const user = await requireAuth(req, res);
  if (!user) return null; // 401 already sent

  if (!allowedRoles.includes(user.role)) {
    res.status(403).json({
      error: "Forbidden — insufficient permissions",
      required: allowedRoles,
      current: user.role,
    });
    return null;
  }
  return user;
}

/**
 * Rate limiting (simple in-memory, resets on cold start)
 */
const rateMap = new Map();
export function checkRate(ip, limit = 30, windowMs = 60000) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.start > windowMs) {
    rateMap.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= limit;
}
