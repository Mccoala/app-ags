import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Volume2 } from "lucide-react";
import SpaceOrb from "./SpaceOrb";
import { speakText, stopSpeaking, unlockAudio, getLevel, cleanForSpeech, getVoicePref, setVoicePref } from "../lib/voice";

// ── Conversa por voz com o Cérebro ────────────────────────────────────────────
// A pessoa fala → o navegador transforma em texto → o Cérebro responde (curto, em
// tom de conversa) → a resposta sai em voz (natural ou do aparelho) enquanto a
// esfera muda de forma com as palavras. Depois volta a ouvir sozinho.

const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export default function VoiceBrain({ ask, busy, userName, onClose }) {
  const [phase, setPhase] = useState("idle"); // idle | listening | thinking | speaking
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState("");
  const [err, setErr] = useState("");
  const [voice, setVoice] = useState(getVoicePref);
  const open = useRef(true), rec = useRef(null), voiceRef = useRef(voice), turn = useRef(0);
  const askRef = useRef(ask); askRef.current = ask; // sempre a versão mais nova (guarda o histórico da conversa)
  useEffect(() => { voiceRef.current = voice; setVoicePref(voice); }, [voice]);

  const stopAll = () => { try { rec.current?.abort(); } catch { } stopSpeaking(); };
  useEffect(() => {
    unlockAudio(); // aberto por um clique: libera o som no celular
    const t = setTimeout(listen, 350);
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => { open.current = false; clearTimeout(t); stopAll(); window.removeEventListener("keydown", esc); };
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
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { setErr("Libere o microfone para o Inflatudo (no cadeado ao lado do endereço do site) e toque na esfera para falar."); setPhase("idle"); }
      else if (e.error !== "no-speech" && e.error !== "aborted") setErr("Não consegui ouvir. Toque na esfera para tentar de novo.");
    };
    r.onend = () => {
      if (!open.current || rec.current !== r) return;
      const q = final.trim();
      if (q) handle(q); else setPhase(p => (p === "listening" ? "idle" : p));
    };
    try { r.start(); } catch { setPhase("idle"); }
  };

  const handle = async (q) => {
    const my = ++turn.current;
    setPhase("thinking"); setAnswer("");
    const a = await askRef.current(q, { voice: true });
    if (!open.current || my !== turn.current) return;
    if (!a) { setErr("O Cérebro não conseguiu responder agora. Tente de novo."); setPhase("idle"); return; }
    const said = cleanForSpeech(a);
    setAnswer(said); setPhase("speaking");
    await speakText(said, voiceRef.current);
    if (open.current && my === turn.current) listen(); // terminou de falar: volta a ouvir
  };

  // tocar na esfera: fala / interrompe / para de ouvir
  const tap = () => {
    unlockAudio();
    if (phase === "listening") { turn.current++; stopAll(); setPhase("idle"); return; }
    if (phase === "speaking") { turn.current++; stopAll(); listen(); return; }
    if (phase === "idle") listen();
  };

  const label = { idle: "Toque na esfera para falar", listening: "Estou ouvindo…", thinking: busy || "Pensando…", speaking: "Falando… (toque para interromper)" }[phase];
  return createPortal(
    <div className="fixed inset-0 z-[500] flex flex-col text-white overflow-hidden" style={{ background: "radial-gradient(ellipse at 50% 40%, #1b0b33 0%, #08051a 55%, #020108 100%)" }}>
      <div className="absolute inset-0"><SpaceOrb phase={phase} getLevel={getLevel} size={1} lift={0.1} /></div>
      <div className="relative w-full flex items-center justify-between p-4 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-bold text-fuchsia-200"><Volume2 size={16} />Conversa com o Cérebro</div>
        <button onClick={onClose} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20" aria-label="Encerrar"><X size={20} /></button>
      </div>
      <button onClick={tap} aria-label={label} className="relative flex-1 w-full outline-none" />
      <div className="relative px-6 pb-2 text-center min-h-[110px] max-w-2xl mx-auto w-full pointer-events-none">
        <div className="text-lg sm:text-xl font-black drop-shadow">{label}</div>
        {heard && <div className="mt-2 text-sm text-fuchsia-200/80">“{heard}”</div>}
        {answer && phase !== "listening" && <div className="mt-2 text-base sm:text-lg text-white/90 leading-relaxed drop-shadow">{answer}</div>}
        {err && <div className="mt-2 text-sm font-bold text-amber-300">{err}</div>}
        {phase === "idle" && !heard && !answer && !err && <div className="mt-1 text-sm text-white/60">Pergunte qualquer coisa sobre a fábrica{userName ? `, ${userName}` : ""}. Ex.: “quais pedidos estão atrasados?”</div>}
      </div>
      <div className="relative w-full flex items-center justify-center gap-3 p-6 pb-8 flex-wrap">
        <div className="flex p-1 rounded-full bg-white/10 backdrop-blur">
          {[["f", "Voz feminina"], ["m", "Voz masculina"]].map(([k, l]) => <button key={k} onClick={() => setVoice(k)} className={`px-4 py-2 rounded-full text-sm font-bold transition ${voice === k ? "bg-white text-purple-900" : "text-white/70 hover:text-white"}`}>{l}</button>)}
        </div>
        <button onClick={onClose} className="px-5 py-2.5 rounded-full text-sm font-black bg-red-500/90 hover:bg-red-500">Encerrar</button>
      </div>
    </div>,
    document.body
  );
}
