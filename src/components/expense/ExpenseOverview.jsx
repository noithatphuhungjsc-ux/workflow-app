/* ExpenseOverview — Summary/overview section */
import { C, PAYMENT_SOURCES, fmtMoney } from "../../constants";
import { SL } from "../../components";

export default function ExpenseOverview({ CATS, totalToday, totalPaid, totalUnpaid, totalMonth, byCat, bySource }) {
  return (
    <div>
      {/* Quick stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "12px", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.gold }}>{fmtMoney(totalToday)}</div>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Hom nay</div>
        </div>
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "12px", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.green }}>{fmtMoney(totalPaid)}</div>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Da chi</div>
        </div>
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "12px", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.red }}>{fmtMoney(totalUnpaid)}</div>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Chua chi</div>
        </div>
      </div>

      {/* By category */}
      <SL>PHAN LOAI CHI</SL>
      <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "12px", marginBottom: 14 }}>
        {byCat.length === 0 && <div style={{ textAlign: "center", padding: 12, color: C.muted, fontSize: 13 }}>Chua co khoan chi</div>}
        {byCat.map(([k, v]) => {
          const cat = CATS[k] || { label: k, icon: "\u{1F4E6}", color: C.muted };
          const pct = totalMonth > 0 ? Math.round(v / totalMonth * 100) : 0;
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}22` }}>
              <span style={{ fontSize: 18 }}>{cat.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{cat.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: cat.color }}>{fmtMoney(v)}</span>
                </div>
                <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: cat.color, borderRadius: 2 }} />
                </div>
              </div>
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, width: 30, textAlign: "right" }}>{pct}%</span>
            </div>
          );
        })}
      </div>

      {/* By source */}
      <SL>NGUON THANH TOAN</SL>
      <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: "12px", marginBottom: 14 }}>
        {bySource.length === 0 && <div style={{ textAlign: "center", padding: 12, color: C.muted, fontSize: 13 }}>Chua co du lieu</div>}
        {bySource.map(([k, v]) => {
          const src = PAYMENT_SOURCES[k] || { label: k, icon: "\u{1F4B3}" };
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}22` }}>
              <span style={{ fontSize: 16 }}>{src.icon}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.text }}>{src.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>{fmtMoney(v)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
