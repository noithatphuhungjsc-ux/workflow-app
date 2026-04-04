/* WorkflowTab — Manage company workflow templates */
import { useState, useRef } from "react";
import { C, WORKFLOWS } from "../../constants";

/* ── Custom Workflow Card (expandable + edit/delete) ── */
function CustomWfCard({ wf, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom:4, background:C.card, borderRadius:10, border:`1px solid ${C.border}`, overflow:"hidden" }}>
      <div className="tap" onClick={() => setOpen(o => !o)}
        style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", cursor:"pointer" }}>
        <span style={{ fontSize:14, transition:"transform .2s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{wf.name}</div>
          <div style={{ fontSize:10, color:C.muted }}>{wf.steps.length} bước</div>
        </div>
        <span className="tap" onClick={e => { e.stopPropagation(); onEdit(); }} style={{ fontSize:11, color:C.accent, cursor:"pointer", padding:"2px 6px" }}>Sửa</span>
        <span className="tap" onClick={e => { e.stopPropagation(); onDelete(); }} style={{ fontSize:11, color:C.red, cursor:"pointer", padding:"2px 6px" }}>Xoá</span>
      </div>
      {open && (
        <div style={{ padding:"0 10px 10px 34px" }}>
          {wf.steps.map((s, i) => (
            <div key={i} style={{ display:"flex", gap:6, padding:"3px 0", alignItems:"baseline" }}>
              <span style={{ fontSize:10, fontWeight:700, color:C.accent, width:16, textAlign:"right", flexShrink:0 }}>{i+1}.</span>
              <span style={{ fontSize:11, color:C.text }}>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Default Workflow Card (expandable) ── */
function DefaultWfCard({ wf, onCopy }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom:4, background:C.bg, borderRadius:10, border:`1px solid ${C.border}`, overflow:"hidden" }}>
      <div className="tap" onClick={() => setOpen(o => !o)}
        style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", cursor:"pointer" }}>
        <span style={{ fontSize:14, transition:"transform .2s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:600, color:C.sub }}>{wf.name}</div>
          <div style={{ fontSize:10, color:C.muted }}>{wf.steps.length} bước</div>
        </div>
        <span className="tap" onClick={e => { e.stopPropagation(); onCopy(); }}
          style={{ fontSize:11, color:C.accent, fontWeight:600, padding:"2px 8px", borderRadius:6, border:`1px solid ${C.accent}33`, background:C.accentD }}>Sao chép</span>
      </div>
      {open && (
        <div style={{ padding:"0 10px 10px 34px" }}>
          {wf.steps.map((s, i) => (
            <div key={i} style={{ display:"flex", gap:6, padding:"3px 0", alignItems:"baseline" }}>
              <span style={{ fontSize:10, fontWeight:700, color:C.accent, width:16, textAlign:"right", flexShrink:0 }}>{i+1}.</span>
              <span style={{ fontSize:11, color:C.text }}>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WorkflowTab({ settings, setSettings, showMsg }) {
  const customs = settings.customWorkflows || [];
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editSteps, setEditSteps] = useState([]);
  const [newStep, setNewStep] = useState("");
  const fileRef = useRef(null);
  const rulesFileRef = useRef(null);
  const rulesFiles = settings.staffRulesFiles || [];

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

  const saveCustoms = (list) => setSettings(s => ({ ...s, customWorkflows: list }));

  const startEdit = (wf) => { setEditId(wf.id); setEditName(wf.name); setEditSteps([...wf.steps]); };
  const startNew = () => { setEditId("__new__"); setEditName(""); setEditSteps([]); };
  const cancelEdit = () => { setEditId(null); setEditName(""); setEditSteps([]); setNewStep(""); };

  const copyDefault = (wf) => {
    const id = "custom_" + Date.now();
    saveCustoms([...customs, { id, name: wf.name, steps: [...wf.steps] }]);
    showMsg("Đã sao chép mẫu: " + wf.name);
  };

  const saveEdit = () => {
    if (!editName.trim()) return;
    if (editId === "__new__") {
      const id = "custom_" + Date.now();
      saveCustoms([...customs, { id, name: editName.trim(), steps: editSteps }]);
    } else {
      saveCustoms(customs.map(w => w.id === editId ? { ...w, name: editName.trim(), steps: editSteps } : w));
    }
    cancelEdit();
  };

  const deleteWf = (id) => { if (confirm("Xoá mẫu quy trình này?")) saveCustoms(customs.filter(w => w.id !== id)); };

  const addStep = () => { if (newStep.trim()) { setEditSteps(p => [...p, newStep.trim()]); setNewStep(""); } };
  const removeStep = (i) => setEditSteps(p => p.filter((_, idx) => idx !== i));

  const exportWf = () => {
    const data = JSON.stringify(customs, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "workflow-templates.json"; a.click();
    URL.revokeObjectURL(url);
    showMsg("Đã tải xuống file mẫu quy trình");
  };

  const importWf = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data)) throw new Error("Invalid");
        const valid = data.filter(w => w.name && Array.isArray(w.steps));
        const imported = valid.map(w => ({ id: w.id || ("custom_" + Date.now() + Math.random()), name: w.name, steps: w.steps }));
        saveCustoms([...customs, ...imported]);
        showMsg(`Đã nhập ${imported.length} mẫu quy trình`);
      } catch { showMsg("File không hợp lệ"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (<>
    {/* ── Staff Rules Files ── */}
    <div style={{ marginBottom:18 }}>
      <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:8 }}>Quy định nhân viên</div>
      <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>Upload file quy định, nội quy, chính sách cho nhân viên (PDF, DOCX, TXT, hình ảnh)</div>
      {rulesFiles.map(f => (
        <div key={f.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", marginBottom:4, background:C.card, borderRadius:10, border:`1px solid ${C.border}` }}>
          <span style={{ fontSize:16 }}>{f.type?.includes("pdf") ? "📄" : f.type?.includes("image") ? "🖼️" : f.type?.includes("word") || f.type?.includes("document") ? "📝" : "📎"}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</div>
            <div style={{ fontSize:10, color:C.muted }}>{(f.size / 1024).toFixed(0)}KB — {new Date(f.uploadedAt).toLocaleDateString("vi-VN")}</div>
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

    {/* Edit mode */}
    {editId && (
      <div style={{ marginBottom:16, padding:14, background:C.card, borderRadius:14, border:`1px solid ${C.accent}44` }}>
        <div style={{ fontSize:13, fontWeight:700, color:C.accent, marginBottom:10 }}>{editId === "__new__" ? "Tạo mẫu mới" : "Sửa mẫu"}</div>
        <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Tên quy trình..."
          style={{ width:"100%", fontSize:13, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px", outline:"none", color:C.text, background:C.bg, boxSizing:"border-box", marginBottom:10 }} />
        {editSteps.map((s, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"3px 0" }}>
            <span style={{ fontSize:11, fontWeight:700, color:C.accent, width:18, textAlign:"center" }}>{i+1}</span>
            <span style={{ flex:1, fontSize:12, color:C.text }}>{s}</span>
            <span className="tap" onClick={() => removeStep(i)} style={{ fontSize:13, color:C.red, cursor:"pointer", padding:"0 4px" }}>×</span>
          </div>
        ))}
        <div style={{ display:"flex", gap:6, marginTop:6, alignItems:"center" }}>
          <input value={newStep} onChange={e => setNewStep(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addStep(); }}
            placeholder={`Bước ${editSteps.length+1}...`}
            style={{ flex:1, fontSize:12, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", outline:"none", color:C.text, background:C.bg }} />
          <button className="tap" onClick={addStep}
            style={{ padding:"6px 12px", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:700, opacity:newStep.trim()?1:0.4 }}>+</button>
        </div>
        <div style={{ display:"flex", gap:8, marginTop:12 }}>
          <button className="tap" onClick={cancelEdit} style={{ flex:1, padding:"8px", borderRadius:10, border:`1px solid ${C.border}`, background:C.card, color:C.sub, fontSize:12, fontWeight:600 }}>Huỷ</button>
          <button className="tap" onClick={saveEdit} style={{ flex:1, padding:"8px", borderRadius:10, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:700, opacity:editName.trim()?1:0.4 }}>Lưu</button>
        </div>
      </div>
    )}

    {/* Company templates */}
    <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:8 }}>Mẫu công ty ({customs.length})</div>
    {customs.length === 0 && !editId && <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>Chưa có — tạo mới hoặc sao chép từ mẫu mặc định bên dưới</div>}
    {customs.map(w => (
      <CustomWfCard key={w.id} wf={w} onEdit={() => startEdit(w)} onDelete={() => deleteWf(w.id)} />
    ))}
    {!editId && <button className="tap" onClick={startNew}
      style={{ width:"100%", padding:"10px", borderRadius:10, border:`1px dashed ${C.accent}44`, background:C.accentD, color:C.accent, fontSize:12, fontWeight:700, marginTop:6, marginBottom:16 }}>
      + Tạo mẫu mới
    </button>}

    {/* Export / Import */}
    <div style={{ display:"flex", gap:8, marginBottom:16 }}>
      <button className="tap" onClick={exportWf} disabled={!customs.length}
        style={{ flex:1, padding:"8px", borderRadius:10, border:`1px solid ${C.border}`, background:C.card, color:customs.length ? C.accent : C.muted, fontSize:12, fontWeight:600 }}>
        ⬇ Tải xuống
      </button>
      <button className="tap" onClick={() => fileRef.current?.click()}
        style={{ flex:1, padding:"8px", borderRadius:10, border:`1px solid ${C.border}`, background:C.card, color:C.accent, fontSize:12, fontWeight:600 }}>
        ⬆ Tải lên
      </button>
      <input ref={fileRef} type="file" accept=".json" onChange={importWf} style={{ display:"none" }} />
    </div>

    {/* Default templates (expandable + copy) */}
    <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:8 }}>Mẫu mặc định</div>
    {WORKFLOWS.map(w => (
      <DefaultWfCard key={w.id} wf={w} onCopy={() => copyDefault(w)} />
    ))}
  </>);
}
