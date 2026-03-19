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
            <AttendanceGuide isDirector={isDirector} />
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

/* ── Attendance Guide ── */
function AttendanceGuide({ isDirector }) {
  const [reading, setReading] = useState(false);

  const handleWoryRead = (text) => {
    if (reading) { window.speechSynthesis?.cancel(); setReading(false); return; }
    setReading(true);
    import("../services").then(({ tts }) => {
      tts(text, 1.05, () => setReading(false));
    });
  };

  const ReadBtn = ({ text }) => (
    <button className="tap" onClick={() => handleWoryRead(text)}
      style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}
      title={reading ? "Dừng đọc" : "Wory đọc giúp"}>
      {reading ? "⏹" : "🔊"}
    </button>
  );

  return (
    <div style={{ padding: "0 16px", marginTop: 20 }}>

      {/* Mục đích */}
      <div style={{ background: "#f0f7ff", borderRadius: 14, padding: "14px 16px", border: "1px solid #d0e3f7", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1a73e8" }}>🎯 Mục đích chấm công</div>
          <ReadBtn text="Mục đích chấm công. Hệ thống chấm công giúp quản lý thời gian làm việc của toàn bộ nhân sự một cách chính xác và minh bạch. Gồm có: Ghi nhận giờ vào, giờ ra hàng ngày. Xác minh vị trí bằng GPS và danh tính bằng ảnh selfie để chống gian lận. Tự động tính toán ngày công, giờ làm, tăng ca, đi trễ. Báo cáo tổng hợp theo tháng để tính lương chính xác." />
        </div>
        <div style={{ fontSize: 13, color: "#333", lineHeight: 1.6 }}>
          Hệ thống chấm công giúp <b>quản lý thời gian làm việc</b> của toàn bộ nhân sự một cách chính xác, minh bạch:
        </div>
        <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 13, color: "#444", lineHeight: 1.7 }}>
          <li><b>Ghi nhận</b> giờ vào — giờ ra hàng ngày của từng nhân viên</li>
          <li><b>Xác minh</b> vị trí (GPS) và danh tính (selfie) — chống gian lận</li>
          <li><b>Tính toán</b> tự động: ngày công, giờ làm, tăng ca, đi trễ</li>
          <li><b>Báo cáo</b> tổng hợp theo tháng để tính lương chính xác</li>
        </ul>
      </div>

      {/* Phương pháp chấm công */}
      <div style={{ background: "#f5f0ff", borderRadius: 14, padding: "14px 16px", border: "1px solid #ddd0f7", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#7c3aed" }}>📋 Phương pháp chấm công</div>
          <ReadBtn text="Phương pháp chấm công. Hệ thống hỗ trợ 3 phương pháp. Thứ nhất: GPS và Selfie. Chấm công bằng vị trí thực tế kết hợp ảnh chụp. Hệ thống tự động kiểm tra bạn có đúng tại công trình hay văn phòng hay không. Đây là phương pháp chính. Thứ hai: Quét mã QR. Giám đốc tạo mã QR tại công trình. Nhân viên quét mã để chấm công. Mã tự động đổi mới mỗi 5 phút, chống chụp ảnh gửi cho người khác. Thứ ba: Yêu cầu thủ công. Quên chấm công thì gửi yêu cầu điều chỉnh. Giám đốc sẽ duyệt. Cũng dùng để xin nghỉ phép hoặc đăng ký tăng ca." />
        </div>
        <div style={{ fontSize: 13, color: "#333", lineHeight: 1.5, marginBottom: 10 }}>Hệ thống hỗ trợ <b>3 phương pháp</b>, có thể kết hợp:</div>
        {[
          ["📍", "GPS + Selfie", "Chấm công bằng vị trí thực tế + ảnh chụp. Hệ thống tự động kiểm tra bạn có đúng tại công trình/văn phòng hay không. Đây là phương pháp chính."],
          ["📱", "Quét mã QR", "Giám đốc tạo mã QR tại công trình. Nhân viên quét mã để chấm công. Mã tự động đổi mới mỗi 5 phút — chống chụp ảnh gửi cho người khác."],
          ["📝", "Yêu cầu thủ công", "Quên chấm công? Gửi yêu cầu điều chỉnh. Giám đốc sẽ duyệt. Cũng dùng để xin nghỉ phép, đăng ký tăng ca."],
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2e7d32" }}>👤 Hướng dẫn cho nhân viên</div>
          <ReadBtn text="Hướng dẫn cho nhân viên. Bước 1: Đến nơi làm việc. Mở ứng dụng rồi nhấn nút Chấm công VÀO màu xanh. Bước 2: Xác minh vị trí. Cho phép truy cập GPS khi trình duyệt hỏi. Hệ thống tự động ghi nhận tọa độ và kiểm tra phạm vi địa điểm. Bước 3: Chụp selfie. Camera trước tự động mở. Chụp một tấm xác nhận danh tính. Ảnh được lưu lại làm bằng chứng. Bước 4: Xác nhận. Kiểm tra thông tin vị trí và ảnh rồi nhấn Xác nhận để hoàn tất chấm công vào. Bước 5: Kết thúc ngày. Cuối ngày làm việc, nhấn Chấm công RA màu đỏ. Làm tương tự các bước trên. Bước 6: Quét QR nếu có. Nếu giám đốc đặt mã QR tại công trình, nhấn Quét QR rồi đưa camera vào mã, hệ thống tự động chấm công. Bước 7: Gửi yêu cầu. Quên chấm công hoặc xin nghỉ hoặc đăng ký tăng ca, nhấn Yêu cầu, chọn loại, nhập lý do rồi gửi." />
        </div>
        {[
          ["1", "Đến nơi làm việc", "Mở ứng dụng → nhấn nút \"Chấm công VÀO\" màu xanh"],
          ["2", "Xác minh vị trí", "Cho phép truy cập GPS khi trình duyệt hỏi. Hệ thống tự động ghi nhận tọa độ và kiểm tra phạm vi địa điểm"],
          ["3", "Chụp selfie", "Camera trước tự động mở. Chụp 1 tấm xác nhận danh tính — ảnh được lưu lại làm bằng chứng"],
          ["4", "Xác nhận", "Kiểm tra thông tin vị trí + ảnh → nhấn \"Xác nhận\" để hoàn tất chấm công vào"],
          ["5", "Kết thúc ngày", "Cuối ngày làm việc, nhấn \"Chấm công RA\" màu đỏ. Làm tương tự bước 2-4"],
          ["6", "Quét QR (nếu có)", "Nếu giám đốc đặt mã QR tại công trình → nhấn \"Quét QR\" → đưa camera vào mã — tự động chấm công"],
          ["7", "Gửi yêu cầu", "Quên chấm công / xin nghỉ / đăng ký tăng ca → nhấn \"Yêu cầu\" → chọn loại → nhập lý do → Gửi"],
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e65100" }}>👔 Hướng dẫn cho giám đốc</div>
            <ReadBtn text="Hướng dẫn cho giám đốc. Thiết lập địa điểm: Vào tab Địa điểm, nhấn dấu cộng, nhập tên, địa chỉ, tọa độ hoặc nhấn Lấy vị trí hiện tại khi đứng tại công trình. Đặt bán kính phạm vi, mặc định 200 mét. Nhân viên chấm công ngoài phạm vi sẽ bị ghi nhận cảnh báo. Tạo mã QR: Ở trang chính, chọn địa điểm rồi nhấn Tạo QR. Mã hiển thị trên màn hình, nhân viên quét để chấm công. Mã tự động hết hạn sau 5 phút. Theo dõi trực tiếp: Tab Quản lý hiển thị ai đã chấm công, ai đi trễ, ai vắng mặt ngay hôm nay. Thông tin cập nhật tự động. Duyệt yêu cầu: Khi nhân viên gửi yêu cầu điều chỉnh, nghỉ phép, tăng ca sẽ hiện ở tab Quản lý. Nhấn Duyệt hoặc Từ chối. Xem báo cáo tháng: Tab Lịch sử, chọn tháng, xem tổng hợp số ngày công, tổng giờ làm, giờ tăng ca, số lần đi trễ của từng nhân viên. Dữ liệu dùng để tính lương cuối tháng." />
          </div>
          {[
            ["🏢", "Thiết lập địa điểm", "Vào tab \"Địa điểm\" → nhấn \"+\" → nhập tên, địa chỉ, tọa độ (hoặc nhấn \"Lấy vị trí hiện tại\" khi đứng tại công trình). Đặt bán kính phạm vi (mặc định 200m). Nhân viên chấm công ngoài phạm vi sẽ bị ghi nhận cảnh báo."],
            ["📱", "Tạo mã QR", "Ở trang chính, chọn địa điểm → nhấn \"Tạo QR\". Mã hiển thị trên màn hình — nhân viên quét để chấm công. Mã tự động hết hạn sau 5 phút, chống chụp ảnh gửi cho người khác."],
            ["📊", "Theo dõi trực tiếp", "Tab \"Quản lý\" hiển thị: ai đã chấm công / đi trễ / vắng mặt NGAY HÔM NAY. Thông tin cập nhật tự động, không cần tải lại."],
            ["✅", "Duyệt yêu cầu", "Khi nhân viên gửi yêu cầu điều chỉnh / nghỉ phép / tăng ca → hiện ở tab \"Quản lý\". Nhấn Duyệt hoặc Từ chối."],
            ["📈", "Xem báo cáo tháng", "Tab \"Lịch sử\" → chọn tháng → xem tổng hợp: số ngày công, tổng giờ làm, giờ tăng ca, số lần đi trễ của từng nhân viên. Dữ liệu dùng để tính lương cuối tháng."],
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#8a6d3b" }}>⚙️ Quy định & lưu ý</div>
          <ReadBtn text="Quy định và lưu ý. Giờ làm việc: 8 giờ sáng đến 5 giờ chiều, có thể thay đổi trong Cài đặt. Đi trễ: Chấm công vào sau 8 giờ 15 phút được tính là đi trễ. Tăng ca: Làm trên 8 tiếng một ngày, phần dư được tính tăng ca. Offline: Không có mạng vẫn chấm công được. Dữ liệu tự động đồng bộ khi có wifi hoặc 4G. GPS: Cần bật vị trí trên điện thoại. Độ chính xác phụ thuộc vào thiết bị, thường từ 5 đến 20 mét. Selfie: Ảnh được lưu làm bằng chứng, không thể sử dụng ảnh cũ hoặc ảnh người khác. Mã QR: Chỉ có hiệu lực 5 phút, đảm bảo nhân viên phải có mặt tại công trình." />
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#6d5a2e", lineHeight: 1.8 }}>
          <li><b>Giờ làm việc:</b> 8:00 — 17:00 (có thể thay đổi trong Cài đặt)</li>
          <li><b>Đi trễ:</b> Chấm công vào sau 8:15 được tính là đi trễ</li>
          <li><b>Tăng ca:</b> Làm trên 8 tiếng/ngày — phần dư được tính tăng ca</li>
          <li><b>Offline:</b> Không có mạng vẫn chấm công được. Dữ liệu tự động đồng bộ khi có wifi/4G</li>
          <li><b>GPS:</b> Cần bật vị trí trên điện thoại. Độ chính xác phụ thuộc vào thiết bị (thường 5-20m)</li>
          <li><b>Selfie:</b> Ảnh được lưu làm bằng chứng — không thể sử dụng ảnh cũ hoặc ảnh người khác</li>
          <li><b>Mã QR:</b> Chỉ có hiệu lực 5 phút — đảm bảo nhân viên phải có mặt tại công trình</li>
        </ul>
      </div>

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
