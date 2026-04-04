/* ExpenseSettingsTab — Chi tiêu */
import { C } from "../../constants";
import { Section, Toggle, SelectRow, IS } from "./SettingsHelpers";

export default function ExpenseSettingsTab({ settings, setSettings }) {
  return (
    <>
      <Section title="Ngân sách" />
      <div style={{ background:C.card, borderRadius:14, border:`1px solid ${C.border}`, padding:"14px", marginBottom:14 }}>
        <div style={{ fontSize:12, color:C.sub, marginBottom:6 }}>Ngân sách hàng tháng (VNĐ)</div>
        <input type="number" value={settings.monthlyBudget || ""} onChange={e => setSettings({ monthlyBudget: Number(e.target.value) || 0 })}
          placeholder="VD: 10000000" style={{ ...IS, fontSize:15, fontWeight:700, marginBottom:8 }} />
        <div style={{ fontSize:11, color:C.muted }}>Để 0 = không giới hạn</div>
      </div>

      <Section title="Báo cáo chi tiêu" />
      <Toggle label="Gửi email báo cáo" desc="Wory gửi tổng kết chi tiêu qua Gmail hàng ngày"
        value={!!settings.sendExpenseEmail} onChange={() => setSettings(s => ({ ...s, sendExpenseEmail: !s.sendExpenseEmail }))} />
      <SelectRow label="Giờ tổng kết" value={settings.expenseReportTime || "21:00"}
        onChange={v => setSettings({ expenseReportTime: v })}
        options={[["18:00","18:00"],["19:00","19:00"],["20:00","20:00"],["21:00","21:00"],["22:00","22:00"]]} />

      <Section title="Tài khoản thanh toán" />
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {[
          ["cash","💵 Tiền mặt"],["bank_vietcombank","🏦 Vietcombank"],["bank_techcombank","🏦 Techcombank"],
          ["bank_mbbank","🏦 MB Bank"],["bank_tpbank","🏦 TPBank"],["bank_acb","🏦 ACB"],
          ["bank_bidv","🏦 BIDV"],["bank_vietinbank","🏦 VietinBank"],["bank_agribank","🏦 Agribank"],
          ["bank_sacombank","🏦 Sacombank"],["bank_vpbank","🏦 VPBank"],["bank_other","🏦 NH khác"],
          ["momo","📱 MoMo"],["zalopay","📱 ZaloPay"],
        ].map(([k, l]) => {
          const active = (settings.bankAccounts || []).includes(k);
          return (
            <button key={k} className="tap" onClick={() => {
              const list = settings.bankAccounts || [];
              setSettings({ bankAccounts: active ? list.filter(x => x !== k) : [...list, k] });
            }}
              style={{ padding:"5px 10px", borderRadius:10, fontSize:11, fontWeight:600,
                background: active ? C.accent + "20" : C.bg,
                color: active ? C.accent : C.muted,
                border: `1px solid ${active ? C.accent + "66" : C.border}` }}>
              {l}
            </button>
          );
        })}
      </div>
    </>
  );
}
