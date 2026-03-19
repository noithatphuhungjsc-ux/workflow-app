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

              {/* Mục đích */}
              <div style={{ background: "#f0f7ff", borderRadius: 14, padding: "14px 16px", border: "1px solid #d0e3f7", marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a73e8", marginBottom: 8 }}>🎯 Muc dich cham cong</div>
                <div style={{ fontSize: 13, color: "#333", lineHeight: 1.6 }}>
                  He thong cham cong giup <b>quan ly thoi gian lam viec</b> cua toan bo nhan su mot cach chinh xac, minh bach:
                </div>
                <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 13, color: "#444", lineHeight: 1.7 }}>
                  <li><b>Ghi nhan</b> gio vao — gio ra hang ngay cua tung nhan vien</li>
                  <li><b>Xac minh</b> vi tri (GPS) va danh tinh (selfie) — chong gian lan</li>
                  <li><b>Tinh toan</b> tu dong: ngay cong, gio lam, tang ca, di tre</li>
                  <li><b>Bao cao</b> tong hop theo thang de tinh luong chinh xac</li>
                </ul>
              </div>

              {/* Phương pháp chấm công */}
              <div style={{ background: "#f5f0ff", borderRadius: 14, padding: "14px 16px", border: "1px solid #ddd0f7", marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#7c3aed", marginBottom: 8 }}>📋 Phuong phap cham cong</div>
                <div style={{ fontSize: 13, color: "#333", lineHeight: 1.5, marginBottom: 10 }}>He thong ho tro <b>3 phuong phap</b>, co the ket hop:</div>

                {[
                  ["📍", "GPS + Selfie", "Cham cong bang vi tri thuc te + anh chup. He thong tu dong kiem tra ban co dung tai cong trinh/van phong hay khong (geofence). Day la phuong phap chinh."],
                  ["📱", "Quet ma QR", "Giam doc tao ma QR tai cong trinh. Nhan vien quet ma de cham cong. Ma tu dong doi moi moi 5 phut — chong chup anh gui cho nguoi khac."],
                  ["📝", "Yeu cau thu cong", "Quen cham cong? Gui yeu cau dieu chinh. Giam doc se duyet. Cung dung de xin nghi phep, dang ky tang ca."],
                ].map(([icon, title, desc]) => (
                  <div key={title} style={{ display: "flex", gap: 10, marginBottom: 10, padding: "10px 12px", background: "#fff", borderRadius: 10 }}>
                    <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed", marginBottom: 3 }}>{title}</div>
                      <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Hướng dẫn nhân viên */}
              <div style={{ background: "#f0faf0", borderRadius: 14, padding: "14px 16px", border: "1px solid #c8e6c9", marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#2e7d32", marginBottom: 10 }}>👤 Huong dan cho nhan vien</div>
                {[
                  ["1", "Den noi lam viec", "Mo app → nhan nut \"Cham cong VAO\" mau xanh"],
                  ["2", "Xac minh vi tri", "Cho phep truy cap GPS khi trinh duyet hoi. He thong tu dong ghi nhan toa do va kiem tra geofence"],
                  ["3", "Chup selfie", "Camera truoc tu dong mo. Chup 1 tam xac nhan danh tinh — anh duoc luu lai lam bang chung"],
                  ["4", "Xac nhan", "Kiem tra thong tin vi tri + anh → nhan \"Xac nhan\" de hoan tat cham cong vao"],
                  ["5", "Ket thuc ngay", "Cuoi ngay lam viec, nhan \"Cham cong RA\" mau do. Lam tuong tu buoc 2-4"],
                  ["6", "Quet QR (neu co)", "Neu giam doc dat ma QR tai cong trinh → nhan \"Quet QR\" → dua camera vao ma — tu dong cham cong"],
                  ["7", "Gui yeu cau", "Quen cham cong / xin nghi / dang ky tang ca → nhan \"Yeu cau\" → chon loai → nhap ly do → Gui"],
                ].map(([n, title, desc]) => (
                  <div key={n} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                    <span style={{ width: 22, height: 22, borderRadius: 11, background: "#2e7d32", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{n}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#2e7d32" }}>{title}</div>
                      <div style={{ fontSize: 12, color: "#555", lineHeight: 1.4, marginTop: 1 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Hướng dẫn giám đốc */}
              {isDirector && (
                <div style={{ background: "#fff8f0", borderRadius: 14, padding: "14px 16px", border: "1px solid #ffe0b2", marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#e65100", marginBottom: 10 }}>👔 Huong dan cho giam doc</div>

                  {[
                    ["🏢", "Thiet lap dia diem", "Vao tab \"Dia diem\" → nhan \"+\" → nhap ten, dia chi, toa do (hoac nhan \"Lay vi tri hien tai\" khi dung tai cong trinh). Dat ban kinh geofence (mac dinh 200m). Nhan vien cham cong ngoai pham vi se bi ghi nhan canh bao."],
                    ["📱", "Tao ma QR", "O trang chinh, chon dia diem → nhan \"Tao QR\". Ma hien thi tren man hinh — nhan vien quet de cham cong. Ma tu dong het han sau 5 phut, chong chup anh gui cho nguoi khac."],
                    ["📊", "Theo doi realtime", "Tab \"Quan ly\" hien thi: ai da cham cong / di tre / vang mat NGAY HOM NAY. Thong tin cap nhat tu dong, khong can reload."],
                    ["✅", "Duyet yeu cau", "Khi nhan vien gui yeu cau dieu chinh / nghi phep / tang ca → hien o tab \"Quan ly\". Nhan Duyet hoac Tu choi."],
                    ["📈", "Xem bao cao thang", "Tab \"Lich su\" → chon thang → xem tong hop: so ngay cong, tong gio lam, gio tang ca, so lan di tre cua tung nhan vien. Du lieu dung de tinh luong cuoi thang."],
                  ].map(([icon, title, desc]) => (
                    <div key={title} style={{ display: "flex", gap: 10, marginBottom: 10, padding: "10px 12px", background: "#fff", borderRadius: 10 }}>
                      <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#e65100", marginBottom: 3 }}>{title}</div>
                        <div style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quy định & lưu ý */}
              <div style={{ background: "#fff9e6", borderRadius: 14, padding: "14px 16px", border: "1px solid #f0e4a8" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#8a6d3b", marginBottom: 8 }}>⚙️ Quy dinh & luu y</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#6d5a2e", lineHeight: 1.8 }}>
                  <li><b>Gio lam viec:</b> 8:00 — 17:00 (co the thay doi trong Cai dat)</li>
                  <li><b>Di tre:</b> Cham cong vao sau 8:15 duoc tinh la di tre</li>
                  <li><b>Tang ca:</b> Lam tren 8 tieng/ngay — phan du duoc tinh OT</li>
                  <li><b>Offline:</b> Khong co mang van cham cong duoc. Du lieu tu dong dong bo khi co wifi/4G</li>
                  <li><b>GPS:</b> Can bat vi tri tren dien thoai. Do chinh xac phu thuoc vao thiet bi (thuong 5-20m)</li>
                  <li><b>Selfie:</b> Anh duoc luu lam bang chung — khong the su dung anh cu hoac anh nguoi khac</li>
                  <li><b>QR Code:</b> Chi co hieu luc 5 phut — dam bao nhan vien phai co mat tai cong trinh</li>
                </ul>
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
