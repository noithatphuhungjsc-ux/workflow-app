/* ================================================================
   Push Notification Triggers — client-side helpers
   Sends targeted push notifications via /api/push-call
   ================================================================ */

/**
 * Notify a user when they're assigned to a task
 */
export async function notifyTaskAssigned(assigneeUserId, taskTitle, assignerName) {
  return sendPush(assigneeUserId, {
    title: "Việc mới được giao",
    body: `${assignerName} đã giao cho bạn: "${taskTitle}"`,
    icon: "/icon-192.png",
    tag: `assign-${Date.now()}`,
  });
}

/**
 * Notify when expense is approved/rejected
 */
export async function notifyExpenseDecision(userId, expenseDesc, amount, decision, reviewerName) {
  const isApproved = decision === "approved";
  return sendPush(userId, {
    title: isApproved ? "Chi tiêu được duyệt" : "Chi tiêu bị từ chối",
    body: `${reviewerName} đã ${isApproved ? "duyệt" : "từ chối"}: "${expenseDesc}" — ${amount.toLocaleString("vi-VN")}đ`,
    icon: "/icon-192.png",
    tag: `expense-${Date.now()}`,
  });
}

/**
 * Notify task status change to project members
 */
export async function notifyTaskStatusChange(userId, taskTitle, newStatus, changerName) {
  const statusLabels = { done: "Hoàn thành", inprogress: "Đang làm", todo: "Chờ xử lý" };
  return sendPush(userId, {
    title: "Cập nhật công việc",
    body: `${changerName}: "${taskTitle}" → ${statusLabels[newStatus] || newStatus}`,
    icon: "/icon-192.png",
    tag: `status-${Date.now()}`,
  });
}

/**
 * Low-level push sender
 */
async function sendPush(userId, payload) {
  try {
    await fetch("/api/push-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, payload }),
    });
  } catch {
    // Silent fail — push is best-effort
  }
}
