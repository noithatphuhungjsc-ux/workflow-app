import { C } from "../../constants";

export default function ChatHeader({
  convName, convType, isSubThread, parentConvName,
  otherTyping, linkedProject, subChats, threadCurrentMembers,
  onBack, onShowThreads, onShowMemberMgmt, onShowProjectInfo, onStartCall,
  pinnedMessages, profiles, togglePinMsg, projectTasks,
}) {
  return (
    <>
      {/* Header bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "0 8px", minHeight: 52, flexShrink: 0,
        background: C.surface, borderBottom: `1px solid ${C.border}`,
      }}>
        <button className="tap" onClick={onBack}
          style={{ background: "none", border: "none", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: C.accent }}>
          ‹
        </button>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
          {(convName || "?")[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {isSubThread ? `📑 ${convName}` : (convName || "Trò chuyện")}
          </div>
          <div style={{ fontSize: 10, fontWeight: 500, color: isSubThread ? C.muted : (otherTyping ? C.accent : C.green) }}>
            {isSubThread ? `← ${parentConvName} · ${threadCurrentMembers.length} thành viên` : (otherTyping ? "Đang nhập..." : "Đang hoạt động")}
          </div>
        </div>
        {isSubThread && (
          <button className="tap" onClick={onShowMemberMgmt}
            style={{ position:"relative", background:"none", border:"none", width:36, height:36, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:C.accent }}>
            👥
            <span style={{ position:"absolute", top:2, right:1, background:C.accent, color:"#fff", fontSize:8, fontWeight:700, borderRadius:8, minWidth:14, height:14, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 2px" }}>
              {threadCurrentMembers.length}
            </span>
          </button>
        )}
        {convType === "group" && !isSubThread && (
          <button className="tap" onClick={onShowThreads}
            style={{ position:"relative", background: "none", border: "none", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: linkedProject?.color || C.accent }}>
            📑
            {subChats.length > 0 && (
              <span style={{ position:"absolute", top:2, right:2, background:C.accent, color:"#fff", fontSize:8, fontWeight:700, borderRadius:8, minWidth:14, height:14, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 2px" }}>{subChats.length}</span>
            )}
          </button>
        )}
        {(linkedProject || convType === "group") && (
          <button className="tap" onClick={onShowProjectInfo}
            style={{ background: "none", border: "none", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: linkedProject?.color || C.accent }}>
            {linkedProject ? "📂" : "ℹ️"}
          </button>
        )}
        <button className="tap" onClick={() => onStartCall("video")}
          style={{ background: "none", border: "none", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
          </svg>
        </button>
        <button className="tap" onClick={() => onStartCall("audio")}
          style={{ background: "none", border: "none", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 4 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
          </svg>
        </button>
      </div>

      {/* Pinned messages */}
      {pinnedMessages.length > 0 && (
        <div style={{ background: `${C.gold}08`, borderBottom: `1px solid ${C.gold}22`, padding: "6px 12px", maxHeight: 100, overflowY: "auto", flexShrink: 0 }}>
          {pinnedMessages.map(m => {
            const sender = profiles?.find(p => p.id === m.sender_id);
            return (
              <div key={m.id} style={{ fontSize: 12, color: C.text, padding: "5px 8px", background: C.surface, borderRadius: 8, marginBottom: 3, display: "flex", alignItems: "center", gap: 6, borderLeft: `3px solid ${C.gold}` }}>
                <span style={{ fontSize: 11 }}>📌</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {sender?.display_name && <span style={{ fontWeight: 600, fontSize: 11, color: C.accent, marginRight: 4 }}>{sender.display_name}:</span>}
                  {m.type === "image" ? "📷 Ảnh" : m.type === "location" ? "📍 Vị trí" : m.content}
                </span>
                <button className="tap" onClick={() => togglePinMsg(m.id)}
                  style={{ background: "none", border: "none", fontSize: 12, color: C.muted, cursor: "pointer", flexShrink: 0, padding: "2px 4px" }}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Project progress strip */}
      {linkedProject && projectTasks.length > 0 && (
        <div className="tap" onClick={onShowProjectInfo}
          style={{ flexShrink:0, display:"flex", alignItems:"center", gap:8, padding:"6px 12px", background:`${linkedProject.color}08`, borderBottom:`1px solid ${linkedProject.color}22`, cursor:"pointer" }}>
          <div style={{ flex:1, height:3, background:C.border, borderRadius:2, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${Math.round(projectTasks.filter(t=>t.status==="done").length/projectTasks.length*100)}%`, background:linkedProject.color, borderRadius:2 }} />
          </div>
          <span style={{ fontSize:10, color:linkedProject.color, fontWeight:700, whiteSpace:"nowrap" }}>
            {projectTasks.filter(t=>t.status==="done").length}/{projectTasks.length} xong
            {projectTasks.filter(t=>t.status==="inprogress").length > 0 && ` · ${projectTasks.filter(t=>t.status==="inprogress").length} đang làm`}
          </span>
        </div>
      )}
    </>
  );
}
