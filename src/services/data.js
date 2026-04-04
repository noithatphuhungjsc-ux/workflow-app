/* ================================================================
   DATA — History, memory, settings, knowledge, backup, import/export, clear
   ================================================================ */
import { createElement } from "react";
import { SCHEMA_VERSION, DEFAULT_PROFILE, KNOWLEDGE_CATEGORIES } from "../constants";
import { loadJSON, saveJSON, userKey } from "./storage";
import { cloudSave, cancelAllPendingSyncs } from "./cloud";

/* -- History log -- */
export function loadHistory() { return loadJSON("history", []); }
export function saveHistory(h, limit = 500) { saveJSON("history", h.slice(-limit)); }
export function addLog(history, setHistory, action, taskTitle, detail = "") {
  const entry = { id: Date.now(), ts: new Date().toISOString(), action, taskTitle, detail };
  const next = [...history, entry];
  setHistory(next);
  saveHistory(next);
}

/* -- AI Memory -- */
export function loadMemory() { return loadJSON("memory", []); }
export function saveMemory(mem) { saveJSON("memory", mem.slice(-100)); }
export function addMemory(mem, setMem, content, type = "note") {
  const entry = { id: Date.now(), ts: new Date().toISOString(), content, type };
  const next = [...mem, entry];
  setMem(next);
  saveMemory(next);
  return entry;
}
export function deleteMemory(mem, setMem, id) {
  const next = mem.filter(m => m.id !== id);
  setMem(next);
  saveMemory(next);
}
export function memoryToText(mem) {
  if (!mem.length) return "Chưa có ghi nhớ.";
  return mem.map(m => `[${m.type}] ${m.content} (${new Date(m.ts).toLocaleDateString("vi-VN")})`).join("\n");
}

/* ================================================================
   KNOWLEDGE SYSTEM — Wory Training (categorized, smart prompt)
   ================================================================ */
export function loadKnowledge() {
  const k = loadJSON("wory_knowledge", null);
  if (k?.version >= 1) return k;
  // First load: migrate old memory
  return migrateMemoryToKnowledge();
}

export function saveKnowledge(k) {
  // Cap entries at 200
  if (k.entries.length > 200) k.entries = k.entries.slice(-200);
  saveJSON("wory_knowledge", k);
}

function migrateMemoryToKnowledge() {
  const oldMem = loadJSON("memory", []);
  const entries = oldMem.map(m => ({
    id: m.id,
    ts: m.ts,
    content: m.content,
    category: guessCategory(m.content),
    source: "manual",
    confidence: 1.0,
    approved: true,
    tags: extractTags(m.content),
  }));
  const k = { version: 1, profile: { ...DEFAULT_PROFILE }, entries };
  saveKnowledge(k);
  return k;
}

export function guessCategory(text) {
  const t = text.toLowerCase();
  // People keywords
  if (/(?:anh|chi|em|ong|ba|sep|giam doc|truong phong|dong nghiep|doi tac|khach hang|team|nhom)\b/.test(t)) return "people";
  // SOP keywords
  if (/(?:quy trinh|buoc|sop|checklist|bao cao hang|gui truoc|deadline|quy dinh|tieu chuan|mau|form)\b/.test(t)) return "sop";
  // Style keywords
  if (/(?:thich|khong thich|hay|thuong|phong cach|thoi quen|gio lam|sang som|toi muon|uu tien|tap trung)\b/.test(t)) return "style";
  return "context";
}

export function extractTags(text) {
  const t = text.toLowerCase().replace(/[.,!?;:]/g, " ");
  const words = t.split(/\s+/).filter(w => w.length > 2);
  // Simple: return unique words > 2 chars, max 5
  const unique = [...new Set(words)].slice(0, 5);
  return unique;
}

