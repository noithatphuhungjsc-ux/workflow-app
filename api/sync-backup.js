/* Insert backup data as JSON attachment into Gmail (no inbox, no notification) */
const ALLOWED_ORIGINS = ["https://workflow-app-lemon.vercel.app", "http://localhost:5173"];
function getAllowedOrigin(req) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (origin.startsWith("https://workflow-app-") && origin.endsWith(".vercel.app")) return origin;
  return ALLOWED_ORIGINS[0];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(req));
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { refresh_token, to, data, userId } = req.body;
  if (!refresh_token || !to || !data) {
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

    const accessToken = tokenData.access_token;

    // 2. Find or create "WorkFlow Backup" label
    let labelId = null;
    try {
      const labelsRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      const labelsData = await labelsRes.json();
      const existing = (labelsData.labels || []).find(l => l.name === 'WorkFlow Backup');
      if (existing) {
        labelId = existing.id;
      } else {
        // Create the label
        const createRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'WorkFlow Backup',
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
          }),
        });
        const created = await createRes.json();
        labelId = created.id;
      }
    } catch {
      // Label creation failed — continue without label
    }

    // 3. Create stats summary
    const tasks = data.tasks || [];
    const expenses = data.expenses || [];
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter(t => t.status === 'done').length;
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const dateStr = new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const htmlBody = `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:linear-gradient(135deg,#6a7fd422,#d4900a22);border-radius:12px;padding:16px;margin-bottom:16px;">
          <h2 style="margin:0;color:#2b2d35;font-size:18px;">&#x1F4BE; Sao lưu dữ liệu WorkFlow</h2>
          <p style="margin:4px 0 0;color:#6b6e7e;font-size:13px;">${dateStr}</p>
        </div>
        <div style="line-height:1.8;color:#2b2d35;font-size:14px;">
          <b>Tài khoản:</b> @${userId || 'unknown'}<br/>
          <b>Công việc:</b> ${totalTasks} (hoàn thành: ${doneTasks})<br/>
          <b>Chi tiêu:</b> ${expenses.length} mục — ${totalExpenses.toLocaleString('vi-VN')}đ<br/>
          <b>Lịch sử:</b> ${(data.history || []).length} sự kiện<br/>
          <b>Ghi nhớ AI:</b> ${(data.memory || []).length} mục<br/><br/>
          <em style="color:#6b6e7e;font-size:12px;">File backup đính kèm bên dưới. Để khôi phục: mở WorkFlow → Cài đặt → Dữ liệu → Nhập dữ liệu → chọn file JSON.</em>
        </div>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e8e5de;text-align:center;color:#7b7d8e;font-size:11px;">
          Gửi tự động bởi WorkFlow App · Wory AI Assistant
        </div>
      </div>
    `;

    // 4. Build MIME multipart email with JSON attachment
    const boundary = 'boundary_workflow_backup_' + Date.now();
    const jsonContent = JSON.stringify(data, null, 2);
    const filename = `workflow-backup-${userId || 'user'}-${new Date().toISOString().slice(0, 10)}.json`;
    const subject = `[WorkFlow Backup] Sao lưu ${dateStr}`;

    const raw = [
      `From: ${to}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      htmlBody,
      `--${boundary}`,
      `Content-Type: application/json; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      Buffer.from(jsonContent).toString('base64'),
      `--${boundary}--`,
    ].join('\r\n');

    const encodedMessage = Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // 5. Insert into Gmail (NOT send) — no notification, no inbox
    // labelIds: only our custom label (no INBOX = no notification)
    const labelIds = labelId ? [labelId] : [];
    const insertRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?internalDateSource=dateHeader',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encodedMessage, labelIds }),
      }
    );

    const insertData = await insertRes.json();
    if (insertData.id) {
      res.json({ success: true, messageId: insertData.id });
    } else {
      res.status(500).json({ error: insertData.error?.message || 'Failed to insert backup' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error sending backup' });
  }
}
