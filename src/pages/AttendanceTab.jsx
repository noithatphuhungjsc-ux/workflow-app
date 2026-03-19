/* ================================================================
   ATTENDANCE TAB — Level 3 Commercial
   Employee: Check-in/out flow (GPS + Selfie + QR) + History
   Director: Dashboard + Site manager + Request review + Reports
   ================================================================ */
import { useState, useCallback, Suspense, lazy } from "react";
import { C, TEAM_ACCOUNTS } from "../constants";
import useAttendance from "../hooks/useAttendance";
import { supabase } from "../lib/supabase";

// Lazy load heavy components
const CheckInFlow = lazy(() => import("../components/attendance/CheckInFlow"));
const AttendanceHistory = lazy(() => import("../components/attendance/AttendanceHistory"));
const DirectorDashboard = lazy(() => import("../components/attendance/DirectorDashboard"));
const SiteManager = lazy(() => import("../components/attendance/SiteManager"));
const QRScanner = lazy(() => import("../components/attendance/QRScanner"));
const AttendanceRequests = lazy(() => import("../components/attendance/AttendanceRequests"));

function fmtTime(ts) {
  if (!ts) return "--:--";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function AttendanceTab({ userId, settings }) {
  const userAccount = TEAM_ACCOUNTS.find(a => a.id === userId);
  const role = userAccount?.role || "staff";

  const {
    todayCheckIn, todayCheckOut, hasCheckedIn, hasCheckedOut,
    sites, monthlySummary, requests,
    loading, error, checkingIn,
    doCheckIn, doCheckOut,
    loadMonthlySummary, loadRequests,
    addSite, editSite, removeSite,
    submitRequest, handleReview,
    isDirector,
  } = useAttendance(userId, role);

  const [showCheckInFlow, setShowCheckInFlow] = useState(null); // "check_in" | "check_out" | null
  const [showQR, setShowQR] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [view, setView] = useState("main"); // main | history | sites | dashboard

  // Handle check-in/out flow completion
  const handleFlowSubmit = useCallback(async (data) => {
    const fn = showCheckInFlow === "check_in" ? doCheckIn : doCheckOut;

    // Upload selfie if captured
    let selfieUrl = null;
    if (data.selfieBlob && supabase) {
      try {
        const path = `${userId}/${Date.now()}.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from("attendance-selfies")
          .upload(path, data.selfieBlob, { contentType: "image/jpeg" });
        if (!uploadErr) selfieUrl = path;
      } catch (e) {
        console.warn("[ATT] Selfie upload error:", e.message);
      }
    }

    await fn({
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy,
      siteId: data.siteId,
      selfieUrl,
      verificationMethod: data.verificationMethod || "gps",
    });
    setShowCheckInFlow(null);
  }, [showCheckInFlow, doCheckIn, doCheckOut, userId]);

  // Handle QR scan
  const handleQRScan = useCallback(async (token) => {
    setShowQR(false);
    try {
      const { validateQR } = await import("../services/attendanceService");
      const result = await validateQR(token);
      if (result.valid) {
        const fn = hasCheckedIn ? doCheckOut : doCheckIn;
        await fn({ qrToken: token, siteId: result.siteId, verificationMethod: "qr" });
      }
    } catch (e) {
      alert("QR: " + e.message);
    }
  }, [hasCheckedIn, doCheckIn, doCheckOut]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>
        Dang tai du lieu cham cong...
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 0", paddingBottom: 80 }}>
      <Suspense fallback={<div style={{ textAlign: "center", padding: 20, color: C.muted, fontSize: 13 }}>Dang tai...</div>}>

        {/* Navigation tabs */}
        <div style={{ display: "flex", gap: 0, padding: "0 16px", marginBottom: 16 }}>
          {[
            ["main", "Cham cong"],
            ["history", "Lich su"],
            ...(isDirector ? [["dashboard", "Quan ly"], ["sites", "Dia diem"]] : []),
          ].map(([key, label]) => (
            <button key={key} onClick={() => setView(key)}
              className="tap"
              style={{
                flex: 1, padding: "10px 0", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: view === key ? 700 : 500,
                color: view === key ? C.accent : C.muted,
                background: "none",
                borderBottom: `2px solid ${view === key ? C.accent : "transparent"}`,
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Main: Check-in/out ── */}
        {view === "main" && (
          <div>
            {/* Today status */}
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 4 }}>Cham cong</div>
              <div style={{ fontSize: 13, color: C.muted }}>
                {hasCheckedIn
                  ? `Da cham cong vao luc ${fmtTime(todayCheckIn?.timestamp)}`
                  : "Chua cham cong hom nay"}
                {hasCheckedOut && ` — Ra: ${fmtTime(todayCheckOut?.timestamp)}`}
              </div>
              {error && <div style={{ fontSize: 12, color: "#e74c3c", marginTop: 4 }}>{error}</div>}
            </div>

            {/* Check-in / Check-out buttons */}
            <div style={{ display: "flex", gap: 12, padding: "0 16px", marginBottom: 16 }}>
              <button className="tap" onClick={() => !hasCheckedIn && setShowCheckInFlow("check_in")}
                disabled={hasCheckedIn || checkingIn}
                style={{
                  flex: 1, padding: "20px 0", borderRadius: 16, border: "none", fontSize: 16, fontWeight: 700,
                  background: hasCheckedIn ? C.border : C.green, color: hasCheckedIn ? C.muted : "#fff",
                  cursor: hasCheckedIn ? "default" : "pointer",
                }}>
                {hasCheckedIn ? `Vao: ${fmtTime(todayCheckIn?.timestamp)}` : "Cham cong VAO"}
              </button>
              <button className="tap" onClick={() => hasCheckedIn && !hasCheckedOut && setShowCheckInFlow("check_out")}
                disabled={!hasCheckedIn || hasCheckedOut || checkingIn}
                style={{
                  flex: 1, padding: "20px 0", borderRadius: 16, border: "none", fontSize: 16, fontWeight: 700,
                  background: hasCheckedOut ? C.border : !hasCheckedIn ? C.border : "#e74c3c",
                  color: hasCheckedOut || !hasCheckedIn ? C.muted : "#fff",
                  cursor: !hasCheckedIn || hasCheckedOut ? "default" : "pointer",
                }}>
                {hasCheckedOut ? `Ra: ${fmtTime(todayCheckOut?.timestamp)}` : "Cham cong RA"}
              </button>
            </div>

            {/* Quick actions */}
            <div style={{ display: "flex", gap: 8, padding: "0 16px", marginBottom: 20 }}>
              <button className="tap" onClick={() => setShowQR(true)}
                style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                📱 Quet QR
              </button>
              <button className="tap" onClick={() => setShowRequest(true)}
                style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                📝 Yeu cau
              </button>
            </div>

            {/* Geofence info */}
            {todayCheckIn && (
              <div style={{ padding: "0 16px", marginBottom: 12 }}>
                <div className="card" style={{ padding: "10px 14px" }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Chi tiet hom nay</div>
                  <div style={{ fontSize: 13, color: C.text }}>
                    {todayCheckIn.is_within_geofence
                      ? "✅ Trong pham vi dia diem"
                      : todayCheckIn.distance_to_site
                        ? `⚠️ Ngoai pham vi (${todayCheckIn.distance_to_site}m)`
                        : "📍 Khong co thong tin vi tri"}
                  </div>
                  {todayCheckIn.verification_method && (
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      Phuong thuc: {todayCheckIn.verification_method === "gps" ? "GPS" :
                        todayCheckIn.verification_method === "qr" ? "QR Code" :
                        todayCheckIn.verification_method === "offline" ? "Offline" : todayCheckIn.verification_method}
                      {todayCheckIn.offline_queued && " (da dong bo)"}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Offline queue indicator */}
            {!navigator.onLine && (
              <div style={{ padding: "0 16px" }}>
                <div style={{ background: "#fff3e0", borderRadius: 10, padding: 10, fontSize: 12, color: "#e65100" }}>
                  ⚠️ Ban dang offline. Du lieu cham cong se duoc dong bo khi co mang.
                </div>
              </div>
            )}

            {/* Director QR generator */}
            {isDirector && sites?.length > 0 && (
              <div style={{ padding: "0 16px", marginTop: 12 }}>
                <QRGenerator sites={sites} />
              </div>
            )}

            {/* ── Hướng dẫn sử dụng ── */}
            <div style={{ padding: "0 16px", marginTop: 20 }}>
              <div style={{ background: "#f8f7f5", borderRadius: 14, padding: "14px 16px", border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>Huong dan cham cong</div>

                {/* Nhân viên */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Nhan vien</div>
                  {[
                    ["1", "Nhan \"Cham cong VAO\" khi den noi lam viec"],
                    ["2", "Cho phep truy cap vi tri (GPS) va chup anh selfie xac nhan"],
                    ["3", "Cuoi ngay, nhan \"Cham cong RA\" de ket thuc"],
                    ["4", "Dung \"Quet QR\" neu giam doc tao ma QR tai cong trinh"],
                    ["5", "Gui \"Yeu cau\" neu can dieu chinh, xin nghi phep hoac tang ca"],
                  ].map(([n, text]) => (
                    <div key={n} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
                      <span style={{ width: 20, height: 20, borderRadius: 10, background: C.accent, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{n}</span>
                      <span style={{ fontSize: 13, color: C.text, lineHeight: 1.4 }}>{text}</span>
                    </div>
                  ))}
                </div>

                {/* Giám đốc */}
                {isDirector && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#e67e22", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Giam doc</div>
                    {[
                      ["Dia diem", "Them dia diem lam viec (tab \"Dia diem\") — he thong tu dong kiem tra nhan vien co dung vi tri khong"],
                      ["QR Code", "Tao ma QR cho cong trinh — nhan vien quet de cham cong nhanh, ma tu dong het han sau 5 phut"],
                      ["Quan ly", "Xem ai da cham cong / di tre / vang mat (tab \"Quan ly\") — duyet yeu cau dieu chinh, nghi phep"],
                      ["Lich su", "Xem bao cao thang — tong ngay cong, gio tang ca, so lan di tre cua tung nhan vien"],
                    ].map(([title, text]) => (
                      <div key={title} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#e67e22", flexShrink: 0, minWidth: 52 }}>{title}</span>
                        <span style={{ fontSize: 12, color: C.sub, lineHeight: 1.4 }}>{text}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Lưu ý */}
                <div style={{ marginTop: 10, padding: "8px 10px", background: "#fff9e6", borderRadius: 8, fontSize: 12, color: "#8a6d3b", lineHeight: 1.5 }}>
                  💡 <b>Luu y:</b> Cham cong offline van hoat dong — du lieu se tu dong dong bo khi co mang. GPS can chinh xac trong pham vi cho phep cua dia diem.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── History ── */}
        {view === "history" && (
          <AttendanceHistory
            monthlySummary={monthlySummary}
            onMonthChange={(y, m) => loadMonthlySummary(y, m)}
          />
        )}

        {/* ── Director Dashboard ── */}
        {view === "dashboard" && isDirector && (
          <DirectorDashboard
            userId={userId}
            requests={requests}
            onReview={handleReview}
            onRefreshRequests={() => loadRequests("pending")}
          />
        )}

        {/* ── Site Manager ── */}
        {view === "sites" && isDirector && (
          <SiteManager
            sites={sites}
            onAdd={addSite}
            onEdit={editSite}
            onDelete={removeSite}
          />
        )}

        {/* ── Modals ── */}
        {showCheckInFlow && (
          <CheckInFlow
            type={showCheckInFlow}
            sites={sites}
            onSubmit={handleFlowSubmit}
            onCancel={() => setShowCheckInFlow(null)}
            settings={settings}
          />
        )}

        {showQR && (
          <QRScanner
            onScan={handleQRScan}
            onClose={() => setShowQR(false)}
          />
        )}

        {showRequest && (
          <AttendanceRequests
            userId={userId}
            onSubmit={submitRequest}
            onClose={() => setShowRequest(false)}
          />
        )}

      </Suspense>
    </div>
  );
}

/* ── QR Generator (Director inline widget) ── */
function QRGenerator({ sites }) {
  const [qrData, setQrData] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [selectedSite, setSelectedSite] = useState(sites?.[0]?.id || "");

  const handleGenerate = async () => {
    if (!selectedSite) return;
    setGenerating(true);
    try {
      const { generateQR } = await import("../services/attendanceService");
      const result = await generateQR(selectedSite);
      setQrData(result);
      // Generate QR image using qrcode library
      try {
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(result.token, { width: 200, margin: 2 });
        setQrData(prev => ({ ...prev, imageUrl: url }));
      } catch (e) {
        console.warn("[ATT] QR image generation failed:", e.message);
      }
    } catch (e) {
      alert("Loi: " + e.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Tao ma QR cham cong</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <select value={selectedSite} onChange={e => setSelectedSite(e.target.value)}
          style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={handleGenerate} disabled={generating}
          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          {generating ? "..." : "Tao QR"}
        </button>
      </div>
      {qrData && (
        <div style={{ textAlign: "center" }}>
          {qrData.imageUrl && <img src={qrData.imageUrl} alt="QR" style={{ width: 180, height: 180, borderRadius: 8 }} />}
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
            Het han: {new Date(qrData.expiresAt).toLocaleTimeString("vi-VN")}
          </div>
        </div>
      )}
    </div>
  );
}
