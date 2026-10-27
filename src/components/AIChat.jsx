import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Send, RefreshCw, Trash2 } from "lucide-react";
import { askAI } from "../lib/core";

// Formatação simples das respostas (negrito, listas, títulos)
function RichText({ text }) {
  const lines = String(text || "").split("\n");
  const inline = (s, k) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith("**") && p.endsWith("**") ? <b key={`${k}-${i}`}>{p.slice(2, -2)}</b> : <React.Fragment key={`${k}-${i}`}>{p}</React.Fragment>);
  return (
    <div className="space-y-1">
      {lines.map((l, i) => {
        const t = l.trim();
        if (!t) return <div key={i} className="h-1" />;
        if (/^#{1,4}\s/.test(t)) return <div key={i} className="font-black mt-2">{inline(t.replace(/^#+\s/, ""), i)}</div>;
        if (/^[-*•]\s/.test(t)) return <div key={i} className="flex gap-2"><span className="opacity-60">•</span><span>{inline(t.replace(/^[-*•]\s/, ""), i)}</span></div>;
        if (/^\d+[.)]\s/.test(t)) return <div key={i} className="flex gap-2"><span className="font-black opacity-70">{t.match(/^\d+/)[0]}.</span><span>{inline(t.replace(/^\d+[.)]\s/, ""), i)}</span></div>;
        if (/^\|/.test(t)) return <div key={i} className="font-mono text-[11px] opacity-90 whitespace-pre overflow-x-auto">{t}</div>;
        return <p key={i}>{inline(t, i)}</p>;
      })}
    </div>
  );
}

export default function AIChat({ title = "Assistente IA", subtitle, system, buildContext, suggestions = [], dark, accent = "#6366f1", height = 420, storageKey }) {
  const [msgs, setMsgs] = useState(() => { try { return storageKey ? JSON.parse(sessionStorage.getItem(storageKey) || "[]") : []; } catch { return []; } });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { { const box = endRef.current?.parentElement; if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" }); } try { storageKey && sessionStorage.setItem(storageKey, JSON.stringify(msgs.slice(-30))); } catch { } }, [msgs, loading]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    const next = [...msgs, { role: "user", content: q }];
    setMsgs(next); setInput(""); setLoading(true);
    try {
      let ctx = JSON.stringify(buildContext());
      if (ctx.length > 180000) ctx = ctx.slice(0, 180000) + "…(dados cortados por tamanho)";
      const sys = `${system}\n\nResponda sempre em português do Brasil, direto ao ponto, com números concretos tirados dos dados. Use listas curtas e **negrito** nos números importantes. Se a pergunta pedir previsão, explique em uma linha a base do cálculo. Nunca invente dados que não estão abaixo.\n\nDADOS ATUAIS DA EMPRESA (JSON):\n${ctx}`;
      const answer = await askAI({ system: sys, messages: next.slice(-12).map(m => ({ role: m.role, content: m.content })), maxTokens: 1500 });
      setMsgs(m => [...m, { role: "assistant", content: answer || "Sem resposta." }]);
    } catch (e) {
      setMsgs(m => [...m, { role: "assistant", content: `⚠️ Não consegui responder agora: ${e.message}`, error: true }]);
    }
    setLoading(false);
  };

  const bg = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  return (
    <div className={`rounded-2xl border flex flex-col overflow-hidden ${bg}`} style={{ borderColor: `${accent}55` }}>
      <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ background: `linear-gradient(135deg, ${accent}22, transparent)` }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ background: accent, boxShadow: `0 6px 16px ${accent}66` }}><Sparkles size={16} /></div>
          <div className="min-w-0"><div className="font-black text-sm truncate">{title}</div>{subtitle && <div className="text-[11px] text-slate-500 truncate">{subtitle}</div>}</div>
        </div>
        {msgs.length > 0 && <button onClick={() => setMsgs([])} title="Limpar conversa" className="p-1.5 rounded-lg text-slate-500 hover:text-red-500"><Trash2 size={14} /></button>}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar" style={{ height }}>
        {msgs.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">Pergunte qualquer coisa sobre os seus dados. Exemplos:</p>
            <div className="flex flex-col gap-1.5">
              {suggestions.map(s => <button key={s} onClick={() => send(s)} className={`text-left text-sm font-semibold px-3 py-2 rounded-xl border transition-all ${dark ? "border-gray-800 hover:bg-gray-800" : "border-gray-200 hover:bg-gray-50"}`} style={{ color: accent }}>{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed animate-slide-up ${m.role === "user" ? "text-white rounded-br-md" : dark ? "bg-gray-800 text-gray-100 rounded-bl-md" : "bg-gray-100 text-gray-800 rounded-bl-md"} ${m.error ? "!bg-red-500/10 !text-red-400" : ""}`} style={m.role === "user" ? { background: accent } : {}}>
              {m.role === "user" ? m.content : <RichText text={m.content} />}
            </div>
          </div>
        ))}
        {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><RefreshCw size={14} className="animate-spin" style={{ color: accent }} />Analisando seus dados…</div>}
        <div ref={endRef} />
      </div>
      <form onSubmit={e => { e.preventDefault(); send(); }} className={`p-3 border-t flex gap-2 ${dark ? "border-gray-800" : "border-gray-100"}`}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Escreva sua pergunta…" className={`flex-1 min-w-0 px-3 py-2.5 rounded-xl text-sm border outline-none ${dark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-200"}`} />
        <button disabled={loading || !input.trim()} className="px-4 rounded-xl text-white font-black disabled:opacity-40 flex items-center gap-1" style={{ background: accent }}><Send size={15} /></button>
      </form>
    </div>
  );
}
