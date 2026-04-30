/* ================================================================
   AddStaffModal — HR thêm nhân sự mới vào tổ chức
   - Chỉ HR (department.code === 'nhan-su') mở được (gate ở caller)
   - Nhập: tên, email, mật khẩu (mặc định 111111), phòng, vai trò
   - Submit → ensure_auth (tạo auth.user + profile) → set dept + role
              → auto-create DM với welcome message
   ================================================================ */
import { useState } from "react";
import { C } from "../constants";
import { supabase } from "../lib/supabase";
import { useDepartments } from "../hooks/useWorkflows";
import { useSupabase } from "../contexts/SupabaseContext";
import { authHeaders } from "../services/authHeaders";

export default function AddStaffModal({ onClose, onAdded }) {
  const { departments } = useDepartments();
  const { session } = useSupabase();
  const hrUserId = session?.user?.id;
  const [hrName, setHrName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("111111");
  const [deptId, setDeptId] = useState("");
  const [role, setRole] = useState("staff");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load HR's name once
  if (hrUserId && !hrName) {
    supabase.from("profiles").select("display_name").eq("id", hrUserId).single()
      .then(({ data }) => setHrName(data?.display_name || "HR"));
  }

  const submit = async () => {
    setError(""); setSuccess("");
    if (!name.trim()) { setError("Cần nhập tên"); return; }
    if (!email.trim() || !email.includes("@")) { setError("Email không hợp lệ"); return; }
    if (password.length < 6) { setError("Mật khẩu cần ≥ 6 ký tự"); return; }
    if (!deptId) { setError("Chọn phòng ban"); return; }

    setSaving(true);
    try {
      // 1. Tạo auth user + profile qua ensure_auth (bootstrap, không cần JWT)
      const res = await fetch("/api/cloud-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ensure_auth",
          email: email.trim(),
          password,
          displayName: name.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.userId) throw new Error(j.error || "Tạo tài khoản fail");
      const newUserId = j.userId;

      // 2. Set phòng + role + welcome flag (yêu cầu auth — HR's JWT)
      const { error: updErr } = await supabase.from("profiles")
        .update({
          department_id: deptId,
          dept_role: role,
          is_dept_lead: role === "lead",
        })
        .eq("id", newUserId);
      if (updErr) throw new Error("Cập nhật phòng fail: " + updErr.message);

      // 3. Auto-create DM HR → new staff với welcome message
      try {
        const { data: conv } = await supabase.from("conversations")
          .insert({ type: "dm", created_by: hrUserId })
          .select().single();
        if (conv) {
          await supabase.from("conversation_members").insert([
            { conversation_id: conv.id, user_id: hrUserId },
            { conversation_id: conv.id, user_id: newUserId },
          ]);
          const dept = departments.find(d => d.id === deptId);
          await supabase.from("messages").insert({
            conversation_id: conv.id,
            sender_id: hrUserId,
            content: `🎉 Chào mừng ${name.trim()} đến với công ty!\n\nMình là ${hrName} từ phòng Nhân sự. Bạn đã được thêm vào ${dept?.icon || ""} ${dept?.name || "phòng ban"} với vai trò ${role === "lead" ? "Trưởng phòng" : role === "deputy" ? "Phó phòng" : "Nhân viên"}.\n\nNếu có gì cần hỗ trợ, nhắn mình nhé!`,
            type: "text",
          });
        }
      } catch (e) { console.warn("[AddStaff] DM create failed:", e.message); }

      setSuccess(`✅ Đã thêm ${name.trim()} vào ${departments.find(d => d.id === deptId)?.name}`);
      onAdded?.({ id: newUserId, name: name.trim(), email: email.trim(), deptId });

      // Reset for next add
      setName(""); setEmail(""); setPassword("111111");
      setTimeout(() => setSuccess(""), 2500);
    } catch (e) {
      setError(e.message || "Lỗi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="safe-modal-overlay"
      style={{ position:"fixed", inset:0, zIndex:1100, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:C.bg, borderRadius:20, padding:18, width:"100%", maxWidth:440, maxHeight:"90vh", overflowY:"auto" }}>

        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
          <span style={{ fontSize:22 }}>👥</span>
          <span style={{ fontSize:15, fontWeight:700, color:C.text, flex:1 }}>Thêm nhân sự mới</span>
          <button className="tap" onClick={onClose} style={{ padding:"4px 8px", border:"none", background:"none", color:C.muted, fontSize:18, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ fontSize:11, fontWeight:600, color:C.muted, marginBottom:4 }}>HỌ TÊN <span style={{ color:C.red }}>*</span></div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Nguyễn Văn A"
          style={{ width:"100%", fontSize:13, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 12px", color:C.text, background:C.card, boxSizing:"border-box", marginBottom:10 }} />

        <div style={{ fontSize:11, fontWeight:600, color:C.muted, marginBottom:4 }}>EMAIL <span style={{ color:C.red }}>*</span></div>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="ten@workflow.vn" type="email"
          style={{ width:"100%", fontSize:13, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 12px", color:C.text, background:C.card, boxSizing:"border-box", marginBottom:10 }} />

        <div style={{ fontSize:11, fontWeight:600, color:C.muted, marginBottom:4 }}>MẬT KHẨU TẠM (gửi cho nhân viên)</div>
        <input value={password} onChange={e => setPassword(e.target.value)}
          style={{ width:"100%", fontSize:13, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 12px", color:C.text, background:C.card, boxSizing:"border-box", marginBottom:10, fontFamily:"monospace" }} />

        <div style={{ display:"flex", gap:6, marginBottom:14 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, fontWeight:600, color:C.muted, marginBottom:4 }}>PHÒNG BAN <span style={{ color:C.red }}>*</span></div>
            <select value={deptId} onChange={e => setDeptId(e.target.value)}
              style={{ width:"100%", fontSize:13, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 8px", color:C.text, background:C.card, boxSizing:"border-box" }}>
              <option value="">— Chọn —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
            </select>
          </div>
          <div style={{ width:120 }}>
            <div style={{ fontSize:11, fontWeight:600, color:C.muted, marginBottom:4 }}>VAI TRÒ</div>
            <select value={role} onChange={e => setRole(e.target.value)}
              style={{ width:"100%", fontSize:13, border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 8px", color:C.text, background:C.card, boxSizing:"border-box" }}>
              <option value="staff">Nhân viên</option>
              <option value="deputy">Phó phòng</option>
              <option value="lead">Trưởng phòng</option>
            </select>
          </div>
        </div>

        {error && <div style={{ fontSize:11, color:C.red, padding:"6px 10px", background:`${C.red}11`, borderRadius:6, marginBottom:8 }}>⚠️ {error}</div>}
        {success && <div style={{ fontSize:11, color:C.green, padding:"6px 10px", background:`${C.green}11`, borderRadius:6, marginBottom:8 }}>{success}</div>}

        <div style={{ display:"flex", gap:8 }}>
          <button className="tap" onClick={onClose} disabled={saving}
            style={{ flex:1, padding:"10px", borderRadius:10, border:`1px solid ${C.border}`, background:C.card, color:C.sub, fontSize:13, fontWeight:600 }}>
            Đóng
          </button>
          <button className="tap" onClick={submit} disabled={saving || !name.trim() || !email.trim() || !deptId}
            style={{ flex:1, padding:"10px", borderRadius:10, border:"none", background:C.accent, color:"#fff", fontSize:13, fontWeight:700, opacity: (saving || !name.trim() || !email.trim() || !deptId) ? 0.5 : 1 }}>
            {saving ? "Đang thêm..." : "Thêm + Chào mừng"}
          </button>
        </div>

        <div style={{ fontSize:10, color:C.muted, marginTop:10, padding:"8px 10px", background:C.card, borderRadius:8, lineHeight:1.5 }}>
          💡 Nhân viên mới sẽ nhận được tin nhắn chào mừng tự động.
          Bạn cần thông báo email + mật khẩu tạm cho họ qua kênh khác.
        </div>
      </div>
    </div>
  );
}
