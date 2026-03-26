/* ================================================================
   DEPT TAB v39 — Uses dept_role column instead of prefix encoding
   Director sees all 5, staff sees "Toan CT" + their own dept (2)
   ================================================================ */
import { useState, useEffect, useCallback } from "react";
import { C, TEAM_ACCOUNTS } from "../constants";
import { useSupabase } from "../contexts/SupabaseContext";
import { supabase } from "../lib/supabase";
import ChatRoom from "../components/ChatRoom";

const DEPT_LIST = [
  { role: "all",          name: "Toan cong ty",  icon: "\uD83C\uDFE2", color: "#6a7fd4", members: "all" },
  { role: "accountant",   name: "Ke toan",       icon: "\uD83D\uDCB0", color: "#e74c3c", members: ["accountant", "director"] },
  { role: "sales",        name: "Kinh doanh",    icon: "\uD83D\uDCC8", color: "#6a7fd4", members: ["sales", "director"] },
  { role: "hr",           name: "Nhan su",       icon: "\uD83D\uDC65", color: "#3aaa72", members: ["hr", "director"] },
  { role: "construction", name: "Thi cong",      icon: "\uD83D\uDD28", color: "#e67e22", members: ["construction", "manager", "director"] },
];

export default function DeptTab() {
  const { session, isConnected, loading: supaLoading } = useSupabase();
  const userId = session?.user?.id;
  const [deptChats, setDeptChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeConv, setActiveConv] = useState(null);
  const [profiles, setProfiles] = useState([]);

  const userRole = (() => {
    try {
      const s = JSON.parse(localStorage.getItem("wf_session") || "{}");
      return s.role || "staff";
    } catch { return "staff"; }
  })();
  const isDirector = userRole === "director";

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

  // Load/create dept conversations using dept_role column
  const loadDeptChats = useCallback(async () => {
    if (!supabase || !userId) return;
    if (!profiles.length) return;
    setLoading(true);

    // Load existing dept conversations (by dept_role column)
    const { data: existing } = await supabase.from("conversations")
      .select("id, name, dept_role, last_message_at")
      .not("dept_role", "is", null)
      .order("created_at");

    // Also find old dept conversations created without dept_role (by name match)
    const deptNames = DEPT_LIST.map(d => d.name);
    const { data: oldDeptConvs } = await supabase.from("conversations")
      .select("id, name, dept_role")
      .is("dept_role", null)
      .eq("type", "group")
      .in("name", deptNames);

    // Migrate old dept conversations: set dept_role based on name
    for (const old of (oldDeptConvs || [])) {
      const dept = DEPT_LIST.find(d => d.name === old.name);
      if (dept) {
        await supabase.from("conversations").update({ dept_role: dept.role }).eq("id", old.id);
        old.dept_role = dept.role;
      }
    }

    // Merge old + new
    const allDeptConvs = [...(existing || []), ...(oldDeptConvs || []).filter(o => o.dept_role)];

    // Deduplicate: keep first (oldest) per role
    const existingMap = {};
    const duplicateIds = [];
    allDeptConvs.forEach(c => {
      if (!c.dept_role) return;
      if (existingMap[c.dept_role]) {
        duplicateIds.push(c.id);
      } else {
        existingMap[c.dept_role] = c;
      }
    });

    // Clean up duplicates
    if (duplicateIds.length) {
      for (const id of duplicateIds) {
        await supabase.from("conversation_members").delete().eq("conversation_id", id);
        await supabase.from("messages").delete().eq("conversation_id", id);
        await supabase.from("conversations").delete().eq("id", id);
      }
    }

    // Auto-create missing dept conversations
    for (const dept of DEPT_LIST) {
      if (existingMap[dept.role]) continue;
      try {
        // Double-check
        const { data: recheck } = await supabase.from("conversations")
          .select("id").eq("dept_role", dept.role).limit(1);
        if (recheck?.length) { existingMap[dept.role] = recheck[0]; continue; }

        const { data: conv } = await supabase.from("conversations")
          .insert({ type: "group", name: dept.name, created_by: userId, dept_role: dept.role })
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
        const normalize = s => (s || "").toLowerCase().replace(/\s+/g, "");
        for (const acc of memberAccounts) {
          const profile = profiles.find(p => normalize(p.display_name) === normalize(acc.name));
          if (profile) inserts.push({ conversation_id: conv.id, user_id: profile.id });
        }
        // Only add current user if they belong to this department (or it's "all")
        const shouldJoin = dept.members === "all" || dept.members.includes(userRole) || isDirector;
        if (shouldJoin && !inserts.find(i => i.user_id === userId)) {
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

  if (supaLoading || !isConnected) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: C.muted }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>{"\uD83C\uDFE2"}</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Dang ket noi...</div>
      </div>
    );
  }

  if (activeConv) {
    const dept = deptChats.find(d => d.convId === activeConv);
    return (
      <ChatRoom conversationId={activeConv} userId={userId}
        convName={dept?.name || "Phong ban"} convType="group" profiles={profiles}
        onBack={() => { setActiveConv(null); loadDeptChats(); }} />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{"\uD83C\uDFE2"} Phong ban</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
          {isDirector ? "Tat ca phong ban" : "Phong ban cua ban"}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && <div style={{ textAlign: "center", padding: 20, color: C.muted, fontSize: 12 }}>Dang tai...</div>}
        {!loading && deptChats.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: C.muted, fontSize: 13 }}>
            Chua co phong ban nao. Dang tao...
          </div>
        )}
        {deptChats.map(dept => (
          <div key={dept.role} className="tap" onClick={() => setActiveConv(dept.convId)}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: `1px solid ${C.border}22`, cursor: "pointer" }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, flexShrink: 0,
              background: `${dept.color}15`, border: `1.5px solid ${dept.color}33`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22,
            }}>
              {dept.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{dept.name}</div>
              {dept.lastMessage ? (
                <div style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                  {dept.lastMessage.sender_name && <span style={{ fontWeight: 600 }}>{dept.lastMessage.sender_name}: </span>}
                  {dept.lastMessage.type === "image" ? "\uD83D\uDCF7 Anh" : dept.lastMessage.content}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2, fontStyle: "italic" }}>Chua co tin nhan</div>
              )}
            </div>
            {dept.lastMessage && (
              <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>
                {new Date(dept.lastMessage.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <span style={{ fontSize: 16, color: C.muted }}>{"\u203A"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
