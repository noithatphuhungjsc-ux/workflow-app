// Node.js Serverless Function (not Edge — Edge IPs may be blocked by Anthropic)

// Simple rate limiting — per-instance (resets on cold start)
const rateMap = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW = 60 * 1000;

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

const ALLOWED_ORIGINS = ["https://workflow-app-lemon.vercel.app", "http://localhost:5173"];
function getAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (origin && origin.startsWith("https://workflow-app-") && origin.endsWith(".vercel.app")) return origin;
  return ALLOWED_ORIGINS[0];
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(origin));
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  // Rate limiting
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || 'unknown';
  if (!checkRate(clientIp)) {
    return res.status(429).json({ error: 'Quá nhiều yêu cầu. Vui lòng đợi 1 phút.' });
  }

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { system, messages, max_tokens } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

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
        max_tokens: Math.min(max_tokens || 1500, 2500),
        stream: true,
        system: typeof system === 'string' ? system.slice(0, 8000) : '',
        messages: messages.slice(-30),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      const status = response.status;
      console.error(`[WF] Anthropic API error ${status}:`, errText);
      let msg;
      if (status === 401) msg = 'API key không hợp lệ. Liên hệ admin.';
      else if (status === 403) msg = `API bị từ chối (403). Kiểm tra billing tại console.anthropic.com`;
      else if (status === 429) msg = 'Quá nhiều yêu cầu. Đợi 1 phút rồi thử lại.';
      else if (status === 529) msg = 'Anthropic đang quá tải. Thử lại sau vài phút.';
      else msg = `Lỗi API (${status})`;
      return res.status(status).json({ error: msg });
    }

    // Stream SSE response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Pipe Anthropic stream to client
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { res.end(); return; }
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
    };

    req.on('close', () => { try { reader.cancel(); } catch {} });
    await pump();
  } catch (err) {
    console.error('[WF] Chat stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Lỗi kết nối tới Anthropic API.' });
    }
  }
}