export function addKnowledgeEntry(knowledge, setKnowledge, content, category = "context", source = "manual") {
  const entry = {
    id: Date.now(),
    ts: new Date().toISOString(),
    content,
    category,
    source,
    confidence: source === "auto" ? 0.7 : 1.0,
    approved: source !== "auto",
    tags: extractTags(content),
  };
  const next = { ...knowledge, entries: [...knowledge.entries, entry] };
  setKnowledge(next);
  saveKnowledge(next);
  return entry;
}

export function updateKnowledgeEntry(knowledge, setKnowledge, id, data) {
  const next = {
    ...knowledge,
    entries: knowledge.entries.map(e => e.id === id ? { ...e, ...data } : e),
  };
  setKnowledge(next);
  saveKnowledge(next);
}

export function deleteKnowledgeEntry(knowledge, setKnowledge, id) {
  const next = { ...knowledge, entries: knowledge.entries.filter(e => e.id !== id) };
  setKnowledge(next);
  saveKnowledge(next);
}

export function saveKnowledgeProfile(knowledge, setKnowledge, profile) {
  const next = { ...knowledge, profile: { ...knowledge.profile, ...profile } };
  setKnowledge(next);
  saveKnowledge(next);
}

export function approveKnowledgeEntry(knowledge, setKnowledge, id) {
  updateKnowledgeEntry(knowledge, setKnowledge, id, { approved: true });
}

export function approveAllPending(knowledge, setKnowledge) {
  const next = {
    ...knowledge,
    entries: knowledge.entries.map(e => e.approved ? e : { ...e, approved: true }),
  };
  setKnowledge(next);
  saveKnowledge(next);
}

