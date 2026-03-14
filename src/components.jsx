/* ================================================================
   COMPONENTS — Small reusable UI components
   ================================================================ */
import { useState, useRef, useEffect, memo } from "react";
import { C, PRIORITIES, STATUSES, STATUS_ORDER, WORKFLOWS, EXPENSE_CATEGORIES, PAYMENT_SOURCES, getElapsed, formatTimer, isOverdue, todayStr, fmtMoney, fmtDD } from "./constants";
import { inlineMd } from "./services";

/* -- Pill (header stats) -- */
export const Pill = memo(function Pill({ n, c, l }) {
  return (
    <div style={{ background:`${c}18`, borderRadius:20, padding:"4px 11px", display:"flex", alignItems:"center", gap:4 }}>
      <span style={{ fontSize:15, fontWeight:700, color:c }}>{n}</span>
      <span style={{ fontSize:12, color:C.muted }}>{l}</span>
    </div>
  );
});

/* -- Chip -- */
export const Chip = memo(function Chip({ children, color = C.muted }) {
  return (
    <span style={{ background:`${color}18`, color, borderRadius:20, padding:"3px 10px", fontSize:13, fontWeight:500 }}>
      {children}
    </span>
  );
});

/* -- Section Label -- */
export function SL({ children }) {
  return <div style={{ fontSize:13, color:C.muted, fontWeight:600, letterSpacing:.5, marginBottom:8 }}>{children}</div>;
}

/* -- Mini Meta display -- */
export function MM({ l, v }) {
  return (
    <div style={{ background:C.card, borderRadius:10, padding:"10px 12px", border:`1px solid ${C.border}` }}>
      <div style={{ fontSize:12, color:C.muted, marginBottom:3, letterSpacing:.5 }}>{l.toUpperCase()}</div>
      <div style={{ fontSize:15, fontWeight:600 }}>{v}</div>
    </div>
  );
}

/* -- Empty state -- */
export function Empty() {
  return <div style={{ textAlign:"center", padding:"40px 20px", color:C.muted, fontSize:16 }}>Không có công việc nào</div>;
}

