import { useState, useEffect, useRef, useCallback } from "react";
import { C } from "../constants";
import { supabase } from "../lib/supabase";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.relay.metered.ca:80" },
  {
    urls: "turn:global.relay.metered.ca:80",
    username: "open",
    credential: "open",
  },
  {
    urls: "turn:global.relay.metered.ca:443",
    username: "open",
    credential: "open",
  },
  {
    urls: "turn:global.relay.metered.ca:443?transport=tcp",
    username: "open",
    credential: "open",
  },
];

export default function CallScreen({ conversationId, userId, peerName, isIncoming, mode = "audio", onEnd }) {
  const isVideo = mode === "video";
  const [status, setStatus] = useState(isIncoming ? "ringing" : "calling"); // calling | ringing | connected | ended
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const channelRef = useRef(null);
  const ringChRef = useRef(null);
  const ringIntervalRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
    if (ringChRef.current) {
      supabase.removeChannel(ringChRef.current);
      ringChRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const endCall = useCallback(() => {
    // Notify peer
    channelRef.current?.send({
      type: "broadcast",
      event: "call-signal",
      payload: { type: "end", from: userId },
    });
    cleanup();
    setStatus("ended");
    setTimeout(() => onEndRef.current(), 500);
  }, [userId, cleanup]);

  // Start call
  useEffect(() => {
    if (!supabase || !conversationId || !userId) return;

    const init = async () => {
      // Get microphone
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
        localStreamRef.current = stream;
      } catch {
        setStatus("ended");
        setTimeout(() => onEndRef.current(), 1000);
        return;
      }

      // Create peer connection
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      // Add local audio tracks
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });

      // Show local video preview
      if (isVideo && localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      // Handle remote stream
      pc.ontrack = (e) => {
        if (e.streams[0]) {
          if (isVideo && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = e.streams[0];
          }
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = e.streams[0];
          }
        }
      };

      // Signaling channel
      const channel = supabase.channel(`call:${conversationId}`, {
        config: { broadcast: { self: false } },
      });

      channel.on("broadcast", { event: "call-signal" }, async ({ payload }) => {
        if (payload.from === userId) return;

        if (payload.type === "offer" && isIncoming) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          channel.send({
            type: "broadcast",
            event: "call-signal",
            payload: { type: "answer", sdp: answer, from: userId },
          });
        }

        if (payload.type === "answer" && !isIncoming) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        }

        if (payload.type === "ice") {
          try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch {}
        }

        if (payload.type === "accept") {
          // Peer accepted, send offer
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          channel.send({
            type: "broadcast",
            event: "call-signal",
            payload: { type: "offer", sdp: offer, from: userId },
          });
        }

        if (payload.type === "end") {
          cleanup();
          setStatus("ended");
          setTimeout(() => onEndRef.current(), 500);
        }
      });

      // ICE candidates
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          channel.send({
            type: "broadcast",
            event: "call-signal",
            payload: { type: "ice", candidate: e.candidate, from: userId },
          });
        }
      };

      // Connection state
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setStatus("connected");
          startTimeRef.current = Date.now();
          timerRef.current = setInterval(() => {
            setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
          }, 1000);
        }
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          endCall();
        }
      };

      await channel.subscribe();
      channelRef.current = channel;

      // If caller, insert call message + send push notification
      if (!isIncoming) {
        const { error } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: mode === "video" ? "📹 Cuộc gọi video" : "📞 Cuộc gọi thoại",
          type: "call",
        });
        if (error) console.warn("[Call] insert failed:", error.message);

        // Send push notification to other members so phone rings in background
        try {
          const { data: myProfile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", userId)
            .single();
          const callerName = myProfile?.display_name || "Ai đó";
          const { data: members } = await supabase
            .from("conversation_members")
            .select("user_id")
            .eq("conversation_id", conversationId)
            .neq("user_id", userId);
          if (members) {
            for (const m of members) {
              fetch("/api/push-call", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetUserId: m.user_id, callerName, mode }),
              }).catch(() => {});
            }
          }
        } catch {}
      }
    };

    init();
    return () => cleanup();
  }, [conversationId, userId, isIncoming, cleanup, endCall]);

  // Accept incoming call
  const acceptCall = () => {
    setStatus("connecting");
    channelRef.current?.send({
      type: "broadcast",
      event: "call-signal",
      payload: { type: "accept", from: userId },
    });
  };

  // Toggle mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setMuted(!muted);
    }
  };

  // Toggle speaker — limited on mobile browsers (no earpiece/speaker API)
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const toggleSpeaker = () => {
    if (isMobile) {
      // Mobile browsers don't support switching between earpiece and speaker
      // Audio always plays through the default output
      setSpeaker(!speaker);
      return;
    }
    // Desktop: try to switch audio output device
    if (remoteAudioRef.current?.setSinkId) {
      remoteAudioRef.current.setSinkId(speaker ? "default" : "communications");
    }
    setSpeaker(!speaker);
  };

  // Toggle camera (video mode only)
  const toggleCamera = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
      setCameraOff(!cameraOff);
    }
  };

  const formatDuration = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const statusText = {
    calling: "Đang gọi...",
    ringing: "Cuộc gọi đến...",
    connecting: "Đang kết nối...",
    connected: formatDuration(duration),
    ended: "Kết thúc",
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 200,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: isVideo ? "#000" : "linear-gradient(180deg, #4a5568 0%, #2d3748 100%)",
      maxWidth: 480, margin: "0 auto",
    }}>
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Remote video (full screen background) */}
      {isVideo && (
        <video ref={remoteVideoRef} autoPlay playsInline
          style={{
            position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
            objectFit: "cover", zIndex: 0,
          }} />
      )}

      {/* Local video (small PiP) */}
      {isVideo && (
        <video ref={localVideoRef} autoPlay playsInline muted
          style={{
            position: "absolute", top: 16, right: 16,
            width: 100, height: 140, borderRadius: 12,
            objectFit: "cover", zIndex: 2,
            border: "2px solid rgba(255,255,255,.3)",
            background: "#000",
            display: cameraOff ? "none" : "block",
          }} />
      )}

      {/* Content overlay */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Avatar — only show when no remote video or not connected */}
        {(!isVideo || status !== "connected") && (
          <div style={{
            width: 90, height: 90, borderRadius: "50%",
            background: C.accent,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 36, fontWeight: 700,
            marginBottom: 16,
            boxShadow: status === "connected" ? "0 0 0 4px rgba(106,127,212,.4)" : "none",
          }}>
            {(peerName || "?")[0].toUpperCase()}
          </div>
        )}

        {/* Name */}
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 6, textShadow: isVideo ? "0 1px 4px rgba(0,0,0,.5)" : "none" }}>
          {peerName}
        </div>

        {/* Status */}
        <div style={{
          fontSize: 14, color: "rgba(255,255,255,.7)",
          marginBottom: 40,
          animation: status === "calling" || status === "ringing" ? "pulse2 1.5s infinite" : "none",
          textShadow: isVideo ? "0 1px 4px rgba(0,0,0,.5)" : "none",
        }}>
          {statusText[status]}
        </div>
      </div>

      {/* Controls */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", justifyContent: "center", maxWidth: 300 }}>
        {/* Mute */}
        {status !== "ringing" && status !== "ended" && (
          <button className="tap" onClick={toggleMute}
            style={{
              width: 56, height: 56, borderRadius: "50%",
              background: muted ? "#fff" : "rgba(255,255,255,.15)",
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22,
            }}>
            {muted ? "🔇" : "🎤"}
          </button>
        )}

        {/* Camera toggle (video mode only) */}
        {isVideo && status !== "ringing" && status !== "ended" && (
          <button className="tap" onClick={toggleCamera}
            style={{
              width: 56, height: 56, borderRadius: "50%",
              background: cameraOff ? "#fff" : "rgba(255,255,255,.15)",
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22,
            }}>
            {cameraOff ? "📷" : "📹"}
          </button>
        )}

        {/* Accept (incoming only) */}
        {status === "ringing" && (
          <button className="tap" onClick={acceptCall}
            style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "#48bb78",
              border: "none", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28,
              boxShadow: "0 4px 20px rgba(72,187,120,.4)",
            }}>
            {isVideo ? "📹" : "📞"}
          </button>
        )}

        {/* End call */}
        <button className="tap" onClick={endCall}
          style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "#e53e3e",
            border: "none", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28,
            boxShadow: "0 4px 20px rgba(229,62,62,.4)",
          }}>
          📵
        </button>

        {/* Speaker (audio mode only) */}
        {!isVideo && status !== "ringing" && status !== "ended" && (
          <button className="tap" onClick={toggleSpeaker}
            style={{
              width: 56, height: 56, borderRadius: "50%",
              background: speaker ? "#fff" : "rgba(255,255,255,.15)",
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22,
            }}>
            {speaker ? "🔊" : "🔈"}
          </button>
        )}
      </div>

      <style>{`
        @keyframes pulse2 {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
      `}</style>
    </div>
  );
}
