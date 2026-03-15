/* ================================================================
   CHANGELOG — Lịch sử cập nhật ứng dụng
   Thêm mục mới lên ĐẦU mảng
   ================================================================ */
export const CHANGELOG = [
  {
    version: "2.3",
    date: "2026-03-15",
    title: "UX Polish — Skeleton, Toast, Onboarding & Animations",
    type: "minor",
    changes: [
      { icon: "💀", text: "Loading skeleton — hiệu ứng shimmer khi tải dữ liệu" },
      { icon: "📭", text: "Empty state nâng cao — icon, mô tả, nút hành động" },
      { icon: "🔔", text: "Toast notification — thông báo thành công/lỗi tự ẩn sau 3s" },
      { icon: "🎓", text: "Onboarding spotlight — hướng dẫn 4 bước cho người mới" },
      { icon: "🖼️", text: "Lazy image — tải ảnh bill khi cuộn đến, giảm dung lượng ảnh" },
      { icon: "✨", text: "Micro-animations — chuyển tab trượt, danh sách xuất hiện tuần tự" },
      { icon: "♿", text: "Accessibility — tắt animation khi prefers-reduced-motion" },
    ],
  },
  {
    version: "2.2",
    date: "2026-03-15",
    title: "Industry Preset, Dashboard & 24 cải tiến",
    type: "major",
    changes: [
      // Industry Preset
      { icon: "🏢", text: "Hệ thống chọn ngành nghề — 10 ngành, tự động cấu hình app" },
      { icon: "🎯", text: "Onboarding wizard 3 bước sau khi chọn ngành" },
      { icon: "🔤", text: "Terminology — thuật ngữ thay đổi theo ngành (VD: Công việc → Đơn hàng)" },
      { icon: "👁️", text: "Tab ẩn/hiện — bật tắt từng tab trong Cài đặt > Giao diện" },
      { icon: "✅", text: "Duyệt chi tiêu — NV tạo chi tiêu → QL duyệt/từ chối" },
      { icon: "📅", text: "Calendar drag-drop — nhấn giữ task, kéo sang ngày khác" },
      { icon: "🔍", text: "OCR hóa đơn — AI quét ảnh bill, tự điền số tiền & mô tả" },
      { icon: "👥", text: "Quản lý nhân sự động — thêm/sửa/xóa tài khoản trong Cài đặt" },
      { icon: "⚠️", text: "Error boundary — bắt lỗi app, hiện màn hình tải lại" },
      { icon: "🔒", text: "CORS security — siết origin cho toàn bộ 9 API endpoints" },
      // Performance & Architecture
      { icon: "⚡", text: "Code splitting & lazy loading — tải nhanh hơn 40%, 18 chunks riêng" },
      { icon: "🧩", text: "Tách App.jsx — hooks useWoryChat, useMiniVoice, useOffline, useAuditLog" },
      { icon: "📶", text: "Offline mode — phát hiện mất mạng, hàng đợi mutation, tự đồng bộ khi online" },
      { icon: "🖥️", text: "Desktop responsive — giao diện mở rộng 640-900px cho màn hình lớn" },
      // Security & Infrastructure
      { icon: "🔐", text: "Server-side RBAC middleware — xác thực JWT & phân quyền API" },
      { icon: "🏢", text: "Multi-tenant — orgId/orgName, scoping dữ liệu theo tổ chức" },
      { icon: "📝", text: "Audit log — ghi nhận mọi thao tác (task, expense, settings)" },
      // Features
      { icon: "📊", text: "Dashboard tổng quan — KPI cards, donut chart, weekly trend, priority breakdown" },
      { icon: "📋", text: "Task templates theo ngành — mẫu công việc sẵn cho từng ngành nghề" },
      { icon: "📤", text: "Xuất báo cáo CSV/PDF — export tasks & chi tiêu" },
      { icon: "🔔", text: "Push notification nâng cao — thông báo khi giao việc/duyệt chi tiêu" },
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
