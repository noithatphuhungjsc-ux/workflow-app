/* Input validators for API endpoints — shared across handlers */

export const LIMITS = {
  DISPLAY_NAME_MAX: 100,
  KEY_MAX: 200,
  DATA_MAX_BYTES: 500 * 1024,         // 500KB per payload
  MESSAGE_MAX_BYTES: 200 * 1024,       // 200KB per single message
  MESSAGES_MAX_COUNT: 30,
  EMAIL_MAX: 254,                      // RFC 5321
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  OAUTH_CODE_MAX: 2000,
};

/**
 * Whitelist of allowed keys for cloud-sync user_data operations.
 * Blocks prototype-pollution attacks and typos creating orphan rows.
 *
 * Rule: add keys here ONLY when there's a service in src/services/
 * actually using it. Don't pre-populate for future features.
 */
export const ALLOWED_KEYS = new Set([
  'tasks', 'projects', 'expenses', 'settings', 'memory',
  'clear_timestamp', 'wory_knowledge', 'chat_history', 'expense_chat',
]);

export function validateDisplayName(name) {
  if (typeof name !== 'string') return 'displayName must be string';
  const trimmed = name.trim();
  if (!trimmed) return 'displayName empty';
  if (trimmed.length > LIMITS.DISPLAY_NAME_MAX)
    return `displayName exceeds ${LIMITS.DISPLAY_NAME_MAX} chars`;
  // Block control chars (keep Unicode for Vietnamese)
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(trimmed))
    return 'displayName contains control chars';
  return null;
}

export function validateKey(key) {
  if (typeof key !== 'string') return 'key must be string';
  if (!key) return 'key empty';
  if (key.length > LIMITS.KEY_MAX) return `key exceeds ${LIMITS.KEY_MAX} chars`;
  if (!ALLOWED_KEYS.has(key)) return `key '${key}' not in whitelist`;
  return null;
}

export function validateDataSize(data) {
  const size = typeof data === 'string'
    ? Buffer.byteLength(data, 'utf8')
    : Buffer.byteLength(JSON.stringify(data ?? null), 'utf8');
  if (size > LIMITS.DATA_MAX_BYTES)
    return `data size ${size} exceeds ${LIMITS.DATA_MAX_BYTES} bytes`;
  return null;
}

export function validateEmail(email) {
  if (typeof email !== 'string') return 'email must be string';
  if (email.length > LIMITS.EMAIL_MAX) return 'email too long';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'email format invalid';
  return null;
}

export function validatePassword(pw) {
  if (typeof pw !== 'string') return 'password must be string';
  if (pw.length < LIMITS.PASSWORD_MIN)
    return `password must be at least ${LIMITS.PASSWORD_MIN} chars`;
  if (pw.length > LIMITS.PASSWORD_MAX)
    return `password exceeds ${LIMITS.PASSWORD_MAX} chars`;
  return null;
}

export function validateMessages(messages) {
  if (!Array.isArray(messages)) return 'messages must be array';
  if (messages.length === 0) return 'messages empty';
  if (messages.length > LIMITS.MESSAGES_MAX_COUNT)
    return `messages count exceeds ${LIMITS.MESSAGES_MAX_COUNT}`;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m !== 'object') return `messages[${i}] not object`;
    if (m.role !== 'user' && m.role !== 'assistant')
      return `messages[${i}].role must be 'user' or 'assistant'`;
    // content may be string OR array (multimodal) — check size on serialized form
    if (m.content == null) return `messages[${i}].content missing`;
    const contentSize = typeof m.content === 'string'
      ? Buffer.byteLength(m.content, 'utf8')
      : Buffer.byteLength(JSON.stringify(m.content), 'utf8');
    if (contentSize > LIMITS.MESSAGE_MAX_BYTES)
      return `messages[${i}] size ${contentSize} exceeds ${LIMITS.MESSAGE_MAX_BYTES}`;
  }
  return null;
}

export function validateOAuthCode(code) {
  if (typeof code !== 'string') return 'code must be string';
  if (!code) return 'code empty';
  if (code.length > LIMITS.OAUTH_CODE_MAX) return 'code too long';
  return null;
}

/**
 * Send 400 with validation error. Call inside handler:
 *   const err = validateKey(key);
 *   if (err) return sendValidationError(res, err);
 */
export function sendValidationError(res, error) {
  return res.status(400).json({ error: 'validation_failed', detail: error });
}
