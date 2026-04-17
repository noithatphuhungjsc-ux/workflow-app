import { requireAuth, getAllowedOrigin } from './_middleware.js';
import { validateMessages, sendValidationError } from './_validators.js';

// Rate limiting: simple in-memory store (resets on cold start)
const rateMap = new Map();
const RATE_LIMIT = 30; // max requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRate(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateMap.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(req));
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Require authenticated user (prevents anonymous Anthropic credit burn)
  const user = await requireAuth(req, res);
  if (!user) return; // 401 already sent by requireAuth

  // Rate limiting (defense in depth — per IP on top of auth)
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (!checkRate(clientIp)) {
    return res.status(429).json({ error: 'Quá nhiều yêu cầu. Vui lòng đợi 1 phút.' });
  }

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { system, messages, max_tokens } = req.body || {};
  const msgErr = validateMessages(messages);
  if (msgErr) return sendValidationError(res, msgErr);
  // Cap max_tokens to prevent abuse
  const safeMaxTokens = Math.min(max_tokens || 1500, 2500);

  try {

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: safeMaxTokens,
        system: typeof system === 'string' ? system.slice(0, 8000) : '',
        messages: messages.slice(-20), // limit conversation history
      }),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Proxy error' });
  }
}
