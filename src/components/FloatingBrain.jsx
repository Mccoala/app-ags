import React, { useEffect, useRef, useState } from "react";
import ChatBox from "./ChatBox";
import { Brain, Send, X, RefreshCw, Trash2, Bell, Camera, ChevronRight, Mic, Volume2, VolumeX, Square } from "lucide-react";
import SpaceOrb from "./SpaceOrb";
import { speakText, stopSpeaking, unlockAudio, getLevel, getVoicePref, useVoiceAvailable } from "../lib/voice";
import VoiceBrain from "./VoiceBrain";
import { useBrainAgent, TOOL_LABEL } from "../lib/useBrainAgent";
import { sameSeller, orderNumber } from "../lib/core";

const readSet = (k) => { try { return new Set(JSON.parse(localStorage.getItem(k) || "[]")); } catch { return new Set(); } };
const writeSet = (k, set) => { try { localStorage.setItem(k, JSON.stringify([...set].slice(-500))); } catch { } };
const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  const d = new Date(iso), hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (m < 1) return `agora · ${hm}`; if (m < 60) return `há ${m} min · ${hm}`; const h = Math.round(m / 60); if (h < 24) return `hoje ${hm}`;
  return `${d.toLocaleDateString("pt-BR")} ${hm}`;
};
function chime() {
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return; const ctx = new C();
    [880, 1320].forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; o.type = "sine"; o.connect(g); g.connect(ctx.destination); const t = ctx.currentTime + i * 0.16; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.start(t); o.stop(t + 0.4); });
    setTimeout(() => ctx.close(), 1200);
  } catch { }
}

function RichText({ text }) {
  const inline = (s, k) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith("**") && p.endsWith("**") ? <b key={`${k}-${i}`}>{p.slice(2, -2)}</b> : <React.Fragment key={`${k}-${i}`}>{p}</React.Fragment>);
  return <div className="space-y-1">{String(text || "").split("\n").map((l, i) => {
    const t = l.trim(); if (!t) return <div key={i} className="h-1" />;
    if (/^#{1,4}\s/.test(t)) return <div key={i} className="font-black mt-1">{inline(t.replace(/^#+\s/, ""), i)}</div>;
    if (/^[-*•]\s/.test(t)) return <div key={i} className="flex gap-2"><span className="text-fuchsia-400">•</span><span>{inline(t.replace(/^[-*•]\s/, ""), i)}</span></div>;
    if (/^\d+[.)]\s/.test(t)) return <div key={i} className="flex gap-2"><span className="font-black text-fuchsia-400">{t.match(/^\d+/)[0]}.</span><span>{inline(t.replace(/^\d+[.)]\s/, ""), i)}</span></div>;
    return <p key={i}>{inline(t, i)}</p>;
  })}</div>;
}

