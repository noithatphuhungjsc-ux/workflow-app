/* ================================================================
   SCHEDULE TAB — Daily timeline view
   ================================================================ */
import { C, PRIORITIES, isOverdue } from "../constants";
import { Chip, SL, Empty } from "../components";

export default function ScheduleTab({ tasks, onPress }) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin  = now.getMinutes();
  const nowMins = currentHour * 60 + currentMin;

  const toMins = (hhmm) => { const [h,m] = hhmm.split(":").map(Number); return h*60+m; };
  const fmt = (hhmm) => {
    if (!hhmm) return "";
    const [h,m] = hhmm.split(":");
    const hh = Number(h);
    return `${hh>12?hh-12:(hh||12)}:${m} ${hh>=12?"CH":"SA"}`;
  };
  const endTime = (start, dur) => {
    const [h,m] = start.split(":").map(Number);
    const total = h*60+m+(dur||60);
    return `${String(Math.floor(total/60)%24).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;
  };
  const isActive = (t) => {
    if (!t.startTime) return false;
    const s = toMins(t.startTime);
    return nowMins >= s && nowMins < s + (t.duration || 60);
  };
  const isPast = (t) => t.startTime && toMins(t.startTime) + (t.duration || 60) < nowMins;

  const timed = tasks.filter(t => t.startTime && t.status !== "done").sort((a,b) => a.startTime.localeCompare(b.startTime));
  const untimed = tasks.filter(t => !t.startTime && t.status !== "done").sort((a,b) => {
    const po = { cao:0, trung:1, thap:2 };
    return (po[a.priority]||1) - (po[b.priority]||1);
  });

  return (
    <div style={{ animation:"fadeIn .2s" }}>
      <div style={{ background:`linear-gradient(135deg,${C.accentD},${C.purpleD})`, borderRadius:14, border:`1px solid ${C.accent}33`, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ fontSize:28 }}>&#x1F4C5;</div>
        <div>
          <div style={{ fontSize:15, fontWeight:800, color:C.text }}>{now.toLocaleDateString("vi-VN",{weekday:"long",day:"numeric",month:"long"})}</div>
          <div style={{ fontSize:12, color:C.sub }}>Bây giờ {String(currentHour).padStart(2,"0")}:{String(currentMin).padStart(2,"0")} - {timed.length} việc có lịch</div>
        </div>
      </div>

      {timed.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <SL>LỊCH THEO GIỜ</SL>
          {timed.map(t => {
            const active = isActive(t);
            const past = isPast(t);
            const end = endTime(t.startTime, t.duration);
            return (
              <div key={t.id} className="tap" onClick={() => onPress(t)} role="button" tabIndex={0}
                style={{ display:"flex", gap:12, marginBottom:10, opacity: past ? 0.5 : 1 }}>
                <div style={{ width:54, flexShrink:0, textAlign:"right", paddingTop:2 }}>
                  <div style={{ fontSize:13, fontWeight:700, color: active ? C.accent : C.text }}>{fmt(t.startTime)}</div>
                  <div style={{ fontSize:10, color:C.muted }}>{t.duration || 60}ph</div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                  <div style={{ width:11, height:11, borderRadius:"50%", background: active ? C.accent : past ? C.muted : PRIORITIES[t.priority]?.color, flexShrink:0, marginTop:3, boxShadow: active ? `0 0 0 4px ${C.accentD}` : "" }} />
                  <div style={{ width:2, flex:1, background:C.border, minHeight:20, marginTop:3 }} />
                </div>
                <div style={{ flex:1, background: active ? C.accentD : C.card, borderRadius:12, border:`1px solid ${active ? C.accent : C.border}`, padding:"10px 12px", marginBottom:2 }}>
                  <div style={{ fontSize:13.5, fontWeight:700, lineHeight:1.3 }}>{t.title}</div>
                  <div style={{ display:"flex", gap:6, marginTop:5, flexWrap:"wrap", alignItems:"center" }}>
                    <span style={{ fontSize:11, color:C.sub }}>{fmt(t.startTime)} - {fmt(end)}</span>
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
        <div style={{ marginBottom:16 }}>
          <SL>CHƯA ĐẶT GIỜ -- nhấn để thêm thời gian</SL>
          {untimed.map(t => (
            <div key={t.id} className="tap" onClick={() => onPress(t)} role="button" tabIndex={0}
              style={{ background:C.card, borderRadius:12, border:`1px dashed ${C.border}`, padding:"11px 14px", marginBottom:8, display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:3, height:36, borderRadius:2, background:PRIORITIES[t.priority]?.color, flexShrink:0 }} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{t.title}</div>
                {t.deadline && <div style={{ fontSize:11, color: isOverdue(t) ? C.red : C.muted, marginTop:2 }}>{t.deadline}</div>}
              </div>
              <span style={{ fontSize:11, color:C.accent, fontWeight:600 }}>+ Đặt giờ</span>
            </div>
          ))}
        </div>
      )}

      {timed.length === 0 && untimed.length === 0 && <Empty />}
    </div>
  );
}
