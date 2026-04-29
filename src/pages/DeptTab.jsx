/* ================================================================
   DeptTab — Quản lý phòng ban + thành viên (Đợt 5 — partial)
   - List 8 phòng ban (icon + tên + đếm thành viên)
   - Click phòng → modal chi tiết: sửa info, thêm/bớt member, đổi role
   - Director CRUD; staff read-only (RLS)
   ================================================================ */
import { useState, useMemo } from "react";
import { C } from "../constants";
import { useDepartments, useDepartmentProfiles, useDepartmentCRUD } from "../hooks/useWorkflows";

const ROLE_LABELS = { lead: "Trưởng phòng", deputy: "Phó phòng", staff: "Nhân viên" };
const ROLE_COLORS = { lead: "#9b59b6", deputy: "#3498db", staff: "#7f8c8d" };

function DeptDetailModal({ dept, allProfiles, deptMembers, onClose, isDirector, onAssign, onRemove, onSetRole, onUpdateDept }) {
  const [editName, setEditName] = useState(dept.name);
  const [editIcon, setEditIcon] = useState(dept.icon || "");
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");

  const unassigned = useMemo(() =>
    allProfiles.filter(p =>
      p.department_id !== dept.id &&
      p.role !== "director" &&
      (!search || (p.display_name || "").toLowerCase().includes(search.toLowerCase()))
    ),
    [allProfiles, dept.id, search]
  );

  const saveDeptInfo = async () => {
    const ok = await onUpdateDept(dept.id, { name: editName.trim(), icon: editIcon.trim() || null });
    if (!ok) alert("Lỗi cập nhật phòng ban — kiểm tra quyền");
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:C.bg, borderRadius:20, padding:18, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto" }}>

        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <div style={{ width:42, height:42, borderRadius:12, background:`${C.accent}15`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>{dept.icon}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:C.text }}>{dept.name}</div>
            <div style={{ fontSize:11, color:C.muted }}>{deptMembers.length} thành viên</div>
          </div>
          <button className="tap" onClick={onClose} style={{ padding:"6px 10px", border:"none", background:"none", color:C.muted, fontSize:18, cursor:"pointer" }}>✕</button>
        </div>

        {isDirector && (
          <div style={{ marginBottom:16, padding:12, background:C.card, borderRadius:12, border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:6 }}>THÔNG TIN PHÒNG BAN</div>
            <div style={{ display:"flex", gap:6, marginBottom:8 }}>
              <input value={editIcon} onChange={e => setEditIcon(e.target.value)} placeholder="Icon" maxLength={2}
                style={{ width:50, fontSize:18, textAlign:"center", border:`1px solid ${C.border}`, borderRadius:8, padding:"6px", color:C.text, background:C.bg }} />
              <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Tên phòng"
                style={{ flex:1, fontSize:13, border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 10px", color:C.text, background:C.bg }} />
            </div>
            <button className="tap" onClick={saveDeptInfo} disabled={!editName.trim() || (editName === dept.name && editIcon === (dept.icon || ""))}
              style={{ padding:"6px 14px", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:11, fontWeight:700, opacity: editName.trim() ? 1 : 0.4 }}>
              Lưu thay đổi
            </button>
          </div>
        )}

        <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:8 }}>
          THÀNH VIÊN ({deptMembers.length})
        </div>
        {deptMembers.length === 0 && (
          <div style={{ fontSize:12, color:C.muted, padding:"12px", textAlign:"center", background:C.card, borderRadius:10, marginBottom:10 }}>
            Chưa có thành viên
          </div>
        )}
        {deptMembers.map(m => (
          <div key={m.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", marginBottom:4, background:C.card, borderRadius:10, border:`1px solid ${C.border}` }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background: m.avatar_color || C.accent, color:"#fff", fontSize:12, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
              {(m.display_name || "?").charAt(0).toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{m.display_name}</div>
              <div style={{ fontSize:10, color:ROLE_COLORS[m.dept_role] || C.muted, fontWeight:700 }}>
                {ROLE_LABELS[m.dept_role] || m.dept_role}
              </div>
            </div>
            {isDirector && (<>
              <select value={m.dept_role || "staff"} onChange={e => onSetRole(m.id, e.target.value)}
                style={{ fontSize:11, border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 6px", color:C.text, background:C.bg }}>
                <option value="lead">Trưởng</option>
                <option value="deputy">Phó</option>
                <option value="staff">NV</option>
              </select>
              <button className="tap" onClick={() => onRemove(m.id)}
                style={{ padding:"4px 8px", border:"none", background:"none", color:C.red, fontSize:14, cursor:"pointer" }}>×</button>
            </>)}
          </div>
        ))}

        {isDirector && (
          <div style={{ marginTop:12 }}>
            {!adding ? (
              <button className="tap" onClick={() => setAdding(true)}
                style={{ width:"100%", padding:"10px", borderRadius:10, border:`1px dashed ${C.accent}44`, background:C.accentD, color:C.accent, fontSize:12, fontWeight:700 }}>
                + Thêm thành viên
              </button>
            ) : (
              <div style={{ padding:10, background:C.card, borderRadius:10, border:`1px solid ${C.accent}44` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:C.muted }}>CHỌN THÀNH VIÊN</span>
                  <span className="tap" onClick={() => setAdding(false)} style={{ fontSize:14, color:C.muted, cursor:"pointer" }}>✕</span>
                </div>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên..."
                  style={{ width:"100%", fontSize:12, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", color:C.text, background:C.bg, boxSizing:"border-box", marginBottom:6 }} />
                <div style={{ maxHeight:180, overflowY:"auto" }}>
                  {unassigned.length === 0 && (
                    <div style={{ fontSize:11, color:C.muted, padding:"8px", textAlign:"center" }}>
                      {search ? "Không tìm thấy" : "Mọi người đã có phòng — đổi phòng từ menu trong từng row"}
                    </div>
                  )}
                  {unassigned.slice(0, 20).map(p => (
                    <div key={p.id} className="tap" onClick={async () => {
                      const ok = await onAssign(p.id, dept.id, "staff");
                      if (ok) { setAdding(false); setSearch(""); }
                    }}
                      style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 6px", cursor:"pointer", borderBottom:`1px solid ${C.border}22` }}>
                      <div style={{ width:26, height:26, borderRadius:"50%", background: p.avatar_color || C.accent, color:"#fff", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {(p.display_name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex:1, fontSize:12 }}>
                        <div style={{ fontWeight:600, color:C.text }}>{p.display_name}</div>
                        {p.department_id && <div style={{ fontSize:9, color:C.muted }}>(đang ở phòng khác)</div>}
                      </div>
                      <span style={{ fontSize:11, color:C.accent, fontWeight:600 }}>+</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DeptTab() {
  const { departments, loading: deptLoading, refresh: refreshDepts } = useDepartments();
  const { profiles, byDept, loading: profLoading, assignMember, removeMember, setRole } = useDepartmentProfiles();
  const { updateDept } = useDepartmentCRUD(refreshDepts);
  const [activeId, setActiveId] = useState(null);

  const userRole = (() => {
    try { return JSON.parse(localStorage.getItem("wf_session") || "{}").role || "staff"; }
    catch { return "staff"; }
  })();
  const isDirector = userRole === "director";

  const loading = deptLoading || profLoading;

  if (loading) {
    return (
      <div style={{ padding:40, textAlign:"center", color:C.muted }}>
        <div style={{ fontSize:32, marginBottom:10 }}>🏢</div>
        <div style={{ fontSize:13 }}>Đang tải phòng ban...</div>
      </div>
    );
  }

  const activeDept = activeId ? departments.find(d => d.id === activeId) : null;
  const activeMembers = activeDept ? (byDept.get(activeDept.id) || [])
    .slice().sort((a, b) => {
      const order = { lead: 0, deputy: 1, staff: 2 };
      return (order[a.dept_role] ?? 9) - (order[b.dept_role] ?? 9);
    }) : [];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <div style={{ padding:"12px 14px", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ fontSize:15, fontWeight:700, color:C.text }}>🏢 Phòng ban</div>
        <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
          {isDirector ? "Quản trị toàn công ty" : "Xem phòng ban"}
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"10px 12px" }}>
        {departments.map(d => {
          const members = byDept.get(d.id) || [];
          const lead = members.find(m => m.dept_role === "lead");
          return (
            <div key={d.id} className="tap" onClick={() => setActiveId(d.id)}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", marginBottom:8, background:C.card, borderRadius:12, border:`1px solid ${C.border}`, cursor:"pointer" }}>
              <div style={{ width:42, height:42, borderRadius:12, background:`${C.accent}12`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{d.icon}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{d.name}</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                  {members.length} thành viên
                  {lead && <span> · Trưởng: {lead.display_name}</span>}
                </div>
              </div>
              <span style={{ fontSize:18, color:C.muted }}>›</span>
            </div>
          );
        })}

        {(() => {
          const orphans = profiles.filter(p => !p.department_id && p.role !== "director");
          if (orphans.length === 0) return null;
          return (
            <div style={{ marginTop:14, padding:"10px 12px", background:`${C.gold}11`, borderRadius:10, border:`1px dashed ${C.gold}55` }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.gold, marginBottom:6 }}>⚠️ {orphans.length} NHÂN VIÊN CHƯA CÓ PHÒNG</div>
              {orphans.map(p => (
                <div key={p.id} style={{ fontSize:11, color:C.text, padding:"3px 0" }}>· {p.display_name}</div>
              ))}
            </div>
          );
        })()}
      </div>

      {activeDept && (
        <DeptDetailModal
          dept={activeDept}
          allProfiles={profiles}
          deptMembers={activeMembers}
          isDirector={isDirector}
          onClose={() => setActiveId(null)}
          onAssign={assignMember}
          onRemove={removeMember}
          onSetRole={setRole}
          onUpdateDept={updateDept}
        />
      )}
    </div>
  );
}
