/* ExpenseForm — Wory expense chat + report section */
import { useState, useEffect, useRef, useCallback } from "react";
import { C, EXPENSE_CATEGORIES, PAYMENT_SOURCES, fmtMoney, todayStr } from "../../constants";
import { MdBlock } from "../../components";
import { callClaudeStream, loadJSON, saveJSON, decryptToken } from "../../services";

export default function ExpenseForm({
  CATS, allExpenses, byCat, totalMonth, totalToday, totalPaid, totalUnpaid,
  budget, budgetPct, settings, user, addExpense,
  woryReport, setWoryReport, woryLoading, setWoryLoading,
}) {
  const [chatMsgs, setChatMsgs] = useState(() => loadJSON("expense_chat", []));
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const voiceRecRef = useRef(null);
  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);

  useEffect(() => {
    if (chatMsgs.length > 0) saveJSON("expense_chat", chatMsgs.slice(-50));
  }, [chatMsgs]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs, chatLoading]);

  const parseExpenseCommands = useCallback((text) => {
    const regex = /\[EXPENSE:(.+?)\|(\d+)\|(\w+)\]/g;
    let match;
    const added = [];
    while ((match = regex.exec(text)) !== null) {
      const desc = match[1].trim();
      const amount = parseInt(match[2]);
      const cat = match[3];
      if (amount > 0) {
        addExpense({
          id: Date.now() + Math.random(),
          description: desc,
          amount,
          category: Object.keys(CATS).includes(cat) ? cat : Object.keys(CATS)[0] || "other",
          source: "cash",
          date: todayStr(),
          paid: true,
        });
        added.push({ desc, amount, cat });
      }
    }
    return { cleanText: text.replace(/\[EXPENSE:.+?\]/g, "").trim(), added };
  }, [addExpense, CATS]);

  const toggleVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Trinh duyet khong ho tro ghi am"); return; }
    if (voiceOn) {
      voiceRecRef.current?.stop();
      voiceRecRef.current = null;
      setVoiceOn(false);
      return;
    }
    const rec = new SR();
    rec.lang = "vi-VN";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setChatInput(text);
    };
    rec.onerror = () => { setVoiceOn(false); voiceRecRef.current = null; };
    rec.onend = () => { setVoiceOn(false); voiceRecRef.current = null; };
    rec.start();
    voiceRecRef.current = rec;
    setVoiceOn(true);
  }, [voiceOn]);

  const sendExpenseChat = useCallback(async (override) => {
    const msg = (override || chatInput).trim();
    if (!msg || chatLoading) return;
    setChatInput("");

    const shortName = (settings?.displayName || user?.name || "Sep").split(" ").pop();
    const history = [...chatMsgs, { role: "user", content: msg, ts: Date.now() }];
    setChatMsgs([...history, { role: "assistant", content: "", ts: Date.now() }]);
    setChatLoading(true);

    // Build expense context
    const todayExp = allExpenses.filter(e => e.date === todayStr());
    const todayTotal = todayExp.reduce((s, e) => s + e.amount, 0);
    const todayList = todayExp.length > 0
      ? todayExp.map(e => `- ${e.description || e.taskTitle}: ${fmtMoney(e.amount)} (${CATS[e.category]?.label || e.category}${e.paid ? "" : ", CHUA CHI"})`).join("\n")
      : "Chua co khoan chi nao.";

    const monthList = byCat.map(([k, v]) => `- ${CATS[k]?.label || k}: ${fmtMoney(v)}`).join("\n");

    // Extract what was recorded in THIS chat session
    const chatRecorded = [];
    history.forEach(m => {
      if (m.role === "assistant" && m.content) {
        const r = /\u0110\u00e3 ghi.+?(\d[\d,.]*)\s*(k|ngh\u00ecn|ng\u00e0n|\u0111|dong|\u0111\u1ed3ng)?/gi;
        let rm; while ((rm = r.exec(m.content)) !== null) chatRecorded.push(rm[0]);
      }
    });
    const chatRecordedText = chatRecorded.length > 0
      ? `\nDA GHI TRONG PHIEN CHAT NAY:\n${chatRecorded.map(r => `- ${r}`).join("\n")}`
      : "";

    // Last 7 days summary
    const last7 = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      const dayExp = allExpenses.filter(e => e.date === ds);
      if (dayExp.length > 0) {
        const total = dayExp.reduce((s, e) => s + e.amount, 0);
        last7.push(`${ds}: ${fmtMoney(total)} (${dayExp.length} khoan)`);
      }
    }
    const last7Text = last7.length > 0 ? `\n7 NGAY QUA:\n${last7.join("\n")}` : "";

    const system = `Ban la Wory — tro ly tai chinh cua ${shortName}. Noi tieng Viet co dau, tu nhien nhu nhan tin.
Hom nay: ${todayStr()}, ${new Date().getHours()}:${String(new Date().getMinutes()).padStart(2,"0")}.

VAI TRO CHINH: Thu ky tai chinh — ghi chep, nho, tong hop chi tieu hang ngay.
${shortName} se noi cac khoan chi, ban GHI LAI giup va NHO TOAN BO.

LENH GHI CHI TIEU — BAT BUOC khi ${shortName} de cap khoan chi:
  [EXPENSE:mo_ta|so_tien|danh_muc]
  - danh_muc: work / relationship / family / personal / other
  - so_tien: CHI SO NGUYEN, don vi DONG (50k = 50000, 200 nghin = 200000, 1.5 trieu = 1500000)
  - Vi du: "an trua 50k" \u2192 [EXPENSE:\u0102n tr\u01b0a|50000|personal]
  - Vi du: "gui qua doi tac 500k" \u2192 [EXPENSE:G\u1eed\u0069 qu\u00e0 \u0111\u1ed1i t\u00e1c|500000|relationship]
  - Co the ghi NHIEU khoan 1 luc, moi khoan 1 lenh [EXPENSE:...] rieng

PHAN LOAI TU DONG:
- an uong, ca phe, nuoc, an sang, an trua, an toi \u2192 personal
- xang, taxi, grab, di lai, gui xe \u2192 personal
- tiep khach, qua tang, hoa, doi tac, an voi khach \u2192 relationship
- com gia dinh, sach vo con, di cho, tien nha \u2192 family
- van phong pham, in an, ship hang, cong cu, hop \u2192 work
- khac \u2192 other

SAU KHI GHI:
- Xac nhan NGAN GON va RO RANG: "\u0110\u00e3 ghi: \u0102n tr\u01b0a 50,000\u0111 (C\u00e1 nh\u00e2n). T\u1ed5ng h\u00f4m nay: XXX\u0111. C\u00f2n g\u00ec n\u1eefa kh\u00f4ng?"
- LUON kem theo TONG HOM NAY sau moi lan ghi de ${shortName} nam duoc
- Neu khong ro so tien \u2192 HOI LAI, KHONG doan

GHI NHO & TONG HOP — QUAN TRONG:
- Ban PHAI NHO toan bo lich su chat va nhung gi da ghi
- Khi ${shortName} hoi "hom nay chi bao nhieu?", "tong ket" \u2192 liet ke TUNG khoan + tong + so sanh thang
- Khi ${shortName} hoi "thang nay" \u2192 phan tich theo tung loai (ca nhan, cong viec, gia dinh, quan he)
- Khi ${shortName} hoi "tuan nay" hoac "may ngay qua" \u2192 dung du lieu 7 NGAY QUA ben duoi
- Neu ${shortName} noi "sai roi", "sua lai" \u2192 chi ${shortName} vao tab Chi tiet de xoa/sua
- Chu dong nhac neu chi nhieu bat thuong: "Hom nay ${shortName} chi kha nhieu roi nha"
${budget > 0 ? `- NGAN SACH THANG: ${fmtMoney(budget)} (da dung ${budgetPct}%). Neu vuot 80% \u2192 CANH BAO ro rang` : ""}

PHONG CACH:
- Ngan gon, than thien, nhu ban be
- Xung "t\u00f4i", goi "${shortName}"
- Sau moi lan ghi \u2192 nhac tong ngay, khong dai dong
- Khi tong ket \u2192 dung so lieu chinh xac tu data ben duoi, KHONG bua

=== DU LIEU THUC TE ===

TAT CA CHI TIEU HOM NAY — ${todayStr()} (${fmtMoney(todayTotal)}):
${todayList}
${chatRecordedText}

THANG NAY (${fmtMoney(totalMonth)}):
${monthList || "Chua co du lieu."}
Da chi: ${fmtMoney(totalPaid)} | Chua chi: ${fmtMoney(totalUnpaid)}
${last7Text}`;

    try {
      let fullText = "";
      await callClaudeStream(
        system,
        history.map(m => ({ role: m.role, content: m.content })),
        (partial) => {
          fullText = partial;
          setChatMsgs(prev => {
            const u = [...prev];
            u[u.length - 1] = { ...u[u.length - 1], content: partial };
            return u;
          });
        },
        800
      );
      const { cleanText } = parseExpenseCommands(fullText);
      if (cleanText !== fullText) {
        setChatMsgs(prev => {
          const u = [...prev];
          u[u.length - 1] = { ...u[u.length - 1], content: cleanText };
          return u;
        });
      }
    } catch {
      setChatMsgs(prev => {
        const u = [...prev];
        u[u.length - 1] = { role: "assistant", content: "Loi ket noi. Thu lai nhe.", ts: Date.now() };
        return u;
      });
    }
    setChatLoading(false);
  }, [chatInput, chatLoading, chatMsgs, allExpenses, byCat, totalMonth, budget, budgetPct, totalPaid, totalUnpaid, settings, user, parseExpenseCommands, CATS]);

  // Generate wory report
  const generateWoryReport = useCallback(async () => {
    if (woryLoading) return;
    setWoryLoading(true);
    setWoryReport(null);

    const shortName = (settings?.displayName || user?.name || "Sep").split(" ").pop();
    const todayExpenses = allExpenses.filter(e => e.date === todayStr());
    const expenseData = todayExpenses.length > 0
      ? todayExpenses.map(e => `- ${e.taskTitle}: ${fmtMoney(e.amount)} (${CATS[e.category]?.label || e.category}, ${PAYMENT_SOURCES[e.source]?.label || e.source}${e.paid ? ", da chi" : ", chua chi"})`).join("\n")
      : "Chua co khoan chi nao hom nay.";

    const monthData = byCat.map(([k, v]) => `- ${CATS[k]?.label || k}: ${fmtMoney(v)}`).join("\n");

    const system = `Ban la Wory — thu ky tai chinh cua ${shortName} (lanh dao/giam doc).
Tong hop chi tieu hang ngay, nhan xet va tu van. Viet tieng Viet co dau, markdown.
KHONG chao hoi, di thang vao noi dung.`;

    const prompt = `TONG KET CHI TIEU NGAY ${todayStr()} cho ${shortName}:

CHI TIEU HOM NAY:
${expenseData}
Tong hom nay: ${fmtMoney(totalToday)}

CHI TIEU THANG NAY:
${monthData}
Tong thang: ${fmtMoney(totalMonth)}
${budget > 0 ? `Ngan sach: ${fmtMoney(budget)} (da dung ${budgetPct}%)` : "Chua dat ngan sach"}
Da chi: ${fmtMoney(totalPaid)} | Chua chi: ${fmtMoney(totalUnpaid)}

FORMAT:
## T\u1ed5ng k\u1ebft chi ti\u00eau ${todayStr()}
- T\u00f3m t\u1eaft ng\u1eafn 2-3 d\u00f2ng

## H\u00f4m nay chi ${fmtMoney(totalToday)}
- Li\u1ec7t k\u00ea t\u1eebng kho\u1ea3n + nh\u1eadn x\u00e9t

## Th\u00e1ng n\u00e0y: ${fmtMoney(totalMonth)}
- Ph\u00e2n t\u00edch theo lo\u1ea1i
${budget > 0 ? `- So v\u1edbi ng\u00e2n s\u00e1ch: ${budgetPct}%\n- D\u1ef1 b\u00e1o cu\u1ed1i th\u00e1ng` : ""}

## Nh\u1eadn x\u00e9t & G\u1ee3i \u00fd
- Wory nh\u1eadn x\u00e9t 2-3 \u0111i\u1ec3m
- G\u1ee3i \u00fd ti\u1ebft ki\u1ec7m n\u1ebfu c\u00f3

## H\u1ecfi l\u1ea1i ${shortName}
- C\u00f2n kho\u1ea3n chi n\u00e0o ch\u01b0a ghi kh\u00f4ng?
- C\u1ea7n ch\u1ec9nh s\u1eeda g\u00ec kh\u00f4ng?`;

    try {
      let fullText = "";
      await callClaudeStream(system, [{ role: "user", content: prompt }],
        (partial) => { fullText = partial; setWoryReport({ text: partial, ts: Date.now(), loading: true }); }, 2000);
      const final = { text: fullText, ts: Date.now(), loading: false };
      setWoryReport(final);
      saveJSON("expense_wory_report", final);
    } catch {
      setWoryReport({ text: "Loi ket noi. Vui long thu lai.", ts: Date.now(), loading: false });
    }
    setWoryLoading(false);
  }, [woryLoading, allExpenses, totalToday, byCat, totalMonth, budget, budgetPct, totalPaid, totalUnpaid, settings, user, CATS, setWoryReport, setWoryLoading]);

  // Send email report
  const sendEmailReport = useCallback(async () => {
    if (sendingEmail || !woryReport?.text) return;
    setSendingEmail(true);
    try {
      const encStr = localStorage.getItem("wf_gmail_enc");
      if (!encStr) { alert("Chua ket noi Gmail. Vao Cai dat \u2192 Ket noi."); setSendingEmail(false); return; }
      const tokenData = await decryptToken(encStr, user?.id || "default");
      if (!tokenData?.refresh_token) { alert("Token het han. Ket noi lai Gmail."); setSendingEmail(false); return; }

      const res = await fetch("/api/send-expense-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refresh_token: tokenData.refresh_token,
          to: tokenData.email || user?.id,
          subject: `[WorkFlow] B\u00e1o c\u00e1o chi ti\u00eau ${todayStr()}`,
          body: woryReport.text.replace(/[#*`]/g, "").replace(/\n/g, "<br>"),
        }),
      });
      const data = await res.json();
      if (data.success) { setEmailSent(true); setTimeout(() => setEmailSent(false), 3000); }
      else alert(data.error || "Loi gui email");
    } catch { alert("Loi ket noi"); }
    setSendingEmail(false);
  }, [sendingEmail, woryReport, user]);

  const quickPhrases = ["T\u1ed5ng k\u1ebft h\u00f4m nay", "Th\u00e1ng n\u00e0y chi bao nhi\u00eau?", "H\u00f4m nay t\u00f4i qu\u00ean ghi m\u1ea5y kho\u1ea3n"];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 400 }}>
      {/* Chat messages */}
      <div style={{ flex: 1, overflowY: "auto", maxHeight: "55vh", marginBottom: 8, padding: "4px 0" }}>
        {chatMsgs.length === 0 && (
          <div style={{ textAlign: "center", padding: "20px 12px" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>{"\u{1F4AC}\u{1F4B0}"}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Chat chi tieu</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
              Noi cho Wory nhung khoan chi trong ngay.<br/>
              VD: "an trua 50k", "do xang 200k", "ca phe voi khach 80k"
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
              {quickPhrases.map(p => (
                <button key={p} className="tap" onClick={() => sendExpenseChat(p)}
                  style={{ background: `${C.gold}12`, border: `1px solid ${C.gold}33`, borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: C.gold }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatMsgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 6, padding: "0 4px" }}>
            <div style={{
              maxWidth: "82%",
              background: m.role === "user"
                ? `linear-gradient(135deg,${C.gold},${C.accent})`
                : C.card,
              color: m.role === "user" ? "#fff" : C.text,
              borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              padding: "10px 14px",
              fontSize: 13,
              lineHeight: 1.6,
              border: m.role === "user" ? "none" : `1px solid ${C.border}`,
              boxShadow: "0 1px 3px rgba(0,0,0,.06)",
            }}>
              {m.role === "assistant" ? <MdBlock text={m.content || ""} /> : m.content}
              {m.role === "assistant" && !m.content && chatLoading && i === chatMsgs.length - 1 && (
                <span className="dots" style={{ display: "inline-flex", gap: 3 }}><span /><span /><span /></span>
              )}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Quick chips when there are messages */}
      {chatMsgs.length > 0 && !chatLoading && (
        <div className="no-scrollbar" style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 6, padding: "0 2px" }}>
          {["T\u1ed5ng k\u1ebft h\u00f4m nay", "C\u00f2n g\u00ec qu\u00ean ghi kh\u00f4ng?"].map(p => (
            <button key={p} className="tap" onClick={() => sendExpenseChat(p)}
              style={{ flexShrink: 0, background: `${C.gold}10`, border: `1px solid ${C.gold}22`, borderRadius: 16, padding: "4px 12px", fontSize: 11, fontWeight: 600, color: C.gold }}>
              {p}
            </button>
          ))}
          <button className="tap" onClick={() => { setChatMsgs([]); saveJSON("expense_chat", []); }}
            style={{ flexShrink: 0, background: `${C.red}08`, border: `1px solid ${C.red}22`, borderRadius: 16, padding: "4px 12px", fontSize: 11, fontWeight: 600, color: C.red }}>
            Xoa chat
          </button>
        </div>
      )}

      {/* Voice indicator */}
      {voiceOn && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.red, animation: "blink 1s infinite" }} />
          <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>Dang nghe...</span>
        </div>
      )}

      {/* Input */}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
        <button className="tap" onClick={toggleVoice} disabled={chatLoading}
          style={{
            width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
            background: voiceOn ? C.red : `${C.accent}15`,
            color: voiceOn ? "#fff" : C.accent,
            border: voiceOn ? "none" : `1px solid ${C.accent}33`,
            fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: voiceOn ? `0 0 0 4px ${C.red}30` : "none",
            transition: "all .2s",
          }}>
          {"\u{1F399}"}
        </button>
        <input
          ref={chatInputRef}
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendExpenseChat(); } }}
          placeholder="VD: an trua 50k, do xang 200k..."
          disabled={chatLoading}
          style={{
            flex: 1, background: C.card, border: `1px solid ${voiceOn ? C.red : C.border}`, borderRadius: 22,
            padding: "10px 16px", fontSize: 14, color: C.text, outline: "none",
            transition: "border-color .2s",
          }}
        />
        <button className="tap" onClick={() => sendExpenseChat()} disabled={!chatInput.trim() || chatLoading}
          style={{
            width: 42, height: 42, borderRadius: "50%",
            background: chatInput.trim() && !chatLoading ? `linear-gradient(135deg,${C.gold},${C.accent})` : C.border,
            color: "#fff", border: "none", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
          {"\u2191"}
        </button>
      </div>

      {/* Old report section - compact */}
      {woryReport?.text && (
        <div style={{ marginTop: 12, background: `${C.gold}08`, borderRadius: 12, border: `1px solid ${C.gold}22`, padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.gold }}>{"\u{1F4CA}"} Bao cao gan nhat</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="tap" onClick={generateWoryReport} disabled={woryLoading}
                style={{ background: "none", border: "none", fontSize: 11, color: C.gold, fontWeight: 600, padding: "2px 6px" }}>
                {woryLoading ? "..." : "Lam moi"}
              </button>
              {settings?.sendExpenseEmail && (
                <button className="tap" onClick={sendEmailReport} disabled={sendingEmail}
                  style={{ background: "none", border: "none", fontSize: 11, color: C.accent, fontWeight: 600, padding: "2px 6px" }}>
                  {sendingEmail ? "..." : emailSent ? "\u2713" : "\u{1F4E7}"}
                </button>
              )}
            </div>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6, color: C.text, maxHeight: 150, overflowY: "auto" }}>
            <MdBlock text={woryReport.text} />
          </div>
        </div>
      )}
    </div>
  );
}
