// Server-side API to clear Supabase chat data (requires service role key for RLS bypass)
import { createClient } from "@supabase/supabase-js";

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

  const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: "Supabase not configured" });

  const supabase = createClient(supabaseUrl, serviceKey);
  const { mode, userId } = req.body || {};

  try {
    if (mode === "system") {
      // Delete ALL chat data (director only)
      const { error: e1 } = await supabase.from("messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      const { error: e2 } = await supabase.from("conversation_members").delete().neq("conversation_id", "00000000-0000-0000-0000-000000000000");
      const { error: e3 } = await supabase.from("conversations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      const errors = [e1, e2, e3].filter(Boolean);
      if (errors.length) console.error("[WF] Clear chat errors:", errors);
      return res.json({ ok: true, errors: errors.length });
    } else if (mode === "personal" && userId) {
      // Delete conversations where this user is a member
      const { data: memberships } = await supabase.from("conversation_members")
        .select("conversation_id").eq("user_id", userId);
      if (memberships?.length) {
        const convIds = memberships.map(m => m.conversation_id);
        await supabase.from("messages").delete().in("conversation_id", convIds);
        await supabase.from("conversation_members").delete().in("conversation_id", convIds);
        await supabase.from("conversations").delete().in("id", convIds);
      }
      return res.json({ ok: true });
    }
    return res.status(400).json({ error: "Invalid mode. Use 'system' or 'personal'" });
  } catch (e) {
    console.error("[WF] Clear chat error:", e);
    return res.status(500).json({ error: e.message });
  }
}
