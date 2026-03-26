/* ================================================================
   CONSTANTS — Theme, data, helpers
   ================================================================ */

/* -- THEME -- */
export const C = {
  bg:      "#f5f4f0",
  surface: "#ffffff",
  card:    "#fafaf8",
  border:  "#e8e5de",

  accent:  "#6a7fd4",  accentD: "rgba(106,127,212,0.12)",
  gold:    "#d4900a",  goldD:   "rgba(212,144,10,0.12)",
  red:     "#d95f5f",  redD:    "rgba(217,95,95,0.12)",
  green:   "#3aaa72",  greenD:  "rgba(58,170,114,0.12)",
  purple:  "#9075d4",  purpleD: "rgba(144,117,212,0.14)",

  text:    "#2b2d35",
  sub:     "#6b6e7e",
  muted:   "#7b7d8e", // tang contrast vs bg (WCAG AA fix)
};

/* -- DATA -- */
export const PRIORITIES = {
  cao:   { label: "Gap",       color: "#d32f2f", icon: "🔴" },
  trung: { label: "Binh thuong", color: "#e67e22", icon: "🟡" },
  none:  { label: "Khi nao cung duoc", color: "#78909c", icon: "⚪" },
};
/* Backward compat: "thap" maps to "trung" */
PRIORITIES.thap = PRIORITIES.trung;

export const STATUSES = {
  todo:       { label: "Can lam",      color: "#2980b9" },
  inprogress: { label: "Dang lam",     color: "#e67e22" },
  done:       { label: "Xong",         color: "#27ae60" },
};
/* Backward compat: "prepare" maps to "todo" */
STATUSES.prepare = STATUSES.todo;

export const STATUS_ORDER = ["todo","inprogress","done"];

