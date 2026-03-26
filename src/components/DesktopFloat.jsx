/* ================================================================
   DESKTOP FLOAT — Floating task widget for desktop screens
   Shows on screens >= 900px, bottom-right corner
   ================================================================ */
import { useState, useCallback, useEffect, useRef } from "react";
import { C, STATUSES, PRIORITIES, todayStr, isOverdue } from "../constants";
import { useTasks, useSettings } from "../store";

export default function DesktopFloat({ onSelectTask, onOpenTab }) {
  const { tasks, patchTask } = useTasks();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const [subView, setSubView] = useState("today"); // today | overdue | all
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 900);
  const panelRef = useRef(null);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 900);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!isDesktop) return null;

  const today = todayStr();
  const active = tasks.filter(t => !t.deleted && t.status !== "done");
  const overdue = active.filter(t => t.deadline && t.deadline < today);
  const dueToday = active.filter(t => t.deadline === today);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const dueTomorrow = active.filter(t => t.deadline === tomorrowStr);
  const highPriority = active.filter(t => t.priority === "cao");

  const displayTasks = subView === "overdue" ? overdue
    : subView === "today" ? [...overdue, ...dueToday]
    : active.slice(0, 15);

  const toggleDone = useCallback((id) => {
    const t = tasks.find(x => x.id === id);
    if (t) patchTask(id, { status: t.status === "done" ? "todo" : "done" });
  }, [tasks, patchTask]);

  const urgentCount = overdue.length + dueToday.filter(t => t.priority === "cao").length;

  return (
    <div ref={panelRef} style={{ position: "fixed", bottom: 24, right: 0, zIndex: 9990 }}>
      {/* Expanded panel — sidebar 1/4 screen, docked right */}
      {open && (
        <div style={{
          width: "25vw", minWidth: 320, maxWidth: 420, height: "100vh",
          position: "fixed", top: 0, right: 0, bottom: 0,
          background: "#fff",
          boxShadow: "-4px 0 32px rgba(0,0,0,.12)",
          borderLeft: `1px solid ${C.border}`,
          overflow: "hidden",
          animation: "slideRight .2s ease-out",
          display: "flex", flexDirection: "column",
          zIndex: 9991,
        }}>
          {/* Header */}
          <div style={{
            background: `linear-gradient(135deg,${C.accent},${C.purple})`,
            padding: "14px 18px", color: "#fff",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>WorkFlow</div>
                <div style={{ fontSize: 11, opacity: .8 }}>
                  {active.length} việc · {overdue.length > 0 ? `${overdue.length} quá hạn` : "không quá hạn"}
                </div>
              </div>
              <button onClick={() => setOpen(false)}
                style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 8, padding: "4px 10px", color: "#fff", fontSize: 14, cursor: "pointer" }}>
                ✕
              </button>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {[
                { label: "Quá hạn", count: overdue.length, color: "#ff6b6b", bg: "rgba(255,107,107,.2)" },
                { label: "Hôm nay", count: dueToday.length, color: "#ffd93d", bg: "rgba(255,217,61,.2)" },
                { label: "Ngày mai", count: dueTomorrow.length, color: "#6bcb77", bg: "rgba(107,203,119,.2)" },
                { label: "Ưu tiên cao", count: highPriority.length, color: "#ff922b", bg: "rgba(255,146,43,.2)" },
              ].map(s => (
                <div key={s.label} style={{
                  flex: 1, textAlign: "center", background: s.bg, borderRadius: 10, padding: "6px 4px",
                }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.count}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, opacity: .9 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sub view tabs */}
          <div style={{ display: "flex", gap: 4, padding: "8px 12px 4px", background: "#fafbfc" }}>
            {[
              ["today", `Hôm nay (${overdue.length + dueToday.length})`],
              ["overdue", `Quá hạn (${overdue.length})`],
              ["all", `Tất cả (${active.length})`],
            ].map(([k, l]) => (
              <button key={k} onClick={() => setSubView(k)}
                style={{
                  flex: 1, background: subView === k ? C.accent : "transparent",
                  color: subView === k ? "#fff" : C.muted,
                  border: subView === k ? "none" : `1px solid ${C.border}`,
                  borderRadius: 8, padding: "5px 6px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}>
                {l}
              </button>
            ))}
          </div>

          {/* Task list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 12px 12px" }}>
            {displayTasks.length === 0 && (
              <div style={{ textAlign: "center", padding: 20, color: C.muted, fontSize: 13 }}>
                {subView === "overdue" ? "Không có việc quá hạn 🎉" : "Không có việc nào"}
              </div>
            )}

            {displayTasks.map(t => {
              const isOD = t.deadline && t.deadline < today;
              const pri = PRIORITIES[t.priority] || {};
              const st = STATUSES[t.status] || {};
              const subtaskProg = t.subtasks?.length
                ? `${t.subtasks.filter(s => s.done).length}/${t.subtasks.length}`
                : null;

              return (
                <div key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 4,
                  background: isOD ? `${C.red}08` : C.card, borderRadius: 10,
                  border: `1px solid ${isOD ? C.red + "33" : C.border}`,
                  cursor: "pointer", transition: "all .15s",
                }}
                  onMouseEnter={e => e.currentTarget.style.transform = "translateX(2px)"}
                  onMouseLeave={e => e.currentTarget.style.transform = "none"}
                >
                  {/* Checkbox */}
                  <div onClick={(e) => { e.stopPropagation(); toggleDone(t.id); }}
                    style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      border: `2px solid ${t.status === "done" ? C.green : C.border}`,
                      background: t.status === "done" ? C.green : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", fontSize: 12, color: "#fff",
                    }}>
                    {t.status === "done" && "✓"}
                  </div>

                  {/* Task info */}
                  <div style={{ flex: 1, minWidth: 0 }} onClick={() => { if (onSelectTask) onSelectTask(t); }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: t.status === "done" ? C.muted : C.text,
                      textDecoration: t.status === "done" ? "line-through" : "none",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {t.title}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                      {isOD && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: C.red, background: `${C.red}15`, borderRadius: 4, padding: "1px 5px" }}>
                          QUÁ HẠN
                        </span>
                      )}
                      {t.deadline && (
                        <span style={{ fontSize: 10, color: isOD ? C.red : C.muted, fontWeight: 500 }}>
                          {t.deadline === today ? "Hôm nay" : t.deadline === tomorrowStr ? "Ngày mai" : t.deadline.slice(5)}
                          {t.startTime ? ` ${t.startTime}` : ""}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: pri.color || C.muted, fontWeight: 600 }}>
                        {pri.label?.split("\n")[0] || ""}
                      </span>
                      {subtaskProg && (
                        <span style={{ fontSize: 10, color: C.accent, fontWeight: 500 }}>
                          ☑ {subtaskProg}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: st.color || C.muted, fontWeight: 500 }}>
                        {st.label || ""}
                      </span>
                    </div>
                  </div>

                  {/* Priority dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: pri.color || C.border,
                  }} />
                </div>
              );
            })}
          </div>

          {/* Footer actions */}
          <div style={{
            borderTop: `1px solid ${C.border}`, padding: "8px 12px",
            display: "flex", gap: 8, background: "#fafbfc",
          }}>
            <button onClick={() => { if (onOpenTab) onOpenTab("tasks"); setOpen(false); }}
              style={{
                flex: 1, background: `${C.accent}12`, color: C.accent, border: `1px solid ${C.accent}33`,
                borderRadius: 10, padding: "8px", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>
              Mở đầy đủ
            </button>
            <button onClick={() => { if (onOpenTab) onOpenTab("ai"); setOpen(false); }}
              style={{
                flex: 1, background: `${C.purple}12`, color: C.purple, border: `1px solid ${C.purple}33`,
                borderRadius: 10, padding: "8px", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}>
              Chat Wory
            </button>
          </div>
        </div>
      )}

      {/* Float button — fixed bottom-right, shifts left when panel open */}
      {!open && (
        <button onClick={() => setOpen(true)}
          style={{
            position: "fixed", bottom: 80, right: 24,
            width: 56, height: 56, borderRadius: "50%", border: "none", cursor: "pointer",
            background: urgentCount > 0
              ? `linear-gradient(135deg,${C.red},${C.accent})`
              : `linear-gradient(135deg,${C.accent},${C.purple})`,
            boxShadow: urgentCount > 0
              ? `0 4px 20px ${C.red}55, 0 0 0 4px ${C.red}22`
              : "0 4px 20px rgba(106,127,212,.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, color: "#fff",
            transition: "all .2s",
            animation: urgentCount > 0 ? "pulse 2s infinite" : "none",
            zIndex: 9990,
          }}>
          📋

          {/* Badge */}
          {urgentCount > 0 && (
            <div style={{
              position: "absolute", top: -4, right: -4,
              width: 22, height: 22, borderRadius: "50%",
              background: C.red, color: "#fff", fontSize: 11, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid #fff",
            }}>
              {urgentCount}
            </div>
          )}
        </button>
      )}
    </div>
  );
}
