/* ================================================================
   useTasks — Supabase-backed task management with realtime
   Replaces: localStorage tasks + cross-user sync hack
   ================================================================ */
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

/* ── camelCase <-> snake_case mapping ── */
function fromDB(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || "(khong tieu de)",
    description: row.description || "",
    status: row.status || "todo",
    priority: row.priority || "none",
    deadline: row.deadline || null,
    category: row.category || "work",
    startTime: row.start_time || null,
    createdAt: row.created_at ? row.created_at.split("T")[0] : new Date().toISOString().split("T")[0],
    updatedAt: row.updated_at || null,
    ownerId: row.owner_id,
    assignee: row.assignee_name || null,
    assigneeId: row.assignee_id || null,
    projectId: row.project_id || null,
    stepIndex: row.step_index ?? null,
    workflow: row.workflow || null,
    workflowStep: row.workflow_step || 0,
    subtasks: row.subtasks || [],
    notes: Array.isArray(row.notes) ? row.notes : [],
    expense: row.expense || null,
    billPhotos: row.bill_photos || [],
    timerState: row.timer_state || "idle",
    timerStart: row.timer_start || null,
    timerTotal: row.timer_total || 0,
    deleteRequest: row.delete_request || null,
    deleted: row.deleted || false,
    deletedAt: row.deleted_at || null,
    step: row.step_index ?? 0,
  };
}

function toDB(data) {
  const row = {};
  if (data.title !== undefined) row.title = data.title;
  if (data.description !== undefined) row.description = data.description;
  if (data.status !== undefined) row.status = data.status;
  if (data.priority !== undefined) row.priority = data.priority;
  if (data.deadline !== undefined) row.deadline = data.deadline || null;
  if (data.category !== undefined) row.category = data.category;
  if (data.startTime !== undefined) row.start_time = data.startTime;
  if (data.assignee !== undefined) row.assignee_name = data.assignee;
  if (data.assigneeId !== undefined) row.assignee_id = data.assigneeId || null;
  if (data.projectId !== undefined) row.project_id = data.projectId || null;
  if (data.stepIndex !== undefined) row.step_index = data.stepIndex;
  if (data.workflow !== undefined) row.workflow = data.workflow;
  if (data.workflowStep !== undefined) row.workflow_step = data.workflowStep;
  if (data.subtasks !== undefined) row.subtasks = data.subtasks;
  if (data.notes !== undefined) row.notes = data.notes;
  if (data.expense !== undefined) row.expense = data.expense;
  if (data.billPhotos !== undefined) row.bill_photos = data.billPhotos;
  if (data.timerState !== undefined) row.timer_state = data.timerState;
  if (data.timerStart !== undefined) row.timer_start = data.timerStart;
  if (data.timerTotal !== undefined) row.timer_total = data.timerTotal;
  if (data.deleteRequest !== undefined) row.delete_request = data.deleteRequest;
  if (data.deleted !== undefined) row.deleted = data.deleted;
  if (data.deletedAt !== undefined) row.deleted_at = data.deletedAt;
  row.updated_at = new Date().toISOString();
  return row;
}

