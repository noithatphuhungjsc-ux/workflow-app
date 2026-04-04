/* ================================================================
   ACCOUNTS / AUTH — password hashing, OTP, accounts CRUD
   ================================================================ */

export async function hashPassword(pw) {
  const enc = new TextEncoder().encode(pw + "wf_salt_2026_v2");
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function loadAccounts() {
  try {
    const saved = localStorage.getItem("wf_accounts");
    if (saved) return JSON.parse(saved);
  } catch (e) { console.warn("[WF] loadAccounts failed:", e.message); }
  return null;
}

export function saveAccounts(accounts) {
  localStorage.setItem("wf_accounts", JSON.stringify(accounts));
}

export function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function maskPhone(phone) {
  if (!phone || phone.length < 4) return "***";
  return "***" + phone.slice(-4);
}
