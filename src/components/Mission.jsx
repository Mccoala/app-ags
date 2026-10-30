import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Minimize2, Maximize2, Sparkles, Camera, Users, Factory, ClipboardList, Brain, Map as MapIcon, Images, Gift, Lock } from "lucide-react";
import { useBrainAgent } from "../lib/useBrainAgent";
import { orderNumber } from "../lib/core";
import InflaStatus from "./InflaStatus";
import { BrandMark, BrandWord } from "./Brand";

// ── Tutorial na prática ───────────────────────────────────────────────────────
// A pessoa faz de verdade: lança um pedido com foto, cadastra a equipe, toca a
// produção, finaliza com foto, vê a pasta de fotos, pergunta ao Cérebro e vê o
// mapa. Cada passo só libera quando a tarefa foi feita (não dá para pular).

export const SECTORS = ["Corte", "Costura", "Preparação", "Montagem", "Finalizador"];
export const QUESTIONS = ["Qual brinquedo foi finalizado hoje?", "Qual brinquedo foi montado essa semana?", "Qual vendedor se destacou esse mês?"];
const KEY = (cid) => `inflatudo_mission_${cid || "x"}`;
export const missionState = (cid) => { try { return JSON.parse(localStorage.getItem(KEY(cid)) || "null"); } catch { return null; } };
export const startMission = (cid, data) => { try { localStorage.setItem(KEY(cid), JSON.stringify({ i: 0, base: (data.orders || []).map(o => o.id), at: Date.now() })); } catch { } };
export const clearMission = (cid) => { try { localStorage.removeItem(KEY(cid)); } catch { } };

