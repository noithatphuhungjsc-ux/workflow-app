/* ================================================================
   LOGIN SCREEN — Authentication (simplified, honest about limits)
   ================================================================ */
import { useState, useEffect } from "react";
import { C } from "../constants";
import { hashPassword, loadAccounts, saveAccounts, generateOTP, maskPhone } from "../services";

const ACCOUNTS_VERSION = 5; // bump to force re-init passwords
const DEFAULT_ACCOUNTS = [
  { id: "trinh", name: "Nguyen Duy Trinh", phone: "+84983523868", pw: "111111", role: "dev",     title: "Developer" },
  { id: "lien",  name: "Lientran",         phone: "+84931512984", pw: "111111", role: "admin",   title: "Giám đốc" },
  { id: "hung",  name: "Pham Van Hung",    phone: "+84901234567", pw: "111111", role: "manager", title: "Quản lý dự án" },
  { id: "mai",   name: "Tran Thi Mai",     phone: "+84912345678", pw: "111111", role: "staff",   title: "Nhân viên" },
  { id: "duc",   name: "Le Minh Duc",      phone: "+84923456789", pw: "111111", role: "staff",   title: "Nhân viên" },
];

// Init default accounts with hashed passwords
async function initAccounts() {
  const savedVer = parseInt(localStorage.getItem("wf_accounts_ver") || "0", 10);
  const existing = loadAccounts();
  if (existing && savedVer >= ACCOUNTS_VERSION) return existing;
  const accounts = existing || {};
  for (const a of DEFAULT_ACCOUNTS) {
    accounts[a.id] = {
      id: a.id,
      name: a.name,
      pwHash: await hashPassword(a.pw),
      twoFA: accounts[a.id]?.twoFA || false,
      phone: a.phone,
      role: a.role || "staff",
      title: a.title || "",
    };
  }
  saveAccounts(accounts);
  localStorage.setItem("wf_accounts_ver", String(ACCOUNTS_VERSION));
  return accounts;
}

