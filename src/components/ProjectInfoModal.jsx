/* ================================================================
   PROJECT INFO MODAL — Quản lý thông tin dự án trong nhóm chat
   Tổng quan, Công việc (tiến độ tự động), Liên kết, Báo cáo, Thành viên (vai trò)
   ================================================================ */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { C } from "../constants";
import { supabase } from "../lib/supabase";

/* ── Link auto-detect ── */
const LINK_ICONS = {
  "drive.google": { icon: "📁", label: "Google Drive", color: "#4285F4" },
  "docs.google": { icon: "📄", label: "Google Docs", color: "#4285F4" },
  "sheets.google": { icon: "📊", label: "Google Sheets", color: "#0F9D58" },
  "slides.google": { icon: "📽️", label: "Google Slides", color: "#F4B400" },
  "forms.google": { icon: "📝", label: "Google Forms", color: "#673AB7" },
  "meet.google": { icon: "📹", label: "Google Meet", color: "#00897B" },
  "calendar.google": { icon: "📅", label: "Google Calendar", color: "#4285F4" },
  "figma.com": { icon: "🎨", label: "Figma", color: "#A259FF" },
  "github.com": { icon: "💻", label: "GitHub", color: "#333" },
  "gitlab.com": { icon: "🦊", label: "GitLab", color: "#FC6D26" },
  "bitbucket.org": { icon: "🪣", label: "Bitbucket", color: "#0052CC" },
  "trello.com": { icon: "📋", label: "Trello", color: "#0079BF" },
  "notion.so": { icon: "📝", label: "Notion", color: "#000" },
  "notion.site": { icon: "📝", label: "Notion", color: "#000" },
  "slack.com": { icon: "💬", label: "Slack", color: "#4A154B" },
  "youtube.com": { icon: "🎬", label: "YouTube", color: "#FF0000" },
  "youtu.be": { icon: "🎬", label: "YouTube", color: "#FF0000" },
  "canva.com": { icon: "🖼️", label: "Canva", color: "#00C4CC" },
  "jira.atlassian": { icon: "🎯", label: "Jira", color: "#0052CC" },
  "confluence.atlassian": { icon: "📖", label: "Confluence", color: "#0052CC" },
  "miro.com": { icon: "🟡", label: "Miro", color: "#FFD02F" },
  "linear.app": { icon: "🔷", label: "Linear", color: "#5E6AD2" },
  "dropbox.com": { icon: "📦", label: "Dropbox", color: "#0061FF" },
  "zoom.us": { icon: "📹", label: "Zoom", color: "#2D8CFF" },
  "teams.microsoft": { icon: "👥", label: "MS Teams", color: "#6264A7" },
  "onedrive.live": { icon: "☁️", label: "OneDrive", color: "#0078D4" },
  "sharepoint.com": { icon: "📂", label: "SharePoint", color: "#0078D4" },
  "airtable.com": { icon: "📊", label: "Airtable", color: "#18BFFF" },
  "clickup.com": { icon: "✅", label: "ClickUp", color: "#7B68EE" },
  "asana.com": { icon: "🎯", label: "Asana", color: "#F06A6A" },
  "monday.com": { icon: "📆", label: "Monday", color: "#FF3D57" },
  "zalo.me": { icon: "💙", label: "Zalo", color: "#0068FF" },
  "facebook.com": { icon: "📘", label: "Facebook", color: "#1877F2" },
  "messenger.com": { icon: "💜", label: "Messenger", color: "#A033FF" },
  "telegram.org": { icon: "✈️", label: "Telegram", color: "#26A5E4" },
  "t.me": { icon: "✈️", label: "Telegram", color: "#26A5E4" },
  "vercel.app": { icon: "▲", label: "Vercel", color: "#000" },
  "netlify.app": { icon: "🌐", label: "Netlify", color: "#00C7B7" },
  "supabase.co": { icon: "⚡", label: "Supabase", color: "#3ECF8E" },
  "firebase.google": { icon: "🔥", label: "Firebase", color: "#FFCA28" },
};

function detectLinkMeta(url) {
  try {
    const host = new URL(url).hostname;
    for (const [key, meta] of Object.entries(LINK_ICONS)) {
      if (host.includes(key)) return meta;
    }
  } catch {}
  return { icon: "🔗", label: "Liên kết", color: C.accent };
}

/* ── Storage ── */
const STORE_KEY = (convId) => `wf_project_info_${convId}`;
function loadProjectInfo(convId) {
  try { return JSON.parse(localStorage.getItem(STORE_KEY(convId))) || null; } catch { return null; }
}
function saveProjectInfo(convId, data) {
  localStorage.setItem(STORE_KEY(convId), JSON.stringify(data));
}

/* ── Roles ── */
const ROLES = {
  leader: { label: "Trưởng nhóm", icon: "👑", color: "#d4900a" },
  deputy: { label: "Phó nhóm", icon: "⭐", color: C.accent },
  member: { label: "Thành viên", icon: "👤", color: C.muted },
};

/* ── Task priorities & statuses ── */
const TASK_STATUSES = {
  todo: { label: "Cần làm", color: C.muted, icon: "○" },
  doing: { label: "Đang làm", color: C.accent, icon: "◐" },
  review: { label: "Kiểm tra", color: "#e67e22", icon: "◑" },
  done: { label: "Hoàn thành", color: C.green, icon: "●" },
};

const TASK_PRIORITIES = {
  high: { label: "Cao", color: C.red },
  medium: { label: "Trung bình", color: "#e67e22" },
  low: { label: "Thấp", color: C.muted },
};

/* ── Face capture helper ── */
const FACE_SIZE = 150; // px — nhỏ, đủ nhận diện
const FACE_QUALITY = 0.6; // JPEG quality

