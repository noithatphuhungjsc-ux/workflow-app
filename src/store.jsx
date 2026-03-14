/* ================================================================
   STORE — Context + useReducer for Tasks, Settings, History
   Solves: prop drilling, stale closure, centralized state
   ================================================================ */
import { createContext, useContext, useReducer, useState, useEffect, useCallback, useRef } from "react";
import { DEFAULT_SETTINGS, STATUSES, PRIORITIES, getElapsed, fmtMoney } from "./constants";
import { loadJSON, saveJSON, userKey, loadHistory, saveHistory, addLog, loadMemory, saveMemory, loadSettings, saveSettings as persistSettings, loadKnowledge, saveKnowledge, scheduleSyncDebounced, cloudSave, cloudLoad, cloudLoadAll } from "./services";
import { useSupabase } from "./contexts/SupabaseContext";

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
  // Cloud operations use Supabase UUID (matches cross-user sync target IDs)
  // localStorage operations keep using local userId ("mai", "hung", etc.)
  const { session, loading: supaLoading } = useSupabase();
  const cloudId = session?.user?.id || (!supaLoading ? userId : null);

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
  const crossUserTasksRef = useRef({});
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!hasLoadedRef.current) { hasLoadedRef.current = true; return; }
    if (!userKey("").startsWith("wf_")) return;
    saveJSON("tasks", allTasks);
    if (cloudId) {
      scheduleSyncDebounced(null, cloudId, "tasks", allTasks);
      if (cloudId !== userId) cloudSave(null, userId, "tasks", allTasks);
    }

    // Cross-user sync: copy assigned project tasks to assignee's localStorage + cloud
    const DEV_NAME_TO_ID = {
      "Nguyen Duy Trinh": "trinh", "Lientran": "lien", "Pham Van Hung": "hung",
      "Tran Thi Mai": "mai", "Le Minh Duc": "duc",
    };
    const currentPrefix = userKey("");
    // Group tasks by assignee for cloud sync
    const tasksByAssignee = {};
    allTasks.filter(t => t.assignee && !t.deleted).forEach(t => {
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
    // Store tasksByAssignee for cloud sync in separate effect (after projects is declared)
    crossUserTasksRef.current = tasksByAssignee;
  }, [allTasks, userId, cloudId]);

  // Purge old deleted + roll overdue tasks on mount
  useEffect(() => {
    dispatch({ type: "PURGE_DELETED" });
    dispatch({ type: "ROLL_OVERDUE" });
  }, []);

  // Cloud sync: PULL first → merge → then PUSH merged data up
  const cloudLoadedRef = useRef(false);
  useEffect(() => {
    if (cloudLoadedRef.current || !cloudId) return;
    cloudLoadedRef.current = true;

    (async () => {
      let localTasks = loadJSON("tasks", []);
      let localProjects = loadJSON("projects", []);
      let localExpenses = loadJSON("expenses", []);

      // === STEP 1: PULL from cloud FIRST (before pushing) ===
      try {
        let data = await cloudLoadAll(null, cloudId);
        if ((!data?.length) && cloudId !== userId) {
          data = await cloudLoadAll(null, userId);
        }
        if (data?.length) {
          for (const row of data) {
            if (!row.data) continue;

            // Non-array data (settings, memory, knowledge)
            if (!Array.isArray(row.data)) {
              if (row.key === "settings" && typeof row.data === "object") {
                setSettingsState(prev => { const m = { ...prev, ...row.data }; persistSettings(m); return m; });
              }
              if (row.key === "memory" && row.data) { setMemory(row.data); saveJSON("memory", row.data); }
              if (row.key === "wory_knowledge" && row.data) { setKnowledge(row.data); saveJSON("wory_knowledge", row.data); }
              continue;
            }
            if (row.data.length === 0) continue;

            if (row.key === "tasks") {
              if (localTasks.length === 0) {
                localTasks = row.data;
                dispatch({ type: "LOAD", tasks: localTasks });
                saveJSON("tasks", localTasks);
              } else {
                const localIds = new Set(localTasks.map(t => t.id));
                const newItems = row.data.filter(t => !localIds.has(t.id));
                if (newItems.length > 0) {
                  localTasks = [...localTasks, ...newItems];
                  dispatch({ type: "LOAD", tasks: localTasks });
                  saveJSON("tasks", localTasks);
                }
                // Also update existing tasks with newer cloud data
                let updated = false;
                for (const ct of row.data) {
                  const li = localTasks.findIndex(t => t.id === ct.id);
                  if (li >= 0 && ct.status !== localTasks[li].status) {
                    localTasks[li] = { ...localTasks[li], ...ct };
                    updated = true;
                  }
                }
                if (updated) {
                  dispatch({ type: "LOAD", tasks: [...localTasks] });
                  saveJSON("tasks", localTasks);
                }
              }
            }
            if (row.key === "projects") {
              // Filter out projects where user has been removed
              const sess = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}"); } catch { return {}; } })();
              const myNames = [sess.name, sess.id].filter(Boolean).map(n => (n || "").toLowerCase().replace(/\s+/g, ""));
              const validCloud = row.data.filter(p => {
                if (!p.members || p.members.length === 0) return true;
                return p.members.some(m => {
                  if (m.supaId && m.supaId === cloudId) return true;
                  const mn = (m.name || "").toLowerCase().replace(/\s+/g, "");
                  return myNames.includes(mn);
                });
              });
              if (localProjects.length === 0) {
                localProjects = validCloud;
                projDispatch({ type: "PROJ_LOAD", items: localProjects });
                saveJSON("projects", localProjects);
              } else {
                // Also filter local projects by membership
                localProjects = localProjects.filter(p => {
                  if (!p.members || p.members.length === 0) return true;
                  return p.members.some(m => {
                    if (m.supaId && m.supaId === cloudId) return true;
                    const mn = (m.name || "").toLowerCase().replace(/\s+/g, "");
                    return myNames.includes(mn);
                  });
                });
                const localIds = new Set(localProjects.map(p => p.id));
                const newItems = validCloud.filter(p => !localIds.has(p.id));
                if (newItems.length > 0) {
                  localProjects = [...localProjects, ...newItems];
                }
                projDispatch({ type: "PROJ_LOAD", items: localProjects });
                saveJSON("projects", localProjects);
              }
            }
            if (row.key === "expenses") {
              if (localExpenses.length === 0) {
                localExpenses = row.data;
                row.data.forEach(e => expenseDispatch({ type: "EXP_ADD", item: e }));
                saveJSON("expenses", localExpenses);
              } else {
                const localIds = new Set(localExpenses.map(e => e.id));
                const newItems = row.data.filter(e => !localIds.has(e.id));
                if (newItems.length > 0) {
                  localExpenses = [...localExpenses, ...newItems];
                  newItems.forEach(e => expenseDispatch({ type: "EXP_ADD", item: e }));
                }
              }
            }
          }
        }
      } catch (e) { console.warn("Cloud pull failed:", e); }

      // === STEP 2: PUSH merged data UP to cloud ===
      if (localTasks.length > 0) {
        cloudSave(null, cloudId, "tasks", localTasks);
        if (cloudId !== userId) cloudSave(null, userId, "tasks", localTasks);
      }
      if (localProjects.length > 0) {
        cloudSave(null, cloudId, "projects", localProjects);
        if (cloudId !== userId) cloudSave(null, userId, "projects", localProjects);
      }
      if (localExpenses.length > 0) {
        cloudSave(null, cloudId, "expenses", localExpenses);
        if (cloudId !== userId) cloudSave(null, userId, "expenses", localExpenses);
      }
    })();
  }, [cloudId, userId]);

  // --- Expenses (standalone ledger) ---
  const [expenses, expenseDispatch] = useReducer(expenseReducer, [], () => loadJSON("expenses", []));
  const expLoadedRef = useRef(false);
  useEffect(() => {
    if (!expLoadedRef.current) { expLoadedRef.current = true; return; }
    if (!userKey("").startsWith("wf_")) return;
    saveJSON("expenses", expenses);
    if (cloudId) {
      scheduleSyncDebounced(null, cloudId, "expenses", expenses);
      if (cloudId !== userId) cloudSave(null, userId, "expenses", expenses);
    }
  }, [expenses, userId, cloudId]);

  // --- Projects ---
  const [projects, projDispatch] = useReducer(projectReducer, [], () => loadJSON("projects", []));
  const projLoadedRef = useRef(false);
  useEffect(() => {
    if (!projLoadedRef.current) { projLoadedRef.current = true; return; }
    if (!userKey("").startsWith("wf_")) return;
    saveJSON("projects", projects);
    if (cloudId) {
      scheduleSyncDebounced(null, cloudId, "projects", projects);
      if (cloudId !== userId) cloudSave(null, userId, "projects", projects);
    }

    // Cross-user sync: share projects with all members
    const DEV_NAME_MAP = {
      "Nguyen Duy Trinh": "trinh", "Lientran": "lien", "Pham Van Hung": "hung",
      "Tran Thi Mai": "mai", "Le Minh Duc": "duc",
    };
    const currentPrefix = userKey("");
    projects.forEach(proj => {
      if (!proj.members?.length) return;
      proj.members.forEach(m => {
        // Match by member name → local user ID
        const devId = DEV_NAME_MAP[m.name];
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
  }, [projects, userId, cloudId]);

  // Cross-user CLOUD sync: push assigned tasks+projects to assignee's cloud
  const crossSyncTimerRef = useRef(null);
  useEffect(() => {
    const tasksByAssignee = crossUserTasksRef.current;
    if (!cloudId || !Object.keys(tasksByAssignee).length) return;
    clearTimeout(crossSyncTimerRef.current);
    crossSyncTimerRef.current = setTimeout(async () => {
      try {
        const DEV_NAME_TO_LOCAL_ID = {
          "Nguyen Duy Trinh": "trinh", "Lientran": "lien", "Pham Van Hung": "hung",
          "Tran Thi Mai": "mai", "Le Minh Duc": "duc",
        };
        for (const [name, tasks] of Object.entries(tasksByAssignee)) {
          const localId = DEV_NAME_TO_LOCAL_ID[name];
          if (!localId || localId === userId) continue;
          // Load existing cloud data for target via API
          const exResult = await cloudLoad(null, localId, "tasks");
          const cloud = (exResult?.data && Array.isArray(exResult.data)) ? exResult.data : [];
          let merged = [...cloud];
          for (const t of tasks) { const i = merged.findIndex(e => e.id === t.id); if (i >= 0) merged[i] = { ...merged[i], ...t }; else merged.push(t); }
          await cloudSave(null, localId, "tasks", merged);
          // Merge projects
          const projIds = [...new Set(tasks.map(t => t.projectId))];
          const projs = projIds.map(pid => projects.find(pr => pr.id === pid)).filter(Boolean);
          if (projs.length) {
            const exP = await cloudLoad(null, localId, "projects");
            const cP = (exP?.data && Array.isArray(exP.data)) ? exP.data : [];
            let mP = [...cP];
            for (const pr of projs) { const i = mP.findIndex(e => e.id === pr.id); if (i >= 0) mP[i] = { ...mP[i], ...pr }; else mP.push(pr); }
            await cloudSave(null, localId, "projects", mP);
          }
        }
      } catch (e) { console.warn("Cross-user cloud sync failed:", e); }
    }, 5000);
  }, [allTasks, projects, cloudId, userId]);

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
      if (cloudId) {
        scheduleSyncDebounced(null, cloudId, "settings", next);
        if (cloudId !== userId) cloudSave(null, userId, "settings", next);
      }
      return next;
    });
  }, [cloudId]);

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
