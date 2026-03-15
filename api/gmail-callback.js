/* Gmail OAuth — Step 2: Exchange code for tokens, redirect back to app */
export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'No code' });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(500).json({ error: 'Google credentials not configured' });

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = `${proto}://${host}/api/gmail-callback`;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) return res.status(400).json({ error: tokens.error_description || tokens.error });

    // Get user email for display
    let userEmail = '';
    try {
      const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileRes.json();
      userEmail = profile.emailAddress || '';
    } catch {}

    // Encode tokens as base64 and redirect to app
    const tokenData = {
      refresh_token: tokens.refresh_token,
      email: userEmail,
      connected_at: new Date().toISOString(),
    };
    const encoded = Buffer.from(JSON.stringify(tokenData)).toString('base64url');

    // Check if opened in popup mode (via state param)
    const isPopup = req.query.state === 'popup';

    if (isPopup) {
      // Return HTML that sends token to opener via postMessage, then closes
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`<!DOCTYPE html><html><head><title>Gmail Connected</title></head><body>
        <div style="font-family:system-ui;text-align:center;padding:40px">
          <div style="font-size:32px;margin-bottom:12px">&#x2705;</div>
          <div style="font-size:16px;font-weight:600">Đã kết nối Gmail!</div>
          <div style="font-size:13px;color:#888;margin-top:8px">${userEmail}</div>
          <div style="font-size:12px;color:#aaa;margin-top:16px">Cửa sổ sẽ tự đóng...</div>
        </div>
        <script>
          try { window.opener.postMessage({ type:'gmail_connected', token:'${encoded}' }, 'https://workflow-app-lemon.vercel.app'); }
          catch(e) {}
          setTimeout(function(){ window.close(); }, 1500);
        </script>
      </body></html>`);
    }

    // Fallback: redirect back to the app
    res.redirect(302, `/?gmail=${encoded}`);
  } catch (err) {
    res.status(500).json({ error: 'Token exchange failed' });
  }
}
