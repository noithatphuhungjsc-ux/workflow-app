/* ================================================================
   SERVICES — API, TTS, Storage, Task commands (DRY)
   ================================================================ */
import { STATUSES, PRIORITIES, SCHEMA_VERSION, DEFAULT_PROFILE, KNOWLEDGE_CATEGORIES } from "./constants";

/* ================================================================
   STORAGE — localStorage with schema versioning
   ================================================================ */
let _userPrefix = "";
export function setUserPrefix(id) { _userPrefix = id ? `wf_${id}_` : "wf_"; }
export function userKey(key) { return _userPrefix + key; }

// Schema migration
function migrateData(key, data) {
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
    return data;
  } catch {
    return fallback;
  }
}

export function saveJSON(key, data) {
  try {
    localStorage.setItem(userKey(key), JSON.stringify(data));
  } catch (e) {
    // localStorage full — warn
    console.warn("Storage full:", e);
  }
}

/* ================================================================
   CLOUD SYNC — Supabase backup & restore
   ================================================================ */
let _syncTimer = null;
const SYNC_KEYS = ["tasks", "expenses", "settings", "memory", "wory_knowledge", "chat_history", "expense_chat"];

export async function cloudSave(supabase, userId, key, data) {
  if (!supabase || !userId) return null;
  try {
    const { error } = await supabase.from("user_data").upsert({
      user_id: userId,
      key,
      data,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,key" });
    if (error) console.warn("Cloud save error:", key, error.message);
    return !error;
  } catch (e) { console.warn("Cloud save failed:", e); return false; }
}

export async function cloudLoad(supabase, userId, key) {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase
      .from("user_data")
      .select("data, updated_at")
      .eq("user_id", userId)
      .eq("key", key)
      .single();
    if (error || !data) return null;
    return data;
  } catch { return null; }
}

export async function cloudSaveAll(supabase, userId) {
  if (!supabase || !userId) return false;
  let ok = 0;
  for (const key of SYNC_KEYS) {
    const localData = loadJSON(key, null);
    if (localData !== null) {
      const result = await cloudSave(supabase, userId, key, localData);
      if (result) ok++;
    }
  }
  return ok;
}

export async function cloudLoadAll(supabase, userId) {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase
      .from("user_data")
      .select("key, data, updated_at")
      .eq("user_id", userId);
    if (error || !data) return null;
    return data;
  } catch { return null; }
}

export function scheduleSyncDebounced(supabase, userId, key, data) {
  if (!supabase || !userId) return;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    cloudSave(supabase, userId, key, data);
  }, 3000); // Debounce 3s
}

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

/* -- Auto-learning extraction -- */
export async function extractKnowledge(messages, existingEntries) {
  const last10 = messages.slice(-10);
  if (last10.length < 4) return [];

  const existingSummary = existingEntries
    .filter(e => e.approved)
    .slice(-20)
    .map(e => `- ${e.content}`)
    .join("\n") || "Chua co.";

  const systemPrompt = `Ban la bo phan phan tich cua Wory. Nhiem vu: doc hoi thoai va trich xuat thong tin QUAN TRONG ve nguoi dung de Wory hieu ho hon.

Chi trich xuat khi THUC SU co thong tin moi, cu the, huu ich. KHONG trich xuat:
- Noi dung chung chung, tam thuong
- Lenh cong viec (TASK_ADD, TASK_DELETE...)
- Cam xuc nhat thoi, loi chao
- Dieu da co trong danh sach

Phan loai:
- "style": phong cach, thoi quen, so thich lam viec
- "sop": quy trinh, buoc, tieu chuan, quy dinh
- "people": thong tin ve nguoi (dong nghiep, doi tac, sep)
- "context": boi canh cong viec, du an, muc tieu

Tra ve JSON array (co the rong [] neu khong co gi moi):
[{"content":"noi dung ngan gon","category":"style|sop|people|context","tags":["tag1","tag2"]}]

CHI TRA VE JSON, KHONG GI KHAC.

Danh sach da biet:
${existingSummary}`;

  try {
    const resp = await callClaude(systemPrompt, last10.map(m => ({ role: m.role, content: m.content })), 500);
    // Parse JSON from response
    const jsonMatch = resp.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const items = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(items)) return [];
    return items.filter(i => i.content && i.category && ["style", "sop", "people", "context"].includes(i.category));
  } catch {
    return [];
  }
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
  } catch {}
  return merged;
}
export function saveSettings(settings) { saveJSON("settings", settings); }

