/* RequestDetail — Request detail view with approval actions */
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

const ROLE_LABELS = {
  accountant: "Ke toan",
  director: "Giam doc",
  hr: "Nhan su",
  sales: "Kinh doanh",
  construction: "Thi cong",
};

const FULL_CHAIN = ["accountant", "director"];

function getApprovalChain(creatorRole) {
  return FULL_CHAIN.filter(r => r !== creatorRole);
}

function getApprovalStep(request) {
  return (request.approvals || []).filter(a => a.action === "approved").length;
}

const fmtMoney = (n) => {
  if (!n) return "";
  return Number(n).toLocaleString("vi-VN") + " \u0111";
};

export default function RequestDetail({ detail, supaUserId, profileCache, onBack, onApprove, onReject, onComplete, onOpenChat }) {
  const type = REQUEST_TYPES.find(t => t.key === detail.type);
  const status = STATUS_MAP[detail.status] || STATUS_MAP.draft;
  const assignedName = detail.assigned_to ? profileCache[detail.assigned_to] : null;
  const isAssignedToMe = detail.assigned_to === supaUserId;
  const isCurrentApprover = isAssignedToMe && detail.status === "pending";
  const creatorRole = detail.dept_role || "staff";
  const chain = getApprovalChain(creatorRole);
  const step = getApprovalStep(detail);
  const totalSteps = chain.length;

  const waitingMinutes = detail.status === "pending" && detail.updated_at
    ? Math.floor((Date.now() - new Date(detail.updated_at).getTime()) / 60000) : 0;

  return (
    <div style={{ padding: 16, animation: "fadeIn .2s" }}>
      <button className="tap" onClick={onBack}
        style={{ background: "none", border: "none", fontSize: 14, color: C.accent, fontWeight: 600, marginBottom: 12, cursor: "pointer" }}>
        {"\u2190"} Quay lai
      </button>
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 28 }}>{type?.icon || "\u{1F4CB}"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{detail.title}</div>
            <span style={{ fontSize: 11, fontWeight: 600, color: status.color, background: `${status.color}15`, borderRadius: 8, padding: "2px 10px" }}>
              {status.label}
            </span>
          </div>
        </div>

        {/* Waiting time alert */}
        {waitingMinutes >= 10 && (
          <div style={{
            background: "#e74c3c12", border: "1px solid #e74c3c44", borderRadius: 10,
            padding: "8px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 16 }}>{"\u{1F534}"}</span>
            <span style={{ fontSize: 12, color: "#e74c3c", fontWeight: 600 }}>
              Da cho {waitingMinutes >= 60 ? `${Math.floor(waitingMinutes/60)}h${waitingMinutes%60}p` : `${waitingMinutes} phut`} — can xu ly gap!
            </span>
          </div>
        )}

        {/* Approval progress */}
        {detail.status === "pending" && totalSteps > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 6 }}>
              Tien trinh duyet ({step}/{totalSteps})
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {chain.map((role, i) => {
                const done = i < step;
                const current = i === step;
                return (
                  <div key={role} style={{
                    flex: 1, padding: "6px 8px", borderRadius: 8, textAlign: "center",
                    background: done ? `${C.green}15` : current ? `${C.accent}12` : `${C.border}44`,
                    border: `1.5px solid ${done ? C.green : current ? C.accent : C.border}`,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: done ? C.green : current ? C.accent : C.muted }}>
                      {done ? "\u2713" : (i + 1)}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: done ? C.green : current ? C.accent : C.muted }}>
                      {ROLE_LABELS[role] || role}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {detail.description && (
          <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.6, marginBottom: 12, whiteSpace: "pre-wrap" }}>{detail.description}</div>
        )}
        {detail.amount && (
          <div style={{ fontSize: 16, fontWeight: 700, color: C.accent, marginBottom: 12 }}>{fmtMoney(detail.amount)}</div>
        )}
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
          Ngay tao: {new Date(detail.created_at).toLocaleDateString("vi-VN")}
        </div>
        {detail.assigned_to && (
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>
            {detail.status === "pending" ? "Dang cho:" : "Nguoi xu ly:"}{" "}
            <span style={{ fontWeight: 600, color: C.text }}>{assignedName || "..."}</span>
          </div>
        )}
        {detail.priority === "urgent" && (
          <div style={{ fontSize: 12, color: "#e74c3c", fontWeight: 600, marginBottom: 8 }}>{"\u{1F534}"} Khan cap</div>
        )}
        {/* Approval history */}
        {detail.approvals?.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Lich su duyet</div>
            {detail.approvals.map((a, i) => (
              <div key={i} style={{ fontSize: 12, color: C.sub, padding: "4px 0", borderBottom: `1px solid ${C.border}22` }}>
                <span style={{ color: a.action === "approved" ? C.green : C.red, fontWeight: 600 }}>
                  {a.action === "approved" ? "\u2705 Da duyet" : "\u274C Tu choi"}
                </span>
                {a.role && <span style={{ fontSize: 10, color: C.muted }}> ({ROLE_LABELS[a.role] || a.role})</span>}
                {" \u2014 "}{new Date(a.timestamp).toLocaleString("vi-VN")}
                {a.reason && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2, paddingLeft: 4 }}>
                    Ly do: {a.reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Open chat button */}
        {detail.chat_id && onOpenChat && (
          <button className="tap" onClick={() => onOpenChat(detail.chat_id)}
            style={{
              marginTop: 16, padding: "10px 16px", borderRadius: 12, border: `1px solid ${C.border}`,
              background: "transparent", fontSize: 13, fontWeight: 600, color: C.accent, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6, width: "100%", justifyContent: "center",
            }}>
            {"\u{1F4AC}"} Mo chat
          </button>
        )}

        {/* Approve/Reject buttons */}
        {isCurrentApprover && (
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button className="tap" onClick={() => onApprove(detail.id)}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: C.green, color: "#fff", fontSize: 14, fontWeight: 700 }}>
              {"\u2705"} Duyet
            </button>
            <button className="tap" onClick={() => onReject(detail)}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: C.red, color: "#fff", fontSize: 14, fontWeight: 700 }}>
              {"\u274C"} Tu choi
            </button>
          </div>
        )}

        {/* Complete button */}
        {isAssignedToMe && detail.status === "processing" && (
          <div style={{ marginTop: 20 }}>
            <button className="tap" onClick={() => onComplete(detail.id)}
              style={{ width: "100%", padding: 12, borderRadius: 12, border: "none", background: C.green, color: "#fff", fontSize: 14, fontWeight: 700 }}>
              {"\u2705"} Hoan thanh
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
