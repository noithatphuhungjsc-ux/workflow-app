/* AppearanceTab — Giao diện */
import { C, t } from "../../constants";
import { Section, Toggle, SelectRow } from "./SettingsHelpers";

export default function AppearanceTab({ settings, setSettings }) {
  return (
    <>
      <Section title="Thông báo" />
      <Toggle label="Bật thông báo" desc="Nhận thông báo từ trình duyệt"
        value={settings.notificationsEnabled}
        onChange={() => {
          const next = !settings.notificationsEnabled;
          if (next && "Notification" in window && Notification.permission === "default") Notification.requestPermission();
          setSettings(s => ({ ...s, notificationsEnabled: next }));
        }} />
      <SelectRow label="Nhắc trước" value={String(settings.reminderMinutes)}
        onChange={v => setSettings({ reminderMinutes: Number(v) })}
        options={[["5","5 phút"],["10","10 phút"],["15","15 phút"],["30","30 phút"],["60","1 giờ"]]} />
      <Toggle label="Thông báo deadline" desc="Cảnh báo khi có deadline trong ngày"
        value={settings.notifyDeadline} onChange={() => setSettings(s => ({ ...s, notifyDeadline: !s.notifyDeadline }))} />
      <Toggle label="Thông báo quá hạn" desc="Cảnh báo khi task bị trễ"
        value={settings.notifyOverdue} onChange={() => setSettings(s => ({ ...s, notifyOverdue: !s.notifyOverdue }))} />

      <Section title="Hiển thị" />
      <SelectRow label="Tab mặc định" desc="Tab hiển thị khi mở app"
        value={settings.defaultTab} onChange={v => setSettings({ defaultTab: v })}
        options={[["tasks",t("task",settings)],["calendar","Lịch"],["inbox","Hộp thư"],["expense",t("expense",settings)],["report","Báo cáo"],["ai","AI"]]} />
      <SelectRow label="Bộ lọc mặc định" value={settings.defaultFilter}
        onChange={v => setSettings({ defaultFilter: v })}
        options={[["all","Tất cả"],["todo","Cần làm"],["inprogress","Đang làm"],["review","Chờ duyệt"],["done","Xong"]]} />
      <Toggle label="Hiển thị task đã hoàn thành" value={settings.showCompletedTasks}
        onChange={() => setSettings(s => ({ ...s, showCompletedTasks: !s.showCompletedTasks }))} />
      <SelectRow label="Thuận tay" value={settings.handSide || "right"}
        onChange={v => setSettings({ handSide: v })}
        options={[["right","Phải"],["left","Trái"]]} />

      <Section title="Tab hiển thị" />
      <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>Bật/tắt các tab trên thanh điều hướng</div>
      {[["tasks","📋",t("task",settings)],["calendar","📅","Lịch"],["inbox","💬","Trao đổi"],["expense","💰",t("expense",settings)],["report","📊","Báo cáo"],["ai","✦","Wory"]].map(([key,icon,label]) => {
        const isOn = (settings.visibleTabs || {})[key] !== false;
        return (
          <Toggle key={key} label={`${icon} ${label}`}
            value={isOn}
            onChange={() => setSettings(s => ({
              ...s,
              visibleTabs: { ...(s.visibleTabs || {}), [key]: !isOn }
            }))} />
        );
      })}

      <Section title="Cỡ chữ" />
      <div style={{ display:"flex", gap:8, padding:"4px 0" }}>
        {[["1","Nhỏ"],["1.08","Vừa"],["1.15","Lớn"],["1.22","Rất lớn"]].map(([v,label]) => {
          const active = String(settings.fontScale || 1) === v;
          return (
            <button key={v} className="tap" onClick={() => setSettings({ fontScale: Number(v) })}
              style={{
                flex:1, padding:"10px 4px", borderRadius:12, border: active ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                background: active ? C.accent+"18" : C.card, cursor:"pointer", textAlign:"center",
              }}>
              <div style={{ fontSize: 11 * Number(v), fontWeight:700, color: active ? C.accent : C.text, lineHeight:1.2 }}>Aa</div>
              <div style={{ fontSize:10, color: active ? C.accent : C.muted, marginTop:4, fontWeight: active ? 700 : 400 }}>{label}</div>
              <div style={{ fontSize:9, color:C.muted }}>{Math.round(Number(v)*100)}%</div>
            </button>
          );
        })}
      </div>
    </>
  );
}
