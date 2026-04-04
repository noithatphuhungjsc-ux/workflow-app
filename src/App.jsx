/* ================================================================
   APP.JSX — Main orchestrator (slim version)
   Uses Context/store for state, modular components & pages
   ================================================================ */
import React, { useState, useRef, useEffect, useCallback, Suspense } from "react";
import "./App.css";

import { C, todayStr, fmtDate, isOverdue, t, hasPermission, TEAM_ACCOUNTS, ALL_ACCOUNTS, TEAM_EMAILS, STATUSES, STATUS_ORDER, DEFAULT_PASSWORD } from "./constants";
import { setUserPrefix, loadJSON, saveJSON, encryptToken, decryptToken, sendBackupEmail, cloudSave, cloudLoad } from "./services";
import { isNative, initNative } from "./native/capacitor";
import { useGmail } from "./hooks/useGmail";
import { AppProvider, useStore, useTasks, useSettings } from "./store";
import { Pill, Filters, ProjectFilters, TaskRow, UserMenu, UndoToast, MdBlock, Empty, getAlertLevel, Skeleton, Toast, TabErrorBoundary } from "./components";
import TasksTabContent from "./components/TasksTabContent";
import { CHANGELOG } from "./changelog";

/* Static imports — needed immediately */
import LoginScreen from "./components/LoginScreen";
import { SupabaseProvider, useSupabase } from "./contexts/SupabaseContext";
import { supabase } from "./lib/supabase";
import { useConversations } from "./hooks/useConversations";
import ErrorBoundary from "./components/ErrorBoundary";
import { useWoryChat } from "./hooks/useWoryChat";
import { useMiniVoice } from "./hooks/useMiniVoice";
import WoryOverlay from "./components/WoryOverlay";
import BottomNav from "./components/BottomNav";
import { useOffline } from "./hooks/useOffline";
import { useAuditLog } from "./hooks/useAuditLog";

/* Lazy imports — loaded on demand */
const SettingsModal = React.lazy(() => import("./components/SettingsModal"));
const CallScreen = React.lazy(() => import("./components/CallScreen"));
const TaskSheet = React.lazy(() => import("./components/TaskSheet"));
const HeyModal = React.lazy(() => import("./components/HeyModal"));
const VoiceAddModal = React.lazy(() => import("./components/VoiceAddModal"));
const DesktopFloat = React.lazy(() => import("./components/DesktopFloat"));
const CalendarTab = React.lazy(() => import("./pages/CalendarTab"));
const InboxTab = React.lazy(() => import("./pages/InboxTab"));
const ExpenseTab = React.lazy(() => import("./pages/ExpenseTab"));
const ReportTab = React.lazy(() => import("./pages/ReportTab"));
const DevTab = React.lazy(() => import("./pages/DevTab"));
const QRScanModal = React.lazy(() => import("./components/QRScanModal"));
const DashboardTab = React.lazy(() => import("./pages/DashboardTab"));
const AttendanceTab = React.lazy(() => import("./pages/AttendanceTab"));
const DeptTab = React.lazy(() => import("./pages/DeptTab"));
const RequestTab = React.lazy(() => import("./pages/RequestTab"));
const NewProjectModal = React.lazy(() => import("./components/ProjectModals").then(m => ({ default: m.NewProjectModal })));
const ProjectDetailSheet = React.lazy(() => import("./components/ProjectModals").then(m => ({ default: m.ProjectDetailSheet })));
const IndustrySetupModal = React.lazy(() => import("./components/IndustrySetupModal"));
const OnboardingGuide = React.lazy(() => import("./components/OnboardingGuide"));
const ChangelogView = React.lazy(() => import("./components/ChangelogView").then(m => ({ default: m.default })));
const ChangelogBackButton = React.lazy(() => import("./components/ChangelogView").then(m => ({ default: m.ChangelogBackButton })));


/* ================================================================
   AUTO-LOGIN — Supabase auth from local session (runs once at app start)
   ================================================================ */
/* TEAM_ACCOUNTS & TEAM_EMAILS imported from constants.js */

