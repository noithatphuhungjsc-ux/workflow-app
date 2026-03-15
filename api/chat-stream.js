export const config = { runtime: 'edge' };

// Simple rate limiting for edge — per-isolate (resets on cold start, but still helps)
const rateMap = new Map();
const RATE_LIMIT = 20; // max streaming requests per minute (stricter — streaming costs more)
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
function getAllowedOrigin(req) {
  const origin = req.headers.get('origin') || "";
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (origin.startsWith("https://workflow-app-") && origin.endsWith(".vercel.app")) return origin;
  return ALLOWED_ORIGINS[0];
}

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': getAllowedOrigin(req),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  // Rate limiting
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRate(clientIp)) {
    return new Response(JSON.stringify({ error: 'Quá nhiều yêu cầu. Vui lòng đợi 1 phút.' }), {
      status: 429,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500, headers: cors });

  let body;
  try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400, headers: cors }); }

  const { system, messages, max_tokens } = body;
  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: cors });
  }

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
    const err = await response.text();
    return new Response(err, { status: response.status, headers: cors });
  }

  return new Response(response.body, {
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
