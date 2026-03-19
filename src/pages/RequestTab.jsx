/* ================================================================
   REQUEST TAB — Yêu cầu: mua sắm, tạm ứng, thanh toán, giấy tờ, hồ sơ
   Multi-level approval: Người tạo → Kế toán → Giám đốc → Xử lý
   Status flow: draft → pending → approved → processing → completed → archived
   ================================================================ */
import { useState, useEffect, useCallback, useRef } from "react";
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

/* Auto-route after final approval: type → role that processes */
const ROUTING_MAP = {
  purchase: "accountant",
  advance: "accountant",
  payment: "accountant",
  document: "hr",
  record: "hr",
};

/* Multi-level approval chain: [Kế toán, Giám đốc]
   - Creator = KT → skip KT step, go straight to GĐ
   - Creator = GĐ → skip GĐ step, only KT reviews
   The chain order is: accountant first, then director */
const FULL_CHAIN = ["accountant", "director"];

function getApprovalChain(creatorRole) {
  return FULL_CHAIN.filter(r => r !== creatorRole);
}

function getApprovalStep(request) {
  const approvedSteps = (request.approvals || []).filter(a => a.action === "approved").length;
  return approvedSteps;
}

const ROLE_LABELS = {
  accountant: "Kế toán",
  director: "Giám đốc",
  hr: "Nhân sự",
  sales: "Kinh doanh",
  construction: "Thi công",
};

const fmtMoney = (n) => {
  if (!n) return "";
  return Number(n).toLocaleString("vi-VN") + " đ";
};

/* Helper: resolve a TEAM_ACCOUNTS role to a Supabase UUID by querying profiles */
async function resolveProfileByRole(role) {
  const account = TEAM_ACCOUNTS.find(a => a.role === role);
  if (!account) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name")
    .limit(50);
  if (!data) return null;
  // Match by display_name (case-insensitive contains)
  const match = data.find(
    p => p.display_name && (
      p.display_name.toLowerCase() === account.name.toLowerCase() ||
      p.display_name.toLowerCase().includes(account.name.toLowerCase()) ||
      account.name.toLowerCase().includes(p.display_name.toLowerCase())
    )
  );
  return match || null;
}

