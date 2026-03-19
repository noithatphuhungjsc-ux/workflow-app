/* ================================================================
   REQUEST TAB — Yêu cầu: mua sắm, tạm ứng, thanh toán, giấy tờ, hồ sơ
   Status flow: draft → pending → approved/rejected → processing → completed → archived
   ================================================================ */
import { useState, useEffect, useCallback } from "react";
import { C, TEAM_ACCOUNTS } from "../constants";
import { useSupabase } from "../contexts/SupabaseContext";
import { supabase } from "../lib/supabase";

const REQUEST_TYPES = [
  { key: "purchase", icon: "🛒", label: "Mua sắm", color: "#e67e22" },
  { key: "advance",  icon: "💵", label: "Tạm ứng", color: "#3498db" },
  { key: "payment",  icon: "💳", label: "Thanh toán", color: "#9b59b6" },
  { key: "document", icon: "📄", label: "Giấy tờ", color: "#2ecc71" },
  { key: "record",   icon: "📁", label: "Hồ sơ", color: "#6a7fd4" },
];

const STATUS_MAP = {
  draft:      { label: "Nháp",      color: "#95a5a6" },
  pending:    { label: "Chờ duyệt", color: "#e67e22" },
  approved:   { label: "Đã duyệt",  color: "#2ecc71" },
  rejected:   { label: "Từ chối",   color: "#e74c3c" },
  processing: { label: "Đang xử lý", color: "#3498db" },
  completed:  { label: "Hoàn thành", color: "#27ae60" },
  archived:   { label: "Lưu trữ",   color: "#95a5a6" },
};

const fmtMoney = (n) => {
  if (!n) return "";
  return Number(n).toLocaleString("vi-VN") + " đ";
};

