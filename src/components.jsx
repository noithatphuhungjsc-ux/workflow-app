/* ================================================================
   COMPONENTS — Small reusable UI components
   ================================================================ */
import { useState, useRef, useEffect, memo, Component } from "react";
import { C, PRIORITIES, STATUSES, STATUS_ORDER, WORKFLOWS, EXPENSE_CATEGORIES, PAYMENT_SOURCES, getElapsed, formatTimer, isOverdue, todayStr, fmtMoney, fmtDD, TEAM_ACCOUNTS } from "./constants";
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

/* -- Empty state (enhanced) -- */
export function Empty({ icon = "📋", title = "Không có công việc nào", subtitle, action, onAction }) {
  return (
    <div style={{ textAlign:"center", padding:"48px 24px", color:C.muted, animation:"scaleIn .3s ease" }}>
      <div style={{ fontSize:44, marginBottom:8, filter:"grayscale(.3)", opacity:.7 }}>{icon}</div>
      <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:4 }}>{title}</div>
      {subtitle && <div style={{ fontSize:12, color:C.sub, marginBottom:14, lineHeight:1.5 }}>{subtitle}</div>}
      {action && onAction && (
        <button className="tap" onClick={onAction} style={{ background:C.accent, color:"#fff", border:"none", borderRadius:10, padding:"10px 20px", fontSize:13, fontWeight:700 }}>
          {action}
        </button>
      )}
    </div>
  );
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

/* -- Filter chips (simplified: 3 status + all) -- */
export function Filters({ filter, setFilter, pendingDeleteCount }) {
  const pills = [["all","Tat ca"],["todo","Can lam"],["inprogress","Dang lam"],["done","Xong"]];
  if (pendingDeleteCount > 0) pills.push(["pending_delete", `Cho xoa`]);
  return (
    <div className="no-scrollbar" style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:2 }}>
      {pills.map(([k,l]) => (
        <button key={k} className="tap" onClick={() => setFilter(k)}
          style={{ flexShrink:0, background: filter===k ? (k==="pending_delete" ? C.red : C.accent) : C.card, color: filter===k ? "#fff" : (k==="pending_delete" ? C.red : C.sub), border:`1px solid ${filter===k ? (k==="pending_delete" ? C.red : C.accent) : (k==="pending_delete" ? C.red+"44" : C.border)}`, borderRadius:20, padding:"6px 14px", fontSize:13, fontWeight:600 }}>
          {l}
          {k === "pending_delete" && pendingDeleteCount > 0 && <span style={{ marginLeft:4, fontSize:11, fontWeight:700 }}>({pendingDeleteCount})</span>}
        </button>
      ))}
    </div>
  );
}