function SupabaseAutoLogin() {
  const { isConnected, signIn, signUp, signOut, loading, session } = useSupabase();
  const tried = useRef(false);

  useEffect(() => {
    if (loading) return;
    const s = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}"); } catch { return {}; } })();
    const email = TEAM_EMAILS[s.id];
    if (!email) return;

    // If already connected, check if Supabase session matches local user
    if (isConnected && session?.user?.email) {
      if (session.user.email === email) return; // correct user, nothing to do
      // Wrong user — sign out first, then re-login
      (async () => {
        await signOut();
        // After signOut, isConnected becomes false → this effect re-runs
      })();
      return;
    }

    if (isConnected) return; // connected but no email to check — skip
    if (tried.current) return;
    tried.current = true;

    const pw = DEFAULT_PASSWORD;
    const name = s.name || email.split("@")[0];
    (async () => {
      // First ensure auth account exists on server
      try {
        await fetch("/api/cloud-sync", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ensure_auth", email, password: pw, displayName: name }),
        });
      } catch (e) { console.warn("[WF] ensure_auth failed:", e.message); }
      const r = await signIn(email, pw);
      if (r.error) {
        const r2 = await signUp(email, pw, name);
        if (r2.error) await signIn(email, pw);
      }
    })();
  }, [loading, isConnected, session]);

  // One-time: ensure all team members have Supabase auth accounts
  useEffect(() => {
    if (localStorage.getItem("wf_auth_synced_v4")) return;
    ALL_ACCOUNTS.forEach(a => {
      fetch("/api/cloud-sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ensure_auth", email: a.email, password: DEFAULT_PASSWORD, displayName: a.name }),
      }).catch(e => console.warn("[WF] ensure_auth batch:", e.message));
    });
    localStorage.setItem("wf_auth_synced_v4", "1");
  }, []);

  // One-time: cleanup old OAuth profiles
  useEffect(() => {
    if (localStorage.getItem("wf_cleanup_v3")) return;
    fetch("/api/cloud-sync", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cleanup_profiles" }),
    }).then(() => localStorage.setItem("wf_cleanup_v3", "1")).catch(() => {});
  }, []);

  return null;
}

/* ================================================================
   ROOT — Auth wrapper
   ================================================================ */
