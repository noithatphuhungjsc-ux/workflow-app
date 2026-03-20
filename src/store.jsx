/* ================================================================
   STORE — Context + useReducer for Tasks, Settings, History
   Solves: prop drilling, stale closure, centralized state
   ================================================================ */
import { createContext, useContext, useReducer, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { DEFAULT_SETTINGS, STATUSES, PRIORITIES, getElapsed, fmtMoney, WORKFLOWS, TEAM_ACCOUNTS } from "./constants";
import { INDUSTRY_PRESETS } from "./industryPresets";
import { loadJSON, saveJSON, userKey, loadHistory, saveHistory, addLog, loadMemory, saveMemory, loadSettings, saveSettings as persistSettings, loadKnowledge, saveKnowledge, scheduleSyncDebounced, cloudSave, cloudLoad, cloudLoadAll, cloudLoadKeys, isDataCleared, clearDataClearedFlag } from "./services";

/* Unique ID: crypto-safe, no collisions */
function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Fallback: timestamp + large random
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10) + "-" + Math.random().toString(36).slice(2, 6);
}
function now() { return new Date().toISOString(); }
import { useSupabase } from "./contexts/SupabaseContext";
import { supabase } from "./lib/supabase";

function getWorkflowsByIds(ids) {
  if (!ids?.length) return [];
  return WORKFLOWS.filter(w => ids.includes(w.id));
}

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
        id: action.task.id || uid(),
        createdAt: action.task.createdAt || new Date().toISOString().split("T")[0],
        updatedAt: now(),
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
            ? [{ id: uid(), text: action.task.notes, status: "pending", priority: "normal" }]
            : [],
      }];

    case "ROLL_OVERDUE": {
      // DO NOT overwrite deadline — just flag overdue tasks
      // The original deadline is sacred, never change it automatically
      return state;
    }

    case "SOFT_DELETE":
      return state.map(t =>
        t.id === action.id
          ? { ...t, deleted: true, deletedAt: Date.now(), updatedAt: now() }
          : t
      );

    case "HARD_DELETE":
      return state.filter(t => t.id !== action.id);

    case "UNDO_DELETE":
      return state.map(t =>
        t.id === action.id
          ? { ...t, deleted: false, deletedAt: null, updatedAt: now() }
          : t
      );

    case "PATCH":
      return state.map(t =>
        t.id === action.id ? { ...t, ...action.data, updatedAt: now() } : t
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
    case "EXP_ADD": return [...state, { ...action.item, id: action.item.id || uid(), approval: action.item.approval || "approved", createdAt: action.item.createdAt || now(), updatedAt: now() }];
    case "EXP_PATCH": return state.map(e => e.id === action.id ? { ...e, ...action.data, updatedAt: now() } : e);
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
    case "PROJ_ADD": return [...state, { ...action.item, id: action.item.id || uid(), createdAt: action.item.createdAt || new Date().toISOString().split("T")[0], updatedAt: now() }];
    case "PROJ_PATCH": return state.map(p => p.id === action.id ? { ...p, ...action.data, updatedAt: now() } : p);
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
    // Sanitize: filter out corrupt entries (must have id + title)
    return saved.filter(t => t && typeof t === "object" && (t.title || t.id)).map(t => ({
      deleted: false, deletedAt: null, timerState: "idle", timerStart: null, timerTotal: 0,
      expense: null, billPhotos: [], updatedAt: t.updatedAt || null,
      ...t,
      id: t.id || uid(), // ensure every task has an ID
      title: t.title || "(không tiêu đề)",
      status: STATUSES[t.status] ? t.status : "todo", // fix invalid status
      createdAt: t.createdAt || t.deadline || new Date().toISOString().split("T")[0],
      notes: Array.isArray(t.notes) ? t.notes
        : t.notes ? [{ id: uid(), text: t.notes, status: "pending", priority: "normal" }]
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
    // BLOCK save if data was recently cleared
    if (isDataCleared(userId)) return;
    saveJSON("tasks", allTasks);
    // Push to cloud — but suppress during/after poll to prevent stale data overwriting
    if (cloudId && cloudPullDoneRef.current && !suppressPushRef.current) {
      // Purge tasks deleted > 30 days before pushing to cloud
      const PURGE_MS = 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const cloudTasks = allTasks.filter(t => !(t.deleted && t.deletedAt && (now - t.deletedAt > PURGE_MS)));
      scheduleSyncDebounced(null, userId, "tasks", cloudTasks);
    }

    // Cross-user sync: copy assigned/project tasks to members' localStorage + cloud
    // ALSO sync tasks with pending deleteRequest to director for approval
    const DEV_NAME_TO_ID = {
      "Nguyen Duy Trinh": "trinh", "Lientran": "lien", "Pham Van Hung": "hung",
      "Tran Thi Mai": "mai", "Le Minh Duc": "duc",
    };
    const DIRECTOR_ID = "trinh";
    const currentPrefix = userKey("");

    // Build project→members map from current projects state (read from localStorage if projects not yet available)
    const projMemberMap = {};
    try {
      const currentProjects = JSON.parse(localStorage.getItem(userKey("projects")) || "[]");
      currentProjects.forEach(proj => {
        if (!proj.members?.length) return;
        projMemberMap[proj.id] = proj.members.map(m => DEV_NAME_TO_ID[m.name]).filter(Boolean);
      });
    } catch {}

    // Group tasks by target user for cloud sync
    const tasksByAssignee = {};

    // Helper: sync a task to a specific target user's localStorage
    const syncTaskToLocal = (targetId, syncTask) => {
      const targetKey = `wf_${targetId}_tasks`;
      if (targetKey === currentPrefix + "tasks") return;
      if (isDataCleared(targetId)) return;
      if (!cloudPullDoneRef.current) return;
      try {
        const existing = JSON.parse(localStorage.getItem(targetKey) || "[]");
        const idx = existing.findIndex(e => e.id === syncTask.id);
        if (idx >= 0) {
          const localTime = existing[idx].updatedAt ? new Date(existing[idx].updatedAt).getTime() : 0;
          const srcTime = syncTask.updatedAt ? new Date(syncTask.updatedAt).getTime() : 0;
          if (srcTime >= localTime) existing[idx] = { ...existing[idx], ...syncTask };
        } else {
          existing.push(syncTask);
        }
        localStorage.setItem(targetKey, JSON.stringify(existing));
      } catch (e) { console.warn("[WF] Cross-user task sync:", e.message); }
    };

    allTasks.filter(t => !t.deleted).forEach(t => {
      // 1. Assigned tasks → sync to assignee
      if (t.assignee) {
        const targetId = DEV_NAME_TO_ID[t.assignee];
        if (targetId) {
          syncTaskToLocal(targetId, t);
          const syncName = t.assignee;
          if (!tasksByAssignee[syncName]) tasksByAssignee[syncName] = [];
          tasksByAssignee[syncName].push(t);
        }
      }
      // 2. Project tasks → sync to ALL project members (not just assignee)
      if (t.projectId && projMemberMap[t.projectId]) {
        const members = projMemberMap[t.projectId];
        members.forEach(targetId => {
          if (targetId === userId) return;
          syncTaskToLocal(targetId, t);
          // Also collect for cloud sync
          const syncName = Object.entries(DEV_NAME_TO_ID).find(([,v]) => v === targetId)?.[0];
          if (syncName) {
            if (!tasksByAssignee[syncName]) tasksByAssignee[syncName] = [];
            // Avoid duplicates (task might be both assigned + in project)
            if (!tasksByAssignee[syncName].some(existing => existing.id === t.id)) {
              tasksByAssignee[syncName].push(t);
            }
          }
        });
      }
      // 3. Delete request sync: staff tasks with pending deleteRequest → sync to director
      if (t.deleteRequest?.status === "pending" && userId !== DIRECTOR_ID && !t.assignee && !t.projectId) {
        const syncTask = { ...t, _sourceUserId: userId };
        syncTaskToLocal(DIRECTOR_ID, syncTask);
        if (!tasksByAssignee["Nguyen Duy Trinh"]) tasksByAssignee["Nguyen Duy Trinh"] = [];
        tasksByAssignee["Nguyen Duy Trinh"].push(t);
      }
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
    // BLOCK pull if data was just cleared (prevents cloud restoring deleted data)
    if (isDataCleared(userId)) {
      console.info("[WF] Pull blocked — data recently cleared for", userId);
      return;
    }
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
        : await cloudLoadKeys(null, userId, ["tasks", "projects", "expenses"]);
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
            // Merge deleted_projects from cloud (any time, not just initial)
            if (row.key === "deleted_projects" && Array.isArray(row.data)) {
              row.data.forEach(id => deletedProjectIdsRef.current.add(id));
              try { localStorage.setItem(userKey("deleted_projects"), JSON.stringify([...deletedProjectIdsRef.current])); } catch {}
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
            const PURGE_MS = 30 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            // Filter out cloud tasks that are permanently expired (deleted > 30 days)
            const cleanCloud = row.data.filter(t => !(t.deleted && t.deletedAt && (now - t.deletedAt > PURGE_MS)));
            const cloudTaskIds = new Set(cleanCloud.map(t => t.id));
            // Build set of locally-deleted task ids (to prevent cloud from restoring them)
            const localDeletedIds = new Set(localTasks.filter(t => t.deleted).map(t => t.id));
            if (localTasks.length === 0) {
              localTasks = cleanCloud;
            } else {
              localTasks = localTasks.filter(t => {
                if (cloudTaskIds.has(t.id)) return true;
                if (!t.projectId && !t.assignee) return true;
                return false;
              });
              for (const ct of cleanCloud) {
                const li = localTasks.findIndex(t => t.id === ct.id);
                if (li >= 0) {
                  const local = localTasks[li];
                  // If local says deleted, keep deleted state (don't let cloud restore)
                  if (localDeletedIds.has(ct.id)) {
                    localTasks[li] = { ...local, ...ct, deleted: true, deletedAt: local.deletedAt };
                  } else if (ct.deleted) {
                    // Cloud says deleted — respect it
                    localTasks[li] = { ...local, ...ct };
                  } else {
                    // LAST-WRITE-WINS: compare updatedAt, keep the newer version
                    const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
                    const cloudTime = ct.updatedAt ? new Date(ct.updatedAt).getTime() : 0;
                    localTasks[li] = cloudTime >= localTime ? { ...local, ...ct } : { ...ct, ...local };
                  }
                } else if (!localDeletedIds.has(ct.id)) {
                  localTasks.push(ct);
                }
              }
              // Purge local tasks deleted > 30 days
              localTasks = localTasks.filter(t => !(t.deleted && t.deletedAt && (now - t.deletedAt > PURGE_MS)));
            }
            dispatch({ type: "LOAD", tasks: localTasks });
            saveJSON("tasks", localTasks);
          }
          if (row.key === "projects") {
            cloudHadData.projects = true;
            const sess = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}"); } catch { return {}; } })();
            const myNames = [sess.name, sess.id].filter(Boolean).map(n => (n || "").toLowerCase().replace(/\s+/g, ""));
            const deletedProjIds = deletedProjectIdsRef.current;
            const validCloud = row.data.filter(p => {
              // Skip projects that were locally deleted
              if (deletedProjIds.has(p.id)) return false;
              if (!p.members || p.members.length === 0) return true;
              return p.members.some(m => {
                if (m.supaId && m.supaId === cloudId) return true;
                const mn = (m.name || "").toLowerCase().replace(/\s+/g, "");
                return myNames.includes(mn);
              });
            });
            const cloudIds = new Set(validCloud.map(p => p.id));
            const personalLocal = localProjects.filter(p => !p.members || p.members.length === 0);
            const personalNotInCloud = personalLocal.filter(p => !cloudIds.has(p.id) && !deletedProjIds.has(p.id));
            localProjects = [...validCloud, ...personalNotInCloud];
            projDispatch({ type: "PROJ_LOAD", items: localProjects });
            saveJSON("projects", localProjects);
          }
          if (row.key === "expenses") {
            if (localExpenses.length === 0) {
              localExpenses = row.data;
            } else {
              // Merge: last-write-wins by updatedAt, add new items
              const localMap = new Map(localExpenses.map(e => [e.id, e]));
              for (const ce of row.data) {
                const le = localMap.get(ce.id);
                if (le) {
                  const lt = le.updatedAt ? new Date(le.updatedAt).getTime() : 0;
                  const ct = ce.updatedAt ? new Date(ce.updatedAt).getTime() : 0;
                  if (ct > lt) localMap.set(ce.id, ce);
                } else {
                  localMap.set(ce.id, ce);
                }
              }
              localExpenses = [...localMap.values()];
            }
            expenseDispatch({ type: "EXP_LOAD", items: localExpenses });
            saveJSON("expenses", localExpenses);
          }
        }
      }
    } catch (e) { console.warn("Cloud pull failed:", e); }

    // Unsuppress push after poll — use microtask to wait for React to process dispatches
    if (!isInitial) {
      // Wait for React to flush state updates from LOAD dispatches, then unsuppress
      requestAnimationFrame(() => { suppressPushRef.current = false; });
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

    // Poll for new data every 10s (projects + tasks only) — faster sync for collaboration
    const pollInterval = setInterval(() => {
      if (cloudPullDoneRef.current) pullFromCloud(false);
    }, 10000);

    // Realtime: subscribe to user_data changes for instant sync (when another user pushes to our cloud)
    let realtimeChannel = null;
    if (supabase) {
      realtimeChannel = supabase
        .channel(`user-data-${userId}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "user_data",
          filter: `user_id=eq.${cloudId}`,
        }, () => {
          // Another user pushed data to our cloud → pull immediately
          if (cloudPullDoneRef.current) pullFromCloud(false);
        })
        .subscribe();
    }

    return () => {
      clearInterval(pollInterval);
      if (realtimeChannel && supabase) supabase.removeChannel(realtimeChannel);
    };
  }, [cloudId, userId, pullFromCloud]);

  // --- Expenses (standalone ledger) ---
  const [expenses, expenseDispatch] = useReducer(expenseReducer, [], () => loadJSON("expenses", []));
  const expLoadedRef = useRef(false);
  useEffect(() => {
    if (!expLoadedRef.current) { expLoadedRef.current = true; return; }
    if (!userKey("").startsWith("wf_")) return;
    // BLOCK save if data was recently cleared
    if (isDataCleared(userId)) return;
    saveJSON("expenses", expenses);
    if (cloudId && cloudPullDoneRef.current) {
      scheduleSyncDebounced(null, userId, "expenses", expenses);
    }
  }, [expenses, userId, cloudId]);

  // --- Projects ---
  const [projects, projDispatch] = useReducer(projectReducer, [], () => loadJSON("projects", []));
  const deletedProjectIdsRef = useRef(new Set(JSON.parse(localStorage.getItem(userKey("deleted_projects")) || "[]")));
  const projLoadedRef = useRef(false);
  useEffect(() => {
    if (!projLoadedRef.current) { projLoadedRef.current = true; return; }
    if (!userKey("").startsWith("wf_")) return;
    // BLOCK save if data was recently cleared
    if (isDataCleared(userId)) return;
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
          if (isDataCleared(devId)) return;
          const targetKey = `wf_${devId}_projects`;
          try {
            const existing = JSON.parse(localStorage.getItem(targetKey) || "[]");
            const idx = existing.findIndex(e => e.id === proj.id);
            if (idx >= 0) {
              // Last-write-wins
              const existTime = existing[idx].updatedAt ? new Date(existing[idx].updatedAt).getTime() : 0;
              const srcTime = proj.updatedAt ? new Date(proj.updatedAt).getTime() : 0;
              if (srcTime >= existTime) existing[idx] = { ...existing[idx], ...proj };
            } else {
              existing.push(proj);
            }
            localStorage.setItem(targetKey, JSON.stringify(existing));
          } catch (e) { console.warn("[WF] Cross-user project sync:", e.message); }
        });
      });
    }
  }, [projects, userId, cloudId]);

  // Cross-user CLOUD sync: push projects+tasks to all members' cloud (bidirectional)
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
        // Build project→members map for reverse sync
        const projMemberMap = {};
        projects.forEach(proj => {
          if (!proj.members?.length) return;
          projMemberMap[proj.id] = proj.members.map(m => DEV_NAME_TO_LOCAL_ID[m.name]).filter(Boolean);
        });

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

        // Reverse sync: collect project tasks that current user modified → push to other members
        const myProjectTasks = allTasks.filter(t => t.projectId && projMemberMap[t.projectId]);
        const reverseTasksByMember = {};
        myProjectTasks.forEach(t => {
          const members = projMemberMap[t.projectId] || [];
          members.forEach(lid => {
            if (lid === userId) return;
            memberTargets.add(lid);
            if (!reverseTasksByMember[lid]) reverseTasksByMember[lid] = [];
            reverseTasksByMember[lid].push(t);
          });
        });

        // Sync all members in parallel — load both keys at once per member
        // Filter out members whose data was recently cleared
        const activeTargets = [...memberTargets].filter(lid => !isDataCleared(lid));
        await Promise.all(activeTargets.map(async (localId) => {
          const memberName = Object.entries(DEV_NAME_TO_LOCAL_ID).find(([,v]) => v === localId)?.[0];
          const memberProjs = projects.filter(p =>
            p.members?.some(m => m.name === memberName || DEV_NAME_TO_LOCAL_ID[m.name] === localId)
          );
          const assigneeTasks = tasksByAssignee[memberName] || [];
          const reverseTasks = reverseTasksByMember[localId] || [];
          const allSyncTasks = [...assigneeTasks];
          // Merge reverse tasks (avoid duplicates)
          const syncIds = new Set(allSyncTasks.map(t => t.id));
          reverseTasks.forEach(t => { if (!syncIds.has(t.id)) allSyncTasks.push(t); });
          if (!memberProjs.length && !allSyncTasks.length) return;

          // Load both keys in parallel (1 call instead of 2 sequential)
          const [exP, exT] = await Promise.all([
            memberProjs.length ? cloudLoad(null, localId, "projects") : null,
            allSyncTasks.length ? cloudLoad(null, localId, "tasks") : null,
          ]);

          const saves = [];
          if (memberProjs.length) {
            const cP = (exP?.data && Array.isArray(exP.data)) ? exP.data : [];
            let mP = [...cP];
            for (const pr of memberProjs) {
              const i = mP.findIndex(e => e.id === pr.id);
              if (i >= 0) {
                // Last-write-wins
                const existTime = mP[i].updatedAt ? new Date(mP[i].updatedAt).getTime() : 0;
                const srcTime = pr.updatedAt ? new Date(pr.updatedAt).getTime() : 0;
                if (srcTime >= existTime) mP[i] = { ...mP[i], ...pr };
              }
              else mP.push(pr);
            }
            saves.push(cloudSave(null, localId, "projects", mP));
          }
          if (allSyncTasks.length) {
            const cT = (exT?.data && Array.isArray(exT.data)) ? exT.data : [];
            let mT = [...cT];
            for (const t of allSyncTasks) {
              const i = mT.findIndex(e => e.id === t.id);
              if (i >= 0) {
                const existTime = mT[i].updatedAt ? new Date(mT[i].updatedAt).getTime() : 0;
                const srcTime = t.updatedAt ? new Date(t.updatedAt).getTime() : 0;
                if (srcTime >= existTime) mT[i] = { ...mT[i], ...t };
              }
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
  const deleteProject = useCallback((id) => {
    projDispatch({ type: "PROJ_DELETE", id });
    // Cascade: unlink tasks from deleted project (clear projectId so they become standalone)
    allTasks.filter(t => t.projectId === id && !t.deleted).forEach(t => {
      dispatch({ type: "PATCH", id: t.id, data: { projectId: null, updatedAt: new Date().toISOString() } });
    });
    // Track deleted project ID to prevent cloud restore
    deletedProjectIdsRef.current.add(id);
    const deletedList = [...deletedProjectIdsRef.current];
    try { localStorage.setItem(userKey("deleted_projects"), JSON.stringify(deletedList)); } catch {}
    // Immediately push updated projects + deleted list to cloud (bypass debounce)
    if (cloudId && cloudPullDoneRef.current) {
      const updated = loadJSON("projects", []).filter(p => p.id !== id);
      saveJSON("projects", updated);
      cloudSave(null, userId, "projects", updated);
      cloudSave(null, userId, "deleted_projects", deletedList);
    }
  }, [cloudId, userId, allTasks]);

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
  const [settings, setSettingsState] = useState(() => {
    const s = loadSettings(DEFAULT_SETTINGS);
    // Auto-migrate old role names → new role system (use TEAM_ACCOUNTS as source of truth)
    const sess = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}"); } catch { return {}; } })();
    const acc = TEAM_ACCOUNTS.find(a => a.id === sess.id);
    if (acc) {
      // Migrate session role if outdated
      if (sess.role !== acc.role) {
        sess.role = acc.role; sess.title = acc.title;
        try { localStorage.setItem("wf_session", JSON.stringify(sess)); } catch {}
      }
      // Migrate settings userRole
      const correctRole = acc.role === "director" ? "director" : "staff";
      if (s.userRole !== correctRole) { s.userRole = correctRole; persistSettings(s); }
    }
    return s;
  });
  const setSettings = useCallback((updater) => {
    setSettingsState(prev => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      // Protect: director role cannot be downgraded by settings changes
      const sess = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}"); } catch { return {}; } })();
      const acc = TEAM_ACCOUNTS.find(a => a.id === sess.id);
      if (acc?.role === "director") next.userRole = "director";
      persistSettings(next);
      if (cloudId) {
        scheduleSyncDebounced(null, userId, "settings", next);
      }
      return next;
    });
  }, [cloudId]);

  // --- Expense (needs settings) ---
  const addExpense = useCallback((item) => {
    const role = settings.userIndustryRole || settings.userRole;
    const needsApproval = role !== "director" && role !== "owner";
    const expenseItem = { ...item, approval: item.approval || (needsApproval ? "pending" : "approved"), createdBy: settings.displayName || "" };
    expenseDispatch({ type: "EXP_ADD", item: expenseItem });
    log("expense", item.description || "Chi tiêu", fmtMoney(item.amount));
  }, [settings]);

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
    // Sample tasks only on first setup — skip if data was just cleared
    if (isFirstTime && preset.sampleTasks?.length && !isDataCleared(userId)) {
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
    // Clear "just cleared" flag — user is working again
    clearDataClearedFlag(userId);
    dispatch({ type: "ADD", task: taskData });
    log("add", taskData.title || "Cong viec moi");
  }, [log, userId]);

  const deleteTask = useCallback((id) => {
    clearDataClearedFlag(userId);
    const t = allTasks.find(x => x.id === id);
    dispatch({ type: "SOFT_DELETE", id });
    log("delete", t?.title || "?");

    // If director approves a deleteRequest from another user, sync deletion back to source
    if (t?._sourceUserId && t._sourceUserId !== userId) {
      const syncReverseDeletion = async (retries = 2) => {
        try {
          const srcKey = `wf_${t._sourceUserId}_tasks`;
          const srcTasks = JSON.parse(localStorage.getItem(srcKey) || "[]");
          const updated = srcTasks.map(st =>
            st.id === id ? { ...st, deleted: true, deletedAt: Date.now(), updatedAt: new Date().toISOString() } : st
          );
          localStorage.setItem(srcKey, JSON.stringify(updated));
          await cloudSave(null, t._sourceUserId, "tasks", updated);
        } catch (e) {
          console.warn("[WF] Reverse delete sync failed:", e.message);
          if (retries > 0) setTimeout(() => syncReverseDeletion(retries - 1), 3000);
        }
      };
      syncReverseDeletion();
    }

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
    clearDataClearedFlag(userId);
    dispatch({ type: "PATCH", id, data });
    const t = allTasks.find(x => x.id === id);
    if (data.status) log("status", t?.title || "?", STATUSES[data.status]?.label || data.status);
    if (data.timerState) log("timer", t?.title || "?", data.timerState === "running" ? "Bắt đầu" : data.timerState === "paused" ? "Tạm dừng" : "Hoàn thành");

    // If director rejects deleteRequest, sync back to source user
    if (data.deleteRequest === null && t?._sourceUserId && t._sourceUserId !== userId) {
      try {
        const srcKey = `wf_${t._sourceUserId}_tasks`;
        const srcTasks = JSON.parse(localStorage.getItem(srcKey) || "[]");
        const updated = srcTasks.map(st =>
          st.id === id ? { ...st, deleteRequest: null, updatedAt: new Date().toISOString() } : st
        );
        localStorage.setItem(srcKey, JSON.stringify(updated));
        cloudSave(null, t._sourceUserId, "tasks", updated).catch(() => {});
      } catch (e) { console.warn("[WF] Reverse reject sync:", e.message); }
    }
  }, [allTasks, log, userId]);

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

  const value = useMemo(() => ({
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
  }), [tasks, allTasks, deletedTasks, expenses, projects, timerTick, history, memory, knowledge, pendingKnowledge, undoToast, settings, userId,
    dispatch, addTask, deleteTask, undoDelete, hardDelete, patchTask, addExpense, patchExpense, deleteExpense,
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