/* -- Project filter (dropdown + actions on one row) -- */
export function ProjectFilters({ projects, filter, setFilter, onAdd, onOpen, onDeleteAll, isStaff, myName }) {
  // Staff: only show projects they're a member of
  const staffFiltered = isStaff && myName
    ? projects.filter(p => (p.members || []).some(m => m.name === myName))
    : projects;
  const activeProjects = staffFiltered.filter(p => !p.archived);
  const archivedProjects = staffFiltered.filter(p => p.archived);
  const allProjects = [...activeProjects, ...archivedProjects];
  if (!allProjects.length && !onAdd) return null;
  const selectedProject = allProjects.find(p => p.id === filter);
  const selColor = selectedProject?.color || C.accent;

  return (
    <div style={{ display:"flex", gap:8, marginBottom:10, alignItems:"center" }}>
      {/* Project dropdown */}
      <div style={{ position:"relative", flex:1, minWidth:0 }}>
        <select value={filter} onChange={e => {
            const v = e.target.value;
            if (v === "__open__") { if (selectedProject) onOpen?.(selectedProject); e.target.value = filter; return; }
            setFilter(v === "all" ? "all" : v === "standalone" ? "standalone" : Number(v) || v);
          }}
          style={{ width:"100%", height:36, padding:"0 32px 0 12px", fontSize:13, fontWeight:600,
            borderRadius:10, border:`1px solid ${filter !== "all" && filter !== "standalone" ? selColor + "66" : C.border}`,
            background: filter !== "all" && filter !== "standalone" ? selColor + "10" : C.card,
            color: filter !== "all" && filter !== "standalone" ? selColor : C.text,
            appearance:"none", WebkitAppearance:"none", cursor:"pointer", boxSizing:"border-box" }}>
          <option value="all">📂 Tất cả dự án</option>
          <option value="standalone">📋 Việc chung</option>
          {activeProjects.map(p => <option key={p.id} value={p.id}>● {p.name}</option>)}
          {archivedProjects.length > 0 && <option disabled>── Đã lưu trữ ──</option>}
          {archivedProjects.map(p => <option key={p.id} value={p.id}>📦 {p.name}</option>)}
          {selectedProject && <option value="__open__">⚙ Chi tiết dự án...</option>}
        </select>
        <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", fontSize:12, color:C.muted, pointerEvents:"none" }}>▼</span>
      </div>

      {/* Actions */}
      {onAdd && !isStaff && (
        <button className="tap" onClick={onAdd}
          style={{ width:36, height:36, borderRadius:10, background:C.accentD, color:C.accent, border:`1px solid ${C.accent}33`,
            fontSize:18, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>+</button>
      )}
      {selectedProject && onOpen && (
        <button className="tap" onClick={() => onOpen(selectedProject)}
          style={{ height:36, borderRadius:10, border:`1px solid ${selColor}44`, background:selColor+"12",
            color:selColor, fontSize:12, fontWeight:600, padding:"0 12px", cursor:"pointer", flexShrink:0, whiteSpace:"nowrap" }}>Chi tiết</button>
      )}
      {onDeleteAll && !isStaff && allProjects.length > 0 && (
        <button className="tap" onClick={onDeleteAll}
          style={{ height:36, borderRadius:10, border:`1px solid ${C.red}33`, background:C.redD,
            color:C.red, fontSize:12, fontWeight:600, padding:"0 10px", cursor:"pointer", flexShrink:0 }}>Xóa</button>
      )}
    </div>
  );
}

/* -- TaskRow (simplified — tap to open detail, clean minimal card) -- */
function getAlertLevel(task) {
  if (task.status === "done") return null;
  const today = todayStr();
  if (isOverdue(task)) return { color: C.red, label: "Qua han", pulse: true };
  if (task.deadline === today) return { color: "#e67e22", label: "Hom nay", pulse: true };
  if (task.deadline) {
    const d = new Date(task.deadline);
    const t = new Date(today);
    const diff = Math.round((d - t) / 86400000);
    if (diff === 1) return { color: C.gold, label: "Ngay mai", pulse: false };
    if (diff <= 3 && diff > 0) return { color: C.gold, label: `Con ${diff} ngay`, pulse: false };
  }
  return null;
}

export { getAlertLevel };

export const TaskRow = memo(function TaskRow({ task, onPress, onStatusChange, onPatchTask, timerTick, projectName }) {
  const over = isOverdue(task);
  const alert = getAlertLevel(task);
  const isDone = task.status === "done";
  const statusColor = STATUSES[task.status]?.color || C.muted;
  const prioColor = PRIORITIES[task.priority]?.color || C.muted;
  const elapsed = getElapsed(task);
  const subtasks = task.subtasks || [];
  const subDone = subtasks.filter(s => s.done).length;
  const expense = task.expense || {};

  /* Quick-done: tap checkbox */
  const toggleDone = (e) => {
    e.stopPropagation();
    onStatusChange?.(task, isDone ? "todo" : "done");
  };

  return (
    <div className={`card${over && !isDone ? " overdue-pulse" : ""}`} role="button" tabIndex={0}
      onClick={onPress}
      style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 12px", opacity: isDone ? 0.55 : 1, borderLeft:`3px solid ${isDone ? C.green : over ? C.red : prioColor}`, cursor:"pointer" }}>

      {/* Checkbox */}
      <div className="tap" onClick={toggleDone}
        style={{ width:22, height:22, borderRadius:6, flexShrink:0, marginTop:1,
          border: isDone ? "none" : `2px solid ${statusColor}`,
          background: isDone ? C.green : "transparent",
          display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s" }}>
        {isDone && <span style={{ color:"#fff", fontSize:14, fontWeight:700, lineHeight:1 }}>&#x2713;</span>}
      </div>

      {/* Content */}
      <div style={{ flex:1, minWidth:0 }}>
        {/* Title */}
        <div style={{ fontSize:15, fontWeight:600, lineHeight:1.35, color: isDone ? C.muted : C.text, textDecoration: isDone ? "line-through" : "none" }}>
          {task.title}
        </div>

        {/* Meta line — max 2-3 key info */}
        <div style={{ display:"flex", gap:6, marginTop:4, flexWrap:"wrap", alignItems:"center" }}>
          {task.deadline && (
            <span style={{ fontSize:11, color: over ? C.red : C.muted, fontWeight: over ? 700 : 500 }}>
              {over ? "! " : ""}{fmtDD(task.deadline)}
            </span>
          )}
          {task.assignee && (
            <span style={{ fontSize:11, color:C.purple, fontWeight:500 }}>{task.assignee}</span>
          )}
          {projectName && (
            <span style={{ fontSize:11, color:C.accent, fontWeight:500 }}>{projectName}</span>
          )}
          {alert && !over && (
            <span style={{ fontSize:11, color:alert.color, fontWeight:600 }}>{alert.label}</span>
          )}
          {task.timerState === "running" && (
            <span style={{ fontSize:11, color:C.green, fontWeight:600 }}>{formatTimer(elapsed)}</span>
          )}
          {expense.amount > 0 && (
            <span style={{ fontSize:11, color:C.gold, fontWeight:600 }}>{fmtMoney(expense.amount)}</span>
          )}
        </div>

        {/* Delete request info */}
        {task.deleteRequest?.status === "pending" && (
          <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:4, padding:"3px 8px", borderRadius:6, background:"#e74c3c10", border:"1px solid #e74c3c22" }}>
            <span style={{ fontSize:11, color:"#e74c3c", fontWeight:600 }}>🗑 {task.deleteRequest.by || "NV"} yêu cầu xóa</span>
            {task.deleteRequest.at && <span style={{ fontSize:10, color:C.muted }}> · {new Date(task.deleteRequest.at).toLocaleDateString("vi-VN")}</span>}
          </div>
        )}

        {/* Subtask progress bar */}
        {subtasks.length > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:5 }}>
            <div style={{ flex:1, height:3, background:C.border, borderRadius:2, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${Math.round(subDone/subtasks.length*100)}%`, background:C.green, borderRadius:2, transition:"width .3s" }} />
            </div>
            <span style={{ fontSize:10, color:C.muted, fontWeight:600, flexShrink:0 }}>{subDone}/{subtasks.length}</span>
          </div>
        )}
      </div>

      {/* Status badge (small, right side) */}
      {!isDone && (
        <span style={{ fontSize:11, fontWeight:700, color:statusColor, background:`${statusColor}15`, borderRadius:6, padding:"2px 8px", flexShrink:0, marginTop:2 }}>
          {STATUSES[task.status]?.label}
        </span>
      )}
    </div>
  );
});

/* -- UserMenu -- */
const DEV_ROLES = TEAM_ACCOUNTS;
const ROLE_LABELS = { dev: "DEV", admin: "AD", manager: "QL", staff: "NV" };
const ROLE_COLORS = { dev: "#9b59b6", admin: "#e74c3c", manager: "#c8956c", staff: "#27ae60" };

async function switchToAccount(acc) {
  // Sign out Supabase so auto-login re-triggers for new user
  try {
    const { supabase } = await import("./lib/supabase");
    if (supabase) await supabase.auth.signOut({ scope: "local" });
  } catch {}
  localStorage.setItem("wf_session", JSON.stringify({ id: acc.id, name: acc.name, email: acc.email || "", phone: acc.phone || "", role: acc.role, title: acc.title, loginAt: Date.now() }));
  const settingsKey = `wf_${acc.id}_settings`;
  try {
    const s = JSON.parse(localStorage.getItem(settingsKey) || "{}");
    s.userRole = acc.role === "director" ? "director" : "staff";
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

          {/* Dev role switcher — only for dev role */}
          {currentDev?.role === "director" && <>
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
          </>}
        </div>
      )}
    </div>
  );
}

/* DevRoleSwitcher removed — dev-only feature now only in UserMenu with ?dev */

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

/* -- Skeleton loading shimmer -- */
function SkeletonBar({ w = "100%", h = 12, r = 6, mb = 6 }) {
  return <div style={{ width:w, height:h, borderRadius:r, marginBottom:mb, background:"linear-gradient(90deg,#f0eeea 25%,#e8e5de 50%,#f0eeea 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.5s infinite" }} />;
}
export function Skeleton({ rows = 4 }) {
  return (
    <div style={{ padding:"12px 14px", animation:"fadeIn .2s" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ background:"#fff", borderRadius:14, padding:"14px 12px", border:`1px solid ${C.border}`, marginBottom:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <SkeletonBar w={20} h={20} r={6} mb={0} />
            <div style={{ flex:1 }}>
              <SkeletonBar w="70%" h={13} />
              <SkeletonBar w="40%" h={10} />
            </div>
            <SkeletonBar w={40} h={20} r={10} mb={0} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* -- Toast notification (success/error/info) -- */
export function Toast({ message, type = "success", onClose }) {
  const colors = { success: C.green, error: C.red, info: C.accent };
  const icons = { success: "✓", error: "✕", info: "ℹ" };
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{
      position:"fixed", bottom:76, left:"50%", transform:"translateX(-50%)", zIndex:9000,
      background:"#2b2d35", color:"#fff", borderRadius:12, padding:"10px 16px",
      display:"flex", alignItems:"center", gap:10, maxWidth:360, minWidth:200,
      boxShadow:"0 8px 32px rgba(0,0,0,.25)", animation:"slideUp .25s ease",
    }} role="alert">
      <span style={{ width:22, height:22, borderRadius:"50%", background:colors[type], color:"#fff", fontSize:12, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{icons[type]}</span>
      <span style={{ fontSize:13, flex:1 }}>{message}</span>
    </div>
  );
}

/* -- LazyImage (IntersectionObserver) -- */
export function LazyImage({ src, alt = "", style = {}, ...props }) {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } }, { rootMargin:"100px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ position:"relative", background:"#f0eeea", borderRadius:8, overflow:"hidden", minHeight:60, ...style }}>
      {!loaded && <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", color:C.muted, fontSize:16 }}>📷</div>}
      {inView && <img src={src} alt={alt} onLoad={() => setLoaded(true)} style={{ width:"100%", display:"block", borderRadius:8, opacity:loaded?1:0, transition:"opacity .3s" }} {...props} />}
    </div>
  );
}

/* -- Confirm Dialog -- */
/* -- TabErrorBoundary — inline error fallback for lazy tabs -- */
export class TabErrorBoundary extends Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(e, info) { console.error("TabError:", e, info); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>😵</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>Tab gặp lỗi</div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>
          {String(this.state.error?.message || "").slice(0, 120)}
        </div>
        <button className="tap" onClick={() => this.setState({ hasError: false, error: null })}
          style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 10, padding: "8px 20px", fontSize: 13, fontWeight: 700 }}>
          Thử lại
        </button>
      </div>
    );
  }
}

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
