/* ================================================================
   HOOKS — useVoice, useWakeWord
   ================================================================ */
import { useState, useRef, useEffect, useCallback } from "react";
import { isWakeWord } from "./constants";

/* -- vibrate helper -- */
export function vibrate(pattern = [80, 40, 80]) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

/* ================================================================
   useWakeWord — always listening for "Hey WorkFlow"
   ================================================================ */
export function useWakeWord({ onWake, paused }) {
  const recRef     = useRef(null);
  const pausedRef  = useRef(paused);
  const activeRef  = useRef(false);
  const restartRef = useRef(null);
  const [state, setState] = useState("off");
  const [supported, setSupported] = useState(false);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const buildRec = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    rec.lang           = "vi-VN";
    rec.continuous     = true;
    rec.interimResults = true;
    rec.maxAlternatives = 2;

    rec.onresult = (e) => {
      if (pausedRef.current) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        for (let j = 0; j < e.results[i].length; j++) {
          const txt = e.results[i][j].transcript;
          if (isWakeWord(txt)) {
            vibrate([60, 30, 60, 30, 120]);
            setState("triggered");
            setTimeout(() => { setState("on"); onWake(); }, 300);
            return;
          }
        }
      }
    };

    rec.onend = () => {
      if (!activeRef.current) return;
      restartRef.current = setTimeout(() => {
        if (!activeRef.current || pausedRef.current) return;
        try { rec.start(); } catch {}
      }, 300);
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed") { setState("off"); activeRef.current = false; }
    };

    return rec;
  }, [onWake]);

  const enable = useCallback(async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setState("asking");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = buildRec();
      if (!rec) return;
      recRef.current = rec;
      activeRef.current = true;
      rec.start();
      setState("on");
      setSupported(true);
    } catch {
      setState("off");
    }
  }, [buildRec]);

  const disable = useCallback(() => {
    activeRef.current = false;
    clearTimeout(restartRef.current);
    if (recRef.current) { try { recRef.current.stop(); } catch {} recRef.current = null; }
    setState("off");
  }, []);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  return { supported, state, enable, disable };
}

/* ================================================================
   useVoice — one-shot voice recognition, tap toggle
   ================================================================ */
export function useVoice(onResult) {
  const r  = useRef(null);
  const cbRef = useRef(onResult);
  const onRef = useRef(false);
  const keepAliveRef = useRef(false);
  const [on, setOn] = useState(false);
  const [ok, setOk] = useState(false);

  cbRef.current = onResult;

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setOk(true);
    const rec = new SR();
    rec.lang = "vi-VN";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = e => {
      keepAliveRef.current = false;
      cbRef.current(e.results[0][0].transcript);
    };
    rec.onend = () => {
      onRef.current = false;
      setOn(false);
      if (keepAliveRef.current) {
        setTimeout(() => {
          if (!keepAliveRef.current) return;
          try { r.current.start(); onRef.current = true; setOn(true); } catch {}
        }, 200);
      }
    };
    rec.onerror = (e) => {
      onRef.current = false;
      setOn(false);
      if (keepAliveRef.current && e.error === "no-speech") {
        setTimeout(() => {
          if (!keepAliveRef.current) return;
          try { r.current.start(); onRef.current = true; setOn(true); } catch {}
        }, 200);
      }
    };
    r.current = rec;
  }, []);

  const start = useCallback(() => {
    if (!r.current || onRef.current) return;
    keepAliveRef.current = true;
    try { r.current.start(); onRef.current = true; setOn(true); } catch {}
  }, []);

  const toggle = useCallback(() => {
    if (!r.current) return;
    if (onRef.current) {
      keepAliveRef.current = false;
      try { r.current.stop(); } catch {}
      onRef.current = false;
      setOn(false);
    } else {
      keepAliveRef.current = true;
      try { r.current.start(); onRef.current = true; setOn(true); } catch {}
    }
  }, []);

  const stop = useCallback(() => {
    if (!r.current) return;
    keepAliveRef.current = false;
    try { r.current.stop(); } catch {}
    onRef.current = false;
    setOn(false);
  }, []);

  return { ok, on, start, toggle, stop };
}
