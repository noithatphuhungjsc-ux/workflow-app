/* ================================================================
   TASK SHEET — Full screen task detail
   Features: expense, bill photo, QR payment, notes as bullets
   ================================================================ */
import { useState, useRef, useCallback } from "react";
import { C, PRIORITIES, STATUSES, WORKFLOWS, EXPENSE_CATEGORIES, getElapsed, formatTimer, fmtMoney } from "../constants";
import { ConfirmDialog, LazyImage } from "../components";
import { useTasks, useSettings } from "../store";

const IS = { background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px", color:C.text, fontSize:14, width:"100%" };
const NOTE_STATUSES = [
  { id: "pending", label: "Chờ", color: C.gold },
  { id: "doing", label: "Đang", color: C.accent },
  { id: "done", label: "Xong", color: C.green },
];
const NOTE_PRIOS = [
  { id: "normal", label: "Thường", color: C.muted },
  { id: "high", label: "Quan trọng", color: C.red },
];

function ExpenseItemRow({ item, index, isLast, onPatch, onDelete }) {
  const [desc, setDesc] = useState(item.desc || "");
  const [amt, setAmt] = useState(item.amount ? String(item.amount) : "");
  return (
    <div style={{ padding:"6px 0", borderBottom: !isLast ? `1px solid ${C.border}22` : "none" }}>
      <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:4 }}>
        <span style={{ fontSize:11, color:C.muted, fontWeight:600, width:16, textAlign:"center", flexShrink:0 }}>{index + 1}</span>
        <input type="text" value={desc} onChange={e => setDesc(e.target.value)}
          onBlur={() => onPatch({ desc })} placeholder="Lý do chi tiêu..."
          style={{ ...IS, fontSize:12, flex:1, padding:"5px 8px" }} />
        <button className="tap" onClick={onDelete} style={{ background:"none", border:"none", fontSize:12, color:C.muted, padding:"2px 4px", opacity:0.5 }}>✕</button>
      </div>
      <div style={{ display:"flex", gap:6, alignItems:"center", paddingLeft:22 }}>
        <input type="text" inputMode="numeric" value={amt}
          onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ""); setAmt(v); }}
          onBlur={() => onPatch({ amount: Number(amt) || 0 })}
          placeholder="Số tiền" style={{ ...IS, fontSize:12, padding:"5px 8px", width:100, flex:"none" }} />
        <select value={item.category || "work"} onChange={e => onPatch({ category: e.target.value })}
          style={{ ...IS, fontSize:11, padding:"5px 6px", flex:1 }}>
          {Object.entries(CATS).map(([k, c]) => <option key={k} value={k}>{c.icon} {c.label}</option>)}
        </select>
        <button className="tap" onClick={() => onPatch({ paid: !item.paid })}
          style={{ width:24, height:24, borderRadius:6, border:`2px solid ${item.paid ? C.green : C.border}`, background: item.paid ? C.green : "transparent",
            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:"#fff", fontSize:11, fontWeight:700 }}>
          {item.paid && "✓"}
        </button>
      </div>
    </div>
  );
}