export default function RequestTab({ userId, settings }) {
  const { session, isConnected, loading: supaLoading } = useSupabase();
  const supaUserId = session?.user?.id;
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, pending, approved, mine
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState(null);

  const userRole = (() => {
    try { return JSON.parse(localStorage.getItem("wf_session") || "{}").role || "staff"; } catch { return "staff"; }
  })();
  const isDirector = userRole === "director";

  // Load requests
  const loadRequests = useCallback(async () => {
    if (!supabase || !supaUserId) return;
    setLoading(true);
    try {
      let query = supabase.from("requests").select("*").order("created_at", { ascending: false });
      if (!isDirector) query = query.eq("created_by", supaUserId);
      const { data, error } = await query;
      if (error) console.warn("[WF] Load requests:", error.message);
      setRequests(data || []);
    } catch (e) {
      console.warn("[WF] Load requests:", e.message);
    }
    setLoading(false);
  }, [supaUserId, isDirector]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  // Filter
  const filtered = requests.filter(r => {
    if (filter === "all") return true;
    if (filter === "pending") return r.status === "pending";
    if (filter === "approved") return r.status === "approved" || r.status === "completed";
    if (filter === "mine") return r.created_by === supaUserId;
    return true;
  });

  // Approve / Reject
  const handleAction = async (id, action) => {
    if (!supabase) return;
    const updates = {
      status: action,
      updated_at: new Date().toISOString(),
    };
    if (action === "approved" || action === "rejected") {
      // Add to approvals array
      const req = requests.find(r => r.id === id);
      const approvals = req?.approvals || [];
      approvals.push({
        userId: supaUserId,
        action,
        timestamp: new Date().toISOString(),
      });
      updates.approvals = approvals;
    }
    const { error } = await supabase.from("requests").update(updates).eq("id", id);
    if (error) { alert("Lỗi: " + error.message); return; }
    loadRequests();
    if (detail?.id === id) setDetail(null);
  };

  // Create request
  const handleCreate = async (form) => {
    if (!supabase || !supaUserId) return;
    const { error } = await supabase.from("requests").insert({
      type: form.type,
      title: form.title,
      description: form.description || null,
      amount: form.amount || null,
      currency: "VND",
      status: "pending",
      priority: form.priority || "normal",
      created_by: supaUserId,
      dept_role: userRole,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) { alert("Lỗi: " + error.message); return; }
    setShowCreate(false);
    loadRequests();
  };

  if (supaLoading || !isConnected) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: C.muted }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Đang kết nối...</div>
      </div>
    );
  }

  // Detail view
  if (detail) {
    const type = REQUEST_TYPES.find(t => t.key === detail.type);
    const status = STATUS_MAP[detail.status] || STATUS_MAP.draft;
    return (
      <div style={{ padding: 16, animation: "fadeIn .2s" }}>
        <button className="tap" onClick={() => setDetail(null)}
          style={{ background: "none", border: "none", fontSize: 14, color: C.accent, fontWeight: 600, marginBottom: 12, cursor: "pointer" }}>
          ← Quay lại
        </button>
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 28 }}>{type?.icon || "📋"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{detail.title}</div>
              <span style={{ fontSize: 11, fontWeight: 600, color: status.color, background: `${status.color}15`, borderRadius: 8, padding: "2px 10px" }}>
                {status.label}
              </span>
            </div>
          </div>
          {detail.description && (
            <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.6, marginBottom: 12, whiteSpace: "pre-wrap" }}>{detail.description}</div>
          )}
          {detail.amount && (
            <div style={{ fontSize: 16, fontWeight: 700, color: C.accent, marginBottom: 12 }}>{fmtMoney(detail.amount)}</div>
          )}
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
            Ngày tạo: {new Date(detail.created_at).toLocaleDateString("vi-VN")}
          </div>
          {detail.priority === "urgent" && (
            <div style={{ fontSize: 12, color: "#e74c3c", fontWeight: 600, marginBottom: 8 }}>🔴 Khẩn cấp</div>
          )}
          {/* Approval history */}
          {detail.approvals?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>Lịch sử duyệt</div>
              {detail.approvals.map((a, i) => (
                <div key={i} style={{ fontSize: 12, color: C.sub, padding: "4px 0", borderBottom: `1px solid ${C.border}22` }}>
                  <span style={{ color: a.action === "approved" ? C.green : C.red, fontWeight: 600 }}>
                    {a.action === "approved" ? "✅ Đã duyệt" : "❌ Từ chối"}
                  </span>
                  {" — "}{new Date(a.timestamp).toLocaleString("vi-VN")}
                </div>
              ))}
            </div>
          )}
          {/* Action buttons for director */}
          {isDirector && detail.status === "pending" && (
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="tap" onClick={() => handleAction(detail.id, "approved")}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: C.green, color: "#fff", fontSize: 14, fontWeight: 700 }}>
                ✅ Duyệt
              </button>
              <button className="tap" onClick={() => handleAction(detail.id, "rejected")}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: C.red, color: "#fff", fontSize: 14, fontWeight: 700 }}>
                ❌ Từ chối
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Create form
  if (showCreate) {
    return <CreateRequestForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />;
  }

  // Filter pills
  const filterPills = [
    { key: "all", label: "Tất cả", count: requests.length },
    { key: "pending", label: "Chờ duyệt", count: requests.filter(r => r.status === "pending").length },
    { key: "approved", label: "Đã duyệt", count: requests.filter(r => r.status === "approved" || r.status === "completed").length },
    ...(isDirector ? [] : [{ key: "mine", label: "Của tôi", count: requests.filter(r => r.created_by === supaUserId).length }]),
  ];

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
            📋 Yêu cầu
            {pendingCount > 0 && <span style={{ fontSize: 11, color: "#fff", background: "#e67e22", borderRadius: 10, padding: "1px 7px", marginLeft: 6 }}>{pendingCount}</span>}
          </div>
        </div>
        <button className="tap" onClick={() => setShowCreate(true)}
          style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 10, padding: "6px 14px", fontSize: 13, fontWeight: 700 }}>
          + Tạo yêu cầu
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
        {loading && <div style={{ textAlign: "center", padding: 20, color: C.muted, fontSize: 12 }}>Đang tải...</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: C.muted }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Chưa có yêu cầu nào</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Bấm "+ Tạo yêu cầu" để bắt đầu</div>
          </div>
        )}
        {filtered.map(r => {
          const type = REQUEST_TYPES.find(t => t.key === r.type);
          const status = STATUS_MAP[r.status] || STATUS_MAP.draft;
          return (
            <div key={r.id} className="tap" onClick={() => setDetail(r)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: `1px solid ${C.border}22`, cursor: "pointer" }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: `${type?.color || C.accent}15`,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
              }}>
                {type?.icon || "📋"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.title}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: status.color, background: `${status.color}15`, borderRadius: 6, padding: "1px 8px" }}>
                    {status.label}
                  </span>
                  {r.amount && <span style={{ fontSize: 11, color: C.muted }}>{fmtMoney(r.amount)}</span>}
                  {r.priority === "urgent" && <span style={{ fontSize: 10, color: "#e74c3c", fontWeight: 600 }}>🔴</span>}
                </div>
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

/* ── Create Request Form ── */
function CreateRequestForm({ onSubmit, onCancel }) {
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
            ← Quay lại
          </button>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 16 }}>Chọn loại yêu cầu</div>
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
          ← Quay lại
        </button>
        <span style={{ fontSize: 20 }}>{typeInfo?.icon}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{typeInfo?.label}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Tiêu đề yêu cầu *"
          className="input-base" style={{ fontSize: 15, padding: "12px 14px" }} autoFocus />
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Mô tả chi tiết..."
          className="input-base" rows={3} style={{ fontSize: 14, padding: "12px 14px", resize: "vertical" }} />
        {showAmount && (
          <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Số tiền (VNĐ)"
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
            {priority === "urgent" ? "🔴 Khẩn cấp" : "Bình thường"}
          </button>
        </div>
        <button className="tap" onClick={() => {
          if (!title.trim()) { alert("Vui lòng nhập tiêu đề"); return; }
          onSubmit({ type, title: title.trim(), description: description.trim(), amount: amount || null, priority });
        }}
          disabled={!title.trim()}
          style={{
            padding: 14, borderRadius: 12, border: "none", fontSize: 15, fontWeight: 700, marginTop: 8,
            background: title.trim() ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : C.border,
            color: "#fff", cursor: title.trim() ? "pointer" : "default",
          }}>
          Gửi yêu cầu
        </button>
      </div>
    </div>
  );
}
