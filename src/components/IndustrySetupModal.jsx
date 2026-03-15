/* ================================================================
   IndustrySetupModal — Chọn ngành để thu nhỏ app vừa đúng nhu cầu
   + Onboarding wizard (3 bước) sau khi chọn ngành lần đầu
   ================================================================ */
import { useState } from "react";
import { C } from "../constants";
import { INDUSTRY_LIST, INDUSTRY_PRESETS } from "../industryPresets";
import { useStore } from "../store";

const ONBOARD_STEPS = (preset) => [
  {
    icon: "🎯",
    title: `App đã sẵn sàng cho ${preset?.name || "ngành của bạn"}`,
    desc: `Giao diện và tính năng đã được tối ưu. Các tab không cần thiết đã được ẩn, chỉ giữ lại những gì phù hợp.`,
    detail: preset?.visibleTabs
      ? `Tab hiện: ${Object.entries(preset.visibleTabs).filter(([,v]) => v !== false).map(([k]) => ({ tasks: "Việc", calendar: "Lịch", inbox: "Hộp thư", expense: "Chi tiêu", report: "Báo cáo", ai: "AI" }[k] || k)).join(", ")}`
      : null,
  },
  {
    icon: "📋",
    title: "Quy trình & chi tiêu theo ngành",
    desc: "Quy trình làm việc và danh mục chi tiêu đã được nạp sẵn theo ngành. Bạn có thể tùy chỉnh thêm trong Cài đặt.",
    detail: preset?.expenseCategories
      ? `Danh mục: ${Object.values(preset.expenseCategories).map(c => `${c.icon} ${c.label}`).join(", ")}`
      : null,
  },
  {
    icon: "🤖",
    title: "Wory AI hiểu ngành của bạn",
    desc: "Trợ lý AI Wory đã được bổ sung kiến thức chuyên ngành. Hãy hỏi bất cứ điều gì liên quan đến công việc!",
    detail: "Vào tab AI để trò chuyện với Wory",
  },
];

