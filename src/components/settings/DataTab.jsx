/* DataTab — Dữ liệu */
import { useState, useRef } from "react";
import { C } from "../../constants";
import { CHANGELOG } from "../../changelog";
import { hashPassword, exportAllData, importData, saveJSON, cloudSaveAll, cloudLoadAll } from "../../services";
import { Section, SelectRow } from "./SettingsHelpers";

/* ── App Update Card ── */
function AppUpdateCard({ showMsg }) {
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [currentVer, setCurrentVer] = useState(null);
  const isNative = typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.();

  useState(() => {
    if (!isNative) return;
    (async () => {
      try {
        const { registerPlugin } = await import("@capacitor/core");
        const AppUpdater = registerPlugin("AppUpdater");
        const info = await AppUpdater.getCurrentVersion();
        setCurrentVer(info);
      } catch {}
    })();
  }, [isNative]);

  const checkUpdate = async () => {
    setChecking(true); setUpdateInfo(null);
    try {
      const res = await fetch("/app-version.json?t=" + Date.now());
      const data = await res.json();
      if (currentVer && data.versionCode > (currentVer.versionCode || 0)) setUpdateInfo(data);
      else if (!currentVer) setUpdateInfo(data);
      else showMsg("Bạn đang dùng phiên bản mới nhất!");
    } catch { showMsg("Không thể kiểm tra cập nhật.", "error"); }
    setChecking(false);
  };

  const doUpdate = async () => {
    if (!updateInfo?.apkUrl) return;
    setDownloading(true);
    try {
      if (isNative) {
        const { registerPlugin } = await import("@capacitor/core");
        const AppUpdater = registerPlugin("AppUpdater");
        await AppUpdater.downloadAndInstall({ url: updateInfo.apkUrl });
        showMsg("Đang tải bản cập nhật...");
      } else {
        window.open(updateInfo.apkUrl, "_blank");
        showMsg("Đang tải file APK...");
      }
    } catch (e) { showMsg("Lỗi tải cập nhật: " + (e.message || ""), "error"); }
    setDownloading(false);
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px", marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>&#x1F504;</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Cập nhật ứng dụng</div>
          {currentVer && <div style={{ fontSize: 11, color: C.muted }}>Phiên bản hiện tại: v{currentVer.versionName}</div>}
        </div>
      </div>
      {!updateInfo ? (
        <button className="tap" disabled={checking} onClick={checkUpdate}
          style={{ width: "100%", background: C.accent, border: "none", borderRadius: 10, padding: "10px", fontSize: 13, color: "#fff", fontWeight: 600, opacity: checking ? 0.6 : 1 }}>
          {checking ? "Đang kiểm tra..." : "Kiểm tra cập nhật"}
        </button>
      ) : (
        <div>
          <div style={{ background: C.green + "18", border: `1px solid ${C.green}44`, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>Có bản cập nhật mới! v{updateInfo.version}</div>
            {updateInfo.changelog && <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.6, whiteSpace: "pre-line" }}>{updateInfo.changelog}</div>}
          </div>
          <button className="tap" disabled={downloading} onClick={doUpdate}
            style={{ width: "100%", background: C.green, border: "none", borderRadius: 10, padding: "10px", fontSize: 13, color: "#fff", fontWeight: 600, opacity: downloading ? 0.6 : 1 }}>
            {downloading ? "Đang tải..." : "Tải và cài đặt"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function DataTab({ user, settings, setSettings, myAcc, showMsg, isDirector, supabase, session, userId, memory, setMemory, clearing, setClearing, handleClearData, handleClearAllSystem }) {
  const fileRef = useRef(null);
  const [syncing, setSyncing] = useState(false);
  const [restoring, setRestoring] = useState(false);

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

  return (
    <>
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

      {/* App Update Check */}
      <AppUpdateCard showMsg={showMsg} />

      {/* About inline — compact */}
      <div style={{ marginTop:20, textAlign:"center", fontSize:11, color:C.muted, lineHeight:1.8 }}>
        <span style={{ fontFamily:"'Fraunces',serif", fontSize:14, fontWeight:700, color:C.accent }}>WorkFlow</span> v{CHANGELOG[0]?.version || "2.2"} · 3/2026<br/>
        React 19 + Claude Sonnet 4 + PWA<br/>
        AES-256-GCM · SHA-256 · OAuth 2.0
      </div>
    </>
  );
}
