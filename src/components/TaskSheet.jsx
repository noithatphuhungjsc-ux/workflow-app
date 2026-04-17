/* ================================================================
   TASK SHEET — Full screen task detail (professional redesign)
   ================================================================ */
import { useState, useRef, useCallback } from "react";
import { C, PRIORITIES, STATUSES, WORKFLOWS, EXPENSE_CATEGORIES, TEAM_ACCOUNTS, getElapsed, formatTimer, fmtMoney } from "../constants";
import { ConfirmDialog, LazyImage } from "../components";
import { useStore } from "../store";
import { callClaude } from "../services/ai";

const IS = { background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px", color:C.text, fontSize:14, width:"100%", boxSizing:"border-box" };
const NOTE_STATUSES = [
  { id: "pending", label: "Chờ", color: C.gold },
  { id: "doing", label: "Đang", color: C.accent },
  { id: "done", label: "Xong", color: C.green },
];
const NOTE_PRIOS = [
  { id: "normal", label: "Thường", color: C.muted },
  { id: "high", label: "Quan trọng", color: C.red },
];

/* ── Card wrapper for each section ── */
const Card = ({ children, style }) => (
  <div style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px", ...style }}>
    {children}
  </div>
);

const SectionTitle = ({ icon, label, count, extra }) => (
  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
    <div style={{ width:28, height:28, borderRadius:8, background:`${C.accent}12`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>{icon}</div>
    <span style={{ fontSize:13, fontWeight:700, color:C.text, flex:1 }}>{label} {count ? <span style={{ fontWeight:500, color:C.muted }}>({count})</span> : ""}</span>
    {extra}
  </div>
);

function ExpenseItemRow({ item, index, isLast, onPatch, onDelete, cats }) {
  const [desc, setDesc] = useState(item.desc || "");
  const [amt, setAmt] = useState(item.amount ? String(item.amount) : "");
  return (
    <div style={{ padding:"8px 0", borderBottom: !isLast ? `1px solid ${C.border}22` : "none" }}>
      <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:6 }}>
        <span style={{ fontSize:11, color:C.muted, fontWeight:700, width:18, height:18, borderRadius:5, background:`${C.accent}10`, textAlign:"center", lineHeight:"18px", flexShrink:0 }}>{index + 1}</span>
        <input type="text" value={desc} onChange={e => setDesc(e.target.value)}
          onBlur={() => onPatch({ desc })} placeholder="Lý do chi tiêu..."
          style={{ ...IS, fontSize:13, flex:1, padding:"7px 10px" }} />
        <button className="tap" onClick={onDelete} style={{ background:"none", border:"none", fontSize:14, color:C.muted, padding:"2px 4px", opacity:0.4 }}>✕</button>
      </div>
      <div style={{ display:"flex", gap:6, alignItems:"center", paddingLeft:24 }}>
        <input type="text" inputMode="numeric" value={amt}
          onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ""); setAmt(v); }}
          onBlur={() => onPatch({ amount: Number(amt) || 0 })}
          placeholder="Số tiền" style={{ ...IS, fontSize:13, padding:"7px 10px", width:110, flex:"none" }} />
        <select value={item.category || "work"} onChange={e => onPatch({ category: e.target.value })}
          style={{ ...IS, fontSize:12, padding:"7px 8px", flex:1 }}>
          {Object.entries(cats).map(([k, c]) => <option key={k} value={k}>{c.icon} {c.label}</option>)}
        </select>
        <button className="tap" onClick={() => onPatch({ paid: !item.paid })}
          style={{ width:28, height:28, borderRadius:8, border:`2px solid ${item.paid ? C.green : C.border}`, background: item.paid ? C.green : "transparent",
            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:"#fff", fontSize:12, fontWeight:700 }}>
          {item.paid && "✓"}
        </button>
      </div>
    </div>
  );
}

