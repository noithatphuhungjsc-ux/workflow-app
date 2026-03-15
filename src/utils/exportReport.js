/* ================================================================
   Export Reports — CSV/Excel + PDF generation (no external deps)
   Uses native browser APIs for file generation
   ================================================================ */

/**
 * Export tasks to CSV (opens as Excel)
 */
export function exportTasksCSV(tasks, filename = "tasks") {
  const BOM = "\uFEFF"; // UTF-8 BOM for Excel
  const headers = ["Tiêu đề", "Trạng thái", "Ưu tiên", "Deadline", "Giờ bắt đầu", "Thời lượng (phút)", "Danh mục", "Dự án", "Ngày tạo"];
  const statusMap = { todo: "Chờ", prepare: "Chuẩn bị", inprogress: "Đang làm", done: "Hoàn thành" };
  const priorityMap = { cao: "Cao", trung: "Trung bình", thap: "Thấp", none: "Không" };

  const rows = tasks.filter(t => !t.deleted).map(t => [
    `"${(t.title || "").replace(/"/g, '""')}"`,
    statusMap[t.status] || t.status,
    priorityMap[t.priority] || t.priority || "Trung bình",
    t.deadline || "",
    t.startTime || "",
    t.duration || "",
    t.category || "",
    t.projectId || "",
    t.createdAt || "",
  ]);

  const csv = BOM + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  downloadFile(csv, `${filename}.csv`, "text/csv;charset=utf-8");
}

/**
 * Export expenses to CSV
 */
export function exportExpensesCSV(expenses, filename = "expenses") {
  const BOM = "\uFEFF";
  const headers = ["Ngày", "Mô tả", "Số tiền", "Danh mục", "Phương thức", "Trạng thái", "Người tạo"];
  const catMap = { work: "Công việc", relationship: "Quan hệ", family: "Gia đình", personal: "Cá nhân", other: "Khác" };

  const rows = expenses.map(e => [
    e.date || "",
    `"${(e.description || "").replace(/"/g, '""')}"`,
    e.amount || 0,
    catMap[e.category] || e.category || "",
    e.paymentSource || "",
    e.approval === "approved" ? "Đã duyệt" : e.approval === "rejected" ? "Từ chối" : "Chờ duyệt",
    e.createdBy || "",
  ]);

  const csv = BOM + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  downloadFile(csv, `${filename}.csv`, "text/csv;charset=utf-8");
}

/**
 * Export report as printable HTML (opens print dialog → save as PDF)
 */
export function exportReportPDF({ title, tasks, expenses, settings, dateRange }) {
  const statusMap = { todo: "Chờ", prepare: "Chuẩn bị", inprogress: "Đang làm", done: "Hoàn thành" };
  const priorityMap = { cao: "🔴 Cao", trung: "🟠 TB", thap: "🔵 Thấp", none: "⚪ Không" };

  const activeTasks = tasks.filter(t => !t.deleted);
  const done = activeTasks.filter(t => t.status === "done").length;
  const overdue = activeTasks.filter(t => t.status !== "done" && t.deadline && t.deadline < new Date().toISOString().split("T")[0]).length;
  const totalExpense = (expenses || []).reduce((a, e) => a + (e.amount || 0), 0);

  const taskRows = activeTasks.map(t => `
    <tr>
      <td>${t.title || ""}</td>
      <td>${statusMap[t.status] || t.status}</td>
      <td>${priorityMap[t.priority] || "TB"}</td>
      <td>${t.deadline || "—"}</td>
    </tr>
  `).join("");

  const expenseRows = (expenses || []).slice(0, 50).map(e => `
    <tr>
      <td>${e.date || ""}</td>
      <td>${e.description || ""}</td>
      <td style="text-align:right">${(e.amount || 0).toLocaleString("vi-VN")}đ</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${title || "Báo cáo WorkFlow"}</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }
    h1 { color: #6c5ce7; font-size: 24px; border-bottom: 2px solid #6c5ce7; padding-bottom: 8px; }
    h2 { color: #2d3436; font-size: 16px; margin-top: 24px; }
    .kpi { display: flex; gap: 12px; margin: 16px 0; }
    .kpi-card { flex: 1; background: #f8f9fa; padding: 12px; border-radius: 8px; text-align: center; }
    .kpi-card .value { font-size: 28px; font-weight: 800; color: #6c5ce7; }
    .kpi-card .label { font-size: 11px; color: #636e72; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    th { background: #6c5ce7; color: #fff; padding: 8px; text-align: left; }
    td { padding: 6px 8px; border-bottom: 1px solid #eee; }
    tr:nth-child(even) { background: #f8f9fa; }
    .footer { margin-top: 32px; font-size: 10px; color: #b2bec3; text-align: center; border-top: 1px solid #eee; padding-top: 8px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${title || "Báo cáo WorkFlow"}</h1>
  <p style="color:#636e72;font-size:12px">${dateRange || new Date().toLocaleDateString("vi-VN")} — ${settings?.displayName || ""}</p>

  <div class="kpi">
    <div class="kpi-card"><div class="value">${activeTasks.length}</div><div class="label">Tổng việc</div></div>
    <div class="kpi-card"><div class="value">${done}</div><div class="label">Hoàn thành</div></div>
    <div class="kpi-card"><div class="value" style="color:${overdue > 0 ? '#e74c3c' : '#00b894'}">${overdue}</div><div class="label">Quá hạn</div></div>
    <div class="kpi-card"><div class="value">${totalExpense.toLocaleString("vi-VN")}đ</div><div class="label">Chi tiêu</div></div>
  </div>

  <h2>Công việc (${activeTasks.length})</h2>
  <table>
    <thead><tr><th>Tiêu đề</th><th>Trạng thái</th><th>Ưu tiên</th><th>Deadline</th></tr></thead>
    <tbody>${taskRows}</tbody>
  </table>

  ${expenses?.length ? `
  <h2>Chi tiêu (${expenses.length})</h2>
  <table>
    <thead><tr><th>Ngày</th><th>Mô tả</th><th style="text-align:right">Số tiền</th></tr></thead>
    <tbody>${expenseRows}</tbody>
  </table>
  ` : ""}

  <div class="footer">Tạo bởi WorkFlow App — ${new Date().toLocaleString("vi-VN")}</div>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
