/* ================================================================
   STORE — Context + Supabase hooks for Tasks, Projects, Settings
   v39: Full redesign — Supabase tables, no cross-user localStorage
   ================================================================ */
import React, { createContext, useContext, useReducer, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { DEFAULT_SETTINGS, STATUSES, PRIORITIES, getElapsed, fmtMoney, WORKFLOWS, TEAM_ACCOUNTS } from "./constants";
import { INDUSTRY_PRESETS } from "./industryPresets";
import { loadJSON, saveJSON, userKey, loadHistory, saveHistory, loadMemory, saveMemory, loadSettings, saveSettings as persistSettings, loadKnowledge, saveKnowledge, scheduleSyncDebounced, cloudSave } from "./services";
import { notifyTaskAssigned, notifyTaskStatusChange } from "./utils/pushNotify";
import { useSupabase } from "./contexts/SupabaseContext";
import { useTasksSupabase } from "./hooks/useTasks";
import { useProjectsSupabase } from "./hooks/useProjects";

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10) + "-" + Math.random().toString(36).slice(2, 6);
}

function getWorkflowsByIds(ids) {
  if (!ids?.length) return [];
  return WORKFLOWS.filter(w => ids.includes(w.id));
}

/* ================================================================
   EXPENSE REDUCER — standalone expense ledger (stays in localStorage + cloud)
   ================================================================ */
function expenseReducer(state, action) {
  switch (action.type) {
    case "EXP_LOAD": return action.items;
    case "EXP_ADD": return [...state, { ...action.item, id: action.item.id || uid(), approval: action.item.approval || "approved", createdAt: action.item.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }];
    case "EXP_PATCH": return state.map(e => e.id === action.id ? { ...e, ...action.data, updatedAt: new Date().toISOString() } : e);
    case "EXP_DELETE": return state.filter(e => e.id !== action.id);
    default: return state;
  }
}

/* ================================================================
   CONTEXTS
   ================================================================ */
const TaskContext = createContext(null);
const SettingsCtx = createContext(null);

/* ================================================================
   APP PROVIDER — orchestrates all state
   ================================================================ */
