/* ================================================================
   INDUSTRY PRESETS — "Chọn ngành = Thu nhỏ app vừa đúng nhu cầu"
   Mỗi preset cùng shape. Thiếu field → fallback về mặc định.
   ================================================================ */
/* ══════════════════════════════════════════════════════════════════
   PRESET DATA
   ══════════════════════════════════════════════════════════════════ */
export const INDUSTRY_PRESETS = {

  /* ── 1. Xây dựng & Nội thất ── */
  construction: {
    id: "construction",
    name: "Xây dựng & Nội thất",
    icon: "🏗",
    description: "Thi công, thiết kế nội thất, sửa chữa",
    visibleTabs: { tasks: true, calendar: true, inbox: true, expense: true, report: true, ai: true },
    terminology: {
      task: "Hạng mục",
      project: "Công trình",
      deadline: "Hạn hoàn thành",
      assignee: "Thợ/Đội thi công",
      expense: "Chi phí vật tư",
    },
    defaultWorkflowIds: ["construction", "interior", "interior_exec", "renovation", "survey", "bidding"],
    expenseCategories: {
      material:  { label: "Vật tư",      icon: "🧱", color: "#e67e22" },
      labor:     { label: "Nhân công",   icon: "👷", color: "#2980b9" },
      equipment: { label: "Thiết bị",    icon: "🔧", color: "#8e44ad" },
      transport: { label: "Vận chuyển",  icon: "🚛", color: "#27ae60" },
      other:     { label: "Khác",        icon: "📦", color: "#7f8c8d" },
    },
    roles: [
      { id: "owner",   label: "Chủ đầu tư" },
      { id: "manager", label: "Chỉ huy trưởng" },
      { id: "lead",    label: "Tổ trưởng" },
      { id: "worker",  label: "Thợ/Nhân công" },
    ],
    woryKnowledge: [
      { content: "Khi lập tiến độ thi công, phải tính thêm 10-15% thời gian dự phòng cho thời tiết và chuyển phát vật tư", category: "sop" },
      { content: "Luôn kiểm tra vật tư khi nhận hàng: số lượng, chất lượng, quy cách kỹ thuật", category: "sop" },
      { content: "Nghiệm thu từng hạng mục trước khi chuyển qua hạng mục tiếp theo", category: "sop" },
    ],
    sampleTasks: [
      { title: "Khảo sát hiện trạng công trình", priority: "cao" },
      { title: "Lập dự toán chi phí", priority: "trung" },
      { title: "Đặt vật tư đợt 1", priority: "thap" },
    ],
    settingsOverrides: { monthlyBudget: 50000000 },
    suggestedIntegrations: ["email", "telegram"],
  },

  /* ── 2. F&B / Nhà hàng / Cafe ── */
  fnb: {
    id: "fnb",
    name: "F&B / Nhà hàng / Cafe",
    icon: "🍜",
    description: "Quán ăn, cafe, trà sữa, bar",
    visibleTabs: { tasks: true, calendar: true, inbox: false, expense: true, report: true, ai: true },
    terminology: {
      task: "Công việc",
      project: "Chi nhánh",
      deadline: "Hạn",
      assignee: "Nhân viên",
      expense: "Chi phí nguyên liệu",
    },
    defaultWorkflowIds: ["purchase"],
    expenseCategories: {
      ingredient: { label: "Nguyên liệu",  icon: "🥬", color: "#27ae60" },
      staff:      { label: "Lương NV",      icon: "👨‍🍳", color: "#2980b9" },
      rent:       { label: "Mặt bằng",     icon: "🏪", color: "#e67e22" },
      marketing:  { label: "Marketing",    icon: "📢", color: "#9b59b6" },
      other:      { label: "Khác",         icon: "📦", color: "#7f8c8d" },
    },
    roles: [
      { id: "owner",   label: "Chủ quán" },
      { id: "manager", label: "Quản lý" },
      { id: "staff",   label: "NV phục vụ" },
      { id: "kitchen", label: "Bếp" },
    ],
    woryKnowledge: [
      { content: "Kiểm tra nguyên liệu còn lại mỗi buổi sáng. Đặt hàng NCC trước 2 ngày", category: "sop" },
      { content: "Giờ cao điểm: 11h-13h và 18h-20h. Chuẩn bị trước 30 phút", category: "context" },
      { content: "Vệ sinh bếp cuối ngày: dọn bề mặt, đổ rác, lau sàn, kiểm tra gas/điện", category: "sop" },
    ],
    sampleTasks: [
      { title: "Kiểm tra tồn kho nguyên liệu", priority: "cao" },
      { title: "Đặt hàng NCC tuần này", priority: "trung" },
    ],
    settingsOverrides: { expenseReportTime: "22:00" },
    suggestedIntegrations: ["qr_payment", "telegram"],
  },

  /* ── 3. Bán lẻ / Cửa hàng ── */
  retail: {
    id: "retail",
    name: "Bán lẻ / Cửa hàng",
    icon: "🏪",
    description: "Shop thời trang, tạp hóa, điện tử",
    visibleTabs: { tasks: true, calendar: true, inbox: true, expense: true, report: true, ai: true },
    terminology: {
      task: "Đơn hàng",
      project: "Cửa hàng",
      deadline: "Hạn giao",
      assignee: "Nhân viên",
      expense: "Chi phí nhập hàng",
    },
    defaultWorkflowIds: ["purchase"],
    expenseCategories: {
      goods:     { label: "Nhập hàng",    icon: "📦", color: "#2980b9" },
      rent:      { label: "Mặt bằng",    icon: "🏪", color: "#e67e22" },
      staff:     { label: "Lương NV",     icon: "👤", color: "#8e44ad" },
      marketing: { label: "Quảng cáo",   icon: "📢", color: "#e74c3c" },
      other:     { label: "Khác",        icon: "📋", color: "#7f8c8d" },
    },
    roles: [
      { id: "owner",   label: "Chủ shop" },
      { id: "manager", label: "Quản lý" },
      { id: "staff",   label: "Nhân viên bán hàng" },
    ],
    woryKnowledge: [
      { content: "Kiểm tra tồn kho đầu ca, ghi nhận sản phẩm sắp hết để đặt hàng bổ sung", category: "sop" },
      { content: "Theo dõi sản phẩm bán chạy theo tuần để điều chỉnh lượng nhập", category: "context" },
    ],
    sampleTasks: [
      { title: "Kiểm tra tồn kho đầu ngày", priority: "cao" },
      { title: "Liên hệ NCC báo giá đợt mới", priority: "trung" },
    ],
    settingsOverrides: {},
    suggestedIntegrations: ["qr_payment", "zalo"],
  },

  /* ── 4. Spa & Làm đẹp ── */
  spa_beauty: {
    id: "spa_beauty",
    name: "Spa & Làm đẹp",
    icon: "💆",
    description: "Spa, salon tóc, nail, thẩm mỹ",
    visibleTabs: { tasks: true, calendar: true, inbox: true, expense: true, report: false, ai: true },
    terminology: {
      task: "Lịch hẹn",
      project: "Chi nhánh",
      deadline: "Giờ hẹn",
      assignee: "Kỹ thuật viên",
      expense: "Chi phí vật tư",
    },
    defaultWorkflowIds: [],
    expenseCategories: {
      supplies:  { label: "Vật tư/Mỹ phẩm", icon: "🧴", color: "#9b59b6" },
      rent:      { label: "Mặt bằng",       icon: "🏪", color: "#e67e22" },
      staff:     { label: "Lương KTV",       icon: "💅", color: "#2980b9" },
      equipment: { label: "Thiết bị",        icon: "🔧", color: "#16a085" },
      other:     { label: "Khác",            icon: "📦", color: "#7f8c8d" },
    },
    roles: [
      { id: "owner",   label: "Chủ spa" },
      { id: "manager", label: "Quản lý" },
      { id: "tech",    label: "Kỹ thuật viên" },
      { id: "reception", label: "Lễ tân" },
    ],
    woryKnowledge: [
      { content: "Gọi xác nhận lịch hẹn trước 2 giờ để giảm no-show", category: "sop" },
      { content: "Theo dõi lịch hẹn lặp lại của khách quen, nhắc trước 3 ngày", category: "sop" },
    ],
    sampleTasks: [
      { title: "Kiểm tra lịch hẹn hôm nay", priority: "cao" },
      { title: "Đặt vật tư/mỹ phẩm tháng này", priority: "trung" },
    ],
    settingsOverrides: {},
    suggestedIntegrations: ["zalo", "telegram"],
  },

  /* ── 5. Y tế / Phòng khám ── */
  medical: {
    id: "medical",
    name: "Y tế / Phòng khám",
    icon: "🏥",
    description: "Phòng khám, nha khoa, phòng mạch",
    visibleTabs: { tasks: true, calendar: true, inbox: true, expense: true, report: true, ai: true },
    terminology: {
      task: "Lịch khám",
      project: "Phòng khám",
      deadline: "Giờ khám",
      assignee: "Bác sĩ/Y tá",
      expense: "Chi phí vật tư y tế",
    },
    defaultWorkflowIds: [],
    expenseCategories: {
      medical:   { label: "Vật tư y tế",  icon: "💊", color: "#e74c3c" },
      equipment: { label: "Thiết bị",     icon: "🩺", color: "#2980b9" },
      rent:      { label: "Mặt bằng",    icon: "🏥", color: "#e67e22" },
      staff:     { label: "Lương NV",     icon: "👨‍⚕️", color: "#27ae60" },
      other:     { label: "Khác",        icon: "📦", color: "#7f8c8d" },
    },
    roles: [
      { id: "owner",   label: "Chủ phòng khám" },
      { id: "doctor",  label: "Bác sĩ" },
      { id: "nurse",   label: "Y tá/Điều dưỡng" },
      { id: "reception", label: "Lễ tân" },
    ],
    woryKnowledge: [
      { content: "Kiểm tra lịch khám đầu ngày, chuẩn bị hồ sơ bệnh nhân trước giờ khám", category: "sop" },
      { content: "Nhắc bệnh nhân tái khám trước 1 ngày qua tin nhắn", category: "sop" },
    ],
    sampleTasks: [
      { title: "Chuẩn bị hồ sơ bệnh nhân hôm nay", priority: "cao" },
      { title: "Kiểm tra tồn kho vật tư y tế", priority: "trung" },
    ],
    settingsOverrides: {},
    suggestedIntegrations: ["zalo", "email"],
  },

  /* ── 6. Giáo dục / Đào tạo ── */
  education: {
    id: "education",
    name: "Giáo dục / Đào tạo",
    icon: "🎓",
    description: "Trung tâm, trường học, gia sư",
    visibleTabs: { tasks: true, calendar: true, inbox: true, expense: true, report: true, ai: true },
    terminology: {
      task: "Lịch học",
      project: "Khóa học",
      deadline: "Ngày kết thúc",
      assignee: "Giáo viên",
      expense: "Chi phí đào tạo",
    },
    defaultWorkflowIds: ["recruit"],
    expenseCategories: {
      material:  { label: "Tài liệu",     icon: "📚", color: "#2980b9" },
      rent:      { label: "Phòng học",    icon: "🏫", color: "#e67e22" },
      staff:     { label: "Lương GV",     icon: "👨‍🏫", color: "#27ae60" },
      marketing: { label: "Tuyển sinh",   icon: "📢", color: "#9b59b6" },
      other:     { label: "Khác",        icon: "📦", color: "#7f8c8d" },
    },
    roles: [
      { id: "owner",   label: "Giám đốc" },
      { id: "manager", label: "Quản lý đào tạo" },
      { id: "teacher", label: "Giáo viên" },
      { id: "ta",      label: "Trợ giảng" },
    ],
    woryKnowledge: [
      { content: "Chuẩn bị giáo án trước buổi học ít nhất 1 ngày", category: "sop" },
      { content: "Theo dõi tiến độ học viên, nhắc bài tập trước buổi tiếp theo", category: "sop" },
    ],
    sampleTasks: [
      { title: "Soạn giáo án tuần này", priority: "cao" },
      { title: "Liên hệ học viên chưa đóng học phí", priority: "trung" },
    ],
    settingsOverrides: {},
    suggestedIntegrations: ["email", "zalo"],
  },

  /* ── 7. IT / Agency ── */
  it_agency: {
    id: "it_agency",
    name: "IT / Agency",
    icon: "💻",
    description: "Phần mềm, marketing, thiết kế",
    visibleTabs: { tasks: true, calendar: true, inbox: true, expense: true, report: true, ai: true },
    terminology: {
      task: "Ticket",
      project: "Dự án",
      deadline: "Deadline",
      assignee: "Dev/Designer",
      expense: "Chi phí dự án",
    },
    defaultWorkflowIds: ["project", "report", "meeting"],
    expenseCategories: {
      infra:     { label: "Server/Cloud",  icon: "☁️", color: "#2980b9" },
      tools:     { label: "Tools/License", icon: "🔑", color: "#9b59b6" },
      staff:     { label: "Lương NV",      icon: "👨‍💻", color: "#27ae60" },
      marketing: { label: "Marketing",    icon: "📢", color: "#e67e22" },
      other:     { label: "Khác",         icon: "📦", color: "#7f8c8d" },
    },
    roles: [
      { id: "owner",   label: "CEO/CTO" },
      { id: "pm",      label: "Project Manager" },
      { id: "dev",     label: "Developer" },
      { id: "design",  label: "Designer" },
    ],
    woryKnowledge: [
      { content: "Mỗi ticket cần có mô tả rõ ràng, acceptance criteria, và estimate thời gian", category: "sop" },
      { content: "Daily standup 15 phút: hôm qua làm gì, hôm nay làm gì, blocker nào", category: "sop" },
      { content: "Code review trước khi merge, ít nhất 1 reviewer approve", category: "sop" },
    ],
    sampleTasks: [
      { title: "Setup project board & workflow", priority: "cao" },
      { title: "Tạo sprint planning tuần này", priority: "trung" },
    ],
    settingsOverrides: {},
    suggestedIntegrations: ["email", "telegram"],
  },

  /* ── 8. Vận tải / Kho vận ── */
  logistics: {
    id: "logistics",
    name: "Vận tải / Kho vận",
    icon: "🚛",
    description: "Giao hàng, kho bãi, logistics",
    visibleTabs: { tasks: true, calendar: true, inbox: false, expense: true, report: true, ai: true },
    terminology: {
      task: "Đơn vận chuyển",
      project: "Tuyến đường",
      deadline: "Hạn giao",
      assignee: "Tài xế",
      expense: "Chi phí vận hành",
    },
    defaultWorkflowIds: ["purchase"],
    expenseCategories: {
      fuel:      { label: "Xăng dầu",     icon: "⛽", color: "#e74c3c" },
      maintain:  { label: "Bảo trì xe",   icon: "🔧", color: "#e67e22" },
      toll:      { label: "Phí cầu đường", icon: "🛣", color: "#2980b9" },
      staff:     { label: "Lương tài xế", icon: "🚗", color: "#27ae60" },
      other:     { label: "Khác",         icon: "📦", color: "#7f8c8d" },
    },
    roles: [
      { id: "owner",   label: "Chủ doanh nghiệp" },
      { id: "manager", label: "Điều phối" },
      { id: "driver",  label: "Tài xế" },
      { id: "warehouse", label: "Thủ kho" },
    ],
    woryKnowledge: [
      { content: "Kiểm tra xe trước mỗi chuyến: dầu, lốp, phanh, đèn, giấy tờ", category: "sop" },
      { content: "Cập nhật trạng thái đơn hàng ngay khi giao xong để khách theo dõi", category: "sop" },
    ],
    sampleTasks: [
      { title: "Kiểm tra đơn hàng cần giao hôm nay", priority: "cao" },
      { title: "Bảo trì xe định kỳ", priority: "trung" },
    ],
    settingsOverrides: {},
    suggestedIntegrations: ["telegram", "qr_payment"],
  },

  /* ── 9. Luật / Tư vấn ── */
  legal: {
    id: "legal",
    name: "Luật / Tư vấn",
    icon: "⚖️",
    description: "Văn phòng luật, tư vấn, kế toán",
    visibleTabs: { tasks: true, calendar: true, inbox: true, expense: true, report: true, ai: true },
    terminology: {
      task: "Hồ sơ/Vụ việc",
      project: "Khách hàng",
      deadline: "Hạn tố tụng",
      assignee: "Luật sư phụ trách",
      expense: "Chi phí vụ việc",
    },
    defaultWorkflowIds: ["project", "report", "meeting"],
    expenseCategories: {
      court:     { label: "Án phí/Lệ phí", icon: "⚖️", color: "#e74c3c" },
      travel:    { label: "Đi lại",        icon: "🚗", color: "#2980b9" },
      staff:     { label: "Lương NV",      icon: "👨‍💼", color: "#27ae60" },
      document:  { label: "Tài liệu/In ấn", icon: "📄", color: "#e67e22" },
      other:     { label: "Khác",          icon: "📦", color: "#7f8c8d" },
    },
    roles: [
      { id: "owner",    label: "Chủ VP luật" },
      { id: "lawyer",   label: "Luật sư" },
      { id: "paralegal", label: "Trợ lý luật" },
      { id: "admin",    label: "Hành chính" },
    ],
    woryKnowledge: [
      { content: "Kiểm tra hạn tố tụng mỗi ngày, nhắc trước 7 ngày cho deadline quan trọng", category: "sop" },
      { content: "Mỗi hồ sơ cần đính kèm: giấy ủy quyền, CMND/CCCD, hợp đồng dịch vụ", category: "sop" },
    ],
    sampleTasks: [
      { title: "Kiểm tra hồ sơ sắp hết hạn tố tụng", priority: "cao" },
      { title: "Soạn hợp đồng dịch vụ cho KH mới", priority: "trung" },
    ],
    settingsOverrides: {},
    suggestedIntegrations: ["email"],
  },

  /* ── 10. Chung / Văn phòng ── */
  general: {
    id: "general",
    name: "Chung / Văn phòng",
    icon: "🏢",
    description: "Văn phòng, dịch vụ tổng hợp",
    visibleTabs: { tasks: true, calendar: true, inbox: true, expense: true, report: true, ai: true },
    terminology: {},
    defaultWorkflowIds: ["project", "report", "meeting", "recruit", "purchase"],
    expenseCategories: null, // giữ mặc định EXPENSE_CATEGORIES
    roles: [
      { id: "owner",   label: "Giám đốc" },
      { id: "manager", label: "Quản lý" },
      { id: "staff",   label: "Nhân viên" },
    ],
    woryKnowledge: [],
    sampleTasks: [],
    settingsOverrides: {},
    suggestedIntegrations: ["email", "telegram"],
  },
};

/* ── Export danh sách để render grid ── */
export const INDUSTRY_LIST = Object.values(INDUSTRY_PRESETS);
