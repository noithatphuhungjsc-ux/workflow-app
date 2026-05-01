import { useState, useEffect, useRef, useCallback } from "react";
import { C } from "../constants";
import { supabase } from "../lib/supabase";
import CallHeader from "./call/CallHeader";
import CallControls from "./call/CallControls";
import VideoGrid from "./call/VideoGrid";

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
   CALL SCREEN — WebRTC P2P audio/video call (orchestrator)
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
  const acceptedPeerRef = useRef(null);
  const callMsgIdRef = useRef(null);
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
    const p = getProximity();
    if (p) p.release().catch(() => {});
  }, []);

  const endCall = useCallback(async (reason = "hangup") => {
    if (endedRef.current) return;
    endedRef.current = true;
    try {
      channelRef.current?.send({
        type: "broadcast", event: "call-signal",
        payload: { type: "end", from: userId, reason },
      });
    } catch {}

    const wasAnswered = !!startTimeRef.current;
    if (callMsgIdRef.current) {
      const dur = wasAnswered ? Math.floor((Date.now() - startTimeRef.current) / 1000) : 0;
      const emoji = mode === "video" ? "\u{1F4F9}" : "\u{1F4DE}";
      let statusLabel;
      if (wasAnswered) {
        statusLabel = `${emoji} Cu\u1ed9c g\u1ecdi ${mode === "video" ? "video" : "tho\u1ea1i"} \u2014 ${Math.floor(dur / 60)}:${(dur % 60).toString().padStart(2, "0")}`;
      } else if (reason === "rejected") {
        statusLabel = `${emoji} Cu\u1ed9c g\u1ecdi b\u1ecb t\u1eeb ch\u1ed1i`;
      } else if (reason === "no-answer") {
        statusLabel = `${emoji} Kh\u00f4ng tr\u1ea3 l\u1eddi`;
      } else {
        statusLabel = `${emoji} Cu\u1ed9c g\u1ecdi nh\u1ee1`;
      }
      try {
        await supabase.from("messages")
          .update({ content: statusLabel })
          .eq("id", callMsgIdRef.current);
      } catch {}
    }

    // ALWAYS gửi push-call-end cho other party (cả caller lẫn receiver)
    // → mobile mất websocket vẫn nhận được qua FCM push
    try {
      const { data: members } = await supabase
        .from("conversation_members").select("user_id")
        .eq("conversation_id", conversationId).neq("user_id", userId);
      // Map reason → push-call-end reason
      const pushReason = wasAnswered ? "ended"
        : reason === "rejected" ? "declined"
        : reason === "no-answer" ? "missed"
        : "missed";
      for (const m of (members || [])) {
        fetch("/api/push-call-end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUserId: m.user_id,
            conversationId,
            reason: pushReason,
          }),
        }).catch(() => {});
      }
    } catch {}

    cleanup();
    setStatus("ended");
    setTimeout(() => onEndRef.current(), 800);
  }, [userId, mode, cleanup, isIncoming, conversationId]);

  /* ── Process queued ICE candidates ── */
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
      log(`B\u1eaft \u0111\u1ea7u (${isIncoming ? "nh\u1eadn" : "g\u1ecdi"}, ${isVideo ? "video" : "audio"})`);

      /* 1. Get media */
      try {
        log("Xin quy\u1ec1n micro" + (isVideo ? "/camera" : "") + "...");
        const constraints = { audio: true, video: isVideo };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        log("\u2705 \u0110\u00e3 c\u00f3 micro" + (isVideo ? "/camera" : ""));
      } catch (e) {
        let msg;
        if (e.name === "NotAllowedError") {
          msg = "\u274C Ch\u01b0a c\u1ea5p quy\u1ec1n micro" + (isVideo ? "/camera" : "") + ". Vui l\u00f2ng c\u1ea5p quy\u1ec1n trong Settings tr\u00ecnh duy\u1ec7t.";
        } else if (e.name === "NotFoundError") {
          msg = isVideo
            ? "\u274C Thi\u1ebft b\u1ecb kh\u00f4ng c\u00f3 camera. Vui l\u00f2ng d\u00f9ng \u0111i\u1ec7n tho\u1ea1i ho\u1eb7c laptop c\u00f3 webcam."
            : "\u274C Thi\u1ebft b\u1ecb kh\u00f4ng c\u00f3 micro.";
        } else if (e.name === "NotReadableError") {
          msg = "\u274C Thi\u1ebft b\u1ecb \u0111ang \u0111\u01b0\u1ee3c \u1ee9ng d\u1ee5ng kh\u00e1c d\u00f9ng. T\u1eaft camera/mic \u1ee9ng d\u1ee5ng kh\u00e1c r\u1ed3i th\u1eed l\u1ea1i.";
        } else {
          msg = `\u274C L\u1ed7i thi\u1ebft b\u1ecb: ${e.name}`;
        }
        log(msg);
        setError(msg);
        setStatus("ended");
        setTimeout(() => onEndRef.current(), 4000);
        return;
      }

      /* 2. Create peer connection */
      log("T\u1ea1o k\u1ebft n\u1ed1i P2P (STUN+TURN)...");
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
        log("\u2705 Nh\u1eadn stream t\u1eeb \u0111\u1ed1i ph\u01b0\u01a1ng");
        if (!e.streams[0]) return;
        if (isVideo && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0];
        }
      };

      /* 4. ICE candidates */
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
            log("\u2705 \u0110\u00c3 K\u1ebeT N\u1ed0I TH\u00c0NH C\u00d4NG");
            if (!startTimeRef.current) {
              startTimeRef.current = Date.now();
              timerRef.current = setInterval(() => {
                setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
              }, 1000);
            }
          }
        }
        if (state === "failed") {
          log("\u274C ICE th\u1ea5t b\u1ea1i \u2014 c\u00f3 th\u1ec3 b\u1ecb firewall ch\u1eb7n");
          if (mounted) { setError("K\u1ebft n\u1ed1i th\u1ea5t b\u1ea1i"); endCall(); }
        }
        if (state === "disconnected") {
          log("\u26A0\uFE0F M\u1ea5t k\u1ebft n\u1ed1i, \u0111\u1ee3i 5s...");
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
      log(`K\u1ebft n\u1ed1i channel: ${channelName}`);
      const channel = supabase.channel(channelName, {
        config: { broadcast: { self: false } },
      });

      channel.on("broadcast", { event: "call-signal" }, async ({ payload }) => {
        if (!mounted || payload.from === userId) return;
        const currentPc = pcRef.current;
        if (!currentPc) return;

        try {
          if (payload.type === "offer") {
            if (payload.to && payload.to !== userId) return;
            log("\u{1F4E5} Nh\u1eadn offer, t\u1ea1o answer...");
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
            log("\u{1F4E4} \u0110\u00e3 g\u1eedi answer");
          }

          if (payload.type === "answer") {
            if (acceptedPeerRef.current && payload.from !== acceptedPeerRef.current) return;
            log("\u{1F4E5} Nh\u1eadn answer");
            await currentPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSet.current = true;
            await processIceQueue();
            log("\u0110ang ch\u1edd k\u1ebft n\u1ed1i P2P...");
          }

          if (payload.type === "ice") {
            if (acceptedPeerRef.current && payload.from !== acceptedPeerRef.current) return;
            if (remoteDescSet.current) {
              await currentPc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } else {
              iceCandidateQueue.current.push(payload.candidate);
            }
          }

          if (payload.type === "accept") {
            if (!isIncoming && !offerSentRef.current) {
              acceptedPeerRef.current = payload.from;
              offerSentRef.current = true;
              log(`\u{1F4E5} ${payload.from} ch\u1ea5p nh\u1eadn, t\u1ea1o offer...`);
              setStatus("connecting");
              const offer = await currentPc.createOffer();
              await currentPc.setLocalDescription(offer);
              channel.send({
                type: "broadcast", event: "call-signal",
                payload: { type: "offer", sdp: offer, from: userId, to: acceptedPeerRef.current },
              });
              log("\u{1F4E4} \u0110\u00e3 g\u1eedi offer");
            } else if (!isIncoming && acceptedPeerRef.current && payload.from !== acceptedPeerRef.current) {
              log(`\u26A0\uFE0F ${payload.from} c\u0169ng accept \u2014 b\u1ecf qua (\u0111\u00e3 k\u1ebft n\u1ed1i ng\u01b0\u1eddi kh\u00e1c)`);
            }
          }

          if (payload.type === "ready") {
            if (!isIncoming && !offerSentRef.current) {
              log("\u{1F4E5} \u0110\u1ed1i ph\u01b0\u01a1ng s\u1eb5n s\u00e0ng");
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
                  log("\u{1F4E4} \u0110\u00e3 g\u1eedi offer (retry)");
                } catch (e) { log(`\u274C Offer failed: ${e.message}`); }
              }, 500);
            }
          }

          if (payload.type === "end") {
            const reason = payload.reason || "hangup";
            log("📥 Doi phuong: end (" + reason + ")");
            if (!isIncoming && !startTimeRef.current) {
              if (reason === "rejected") setError("Đã bị từ chối");
              else if (reason === "no-answer") setError("Không trả lời");
              else setError("Cuộc gọi kết thúc");
            } else if (startTimeRef.current) {
              setError("Đối phương đã ngắt máy");
            }
            cleanup();
            if (mounted) {
              setStatus("ended");
              setTimeout(() => onEndRef.current(), 1500);
            }
          }
        } catch (e) {
          log(`\u274C Signal error: ${e.message}`);
        }
      });

      await channel.subscribe((st) => {
        log(`Channel: ${st}`);
      });
      channelRef.current = channel;

      /* 7. Role-based actions */
      if (!isIncoming) {
        setStatus("calling");
        log("G\u1eedi tin nh\u1eafn cu\u1ed9c g\u1ecdi...");

        const { data: msgData, error: msgErr } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: isVideo ? "\u{1F4F9} Cu\u1ed9c g\u1ecdi video" : "\u{1F4DE} Cu\u1ed9c g\u1ecdi tho\u1ea1i",
          type: "call",
        }).select("id").single();
        if (msgErr) log(`\u26A0\uFE0F Insert msg: ${msgErr.message}`);
        else {
          callMsgIdRef.current = msgData?.id;
          log("\u2705 \u0110\u00e3 g\u1eedi tin nh\u1eafn, ch\u1edd \u0111\u1ed1i ph\u01b0\u01a1ng...");
        }

        try {
          const { data: myProfile } = await supabase
            .from("profiles").select("display_name").eq("id", userId).single();
          const callerName = myProfile?.display_name || "Ai \u0111\u00f3";
          const { data: members } = await supabase
            .from("conversation_members").select("user_id")
            .eq("conversation_id", conversationId).neq("user_id", userId);
          if (members && members.length > 0) {
            log(`Push notification \u2192 ${members.length} ng\u01b0\u1eddi`);
            for (const m of members) {
              fetch("/api/push-call", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetUserId: m.user_id, callerName, callerId: userId, mode, conversationId }),
              }).catch(() => {});
            }
          } else {
            log("\u26A0\uFE0F Kh\u00f4ng t\u00ecm th\u1ea5y th\u00e0nh vi\u00ean kh\u00e1c");
          }
        } catch {}

        setTimeout(() => {
          if (mounted && !startTimeRef.current) {
            log("⏰ 25s timeout");
            setError("Không trả lời");
            endCall("no-answer");
          }
        }, 25000);

      } else {
        setStatus("connecting");
        log("\u{1F4E4} G\u1eedi accept...");
        const sendAccept = () => {
          if (!channelRef.current || remoteDescSet.current) return;
          channelRef.current.send({
            type: "broadcast", event: "call-signal",
            payload: { type: "accept", from: userId },
          });
        };
        sendAccept();
        const retryAccept = setInterval(() => {
          if (remoteDescSet.current || !mounted) { clearInterval(retryAccept); return; }
          log("\u{1F4E4} Retry accept...");
          sendAccept();
        }, 2000);
        setTimeout(() => clearInterval(retryAccept), 20000);
      }
    };

    init();
    return () => { mounted = false; cleanup(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, userId, isIncoming, isVideo]);

  /* — Native call-ended event */
  useEffect(() => {
    const handler = (e) => {
      const { reason } = e.detail || {};
      console.log("[Call] Native call-ended:", reason);
      if (!endedRef.current) {
        if (reason === "declined") setError("Đã bị từ chối");
        else if (reason === "missed") setError("Không trả lời");
        else if (reason === "ended") setError("Đối phương đã ngắt máy");
        setTimeout(() => endCall(), 1500);
      }
    };
    window.addEventListener("native-call-ended", handler);
    return () => window.removeEventListener("native-call-ended", handler);
  }, [endCall]);

  /* — Service Worker message bridge: FCM call_end -> native-call-ended event */
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (e) => {
      if (e.data?.type === "call-ended") {
        window.dispatchEvent(new CustomEvent("native-call-ended", {
          detail: { reason: e.data.reason, conversationId: e.data.conversationId },
        }));
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  /* ── Poll fallback: caller polls message status every 3s
        cover trường hợp mobile mất websocket + FCM không đến ── */
  useEffect(() => {
    if (isIncoming) return; // chỉ caller poll
    const id = setInterval(async () => {
      if (!callMsgIdRef.current || endedRef.current) return;
      try {
        const { data } = await supabase.from("messages")
          .select("content").eq("id", callMsgIdRef.current).single();
        if (!data?.content) return;
        const c = data.content;
        if (c.includes("từ chối") || c.includes("Không trả lời") ||
            c.includes("nhỡ") || c.includes("— 0:") ||
            (c.includes("Cuộc gọi") && c.includes("—") && !c.includes("— 0:00"))) {
          log("\u{1F4CA} Poll: " + c);
          if (c.includes("từ chối")) setError("Đã bị từ chối");
          else if (c.includes("Không trả lời")) setError("Không trả lời");
          else if (c.includes("nhỡ")) setError("Cuộc gọi nhỡ");
          else setError("Cuộc gọi kết thúc");
          setTimeout(() => endCall("hangup"), 1500);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(id);
  }, [isIncoming, endCall, log]);

  /* ── Proximity sensor ── */
  useEffect(() => {
    const p = getProximity();
    if (!p) return;
    if (status === "connected" || status === "connecting" || status === "calling") {
      p.acquire().catch(() => {});
      return () => { p.release().catch(() => {}); };
    }
  }, [status]);

  /* ── Ringback tone ── */
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

        const playRingCycle = () => {
          if (ctx.state === "closed") return;
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = "sine"; osc1.frequency.value = 440;
          gain1.gain.setValueAtTime(0.12, ctx.currentTime);
          gain1.gain.setValueAtTime(0.12, ctx.currentTime + 0.9);
          gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
          osc1.connect(gain1); gain1.connect(ctx.destination);
          osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 1);

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

  /* ── Accept incoming call ── */
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
    calling: "\u0110ang g\u1ecdi...",
    ringing: "Cu\u1ed9c g\u1ecdi \u0111\u1ebfn...",
    connecting: "\u0110ang k\u1ebft n\u1ed1i...",
    connected: formatDuration(duration),
    ended: error || "K\u1ebft th\u00fac",
  };

  /* ── UI ── */
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 10001,
      display: "flex", flexDirection: "column", alignItems: "center",
      background: isVideo ? "#000" : "linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
      maxWidth: 480, margin: "0 auto",
    }}>
      <VideoGrid
        ref={{ localVideoRef, remoteVideoRef }}
        isVideo={isVideo}
        cameraOff={cameraOff}
        remoteAudioRef={remoteAudioRef}
        showDebug={showDebug}
        setShowDebug={setShowDebug}
        debugLog={debugLog}
      />

      <CallHeader
        peerName={peerName}
        statusText={statusText[status]}
        status={status}
        error={error}
        isVideo={isVideo}
      />

      <CallControls
        status={status}
        muted={muted}
        cameraOff={cameraOff}
        isVideo={isVideo}
        toggleMute={toggleMute}
        toggleCamera={toggleCamera}
        endCall={() => endCall(status === "ringing" ? "rejected" : "hangup")}
        acceptCall={acceptCall}
      />

      <style>{`
        @keyframes callPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .85; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
