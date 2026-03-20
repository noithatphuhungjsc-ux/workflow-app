import { useState, useEffect, useRef, useCallback } from "react";
import { C } from "../constants";
import { supabase } from "../lib/supabase";

/* ================================================================
   CALL SCREEN — WebRTC P2P audio/video call
   Signaling via Supabase Realtime Broadcast
   ================================================================ */

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

export default function CallScreen({ conversationId, userId, peerName, isIncoming, mode = "audio", onEnd }) {
  const isVideo = mode === "video";
  const [status, setStatus] = useState(isIncoming ? "ringing" : "calling");
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [error, setError] = useState("");

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const channelRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const onEndRef = useRef(onEnd);
  const endedRef = useRef(false);
  const iceCandidateQueue = useRef([]);
  const remoteDescSet = useRef(false);
  const offerSentRef = useRef(false);
  onEndRef.current = onEnd;

  /* ── Cleanup ── */
  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
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
    if (endedRef.current) return;
    endedRef.current = true;
    try {
      channelRef.current?.send({
        type: "broadcast", event: "call-signal",
        payload: { type: "end", from: userId },
      });
    } catch {}
    cleanup();
    setStatus("ended");
    setTimeout(() => onEndRef.current(), 800);
  }, [userId, cleanup]);

  /* ── Process queued ICE candidates after remote description is set ── */
  const processIceQueue = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !remoteDescSet.current) return;
    while (iceCandidateQueue.current.length > 0) {
      const candidate = iceCandidateQueue.current.shift();
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (e) { console.warn("[Call] ICE add failed:", e.message); }
    }
  }, []);

  /* ── Main init ── */
  useEffect(() => {
    if (!supabase || !conversationId || !userId) return;
    let mounted = true;

    const init = async () => {
      /* 1. Get media */
      try {
        const constraints = { audio: true, video: isVideo };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
      } catch (e) {
        console.error("[Call] getUserMedia failed:", e);
        setError(e.name === "NotAllowedError"
          ? "Bạn chưa cấp quyền micro" + (isVideo ? "/camera" : "")
          : "Không thể truy cập thiết bị");
        setStatus("ended");
        setTimeout(() => onEndRef.current(), 2000);
        return;
      }

      /* 2. Create peer connection */
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });

      if (isVideo && localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      /* 3. Handle remote stream */
      pc.ontrack = (e) => {
        if (!e.streams[0]) return;
        if (isVideo && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0];
        }
      };

      /* 4. ICE candidates — send to peer */
      pc.onicecandidate = (e) => {
        if (e.candidate && channelRef.current) {
          channelRef.current.send({
            type: "broadcast", event: "call-signal",
            payload: { type: "ice", candidate: e.candidate, from: userId },
          });
        }
      };

      /* 5. Connection state monitoring */
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log("[Call] ICE state:", state);
        if (state === "connected" || state === "completed") {
          if (mounted) {
            setStatus("connected");
            if (!startTimeRef.current) {
              startTimeRef.current = Date.now();
              timerRef.current = setInterval(() => {
                setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
              }, 1000);
            }
          }
        }
        if (state === "failed") {
          console.error("[Call] ICE connection failed");
          if (mounted) { setError("Kết nối thất bại"); endCall(); }
        }
        if (state === "disconnected") {
          // Give 5s to recover before ending
          setTimeout(() => {
            if (pc.iceConnectionState === "disconnected" && mounted) endCall();
          }, 5000);
        }
      };

      /* 6. Signaling channel */
      const channelName = `call:${conversationId}`;
      const channel = supabase.channel(channelName, {
        config: { broadcast: { self: false } },
      });

      channel.on("broadcast", { event: "call-signal" }, async ({ payload }) => {
        if (!mounted || payload.from === userId) return;
        const currentPc = pcRef.current;
        if (!currentPc) return;

        try {
          if (payload.type === "offer") {
            console.log("[Call] Received offer");
            await currentPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSet.current = true;
            await processIceQueue();
            const answer = await currentPc.createAnswer();
            await currentPc.setLocalDescription(answer);
            channel.send({
              type: "broadcast", event: "call-signal",
              payload: { type: "answer", sdp: answer, from: userId },
            });
          }

          if (payload.type === "answer") {
            console.log("[Call] Received answer");
            await currentPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSet.current = true;
            await processIceQueue();
          }

          if (payload.type === "ice") {
            if (remoteDescSet.current) {
              await currentPc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } else {
              iceCandidateQueue.current.push(payload.candidate);
            }
          }

          if (payload.type === "accept") {
            // Receiver accepted — caller creates and sends offer
            console.log("[Call] Peer accepted, creating offer...");
            if (!isIncoming && !offerSentRef.current) {
              offerSentRef.current = true;
              setStatus("connecting");
              const offer = await currentPc.createOffer();
              await currentPc.setLocalDescription(offer);
              channel.send({
                type: "broadcast", event: "call-signal",
                payload: { type: "offer", sdp: offer, from: userId },
              });
            }
          }

          if (payload.type === "ready") {
            // Peer is ready on channel — if caller, send offer now
            if (!isIncoming && !offerSentRef.current) {
              // Wait a moment to ensure peer's handlers are ready
              setTimeout(async () => {
                if (offerSentRef.current || !pcRef.current) return;
                offerSentRef.current = true;
                setStatus("connecting");
                try {
                  const offer = await pcRef.current.createOffer();
                  await pcRef.current.setLocalDescription(offer);
                  channel.send({
                    type: "broadcast", event: "call-signal",
                    payload: { type: "offer", sdp: offer, from: userId },
                  });
                } catch (e) { console.error("[Call] Offer failed:", e); }
              }, 500);
            }
          }

          if (payload.type === "end") {
            cleanup();
            if (mounted) {
              setStatus("ended");
              setTimeout(() => onEndRef.current(), 800);
            }
          }
        } catch (e) {
          console.error("[Call] Signal handling error:", e);
        }
      });

      await channel.subscribe((status) => {
        console.log("[Call] Channel status:", status);
      });
      channelRef.current = channel;

      /* 7. Role-based actions after channel is ready */
      if (!isIncoming) {
        // CALLER: insert call message + push notification + announce ready
        setStatus("calling");

        await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: isVideo ? "📹 Cuộc gọi video" : "📞 Cuộc gọi thoại",
          type: "call",
        }).catch(e => console.warn("[Call] Insert msg:", e.message));

        // Push notification to other members
        try {
          const { data: myProfile } = await supabase
            .from("profiles").select("display_name").eq("id", userId).single();
          const callerName = myProfile?.display_name || "Ai đó";
          const { data: members } = await supabase
            .from("conversation_members").select("user_id")
            .eq("conversation_id", conversationId).neq("user_id", userId);
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

        // Auto-timeout: if not connected in 45s, end call
        setTimeout(() => {
          if (mounted && !startTimeRef.current) {
            setError("Không có phản hồi");
            endCall();
          }
        }, 45000);

      } else {
        // RECEIVER: send accept + ready signals
        setStatus("connecting");
        channel.send({
          type: "broadcast", event: "call-signal",
          payload: { type: "accept", from: userId },
        });
        // Also send "ready" in case caller missed "accept"
        setTimeout(() => {
          if (channelRef.current && !remoteDescSet.current) {
            channelRef.current.send({
              type: "broadcast", event: "call-signal",
              payload: { type: "ready", from: userId },
            });
          }
        }, 1500);
        // Retry "ready" in case of timing issues
        setTimeout(() => {
          if (channelRef.current && !remoteDescSet.current) {
            channelRef.current.send({
              type: "broadcast", event: "call-signal",
              payload: { type: "ready", from: userId },
            });
          }
        }, 4000);
      }
    };

    init();
    return () => { mounted = false; cleanup(); };
  }, [conversationId, userId, isIncoming, isVideo, cleanup, endCall, processIceQueue]);

  /* ── Accept incoming call (ringing state only) ── */
  const acceptCall = () => {
    setStatus("connecting");
    channelRef.current?.send({
      type: "broadcast", event: "call-signal",
      payload: { type: "accept", from: userId },
    });
  };

  /* ── Controls ── */
  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setMuted(!muted);
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
      setCameraOff(!cameraOff);
    }
  };

  const toggleSpeaker = () => setSpeaker(!speaker);

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
    ended: error || "Kết thúc",
  };

  /* ── UI ── */
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 10001,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: isVideo ? "#000" : "linear-gradient(180deg, #4a5568 0%, #2d3748 100%)",
      maxWidth: 480, margin: "0 auto",
    }}>
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
        {(!isVideo || status !== "connected") && (
          <div style={{
            width: 90, height: 90, borderRadius: "50%",
            background: C.accent,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 36, fontWeight: 700,
            marginBottom: 16,
            boxShadow: status === "connected" ? "0 0 0 4px rgba(106,127,212,.4)" : "none",
            animation: status === "calling" || status === "ringing" ? "callPulse 2s infinite" : "none",
          }}>
            {(peerName || "?")[0].toUpperCase()}
          </div>
        )}

        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 6, textShadow: isVideo ? "0 1px 4px rgba(0,0,0,.5)" : "none" }}>
          {peerName}
        </div>

        <div style={{
          fontSize: 14, color: error ? "#fc8181" : "rgba(255,255,255,.7)",
          marginBottom: 40,
          textShadow: isVideo ? "0 1px 4px rgba(0,0,0,.5)" : "none",
        }}>
          {isVideo && status !== "connected" ? "📹 " : ""}{statusText[status]}
        </div>
      </div>

      {/* Controls */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", justifyContent: "center", maxWidth: 300 }}>
        {/* Mute */}
        {status !== "ringing" && status !== "ended" && (
          <CallBtn onClick={toggleMute} active={muted} icon={muted ? "🔇" : "🎤"} />
        )}

        {/* Camera toggle */}
        {isVideo && status !== "ringing" && status !== "ended" && (
          <CallBtn onClick={toggleCamera} active={cameraOff} icon={cameraOff ? "📷" : "📹"} />
        )}

        {/* Accept (incoming only) */}
        {status === "ringing" && (
          <button className="tap" onClick={acceptCall}
            style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "#48bb78", border: "none", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28, boxShadow: "0 4px 20px rgba(72,187,120,.4)",
              animation: "callPulse 1.5s infinite",
            }}>
            {isVideo ? "📹" : "📞"}
          </button>
        )}

        {/* End call */}
        <button className="tap" onClick={endCall}
          style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "#e53e3e", border: "none", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, boxShadow: "0 4px 20px rgba(229,62,62,.4)",
          }}>
          📵
        </button>

        {/* Speaker */}
        {!isVideo && status !== "ringing" && status !== "ended" && (
          <CallBtn onClick={toggleSpeaker} active={speaker} icon={speaker ? "🔊" : "🔈"} />
        )}
      </div>

      <style>{`
        @keyframes callPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .8; transform: scale(1.06); }
        }
      `}</style>
    </div>
  );
}

/* Small control button */
function CallBtn({ onClick, active, icon }) {
  return (
    <button className="tap" onClick={onClick}
      style={{
        width: 56, height: 56, borderRadius: "50%",
        background: active ? "#fff" : "rgba(255,255,255,.15)",
        border: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22,
      }}>
      {icon}
    </button>
  );
}
