/* ProjectDetailSheet — workflow-centric view with members, steps, tasks */
import { useState, useEffect } from "react";
import { C, TEAM_ACCOUNTS } from "../../constants";
import { useSupabase } from "../../contexts/SupabaseContext";
import { supabase } from "../../lib/supabase";
import { cloudLoad, cloudSave } from "../../services";

// Hardcoded UUID fallback
const LOCAL_ID_TO_UUID_EDIT = {
  trinh: "52bd2c76-6ff0-404c-8900-d05984e9271b",
  lien: "8a1fa1fa-e068-4164-981f-fcd20a988744",
  hung: "bf3cbd15-a783-420c-91dd-823bc2a23702",
  mai: "80fb3b1e-f0ca-4850-bbda-fb6e8cdd25c9",
  duc: "516cb441-6615-4df4-9993-0fe16b5acaf0",
};

const DEV_NAME_TO_LOCAL = {
  "Nguyen Duy Trinh": "trinh", "Lientran": "lien", "Pham Van Hung": "hung",
  "Tran Thi Mai": "mai", "Le Minh Duc": "duc",
};

export default function ProjectDetailSheet({ project, tasks, patchTask, addTask, patchProject, hardDelete, deleteProject, onClose, onOpenChat, isStaff, myName }) {
  const { session } = useSupabase();
  const userId = session?.user?.id;
  const localSession = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}"); } catch { return {}; } })();
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState(project.name);
  const [newStep, setNewStep] = useState("");
  const [editStepIdx, setEditStepIdx] = useState(null);
  const [editStepText, setEditStepText] = useState("");
  const [assigningId, setAssigningId] = useState(null);
  const [viewMode, setViewMode] = useState("steps");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Supabase profiles for member picker
  const [teamProfiles, setTeamProfiles] = useState([]);
  const [newMemberName, setNewMemberName] = useState("");

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
    const newName = name.trim();
    if (newName && newName !== project.name) {
      patchProject(project.id, { name: newName });
      if (supabase && project.chatId) {
        supabase.from("conversations").update({ name: newName }).eq("id", project.chatId).then(() => {}).catch(() => {});
      }
    }
    setEditName(false);
  };

  const updateSteps = (newSteps) => patchProject(project.id, { steps: newSteps });
  const addStepFn = () => {
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

  // Add member from Supabase profile
  const addMemberFromProfile = async (profile) => {
    const alreadyExists = members.some(m => m.supaId === profile.id);
    if (alreadyExists) return;
    const updated = [...members, { supaId: profile.id, name: profile.display_name, avatarColor: profile.avatar_color, id: Date.now() }];
    patchProject(project.id, { members: updated });

    if (supabase && project.chatId) {
      try {
        await supabase.from("conversation_members").insert({ conversation_id: project.chatId, user_id: profile.id });
        await supabase.from("messages").insert({
          conversation_id: project.chatId, sender_id: userId,
          content: `\u{1F464} ${profile.display_name} \u0111\u00e3 \u0111\u01b0\u1ee3c th\u00eam v\u00e0o d\u1ef1 \u00e1n`,
          type: "system",
        });
      } catch (e) { console.warn("Sync member to chat failed:", e); }
    }
  };

  const addMemberByName = () => {
    if (!newMemberName.trim()) return;
    const updated = [...members, { name: newMemberName.trim(), id: Date.now() }];
    patchProject(project.id, { members: updated });
    setNewMemberName("");
  };

  // Remove member
  const removeMember = async (member) => {
    patchProject(project.id, { members: members.filter(m => m.id !== member.id) });
    if (supabase && project.chatId && member.supaId) {
      try {
        await supabase.from("conversation_members").delete()
          .eq("conversation_id", project.chatId).eq("user_id", member.supaId);
        await supabase.from("messages").insert({
          conversation_id: project.chatId, sender_id: userId,
          content: `\u{1F464} ${member.name} \u0111\u00e3 r\u1eddi d\u1ef1 \u00e1n`,
          type: "system",
        });
      } catch (e) { console.warn("Remove member from chat failed:", e); }
    }
    const localId = DEV_NAME_TO_LOCAL[member.name];
    if (localId) {
      try {
        const ep = await cloudLoad(null, localId, "projects");
        const cp = Array.isArray(ep?.data) ? ep.data : [];
        const filtered = cp.filter(p => p.id !== project.id);
        if (filtered.length !== cp.length) await cloudSave(null, localId, "projects", filtered);
        const et = await cloudLoad(null, localId, "tasks");
        const ct = Array.isArray(et?.data) ? et.data : [];
        const filteredT = ct.filter(t => t.projectId !== project.id);
        if (filteredT.length !== ct.length) await cloudSave(null, localId, "tasks", filteredT);
      } catch (e) { console.warn("Clean member cloud failed:", e); }
    }
  };

  const assignTask = (taskId, memberName) => {
    const member = members.find(m => m.name === memberName);
    patchTask(taskId, { assignee: memberName, assigneeId: member?.supaId || null });
    setAssigningId(null);
  };

  const unassigned = tasks.filter(t => !t.projectId && !t.deleted);
  const statusDot = (s) => s === "done" ? C.green : s === "inprogress" ? "#e67e22" : C.border;

  // Team accounts
  const TEAM_STAFF_EDIT = TEAM_ACCOUNTS.map(a => ({ id: a.id, display_name: a.name, avatar_color: a.color }));
  const norm = s => (s || "").toLowerCase().replace(/\s+/g, "");
  const teamList = TEAM_STAFF_EDIT.map(d => {
    const supaMatch = teamProfiles.find(p => norm(p.display_name) === norm(d.display_name));
    if (supaMatch) return { ...d, supaId: supaMatch.id, avatar_color: supaMatch.avatar_color || d.avatar_color };
    if (LOCAL_ID_TO_UUID_EDIT[d.id]) return { ...d, supaId: LOCAL_ID_TO_UUID_EDIT[d.id] };
    return d;
  });

  // Delete helpers
  const deleteWithTasks = async () => {
    const allLids = members.map(m => DEV_NAME_TO_LOCAL[m.name]).filter(Boolean);
    if (localSession.id && !allLids.includes(localSession.id)) allLids.push(localSession.id);
    const cleanupPromises = allLids.map(async (lid) => {
      try {
        const ep = await cloudLoad(null, lid, "projects");
        const cp = Array.isArray(ep?.data) ? ep.data : [];
        const filtered = cp.filter(p => p.id !== project.id);
        if (filtered.length !== cp.length) await cloudSave(null, lid, "projects", filtered);
        const et = await cloudLoad(null, lid, "tasks");
        const ct = Array.isArray(et?.data) ? et.data : [];
        const filteredT = ct.filter(t => t.projectId !== project.id);
        if (filteredT.length !== ct.length) await cloudSave(null, lid, "tasks", filteredT);
      } catch {}
    });
    const chatCleanup = (supabase && project.chatId) ? (async () => {
      try {
        await supabase.from("messages").delete().eq("conversation_id", project.chatId);
        await supabase.from("conversation_members").delete().eq("conversation_id", project.chatId);
        await supabase.from("conversations").delete().eq("id", project.chatId);
      } catch {}
    })() : Promise.resolve();
    await Promise.all([...cleanupPromises, chatCleanup]);
    projTasks.forEach(t => hardDelete?.(t.id));
    deleteProject(project.id);
    onClose();
  };

  const deleteKeepTasks = async () => {
    const allLids = members.map(m => DEV_NAME_TO_LOCAL[m.name]).filter(Boolean);
    if (localSession.id && !allLids.includes(localSession.id)) allLids.push(localSession.id);
    const cleanupPromises = allLids.map(async (lid) => {
      try {
        const ep = await cloudLoad(null, lid, "projects");
        const cp = Array.isArray(ep?.data) ? ep.data : [];
        const filtered = cp.filter(p => p.id !== project.id);
        if (filtered.length !== cp.length) await cloudSave(null, lid, "projects", filtered);
        const et = await cloudLoad(null, lid, "tasks");
        const ct = Array.isArray(et?.data) ? et.data : [];
        const updated = ct.map(t => t.projectId === project.id ? { ...t, projectId: null, stepIndex: null, assignee: null, assigneeId: null } : t);
        if (JSON.stringify(updated) !== JSON.stringify(ct)) await cloudSave(null, lid, "tasks", updated);
      } catch {}
    });
    const chatCleanup = (supabase && project.chatId) ? (async () => {
      try {
        await supabase.from("messages").delete().eq("conversation_id", project.chatId);
        await supabase.from("conversation_members").delete().eq("conversation_id", project.chatId);
        await supabase.from("conversations").delete().eq("id", project.chatId);
      } catch {}
    })() : Promise.resolve();
    await Promise.all([...cleanupPromises, chatCleanup]);
    projTasks.forEach(t => patchTask(t.id, { projectId: null, stepIndex: null, assignee: null, assigneeId: null }));
    deleteProject(project.id);
    onClose();
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"flex-end", justifyContent:"center", animation:"fadeIn .15s" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:C.bg, borderRadius:"20px 20px 0 0", padding:"20px 18px 32px", width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 -8px 40px rgba(0,0,0,.2)" }}>

        {/* Header */}
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
            style={{ fontSize:18, cursor:"pointer", padding:"4px 6px", background:C.accentD, borderRadius:8 }} title="Chat du an">{"\u{1F4AC}"}</span>}
          <span className="tap" onClick={onClose} style={{ fontSize:20, color:C.muted, cursor:"pointer", padding:"4px 8px" }}>{"\u2715"}</span>
        </div>

        {/* Progress bar */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
          <div style={{ flex:1, height:6, background:C.border, borderRadius:3, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${pct}%`, background:project.color, borderRadius:3, transition:"width .3s" }} />
          </div>
          <span style={{ fontSize:12, fontWeight:700, color:project.color }}>{pct}%</span>
          <span style={{ fontSize:11, color:C.muted }}>{doneTasks.length}/{projTasks.length}</span>
        </div>

        {/* Members (checkbox style) */}
        <div style={{ marginBottom:12, padding:"8px 10px", background:C.card, borderRadius:10, border:`1px solid ${C.border}` }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.text, marginBottom:6 }}>{"\u{1F465}"} Nhan su ({members.length})</div>
          {(() => {
            const allPeople = teamList;
            const isDevMode = teamProfiles.length === 0;
            return (
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {allPeople.map(p => {
                  const isMember = members.some(m => (p.supaId && m.supaId === p.supaId) || norm(m.name) === norm(p.display_name));
                  const isMe = norm(p.display_name) === norm(myName);
                  return (
                    <div key={p.id} className={isStaff ? "" : "tap"} onClick={() => {
                      if (isStaff) return;
                      if (isMember) {
                        if (isMe) return;
                        const m = members.find(m => (p.supaId && m.supaId === p.supaId) || norm(m.name) === norm(p.display_name));
                        if (m) removeMember(m);
                      } else {
                        if (isDevMode) {
                          const updated = [...members, { name: p.display_name, avatarColor: p.avatar_color, id: Date.now() }];
                          patchProject(project.id, { members: updated });
                        } else {
                          addMemberFromProfile(p);
                        }
                      }
                    }}
                      style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 4px", cursor: isStaff ? "default" : "pointer", borderRadius:6, background: isMember ? `${project.color}08` : "transparent" }}>
                      <div style={{ width:20, height:20, borderRadius:4, border:`2px solid ${isMember ? project.color : C.border}`, background: isMember ? project.color : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        {isMember && <span style={{ color:"#fff", fontSize:12, fontWeight:700, lineHeight:1 }}>{"\u2713"}</span>}
                      </div>
                      <div style={{ width:24, height:24, borderRadius:"50%", background: p.avatar_color || C.accent, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:10, fontWeight:700, flexShrink:0 }}>
                        {(p.display_name || "?")[0].toUpperCase()}
                      </div>
                      <span style={{ flex:1, fontSize:12, fontWeight: isMember ? 600 : 400, color: isMember ? C.text : C.sub }}>{p.display_name}{isMe ? " (ban)" : ""}</span>
                    </div>
                  );
                })}
                {!isStaff && (
                  <div style={{ display:"flex", gap:4, marginTop:4, borderTop:`1px solid ${C.border}22`, paddingTop:4 }}>
                    <input value={newMemberName} onChange={e => setNewMemberName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addMemberByName(); }}
                      placeholder="Them ten khac..."
                      style={{ flex:1, fontSize:10, border:`1px solid ${C.border}`, borderRadius:4, padding:"4px 6px", outline:"none", color:C.text, background:C.bg }} />
                    <button className="tap" onClick={addMemberByName}
                      style={{ padding:"4px 8px", borderRadius:4, border:"none", background:C.muted, color:"#fff", fontSize:10, fontWeight:600, opacity:newMemberName.trim()?1:0.4 }}>+</button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* View mode toggle */}
        <div style={{ display:"flex", gap:6, marginBottom:12 }}>
          {[["steps","Theo quy trinh"],["list","Danh sach"]].map(([k,l]) => (
            <button key={k} className="tap" onClick={() => setViewMode(k)}
              style={{ flex:1, padding:"5px 0", borderRadius:8, fontSize:11, fontWeight:600, border:`1px solid ${viewMode===k?project.color:C.border}`, background:viewMode===k?project.color+"18":C.card, color:viewMode===k?project.color:C.sub }}>{l}</button>
          ))}
        </div>

        {/* VIEW: Steps */}
        {viewMode === "steps" && (
          <div style={{ marginBottom:14 }}>
            {steps.length === 0 && <div style={{ fontSize:11, color:C.muted, padding:"6px 0" }}>Chua co quy trinh — them ben duoi</div>}
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
                        border: stepActive ? "2px solid #e67e22" : "none" }}>{stepDone ? "\u2713" : i+1}</div>
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
                        {!isStaff && <span className="tap" onClick={() => removeStep(i)} style={{ fontSize:11, color:C.red, cursor:"pointer", opacity:0.5 }}>{"\u00D7"}</span>}
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
                                style={{ fontSize:9, padding:"2px 6px", borderRadius:6, background:C.redD, color:C.red, cursor:"pointer" }}>bo</span>
                            </div>
                          ) : (
                            <span className={isStaff ? "" : "tap"} onClick={() => { if (!isStaff) setAssigningId(t.id); }}
                              style={{ fontSize:9, padding:"2px 6px", borderRadius:6, background: t.assignee ? (t.assignee === myName ? project.color+"33" : project.color+"18") : C.bg, color: t.assignee ? project.color : C.muted, cursor: isStaff ? "default" : "pointer", border:`1px solid ${C.border}`, whiteSpace:"nowrap", fontWeight: t.assignee === myName ? 700 : 400 }}>
                              {t.assignee || (isStaff ? "\u2014" : "Giao")}
                            </span>
                          )}
                          {!isStaff && <span className="tap" onClick={() => patchTask(t.id, { projectId: null, stepIndex: null, assignee: null, assigneeId: null })}
                            style={{ fontSize:9, color:C.red, cursor:"pointer", opacity:0.5 }}>{"\u00D7"}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Unlinked tasks */}
            {(tasksByStep[-1] || []).length > 0 && (
              <div style={{ marginTop:8, padding:"6px 8px", background:C.card, borderRadius:8, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:10, fontWeight:600, color:C.muted, marginBottom:4 }}>Cong viec them</div>
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
                          style={{ fontSize:9, padding:"2px 6px", borderRadius:6, background:C.redD, color:C.red, cursor:"pointer" }}>bo</span>
                      </div>
                    ) : (
                      <span className={isStaff ? "" : "tap"} onClick={() => { if (!isStaff) setAssigningId(t.id); }}
                        style={{ fontSize:9, padding:"2px 6px", borderRadius:6, background: t.assignee ? project.color+"22" : C.bg, color: t.assignee ? project.color : C.muted, cursor: isStaff ? "default" : "pointer", border:`1px solid ${C.border}` }}>
                        {t.assignee || (isStaff ? "\u2014" : "Giao")}
                      </span>
                    )}
                    {!isStaff && <span className="tap" onClick={() => patchTask(t.id, { projectId: null, stepIndex: null, assignee: null, assigneeId: null })}
                      style={{ fontSize:9, color:C.red, cursor:"pointer", opacity:0.5 }}>{"\u00D7"}</span>}
                  </div>
                ))}
              </div>
            )}
            {/* Add step */}
            {!isStaff && <div style={{ display:"flex", gap:6, marginTop:10, alignItems:"center" }}>
              <input value={newStep} onChange={e => setNewStep(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addStepFn(); }}
                placeholder={`+ Buoc ${steps.length+1}...`}
                style={{ flex:1, fontSize:12, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", outline:"none", color:C.text, background:C.card }} />
              <button className="tap" onClick={addStepFn}
                style={{ padding:"6px 12px", borderRadius:8, border:"none", background:project.color, color:"#fff", fontSize:12, fontWeight:700, opacity:newStep.trim()?1:0.4 }}>+</button>
            </div>}
          </div>
        )}

        {/* VIEW: Flat list */}
        {viewMode === "list" && (
          <div style={{ marginBottom:14 }}>
            {projTasks.length === 0 && <div style={{ fontSize:11, color:C.muted, padding:"6px 0" }}>Chua co cong viec</div>}
            {projTasks.map(t => (
              <div key={t.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:`1px solid ${C.border}22` }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:statusDot(t.status), flexShrink:0 }} />
                <span style={{ flex:1, fontSize:12, color: t.status === "done" ? C.muted : C.text, textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.title}</span>
                {t.assignee && <span style={{ fontSize:9, padding:"2px 6px", borderRadius:6, background:project.color+"18", color:project.color, fontWeight: t.assignee === myName ? 700 : 400 }}>{t.assignee}</span>}
                {!isStaff && <span className="tap" onClick={() => patchTask(t.id, { projectId: null, stepIndex: null, assignee: null, assigneeId: null })}
                  style={{ fontSize:10, color:C.red, cursor:"pointer", padding:"2px 6px" }}>go</span>}
              </div>
            ))}
          </div>
        )}

        {/* Create new task */}
        {!isStaff && addTask && (
          <div style={{ display:"flex", gap:6, marginBottom:14 }}>
            <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && newTaskTitle.trim()) {
                  addTask({ title: newTaskTitle.trim(), projectId: project.id, category: "work" });
                  setNewTaskTitle("");
                }
              }}
              placeholder="Tao viec moi cho du an..."
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

        {/* Assign existing tasks */}
        {!isStaff && unassigned.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:600, color:C.muted, marginBottom:6 }}>Them viec co san vao du an</div>
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

        {/* Actions */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {onOpenChat && <button className="tap" onClick={() => onOpenChat(project)}
            style={{ flex:1, minWidth:120, padding:"10px", borderRadius:12, border:`1px solid ${project.color}44`, background:project.color+"12", color:project.color, fontSize:13, fontWeight:600 }}>
            {"\u{1F4AC}"} Chat du an
          </button>}
          {!isStaff && <button className="tap" onClick={() => {
            patchProject(project.id, { archived: !project.archived });
            if (!project.archived) onClose();
          }}
            style={{ flex:1, minWidth:120, padding:"10px", borderRadius:12, border:`1px solid ${project.archived ? C.accent : C.green}44`, background: project.archived ? C.accentD : C.greenD, color: project.archived ? C.accent : C.green, fontSize:13, fontWeight:600 }}>
            {project.archived ? "\u{1F4C2} Mo lai" : "\u{1F4E6} Luu tru"}
          </button>}
          {!isStaff && !confirmDelete && <button className="tap" onClick={() => setConfirmDelete(true)}
            style={{ flex:1, minWidth:120, padding:"10px", borderRadius:12, border:`1px solid ${C.red}44`, background:C.redD, color:C.red, fontSize:13, fontWeight:600 }}>
            Xoa du an
          </button>}
        </div>

        {/* Delete confirmation */}
        {confirmDelete && (
          <div style={{ marginTop:12, padding:"12px 14px", background:`${C.red}08`, borderRadius:12, border:`1px solid ${C.red}33` }}>
            <div style={{ fontSize:13, fontWeight:600, color:C.red, marginBottom:8 }}>Xac nhan xoa "{project.name}"?</div>
            <div style={{ fontSize:11, color:C.sub, marginBottom:10 }}>Chon cach xu ly cong viec trong du an:</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              <button className="tap" onClick={deleteWithTasks}
                style={{ padding:"10px", borderRadius:8, border:"none", background:C.red, color:"#fff", fontSize:12, fontWeight:700 }}>Xoa du an + xoa luon cong viec</button>
              <button className="tap" onClick={deleteKeepTasks}
                style={{ padding:"10px", borderRadius:8, border:`1px solid ${C.border}`, background:C.card, color:C.sub, fontSize:12, fontWeight:600 }}>Xoa du an, giu lai cong viec</button>
              <button className="tap" onClick={() => setConfirmDelete(false)}
                style={{ padding:"8px", borderRadius:8, border:"none", background:"transparent", color:C.muted, fontSize:11, fontWeight:500 }}>Huy</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
