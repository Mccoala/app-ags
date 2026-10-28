import React from "react";
import { getToken } from "./api";

// ── Voz do Cérebro (fala) ─────────────────────────────────────────────────────
// speakText: tenta a voz natural do servidor (/tts); se não houver, usa a voz do
// aparelho. getLevel() devolve 0..1 com a "força" da fala no momento (para a
// esfera do Cérebro se mexer conforme as palavras saem).

const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
let audioEl = null, ctx = null, analyser = null, buf = null, natural = true;
let mode = "none", wordAt = 0, startedAt = 0, token = 0;

export const cleanForSpeech = (t) => String(t || "")
  .replace(/\*\*?|__|`|#+\s|^\s*[-•]\s+/gm, "")
  .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
  .replace(/\n{2,}/g, ". ").replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();

function ensureAudio() {
  if (!audioEl) { audioEl = new Audio(); audioEl.preload = "auto"; }
  return audioEl;
}
// chamar dentro de um clique: libera o som no celular e prepara o medidor de volume
export function unlockAudio() {
  const el = ensureAudio();
  try { el.src = SILENT; el.play().catch(() => { }); } catch { }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC && !ctx) ctx = new AC();
    if (ctx && ctx.state !== "running") ctx.resume().then(connect).catch(() => { });
    else connect();
  } catch { }
  try { window.speechSynthesis?.getVoices(); } catch { }
}
function connect() {
  if (!ctx || analyser || ctx.state !== "running") return;
  try {
    const src = ctx.createMediaElementSource(ensureAudio());
    analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.6;
    buf = new Uint8Array(analyser.fftSize);
    src.connect(analyser); analyser.connect(ctx.destination);
  } catch { analyser = null; }
}

export function getLevel() {
  const now = performance.now();
  if (mode === "audio") {
    if (analyser && audioEl && !audioEl.paused) {
      analyser.getByteTimeDomainData(buf);
      let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
      return Math.min(1, Math.sqrt(s / buf.length) * 4.2);
    }
    const t = (now - startedAt) / 1000; // sem medidor: imita o ritmo da fala
    return 0.35 + 0.3 * Math.abs(Math.sin(t * 7.1)) * Math.abs(Math.sin(t * 2.3 + 1));
  }
  if (mode === "device") {
    const since = now - wordAt, t = (now - startedAt) / 1000;
    const base = wordAt ? Math.exp(-since / 170) : 0.5 * Math.abs(Math.sin(t * 6.3));
    return Math.min(1, 0.22 + 0.75 * base);
  }
  return 0;
}
export const isSpeaking = () => mode !== "none";

export function stopSpeaking() {
  token++; mode = "none";
  try { audioEl?.pause(); } catch { }
  try { window.speechSynthesis?.cancel(); } catch { }
}

function deviceVoice(gender) {
  const vs = (window.speechSynthesis?.getVoices() || []).filter(v => /^pt(-|_)?BR/i.test(v.lang) || /portugu[eê]s.*brasil/i.test(v.name));
  const fem = /francisca|luciana|maria|vit[oó]ria|thalita|leila|female|feminina|helena|camila/i, mal = /antonio|ant[oô]nio|daniel|felipe|ricardo|male|masculin|fabio|donato|julio/i;
  return vs.find(v => (gender === "m" ? mal : fem).test(v.name)) || vs[0] || null;
}

function speakDevice(text, gender, my) {
  return new Promise((resolve) => {
    const ss = window.speechSynthesis;
    if (!ss) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR"; u.rate = 1.05;
    const v = deviceVoice(gender); if (v) u.voice = v; else u.pitch = gender === "m" ? 0.8 : 1.15;
    mode = "device"; startedAt = performance.now(); wordAt = 0;
    u.onboundary = () => { wordAt = performance.now(); };
    const done = () => { if (my === token) mode = "none"; resolve(); };
    u.onend = done; u.onerror = done;
    ss.cancel(); ss.speak(u);
  });
}

// Fala o texto. Resolve quando termina (ou quando é interrompido).
export async function speakText(text, gender = "f") {
  stopSpeaking();
  const my = ++token;
  const say = cleanForSpeech(text);
  if (!say) return;
  if (natural) {
    try {
      const r = await fetch("/.netlify/functions/tts", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ text: say, voice: gender }) });
      if (my !== token) return;
      if (r.status === 501) natural = false; // sem voz natural configurada: usa a do aparelho daqui pra frente
      if (r.ok) {
        const url = URL.createObjectURL(await r.blob());
        if (my !== token) return;
        const el = ensureAudio();
        connect();
        if (ctx && ctx.state !== "running") { try { await ctx.resume(); } catch { } }
        await new Promise((resolve) => {
          const end = () => { URL.revokeObjectURL(url); if (my === token) mode = "none"; resolve(); };
          el.onended = end; el.onpause = () => { if (my !== token) end(); };
          el.onerror = () => { URL.revokeObjectURL(url); if (my === token) mode = "none"; resolve(); };
          el.src = url; mode = "audio"; startedAt = performance.now();
          el.play().catch(() => { URL.revokeObjectURL(url); if (my === token) mode = "none"; resolve(); });
        });
        return;
      }
    } catch { }
  }
  // sem voz natural: fica em silêncio (a voz do aparelho é robótica demais)
}

// A voz só aparece quando a voz natural está configurada no servidor (sem voz robótica do aparelho)
let availP = null;
export function voiceAvailable() {
  if (!availP) availP = fetch("/.netlify/functions/tts", { method: "GET", cache: "no-store" }).then(r => r.ok ? r.json() : { natural: false }).then(j => !!j.natural).catch(() => false);
  return availP;
}
export function useVoiceAvailable() {
  const [ok, setOk] = React.useState(false);
  React.useEffect(() => { let alive = true; voiceAvailable().then(v => alive && setOk(v)); return () => { alive = false; }; }, []);
  return ok;
}

export const getVoicePref = () => { try { return localStorage.getItem("inflatudo_voice") || "f"; } catch { return "f"; } };
export const setVoicePref = (v) => { try { localStorage.setItem("inflatudo_voice", v); } catch { } };
