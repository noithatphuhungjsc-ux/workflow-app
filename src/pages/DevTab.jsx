/* ═══════════════════════════════════════════════════════════
   DEV TAB — Chat với Claude Code từ điện thoại
   Gửi lệnh → Supabase → Bridge trên desktop → Claude Code
   ═══════════════════════════════════════════════════════════ */
import { useState, useEffect, useRef, useCallback } from "react";
import { C } from "../constants";
import { supabase } from "../lib/supabase";
import VConsole from "vconsole";

const PROJECT = "workflow-app";

/* ── Simple markdown-ish renderer ── */
function renderContent(text) {
  if (!text) return null;
  const blocks = [];
  let inCode = false;
  let codeLang = "";
  let codeLines = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      if (inCode) {
        blocks.push({ type: "code", lang: codeLang, content: codeLines.join("\n") });
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
    } else {
      blocks.push({ type: "text", content: line });
    }
  }
  if (inCode) blocks.push({ type: "code", lang: codeLang, content: codeLines.join("\n") });

  return blocks.map((b, i) => {
    if (b.type === "code") {
      return (
        <div key={i} style={{ position: "relative", margin: "8px 0" }}>
          {b.lang && (
            <div style={{ fontSize: 10, color: "#8be9fd", background: "#1e1e2e", padding: "4px 10px", borderRadius: "8px 8px 0 0", fontFamily: "monospace" }}>
              {b.lang}
            </div>
          )}
          <pre style={{
            background: "#1e1e2e", color: "#cdd6f4", padding: 12, borderRadius: b.lang ? "0 0 8px 8px" : 8,
            fontSize: 12, overflowX: "auto", margin: 0, fontFamily: "'Fira Code', 'Cascadia Code', monospace",
            lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}>
            {b.content}
          </pre>
          <button
            onClick={() => navigator.clipboard?.writeText(b.content)}
            style={{
              position: "absolute", top: b.lang ? 28 : 6, right: 6,
              background: "rgba(255,255,255,.1)", border: "none", color: "#cdd6f4",
              borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer",
            }}
          >
            📋 Copy
          </button>
        </div>
      );
    }
    // Text line
    const line = b.content;
    if (!line.trim()) return <div key={i} style={{ height: 8 }} />;
    // Bold **text**
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      // Inline code `text`
      return part.split(/(`[^`]+`)/g).map((seg, k) => {
        if (seg.startsWith("`") && seg.endsWith("`")) {
          return <code key={k} style={{ background: "rgba(0,0,0,.08)", padding: "1px 5px", borderRadius: 3, fontSize: "0.9em", fontFamily: "monospace" }}>{seg.slice(1, -1)}</code>;
        }
        return seg;
      });
    });
    // Headers
    if (line.startsWith("### ")) return <div key={i} style={{ fontWeight: 700, fontSize: 14, marginTop: 10 }}>{line.slice(4)}</div>;
    if (line.startsWith("## ")) return <div key={i} style={{ fontWeight: 700, fontSize: 15, marginTop: 12 }}>{line.slice(3)}</div>;
    if (line.startsWith("# ")) return <div key={i} style={{ fontWeight: 800, fontSize: 16, marginTop: 14 }}>{line.slice(2)}</div>;
    if (line.startsWith("- ") || line.startsWith("* ")) return <div key={i} style={{ paddingLeft: 12 }}>• {parts.slice(0).map(p => typeof p === 'string' ? p.replace(/^[-*]\s/, '') : p)}</div>;
    return <div key={i}>{parts}</div>;
  });
}

/* ── Status badge ── */
function StatusBadge({ status }) {
  const map = {
    pending: { bg: "#ffeaa7", color: "#b7791f", label: "⏳ Chờ xử lý" },
    processing: { bg: "#74b9ff", color: "#fff", label: "⚡ Đang chạy..." },
    done: { bg: "#00b894", color: "#fff", label: "✅ Xong" },
    error: { bg: "#e17055", color: "#fff", label: "❌ Lỗi" },
  };
  const s = map[status] || map.done;
  return (
    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: s.bg, color: s.color, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

/* ── Main DevTab ── */
// Init vConsole once (lazy — only when DevTab loads)
let vConsoleInstance = null;
function ensureVConsole() {
  if (!vConsoleInstance) {
    vConsoleInstance = new VConsole({ theme: "dark" });
  }
}

export default function DevTab({ user }) {
  useEffect(() => { ensureVConsole(); }, []);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId] = useState(() => `dev_${Date.now()}`);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [listening, setListening] = useState(false);
  const [images, setImages] = useState([]); // [{base64, preview}]
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const recogRef = useRef(null);
  const fileRef = useRef(null);
  const fileRef2 = useRef(null);

  /* ── Voice input (Speech-to-Text) ── */
  const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const sendRef = useRef(null); // ref to latest send function

  const toggleMic = useCallback(() => {
    if (listening && recogRef.current) {
      recogRef.current.stop();
      setListening(false);
      return;
    }
    if (!SpeechRecognition) { alert("Trình duyệt không hỗ trợ giọng nói"); return; }
    const r = new SpeechRecognition();
    r.lang = "vi-VN";
    r.continuous = false;       // nói 1 lần, tự dừng
    r.interimResults = true;
    let finalText = "";
    r.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript = e.results[i][0].transcript; // luôn lấy kết quả mới nhất
        if (e.results[i].isFinal) finalText = transcript;
      }
      setInput(transcript);
    };
    r.onend = () => {
      setListening(false);
      // Tự gửi nếu có text
      if (finalText.trim()) {
        setInput(finalText.trim());
        setTimeout(() => sendRef.current?.(), 200);
      }
    };
    r.onerror = () => setListening(false);
    recogRef.current = r;
    r.start();
    setListening(true);
  }, [listening, SpeechRecognition]);

  /* ── Image picker ── */
  const handleImagePick = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(",")[1];
        const preview = reader.result;
        setImages(prev => [...prev, { base64, preview, type: file.type }]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  }, []);

  const removeImage = useCallback((idx) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  }, []);

  /* ── Load messages + subscribe ── */
  useEffect(() => {
    if (!supabase) return;

    // Load recent messages
    const load = async () => {
      const { data } = await supabase
        .from("dev_messages")
        .select("*")
        .eq("project", PROJECT)
        .order("created_at", { ascending: true })
        .limit(50);
      if (data) setMessages(data);
    };
    load();

    // Subscribe to new messages + updates
    const channel = supabase
      .channel("dev_tab")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dev_messages", filter: `project=eq.${PROJECT}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.find(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dev_messages", filter: `project=eq.${PROJECT}` },
        (payload) => {
          setMessages((prev) => prev.map(m => m.id === payload.new.id ? payload.new : m));
          // If an assistant message went from processing→done, bridge is online
          if (payload.new.role === "assistant" && payload.new.status === "done") {
            setBridgeOnline(true);
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  /* ── Auto scroll ── */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  /* ── Check bridge status ── */
  useEffect(() => {
    if (!supabase) return;
    // Check if any message was processed recently (last 5 min)
    const check = async () => {
      const { data } = await supabase
        .from("dev_messages")
        .select("id")
        .eq("project", PROJECT)
        .eq("role", "assistant")
        .eq("status", "done")
        .gte("created_at", new Date(Date.now() - 5 * 60000).toISOString())
        .limit(1);
      setBridgeOnline(data && data.length > 0);
    };
    check();
  }, [messages]);

  /* ── Send message ── */
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text && images.length === 0) return;
    if (sending || !supabase) return;
    // Stop mic if still listening
    if (recogRef.current) { try { recogRef.current.stop(); } catch {} }
    setListening(false);
    setSending(true);
    const sendImages = [...images];
    setInput("");
    setImages([]);

    const metadata = sendImages.length > 0
      ? { images: sendImages.map(img => ({ base64: img.base64, type: img.type })) }
      : {};

    const { error } = await supabase.from("dev_messages").insert({
      session_id: sessionId,
      project: PROJECT,
      role: "user",
      content: text || "(ảnh đính kèm)",
      status: "pending",
      metadata,
    });

    if (error) alert("Không gửi được: " + error.message);
    setSending(false);
  }, [input, images, sending, sessionId]);

  // Keep sendRef up to date for voice auto-send
  sendRef.current = send;

  /* ── Clear history ── */
  const clearHistory = async () => {
    if (!confirm("Xóa toàn bộ lịch sử dev chat?")) return;
    await supabase.from("dev_messages").delete().eq("project", PROJECT);
    setMessages([]);
  };

  if (!supabase) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: C.muted }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔌</div>
        <div>Chưa kết nối Supabase</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 130px)" }}>
      {/* ── Header ── */}
      <div style={{ padding: "8px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>💻</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Dev Console</div>
            <div style={{ fontSize: 11, color: C.muted }}>Claude Code Remote</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: bridgeOnline ? "#00b894" : "#e17055",
            boxShadow: bridgeOnline ? "0 0 6px #00b894" : "none",
          }} />
          <span style={{ fontSize: 10, color: C.muted }}>{bridgeOnline ? "Bridge ON" : "Bridge OFF"}</span>
          <button onClick={clearHistory} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: C.muted }}>🗑️</button>
        </div>
      </div>

      {/* ── Messages ── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "8px 0", WebkitOverflowScrolling: "touch" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: C.muted }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🛠️</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Dev Console</div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              Gửi lệnh từ đây → Claude Code chạy trên máy tính<br />
              Đảm bảo <strong>dev-bridge.js</strong> đang chạy trên desktop
            </div>
            <div style={{ marginTop: 16, padding: 12, background: `${C.accent}10`, borderRadius: 10, fontSize: 11, fontFamily: "monospace", textAlign: "left" }}>
              <div style={{ color: C.accent, fontWeight: 700, marginBottom: 4 }}>$ Trên máy tính:</div>
              <div>cd /path/to/workflow-app</div>
              <div>node dev-bridge.js</div>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div key={msg.id} style={{
              marginBottom: 12,
              display: "flex",
              flexDirection: "column",
              alignItems: isUser ? "flex-end" : "flex-start",
            }}>
              {/* Status + time */}
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 3, display: "flex", gap: 6, alignItems: "center" }}>
                {!isUser && <StatusBadge status={msg.status} />}
                <span>{new Date(msg.created_at).toLocaleTimeString("vi", { hour: "2-digit", minute: "2-digit" })}</span>
                {msg.metadata?.deployed && <span style={{ color: "#00b894" }}>🚀 Deployed</span>}
              </div>

              {/* Bubble */}
              <div style={{
                maxWidth: "92%",
                padding: isUser ? "10px 14px" : "12px 14px",
                borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: isUser ? `linear-gradient(135deg, ${C.accent}, ${C.purple || "#8b5cf6"})` : C.card || "#f8f9fa",
                color: isUser ? "#fff" : C.text,
                fontSize: 13,
                lineHeight: 1.6,
                wordBreak: "break-word",
              }}>
                {/* Show attached images */}
                {msg.metadata?.images?.map((img, i) => (
                  <img key={i} src={`data:${img.type};base64,${img.base64}`}
                    style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 6 }} />
                ))}
                {isUser ? msg.content : renderContent(msg.content)}
              </div>
            </div>
          );
        })}

        {/* Processing indicator */}
        {messages.some(m => m.status === "processing") && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", color: C.accent }}>
            <div className="spin" style={{ width: 16, height: 16, border: `2px solid ${C.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 12 }}>Claude đang xử lý trên desktop...</span>
          </div>
        )}
      </div>

      {/* ── Input area ── */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, padding: "8px 0 12px" }}>
        {/* Image previews */}
        {images.length > 0 && (
          <div style={{ display: "flex", gap: 6, padding: "0 0 8px", overflowX: "auto" }} className="no-scrollbar">
            {images.map((img, i) => (
              <div key={i} style={{ position: "relative", flexShrink: 0 }}>
                <img src={img.preview} style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover" }} />
                <button onClick={() => removeImage(i)} style={{
                  position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%",
                  background: "#e17055", color: "#fff", border: "none", fontSize: 9, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>✕</button>
              </div>
            ))}
          </div>
        )}
        {/* Input row — single line */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button onClick={() => fileRef.current?.click()} title="Chụp ảnh"
            style={{ width: 32, height: 32, borderRadius: 8, background: "none", border: "none", color: C.muted, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            📷
          </button>
          <button onClick={() => fileRef2?.current?.click()} title="Đính kèm"
            style={{ width: 32, height: 32, borderRadius: 8, background: "none", border: "none", color: C.muted, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            📎
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={handleImagePick} style={{ display: "none" }} />
          <input ref={fileRef2} type="file" accept="image/*" multiple onChange={handleImagePick} style={{ display: "none" }} />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
            placeholder={listening ? "🔴 Đang nghe..." : "Nhập lệnh..."}
            style={{
              flex: 1, minWidth: 0, padding: "7px 10px", borderRadius: 20,
              border: `1.5px solid ${listening ? "#e17055" : C.border}`, background: C.card || "#f8f9fa",
              fontSize: 13, outline: "none", fontFamily: "inherit", color: C.text,
            }}
          />
          <button onClick={toggleMic} title="Giọng nói"
            style={{
              width: 32, height: 32, borderRadius: 8, background: listening ? "#e17055" : "none",
              border: "none", color: listening ? "#fff" : C.muted, fontSize: 16, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              animation: listening ? "pulse 1.5s infinite" : "none",
            }}>
            🎤
          </button>
          <button
            onClick={() => { if (listening && recogRef.current) { recogRef.current.stop(); setListening(false); } send(); }}
            disabled={!input.trim() && images.length === 0}
            title="Gửi"
            style={{
              width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
              background: (input.trim() || images.length > 0) ? `linear-gradient(135deg, ${C.accent}, ${C.purple || "#8b5cf6"})` : C.border,
              border: "none", color: "#fff", fontSize: 14, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: (input.trim() || images.length > 0) ? 1 : 0.5,
            }}>
            ▶
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }`}</style>
    </div>
  );
}
