/* CallHeader — Avatar + peer name + status display */

export default function CallHeader({ peerName, statusText, status, error, isVideo }) {
  if (isVideo && status === "connected") return null;

  return (
    <div style={{
      position: "relative", zIndex: 1,
      display: "flex", flexDirection: "column", alignItems: "center",
      paddingTop: 80, flex: 1, justifyContent: "flex-start",
    }}>
      <div style={{
        width: 96, height: 96, borderRadius: "50%",
        background: "rgba(255,255,255,.12)",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 20,
        animation: status === "calling" || status === "ringing" ? "callPulse 2s infinite" : "none",
      }}>
        <span style={{ fontSize: 38, fontWeight: 600, color: "#fff", letterSpacing: 1 }}>
          {(peerName || "?")[0].toUpperCase()}
        </span>
      </div>

      <div style={{ fontSize: 24, fontWeight: 600, color: "#fff", marginBottom: 8, letterSpacing: 0.3 }}>
        {peerName}
      </div>

      <div style={{
        fontSize: 14, color: error ? "#ff6b6b" : "rgba(255,255,255,.55)",
        fontWeight: 400,
      }}>
        {statusText}
      </div>
    </div>
  );
}
