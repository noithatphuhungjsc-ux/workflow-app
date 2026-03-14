import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

export function useConversations(userId) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

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

    // 2. Batch: conversations + all members + all profiles (3 parallel queries)
    const [convosRes, allMembersRes, profilesRes] = await Promise.all([
      supabase.from("conversations").select("*").in("id", convIds).order("last_message_at", { ascending: false }),
      supabase.from("conversation_members").select("conversation_id, user_id").in("conversation_id", convIds),
      supabase.from("profiles").select("id, display_name, avatar_color"),
    ]);

    const convos = convosRes.data || [];
    const allMembers = allMembersRes.data || [];
    const profileMap = Object.fromEntries((profilesRes.data || []).map(p => [p.id, p]));

    if (!convos.length) { setConversations([]); setLoading(false); return; }

    // 3. Batch: last message per conversation (parallel)
    const msgPromises = convos.map(c =>
      supabase.from("messages")
        .select("content, sender_name, created_at, type, sender_id")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
    );
    const msgResults = await Promise.all(msgPromises);

    // 4. Enrich without extra queries
    const enriched = convos.map((c, i) => {
      const lastRead = readMap[c.id] || c.created_at;
      const lastMsg = msgResults[i].data?.[0] || null;

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
        displayName: displayName || c.name || "Nhóm",
        lastMessage: lastMsg,
        unreadCount,
      };
    });

    setConversations(enriched);
    setLoading(false);
    initialLoadDone.current = true;
  }, [userId]);

  useEffect(() => { fetchConvos(); }, [fetchConvos]);

  // Real-time: refresh list when new messages arrive
  useEffect(() => {
    if (!supabase || !userId) return;

    // Polling fallback — always works even without Realtime enabled
    const poll = setInterval(fetchConvos, 5000);

    // Realtime subscription — instant if Realtime is enabled on messages table
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

    // Check if DM already exists (2 queries instead of N)
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

  // Create group conversation
  const createGroup = useCallback(async (name, memberIds) => {
    if (!supabase || !userId) return null;

    const { data: conv } = await supabase
      .from("conversations")
      .insert({ type: "group", name, created_by: userId })
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
