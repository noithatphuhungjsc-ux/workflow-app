/* ================================================================
   EXPENSE TAB — Quản lý chi tiêu liên kết với công việc
   Features: tổng hợp, phân loại, nguồn, Wory chat chi tiêu, gửi email
   ================================================================ */
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { C, EXPENSE_CATEGORIES, PAYMENT_SOURCES, fmtMoney, todayStr, MONTH_NAMES } from "../constants";
import { SL, MdBlock } from "../components";
import { callClaudeStream, loadJSON, saveJSON, decryptToken } from "../services";

export default function ExpenseTab({ tasks, expenses = [], addExpense, deleteExpense, settings, user, onOpenQR }) {
  // Industry preset override expense categories
  const CATS = settings.industryExpenseCategories || EXPENSE_CATEGORIES;
  const [subTab, setSubTab] = useState("overview"); // overview | list | wory
  const [filterCat, setFilterCat] = useState("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newCat, setNewCat] = useState("personal");
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [woryReport, setWoryReport] = useState(() => loadJSON("expense_wory_report", null));
  const [woryLoading, setWoryLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Chat chi tiêu state
  const [chatMsgs, setChatMsgs] = useState(() => loadJSON("expense_chat", []));
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const voiceRecRef = useRef(null);
  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);

  // Merge: standalone expenses + task expenses
  const allExpenses = useMemo(() => {
    // Standalone expenses
    const standalone = expenses.map(e => ({
      id: e.id,
      type: "standalone",
      taskId: e.taskId || null,
      taskTitle: e.taskTitle || "",
      description: e.description || "",
      amount: e.amount || 0,
      category: e.category || "other",
      source: e.source || "cash",
      date: e.date || todayStr(),
      paid: e.paid !== false,
      billPhoto: e.billPhoto || null,
    }));
    // Task expenses (not already in standalone)
    const standaloneTaskIds = new Set(standalone.filter(e => e.taskId).map(e => e.taskId));
    const fromTasks = [];
    tasks.filter(t => t.expense?.amount > 0 && !t.deleted && !standaloneTaskIds.has(t.id)).forEach(t => {
      const items = t.expense.items;
      if (items && items.length > 0) {
        items.forEach(item => {
          if (item.amount > 0) fromTasks.push({
            id: `${t.id}-${item.id}`, type: "task", taskId: t.id, taskTitle: t.title,
            description: item.desc || "", amount: item.amount, category: item.category || "other",
            source: "cash", date: t.expense.date || t.deadline || todayStr(), paid: !!item.paid, billPhoto: null,
          });
        });
      } else {
        fromTasks.push({
          id: t.id, type: "task", taskId: t.id, taskTitle: t.title,
          description: t.expense.description || "", amount: t.expense.amount,
          category: t.expense.category || "other", source: t.expense.source || "cash",
          date: t.expense.date || t.deadline || todayStr(), paid: !!t.expense.paid, billPhoto: null,
        });
      }
    });
    return [...standalone, ...fromTasks].sort((a, b) => b.date.localeCompare(a.date));
  }, [tasks, expenses]);

  // Filter by month
  const monthExpenses = useMemo(() => {
    return allExpenses.filter(e => e.date?.startsWith(filterMonth));
  }, [allExpenses, filterMonth]);

  // Filter by category
  const filtered = filterCat === "all" ? monthExpenses : monthExpenses.filter(e => e.category === filterCat);

  // Stats
  const totalMonth = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const totalPaid = monthExpenses.filter(e => e.paid).reduce((s, e) => s + e.amount, 0);
  const totalUnpaid = totalMonth - totalPaid;
  const budget = settings?.monthlyBudget || 0;
  const budgetPct = budget > 0 ? Math.min(Math.round(totalMonth / budget * 100), 100) : 0;

  // Group by category
  const byCat = useMemo(() => {
    const map = {};
    monthExpenses.forEach(e => {
      if (!map[e.category]) map[e.category] = 0;
      map[e.category] += e.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [monthExpenses]);

  // Group by source
  const bySource = useMemo(() => {
    const map = {};
    monthExpenses.forEach(e => {
      if (!map[e.source]) map[e.source] = 0;
      map[e.source] += e.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [monthExpenses]);

  // Today's expenses
  const todayExpenses = allExpenses.filter(e => e.date === todayStr());
  const totalToday = todayExpenses.reduce((s, e) => s + e.amount, 0);

  // Month selector
  const months = useMemo(() => {
    const ms = [];
    const d = new Date();
    for (let i = 0; i < 6; i++) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      ms.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
    }
    return ms;
  }, []);
  const monthLabel = (m) => {
    const [y, mo] = m.split("-");
    return `${MONTH_NAMES[parseInt(mo) - 1]} ${y}`;
  };

  // Wory daily expense report
  const generateWoryReport = useCallback(async () => {
    if (woryLoading) return;
    setWoryLoading(true);
    setWoryReport(null);

    const shortName = (settings?.displayName || user?.name || "Sếp").split(" ").pop();
    const expenseData = todayExpenses.length > 0
      ? todayExpenses.map(e => `- ${e.taskTitle}: ${fmtMoney(e.amount)} (${CATS[e.category]?.label || e.category}, ${PAYMENT_SOURCES[e.source]?.label || e.source}${e.paid ? ", đã chi" : ", chưa chi"})`).join("\n")
      : "Chưa có khoản chi nào hôm nay.";

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
## Tổng kết chi tiêu ${todayStr()}
- Tóm tắt ngắn 2-3 dòng

## Hôm nay chi ${fmtMoney(totalToday)}
- Liệt kê từng khoản + nhận xét

## Tháng này: ${fmtMoney(totalMonth)}
- Phân tích theo loại
${budget > 0 ? `- So với ngân sách: ${budgetPct}%\n- Dự báo cuối tháng` : ""}

## Nhận xét & Gợi ý
- Wory nhận xét 2-3 điểm
- Gợi ý tiết kiệm nếu có

## Hỏi lại ${shortName}
- Còn khoản chi nào chưa ghi không?
- Cần chỉnh sửa gì không?`;

    try {
      let fullText = "";
      await callClaudeStream(system, [{ role: "user", content: prompt }],
        (partial) => { fullText = partial; setWoryReport({ text: partial, ts: Date.now(), loading: true }); }, 2000);
      const final = { text: fullText, ts: Date.now(), loading: false };
      setWoryReport(final);
      saveJSON("expense_wory_report", final);
    } catch {
      setWoryReport({ text: "Lỗi kết nối. Vui lòng thử lại.", ts: Date.now(), loading: false });
    }
    setWoryLoading(false);
  }, [woryLoading, todayExpenses, totalToday, byCat, totalMonth, budget, budgetPct, totalPaid, totalUnpaid, settings, user]);

  // Send email report
  const sendEmailReport = useCallback(async () => {
    if (sendingEmail || !woryReport?.text) return;
    setSendingEmail(true);
    try {
      const encStr = localStorage.getItem("wf_gmail_enc");
      if (!encStr) { alert("Chưa kết nối Gmail. Vào Cài đặt → Kết nối."); setSendingEmail(false); return; }
      const tokenData = await decryptToken(encStr, user?.id || "default");
      if (!tokenData?.refresh_token) { alert("Token hết hạn. Kết nối lại Gmail."); setSendingEmail(false); return; }

      const res = await fetch("/api/send-expense-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refresh_token: tokenData.refresh_token,
          to: tokenData.email || user?.id,
          subject: `[WorkFlow] Báo cáo chi tiêu ${todayStr()}`,
          body: woryReport.text.replace(/[#*`]/g, "").replace(/\n/g, "<br>"),
        }),
      });
      const data = await res.json();
      if (data.success) { setEmailSent(true); setTimeout(() => setEmailSent(false), 3000); }
      else alert(data.error || "Lỗi gửi email");
    } catch { alert("Lỗi kết nối"); }
    setSendingEmail(false);
  }, [sendingEmail, woryReport, user]);

  // ── Expense Chat ──
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
  }, [addExpense]);

  const toggleVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Trình duyệt không hỗ trợ ghi âm"); return; }
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

    const shortName = (settings?.displayName || user?.name || "Sếp").split(" ").pop();
    const history = [...chatMsgs, { role: "user", content: msg, ts: Date.now() }];
    setChatMsgs([...history, { role: "assistant", content: "", ts: Date.now() }]);
    setChatLoading(true);

    // Build expense context — FULL data
    const todayExp = allExpenses.filter(e => e.date === todayStr());
    const todayTotal = todayExp.reduce((s, e) => s + e.amount, 0);
    const todayList = todayExp.length > 0
      ? todayExp.map(e => `- ${e.description || e.taskTitle}: ${fmtMoney(e.amount)} (${CATS[e.category]?.label || e.category}${e.paid ? "" : ", CHUA CHI"})`).join("\n")
      : "Chua co khoan chi nao.";

    const monthList = byCat.map(([k, v]) => `- ${CATS[k]?.label || k}: ${fmtMoney(v)}`).join("\n");

    // Extract what was recorded in THIS chat session from chat history
    const chatRecorded = [];
    history.forEach(m => {
      if (m.role === "assistant" && m.content) {
        const r = /Đã ghi.+?(\d[\d,.]*)\s*(k|nghìn|ngàn|đ|dong|đồng)?/gi;
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
  - Vi du: "an trua 50k" → [EXPENSE:Ăn trưa|50000|personal]
  - Vi du: "gui qua doi tac 500k" → [EXPENSE:Gửi quà đối tác|500000|relationship]
  - Co the ghi NHIEU khoan 1 luc, moi khoan 1 lenh [EXPENSE:...] rieng

PHAN LOAI TU DONG:
- an uong, ca phe, nuoc, an sang, an trua, an toi → personal
- xang, taxi, grab, di lai, gui xe → personal
- tiep khach, qua tang, hoa, doi tac, an voi khach → relationship
- com gia dinh, sach vo con, di cho, tien nha → family
- van phong pham, in an, ship hang, cong cu, hop → work
- khac → other

SAU KHI GHI:
- Xac nhan NGAN GON va RO RANG: "Đã ghi: Ăn trưa 50,000đ (Cá nhân). Tổng hôm nay: XXXđ. Còn gì nữa không?"
- LUON kem theo TONG HOM NAY sau moi lan ghi de ${shortName} nam duoc
- Neu khong ro so tien → HOI LAI, KHONG doan

GHI NHO & TONG HOP — QUAN TRONG:
- Ban PHAI NHO toan bo lich su chat va nhung gi da ghi
- Khi ${shortName} hoi "hom nay chi bao nhieu?", "tong ket" → liet ke TU NG khoan + tong + so sanh thang
- Khi ${shortName} hoi "thang nay" → phan tich theo tung loai (ca nhan, cong viec, gia dinh, quan he)
- Khi ${shortName} hoi "tuan nay" hoac "may ngay qua" → dung du lieu 7 NGAY QUA ben duoi
- Neu ${shortName} noi "sai roi", "sua lai" → chi ${shortName} vao tab Chi tiet de xoa/sua
- Chu dong nhac neu chi nhieu bat thuong: "Hom nay ${shortName} chi kha nhieu roi nha"
${budget > 0 ? `- NGAN SACH THANG: ${fmtMoney(budget)} (da dung ${budgetPct}%). Neu vuot 80% → CANH BAO ro rang` : ""}

PHONG CACH:
- Ngan gon, than thien, nhu ban be
- Xung "tôi", goi "${shortName}"
- Sau moi lan ghi → nhac tong ngay, khong dai dong
- Khi tong ket → dung so lieu chinh xac tu data ben duoi, KHONG bua

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
      // Parse expense commands
      const { cleanText, added } = parseExpenseCommands(fullText);
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
        u[u.length - 1] = { role: "assistant", content: "Lỗi kết nối. Thử lại nhé.", ts: Date.now() };
        return u;
      });
    }
    setChatLoading(false);
  }, [chatInput, chatLoading, chatMsgs, allExpenses, byCat, totalMonth, budget, budgetPct, settings, user, parseExpenseCommands]);

  const quickPhrases = ["Tổng kết hôm nay", "Tháng này chi bao nhiêu?", "Hôm nay tôi quên ghi mấy khoản"];

  return (
    <div style={{ animation: "fadeIn .2s" }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg,${C.goldD},rgba(212,144,10,0.08))`, borderRadius: 14, border: `1px solid ${C.gold}33`, padding: "12px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>💰</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Chi tiêu</div>
            <div style={{ fontSize: 12, color: C.sub }}>{monthLabel(filterMonth)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.gold }}>{fmtMoney(totalMonth)}</div>
            {budget > 0 && <div style={{ fontSize: 10, color: budgetPct > 80 ? C.red : C.muted }}>{budgetPct}% ngân sách</div>}
          </div>
        </div>
        {budget > 0 && (
          <div style={{ height: 4, background: C.border, borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${budgetPct}%`, background: budgetPct > 80 ? C.red : budgetPct > 50 ? C.gold : C.green, borderRadius: 2, transition: "width .3s" }} />
          </div>
        )}
      </div>

      {/* Sub tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {[["overview", "Tổng quan"], ["list", "Chi tiết"], ["wory", "💬 Ghi chép"]].map(([k, l]) => (
          <button key={k} className="tap" onClick={() => setSubTab(k)}
            style={{ flex: 1, background: subTab === k ? C.gold : C.card, color: subTab === k ? "#fff" : C.sub,
              border: `1px solid ${subTab === k ? C.gold : C.border}`, borderRadius: 10, padding: "7px 4px", fontSize: 11, fontWeight: 600 }}>
            {l}
          </button>
        ))}
      </div>

      {/* Month selector */}
      <div className="no-scrollbar" style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto" }}>
        {months.map(m => (
          <button key={m} className="tap" onClick={() => setFilterMonth(m)}
            style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, flexShrink: 0,
              background: filterMonth === m ? C.gold + "20" : C.card,
              color: filterMonth === m ? C.gold : C.muted,
              border: `1px solid ${filterMonth === m ? C.gold + "66" : C.border}` }}>
            {monthLabel(m)}
          </button>
        ))}
      </div>

      {/* ══════ OVERVIEW ══════ */}
      {subTab === "overview" && (
        <div>
          {/* Quick stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
            <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.gold }}>{fmtMoney(totalToday)}</div>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Hôm nay</div>
            </div>
            <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.green }}>{fmtMoney(totalPaid)}</div>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Đã chi</div>
            </div>
            <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "12px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.red }}>{fmtMoney(totalUnpaid)}</div>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Chưa chi</div>
            </div>
          </div>

          {/* By category */}
          <SL>PHÂN LOẠI CHI</SL>
          <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "12px", marginBottom: 14 }}>
            {byCat.length === 0 && <div style={{ textAlign: "center", padding: 12, color: C.muted, fontSize: 13 }}>Chưa có khoản chi</div>}
            {byCat.map(([k, v]) => {
              const cat = CATS[k] || { label: k, icon: "📦", color: C.muted };
              const pct = totalMonth > 0 ? Math.round(v / totalMonth * 100) : 0;
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}22` }}>
                  <span style={{ fontSize: 18 }}>{cat.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{cat.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: cat.color }}>{fmtMoney(v)}</span>
                    </div>
                    <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: cat.color, borderRadius: 2 }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, width: 30, textAlign: "right" }}>{pct}%</span>
                </div>
              );
            })}
          </div>

          {/* By source */}
          <SL>NGUỒN THANH TOÁN</SL>
          <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "12px", marginBottom: 14 }}>
            {bySource.length === 0 && <div style={{ textAlign: "center", padding: 12, color: C.muted, fontSize: 13 }}>Chưa có dữ liệu</div>}
            {bySource.map(([k, v]) => {
              const src = PAYMENT_SOURCES[k] || { label: k, icon: "💳" };
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}22` }}>
                  <span style={{ fontSize: 16 }}>{src.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.text }}>{src.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>{fmtMoney(v)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════ LIST ══════ */}
      {subTab === "list" && (
        <div>
          {/* Category filter */}
          <div className="no-scrollbar" style={{ display: "flex", gap: 4, marginBottom: 10, overflowX: "auto" }}>
            <button className="tap" onClick={() => setFilterCat("all")}
              style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, flexShrink: 0,
                background: filterCat === "all" ? C.accent + "20" : C.card, color: filterCat === "all" ? C.accent : C.muted,
                border: `1px solid ${filterCat === "all" ? C.accent + "66" : C.border}` }}>
              Tất cả ({monthExpenses.length})
            </button>
            {Object.entries(CATS).map(([k, v]) => {
              const cnt = monthExpenses.filter(e => e.category === k).length;
              if (cnt === 0) return null;
              return (
                <button key={k} className="tap" onClick={() => setFilterCat(k)}
                  style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, flexShrink: 0,
                    background: filterCat === k ? v.color + "20" : C.card, color: filterCat === k ? v.color : C.muted,
                    border: `1px solid ${filterCat === k ? v.color + "66" : C.border}` }}>
                  {v.icon} {v.label} ({cnt})
                </button>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: 24, color: C.muted, fontSize: 13 }}>Chưa có khoản chi nào</div>
          )}

          {filtered.map(e => {
            const cat = CATS[e.category] || { label: "Khác", icon: "📦", color: C.muted };
            const src = PAYMENT_SOURCES[e.source] || { label: e.source, icon: "💳" };
            const title = e.description || e.taskTitle || "Chi tiêu";
            const fmtD = (d) => { if (!d) return ""; const p = d.split("-"); return p.length === 3 ? `${p[2]}/${p[1]}` : d; };
            return (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 4,
                background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, borderLeft: `3px solid ${cat.color}` }}>
                <span style={{ fontSize: 20 }}>{cat.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
                  {e.taskTitle && e.description && (
                    <div style={{ fontSize: 10, color: C.accent, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📋 {e.taskTitle}</div>
                  )}
                  <div style={{ fontSize: 10, color: C.muted, display: "flex", gap: 6, marginTop: 2 }}>
                    <span>{fmtD(e.date)}</span>
                    <span>{src.icon} {src.label}</span>
                    {e.type === "standalone" && <span style={{ color: C.purple }}>✦ Tự do</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>{fmtMoney(e.amount)}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: e.paid ? C.green : C.red, background: e.paid ? C.greenD : C.redD, borderRadius: 6, padding: "1px 6px", marginTop: 2 }}>
                    {e.paid ? "Đã chi" : "Chưa chi"}
                  </div>
                  {e.type === "standalone" && deleteExpense && (
                    <span className="tap" onClick={() => deleteExpense(e.id)}
                      style={{ fontSize: 10, color: C.muted, cursor: "pointer", marginTop: 2, display: "inline-block" }}>×</span>
                  )}
                </div>
              </div>
            );
          })}

          {filtered.length > 0 && (
            <div style={{ textAlign: "center", padding: "10px", fontSize: 12, color: C.muted, fontWeight: 600 }}>
              Tổng: {fmtMoney(filtered.reduce((s, e) => s + e.amount, 0))} ({filtered.length} khoản)
            </div>
          )}

          {/* ── Add standalone expense + QR ── */}
          {!showAddForm ? (
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button className="tap" onClick={() => setShowAddForm(true)}
                style={{ flex: 1, background: `${C.gold}15`, border: `1px dashed ${C.gold}66`, borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 600, color: C.gold }}>
                + Thêm chi tiêu
              </button>
              {onOpenQR && (
                <button className="tap" onClick={onOpenQR}
                  style={{ background: `${C.accent}12`, border: `1px solid ${C.accent}33`, borderRadius: 12, padding: "12px 16px", fontSize: 18, cursor: "pointer" }}>
                  📱
                </button>
              )}
            </div>
          ) : (
            <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.gold}44`, padding: "12px", marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.gold, marginBottom: 8 }}>Chi tiêu khác</div>
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Mô tả (VD: cà phê, taxi...)"
                style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: C.text, marginBottom: 6 }} />
              <input type="text" inputMode="numeric" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="Số tiền (VNĐ)"
                style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, fontWeight: 700, color: C.gold, marginBottom: 6 }} />
              <div className="no-scrollbar" style={{ display: "flex", gap: 4, marginBottom: 8, overflowX: "auto" }}>
                {Object.entries(CATS).map(([k, v]) => (
                  <button key={k} className="tap" onClick={() => setNewCat(k)}
                    style={{ padding: "4px 8px", borderRadius: 16, fontSize: 10, fontWeight: 600, flexShrink: 0,
                      background: newCat === k ? v.color + "20" : C.bg, color: newCat === k ? v.color : C.muted,
                      border: `1px solid ${newCat === k ? v.color + "66" : C.border}` }}>
                    {v.icon} {v.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="tap" onClick={() => {
                  const amt = Number(newAmount.replace(/\D/g, "")) || 0;
                  if (!amt) return;
                  addExpense({
                    id: Date.now(),
                    description: newDesc.trim() || "Chi tiêu khác",
                    amount: amt,
                    category: newCat,
                    source: "cash",
                    date: todayStr(),
                    paid: true,
                  });
                  setNewDesc(""); setNewAmount(""); setNewCat("personal"); setShowAddForm(false);
                }} disabled={!newAmount.trim()}
                  style={{ flex: 1, background: newAmount.trim() ? `linear-gradient(135deg,${C.gold},${C.accent})` : C.border, color: "#fff", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700 }}>
                  Thêm
                </button>
                <button className="tap" onClick={() => { setShowAddForm(false); setNewDesc(""); setNewAmount(""); }}
                  style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: C.muted, fontWeight: 600 }}>
                  Hủy
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════ WORY EXPENSE CHAT ══════ */}
      {subTab === "wory" && (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 400 }}>
          {/* Chat messages */}
          <div style={{ flex: 1, overflowY: "auto", maxHeight: "55vh", marginBottom: 8, padding: "4px 0" }}>
            {chatMsgs.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px 12px" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>💬💰</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Chat chi tiêu</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
                  Nói cho Wory những khoản chi trong ngày.<br/>
                  VD: "ăn trưa 50k", "đổ xăng 200k", "cà phê với khách 80k"
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
              {["Tổng kết hôm nay", "Còn gì quên ghi không?"].map(p => (
                <button key={p} className="tap" onClick={() => sendExpenseChat(p)}
                  style={{ flexShrink: 0, background: `${C.gold}10`, border: `1px solid ${C.gold}22`, borderRadius: 16, padding: "4px 12px", fontSize: 11, fontWeight: 600, color: C.gold }}>
                  {p}
                </button>
              ))}
              <button className="tap" onClick={() => { setChatMsgs([]); saveJSON("expense_chat", []); }}
                style={{ flexShrink: 0, background: `${C.red}08`, border: `1px solid ${C.red}22`, borderRadius: 16, padding: "4px 12px", fontSize: 11, fontWeight: 600, color: C.red }}>
                Xóa chat
              </button>
            </div>
          )}

          {/* Voice indicator */}
          {voiceOn && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.red, animation: "blink 1s infinite" }} />
              <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>Đang nghe...</span>
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
              🎙
            </button>
            <input
              ref={chatInputRef}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendExpenseChat(); } }}
              placeholder="VD: ăn trưa 50k, đổ xăng 200k..."
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
              ↑
            </button>
          </div>

          {/* Old report section - compact */}
          {woryReport?.text && (
            <div style={{ marginTop: 12, background: `${C.gold}08`, borderRadius: 12, border: `1px solid ${C.gold}22`, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.gold }}>📊 Báo cáo gần nhất</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="tap" onClick={generateWoryReport} disabled={woryLoading}
                    style={{ background: "none", border: "none", fontSize: 11, color: C.gold, fontWeight: 600, padding: "2px 6px" }}>
                    {woryLoading ? "..." : "Làm mới"}
                  </button>
                  {settings?.sendExpenseEmail && (
                    <button className="tap" onClick={sendEmailReport} disabled={sendingEmail}
                      style={{ background: "none", border: "none", fontSize: 11, color: C.accent, fontWeight: 600, padding: "2px 6px" }}>
                      {sendingEmail ? "..." : emailSent ? "✓" : "📧"}
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
      )}
    </div>
  );
}
