/* ================================================================
   VOICE ADD MODAL — Step-by-step voice task creation (redesigned)
   ================================================================ */
import { useState, useEffect } from "react";
import { C, PRIORITIES, WORKFLOWS, parsePriority, parseDeadline, parseWorkflow } from "../constants";
import { useVoice } from "../hooks";
import { tts } from "../services";
import { useTasks, useSettings } from "../store";

const QS = [
  { key:"title",    ask:"Tên công việc là gì?",                        validate:v=>v&&v.length>1, errMsg:"Vui lòng nói rõ tên công việc." },
  { key:"priority", ask:"Mức ưu tiên: Cao, Trung bình hay Thấp?",      validate:v=>["cao","trung","thap"].includes(v), errMsg:"Hãy nói: Cao, Trung bình hoặc Thấp.", parse:parsePriority },
  { key:"deadline", ask:"Deadline khi nào?\n(Nói 'bỏ qua' nếu chưa biết)", validate:()=>true, parse:parseDeadline },
  { key:"category", ask:"Thuộc danh mục nào?\nVí dụ: Marketing, Kỹ thuật, Nhân sự...", validate:v=>v&&v.length>0, errMsg:"Vui lòng nói tên danh mục." },
  { key:"workflow", ask:"Có quy trình đặc thù không?\nBáo cáo / Sự kiện / Dự án / Cuộc họp / Tuyển dụng\n(Nói 'không' để bỏ qua)", validate:()=>true, parse:parseWorkflow },
];

const FIELD_LABELS = { title: "Tên", priority: "Ưu tiên", deadline: "Hạn chót", category: "Danh mục", workflow: "Quy trình" };
const FIELD_ICONS = { title: "📝", priority: "🔺", deadline: "📅", category: "📂", workflow: "⚙️" };

