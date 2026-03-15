/* ================================================================
   OnboardingGuide — 4-step spotlight tooltip after industry preset
   Uses getBoundingClientRect to position spotlight + tooltip
   ================================================================ */
import { useState, useEffect, useCallback } from "react";
import { C } from "../constants";

const STEPS = [
  { target: "[data-guide='nav-tasks']", title: "Công việc", desc: "Xem, thêm và quản lý công việc hàng ngày", icon: "📋" },
  { target: "[data-guide='nav-ai']", title: "Trợ lý Wory", desc: "Chat với AI để phân tích, lên kế hoạch", icon: "✦" },
  { target: "[data-guide='qr']", title: "Chi tiêu nhanh", desc: "Quét QR, chụp bill, ghi chi tiêu tức thì", icon: "🧾" },
  { target: "[data-guide='nav-dashboard']", title: "Tổng quan", desc: "Xem thống kê KPI, tiến độ dự án", icon: "📊" },
];

export default function OnboardingGuide({ onComplete }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);

  const updateRect = useCallback(() => {
    const el = document.querySelector(STEPS[step]?.target);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
  }, [step]);

  useEffect(() => {
    updateRect();
    window.addEventListener("resize", updateRect);
    return () => window.removeEventListener("resize", updateRect);
  }, [updateRect]);

  const next = () => {
    if (step >= STEPS.length - 1) {
      localStorage.setItem("wf_onboard_done", "1");
      onComplete();
    } else {
      setStep(s => s + 1);
    }
  };

  const skip = () => {
    localStorage.setItem("wf_onboard_done", "1");
    onComplete();
  };

  if (!rect) return null;

  const s = STEPS[step];
  const pad = 6;
  const tooltipTop = rect.top > 200;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99999 }} onClick={next}>
      {/* Dark overlay with cutout */}
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(0,0,0,.55)",
        WebkitMaskImage: `radial-gradient(ellipse ${rect.width/2+pad+20}px ${rect.height/2+pad+20}px at ${rect.left+rect.width/2}px ${rect.top+rect.height/2}px, transparent 70%, black 71%)`,
        maskImage: `radial-gradient(ellipse ${rect.width/2+pad+20}px ${rect.height/2+pad+20}px at ${rect.left+rect.width/2}px ${rect.top+rect.height/2}px, transparent 70%, black 71%)`,
      }} />

      {/* Highlight ring */}
      <div style={{
        position: "absolute",
        top: rect.top - pad, left: rect.left - pad,
        width: rect.width + pad * 2, height: rect.height + pad * 2,
        borderRadius: 14, border: `2px solid ${C.accent}`,
        boxShadow: `0 0 0 4px ${C.accent}33`,
        animation: "pulse 1.5s infinite",
        pointerEvents: "none",
      }} />

      {/* Tooltip */}
      <div onClick={e => e.stopPropagation()} style={{
        position: "absolute",
        [tooltipTop ? "bottom" : "top"]: tooltipTop ? `${window.innerHeight - rect.top + 16}px` : `${rect.top + rect.height + 16}px`,
        left: "50%", transform: "translateX(-50%)",
        background: "#fff", borderRadius: 16, padding: "16px 18px",
        width: 280, boxShadow: "0 8px 32px rgba(0,0,0,.2)",
        animation: "scaleIn .25s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 22 }}>{s.icon}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{s.title}</div>
            <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.4 }}>{s.desc}</div>
          </div>
        </div>

        {/* Progress + buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          {/* Dots */}
          <div style={{ display: "flex", gap: 4, flex: 1 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{
                width: i === step ? 16 : 6, height: 6, borderRadius: 3,
                background: i === step ? C.accent : C.border,
                transition: "width .2s",
              }} />
            ))}
          </div>
          <button onClick={skip} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>Bỏ qua</button>
          <button className="tap" onClick={next} style={{
            background: C.accent, color: "#fff", border: "none", borderRadius: 8,
            padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            {step >= STEPS.length - 1 ? "Xong" : "Tiếp"}
          </button>
        </div>
      </div>
    </div>
  );
}