/* Helper: resolve a Supabase UUID to a display name */
async function resolveProfileName(profileId) {
  if (!profileId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", profileId)
    .single();
  return data?.display_name || null;
}

export default function RequestTab({ userId, settings, onOpenChat }) {
  const { session, isConnected, loading: supaLoading } = useSupabase();
  const supaUserId = session?.user?.id;
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState(null);
  const [profileCache, setProfileCache] = useState({}); // { uuid: displayName }
  const [rejectTarget, setRejectTarget] = useState(null); // { id } for rejection dialog
  const [rejectReason, setRejectReason] = useState("");

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
      if (!isDirector) {
        // Load requests created by me OR assigned to me
        query = query.or(`created_by.eq.${supaUserId},assigned_to.eq.${supaUserId}`);
      }
      const { data, error } = await query;
      if (error) console.warn("[WF] Load requests:", error.message);
      setRequests(data || []);

      // Cache assigned profile names
      if (data) {
        const ids = [...new Set(data.map(r => r.assigned_to).filter(Boolean))];
        const newCache = {};
        for (const id of ids) {
          if (!profileCache[id]) {
            const name = await resolveProfileName(id);
            if (name) newCache[id] = name;
          }
        }
        if (Object.keys(newCache).length > 0) {
          setProfileCache(prev => ({ ...prev, ...newCache }));
        }
      }
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
    if (filter === "assigned") return r.assigned_to === supaUserId;
    return true;
  });

  // Approve — multi-level chain: KT → GĐ → auto-route to handler
  const handleApprove = async (id) => {
    if (!supabase) return;
    const req = requests.find(r => r.id === id);
    if (!req) return;

    const creatorRole = req.dept_role || "staff";
    const chain = getApprovalChain(creatorRole);
    const currentStep = getApprovalStep(req);

    const approvals = [...(req.approvals || [])];
    approvals.push({
      userId: supaUserId,
      role: userRole,
      action: "approved",
      timestamp: new Date().toISOString(),
    });

    const updates = {
      approvals,
      updated_at: new Date().toISOString(),
    };

    const nextStepIdx = currentStep + 1;
    if (nextStepIdx < chain.length) {
      // More approvers in chain → advance to next approver
      const nextRole = chain[nextStepIdx];
      const nextProfile = await resolveProfileByRole(nextRole);
      if (nextProfile) {
        updates.assigned_to = nextProfile.id;
        updates.status = "pending"; // still pending, waiting for next approver
        setProfileCache(prev => ({ ...prev, [nextProfile.id]: nextProfile.display_name }));
        // Add next approver to chat thread
        if (req.chat_id) {
          try {
            await supabase.from("conversation_members").upsert({
              conversation_id: req.chat_id,
              user_id: nextProfile.id,
            }, { onConflict: "conversation_id,user_id" });
          } catch (e) { console.warn("[WF] Add chat member:", e.message); }
        }
      }
    } else {
      // All approvers done → final approval → auto-route to handler
      updates.status = "approved";
      const targetRole = ROUTING_MAP[req.type];
      if (targetRole) {
        const handler = await resolveProfileByRole(targetRole);
        if (handler) {
          updates.assigned_to = handler.id;
          updates.status = "processing";
          setProfileCache(prev => ({ ...prev, [handler.id]: handler.display_name }));
          if (req.chat_id) {
            try {
              await supabase.from("conversation_members").upsert({
                conversation_id: req.chat_id,
                user_id: handler.id,
              }, { onConflict: "conversation_id,user_id" });
            } catch (e) { console.warn("[WF] Add chat member:", e.message); }
          }
        }
      }
    }

    const { error } = await supabase.from("requests").update(updates).eq("id", id);
    if (error) { alert("Lỗi: " + error.message); return; }
    loadRequests();
    if (detail?.id === id) setDetail(null);
  };

  // Reject — with reason
  const handleReject = async (id, reason) => {
    if (!supabase) return;
    const req = requests.find(r => r.id === id);
    if (!req) return;

    const approvals = req.approvals || [];
    approvals.push({
      userId: supaUserId,
      action: "rejected",
      reason: reason || "",
      timestamp: new Date().toISOString(),
    });

    const updates = {
      status: "rejected",
      approvals,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("requests").update(updates).eq("id", id);
    if (error) { alert("Lỗi: " + error.message); return; }
    setRejectTarget(null);
    setRejectReason("");
    loadRequests();
    if (detail?.id === id) setDetail(null);
  };

  // Complete — for assigned person
  const handleComplete = async (id) => {
    if (!supabase) return;
    const updates = {
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("requests").update(updates).eq("id", id);
    if (error) { alert("Lỗi: " + error.message); return; }
    loadRequests();
    if (detail?.id === id) setDetail(null);
  };

  // Create request — assign to first approver + auto-create chat thread
  const handleCreate = async (form) => {
    if (!supabase || !supaUserId) return;

    // Determine first approver in chain
    const chain = getApprovalChain(userRole);
    const firstRole = chain[0]; // "accountant" (or "director" if creator is KT)
    const firstApprover = firstRole ? await resolveProfileByRole(firstRole) : null;

    const { data: reqData, error } = await supabase.from("requests").insert({
      type: form.type,
      title: form.title,
      description: form.description || null,
      amount: form.amount || null,
      currency: "VND",
      status: "pending",
      priority: form.priority || "normal",
      created_by: supaUserId,
      assigned_to: firstApprover?.id || null,
      dept_role: userRole,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single();
    if (error) { alert("Lỗi: " + error.message); return; }

    // Cache first approver name
    if (firstApprover) {
      setProfileCache(prev => ({ ...prev, [firstApprover.id]: firstApprover.display_name }));
    }

    // Auto-create chat thread with creator + first approver
    try {
      const chatName = `[request]${form.title}`;
      const { data: conv } = await supabase.from("conversations")
        .insert({ type: "group", name: chatName, created_by: supaUserId })
        .select().single();

      if (conv) {
        const members = [{ conversation_id: conv.id, user_id: supaUserId }];
        if (firstApprover) {
          members.push({ conversation_id: conv.id, user_id: firstApprover.id });
        }
        await supabase.from("conversation_members").insert(members);
        await supabase.from("requests").update({ chat_id: conv.id }).eq("id", reqData.id);
      }
    } catch (e) {
      console.warn("[WF] Create chat thread:", e.message);
    }

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

  // Rejection dialog
  if (rejectTarget) {
    return (
      <div style={{ padding: 16, animation: "fadeIn .2s" }}>
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>Lý do từ chối</div>
          <textarea
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="Nhập lý do từ chối..."
            className="input-base"
            rows={3}
            style={{ fontSize: 14, padding: "12px 14px", resize: "vertical", width: "100%", boxSizing: "border-box", marginBottom: 12 }}
            autoFocus
          />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="tap" onClick={() => handleReject(rejectTarget.id, rejectReason)}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: C.red, color: "#fff", fontSize: 14, fontWeight: 700 }}>
              Xác nhận từ chối
            </button>
            <button className="tap" onClick={() => { setRejectTarget(null); setRejectReason(""); }}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 14, fontWeight: 600 }}>
              Hủy
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Detail view
  if (detail) {
    const type = REQUEST_TYPES.find(t => t.key === detail.type);
    const status = STATUS_MAP[detail.status] || STATUS_MAP.draft;
    const assignedName = detail.assigned_to ? profileCache[detail.assigned_to] : null;
    const isAssignedToMe = detail.assigned_to === supaUserId;
    const isCurrentApprover = isAssignedToMe && detail.status === "pending";
    const creatorRole = detail.dept_role || "staff";
    const chain = getApprovalChain(creatorRole);
    const step = getApprovalStep(detail);
    const totalSteps = chain.length;

    // Compute waiting time for red alert
    const waitingMinutes = detail.status === "pending" && detail.updated_at
      ? Math.floor((Date.now() - new Date(detail.updated_at).getTime()) / 60000) : 0;

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

          {/* Waiting time alert */}
          {waitingMinutes >= 10 && (
            <div style={{
              background: "#e74c3c12", border: "1px solid #e74c3c44", borderRadius: 10,
              padding: "8px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>🔴</span>
              <span style={{ fontSize: 12, color: "#e74c3c", fontWeight: 600 }}>
                Đã chờ {waitingMinutes >= 60 ? `${Math.floor(waitingMinutes/60)}h${waitingMinutes%60}p` : `${waitingMinutes} phút`} — cần xử lý gấp!
              </span>
            </div>
          )}

          {/* Approval progress */}
          {detail.status === "pending" && totalSteps > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 6 }}>
                Tiến trình duyệt ({step}/{totalSteps})
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
                        {done ? "✓" : (i + 1)}
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
            Ngày tạo: {new Date(detail.created_at).toLocaleDateString("vi-VN")}
          </div>
          {/* Current approver / handler */}
          {detail.assigned_to && (
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>
              {detail.status === "pending" ? "Đang chờ:" : "Người xử lý:"}{" "}
              <span style={{ fontWeight: 600, color: C.text }}>{assignedName || "..."}</span>
            </div>
          )}
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
                  {a.role && <span style={{ fontSize: 10, color: C.muted }}> ({ROLE_LABELS[a.role] || a.role})</span>}
                  {" — "}{new Date(a.timestamp).toLocaleString("vi-VN")}
                  {a.reason && (
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2, paddingLeft: 4 }}>
                      Lý do: {a.reason}
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
              💬 Mở chat
            </button>
          )}

          {/* Approve/Reject buttons — shown to CURRENT APPROVER (not just director) */}
          {isCurrentApprover && (
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="tap" onClick={() => handleApprove(detail.id)}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: C.green, color: "#fff", fontSize: 14, fontWeight: 700 }}>
                ✅ Duyệt
              </button>
              <button className="tap" onClick={() => setRejectTarget(detail)}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: C.red, color: "#fff", fontSize: 14, fontWeight: 700 }}>
                ❌ Từ chối
              </button>
            </div>
          )}

          {/* Complete button for assigned person (processing stage) */}
          {isAssignedToMe && detail.status === "processing" && (
            <div style={{ marginTop: 20 }}>
              <button className="tap" onClick={() => handleComplete(detail.id)}
                style={{ width: "100%", padding: 12, borderRadius: 12, border: "none", background: C.green, color: "#fff", fontSize: 14, fontWeight: 700 }}>
                ✅ Hoàn thành
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
    { key: "assigned", label: "Được giao", count: requests.filter(r => r.assigned_to === supaUserId).length },
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
          const assignedName = r.assigned_to ? profileCache[r.assigned_to] : null;
          const waitMins = r.status === "pending" && r.updated_at
            ? Math.floor((Date.now() - new Date(r.updated_at).getTime()) / 60000) : 0;
          const isLongWait = waitMins >= 10;
          return (
            <div key={r.id} className="tap" onClick={() => setDetail(r)}
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
                {type?.icon || "📋"}
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
                  {r.priority === "urgent" && <span style={{ fontSize: 10, color: "#e74c3c", fontWeight: 600 }}>🔴</span>}
                  {isLongWait && (
                    <span style={{ fontSize: 9, color: "#e74c3c", fontWeight: 700 }}>
                      ⏰ {waitMins >= 60 ? `${Math.floor(waitMins/60)}h` : `${waitMins}p`}
                    </span>
                  )}
                </div>
                {assignedName && (
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                    {r.status === "pending" ? "Chờ:" : "→"} {assignedName}
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
