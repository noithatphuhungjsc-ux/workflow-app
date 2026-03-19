/* ================================================================
   INBOX TAB — Central hub for Email + Messaging (Zalo, etc.)
   Designed for executives/managers — Wory auto-classifies everything
   Sources: Gmail, Zalo, Telegram, Slack (future)
   ================================================================ */
import { useState, useCallback, useEffect } from "react";
import { C, PRIORITIES, STATUSES, todayStr, isOverdue } from "../constants";
import { SL, MdBlock } from "../components";
import { callClaudeStream, loadJSON, saveJSON, decryptToken } from "../services";
import ChatTab from "./ChatTab";

const SOURCES = [
  { id: "all", label: "Tất cả", icon: "📬", color: C.accent },
  { id: "email", label: "Email", icon: "📧", color: "#4285f4" },
  { id: "telegram", label: "Telegram", icon: "📱", color: "#0088cc" },
  { id: "messenger", label: "Messenger", icon: "💬", color: "#0084ff" },
  { id: "zalo", label: "Zalo", icon: "💬", color: "#0068ff" },
  { id: "instagram", label: "Instagram", icon: "📸", color: "#e1306c" },
];

export default function InboxTab({ tasks, projects, patchTask, patchProject, settings, user, addTask, openConvId }) {
  const [subTab, setSubTab] = useState("email"); // email | summary | actions
  const [sourceFilter, setSourceFilter] = useState("all");
  const [emails, setEmails] = useState(() => loadJSON("gmail_emails", null));
  const [tgMessages, setTgMessages] = useState(() => loadJSON("telegram_messages", []));
  const [zaloMessages] = useState(() => loadJSON("zalo_messages", []));
  const [messengerMessages] = useState(() => loadJSON("messenger_messages", []));
  const [summary, setSummary] = useState(() => loadJSON("gmail_summary", null));
  const [loading, setLoading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [expandedEmail, setExpandedEmail] = useState(null);
  const gmailData = loadJSON("gmail_token", null);
  const tgData = loadJSON("telegram_token", null);
  const zaloData = loadJSON("zalo_token", null);
  const messengerData = loadJSON("messenger_token", null);
  const isConnected = !!gmailData?.email || !!tgData?.botUsername || !!zaloData?.oaId || !!messengerData?.pageId;

  // Auto-fetch on mount
  useEffect(() => {
    if (gmailData?.email && settings?.autoFetchEmail !== false && !emails) {
      fetchEmails();
    }
    if (tgData?.botUsername) {
      fetchTelegram();
    }
  }, []); // eslint-disable-line

  const fetchEmails = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const encStr = localStorage.getItem("wf_gmail_enc");
      if (!encStr) { setLoading(false); return; }
      const tokenData = await decryptToken(encStr, user?.id || "default");
      if (!tokenData?.refresh_token) { setLoading(false); return; }
      const res = await fetch("/api/gmail-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: tokenData.refresh_token, maxResults: settings?.emailFetchCount || 15 }),
      });
      const data = await res.json();
      if (data.needReauth) {
        localStorage.removeItem("wf_gmail_enc");
        saveJSON("gmail_token", null);
        setLoading(false);
        return;
      }
      if (data.emails) {
        setEmails(data.emails);
        saveJSON("gmail_emails", data.emails);
      }
    } catch {}
    setLoading(false);
  }, [loading, settings, user]);

  // Fetch Telegram messages
  const fetchTelegram = useCallback(async () => {
    try {
      const encStr = localStorage.getItem("wf_telegram_enc");
      if (!encStr) return;
      const tokenData = await decryptToken(encStr, user?.id || "default");
      if (!tokenData?.bot_token) return;
      const offset = loadJSON("telegram_offset", 0);
      const res = await fetch("/api/telegram-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_token: tokenData.bot_token, offset, limit: 20 }),
      });
      const data = await res.json();
      if (data.messages?.length > 0) {
        const existing = loadJSON("telegram_messages", []);
        const existingIds = new Set(existing.map(m => m.id));
        const newMsgs = data.messages.filter(m => !existingIds.has(m.id));
        const merged = [...existing, ...newMsgs].slice(-50); // keep last 50
        setTgMessages(merged);
        saveJSON("telegram_messages", merged);
        if (data.nextOffset) saveJSON("telegram_offset", data.nextOffset);
      }
    } catch {}
  }, [user]);

  const classifyEmails = useCallback(async (emailList) => {
    if (classifying) return;
    setClassifying(true);
    setSummary(null);

    const emailData = (emailList || emails || []).map(e =>
      `- Từ: ${e.from}\n  Chủ đề: ${e.subject}\n  Tóm: ${e.snippet}\n  ${e.unread ? "[CHƯA ĐỌC]" : ""}`
    ).join("\n\n");

    const taskSum = tasks.slice(0, 10).map(t =>
      `- ${t.title} [${STATUSES[t.status]?.label}]${t.deadline ? " deadline:" + t.deadline : ""}`
    ).join("\n");

    const shortName = (settings?.displayName || user?.name || "Sếp").split(" ").pop();

    const system = `Ban la Wory — thu ky so chuyen nghiep cua ${shortName} (lanh dao/giam doc).
Phan tich email va tong hop bao cao CHUYEN NGHIEP cho lanh dao.
Viet tieng Viet co dau, markdown ro rang. KHONG chao hoi, di thang vao noi dung.
Muc tieu: ${shortName} KHONG can mo email, chi can doc bao cao cua ban.

CONG VIEC HIEN TAI:
${taskSum}`;

    const prompt = `Phan tich ${(emailList || emails || []).length} email va tong hop thanh BÁO CÁO THƯ KÝ cho lãnh đạo:

${emailData}

FORMAT BAO CAO:
## Tổng quan
- X email mới, Y chưa đọc, Z cần xử lý

## 🔴 Khẩn cấp — Cần xử lý NGAY
(Họp gấp, deadline, vấn đề nghiêm trọng, yêu cầu từ cấp trên)
- **Người gửi** — Tóm tắt 1 dòng + hành động cần làm

## 🟡 Cần phản hồi — Trong ngày
(Yêu cầu, câu hỏi, đề xuất cần trả lời)
- **Người gửi** — Tóm tắt + gợi ý phản hồi

## 🔵 Thông tin — Đọc khi rảnh
(Báo cáo, thông báo, cập nhật nội bộ)
- **Người gửi** — Tóm tắt ngắn

## ⚪ Bỏ qua
(Quảng cáo, spam, newsletter không quan trọng)
- Liệt kê ngắn

## 📋 Gợi ý tạo công việc
Nếu email nào cần hành động, gợi ý CỤ THỂ:
- Tên việc | Deadline gợi ý | Ưu tiên (cao/trung/thap/none)

## 💡 Nhận xét của Wory
2-3 dòng nhận xét, lưu ý, cảnh báo cho ${shortName}.`;

    try {
      let fullText = "";
      await callClaudeStream(
        system,
        [{ role: "user", content: prompt }],
        (partial) => { fullText = partial; setSummary({ text: partial, ts: Date.now(), loading: true }); },
        2500
      );
      const finalSummary = { text: fullText, ts: Date.now(), loading: false };
      setSummary(finalSummary);
      saveJSON("gmail_summary", finalSummary);
    } catch {
      setSummary({ text: "Lỗi kết nối. Vui lòng thử lại.", ts: Date.now(), loading: false });
    }
    setClassifying(false);
  }, [classifying, emails, tasks, settings, user]);

  // Extract sender name
  const senderName = (from) => {
    const m = from?.match(/^"?([^"<]+)/);
    return m ? m[1].trim() : from?.split("@")[0] || "?";
  };

  // Combine all messages with source tag
  const allMessages = [
    ...(emails || []).map(e => ({ ...e, source: "email" })),
    ...tgMessages.map(m => ({ ...m, source: "telegram" })),
    ...messengerMessages.map(m => ({ ...m, source: "messenger" })),
    ...zaloMessages.map(m => ({ ...m, source: "zalo" })),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // Filter by source
  const filtered = sourceFilter === "all" ? allMessages : allMessages.filter(m => m.source === sourceFilter);

  // Count per source
  const sourceCounts = {
    all: allMessages.length,
    email: (emails || []).length,
    telegram: tgMessages.length,
    messenger: messengerMessages.length,
    zalo: zaloMessages.length,
    instagram: 0,
  };

  const sourceIcon = (src) => SOURCES.find(s => s.id === src)?.icon || "📧";
  const sourceColor = (src) => SOURCES.find(s => s.id === src)?.color || C.accent;

  const [mainTab, setMainTab] = useState(openConvId ? "chat" : "chat"); // chat | inbox

  // Auto-switch to chat when openConvId changes
  useEffect(() => {
    if (openConvId) setMainTab("chat");
  }, [openConvId]);

  return (
    <div style={{ animation: "fadeIn .2s", display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Top sub-tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `2px solid ${C.border}`, flexShrink: 0 }}>
        {[["chat", "💬 Tin nhắn"], ["inbox", "📬 Hộp thư"]].map(([key, label]) => (
          <button key={key} className="tap" onClick={() => setMainTab(key)}
            style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 700, border: "none",
              background: mainTab === key ? `${C.accent}10` : "transparent",
              color: mainTab === key ? C.accent : C.muted,
              borderBottom: mainTab === key ? `2.5px solid ${C.accent}` : "2.5px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Chat sub-tab */}
      {mainTab === "chat" && (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <ChatTab openConvId={openConvId} projects={projects} tasks={tasks} patchTask={patchTask} patchProject={patchProject} addTask={addTask} />
        </div>
      )}

      {/* Inbox sub-tab (existing content) */}
      {mainTab === "inbox" && (
    <div style={{ flex: 1, overflowY: "auto", padding: "14px 0 0" }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg,${C.accentD},${C.purpleD})`, borderRadius: 14, border: `1px solid ${C.accent}33`, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 28 }}>📬</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Hộp thư</div>
          <div style={{ fontSize: 12, color: C.sub }}>
            {isConnected ? `${gmailData.email}` : "Chưa kết nối email"}
            {emails ? ` · ${emails.filter(e => e.unread).length} chưa đọc` : ""}
          </div>
        </div>
        {isConnected && (
          <button className="tap" onClick={() => { fetchEmails().then(() => { if (emails) classifyEmails(emails); }); fetchTelegram(); }} disabled={loading || classifying}
            style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 12px", fontSize: 11, fontWeight: 600, color: loading ? C.muted : C.accent }}>
            {loading ? "..." : "Làm mới"}
          </button>
        )}
      </div>

      {/* Not connected to any source */}
      {!isConnected && (
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "24px 16px", textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>Kết nối nguồn thông tin</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
            Kết nối Gmail, Telegram, Zalo để Wory tự động đọc, phân loại và tổng hợp cho bạn.
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 16 }}>
            {SOURCES.filter(s => s.id !== "all").map(s => (
              <div key={s.id} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>Vào <b>Cài đặt → Kết nối</b> để thiết lập</div>
        </div>
      )}

      {/* Connected — sub-tabs */}
      {isConnected && (
        <>
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {[["email", "Tin nhắn", filtered.length || 0], ["summary", "Báo cáo Wory", ""], ["actions", "Hành động", ""]].map(([k, l, badge]) => (
              <button key={k} className="tap" onClick={() => setSubTab(k)}
                style={{ flex: 1, background: subTab === k ? C.accent : C.card, color: subTab === k ? "#fff" : C.sub,
                  border: `1px solid ${subTab === k ? C.accent : C.border}`, borderRadius: 10, padding: "7px 4px", fontSize: 11, fontWeight: 600, position: "relative" }}>
                {l}
                {badge && subTab !== k && <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 3 }}>({badge})</span>}
              </button>
            ))}
          </div>

          {/* ── SOURCE FILTER ── */}
          {subTab === "email" && (
            <div className="no-scrollbar" style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto" }}>
              {SOURCES.filter(s => s.id === "all" || sourceCounts[s.id] > 0 || s.id === "email").map(s => (
                <button key={s.id} className="tap" onClick={() => setSourceFilter(s.id)}
                  style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 20,
                    background: sourceFilter === s.id ? s.color + "20" : C.card,
                    border: `1px solid ${sourceFilter === s.id ? s.color + "66" : C.border}`,
                    fontSize: 11, fontWeight: 600, color: sourceFilter === s.id ? s.color : C.muted, whiteSpace: "nowrap", flexShrink: 0 }}>
                  <span style={{ fontSize: 13 }}>{s.icon}</span>
                  {s.label}
                  {sourceCounts[s.id] > 0 && <span style={{ fontSize: 9, opacity: 0.7 }}>({sourceCounts[s.id]})</span>}
                </button>
              ))}
            </div>
          )}

          {/* ── MESSAGE LIST ── */}
          {subTab === "email" && (
            <div>
              {loading && !emails && (
                <div style={{ textAlign: "center", padding: 24 }}><div className="dots"><span /><span /><span /></div></div>
              )}
              {!emails && !loading && (
                <div style={{ textAlign: "center", padding: 24, color: C.muted, fontSize: 13 }}>Nhấn "Làm mới" để tải email</div>
              )}
              {filtered.map(e => {
                const isExpanded = expandedEmail === e.id;
                const srcColor = sourceColor(e.source);
                return (
                  <div key={e.id} style={{ marginBottom: 6 }}>
                    <div className="tap" onClick={() => setExpandedEmail(isExpanded ? null : e.id)}
                      style={{ background: e.unread ? "#fff" : C.card, borderRadius: isExpanded ? "12px 12px 0 0" : 12,
                        border: `1px solid ${e.unread ? C.accent + "33" : C.border}`,
                        borderBottom: isExpanded ? "none" : undefined,
                        padding: "10px 12px", borderLeft: `3px solid ${srcColor}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {/* Source icon + avatar */}
                        <div style={{ position: "relative" }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: e.unread ? srcColor : C.border,
                            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700,
                            color: e.unread ? "#fff" : C.muted, flexShrink: 0 }}>
                            {senderName(e.from).charAt(0).toUpperCase()}
                          </div>
                          <span style={{ position: "absolute", bottom: -2, right: -2, fontSize: 10 }}>{sourceIcon(e.source)}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontSize: 12, fontWeight: e.unread ? 700 : 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {senderName(e.from)}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, marginLeft: 6 }}>
                              <span style={{ fontSize: 8, fontWeight: 600, color: srcColor, background: srcColor + "18", borderRadius: 8, padding: "1px 5px" }}>
                                {SOURCES.find(s => s.id === e.source)?.label || e.source}
                              </span>
                              <span style={{ fontSize: 9, color: C.muted }}>{e.date ? new Date(e.date).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) : ""}</span>
                            </div>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: e.unread ? 600 : 400, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {e.subject || "(Không có chủ đề)"}
                          </div>
                          {!isExpanded && (
                            <div style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                              {e.snippet}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 10, color: C.muted, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform .2s", flexShrink: 0 }}>▶</span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ background: C.card, borderRadius: "0 0 12px 12px", border: `1px solid ${C.border}`, borderTop: "none", padding: "10px 12px" }}>
                        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6, marginBottom: 10 }}>{e.snippet}</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                          <span style={{ fontSize: 10, background: srcColor + "15", color: srcColor, borderRadius: 8, padding: "2px 8px", fontWeight: 600 }}>
                            {sourceIcon(e.source)} {SOURCES.find(s => s.id === e.source)?.label}
                          </span>
                          {e.unread && <span style={{ fontSize: 10, background: C.red + "15", color: C.red, borderRadius: 8, padding: "2px 8px", fontWeight: 600 }}>Chưa đọc</span>}
                          {e.labels?.includes("IMPORTANT") && <span style={{ fontSize: 10, background: C.gold + "15", color: C.gold, borderRadius: 8, padding: "2px 8px", fontWeight: 600 }}>Quan trọng</span>}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="tap" onClick={() => {
                            addTask({
                              title: `Phản hồi: ${e.subject || senderName(e.from)}`,
                              priority: "trung",
                              deadline: todayStr(),
                              category: "Email",
                              notes: `Từ: ${e.from}\n${e.snippet}`,
                            });
                          }}
                            style={{ flex: 1, background: C.accent + "15", color: C.accent, border: `1px solid ${C.accent}33`, borderRadius: 8, padding: "7px", fontSize: 11, fontWeight: 600 }}>
                            + Tạo việc
                          </button>
                          <button className="tap" onClick={() => {
                            navigator.clipboard?.writeText(`${e.subject}\n${e.from}\n${e.snippet}`);
                          }}
                            style={{ background: C.purple + "15", color: C.purple, border: `1px solid ${C.purple}33`, borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 600 }}>
                            📋
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── WORY SUMMARY ── */}
          {subTab === "summary" && (
            <div>
              {!summary && !classifying && (
                <div style={{ textAlign: "center", padding: 20 }}>
                  <button className="tap" onClick={() => classifyEmails(emails)}
                    disabled={!emails || classifying}
                    style={{ background: `linear-gradient(135deg,${C.accent},${C.purple})`, color: "#fff", border: "none", borderRadius: 14, padding: "14px 24px", fontSize: 15, fontWeight: 700, opacity: !emails ? 0.5 : 1 }}>
                    ✨ Wory phân tích email
                  </button>
                  {!emails && <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Tải email trước khi phân tích</div>}
                </div>
              )}
              {classifying && !summary?.text && (
                <div style={{ textAlign: "center", padding: 20 }}>
                  <div className="dots"><span /><span /><span /></div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Wory đang phân tích email...</div>
                </div>
              )}
              {summary?.text && (
                <div>
                  <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, padding: "14px", maxHeight: 600, overflowY: "auto", fontSize: 13, lineHeight: 1.7, color: C.text }}>
                    <MdBlock text={summary.text} />
                    {summary.loading && <span style={{ display: "inline-block", width: 2, height: 14, background: C.accent, marginLeft: 2, animation: "blink 1s infinite", verticalAlign: "text-bottom" }} />}
                  </div>
                  {!summary.loading && (
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button className="tap" onClick={() => classifyEmails(emails)}
                        style={{ flex: 1, background: `${C.accent}15`, color: C.accent, border: `1px solid ${C.accent}33`, borderRadius: 10, padding: "8px", fontSize: 12, fontWeight: 600 }}>
                        Phân tích lại
                      </button>
                      <button className="tap" onClick={() => {
                        if (navigator.share) { navigator.share({ title: "WorkFlow - Email", text: summary.text.replace(/[#*`]/g, "") }); }
                        else { navigator.clipboard?.writeText(summary.text); }
                      }}
                        style={{ flex: 1, background: `${C.purple}15`, color: C.purple, border: `1px solid ${C.purple}33`, borderRadius: 10, padding: "8px", fontSize: 12, fontWeight: 600 }}>
                        📤 Chia sẻ
                      </button>
                    </div>
                  )}
                  {summary.ts && !summary.loading && (
                    <div style={{ fontSize: 10, color: C.muted, textAlign: "center", marginTop: 8 }}>
                      Cập nhật: {new Date(summary.ts).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── QUICK ACTIONS ── */}
          {subTab === "actions" && (
            <div>
              {/* Quick stats */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 1, background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "12px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.accent }}>{emails?.length || 0}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Tổng email</div>
                </div>
                <div style={{ flex: 1, background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "12px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.red }}>{emails?.filter(e => e.unread).length || 0}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Chưa đọc</div>
                </div>
                <div style={{ flex: 1, background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "12px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.green }}>{tasks.filter(t => t.status === "done").length}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Task xong</div>
                </div>
              </div>

              {/* Quick actions for executives */}
              <SL>HÀNH ĐỘNG NHANH</SL>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                {[
                  { icon: "📊", label: "Báo cáo email", desc: "Wory tổng hợp", action: () => { setSubTab("summary"); if (!summary) classifyEmails(emails); } },
                  { icon: "📋", label: "Danh sách email", desc: "Xem tất cả", action: () => setSubTab("email") },
                  { icon: "🔄", label: "Làm mới", desc: "Tải email mới", action: fetchEmails },
                  { icon: "📤", label: "Chia sẻ", desc: "Gửi báo cáo", action: () => {
                    if (summary?.text) {
                      if (navigator.share) navigator.share({ title: "Email Report", text: summary.text.replace(/[#*`]/g, "") });
                      else navigator.clipboard?.writeText(summary.text || "");
                    }
                  }},
                ].map((a, i) => (
                  <button key={i} className="tap" onClick={a.action}
                    style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>{a.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{a.label}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{a.desc}</div>
                  </button>
                ))}
              </div>

              {/* Source overview */}
              <SL>NGUỒN THÔNG TIN</SL>
              <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "12px", marginBottom: 14 }}>
                {SOURCES.filter(s => s.id !== "all").map(s => {
                  const count = sourceCounts[s.id];
                  const connMap = { email: !!gmailData?.email, telegram: !!tgData?.botUsername, messenger: !!messengerData?.pageId, zalo: !!zaloData?.oaId, instagram: false };
                  const connected = connMap[s.id] || false;
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: `1px solid ${C.border}22` }}>
                      <span style={{ fontSize: 20 }}>{s.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.label}</div>
                        <div style={{ fontSize: 10, color: C.muted }}>
                          {connected ? `Đã kết nối · ${count} tin` : "Chưa kết nối"}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: connected ? C.green : C.muted,
                        background: connected ? C.green + "18" : C.border, borderRadius: 8, padding: "3px 8px" }}>
                        {connected ? "Hoạt động" : (s.id === "instagram" || s.id === "messenger") ? "Sắp có" : "Cài đặt"}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize: 11, color: C.muted, textAlign: "center", marginTop: 8 }}>
                Vào <b>Cài đặt → Kết nối</b> để thêm nguồn thông tin
              </div>
            </div>
          )}
        </>
      )}
    </div>
      )}
    </div>
  );
}
