/* ================================================================
   EXPENSE TAB — Phiên bản gọn (1 view)
   - Header compact + thống kê 3 ô (Hôm nay / Tháng / Chưa chi)
   - Filter: tháng dropdown + category pills
   - List + nút "+ Thêm" inline
   - Wory chi tiêu vẫn dùng floating button chung
   ================================================================ */
import { useState, useCallback, useMemo, useRef } from "react";
import { C, EXPENSE_CATEGORIES, fmtMoney, todayStr, MONTH_NAMES, t } from "../constants";
import ExpenseList from "../components/expense/ExpenseList";

export default function ExpenseTab({ tasks, expenses = [], addExpense, deleteExpense, settings, user, onOpenQR }) {
  const CATS = settings.industryExpenseCategories || EXPENSE_CATEGORIES;
  const [filterCat, setFilterCat] = useState("all");
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [listLimit, setListLimit] = useState(30);
  const [undoExpense, setUndoExpense] = useState(null);
  const undoTimerRef = useRef(null);

  const handleDeleteExpense = useCallback((id) => {
    const exp = expenses.find(e => e.id === id);
    if (!exp) { deleteExpense(id); return; }
    setUndoExpense(exp);
    deleteExpense(id);
    clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoExpense(null), 5000);
  }, [expenses, deleteExpense]);

  const handleUndo = useCallback(() => {
    if (undoExpense) { addExpense(undoExpense); setUndoExpense(null); clearTimeout(undoTimerRef.current); }
  }, [undoExpense, addExpense]);

  // Merge standalone + task expenses
  const allExpenses = useMemo(() => {
    const standalone = expenses.map(e => ({
      id: e.id, type: "standalone", taskId: e.taskId || null, taskTitle: e.taskTitle || "",
      description: e.description || "", amount: e.amount || 0, category: e.category || "other",
      source: e.source || "cash", date: e.date || todayStr(), paid: e.paid !== false, billPhoto: e.billPhoto || null,
    }));
    const standaloneTaskIds = new Set(standalone.filter(e => e.taskId).map(e => e.taskId));
    const fromTasks = [];
    tasks.filter(t => t.expense?.amount > 0 && !t.deleted && !standaloneTaskIds.has(t.id)).forEach(t => {
      const items = t.expense.items;
      if (items?.length > 0) {
        items.forEach(item => {
          if (item.amount > 0) fromTasks.push({
            id: `${t.id}-${item.id}`, type: "task", taskId: t.id, taskTitle: t.title,
            description: item.desc || "", amount: item.amount, category: item.category || "other",
            source: "cash", date: t.expense.date || t.deadline || todayStr(), paid: !!item.paid, billPhoto: null,
          });
        });
      } else {
        fromTasks.push({
          id: t.id, type: "task", taskId: t.id, taskTitle: t.title,
          description: t.expense.description || "", amount: t.expense.amount,
          category: t.expense.category || "other", source: t.expense.source || "cash",
          date: t.expense.date || t.deadline || todayStr(), paid: !!t.expense.paid, billPhoto: null,
        });
      }
    });
    return [...standalone, ...fromTasks].sort((a, b) => b.date.localeCompare(a.date));
  }, [tasks, expenses]);

  const monthExpenses = useMemo(() => allExpenses.filter(e => e.date?.startsWith(filterMonth)), [allExpenses, filterMonth]);
  const filtered = filterCat === "all" ? monthExpenses : monthExpenses.filter(e => e.category === filterCat);

  const totalMonth = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const totalToday = allExpenses.filter(e => e.date === todayStr()).reduce((s, e) => s + e.amount, 0);
  const totalUnpaid = monthExpenses.filter(e => !e.paid).reduce((s, e) => s + e.amount, 0);
  const byCat = useMemo(() => {
    const m = {};
    monthExpenses.forEach(e => { m[e.category] = (m[e.category] || 0) + e.amount; });
    return m;
  }, [monthExpenses]);

  const budget = settings.monthlyBudget || 0;
  const budgetPct = budget > 0 ? Math.min(100, Math.round((totalMonth / budget) * 100)) : 0;

  const months = useMemo(() => {
    const ms = [];
    const d = new Date();
    for (let i = 0; i < 6; i++) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      ms.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
    }
    return ms;
  }, []);
  const monthLabel = (m) => {
    const [y, mo] = m.split("-");
    return `T${parseInt(mo)}/${y.slice(2)}`;
  };

  return (
    <div style={{ animation: "fadeIn .2s" }}>
      {/* Header gọn */}
      <div style={{ background:`linear-gradient(135deg,${C.goldD},${C.gold}11)`, borderRadius:12, padding:"10px 14px", marginBottom:10, border:`1px solid ${C.gold}22` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:22 }}>💰</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{t("expense", settings)}</div>
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              style={{ marginTop:2, fontSize:11, color:C.muted, background:"transparent", border:"none", padding:0, cursor:"pointer" }}>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:18, fontWeight:800, color:C.gold }}>{fmtMoney(totalMonth)}</div>
            {budget > 0 && <div style={{ fontSize:9, color: budgetPct > 80 ? C.red : C.muted }}>{budgetPct}% / {fmtMoney(budget)}</div>}
          </div>
        </div>
        {budget > 0 && (
          <div style={{ height:3, background:C.border, borderRadius:2, marginTop:6, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${budgetPct}%`, background: budgetPct > 80 ? C.red : budgetPct > 50 ? C.gold : C.green, transition:"width .3s" }} />
          </div>
        )}
      </div>

      {/* 3 KPI mini cards */}
      <div style={{ display:"flex", gap:6, marginBottom:10 }}>
        <div style={{ flex:1, padding:"8px 10px", background:C.card, borderRadius:10, border:`1px solid ${C.border}`, textAlign:"center" }}>
          <div style={{ fontSize:9, color:C.muted, fontWeight:600, marginBottom:2 }}>HÔM NAY</div>
          <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{fmtMoney(totalToday)}</div>
        </div>
        <div style={{ flex:1, padding:"8px 10px", background:C.card, borderRadius:10, border:`1px solid ${C.border}`, textAlign:"center" }}>
          <div style={{ fontSize:9, color:C.muted, fontWeight:600, marginBottom:2 }}>SỐ KHOẢN</div>
          <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{monthExpenses.length}</div>
        </div>
        <div style={{ flex:1, padding:"8px 10px", background:totalUnpaid > 0 ? `${C.red}10` : C.card, borderRadius:10, border:`1px solid ${totalUnpaid > 0 ? C.red+"33" : C.border}`, textAlign:"center" }}>
          <div style={{ fontSize:9, color:C.muted, fontWeight:600, marginBottom:2 }}>CHƯA CHI</div>
          <div style={{ fontSize:13, fontWeight:700, color: totalUnpaid > 0 ? C.red : C.text }}>{fmtMoney(totalUnpaid)}</div>
        </div>
      </div>

      {/* Top categories quick-glance */}
      {Object.keys(byCat).length > 0 && (
        <div className="no-scrollbar" style={{ display:"flex", gap:6, marginBottom:10, overflowX:"auto", paddingBottom:2 }}>
          <button className="tap" onClick={() => setFilterCat("all")}
            style={{ flexShrink:0, padding:"5px 10px", fontSize:11, borderRadius:8, border:"none",
              background: filterCat === "all" ? C.gold : C.card, color: filterCat === "all" ? "#fff" : C.muted, fontWeight:600 }}>
            Tất cả ({monthExpenses.length})
          </button>
          {Object.entries(byCat).sort((a,b) => b[1] - a[1]).map(([cat, total]) => {
            const info = CATS[cat] || { icon: "📦", label: cat, color: C.muted };
            const active = filterCat === cat;
            return (
              <button key={cat} className="tap" onClick={() => setFilterCat(active ? "all" : cat)}
                style={{ flexShrink:0, padding:"5px 10px", fontSize:11, borderRadius:8, border:"none",
                  background: active ? info.color : C.card, color: active ? "#fff" : C.muted, fontWeight:600 }}>
                {info.icon} {info.label} <span style={{ opacity:.7 }}>· {fmtMoney(total)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* List — reuse component */}
      <ExpenseList
        CATS={CATS} filtered={filtered} monthExpenses={monthExpenses}
        filterCat={filterCat} setFilterCat={setFilterCat}
        listLimit={listLimit} setListLimit={setListLimit}
        handleDeleteExpense={handleDeleteExpense} addExpense={addExpense}
        onOpenQR={onOpenQR} settings={settings}
      />

      {undoExpense && (
        <div className="undo-toast">
          <span style={{ fontSize: 13 }}>Đã xóa khoản chi</span>
          <button onClick={handleUndo}>Hoàn tác</button>
        </div>
      )}
    </div>
  );
}
