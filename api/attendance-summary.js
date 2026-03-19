/* Attendance Summary API — GET daily/monthly summary, POST to compute */
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

  // GET: fetch summary
  if (req.method === "GET") {
    const { userId: rawId, date, year, month } = req.query;
    if (!rawId) return res.status(400).json({ error: "Missing userId" });
    const userId = resolveUserId(rawId);

    if (date) {
      // Single day
      const { data, error } = await supa.from("daily_attendance_summary")
        .select("*").eq("user_id", userId).eq("date", date).maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ data: data || null });
    }

    if (year && month) {
      // Monthly
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const endMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
      const endYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
      const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

      const { data, error } = await supa.from("daily_attendance_summary")
        .select("*").eq("user_id", userId).gte("date", start).lt("date", end)
        .order("date", { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ data: data || [] });
    }

    return res.status(400).json({ error: "Provide date or year+month" });
  }

  // POST: compute summary for a date
  if (req.method === "POST") {
    const { userId: rawId, date } = req.body || {};
    if (!rawId || !date) return res.status(400).json({ error: "Missing userId or date" });
    const userId = resolveUserId(rawId);

    const { data: records } = await supa.from("attendance_records")
      .select("*").eq("user_id", userId).eq("date", date).order("timestamp");

    if (!records?.length) {
      return res.json({ data: null, message: "No records for this date" });
    }

    const checkIns = records.filter(r => r.type === "check_in");
    const checkOuts = records.filter(r => r.type === "check_out");
    const firstIn = checkIns[0];
    const lastOut = checkOuts[checkOuts.length - 1];

    let totalMinutes = 0;
    if (firstIn && lastOut) {
      totalMinutes = Math.round((new Date(lastOut.timestamp) - new Date(firstIn.timestamp)) / 60000);
    }

    const inTime = firstIn ? new Date(firstIn.timestamp) : null;
    const outTime = lastOut ? new Date(lastOut.timestamp) : null;
    let lateMinutes = 0;
    let earlyLeaveMinutes = 0;
    let status = "absent";

    if (inTime) {
      const scheduleStart = new Date(inTime);
      scheduleStart.setHours(8, 15, 0, 0);
      if (inTime > scheduleStart) lateMinutes = Math.round((inTime - scheduleStart) / 60000);
      status = lateMinutes > 0 ? "late" : "present";
    }
    if (outTime) {
      const scheduleEnd = new Date(outTime);
      scheduleEnd.setHours(17, 0, 0, 0);
      if (outTime < scheduleEnd) earlyLeaveMinutes = Math.round((scheduleEnd - outTime) / 60000);
    }
    if (totalMinutes > 0 && totalMinutes < 240) status = "half_day";

    const summary = {
      user_id: userId, date,
      first_check_in: firstIn?.timestamp || null,
      last_check_out: lastOut?.timestamp || null,
      total_work_minutes: totalMinutes,
      overtime_minutes: Math.max(0, totalMinutes - 480),
      status, late_minutes: lateMinutes, early_leave_minutes: earlyLeaveMinutes,
      site_id: firstIn?.site_id || null,
      computed_at: new Date().toISOString(),
    };

    const { data, error } = await supa.from("daily_attendance_summary")
      .upsert(summary, { onConflict: "user_id,date" }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ data });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
