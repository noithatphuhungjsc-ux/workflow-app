/* ================================================================
   StaffManagement — Quản lý nhân sự động (thêm/sửa/xóa tài khoản)
   Chỉ hiện cho admin/dev/manager
   ================================================================ */
import { useState, useEffect } from "react";
import { C, DEFAULT_PASSWORD } from "../constants";
import { loadAccounts, saveAccounts, hashPassword } from "../services";

const IS = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 14, width: "100%" };

const ROLE_OPTIONS = [
  { id: "admin", label: "Admin", color: "#e74c3c" },
  { id: "manager", label: "Quản lý", color: C.accent },
  { id: "staff", label: "Nhân viên", color: C.green },
];

export default function StaffManagement({ currentUserId }) {
  const [accounts, setAccounts] = useState({});
  const [editing, setEditing] = useState(null); // account id being edited
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "staff", title: "", pw: DEFAULT_PASSWORD });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const accs = loadAccounts();
    if (accs) setAccounts(accs);
  }, []);

  const showMsg = (text) => { setMsg(text); setTimeout(() => setMsg(""), 3000); };

  const startAdd = () => {
    setAdding(true);
    setEditing(null);
    setForm({ name: "", email: "", phone: "", role: "staff", title: "", pw: DEFAULT_PASSWORD });
  };

  const startEdit = (acc) => {
    setEditing(acc.id);
    setAdding(false);
    setForm({ name: acc.name, email: acc.email || "", phone: acc.phone || "", role: acc.role || "staff", title: acc.title || "", pw: "" });
  };

  const cancel = () => { setAdding(false); setEditing(null); };

  const handleSave = async () => {
    if (!form.name.trim()) { showMsg("Tên không được để trống"); return; }

    if (adding) {
      // Create new account
      const id = form.name.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "") || `user_${Date.now()}`;
      if (accounts[id]) { showMsg("ID tài khoản đã tồn tại"); return; }
      const pwHash = await hashPassword(form.pw || "111111");
      const updated = {
        ...accounts,
        [id]: {
          id, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(),
          role: form.role, title: form.title.trim(), pwHash, twoFA: false,
        },
      };
      saveAccounts(updated);
      setAccounts(updated);
      setAdding(false);
      showMsg(`Đã thêm ${form.name.trim()}`);
    } else if (editing) {
      // Update existing
      const acc = accounts[editing];
      const updates = {
        ...acc,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        role: form.role,
        title: form.title.trim(),
      };
      if (form.pw) {
        updates.pwHash = await hashPassword(form.pw);
      }
      const updated = { ...accounts, [editing]: updates };
      saveAccounts(updated);
      setAccounts(updated);
      setEditing(null);
      showMsg(`Đã cập nhật ${form.name.trim()}`);
    }
  };

  const handleDelete = (id) => {
    if (id === currentUserId) { showMsg("Không thể xóa tài khoản đang đăng nhập"); return; }
    const acc = accounts[id];
    if (!window.confirm(`Xóa tài khoản "${acc.name}"?`)) return;
    const updated = { ...accounts };
    delete updated[id];
    saveAccounts(updated);
    setAccounts(updated);
    if (editing === id) setEditing(null);
    showMsg(`Đã xóa ${acc.name}`);
  };

  const accountList = Object.values(accounts);
  const roleColors = { director: "#9b59b6", accountant: "#e74c3c", sales: "#6a7fd4", hr: "#3aaa72", construction: "#e67e22" };
  const roleLabels = { director: "Giám đốc", accountant: "Kế toán", sales: "Kinh doanh", hr: "Nhân sự", construction: "Thi công" };

  return (
    <div>
      {msg && (
        <div style={{ background: C.greenD, border: `1px solid ${C.green}55`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: C.green, textAlign: "center" }}>{msg}</div>
      )}

      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 8 }}>
        DANH SÁCH NHÂN SỰ ({accountList.length})
      </div>

      {/* Account list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {accountList.map(acc => {
          const role = acc.role || "staff";
          const isMe = acc.id === currentUserId;
          return (
            <div key={acc.id} style={{
              background: editing === acc.id ? C.accentD : C.card,
              border: `1px solid ${editing === acc.id ? C.accent : C.border}`,
              borderRadius: 12, padding: "10px 12px",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: roleColors[role] || C.muted,
                color: "#fff", fontSize: 14, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                {acc.name.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
                  {acc.name}
                  {isMe && <span style={{ fontSize: 9, background: C.accentD, color: C.accent, borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>Bạn</span>}
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  <span style={{ color: roleColors[role], fontWeight: 600 }}>{roleLabels[role] || role}</span>
                  {acc.title ? ` · ${acc.title}` : ""}
                  {acc.email ? ` · ${acc.email}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="tap" onClick={() => startEdit(acc)}
                  style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 8px", fontSize: 11, color: C.accent, cursor: "pointer" }}>
                  Sửa
                </button>
                {!isMe && (
                  <button className="tap" onClick={() => handleDelete(acc.id)}
                    style={{ background: "none", border: `1px solid ${C.red}33`, borderRadius: 8, padding: "4px 8px", fontSize: 11, color: C.red, cursor: "pointer" }}>
                    Xóa
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add button */}
      {!adding && !editing && (
        <button className="tap" onClick={startAdd}
          style={{
            width: "100%", background: `linear-gradient(135deg,${C.accent},${C.purple})`,
            color: "#fff", border: "none", borderRadius: 14, padding: "14px",
            fontSize: 14, fontWeight: 700, marginBottom: 14, cursor: "pointer",
          }}>
          + Thêm nhân viên
        </button>
      )}

      {/* Add/Edit form */}
      {(adding || editing) && (
        <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.accent}44`, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 10 }}>
            {adding ? "THÊM NHÂN VIÊN MỚI" : "CHỈNH SỬA"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 3 }}>HỌ TÊN *</div>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={IS} placeholder="Nguyễn Văn A" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 3 }}>EMAIL</div>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={IS} placeholder="email@company.vn" type="email" />
              </div>
              <div>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 3 }}>ĐIỆN THOẠI</div>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={IS} placeholder="0912345678" type="tel" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 3 }}>CHỨC DANH</div>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={IS} placeholder="Nhân viên" />
              </div>
              <div>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 3 }}>VAI TRÒ</div>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={IS}>
                  {ROLE_OPTIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 3 }}>
                {editing ? "MẬT KHẨU MỚI (bỏ trống = giữ nguyên)" : "MẬT KHẨU (mặc định: 111111)"}
              </div>
              <input value={form.pw} onChange={e => setForm(f => ({ ...f, pw: e.target.value }))} style={IS} placeholder={editing ? "Để trống = không đổi" : "111111"} type="password" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="tap" onClick={cancel}
              style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 600, color: C.sub, cursor: "pointer" }}>
              Hủy
            </button>
            <button className="tap" onClick={handleSave}
              style={{ flex: 1, background: C.accent, border: "none", borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
              {adding ? "Thêm" : "Lưu"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
