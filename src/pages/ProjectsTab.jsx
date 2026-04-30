/* ================================================================
   ProjectsTab — List dự án (Phương án A: tách khỏi tab Công việc)
   - Card list 1 cột (mobile-first)
   - Filter: tất cả / phòng tôi / của tôi tạo
   - + Tạo dự án mới
   - Click → ProjectDetailV2
   ================================================================ */
import { useState, useMemo } from "react";
import { C } from "../constants";
import { useDepartments } from "../hooks/useWorkflows";
import { useSupabase } from "../contexts/SupabaseContext";

const FILTERS = [
  { key: "all",   label: "Tất cả" },
  { key: "mine",  label: "Tôi tạo" },
  { key: "active", label: "Đang chạy" },
];

export default function ProjectsTab({ projects, tasks, onOpenProject, onCreateNew }) {
  const { session } = useSupabase();
  const userId = session?.user?.id;
  const { departments } = useDepartments();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    const map = new Map();
    for (const t of (tasks || [])) {
      if (!t.projectId && !t.project_id) continue;
      const pid = t.projectId || t.project_id;
      if (!map.has(pid)) map.set(pid, { total: 0, done: 0 });
      const s = map.get(pid);
      s.total++;
      if (t.status === "done") s.done++;
    }
    return map;
  }, [tasks]);

  const filtered = useMemo(() => {
    let list = projects || [];
    if (filter === "mine") list = list.filter(p => p.ownerId === userId);
    if (filter === "active") list = list.filter(p => (p.status || "active") === "active");
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.customer_name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [projects, filter, search, userId]);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      {/* Header */}
      <div style={{ padding:"12px 14px", borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:C.text }}>📁 Dự án</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
              {filtered.length} {filter !== "all" ? `(lọc từ ${projects?.length || 0})` : `dự án`}
            </div>
          </div>
          <button className="tap" onClick={onCreateNew}
            style={{ padding:"8px 14px", borderRadius:10, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:700 }}>
            + Tạo dự án
          </button>
        </div>

        {/* Filter pills */}
        <div style={{ display:"flex", gap:6, marginBottom:8 }}>
          {FILTERS.map(f => (
            <button key={f.key} className="tap" onClick={() => setFilter(f.key)}
              style={{ padding:"5px 12px", borderRadius:14, border:"none", fontSize:11, fontWeight:600,
                background: filter === f.key ? C.accent : C.card,
                color: filter === f.key ? "#fff" : C.muted }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Tìm tên dự án hoặc khách hàng..."
          style={{ width:"100%", fontSize:12, border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 12px", color:C.text, background:C.card, boxSizing:"border-box" }} />
      </div>

      {/* List */}
      <div style={{ flex:1, overflowY:"auto", padding:"10px 12px" }}>
        {filtered.length === 0 && (
          <div style={{ padding:"40px 20px", textAlign:"center", color:C.muted }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📁</div>
            <div style={{ fontSize:13 }}>
              {projects?.length === 0 ? "Chưa có dự án nào" : "Không tìm thấy"}
            </div>
            {projects?.length === 0 && (
              <button className="tap" onClick={onCreateNew}
                style={{ marginTop:14, padding:"8px 18px", borderRadius:10, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:700 }}>
                + Tạo dự án đầu tiên
              </button>
            )}
          </div>
        )}

        {filtered.map(p => {
          const s = stats.get(p.id) || { total: 0, done: 0 };
          const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
          const isActive = (p.status || "active") === "active";
          return (
            <div key={p.id} className="tap" onClick={() => onOpenProject(p)}
              style={{ display:"flex", gap:12, padding:"12px 14px", marginBottom:8, background:C.card, borderRadius:12, border:`1px solid ${C.border}`, cursor:"pointer", opacity: isActive ? 1 : 0.6 }}>
              <div style={{ width:6, borderRadius:4, background: p.color || C.accent, flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                  <span style={{ fontSize:14, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{p.name}</span>
                  {!isActive && <span style={{ fontSize:9, padding:"1px 6px", borderRadius:4, background:`${C.muted}22`, color:C.muted }}>LƯU TRỮ</span>}
                </div>
                {p.customer_name && (
                  <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>
                    👤 {p.customer_name}{p.customer_phone && ` · ${p.customer_phone}`}
                  </div>
                )}
                {/* Progress */}
                {s.total > 0 && (
                  <>
                    <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:10, color:C.muted, marginBottom:3 }}>
                      <span>{s.done}/{s.total} việc</span>
                      <span style={{ marginLeft:"auto", fontWeight:700, color: pct === 100 ? C.green : C.accent }}>{pct}%</span>
                    </div>
                    <div style={{ height:4, background:C.border, borderRadius:2, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${pct}%`, background: pct === 100 ? C.green : (p.color || C.accent), transition:"width .3s" }} />
                    </div>
                  </>
                )}
                {s.total === 0 && (
                  <div style={{ fontSize:10, color:C.muted, fontStyle:"italic" }}>Chưa có việc</div>
                )}
              </div>
              <span style={{ fontSize:18, color:C.muted, alignSelf:"center" }}>›</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
