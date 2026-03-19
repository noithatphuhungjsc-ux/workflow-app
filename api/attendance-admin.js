/* Attendance Admin API — Sites, requests, director dashboard */
import { createClient } from "@supabase/supabase-js";

let _supa = null;
function getSupabase() {
  if (_supa) return _supa;
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  _supa = createClient(url, key);
  return _supa;
}

const LOCAL_ID_TO_UUID = {
  trinh: "52bd2c76-6ff0-404c-8900-d05984e9271b",
  lien: "8a1fa1fa-e068-4164-981f-fcd20a988744",
  hung: "bf3cbd15-a783-420c-91dd-823bc2a23702",
  mai: "80fb3b1e-f0ca-4850-bbda-fb6e8cdd25c9",
  duc: "516cb441-6615-4df4-9993-0fe16b5acaf0",
};
function resolveUserId(localId) {
  if (localId && localId.includes("-") && localId.length > 30) return localId;
  return LOCAL_ID_TO_UUID[localId] || localId;
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const supa = getSupabase();
  if (!supa) return res.status(500).json({ error: "Supabase not configured" });

  // GET actions
  if (req.method === "GET") {
    const { action, date, year, month, userId: rawId, status } = req.query;

    if (action === "list_sites") {
      const { data, error } = await supa.from("work_sites").select("*").eq("is_active", true).order("created_at");
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ data: data || [] });
    }

    if (action === "all_summary") {
      if (!date) return res.status(400).json({ error: "Missing date" });
      // Get all users' summary for a date + profile names
      const { data, error } = await supa.from("daily_attendance_summary")
        .select("*, profiles:user_id(display_name)")
        .eq("date", date);
      if (error) return res.status(500).json({ error: error.message });

      // Also get users who have NO summary (absent)
      const allUserIds = Object.values(LOCAL_ID_TO_UUID);
      const presentIds = (data || []).map(d => d.user_id);
      const absentIds = allUserIds.filter(id => !presentIds.includes(id));

      // Get profiles for absent users
      let absentProfiles = [];
      if (absentIds.length) {
        const { data: profiles } = await supa.from("profiles").select("id, display_name").in("id", absentIds);
        absentProfiles = (profiles || []).map(p => ({
          user_id: p.id,
          date,
          status: "absent",
          display_name: p.display_name,
          total_work_minutes: 0,
        }));
      }

      const enriched = (data || []).map(d => ({
        ...d,
        display_name: d.profiles?.display_name || "Unknown",
      }));

      return res.json({ data: [...enriched, ...absentProfiles] });
    }

    if (action === "monthly_report") {
      if (!year || !month) return res.status(400).json({ error: "Missing year or month" });
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const endMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
      const endYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
      const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

      const { data, error } = await supa.from("daily_attendance_summary")
        .select("*, profiles:user_id(display_name)")
        .gte("date", start).lt("date", end)
        .order("date");
      if (error) return res.status(500).json({ error: error.message });

      // Group by user
      const byUser = {};
      for (const row of (data || [])) {
        const uid = row.user_id;
        if (!byUser[uid]) {
          byUser[uid] = {
            user_id: uid,
            display_name: row.profiles?.display_name || "Unknown",
            days: [],
            total_present: 0,
            total_late: 0,
            total_absent: 0,
            total_work_minutes: 0,
            total_overtime: 0,
          };
        }
        byUser[uid].days.push(row);
        byUser[uid].total_work_minutes += row.total_work_minutes || 0;
        byUser[uid].total_overtime += row.overtime_minutes || 0;
        if (row.status === "present") byUser[uid].total_present++;
        else if (row.status === "late") { byUser[uid].total_present++; byUser[uid].total_late++; }
        else if (row.status === "absent") byUser[uid].total_absent++;
      }

      return res.json({ data: Object.values(byUser) });
    }

    if (action === "list_requests") {
      let query = supa.from("attendance_requests")
        .select("*, profiles:user_id(display_name)")
        .order("created_at", { ascending: false });
      if (rawId) query = query.eq("user_id", resolveUserId(rawId));
      if (status) query = query.eq("status", status);

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ data: data || [] });
    }

    return res.status(400).json({ error: "Unknown action" });
  }

  // POST actions
  if (req.method === "POST") {
    const body = req.body || {};
    const { action } = body;

    if (action === "create_site") {
      const { name, address, lat, lng, radius_meters, createdBy } = body;
      if (!name) return res.status(400).json({ error: "Missing site name" });
      const { data, error } = await supa.from("work_sites").insert({
        name, address: address || null,
        lat: lat || null, lng: lng || null,
        radius_meters: radius_meters || 200,
        created_by: createdBy ? resolveUserId(createdBy) : null,
      }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, data });
    }

    if (action === "update_site") {
      const { id, name, address, lat, lng, radius_meters, is_active } = body;
      if (!id) return res.status(400).json({ error: "Missing site id" });
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (address !== undefined) updates.address = address;
      if (lat !== undefined) updates.lat = lat;
      if (lng !== undefined) updates.lng = lng;
      if (radius_meters !== undefined) updates.radius_meters = radius_meters;
      if (is_active !== undefined) updates.is_active = is_active;

      const { data, error } = await supa.from("work_sites").update(updates).eq("id", id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, data });
    }

    if (action === "delete_site") {
      const { id } = body;
      if (!id) return res.status(400).json({ error: "Missing site id" });
      const { error } = await supa.from("work_sites").update({ is_active: false }).eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    if (action === "create_request") {
      const { userId: rawId, date, type, reason, originalData, requestedData } = body;
      if (!rawId || !date || !type) return res.status(400).json({ error: "Missing required fields" });
      const { data, error } = await supa.from("attendance_requests").insert({
        user_id: resolveUserId(rawId),
        date, type, reason: reason || null,
        original_data: originalData || null,
        requested_data: requestedData || null,
      }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, data });
    }

    if (action === "review_request") {
      const { id, status, reviewedBy } = body;
      if (!id || !status) return res.status(400).json({ error: "Missing id or status" });
      const { data, error } = await supa.from("attendance_requests").update({
        status,
        reviewed_by: reviewedBy ? resolveUserId(reviewedBy) : null,
        reviewed_at: new Date().toISOString(),
      }).eq("id", id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, data });
    }

    return res.status(400).json({ error: "Unknown action" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
