/* ================================================================
   TTS — Text-to-Speech with callback
   ================================================================ */

export function tts(text, rate = 1.05, onEnd = null) {
  if (!window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/[#]{1,6}\s?/g, "")
    .replace(/[\[\]()]/g, "")
    .replace(/^[\s]*[-\u2022\u25CF\u25AA\u25B8\u25BA\u2192*+]\s?/gm, "")
    .replace(/^\s*\d+\.\s/gm, "")
    .replace(/[>|`~]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, "")
    .replace(/\n+/g, ". ")
    .replace(/\s{2,}/g, " ")
    .slice(0, 300).trim();
  if (!clean) { onEnd?.(); return; }

  try { window.speechSynthesis.resume(); } catch {}

  const u = new SpeechSynthesisUtterance(clean);
  u.lang = "vi-VN";
  u.rate = rate;
  u.pitch = 0.92;
  u.volume = 1;
  const voices = window.speechSynthesis.getVoices();
  const viFemale = voices.find(v => v.lang.startsWith("vi") && /female|nu/i.test(v.name));
  const viAny = voices.find(v => v.lang.startsWith("vi"));
  if (viFemale) u.voice = viFemale;
  else if (viAny) u.voice = viAny;

  let ended = false;
  const safetyMs = Math.max(clean.length * 80, 2500);
  const timer = onEnd ? setTimeout(() => { if (!ended) { ended = true; onEnd(); } }, safetyMs) : null;
  u.onend = () => { if (!ended) { ended = true; clearTimeout(timer); onEnd?.(); } };
  u.onerror = () => { if (!ended) { ended = true; clearTimeout(timer); onEnd?.(); } };
  try { window.speechSynthesis.speak(u); } catch { if (!ended) { ended = true; clearTimeout(timer); onEnd?.(); } }
  setTimeout(() => { try { window.speechSynthesis.resume(); } catch {} }, 200);
}
