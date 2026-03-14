/* Telegram Fetch — Get recent messages via Bot API (getUpdates polling) */
export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { bot_token, offset = 0, limit = 20 } = req.body;
  if (!bot_token) return res.status(400).json({ error: 'No bot token' });

  try {
    // 1. Get updates from Telegram Bot API
    const url = `https://api.telegram.org/bot${bot_token}/getUpdates?offset=${offset}&limit=${Math.min(limit, 100)}&allowed_updates=["message"]`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (!data.ok) {
      return res.status(401).json({ error: data.description || 'Invalid bot token', needReauth: true });
    }

    // 2. Get bot info for display
    const meResp = await fetch(`https://api.telegram.org/bot${bot_token}/getMe`);
    const meData = await meResp.json();
    const botUsername = meData.ok ? meData.result.username : 'bot';

    // 3. Transform updates into unified message format
    const messages = (data.result || [])
      .filter(u => u.message)
      .map(u => {
        const m = u.message;
        const from = m.from || {};
        const chat = m.chat || {};
        const fromName = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Unknown';
        const isGroup = chat.type === 'group' || chat.type === 'supergroup';

        return {
          id: `tg_${u.update_id}`,
          source: 'telegram',
          from: fromName,
          subject: isGroup ? (chat.title || 'Nhóm') : 'Tin nhắn riêng',
          snippet: m.text || m.caption || (m.photo ? '[Hình ảnh]' : m.document ? '[Tài liệu]' : m.sticker ? '[Sticker]' : '[Tin nhắn]'),
          date: new Date(m.date * 1000).toISOString(),
          unread: true,
          chatId: chat.id,
          chatType: chat.type,
          updateId: u.update_id,
        };
      });

    // 4. Calculate next offset
    const nextOffset = data.result?.length > 0
      ? data.result[data.result.length - 1].update_id + 1
      : offset;

    res.json({ messages, nextOffset, botUsername });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Telegram messages' });
  }
}
