import { forwardRef } from "react";
import { C } from "../../constants";
import ChatBubble from "../ChatBubble";

const MessageList = forwardRef(function MessageList({
  messages, loading, userId, convType, convName,
  linkedProject, projectTasks, otherTyping,
  pinnedMsgs, getName, getStatus, deleteMessage, togglePinMsg,
  onReply, bottomRef,
}, scrollRef) {
  return (
    <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "12px 10px 8px", WebkitOverflowScrolling: "touch" }}>
      {loading && <div style={{ textAlign: "center", padding: 30, color: C.muted, fontSize: 12 }}>Đang tải...</div>}
      {!loading && messages.length === 0 && (
        linkedProject ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: C.muted }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📂</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: linkedProject.color }}>{linkedProject.name}</div>
            <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>
              Nhóm chat dự án — {linkedProject.members?.length || 1} thành viên
              {projectTasks.length > 0 && <><br />{projectTasks.length} công việc · bấm 📋 để xem & giao việc</>}
            </div>
            <div style={{ fontSize: 11, marginTop: 10, color: C.accent, fontWeight: 600 }}>
              Trao đổi tiến độ, giao việc, báo cáo tại đây
            </div>
          </div>
        ) : convType === "group" ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: C.muted }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>👥</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{convName}</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Nhóm đã được tạo — bắt đầu trao đổi</div>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>👋</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Bắt đầu trò chuyện!</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Gửi lời chào đến {convName || "bạn bè"}</div>
          </div>
        )
      )}
      {messages.map((m, i) => {
        const showDate = i === 0 || new Date(m.created_at).toDateString() !== new Date(messages[i - 1].created_at).toDateString();
        const status = getStatus(m);
        const isLastOwn = m.sender_id === userId && !messages.slice(i + 1).some(nm => nm.sender_id === userId);
        return (
          <div key={m.id} id={`msg-${m.id}`}>
            {showDate && (
              <div style={{ textAlign: "center", padding: "10px 0 6px" }}>
                <span style={{ fontSize: 10, color: C.muted, background: `${C.border}66`, padding: "3px 10px", borderRadius: 10 }}>
                  {new Date(m.created_at).toLocaleDateString("vi-VN", { weekday: "short", day: "numeric", month: "short" })}
                </span>
              </div>
            )}
            <ChatBubble
              message={m}
              isMine={m.sender_id === userId}
              senderName={getName(m.sender_id)}
              status={isLastOwn ? status : null}
              isPinned={pinnedMsgs.includes(m.id)}
              onDelete={deleteMessage}
              onPin={togglePinMsg}
              onReply={() => onReply(m)}
              allMessages={messages}
              getName={getName}
            />
          </div>
        );
      })}

      {otherTyping && (
        <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 6 }}>
          <div style={{ background: C.card, borderRadius: "16px 16px 16px 4px", padding: "10px 14px", border: `1px solid ${C.border}`, display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.muted, animation: "typeDot 1.2s infinite 0s" }} />
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.muted, animation: "typeDot 1.2s infinite 0.2s" }} />
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.muted, animation: "typeDot 1.2s infinite 0.4s" }} />
          </div>
        </div>
      )}
      <div ref={bottomRef} style={{ height: 4 }} />
    </div>
  );
});

export default MessageList;
