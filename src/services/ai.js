/* ================================================================
   CLAUDE API — always through server proxy (key never exposed to browser)
   ================================================================ */
import { authHeaders } from "./authHeaders";

export async function callClaude(system, messages, maxTokens = 700) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ system, messages, max_tokens: maxTokens }),
  });
  const d = await res.json();
  if (d.error) {
    const msg = typeof d.error === "string" ? d.error : JSON.stringify(d.error);
    throw new Error(msg + (d.detail ? `: ${d.detail}` : ""));
  }
  return d.content?.[0]?.text || "";
}

export async function callClaudeStream(system, messages, onDelta, maxTokens = 1500) {
  const res = await fetch("/api/chat-stream", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ system, messages, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    let errMsg = `API error (${res.status})`;
    try {
      const j = await res.json();
      if (j.error) errMsg = j.error + (j.detail ? `: ${j.detail}` : "");
    } catch {}
    throw new Error(errMsg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const evt = JSON.parse(data);
        if (evt.type === "content_block_delta" && evt.delta?.text) {
          fullText += evt.delta.text;
          onDelta(fullText);
        }
      } catch {}
    }
  }
  return fullText;
}

/* -- Auto-learning extraction -- */
export async function extractKnowledge(messages, existingEntries) {
  const last10 = messages.slice(-10);
  if (last10.length < 4) return [];

  const existingSummary = existingEntries
    .filter(e => e.approved)
    .slice(-20)
    .map(e => `- ${e.content}`)
    .join("\n") || "Chua co.";

  const systemPrompt = `Ban la bo phan phan tich cua Wory. Nhiem vu: doc hoi thoai va trich xuat thong tin QUAN TRONG ve nguoi dung de Wory hieu ho hon.

Chi trich xuat khi THUC SU co thong tin moi, cu the, huu ich. KHONG trich xuat:
- Noi dung chung chung, tam thuong
- Lenh cong viec (TASK_ADD, TASK_DELETE...)
- Cam xuc nhat thoi, loi chao
- Dieu da co trong danh sach

Phan loai:
- "style": phong cach, thoi quen, so thich lam viec
- "sop": quy trinh, buoc, tieu chuan, quy dinh
- "people": thong tin ve nguoi (dong nghiep, doi tac, sep)
- "context": boi canh cong viec, du an, muc tieu

Tra ve JSON array (co the rong [] neu khong co gi moi):
[{"content":"noi dung ngan gon","category":"style|sop|people|context","tags":["tag1","tag2"]}]

CHI TRA VE JSON, KHONG GI KHAC.

Danh sach da biet:
${existingSummary}`;

  try {
    const resp = await callClaude(systemPrompt, last10.map(m => ({ role: m.role, content: m.content })), 500);
    // Parse JSON from response
    const jsonMatch = resp.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const items = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(items)) return [];
    return items.filter(i => i.content && i.category && ["style", "sop", "people", "context"].includes(i.category));
  } catch {
    return [];
  }
}
