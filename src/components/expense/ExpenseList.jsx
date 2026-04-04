/* ExpenseList — List of expenses + add form */
import { useState } from "react";
import { C, PAYMENT_SOURCES, fmtMoney, todayStr } from "../../constants";

export default function ExpenseList({
  CATS, filtered, monthExpenses, filterCat, setFilterCat, listLimit, setListLimit,
  handleDeleteExpense, addExpense, onOpenQR, settings,
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newCat, setNewCat] = useState("personal");

  return (
    <div>
      {/* Category filter */}
      <div className="no-scrollbar" style={{ display: "flex", gap: 4, marginBottom: 10, overflowX: "auto" }}>
        <button className="tap" onClick={() => setFilterCat("all")}
          style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, flexShrink: 0,
            background: filterCat === "all" ? C.accent + "20" : C.card, color: filterCat === "all" ? C.accent : C.muted,
            border: `1px solid ${filterCat === "all" ? C.accent + "66" : C.border}` }}>
          Tat ca ({monthExpenses.length})
        </button>
        {Object.entries(CATS).map(([k, v]) => {
          const cnt = monthExpenses.filter(e => e.category === k).length;
          if (cnt === 0) return null;
          return (
            <button key={k} className="tap" onClick={() => setFilterCat(k)}
              style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, flexShrink: 0,
                background: filterCat === k ? v.color + "20" : C.card, color: filterCat === k ? v.color : C.muted,
                border: `1px solid ${filterCat === k ? v.color + "66" : C.border}` }}>
              {v.icon} {v.label} ({cnt})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 24, color: C.muted, fontSize: 13 }}>Chua co khoan chi nao</div>
      )}

      {filtered.slice(0, listLimit).map(e => {
        const cat = CATS[e.category] || { label: "Khac", icon: "\u{1F4E6}", color: C.muted };
        const src = PAYMENT_SOURCES[e.source] || { label: e.source, icon: "\u{1F4B3}" };
        const title = e.description || e.taskTitle || "Chi tieu";
        const fmtD = (d) => { if (!d) return ""; const p = d.split("-"); return p.length === 3 ? `${p[2]}/${p[1]}` : d; };
        return (
          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 4,
            background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, borderLeft: `3px solid ${cat.color}` }}>
            <span style={{ fontSize: 20 }}>{cat.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
              {e.taskTitle && e.description && (
                <div style={{ fontSize: 10, color: C.accent, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{"\u{1F4CB}"} {e.taskTitle}</div>
              )}
              <div style={{ fontSize: 10, color: C.muted, display: "flex", gap: 6, marginTop: 2 }}>
                <span>{fmtD(e.date)}</span>
                <span>{src.icon} {src.label}</span>
                {e.type === "standalone" && <span style={{ color: C.purple }}>{"\u2726"} Tu do</span>}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>{fmtMoney(e.amount)}</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: e.paid ? C.green : C.red, background: e.paid ? C.greenD : C.redD, borderRadius: 6, padding: "1px 6px", marginTop: 2 }}>
                {e.paid ? "Da chi" : "Chua chi"}
              </div>
              {e.approval === "pending" && (
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  {(settings.userRole === "director" || settings.userIndustryRole === "owner") ? (<>
                    <button className="tap" onClick={() => {/* patchExpense handled externally */}}
                      style={{ fontSize: 9, padding: "2px 8px", borderRadius: 6, background: C.green, color: "#fff", border: "none", fontWeight: 700, cursor: "pointer" }}>Duyet</button>
                    <button className="tap" onClick={() => {/* patchExpense handled externally */}}
                      style={{ fontSize: 9, padding: "2px 8px", borderRadius: 6, background: C.red, color: "#fff", border: "none", fontWeight: 700, cursor: "pointer" }}>Tu choi</button>
                  </>) : (
                    <span style={{ fontSize: 9, color: C.gold, fontWeight: 600 }}>{"\u23F3"} Cho duyet</span>
                  )}
                </div>
              )}
              {e.approval === "rejected" && (
                <div style={{ fontSize: 9, color: C.red, fontWeight: 600, marginTop: 2 }}>{"\u274C"} Tu choi</div>
              )}
              {e.type === "standalone" && handleDeleteExpense && (
                <span className="tap" onClick={() => handleDeleteExpense(e.id)}
                  style={{ fontSize: 10, color: C.muted, cursor: "pointer", marginTop: 2, display: "inline-block" }}>{"\u00D7"}</span>
              )}
            </div>
          </div>
        );
      })}

      {filtered.length > listLimit && (
        <button className="tap" onClick={() => setListLimit(l => l + 30)}
          style={{ width: "100%", background: C.accentD, color: C.accent, border: `1px solid ${C.accent}33`, borderRadius: 10, padding: "10px", fontSize: 12, fontWeight: 700, marginTop: 4 }}>
          Xem them ({filtered.length - listLimit} con lai)
        </button>
      )}
      {filtered.length > 0 && (
        <div style={{ textAlign: "center", padding: "10px", fontSize: 12, color: C.muted, fontWeight: 600 }}>
          Tong: {fmtMoney(filtered.reduce((s, e) => s + e.amount, 0))} ({filtered.length} khoan)
        </div>
      )}

      {/* Add standalone expense + QR */}
      {!showAddForm ? (
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button className="tap" onClick={() => setShowAddForm(true)}
            style={{ flex: 1, background: `${C.gold}15`, border: `1px dashed ${C.gold}66`, borderRadius: 12, padding: "12px", fontSize: 13, fontWeight: 600, color: C.gold }}>
            + Them chi tieu
          </button>
          {onOpenQR && (
            <button className="tap" onClick={onOpenQR}
              style={{ background: `${C.accent}12`, border: `1px solid ${C.accent}33`, borderRadius: 12, padding: "12px 16px", fontSize: 18, cursor: "pointer" }}>
              {"\u{1F4F1}"}
            </button>
          )}
        </div>
      ) : (
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.gold}44`, padding: "12px", marginTop: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gold, marginBottom: 8 }}>Chi tieu khac</div>
          <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Mo ta (VD: ca phe, taxi...)"
            style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: C.text, marginBottom: 6 }} />
          <input type="text" inputMode="numeric" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="So tien (VND)"
            style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 14, fontWeight: 700, color: C.gold, marginBottom: 6 }} />
          <div className="no-scrollbar" style={{ display: "flex", gap: 4, marginBottom: 8, overflowX: "auto" }}>
            {Object.entries(CATS).map(([k, v]) => (
              <button key={k} className="tap" onClick={() => setNewCat(k)}
                style={{ padding: "4px 8px", borderRadius: 16, fontSize: 10, fontWeight: 600, flexShrink: 0,
                  background: newCat === k ? v.color + "20" : C.bg, color: newCat === k ? v.color : C.muted,
                  border: `1px solid ${newCat === k ? v.color + "66" : C.border}` }}>
                {v.icon} {v.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="tap" onClick={() => {
              const amt = Number(newAmount.replace(/\D/g, "")) || 0;
              if (!amt) return;
              addExpense({
                id: Date.now(),
                description: newDesc.trim() || "Chi tieu khac",
                amount: amt,
                category: newCat,
                source: "cash",
                date: todayStr(),
                paid: true,
              });
              setNewDesc(""); setNewAmount(""); setNewCat("personal"); setShowAddForm(false);
            }} disabled={!newAmount.trim()}
              style={{ flex: 1, background: newAmount.trim() ? `linear-gradient(135deg,${C.gold},${C.accent})` : C.border, color: "#fff", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700 }}>
              Them
            </button>
            <button className="tap" onClick={() => { setShowAddForm(false); setNewDesc(""); setNewAmount(""); }}
              style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: C.muted, fontWeight: 600 }}>
              Huy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
