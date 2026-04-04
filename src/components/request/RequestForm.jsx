/* RequestForm — Create/edit request form */
import { useState } from "react";
import { C } from "../../constants";

const REQUEST_TYPES = [
  { key: "purchase", icon: "\u{1F6D2}", label: "Mua sam", color: "#e67e22" },
  { key: "advance",  icon: "\u{1F4B5}", label: "Tam ung", color: "#3498db" },
  { key: "payment",  icon: "\u{1F4B3}", label: "Thanh toan", color: "#9b59b6" },
  { key: "document", icon: "\u{1F4C4}", label: "Giay to", color: "#2ecc71" },
  { key: "record",   icon: "\u{1F4C1}", label: "Ho so", color: "#6a7fd4" },
];

export default function RequestForm({ onSubmit, onCancel }) {
  const [type, setType] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [priority, setPriority] = useState("normal");

  if (!type) {
    return (
      <div style={{ padding: 16, animation: "fadeIn .2s" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <button className="tap" onClick={onCancel}
            style={{ background: "none", border: "none", fontSize: 14, color: C.accent, fontWeight: 600, cursor: "pointer" }}>
            {"\u2190"} Quay lai
          </button>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 16 }}>Chon loai yeu cau</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {REQUEST_TYPES.map(t => (
            <button key={t.key} className="tap" onClick={() => setType(t.key)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                padding: "20px 10px", borderRadius: 16, cursor: "pointer",
                background: C.card, border: `1px solid ${C.border}`,
              }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: `${t.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
                {t.icon}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const typeInfo = REQUEST_TYPES.find(t => t.key === type);
  const showAmount = ["purchase", "advance", "payment"].includes(type);

  return (
    <div style={{ padding: 16, animation: "fadeIn .2s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button className="tap" onClick={() => setType(null)}
          style={{ background: "none", border: "none", fontSize: 14, color: C.accent, fontWeight: 600, cursor: "pointer" }}>
          {"\u2190"} Quay lai
        </button>
        <span style={{ fontSize: 20 }}>{typeInfo?.icon}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{typeInfo?.label}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Tieu de yeu cau *"
          className="input-base" style={{ fontSize: 15, padding: "12px 14px" }} autoFocus />
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Mo ta chi tiet..."
          className="input-base" rows={3} style={{ fontSize: 14, padding: "12px 14px", resize: "vertical" }} />
        {showAmount && (
          <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="So tien (VND)"
            className="input-base" style={{ fontSize: 15, padding: "12px 14px" }} inputMode="numeric" />
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="tap" onClick={() => setPriority(priority === "normal" ? "urgent" : "normal")}
            style={{
              padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              border: priority === "urgent" ? "1.5px solid #e74c3c" : `1px solid ${C.border}`,
              background: priority === "urgent" ? "#e74c3c12" : C.card,
              color: priority === "urgent" ? "#e74c3c" : C.muted,
            }}>
            {priority === "urgent" ? "\u{1F534} Khan cap" : "Binh thuong"}
          </button>
        </div>
        <button className="tap" onClick={() => {
          if (!title.trim()) { alert("Vui long nhap tieu de"); return; }
          onSubmit({ type, title: title.trim(), description: description.trim(), amount: amount || null, priority });
        }}
          disabled={!title.trim()}
          style={{
            padding: 14, borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, marginTop: 8,
            background: title.trim() ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : C.border,
            color: "#fff", cursor: title.trim() ? "pointer" : "default",
          }}>
          Gui yeu cau
        </button>
      </div>
    </div>
  );
}
