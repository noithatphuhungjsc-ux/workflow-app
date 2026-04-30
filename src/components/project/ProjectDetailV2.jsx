/* ================================================================
   ProjectDetailV2 — Xem dự án theo cấu trúc mới (Đợt 4)
   - Project có workflow_id, member theo phòng ban (project_members),
     task gắn với workflow_step_id + department_id
   - Render: header + tabs (Giai đoạn / Thành viên / Cài đặt)
   - Giai đoạn: collapse theo phòng ban, mỗi giai đoạn có tasks bên trong
   ================================================================ */
import { useState, useEffect, useCallback, useMemo } from "react";
import { C } from "../../constants";
import { supabase } from "../../lib/supabase";
import { useDepartments } from "../../hooks/useWorkflows";

const STATUS_LABELS = { todo: "Chờ", inprogress: "Đang", done: "Xong" };
const STATUS_COLORS = { todo: "#7f8c8d", inprogress: "#3498db", done: "#27ae60" };

function PhaseCard({ dept, tasks, members, onPatchTask }) {
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
          {tasks.map(t => (
            <div key={t.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 4px", borderBottom:`1px solid ${C.border}22` }}>
              <button className="tap" onClick={() => onPatchTask(t.id, { status: t.status === "done" ? "todo" : "done" })}
                style={{ width:20, height:20, borderRadius:6, border:`2px solid ${t.status === "done" ? C.green : C.border}`, background: t.status === "done" ? C.green : "transparent", color:"#fff", fontSize:11, fontWeight:700, padding:0, cursor:"pointer", flexShrink:0 }}>
                {t.status === "done" && "✓"}
              </button>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, color: t.status === "done" ? C.muted : C.text, textDecoration: t.status === "done" ? "line-through" : "none", fontWeight:500 }}>
                  {t.title}
                </div>
                {(t.assignee_name || t.deadline) && (
                  <div style={{ fontSize:10, color:C.muted, marginTop:2, display:"flex", gap:6 }}>
                    {t.assignee_name && <span>👤 {t.assignee_name}</span>}
                    {t.deadline && <span>📅 {t.deadline}</span>}
                  </div>
                )}
              </div>
              <span style={{ fontSize:10, fontWeight:700, color: STATUS_COLORS[t.status], padding:"2px 6px", borderRadius:6, background: `${STATUS_COLORS[t.status]}15` }}>
                {STATUS_LABELS[t.status] || t.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectDetailV2({ project, onClose, onDelete, isStaff }) {
  const { departments } = useDepartments();
  const [tab, setTab] = useState("phases");
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDel, setConfirmDel] = useState(false);

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
            {phases.length === 0 && (
              <div style={{ fontSize:12, color:C.muted, padding:20, textAlign:"center" }}>
                Dự án chưa có giai đoạn (chưa link với quy trình mới)
              </div>
            )}
            {phases.map(p => (
              <PhaseCard key={p.dept?.id || "_un"} dept={p.dept} tasks={p.tasks} members={p.members} onPatchTask={patchTask} />
            ))}
          </>
        )}

        {!loading && tab === "members" && (
          <>
            {members.length === 0 && <div style={{ fontSize:12, color:C.muted, padding:20, textAlign:"center" }}>Không có thành viên</div>}
            {members.map(m => {
              const dept = departments.find(d => d.id === m.department_id);
              return (
                <div key={m.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", marginBottom:6, background:C.card, borderRadius:10, border:`1px solid ${C.border}` }}>
                  <div style={{ width:32, height:32, borderRadius:"50%", background: m.profile?.avatar_color || C.accent, color:"#fff", fontSize:12, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    {(m.profile?.display_name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{m.profile?.display_name || "?"}</div>
                    <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
                      {dept ? `${dept.icon} ${dept.name}` : "(toàn dự án)"}
                      <span style={{ marginLeft:6, color: m.role === "lead" ? C.accent : C.muted, fontWeight:700 }}>· {m.role === "lead" ? "Trưởng" : "Thành viên"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {!loading && tab === "info" && (
          <div>
            <div style={{ background:C.card, borderRadius:10, padding:14, marginBottom:10, border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:8 }}>THÔNG TIN DỰ ÁN</div>
              <div style={{ fontSize:12, color:C.text, lineHeight:2 }}>
                <div><b>Tên:</b> {project.name}</div>
                {project.customer_name && <div><b>Khách hàng:</b> {project.customer_name}</div>}
                {project.customer_phone && <div><b>SĐT:</b> {project.customer_phone}</div>}
                {project.customer_address && <div><b>Địa chỉ:</b> {project.customer_address}</div>}
                <div><b>Trạng thái:</b> {project.status || "active"}</div>
                {project.created_at && <div><b>Tạo:</b> {new Date(project.created_at).toLocaleDateString("vi-VN")}</div>}
              </div>
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
