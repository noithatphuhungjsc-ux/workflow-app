/* ================================================================
   ADD TASK MODAL — Professional form with optional voice input
   ================================================================ */
import { useState, useRef, useEffect } from "react";
import { C, PRIORITIES, WORKFLOWS, parsePriority, parseDeadline, parseWorkflow } from "../constants";
import { useVoice } from "../hooks";
import { tts } from "../services";
import { useTasks, useSettings } from "../store";

const IS = { background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 14px", color:C.text, fontSize:14, width:"100%", boxSizing:"border-box" };

export default function VoiceAddModal({ onClose }) {
  const { addTask } = useTasks();
  const { settings } = useSettings();
  const [title, setTitle]       = useState("");
  const [priority, setPriority] = useState("trung");
  const [deadline, setDeadline] = useState("");
  const [category, setCategory] = useState("");
  const [workflow, setWorkflow] = useState("");
  const [done, setDone]         = useState(false);
  const [voiceField, setVoiceField] = useState(null); // which field is listening
  const [voiceText, setVoiceText]   = useState("");
  const titleRef = useRef(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  // Voice input for a specific field
  const voice = useVoice(raw => {
    if (!voiceField) return;
    setVoiceText(raw);
    switch (voiceField) {
      case "title": setTitle(raw.trim()); break;
      case "priority": { const p = parsePriority(raw); if (["cao","trung","thap"].includes(p)) setPriority(p); } break;
      case "deadline": { const d = parseDeadline(raw); if (d) setDeadline(d); } break;
      case "category": setCategory(raw.trim()); break;
      case "workflow": { const w = parseWorkflow(raw); if (w) setWorkflow(w); } break;
    }
    setTimeout(() => { setVoiceField(null); setVoiceText(""); }, 600);
  });

  const toggleVoice = (field) => {
    if (voiceField === field && voice.on) {
      voice.toggle();
      setVoiceField(null);
      setVoiceText("");
    } else {
      if (voice.on) voice.toggle(); // stop current
      setVoiceField(field);
      setVoiceText("");
      setTimeout(() => voice.toggle(), 100); // start for new field
    }
  };

  const submit = () => {
    if (!title.trim()) return;
    addTask({
      title: title.trim(),
      priority,
      deadline: deadline || null,
      category: category.trim() || null,
      workflow: workflow || null,
    });
    setDone(true);
    if (settings.ttsEnabled) tts("Đã thêm công việc thành công!", settings.ttsSpeed);
  };

  const MicBtn = ({ field }) => {
    const active = voiceField === field && voice.on;
    return (
      <button className="tap" onClick={() => toggleVoice(field)} aria-label="Nhập bằng giọng nói"
        style={{ width:36, height:36, borderRadius:10, border: active ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
          background: active ? `${C.accent}15` : C.card, display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:16, flexShrink:0, cursor:"pointer", transition:"all .2s",
          animation: active ? "pulse 1.2s infinite" : "none" }}>
        {active ? "⏹" : "🎙"}
      </button>
    );
  };

  const prioColor = PRIORITIES[priority]?.color || C.muted;

  return (
    <div style={{ position:"fixed", inset:0, background:C.bg, zIndex:1000, display:"flex", flexDirection:"column", animation:"fadeIn .2s" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        <button className="tap" onClick={onClose} style={{ background:"none", border:"none", fontSize:20, color:C.muted, padding:"2px 6px", lineHeight:1, cursor:"pointer" }}>&larr;</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:17, fontWeight:700, color:C.text }}>Thêm công việc</div>
        </div>
        {!done && (
          <button className="tap" onClick={submit} disabled={!title.trim()}
            style={{ background: title.trim() ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : C.border,
              color:"#fff", border:"none", borderRadius:10, padding:"8px 20px", fontSize:14, fontWeight:700, cursor: title.trim() ? "pointer" : "default",
              boxShadow: title.trim() ? `0 2px 8px ${C.accent}44` : "none", transition:"all .2s" }}>
            Thêm
          </button>
        )}
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"16px" }}>
        {done ? (
          /* ── Success ── */
          <div style={{ textAlign:"center", padding:"40px 0" }}>
            <div style={{
              width:72, height:72, borderRadius:"50%", background:`linear-gradient(135deg, ${C.green}, #2ecc71)`,
              display:"inline-flex", alignItems:"center", justifyContent:"center", marginBottom:16,
              boxShadow:`0 8px 24px ${C.green}44`
            }}>
              <span style={{ color:"#fff", fontSize:32, fontWeight:700 }}>✓</span>
            </div>
            <div style={{ fontSize:18, fontWeight:700, color:C.text, marginBottom:6 }}>Đã thêm thành công!</div>
            <div style={{ fontSize:14, color:C.muted, marginBottom:24 }}>{title}</div>

            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button className="tap" onClick={() => { setDone(false); setTitle(""); setDeadline(""); setCategory(""); setWorkflow(""); setPriority("trung"); titleRef.current?.focus(); }}
                style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 24px", fontSize:14, fontWeight:600, color:C.text, cursor:"pointer" }}>
                Thêm tiếp
              </button>
              <button className="tap" onClick={onClose}
                style={{ background:`linear-gradient(135deg, ${C.accent}, ${C.purple})`, color:"#fff", border:"none",
                  borderRadius:10, padding:"10px 24px", fontSize:14, fontWeight:700, cursor:"pointer",
                  boxShadow:`0 2px 8px ${C.accent}44` }}>
                Xong
              </button>
            </div>
          </div>
        ) : (
          /* ── Form ── */
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Voice status banner */}
            {voiceField && voice.on && (
              <div style={{ background:`${C.accent}10`, border:`1px solid ${C.accent}30`, borderRadius:10, padding:"8px 14px",
                display:"flex", alignItems:"center", gap:8, animation:"fadeIn .2s" }}>
                <div style={{ width:8, height:8, borderRadius:"50%", background:"#ef4444", animation:"pulse 1s infinite" }} />
                <span style={{ fontSize:13, color:C.accent, fontWeight:600 }}>Đang nghe...</span>
                {voiceText && <span style={{ fontSize:13, color:C.text, fontWeight:500 }}>"{voiceText}"</span>}
              </div>
            )}

            {/* Title */}
            <div>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4, letterSpacing:.3 }}>TÊN CÔNG VIỆC *</div>
              <div style={{ display:"flex", gap:8 }}>
                <input ref={titleRef} value={title} onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && title.trim()) submit(); }}
                  placeholder="Nhập tên công việc..."
                  style={{ ...IS, flex:1, fontSize:15, fontWeight:500 }} />
                <MicBtn field="title" />
              </div>
            </div>

            {/* Priority + Deadline */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div>
                <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4, letterSpacing:.3 }}>ƯU TIÊN</div>
                <div style={{ display:"flex", gap:6 }}>
                  {Object.entries(PRIORITIES).map(([k, v]) => (
                    <button key={k} className="tap" onClick={() => setPriority(k)}
                      style={{ flex:1, padding:"8px 4px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer",
                        background: priority === k ? `${v.color}18` : C.card,
                        border: `1.5px solid ${priority === k ? v.color : C.border}`,
                        color: priority === k ? v.color : C.muted, transition:"all .15s" }}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4, letterSpacing:.3 }}>HẠN CHÓT</div>
                <div style={{ display:"flex", gap:6 }}>
                  <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                    style={{ ...IS, flex:1, padding:"8px 10px" }} />
                  <MicBtn field="deadline" />
                </div>
              </div>
            </div>

            {/* Category */}
            <div>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4, letterSpacing:.3 }}>DANH MỤC</div>
              <div style={{ display:"flex", gap:8 }}>
                <input value={category} onChange={e => setCategory(e.target.value)}
                  placeholder="VD: Marketing, Kỹ thuật, Nhân sự..."
                  style={{ ...IS, flex:1 }} />
                <MicBtn field="category" />
              </div>
            </div>

            {/* Workflow */}
            <div>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4, letterSpacing:.3 }}>QUY TRÌNH</div>
              <select value={workflow} onChange={e => setWorkflow(e.target.value)}
                style={{ ...IS, color: workflow ? C.text : C.muted }}>
                <option value="">Không có quy trình</option>
                {WORKFLOWS.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>

            {/* Quick voice fill all */}
            <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:14, marginTop:4 }}>
              <button className="tap" onClick={() => {
                if (voice.on) { voice.toggle(); setVoiceField(null); return; }
                setVoiceField("title");
                setTimeout(() => voice.toggle(), 100);
                if (settings.ttsEnabled) tts("Hãy nói tên công việc", settings.ttsSpeed);
              }}
                style={{ width:"100%", padding:"14px", borderRadius:12, border:"none", fontSize:14, fontWeight:600,
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8, cursor:"pointer",
                  background: voice.on ? "#ef4444" : `linear-gradient(135deg, ${C.accent}12, ${C.purple}12)`,
                  color: voice.on ? "#fff" : C.accent, transition:"all .2s" }}>
                <span style={{ fontSize:18 }}>{voice.on ? "⏹" : "🎙"}</span>
                {voice.on ? "Đang nghe — nhấn để dừng" : "Điền bằng giọng nói"}
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
