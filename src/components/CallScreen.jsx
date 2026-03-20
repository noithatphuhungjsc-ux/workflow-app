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
  { urls: "stun:stun.relay.metered.ca:80" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turns:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export default function CallScreen({ conversationId, userId, peerName, isIncoming, mode = "audio", onEnd }) {
  const isVideo = mode === "video";
  const [status, setStatus] = useState(isIncoming ? "ringing" : "calling");
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [error, setError] = useState("");
  const [debugLog, setDebugLog] = useState([]);
  const [showDebug, setShowDebug] = useState(false);
  const log = useCallback((msg) => {
    console.log("[Call]", msg);
    setDebugLog(prev => [...prev.slice(-15), `${new Date().toLocaleTimeString("vi-VN")} ${msg}`]);
  }, []);

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
      log(`Bắt đầu (${isIncoming ? "nhận" : "gọi"}, ${isVideo ? "video" : "audio"})`);

      /* 1. Get media */
      try {
        log("Xin quyền micro" + (isVideo ? "/camera" : "") + "...");
        const constraints = { audio: true, video: isVideo };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        log("✅ Đã có micro" + (isVideo ? "/camera" : ""));
      } catch (e) {
        const msg = e.name === "NotAllowedError"
          ? "❌ Chưa cấp quyền micro" + (isVideo ? "/camera" : "")
          : `❌ Lỗi thiết bị: ${e.name}`;
        log(msg);
        setError(msg);
        setStatus("ended");
        setTimeout(() => onEndRef.current(), 3000);
        return;
      }

      /* 2. Create peer connection */
      log("Tạo kết nối P2P (STUN+TURN)...");
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
        log("✅ Nhận stream từ đối phương");
        if (!e.streams[0]) return;
        if (isVideo && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0];
        }
      };

      /* 4. ICE candidates — send to peer */
      let iceCount = 0;
      pc.onicecandidate = (e) => {
        if (e.candidate && channelRef.current) {
          iceCount++;
          if (iceCount <= 3) log(`ICE candidate #${iceCount} (${e.candidate.type || "?"})`);
          channelRef.current.send({
            type: "broadcast", event: "call-signal",
            payload: { type: "ice", candidate: e.candidate, from: userId },
          });
        }
        if (!e.candidate && iceCount > 0) log(`ICE xong: ${iceCount} candidates`);
      };

      /* 5. Connection state monitoring */
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        log(`ICE: ${state}`);
        if (state === "connected" || state === "completed") {
          if (mounted) {
            setStatus("connected");
            log("✅ ĐÃ KẾT NỐI THÀNH CÔNG");
            if (!startTimeRef.current) {
              startTimeRef.current = Date.now();
              timerRef.current = setInterval(() => {
                setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
              }, 1000);
            }
          }
        }
        if (state === "failed") {
          log("❌ ICE thất bại — có thể bị firewall chặn");
          if (mounted) { setError("Kết nối thất bại"); endCall(); }
        }
        if (state === "disconnected") {
          log("⚠️ Mất kết nối, đợi 5s...");
          setTimeout(() => {
            if (pc.iceConnectionState === "disconnected" && mounted) endCall();
          }, 5000);
        }
      };

      pc.onicegatheringstatechange = () => {
        log(`ICE gathering: ${pc.iceGatheringState}`);
      };

      /* 6. Signaling channel */
      const channelName = `call:${conversationId}`;
      log(`Kết nối channel: ${channelName}`);
      const channel = supabase.channel(channelName, {
        config: { broadcast: { self: false } },
      });

      channel.on("broadcast", { event: "call-signal" }, async ({ payload }) => {
        if (!mounted || payload.from === userId) return;
        const currentPc = pcRef.current;
        if (!currentPc) return;

        try {
          if (payload.type === "offer") {
            log("📥 Nhận offer, tạo answer...");
            await currentPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSet.current = true;
            await processIceQueue();
            const answer = await currentPc.createAnswer();
            await currentPc.setLocalDescription(answer);
            channel.send({
              type: "broadcast", event: "call-signal",
              payload: { type: "answer", sdp: answer, from: userId },
            });
            log("📤 Đã gửi answer");
          }

          if (payload.type === "answer") {
            log("📥 Nhận answer");
            await currentPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSet.current = true;
            await processIceQueue();
            log("Đang chờ kết nối P2P...");
          }

          if (payload.type === "ice") {
            if (remoteDescSet.current) {
              await currentPc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } else {
              iceCandidateQueue.current.push(payload.candidate);
            }
          }

          if (payload.type === "accept") {
            log("📥 Đối phương chấp nhận, tạo offer...");
            if (!isIncoming && !offerSentRef.current) {
              offerSentRef.current = true;
              setStatus("connecting");
              const offer = await currentPc.createOffer();
              await currentPc.setLocalDescription(offer);
              channel.send({
                type: "broadcast", event: "call-signal",
                payload: { type: "offer", sdp: offer, from: userId },
              });
              log("📤 Đã gửi offer");
            }
          }

          if (payload.type === "ready") {
            log("📥 Đối phương sẵn sàng");
            if (!isIncoming && !offerSentRef.current) {
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
                  log("📤 Đã gửi offer (retry)");
                } catch (e) { log(`❌ Offer failed: ${e.message}`); }
              }, 500);
            }
          }

          if (payload.type === "end") {
            log("📥 Đối phương kết thúc cuộc gọi");
            cleanup();
            if (mounted) {
              setStatus("ended");
              setTimeout(() => onEndRef.current(), 800);
            }
          }
        } catch (e) {
          log(`❌ Signal error: ${e.message}`);
        }
      });

      await channel.subscribe((st) => {
        log(`Channel: ${st}`);
      });
      channelRef.current = channel;

      /* 7. Role-based actions after channel is ready */
      if (!isIncoming) {
        // CALLER
        setStatus("calling");
        log("Gửi tin nhắn cuộc gọi...");

        const { error: msgErr } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: isVideo ? "📹 Cuộc gọi video" : "📞 Cuộc gọi thoại",
          type: "call",
        });
        if (msgErr) log(`⚠️ Insert msg: ${msgErr.message}`);
        else log("✅ Đã gửi tin nhắn, chờ đối phương...");

        // Push notification to other members
        try {
          const { data: myProfile } = await supabase
            .from("profiles").select("display_name").eq("id", userId).single();
          const callerName = myProfile?.display_name || "Ai đó";
          const { data: members } = await supabase
            .from("conversation_members").select("user_id")
            .eq("conversation_id", conversationId).neq("user_id", userId);
          if (members && members.length > 0) {
            log(`Push notification → ${members.length} người`);
            for (const m of members) {
              fetch("/api/push-call", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetUserId: m.user_id, callerName, mode }),
              }).catch(() => {});
            }
          } else {
            log("⚠️ Không tìm thấy thành viên khác");
          }
        } catch {}

        // Auto-timeout
        setTimeout(() => {
          if (mounted && !startTimeRef.current) {
            log("⏰ 45s timeout — không có phản hồi");
            setError("Không có phản hồi");
            endCall();
          }
        }, 45000);

      } else {
        // RECEIVER
        setStatus("connecting");
        log("📤 Gửi accept...");
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, userId, isIncoming, isVideo]);

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

      {/* Debug log toggle */}
      <button onClick={() => setShowDebug(!showDebug)}
        style={{
          position: "absolute", top: 8, left: 8, zIndex: 5,
          background: "rgba(0,0,0,.4)", border: "none", color: "#fff",
          borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer",
        }}>
        {showDebug ? "Ẩn log" : "Log"}
      </button>

      {/* Debug panel */}
      {showDebug && (
        <div style={{
          position: "absolute", top: 36, left: 8, right: 8, zIndex: 5,
          background: "rgba(0,0,0,.85)", borderRadius: 10, padding: "8px 10px",
          maxHeight: 200, overflowY: "auto", fontSize: 10, color: "#68d391",
          fontFamily: "monospace", lineHeight: 1.6,
        }}>
          {debugLog.length === 0 && <div style={{ color: "#999" }}>Đang khởi tạo...</div>}
          {debugLog.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

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
