/* ================================================================
   CALENDAR TAB — Merged: Daily Schedule + Week + Month + Timeline
   + Drag-drop: long-press task → drag to different day (week view)
   ================================================================ */
import { useState, useRef, useCallback } from "react";
import { C, PRIORITIES, STATUSES, DAY_NAMES, MONTH_NAMES, fmtDate, getWeekDays, getMonthDays, tasksOnDay, todayStr, isOverdue } from "../constants";
import { Chip, SL, Empty, TaskRow } from "../components";

export default function CalendarTab({ tasks, onPress, patchTask }) {
  const [viewMode, setViewMode] = useState("day"); // day | week | month
  const [refDate, setRefDate] = useState(new Date());
  const now = new Date();
  const todayS = todayStr();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const nowMins = currentHour * 60 + currentMin;

  // Drag-drop state
  const [dragTask, setDragTask] = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);
  const [dragGhost, setDragGhost] = useState(null); // {x, y}
  const longPressTimer = useRef(null);
  const dragRef = useRef({ active: false, taskId: null });
  const dayRefs = useRef({});

  const goWeek = (dir) => { const d = new Date(refDate); d.setDate(d.getDate() + dir * 7); setRefDate(d); };
  const goMonth = (dir) => { const d = new Date(refDate); d.setMonth(d.getMonth() + dir); setRefDate(d); };

  // Schedule helpers
  const toMins = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  const fmt = (hhmm) => {
    if (!hhmm) return "";
    const [h, m] = hhmm.split(":");
    const hh = Number(h);
    return `${hh > 12 ? hh - 12 : (hh || 12)}:${m} ${hh >= 12 ? "CH" : "SA"}`;
  };
  const endTime = (start, dur) => {
    const [h, m] = start.split(":").map(Number);
    const total = h * 60 + m + (dur || 60);
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  const isActive = (t) => {
    if (!t.startTime) return false;
    const s = toMins(t.startTime);
    return nowMins >= s && nowMins < s + (t.duration || 60);
  };
  const isPast = (t) => t.startTime && toMins(t.startTime) + (t.duration || 60) < nowMins;

  const weekDays = getWeekDays(refDate);
  const monthDays = getMonthDays(refDate.getFullYear(), refDate.getMonth());

  // Timeline tasks (sorted: newest first — deadline desc → startTime desc → priority)
  const timelineTasks = [...tasks].filter(t => t.status !== "done").sort((a, b) => {
    const da = a.deadline || "0000-00-00";
    const db = b.deadline || "0000-00-00";
    if (da !== db) return db.localeCompare(da);
    const ta = a.startTime || "00:00";
    const tb = b.startTime || "00:00";
    if (ta !== tb) return tb.localeCompare(ta);
    const po = { cao: 0, trung: 1, thap: 2, none: 3 };
    return (po[a.priority] ?? 3) - (po[b.priority] ?? 3);
  });

  // Day view data
  const timed = tasks.filter(t => t.startTime && t.status !== "done").sort((a, b) => a.startTime.localeCompare(b.startTime));
  const untimed = tasks.filter(t => !t.startTime && t.status !== "done").sort((a, b) => {
    const po = { cao: 0, trung: 1, thap: 2 };
    return (po[a.priority] || 1) - (po[b.priority] || 1);
  });

  // ═══ DRAG-DROP HANDLERS (Week/Month view) ═══
  const startDrag = useCallback((task, e) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { active: true, taskId: task.id };
    setDragTask(task);
    const pt = e.touches?.[0] || e;
    setDragGhost({ x: pt.clientX, y: pt.clientY });
  }, []);

  const handlePointerDown = useCallback((task, e) => {
    const pt = e.touches?.[0] || e;
    const startPos = { x: pt.clientX, y: pt.clientY };
    longPressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(30);
      startDrag(task, e);
    }, 400);
    // Cancel long press if moved too much
    const moveCheck = (ev) => {
      const p = ev.touches?.[0] || ev;
      if (Math.abs(p.clientX - startPos.x) > 10 || Math.abs(p.clientY - startPos.y) > 10) {
        clearTimeout(longPressTimer.current);
        document.removeEventListener("touchmove", moveCheck);
        document.removeEventListener("mousemove", moveCheck);
      }
    };
    document.addEventListener("touchmove", moveCheck, { passive: true });
    document.addEventListener("mousemove", moveCheck, { passive: true });
  }, [startDrag]);

  const handlePointerUp = useCallback(() => {
    clearTimeout(longPressTimer.current);
    if (!dragRef.current.active) return;

    // Drop on target day
    if (dragOverDay && dragTask && patchTask) {
      const newDeadline = fmtDate(new Date(dragOverDay));
      if (newDeadline !== dragTask.deadline) {
        patchTask(dragTask.id, { deadline: newDeadline });
      }
    }

    dragRef.current = { active: false, taskId: null };
    setDragTask(null);
    setDragOverDay(null);
    setDragGhost(null);
  }, [dragOverDay, dragTask, patchTask]);

  const handlePointerMove = useCallback((e) => {
    if (!dragRef.current.active) return;
    const pt = e.touches?.[0] || e;
    setDragGhost({ x: pt.clientX, y: pt.clientY });

    // Find which day cell we're over
    const refs = dayRefs.current;
    for (const [dateStr, el] of Object.entries(refs)) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (pt.clientX >= rect.left && pt.clientX <= rect.right && pt.clientY >= rect.top && pt.clientY <= rect.bottom) {
        setDragOverDay(dateStr);
        return;
      }
    }
    setDragOverDay(null);
  }, []);

  // Register day cell ref
  const setDayRef = useCallback((dateStr, el) => {
    dayRefs.current[dateStr] = el;
  }, []);

  return (
    <div style={{ animation: "fadeIn .2s" }}
      onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp} onTouchCancel={handlePointerUp}
      onMouseMove={handlePointerMove} onMouseUp={handlePointerUp}
    >
      {/* Drag ghost */}
      {dragTask && dragGhost && (
        <div style={{
          position: "fixed", left: dragGhost.x - 60, top: dragGhost.y - 20,
          width: 120, padding: "6px 10px",
          background: C.accent, color: "#fff", borderRadius: 10,
          fontSize: 11, fontWeight: 700, pointerEvents: "none",
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)", zIndex: 9999,
          opacity: 0.92, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {dragTask.title}
        </div>
      )}

      {/* View mode toggle */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {[["day", "Ngày"], ["week", "Tuần"], ["month", "Tháng"]].map(([k, l]) => (
          <button key={k} className="tap" onClick={() => setViewMode(k)}
            style={{ flex: 1, background: viewMode === k ? C.accent : C.card, color: viewMode === k ? "#fff" : C.sub, border: `1px solid ${viewMode === k ? C.accent : C.border}`, borderRadius: 10, padding: "7px", fontSize: 12, fontWeight: 600 }}>{l}</button>
        ))}
      </div>

      {/* ═══ DAY VIEW ═══ */}
      {viewMode === "day" && (
        <>
          <div style={{ background: `linear-gradient(135deg,${C.accentD},${C.purpleD})`, borderRadius: 14, border: `1px solid ${C.accent}33`, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 28 }}>&#x1F4C5;</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{now.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" })}</div>
              <div style={{ fontSize: 12, color: C.sub }}>Bây giờ {String(currentHour).padStart(2, "0")}:{String(currentMin).padStart(2, "0")} — {timed.length} việc có lịch</div>
            </div>
          </div>

          {timed.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <SL>LỊCH THEO GIỜ</SL>
              {timed.map(t => {
                const active = isActive(t);
                const past = isPast(t);
                const end = endTime(t.startTime, t.duration);
                return (
                  <div key={t.id} className="tap" onClick={() => onPress(t)} role="button" tabIndex={0}
                    style={{ display: "flex", gap: 12, marginBottom: 10, opacity: past ? 0.5 : 1 }}>
                    <div style={{ width: 54, flexShrink: 0, textAlign: "right", paddingTop: 2 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: active ? C.accent : C.text }}>{fmt(t.startTime)}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{t.duration || 60}ph</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ width: 11, height: 11, borderRadius: "50%", background: active ? C.accent : past ? C.muted : PRIORITIES[t.priority]?.color, flexShrink: 0, marginTop: 3, boxShadow: active ? `0 0 0 4px ${C.accentD}` : "" }} />
                      <div style={{ width: 2, flex: 1, background: C.border, minHeight: 20, marginTop: 3 }} />
                    </div>
                    <div style={{ flex: 1, background: active ? C.accentD : C.card, borderRadius: 12, border: `1px solid ${active ? C.accent : C.border}`, padding: "10px 12px", marginBottom: 2 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }}>{t.title}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: C.sub }}>{fmt(t.startTime)} - {fmt(end)}</span>
                        {t.category && <Chip>{t.category}</Chip>}
                        {active && <Chip color={C.accent}>Đang diễn ra</Chip>}
                        {past && <Chip color={C.muted}>Qua rồi</Chip>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {untimed.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <SL>CHƯA ĐẶT GIỜ</SL>
              {untimed.map(t => (
                <div key={t.id} className="tap" onClick={() => onPress(t)} role="button" tabIndex={0}
                  style={{ background: C.card, borderRadius: 12, border: `1px dashed ${C.border}`, padding: "11px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 3, height: 36, borderRadius: 2, background: PRIORITIES[t.priority]?.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                    {t.deadline && <div style={{ fontSize: 11, color: isOverdue(t) ? C.red : C.muted, marginTop: 2 }}>{t.deadline}</div>}
                  </div>
                  <span style={{ fontSize: 11, color: C.accent, fontWeight: 600 }}>+ Đặt giờ</span>
                </div>
              ))}
            </div>
          )}

          {timed.length === 0 && untimed.length === 0 && <Empty />}
        </>
      )}

      {/* ═══ WEEK VIEW (with drag-drop) ═══ */}
      {viewMode === "week" && (
        <>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
            <button className="tap" onClick={() => goWeek(-1)} aria-label="Tuần trước" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 12px", fontSize: 16, color: C.sub }}>&lt;</button>
            <div style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: 700, color: C.text }}>
              {weekDays[0].toLocaleDateString("vi-VN", { day: "numeric", month: "short" })} — {weekDays[6].toLocaleDateString("vi-VN", { day: "numeric", month: "short", year: "numeric" })}
            </div>
            <button className="tap" onClick={() => goWeek(1)} aria-label="Tuần sau" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 12px", fontSize: 16, color: C.sub }}>&gt;</button>
          </div>

          {!dragTask && (
            <div style={{ fontSize: 10, color: C.muted, textAlign: "center", marginBottom: 8 }}>
              Nhấn giữ task để kéo sang ngày khác
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 16 }}>
            {weekDays.map((d, i) => {
              const ds = fmtDate(d);
              const isToday = ds === todayS;
              const dayTasks = tasksOnDay(tasks, d);
              const isDragOver = dragOverDay === ds;
              return (
                <div key={i} ref={(el) => setDayRef(ds, el)}
                  style={{
                    background: isDragOver ? C.accentD : isToday ? C.accentD : C.card,
                    borderRadius: 10,
                    border: `${isDragOver ? "2px" : "1px"} solid ${isDragOver ? C.accent : isToday ? C.accent : C.border}`,
                    padding: "8px 4px", textAlign: "center", minHeight: 70,
                    transition: "border 0.15s, background 0.15s",
                  }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>{DAY_NAMES[i]}</div>
                  <div style={{ fontSize: 16, fontWeight: isToday ? 800 : 600, color: isToday ? C.accent : C.text, marginBottom: 4 }}>{d.getDate()}</div>
                  {dayTasks.slice(0, 3).map(t => (
                    <div key={t.id} className="tap"
                      onClick={() => { if (!dragRef.current.active) onPress(t); }}
                      onTouchStart={(e) => handlePointerDown(t, e)}
                      onMouseDown={(e) => handlePointerDown(t, e)}
                      style={{
                        background: dragTask?.id === t.id ? `${C.accent}44` : `${PRIORITIES[t.priority]?.color}22`,
                        borderRadius: 4, padding: "2px 3px", marginBottom: 2, fontSize: 9,
                        color: C.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        opacity: dragTask?.id === t.id ? 0.4 : 1,
                        userSelect: "none", WebkitUserSelect: "none",
                        cursor: "grab",
                      }}>
                      {t.title}
                    </div>
                  ))}
                  {dayTasks.length > 3 && <div style={{ fontSize: 9, color: C.muted }}>+{dayTasks.length - 3}</div>}
                  {isDragOver && dayTasks.length === 0 && (
                    <div style={{ fontSize: 9, color: C.accent, marginTop: 4 }}>Thả vào đây</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ═══ MONTH VIEW (with drag-drop) ═══ */}
      {viewMode === "month" && (
        <>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
            <button className="tap" onClick={() => goMonth(-1)} aria-label="Tháng trước" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 12px", fontSize: 16, color: C.sub }}>&lt;</button>
            <div style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: 700, color: C.text }}>
              {MONTH_NAMES[refDate.getMonth()]} {refDate.getFullYear()}
            </div>
            <button className="tap" onClick={() => goMonth(1)} aria-label="Tháng sau" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 12px", fontSize: 16, color: C.sub }}>&gt;</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 6 }}>
            {DAY_NAMES.map(d => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: C.muted, padding: 4 }}>{d}</div>)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 16 }}>
            {monthDays.map((d, i) => {
              if (!d) return <div key={`e${i}`} />;
              const ds = fmtDate(d);
              const isToday = ds === todayS;
              const dayTasks = tasksOnDay(tasks, d);
              const isDragOver = dragOverDay === ds;
              return (
                <div key={i} ref={(el) => setDayRef(ds, el)}
                  style={{
                    background: isDragOver ? C.accentD : isToday ? C.accentD : C.card,
                    borderRadius: 8,
                    border: `${isDragOver ? "2px" : "1px"} solid ${isDragOver ? C.accent : isToday ? C.accent : C.border}`,
                    padding: "6px 2px", textAlign: "center", minHeight: 44,
                    transition: "border 0.15s, background 0.15s",
                  }}>
                  <div style={{ fontSize: 13, fontWeight: isToday ? 800 : 500, color: isToday ? C.accent : C.text }}>{d.getDate()}</div>
                  {dayTasks.length > 0 && (
                    <div style={{ display: "flex", justifyContent: "center", gap: 2, marginTop: 3 }}>
                      {dayTasks.slice(0, 3).map(t => (
                        <div key={t.id}
                          onTouchStart={(e) => handlePointerDown(t, e)}
                          onMouseDown={(e) => handlePointerDown(t, e)}
                          style={{
                            width: 5, height: 5, borderRadius: "50%",
                            background: dragTask?.id === t.id ? C.accent : PRIORITIES[t.priority]?.color,
                            cursor: "grab",
                          }} />
                      ))}
                    </div>
                  )}
                  {dayTasks.length > 0 && <div style={{ fontSize: 8, color: C.muted, marginTop: 1 }}>{dayTasks.length}</div>}
                  {isDragOver && <div style={{ fontSize: 7, color: C.accent, marginTop: 2 }}>+</div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ═══ TIMELINE — always shown below calendar ═══ */}
      {timelineTasks.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <SL>TIMELINE CÔNG VIỆC</SL>
          {timelineTasks.map((t, i) => {
            const prev = i > 0 ? timelineTasks[i - 1] : null;
            const showDate = !prev || prev.deadline !== t.deadline;
            const isToday = t.deadline === todayS;
            const isPastD = t.deadline && t.deadline < todayS;
            const dotColor = isPastD ? C.red : isToday ? "#e67e22" : C.accent;
            const isLast = i === timelineTasks.length - 1;
            return (
              <div key={t.id}>
                {showDate && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: i > 0 ? "10px 0 4px" : "0 0 4px" }}>
                    <div style={{ width: 24, textAlign: "center", fontSize: 9, fontWeight: 700, color: isPastD ? C.red : isToday ? "#e67e22" : C.muted }}>
                      {t.deadline ? (isToday ? "Nay" : `${+t.deadline.slice(8)}/${+t.deadline.slice(5,7)}`) : "—"}
                    </div>
                    <div style={{ flex: 1, height: 1, background: C.border }} />
                  </div>
                )}
                <div style={{ display: "flex" }}>
                  <div style={{ width: 24, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ fontSize: 8, color: C.muted, fontWeight: 600, marginBottom: 2, minHeight: 10 }}>{t.startTime ? t.startTime.replace(/^0/,"").replace(/:00$/,"h").replace(/:/,"h") : ""}</div>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor, flexShrink: 0, zIndex: 1, border: "2px solid " + C.bg }} />
                    {!isLast && <div style={{ width: 1.5, flex: 1, background: C.border, minHeight: 8 }} />}
                  </div>
                  <div className="tap" onClick={() => onPress(t)} style={{ flex: 1, minWidth: 0, marginBottom: isLast ? 0 : 6, background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, borderTop: `2px solid ${PRIORITIES[t.priority]?.color || C.muted}`, padding: "8px 10px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{t.title}</div>
                    <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 8, color: STATUSES[t.status]?.color, fontWeight: 600, background: `${STATUSES[t.status]?.color}15`, borderRadius: 6, padding: "1px 4px" }}>{STATUSES[t.status]?.label}</span>
                      {t.startTime && <span style={{ fontSize: 9, color: C.muted }}>{t.startTime}{t.duration ? `—${t.duration}ph` : ""}</span>}
                      {t.category && <span style={{ fontSize: 9, color: C.muted }}>{t.category}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
