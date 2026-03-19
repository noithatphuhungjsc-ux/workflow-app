/* ================================================================
   DIRECTOR DASHBOARD — Today overview + employee list + requests
   ================================================================ */
import { useState, useEffect, useCallback } from "react";
import { C, TEAM_ACCOUNTS } from "../../constants";
import * as svc from "../../services/attendanceService";

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

const STATUS_COLORS = {
  present: C.green,
  late: "#e67e22",
  absent: "#e74c3c",
  half_day: C.accent,
  leave: C.purple,
};

export default function DirectorDashboard({ userId, requests, onReview, onRefreshRequests }) {
  const [todaySummary, setTodaySummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("today"); // today | requests

  const today = new Date().toISOString().split("T")[0];

  const loadTodaySummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await svc.getAllEmployeeSummary(today);
      setTodaySummary(res.data || []);
    } catch (e) {
      console.warn("[ATT] Dashboard load error:", e.message);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    loadTodaySummary();
    const interval = setInterval(loadTodaySummary, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [loadTodaySummary]);

  // Stats
  const presentCount = todaySummary.filter(s => s.status === "present" || s.status === "late").length;
  const lateCount = todaySummary.filter(s => s.status === "late").length;
  const absentCount = todaySummary.filter(s => s.status === "absent").length;
  const pendingRequests = (requests || []).filter(r => r.status === "pending").length;

  return (
    <div>
      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 0, padding: "0 16px", marginBottom: 12 }}>
        {[["today", "Hom nay"], ["requests", `Yeu cau (${pendingRequests})`]].map(([key, label]) => (
          <button key={key} onClick={() => { setActiveTab(key); if (key === "requests") onRefreshRequests?.(); }}
            style={{
              flex: 1, padding: "10px 0", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: activeTab === key ? 700 : 500,
              color: activeTab === key ? C.accent : C.muted,
              background: "none",
              borderBottom: `2px solid ${activeTab === key ? C.accent : "transparent"}`,
            }}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === "today" && (
        <div>
          {/* Summary cards */}
          <div style={{ padding: "0 16px", marginBottom: 12 }}>
            <div className="card" style={{ padding: "12px 16px", display: "flex", justifyContent: "space-around", textAlign: "center" }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.green }}>{presentCount}</div>
                <div style={{ fontSize: 11, color: C.muted }}>Co mat</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#e67e22" }}>{lateCount}</div>
                <div style={{ fontSize: 11, color: C.muted }}>Di tre</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#e74c3c" }}>{absentCount}</div>
                <div style={{ fontSize: 11, color: C.muted }}>Vang</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{TEAM_ACCOUNTS.length}</div>
                <div style={{ fontSize: 11, color: C.muted }}>Tong</div>
              </div>
            </div>
          </div>

          {/* Employee list */}
          <div style={{ padding: "0 16px" }}>
            {loading && <div style={{ textAlign: "center", color: C.muted, padding: 20, fontSize: 13 }}>Dang tai...</div>}
            {!loading && todaySummary.map((emp) => {
              const statusColor = STATUS_COLORS[emp.status] || "#e74c3c";
              return (
                <div key={emp.user_id} className="card" style={{
                  padding: "10px 14px", marginBottom: 6,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 18,
                      background: statusColor + "20", color: statusColor,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, fontWeight: 700,
                    }}>
                      {(emp.display_name || "?")[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{emp.display_name || "Unknown"}</div>
                      <div style={{ fontSize: 11, color: C.muted }}>
                        {emp.first_check_in ? `Vao: ${fmtTime(emp.first_check_in)}` : "Chua cham cong"}
                        {emp.last_check_out ? ` — Ra: ${fmtTime(emp.last_check_out)}` : ""}
                        {emp.total_work_minutes > 0 && ` (${fmtMinutes(emp.total_work_minutes)})`}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
                    background: statusColor + "18", color: statusColor,
                  }}>
                    {emp.status === "present" ? "Co mat" : emp.status === "late" ? "Tre" :
                      emp.status === "absent" ? "Vang" : emp.status === "half_day" ? "1/2" : emp.status}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "requests" && (
        <div style={{ padding: "0 16px" }}>
          {(!requests || requests.length === 0) && (
            <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: 20 }}>Khong co yeu cau nao</div>
          )}
          {(requests || []).map((r) => (
            <div key={r.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                  {r.profiles?.display_name || "Unknown"}
                </span>
                <span style={{
                  fontSize: 10, padding: "2px 6px", borderRadius: 4,
                  background: r.status === "pending" ? "#fff3e0" : r.status === "approved" ? C.greenD : C.redD,
                  color: r.status === "pending" ? "#e65100" : r.status === "approved" ? C.green : C.red,
                  fontWeight: 600,
                }}>
                  {r.status === "pending" ? "Cho duyet" : r.status === "approved" ? "Da duyet" : "Tu choi"}
                </span>
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                {r.type === "correction" ? "Dieu chinh" : r.type === "leave" ? "Nghi phep" : "Tang ca"} — {r.date}
              </div>
              {r.reason && <div style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>{r.reason}</div>}
              {r.status === "pending" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => onReview?.(r.id, "approved")}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Duyet
                  </button>
                  <button onClick={() => onReview?.(r.id, "rejected")}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: "#e74c3c", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Tu choi
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