export const WORKFLOWS = [
  // ── Xây dựng & Kiến trúc ──
  { id:"construction", name:"🏗 Thi công xây dựng", steps:["Khảo sát hiện trạng","Lập bản vẽ thiết kế","Dự toán chi phí","Phê duyệt & ký hợp đồng","Chuẩn bị vật tư","Thi công phần thô","Thi công hoàn thiện","Nghiệm thu từng hạng mục","Vệ sinh công trình","Bàn giao & bảo hành"] },
  { id:"interior",     name:"🏠 Thiết kế nội thất", steps:["Khảo sát & đo đạc","Tư vấn phong cách","Lên concept & phối cảnh 3D","Chốt thiết kế & báo giá","Đặt hàng vật liệu","Thi công trần/sàn/tường","Lắp đặt nội thất","Lắp đặt điện/nước/thiết bị","Kiểm tra chất lượng","Bàn giao & hướng dẫn sử dụng"] },
  { id:"interior_exec", name:"🪑 Thi công nội thất", steps:["Tiếp nhận bản vẽ thiết kế","Kiểm tra mặt bằng thực tế","Lập tiến độ thi công chi tiết","Đặt mua & kiểm tra vật liệu","Thi công hệ thống MEP (điện/nước/PCCC)","Thi công trần thạch cao/trần giả","Ốp lát sàn/tường","Sơn bả & hoàn thiện bề mặt","Lắp đặt đồ gỗ (tủ/kệ/bàn)","Lắp đặt thiết bị vệ sinh","Lắp đặt đèn chiếu sáng & rèm","Lắp đặt nội thất rời (sofa/bàn ghế)","Vệ sinh công nghiệp","Kiểm tra & sửa chữa khiếm khuyết","Nghiệm thu từng hạng mục","Bàn giao & bảo hành"] },
  { id:"renovation",   name:"🔨 Sửa chữa/Cải tạo", steps:["Khảo sát hiện trạng","Đánh giá hư hỏng","Lập phương án sửa chữa","Báo giá & thống nhất","Chuẩn bị vật tư","Tháo dỡ phần cũ","Thi công sửa chữa","Hoàn thiện & vệ sinh","Nghiệm thu","Bàn giao"] },
  { id:"survey",       name:"📐 Khảo sát & Đo đạc", steps:["Liên hệ khách hàng","Xác nhận lịch khảo sát","Đo đạc hiện trạng","Chụp ảnh/quay video","Ghi nhận yêu cầu khách","Lập báo cáo khảo sát","Gửi báo cáo cho khách","Tư vấn giải pháp"] },

  // ── Quản lý dự án chung ──
  { id:"project",  name:"📋 Dự án tổng quát",  steps:["Xác định mục tiêu","Lập kế hoạch","Phân công nhiệm vụ","Triển khai","Theo dõi tiến độ","Kiểm tra chất lượng","Nghiệm thu","Bàn giao & đánh giá"] },
  { id:"bidding",  name:"📑 Đấu thầu/Báo giá", steps:["Nhận yêu cầu","Khảo sát thực tế","Lập bóc tách khối lượng","Tính toán chi phí","Lập hồ sơ dự thầu","Nộp hồ sơ","Thuyết trình/bảo vệ","Đàm phán","Ký hợp đồng"] },

  // ── Hành chính & Vận hành ──
  { id:"report",   name:"📊 Báo cáo",       steps:["Thu thập dữ liệu","Phân tích","Lập dàn ý","Viết nội dung","Review","Chỉnh sửa","Trình duyệt"] },
  { id:"meeting",  name:"🤝 Cuộc họp",      steps:["Xác định mục tiêu","Lập agenda","Mời & gửi lịch","Chuẩn bị tài liệu","Tiến hành họp","Lập biên bản","Giao việc & follow-up"] },
  { id:"event",    name:"🎪 Sự kiện",       steps:["Mục tiêu & ngân sách","Lên kế hoạch","Liên hệ đối tác","Chuẩn bị logistics","Chạy thử","Thực hiện","Tổng kết & đánh giá"] },
  { id:"recruit",  name:"👥 Tuyển dụng",    steps:["Xác định nhu cầu","Soạn JD","Đăng tuyển","Lọc CV","Phỏng vấn","Đánh giá","Thương lượng","Onboard"] },
  { id:"purchase", name:"🛒 Mua sắm/Đặt hàng", steps:["Xác định nhu cầu","Tìm nhà cung cấp","So sánh báo giá","Đặt hàng","Theo dõi giao hàng","Kiểm tra hàng nhận","Thanh toán","Lưu hồ sơ"] },
];

export const WAKE_KEYWORDS = [
  "hey workflow","hey work flow","hey workflo","hey work",
  "nay workflow","nay work","oi workflow",
  "xin chao workflow","hello workflow",
  "hey wor","hey wok","e workflow","e work",
];

/* -- KNOWLEDGE CATEGORIES (Wory Training) -- */
export const KNOWLEDGE_CATEGORIES = {
  style:   { label: "Phong cách",    color: "#9b59b6" },
  sop:     { label: "Quy trình",     color: "#2980b9" },
  people:  { label: "Mối quan hệ",   color: "#e67e22" },
  context: { label: "Bối cảnh",      color: "#27ae60" },
};

export const DEFAULT_PROFILE = {
  role: "",
  company: "",
  industry: "",
  teamSize: "",
  workStyle: "",
  communication: "",
  goals: "",
  notes: "",
};

/* -- EXPENSE CATEGORIES -- */
export const EXPENSE_CATEGORIES = {
  work:         { label: "Công việc",   icon: "💼", color: "#2980b9" },
  relationship: { label: "Quan hệ",    icon: "🤝", color: "#e67e22" },
  family:       { label: "Gia đình",   icon: "🏠", color: "#27ae60" },
  personal:     { label: "Cá nhân",    icon: "👤", color: "#9b59b6" },
  other:        { label: "Khác",       icon: "📦", color: "#7f8c8d" },
};