/* -- Smart Prompt Builder -- */
export function buildKnowledgePrompt(knowledge, contextKeywords = []) {
  if (!knowledge) return "Chua co thong tin.";
  const { profile, entries } = knowledge;

  // Section 1: Profile (always inject)
  let profileText = "";
  if (profile.role || profile.company) {
    const parts = [];
    if (profile.role) parts.push(`Vai tro: ${profile.role}`);
    if (profile.company) parts.push(`Cong ty: ${profile.company}`);
    if (profile.industry) parts.push(`Nganh: ${profile.industry}`);
    if (profile.teamSize) parts.push(`Quy mo doi: ${profile.teamSize}`);
    if (profile.workStyle) parts.push(`Phong cach: ${profile.workStyle}`);
    if (profile.communication) parts.push(`Giao tiep: ${profile.communication}`);
    if (profile.goals) parts.push(`Muc tieu: ${profile.goals}`);
    if (profile.notes) parts.push(`Luu y: ${profile.notes}`);
    profileText = parts.join(". ") + ".";
  }

  // Section 2: Select relevant entries
  const approved = entries.filter(e => e.approved);
  if (!approved.length && !profileText) return "Chua co thong tin.";

  const scored = approved.map(e => {
    let score = 0;
    // Tag match with context
    if (contextKeywords.length) {
      for (const kw of contextKeywords) {
        if (e.tags.some(t => t.includes(kw)) || e.content.toLowerCase().includes(kw)) score += 3;
      }
    }
    // Recency bonus
    const daysSince = (Date.now() - new Date(e.ts).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) score += 2;
    else if (daysSince < 30) score += 1;
    // Confidence
    score *= e.confidence;
    // Base score so all entries have a chance
    score += 0.5;
    return { ...e, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Take entries until ~1500 chars
  let charBudget = 1500;
  const selected = [];
  for (const e of scored) {
    if (e.content.length > charBudget) continue;
    selected.push(e);
    charBudget -= e.content.length + 20; // overhead for category label
    if (charBudget <= 0) break;
  }

  const catLabels = { style: "phong cach", sop: "quy trinh", people: "quan he", context: "boi canh" };
  const entriesText = selected.length
    ? selected.map(e => `[${catLabels[e.category] || e.category}] ${e.content}`).join("\n")
    : "";

  let result = "";
  if (profileText) result += `HO SO: ${profileText}\n`;
  if (entriesText) result += `DA CHIA SE:\n${entriesText}`;
  return result || "Chua co thong tin.";
}

/* -- Settings -- */
export function loadSettings(defaults) {
  const saved = loadJSON("settings", null);
  const merged = saved ? { ...defaults, ...saved } : { ...defaults };
  // ensure woryCanEdit is on
  try {
    const svKey = userKey("settings_v");
    const sv = parseInt(localStorage.getItem(svKey) || "0", 10);
    if (sv < 1) { merged.woryCanEdit = true; localStorage.setItem(svKey, "1"); }
  } catch (e) { console.warn("[WF] loadSettings migration:", e.message); }
  return merged;
}
export function saveSettings(settings) { saveJSON("settings", settings); }

/* ================================================================
   MEMORY COMMANDS — from AI replies
   ================================================================ */
export function processMemoryCommands(text, memory, setMemory, knowledge, setKnowledge) {
  let result = text;
  const saveMatch = result.match(/\[SAVE:(.+?)\]/);
  if (saveMatch) {
    const content = saveMatch[1].trim();
    addMemory(memory, setMemory, content);
    // Also save to knowledge store
    if (knowledge && setKnowledge) {
      addKnowledgeEntry(knowledge, setKnowledge, content, guessCategory(content), "manual");
    }
    result = result.replace(saveMatch[0], "Đã ghi nhớ!");
  }
  const delMatch = result.match(/\[DELETE:(\d+)\]/);
  if (delMatch) {
    deleteMemory(memory, setMemory, Number(delMatch[1]));
    result = result.replace(delMatch[0], "Đã xóa ghi nhớ!");
  }
  return result;
}

/* ================================================================
   MARKDOWN RENDERER
   ================================================================ */
export function inlineMd(text) {
  if (!text) return "";
  const parts = [];
  let lastIdx = 0;
  const rx = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let m;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    if (m[2]) parts.push(createElement("strong", { key: m.index }, m[2]));
    else if (m[3]) parts.push(createElement("em", { key: m.index }, m[3]));
    else if (m[4]) parts.push(createElement("code", { key: m.index, style: { background: "#e8e5de", padding: "1px 5px", borderRadius: 4, fontSize: "0.9em" } }, m[4]));
    lastIdx = rx.lastIndex;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.length ? parts : text;
}

/* ================================================================
   DATA EXPORT / IMPORT
   ================================================================ */
export function exportAllData(userId) {
  const data = {
    exported: new Date().toISOString(),
    version: SCHEMA_VERSION,
    tasks: loadJSON("tasks", []),
    expenses: loadJSON("expenses", []),
    history: loadJSON("history", []),
    memory: loadJSON("memory", []),
    knowledge: loadJSON("wory_knowledge", null),
    settings: loadJSON("settings", {}),
    chatHistory: loadJSON("chat_history", []),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `workflow-backup-${userId}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* Validate & sanitize imported data — prevents corrupt imports */
function validateImport(data) {
  const errors = [];
  if (!data || typeof data !== "object") return { valid: false, errors: ["File không phải JSON hợp lệ"] };

  // Tasks: must be array of objects with at least id+title
  if (data.tasks) {
    if (!Array.isArray(data.tasks)) { errors.push("tasks không phải mảng"); delete data.tasks; }
    else data.tasks = data.tasks.filter(t => t && typeof t === "object" && t.title);
  }
  // Expenses: array of objects with amount
  if (data.expenses) {
    if (!Array.isArray(data.expenses)) { errors.push("expenses không phải mảng"); delete data.expenses; }
    else data.expenses = data.expenses.filter(e => e && typeof e === "object" && typeof e.amount === "number");
  }
  // History: array
  if (data.history && !Array.isArray(data.history)) { errors.push("history không hợp lệ"); delete data.history; }
  // Memory: array
  if (data.memory && !Array.isArray(data.memory)) { errors.push("memory không hợp lệ"); delete data.memory; }
  // Settings: object
  if (data.settings && typeof data.settings !== "object") { errors.push("settings không hợp lệ"); delete data.settings; }
  // Knowledge: object with entries array
  if (data.knowledge) {
    if (typeof data.knowledge !== "object" || !Array.isArray(data.knowledge.entries)) {
      errors.push("knowledge không hợp lệ"); delete data.knowledge;
    }
  }

  const hasAnyData = data.tasks || data.expenses || data.history || data.memory || data.settings || data.knowledge || data.chatHistory;
  return { valid: !!hasAnyData, errors, warnings: errors };
}

export function importData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const { valid, errors } = validateImport(data);
        if (!valid) { reject(new Error(errors.join(", ") || "File không chứa dữ liệu hợp lệ")); return; }

        if (data.tasks) saveJSON("tasks", data.tasks);
        if (data.expenses) saveJSON("expenses", data.expenses);
        if (data.history) saveJSON("history", data.history);
        if (data.memory) saveJSON("memory", data.memory);
        if (data.settings) saveJSON("settings", data.settings);
        if (data.chatHistory) saveJSON("chat_history", data.chatHistory);
        if (data.knowledge) saveJSON("wory_knowledge", data.knowledge);
        resolve({ ...data, warnings: errors });
      } catch (err) {
        reject(new Error("File JSON không hợp lệ: " + err.message));
      }
    };
    reader.onerror = () => reject(new Error("Không đọc được file"));
    reader.readAsText(file);
  });
}

export function clearAllData() {
  // Preserve industryPreset so setup modal doesn't re-create sample tasks
  let industryPreset = null;
  try {
    const s = JSON.parse(localStorage.getItem(userKey("settings")) || "{}");
    industryPreset = s.industryPreset;
  } catch {}
  const keys = ["tasks", "expenses", "history", "memory", "wory_knowledge", "settings", "chat_history", "chat_started", "chat_archives", "projects", "deleted_projects", "expense_chat"];
  keys.forEach(k => localStorage.removeItem(userKey(k)));
  // Restore minimal settings to prevent industry setup modal from showing
  if (industryPreset) {
    try { localStorage.setItem(userKey("settings"), JSON.stringify({ industryPreset })); } catch {}
  }
}

/* Check if a user's data was cleared (prevents re-sync).
   Flag is PERMANENT until explicitly cleared by clearDataClearedFlag(). */
export function isDataCleared(targetUserId) {
  return !!localStorage.getItem("wf_data_cleared_" + targetUserId);
}

/* Remove the cleared flag (when user starts working again) */
export function clearDataClearedFlag(userId) {
  localStorage.removeItem("wf_data_cleared_" + userId);
}

/* Helper: push empty to cloud with 1 retry */
async function cloudClearWithRetry(userId, key) {
  const emptyVal = key === "wory_knowledge" ? { version: 1, profile: {}, entries: [] } : [];
  try {
    const ok = await cloudSave(null, userId, key, emptyVal);
    if (ok) return true;
  } catch (e) { console.warn("[WF] cloudClear failed:", key, e.message); }
  // Retry once after 500ms
  await new Promise(r => setTimeout(r, 500));
  try { return await cloudSave(null, userId, key, emptyVal); } catch (e) { console.warn("[WF] cloudClear retry failed:", key, e.message); return false; }
}

/* Clear ALL data: local + cloud (call from Settings "Xóa trắng") */
export async function clearAllDataWithCloud(userId) {
  // 1. Set "just cleared" flag — PERMANENT until user takes action (addTask, etc.)
  localStorage.setItem("wf_data_cleared_" + userId, "1");
  // 2. Clear localStorage
  clearAllData();
  // 3. Cancel all pending sync timers
  cancelAllPendingSyncs();
  // 4. Clear cloud — push empty data for each key with retry + set clear_timestamp
  const cloudKeys = ["tasks", "expenses", "settings", "memory", "wory_knowledge", "chat_history", "projects", "expense_chat"];
  const allPushes = cloudKeys.map(key => cloudClearWithRetry(userId, key));
  allPushes.push(cloudSave(null, userId, "clear_timestamp", new Date().toISOString()));
  const results = await Promise.allSettled(allPushes);
  const ok = results.filter(r => r.status === "fulfilled" && r.value).length;
  return { localCleared: true, cloudCleared: ok, total: cloudKeys.length };
}

/* Clear ALL users' data: local + cloud (director only — "Xóa toàn bộ hệ thống") */
export async function clearAllSystemData() {
  const ALL_USER_IDS = ["trinh", "lien", "hung", "mai", "duc"];
  // 1. Preserve industryPreset for each user (prevents setup modal re-creating sample tasks)
  const presets = {};
  ALL_USER_IDS.forEach(uid => {
    try {
      const s = JSON.parse(localStorage.getItem(`wf_${uid}_settings`) || "{}");
      if (s.industryPreset) presets[uid] = s.industryPreset;
    } catch {}
  });
  // 2. Set PERMANENT cleared flag for ALL users
  ALL_USER_IDS.forEach(uid => localStorage.setItem("wf_data_cleared_" + uid, "1"));
  // 3. Clear localStorage for all user prefixes
  const dataKeys = ["tasks", "expenses", "history", "memory", "wory_knowledge", "settings", "chat_history", "chat_started", "chat_archives", "projects", "deleted_projects", "expense_chat"];
  ALL_USER_IDS.forEach(uid => {
    dataKeys.forEach(k => localStorage.removeItem(`wf_${uid}_${k}`));
  });
  // 4. Restore minimal settings (industryPreset) to prevent setup modal
  ALL_USER_IDS.forEach(uid => {
    if (presets[uid]) {
      try { localStorage.setItem(`wf_${uid}_settings`, JSON.stringify({ industryPreset: presets[uid] })); } catch {}
    }
  });
  // 5. Cancel all pending sync timers
  cancelAllPendingSyncs();
  // 6. Push empty to cloud for all users with retry + set clear_timestamp
  const cloudKeys = ["tasks", "expenses", "settings", "memory", "wory_knowledge", "chat_history", "projects", "expense_chat"];
  const allPushes = [];
  const clearTs = new Date().toISOString();
  ALL_USER_IDS.forEach(uid => {
    cloudKeys.forEach(key => allPushes.push(cloudClearWithRetry(uid, key)));
    // Save clear_timestamp so cross-user sync knows data was intentionally cleared
    allPushes.push(cloudSave(null, uid, "clear_timestamp", clearTs));
  });
  const results = await Promise.allSettled(allPushes);
  const ok = results.filter(r => r.status === "fulfilled" && r.value).length;
  return { localCleared: true, cloudCleared: ok, total: allPushes.length };
}

/* ================================================================
   CLOUD BACKUP — Send backup to user's email (server-side SMTP)
   User only provides email. Server sends from system account.
   ================================================================ */
export async function sendBackupEmail(userId) {
  const backupEmail = loadJSON("backup_email", null);
  if (!backupEmail) {
    return { error: "Chưa đăng ký email. Vào Cài đặt → Kết nối → Gmail." };
  }

  const data = {
    exported: new Date().toISOString(),
    version: SCHEMA_VERSION,
    tasks: loadJSON("tasks", []),
    expenses: loadJSON("expenses", []),
    history: loadJSON("history", []),
    memory: loadJSON("memory", []),
    knowledge: loadJSON("wory_knowledge", null),
    settings: loadJSON("settings", {}),
    chatHistory: loadJSON("chat_history", []),
  };

  const res = await fetch("/api/smtp-backup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: backupEmail, data, userId }),
  });

  const result = await res.json();
  if (result.success) { saveJSON("last_backup", new Date().toISOString()); return { success: true }; }
  return { error: result.error || "Gửi backup thất bại." };
}
