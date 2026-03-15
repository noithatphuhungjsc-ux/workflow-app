/* ================================================================
   REPORT TAB — Statistics, charts & AI Report Generator
   ================================================================ */
import { useState, useCallback } from "react";
import { C, PRIORITIES, STATUSES, DAY_NAMES, fmtDate, getWeekDays, isOverdue, todayStr } from "../constants";
import { SL, StatCard, MdBlock } from "../components";
import { callClaudeStream, loadJSON, saveJSON } from "../services";
import { exportTasksCSV, exportExpensesCSV, exportReportPDF } from "../utils/exportReport";

export default function ReportTab({ tasks, history, settings, memory, user }) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekStartS = fmtDate(weekStart);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndS = fmtDate(weekEnd);

  const totalMs = tasks.reduce((s, t) => s + (t.timerTotal || 0), 0);
  const totalHrs = (totalMs / 3600000).toFixed(1);
  const completed = tasks.filter(t => t.status === "done").length;
  const completedWeek = tasks.filter(t => t.status === "done" && t.deadline >= weekStartS && t.deadline <= weekEndS).length;
  const overdue = tasks.filter(isOverdue).length;
  const inProgress = tasks.filter(t => t.status === "inprogress").length;

  const pDist = { cao: tasks.filter(t => t.priority === "cao").length, trung: tasks.filter(t => t.priority === "trung").length, thap: tasks.filter(t => t.priority === "thap").length };
  const sDist = {};
  Object.keys(STATUSES).forEach(k => { sDist[k] = tasks.filter(t => t.status === k).length; });

  const weekDays = getWeekDays(now);
  const hoursPerDay = weekDays.map(d => {
    const ds = fmtDate(d);
    const dayTasks = tasks.filter(t => t.deadline === ds);
    const ms = dayTasks.reduce((s, t) => s + (t.timerTotal || 0), 0);
    return { day: DAY_NAMES[(d.getDay()+6)%7], hours: +(ms / 3600000).toFixed(1), date: ds };
  });
  const maxH = Math.max(...hoursPerDay.map(d => d.hours), 1);

  const recent = history.slice(-20).reverse();

  /* ── AI Report Generator ── */
  const [reportText, setReportText] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportType, setReportType] = useState("daily"); // daily | weekly | plan

  const REPORT_TYPES = [
    { id: "daily", label: "Báo cáo ngày", icon: "📋" },
    { id: "weekly", label: "Báo cáo tuần", icon: "📊" },
    { id: "plan", label: "Kế hoạch", icon: "📝" },
  ];

  const generateReport = useCallback(async () => {
    if (reportLoading) return;
    setReportLoading(true);
    setReportText("");

    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0");
    const shortName = (settings?.displayName || user?.name || "ban").split(" ").pop();
    const sum = tasks.map(t => {
      const s = STATUSES[t.status]?.label || t.status;
      const p = PRIORITIES[t.priority]?.label || t.priority;
      return `- ${t.title} [${s}] uu tien:${p}${t.deadline ? " deadline:" + t.deadline : ""}${t.startTime ? " luc " + t.startTime : ""}${t.duration ? " " + t.duration + "ph" : ""}${t.notes ? " ghi chu:" + t.notes : ""}`;
    }).join("\n");

    const completedCount = tasks.filter(t => t.status === "done").length;
    const overdueCount = tasks.filter(isOverdue).length;
    const inProgressCount = tasks.filter(t => t.status === "inprogress").length;
    const todoCount = tasks.filter(t => t.status === "todo").length;

    const prompts = {
      daily: `Tao bao cao NGAY lam viec cho ${shortName}. Hom nay: ${todayStr()}, ${timeStr}.
Tong hop: ${tasks.length} viec (${completedCount} xong, ${inProgressCount} dang lam, ${todoCount} can lam, ${overdueCount} tre han).
Viet bang tieng Viet co dau, format markdown ro rang, gom:
1. TONG QUAN NGAY HOM NAY (2-3 dong)
2. CONG VIEC DA HOAN THANH (list ngan)
3. CONG VIEC CAN LAM HOM NAY (sap xep theo do khan cap)
4. CONG VIEC TRE HAN (neu co, canh bao)
5. GOI Y & NHAN XET (1-2 dong tu van)`,

      weekly: `Tao bao cao TUAN lam viec cho ${shortName}. Hom nay: ${todayStr()}, ${timeStr}.
Tong hop: ${tasks.length} viec (${completedCount} xong, ${inProgressCount} dang lam, ${todoCount} can lam, ${overdueCount} tre han).
Tong gio lam: ${totalHrs}h.
Viet bang tieng Viet co dau, format markdown ro rang, gom:
1. TONG QUAN TUAN (hieu suat, xu huong)
2. THANH TUU NOI BAT
3. CONG VIEC CON DANG DO
4. PHAN TICH UU TIEN (theo ma tran Eisenhower)
5. DE XUAT TUAN TOI`,

      plan: `Lap KE HOACH chi tiet cho ${shortName}. Hom nay: ${todayStr()}, ${timeStr}.
Dua tren cong viec hien tai, hay sap xep thanh ke hoach lam viec cu the.
Viet bang tieng Viet co dau, format markdown ro rang, gom:
1. MUC TIEU CHINH (3-5 muc tieu uu tien)
2. KE HOACH THEO THU TU UU TIEN (nhom theo do khan cap)
3. LICH TRINH GOI Y (gio lam cu the cho tung viec)
4. RUI RO & LUU Y (deadline gan, xung dot thoi gian)
5. LOI KHUYEN (cach toi uu hoa thoi gian)`,
    };

    const system = `Ban la Wory — tro ly chuyen nghiep. Viet bao cao/ke hoach CHUYEN NGHIEP, RO RANG, CO CAU TRUC.
Dung markdown: ## cho tieu de, **bold** cho nhan manh, - cho list.
Chi tap trung vao noi dung, khong chao hoi.
CONG VIEC (${tasks.length}):
${sum}`;

    try {
      await callClaudeStream(
        system,
        [{ role: "user", content: prompts[reportType] }],
        (partial) => setReportText(partial),
        2000
      );
    } catch {
      setReportText("Lỗi kết nối. Vui lòng thử lại.");
    }
    setReportLoading(false);
  }, [reportLoading, reportType, tasks, settings, user, totalHrs]);

  const shareReport = useCallback(async () => {
    if (!reportText) return;
    const title = REPORT_TYPES.find(r => r.id === reportType)?.label || "Báo cáo";
    const plainText = reportText
      .replace(/#{1,6}\s?/g, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1");

    // Try Web Share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({ title: `WorkFlow - ${title}`, text: plainText });
        return;
      } catch { /* user cancelled or not supported */ }
    }

    // Fallback: mailto with email from settings
    const email = settings?.email || "";
    const subject = encodeURIComponent(`WorkFlow - ${title} (${todayStr()})`);
    const body = encodeURIComponent(plainText);
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank");
  }, [reportText, reportType, settings]);

  const copyReport = useCallback(() => {
    if (!reportText) return;
    navigator.clipboard?.writeText(reportText);
  }, [reportText]);

  return (
    <div style={{ animation:"fadeIn .2s" }}>

      {/* ── Export buttons ── */}
      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
        <button className="tap" onClick={() => exportTasksCSV(tasks, `tasks-${todayStr()}`)}
          style={{ fontSize:11, fontWeight:700, background:"#fff", border:`1px solid ${C.border}`, borderRadius:8, padding:"6px 12px", color:C.text, cursor:"pointer" }}>
          Xuất CSV
        </button>
        <button className="tap" onClick={() => exportReportPDF({ title:"Báo cáo công việc", tasks, settings, dateRange:`${weekStartS} — ${weekEndS}` })}
          style={{ fontSize:11, fontWeight:700, background:C.accent, border:"none", borderRadius:8, padding:"6px 12px", color:"#fff", cursor:"pointer" }}>
          Xuất PDF
        </button>
      </div>

      {/* ── AI Report Generator ── */}
      <SL>BÁO CÁO CỦA WORY</SL>
      <div style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px", marginBottom:18 }}>
        {/* Report type selector */}
        <div style={{ display:"flex", gap:6, marginBottom:12 }}>
          {REPORT_TYPES.map(r => (
            <button key={r.id} className="tap" onClick={() => setReportType(r.id)}
              style={{ flex:1, background: reportType === r.id ? C.accent : C.bg, color: reportType === r.id ? "#fff" : C.sub,
                border:`1px solid ${reportType === r.id ? C.accent : C.border}`, borderRadius:10, padding:"8px 6px", fontSize:11, fontWeight:600, textAlign:"center" }}>
              <div style={{ fontSize:16, marginBottom:2 }}>{r.icon}</div>
              {r.label}
            </button>
          ))}
        </div>

        {/* Generate button */}
        <button className="tap" onClick={generateReport} disabled={reportLoading}
          style={{ width:"100%", background: reportLoading ? C.border : `linear-gradient(135deg,${C.accent},${C.purple})`,
            color:"#fff", border:"none", borderRadius:12, padding:"12px", fontSize:14, fontWeight:700, marginBottom: reportText ? 12 : 0, opacity: reportLoading ? 0.7 : 1 }}>
          {reportLoading ? "Đang tạo báo cáo..." : "✨ Tạo báo cáo"}
        </button>

        {/* Report content */}
        {reportText && (
          <div>
            <div style={{ background:"#fff", borderRadius:12, border:`1px solid ${C.border}`, padding:"14px", maxHeight:400, overflowY:"auto", fontSize:14, lineHeight:1.7, color:C.text }}>
              <MdBlock text={reportText} />
              {reportLoading && <span style={{ display:"inline-block", width:2, height:14, background:C.accent, marginLeft:2, animation:"blink 1s infinite", verticalAlign:"text-bottom" }} />}
            </div>

            {/* Action buttons */}
            {!reportLoading && (
              <div style={{ display:"flex", gap:8, marginTop:10 }}>
                <button className="tap" onClick={shareReport}
                  style={{ flex:1, background:`${C.accent}15`, color:C.accent, border:`1px solid ${C.accent}33`, borderRadius:10, padding:"10px", fontSize:13, fontWeight:600 }}>
                  📤 Chia sẻ
                </button>
                <button className="tap" onClick={copyReport}
                  style={{ flex:1, background:`${C.purple}15`, color:C.purple, border:`1px solid ${C.purple}33`, borderRadius:10, padding:"10px", fontSize:13, fontWeight:600 }}>
                  📋 Sao chép
                </button>
                <button className="tap" onClick={() => {
                  const blob = new Blob([reportText], { type: "text/markdown" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url;
                  a.download = `workflow-report-${todayStr()}.md`; a.click();
                  URL.revokeObjectURL(url);
                }}
                  style={{ flex:1, background:`${C.green}15`, color:C.green, border:`1px solid ${C.green}33`, borderRadius:10, padding:"10px", fontSize:13, fontWeight:600 }}>
                  💾 Tải về
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:18 }}>
        <StatCard icon="&#x1F4CA;" label="Tổng việc" value={tasks.length} color={C.accent} />
        <StatCard icon="v" label="Hoàn thành" value={completed} color={C.green} />
        <StatCard icon="T" label="Tổng giờ làm" value={`${totalHrs}h`} color={C.purple} />
        <StatCard icon="!" label="Trễ deadline" value={overdue} color={C.red} />
        <StatCard icon="~" label="Đang làm" value={inProgress} color={C.accent} />
        <StatCard icon="W" label="Xong tuần này" value={completedWeek} color={C.gold} />
      </div>

      {/* Priority distribution */}
      <SL>PHÂN BỔ ƯU TIÊN</SL>
      <div style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px", marginBottom:18 }}>
        {Object.entries(PRIORITIES).map(([k, v]) => (
          <div key={k} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <span style={{ fontSize:12, color:v.color, fontWeight:600, width:70 }}>{v.label}</span>
            <div style={{ flex:1, height:16, background:C.border, borderRadius:8, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${tasks.length ? Math.round((pDist[k] / tasks.length) * 100) : 0}%`, background:v.color, borderRadius:8, transition:"width .4s" }} />
            </div>
            <span style={{ fontSize:12, color:C.sub, fontWeight:600, width:24, textAlign:"right" }}>{pDist[k]}</span>
          </div>
        ))}
      </div>

      {/* Status distribution */}
      <SL>TRẠNG THÁI CÔNG VIỆC</SL>
      <div className="no-scrollbar" style={{ display:"flex", gap:6, marginBottom:18, overflowX:"auto" }}>
        {Object.entries(STATUSES).map(([k, v]) => (
          <div key={k} style={{ flex:1, minWidth:80, background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:"12px 8px", textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:800, color:v.color }}>{sDist[k]}</div>
            <div style={{ fontSize:10, color:C.muted, fontWeight:600, marginTop:2 }}>{v.label}</div>
          </div>
        ))}
      </div>

      {/* Weekly hours */}
      <SL>GIỜ LÀM THEO NGÀY (TUẦN NÀY)</SL>
      <div style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px", marginBottom:18 }}>
        <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:100 }}>
          {hoursPerDay.map((d, i) => (
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <span style={{ fontSize:9, color:C.sub, fontWeight:600 }}>{d.hours > 0 ? `${d.hours}h` : ""}</span>
              <div style={{ width:"100%", background: d.date === fmtDate(now) ? `linear-gradient(0deg,${C.accent},${C.purple})` : C.border, borderRadius:4, height:`${Math.max(d.hours / maxH * 70, 4)}px`, transition:"height .4s" }} />
              <span style={{ fontSize:10, color: d.date === fmtDate(now) ? C.accent : C.muted, fontWeight:600 }}>{d.day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent history */}
      <SL>LỊCH SỬ HOẠT ĐỘNG</SL>
      <div style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:"10px 14px", marginBottom:18 }}>
        {recent.length === 0 && <div style={{ textAlign:"center", padding:16, color:C.muted, fontSize:12 }}>Chưa có hoạt động nào</div>}
        {recent.map(e => {
          const icons = { add:"+", delete:"X", status:"~", timer:"T" };
          const labels = { add:"Thêm mới", delete:"Đã xóa", status:"Đổi trạng thái", timer:"Timer" };
          const ts = new Date(e.ts);
          return (
            <div key={e.id} style={{ display:"flex", gap:10, padding:"6px 0", borderBottom:`1px solid ${C.border}22`, alignItems:"center" }}>
              <span style={{ fontSize:16, width:24, textAlign:"center" }}>{icons[e.action] || "N"}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{e.taskTitle}</div>
                <div style={{ fontSize:10, color:C.muted }}>{labels[e.action] || e.action}{e.detail ? ` -> ${e.detail}` : ""}</div>
              </div>
              <span style={{ fontSize:10, color:C.muted }}>{ts.getHours().toString().padStart(2,"0")}:{ts.getMinutes().toString().padStart(2,"0")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