/* -- Sheet (bottom sheet wrapper) -- */
export function Sheet({ onClose, title, children }) {
  return (
    <div onClick={onClose} className="modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div onClick={e => e.stopPropagation()} className="sheet">
        <div style={{ textAlign:"center", padding:"12px 0 0" }}>
          <div style={{ width:36, height:3, background:C.border, borderRadius:2, display:"inline-block" }} />
        </div>
        <div style={{ padding:"8px 18px 24px" }}>
          <div style={{ display:"flex", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontSize:17, fontWeight:700, flex:1, lineHeight:1.35 }}>{title}</div>
            <button className="tap" onClick={onClose} aria-label="Đóng" style={{ background:"none", border:"none", color:C.muted, fontSize:22 }}>x</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/* -- Stat card (report) -- */
export function StatCard({ icon, label, value, color }) {
  return (
    <div style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px", display:"flex", alignItems:"center", gap:12 }}>
      <div style={{ width:40, height:40, borderRadius:12, background:`${color}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>{icon}</div>
      <div>
        <div style={{ fontSize:18, fontWeight:800, color }}>{value}</div>
        <div style={{ fontSize:10, color:C.muted, fontWeight:600 }}>{label}</div>
      </div>
    </div>
  );
}

/* -- Filter chips -- */
export function Filters({ filter, setFilter }) {
  return (
    <div className="no-scrollbar" style={{ display:"flex", gap:6, marginBottom:14, overflowX:"auto", paddingBottom:2 }}>
      {[["all","Tất cả"],["todo","Cần làm"],["prepare","Chuẩn bị"],["inprogress","Đang làm"],["done","Xong"]].map(([k,l]) => (
        <button key={k} className="tap" onClick={() => setFilter(k)}
          style={{ flexShrink:0, background:filter===k?C.accent:C.card, color:filter===k?"#fff":C.sub, border:`1px solid ${filter===k?C.accent:C.border}`, borderRadius:20, padding:"6px 14px", fontSize:14, fontWeight:500 }}>{l}</button>
      ))}
    </div>
  );
}

/* -- Project filter pills -- */
export function ProjectFilters({ projects, filter, setFilter, onAdd, onOpen, onDeleteAll, isStaff, myName }) {
  const [showArchived, setShowArchived] = useState(false);
  // Staff: only show projects they're a member of
  const staffFiltered = isStaff && myName
    ? projects.filter(p => (p.members || []).some(m => m.name === myName))
    : projects;
  const activeProjects = staffFiltered.filter(p => !p.archived);
  const archivedProjects = staffFiltered.filter(p => p.archived);
  const visibleProjects = showArchived ? staffFiltered : activeProjects;
  if (!visibleProjects.length && !archivedProjects.length && !onAdd) return null;
  return (
    <div className="no-scrollbar" style={{ display:"flex", gap:5, marginBottom:10, overflowX:"auto", paddingBottom:2, alignItems:"center" }}>
      <button className="tap" onClick={() => setFilter("all")}
        style={{ flexShrink:0, background:filter==="all"?"#3a3530":C.card, color:filter==="all"?"#fff":C.sub, border:`1px solid ${filter==="all"?"#3a3530":C.border}`, borderRadius:16, padding:"4px 12px", fontSize:12, fontWeight:600 }}>Tất cả</button>
      <button className="tap" onClick={() => setFilter("standalone")}
        style={{ flexShrink:0, background:filter==="standalone"?"#3a3530":C.card, color:filter==="standalone"?"#fff":C.sub, border:`1px solid ${filter==="standalone"?"#3a3530":C.border}`, borderRadius:16, padding:"4px 12px", fontSize:12, fontWeight:600 }}>Việc chung</button>
      {visibleProjects.map(p => (
        <button key={p.id} className="tap" onClick={() => { if (filter === p.id) onOpen?.(p); else setFilter(p.id); }}
          style={{ flexShrink:0, display:"flex", alignItems:"center", gap:5, background:filter===p.id?p.color:C.card, color:filter===p.id?"#fff":C.sub, border:`1px solid ${filter===p.id?p.color:C.border}`, borderRadius:16, padding:"4px 12px", fontSize:12, fontWeight:600, opacity: p.archived ? 0.5 : 1 }}>
          <span style={{ width:8, height:8, borderRadius:"50%", background:filter===p.id?"#fff":p.color, flexShrink:0 }} />
          {p.archived ? "📦 " : ""}{p.name}
        </button>
      ))}
      {archivedProjects.length > 0 && (
        <button className="tap" onClick={() => setShowArchived(v => !v)}
          style={{ flexShrink:0, fontSize:11, color:C.muted, background:showArchived ? `${C.muted}18` : C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:"4px 10px", fontWeight:600 }}>
          📦 {archivedProjects.length}
        </button>
      )}
      {onAdd && !isStaff && <button className="tap" onClick={onAdd}
        style={{ flexShrink:0, width:28, height:28, borderRadius:"50%", background:C.accentD, color:C.accent, border:`1px solid ${C.accent}33`, fontSize:16, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>+</button>}
      {onDeleteAll && !isStaff && visibleProjects.length > 0 && <button className="tap" onClick={onDeleteAll}
        style={{ flexShrink:0, fontSize:11, color:C.red, background:C.redD, border:`1px solid ${C.red}33`, borderRadius:16, padding:"4px 10px", fontWeight:600, cursor:"pointer" }}>Xóa hết</button>}
    </div>
  );
}

/* -- TaskRow (memoized) -- */
/* Alert level: overdue=red, today=orange, soon(tomorrow)=gold, normal=none */
function getAlertLevel(task) {
  if (task.status === "done") return null;
  const today = todayStr();
  if (isOverdue(task)) return { color: C.red, label: "Quá hạn", pulse: true };
  if (task.deadline === today) return { color: "#e67e22", label: "Hôm nay", pulse: true };
  if (task.deadline) {
    const d = new Date(task.deadline);
    const t = new Date(today);
    const diff = Math.round((d - t) / 86400000);
    if (diff === 1) return { color: C.gold, label: "Ngày mai", pulse: false };
    if (diff <= 3 && diff > 0) return { color: C.gold, label: `Còn ${diff} ngày`, pulse: false };
  }
  return null;
}

export { getAlertLevel };

const PRIO_ORDER = ["cao","trung","thap","none"];

export const TaskRow = memo(function TaskRow({ task, onPress, onStatusChange, onPriorityChange, onAdjust, onPatchTask, timerTick, handSide, projectName }) {
  const wf = WORKFLOWS.find(w => w.id === task.workflow);
  const over = isOverdue(task);
  const alert = getAlertLevel(task);
  const isDone = task.status === "done";
  const statusColor = STATUSES[task.status]?.color || C.muted;
  const prioColor = PRIORITIES[task.priority]?.color || C.muted;
  const pct = wf ? Math.round(((task.step + 1) / wf.steps.length) * 100) : null;
  const elapsed = getElapsed(task);
  const [showStatus, setShowStatus] = useState(false);
  const [showPrio, setShowPrio] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editNoteId, setEditNoteId] = useState(null);
  const [editNoteText, setEditNoteText] = useState("");
  const [newNote, setNewNote] = useState("");

  const subtasks = task.subtasks || [];
  const notes = Array.isArray(task.notes) ? task.notes : [];
  const expense = task.expense || {};
  const hasDetails = subtasks.length > 0 || notes.length > 0 || expense.amount > 0;

  const patchExpense = (data) => onPatchTask?.(task.id, { expense: { ...expense, ...data } });

  const updateNotes = (newNotes) => onPatchTask?.(task.id, { notes: newNotes });
  const cycleNoteStatus = (n) => {
    const next = n.status === "pending" ? "doing" : n.status === "doing" ? "done" : "pending";
    updateNotes(notes.map(x => x.id === n.id ? { ...x, status: next } : x));
  };
  const toggleNotePrio = (n) => {
    updateNotes(notes.map(x => x.id === n.id ? { ...x, priority: x.priority === "high" ? "normal" : "high" } : x));
  };
  const deleteNote = (id) => updateNotes(notes.filter(x => x.id !== id));
  const saveEditNote = (id) => {
    if (!editNoteText.trim()) { deleteNote(id); setEditNoteId(null); return; }
    updateNotes(notes.map(x => x.id === id ? { ...x, text: editNoteText.trim() } : x));
    setEditNoteId(null);
  };
  const addNote = () => {
    if (!newNote.trim()) return;
    updateNotes([...notes, { id: Date.now(), text: newNote.trim(), status: "pending", priority: "normal" }]);
    setNewNote("");
  };

  const openQR = (e) => {
    e.stopPropagation();
    const amt = expense.amount || 0;
    const desc = encodeURIComponent(task.title?.slice(0, 25) || "Thanh toan");
    const src = expense.source?.replace("bank_", "") || "970436";
    const url = `https://img.vietqr.io/image/${src}-0-compact2.png?amount=${amt}&addInfo=${desc}`;
    window.open(url, "_blank");
  };

  const handleStatusTap = (e) => { e.preventDefault(); e.stopPropagation(); setShowStatus(v => !v); setShowPrio(false); };
  const handleStatusSelect = (e, s) => { e.preventDefault(); e.stopPropagation(); setShowStatus(false); onStatusChange?.(task, s); };
  const handlePrioTap = (e) => { e.preventDefault(); e.stopPropagation(); setShowPrio(v => !v); setShowStatus(false); };
  const handlePrioSelect = (e, p) => { e.preventDefault(); e.stopPropagation(); setShowPrio(false); onPriorityChange?.(task, p); };

  const toggleExpand = (e) => { e.stopPropagation(); setExpanded(v => !v); };

  const isLeft = (handSide || "right") === "right";
  const barRadiusTop = isLeft ? "12px 0 0 0" : "0 12px 0 0";
  const barRadiusBot = isLeft ? (expanded ? "0" : "0 0 0 12px") : (expanded ? "0" : "0 0 12px 0");
  const dropSide = isLeft ? { left:"calc(100% + 4px)" } : { right:"calc(100% + 4px)" };

  const sideBar = (
    <div style={{ width:56, flexShrink:0, display:"flex", flexDirection:"column" }}>
      <div style={{ position:"relative", flex:"0 0 auto", background:statusColor, borderRadius:barRadiusTop, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", padding:"4px 2px", opacity: isDone ? 0.4 : 1 }}
        onClick={e => { e.stopPropagation(); handleStatusTap(e); }}
        onTouchEnd={e => { e.stopPropagation(); handleStatusTap(e); }}>
        <span style={{ fontSize:9, fontWeight:700, color:"#fff", textAlign:"center", lineHeight:1.1, textShadow:"0 1px 2px rgba(0,0,0,.25)" }}>
          {STATUSES[task.status]?.label}
        </span>
        {showStatus && (
          <>
            <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, zIndex:99, background:"rgba(0,0,0,.2)" }}
              onClick={e => { e.stopPropagation(); setShowStatus(false); }}
              onTouchEnd={e => { e.stopPropagation(); setShowStatus(false); }} />
            <div style={{ position:"absolute", top:0, ...dropSide, background:"#fff", borderRadius:14, boxShadow:"0 8px 32px rgba(0,0,0,.22)", zIndex:100, padding:8, minWidth:160, animation:"fadeIn .15s", border:"1px solid rgba(0,0,0,.08)" }}>
              {STATUS_ORDER.map(s => (
                <div key={s} className="tap"
                  onClick={e => handleStatusSelect(e, s)}
                  onTouchEnd={e => handleStatusSelect(e, s)}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, background: task.status === s ? STATUSES[s].color : "#fff", fontSize:14, fontWeight:600, color: task.status === s ? "#fff" : STATUSES[s].color }}>
                  {STATUSES[s].label}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div style={{ position:"relative", flex:1, background:prioColor, borderRadius:barRadiusBot, display:"flex", alignItems:"center", justifyContent:"center", gap:4, cursor:"pointer", padding:"3px 2px", opacity: isDone ? 0.4 : 1 }}
        onClick={e => { e.stopPropagation(); handlePrioTap(e); }}
        onTouchEnd={e => { e.stopPropagation(); handlePrioTap(e); }}>
        <span style={{ fontSize:9, fontWeight:700, color:"#fff", textAlign:"center", lineHeight:1.3, whiteSpace:"pre-line", textShadow:"0 1px 2px rgba(0,0,0,.25)" }}>
          {PRIORITIES[task.priority]?.label}
        </span>
        {showPrio && (
          <>
            <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, zIndex:99, background:"rgba(0,0,0,.2)" }}
              onClick={e => { e.stopPropagation(); setShowPrio(false); }}
              onTouchEnd={e => { e.stopPropagation(); setShowPrio(false); }} />
            <div style={{ position:"absolute", top:0, ...dropSide, background:"#fff", borderRadius:14, boxShadow:"0 8px 32px rgba(0,0,0,.22)", zIndex:100, padding:8, minWidth:190, animation:"fadeIn .15s", border:"1px solid rgba(0,0,0,.08)" }}>
              {PRIO_ORDER.map(p => (
                <div key={p} className="tap"
                  onClick={e => handlePrioSelect(e, p)}
                  onTouchEnd={e => handlePrioSelect(e, p)}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, background: task.priority === p ? PRIORITIES[p].color : "#fff", fontSize:14, fontWeight:600, color: task.priority === p ? "#fff" : PRIORITIES[p].color }}>
                  {PRIORITIES[p].label.replace("\n", ", ")}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  const content = (
    <div style={{ flex:1, minWidth:0, overflow:"hidden" }}>
      <div className="tap" onClick={toggleExpand} onDoubleClick={onPress}
        style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 8px" }}>
        {/* Left: title + tags */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, lineHeight:1.3, textDecoration: isDone ? "line-through" : "none", color: isDone ? C.muted : C.text }}>{task.title}</div>
          <div style={{ display:"flex", gap:4, marginTop:3, flexWrap:"wrap", alignItems:"center" }}>
            {task.category && <span style={{ background:`${C.muted}18`, color:C.muted, borderRadius:20, padding:"1px 6px", fontSize:8, fontWeight:500 }}>{task.category}</span>}
            {task.startTime && <span style={{ background:`${C.accent}18`, color:C.accent, borderRadius:20, padding:"1px 6px", fontSize:8, fontWeight:500 }}>{task.startTime}{task.duration ? ` - ${task.duration}ph` : ""}</span>}
            {task.deadline && <span style={{ background:`${over ? C.red : C.muted}18`, color: over ? C.red : C.muted, borderRadius:20, padding:"1px 6px", fontSize:8, fontWeight:500 }}>{over ? "! " : ""}{fmtDD(task.deadline)}</span>}
            {task.originalDeadline && <span style={{ background:`${C.red}12`, color:C.red, borderRadius:20, padding:"1px 6px", fontSize:8, fontWeight:500 }}>từ {fmtDD(task.originalDeadline)}</span>}
            {task.assignee && <span style={{ background:`${C.purple}18`, color:C.purple, borderRadius:20, padding:"1px 6px", fontSize:8, fontWeight:500 }}>{task.assignee}</span>}
            {projectName && <span style={{ background:`${C.accent}15`, color:C.accent, borderRadius:20, padding:"1px 6px", fontSize:8, fontWeight:600 }}>📁 {projectName}</span>}
            {task.timerState === "running" && <span style={{ background:`${C.green}18`, color:C.green, borderRadius:20, padding:"1px 6px", fontSize:8, fontWeight:500 }}>{formatTimer(elapsed)}</span>}
            {task.timerState === "paused" && elapsed > 0 && <span style={{ background:`${C.gold}18`, color:C.gold, borderRadius:20, padding:"1px 6px", fontSize:8, fontWeight:500 }}>{formatTimer(elapsed)}</span>}
          </div>
          {wf && (
            <div style={{ marginTop:6 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                <span style={{ fontSize:10, color:C.muted }}>{wf.name}</span>
                <span style={{ fontSize:10, color:C.accent, fontWeight:600 }}>{pct}%</span>
              </div>
              <div style={{ height:3, background:C.border, borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${C.accent},${C.purple})`, borderRadius:2, transition:"width .3s" }} />
              </div>
            </div>
          )}
        </div>
        {/* Right: Wory mic — add details via voice */}
        <div style={{ flexShrink:0, width:28, display:"flex", alignItems:"center", justifyContent:"center" }}>
          {!isDone && <span className="tap" onClick={e => { e.stopPropagation(); onAdjust?.(task); }}
            style={{ width:24, height:24, borderRadius:"50%", background:`${C.purple}10`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", border:`1.5px solid ${C.purple}33` }}
            title="Thêm chi tiết bằng giọng nói">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.purple} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </span>}
        </div>
      </div>

      {/* ── EXPANDED INLINE DETAILS ── */}
      {expanded && (
        <div onClick={e => e.stopPropagation()} style={{ padding:"0 12px 10px", borderTop:`1px solid ${C.border}22`, animation:"fadeIn .15s" }}>
          {/* Subtasks */}
          {subtasks.length > 0 && (
            <div style={{ marginTop:8 }}>
              <div style={{ fontSize:10, color:C.muted, fontWeight:600, marginBottom:4 }}>DANH SÁCH CON ({subtasks.filter(s=>s.done).length}/{subtasks.length})</div>
              {subtasks.map((s, i) => (
                <div key={s.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"3px 0" }}>
                  <span style={{ fontSize:10, color: s.done ? C.green : C.muted, fontWeight:600, width:14 }}>{s.done ? "✓" : `${i+1}`}</span>
                  <span style={{ fontSize:12, color: s.done ? C.muted : C.text, textDecoration: s.done ? "line-through" : "none" }}>{s.title}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Interactive Notes ── */}
          <div style={{ marginTop:8 }}>
            <div style={{ fontSize:10, color:C.muted, fontWeight:600, marginBottom:4 }}>GHI CHÚ ({notes.length})</div>
            {notes.map(n => {
              const nColor = n.status === "done" ? C.green : n.status === "doing" ? C.accent : C.gold;
              const isEditing = editNoteId === n.id;
              return (
                <div key={n.id} style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 0", borderBottom:`1px solid ${C.border}15` }}>
                  {/* Status dot — click to cycle */}
                  <div className="tap" onClick={() => cycleNoteStatus(n)}
                    style={{ width:10, height:10, borderRadius:"50%", background:nColor, flexShrink:0, cursor:"pointer", border:`2px solid ${nColor}44` }}
                    title={n.status === "pending" ? "Chờ" : n.status === "doing" ? "Đang làm" : "Xong"} />
                  {/* Text — click to edit */}
                  {isEditing ? (
                    <input autoFocus value={editNoteText} onChange={e => setEditNoteText(e.target.value)}
                      onBlur={() => saveEditNote(n.id)} onKeyDown={e => { if (e.key === "Enter") saveEditNote(n.id); if (e.key === "Escape") setEditNoteId(null); }}
                      style={{ flex:1, fontSize:12, border:`1px solid ${C.accent}`, borderRadius:4, padding:"2px 6px", outline:"none", color:C.text, background:C.bg }} />
                  ) : (
                    <span className="tap" onClick={() => { setEditNoteId(n.id); setEditNoteText(n.text); }}
                      style={{ flex:1, fontSize:12, color: n.status === "done" ? C.muted : C.text, textDecoration: n.status === "done" ? "line-through" : "none", cursor:"pointer" }}>
                      {n.priority === "high" && <span style={{ color:C.red, fontWeight:700, marginRight:2 }}>!</span>}
                      {n.text}
                    </span>
                  )}
                  {/* Call button if phone number detected */}
                  {(() => { const ph = n.text.match(/(\+?\d[\d\s\-.]{7,}\d)/); return ph ? (
                    <a href={`tel:${ph[1].replace(/[\s\-.]/g, "")}`} onClick={e => e.stopPropagation()}
                      style={{ fontSize:14, color:C.green, cursor:"pointer", padding:"0 2px", textDecoration:"none" }}
                      title={`Gọi ${ph[1]}`}>📞</a>
                  ) : null; })()}
                  {/* Priority toggle */}
                  <span className="tap" onClick={() => toggleNotePrio(n)}
                    style={{ fontSize:11, color: n.priority === "high" ? C.red : C.muted, cursor:"pointer", fontWeight:700, padding:"0 2px", opacity: n.priority === "high" ? 1 : 0.5 }}
                    title="Ưu tiên">!</span>
                  {/* Delete */}
                  <span className="tap" onClick={() => deleteNote(n.id)}
                    style={{ fontSize:12, color:C.muted, cursor:"pointer", padding:"0 2px", opacity:0.5 }}
                    title="Xóa">×</span>
                </div>
              );
            })}
            {/* Add note input */}
            <div style={{ display:"flex", gap:4, marginTop:4, alignItems:"center" }}>
              <input value={newNote} onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addNote(); }}
                placeholder="+ Thêm ghi chú hoặc SĐT..."
                style={{ flex:1, fontSize:11, border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 8px", outline:"none", color:C.text, background:C.bg }} />
              <span className="tap" onClick={addNote}
                style={{ fontSize:16, color: newNote.trim() ? C.accent : C.muted, fontWeight:700, cursor:"pointer", padding:"2px 8px", background:`${C.accent}15`, borderRadius:6 }}>+</span>
            </div>
          </div>

          {/* ── Inline Expense editing ── */}
          <div style={{ marginTop:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
              <span style={{ fontSize:10, color:C.muted, fontWeight:600 }}>CHI TIÊU</span>
              <span className="tap" onClick={() => { if (!expense.amount) patchExpense({ amount: 0, description: "" }); }}
                style={{ fontSize:10, padding:"1px 6px", borderRadius:4, background:C.goldD, color:C.gold, fontWeight:700, cursor:"pointer" }}>+ Thêm</span>
            </div>
            {/* Amount + reason on same row */}
            <div style={{ display:"flex", gap:4, alignItems:"center", marginBottom:4 }}>
              <input value={expense.description || ""} onChange={e => patchExpense({ description: e.target.value })}
                placeholder="Lý do..." style={{ flex:2, fontSize:11, border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 8px", outline:"none", background:C.bg, color:C.text, minWidth:0 }} />
              <input type="number" value={expense.amount || ""} onChange={e => patchExpense({ amount: Number(e.target.value) || 0 })}
                placeholder="Số tiền" style={{ flex:1, fontSize:12, fontWeight:700, color:C.gold, border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 6px", outline:"none", background:C.bg, minWidth:0 }} />
              <span style={{ fontSize:10, color:C.muted, flexShrink:0 }}>đ</span>
              <span className="tap" onClick={openQR}
                style={{ width:24, height:24, borderRadius:"50%", background:`${C.accent}12`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", border:`1.5px solid ${C.accent}44`, flexShrink:0 }}
                title="QR thanh toán">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2">
                  <rect x="2" y="2" width="7" height="7" rx="1"/><rect x="15" y="2" width="7" height="7" rx="1"/><rect x="2" y="15" width="7" height="7" rx="1"/>
                  <rect x="4.5" y="4.5" width="2" height="2" fill={C.accent} stroke="none"/><rect x="17.5" y="4.5" width="2" height="2" fill={C.accent} stroke="none"/><rect x="4.5" y="17.5" width="2" height="2" fill={C.accent} stroke="none"/>
                  <path d="M15 15h2v2h-2zM19 15h2v2h-2zM15 19h2v2h-2zM19 19h2v2h-2zM17 17h2v2h-2z" fill={C.accent} stroke="none"/>
                </svg>
              </span>
            </div>
            {/* Source + paid */}
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <select value={expense.source || ""} onChange={e => patchExpense({ source: e.target.value })}
                style={{ flex:1, fontSize:11, border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 6px", color:C.text, background:C.bg, outline:"none" }}>
                <option value="">Nguồn...</option>
                {Object.entries(PAYMENT_SOURCES).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
              <span className="tap" onClick={() => patchExpense({ paid: !expense.paid })}
                style={{ fontSize:10, fontWeight:700, padding:"4px 10px", borderRadius:8, cursor:"pointer",
                  background: expense.paid ? C.greenD : C.bg, color: expense.paid ? C.green : C.muted,
                  border: `1px solid ${expense.paid ? C.green + "44" : C.border}` }}>
                {expense.paid ? "✓ Đã chi" : "Chưa chi"}
              </span>
            </div>
          </div>

        </div>
      )}
    </div>
  );

  return (
    <div className={`card${over ? " overdue-pulse" : ""}`} role="button" tabIndex={0}
      style={{ display:"flex", flexDirection: isLeft ? "row" : "row-reverse", borderTop: isDone ? `2px solid ${C.border}` : `2px solid ${over ? C.red : prioColor}`, opacity: isDone ? 0.5 : 1, padding:0 }}>
      {sideBar}
      {content}
    </div>
  );
});

/* -- UserMenu -- */
const DEV_ROLES = [
  { id: "trinh", name: "Nguyen Duy Trinh", role: "dev",     title: "Developer",     color: "#9b59b6" },
  { id: "lien",  name: "Lientran",         role: "admin",   title: "Giám đốc",      color: "#e74c3c" },
  { id: "hung",  name: "Pham Van Hung",    role: "manager", title: "Quản lý dự án", color: "#3498db" },
  { id: "mai",   name: "Tran Thi Mai",     role: "staff",   title: "Nhân viên",     color: "#27ae60" },
  { id: "duc",   name: "Le Minh Duc",      role: "staff",   title: "Nhân viên",     color: "#8e44ad" },
];
const ROLE_LABELS = { dev: "DEV", admin: "AD", manager: "QL", staff: "NV" };
const ROLE_COLORS = { dev: "#9b59b6", admin: "#e74c3c", manager: "#c8956c", staff: "#27ae60" };

function switchToAccount(acc) {
  localStorage.setItem("wf_session", JSON.stringify({ id: acc.id, name: acc.name, role: acc.role, title: acc.title, loginAt: Date.now() }));
  const settingsKey = `wf_${acc.id}_settings`;
  try {
    const s = JSON.parse(localStorage.getItem(settingsKey) || "{}");
    s.userRole = acc.role === "staff" ? "staff" : "manager"; // dev/admin/manager all use manager UI
    s.displayName = s.displayName || acc.name;
    localStorage.setItem(settingsKey, JSON.stringify(s));
  } catch {}
  window.location.reload();
}

export function UserMenu({ user, onLogout, onSettings }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, [open]);

  const initials = (user.name || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const currentDev = DEV_ROLES.find(a => a.id === user.id);
  const roleColor = currentDev ? ROLE_COLORS[currentDev.role] : C.accent;
  const roleLabel = currentDev ? ROLE_LABELS[currentDev.role] : null;

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <button className="tap" onClick={() => setOpen(!open)} aria-label="Menu người dùng"
        style={{ width:36, height:36, borderRadius:"50%", background:roleColor, color:"#fff", border:"none", fontSize:14, fontWeight:700, position:"relative" }}>
        {initials}
        {roleLabel && (
          <span style={{ position:"absolute", bottom:-3, right:-3, fontSize:8, fontWeight:800, background:"#fff", color:roleColor, border:`1.5px solid ${roleColor}`, borderRadius:6, padding:"0 3px", lineHeight:"14px" }}>
            {roleLabel}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position:"absolute", left:0, top:42, background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:0, minWidth:240, zIndex:999, boxShadow:"0 8px 24px rgba(0,0,0,.3)", overflow:"hidden" }}>
          {/* Current user info */}
          <div style={{ padding:"12px 14px", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ fontSize:15, fontWeight:600, color:C.text, marginBottom:2 }}>{user.name}</div>
            <div style={{ fontSize:12, color:roleColor, fontWeight:700 }}>{currentDev?.title || user.id}</div>
          </div>

          {/* Actions */}
          <div style={{ padding:"8px 10px", borderBottom:`1px solid ${C.border}`, display:"flex", gap:6 }}>
            <button className="tap" onClick={() => { setOpen(false); onSettings(); }}
              style={{ flex:1, padding:"8px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:13, textAlign:"center" }}>
              Cài đặt
            </button>
            <button className="tap" onClick={() => { setOpen(false); onLogout(); }}
              style={{ padding:"8px 14px", background:"#e74c3c12", border:"1px solid #e74c3c33", borderRadius:8, color:"#e74c3c", fontSize:13 }}>
              Thoát
            </button>
          </div>

          {/* Dev role switcher */}
          <div style={{ padding:"6px 10px 4px", fontSize:9, fontWeight:700, color:C.muted, letterSpacing:.5 }}>CHUYỂN VAI TRÒ (DEV)</div>
          {DEV_ROLES.map(acc => {
            const isCurrent = acc.id === user.id;
            return (
              <button key={acc.id} className="tap" onClick={() => { if (!isCurrent) { setOpen(false); switchToAccount(acc); } }}
                style={{
                  width:"100%", display:"flex", alignItems:"center", gap:8,
                  padding:"8px 10px", background: isCurrent ? `${acc.color}10` : "transparent",
                  border:"none", cursor: isCurrent ? "default" : "pointer",
                }}>
                <div style={{
                  width:26, height:26, borderRadius:"50%", background:acc.color,
                  color:"#fff", fontSize:11, fontWeight:700,
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                  border: isCurrent ? "2px solid #fff" : "none",
                  boxShadow: isCurrent ? `0 0 0 1.5px ${acc.color}` : "none",
                }}>
                  {acc.name.charAt(0)}
                </div>
                <div style={{ flex:1, textAlign:"left", minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight: isCurrent ? 700 : 500, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {acc.name.split(" ").pop()}
                  </div>
                </div>
                <span style={{ fontSize:9, color:acc.color, fontWeight:700 }}>{ROLE_LABELS[acc.role]}</span>
                {isCurrent && <span style={{ fontSize:9, color:acc.color }}>●</span>}
              </button>
            );
          })}
          <div style={{ height:6 }} />
        </div>
      )}
    </div>
  );
}

// Dev role switcher panel (used as a tab)
export function DevRoleSwitcher({ currentUserId }) {
  return (
    <div style={{ animation:"fadeIn .2s" }}>
      <div style={{ fontSize:12, fontWeight:700, color:C.muted, marginBottom:10, letterSpacing:.5, textAlign:"center" }}>CHUYỂN TÀI KHOẢN (DEV)</div>
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {DEV_ROLES.map(acc => {
          const isCurrent = acc.id === currentUserId;
          return (
            <button key={acc.id} className="tap" onClick={() => { if (!isCurrent) switchToAccount(acc); }}
              style={{
                display:"flex", alignItems:"center", gap:12, padding:"12px 14px",
                background: isCurrent ? `${acc.color}12` : C.card,
                border: isCurrent ? `2px solid ${acc.color}` : `1px solid ${C.border}`,
                borderRadius:14, cursor: isCurrent ? "default" : "pointer",
              }}>
              <div style={{
                width:40, height:40, borderRadius:"50%", background:acc.color,
                color:"#fff", fontSize:16, fontWeight:700,
                display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
              }}>
                {acc.name.charAt(0)}
              </div>
              <div style={{ flex:1, textAlign:"left" }}>
                <div style={{ fontSize:14, fontWeight:700, color:C.text }}>
                  {acc.name}
                  {isCurrent && <span style={{ fontSize:10, color:acc.color, marginLeft:6, fontWeight:600 }}>hiện tại</span>}
                </div>
                <div style={{ fontSize:11, color:acc.color, fontWeight:700 }}>{ROLE_LABELS[acc.role]} · {acc.title}</div>
              </div>
              <div style={{ fontSize:10, color:C.muted, textAlign:"right" }}>
                <div>{acc.role === "admin" ? "Toàn quyền" : acc.role === "manager" ? "Quản lý" : "Thực thi"}</div>
                <div style={{ fontSize:9 }}>MK: 111111</div>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize:10, color:C.muted, textAlign:"center", marginTop:12, lineHeight:1.6 }}>
        Mỗi tài khoản có dữ liệu riêng biệt.<br/>
        Trong thực tế, vai trò do Admin cài đặt.
      </div>
    </div>
  );
}

/* -- Undo Toast -- */
export function UndoToast({ toast, onUndo }) {
  if (!toast) return null;
  return (
    <div className="undo-toast" role="alert" aria-live="polite">
      <span style={{ flex:1, fontSize:14 }}>Đã xóa "{toast.title}"</span>
      <button className="tap" onClick={onUndo}>Hoàn tác</button>
    </div>
  );
}

/* -- MdBlock (markdown renderer) -- */
export function MdBlock({ text }) {
  if (!text) return null;
  const blocks = text.split(/(```[\s\S]*?```)/g);
  return (<>
    {blocks.map((block, bi) => {
      if (block.startsWith("```")) {
        const lines = block.split("\n");
        const lang = lines[0].replace("```","").trim();
        const code = lines.slice(1,-1).join("\n");
        return (
          <div key={bi} style={{ position:"relative", margin:"8px 0" }}>
            {lang && <div style={{ fontSize:11, color:C.muted, marginBottom:2, fontFamily:"monospace" }}>{lang}</div>}
            <pre style={{ background:"#1e1e2e", color:"#cdd6f4", borderRadius:10, padding:"12px 14px", fontSize:13, overflowX:"auto", margin:0, lineHeight:1.5, fontFamily:"'Consolas','Monaco',monospace" }}>
              <code>{code}</code>
            </pre>
          </div>
        );
      }
      return block.split("\n").map((line, li) => {
        const key = `${bi}-${li}`;
        if (!line.trim()) return <div key={key} style={{ height:6 }} />;
        if (/^#{1,3}\s/.test(line)) {
          const lv = line.match(/^(#+)/)[1].length;
          return <div key={key} style={{ fontSize:lv===1?18:lv===2?16:15, fontWeight:700, margin:"8px 0 4px" }}>{inlineMd(line.replace(/^#+\s/,""))}</div>;
        }
        if (/^[-*]\s/.test(line)) {
          return <div key={key} style={{ paddingLeft:14, position:"relative", margin:"2px 0" }}><span style={{ position:"absolute", left:0 }}>-</span>{inlineMd(line.slice(2))}</div>;
        }
        if (/^\d+\.\s/.test(line)) {
          const num = line.match(/^(\d+)\./)[1];
          return <div key={key} style={{ paddingLeft:18, position:"relative", margin:"2px 0" }}><span style={{ position:"absolute", left:0, fontWeight:600 }}>{num}.</span>{inlineMd(line.replace(/^\d+\.\s/,""))}</div>;
        }
        return <div key={key} style={{ margin:"1px 0" }}>{inlineMd(line)}</div>;
      });
    })}
  </>);
}

/* -- Confirm Dialog -- */
export function ConfirmDialog({ title, message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" style={{ zIndex:10000, alignItems:"center", justifyContent:"center" }} role="alertdialog" aria-modal="true" aria-label={title}>
      <div onClick={e => e.stopPropagation()} style={{ background:C.surface, borderRadius:20, padding:"24px", maxWidth:340, width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:8 }}>{title}</div>
        <div style={{ fontSize:14, color:C.sub, marginBottom:20, lineHeight:1.5 }}>{message}</div>
        <div style={{ display:"flex", gap:10 }}>
          <button className="tap" onClick={onCancel} style={{ flex:1, background:C.card, color:C.sub, border:`1px solid ${C.border}`, borderRadius:12, padding:"12px", fontSize:14 }}>Hủy</button>
          <button className="tap" onClick={onConfirm} style={{ flex:1, background:C.red, color:"#fff", border:"none", borderRadius:12, padding:"12px", fontSize:14, fontWeight:700 }}>Xác nhận</button>
        </div>
      </div>
    </div>
  );
}
