/* Send backup email via system SMTP — user only provides their email */
import nodemailer from 'nodemailer';

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

  const { to, data, userId, testOnly } = req.body;
  if (!to) return res.status(400).json({ error: 'Missing email' });

  // System SMTP credentials (developer's Gmail + App Password in Vercel env vars)
  const SMTP_EMAIL = process.env.SMTP_EMAIL;
  const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
  if (!SMTP_EMAIL || !SMTP_PASSWORD) {
    return res.status(500).json({ error: 'Hệ thống email chưa được cấu hình.' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: SMTP_EMAIL, pass: SMTP_PASSWORD.replace(/\s/g, '') },
    });

    // Test mode: just verify connection + send a welcome email
    if (testOnly) {
      await transporter.verify();
      await transporter.sendMail({
        from: `WorkFlow App <${SMTP_EMAIL}>`,
        to,
        subject: 'WorkFlow — Kết nối email thành công!',
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px;">
            <div style="text-align:center;margin-bottom:20px;">
              <div style="font-size:40px;">&#x2705;</div>
              <h2 style="margin:8px 0 4px;color:#2b2d35;font-size:18px;">Kết nối thành công!</h2>
              <p style="color:#6b6e7e;font-size:13px;margin:0;">Email <b>${to}</b> đã được liên kết với WorkFlow App</p>
            </div>
            <div style="background:#f8f7f4;border-radius:12px;padding:16px;line-height:1.8;font-size:13px;color:#2b2d35;">
              Từ giờ, WorkFlow sẽ tự động gửi bản sao lưu dữ liệu về email này mỗi ngày.<br/>
              Bạn không cần làm gì thêm.
            </div>
            <div style="margin-top:20px;text-align:center;color:#7b7d8e;font-size:11px;">
              WorkFlow App · Wory AI Assistant
            </div>
          </div>
        `,
      });
      return res.json({ success: true });
    }

    // Normal mode: send backup with attachment
    if (!data) return res.status(400).json({ error: 'Missing data' });

    const tasks = data.tasks || [];
    const expenses = data.expenses || [];
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter(t => t.status === 'done').length;
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const dateStr = new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const filename = `workflow-backup-${userId || 'user'}-${new Date().toISOString().slice(0, 10)}.json`;

    await transporter.sendMail({
      from: `WorkFlow App <${SMTP_EMAIL}>`,
      to,
      subject: `[WorkFlow Backup] Sao lưu ${dateStr}`,
      html: `
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
            <em style="color:#6b6e7e;font-size:12px;">File backup đính kèm. Khôi phục: WorkFlow → Cài đặt → Dữ liệu → Nhập dữ liệu → chọn file JSON.</em>
          </div>
          <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e8e5de;text-align:center;color:#7b7d8e;font-size:11px;">
            WorkFlow App · Wory AI Assistant
          </div>
        </div>
      `,
      attachments: [{
        filename,
        content: JSON.stringify(data, null, 2),
        contentType: 'application/json',
      }],
    });

    res.json({ success: true });
  } catch (err) {
    const msg = err.message || '';
    res.status(500).json({ error: 'Gửi email thất bại: ' + msg });
  }
}
