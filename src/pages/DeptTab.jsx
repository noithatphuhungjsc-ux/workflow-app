/* ================================================================
   DEPT TAB — Phòng ban: auto-create dept conversations, chat directly
   Prefix: [dept:{role}]Tên phòng
   Director sees all 5, staff sees "Toàn CT" + their own dept (2)
   ================================================================ */
import { useState, useEffect, useCallback } from "react";
import { C, TEAM_ACCOUNTS } from "../constants";
import { useSupabase } from "../contexts/SupabaseContext";
import { supabase } from "../lib/supabase";
import ChatRoom from "../components/ChatRoom";

const DEPT_LIST = [
  { role: "all",          name: "Toàn công ty",  icon: "🏢", color: "#6a7fd4", members: "all" },
  { role: "accountant",   name: "Kế toán",       icon: "💰", color: "#e74c3c", members: ["accountant", "director"] },
  { role: "sales",        name: "Kinh doanh",    icon: "📈", color: "#6a7fd4", members: ["sales", "director"] },
  { role: "hr",           name: "Nhân sự",       icon: "👥", color: "#3aaa72", members: ["hr", "director"] },
  { role: "construction", name: "Thi công",      icon: "🔨", color: "#e67e22", members: ["construction", "director"] },
];

function getDeptConvName(role, name) {
  return `[dept:${role}]${name}`;
}

export default function DeptTab() {
  const { session, isConnected, loading: supaLoading } = useSupabase();
  const userId = session?.user?.id;
  const [deptChats, setDeptChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeConv, setActiveConv] = useState(null);
  const [profiles, setProfiles] = useState([]);

  // Determine current user role
  const userRole = (() => {
    try {
      const s = JSON.parse(localStorage.getItem("wf_session") || "{}");
      return s.role || "staff";
    } catch { return "staff"; }
  })();
  const isDirector = userRole === "director";

  // Filter depts user can see
  const visibleDepts = DEPT_LIST.filter(d => {
    if (isDirector) return true;
    if (d.role === "all") return true;
    return d.members !== "all" && d.members.includes(userRole);
  });

  // Load profiles
  useEffect(() => {
    if (!supabase || !userId) return;
    supabase.from("profiles").select("id, display_name, avatar_color")
      .then(({ data }) => setProfiles(data || []));
  }, [userId]);

  // Auto-create dept conversations + load them
  const loadDeptChats = useCallback(async () => {
    if (!supabase || !userId) return;
    setLoading(true);

    // Load existing dept conversations
    const { data: existing } = await supabase.from("conversations")
      .select("id, name, last_message_at")
      .like("name", "[dept:%")
      .order("created_at");

    const existingMap = {};
    (existing || []).forEach(c => {
      const m = c.name.match(/^\[dept:([^\]]+)\]/);
      if (m) existingMap[m[1]] = c;
    });

    // Auto-create missing dept conversations
    for (const dept of DEPT_LIST) {
      if (existingMap[dept.role]) continue;
      const convName = getDeptConvName(dept.role, dept.name);
      try {
        const { data: conv } = await supabase.from("conversations")
          .insert({ type: "group", name: convName, created_by: userId })
          .select().single();
        if (!conv) continue;

        // Add members
        const memberRoles = dept.members === "all"
          ? TEAM_ACCOUNTS.map(a => a.role)
          : dept.members;
        const memberAccounts = dept.members === "all"
          ? TEAM_ACCOUNTS
          : TEAM_ACCOUNTS.filter(a => memberRoles.includes(a.role));

        const inserts = [];
        for (const acc of memberAccounts) {
          // Look up Supabase UUID from profiles
          const profile = profiles.find(p => p.display_name?.toLowerCase().includes(acc.name.split(" ")[0].toLowerCase()));
          if (profile) inserts.push({ conversation_id: conv.id, user_id: profile.id });
        }
        // Also ensure current user is member
        if (!inserts.find(i => i.user_id === userId)) {
          inserts.push({ conversation_id: conv.id, user_id: userId });
        }
        if (inserts.length) {
          await supabase.from("conversation_members").insert(inserts);
        }
        existingMap[dept.role] = conv;
      } catch (e) {
        console.warn("[WF] Auto-create dept chat:", dept.name, e);
      }
    }

    // Build dept chat list with last messages
    const convIds = Object.values(existingMap).map(c => c.id);
    let lastMsgMap = {};
    if (convIds.length) {
      const { data: msgs } = await supabase.from("messages")
        .select("conversation_id, content, sender_name, created_at, type")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(convIds.length * 2);
      for (const msg of (msgs || [])) {
        if (!lastMsgMap[msg.conversation_id]) lastMsgMap[msg.conversation_id] = msg;
      }
    }

    const chatList = visibleDepts.map(dept => {
      const conv = existingMap[dept.role];
      return {
        ...dept,
        convId: conv?.id || null,
        lastMessage: conv ? lastMsgMap[conv.id] || null : null,
      };
    }).filter(d => d.convId);

    setDeptChats(chatList);
    setLoading(false);
  }, [userId, profiles, visibleDepts.length]);

  useEffect(() => { loadDeptChats(); }, [loadDeptChats]);

  // Loading state
  if (supaLoading || !isConnected) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: C.muted }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🏢</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Đang kết nối...</div>
      </div>
    );
  }

  // Active conversation — open ChatRoom
  if (activeConv) {
    const dept = deptChats.find(d => d.convId === activeConv);
    return (
      <ChatRoom conversationId={activeConv} userId={userId}
        convName={dept?.name || "Phòng ban"} convType="group" profiles={profiles}
        onBack={() => { setActiveConv(null); loadDeptChats(); }} />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>🏢 Phòng ban</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
          {isDirector ? "Tất cả phòng ban" : "Phòng ban của bạn"}
        </div>
      </div>

      {/* Dept list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && <div style={{ textAlign: "center", padding: 20, color: C.muted, fontSize: 12 }}>Đang tải...</div>}
        {!loading && deptChats.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: C.muted, fontSize: 13 }}>
            Chưa có phòng ban nào. Đang tạo...
          </div>
        )}
        {deptChats.map(dept => (
          <div key={dept.role} className="tap" onClick={() => setActiveConv(dept.convId)}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: `1px solid ${C.border}22`, cursor: "pointer" }}>
            {/* Icon */}
            <div style={{
              width: 48, height: 48, borderRadius: 14, flexShrink: 0,
              background: `${dept.color}15`, border: `1.5px solid ${dept.color}33`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22,
            }}>
              {dept.icon}
            </div>
            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{dept.name}</div>
              {dept.lastMessage ? (
                <div style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                  {dept.lastMessage.sender_name && <span style={{ fontWeight: 600 }}>{dept.lastMessage.sender_name}: </span>}
                  {dept.lastMessage.type === "image" ? "📷 Ảnh" : dept.lastMessage.content}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2, fontStyle: "italic" }}>Chưa có tin nhắn</div>
              )}
            </div>
            {/* Time */}
            {dept.lastMessage && (
              <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>
                {new Date(dept.lastMessage.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <span style={{ fontSize: 16, color: C.muted }}>›</span>
          </div>
        ))}
      </div>
    </div>
  );
}
