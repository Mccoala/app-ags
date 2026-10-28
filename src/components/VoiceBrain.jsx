import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Mic, MicOff, Volume2 } from "lucide-react";
import { getToken } from "../lib/api";

// ── Conversa por voz com o Cérebro ────────────────────────────────────────────
// O gerente fala → o navegador transforma em texto → o Cérebro responde (curto,
// em tom de conversa) → a resposta sai em voz natural (servidor /tts) ou, se não
// houver voz configurada, na voz do próprio aparelho. Depois volta a ouvir sozinho.

const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
const clean = (t) => String(t || "").replace(/\*\*?|__|`|#+\s|^\s*[-•]\s+/gm, "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/\n{2,}/g, ". ").replace(/\n/g, " ").trim();

function deviceVoice(gender) {
  const vs = (window.speechSynthesis?.getVoices() || []).filter(v => /^pt(-|_)?BR/i.test(v.lang) || /portugu[eê]s.*brasil/i.test(v.name));
  const fem = /francisca|luciana|maria|vit[oó]ria|thalita|leila|female|feminina|helena|camila/i, mal = /antonio|ant[oô]nio|daniel|felipe|ricardo|male|masculin|fabio|donato|julio/i;
  return vs.find(v => (gender === "m" ? mal : fem).test(v.name)) || vs[0] || null;
}

export default function VoiceBrain({ ask, busy, userName, onClose }) {
  const [phase, setPhase] = useState("idle"); // idle | listening | thinking | speaking
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState("");
  const [err, setErr] = useState("");
  const [voice, setVoice] = useState(() => { try { return localStorage.getItem("inflatudo_voice") || "f"; } catch { return "f"; } });
  const open = useRef(true), rec = useRef(null), audio = useRef(null), natural = useRef(true), voiceRef = useRef(voice);
  const askRef = useRef(ask); askRef.current = ask; // sempre a versão mais nova (guarda o histórico da conversa)
  useEffect(() => { voiceRef.current = voice; try { localStorage.setItem("inflatudo_voice", voice); } catch { } }, [voice]);

  const stopAll = () => {
    try { rec.current?.abort(); } catch { }
    try { audio.current?.pause(); } catch { }
    try { window.speechSynthesis?.cancel(); } catch { }
  };
  useEffect(() => {
    audio.current = new Audio(); audio.current.src = SILENT; audio.current.play().catch(() => { }); // libera o áudio no celular
    window.speechSynthesis?.getVoices();
    const t = setTimeout(listen, 350);
    return () => { open.current = false; clearTimeout(t); stopAll(); };
  }, []); // eslint-disable-line

  const listen = () => {
    if (!open.current) return;
    if (!SR) { setErr("Este navegador não entende voz. Use o Google Chrome (computador ou Android) ou o Safari atualizado."); return; }
    stopAll(); setErr(""); setHeard(""); setPhase("listening");
    const r = new SR(); rec.current = r;
    r.lang = "pt-BR"; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    let final = "";
    r.onresult = (e) => {
      let txt = ""; final = "";
      for (let i = 0; i < e.results.length; i++) { txt += e.results[i][0].transcript; if (e.results[i].isFinal) final += e.results[i][0].transcript; }
      setHeard(txt);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { setErr("Libere o microfone para o Inflatudo (no cadeado ao lado do endereço do site) e toque no botão para falar."); setPhase("idle"); }
      else if (e.error === "no-speech") { /* ninguém falou: tenta de novo no onend */ }
      else if (e.error !== "aborted") setErr("Não consegui ouvir. Toque no botão para tentar de novo.");
    };
    r.onend = () => {
      if (!open.current || rec.current !== r) return;
      const q = final.trim();
      if (q) handle(q);
      else setPhase(p => (p === "listening" ? "idle" : p));
    };
    try { r.start(); } catch { setPhase("idle"); }
  };

  const handle = async (q) => {
    setPhase("thinking"); setAnswer("");
    const a = await askRef.current(q, { voice: true });
    if (!open.current) return;
    if (!a) { setErr("O Cérebro não conseguiu responder agora. Tente de novo."); setPhase("idle"); return; }
    setAnswer(clean(a));
    speak(clean(a));
  };

  const afterSpeak = () => { if (open.current) listen(); };
  const speakDevice = (text) => {
    const ss = window.speechSynthesis;
    if (!ss) { afterSpeak(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR"; u.rate = 1.05; const v = deviceVoice(voiceRef.current); if (v) u.voice = v;
    if (!v) u.pitch = voiceRef.current === "m" ? 0.8 : 1.15;
    u.onend = afterSpeak; u.onerror = afterSpeak;
    ss.cancel(); ss.speak(u);
  };
  const speak = async (text) => {
    setPhase("speaking");
    if (natural.current) {
      try {
        const r = await fetch("/.netlify/functions/tts", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ text, voice: voiceRef.current }) });
        if (r.status === 501) natural.current = false; // sem voz natural configurada: usa a do aparelho daqui pra frente
        if (r.ok) {
          const url = URL.createObjectURL(await r.blob());
          if (!open.current) return;
          const el = audio.current; el.src = url;
          el.onended = () => { URL.revokeObjectURL(url); afterSpeak(); };
          el.onerror = () => { URL.revokeObjectURL(url); speakDevice(text); };
          await el.play();
          return;
        }
      } catch { }
    }
    speakDevice(text);
  };

  // botão central: fala / interrompe / para de ouvir
  const tap = () => {
    if (phase === "listening") { stopAll(); setPhase("idle"); return; }
    if (phase === "speaking") { stopAll(); listen(); return; }
    if (phase === "idle") listen();
  };

  const label = { idle: "Toque para falar", listening: "Estou ouvindo…", thinking: busy || "Pensando…", speaking: "Falando… (toque para interromper)" }[phase];
  const ring = phase === "listening" ? "vbListen 1.6s ease-out infinite" : "none";
  return createPortal(
    <div className="fixed inset-0 z-[500] flex flex-col items-center justify-between text-white" style={{ background: "radial-gradient(ellipse at 50% 35%, #2a1145 0%, #0b0716 60%, #05040a 100%)" }}>
      <style>{`
        @keyframes vbListen{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.9);opacity:0}}
        @keyframes vbSpin{to{transform:rotate(360deg)}}
        @keyframes vbBar{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}
        @keyframes vbBreath{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
      `}</style>
      <div className="w-full flex items-center justify-between p-4 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-bold text-fuchsia-200"><Volume2 size={16} />Conversa com o Cérebro</div>
        <button onClick={onClose} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20" aria-label="Encerrar"><X size={20} /></button>
      </div>

      <div className="flex flex-col items-center gap-8 px-6 w-full max-w-xl">
        <button onClick={tap} className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-full outline-none" aria-label={label}>
          {[0, 0.5, 1].map(d => <span key={d} className="absolute inset-0 rounded-full border-2 border-fuchsia-400/60" style={{ animation: ring, animationDelay: `${d}s`, opacity: phase === "listening" ? undefined : 0 }} />)}
          <span className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 0deg,#a855f7,#ec4899,#f97316,#a855f7)", filter: "blur(18px)", opacity: phase === "thinking" ? 0.9 : 0.55, animation: phase === "thinking" ? "vbSpin 1.4s linear infinite" : "vbBreath 3s ease-in-out infinite" }} />
          <span className="absolute inset-3 rounded-full flex items-center justify-center" style={{ background: "radial-gradient(circle at 35% 30%, #c084fc, #7e22ce 55%, #3b0764)", boxShadow: "inset 0 0 40px rgba(0,0,0,.35), 0 20px 60px rgba(168,85,247,.45)" }}>
            {phase === "speaking"
              ? <span className="flex items-center gap-1.5 h-16">{[0, 1, 2, 3, 4].map(i => <span key={i} className="w-2 h-16 rounded-full bg-white/90 origin-center" style={{ animation: `vbBar ${0.7 + i * 0.09}s ease-in-out ${i * 0.08}s infinite` }} />)}</span>
              : phase === "listening" ? <Mic size={56} /> : phase === "thinking" ? <span className="w-12 h-12 rounded-full border-4 border-white/30 border-t-white" style={{ animation: "vbSpin 0.9s linear infinite" }} /> : <MicOff size={50} className="opacity-80" />}
          </span>
        </button>
        <div className="text-center min-h-[96px]">
          <div className="text-lg sm:text-xl font-black">{label}</div>
          {heard && <div className="mt-3 text-sm text-fuchsia-200/80">“{heard}”</div>}
          {answer && phase !== "listening" && <div className="mt-3 text-base sm:text-lg text-white/90 leading-relaxed">{answer}</div>}
          {err && <div className="mt-3 text-sm font-bold text-amber-300">{err}</div>}
          {phase === "idle" && !heard && !answer && !err && <div className="mt-2 text-sm text-white/60">Pergunte qualquer coisa sobre a sua fábrica{userName ? `, ${userName}` : ""}. Ex.: “quais pedidos estão atrasados?”</div>}
        </div>
      </div>

      <div className="w-full flex items-center justify-center gap-3 p-6 pb-8 flex-wrap">
        <div className="flex p-1 rounded-full bg-white/10">
          {[["f", "Voz feminina"], ["m", "Voz masculina"]].map(([k, l]) => <button key={k} onClick={() => setVoice(k)} className={`px-4 py-2 rounded-full text-sm font-bold transition ${voice === k ? "bg-white text-purple-900" : "text-white/70 hover:text-white"}`}>{l}</button>)}
        </div>
        <button onClick={onClose} className="px-5 py-2.5 rounded-full text-sm font-black bg-red-500/90 hover:bg-red-500">Encerrar</button>
      </div>
    </div>,
    document.body
  );
}
