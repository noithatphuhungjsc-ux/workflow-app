/* ================================================================
   Capacitor Native Bridge
   - Push Notifications (FCM/APNs)
   - Status Bar styling
   - Keyboard handling
   - App state (foreground/background)
   ================================================================ */
import { Capacitor } from "@capacitor/core";

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // "android" | "ios" | "web"

/* ── Push Notifications ── */
export async function initPushNotifications(onTokenReceived) {
  if (!isNative) return;

  const { PushNotifications } = await import("@capacitor/push-notifications");

  // Request permission
  const permResult = await PushNotifications.requestPermissions();
  if (permResult.receive !== "granted") {
    console.warn("[Push] Permission denied");
    return;
  }

  // Register with APNs/FCM
  await PushNotifications.register();

  // Token received — send to server
  PushNotifications.addListener("registration", (token) => {
    console.log("[Push] Token:", token.value);
    if (onTokenReceived) onTokenReceived(token.value);
  });

  PushNotifications.addListener("registrationError", (err) => {
    console.error("[Push] Registration error:", err);
  });

  // Notification received while app is open
  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.log("[Push] Received:", notification);
    // Handle incoming call notification here
    if (notification.data?.type === "call") {
      window.dispatchEvent(new CustomEvent("native-call-incoming", {
        detail: notification.data,
      }));
    }
  });

  // Notification tapped (app was in background)
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    console.log("[Push] Tapped:", action);
    if (action.notification.data?.type === "call") {
      window.dispatchEvent(new CustomEvent("native-call-incoming", {
        detail: { ...action.notification.data, action: "accept" },
      }));
    }
  });
}

/* ── Check launch intent for incoming call (opened from IncomingCallActivity) ── */
export async function checkLaunchIntent() {
  if (!isNative) return;
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getLaunchUrl();
    // Capacitor passes Android extras via launch URL query params or via plugin
    // For direct intent extras, we check the bridge
    if (info?.url) {
      const url = new URL(info.url);
      if (url.searchParams.get("type") === "call") {
        window.dispatchEvent(new CustomEvent("native-call-incoming", {
          detail: {
            type: "call",
            callerName: url.searchParams.get("callerName") || "",
            mode: url.searchParams.get("mode") || "audio",
            conversationId: url.searchParams.get("conversationId") || "",
            action: url.searchParams.get("action") || "accept",
          },
        }));
      }
    }
  } catch (e) {
    console.warn("[Launch] Check intent error:", e);
  }
}

/* ── Status Bar ── */
export async function setupStatusBar() {
  if (!isNative) return;
  const { StatusBar, Style } = await import("@capacitor/status-bar");
  try {
    await StatusBar.setStyle({ style: Style.Light });
    if (platform === "android") {
      await StatusBar.setBackgroundColor({ color: "#6a7fd4" });
    }
  } catch {}
}

/* ── Keyboard ── */
export async function setupKeyboard() {
  if (!isNative) return;
  const { Keyboard } = await import("@capacitor/keyboard");
  Keyboard.addListener("keyboardWillShow", (info) => {
    document.body.style.setProperty("--keyboard-height", `${info.keyboardHeight}px`);
  });
  Keyboard.addListener("keyboardWillHide", () => {
    document.body.style.setProperty("--keyboard-height", "0px");
  });
}

/* ── App State ── */
export async function setupAppState(onResume) {
  if (!isNative) return;
  const { App } = await import("@capacitor/app");
  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive && onResume) onResume();
  });
  // Handle back button on Android
  App.addListener("backButton", ({ canGoBack }) => {
    if (!canGoBack) App.exitApp();
    else window.history.back();
  });
}

/* ── Save push token to Supabase ── */
export async function savePushToken(supabase, userId, token) {
  if (!supabase || !userId || !token) return;
  try {
    await supabase.from("push_tokens").upsert({
      user_id: userId,
      token,
      platform,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,token" });
  } catch (e) {
    console.warn("[Push] Save token error:", e);
  }
}

/* ── Init all native features ── */
export async function initNative(supabase, userId) {
  if (!isNative) return;

  setupStatusBar();
  setupKeyboard();
  setupAppState(() => {
    // Refresh data when app comes back to foreground
    window.dispatchEvent(new Event("app-resume"));
  });

  initPushNotifications(async (token) => {
    await savePushToken(supabase, userId, token);
  });

  // Check if app was launched from incoming call notification
  checkLaunchIntent();
}
