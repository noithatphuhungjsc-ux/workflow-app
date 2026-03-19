/* ================================================================
   DashboardTab — KPI overview with simple CSS charts
   No external chart library — pure CSS + inline SVG
   ================================================================ */
import { useMemo, useState, useEffect, useCallback } from "react";
import { C, fmtMoney, todayStr, fmtDate, t, TEAM_ACCOUNTS } from "../constants";
import { supabase } from "../lib/supabase";
import { useSupabase } from "../contexts/SupabaseContext";

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

const REQ_TYPE_LABELS = { purchase: "Mua sắm", advance: "Tạm ứng", payment: "Thanh toán", document: "Giấy tờ", record: "Hồ sơ" };
const REQ_STATUS_LABELS = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối", processing: "Đang xử lý", completed: "Hoàn thành" };
const REQ_STATUS_COLORS = { pending: "#e67e22", approved: "#2ecc71", rejected: "#e74c3c", processing: "#3498db", completed: "#27ae60" };

export default function DashboardTab({ tasks, expenses, projects, settings, onOpenTask }) {
  const today = todayStr();
  const now = new Date();
  const { session } = useSupabase();
  const supaUserId = session?.user?.id;
  const isDirector = settings?.userRole === "director";

  /* ── Fetch requests from Supabase ── */
  const [requests, setRequests] = useState([]);
  const [profileMap, setProfileMap] = useState({});

  useEffect(() => {
    if (!supabase || !supaUserId) return;
    (async () => {
      try {
        let query = supabase.from("requests").select("*").order("created_at", { ascending: false });
        if (!isDirector) query = query.or(`created_by.eq.${supaUserId},assigned_to.eq.${supaUserId}`);
        const { data } = await query;
        setRequests(data || []);
        // Load profile names for assigned_to
        const ids = [...new Set((data || []).flatMap(r => [r.assigned_to, r.created_by]).filter(Boolean))];
        if (ids.length > 0) {
          const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", ids);
          if (profiles) setProfileMap(Object.fromEntries(profiles.map(p => [p.id, p.display_name])));
        }
      } catch (e) { console.warn("[WF] Dashboard requests:", e.message); }
    })();
  }, [supaUserId, isDirector]);

  /* ── Request stats ── */
  const reqStats = useMemo(() => {
    const byStatus = {};
    const byType = {};
    let totalAmount = 0;
    let pendingAmount = 0;
    let longWait = 0; // waiting >10min

    for (const r of requests) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      byType[r.type] = (byType[r.type] || 0) + 1;
      if (r.amount) totalAmount += Number(r.amount);
      if (r.status === "pending" && r.amount) pendingAmount += Number(r.amount);
      if (r.status === "pending" && r.updated_at) {
        const mins = (Date.now() - new Date(r.updated_at).getTime()) / 60000;
        if (mins >= 10) longWait++;
      }
    }
    // Assigned to me
    const assignedToMe = requests.filter(r => r.assigned_to === supaUserId && ["pending", "processing"].includes(r.status));

    return { byStatus, byType, totalAmount, pendingAmount, longWait, assignedToMe, total: requests.length };
  }, [requests, supaUserId]);

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

      {/* ═══════ REQUEST PROGRESS TABLE ═══════ */}
      {requests.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, border: `1px solid ${C.border}`, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>📋 Tiến độ yêu cầu</span>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>{reqStats.total} tổng</span>
          </div>

          {/* Alert: long waiting */}
          {reqStats.longWait > 0 && (
            <div style={{
              background: "#e74c3c12", border: "1px solid #e74c3c33", borderRadius: 10,
              padding: "8px 12px", marginBottom: 10, fontSize: 12, color: "#e74c3c", fontWeight: 600,
            }}>
              🔴 {reqStats.longWait} yêu cầu chờ quá 10 phút!
            </div>
          )}

          {/* Status summary row */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {["pending", "processing", "completed", "rejected"].map(s => {
              const count = reqStats.byStatus[s] || 0;
              if (count === 0) return null;
              return (
                <div key={s} style={{
                  padding: "6px 12px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                  background: `${REQ_STATUS_COLORS[s]}12`, color: REQ_STATUS_COLORS[s],
                  border: `1px solid ${REQ_STATUS_COLORS[s]}33`,
                }}>
                  {REQ_STATUS_LABELS[s]}: {count}
                </div>
              );
            })}
          </div>

          {/* Amount summary */}
          {reqStats.totalAmount > 0 && (
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1, padding: "8px 10px", borderRadius: 10, background: "#f7f5f2" }}>
                <div style={{ fontSize: 10, color: C.muted }}>Tổng giá trị</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{fmtMoney(reqStats.totalAmount)}</div>
              </div>
              {reqStats.pendingAmount > 0 && (
                <div style={{ flex: 1, padding: "8px 10px", borderRadius: 10, background: "#e67e2208" }}>
                  <div style={{ fontSize: 10, color: "#e67e22" }}>Đang chờ duyệt</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#e67e22" }}>{fmtMoney(reqStats.pendingAmount)}</div>
                </div>
              )}
            </div>
          )}

          {/* By type breakdown */}
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 6 }}>Theo loại</div>
          {Object.entries(reqStats.byType).map(([type, count]) => (
            <MiniBar key={type} label={REQ_TYPE_LABELS[type] || type} value={count} max={reqStats.total} color={BAR_COLORS[Object.keys(REQ_TYPE_LABELS).indexOf(type) % BAR_COLORS.length]} />
          ))}

          {/* Assigned to me — action needed */}
          {reqStats.assignedToMe.length > 0 && (
            <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, marginBottom: 6 }}>
                Cần xử lý ({reqStats.assignedToMe.length})
              </div>
              {reqStats.assignedToMe.slice(0, 5).map(r => {
                const waitMins = r.updated_at ? Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 60000) : 0;
                const isLong = waitMins >= 10;
                return (
                  <div key={r.id} style={{
                    fontSize: 12, padding: "6px 0", borderBottom: `1px solid ${C.border}22`,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, color: C.text }}>{r.title}</span>
                      <span style={{ fontSize: 10, color: C.muted, marginLeft: 6 }}>{REQ_TYPE_LABELS[r.type]}</span>
                    </div>
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      {r.amount && <span style={{ fontSize: 10, color: C.accent, fontWeight: 600 }}>{fmtMoney(r.amount)}</span>}
                      {isLong && <span style={{ fontSize: 9, color: "#e74c3c", fontWeight: 700 }}>🔴 {waitMins}p</span>}
                      <span style={{
                        fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
                        color: REQ_STATUS_COLORS[r.status], background: `${REQ_STATUS_COLORS[r.status]}15`,
                      }}>
                        {REQ_STATUS_LABELS[r.status]}
                      </span>
                    </div>
                  </div>
                );
              })}
              {reqStats.assignedToMe.length > 5 && (
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>+{reqStats.assignedToMe.length - 5} yêu cầu khác</div>
              )}
            </div>
          )}

          {/* Recent pending requests (for director) */}
          {isDirector && (reqStats.byStatus.pending || 0) > 0 && (
            <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <div style={{ fontSize: 11, color: "#e67e22", fontWeight: 700, marginBottom: 6 }}>
                Chờ duyệt ({reqStats.byStatus.pending})
              </div>
              {requests.filter(r => r.status === "pending").slice(0, 5).map(r => {
                const waitMins = r.updated_at ? Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 60000) : 0;
                const creatorName = r.created_by ? profileMap[r.created_by] : null;
                const assignedName = r.assigned_to ? profileMap[r.assigned_to] : null;
                return (
                  <div key={r.id} style={{
                    fontSize: 12, padding: "6px 0", borderBottom: `1px solid ${C.border}22`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, color: C.text }}>{r.title}</span>
                      {waitMins >= 10 && <span style={{ fontSize: 9, color: "#e74c3c", fontWeight: 700 }}>🔴 {waitMins >= 60 ? `${Math.floor(waitMins/60)}h` : `${waitMins}p`}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      {creatorName && <span>Từ: {creatorName}</span>}
                      {assignedName && <span style={{ marginLeft: 8 }}>→ Chờ: {assignedName}</span>}
                      {r.amount && <span style={{ marginLeft: 8, color: C.accent }}>{fmtMoney(r.amount)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Overdue tasks list */}
      {stats.overdue.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, padding: 16, border: `1px solid #e74c3c33`, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 8 }}>{t("task", settings)} quá hạn ({stats.overdue.length})</div>
          {stats.overdue.slice(0, 5).map(t => (
            <div key={t.id} className="tap" onClick={() => onOpenTask?.(t)} style={{ fontSize: 12, color: C.text, padding: "6px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
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
            <div key={t.id} className="tap" onClick={() => onOpenTask?.(t)} style={{ fontSize: 12, color: C.text, padding: "6px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
              <span style={{ fontWeight: 600 }}>{t.title}</span>
              {t.startTime && <span style={{ color: C.accent, fontSize: 10, marginLeft: 6 }}>{t.startTime}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
