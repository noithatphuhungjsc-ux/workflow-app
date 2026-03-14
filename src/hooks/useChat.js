import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

export function useChat(conversationId, userId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherLastRead, setOtherLastRead] = useState(null);
  const pollingRef = useRef(null);
  const lastFetchRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const channelRef = useRef(null);

  // Fetch messages
  const fetchMessages = useCallback(async (sinceOnly) => {
    if (!supabase || !conversationId) return;

    if (sinceOnly && lastFetchRef.current) {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .gt("created_at", lastFetchRef.current)
        .order("created_at", { ascending: true });

      if (data?.length) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newMsgs = data.filter(m => !existingIds.has(m.id));
          if (!newMsgs.length) return prev;
          const cleaned = prev.filter(m => !m.id.toString().startsWith("temp_"));
          return [...cleaned, ...data.filter(m => !new Set(cleaned.map(c => c.id)).has(m.id))];
        });
        lastFetchRef.current = data[data.length - 1].created_at;
      }
    } else {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(100);

      if (data) {
        setMessages(data);
        if (data.length) lastFetchRef.current = data[data.length - 1].created_at;
      }
    }
  }, [conversationId]);

  // Fetch other member's last_read_at (for "đã xem" status)
  const fetchOtherRead = useCallback(async () => {
    if (!supabase || !conversationId || !userId) return;
    const { data } = await supabase
      .from("conversation_members")
      .select("last_read_at")
      .eq("conversation_id", conversationId)
      .neq("user_id", userId)
      .limit(1);
    if (data?.[0]) setOtherLastRead(data[0].last_read_at);
  }, [conversationId, userId]);

  // Initial fetch
  useEffect(() => {
    if (!supabase || !conversationId) { setLoading(false); return; }
    setLoading(true);
    lastFetchRef.current = null;

    (async () => {
      await fetchMessages(false);
      await fetchOtherRead();
      setLoading(false);

      if (userId) {
        await supabase
          .from("conversation_members")
          .update({ last_read_at: new Date().toISOString() })
          .eq("conversation_id", conversationId)
          .eq("user_id", userId);
      }
    })();
  }, [conversationId, userId, fetchMessages, fetchOtherRead]);

  // Poll every 2s for new messages + read status
  useEffect(() => {
    if (!supabase || !conversationId) return;
    pollingRef.current = setInterval(() => {
      fetchMessages(true);
      fetchOtherRead();
    }, 2000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [conversationId, fetchMessages, fetchOtherRead]);

  // Realtime subscription (instant if WebSocket works)
  useEffect(() => {
    if (!supabase || !conversationId) return;

    const channel = supabase
      .channel(`room:${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          const cleaned = prev.filter(m => !m.id.toString().startsWith("temp_"));
          return [...cleaned, payload.new];
        });
        if (payload.new.created_at) lastFetchRef.current = payload.new.created_at;

        if (userId && payload.new.sender_id !== userId) {
          supabase
            .from("conversation_members")
            .update({ last_read_at: new Date().toISOString() })
            .eq("conversation_id", conversationId)
            .eq("user_id", userId);
        }
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, userId]);

  // Presence: typing indicator
  useEffect(() => {
    if (!supabase || !conversationId || !userId) return;

    const presenceChannel = supabase
      .channel(`presence:${conversationId}`)
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const others = Object.values(state).flat().filter(
          (p) => p.user_id !== userId && p.typing
        );
        setOtherTyping(others.length > 0);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ user_id: userId, typing: false });
        }
      });

    channelRef.current = { ...channelRef.current, presence: presenceChannel };

    return () => { supabase.removeChannel(presenceChannel); };
  }, [conversationId, userId]);

  // Broadcast typing status
  const setTyping = useCallback((isTyping) => {
    const presenceChannel = channelRef.current?.presence;
    if (!presenceChannel) return;

    presenceChannel.track({ user_id: userId, typing: isTyping });

    // Auto-stop typing after 3s
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        presenceChannel.track({ user_id: userId, typing: false });
      }, 3000);
    }
  }, [userId]);

  // Send message
  const sendMessage = useCallback(async (content, type = "text", extra = {}) => {
    if (!supabase || !conversationId || !userId || !content.trim()) return;

    // Stop typing indicator
    setTyping(false);

    const msg = {
      conversation_id: conversationId,
      sender_id: userId,
      content: content.trim(),
      type,
      ...extra,
    };

    const optimistic = { ...msg, id: `temp_${Date.now()}`, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);

    const { data, error } = await supabase.from("messages").insert(msg).select().single();

    if (data) {
      setMessages(prev => prev.map(m => m.id === optimistic.id ? data : m));
      lastFetchRef.current = data.created_at;

      await supabase
        .from("conversations")
        .update({ last_message_at: data.created_at })
        .eq("id", conversationId);
    } else if (error) {
      console.warn("Send message failed:", error);
      // If membership issue, try auto-join then retry
      if (error.code === "42501" || error.message?.includes("policy")) {
        try {
          await supabase.from("conversation_members").upsert({ conversation_id: conversationId, user_id: userId }, { onConflict: "conversation_id,user_id" });
          const { data: retry } = await supabase.from("messages").insert(msg).select().single();
          if (retry) {
            setMessages(prev => prev.map(m => m.id === optimistic.id ? retry : m));
            await supabase.from("conversations").update({ last_message_at: retry.created_at }).eq("id", conversationId);
            return retry;
          }
        } catch {}
      }
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
    }

    return data;
  }, [conversationId, userId, setTyping]);

  // Delete message
  const deleteMessage = useCallback(async (messageId) => {
    if (!supabase || !messageId) return;
    setMessages(prev => prev.filter(m => m.id !== messageId));
    await supabase.from("messages").delete().eq("id", messageId).eq("sender_id", userId);
  }, [userId]);

  return { messages, loading, sendMessage, deleteMessage, otherTyping, setTyping, otherLastRead };
}
