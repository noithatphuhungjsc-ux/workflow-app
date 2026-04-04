/* ================================================================
   SETTINGS MODAL — 11 tabs (refactored into sub-components)
   Hồ sơ | Bảo mật | Quy trình | AI & Giọng | Huấn luyện | Kết nối | Chi tiêu | Nhân sự | Tổ chức | Giao diện | Dữ liệu
   ================================================================ */
import { useState, useEffect } from "react";
import { C, DEFAULT_PASSWORD } from "../constants";
import IndustrySetupModal from "./IndustrySetupModal";
import StaffManagement from "./StaffManagement";
import { useStore } from "../store";
import { hashPassword, loadAccounts, saveAccounts, clearAllData, clearAllDataWithCloud, clearAllSystemData } from "../services";
import { useSupabase } from "../contexts/SupabaseContext";

import {
  ProfileTab,
  SecurityTab,
  AITab,
  ConnectionTab,
  ExpenseSettingsTab,
  AppearanceTab,
  DataTab,
  TrainingTab,
  WorkflowTab,
  OrgChartTab,
} from "./settings";

const TABS = [
  { id: "profile",  label: "Hồ sơ" },
  { id: "security", label: "Bảo mật" },
  { id: "workflow",  label: "Quy trình" },
  { id: "ai",       label: "AI & Giọng" },
  { id: "training", label: "Huấn luyện" },
  { id: "connect",  label: "Kết nối" },
  { id: "expense",  label: "Chi tiêu" },
  { id: "staff",    label: "Nhân sự" },
  { id: "orgchart", label: "Tổ chức" },
  { id: "ui",       label: "Giao diện" },
  { id: "data",     label: "Dữ liệu" },
];

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
  const [clearing, setClearing] = useState(false);
  const isDirector = settings.userRole === "director" || ["dev","manager"].includes(settings.userRole);

  useEffect(() => {
    (async () => {
      const accts = loadAccounts() || {};
      if (!accts[user.id]) {
        accts[user.id] = { id: user.id, name: user.name, pwHash: await hashPassword(DEFAULT_PASSWORD), twoFA: false, phone: "" };
        saveAccounts(accts);
      }
      setAcct(accts);
    })();
  }, [user.id, user.name]);

  const myAcc = accounts?.[user.id];

  // Auto-populate from session
  const sessionData = (() => { try { return JSON.parse(localStorage.getItem("wf_session") || "{}"); } catch { return {}; } })();
  const [displayName, setDisplayName] = useState(settings.displayName || user.name);
  const [email, setEmail] = useState(settings.email || sessionData.email || myAcc?.email || "");
  const [profilePhone, setProfilePhone] = useState(settings.profilePhone || sessionData.phone || myAcc?.phone || "");

  const showMsg = (text, type = "success") => { setMsg(text); setMsgType(type); setTimeout(() => setMsg(""), 3000); };

  // Helper: clear chat via server API
  const clearChatViaAPI = async (mode, targetUserId) => {
    try {
      await fetch("/api/clear-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, userId: targetUserId }),
      });
    } catch (e) { console.warn("[WF] Clear chat API:", e.message); }
  };

  // Clear personal data
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

  // Clear all system data (director only)
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

  const handleUnlock = async () => {
    if (!lockPw.trim()) { showMsg("Vui lòng nhập mật khẩu.", "error"); return; }
    const h = await hashPassword(lockPw);
    if (h !== myAcc?.pwHash) { showMsg("Sai mật khẩu.", "error"); return; }
    setLocked(false); setLockPw(""); setMsg("");
  };

  const IS = { width:"100%", background:C.card, border:`1.5px solid ${C.border}`, borderRadius:12, padding:"12px 16px", fontSize:15, color:C.text };

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

          {/* ======== TAB CONTENT ======== */}
          {tab === "profile" && (
            <ProfileTab
              user={user} settings={settings} setSettings={setSettings} showMsg={showMsg}
              sessionData={sessionData} displayName={displayName} setDisplayName={setDisplayName}
              email={email} profilePhone={profilePhone} setProfilePhone={setProfilePhone}
              setShowIndustryModal={setShowIndustryModal}
            />
          )}

          {tab === "security" && (
            <SecurityTab
              user={user} settings={settings} setSettings={setSettings}
              myAcc={myAcc} accounts={accounts} setAcct={setAcct} showMsg={showMsg}
            />
          )}

          {tab === "workflow" && (
            <WorkflowTab settings={settings} setSettings={setSettings} showMsg={showMsg} />
          )}

          {tab === "ai" && (
            <AITab settings={settings} setSettings={setSettings} />
          )}

          {tab === "training" && (
            <TrainingTab knowledge={knowledge} setKnowledge={setKnowledge} pendingKnowledge={pendingKnowledge} showMsg={showMsg} />
          )}

          {tab === "connect" && (
            <ConnectionTab settings={settings} setSettings={setSettings} user={user} myAcc={myAcc} showMsg={showMsg} />
          )}

          {tab === "expense" && (
            <ExpenseSettingsTab settings={settings} setSettings={setSettings} />
          )}

          {tab === "staff" && (
            <StaffManagement currentUserId={user.id} />
          )}

          {tab === "orgchart" && (
            <OrgChartTab />
          )}

          {tab === "ui" && (
            <AppearanceTab settings={settings} setSettings={setSettings} />
          )}

          {tab === "data" && (
            <DataTab
              user={user} settings={settings} setSettings={setSettings}
              myAcc={myAcc} showMsg={showMsg} isDirector={isDirector}
              supabase={supabase} session={session} userId={userId}
              memory={memory} setMemory={setMemory}
              clearing={clearing} setClearing={setClearing}
              handleClearData={handleClearData} handleClearAllSystem={handleClearAllSystem}
            />
          )}

          </>)}
        </div>
      </div>
      {showIndustryModal && <IndustrySetupModal isChange onClose={() => setShowIndustryModal(false)} />}
    </div>
  );
}
