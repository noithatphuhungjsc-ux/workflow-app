/* ProfileTab — Hồ sơ */
import { useState } from "react";
import { C, TEAM_ACCOUNTS } from "../../constants";
import { INDUSTRY_PRESETS } from "../../industryPresets";
import { IS } from "./SettingsHelpers";

const AVATAR_COLORS = [C.accent, C.purple, C.green, C.gold, C.red, "#e67e22", "#1abc9c", "#e91e63", "#607d8b", "#795548"];

export default function ProfileTab({ user, settings, setSettings, showMsg, sessionData, displayName, setDisplayName, email, profilePhone, setProfilePhone, setShowIndustryModal }) {
  const saveProfile = () => {
    setSettings({ displayName: displayName.trim(), email: email.trim() || sessionData.email || "", profilePhone: profilePhone.trim() });
    showMsg("Đã lưu hồ sơ!");
  };

  return (
    <>
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
              {user.id === "trinh" && (
                <button className="tap" onClick={() => setShowIndustryModal(true)}
                  style={{ padding:"10px 14px", borderRadius:12, background:C.card, border:`1px solid ${C.border}`, fontSize:12, fontWeight:600, color:C.accent, cursor:"pointer", whiteSpace:"nowrap" }}>
                  Đổi
                </button>
              )}
            </div>
          ) : null;
        })() : (
          user.id === "trinh" ? (
            <button className="tap" onClick={() => setShowIndustryModal(true)}
              style={{ width:"100%", padding:"12px 16px", borderRadius:12, background:C.accent, border:"none", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
              Chọn ngành nghề
            </button>
          ) : (
            <div style={{ padding:"10px 14px", borderRadius:12, background:C.accentD, border:`1px solid ${C.accent}33`, fontSize:13, color:C.text }}>
              Xây dựng & Nội thất
            </div>
          )
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
      {/* Vai trò */}
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
    </>
  );
}
