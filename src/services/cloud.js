/* ================================================================
   CLOUD SYNC — Supabase backup & restore
   ================================================================ */
import { loadJSON } from "./storage";
import { authHeaders } from "./authHeaders";

const _syncTimers = {};
const SYNC_KEYS = ["tasks", "expenses", "settings", "memory", "wory_knowledge", "chat_history", "expense_chat", "projects"];

// Cloud sync via API (bypasses Supabase RLS using service role key)
export async function cloudSave(_supabase, userId, key, data) {
  if (!userId) return null;
  try {
    const res = await fetch("/api/cloud-sync", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ userId, key, data }),
    });
    const result = await res.json();
    if (!res.ok) console.warn("[cloudSave]", key, result.error, result.detail || "");
    return res.ok;
  } catch (e) { console.warn("Cloud save failed:", e); return false; }
}

export async function cloudLoad(_supabase, userId, key) {
  if (!userId) return null;
  try {
    const url = `/api/cloud-sync?userId=${encodeURIComponent(userId)}${key ? `&key=${encodeURIComponent(key)}` : ""}`;
    const res = await fetch(url, { headers: await authHeaders() });
    const result = await res.json();
    if (!res.ok) { console.warn("[cloudLoad]", key, result.error, result.detail || ""); return null; }
    if (key && result.data?.length) return result.data[0];
    return result.data?.length ? result.data : null;
  } catch (e) { console.warn("[WF] Cloud load failed:", key, e.message); return null; }
}

export async function cloudSaveAll(_supabase, userId) {
  if (!userId) return false;
  let ok = 0;
  for (const key of SYNC_KEYS) {
    const localData = loadJSON(key, null);
    if (localData !== null) {
      const result = await cloudSave(null, userId, key, localData);
      if (result) ok++;
    }
  }
  return ok;
}

export async function cloudLoadAll(_supabase, userId) {
  if (!userId) return null;
  try {
    const res = await fetch(`/api/cloud-sync?userId=${encodeURIComponent(userId)}`, { headers: await authHeaders() });
    const result = await res.json();
    if (!res.ok) { console.warn("[cloudLoadAll]", result.error, result.detail || ""); return null; }
    return result.data || null;
  } catch (e) { console.warn("[WF] Cloud loadAll failed:", e.message); return null; }
}

// Load only specific keys (for polling — avoids fetching settings/memory/knowledge)
export async function cloudLoadKeys(_supabase, userId, keys) {
  if (!userId || !keys?.length) return null;
  try {
    const headers = await authHeaders();
    const results = await Promise.all(keys.map(async key => {
      try {
        const res = await fetch(`/api/cloud-sync?userId=${encodeURIComponent(userId)}&key=${encodeURIComponent(key)}`, { headers });
        const json = await res.json();
        if (!res.ok) {
          console.warn("[cloudLoadKeys]", key, json.error, json.detail || "");
          return null;
        }
        return json.data?.[0] ?? null;
      } catch (err) {
        console.warn("[cloudLoadKeys]", key, "network error:", err?.message);
        return null;
      }
    }));
    return results.filter(Boolean);
  } catch (e) { console.warn("[WF] Cloud loadKeys failed:", e.message); return null; }
}

/* Offline queue — buffers cloud saves when offline, flushes when back online */
const _offlineQueue = [];
let _flushingOffline = false;

function isOnline() { return typeof navigator === "undefined" || navigator.onLine !== false; }

async function flushOfflineQueue() {
  if (_flushingOffline || _offlineQueue.length === 0) return;
  _flushingOffline = true;
  while (_offlineQueue.length > 0) {
    const { userId, key, data } = _offlineQueue[0];
    const ok = await cloudSave(null, userId, key, data);
    if (ok) { _offlineQueue.shift(); }
    else { break; } // still offline or error — stop flushing
  }
  _flushingOffline = false;
}

// Listen for online event to flush queue
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    console.info("[WF] Back online — flushing", _offlineQueue.length, "queued saves");
    flushOfflineQueue();
  });
}

export function scheduleSyncDebounced(_supabase, userId, key, data) {
  if (!userId) return;
  clearTimeout(_syncTimers[key]);
  _syncTimers[key] = setTimeout(() => {
    if (isOnline()) {
      cloudSave(null, userId, key, data);
    } else {
      // Queue for later — deduplicate by key (keep latest data)
      const existing = _offlineQueue.findIndex(q => q.userId === userId && q.key === key);
      if (existing >= 0) _offlineQueue[existing].data = data;
      else _offlineQueue.push({ userId, key, data });
      console.info("[WF] Offline — queued", key, "for later sync");
    }
  }, 3000); // Debounce 3s per key
}

/* Cancel ALL pending sync timers — prevents stale debounced saves from firing after data clear */
export function cancelAllPendingSyncs() {
  Object.keys(_syncTimers).forEach(key => {
    clearTimeout(_syncTimers[key]);
    delete _syncTimers[key];
  });
  // Also clear offline queue
  _offlineQueue.length = 0;
}
