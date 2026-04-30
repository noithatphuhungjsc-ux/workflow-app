/* ================================================================
   NewProjectModal — Tạo dự án mới (Đợt 3, cleanup hardcode A6)
   Flow:
   1. Nhập thông tin (tên, khách hàng, màu)
   2. Chọn quy trình (từ workflow_templates DB)
   3. Phân công từng giai đoạn (theo phòng ban) — lead + members
   4. Save → tạo project + project_members + tasks tự động
   ================================================================ */
import { useState, useMemo } from "react";
import { C, PROJECT_COLORS } from "../../constants";
import { useSupabase } from "../../contexts/SupabaseContext";
import { supabase } from "../../lib/supabase";
import { useWorkflows, useDepartments, useDepartmentProfiles } from "../../hooks/useWorkflows";
// Note: LOCAL_ID_TO_UUID hardcode đã xóa (A6 cleanup) — giờ dùng auth.users.id qua session.user.id, không cần fallback UUID cũ vì chỉ user thật đã login mới hiển thị.

/* ── Phase row: 1 phòng ban + danh sách bước + chọn members ── */
function PhaseRow({ dept, steps, profiles, leadId, memberIds, onSetLead, onToggleMember, skipped, onToggleSkip }) {
  const [open, setOpen] = useState(true);
  const leadPick = profiles.find(p => p.id === leadId);

  return (
    <div style={{ marginBottom:8, background: skipped ? `${C.muted}11` : C.card, borderRadius:10, border:`1px solid ${C.border}`, opacity: skipped ? 0.55 : 1 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px" }}>
        <span className="tap" onClick={() => setOpen(o => !o)} style={{ cursor:"pointer", fontSize:13, transform: open ? "rotate(90deg)" : "rotate(0deg)", transition:"transform .15s" }}>▶</span>
        <span style={{ fontSize:16 }}>{dept.icon}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.text }}>{dept.name}</div>
          <div style={{ fontSize:10, color:C.muted }}>{steps.length} bước · {leadPick ? `Lead: ${leadPick.display_name}` : "Chưa có lead"}</div>
        </div>
        <label style={{ fontSize:10, color:C.muted, display:"flex", alignItems:"center", gap:4, cursor:"pointer" }}>
          <input type="checkbox" checked={skipped} onChange={onToggleSkip} />
          Bỏ qua
        </label>
      </div>

      {open && !skipped && (
        <div style={{ padding:"4px 12px 10px", borderTop:`1px solid ${C.border}` }}>
          {/* Steps preview */}
          <div style={{ marginTop:6, marginBottom:8 }}>
            {steps.map(s => (
              <div key={s.id} style={{ display:"flex", gap:6, padding:"2px 0", alignItems:"baseline" }}>
                <span style={{ fontSize:10, fontWeight:700, color:C.muted, minWidth:18 }}>{s.sort_order}.</span>
                <span style={{ fontSize:11, color:C.text, flex:1 }}>{s.name}</span>
                {s.estimated_days && <span style={{ fontSize:9, color:C.muted }}>~{s.estimated_days}d</span>}
              </div>
            ))}
          </div>

          {/* Lead picker */}
          <div style={{ fontSize:10, fontWeight:600, color:C.muted, marginBottom:4 }}>TRƯỞNG GIAI ĐOẠN</div>
          <select value={leadId || ""} onChange={e => onSetLead(e.target.value || null)}
            style={{ width:"100%", fontSize:12, border:`1px solid ${C.border}`, borderRadius:6, padding:"6px 8px", color:C.text, background:C.bg, marginBottom:8 }}>
            <option value="">— Chọn trưởng —</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>
                {p.display_name} {p.dept_role === "lead" ? "(Trưởng phòng)" : p.dept_role === "deputy" ? "(Phó phòng)" : ""}
              </option>
            ))}
          </select>

          {/* Members multi-select */}
          {profiles.length > 0 && (
            <>
              <div style={{ fontSize:10, fontWeight:600, color:C.muted, marginBottom:4 }}>THÀNH VIÊN THAM GIA ({memberIds.length})</div>
              <div style={{ maxHeight:90, overflowY:"auto", background:C.bg, borderRadius:6, padding:4 }}>
                {profiles.map(p => {
                  const checked = memberIds.includes(p.id);
                  const isLead = p.id === leadId;
                  return (
                    <label key={p.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"3px 6px", cursor: isLead ? "default" : "pointer", opacity: isLead ? 0.5 : 1 }}>
                      <input type="checkbox" checked={checked || isLead} disabled={isLead}
                        onChange={() => onToggleMember(p.id)} />
                      <span style={{ fontSize:11, color:C.text }}>{p.display_name}</span>
                      {isLead && <span style={{ fontSize:9, color:C.accent, fontWeight:700 }}>(Lead)</span>}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function NewProjectModal({ onAdd, onClose }) {
  const { session } = useSupabase();
  const userId = session?.user?.id;
  const { workflows, loading: wfLoading } = useWorkflows();
  const { departments, loading: deptLoading } = useDepartments();
  const { byDept, loading: profLoading } = useDepartmentProfiles();

  const [name, setName] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [workflowId, setWorkflowId] = useState("");

  // Phase assignments: { [dept_id]: { lead_id, member_ids: [], skipped: bool } }
  const [phaseConfig, setPhaseConfig] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Compute phases from selected workflow
  const phases = useMemo(() => {
    if (!workflowId) return [];
    const wf = workflows.find(w => w.id === workflowId);
    if (!wf) return [];
    const groups = new Map();
    for (const s of wf.steps || []) {
      const key = s.department_id || "_unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    // Order by department sort_order
    return departments
      .filter(d => groups.has(d.id))
      .map(d => ({ dept: d, steps: groups.get(d.id).sort((a,b) => a.sort_order - b.sort_order) }));
  }, [workflowId, workflows, departments]);

  const setPhaseField = (deptId, patch) => {
    setPhaseConfig(prev => ({
      ...prev,
      [deptId]: { lead_id: null, member_ids: [], skipped: false, ...prev[deptId], ...patch },
    }));
  };

  const submit = async () => {
    setError("");
    if (!name.trim()) { setError("Cần nhập tên dự án"); return; }
    if (!workflowId) { setError("Cần chọn quy trình"); return; }
    if (!userId) { setError("Bạn chưa đăng nhập"); return; }

    setSaving(true);
    try {
      // 1. Insert project
      const { data: project, error: projErr } = await supabase.from("projects").insert({
        owner_id: userId,
        name: name.trim(),
        color,
        workflow_id: workflowId,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        customer_address: customerAddress.trim() || null,
      }).select().single();
      if (projErr) throw new Error("Tạo dự án fail: " + projErr.message);

      // 2. Insert project_members
      const memberRows = [];
      // Owner = top-level lead (no department) — phòng tổng
      memberRows.push({
        project_id: project.id,
        user_id: userId,
        department_id: null,
        role: "lead",
      });
      for (const phase of phases) {
        const cfg = phaseConfig[phase.dept.id] || {};
        if (cfg.skipped) continue;
        if (cfg.lead_id) {
          memberRows.push({
            project_id: project.id,
            user_id: cfg.lead_id,
            department_id: phase.dept.id,
            role: "lead",
          });
        }
        for (const mid of (cfg.member_ids || [])) {
          if (mid === cfg.lead_id) continue; // avoid duplicate
          memberRows.push({
            project_id: project.id,
            user_id: mid,
            department_id: phase.dept.id,
            role: "member",
          });
        }
      }
      if (memberRows.length > 0) {
        const { error: memErr } = await supabase.from("project_members").insert(memberRows);
        if (memErr) console.warn("[NewProject] members insert:", memErr.message);
      }

      // 3. Create tasks from workflow_steps (only for non-skipped phases)
      const skippedDepts = new Set(
        phases.filter(p => phaseConfig[p.dept.id]?.skipped).map(p => p.dept.id)
      );
      const wf = workflows.find(w => w.id === workflowId);
      const taskRows = (wf?.steps || [])
        .filter(s => !skippedDepts.has(s.department_id))
        .map(s => {
          const cfg = phaseConfig[s.department_id] || {};
          return {
            project_id: project.id,
            owner_id: userId,
            assigned_to: cfg.lead_id || null,
            title: s.name,
            department_id: s.department_id,
            workflow_step_id: s.id,
            workflow_step: s.sort_order,
            status: "todo",
            priority: "trung",
          };
        });
      if (taskRows.length > 0) {
        const { error: taskErr } = await supabase.from("tasks").insert(taskRows);
        if (taskErr) console.warn("[NewProject] tasks insert:", taskErr.message);
      }

      onAdd?.(project);
      onClose?.();
    } catch (e) {
      setError(e.message || "Lỗi không xác định");
    } finally {
      setSaving(false);
    }
  };

  const loading = wfLoading || deptLoading || profLoading;
  const wf = workflows.find(w => w.id === workflowId);

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:C.bg, borderRadius:20, padding:18, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:14 }}>Tạo dự án mới</div>

        {loading && <div style={{ fontSize:12, color:C.muted, padding:8 }}>Đang tải dữ liệu...</div>}

        {!loading && (<>
          {/* Tên dự án */}
          <div style={{ fontSize:11, fontWeight:600, color:C.muted, marginBottom:4 }}>TÊN DỰ ÁN <span style={{ color:C.red }}>*</span></div>
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            placeholder="VD: Nhà chị Phương — Quận 7"
            style={{ width:"100%", fontSize:14, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 12px", color:C.text, background:C.card, boxSizing:"border-box", marginBottom:12 }} />

          {/* Khách hàng */}
          <div style={{ fontSize:11, fontWeight:600, color:C.muted, marginBottom:4 }}>KHÁCH HÀNG (tuỳ chọn)</div>
          <div style={{ display:"flex", gap:6, marginBottom:8 }}>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Tên khách"
              style={{ flex:2, fontSize:12, border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 10px", color:C.text, background:C.card, boxSizing:"border-box" }} />
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="SĐT"
              style={{ flex:1, fontSize:12, border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 10px", color:C.text, background:C.card, boxSizing:"border-box" }} />
          </div>
          <input value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="Địa chỉ"
            style={{ width:"100%", fontSize:12, border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 10px", color:C.text, background:C.card, boxSizing:"border-box", marginBottom:12 }} />

          {/* Màu */}
          <div style={{ display:"flex", gap:6, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
            <span style={{ fontSize:11, color:C.muted, fontWeight:600 }}>MÀU:</span>
            {PROJECT_COLORS.map(c => (
              <div key={c} className="tap" onClick={() => setColor(c)}
                style={{ width:22, height:22, borderRadius:"50%", background:c, cursor:"pointer",
                  border: color === c ? "3px solid #fff" : "2px solid transparent",
                  boxShadow: color === c ? `0 0 0 2px ${c}` : "none" }} />
            ))}
          </div>

          {/* Quy trình */}
          <div style={{ fontSize:11, fontWeight:600, color:C.muted, marginBottom:4 }}>QUY TRÌNH <span style={{ color:C.red }}>*</span></div>
          <select value={workflowId} onChange={e => { setWorkflowId(e.target.value); setPhaseConfig({}); }}
            style={{ width:"100%", fontSize:13, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 12px", color:C.text, background:C.card, boxSizing:"border-box", marginBottom:12 }}>
            <option value="">— Chọn quy trình —</option>
            {workflows.map(w => (
              <option key={w.id} value={w.id}>{w.icon || "📋"} {w.name} ({(w.steps || []).length} bước)</option>
            ))}
          </select>

          {workflowId && wf?.description && (
            <div style={{ fontSize:11, color:C.muted, fontStyle:"italic", marginBottom:10, padding:"6px 10px", background:`${C.accent}10`, borderRadius:6 }}>{wf.description}</div>
          )}

          {/* Phases */}
          {workflowId && phases.length > 0 && (
            <>
              <div style={{ fontSize:11, fontWeight:600, color:C.muted, marginBottom:6 }}>PHÂN CÔNG GIAI ĐOẠN ({phases.length} phòng ban)</div>
              {phases.map(({ dept, steps }) => (
                <PhaseRow
                  key={dept.id}
                  dept={dept}
                  steps={steps}
                  profiles={byDept.get(dept.id) || []}
                  leadId={phaseConfig[dept.id]?.lead_id || null}
                  memberIds={phaseConfig[dept.id]?.member_ids || []}
                  skipped={phaseConfig[dept.id]?.skipped || false}
                  onSetLead={(id) => setPhaseField(dept.id, { lead_id: id })}
                  onToggleMember={(id) => setPhaseField(dept.id, {
                    member_ids: (phaseConfig[dept.id]?.member_ids || []).includes(id)
                      ? (phaseConfig[dept.id]?.member_ids || []).filter(m => m !== id)
                      : [...(phaseConfig[dept.id]?.member_ids || []), id],
                  })}
                  onToggleSkip={() => setPhaseField(dept.id, { skipped: !phaseConfig[dept.id]?.skipped })}
                />
              ))}
            </>
          )}

          {error && <div style={{ fontSize:11, color:C.red, padding:"6px 10px", background:`${C.red}11`, borderRadius:6, marginBottom:8 }}>⚠️ {error}</div>}

          {/* Actions */}
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            <button className="tap" onClick={onClose} disabled={saving}
              style={{ flex:1, padding:"10px", borderRadius:12, border:`1px solid ${C.border}`, background:C.card, color:C.sub, fontSize:14, fontWeight:600 }}>
              Huỷ
            </button>
            <button className="tap" onClick={submit} disabled={saving || !name.trim() || !workflowId}
              style={{ flex:1, padding:"10px", borderRadius:12, border:"none", background:C.accent, color:"#fff", fontSize:14, fontWeight:700, opacity: (saving || !name.trim() || !workflowId) ? 0.5 : 1 }}>
              {saving ? "Đang tạo..." : "Tạo dự án"}
            </button>
          </div>
        </>)}
      </div>
    </div>
  );
}
