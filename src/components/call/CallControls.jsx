/* CallControls — Mute/camera/end/accept buttons + SVG icons */

/* ── SVG Icons — Material Design (filled, classic phone shape) ── */
const PhoneIcon = ({ size = 26, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M19.23 15.26l-2.54-.29c-.61-.07-1.21.14-1.64.57l-1.84 1.84c-2.83-1.44-5.15-3.75-6.59-6.58l1.85-1.85c.43-.43.64-1.03.57-1.64l-.29-2.52c-.12-1.01-.97-1.77-1.99-1.77H5.03c-1.13 0-2.07.94-2 2.07.53 8.54 7.36 15.36 15.89 15.89 1.13.07 2.07-.87 2.07-2v-1.73c.01-1.01-.75-1.86-1.76-1.98z"/>
  </svg>
);
const PhoneOffIcon = ({ size = 26, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M21.39 18.61c.79-.79.79-2.07 0-2.86-.21-.21-.45-.36-.71-.46l-2.84-.91c-.61-.2-1.27-.04-1.73.42l-1.04 1.04c-1.46-.86-2.89-2-4.07-3.18l-.04-.04c-1.18-1.18-2.32-2.61-3.18-4.07l1.04-1.04c.46-.46.62-1.12.42-1.73l-.91-2.84c-.1-.26-.25-.5-.46-.71-.79-.79-2.07-.79-2.86 0L3.78 4.7c-.61.61-.85 1.49-.62 2.31.99 3.57 3.05 6.94 5.76 9.65 2.71 2.71 6.08 4.77 9.65 5.76.82.23 1.7-.01 2.31-.62l1.51-1.19zM2 4.27l1.27-1.27 18.46 18.46-1.27 1.27z"/>
    <path d="M2 4.27l2 2 16 16 2 2 1-1L3 3.27z" opacity="0"/>
  </svg>
);
/* Phone with arrow down — for "decline" (different from "end call") */
const PhoneDeclineIcon = ({ size = 26, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.88 1.11-2.66 1.85-.18.18-.43.29-.71.29-.28 0-.53-.11-.71-.29L.29 13.08C.11 12.9 0 12.65 0 12.38c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7c4.54 0 8.66 1.78 11.71 4.67.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" transform="rotate(135 12 12)"/>
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
        {/* Decline / End — icon khác nhau theo context */}
        <button className="tap" onClick={endCall}
          style={{
            width: 68, height: 68, borderRadius: "50%",
            background: "#e53e3e", border: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 16px rgba(229,62,62,.4)",
          }}>
          {status === "ringing"
            ? <PhoneDeclineIcon size={30} />  /* Đang reo: nút từ chối */
            : <PhoneOffIcon size={30} />        /* Đang gọi: nút tắt */
          }
        </button>

        {/* Accept (incoming ringing only) */}
        {status === "ringing" && (
          <button className="tap" onClick={acceptCall}
            style={{
              width: 68, height: 68, borderRadius: "50%",
              background: "#2ecc71", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 16px rgba(46,204,113,.4)",
              animation: "callPulse 1.5s infinite",
            }}>
            {isVideo ? <VideoIcon size={30} /> : <PhoneIcon size={30} />}
          </button>
        )}
      </div>
    </div>
  );
}

export { PhoneIcon, PhoneOffIcon, MicIcon, MicOffIcon, VideoIcon, VideoOffIcon, CallBtn };