export default function LoginScreen({ onLogin }) {
  const [accounts, setAccounts] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [otpSent, setOtpSent]        = useState("");
  const [otpInput, setOtpInput]      = useState("");
  const [otpCountdown, setOtpCountdown] = useState(0);

  useEffect(() => { initAccounts().then(setAccounts); }, []);

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const t = setTimeout(() => setOtpCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCountdown]);

  const handleLogin = async () => {
    if (!accounts) return;
    if (!username.trim() || !password.trim()) { setError("Vui lòng nhập đầy đủ."); return; }
    setLoading(true);
    setError("");
    const pwHash = await hashPassword(password);
    const account = Object.values(accounts).find(a => {
      const nameMatch = a.name.toLowerCase() === username.trim().toLowerCase() || a.id === username.trim().toLowerCase();
      return nameMatch && a.pwHash === pwHash;
    });
    setLoading(false);
    if (!account) { setError("Sai tên đăng nhập hoặc mật khẩu."); return; }

    if (account.twoFA && account.phone) {
      const otp = generateOTP();
      setOtpSent(otp);
      setPendingUser(account);
      setOtpCountdown(120);
      setError("");
      alert(`Mã xác nhận: ${otp}\n\n(Trong thực tế sẽ gửi qua SMS đến ${maskPhone(account.phone)})`);
    } else {
      completeLogin(account);
    }
  };

  const verifyOTP = () => {
    if (otpInput.trim() === otpSent) {
      completeLogin(pendingUser);
    } else {
      setError("Mã xác nhận không đúng.");
    }
  };

  const completeLogin = (account) => {
    localStorage.setItem("wf_session", JSON.stringify({ id: account.id, name: account.name, role: account.role || "staff", title: account.title || "", loginAt: Date.now() }));
    // Auto-set userRole in settings for this account (admin uses manager UI)
    const settingsKey = `wf_${account.id}_settings`;
    try {
      const s = JSON.parse(localStorage.getItem(settingsKey) || "{}");
      s.userRole = account.role === "staff" ? "staff" : "manager";
      s.displayName = s.displayName || account.name;
      localStorage.setItem(settingsKey, JSON.stringify(s));
    } catch {}
    onLogin(account);
  };

  const cancelOTP = () => {
    setPendingUser(null);
    setOtpSent("");
    setOtpInput("");
    setError("");
  };

  if (!accounts) return null;

  const IS = { width:"100%", background:C.card, border:`1.5px solid ${C.border}`, borderRadius:12, padding:"12px 16px", fontSize:15, color:C.text };

  // 2FA verify screen
  if (pendingUser) return (
    <div style={{ fontFamily:"'Nunito','Segoe UI',sans-serif", background:C.bg, minHeight:"100dvh", maxWidth:480, margin:"0 auto", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"0 24px" }}>
      <div style={{ animation:"fadeIn .4s ease", width:"100%", maxWidth:340 }}>
        <div style={{ textAlign:"center", marginBottom:30 }}>
          <div style={{ width:60, height:60, borderRadius:16, background:C.greenD, border:`2px solid ${C.green}`, display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:28, marginBottom:12 }}>
            <span role="img" aria-label="Lock">&#x1F510;</span>
          </div>
          <div style={{ fontSize:18, fontWeight:700, color:C.text }}>Xác nhận 2 bước</div>
          <div style={{ fontSize:13, color:C.muted, marginTop:6 }}>Mã đã gửi đến {maskPhone(pendingUser.phone)}</div>
        </div>

        <div style={{ background:C.surface, borderRadius:20, border:`1px solid ${C.border}`, padding:"28px 24px", boxShadow:"0 4px 24px rgba(0,0,0,0.06)" }}>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, color:C.muted, fontWeight:600, marginBottom:6, letterSpacing:.5 }}>NHẬP MÃ XÁC NHẬN (6 SỐ)</div>
            <input value={otpInput} onChange={e => setOtpInput(e.target.value.replace(/\D/g,"").slice(0,6))} onKeyDown={e => e.key==="Enter" && verifyOTP()}
              placeholder="000000" maxLength={6} aria-label="Mã xác nhận"
              style={{ ...IS, fontSize:24, textAlign:"center", letterSpacing:8, fontWeight:700, border:`1.5px solid ${C.accent}` }} />
          </div>

          <div style={{ textAlign:"center", marginBottom:14, fontSize:12, color: otpCountdown > 0 ? C.muted : C.red }}>
            {otpCountdown > 0 ? `Mã hết hạn sau ${otpCountdown}s` : "Mã đã hết hạn"}
          </div>

          {error && <div style={{ background:C.redD, border:`1px solid ${C.red}55`, borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:13, color:C.red, textAlign:"center" }}>{error}</div>}

          <button className="tap" onClick={verifyOTP} disabled={otpInput.length !== 6 || otpCountdown <= 0}
            style={{ width:"100%", background:`linear-gradient(135deg,${C.green},${C.accent})`, color:"#fff", border:"none", borderRadius:14, padding:"14px", fontSize:16, fontWeight:700, marginBottom:10, opacity: (otpInput.length === 6 && otpCountdown > 0) ? 1 : .5 }}>
            Xác nhận
          </button>
          <button className="tap" onClick={cancelOTP}
            style={{ width:"100%", background:"none", border:`1px solid ${C.border}`, borderRadius:12, padding:"12px", fontSize:13, color:C.sub }}>
            Quay lại đăng nhập
          </button>
        </div>
      </div>
    </div>
  );

  const warmGrad = "linear-gradient(135deg, #c8956c, #d4a574)";
  const inputStyle = {
    width:"100%", background:"#fff", border:`1.5px solid ${C.border}`,
    borderRadius:28, padding:"14px 20px", fontSize:15, color:C.text,
    transition:"border-color .2s",
  };

  // Login screen
  return (
    <div style={{ fontFamily:"'Nunito','Segoe UI',sans-serif", background:C.bg, minHeight:"100dvh", maxWidth:480, margin:"0 auto", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"0 24px" }}>
      <div style={{ animation:"fadeIn .4s ease", width:"100%", maxWidth:380 }}>

        {/* Card */}
        <div style={{ background:"#fff", borderRadius:24, padding:"36px 28px 28px", boxShadow:"0 8px 40px rgba(0,0,0,0.08)", border:`1px solid ${C.border}44` }}>

          {/* Logo + Title */}
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:32 }}>
            <div style={{ width:48, height:48, borderRadius:14, background:"linear-gradient(135deg, #f0e6d6, #e8d5c0)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0, border:"1.5px solid #d4c4a8" }}>
              &#x25C8;
            </div>
            <div style={{ fontFamily:"'Fraunces',serif", fontSize:22, fontWeight:700, color:C.text, letterSpacing:-.5 }}>WorkFlow</div>
          </div>

          {/* Inputs */}
          <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:20 }}>
            <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key==="Enter" && handleLogin()}
              placeholder="Tên đăng nhập" aria-label="Tên đăng nhập"
              onFocus={e => e.target.style.borderColor = "#c8956c"}
              onBlur={e => e.target.style.borderColor = C.border}
              style={inputStyle} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key==="Enter" && handleLogin()}
              placeholder="Mật khẩu" aria-label="Mật khẩu"
              onFocus={e => e.target.style.borderColor = "#c8956c"}
              onBlur={e => e.target.style.borderColor = C.border}
              style={inputStyle} />
          </div>

          {error && (
            <div style={{ background:"#fff0f0", border:`1px solid ${C.red}33`, borderRadius:12, padding:"10px 16px", marginBottom:14, fontSize:13, color:C.red, textAlign:"center" }}>
              {error}
            </div>
          )}

          {/* Login button */}
          <button className="tap" onClick={handleLogin} disabled={loading}
            style={{ width:"100%", background:warmGrad, color:"#fff", border:"none", borderRadius:28, padding:"15px", fontSize:16, fontWeight:700, boxShadow:"0 4px 16px rgba(200,149,108,.3)", opacity: loading ? .7 : 1, marginBottom:4 }}>
            {loading ? "Đang xác thực..." : "Đăng Nhập →"}
          </button>

          {/* Divider */}
          <div style={{ display:"flex", alignItems:"center", gap:12, margin:"18px 0" }}>
            <div style={{ flex:1, height:1, background:C.border }} />
            <span style={{ fontSize:12, color:C.muted }}>hoặc</span>
            <div style={{ flex:1, height:1, background:C.border }} />
          </div>

          {/* Quick dev login — all test accounts */}
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            <div style={{ fontSize:10, color:C.muted, fontWeight:600, textAlign:"center", letterSpacing:.5 }}>CHỌN NHANH (DEV)</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {Object.values(accounts).map(a => {
                const roleColors = { dev: "#9b59b6", admin: "#e74c3c", manager: C.accent, staff: C.green };
                const roleLabels = { dev: "Dev", admin: "Admin", manager: "QL", staff: "NV" };
                const role = a.role || "staff";
                return (
                  <button key={a.id} className="tap" onClick={() => completeLogin(a)}
                    style={{ flex:"1 1 45%", background:C.card, border:`1.5px solid ${C.border}`, borderRadius:14, padding:"8px 10px", fontSize:12, fontWeight:600, color:C.sub, display:"flex", alignItems:"center", gap:8, minWidth:0 }}>
                    <div style={{ width:28, height:28, borderRadius:"50%", background:roleColors[role], color:"#fff", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {a.name.charAt(0)}
                    </div>
                    <div style={{ flex:1, minWidth:0, textAlign:"left" }}>
                      <div style={{ fontSize:12, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.name.split(" ").pop()}</div>
                      <div style={{ fontSize:9, color:roleColors[role], fontWeight:700 }}>{roleLabels[role]} · {a.title || role}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{ textAlign:"center", marginTop:20, fontSize:11, color:C.muted, lineHeight:1.6 }}>
          Dữ liệu được mã hóa và lưu riêng cho từng tài khoản.
        </div>
      </div>
    </div>
  );
}
