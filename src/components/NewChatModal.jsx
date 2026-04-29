import { useState, useEffect } from "react";
import { C, TEAM_ACCOUNTS, DEV_ONLY_ACCOUNTS } from "../constants";
import { supabase } from "../lib/supabase";

const DEV_IDS = new Set(DEV_ONLY_ACCOUNTS.map(a => a.id));

const GROUP_CATEGORIES = [
  { key: "work",    icon: "\uD83D\uDCBC", label: "C\u00F4ng vi\u1EC7c", color: C.accent },
  { key: "project", icon: "\uD83D\uDCC1", label: "D\u1EF1 \u00E1n",     color: C.purple },
  { key: "class",   icon: "\uD83C\uDF93", label: "Kh\u00F3a h\u1ECDc",  color: "#3498db" },
];

export function getCategoryInfo(key) {
  return GROUP_CATEGORIES.find(c => c.key === key) || GROUP_CATEGORIES[0];
}

export { GROUP_CATEGORIES };

export default function NewChatModal({ userId, onSelect, onClose, initialMode = "dm" }) {
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(initialMode);
  const [groupName, setGroupName] = useState("");
  const [category, setCategory] = useState("work");
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");

  const isDirector = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}").role === "director"; } catch { return false; } })();
  const myLocalId = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}").id || ""; } catch { return ""; } })();

  useEffect(() => {
    (async () => {
      // 1. Try Supabase profiles
      let supaProfiles = [];
      if (supabase && userId) {
        const { data } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_color")
          .neq("id", userId);
        supaProfiles = data || [];
      }

      // 2. Build list from TEAM_ACCOUNTS (always visible) + Supabase profiles
      const norm = s => (s || "").toLowerCase().replace(/\s+/g, "");
      const accountList = isDirector ? [...TEAM_ACCOUNTS, ...DEV_ONLY_ACCOUNTS] : TEAM_ACCOUNTS;
      const merged = accountList
        .filter(a => a.id !== myLocalId) // exclude self
        .map(a => {
          // Match with Supabase profile by name. If no profile exists yet
          // (account never logged in), `notReady` flags the row so the UI
          // can disable picking — otherwise we'd insert the local string id
          // ("lien") into conversation_members.user_id, which then never
          // matches the auth UUID created on first login → RLS reject all
          // future messages in that conversation.
          const supaMatch = supaProfiles.find(p => norm(p.display_name) === norm(a.name));
          return {
            id: supaMatch?.id || a.id,
            display_name: supaMatch?.display_name || a.name,
            avatar_color: supaMatch?.avatar_color || a.color,
            localId: a.id,
            title: a.title || "",
            notReady: !supaMatch,
          };
        });

      // Also add any Supabase profiles NOT in TEAM_ACCOUNTS (e.g., external users)
      const mergedNames = new Set(accountList.map(a => norm(a.name)));
      for (const p of supaProfiles) {
        if (!mergedNames.has(norm(p.display_name))) {
          merged.push({ id: p.id, display_name: p.display_name, avatar_color: p.avatar_color });
        }
      }

      setTeamMembers(merged);
      setLoading(false);
    })();
  }, [userId]);

  const toggleMember = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCreate = () => {
    if (mode === "dm" && selected.length === 1) {
      onSelect({ type: "dm", userId: selected[0] });
    } else if (mode === "group" && selected.length >= 1 && groupName.trim()) {
      // Pass clean name + category separately (no more prefix encoding)
      onSelect({ type: "group", name: groupName.trim(), category, memberIds: selected });
    }
  };

  const filtered = teamMembers.filter(m =>
    !search || m.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  const catInfo = getCategoryInfo(category);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.3)" }} onClick={onClose} />
      <div style={{ position: "relative", margin: "auto", width: "92%", maxWidth: 380, maxHeight: "85vh", background: C.surface, borderRadius: 16, boxShadow: "0 8px 32px rgba(0,0,0,.2)", display: "flex", flexDirection: "column", animation: "fadeIn .2s" }}>
        {/* Header */}
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: C.text }}>
            {mode === "dm" ? "Nhan tin moi" : "Tao nhom moi"}
          </div>
          <button className="tap" onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: C.muted }}>{"\u2715"}</button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}` }}>
          {[["dm", "\uD83D\uDCAC Ca nhan"], ["group", "\uD83D\uDC65 Nhom"]].map(([m, label]) => (
            <button key={m} className="tap" onClick={() => { setMode(m); setSelected([]); }}
              style={{ flex: 1, padding: "10px", fontSize: 13, fontWeight: 600, border: "none",
                background: mode === m ? `${C.accent}12` : "transparent",
                color: mode === m ? C.accent : C.muted,
                borderBottom: mode === m ? `2px solid ${C.accent}` : "2px solid transparent" }}>
              {label}
            </button>
          ))}
        </div>

        {/* Group options */}
        {mode === "group" && (
          <div style={{ padding: "12px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, letterSpacing: 0.5 }}>PHAN LOAI NHOM</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {GROUP_CATEGORIES.map(cat => (
                  <button key={cat.key} className="tap" onClick={() => setCategory(cat.key)}
                    style={{
                      padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                      border: category === cat.key ? `2px solid ${cat.color}` : `1.5px solid ${C.border}`,
                      background: category === cat.key ? `${cat.color}15` : "transparent",
                      color: category === cat.key ? cat.color : C.muted,
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                    <span style={{ fontSize: 13 }}>{cat.icon}</span> {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <input value={groupName} onChange={e => setGroupName(e.target.value)}
              placeholder={`Ten nhom ${catInfo.label.toLowerCase()}...`}
              style={{ width: "100%", fontSize: 14, border: `1.5px solid ${catInfo.color}44`, borderRadius: 10, padding: "9px 12px", outline: "none", color: C.text, background: C.bg, boxSizing: "border-box" }} />
          </div>
        )}

        {/* Search */}
        <div style={{ padding: "8px 16px 0" }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tim thanh vien..."
            style={{ width: "100%", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", outline: "none", color: C.text, background: C.bg, boxSizing: "border-box" }} />
        </div>

        {/* Selected chips */}
        {mode === "group" && selected.length > 0 && (
          <div style={{ padding: "8px 16px 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
            {selected.map(id => {
              const m = teamMembers.find(t => t.id === id);
              return (
                <span key={id} onClick={() => toggleMember(id)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "4px 10px", borderRadius: 14, fontSize: 12, fontWeight: 600,
                    background: `${C.accent}15`, color: C.accent, cursor: "pointer",
                  }}>
                  {m?.display_name || "?"} {"\u2715"}
                </span>
              );
            })}
          </div>
        )}

        {/* Member list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 16px" }}>
          {loading && <div style={{ textAlign: "center", padding: 20, color: C.muted, fontSize: 12 }}>Dang tai...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: 20, color: C.muted, fontSize: 13 }}>
              {search ? "Khong tim thay." : "Chua co thanh vien nao."}
            </div>
          )}
          {filtered.map(m => {
            const isSel = selected.includes(m.id);
            const disabled = m.notReady;
            return (
              <div key={m.id} className={disabled ? "" : "tap"}
                onClick={() => {
                  if (disabled) return;
                  mode === "dm" ? onSelect({ type: "dm", userId: m.id }) : toggleMember(m.id);
                }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: `1px solid ${C.border}22`, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: m.avatar_color || C.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                  {(m.display_name || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{m.display_name}</div>
                  {disabled
                    ? <div style={{ fontSize: 11, color: "#e67e22", marginTop: 1 }}>Chưa đăng nhập lần nào — không thể tạo chat</div>
                    : m.title && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{m.title}</div>}
                </div>
                {mode === "group" && !disabled && (
                  <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSel ? C.accent : C.border}`, background: isSel ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>
                    {isSel && "\u2713"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Create group button */}
        {mode === "group" && selected.length > 0 && (
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}` }}>
            <button className="tap" onClick={handleCreate} disabled={!groupName.trim()}
              style={{
                width: "100%", padding: "11px", borderRadius: 12, border: "none",
                background: groupName.trim() ? catInfo.color : C.border,
                color: "#fff", fontSize: 14, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
              {catInfo.icon} Tao nhom {catInfo.label} ({selected.length} nguoi)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
