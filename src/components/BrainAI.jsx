import React, { useEffect, useRef, useState } from "react";
import ChatBox from "./ChatBox";
import { Brain, Send, Sparkles, RefreshCw, Trash2, X, Search, Wand2, Mic } from "lucide-react";
import VoiceBrain from "./VoiceBrain";
import BrainGraph, { BRAIN_TYPES } from "./BrainGraph";
import { itemRows } from "../lib/aiTools";
import { useBrainAgent, TOOL_LABEL } from "../lib/useBrainAgent";


function RichText({ text }) {
  const inline = (s, k) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith("**") && p.endsWith("**") ? <b key={`${k}-${i}`} className="text-white">{p.slice(2, -2)}</b> : <React.Fragment key={`${k}-${i}`}>{p}</React.Fragment>);
  return <div className="space-y-1">{String(text || "").split("\n").map((l, i) => {
    const t = l.trim(); if (!t) return <div key={i} className="h-1" />;
    if (/^#{1,4}\s/.test(t)) return <div key={i} className="font-black mt-2 text-white">{inline(t.replace(/^#+\s/, ""), i)}</div>;
    if (/^[-*•]\s/.test(t)) return <div key={i} className="flex gap-2"><span className="text-fuchsia-400">•</span><span>{inline(t.replace(/^[-*•]\s/, ""), i)}</span></div>;
    if (/^\d+[.)]\s/.test(t)) return <div key={i} className="flex gap-2"><span className="font-black text-fuchsia-400">{t.match(/^\d+/)[0]}.</span><span>{inline(t.replace(/^\d+[.)]\s/, ""), i)}</span></div>;
    if (/^\|/.test(t)) return <div key={i} className="font-mono text-[11px] whitespace-pre overflow-x-auto opacity-90">{t}</div>;
    return <p key={i}>{inline(t, i)}</p>;
  })}</div>;
}


