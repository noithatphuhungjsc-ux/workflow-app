import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

const CACHE_KEY = "wf_convos_cache";

export function useConversations(userId) {
  // Restore from cache for instant render
  const [conversations, setConversations] = useState(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) { const d = JSON.parse(cached); if (d.userId === userId && d.list?.length) return d.list; }
    } catch {}
    return [];
  });
  const [loading, setLoading] = useState(() => {
    try { return !sessionStorage.getItem(CACHE_KEY); } catch { return true; }
  });

  const initialLoadDone = useRef(false);

  const fetchConvos = useCallback(async () => {
    if (!supabase || !userId) { setLoading(false); return; }
    if (!initialLoadDone.current) setLoading(true);

    // 1. Get my memberships
    const { data: memberRows } = await supabase
      .from("conversation_members")
      .select("conversation_id, last_read_at")
      .eq("user_id", userId);

    if (!memberRows?.length) { setConversations([]); setLoading(false); return; }

    const convIds = memberRows.map(m => m.conversation_id);
    const readMap = Object.fromEntries(memberRows.map(m => [m.conversation_id, m.last_read_at]));

    // 2. Batch: conversations + all members + profiles + recent messages (4 parallel queries)
    const [convosRes, allMembersRes, profilesRes, msgsRes] = await Promise.all([
      supabase.from("conversations").select("*").in("id", convIds).order("last_message_at", { ascending: false }),
      supabase.from("conversation_members").select("conversation_id, user_id").in("conversation_id", convIds),
      supabase.from("profiles").select("id, display_name, avatar_color"),
      supabase.from("messages")
        .select("conversation_id, content, sender_name, created_at, type, sender_id")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(Math.max(convIds.length * 5, 50)),
    ]);

    const convos = convosRes.data || [];
    const allMembers = allMembersRes.data || [];
    const profileMap = Object.fromEntries((profilesRes.data || []).map(p => [p.id, p]));

    if (!convos.length) { setConversations([]); setLoading(false); return; }

    // 3. Group messages by conversation — take first (latest) per conversation
    const lastMsgMap = {};
    for (const msg of (msgsRes.data || [])) {
      if (!lastMsgMap[msg.conversation_id]) lastMsgMap[msg.conversation_id] = msg;
    }

    // 4. Enrich
    const enriched = convos.map((c) => {
      const lastRead = readMap[c.id] || c.created_at;
      const lastMsg = lastMsgMap[c.id] || null;

      // Display name for DM
      let displayName = c.name;
      if (c.type === "dm" && !c.name) {
        const otherMember = allMembers.find(m => m.conversation_id === c.id && m.user_id !== userId);
        displayName = otherMember ? (profileMap[otherMember.user_id]?.display_name || "?") : "?";
      }

      // Simple unread: last message is after last_read and not from me
      const unreadCount = lastMsg && lastMsg.created_at > lastRead && lastMsg.sender_id !== userId ? 1 : 0;

      return {
        ...c,
        displayName: displayName || c.name || "Nhom",
        lastMessage: lastMsg,
        unreadCount,
      };
    });

    // Only update state if data actually changed
    setConversations(prev => {
      const prevKey = JSON.stringify(prev.map(c => ({ id: c.id, lm: c.lastMessage?.created_at, u: c.unreadCount })));
      const nextKey = JSON.stringify(enriched.map(c => ({ id: c.id, lm: c.lastMessage?.created_at, u: c.unreadCount })));
      if (prevKey === nextKey) return prev;
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ userId, list: enriched })); } catch {}
      return enriched;
    });
    setLoading(false);
    initialLoadDone.current = true;
  }, [userId]);

  useEffect(() => { fetchConvos(); }, [fetchConvos]);

  // Real-time: refresh list when new messages arrive
  useEffect(() => {
    if (!supabase || !userId) return;

    const poll = setInterval(fetchConvos, 15000);

    const channel = supabase
      .channel("convos-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        fetchConvos();
      })
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [userId, fetchConvos]);

  // Create DM conversation
  const createDM = useCallback(async (otherUserId) => {
    if (!supabase || !userId) return null;

    // Check if DM already exists
    const { data: myConvs } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", userId);

    if (myConvs?.length) {
      const { data: theirConvs } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", otherUserId)
        .in("conversation_id", myConvs.map(m => m.conversation_id));

      if (theirConvs?.length) {
        const { data: existing } = await supabase
          .from("conversations")
          .select("id")
          .eq("type", "dm")
          .in("id", theirConvs.map(t => t.conversation_id))
          .limit(1);
        if (existing?.[0]) { await fetchConvos(); return existing[0].id; }
      }
    }

    // Create new DM
    const { data: conv } = await supabase
      .from("conversations")
      .insert({ type: "dm", created_by: userId })
      .select()
      .single();

    if (!conv) return null;

    await supabase.from("conversation_members").insert([
      { conversation_id: conv.id, user_id: userId },
      { conversation_id: conv.id, user_id: otherUserId },
    ]);

    await fetchConvos();
    return conv.id;
  }, [userId, fetchConvos]);

  // Create group conversation (with category column instead of prefix)
  // Only director can create groups (enforced client-side + RLS)
  const createGroup = useCallback(async (name, memberIds, options = {}) => {
    if (!supabase || !userId) return null;

    // Permission check: only director or system (dept/project) can create groups
    if (!options.deptRole && !options.projectId && !options.parentId) {
      try {
        const role = JSON.parse(localStorage.getItem("wf_session") || "{}").role;
        if (role !== "director") {
          console.warn("[WF] createGroup blocked: non-director user");
          return null;
        }
      } catch { return null; }
    }

    const insertData = {
      type: "group",
      name,
      created_by: userId,
      category: options.category || null,
      dept_role: options.deptRole || null,
      linked_project_id: options.projectId || null,
      parent_id: options.parentId || null,
    };

    const { data: conv } = await supabase
      .from("conversations")
      .insert(insertData)
      .select()
      .single();

    if (!conv) return null;

    const allIds = [userId, ...memberIds.filter(id => id !== userId)];
    await supabase.from("conversation_members").insert(
      allIds.map(uid => ({ conversation_id: conv.id, user_id: uid }))
    );

    await fetchConvos();
    return conv.id;
  }, [userId, fetchConvos]);

  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0);

  return { conversations, loading, totalUnread, refresh: fetchConvos, createDM, createGroup };
}
