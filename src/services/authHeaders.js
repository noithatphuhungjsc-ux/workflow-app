import { supabase } from "../lib/supabase";

/**
 * Build fetch headers with Supabase JWT if user is signed in.
 * Bootstrap flows (ensure_auth, ensure_profile) call this before a
 * session exists — server-side BOOTSTRAP_ACTIONS set handles the
 * missing Authorization case. For authenticated endpoints, a missing
 * token will result in 401 from server (expected — user must log in).
 *
 * @param {Object} extra - Additional headers to merge (optional)
 * @returns {Promise<Object>} Headers object ready for fetch
 */
export async function authHeaders(extra = {}) {
  const base = { "Content-Type": "application/json", ...extra };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      base.Authorization = `Bearer ${session.access_token}`;
    }
  } catch (err) {
    console.warn('[authHeaders] getSession failed:', err?.message);
  }
  return base;
}

/**
 * Helper: kiểm tra có session đã login chưa.
 * Dùng để skip fetch tránh 401 noise khi session chưa ready.
 */
export async function hasSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session?.access_token;
  } catch { return false; }
}
