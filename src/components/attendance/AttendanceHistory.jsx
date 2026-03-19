/* ================================================================
   ATTENDANCE HISTORY — Calendar + list view for personal history
   ================================================================ */
import { useState, useMemo } from "react";
import { C, MONTH_NAMES } from "../../constants";

function fmtTime(ts) {
  if (!ts) return "--:--";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtMinutes(min) {
  if (!min) return "0p";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? m + "p" : ""}` : `${m}p`;
}

const STATUS_LABELS = {
  present: { label: "Du cong", color: C.green },
  late: { label: "Di tre", color: "#e67e22" },
  absent: { label: "Vang mat", color: "#e74c3c" },
  half_day: { label: "Nua ngay", color: C.accent },
  leave: { label: "Nghi phep", color: C.purple },
};

export default function AttendanceHistory({ monthlySummary, onMonthChange }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const goMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
    onMonthChange?.(y, m);
  };

  // Stats
  const stats = useMemo(() => {
    const s = { present: 0, late: 0, absent: 0, totalMinutes: 0, overtime: 0 };
    for (const d of (monthlySummary || [])) {
      if (d.status === "present") s.present++;
      else if (d.status === "late") { s.present++; s.late++; }
      s.totalMinutes += d.total_work_minutes || 0;
      s.overtime += d.overtime_minutes || 0;
    }
    return s;
  }, [monthlySummary]);

  // Sort by date descending
  const sorted = useMemo(() =>
    [...(monthlySummary || [])].sort((a, b) => b.date.localeCompare(a.date)),
    [monthlySummary]
  );

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 12 }}>
        <button className="tap" onClick={() => goMonth(-1)} style={{ background: "none", border: "none", fontSize: 20, color: C.muted, cursor: "pointer" }}>&lt;</button>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{MONTH_NAMES[month - 1]} {year}</span>
        <button className="tap" onClick={() => goMonth(1)} style={{ background: "none", border: "none", fontSize: 20, color: C.muted, cursor: "pointer" }}>&gt;</button>
      </div>

      {/* Summary cards */}
      <div style={{ padding: "0 16px", marginBottom: 12 }}>
        <div className="card" style={{ padding: "12px 16px", display: "flex", justifyContent: "space-around", textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.green }}>{stats.present}</div>
            <div style={{ fontSize: 11, color: C.muted }}>Ngay cong</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#e67e22" }}>{stats.late}</div>
            <div style={{ fontSize: 11, color: C.muted }}>Di tre</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.accent }}>{fmtMinutes(stats.totalMinutes)}</div>
            <div style={{ fontSize: 11, color: C.muted }}>Tong gio</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.purple }}>{fmtMinutes(stats.overtime)}</div>
            <div style={{ fontSize: 11, color: C.muted }}>Tang ca</div>
          </div>
        </div>
      </div>

      {/* Day list */}
      <div style={{ padding: "0 16px" }}>
        {sorted.length === 0 && (
          <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: 20 }}>Chua co du lieu cham cong</div>
        )}
        {sorted.map((d) => {
          const st = STATUS_LABELS[d.status] || STATUS_LABELS.absent;
          const dateObj = new Date(d.date + "T12:00:00Z");
          const dayName = dateObj.toLocaleDateString("vi-VN", { weekday: "short" });
          const dayNum = dateObj.getDate();

          return (
            <div key={d.date} className="card" style={{
              padding: "10px 14px", marginBottom: 6,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 40, textAlign: "center" }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{dayNum}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{dayName}</div>
                </div>
                <div>
                  <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
                    <span style={{ color: C.green }}>{fmtTime(d.first_check_in)}</span>
                    <span style={{ color: C.muted }}>-</span>
                    <span style={{ color: d.last_check_out ? C.text : "#e74c3c" }}>{fmtTime(d.last_check_out)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    {fmtMinutes(d.total_work_minutes)}
                    {d.overtime_minutes > 0 && <span style={{ color: C.purple }}> (+{fmtMinutes(d.overtime_minutes)} OT)</span>}
                    {d.late_minutes > 0 && <span style={{ color: "#e67e22" }}> tre {d.late_minutes}p</span>}
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
                background: st.color + "18", color: st.color,
              }}>{st.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
