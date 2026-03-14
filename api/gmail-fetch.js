/* Gmail Fetch — Get recent emails using refresh token */
export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(500).json({ error: 'Google credentials not configured' });

  const { refresh_token, maxResults = 15 } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'No refresh token' });

  try {
    // 1. Get fresh access token using refresh token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) return res.status(401).json({ error: 'Token expired. Please reconnect Gmail.', needReauth: true });

    const accessToken = tokenData.access_token;

    // 2. List recent messages (inbox, unread first)
    const listRes = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.min(maxResults, 30)}&q=in:inbox`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json();
    const messageIds = listData.messages || [];

    // 3. Fetch each message (batch — parallel)
    const emails = await Promise.all(
      messageIds.slice(0, 20).map(async ({ id }) => {
        try {
          const msgRes = await fetch(
            `https://www.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const msg = await msgRes.json();
          const headers = msg.payload?.headers || [];
          const getH = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

          return {
            id: msg.id,
            threadId: msg.threadId,
            snippet: msg.snippet || '',
            subject: getH('Subject'),
            from: getH('From'),
            date: getH('Date'),
            unread: (msg.labelIds || []).includes('UNREAD'),
            labels: msg.labelIds || [],
          };
        } catch {
          return null;
        }
      })
    );

    res.json({ emails: emails.filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
}
