/* Attendance QR Code API — Generate and validate daily QR tokens */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

let _supa = null;
function getSupabase() {
  if (_supa) return _supa;
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  _supa = createClient(url, key);
  return _supa;
}

const ALLOWED_ORIGINS = ["https://workflow-app-lemon.vercel.app", "http://localhost:5173"];
function getAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (origin && origin.startsWith("https://workflow-app-") && origin.endsWith(".vercel.app")) return origin;
  return ALLOWED_ORIGINS[0];
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", getAllowedOrigin(origin));
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supa = getSupabase();
  if (!supa) return res.status(500).json({ error: "Supabase not configured" });

  const { action, siteId, token } = req.body || {};

  if (action === "generate") {
    if (!siteId) return res.status(400).json({ error: "Missing siteId" });

    const today = new Date().toISOString().split("T")[0];
    const newToken = randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min

    const { data, error } = await supa.from("daily_qr_codes").insert({
      site_id: siteId,
      date: today,
      token: newToken,
      expires_at: expiresAt,
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, token: newToken, expiresAt, data });
  }

  if (action === "validate") {
    if (!token) return res.status(400).json({ error: "Missing token" });

    const { data, error } = await supa.from("daily_qr_codes")
      .select("*")
      .eq("token", token)
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(400).json({ error: "QR code không hợp lệ hoặc đã hết hạn", valid: false });

    return res.json({ ok: true, valid: true, siteId: data.site_id, date: data.date });
  }

  return res.status(400).json({ error: "Unknown action. Use 'generate' or 'validate'" });
}
