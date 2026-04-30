/* ================================================================
   ProjectDetailV2 — Xem dự án theo cấu trúc mới (Đợt 4)
   - Project có workflow_id, member theo phòng ban (project_members),
     task gắn với workflow_step_id + department_id
   - Render: header + tabs (Giai đoạn / Thành viên / Cài đặt)
   - Giai đoạn: collapse theo phòng ban, mỗi giai đoạn có tasks bên trong
   ================================================================ */
import { useState, useEffect, useCallback, useMemo } from "react";
import { C, PROJECT_COLORS } from "../../constants";
import { supabase } from "../../lib/supabase";
import { useDepartments, useDepartmentProfiles } from "../../hooks/useWorkflows";
import { useSupabase } from "../../contexts/SupabaseContext";

const STATUS_LABELS = { todo: "Chờ", inprogress: "Đang", done: "Xong" };
const STATUS_COLORS = { todo: "#7f8c8d", inprogress: "#3498db", done: "#27ae60" };

/**
 * Format deadline thân thiện cho nhân viên:
 * - Quá hạn → "🔴 Quá X ngày" (đỏ)
 * - Hôm nay → "📅 Hôm nay" (cam)
 * - Mai → "📅 Mai" (vàng)
 * - Sau → "📅 dd/MM" (xám)
 */
function formatDeadline(deadline) {
  if (!deadline) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(deadline); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0) return { label: `🔴 Quá ${-diff} ngày`, color: "#e74c3c" };
  if (diff === 0) return { label: "📅 Hôm nay", color: "#e67e22" };
  if (diff === 1) return { label: "📅 Mai", color: "#f39c12" };
  if (diff <= 7) return { label: `📅 ${diff} ngày nữa`, color: "#f1c40f" };
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return { label: `📅 ${dd}/${mm}`, color: "#7f8c8d" };
}

