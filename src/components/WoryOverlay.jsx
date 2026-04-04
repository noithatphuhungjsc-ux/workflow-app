import React from "react";

export default function WoryOverlay({
  woryOpen, setWoryOpen,
  msgs, aiIn, setAiIn, aiLoad, sendChat,
  canNewChat, startNewChat, chatStartedAt,
  voice,
  endRef,
  C,
  MdBlock,
}) {
  return (
    <>
      {/* ── WORY FAB — floating assistant button ── */}
      <button className="tap" onClick={() => setWoryOpen(v => !v)}
        style={{
          position: "fixed", bottom: "52px", right: 16, zIndex: 70,
          width: 52, height: 52, borderRadius: "50%", border: "none",
          background: woryOpen ? C.muted : `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
          color: "#fff", fontSize: woryOpen ? 18 : 20, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 4px 16px ${woryOpen ? "rgba(0,0,0,.15)" : C.accent + "55"}`,
          transition: "all .2s",
        }}>
        {woryOpen ? "\u2715" : "\u2726"}
        {!woryOpen && aiLoad && (
          <div style={{ position:"absolute", top:-2, right:-2, width:12, height:12, borderRadius:"50%", background:C.green, border:"2px solid #fff" }} />
        )}
      </button>

      {/* ── WORY OVERLAY (bottom sheet chat) ── */}
      {woryOpen && (
        <>
          <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,.3)" }} onClick={() => setWoryOpen(false)} />
          <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480,
            height:"calc(75vh - env(safe-area-inset-bottom, 0px))", background:"#fff", borderRadius:"20px 20px 0 0", zIndex:201,
            display:"flex", flexDirection:"column", animation:"slideUp .25s" }}>
            {/* Header */}
            <div style={{ padding:"14px 16px 10px", borderBottom:`1px solid ${C.border}`, flexShrink:0, display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:`linear-gradient(135deg,${C.accent},${C.purple})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:"#fff" }}>W</div>
              <span style={{ fontSize:15, fontWeight:700, color:C.text, flex:1 }}>Wory</span>
              <button className="tap" onClick={() => {
                if (!canNewChat()) {
                  const h = Math.ceil((2 * 24 * 60 * 60 * 1000 - (Date.now() - chatStartedAt)) / 3600000);
                  alert(`Ch\u01B0a \u0111\u1EE7 2 ng\u00E0y. C\u00F2n ~${h}h n\u1EEFa.`);
                  return;
                }
                if (!confirm("L\u01B0u tr\u1EEF v\u00E0 b\u1EAFt \u0111\u1EA7u chat m\u1EDBi?")) return;
                startNewChat();
              }} style={{ background:C.card, color: canNewChat() ? C.accent : C.muted, border:`1px solid ${canNewChat() ? C.accent+"44" : C.border}`, borderRadius:8, padding:"4px 10px", fontSize:12, fontWeight:600, opacity: canNewChat() ? 1 : 0.6 }}>
                + M\u1EDBi
              </button>
              <button className="tap" onClick={() => setWoryOpen(false)}
                style={{ background:"none", border:"none", fontSize:18, color:C.muted, cursor:"pointer", padding:"4px" }}>{"\u2715"}</button>
            </div>
            {/* Quick prompts */}
            <div className="no-scrollbar" style={{ display:"flex", gap:6, padding:"8px 14px", overflowX:"auto", flexShrink:0 }}>
              {["L\u00EAn k\u1EBF ho\u1EA1ch h\u00F4m nay", "H\u00F4m nay l\u00E0m g\u00EC tr\u01B0\u1EDBc?", "T\u00F4i b\u1ECB stress qu\u00E1", "K\u1EC3 chuy\u1EC7n vui \u0111i"].map(q => (
                <button key={q} className="tap" onClick={() => sendChat(q)}
                  style={{ flexShrink:0, background:C.card, color:C.sub, border:`1px solid ${C.border}`, borderRadius:20, padding:"5px 12px", fontSize:12 }}>{q}</button>
              ))}
            </div>
            {/* Messages */}
            <div style={{ flex:1, overflowY:"auto", padding:"8px 14px" }}>
              {msgs.map((m, i) => (
                <div key={i} style={{ display:"flex", flexDirection:"column", alignItems: m.role === "user" ? "flex-end" : "flex-start", marginBottom:8 }}>
                  {m.role === "assistant" && (
                    <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:3 }}>
                      <div style={{ width:18, height:18, borderRadius:"50%", background:`linear-gradient(135deg,${C.accent},${C.purple})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, color:"#fff" }}>W</div>
                      <span style={{ fontSize:11, color:C.muted, fontWeight:600 }}>Wory</span>
                    </div>
                  )}
                  {m.role === "user" ? (
                    <div style={{ maxWidth:"85%", background:C.accent, borderRadius:"16px 16px 4px 16px", padding:"10px 14px", fontSize:14, lineHeight:1.5, color:"#fff", whiteSpace:"pre-wrap", marginLeft:"auto" }}>{m.content}</div>
                  ) : (
                    <div style={{ maxWidth:"92%" }}>
                      <div style={{ background:C.card, borderRadius:"16px 16px 16px 4px", border:`1px solid ${C.border}`, padding:"10px 14px", fontSize:14, lineHeight:1.6, color:C.text }}>
                        <MdBlock text={m.content} />
                        {aiLoad && i === msgs.length - 1 && <span style={{ display:"inline-block", width:2, height:14, background:C.accent, marginLeft:2, animation:"blink 1s infinite", verticalAlign:"text-bottom" }} />}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {aiLoad && msgs[msgs.length - 1]?.content === "" && (
                <div style={{ display:"flex" }}><div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:"16px 16px 16px 4px", padding:"10px 14px" }}><div className="dots"><span /><span /><span /></div></div></div>
              )}
              <div ref={endRef} />
            </div>
            {/* Input */}
            <div style={{ padding:"10px 12px", borderTop:`1px solid ${C.border}`, flexShrink:0, display:"flex", gap:8, alignItems:"center", paddingBottom:"calc(10px + env(safe-area-inset-bottom))" }}>
              <input value={aiIn} onChange={e => setAiIn(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChat()}
                placeholder="Nh\u1EAFn tin cho Wory..."
                style={{ flex:1, background:C.card, border:`1px solid ${C.border}`, borderRadius:24, padding:"10px 14px", fontSize:15, color:C.text }} />
              {aiIn.trim() ? (
                <button className="tap" onClick={() => sendChat()} disabled={aiLoad}
                  style={{ width:40, height:40, borderRadius:"50%", border:"none", flexShrink:0, background: aiLoad ? C.border : C.accent, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:"#fff" }}>
                  {"\u2191"}
                </button>
              ) : voice.ok ? (
                <button className="tap" onClick={() => { window.speechSynthesis?.cancel(); voice.toggle(); }}
                  style={{ width:40, height:40, borderRadius:"50%", border:"none", flexShrink:0, position:"relative",
                    background: voice.on ? C.red : `${C.purple}18`,
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:17 }}>
                  {voice.on && <div style={{ position:"absolute", inset:-4, borderRadius:"50%", border:`2px solid ${C.red}44`, animation:"ripple 1.1s infinite", pointerEvents:"none" }} />}
                  {"\uD83C\uDFA4"}
                </button>
              ) : null}
            </div>
          </div>
        </>
      )}
    </>
  );
}
