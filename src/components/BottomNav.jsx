/* BottomNav — Bottom navigation bar + More menu bottom sheet */
import React from "react";

const MORE_TABS = ["requests","calendar","expense","dashboard","report","attendance"];

export default function BottomNav({ tab, setTab, chatUnread, moreMenuOpen, setMoreMenuOpen, settings, isDirector, C, t, hasPermission }) {
  return (
    <>
      {/* ── BOTTOM NAV (5 tabs: Dự án, Việc tôi, Phòng ban, Chat, Thêm) ── */}
      <div className="bottom-nav">
        {[
          ["projects","\u{1F4C1}","Dự án"],
          ["tasks","\u{2705}","Việc tôi"],
          ["dept","\u{1F3E2}","Phòng ban"],
          ["inbox","\u{1F4AC}","Chat", chatUnread],
        ].filter(([key]) => {
          const vt = settings.visibleTabs;
          if (vt && vt[key] === false) return false;
          return true;
        }).map(([key, icon, label, badgeCount]) => {
          const active = tab === key;
          return (
            <button key={key} className="tap" data-guide={`nav-${key}`} onClick={() => setTab(key)}
              style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "6px 0 2px", display: "flex", flexDirection: "column", alignItems: "center", gap: 1, position:"relative" }}>
              <div style={{ width:40, height:32, borderRadius:10, background: active ? `${C.accent}15` : "transparent", display:"flex", alignItems:"center", justifyContent:"center", transition:"all .2s", position:"relative" }}>
                <span style={{ fontSize: 20, lineHeight: 1, filter: active ? "none" : "grayscale(0.5) opacity(0.5)" }}>
                  {icon}
                </span>
                {badgeCount > 0 && !active && (
                  <div style={{ position:"absolute", top:-2, right:-4, minWidth:16, height:16, borderRadius:8, background:"#e74c3c", color:"#fff", fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 3px" }}>
                    {badgeCount > 9 ? "9+" : badgeCount}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? C.accent : "#999" }}>{label}</span>
            </button>
          );
        })}
        {/* More menu button */}
        <button className="tap" onClick={() => setMoreMenuOpen(v => !v)}
          style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "6px 0 2px", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
          <div style={{ width:40, height:32, borderRadius:10, background: MORE_TABS.includes(tab) ? `${C.accent}15` : "transparent", display:"flex", alignItems:"center", justifyContent:"center", transition:"all .2s" }}>
            <span style={{ fontSize: 20, lineHeight: 1, filter: MORE_TABS.includes(tab) ? "none" : "grayscale(0.5) opacity(0.5)" }}>&#x2261;</span>
          </div>
          <span style={{ fontSize: 10, fontWeight: MORE_TABS.includes(tab) ? 700 : 500, color: MORE_TABS.includes(tab) ? C.accent : "#999" }}>Thêm</span>
        </button>
      </div>

      {/* ── MORE MENU (bottom sheet) ── */}
      {moreMenuOpen && (
        <>
          <div style={{ position:"fixed", inset:0, zIndex:998, background:"rgba(0,0,0,.3)" }} onClick={() => setMoreMenuOpen(false)} />
          <div className="bottom-sheet">
            <div style={{ width:36, height:3, background:C.border, borderRadius:2, margin:"0 auto 14px" }} />
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[
                ["requests","\u{1F4CB}","Yêu cầu", C.accent],
                ["calendar","\u{1F4C5}","Lịch", C.accent],
                ["expense","\u{1F4B0}", t("expense", settings), C.gold],
                ["attendance","\u{1F552}","Chấm công", C.green],
                ["dashboard","\u{1F4CA}","Tổng quan", C.purple],
                isDirector && ["report","\u{1F4C4}","Báo cáo", "#e67e22"],
              ].filter(Boolean).filter(([key]) => {
                const vt = settings.visibleTabs;
                if (vt && vt[key] === false) return false;
                return hasPermission(settings, key);
              }).map(([key, icon, label, iconColor]) => {
                const active = tab === key;
                return (
                  <button key={key} className="tap" onClick={() => { setTab(key); setMoreMenuOpen(false); }}
                    style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8,
                      padding:"16px 10px", borderRadius:16, cursor:"pointer", transition:"all .15s",
                      background: active ? `${iconColor}12` : C.card,
                      border: active ? `1.5px solid ${iconColor}35` : `1px solid ${C.border}`,
                      boxShadow: active ? `0 2px 8px ${iconColor}20` : "none" }}>
                    <div style={{ width:48, height:48, borderRadius:14, background:`${iconColor}15`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      boxShadow:`0 2px 6px ${iconColor}18` }}>
                      <span style={{ fontSize:24, lineHeight:1 }}>{icon}</span>
                    </div>
                    <span style={{ fontSize:13, fontWeight: active ? 700 : 600, color: active ? iconColor : C.text }}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