export default function VoiceAddModal({ onClose }) {
  const { addTask } = useTasks();
  const { settings } = useSettings();
  const [step, setStep]     = useState(0);
  const [form, setForm]     = useState({});
  const [err, setErr]       = useState("");
  const [last, setLast]     = useState("");
  const [done, setDone]     = useState(false);
  const [manual, setManual] = useState(false);
  const [mVal, setMVal]     = useState("");

  const q = QS[step];
  useEffect(() => {
    if (!done && step < QS.length) {
      setErr("");
      setLast("");
      if (settings.ttsEnabled) tts(QS[step].ask, settings.ttsSpeed);
    }
  }, [step, done]);

  const voice = useVoice(raw => { processAnswer(raw); });

  const processAnswer = raw => {
    setLast(raw);
    const parsed = q.parse ? q.parse(raw) : raw.trim();
    const valid = q.validate(parsed);
    if (!valid) {
      setErr(q.errMsg || "Chưa rõ, thử lại nhé.");
      if (settings.ttsEnabled) tts(q.errMsg || "Chưa rõ, thử lại nhé.", settings.ttsSpeed);
      return;
    }
    setErr("");
    const nf = { ...form, [q.key]: parsed };
    setForm(nf);
    if (step + 1 >= QS.length) {
      addTask(nf);
      setDone(true);
      if (settings.ttsEnabled) tts("Đã thêm công việc thành công!", settings.ttsSpeed);
    } else {
      setStep(s => s + 1);
      setLast("");
      setMVal("");
    }
  };

  const submitManual = () => {
    if (!mVal.trim()) return;
    processAnswer(mVal);
    setManual(false);
    setMVal("");
  };

  const pct = done ? 100 : Math.round((step / QS.length) * 100);

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} className="modal-overlay" style={{ zIndex: 90 }} role="dialog" aria-modal="true" aria-label="Thêm công việc">
      <div onClick={e => e.stopPropagation()} style={{
        background: C.surface, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480,
        margin: "0 auto", padding: "0 0 env(safe-area-inset-bottom, 24px)", animation: "slideUp .25s",
        boxShadow: "0 -4px 32px rgba(0,0,0,0.12)"
      }}>
        {/* Handle bar */}
        <div style={{ textAlign: "center", padding: "10px 0 6px" }}>
          <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, display: "inline-block" }} />
        </div>

        <div style={{ padding: "0 20px 24px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14, background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#fff", fontWeight: 700,
              boxShadow: `0 4px 12px ${C.accent}44`
            }}>+</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Thêm công việc mới</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>
                {done ? "Hoàn tất" : `Bước ${step + 1} / ${QS.length}`}
              </div>
            </div>
            <button className="tap" onClick={onClose} aria-label="Đóng"
              style={{ width: 32, height: 32, borderRadius: 10, background: C.card, border: `1px solid ${C.border}`,
                color: C.muted, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>✕</button>
          </div>

          {/* Progress bar */}
          <div style={{ height: 4, background: C.border, borderRadius: 2, marginBottom: 20, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${C.accent}, ${C.green})`, borderRadius: 2, transition: "width .4s ease" }} />
          </div>

          {done ? (
            /* ── Success ── */
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%", background: `linear-gradient(135deg, ${C.green}, #2ecc71)`,
                display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14,
                boxShadow: `0 6px 20px ${C.green}44`
              }}>
                <span style={{ color: "#fff", fontSize: 28, fontWeight: 700 }}>✓</span>
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 4 }}>Đã thêm thành công!</div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Công việc mới đã được tạo</div>

              {/* Summary of created task */}
              <div style={{ background: C.card, borderRadius: 12, padding: "12px 16px", border: `1px solid ${C.border}`, textAlign: "left", marginBottom: 20 }}>
                {Object.entries(form).map(([k, v]) => {
                  const dv = k === "priority" ? PRIORITIES[v]?.label : k === "workflow" ? (WORKFLOWS.find(w => w.id === v)?.name || "Không") : v || "—";
                  return (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: k !== "workflow" ? `1px solid ${C.border}44` : "none" }}>
                      <span style={{ fontSize: 14, width: 20, textAlign: "center" }}>{FIELD_ICONS[k]}</span>
                      <span style={{ fontSize: 12, color: C.muted, minWidth: 60 }}>{FIELD_LABELS[k]}</span>
                      <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{dv}</span>
                    </div>
                  );
                })}
              </div>

              <button className="tap" onClick={onClose}
                style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`, color: "#fff", border: "none",
                  borderRadius: 12, padding: "13px 40px", fontSize: 15, fontWeight: 700, cursor: "pointer",
                  boxShadow: `0 4px 12px ${C.accent}44` }}>
                Đóng
              </button>
            </div>
          ) : (<>
            {/* ── Form in progress ── */}

            {/* Filled fields summary */}
            {Object.keys(form).length > 0 && (
              <div style={{ background: C.card, borderRadius: 12, padding: "8px 14px", marginBottom: 14, border: `1px solid ${C.border}` }}>
                {Object.entries(form).map(([k, v]) => {
                  const dv = k === "priority" ? PRIORITIES[v]?.label : k === "workflow" ? (WORKFLOWS.find(w => w.id === v)?.name || "Không") : v || "—";
                  return (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                      <span style={{ fontSize: 13 }}>{FIELD_ICONS[k]}</span>
                      <span style={{ fontSize: 12, color: C.muted, minWidth: 54 }}>{FIELD_LABELS[k]}</span>
                      <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{dv}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Current question */}
            <div style={{
              background: `linear-gradient(135deg, ${C.accent}08, ${C.purple}08)`,
              border: `1px solid ${C.accent}22`, borderRadius: 14, padding: "16px", marginBottom: 14
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>{FIELD_ICONS[q.key]}</span>
                <span style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: .5, textTransform: "uppercase" }}>{FIELD_LABELS[q.key]}</span>
              </div>
              <div style={{ fontSize: 15, color: C.text, lineHeight: 1.6, fontWeight: 500, whiteSpace: "pre-wrap" }}>{q.ask}</div>
            </div>

            {/* Error */}
            {err && (
              <div role="alert" style={{
                background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10,
                padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#dc2626",
                display: "flex", alignItems: "center", gap: 8
              }}>
                <span style={{ fontSize: 16 }}>⚠️</span> {err}
              </div>
            )}

            {/* Last heard */}
            {last && !err && (
              <div style={{
                background: C.card, borderRadius: 10, padding: "10px 14px", marginBottom: 12,
                fontSize: 13, color: C.sub, border: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", gap: 8
              }}>
                <span style={{ fontSize: 14 }}>💬</span> Bạn nói: <b>"{last}"</b>
              </div>
            )}

            {/* Input area */}
            {manual ? (
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input autoFocus value={mVal} onChange={e => setMVal(e.target.value)} onKeyDown={e => e.key === "Enter" && submitManual()}
                  placeholder="Nhập câu trả lời..." aria-label="Nhập câu trả lời"
                  style={{
                    flex: 1, background: C.card, border: `1.5px solid ${C.accent}`,
                    borderRadius: 12, padding: "12px 14px", color: C.text, fontSize: 14, boxSizing: "border-box"
                  }} />
                <button className="tap" onClick={submitManual}
                  style={{
                    background: C.accent, color: "#fff", border: "none", borderRadius: 12,
                    padding: "12px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer"
                  }}>OK</button>
              </div>
            ) : (
              <button className="tap" onClick={voice.toggle} aria-label={voice.on ? "Đang nghe, nhấn để dừng" : "Nhấn để nói"}
                style={{
                  width: "100%", border: "none", borderRadius: 14, padding: "16px", fontSize: 15, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12,
                  position: "relative", overflow: "hidden", cursor: "pointer",
                  background: voice.on ? "#ef4444" : `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                  color: "#fff", boxShadow: voice.on ? "0 4px 16px #ef444444" : `0 4px 16px ${C.accent}44`,
                  transition: "all .2s"
                }}>
                {voice.on && <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.08)", animation: "ripple 1.5s infinite" }} />}
                <span style={{ fontSize: 20, lineHeight: 1 }}>{voice.on ? "⏹" : "🎙"}</span>
                {voice.on ? "Đang nghe... nhấn để dừng" : "Nhấn để trả lời bằng giọng nói"}
              </button>
            )}

            {/* Toggle input method */}
            <button className="tap" onClick={() => setManual(m => !m)}
              style={{
                width: "100%", background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "11px", fontSize: 13, color: C.sub, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6
              }}>
              <span style={{ fontSize: 14 }}>{manual ? "🎙" : "⌨️"}</span>
              {manual ? "Chuyển sang giọng nói" : "Nhập bằng bàn phím"}
            </button>
          </>)}
        </div>
      </div>
    </div>
  );
}
