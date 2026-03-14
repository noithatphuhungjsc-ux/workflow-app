/* Cloud sync API — uses service role key to bypass RLS */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

let _supa = null;
function getSupabase() {
  if (_supa) return _supa;
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  _supa = createClient(url, key);
  return _supa;
}

// Map local IDs to Supabase auth emails for UUID lookup
const LOCAL_ID_TO_EMAIL = {
  trinh: "trinh@workflow.vn", lien: "lien@workflow.vn",
  hung: "hung@workflow.vn", mai: "mai@workflow.vn", duc: "duc@workflow.vn",
};
const _uuidCache = {};
async function resolveUserId(supa, localId) {
  // Already a UUID
  if (localId && localId.includes("-") && localId.length > 30) return localId;
  // Check cache
  if (_uuidCache[localId]) return _uuidCache[localId];
  // Lookup by email
  const email = LOCAL_ID_TO_EMAIL[localId];
  if (!email) return localId;
  try {
    const { data: { users } } = await supa.auth.admin.listUsers({ filter: email });
    const match = (users || []).find(u => u.email === email);
    if (match) { _uuidCache[localId] = match.id; return match.id; }
  } catch {}
  return localId;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const supa = getSupabase();
  if (!supa) return res.status(500).json({ error: "Supabase not configured" });

  // GET: load user data
  if (req.method === "GET") {
    const { userId: rawUserId, key } = req.query;
    if (!rawUserId) return res.status(400).json({ error: "Missing userId" });
    const userId = await resolveUserId(supa, rawUserId);

    const query = supa.from("user_data").select("key, value");
    query.eq("user_id", userId);
    if (key) query.eq("key", key);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    // Map 'value' column back to 'data' for client compatibility
    const mapped = (data || []).map(r => ({ key: r.key, data: r.value }));
    return res.json({ data: mapped });
  }

  // POST: save user data OR ensure profile
  if (req.method === "POST") {
    const { action, userId, key, data, displayName } = req.body;

    // Ensure profile exists for local accounts
    if (action === "ensure_profile") {
      if (!userId || !displayName) return res.status(400).json({ error: "Missing userId or displayName" });
      const { data: existing } = await supa.from("profiles").select("id").eq("display_name", displayName).maybeSingle();
      if (existing) return res.json({ ok: true, profileId: existing.id });
      // Create profile with generated UUID (profiles.id is uuid type)
      const uuid = randomUUID();
      const { data: created, error } = await supa.from("profiles").insert({
        id: uuid,
        display_name: displayName,
      }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, profileId: created?.id || uuid });
    }

    // Ensure auth user exists (create Supabase auth account + profile via admin API)
    if (action === "ensure_auth") {
      const { email, password, displayName: dn } = req.body;
      if (!email || !password) return res.status(400).json({ error: "Missing email or password" });
      // Check if user already exists
      const { data: { users } } = await supa.auth.admin.listUsers({ filter: email });
      const existing = (users || []).find(u => u.email === email);
      if (existing) {
        return res.json({ ok: true, userId: existing.id, existed: true });
      }
      // Create auth user (auto-confirmed, no email sent)
      const { data: created, error: authErr } = await supa.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: dn || email.split("@")[0] },
      });
      if (authErr) return res.status(500).json({ error: authErr.message });
      // Create profile
      if (created?.user) {
        await supa.from("profiles").upsert({
          id: created.user.id,
          display_name: dn || email.split("@")[0],
        }, { onConflict: "id" }).select();
      }
      return res.json({ ok: true, userId: created?.user?.id, created: true });
    }

    // Cleanup: delete old OAuth profiles + auth users not in team
    if (action === "cleanup_profiles") {
      const TEAM_NAMES = ["Nguyen Duy Trinh", "Lientran", "Pham Van Hung", "Tran Thi Mai", "Le Minh Duc"];
      const TEAM_EMAILS = ["trinh@workflow.vn", "lien@workflow.vn", "hung@workflow.vn", "mai@workflow.vn", "duc@workflow.vn"];
      const norm = s => (s || "").toLowerCase().replace(/\s+/g, "");

      // Get all profiles
      const { data: allProfiles } = await supa.from("profiles").select("id, display_name");
      const toDelete = (allProfiles || []).filter(p => !TEAM_NAMES.some(n => norm(n) === norm(p.display_name)));

      const results = [];
      for (const p of toDelete) {
        // Delete related data first (foreign keys)
        await supa.from("messages").delete().eq("sender_id", p.id);
        await supa.from("conversation_members").delete().eq("user_id", p.id);
        await supa.from("user_data").delete().eq("user_id", p.id);
        const { error } = await supa.from("profiles").delete().eq("id", p.id);
        // Also try to delete auth user
        try { await supa.auth.admin.deleteUser(p.id); } catch {}
        results.push({ id: p.id, name: p.display_name, error: error?.message || null });
      }

      // Also clean orphan auth users not in team
      const { data: { users } } = await supa.auth.admin.listUsers();
      for (const u of (users || [])) {
        const email = u.email || "";
        if (!TEAM_EMAILS.includes(email) && !toDelete.find(p => p.id === u.id)) {
          try { await supa.auth.admin.deleteUser(u.id); results.push({ id: u.id, email, authOnly: true }); } catch {}
        }
      }

      return res.json({ ok: true, deleted: results });
    }

    // Default: save user data
    if (!userId || !key) return res.status(400).json({ error: "Missing userId or key" });
    const resolvedId = await resolveUserId(supa, userId);
    const { error } = await supa.from("user_data").upsert({
      user_id: resolvedId,
      key,
      value: data,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,key" });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
