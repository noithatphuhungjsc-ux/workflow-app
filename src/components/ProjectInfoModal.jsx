/* ================================================================
   PROJECT INFO MODAL — Quản lý thông tin dự án trong nhóm chat
   3 tabs: Tổng quan, Liên kết, Báo cáo
   ================================================================ */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { C } from "../constants";
import { supabase } from "../lib/supabase";

/* ── Link auto-detect ── */
const LINK_ICONS = {
  "drive.google": { icon: "📁", label: "Google Drive", color: "#4285F4" },
  "docs.google": { icon: "📄", label: "Google Docs", color: "#4285F4" },
  "sheets.google": { icon: "📊", label: "Google Sheets", color: "#0F9D58" },
  "slides.google": { icon: "📽️", label: "Google Slides", color: "#F4B400" },
  "forms.google": { icon: "📝", label: "Google Forms", color: "#673AB7" },
  "meet.google": { icon: "📹", label: "Google Meet", color: "#00897B" },
  "calendar.google": { icon: "📅", label: "Google Calendar", color: "#4285F4" },
  "figma.com": { icon: "🎨", label: "Figma", color: "#A259FF" },
  "github.com": { icon: "💻", label: "GitHub", color: "#333" },
  "gitlab.com": { icon: "🦊", label: "GitLab", color: "#FC6D26" },
  "bitbucket.org": { icon: "🪣", label: "Bitbucket", color: "#0052CC" },
  "trello.com": { icon: "📋", label: "Trello", color: "#0079BF" },
  "notion.so": { icon: "📝", label: "Notion", color: "#000" },
  "notion.site": { icon: "📝", label: "Notion", color: "#000" },
  "slack.com": { icon: "💬", label: "Slack", color: "#4A154B" },
  "youtube.com": { icon: "🎬", label: "YouTube", color: "#FF0000" },
  "youtu.be": { icon: "🎬", label: "YouTube", color: "#FF0000" },
  "canva.com": { icon: "🖼️", label: "Canva", color: "#00C4CC" },
  "jira.atlassian": { icon: "🎯", label: "Jira", color: "#0052CC" },
  "confluence.atlassian": { icon: "📖", label: "Confluence", color: "#0052CC" },
  "miro.com": { icon: "🟡", label: "Miro", color: "#FFD02F" },
  "linear.app": { icon: "🔷", label: "Linear", color: "#5E6AD2" },
  "dropbox.com": { icon: "📦", label: "Dropbox", color: "#0061FF" },
  "zoom.us": { icon: "📹", label: "Zoom", color: "#2D8CFF" },
  "teams.microsoft": { icon: "👥", label: "MS Teams", color: "#6264A7" },
  "onedrive.live": { icon: "☁️", label: "OneDrive", color: "#0078D4" },
  "sharepoint.com": { icon: "📂", label: "SharePoint", color: "#0078D4" },
  "airtable.com": { icon: "📊", label: "Airtable", color: "#18BFFF" },
  "clickup.com": { icon: "✅", label: "ClickUp", color: "#7B68EE" },
  "asana.com": { icon: "🎯", label: "Asana", color: "#F06A6A" },
  "monday.com": { icon: "📆", label: "Monday", color: "#FF3D57" },
  "zalo.me": { icon: "💙", label: "Zalo", color: "#0068FF" },
  "facebook.com": { icon: "📘", label: "Facebook", color: "#1877F2" },
  "messenger.com": { icon: "💜", label: "Messenger", color: "#A033FF" },
  "telegram.org": { icon: "✈️", label: "Telegram", color: "#26A5E4" },
  "t.me": { icon: "✈️", label: "Telegram", color: "#26A5E4" },
  "vercel.app": { icon: "▲", label: "Vercel", color: "#000" },
  "netlify.app": { icon: "🌐", label: "Netlify", color: "#00C7B7" },
  "supabase.co": { icon: "⚡", label: "Supabase", color: "#3ECF8E" },
  "firebase.google": { icon: "🔥", label: "Firebase", color: "#FFCA28" },
};

