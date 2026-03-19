/* ================================================================
   SETTINGS MODAL — 7 tabs (consolidated)
   Hồ sơ | Bảo mật | AI & Giọng | Kết nối | Chi tiêu | Giao diện | Dữ liệu
   ================================================================ */
import { useState, useEffect, useRef } from "react";
import { C, DEFAULT_SETTINGS, PAYMENT_SOURCES, KNOWLEDGE_CATEGORIES, DEFAULT_PROFILE, WORKFLOWS, t } from "../constants";
import { INDUSTRY_PRESETS } from "../industryPresets";
import { CHANGELOG } from "../changelog";
import IndustrySetupModal from "./IndustrySetupModal";
import StaffManagement from "./StaffManagement";
import { useStore, useSettings } from "../store";
import { hashPassword, loadAccounts, saveAccounts, maskPhone, exportAllData, importData, clearAllData, clearAllDataWithCloud, clearAllSystemData, saveJSON, loadJSON, encryptToken, decryptToken, sendBackupEmail, saveKnowledgeProfile, addKnowledgeEntry, updateKnowledgeEntry, deleteKnowledgeEntry, approveKnowledgeEntry, approveAllPending, cloudSaveAll, cloudLoadAll } from "../services";
import { useSupabase } from "../contexts/SupabaseContext";

const TABS = [
  { id: "profile",  label: "Hồ sơ" },
  { id: "security", label: "Bảo mật" },
  { id: "workflow",  label: "Quy trình" },
  { id: "ai",       label: "AI & Giọng" },
  { id: "training", label: "Huấn luyện" },
  { id: "connect",  label: "Kết nối" },
  { id: "expense",  label: "Chi tiêu" },
  { id: "staff",    label: "Nhân sự" },
  { id: "ui",       label: "Giao diện" },
  { id: "data",     label: "Dữ liệu" },
];

const AVATAR_COLORS = [C.accent, C.purple, C.green, C.gold, C.red, "#e67e22", "#1abc9c", "#e91e63", "#607d8b", "#795548"];

