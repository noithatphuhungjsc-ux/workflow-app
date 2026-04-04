import React from "react";
import { C, t, TEAM_ACCOUNTS } from "../constants";

export default function TasksTabContent({
  tasks, filteredTasks, projects,
  filter, setFilter, projFilter, setProjFilter,
  searchQ, setSearchQ,
  selectMode, setSelectMode, selectedIds, setSelectedIds, exitSelectMode,
  pendingDeleteCount, isStaff, isDirector, myName,
  patchTask, deleteTask, addTask, hardDelete,
  setSel, setAddOpen, setNewProjOpen, setProjDetail,
  setStatusPickerTask, toggleSelect,
  settings,
  supabase, supaSession, cloudLoad, cloudSave,
  timerTick,
  Empty, Filters, ProjectFilters, TaskRow,
  deleteProject
}) {
  return (
    <div style={{ animation: "fadeIn .2s" }}>
      {/* Search bar + edit/delete buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <input
            className="input-base"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder={`Tìm ${t("task", settings).toLowerCase()}...`}
            style={{ paddingLeft: 34, paddingTop: 0, paddingBottom: 0, fontSize: 15, height: 40, boxSizing: "border-box", margin: 0 }}
          />
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.muted, pointerEvents: "none" }}>🔍</span>
          {searchQ && (
            <span className="tap" onClick={() => setSearchQ("")}
              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: C.muted, cursor: "pointer", lineHeight: 1 }}>×</span>
          )}
        </div>
        {!selectMode && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button className="tap" onClick={() => { setSelectMode("edit"); setSelectedIds(new Set()); }}
              style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.accent, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              title="Sửa hàng loạt">✏️</button>
            <button className="tap" onClick={() => { setSelectMode("delete"); setSelectedIds(new Set()); }}
              style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.red, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              title="Xóa hàng loạt">🗑️</button>
          </div>
        )}
      </div>
      {/* ── Pending delete approval banner (director only) ── */}
      {pendingDeleteCount > 0 && filter !== "pending_delete" && (
        <div className="tap" onClick={() => setFilter("pending_delete")}
          style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", marginBottom:10, borderRadius:12,
            background:"linear-gradient(135deg, #e74c3c11, #e74c3c08)", border:`1px solid #e74c3c33`, cursor:"pointer" }}>
          <div style={{ width:36, height:36, borderRadius:10, background:"#e74c3c18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🔔</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#e74c3c" }}>{pendingDeleteCount} yêu cầu xóa chờ duyệt</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>Nhân viên yêu cầu xóa công việc — Nhấn để duyệt</div>
          </div>
          <span style={{ fontSize:18, color:C.muted }}>›</span>
        </div>
      )}
      {/* ── Filter pills ── */}
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
        <div className="no-scrollbar" style={{ display:"flex", gap:6, flex:1, overflowX:"auto", paddingBottom:2 }}>
          <Filters filter={filter} setFilter={setFilter} pendingDeleteCount={pendingDeleteCount} />
        </div>
      </div>
      {filter === "pending_delete" && filteredTasks.length > 0 && !selectMode && (
        <div style={{ display:"flex", gap:6, marginBottom:8, justifyContent:"flex-end" }}>
          <button className="tap" onClick={() => {
            if (!window.confirm(`Duyệt xóa TẤT CẢ ${filteredTasks.length} công việc?`)) return;
            filteredTasks.forEach(t => deleteTask(t.id));
            setFilter("all");
          }}
            style={{ padding:"5px 12px", borderRadius:8, border:"none", background:C.red, color:"#fff", fontSize:12, fontWeight:700 }}>
            Duyệt tất cả
          </button>
          <button className="tap" onClick={() => {
            filteredTasks.forEach(t => patchTask(t.id, { deleteRequest: null }));
            setFilter("all");
          }}
            style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${C.border}`, background:C.card, color:C.muted, fontSize:12, fontWeight:600 }}>
            Từ chối tất cả
          </button>
        </div>
      )}
      {/* ── Multi-select toolbar ── */}
      {selectMode && (
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, padding:"8px 10px", background: selectMode === "delete" ? `${C.red}08` : `${C.accent}08`, borderRadius:10, border:`1px solid ${selectMode === "delete" ? C.red + "33" : C.accent + "33"}` }}>
          <label className="tap" style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:13, fontWeight:600, color:C.text }}>
            <input type="checkbox" checked={filteredTasks.length > 0 && selectedIds.size === filteredTasks.length}
              onChange={() => setSelectedIds(prev => prev.size === filteredTasks.length ? new Set() : new Set(filteredTasks.map(t => t.id)))}
              style={{ width:16, height:16, accentColor: selectMode === "delete" ? C.red : C.accent }} />
            Chọn tất cả
          </label>
          <span style={{ fontSize:13, color:C.muted }}>{selectedIds.size}/{filteredTasks.length}</span>
          <div style={{ flex:1 }} />
          {selectedIds.size > 0 && selectMode === "delete" && (
            <div style={{ display:"flex", gap:4 }}>
              {filter === "pending_delete" && !isStaff && (
                <>
                  <button className="tap" onClick={() => {
                    if (!window.confirm(`Duyệt xóa ${selectedIds.size} công việc?`)) return;
                    selectedIds.forEach(id => deleteTask(id));
                    exitSelectMode(); if (pendingDeleteCount <= selectedIds.size) setFilter("all");
                  }}
                    style={{ padding:"5px 12px", borderRadius:8, border:"none", background:C.red, color:"#fff", fontSize:13, fontWeight:700 }}>
                    Duyệt ({selectedIds.size})
                  </button>
                  <button className="tap" onClick={() => {
                    selectedIds.forEach(id => patchTask(id, { deleteRequest: null }));
                    exitSelectMode();
                  }}
                    style={{ padding:"5px 12px", borderRadius:8, border:`1px solid ${C.border}`, background:C.card, color:C.muted, fontSize:13, fontWeight:600 }}>
                    Từ chối
                  </button>
                </>
              )}
              {(filter !== "pending_delete" || isStaff) && (
                <button className="tap" onClick={() => {
                  if (isStaff) {
                    if (!window.confirm(`Yêu cầu xóa ${selectedIds.size} công việc? Admin sẽ duyệt.`)) return;
                    selectedIds.forEach(id => patchTask(id, { deleteRequest: { status: "pending", by: settings.displayName || "NV", at: new Date().toISOString() } }));
                  } else {
                    if (!window.confirm(`Xóa ${selectedIds.size} công việc?`)) return;
                    selectedIds.forEach(id => deleteTask(id));
                  }
                  exitSelectMode();
                }}
                  style={{ padding:"5px 14px", borderRadius:8, border:"none", background:C.red, color:"#fff", fontSize:13, fontWeight:700 }}>
                  {isStaff ? "Yêu cầu xóa" : `Xóa (${selectedIds.size})`}
                </button>
              )}
            </div>
          )}
          {selectedIds.size > 0 && selectMode === "edit" && (
            <button className="tap" onClick={() => setStatusPickerTask({ ids: [...selectedIds] })}
              style={{ padding:"5px 14px", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:13, fontWeight:700 }}>
              Doi trang thai ({selectedIds.size})
            </button>
          )}
          <button className="tap" onClick={exitSelectMode}
            style={{ padding:"5px 10px", borderRadius:8, border:`1px solid ${C.border}`, background:C.card, color:C.muted, fontSize:13, fontWeight:600 }}>
            Huỷ
          </button>
        </div>
      )}
      {/* Project dashboard removed — filters below are sufficient */}
      <ProjectFilters projects={projects} filter={projFilter} setFilter={setProjFilter} onAdd={() => setNewProjOpen(true)} onOpen={setProjDetail} isStaff={isStaff} myName={myName} onDeleteAll={async () => {
        if (!window.confirm("Xoa tat ca du an va cong viec lien quan?")) return;
        const choice = "2";
        // 1. Collect all member localIds from all projects
        const allLids = new Set();
        const DEV_NAME_MAP = Object.fromEntries(TEAM_ACCOUNTS.map(a => [a.name, a.id]));
        projects.forEach(p => p.members?.forEach(m => { const lid = DEV_NAME_MAP[m.name]; if (lid) allLids.add(lid); }));
        const myId = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}").id; } catch { return null; } })();
        if (myId) allLids.add(myId);
        const projectIds = new Set(projects.map(p => p.id));
        // 2. Clean ALL members' cloud data
        await Promise.all([...allLids].map(async (lid) => {
          try {
            const ep = await cloudLoad(null, lid, "projects");
            const cp = Array.isArray(ep?.data) ? ep.data : [];
            const filteredP = cp.filter(p => !projectIds.has(p.id));
            if (filteredP.length !== cp.length) await cloudSave(null, lid, "projects", filteredP);
            const et = await cloudLoad(null, lid, "tasks");
            const ct = Array.isArray(et?.data) ? et.data : [];
            if (choice === "2") {
              const filteredT = ct.filter(t => !projectIds.has(t.projectId));
              if (filteredT.length !== ct.length) await cloudSave(null, lid, "tasks", filteredT);
            } else {
              const updated = ct.map(t => projectIds.has(t.projectId) ? { ...t, projectId: null, stepIndex: null, assignee: null, assigneeId: null } : t);
              if (JSON.stringify(updated) !== JSON.stringify(ct)) await cloudSave(null, lid, "tasks", updated);
            }
          } catch (e) { console.warn("[WF] cleanup member cloud:", e.message); }
        }));
        // 3. Delete chats on Supabase
        if (supabase) {
          for (const p of projects) {
            if (p.chatId) {
              try {
                await supabase.from("messages").delete().eq("conversation_id", p.chatId);
                await supabase.from("conversation_members").delete().eq("conversation_id", p.chatId);
                await supabase.from("conversations").delete().eq("id", p.chatId);
              } catch (e) { console.warn("[WF] delete project chat:", e.message); }
            }
          }
        }
        // 4. THEN delete locally
        if (choice === "1") { tasks.filter(t => t.projectId).forEach(t => patchTask(t.id, { projectId: null, stepIndex: null, assignee: null })); }
        else { tasks.filter(t => t.projectId).forEach(t => hardDelete(t.id)); }
        projects.forEach(p => deleteProject(p.id));
        setProjFilter("all");
      }} />
      {filteredTasks.length === 0 && <Empty icon="📋" title={`Chưa có ${t("task",settings).toLowerCase()}`} subtitle="Nhấn + để thêm mục đầu tiên" action="Thêm ngay" onAction={() => setAddOpen(true)} />}
      {(() => {
        let lastProjectId = "__none__";
        const isAllView = projFilter === "all";
        return filteredTasks.map((tk, i) => {
          const curProjectId = tk.projectId || null;
          const showHeader = isAllView && curProjectId !== lastProjectId;
          lastProjectId = curProjectId;
          const proj = curProjectId ? projects.find(p => p.id === curProjectId) : null;
          return (
            <div key={tk.id} style={i < 12 ? { animation:"fadeIn .2s ease backwards", animationDelay:`${i*25}ms` } : undefined}>
              {showHeader && (
                <div style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 4px 8px", marginTop: i > 0 ? 12 : 0 }}>
                  {curProjectId ? (
                    <>
                      <div style={{ width:10, height:10, borderRadius:5, background: proj?.color || C.accent, flexShrink:0 }} />
                      <span style={{ fontSize:15, fontWeight:700, color: proj?.color || C.accent }}>Dự án: {proj?.name || "Dự án"}</span>
                      <div style={{ flex:1, height:1, background: C.border }} />
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize:15, fontWeight:700, color: C.muted }}>Công việc riêng</span>
                      <div style={{ flex:1, height:1, background: C.border }} />
                    </>
                  )}
                </div>
              )}
              <div style={{ display:"flex", alignItems:"stretch", marginBottom:4 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <TaskRow task={tk}
                    onPress={selectMode ? () => toggleSelect(tk.id) : () => setSel(tk)}
                    projectName={!isAllView && tk.projectId ? (proj?.name || "Dự án") : null}
                    onStatusChange={selectMode ? undefined : (t2, s) => patchTask(t2.id, { status: s })}
                    onPatchTask={(id, data) => patchTask(id, data)}
                    timerTick={timerTick} />
                </div>
                {selectMode && (
                  <div className="tap" onClick={() => toggleSelect(tk.id)}
                    style={{ width:36, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
                    <div style={{
                      width:20, height:20, borderRadius:6,
                      border: selectedIds.has(tk.id) ? "none" : `2px solid ${C.border}`,
                      background: selectedIds.has(tk.id) ? (selectMode === "delete" ? C.red : C.accent) : "transparent",
                      display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s"
                    }}>
                      {selectedIds.has(tk.id) && <span style={{ color:"#fff", fontSize:13, fontWeight:700, lineHeight:1 }}>&#x2713;</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        });
      })()}
    </div>
  );
}