const pctOf = (p) => ["cutter", "tailor", "prep", "assembler"].filter(k => p && p[k]).length * 25;
const finDone = (f) => f && (f.stage === "finalizado" || f.done);
const clean = (t) => String(t || "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/^#+\s*/gm, "").trim();

const STEPS = [
  { id: "order", tab: "orders", icon: ClipboardList, title: "Lance seu primeiro pedido", target: ['[data-tour="order-form"]', '[data-tour="order-actions"]'] },
  { id: "team", tab: "team", icon: Users, title: "Cadastre sua equipe", target: ['[data-tour="team-area"]'] },
  { id: "production", tab: "production", icon: Factory, title: "Toque a produção", target: '[data-tour="prod-first"]' },
  { id: "finalization", tab: "finalization", icon: Camera, title: "Finalize com foto", target: ['[data-tour="fin-open"]', '[data-tour="fin-row"]'] },
  { id: "photos", tab: "photos", icon: Images, title: "A pasta do pedido", target: null },
  { id: "brain", tab: "dashboard", icon: Brain, title: "Pergunte ao Cérebro", target: '[data-tour="brain"]' },
  { id: "map", tab: "routes", icon: MapIcon, title: "Onde você vendeu", target: null },
];

export default function Mission({ data, dark, tab, setTab, user, persist, openPhotos, tabs, onFinish }) {
  const cid = user?.company_id;
  const [st, setSt] = useState(() => missionState(cid) || { i: 0, base: (data.orders || []).map(o => o.id) });
  const [mini, setMini] = useState(false);
  const cardRef = useRef(null);
  const [rect, setRect] = useState(null);
  const [answer, setAnswer] = useState(null); // { q, a }
  const [finale, setFinale] = useState(false);
  const save = (n) => { setSt(n); try { localStorage.setItem(KEY(cid), JSON.stringify(n)); } catch { } };
  const steps = STEPS.filter(s => !s.tab || tabs.includes(s.tab));
  const step = steps[Math.min(st.i, steps.length - 1)];
  const { ask, busy } = useBrainAgent({ data, user, persist, storageKey: `tour-chat-${cid}` });

  // ── o pedido do tutorial: o mais novo lançado depois que o tutorial começou ──
  const order = useMemo(() => {
    const novos = (data.orders || []).filter(o => !(st.base || []).includes(o.id));
    return novos[novos.length - 1] || null;
  }, [data.orders, st.base]);
  const hasPhoto = !!order?.items?.some(it => (it.images || []).length);
  const prodRows = order ? (data.production || []).filter(p => p.orderId === order.id) : [];
  const prodBest = prodRows.reduce((m, p) => Math.max(m, pctOf(p)), 0);
  const finRows = order ? (data.finalization || []).filter(f => f.orderId === order.id) : [];
  const finWithPhoto = finRows.find(f => finDone(f) && (data.photos || []).some(p => p.itemId === f.itemId));
  const finAny = finRows.find(f => finDone(f));
  const team = (data.team || []).filter(t => t.status === "ativo");
  const sectorOk = SECTORS.map(s => [s, team.some(t => t.role === s)]);
  const notif = order && (data.notifications || []).find(n => n.tipo === "finalizado" && n.orderId === order.id);
  const client = order && (data.clients || []).find(c => (c.name || "").toLowerCase() === (order.clientName || "").toLowerCase());
  const where = [order?.city || client?.city, order?.state || client?.state].filter(Boolean).join(" - ");

  const done = {
    order: !!order && hasPhoto,
    team: sectorOk.every(([, ok]) => ok),
    production: prodBest === 100,
    finalization: !!finWithPhoto,
    photos: !!st.seenPhotos,
    brain: !!answer?.a,
    map: !!st.seenMap,
  }[step?.id];

  // passo da equipe: a tela de Equipe abre o cadastro sozinha, setor por setor
  useEffect(() => {
    const on = step?.id === "team" && !done && !finale;
    if (!!window.__INFLA_TEAM_TOUR !== on) { window.__INFLA_TEAM_TOUR = on; window.dispatchEvent(new Event("infla-tour")); }
  }, [step?.id, done, finale]);
  // passo do pedido: só deixa salvar o pedido novo com pelo menos 1 foto
  useEffect(() => { window.__INFLA_ORDER_TOUR = step?.id === "order" && !finale; return () => { window.__INFLA_ORDER_TOUR = false; }; }, [step?.id, finale]);
  useEffect(() => () => { window.__INFLA_TEAM_TOUR = false; window.dispatchEvent(new Event("infla-tour")); }, []);
  // leva para a aba do passo (e não deixa sair dela enquanto não terminar)
  useEffect(() => { if (!finale && step?.tab && tab !== step.tab) setTab(step.tab); }, [step?.id, tab, finale]); // eslint-disable-line
  useEffect(() => { if (step?.id === "photos" && order) openPhotos?.(orderNumber(order.id)); }, [step?.id]); // eslint-disable-line

  // destaque no elemento do passo (sem bloquear a tela)
  const [nav, setNav] = useState(null);
  useEffect(() => {
    if (mini) { setRect(null); setNav(null); return; }
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width && r.height ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; };
    const m = () => {
      setNav(step?.tab ? box(document.querySelector(`[data-tour="nav-${step.tab}"]`)) : null);
      setRect(!step?.target || done ? null : box([].concat(step.target).map(q => document.querySelector(q)).find(Boolean)));
    };
    m(); const t = setInterval(m, 400); return () => clearInterval(t);
  }, [step?.id, done, mini]);

  // "toque aqui": mãozinha com ondas no próximo clique dentro do passo
  const [tap, setTap] = useState(null);
  useEffect(() => {
    if (mini || done || !["order", "production", "finalization"].includes(step?.id)) { setTap(null); return; }
    const q = (sel) => document.querySelector(sel);
    const box = (el, label) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left, y: r.top, w: r.width, h: r.height, label } : null; };
    const m = () => {
      if (step.id === "order") {
        const form = q('[data-tour="order-form"]');
        if (!form) return setTap(null);
        const has = form.querySelector('img');
        return setTap(has ? null : box(form.querySelector('[data-tour="add-photo"]'), "Coloque uma foto aqui"));
      }
      if (step.id === "production") {
        const card = q('[data-tour="prod-first"]');
        if (!q('[data-tour="prod-first"] [data-card-open]')) return setTap(box(card, "Toque no pedido para abrir"));
        if (q('[data-tour="prod-first"] [data-tour="obs-open"]') && !st.obsSeen) save({ ...st, obsSeen: true });
        const obs = q('[data-tour="prod-first"] [data-tour="obs-btn"]');
        if (obs && !st.obsSeen && !q('[data-tour="prod-first"] [data-tour="obs-open"]')) return setTap(box(obs, "Veja a foto que veio com o pedido"));
        return setTap(box(q('[data-tour="prod-first"] [data-tour="stage-empty"]'), "Escolha quem fez esta etapa"));
      }
      if (!q('[data-tour="fin-open"]')) return setTap(box(q('[data-tour="fin-row"]'), "Toque no brinquedo para abrir"));
      if (!q('[data-tour="fin-open"] [data-tour="fin-worker"][data-on="1"]')) return setTap(box(q('[data-tour="fin-open"] [data-tour="fin-worker"]'), "Marque quem finalizou"));
      return setTap(box(q('[data-tour="fin-btn"]'), "Toque para finalizar (100%)"));
    };
    m(); const t = setInterval(m, 350); return () => clearInterval(t);
  }, [step?.id, done, mini, st.obsSeen]); // eslint-disable-line

  const next = () => {
    if (!done) return;
    if (st.i >= steps.length - 1) { setFinale(true); return; }
    save({ ...st, i: st.i + 1 }); setAnswer(null); setMini(false);
  };
  const askQ = async (q) => { setAnswer({ q, a: null }); const a = await ask(q); setAnswer({ q, a: clean(a) || "Não consegui responder agora. Toque de novo na pergunta." }); };

  if (step?.id === "brain" && !st.brainIntro) return <BrainIntro onDone={() => save({ ...st, brainIntro: true })} />;
  if (finale) return <Finale dark={dark} onClose={() => { clearMission(cid); onFinish?.(); }} />;
  if (!step) return null;
  const Icon = step.icon;

  // ── texto e checklist de cada passo ──
  let body = null, hint = null;
  if (step.id === "order") {
    body = <p>Clique em <b>Extrair com IA</b> e escolha o <b>PDF de um pedido</b> (ou lance na mão). Antes de salvar, <b>coloque pelo menos 1 foto</b>: do brinquedo ou da logo do cliente.</p>;
    hint = <Checklist dark={dark} items={[["Pedido lançado", !!order], ["Pelo menos 1 foto no pedido", hasPhoto]]} />;
    if (order && !hasPhoto) hint = <>{hint}<Warn dark={dark}>Falta a foto! Abra o pedido <b>{order.clientName || ""}</b> (ícone de lápis) e adicione uma imagem em um brinquedo.</Warn></>;
  } else if (step.id === "team") {
    body = <p>Cadastre <b>1 pessoa em cada setor</b>. O cadastro já abre sozinho: digite o nome e toque em <b>Salvar</b>, que o próximo setor aparece. Pode ser você mesmo, por enquanto.</p>;
    hint = <Checklist dark={dark} items={sectorOk} />;
  } else if (step.id === "production") {
    body = <p>Toque no pedido <b>{order?.clientName || ""}</b> para abrir, veja a <b>foto que veio junto</b> e escolha <b>quem fez cada etapa</b>. Cada etapa com responsável sobe <b>25%</b>.</p>;
    hint = prodRows.length ? <Bar pct={prodBest} dark={dark} label="Progresso do brinquedo" /> : <Warn dark={dark}>Esse pedido não tem brinquedo para produzir (só motor?). Lance um pedido com brinquedo.</Warn>;
  } else if (step.id === "finalization") {
    body = <p>Abra o brinquedo, marque <b>quem finalizou</b> e toque no botão verde <b>Concluir finalização</b> (100%). Depois <b>tire ou envie a foto</b> do brinquedo pronto. Sem a foto não dá para continuar.</p>;
    hint = <Checklist dark={dark} items={[["Finalizador marcado", finRows.some(f => (f.finalizers || []).length || f.finalizer)], ["Finalizado", !!finAny], ["Foto do brinquedo pronto", !!finWithPhoto]]} />;
  } else if (step.id === "photos") {
    body = <p>Pronto! O sistema criou a <b>pasta do pedido</b> com as fotos e os dados do cliente{notif?.para ? <> e <b>avisou o vendedor {notif.para}</b> que ficou pronto</> : " e avisou o vendedor"}. Ninguém precisa ficar pedindo foto no WhatsApp.</p>;
    hint = !st.seenPhotos && <Btn onClick={() => save({ ...st, seenPhotos: true })}>Entendi, ver o Cérebro</Btn>;
  } else if (step.id === "brain") {
    body = <p>Tudo o que você lançou <b>alimentou o Cérebro</b>. Toque numa pergunta e veja a resposta com os dados do seu pedido:</p>;
    hint = <div className="space-y-1.5">
      {QUESTIONS.map(q => <button key={q} disabled={!!busy} onClick={() => askQ(q)} className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold border transition ${answer?.q === q ? "border-purple-500 bg-purple-500/15 text-purple-400" : dark ? "border-gray-700 hover:border-purple-500 text-gray-200" : "border-gray-200 hover:border-purple-400 text-gray-700"} disabled:opacity-50`}>🧠 {q}</button>)}
      {answer && <div className={`mt-2 p-3 rounded-xl text-sm whitespace-pre-wrap max-h-48 overflow-y-auto ${dark ? "bg-purple-500/10 text-purple-100" : "bg-purple-50 text-purple-900"}`}>{answer.a || <InflaStatus busy={busy || "Pensando…"} />}</div>}
    </div>;
  } else if (step.id === "map") {
    body = <p>No mapa você vê <b>onde vendeu</b>{where ? <>: o pedido de <b>{order?.clientName}</b> foi para <b>{where}</b></> : ""}. Cada ponto mostra os clientes, pedidos e o que foi vendido na região.</p>;
    hint = !st.seenMap && <Btn onClick={() => save({ ...st, seenMap: true })}>Entendi</Btn>;
  }

  // se o destaque estiver no canto de baixo à direita, o cartão sobe para não tampar
  // Posição do cartão: em cima à esquerda (depois do menu). Se for tampar o destaque,
  // a mãozinha ou o "Você está aqui", vai para o próximo canto livre.
  const W = typeof window !== "undefined" ? window.innerWidth : 1200, H = typeof window !== "undefined" ? window.innerHeight : 800;
  const desk = W >= 640, cw = 380, ch = cardRef.current?.offsetHeight || 330;
  let pos = null;
  if (desk) {
    const L = Math.max(16, nav ? nav.x + nav.w + 16 : 16);
    const obst = [rect, tap && { x: tap.x - 40, y: tap.y - 60, w: Math.max(tap.w, 240) + 80, h: tap.h + 110 }].filter(Boolean);
    const cand = [{ left: L, top: 16 }, { left: L, top: H - ch - 16 }, { left: W - cw - 16, top: 16 }, { left: W - cw - 16, top: H - ch - 96 }];
    const hit = (c) => obst.reduce((a, o) => { const ix = Math.max(0, Math.min(c.left + cw, o.x + o.w) - Math.max(c.left, o.x)), iy = Math.max(0, Math.min(c.top + ch, o.y + o.h) - Math.max(c.top, o.y)); return a + ix * iy; }, 0);
    pos = cand.find(c => hit(c) === 0) || cand.reduce((b, c) => (hit(c) < hit(b) ? c : b));
  }
  // a etiqueta "Você está aqui" só aparece se não ficar embaixo do cartão
  const navLabelOk = !(pos && nav && nav.x + nav.w + 260 > pos.left && nav.y < pos.top + ch && nav.y + nav.h > pos.top);
  const card = dark ? "bg-gray-900 text-white border border-gray-700" : "bg-white text-gray-900 border border-gray-200";
  return <>
    {!mini && <Spotlight rects={rect ? [rect] : []} nav={nav} label={navLabelOk ? `passo ${st.i + 1} de ${steps.length}` : null} />}
    {tap && <Tap t={tap} />}
    {mini ? (
      <button onClick={() => setMini(false)} style={pos ? { left: pos.left, top: pos.top } : undefined} className={`fixed z-[45] ${pos ? "" : "bottom-4 left-1/2 -translate-x-1/2"} flex items-center gap-2 px-4 py-2.5 rounded-full font-black text-sm text-white bg-gradient-to-r from-orange-500 to-orange-600 shadow-xl shadow-orange-500/30`}>
        <Sparkles size={16} />Tutorial · {st.i + 1}/{steps.length}<Maximize2 size={14} />
      </button>
    ) : (
      <div ref={cardRef} className={`fixed z-[45] rounded-2xl shadow-2xl p-4 ${pos ? "" : "bottom-3 left-3 right-3"} ${card}`} style={{ ...(pos ? { left: pos.left, top: pos.top, width: cw, transition: "left .45s cubic-bezier(.2,.8,.2,1), top .45s cubic-bezier(.2,.8,.2,1)" } : {}), animation: "bi-inflate .5s cubic-bezier(.34,1.56,.64,1) both" }}>
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${done ? "bg-emerald-500 text-white" : "bg-orange-500/15 text-orange-500"}`}>{done ? <Check size={20} /> : <Icon size={20} />}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[.18em] text-orange-500">Tutorial na prática · {st.i + 1} de {steps.length}</div>
            <h3 className="font-black text-base leading-tight">{step.title}</h3>
          </div>
          <button onClick={() => setMini(true)} title="Minimizar" className={`p-1.5 rounded-lg ${dark ? "text-gray-500 hover:text-white" : "text-gray-400 hover:text-gray-800"}`}><Minimize2 size={16} /></button>
        </div>
        <div className={`mt-3 text-sm leading-relaxed ${dark ? "text-gray-300" : "text-gray-600"}`}>{body}</div>
        {hint && <div className="mt-3">{hint}</div>}
        <div className="mt-3 flex items-center gap-1">{steps.map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === st.i ? "w-5 bg-orange-500" : k < st.i ? "w-1.5 bg-orange-500/60" : `w-1.5 ${dark ? "bg-gray-700" : "bg-gray-200"}`}`} />)}</div>
        <button onClick={next} disabled={!done} className={`mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-black transition ${done ? "text-white bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/25" : dark ? "bg-gray-800 text-gray-500" : "bg-gray-100 text-gray-400"}`}>
          {done ? <>{st.i >= steps.length - 1 ? "Concluir tutorial" : "Próximo passo"}<ChevronRight size={16} /></> : <><Lock size={14} />Faça a tarefa para continuar</>}
        </button>
      </div>
    )}
  </>;
}

// Tudo fica cinza e escuro; só o lugar onde clicar continua claro (não bloqueia os cliques)
function Spotlight({ rects = [], nav, label }) {
  const W = window.innerWidth, H = window.innerHeight, P = 8;
  const holes = rects.map(r => ({ x: Math.max(0, r.x - P), y: Math.max(0, r.y - P), w: r.w + P * 2, h: r.h + P * 2 }));
  const navH = nav ? { x: nav.x - 4, y: nav.y - 4, w: nav.w + 8, h: nav.h + 8 } : null;
  const all = navH ? [...holes, navH] : holes;
  const path = `M0 0H${W}V${H}H0Z` + all.map(h => `M${h.x} ${h.y}h${h.w}v${h.h}h${-h.w}Z`).join("");
  const mask = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'><path fill='black' fill-rule='evenodd' d='${path}'/></svg>`)}")`;
  const B = { position: "fixed", zIndex: 44, background: "transparent", cursor: "not-allowed" };
  const h0 = holes[0];
  return <>
    {h0 ? <>
      <div style={{ ...B, left: 0, top: 0, right: 0, height: h0.y }} />
      <div style={{ ...B, left: 0, top: h0.y + h0.h, right: 0, bottom: 0 }} />
      <div style={{ ...B, left: 0, top: h0.y, width: h0.x, height: h0.h }} />
      <div style={{ ...B, left: h0.x + h0.w, top: h0.y, right: 0, height: h0.h }} />
    </> : <div style={{ ...B, inset: 0 }} />}
    <div style={{ position: "fixed", inset: 0, zIndex: 44, pointerEvents: "none", background: "rgba(10,10,12,.62)", backdropFilter: "grayscale(1)", WebkitBackdropFilter: "grayscale(1)", WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: "100% 100%", maskSize: "100% 100%" }} />
    {holes.map((h, k) => <div key={k} className="animate-pulse" style={{ position: "fixed", zIndex: 44, pointerEvents: "none", left: h.x, top: h.y, width: h.w, height: h.h, borderRadius: 14, border: "3px solid #f97316", boxShadow: "0 0 26px rgba(249,115,22,.7)", transition: "all .3s cubic-bezier(.2,.8,.2,1)" }} />)}
    {navH && <>
      <div style={{ position: "fixed", zIndex: 44, pointerEvents: "none", left: navH.x, top: navH.y, width: navH.w, height: navH.h, borderRadius: 14, border: "3px solid #f97316", boxShadow: "0 0 18px rgba(249,115,22,.6)" }} />
      {label && navH.x + navH.w + 240 < W && <div style={{ position: "fixed", zIndex: 45, pointerEvents: "none", left: navH.x + navH.w + 12, top: navH.y + navH.h / 2, transform: "translateY(-50%)" }} className="flex items-center">
        <span style={{ width: 0, height: 0, borderTop: "8px solid transparent", borderBottom: "8px solid transparent", borderRight: "10px solid #f97316" }} />
        <span className="px-3 py-1.5 rounded-xl text-xs font-black text-white whitespace-nowrap shadow-lg" style={{ background: "linear-gradient(90deg,#f97316,#ea580c)" }}>📍 Você está aqui · {label}</span>
      </div>}
    </>}
  </>;
}

