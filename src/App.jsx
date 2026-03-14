/* ================================================================
   APP.JSX — Main orchestrator (slim version)
   Uses Context/store for state, modular components & pages
   ================================================================ */
import { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";

import { C, STATUSES, PRIORITIES, todayStr, fmtDate, isOverdue } from "./constants";
import { setUserPrefix, callClaudeStream, tts, memoryToText, buildKnowledgePrompt, extractKnowledge, addKnowledgeEntry, processTaskCommands, processMemoryCommands, executeTaskActions, addMemory, deleteMemory, loadJSON, saveJSON, encryptToken, decryptToken, sendBackupEmail } from "./services";
import { useVoice } from "./hooks";
import { AppProvider, useStore, useTasks, useSettings } from "./store";
import { Pill, Filters, ProjectFilters, TaskRow, UserMenu, UndoToast, MdBlock, Empty, getAlertLevel } from "./components";

import LoginScreen from "./components/LoginScreen";
import SettingsModal from "./components/SettingsModal";
import { SupabaseProvider, useSupabase } from "./contexts/SupabaseContext";
import { supabase } from "./lib/supabase";
import CallScreen from "./components/CallScreen";
import TaskSheet from "./components/TaskSheet";
import HeyModal from "./components/HeyModal";
import VoiceAddModal from "./components/VoiceAddModal";
import DesktopFloat from "./components/DesktopFloat";

import CalendarTab from "./pages/CalendarTab";
import InboxTab from "./pages/InboxTab";
import ExpenseTab from "./pages/ExpenseTab";
import ReportTab from "./pages/ReportTab";
import DevTab from "./pages/DevTab";
import QRScanModal from "./components/QRScanModal";
import { NewProjectModal, ProjectDetailSheet } from "./components/ProjectModals";


/* ================================================================
   ROOT — Auth wrapper
   ================================================================ */
export default function App() {
  // CRITICAL: setUserPrefix MUST run synchronously before AppProvider
  // renders, otherwise store initializers load data with wrong prefix
  // and auto-save overwrites real data = data loss on reload.
  const [user, setUser] = useState(() => {
    try {
      const s = localStorage.getItem("wf_session");
      if (s) {
        const parsed = JSON.parse(s);
        setUserPrefix(parsed.id); // sync — before any store init
        return parsed;
      }
      return null;
    } catch { return null; }
  });

  const handleLogout = () => {
    localStorage.removeItem("wf_session");
    setUser(null);
    setUserPrefix("");
  };

  if (!user) return <LoginScreen onLogin={(acc) => { setUserPrefix(acc.id); setUser(acc); }} />;

  return (
    <SupabaseProvider>
      <AppProvider userId={user.id}>
        <MainApp user={user} onLogout={handleLogout} />
      </AppProvider>
    </SupabaseProvider>
  );
}

/* ================================================================
   MAIN APP — Header, Body, Nav, Modals, AI Chat
   ================================================================ */
function MainApp({ user, onLogout }) {
  const {
    tasks, addTask, deleteTask, patchTask, undoDelete,
    timerStart, timerPause, timerResume, timerDone, timerTick,
    history, memory, setMemory, knowledge, setKnowledge, pendingKnowledge, undoToast, settings,
    expenses, addExpense, patchExpense: patchExp, deleteExpense,
    projects, addProject, patchProject, deleteProject, hardDelete,
  } = useStore();

  const [tab, _setTab]        = useState(() => sessionStorage.getItem("wf_tab") || settings.defaultTab || "tasks");
  const setTab = useCallback((t) => { sessionStorage.setItem("wf_tab", t); _setTab(t); }, []);
  const [sel, setSel]         = useState(null);
  const [filter, setFilter]   = useState(() => settings.defaultFilter || "all");
  const [projFilter, setProjFilter] = useState("all");
  const [newProjOpen, setNewProjOpen] = useState(false);
  const [projDetail, setProjDetail] = useState(null);
  const [openConvId, setOpenConvId] = useState(null); // for opening project chat
  const [heyOpen, setHeyOpen] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("voice") === "1") {
      window.history.replaceState({}, "", window.location.pathname);
      return true;
    }
    return false;
  });

  /* ── PWA Install Banner ── */
  const [showInstall, setShowInstall] = useState(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (isStandalone) return false;
    const dismissed = localStorage.getItem("wf_install_dismissed");
    if (dismissed && Date.now() - Number(dismissed) < 7 * 86400000) return false; // 7 days
    return true;
  });
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  const dismissInstall = () => { setShowInstall(false); localStorage.setItem("wf_install_dismissed", String(Date.now())); };

  /* ── Gmail OAuth callback handler (encrypted storage) ── */
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailUnread, setGmailUnread] = useState(0);
  useEffect(() => {
    (async () => {
      // Handle OAuth callback
      const params = new URLSearchParams(window.location.search);
      const gmailToken = params.get("gmail");
      if (gmailToken) {
        try {
          const data = JSON.parse(atob(gmailToken.replace(/-/g, '+').replace(/_/g, '/')));
          if (data.refresh_token) {
            const encrypted = await encryptToken(data, user.id);
            if (encrypted) localStorage.setItem("wf_gmail_enc", encrypted);
            saveJSON("gmail_token", { email: data.email, connected_at: data.connected_at });
            setGmailConnected(true);
            window.history.replaceState({}, "", window.location.pathname);
          }
        } catch {}
      } else {
        const meta = loadJSON("gmail_token", null);
        if (meta?.email) setGmailConnected(true);
      }

      // Auto-fetch email count on load
      if (settings.autoFetchEmail !== false) {
        try {
          const encStr = localStorage.getItem("wf_gmail_enc");
          if (encStr) {
            const tokenData = await decryptToken(encStr, user.id);
            if (tokenData?.refresh_token) {
              const res = await fetch("/api/gmail-fetch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: tokenData.refresh_token, maxResults: settings.emailFetchCount || 15 }),
              });
              const data = await res.json();
              if (data.emails) {
                saveJSON("gmail_emails", data.emails);
                setGmailUnread(data.emails.filter(e => e.unread).length);
              }
              if (data.needReauth) {
                localStorage.removeItem("wf_gmail_enc");
                saveJSON("gmail_token", null);
                setGmailConnected(false);
              }
            }
          }
        } catch {}
      }
    })();

    // Listen for Gmail connection from Settings popup flow
    const onGmailMsg = (e) => {
      if (e.data?.type === "gmail_connected") {
        const meta = loadJSON("gmail_token", null);
        if (meta?.email) setGmailConnected(true);
      }
    };
    window.addEventListener("message", onGmailMsg);
    return () => window.removeEventListener("message", onGmailMsg);
  }, []); // eslint-disable-line

  /* ── Auto backup to email (daily) ── */
  useEffect(() => {
    if (!settings.autoBackup) return;
    const lastBackup = loadJSON("last_backup", null);
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (lastBackup && Date.now() - new Date(lastBackup).getTime() < oneDayMs) return;
    // Send backup (async, fire-and-forget)
    sendBackupEmail(user.id).catch(() => {});
  }, []); // eslint-disable-line

  const [addOpen, setAddOpen]         = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alertToast, setAlertToast]   = useState(null); // { task, type }
  const [bellOpen, setBellOpen]       = useState(false);
  const [miniVoice, setMiniVoice]     = useState(false); // mini voice widget
  const [miniListening, setMiniListening] = useState(false); // mic active state
  const [miniReply, setMiniReply]     = useState("");
  const [miniLoading, setMiniLoading] = useState(false);
  const [miniTask, setMiniTask]       = useState(null); // task context for voice
  const [miniTranscript, setMiniTranscript] = useState(""); // what user said
  const [miniText, setMiniText]       = useState(""); // text input for mini widget
  const [qrOpen, setQrOpen]           = useState(false);
  const [globalCall, setGlobalCall]   = useState(null); // { conversationId, convName, mode, callerId }
  const alertDismissedRef = useRef(new Set());

  /* ── AI Chat state ── */
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
    // Rate limits: max 3/session, min 5 min apart, need 4+ new msgs
    if (extractionCount.current >= 3) return;
    if (Date.now() - lastExtractionTs.current < 5 * 60 * 1000) return;
    const newMsgCount = currentMsgs.length - lastExtractionIdx.current;
    if (newMsgCount < 4) return;
    // Filter out trivial messages
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

    // Build chat history summary (last 20 messages for context awareness)
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

    // Time-aware task stats
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
      // Process memory commands
      let cleanText = processMemoryCommands(fullText, memory, setMemory, knowledge, setKnowledge);
      // Process task commands (DRY — unified)
      const { cleanText: taskClean, actions } = processTaskCommands(cleanText, tasks, {}, settings.woryCanEdit);
      cleanText = taskClean;
      if (actions.length > 0) {
        executeTaskActions(actions, { addTask, deleteTask, patchTask });
      }
      // Clean remaining brackets
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
      // Auto-learn from conversation (non-blocking)
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

  /* ── Mini voice (quick voice on task tab) ── */
  const miniVoiceRef = useRef(null);
  const miniAutoCloseRef = useRef(null);
  const sendMiniVoiceRef = useRef(null);

  const closeMiniVoice = useCallback(() => {
    if (miniVoiceRef.current?.on) { miniVoiceRef.current.on = false; miniVoiceRef.current.stop?.(); }
    if (miniAutoCloseRef.current) { clearTimeout(miniAutoCloseRef.current); miniAutoCloseRef.current = null; }
    setMiniVoice(false); setMiniReply(""); setMiniTask(null); setMiniTranscript(""); setMiniText(""); setMiniListening(false);
    window.speechSynthesis?.cancel();
  }, []);

  const miniSilenceRef = useRef(null);
  const startMiniListening = useCallback(() => {
    if (window.speechSynthesis?.speaking) return;
    if (miniAutoCloseRef.current) { clearTimeout(miniAutoCloseRef.current); miniAutoCloseRef.current = null; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "vi-VN"; rec.continuous = false; rec.interimResults = true;

    let resultText = "";

    rec.onresult = (e) => {
      resultText = e.results[0][0].transcript;
      setMiniText(resultText);
    };
    rec.onerror = () => { miniVoiceRef.current = { on: false }; setMiniListening(false); };
    rec.onend = () => {
      miniVoiceRef.current = { on: false };
      setMiniListening(false);
      // Không gửi tự động — để user xem/sửa text trước khi gửi
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
  }, [buildSystemPrompt, memory, setMemory, tasks, settings, addTask, deleteTask, patchTask, miniLoading, closeMiniVoice]);

  // Keep ref in sync so startMiniListening always calls latest sendMiniVoice
  sendMiniVoiceRef.current = sendMiniVoice;

  /* ── Push subscription — register for background push ── */
  useEffect(() => {
    if (!settings.notificationsEnabled) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;
    const subscribePush = async () => {
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return;
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          const urlB64 = Uint8Array.from(atob(vapidKey.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64 });
        }
        // Save subscription to backend
        const subJSON = sub.toJSON();
        await fetch("/api/push-subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, subscription: subJSON }),
        });
      } catch (e) { console.warn("Push subscribe failed:", e); }
    };
    subscribePush();
  }, [settings.notificationsEnabled, user.id]);

  /* ── Global incoming call detection — works from any tab ── */
  const { session: supaSession } = useSupabase();
  const supaUserId = supaSession?.user?.id;
  const lastCallCheckRef = useRef(new Date().toISOString());
  const ringtoneRef = useRef(null);

  useEffect(() => {
    if (!supabase || !supaUserId) return;

    const checkCalls = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, created_at")
        .eq("type", "call")
        .neq("sender_id", supaUserId)
        .gt("created_at", lastCallCheckRef.current)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!data || data.length === 0) return;
      const msg = data[0];
      const age = Date.now() - new Date(msg.created_at).getTime();
      if (age > 30000) return; // ignore calls older than 30s

      lastCallCheckRef.current = msg.created_at;

      // Get caller name
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", msg.sender_id)
        .single();

      setGlobalCall({
        conversationId: msg.conversation_id,
        convName: callerProfile?.display_name || "Cuộc gọi",
        mode: msg.content?.includes("video") ? "video" : "audio",
        callerId: msg.sender_id,
      });
    };

    const interval = setInterval(checkCalls, 3000);
    checkCalls();
    return () => clearInterval(interval);
  }, [supaUserId]);

  // Ringtone — only play while ringing (globalCall exists but NOT accepted)
  useEffect(() => {
    const stopRingtone = () => {
      if (ringtoneRef.current) {
        clearInterval(ringtoneRef.current.interval);
        ringtoneRef.current.ctx.close().catch(() => {});
        ringtoneRef.current = null;
      }
    };

    // Stop ringtone if no call or call already accepted
    if (!globalCall || globalCall.accepted) {
      stopRingtone();
      return;
    }

    // Start ringtone
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99, 659.25];
      const playNote = () => {
        const time = ctx.currentTime;
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine"; osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.3, time + i * 0.2);
          gain.gain.exponentialRampToValueAtTime(0.01, time + i * 0.2 + 0.18);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(time + i * 0.2); osc.stop(time + i * 0.2 + 0.2);
        });
      };
      playNote();
      const interval = setInterval(playNote, 1200);
      ringtoneRef.current = { ctx, interval };
    } catch {}

    // Auto-dismiss after 30s
    const timeout = setTimeout(() => setGlobalCall(null), 30000);
    return () => {
      clearTimeout(timeout);
      stopRingtone();
    };
  }, [globalCall]);

  const acceptGlobalCall = () => {
    if (!globalCall) return;
    // Navigate to inbox tab → ChatTab will pick it up
    setTab("inbox");
    setGlobalCall(prev => ({ ...prev, accepted: true }));
  };

  const declineGlobalCall = () => setGlobalCall(null);
  const endGlobalCall = useCallback(() => setGlobalCall(null), []);

  /* ── Global new-message alarm (when NOT on inbox tab) ── */
  const [msgToast, setMsgToast] = useState(null);
  const lastMsgCheckRef = useRef(new Date().toISOString());

  useEffect(() => {
    if (!supabase || !supaUserId) return;

    const checkNewMsgs = async () => {
      // Only alert when NOT on inbox tab
      if (tab === "inbox") {
        lastMsgCheckRef.current = new Date().toISOString();
        return;
      }

      const { data } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, type, created_at")
        .neq("sender_id", supaUserId)
        .neq("type", "call")
        .gt("created_at", lastMsgCheckRef.current)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!data?.length) return;
      const msg = data[0];
      lastMsgCheckRef.current = msg.created_at;

      // Get sender name
      const { data: sender } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", msg.sender_id)
        .single();

      const senderName = sender?.display_name || "Ai đó";

      // Play notification chime
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880; osc.type = "sine";
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
      } catch {}

      // Show toast
      setMsgToast({
        senderName,
        content: msg.type === "image" ? "📷 Ảnh" : msg.content,
        conversationId: msg.conversation_id,
      });

      // Auto-dismiss after 5s
      setTimeout(() => setMsgToast(null), 5000);
    };

    const interval = setInterval(checkNewMsgs, 4000);
    return () => clearInterval(interval);
  }, [supaUserId, tab]);

  /* ── Notification reminders ── */
  useEffect(() => {
    if (!settings.notificationsEnabled) return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") Notification.requestPermission();

    const notified = new Set(); // tracks what's been notified this session
    const notify = async (title, options) => {
      try {
        const reg = await navigator.serviceWorker?.ready;
        if (reg) { reg.showNotification(title, { ...options, tag: options.tag || title, renotify: true }); }
        else { new Notification(title, options); }
      } catch { /* ignore */ }
    };
    const playSoftChime = () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 660; osc.type = "sine";
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
      } catch {}
    };
    const alertQueue = [];
    let showing = false;
    const showNext = () => {
      if (alertQueue.length === 0) { showing = false; return; }
      showing = true;
      const { task, type, label } = alertQueue.shift();
      const key = `${type}-${task.id}`;
      if (alertDismissedRef.current.has(key)) { showNext(); return; }
      playSoftChime();
      setAlertToast({ task, type, label, key });
      setTimeout(() => { alertDismissedRef.current.add(key); setAlertToast(null); setTimeout(showNext, 300); }, 5000);
    };
    const showAlert = (task, type, label) => {
      const key = `${type}-${task.id}`;
      if (alertDismissedRef.current.has(key)) return;
      alertQueue.push({ task, type, label });
      if (!showing) showNext();
    };
    // Skip first check to avoid bombarding user when they open the app
    let isFirstCheck = true;
    const check = () => {
      const now = new Date();
      const todayS = fmtDate(now);
      const timeNow = now.getHours() * 60 + now.getMinutes();

      tasks.forEach(t => {
        if (t.status === "done") return;

        // 1. Sắp đến giờ — notify trước X phút (always, most important)
        if (t.startTime && t.deadline === todayS) {
          const [h, m] = t.startTime.split(":").map(Number);
          const taskMin = h * 60 + m;
          const reminderMin = settings.reminderMinutes || 5;
          if (timeNow >= taskMin - reminderMin && timeNow <= taskMin && !notified.has(`st-${t.id}`)) {
            showAlert(t, "st", `Sắp đến giờ (${t.startTime})`);
            notified.add(`st-${t.id}`);
            if (Notification.permission === "granted") notify(`Sắp đến giờ: ${t.title}`, { body: `Lúc ${t.startTime}`, icon: "/icon-192.png", tag: `st-${t.id}` });
          }
          // 2. Thúc giục — đã qua giờ bắt đầu mà chưa làm
          if (timeNow > taskMin && timeNow <= taskMin + 30 && t.status === "todo" && !notified.has(`urge-${t.id}`)) {
            const late = timeNow - taskMin;
            showAlert(t, "urge", `Đã qua ${late} phút`);
            notified.add(`urge-${t.id}`);
            if (Notification.permission === "granted") notify(`${t.title} — đã qua ${late} phút!`, { body: `Bắt đầu lúc ${t.startTime}, chưa thực hiện`, icon: "/icon-192.png", tag: `urge-${t.id}` });
          }
        }

        // 3. Quá hạn — thông báo tối đa 1 lần / giờ
        if (isOverdue(t)) {
          const odKey = `wf_od_ts_${t.id}`;
          const lastTs = Number(localStorage.getItem(odKey) || 0);
          const hourMs = 60 * 60 * 1000;
          if (Date.now() - lastTs >= hourMs) {
            localStorage.setItem(odKey, String(Date.now()));
            if (!isFirstCheck) {
              showAlert(t, "od", "Quá hạn");
            }
            if (Notification.permission === "granted") notify(`Quá hạn: ${t.title}`, { body: `Deadline ${t.deadline} đã qua`, icon: "/icon-192.png", tag: `od-${t.id}` });
          }
        }
      });
      isFirstCheck = false;
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, [tasks, settings]);

  /* ── Derived data (needed by effects below) ── */
  const isStaff = settings.userRole === "staff";
  const myName = settings.displayName || user.name;

  /* ── Project chat notification — track task status changes ── */
  const prevTasksRef = useRef(null);
  useEffect(() => {
    if (!supabase || !supaSession?.user?.id || !prevTasksRef.current) {
      prevTasksRef.current = tasks.map(t => ({ id: t.id, status: t.status, projectId: t.projectId }));
      return;
    }
    const prev = prevTasksRef.current;
    const statusLabels = { done: "Hoàn thành ✅", inprogress: "Đang làm 🔨", todo: "Chờ xử lý", review: "Đang review" };
    tasks.forEach(t => {
      if (!t.projectId) return;
      const old = prev.find(p => p.id === t.id);
      if (!old || old.status === t.status) return;
      // Status changed — send to project chat
      const proj = projects.find(p => p.id === t.projectId);
      if (!proj?.chatId) return;
      const who = myName || "Ai đó";
      const label = statusLabels[t.status] || t.status;
      const cleanTitle = t.title.replace(/^\d+\.\s*/, "");
      supabase.from("messages").insert({
        conversation_id: proj.chatId,
        sender_id: supaSession.user.id,
        content: `${who}: "${cleanTitle}" → ${label}`,
        type: "system",
      }).then(() => {
        supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", proj.chatId);
      }).catch(() => {});
    });
    prevTasksRef.current = tasks.map(t => ({ id: t.id, status: t.status, projectId: t.projectId }));
  }, [tasks, projects, supaSession, myName]);

  const filteredTasks = (() => {
    let list = filter === "all" ? tasks : tasks.filter(t => t.status === filter);
    if (!settings.showCompletedTasks && filter === "all") {
      list = list.filter(t => t.status !== "done");
    }
    // Staff: only see tasks assigned to them or tasks without assignee that they created
    if (isStaff && myName) {
      list = list.filter(t => !t.assignee || t.assignee === myName);
    }
    // Project filter
    if (projFilter === "standalone") list = list.filter(t => !t.projectId);
    else if (projFilter !== "all") list = list.filter(t => t.projectId === projFilter);
    // Sort: project view → stepIndex asc (workflow order); else → group by project then timeline
    const isProjectView = projFilter !== "all" && projFilter !== "standalone";
    const timelineSort = (a, b) => {
      if (!a.deadline && b.deadline) return 1;
      if (a.deadline && !b.deadline) return -1;
      if (a.deadline && b.deadline && a.deadline !== b.deadline) return b.deadline.localeCompare(a.deadline);
      if (!a.deadline && !b.deadline) return (Math.floor(b.id) || 0) - (Math.floor(a.id) || 0);
      const ta = a.startTime || "00:00"; const tb = b.startTime || "00:00";
      if (ta !== tb) return tb.localeCompare(ta);
      const po = { cao: 0, trung: 1, thap: 2, none: 3 };
      return (po[a.priority] ?? 3) - (po[b.priority] ?? 3);
    };
    list = [...list].sort((a, b) => {
      // done tasks always at bottom
      if (a.status === "done" && b.status !== "done") return 1;
      if (b.status === "done" && a.status !== "done") return -1;

      // Project view: sort by stepIndex ascending (workflow order top-down)
      if (isProjectView) {
        const si = (a.stepIndex ?? 999) - (b.stepIndex ?? 999);
        if (si !== 0) return si;
        return (Math.floor(a.id) || 0) - (Math.floor(b.id) || 0);
      }

      // All view: group by project first, then timeline within each group
      if (!isProjectView) {
        const aProj = a.projectId || "";
        const bProj = b.projectId || "";
        // tasks with project come before standalone
        if (aProj && !bProj) return -1;
        if (!aProj && bProj) return 1;
        // different projects → group together
        if (aProj !== bProj) return aProj < bProj ? -1 : 1;
      }

      // Within same project/group: timeline sort
      return timelineSort(a, b);
    });
    return list;
  })();
  const done = tasks.filter(t => t.status === "done").length;
  const over = tasks.filter(isOverdue).length;
  const alertTasks = tasks.filter(t => getAlertLevel(t) !== null);
  const alertCount = alertTasks.length;
  const fontScale = Math.min(settings.fontScale || 1, 1.22);

  return (
    <div className="app-container" style={fontScale !== 1 ? { zoom: fontScale } : undefined}>

      {/* ── HEADER ── */}
      <div style={{ padding: "8px 12px 6px", display: "flex", alignItems: "center", gap: 5, flexShrink: 0, background: "#fff", borderBottom: "1px solid #eae7e1" }}>
        <UserMenu user={{ ...user, name: settings.displayName || user.name }} onLogout={onLogout} onSettings={() => setSettingsOpen(true)} />
        <span style={{ fontSize:19, fontWeight:800, color:C.accent, letterSpacing:-.5 }}>WorkFlow</span>
        <div style={{ flex: 1, minWidth:2 }} />
        {/* Quick expense / QR scan */}
        <div className="tap" onClick={() => setQrOpen(true)}
          style={{ width:26, height:26, borderRadius:6, background:"#f7f5f2", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, lineHeight:1, flexShrink:0 }}
          title="Chi tiêu nhanh">
          🧾
        </div>
        {/* Email badge */}
        {gmailConnected && (
          <div className="tap" onClick={() => setTab("inbox")}
            style={{ position:"relative", width:26, height:26, borderRadius:6, background:"#f7f5f2", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, lineHeight:1, flexShrink:0 }}>
            📧
            {gmailUnread > 0 && <span style={{ position:"absolute", top:-3, right:-3, background:"#e67e22", color:"#fff", fontSize:8, fontWeight:700, borderRadius:10, minWidth:12, height:12, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 2px" }}>{gmailUnread}</span>}
          </div>
        )}
        <div style={{ position:"relative", flexShrink:0 }}>
          <div className="tap" onClick={() => setBellOpen(v => !v)}
            style={{ position:"relative", width:26, height:26, borderRadius:6, background:"#f7f5f2", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, lineHeight:1 }}>
            🔔
            {alertCount > 0 && <span style={{ position:"absolute", top:-3, right:-3, background:C.red, color:"#fff", fontSize:8, fontWeight:700, borderRadius:10, minWidth:12, height:12, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 2px", animation:"pulse 1.5s infinite" }}>{alertCount}</span>}
          </div>
          {bellOpen && (
            <>
              <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, zIndex:999, background:"rgba(0,0,0,.3)" }} onClick={() => setBellOpen(false)} />
              <div style={{ position:"fixed", top:56, left:12, right:12, maxWidth:456, margin:"0 auto", maxHeight:"70vh", overflowY:"auto", background:"#fff", borderRadius:16, boxShadow:"0 8px 32px rgba(0,0,0,.2)", zIndex:1000, padding:12, animation:"fadeIn .15s" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                  <span style={{ fontSize:15, fontWeight:700, color:C.text }}>🔔 Cảnh báo</span>
                  <button className="tap" onClick={() => setBellOpen(false)} style={{ background:"none", border:"none", fontSize:18, color:C.muted, padding:"2px 6px" }}>✕</button>
                </div>
                {alertTasks.length === 0 ? (
                  <div style={{ padding:20, textAlign:"center", color:C.muted, fontSize:14 }}>Không có cảnh báo nào</div>
                ) : alertTasks.map(t => {
                  const al = getAlertLevel(t);
                  return (
                    <div key={t.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:10, borderLeft:`3px solid ${al?.color}`, marginBottom:6, background:`${al?.color}08` }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{t.title}</div>
                        <div style={{ fontSize:11, color:al?.color, fontWeight:600 }}>{al?.label}{t.deadline ? ` · ${t.deadline}` : ""}{t.originalDeadline ? ` (từ ${t.originalDeadline})` : ""}</div>
                      </div>
                      <button className="tap" onClick={() => { patchTask(t.id, { status: "done" }); }}
                        style={{ background:C.green, color:"#fff", border:"none", borderRadius:8, padding:"5px 10px", fontSize:12, fontWeight:700, flexShrink:0 }}>✓</button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <Pill n={tasks.length} c={C.accent} l="việc" />
        <Pill n={done} c={C.green} l="xong" />
        {over > 0 && <Pill n={over} c={C.red} l="trễ" />}
      </div>

      {/* ── PWA INSTALL BANNER ── */}
      {showInstall && (
        <div style={{ margin: "0 13px 8px", padding: "10px 14px", background: `linear-gradient(135deg,${C.accentD},${C.purpleD || C.accentD})`, borderRadius: 12, border: `1px solid ${C.accent}33`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>📲</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Cài WorkFlow lên màn hình</div>
            <div style={{ fontSize: 10, color: C.sub, lineHeight: 1.4, marginTop: 2 }}>
              {isIOS
                ? <>Mở bằng <b>Safari</b> → bấm <span style={{ fontSize: 14 }}>⎙</span> (Share) → <b>"Thêm vào MH chính"</b></>
                : <>Bấm <b>⋮</b> menu → <b>"Thêm vào MH chính"</b> hoặc <b>"Install app"</b></>
              }
            </div>
          </div>
          <button className="tap" onClick={dismissInstall} style={{ background: "none", border: "none", color: C.muted, fontSize: 18, padding: "4px", flexShrink: 0 }}>×</button>
        </div>
      )}

      {/* ── BODY ── */}
      <div ref={el => {
        if (!el) return;
        // restore scroll on mount/tab switch
        if (!el._restored) { const s = sessionStorage.getItem("wf_scroll_" + tab); if (s) el.scrollTop = +s; el._restored = true; }
        el.onscroll = () => sessionStorage.setItem("wf_scroll_" + tab, el.scrollTop);
      }} key={tab} style={{ flex: 1, overflowY: "auto", padding: "0 13px", paddingBottom: tab === "ai" ? 168 : 76 }}>

        {tab === "tasks" && (
          <div style={{ animation: "fadeIn .2s" }}>
            <Filters filter={filter} setFilter={setFilter} />
            <ProjectFilters projects={projects} filter={projFilter} setFilter={setProjFilter} onAdd={() => setNewProjOpen(true)} onOpen={setProjDetail} isStaff={isStaff} myName={myName} onDeleteAll={async () => {
              const choice = prompt("Xóa TẤT CẢ dự án?\n\n1 = Xóa dự án, giữ công việc\n2 = Xóa dự án + công việc + nhóm chat\n\nNhập 1 hoặc 2:");
              if (!choice || !["1","2"].includes(choice)) return;
              // Delete chats on Supabase
              if (supabase) {
                for (const p of projects) {
                  if (p.chatId) {
                    await supabase.from("messages").delete().eq("conversation_id", p.chatId);
                    await supabase.from("conversation_members").delete().eq("conversation_id", p.chatId);
                    await supabase.from("conversations").delete().eq("id", p.chatId);
                  }
                }
              }
              if (choice === "1") { tasks.filter(t => t.projectId).forEach(t => patchTask(t.id, { projectId: null, stepIndex: null, assignee: null })); }
              else { tasks.filter(t => t.projectId).forEach(t => hardDelete(t.id)); }
              projects.forEach(p => deleteProject(p.id));
              setProjFilter("all");
            }} />
            {filteredTasks.length === 0 && <Empty />}
            {filteredTasks.map((t, i) => {
              const tDate = t.deadline || null;
              const prev = i > 0 ? filteredTasks[i - 1] : null;
              const prevDate = prev ? (prev.deadline || null) : "__none__";
              const showDate = !prev || prevDate !== tDate;
              const today = todayStr();
              const isToday = tDate === today;
              const isPast = tDate && tDate < today;
              const dotColor = t.status === "done" ? C.green : isPast ? C.red : isToday ? "#e67e22" : C.accent;
              const isLast = i === filteredTasks.length - 1;
              const fmtLabel = (d) => {
                if (!d) return "—";
                if (d === today) return "Nay";
                const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
                if (d === yesterday.toISOString().slice(0, 10)) return "Qua";
                const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
                if (d === tomorrow.toISOString().slice(0, 10)) return "Mai";
                const p = d.split("-");
                return `${+p[2]}/${+p[1]}`;
              };
              // Project header: show when project changes between tasks (all/standalone view)
              const isAllView = projFilter === "all" || projFilter === "standalone";
              const prevProjId = prev ? (prev.projectId || "") : "__none__";
              const curProjId = t.projectId || "";
              const showProjHeader = isAllView && prevProjId !== curProjId;
              const projObj = t.projectId ? projects.find(p => p.id === t.projectId) : null;
              const projDone = projObj ? tasks.filter(pt => pt.projectId === projObj.id && pt.status === "done").length : 0;
              const projTotal = projObj ? tasks.filter(pt => pt.projectId === projObj.id).length : 0;
              return (
                <div key={t.id}>
                  {/* Project header separator */}
                  {showProjHeader && (
                    <div onClick={() => projObj && setProjDetail(projObj)} style={{ display:"flex", alignItems:"center", gap:8, margin: i > 0 ? "14px 0 6px" : "0 0 6px", padding:"7px 10px", background: projObj ? `linear-gradient(135deg, ${C.accent}11, ${C.purple}11)` : C.card, borderRadius:10, border:`1px solid ${projObj ? C.accent + "33" : C.border}`, cursor: projObj ? "pointer" : "default" }}>
                      <span style={{ fontSize:14 }}>{projObj ? "📂" : "📋"}</span>
                      <span style={{ flex:1, fontSize:13, fontWeight:700, color: projObj ? C.accent : C.sub }}>{projObj ? projObj.name : "Việc cá nhân"}</span>
                      {projObj && <span style={{ fontSize:10, color:C.muted, fontWeight:600 }}>{projDone}/{projTotal}</span>}
                      {projObj && <span style={{ fontSize:11, color:C.muted }}>›</span>}
                    </div>
                  )}
                  {/* Date separator */}
                  {showDate && (
                    <div style={{ display:"flex", alignItems:"center", gap:8, margin: i > 0 ? "10px 0 4px" : "0 0 4px" }}>
                      <div style={{ width:24, textAlign:"center", fontSize:9, fontWeight:700, color: isPast ? C.red : isToday ? "#e67e22" : C.muted }}>
                        {fmtLabel(tDate)}
                      </div>
                      <div style={{ flex:1, height:1, background:C.border }} />
                    </div>
                  )}
                  {/* Timeline row: dot+line | card */}
                  <div style={{ display:"flex" }}>
                    <div style={{ width:24, flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center" }}>
                      <div style={{ fontSize:8, color:C.muted, fontWeight:600, marginBottom:2, minHeight:10 }}>{t.startTime ? t.startTime.replace(/^0/,"").replace(/:00$/,"h").replace(/:/,"h") : ""}</div>
                      <div style={{ width:10, height:10, borderRadius:"50%", background:dotColor, flexShrink:0, zIndex:1, border:"2px solid " + C.bg }} />
                      {!isLast && <div style={{ width:1.5, flex:1, background:C.border, minHeight:8 }} />}
                    </div>
                    <div style={{ flex:1, minWidth:0, marginBottom: isLast ? 0 : 6 }}>
                      <TaskRow task={t} onPress={() => setSel(t)}
                        projectName={t.projectId ? projects.find(p => p.id === t.projectId)?.name : null}
                        onStatusChange={(tk, s) => patchTask(tk.id, { status: s })}
                        onPriorityChange={(tk, p) => patchTask(tk.id, { priority: p })}
                        onPatchTask={(id, data) => patchTask(id, data)}
                        onAdjust={(tk) => {
                          setMiniVoice(true); setMiniReply(""); setMiniTask(tk); setMiniTranscript("");
                          setTimeout(() => startMiniListening(), 200);
                        }}
                        timerTick={timerTick} handSide={settings.handSide} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "calendar" && <CalendarTab tasks={tasks} onPress={t => setSel(t)} />}
        {tab === "inbox" && <InboxTab tasks={tasks} projects={projects} patchTask={patchTask} settings={settings} user={user} addTask={addTask} openConvId={openConvId} />}
        {tab === "expense" && <ExpenseTab tasks={tasks} expenses={expenses} addExpense={addExpense} deleteExpense={deleteExpense} settings={settings} user={user} onOpenQR={() => setQrOpen(true)} />}
        {tab === "report" && <ReportTab tasks={tasks} history={history} settings={settings} memory={memory} user={user} />}
        {tab === "dev" && <DevTab user={user} />}

        {tab === "ai" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "fadeIn .2s" }}>
            {/* Top bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <button className="tap" onClick={() => {
                if (!canNewChat()) {
                  const h = Math.ceil((2 * 24 * 60 * 60 * 1000 - (Date.now() - chatStartedAt)) / 3600000);
                  alert(`Chưa đủ 2 ngày. Còn ~${h}h nữa mới xóa được.\nLịch sử chat được giữ để bạn xem lại.`);
                  return;
                }
                if (!confirm("Lưu trữ và bắt đầu chat mới?")) return;
                startNewChat();
              }} style={{ flexShrink: 0, background: C.card, color: canNewChat() ? C.accent : C.muted, border: `1px solid ${canNewChat() ? C.accent + "44" : C.border}`, borderRadius: 10, padding: "6px 12px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, opacity: canNewChat() ? 1 : 0.6 }}>
                <span style={{ fontSize: 15 }}>+</span> Chat mới
              </button>
              <button className="tap" onClick={() => {
                archiveChat();
                const data = JSON.stringify({ exported: new Date().toISOString(), user: user.name, messages: msgs }, null, 2);
                const blob = new Blob([data], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a"); a.href = url; a.download = `wory-chat-${new Date().toISOString().slice(0, 10)}.json`; a.click();
                URL.revokeObjectURL(url);
              }} style={{ flexShrink: 0, background: C.card, color: C.sub, border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 10px", fontSize: 12, fontWeight: 600 }}>
                Backup
              </button>
              <div className="no-scrollbar" style={{ flex: 1, display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                {["Lên kế hoạch hôm nay", "Hôm nay làm gì trước?", "Tôi bị stress quá", "Kể chuyện vui đi", "Tư vấn thời gian"].map(q => (
                  <button key={q} className="tap" onClick={() => sendChat(q)}
                    style={{ flexShrink: 0, background: C.card, color: C.sub, border: `1px solid ${C.border}`, borderRadius: 20, padding: "6px 13px", fontSize: 13 }}>{q}</button>
                ))}
              </div>
            </div>

            {/* Messages */}
            {msgs.map((m, i) => (
              <div key={i} className="msg" style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                {m.role === "assistant" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: `linear-gradient(135deg,${C.accent},${C.purple})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff" }}>W</div>
                    <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Wory</span>
                    {m.ts && <span style={{ fontSize: 10, color: C.muted, opacity: 0.6 }}>{new Date(m.ts).toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit"})} {new Date(m.ts).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})}</span>}
                  </div>
                )}
                {m.role === "user" ? (
                  <div>
                    <div style={{ maxWidth: "85%", background: C.accent, borderRadius: "18px 18px 4px 18px", padding: "12px 16px", fontSize: 15, lineHeight: 1.6, color: "#fff", whiteSpace: "pre-wrap", marginLeft: "auto" }}>{m.content}</div>
                    {m.ts && <div style={{ fontSize: 10, color: C.muted, opacity: 0.6, textAlign: "right", marginTop: 2 }}>{new Date(m.ts).toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit"})} {new Date(m.ts).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})}</div>}
                  </div>
                ) : (
                  <div style={{ maxWidth: "92%", position: "relative" }}>
                    <div style={{ background: C.card, borderRadius: "18px 18px 18px 4px", border: `1px solid ${C.border}`, padding: "14px 16px", fontSize: 15, lineHeight: 1.7, color: C.text }}>
                      <MdBlock text={m.content} />
                      {aiLoad && i === msgs.length - 1 && <span style={{ display: "inline-block", width: 2, height: 16, background: C.accent, marginLeft: 2, animation: "blink 1s infinite", verticalAlign: "text-bottom" }} />}
                    </div>
                    {m.content && !aiLoad && (
                      <button className="tap" onClick={() => { navigator.clipboard?.writeText(m.content); }}
                        style={{ position: "absolute", top: 8, right: 8, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 7px", fontSize: 11, color: C.muted, cursor: "pointer", opacity: 0.6 }}>
                        Copy
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {aiLoad && msgs[msgs.length - 1]?.content === "" && (
              <div style={{ display: "flex" }}><div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "18px 18px 18px 4px", padding: "14px 16px" }}><div className="dots"><span /><span /><span /></div></div></div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* ── AI INPUT BAR ── */}
      {tab === "ai" && (
        <div className="ai-input-bar">
          {voiceMode && (
            <div style={{ background: `linear-gradient(90deg,${C.purpleD},${C.accentD})`, borderTop: `1px solid ${C.purple}33`, padding: "8px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 3, height: 18 }}>
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} style={{ width: 3, background: voice.on ? C.purple : C.muted, borderRadius: 2, animation: voice.on ? `waveBar 0.8s ${i * 0.15}s infinite ease-in-out` : "none", height: voice.on ? undefined : 4 }} />
                ))}
              </div>
              <span style={{ fontSize: 12, color: C.purple, fontWeight: 700, flex: 1 }}>
                {aiLoad ? "AI đang trả lời..." : voice.on ? "Đang nghe bạn..." : "Chuẩn bị nghe..."}
              </span>
              <button className="tap" onClick={toggleVoiceMode} style={{ background: "none", border: `1px solid ${C.purple}55`, borderRadius: 8, padding: "3px 10px", color: C.purple, fontSize: 11, fontWeight: 700 }}>Tat</button>
            </div>
          )}
          <div style={{ padding: "10px 12px", display: "flex", gap: 8, alignItems: "center" }}>
            {voice.ok && (
              <button className="tap" onClick={toggleVoiceMode} style={{
                width: 46, height: 46, borderRadius: "50%", border: "none", flexShrink: 0, position: "relative",
                background: voiceMode ? `linear-gradient(135deg,${C.purple},${C.accent})` : `${C.purple}18`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                boxShadow: voiceMode ? `0 4px 16px ${C.purpleD}` : "none",
              }}>
                {voiceMode && <div style={{ position: "absolute", inset: -5, borderRadius: "50%", border: `2px solid ${C.purple}44`, animation: "ping 2s infinite", pointerEvents: "none" }} />}
                &#x1F399;
              </button>
            )}
            <input value={aiIn} onChange={e => setAiIn(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChat()}
              placeholder={voiceMode ? "Đang ở chế độ thoại — hoặc gõ..." : "Nhắn tin hoặc nhấn mic..."}
              aria-label="Nhắn tin cho Wory"
              style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 24, padding: "11px 16px", fontSize: 16, color: C.text }} />
            {voice.ok && !voiceMode && (
              <button className="tap" onClick={() => { window.speechSynthesis?.cancel(); voice.toggle(); }}
                aria-label={voice.on ? "Dừng ghi âm" : "Ghi âm"}
                style={{ width: 46, height: 46, borderRadius: "50%", border: "none", flexShrink: 0, position: "relative", background: voice.on ? C.red : C.card, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21 }}>
                {voice.on && <div style={{ position: "absolute", inset: -7, borderRadius: "50%", border: `2px solid ${C.red}`, animation: "ripple 1.1s infinite", pointerEvents: "none" }} />}
                {voice.on ? "S" : "M"}
              </button>
            )}
            <button className="tap" onClick={() => sendChat()} disabled={aiLoad || !aiIn.trim()}
              aria-label="Gửi tin nhắn"
              style={{ width: 46, height: 46, borderRadius: "50%", border: "none", flexShrink: 0, background: (!aiLoad && aiIn.trim()) ? C.accent : C.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#fff" }}>
              &#x2191;
            </button>
          </div>
        </div>
      )}

      {/* ── MINI VOICE/TEXT WIDGET (tasks tab only) ── */}
      {tab === "tasks" && (
        <div style={{ position:"fixed", bottom:150, right:14, zIndex:55, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8 }}>
          {miniVoice && (
            <div style={{ background:"#fff", borderRadius:16, boxShadow:"0 4px 24px rgba(0,0,0,.15)", padding:"12px 14px", width:280, animation:"slideUp .2s" }}>
              {/* Task context badge */}
              {miniTask && (
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                  <div style={{ flex:1, fontSize:11, color:C.accent, fontWeight:600, padding:"3px 8px", background:`${C.accent}12`, borderRadius:8, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                    {miniTask.title}
                  </div>
                  <button className="tap" onClick={closeMiniVoice}
                    style={{ fontSize:14, color:C.muted, background:"none", border:"none", padding:"2px 4px", lineHeight:1 }}>✕</button>
                </div>
              )}
              {/* Reply area */}
              {miniReply && (
                <div style={{ fontSize:13, lineHeight:1.4, color:C.text, marginBottom:8, maxHeight:100, overflowY:"auto" }}>
                  <MdBlock text={miniReply} />
                </div>
              )}
              {miniLoading && !miniReply && <div style={{ textAlign:"center", padding:6 }}><div className="dots"><span /><span /><span /></div></div>}
              {/* Listening indicator */}
              {miniListening && (
                <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 0 6px" }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:C.red, animation:"blink 1s infinite" }} />
                  <span style={{ fontSize:11, color:C.red, fontWeight:600 }}>Tôi đang nghe...</span>
                </div>
              )}
              {/* Text input + mic + send */}
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <button className="tap"
                  onClick={() => {
                    if (miniListening) { miniVoiceRef.current.stop(); return; }
                    startMiniListening();
                  }}
                  style={{
                    width:36, height:36, borderRadius:"50%", border:"none", color:"#fff", fontSize:16,
                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                    background: miniListening ? C.red : `linear-gradient(135deg,${C.accent},${C.purple})`,
                    boxShadow: miniListening ? `0 0 0 4px ${C.red}30` : "none",
                    transition:"all .2s",
                  }}>
                  🎤
                </button>
                <input value={miniText} onChange={e => setMiniText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && miniText.trim()) { sendMiniVoice(miniText.trim()); setMiniText(""); setMiniTranscript(miniText.trim()); } }}
                  placeholder="Ghi nhanh..."
                  style={{ flex:1, fontSize:13, border:`1px solid ${C.border}`, borderRadius:10, padding:"7px 10px", outline:"none", color:C.text, background:C.bg }} />
                {miniText.trim() && (
                  <button className="tap" onClick={() => { sendMiniVoice(miniText.trim()); setMiniText(""); setMiniTranscript(miniText.trim()); }}
                    style={{ width:36, height:36, borderRadius:"50%", background:C.accent, border:"none", color:"#fff", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    ↑
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <div className="bottom-nav">
        {[
          ["tasks","\u{1F4CB}","Việc"],
          ["calendar","\u{1F4C5}","Lịch"],
          ["inbox","\u{1F4AC}","Trao đổi"],
          ["expense","\u{1F4B0}","Chi tiêu"],
          (user?.role === "admin" || user?.role === "manager") && ["report","\u{1F4CA}","Báo cáo"],
          user?.role === "dev" && ["dev","\u{1F4BB}","Dev"],
          ["ai","\u2726","Wory"],
        ].filter(Boolean).map(([key, icon, label]) => {
          const active = tab === key;
          return (
            <button key={key} className="tap" onClick={() => setTab(key)}
              style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "6px 0 5px", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, position:"relative" }}>
              <div style={{ width:36, height:28, borderRadius:10, background: active ? "#f5ebe0" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", transition:"background .2s" }}>
                <span style={{ fontSize: 16, lineHeight: 1, filter: active ? "none" : "grayscale(0.6) opacity(0.55)" }}>
                  {icon}
                </span>
              </div>
              <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, color: active ? "#8b6914" : "#999", marginTop: 0, letterSpacing: active ? 0 : 0 }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── MODALS ── */}
      {sel && <TaskSheet task={tasks.find(t => t.id === sel.id) || sel} onClose={() => setSel(null)} />}
      {addOpen && <VoiceAddModal onClose={() => setAddOpen(false)} />}
      {heyOpen && <HeyModal onClose={() => setHeyOpen(false)} onChat={(txt) => { setHeyOpen(false); setTab("ai"); setTimeout(() => sendChat(txt), 500); }} buildSystemPrompt={buildSystemPrompt} user={{ ...user, name: settings.displayName || user.name }} />}
      {settingsOpen && <SettingsModal user={user} onClose={() => setSettingsOpen(false)} />}
      {qrOpen && <QRScanModal tasks={tasks} patchTask={patchTask} addExpense={addExpense} onClose={() => setQrOpen(false)} />}

      {/* ── NEW PROJECT MODAL ── */}
      {newProjOpen && <NewProjectModal onAdd={async (p) => {
        const id = Date.now() + Math.random();
        // Remove selectedSupaMembers from stored project data (only used for chat sync)
        const { selectedSupaMembers, ...projData } = p;
        const proj = { ...projData, id, createdAt: new Date().toISOString().split("T")[0] };

        // Auto-create group chat for project (if Supabase connected)
        if (supabase && supaSession?.user?.id) {
          try {
            const chatName = `[project]${p.name}`;
            const { data: conv } = await supabase.from("conversations")
              .insert({ type: "group", name: chatName, created_by: supaSession.user.id })
              .select().single();
            if (conv) {
              // Add creator + all selected members to chat
              const memberInserts = [{ conversation_id: conv.id, user_id: supaSession.user.id }];
              if (selectedSupaMembers?.length) {
                selectedSupaMembers.forEach(uid => {
                  memberInserts.push({ conversation_id: conv.id, user_id: uid });
                });
              }
              await supabase.from("conversation_members").insert(memberInserts);
              proj.chatId = conv.id;
              // System message with member count
              const memberCount = (selectedSupaMembers?.length || 0) + 1;
              await supabase.from("messages").insert({
                conversation_id: conv.id,
                sender_id: supaSession.user.id,
                content: `📋 Dự án "${p.name}" đã được tạo${p.steps?.length ? ` với ${p.steps.length} bước quy trình` : ""} — ${memberCount} thành viên`,
                type: "system",
              });
            }
          } catch (e) { console.warn("Auto-create project chat failed:", e); }
        }

        addProject(proj);
        // Auto-create tasks from workflow steps (with stepIndex for ordering)
        if (p.steps && p.steps.length > 0) {
          p.steps.forEach((step, i) => {
            setTimeout(() => addTask({
              title: `${i+1}. ${step}`,
              projectId: id,
              stepIndex: i,
              category: "work",
            }), i * 10);
          });
        }
        setNewProjOpen(false);
        setProjFilter(id);
        setProjDetail(proj);
      }} onClose={() => setNewProjOpen(false)} />}

      {/* ── PROJECT DETAIL ── */}
      {projDetail && <ProjectDetailSheet project={projects.find(p => p.id === projDetail.id) || projDetail} tasks={tasks} patchTask={patchTask} addTask={addTask} patchProject={patchProject} hardDelete={hardDelete} deleteProject={async (id) => {
        const proj = projects.find(p => p.id === id);
        if (supabase && proj?.chatId) {
          await supabase.from("messages").delete().eq("conversation_id", proj.chatId);
          await supabase.from("conversation_members").delete().eq("conversation_id", proj.chatId);
          await supabase.from("conversations").delete().eq("id", proj.chatId);
        }
        deleteProject(id); setProjDetail(null); setProjFilter("all");
      }} onClose={() => setProjDetail(null)} onOpenChat={(proj) => { setProjDetail(null); setOpenConvId(proj.chatId || null); setTab("inbox"); }} isStaff={isStaff} myName={myName} />}

      {/* ── DESKTOP FLOAT ── */}
      <DesktopFloat onSelectTask={(t) => setSel(t)} onOpenTab={(t) => setTab(t)} />

      {/* ── UNDO TOAST ── */}
      <UndoToast toast={undoToast} onUndo={undoDelete} />

      {/* ── KNOWLEDGE TOAST ── */}
      {knowledgeToast && (
        <div style={{ position:"fixed", bottom:80, left:12, right:12, zIndex:9998, animation:"slideDown .35s ease-out" }}>
          <div style={{ background:"#fef9e7", border:`1px solid ${C.gold}33`, borderRadius:14, padding:"12px 16px", boxShadow:"0 4px 20px rgba(0,0,0,.1)", display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:18 }}>&#x1F9E0;</span>
            <div style={{ flex:1, fontSize:13, color:C.text }}>Wory đã ghi nhớ <b>{knowledgeToast}</b> điều mới</div>
            <button className="tap" onClick={() => { setKnowledgeToast(null); setSettingsOpen(true); }}
              style={{ background:C.gold+"20", border:"none", borderRadius:8, padding:"5px 10px", fontSize:11, fontWeight:600, color:C.gold }}>
              Xem
            </button>
            <button className="tap" onClick={() => setKnowledgeToast(null)}
              style={{ background:"none", border:"none", color:C.muted, fontSize:14, padding:"2px" }}>x</button>
          </div>
        </div>
      )}

      {/* ── GLOBAL INCOMING CALL OVERLAY ── */}
      {globalCall && !globalCall.accepted && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,.6)", maxWidth: 480, margin: "0 auto",
        }}>
          <div style={{
            background: C.surface, borderRadius: 20, padding: "28px 24px",
            textAlign: "center", width: 280, boxShadow: "0 8px 40px rgba(0,0,0,.3)",
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: "50%", background: C.accent,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 26, fontWeight: 700,
              margin: "0 auto 12px",
              animation: "pulse2 1.5s infinite",
            }}>
              {(globalCall.convName || "?")[0].toUpperCase()}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>
              {globalCall.convName}
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
              {globalCall.mode === "video" ? "📹 Cuộc gọi video đến..." : "📞 Cuộc gọi đến..."}
            </div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
              <button className="tap" onClick={declineGlobalCall}
                style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "#e53e3e", border: "none", color: "#fff",
                  fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 4px 12px rgba(229,62,62,.3)",
                }}>
                📵
              </button>
              <button className="tap" onClick={acceptGlobalCall}
                style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "#48bb78", border: "none", color: "#fff",
                  fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 4px 12px rgba(72,187,120,.3)",
                }}>
                {globalCall.mode === "video" ? "📹" : "📞"}
              </button>
            </div>
          </div>
          <style>{`
            @keyframes pulse2 {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: .8; transform: scale(1.05); }
            }
          `}</style>
        </div>
      )}

      {/* Active call screen after accepting */}
      {globalCall?.accepted && (
        <CallScreen
          conversationId={globalCall.conversationId}
          userId={supaUserId}
          peerName={globalCall.convName}
          isIncoming={true}
          mode={globalCall.mode || "audio"}
          onEnd={endGlobalCall}
        />
      )}

      {/* ── MESSAGE TOAST (when not on inbox tab) ── */}
      {msgToast && (
        <div style={{ position: "fixed", top: 12, left: 12, right: 12, zIndex: 9998, animation: "slideDown .35s ease-out", maxWidth: 480, margin: "0 auto" }}>
          <div
            className="tap"
            onClick={() => { setMsgToast(null); setTab("inbox"); }}
            style={{
              background: "#eef2ff", border: `1px solid ${C.accent}33`,
              borderRadius: 14, padding: "12px 14px",
              boxShadow: "0 4px 20px rgba(0,0,0,.12)",
              display: "flex", alignItems: "center", gap: 10,
              cursor: "pointer",
            }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%", background: C.accent,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 14, fontWeight: 700, flexShrink: 0,
            }}>
              {(msgToast.senderName || "?")[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 1 }}>
                {msgToast.senderName}
              </div>
              <div style={{ fontSize: 13, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {msgToast.content}
              </div>
            </div>
            <button className="tap" onClick={(e) => { e.stopPropagation(); setMsgToast(null); }}
              style={{ background: "none", border: "none", color: C.muted, fontSize: 18, padding: "2px 4px", flexShrink: 0, lineHeight: 1 }}>×</button>
          </div>
        </div>
      )}

      {/* ── ALERT BANNER ── */}
      {alertToast && (
        <div style={{ position:"fixed", top:12, left:12, right:12, zIndex:9999, animation:"slideDown .35s ease-out" }}>
          <div style={{ background: alertToast.type === "od" ? "#fdecec" : alertToast.type === "dl" ? "#fef3e5" : "#fef9e7",
            border:`1px solid ${alertToast.type === "od" ? "#e74c3c33" : alertToast.type === "dl" ? "#e67e2233" : "#f1c40f33"}`,
            borderRadius:14, padding:"12px 14px", boxShadow:"0 4px 20px rgba(0,0,0,.1)", display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ fontSize:22, flexShrink:0 }}>{alertToast.type === "od" ? "⏰" : alertToast.type === "dl" ? "📋" : "🔔"}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11, fontWeight:700, color: alertToast.type === "od" ? C.red : alertToast.type === "dl" ? "#e67e22" : C.gold, letterSpacing:.5, marginBottom:1 }}>{alertToast.label}</div>
              <div style={{ fontSize:14, fontWeight:600, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{alertToast.task.title}</div>
            </div>
            <button className="tap" onClick={() => { alertDismissedRef.current.add(alertToast.key); patchTask(alertToast.task.id, { status: "done" }); setAlertToast(null); }}
              style={{ background:C.green, color:"#fff", border:"none", borderRadius:8, padding:"6px 10px", fontSize:11, fontWeight:700, flexShrink:0 }}>Xong</button>
            <button className="tap" onClick={() => { alertDismissedRef.current.add(alertToast.key); setAlertToast(null); }}
              style={{ background:"none", border:"none", color:C.muted, fontSize:18, padding:"2px 4px", flexShrink:0, lineHeight:1 }}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}