/* -- PAYMENT SOURCES -- */
export const PAYMENT_SOURCES = {
  cash:              { label: "Tiền mặt",     icon: "💵" },
  bank_vietcombank:  { label: "Vietcombank",  icon: "🏦" },
  bank_techcombank:  { label: "Techcombank",  icon: "🏦" },
  bank_mbbank:       { label: "MB Bank",      icon: "🏦" },
  bank_tpbank:       { label: "TPBank",       icon: "🏦" },
  bank_acb:          { label: "ACB",          icon: "🏦" },
  bank_bidv:         { label: "BIDV",         icon: "🏦" },
  bank_vietinbank:   { label: "VietinBank",   icon: "🏦" },
  bank_agribank:     { label: "Agribank",     icon: "🏦" },
  bank_sacombank:    { label: "Sacombank",    icon: "🏦" },
  bank_vpbank:       { label: "VPBank",       icon: "🏦" },
  bank_other:        { label: "NH khác",      icon: "🏦" },
  momo:              { label: "MoMo",         icon: "📱" },
  zalopay:           { label: "ZaloPay",      icon: "📱" },
};

/* -- PROJECT COLORS -- */
export const PROJECT_COLORS = ["#2980b9","#e67e22","#27ae60","#9b59b6","#d35400","#16a085","#c0392b","#2c3e50"];

/* -- TEAM ACCOUNTS — single source of truth -- */
export const TEAM_ACCOUNTS = [
  { id: "trinh",  name: "Nguyen Duy Trinh", email: "trinh@workflow.vn",  phone: "+84983523868", role: "director",     title: "Giám đốc",       color: "#9b59b6" },
  { id: "lien",   name: "Liên Kế toán",     email: "lien@workflow.vn",   phone: "",              role: "accountant",  title: "Kế toán",        color: "#e74c3c" },
  { id: "tung",   name: "Tùng Tổ trưởng",   email: "tung@workflow.vn",   phone: "",              role: "manager",     title: "Tổ trưởng",      color: "#2980b9" },
  { id: "tam",    name: "Tâm Tổ phó",       email: "tam@workflow.vn",    phone: "",              role: "manager",     title: "Tổ phó",         color: "#16a085" },
  { id: "duong",  name: "Đương Tổ phó",     email: "duong@workflow.vn",  phone: "",              role: "manager",     title: "Tổ phó",         color: "#27ae60" },
  { id: "minh",   name: "Minh Hoàn thiện",  email: "minh@workflow.vn",   phone: "",              role: "staff",       title: "Hoàn thiện",     color: "#3498db" },
  { id: "lien2",  name: "Liển Hoàn thiện",  email: "lien2@workflow.vn",  phone: "",              role: "staff",       title: "Hoàn thiện",     color: "#1abc9c" },
  { id: "tuan",   name: "Tuấn Thợ mộc",    email: "tuan@workflow.vn",   phone: "",              role: "staff",       title: "Thợ mộc",        color: "#d35400" },
  { id: "trang",  name: "Trang Táo đỏ",     email: "trang@workflow.vn",  phone: "",              role: "staff",       title: "Táo đỏ",         color: "#c0392b" },
  { id: "hai",    name: "Hải Thợ mộc",      email: "hai@workflow.vn",    phone: "",              role: "staff",       title: "Thợ mộc",        color: "#e67e22" },
  { id: "hoai",   name: "Hoài Táo đỏ",      email: "hoai@workflow.vn",   phone: "",              role: "staff",       title: "Táo đỏ",         color: "#e74c3c" },
];

// Dev-only accounts — chỉ hiện khi ?dev hoặc đăng nhập với director
export const DEV_ONLY_ACCOUNTS = [
  { id: "hung",   name: "Pham Van Hung",     email: "hung@workflow.vn",   phone: "",              role: "sales",       title: "Kinh doanh",     color: "#6a7fd4" },
  { id: "mai",    name: "Tran Thi Mai",      email: "mai@workflow.vn",    phone: "",              role: "hr",          title: "Nhân sự",        color: "#3aaa72" },
  { id: "duc",    name: "Le Minh Duc",       email: "duc@workflow.vn",    phone: "",              role: "construction", title: "Thi công",      color: "#e67e22" },
];

