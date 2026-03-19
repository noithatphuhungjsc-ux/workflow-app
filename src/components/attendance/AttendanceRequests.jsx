/* ================================================================
   ATTENDANCE REQUESTS — Submit correction/leave/overtime requests
   ================================================================ */
import { useState } from "react";
import { C } from "../../constants";

export default function AttendanceRequests({ userId, onSubmit, onClose }) {
  const [type, setType] = useState("correction");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) return alert("Nhap ly do");
    setSubmitting(true);
    try {
      await onSubmit({ userId, date, type, reason: reason.trim() });
      onClose?.();
    } catch (e) {
      alert("Loi: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.surface, borderRadius: 16, padding: 20, width: "100%", maxWidth: 360 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Gui yeu cau</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, color: C.muted, cursor: "pointer" }}>&times;</button>
        </div>

        {/* Type selector */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[["correction", "Dieu chinh"], ["leave", "Nghi phep"], ["overtime", "Tang ca"]].map(([key, label]) => (
            <button key={key} onClick={() => setType(key)}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${type === key ? C.accent : C.border}`,
                background: type === key ? C.accentD : "none", color: type === key ? C.accent : C.muted,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Date */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 4 }}>Ngay</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box" }} />
        </div>

        {/* Reason */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: C.muted, display: "block", marginBottom: 4 }}>Ly do *</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Nhap ly do..."
            rows={3}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, resize: "none", boxSizing: "border-box" }} />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.muted, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Huy
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: submitting ? C.border : C.accent, color: submitting ? C.muted : "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            {submitting ? "Dang gui..." : "Gui yeu cau"}
          </button>
        </div>
      </div>
    </div>
  );
}
