/* SecurityTab — Bảo mật */
import { useState } from "react";
import { C } from "../../constants";
import { hashPassword, saveAccounts } from "../../services";
import { Section, SelectRow, IS } from "./SettingsHelpers";

export default function SecurityTab({ user, settings, setSettings, myAcc, accounts, setAcct, showMsg }) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [cfmPw, setCfmPw] = useState("");
  const [phone, setPhone] = useState(myAcc?.phone || "");
  const [savingPw, setSavingPw] = useState(false);

  const handleChangePw = async () => {
    if (!oldPw || !newPw || !cfmPw) { showMsg("Vui lòng nhập đầy đủ.", "error"); return; }
    if (newPw !== cfmPw) { showMsg("Mật khẩu mới không khớp.", "error"); return; }
    if (newPw.length < 6) { showMsg("Mật khẩu mới tối thiểu 6 ký tự.", "error"); return; }
    setSavingPw(true);
    try {
      const oldHash = await hashPassword(oldPw);
      if (oldHash !== myAcc.pwHash) { showMsg("Mật khẩu cũ không đúng.", "error"); return; }
      const newHash = await hashPassword(newPw);
      const updated = { ...accounts, [user.id]: { ...myAcc, pwHash: newHash } };
      saveAccounts(updated); setAcct(updated);
      showMsg("Đổi mật khẩu thành công!");
      setOldPw(""); setNewPw(""); setCfmPw("");
    } finally { setSavingPw(false); }
  };

  const toggle2FA = () => {
    if (!myAcc.twoFA && !phone.trim()) { showMsg("Vui lòng nhập số điện thoại.", "error"); return; }
    const newState = !myAcc.twoFA;
    const updated = { ...accounts, [user.id]: { ...myAcc, twoFA: newState, phone: phone.trim() } };
    saveAccounts(updated); setAcct(updated);
    showMsg(newState ? "Đã bật xác nhận 2 bước!" : "Đã tắt xác nhận 2 bước.");
  };

  const savePhone = () => {
    const updated = { ...accounts, [user.id]: { ...myAcc, phone: phone.trim() } };
    saveAccounts(updated); setAcct(updated);
    showMsg("Đã lưu số điện thoại.");
  };

  return (
    <>
      <Section title="Đổi mật khẩu" />
      <div style={{ marginBottom:10 }}>
        <input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} placeholder="Mật khẩu cũ" style={IS} />
      </div>
      <div style={{ marginBottom:10 }}>
        <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Mật khẩu mới (tối thiểu 6 ký tự)" style={IS} />
      </div>
      <div style={{ marginBottom:14 }}>
        <input type="password" value={cfmPw} onChange={e => setCfmPw(e.target.value)} placeholder="Xác nhận mật khẩu mới" style={IS} />
      </div>
      <button className="tap" onClick={handleChangePw} disabled={savingPw}
        style={{ width:"100%", background: savingPw ? C.muted : `linear-gradient(135deg,${C.accent},${C.purple})`, color:"#fff", border:"none", borderRadius:14, padding:"14px", fontSize:15, fontWeight:700, marginBottom:20, opacity: savingPw ? .6 : 1 }}>
        {savingPw ? "Đang xử lý..." : "Đổi mật khẩu"}
      </button>

      <Section title="Xác nhận 2 bước (SMS)" />
      <div style={{ marginBottom:14 }}>
        <div style={{ display:"flex", gap:8 }}>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0912 345 678" style={{ ...IS, flex:1 }} />
          <button className="tap" onClick={savePhone} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"8px 14px", fontSize:12, color:C.accent, fontWeight:600, flexShrink:0 }}>Lưu</button>
        </div>
      </div>
      <button className="tap" onClick={toggle2FA}
        style={{ width:"100%", background: myAcc?.twoFA ? C.redD : `linear-gradient(135deg,${C.green},${C.accent})`, color: myAcc?.twoFA ? C.red : "#fff", border: myAcc?.twoFA ? `1px solid ${C.red}44` : "none", borderRadius:14, padding:"14px", fontSize:15, fontWeight:700, marginBottom:14 }}>
        {myAcc?.twoFA ? "Tắt xác nhận 2 bước" : "Bật xác nhận 2 bước"}
      </button>

      <SelectRow label="Tự động khóa" desc="Khóa app sau thời gian không hoạt động"
        value={String(settings.autoLockMinutes)} onChange={v => setSettings({ autoLockMinutes: Number(v) })}
        options={[["0","Không bao giờ"],["1","1 phút"],["5","5 phút"],["15","15 phút"],["30","30 phút"]]} />
    </>
  );
}
