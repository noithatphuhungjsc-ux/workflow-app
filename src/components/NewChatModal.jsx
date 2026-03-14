import { useState, useEffect } from "react";
import { C } from "../constants";
import { supabase } from "../lib/supabase";

const GROUP_CATEGORIES = [
  { key: "work",    icon: "💼", label: "Công việc",  color: C.accent },
  { key: "family",  icon: "🏠", label: "Gia đình",   color: "#e67e22" },
  { key: "friends", icon: "🎉", label: "Bạn bè",     color: C.green },
  { key: "project", icon: "📁", label: "Dự án",      color: C.purple },
  { key: "class",   icon: "🎓", label: "Lớp học",    color: "#3498db" },
  { key: "other",   icon: "💬", label: "Khác",       color: C.muted },
];

// Encode category into group name: "[work]Tên nhóm"
export function encodeGroupName(category, name) {
  return `[${category}]${name}`;
}

// Decode: returns { category, name }
export function decodeGroupName(raw) {
  const match = raw?.match(/^\[(\w+)\](.+)$/);
  if (match) return { category: match[1], name: match[2] };
  return { category: "other", name: raw || "Nhóm" };
}

export function getCategoryInfo(key) {
  return GROUP_CATEGORIES.find(c => c.key === key) || GROUP_CATEGORIES[GROUP_CATEGORIES.length - 1];
}

export { GROUP_CATEGORIES };

export default function NewChatModal({ userId, onSelect, onClose, initialMode = "dm" }) {
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(initialMode); // dm | group
  const [groupName, setGroupName] = useState("");
  const [category, setCategory] = useState("work");
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");

  // Team member names — only show known team, filter out random OAuth profiles
  const TEAM_NAMES = ["Nguyen Duy Trinh", "Lientran", "Pham Van Hung", "Tran Thi Mai", "Le Minh Duc"];
  const norm = s => (s || "").toLowerCase().replace(/\s+/g, "");

  useEffect(() => {
    if (!supabase || !userId) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_color")
        .neq("id", userId);
      // Filter to only team members
      const filtered = (data || []).filter(p => TEAM_NAMES.some(n => norm(n) === norm(p.display_name)));
      setTeamMembers(filtered);
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
      onSelect({ type: "group", name: encodeGroupName(category, groupName.trim()), memberIds: selected });
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
            {mode === "dm" ? "Nhắn tin mới" : "Tạo nhóm mới"}
          </div>
          <button className="tap" onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: C.muted }}>✕</button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}` }}>
          {[["dm", "💬 Cá nhân"], ["group", "👥 Nhóm"]].map(([m, label]) => (
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
            {/* Category picker */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, letterSpacing: 0.5 }}>PHÂN LOẠI NHÓM</div>
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

            {/* Group name */}
            <input value={groupName} onChange={e => setGroupName(e.target.value)}
              placeholder={`Tên nhóm ${catInfo.label.toLowerCase()}...`}
              style={{ width: "100%", fontSize: 14, border: `1.5px solid ${catInfo.color}44`, borderRadius: 10, padding: "9px 12px", outline: "none", color: C.text, background: C.bg, boxSizing: "border-box" }} />
          </div>
        )}

        {/* Search */}
        <div style={{ padding: "8px 16px 0" }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm thành viên..."
            style={{ width: "100%", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", outline: "none", color: C.text, background: C.bg, boxSizing: "border-box" }} />
        </div>

        {/* Selected chips (group mode) */}
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
                  {m?.display_name || "?"} ✕
                </span>
              );
            })}
          </div>
        )}

        {/* Member list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 16px" }}>
          {loading && <div style={{ textAlign: "center", padding: 20, color: C.muted, fontSize: 12 }}>Đang tải...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: 20, color: C.muted, fontSize: 13 }}>
              {search ? "Không tìm thấy." : "Chưa có thành viên nào."}
            </div>
          )}
          {filtered.map(m => {
            const isSel = selected.includes(m.id);
            return (
              <div key={m.id} className="tap"
                onClick={() => mode === "dm" ? onSelect({ type: "dm", userId: m.id }) : toggleMember(m.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: `1px solid ${C.border}22`, cursor: "pointer" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: m.avatar_color || C.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                  {(m.display_name || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: C.text }}>{m.display_name}</div>
                {mode === "group" && (
                  <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSel ? C.accent : C.border}`, background: isSel ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>
                    {isSel && "✓"}
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
              {catInfo.icon} Tạo nhóm {catInfo.label} ({selected.length} người)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
