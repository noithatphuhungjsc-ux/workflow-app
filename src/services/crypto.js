/* ================================================================
   TOKEN ENCRYPTION — AES-GCM for sensitive data (Gmail tokens)
   ================================================================ */

const TOKEN_SALT = "wf_token_enc_2026";

async function deriveKey(userId) {
  const raw = new TextEncoder().encode(userId + TOKEN_SALT);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(data, userId) {
  try {
    const key = await deriveKey(userId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    return JSON.stringify({
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted)),
    });
  } catch (e) {
    console.warn("[WF] encryptToken failed:", e.message);
    return null;
  }
}

export async function decryptToken(encStr, userId) {
  try {
    const { iv, data } = JSON.parse(encStr);
    const key = await deriveKey(userId);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv) },
      key,
      new Uint8Array(data)
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (e) {
    console.warn("[WF] decryptToken failed:", e.message);
    return null;
  }
}
