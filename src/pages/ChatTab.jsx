import { useState, useEffect, useRef, useCallback } from "react";
import { C } from "../constants";
import { useSupabase } from "../contexts/SupabaseContext";
import { useConversations } from "../hooks/useConversations";
import ChatRoom from "../components/ChatRoom";
import NewChatModal, { getCategoryInfo, GROUP_CATEGORIES } from "../components/NewChatModal";
import { supabase } from "../lib/supabase";

export default function ChatTab({ openConvId, projects, tasks, patchTask, addTask, patchProject }) {
  const { session, isConnected, loading: supaLoading } = useSupabase();
  const userId = session?.user?.id;
  const { conversations, loading, totalUnread, refresh, createDM, createGroup } = useConversations(userId);
  const [activeConv, _setActiveConv] = useState(() => sessionStorage.getItem("wf_activeConv") || null);

  useEffect(() => {
    if (openConvId && openConvId !== activeConv) {
      setActiveConv(openConvId);
    }
  }, [openConvId]);

  const setActiveConv = useCallback((id) => {
    if (id) {
      sessionStorage.setItem("wf_activeConv", id);
      // NOTE: Do NOT auto-join conversations. Membership is managed via
      // createDM, createGroup, or DeptTab. RLS enforces server-side.
    } else {
      sessionStorage.removeItem("wf_activeConv");
    }
    _setActiveConv(id);
  }, [userId]);

  const [showNew, setShowNew] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [filter, setFilter] = useState("all");

  const canCreateGroup = (() => {
    try {
      const s = JSON.parse(localStorage.getItem("wf_session") || "{}");
      return s.role === "director";
    } catch { return false; }
  })();

  useEffect(() => {
    if (!supabase || !userId) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("id, display_name, avatar_color");
      setProfiles(data || []);
    })();
  }, [userId]);

  const handleNewChat = async (selection) => {
    setShowNew(null);
    if (selection.type === "dm") {
      const convId = await createDM(selection.userId);
      if (convId) setActiveConv(convId);
    } else if (selection.type === "group") {
      // Pass category as column option (no more prefix encoding)
      const convId = await createGroup(selection.name, selection.memberIds, { category: selection.category });
      if (convId) setActiveConv(convId);
    }
  };

  const deleteConversation = async (convId) => {
    if (!supabase || !userId) return;
    const conv = conversations.find(c => c.id === convId);
    const { error } = await supabase.from("conversation_members").delete()
      .eq("conversation_id", convId).eq("user_id", userId);
    if (error) {
      alert("Khong the roi cuoc tro chuyen. Vui long thu lai.");
    } else if (conv?.type === "group") {
      await supabase.from("messages").insert({
        conversation_id: convId, sender_id: userId,
        content: "\uD83D\uDC64 da roi khoi nhom", type: "system",
      }).catch(() => {});
    }
    setConfirmDelete(null);
    setContextMenu(null);
    if (activeConv === convId) _setActiveConv(null);
    refresh();
  };

  // Long-press for context menu
  const longPressRef = useRef(null);
  const longPressTriggered = useRef(false);

  const handleTouchStart = useCallback((convId) => {
    longPressTriggered.current = false;
    longPressRef.current = setTimeout(() => {
      longPressTriggered.current = true;
      setContextMenu({ id: convId });
    }, 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
  }, []);

  const handleTap = useCallback((convId) => {
    if (longPressTriggered.current) return;
    setActiveConv(convId);
  }, []);

  // Merge project chats (projects with chatId that aren't in conversations yet)
  const mergedConversations = (() => {
    if (!projects?.length) return conversations;
    const existingIds = new Set(conversations.map(c => c.id));
    const projectChats = projects
      .filter(p => p.chatId && !existingIds.has(p.chatId))
      .map(p => ({
        id: p.chatId, type: "group", name: p.name, category: "project",
        displayName: p.name, created_by: userId,
        lastMessage: null, unreadCount: 0, _isProjectChat: true,
        linked_project_id: p.id,
      }));
    return projectChats.length > 0 ? [...conversations, ...projectChats] : conversations;
  })();

  // Detect dept chats: column OR legacy name patterns
  const DEPT_NAMES = ["Toan cong ty", "Ke toan", "Kinh doanh", "Nhan su", "Thi cong"];
  const isDeptChat = (c) => {
    if (c.dept_role) return true;
    if (c.type !== "group") return false;
    const n = c.name || "";
    // Match exact name, prefix-encoded name, or partial match
    return DEPT_NAMES.includes(n) || n.startsWith("[dept:") || DEPT_NAMES.some(d => n.includes(d));
  };
  const isSubThread = (c) => c.parent_id || (c.name || "").startsWith("[sub:");

  // Filter — hide sub-threads and dept chats from main list
  const filtered = mergedConversations.filter(c => {
    if (isDeptChat(c)) return false;    // dept chats shown in DeptTab
    if (isSubThread(c)) return false;   // sub-threads only visible in parent chat
    if (filter === "all") return true;
    if (filter === "dm") return c.type === "dm";
    if (c.type !== "group") return false;
    return (c.category || "other") === filter;
  });

  const groupCounts = {};
  mergedConversations.filter(c => !isDeptChat(c) && !isSubThread(c)).forEach(c => {
    if (c.type === "group") {
      const cat = c.category || "other";
      groupCounts[cat] = (groupCounts[cat] || 0) + 1;
    }
  });
  const dmCount = mergedConversations.filter(c => c.type === "dm").length;

  if (supaLoading || !isConnected) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: C.muted }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>{"\uD83D\uDCAC"}</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Dang ket noi...</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>Tu dong dang nhap tu tai khoan cua ban</div>
      </div>
    );
  }

  // Active conversation
  if (activeConv) {
    const conv = mergedConversations.find(c => c.id === activeConv) || conversations.find(c => c.id === activeConv);
    const name = conv?.displayName || conv?.name || "Tro chuyen";
    const linkedProject = (projects || []).find(p => p.chatId === activeConv) || null;
    const projectTasks = linkedProject ? (tasks || []).filter(t => t.projectId === linkedProject.id && !t.deleted)
      .sort((a, b) => (a.stepIndex ?? 999) - (b.stepIndex ?? 999)) : [];
    return (
      <ChatRoom conversationId={activeConv} userId={userId}
        convName={name} convType={conv?.type || "dm"} profiles={profiles}
        linkedProject={linkedProject} projectTasks={projectTasks} patchTask={patchTask} addTask={addTask}
        patchProject={patchProject}
        onBack={() => { setActiveConv(null); refresh(); }} />
    );
  }

  // Filter pills
  const filterPills = [
    { key: "all", label: "Tat ca", count: filtered.length, color: C.text },
    { key: "dm", label: "Ca nhan", count: dmCount, color: C.accent },
    ...GROUP_CATEGORIES.filter(cat => groupCounts[cat.key]).map(cat => ({
      key: cat.key, label: `${cat.icon} ${cat.label}`, count: groupCounts[cat.key], color: cat.color,
    })),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}
      onClick={() => contextMenu && setContextMenu(null)}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, gap: 6 }}>
        <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: C.text }}>
          Tin nhan {totalUnread > 0 && <span style={{ fontSize: 11, color: "#fff", background: C.red, borderRadius: 10, padding: "1px 7px", marginLeft: 6 }}>{totalUnread}</span>}
        </div>
        <button className="tap" onClick={() => setShowNew("dm")}
          style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 10, padding: "6px 12px", fontSize: 12, fontWeight: 700 }}>
          + Nhan tin
        </button>
        {canCreateGroup && (
          <button className="tap" onClick={() => setShowNew("group")}
            style={{ background: C.purple, color: "#fff", border: "none", borderRadius: 10, padding: "6px 12px", fontSize: 12, fontWeight: 700 }}>
            + Nhom
          </button>
        )}
      </div>

      {/* Filter pills */}
      {mergedConversations.length > 0 && (
        <div style={{ display: "flex", gap: 6, padding: "8px 14px", overflowX: "auto", flexShrink: 0, borderBottom: `1px solid ${C.border}22` }}>
          {filterPills.map(p => (
            <button key={p.key} className="tap" onClick={() => setFilter(p.key)}
              style={{
                padding: "5px 12px", borderRadius: 16, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
                border: filter === p.key ? `1.5px solid ${p.color}` : `1px solid ${C.border}`,
                background: filter === p.key ? `${p.color}12` : "transparent",
                color: filter === p.key ? p.color : C.muted,
              }}>
              {p.label} {p.count > 0 && <span style={{ opacity: 0.7 }}>({p.count})</span>}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && <div style={{ textAlign: "center", padding: 20, color: C.muted, fontSize: 12 }}>Dang tai...</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: C.muted, fontSize: 13 }}>
            {filter === "all" ? <>Chua co cuoc tro chuyen nao.<br />Bam "+ Nhan tin" de bat dau.</> : "Khong co cuoc tro chuyen nao trong muc nay."}
          </div>
        )}
        {filtered.map(c => {
          const isGroup = c.type === "group";
          const catInfo = isGroup ? getCategoryInfo(c.category || "other") : null;
          const name = c.displayName || c.name || "?";

          return (
            <div key={c.id} className="tap"
              onClick={() => handleTap(c.id)}
              onTouchStart={() => handleTouchStart(c.id)}
              onTouchEnd={handleTouchEnd}
              onTouchMove={handleTouchEnd}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu({ id: c.id }); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${C.border}22`, cursor: "pointer", userSelect: "none", WebkitUserSelect: "none" }}>
              {/* Avatar */}
              <div style={{
                width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
                background: isGroup ? (catInfo?.color || C.purple) : C.accent,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: isGroup ? 15 : 16, fontWeight: 700,
              }}>
                {isGroup ? (catInfo?.icon || "\uD83D\uDC65") : (name || "?")[0].toUpperCase()}
              </div>
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: c.unreadCount > 0 ? 700 : 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {name}
                  </span>
                  {isGroup && catInfo && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: catInfo.color, background: `${catInfo.color}15`, padding: "1px 6px", borderRadius: 8, flexShrink: 0 }}>
                      {catInfo.label}
                    </span>
                  )}
                </div>
                {c.lastMessage && (
                  <div style={{ fontSize: 12, color: c.unreadCount > 0 ? C.text : C.muted, fontWeight: c.unreadCount > 0 ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                    {c.lastMessage.type === "image" ? "\uD83D\uDCF7 Anh" : c.lastMessage.type === "location" ? "\uD83D\uDCCD Vi tri" : c.lastMessage.content}
                  </div>
                )}
              </div>
              {/* Time + unread */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                {c.lastMessage && (
                  <span style={{ fontSize: 10, color: C.muted }}>
                    {new Date(c.lastMessage.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
                {c.unreadCount > 0 && (
                  <span style={{ fontSize: 10, color: "#fff", background: C.red, borderRadius: 10, padding: "1px 6px", fontWeight: 700, minWidth: 18, textAlign: "center" }}>
                    {c.unreadCount}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300 }} onClick={() => setContextMenu(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
            background: C.surface, borderRadius: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,.2)", border: `1px solid ${C.border}`,
            overflow: "hidden", minWidth: 200,
          }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700, color: C.muted }}>
              Tuy chon
            </div>
            {(() => {
              const conv = conversations.find(c => c.id === contextMenu.id);
              const isGroup = conv?.type === "group";
              return (
                <button className="tap" onClick={() => { setConfirmDelete(contextMenu.id); setContextMenu(null); }}
                  style={{ width: "100%", padding: "12px 16px", border: "none", background: "transparent", fontSize: 14, fontWeight: 600, color: C.red, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  {isGroup ? "\uD83D\uDEAA Roi nhom" : "\uD83D\uDDD1\uFE0F Xoa cuoc tro chuyen"}
                </button>
              );
            })()}
            <button className="tap" onClick={() => setContextMenu(null)}
              style={{ width: "100%", padding: "12px 16px", borderTop: `1px solid ${C.border}`, background: "transparent", fontSize: 14, fontWeight: 500, color: C.muted, textAlign: "center", cursor: "pointer", border: "none" }}>
              Huy
            </button>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)" }}>
          <div style={{ background: C.surface, borderRadius: 16, padding: "24px 20px", width: 280, textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,.2)" }}>
            {(() => {
              const conv = conversations.find(c => c.id === confirmDelete);
              const isGroup = conv?.type === "group";
              return (<>
                <div style={{ fontSize: 32, marginBottom: 10 }}>{isGroup ? "\uD83D\uDEAA" : "\uD83D\uDDD1\uFE0F"}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>{isGroup ? "Roi nhom?" : "Xoa cuoc tro chuyen?"}</div>
                <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>{isGroup ? "Ban se roi khoi nhom nay va khong nhan tin nhan nua." : "Cuoc tro chuyen se bi xoa khoi danh sach cua ban."}</div>
              </>);
            })()}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="tap" onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", fontSize: 14, fontWeight: 600, color: C.text, cursor: "pointer" }}>
                Huy
              </button>
              <button className="tap" onClick={() => deleteConversation(confirmDelete)}
                style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: C.red, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                {(() => { const c = conversations.find(x => x.id === confirmDelete); return c?.type === "group" ? "Roi" : "Xoa"; })()}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNew && <NewChatModal userId={userId} onSelect={handleNewChat} onClose={() => setShowNew(null)} initialMode={showNew} />}
    </div>
  );
}
