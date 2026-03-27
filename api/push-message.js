/* ================================================================
   Push Notification — New Chat Message
   Called after a message is sent, notifies all OTHER members
   Sends via Web Push + FCM (native)
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

/* ── FCM V1 helpers (reused from push-call) ── */
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
  // DATA-ONLY message — no "notification" field!
  // This ensures onMessageReceived() is ALWAYS called (even when app is killed/background),
  // so MyFirebaseMessagingService can show the notification with proper channel + lock screen.
  // If we include "notification" field, Android handles it automatically but uses a
  // non-existent channel which causes silent drops on Android 8+.
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          data: {
            type: "message",
            conversationId: notification.conversationId || "",
            title: notification.title || "WorkFlow",
            body: notification.body || "Tin nhắn mới",
          },
          android: { priority: "HIGH" },
        },
      }),
    }
  );
  return res.ok;
}

/* ── Rate limit: max 1 push per conversation per 10s ── */
const recentPushes = new Map();
function shouldThrottle(conversationId) {
  const now = Date.now();
  const last = recentPushes.get(conversationId) || 0;
  if (now - last < 10000) return true;
  recentPushes.set(conversationId, now);
  // Cleanup old entries
  if (recentPushes.size > 500) {
    for (const [k, v] of recentPushes) {
      if (now - v > 60000) recentPushes.delete(k);
    }
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { conversationId, senderId, senderName, content, messageType } = req.body || {};
    if (!conversationId || !senderId) {
      return res.status(400).json({ error: "Missing conversationId or senderId" });
    }

    // Throttle: avoid spamming push for rapid messages
    if (shouldThrottle(conversationId)) {
      return res.json({ throttled: true });
    }

    // Get all members of the conversation EXCEPT the sender
    const { data: members } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .neq("user_id", senderId);

    if (!members?.length) return res.json({ sent: 0 });

    // Build notification
    const name = senderName || "Ai đó";
    const bodyText = messageType === "image" ? "📷 Gửi ảnh"
      : messageType === "file" ? "📎 Gửi file"
      : messageType === "location" ? "📍 Gửi vị trí"
      : messageType === "system" ? content
      : (content || "").length > 80 ? content.slice(0, 80) + "…" : (content || "Tin nhắn mới");

    const notification = {
      title: name,
      body: bodyText,
      icon: "/icon-192.png",
      tag: `msg-${conversationId}`, // Group by conversation
      conversationId,
      data: { url: `/?tab=chat&conv=${conversationId}`, type: "message" },
    };

    let webSent = 0;
    let nativeSent = 0;
    const userIds = members.map(m => m.user_id);

    // Also resolve local IDs — subscriptions may be stored under "trinh" instead of UUID
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);

    // Map Supabase UUID → local account ID (e.g. "trinh", "minh")
    const LOCAL_NAMES = {
      "Nguyen Duy Trinh": "trinh", "Liên Kế toán": "lien", "Tùng Tổ trưởng": "tung",
      "Tâm Tổ phó": "tam", "Đương Tổ phó": "duong", "Minh Hoàn thiện": "minh",
      "Liển Hoàn thiện": "lien2", "Tuấn Thợ mộc": "tuan", "Trang Táo đỏ": "trang",
      "Hải Thợ mộc": "hai", "Hoài Táo đỏ": "hoai",
      "Pham Van Hung": "hung", "Tran Thi Mai": "mai", "Le Minh Duc": "duc",
    };
    const localIds = (profiles || [])
      .map(p => LOCAL_NAMES[p.display_name])
      .filter(Boolean);

    // Search subscriptions by BOTH Supabase UUID and local ID
    const allSearchIds = [...userIds, ...localIds];

    // Batch fetch all subscriptions + tokens
    const [subsRes, tokensRes] = await Promise.all([
      webpush ? supabase.from("push_subscriptions")
        .select("user_id, endpoint, keys_p256dh, keys_auth")
        .in("user_id", allSearchIds) : { data: [] },
      supabase.from("push_tokens")
        .select("user_id, token, platform")
        .in("user_id", allSearchIds),
    ]);

    // Web Push — high urgency so it wakes the device
    if (webpush) {
      const pushOptions = {
        TTL: 60 * 60, // 1 hour
        urgency: "high", // wake device from sleep
        topic: `msg-${conversationId}`,
      };
      for (const sub of (subsRes.data || [])) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
            JSON.stringify(notification),
            pushOptions
          );
          webSent++;
        } catch (e) {
          if (e.statusCode === 410 || e.statusCode === 404) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      }
    }

    // FCM (native)
    for (const t of (tokensRes.data || [])) {
      const ok = await sendFCM(t.token, notification);
      if (ok) nativeSent++;
    }

    console.log("[push-message]", { recipients: userIds.length, webSent, nativeSent, subsFound: (subsRes.data||[]).length, tokensFound: (tokensRes.data||[]).length, allSearchIds });
    return res.json({ sent: webSent + nativeSent, webSent, nativeSent, recipients: userIds.length });
  } catch (e) {
    console.error("[push-message] Error:", e);
    return res.status(500).json({ error: e.message });
  }
}
