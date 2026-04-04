/* CallControls — Mute/camera/end/accept buttons + SVG icons */

/* ── SVG Icons ── */
const PhoneIcon = ({ size = 24, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
  </svg>
);
const PhoneOffIcon = ({ size = 24, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.42 19.42 0 01-3.33-2.67"/>
    <path d="M8.09 9.91l1.27-1.27a2 2 0 01-.45-2.11c.339-.907.573-1.85.7-2.81A2 2 0 0111.61 2h3a2 2 0 012 1.72"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);
const MicIcon = ({ size = 22, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);
const MicOffIcon = ({ size = 22, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .76-.12 1.49-.34 2.18"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);
const VideoIcon = ({ size = 22, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
);
const VideoOffIcon = ({ size = 22, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

/* Control button — clean circle, no label */
function CallBtn({ onClick, active, icon }) {
  return (
    <button className="tap" onClick={onClick}
      style={{
        width: 52, height: 52, borderRadius: "50%",
        background: active ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.12)",
        border: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
      <span style={{ filter: active ? "invert(1)" : "none", display: "flex" }}>{icon}</span>
    </button>
  );
}

export default function CallControls({ status, muted, cameraOff, isVideo, toggleMute, toggleCamera, endCall, acceptCall }) {
  return (
    <div style={{
      position: "relative", zIndex: 1,
      paddingBottom: 50, width: "100%",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
    }}>
      {/* Middle row: mute, camera */}
      {status !== "ringing" && status !== "ended" && (
        <div style={{ display: "flex", gap: 28, marginBottom: 8 }}>
          <CallBtn onClick={toggleMute} active={muted}
            icon={muted ? <MicOffIcon /> : <MicIcon />} />
          {isVideo && (
            <CallBtn onClick={toggleCamera} active={cameraOff}
              icon={cameraOff ? <VideoOffIcon /> : <VideoIcon />} />
          )}
        </div>
      )}

      {/* Accept / End row */}
      <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
        {/* Decline / End */}
        <button className="tap" onClick={endCall}
          style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "#e53e3e", border: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 12px rgba(229,62,62,.3)",
          }}>
          <PhoneOffIcon size={28} />
        </button>

        {/* Accept (incoming ringing only) */}
        {status === "ringing" && (
          <button className="tap" onClick={acceptCall}
            style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "#2ecc71", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 12px rgba(46,204,113,.3)",
              animation: "callPulse 1.5s infinite",
            }}>
            {isVideo ? <VideoIcon size={28} /> : <PhoneIcon size={28} />}
          </button>
        )}
      </div>
    </div>
  );
}

export { PhoneIcon, PhoneOffIcon, MicIcon, MicOffIcon, VideoIcon, VideoOffIcon, CallBtn };
