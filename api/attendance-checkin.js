/* Attendance Check-in/out API — validates and inserts records */
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

  // GET: fetch records
  if (req.method === "GET") {
    const { userId: rawId, date, month, year } = req.query;
    if (!rawId) return res.status(400).json({ error: "Missing userId" });
    const userId = resolveUserId(rawId);

    let query = supa.from("attendance_records").select("*").eq("user_id", userId);
    if (date) {
      query = query.eq("date", date);
    } else if (month && year) {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const endMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
      const endYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
      const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
      query = query.gte("date", start).lt("date", end);
    }
    query = query.order("timestamp", { ascending: true });

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ data: data || [] });
  }

  // POST: create check-in or check-out
  if (req.method === "POST") {
    const body = req.body || {};
    const { userId: rawId, type, lat, lng, accuracy, siteId, selfieUrl, qrToken, verificationMethod, deviceInfo } = body;

    if (!rawId || !type) return res.status(400).json({ error: "Missing userId or type" });
    if (!["check_in", "check_out"].includes(type)) return res.status(400).json({ error: "Invalid type" });

    const userId = resolveUserId(rawId);
    const today = new Date().toISOString().split("T")[0];

    // Check for duplicate check-in today
    if (type === "check_in") {
      const { data: existing } = await supa.from("attendance_records")
        .select("id").eq("user_id", userId).eq("date", today).eq("type", "check_in").limit(1);
      if (existing?.length) return res.status(409).json({ error: "Hôm nay đã chấm công vào rồi" });
    }

    // Check for check-out without check-in
    if (type === "check_out") {
      const { data: checkIns } = await supa.from("attendance_records")
        .select("id").eq("user_id", userId).eq("date", today).eq("type", "check_in").limit(1);
      if (!checkIns?.length) return res.status(400).json({ error: "Chưa chấm công vào" });

      const { data: existingOut } = await supa.from("attendance_records")
        .select("id").eq("user_id", userId).eq("date", today).eq("type", "check_out").limit(1);
      if (existingOut?.length) return res.status(409).json({ error: "Hôm nay đã chấm công ra rồi" });
    }

    // Calculate geofence if site provided
    let distanceToSite = null;
    let isWithinGeofence = false;
    if (siteId && lat != null && lng != null) {
      const { data: site } = await supa.from("work_sites").select("lat,lng,radius_meters").eq("id", siteId).single();
      if (site?.lat && site?.lng) {
        const R = 6371000;
        const dLat = ((site.lat - lat) * Math.PI) / 180;
        const dLng = ((site.lng - lng) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((site.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
        distanceToSite = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        isWithinGeofence = distanceToSite <= (site.radius_meters || 200);
      }
    }

    const record = {
      user_id: userId,
      date: today,
      type,
      timestamp: new Date().toISOString(),
      lat: lat || null,
      lng: lng || null,
      accuracy: accuracy || null,
      site_id: siteId || null,
      distance_to_site: distanceToSite,
      selfie_url: selfieUrl || null,
      qr_token: qrToken || null,
      verification_method: verificationMethod || "gps",
      is_within_geofence: isWithinGeofence,
      device_info: deviceInfo || null,
      ip_address: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null,
      offline_queued: body.offline_queued || false,
      synced_at: body.offline_queued ? new Date().toISOString() : null,
    };

    const { data, error } = await supa.from("attendance_records").insert(record).select().single();
    if (error) return res.status(500).json({ error: error.message });

    // Auto-compute summary on check-out
    if (type === "check_out") {
      try { await computeDailySummary(supa, userId, today); } catch (e) { console.warn("[ATT] Summary compute error:", e.message); }
    }

    return res.json({ ok: true, record: data });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

async function computeDailySummary(supa, userId, date) {
  const { data: records } = await supa.from("attendance_records")
    .select("*").eq("user_id", userId).eq("date", date).order("timestamp");
  if (!records?.length) return;

  const checkIns = records.filter(r => r.type === "check_in");
  const checkOuts = records.filter(r => r.type === "check_out");

  const firstIn = checkIns[0];
  const lastOut = checkOuts[checkOuts.length - 1];

  let totalMinutes = 0;
  if (firstIn && lastOut) {
    totalMinutes = Math.round((new Date(lastOut.timestamp) - new Date(firstIn.timestamp)) / 60000);
  }

  // Rules: 8:00-17:00, grace 15min
  const inTime = firstIn ? new Date(firstIn.timestamp) : null;
  const outTime = lastOut ? new Date(lastOut.timestamp) : null;

  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let status = "absent";

  if (inTime) {
    const scheduleStart = new Date(inTime);
    scheduleStart.setHours(8, 15, 0, 0); // 8:15 with grace
    if (inTime > scheduleStart) {
      lateMinutes = Math.round((inTime - scheduleStart) / 60000);
    }
    status = lateMinutes > 0 ? "late" : "present";
  }

  if (outTime) {
    const scheduleEnd = new Date(outTime);
    scheduleEnd.setHours(17, 0, 0, 0);
    if (outTime < scheduleEnd) {
      earlyLeaveMinutes = Math.round((scheduleEnd - outTime) / 60000);
    }
  }

  if (totalMinutes > 0 && totalMinutes < 240) status = "half_day";

  const overtimeMinutes = Math.max(0, totalMinutes - 480); // 8h = 480min

  const summary = {
    user_id: userId,
    date,
    first_check_in: firstIn?.timestamp || null,
    last_check_out: lastOut?.timestamp || null,
    total_work_minutes: totalMinutes,
    overtime_minutes: overtimeMinutes,
    status,
    late_minutes: lateMinutes,
    early_leave_minutes: earlyLeaveMinutes,
    site_id: firstIn?.site_id || null,
    computed_at: new Date().toISOString(),
  };

  await supa.from("daily_attendance_summary").upsert(summary, { onConflict: "user_id,date" });
}
