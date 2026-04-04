/* NewProjectModal — create project with custom workflow + members */
import { useState, useRef, useEffect } from "react";
import { C, PROJECT_COLORS, WORKFLOWS, TEAM_ACCOUNTS } from "../../constants";
import { useSettings } from "../../store";
import { useSupabase } from "../../contexts/SupabaseContext";
import { supabase } from "../../lib/supabase";

// Hardcoded local ID to Supabase UUID mapping (guaranteed fallback)
const LOCAL_ID_TO_UUID = {
  trinh: "52bd2c76-6ff0-404c-8900-d05984e9271b",
  lien: "8a1fa1fa-e068-4164-981f-fcd20a988744",
  hung: "bf3cbd15-a783-420c-91dd-823bc2a23702",
  mai: "80fb3b1e-f0ca-4850-bbda-fb6e8cdd25c9",
  duc: "516cb441-6615-4df4-9993-0fe16b5acaf0",
};

export default function NewProjectModal({ onAdd, onClose }) {
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
  const [selectedMembers, setSelectedMembers] = useState([]);
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

  // Team accounts derived from constants.js
  const TEAM_STAFF = TEAM_ACCOUNTS.map(a => ({ id: a.id, display_name: a.name, avatar_color: a.color, role: a.role, title: a.title }));
  const normalize = s => (s || "").toLowerCase().replace(/\s+/g, "");
  // Use team list as base, enrich with Supabase profile IDs
  const allProfiles = TEAM_STAFF.map(d => {
    const supaMatch = teamProfiles.find(p => normalize(p.display_name) === normalize(d.display_name));
    if (supaMatch) return { ...d, supaId: supaMatch.id, avatar_color: supaMatch.avatar_color || d.avatar_color };
    const fallback = teamProfiles.find(p => {
      const pn = normalize(p.display_name);
      const dn = normalize(d.display_name);
      return pn.includes(dn) || dn.includes(pn);
    });
    if (fallback) return { ...d, supaId: fallback.id, avatar_color: fallback.avatar_color || d.avatar_color };
    if (LOCAL_ID_TO_UUID[d.id]) return { ...d, supaId: LOCAL_ID_TO_UUID[d.id] };
    return d;
  });
  // Filter out current user
  const localSession = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}"); } catch { return {}; } })();
  const myName = normalize(localSession.name);
  const filteredProfiles = allProfiles.filter(p =>
    p.id !== localSession.id && normalize(p.display_name) !== myName &&
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
    const myDisplayName = settings.displayName || session?.user?.user_metadata?.full_name || "Toi";
    const members = [
      { supaId: userId, name: myDisplayName, id: Date.now() },
      ...selectedMembers.map((m, i) => ({ ...m, id: Date.now() + i + 1 })),
    ];
    onAdd({
      name: name.trim(),
      color,
      steps: finalSteps,
      workflowId: null,
      members,
      selectedSupaMembers: selectedMembers.map(m => m.supaId).filter(Boolean),
    });
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1000, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"center", justifyContent:"center", padding:16, animation:"fadeIn .15s" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:C.bg, borderRadius:20, padding:20, width:"100%", maxWidth:400, maxHeight:"85vh", overflowY:"auto", boxShadow:"0 12px 40px rgba(0,0,0,.2)" }}>
        <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:14 }}>Tao du an moi</div>

        {/* Name */}
        <input autoFocus value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && wfMode === "none" && !selectedMembers.length) submit(); }}
          placeholder="Ten du an (VD: Cong trinh nha anh Phuong)"
          style={{ width:"100%", fontSize:14, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 14px", outline:"none", color:C.text, background:C.card, boxSizing:"border-box", marginBottom:12 }} />

        {/* Color */}
        <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:11, color:C.muted, fontWeight:600 }}>Mau:</span>
          {PROJECT_COLORS.map(c => (
            <div key={c} className="tap" onClick={() => setColor(c)}
              style={{ width:24, height:24, borderRadius:"50%", background:c, cursor:"pointer",
                border: color === c ? "3px solid #fff" : "2px solid transparent",
                boxShadow: color === c ? `0 0 0 2px ${c}` : "none" }} />
          ))}
        </div>

        {/* Members picker */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:6 }}>{"\u{1F465}"} Thanh vien du an</div>
          {selectedMembers.length > 0 && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:6 }}>
              {selectedMembers.map(m => (
                <span key={m.supaId} className="tap" onClick={() => toggleMember({ id: m.supaId, display_name: m.name })}
                  style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:8, background:`${C.accent}15`, color:C.accent, fontSize:11, fontWeight:600, cursor:"pointer" }}>
                  {m.name} {"\u2715"}
                </span>
              ))}
            </div>
          )}
          <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
            placeholder="Tim thanh vien..."
            style={{ width:"100%", fontSize:12, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", outline:"none", color:C.text, background:C.card, boxSizing:"border-box", marginBottom:4 }} />
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
                    {isSel && "\u2713"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Workflow mode selector */}
        <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:8 }}>Quy trinh</div>
        <div style={{ display:"flex", gap:6, marginBottom:12 }}>
          {[["none","Khong can"],["template","Chon mau"],["custom","Tu tao"]].map(([k,l]) => (
            <button key={k} className="tap" onClick={() => { setWfMode(k); if (k !== "template") setSteps(k === "none" ? [] : steps); }}
              style={{ flex:1, padding:"6px 0", borderRadius:10, fontSize:12, fontWeight:600, border:`1px solid ${wfMode===k?C.accent:C.border}`, background:wfMode===k?C.accentD:C.card, color:wfMode===k?C.accent:C.sub }}>{l}</button>
          ))}
        </div>

        {/* Template selector */}
        {wfMode === "template" && (
          <div style={{ marginBottom:12 }}>
            {customWfs.length > 0 && <div style={{ fontSize:10, fontWeight:600, color:C.accent, marginBottom:4 }}>Mau cong ty</div>}
            <div className="no-scrollbar" style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:customWfs.length > 0 ? 6 : 8, flexWrap:"wrap" }}>
              {customWfs.map(w => (
                <button key={w.id} className="tap" onClick={() => selectTemplate(w.id)}
                  style={{ flexShrink:0, padding:"5px 12px", borderRadius:10, fontSize:11, fontWeight:600, border:`1px solid ${templateId===w.id?C.accent:C.border}`, background:templateId===w.id?C.accentD:C.card, color:templateId===w.id?C.accent:C.sub }}>
                  {w.name}
                </button>
              ))}
            </div>
            {customWfs.length > 0 && <div style={{ fontSize:10, fontWeight:600, color:C.muted, marginBottom:4 }}>Mau mac dinh</div>}
            <div className="no-scrollbar" style={{ display:"flex", gap:6, overflowX:"auto", marginBottom:8 }}>
              {WORKFLOWS.map(w => (
                <button key={w.id} className="tap" onClick={() => selectTemplate(w.id)}
                  style={{ flexShrink:0, padding:"5px 12px", borderRadius:10, fontSize:11, fontWeight:600, border:`1px solid ${templateId===w.id?C.accent:C.border}`, background:templateId===w.id?C.accentD:C.card, color:templateId===w.id?C.accent:C.sub }}>
                  {w.name}
                </button>
              ))}
            </div>
            {steps.length > 0 && <div style={{ fontSize:10, color:C.muted }}>Co the chinh sua cac buoc ben duoi</div>}
          </div>
        )}

        {/* Custom steps editor */}
        {wfMode !== "none" && (
          <div style={{ marginBottom:14 }}>
            {steps.map((s, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 0" }}>
                <span style={{ fontSize:11, fontWeight:700, color:C.accent, width:18, textAlign:"center" }}>{i+1}</span>
                <span style={{ flex:1, fontSize:12, color:C.text }}>{s}</span>
                <span className="tap" onClick={() => moveStep(i, -1)} style={{ fontSize:12, color:C.muted, cursor:"pointer", padding:"0 3px", opacity: i === 0 ? 0.3 : 1 }}>{"\u25B2"}</span>
                <span className="tap" onClick={() => moveStep(i, 1)} style={{ fontSize:12, color:C.muted, cursor:"pointer", padding:"0 3px", opacity: i === steps.length-1 ? 0.3 : 1 }}>{"\u25BC"}</span>
                <span className="tap" onClick={() => removeStep(i)} style={{ fontSize:14, color:C.red, cursor:"pointer", padding:"0 4px" }}>{"\u00D7"}</span>
              </div>
            ))}
            <div style={{ display:"flex", gap:6, marginTop:6, alignItems:"center" }}>
              <input ref={stepRef} value={newStep} onChange={e => setNewStep(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addStep(); }}
                placeholder={`Buoc ${steps.length+1}...`}
                style={{ flex:1, fontSize:12, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", outline:"none", color:C.text, background:C.card }} />
              <button className="tap" onClick={addStep}
                style={{ padding:"6px 12px", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:700, opacity:newStep.trim()?1:0.4 }}>+</button>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display:"flex", gap:8 }}>
          <button className="tap" onClick={onClose}
            style={{ flex:1, padding:"10px", borderRadius:12, border:`1px solid ${C.border}`, background:C.card, color:C.sub, fontSize:14, fontWeight:600 }}>Huy</button>
          <button className="tap" onClick={submit}
            style={{ flex:1, padding:"10px", borderRadius:12, border:"none", background:C.accent, color:"#fff", fontSize:14, fontWeight:700, opacity: name.trim() ? 1 : 0.4 }}>Tao</button>
        </div>
      </div>
    </div>
  );
}
