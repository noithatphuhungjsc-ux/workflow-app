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
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { targetUserId, callerName, mode } = req.body || {};
  if (!targetUserId || !callerName) {
    return res.status(400).json({ error: "Missing targetUserId or callerName" });
  }

  try {
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("endpoint, keys_p256dh, keys_auth")
      .eq("user_id", targetUserId);

    if (!subs || subs.length === 0) {
      return res.json({ sent: 0, reason: "no subscriptions" });
    }

    let sent = 0;
    const payload = JSON.stringify({
      title: mode === "video" ? `📹 ${callerName} gọi video` : `📞 ${callerName} đang gọi`,
      body: "Nhấn để trả lời",
      tag: `call-${Date.now()}`,
      data: { url: "/?tab=inbox" },
    });

    for (const sub of subs) {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
      };
      try {
        await webpush.sendNotification(pushSub, payload);
        sent++;
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }

    return res.json({ sent });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