export default function TaskSheet({ task, onClose }) {
  const { patchTask, deleteTask, timerStart, timerPause, timerResume, timerDone, timerTick } = useTasks();
  const { settings } = useSettings();
  const CATS = settings.industryExpenseCategories || EXPENSE_CATEGORIES;
  const [confirmDel, setConfirmDel] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [subsOpen, setSubsOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [editingNote, setEditingNote] = useState(null);
  const [editNoteText, setEditNoteText] = useState("");
  const [ocrLoading, setOcrLoading] = useState(null); // photo id being scanned
  const [ocrResult, setOcrResult] = useState(null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  const subtasks = task.subtasks || [];
  const notes = Array.isArray(task.notes) ? task.notes : [];

  // ── PROJECT TASK: simplified layout ──
  if (task.projectId) {
    const statusColor = STATUSES[task.status]?.color || C.muted;
    const addSub = () => { const t = newSub.trim(); if (!t) return; patchTask(task.id, { subtasks: [...subtasks, { id: Date.now(), title: t, done: false }] }); setNewSub(""); };
    const toggleSub = (sid) => patchTask(task.id, { subtasks: subtasks.map(s => s.id === sid ? { ...s, done: !s.done } : s) });
    const deleteSub = (sid) => patchTask(task.id, { subtasks: subtasks.filter(s => s.id !== sid) });

    return (
      <div style={{ position:"fixed", inset:0, background:C.bg, zIndex:1000, display:"flex", flexDirection:"column", animation:"fadeIn .2s" }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderBottom:`3px solid ${statusColor}`, flexShrink:0 }}>
          <button className="tap" onClick={onClose} style={{ background:"none", border:"none", fontSize:20, color:C.muted, padding:"2px 6px", lineHeight:1 }}>&larr;</button>
          <div style={{ flex:1, fontSize:15, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{task.title}</div>
          <span style={{ fontSize:10, padding:"3px 8px", borderRadius:6, background:`${statusColor}18`, color:statusColor, fontWeight:700 }}>
            {STATUSES[task.status]?.label || task.status}
          </span>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"12px 14px 20px", display:"flex", flexDirection:"column", gap:12 }}>

          {/* Title edit */}
          <input defaultValue={task.title} onChange={e => patchTask(task.id, { title: e.target.value })}
            style={{ ...IS, fontSize:16, fontWeight:600 }} placeholder="Tên công việc..." />

          {/* Status + Assignee */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>TRẠNG THÁI</div>
              <select value={task.status} onChange={e => patchTask(task.id, { status: e.target.value })}
                style={{ ...IS, color:statusColor, fontWeight:600 }}>
                {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>GIAO CHO</div>
              <select value={task.assignee || ""} onChange={e => patchTask(task.id, { assignee: e.target.value })}
                style={{ ...IS, color: task.assignee ? C.text : C.muted }}>
                <option value="">— Chưa giao —</option>
                <option value="Nguyen Duy Trinh">Nguyen Duy Trinh (Dev)</option>
                <option value="Lientran">Lientran (GĐ)</option>
                <option value="Pham Van Hung">Pham Van Hung (QL)</option>
                <option value="Tran Thi Mai">Tran Thi Mai (NV)</option>
                <option value="Le Minh Duc">Le Minh Duc (NV)</option>
              </select>
            </div>
          </div>

          {/* Deadline */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>DEADLINE</div>
              <input type="date" defaultValue={task.deadline || ""} onChange={e => patchTask(task.id, { deadline: e.target.value })} style={IS} />
            </div>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>ƯU TIÊN</div>
              <select value={task.priority} onChange={e => patchTask(task.id, { priority: e.target.value })}
                style={{ ...IS, color: PRIORITIES[task.priority]?.color || C.muted, fontWeight:600 }}>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          {/* Subtasks */}
          <div>
            <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:6 }}>
              CHECKLIST {subtasks.length > 0 ? `(${subtasks.filter(s=>s.done).length}/${subtasks.length})` : ""}
            </div>
            <div style={{ background:C.card, borderRadius:10, border:`1px solid ${C.border}`, padding:"8px 10px" }}>
              {subtasks.length > 0 && (
                <div style={{ height:3, background:C.border, borderRadius:2, marginBottom:8, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${Math.round(subtasks.filter(s=>s.done).length / subtasks.length * 100)}%`, background:C.green, borderRadius:2, transition:"width .3s" }} />
                </div>
              )}
              {subtasks.map((s, i) => (
                <div key={s.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom: i < subtasks.length - 1 ? `1px solid ${C.border}22` : "none" }}>
                  <button className="tap" onClick={() => toggleSub(s.id)}
                    style={{ width:20, height:20, borderRadius:5, border:`2px solid ${s.done ? C.green : C.border}`, background: s.done ? C.green : "transparent",
                      display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:"#fff", fontSize:12 }}>
                    {s.done && "✓"}
                  </button>
                  <div style={{ flex:1, fontSize:13, color: s.done ? C.muted : C.text, textDecoration: s.done ? "line-through" : "none" }}>{s.title}</div>
                  <button className="tap" onClick={() => deleteSub(s.id)} style={{ background:"none", border:"none", fontSize:12, color:C.muted, padding:"2px 4px", opacity:0.5 }}>✕</button>
                </div>
              ))}
              <div style={{ display:"flex", gap:6, marginTop: subtasks.length > 0 ? 6 : 0 }}>
                <input value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addSub(); }}
                  placeholder="Thêm mục..." style={{ ...IS, fontSize:12, flex:1, padding:"6px 10px" }} />
                <button className="tap" onClick={addSub} disabled={!newSub.trim()}
                  style={{ background: newSub.trim() ? C.accent : C.border, color:"#fff", border:"none", borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:700 }}>+</button>
              </div>
            </div>
          </div>

          {/* Simple description */}
          <div>
            <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:3 }}>MÔ TẢ</div>
            <textarea defaultValue={task.description || ""} onChange={e => patchTask(task.id, { description: e.target.value })}
              placeholder="Ghi chú thêm về công việc..."
              rows={3} style={{ ...IS, resize:"vertical", minHeight:60, fontSize:13, lineHeight:1.5 }} />
          </div>

        </div>
      </div>
    );
  }

  // ── PERSONAL TASK: full layout (below) ──
  const wf = WORKFLOWS.find(w => w.id === task.workflow);
  const expense = task.expense || {};
  // Migrate old single-expense to items array
  const expenseItems = expense.items || (expense.amount > 0 ? [{ id: 1, desc: expense.description || "", amount: expense.amount, category: expense.category || "work", paid: !!expense.paid }] : []);
  const expenseTotal = expenseItems.reduce((s, e) => s + (e.amount || 0), 0);
  const billPhotos = task.billPhotos || [];

  // Subtask actions
  const addSub = () => {
    const t = newSub.trim(); if (!t) return;
    patchTask(task.id, { subtasks: [...subtasks, { id: Date.now(), title: t, done: false }] });
    setNewSub("");
  };
  const toggleSub = (sid) => patchTask(task.id, { subtasks: subtasks.map(s => s.id === sid ? { ...s, done: !s.done } : s) });
  const deleteSub = (sid) => patchTask(task.id, { subtasks: subtasks.filter(s => s.id !== sid) });

  // Note actions (structured bullets)
  const addNote = () => {
    const t = newNote.trim(); if (!t) return;
    patchTask(task.id, { notes: [...notes, { id: Date.now(), text: t, status: "pending", priority: "normal" }] });
    setNewNote("");
  };
  const deleteNote = (nid) => patchTask(task.id, { notes: notes.filter(n => n.id !== nid) });
  const patchNote = (nid, data) => patchTask(task.id, { notes: notes.map(n => n.id === nid ? { ...n, ...data } : n) });
  const startEditNote = (n) => { setEditingNote(n.id); setEditNoteText(n.text); };
  const saveEditNote = (nid) => { patchNote(nid, { text: editNoteText }); setEditingNote(null); };

  // Expense item actions
  const saveExpenseItems = (items) => {
    const total = items.reduce((s, e) => s + (e.amount || 0), 0);
    const allPaid = items.length > 0 && items.every(e => e.paid);
    patchTask(task.id, { expense: { ...expense, items, amount: total, paid: allPaid, category: items[0]?.category || "other" } });
  };
  const addExpenseItem = () => saveExpenseItems([...expenseItems, { id: Date.now(), desc: "", amount: 0, category: "work", paid: false }]);
  const deleteExpenseItem = (eid) => saveExpenseItems(expenseItems.filter(e => e.id !== eid));
  const patchExpenseItem = (eid, data) => saveExpenseItems(expenseItems.map(e => e.id === eid ? { ...e, ...data } : e));

  // Bill photo — compress & store as data URL
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
        // Re-compress if still too large (>400KB)
        if (dataUrl.length > 400000) dataUrl = canvas.toDataURL("image/jpeg", 0.4);
        patchTask(task.id, { billPhotos: [...billPhotos, { id: Date.now(), data: dataUrl, ts: new Date().toISOString() }] });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };
  const deleteBillPhoto = (pid) => patchTask(task.id, { billPhotos: billPhotos.filter(p => p.id !== pid) });

  // OCR — scan bill photo with AI
  const scanBillPhoto = useCallback(async (photo) => {
    setOcrLoading(photo.id);
    setOcrResult(null);
    try {
      const base64 = photo.data.split(",")[1];
      const mediaType = photo.data.startsWith("data:image/png") ? "image/png" : "image/jpeg";
      const catKeys = Object.keys(CATS);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: `Bạn là AI đọc hóa đơn. Trả về JSON duy nhất, KHÔNG markdown, KHÔNG giải thích. Format: {"amount":number,"description":"string","items":[{"desc":"string","amount":number}]}. amount là tổng tiền (VND, bỏ dấu chấm/phẩy). items là danh sách từng mục nếu có. Nếu không đọc được thì trả {"amount":0,"description":"Không đọc được","items":[]}.`,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: `Đọc hóa đơn này. Trích xuất tổng tiền và mô tả. Danh mục phù hợp: ${catKeys.join(", ")}. Trả JSON.` }
            ]
          }],
          max_tokens: 500,
        }),
      });
      const data = await res.json();
      const text = data?.content?.[0]?.text || "";
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setOcrResult(parsed);
        // Auto-fill expense if we got valid data
        if (parsed.amount > 0) {
          const expense = task.expense || {};
          const items = expense.items || [];
          if (parsed.items?.length > 0) {
            const newItems = parsed.items.map((it, idx) => ({
              id: Date.now() + idx, desc: it.desc || "", amount: it.amount || 0,
              category: "other", paid: false,
            }));
            patchTask(task.id, { expense: { ...expense, amount: parsed.amount, description: parsed.description || "", items: [...items, ...newItems] } });
          } else {
            patchTask(task.id, { expense: { ...expense, amount: parsed.amount, description: parsed.description || expense.description || "" } });
          }
        }
      }
    } catch (err) {
      setOcrResult({ error: "Lỗi quét: " + (err.message || "Thử lại") });
    } finally {
      setOcrLoading(null);
    }
  }, [task, patchTask, CATS]);

  // QR Payment — generate VietQR URL
  const generateQR = () => {
    const amt = expense.amount || 0;
    if (!amt) return null;
    // VietQR format: bank code + account number + amount + description
    // This opens the user's banking app via deep link
    const desc = encodeURIComponent(task.title?.slice(0, 25) || "Thanh toan");
    return `https://img.vietqr.io/image/970436-0-compact.png?amount=${amt}&addInfo=${desc}`;
  };

  const elapsed = getElapsed(task);
  const statusColor = STATUSES[task.status]?.color || C.muted;
  const prioColor = PRIORITIES[task.priority]?.color || C.muted;
  const handleDelete = () => {
    if (window.confirm(`Xóa "${task.title}"?`)) {
      deleteTask(task.id);
      onClose();
    }
  };

  const SectionHeader = ({ label, count, open, onToggle, extra }) => (
    <div className="tap" onClick={onToggle} style={{ display:"flex", alignItems:"center", marginBottom:6, cursor:"pointer" }}>
      <div style={{ fontSize:11, color:C.muted, fontWeight:600 }}>{label} {count ? `(${count})` : ""}</div>
      <span style={{ marginLeft:6, fontSize:10, color:C.muted, transform: open ? "rotate(90deg)" : "none", transition:"transform .2s" }}>▶</span>
      <div style={{ flex:1 }} />
      {extra}
    </div>
  );

  return (
    <>
      <div style={{ position:"fixed", inset:0, background:C.bg, zIndex:1000, display:"flex", flexDirection:"column", animation:"fadeIn .2s" }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderBottom:`3px solid ${statusColor}`, flexShrink:0 }}>
          <button className="tap" onClick={onClose} aria-label="Đóng"
            style={{ background:"none", border:"none", fontSize:20, color:C.muted, padding:"2px 6px", lineHeight:1 }}>&larr;</button>
          <div style={{ flex:1, fontSize:15, fontWeight:700, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{task.title}</div>
          {expenseTotal > 0 && <span style={{ fontSize:12, fontWeight:700, color:C.gold, background:C.goldD, borderRadius:8, padding:"2px 8px" }}>{fmtMoney(expenseTotal)}</span>}
          <button className="tap" onClick={handleDelete}
            style={{ background:C.redD, border:`1px solid ${C.red}44`, borderRadius:8, padding:"4px 10px", fontSize:11, color:C.red, fontWeight:600, flexShrink:0 }}>Xóa</button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto", padding:"10px 14px 20px", display:"flex", flexDirection:"column", gap:10 }}>

          {/* 1. Title */}
          <input defaultValue={task.title} onChange={e => patchTask(task.id, { title: e.target.value })}
            style={{ ...IS, fontSize:16, fontWeight:600 }} placeholder="Tên công việc..." />

          {/* 2. Status + Priority */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>TRẠNG THÁI</div>
              <select value={task.status} onChange={e => patchTask(task.id, { status: e.target.value })}
                style={{ ...IS, color:statusColor, fontWeight:600 }}>
                {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>ƯU TIÊN</div>
              <select value={task.priority} onChange={e => patchTask(task.id, { priority: e.target.value })}
                style={{ ...IS, color:prioColor, fontWeight:600 }}>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          {/* 3. Deadline + Time + Duration */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>DEADLINE</div>
              <input type="date" defaultValue={task.deadline || ""} onChange={e => patchTask(task.id, { deadline: e.target.value })} style={IS} />
            </div>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>GIỜ</div>
              <input type="time" defaultValue={task.startTime || ""} onChange={e => patchTask(task.id, { startTime: e.target.value })} style={IS} />
            </div>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>PHÚT</div>
              <input type="number" defaultValue={task.duration || ""} onChange={e => patchTask(task.id, { duration: Number(e.target.value) })}
                placeholder="60" min="5" max="480" style={IS} />
            </div>
          </div>

          {/* 4. Subtasks / Checklist */}
          <SectionHeader label="DANH SÁCH CON" count={subtasks.length > 0 ? `${subtasks.filter(s=>s.done).length}/${subtasks.length}` : ""} open={subsOpen} onToggle={() => setSubsOpen(v => !v)} />

          {subsOpen && (
            <div style={{ background:C.card, borderRadius:10, border:`1px solid ${C.border}`, padding:"8px 10px" }}>
              {subtasks.length > 0 && (
                <div style={{ height:3, background:C.border, borderRadius:2, marginBottom:8, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${Math.round(subtasks.filter(s=>s.done).length / subtasks.length * 100)}%`, background:C.green, borderRadius:2, transition:"width .3s" }} />
                </div>
              )}
              {subtasks.map((s, i) => (
                <div key={s.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom: i < subtasks.length - 1 ? `1px solid ${C.border}22` : "none" }}>
                  <span style={{ fontSize:11, color:C.muted, fontWeight:600, width:16, textAlign:"center", flexShrink:0 }}>{i+1}</span>
                  <button className="tap" onClick={() => toggleSub(s.id)}
                    style={{ width:20, height:20, borderRadius:5, border:`2px solid ${s.done ? C.green : C.border}`, background: s.done ? C.green : "transparent",
                      display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:"#fff", fontSize:12, fontWeight:700, lineHeight:1 }}>
                    {s.done && "✓"}
                  </button>
                  <div style={{ flex:1, fontSize:13, color: s.done ? C.muted : C.text, textDecoration: s.done ? "line-through" : "none", fontWeight: s.done ? 400 : 500 }}>{s.title}</div>
                  <button className="tap" onClick={() => deleteSub(s.id)} style={{ background:"none", border:"none", fontSize:12, color:C.muted, padding:"2px 4px", opacity:0.5 }}>✕</button>
                </div>
              ))}
              <div style={{ display:"flex", gap:6, marginTop: subtasks.length > 0 ? 6 : 0 }}>
                <input value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addSub(); }}
                  placeholder="Thêm mục con..." style={{ ...IS, fontSize:12, flex:1, padding:"6px 10px" }} />
                <button className="tap" onClick={addSub} disabled={!newSub.trim()}
                  style={{ background: newSub.trim() ? C.accent : C.border, color:"#fff", border:"none", borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:700 }}>+</button>
              </div>
            </div>
          )}

          {/* 5. Timer */}
          <div style={{ display:"flex", alignItems:"center", gap:10, background:C.card, borderRadius:10, border:`1px solid ${C.border}`, padding:"8px 12px" }}>
            <div style={{ fontSize:22, fontWeight:800, fontFamily:"monospace", color: task.timerState === "running" ? C.accent : C.text, letterSpacing:1, flex:1 }}>{formatTimer(elapsed)}</div>
            {(!task.timerState || task.timerState === "idle") && task.status !== "done" && (
              <button className="tap" onClick={() => timerStart(task.id)} style={{ background:C.green, color:"#fff", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700 }}>Bắt đầu</button>
            )}
            {task.timerState === "running" && (<>
              <button className="tap" onClick={() => timerPause(task.id)} style={{ background:C.gold, color:"#fff", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700 }}>Dừng</button>
              <button className="tap" onClick={() => timerDone(task.id)} style={{ background:C.green, color:"#fff", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700 }}>Xong</button>
            </>)}
            {task.timerState === "paused" && (<>
              <button className="tap" onClick={() => timerResume(task.id)} style={{ background:C.accent, color:"#fff", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700 }}>Tiếp</button>
              <button className="tap" onClick={() => timerDone(task.id)} style={{ background:C.green, color:"#fff", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700 }}>Xong</button>
            </>)}
          </div>

          {/* 6. Notes */}
          <SectionHeader label="GHI CHÚ" count={notes.length || ""} open={notesOpen} onToggle={() => setNotesOpen(v => !v)}
            extra={notes.length > 0 && <button className="tap" onClick={(e) => { e.stopPropagation(); patchTask(task.id, { notes: [] }); }}
              style={{ background:"none", border:"none", fontSize:10, color:C.red }}>Xóa hết</button>} />

          {notesOpen && (
            <div style={{ background:C.card, borderRadius:10, border:`1px solid ${C.border}`, padding:"8px 10px" }}>
              {notes.map((n, i) => {
                const nStatus = NOTE_STATUSES.find(s => s.id === n.status) || NOTE_STATUSES[0];
                const nPrio = NOTE_PRIOS.find(p => p.id === n.priority) || NOTE_PRIOS[0];
                const isEditing = editingNote === n.id;
                return (
                  <div key={n.id} style={{ display:"flex", alignItems:"flex-start", gap:6, padding:"6px 0", borderBottom: i < notes.length - 1 ? `1px solid ${C.border}22` : "none" }}>
                    {/* Status dot — tap to cycle */}
                    <button className="tap" onClick={() => {
                      const idx = NOTE_STATUSES.findIndex(s => s.id === n.status);
                      patchNote(n.id, { status: NOTE_STATUSES[(idx + 1) % NOTE_STATUSES.length].id });
                    }}
                      style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${nStatus.color}`, background: n.status === "done" ? nStatus.color : "transparent",
                        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1, color:"#fff", fontSize:10, fontWeight:700 }}>
                      {n.status === "done" && "✓"}
                    </button>

                    <div style={{ flex:1, minWidth:0 }}>
                      {isEditing ? (
                        <div style={{ display:"flex", gap:4 }}>
                          <input value={editNoteText} onChange={e => setEditNoteText(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") saveEditNote(n.id); }}
                            style={{ ...IS, fontSize:12, flex:1, padding:"4px 8px" }} autoFocus />
                          <button className="tap" onClick={() => saveEditNote(n.id)}
                            style={{ background:C.green, color:"#fff", border:"none", borderRadius:6, padding:"4px 8px", fontSize:11, fontWeight:700 }}>✓</button>
                        </div>
                      ) : (
                        <div style={{ fontSize:13, color: n.status === "done" ? C.muted : C.text, textDecoration: n.status === "done" ? "line-through" : "none",
                          fontWeight: n.priority === "high" ? 600 : 400, lineHeight:1.4 }}>
                          {n.priority === "high" && <span style={{ color:C.red, fontSize:10, marginRight:3 }}>!</span>}
                          {n.text}
                        </div>
                      )}
                      {/* Mini controls */}
                      {!isEditing && (
                        <div style={{ display:"flex", gap:4, marginTop:3 }}>
                          <span style={{ fontSize:9, color:nStatus.color, fontWeight:600, background:nStatus.color + "18", borderRadius:6, padding:"1px 6px" }}>{nStatus.label}</span>
                          <button className="tap" onClick={() => patchNote(n.id, { priority: n.priority === "high" ? "normal" : "high" })}
                            style={{ fontSize:9, fontWeight:600, color: n.priority === "high" ? C.red : C.muted, background: n.priority === "high" ? C.redD : "transparent",
                              borderRadius:6, padding:"1px 6px", border:"none" }}>
                            {n.priority === "high" ? "Quan trọng" : "Thường"}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {!isEditing && (
                      <div style={{ display:"flex", gap:2, flexShrink:0 }}>
                        <button className="tap" onClick={() => startEditNote(n)} style={{ background:"none", border:"none", fontSize:11, color:C.accent, padding:"2px 4px" }}>✎</button>
                        <button className="tap" onClick={() => deleteNote(n.id)} style={{ background:"none", border:"none", fontSize:11, color:C.muted, padding:"2px 4px", opacity:0.5 }}>✕</button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add new note */}
              <div style={{ display:"flex", gap:6, marginTop: notes.length > 0 ? 6 : 0 }}>
                <input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addNote(); }}
                  placeholder="Thêm ghi chú..." style={{ ...IS, fontSize:12, flex:1, padding:"6px 10px" }} />
                <button className="tap" onClick={addNote} disabled={!newNote.trim()}
                  style={{ background: newNote.trim() ? C.accent : C.border, color:"#fff", border:"none", borderRadius:8, padding:"6px 12px", fontSize:12, fontWeight:700 }}>+</button>
              </div>
            </div>
          )}

          {/* 7. Expense — multi-item list */}
          <div style={{ display:"flex", alignItems:"center", marginBottom:4 }}>
            <div style={{ fontSize:11, color:C.muted, fontWeight:600 }}>CHI TIÊU {expenseTotal > 0 ? `(${fmtMoney(expenseTotal)})` : ""}</div>
            <div style={{ flex:1 }} />
            <button className="tap" onClick={addExpenseItem}
              style={{ background:C.accent, color:"#fff", border:"none", borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:700 }}>+ Thêm</button>
          </div>
          <div style={{ background:C.card, borderRadius:10, border:`1px solid ${C.border}`, padding:"8px 10px" }}>
            {expenseItems.length === 0 && (
              <div style={{ fontSize:12, color:C.muted, textAlign:"center", padding:"8px 0" }}>Chưa có chi tiêu. Bấm "+ Thêm" để tạo.</div>
            )}
            {expenseItems.map((item, i) => (
              <ExpenseItemRow key={item.id} item={item} index={i} isLast={i === expenseItems.length - 1}
                onPatch={(data) => patchExpenseItem(item.id, data)} onDelete={() => deleteExpenseItem(item.id)} />
            ))}
            {expenseTotal > 0 && (
              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8, paddingTop:6, borderTop:`1px solid ${C.border}` }}>
                <button className="tap" onClick={() => {
                  const url = generateQR();
                  if (url) window.open(url, "_blank");
                }} style={{ background:C.accent, color:"#fff", border:"none", borderRadius:8, padding:"4px 10px", fontSize:11, fontWeight:700 }}>
                  QR Thanh toán
                </button>
                <div style={{ flex:1 }} />
                <span style={{ fontSize:13, fontWeight:700, color:C.gold }}>Tổng: {fmtMoney(expenseTotal)}</span>
              </div>
            )}
          </div>

          {/* 8. Bill Photos — always visible */}
          <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>ẢNH HÓA ĐƠN {billPhotos.length > 0 ? `(${billPhotos.length})` : ""}</div>
          <div style={{ background:C.card, borderRadius:10, border:`1px solid ${C.border}`, padding:"8px 10px" }}>
            {billPhotos.length > 0 && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:6, marginBottom:8 }}>
                {billPhotos.map(p => (
                  <div key={p.id} style={{ position:"relative", borderRadius:8, overflow:"hidden", border:`1px solid ${C.border}` }}>
                    <LazyImage src={p.data} alt="bill" />
                    <button className="tap" onClick={() => deleteBillPhoto(p.id)}
                      style={{ position:"absolute", top:2, right:2, background:"rgba(0,0,0,0.6)", color:"#fff", border:"none", borderRadius:"50%", width:20, height:20, fontSize:11, lineHeight:1, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                    <button className="tap" onClick={() => scanBillPhoto(p)} disabled={ocrLoading === p.id}
                      style={{ position:"absolute", bottom:2, left:2, right:2, background:"rgba(0,0,0,0.7)", color:"#fff", border:"none", borderRadius:6, padding:"4px 0", fontSize:10, fontWeight:600, cursor:"pointer" }}>
                      {ocrLoading === p.id ? "Đang quét..." : "🔍 AI Quét"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display:"flex", gap:8 }}>
              <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => handleBillPhoto(e.target.files[0])} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={e => handleBillPhoto(e.target.files[0])} />
              <button className="tap" onClick={() => fileRef.current?.click()}
                style={{ flex:1, background:C.card, border:`1px dashed ${C.border}`, borderRadius:8, padding:"8px 0", fontSize:12, color:C.muted, fontWeight:600 }}>📁 Chọn ảnh</button>
              <button className="tap" onClick={() => cameraRef.current?.click()}
                style={{ flex:1, background:C.card, border:`1px dashed ${C.border}`, borderRadius:8, padding:"8px 0", fontSize:12, color:C.muted, fontWeight:600 }}>📷 Chụp ảnh</button>
            </div>
            {ocrResult && !ocrResult.error && (
              <div style={{ marginTop:8, background:C.accentD, borderRadius:8, border:`1px solid ${C.accent}44`, padding:"8px 10px" }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.accent, marginBottom:4 }}>KẾT QUẢ QUÉT</div>
                {ocrResult.description && <div style={{ fontSize:12, color:C.text, marginBottom:2 }}>{ocrResult.description}</div>}
                {ocrResult.amount > 0 && <div style={{ fontSize:14, fontWeight:700, color:C.gold }}>{fmtMoney(ocrResult.amount)}</div>}
                {ocrResult.items?.length > 0 && (
                  <div style={{ marginTop:4 }}>
                    {ocrResult.items.map((it, i) => (
                      <div key={i} style={{ fontSize:11, color:C.sub, display:"flex", justifyContent:"space-between" }}>
                        <span>{it.desc}</span><span style={{ fontWeight:600 }}>{fmtMoney(it.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>Đã tự động điền vào chi tiêu</div>
              </div>
            )}
            {ocrResult?.error && (
              <div style={{ marginTop:8, fontSize:11, color:C.red, background:C.redD, borderRadius:8, padding:"6px 10px" }}>{ocrResult.error}</div>
            )}
          </div>

          {/* 9. Category + Workflow */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>DANH MỤC</div>
              <input defaultValue={task.category || ""} onChange={e => patchTask(task.id, { category: e.target.value })}
                placeholder="Nhập danh mục..." style={IS} />
            </div>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:3 }}>QUY TRÌNH</div>
              <select value={task.workflow || ""} onChange={e => patchTask(task.id, { workflow: e.target.value })} style={IS}>
                <option value="">Không</option>
                {WORKFLOWS.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
              </select>
            </div>
          </div>

          {/* Workflow steps */}
          {wf && (
            <div style={{ background:C.card, borderRadius:10, border:`1px solid ${C.border}`, padding:"8px 10px" }}>
              <div style={{ fontSize:10, color:C.muted, fontWeight:600, marginBottom:6 }}>CÁC BƯỚC: {wf.label}</div>
              {wf.steps.map((step, i) => {
                const stepDone = (task.workflowStep || 0) > i;
                const isCurrent = (task.workflowStep || 0) === i;
                return (
                  <div key={i} className="tap" onClick={() => patchTask(task.id, { workflowStep: i + 1 })}
                    style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", cursor:"pointer",
                      borderBottom: i < wf.steps.length - 1 ? `1px solid ${C.border}22` : "none" }}>
                    <div style={{ width:20, height:20, borderRadius:"50%", border:`2px solid ${stepDone ? C.green : isCurrent ? C.accent : C.border}`,
                      background: stepDone ? C.green : "transparent", display:"flex", alignItems:"center", justifyContent:"center",
                      color:"#fff", fontSize:10, fontWeight:700, flexShrink:0 }}>
                      {stepDone ? "✓" : i + 1}
                    </div>
                    <span style={{ fontSize:12, color: stepDone ? C.muted : isCurrent ? C.accent : C.text,
                      textDecoration: stepDone ? "line-through" : "none", fontWeight: isCurrent ? 600 : 400 }}>{step}</span>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>

    </>
  );
}
