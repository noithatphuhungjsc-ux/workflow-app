/* ================================================================
   VOICE ADD MODAL — Step-by-step voice task creation
   ================================================================ */
import { useState, useEffect } from "react";
import { C, PRIORITIES, WORKFLOWS, parsePriority, parseDeadline, parseWorkflow } from "../constants";
import { useVoice } from "../hooks";
import { tts } from "../services";
import { useTasks, useSettings } from "../store";

const QS = [
  { key:"title",    ask:"Tên công việc là gì?",                        validate:v=>v&&v.length>1, errMsg:"Vui lòng nói rõ tên công việc." },
  { key:"priority", ask:"Mức ưu tiên: Cao, Trung bình hay Thấp?",      validate:v=>["cao","trung","thap"].includes(v), errMsg:"Hãy nói: Cao, Trung bình hoặc Thấp.", parse:parsePriority },
  { key:"deadline", ask:"Deadline khi nào? (Nói 'bỏ qua' nếu chưa biết)", validate:()=>true, parse:parseDeadline },
  { key:"category", ask:"Thuộc danh mục nào?\nVí dụ: Marketing, Kỹ thuật, Nhân sự...", validate:v=>v&&v.length>0, errMsg:"Vui lòng nói tên danh mục." },
  { key:"workflow", ask:"Có quy trình đặc thù không?\nBáo cáo / Sự kiện / Dự án / Cuộc họp / Tuyển dụng\n(Nói 'không' để bỏ qua)", validate:()=>true, parse:parseWorkflow },
];

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

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} className="modal-overlay" style={{ zIndex:90 }} role="dialog" aria-modal="true" aria-label="Thêm công việc bằng giọng nói">
      <div onClick={e => e.stopPropagation()} style={{ background:C.surface, borderRadius:"22px 22px 0 0", border:`1px solid ${C.border}`, borderBottom:"none", width:"100%", maxWidth:480, margin:"0 auto", padding:"12px 18px 32px", animation:"slideUp .25s", paddingBottom:"env(safe-area-inset-bottom,32px)" }}>
        <div style={{ textAlign:"center", marginBottom:14 }}>
          <div style={{ width:36, height:3, background:C.border, borderRadius:2, display:"inline-block" }} />
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <div style={{ width:38, height:38, borderRadius:"50%", background:C.accentD, border:`1.5px solid ${C.accent}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>+</div>
          <div>
            <div style={{ fontSize:15, fontWeight:700 }}>Thêm việc bằng giọng nói</div>
            <div style={{ fontSize:11, color:C.muted }}>Câu {done ? QS.length : step + 1}/{QS.length}</div>
          </div>
          <button className="tap" onClick={onClose} aria-label="Đóng" style={{ marginLeft:"auto", background:"none", border:"none", color:C.muted, fontSize:22 }}>x</button>
        </div>

        {/* Progress bar */}
        <div style={{ height:4, background:C.border, borderRadius:2, marginBottom:18, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${done ? 100 : Math.round((step / QS.length) * 100)}%`, background:`linear-gradient(90deg,${C.accent},${C.purple})`, borderRadius:2, transition:"width .4s ease" }} />
        </div>

        {done ? (
          <div style={{ textAlign:"center", padding:"24px 0" }}>
            <div style={{ fontSize:42, marginBottom:10 }}>v</div>
            <div style={{ fontSize:16, fontWeight:700, color:C.green, marginBottom:6 }}>Đã thêm thành công!</div>
            <button className="tap" onClick={onClose} style={{ background:C.accent, color:"#fff", border:"none", borderRadius:12, padding:"12px 32px", fontSize:14, fontWeight:700, marginTop:8 }}>Đóng</button>
          </div>
        ) : (<>
          {/* Summary of filled fields */}
          {Object.keys(form).length > 0 && (
            <div style={{ background:C.card, borderRadius:12, padding:"10px 13px", marginBottom:12, border:`1px solid ${C.border}` }}>
              {Object.entries(form).map(([k, v]) => {
                const lb = { title:"T", priority:"P", deadline:"D", category:"C", workflow:"W" };
                const dv = k === "priority" ? PRIORITIES[v]?.label : k === "workflow" ? (WORKFLOWS.find(w => w.id === v)?.name || "--") : v || "--";
                return <div key={k} style={{ display:"flex", gap:8, fontSize:12, marginBottom:2 }}><span style={{ color:C.muted, minWidth:24 }}>{lb[k]}</span><span style={{ color:C.text, fontWeight:500 }}>{dv}</span></div>;
              })}
            </div>
          )}

          {/* Question */}
          <div style={{ background:`linear-gradient(135deg,${C.accentD},${C.purpleD})`, border:`1px solid ${C.accent}44`, borderRadius:14, padding:"14px", marginBottom:12 }}>
            <div style={{ fontSize:10, color:C.accent, fontWeight:700, letterSpacing:.5, marginBottom:6 }}>AI HỎI:</div>
            <div style={{ fontSize:14.5, color:C.text, lineHeight:1.65, fontWeight:500, whiteSpace:"pre-wrap" }}>{q.ask}</div>
          </div>

          {err && <div role="alert" style={{ background:C.redD, border:`1px solid ${C.red}55`, borderRadius:10, padding:"10px 13px", marginBottom:10, fontSize:13, color:C.red }}>! {err}</div>}
          {last && !err && <div style={{ background:C.card, borderRadius:10, padding:"9px 12px", marginBottom:10, fontSize:12, color:C.sub, border:`1px solid ${C.border}` }}>Bạn nói: "{last}"</div>}

          {manual ? (
            <div style={{ display:"flex", gap:8, marginBottom:10 }}>
              <input autoFocus value={mVal} onChange={e => setMVal(e.target.value)} onKeyDown={e => e.key === "Enter" && submitManual()}
                placeholder="Nhập câu trả lời..." aria-label="Nhập câu trả lời"
                style={{ flex:1, background:C.card, border:`1.5px solid ${C.accent}`, borderRadius:12, padding:"11px 14px", color:C.text, fontSize:14 }} />
              <button className="tap" onClick={submitManual} style={{ background:C.accent, color:"#fff", border:"none", borderRadius:12, padding:"11px 16px", fontSize:14, fontWeight:700 }}>OK</button>
            </div>
          ) : (
            <button className="tap" onClick={voice.toggle} aria-label={voice.on ? "Đang nghe, nhấn để dừng" : "Nhấn để nói"}
              style={{ width:"100%", background: voice.on ? C.red : `linear-gradient(135deg,${C.accent},${C.purple})`, color:"#fff", border:"none", borderRadius:14, padding:"15px", fontSize:15, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:10, position:"relative", overflow:"hidden" }}>
              {voice.on && <div style={{ position:"absolute", inset:0, background:"rgba(255,255,255,.07)", animation:"ripple 1.5s infinite" }} />}
              <span style={{ fontSize:22 }}>{voice.on ? "O" : "M"}</span>
              {voice.on ? "Đang nghe... nhấn để dừng" : "Nhấn để trả lời bằng giọng nói"}
            </button>
          )}

          <button className="tap" onClick={() => setManual(m => !m)}
            style={{ width:"100%", background:"none", border:`1px solid ${C.border}`, borderRadius:12, padding:"10px", fontSize:13, color:C.sub }}>
            {manual ? "Dùng giọng nói" : "Nhập bằng bàn phím"}
          </button>
        </>)}
      </div>
    </div>
  );
}
