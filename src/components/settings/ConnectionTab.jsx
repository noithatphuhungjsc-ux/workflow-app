/* ConnectionTab — Kết nối */
import { useState } from "react";
import { C } from "../../constants";
import { encryptToken, saveJSON, loadJSON, sendBackupEmail } from "../../services";
import { Toggle, IS } from "./SettingsHelpers";

export default function ConnectionTab({ settings, setSettings, user, myAcc, showMsg }) {
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

              {/* ── GMAIL ── */}
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
