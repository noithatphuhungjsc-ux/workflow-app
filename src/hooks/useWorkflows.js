/* ================================================================
   useWorkflows — Workflow templates + steps + departments from Supabase
   Replaces: settings.customWorkflows JSONB + WORKFLOWS hardcode
   ================================================================ */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

/**
 * Load all departments (8 fixed phòng ban).
 * Returns: [{ id, code, name, icon, sort_order, config }]
 */
export function useDepartments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("*")
        .order("sort_order");
      if (error) console.warn("[useDepartments]", error.message);
      setDepartments(data || []);
      setLoading(false);
    })();
  }, []);

  return { departments, loading };
}

/**
 * Workflow templates + their steps with department info.
 * Director can CRUD; staff read-only (RLS enforced server-side).
 */
export function useWorkflows() {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data: templates, error: tplErr } = await supabase
      .from("workflow_templates")
      .select("*")
      .order("sort_order");
    if (tplErr) { console.warn("[useWorkflows] templates", tplErr.message); setLoading(false); return; }

    const { data: steps, error: stepErr } = await supabase
      .from("workflow_steps")
      .select("*")
      .order("sort_order");
    if (stepErr) { console.warn("[useWorkflows] steps", stepErr.message); setLoading(false); return; }

    // Group steps under each template
    const grouped = (templates || []).map(t => ({
      ...t,
      steps: (steps || []).filter(s => s.workflow_id === t.id),
    }));
    setWorkflows(grouped);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createWorkflow = useCallback(async ({ name, description, icon, steps }) => {
    if (!supabase) return null;
    const { data: tpl, error: tplErr } = await supabase
      .from("workflow_templates")
      .insert({ name, description: description || null, icon: icon || null })
      .select()
      .single();
    if (tplErr) { console.warn("[createWorkflow]", tplErr.message); return null; }

    if (steps?.length) {
      const stepRows = steps.map((s, i) => ({
        workflow_id: tpl.id,
        department_id: s.department_id || null,
        name: s.name,
        sort_order: i + 1,
        estimated_days: s.estimated_days || null,
      }));
      const { error: stepErr } = await supabase.from("workflow_steps").insert(stepRows);
      if (stepErr) console.warn("[createWorkflow] steps", stepErr.message);
    }
    await fetchAll();
    return tpl.id;
  }, [fetchAll]);

  const updateWorkflow = useCallback(async (id, { name, description, icon, steps }) => {
    if (!supabase) return false;
    const { error: tplErr } = await supabase
      .from("workflow_templates")
      .update({ name, description: description || null, icon: icon || null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (tplErr) { console.warn("[updateWorkflow]", tplErr.message); return false; }

    // Replace steps: delete old + insert new
    await supabase.from("workflow_steps").delete().eq("workflow_id", id);
    if (steps?.length) {
      const stepRows = steps.map((s, i) => ({
        workflow_id: id,
        department_id: s.department_id || null,
        name: s.name,
        sort_order: i + 1,
        estimated_days: s.estimated_days || null,
      }));
      await supabase.from("workflow_steps").insert(stepRows);
    }
    await fetchAll();
    return true;
  }, [fetchAll]);

  const deleteWorkflow = useCallback(async (id) => {
    if (!supabase) return false;
    const { error } = await supabase.from("workflow_templates").delete().eq("id", id);
    if (error) { console.warn("[deleteWorkflow]", error.message); return false; }
    await fetchAll();
    return true;
  }, [fetchAll]);

  return { workflows, loading, refresh: fetchAll, createWorkflow, updateWorkflow, deleteWorkflow };
}
