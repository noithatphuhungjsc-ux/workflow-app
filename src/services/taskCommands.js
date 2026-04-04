/* ================================================================
   TASK COMMANDS — unified processing (DRY, chong injection)
   ================================================================ */
import { STATUSES, PRIORITIES } from "../constants";

export function processTaskCommands(text, tasks, handlers, hasPermission) {
  if (!hasPermission) return { cleanText: text, actions: [] };
  let result = text;
  const actions = [];

  const patterns = [
    {
      rx: /\[TASK_DELETE:(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found) {
          actions.push({ type: "delete", task: found });
          return `Đã xóa "${found.title}"!`;
        }
        return `Không tìm thấy công việc "${match[1]}".`;
      },
    },
    {
      rx: /\[TASK_ADD:(.+?)\]/,
      handler: (match) => {
        const parts = match[1].split("|").map(s => s.trim());
        const title = parts[0];
        const data = { title, priority: "trung", category: "", deadline: "", notes: "", startTime: "", duration: 30 };
        for (let i = 1; i < parts.length; i++) {
          const kv = parts[i].split(":");
          const k = kv[0]?.trim();
          const v = kv.slice(1).join(":").trim();
          if (k === "priority" && ["cao","trung","thap","none"].includes(v)) data.priority = v;
          else if (k === "deadline") data.deadline = v;
          else if (k === "time") data.startTime = v;
          else if (k === "duration") data.duration = parseInt(v) || 30;
          else if (k === "category") data.category = v;
          else if (k === "notes") data.notes = v;
        }
        actions.push({ type: "add", data });
        return `Đã thêm "${title}"!`;
      },
    },
    {
      rx: /\[TASK_STATUS:(.+?):(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const newStatus = match[2].trim().toLowerCase();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found && STATUSES[newStatus]) {
          actions.push({ type: "patch", id: found.id, data: { status: newStatus } });
          return `"${found.title}" -> ${STATUSES[newStatus].label}!`;
        }
        return `Không tìm thấy hoặc trạng thái không hợp lệ.`;
      },
    },
    {
      rx: /\[TASK_PRIORITY:(.+?):(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const newPrio = match[2].trim().toLowerCase();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found && PRIORITIES[newPrio]) {
          actions.push({ type: "patch", id: found.id, data: { priority: newPrio } });
          return `"${found.title}" ưu tiên -> ${PRIORITIES[newPrio].label}!`;
        }
        return `Không tìm thấy hoặc mức ưu tiên không hợp lệ.`;
      },
    },
    {
      rx: /\[TASK_TITLE:(.+?):(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const newTitle = match[2].trim();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found) {
          actions.push({ type: "patch", id: found.id, data: { title: newTitle } });
          return `Đã đổi thành "${newTitle}"!`;
        }
        return `Không tìm thấy công việc.`;
      },
    },
    {
      rx: /\[TASK_DEADLINE:(.+?):(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const newDl = match[2].trim();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found) {
          actions.push({ type: "patch", id: found.id, data: { deadline: newDl } });
          return `Deadline "${found.title}" -> ${newDl}!`;
        }
        return `Không tìm thấy công việc.`;
      },
    },
    {
      rx: /\[TASK_NOTES:(.+?):(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const note = match[2].trim();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found) {
          const existing = Array.isArray(found.notes) ? found.notes : [];
          const newNote = { id: Date.now(), text: note, status: "pending", priority: "normal" };
          actions.push({ type: "patch", id: found.id, data: { notes: [...existing, newNote] } });
          return `Đã thêm ghi chú!`;
        }
        return `Không tìm thấy công việc.`;
      },
    },
    {
      rx: /\[SUBTASK_ADD:(.+?):(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const subTitle = match[2].trim();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found) {
          const subs = Array.isArray(found.subtasks) ? [...found.subtasks] : [];
          subs.push({ id: Date.now(), title: subTitle, done: false });
          actions.push({ type: "patch", id: found.id, data: { subtasks: subs } });
          return `Đã thêm subtask "${subTitle}"!`;
        }
        return `Không tìm thấy công việc.`;
      },
    },
    {
      rx: /\[SUBTASK_DONE:(.+?):(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const subName = match[2].trim().toLowerCase();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found && Array.isArray(found.subtasks)) {
          const subs = found.subtasks.map(s =>
            s.title.toLowerCase().includes(subName) ? { ...s, done: true } : s
          );
          actions.push({ type: "patch", id: found.id, data: { subtasks: subs } });
          return `Đã đánh dấu hoàn thành subtask!`;
        }
        return `Không tìm thấy subtask.`;
      },
    },
    {
      rx: /\[SUBTASK_UNDONE:(.+?):(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const subName = match[2].trim().toLowerCase();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found && Array.isArray(found.subtasks)) {
          const subs = found.subtasks.map(s =>
            s.title.toLowerCase().includes(subName) ? { ...s, done: false } : s
          );
          actions.push({ type: "patch", id: found.id, data: { subtasks: subs } });
          return `Đã bỏ đánh dấu subtask!`;
        }
        return `Không tìm thấy subtask.`;
      },
    },
    {
      rx: /\[SUBTASK_DELETE:(.+?):(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const subName = match[2].trim().toLowerCase();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found && Array.isArray(found.subtasks)) {
          const subs = found.subtasks.filter(s => !s.title.toLowerCase().includes(subName));
          actions.push({ type: "patch", id: found.id, data: { subtasks: subs } });
          return `Đã xóa subtask!`;
        }
        return `Không tìm thấy subtask.`;
      },
    },
    {
      rx: /\[NOTE_STATUS:(.+?):(.+?):(.+?)\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const noteText = match[2].trim().toLowerCase();
        const newStatus = match[3].trim().toLowerCase();
        if (!["pending", "doing", "done"].includes(newStatus)) return `Trạng thái ghi chú không hợp lệ.`;
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found && Array.isArray(found.notes)) {
          const notes = found.notes.map(n =>
            n.text?.toLowerCase().includes(noteText) ? { ...n, status: newStatus } : n
          );
          actions.push({ type: "patch", id: found.id, data: { notes } });
          return `Đã cập nhật ghi chú -> ${newStatus}!`;
        }
        return `Không tìm thấy ghi chú.`;
      },
    },
    {
      rx: /\[TASK_EXPENSE:(.+?):(.+?)\|(\d+)\|?(.+?)?\]/,
      handler: (match) => {
        const name = match[1].trim().toLowerCase();
        const desc = match[2].trim();
        const amount = parseInt(match[3]) || 0;
        const cat = (match[4] || "other").trim().toLowerCase();
        const found = tasks.find(t => t.title.toLowerCase().includes(name));
        if (found && amount > 0) {
          const expense = found.expense || {};
          const items = expense.items || (expense.amount > 0 ? [{ id: 1, desc: expense.description || "", amount: expense.amount, category: expense.category || "work", paid: !!expense.paid }] : []);
          const newItem = { id: Date.now(), desc, amount, category: cat, paid: false };
          const newItems = [...items, newItem];
          const total = newItems.reduce((s, e) => s + (e.amount || 0), 0);
          const descAll = newItems.map(i => i.desc).filter(Boolean).join(", ");
          actions.push({ type: "patch", id: found.id, data: { expense: { ...expense, items: newItems, amount: total, description: descAll, category: newItems[0]?.category || "other" } } });
          return `Đã thêm chi tiêu "${desc}" ${amount.toLocaleString()}đ!`;
        }
        return amount <= 0 ? `Số tiền không hợp lệ.` : `Không tìm thấy công việc.`;
      },
    },
  ];

  for (const p of patterns) {
    let m;
    while ((m = result.match(p.rx)) !== null) {
      const replacement = p.handler(m);
      result = result.replace(m[0], replacement);
    }
  }

  // Clean remaining brackets
  result = result.replace(/\[(TASK|SUBTASK|NOTE)_\w+:.+?\]/g, "");

  return { cleanText: result, actions };
}

// Execute collected actions (with confirmation support)
export function executeTaskActions(actions, { addTask, deleteTask, patchTask }) {
  for (const a of actions) {
    switch (a.type) {
      case "add":    addTask(a.data); break;
      case "delete": deleteTask(a.task.id); break;
      case "patch":  patchTask(a.id, a.data); break;
    }
  }
}
