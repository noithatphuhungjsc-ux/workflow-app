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

function base64url(data) {
  const b = typeof data === "string" ? Buffer.from(data) : data;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ── Get OAuth2 access token ── */
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
    iat: now,
    exp: now + 3600,
  }));

  const signInput = `${header}.${payload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signInput);
  const sig = sign.sign(sa.private_key);
  const signature = base64url(sig);
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
  console.error("[FCM] Token error:", JSON.stringify(data));
  return null;
}

/* ── Send FCM V1 push ── */
async function sendFCM(fcmToken, data, notification) {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
  if (!sa.project_id) return false;

  const accessToken = await getAccessToken();
  if (!accessToken) return false;

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          data: {
            ...data,
            title: notification.title,
            body: notification.body,
            channelId: "incoming_calls",
            importance: "high",
          },
          android: {
            priority: "HIGH",
          },
        },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    console.error("[FCM] Send failed:", res.status, err);
  }
  return res.ok;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { targetUserId, callerName, mode, conversationId, callerId } = req.body || {};
    if (!targetUserId || !callerName) {
      return res.status(400).json({ error: "Missing targetUserId or callerName" });
    }

    let webSent = 0;
    let nativeSent = 0;

    // Resolve local ID for fallback lookup
    const LOCAL_NAMES = {
      "Nguyen Duy Trinh": "trinh", "Liên Kế toán": "lien", "Tùng Tổ trưởng": "tung",
      "Tâm Tổ phó": "tam", "Đương Tổ phó": "duong", "Minh Hoàn thiện": "minh",
      "Liển Hoàn thiện": "lien2", "Tuấn Thợ mộc": "tuan", "Trang Táo đỏ": "trang",
      "Hải Thợ mộc": "hai", "Hoài Táo đỏ": "hoai",
      "Pham Van Hung": "hung", "Tran Thi Mai": "mai", "Le Minh Duc": "duc",
    };
    const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", targetUserId).single();
    const localId = prof?.display_name ? LOCAL_NAMES[prof.display_name] : null;
    const searchIds = localId ? [targetUserId, localId] : [targetUserId];

    // 1. Web Push
    if (webpush) {
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("endpoint, keys_p256dh, keys_auth")
        .in("user_id", searchIds);

      const payload = JSON.stringify({
        title: mode === "video" ? `${callerName} goi video` : `${callerName} dang goi`,
        body: "Nhan de tra loi",
        tag: `call-${Date.now()}`,
        data: { url: "/?tab=inbox", type: "call", conversationId },
      });

      for (const sub of (subs || [])) {
        try {
          await webpush.sendNotification({
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
          }, payload, { TTL: 120, urgency: "high" });
          webSent++;
        } catch (e) {
          if (e.statusCode === 410 || e.statusCode === 404) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      }
    }

    // 2. Native Push (FCM V1)
    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("token, platform")
      .in("user_id", searchIds);

    for (const t of (tokens || [])) {
      const title = mode === "video" ? `${callerName} goi video` : `${callerName} dang goi`;
      const ok = await sendFCM(t.token, {
        type: "call",
        callerName: callerName || "",
        callerId: callerId || "",
        mode: mode || "audio",
        conversationId: conversationId || "",
      }, { title, body: "Nhan de tra loi" });
      if (ok) nativeSent++;
    }

    return res.json({ webSent, nativeSent });
  } catch (e) {
    console.error("[push-call] Error:", e);
    return res.status(500).json({ error: e.message });
  }
}
