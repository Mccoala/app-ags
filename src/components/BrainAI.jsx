import React, { useEffect, useRef, useState } from "react";
import { Brain, Send, Sparkles, RefreshCw, Trash2, X, Search, Wand2 } from "lucide-react";
import BrainGraph, { BRAIN_TYPES } from "./BrainGraph";
import { callClaude, norm } from "../lib/core";
import { TOOLS, runTool, brainContext, itemRows } from "../lib/aiTools";

const TOOL_LABEL = { buscar_itens: "Contando itens", producao_por_pessoa: "Produção por pessoa", resumo_pedidos: "Resumo de pedidos", detalhe_pedido: "Abrindo pedido", dados_mapa: "Dados do mapa", clientes: "Clientes", salvar_no_cerebro: "Guardando no cérebro" };

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

const SYSTEM = `Você é o CÉREBRO do Inflatudo, o sistema de gestão de uma fábrica de brinquedos infláveis. Você responde ao gerente sobre QUALQUER informação do app: pedidos, itens vendidos, vendedores, clientes, produção (corte, costura, preparação, montagem), finalização, equipe, faturamento, mapa/estados/cidades/distâncias.

REGRAS:
- Para qualquer número, USE AS FERRAMENTAS. Nunca estime nem conte de cabeça. Se precisar, chame várias ferramentas (ex.: um mês e depois o anterior para comparar).
- "Brinquedos" = itens que não são motor. Um pedido pode ter vários itens.
- Para "logo", "com logo", medidas como "10x5", cores etc., use buscar_itens com o campo texto.
- Para rendimento de pessoas da equipe use producao_por_pessoa comparando meses. Se houver muitos itens "sem_data", avise que só passaram a ser registrados recentemente.
- Quando descobrir algo realmente útil (tendência, alerta, recorde, comparação), guarde com salvar_no_cerebro (no máximo 2 por resposta), ligando aos nomes envolvidos. Você também pode criar informações novas derivadas (ex.: metas sugeridas, padrões).
- Responda em português do Brasil, direto, com os números em **negrito**, listas curtas. Termine com 1 linha de leitura prática ("o que isso significa").`;

