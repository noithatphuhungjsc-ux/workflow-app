/* ================================================================
   EXPENSE TAB — Orchestrator
   Delegates to: ExpenseOverview, ExpenseList, ExpenseForm
   ================================================================ */
import { useState, useCallback, useMemo, useRef } from "react";
import { C, EXPENSE_CATEGORIES, PAYMENT_SOURCES, fmtMoney, todayStr, MONTH_NAMES, t } from "../constants";
import { loadJSON } from "../services";
import ExpenseOverview from "../components/expense/ExpenseOverview";
import ExpenseList from "../components/expense/ExpenseList";
import ExpenseForm from "../components/expense/ExpenseForm";

export default function ExpenseTab({ tasks, expenses = [], addExpense, deleteExpense, settings, user, onOpenQR }) {
  // Industry preset override expense categories
  const CATS = settings.industryExpenseCategories || EXPENSE_CATEGORIES;
  const [subTab, setSubTab] = useState("overview"); // overview | list | wory
  const [filterCat, setFilterCat] = useState("all");
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [woryReport, setWoryReport] = useState(() => loadJSON("expense_wory_report", null));
  const [woryLoading, setWoryLoading] = useState(false);
  const [listLimit, setListLimit] = useState(30);

  // Undo delete expense
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

  // Merge: standalone expenses + task expenses
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
      if (items && items.length > 0) {
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

  // Filter by month
  const monthExpenses = useMemo(() => {
    return allExpenses.filter(e => e.date?.startsWith(filterMonth));
  }, [allExpenses, filterMonth]);

  // Filter by category
  const filtered = filterCat === "all" ? monthExpenses : monthExpenses.filter(e => e.category === filterCat);

  // Stats
  const totalMonth = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const totalPaid = monthExpenses.filter(e => e.paid).reduce((s, e) => s + e.amount, 0);
  const totalUnpaid = totalMonth - totalPaid;
  const budget = settings?.monthlyBudget || 0;
  const budgetPct = budget > 0 ? Math.min(Math.round(totalMonth / budget * 100), 100) : 0;

  // Group by category
  const byCat = useMemo(() => {
    const map = {};
    monthExpenses.forEach(e => { if (!map[e.category]) map[e.category] = 0; map[e.category] += e.amount; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [monthExpenses]);

  // Group by source
  const bySource = useMemo(() => {
    const map = {};
    monthExpenses.forEach(e => { if (!map[e.source]) map[e.source] = 0; map[e.source] += e.amount; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [monthExpenses]);

  // Today
  const todayExpenses = allExpenses.filter(e => e.date === todayStr());
  const totalToday = todayExpenses.reduce((s, e) => s + e.amount, 0);

  // Month selector
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
    return `${MONTH_NAMES[parseInt(mo) - 1]} ${y}`;
  };

  return (
    <div style={{ animation: "fadeIn .2s" }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg,${C.goldD},rgba(212,144,10,0.08))`, borderRadius: 14, border: `1px solid ${C.gold}33`, padding: "12px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>💰</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{t("expense", settings)}</div>
            <div style={{ fontSize: 12, color: C.sub }}>{monthLabel(filterMonth)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.gold }}>{fmtMoney(totalMonth)}</div>
            {budget > 0 && <div style={{ fontSize: 10, color: budgetPct > 80 ? C.red : C.muted }}>{budgetPct}% ngân sách</div>}
          </div>
        </div>
        {budget > 0 && (
          <div style={{ height: 4, background: C.border, borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${budgetPct}%`, background: budgetPct > 80 ? C.red : budgetPct > 50 ? C.gold : C.green, borderRadius: 2, transition: "width .3s" }} />
          </div>
        )}
      </div>

      {/* Sub tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {[["overview", "Tổng quan"], ["list", "Chi tiết"], ["wory", "💬 Ghi chép"]].map(([k, l]) => (
          <button key={k} className="tap" onClick={() => setSubTab(k)}
            style={{ flex: 1, background: subTab === k ? C.gold : C.card, color: subTab === k ? "#fff" : C.sub,
              border: `1px solid ${subTab === k ? C.gold : C.border}`, borderRadius: 10, padding: "7px 4px", fontSize: 11, fontWeight: 600 }}>
            {l}
          </button>
        ))}
      </div>

      {/* Month selector */}
      <div className="no-scrollbar" style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto" }}>
        {months.map(m => (
          <button key={m} className="tap" onClick={() => setFilterMonth(m)}
            style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, flexShrink: 0,
              background: filterMonth === m ? C.gold + "20" : C.card,
              color: filterMonth === m ? C.gold : C.muted,
              border: `1px solid ${filterMonth === m ? C.gold + "66" : C.border}` }}>
            {monthLabel(m)}
          </button>
        ))}
      </div>

      {subTab === "overview" && (
        <ExpenseOverview CATS={CATS} totalToday={totalToday} totalPaid={totalPaid} totalUnpaid={totalUnpaid} totalMonth={totalMonth} byCat={byCat} bySource={bySource} />
      )}

      {subTab === "list" && (
        <ExpenseList
          CATS={CATS} filtered={filtered} monthExpenses={monthExpenses} filterCat={filterCat} setFilterCat={setFilterCat}
          listLimit={listLimit} setListLimit={setListLimit} handleDeleteExpense={handleDeleteExpense}
          addExpense={addExpense} onOpenQR={onOpenQR} settings={settings}
        />
      )}

      {subTab === "wory" && (
        <ExpenseForm
          CATS={CATS} allExpenses={allExpenses} byCat={byCat} totalMonth={totalMonth} totalToday={totalToday}
          totalPaid={totalPaid} totalUnpaid={totalUnpaid} budget={budget} budgetPct={budgetPct}
          settings={settings} user={user} addExpense={addExpense}
          woryReport={woryReport} setWoryReport={setWoryReport} woryLoading={woryLoading} setWoryLoading={setWoryLoading}
        />
      )}

      {/* Undo delete toast */}
      {undoExpense && (
        <div className="undo-toast">
          <span style={{ fontSize: 13 }}>Đã xóa khoản chi</span>
          <button onClick={handleUndo}>Hoàn tác</button>
        </div>
      )}
    </div>
  );
}
