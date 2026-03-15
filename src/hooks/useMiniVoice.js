/* ================================================================
   useMiniVoice — Quick voice widget on task tab
   ================================================================ */
import { useState, useRef, useCallback } from "react";
import { STATUSES, PRIORITIES } from "../constants";
import {
  callClaudeStream, tts, processTaskCommands, processMemoryCommands,
  executeTaskActions,
} from "../services";

export function useMiniVoice({ tasks, memory, setMemory, knowledge, setKnowledge, settings, addTask, deleteTask, patchTask, buildSystemPrompt, msgs }) {
  const [miniVoice, setMiniVoice]         = useState(false);
  const [miniListening, setMiniListening] = useState(false);
  const [miniReply, setMiniReply]         = useState("");
  const [miniLoading, setMiniLoading]     = useState(false);
  const [miniTask, setMiniTask]           = useState(null);
  const [miniTranscript, setMiniTranscript] = useState("");
  const [miniText, setMiniText]           = useState("");

  const miniVoiceRef = useRef(null);
  const miniAutoCloseRef = useRef(null);
  const sendMiniVoiceRef = useRef(null);

  const closeMiniVoice = useCallback(() => {
    if (miniVoiceRef.current?.on) { miniVoiceRef.current.on = false; miniVoiceRef.current.stop?.(); }
    if (miniAutoCloseRef.current) { clearTimeout(miniAutoCloseRef.current); miniAutoCloseRef.current = null; }
    setMiniVoice(false); setMiniReply(""); setMiniTask(null); setMiniTranscript(""); setMiniText(""); setMiniListening(false);
    window.speechSynthesis?.cancel();
  }, []);

  const startMiniListening = useCallback(() => {
    if (window.speechSynthesis?.speaking) return;
    if (miniAutoCloseRef.current) { clearTimeout(miniAutoCloseRef.current); miniAutoCloseRef.current = null; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "vi-VN"; rec.continuous = false; rec.interimResults = true;

    rec.onresult = (e) => {
      const resultText = e.results[0][0].transcript;
      setMiniText(resultText);
    };
    rec.onerror = () => { miniVoiceRef.current = { on: false }; setMiniListening(false); };
    rec.onend = () => {
      miniVoiceRef.current = { on: false };
      setMiniListening(false);
    };
    rec.start();
    miniVoiceRef.current = { on: true, stop: () => rec.stop() };
    setMiniListening(true);
  }, []);

  const sendMiniVoice = useCallback(async (text) => {
    if (!text.trim() || miniLoading) return;
    setMiniLoading(true);
    setMiniReply("");
    try {
      const t = miniTask ? tasks.find(x => x.id === miniTask.id) || miniTask : null;
      const isProjectTask = t?.projectId;
      const taskName = t ? t.title : "";
      const taskCtx = t ? `[CHE DO NHANH — KHONG HOI XAC NHAN, LAM NGAY]
Task dang chon: "${t.title}" | ${STATUSES[t.status]?.label} | ${PRIORITIES[t.priority]?.label?.replace("\n",", ")}${t.deadline ? ` | deadline:${t.deadline}` : ""}${isProjectTask ? " | DU AN — KHONG TAO VIEC MOI" : ""}

QUY TAC BAT BUOC:
1. KHONG hoi lai, KHONG xac nhan — THUC HIEN NGAY
2. Chi ap dung cho task "${taskName}" — KHONG chuyen sang task khac
3. Tra loi ≤15 tu, GUI LENH NGAY:
   [TASK_EXPENSE:${taskName}:ly_do|so_tien|danh_muc] — them chi tieu
   [TASK_NOTES:${taskName}:noi_dung] — them ghi chu
   [TASK_STATUS:${taskName}:trang_thai] — doi status (todo/prepare/inprogress/done)
   [TASK_PRIORITY:${taskName}:muc] — doi uu tien (cao/trung/thap/none)
   [TASK_DEADLINE:${taskName}:YYYY-MM-DD] — doi deadline
4. Neu nguoi dung noi chi tieu → PHAI dung TASK_EXPENSE voi DAY DU ly_do va so_tien
5. Nhieu khoan chi → moi khoan 1 lenh TASK_EXPENSE rieng

` : "";
      const miniSystemPrompt = t ? `Ban la Wory — tro ly nhanh. Noi tieng Viet. KHONG hoi xac nhan. LAM NGAY khi nguoi dung yeu cau. Tra loi cuc ngan (≤15 tu). LUON gui lenh thuc thi.` : buildSystemPrompt(msgs);
      const fullText = await callClaudeStream(
        miniSystemPrompt,
        [{ role: "user", content: taskCtx + text }],
        (partial) => setMiniReply(partial),
        400
      );
      let clean = processMemoryCommands(fullText, memory, setMemory, knowledge, setKnowledge);
      const { cleanText, actions } = processTaskCommands(clean, tasks, {}, settings.woryCanEdit);
      clean = cleanText.replace(/\[TASK_\w+:.+?\]/g, "").trim();
      if (actions.length > 0) executeTaskActions(actions, isProjectTask ? { patchTask } : { addTask, deleteTask, patchTask });
      setMiniReply(clean);
      if (settings.ttsEnabled) tts(clean, settings.ttsSpeed);
    } catch { setMiniReply("Lỗi kết nối."); }
    setMiniLoading(false);
  }, [buildSystemPrompt, memory, setMemory, tasks, settings, addTask, deleteTask, patchTask, miniLoading, miniTask, knowledge, setKnowledge, msgs]);

  sendMiniVoiceRef.current = sendMiniVoice;

  return {
    miniVoice, setMiniVoice, miniListening, miniReply, miniLoading, miniTask, setMiniTask,
    miniTranscript, miniText, setMiniText,
    closeMiniVoice, startMiniListening, sendMiniVoice, sendMiniVoiceRef,
  };
}