// Mãozinha tocando + ondas saindo do ponto onde clicar
function Tap({ t }) {
  const cx = t.x + Math.min(t.w / 2, 60), cy = t.y + t.h / 2;
  const below = cy < 140;
  return <div style={{ position: "fixed", zIndex: 45, left: 0, top: 0, pointerEvents: "none" }}>
    {[0, 1, 2].map(i => <span key={i} className="infla-ripple" style={{ left: cx, top: cy, animationDelay: `${i * 0.5}s` }} />)}
    <span className="infla-hand" style={{ left: cx + 6, top: cy + 4 }}>👆</span>
    <span className="infla-tap-label" style={{ left: cx, top: below ? cy + 62 : cy - 40 }}>{t.label}</span>
    <style>{`
.infla-ripple{position:fixed;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:3px solid #fb923c;animation:infla-rip 1.5s ease-out infinite;box-shadow:0 0 18px rgba(251,146,60,.7)}
@keyframes infla-rip{0%{transform:scale(.4);opacity:1}100%{transform:scale(3.6);opacity:0}}
.infla-hand{position:fixed;font-size:38px;line-height:1;filter:drop-shadow(0 4px 6px rgba(0,0,0,.6));animation:infla-press 1.5s ease-in-out infinite;transform-origin:30% 0}
@keyframes infla-press{0%,100%{transform:translate(0,8px) scale(1)}45%{transform:translate(0,0) scale(.88)}60%{transform:translate(0,0) scale(.88)}}
.infla-tap-label{position:fixed;transform:translateX(-50%);white-space:nowrap;padding:6px 12px;border-radius:12px;font-size:13px;font-weight:900;color:#fff;background:linear-gradient(90deg,#f97316,#ea580c);box-shadow:0 8px 20px rgba(0,0,0,.4);animation:infla-bob 1.5s ease-in-out infinite}
@keyframes infla-bob{0%,100%{margin-top:0}50%{margin-top:-4px}}
`}</style>
  </div>;
}

