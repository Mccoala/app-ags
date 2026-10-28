import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Sparkles, PartyPopper } from "lucide-react";

// ── Tour guiado ───────────────────────────────────────────────────────────────
// steps: [{ title, text, tab?, target? (seletor CSS), icon? }]
// Destaca o elemento (se existir na tela) e mostra o balão ao lado; senão, balão no centro.
const PAD = 8, GAP = 14, CARD_W = 340;

export function TourWelcome({ name, onStart, onSkip, dark }) {
  return (
    <div className="fixed inset-0 z-[400] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`w-full max-w-md rounded-3xl p-7 text-center shadow-2xl ${dark ? "bg-gray-900 text-white border border-gray-800" : "bg-white text-gray-900"}`}>
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center text-white mb-4 shadow-lg shadow-orange-500/30"><Sparkles size={30} /></div>
        <h2 className="text-2xl font-black">Bem-vindo ao Inflatudo{name ? `, ${name}` : ""}!</h2>
        <p className={`mt-2 text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>Quer um tour rápido? Em 1 minuto eu te mostro onde fica cada coisa: pedidos, produção, finalização, equipe e muito mais.</p>
        <button onClick={onStart} className="mt-6 w-full py-3 rounded-xl font-black text-white bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg shadow-orange-500/25">Começar o tour</button>
        <button onClick={onSkip} className={`mt-2 w-full py-2.5 rounded-xl font-bold text-sm ${dark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-900"}`}>Pular tutorial</button>
      </div>
    </div>
  );
}

export default function Tour({ steps, onClose, onGo, dark }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [vw, setVw] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const step = steps[i];
  const last = i === steps.length - 1;

  const measure = useCallback(() => {
    setVw({ w: window.innerWidth, h: window.innerHeight });
    if (!step?.target) return setRect(null);
    const el = document.querySelector(step.target);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= 0 || r.left >= window.innerWidth) return setRect(null); // escondido (ex.: menu fechado no celular)
    if (r.top < 0 || r.bottom > window.innerHeight) { el.scrollIntoView({ block: "center" }); const r2 = el.getBoundingClientRect(); return setRect({ x: r2.left, y: r2.top, w: r2.width, h: r2.height }); }
    setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
  }, [step]);

  // muda de aba (se o passo pedir) e mede o alvo depois que a tela desenhar
  useLayoutEffect(() => {
    if (step?.tab) onGo(step.tab); // o destaque fica onde está e desliza até o próximo item (não volta para o topo)
    const t1 = setTimeout(measure, 120), t2 = setTimeout(measure, 450);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [i]); // eslint-disable-line
  useEffect(() => {
    window.addEventListener("resize", measure);
    const k = (e) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft") setI(x => Math.max(0, x - 1)); };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("keydown", k); };
  }); // eslint-disable-line
  const next = () => (last ? onClose(true) : setI(i + 1));

  // posição do balão: à direita do alvo; se não couber, embaixo; senão em cima; sem alvo, no centro
  const cardW = Math.min(CARD_W, vw.w - 24);
  let pos = { left: (vw.w - cardW) / 2, top: vw.h / 2 - 120 };
  if (rect) {
    if (rect.x + rect.w + GAP + cardW < vw.w - 12) pos = { left: rect.x + rect.w + GAP, top: rect.y + rect.h / 2 - 80 };
    else if (rect.y + rect.h + GAP + 200 < vw.h) pos = { left: rect.x + rect.w / 2 - cardW / 2, top: rect.y + rect.h + GAP };
    else pos = { left: rect.x + rect.w / 2 - cardW / 2, top: rect.y - GAP - 210 };
    pos.left = Math.max(12, Math.min(pos.left, vw.w - cardW - 12));
    pos.top = Math.max(12, Math.min(pos.top, vw.h - 230));
  }
  const Icon = step?.icon;

  return (
    <div className="fixed inset-0 z-[400]" role="dialog" aria-label="Tutorial">
      {/* fundo escuro com "buraco" no alvo */}
      {rect ? (
        <div key="spot" className="absolute rounded-xl transition-all duration-300 pointer-events-none ring-2 ring-orange-400"
          style={{ left: rect.x - PAD, top: rect.y - PAD, width: rect.w + PAD * 2, height: rect.h + PAD * 2, boxShadow: "0 0 0 9999px rgba(0,0,0,.72)" }} />
      ) : <div key="dim" className="absolute inset-0 bg-black/72" style={{ background: "rgba(0,0,0,.72)" }} />}
      <div className="absolute inset-0" onClick={e => e.stopPropagation()} />

      <div className={`absolute rounded-2xl p-5 shadow-2xl transition-all duration-300 ${dark ? "bg-gray-900 text-white border border-gray-700" : "bg-white text-gray-900"}`} style={{ width: cardW, left: pos.left, top: pos.top }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-500/15 text-orange-500 flex items-center justify-center flex-shrink-0">{Icon ? <Icon size={18} /> : last ? <PartyPopper size={18} /> : <Sparkles size={18} />}</div>
            <h3 className="font-black text-base leading-tight">{step?.title}</h3>
          </div>
          <button onClick={() => onClose(false)} title="Pular tutorial" className={`p-1 rounded-lg ${dark ? "text-gray-500 hover:text-white" : "text-gray-400 hover:text-gray-900"}`}><X size={18} /></button>
        </div>
        <p className={`mt-3 text-sm leading-relaxed ${dark ? "text-gray-300" : "text-gray-600"}`}>{step?.text}</p>
        <div className="mt-4 flex items-center gap-1">{steps.map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-5 bg-orange-500" : k < i ? "w-1.5 bg-orange-500/50" : `w-1.5 ${dark ? "bg-gray-700" : "bg-gray-200"}`}`} />)}</div>
        <div className="mt-4 flex items-center justify-between gap-2">
          {!last ? <button onClick={() => onClose(false)} className={`text-xs font-bold ${dark ? "text-gray-500 hover:text-gray-300" : "text-gray-400 hover:text-gray-700"}`}>Pular tutorial</button> : <span />}
          <div className="flex items-center gap-2">
            {i > 0 && <button onClick={() => setI(i - 1)} className={`flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-bold border ${dark ? "border-gray-700" : "border-gray-200"}`}><ChevronLeft size={16} />Voltar</button>}
            <button onClick={next} className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-black text-white bg-gradient-to-r from-orange-500 to-orange-600">{last ? "Começar a usar" : <>Próximo<ChevronRight size={16} /></>}</button>
          </div>
        </div>
        <div className={`mt-2 text-[11px] text-right ${dark ? "text-gray-600" : "text-gray-400"}`}>{i + 1} de {steps.length}</div>
      </div>
    </div>
  );
}
