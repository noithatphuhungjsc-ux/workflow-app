/* ================================================================
   DashboardTab — KPI overview with simple CSS charts
   No external chart library — pure CSS + inline SVG
   ================================================================ */
import { useMemo } from "react";
import { C, fmtMoney, todayStr, fmtDate, t } from "../constants";

const BAR_COLORS = ["#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#3498db", "#9b59b6"];

function MiniBar({ label, value, max, color, suffix = "" }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.sub, marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, color: C.text }}>{value}{suffix}</span>
      </div>
      <div style={{ height: 6, background: "#f0eeea", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color || C.accent, borderRadius: 3, transition: "width .5s ease" }} />
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, color }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 14, padding: "14px 16px", border: `1px solid ${C.border}`,
      flex: "1 1 45%", minWidth: 130,
    }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || C.text }}>{value}</div>
      <div style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function DonutChart({ segments, size = 80 }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) return <div style={{ width: size, height: size, borderRadius: "50%", background: "#f0eeea" }} />;
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      {segments.map((seg, i) => {
        const pct = seg.value / total;
        const dash = circumference * pct;
        const gap = circumference - dash;
        const currentOffset = offset;
        offset += dash;
        return (
          <circle key={i} cx="40" cy="40" r={radius}
            fill="none" stroke={seg.color} strokeWidth="8"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-currentOffset}
            transform="rotate(-90 40 40)"
          />
        );
      })}
      <text x="40" y="44" textAnchor="middle" fontSize="14" fontWeight="800" fill={C.text}>{total}</text>
    </svg>
  );
}

