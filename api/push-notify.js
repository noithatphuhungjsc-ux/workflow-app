/* ================================================================
   Push Notify — Cron-based task reminders
   Runs: 01:00 UTC (8AM VN) + 07:00 UTC (2PM VN)
   - Morning: Today's tasks + overdue summary
   - Afternoon: Urgent incomplete tasks + deadline tomorrow
   ================================================================ */
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

webpush.setVapidDetails(
  "mailto:workflow@app.com",
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "GET or POST only" });
  }

  try {
    const { data: allUserData, error: udErr } = await supabase
      .from("user_data")
      .select("user_id, key, value")
      .eq("key", "tasks");

    if (udErr || !allUserData) {
      return res.json({ sent: 0, error: udErr?.message || "No user data" });
    }

    // Vietnam timezone (UTC+7)
    const now = new Date();
    const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const vnHour = vnNow.getUTCHours();
    const todayStr = vnNow.toISOString().split("T")[0];

    // Tomorrow
    const tomorrow = new Date(vnNow);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const isMorning = vnHour >= 7 && vnHour < 10;   // 7-10AM VN
    const isAfternoon = vnHour >= 13 && vnHour < 16; // 1-4PM VN

    let totalSent = 0;

    for (const row of allUserData) {
      const tasks = Array.isArray(row.value) ? row.value : (Array.isArray(row.data) ? row.data : []);
      const todayTasks = [];
      const overdueTasks = [];
      const tomorrowTasks = [];
      const urgentInProgress = [];

      for (const t of tasks) {
        if (!t || t.deleted || t.status === "done") continue;

        if (t.deadline === todayStr) todayTasks.push(t);
        if (t.deadline && t.deadline < todayStr) overdueTasks.push(t);
        if (t.deadline === tomorrowStr) tomorrowTasks.push(t);
        if (t.status === "inprogress" && t.priority === "cao") urgentInProgress.push(t);
      }

      const notifications = [];

      if (isMorning) {
        // Morning: today's tasks
        if (todayTasks.length > 0) {
          const p1 = todayTasks.filter(t => t.priority === "cao");
          const titles = todayTasks.slice(0, 3).map(t => t.title).join(", ");
          const more = todayTasks.length > 3 ? ` (+${todayTasks.length - 3})` : "";
          notifications.push({
            title: `📋 Hôm nay: ${todayTasks.length} việc cần làm`,
            body: p1.length > 0
              ? `⚡ ${p1.length} ưu tiên cao! ${titles}${more}`
              : `${titles}${more}`,
            tag: `daily-${todayStr}`,
            data: { url: "/?tab=tasks", type: "task" },
          });
        }

        // Overdue
        if (overdueTasks.length > 0) {
          const titles = overdueTasks.slice(0, 3).map(t => t.title).join(", ");
          const more = overdueTasks.length > 3 ? ` (+${overdueTasks.length - 3})` : "";
          notifications.push({
            title: `🔴 ${overdueTasks.length} việc quá hạn`,
            body: `${titles}${more}`,
            tag: `overdue-${todayStr}`,
            data: { url: "/?tab=tasks", type: "task" },
          });
        }

        // Tomorrow deadline warning
        if (tomorrowTasks.length > 0) {
          const titles = tomorrowTasks.slice(0, 3).map(t => t.title).join(", ");
          notifications.push({
            title: `⏰ Ngày mai đến hạn: ${tomorrowTasks.length} việc`,
            body: titles,
            tag: `tomorrow-${todayStr}`,
            data: { url: "/?tab=tasks", type: "task" },
          });
        }
      }

      if (isAfternoon) {
        // Afternoon: urgent tasks still not done
        const stillPending = todayTasks.filter(t => t.status !== "done");
        if (stillPending.length > 0) {
          const titles = stillPending.slice(0, 3).map(t => t.title).join(", ");
          notifications.push({
            title: `⚡ Còn ${stillPending.length} việc hôm nay chưa xong`,
            body: titles,
            tag: `afternoon-${todayStr}`,
            data: { url: "/?tab=tasks", type: "task" },
          });
        }

        // Overdue (repeat in afternoon for visibility)
        if (overdueTasks.length > 0) {
          notifications.push({
            title: `🔴 Nhắc lại: ${overdueTasks.length} việc quá hạn`,
            body: overdueTasks.slice(0, 3).map(t => t.title).join(", "),
            tag: `overdue-pm-${todayStr}`,
            data: { url: "/?tab=tasks", type: "task" },
          });
        }
      }

      // Fallback: always send if explicitly called (e.g., manual test)
      if (!isMorning && !isAfternoon) {
        if (todayTasks.length > 0) {
          notifications.push({
            title: `📋 ${todayTasks.length} việc hôm nay`,
            body: todayTasks.slice(0, 3).map(t => t.title).join(", "),
            tag: `test-${Date.now()}`,
          });
        }
        if (overdueTasks.length > 0) {
          notifications.push({
            title: `🔴 ${overdueTasks.length} việc quá hạn`,
            body: overdueTasks.slice(0, 3).map(t => t.title).join(", "),
            tag: `test-overdue-${Date.now()}`,
          });
        }
      }

      if (notifications.length === 0) continue;

      // Get push subscriptions
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("endpoint, keys_p256dh, keys_auth")
        .eq("user_id", row.user_id);

      if (!subs?.length) continue;

      for (const sub of subs) {
        const pushSub = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
        };
        for (const notif of notifications) {
          try {
            await webpush.sendNotification(pushSub, JSON.stringify(notif));
            totalSent++;
          } catch (e) {
            if (e.statusCode === 410 || e.statusCode === 404) {
              await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            }
          }
        }
      }
    }

    return res.json({ sent: totalSent, checked: allUserData.length, hour: vnHour, period: isMorning ? "morning" : isAfternoon ? "afternoon" : "manual" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