// Botão flutuante do Cérebro: aparece em todas as telas, para qualquer pessoa logada.
// Cada um só enxerga o que pode: produção sem valores; vendedor só os valores dele.
export default function FloatingBrain({ data, user, persist, dark, companyId, openPhotos }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("chat");
  // ── Avisos para o vendedor: brinquedo finalizado (com foto) ──
  const keyBase = `notif-${companyId || "x"}-${user?.id || "x"}`;
  const [read, setRead] = useState(() => readSet(`${keyBase}-read`));
  const [toasted, setToasted] = useState(() => readSet(`${keyBase}-toast`));
  const [toast, setToast] = useState(null);
  const sellers = data.sellers || [];
  const mine = user?.sellerName ? (data.notifications || []).filter(n => sameSeller(sellers, n.para, user.sellerName)).sort((a, b) => (b.em || "").localeCompare(a.em || "")) : [];
  const unread = mine.filter(n => !read.has(n.id));
  const photoOf = (n) => (data.photos || []).find(p => p.id === n.fotoId) || (data.photos || []).find(p => String(p.pedido) === String(n.pedido));
  const markRead = (ids) => { const s = new Set(read); ids.forEach(i => s.add(i)); setRead(s); writeSet(`${keyBase}-read`, s); };
  // ── Cérebro avisa o vendedor dos pedidos dele perto do prazo (1ª vez que entra no dia) ──
  const [due, setDue] = useState(null);
  useEffect(() => {
    if (!user?.sellerName || user?.role === "admin") return;
    const today = new Date(); const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const k = `due-${companyId || "x"}-${user.id}`;
    try { if (localStorage.getItem(k) === ymd) return; } catch { }
    const t0 = new Date(ymd + "T00:00:00").getTime();
    const list = (data.orders || [])
      .filter(o => sameSeller(sellers, o.seller, user.sellerName) && o.status !== "concluido" && o.deadline)
      .map(o => ({ o, d: Math.round((new Date(String(o.deadline).slice(0, 10) + "T00:00:00").getTime() - t0) / 86400000) }))
      .filter(x => x.d <= 3).sort((a, b) => a.d - b.d);
    if (!(data.orders || []).length) return; // dados ainda não chegaram
    try { localStorage.setItem(k, ymd); } catch { }
    if (list.length) { setDue(list); chime(); }
  }, [user?.id, (data.orders || []).length]); // eslint-disable-line
  const whenTxt = (d) => d < -1 ? `venceu há ${-d} dias` : d === -1 ? "venceu ontem" : d === 0 ? "vence hoje" : d === 1 ? "vence amanhã" : `vence em ${d} dias`;

  const openNotif = (n) => { markRead([n.id]); setToast(null); setOpen(false); openPhotos && openPhotos(n.pedido); };
  useEffect(() => {
    const fresh = unread.find(n => !toasted.has(n.id));
    if (!fresh) return;
    const s = new Set(toasted); unread.forEach(n => s.add(n.id)); setToasted(s); writeSet(`${keyBase}-toast`, s);
    setToast(fresh); chime();
    try {
      if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
        const ph = photoOf(fresh);
        new Notification(`Pedido ${fresh.pedido} finalizado! 🎉`, { body: `${fresh.toy || "Brinquedo"} · ${fresh.cliente || ""}${fresh.fotos > 1 ? ` · ${fresh.fotos} fotos` : ""}`, icon: ph && !ph.inline ? ph.url : "/favicon.svg", tag: fresh.id });
      }
    } catch { }
  }, [unread.map(n => n.id).join(",")]); // eslint-disable-line
  const openPanel = () => {
    setOpen(true); if (unread.length) setView("avisos");
    try { if (user?.sellerName && "Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch { }
  };
  const [input, setInput] = useState("");
  const endRef = useRef(null);
  const isAdmin = user?.role === "admin";
  const { msgs, setMsgs, ask, busy, scope } = useBrainAgent({ data, user, persist, allowSave: isAdmin, storageKey: `float-chat-${user?.id || "x"}` });
  useEffect(() => { { const box = endRef.current?.parentElement; if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" }); } }, [msgs, busy, open]);
  const [voiceOn, setVoiceOn] = useState(false);
  const voiceOk = useVoiceAvailable(); // botões de voz só com a voz natural ligada
  // respostas também em áudio (cada pessoa escolhe; fica lembrado neste aparelho)
  const [audioOn, setAudioOn] = useState(() => { try { return localStorage.getItem("inflatudo_audio_replies") === "1"; } catch { return false; } });
  const [speakingIdx, setSpeakingIdx] = useState(null);
  useEffect(() => { try { localStorage.setItem("inflatudo_audio_replies", audioOn ? "1" : "0"); } catch { } if (!audioOn) { stopSpeaking(); setSpeakingIdx(null); } }, [audioOn]);
  const say = async (i, text) => { unlockAudio(); setSpeakingIdx(i); await speakText(text, getVoicePref()); setSpeakingIdx(cur => (cur === i ? null : cur)); };
  const stopSay = () => { stopSpeaking(); setSpeakingIdx(null); };
  const spokenCount = useRef(msgs.length);
  useEffect(() => { // resposta nova chegou: lê em voz alta se o áudio estiver ligado
    if (msgs.length <= spokenCount.current) { spokenCount.current = msgs.length; return; }
    spokenCount.current = msgs.length;
    const i = msgs.length - 1, m = msgs[i];
    if (voiceOk && audioOn && open && !voiceOn && m?.role === "assistant" && !m.error && !m.voice) say(i, m.content);
  }, [msgs.length]); // eslint-disable-line
  useEffect(() => { if (!open) stopSay(); }, [open]); // eslint-disable-line
  const send = (q) => { const t = (q ?? input).trim(); if (!t) return; if (audioOn) unlockAudio(); setInput(""); ask(t); };
  const suggestions = scope === "none"
    ? ["Qual pedido está mais atrasado?", "Quais brinquedos estão esperando costura?", "O que foi finalizado hoje?", "Quantos itens eu fiz este mês?"]
    : scope === "own"
      ? ["Qual meu pedido mais atrasado?", "Quantos brinquedos meus estão na produção?", "Quanto vendi este mês?", "Quais clientes meus não compram há 90 dias?"]
      : ["Qual meu pedido mais atrasado?", "Qual foi o último pedido que editei?", "Qual vendedor tem mais brinquedos na produção este mês?", "O que a equipe fez hoje?"];

  return (
    <>
      {voiceOn && <VoiceBrain ask={ask} busy={busy} userName={user?.name?.split(" ")[0]} onClose={() => setVoiceOn(false)} />}
      <style>{`@keyframes fbPulse{0%{transform:scale(1);opacity:.55}100%{transform:scale(1.8);opacity:0}}`}</style>
      {!open && (
        <button onClick={openPanel} title="Pergunte ao Cérebro" className="fab-pos fixed bottom-5 right-5 z-[150] w-14 h-14 rounded-full text-white flex items-center justify-center shadow-2xl hover:scale-105 transition-transform" style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)", boxShadow: "0 12px 30px rgba(168,85,247,.5)" }}>
          <span className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)", animation: "fbPulse 2.4s ease-out infinite" }} />
          <Brain size={26} className="relative" />
          {unread.length > 0 && <span data-testid="notif-badge" className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-red-500 text-white text-xs font-black flex items-center justify-center border-2" style={{ borderColor: dark ? "#030712" : "#fff" }}>{unread.length}</span>}
        </button>
      )}
      {!open && due && !toast && (
        <div className={`fab-toast fixed bottom-24 right-5 z-[151] w-[330px] max-w-[calc(100vw-40px)] rounded-2xl border shadow-2xl overflow-hidden animate-slide-up ${dark ? "bg-[#0d0b17] border-fuchsia-500/40 text-white" : "bg-white border-fuchsia-200 text-gray-900"}`}>
          <div className="px-4 py-3 flex items-start gap-3" style={{ background: "linear-gradient(135deg,#a855f733,#ec489922)" }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}><Brain size={18} /></div>
            <div className="min-w-0 flex-1">
              <div className="font-black text-sm">Bom dia, {user?.name?.split(" ")[0] || ""}! ⏰</div>
              <div className="text-xs text-slate-400">{due.length === 1 ? "1 pedido seu está perto do prazo" : `${due.length} pedidos seus estão perto do prazo`}</div>
            </div>
            <button onClick={() => setDue(null)} className="p-0.5 text-slate-400 hover:text-red-400"><X size={15} /></button>
          </div>
          <div className="p-3 space-y-1.5 max-h-56 overflow-y-auto">
            {due.slice(0, 6).map(({ o, d }) => (
              <div key={o.id} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm ${dark ? "bg-white/5" : "bg-gray-50"}`}>
                <span className="min-w-0 truncate"><b className="text-orange-500">#{orderNumber(o.id)}</b> · {o.clientName || "—"}</span>
                <span className={`flex-shrink-0 text-[11px] font-black px-2 py-0.5 rounded-lg ${d < 0 ? "bg-red-500/20 text-red-400" : d <= 1 ? "bg-amber-500/20 text-amber-500" : "bg-sky-500/15 text-sky-400"}`}>{whenTxt(d)}</span>
              </div>
            ))}
            {due.length > 6 && <div className="text-[11px] text-slate-400 text-center">e mais {due.length - 6}…</div>}
          </div>
          <button onClick={() => setDue(null)} className="w-full py-2.5 text-sm font-black text-white" style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}>Entendi</button>
        </div>
      )}
      {!open && toast && (() => {
        const ph = photoOf(toast);
        return (
          <div data-testid="notif-toast" className={`fab-toast fixed bottom-24 right-5 z-[151] w-[300px] max-w-[calc(100vw-40px)] rounded-2xl border shadow-2xl overflow-hidden animate-slide-up ${dark ? "bg-[#0d0b17] border-emerald-500/40 text-white" : "bg-white border-emerald-200 text-gray-900"}`}>
            {ph && <div className="relative h-28 sm:h-36 bg-gray-800"><img src={ph.url} alt="" className="w-full h-full object-cover" />{toast.fotos > 1 && <span className="absolute top-2 right-2 text-[11px] font-black px-2 py-1 rounded-lg bg-black/60 text-white flex items-center gap-1"><Camera size={12} />{toast.fotos}</span>}</div>}
            <div className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="font-black text-sm">🎉 Pedido <span className="text-orange-500">{toast.pedido}</span> finalizado!</div>
                <button onClick={() => setToast(null)} className="p-0.5 text-slate-400 hover:text-red-400"><X size={15} /></button>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{toast.toy}{toast.cliente ? ` · ${toast.cliente}` : ""}{toast.por ? ` · por ${toast.por}` : ""} · 🕒 {ago(toast.em)}</div>
              <button onClick={() => openNotif(toast)} className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-sm font-black" style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}><Camera size={15} />Ver fotos</button>
            </div>
          </div>
        );
      })()}
      {open && (
        <div className={`fixed z-[150] inset-0 sm:inset-auto sm:bottom-5 sm:right-5 sm:w-[400px] sm:h-[600px] sm:max-h-[calc(100vh-40px)] flex flex-col sm:rounded-3xl border shadow-2xl overflow-hidden animate-slide-up ${dark ? "bg-[#0d0b17] border-fuchsia-500/30 text-slate-200" : "bg-white border-fuchsia-200 text-gray-900"}`}>
          <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ background: "linear-gradient(135deg,#a855f733,#ec489922)" }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}><Brain size={18} /></div>
              <div className="min-w-0"><div className="font-black text-sm">Cérebro Inflatudo</div><div className="text-[11px] text-slate-400 truncate">{scope === "none" ? "Produção, prazos e equipe" : scope === "own" ? "Seus pedidos, clientes e a produção" : "Pergunte qualquer coisa do app"}</div></div>
            </div>
            <div className="flex items-center gap-1">
              {voiceOk && <button onClick={() => { unlockAudio(); setAudioOn(a => !a); }} title={audioOn ? "Respostas em áudio: ligado" : "Ouvir as respostas em áudio"} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-black ${audioOn ? "text-white" : "text-slate-400 hover:text-fuchsia-300"}`} style={audioOn ? { background: "linear-gradient(135deg,#a855f7,#ec4899)" } : {}}>{audioOn ? <Volume2 size={14} /> : <VolumeX size={14} />}<span className="hidden sm:inline">Áudio</span></button>}
              {msgs.length > 0 && <button onClick={() => setMsgs([])} title="Limpar conversa" className="p-1.5 text-slate-400 hover:text-red-400"><Trash2 size={15} /></button>}
              <button onClick={() => setOpen(false)} className="p-1.5 text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
          </div>
          {mine.length > 0 && (
            <div className={`flex gap-1 p-1.5 mx-3 mt-2 rounded-xl ${dark ? "bg-white/5" : "bg-fuchsia-50"}`}>
              {[["chat", "Conversa"], ["avisos", `Avisos${unread.length ? ` (${unread.length})` : ""}`]].map(([k, l]) => (
                <button key={k} onClick={() => setView(k)} className={`flex-1 py-1.5 rounded-lg text-xs font-black flex items-center justify-center gap-1 ${view === k ? "text-white" : "text-slate-400"}`} style={view === k ? { background: "linear-gradient(135deg,#a855f7,#ec4899)" } : {}}>{k === "avisos" && <Bell size={12} />}{l}</button>
              ))}
            </div>
          )}
          {view === "avisos" && mine.length > 0 ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {unread.length > 0 && <button onClick={() => markRead(unread.map(n => n.id))} className="text-xs font-bold text-fuchsia-400 hover:underline">Marcar todos como lidos</button>}
              {mine.map(n => {
                const ph = photoOf(n); const isNew = !read.has(n.id);
                return (
                  <button key={n.id} onClick={() => openNotif(n)} className={`w-full text-left flex gap-3 p-2.5 rounded-2xl border transition ${isNew ? (dark ? "border-emerald-500/40 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50") : (dark ? "border-white/5 hover:bg-white/5" : "border-gray-100 hover:bg-gray-50")}`}>
                    <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-gray-800 flex items-center justify-center">{ph ? <img src={ph.url} alt="" className="w-full h-full object-cover" /> : <Camera size={20} className="text-slate-500" />}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black flex items-center gap-1.5">{isNew && <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />}Pedido <span className="text-orange-500">{n.pedido}</span> finalizado</div>
                      <div className="text-xs text-slate-400 truncate">{n.toy}{n.cliente ? ` · ${n.cliente}` : ""}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{ago(n.em)}{n.por ? ` · ${n.por}` : ""} · {n.fotos || 1} foto{(n.fotos || 1) > 1 ? "s" : ""}</div>
                    </div>
                    <ChevronRight size={16} className="text-slate-500 self-center" />
                  </button>
                );
              })}
            </div>
          ) : (<>
          {speakingIdx !== null && (
            <div className="relative h-36 flex-shrink-0 overflow-hidden" style={{ background: "radial-gradient(ellipse at 50% 50%, #1b0b33 0%, #08051a 70%, #020108 100%)" }}>
              <SpaceOrb phase="speaking" getLevel={getLevel} size={1.1} />
              <button onClick={stopSay} className="absolute bottom-2 right-2 flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white text-[11px] font-black"><Square size={10} />Parar</button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-slate-400">Oi, {user?.name?.split(" ")[0] || ""}! Pergunte o que quiser. Exemplos:</p>
                {suggestions.map(s => <button key={s} onClick={() => send(s)} className={`w-full text-left text-sm font-semibold px-3 py-2 rounded-xl border transition-all ${dark ? "border-white/10 text-fuchsia-300 hover:bg-white/5" : "border-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-50"}`}>{s}</button>)}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${m.role === "user" ? "text-white rounded-br-md" : dark ? "bg-white/5 rounded-bl-md border border-white/5" : "bg-fuchsia-50 rounded-bl-md"} ${m.error ? "!text-red-400" : ""}`} style={m.role === "user" ? { background: "linear-gradient(135deg,#a855f7,#ec4899)" } : {}}>
                  {m.role === "user" ? m.content : <RichText text={m.content} />}
                  {m.tools?.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{m.tools.map((t, j) => <span key={j} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/20 text-slate-400">🔎 {TOOL_LABEL[t.name] || t.name}</span>)}</div>}
                  {voiceOk && m.role === "assistant" && !m.error && (speakingIdx === i
                    ? <button onClick={stopSay} className="mt-2 flex items-center gap-1 text-[11px] font-black text-fuchsia-300"><Square size={11} />Parar áudio</button>
                    : <button onClick={() => say(i, m.content)} className="mt-2 flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-fuchsia-300"><Volume2 size={12} />Ouvir</button>)}
                </div>
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-sm text-fuchsia-300"><RefreshCw size={14} className="animate-spin" />{busy}</div>}
            <div ref={endRef} />
          </div>
          <form onSubmit={e => { e.preventDefault(); send(); }} className={`p-3 border-t flex items-end gap-2 ${dark ? "border-white/5" : "border-fuchsia-100"}`}>
            {voiceOk && <button type="button" onClick={() => { stopSay(); setVoiceOn(true); }} title="Conversar por voz" className="px-3 h-[42px] rounded-xl text-white flex-shrink-0" style={{ background: "linear-gradient(135deg,#7c3aed,#db2777)" }}><Mic size={16} /></button>}
            <ChatBox autoFocus value={input} onChange={setInput} onSend={() => send()} placeholder="Pergunte ao cérebro…" className={`px-3 py-2.5 rounded-xl text-sm border outline-none ${dark ? "bg-white/5 border-white/10 text-white placeholder-slate-500" : "bg-white border-fuchsia-100"} focus:border-fuchsia-500`} />
            <button disabled={!!busy || !input.trim()} className="px-4 h-[42px] rounded-xl text-white disabled:opacity-40" style={{ background: "linear-gradient(135deg,#a855f7,#ec4899)" }}><Send size={15} /></button>
          </form>
          </>)}
        </div>
      )}
    </>
  );
}
