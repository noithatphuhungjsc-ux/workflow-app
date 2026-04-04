/* AITab — AI & Giọng */
import { C } from "../../constants";
import { Toggle, SliderRow } from "./SettingsHelpers";

export default function AITab({ settings, setSettings }) {
  return (
    <>
      <Toggle label="Cho phép Wory chỉnh sửa công việc" desc="Thêm / sửa / xóa task qua AI chat hoặc voice"
        value={settings.woryCanEdit} onChange={() => setSettings(s => ({ ...s, woryCanEdit: !s.woryCanEdit }))} />
      {settings.woryCanEdit && (
        <div style={{ background:C.purpleD, borderRadius:12, padding:"12px 14px", fontSize:12, color:C.purple, lineHeight:1.6, marginBottom:10 }}>
          <b>Lưu ý:</b> Wory sẽ mô tả hành động và cho bạn xác nhận trước khi thực hiện.
        </div>
      )}
      {/* Wory tone / personality — only for manager/admin */}
      {settings.userRole !== "staff" && <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:6 }}>Phong cách nói của Wory</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {[
            { key: "friendly", label: "🤝 Thân thiện", desc: "Như bạn bè" },
            { key: "professional", label: "💼 Chuyên nghiệp", desc: "Ngắn gọn, lịch sự" },
            { key: "funny", label: "😄 Vui vẻ", desc: "Dí dỏm, hài hước" },
            { key: "strict", label: "📋 Nghiêm túc", desc: "Tập trung, kỷ luật" },
            { key: "caring", label: "💛 Quan tâm", desc: "Ân cần, chu đáo" },
          ].map(t => (
            <button key={t.key} className="tap" onClick={() => setSettings(s => ({ ...s, woryTone: t.key }))}
              style={{ padding:"8px 12px", borderRadius:10, fontSize:12, fontWeight:600, border:`1.5px solid ${(settings.woryTone || "friendly") === t.key ? C.accent : C.border}`, background:(settings.woryTone || "friendly") === t.key ? C.accentD : C.card, color:(settings.woryTone || "friendly") === t.key ? C.accent : C.sub, cursor:"pointer" }}>
              {t.label}
              <div style={{ fontSize:9, fontWeight:400, color:C.muted, marginTop:2 }}>{t.desc}</div>
            </button>
          ))}
        </div>
      </div>}

      <Toggle label="Đọc text (TTS)" desc="Wory đọc câu trả lời bằng giọng nói"
        value={settings.ttsEnabled} onChange={() => setSettings(s => ({ ...s, ttsEnabled: !s.ttsEnabled }))} />
      <SliderRow label="Tốc độ đọc" value={settings.ttsSpeed} onChange={v => setSettings({ ttsSpeed: v })}
        min={0.7} max={1.6} step={0.1} unit="x" />
    </>
  );
}
