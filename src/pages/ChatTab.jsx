import { useState, useEffect, useRef, useCallback } from "react";
import { C } from "../constants";
import { useSupabase } from "../contexts/SupabaseContext";
import { useConversations } from "../hooks/useConversations";
import ChatRoom from "../components/ChatRoom";
import NewChatModal, { decodeGroupName, getCategoryInfo, GROUP_CATEGORIES } from "../components/NewChatModal";
import { supabase } from "../lib/supabase";

export default function ChatTab({ openConvId, projects, tasks, patchTask, addTask }) {
  const { session, profile, isConnected, signUp, signIn, signInWithGoogle, signOut } = useSupabase();
  const userId = session?.user?.id;
  const { conversations, loading, totalUnread, refresh, createDM, createGroup } = useConversations(userId);
  const [activeConv, _setActiveConv] = useState(() => sessionStorage.getItem("wf_activeConv") || null);

  // Auto-open specific conversation (e.g., from project chat button)
  useEffect(() => {
    if (openConvId && openConvId !== activeConv) {
      _setActiveConv(openConvId);
      sessionStorage.setItem("wf_activeConv", openConvId);
    }
  }, [openConvId]);
  const setActiveConv = useCallback((id) => { if (id) sessionStorage.setItem("wf_activeConv", id); else sessionStorage.removeItem("wf_activeConv"); _setActiveConv(id); }, []);
  const [showNew, setShowNew] = useState(null); // null | "dm" | "group"
  const [profiles, setProfiles] = useState([]);
  const [contextMenu, setContextMenu] = useState(null); // { id }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [filter, setFilter] = useState("all"); // "all" | "dm" | "work" | "family" | ...
  // Auth form state
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

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
      const convId = await createGroup(selection.name, selection.memberIds);
      if (convId) setActiveConv(convId);
    }
  };

  const deleteConversation = async (convId) => {
    if (!supabase || !userId) return;
    // Check: nhóm chat chỉ admin (người tạo) mới được xóa
    const conv = conversations.find(c => c.id === convId);
    if (conv?.type === "group" && conv.created_by !== userId) {
      alert("Chỉ người tạo nhóm mới có quyền xóa cuộc trò chuyện này.");
      setConfirmDelete(null);
      setContextMenu(null);
      return;
    }
    const { error } = await supabase.from("conversation_members").delete()
      .eq("conversation_id", convId).eq("user_id", userId);
    if (error) {
      alert("Không xóa được. Kiểm tra quyền trên Supabase.");
      console.error("Delete conversation error:", error);
    }
    setConfirmDelete(null);
    setContextMenu(null);
    refresh();
  };

  const handleAuth = async () => {
    setAuthLoading(true);
    setAuthError("");
    const result = authMode === "register"
      ? await signUp(email, password, displayName)
      : await signIn(email, password);
    if (result.error) setAuthError(result.error);
    setAuthLoading(false);
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

  // Filter conversations
  const filtered = conversations.filter(c => {
    if (filter === "all") return true;
    if (filter === "dm") return c.type === "dm";
    if (c.type !== "group") return false;
    const decoded = decodeGroupName(c.displayName || c.name);
    return decoded.category === filter;
  });

  // Count groups by category for filter badges
  const groupCounts = {};
  conversations.forEach(c => {
    if (c.type === "group") {
      const decoded = decodeGroupName(c.displayName || c.name);
      groupCounts[decoded.category] = (groupCounts[decoded.category] || 0) + 1;
    }
  });
  const dmCount = conversations.filter(c => c.type === "dm").length;

  // Not connected — show auth form
  if (!isConnected) {
    return (
      <div style={{ padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ fontSize: 40, marginTop: 20 }}>💬</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, textAlign: "center" }}>Nhắn tin Team</div>
        <div style={{ fontSize: 13, color: C.muted, textAlign: "center", maxWidth: 280 }}>
          Đăng nhập hoặc đăng ký để bắt đầu nhắn tin với đồng nghiệp
        </div>

        <button className="tap" onClick={signInWithGoogle}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", maxWidth: 300, padding: "11px", borderRadius: 10, border: `1px solid ${C.border}`, background: "#fff", fontSize: 14, fontWeight: 600, color: "#333", cursor: "pointer" }}>
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#34A853" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.01 24.01 0 0 0 0 21.56l7.98-6.19z"/><path fill="#EA4335" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Đăng nhập bằng Google
        </button>

        <div style={{ fontSize: 12, color: C.muted }}>hoặc</div>

        <div style={{ display: "flex", gap: 0, background: C.bg, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}` }}>
          {[["login", "Đăng nhập"], ["register", "Đăng ký"]].map(([m, label]) => (
            <button key={m} className="tap" onClick={() => { setAuthMode(m); setAuthError(""); }}
              style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600, border: "none",
                background: authMode === m ? C.accent : "transparent",
                color: authMode === m ? "#fff" : C.muted }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ width: "100%", maxWidth: 300, display: "flex", flexDirection: "column", gap: 10 }}>
          {authMode === "register" && (
            <input value={displayName} onChange={e => setDisplayName(e.target.value)}
              placeholder="Tên hiển thị"
              style={{ fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", outline: "none", color: C.text, background: C.bg }} />
          )}
          <input value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" type="email"
            style={{ fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", outline: "none", color: C.text, background: C.bg }} />
          <input value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Mật khẩu" type="password"
            onKeyDown={e => { if (e.key === "Enter") handleAuth(); }}
            style={{ fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", outline: "none", color: C.text, background: C.bg }} />

          {authError && <div style={{ fontSize: 12, color: C.red, textAlign: "center" }}>{authError}</div>}

          <button className="tap" onClick={handleAuth} disabled={authLoading || !email || !password}
            style={{ padding: "11px", borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontSize: 14, fontWeight: 700, opacity: authLoading ? 0.6 : 1 }}>
            {authLoading ? "Đang xử lý..." : authMode === "register" ? "Đăng ký" : "Đăng nhập"}
          </button>
        </div>
      </div>
    );
  }

  // Active conversation
  if (activeConv) {
    const conv = conversations.find(c => c.id === activeConv);
    const rawName = conv?.displayName || "Trò chuyện";
    const decoded = conv?.type === "group" ? decodeGroupName(rawName) : null;
    const name = decoded ? decoded.name : rawName;
    // Detect project chat → find linked project & tasks
    const isProjectChat = decoded?.category === "project";
    // Also try to find project by chatId even if category is not "project"
    const linkedProject = (projects || []).find(p => p.chatId === activeConv) || null;
    const projectTasks = linkedProject ? (tasks || []).filter(t => t.projectId === linkedProject.id && !t.deleted)
      .sort((a, b) => (a.stepIndex ?? 999) - (b.stepIndex ?? 999)) : [];
    return (
      <ChatRoom conversationId={activeConv} userId={userId}
        convName={name} convType={conv?.type || "dm"} profiles={profiles}
        linkedProject={linkedProject} projectTasks={projectTasks} patchTask={patchTask} addTask={addTask}
        onBack={() => { setActiveConv(null); refresh(); }} />
    );
  }

  // Build filter pills
  const filterPills = [
    { key: "all", label: "Tất cả", count: conversations.length, color: C.text },
    { key: "dm", label: "Cá nhân", count: dmCount, color: C.accent },
    ...GROUP_CATEGORIES.filter(cat => groupCounts[cat.key]).map(cat => ({
      key: cat.key, label: `${cat.icon} ${cat.label}`, count: groupCounts[cat.key], color: cat.color,
    })),
  ];

  // Conversation list
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}
      onClick={() => contextMenu && setContextMenu(null)}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, gap: 6 }}>
        <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: C.text }}>
          Tin nhắn {totalUnread > 0 && <span style={{ fontSize: 11, color: "#fff", background: C.red, borderRadius: 10, padding: "1px 7px", marginLeft: 6 }}>{totalUnread}</span>}
        </div>
        <button className="tap" onClick={() => setShowNew("dm")}
          style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 10, padding: "6px 12px", fontSize: 12, fontWeight: 700 }}>
          + Nhắn tin
        </button>
        <button className="tap" onClick={() => setShowNew("group")}
          style={{ background: C.purple, color: "#fff", border: "none", borderRadius: 10, padding: "6px 12px", fontSize: 12, fontWeight: 700 }}>
          + Nhóm
        </button>
        <button className="tap" onClick={signOut}
          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 12, color: C.red, padding: "6px 10px", fontWeight: 600, cursor: "pointer" }}>
          Thoát
        </button>
      </div>

      {/* Filter pills */}
      {conversations.length > 0 && (
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
        {loading && <div style={{ textAlign: "center", padding: 20, color: C.muted, fontSize: 12 }}>Đang tải...</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: C.muted, fontSize: 13 }}>
            {filter === "all" ? <>Chưa có cuộc trò chuyện nào.<br />Bấm "+ Nhắn tin" hoặc "+ Nhóm" để bắt đầu.</> : "Không có cuộc trò chuyện nào trong mục này."}
          </div>
        )}
        {filtered.map(c => {
          const isGroup = c.type === "group";
          const decoded = isGroup ? decodeGroupName(c.displayName) : null;
          const catInfo = decoded ? getCategoryInfo(decoded.category) : null;
          const name = decoded ? decoded.name : c.displayName;

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
                {isGroup ? (catInfo?.icon || "👥") : (name || "?")[0].toUpperCase()}
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
                    {c.lastMessage.type === "image" ? "📷 Ảnh" : c.lastMessage.type === "location" ? "📍 Vị trí" : c.lastMessage.content}
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

      {/* Context menu (delete) */}
      {contextMenu && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300 }} onClick={() => setContextMenu(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
            background: C.surface, borderRadius: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,.2)", border: `1px solid ${C.border}`,
            overflow: "hidden", minWidth: 200,
          }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700, color: C.muted }}>
              Tùy chọn
            </div>
            {(() => {
              const conv = conversations.find(c => c.id === contextMenu.id);
              const canDelete = !conv || conv.type !== "group" || conv.created_by === userId;
              return canDelete ? (
                <button className="tap" onClick={() => { setConfirmDelete(contextMenu.id); setContextMenu(null); }}
                  style={{ width: "100%", padding: "12px 16px", border: "none", background: "transparent", fontSize: 14, fontWeight: 600, color: C.red, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  🗑️ Xóa cuộc trò chuyện
                </button>
              ) : (
                <div style={{ padding: "12px 16px", fontSize: 13, color: C.muted, textAlign: "center" }}>
                  Chỉ admin mới xóa được nhóm
                </div>
              );
            })()}
            <button className="tap" onClick={() => setContextMenu(null)}
              style={{ width: "100%", padding: "12px 16px", borderTop: `1px solid ${C.border}`, background: "transparent", fontSize: 14, fontWeight: 500, color: C.muted, textAlign: "center", cursor: "pointer", border: "none" }}>
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)" }}>
          <div style={{ background: C.surface, borderRadius: 16, padding: "24px 20px", width: 280, textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,.2)" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🗑️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>Xóa cuộc trò chuyện?</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Bạn sẽ rời khỏi cuộc trò chuyện này. Hành động không thể hoàn tác.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="tap" onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", fontSize: 14, fontWeight: 600, color: C.text, cursor: "pointer" }}>
                Hủy
              </button>
              <button className="tap" onClick={() => deleteConversation(confirmDelete)}
                style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: C.red, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {showNew && <NewChatModal userId={userId} onSelect={handleNewChat} onClose={() => setShowNew(null)} initialMode={showNew} />}
    </div>
  );
}
