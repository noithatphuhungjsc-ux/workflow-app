import { useState, useEffect, useRef, useCallback } from "react";
import { C } from "../constants";
import { supabase } from "../lib/supabase";

let _proximity = null;
function getProximity() {
  if (_proximity !== undefined && _proximity !== null) return _proximity;
  try {
    const cap = require("@capacitor/core");
    if (cap.Capacitor.isNativePlatform()) {
      _proximity = cap.registerPlugin("Proximity");
    } else {
      _proximity = null;
    }
  } catch { _proximity = null; }
  return _proximity;
}

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
  const acceptedPeerRef = useRef(null); // Lock to first accepted peer (group call safety)
  const callMsgIdRef = useRef(null); // Track call message ID for status update
  const ringbackRef = useRef(null);
  onEndRef.current = onEnd;

  /* ── Cleanup ── */
  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (ringbackRef.current) {
      clearInterval(ringbackRef.current.interval);
      ringbackRef.current.ctx.close().catch(() => {});
      ringbackRef.current = null;
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
    // Release proximity sensor
    const p = getProximity();
    if (p) p.release().catch(() => {});
  }, []);

  const endCall = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    try {
      channelRef.current?.send({
        type: "broadcast", event: "call-signal",
        payload: { type: "end", from: userId },
      });
    } catch {}

    // Update call message with status & duration
    const wasAnswered = !!startTimeRef.current;
    if (callMsgIdRef.current) {
      const dur = wasAnswered ? Math.floor((Date.now() - startTimeRef.current) / 1000) : 0;
      const emoji = mode === "video" ? "📹" : "📞";
      const statusLabel = wasAnswered
        ? `${emoji} Cuộc gọi ${mode === "video" ? "video" : "thoại"} — ${Math.floor(dur / 60)}:${(dur % 60).toString().padStart(2, "0")}`
        : `${emoji} Cuộc gọi nhỡ`;
      try {
        await supabase.from("messages")
          .update({ content: statusLabel })
          .eq("id", callMsgIdRef.current);
      } catch {}
    }

    // Notify callee's native layer (dismiss IncomingCallActivity / notification)
    if (!isIncoming) {
      try {
        const { data: members } = await supabase
          .from("conversation_members").select("user_id")
          .eq("conversation_id", conversationId).neq("user_id", userId);
        for (const m of (members || [])) {
          fetch("/api/push-call-end", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetUserId: m.user_id,
              conversationId,
              reason: wasAnswered ? "ended" : "missed",
            }),
          }).catch(() => {});
        }
      } catch {}
    }

    cleanup();
    setStatus("ended");
    setTimeout(() => onEndRef.current(), 800);
  }, [userId, mode, cleanup, isIncoming, conversationId]);

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
            // Only process offer meant for this user (group call safety)
            if (payload.to && payload.to !== userId) return;
            log("📥 Nhận offer, tạo answer...");
            acceptedPeerRef.current = payload.from;
            await currentPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSet.current = true;
            await processIceQueue();
            const answer = await currentPc.createAnswer();
            await currentPc.setLocalDescription(answer);
            channel.send({
              type: "broadcast", event: "call-signal",
              payload: { type: "answer", sdp: answer, from: userId, to: payload.from },
            });
            log("📤 Đã gửi answer");
          }

          if (payload.type === "answer") {
            // Only process answer from accepted peer
            if (acceptedPeerRef.current && payload.from !== acceptedPeerRef.current) return;
            log("📥 Nhận answer");
            await currentPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSet.current = true;
            await processIceQueue();
            log("Đang chờ kết nối P2P...");
          }

          if (payload.type === "ice") {
            // Only process ICE from accepted peer
            if (acceptedPeerRef.current && payload.from !== acceptedPeerRef.current) return;
            if (remoteDescSet.current) {
              await currentPc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } else {
              iceCandidateQueue.current.push(payload.candidate);
            }
          }

          if (payload.type === "accept") {
            // Lock to first peer who accepts (group call safety)
            if (!isIncoming && !offerSentRef.current) {
              acceptedPeerRef.current = payload.from;
              offerSentRef.current = true;
              log(`📥 ${payload.from} chấp nhận, tạo offer...`);
              setStatus("connecting");
              const offer = await currentPc.createOffer();
              await currentPc.setLocalDescription(offer);
              channel.send({
                type: "broadcast", event: "call-signal",
                payload: { type: "offer", sdp: offer, from: userId, to: acceptedPeerRef.current },
              });
              log("📤 Đã gửi offer");
            } else if (!isIncoming && acceptedPeerRef.current && payload.from !== acceptedPeerRef.current) {
              log(`⚠️ ${payload.from} cũng accept — bỏ qua (đã kết nối người khác)`);
            }
          }

          if (payload.type === "ready") {
            if (!isIncoming && !offerSentRef.current) {
              log("📥 Đối phương sẵn sàng");
              setTimeout(async () => {
                if (offerSentRef.current || !pcRef.current) return;
                acceptedPeerRef.current = payload.from;
                offerSentRef.current = true;
                setStatus("connecting");
                try {
                  const offer = await pcRef.current.createOffer();
                  await pcRef.current.setLocalDescription(offer);
                  channel.send({
                    type: "broadcast", event: "call-signal",
                    payload: { type: "offer", sdp: offer, from: userId, to: acceptedPeerRef.current },
                  });
                  log("📤 Đã gửi offer (retry)");
                } catch (e) { log(`❌ Offer failed: ${e.message}`); }
              }, 500);
            }
          }

          if (payload.type === "end") {
            log("📥 Đối phương kết thúc cuộc gọi");
            // If caller ends, update call message status (caller handles their own endCall)
            if (isIncoming && !startTimeRef.current) {
              // Receiver side — call was never answered by this peer, no need to update
            }
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

        const { data: msgData, error: msgErr } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: isVideo ? "📹 Cuộc gọi video" : "📞 Cuộc gọi thoại",
          type: "call",
        }).select("id").single();
        if (msgErr) log(`⚠️ Insert msg: ${msgErr.message}`);
        else {
          callMsgIdRef.current = msgData?.id;
          log("✅ Đã gửi tin nhắn, chờ đối phương...");
        }

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
                body: JSON.stringify({ targetUserId: m.user_id, callerName, callerId: userId, mode, conversationId }),
              }).catch(() => {});
            }
          } else {
            log("⚠️ Không tìm thấy thành viên khác");
          }
        } catch {}

        // Auto-timeout (30s — khớp với receiver auto-dismiss)
        setTimeout(() => {
          if (mounted && !startTimeRef.current) {
            log("⏰ 30s timeout — không có phản hồi");
            setError("Không có phản hồi");
            endCall();
          }
        }, 30000);

      } else {
        // RECEIVER — send accept repeatedly until caller responds with offer
        setStatus("connecting");
        log("📤 Gửi accept...");
        const sendAccept = () => {
          if (!channelRef.current || remoteDescSet.current) return;
          channelRef.current.send({
            type: "broadcast", event: "call-signal",
            payload: { type: "accept", from: userId },
          });
        };
        sendAccept();
        // Retry accept every 2s for up to 20s (in case caller channel wasn't ready)
        const retryAccept = setInterval(() => {
          if (remoteDescSet.current || !mounted) { clearInterval(retryAccept); return; }
          log("📤 Retry accept...");
          sendAccept();
        }, 2000);
        setTimeout(() => clearInterval(retryAccept), 20000);
      }
    };

    init();
    return () => { mounted = false; cleanup(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, userId, isIncoming, isVideo]);

  /* ── Listen for native call-ended event (callee declined from native UI) ── */
  useEffect(() => {
    const handler = (e) => {
      const { reason } = e.detail || {};
      console.log("[Call] Native call-ended:", reason);
      if (!endedRef.current) {
        if (reason === "declined") {
          setError("Đã từ chối cuộc gọi");
        }
        endCall();
      }
    };
    window.addEventListener("native-call-ended", handler);
    return () => window.removeEventListener("native-call-ended", handler);
  }, [endCall]);

  /* ── Proximity sensor: turn off screen when near ear ── */
  useEffect(() => {
    const p = getProximity();
    if (!p) return;
    if (status === "connected" || status === "connecting" || status === "calling") {
      p.acquire().catch(() => {});
      return () => { p.release().catch(() => {}); };
    }
  }, [status]);

  /* ── Ringback tone for caller (standard phone: 2x 440Hz beeps, 4s cycle) ── */
  useEffect(() => {
    const stopRingback = () => {
      if (ringbackRef.current) {
        clearInterval(ringbackRef.current.interval);
        ringbackRef.current.ctx.close().catch(() => {});
        ringbackRef.current = null;
      }
    };

    if (status !== "calling") { stopRingback(); return; }

    const startRingback = async () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === "suspended") await ctx.resume();

        // Standard ringback: two 440Hz tones (1s on, 1s off, 1s on, 3s off = 6s cycle)
        const playRingCycle = () => {
          if (ctx.state === "closed") return;
          // First beep: 0s → 1s
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = "sine"; osc1.frequency.value = 440;
          gain1.gain.setValueAtTime(0.12, ctx.currentTime);
          gain1.gain.setValueAtTime(0.12, ctx.currentTime + 0.9);
          gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
          osc1.connect(gain1); gain1.connect(ctx.destination);
          osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 1);

          // Second beep: 2s → 3s
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = "sine"; osc2.frequency.value = 440;
          gain2.gain.setValueAtTime(0, ctx.currentTime);
          gain2.gain.setValueAtTime(0.12, ctx.currentTime + 2);
          gain2.gain.setValueAtTime(0.12, ctx.currentTime + 2.9);
          gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3);
          osc2.connect(gain2); gain2.connect(ctx.destination);
          osc2.start(ctx.currentTime + 2); osc2.stop(ctx.currentTime + 3);
        };

        playRingCycle();
        const interval = setInterval(playRingCycle, 6000);
        ringbackRef.current = { ctx, interval };
      } catch {}
    };
    startRingback();

    return stopRingback;
  }, [status]);

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

  /* ── UI ── */
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 10001,
      display: "flex", flexDirection: "column", alignItems: "center",
      background: isVideo ? "#000" : "linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
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
            position: "absolute", top: 50, right: 16,
            width: 100, height: 140, borderRadius: 14,
            objectFit: "cover", zIndex: 2,
            border: "2px solid rgba(255,255,255,.2)",
            background: "#000",
            display: cameraOff ? "none" : "block",
          }} />
      )}

      {/* Top area — avatar + info */}
      <div style={{
        position: "relative", zIndex: 1,
        display: "flex", flexDirection: "column", alignItems: "center",
        paddingTop: 80, flex: 1, justifyContent: "flex-start",
      }}>
        {(!isVideo || status !== "connected") && (
          <>
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
              {statusText[status]}
            </div>
          </>
        )}
      </div>

      {/* Bottom controls */}
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

      {/* Debug toggle */}
      <button onClick={() => setShowDebug(!showDebug)}
        style={{
          position: "absolute", top: 10, left: 10, zIndex: 5,
          background: "rgba(255,255,255,.08)", border: "none", color: "rgba(255,255,255,.4)",
          borderRadius: 8, padding: "4px 10px", fontSize: 11,
        }}>
        {showDebug ? "Ẩn" : "Log"}
      </button>

      {showDebug && (
        <div style={{
          position: "absolute", top: 38, left: 10, right: 10, zIndex: 5,
          background: "rgba(0,0,0,.85)", borderRadius: 10, padding: "8px 10px",
          maxHeight: 200, overflowY: "auto", fontSize: 10, color: "#68d391",
          fontFamily: "monospace", lineHeight: 1.6,
        }}>
          {debugLog.length === 0 && <div style={{ color: "#555" }}>Đang khởi tạo...</div>}
          {debugLog.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      <style>{`
        @keyframes callPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .85; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}

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
