/* ================================================================
   CHANGELOG — Lịch sử cập nhật ứng dụng
   Thêm mục mới lên ĐẦU mảng
   ================================================================ */
export const CHANGELOG = [
  {
    version: "2.2",
    date: "2026-03-15",
    title: "Industry Preset & 12 cải tiến",
    type: "major", // major | minor | fix
    changes: [
      { icon: "🏢", text: "Hệ thống chọn ngành nghề — 10 ngành, tự động cấu hình app" },
      { icon: "🎯", text: "Onboarding wizard 3 bước sau khi chọn ngành" },
      { icon: "🔤", text: "Terminology — thuật ngữ thay đổi theo ngành (VD: Công việc → Đơn hàng)" },
      { icon: "👁️", text: "Tab ẩn/hiện — bật tắt từng tab trong Cài đặt > Giao diện" },
      { icon: "🔐", text: "RBAC — phân quyền vai trò theo ngành (Chủ/QL/NV...)" },
      { icon: "✅", text: "Duyệt chi tiêu — NV tạo chi tiêu → QL duyệt/từ chối" },
      { icon: "📅", text: "Calendar drag-drop — nhấn giữ task, kéo sang ngày khác" },
      { icon: "🔍", text: "OCR hóa đơn — AI quét ảnh bill, tự điền số tiền & mô tả" },
      { icon: "👥", text: "Quản lý nhân sự động — thêm/sửa/xóa tài khoản trong Cài đặt" },
      { icon: "⚠️", text: "Error boundary — bắt lỗi app, hiện màn hình tải lại" },
      { icon: "🔒", text: "CORS security — siết origin cho toàn bộ 9 API endpoints" },
      { icon: "📋", text: "Tab Changelog — xem lịch sử thay đổi (tab này)" },
    ],
  },
  {
    version: "2.1",
    date: "2026-03-10",
    title: "Chat & Dự án",
    type: "major",
    changes: [
      { icon: "💬", text: "Chat realtime giữa các thành viên (Supabase)" },
      { icon: "📁", text: "Quản lý dự án — tạo dự án, gán task, theo dõi tiến độ" },
      { icon: "📞", text: "Gọi thoại giữa các thành viên (WebRTC)" },
      { icon: "🖥️", text: "Desktop Float — cửa sổ nổi cho desktop" },
      { icon: "🎤", text: "Voice Add — thêm task bằng giọng nói" },
    ],
  },
  {
    version: "2.0",
    date: "2026-02-20",
    title: "Nền tảng B2B",
    type: "major",
    changes: [
      { icon: "☁️", text: "Cloud sync qua Supabase — đồng bộ đa thiết bị" },
      { icon: "🔐", text: "Hệ thống đăng nhập — tài khoản, 2FA, phân quyền" },
      { icon: "🤖", text: "Wory AI assistant — trò chuyện, phân tích, thêm task" },
      { icon: "📧", text: "Gmail integration — OAuth, đọc & phân loại email" },
      { icon: "📲", text: "Telegram integration — nhận tin nhắn từ bot" },
      { icon: "📊", text: "Báo cáo AI — daily/weekly/plan tự động" },
    ],
  },
  {
    version: "1.5",
    date: "2026-01-15",
    title: "Chi tiêu & QR",
    type: "minor",
    changes: [
      { icon: "💰", text: "Quản lý chi tiêu — theo task, danh mục, ngân sách" },
      { icon: "📷", text: "Chụp ảnh hóa đơn — nén JPEG, lưu cùng task" },
      { icon: "💳", text: "QR thanh toán VietQR — mở app ngân hàng" },
      { icon: "📧", text: "Email báo cáo chi tiêu hàng ngày" },
    ],
  },
  {
    version: "1.0",
    date: "2025-12-01",
    title: "Phiên bản đầu tiên",
    type: "major",
    changes: [
      { icon: "✅", text: "Quản lý công việc — tạo, sửa, xóa, subtask" },
      { icon: "📅", text: "Lịch — ngày/tuần/tháng + timeline" },
      { icon: "📬", text: "Hộp thư đến — tổng hợp email & tin nhắn" },
      { icon: "🔔", text: "Thông báo nhắc việc" },
      { icon: "⏱️", text: "Timer đếm giờ làm việc" },
      { icon: "📱", text: "PWA — cài đặt như app native" },
    ],
  },
];
