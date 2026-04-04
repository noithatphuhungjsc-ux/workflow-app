/* VideoGrid — Remote video + local PiP + debug overlay */
import { forwardRef } from "react";

const VideoGrid = forwardRef(function VideoGrid(
  { isVideo, cameraOff, remoteAudioRef, showDebug, setShowDebug, debugLog },
  ref
) {
  // ref = { localVideoRef, remoteVideoRef }
  const localVideoRef = ref?.localVideoRef;
  const remoteVideoRef = ref?.remoteVideoRef;

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Remote video */}
      {isVideo && (
        <video ref={remoteVideoRef} autoPlay playsInline
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }} />
      )}

      {/* Local video PiP */}
      {isVideo && (
        <video ref={localVideoRef} autoPlay playsInline muted
          style={{
            position: "absolute", top: 50, right: 16,
            width: 100, height: 140, borderRadius: 14,
            objectFit: "cover", zIndex: 2,
            border: "2px solid rgba(255,255,255,.2)",
            background: "#000",
            display: cameraOff ? "none" : "block",
          }} />
      )}

      {/* Debug toggle */}
      <button onClick={() => setShowDebug(!showDebug)}
        style={{
          position: "absolute", top: 10, left: 10, zIndex: 5,
          background: "rgba(255,255,255,.08)", border: "none", color: "rgba(255,255,255,.4)",
          borderRadius: 8, padding: "4px 10px", fontSize: 11,
        }}>
        {showDebug ? "\u1EA8n" : "Log"}
      </button>

      {showDebug && (
        <div style={{
          position: "absolute", top: 38, left: 10, right: 10, zIndex: 5,
          background: "rgba(0,0,0,.85)", borderRadius: 10, padding: "8px 10px",
          maxHeight: 200, overflowY: "auto", fontSize: 10, color: "#68d391",
          fontFamily: "monospace", lineHeight: 1.6,
        }}>
          {debugLog.length === 0 && <div style={{ color: "#555" }}>Dang khoi tao...</div>}
          {debugLog.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </>
  );
});

export default VideoGrid;
