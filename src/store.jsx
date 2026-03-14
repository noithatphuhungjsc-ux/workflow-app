/* ================================================================
   STORE — Context + useReducer for Tasks, Settings, History
   Solves: prop drilling, stale closure, centralized state
   ================================================================ */
import { createContext, useContext, useReducer, useState, useEffect, useCallback, useRef } from "react";
import { DEFAULT_SETTINGS, STATUSES, PRIORITIES, getElapsed, fmtMoney } from "./constants";
import { loadJSON, saveJSON, userKey, loadHistory, saveHistory, addLog, loadMemory, saveMemory, loadSettings, saveSettings as persistSettings, loadKnowledge, saveKnowledge, scheduleSyncDebounced, cloudSave } from "./services";
import { supabase } from "./lib/supabase";

/* ================================================================
   TASK REDUCER — immutable updates, soft delete support
   ================================================================ */
function taskReducer(state, action) {
  switch (action.type) {
    case "LOAD":
      return action.tasks;

    case "ADD":
      return [...state, {
        ...action.task,
        id: Date.now() + Math.random(),
        createdAt: action.task.createdAt || new Date().toISOString().split("T")[0],
        status: "todo",
        step: 0,
        timerState: "idle",
        timerStart: null,
        timerTotal: 0,
        deleted: false,
        expense: action.task.expense || null,
        billPhotos: action.task.billPhotos || [],
        notes: Array.isArray(action.task.notes)
          ? action.task.notes
          : action.task.notes
            ? [{ id: Date.now(), text: action.task.notes, status: "pending", priority: "normal" }]
            : [],
      }];

    case "ROLL_OVERDUE": {
      const today = new Date().toISOString().split("T")[0];
      return state.map(t => {
        if (t.deleted || t.status === "done") return t;
        if (!t.deadline || t.deadline >= today) return t;
        // Task quá hạn → dồn sang hôm nay, lưu deadline gốc
        return {
          ...t,
          originalDeadline: t.originalDeadline || t.deadline,
          deadline: today,
        };
      });
    }

    case "SOFT_DELETE":
      return state.map(t =>
        t.id === action.id
          ? { ...t, deleted: true, deletedAt: Date.now() }
          : t
      );

    case "HARD_DELETE":
      return state.filter(t => t.id !== action.id);

    case "UNDO_DELETE":
      return state.map(t =>
        t.id === action.id
          ? { ...t, deleted: false, deletedAt: null }
          : t
      );

    case "PATCH":
      return state.map(t =>
        t.id === action.id ? { ...t, ...action.data } : t
      );

    case "PURGE_DELETED": {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
      return state.filter(t => !t.deleted || (t.deletedAt && t.deletedAt > cutoff));
    }

    default:
      return state;
  }
}

/* ================================================================
   EXPENSE REDUCER — standalone expense ledger
   ================================================================ */
function expenseReducer(state, action) {
  switch (action.type) {
    case "EXP_LOAD": return action.items;
    case "EXP_ADD": return [...state, { ...action.item, id: Date.now() + Math.random() }];
    case "EXP_PATCH": return state.map(e => e.id === action.id ? { ...e, ...action.data } : e);
    case "EXP_DELETE": return state.filter(e => e.id !== action.id);
    default: return state;
  }
}

/* ================================================================
   PROJECT REDUCER — project groups
   ================================================================ */
function projectReducer(state, action) {
  switch (action.type) {
    case "PROJ_LOAD": return action.items;
    case "PROJ_ADD": return [...state, { ...action.item, id: action.item.id || (Date.now() + Math.random()), createdAt: action.item.createdAt || new Date().toISOString().split("T")[0] }];
    case "PROJ_PATCH": return state.map(p => p.id === action.id ? { ...p, ...action.data } : p);
    case "PROJ_DELETE": return state.filter(p => p.id !== action.id);
    default: return state;
  }
}

/* ================================================================
   CONTEXTS
   ================================================================ */
const TaskContext   = createContext(null);
const SettingsCtx   = createContext(null);

/* ================================================================
   TASK PROVIDER
   ================================================================ */