function PhaseCard({ dept, tasks, members, onPatchTask, currentUserId }) {
  const [open, setOpen] = useState(true);
  const done = tasks.filter(t => t.status === "done").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const lead = members.find(m => m.role === "lead");

  return (
    <div style={{ marginBottom:8, background:C.card, borderRadius:12, border:`1px solid ${C.border}`, overflow:"hidden" }}>
      <div className="tap" onClick={() => setOpen(o => !o)}
        style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", cursor:"pointer" }}>
        <span style={{ fontSize:14, transform: open ? "rotate(90deg)" : "rotate(0)", transition:"transform .15s" }}>▶</span>
        <span style={{ fontSize:20 }}>{dept?.icon || "📦"}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{dept?.name || "Chung (không phòng)"}</div>
          <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
            {tasks.length} việc · {done}/{tasks.length} xong
            {lead && <span> · Trưởng: {lead.profile?.display_name || "?"}</span>}
          </div>
        </div>
        <div style={{ minWidth:42, textAlign:"right" }}>
          <span style={{ fontSize:12, fontWeight:700, color: pct === 100 ? C.green : C.accent }}>{pct}%</span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height:3, background:C.border }}>
        <div style={{ height:"100%", width:`${pct}%`, background: pct === 100 ? C.green : C.accent, transition:"width .3s" }} />
      </div>

      {open && (
        <div style={{ padding:"6px 12px 12px" }}>
          {tasks.length === 0 && (
            <div style={{ fontSize:11, color:C.muted, textAlign:"center", padding:"10px 0" }}>Chưa có việc</div>
          )}
          {tasks.map(t => {
            const dl = t.status !== "done" ? formatDeadline(t.deadline) : null;
            const isMine = currentUserId && t.assigned_to === currentUserId;
            return (
              <div key={t.id}
                style={{
                  display:"flex", alignItems:"center", gap:8, padding:"8px 6px",
                  borderBottom:`1px solid ${C.border}22`,
                  background: isMine && t.status !== "done" ? `${C.accent}08` : "transparent",
                  borderLeft: isMine && t.status !== "done" ? `3px solid ${C.accent}` : "3px solid transparent",
                  paddingLeft: isMine && t.status !== "done" ? 4 : 6,
                }}>
                <button className="tap" onClick={() => onPatchTask(t.id, { status: t.status === "done" ? "todo" : "done" })}
                  style={{ width:22, height:22, borderRadius:6, border:`2px solid ${t.status === "done" ? C.green : C.border}`, background: t.status === "done" ? C.green : "transparent", color:"#fff", fontSize:12, fontWeight:700, padding:0, cursor:"pointer", flexShrink:0 }}>
                  {t.status === "done" && "✓"}
                </button>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, color: t.status === "done" ? C.muted : C.text, textDecoration: t.status === "done" ? "line-through" : "none", fontWeight: isMine ? 600 : 500 }}>
                    {t.title}
                    {isMine && t.status !== "done" && <span style={{ marginLeft:6, fontSize:9, fontWeight:700, color:C.accent, padding:"1px 5px", borderRadius:4, background:`${C.accent}15` }}>VIỆC TÔI</span>}
                  </div>
                  <div style={{ fontSize:10, marginTop:3, display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    {t.assignee_name && <span style={{ color:C.muted }}>👤 {t.assignee_name}</span>}
                    {dl && <span style={{ color: dl.color, fontWeight:700 }}>{dl.label}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProjectDetailV2({ project: initialProject, onClose, onDelete, isStaff }) {
  const { departments } = useDepartments();
  const { profiles: allProfiles, byDept } = useDepartmentProfiles();
  const { session } = useSupabase();
  const currentUserId = session?.user?.id;
  const [project, setProject] = useState(initialProject);
  const [tab, setTab] = useState("phases");
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDel, setConfirmDel] = useState(false);
  // Edit info
  const [editingInfo, setEditingInfo] = useState(false);
  const [editForm, setEditForm] = useState({});
  // Add member
  const [addingMemberDept, setAddingMemberDept] = useState(null);  // dept id when picking
  const [memberSearch, setMemberSearch] = useState("");

  useEffect(() => { setProject(initialProject); }, [initialProject]);

  const fetchData = useCallback(async () => {
    if (!supabase || !project?.id) return;
    setLoading(true);
    // Tasks of this project
    const { data: t } = await supabase
      .from("tasks")
      .select("id, title, status, priority, deadline, assignee_name, assigned_to, department_id, workflow_step_id, workflow_step")
      .eq("project_id", project.id)
      .eq("deleted", false)
      .order("workflow_step", { ascending: true });
    setTasks(t || []);

    // Members + their profiles
    const { data: m } = await supabase
      .from("project_members")
      .select("id, user_id, department_id, role")
      .eq("project_id", project.id);
    if (m?.length) {
      const userIds = [...new Set(m.map(x => x.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_color, dept_role").in("id", userIds);
      setMembers(m.map(x => ({ ...x, profile: profiles?.find(p => p.id === x.user_id) })));
    } else {
      setMembers([]);
    }
    setLoading(false);
  }, [project?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const patchTask = async (taskId, patch) => {
    if (!supabase) return;
    await supabase.from("tasks").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", taskId);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t));
  };

  const handleDelete = async () => {
    if (!supabase) return;
    await supabase.from("tasks").delete().eq("project_id", project.id);
    await supabase.from("project_members").delete().eq("project_id", project.id);
    await supabase.from("projects").delete().eq("id", project.id);
    onDelete?.(project.id);
    onClose?.();
  };

  // Edit project info
  const startEditInfo = () => {
    setEditForm({
      name: project.name || "",
      color: project.color || PROJECT_COLORS[0],
      customer_name: project.customer_name || "",
      customer_phone: project.customer_phone || "",
      customer_address: project.customer_address || "",
    });
    setEditingInfo(true);
  };
  const saveInfo = async () => {
    if (!supabase || !editForm.name?.trim()) return;
    const patch = {
      name: editForm.name.trim(),
      color: editForm.color,
      customer_name: editForm.customer_name?.trim() || null,
      customer_phone: editForm.customer_phone?.trim() || null,
      customer_address: editForm.customer_address?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("projects").update(patch).eq("id", project.id);
    if (error) { alert("Lỗi cập nhật: " + error.message); return; }
    setProject(prev => ({ ...prev, ...patch }));
    setEditingInfo(false);
  };

  // Add/remove members
  const addMember = async (userId, deptId, role = "member") => {
    if (!supabase) return;
    // Check duplicate
    if (members.some(m => m.user_id === userId && m.department_id === deptId)) {
      alert("Thành viên này đã có trong giai đoạn này");
      return;
    }
    const { data, error } = await supabase.from("project_members")
      .insert({ project_id: project.id, user_id: userId, department_id: deptId, role })
      .select().single();
    if (error) { alert("Lỗi thêm: " + error.message); return; }
    const profile = allProfiles.find(p => p.id === userId);
    setMembers(prev => [...prev, { ...data, profile }]);
    setAddingMemberDept(null);
    setMemberSearch("");
  };
  const removeMember = async (memberId) => {
    if (!supabase) return;
    if (!confirm("Xóa thành viên khỏi giai đoạn này?")) return;
    const { error } = await supabase.from("project_members").delete().eq("id", memberId);
    if (error) { alert("Lỗi xóa: " + error.message); return; }
    setMembers(prev => prev.filter(m => m.id !== memberId));
  };
  const setMemberRole = async (memberId, newRole) => {
    if (!supabase) return;
    const { error } = await supabase.from("project_members").update({ role: newRole }).eq("id", memberId);
    if (error) { alert("Lỗi đổi vai trò: " + error.message); return; }
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
  };

  // Group tasks by department
  const phases = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      const k = t.department_id || "_unassigned";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    }
    const result = departments
      .filter(d => map.has(d.id))
      .map(d => ({
        dept: d,
        tasks: map.get(d.id),
        members: members.filter(m => m.department_id === d.id),
      }));
    if (map.has("_unassigned")) {
      result.push({ dept: null, tasks: map.get("_unassigned"), members: [] });
    }
    return result;
  }, [tasks, departments, members]);

  const totalDone = tasks.filter(t => t.status === "done").length;
  const totalPct = tasks.length ? Math.round((totalDone / tasks.length) * 100) : 0;

  return (
    <div className="safe-modal-fullscreen" style={{ position:"fixed", inset:0, zIndex:900, background:C.bg, display:"flex", flexDirection:"column" }}>
      {/* Header */}
      <div style={{ padding:"14px 16px", borderBottom:`1px solid ${C.border}`, background:C.card, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button className="tap" onClick={onClose} style={{ padding:"4px 8px", border:"none", background:"none", color:C.text, fontSize:18, cursor:"pointer" }}>‹</button>
          <div style={{ width:8, height:32, borderRadius:4, background:project.color || C.accent }} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:15, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{project.name}</div>
            {project.customer_name && (
              <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                👤 {project.customer_name}{project.customer_phone && ` · 📞 ${project.customer_phone}`}
              </div>
            )}
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:18, fontWeight:700, color: totalPct === 100 ? C.green : C.accent }}>{totalPct}%</div>
            <div style={{ fontSize:9, color:C.muted }}>{totalDone}/{tasks.length}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:4, marginTop:12 }}>
          {[["phases","Giai đoạn"],["members","Thành viên"],["info","Thông tin"]].map(([k, l]) => (
            <button key={k} className="tap" onClick={() => setTab(k)}
              style={{ flex:1, padding:"7px", borderRadius:8, border:"none", background: tab === k ? C.accent : "transparent", color: tab === k ? "#fff" : C.muted, fontSize:11, fontWeight:700 }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, overflowY:"auto", padding:"12px 14px" }}>
        {loading && <div style={{ textAlign:"center", padding:30, color:C.muted, fontSize:12 }}>Đang tải...</div>}

        {!loading && tab === "phases" && (
          <>
            {/* Banner việc của tôi trong dự án này */}
            {(() => {
              const myTasks = tasks.filter(t => t.assigned_to === currentUserId && t.status !== "done");
              if (myTasks.length === 0) return null;
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const overdue = myTasks.filter(t => t.deadline && new Date(t.deadline) < today).length;
              const todayCount = myTasks.filter(t => {
                if (!t.deadline) return false;
                const d = new Date(t.deadline); d.setHours(0, 0, 0, 0);
                return d.getTime() === today.getTime();
              }).length;
              return (
                <div style={{ marginBottom:10, padding:"10px 14px", borderRadius:10, background:`${C.accent}10`, border:`1px solid ${C.accent}33` }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.accent, marginBottom:3 }}>
                    👤 Bạn có {myTasks.length} việc trong dự án này
                  </div>
                  <div style={{ fontSize:10, color:C.muted, display:"flex", gap:10, flexWrap:"wrap" }}>
                    {overdue > 0 && <span style={{ color:"#e74c3c", fontWeight:700 }}>🔴 {overdue} quá hạn</span>}
                    {todayCount > 0 && <span style={{ color:"#e67e22", fontWeight:700 }}>📅 {todayCount} hôm nay</span>}
                    <span>Việc của bạn được tô viền xanh bên dưới</span>
                  </div>
                </div>
              );
            })()}

            {phases.length === 0 && (
              <div style={{ fontSize:12, color:C.muted, padding:20, textAlign:"center" }}>
                Dự án chưa có giai đoạn (chưa link với quy trình mới)
              </div>
            )}
            {phases.map(p => (
              <PhaseCard key={p.dept?.id || "_un"} dept={p.dept} tasks={p.tasks} members={p.members} onPatchTask={patchTask} currentUserId={currentUserId} />
            ))}
          </>
        )}

        {!loading && tab === "members" && (
          <>
            {/* Group members by department */}
            {departments.map(dept => {
              const inDept = members.filter(m => m.department_id === dept.id);
              if (inDept.length === 0 && !addingMemberDept) return null;
              const isAdding = addingMemberDept === dept.id;
              const candidates = (byDept.get(dept.id) || []).filter(p =>
                !members.some(m => m.user_id === p.id && m.department_id === dept.id) &&
                (!memberSearch || (p.display_name || "").toLowerCase().includes(memberSearch.toLowerCase()))
              );
              return (
                <div key={dept.id} style={{ marginBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 4px", marginBottom:4 }}>
                    <span style={{ fontSize:14 }}>{dept.icon}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:C.text, flex:1 }}>{dept.name}</span>
                    <span style={{ fontSize:10, color:C.muted }}>{inDept.length} người</span>
                    {!isStaff && (
                      <button className="tap" onClick={() => { setAddingMemberDept(dept.id); setMemberSearch(""); }}
                        style={{ padding:"3px 8px", fontSize:10, fontWeight:700, color:C.accent, background:`${C.accent}15`, border:"none", borderRadius:6 }}>
                        + Thêm
                      </button>
                    )}
                  </div>
                  {inDept.map(m => (
                    <div key={m.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", marginBottom:4, background:C.card, borderRadius:10, border:`1px solid ${C.border}` }}>
                      <div style={{ width:30, height:30, borderRadius:"50%", background: m.profile?.avatar_color || C.accent, color:"#fff", fontSize:12, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {(m.profile?.display_name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{m.profile?.display_name || "?"}</div>
                      </div>
                      {!isStaff && (
                        <>
                          <select value={m.role} onChange={e => setMemberRole(m.id, e.target.value)}
                            style={{ fontSize:10, border:`1px solid ${C.border}`, borderRadius:6, padding:"3px 4px", color:C.text, background:C.bg }}>
                            <option value="lead">Trưởng</option>
                            <option value="member">Thành viên</option>
                          </select>
                          <button className="tap" onClick={() => removeMember(m.id)}
                            style={{ padding:"4px 6px", border:"none", background:"none", color:C.red, fontSize:13, cursor:"pointer" }}>×</button>
                        </>
                      )}
                    </div>
                  ))}
                  {isAdding && (
                    <div style={{ padding:10, background:C.card, borderRadius:10, border:`1px solid ${C.accent}55`, marginTop:4 }}>
                      <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Tìm..." autoFocus
                        style={{ width:"100%", fontSize:12, border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 8px", color:C.text, background:C.bg, boxSizing:"border-box", marginBottom:6 }} />
                      <div style={{ maxHeight:140, overflowY:"auto" }}>
                        {candidates.length === 0 && (
                          <div style={{ fontSize:11, color:C.muted, padding:6, textAlign:"center" }}>
                            Không có người trong phòng này (hoặc đã thêm hết)
                          </div>
                        )}
                        {candidates.slice(0, 15).map(p => (
                          <div key={p.id} className="tap" onClick={() => addMember(p.id, dept.id, "member")}
                            style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 6px", cursor:"pointer", borderBottom:`1px solid ${C.border}22` }}>
                            <div style={{ width:24, height:24, borderRadius:"50%", background:p.avatar_color||C.accent, color:"#fff", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                              {(p.display_name||"?").charAt(0).toUpperCase()}
                            </div>
                            <span style={{ flex:1, fontSize:11, color:C.text }}>{p.display_name}</span>
                            <span style={{ fontSize:10, color:C.accent }}>+</span>
                          </div>
                        ))}
                      </div>
                      <button className="tap" onClick={() => setAddingMemberDept(null)}
                        style={{ marginTop:6, width:"100%", padding:"5px", border:`1px solid ${C.border}`, background:C.bg, color:C.muted, borderRadius:6, fontSize:11 }}>
                        Đóng
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {/* Phòng ban chưa được khởi tạo trong dự án — cho phép thêm */}
            {!isStaff && !addingMemberDept && departments.filter(d => !members.some(m => m.department_id === d.id)).length > 0 && (
              <div style={{ marginTop:14, padding:"10px 12px", background:`${C.accent}08`, borderRadius:10 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:6 }}>THÊM PHÒNG VÀO DỰ ÁN</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {departments.filter(d => !members.some(m => m.department_id === d.id)).map(d => (
                    <button key={d.id} className="tap" onClick={() => { setAddingMemberDept(d.id); setMemberSearch(""); }}
                      style={{ padding:"6px 10px", fontSize:11, color:C.accent, background:C.card, border:`1px solid ${C.border}`, borderRadius:8 }}>
                      {d.icon} {d.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!loading && tab === "info" && (
          <div>
            <div style={{ background:C.card, borderRadius:10, padding:14, marginBottom:10, border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", alignItems:"center", marginBottom:8 }}>
                <span style={{ fontSize:11, fontWeight:700, color:C.muted, flex:1 }}>THÔNG TIN DỰ ÁN</span>
                {!isStaff && !editingInfo && (
                  <button className="tap" onClick={startEditInfo}
                    style={{ padding:"3px 10px", fontSize:11, fontWeight:700, color:C.accent, background:`${C.accent}15`, border:"none", borderRadius:6 }}>
                    ✏️ Sửa
                  </button>
                )}
              </div>
              {editingInfo ? (
                <div>
                  <div style={{ fontSize:10, fontWeight:600, color:C.muted, marginTop:6, marginBottom:3 }}>TÊN DỰ ÁN</div>
                  <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    style={{ width:"100%", fontSize:13, border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 10px", color:C.text, background:C.bg, boxSizing:"border-box", marginBottom:8 }} />
                  <div style={{ fontSize:10, fontWeight:600, color:C.muted, marginBottom:3 }}>KHÁCH HÀNG</div>
                  <input value={editForm.customer_name} onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Tên khách"
                    style={{ width:"100%", fontSize:12, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", color:C.text, background:C.bg, boxSizing:"border-box", marginBottom:6 }} />
                  <input value={editForm.customer_phone} onChange={e => setEditForm(f => ({ ...f, customer_phone: e.target.value }))} placeholder="SĐT"
                    style={{ width:"100%", fontSize:12, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", color:C.text, background:C.bg, boxSizing:"border-box", marginBottom:6 }} />
                  <input value={editForm.customer_address} onChange={e => setEditForm(f => ({ ...f, customer_address: e.target.value }))} placeholder="Địa chỉ"
                    style={{ width:"100%", fontSize:12, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", color:C.text, background:C.bg, boxSizing:"border-box", marginBottom:8 }} />
                  <div style={{ fontSize:10, fontWeight:600, color:C.muted, marginBottom:5 }}>MÀU</div>
                  <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
                    {PROJECT_COLORS.map(c => (
                      <div key={c} className="tap" onClick={() => setEditForm(f => ({ ...f, color: c }))}
                        style={{ width:22, height:22, borderRadius:"50%", background:c, cursor:"pointer",
                          border: editForm.color === c ? "3px solid #fff" : "2px solid transparent",
                          boxShadow: editForm.color === c ? `0 0 0 2px ${c}` : "none" }} />
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button className="tap" onClick={() => setEditingInfo(false)}
                      style={{ flex:1, padding:"8px", borderRadius:8, border:`1px solid ${C.border}`, background:C.bg, color:C.sub, fontSize:12, fontWeight:600 }}>Huỷ</button>
                    <button className="tap" onClick={saveInfo} disabled={!editForm.name?.trim()}
                      style={{ flex:1, padding:"8px", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:700, opacity:editForm.name?.trim()?1:0.4 }}>Lưu</button>
                  </div>
                </div>
              ) : (
              <div style={{ fontSize:12, color:C.text, lineHeight:2 }}>
                <div><b>Tên:</b> {project.name}</div>
                {project.customer_name && <div><b>Khách hàng:</b> {project.customer_name}</div>}
                {project.customer_phone && <div><b>SĐT:</b> {project.customer_phone}</div>}
                {project.customer_address && <div><b>Địa chỉ:</b> {project.customer_address}</div>}
                <div><b>Trạng thái:</b> {project.status || "active"}</div>
                {project.created_at && <div><b>Tạo:</b> {new Date(project.created_at).toLocaleDateString("vi-VN")}</div>}
              </div>
              )}
            </div>

            {!isStaff && (
              <div style={{ marginTop:14 }}>
                {!confirmDel ? (
                  <button className="tap" onClick={() => setConfirmDel(true)}
                    style={{ width:"100%", padding:"12px", borderRadius:10, border:`1px solid ${C.red}`, background:"transparent", color:C.red, fontSize:13, fontWeight:700 }}>
                    🗑 Xóa dự án này
                  </button>
                ) : (
                  <div style={{ padding:14, background:`${C.red}10`, borderRadius:10, border:`1px solid ${C.red}55` }}>
                    <div style={{ fontSize:12, color:C.red, fontWeight:700, marginBottom:6 }}>⚠️ Xác nhận xóa</div>
                    <div style={{ fontSize:11, color:C.text, marginBottom:10 }}>
                      Toàn bộ {tasks.length} việc + thành viên sẽ bị xóa. KHÔNG hoàn tác.
                    </div>
                    <div style={{ display:"flex", gap:6 }}>
                      <button className="tap" onClick={() => setConfirmDel(false)}
                        style={{ flex:1, padding:"8px", borderRadius:8, border:`1px solid ${C.border}`, background:C.card, color:C.sub, fontSize:12, fontWeight:600 }}>Huỷ</button>
                      <button className="tap" onClick={handleDelete}
                        style={{ flex:1, padding:"8px", borderRadius:8, border:"none", background:C.red, color:"#fff", fontSize:12, fontWeight:700 }}>Xóa hẳn</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
