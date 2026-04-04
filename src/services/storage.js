/* ================================================================
   STORAGE — localStorage with schema versioning
   ================================================================ */
import { SCHEMA_VERSION } from "../constants";

let _userPrefix = "";
export function setUserPrefix(id) { _userPrefix = id ? `wf_${id}_` : "wf_"; }
export function userKey(key) { return _userPrefix + key; }

// Schema migration
export function migrateData(key, data) {
  const version = parseInt(localStorage.getItem(userKey("schema_version")) || "1", 10);
  if (version < 2 && key === "tasks" && Array.isArray(data)) {
    // v1 -> v2: add timerState fields, remove sample tasks
    data = data
      .filter(t => t.id > 3)
      .map(t => ({
        timerState: "idle",
        timerStart: null,
        timerTotal: 0,
        ...t,
      }));
  }
  localStorage.setItem(userKey("schema_version"), String(SCHEMA_VERSION));
  return data;
}

export function loadJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(userKey(key));
    if (!raw) return fallback;
    let data = JSON.parse(raw);
    data = migrateData(key, data);
    // Integrity check: if expecting array, ensure it's array
    if (Array.isArray(fallback) && !Array.isArray(data)) {
      console.warn(`[WF] Data integrity: ${key} expected array, got ${typeof data}. Using fallback.`);
      return fallback;
    }
    return data;
  } catch (e) {
    console.warn(`[WF] Failed to load ${key}:`, e.message);
    return fallback;
  }
}

export function saveJSON(key, data) {
  try {
    const json = JSON.stringify(data);
    // Quota check: warn if approaching 5MB limit
    if (json.length > 2 * 1024 * 1024) {
      console.warn(`[WF] Large write: ${key} is ${(json.length / 1024).toFixed(0)}KB`);
    }
    localStorage.setItem(userKey(key), json);
  } catch (e) {
    console.warn("[WF] Storage full:", key, e.message);
    // Try to free space by removing old history
    try {
      const histKey = userKey("history");
      const hist = JSON.parse(localStorage.getItem(histKey) || "[]");
      if (hist.length > 50) {
        localStorage.setItem(histKey, JSON.stringify(hist.slice(-50)));
        localStorage.setItem(userKey(key), JSON.stringify(data)); // retry
      }
    } catch { /* truly full — nothing we can do */ }
  }
}
