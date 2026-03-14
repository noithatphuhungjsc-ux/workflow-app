import { useState, useRef, useEffect } from "react";
import { C, PROJECT_COLORS, WORKFLOWS } from "../constants";
import { useSettings } from "../store";
import { useSupabase } from "../contexts/SupabaseContext";
import { supabase } from "../lib/supabase";

/* ================================================================
   NEW PROJECT MODAL — create project with custom workflow + members
   ================================================================ */
export function NewProjectModal({ onAdd, onClose }) {
  const { settings } = useSettings();
  const { session } = useSupabase();
  const userId = session?.user?.id;
  const customWfs = settings.customWorkflows || [];
  const allTemplates = [...customWfs, ...WORKFLOWS];

  const [name, setName] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [wfMode, setWfMode] = useState("none");
  const [templateId, setTemplateId] = useState("");
  const [steps, setSteps] = useState([]);
  const [newStep, setNewStep] = useState("");
  const stepRef = useRef(null);

  // Members from Supabase
  const [teamProfiles, setTeamProfiles] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]); // [{supaId, name}]
  const [memberSearch, setMemberSearch] = useState("");

  useEffect(() => {
    if (!supabase || !userId) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("id, display_name, avatar_color").neq("id", userId);
      setTeamProfiles(data || []);
    })();
  }, [userId]);

  const toggleMember = (profile) => {
    setSelectedMembers(prev => {
      const exists = prev.find(m => m.supaId === profile.id || m.name === profile.display_name);
      if (exists) return prev.filter(m => m.supaId !== profile.id && m.name !== profile.display_name);
      return [...prev, { supaId: profile.id, name: profile.display_name, avatarColor: profile.avatar_color }];
    });
  };

  // Dev accounts as fallback when no Supabase profiles
  const DEV_STAFF_NEW = [
    { id: "trinh", display_name: "Nguyen Duy Trinh", avatar_color: "#9b59b6" },
    { id: "lien",  display_name: "Lientran",         avatar_color: "#e74c3c" },
    { id: "hung",  display_name: "Pham Van Hung",    avatar_color: "#3498db" },
    { id: "mai",   display_name: "Tran Thi Mai",     avatar_color: "#27ae60" },
    { id: "duc",   display_name: "Le Minh Duc",      avatar_color: "#8e44ad" },
  ];
  // Merge: Supabase profiles first, then DEV accounts (skip if name matches existing)
  const allProfiles = [...teamProfiles];
  const normalize = s => (s || "").toLowerCase().replace(/\s+/g, "");
  DEV_STAFF_NEW.forEach(d => {
    if (!allProfiles.some(p => p.id === d.id || normalize(p.display_name) === normalize(d.display_name)))
      allProfiles.push(d);
  });
  // Filter out current user (Supabase id or localStorage dev id)
  const localSession = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}"); } catch { return {}; } })();
  const myName = normalize(localSession.name);
  const filteredProfiles = allProfiles.filter(p =>
    p.id !== userId && p.id !== localSession.id && normalize(p.display_name) !== myName &&
    (!memberSearch || p.display_name?.toLowerCase().includes(memberSearch.toLowerCase()))
  );

  const addStep = () => {
    const s = newStep.trim();
    if (!s) return;
    setSteps(prev => [...prev, s]);
    setNewStep("");
    setTimeout(() => stepRef.current?.focus(), 50);
  };

  const removeStep = (i) => setSteps(prev => prev.filter((_, idx) => idx !== i));
  const moveStep = (i, dir) => {
    setSteps(prev => {
      const arr = [...prev];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  };

  const selectTemplate = (id) => {
    setTemplateId(id);
    const wf = allTemplates.find(w => w.id === id);
    if (wf) setSteps([...wf.steps]);
  };

  const finalSteps = wfMode === "none" ? [] : steps;

  const submit = () => {
    if (!name.trim()) return;
    // Build members array — include self + selected
    const myName = settings.displayName || session?.user?.user_metadata?.full_name || "Tôi";
    const members = [
      { supaId: userId, name: myName, id: Date.now() },
      ...selectedMembers.map((m, i) => ({ ...m, id: Date.now() + i + 1 })),
    ];
    onAdd({
      name: name.trim(),
      color,
      steps: finalSteps,
      workflowId: null,
      members,
      selectedSupaMembers: selectedMembers.map(m => m.supaId), // Supabase user IDs to add to chat
    });
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"center", justifyContent:"center", padding:16, animation:"fadeIn .15s" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:C.bg, borderRadius:20, padding:20, width:"100%", maxWidth:400, maxHeight:"85vh", overflowY:"auto", boxShadow:"0 12px 40px rgba(0,0,0,.2)" }}>
        <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:14 }}>Tạo dự án mới</div>

        {/* Name */}
        <input autoFocus value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && wfMode === "none" && !selectedMembers.length) submit(); }}
          placeholder="Tên dự án (VD: Công trình nhà anh Phương)"
          style={{ width:"100%", fontSize:14, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 14px", outline:"none", color:C.text, background:C.card, boxSizing:"border-box", marginBottom:12 }} />

        {/* Color */}
        <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:11, color:C.muted, fontWeight:600 }}>Màu:</span>
          {PROJECT_COLORS.map(c => (
            <div key={c} className="tap" onClick={() => setColor(c)}
              style={{ width:24, height:24, borderRadius:"50%", background:c, cursor:"pointer",
                border: color === c ? "3px solid #fff" : "2px solid transparent",
                boxShadow: color === c ? `0 0 0 2px ${c}` : "none" }} />
          ))}
        </div>

        {/* ── Members picker ── */}
        {(
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:6 }}>👥 Thành viên dự án</div>
            {/* Selected chips */}
            {selectedMembers.length > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:6 }}>
                {selectedMembers.map(m => (
                  <span key={m.supaId} className="tap" onClick={() => toggleMember({ id: m.supaId, display_name: m.name })}
                    style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:8, background:`${C.accent}15`, color:C.accent, fontSize:11, fontWeight:600, cursor:"pointer" }}>
                    {m.name} ✕
                  </span>
                ))}
              </div>
            )}
            {/* Search */}
            <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
              placeholder="Tìm thành viên..."
              style={{ width:"100%", fontSize:12, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", outline:"none", color:C.text, background:C.card, boxSizing:"border-box", marginBottom:4 }} />
            {/* Profile list */}
            <div style={{ maxHeight:120, overflowY:"auto" }}>
              {filteredProfiles.map(p => {
                const isSel = selectedMembers.some(m => m.supaId === p.id);
                return (
                  <div key={p.id} className="tap" onClick={() => toggleMember(p)}
                    style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 4px", cursor:"pointer", borderBottom:`1px solid ${C.border}11` }}>
                    <div style={{ width:28, height:28, borderRadius:"50%", background: p.avatar_color || C.accent, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:12, fontWeight:700, flexShrink:0 }}>
                      {(p.display_name || "?")[0].toUpperCase()}
                    </div>
                    <span style={{ flex:1, fontSize:12, fontWeight:500, color:C.text }}>{p.display_name}</span>
                    <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${isSel ? C.accent : C.border}`, background: isSel ? C.accent : "transparent", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:10, fontWeight:700 }}>
                      {isSel && "✓"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Workflow mode selector */}
        <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:8 }}>Quy trình</div>
        <div style={{ display:"flex", gap:6, marginBottom:12 }}>
          {[["none","Không cần"],["template","Chọn mẫu"],["custom","Tự tạo"]].map(([k,l]) => (
            <button key={k} className="tap" onClick={() => { setWfMode(k); if (k !== "template") setSteps(k === "none" ? [] : steps); }}
              style={{ flex:1, padding:"6px 0", borderRadius:10, fontSize:12, fontWeight:600, border:`1px solid ${wfMode===k?C.accent:C.border}`, background:wfMode===k?C.accentD:C.card, color:wfMode===k?C.accent:C.sub }}>{l}</button>
          ))}
        </div>

        {/* Template selector */}
        {wfMode === "template" && (
          <div style={{ marginBottom:12 }}>
            {customWfs.length > 0 && <div style={{ fontSize:10, fontWeight:600, color:C.accent, marginBottom:4 }}>Mẫu công ty</div>}
            <div className="no-scrollbar" style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:customWfs.length > 0 ? 6 : 8, flexWrap:"wrap" }}>
              {customWfs.map(w => (
                <button key={w.id} className="tap" onClick={() => selectTemplate(w.id)}
                  style={{ flexShrink:0, padding:"5px 12px", borderRadius:10, fontSize:11, fontWeight:600, border:`1px solid ${templateId===w.id?C.accent:C.border}`, background:templateId===w.id?C.accentD:C.card, color:templateId===w.id?C.accent:C.sub }}>
                  {w.name}
                </button>
              ))}
            </div>
            {customWfs.length > 0 && <div style={{ fontSize:10, fontWeight:600, color:C.muted, marginBottom:4 }}>Mẫu mặc định</div>}
            <div className="no-scrollbar" style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:8 }}>
              {WORKFLOWS.map(w => (
                <button key={w.id} className="tap" onClick={() => selectTemplate(w.id)}
                  style={{ flexShrink:0, padding:"5px 12px", borderRadius:10, fontSize:11, fontWeight:600, border:`1px solid ${templateId===w.id?C.accent:C.border}`, background:templateId===w.id?C.accentD:C.card, color:templateId===w.id?C.accent:C.sub }}>
                  {w.name}
                </button>
              ))}
            </div>
            {steps.length > 0 && <div style={{ fontSize:10, color:C.muted }}>Có thể chỉnh sửa các bước bên dưới</div>}
          </div>
        )}

        {/* Custom steps editor (show for both template & custom) */}
        {wfMode !== "none" && (
          <div style={{ marginBottom:14 }}>
            {steps.map((s, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 0" }}>
                <span style={{ fontSize:11, fontWeight:700, color:C.accent, width:18, textAlign:"center" }}>{i+1}</span>
                <span style={{ flex:1, fontSize:12, color:C.text }}>{s}</span>
                <span className="tap" onClick={() => moveStep(i, -1)} style={{ fontSize:12, color:C.muted, cursor:"pointer", padding:"0 3px", opacity: i === 0 ? 0.3 : 1 }}>▲</span>
                <span className="tap" onClick={() => moveStep(i, 1)} style={{ fontSize:12, color:C.muted, cursor:"pointer", padding:"0 3px", opacity: i === steps.length-1 ? 0.3 : 1 }}>▼</span>
                <span className="tap" onClick={() => removeStep(i)} style={{ fontSize:14, color:C.red, cursor:"pointer", padding:"0 4px" }}>×</span>
              </div>
            ))}
            <div style={{ display:"flex", gap:6, marginTop:6, alignItems:"center" }}>
              <input ref={stepRef} value={newStep} onChange={e => setNewStep(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addStep(); }}
                placeholder={`Bước ${steps.length+1}...`}
                style={{ flex:1, fontSize:12, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", outline:"none", color:C.text, background:C.card }} />
              <button className="tap" onClick={addStep}
                style={{ padding:"6px 12px", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:700, opacity:newStep.trim()?1:0.4 }}>+</button>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display:"flex", gap:8 }}>
          <button className="tap" onClick={onClose}
            style={{ flex:1, padding:"10px", borderRadius:12, border:`1px solid ${C.border}`, background:C.card, color:C.sub, fontSize:14, fontWeight:600 }}>Huỷ</button>
          <button className="tap" onClick={submit}
            style={{ flex:1, padding:"10px", borderRadius:12, border:"none", background:C.accent, color:"#fff", fontSize:14, fontWeight:700, opacity: name.trim() ? 1 : 0.4 }}>Tạo</button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   PROJECT DETAIL SHEET — workflow-centric view
   Tasks sorted by step (top→down), assignee, chat link
   Members synced to Supabase group chat
   ================================================================ */
export function ProjectDetailSheet({ project, tasks, patchTask, addTask, patchProject, hardDelete, deleteProject, onClose, onOpenChat, isStaff, myName }) {
  const { session } = useSupabase();
  const userId = session?.user?.id;
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState(project.name);
  const [newStep, setNewStep] = useState("");
  const [editStepIdx, setEditStepIdx] = useState(null);
  const [editStepText, setEditStepText] = useState("");
  const [assigningId, setAssigningId] = useState(null);
  const [viewMode, setViewMode] = useState("steps");
  const [newTaskTitle, setNewTaskTitle] = useState("");

  // Supabase profiles for member picker
  const [teamProfiles, setTeamProfiles] = useState([]);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

  useEffect(() => {
    if (!supabase || !userId) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("id, display_name, avatar_color").neq("id", userId);
      setTeamProfiles(data || []);
    })();
  }, [userId]);

  const projTasks = tasks.filter(t => t.projectId === project.id && !t.deleted)
    .sort((a, b) => (a.stepIndex ?? 999) - (b.stepIndex ?? 999) || (Math.floor(a.id)||0) - (Math.floor(b.id)||0));
  const doneTasks = projTasks.filter(t => t.status === "done");
  const pct = projTasks.length ? Math.round((doneTasks.length / projTasks.length) * 100) : 0;
  const steps = project.steps || [];
  const members = project.members || [];

  const saveName = () => {
    if (name.trim() && name.trim() !== project.name) patchProject(project.id, { name: name.trim() });
    setEditName(false);
  };

  const updateSteps = (newSteps) => patchProject(project.id, { steps: newSteps });
  const addStep = () => {
    if (!newStep.trim()) return;
    updateSteps([...steps, newStep.trim()]);
    setNewStep("");
  };
  const removeStep = (i) => updateSteps(steps.filter((_, idx) => idx !== i));
  const saveEditStep = (i) => {
    if (!editStepText.trim()) { removeStep(i); setEditStepIdx(null); return; }
    updateSteps(steps.map((s, idx) => idx === i ? editStepText.trim() : s));
    setEditStepIdx(null);
  };

  // Group tasks by stepIndex
  const tasksByStep = {};
  projTasks.forEach(t => {
    const si = t.stepIndex ?? -1;
    if (!tasksByStep[si]) tasksByStep[si] = [];
    tasksByStep[si].push(t);
  });

  // Add member from Supabase profile — sync to chat
  const addMemberFromProfile = async (profile) => {
    const alreadyExists = members.some(m => m.supaId === profile.id);
    if (alreadyExists) return;
    const updated = [...members, { supaId: profile.id, name: profile.display_name, avatarColor: profile.avatar_color, id: Date.now() }];
    patchProject(project.id, { members: updated });

    // Sync to Supabase chat group
    if (supabase && project.chatId) {
      try {
        await supabase.from("conversation_members").insert({ conversation_id: project.chatId, user_id: profile.id });
        // System message
        await supabase.from("messages").insert({
          conversation_id: project.chatId,
          sender_id: userId,
          content: `👤 ${profile.display_name} đã được thêm vào dự án`,
          type: "system",
        });
      } catch (e) { console.warn("Sync member to chat failed:", e); }
    }
    setShowMemberPicker(false);
    setMemberSearch("");
  };

  // Add member by name (fallback — no Supabase link)
  const [newMemberName, setNewMemberName] = useState("");
  const addMemberByName = () => {
    if (!newMemberName.trim()) return;
    const updated = [...members, { name: newMemberName.trim(), id: Date.now() }];
    patchProject(project.id, { members: updated });
    setNewMemberName("");
  };

  // Remove member — sync to chat
  const removeMember = async (member) => {
    patchProject(project.id, { members: members.filter(m => m.id !== member.id) });
    // Remove from Supabase chat
    if (supabase && project.chatId && member.supaId) {
      try {
        await supabase.from("conversation_members").delete()
          .eq("conversation_id", project.chatId).eq("user_id", member.supaId);
        await supabase.from("messages").insert({
          conversation_id: project.chatId,
          sender_id: userId,
          content: `👤 ${member.name} đã rời dự án`,
          type: "system",
        });
      } catch (e) { console.warn("Remove member from chat failed:", e); }
    }
  };

  const assignTask = (taskId, memberName) => {
    patchTask(taskId, { assignee: memberName });
    setAssigningId(null);
  };

  const unassigned = tasks.filter(t => !t.projectId && !t.deleted);

  const statusDot = (s) => s === "done" ? C.green : s === "inprogress" ? "#e67e22" : C.border;

  // Profiles not yet in project
  const availableProfiles = teamProfiles.filter(p =>
    !members.some(m => m.supaId === p.id) &&
    (!memberSearch || p.display_name?.toLowerCase().includes(memberSearch.toLowerCase()))
  );

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"flex-end", justifyContent:"center", animation:"fadeIn .15s" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:C.bg, borderRadius:"20px 20px 0 0", padding:"20px 18px 32px", width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 -8px 40px rgba(0,0,0,.2)" }}>

        {/* ── Header ── */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
          <span style={{ width:14, height:14, borderRadius:"50%", background:project.color, flexShrink:0 }} />
          {editName ? (
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              onBlur={saveName} onKeyDown={e => { if (e.key === "Enter") saveName(); }}
              style={{ flex:1, fontSize:18, fontWeight:700, border:`1px solid ${C.accent}`, borderRadius:8, padding:"4px 8px", outline:"none", color:C.text, background:C.card }} />
          ) : (
            <div className={isStaff ? "" : "tap"} onClick={() => { if (!isStaff) setEditName(true); }}
              style={{ flex:1, fontSize:18, fontWeight:700, color:C.text, cursor: isStaff ? "default" : "pointer" }}>{project.name}</div>
          )}
          {onOpenChat && <span className="tap" onClick={() => onOpenChat(project)}
            style={{ fontSize:18, cursor:"pointer", padding:"4px 6px", background:C.accentD, borderRadius:8 }} title="Chat dự án">💬</span>}
          <span className="tap" onClick={onClose} style={{ fontSize:20, color:C.muted, cursor:"pointer", padding:"4px 8px" }}>✕</span>
        </div>

        {/* ── Progress bar ── */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
          <div style={{ flex:1, height:6, background:C.border, borderRadius:3, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${pct}%`, background:project.color, borderRadius:3, transition:"width .3s" }} />
          </div>
          <span style={{ fontSize:12, fontWeight:700, color:project.color }}>{pct}%</span>
          <span style={{ fontSize:11, color:C.muted }}>{doneTasks.length}/{projTasks.length}</span>
        </div>

        {/* ── Members (Nhân sự) ── */}
        <div style={{ marginBottom:12, padding:"8px 10px", background:C.card, borderRadius:10, border:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
            <span style={{ fontSize:11, fontWeight:700, color:C.text }}>👥 Nhân sự ({members.length})</span>
            {!isStaff && <span className="tap" onClick={() => setShowMemberPicker(v => !v)}
              style={{ fontSize:10, padding:"2px 8px", borderRadius:6, background:C.accent, color:"#fff", fontWeight:700, cursor:"pointer" }}>+ Thêm</span>}
          </div>
          <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:members.length ? 6 : 0 }}>
            {members.map(m => (
              <span key={m.id} style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:8, background: m.name === myName ? `${project.color}22` : C.bg, border:`1px solid ${m.name === myName ? project.color : C.border}`, fontSize:11, color: m.name === myName ? project.color : C.text, fontWeight: m.name === myName ? 700 : 400 }}>
                {m.supaId && <span style={{ width:16, height:16, borderRadius:"50%", background: m.avatarColor || C.accent, display:"inline-flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:8, fontWeight:700, flexShrink:0 }}>{(m.name||"?")[0].toUpperCase()}</span>}
                {m.name}{m.name === myName ? " (bạn)" : ""}
                {!isStaff && m.name !== myName && <span className="tap" onClick={() => removeMember(m)} style={{ fontSize:12, color:C.red, cursor:"pointer", lineHeight:1 }}>×</span>}
              </span>
            ))}
          </div>

          {/* Member picker dropdown */}
          {!isStaff && showMemberPicker && (() => {
            // Dev accounts as fallback when no Supabase profiles
            const DEV_STAFF = [
              { id: "trinh", display_name: "Nguyen Duy Trinh", avatar_color: "#9b59b6" },
              { id: "lien",  display_name: "Lientran",         avatar_color: "#e74c3c" },
              { id: "hung",  display_name: "Pham Van Hung",    avatar_color: "#3498db" },
              { id: "mai",   display_name: "Tran Thi Mai",     avatar_color: "#27ae60" },
              { id: "duc",   display_name: "Le Minh Duc",      avatar_color: "#8e44ad" },
            ];
            // Merge Supabase + DEV accounts (skip duplicates by normalized name)
            const norm = s => (s || "").toLowerCase().replace(/\s+/g, "");
            const merged = [...teamProfiles];
            DEV_STAFF.forEach(d => { if (!merged.some(p => p.id === d.id || norm(p.display_name) === norm(d.display_name))) merged.push(d); });
            const available = merged.filter(p =>
              !members.some(m => (m.supaId === p.id) || (m.name === p.display_name) || norm(m.name) === norm(p.display_name)) &&
              (!memberSearch || p.display_name?.toLowerCase().includes(memberSearch.toLowerCase()))
            );
            const isDevMode = teamProfiles.length === 0;

            return (
              <div style={{ marginTop:6, padding:"6px", background:C.bg, borderRadius:8, border:`1px solid ${C.accent}33` }}>
                <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
                  placeholder="Tìm thành viên..."
                  autoFocus
                  style={{ width:"100%", fontSize:11, border:`1px solid ${C.border}`, borderRadius:6, padding:"5px 8px", outline:"none", color:C.text, background:C.card, boxSizing:"border-box", marginBottom:4 }} />
                <div style={{ maxHeight:150, overflowY:"auto" }}>
                  {available.length === 0 && (
                    <div style={{ fontSize:11, color:C.muted, padding:"6px 0", textAlign:"center" }}>Đã thêm hết</div>
                  )}
                  {available.map(p => (
                    <div key={p.id} className="tap" onClick={() => {
                      if (isDevMode) {
                        // Dev mode: add by name directly
                        const updated = [...members, { name: p.display_name, avatarColor: p.avatar_color, id: Date.now() }];
                        patchProject(project.id, { members: updated });
                      } else {
                        addMemberFromProfile(p);
                      }
                    }}
                      style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 4px", cursor:"pointer", borderBottom:`1px solid ${C.border}11` }}>
                      <div style={{ width:26, height:26, borderRadius:"50%", background: p.avatar_color || C.accent, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:11, fontWeight:700, flexShrink:0 }}>
                        {(p.display_name || "?")[0].toUpperCase()}
                      </div>
                      <span style={{ flex:1, fontSize:12, fontWeight:500, color:C.text }}>{p.display_name}</span>
                      <span style={{ fontSize:11, color:C.accent, fontWeight:600 }}>+ Thêm</span>
                    </div>
                  ))}
                </div>
                {/* Manual name input */}
                <div style={{ display:"flex", gap:4, marginTop:4, borderTop:`1px solid ${C.border}22`, paddingTop:4 }}>
                  <input value={newMemberName} onChange={e => setNewMemberName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addMemberByName(); }}
                    placeholder="Hoặc gõ tên..."
                    style={{ flex:1, fontSize:10, border:`1px solid ${C.border}`, borderRadius:4, padding:"4px 6px", outline:"none", color:C.text, background:C.card }} />
                  <button className="tap" onClick={addMemberByName}
                    style={{ padding:"4px 8px", borderRadius:4, border:"none", background:C.muted, color:"#fff", fontSize:10, fontWeight:600, opacity:newMemberName.trim()?1:0.4 }}>+</button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── View mode toggle ── */}
        <div style={{ display:"flex", gap:6, marginBottom:12 }}>
          {[["steps","Theo quy trình"],["list","Danh sách"]].map(([k,l]) => (
            <button key={k} className="tap" onClick={() => setViewMode(k)}
              style={{ flex:1, padding:"5px 0", borderRadius:8, fontSize:11, fontWeight:600, border:`1px solid ${viewMode===k?project.color:C.border}`, background:viewMode===k?project.color+"18":C.card, color:viewMode===k?project.color:C.sub }}>{l}</button>
          ))}
        </div>

        {/* ── VIEW: Steps (workflow order) ── */}
        {viewMode === "steps" && (
          <div style={{ marginBottom:14 }}>
            {steps.length === 0 && <div style={{ fontSize:11, color:C.muted, padding:"6px 0" }}>Chưa có quy trình — thêm bên dưới</div>}
            {steps.map((s, i) => {
              const stepTasks = tasksByStep[i] || [];
              const stepDone = stepTasks.every(t => t.status === "done") && stepTasks.length > 0;
              const stepActive = stepTasks.some(t => t.status === "inprogress");
              return (
                <div key={i} style={{ marginBottom:2 }}>
                  <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:22, flexShrink:0 }}>
                      <div style={{ width:20, height:20, borderRadius:"50%",
                        background: stepDone ? C.green : stepActive ? "#e67e22" : C.border,
                        color:"#fff", fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center",
                        border: stepActive ? "2px solid #e67e22" : "none" }}>{stepDone ? "✓" : i+1}</div>
                      {i < steps.length - 1 && <div style={{ width:2, height:16, background:C.border, margin:"2px 0" }} />}
                    </div>
                    <div style={{ flex:1, minWidth:0, paddingBottom:6 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        {!isStaff && editStepIdx === i ? (
                          <input autoFocus value={editStepText} onChange={e => setEditStepText(e.target.value)}
                            onBlur={() => saveEditStep(i)} onKeyDown={e => { if (e.key === "Enter") saveEditStep(i); if (e.key === "Escape") setEditStepIdx(null); }}
                            style={{ flex:1, fontSize:12, fontWeight:600, border:`1px solid ${C.accent}`, borderRadius:6, padding:"2px 6px", outline:"none", color:C.text, background:C.card }} />
                        ) : (
                          <span className={isStaff ? "" : "tap"} onClick={() => { if (!isStaff) { setEditStepIdx(i); setEditStepText(s); } }}
                            style={{ fontSize:12, fontWeight:600, color: stepDone ? C.green : C.text, textDecoration: stepDone ? "line-through" : "none", cursor: isStaff ? "default" : "pointer" }}>{s}</span>
                        )}
                        {!isStaff && <span className="tap" onClick={() => removeStep(i)} style={{ fontSize:11, color:C.red, cursor:"pointer", opacity:0.5 }}>×</span>}
                      </div>
                      {stepTasks.map(t => (
                        <div key={t.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"3px 0 3px 4px", marginTop:2, opacity: isStaff && t.assignee && t.assignee !== myName ? 0.4 : 1 }}>
                          <span style={{ width:7, height:7, borderRadius:"50%", background:statusDot(t.status), flexShrink:0 }} />
                          <span style={{ flex:1, fontSize:11, color: t.status === "done" ? C.muted : C.sub, textDecoration: t.status === "done" ? "line-through" : "none", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.title.replace(/^\d+\.\s*/, "")}</span>
                          {!isStaff && assigningId === t.id ? (
                            <div style={{ display:"flex", gap:2, flexWrap:"wrap" }}>
                              {members.map(m => (
                                <span key={m.id} className="tap" onClick={() => assignTask(t.id, m.name)}
                                  style={{ fontSize:9, padding:"2px 6px", borderRadius:6, background:C.accentD, color:C.accent, cursor:"pointer", border:`1px solid ${C.accent}33` }}>{m.name}</span>
                              ))}
                              <span className="tap" onClick={() => { assignTask(t.id, null); }}
                                style={{ fontSize:9, padding:"2px 6px", borderRadius:6, background:C.redD, color:C.red, cursor:"pointer" }}>bỏ</span>
                            </div>
                          ) : (
                            <span className={isStaff ? "" : "tap"} onClick={() => { if (!isStaff) setAssigningId(t.id); }}
                              style={{ fontSize:9, padding:"2px 6px", borderRadius:6, background: t.assignee ? (t.assignee === myName ? project.color+"33" : project.color+"18") : C.bg, color: t.assignee ? project.color : C.muted, cursor: isStaff ? "default" : "pointer", border:`1px solid ${C.border}`, whiteSpace:"nowrap", fontWeight: t.assignee === myName ? 700 : 400 }}>
                              {t.assignee || (isStaff ? "—" : "Giao")}
                            </span>
                          )}
                          {!isStaff && <span className="tap" onClick={() => patchTask(t.id, { projectId: null, stepIndex: null, assignee: null })}
                            style={{ fontSize:9, color:C.red, cursor:"pointer", opacity:0.5 }}>×</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Unlinked tasks (no stepIndex) */}
            {(tasksByStep[-1] || []).length > 0 && (
              <div style={{ marginTop:8, padding:"6px 8px", background:C.card, borderRadius:8, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:10, fontWeight:600, color:C.muted, marginBottom:4 }}>Công việc thêm</div>
                {tasksByStep[-1].map(t => (
                  <div key={t.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"3px 0" }}>
                    <span style={{ width:7, height:7, borderRadius:"50%", background:statusDot(t.status), flexShrink:0 }} />
                    <span style={{ flex:1, fontSize:11, color:C.sub }}>{t.title}</span>
                    {!isStaff && assigningId === t.id ? (
                      <div style={{ display:"flex", gap:2, flexWrap:"wrap" }}>
                        {members.map(m => (
                          <span key={m.id} className="tap" onClick={() => assignTask(t.id, m.name)}
                            style={{ fontSize:9, padding:"2px 6px", borderRadius:6, background:C.accentD, color:C.accent, cursor:"pointer" }}>{m.name}</span>
                        ))}
                        <span className="tap" onClick={() => assignTask(t.id, null)}
                          style={{ fontSize:9, padding:"2px 6px", borderRadius:6, background:C.redD, color:C.red, cursor:"pointer" }}>bỏ</span>
                      </div>
                    ) : (
                      <span className={isStaff ? "" : "tap"} onClick={() => { if (!isStaff) setAssigningId(t.id); }}
                        style={{ fontSize:9, padding:"2px 6px", borderRadius:6, background: t.assignee ? project.color+"22" : C.bg, color: t.assignee ? project.color : C.muted, cursor: isStaff ? "default" : "pointer", border:`1px solid ${C.border}` }}>
                        {t.assignee || (isStaff ? "—" : "Giao")}
                      </span>
                    )}
                    {!isStaff && <span className="tap" onClick={() => patchTask(t.id, { projectId: null, stepIndex: null, assignee: null })}
                      style={{ fontSize:9, color:C.red, cursor:"pointer", opacity:0.5 }}>×</span>}
                  </div>
                ))}
              </div>
            )}
            {/* Add step — manager only */}
            {!isStaff && <div style={{ display:"flex", gap:6, marginTop:10, alignItems:"center" }}>
              <input value={newStep} onChange={e => setNewStep(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addStep(); }}
                placeholder={`+ Bước ${steps.length+1}...`}
                style={{ flex:1, fontSize:12, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", outline:"none", color:C.text, background:C.card }} />
              <button className="tap" onClick={addStep}
                style={{ padding:"6px 12px", borderRadius:8, border:"none", background:project.color, color:"#fff", fontSize:12, fontWeight:700, opacity:newStep.trim()?1:0.4 }}>+</button>
            </div>}
          </div>
        )}

        {/* ── VIEW: Flat list ── */}
        {viewMode === "list" && (
          <div style={{ marginBottom:14 }}>
            {projTasks.length === 0 && <div style={{ fontSize:11, color:C.muted, padding:"6px 0" }}>Chưa có công việc</div>}
            {projTasks.map(t => (
              <div key={t.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}22` }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:statusDot(t.status), flexShrink:0 }} />
                <span style={{ flex:1, fontSize:12, color: t.status === "done" ? C.muted : C.text, textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.title}</span>
                {t.assignee && <span style={{ fontSize:9, padding:"2px 6px", borderRadius:6, background:project.color+"18", color:project.color, fontWeight: t.assignee === myName ? 700 : 400 }}>{t.assignee}</span>}
                {!isStaff && <span className="tap" onClick={() => patchTask(t.id, { projectId: null, stepIndex: null, assignee: null })}
                  style={{ fontSize:10, color:C.red, cursor:"pointer", padding:"2px 6px" }}>gỡ</span>}
              </div>
            ))}
          </div>
        )}

        {/* ── Create new task for project ── */}
        {!isStaff && addTask && (
          <div style={{ display:"flex", gap:6, marginBottom:14 }}>
            <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && newTaskTitle.trim()) {
                  addTask({ title: newTaskTitle.trim(), projectId: project.id, category: "work" });
                  setNewTaskTitle("");
                }
              }}
              placeholder="Tạo việc mới cho dự án..."
              style={{ flex:1, padding:"8px 12px", borderRadius:8, border:`1px solid ${C.border}`, background:C.card, fontSize:12, color:C.text }} />
            <button className="tap" onClick={() => {
              if (!newTaskTitle.trim()) return;
              addTask({ title: newTaskTitle.trim(), projectId: project.id, category: "work" });
              setNewTaskTitle("");
            }}
              disabled={!newTaskTitle.trim()}
              style={{ padding:"8px 14px", borderRadius:8, border:"none", background: newTaskTitle.trim() ? project.color : C.border, color:"#fff", fontSize:12, fontWeight:700 }}>+</button>
          </div>
        )}

        {/* ── Assign existing tasks — manager only ── */}
        {!isStaff && unassigned.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:600, color:C.muted, marginBottom:6 }}>Thêm việc có sẵn vào dự án</div>
            <div style={{ maxHeight:120, overflowY:"auto" }}>
              {unassigned.map(t => (
                <div key={t.id} className="tap" onClick={() => patchTask(t.id, { projectId: project.id })}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 8px", borderRadius:8, cursor:"pointer", fontSize:12, color:C.sub, marginBottom:3, background:C.card, border:`1px solid ${C.border}` }}>
                  <span style={{ color:project.color, fontWeight:700 }}>+</span> {t.title}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div style={{ display:"flex", gap:8 }}>
          {onOpenChat && <button className="tap" onClick={() => onOpenChat(project)}
            style={{ flex:1, padding:"10px", borderRadius:12, border:`1px solid ${project.color}44`, background:project.color+"12", color:project.color, fontSize:13, fontWeight:600 }}>
            💬 Chat dự án
          </button>}
          {!isStaff && <button className="tap" onClick={() => {
            const choice = prompt("Xoá dự án \"" + project.name + "\"?\n\n1 = Xóa dự án, giữ công việc (thành Việc chung)\n2 = Xóa dự án + xóa luôn công việc\n\nNhập 1 hoặc 2:");
            if (choice === "1") { projTasks.forEach(t => patchTask(t.id, { projectId: null, stepIndex: null, assignee: null })); deleteProject(project.id); }
            else if (choice === "2") { projTasks.forEach(t => hardDelete?.(t.id)); deleteProject(project.id); }
          }}
            style={{ flex:1, padding:"10px", borderRadius:12, border:`1px solid ${C.red}44`, background:C.redD, color:C.red, fontSize:13, fontWeight:600 }}>
            Xoá dự án
          </button>}
        </div>
      </div>
    </div>
  );
}
