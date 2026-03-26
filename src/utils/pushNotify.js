/* ================================================================
   Push Notification Triggers — client-side helpers
   Sends targeted push notifications via /api/push-task
   ================================================================ */

/**
 * Notify a user when they're assigned to a task
 */
export async function notifyTaskAssigned(targetUserId, taskTitle, assignerName) {
  return sendTaskPush({
    event: "assigned",
    targetUserId,
    taskTitle,
    assignerName,
  });
}

/**
 * Notify when task status changes (to owner or assignee)
 */
export async function notifyTaskStatusChange(targetUserId, taskTitle, newStatus, changerName) {
  return sendTaskPush({
    event: "status_change",
    targetUserId,
    taskTitle,
    newStatus,
    changerName,
  });
}

/**
 * Notify when expense is approved/rejected
 */
export async function notifyExpenseDecision(userId, expenseDesc, amount, decision, reviewerName) {
  const isApproved = decision === "approved";
  return sendTaskPush({
    event: "status_change",
    targetUserId: userId,
    taskTitle: `Chi tiêu: ${expenseDesc} — ${amount.toLocaleString("vi-VN")}đ`,
    newStatus: isApproved ? "done" : "todo",
    changerName: reviewerName,
  });
}

/**
 * Low-level push sender — uses /api/push-task
 */
async function sendTaskPush(payload) {
  try {
    await fetch("/api/push-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Silent fail — push is best-effort
  }
}
