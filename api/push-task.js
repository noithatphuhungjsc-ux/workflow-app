/* ================================================================
   Push Notification — Task Events
   Triggers: assigned, status_change, deadline_soon, overdue
   ================================================================ */
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

let webpush = null;
try {
  webpush = (await import("web-push")).default;
  if (process.env.VITE_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      "mailto:workflow@app.com",
      process.env.VITE_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  }
} catch (e) {
  console.warn("[WebPush] Init error:", e.message);
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

/* ── FCM V1 ── */
function base64url(data) {
  const b = typeof data === "string" ? Buffer.from(data) : data;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
  if (!sa.private_key || !sa.client_email) return null;
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const signInput = `${header}.${payload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signInput);
  const signature = base64url(sign.sign(sa.private_key));
  const jwt = `${signInput}.${signature}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (data.access_token) {
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + 3500 * 1000;
    return cachedToken;
  }
  return null;
}

async function sendFCM(fcmToken, notification) {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
  if (!sa.project_id) return false;
  const accessToken = await getAccessToken();
  if (!accessToken) return false;
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title: notification.title, body: notification.body },
          data: { type: "task", title: notification.title, body: notification.body },
          android: { priority: "HIGH", notification: { channelId: "tasks", sound: "default" } },
        },
      }),
    }
  );
  return res.ok;
}

/* ── Send to a specific user (web + native) ── */
async function pushToUser(userId, notification) {
  let sent = 0;

  // Web Push
  if (webpush) {
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, keys_p256dh, keys_auth")
      .eq("user_id", userId);

    for (const sub of (subs || [])) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
          JSON.stringify(notification)
        );
        sent++;
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }
  }

  // FCM
  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("user_id", userId);

  for (const t of (tokens || [])) {
    const ok = await sendFCM(t.token, notification);
    if (ok) sent++;
  }

  return sent;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { event, targetUserId, taskTitle, assignerName, changerName, newStatus, deadline } = req.body || {};

    if (!event || !targetUserId) {
      return res.status(400).json({ error: "Missing event or targetUserId" });
    }

    let notification;
    const STATUS_LABELS = { done: "Hoàn thành ✅", inprogress: "Đang làm 🔨", todo: "Chờ xử lý 📋" };

    switch (event) {
      case "assigned":
        notification = {
          title: "📋 Việc mới được giao",
          body: `${assignerName || "Ai đó"} giao cho bạn: "${taskTitle}"`,
          icon: "/icon-192.png",
          tag: `task-assign-${Date.now()}`,
          data: { url: "/?tab=tasks", type: "task" },
        };
        break;

      case "status_change":
        notification = {
          title: "🔄 Cập nhật công việc",
          body: `${changerName || "Ai đó"}: "${taskTitle}" → ${STATUS_LABELS[newStatus] || newStatus}`,
          icon: "/icon-192.png",
          tag: `task-status-${Date.now()}`,
          data: { url: "/?tab=tasks", type: "task" },
        };
        break;

      case "deadline_reminder":
        notification = {
          title: "⏰ Sắp đến hạn",
          body: `"${taskTitle}" — hạn chót: ${deadline}`,
          icon: "/icon-192.png",
          tag: `task-deadline-${Date.now()}`,
          data: { url: "/?tab=tasks", type: "task" },
        };
        break;

      case "overdue":
        notification = {
          title: "🔴 Công việc quá hạn!",
          body: `"${taskTitle}" đã quá hạn (${deadline})`,
          icon: "/icon-192.png",
          tag: `task-overdue-${Date.now()}`,
          data: { url: "/?tab=tasks", type: "task" },
        };
        break;

      default:
        return res.status(400).json({ error: `Unknown event: ${event}` });
    }

    const sent = await pushToUser(targetUserId, notification);
    return res.json({ sent, event, targetUserId });
  } catch (e) {
    console.error("[push-task] Error:", e);
    return res.status(500).json({ error: e.message });
  }
}