export default function TaskSheet({ task, onClose }) {
  const { patchTask, deleteTask, timerStart, timerPause, timerResume, timerDone, timerTick, projects, settings } = useStore();
  const CATS = settings.industryExpenseCategories || EXPENSE_CATEGORIES;
  const [confirmDel, setConfirmDel] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [subsOpen, setSubsOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);
  const [expOpen, setExpOpen] = useState(true);
  const [photoOpen, setPhotoOpen] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [editingNote, setEditingNote] = useState(null);
  const [editNoteText, setEditNoteText] = useState("");
  const [ocrLoading, setOcrLoading] = useState(null);
  const [ocrResult, setOcrResult] = useState(null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  const subtasks = task.subtasks || [];
  const notes = Array.isArray(task.notes) ? task.notes : [];

  // ── Project info ──
  const project = task.projectId ? projects.find(p => p.id === task.projectId) : null;
  const projectMembers = project?.members || [];
  const projectSteps = project?.steps || [];
  const projectStepIndex = task.workflowStep || 0;

  // ── Derived ──
  const wf = WORKFLOWS.find(w => w.id === task.workflow);
  const expense = task.expense || {};
  const expenseItems = expense.items || (expense.amount > 0 ? [{ id: 1, desc: expense.description || "", amount: expense.amount, category: expense.category || "work", paid: !!expense.paid }] : []);
  const expenseTotal = expenseItems.reduce((s, e) => s + (e.amount || 0), 0);
  const billPhotos = task.billPhotos || [];

  // ── Actions ──
  const addSub = () => { const t = newSub.trim(); if (!t) return; patchTask(task.id, { subtasks: [...subtasks, { id: Date.now(), title: t, done: false }] }); setNewSub(""); };
  const toggleSub = (sid) => patchTask(task.id, { subtasks: subtasks.map(s => s.id === sid ? { ...s, done: !s.done } : s) });
  const deleteSub = (sid) => patchTask(task.id, { subtasks: subtasks.filter(s => s.id !== sid) });

  const addNote = () => { const t = newNote.trim(); if (!t) return; patchTask(task.id, { notes: [...notes, { id: Date.now(), text: t, status: "pending", priority: "normal" }] }); setNewNote(""); };
  const deleteNote = (nid) => patchTask(task.id, { notes: notes.filter(n => n.id !== nid) });
  const patchNote = (nid, data) => patchTask(task.id, { notes: notes.map(n => n.id === nid ? { ...n, ...data } : n) });
  const startEditNote = (n) => { setEditingNote(n.id); setEditNoteText(n.text); };
  const saveEditNote = (nid) => { patchNote(nid, { text: editNoteText }); setEditingNote(null); };

  const saveExpenseItems = (items) => {
    const total = items.reduce((s, e) => s + (e.amount || 0), 0);
    const allPaid = items.length > 0 && items.every(e => e.paid);
    patchTask(task.id, { expense: { ...expense, items, amount: total, paid: allPaid, category: items[0]?.category || "other" } });
  };
  const addExpenseItem = () => saveExpenseItems([...expenseItems, { id: Date.now(), desc: "", amount: 0, category: "work", paid: false }]);
  const deleteExpenseItem = (eid) => saveExpenseItems(expenseItems.filter(e => e.id !== eid));
  const patchExpenseItem = (eid, data) => saveExpenseItems(expenseItems.map(e => e.id === eid ? { ...e, ...data } : e));

  const handleBillPhoto = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) { const r = Math.min(MAX / w, MAX / h); w *= r; h *= r; }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        let dataUrl = canvas.toDataURL("image/jpeg", 0.6);
        if (dataUrl.length > 400000) dataUrl = canvas.toDataURL("image/jpeg", 0.4);
        patchTask(task.id, { billPhotos: [...billPhotos, { id: Date.now(), data: dataUrl, ts: new Date().toISOString() }] });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };
  const deleteBillPhoto = (pid) => patchTask(task.id, { billPhotos: billPhotos.filter(p => p.id !== pid) });

  const scanBillPhoto = useCallback(async (photo) => {
    setOcrLoading(photo.id);
    setOcrResult(null);
    try {
      const base64 = photo.data.split(",")[1];
      const mediaType = photo.data.startsWith("data:image/png") ? "image/png" : "image/jpeg";
      const catKeys = Object.keys(CATS);
      const system = `Bạn là AI đọc hóa đơn. Trả về JSON duy nhất, KHÔNG markdown, KHÔNG giải thích. Format: {"amount":number,"description":"string","items":[{"desc":"string","amount":number}]}. amount là tổng tiền (VND, bỏ dấu chấm/phẩy). items là danh sách từng mục nếu có. Nếu không đọc được thì trả {"amount":0,"description":"Không đọc được","items":[]}.`;
      const messages = [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: `Đọc hóa đơn này. Trích xuất tổng tiền và mô tả. Danh mục phù hợp: ${catKeys.join(", ")}. Trả JSON.` }
      ]}];
      const text = await callClaude(system, messages, 500);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setOcrResult(parsed);
        if (parsed.amount > 0) {
          const exp = task.expense || {};
          const items = exp.items || [];
          if (parsed.items?.length > 0) {
            const newItems = parsed.items.map((it, idx) => ({ id: Date.now() + idx, desc: it.desc || "", amount: it.amount || 0, category: "other", paid: false }));
            patchTask(task.id, { expense: { ...exp, amount: parsed.amount, description: parsed.description || "", items: [...items, ...newItems] } });
          } else {
            patchTask(task.id, { expense: { ...exp, amount: parsed.amount, description: parsed.description || exp.description || "" } });
          }
        }
      }
    } catch (err) {
      setOcrResult({ error: "Lỗi quét: " + (err.message || "Thử lại") });
    } finally { setOcrLoading(null); }
  }, [task, patchTask, CATS]);

  const generateQR = () => {
    const amt = expense.amount || 0;
    if (!amt) return null;
    const desc = encodeURIComponent(task.title?.slice(0, 25) || "Thanh toan");
    return `https://img.vietqr.io/image/970436-0-compact.png?amount=${amt}&addInfo=${desc}`;
  };

  const elapsed = getElapsed(task);
  const statusColor = STATUSES[task.status]?.color || C.muted;
  const prioColor = PRIORITIES[task.priority]?.color || C.muted;
  const isDirector = settings.userRole === "director";
  const hasDeleteRequest = task.deleteRequest?.status === "pending";
  // Match assignee to team account for avatar
  const assigneeAccount = task.assignee ? TEAM_ACCOUNTS.find(a =>
    a.name === task.assignee || a.name.split(" ").pop() === task.assignee || a.id === task.assignee
  ) : null;
  const subsDone = subtasks.filter(s => s.done).length;
  const subsPct = subtasks.length > 0 ? Math.round(subsDone / subtasks.length * 100) : 0;

  const handleDelete = () => {
    if (!isDirector) {
      if (window.confirm(`Yêu cầu xóa "${task.title}"? Giám đốc sẽ duyệt.`)) {
        patchTask(task.id, { deleteRequest: { status: "pending", by: settings.displayName || "NV", at: new Date().toISOString() } });
        onClose();
      }
    } else {
      if (window.confirm(`Xóa "${task.title}"?`)) { deleteTask(task.id); onClose(); }
    }
  };

  const ToggleSection = ({ icon, label, count, open, onToggle, extra }) => (
    <div className="tap" onClick={onToggle} style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 14px", background:C.card, borderRadius:14, border:`1px solid ${C.border}`, cursor:"pointer", transition:"all .15s" }}>
      <div style={{ width:28, height:28, borderRadius:8, background:`${C.accent}12`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>{icon}</div>
      <span style={{ fontSize:13, fontWeight:700, color:C.text, flex:1 }}>{label} {count ? <span style={{ fontWeight:500, color:C.muted }}>({count})</span> : ""}</span>
      {extra}
      <span style={{ fontSize:10, color:C.muted, transform: open ? "rotate(90deg)" : "none", transition:"transform .2s" }}>▶</span>
    </div>
  );

  return (
    <div style={{ position:"fixed", inset:0, background:C.bg, zIndex:1000, display:"flex", flexDirection:"column", animation:"fadeIn .2s" }}>

      {/* ── HEADER ── */}
      <div style={{ flexShrink:0, background:C.card, borderBottom:`1px solid ${C.border}` }}>
        {/* Top bar */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px" }}>
          <button className="tap" onClick={onClose} aria-label="Đóng"
            style={{ width:36, height:36, borderRadius:10, background:C.bg, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:C.muted, cursor:"pointer" }}>&larr;</button>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:15, fontWeight:700, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{task.title}</div>
            {project && <div style={{ fontSize:11, color: project.color || C.accent, fontWeight:600, marginTop:1 }}>Dự án: {project.name}</div>}
          </div>
          {assigneeAccount && (
            <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
              <div style={{ width:30, height:30, borderRadius:"50%", background: assigneeAccount.color, color:"#fff", fontSize:12, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", border:"2px solid #fff", boxShadow:`0 0 0 1.5px ${assigneeAccount.color}44` }}>
                {assigneeAccount.name.split(" ").pop()[0]?.toUpperCase()}
              </div>
              <div style={{ maxWidth:80, overflow:"hidden" }}>
                <div style={{ fontSize:11, fontWeight:600, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{assigneeAccount.name.split(" ").pop()}</div>
                <div style={{ fontSize:9, color: assigneeAccount.color, fontWeight:600 }}>{assigneeAccount.title}</div>
              </div>
            </div>
          )}
          {!assigneeAccount && task.assignee && (
            <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:C.accent, color:"#fff", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {task.assignee[0]?.toUpperCase()}
              </div>
              <span style={{ fontSize:11, fontWeight:600, color:C.text, maxWidth:70, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{task.assignee}</span>
            </div>
          )}
          {expenseTotal > 0 && <span style={{ fontSize:12, fontWeight:700, color:C.gold, background:`${C.gold}15`, borderRadius:8, padding:"4px 10px", flexShrink:0 }}>{fmtMoney(expenseTotal)}</span>}
        </div>
        {/* Status strip */}
        <div style={{ display:"flex", gap:6, padding:"0 14px 10px", alignItems:"center" }}>
          <span style={{ fontSize:11, padding:"3px 10px", borderRadius:6, background:`${statusColor}15`, color:statusColor, fontWeight:700 }}>
            {STATUSES[task.status]?.label}
          </span>
          <span style={{ fontSize:11, padding:"3px 10px", borderRadius:6, background:`${prioColor}15`, color:prioColor, fontWeight:700 }}>
            {PRIORITIES[task.priority]?.label}
          </span>
          {task.deadline && (
            <span style={{ fontSize:11, padding:"3px 10px", borderRadius:6, background:`${C.accent}10`, color:C.accent, fontWeight:600 }}>
              📅 {task.deadline}
            </span>
          )}
          <div style={{ flex:1 }} />
          {/* Delete */}
          {hasDeleteRequest && isDirector ? (
            <div style={{ display:"flex", gap:4 }}>
              <button className="tap" onClick={() => { deleteTask(task.id); onClose(); }}
                style={{ background:C.redD, border:`1px solid ${C.red}33`, borderRadius:8, padding:"4px 10px", fontSize:11, color:C.red, fontWeight:700 }}>Duyệt xóa</button>
              <button className="tap" onClick={() => patchTask(task.id, { deleteRequest: null })}
                style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:"4px 10px", fontSize:11, color:C.muted, fontWeight:600 }}>Từ chối</button>
            </div>
          ) : (
            <button className="tap" onClick={handleDelete}
              style={{ background: hasDeleteRequest ? `${C.gold}12` : `${C.red}08`, border:`1px solid ${hasDeleteRequest ? C.gold : C.red}30`, borderRadius:8, padding:"4px 10px", fontSize:11, color: hasDeleteRequest ? C.gold : C.red, fontWeight:600 }}>
              {!isDirector ? (hasDeleteRequest ? "⏳ Chờ duyệt" : "Xóa") : "Xóa"}
            </button>
          )}
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex:1, overflowY:"auto", padding:"12px 14px 28px", display:"flex", flexDirection:"column", gap:12 }}>

        {/* ── 1. THÔNG TIN CHÍNH ── */}
        <Card>
          <SectionTitle icon="📋" label="Thông tin chính" />

          {/* Title */}
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4, letterSpacing:.3 }}>TÊN CÔNG VIỆC</div>
            <input defaultValue={task.title} onChange={e => patchTask(task.id, { title: e.target.value })}
              style={{ ...IS, fontSize:15, fontWeight:600 }} placeholder="Tên công việc..." />
          </div>

          {/* Status + Priority + Assignee */}
          <div style={{ display:"grid", gridTemplateColumns: project ? "1fr 1fr 1fr" : "1fr 1fr", gap:8, marginBottom:10 }}>
            <div>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>TRẠNG THÁI</div>
              <select value={task.status} onChange={e => patchTask(task.id, { status: e.target.value })}
                style={{ ...IS, color:statusColor, fontWeight:600 }}>
                {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>ƯU TIÊN</div>
              <select value={task.priority} onChange={e => patchTask(task.id, { priority: e.target.value })}
                style={{ ...IS, color:prioColor, fontWeight:600 }}>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            {project && (
              <div>
                <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>GIAO CHO</div>
                <select value={task.assignee || ""} onChange={e => {
                    const name = e.target.value;
                    const member = projectMembers.find(m => (m.name || m) === name);
                    patchTask(task.id, { assignee: name || null, assigneeId: member?.supaId || null });
                  }}
                  style={{ ...IS, color: task.assignee ? C.text : C.muted }}>
                  <option value="">— Chưa giao —</option>
                  {projectMembers.map(m => <option key={m.name || m} value={m.name || m}>{m.name || m}{m.role ? ` (${m.role})` : ""}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Deadline + Time + Duration */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
            <div>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>HẠN CHÓT</div>
              <input type="date" defaultValue={task.deadline || ""} onChange={e => patchTask(task.id, { deadline: e.target.value })} style={IS} />
            </div>
            <div>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>GIỜ BẮT ĐẦU</div>
              <input type="time" defaultValue={task.startTime || ""} onChange={e => patchTask(task.id, { startTime: e.target.value })} style={IS} />
            </div>
            <div>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>THỜI LƯỢNG</div>
              <input type="number" defaultValue={task.duration || ""} onChange={e => patchTask(task.id, { duration: Number(e.target.value) })}
                placeholder="phút" min="5" max="480" style={IS} />
            </div>
          </div>

          {/* Category + Workflow */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <div>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>DANH MỤC</div>
              <input defaultValue={task.category || ""} onChange={e => patchTask(task.id, { category: e.target.value })}
                placeholder="VD: Marketing..." style={IS} />
            </div>
            <div>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>QUY TRÌNH</div>
              <select value={task.workflow || ""} onChange={e => patchTask(task.id, { workflow: e.target.value })} style={IS}>
                <option value="">Không</option>
                {WORKFLOWS.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>
        </Card>

        {/* ── Project workflow steps ── */}
        {project && projectSteps.length > 0 && (
          <Card>
            <SectionTitle icon="🔄" label="Tiến độ dự án" count={`${projectStepIndex}/${projectSteps.length}`} />
            {/* Progress bar */}
            <div style={{ height:4, background:C.border, borderRadius:2, marginBottom:10, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${Math.round(projectStepIndex / projectSteps.length * 100)}%`, background:`linear-gradient(90deg, ${C.accent}, ${C.green})`, borderRadius:2, transition:"width .3s" }} />
            </div>
            {projectSteps.map((step, i) => {
              const done = projectStepIndex > i;
              const current = projectStepIndex === i;
              return (
                <div key={i} className="tap" onClick={() => patchTask(task.id, { workflowStep: i + 1 })}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", cursor:"pointer",
                    borderBottom: i < projectSteps.length - 1 ? `1px solid ${C.border}15` : "none" }}>
                  <div style={{ width:22, height:22, borderRadius:"50%", fontSize:10, fontWeight:700,
                    border:`2px solid ${done ? C.green : current ? C.accent : C.border}`,
                    background: done ? C.green : current ? `${C.accent}15` : "transparent",
                    color: done ? "#fff" : current ? C.accent : C.muted,
                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    {done ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize:13, color: done ? C.muted : current ? C.accent : C.text,
                    textDecoration: done ? "line-through" : "none", fontWeight: current ? 600 : 400 }}>{step}</span>
                </div>
              );
            })}
          </Card>
        )}

        {/* ── Personal workflow steps ── */}
        {!project && wf && (
          <Card>
            <SectionTitle icon="⚙️" label={wf.name} count={`${task.workflowStep || 0}/${wf.steps.length}`} />
            <div style={{ height:4, background:C.border, borderRadius:2, marginBottom:10, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${Math.round((task.workflowStep || 0) / wf.steps.length * 100)}%`, background:`linear-gradient(90deg, ${C.accent}, ${C.green})`, borderRadius:2, transition:"width .3s" }} />
            </div>
            {wf.steps.map((step, i) => {
              const stepDone = (task.workflowStep || 0) > i;
              const isCurrent = (task.workflowStep || 0) === i;
              return (
                <div key={i} className="tap" onClick={() => patchTask(task.id, { workflowStep: i + 1 })}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", cursor:"pointer",
                    borderBottom: i < wf.steps.length - 1 ? `1px solid ${C.border}15` : "none" }}>
                  <div style={{ width:22, height:22, borderRadius:"50%", fontSize:10, fontWeight:700,
                    border:`2px solid ${stepDone ? C.green : isCurrent ? C.accent : C.border}`,
                    background: stepDone ? C.green : isCurrent ? `${C.accent}15` : "transparent",
                    color: stepDone ? "#fff" : isCurrent ? C.accent : C.muted,
                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    {stepDone ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize:13, color: stepDone ? C.muted : isCurrent ? C.accent : C.text,
                    textDecoration: stepDone ? "line-through" : "none", fontWeight: isCurrent ? 600 : 400 }}>{step}</span>
                </div>
              );
            })}
          </Card>
        )}

        {/* ── 2. TIMER ── */}
        <Card style={{ background:`linear-gradient(135deg, ${C.card}, ${C.accent}06)` }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:28, height:28, borderRadius:8, background:`${C.accent}12`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>⏱</div>
            <div style={{ fontSize:26, fontWeight:800, fontFamily:"monospace", color: task.timerState === "running" ? C.accent : C.text, letterSpacing:2, flex:1 }}>
              {formatTimer(elapsed)}
            </div>
            <div style={{ display:"flex", gap:6 }}>
              {(!task.timerState || task.timerState === "idle") && task.status !== "done" && (
                <button className="tap" onClick={() => timerStart(task.id)} style={{ background:C.green, color:"#fff", border:"none", borderRadius:10, padding:"8px 16px", fontSize:13, fontWeight:700 }}>Bắt đầu</button>
              )}
              {task.timerState === "running" && (<>
                <button className="tap" onClick={() => timerPause(task.id)} style={{ background:C.gold, color:"#fff", border:"none", borderRadius:10, padding:"8px 14px", fontSize:13, fontWeight:700 }}>Dừng</button>
                <button className="tap" onClick={() => timerDone(task.id)} style={{ background:C.green, color:"#fff", border:"none", borderRadius:10, padding:"8px 14px", fontSize:13, fontWeight:700 }}>Xong</button>
              </>)}
              {task.timerState === "paused" && (<>
                <button className="tap" onClick={() => timerResume(task.id)} style={{ background:C.accent, color:"#fff", border:"none", borderRadius:10, padding:"8px 14px", fontSize:13, fontWeight:700 }}>Tiếp</button>
                <button className="tap" onClick={() => timerDone(task.id)} style={{ background:C.green, color:"#fff", border:"none", borderRadius:10, padding:"8px 14px", fontSize:13, fontWeight:700 }}>Xong</button>
              </>)}
            </div>
          </div>
        </Card>

        {/* ── 3. CHECKLIST ── */}
        <ToggleSection icon="✅" label="Danh sách con" count={subtasks.length > 0 ? `${subsDone}/${subtasks.length}` : null} open={subsOpen} onToggle={() => setSubsOpen(v => !v)}
          extra={subtasks.length > 0 ? <div style={{ width:40, height:4, borderRadius:2, background:C.border, overflow:"hidden", marginRight:6 }}><div style={{ height:"100%", width:`${subsPct}%`, background:C.green, borderRadius:2 }} /></div> : null} />

        {subsOpen && (
          <Card style={{ marginTop:-6 }}>
            {subtasks.map((s, i) => (
              <div key={s.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderBottom: i < subtasks.length - 1 ? `1px solid ${C.border}18` : "none" }}>
                <span style={{ fontSize:11, color:C.muted, fontWeight:700, width:18, height:18, borderRadius:5, background:`${C.accent}08`, textAlign:"center", lineHeight:"18px", flexShrink:0 }}>{i+1}</span>
                <button className="tap" onClick={() => toggleSub(s.id)}
                  style={{ width:22, height:22, borderRadius:6, border:`2px solid ${s.done ? C.green : C.border}`, background: s.done ? C.green : "transparent",
                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:"#fff", fontSize:12, fontWeight:700 }}>
                  {s.done && "✓"}
                </button>
                <div style={{ flex:1, fontSize:13, color: s.done ? C.muted : C.text, textDecoration: s.done ? "line-through" : "none", fontWeight: s.done ? 400 : 500 }}>{s.title}</div>
                <button className="tap" onClick={() => deleteSub(s.id)} style={{ background:"none", border:"none", fontSize:13, color:C.muted, padding:"2px 4px", opacity:0.35 }}>✕</button>
              </div>
            ))}
            <div style={{ display:"flex", gap:6, marginTop: subtasks.length > 0 ? 8 : 0 }}>
              <input value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addSub(); }}
                placeholder="Thêm mục con..." style={{ ...IS, fontSize:13, flex:1, padding:"8px 12px" }} />
              <button className="tap" onClick={addSub} disabled={!newSub.trim()}
                style={{ background: newSub.trim() ? C.accent : C.border, color:"#fff", border:"none", borderRadius:10, padding:"8px 14px", fontSize:13, fontWeight:700 }}>+</button>
            </div>
          </Card>
        )}

        {/* ── 4. GHI CHÚ ── */}
        <ToggleSection icon="📝" label="Ghi chú" count={notes.length || null} open={notesOpen} onToggle={() => setNotesOpen(v => !v)}
          extra={notes.length > 0 ? <button className="tap" onClick={(e) => { e.stopPropagation(); patchTask(task.id, { notes: [] }); }}
            style={{ background:`${C.red}08`, border:`1px solid ${C.red}20`, borderRadius:6, padding:"2px 8px", fontSize:10, color:C.red, fontWeight:600, marginRight:4 }}>Xóa hết</button> : null} />

        {notesOpen && (
          <Card style={{ marginTop:-6 }}>
            {notes.map((n, i) => {
              const nStatus = NOTE_STATUSES.find(s => s.id === n.status) || NOTE_STATUSES[0];
              const isEditing = editingNote === n.id;
              return (
                <div key={n.id} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"8px 0", borderBottom: i < notes.length - 1 ? `1px solid ${C.border}18` : "none" }}>
                  <button className="tap" onClick={() => {
                    const idx = NOTE_STATUSES.findIndex(s => s.id === n.status);
                    patchNote(n.id, { status: NOTE_STATUSES[(idx + 1) % NOTE_STATUSES.length].id });
                  }}
                    style={{ width:20, height:20, borderRadius:"50%", border:`2px solid ${nStatus.color}`, background: n.status === "done" ? nStatus.color : "transparent",
                      display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1, color:"#fff", fontSize:10, fontWeight:700 }}>
                    {n.status === "done" && "✓"}
                  </button>
                  <div style={{ flex:1, minWidth:0 }}>
                    {isEditing ? (
                      <div style={{ display:"flex", gap:4 }}>
                        <input value={editNoteText} onChange={e => setEditNoteText(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveEditNote(n.id); }}
                          style={{ ...IS, fontSize:13, flex:1, padding:"6px 10px" }} autoFocus />
                        <button className="tap" onClick={() => saveEditNote(n.id)}
                          style={{ background:C.green, color:"#fff", border:"none", borderRadius:8, padding:"6px 10px", fontSize:12, fontWeight:700 }}>✓</button>
                      </div>
                    ) : (
                      <div style={{ fontSize:13, color: n.status === "done" ? C.muted : C.text, textDecoration: n.status === "done" ? "line-through" : "none",
                        fontWeight: n.priority === "high" ? 600 : 400, lineHeight:1.5 }}>
                        {n.priority === "high" && <span style={{ color:C.red, fontSize:11, marginRight:3 }}>!</span>}
                        {n.text}
                      </div>
                    )}
                    {!isEditing && (
                      <div style={{ display:"flex", gap:4, marginTop:4 }}>
                        <span style={{ fontSize:10, color:nStatus.color, fontWeight:600, background:nStatus.color + "15", borderRadius:6, padding:"2px 8px" }}>{nStatus.label}</span>
                        <button className="tap" onClick={() => patchNote(n.id, { priority: n.priority === "high" ? "normal" : "high" })}
                          style={{ fontSize:10, fontWeight:600, color: n.priority === "high" ? C.red : C.muted, background: n.priority === "high" ? `${C.red}10` : "transparent",
                            borderRadius:6, padding:"2px 8px", border:"none" }}>
                          {n.priority === "high" ? "Quan trọng" : "Thường"}
                        </button>
                      </div>
                    )}
                  </div>
                  {!isEditing && (
                    <div style={{ display:"flex", gap:2, flexShrink:0, marginTop:2 }}>
                      <button className="tap" onClick={() => startEditNote(n)} style={{ width:26, height:26, borderRadius:6, background:`${C.accent}10`, border:"none", fontSize:12, color:C.accent, display:"flex", alignItems:"center", justifyContent:"center" }}>✎</button>
                      <button className="tap" onClick={() => deleteNote(n.id)} style={{ width:26, height:26, borderRadius:6, background:`${C.red}08`, border:"none", fontSize:12, color:C.muted, display:"flex", alignItems:"center", justifyContent:"center", opacity:0.5 }}>✕</button>
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ display:"flex", gap:6, marginTop: notes.length > 0 ? 8 : 0 }}>
              <input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addNote(); }}
                placeholder="Thêm ghi chú..." style={{ ...IS, fontSize:13, flex:1, padding:"8px 12px" }} />
              <button className="tap" onClick={addNote} disabled={!newNote.trim()}
                style={{ background: newNote.trim() ? C.accent : C.border, color:"#fff", border:"none", borderRadius:10, padding:"8px 14px", fontSize:13, fontWeight:700 }}>+</button>
            </div>
          </Card>
        )}

        {/* ── 5. CHI TIÊU ── */}
        <ToggleSection icon="💰" label="Chi tiêu" count={expenseTotal > 0 ? fmtMoney(expenseTotal) : null} open={expOpen} onToggle={() => setExpOpen(v => !v)}
          extra={<button className="tap" onClick={(e) => { e.stopPropagation(); addExpenseItem(); }}
            style={{ background:C.accent, color:"#fff", border:"none", borderRadius:8, padding:"3px 12px", fontSize:11, fontWeight:700, marginRight:4 }}>+ Thêm</button>} />

        {expOpen && (
          <Card style={{ marginTop:-6 }}>
            {expenseItems.length === 0 && (
              <div style={{ fontSize:13, color:C.muted, textAlign:"center", padding:"12px 0" }}>Chưa có chi tiêu</div>
            )}
            {expenseItems.map((item, i) => (
              <ExpenseItemRow key={item.id} item={item} index={i} isLast={i === expenseItems.length - 1}
                onPatch={(data) => patchExpenseItem(item.id, data)} onDelete={() => deleteExpenseItem(item.id)} cats={CATS} />
            ))}
            {expenseTotal > 0 && (
              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, paddingTop:8, borderTop:`1px solid ${C.border}` }}>
                <button className="tap" onClick={() => { const url = generateQR(); if (url) window.open(url, "_blank"); }}
                  style={{ background:`${C.accent}12`, color:C.accent, border:`1px solid ${C.accent}30`, borderRadius:10, padding:"6px 14px", fontSize:12, fontWeight:700 }}>
                  QR Thanh toán
                </button>
                <div style={{ flex:1 }} />
                <span style={{ fontSize:14, fontWeight:700, color:C.gold }}>Tổng: {fmtMoney(expenseTotal)}</span>
              </div>
            )}
          </Card>
        )}

        {/* ── 6. ẢNH HÓA ĐƠN ── */}
        <ToggleSection icon="📷" label="Ảnh hóa đơn" count={billPhotos.length || null} open={photoOpen} onToggle={() => setPhotoOpen(v => !v)} />

        {photoOpen && (
          <Card style={{ marginTop:-6 }}>
            {billPhotos.length > 0 && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:8, marginBottom:10 }}>
                {billPhotos.map(p => (
                  <div key={p.id} style={{ position:"relative", borderRadius:10, overflow:"hidden", border:`1px solid ${C.border}` }}>
                    <LazyImage src={p.data} alt="bill" />
                    <button className="tap" onClick={() => deleteBillPhoto(p.id)}
                      style={{ position:"absolute", top:4, right:4, background:"rgba(0,0,0,0.6)", color:"#fff", border:"none", borderRadius:"50%", width:22, height:22, fontSize:12, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                    <button className="tap" onClick={() => scanBillPhoto(p)} disabled={ocrLoading === p.id}
                      style={{ position:"absolute", bottom:4, left:4, right:4, background:"rgba(0,0,0,0.7)", color:"#fff", border:"none", borderRadius:8, padding:"5px 0", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                      {ocrLoading === p.id ? "Đang quét..." : "🔍 AI Quét"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => handleBillPhoto(e.target.files[0])} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={e => handleBillPhoto(e.target.files[0])} />
              <button className="tap" onClick={() => fileRef.current?.click()}
                style={{ background:C.bg, border:`1.5px dashed ${C.border}`, borderRadius:10, padding:"12px 0", fontSize:13, color:C.muted, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                📁 Chọn ảnh
              </button>
              <button className="tap" onClick={() => cameraRef.current?.click()}
                style={{ background:C.bg, border:`1.5px dashed ${C.border}`, borderRadius:10, padding:"12px 0", fontSize:13, color:C.muted, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                📷 Chụp ảnh
              </button>
            </div>
            {ocrResult && !ocrResult.error && (
              <div style={{ marginTop:10, background:`${C.accent}08`, borderRadius:10, border:`1px solid ${C.accent}25`, padding:"10px 12px" }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:4 }}>KẾT QUẢ QUÉT</div>
                {ocrResult.description && <div style={{ fontSize:13, color:C.text, marginBottom:3 }}>{ocrResult.description}</div>}
                {ocrResult.amount > 0 && <div style={{ fontSize:15, fontWeight:700, color:C.gold }}>{fmtMoney(ocrResult.amount)}</div>}
                {ocrResult.items?.length > 0 && (
                  <div style={{ marginTop:4 }}>
                    {ocrResult.items.map((it, i) => (
                      <div key={i} style={{ fontSize:12, color:C.sub, display:"flex", justifyContent:"space-between", padding:"2px 0" }}>
                        <span>{it.desc}</span><span style={{ fontWeight:600 }}>{fmtMoney(it.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize:10, color:C.muted, marginTop:6 }}>Đã tự động điền vào chi tiêu</div>
              </div>
            )}
            {ocrResult?.error && (
              <div style={{ marginTop:10, fontSize:12, color:C.red, background:`${C.red}08`, borderRadius:10, padding:"8px 12px" }}>{ocrResult.error}</div>
            )}
          </Card>
        )}

      </div>
    </div>
  );
}