function FaceCapture({ onCapture, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 320 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
        setReady(true);
      } catch (e) {
        setError("Không truy cập được camera. Hãy cấp quyền camera.");
      }
    })();
    return () => { cancelled = true; if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); };
  }, []);

  const capture = useCallback(() => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = FACE_SIZE;
    canvas.height = FACE_SIZE;
    const ctx = canvas.getContext("2d");
    // crop center square from video
    const v = videoRef.current;
    const side = Math.min(v.videoWidth, v.videoHeight);
    const sx = (v.videoWidth - side) / 2, sy = (v.videoHeight - side) / 2;
    ctx.drawImage(v, sx, sy, side, side, 0, 0, FACE_SIZE, FACE_SIZE);
    const dataUrl = canvas.toDataURL("image/jpeg", FACE_QUALITY);
    // stop camera
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    onCapture(dataUrl);
  }, [onCapture]);

  const cancel = useCallback(() => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    onCancel();
  }, [onCancel]);

  return (
    <div style={{ textAlign: "center" }}>
      {error ? (
        <div style={{ fontSize: 12, color: C.red, padding: 16 }}>{error}
          <div style={{ marginTop: 8 }}><button className="tap" onClick={cancel} style={{ padding: "6px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>Đóng</button></div>
        </div>
      ) : (
        <>
          <div style={{ position: "relative", width: FACE_SIZE + 20, height: FACE_SIZE + 20, margin: "0 auto", borderRadius: "50%", overflow: "hidden", border: `3px solid ${ready ? C.green : C.border}` }}>
            <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
          </div>
          <div style={{ fontSize: 11, color: C.muted, margin: "8px 0 10px" }}>Đưa gương mặt vào khung tròn</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button className="tap" onClick={capture} disabled={!ready}
              style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: ready ? C.green : C.muted, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: ready ? 1 : 0.5 }}>
              📸 Chụp
            </button>
            <button className="tap" onClick={cancel}
              style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>
              Hủy
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Attendance helpers ── */
const PING_INTERVAL = 15 * 60 * 1000; // 15 phút
const MAX_DRIFT_METERS = 200; // >200m = nghi ngờ rời vị trí

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject("Không hỗ trợ GPS");
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
      err => reject(err.message || "Không lấy được vị trí"),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

const defaultInfo = () => ({
  description: "",
  startDate: "",
  endDate: "",
  links: [],
  tasks: [],       // { id, title, status, priority, assigneeId, dueDate, created }
  reports: [],     // { id, authorId, content, created }
  roles: {},       // { [userId]: "leader" | "deputy" | "member" }
  attendance: [],  // { id, userId, date, checkIn:{time,lat,lng,face}, checkOut:{time,lat,lng,face}|null, pings:[{time,lat,lng,drift}], flags:[] }
  spotChecks: [],  // { id, requestedBy, requestedAt, targetUserId?, deadline, responses:[{userId,time,lat,lng,face,drift}], penalties:{[userId]:{bonus,noCount,reason}} }
});

/* ── Mic (Speech-to-text) Button ── */
const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

function MicButton({ onResult, style }) {
  const [listening, setListening] = useState(false);
  const handleMic = useCallback(() => {
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.lang = "vi-VN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      if (text) onResult(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }, [onResult]);

  if (!SpeechRecognition) return null;
  return (
    <button type="button" className="tap" onClick={handleMic}
      style={{ width: 34, height: 34, borderRadius: "50%", border: "none", flexShrink: 0,
        background: listening ? C.red : `${C.accent}15`, color: listening ? "#fff" : C.accent,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, cursor: "pointer",
        animation: listening ? "pulse .8s infinite" : "none", ...style }}>
      🎤
    </button>
  );
}

export default function ProjectInfoModal({ conversationId, convName, profiles, userId, linkedProject, addTask: addMainTask, patchTask: patchMainTask, onClose }) {
  const [info, setInfo] = useState(() => loadProjectInfo(conversationId) || defaultInfo());
  const [editing, setEditing] = useState(false); // view mode by default
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(null);
  const [newLink, setNewLink] = useState({ title: "", url: "" });
  const urlMeta = useMemo(() => {
    if (!newLink.url.trim()) return null;
    let url = newLink.url.trim();
    if (!url.startsWith("http")) url = "https://" + url;
    return detectLinkMeta(url);
  }, [newLink.url]);
  const [newTask, setNewTask] = useState({ title: "", priority: "medium", assigneeId: "", dueDate: "" });
  const [newReport, setNewReport] = useState("");
  const [tab, setTab] = useState("info");
  const [editingTask, setEditingTask] = useState(null); // task id being edited
  const [taskFilter, setTaskFilter] = useState("all"); // "all" | "todo" | "doing" | "review" | "done"
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(todayStr()); // filter date
  const [faceCapturing, setFaceCapturing] = useState(null); // "checkin" | "checkout" | "spot" | null
  const [spotCheckTarget, setSpotCheckTarget] = useState("all"); // "all" | userId
  const pingRef = useRef(null);
  const loaded = useRef(false);

  // Load from Supabase (shared), fallback to localStorage
  useEffect(() => {
    if (!conversationId || loaded.current) return;
    loaded.current = true;
    (async () => {
      if (supabase) {
        const { data } = await supabase.from("project_info").select("info").eq("conversation_id", String(conversationId)).single();
        if (data?.info) { setInfo(prev => ({ ...defaultInfo(), ...data.info })); return; }
      }
      // fallback localStorage
      const local = loadProjectInfo(conversationId);
      if (local) setInfo(local);
    })();
  }, [conversationId]);

  // Ensure current user has a role (creator = leader by default)
  useEffect(() => {
    if (userId && !info.roles?.[userId]) {
      const hasLeader = Object.values(info.roles || {}).includes("leader");
      setInfo(prev => ({ ...prev, roles: { ...(prev.roles || {}), [userId]: hasLeader ? "member" : "leader" } }));
    }
  }, [userId]);

  // Save to Supabase + localStorage
  const saveAll = useCallback(async () => {
    setSaving(true);
    saveProjectInfo(conversationId, info); // localStorage backup
    if (supabase) {
      await supabase.from("project_info").upsert({
        conversation_id: String(conversationId),
        info,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      });
    }
    setSaving(false);
    setEditing(false);
    setEditMode(null);
  }, [conversationId, info, userId]);

  const updateField = useCallback((field, value) => {
    setInfo(prev => ({ ...prev, [field]: value }));
  }, []);

  const myRole = info.roles[userId] || "member";
  const isLeaderOrDeputy = myRole === "leader" || myRole === "deputy";

  /* ── Progress auto-calculated from tasks ── */
  const progress = useMemo(() => {
    if (info.tasks.length === 0) return 0;
    const done = info.tasks.filter(t => t.status === "done").length;
    return Math.round((done / info.tasks.length) * 100);
  }, [info.tasks]);

  const tasksByStatus = useMemo(() => {
    const counts = { todo: 0, doing: 0, review: 0, done: 0 };
    info.tasks.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });
    return counts;
  }, [info.tasks]);

  /* ── Days remaining ── */
  const daysLeft = useMemo(() => {
    if (!info.endDate) return null;
    const diff = Math.ceil((new Date(info.endDate) - new Date()) / 86400000);
    return diff;
  }, [info.endDate]);

  /* ── Link helpers ── */
  const addLink = useCallback(() => {
    if (!newLink.url.trim()) return;
    let url = newLink.url.trim();
    if (!url.startsWith("http")) url = "https://" + url;
    const meta = detectLinkMeta(url);
    setInfo(prev => ({ ...prev, links: [...prev.links, { id: Date.now(), title: newLink.title.trim() || meta.label, url, icon: meta.icon, color: meta.color }] }));
    setNewLink({ title: "", url: "" });
    setEditMode(null);
  }, [newLink]);

  const removeLink = useCallback((id) => {
    setInfo(prev => ({ ...prev, links: prev.links.filter(l => l.id !== id) }));
  }, []);

  /* ── Task helpers ── */
  const addTask = useCallback(() => {
    if (!newTask.title.trim()) return;
    const taskId = Date.now();
    const assignee = profiles?.find(p => p.id === newTask.assigneeId);
    const task = { id: taskId, title: newTask.title.trim(), status: "todo", priority: newTask.priority, assigneeId: newTask.assigneeId || "", dueDate: newTask.dueDate || "", created: new Date().toISOString() };
    setInfo(prev => ({ ...prev, tasks: [...prev.tasks, task] }));
    // Sync to main store so task shows in tab Việc
    if (addMainTask) {
      const priMap = { high: "cao", medium: "trung", low: "thap" };
      addMainTask({
        id: taskId,
        title: newTask.title.trim(),
        status: "todo",
        priority: priMap[newTask.priority] || "trung",
        deadline: newTask.dueDate || "",
        projectId: linkedProject?.id || null,
        assignee: assignee?.display_name || "",
      });
    }
    setNewTask({ title: "", priority: "medium", assigneeId: "", dueDate: "" });
    setEditMode(null);
  }, [newTask, addMainTask, linkedProject, profiles]);

  const updateTask = useCallback((id, updates) => {
    setInfo(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === id ? { ...t, ...updates } : t) }));
    // Sync status/assignee changes to main store
    if (patchMainTask) {
      const patch = {};
      if (updates.status) patch.status = updates.status;
      if (updates.dueDate !== undefined) patch.deadline = updates.dueDate;
      if (updates.assigneeId !== undefined) {
        const assignee = profiles?.find(p => p.id === updates.assigneeId);
        patch.assignee = assignee?.display_name || "";
      }
      if (Object.keys(patch).length) patchMainTask(id, patch);
    }
  }, [patchMainTask, profiles]);

  const removeTask = useCallback((id) => {
    setInfo(prev => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== id) }));
  }, []);

  const cycleStatus = useCallback((id) => {
    const order = ["todo", "doing", "review", "done"];
    setInfo(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => {
        if (t.id !== id) return t;
        const idx = order.indexOf(t.status);
        return { ...t, status: order[(idx + 1) % order.length] };
      }),
    }));
  }, []);

  /* ── Report helpers ── */
  const addReport = useCallback(() => {
    if (!newReport.trim()) return;
    const report = { id: Date.now(), authorId: userId, content: newReport.trim(), created: new Date().toISOString() };
    setInfo(prev => ({ ...prev, reports: [report, ...prev.reports] }));
    setNewReport("");
    setEditMode(null);
  }, [newReport, userId]);

  const removeReport = useCallback((id) => {
    setInfo(prev => ({ ...prev, reports: prev.reports.filter(r => r.id !== id) }));
  }, []);

  /* ── Role helpers ── */
  const setRole = useCallback((uid, role) => {
    setInfo(prev => ({ ...prev, roles: { ...prev.roles, [uid]: role } }));
  }, []);

  const getName = useCallback((uid) => {
    return profiles?.find(p => p.id === uid)?.display_name || "Không tên";
  }, [profiles]);

  /* ── Attendance helpers ── */
  const myTodayRecord = useMemo(() =>
    (info.attendance || []).find(a => a.userId === userId && a.date === todayStr())
  , [info.attendance, userId]);

  const isCheckedIn = myTodayRecord && myTodayRecord.checkIn && !myTodayRecord.checkOut;

  // Check-in: chụp ảnh trước → lấy GPS → lưu
  const doCheckIn = useCallback(async (facePhoto) => {
    setGpsLoading(true); setGpsError(""); setFaceCapturing(null);
    try {
      const loc = await getLocation();
      const record = {
        id: Date.now(), userId, date: todayStr(),
        checkIn: { time: new Date().toISOString(), ...loc, face: facePhoto },
        checkOut: null, pings: [], flags: [],
      };
      setInfo(prev => ({ ...prev, attendance: [...(prev.attendance || []), record] }));
    } catch (e) { setGpsError(typeof e === "string" ? e : "Không lấy được vị trí"); }
    setGpsLoading(false);
  }, [userId]);

  const handleCheckIn = useCallback(() => { setFaceCapturing("checkin"); }, []);

  // Check-out: chụp ảnh → lấy GPS → lưu
  const doCheckOut = useCallback(async (facePhoto) => {
    setGpsLoading(true); setGpsError(""); setFaceCapturing(null);
    try {
      const loc = await getLocation();
      setInfo(prev => ({
        ...prev,
        attendance: (prev.attendance || []).map(a => {
          if (a.userId !== userId || a.date !== todayStr() || a.checkOut) return a;
          const drift = getDistance(a.checkIn.lat, a.checkIn.lng, loc.lat, loc.lng);
          const flags = [...a.flags];
          if (drift > MAX_DRIFT_METERS) flags.push(`Checkout cách ${Math.round(drift)}m`);
          return { ...a, checkOut: { time: new Date().toISOString(), ...loc, face: facePhoto }, flags };
        }),
      }));
    } catch (e) { setGpsError(typeof e === "string" ? e : "Không lấy được vị trí"); }
    setGpsLoading(false);
  }, [userId]);

  const handleCheckOut = useCallback(() => { setFaceCapturing("checkout"); }, []);

  /* ── Spot check (kiểm tra đột xuất) ── */
  const SPOT_DEADLINE_MINS = 10; // phải phản hồi trong 10 phút

  // Leader tạo yêu cầu chấm công đột xuất
  const createSpotCheck = useCallback(() => {
    const sc = {
      id: Date.now(),
      requestedBy: userId,
      requestedAt: new Date().toISOString(),
      targetUserId: spotCheckTarget === "all" ? null : spotCheckTarget,
      deadline: new Date(Date.now() + SPOT_DEADLINE_MINS * 60000).toISOString(),
      responses: [],
      penalties: {},
    };
    setInfo(prev => ({ ...prev, spotChecks: [...(prev.spotChecks || []), sc] }));
  }, [userId, spotCheckTarget]);

  // Nhân viên phản hồi spot check
  const doSpotResponse = useCallback(async (facePhoto, spotId) => {
    setGpsLoading(true); setGpsError(""); setFaceCapturing(null);
    try {
      const loc = await getLocation();
      setInfo(prev => ({
        ...prev,
        spotChecks: (prev.spotChecks || []).map(sc => {
          if (sc.id !== spotId) return sc;
          const checkinRec = (prev.attendance || []).find(a => a.userId === userId && a.date === todayStr() && !a.checkOut);
          const drift = checkinRec ? Math.round(getDistance(checkinRec.checkIn.lat, checkinRec.checkIn.lng, loc.lat, loc.lng)) : 0;
          return { ...sc, responses: [...sc.responses, { userId, time: new Date().toISOString(), ...loc, face: facePhoto, drift }] };
        }),
      }));
    } catch (e) { setGpsError(typeof e === "string" ? e : "Không lấy được vị trí"); }
    setGpsLoading(false);
  }, [userId]);

  // Pending spot checks for me (chưa phản hồi, chưa hết hạn hoặc đã hết hạn nhưng chưa xử phạt)
  const myPendingSpots = useMemo(() =>
    (info.spotChecks || []).filter(sc => {
      if (sc.targetUserId && sc.targetUserId !== userId) return false;
      if (sc.targetUserId === null && !isCheckedIn) return false; // all = chỉ ai đang checkin
      return !sc.responses.some(r => r.userId === userId);
    })
  , [info.spotChecks, userId, isCheckedIn]);

  // Leader: áp phạt cho người không phản hồi
  const applySpotPenalty = useCallback((spotId, targetUid, penaltyType) => {
    setInfo(prev => ({
      ...prev,
      spotChecks: (prev.spotChecks || []).map(sc => {
        if (sc.id !== spotId) return sc;
        const penalties = { ...sc.penalties };
        penalties[targetUid] = {
          bonus: penaltyType === "bonus" || penaltyType === "both",
          noCount: penaltyType === "nocount" || penaltyType === "both",
          reason: "Không phản hồi chấm công đột xuất",
          appliedAt: new Date().toISOString(),
          appliedBy: userId,
        };
        return { ...sc, penalties };
      }),
    }));
  }, [userId]);

  // Active spot check responding state
  const [respondingSpotId, setRespondingSpotId] = useState(null);

  // Periodic location ping while checked in
  useEffect(() => {
    if (!isCheckedIn) { if (pingRef.current) clearInterval(pingRef.current); return; }
    const doPing = async () => {
      try {
        const loc = await getLocation();
        setInfo(prev => ({
          ...prev,
          attendance: (prev.attendance || []).map(a => {
            if (a.userId !== userId || a.date !== todayStr() || a.checkOut) return a;
            const drift = getDistance(a.checkIn.lat, a.checkIn.lng, loc.lat, loc.lng);
            const flags = [...a.flags];
            if (drift > MAX_DRIFT_METERS) flags.push(`${new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} cách ${Math.round(drift)}m`);
            return { ...a, pings: [...a.pings, { time: new Date().toISOString(), ...loc, drift: Math.round(drift) }], flags };
          }),
        }));
      } catch {}
    };
    doPing(); // ping ngay khi mở
    pingRef.current = setInterval(doPing, PING_INTERVAL);
    return () => { if (pingRef.current) clearInterval(pingRef.current); };
  }, [isCheckedIn, userId]);

  // Attendance filtered by date
  const filteredAttendance = useMemo(() =>
    (info.attendance || []).filter(a => a.date === attendanceDate)
  , [info.attendance, attendanceDate]);

  const IS = { width: "100%", background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", fontSize: 14, color: C.text };

  const filteredTasks = taskFilter === "all" ? info.tasks : info.tasks.filter(t => t.status === taskFilter);

  const tabs = [
    { id: "info", icon: "📋", label: "Tổng quan" },
    { id: "tasks", icon: "✅", label: `Việc (${info.tasks.length})` },
    { id: "links", icon: "🔗", label: `Link (${info.links.length})` },
    { id: "attendance", icon: "⏰", label: "Chấm công" },
    { id: "reports", icon: "📊", label: `Báo cáo` },
    { id: "members", icon: "👥", label: "Nhóm" },
  ];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,.7)" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ position: "absolute", top: 0, bottom: 0, left: "50%", transform: "translateX(-50%)", background: C.surface, width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* ── Fixed header area ── */}
        <div style={{ flexShrink: 0, padding: "10px 18px 0" }}>
          <div style={{ textAlign: "center", marginBottom: 6 }}>
            <div style={{ width: 36, height: 3, background: C.border, borderRadius: 2, display: "inline-block" }} />
          </div>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{convName || "Dự án"}</div>
              <div style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
                <span>{ROLES[myRole]?.icon} {ROLES[myRole]?.label}</span>
                {daysLeft !== null && (
                  <span style={{ color: daysLeft < 0 ? C.red : daysLeft <= 7 ? "#e67e22" : C.green }}>
                    {daysLeft < 0 ? `Quá hạn ${-daysLeft} ngày` : daysLeft === 0 ? "Hôm nay" : `Còn ${daysLeft} ngày`}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {myRole === "leader" && !editing && (
                <button className="tap" onClick={() => setEditing(true)}
                  style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: `${C.accent}12`, color: C.accent, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  ✏️ Sửa
                </button>
              )}
              {editing && (
                <button className="tap" onClick={saveAll} disabled={saving}
                  style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Đang lưu..." : "💾 Lưu"}
                </button>
              )}
              {editing && (
                <button className="tap" onClick={() => { setEditing(false); setEditMode(null); }}
                  style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.muted, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  Hủy
                </button>
              )}
              <button className="tap" onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 22 }}>✕</button>
            </div>
          </div>
          {/* Tabs */}
          <div className="no-scrollbar" style={{ display: "flex", gap: 6, marginBottom: 0, overflowX: "auto", paddingBottom: 10 }}>
            {tabs.map(t => (
              <button key={t.id} className="tap" onClick={() => setTab(t.id)}
                style={{
                  padding: "6px 10px", borderRadius: 12, border: "none", whiteSpace: "nowrap",
                  background: tab === t.id ? C.accent : `${C.accent}08`,
                  color: tab === t.id ? "#fff" : C.accent,
                  fontSize: 10, fontWeight: 600, cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 44,
                }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrollable content area ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px 24px", WebkitOverflowScrolling: "touch" }}>

          {/* ═══════ TỔNG QUAN ═══════ */}
          {tab === "info" && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>Mô tả dự án</div>
              {editing ? (
                <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <textarea value={info.description} onChange={e => updateField("description", e.target.value)}
                    placeholder="Mô tả ngắn về dự án..." rows={3}
                    style={{ ...IS, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, flex: 1 }} />
                  <MicButton onResult={t => updateField("description", info.description ? info.description + " " + t : t)} style={{ marginTop: 4 }} />
                </div>
              ) : (
                <div style={{ ...IS, minHeight: 40, lineHeight: 1.5, color: info.description ? C.text : C.muted }}>
                  {info.description || "Chưa có mô tả"}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>Bắt đầu</div>
                  {editing ? (
                    <input type="date" value={info.startDate} onChange={e => updateField("startDate", e.target.value)} style={IS} />
                  ) : (
                    <div style={{ ...IS, color: info.startDate ? C.text : C.muted }}>
                      {info.startDate ? new Date(info.startDate).toLocaleDateString("vi-VN") : "—"}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>Kết thúc</div>
                  {editing ? (
                    <input type="date" value={info.endDate} onChange={e => updateField("endDate", e.target.value)} style={IS} />
                  ) : (
                    <div style={{ ...IS, color: info.endDate ? C.text : C.muted }}>
                      {info.endDate ? new Date(info.endDate).toLocaleDateString("vi-VN") : "—"}
                    </div>
                  )}
                </div>
              </div>

              {/* Auto progress bar */}
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Tiến độ (tự động)</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: progress >= 100 ? C.green : C.accent }}>{progress}%</div>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: C.border, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, transition: "width .3s", width: `${progress}%`,
                    background: progress >= 100 ? C.green : progress >= 50 ? C.accent : C.gold }} />
                </div>
              </div>

              {/* Task status breakdown */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginTop: 14 }}>
                {Object.entries(TASK_STATUSES).map(([key, st]) => (
                  <div key={key} style={{ background: `${st.color}12`, borderRadius: 10, padding: "8px 4px", textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: st.color }}>{tasksByStatus[key]}</div>
                    <div style={{ fontSize: 9, color: st.color, fontWeight: 600 }}>{st.label}</div>
                  </div>
                ))}
              </div>

              {/* Quick stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14 }}>
                <div style={{ background: `${C.accent}10`, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>{info.links.length}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Liên kết</div>
                </div>
                <div style={{ background: `${C.purple}14`, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.purple }}>{info.reports.length}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Báo cáo</div>
                </div>
                <div style={{ background: `${C.green}10`, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>{(profiles || []).length}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Thành viên</div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════ CÔNG VIỆC ═══════ */}
          {tab === "tasks" && (
            <div style={{ flex: 1 }}>
              {/* Filter pills */}
              <div className="no-scrollbar" style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
                <button className="tap" onClick={() => setTaskFilter("all")}
                  style={{ padding: "5px 10px", borderRadius: 14, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer",
                    background: taskFilter === "all" ? C.text : `${C.border}`, color: taskFilter === "all" ? "#fff" : C.sub }}>
                  Tất cả ({info.tasks.length})
                </button>
                {Object.entries(TASK_STATUSES).map(([key, st]) => (
                  <button key={key} className="tap" onClick={() => setTaskFilter(key)}
                    style={{ padding: "5px 10px", borderRadius: 14, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                      background: taskFilter === key ? st.color : `${st.color}15`, color: taskFilter === key ? "#fff" : st.color }}>
                    {st.icon} {st.label} ({tasksByStatus[key]})
                  </button>
                ))}
              </div>

              {filteredTasks.length === 0 && editMode !== "task" && (
                <div style={{ textAlign: "center", padding: "24px 0", color: C.muted }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
                  <div style={{ fontSize: 13 }}>{taskFilter === "all" ? "Chưa có công việc nào" : "Không có việc nào"}</div>
                </div>
              )}

              {filteredTasks.map(task => {
                const st = TASK_STATUSES[task.status] || TASK_STATUSES.todo;
                const pr = TASK_PRIORITIES[task.priority] || TASK_PRIORITIES.medium;
                const assignee = profiles?.find(p => p.id === task.assigneeId);
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";
                return (
                  <div key={task.id} style={{
                    padding: "10px 12px", background: isOverdue ? `${C.red}06` : C.card,
                    borderRadius: 12, border: `1px solid ${isOverdue ? C.red + "33" : C.border}`, marginBottom: 8,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {/* Status cycle button */}
                      <button className="tap" onClick={() => editing && cycleStatus(task.id)}
                        style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, border: `2px solid ${st.color}`,
                          background: task.status === "done" ? st.color : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: task.status === "done" ? "#fff" : st.color, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        {task.status === "done" ? "✓" : st.icon}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: task.status === "done" ? C.muted : C.text,
                          textDecoration: task.status === "done" ? "line-through" : "none" }}>
                          {task.title}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: `${pr.color}18`, color: pr.color, fontWeight: 700 }}>
                            {pr.label}
                          </span>
                          <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: `${st.color}18`, color: st.color, fontWeight: 700 }}>
                            {st.label}
                          </span>
                          {assignee && (
                            <span style={{ fontSize: 9, color: C.muted }}>👤 {assignee.display_name}</span>
                          )}
                          {task.dueDate && (
                            <span style={{ fontSize: 9, color: isOverdue ? C.red : C.muted }}>
                              📅 {new Date(task.dueDate).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
                            </span>
                          )}
                        </div>
                      </div>
                      {editing && <button className="tap" onClick={() => removeTask(task.id)}
                        style={{ background: "none", border: "none", color: C.muted, fontSize: 14, cursor: "pointer", padding: 2 }}>✕</button>}
                    </div>
                  </div>
                );
              })}

              {/* Add task form — only when editing */}
              {editing && (editMode === "task" ? (
                <div style={{ background: `${C.accent}08`, borderRadius: 12, padding: 12, border: `1px solid ${C.accent}33` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))}
                      placeholder="Tên công việc..." style={{ ...IS, flex: 1 }} autoFocus
                      onKeyDown={e => e.key === "Enter" && addTask()} />
                    <MicButton onResult={t => setNewTask(p => ({ ...p, title: p.title ? p.title + " " + t : t }))} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <select value={newTask.priority} onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))} style={IS}>
                      {Object.entries(TASK_PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <select value={newTask.assigneeId} onChange={e => setNewTask(p => ({ ...p, assigneeId: e.target.value }))} style={IS}>
                      <option value="">Giao cho...</option>
                      {(profiles || []).map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                    </select>
                  </div>
                  <input type="date" value={newTask.dueDate} onChange={e => setNewTask(p => ({ ...p, dueDate: e.target.value }))}
                    style={{ ...IS, marginBottom: 10 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="tap" onClick={addTask}
                      style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      Thêm việc
                    </button>
                    <button className="tap" onClick={() => setEditMode(null)}
                      style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.muted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <button className="tap" onClick={() => setEditMode("task")}
                  style={{ width: "100%", padding: "12px", borderRadius: 12, border: `1.5px dashed ${C.accent}55`,
                    background: `${C.accent}06`, color: C.accent, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  + Thêm công việc
                </button>
              ))}
            </div>
          )}

          {/* ═══════ LIÊN KẾT ═══════ */}
          {tab === "links" && (
            <div style={{ flex: 1 }}>
              {info.links.length === 0 && editMode !== "link" && (
                <div style={{ textAlign: "center", padding: "24px 0", color: C.muted }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🔗</div>
                  <div style={{ fontSize: 13 }}>Chưa có liên kết nào</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Thêm link Drive, Figma, GitHub...</div>
                </div>
              )}
              {info.links.map(link => (
                <div key={link.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 8,
                }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `${link.color || C.accent}15`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                    {link.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => window.open(link.url, "_blank")}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{link.title}</div>
                    <div style={{ fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.url}</div>
                  </div>
                  {editing && <button className="tap" onClick={() => removeLink(link.id)}
                    style={{ background: "none", border: "none", color: C.muted, fontSize: 16, cursor: "pointer", padding: 4 }}>✕</button>}
                </div>
              ))}

              {editing && (editMode === "link" ? (
                <div style={{ background: `${C.accent}08`, borderRadius: 12, padding: 12, border: `1px solid ${C.accent}33` }}>
                  {/* URL input with live icon preview */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    {urlMeta && (
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: `${urlMeta.color}15`, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                        transition: "all .2s" }}>
                        {urlMeta.icon}
                      </div>
                    )}
                    <input value={newLink.url} onChange={e => setNewLink(p => ({ ...p, url: e.target.value }))}
                      placeholder="URL (vd: drive.google.com/...)" style={{ ...IS, flex: 1 }} autoFocus />
                  </div>
                  {urlMeta && urlMeta.label !== "Liên kết" && (
                    <div style={{ fontSize: 11, color: urlMeta.color, fontWeight: 600, marginBottom: 6, paddingLeft: 4 }}>
                      {urlMeta.icon} Đã nhận diện: {urlMeta.label}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <input value={newLink.title} onChange={e => setNewLink(p => ({ ...p, title: e.target.value }))}
                      placeholder={urlMeta?.label !== "Liên kết" ? `Tên (mặc định: ${urlMeta?.label})` : "Tên (tự nhận diện nếu để trống)"}
                      style={{ ...IS, flex: 1 }}
                      onKeyDown={e => e.key === "Enter" && addLink()} />
                    <MicButton onResult={t => setNewLink(p => ({ ...p, title: p.title ? p.title + " " + t : t }))} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="tap" onClick={addLink}
                      style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      Thêm
                    </button>
                    <button className="tap" onClick={() => { setEditMode(null); setNewLink({ title: "", url: "" }); }}
                      style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.muted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <button className="tap" onClick={() => setEditMode("link")}
                  style={{ width: "100%", padding: "12px", borderRadius: 12, border: `1.5px dashed ${C.accent}55`,
                    background: `${C.accent}06`, color: C.accent, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  + Thêm liên kết
                </button>
              ))}
            </div>
          )}

          {/* ═══════ CHẤM CÔNG ═══════ */}
          {tab === "attendance" && (
            <div style={{ flex: 1 }}>
              {/* My check-in/out */}
              <div style={{ background: isCheckedIn ? `${C.green}08` : `${C.accent}08`, borderRadius: 14, padding: 16, border: `1px solid ${isCheckedIn ? C.green + "33" : C.accent + "33"}`, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 10, textTransform: "uppercase" }}>Chấm công hôm nay</div>
                {/* Face capture overlay */}
                {faceCapturing && (
                  <div style={{ marginBottom: 12 }}>
                    <FaceCapture
                      onCapture={photo => {
                        if (faceCapturing === "checkin") doCheckIn(photo);
                        else if (faceCapturing === "checkout") doCheckOut(photo);
                        else if (faceCapturing === "spot" && respondingSpotId) doSpotResponse(photo, respondingSpotId);
                      }}
                      onCancel={() => { setFaceCapturing(null); setRespondingSpotId(null); }}
                    />
                  </div>
                )}

                {myTodayRecord ? (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      {/* Face thumbnail check-in */}
                      {myTodayRecord.checkIn?.face ? (
                        <img src={myTodayRecord.checkIn.face} alt="face" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: `2px solid ${C.green}` }} />
                      ) : (
                        <span style={{ fontSize: 20 }}>📍</span>
                      )}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.green }}>
                          Vào: {new Date(myTodayRecord.checkIn.time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        {myTodayRecord.checkOut && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {myTodayRecord.checkOut.face && (
                              <img src={myTodayRecord.checkOut.face} alt="face" style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover", border: `1.5px solid ${C.accent}` }} />
                            )}
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>
                              Ra: {new Date(myTodayRecord.checkOut.time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Work duration */}
                    {(() => {
                      const start = new Date(myTodayRecord.checkIn.time);
                      const end = myTodayRecord.checkOut ? new Date(myTodayRecord.checkOut.time) : new Date();
                      const mins = Math.round((end - start) / 60000);
                      const h = Math.floor(mins / 60), m = mins % 60;
                      return (
                        <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>
                          Thời gian: {h}h{m > 0 ? `${m}p` : ""} {!myTodayRecord.checkOut && <span style={{ color: C.green, fontWeight: 600 }}>đang làm...</span>}
                        </div>
                      );
                    })()}
                    {/* Ping count + flags */}
                    {myTodayRecord.pings.length > 0 && (
                      <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
                        Kiểm tra vị trí: {myTodayRecord.pings.length} lần
                        {myTodayRecord.pings.some(p => p.drift > MAX_DRIFT_METERS) && (
                          <span style={{ color: C.red, fontWeight: 700, marginLeft: 6 }}>⚠️ Rời vị trí</span>
                        )}
                      </div>
                    )}
                    {myTodayRecord.flags.length > 0 && (
                      <div style={{ fontSize: 11, color: C.red, background: `${C.red}08`, borderRadius: 8, padding: "4px 8px", marginBottom: 6 }}>
                        ⚠️ {myTodayRecord.flags.join(" | ")}
                      </div>
                    )}
                    {!myTodayRecord.checkOut ? (
                      <button className="tap" onClick={handleCheckOut} disabled={gpsLoading}
                        style={{ width: "100%", padding: 12, borderRadius: 12, border: "none", background: C.red, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 4 }}>
                        {gpsLoading ? "Đang lấy vị trí..." : "🔴 Check-out (Ra về)"}
                      </button>
                    ) : (
                      <div style={{ textAlign: "center", fontSize: 13, color: C.green, fontWeight: 700, marginTop: 4 }}>✅ Đã hoàn thành</div>
                    )}
                  </div>
                ) : !faceCapturing ? (
                  <div>
                    <div style={{ textAlign: "center", marginBottom: 12 }}>
                      <div style={{ fontSize: 36, marginBottom: 4 }}>📸</div>
                      <div style={{ fontSize: 13, color: C.sub }}>Chụp ảnh gương mặt + GPS để chấm công</div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Vị trí sẽ được kiểm tra mỗi 15 phút</div>
                    </div>
                    <button className="tap" onClick={handleCheckIn} disabled={gpsLoading}
                      style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: C.green, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                      {gpsLoading ? "Đang lấy vị trí..." : "🟢 Check-in (Bắt đầu)"}
                    </button>
                  </div>
                ) : null}
                {gpsError && <div style={{ fontSize: 11, color: C.red, marginTop: 6, textAlign: "center" }}>{gpsError}</div>}
              </div>

              {/* ── Spot check alerts for worker ── */}
              {myPendingSpots.length > 0 && !faceCapturing && (
                <div style={{ marginBottom: 16 }}>
                  {myPendingSpots.map(sc => {
                    const isExpired = new Date(sc.deadline) < new Date();
                    const minsLeft = Math.max(0, Math.round((new Date(sc.deadline) - new Date()) / 60000));
                    return (
                      <div key={sc.id} style={{
                        padding: 14, borderRadius: 14, marginBottom: 8,
                        background: isExpired ? `${C.red}10` : "#fff3cd",
                        border: `2px solid ${isExpired ? C.red : "#ffc107"}`,
                        animation: isExpired ? "none" : "pulse .8s infinite",
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: isExpired ? C.red : "#856404", marginBottom: 6 }}>
                          {isExpired ? "⛔ HẾT HẠN — Chấm công đột xuất" : "🚨 CHẤM CÔNG ĐỘT XUẤT"}
                        </div>
                        <div style={{ fontSize: 11, color: isExpired ? C.red : "#856404", marginBottom: 8 }}>
                          {isExpired
                            ? "Bạn đã không phản hồi kịp. Có thể bị trừ thưởng hoặc không tính công."
                            : `Còn ${minsLeft} phút để phản hồi. Chụp ảnh + GPS ngay!`}
                        </div>
                        {!isExpired && (
                          <button className="tap" onClick={() => { setRespondingSpotId(sc.id); setFaceCapturing("spot"); }}
                            style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", background: "#ffc107", color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                            📸 Phản hồi ngay
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Leader: tạo chấm công đột xuất ── */}
              {isLeaderOrDeputy && (
                <div style={{ background: `${C.accent}06`, borderRadius: 14, padding: 14, border: `1px solid ${C.accent}22`, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 8, textTransform: "uppercase" }}>Kiểm tra đột xuất</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                    <select value={spotCheckTarget} onChange={e => setSpotCheckTarget(e.target.value)}
                      style={{ flex: 1, fontSize: 12, padding: "8px 10px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.text }}>
                      <option value="all">Tất cả (đang làm)</option>
                      {(profiles || []).filter(p => p.id !== userId).map(p => (
                        <option key={p.id} value={p.id}>{p.display_name || "Không tên"}</option>
                      ))}
                    </select>
                  </div>
                  <button className="tap" onClick={createSpotCheck}
                    style={{ width: "100%", padding: 11, borderRadius: 10, border: "none", background: "#e67e22", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    🔔 Yêu cầu chấm công đột xuất ({SPOT_DEADLINE_MINS} phút)
                  </button>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 6, textAlign: "center" }}>
                    Nhân viên phải chụp ảnh + GPS trong {SPOT_DEADLINE_MINS} phút
                  </div>

                  {/* Spot check history */}
                  {(info.spotChecks || []).filter(sc => sc.requestedAt.startsWith(attendanceDate)).length > 0 && (
                    <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>Lịch sử kiểm tra đột xuất:</div>
                      {(info.spotChecks || []).filter(sc => sc.requestedAt.startsWith(attendanceDate)).map(sc => {
                        const isExpired = new Date(sc.deadline) < new Date();
                        const checkedInUsers = (info.attendance || []).filter(a => a.date === todayStr() && !a.checkOut).map(a => a.userId);
                        const targetUsers = sc.targetUserId ? [sc.targetUserId] : checkedInUsers;
                        const respondedIds = sc.responses.map(r => r.userId);
                        const missingUsers = targetUsers.filter(uid => !respondedIds.includes(uid));
                        return (
                          <div key={sc.id} style={{ padding: "8px 10px", background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 6, fontSize: 11 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                              <span style={{ fontWeight: 600, color: C.text }}>
                                {new Date(sc.requestedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <span style={{ color: isExpired ? (missingUsers.length > 0 ? C.red : C.green) : "#e67e22", fontWeight: 600 }}>
                                {isExpired ? (missingUsers.length > 0 ? "⚠️ Vi phạm" : "✅ Đủ") : "⏳ Đang chờ"}
                              </span>
                            </div>
                            {/* Responses */}
                            {sc.responses.map((r, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                                {r.face && <img src={r.face} alt="" style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }} />}
                                <span style={{ color: C.green, fontWeight: 600 }}>✅ {getName(r.userId)}</span>
                                <span style={{ color: C.muted }}>{new Date(r.time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                                {r.drift > MAX_DRIFT_METERS && <span style={{ color: C.red }}>⚠️ {r.drift}m</span>}
                              </div>
                            ))}
                            {/* Missing + penalty buttons */}
                            {isExpired && missingUsers.map(uid => (
                              <div key={uid} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                                <span style={{ color: C.red, fontWeight: 600 }}>❌ {getName(uid)}</span>
                                {!sc.penalties?.[uid] ? (
                                  <div style={{ display: "flex", gap: 4 }}>
                                    <button className="tap" onClick={() => applySpotPenalty(sc.id, uid, "bonus")}
                                      style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, border: `1px solid ${C.red}`, background: `${C.red}10`, color: C.red, cursor: "pointer" }}>
                                      Trừ thưởng
                                    </button>
                                    <button className="tap" onClick={() => applySpotPenalty(sc.id, uid, "nocount")}
                                      style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, border: `1px solid ${C.red}`, background: `${C.red}10`, color: C.red, cursor: "pointer" }}>
                                      Không tính công
                                    </button>
                                    <button className="tap" onClick={() => applySpotPenalty(sc.id, uid, "both")}
                                      style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, border: `1px solid ${C.red}`, background: C.red, color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                                      Cả hai
                                    </button>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: 9, color: C.red, fontWeight: 600 }}>
                                    {sc.penalties[uid].bonus && "💸 Trừ thưởng"}
                                    {sc.penalties[uid].bonus && sc.penalties[uid].noCount && " + "}
                                    {sc.penalties[uid].noCount && "🚫 Không tính công"}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Date filter */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase" }}>Ngày</div>
                <input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)}
                  style={{ ...IS, flex: 1, fontSize: 13, padding: "6px 10px" }} />
              </div>

              {/* Attendance list for all members */}
              {filteredAttendance.length === 0 && (
                <div style={{ textAlign: "center", padding: "20px 0", color: C.muted }}>
                  <div style={{ fontSize: 13 }}>Không có dữ liệu chấm công ngày này</div>
                </div>
              )}
              {filteredAttendance.map(a => {
                const member = profiles?.find(p => p.id === a.userId);
                const start = new Date(a.checkIn.time);
                const end = a.checkOut ? new Date(a.checkOut.time) : new Date();
                const mins = Math.round((end - start) / 60000);
                const h = Math.floor(mins / 60), m = mins % 60;
                const hasWarning = a.flags.length > 0 || a.pings.some(p => p.drift > MAX_DRIFT_METERS);
                const maxDrift = a.pings.length > 0 ? Math.max(...a.pings.map(p => p.drift)) : 0;
                return (
                  <div key={a.id} style={{
                    padding: "10px 12px", background: hasWarning ? `${C.red}06` : C.card,
                    borderRadius: 12, border: `1px solid ${hasWarning ? C.red + "33" : C.border}`, marginBottom: 8,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {/* Face photo or avatar initial */}
                      {a.checkIn?.face ? (
                        <img src={a.checkIn.face} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", border: `2px solid ${C.green}`, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: member?.avatar_color || C.accent,
                          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                          {(member?.display_name || "?")[0].toUpperCase()}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                          {member?.display_name || "Không tên"}
                          {a.userId === userId && <span style={{ fontSize: 10, color: C.accent, marginLeft: 4 }}>Bạn</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                          <span style={{ fontSize: 10, color: C.green, fontWeight: 600 }}>
                            Vào {start.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {a.checkOut ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: C.accent, fontWeight: 600 }}>
                              {a.checkOut.face && <img src={a.checkOut.face} alt="" style={{ width: 14, height: 14, borderRadius: "50%", objectFit: "cover" }} />}
                              Ra {new Date(a.checkOut.time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, color: C.green, fontWeight: 600 }}>đang làm</span>
                          )}
                          <span style={{ fontSize: 10, color: C.sub }}>{h}h{m > 0 ? m + "p" : ""}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: C.muted }}>{a.pings.length} ping</div>
                        {maxDrift > 0 && (
                          <div style={{ fontSize: 10, color: maxDrift > MAX_DRIFT_METERS ? C.red : C.green, fontWeight: 600 }}>
                            {maxDrift > MAX_DRIFT_METERS ? "⚠️" : "✅"} {maxDrift}m
                          </div>
                        )}
                      </div>
                    </div>
                    {a.flags.length > 0 && (
                      <div style={{ fontSize: 10, color: C.red, marginTop: 6, padding: "3px 8px", background: `${C.red}08`, borderRadius: 6 }}>
                        ⚠️ {a.flags.join(" | ")}
                      </div>
                    )}
                    {/* Ping timeline - expanded for leader */}
                    {isLeaderOrDeputy && a.pings.length > 0 && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 4 }}>Lộ trình vị trí:</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {a.pings.map((p, i) => (
                            <span key={i} style={{
                              fontSize: 9, padding: "2px 6px", borderRadius: 6, fontWeight: 600,
                              background: p.drift > MAX_DRIFT_METERS ? `${C.red}15` : `${C.green}12`,
                              color: p.drift > MAX_DRIFT_METERS ? C.red : C.green,
                            }}>
                              {new Date(p.time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} · {p.drift}m
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Leader: delete attendance */}
              {editing && isLeaderOrDeputy && filteredAttendance.length > 0 && (
                <button className="tap" onClick={() => {
                  if (!confirm(`Xóa dữ liệu chấm công ngày ${attendanceDate}?`)) return;
                  setInfo(prev => ({ ...prev, attendance: (prev.attendance || []).filter(a => a.date !== attendanceDate) }));
                }}
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${C.red}33`, background: `${C.red}06`, color: C.red, fontSize: 12, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>
                  Xóa dữ liệu ngày {attendanceDate}
                </button>
              )}

              {/* ── Quy định chấm công ── */}
              <div style={{ marginTop: 20, padding: 14, background: `${C.muted}08`, borderRadius: 14, border: `1px dashed ${C.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>📜 QUY ĐỊNH CHẤM CÔNG</div>
                {[
                  { icon: "📸", text: "Check-in / Check-out bắt buộc chụp ảnh gương mặt + bật GPS" },
                  { icon: "📍", text: "Phải bật định vị (GPS) khi chấm công. Không bật = không chấm được = vắng mặt" },
                  { icon: "🔔", text: `Kiểm tra đột xuất: phải phản hồi trong ${SPOT_DEADLINE_MINS} phút bằng ảnh + GPS` },
                  { icon: "💸", text: "Không phản hồi đột xuất: trừ thưởng và/hoặc không tính công ngày đó" },
                  { icon: "⚠️", text: `Rời vị trí check-in > ${MAX_DRIFT_METERS}m sẽ bị ghi nhận cảnh báo` },
                  { icon: "🔄", text: "Vị trí được kiểm tra tự động mỗi 15 phút trong giờ làm" },
                  { icon: "🚫", text: "Tắt GPS = coi như không có mặt tại công trường" },
                ].map((rule, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, flexShrink: 0 }}>{rule.icon}</span>
                    <span style={{ fontSize: 11, color: C.sub, lineHeight: 1.4 }}>{rule.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══════ THÀNH VIÊN ═══════ */}
          {tab === "members" && (
            <div style={{ flex: 1 }}>
              {/* Role legend */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                {Object.entries(ROLES).map(([key, r]) => (
                  <span key={key} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 8, background: `${r.color}15`, color: r.color, fontWeight: 600 }}>
                    {r.icon} {r.label}
                  </span>
                ))}
              </div>

              {(profiles || []).map(p => {
                const role = info.roles[p.id] || "member";
                const r = ROLES[role];
                const memberTasks = info.tasks.filter(t => t.assigneeId === p.id);
                const memberDone = memberTasks.filter(t => t.status === "done").length;
                return (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 8,
                  }}>
                    <div style={{ position: "relative" }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: p.avatar_color || C.accent,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
                        {(p.display_name || "?")[0].toUpperCase()}
                      </div>
                      <span style={{ position: "absolute", bottom: -2, right: -2, fontSize: 12 }}>{r.icon}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                        {p.display_name || "Không tên"}
                        {p.id === userId && <span style={{ fontSize: 10, color: C.accent, marginLeft: 6 }}>Bạn</span>}
                      </div>
                      <div style={{ fontSize: 10, color: r.color, fontWeight: 600 }}>{r.label}</div>
                      {memberTasks.length > 0 && (
                        <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                          {memberDone}/{memberTasks.length} việc hoàn thành
                        </div>
                      )}
                    </div>
                    {/* Role change - only leader + editing */}
                    {editing && myRole === "leader" && p.id !== userId && (
                      <select value={role} onChange={e => setRole(p.id, e.target.value)}
                        style={{ fontSize: 11, padding: "4px 6px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.text }}>
                        <option value="leader">Trưởng nhóm</option>
                        <option value="deputy">Phó nhóm</option>
                        <option value="member">Thành viên</option>
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
