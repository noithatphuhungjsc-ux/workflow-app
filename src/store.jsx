/* ================================================================
   STORE — Context + useReducer for Tasks, Settings, History
   Solves: prop drilling, stale closure, centralized state
   ================================================================ */
import { createContext, useContext, useReducer, useState, useEffect, useCallback, useRef } from "react";
import { DEFAULT_SETTINGS, STATUSES, PRIORITIES, getElapsed, fmtMoney, WORKFLOWS } from "./constants";
import { INDUSTRY_PRESETS, getWorkflowsByIds } from "./industryPresets";
import { loadJSON, saveJSON, userKey, loadHistory, saveHistory, addLog, loadMemory, saveMemory, loadSettings, saveSettings as persistSettings, loadKnowledge, saveKnowledge, scheduleSyncDebounced, cloudSave, cloudLoad, cloudLoadAll, cloudLoadKeys } from "./services";
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

  // Gate: don't push to cloud until cloud pull has completed
  const cloudPullDoneRef = useRef(!cloudId); // if no cloudId, no pull needed
  // Suppress push during/after poll (prevent stale data overwriting admin deletions)
  const suppressPushRef = useRef(false);

  // Auto-save + cloud sync + cross-user task sync
  const crossUserTasksRef = useRef({});
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!hasLoadedRef.current) { hasLoadedRef.current = true; return; }
    if (!userKey("").startsWith("wf_")) return;
    saveJSON("tasks", allTasks);
    // Push to cloud — but suppress during/after poll to prevent stale data overwriting
    if (cloudId && cloudPullDoneRef.current && !suppressPushRef.current) {
      scheduleSyncDebounced(null, userId, "tasks", allTasks);
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
      if (cloudPullDoneRef.current) {
        try {
          const existing = JSON.parse(localStorage.getItem(targetKey) || "[]");
          const idx = existing.findIndex(e => e.id === t.id);
          if (idx >= 0) { existing[idx] = { ...existing[idx], ...t }; }
          else { existing.push(t); }
          localStorage.setItem(targetKey, JSON.stringify(existing));
        } catch {}
      }
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

  // Cloud sync: PULL → merge → PUSH, then poll every 30s for updates
  const cloudLoadedRef = useRef(false);

  // Reusable pull function — used for initial load + periodic polling
  const pullFromCloud = useCallback(async (isInitial = false) => {
    // Suppress save effects from pushing during poll (prevents stale data overwriting)
    if (!isInitial) suppressPushRef.current = true;
    let localTasks = loadJSON("tasks", []);
    let localProjects = loadJSON("projects", []);
    let localExpenses = loadJSON("expenses", []);
    let cloudHadData = { tasks: false, projects: false };

    try {
      // Poll: only fetch tasks+projects (fast). Initial: fetch everything.
      let data = isInitial
        ? await cloudLoadAll(null, userId)
        : await cloudLoadKeys(null, userId, ["tasks", "projects"]);
      if (data?.length) {
        for (const row of data) {
          if (!row.data) continue;

          // Non-array data (settings, memory, knowledge)
          if (!Array.isArray(row.data)) {
            if (isInitial) {
              if (row.key === "settings" && typeof row.data === "object") {
                setSettingsState(prev => { const m = { ...prev, ...row.data }; persistSettings(m); return m; });
              }
              if (row.key === "memory" && row.data) { setMemory(row.data); saveJSON("memory", row.data); }
              if (row.key === "wory_knowledge" && row.data) { setKnowledge(row.data); saveJSON("wory_knowledge", row.data); }
            }
            continue;
          }
          if (row.data.length === 0) {
            if (row.key === "tasks") {
              cloudHadData.tasks = true;
              const kept = localTasks.filter(t => !t.projectId && !t.assignee);
              if (kept.length !== localTasks.length) {
                localTasks = kept;
                dispatch({ type: "LOAD", tasks: localTasks });
                saveJSON("tasks", localTasks);
              }
            }
            if (row.key === "projects") {
              cloudHadData.projects = true;
              const kept = localProjects.filter(p => !p.members || p.members.length === 0);
              if (kept.length !== localProjects.length) {
                localProjects = kept;
                projDispatch({ type: "PROJ_LOAD", items: localProjects });
                saveJSON("projects", localProjects);
              }
            }
            continue;
          }

          if (row.key === "tasks") {
            cloudHadData.tasks = true;
            const cloudTaskIds = new Set(row.data.map(t => t.id));
            if (localTasks.length === 0) {
              localTasks = row.data;
            } else {
              localTasks = localTasks.filter(t => {
                if (cloudTaskIds.has(t.id)) return true;
                if (!t.projectId && !t.assignee) return true;
                return false;
              });
              for (const ct of row.data) {
                const li = localTasks.findIndex(t => t.id === ct.id);
                if (li >= 0) { localTasks[li] = { ...localTasks[li], ...ct }; }
                else { localTasks.push(ct); }
              }
            }
            dispatch({ type: "LOAD", tasks: localTasks });
            saveJSON("tasks", localTasks);
          }
          if (row.key === "projects") {
            cloudHadData.projects = true;
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
            const cloudIds = new Set(validCloud.map(p => p.id));
            const personalLocal = localProjects.filter(p => !p.members || p.members.length === 0);
            const personalNotInCloud = personalLocal.filter(p => !cloudIds.has(p.id));
            localProjects = [...validCloud, ...personalNotInCloud];
            projDispatch({ type: "PROJ_LOAD", items: localProjects });
            saveJSON("projects", localProjects);
          }
          if (row.key === "expenses" && isInitial) {
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

    // Unsuppress push after poll — delay to let React process dispatches first
    if (!isInitial) {
      setTimeout(() => { suppressPushRef.current = false; }, 3000);
    }

    // On initial load: mark done + push merged data up (only if local had extra data to merge)
    if (isInitial) {
      cloudPullDoneRef.current = true;
      // Only push back if local had data that wasn't in cloud (actual merge happened)
      if (localTasks.length > 0 && !cloudHadData.tasks) {
        cloudSave(null, userId, "tasks", localTasks);
      }
      if (localProjects.length > 0 && !cloudHadData.projects) {
        cloudSave(null, userId, "projects", localProjects);
      }
    }
  }, [cloudId, userId]);

  // Initial cloud pull + periodic polling every 30s
  useEffect(() => {
    if (cloudLoadedRef.current || !cloudId) return;
    cloudLoadedRef.current = true;
    pullFromCloud(true);

    // Poll for new data every 30s (projects + tasks only)
    const pollInterval = setInterval(() => {
      if (cloudPullDoneRef.current) pullFromCloud(false);
    }, 30000);
    return () => clearInterval(pollInterval);
  }, [cloudId, userId, pullFromCloud]);

  // --- Expenses (standalone ledger) ---
  const [expenses, expenseDispatch] = useReducer(expenseReducer, [], () => loadJSON("expenses", []));
  const expLoadedRef = useRef(false);
  useEffect(() => {
    if (!expLoadedRef.current) { expLoadedRef.current = true; return; }
    if (!userKey("").startsWith("wf_")) return;
    saveJSON("expenses", expenses);
    if (cloudId && cloudPullDoneRef.current) {
      scheduleSyncDebounced(null, userId, "expenses", expenses);
    }
  }, [expenses, userId, cloudId]);

  // --- Projects ---
  const [projects, projDispatch] = useReducer(projectReducer, [], () => loadJSON("projects", []));
  const projLoadedRef = useRef(false);
  useEffect(() => {
    if (!projLoadedRef.current) { projLoadedRef.current = true; return; }
    if (!userKey("").startsWith("wf_")) return;
    saveJSON("projects", projects);
    if (cloudId && cloudPullDoneRef.current && !suppressPushRef.current) {
      scheduleSyncDebounced(null, userId, "projects", projects);
    }

    // Cross-user sync: share projects with all members (localStorage only — cloud handled separately)
    if (cloudPullDoneRef.current) {
      const DEV_NAME_MAP = {
        "Nguyen Duy Trinh": "trinh", "Lientran": "lien", "Pham Van Hung": "hung",
        "Tran Thi Mai": "mai", "Le Minh Duc": "duc",
      };
      const currentPrefix = userKey("");
      projects.forEach(proj => {
        if (!proj.members?.length) return;
        proj.members.forEach(m => {
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
    }
  }, [projects, userId, cloudId]);

  // Cross-user CLOUD sync: push projects+tasks to all members' cloud
  const crossSyncTimerRef = useRef(null);
  useEffect(() => {
    if (!cloudId || !cloudPullDoneRef.current) return;
    clearTimeout(crossSyncTimerRef.current);
    crossSyncTimerRef.current = setTimeout(async () => {
      try {
        const DEV_NAME_TO_LOCAL_ID = {
          "Nguyen Duy Trinh": "trinh", "Lientran": "lien", "Pham Van Hung": "hung",
          "Tran Thi Mai": "mai", "Le Minh Duc": "duc",
        };
        // Collect all member localIds that need sync
        const memberTargets = new Set();
        projects.forEach(proj => {
          if (!proj.members?.length) return;
          proj.members.forEach(m => {
            const lid = DEV_NAME_TO_LOCAL_ID[m.name];
            if (lid && lid !== userId) memberTargets.add(lid);
          });
        });
        const tasksByAssignee = crossUserTasksRef.current;
        for (const name of Object.keys(tasksByAssignee)) {
          const lid = DEV_NAME_TO_LOCAL_ID[name];
          if (lid && lid !== userId) memberTargets.add(lid);
        }

        // Sync all members in parallel — load both keys at once per member
        await Promise.all([...memberTargets].map(async (localId) => {
          const memberName = Object.entries(DEV_NAME_TO_LOCAL_ID).find(([,v]) => v === localId)?.[0];
          const memberProjs = projects.filter(p =>
            p.members?.some(m => m.name === memberName || DEV_NAME_TO_LOCAL_ID[m.name] === localId)
          );
          const assigneeTasks = tasksByAssignee[memberName] || [];
          if (!memberProjs.length && !assigneeTasks.length) return;

          // Load both keys in parallel (1 call instead of 2 sequential)
          const [exP, exT] = await Promise.all([
            memberProjs.length ? cloudLoad(null, localId, "projects") : null,
            assigneeTasks.length ? cloudLoad(null, localId, "tasks") : null,
          ]);

          const saves = [];
          if (memberProjs.length) {
            const cP = (exP?.data && Array.isArray(exP.data)) ? exP.data : [];
            let mP = [...cP];
            for (const pr of memberProjs) {
              const i = mP.findIndex(e => e.id === pr.id);
              if (i >= 0) mP[i] = { ...mP[i], ...pr };
              else mP.push(pr);
            }
            saves.push(cloudSave(null, localId, "projects", mP));
          }
          if (assigneeTasks.length) {
            const cT = (exT?.data && Array.isArray(exT.data)) ? exT.data : [];
            let mT = [...cT];
            for (const t of assigneeTasks) {
              const i = mT.findIndex(e => e.id === t.id);
              if (i >= 0) mT[i] = { ...mT[i], ...t };
              else mT.push(t);
            }
            saves.push(cloudSave(null, localId, "tasks", mT));
          }
          await Promise.all(saves);
        }));
      } catch (e) { console.warn("Cross-user cloud sync failed:", e); }
    }, 1000); // 1s debounce — fast enough to complete before user closes app
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
        scheduleSyncDebounced(null, userId, "settings", next);
      }
      return next;
    });
  }, [cloudId]);

  // --- Industry Preset ---
  const applyIndustryPreset = useCallback((presetId, isFirstTime = false) => {
    const preset = INDUSTRY_PRESETS[presetId];
    if (!preset) return;
    setSettings(prev => ({
      ...prev,
      industryPreset: presetId,
      visibleTabs: preset.visibleTabs,
      terminology: preset.terminology || {},
      industryExpenseCategories: preset.expenseCategories || null,
      industryRoles: preset.roles || [],
      customWorkflows: getWorkflowsByIds(preset.defaultWorkflowIds),
      ...preset.settingsOverrides,
    }));
    // Inject Wory knowledge (avoid duplicates)
    if (preset.woryKnowledge?.length) {
      setKnowledge(prev => {
        const existing = prev.entries || [];
        const newEntries = preset.woryKnowledge
          .filter(k => !existing.some(e => e.content === k.content))
          .map(k => ({
            id: Date.now() + Math.random(),
            content: k.content,
            category: k.category,
            source: "industry_preset",
            approved: true,
            createdAt: new Date().toISOString(),
          }));
        if (!newEntries.length) return prev;
        const next = { ...prev, entries: [...existing, ...newEntries] };
        saveKnowledge(next);
        return next;
      });
    }
    // Sample tasks only on first setup
    if (isFirstTime && preset.sampleTasks?.length) {
      preset.sampleTasks.forEach(st => {
        dispatch({ type: "ADD", task: { title: st.title, priority: st.priority || "none", source: "industry_preset" } });
      });
    }
  }, [setSettings, setKnowledge]);

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
    applyIndustryPreset,
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
