/* ================================================================
   REQUEST TAB — Orchestrator
   Delegates to: RequestList, RequestForm, RequestDetail
   ================================================================ */
import { useState, useEffect, useCallback } from "react";
import { C, TEAM_ACCOUNTS } from "../constants";
import { useSupabase } from "../contexts/SupabaseContext";
import { supabase } from "../lib/supabase";
import RequestList from "../components/request/RequestList";
import RequestForm from "../components/request/RequestForm";
import RequestDetail from "../components/request/RequestDetail";

/* Auto-route after final approval: type -> role that processes */
const ROUTING_MAP = {
  purchase: "accountant",
  advance: "accountant",
  payment: "accountant",
  document: "hr",
  record: "hr",
};

const FULL_CHAIN = ["accountant", "director"];

function getApprovalChain(creatorRole) {
  return FULL_CHAIN.filter(r => r !== creatorRole);
}

function getApprovalStep(request) {
  return (request.approvals || []).filter(a => a.action === "approved").length;
}

/* Helper: resolve a TEAM_ACCOUNTS role to a Supabase UUID */
async function resolveProfileByRole(role) {
  const account = TEAM_ACCOUNTS.find(a => a.role === role);
  if (!account) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name")
    .limit(50);
  if (!data) return null;
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
  const [profileCache, setProfileCache] = useState({});
  const [rejectTarget, setRejectTarget] = useState(null);
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
        query = query.or(`created_by.eq.${supaUserId},assigned_to.eq.${supaUserId}`);
      }
      const { data, error } = await query;
      if (error) console.warn("[WF] Load requests:", error.message);
      setRequests(data || []);

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

  // Approve
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

    const updates = { approvals, updated_at: new Date().toISOString() };

    const nextStepIdx = currentStep + 1;
    if (nextStepIdx < chain.length) {
      const nextRole = chain[nextStepIdx];
      const nextProfile = await resolveProfileByRole(nextRole);
      if (nextProfile) {
        updates.assigned_to = nextProfile.id;
        updates.status = "pending";
        setProfileCache(prev => ({ ...prev, [nextProfile.id]: nextProfile.display_name }));
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
    if (error) { alert("Loi: " + error.message); return; }
    loadRequests();
    if (detail?.id === id) setDetail(null);
  };

  // Reject
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
    if (error) { alert("Loi: " + error.message); return; }
    setRejectTarget(null);
    setRejectReason("");
    loadRequests();
    if (detail?.id === id) setDetail(null);
  };

  // Complete
  const handleComplete = async (id) => {
    if (!supabase) return;
    const updates = {
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("requests").update(updates).eq("id", id);
    if (error) { alert("Loi: " + error.message); return; }
    loadRequests();
    if (detail?.id === id) setDetail(null);
  };

  // Create request
  const handleCreate = async (form) => {
    if (!supabase || !supaUserId) return;

    const chain = getApprovalChain(userRole);
    const firstRole = chain[0];
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
    if (error) { alert("Loi: " + error.message); return; }

    if (firstApprover) {
      setProfileCache(prev => ({ ...prev, [firstApprover.id]: firstApprover.display_name }));
    }

    // Auto-create chat thread
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
        <div style={{ fontSize: 36, marginBottom: 12 }}>{"\u{1F4CB}"}</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Dang ket noi...</div>
      </div>
    );
  }

  // Rejection dialog
  if (rejectTarget) {
    return (
      <div style={{ padding: 16, animation: "fadeIn .2s" }}>
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>Ly do tu choi</div>
          <textarea
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="Nhap ly do tu choi..."
            className="input-base"
            rows={3}
            style={{ fontSize: 14, padding: "12px 14px", resize: "vertical", width: "100%", boxSizing: "border-box", marginBottom: 12 }}
            autoFocus
          />
          <div style={{ display: "flex", gap: 10 }}>
            <button className="tap" onClick={() => handleReject(rejectTarget.id, rejectReason)}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: C.red, color: "#fff", fontSize: 14, fontWeight: 700 }}>
              Xac nhan tu choi
            </button>
            <button className="tap" onClick={() => { setRejectTarget(null); setRejectReason(""); }}
              style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 14, fontWeight: 600 }}>
              Huy
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Detail view
  if (detail) {
    return (
      <RequestDetail
        detail={detail}
        supaUserId={supaUserId}
        profileCache={profileCache}
        onBack={() => setDetail(null)}
        onApprove={handleApprove}
        onReject={setRejectTarget}
        onComplete={handleComplete}
        onOpenChat={onOpenChat}
      />
    );
  }

  // Create form
  if (showCreate) {
    return <RequestForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />;
  }

  // List view
  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <RequestList
      requests={requests}
      filtered={filtered}
      filter={filter}
      setFilter={setFilter}
      supaUserId={supaUserId}
      isDirector={isDirector}
      loading={loading}
      profileCache={profileCache}
      onDetail={setDetail}
      onShowCreate={() => setShowCreate(true)}
      pendingCount={pendingCount}
    />
  );
}
