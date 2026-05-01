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
        {/* Nhóm chat: chỉ video group call (có picker chọn members)
            DM 1-1: cả video + audio như cũ */}
        <button className="tap" onClick={() => onStartCall("video")}
          style={{ background: "none", border: "none", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginRight: convType === "group" ? 4 : 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill={C.accent}>
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
          </svg>
        </button>
        {convType !== "group" && (
          <button className="tap" onClick={() => onStartCall("audio")}
            style={{ background: "none", border: "none", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill={C.accent}>
              <path d="M19.23 15.26l-2.54-.29c-.61-.07-1.21.14-1.64.57l-1.84 1.84c-2.83-1.44-5.15-3.75-6.59-6.58l1.85-1.85c.43-.43.64-1.03.57-1.64l-.29-2.52c-.12-1.01-.97-1.77-1.99-1.77H5.03c-1.13 0-2.07.94-2 2.07.53 8.54 7.36 15.36 15.89 15.89 1.13.07 2.07-.87 2.07-2v-1.73c.01-1.01-.75-1.86-1.76-1.98z"/>
            </svg>
          </button>
        )}
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
