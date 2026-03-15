/* ================================================================
   useGmail — Gmail OAuth callback + auto-fetch unread count
   Extracted from App.jsx to reduce MainApp size
   ================================================================ */
import { useState, useEffect } from "react";
import { loadJSON, saveJSON, encryptToken, decryptToken } from "../services";

export function useGmail(userId, settings) {
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailUnread, setGmailUnread] = useState(0);

  useEffect(() => {
    (async () => {
      // Handle OAuth callback
      const params = new URLSearchParams(window.location.search);
      const gmailToken = params.get("gmail");
      if (gmailToken) {
        try {
          const data = JSON.parse(atob(gmailToken.replace(/-/g, '+').replace(/_/g, '/')));
          if (data.refresh_token) {
            const encrypted = await encryptToken(data, userId);
            if (encrypted) localStorage.setItem("wf_gmail_enc", encrypted);
            saveJSON("gmail_token", { email: data.email, connected_at: data.connected_at });
            setGmailConnected(true);
            window.history.replaceState({}, "", window.location.pathname);
          }
        } catch {}
      } else {
        const meta = loadJSON("gmail_token", null);
        if (meta?.email) setGmailConnected(true);
      }

      // Auto-fetch email count on load
      if (settings.autoFetchEmail !== false) {
        try {
          const encStr = localStorage.getItem("wf_gmail_enc");
          if (encStr) {
            const tokenData = await decryptToken(encStr, userId);
            if (tokenData?.refresh_token) {
              const res = await fetch("/api/gmail-fetch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: tokenData.refresh_token, maxResults: settings.emailFetchCount || 15 }),
              });
              const data = await res.json();
              if (data.emails) {
                saveJSON("gmail_emails", data.emails);
                setGmailUnread(data.emails.filter(e => e.unread).length);
              }
              if (data.needReauth) {
                localStorage.removeItem("wf_gmail_enc");
                saveJSON("gmail_token", null);
                setGmailConnected(false);
              }
            }
          }
        } catch {}
      }
    })();

    // Listen for Gmail connection from Settings popup flow
    const onGmailMsg = (e) => {
      if (e.data?.type === "gmail_connected") {
        const meta = loadJSON("gmail_token", null);
        if (meta?.email) setGmailConnected(true);
      }
    };
    window.addEventListener("message", onGmailMsg);
    return () => window.removeEventListener("message", onGmailMsg);
  }, []); // eslint-disable-line

  return { gmailConnected, setGmailConnected, gmailUnread, setGmailUnread };
}