const Checklist = ({ items, dark }) => <div className="space-y-1">{items.map(([l, ok]) => <div key={l} className={`flex items-center gap-2 text-sm font-bold ${ok ? "text-emerald-500" : dark ? "text-gray-400" : "text-gray-500"}`}>
  <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${ok ? "bg-emerald-500 text-white" : dark ? "border-2 border-gray-600" : "border-2 border-gray-300"}`}>{ok && <Check size={12} strokeWidth={4} />}</span>{l}</div>)}</div>;
const Warn = ({ children, dark }) => <div className={`mt-2 p-2.5 rounded-xl text-xs font-bold ${dark ? "bg-amber-500/10 text-amber-300" : "bg-amber-50 text-amber-700"}`}>{children}</div>;
const Btn = ({ children, onClick }) => <button onClick={onClick} className="w-full py-2 rounded-xl text-sm font-black text-white bg-gradient-to-r from-orange-500 to-orange-600">{children}</button>;
const Bar = ({ pct, dark, label }) => <div>
  <div className="flex justify-between text-xs font-black mb-1"><span className={dark ? "text-gray-400" : "text-gray-500"}>{label}</span><span className={pct === 100 ? "text-emerald-500" : "text-orange-500"}>{pct}%</span></div>
  <div className={`h-3 rounded-full overflow-hidden ${dark ? "bg-gray-800" : "bg-gray-100"}`}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? "linear-gradient(90deg,#10b981,#34d399)" : "linear-gradient(90deg,#f97316,#facc15)", transition: "width .7s cubic-bezier(.2,.8,.2,1)" }} /></div>
</div>;

// ── Animação do Infla colocando o cérebro (abre o passo do Cérebro) ─────────
function BrainIntro({ onDone }) {
  // Safari não toca vídeo transparente (webm); lá usa a versão em imagem animada
  const safari = typeof navigator !== "undefined" && /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
  const [t, setT] = useState(0);
  const v = useRef(null);
  useEffect(() => {
    const s0 = performance.now(); let r;
    const f = (n) => { const el = v.current; setT(el && el.currentTime > 0 ? (el.ended ? 10.5 : el.currentTime) : (n - s0) / 1000 * (el ? 0 : 1)); r = requestAnimationFrame(f); }; r = requestAnimationFrame(f);
    const el = v.current; if (el) el.play().catch(() => { });
    const guard = setTimeout(() => setT(x => Math.max(x, 10.5)), 14000); // se o vídeo travar, libera o botão
    return () => { cancelAnimationFrame(r); clearTimeout(guard); };
  }, []);
  const ended = t > 10.2;
  const glow = t > 4.8 && t < 7.8 ? Math.min(1, (t - 4.8) * 3, (7.8 - t) * 3) : 0;
  const conf = useRef([...Array(60)].map((_, i) => ({ x: 8 + Math.random() * 84, d: 1.6 + Math.random() * 1.6, s: 7 + Math.random() * 7, c: ["#fc6502", "#facc15", "#38bdf8", "#22c55e", "#f472b6", "#a78bfa"][i % 6], delay: 7.9 + Math.random() * 1.2, r: Math.random() * 360, dx: (Math.random() - .5) * 30 }))).current;
  return (
    <div className="fixed inset-0 z-[460] flex items-center justify-center p-4 overflow-hidden" style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(76,29,149,.88), rgba(5,3,12,.95) 70%)", backdropFilter: "blur(4px)" }}>
      {conf.map((c, i) => t > c.delay && <span key={i} className="absolute rounded-sm" style={{ left: `calc(${c.x}% + ${(t - c.delay) * c.dx}px)`, top: `${Math.min(105, 30 + ((t - c.delay) / c.d) * 75)}%`, width: c.s, height: c.s * 0.5, background: c.c, transform: `rotate(${c.r + t * 260}deg)` }} />)}
      <div className="relative w-full max-w-xl text-center" style={{ animation: "bi-inflate .6s cubic-bezier(.34,1.56,.64,1) both" }}>
        <div className="text-[11px] font-black uppercase tracking-[.22em] text-purple-300">Tutorial na prática · o Cérebro</div>
        <h2 className="mt-1 text-2xl sm:text-3xl font-black text-white">Seu pedido acabou de alimentar o Cérebro 🧠</h2>
        <div className="relative mx-auto mt-2" style={{ width: "min(80vw, 340px)", aspectRatio: "8 / 9" }}>
          <div className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none" style={{ width: 300, height: 300, background: "radial-gradient(circle, rgba(236,72,153,.75), rgba(168,85,247,.35) 45%, transparent 70%)", opacity: glow, filter: "blur(6px)", transform: `translate(-50%,-50%) scale(${1 + glow * 0.15 + Math.sin(t * 9) * 0.04 * glow})` }} />
          {safari ? <img src="/video/infla-cerebro.webp" alt="" className="relative w-full h-full object-contain" />
            : <video ref={v} src="/video/infla-cerebro.webm" muted playsInline autoPlay className="relative w-full h-full object-contain" />}
        </div>
        <p className="mt-2 text-sm sm:text-base text-purple-100/85 font-semibold">Tudo o que você lança — pedidos, equipe, produção e fotos — vira conhecimento. Agora é só perguntar.</p>
        <button onClick={onDone} disabled={!ended} className={`mt-5 w-full sm:w-auto px-8 py-3.5 rounded-2xl font-black text-white text-lg transition-all ${ended ? "bg-gradient-to-r from-purple-500 to-fuchsia-600 shadow-xl shadow-purple-500/30 hover:scale-[1.02]" : "bg-white/10 text-white/40"}`}>
          {ended ? "Fazer uma pergunta ao Cérebro" : "Assistindo…"}
        </button>
      </div>
    </div>
  );
}

// ── Animação final: marca Inflatudo + frase + presente de 7 dias ─────────────
function Finale({ onClose }) {
  const [t, setT] = useState(0);
  useEffect(() => { const s = performance.now(); let r; const f = (n) => { setT((n - s) / 1000); r = requestAnimationFrame(f); }; r = requestAnimationFrame(f); return () => cancelAnimationFrame(r); }, []);
  const conf = useRef([...Array(46)].map((_, i) => ({ x: Math.random() * 100, d: 2.5 + Math.random() * 2.5, s: 6 + Math.random() * 8, c: ["#fc6502", "#facc15", "#38bdf8", "#22c55e", "#f472b6", "#fff"][i % 6], delay: 1.6 + Math.random() * 1.2, r: Math.random() * 360 }))).current;
  const show = (at) => ({ opacity: t > at ? 1 : 0, transform: t > at ? "none" : "translateY(24px) scale(.96)", transition: "all .7s cubic-bezier(.16,1,.3,1)" });
  return (
    <div className="fixed inset-0 z-[460] flex items-center justify-center overflow-hidden p-6" style={{ background: "radial-gradient(ellipse at 50% 40%, #3a1a06 0%, #120804 60%, #050302 100%)" }}>
      {conf.map((c, i) => <span key={i} className="absolute top-0 rounded-sm" style={{ left: `${c.x}%`, width: c.s, height: c.s * 0.5, background: c.c, transform: `translateY(${t > c.delay ? Math.min(110, ((t - c.delay) / c.d) * 110) : -10}vh) rotate(${c.r + t * 200}deg)`, opacity: t > c.delay ? 1 : 0 }} />)}
      <div className="relative text-center max-w-md w-full">
        <div className="absolute left-1/2 top-16 -translate-x-1/2 w-72 h-72 rounded-full" style={{ background: "radial-gradient(circle, rgba(252,101,2,.45), transparent 65%)", filter: "blur(10px)", opacity: Math.min(1, t) }} />
        <div className="relative flex justify-center"><BrandMark size={150} /></div>
        <div className="relative mt-6 flex justify-center text-white" style={show(0.6)}><BrandWord height={46} /></div>
        <p className="relative mt-5 text-2xl sm:text-3xl font-black text-white leading-tight" style={show(1.2)}>Sua fábrica no controle.<br /><span className="text-orange-400">Você com a sua família.</span></p>
        <div className="relative mt-7 mx-auto rounded-3xl p-5 border-2 border-orange-500/60 bg-gradient-to-br from-orange-500/20 to-amber-400/10" style={show(1.9)}>
          <div className="flex items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center text-white shadow-lg shadow-orange-500/40" style={{ animation: t > 2 ? "bi-bounce 1.2s ease 2" : "none" }}><Gift size={30} /></div>
            <div className="text-left"><div className="text-xs font-black uppercase tracking-[.18em] text-orange-300">Seu presente</div><div className="text-xl font-black text-white">7 dias grátis</div><div className="text-sm text-orange-100/80 font-semibold">com todo o sistema liberado</div></div>
          </div>
        </div>
        <button onClick={onClose} className="relative mt-7 w-full py-3.5 rounded-2xl font-black text-white text-lg bg-gradient-to-r from-orange-500 to-orange-600 shadow-xl shadow-orange-500/30" style={show(2.6)}>Começar a usar</button>
      </div>
    </div>
  );
}
