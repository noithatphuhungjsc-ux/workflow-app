/* ================================================================
   ATTENDANCE SERVICE — API calls, GPS, geofence calculations
   All Supabase operations go through serverless API (service role)
   ================================================================ */

const API_BASE = "/api";

// ── Haversine distance (meters) ──
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── GPS ──
export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Trình duyệt không hỗ trợ GPS"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => {
        const msgs = {
          1: "Bạn chưa cho phép truy cập vị trí",
          2: "Không thể xác định vị trí",
          3: "Hết thời gian lấy vị trí",
        };
        reject(new Error(msgs[err.code] || "Lỗi GPS"));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0, ...options }
    );
  });
}

// ── Selfie capture ──
export async function captureSelfie() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 640 } },
  });
  const video = document.createElement("video");
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  await video.play();

  // Wait for video to be ready
  await new Promise((r) => setTimeout(r, 500));

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);

  // Stop stream
  stream.getTracks().forEach((t) => t.stop());

  // Compress to JPEG blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.7);
  });
}

// ── API calls ──
async function apiCall(endpoint, method = "GET", body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}/${endpoint}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

// ── Check-in / Check-out ──
export async function checkIn(payload) {
  return apiCall("attendance-checkin", "POST", { ...payload, type: "check_in" });
}

export async function checkOut(payload) {
  return apiCall("attendance-checkin", "POST", { ...payload, type: "check_out" });
}

// ── Records ──
export async function getRecords(userId, date) {
  const params = new URLSearchParams({ userId });
  if (date) params.set("date", date);
  return apiCall(`attendance-checkin?${params}`);
}

export async function getTodayRecords(userId) {
  const today = new Date().toISOString().split("T")[0];
  return getRecords(userId, today);
}

// ── Summary ──
export async function getDailySummary(userId, date) {
  const params = new URLSearchParams({ userId, date });
  return apiCall(`attendance-summary?${params}`);
}

export async function getMonthlySummary(userId, year, month) {
  const params = new URLSearchParams({ userId, year: String(year), month: String(month) });
  return apiCall(`attendance-summary?${params}`);
}

export async function computeSummary(userId, date) {
  return apiCall("attendance-summary", "POST", { userId, date });
}

// ── Sites ──
export async function getSites() {
  return apiCall("attendance-admin?action=list_sites");
}

export async function createSite(site) {
  return apiCall("attendance-admin", "POST", { action: "create_site", ...site });
}

export async function updateSite(id, updates) {
  return apiCall("attendance-admin", "POST", { action: "update_site", id, ...updates });
}

export async function deleteSite(id) {
  return apiCall("attendance-admin", "POST", { action: "delete_site", id });
}

// ── QR Code ──
export async function generateQR(siteId) {
  return apiCall("attendance-qr", "POST", { action: "generate", siteId });
}

export async function validateQR(token) {
  return apiCall("attendance-qr", "POST", { action: "validate", token });
}

// ── Requests ──
export async function getRequests(userId, status) {
  const params = new URLSearchParams();
  if (userId) params.set("userId", userId);
  if (status) params.set("status", status);
  return apiCall(`attendance-admin?action=list_requests&${params}`);
}

export async function createRequest(req) {
  return apiCall("attendance-admin", "POST", { action: "create_request", ...req });
}

export async function reviewRequest(id, status, reviewedBy) {
  return apiCall("attendance-admin", "POST", { action: "review_request", id, status, reviewedBy });
}

// ── All employees summary (director) ──
export async function getAllEmployeeSummary(date) {
  return apiCall(`attendance-admin?action=all_summary&date=${date}`);
}

export async function getMonthlyReport(year, month) {
  return apiCall(`attendance-admin?action=monthly_report&year=${year}&month=${month}`);
}

// ── Geofence check ──
export function checkGeofence(userLat, userLng, site) {
  if (!site?.lat || !site?.lng) return { within: false, distance: null };
  const distance = haversineDistance(userLat, userLng, site.lat, site.lng);
  return {
    within: distance <= (site.radius_meters || 200),
    distance: Math.round(distance),
  };
}

// ── Offline queue ──
const OFFLINE_KEY = "wf_attendance_offline_queue";

export function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToOfflineQueue(record) {
  const queue = getOfflineQueue();
  queue.push({ ...record, offline_queued: true, queued_at: new Date().toISOString() });
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(queue));
}

export function clearOfflineQueue() {
  localStorage.removeItem(OFFLINE_KEY);
}

export async function syncOfflineQueue() {
  const queue = getOfflineQueue();
  if (!queue.length) return { synced: 0, failed: 0 };
  let synced = 0;
  let failed = 0;
  const remaining = [];
  for (const record of queue) {
    try {
      const fn = record.type === "check_in" ? checkIn : checkOut;
      await fn({ ...record, offline_queued: true });
      synced++;
    } catch {
      failed++;
      remaining.push(record);
    }
  }
  if (remaining.length) {
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(remaining));
  } else {
    clearOfflineQueue();
  }
  return { synced, failed };
}