/* -- Accounts -- */
export async function hashPassword(pw) {
  const enc = new TextEncoder().encode(pw + "wf_salt_2026_v2");
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function loadAccounts() {
  try {
    const saved = localStorage.getItem("wf_accounts");
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}

export function saveAccounts(accounts) {
  localStorage.setItem("wf_accounts", JSON.stringify(accounts));
}

export function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function maskPhone(phone) {
  if (!phone || phone.length < 4) return "***";
  return "***" + phone.slice(-4);
}

/* ================================================================
   TOKEN ENCRYPTION — AES-GCM for sensitive data (Gmail tokens)
   ================================================================ */
const TOKEN_SALT = "wf_token_enc_2026";

async function deriveKey(userId) {
  const raw = new TextEncoder().encode(userId + TOKEN_SALT);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(data, userId) {
  try {
    const key = await deriveKey(userId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    return JSON.stringify({
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted)),
    });
  } catch {
    return null;
  }
}

export async function decryptToken(encStr, userId) {
  try {
    const { iv, data } = JSON.parse(encStr);
    const key = await deriveKey(userId);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv) },
      key,
      new Uint8Array(data)
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    return null;
  }
}

/* ================================================================
   TTS — Text-to-Speech with callback
   ================================================================ */
export function tts(text, rate = 1.05, onEnd = null) {
  if (!window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/[#]{1,6}\s?/g, "")
    .replace(/[\[\]()]/g, "")
    .replace(/^[\s]*[-\u2022\u25CF\u25AA\u25B8\u25BA\u2192*+]\s?/gm, "")
    .replace(/^\s*\d+\.\s/gm, "")
    .replace(/[>|`~]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, "")
    .replace(/\n+/g, ". ")
    .replace(/\s{2,}/g, " ")
    .slice(0, 300).trim();
  if (!clean) { onEnd?.(); return; }

  try { window.speechSynthesis.resume(); } catch {}

  const u = new SpeechSynthesisUtterance(clean);
  u.lang = "vi-VN";
  u.rate = rate;
  u.pitch = 0.92;
  u.volume = 1;
  const voices = window.speechSynthesis.getVoices();
  const viFemale = voices.find(v => v.lang.startsWith("vi") && /female|nu/i.test(v.name));
  const viAny = voices.find(v => v.lang.startsWith("vi"));
  if (viFemale) u.voice = viFemale;
  else if (viAny) u.voice = viAny;

  let ended = false;
  const safetyMs = Math.max(clean.length * 80, 2500);
  const timer = onEnd ? setTimeout(() => { if (!ended) { ended = true; onEnd(); } }, safetyMs) : null;
  u.onend = () => { if (!ended) { ended = true; clearTimeout(timer); onEnd?.(); } };
  u.onerror = () => { if (!ended) { ended = true; clearTimeout(timer); onEnd?.(); } };
  try { window.speechSynthesis.speak(u); } catch { if (!ended) { ended = true; clearTimeout(timer); onEnd?.(); } }
  setTimeout(() => { try { window.speechSynthesis.resume(); } catch {} }, 200);
}

/* ================================================================
   CLAUDE API — always through server proxy (key never exposed to browser)
   ================================================================ */

export async function callClaude(system, messages, maxTokens = 700) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages, max_tokens: maxTokens }),
  });
  const d = await res.json();
  if (d.error) throw new Error(typeof d.error === "string" ? d.error : JSON.stringify(d.error));
  return d.content?.[0]?.text || "";
}

export async function callClaudeStream(system, messages, onDelta, maxTokens = 1500) {
  const res = await fetch("/api/chat-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages, max_tokens: maxTokens }),
  });
  if (!res.ok) throw new Error("API error");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const evt = JSON.parse(data);
        if (evt.type === "content_block_delta" && evt.delta?.text) {
          fullText += evt.delta.text;
          onDelta(fullText);
        }
      } catch {}
    }
  }
  return fullText;
}

/* ================================================================
   TASK COMMANDS — unified processing (DRY, chong injection)
   ================================================================ */
export function processTaskCommands(text, tasks, handlers, hasPermission) {
  if (!hasPermission) return { cleanText: text, actions: [] };
  let result = text;
  const actions = [];

  const patterns = [
    {
      rx: /\[TASK_DELETE:(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found) {
          actions.push({ type: "delete", task: found });
          return `Đã xóa "${found.title}"!`;
        }
        return `Không tìm thấy công việc "${match[1]}".`;
      },
    },
    {
      rx: /\[TASK_ADD:(.+?)\]/,
      handler: (match) => {
        const parts = match[1].split("|").map(s => s.trim());
        const title = parts[0];
        const data = { title, priority: "trung", category: "", deadline: "", notes: "", startTime: "", duration: 30 };
        for (let i = 1; i < parts.length; i++) {
          const kv = parts[i].split(":");
          const k = kv[0]?.trim();
          const v = kv.slice(1).join(":").trim();
          if (k === "priority" && ["cao","trung","thap","none"].includes(v)) data.priority = v;
          else if (k === "deadline") data.deadline = v;
          else if (k === "time") data.startTime = v;
          else if (k === "duration") data.duration = parseInt(v) || 30;
          else if (k === "category") data.category = v;
          else if (k === "notes") data.notes = v;
        }
        actions.push({ type: "add", data });
        return `Đã thêm "${title}"!`;
      },
    },
    {
      rx: /\[TASK_STATUS:(.+?):(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const newStatus = match[2].trim().toLowerCase();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found && STATUSES[newStatus]) {
          actions.push({ type: "patch", id: found.id, data: { status: newStatus } });
          return `"${found.title}" -> ${STATUSES[newStatus].label}!`;
        }
        return `Không tìm thấy hoặc trạng thái không hợp lệ.`;
      },
    },
    {
      rx: /\[TASK_PRIORITY:(.+?):(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const newPrio = match[2].trim().toLowerCase();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found && PRIORITIES[newPrio]) {
          actions.push({ type: "patch", id: found.id, data: { priority: newPrio } });
          return `"${found.title}" ưu tiên -> ${PRIORITIES[newPrio].label}!`;
        }
        return `Không tìm thấy hoặc mức ưu tiên không hợp lệ.`;
      },
    },
    {
      rx: /\[TASK_TITLE:(.+?):(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const newTitle = match[2].trim();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found) {
          actions.push({ type: "patch", id: found.id, data: { title: newTitle } });
          return `Đã đổi thành "${newTitle}"!`;
        }
        return `Không tìm thấy công việc.`;
      },
    },
    {
      rx: /\[TASK_DEADLINE:(.+?):(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const newDl = match[2].trim();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found) {
          actions.push({ type: "patch", id: found.id, data: { deadline: newDl } });
          return `Deadline "${found.title}" -> ${newDl}!`;
        }
        return `Không tìm thấy công việc.`;
      },
    },
    {
      rx: /\[TASK_NOTES:(.+?):(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const note = match[2].trim();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found) {
          const existing = Array.isArray(found.notes) ? found.notes : [];
          const newNote = { id: Date.now(), text: note, status: "pending", priority: "normal" };
          actions.push({ type: "patch", id: found.id, data: { notes: [...existing, newNote] } });
          return `Đã thêm ghi chú!`;
        }
        return `Không tìm thấy công việc.`;
      },
    },
    {
      rx: /\[TASK_EXPENSE:(.+?):(.+?)\|(\d+)\|?(.+?)?\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const desc = match[2].trim();
        const amount = parseInt(match[3]) || 0;
        const cat = (match[4] || "other").trim().toLowerCase();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found && amount > 0) {
          const expense = found.expense || {};
          const items = expense.items || (expense.amount > 0 ? [{ id: 1, desc: expense.description || "", amount: expense.amount, category: expense.category || "work", paid: !!expense.paid }] : []);
          const newItem = { id: Date.now(), desc, amount, category: cat, paid: false };
          const newItems = [...items, newItem];
          const total = newItems.reduce((s, e) => s + (e.amount || 0), 0);
          const descAll = newItems.map(i => i.desc).filter(Boolean).join(", ");
          actions.push({ type: "patch", id: found.id, data: { expense: { ...expense, items: newItems, amount: total, description: descAll, category: newItems[0]?.category || "other" } } });
          return `Đã thêm chi tiêu "${desc}" ${amount.toLocaleString()}đ!`;
        }
        return amount <= 0 ? `Số tiền không hợp lệ.` : `Không tìm thấy công việc.`;
      },
    },
  ];

  for (const p of patterns) {
    let m;
    while ((m = result.match(p.rx)) !== null) {
      const replacement = p.handler(m);
      result = result.replace(m[0], replacement);
    }
  }

  // Clean remaining brackets
  result = result.replace(/\[TASK_\w+:.+?\]/g, "");

  return { cleanText: result, actions };
}

// Execute collected actions (with confirmation support)
export function executeTaskActions(actions, { addTask, deleteTask, patchTask }) {
  for (const a of actions) {
    switch (a.type) {
      case "add":    addTask(a.data); break;
      case "delete": deleteTask(a.task.id); break;
      case "patch":  patchTask(a.id, a.data); break;
    }
  }
}

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
import { createElement } from "react";

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

export function importData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.tasks) saveJSON("tasks", data.tasks);
        if (data.expenses) saveJSON("expenses", data.expenses);
        if (data.history) saveJSON("history", data.history);
        if (data.memory) saveJSON("memory", data.memory);
        if (data.settings) saveJSON("settings", data.settings);
        if (data.chatHistory) saveJSON("chat_history", data.chatHistory);
        if (data.knowledge) saveJSON("wory_knowledge", data.knowledge);
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function clearAllData() {
  const keys = ["tasks", "expenses", "history", "memory", "wory_knowledge", "settings", "chat_history", "chat_started", "chat_archives"];
  keys.forEach(k => localStorage.removeItem(userKey(k)));
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
