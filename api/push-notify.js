import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
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
      .select("user_id, key, data")
      .eq("key", "tasks");

    if (udErr || !allUserData) {
      return res.json({ sent: 0, error: udErr?.message || "No user data" });
    }

    // Use UTC+7 for Vietnam timezone
    const now = new Date();
    const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayStr = vnNow.toISOString().split("T")[0];
    let totalSent = 0;

    for (const row of allUserData) {
      const tasks = Array.isArray(row.data) ? row.data : [];
      const todayTasks = [];
      const overdueTasks = [];

      for (const t of tasks) {
        if (!t || t.deleted || t.status === "done") continue;

        // Deadline hôm nay
        if (t.deadline === todayStr) {
          todayTasks.push(t);
        }
        // Quá hạn
        if (t.deadline && t.deadline < todayStr) {
          overdueTasks.push(t);
        }
      }

      const notifications = [];

      // Morning digest: today's tasks
      if (todayTasks.length > 0) {
        const p1 = todayTasks.filter(t => t.priority === "p1");
        const titles = todayTasks.slice(0, 3).map(t => t.title).join(", ");
        const more = todayTasks.length > 3 ? ` (+${todayTasks.length - 3})` : "";
        notifications.push({
          title: `📋 Hôm nay: ${todayTasks.length} việc cần làm`,
          body: p1.length > 0
            ? `⚡ ${p1.length} ưu tiên cao! ${titles}${more}`
            : `${titles}${more}`,
          tag: `daily-${todayStr}`,
        });
      }

      // Overdue reminder
      if (overdueTasks.length > 0) {
        const titles = overdueTasks.slice(0, 3).map(t => t.title).join(", ");
        const more = overdueTasks.length > 3 ? ` (+${overdueTasks.length - 3})` : "";
        notifications.push({
          title: `⏰ ${overdueTasks.length} việc quá hạn`,
          body: `${titles}${more}`,
          tag: `overdue-${todayStr}`,
        });
      }

      if (notifications.length === 0) continue;

      // Get push subscriptions for this user
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("endpoint, keys_p256dh, keys_auth")
        .eq("user_id", row.user_id);

      if (!subs || subs.length === 0) continue;

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

    return res.json({ sent: totalSent, checked: allUserData.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
