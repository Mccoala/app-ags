import React, { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

// ── Infla no Cérebro ──────────────────────────────────────────────────────────
// Enquanto a IA pensa: Infla com o "?" coçando o queixo (em loop), tamanho médio.
// Quando a resposta chega: a lâmpada acende bem pequena em cima da resposta (useIdeaFlash + InflaIdea).
export default function InflaStatus({ busy, className = "" }) {
  if (!busy) return null;
  return (
    <div className={`flex items-end gap-2 text-sm text-fuchsia-300 ${className}`}>
      <img src="/video/infla-duvida.webp" alt="" className="w-[84px] h-auto flex-shrink-0 drop-shadow-[0_6px_14px_rgba(0,0,0,.35)]" />
      <span className="flex items-center gap-2 pb-2 font-semibold"><RefreshCw size={14} className="animate-spin" />{typeof busy === "string" ? busy : "Pensando…"}</span>
    </div>
  );
}

// Liga por ~2,5s quando o "pensando" termina (a resposta acabou de chegar)
export function useIdeaFlash(busy) {
  const [idea, setIdea] = useState(0);
  const was = useRef(false);
  useEffect(() => {
    if (busy) { was.current = true; setIdea(0); return; }
    if (!was.current) return;
    was.current = false; const k = Date.now(); setIdea(k);
    const t = setTimeout(() => setIdea(0), 2600);
    return () => clearTimeout(t);
  }, [busy]);
  return idea;
}

// Lâmpada pequenininha em cima da resposta
export function InflaIdea({ k }) {
  if (!k) return null;
  return <img key={k} src={`/video/infla-ideia.webp?${k}`} alt="" className="block w-[46px] h-auto -mb-1 ml-1 drop-shadow-[0_4px_8px_rgba(0,0,0,.35)]" />;
}

// Comemoração rápida (ex.: pedido finalizado com foto)
export function InflaCelebrate({ show, text, sub }) {
  if (!show) return null;
  return (
    <div className="fixed z-[320] bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 pl-2 pr-6 py-2 rounded-3xl bg-gray-900/95 border border-emerald-500/40 shadow-2xl shadow-emerald-500/20 text-white" style={{ animation: "bi-inflate .5s cubic-bezier(.34,1.56,.64,1) both" }}>
      <img key={show} src={`/video/infla-comemora.webp?${show}`} alt="" className="w-[84px] h-auto" />
      <div><div className="font-black text-base">{text}</div>{sub && <div className="text-xs text-gray-400 font-semibold">{sub}</div>}</div>
    </div>
  );
}