// All accounts (for auth sync, cleanup, etc.)
export const ALL_ACCOUNTS = [...TEAM_ACCOUNTS, ...DEV_ONLY_ACCOUNTS];
export const TEAM_EMAILS = Object.fromEntries(ALL_ACCOUNTS.map(a => [a.id, a.email]));

export const DAY_NAMES = ["T2","T3","T4","T5","T6","T7","CN"];
export const MONTH_NAMES = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];

/* -- TERMINOLOGY HELPER -- */
const DEFAULT_TERMS = { task: "Công việc", project: "Dự án", deadline: "Hạn chót", assignee: "Người làm", expense: "Chi tiêu" };
export function t(key, settings) {
  return settings?.terminology?.[key] || DEFAULT_TERMS[key] || key;
}

/* -- RBAC HELPER -- */
export function hasPermission(settings, tabOrAction) {
  const roles = settings?.industryRoles;
  if (!roles?.length) return true;
  const myRole = roles.find(r => r.id === settings?.userIndustryRole);
  if (!myRole) return true;
  if (myRole.permissions?.includes("all")) return true;
  return myRole.permissions?.includes(tabOrAction) ?? true;
}

/* -- DEFAULT SETTINGS -- */
export const DEFAULT_SETTINGS = {
  // Organization & Multi-tenant
  orgId: "",              // unique org identifier (auto-generated or set by owner)
  orgName: "",            // display name of the organization

  // Profile & Role
  displayName: "",
  avatarColor: C.accent,
  userRole: "manager", // "manager" | "staff"

  // Industry preset
  industryPreset: "construction", // default to construction for all users
  userIndustryRole: "",       // role id from preset ("owner", "staff", ...)
  visibleTabs: { tasks: true, calendar: true, inbox: true, expense: true, report: true, ai: true },
  terminology: {},            // { task, project, deadline, assignee, expense }
  industryExpenseCategories: null, // override EXPENSE_CATEGORIES, null = dùng mặc định

  // Security
  autoLockMinutes: 0,   // 0 = never

  // Notifications
  notificationsEnabled: true,
  reminderMinutes: 5,
  notifyDeadline: true,
  notifyOverdue: true,

  // Voice & AI
  ttsEnabled: true,
  ttsSpeed: 1.3,
  woryCanEdit: true,

  // Display
  defaultTab: "tasks",
  defaultFilter: "all",
  showCompletedTasks: true,
  handSide: "right", // "right" = bar ben trai (thuan tay phai), "left" = bar ben phai (thuan tay trai)
  fontScale: 1, // 1=100%, 1.25=125%, 1.5=150%, 1.75=175%

  // Data
  historyLimit: 500,
  chatHistoryLimit: 100,

  // Expense
  monthlyBudget: 0,         // 0 = no limit
  bankAccounts: [],          // [{id, name, source_key}] user's active accounts
  sendExpenseEmail: false,   // toggle gửi email báo cáo chi tiêu
  expenseReportTime: "21:00", // giờ Wory tổng kết

  // Workflow templates (company custom)
  customWorkflows: [],       // [{id, name, steps:[]}] — mẫu quy trình riêng công ty
};

/* -- FORMAT HELPERS -- */
export function fmtMoney(n) {
  if (n == null || isNaN(n)) return "0đ";
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "tr";
  if (n >= 1000) return (n / 1000).toFixed(0) + "k";
  return n.toLocaleString("vi-VN") + "đ";
}

