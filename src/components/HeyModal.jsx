/* ================================================================
   HEY MODAL — Voice conversation with Wory
   Uses unified processTaskCommands (DRY fix)
   ================================================================ */
import { useState, useEffect, useRef } from "react";
import { C, PRIORITIES, STATUSES } from "../constants";
import { useVoice } from "../hooks";
import { callClaude, tts, processTaskCommands, executeTaskActions } from "../services";
import { useTasks, useSettings } from "../store";
import { MM } from "../components";

export default function HeyModal({ onClose, onChat, buildSystemPrompt, user }) {
  const { tasks, addTask, deleteTask, patchTask } = useTasks();
  const { settings } = useSettings();
  const [phase, setPhase] = useState("greeting");
  const [spoken, setSpoken] = useState("");
  const [reply, setReply] = useState("");
  const [greeting, setGreeting] = useState("");
  const [preview, setPreview] = useState(null);
  const chatLogRef = useRef([]);
  const phaseRef = useRef("greeting");
  const retryRef = useRef(0);
  const silenceTimer = useRef(null);
  const [lastReply, setLastReply] = useState("");
  const [lastSpoken, setLastSpoken] = useState("");

  const setP = (p) => { phaseRef.current = p; setPhase(p); };

  const autoListen = () => {
    setP("listening");
    clearTimeout(silenceTimer.current);
    setTimeout(() => {
      try { voice.start(); } catch {}
      const wait = retryRef.current === 0 ? 5000 : 4000;
      silenceTimer.current = setTimeout(() => {
        if (phaseRef.current !== "listening") return;
        voice.stop();
        retryRef.current++;
        const shortName = user?.name?.split(" ").pop() || "ban";
        if (retryRef.current === 1) {
          const prompt = `${shortName} còn gì nữa không?`;
          setLastReply(prompt);
          setP("speaking");
          if (settings.ttsEnabled) tts(prompt, settings.ttsSpeed, () => { autoListen(); });
          else setTimeout(autoListen, 1500);
        } else {
          const bye = `OK ${shortName}, khi nào cần cứ gọi nhé!`;
          setLastReply(bye);
          setP("speaking");
          if (settings.ttsEnabled) tts(bye, settings.ttsSpeed, () => { setTimeout(onClose, 600); });
          else setTimeout(onClose, 1500);
        }
      }, wait);
    }, 150);
  };

  const voice = useVoice(async (txt) => {
    if (phaseRef.current === "thinking" || phaseRef.current === "speaking") return;
    clearTimeout(silenceTimer.current);
    retryRef.current = 0;
    setSpoken(txt);
    setLastSpoken(txt);
    setP("thinking");

    try {
      const log = chatLogRef.current;
      const newLog = [...log, { role: "user", content: txt }];
      chatLogRef.current = newLog;
      const sys = buildSystemPrompt ? buildSystemPrompt() : "";
      const apiMsgs = newLog.filter((m, i) => !(i === 0 && m.role === "assistant"));
      const chatReply = await callClaude(
        sys + `\n\nDang o che do THOAI. Tra loi CUC NGAN (1-2 cau, toi da 30 tu), tu nhien nhu NOI MIENG. KHONG emoji. KHONG markdown. KHONG gach dau dong. Khi ke danh sach thi noi "mot la..., hai la..." nhu nguoi that.`,
        apiMsgs, 200
      );

      let finalReply = (chatReply && chatReply.trim()) ? chatReply.trim() : "Hmm, nói lại đi.";

      // Unified task command processing (DRY)
      const { cleanText, actions } = processTaskCommands(finalReply, tasks, {}, settings.woryCanEdit);
      finalReply = cleanText;
      if (actions.length > 0) {
        executeTaskActions(actions, { addTask, deleteTask, patchTask });
      }

      // Clean remaining brackets
      finalReply = finalReply.replace(/\[TASK_\w+:.+?\]/g, "");

      chatLogRef.current = [...newLog, { role: "assistant", content: finalReply }];
      setReply(finalReply);
      setLastReply(finalReply);
      setP("speaking");
      await new Promise(r => setTimeout(r, 150));
      if (settings.ttsEnabled) tts(finalReply, settings.ttsSpeed, () => { autoListen(); });
      else setTimeout(autoListen, 1500);
    } catch (err) {
      const errMsg = "Lỗi: " + (err.message || "kết nối thất bại");
      setReply(errMsg);
      setLastReply(errMsg);
      setP("speaking");
      if (settings.ttsEnabled) tts(errMsg, settings.ttsSpeed, () => { autoListen(); });
      else setTimeout(autoListen, 2000);
    }
  });

  // Greeting
  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    const shortName = user?.name?.split(" ").pop() || "ban";
    const quick = h < 6 ? `${shortName} ơi, khuya rồi!` :
      h < 12 ? `Chào ${shortName}, buổi sáng!` :
      h < 14 ? `${shortName}, ăn trưa chưa?` :
      h < 18 ? `Chào ${shortName}!` :
      `Tối rồi ${shortName}!`;
    const ask = "Cần tôi giúp gì nào?";
    const fullQuick = quick + " " + ask;
    setGreeting(fullQuick);
    chatLogRef.current = [{ role: "assistant", content: fullQuick }];
    setP("speaking");

    if (settings.ttsEnabled) tts(fullQuick, settings.ttsSpeed, () => { autoListen(); });
    else setTimeout(autoListen, 1000);

    // Parallel: get AI summary
    const sys = buildSystemPrompt ? buildSystemPrompt() : "";
    callClaude(
      sys + `\nBan VUA DUOC MO. Bay gio ${h}h${now.getMinutes().toString().padStart(2,"0")}.
Viet 1 dong ngan (toi da 15 tu) nhan xet nhanh ve tinh hinh cong viec hom nay.
KHONG chao. KHONG markdown. Chi 1 dong thong tin.`,
      [{ role: "user", content: "Tinh hinh hom nay?" }], 80
    ).then(info => {
      if (info) setGreeting(quick + " " + info.trim() + " -- " + ask);
    }).catch(() => {});

    return () => { window.speechSynthesis?.cancel(); clearTimeout(silenceTimer.current); };
  }, []);

  const handleMic = () => {
    if (voice.on) { voice.stop(); return; }
    if (phase === "speaking") { window.speechSynthesis?.cancel(); autoListen(); return; }
    if (phase === "thinking") return;
    setSpoken("");
    setReply("");
    setP("listening");
    voice.start();
  };

  const confirm = () => { if (!preview) return; addTask(preview); if (settings.ttsEnabled) tts("Đã thêm!"); setP("done"); setTimeout(onClose, 1200); };
  const retry = () => { setPreview(null); setSpoken(""); setReply(""); autoListen(); };
  const stopAll = () => { window.speechSynthesis?.cancel(); voice.stop(); onClose(); };

  const statusText = phase === "greeting" ? "Đang chuẩn bị..." :
    phase === "listening" ? (voice.on ? "Đang nghe bạn..." : "Nhấn mic để nói") :
    phase === "thinking" ? "Đang suy nghĩ..." :
    phase === "speaking" ? "Wory đang nói..." :
    phase === "preview" ? "Xác nhận công việc" :
    phase === "done" ? "Xong!" : "";

  return (
    <div className="modal-dark-overlay" role="dialog" aria-modal="true" aria-label="Wory voice assistant">
      {/* Avatar + status */}
      <div style={{ textAlign:"center", marginBottom:24 }}>
        <div style={{ width:80, height:80, borderRadius:"50%", background:`linear-gradient(135deg,${C.purple},${C.accent})`, display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:36, color:"#fff", position:"relative",
          boxShadow: phase === "speaking" ? `0 0 40px ${C.purple}88` : phase === "listening" && voice.on ? `0 0 30px ${C.red}66` : `0 8px 32px rgba(0,0,0,.3)`,
          animation: (phase === "thinking" || phase === "greeting") ? "spin 2s linear infinite" : "none"
        }}>
          {(phase === "thinking" || phase === "greeting") ? "*" : "W"}
          {(phase === "listening" && voice.on) && <div style={{ position:"absolute", inset:-10, borderRadius:"50%", border:`2px solid ${C.red}66`, animation:"ping 1.5s infinite" }} />}
          {phase === "speaking" && <div style={{ position:"absolute", inset:-10, borderRadius:"50%", border:`2px solid ${C.purple}66`, animation:"ping 2s infinite" }} />}
        </div>
        <div style={{ fontSize:20, fontWeight:700, color:"#fff", marginTop:12 }}>Wory</div>
        <div style={{ fontSize:14, color:"rgba(255,255,255,.6)", marginTop:4 }} aria-live="polite">{statusText}</div>
      </div>

      {/* Waveform */}
      {phase === "listening" && voice.on && (
        <div style={{ display:"flex", alignItems:"center", gap:4, height:40, marginBottom:20 }}>
          {[0,1,2,3,4,5,6,7,8].map(i => (
            <div key={i} style={{ width:4, background:"#fff", borderRadius:3, animation:`waveBar 0.8s ${i*0.1}s infinite ease-in-out`, opacity:.7 }} />
          ))}
        </div>
      )}

      {/* User speech */}
      {lastSpoken && phase !== "greeting" && (
        <div style={{ background:"rgba(255,255,255,.1)", borderRadius:16, padding:"10px 16px", marginBottom:10, maxWidth:340 }}>
          <div style={{ fontSize:13, color:"rgba(255,255,255,.5)" }}>Bạn: "{lastSpoken}"</div>
        </div>
      )}

      {/* Wory reply */}
      {lastReply && phase !== "greeting" ? (
        <div style={{ background:"rgba(106,127,212,.15)", border:"1px solid rgba(106,127,212,.3)", borderRadius:16, padding:"12px 18px", marginBottom:16, maxWidth:340 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
            <div style={{ fontSize:13, color:C.accent }}>Wory:</div>
            <button className="tap" aria-label="Nghe lại" onClick={() => {
              clearTimeout(silenceTimer.current); voice.stop(); window.speechSynthesis?.cancel();
              setP("speaking");
              setTimeout(() => tts(lastReply, settings.ttsSpeed, () => { autoListen(); }), 150);
            }} style={{ background:"none", border:"none", fontSize:20, padding:"4px 8px", cursor:"pointer" }}>
              &#x1F50A;
            </button>
          </div>
          <div style={{ fontSize:16, color:"#fff", lineHeight:1.5 }}>{lastReply}</div>
        </div>
      ) : (
        greeting && phase !== "greeting" && (
          <div style={{ background:"rgba(106,127,212,.15)", border:"1px solid rgba(106,127,212,.3)", borderRadius:16, padding:"12px 18px", marginBottom:16, maxWidth:340 }}>
            <div style={{ fontSize:16, color:"#fff", lineHeight:1.5 }}>{greeting}</div>
          </div>
        )
      )}

      {/* Task preview */}
      {phase === "preview" && preview && (
        <div style={{ background:C.surface, borderRadius:16, padding:"16px", marginBottom:16, width:"100%", maxWidth:340 }}>
          <div style={{ fontSize:11, color:C.muted, marginBottom:8, fontWeight:600 }}>TẠO CÔNG VIỆC:</div>
          <div style={{ fontSize:16, fontWeight:700, marginBottom:10, color:C.text }}>{preview.title}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <MM l="Ưu tiên" v={<span style={{ color:PRIORITIES[preview.priority]?.color }}>{PRIORITIES[preview.priority]?.label}</span>} />
            <MM l="Deadline" v={preview.deadline || "--"} />
          </div>
          <div style={{ display:"flex", gap:10, marginTop:14 }}>
            <button className="tap" onClick={retry} style={{ flex:1, background:C.card, color:C.sub, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px", fontSize:14 }}>Nói lại</button>
            <button className="tap" onClick={confirm} style={{ flex:2, background:C.green, color:"#fff", border:"none", borderRadius:12, padding:"12px", fontSize:15, fontWeight:700 }}>Thêm</button>
          </div>
        </div>
      )}

      {phase === "done" && <div style={{ fontSize:48, marginBottom:16 }}>v</div>}

      {/* Mic + Close */}
      <div style={{ display:"flex", gap:12, marginTop:8 }}>
        {phase !== "done" && phase !== "preview" && phase !== "greeting" && (
          <button className="tap" onClick={handleMic} aria-label={voice.on ? "Dừng mic" : "Bật mic"}
            style={{ width:72, height:72, borderRadius:"50%", border:"none",
              background: voice.on ? C.red : phase === "thinking" ? "rgba(255,255,255,.1)" : `linear-gradient(135deg,${C.purple},${C.accent})`,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:30, color:"#fff",
              boxShadow: voice.on ? `0 0 20px ${C.red}55` : `0 4px 16px rgba(0,0,0,.3)`,
              opacity: phase === "thinking" ? .4 : 1
            }}>
            {voice.on ? "S" : phase === "speaking" ? "P" : "M"}
          </button>
        )}
        <button className="tap" onClick={stopAll} aria-label="Đóng"
          style={{ width:54, height:54, borderRadius:"50%", border:"2px solid rgba(255,255,255,.2)", background:"rgba(255,255,255,.05)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:"rgba(255,255,255,.6)", alignSelf:"center" }}>
          X
        </button>
      </div>
    </div>
  );
}