export default function IndustrySetupModal({ onClose, isChange = false }) {
  const { applyIndustryPreset, settings } = useStore();
  const [selected, setSelected] = useState(isChange ? settings.industryPreset : "");
  const [applying, setApplying] = useState(false);
  const [confirmChange, setConfirmChange] = useState(false);
  const [onboardStep, setOnboardStep] = useState(-1); // -1 = not started

  const preset = selected ? INDUSTRY_PRESETS[selected] : null;
  const steps = preset ? ONBOARD_STEPS(preset) : [];

  const handleApply = () => {
    if (!selected) return;
    if (isChange && !confirmChange) { setConfirmChange(true); return; }
    setApplying(true);
    setTimeout(() => {
      applyIndustryPreset(selected, !isChange);
      if (!isChange) {
        // First time → show onboarding
        setTimeout(() => { setApplying(false); setOnboardStep(0); }, 600);
      } else {
        setTimeout(() => onClose(), 600);
      }
    }, 400);
  };

  const nextStep = () => {
    if (onboardStep < steps.length - 1) {
      setOnboardStep(onboardStep + 1);
    } else {
      onClose();
    }
  };

  // ═══ ONBOARDING VIEW ═══
  if (onboardStep >= 0 && onboardStep < steps.length) {
    const step = steps[onboardStep];
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}>
        <div style={{
          background: C.surface, borderRadius: 20, width: "100%", maxWidth: 400,
          padding: "32px 24px 24px", textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          animation: "fadeIn .3s",
        }}>
          {/* Progress dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24 }}>
            {steps.map((_, i) => (
              <div key={i} style={{
                width: i === onboardStep ? 24 : 8, height: 8, borderRadius: 4,
                background: i === onboardStep ? C.accent : i < onboardStep ? C.green : C.border,
                transition: "all .3s",
              }} />
            ))}
          </div>

          <div style={{ fontSize: 48, marginBottom: 12 }}>{step.icon}</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: "0 0 8px" }}>{step.title}</h2>
          <p style={{ fontSize: 14, color: C.sub, lineHeight: 1.5, margin: "0 0 12px" }}>{step.desc}</p>

          {step.detail && (
            <div style={{
              background: C.card, borderRadius: 10, border: `1px solid ${C.border}`,
              padding: "10px 14px", fontSize: 12, color: C.muted, lineHeight: 1.5,
              marginBottom: 20, textAlign: "left",
            }}>
              {step.detail}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            {onboardStep < steps.length - 1 && (
              <button className="tap" onClick={() => onClose()}
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 12,
                  background: C.card, border: `1px solid ${C.border}`,
                  color: C.muted, fontSize: 14, fontWeight: 500, cursor: "pointer",
                }}>
                Bỏ qua
              </button>
            )}
            <button className="tap" onClick={nextStep}
              style={{
                flex: 1, padding: "12px 0", borderRadius: 12,
                background: C.accent, border: "none", color: "#fff",
                fontSize: 14, fontWeight: 700, cursor: "pointer",
              }}>
              {onboardStep === steps.length - 1 ? "Bắt đầu sử dụng" : "Tiếp theo →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══ INDUSTRY SELECTION VIEW ═══
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}>
      <div style={{
        background: C.surface, borderRadius: 20, width: "100%", maxWidth: 440,
        maxHeight: "90vh", overflow: "auto", padding: "28px 20px 20px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>
            {applying ? "⚡" : "🏢"}
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>
            {applying ? "Đang thiết lập..." : isChange ? "Đổi ngành nghề" : "Chọn ngành nghề"}
          </h2>
          <p style={{ fontSize: 13, color: C.muted, margin: "6px 0 0" }}>
            {applying
              ? "App đang được cấu hình cho ngành của bạn"
              : "Chọn ngành để app tự động cấu hình phù hợp"}
          </p>
        </div>

        {/* Loading state */}
        {applying && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div className="spin" style={{
              width: 40, height: 40, border: `3px solid ${C.border}`,
              borderTopColor: C.accent, borderRadius: "50%",
              margin: "0 auto 16px", animation: "spin 0.8s linear infinite",
            }} />
            <p style={{ fontSize: 14, color: C.accent, fontWeight: 600 }}>
              {INDUSTRY_LIST.find(p => p.id === selected)?.name}
            </p>
          </div>
        )}

        {/* Confirm change warning */}
        {confirmChange && !applying && (
          <div style={{
            background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 12,
            padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#856404",
          }}>
            <strong>Lưu ý:</strong> Đổi ngành sẽ cập nhật lại cài đặt mặc định, quy trình, và danh mục chi tiêu.
            Công việc hiện tại <strong>không bị xóa</strong>.
          </div>
        )}

        {/* Industry Grid */}
        {!applying && (
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
            marginBottom: 20,
          }}>
            {INDUSTRY_LIST.map(preset => {
              const isActive = selected === preset.id;
              return (
                <button key={preset.id} className="tap"
                  onClick={() => { setSelected(preset.id); setConfirmChange(false); }}
                  style={{
                    background: isActive ? `${C.accent}12` : C.card,
                    border: `2px solid ${isActive ? C.accent : C.border}`,
                    borderRadius: 14, padding: "14px 12px", cursor: "pointer",
                    textAlign: "center", transition: "all .2s",
                    transform: isActive ? "scale(1.02)" : "scale(1)",
                  }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>{preset.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isActive ? C.accent : C.text, lineHeight: 1.3 }}>
                    {preset.name}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.3 }}>
                    {preset.description}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Actions */}
        {!applying && (
          <div style={{ display: "flex", gap: 10 }}>
            {isChange && (
              <button className="tap" onClick={onClose}
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 12,
                  background: C.card, border: `1px solid ${C.border}`,
                  color: C.sub, fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}>
                Hủy
              </button>
            )}
            <button className="tap" onClick={handleApply}
              disabled={!selected}
              style={{
                flex: 1, padding: "12px 0", borderRadius: 12,
                background: selected ? C.accent : C.border,
                border: "none", color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: selected ? "pointer" : "default",
                opacity: selected ? 1 : 0.5,
              }}>
              {confirmChange ? "Xác nhận đổi ngành" : isChange ? "Đổi ngành" : "Bắt đầu"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