export default function DashboardTab({ tasks, expenses, projects, settings }) {
  const today = todayStr();
  const now = new Date();

  const stats = useMemo(() => {
    const active = tasks.filter(t => !t.deleted);
    const done = active.filter(t => t.status === "done");
    const overdue = active.filter(t => t.status !== "done" && t.deadline && t.deadline < today);
    const dueToday = active.filter(t => t.status !== "done" && t.deadline === today);
    const inProgress = active.filter(t => t.status === "inprogress");
    const todo = active.filter(t => t.status === "todo");

    // Weekly completion trend (last 7 days)
    const weekDays = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ds = fmtDate(d);
      const label = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d.getDay()];
      const completed = done.filter(t => {
        const updatedAt = t.updatedAt || t.createdAt;
        return updatedAt === ds;
      }).length;
      weekDays.push({ label, date: ds, completed });
    }

    // Expense this month
    const monthStart = today.slice(0, 7);
    const monthExpenses = (expenses || []).filter(e => (e.date || "").startsWith(monthStart));
    const totalExpense = monthExpenses.reduce((a, e) => a + (e.amount || 0), 0);

    // By priority
    const byPriority = {
      cao: active.filter(t => t.priority === "cao" && t.status !== "done").length,
      trung: active.filter(t => t.priority === "trung" && t.status !== "done").length,
      thap: active.filter(t => t.priority === "thap" && t.status !== "done").length,
      none: active.filter(t => (!t.priority || t.priority === "none") && t.status !== "done").length,
    };

    // Completion rate
    const completionRate = active.length > 0 ? Math.round((done.length / active.length) * 100) : 0;

    // Projects progress
    const projStats = (projects || []).map(p => {
      const pTasks = tasks.filter(t => t.projectId === p.id && !t.deleted);
      const pDone = pTasks.filter(t => t.status === "done").length;
      return { name: p.name, total: pTasks.length, done: pDone, pct: pTasks.length > 0 ? Math.round((pDone / pTasks.length) * 100) : 0 };
    });

    return { active, done, overdue, dueToday, inProgress, todo, weekDays, totalExpense, byPriority, completionRate, projStats };
  }, [tasks, expenses, projects, today]);

  const maxWeekly = Math.max(...stats.weekDays.map(d => d.completed), 1);

  return (
    <div style={{ padding: "12px 14px 80px", overflowY: "auto" }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: "0 0 12px" }}>Tổng quan</h2>

      {/* KPI Cards */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <KpiCard icon="📋" label={`Tổng ${t("task", settings).toLowerCase()}`} value={stats.active.length} sub={`${stats.done.length} hoàn thành`} />
        <KpiCard icon="✅" label="Tỉ lệ hoàn thành" value={`${stats.completionRate}%`} color={stats.completionRate >= 70 ? C.green : stats.completionRate >= 40 ? "#e67e22" : C.red} />
        <KpiCard icon="⏰" label="Quá hạn" value={stats.overdue.length} color={stats.overdue.length > 0 ? C.red : C.green} sub={stats.overdue.length > 0 ? stats.overdue[0]?.title : "Không có"} />
        <KpiCard icon="💰" label={`${t("expense", settings)} tháng`} value={fmtMoney(stats.totalExpense)} sub={settings.monthlyBudget ? `Ngân sách: ${fmtMoney(settings.monthlyBudget)}` : ""} color={settings.monthlyBudget && stats.totalExpense > settings.monthlyBudget ? C.red : C.text} />
      </div>

      {/* Task status donut */}
      <div style={{ background: "#fff", borderRadius: 14, padding: 16, border: `1px solid ${C.border}`, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Trạng thái {t("task", settings).toLowerCase()}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <DonutChart segments={[
            { value: stats.todo.length, color: "#bdc3c7" },
            { value: stats.inProgress.length, color: "#3498db" },
            { value: stats.done.length, color: "#2ecc71" },
            { value: stats.overdue.length, color: "#e74c3c" },
          ]} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: C.sub, display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#bdc3c7", display: "inline-block" }} /> Chờ: {stats.todo.length}
            </div>
            <div style={{ fontSize: 11, color: C.sub, display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3498db", display: "inline-block" }} /> Đang làm: {stats.inProgress.length}
            </div>
            <div style={{ fontSize: 11, color: C.sub, display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2ecc71", display: "inline-block" }} /> Xong: {stats.done.length}
            </div>
            <div style={{ fontSize: 11, color: C.sub, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#e74c3c", display: "inline-block" }} /> Quá hạn: {stats.overdue.length}
            </div>
          </div>
        </div>
      </div>

      {/* Weekly trend */}
      <div style={{ background: "#fff", borderRadius: 14, padding: 16, border: `1px solid ${C.border}`, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Hoàn thành 7 ngày qua</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60 }}>
          {stats.weekDays.map((d, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              <div style={{
                height: Math.max((d.completed / maxWeekly) * 44, 2),
                background: d.date === today ? C.accent : "#d5d3ce",
                borderRadius: 3,
                transition: "height .3s ease",
                marginBottom: 3,
              }} />
              <div style={{ fontSize: 9, color: d.date === today ? C.accent : C.muted, fontWeight: d.date === today ? 700 : 400 }}>{d.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Priority breakdown */}
      <div style={{ background: "#fff", borderRadius: 14, padding: 16, border: `1px solid ${C.border}`, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Theo mức ưu tiên</div>
        <MiniBar label="Cao" value={stats.byPriority.cao} max={stats.active.length} color="#e74c3c" />
        <MiniBar label="Trung" value={stats.byPriority.trung} max={stats.active.length} color="#e67e22" />
        <MiniBar label="Thấp" value={stats.byPriority.thap} max={stats.active.length} color="#3498db" />
        <MiniBar label="Không" value={stats.byPriority.none} max={stats.active.length} color="#bdc3c7" />
      </div>

      {/* Project progress */}
      {stats.projStats.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, border: `1px solid ${C.border}`, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>Tiến độ {t("project", settings).toLowerCase()}</div>
          {stats.projStats.map((p, i) => (
            <MiniBar key={i} label={p.name} value={p.done} max={p.total} color={BAR_COLORS[i % BAR_COLORS.length]} suffix={`/${p.total} (${p.pct}%)`} />
          ))}
        </div>
      )}

      {/* Overdue tasks list */}
      {stats.overdue.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, border: `1px solid #e74c3c33`, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 8 }}>{t("task", settings)} quá hạn ({stats.overdue.length})</div>
          {stats.overdue.slice(0, 5).map(t => (
            <div key={t.id} style={{ fontSize: 12, color: C.text, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontWeight: 600 }}>{t.title}</span>
              <span style={{ color: C.red, fontSize: 10, marginLeft: 6 }}>hạn {t.deadline}</span>
            </div>
          ))}
          {stats.overdue.length > 5 && (
            <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>+{stats.overdue.length - 5} việc khác</div>
          )}
        </div>
      )}

      {/* Today's tasks */}
      {stats.dueToday.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, border: `1px solid ${C.border}`, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Việc hôm nay ({stats.dueToday.length})</div>
          {stats.dueToday.map(t => (
            <div key={t.id} style={{ fontSize: 12, color: C.text, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontWeight: 600 }}>{t.title}</span>
              {t.startTime && <span style={{ color: C.accent, fontSize: 10, marginLeft: 6 }}>{t.startTime}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
