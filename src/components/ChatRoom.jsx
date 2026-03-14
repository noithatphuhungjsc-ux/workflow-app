import { useState, useRef, useEffect, useCallback } from "react";
import { C } from "../constants";
import { useChat } from "../hooks/useChat";
import ChatBubble from "./ChatBubble";
import CallScreen from "./CallScreen";
import { supabase } from "../lib/supabase";
import ProjectInfoModal from "./ProjectInfoModal";

const PIN_MSG_KEY = (convId) => `wf_pinned_msgs_${convId}`;
const getPinnedMsgs = (convId) => { try { return JSON.parse(localStorage.getItem(PIN_MSG_KEY(convId)) || "[]"); } catch { return []; } };
const setPinnedMsgsStore = (convId, ids) => localStorage.setItem(PIN_MSG_KEY(convId), JSON.stringify(ids));

export default function ChatRoom({ conversationId, userId, convName, convType = "dm", profiles, onBack, linkedProject, projectTasks = [], patchTask, addTask }) {
  const { messages, loading, sendMessage, deleteMessage, otherTyping, setTyping, otherLastRead } = useChat(conversationId, userId);
  const [callState, setCallState] = useState(null);
  // showTaskPanel removed — task management stays in tab Việc
  const [text, setText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [pinnedMsgs, setPinnedMsgs] = useState(() => getPinnedMsgs(conversationId));
  const [showAttach, setShowAttach] = useState(false);
  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, [messages.length, otherTyping]);

  // Keep chat fitted to visual viewport (no jumps when keyboard opens)
  const containerRef = useRef(null);
  useEffect(() => {
    const vp = window.visualViewport;
    if (!vp) return;
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      el.style.height = vp.height + "px";
      el.style.top = vp.offsetTop + "px";
    };
    update();
    vp.addEventListener("resize", update);
    vp.addEventListener("scroll", update);
    return () => { vp.removeEventListener("resize", update); vp.removeEventListener("scroll", update); };
  }, []);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleSend = async () => {
    const t = text.replace(/\[|\]/g, "").trim();
    if (!t) return;
    setText("");
    const extra = replyTo ? { reply_to: replyTo.id } : {};
    setReplyTo(null);
    await sendMessage(t, "text", extra);
    inputRef.current?.focus();
  };

  // @ mention state
  const [mentionQuery, setMentionQuery] = useState(null); // null = hidden, "" = show all

  const handleInputChange = (e) => {
    const val = e.target.value;
    setText(val);
    setTyping(!!val.trim());
    // Detect @ mention
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@(\S*)$/);
    setMentionQuery(atMatch ? atMatch[1].toLowerCase() : null);
  };

  const insertMention = (name) => {
    const cursor = inputRef.current?.selectionStart || text.length;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const replaced = before.replace(/@\S*$/, `@${name} `);
    setText(replaced + after);
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  // Use Supabase profiles if available, fallback to DEV accounts
  const DEV_PROFILES = [
    { id: "trinh", display_name: "Nguyen Duy Trinh", avatar_color: "#9b59b6" },
    { id: "lien",  display_name: "Lientran",         avatar_color: "#e74c3c" },
    { id: "hung",  display_name: "Pham Van Hung",    avatar_color: "#3498db" },
    { id: "mai",   display_name: "Tran Thi Mai",     avatar_color: "#27ae60" },
    { id: "duc",   display_name: "Le Minh Duc",      avatar_color: "#8e44ad" },
  ];
  const mergedProfiles = (profiles && profiles.length > 0) ? profiles : DEV_PROFILES;
  const localDevId = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}").id; } catch { return null; } })();
  const mentionList = mergedProfiles
    .filter(p => p.id !== userId && p.id !== localDevId && (!mentionQuery || (p.display_name || "").toLowerCase().includes(mentionQuery)))
    .map(p => ({ id: p.id, name: p.display_name || p.name || "?" }));

  // Pin/unpin message
  const togglePinMsg = (msgId) => {
    const next = pinnedMsgs.includes(msgId) ? pinnedMsgs.filter(id => id !== msgId) : [...pinnedMsgs, msgId];
    setPinnedMsgs(next);
    setPinnedMsgsStore(conversationId, next);
  };

  // Upload file to Supabase Storage
  const [uploadError, setUploadError] = useState("");
  const uploadFile = async (file, type) => {
    if (!supabase || !file) return null;
    setUploading(true);
    setUploadError("");
    setShowAttach(false);
    try {
      // Compress images before upload
      let uploadData = file;
      if (type === "image" && file.size > 500000) {
        try {
          const bitmap = await createImageBitmap(file);
          const canvas = document.createElement("canvas");
          const maxDim = 1200;
          let w = bitmap.width, h = bitmap.height;
          if (w > maxDim || h > maxDim) {
            const ratio = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * ratio); h = Math.round(h * ratio);
          }
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
          uploadData = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.8));
        } catch { uploadData = file; }
      }

      const ext = type === "image" ? "jpg" : file.name.split(".").pop();
      const path = `${conversationId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const contentType = type === "image" ? "image/jpeg" : file.type;
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": contentType, "x-file-path": path },
        body: uploadData,
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok || !uploadJson.url) {
        console.warn("Upload error:", JSON.stringify(uploadJson));
        setUploadError("Upload lỗi: " + (uploadJson.error || "Không xác định"));
        setUploading(false);
        return null;
      }
      const url = uploadJson.url;
      if (url) {
        await sendMessage(type === "image" ? "📷 Ảnh" : file.name, type, { file_url: url, file_name: file.name });
      }
    } catch (e) {
      console.warn("Upload failed:", e);
      setUploadError("Lỗi tải lên: " + (e.message || "không xác định"));
    }
    setUploading(false);
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, "image");
    e.target.value = "";
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, "file");
    e.target.value = "";
  };

  // Send location
  const [locLoading, setLocLoading] = useState(false);
  const sendLocation = () => {
    setShowAttach(false);
    if (!navigator.geolocation) {
      setUploadError("Trình duyệt không hỗ trợ vị trí");
      return;
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        await sendMessage(JSON.stringify({ lat, lng }), "location");
        setLocLoading(false);
      },
      (err) => {
        setLocLoading(false);
        setUploadError(err.code === 1 ? "Bạn chưa cho phép truy cập vị trí" : "Không lấy được vị trí");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Camera functions
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment", width: 1280, height: 720 } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setShowCamera(true);
      setShowAttach(false);
    } catch (err) {
      console.error("Lỗi truy cập camera:", err);
      setUploadError("Không thể truy cập camera");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob(async (blob) => {
      if (blob) {
        stopCamera();
        await uploadFile(blob, "image");
      }
    }, "image/jpeg", 0.8);
  };

  // Speech-to-text
  const hasSpeech = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (e) => { setText(e.results[0][0].transcript); };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  const startCall = (mode = "audio") => setCallState({ isIncoming: false, mode });

  const getName = (senderId) => {
    if (senderId === userId) return null;
    if (convType === "dm") return null;
    const p = mergedProfiles.find(pr => pr.id === senderId);
    return p?.display_name || "?";
  };

  const getStatus = (msg) => {
    if (msg.sender_id !== userId) return null;
    if (msg.id.toString().startsWith("temp_")) return "sending";
    if (otherLastRead && msg.created_at <= otherLastRead) return "seen";
    return "delivered";
  };

  const pinnedMessages = messages.filter(m => pinnedMsgs.includes(m.id));

  return (
    <div ref={containerRef} style={{
      position: "fixed", top: 0, left: 0, right: 0, height: "100dvh", zIndex: 100,
      display: "flex", flexDirection: "column", background: C.bg, maxWidth: 480, margin: "0 auto",
      overflow: "hidden",
    }}>
      <div style={{ background: C.surface, flexShrink: 0, height: "env(safe-area-inset-top, 0)" }} />

      {/* Header */}
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
            {convName || "Trò chuyện"}
          </div>
          <div style={{ fontSize: 10, fontWeight: 500, color: otherTyping ? C.accent : C.green }}>
            {otherTyping ? "Đang nhập..." : "Đang hoạt động"}
          </div>
        </div>
        {(linkedProject || convType === "group") && (
          <button className="tap" onClick={() => setShowProjectInfo(true)}
            style={{ background: "none", border: "none", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: linkedProject?.color || C.accent }}>
            {linkedProject ? "📂" : "ℹ️"}
          </button>
        )}
        <button className="tap" onClick={() => startCall("video")}
          style={{ background: "none", border: "none", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, color: C.accent }}>
          📹
        </button>
        <button className="tap" onClick={() => startCall("audio")}
          style={{ background: "none", border: "none", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, color: C.accent, marginRight: 4 }}>
          📞
        </button>
      </div>

      {/* Pinned messages — always visible below header */}
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

      {/* ── Project: compact progress strip (tap → project info) ── */}
      {linkedProject && projectTasks.length > 0 && (
        <div className="tap" onClick={() => setShowProjectInfo(true)}
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

      {/* Call Screen */}
      {callState && (
        <CallScreen conversationId={conversationId} userId={userId} peerName={convName}
          isIncoming={callState.isIncoming} mode={callState.mode || "audio"}
          onEnd={() => setCallState(null)} />
      )}

      {/* Messages */}
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
                onReply={() => { setReplyTo(m); inputRef.current?.focus(); }}
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

      {/* Upload progress / error */}
      {(uploading || locLoading || uploadError) && (
        <div style={{ padding: "6px 14px", background: uploadError ? `${C.red}10` : `${C.accent}10`, fontSize: 12, color: uploadError ? C.red : C.accent, fontWeight: 600, textAlign: "center", flexShrink: 0 }}>
          {uploading ? "Đang tải lên..." : locLoading ? "Đang lấy vị trí..." : uploadError}
          {uploadError && <button onClick={() => setUploadError("")} style={{ background: "none", border: "none", color: C.muted, marginLeft: 8, fontSize: 14, cursor: "pointer" }}>✕</button>}
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: `${C.accent}08`, borderTop: `1px solid ${C.border}`, borderLeft: `3px solid ${C.accent}` }}>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{ fontSize: 11, color: C.accent, fontWeight: 700 }}>Trả lời {getName(replyTo.sender_id)}</div>
            <div style={{ fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {replyTo.type === "image" ? "📷 Ảnh" : replyTo.type === "file" ? "📎 Tệp" : replyTo.content}
            </div>
          </div>
          <button onClick={() => setReplyTo(null)} style={{ background: "none", border: "none", fontSize: 18, color: C.muted, cursor: "pointer", padding: 4 }}>✕</button>
        </div>
      )}

      {/* Input bar */}
      <div style={{ flexShrink: 0, background: C.surface, borderTop: `1px solid ${C.border}`, paddingBottom: "env(safe-area-inset-bottom, 0)" }}>
        {isListening && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 0", background: `${C.red}10` }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, animation: "blink 1s infinite" }} />
            <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>Tôi đang nghe...</span>
          </div>
        )}

        {/* Attachment menu */}
        {showAttach && (
          <div style={{ display: "flex", gap: 12, padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
            <button className="tap" onClick={() => imageInputRef.current?.click()}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#4CAF5020", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📷</div>
              <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Thư viện</span>
            </button>
            <button className="tap" onClick={() => fileInputRef.current?.click()}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: `${C.accent}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📎</div>
              <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Tệp</span>
            </button>
            <button className="tap" onClick={sendLocation}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: `${C.red}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📍</div>
              <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Vị trí</span>
            </button>
          </div>
        )}

        {/* @ Mention popup */}
        {mentionQuery !== null && mentionList.length > 0 && (
          <div style={{ maxHeight: 150, overflowY: "auto", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
            {mentionList.map(p => (
              <div key={p.id} className="tap" onClick={() => insertMention(p.name)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", cursor: "pointer", borderBottom: `1px solid ${C.border}11` }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.accent, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {p.name[0].toUpperCase()}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, padding: "8px 10px" }}>
          {/* Attach button */}
          <button className="tap" onClick={() => setShowAttach(!showAttach)}
            style={{
              width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
              background: showAttach ? C.accent : `${C.accent}12`,
              border: "none", color: showAttach ? "#fff" : C.accent,
              fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all .2s",
            }}>
            +
          </button>

          {/* Camera button */}
          <button className="tap" onClick={startCamera}
            style={{
              width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
              background: `${C.accent}12`, border: "none", color: C.accent,
              fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all .2s",
            }}>
            📸
          </button>

          {hasSpeech && (
            <button className="tap" onClick={toggleVoice}
              style={{
                width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                background: isListening ? C.red : `${C.accent}12`,
                border: "none", color: isListening ? "#fff" : C.accent,
                fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all .2s",
              }}>
              🎤
            </button>
          )}

          <div style={{
            flex: 1, minWidth: 0, background: C.bg,
            border: `1.5px solid ${isListening ? C.red : C.border}`,
            borderRadius: 22, display: "flex", alignItems: "center",
            transition: "border-color .2s",
          }}>
            <input ref={inputRef} value={text} onChange={handleInputChange}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={isListening ? "Đang chuyển giọng nói..." : "Nhập tin nhắn..."}
              style={{ flex: 1, minWidth: 0, fontSize: 15, color: C.text, background: "transparent", border: "none", outline: "none", padding: "10px 14px", lineHeight: 1.3 }} />
          </div>

          <button className="tap" onClick={handleSend} disabled={!text.trim()}
            style={{
              width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
              background: text.trim() ? C.accent : C.border,
              border: "none", color: "#fff", fontSize: 16, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background .2s", opacity: text.trim() ? 1 : 0.5,
            }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageSelect} />
      <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleFileSelect} />

      {/* Camera Modal */}
      {showCamera && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: "#000", display: "flex", flexDirection: "column"
        }}>
          <video ref={videoRef} autoPlay playsInline
            style={{ flex: 1, width: "100%", objectFit: "cover" }} />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          
          <div style={{
            position: "absolute", top: 20, left: 20, right: 20,
            display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <button className="tap" onClick={stopCamera}
              style={{
                background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%",
                width: 44, height: 44, color: "#fff", fontSize: 20,
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
              ✕
            </button>
            <div style={{ color: "#fff", fontSize: 14, fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
              Chụp ảnh
            </div>
            <div style={{ width: 44 }} />
          </div>

          <div style={{
            position: "absolute", bottom: 40, left: 0, right: 0,
            display: "flex", justifyContent: "center", alignItems: "center"
          }}>
            <button className="tap" onClick={capturePhoto}
              style={{
                background: "#fff", border: "4px solid rgba(255,255,255,0.3)",
                borderRadius: "50%", width: 80, height: 80,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, color: "#000"
              }}>
              📷
            </button>
          </div>
        </div>
      )}

      {/* Project Info Modal */}
      {showProjectInfo && (convType === "group" || linkedProject) && (
        <ProjectInfoModal
          conversationId={conversationId}
          convName={convName}
          profiles={mergedProfiles}
          userId={userId}
          linkedProject={linkedProject}
          projectTasks={projectTasks}
          addTask={addTask}
          patchTask={patchTask}
          onClose={() => setShowProjectInfo(false)}
        />
      )}

      <style>{`
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
        @keyframes typeDot { 0%,60%,100% { opacity: .3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-4px); } }
      `}</style>
    </div>
  );
}