export default function SettingsModal({ user, onClose }) {
  const [tab, setTab] = useState("profile");
  const { settings, setSettings, userId, memory, setMemory, knowledge, setKnowledge, pendingKnowledge } = useStore();
  const { supabase, session } = useSupabase();
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("");
  const [showIndustryModal, setShowIndustryModal] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockPw, setLockPw] = useState("");
  const [accounts, setAcct] = useState(loadAccounts);
  const [syncing, setSyncing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const isDirector = settings.userRole === "director" || ["dev","manager"].includes(settings.userRole);

  useEffect(() => {
    (async () => {
      const accts = loadAccounts() || {};
      if (!accts[user.id]) {
        accts[user.id] = { id: user.id, name: user.name, pwHash: await hashPassword("111111"), twoFA: false, phone: "" };
        saveAccounts(accts);
      }
      setAcct(accts);
    })();
  }, [user.id, user.name]);

  // Auto-populate from session (email, phone, title stored at login)
  const sessionData = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}"); } catch { return {}; } })();
  const [displayName, setDisplayName] = useState(settings.displayName || user.name);
  const [email, setEmail] = useState(settings.email || sessionData.email || myAcc?.email || "");
  const [profilePhone, setProfilePhone] = useState(settings.profilePhone || sessionData.phone || myAcc?.phone || "");
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [cfmPw, setCfmPw] = useState("");
  const [phone, setPhone] = useState("");
  const myAcc = accounts?.[user.id];
  useEffect(() => { if (myAcc?.phone) setPhone(myAcc.phone); }, [myAcc]);

  const showMsg = (text, type = "success") => { setMsg(text); setMsgType(type); setTimeout(() => setMsg(""), 3000); };
  const IS = { width:"100%", background:C.card, border:`1.5px solid ${C.border}`, borderRadius:12, padding:"12px 16px", fontSize:15, color:C.text };

  const saveProfile = () => {
    setSettings({ displayName: displayName.trim(), email: email.trim() || sessionData.email || "", profilePhone: profilePhone.trim() });
    showMsg("Đã lưu hồ sơ!");
  };

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

  const fileRef = useRef(null);

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importData(file);
      showMsg("Nhập dữ liệu thành công! Đang tải lại...");
      setTimeout(() => window.location.reload(), 1200);
    } catch { showMsg("File không hợp lệ.", "error"); }
    e.target.value = "";
  };

  const [clearing, setClearing] = useState(false);

  // Helper: xóa chat data qua server API (dùng service role key, bypass RLS)
  const clearChatViaAPI = async (mode, targetUserId) => {
    try {
      await fetch("/api/clear-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, userId: targetUserId }),
      });
    } catch (e) { console.warn("[WF] Clear chat API:", e.message); }
  };

  // Xóa dữ liệu CÁ NHÂN (1 user)
  const handleClearData = async () => {
    if (!confirm("Xóa dữ liệu CÁ NHÂN của bạn (local + cloud + chat)?")) return;
    const pw = prompt("Nhập mật khẩu để xác nhận:");
    if (!pw) return;
    const h = await hashPassword(pw);
    if (h !== myAcc?.pwHash) { showMsg("Sai mật khẩu.", "error"); return; }
    setClearing(true);
    try {
      const supaId = session?.user?.id;
      await Promise.all([
        clearAllDataWithCloud(userId),
        supaId ? clearChatViaAPI("personal", supaId) : Promise.resolve(),
      ]);
    } catch {
      clearAllData();
    }
    window.location.reload();
  };

  // Xóa TOÀN BỘ HỆ THỐNG (tất cả user — chỉ director)
  const handleClearAllSystem = async () => {
    if (!confirm("XÓA TOÀN BỘ DỮ LIỆU HỆ THỐNG?\nTất cả nhân viên sẽ mất dữ liệu!")) return;
    if (!confirm("Xác nhận lần 2: KHÔNG THỂ HOÀN TÁC!")) return;
    const pw = prompt("Nhập mật khẩu giám đốc:");
    if (!pw) return;
    const h = await hashPassword(pw);
    if (h !== myAcc?.pwHash) { showMsg("Sai mật khẩu.", "error"); return; }
    setClearing(true);
    try {
      await Promise.all([
        clearAllSystemData(),
        clearChatViaAPI("system"),
      ]);
    } catch (e) {
      console.error("[WF] System clear failed:", e);
    }
    window.location.reload();
  };

  /* === Helpers === */
  const Toggle = ({ value, onChange, label, desc }) => (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px", marginBottom:10 }}>
      <div style={{ flex:1, marginRight:12 }}>
        <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{label}</div>
        {desc && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{desc}</div>}
      </div>
      <div className="tap" onClick={onChange} role="switch" aria-checked={value} aria-label={label}
        style={{ width:48, height:28, borderRadius:14, background: value ? C.green : C.border, position:"relative", cursor:"pointer", transition:"background .2s", flexShrink:0 }}>
        <div style={{ width:22, height:22, borderRadius:11, background:"#fff", position:"absolute", top:3, left: value ? 23 : 3, transition:"left .2s", boxShadow:"0 1px 4px rgba(0,0,0,.15)" }} />
      </div>
    </div>
  );

  const SelectRow = ({ label, desc, value, onChange, options }) => (
    <div style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px", marginBottom:10 }}>
      <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:4 }}>{label}</div>
      {desc && <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>{desc}</div>}
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}
        style={{ ...IS, padding:"8px 12px" }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );

  const SliderRow = ({ label, desc, value, onChange, min, max, step, unit }) => (
    <div style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px", marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{label}</div>
          {desc && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{desc}</div>}
        </div>
        <div style={{ fontSize:15, fontWeight:700, color:C.accent }}>{value}{unit || ""}</div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} aria-label={label}
        style={{ width:"100%", accentColor:C.accent }} />
    </div>
  );

  const Section = ({ title }) => (
    <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:8, marginTop:14, textTransform:"uppercase", letterSpacing:0.5 }}>{title}</div>
  );

  const handleUnlock = async () => {
    if (!lockPw.trim()) { showMsg("Vui lòng nhập mật khẩu.", "error"); return; }
    const h = await hashPassword(lockPw);
    if (h !== myAcc?.pwHash) { showMsg("Sai mật khẩu.", "error"); return; }
    setLocked(false); setLockPw(""); setMsg("");
  };

  return (
    <div onClick={onClose} className="modal-overlay" style={{ zIndex:85, alignItems: locked ? "flex-start" : "flex-end" }} role="dialog" aria-modal="true" aria-label="Cài đặt">
      <div onClick={e => e.stopPropagation()} className={locked ? "" : "sheet"} style={locked ? { background:"#fff", borderRadius:20, width:"100%", maxWidth:380, margin:"12vh 20px 0", animation:"slideUp .25s" } : undefined}>
        <div style={{ textAlign:"center", padding:"12px 0 0" }}>
          <div style={{ width:36, height:3, background:C.border, borderRadius:2, display:"inline-block" }} />
        </div>
        <div style={{ padding:"8px 18px 24px" }}>
          {/* Header */}
          <div style={{ display:"flex", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontSize:15, fontWeight:700, flex:1 }}>Cài đặt</div>
            <button className="tap" onClick={onClose} aria-label="Đóng" style={{ background:"none", border:"none", color:C.muted, fontSize:22 }}>x</button>
          </div>

          {/* Password gate */}
          {locked && !myAcc && (
            <div style={{ textAlign:"center", padding:"40px 0", color:C.muted, fontSize:14 }}>Đang tải...</div>
          )}
          {locked && myAcc && (<>
            <div style={{ textAlign:"center", padding:"20px 0 10px" }}>
              <div style={{ fontSize:32, marginBottom:8 }}>&#x1F512;</div>
              <div style={{ fontSize:14, color:C.sub, marginBottom:16 }}>Nhập mật khẩu để mở Cài đặt</div>
            </div>
            {msg && (
              <div role="alert" style={{ background:C.redD, border:`1px solid ${C.red}55`, borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:13, color:C.red, textAlign:"center" }}>{msg}</div>
            )}
            <input type="password" value={lockPw} onChange={e => setLockPw(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleUnlock()}
              onFocus={e => setTimeout(() => e.target.scrollIntoView({ behavior:"smooth", block:"center" }), 300)}
              placeholder="Mật khẩu..." style={{ ...IS, marginBottom:12 }} aria-label="Mật khẩu" autoFocus />
            <button className="tap" onClick={handleUnlock}
              style={{ width:"100%", background:`linear-gradient(135deg,${C.accent},${C.purple})`, color:"#fff", border:"none", borderRadius:14, padding:"14px", fontSize:15, fontWeight:700 }}>
              Mở khóa
            </button>
          </>)}

          {/* Main */}
          {!locked && (<>
          {/* User card */}
          <div style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px", marginBottom:16, display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:12, 
              background: settings.avatarImage ? `url(${settings.avatarImage})` : `linear-gradient(135deg,${settings.avatarColor || C.accent},${C.purple})`,
              backgroundSize:"cover", backgroundPosition:"center",
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:"#fff", fontWeight:700 }}>
              {!settings.avatarImage && (settings.displayName || user.name).charAt(0)}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{settings.displayName || user.name}</div>
              <div style={{ fontSize:11, color:C.muted }}>@{user.id}</div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:16 }}>
            {TABS.filter(t => settings.userRole !== "director" ? ["profile","ai","ui"].includes(t.id) : true).map(t => (
              <button key={t.id} className="tap" onClick={() => { setTab(t.id); setMsg(""); }}
                style={{ flexShrink:0, background: tab === t.id ? C.accent : C.card, color: tab === t.id ? "#fff" : C.sub, border:`1px solid ${tab === t.id ? C.accent : C.border}`, borderRadius:12, padding:"7px 12px", fontSize:11, fontWeight:600 }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Message */}
          {msg && (
            <div role="alert" style={{ background: msgType==="success" ? C.greenD : C.redD, border:`1px solid ${msgType==="success" ? C.green : C.red}55`, borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:13, color: msgType==="success" ? C.green : C.red, textAlign:"center" }}>{msg}</div>
          )}

          {/* ======== HỒ SƠ ======== */}
          {tab === "profile" && (<>
            {/* ── Ngành nghề ── */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:6 }}>NGÀNH NGHỀ</div>
              {settings.industryPreset ? (() => {
                const preset = INDUSTRY_PRESETS[settings.industryPreset];
                return preset ? (
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ padding:"10px 14px", borderRadius:12, background:C.accentD, border:`1px solid ${C.accent}33`, flex:1, display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:22 }}>{preset.icon}</span>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{preset.name}</div>
                        <div style={{ fontSize:10, color:C.muted }}>{preset.description}</div>
                      </div>
                    </div>
                    <button className="tap" onClick={() => setShowIndustryModal(true)}
                      style={{ padding:"10px 14px", borderRadius:12, background:C.card, border:`1px solid ${C.border}`, fontSize:12, fontWeight:600, color:C.accent, cursor:"pointer", whiteSpace:"nowrap" }}>
                      Đổi
                    </button>
                  </div>
                ) : null;
              })() : (
                <button className="tap" onClick={() => setShowIndustryModal(true)}
                  style={{ width:"100%", padding:"12px 16px", borderRadius:12, background:C.accent, border:"none", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                  Chọn ngành nghề
                </button>
              )}
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>EMAIL (TÀI KHOẢN CÔNG TY)</div>
              <div style={{ ...IS, background:C.bg, color:C.sub }}>{email || sessionData.email || "Chưa có"}</div>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>TÊN HIỂN THỊ</div>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} style={IS} placeholder="Tên của bạn..." />
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>CHỨC DANH</div>
              <div style={{ ...IS, background:C.bg, color:C.sub }}>{sessionData.title || user.title || "Nhân viên"}</div>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:4 }}>SỐ ĐIỆN THOẠI</div>
              <input value={profilePhone} onChange={e => setProfilePhone(e.target.value)} style={IS} placeholder="0912 345 678" type="tel" />
            </div>
            {/* Vai trò — dùng industry roles nếu có, fallback legacy */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:6 }}>VAI TRÒ</div>
              {settings.industryRoles?.length > 0 ? (
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {settings.industryRoles.map(r => {
                    const active = settings.userIndustryRole === r.id;
                    return (
                      <div key={r.id} className="tap" onClick={() => setSettings({ userIndustryRole: r.id })}
                        style={{ flex:"1 1 calc(50% - 4px)", padding:"10px 12px", borderRadius:12, border:`2px solid ${active?C.accent:C.border}`, background:active?C.accentD:C.card, cursor:"pointer" }}>
                        <div style={{ fontSize:13, fontWeight:700, color:active?C.accent:C.text }}>{r.label}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding:"10px 12px", borderRadius:12, border:`2px solid ${C.accent}44`, background:C.accentD }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.accent }}>{settings.userRole === "director" ? "👔 Giám đốc" : "🔧 Nhân viên"}</div>
                  <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>Vai trò được gán theo tài khoản</div>
                </div>
              )}
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:8 }}>AVATAR</div>
              
              {/* Avatar preview */}
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                <div style={{ width:64, height:64, borderRadius:16, background: settings.avatarImage ? `url(${settings.avatarImage})` : `linear-gradient(135deg,${settings.avatarColor || C.accent},${C.purple})`, 
                  backgroundSize:"cover", backgroundPosition:"center",
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, color:"#fff", fontWeight:700, flexShrink:0 }}>
                  {!settings.avatarImage && (settings.displayName || user.name).charAt(0)}
                </div>
                <div style={{ flex:1 }}>
                  <button className="tap" onClick={() => document.getElementById("avatar-input").click()}
                    style={{ background:C.accent, color:"#fff", border:"none", borderRadius:12, padding:"10px 16px", fontSize:13, fontWeight:600, marginBottom:8, width:"100%" }}>
                    📷 Chọn ảnh
                  </button>
                  {settings.avatarImage && (
                    <button className="tap" onClick={() => setSettings({ avatarImage: null })}
                      style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 12px", fontSize:11, color:C.red, fontWeight:600, width:"100%" }}>
                      Xóa ảnh
                    </button>
                  )}
                </div>
              </div>
              
              <input id="avatar-input" type="file" accept="image/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) {
                  showMsg("Ảnh không được quá 2MB", "error");
                  return;
                }
                const reader = new FileReader();
                reader.onload = (event) => {
                  setSettings({ avatarImage: event.target.result });
                  showMsg("Đã cập nhật ảnh đại diện!");
                };
                reader.readAsDataURL(file);
              }} style={{ display:"none" }} />

              <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:8 }}>MÀU NỀN (khi không có ảnh)</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {AVATAR_COLORS.map(color => (
                  <div key={color} className="tap" onClick={() => setSettings({ avatarColor: color })}
                    style={{ width:36, height:36, borderRadius:10, background:color, border: settings.avatarColor === color ? "3px solid #2b2d35" : "3px solid transparent", cursor:"pointer" }} />
                ))}
              </div>
            </div>
            <button className="tap" onClick={saveProfile}
              style={{ width:"100%", background:`linear-gradient(135deg,${C.accent},${C.purple})`, color:"#fff", border:"none", borderRadius:14, padding:"14px", fontSize:15, fontWeight:700 }}>
              Lưu hồ sơ
            </button>
          </>)}

          {/* ======== BẢO MẬT ======== */}
          {tab === "security" && (<>
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
          </>)}

          {/* ======== QUY TRÌNH ======== */}
          {tab === "workflow" && (<WorkflowTab settings={settings} setSettings={setSettings} showMsg={showMsg} />)}

          {/* ======== AI & GIỌNG ======== */}
          {tab === "ai" && (<>
            <Toggle label="Cho phép Wory chỉnh sửa công việc" desc="Thêm / sửa / xóa task qua AI chat hoặc voice"
              value={settings.woryCanEdit} onChange={() => setSettings(s => ({ ...s, woryCanEdit: !s.woryCanEdit }))} />
            {settings.woryCanEdit && (
              <div style={{ background:C.purpleD, borderRadius:12, padding:"12px 14px", fontSize:12, color:C.purple, lineHeight:1.6, marginBottom:10 }}>
                <b>Lưu ý:</b> Wory sẽ mô tả hành động và cho bạn xác nhận trước khi thực hiện.
              </div>
            )}
            {/* Wory tone / personality — only for manager/admin */}
            {settings.userRole !== "staff" && <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:6 }}>Phong cách nói của Wory</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {[
                  { key: "friendly", label: "🤝 Thân thiện", desc: "Như bạn bè" },
                  { key: "professional", label: "💼 Chuyên nghiệp", desc: "Ngắn gọn, lịch sự" },
                  { key: "funny", label: "😄 Vui vẻ", desc: "Dí dỏm, hài hước" },
                  { key: "strict", label: "📋 Nghiêm túc", desc: "Tập trung, kỷ luật" },
                  { key: "caring", label: "💛 Quan tâm", desc: "Ân cần, chu đáo" },
                ].map(t => (
                  <button key={t.key} className="tap" onClick={() => setSettings(s => ({ ...s, woryTone: t.key }))}
                    style={{ padding:"8px 12px", borderRadius:10, fontSize:12, fontWeight:600, border:`1.5px solid ${(settings.woryTone || "friendly") === t.key ? C.accent : C.border}`, background:(settings.woryTone || "friendly") === t.key ? C.accentD : C.card, color:(settings.woryTone || "friendly") === t.key ? C.accent : C.sub, cursor:"pointer" }}>
                    {t.label}
                    <div style={{ fontSize:9, fontWeight:400, color:C.muted, marginTop:2 }}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>}

            <Toggle label="Đọc text (TTS)" desc="Wory đọc câu trả lời bằng giọng nói"
              value={settings.ttsEnabled} onChange={() => setSettings(s => ({ ...s, ttsEnabled: !s.ttsEnabled }))} />
            <SliderRow label="Tốc độ đọc" value={settings.ttsSpeed} onChange={v => setSettings({ ttsSpeed: v })}
              min={0.7} max={1.6} step={0.1} unit="x" />
          </>)}

          {/* ======== HUẤN LUYỆN ======== */}
          {tab === "training" && (<TrainingTab knowledge={knowledge} setKnowledge={setKnowledge} pendingKnowledge={pendingKnowledge} showMsg={showMsg} IS={IS} />)}

          {/* ======== KẾT NỐI ======== */}
          {tab === "connect" && (<ConnectTab settings={settings} setSettings={setSettings} user={user} myAcc={myAcc} showMsg={showMsg} Toggle={Toggle} SelectRow={SelectRow} IS={IS} />)}

          {/* ======== CHI TIÊU ======== */}
          {tab === "expense" && (<>
            <Section title="Ngân sách" />
            <div style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px", marginBottom:14 }}>
              <div style={{ fontSize:12, color:C.sub, marginBottom:6 }}>Ngân sách hàng tháng (VNĐ)</div>
              <input type="number" value={settings.monthlyBudget || ""} onChange={e => setSettings({ monthlyBudget: Number(e.target.value) || 0 })}
                placeholder="VD: 10000000" style={{ ...IS, fontSize:15, fontWeight:700, marginBottom:8 }} />
              <div style={{ fontSize:11, color:C.muted }}>Để 0 = không giới hạn</div>
            </div>

            <Section title="Báo cáo chi tiêu" />
            <Toggle label="Gửi email báo cáo" desc="Wory gửi tổng kết chi tiêu qua Gmail hàng ngày"
              value={!!settings.sendExpenseEmail} onChange={() => setSettings(s => ({ ...s, sendExpenseEmail: !s.sendExpenseEmail }))} />
            <SelectRow label="Giờ tổng kết" value={settings.expenseReportTime || "21:00"}
              onChange={v => setSettings({ expenseReportTime: v })}
              options={[["18:00","18:00"],["19:00","19:00"],["20:00","20:00"],["21:00","21:00"],["22:00","22:00"]]} />

            <Section title="Tài khoản thanh toán" />
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {[
                ["cash","💵 Tiền mặt"],["bank_vietcombank","🏦 Vietcombank"],["bank_techcombank","🏦 Techcombank"],
                ["bank_mbbank","🏦 MB Bank"],["bank_tpbank","🏦 TPBank"],["bank_acb","🏦 ACB"],
                ["bank_bidv","🏦 BIDV"],["bank_vietinbank","🏦 VietinBank"],["bank_agribank","🏦 Agribank"],
                ["bank_sacombank","🏦 Sacombank"],["bank_vpbank","🏦 VPBank"],["bank_other","🏦 NH khác"],
                ["momo","📱 MoMo"],["zalopay","📱 ZaloPay"],
              ].map(([k, l]) => {
                const active = (settings.bankAccounts || []).includes(k);
                return (
                  <button key={k} className="tap" onClick={() => {
                    const list = settings.bankAccounts || [];
                    setSettings({ bankAccounts: active ? list.filter(x => x !== k) : [...list, k] });
                  }}
                    style={{ padding:"5px 10px", borderRadius:10, fontSize:11, fontWeight:600,
                      background: active ? C.accent + "20" : C.bg,
                      color: active ? C.accent : C.muted,
                      border: `1px solid ${active ? C.accent + "66" : C.border}` }}>
                    {l}
                  </button>
                );
              })}
            </div>
          </>)}

          {/* ======== NHÂN SỰ ======== */}
          {tab === "staff" && (<StaffManagement currentUserId={user.id} />)}

          {/* ======== GIAO DIỆN (Thông báo + Hiển thị gộp) ======== */}
          {tab === "ui" && (<>
            <Section title="Thông báo" />
            <Toggle label="Bật thông báo" desc="Nhận thông báo từ trình duyệt"
              value={settings.notificationsEnabled}
              onChange={() => {
                const next = !settings.notificationsEnabled;
                if (next && "Notification" in window && Notification.permission === "default") Notification.requestPermission();
                setSettings(s => ({ ...s, notificationsEnabled: next }));
              }} />
            <SelectRow label="Nhắc trước" value={String(settings.reminderMinutes)}
              onChange={v => setSettings({ reminderMinutes: Number(v) })}
              options={[["5","5 phút"],["10","10 phút"],["15","15 phút"],["30","30 phút"],["60","1 giờ"]]} />
            <Toggle label="Thông báo deadline" desc="Cảnh báo khi có deadline trong ngày"
              value={settings.notifyDeadline} onChange={() => setSettings(s => ({ ...s, notifyDeadline: !s.notifyDeadline }))} />
            <Toggle label="Thông báo quá hạn" desc="Cảnh báo khi task bị trễ"
              value={settings.notifyOverdue} onChange={() => setSettings(s => ({ ...s, notifyOverdue: !s.notifyOverdue }))} />

            <Section title="Hiển thị" />
            <SelectRow label="Tab mặc định" desc="Tab hiển thị khi mở app"
              value={settings.defaultTab} onChange={v => setSettings({ defaultTab: v })}
              options={[["tasks",t("task",settings)],["calendar","Lịch"],["inbox","Hộp thư"],["expense",t("expense",settings)],["report","Báo cáo"],["ai","AI"]]} />
            <SelectRow label="Bộ lọc mặc định" value={settings.defaultFilter}
              onChange={v => setSettings({ defaultFilter: v })}
              options={[["all","Tất cả"],["todo","Cần làm"],["inprogress","Đang làm"],["review","Chờ duyệt"],["done","Xong"]]} />
            <Toggle label="Hiển thị task đã hoàn thành" value={settings.showCompletedTasks}
              onChange={() => setSettings(s => ({ ...s, showCompletedTasks: !s.showCompletedTasks }))} />
            <SelectRow label="Thuận tay" value={settings.handSide || "right"}
              onChange={v => setSettings({ handSide: v })}
              options={[["right","Phải"],["left","Trái"]]} />

            <Section title="Tab hiển thị" />
            <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>Bật/tắt các tab trên thanh điều hướng</div>
            {[["tasks","📋",t("task",settings)],["calendar","📅","Lịch"],["inbox","💬","Trao đổi"],["expense","💰",t("expense",settings)],["report","📊","Báo cáo"],["ai","✦","Wory"]].map(([key,icon,label]) => {
              const isOn = (settings.visibleTabs || {})[key] !== false;
              return (
                <Toggle key={key} label={`${icon} ${label}`}
                  value={isOn}
                  onChange={() => setSettings(s => ({
                    ...s,
                    visibleTabs: { ...(s.visibleTabs || {}), [key]: !isOn }
                  }))} />
              );
            })}

            <Section title="Cỡ chữ" />
            <div style={{ display:"flex", gap:8, padding:"4px 0" }}>
              {[["1","Nhỏ"],["1.08","Vừa"],["1.15","Lớn"],["1.22","Rất lớn"]].map(([v,label]) => {
                const active = String(settings.fontScale || 1) === v;
                return (
                  <button key={v} className="tap" onClick={() => setSettings({ fontScale: Number(v) })}
                    style={{
                      flex:1, padding:"10px 4px", borderRadius:12, border: active ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                      background: active ? C.accent+"18" : C.card, cursor:"pointer", textAlign:"center",
                    }}>
                    <div style={{ fontSize: 11 * Number(v), fontWeight:700, color: active ? C.accent : C.text, lineHeight:1.2 }}>Aa</div>
                    <div style={{ fontSize:10, color: active ? C.accent : C.muted, marginTop:4, fontWeight: active ? 700 : 400 }}>{label}</div>
                    <div style={{ fontSize:9, color:C.muted }}>{Math.round(Number(v)*100)}%</div>
                  </button>
                );
              })}
            </div>
          </>)}

          {/* ======== DỮ LIỆU ======== */}
          {tab === "data" && (<>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
              <button className="tap" onClick={() => exportAllData(user.id)}
                style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 12px", textAlign:"center" }}>
                <div style={{ fontSize:24, marginBottom:6 }}>&#x1F4E4;</div>
                <div style={{ fontSize:13, fontWeight:700, color:C.text }}>Xuất dữ liệu</div>
                <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>Download JSON</div>
              </button>
              <button className="tap" onClick={() => fileRef.current?.click()}
                style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:"16px 12px", textAlign:"center" }}>
                <div style={{ fontSize:24, marginBottom:6 }}>&#x1F4E5;</div>
                <div style={{ fontSize:13, fontWeight:700, color:C.text }}>Nhập dữ liệu</div>
                <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>Từ file JSON</div>
              </button>
            </div>
            <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{ display:"none" }} />

            {/* Cloud Sync */}
            {supabase && session ? (
              <div style={{ background:C.accent+"12", border:`1px solid ${C.accent}33`, borderRadius:14, padding:"14px", marginBottom:14 }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.accent, marginBottom:8 }}>&#x2601;&#xFE0F; Đồng bộ đám mây</div>
                <div style={{ fontSize:11, color:C.muted, marginBottom:10, lineHeight:1.5 }}>
                  Dữ liệu tự động đồng bộ khi thay đổi. Bạn cũng có thể đồng bộ/khôi phục thủ công.
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <button className="tap" disabled={syncing} onClick={async () => {
                    setSyncing(true);
                    try {
                      const count = await cloudSaveAll(supabase, session.user.id);
                      showMsg(`Đã đồng bộ ${count} mục lên cloud!`);
                    } catch { showMsg("Lỗi đồng bộ.", "error"); }
                    setSyncing(false);
                  }} style={{ background:C.accent, border:"none", borderRadius:10, padding:"10px", fontSize:12, color:"#fff", fontWeight:600, opacity: syncing ? 0.6 : 1 }}>
                    {syncing ? "Đang đồng bộ..." : "Đồng bộ lên cloud"}
                  </button>
                  <button className="tap" disabled={restoring} onClick={async () => {
                    if (!confirm("Khôi phục dữ liệu từ cloud sẽ ghi đè dữ liệu hiện tại. Tiếp tục?")) return;
                    setRestoring(true);
                    try {
                      const rows = await cloudLoadAll(supabase, session.user.id);
                      if (!rows || rows.length === 0) { showMsg("Không tìm thấy dữ liệu trên cloud.", "error"); setRestoring(false); return; }
                      let count = 0;
                      for (const row of rows) {
                        if (row.key && row.data != null) { saveJSON(row.key, row.data); count++; }
                      }
                      showMsg(`Đã khôi phục ${count} mục từ cloud! Đang tải lại...`);
                      setTimeout(() => window.location.reload(), 1500);
                    } catch { showMsg("Lỗi khôi phục.", "error"); }
                    setRestoring(false);
                  }} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px", fontSize:12, color:C.text, fontWeight:600, opacity: restoring ? 0.6 : 1 }}>
                    {restoring ? "Đang khôi phục..." : "Khôi phục từ cloud"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ background:C.accent+"18", border:`1px solid ${C.accent}44`, borderRadius:12, padding:"12px 14px", marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.accent, marginBottom:4 }}>Khôi phục trên thiết bị mới</div>
                <div style={{ fontSize:11, color:C.muted, lineHeight:1.5 }}>
                  Đăng nhập Supabase để đồng bộ đám mây tự động.<br/>
                  Hoặc: <b>Xuất dữ liệu</b> → gửi qua Zalo / Gmail
                </div>
              </div>
            )}

            <SelectRow label="Giới hạn lịch sử" desc="Số sự kiện lưu tối đa"
              value={String(settings.historyLimit)} onChange={v => setSettings({ historyLimit: Number(v) })}
              options={[["100","100"],["300","300"],["500","500"],["1000","1000"]]} />
            <SelectRow label="Giới hạn chat" desc="Số tin nhắn chat lưu tối đa"
              value={String(settings.chatHistoryLimit)} onChange={v => setSettings({ chatHistoryLimit: Number(v) })}
              options={[["50","50"],["100","100"],["200","200"],["500","500"]]} />

            <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:14, marginTop:10 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.red, marginBottom:10 }}>Vùng nguy hiểm</div>
              <button className="tap" onClick={async () => {
                if (!confirm("Xóa toàn bộ lịch sử chat?")) return;
                const pw = prompt("Nhập mật khẩu:"); if (!pw) return;
                const h = await hashPassword(pw);
                if (h !== myAcc?.pwHash) { showMsg("Sai mật khẩu.", "error"); return; }
                saveJSON("chat_history", []); saveJSON("chat_archives", []);
                saveJSON("chat_started", Date.now());
                showMsg("Đã xóa lịch sử chat.");
                setTimeout(() => window.location.reload(), 500);
              }} style={{ width:"100%", background:C.redD, border:`1px solid ${C.red}44`, borderRadius:12, padding:"12px", fontSize:13, color:C.red, fontWeight:600, marginBottom:8 }}>
                Xóa lịch sử chat
              </button>
              <button className="tap" onClick={async () => {
                if (!confirm("Xóa toàn bộ ghi nhớ AI?")) return;
                const pw = prompt("Nhập mật khẩu:"); if (!pw) return;
                const h = await hashPassword(pw);
                if (h !== myAcc?.pwHash) { showMsg("Sai mật khẩu.", "error"); return; }
                saveJSON("memory", []); setMemory([]);
                showMsg("Đã xóa ghi nhớ.");
              }} style={{ width:"100%", background:C.redD, border:`1px solid ${C.red}44`, borderRadius:12, padding:"12px", fontSize:13, color:C.red, fontWeight:600, marginBottom:8 }}>
                Xóa ghi nhớ AI
              </button>
              <button className="tap" disabled={clearing} onClick={handleClearData}
                style={{ width:"100%", background:"#c0392b", border:"none", borderRadius:12, padding:"14px", fontSize:13, color:"#fff", fontWeight:700, opacity: clearing ? 0.6 : 1, marginBottom:8 }}>
                {clearing ? "Dang xoa..." : "Xoa du lieu CA NHAN (Local + Cloud)"}
              </button>
              {isDirector && (
                <button className="tap" disabled={clearing} onClick={handleClearAllSystem}
                  style={{ width:"100%", background:"#7f1d1d", border:"none", borderRadius:12, padding:"14px", fontSize:13, color:"#fff", fontWeight:700, opacity: clearing ? 0.6 : 1 }}>
                  {clearing ? "Dang xoa he thong..." : "XOA TOAN BO HE THONG (Tat ca nhan vien)"}
                </button>
              )}
            </div>
          </>)}

          {/* About inline — compact */}
          {tab === "data" && (
            <div style={{ marginTop:20, textAlign:"center", fontSize:11, color:C.muted, lineHeight:1.8 }}>
              <span style={{ fontFamily:"'Fraunces',serif", fontSize:14, fontWeight:700, color:C.accent }}>WorkFlow</span> v{CHANGELOG[0]?.version || "2.2"} · 3/2026<br/>
              React 19 + Claude Sonnet 4 + PWA<br/>
              AES-256-GCM · SHA-256 · OAuth 2.0
            </div>
          )}


          </>)}
        </div>
      </div>
      {showIndustryModal && <IndustrySetupModal isChange onClose={() => setShowIndustryModal(false)} />}
    </div>
  );
}