export default function BrainAI({ data, persist, dark, canWrite = true }) {
  const [msgs, setMsgs] = useState(() => { try { return JSON.parse(sessionStorage.getItem("brain-chat") || "[]"); } catch { return []; } });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(null);
  const [selected, setSelected] = useState(null);
  const [flash, setFlash] = useState([]);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); try { sessionStorage.setItem("brain-chat", JSON.stringify(msgs.slice(-30))); } catch { } }, [msgs, busy]);

  const notes = data.brain?.notes || [];
  const totalItems = itemRows(data).length;

  const saveNote = (note) => {
    if (!canWrite) return;
    const cur = dataRef.current;
    const nd = { ...cur, brain: { ...(cur.brain || {}), notes: [...(cur.brain?.notes || []), note] } };
    dataRef.current = nd; persist(nd);
    setFlash(f => [...f, `n:${note.id}`]); setTimeout(() => setFlash(f => f.filter(x => x !== `n:${note.id}`)), 6000);
  };
  const forget = (id) => { const cur = dataRef.current; const nd = { ...cur, brain: { ...(cur.brain || {}), notes: (cur.brain?.notes || []).filter(n => n.id !== id) } }; dataRef.current = nd; persist(nd); setSelected(null); };

  const ask = async (question, { hidden = false } = {}) => {
    const q = (question ?? input).trim(); if (!q || busy) return;
    setInput("");
    const history = msgs.filter(m => !m.error).slice(-8).map(m => ({ role: m.role, content: m.content }));
    setMsgs(m => [...m, ...(hidden ? [] : [{ role: "user", content: q }])]);
    const apiMsgs = [...history, { role: "user", content: q }];
    const used = [];
    let model = "claude-sonnet-4-6";
    try {
      for (let step = 0; step < 10; step++) {
        setBusy(step ? `Pensando… (${used.length} consulta${used.length === 1 ? "" : "s"})` : "Pensando…");
        const system = `${SYSTEM}\n\nCONTEXTO RÁPIDO (JSON):\n${JSON.stringify(brainContext(dataRef.current))}`;
        let d;
        try { d = await callClaude({ model, system, messages: apiMsgs, tools: TOOLS, max_tokens: 1400 }); }
        catch (e) { if (model !== "claude-haiku-4-5" && /demorou|respondeu/.test(e.message)) { model = "claude-haiku-4-5"; d = await callClaude({ model, system, messages: apiMsgs, tools: TOOLS, max_tokens: 1200 }); } else throw e; }
        apiMsgs.push({ role: "assistant", content: d.content });
        const calls = (d.content || []).filter(c => c.type === "tool_use");
        if (d.stop_reason !== "tool_use" || !calls.length) {
          const text = (d.content || []).filter(c => c.type === "text").map(c => c.text).join("\n").trim();
          setMsgs(m => [...m, { role: "assistant", content: text || "Pronto.", tools: used }]);
          break;
        }
        const results = [];
        for (const c of calls) {
          setBusy(`${TOOL_LABEL[c.name] || c.name}…`);
          used.push({ name: c.name, input: c.input });
          let r; try { r = await runTool(c.name, c.input, dataRef.current, { onSaveNote: saveNote }); } catch (e) { r = { erro: e.message }; }
          let s = JSON.stringify(r); if (s.length > 60000) s = s.slice(0, 60000) + "…(cortado)";
          results.push({ type: "tool_result", tool_use_id: c.id, content: s });
        }
        apiMsgs.push({ role: "user", content: results });
      }
    } catch (e) {
      setMsgs(m => [...m, { role: "assistant", content: `⚠️ Não consegui responder agora: ${e.message}`, error: true }]);
    }
    setBusy(null);
  };

  const autoInsights = () => ask("Faça uma varredura completa dos dados usando as ferramentas (vendas por mês e vendedor, itens mais vendidos, produção por pessoa este mês x mês passado, clientes inativos, estados). Salve de 3 a 5 memórias novas e úteis no cérebro (insights, alertas, metas) que ainda não existam. Depois me dê um resumo curto do que guardou.");

  const suggestions = ["Quantos fut 10x5 foram vendidos? Quantos por vendedor?", "Quantos brinquedos com logo tivemos este mês?", "Quantos brinquedos cada costureira fez este mês x mês passado? Está rendendo?", "Qual estado mais compra e qual cliente está mais longe da fábrica?", "Quais clientes não compram há mais de 90 dias?"];

  return (
    <div className={`rounded-3xl border overflow-hidden ${dark ? "border-fuchsia-500/20" : "border-fuchsia-200"}`} style={{ background: dark ? "linear-gradient(135deg,#120d22 0%,#0b0f1a 60%)" : "linear-gradient(135deg,#faf5ff,#ffffff)" }}>
      {/* topo */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)", boxShadow: "0 10px 30px rgba(168,85,247,.45)" }}><Brain size={22} /></div>
          <div>
            <h2 className={`font-black text-xl leading-tight ${dark ? "text-white" : "text-gray-900"}`}>Cérebro Inflatudo</h2>
            <p className="text-xs text-slate-400 font-semibold">Pergunte qualquer coisa sobre pedidos, vendas, produção, equipe e mapa. Ele guarda o que aprende.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {[["memórias", notes.length, "#e879f9"], ["itens analisáveis", totalItems, "#a855f7"], ["vendedores", (data.sellers || []).length, "#f97316"], ["equipe", (data.team || []).length, "#38bdf8"]].map(([l, v, c]) => (
            <div key={l} className={`px-3 py-1.5 rounded-xl text-xs font-bold ${dark ? "bg-white/5 text-slate-300" : "bg-white text-slate-600 border border-slate-200"}`}><span className="font-black tabular-nums" style={{ color: c }}>{v}</span> {l}</div>
          ))}
          {canWrite && <button onClick={autoInsights} disabled={!!busy} className="px-3 py-2 rounded-xl text-xs font-black text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}><Wand2 size={14} />Gerar insights e guardar</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
        {/* grafo */}
        <div className="lg:col-span-3 relative px-3 pb-3">
          <BrainGraph data={data} dark={dark} height={500} onSelect={setSelected} flashIds={flash} />
          <div className="absolute top-3 left-6 flex flex-wrap gap-2 pointer-events-none">
            {Object.entries(BRAIN_TYPES).filter(([k]) => !["group"].includes(k)).map(([k, t]) => <span key={k} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/40 text-slate-200 flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: t.color }} />{t.label}</span>)}
          </div>
          {selected && (
            <div className={`absolute top-12 left-6 max-w-sm p-4 rounded-2xl border shadow-2xl animate-slide-up ${dark ? "bg-gray-950/95 border-fuchsia-500/30 text-slate-200" : "bg-white/95 border-fuchsia-200"}`}>
              <div className="flex items-start justify-between gap-2">
                <div><div className="text-[10px] font-black uppercase tracking-widest" style={{ color: BRAIN_TYPES[selected.type]?.color }}>{BRAIN_TYPES[selected.type]?.label}{selected.note?.tipo ? ` · ${selected.note.tipo}` : ""}</div><div className="font-black">{selected.label}</div></div>
                <button onClick={() => setSelected(null)} className="opacity-60 hover:opacity-100"><X size={15} /></button>
              </div>
              {selected.note ? (
                <>
                  <p className="text-sm mt-2 leading-relaxed">{selected.note.texto}</p>
                  <div className="text-[10px] text-slate-500 mt-2">{new Date(selected.note.criado).toLocaleString("pt-BR")}{selected.note.ligado_a?.length ? ` · ${selected.note.ligado_a.join(", ")}` : ""}</div>
                  {canWrite && <button onClick={() => forget(selected.note.id)} className="mt-2 text-xs font-bold text-red-400 flex items-center gap-1"><Trash2 size={12} />Esquecer esta memória</button>}
                </>
              ) : (
                <>
                  {selected.sub && <p className="text-xs text-slate-400 mt-1">{selected.sub}</p>}
                  {selected.type !== "hub" && selected.type !== "group" && <button onClick={() => { ask(`Me conte tudo sobre ${BRAIN_TYPES[selected.type].label.toLowerCase()} "${selected.label}": números, histórico e o que chama atenção.`); setSelected(null); }} className="mt-2 text-xs font-black text-fuchsia-400 flex items-center gap-1"><Search size={12} />Perguntar ao cérebro sobre isso</button>}
                </>
              )}
            </div>
          )}
        </div>

        {/* chat */}
        <div className={`lg:col-span-2 flex flex-col border-t lg:border-t-0 lg:border-l ${dark ? "border-white/5" : "border-fuchsia-100"}`} style={{ height: 520 }}>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-slate-400">Exemplos do que você pode perguntar:</p>
                {suggestions.map(s => <button key={s} onClick={() => ask(s)} className={`w-full text-left text-sm font-semibold px-3 py-2 rounded-xl border transition-all ${dark ? "border-white/10 text-fuchsia-300 hover:bg-white/5" : "border-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-50"}`}>{s}</button>)}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[92%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed animate-slide-up ${m.role === "user" ? "text-white rounded-br-md" : dark ? "bg-white/5 text-slate-200 rounded-bl-md border border-white/5" : "bg-fuchsia-50 text-slate-800 rounded-bl-md"} ${m.error ? "!text-red-400" : ""}`} style={m.role === "user" ? { background: "linear-gradient(135deg,#a855f7,#ec4899)" } : {}}>
                  {m.role === "user" ? m.content : <RichText text={m.content} />}
                  {m.tools?.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{m.tools.map((t, j) => <span key={j} title={JSON.stringify(t.input)} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.name === "salvar_no_cerebro" ? "bg-fuchsia-500/20 text-fuchsia-300" : "bg-black/20 text-slate-400"}`}>{t.name === "salvar_no_cerebro" ? `🧠 guardou: ${t.input?.titulo || ""}` : `🔎 ${TOOL_LABEL[t.name] || t.name}`}</span>)}</div>}
                </div>
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-sm text-fuchsia-300"><RefreshCw size={14} className="animate-spin" />{busy}</div>}
            <div ref={endRef} />
          </div>
          <form onSubmit={e => { e.preventDefault(); ask(); }} className={`p-3 border-t flex gap-2 ${dark ? "border-white/5" : "border-fuchsia-100"}`}>
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="Pergunte ao cérebro… ex.: quantos tobogãs a Maria costurou este mês?" className={`flex-1 min-w-0 px-3 py-2.5 rounded-xl text-sm border outline-none ${dark ? "bg-white/5 border-white/10 text-white placeholder-slate-500" : "bg-white border-fuchsia-100"} focus:border-fuchsia-500`} />
            {msgs.length > 0 && <button type="button" onClick={() => setMsgs([])} title="Limpar conversa (as memórias continuam)" className="px-2 text-slate-500 hover:text-red-400"><Trash2 size={15} /></button>}
            <button disabled={!!busy || !input.trim()} className="px-4 rounded-xl text-white font-black disabled:opacity-40" style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}><Send size={15} /></button>
          </form>
        </div>
      </div>
    </div>
  );
}