export default function BrainAI({ data, persist, dark, canWrite = true, user }) {
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState(null);
  const [flash, setFlash] = useState([]);
  const [side, setSide] = useState("chat"); // "chat" | "memorias"
  const [confirmId, setConfirmId] = useState(null);
  // Altura ajustável (arrastando a barra), guardada neste aparelho — com limite máximo
  const [h, setH] = useState(() => { try { return Math.min(760, Number(localStorage.getItem("brain-h")) || 520); } catch { return 520; } });
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => { const f = () => setVw(window.innerWidth); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  useEffect(() => { try { localStorage.setItem("brain-h", String(Math.round(h))); } catch { } }, [h]);
  const maxH = Math.max(380, Math.min(760, (typeof window !== "undefined" ? window.innerHeight : 900) * 0.78));
  const clampH = (v) => Math.max(300, Math.min(maxH, v));
  const startResize = (e) => {
    e.preventDefault();
    const y0 = (e.touches ? e.touches[0].clientY : e.clientY), h0 = h;
    const mv = (ev) => { const y = ev.touches ? ev.touches[0].clientY : ev.clientY; setH(clampH(h0 + (y - y0))); };
    const upf = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("touchmove", mv); };
    window.addEventListener("pointermove", mv); window.addEventListener("touchmove", mv, { passive: false });
    window.addEventListener("pointerup", upf, { once: true }); window.addEventListener("touchend", upf, { once: true });
  };
  const wide = vw >= 1024;
  const graphH = wide ? h - 20 : Math.round(Math.max(260, Math.min(420, h * 0.55)));
  const chatH = wide ? h : Math.round(Math.max(380, h * 0.75));
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const endRef = useRef(null);

  const { msgs, setMsgs, ask: agentAsk, busy } = useBrainAgent({
    data, user, persist, allowSave: canWrite, storageKey: "brain-chat",
    onNoteSaved: (note) => { setFlash(f => [...f, `n:${note.id}`]); setTimeout(() => setFlash(f => f.filter(x => x !== `n:${note.id}`)), 6000); },
  });
  useEffect(() => { { const box = endRef.current?.parentElement; if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" }); } }, [msgs, busy]);
  const ask = (q, opts) => { const t = (q ?? input); setInput(""); return agentAsk(t, opts); };
  const [voiceOn, setVoiceOn] = useState(false);
  const canVoice = user?.role === "admin";

  const notes = data.brain?.notes || [];
  const totalItems = itemRows(data).length;

  const forget = (id) => { const cur = dataRef.current; const nd = { ...cur, brain: { ...(cur.brain || {}), notes: (cur.brain?.notes || []).filter(n => n.id !== id) } }; dataRef.current = nd; persist(nd); setSelected(null); setConfirmId(null); };
  const ConfirmForget = ({ note }) => confirmId === note.id ? (
    <div className="mt-2 flex items-center gap-2 flex-wrap"><span className="text-xs font-bold text-red-400">Apagar esta memória?</span>
      <button onClick={() => forget(note.id)} className="px-2.5 py-1 rounded-lg text-xs font-black bg-red-500 text-white">Confirmar</button>
      <button onClick={() => setConfirmId(null)} className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-400">Cancelar</button></div>
  ) : <button onClick={() => setConfirmId(note.id)} className="mt-2 text-xs font-bold text-red-400 flex items-center gap-1"><Trash2 size={12} />Apagar memória</button>;

  // Insights pontuais: aparecem na conversa, mas NÃO são guardados no cérebro
  const autoInsights = () => { setSide("chat"); ask("Faça uma análise rápida e completa usando as ferramentas: vendas do mês x mês passado por vendedor, itens mais vendidos, produção por pessoa, gargalos, pedidos atrasados, clientes que pararam de comprar e estados. Me entregue de 5 a 7 insights práticos e curtos, com números.", { noSave: true }); };

  const suggestions = ["Quantos fut 10x5 foram vendidos? Quantos por vendedor?", "Quantos brinquedos com logo tivemos este mês?", "Quantos brinquedos cada costureira fez este mês x mês passado? Está rendendo?", "Qual estado mais compra e qual cliente está mais longe da fábrica?", "Quais clientes não compram há mais de 90 dias?"];

  const memList = [...notes].reverse();
  return (
    <div className={`rounded-3xl border overflow-hidden ${dark ? "border-fuchsia-500/20" : "border-fuchsia-200"}`} style={{ background: dark ? "linear-gradient(135deg,#120d22 0%,#0b0f1a 60%)" : "linear-gradient(135deg,#faf5ff,#ffffff)" }}>
      {/* topo */}
      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-start sm:items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center text-white flex-shrink-0" style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)", boxShadow: "0 10px 30px rgba(168,85,247,.45)" }}><Brain size={21} /></div>
          <div className="min-w-0">
            <h2 className={`font-black text-lg sm:text-xl leading-tight ${dark ? "text-white" : "text-gray-900"}`}>Cérebro Inflatudo</h2>
            <p className="text-[11px] sm:text-xs text-slate-400 font-semibold">Pergunte qualquer coisa do app. Ele guarda o que aprende.</p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-1.5 w-full md:w-auto">
          <div className="flex items-center gap-1.5 chip-row md:flex-wrap">
          {[["memórias", notes.length, "#e879f9"], ["itens", totalItems, "#a855f7"], ["vendedores", (data.sellers || []).length, "#f97316"], ["equipe", (data.team || []).length, "#38bdf8"]].map(([l, v, c]) => (
            <div key={l} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${dark ? "bg-white/5 text-slate-300" : "bg-white text-slate-600 border border-slate-200"}`}><span className="font-black tabular-nums" style={{ color: c }}>{v}</span> {l}</div>
          ))}
          </div>
          {canWrite && <button onClick={autoInsights} disabled={!!busy} className="w-full md:w-auto justify-center px-3 py-2 md:py-1.5 rounded-xl text-sm md:text-xs font-black text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}><Wand2 size={14} />Gerar insights</button>}
          <div className={`hidden md:flex rounded-lg overflow-hidden text-[11px] font-black ${dark ? "bg-white/5 text-slate-300" : "bg-white border border-slate-200 text-slate-600"}`}>
            <button onClick={() => setH(clampH(h - 120))} title="Diminuir" className="px-2 py-1 hover:text-fuchsia-400">−</button>
            <button onClick={() => setH(clampH(h + 120))} title="Aumentar" className="px-2 py-1 hover:text-fuchsia-400">+</button>
            <button onClick={() => setH(h >= maxH - 10 ? 520 : maxH)} className="px-2 py-1 hover:text-fuchsia-400">{h >= maxH - 10 ? "Normal" : "Tela cheia"}</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5">
        {/* grafo */}
        <div className="lg:col-span-3 relative px-2 sm:px-3 pb-3">
          <BrainGraph data={data} dark={dark} height={graphH} onSelect={(n) => { setSelected(n); setConfirmId(null); }} flashIds={flash} />
          <div className="absolute top-2 left-4 right-4 flex gap-1.5 overflow-x-auto pointer-events-none hide-scrollbar">
            {Object.entries(BRAIN_TYPES).filter(([k]) => k !== "group").map(([k, t]) => <span key={k} className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/40 text-slate-200 flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: t.color }} />{t.label}</span>)}
          </div>
          {selected && (
            <div className={`absolute z-10 p-4 rounded-2xl border shadow-2xl animate-slide-up ${wide ? "top-10 left-6 max-w-sm" : "left-3 right-3 bottom-5"} ${dark ? "bg-gray-950/95 border-fuchsia-500/30 text-slate-200" : "bg-white/95 border-fuchsia-200"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-widest" style={{ color: BRAIN_TYPES[selected.type]?.color }}>{BRAIN_TYPES[selected.type]?.label}{selected.note?.tipo ? ` · ${selected.note.tipo}` : ""}</div><div className="font-black break-words">{selected.label}</div></div>
                <button onClick={() => setSelected(null)} className="opacity-60 hover:opacity-100 flex-shrink-0"><X size={16} /></button>
              </div>
              {selected.note ? (
                <>
                  <p className="text-sm mt-2 leading-relaxed">{selected.note.texto}</p>
                  <div className="text-[10px] text-slate-500 mt-2">{new Date(selected.note.criado).toLocaleString("pt-BR")}{selected.note.ligado_a?.length ? ` · ${selected.note.ligado_a.join(", ")}` : ""}</div>
                  {canWrite && <ConfirmForget note={selected.note} />}
                </>
              ) : (
                <>
                  {selected.sub && <p className="text-xs text-slate-400 mt-1">{selected.sub}</p>}
                  {selected.type !== "hub" && selected.type !== "group" && <button onClick={() => { ask(`Me conte tudo sobre ${BRAIN_TYPES[selected.type].label.toLowerCase()} "${selected.label}": números, histórico e o que chama atenção.`); setSelected(null); setSide("chat"); }} className="mt-2 text-xs font-black text-fuchsia-400 flex items-center gap-1"><Search size={12} />Perguntar ao cérebro sobre isso</button>}
                </>
              )}
            </div>
          )}
        </div>

        {/* conversa / memórias */}
        <div className={`lg:col-span-2 flex flex-col border-t lg:border-t-0 lg:border-l ${dark ? "border-white/5" : "border-fuchsia-100"}`} style={{ height: chatH }}>
          <div className={`flex gap-1 p-2 border-b ${dark ? "border-white/5" : "border-fuchsia-100"}`}>
            {[["chat", "Conversa"], ["memorias", `Memórias (${notes.length})`]].map(([k, l]) => <button key={k} onClick={() => setSide(k)} className={`flex-1 py-1.5 rounded-lg text-xs font-black ${side === k ? "text-white" : "text-slate-400"}`} style={side === k ? { background: "linear-gradient(135deg,#a855f7,#ec4899)" } : {}}>{l}</button>)}
          </div>
          {side === "memorias" ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {memList.length === 0 && <p className="text-sm text-slate-400 p-2">Nenhuma memória ainda. Elas são criadas conforme você conversa com o cérebro.</p>}
              {memList.map(n => (
                <div key={n.id} className={`p-3 rounded-xl border ${dark ? "bg-white/5 border-white/10 text-slate-200" : "bg-fuchsia-50/50 border-fuchsia-100"}`}>
                  <div className="flex items-center justify-between gap-2"><span className="font-black text-sm">{n.titulo}</span><span className="text-[10px] font-black uppercase text-fuchsia-400 flex-shrink-0">{n.tipo}</span></div>
                  <p className="text-xs mt-1 leading-relaxed opacity-90">{n.texto}</p>
                  <div className="text-[10px] text-slate-500 mt-1">{new Date(n.criado).toLocaleString("pt-BR")}</div>
                  {canWrite && <ConfirmForget note={n} />}
                </div>
              ))}
            </div>
          ) : (
          <>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-slate-400">Exemplos do que você pode perguntar:</p>
                {suggestions.map(sg => <button key={sg} onClick={() => ask(sg)} className={`w-full text-left text-sm font-semibold px-3 py-2 rounded-xl border transition-all ${dark ? "border-white/10 text-fuchsia-300 hover:bg-white/5" : "border-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-50"}`}>{sg}</button>)}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[92%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words animate-slide-up ${m.role === "user" ? "text-white rounded-br-md" : dark ? "bg-white/5 text-slate-200 rounded-bl-md border border-white/5" : "bg-fuchsia-50 text-slate-800 rounded-bl-md"} ${m.error ? "!text-red-400" : ""}`} style={m.role === "user" ? { background: "linear-gradient(135deg,#a855f7,#ec4899)" } : {}}>
                  {m.role === "user" ? m.content : <RichText text={m.content} />}
                  {m.tools?.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{m.tools.map((t, j) => <span key={j} title={JSON.stringify(t.input)} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.name === "salvar_no_cerebro" ? "bg-fuchsia-500/20 text-fuchsia-300" : "bg-black/20 text-slate-400"}`}>{t.name === "salvar_no_cerebro" ? `🧠 guardou: ${t.input?.titulo || ""}` : `🔎 ${TOOL_LABEL[t.name] || t.name}`}</span>)}</div>}
                </div>
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-sm text-fuchsia-300"><RefreshCw size={14} className="animate-spin" />{busy}</div>}
            <div ref={endRef} />
          </div>
          <form onSubmit={e => { e.preventDefault(); ask(); }} className={`p-2.5 sm:p-3 border-t flex items-end gap-2 ${dark ? "border-white/5" : "border-fuchsia-100"}`}>
            <ChatBox value={input} onChange={setInput} onSend={() => ask()} placeholder="Pergunte ao cérebro…" className={`px-3 py-2.5 rounded-xl text-sm border outline-none ${dark ? "bg-white/5 border-white/10 text-white placeholder-slate-500" : "bg-white border-fuchsia-100"} focus:border-fuchsia-500`} />
            {canVoice && <button type="button" onClick={() => setVoiceOn(true)} title="Conversar por voz" className="px-3 h-[42px] rounded-xl text-white font-black flex items-center gap-1.5 flex-shrink-0" style={{ background: "linear-gradient(135deg,#7c3aed,#db2777)" }}><Mic size={16} /><span className="hidden sm:inline text-xs">Voz</span></button>}
            {msgs.length > 0 && <button type="button" onClick={() => setMsgs([])} title="Limpar conversa (as memórias continuam)" className="px-2 h-[42px] text-slate-500 hover:text-red-400"><Trash2 size={15} /></button>}
            <button disabled={!!busy || !input.trim()} className="px-4 h-[42px] rounded-xl text-white font-black disabled:opacity-40" style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}><Send size={15} /></button>
          </form>
          </>
          )}
        </div>
      </div>

      {voiceOn && <VoiceBrain ask={agentAsk} busy={busy} userName={user?.name?.split(" ")[0]} onClose={() => setVoiceOn(false)} />}
      {/* barra para ajustar a altura */}
      <div onPointerDown={startResize} onTouchStart={startResize} className={`h-5 flex items-center justify-center cursor-ns-resize select-none group ${dark ? "bg-white/[0.03] hover:bg-fuchsia-500/10" : "bg-fuchsia-50 hover:bg-fuchsia-100"}`} style={{ touchAction: "none" }} title="Arraste para aumentar ou diminuir o cérebro">
        <div className="w-16 h-1.5 rounded-full bg-fuchsia-400/40 group-hover:bg-fuchsia-400" />
      </div>
    </div>
  );
}