export default function App() {
  // CRITICAL: setUserPrefix MUST run synchronously before AppProvider
  // renders, otherwise store initializers load data with wrong prefix
  // and auto-save overwrites real data = data loss on reload.
  const SESSION_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  const [user, setUser] = useState(() => {
    try {
      const s = localStorage.getItem("wf_session");
      if (s) {
        const parsed = JSON.parse(s);
        // Session timeout check — auto-logout after 7 days of inactivity
        if (parsed.lastActive && (Date.now() - parsed.lastActive > SESSION_TIMEOUT_MS)) {
          localStorage.removeItem("wf_session");
          return null;
        }
        setUserPrefix(parsed.id); // sync — before any store init
        document.title = `WorkFlow — ${parsed.name}`;
        // Update lastActive timestamp
        parsed.lastActive = Date.now();
        try { localStorage.setItem("wf_session", JSON.stringify(parsed)); } catch {}
        return parsed;
      }
      return null;
    } catch { return null; }
  });

  const handleLogout = () => {
    localStorage.removeItem("wf_session");
    setUser(null);
    setUserPrefix("");
    document.title = "WorkFlow";
  };

  // One-time: clean up old localStorage keys (tasks/projects now in Supabase)
  useEffect(() => {
    if (localStorage.getItem("wf_redesign_cleanup_v1")) return;
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (/^wf_[a-f0-9-]+_(tasks|projects)$/.test(k)) keysToRemove.push(k);
      if (/^wf_convos_cache/.test(k)) keysToRemove.push(k);
      if (/^wf_activeConv/.test(k)) keysToRemove.push(k);
      if (/^wf_pinned_msgs_/.test(k)) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    localStorage.setItem("wf_redesign_cleanup_v1", "1");
  }, []);

  if (!user) return <LoginScreen onLogin={(acc) => { acc.lastActive = Date.now(); setUserPrefix(acc.id); setUser(acc); document.title = `WorkFlow — ${acc.name}`; }} />;

  return (
    <SupabaseProvider>
      <SupabaseAutoLogin />
      <AppProvider key={user.id} userId={user.id}>
        <ErrorBoundary>
          <MainApp user={user} onLogout={handleLogout} />
        </ErrorBoundary>
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

  const TAB_ORDER = ["tasks","dept","requests","inbox","calendar","expense","dashboard","report","ai"];
  const [woryOpen, setWoryOpen] = useState(false);
  const [tab, _setTab]        = useState(() => sessionStorage.getItem("wf_tab") || settings.defaultTab || "tasks");
  const prevTabRef = useRef(tab);
  const tabDir = useRef("right");
  const setTab = useCallback((t) => {
    const oldIdx = TAB_ORDER.indexOf(prevTabRef.current);
    const newIdx = TAB_ORDER.indexOf(t);
    tabDir.current = newIdx >= oldIdx ? "right" : "left";
    prevTabRef.current = t;
    sessionStorage.setItem("wf_tab", t); _setTab(t);
  }, []);
  const [sel, setSel]         = useState(null);
  const [filter, setFilter]   = useState(() => settings.defaultFilter || "all");
  const [projFilter, setProjFilter] = useState("all");
  const [newProjOpen, setNewProjOpen] = useState(false);
  const [projDetail, setProjDetail] = useState(null);
  const [openConvId, setOpenConvId] = useState(null); // for opening project chat
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [statusPickerTask, setStatusPickerTask] = useState(null); // for batch status change
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

  /* ── Gmail OAuth callback + unread count (extracted to useGmail) ── */
  const { gmailConnected, gmailUnread } = useGmail(user.id, settings);

  /* ── Auto backup to email (daily) ── */
  useEffect(() => {
    if (!settings.autoBackup) return;
    const lastBackup = loadJSON("last_backup", null);
    if (lastBackup && Date.now() - new Date(lastBackup).getTime() < 86400000) return;
    sendBackupEmail(user.id).catch(() => {});
  }, []); // eslint-disable-line

  const [addOpen, setAddOpen]         = useState(false);
  const [searchQ, setSearchQ]         = useState("");
  const [selectMode, setSelectMode]   = useState(null); // null | "edit" | "delete"
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alertToast, setAlertToast]   = useState(null); // { task, type }
  const [bellOpen, setBellOpen]       = useState(false);
  const [qrOpen, setQrOpen]           = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelogScrollY, setChangelogScrollY] = useState(0);
  const [changelogBack, setChangelogBack] = useState(false); // show floating back button
  const [globalCall, setGlobalCall]   = useState(null); // { conversationId, convName, mode, callerId }
  const [toast, setToast]             = useState(null); // { message, type }
  const [showGuide, setShowGuide]     = useState(() => !localStorage.getItem("wf_onboard_done") && !!settings.industryPreset);
  const showToast = useCallback((message, type = "success") => setToast({ message, type }), []);
  const toggleSelect = useCallback((id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
  const exitSelectMode = useCallback(() => { setSelectMode(null); setSelectedIds(new Set()); }, []);
  const alertDismissedRef = useRef(new Set());

  /* ── AI Chat (extracted to useWoryChat) ── */
  const {
    msgs, setMsgs, aiIn, setAiIn, aiLoad, voiceMode, voice, endRef, knowledgeToast,
    sendChat, toggleVoiceMode, buildSystemPrompt, canNewChat, startNewChat,
    archiveChat, chatStartedAt,
  } = useWoryChat({ tasks, memory, setMemory, knowledge, setKnowledge, settings, user, addTask, deleteTask, patchTask, currentTab: tab });

  /* ── Offline detection + mutation queue ── */
  const { isOnline, queueSize, syncing } = useOffline();

  /* ── Audit log ── */
  const { log: auditLog } = useAuditLog(user.id, settings.displayName || user.name);


  /* ── Mini voice (extracted to useMiniVoice) ── */
  const {
    miniVoice, setMiniVoice, miniListening, miniReply, miniLoading, miniTask, setMiniTask,
    miniTranscript, miniText, setMiniText,
    closeMiniVoice, startMiniListening, sendMiniVoice, sendMiniVoiceRef,
  } = useMiniVoice({ tasks, memory, setMemory, knowledge, setKnowledge, settings, addTask, deleteTask, patchTask, buildSystemPrompt, msgs });

  /* ── Chat unread tracking — works from any tab ── */
  const { session: supaSession } = useSupabase();
  const supaUserId = supaSession?.user?.id;

  /* ── Push subscription — register for background push (lock screen, app closed) ── */
  const [pushBlocked, setPushBlocked] = useState(false);
  useEffect(() => {
    if (!settings.notificationsEnabled) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    // Must use Supabase UUID (matches conversation_members.user_id)
    const pushUserId = supaUserId || user.id;
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidKey) { console.warn("[Push] No VAPID key"); return; }
    const subscribePush = async () => {
      try {
        // Check permission
        let perm = Notification.permission;
        if (perm === "denied") {
          setPushBlocked(true);
          console.warn("[Push] Permission DENIED — user must allow in browser settings");
          return;
        }
        if (perm === "default") {
          perm = await Notification.requestPermission();
        }
        if (perm !== "granted") {
          setPushBlocked(true);
          console.warn("[Push] Permission:", perm);
          return;
        }
        setPushBlocked(false);
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          const urlB64 = Uint8Array.from(atob(vapidKey.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64 });
        }
        // Save subscription with Supabase UUID (so push-message can find it)
        const subJSON = sub.toJSON();
        const resp = await fetch("/api/push-subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: pushUserId, subscription: subJSON }),
        });
        const result = await resp.json();
        if (result.ok) console.log("[Push] Subscribed OK for user:", pushUserId);
        else console.warn("[Push] Subscribe response:", result);
      } catch (e) { console.warn("[Push] Subscribe failed:", e); }
    };
    subscribePush();
    // Re-subscribe every 12 hours (in case token rotates)
    const interval = setInterval(subscribePush, 12 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [settings.notificationsEnabled, supaUserId, user.id]);
  const { totalUnread: chatUnread } = useConversations(supaUserId);

  // Init native features (Capacitor — push, statusbar, keyboard)
  useEffect(() => {
    if (isNative && supaUserId) {
      initNative(supabase, supaUserId);
    }
  }, [supaUserId]);

  // Listen for native incoming call events (from FCM push / launch intent)
  useEffect(() => {
    if (!isNative) return;
    const handler = (e) => {
      const { callerName, mode, conversationId, action } = e.detail || {};
      if (!conversationId) return;
      const callData = {
        conversationId,
        convName: callerName || "Cuộc gọi",
        mode: mode || "audio",
        callerId: null,
        callMsgId: null,
      };
      if (action === "accept") {
        // User tapped Accept in IncomingCallActivity — go straight to call
        setTab("inbox");
        setGlobalCall({ ...callData, accepted: true });
      } else {
        // Show ringing UI
        setGlobalCall(callData);
      }
    };
    window.addEventListener("native-call-incoming", handler);
    return () => window.removeEventListener("native-call-incoming", handler);
  }, []);

  // Push notification for new chat messages
  const prevUnreadRef = useRef(0);
  useEffect(() => {
    if (chatUnread > prevUnreadRef.current && tab !== "inbox") {
      // Browser notification — use SW on mobile (new Notification() throws on Android)
      if ("Notification" in window && Notification.permission === "granted") {
        const n = chatUnread - prevUnreadRef.current;
        navigator.serviceWorker?.ready.then(reg => {
          if (reg) reg.showNotification("WorkFlow", { body: `${n} tin nhắn mới`, icon: "/icon-192.png", tag: "chat-unread" });
        }).catch(() => {});
      }
    }
    prevUnreadRef.current = chatUnread;
  }, [chatUnread, tab]);
  const ringtoneRef = useRef(null);
  const seenCallMsgIds = useRef(new Set());

  useEffect(() => {
    if (!supabase || !supaUserId) return;

    // Dual detection: Realtime (instant) + Polling fallback (reliable)
    const processCallMsg = async (msg) => {
      if (!msg || msg.sender_id === supaUserId) return;
      if (seenCallMsgIds.current.has(msg.id)) return;
      seenCallMsgIds.current.add(msg.id);

      const age = Date.now() - new Date(msg.created_at).getTime();
      if (age > 30000) return;

      const { data: membership } = await supabase
        .from("conversation_members").select("user_id")
        .eq("conversation_id", msg.conversation_id)
        .eq("user_id", supaUserId).single();
      if (!membership) return;

      const { data: callerProfile } = await supabase
        .from("profiles").select("display_name")
        .eq("id", msg.sender_id).single();

      setGlobalCall({
        conversationId: msg.conversation_id,
        convName: callerProfile?.display_name || "Cuộc gọi",
        mode: msg.content?.includes("video") ? "video" : "audio",
        callerId: msg.sender_id,
        callMsgId: msg.id,
      });
    };

    // 1. Realtime listener (instant detection)
    const channel = supabase.channel("incoming-calls")
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: "type=eq.call",
      }, (payload) => processCallMsg(payload.new))
      .subscribe();

    // 2. Polling fallback (in case Realtime misses — e.g. replication not enabled)
    const startTime = new Date().toISOString();
    const lastCheckRef = { current: startTime };
    const pollInterval = setInterval(async () => {
      try {
        const { data } = await supabase.from("messages")
          .select("id, conversation_id, sender_id, content, created_at")
          .eq("type", "call").neq("sender_id", supaUserId)
          .gt("created_at", lastCheckRef.current)
          .order("created_at", { ascending: false }).limit(1);
        if (data?.[0]) {
          lastCheckRef.current = data[0].created_at;
          processCallMsg(data[0]);
        }
      } catch (e) { console.warn("[WF] call poll error:", e.message); }
    }, 2000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
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

    // Start ringtone — classic phone ring pattern (ring 2s, pause 3s)
    const startRingtone = async () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === "suspended") await ctx.resume();

        const playRing = () => {
          if (ctx.state === "closed") return;
          const t = ctx.currentTime;
          // Ring: two-tone warble (480Hz + 620Hz) for 2 seconds — classic phone ring
          [480, 620].forEach(freq => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine"; osc.frequency.value = freq;
            // Pulsing effect: on/off 25 times per second (25Hz AM modulation)
            for (let i = 0; i < 50; i++) {
              const onTime = t + i * 0.04;
              gain.gain.setValueAtTime(i % 2 === 0 ? 0.15 : 0.02, onTime);
            }
            gain.gain.setValueAtTime(0, t + 2);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(t); osc.stop(t + 2);
          });
        };

        playRing();
        const interval = setInterval(playRing, 5000); // 2s ring + 3s silence
        ringtoneRef.current = { ctx, interval };
      } catch {}
    };
    startRingtone();

    // Auto-dismiss after 30s (missed call)
    const timeout = setTimeout(() => {
      setGlobalCall(prev => {
        if (prev && !prev.accepted) updateMissedCall(prev.callMsgId, prev.mode);
        return null;
      });
    }, 30000);
    return () => {
      clearTimeout(timeout);
      stopRingtone();
    };
  }, [globalCall]);

  // Update message content to "Cuộc gọi nhỡ"
  const updateMissedCall = async (msgId, callMode) => {
    if (!msgId) return;
    const emoji = callMode === "video" ? "📹" : "📞";
    await supabase.from("messages")
      .update({ content: `${emoji} Cuộc gọi nhỡ` })
      .eq("id", msgId);
  };

  const acceptGlobalCall = () => {
    if (!globalCall) return;
    setTab("inbox");
    setGlobalCall(prev => ({ ...prev, accepted: true }));
  };

  const declineGlobalCall = () => {
    if (globalCall?.callMsgId) updateMissedCall(globalCall.callMsgId, globalCall.mode);
    setGlobalCall(null);
  };
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

    const interval = setInterval(checkNewMsgs, 15000);
    // Pause polling when tab is hidden to save resources
    const onVisibility = () => {
      if (!document.hidden) checkNewMsgs();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); };
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
  const isDirector = settings.userRole === "director";
  const isStaff = !isDirector;
  const myName = settings.displayName || user.name;

  /* ── Ensure every project has a chat (auto-create if missing) ── */
  const ensuredChatRef = useRef(new Set());
  useEffect(() => {
    if (!supabase || !supaSession?.user?.id || !projects?.length) return;
    const uid = supaSession.user.id;
    projects.forEach(async (proj) => {
      if (proj.chatId || proj.deleted || ensuredChatRef.current.has(proj.id)) return;
      ensuredChatRef.current.add(proj.id);
      try {
        const { data: conv } = await supabase.from("conversations")
          .insert({ type: "group", name: proj.name, created_by: uid, category: "project", linked_project_id: String(proj.id) })
          .select().single();
        if (!conv) return;
        // Add creator + project members
        const memberInserts = [{ conversation_id: conv.id, user_id: uid }];
        (proj.members || []).forEach(m => {
          if (m.supaId && m.supaId !== uid) memberInserts.push({ conversation_id: conv.id, user_id: m.supaId });
        });
        await supabase.from("conversation_members").insert(memberInserts);
        await supabase.from("messages").insert({
          conversation_id: conv.id, sender_id: uid,
          content: `📋 Nhóm chat dự án "${proj.name}" đã được tạo tự động`,
          type: "system",
        });
        patchProject(proj.id, { chatId: conv.id });
      } catch (e) { console.warn("[WF] auto-create chat for project:", proj.name, e); }
    });
  }, [projects, supaSession]);

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

  const pendingDeleteCount = isDirector ? tasks.filter(t => t.deleteRequest?.status === "pending").length : 0;
  const filteredTasks = (() => {
    let list;
    if (filter === "pending_delete") {
      list = tasks.filter(t => t.deleteRequest?.status === "pending");
    } else {
      list = filter === "all" ? tasks : tasks.filter(t => t.status === filter);
    }
    if (!settings.showCompletedTasks && filter === "all") {
      list = list.filter(t => t.status !== "done");
    }
    // Search filter
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter(t => t.title?.toLowerCase().includes(q) || t.assignee?.toLowerCase().includes(q));
    }
    // Staff: only see tasks owned by them or assigned to them
    // (RLS already handles this on Supabase side, this is a client-side safety filter)
    if (isStaff && myName) {
      list = list.filter(t => !t.assignee || t.assignee === myName || t.ownerId === supaSession?.user?.id || t.assigneeId === supaSession?.user?.id);
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
    <Suspense fallback={<Skeleton rows={5} />}>

      {/* ── HEADER ── */}
      <div style={{ padding: "4px 12px 6px", display: "flex", alignItems: "center", gap: 5, flexShrink: 0, background: "#fff", borderBottom: "1px solid #eae7e1" }}>
        <UserMenu user={{ ...user, name: settings.displayName || user.name }} onLogout={onLogout} onSettings={() => setSettingsOpen(true)} />
        <span style={{ fontSize:17, fontWeight:800, color:C.accent, letterSpacing:-.5 }}>WorkFlow</span>
        {!isOnline && (
          <span style={{ fontSize:10, fontWeight:700, color:"#e74c3c", background:"#fde8e8", padding:"2px 6px", borderRadius:6, marginLeft:4 }}>
            Offline{queueSize > 0 ? ` (${queueSize})` : ""}
          </span>
        )}
        {syncing && (
          <span style={{ fontSize:10, fontWeight:700, color:"#e67e22", background:"#fef3e5", padding:"2px 6px", borderRadius:6, marginLeft:4 }}>
            Đang đồng bộ...
          </span>
        )}
        <div style={{ flex: 1, minWidth:2 }} />
        {/* Quick expense / QR scan */}
        <div className="tap" data-guide="qr" onClick={() => setQrOpen(true)}
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
      }} key={tab} style={{ flex: 1, overflowY: "auto", padding: "0 13px", paddingBottom: 50, animation: `${tabDir.current === "right" ? "slideInRight" : "slideInLeft"} .2s ease` }}>

        {tab === "tasks" && (
          <TasksTabContent
            tasks={tasks} filteredTasks={filteredTasks} projects={projects}
            filter={filter} setFilter={setFilter} projFilter={projFilter} setProjFilter={setProjFilter}
            searchQ={searchQ} setSearchQ={setSearchQ}
            selectMode={selectMode} setSelectMode={setSelectMode} selectedIds={selectedIds} setSelectedIds={setSelectedIds} exitSelectMode={exitSelectMode}
            pendingDeleteCount={pendingDeleteCount} isStaff={isStaff} isDirector={isDirector} myName={myName}
            patchTask={patchTask} deleteTask={deleteTask} addTask={addTask} hardDelete={hardDelete}
            setSel={setSel} setAddOpen={setAddOpen} setNewProjOpen={setNewProjOpen} setProjDetail={setProjDetail}
            setStatusPickerTask={setStatusPickerTask} toggleSelect={toggleSelect}
            settings={settings}
            supabase={supabase} supaSession={supaSession} cloudLoad={cloudLoad} cloudSave={cloudSave}
            timerTick={timerTick}
            Empty={Empty} Filters={Filters} ProjectFilters={ProjectFilters} TaskRow={TaskRow}
            deleteProject={deleteProject}
          />
        )}

        {tab === "calendar" && <TabErrorBoundary><CalendarTab tasks={tasks} onPress={t => setSel(t)} patchTask={patchTask} /></TabErrorBoundary>}
        {tab === "inbox" && <TabErrorBoundary><InboxTab tasks={tasks} projects={projects} patchTask={patchTask} patchProject={patchProject} settings={settings} user={user} addTask={addTask} openConvId={openConvId} /></TabErrorBoundary>}
        {tab === "expense" && <TabErrorBoundary><ExpenseTab tasks={tasks} expenses={expenses} addExpense={addExpense} deleteExpense={deleteExpense} settings={settings} user={user} onOpenQR={() => setQrOpen(true)} /></TabErrorBoundary>}
        {tab === "report" && <TabErrorBoundary><ReportTab tasks={tasks} history={history} settings={settings} memory={memory} user={user} /></TabErrorBoundary>}
        {tab === "dashboard" && <TabErrorBoundary><DashboardTab tasks={tasks} expenses={expenses} projects={projects} settings={settings} onOpenTask={t => setSel(t)} /></TabErrorBoundary>}
        {tab === "dev" && <TabErrorBoundary><DevTab user={user} /></TabErrorBoundary>}
        {tab === "attendance" && <TabErrorBoundary><AttendanceTab userId={userId} settings={settings} /></TabErrorBoundary>}
        {tab === "dept" && <TabErrorBoundary><DeptTab /></TabErrorBoundary>}
        {tab === "requests" && <TabErrorBoundary><RequestTab userId={userId} settings={settings} onOpenChat={(chatId) => { setOpenConvId(chatId); setTab("inbox"); }} /></TabErrorBoundary>}

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

      {/* ── MINI VOICE/TEXT WIDGET (tasks tab only) ── */}
      {tab === "tasks" && (
        <div style={{ position:"fixed", bottom:"122px", right:14, zIndex:55, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8 }}>
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
                    if (miniListening) { closeMiniVoice(); return; }
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

      {/* ── FAB: Add task button (tasks tab only) ── */}
      {tab === "tasks" && !addOpen && !selectMode && (
        <button className="tap" onClick={() => setAddOpen(true)}
          style={{
            position: "fixed", bottom: "112px", right: 16, zIndex: 60,
            width: 48, height: 48, borderRadius: 14,
            background: C.card, border: `1px solid ${C.border}`,
            color: C.accent, fontSize: 24, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 12px rgba(0,0,0,.1)",
          }}>+</button>
      )}

      <WoryOverlay
        woryOpen={woryOpen} setWoryOpen={setWoryOpen}
        msgs={msgs} aiIn={aiIn} setAiIn={setAiIn} aiLoad={aiLoad} sendChat={sendChat}
        canNewChat={canNewChat} startNewChat={startNewChat} chatStartedAt={chatStartedAt}
        voice={voice} endRef={endRef} C={C} MdBlock={MdBlock}
      />

      <BottomNav tab={tab} setTab={setTab} chatUnread={chatUnread}
        moreMenuOpen={moreMenuOpen} setMoreMenuOpen={setMoreMenuOpen}
        settings={settings} isDirector={isDirector} C={C} t={t} hasPermission={hasPermission} />

      {/* ── STATUS PICKER SHEET (replaces window.prompt) ── */}
      {statusPickerTask && (
        <>
          <div style={{ position:"fixed", inset:0, zIndex:998, background:"rgba(0,0,0,.4)" }} onClick={() => setStatusPickerTask(null)} />
          <div className="bottom-sheet" style={{ padding:"16px 20px" }}>
            <div style={{ width:36, height:3, background:C.border, borderRadius:2, margin:"0 auto 14px" }} />
            <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:12 }}>Doi trang thai</div>
            {STATUS_ORDER.map(s => (
              <button key={s} className="tap" onClick={() => {
                (statusPickerTask.ids || []).forEach(id => patchTask(id, { status: s }));
                setStatusPickerTask(null);
                exitSelectMode();
              }}
                style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"14px 14px", background:STATUSES[s]?.color + "10", border:"none", borderRadius:12, fontSize:15, fontWeight:600, color:STATUSES[s]?.color, cursor:"pointer", marginBottom:6 }}>
                <span style={{ width:10, height:10, borderRadius:"50%", background:STATUSES[s]?.color }} />
                {STATUSES[s]?.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── MODALS ── */}
      {sel && <TaskSheet task={tasks.find(t => t.id === sel.id) || sel} onClose={() => setSel(null)} />}
      {addOpen && <VoiceAddModal onClose={() => setAddOpen(false)} />}
      {heyOpen && <HeyModal onClose={() => setHeyOpen(false)} onChat={(txt) => { setHeyOpen(false); setTab("ai"); setTimeout(() => sendChat(txt), 500); }} buildSystemPrompt={buildSystemPrompt} user={{ ...user, name: settings.displayName || user.name }} />}
      {settingsOpen && <SettingsModal user={user} onClose={() => setSettingsOpen(false)} />}
      {!settings.industryPreset && user?.id === "trinh" && <IndustrySetupModal onClose={() => {}} />}
      {qrOpen && <QRScanModal tasks={tasks} patchTask={patchTask} addExpense={addExpense} onClose={() => setQrOpen(false)} />}

      {/* ── CHANGELOG ── */}
      {changelogOpen && <ChangelogView
        initialScrollY={changelogScrollY}
        onClose={() => setChangelogOpen(false)}
        onNavigate={(targetTab, targetModal, scrollY) => {
          setChangelogScrollY(scrollY);
          setChangelogOpen(false);
          setSettingsOpen(false);
          if (targetTab) setTab(targetTab);
          if (targetModal === "settings") setSettingsOpen(true);
          setChangelogBack(true);
        }}
      />}
      {changelogBack && !changelogOpen && <ChangelogBackButton onClick={() => { setChangelogOpen(true); setChangelogBack(false); }} />}

      {/* ── ONBOARDING GUIDE ── */}
      {showGuide && <OnboardingGuide onComplete={() => setShowGuide(false)} />}

      {/* ── NEW PROJECT MODAL ── */}
      {newProjOpen && <NewProjectModal onAdd={async (p) => {
        // Remove selectedSupaMembers from stored project data (only used for chat sync)
        const { selectedSupaMembers, ...projData } = p;
        const proj = { ...projData };

        // Auto-create group chat for project (if Supabase connected)
        if (supabase && supaSession?.user?.id) {
          try {
            const { data: conv } = await supabase.from("conversations")
              .insert({ type: "group", name: p.name, created_by: supaSession.user.id, category: "project", linked_project_id: String(id) })
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

        const createdProj = await addProject(proj);
        const projId = createdProj?.id || proj.id;

        // Update chatId on project if chat was created
        if (proj.chatId && createdProj?.id && !createdProj.chatId) {
          patchProject(createdProj.id, { chatId: proj.chatId });
        }

        // Auto-create tasks from workflow steps — round-robin assign to members
        const assignableMembers = (p.members || []).filter(m => m.supaId !== supaSession?.user?.id);
        if (p.steps && p.steps.length > 0) {
          const createdTasks = [];
          for (let i = 0; i < p.steps.length; i++) {
            const step = p.steps[i];
            const assignee = assignableMembers.length > 0 ? assignableMembers[i % assignableMembers.length] : null;
            const taskData = {
              title: `${i+1}. ${step}`,
              projectId: String(projId),
              stepIndex: i,
              category: "work",
              ...(assignee ? { assignee: assignee.name, assigneeId: assignee.supaId || null } : {}),
            };
            createdTasks.push({ step, assignee: assignee?.name || null });
            addTask(taskData);
          }
          // Send assignment summary to project chat
          if (proj.chatId && supabase && supaSession?.user?.id && assignableMembers.length > 0) {
            const byMember = {};
            createdTasks.forEach((t, i) => {
              if (t.assignee) {
                if (!byMember[t.assignee]) byMember[t.assignee] = [];
                byMember[t.assignee].push(`${i+1}. ${t.step}`);
              }
            });
            const lines = Object.entries(byMember).map(([name, tasks]) =>
              `\uD83D\uDC64 ${name}:\n${tasks.map(t => `   \u2705 ${t}`).join("\n")}`
            ).join("\n\n");
            supabase.from("messages").insert({
              conversation_id: proj.chatId,
              sender_id: supaSession.user.id,
              content: `\uD83D\uDCCC Phan cong cong viec:\n\n${lines}`,
              type: "system",
            }).then(() => {}).catch(() => {});
          }
        }
        setNewProjOpen(false);
        if (projId) setProjFilter(projId);
        if (proj.chatId) {
          setOpenConvId(proj.chatId);
          setTab("inbox");
        } else if (createdProj) {
          setProjDetail(createdProj);
        }
      }} onClose={() => setNewProjOpen(false)} />}

      {/* ── PROJECT DETAIL ── */}
      {projDetail && <ProjectDetailSheet project={projects.find(p => p.id === projDetail.id) || projDetail} tasks={tasks} patchTask={patchTask} addTask={addTask} patchProject={patchProject} hardDelete={hardDelete} deleteProject={async (id) => {
        const proj = projects.find(p => p.id === id);
        if (supabase && proj?.chatId) {
          // Delete sub-threads first
          const { data: subs } = await supabase.from("conversations").select("id").eq("parent_id", proj.chatId);
          for (const sub of (subs || [])) {
            await supabase.from("messages").delete().eq("conversation_id", sub.id);
            await supabase.from("conversation_members").delete().eq("conversation_id", sub.id);
            await supabase.from("conversations").delete().eq("id", sub.id);
          }
          // Delete main project chat
          await supabase.from("messages").delete().eq("conversation_id", proj.chatId);
          await supabase.from("conversation_members").delete().eq("conversation_id", proj.chatId);
          await supabase.from("conversations").delete().eq("id", proj.chatId);
        }
        deleteProject(id); setProjDetail(null); setProjFilter("all");
      }} onClose={() => setProjDetail(null)} onOpenChat={(proj) => { setProjDetail(null); setOpenConvId(proj.chatId || null); setTab("inbox"); }} isStaff={isStaff} myName={myName} />}

      {/* ── DESKTOP FLOAT ── */}
      <DesktopFloat onSelectTask={(t) => setSel(t)} onOpenTab={(t) => setTab(t)} />

      {/* ── TOASTS ── */}
      <UndoToast toast={undoToast} onUndo={undoDelete} />
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* ── KNOWLEDGE TOAST ── */}
      {knowledgeToast && (
        <div style={{ position:"fixed", bottom:"52px", left:12, right:12, zIndex:9998, animation:"slideDown .35s ease-out" }}>
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
    </Suspense>
    </div>
  );
}
