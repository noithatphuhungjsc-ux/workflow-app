/* ================================================================
   ChangelogView — Standalone changelog overlay
   - Each item clickable → navigate to relevant tab
   - Back button preserves scroll position
   ================================================================ */
import { useState, useRef, useCallback, useEffect } from "react";
import { C } from "../constants";
import { CHANGELOG } from "../changelog";

/* Hardcoded overrides for ambiguous texts (keyword appears but isn't the main feature) */
const TARGET_OVERRIDES = {
  "PWA — cài đặt như app native": null,
  "Desktop responsive — giao diện mở rộng 640-900px cho màn hình lớn": null,
  "Audit log — ghi nhận mọi thao tác (task, expense, settings)": null,
  "Xuất báo cáo CSV/PDF — export tasks & chi tiêu": "report",
  "Push notification nâng cao — thông báo khi giao việc/duyệt chi tiêu": null,
};

/* Map change text → target tab */
function getTarget(text) {
  if (text in TARGET_OVERRIDES) return TARGET_OVERRIDES[text];
  const lc = text.toLowerCase();
  // Exact/specific matches first
  if (/dashboard|tổng quan|kpi|donut|weekly trend|priority breakdown/.test(lc)) return "dashboard";
  if (/calendar|drag.?drop|kéo.*ngày/.test(lc)) return "calendar";
  if (/chi tiêu|expense|hóa đơn|duyệt chi|ngân sách|qr thanh toán|vietqr|bill/.test(lc)) return "expense";
  if (/chat|gọi thoại|webrtc|realtime|trao đổi/.test(lc)) return "inbox";
  if (/hộp thư|inbox/.test(lc)) return "inbox";
  if (/gmail|telegram/.test(lc)) return "inbox";
  if (/báo cáo ai|báo cáo.*csv|csv.*pdf|xuất báo cáo/.test(lc)) return "report";
  if (/wory|ai assistant|trò chuyện.*phân tích/.test(lc)) return "ai";
  if (/nhân sự|staff|quản lý.*nhân/.test(lc)) return "settings";
  if (/ngành nghề|industry|onboarding|terminology/.test(lc)) return "settings";
  if (/cài đặt|setting|giao diện|tab ẩn/.test(lc)) return "settings";
  if (/task template|mẫu công việc/.test(lc)) return "settings";
  if (/dự án|project|tiến độ/.test(lc)) return "tasks";
  if (/công việc|tạo.*sửa.*xóa|subtask/.test(lc)) return "tasks";
  if (/lịch.*ngày|lịch.*tuần|lịch.*tháng/.test(lc)) return "calendar";
  if (/timer|đếm giờ/.test(lc)) return "tasks";
  // No link for these
  if (/thông báo|notification|push/.test(lc)) return null;
  if (/pwa|offline|desktop|responsive|voice add|giọng nói/.test(lc)) return null;
  if (/đăng nhập|tài khoản.*2fa|cloud sync|error boundary|cors|code splitting|lazy|hooks|rbac|multi.?tenant|audit log|changelog/.test(lc)) return null;
  return null;
}

const typeColors = { major: C.accent, minor: C.green, fix: C.gold };
const typeLabels = { major: "Lớn", minor: "Nhỏ", fix: "Sửa lỗi" };

export default function ChangelogView({ onClose, onNavigate, initialScrollY = 0 }) {
  const scrollRef = useRef(null);

  // Restore scroll position when re-opened
  useEffect(() => {
    if (initialScrollY > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = initialScrollY;
    }
  }, [initialScrollY]);

  const handleItemClick = useCallback((target) => {
    if (!target) return;
    // Save scroll position
    const y = scrollRef.current?.scrollTop || 0;
    if (target === "settings") {
      onNavigate(null, "settings", y);
    } else {
      onNavigate(target, null, y);
    }
  }, [onNavigate]);

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
      background: "#faf8f5", display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
        background: "#fff", borderBottom: `1px solid ${C.border}`, flexShrink: 0,
      }}>
        <button className="tap" onClick={onClose} style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 18, color: C.text, padding: "2px 6px",
        }}>←</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Lịch sử cập nhật</div>
          <div style={{ fontSize: 10, color: C.muted }}>Phiên bản hiện tại: v{CHANGELOG[0]?.version}</div>
        </div>
      </div>

      {/* Content */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 14px 40px" }}>
        {/* Tip */}
        <div style={{
          fontSize: 11, color: C.accent, background: C.accentD, borderRadius: 10,
          padding: "8px 12px", marginBottom: 14, textAlign: "center", fontWeight: 600,
        }}>
          Nhấn vào tính năng để xem trực tiếp
        </div>

        {CHANGELOG.map((release, ri) => {
          const isLatest = ri === 0;
          return (
            <div key={release.version} style={{ marginBottom: 18 }}>
              {/* Version header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontSize: 14, fontWeight: 800, color: isLatest ? C.accent : C.text,
                    background: isLatest ? C.accentD : "transparent",
                    borderRadius: 8, padding: isLatest ? "2px 8px" : 0,
                  }}>v{release.version}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, borderRadius: 6, padding: "2px 6px",
                    color: typeColors[release.type], background: `${typeColors[release.type]}18`,
                  }}>{typeLabels[release.type]}</span>
                  {isLatest && <span style={{ fontSize: 9, fontWeight: 700, borderRadius: 6, padding: "2px 6px", color: C.green, background: C.greenD }}>MỚI</span>}
                </div>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: C.muted }}>{release.date}</span>
              </div>
              {/* Title */}
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>{release.title}</div>
              {/* Changes */}
              <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                {release.changes.map((ch, ci) => {
                  const target = getTarget(ch.text);
                  const clickable = !!target;
                  return (
                    <div key={ci}
                      className={clickable ? "tap" : ""}
                      onClick={clickable ? () => handleItemClick(target) : undefined}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 8,
                        padding: "8px 12px",
                        borderBottom: ci < release.changes.length - 1 ? `1px solid ${C.border}22` : "none",
                        cursor: clickable ? "pointer" : "default",
                        transition: "background .15s",
                      }}>
                      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{ch.icon}</span>
                      <span style={{ fontSize: 12, color: C.text, lineHeight: 1.5, flex: 1 }}>{ch.text}</span>
                      {clickable && (
                        <span style={{ fontSize: 11, color: C.muted, flexShrink: 0, marginTop: 2 }}>→</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Floating back-to-changelog dot */
export function ChangelogBackButton({ onClick }) {
  return (
    <button className="tap" onClick={onClick} title="Quay lại Changelog" style={{
      position: "fixed", bottom: 72, right: 14, zIndex: 999,
      background: C.accent, color: "#fff", border: "none",
      width: 36, height: 36, borderRadius: "50%",
      fontSize: 14, fontWeight: 700,
      boxShadow: "0 2px 10px rgba(0,0,0,.18)", cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      ↩
    </button>
  );
}