/* -- HELPERS -- */
export const todayStr = () => new Date().toISOString().split("T")[0];
export const isOverdue = (t) => t.status !== "done" && !!(t.originalDeadline || (t.deadline && t.deadline < todayStr()));
export const fmtDate = (d) => d.toISOString().split("T")[0];
export const fmtDD = (s) => { if (!s) return ""; const p = s.split("-"); return p.length === 3 ? `${p[2]}-${p[1]}` : s; };

export function isWakeWord(text) {
  const t = text.toLowerCase().trim();
  return WAKE_KEYWORDS.some(k => t.includes(k));
}

export function getElapsed(task) {
  if (!task.timerState || task.timerState === "idle") return task.timerTotal || 0;
  if (task.timerState === "running") {
    return (task.timerTotal || 0) + (Date.now() - (task.timerStart || Date.now()));
  }
  return task.timerTotal || 0;
}

export function formatTimer(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2,"0")}:${String(m%60).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
}

/* -- CALENDAR HELPERS -- */
export function getWeekDays(ref = new Date()) {
  const monday = new Date(ref);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({length:7}, (_,i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function getMonthDays(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = (first.getDay() + 6) % 7;
  const days = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}

export function tasksOnDay(tasks, date) {
  const ds = fmtDate(date);
  // FIX: filter theo ca deadline va startTime
  return tasks.filter(t =>
    t.deadline === ds ||
    (t.startTime && t.deadline === ds)
  );
}

/* -- PARSE HELPERS -- */
export function parsePriority(r) {
  const t = r.toLowerCase();
  if (t.includes("cao") || t.includes("khan") || t.includes("gap")) return "cao";
  if (t.includes("thap") || t.includes("binh thuong") || t.includes("trung") || t.includes("binh") || t.includes("vua")) return "trung";
  return null;
}

export function parseDeadline(r) {
  const t = r.toLowerCase().trim();
  if (t.includes("bo qua") || t.includes("khong") || t.includes("chua") || t.includes("skip")) return null;
  const n = new Date();
  if (t.includes("ngay mai"))       { const d=new Date(n); d.setDate(d.getDate()+1);  return fmtDate(d); }
  if (t.includes("tuan toi"))       { const d=new Date(n); d.setDate(d.getDate()+7);  return fmtDate(d); }
  if (t.includes("2 tuan"))         { const d=new Date(n); d.setDate(d.getDate()+14); return fmtDate(d); }
  if (t.includes("thang toi"))      { const d=new Date(n); d.setMonth(d.getMonth()+1); return fmtDate(d); }
  if (t.includes("cuoi tuan"))      { const d=new Date(n); d.setDate(d.getDate()+(7-d.getDay())); return fmtDate(d); }
  if (t.includes("cuoi thang"))     { const d=new Date(n.getFullYear(),n.getMonth()+1,0); return fmtDate(d); }
  if (t.includes("thu 2") || t.includes("thu hai"))   { const d=new Date(n); d.setDate(d.getDate()+((8-d.getDay())%7||7)); return fmtDate(d); }
  if (t.includes("thu 6") || t.includes("thu sau"))   { const d=new Date(n); d.setDate(d.getDate()+((12-d.getDay())%7||7)); return fmtDate(d); }
  const m = t.match(/(\d{1,2})[\/\-](\d{1,2})/);
  if (m) return `${n.getFullYear()}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  return null;
}

export function parseWorkflow(r) {
  const t = r.toLowerCase();
  if (t.includes("khong") || t.includes("bo qua") || t.includes("skip")) return null;
  if (t.includes("bao cao") || t.includes("report"))  return "report";
  if (t.includes("su kien") || t.includes("event"))   return "event";
  if (t.includes("hop")     || t.includes("meeting")) return "meeting";
  if (t.includes("tuyen")   || t.includes("recruit")) return "recruit";
  if (t.includes("du an")   || t.includes("project")) return "project";
  return null;
}

/* -- SCHEMA VERSION for localStorage migration -- */
export const SCHEMA_VERSION = 2;