/* ================================================================
   TRAINING TAB — Wory Knowledge & Profile
   ================================================================ */
function TrainingTab({ knowledge, setKnowledge, pendingKnowledge, showMsg, IS }) {
  const profile = knowledge.profile || { ...DEFAULT_PROFILE };
  const [pf, setPf] = useState({ ...profile });
  const [catFilter, setCatFilter] = useState("all");
  const [editId, setEditId] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("context");
  const [addMode, setAddMode] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("context");

  const Section = ({ title }) => (
    <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:8, marginTop:14, textTransform:"uppercase", letterSpacing:0.5 }}>{title}</div>
  );

  const saveProfile = () => {
    saveKnowledgeProfile(knowledge, setKnowledge, pf);
    showMsg("Đã lưu hồ sơ Wory!");
  };

  const filtered = knowledge.entries.filter(e =>
    catFilter === "all" ? true : e.category === catFilter
  );

  const catOptions = [
    { id: "all", label: "Tất cả" },
    ...Object.entries(KNOWLEDGE_CATEGORIES).map(([id, { label }]) => ({ id, label })),
  ];

  return (
    <>
      {/* Pending approvals banner */}
      {pendingKnowledge.length > 0 && (
        <div style={{ background: C.gold + "18", border: `1px solid ${C.gold}44`, borderRadius: 12, padding: "12px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.gold }}>Wory muốn ghi nhớ {pendingKnowledge.length} điều mới</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Xem bên dưới để duyệt</div>
          </div>
          <button className="tap" onClick={() => { approveAllPending(knowledge, setKnowledge); showMsg("Đã duyệt tất cả!"); }}
            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 10, padding: "6px 12px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            Duyệt hết
          </button>
        </div>
      )}

      {/* Section 1: Manual Profile */}
      <Section title="Hồ sơ cho Wory" />
      <div style={{ fontSize: 12, color: C.sub, marginBottom: 10, lineHeight: 1.5 }}>
        Thông tin này giúp Wory hiểu bạn và tư vấn chính xác hơn.
      </div>

      {[
        ["role", "Vai trò / Chức vụ", "VD: Giám đốc, Trưởng phòng Marketing..."],
        ["company", "Công ty", "VD: ABC Corp"],
        ["industry", "Ngành", "VD: Công nghệ, Bất động sản..."],
        ["teamSize", "Quy mô đội", "VD: 15 người, 3 phòng ban"],
      ].map(([key, label, ph]) => (
        <div key={key} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>{label.toUpperCase()}</div>
          <input value={pf[key] || ""} onChange={e => setPf(p => ({ ...p, [key]: e.target.value }))}
            placeholder={ph} style={IS} />
        </div>
      ))}

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>PHONG CÁCH LÀM VIỆC</div>
        <textarea value={pf.workStyle || ""} onChange={e => setPf(p => ({ ...p, workStyle: e.target.value }))}
          placeholder="VD: Thích họp ngắn, làm việc sáng sớm, ưu tiên kết quả..." rows={2}
          style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>PHONG CÁCH GIAO TIẾP</div>
        <select value={pf.communication || ""} onChange={e => setPf(p => ({ ...p, communication: e.target.value }))}
          style={{ ...IS, padding: "8px 12px" }}>
          <option value="">-- Chọn --</option>
          <option value="Ngắn gọn, đi thẳng vấn đề">Ngắn gọn, đi thẳng vấn đề</option>
          <option value="Chi tiết, phân tích kỹ">Chi tiết, phân tích kỹ</option>
          <option value="Chính xác, dựa trên dữ liệu">Chính xác, dựa trên dữ liệu</option>
          <option value="Thoải mái, linh hoạt">Thoải mái, linh hoạt</option>
        </select>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>MỤC TIÊU HIỆN TẠI</div>
        <textarea value={pf.goals || ""} onChange={e => setPf(p => ({ ...p, goals: e.target.value }))}
          placeholder="VD: Mở rộng thị trường miền Nam, ra mắt sản phẩm mới Q2..." rows={2}
          style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>GHI CHÚ THÊM</div>
        <textarea value={pf.notes || ""} onChange={e => setPf(p => ({ ...p, notes: e.target.value }))}
          placeholder="Bất kỳ điều gì bạn muốn Wory biết..." rows={2}
          style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      <button className="tap" onClick={saveProfile}
        style={{ width: "100%", background: `linear-gradient(135deg,${C.accent},${C.purple})`, color: "#fff", border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 700, marginBottom: 20 }}>
        Lưu hồ sơ
      </button>

      {/* Section 2: Knowledge Review */}
      <Section title={`Wory đã học (${knowledge.entries.length})`} />

      {/* Category filter pills */}
      <div className="no-scrollbar" style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
        {catOptions.map(c => {
          const active = catFilter === c.id;
          const color = c.id === "all" ? C.accent : KNOWLEDGE_CATEGORIES[c.id]?.color || C.accent;
          const count = c.id === "all" ? knowledge.entries.length : knowledge.entries.filter(e => e.category === c.id).length;
          return (
            <button key={c.id} className="tap" onClick={() => setCatFilter(c.id)}
              style={{ flexShrink: 0, background: active ? color + "20" : C.card, color: active ? color : C.sub,
                border: `1px solid ${active ? color + "66" : C.border}`, borderRadius: 10, padding: "5px 10px", fontSize: 11, fontWeight: 600 }}>
              {c.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Add manual entry */}
      {addMode ? (
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.accent}44`, padding: 14, marginBottom: 10 }}>
          <textarea value={newContent} onChange={e => setNewContent(e.target.value)}
            placeholder="Nhập thông tin Wory cần nhớ..." rows={2} autoFocus
            style={{ ...IS, resize: "vertical", fontFamily: "inherit", marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {Object.entries(KNOWLEDGE_CATEGORIES).map(([id, { label, color }]) => (
              <button key={id} className="tap" onClick={() => setNewCategory(id)}
                style={{ padding: "4px 10px", borderRadius: 8, fontSize: 10, fontWeight: 600,
                  background: newCategory === id ? color + "20" : C.bg,
                  color: newCategory === id ? color : C.muted,
                  border: `1px solid ${newCategory === id ? color + "66" : C.border}` }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="tap" onClick={() => {
              if (!newContent.trim()) { showMsg("Vui lòng nhập nội dung.", "error"); return; }
              addKnowledgeEntry(knowledge, setKnowledge, newContent.trim(), newCategory, "manual");
              setNewContent(""); setAddMode(false);
              showMsg("Đã thêm!");
            }}
              style={{ flex: 1, background: C.accent, color: "#fff", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700 }}>
              Thêm
            </button>
            <button className="tap" onClick={() => { setAddMode(false); setNewContent(""); }}
              style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: C.muted }}>
              Hủy
            </button>
          </div>
        </div>
      ) : (
        <button className="tap" onClick={() => setAddMode(true)}
          style={{ width: "100%", background: C.card, border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "12px", fontSize: 13, color: C.accent, fontWeight: 600, marginBottom: 10 }}>
          + Thêm ghi nhớ
        </button>
      )}

      {/* Entries list */}
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px 0", color: C.muted, fontSize: 13 }}>
          Chưa có ghi nhớ nào{catFilter !== "all" ? ` trong "${KNOWLEDGE_CATEGORIES[catFilter]?.label}"` : ""}.
        </div>
      )}

      {filtered.map(entry => {
        const cat = KNOWLEDGE_CATEGORIES[entry.category] || { label: "Khác", color: C.muted };
        const isEditing = editId === entry.id;

        return (
          <div key={entry.id} style={{ background: C.card, borderRadius: 12, border: `1px solid ${!entry.approved ? C.gold + "44" : C.border}`, padding: "12px 14px", marginBottom: 8 }}>
            {isEditing ? (
              <>
                <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={2}
                  style={{ ...IS, resize: "vertical", fontFamily: "inherit", marginBottom: 8 }} autoFocus />
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  {Object.entries(KNOWLEDGE_CATEGORIES).map(([id, { label, color }]) => (
                    <button key={id} className="tap" onClick={() => setEditCategory(id)}
                      style={{ padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                        background: editCategory === id ? color + "20" : C.bg,
                        color: editCategory === id ? color : C.muted,
                        border: `1px solid ${editCategory === id ? color + "66" : C.border}` }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="tap" onClick={() => {
                    updateKnowledgeEntry(knowledge, setKnowledge, entry.id, { content: editContent.trim(), category: editCategory, approved: true });
                    setEditId(null);
                    showMsg("Đã cập nhật!");
                  }}
                    style={{ flex: 1, background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px", fontSize: 12, fontWeight: 600 }}>
                    Lưu
                  </button>
                  <button className="tap" onClick={() => setEditId(null)}
                    style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.muted }}>
                    Hủy
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: cat.color, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 13, color: C.text, lineHeight: 1.5 }}>{entry.content}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                  <span style={{ fontSize: 10, color: cat.color, fontWeight: 600, background: cat.color + "15", padding: "2px 8px", borderRadius: 6 }}>{cat.label}</span>
                  <span style={{ fontSize: 10, color: C.muted, background: C.bg, padding: "2px 6px", borderRadius: 6 }}>{entry.source === "auto" ? "Tự động" : "Tự nhập"}</span>
                  {!entry.approved && (
                    <span style={{ fontSize: 10, color: C.gold, fontWeight: 600 }}>Chờ duyệt</span>
                  )}
                  <div style={{ flex: 1 }} />
                  {!entry.approved && (
                    <button className="tap" onClick={() => { approveKnowledgeEntry(knowledge, setKnowledge, entry.id); showMsg("Đã duyệt!"); }}
                      style={{ background: C.green + "18", color: C.green, border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 600 }}>
                      Duyệt
                    </button>
                  )}
                  <button className="tap" onClick={() => { setEditId(entry.id); setEditContent(entry.content); setEditCategory(entry.category); }}
                    style={{ background: "none", border: "none", color: C.muted, fontSize: 12, padding: "2px 4px" }}>
                    &#x270E;
                  </button>
                  <button className="tap" onClick={() => { deleteKnowledgeEntry(knowledge, setKnowledge, entry.id); showMsg("Đã xóa!"); }}
                    style={{ background: "none", border: "none", color: C.red, fontSize: 13, padding: "2px 4px" }}>
                    x
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* Stats footer */}
      {knowledge.entries.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: C.muted }}>
          {knowledge.entries.length} ghi nhớ · {knowledge.entries.filter(e => e.approved).length} đã duyệt · {pendingKnowledge.length} chờ duyệt
        </div>
      )}
    </>
  );
}

/* ================================================================
   WORKFLOW TAB — Manage company workflow templates
   ================================================================ */
function WorkflowTab({ settings, setSettings, showMsg }) {
  const customs = settings.customWorkflows || [];
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editSteps, setEditSteps] = useState([]);
  const [newStep, setNewStep] = useState("");
  const fileRef = useRef(null);
  const rulesFileRef = useRef(null);
  const rulesFiles = settings.staffRulesFiles || [];

  const handleRulesUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showMsg("File không được quá 5MB", "error"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const newFile = { id: Date.now(), name: file.name, size: file.size, type: file.type, data: ev.target.result, uploadedAt: new Date().toISOString() };
      setSettings(s => ({ ...s, staffRulesFiles: [...(s.staffRulesFiles || []), newFile] }));
      showMsg(`Đã tải lên: ${file.name}`);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const deleteRulesFile = (id) => {
    setSettings(s => ({ ...s, staffRulesFiles: (s.staffRulesFiles || []).filter(f => f.id !== id) }));
    showMsg("Đã xóa file quy định");
  };
  const viewRulesFile = (file) => {
    const a = document.createElement("a"); a.href = file.data; a.download = file.name; a.click();
  };

  const saveCustoms = (list) => setSettings(s => ({ ...s, customWorkflows: list }));

  // Start editing
  const startEdit = (wf) => { setEditId(wf.id); setEditName(wf.name); setEditSteps([...wf.steps]); };
  const startNew = () => { setEditId("__new__"); setEditName(""); setEditSteps([]); };
  const cancelEdit = () => { setEditId(null); setEditName(""); setEditSteps([]); setNewStep(""); };

  // Copy from default template
  const copyDefault = (wf) => {
    const id = "custom_" + Date.now();
    saveCustoms([...customs, { id, name: wf.name, steps: [...wf.steps] }]);
    showMsg("Đã sao chép mẫu: " + wf.name);
  };

  // Save edit
  const saveEdit = () => {
    if (!editName.trim()) return;
    if (editId === "__new__") {
      const id = "custom_" + Date.now();
      saveCustoms([...customs, { id, name: editName.trim(), steps: editSteps }]);
    } else {
      saveCustoms(customs.map(w => w.id === editId ? { ...w, name: editName.trim(), steps: editSteps } : w));
    }
    cancelEdit();
  };

  const deleteWf = (id) => { if (confirm("Xoá mẫu quy trình này?")) saveCustoms(customs.filter(w => w.id !== id)); };

  // Step editing helpers
  const addStep = () => { if (newStep.trim()) { setEditSteps(p => [...p, newStep.trim()]); setNewStep(""); } };
  const removeStep = (i) => setEditSteps(p => p.filter((_, idx) => idx !== i));

  // Export/Import
  const exportWf = () => {
    const data = JSON.stringify(customs, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "workflow-templates.json"; a.click();
    URL.revokeObjectURL(url);
    showMsg("Đã tải xuống file mẫu quy trình");
  };

  const importWf = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data)) throw new Error("Invalid");
        const valid = data.filter(w => w.name && Array.isArray(w.steps));
        const imported = valid.map(w => ({ id: w.id || ("custom_" + Date.now() + Math.random()), name: w.name, steps: w.steps }));
        saveCustoms([...customs, ...imported]);
        showMsg(`Đã nhập ${imported.length} mẫu quy trình`);
      } catch { showMsg("File không hợp lệ"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (<>
    {/* ── Staff Rules Files ── */}
    <div style={{ marginBottom:18 }}>
      <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:8 }}>Quy định nhân viên</div>
      <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>Upload file quy định, nội quy, chính sách cho nhân viên (PDF, DOCX, TXT, hình ảnh)</div>
      {rulesFiles.map(f => (
        <div key={f.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", marginBottom:4, background:C.card, borderRadius:10, border:`1px solid ${C.border}` }}>
          <span style={{ fontSize:16 }}>{f.type?.includes("pdf") ? "📄" : f.type?.includes("image") ? "🖼️" : f.type?.includes("word") || f.type?.includes("document") ? "📝" : "📎"}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:600, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</div>
            <div style={{ fontSize:10, color:C.muted }}>{(f.size / 1024).toFixed(0)}KB — {new Date(f.uploadedAt).toLocaleDateString("vi-VN")}</div>
          </div>
          <span className="tap" onClick={() => viewRulesFile(f)} style={{ fontSize:11, color:C.accent, cursor:"pointer", padding:"2px 6px" }}>Tải</span>
          <span className="tap" onClick={() => deleteRulesFile(f.id)} style={{ fontSize:11, color:C.red, cursor:"pointer", padding:"2px 6px" }}>Xóa</span>
        </div>
      ))}
      <button className="tap" onClick={() => rulesFileRef.current?.click()}
        style={{ width:"100%", padding:"10px", borderRadius:10, border:`1px dashed ${C.accent}44`, background:C.accentD, color:C.accent, fontSize:12, fontWeight:700, marginTop:4 }}>
        + Tải lên file quy định
      </button>
      <input ref={rulesFileRef} type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={handleRulesUpload} style={{ display:"none" }} />
    </div>

    {/* Edit mode */}
    {editId && (
      <div style={{ marginBottom:16, padding:14, background:C.card, borderRadius:14, border:`1px solid ${C.accent}44` }}>
        <div style={{ fontSize:13, fontWeight:700, color:C.accent, marginBottom:10 }}>{editId === "__new__" ? "Tạo mẫu mới" : "Sửa mẫu"}</div>
        <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Tên quy trình..."
          style={{ width:"100%", fontSize:13, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 12px", outline:"none", color:C.text, background:C.bg, boxSizing:"border-box", marginBottom:10 }} />
        {editSteps.map((s, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"3px 0" }}>
            <span style={{ fontSize:11, fontWeight:700, color:C.accent, width:18, textAlign:"center" }}>{i+1}</span>
            <span style={{ flex:1, fontSize:12, color:C.text }}>{s}</span>
            <span className="tap" onClick={() => removeStep(i)} style={{ fontSize:13, color:C.red, cursor:"pointer", padding:"0 4px" }}>×</span>
          </div>
        ))}
        <div style={{ display:"flex", gap:6, marginTop:6, alignItems:"center" }}>
          <input value={newStep} onChange={e => setNewStep(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addStep(); }}
            placeholder={`Bước ${editSteps.length+1}...`}
            style={{ flex:1, fontSize:12, border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 10px", outline:"none", color:C.text, background:C.bg }} />
          <button className="tap" onClick={addStep}
            style={{ padding:"6px 12px", borderRadius:8, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:700, opacity:newStep.trim()?1:0.4 }}>+</button>
        </div>
        <div style={{ display:"flex", gap:8, marginTop:12 }}>
          <button className="tap" onClick={cancelEdit} style={{ flex:1, padding:"8px", borderRadius:10, border:`1px solid ${C.border}`, background:C.card, color:C.sub, fontSize:12, fontWeight:600 }}>Huỷ</button>
          <button className="tap" onClick={saveEdit} style={{ flex:1, padding:"8px", borderRadius:10, border:"none", background:C.accent, color:"#fff", fontSize:12, fontWeight:700, opacity:editName.trim()?1:0.4 }}>Lưu</button>
        </div>
      </div>
    )}

    {/* Company templates */}
    <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:8 }}>Mẫu công ty ({customs.length})</div>
    {customs.length === 0 && !editId && <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>Chưa có — tạo mới hoặc sao chép từ mẫu mặc định bên dưới</div>}
    {customs.map(w => (
      <CustomWfCard key={w.id} wf={w} onEdit={() => startEdit(w)} onDelete={() => deleteWf(w.id)} />
    ))}
    {!editId && <button className="tap" onClick={startNew}
      style={{ width:"100%", padding:"10px", borderRadius:10, border:`1px dashed ${C.accent}44`, background:C.accentD, color:C.accent, fontSize:12, fontWeight:700, marginTop:6, marginBottom:16 }}>
      + Tạo mẫu mới
    </button>}

    {/* Export / Import */}
    <div style={{ display:"flex", gap:8, marginBottom:16 }}>
      <button className="tap" onClick={exportWf} disabled={!customs.length}
        style={{ flex:1, padding:"8px", borderRadius:10, border:`1px solid ${C.border}`, background:C.card, color:customs.length ? C.accent : C.muted, fontSize:12, fontWeight:600 }}>
        ⬇ Tải xuống
      </button>
      <button className="tap" onClick={() => fileRef.current?.click()}
        style={{ flex:1, padding:"8px", borderRadius:10, border:`1px solid ${C.border}`, background:C.card, color:C.accent, fontSize:12, fontWeight:600 }}>
        ⬆ Tải lên
      </button>
      <input ref={fileRef} type="file" accept=".json" onChange={importWf} style={{ display:"none" }} />
    </div>

    {/* Default templates (expandable + copy) */}
    <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:8 }}>Mẫu mặc định</div>
    {WORKFLOWS.map(w => (
      <DefaultWfCard key={w.id} wf={w} onCopy={() => copyDefault(w)} />
    ))}
  </>);
}

/* ── Custom Workflow Card (expandable + edit/delete) ── */
function CustomWfCard({ wf, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom:4, background:C.card, borderRadius:10, border:`1px solid ${C.border}`, overflow:"hidden" }}>
      <div className="tap" onClick={() => setOpen(o => !o)}
        style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", cursor:"pointer" }}>
        <span style={{ fontSize:14, transition:"transform .2s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{wf.name}</div>
          <div style={{ fontSize:10, color:C.muted }}>{wf.steps.length} bước</div>
        </div>
        <span className="tap" onClick={e => { e.stopPropagation(); onEdit(); }} style={{ fontSize:11, color:C.accent, cursor:"pointer", padding:"2px 6px" }}>Sửa</span>
        <span className="tap" onClick={e => { e.stopPropagation(); onDelete(); }} style={{ fontSize:11, color:C.red, cursor:"pointer", padding:"2px 6px" }}>Xoá</span>
      </div>
      {open && (
        <div style={{ padding:"0 10px 10px 34px" }}>
          {wf.steps.map((s, i) => (
            <div key={i} style={{ display:"flex", gap:6, padding:"3px 0", alignItems:"baseline" }}>
              <span style={{ fontSize:10, fontWeight:700, color:C.accent, width:16, textAlign:"right", flexShrink:0 }}>{i+1}.</span>
              <span style={{ fontSize:11, color:C.text }}>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Default Workflow Card (expandable) ── */
function DefaultWfCard({ wf, onCopy }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom:4, background:C.bg, borderRadius:10, border:`1px solid ${C.border}`, overflow:"hidden" }}>
      <div className="tap" onClick={() => setOpen(o => !o)}
        style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", cursor:"pointer" }}>
        <span style={{ fontSize:14, transition:"transform .2s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:600, color:C.sub }}>{wf.name}</div>
          <div style={{ fontSize:10, color:C.muted }}>{wf.steps.length} bước</div>
        </div>
        <span className="tap" onClick={e => { e.stopPropagation(); onCopy(); }}
          style={{ fontSize:11, color:C.accent, fontWeight:600, padding:"2px 8px", borderRadius:6, border:`1px solid ${C.accent}33`, background:C.accentD }}>Sao chép</span>
      </div>
      {open && (
        <div style={{ padding:"0 10px 10px 34px" }}>
          {wf.steps.map((s, i) => (
            <div key={i} style={{ display:"flex", gap:6, padding:"3px 0", alignItems:"baseline" }}>
              <span style={{ fontSize:10, fontWeight:700, color:C.accent, width:16, textAlign:"right", flexShrink:0 }}>{i+1}.</span>
              <span style={{ fontSize:11, color:C.text }}>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================
   CONNECT TAB — Integrations + Gmail Backup
   ================================================================ */
function ConnectTab({ settings, setSettings, user, myAcc, showMsg, Toggle, SelectRow, IS }) {
  const [tgToken, setTgToken] = useState("");
  const [tgConnecting, setTgConnecting] = useState(false);
  const [zaloId, setZaloId] = useState("");
  const [gmailEmail, setGmailEmail] = useState("");
  const [gmailConnecting, setGmailConnecting] = useState(false);

  const backupEmail = loadJSON("backup_email", null);
  const gmailData = loadJSON("gmail_token", null);
  const tgData = loadJSON("telegram_token", null);
  const zaloData = loadJSON("zalo_token", null);
  const messengerData = loadJSON("messenger_token", null);
  const igData = loadJSON("instagram_token", null);

  const connectTelegram = async () => {
    const token = tgToken.trim();
    if (!token) { showMsg("Vui lòng nhập Bot Token.", "error"); return; }
    setTgConnecting(true);
    try {
      const res = await fetch("/api/telegram-fetch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_token: token, limit: 1 }),
      });
      const data = await res.json();
      if (data.needReauth || data.error) { showMsg("Token không hợp lệ.", "error"); setTgConnecting(false); return; }
      const encrypted = await encryptToken({ bot_token: token, botUsername: data.botUsername }, user.id);
      if (encrypted) localStorage.setItem("wf_telegram_enc", encrypted);
      saveJSON("telegram_token", { botUsername: data.botUsername, connected_at: new Date().toISOString() });
      showMsg(`Đã kết nối @${data.botUsername}!`); setTgToken("");
    } catch { showMsg("Lỗi kết nối.", "error"); }
    setTgConnecting(false);
  };

  const connectZalo = () => {
    const id = zaloId.trim();
    if (!id) { showMsg("Vui lòng nhập Zalo OA ID.", "error"); return; }
    saveJSON("zalo_token", { oaId: id, connected_at: new Date().toISOString() });
    showMsg("Đã lưu Zalo OA ID!"); setZaloId("");
  };

  const INTEGRATIONS = [
    { id: "gmail", icon: "&#x1F4E7;", label: "Gmail", color: "#4285f4", desc: "Sao lưu dữ liệu qua email",
      connected: !!backupEmail, detail: backupEmail },
    { id: "telegram", icon: "&#x1F4F1;", label: "Telegram", color: "#0088cc", desc: "Nhận tin nhắn từ Bot",
      connected: !!tgData?.botUsername, detail: tgData?.botUsername ? `@${tgData.botUsername}` : null },
    { id: "zalo", icon: "&#x1F4AC;", label: "Zalo", color: "#0068ff", desc: "Nhận tin nhắn từ Zalo OA",
      connected: !!zaloData?.oaId, detail: zaloData?.oaId ? `OA: ${zaloData.oaId}` : null },
    { id: "messenger", icon: "&#x1F4AC;", label: "Messenger", color: "#0084ff", desc: "Đang phát triển",
      connected: !!messengerData?.pageId, detail: messengerData?.pageName || null },
    { id: "instagram", icon: "&#x1F4F8;", label: "Instagram", color: "#e1306c", desc: "Đang phát triển",
      connected: !!igData?.username, detail: igData?.username ? `@${igData.username}` : null },
  ];

  const [expandedInt, setExpandedInt] = useState(null);

  return (
    <>
      <div style={{ textAlign:"center", marginBottom:16 }}>
        <div style={{ fontSize:15, fontWeight:700, color:C.text }}>Kết nối & Sao lưu</div>
        <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>Kết nối Gmail để sao lưu tự động + nhận email</div>
      </div>

      {INTEGRATIONS.map(int => (
        <div key={int.id} style={{ marginBottom:8 }}>
          <div className="tap" onClick={() => setExpandedInt(expandedInt === int.id ? null : int.id)}
            style={{ background:C.card, borderRadius: expandedInt === int.id ? "14px 14px 0 0" : 14, border:`1px solid ${int.connected ? int.color + "44" : C.border}`,
              borderBottom: expandedInt === int.id ? "none" : undefined,
              padding:"14px", display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ fontSize:20 }} dangerouslySetInnerHTML={{ __html: int.icon }} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:C.text }}>{int.label}</div>
              <div style={{ fontSize:11, color:C.muted }}>{int.connected ? int.detail : int.desc}</div>
            </div>
            <div style={{ fontSize:10, fontWeight:600, color: int.connected ? C.green : C.muted,
              background: int.connected ? C.green + "18" : C.border, borderRadius:8, padding:"4px 10px" }}>
              {int.connected ? "Kết nối" : "Tắt"}
            </div>
          </div>

          {expandedInt === int.id && (
            <div style={{ background:C.card, borderRadius:"0 0 14px 14px", border:`1px solid ${int.connected ? int.color + "44" : C.border}`, borderTop:"none", padding:"14px" }}>

              {/* ── GMAIL — chỉ cần nhập email ── */}
              {int.id === "gmail" && (
                int.connected ? (<div>
                  <div style={{ background:C.greenD, borderRadius:10, padding:"12px", marginBottom:10, textAlign:"center" }}>
                    <div style={{ fontSize:13, fontWeight:600, color:C.green }}>{backupEmail}</div>
                    <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>Backup sẽ gửi đến email này</div>
                  </div>

                  <button className="tap" onClick={async () => {
                    showMsg("Đang gửi backup...");
                    const result = await sendBackupEmail(user.id);
                    showMsg(result.success ? "Đã sao lưu!" : (result.error || "Thất bại"), result.success ? "success" : "error");
                  }}
                    style={{ width:"100%", background:`linear-gradient(135deg,${C.accent},${C.purple})`, color:"#fff", border:"none", borderRadius:12, padding:"12px", fontSize:13, fontWeight:700, marginBottom:8, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                    <span>&#x2601;</span> Sao lưu ngay
                  </button>
                  {(() => { const lb = loadJSON("last_backup", null); return lb ? <div style={{ fontSize:10, color:C.muted, textAlign:"center", marginBottom:8 }}>Lần cuối: {new Date(lb).toLocaleString("vi-VN")}</div> : null; })()}

                  <Toggle label="Tự động sao lưu hàng ngày" desc="Gửi backup qua email mỗi ngày"
                    value={!!settings.autoBackup} onChange={() => setSettings(s => ({ ...s, autoBackup: !s.autoBackup }))} />

                  <button className="tap" onClick={() => {
                    if (!confirm("Ngắt kết nối email backup?")) return;
                    saveJSON("backup_email", null);
                    showMsg("Đã ngắt kết nối.");
                  }} style={{ width:"100%", background:C.redD, border:`1px solid ${C.red}44`, borderRadius:10, padding:"10px", fontSize:12, color:C.red, fontWeight:600, marginTop:8 }}>
                    Ngắt kết nối
                  </button>
                </div>) : (<div>
                  <div style={{ fontSize:12, color:C.sub, lineHeight:1.6, marginBottom:12 }}>
                    Nhập email để nhận bản sao lưu dữ liệu tự động. Không cần mật khẩu.
                  </div>

                  <input value={gmailEmail} onChange={e => setGmailEmail(e.target.value)}
                    placeholder="Email của bạn..." style={{ ...IS, fontSize:13, marginBottom:8 }} type="email" autoFocus
                    onKeyDown={e => { if (e.key === "Enter" && gmailEmail.trim()) document.getElementById("btn-connect-email")?.click(); }} />

                  <button id="btn-connect-email" className="tap" onClick={async () => {
                    const em = gmailEmail.trim();
                    if (!em) { showMsg("Vui lòng nhập email.", "error"); return; }
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { showMsg("Email không hợp lệ.", "error"); return; }
                    setGmailConnecting(true);
                    try {
                      const testRes = await fetch("/api/smtp-backup", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ to: em, testOnly: true }),
                      });
                      const testResult = await testRes.json();
                      if (testResult.success) {
                        saveJSON("backup_email", em);
                        showMsg(`Đã kết nối! Kiểm tra hộp thư ${em}`);
                        setGmailEmail("");
                      } else {
                        showMsg(testResult.error || "Kết nối thất bại.", "error");
                      }
                    } catch { showMsg("Lỗi kết nối server.", "error"); }
                    setGmailConnecting(false);
                  }} disabled={gmailConnecting || !gmailEmail.trim()}
                    style={{ width:"100%", background: gmailEmail.trim() ? `linear-gradient(135deg,${C.accent},${C.purple})` : C.border, color:"#fff", border:"none", borderRadius:12, padding:"12px", fontSize:14, fontWeight:700 }}>
                    {gmailConnecting ? "Đang gửi email xác nhận..." : "Kết nối"}
                  </button>
                </div>)
              )}

              {/* ── TELEGRAM ── */}
              {int.id === "telegram" && (
                int.connected ? (<div>
                  <div style={{ background:`${int.color}15`, borderRadius:10, padding:"12px", marginBottom:10, textAlign:"center" }}>
                    <div style={{ fontSize:13, fontWeight:600, color:int.color }}>@{tgData.botUsername}</div>
                  </div>
                  <button className="tap" onClick={async () => {
                    if (!confirm("Ngắt kết nối Telegram?")) return;
                    saveJSON("telegram_token", null); saveJSON("telegram_messages", null);
                    localStorage.removeItem("wf_telegram_enc");
                    showMsg("Đã ngắt kết nối.");
                  }} style={{ width:"100%", background:C.redD, border:`1px solid ${C.red}44`, borderRadius:10, padding:"10px", fontSize:12, color:C.red, fontWeight:600 }}>
                    Ngắt kết nối
                  </button>
                </div>) : (<div>
                  <div style={{ fontSize:12, color:C.sub, lineHeight:1.6, marginBottom:10 }}>
                    1. Mở Telegram → <b>@BotFather</b> → <code>/newbot</code><br/>
                    2. Dán Bot Token bên dưới
                  </div>
                  <input value={tgToken} onChange={e => setTgToken(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && connectTelegram()}
                    placeholder="Bot Token..." style={{ ...IS, marginBottom:8, fontSize:12 }} />
                  <button className="tap" onClick={connectTelegram} disabled={tgConnecting || !tgToken.trim()}
                    style={{ width:"100%", background: tgToken.trim() ? int.color : C.border, color:"#fff", border:"none", borderRadius:12, padding:"12px", fontSize:14, fontWeight:700 }}>
                    {tgConnecting ? "Đang kết nối..." : "Kết nối"}
                  </button>
                </div>)
              )}

              {/* ── ZALO ── */}
              {int.id === "zalo" && (
                int.connected ? (<div>
                  <div style={{ background:`${int.color}15`, borderRadius:10, padding:"12px", marginBottom:10, textAlign:"center" }}>
                    <div style={{ fontSize:13, fontWeight:600, color:int.color }}>OA: {zaloData.oaId}</div>
                  </div>
                  <button className="tap" onClick={() => {
                    if (!confirm("Ngắt kết nối Zalo?")) return;
                    saveJSON("zalo_token", null); saveJSON("zalo_messages", null);
                    showMsg("Đã ngắt kết nối.");
                  }} style={{ width:"100%", background:C.redD, border:`1px solid ${C.red}44`, borderRadius:10, padding:"10px", fontSize:12, color:C.red, fontWeight:600 }}>
                    Ngắt kết nối
                  </button>
                </div>) : (<div>
                  <div style={{ fontSize:12, color:C.sub, lineHeight:1.6, marginBottom:10 }}>
                    1. Đăng ký <b>Zalo OA</b> tại oa.zalo.me<br/>
                    2. Dán OA ID bên dưới
                  </div>
                  <input value={zaloId} onChange={e => setZaloId(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && connectZalo()}
                    placeholder="Zalo OA ID..." style={{ ...IS, marginBottom:8, fontSize:12 }} />
                  <button className="tap" onClick={connectZalo} disabled={!zaloId.trim()}
                    style={{ width:"100%", background: zaloId.trim() ? int.color : C.border, color:"#fff", border:"none", borderRadius:12, padding:"12px", fontSize:14, fontWeight:700 }}>
                    Kết nối
                  </button>
                </div>)
              )}

              {/* ── MESSENGER / INSTAGRAM ── */}
              {(int.id === "messenger" || int.id === "instagram") && (
                <div style={{ background:`${C.gold}15`, borderRadius:10, padding:"12px", textAlign:"center" }}>
                  <div style={{ fontSize:12, fontWeight:600, color:C.gold }}>Đang phát triển</div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>Sẽ có trong bản cập nhật tới.</div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <div style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px", marginTop:8 }}>
        <div style={{ fontSize:12, fontWeight:600, color:C.text, marginBottom:6 }}>&#x1F512; Bảo mật</div>
        <div style={{ fontSize:11, color:C.muted, lineHeight:1.6 }}>
          Token mã hóa AES-256-GCM · Không lưu trên server · Ngắt kết nối bất cứ lúc nào
        </div>
      </div>
    </>
  );
}