export function useTasksSupabase(userId) {
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  // Fetch all tasks visible to user (RLS handles director/staff filtering)
  const fetchTasks = useCallback(async () => {
    if (!supabase || !userId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("[WF] Fetch tasks error:", error);
      setLoading(false);
      return;
    }
    setAllTasks((data || []).map(fromDB));
    setLoading(false);
  }, [userId]);

  // Initial fetch
  useEffect(() => {
    if (!userId || fetchedRef.current) return;
    fetchedRef.current = true;
    fetchTasks();
  }, [userId, fetchTasks]);

  // Reset when userId changes
  useEffect(() => {
    fetchedRef.current = false;
    setAllTasks([]);
    setLoading(true);
  }, [userId]);

  // Realtime subscription
  useEffect(() => {
    if (!supabase || !userId) return;

    const channel = supabase
      .channel(`tasks-live-${userId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "tasks",
      }, (payload) => {
        if (payload.eventType === "INSERT") {
          const task = fromDB(payload.new);
          setAllTasks(prev => {
            if (prev.some(t => t.id === task.id)) return prev;
            // Remove any temp version
            const cleaned = prev.filter(t => !t._tempFor || t._tempFor !== task.id);
            return [...cleaned, task];
          });
        } else if (payload.eventType === "UPDATE") {
          const task = fromDB(payload.new);
          setAllTasks(prev => prev.map(t => t.id === task.id ? task : t));
        } else if (payload.eventType === "DELETE") {
          setAllTasks(prev => prev.filter(t => t.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // Polling fallback (every 15s)
  useEffect(() => {
    if (!supabase || !userId) return;
    const poll = setInterval(() => {
      if (fetchedRef.current) fetchTasks();
    }, 15000);
    return () => clearInterval(poll);
  }, [userId, fetchTasks]);

  // ── ADD TASK ──
  const addTask = useCallback(async (taskData) => {
    if (!supabase || !userId) return null;

    const newTask = {
      title: taskData.title || "(khong tieu de)",
      status: "todo",
      priority: taskData.priority || "none",
      deadline: taskData.deadline || null,
      category: taskData.category || "work",
      owner_id: userId,
      assignee_id: taskData.assigneeId || null,
      assignee_name: taskData.assignee || null,
      project_id: taskData.projectId || null,
      step_index: taskData.stepIndex ?? null,
      workflow: taskData.workflow || null,
      workflow_step: taskData.workflowStep || 0,
      subtasks: taskData.subtasks || [],
      notes: Array.isArray(taskData.notes)
        ? taskData.notes
        : taskData.notes
          ? [{ id: Date.now(), text: taskData.notes, status: "pending", priority: "normal" }]
          : [],
      expense: taskData.expense || null,
      bill_photos: taskData.billPhotos || [],
      start_time: taskData.startTime || null,
      description: taskData.description || "",
    };

    // Optimistic: add temp task
    const tempId = `temp_${Date.now()}`;
    const optimistic = fromDB({ ...newTask, id: tempId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    optimistic._isTemp = true;
    setAllTasks(prev => [...prev, optimistic]);

    const { data, error } = await supabase.from("tasks").insert(newTask).select().single();

    if (data) {
      const real = fromDB(data);
      setAllTasks(prev => prev.map(t => t.id === tempId ? real : t));
      return real;
    } else {
      console.warn("[WF] Add task error:", error);
      setAllTasks(prev => prev.filter(t => t.id !== tempId));
      return null;
    }
  }, [userId]);

  // ── PATCH TASK ──
  const patchTask = useCallback(async (id, data) => {
    if (!supabase || !id) return;

    // Optimistic update
    setAllTasks(prev => prev.map(t =>
      t.id === id ? { ...t, ...data, updatedAt: new Date().toISOString() } : t
    ));

    const dbData = toDB(data);
    const { error } = await supabase.from("tasks").update(dbData).eq("id", id);

    if (error) {
      console.warn("[WF] Patch task error:", error);
      // Revert by re-fetching
      fetchTasks();
    }
  }, [fetchTasks]);

  // ── SOFT DELETE ──
  const softDelete = useCallback(async (id) => {
    if (!supabase || !id) return;

    setAllTasks(prev => prev.map(t =>
      t.id === id ? { ...t, deleted: true, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : t
    ));

    const { error } = await supabase.from("tasks").update({
      deleted: true,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    if (error) {
      console.warn("[WF] Soft delete error:", error);
      fetchTasks();
    }
  }, [fetchTasks]);

  // ── UNDO DELETE ──
  const undoDelete = useCallback(async (id) => {
    if (!supabase || !id) return;

    setAllTasks(prev => prev.map(t =>
      t.id === id ? { ...t, deleted: false, deletedAt: null, updatedAt: new Date().toISOString() } : t
    ));

    const { error } = await supabase.from("tasks").update({
      deleted: false,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    if (error) fetchTasks();
  }, [fetchTasks]);

  // ── HARD DELETE ──
  const hardDelete = useCallback(async (id) => {
    if (!supabase || !id) return;

    setAllTasks(prev => prev.filter(t => t.id !== id));

    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      console.warn("[WF] Hard delete error:", error);
      fetchTasks();
    }
  }, [fetchTasks]);

  // ── PURGE OLD DELETED (30 days) ──
  useEffect(() => {
    if (!supabase || !userId || loading) return;
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    supabase.from("tasks")
      .delete()
      .eq("deleted", true)
      .lt("deleted_at", cutoff)
      .then(({ error }) => {
        if (error) console.warn("[WF] Purge old deleted:", error);
      });
  }, [userId, loading]);

  return {
    allTasks,
    tasks: allTasks.filter(t => !t.deleted),
    deletedTasks: allTasks.filter(t => t.deleted),
    loading,
    addTask,
    patchTask,
    softDelete,
    undoDelete,
    hardDelete,
    refresh: fetchTasks,
  };
}
