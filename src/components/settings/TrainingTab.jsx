/* TrainingTab — Wory Knowledge & Profile */
import { useState } from "react";
import { C, KNOWLEDGE_CATEGORIES, DEFAULT_PROFILE } from "../../constants";
import { saveKnowledgeProfile, addKnowledgeEntry, updateKnowledgeEntry, deleteKnowledgeEntry, approveKnowledgeEntry, approveAllPending } from "../../services";
import { IS } from "./SettingsHelpers";

export default function TrainingTab({ knowledge, setKnowledge, pendingKnowledge, showMsg }) {
  const profile = knowledge.profile || { ...DEFAULT_PROFILE };
  const [pf, setPf] = useState({ ...profile });
  const [catFilter, setCatFilter] = useState("all");
  const [editId, setEditId] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("context");
  const [addMode, setAddMode] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("context");

  const Section = ({ title }) => (
    <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:8, marginTop:14, textTransform:"uppercase", letterSpacing:0.5 }}>{title}</div>
  );

  const saveProfile = () => {
    saveKnowledgeProfile(knowledge, setKnowledge, pf);
    showMsg("Đã lưu hồ sơ Wory!");
  };

  const filtered = knowledge.entries.filter(e =>
    catFilter === "all" ? true : e.category === catFilter
  );

  const catOptions = [
    { id: "all", label: "Tất cả" },
    ...Object.entries(KNOWLEDGE_CATEGORIES).map(([id, { label }]) => ({ id, label })),
  ];

  return (
    <>
      {/* Pending approvals banner */}
      {pendingKnowledge.length > 0 && (
        <div style={{ background: C.gold + "18", border: `1px solid ${C.gold}44`, borderRadius: 12, padding: "12px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.gold }}>Wory muốn ghi nhớ {pendingKnowledge.length} điều mới</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Xem bên dưới để duyệt</div>
          </div>
          <button className="tap" onClick={() => { approveAllPending(knowledge, setKnowledge); showMsg("Đã duyệt tất cả!"); }}
            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 10, padding: "6px 12px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            Duyệt hết
          </button>
        </div>
      )}

      {/* Section 1: Manual Profile */}
      <Section title="Hồ sơ cho Wory" />
      <div style={{ fontSize: 12, color: C.sub, marginBottom: 10, lineHeight: 1.5 }}>
        Thông tin này giúp Wory hiểu bạn và tư vấn chính xác hơn.
      </div>

      {[
        ["role", "Vai trò / Chức vụ", "VD: Giám đốc, Trưởng phòng Marketing..."],
        ["company", "Công ty", "VD: ABC Corp"],
        ["industry", "Ngành", "VD: Công nghệ, Bất động sản..."],
        ["teamSize", "Quy mô đội", "VD: 15 người, 3 phòng ban"],
      ].map(([key, label, ph]) => (
        <div key={key} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>{label.toUpperCase()}</div>
          <input value={pf[key] || ""} onChange={e => setPf(p => ({ ...p, [key]: e.target.value }))}
            placeholder={ph} style={IS} />
        </div>
      ))}

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>PHONG CÁCH LÀM VIỆC</div>
        <textarea value={pf.workStyle || ""} onChange={e => setPf(p => ({ ...p, workStyle: e.target.value }))}
          placeholder="VD: Thích họp ngắn, làm việc sáng sớm, ưu tiên kết quả..." rows={2}
          style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>PHONG CÁCH GIAO TIẾP</div>
        <select value={pf.communication || ""} onChange={e => setPf(p => ({ ...p, communication: e.target.value }))}
          style={{ ...IS, padding: "8px 12px" }}>
          <option value="">-- Chọn --</option>
          <option value="Ngắn gọn, đi thẳng vấn đề">Ngắn gọn, đi thẳng vấn đề</option>
          <option value="Chi tiết, phân tích kỹ">Chi tiết, phân tích kỹ</option>
          <option value="Chính xác, dựa trên dữ liệu">Chính xác, dựa trên dữ liệu</option>
          <option value="Thoải mái, linh hoạt">Thoải mái, linh hoạt</option>
        </select>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>MỤC TIÊU HIỆN TẠI</div>
        <textarea value={pf.goals || ""} onChange={e => setPf(p => ({ ...p, goals: e.target.value }))}
          placeholder="VD: Mở rộng thị trường miền Nam, ra mắt sản phẩm mới Q2..." rows={2}
          style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>GHI CHÚ THÊM</div>
        <textarea value={pf.notes || ""} onChange={e => setPf(p => ({ ...p, notes: e.target.value }))}
          placeholder="Bất kỳ điều gì bạn muốn Wory biết..." rows={2}
          style={{ ...IS, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      <button className="tap" onClick={saveProfile}
        style={{ width: "100%", background: `linear-gradient(135deg,${C.accent},${C.purple})`, color: "#fff", border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 700, marginBottom: 20 }}>
        Lưu hồ sơ
      </button>

      {/* Section 2: Knowledge Review */}
      <Section title={`Wory đã học (${knowledge.entries.length})`} />

      {/* Category filter pills */}
      <div className="no-scrollbar" style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
        {catOptions.map(c => {
          const active = catFilter === c.id;
          const color = c.id === "all" ? C.accent : KNOWLEDGE_CATEGORIES[c.id]?.color || C.accent;
          const count = c.id === "all" ? knowledge.entries.length : knowledge.entries.filter(e => e.category === c.id).length;
          return (
            <button key={c.id} className="tap" onClick={() => setCatFilter(c.id)}
              style={{ flexShrink: 0, background: active ? color + "20" : C.card, color: active ? color : C.sub,
                border: `1px solid ${active ? color + "66" : C.border}`, borderRadius: 10, padding: "5px 10px", fontSize: 11, fontWeight: 600 }}>
              {c.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Add manual entry */}
      {addMode ? (
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.accent}44`, padding: 14, marginBottom: 10 }}>
          <textarea value={newContent} onChange={e => setNewContent(e.target.value)}
            placeholder="Nhập thông tin Wory cần nhớ..." rows={2} autoFocus
            style={{ ...IS, resize: "vertical", fontFamily: "inherit", marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {Object.entries(KNOWLEDGE_CATEGORIES).map(([id, { label, color }]) => (
              <button key={id} className="tap" onClick={() => setNewCategory(id)}
                style={{ padding: "4px 10px", borderRadius: 8, fontSize: 10, fontWeight: 600,
                  background: newCategory === id ? color + "20" : C.bg,
                  color: newCategory === id ? color : C.muted,
                  border: `1px solid ${newCategory === id ? color + "66" : C.border}` }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="tap" onClick={() => {
              if (!newContent.trim()) { showMsg("Vui lòng nhập nội dung.", "error"); return; }
              addKnowledgeEntry(knowledge, setKnowledge, newContent.trim(), newCategory, "manual");
              setNewContent(""); setAddMode(false);
              showMsg("Đã thêm!");
            }}
              style={{ flex: 1, background: C.accent, color: "#fff", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700 }}>
              Thêm
            </button>
            <button className="tap" onClick={() => { setAddMode(false); setNewContent(""); }}
              style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: C.muted }}>
              Hủy
            </button>
          </div>
        </div>
      ) : (
        <button className="tap" onClick={() => setAddMode(true)}
          style={{ width: "100%", background: C.card, border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: "12px", fontSize: 13, color: C.accent, fontWeight: 600, marginBottom: 10 }}>
          + Thêm ghi nhớ
        </button>
      )}

      {/* Entries list */}
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px 0", color: C.muted, fontSize: 13 }}>
          Chưa có ghi nhớ nào{catFilter !== "all" ? ` trong "${KNOWLEDGE_CATEGORIES[catFilter]?.label}"` : ""}.
        </div>
      )}

      {filtered.map(entry => {
        const cat = KNOWLEDGE_CATEGORIES[entry.category] || { label: "Khác", color: C.muted };
        const isEditing = editId === entry.id;

        return (
          <div key={entry.id} style={{ background: C.card, borderRadius: 12, border: `1px solid ${!entry.approved ? C.gold + "44" : C.border}`, padding: "12px 14px", marginBottom: 8 }}>
            {isEditing ? (
              <>
                <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={2}
                  style={{ ...IS, resize: "vertical", fontFamily: "inherit", marginBottom: 8 }} autoFocus />
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  {Object.entries(KNOWLEDGE_CATEGORIES).map(([id, { label, color }]) => (
                    <button key={id} className="tap" onClick={() => setEditCategory(id)}
                      style={{ padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                        background: editCategory === id ? color + "20" : C.bg,
                        color: editCategory === id ? color : C.muted,
                        border: `1px solid ${editCategory === id ? color + "66" : C.border}` }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="tap" onClick={() => {
                    updateKnowledgeEntry(knowledge, setKnowledge, entry.id, { content: editContent.trim(), category: editCategory, approved: true });
                    setEditId(null);
                    showMsg("Đã cập nhật!");
                  }}
                    style={{ flex: 1, background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "8px", fontSize: 12, fontWeight: 600 }}>
                    Lưu
                  </button>
                  <button className="tap" onClick={() => setEditId(null)}
                    style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.muted }}>
                    Hủy
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: cat.color, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 13, color: C.text, lineHeight: 1.5 }}>{entry.content}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                  <span style={{ fontSize: 10, color: cat.color, fontWeight: 600, background: cat.color + "15", padding: "2px 8px", borderRadius: 6 }}>{cat.label}</span>
                  <span style={{ fontSize: 10, color: C.muted, background: C.bg, padding: "2px 6px", borderRadius: 6 }}>{entry.source === "auto" ? "Tự động" : "Tự nhập"}</span>
                  {!entry.approved && (
                    <span style={{ fontSize: 10, color: C.gold, fontWeight: 600 }}>Chờ duyệt</span>
                  )}
                  <div style={{ flex: 1 }} />
                  {!entry.approved && (
                    <button className="tap" onClick={() => { approveKnowledgeEntry(knowledge, setKnowledge, entry.id); showMsg("Đã duyệt!"); }}
                      style={{ background: C.green + "18", color: C.green, border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 600 }}>
                      Duyệt
                    </button>
                  )}
                  <button className="tap" onClick={() => { setEditId(entry.id); setEditContent(entry.content); setEditCategory(entry.category); }}
                    style={{ background: "none", border: "none", color: C.muted, fontSize: 12, padding: "2px 4px" }}>
                    &#x270E;
                  </button>
                  <button className="tap" onClick={() => { deleteKnowledgeEntry(knowledge, setKnowledge, entry.id); showMsg("Đã xóa!"); }}
                    style={{ background: "none", border: "none", color: C.red, fontSize: 13, padding: "2px 4px" }}>
                    x
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* Stats footer */}
      {knowledge.entries.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: C.muted }}>
          {knowledge.entries.length} ghi nhớ · {knowledge.entries.filter(e => e.approved).length} đã duyệt · {pendingKnowledge.length} chờ duyệt
        </div>
      )}
    </>
  );
}