export function AppProvider({ children, userId }) {
  // --- Tasks ---
  const [allTasks, dispatch] = useReducer(taskReducer, [], () => {
    const saved = loadJSON("tasks", []);
    return saved.map(t => ({
      deleted: false, deletedAt: null, timerState: "idle", timerStart: null, timerTotal: 0,
      expense: null, billPhotos: [],
      ...t,
      createdAt: t.createdAt || t.deadline || new Date().toISOString().split("T")[0],
      notes: Array.isArray(t.notes) ? t.notes
        : t.notes ? [{ id: Date.now() + Math.random(), text: t.notes, status: "pending", priority: "normal" }]
        : [],
    }));
  });

  // Active tasks = not soft-deleted
  const tasks = allTasks.filter(t => !t.deleted);
  const deletedTasks = allTasks.filter(t => t.deleted);

  // Auto-save + cloud sync + cross-user task sync
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!hasLoadedRef.current) { hasLoadedRef.current = true; return; }
    if (!userKey("").startsWith("wf_")) return;
    saveJSON("tasks", allTasks);
    if (supabase && userId) scheduleSyncDebounced(supabase, userId, "tasks", allTasks);

    // Cross-user sync: copy assigned project tasks to assignee's localStorage + cloud
    const DEV_NAME_TO_ID = {
      "Nguyen Duy Trinh": "trinh", "Lientran": "lien", "Pham Van Hung": "hung",
      "Tran Thi Mai": "mai", "Le Minh Duc": "duc",
    };
    const currentPrefix = userKey("");
    // Group tasks by assignee for cloud sync
    const tasksByAssignee = {};
    allTasks.filter(t => t.assignee && t.projectId && !t.deleted).forEach(t => {
      const targetId = DEV_NAME_TO_ID[t.assignee];
      if (!targetId) return;
      const targetKey = `wf_${targetId}_tasks`;
      if (targetKey === currentPrefix + "tasks") return;
      // localStorage sync (same device)
      try {
        const existing = JSON.parse(localStorage.getItem(targetKey) || "[]");
        const idx = existing.findIndex(e => e.id === t.id);
        if (idx >= 0) { existing[idx] = { ...existing[idx], ...t }; }
        else { existing.push(t); }
        localStorage.setItem(targetKey, JSON.stringify(existing));
      } catch {}
      // Collect for cloud sync
      if (!tasksByAssignee[t.assignee]) tasksByAssignee[t.assignee] = [];
      tasksByAssignee[t.assignee].push(t);
    });
    // Cloud sync: push assigned tasks to assignee's Supabase user_data
    if (supabase && Object.keys(tasksByAssignee).length > 0) {
      (async () => {
        try {
          // Fetch profiles for matching (try with email, fallback without)
          let profiles;
          const { data: pData, error: pErr } = await supabase.from("profiles").select("id, display_name, email");
          if (pErr) {
            // email column might not exist yet — fallback
            const { data: pFallback } = await supabase.from("profiles").select("id, display_name");
            profiles = pFallback;
          } else {
            profiles = pData;
          }
          if (!profiles) return;
          // Known assignee name → email mapping
          const DEV_EMAIL_MAP = {
            "Tran Thi Mai": "noithatphuhung.jsc@gmail.com",
          };
          const normalize = s => (s || "").toLowerCase().trim();
          for (const [assigneeName, assignedTasks] of Object.entries(tasksByAssignee)) {
            const knownEmail = DEV_EMAIL_MAP[assigneeName];
            // Match by: 1) display_name exact, 2) email, 3) partial name match
            let profile = profiles.find(p => normalize(p.display_name) === normalize(assigneeName));
            if (!profile && knownEmail) {
              profile = profiles.find(p => normalize(p.email) === normalize(knownEmail));
            }
            if (!profile) {
              const parts = assigneeName.toLowerCase().split(" ");
              profile = profiles.find(p => parts.some(part => part.length > 2 && normalize(p.display_name).includes(part)));
            }
            if (!profile || profile.id === userId) continue;
            // Get existing cloud tasks for this assignee
            const { data: existing } = await supabase.from("user_data")
              .select("data").eq("user_id", profile.id).eq("key", "tasks").maybeSingle();
            const cloudTasks = (existing?.data && Array.isArray(existing.data)) ? existing.data : [];
            // Merge: update existing, add new
            let merged = [...cloudTasks];
            for (const t of assignedTasks) {
              const idx = merged.findIndex(e => e.id === t.id);
              if (idx >= 0) { merged[idx] = { ...merged[idx], ...t }; }
              else { merged.push(t); }
            }
            await cloudSave(supabase, profile.id, "tasks", merged);
            // Also sync projects
            const assigneeProjects = [...new Set(assignedTasks.map(t => t.projectId))];
            const projsToSync = assigneeProjects.map(pid => projects.find(p => p.id === pid)).filter(Boolean);
            if (projsToSync.length > 0) {
              const { data: existingProj } = await supabase.from("user_data")
                .select("data").eq("user_id", profile.id).eq("key", "projects").maybeSingle();
              const cloudProjs = (existingProj?.data && Array.isArray(existingProj.data)) ? existingProj.data : [];
              let mergedProjs = [...cloudProjs];
              for (const p of projsToSync) {
                const idx = mergedProjs.findIndex(e => e.id === p.id);
                if (idx >= 0) { mergedProjs[idx] = { ...mergedProjs[idx], ...p }; }
                else { mergedProjs.push(p); }
              }
              await cloudSave(supabase, profile.id, "projects", mergedProjs);
            }
          }
        } catch (e) { console.warn("Cross-user cloud sync failed:", e); }
      })();
    }
  }, [allTasks, userId, projects]);

  // Purge old deleted + roll overdue tasks on mount
  useEffect(() => {
    dispatch({ type: "PURGE_DELETED" });
    dispatch({ type: "ROLL_OVERDUE" });
  }, []);

  // Cloud sync: push local data UP + pull missing data DOWN
  const cloudLoadedRef = useRef(false);
  useEffect(() => {
    if (cloudLoadedRef.current || !supabase || !userId) return;
    cloudLoadedRef.current = true;
    const localTasks = loadJSON("tasks", []);
    const localProjects = loadJSON("projects", []);
    const localExpenses = loadJSON("expenses", []);
    // If local has data → push UP to cloud (ensures cloud is always fresh)
    if (localTasks.length > 0) cloudSave(supabase, userId, "tasks", localTasks);
    if (localProjects.length > 0) cloudSave(supabase, userId, "projects", localProjects);
    if (localExpenses.length > 0) cloudSave(supabase, userId, "expenses", localExpenses);
    // Load from cloud if ANY key is missing locally
    if (localTasks.length > 0 && localProjects.length > 0) return;
    (async () => {
      try {
        const { data, error } = await supabase.from("user_data").select("key, data").eq("user_id", userId);
        if (error || !data?.length) return;
        let loaded = 0;
        for (const row of data) {
          if (!row.data) continue;
          // Load each key independently — only if local is empty for that key
          if (row.key === "tasks" && localTasks.length === 0 && Array.isArray(row.data) && row.data.length > 0) {
            dispatch({ type: "LOAD", tasks: row.data });
            saveJSON("tasks", row.data);
            loaded++;
          }
          if (row.key === "projects" && localProjects.length === 0 && Array.isArray(row.data) && row.data.length > 0) {
            projDispatch({ type: "PROJ_LOAD", items: row.data });
            saveJSON("projects", row.data);
            loaded++;
          }
          if (row.key === "expenses" && localExpenses.length === 0 && Array.isArray(row.data) && row.data.length > 0) {
            row.data.forEach(e => expenseDispatch({ type: "EXP_ADD", item: e }));
            saveJSON("expenses", row.data);
            loaded++;
          }
          if (row.key === "settings" && typeof row.data === "object") {
            setSettingsState(prev => {
              const merged = { ...prev, ...row.data };
              persistSettings(merged);
              return merged;
            });
            loaded++;
          }
          if (row.key === "memory" && row.data) {
            setMemory(row.data);
            saveJSON("memory", row.data);
            loaded++;
          }
          if (row.key === "wory_knowledge" && row.data) {
            setKnowledge(row.data);
            saveJSON("wory_knowledge", row.data);
            loaded++;
          }
        }
        if (loaded > 0) console.log(`Cloud sync: loaded ${loaded} items from cloud`);
      } catch (e) { console.warn("Cloud auto-load failed:", e); }
    })();
  }, [userId]);

  // --- Expenses (standalone ledger) ---
  const [expenses, expenseDispatch] = useReducer(expenseReducer, [], () => loadJSON("expenses", []));
  const expLoadedRef = useRef(false);
  useEffect(() => {
    if (!expLoadedRef.current) { expLoadedRef.current = true; return; }
    if (!userKey("").startsWith("wf_")) return;
    saveJSON("expenses", expenses);
    if (supabase && userId) scheduleSyncDebounced(supabase, userId, "expenses", expenses);
  }, [expenses, userId]);

  // --- Projects ---
  const [projects, projDispatch] = useReducer(projectReducer, [], () => loadJSON("projects", []));
  const projLoadedRef = useRef(false);
  useEffect(() => {
    if (!projLoadedRef.current) { projLoadedRef.current = true; return; }
    if (!userKey("").startsWith("wf_")) return;
    saveJSON("projects", projects);
    if (supabase && userId) scheduleSyncDebounced(supabase, userId, "projects", projects);

    // Cross-user sync: share projects with all members
    const DEV_IDS = ["trinh", "lien", "hung", "mai", "duc"];
    const currentPrefix = userKey("");
    projects.forEach(proj => {
      if (!proj.members?.length) return;
      proj.members.forEach(m => {
        const targetId = DEV_IDS.find(id => id === m.id || `wf_${id}_` === currentPrefix);
        const memberId = m.id || m.supaId;
        const devId = DEV_IDS.find(id => id === memberId);
        if (!devId || `wf_${devId}_` === currentPrefix) return;
        const targetKey = `wf_${devId}_projects`;
        try {
          const existing = JSON.parse(localStorage.getItem(targetKey) || "[]");
          const idx = existing.findIndex(e => e.id === proj.id);
          if (idx >= 0) {
            existing[idx] = { ...existing[idx], ...proj };
          } else {
            existing.push(proj);
          }
          localStorage.setItem(targetKey, JSON.stringify(existing));
        } catch {}
      });
    });
  }, [projects, userId]);

  const addProject = useCallback((item) => { projDispatch({ type: "PROJ_ADD", item }); }, []);
  const patchProject = useCallback((id, data) => { projDispatch({ type: "PROJ_PATCH", id, data }); }, []);
  const deleteProject = useCallback((id) => { projDispatch({ type: "PROJ_DELETE", id }); }, []);

  const addExpense = useCallback((item) => {
    expenseDispatch({ type: "EXP_ADD", item });
    log("expense", item.description || "Chi tiêu", fmtMoney(item.amount));
  }, []);
  const patchExpense = useCallback((id, data) => { expenseDispatch({ type: "EXP_PATCH", id, data }); }, []);
  const deleteExpense = useCallback((id) => { expenseDispatch({ type: "EXP_DELETE", id }); }, []);

  // --- History ---
  const [history, setHistory] = useState(loadHistory);
  const log = useCallback((action, title, detail = "") => {
    setHistory(prev => {
      const entry = { id: Date.now(), ts: new Date().toISOString(), action, taskTitle: title, detail };
      const next = [...prev, entry];
      saveHistory(next);
      return next;
    });
  }, []);

  // --- Memory ---
  const [memory, setMemory] = useState(loadMemory);

  // --- Knowledge (Wory Training) ---
  const [knowledge, setKnowledge] = useState(() => loadKnowledge());
  const pendingKnowledge = knowledge.entries.filter(e => !e.approved);

  // --- Settings ---
  const [settings, setSettingsState] = useState(() => loadSettings(DEFAULT_SETTINGS));
  const setSettings = useCallback((updater) => {
    setSettingsState(prev => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      persistSettings(next);
      if (supabase && userId) scheduleSyncDebounced(supabase, userId, "settings", next);
      return next;
    });
  }, [userId]);

  // --- Undo toast ---
  const [undoToast, setUndoToast] = useState(null);
  const undoTimerRef = useRef(null);

  // --- Task actions ---
  const addTask = useCallback((taskData) => {
    dispatch({ type: "ADD", task: taskData });
    log("add", taskData.title || "Cong viec moi");
  }, [log]);

  const deleteTask = useCallback((id) => {
    const t = allTasks.find(x => x.id === id);
    dispatch({ type: "SOFT_DELETE", id });
    log("delete", t?.title || "?");

    // Show undo toast
    clearTimeout(undoTimerRef.current);
    setUndoToast({ id, title: t?.title || "Công việc" });
    undoTimerRef.current = setTimeout(() => setUndoToast(null), 5000);
  }, [allTasks, log]);

  const undoDelete = useCallback(() => {
    if (!undoToast) return;
    dispatch({ type: "UNDO_DELETE", id: undoToast.id });
    setUndoToast(null);
    clearTimeout(undoTimerRef.current);
  }, [undoToast]);

  const hardDelete = useCallback((id) => {
    dispatch({ type: "HARD_DELETE", id });
  }, []);

  const patchTask = useCallback((id, data) => {
    dispatch({ type: "PATCH", id, data });
    const t = allTasks.find(x => x.id === id);
    if (data.status) log("status", t?.title || "?", STATUSES[data.status]?.label || data.status);
    if (data.timerState) log("timer", t?.title || "?", data.timerState === "running" ? "Bắt đầu" : data.timerState === "paused" ? "Tạm dừng" : "Hoàn thành");
  }, [allTasks, log]);

  // Timer actions
  const timerStart = useCallback((id) => {
    patchTask(id, { timerState: "running", timerStart: Date.now(), timerTotal: 0, status: "inprogress" });
  }, [patchTask]);

  const timerPause = useCallback((id) => {
    const t = allTasks.find(x => x.id === id);
    if (!t) return;
    patchTask(id, { timerState: "paused", timerStart: null, timerTotal: getElapsed(t) });
  }, [allTasks, patchTask]);

  const timerResume = useCallback((id) => {
    patchTask(id, { timerState: "running", timerStart: Date.now() });
  }, [patchTask]);

  const timerDone = useCallback((id) => {
    const t = allTasks.find(x => x.id === id);
    if (!t) return;
    patchTask(id, { timerState: "idle", timerStart: null, timerTotal: getElapsed(t), status: "done" });
  }, [allTasks, patchTask]);

  // Timer tick
  const [timerTick, setTimerTick] = useState(0);
  useEffect(() => {
    const hasRunning = tasks.some(t => t.timerState === "running");
    if (!hasRunning) return;
    const iv = setInterval(() => setTimerTick(k => k + 1), 1000);
    return () => clearInterval(iv);
  }, [tasks]);

  const value = {
    tasks,
    allTasks,
    deletedTasks,
    dispatch,
    addTask,
    deleteTask,
    undoDelete,
    hardDelete,
    patchTask,
    expenses,
    addExpense,
    patchExpense,
    deleteExpense,
    projects,
    addProject,
    patchProject,
    deleteProject,
    timerStart,
    timerPause,
    timerResume,
    timerDone,
    timerTick,
    history,
    setHistory,
    log,
    memory,
    setMemory,
    knowledge,
    setKnowledge,
    pendingKnowledge,
    undoToast,
    setUndoToast,
    settings,
    setSettings,
    userId,
  };

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
}

/* ================================================================
   HOOKS to consume context
   ================================================================ */
export function useStore() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useStore must be inside AppProvider");
  return ctx;
}

export function useTasks() {
  const { tasks, addTask, deleteTask, undoDelete, patchTask, timerStart, timerPause, timerResume, timerDone, timerTick } = useStore();
  return { tasks, addTask, deleteTask, undoDelete, patchTask, timerStart, timerPause, timerResume, timerDone, timerTick };
}

export function useSettings() {
  const { settings, setSettings } = useStore();
  return { settings, setSettings };
}
