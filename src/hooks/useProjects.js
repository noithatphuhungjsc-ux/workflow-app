/* ================================================================
   useProjects — Supabase-backed project management with realtime
   Replaces: localStorage projects + cross-user sync hack
   ================================================================ */
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

function fromDB(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    color: row.color || "#6a7fd4",
    description: row.description || "",
    status: row.status || "active",
    deadline: row.deadline || null,
    workflow: row.workflow || null,
    steps: row.steps || [],
    members: row.members || [],
    chatId: row.chat_id || null,
    ownerId: row.owner_id,
    createdAt: row.created_at ? row.created_at.split("T")[0] : new Date().toISOString().split("T")[0],
    updatedAt: row.updated_at || null,
  };
}

function toDB(data) {
  const row = {};
  if (data.name !== undefined) row.name = data.name;
  if (data.color !== undefined) row.color = data.color;
  if (data.description !== undefined) row.description = data.description;
  if (data.status !== undefined) row.status = data.status;
  if (data.deadline !== undefined) row.deadline = data.deadline || null;
  if (data.workflow !== undefined) row.workflow = data.workflow;
  if (data.steps !== undefined) row.steps = data.steps;
  if (data.members !== undefined) row.members = data.members;
  if (data.chatId !== undefined) row.chat_id = data.chatId;
  row.updated_at = new Date().toISOString();
  return row;
}

export function useProjectsSupabase(userId) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const fetchProjects = useCallback(async () => {
    if (!supabase || !userId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("[WF] Fetch projects error:", error);
      setLoading(false);
      return;
    }
    setProjects((data || []).map(fromDB));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId || fetchedRef.current) return;
    fetchedRef.current = true;
    fetchProjects();
  }, [userId, fetchProjects]);

  useEffect(() => {
    fetchedRef.current = false;
    setProjects([]);
    setLoading(true);
  }, [userId]);

  // Realtime
  useEffect(() => {
    if (!supabase || !userId) return;
    const channel = supabase
      .channel(`projects-live-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const p = fromDB(payload.new);
          setProjects(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p]);
        } else if (payload.eventType === "UPDATE") {
          const p = fromDB(payload.new);
          setProjects(prev => prev.map(x => x.id === p.id ? p : x));
        } else if (payload.eventType === "DELETE") {
          setProjects(prev => prev.filter(x => x.id !== payload.old.id));
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId]);

  const addProject = useCallback(async (projData) => {
    if (!supabase || !userId) return null;
    const row = {
      owner_id: userId,
      name: projData.name,
      color: projData.color || "#6a7fd4",
      description: projData.description || "",
      status: projData.status || "active",
      deadline: projData.deadline || null,
      workflow: projData.workflow || null,
      steps: projData.steps || [],
      members: projData.members || [],
      chat_id: projData.chatId || null,
    };

    const { data, error } = await supabase.from("projects").insert(row).select().single();
    if (data) {
      const p = fromDB(data);
      setProjects(prev => [...prev, p]);
      return p;
    }
    if (error) console.warn("[WF] Add project error:", error);
    return null;
  }, [userId]);

  const patchProject = useCallback(async (id, data) => {
    if (!supabase || !id) return;
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p));
    const dbData = toDB(data);
    const { error } = await supabase.from("projects").update(dbData).eq("id", id);
    if (error) {
      console.warn("[WF] Patch project error:", error);
      fetchProjects();
    }
  }, [fetchProjects]);

  const deleteProject = useCallback(async (id) => {
    if (!supabase || !id) return;
    setProjects(prev => prev.filter(p => p.id !== id));
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) {
      console.warn("[WF] Delete project error:", error);
      fetchProjects();
    }
  }, [fetchProjects]);

  return { projects, loading, addProject, patchProject, deleteProject, refresh: fetchProjects };
}
