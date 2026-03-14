/* Send expense report email via Gmail API */
export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { refresh_token, to, subject, body } = req.body;
  if (!refresh_token || !to || !subject) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

  try {
    // 1. Refresh access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(401).json({ error: 'Failed to refresh token', needReauth: true });
    }

    // 2. Create email message (RFC 2822 format)
    const htmlBody = `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#d4900a22,#6a7fd422);border-radius:12px;padding:16px;margin-bottom:16px;">
          <h2 style="margin:0;color:#2b2d35;font-size:18px;">📊 Báo cáo chi tiêu WorkFlow</h2>
          <p style="margin:4px 0 0;color:#6b6e7e;font-size:13px;">${new Date().toLocaleDateString("vi-VN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
        <div style="line-height:1.8;color:#2b2d35;font-size:14px;">
          ${body}
        </div>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e8e5de;text-align:center;color:#7b7d8e;font-size:11px;">
          Gửi tự động bởi WorkFlow App · Wory AI Assistant
        </div>
      </div>
    `;

    const raw = [
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'Content-Type: text/html; charset=UTF-8',
      'MIME-Version: 1.0',
      '',
      htmlBody,
    ].join('\r\n');

    const encodedMessage = Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // 3. Send via Gmail API
    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage }),
    });

    const sendData = await sendRes.json();
    if (sendData.id) {
      res.json({ success: true, messageId: sendData.id });
    } else {
      res.status(500).json({ error: sendData.error?.message || 'Failed to send email' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error sending email' });
  }
}
