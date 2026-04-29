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

  const refresh = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("departments")
      .select("*")
      .order("sort_order");
    if (error) console.warn("[useDepartments]", error.message);
    setDepartments(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { departments, loading, refresh };
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

/**
 * Profiles grouped by department. Includes mutation helpers for
 * department management (assign/remove members, change role).
 * Returns: { profiles, byDept, refresh, assignMember, removeMember, setRole, loading }
 */
export function useDepartmentProfiles() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_color, department_id, dept_role, is_dept_lead, role")
      .order("dept_role", { ascending: true })
      .order("display_name");
    if (error) console.warn("[useDepartmentProfiles]", error.message);
    setProfiles(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const assignMember = useCallback(async (userId, deptId, dept_role = "staff") => {
    if (!supabase) return false;
    const { error } = await supabase
      .from("profiles")
      .update({
        department_id: deptId,
        dept_role,
        is_dept_lead: dept_role === "lead",
      })
      .eq("id", userId);
    if (error) { console.warn("[assignMember]", error.message); return false; }
    await fetchAll();
    return true;
  }, [fetchAll]);

  const removeMember = useCallback(async (userId) => {
    if (!supabase) return false;
    const { error } = await supabase
      .from("profiles")
      .update({ department_id: null, dept_role: "staff", is_dept_lead: false })
      .eq("id", userId);
    if (error) { console.warn("[removeMember]", error.message); return false; }
    await fetchAll();
    return true;
  }, [fetchAll]);

  const setRole = useCallback(async (userId, dept_role) => {
    if (!supabase) return false;
    const { error } = await supabase
      .from("profiles")
      .update({ dept_role, is_dept_lead: dept_role === "lead" })
      .eq("id", userId);
    if (error) { console.warn("[setRole]", error.message); return false; }
    await fetchAll();
    return true;
  }, [fetchAll]);

  const byDept = new Map();
  for (const p of profiles) {
    if (!p.department_id) continue;
    if (!byDept.has(p.department_id)) byDept.set(p.department_id, []);
    byDept.get(p.department_id).push(p);
  }
  return { profiles, byDept, loading, refresh: fetchAll, assignMember, removeMember, setRole };
}

/**
 * Department CRUD — director only (RLS server-side).
 */
export function useDepartmentCRUD(refresh) {
  const createDept = useCallback(async ({ code, name, icon, sort_order }) => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("departments")
      .insert({ code, name, icon: icon || null, sort_order: sort_order || 99 })
      .select().single();
    if (error) { console.warn("[createDept]", error.message); return null; }
    refresh?.();
    return data;
  }, [refresh]);

  const updateDept = useCallback(async (id, patch) => {
    if (!supabase) return false;
    const { error } = await supabase
      .from("departments")
      .update(patch)
      .eq("id", id);
    if (error) { console.warn("[updateDept]", error.message); return false; }
    refresh?.();
    return true;
  }, [refresh]);

  const deleteDept = useCallback(async (id) => {
    if (!supabase) return false;
    const { error } = await supabase.from("departments").delete().eq("id", id);
    if (error) { console.warn("[deleteDept]", error.message); return false; }
    refresh?.();
    return true;
  }, [refresh]);

  return { createDept, updateDept, deleteDept };
}