export function AppProvider({ children, userId }) {
  const { session, loading: supaLoading } = useSupabase();
  const cloudId = session?.user?.id || (!supaLoading ? userId : null);

  // ── TASKS (Supabase table) ──
  const tasksHook = useTasksSupabase(cloudId);
  const { allTasks, tasks, deletedTasks, loading: tasksLoading } = tasksHook;

  // ── PROJECTS (Supabase table) ──
  const projectsHook = useProjectsSupabase(cloudId);
  const { projects, loading: projectsLoading } = projectsHook;

  // ── EXPENSES (localStorage + cloud — stays as-is) ──
  const [expenses, expenseDispatch] = useReducer(expenseReducer, [], () => loadJSON("expenses", []));
  const expLoadedRef = useRef(false);
  useEffect(() => {
    if (!expLoadedRef.current) { expLoadedRef.current = true; return; }
    if (!userKey("").startsWith("wf_")) return;
    saveJSON("expenses", expenses);
    if (cloudId) {
      scheduleSyncDebounced(null, userId, "expenses", expenses);
    }
  }, [expenses, userId, cloudId]);

  // Cloud pull for expenses + settings + memory + knowledge (non-task data)
  const cloudLoadedRef = useRef(false);
  useEffect(() => {
    if (cloudLoadedRef.current || !cloudId) return;
    cloudLoadedRef.current = true;
    (async () => {
      try {
        const { cloudLoadAll } = await import("./services");
        const data = await cloudLoadAll(null, userId);
        if (!data?.length) return;
        for (const row of data) {
          if (!row.data) continue;
          if (row.key === "expenses" && Array.isArray(row.data) && row.data.length > 0) {
            const localExp = loadJSON("expenses", []);
            if (localExp.length === 0) {
              expenseDispatch({ type: "EXP_LOAD", items: row.data });
              saveJSON("expenses", row.data);
            } else {
              // Merge: last-write-wins
              const map = new Map(localExp.map(e => [e.id, e]));
              for (const ce of row.data) {
                const le = map.get(ce.id);
                if (le) {
                  const lt = le.updatedAt ? new Date(le.updatedAt).getTime() : 0;
                  const ct = ce.updatedAt ? new Date(ce.updatedAt).getTime() : 0;
                  if (ct > lt) map.set(ce.id, ce);
                } else {
                  map.set(ce.id, ce);
                }
              }
              const merged = [...map.values()];
              expenseDispatch({ type: "EXP_LOAD", items: merged });
              saveJSON("expenses", merged);
            }
          }
          if (row.key === "settings" && typeof row.data === "object" && !Array.isArray(row.data)) {
            setSettingsState(prev => { const m = { ...prev, ...row.data }; persistSettings(m); return m; });
          }
          if (row.key === "memory" && row.data) { setMemory(row.data); saveJSON("memory", row.data); }
          if (row.key === "wory_knowledge" && row.data) { setKnowledge(row.data); saveJSON("wory_knowledge", row.data); }
        }
      } catch (e) { console.warn("Cloud pull failed:", e); }
    })();
  }, [cloudId, userId]);

  // ── HISTORY ──
  const [history, setHistory] = useState(loadHistory);
  const log = useCallback((action, title, detail = "") => {
    setHistory(prev => {
      const entry = { id: Date.now(), ts: new Date().toISOString(), action, taskTitle: title, detail };
      const next = [...prev, entry];
      saveHistory(next);
      return next;
    });
  }, []);

  // ── MEMORY ──
  const [memory, setMemory] = useState(loadMemory);

  // ── KNOWLEDGE (Wory Training) ──
  const [knowledge, setKnowledge] = useState(() => loadKnowledge());
  const pendingKnowledge = knowledge.entries ? knowledge.entries.filter(e => !e.approved) : [];

  // ── SETTINGS ──
  const [settings, setSettingsState] = useState(() => {
    const s = loadSettings(DEFAULT_SETTINGS);
    const sess = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}"); } catch { return {}; } })();
    const acc = TEAM_ACCOUNTS.find(a => a.id === sess.id);
    if (acc) {
      if (sess.role !== acc.role) {
        sess.role = acc.role; sess.title = acc.title;
        try { localStorage.setItem("wf_session", JSON.stringify(sess)); } catch {}
      }
      const correctRole = acc.role === "director" ? "director" : "staff";
      if (s.userRole !== correctRole) { s.userRole = correctRole; persistSettings(s); }
    }
    return s;
  });

  const setSettings = useCallback((updater) => {
    setSettingsState(prev => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      const sess = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}"); } catch { return {}; } })();
      const acc = TEAM_ACCOUNTS.find(a => a.id === sess.id);
      if (acc?.role === "director") next.userRole = "director";
      persistSettings(next);
      if (cloudId) {
        scheduleSyncDebounced(null, userId, "settings", next);
      }
      return next;
    });
  }, [cloudId, userId]);

  // ── EXPENSE (needs settings for approval check) ──
  const addExpense = useCallback((item) => {
    const role = settings.userIndustryRole || settings.userRole;
    const needsApproval = role !== "director" && role !== "owner";
    const expenseItem = { ...item, approval: item.approval || (needsApproval ? "pending" : "approved"), createdBy: settings.displayName || "" };
    expenseDispatch({ type: "EXP_ADD", item: expenseItem });
    log("expense", item.description || "Chi tieu", fmtMoney(item.amount));
  }, [settings, log]);

  const patchExpense = useCallback((id, data) => { expenseDispatch({ type: "EXP_PATCH", id, data }); }, []);
  const deleteExpense = useCallback((id) => { expenseDispatch({ type: "EXP_DELETE", id }); }, []);

  // ── INDUSTRY PRESET ──
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
    if (preset.woryKnowledge?.length) {
      setKnowledge(prev => {
        const existing = prev.entries || [];
        const newEntries = preset.woryKnowledge
          .filter(k => !existing.some(e => e.content === k.content))
          .map(k => ({
            id: uid(),
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
    if (isFirstTime && preset.sampleTasks?.length) {
      preset.sampleTasks.forEach(st => {
        tasksHook.addTask({ title: st.title, priority: st.priority || "none", source: "industry_preset" });
      });
    }
  }, [setSettings, setKnowledge, tasksHook.addTask]);

  // ── UNDO TOAST ──
  const [undoToast, setUndoToast] = useState(null);
  const undoTimerRef = useRef(null);

  // ── WRAPPED TASK ACTIONS (add logging + business logic) ──
  const addTask = useCallback((taskData) => {
    tasksHook.addTask(taskData);
    log("add", taskData.title || "Cong viec moi");
  }, [tasksHook.addTask, log]);

  const patchTask = useCallback((id, data) => {
    tasksHook.patchTask(id, data);
    const t = allTasks.find(x => x.id === id);
    if (data.status) log("status", t?.title || "?", STATUSES[data.status]?.label || data.status);
    if (data.timerState) log("timer", t?.title || "?", data.timerState === "running" ? "Bat dau" : data.timerState === "paused" ? "Tam dung" : "Hoan thanh");

    // Push notifications (non-blocking)
    const myName = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}").name || ""; } catch { return ""; } })();
    const myId = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}").id || ""; } catch { return ""; } })();

    // Notify assignee when task is assigned to them
    if (data.assignee_id && data.assignee_id !== myId && data.assignee_id !== t?.assignee_id) {
      notifyTaskAssigned(data.assignee_id, t?.title || data.title || "Công việc", myName);
    }

    // Notify owner when assignee changes status
    if (data.status && t?.owner_id && t.owner_id !== myId) {
      notifyTaskStatusChange(t.owner_id, t.title || "Công việc", data.status, myName);
    }
    // Notify assignee when owner changes status
    if (data.status && t?.assignee_id && t.assignee_id !== myId) {
      notifyTaskStatusChange(t.assignee_id, t.title || "Công việc", data.status, myName);
    }
  }, [tasksHook.patchTask, allTasks, log]);

  const deleteTask = useCallback((id) => {
    const t = allTasks.find(x => x.id === id);
    tasksHook.softDelete(id);
    log("delete", t?.title || "?");

    clearTimeout(undoTimerRef.current);
    setUndoToast({ id, title: t?.title || "Cong viec" });
    undoTimerRef.current = setTimeout(() => setUndoToast(null), 5000);
  }, [allTasks, tasksHook.softDelete, log]);

  const undoDeleteTask = useCallback(() => {
    if (!undoToast) return;
    tasksHook.undoDelete(undoToast.id);
    setUndoToast(null);
    clearTimeout(undoTimerRef.current);
  }, [undoToast, tasksHook.undoDelete]);

  const hardDelete = useCallback((id) => {
    tasksHook.hardDelete(id);
  }, [tasksHook.hardDelete]);

  // ── WRAPPED PROJECT ACTIONS ──
  const addProject = useCallback(async (projData) => {
    return await projectsHook.addProject(projData);
  }, [projectsHook.addProject]);

  const patchProject = useCallback((id, data) => {
    projectsHook.patchProject(id, data);
  }, [projectsHook.patchProject]);

  const deleteProject = useCallback((id) => {
    // Cascade: unlink tasks from deleted project
    allTasks.filter(t => t.projectId === id && !t.deleted).forEach(t => {
      tasksHook.patchTask(t.id, { projectId: null });
    });
    projectsHook.deleteProject(id);
  }, [allTasks, tasksHook.patchTask, projectsHook.deleteProject]);

  // ── TIMER ACTIONS ──
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

  // Timer tick (re-render trigger)
  const [timerTick, setTimerTick] = useState(0);
  useEffect(() => {
    const hasRunning = tasks.some(t => t.timerState === "running");
    if (!hasRunning) return;
    const iv = setInterval(() => setTimerTick(k => k + 1), 1000);
    return () => clearInterval(iv);
  }, [tasks]);

  // ── CONTEXT VALUE ──
  const value = useMemo(() => ({
    tasks,
    allTasks,
    deletedTasks,
    addTask,
    deleteTask,
    undoDelete: undoDeleteTask,
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
    tasksLoading: tasksLoading || projectsLoading,
  }), [tasks, allTasks, deletedTasks, expenses, projects, timerTick, history, memory, knowledge, pendingKnowledge, undoToast, settings, userId, tasksLoading, projectsLoading,
    addTask, deleteTask, undoDeleteTask, hardDelete, patchTask, addExpense, patchExpense, deleteExpense,
    addProject, patchProject, deleteProject, timerStart, timerPause, timerResume, timerDone,
    setHistory, log, setMemory, setKnowledge, setUndoToast, setSettings, applyIndustryPreset]);

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
