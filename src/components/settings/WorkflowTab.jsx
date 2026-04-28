/* ================================================================
   WorkflowTab — Quản lý quy trình toàn công ty (Đợt 2)
   - Đọc/ghi từ Supabase: workflow_templates + workflow_steps + departments
   - Mỗi bước có dropdown chọn phòng ban
   - Hiển thị bước gom theo phòng ban (collapse-friendly)
   - Director CRUD; staff read-only (RLS server-side)
   ================================================================ */
import { useState, useRef } from "react";
import { C } from "../../constants";
import { useWorkflows, useDepartments } from "../../hooks/useWorkflows";

/* ── Workflow card: hiển thị template + steps gom theo phòng ban ── */
function WorkflowCard({ wf, departments, onEdit, onDelete, isDirector }) {
  const [open, setOpen] = useState(false);
  // Group steps by department, preserve sort_order
  const byDept = (departments || []).map(d => ({
    dept: d,
    steps: (wf.steps || []).filter(s => s.department_id === d.id).sort((a,b) => a.sort_order - b.sort_order),
  })).filter(g => g.steps.length > 0);
  const orphanSteps = (wf.steps || []).filter(s => !s.department_id);

  return (
    <div style={{ marginBottom:6, background:C.card, borderRadius:10, border:`1px solid ${C.border}`, overflow:"hidden" }}>
      <div className="tap" onClick={() => setOpen(o => !o)}
        style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", cursor:"pointer" }}>
        <span style={{ fontSize:14, transition:"transform .2s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        <span style={{ fontSize:18 }}>{wf.icon || "📋"}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{wf.name}</div>
          <div style={{ fontSize:10, color:C.muted }}>
            {(wf.steps || []).length} bước · {byDept.length} phòng ban tham gia
          </div>
        </div>
        {isDirector && <>
          <span className="tap" onClick={e => { e.stopPropagation(); onEdit(); }} style={{ fontSize:11, color:C.accent, cursor:"pointer", padding:"2px 6px" }}>Sửa</span>
          <span className="tap" onClick={e => { e.stopPropagation(); onDelete(); }} style={{ fontSize:11, color:C.red, cursor:"pointer", padding:"2px 6px" }}>Xoá</span>
        </>}
      </div>
      {open && (
        <div style={{ padding:"4px 12px 12px", borderTop:`1px solid ${C.border}` }}>
          {wf.description && <div style={{ fontSize:11, color:C.muted, fontStyle:"italic", marginBottom:8, paddingTop:6 }}>{wf.description}</div>}
          {byDept.map(g => (
            <div key={g.dept.id} style={{ marginBottom:8 }}>
              <div style={{ fontSize:11, fontWeight:700, color:g.dept.color || C.accent, padding:"6px 0 4px", display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:14 }}>{g.dept.icon}</span>
                <span>{g.dept.name}</span>
                <span style={{ color:C.muted, fontWeight:500 }}>· {g.steps.length} bước</span>
              </div>
              {g.steps.map(s => (
                <div key={s.id} style={{ display:"flex", gap:8, padding:"3px 0 3px 22px", alignItems:"baseline" }}>
                  <span style={{ fontSize:10, fontWeight:700, color:C.muted, minWidth:18 }}>{s.sort_order}.</span>
                  <span style={{ fontSize:12, color:C.text, flex:1 }}>{s.name}</span>
                  {s.estimated_days && <span style={{ fontSize:10, color:C.muted }}>~{s.estimated_days}d</span>}
                </div>
              ))}
            </div>
          ))}
          {orphanSteps.length > 0 && (
            <div style={{ marginTop:6 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, padding:"6px 0 4px" }}>(Chưa gán phòng)</div>
              {orphanSteps.map(s => (
                <div key={s.id} style={{ display:"flex", gap:8, padding:"3px 0 3px 22px", alignItems:"baseline" }}>
                  <span style={{ fontSize:10, fontWeight:700, color:C.muted, minWidth:18 }}>{s.sort_order}.</span>
                  <span style={{ fontSize:12, color:C.text }}>{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Inline step editor — name + dept dropdown + days ── */
function StepEditor({ step, departments, index, onPatch, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) {
  return (
    <div style={{ display:"flex", gap:6, padding:"6px 0", alignItems:"center", borderBottom:`1px solid ${C.border}22` }}>
      <span style={{ fontSize:11, fontWeight:700, color:C.accent, width:20, textAlign:"center", flexShrink:0 }}>{index + 1}</span>
      <input
        value={step.name}
        onChange={e => onPatch({ name: e.target.value })}
        placeholder="Tên bước..."
        style={{ flex:1, fontSize:12, border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 8px", outline:"none", color:C.text, background:C.bg, minWidth:0 }}
      />
      <select
        value={step.department_id || ""}
        onChange={e => onPatch({ department_id: e.target.value || null })}
        style={{ fontSize:11, border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 4px", color:C.text, background:C.bg, minWidth:0, maxWidth:120 }}>
        <option value="">— Chọn phòng —</option>
        {(departments || []).map(d => (
          <option key={d.id} value={d.id}>{d.icon} {d.name}</option>
        ))}
      </select>
      <input
        type="number" min="0"
        value={step.estimated_days || ""}
        onChange={e => onPatch({ estimated_days: e.target.value ? parseInt(e.target.value, 10) : null })}
        placeholder="Ngày"
        style={{ width:48, fontSize:11, border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 4px", outline:"none", color:C.text, background:C.bg, textAlign:"center" }}
      />
      <button className="tap" onClick={onMoveUp} disabled={isFirst} style={{ fontSize:11, color:isFirst ? C.muted : C.accent, padding:"2px 4px", border:"none", background:"none", cursor: isFirst ? "default" : "pointer", opacity: isFirst ? 0.3 : 1 }}>↑</button>
      <button className="tap" onClick={onMoveDown} disabled={isLast} style={{ fontSize:11, color:isLast ? C.muted : C.accent, padding:"2px 4px", border:"none", background:"none", cursor: isLast ? "default" : "pointer", opacity: isLast ? 0.3 : 1 }}>↓</button>
      <button className="tap" onClick={onRemove} style={{ fontSize:13, color:C.red, padding:"2px 4px", border:"none", background:"none", cursor:"pointer" }}>×</button>
    </div>
  );
}

export default function WorkflowTab({ settings, setSettings, showMsg }) {
  const { workflows, loading, createWorkflow, updateWorkflow, deleteWorkflow } = useWorkflows();
  const { departments, loading: deptLoading } = useDepartments();
  const [editId, setEditId] = useState(null);            // null | "__new__" | <wf.id>
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIcon, setEditIcon] = useState("📋");
  const [editSteps, setEditSteps] = useState([]);        // [{name, department_id, estimated_days}]
  const [newStepName, setNewStepName] = useState("");
  const [newStepDept, setNewStepDept] = useState("");
  const rulesFileRef = useRef(null);
  const rulesFiles = settings.staffRulesFiles || [];

  const isDirector = settings.userRole === "director";

  /* ── Staff rules (giữ nguyên — lưu trong settings) ── */
  const handleRulesUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showMsg("File không được quá 5MB", "error"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const newFile = { id: Date.now(), name: file.name, size: file.size, type: file.type, data: ev.target.result, uploadedAt: new Date().toISOString() };
      setSettings(s => ({ ...s, staffRulesFiles: [...(s.staffRulesFiles || []), newFile] }));
      showMsg(`Đã tải lên: ${file.name}`);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const deleteRulesFile = (id) => {
    setSettings(s => ({ ...s, staffRulesFiles: (s.staffRulesFiles || []).filter(f => f.id !== id) }));
    showMsg("Đã xóa file quy định");
  };
  const viewRulesFile = (file) => {
    const a = document.createElement("a"); a.href = file.data; a.download = file.name; a.click();
  };

  /* ── Workflow editor handlers ── */
  const startNew = () => {
    setEditId("__new__"); setEditName(""); setEditDescription(""); setEditIcon("📋"); setEditSteps([]);
    setNewStepName(""); setNewStepDept("");
  };
  const startEdit = (wf) => {
    setEditId(wf.id); setEditName(wf.name); setEditDescription(wf.description || ""); setEditIcon(wf.icon || "📋");
    setEditSteps((wf.steps || []).slice().sort((a,b) => a.sort_order - b.sort_order).map(s => ({
      name: s.name, department_id: s.department_id, estimated_days: s.estimated_days,
    })));
    setNewStepName(""); setNewStepDept("");
  };
  const cancelEdit = () => {
    setEditId(null); setEditName(""); setEditDescription(""); setEditIcon("📋"); setEditSteps([]);
    setNewStepName(""); setNewStepDept("");
  };

  const addStep = () => {
    if (!newStepName.trim()) return;
    setEditSteps(prev => [...prev, { name: newStepName.trim(), department_id: newStepDept || null, estimated_days: null }]);
    setNewStepName(""); // keep dept selection for next step
  };
  const patchStep = (i, patch) => setEditSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  const removeStep = (i) => setEditSteps(prev => prev.filter((_, idx) => idx !== i));
  const moveStep = (i, delta) => setEditSteps(prev => {
    const next = [...prev];
    const j = i + delta;
    if (j < 0 || j >= next.length) return prev;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const saveEdit = async () => {
    if (!editName.trim()) { showMsg("Cần nhập tên quy trình", "error"); return; }
    const valid = editSteps.filter(s => s.name.trim());
    const payload = { name: editName.trim(), description: editDescription.trim(), icon: editIcon, steps: valid };
    const ok = editId === "__new__"
      ? await createWorkflow(payload)
      : await updateWorkflow(editId, payload);
    if (ok) { showMsg(editId === "__new__" ? "Đã tạo quy trình" : "Đã cập nhật"); cancelEdit(); }
    else showMsg("Lỗi khi lưu — kiểm tra quyền (chỉ giám đốc)", "error");
  };

  const handleDelete = async (wf) => {
    if (!confirm(`Xoá quy trình "${wf.name}"? Các bước con sẽ bị xoá theo.`)) return;
    const ok = await deleteWorkflow(wf.id);
    if (ok) showMsg("Đã xoá");
    else showMsg("Lỗi khi xoá", "error");
  };

  return (<>
    {/* ── Staff Rules Files ── */}
    <div style={{ marginBottom:18 }}>
      <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:8 }}>Quy định nhân viên</div>
      <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>Upload file quy định, nội quy, chính sách (PDF, DOCX, TXT, hình ảnh)</div>
      {rulesFiles.map(f => (
        <div key={f.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", marginBottom:4, background:C.card, borderRadius:10, border:`1px solid ${C.border}` }}>
          <span style={{ fontSize:16 }}>{f.type?.includes("pdf") ? "📄" : f.type?.includes("image") ? "🖼️" : "📎"}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</div>
            <div style={{ fontSize:10, color:C.muted }}>{(f.size / 1024).toFixed(0)}KB · {new Date(f.uploadedAt).toLocaleDateString("vi-VN")}</div>
          </div>
          <span className="tap" onClick={() => viewRulesFile(f)} style={{ fontSize:11, color:C.accent, cursor:"pointer", padding:"2px 6px" }}>Tải</span>
          <span className="tap" onClick={() => deleteRulesFile(f.id)} style={{ fontSize:11, color:C.red, cursor:"pointer", padding:"2px 6px" }}>Xóa</span>
        </div>
      ))}
      <button className="tap" onClick={() => rulesFileRef.current?.click()}
        style={{ width:"100%", padding:"10px", borderRadius:10, border:`1px dashed ${C.accent}44`, background:C.accentD, color:C.accent, fontSize:12, fontWeight:700, marginTop:4 }}>
        + Tải lên file quy định
      </button>
      <input ref={rulesFileRef} type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={handleRulesUpload} style={{ display:"none" }} />
    </div>

    {/* ── Workflow Templates (DB) ── */}
    <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
      Quy trình công ty
      <span style={{ fontSize:10, color:C.muted, fontWeight:500 }}>({workflows.length} mẫu, dùng chung toàn team)</span>
    </div>

    {(loading || deptLoading) && <div style={{ fontSize:12, color:C.muted, padding:8 }}>Đang tải...</div>}

    {/* Edit form */}
    {editId && (
      <div style={{ marginBottom:14, padding:14, background:C.card, borderRadius:14, border:`1px solid ${C.accent}66` }}>
        <div style={{ fontSize:13, fontWeight:700, color:C.accent, marginBottom:10 }}>
          {editId === "__new__" ? "Tạo quy trình mới" : "Sửa quy trình"}
        </div>
        <div style={{ display:"flex", gap:6, marginBottom:8 }}>
          <input value={editIcon} onChange={e => setEditIcon(e.target.value)} placeholder="📋" maxLength={2}
            style={{ width:44, fontSize:18, textAlign:"center", border:`1px solid ${C.border}`, borderRadius:8, padding:"6px", color:C.text, background:C.bg }} />
          <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Tên quy trình..."
            style={{ flex:1, fontSize:13, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px", outline:"none", color:C.text, background:C.bg, boxSizing:"border-box" }} />
        </div>
        <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Mô tả ngắn (tuỳ chọn)..."
          rows={2}
          style={{ width:"100%", fontSize:12, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", outline:"none", color:C.text, background:C.bg, boxSizing:"border-box", marginBottom:10, resize:"vertical" }} />

        <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:6 }}>BƯỚC TRONG QUY TRÌNH ({editSteps.length})</div>
        {editSteps.map((s, i) => (
          <StepEditor
            key={i}
            step={s}
            departments={departments}
            index={i}
            onPatch={(p) => patchStep(i, p)}
            onRemove={() => removeStep(i)}
            onMoveUp={() => moveStep(i, -1)}
            onMoveDown={() => moveStep(i, 1)}
            isFirst={i === 0}
            isLast={i === editSteps.length - 1}
          />
        ))}

        {/* Add new step row */}
        <div style={{ display:"flex", gap:6, marginTop:8, padding:"6px", background:C.bg, borderRadius:8 }}>
          <input value={newStepName} onChange={e => setNewStepName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addStep(); }}
            placeholder={`Bước ${editSteps.length+1}...`}
            style={{ flex:1, fontSize:12, border:`1px solid ${C.border}`, borderRadius:6, padding:"6px 10px", outline:"none", color:C.text, background:C.card, minWidth:0 }} />
          <select value={newStepDept} onChange={e => setNewStepDept(e.target.value)}
            style={{ fontSize:11, border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 4px", color:C.text, background:C.card, maxWidth:130 }}>
            <option value="">— Phòng —</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
          </select>
          <button className="tap" onClick={addStep} disabled={!newStepName.trim()}
            style={{ padding:"6px 12px", borderRadius:6, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:700, opacity:newStepName.trim()?1:0.4 }}>
            +
          </button>
        </div>

        <div style={{ display:"flex", gap:8, marginTop:14 }}>
          <button className="tap" onClick={cancelEdit}
            style={{ flex:1, padding:"9px", borderRadius:10, border:`1px solid ${C.border}`, background:C.bg, color:C.sub, fontSize:12, fontWeight:600 }}>
            Huỷ
          </button>
          <button className="tap" onClick={saveEdit} disabled={!editName.trim()}
            style={{ flex:1, padding:"9px", borderRadius:10, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:700, opacity:editName.trim()?1:0.4 }}>
            Lưu
          </button>
        </div>
      </div>
    )}

    {/* List existing workflows */}
    {!loading && workflows.length === 0 && !editId && (
      <div style={{ fontSize:12, color:C.muted, marginBottom:10, padding:"12px", textAlign:"center", background:C.card, borderRadius:10 }}>
        Chưa có quy trình nào. {isDirector && "Bấm + bên dưới để tạo."}
      </div>
    )}
    {workflows.map(wf => (
      <WorkflowCard
        key={wf.id}
        wf={wf}
        departments={departments}
        onEdit={() => startEdit(wf)}
        onDelete={() => handleDelete(wf)}
        isDirector={isDirector}
      />
    ))}

    {!editId && isDirector && (
      <button className="tap" onClick={startNew}
        style={{ width:"100%", padding:"10px", borderRadius:10, border:`1px dashed ${C.accent}44`, background:C.accentD, color:C.accent, fontSize:12, fontWeight:700, marginTop:6 }}>
        + Tạo quy trình mới
      </button>
    )}

    {!isDirector && !loading && (
      <div style={{ fontSize:11, color:C.muted, marginTop:8, padding:"8px 10px", background:C.card, borderRadius:8, fontStyle:"italic" }}>
        Chỉ giám đốc có quyền tạo / sửa quy trình. Bạn xem được nhưng không sửa.
      </div>
    )}
  </>);
}
