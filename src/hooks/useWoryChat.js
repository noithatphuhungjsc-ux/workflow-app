/* ================================================================
   useWoryChat — Wory AI chat logic extracted from App.jsx
   Handles: chat messages, voice mode, auto-learning, system prompt
   ================================================================ */
import { useState, useRef, useEffect, useCallback } from "react";
import { STATUSES, PRIORITIES, todayStr, fmtDate } from "../constants";
import {
  callClaudeStream, tts, memoryToText, buildKnowledgePrompt,
  extractKnowledge, processTaskCommands, processMemoryCommands,
  executeTaskActions, loadJSON, saveJSON,
} from "../services";
import { useVoice } from "../hooks";

export function useWoryChat({ tasks, memory, setMemory, knowledge, setKnowledge, settings, user, addTask, deleteTask, patchTask }) {
  const defaultMsg = { role: "assistant", content: "Chào bạn! Tôi là **Wory** — trợ lý AI của bạn.\n\nNhấn nút mic để **nói chuyện bằng giọng nói**, hoặc nhắn tin ở đây.\n\nTôi có thể giúp **lập kế hoạch**, **tư vấn**, hoặc **nói chuyện phiếm** cho vui!" };
  const [msgs, setMsgs] = useState(() => loadJSON("chat_history", [defaultMsg]));
  const [chatStartedAt] = useState(() => {
    const t = loadJSON("chat_started", null);
    return t ? Number(t) : Date.now();
  });
  useEffect(() => { saveJSON("chat_started", chatStartedAt); }, [chatStartedAt]);

  const canNewChat = () => (Date.now() - chatStartedAt) > 2 * 24 * 60 * 60 * 1000;
  const archiveChat = () => {
    try {
      const archives = loadJSON("chat_archives", []);
      archives.push({ ts: new Date().toISOString(), started: new Date(chatStartedAt).toISOString(), messages: msgs });
      saveJSON("chat_archives", archives.slice(-20));
    } catch {}
  };
  const startNewChat = () => {
    if (!canNewChat()) return;
    archiveChat();
    const fresh = [{ role: "assistant", content: "Hey! Wory đây. Mình bắt đầu cuộc trò chuyện mới nhé!" }];
    setMsgs(fresh);
    saveJSON("chat_started", Date.now());
  };

  const [aiIn, setAiIn]       = useState("");
  const [aiLoad, setAiLoad]   = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceModeRef = useRef(false);
  const endRef       = useRef(null);
  const voiceRef     = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => {
    if (msgs.length > 0 && !aiLoad) {
      const limit = settings.chatHistoryLimit || 100;
      saveJSON("chat_history", msgs.slice(-limit));
    }
  }, [msgs, aiLoad, settings.chatHistoryLimit]);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);

  /* ── Chat voice ── */
  const voice = useVoice(txt => { setAiIn(txt); setTimeout(() => sendChat(txt), 150); });
  useEffect(() => { voiceRef.current = voice; }, [voice]);

  /* ── Auto-learning state ── */
  const lastExtractionIdx = useRef(0);
  const lastExtractionTs = useRef(0);
  const extractionCount = useRef(0);
  const [knowledgeToast, setKnowledgeToast] = useState(null);

  const tryAutoExtract = useCallback(async (currentMsgs) => {
    if (extractionCount.current >= 3) return;
    if (Date.now() - lastExtractionTs.current < 5 * 60 * 1000) return;
    const newMsgCount = currentMsgs.length - lastExtractionIdx.current;
    if (newMsgCount < 4) return;
    const recent = currentMsgs.slice(lastExtractionIdx.current);
    const meaningful = recent.filter(m => m.role === "user" && m.content.length > 5);
    if (meaningful.length < 2) return;

    lastExtractionIdx.current = currentMsgs.length;
    lastExtractionTs.current = Date.now();
    extractionCount.current++;

    try {
      const items = await extractKnowledge(currentMsgs, knowledge.entries);
      if (items.length > 0) {
        let k = knowledge;
        for (const item of items) {
          const entry = {
            id: Date.now() + Math.random(),
            ts: new Date().toISOString(),
            content: item.content,
            category: item.category,
            source: "auto",
            confidence: 0.7,
            approved: false,
            tags: item.tags || [],
          };
          k = { ...k, entries: [...k.entries, entry] };
        }
        setKnowledge(k);
        saveJSON("wory_knowledge", k);
        setKnowledgeToast(items.length);
        setTimeout(() => setKnowledgeToast(null), 5000);
      }
    } catch {}
  }, [knowledge, setKnowledge]);

  /* ── Build system prompt (shared by chat + HeyModal) ── */
  const buildSystemPrompt = useCallback((chatMsgs) => {
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");
    const today = todayStr();
    const dayNames = ["Chu nhat","Thu 2","Thu 3","Thu 4","Thu 5","Thu 6","Thu 7"];
    const dayName = dayNames[now.getDay()];
    const sum = tasks.map(t => {
      let s = `- ${t.title} [${STATUSES[t.status]?.label}] uu tien:${PRIORITIES[t.priority]?.label?.split("\n")[0] || t.priority}`;
      if (t.deadline) s += ` deadline:${t.deadline}`;
      if (t.originalDeadline) s += ` (goc:${t.originalDeadline})`;
      if (t.startTime) s += ` luc ${t.startTime}`;
      if (t.duration) s += ` ${t.duration}ph`;
      if (t.category) s += ` [${t.category}]`;
      if (t.subtasks?.length) { const done = t.subtasks.filter(st => st.done).length; s += ` subtask:${done}/${t.subtasks.length}`; }
      if (t.notes?.length) s += ` ${t.notes.length} ghi chu`;
      if (t.expenses?.length) { const total = t.expenses.reduce((a, e) => a + (e.amount || 0), 0); if (total) s += ` chi:${total.toLocaleString()}d`; }
      if (t.deleted) s += " [DA XOA]";
      return s;
    }).join("\n");
    const memText = memoryToText(memory);
    const knowledgeText = buildKnowledgePrompt(knowledge);
    const shortName = (settings.displayName || user.name || "ban").split(" ").pop();
    const canEdit = settings.woryCanEdit;

    const recentMsgs = (chatMsgs || msgs).slice(-20);
    let chatSummary = "";
    if (recentMsgs.length > 2) {
      const topics = recentMsgs
        .filter(m => m.role === "user" && m.content?.length > 3)
        .slice(-5)
        .map(m => m.content.slice(0, 80))
        .join(" | ");
      if (topics) chatSummary = `CAC CHU DE GAN DAY: ${topics}`;
    }

    const active = tasks.filter(t => t.status !== "done");
    const overdue = active.filter(t => t.deadline && t.deadline < today);
    const dueToday = active.filter(t => t.deadline === today);
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = fmtDate(tomorrow);
    const dueTomorrow = active.filter(t => t.deadline === tomorrowStr);
    const thisWeek = active.filter(t => {
      if (!t.deadline) return false;
      const d = new Date(t.deadline);
      const diff = (d - now) / (1000*60*60*24);
      return diff > 1 && diff <= 7;
    });
    const noDeadline = active.filter(t => !t.deadline);

    const fmtTask = (t) => {
      let s = `"${t.title}" [${STATUSES[t.status]?.label}] uu tien:${PRIORITIES[t.priority]?.label?.split("\n")[0] || t.priority}`;
      if (t.deadline) s += ` deadline:${t.deadline}`;
      if (t.originalDeadline) s += ` (goc:${t.originalDeadline})`;
      if (t.startTime) s += ` luc ${t.startTime}`;
      if (t.duration) s += ` ${t.duration}ph`;
      if (t.category) s += ` [${t.category}]`;
      if (t.subtasks?.length) { const done = t.subtasks.filter(s => s.done).length; s += ` subtask:${done}/${t.subtasks.length}`; }
      if (t.notes?.length) s += ` co ${t.notes.length} ghi chu`;
      if (t.expenses?.length) { const total = t.expenses.reduce((a, e) => a + (e.amount || 0), 0); s += ` chi:${total.toLocaleString()}d`; }
      return s;
    };

    const timeContext = `TONG QUAN CONG VIEC:
${overdue.length ? `⚠ QUA HAN (${overdue.length}):\n${overdue.map(t => "  - " + fmtTask(t)).join("\n")}` : "Khong co viec qua han."}
${dueToday.length ? `📌 HOM NAY (${dueToday.length}):\n${dueToday.map(t => "  - " + fmtTask(t)).join("\n")}` : "Khong co viec hom nay."}
${dueTomorrow.length ? `📋 NGAY MAI (${dueTomorrow.length}):\n${dueTomorrow.map(t => "  - " + fmtTask(t)).join("\n")}` : ""}
${thisWeek.length ? `📅 TUAN NAY (${thisWeek.length}):\n${thisWeek.map(t => "  - " + fmtTask(t)).join("\n")}` : ""}
${noDeadline.length ? `❓ CHUA CO DEADLINE (${noDeadline.length}): ${noDeadline.map(t => t.title).join(", ")}` : ""}`;

    const toneMap = {
      friendly: `- Noi ngan gon, di thang vao van de, nhu nhan tin voi ban than
- Goi "${shortName}", xung "toi"
- Vui ve, dua nhe, biet quan tam khi can`,
      professional: `- Noi ngan gon, lich su, chuyen nghiep
- Goi "${shortName}", xung "toi"
- Tap trung vao cong viec, tranh lan man
- Dung tu ngu chinh xac, ro rang`,
      funny: `- Noi vui ve, di dom, thuong kem cau dua
- Goi "${shortName}" theo cach than mat, xung "toi"
- Lam viec nghiem tuc nhung noi chuyen hai huoc
- Thuong kem emoji hoac cau noi bat ngo`,
      strict: `- Noi ngan gon, truc tiep, khong vong vo
- Goi "${shortName}", xung "toi"
- Tap trung toi da vao cong viec va deadline
- Nhac nho nghiem khac khi tre han hoac chua hoan thanh`,
      caring: `- Noi an can, chu dao, quan tam den ${shortName}
- Goi "${shortName}" than mat, xung "toi"
- Thuong hoi tham suc khoe, tinh than truoc khi vao viec
- Khuyen khich khi ${shortName} hoan thanh tot, dong vien khi gap kho`,
    };
    const tone = settings.userRole === "staff" ? toneMap.strict : (toneMap[settings.woryTone] || toneMap.friendly);

    return `Ban la Wory — tro ly than thiet cua ${shortName}. Noi tieng Viet tu nhien.
Hom nay: ${dayName}, ${today}, ${timeStr}.

CACH NOI:
${tone}
- Tra loi chuyen phiem binh thuong, khong cung nhac
- Chi dung list/markdown khi lap ke hoach hoac phan tich TRONG CHAT TEXT
- KHONG mo dau bang "Chao ${shortName}!" moi lan — chi chao khi hop ly
- KHONG lap lai cau da noi. Neu ${shortName} noi "u", "ok" → hieu la dong y, tien hanh luon
- KHONG hoi di hoi lai cung mot cau. Linh hoat, tu nhien nhu nguoi that
- Khi ${shortName} xac nhan → HANH DONG NGAY, khong hoi them

QUAN TRONG — CACH NOI VE CONG VIEC:
- KHONG doc emoji, gach dau dong, dau *, hay ky hieu markdown khi VOICE/TTS
- Trong chat TEXT: duoc dung list, xuong dong de trinh bay ro rang
- Khi ${shortName} hoi ve cong viec → BAO QUAN TOAN CANH:
  * Noi ro TEN + DEADLINE + MUC UU TIEN + TRANG THAI cua tung viec
  * Neu co viec qua han hoac gap → NHAC TRUOC, sap xep thu tu uu tien
  * Neu co subtask/ghi chu/chi tieu → de cap ngan gon (VD: "da xong 2/5 buoc", "da chi 200k")
- Vi du DUNG: "${shortName} hom nay co 3 viec: Bao cao Q1 (deadline hom nay, uu tien cao, dang lam — con 2/5 buoc), Hop review 3h chieu, Tuyen dev (chua gap). Nen xu ly Bao cao truoc nhe!"
- Khi ${shortName} chi hoi nhanh 1 viec cu the → tra loi ngan gon thoi
- CHU DONG nhac viec quan trong ma ${shortName} chua de cap — dung doi hoi moi noi

CHUC NANG DAC BIET — GHI NHO:
- Khi ${shortName} nho "nho giup...", "ghi nho...", "luu lai...", "dung quen..." → tra loi: [SAVE:noi_dung] de toi luu vao bo nho
- Khi ${shortName} hoi "toi da nho nho gi?", "ghi nho cua toi" → liet ke tu bo nho ben duoi
- Khi ${shortName} noi "xoa ghi nho..." → tra loi: [DELETE:id] de xoa

CHUC NANG — QUAN LY CONG VIEC:${canEdit ? `
Ban CO QUYEN them/sua/xoa cong viec. QUY TRINH BAT BUOC:
1. ${shortName} yeu cau (VD: "xoa task Bao cao Q1", "them viec Mua qua", "danh dau hoan thanh Hop review")
2. Ban XAC NHAN lai: "${shortName} muon toi xoa 'Bao cao Q1' nhe?"
3. ${shortName} dong y → Ban GUI LENH:
   - Xoa: [TASK_DELETE:ten_task]
   - Them: [TASK_ADD:ten_task|priority:cao/trung/thap/none|deadline:YYYY-MM-DD|time:HH:MM|duration:so_phut|category:danh_muc]
     (chi can ten_task bat buoc, cac field khac tuy chon, dien day du nhat co the)
   - Co the them NHIEU viec 1 luc, moi viec 1 lenh [TASK_ADD:...] rieng biet
   - Khi nguoi dung noi gio, deadline, muc uu tien → PHAI dien vao lenh, KHONG duoc bo qua
   - Doi trang thai: [TASK_STATUS:ten_task:done] (gia tri: todo/prepare/inprogress/done)
   - Doi uu tien: [TASK_PRIORITY:ten_task:cao] (gia tri: cao/trung/thap/none)
   - Sua tieu de: [TASK_TITLE:ten_task_cu:tieu_de_moi]
   - Sua deadline: [TASK_DEADLINE:ten_task:YYYY-MM-DD]
   - Sua ghi chu: [TASK_NOTES:ten_task:noi_dung_ghi_chu]
   - Them chi tieu: [TASK_EXPENSE:ten_task:ly_do|so_tien|danh_muc] (danh_muc: work/relationship/family/personal/other)
   - NHIEU KHOAN CHI: moi khoan 1 lenh rieng biet. VD: nguoi dung noi "mua van phong pham 200k, taxi 150k" → GUI 2 LENH:
     [TASK_EXPENSE:ten_task:Van phong pham|200000|work]
     [TASK_EXPENSE:ten_task:Taxi|150000|work]
   - Neu nguoi dung noi ve chi tieu/tien → dung TASK_EXPENSE. Neu khong phai chi tieu → dung TASK_NOTES
   - PHAI dien DAY DU ly_do va so_tien. KHONG de trong ly_do hoac so_tien = 0
4. KHONG BAO GIO thuc hien ma chua duoc ${shortName} xac nhan
5. Ten task dung de tim kiem — khong can chinh xac 100%, chi can du nhan ra
6. Khi ${shortName} noi "u", "ok", "duoc", "dung roi" sau khi ban hoi xac nhan → THUC HIEN NGAY, khong hoi lai

TU DONG XEP CAP DO UU TIEN (Ma tran Eisenhower):
- Khi ${shortName} them viec ma KHONG noi muc uu tien → Ban PHAI TU DANH GIA dua tren noi dung:
  * cao = Quan trong VA Khan cap (deadline gan/hom nay, hau qua lon neu tre, lien quan tien/phap ly/suc khoe)
  * trung = Khong quan trong NHUNG Khan cap (co deadline gan, nhung khong anh huong lon)
  * thap = Quan trong NHUNG Khong khan cap (can lam nhung chua gap, ke hoach dai han)
  * none = Khong quan trong, Khong khan cap (lam khi ranh, khong anh huong gi)
- Luon dien priority vao lenh TASK_ADD, khong de mac dinh "trung"
- Neu khong chac → hoi ${shortName}: "Viec nay gap khong ${shortName}?"

CANH BAO THOI GIAN:
- Khi ${shortName} them/sua viec, ban PHAI kiem tra danh sach cong viec hien tai:
  * Neu hom nay da co nhieu viec (>=5 viec chua xong) → canh bao: "${shortName} hom nay da kha nhieu viec roi, muon doi sang ngay khac khong?"
  * Neu cung khung gio da co viec khac → canh bao: "Khung gio nay da co [ten viec]. Doi gio khac nhe?"
  * Neu deadline da qua → canh bao: "Deadline nay da qua roi, ${shortName} muon dat ngay nao?"
  * Neu tong thoi gian cong viec hom nay > 8 gio → canh bao: "${shortName} da xep khoang X gio viec hom nay, co qua tai khong?"
- KHONG chan hanh dong — chi CANH BAO roi de ${shortName} quyet dinh` : `
Ban KHONG co quyen chinh sua cong viec. Neu ${shortName} yeu cau sua/xoa, hay noi: "Hien tai toi chua duoc phep chinh sua cong viec. ${shortName} bat quyen cho toi trong Cai dat > AI & Giong nhe!"`}

QUAN TRONG — TRUOC MOI CAU TRA LOI, BAN PHAI:
1. XEM LAI PHONG CACH: doc lai cac cau ${shortName} da noi de hieu cach ${shortName} giao tiep (trang trong hay suong sa, dai hay ngan) → dap ung dung phong cach
2. XEM LAI THOI GIAN: bay gio la ${timeStr}, ${dayName}. Doi chieu gio hien tai voi deadline va lich cong viec de nhac nho/goi y phu hop
3. XEM LAI LICH SU CHAT: doc lai nhung gi da noi de TRANH lap lai, nho nhung gi da hua/de cap, va tiep tuc mach hoi thoai tu nhien
4. Ket hop thong tin tu nhieu nguon (cong viec, ghi nho, knowledge, lich su) de tra loi chinh xac
5. Khong noi bua — neu khong chac, hoi lai
6. KHONG lap lai thong tin da noi truoc do trong cung cuoc hoi thoai

${chatSummary ? chatSummary + "\n\n" : ""}TRO LY CHU DONG — KHONG DOI HOI MOI NOI:
- Ban la tro ly THUC THU — phai nam ro TOAN BO cong viec, deadline, muc do uu tien, tien do
- Khi ${shortName} bat dau hoi thoai hoac hoi "hom nay lam gi?" → TRINH BAY TOAN CANH:
  1. Viec qua han (CANH BAO MANH — phai xu ly truoc)
  2. Viec deadline hom nay (lam ngay, noi ro con bao lau)
  3. Viec deadline ngay mai (canh bao som)
  4. Viec cao+khan cap (Eisenhower Q1)
  5. Viec co lich cu the (startTime)
  6. Goi y thu tu lam viec hop ly
- Khi noi ve cong viec → LUON kem theo: deadline con bao lau, muc uu tien, tien do subtask (neu co)
- Khi ${shortName} them viec moi → tu dong goi y deadline + gio phu hop dua tren lich hien tai + canh bao xung dot
- Khi ${shortName} hoi bat ky cau gi lien quan cong viec → DOI CHIEU voi TOAN BO danh sach, khong chi 1 viec
- Neu thay viec quan trong ma ${shortName} chua de cap → CHU DONG nhac, khong doi hoi
- Neu ${shortName} ranh → goi y xu ly viec chua co deadline hoac viec dai han
- Moi lan tra loi → suy nghi: "Minh da bao quat het chua? Co viec nao quan trong ma minh quen chua nhac khong?"

${timeContext}

THONG TIN VE ${shortName.toUpperCase()}:
${knowledgeText}

BO NHO CUA ${shortName.toUpperCase()}:
${memText}

CONG VIEC (${tasks.length}):
${sum}`;
  }, [tasks, memory, knowledge, settings.displayName, settings.woryCanEdit, settings.woryTone, user.name, msgs]);

  /* ── Send chat message ── */
  const sendChat = useCallback(async (override) => {
    const msg = (override ?? aiIn).trim();
    if (!msg || aiLoad) return;
    setAiIn("");
    voice.stop();
    const historyMsgs = [...msgs, { role: "user", content: msg, ts: Date.now() }];
    setMsgs([...historyMsgs, { role: "assistant", content: "", ts: Date.now() }]);
    setAiLoad(true);
    try {
      const fullText = await callClaudeStream(
        buildSystemPrompt(historyMsgs),
        historyMsgs.map(m => ({ role: m.role, content: m.content })),
        (partial) => {
          setMsgs(prev => {
            const u = [...prev];
            u[u.length - 1] = { ...u[u.length - 1], content: partial };
            return u;
          });
        },
        1500
      );
      let cleanText = processMemoryCommands(fullText, memory, setMemory, knowledge, setKnowledge);
      const { cleanText: taskClean, actions } = processTaskCommands(cleanText, tasks, {}, settings.woryCanEdit);
      cleanText = taskClean;
      if (actions.length > 0) {
        executeTaskActions(actions, { addTask, deleteTask, patchTask });
      }
      cleanText = cleanText.replace(/\[TASK_\w+:.+?\]/g, "");

      if (cleanText !== fullText) {
        setMsgs(prev => {
          const u = [...prev];
          u[u.length - 1] = { ...u[u.length - 1], content: cleanText };
          return u;
        });
      }
      if (settings.ttsEnabled) {
        tts(cleanText, settings.ttsSpeed, () => {
          setTimeout(() => {
            if (voiceModeRef.current && voiceRef.current && !voiceRef.current.on) {
              try { voiceRef.current.toggle(); } catch {}
            }
          }, 300);
        });
      }
      tryAutoExtract(historyMsgs.concat([{ role: "assistant", content: cleanText }]));
    } catch {
      setMsgs(prev => {
        const u = [...prev];
        u[u.length - 1] = { role: "assistant", content: "Lỗi kết nối. Vui lòng thử lại." };
        return u;
      });
    }
    setAiLoad(false);
  }, [aiIn, aiLoad, msgs, buildSystemPrompt, voice, memory, setMemory, knowledge, setKnowledge, tasks, settings, addTask, deleteTask, patchTask, tryAutoExtract]);

  /* ── Toggle voice mode ── */
  const toggleVoiceMode = useCallback(() => {
    const next = !voiceMode;
    setVoiceMode(next);
    voiceModeRef.current = next;
    if (next) {
      setTimeout(() => { if (voiceRef.current && !voiceRef.current.on) voiceRef.current.toggle(); }, 300);
      if (settings.ttsEnabled) tts("Chế độ thoại bật. Tôi đang nghe.", settings.ttsSpeed);
    } else {
      voice.stop();
      window.speechSynthesis?.cancel();
      if (settings.ttsEnabled) tts("Đã tắt chế độ thoại.", settings.ttsSpeed);
    }
  }, [voiceMode, voice, settings.ttsEnabled, settings.ttsSpeed]);

  return {
    msgs, setMsgs, aiIn, setAiIn, aiLoad, voiceMode, voice, endRef, knowledgeToast,
    sendChat, toggleVoiceMode, buildSystemPrompt, canNewChat, startNewChat,
  };
}
