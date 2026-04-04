import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { C } from "../constants";
import { useChat } from "../hooks/useChat";
import CallScreen from "./CallScreen";
import { supabase } from "../lib/supabase";
import ProjectInfoModal from "./ProjectInfoModal";
import ChatHeader from "./chat/ChatHeader";
import MessageList from "./chat/MessageList";
import ChatInput from "./chat/ChatInput";

const PIN_MSG_KEY = (convId) => `wf_pinned_msgs_${convId}`;
const getPinnedMsgs = (convId) => { try { return JSON.parse(localStorage.getItem(PIN_MSG_KEY(convId)) || "[]"); } catch { return []; } };
const setPinnedMsgsStore = (convId, ids) => localStorage.setItem(PIN_MSG_KEY(convId), JSON.stringify(ids));

export default function ChatRoom({ conversationId, userId, convName, convType = "dm", profiles, onBack, linkedProject, projectTasks = [], patchTask, addTask, patchProject, isSubThread, parentConvName, parentProjectMemberList }) {
  const { messages, loading, sendMessage, deleteMessage, otherTyping, setTyping, otherLastRead } = useChat(conversationId, userId);
  const [callState, setCallState] = useState(null);
  const [text, setText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [pinnedMsgs, setPinnedMsgs] = useState(() => getPinnedMsgs(conversationId));
  const [showAttach, setShowAttach] = useState(false);
  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showThreads, setShowThreads] = useState(false);
  const [activeThread, setActiveThread] = useState(null);
  const [newThreadName, setNewThreadName] = useState("");
  const [creatingThread, setCreatingThread] = useState(false);
  const [threadMembers, setThreadMembers] = useState([]);
  const [showMemberMgmt, setShowMemberMgmt] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const containerRef = useRef(null);

  // @ mention state
  const [mentionQuery, setMentionQuery] = useState(null);

  /* ─── SUB-THREADS ─── */
  const [subChats, setSubChats] = useState([]);
  useEffect(() => {
    if (!supabase || !conversationId || isSubThread) return;
    supabase.from("conversations").select("id, name, created_at")
      .eq("parent_id", conversationId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.warn("[WF] load sub-threads:", error); return; }
        setSubChats((data || []).map(c => ({
          convId: c.id, name: c.name || "Thread", createdAt: c.created_at,
        })));
      });
  }, [conversationId, isSubThread]);

  const [chatMembers, setChatMembers] = useState([]);
  useEffect(() => {
    if (!supabase || !userId || !conversationId) return;
    supabase.from("conversation_members").select("user_id").eq("conversation_id", conversationId)
      .then(({ data }) => {
        if (!data) return;
        const others = data.map(d => d.user_id).filter(id => id !== userId);
        setChatMembers(others.map(uid => {
          const p = (profiles || []).find(pr => pr.id === uid);
          return { supaId: uid, name: p?.display_name || uid.slice(0, 6), color: p?.avatar_color || C.accent };
        }));
      });
  }, [conversationId, userId, profiles]);

  const [threadCurrentMembers, setThreadCurrentMembers] = useState([]);
  useEffect(() => {
    if (!isSubThread || !supabase || !conversationId) return;
    supabase.from("conversation_members").select("user_id").eq("conversation_id", conversationId)
      .then(({ data }) => { if (data) setThreadCurrentMembers(data.map(d => d.user_id)); });
  }, [isSubThread, conversationId]);

  const availableForThread = (() => {
    if (!isSubThread) return [];
    if (parentProjectMemberList?.length > 0) {
      return parentProjectMemberList.filter(m => !threadCurrentMembers.includes(m.supaId));
    }
    return (profiles || [])
      .filter(p => p.id !== userId && !threadCurrentMembers.includes(p.id))
      .map(p => ({ supaId: p.id, name: p.display_name || "?", color: p.avatar_color }));
  })();

  const toggleThreadMember = (supaId) => {
    setThreadMembers(prev => prev.includes(supaId) ? prev.filter(id => id !== supaId) : [...prev, supaId]);
  };

  const createSubThread = async () => {
    const name = newThreadName.trim();
    if (!name || !supabase || !userId || creatingThread) return;
    setCreatingThread(true);
    try {
      const { data: conv, error } = await supabase.from("conversations")
        .insert({ type: "group", name, created_by: userId, parent_id: conversationId })
        .select().single();
      if (error) { console.error("[WF] create sub-thread conv:", error); setCreatingThread(false); return; }
      const addedIds = threadMembers.length > 0 ? threadMembers : chatMembers.map(m => m.supaId);
      const memberInserts = [{ conversation_id: conv.id, user_id: userId }];
      addedIds.forEach(uid => { if (uid !== userId) memberInserts.push({ conversation_id: conv.id, user_id: uid }); });
      const { error: memErr } = await supabase.from("conversation_members").insert(memberInserts);
      if (memErr) console.warn("[WF] insert sub-thread members:", memErr);
      const addedNames = addedIds.map(uid => {
        const p = (profiles || []).find(pr => pr.id === uid);
        return p?.display_name || "";
      }).filter(Boolean);
      await supabase.from("messages").insert({
        conversation_id: conv.id, sender_id: userId,
        content: `📑 Chủ đề "${name}" — ${addedNames.length > 0 ? addedNames.join(", ") : "tất cả thành viên"}`,
        type: "system",
      });
      await sendMessage(`📑 Đã tạo chủ đề mới: "${name}"`, "system");
      setSubChats(prev => [...prev, { convId: conv.id, name, createdAt: new Date().toISOString() }]);
      setNewThreadName("");
      setThreadMembers([]);
      setActiveThread({ convId: conv.id, name });
      setShowThreads(false);
    } catch (e) { console.error("[WF] createSubThread:", e); }
    setCreatingThread(false);
  };

  const [convCreatedBy, setConvCreatedBy] = useState(null);
  useEffect(() => {
    if (!supabase || !conversationId) return;
    supabase.from("conversations").select("created_by").eq("id", conversationId).maybeSingle()
      .then(({ data }) => { if (data) setConvCreatedBy(data.created_by); });
  }, [conversationId]);

  const isDirectorUser = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}").role === "director"; } catch { return false; } })();
  const canManageMembers = convCreatedBy === userId || isDirectorUser;

  const addThreadMember = async (supaId) => {
    if (!supabase || !conversationId || !supaId) return;
    if (!canManageMembers) { alert("Chỉ người tạo nhóm hoặc giám đốc mới có quyền thêm thành viên."); return; }
    const { error } = await supabase.from("conversation_members").insert({ conversation_id: conversationId, user_id: supaId });
    if (error) { console.warn("[WF] addThreadMember:", error); return; }
    const p = (profiles || []).find(pr => pr.id === supaId);
    await sendMessage(`👤 ${p?.display_name || "?"} đã được thêm vào chủ đề`, "system");
    setThreadCurrentMembers(prev => [...prev, supaId]);
  };

  const removeThreadMember = async (supaId) => {
    if (!supabase || !conversationId || !supaId || supaId === userId) return;
    if (!canManageMembers) { alert("Chỉ người tạo nhóm hoặc giám đốc mới có quyền xóa thành viên."); return; }
    const { error } = await supabase.from("conversation_members").delete()
      .eq("conversation_id", conversationId).eq("user_id", supaId);
    if (error) { console.warn("[WF] removeThreadMember:", error); return; }
    const p = (profiles || []).find(pr => pr.id === supaId);
    await sendMessage(`👤 ${p?.display_name || "?"} đã rời khỏi chủ đề`, "system");
    setThreadCurrentMembers(prev => prev.filter(id => id !== supaId));
  };

  /* ─── SCROLL ─── */
  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, [messages.length, otherTyping]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  /* ─── SEND ─── */
  const handleSend = async () => {
    const t = text.replace(/\[|\]/g, "").trim();
    if (!t) return;
    setText("");
    const extra = replyTo ? { reply_to: replyTo.id } : {};
    setReplyTo(null);
    await sendMessage(t, "text", extra);
    inputRef.current?.focus();
  };

  const handleTextChange = (val) => {
    setText(val);
    setTyping(!!val.trim());
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

  /* ─── PROFILES ─── */
  const DEV_PROFILES = [
    { id: "trinh",  display_name: "Nguyen Duy Trinh", avatar_color: "#9b59b6" },
    { id: "lien",   display_name: "Liên Kế toán",     avatar_color: "#e74c3c" },
    { id: "hung",   display_name: "Pham Van Hung",    avatar_color: "#3498db" },
    { id: "mai",    display_name: "Tran Thi Mai",     avatar_color: "#27ae60" },
    { id: "duc",    display_name: "Le Minh Duc",      avatar_color: "#8e44ad" },
    { id: "tung",   display_name: "Tùng Tổ trưởng",   avatar_color: "#2980b9" },
    { id: "tam",    display_name: "Tâm Tổ phó",       avatar_color: "#16a085" },
    { id: "duong",  display_name: "Đương Tổ phó",     avatar_color: "#27ae60" },
    { id: "minh",   display_name: "Minh Hoàn thiện",  avatar_color: "#3498db" },
    { id: "lien2",  display_name: "Liển Hoàn thiện",  avatar_color: "#1abc9c" },
    { id: "tuan",   display_name: "Tuấn Thợ mộc",    avatar_color: "#d35400" },
    { id: "trang",  display_name: "Trang Táo đỏ",     avatar_color: "#c0392b" },
    { id: "hai",    display_name: "Hải Thợ mộc",      avatar_color: "#e67e22" },
    { id: "hoai",   display_name: "Hoài Táo đỏ",      avatar_color: "#e74c3c" },
  ];
  const mergedProfiles = (() => {
    const all = [...(profiles || [])];
    const normalize = s => (s || "").toLowerCase().replace(/\s+/g, "");
    DEV_PROFILES.forEach(d => {
      if (!all.some(p => p.id === d.id || normalize(p.display_name) === normalize(d.display_name)))
        all.push(d);
    });
    return all;
  })();

  const mentionList = chatMembers
    .filter(m => !mentionQuery || (m.name || "").toLowerCase().includes(mentionQuery))
    .map(m => ({ id: m.supaId, name: m.name, color: m.color }));

  /* ─── PIN ─── */
  const togglePinMsg = (msgId) => {
    const next = pinnedMsgs.includes(msgId) ? pinnedMsgs.filter(id => id !== msgId) : [...pinnedMsgs, msgId];
    setPinnedMsgs(next);
    setPinnedMsgsStore(conversationId, next);
  };

  /* ─── FILE UPLOAD ─── */
  const [uploadError, setUploadError] = useState("");
  const uploadFile = async (file, type) => {
    if (!supabase || !file) return null;
    setUploading(true);
    setUploadError("");
    setShowAttach(false);
    try {
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

  /* ─── LOCATION ─── */
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

  /* ─── CAMERA ─── */
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

  /* ─── HELPERS ─── */
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

  const handleReply = (m) => {
    setReplyTo(m);
    inputRef.current?.focus();
  };

  return createPortal(
    <div ref={containerRef} className="chatroom-container" style={{ background: C.bg }}>

      <ChatHeader
        convName={convName}
        convType={convType}
        isSubThread={isSubThread}
        parentConvName={parentConvName}
        otherTyping={otherTyping}
        linkedProject={linkedProject}
        subChats={subChats}
        threadCurrentMembers={threadCurrentMembers}
        onBack={onBack}
        onShowThreads={() => setShowThreads(true)}
        onShowMemberMgmt={() => setShowMemberMgmt(true)}
        onShowProjectInfo={() => setShowProjectInfo(true)}
        onStartCall={startCall}
        pinnedMessages={pinnedMessages}
        profiles={profiles}
        togglePinMsg={togglePinMsg}
        projectTasks={projectTasks}
      />

      {/* Call Screen */}
      {callState && (
        <CallScreen conversationId={conversationId} userId={userId} peerName={convName}
          isIncoming={callState.isIncoming} mode={callState.mode || "audio"}
          onEnd={() => setCallState(null)} />
      )}

      <MessageList
        ref={scrollRef}
        messages={messages}
        loading={loading}
        userId={userId}
        convType={convType}
        convName={convName}
        linkedProject={linkedProject}
        projectTasks={projectTasks}
        otherTyping={otherTyping}
        pinnedMsgs={pinnedMsgs}
        getName={getName}
        getStatus={getStatus}
        deleteMessage={deleteMessage}
        togglePinMsg={togglePinMsg}
        onReply={handleReply}
        bottomRef={bottomRef}
      />

      <ChatInput
        text={text}
        setText={handleTextChange}
        replyTo={replyTo}
        setReplyTo={setReplyTo}
        isListening={isListening}
        setIsListening={setIsListening}
        uploading={uploading}
        locLoading={locLoading}
        uploadError={uploadError}
        setUploadError={setUploadError}
        showAttach={showAttach}
        setShowAttach={setShowAttach}
        mentionQuery={mentionQuery}
        setMentionQuery={setMentionQuery}
        mentionList={mentionList}
        insertMention={insertMention}
        getName={getName}
        onSend={handleSend}
        onImageSelect={handleImageSelect}
        onFileSelect={handleFileSelect}
        onSendLocation={sendLocation}
        onStartCamera={startCamera}
        inputRef={inputRef}
        imageInputRef={imageInputRef}
        fileInputRef={fileInputRef}
        showCamera={showCamera}
        videoRef={videoRef}
        canvasRef={canvasRef}
        onStopCamera={stopCamera}
        onCapturePhoto={capturePhoto}
      />

      {/* Project Info Modal */}
      {showProjectInfo && (convType === "group" || linkedProject) && (
        <ProjectInfoModal
          conversationId={conversationId}
          convName={convName}
          profiles={mergedProfiles}
          userId={userId}
          linkedProject={linkedProject}
          onClose={() => setShowProjectInfo(false)}
        />
      )}

      {/* ── Sub-thread panel (slide from right) ── */}
      {showThreads && convType === "group" && (
        <div onClick={() => setShowThreads(false)} style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,.5)" }}>
          <div onClick={e => e.stopPropagation()} style={{
            position:"absolute", top:0, bottom:0, right:0, width:"85%", maxWidth:360,
            background:C.surface, display:"flex", flexDirection:"column",
            animation:"slideLeft .2s ease-out", boxShadow:"-4px 0 20px rgba(0,0,0,.15)",
          }}>
            <div style={{ padding:"14px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10 }}>
              <button className="tap" onClick={() => setShowThreads(false)} style={{ background:"none", border:"none", fontSize:20, color:C.muted, padding:2 }}>✕</button>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700, color:C.text }}>📑 Chủ đề</div>
                <div style={{ fontSize:11, color:C.muted }}>{linkedProject?.name || convName}</div>
              </div>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"10px 12px" }}>
              {subChats.length === 0 && (
                <div style={{ textAlign:"center", padding:"30px 16px", color:C.muted }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>📑</div>
                  <div style={{ fontSize:13, fontWeight:600 }}>Chưa có chủ đề nào</div>
                  <div style={{ fontSize:11, marginTop:4 }}>Tạo chủ đề để bàn chuyên sâu về từng vấn đề</div>
                </div>
              )}
              {subChats.map(sc => {
                const memberCount = chatMembers.length + 1;
                return (
                  <div key={sc.convId} className="tap" onClick={() => { setActiveThread(sc); setShowThreads(false); }}
                    style={{
                      display:"flex", alignItems:"center", gap:10, padding:"12px 14px",
                      background:C.card, borderRadius:12, border:`1px solid ${C.border}`, marginBottom:8, cursor:"pointer",
                    }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:`${linkedProject?.color || C.accent}12`,
                      display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>💬</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sc.name}</div>
                      <div style={{ fontSize:10, color:C.muted }}>
                        {memberCount} thành viên · {sc.createdAt ? new Date(sc.createdAt).toLocaleDateString("vi-VN") : ""}
                      </div>
                    </div>
                    <span style={{ fontSize:12, color:C.muted }}>›</span>
                  </div>
                );
              })}
            </div>
            <div style={{ padding:"12px 14px", borderTop:`1px solid ${C.border}`, background:C.card }}>
              <div style={{ display:"flex", gap:8, marginBottom: chatMembers.length > 0 ? 8 : 0 }}>
                <input value={newThreadName} onChange={e => setNewThreadName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") createSubThread(); }}
                  placeholder="Tên chủ đề mới..."
                  style={{ flex:1, padding:"10px 12px", borderRadius:10, border:`1.5px solid ${C.border}`, background:C.bg, fontSize:14, color:C.text, outline:"none" }} />
                <button className="tap" onClick={createSubThread} disabled={!newThreadName.trim() || creatingThread}
                  style={{
                    padding:"10px 16px", borderRadius:10, border:"none", fontWeight:700, fontSize:13, cursor:"pointer",
                    background: newThreadName.trim() ? (linkedProject?.color || C.accent) : C.border,
                    color: newThreadName.trim() ? "#fff" : C.muted, transition:"all .2s",
                  }}>
                  {creatingThread ? "..." : "+ Tạo"}
                </button>
              </div>
              {chatMembers.length > 0 && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  <span style={{ fontSize:11, color:C.muted, lineHeight:"28px", marginRight:2 }}>Thành viên:</span>
                  {chatMembers.map(m => {
                    const sel = threadMembers.includes(m.supaId);
                    const accent = linkedProject?.color || C.accent;
                    return (
                      <div key={m.supaId} className="tap" onClick={() => toggleThreadMember(m.supaId)}
                        style={{
                          display:"inline-flex", alignItems:"center", gap:5, padding:"4px 10px",
                          borderRadius:14, cursor:"pointer", fontSize:12, fontWeight:sel ? 600 : 400,
                          background: sel ? `${accent}18` : C.bg,
                          border: `1.5px solid ${sel ? accent : C.border}`,
                          color: sel ? accent : C.muted, transition:"all .15s",
                        }}>
                        <span style={{
                          width:20, height:20, borderRadius:"50%", fontSize:10, fontWeight:700, color:"#fff",
                          background: m.color || accent, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                        }}>{(m.name || "?").charAt(0).toUpperCase()}</span>
                        {m.name || m.supaId.slice(0,6)}
                        {sel && <span style={{ fontSize:14, lineHeight:1 }}>✓</span>}
                      </div>
                    );
                  })}
                  {threadMembers.length === 0 && (
                    <span style={{ fontSize:10, color:C.muted, fontStyle:"italic", lineHeight:"28px" }}>
                      (chưa chọn = tất cả)
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Sub-thread member management panel ── */}
      {showMemberMgmt && isSubThread && (
        <div onClick={() => setShowMemberMgmt(false)} style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,.5)" }}>
          <div onClick={e => e.stopPropagation()} style={{
            position:"absolute", top:0, bottom:0, right:0, width:"85%", maxWidth:360,
            background:C.surface, display:"flex", flexDirection:"column",
            animation:"slideLeft .2s ease-out", boxShadow:"-4px 0 20px rgba(0,0,0,.15)",
          }}>
            <div style={{ padding:"14px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:10 }}>
              <button className="tap" onClick={() => setShowMemberMgmt(false)} style={{ background:"none", border:"none", fontSize:20, color:C.muted, padding:2 }}>✕</button>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700, color:C.text }}>👥 Thành viên</div>
                <div style={{ fontSize:11, color:C.muted }}>{convName} · {threadCurrentMembers.length} người</div>
              </div>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"10px 12px" }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:8, textTransform:"uppercase", letterSpacing:.5 }}>Trong chủ đề</div>
              {threadCurrentMembers.map(uid => {
                const p = (profiles || []).find(pr => pr.id === uid);
                const name = p?.display_name || uid.slice(0, 6);
                const color = p?.avatar_color || C.accent;
                const isMe = uid === userId;
                return (
                  <div key={uid} style={{
                    display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
                    background:C.card, borderRadius:12, border:`1px solid ${C.border}`, marginBottom:6,
                  }}>
                    <span style={{
                      width:32, height:32, borderRadius:"50%", fontSize:13, fontWeight:700, color:"#fff",
                      background:color, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                    }}>{name.charAt(0).toUpperCase()}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{name}{isMe ? " (bạn)" : ""}</div>
                    </div>
                    {!isMe && canManageMembers && (
                      <button className="tap" onClick={() => removeThreadMember(uid)}
                        style={{ background:`${C.red}15`, border:"none", borderRadius:8, padding:"5px 10px", fontSize:11, fontWeight:600, color:C.red, cursor:"pointer" }}>
                        Xóa
                      </button>
                    )}
                  </div>
                );
              })}
              {canManageMembers && availableForThread.length > 0 && (
                <>
                  <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginTop:16, marginBottom:8, textTransform:"uppercase", letterSpacing:.5 }}>Thêm thành viên</div>
                  {availableForThread.map(m => (
                    <div key={m.supaId} style={{
                      display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
                      background:C.card, borderRadius:12, border:`1px solid ${C.border}`, marginBottom:6,
                    }}>
                      <span style={{
                        width:32, height:32, borderRadius:"50%", fontSize:13, fontWeight:700, color:"#fff",
                        background: m.color || C.accent, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                      }}>{(m.name || "?").charAt(0).toUpperCase()}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{m.name}</div>
                      </div>
                      <button className="tap" onClick={() => addThreadMember(m.supaId)}
                        style={{ background:`${C.accent}15`, border:"none", borderRadius:8, padding:"5px 10px", fontSize:11, fontWeight:600, color:C.accent, cursor:"pointer" }}>
                        + Thêm
                      </button>
                    </div>
                  ))}
                </>
              )}
              {availableForThread.length === 0 && threadCurrentMembers.length > 0 && (
                <div style={{ textAlign:"center", padding:"20px 16px", color:C.muted, fontSize:12 }}>
                  Tất cả thành viên dự án đã trong chủ đề
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Active sub-thread (nested ChatRoom) ── */}
      {activeThread && (
        <ChatRoom
          conversationId={activeThread.convId}
          userId={userId}
          convName={activeThread.name}
          convType="group"
          profiles={profiles}
          linkedProject={null}
          isSubThread
          parentConvName={convName}
          parentProjectMemberList={chatMembers}
          onBack={() => setActiveThread(null)}
        />
      )}

      <style>{`
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
        @keyframes typeDot { 0%,60%,100% { opacity: .3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-4px); } }
        @keyframes slideLeft { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>,
    document.body
  );
}
