import { useRef, useEffect, useCallback, useState } from "react";
import { C } from "../../constants";

export default function ChatInput({
  text, setText, replyTo, setReplyTo,
  isListening, setIsListening,
  uploading, locLoading, uploadError, setUploadError,
  showAttach, setShowAttach,
  mentionQuery, setMentionQuery, mentionList, insertMention,
  getName, onSend, onImageSelect, onFileSelect, onSendLocation, onStartCamera,
  inputRef, imageInputRef, fileInputRef,
  // Camera
  showCamera, videoRef, canvasRef, onStopCamera, onCapturePhoto,
}) {
  const recognitionRef = useRef(null);
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
  }, [isListening, setText, setIsListening]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setText(val);
    // Detect @ mention
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@(\S*)$/);
    setMentionQuery(atMatch ? atMatch[1].toLowerCase() : null);
  };

  return (
    <>
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
      <div style={{ flexShrink: 0, background: C.surface, borderTop: `1px solid ${C.border}`, paddingBottom: 4 }}>
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
            <button className="tap" onClick={onSendLocation}
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
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: p.color || C.accent, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {(p.name || "?")[0].toUpperCase()}
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
          <button className="tap" onClick={onStartCamera}
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
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
              placeholder={isListening ? "Đang chuyển giọng nói..." : "Nhập tin nhắn..."}
              style={{ flex: 1, minWidth: 0, fontSize: 15, color: C.text, background: "transparent", border: "none", outline: "none", padding: "10px 14px", lineHeight: 1.3 }} />
          </div>

          <button className="tap" onClick={onSend} disabled={!text.trim()}
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
      <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onImageSelect} />
      <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={onFileSelect} />

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
            <button className="tap" onClick={onStopCamera}
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
            <button className="tap" onClick={onCapturePhoto}
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
    </>
  );
}
