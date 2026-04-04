/* RequestList — List of requests with filter pills */
import { C } from "../../constants";

const REQUEST_TYPES = [
  { key: "purchase", icon: "\u{1F6D2}", label: "Mua sam", color: "#e67e22" },
  { key: "advance",  icon: "\u{1F4B5}", label: "Tam ung", color: "#3498db" },
  { key: "payment",  icon: "\u{1F4B3}", label: "Thanh toan", color: "#9b59b6" },
  { key: "document", icon: "\u{1F4C4}", label: "Giay to", color: "#2ecc71" },
  { key: "record",   icon: "\u{1F4C1}", label: "Ho so", color: "#6a7fd4" },
];

const STATUS_MAP = {
  draft:      { label: "Nhap",      color: "#95a5a6" },
  pending:    { label: "Cho duyet", color: "#e67e22" },
  approved:   { label: "Da duyet",  color: "#2ecc71" },
  rejected:   { label: "Tu choi",   color: "#e74c3c" },
  processing: { label: "Dang xu ly", color: "#3498db" },
  completed:  { label: "Hoan thanh", color: "#27ae60" },
  archived:   { label: "Luu tru",   color: "#95a5a6" },
};

const fmtMoney = (n) => {
  if (!n) return "";
  return Number(n).toLocaleString("vi-VN") + " \u0111";
};

export default function RequestList({ requests, filtered, filter, setFilter, supaUserId, isDirector, loading, profileCache, onDetail, onShowCreate, pendingCount }) {
  const filterPills = [
    { key: "all", label: "Tat ca", count: requests.length },
    { key: "pending", label: "Cho duyet", count: requests.filter(r => r.status === "pending").length },
    { key: "approved", label: "Da duyet", count: requests.filter(r => r.status === "approved" || r.status === "completed").length },
    { key: "assigned", label: "Duoc giao", count: requests.filter(r => r.assigned_to === supaUserId).length },
    ...(isDirector ? [] : [{ key: "mine", label: "Cua toi", count: requests.filter(r => r.created_by === supaUserId).length }]),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
            {"\u{1F4CB}"} Yeu cau
            {pendingCount > 0 && <span style={{ fontSize: 11, color: "#fff", background: "#e67e22", borderRadius: 10, padding: "1px 7px", marginLeft: 6 }}>{pendingCount}</span>}
          </div>
        </div>
        <button className="tap" onClick={onShowCreate}
          style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 10, padding: "6px 14px", fontSize: 13, fontWeight: 700 }}>
          + Tao yeu cau
        </button>
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", overflowX: "auto", flexShrink: 0 }}>
        {filterPills.map(p => (
          <button key={p.key} className="tap" onClick={() => setFilter(p.key)}
            style={{
              padding: "5px 12px", borderRadius: 16, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
              border: filter === p.key ? `1.5px solid ${C.accent}` : `1px solid ${C.border}`,
              background: filter === p.key ? `${C.accent}12` : "transparent",
              color: filter === p.key ? C.accent : C.muted,
            }}>
            {p.label} {p.count > 0 && <span style={{ opacity: 0.7 }}>({p.count})</span>}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && <div style={{ textAlign: "center", padding: 20, color: C.muted, fontSize: 12 }}>Dang tai...</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: C.muted }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>{"\u{1F4CB}"}</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Chua co yeu cau nao</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Bam "+ Tao yeu cau" de bat dau</div>
          </div>
        )}
        {filtered.map(r => {
          const type = REQUEST_TYPES.find(t => t.key === r.type);
          const status = STATUS_MAP[r.status] || STATUS_MAP.draft;
          const assignedName = r.assigned_to ? profileCache[r.assigned_to] : null;
          const waitMins = r.status === "pending" && r.updated_at
            ? Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 60000) : 0;
          const isLongWait = waitMins >= 10;
          return (
            <div key={r.id} className="tap" onClick={() => onDetail(r)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                borderBottom: `1px solid ${C.border}22`, cursor: "pointer",
                background: isLongWait ? "#e74c3c08" : "transparent",
              }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: `${type?.color || C.accent}15`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
              }}>
                {type?.icon || "\u{1F4CB}"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.title}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: status.color, background: `${status.color}15`, borderRadius: 6, padding: "1px 8px" }}>
                    {status.label}
                  </span>
                  {r.amount && <span style={{ fontSize: 11, color: C.muted }}>{fmtMoney(r.amount)}</span>}
                  {r.priority === "urgent" && <span style={{ fontSize: 10, color: "#e74c3c", fontWeight: 600 }}>{"\u{1F534}"}</span>}
                  {isLongWait && (
                    <span style={{ fontSize: 9, color: "#e74c3c", fontWeight: 700 }}>
                      {"\u23F0"} {waitMins >= 60 ? `${Math.floor(waitMins/60)}h` : `${waitMins}p`}
                    </span>
                  )}
                </div>
                {assignedName && (
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                    {r.status === "pending" ? "Cho:" : "\u2192"} {assignedName}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>
                {new Date(r.created_at).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { REQUEST_TYPES, STATUS_MAP, fmtMoney };
