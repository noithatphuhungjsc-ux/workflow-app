/* ================================================================
   CallMembersPicker — Chọn members để gọi video nhóm
   - Hiển thị list members trong conversation (loại self)
   - Tick chọn ai sẽ tham gia call
   - Nút "Bắt đầu gọi" → trả mảng userIds đã chọn
   ================================================================ */
import { useState, useEffect } from "react";
import { C } from "../../constants";
import { supabase } from "../../lib/supabase";

export default function CallMembersPicker({ conversationId, currentUserId, onStart, onClose }) {
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      const { data: cm } = await supabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .neq("user_id", currentUserId);
      const ids = (cm || []).map(m => m.user_id);
      if (ids.length === 0) { setLoading(false); return; }
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_color, dept_role")
        .in("id", ids);
      setMembers(profs || []);
      // Default: tick all
      setSelected(new Set(ids));
      setLoading(false);
    })();
  }, [conversationId, currentUserId]);

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStart = () => {
    if (selected.size === 0) return;
    onStart(Array.from(selected));
  };

  return (
    <div className="safe-modal-overlay"
      style={{ position:"fixed", inset:0, zIndex:1200, background:"rgba(0,0,0,.55)", display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:C.bg, borderRadius:20, padding:18, width:"100%", maxWidth:420, maxHeight:"85vh", overflowY:"auto" }}>

        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <span style={{ fontSize:24 }}>📹</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:C.text }}>Gọi video nhóm</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
              Chọn người sẽ tham gia ({selected.size}/{members.length})
            </div>
          </div>
          <button className="tap" onClick={onClose}
            style={{ padding:"4px 10px", border:"none", background:"none", color:C.muted, fontSize:18, cursor:"pointer" }}>✕</button>
        </div>

        {loading && <div style={{ padding:20, textAlign:"center", color:C.muted, fontSize:12 }}>Đang tải...</div>}
        {!loading && members.length === 0 && (
          <div style={{ padding:20, textAlign:"center", color:C.muted, fontSize:12 }}>
            Nhóm chưa có thành viên khác
          </div>
        )}

        {/* Quick select all/none */}
        {members.length > 1 && (
          <div style={{ display:"flex", gap:6, marginBottom:8 }}>
            <button className="tap" onClick={() => setSelected(new Set(members.map(m => m.id)))}
              style={{ flex:1, padding:"6px", borderRadius:8, border:`1px solid ${C.border}`, background: selected.size === members.length ? `${C.accent}15` : C.card, color:C.accent, fontSize:11, fontWeight:600 }}>
              ☑ Chọn tất cả
            </button>
            <button className="tap" onClick={() => setSelected(new Set())}
              style={{ flex:1, padding:"6px", borderRadius:8, border:`1px solid ${C.border}`, background:C.card, color:C.muted, fontSize:11, fontWeight:600 }}>
              ☐ Bỏ chọn
            </button>
          </div>
        )}

        {/* Members list */}
        {members.map(m => {
          const checked = selected.has(m.id);
          return (
            <div key={m.id} className="tap" onClick={() => toggle(m.id)}
              style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", marginBottom:4, background: checked ? `${C.accent}10` : C.card, borderRadius:10, border:`1px solid ${checked ? C.accent : C.border}`, cursor:"pointer" }}>
              <div style={{ width:36, height:36, borderRadius:"50%", background: m.avatar_color || C.accent, color:"#fff", fontSize:14, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {(m.display_name || "?").charAt(0).toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{m.display_name || "?"}</div>
                {m.dept_role && (
                  <div style={{ fontSize:10, color:C.muted }}>
                    {m.dept_role === "lead" ? "Trưởng phòng" : m.dept_role === "deputy" ? "Phó phòng" : "Nhân viên"}
                  </div>
                )}
              </div>
              <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${checked ? C.accent : C.border}`, background: checked ? C.accent : "transparent", color:"#fff", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {checked && "✓"}
              </div>
            </div>
          );
        })}

        {/* Action buttons */}
        <div style={{ display:"flex", gap:8, marginTop:14 }}>
          <button className="tap" onClick={onClose}
            style={{ flex:1, padding:"10px", borderRadius:10, border:`1px solid ${C.border}`, background:C.card, color:C.sub, fontSize:13, fontWeight:600 }}>
            Huỷ
          </button>
          <button className="tap" onClick={handleStart} disabled={selected.size === 0}
            style={{ flex:1, padding:"10px", borderRadius:10, border:"none",
              background: selected.size > 0 ? "#2ecc71" : C.muted,
              color:"#fff", fontSize:13, fontWeight:700,
              opacity: selected.size > 0 ? 1 : 0.5,
              display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            📹 Bắt đầu ({selected.size})
          </button>
        </div>

        <div style={{ fontSize:10, color:C.muted, marginTop:8, textAlign:"center", fontStyle:"italic" }}>
          ⚠️ Group call vẫn đang hoàn thiện — chỉ kết nối được tối đa 2 người trong phiên hiện tại
        </div>
      </div>
    </div>
  );
}