function detectLinkMeta(url) {
  try {
    const host = new URL(url).hostname;
    for (const [key, meta] of Object.entries(LINK_ICONS)) {
      if (host.includes(key)) return meta;
    }
  } catch {}
  return { icon: "🔗", label: "Liên kết", color: C.accent };
}

/* ── Storage ── */
const STORE_KEY = (convId) => `wf_project_info_${convId}`;
function loadProjectInfo(convId) {
  try { return JSON.parse(localStorage.getItem(STORE_KEY(convId))) || null; } catch { return null; }
}
function saveProjectInfo(convId, data) {
  localStorage.setItem(STORE_KEY(convId), JSON.stringify(data));
}

const defaultInfo = () => ({
  description: "",
  startDate: "",
  endDate: "",
  links: [],
  reports: [],
});

/* ── Mic (Speech-to-text) Button ── */
const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

function MicButton({ onResult, style }) {
  const [listening, setListening] = useState(false);
  const handleMic = useCallback(() => {
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.lang = "vi-VN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      if (text) onResult(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }, [onResult]);

  if (!SpeechRecognition) return null;
  return (
    <button type="button" className="tap" onClick={handleMic}
      style={{ width: 34, height: 34, borderRadius: "50%", border: "none", flexShrink: 0,
        background: listening ? C.red : `${C.accent}15`, color: listening ? "#fff" : C.accent,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, cursor: "pointer",
        animation: listening ? "pulse .8s infinite" : "none", ...style }}>
      🎤
    </button>
  );
}

export default function ProjectInfoModal({ conversationId, convName, profiles: rawProfiles, userId, linkedProject, onClose }) {
  const profiles = useMemo(() => {
    const DEV_PROFILES_FALLBACK = [
      { id: "trinh", display_name: "Nguyen Duy Trinh", avatar_color: "#9b59b6" },
      { id: "lien",  display_name: "Lientran",         avatar_color: "#e74c3c" },
      { id: "hung",  display_name: "Pham Van Hung",    avatar_color: "#3498db" },
      { id: "mai",   display_name: "Tran Thi Mai",     avatar_color: "#27ae60" },
      { id: "duc",   display_name: "Le Minh Duc",      avatar_color: "#8e44ad" },
    ];
    const all = [...(rawProfiles || [])];
    const normalize = s => (s || "").toLowerCase().replace(/\s+/g, "");
    DEV_PROFILES_FALLBACK.forEach(d => {
      if (!all.some(p => p.id === d.id || normalize(p.display_name) === normalize(d.display_name)))
        all.push(d);
    });
    return all;
  }, [rawProfiles]);

  const [info, setInfo] = useState(() => loadProjectInfo(conversationId) || defaultInfo());
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(null);
  const [newLink, setNewLink] = useState({ title: "", url: "" });
  const urlMeta = useMemo(() => {
    if (!newLink.url.trim()) return null;
    let url = newLink.url.trim();
    if (!url.startsWith("http")) url = "https://" + url;
    return detectLinkMeta(url);
  }, [newLink.url]);
  const [newReport, setNewReport] = useState("");
  const [tab, setTab] = useState("info");
  const loaded = useRef(false);

  /* ── Days remaining ── */
  const daysLeft = useMemo(() => {
    if (!info.endDate) return null;
    return Math.ceil((new Date(info.endDate) - new Date()) / 86400000);
  }, [info.endDate]);

  // Load from Supabase (shared), fallback to localStorage
  useEffect(() => {
    if (!conversationId || loaded.current) return;
    loaded.current = true;
    (async () => {
      if (supabase) {
        const { data } = await supabase.from("project_info").select("info").eq("conversation_id", String(conversationId)).single();
        if (data?.info) { setInfo(prev => ({ ...defaultInfo(), ...data.info })); return; }
      }
      const local = loadProjectInfo(conversationId);
      if (local) setInfo(local);
    })();
  }, [conversationId]);

  // Save to Supabase + localStorage
  const saveAll = useCallback(async () => {
    setSaving(true);
    saveProjectInfo(conversationId, info);
    if (supabase) {
      await supabase.from("project_info").upsert({
        conversation_id: String(conversationId),
        info,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      });
    }
    setSaving(false);
    setEditing(false);
    setEditMode(null);
  }, [conversationId, info, userId]);

  const updateField = useCallback((field, value) => {
    setInfo(prev => ({ ...prev, [field]: value }));
  }, []);

  /* ── Link helpers ── */
  const addLink = useCallback(() => {
    if (!newLink.url.trim()) return;
    let url = newLink.url.trim();
    if (!url.startsWith("http")) url = "https://" + url;
    const meta = detectLinkMeta(url);
    setInfo(prev => ({ ...prev, links: [...prev.links, { id: Date.now(), title: newLink.title.trim() || meta.label, url, icon: meta.icon, color: meta.color }] }));
    setNewLink({ title: "", url: "" });
    setEditMode(null);
  }, [newLink]);

  const removeLink = useCallback((id) => {
    setInfo(prev => ({ ...prev, links: prev.links.filter(l => l.id !== id) }));
  }, []);

  /* ── Report helpers ── */
  const addReport = useCallback(() => {
    if (!newReport.trim()) return;
    const report = { id: Date.now(), authorId: userId, content: newReport.trim(), created: new Date().toISOString() };
    setInfo(prev => ({ ...prev, reports: [report, ...prev.reports] }));
    setNewReport("");
    setEditMode(null);
  }, [newReport, userId]);

  const removeReport = useCallback((id) => {
    setInfo(prev => ({ ...prev, reports: prev.reports.filter(r => r.id !== id) }));
  }, []);

  const IS = { width: "100%", background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", fontSize: 14, color: C.text };

  const tabs = [
    { id: "info", icon: "📋", label: "Tổng quan" },
    { id: "links", icon: "🔗", label: `Link (${info.links.length})` },
    { id: "reports", icon: "📊", label: `Báo cáo` },
  ];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,.7)" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ position: "absolute", top: 0, bottom: 0, left: "50%", transform: "translateX(-50%)", background: C.surface, width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* ── Fixed header area ── */}
        <div style={{ flexShrink: 0, padding: "10px 18px 0" }}>
          <div style={{ textAlign: "center", marginBottom: 6 }}>
            <div style={{ width: 36, height: 3, background: C.border, borderRadius: 2, display: "inline-block" }} />
          </div>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{convName || "Dự án"}</div>
              <div style={{ fontSize: 11, color: C.muted, display: "flex", alignItems: "center", gap: 6 }}>
                <span>{linkedProject?.members?.length || profiles.length} thành viên</span>
                {daysLeft !== null && (
                  <span style={{ color: daysLeft < 0 ? C.red : daysLeft <= 7 ? "#e67e22" : C.green }}>
                    {daysLeft < 0 ? `Quá hạn ${-daysLeft} ngày` : daysLeft === 0 ? "Hôm nay" : `Còn ${daysLeft} ngày`}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {!editing && (
                <button className="tap" onClick={() => setEditing(true)}
                  style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: `${C.accent}12`, color: C.accent, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  ✏️ Sửa
                </button>
              )}
              {editing && (
                <button className="tap" onClick={saveAll} disabled={saving}
                  style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Đang lưu..." : "💾 Lưu"}
                </button>
              )}
              {editing && (
                <button className="tap" onClick={() => { setEditing(false); setEditMode(null); }}
                  style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.muted, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  Hủy
                </button>
              )}
              <button className="tap" onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 22 }}>✕</button>
            </div>
          </div>
          {/* Tabs */}
          <div className="no-scrollbar" style={{ display: "flex", gap: 6, marginBottom: 0, overflowX: "auto", paddingBottom: 10 }}>
            {tabs.map(t => (
              <button key={t.id} className="tap" onClick={() => setTab(t.id)}
                style={{
                  padding: "6px 14px", borderRadius: 12, border: "none", whiteSpace: "nowrap",
                  background: tab === t.id ? C.accent : `${C.accent}08`,
                  color: tab === t.id ? "#fff" : C.accent,
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                <span style={{ fontSize: 14, lineHeight: 1 }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrollable content area ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px 24px", WebkitOverflowScrolling: "touch" }}>

          {/* ═══════ TỔNG QUAN ═══════ */}
          {tab === "info" && (
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>Mô tả dự án</div>
              {editing ? (
                <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <textarea value={info.description} onChange={e => updateField("description", e.target.value)}
                    placeholder="Mô tả ngắn về dự án..." rows={3}
                    style={{ ...IS, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, flex: 1 }} />
                  <MicButton onResult={t => updateField("description", info.description ? info.description + " " + t : t)} style={{ marginTop: 4 }} />
                </div>
              ) : (
                <div style={{ ...IS, minHeight: 40, lineHeight: 1.5, color: info.description ? C.text : C.muted }}>
                  {info.description || "Chưa có mô tả"}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>Bắt đầu</div>
                  {editing ? (
                    <input type="date" value={info.startDate} onChange={e => updateField("startDate", e.target.value)} style={IS} />
                  ) : (
                    <div style={{ ...IS, color: info.startDate ? C.text : C.muted }}>
                      {info.startDate ? new Date(info.startDate).toLocaleDateString("vi-VN") : "—"}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>Kết thúc</div>
                  {editing ? (
                    <input type="date" value={info.endDate} onChange={e => updateField("endDate", e.target.value)} style={IS} />
                  ) : (
                    <div style={{ ...IS, color: info.endDate ? C.text : C.muted }}>
                      {info.endDate ? new Date(info.endDate).toLocaleDateString("vi-VN") : "—"}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14 }}>
                <div style={{ background: `${C.accent}10`, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>{info.links.length}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Liên kết</div>
                </div>
                <div style={{ background: `${C.purple}14`, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.purple }}>{info.reports.length}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Báo cáo</div>
                </div>
                <div style={{ background: `${C.green}10`, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>{linkedProject?.members?.length || profiles.length}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>Thành viên</div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════ LIÊN KẾT ═══════ */}
          {tab === "links" && (
            <div style={{ flex: 1 }}>
              {info.links.length === 0 && editMode !== "link" && (
                <div style={{ textAlign: "center", padding: "24px 0", color: C.muted }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🔗</div>
                  <div style={{ fontSize: 13 }}>Chưa có liên kết nào</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Thêm link Drive, Figma, GitHub...</div>
                </div>
              )}
              {info.links.map(link => (
                <div key={link.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 8,
                }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: `${link.color || C.accent}15`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                    {link.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => window.open(link.url, "_blank")}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{link.title}</div>
                    <div style={{ fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.url}</div>
                  </div>
                  {editing && <button className="tap" onClick={() => removeLink(link.id)}
                    style={{ background: "none", border: "none", color: C.muted, fontSize: 16, cursor: "pointer", padding: 4 }}>✕</button>}
                </div>
              ))}

              {editing && (editMode === "link" ? (
                <div style={{ background: `${C.accent}08`, borderRadius: 12, padding: 12, border: `1px solid ${C.accent}33` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    {urlMeta && (
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: `${urlMeta.color}15`, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                        transition: "all .2s" }}>
                        {urlMeta.icon}
                      </div>
                    )}
                    <input value={newLink.url} onChange={e => setNewLink(p => ({ ...p, url: e.target.value }))}
                      placeholder="URL (vd: drive.google.com/...)" style={{ ...IS, flex: 1 }} autoFocus />
                  </div>
                  {urlMeta && urlMeta.label !== "Liên kết" && (
                    <div style={{ fontSize: 11, color: urlMeta.color, fontWeight: 600, marginBottom: 6, paddingLeft: 4 }}>
                      {urlMeta.icon} Đã nhận diện: {urlMeta.label}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <input value={newLink.title} onChange={e => setNewLink(p => ({ ...p, title: e.target.value }))}
                      placeholder={urlMeta?.label !== "Liên kết" ? `Tên (mặc định: ${urlMeta?.label})` : "Tên (tự nhận diện nếu để trống)"}
                      style={{ ...IS, flex: 1 }}
                      onKeyDown={e => e.key === "Enter" && addLink()} />
                    <MicButton onResult={t => setNewLink(p => ({ ...p, title: p.title ? p.title + " " + t : t }))} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="tap" onClick={addLink}
                      style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      Thêm
                    </button>
                    <button className="tap" onClick={() => { setEditMode(null); setNewLink({ title: "", url: "" }); }}
                      style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.muted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <button className="tap" onClick={() => setEditMode("link")}
                  style={{ width: "100%", padding: "12px", borderRadius: 12, border: `1.5px dashed ${C.accent}55`,
                    background: `${C.accent}06`, color: C.accent, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  + Thêm liên kết
                </button>
              ))}
            </div>
          )}

          {/* ═══════ BÁO CÁO ═══════ */}
          {tab === "reports" && (
            <div style={{ flex: 1 }}>
              {info.reports.length === 0 && editMode !== "report" && (
                <div style={{ textAlign: "center", padding: "24px 0", color: C.muted }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>📊</div>
                  <div style={{ fontSize: 13 }}>Chưa có báo cáo nào</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Viết báo cáo tiến độ, vấn đề, kết quả...</div>
                </div>
              )}

              {info.reports.map(r => {
                const author = profiles?.find(p => p.id === r.authorId);
                const isMe = r.authorId === userId;
                return (
                  <div key={r.id} style={{ padding: "12px 14px", background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: author?.avatar_color || C.accent,
                        display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {(author?.display_name || "?")[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{author?.display_name || "Không tên"}</span>
                        {isMe && <span style={{ fontSize: 9, color: C.accent, marginLeft: 4 }}>Bạn</span>}
                      </div>
                      <span style={{ fontSize: 10, color: C.muted }}>
                        {new Date(r.created).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
                        {" "}
                        {new Date(r.created).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {editing && isMe && (
                        <button className="tap" onClick={() => removeReport(r.id)}
                          style={{ background: "none", border: "none", color: C.muted, fontSize: 14, cursor: "pointer", padding: 2 }}>✕</button>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.content}</div>
                  </div>
                );
              })}

              {/* Add report form */}
              {editing && (editMode === "report" ? (
                <div style={{ background: `${C.accent}08`, borderRadius: 12, padding: 12, border: `1px solid ${C.accent}33` }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 10 }}>
                    <textarea value={newReport} onChange={e => setNewReport(e.target.value)}
                      placeholder="Nội dung báo cáo: tiến độ, vấn đề, kết quả..."
                      rows={4} style={{ ...IS, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, flex: 1 }} autoFocus />
                    <MicButton onResult={t => setNewReport(prev => prev ? prev + " " + t : t)} style={{ marginTop: 4 }} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="tap" onClick={addReport}
                      style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      Gửi báo cáo
                    </button>
                    <button className="tap" onClick={() => { setEditMode(null); setNewReport(""); }}
                      style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.muted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      Hủy
                    </button>
                  </div>
                </div>
              ) : (
                <button className="tap" onClick={() => setEditMode("report")}
                  style={{ width: "100%", padding: "12px", borderRadius: 12, border: `1.5px dashed ${C.accent}55`,
                    background: `${C.accent}06`, color: C.accent, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  + Viết báo cáo
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
