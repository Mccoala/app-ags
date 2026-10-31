import React, { useEffect, useMemo, useRef, useState } from "react";
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from "d3-force";
import { norm, sellerColorOf } from "../lib/core";
import { clientUF, UF_NAMES } from "../lib/geo";

const TYPE = {
  hub: { color: "#f97316", label: "Empresa" },
  group: { color: "#64748b", label: "Grupo" },
  seller: { color: "#f97316", label: "Vendedor" },
  team: { color: "#38bdf8", label: "Equipe" },
  toy: { color: "#a855f7", label: "Brinquedo" },
  state: { color: "#22c55e", label: "Estado" },
  client: { color: "#94a3b8", label: "Cliente" },
  order: { color: "#fbbf24", label: "Pedido" },
  note: { color: "#e879f9", label: "Memória" },
};

// Monta a "rede de conhecimento" a partir dos dados do app + memórias que a IA guardou
export function buildGraph(data) {
  const nodes = new Map(); const links = [];
  const node = (id, type, label, extra = {}) => { if (!nodes.has(id)) nodes.set(id, { id, type, label, w: 1, ...extra }); else nodes.get(id).w += extra.w || 0; return nodes.get(id); };
  const link = (a, b, s = 1) => { if (a !== b && nodes.has(a) && nodes.has(b)) links.push({ source: a, target: b, s }); };
  const orders = data.orders || [];
  node("hub", "hub", "Inflatudo", { w: 10 });
  [["g:sellers", "Vendedores"], ["g:clients", "Clientes"], ["g:team", "Equipe"], ["g:toys", "Brinquedos"], ["g:states", "Estados"], ["g:notes", "Memórias"]].forEach(([id, l]) => { node(id, "group", l, { w: 4 }); link("hub", id, 2); });

  (data.sellers || []).forEach(s => { node(`s:${norm(s.name)}`, "seller", s.name, { color: s.color, w: 2 }); link("g:sellers", `s:${norm(s.name)}`); });
  (data.team || []).forEach(t => { node(`t:${norm(t.name)}`, "team", t.name, { sub: t.role, w: 2 }); link("g:team", `t:${norm(t.name)}`); });

  const toyCount = {}; const clientRev = {};
  orders.forEach(o => {
    const ck = norm(o.clientName);
    clientRev[ck] = clientRev[ck] || { label: o.clientName, v: 0, sellers: new Set() };
    clientRev[ck].v += Number(o.totalPrice) || 0; if (o.seller) clientRev[ck].sellers.add(norm(o.seller));
    (o.items || []).filter(i => !i.isMotor && i.toy).forEach(i => {
      const k = norm(i.toy).replace(/\s+/g, " ");
      toyCount[k] = toyCount[k] || { label: i.toy.trim(), n: 0, clients: new Set() };
      toyCount[k].n++; toyCount[k].clients.add(ck);
    });
  });
  // clientes: ligados ao vendedor que atendeu e ao estado
  Object.entries(clientRev).sort((a, b) => b[1].v - a[1].v).slice(0, 90).forEach(([k, c]) => {
    const cl = (data.clients || []).find(x => norm(x.name) === k) || {};
    node(`c:${k}`, "client", c.label, { w: 1 + Math.log10(1 + c.v / 1000), sub: cl.city || "" });
    link("g:clients", `c:${k}`, 0.5);
    c.sellers.forEach(s => {
      const sv = [...nodes.values()].find(n => n.type === "seller" && (n.id === `s:${s}` || norm(n.label).split(" ")[0] === s.split(" ")[0]));
      if (sv) link(sv.id, `c:${k}`, 0.6);
    });
    const uf = clientUF(cl);
    if (uf) { node(`u:${uf}`, "state", uf, { w: 1, sub: UF_NAMES[uf] }); link("g:states", `u:${uf}`); link(`u:${uf}`, `c:${k}`, 0.5); }
  });
  // pedidos: cada pedido ligado ao vendedor, ao cliente e aos brinquedos dele (os mais recentes)
  const sellerNode = (name) => { const s = norm(name || ""); if (!s) return null; return [...nodes.values()].find(n => n.type === "seller" && (n.id === `s:${s}` || norm(n.label).split(" ")[0] === s.split(" ")[0])) || null; };
  [...orders].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 80).forEach(o => {
    const id = `o:${o.id}`, num = String(o.id).match(/\d+/)?.[0] || String(o.id);
    node(id, "order", `#${num}`, { w: 1.2, sub: `${o.clientName || "—"}${o.status === "concluido" ? " · concluído" : o.deadline ? ` · prazo ${String(o.deadline).slice(8, 10)}/${String(o.deadline).slice(5, 7)}` : ""}` });
    const sv = sellerNode(o.seller); if (sv) link(sv.id, id, 0.9);
    link(id, `c:${norm(o.clientName)}`, 0.8);
  });
  const orderToys = (o) => (o.items || []).filter(i => !i.isMotor && i.toy).map(i => `b:${norm(i.toy).replace(/\s+/g, " ")}`);

  // brinquedos: ligados aos pedidos (o mesmo brinquedo une pedidos de clientes diferentes)
  Object.entries(toyCount).sort((a, b) => b[1].n - a[1].n).slice(0, 45).forEach(([k, t]) => {
    node(`b:${k}`, "toy", t.label, { w: 1 + t.n, sub: `${t.n} vendido(s) · ${t.clients.size} cliente(s)` }); link("g:toys", `b:${k}`, 0.5);
    // cliente → pedido → brinquedo. Ligação direta cliente→brinquedo só se o pedido não estiver no mapa
    t.clients.forEach(ck => { const temPedido = orders.some(o => norm(o.clientName) === ck && nodes.has(`o:${o.id}`) && orderToys(o).includes(`b:${k}`)); if (!temPedido) link(`c:${ck}`, `b:${k}`, 0.7); });
  });
  orders.forEach(o => { if (nodes.has(`o:${o.id}`)) orderToys(o).forEach(tk => link(`o:${o.id}`, tk, 0.5)); });
  // quem trabalhou em quê
  (data.production || []).forEach(p => {
    const order = orders.find(o => o.id === p.orderId); const it = order?.items?.find(i => i.itemId === p.itemId);
    if (!it?.toy) return; const tk = `b:${norm(it.toy).replace(/\s+/g, " ")}`;
    ["cutter", "tailor", "prep", "assembler"].forEach(k => p[k] && link(`t:${norm(p[k])}`, tk, 0.25));
  });
  // memórias guardadas pela IA
  (data.brain?.notes || []).forEach(n => {
    node(`n:${n.id}`, "note", n.titulo, { w: 2.5, note: n, sub: n.tipo });
    let linked = false;
    (n.ligado_a || []).forEach(name => {
      const k = norm(name);
      const hit = [...nodes.values()].find(x => x.type !== "note" && x.type !== "group" && (norm(x.label) === k || x.id.endsWith(`:${k}`)));
      if (hit) { link(`n:${n.id}`, hit.id, 0.8); linked = true; }
    });
    link("g:notes", `n:${n.id}`, linked ? 0.3 : 1);
  });
  // tira links duplicados
  const seen = new Set();
  const uniq = links.filter(l => { const k = [l.source, l.target].sort().join("|"); if (seen.has(k)) return false; seen.add(k); return true; });
  return { nodes: [...nodes.values()], links: uniq };
}

export default function BrainGraph({ data, height = 460, dark = true, onSelect, flashIds = [] }) {
  const graph = useMemo(() => buildGraph(data), [data]);
  const wrapRef = useRef(null);
  const simRef = useRef(null);
  const posRef = useRef(new Map());
  const [, setTick] = useState(0);
  const [size, setSize] = useState({ w: 800, h: height });
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState(null);
  const drag = useRef(null);
  const userMoved = useRef(false);
  const fitRef = useRef(null);
  fitRef.current = () => {
    const ns = simRef.current?.__nodes || [];
    if (!ns.length || !size.w) return;
    const xs = ns.map(n => n.x), ys = ns.map(n => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const k = Math.max(0.25, Math.min(1.6, Math.min((size.w - 60) / Math.max(1, maxX - minX), (size.h - 70) / Math.max(1, maxY - minY))));
    setView({ k, x: -((minX + maxX) / 2) * k, y: -((minY + maxY) / 2) * k + 8 });
  };
  useEffect(() => { if (!userMoved.current) fitRef.current(); }, [size.w, size.h]);

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: height }));
    ro.observe(el); return () => ro.disconnect();
  }, [height]);

  // (Re)inicia a simulação mantendo a posição dos nós que já existiam → a rede "cresce"
  useEffect(() => {
    const prev = posRef.current;
    const nodes = graph.nodes.map(n => {
      const p = prev.get(n.id);
      if (p) return { ...n, x: p.x, y: p.y, vx: p.vx, vy: p.vy, born: p.born };
      const anchor = graph.links.find(l => l.target === n.id || l.source === n.id);
      const other = anchor ? prev.get(anchor.source === n.id ? anchor.target : anchor.source) : null;
      return { ...n, x: (other?.x ?? 0) + (Math.random() - 0.5) * 30, y: (other?.y ?? 0) + (Math.random() - 0.5) * 30, born: prev.size ? Date.now() : 0 };
    });
    const links = graph.links.map(l => ({ ...l }));
    simRef.current?.stop();
    const sim = forceSimulation(nodes)
      .force("link", forceLink(links).id(d => d.id).distance(l => (l.source.type === "hub" || l.target.type === "hub") ? 90 : 42 + 20 / (l.s || 1)).strength(l => 0.12 + 0.4 * (l.s || 1) / 2))
      .force("charge", forceManyBody().strength(d => d.type === "hub" ? -500 : d.type === "group" ? -260 : -55 - d.w * 4))
      .force("center", forceCenter(0, 0))
      .force("x", forceX(0).strength(0.03)).force("y", forceY(0).strength(0.05))
      .force("collide", forceCollide(d => radius(d) + 3))
      .force("drift", () => {
        const t = performance.now() / 1000;
        nodes.forEach((n, i) => { if (n.type === "hub" || n.fx != null) return; n.vx += Math.sin(t * 0.35 + i * 1.7) * 0.025; n.vy += Math.cos(t * 0.28 + i * 2.3) * 0.025; });
      })
      .alpha(prev.size ? 0.5 : 1).alphaDecay(0.025).alphaTarget(0.035);
    let raf = 0;
    sim.on("tick", () => {
      nodes.forEach(n => posRef.current.set(n.id, n));
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; setTick(t => t + 1); });
    });
    sim.__links = links; sim.__nodes = nodes;
    // Ao assentar pela primeira vez, enquadra tudo na tela (importante no celular)
    let fitted = false;
    sim.on("end", () => { if (!fitted && !userMoved.current) { fitted = true; fitRef.current && fitRef.current(); } });
    setTimeout(() => { if (!userMoved.current) fitRef.current && fitRef.current(); }, 900);
    setTimeout(() => { if (!userMoved.current) fitRef.current && fitRef.current(); }, 2600);
    simRef.current = sim;
    return () => { sim.stop(); cancelAnimationFrame(raf); };
  }, [graph]);

  const sim = simRef.current;
  const nodes = sim?.__nodes || [];
  const links = sim?.__links || [];
  const neighbors = useMemo(() => {
    if (!hover) return null;
    const s = new Set([hover]);
    links.forEach(l => { const a = l.source.id || l.source, b = l.target.id || l.target; if (a === hover) s.add(b); if (b === hover) s.add(a); });
    return s;
  }, [hover, links.length]); // eslint-disable-line

  const toScreen = (x, y) => [size.w / 2 + (x * view.k) + view.x, size.h / 2 + (y * view.k) + view.y];
  const onWheel = (e) => { e.preventDefault(); userMoved.current = true; const k = Math.max(0.3, Math.min(3, view.k * (e.deltaY < 0 ? 1.12 : 0.89))); setView(v => ({ ...v, k })); };
  useEffect(() => { const el = wrapRef.current; if (!el) return; el.addEventListener("wheel", onWheel, { passive: false }); return () => el.removeEventListener("wheel", onWheel); });

  const down = (e, n) => {
    e.stopPropagation();
    const pt = { x: e.clientX, y: e.clientY };
    if (n) { drag.current = { n, pt, moved: false }; n.fx = n.x; n.fy = n.y; sim?.alphaTarget(0.25).restart(); }
    else drag.current = { pan: true, pt, v: { ...view } };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up, { once: true });
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.pt.x, dy = e.clientY - d.pt.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.pan) { userMoved.current = true; setView({ ...d.v, x: d.v.x + dx, y: d.v.y + dy }); }
    else { d.n.fx = d.n.x + dx / view.k; d.n.fy = d.n.y + dy / view.k; d.pt = { x: e.clientX, y: e.clientY }; }
  };
  const up = () => {
    const d = drag.current; drag.current = null; window.removeEventListener("pointermove", move);
    if (d?.n) { d.n.fx = null; d.n.fy = null; sim?.alphaTarget(0.035); if (!d.moved) onSelect && onSelect(d.n); }
  };

  const now = Date.now();
  const flash = new Set(flashIds);
  return (
    <div ref={wrapRef} className="relative w-full select-none overflow-hidden rounded-2xl" style={{ height, background: dark ? "radial-gradient(ellipse at center, #1b1530 0%, #0b0f1a 70%)" : "radial-gradient(ellipse at center, #f5f3ff 0%, #f8fafc 70%)", cursor: drag.current?.pan ? "grabbing" : "grab", touchAction: size.w < 700 ? "pan-y" : "none" }}
      onPointerDown={(e) => down(e, null)}>
      <style>{`@keyframes brainBorn{0%{transform:scale(0);opacity:0}60%{transform:scale(1.35)}100%{transform:scale(1);opacity:1}} @keyframes brainGlow{0%,100%{opacity:.25}50%{opacity:.7}} .brain-node{transform-box:fill-box;transform-origin:center}`}</style>
      <svg width={size.w} height={size.h} className="absolute inset-0">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {links.map((l, i) => {
          const a = l.source, b = l.target; if (a.x == null || b.x == null) return null;
          const [x1, y1] = toScreen(a.x, a.y), [x2, y2] = toScreen(b.x, b.y);
          const on = neighbors && neighbors.has(a.id) && neighbors.has(b.id);
          const isNote = a.type === "note" || b.type === "note";
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? "#f97316" : isNote ? "#e879f9" : (dark ? "#94a3b8" : "#64748b")} strokeOpacity={neighbors ? (on ? 0.9 : 0.05) : isNote ? 0.35 : 0.16} strokeWidth={on ? 1.6 : 0.8} />;
        })}
        {nodes.map(n => {
          if (n.x == null) return null;
          const [x, y] = toScreen(n.x, n.y);
          const r = radius(n) * Math.sqrt(view.k);
          const color = n.type === "seller" ? (n.color || sellerColorOf(data, n.label)) : TYPE[n.type].color;
          const dim = neighbors && !neighbors.has(n.id);
          const fresh = n.born && now - n.born < 2500;
          const showLabel = n.type === "hub" || n.type === "group" || n.type === "note" || n.type === "seller" || hover === n.id || (neighbors && neighbors.has(n.id)) || view.k > 1.4 || n.w > 4;
          return (
            <g key={n.id} opacity={dim ? 0.15 : 1} style={{ transition: "opacity .25s" }} onPointerDown={(e) => down(e, n)} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)} cursor="pointer">
              {(n.type === "note" || flash.has(n.id)) && <circle cx={x} cy={y} r={r * 2.2} fill={color} style={{ animation: "brainGlow 2.4s ease-in-out infinite" }} opacity={0.3} />}
              <circle className="brain-node" cx={x} cy={y} r={r} fill={color} stroke={dark ? "#0b0f1a" : "#fff"} strokeWidth={1.5} filter={n.type === "hub" || n.type === "note" ? "url(#glow)" : undefined} style={fresh ? { animation: "brainBorn .9s cubic-bezier(.2,.8,.2,1)" } : undefined} />
              {showLabel && <text x={x} y={y + r + 11} textAnchor="middle" style={{ fontSize: n.type === "hub" ? 13 : n.type === "group" ? 11 : 10, fontWeight: n.type === "hub" || n.type === "group" ? 900 : 700, fill: dark ? "#e2e8f0" : "#334155", paintOrder: "stroke", stroke: dark ? "#0b0f1a" : "#fff", strokeWidth: 3, pointerEvents: "none" }}>{trunc(n.label, n.type === "note" ? 26 : 20)}</text>}
            </g>
          );
        })}
      </svg>
      {hover && (() => { const n = nodes.find(x => x.id === hover); if (!n) return null; return (
        <div className={`absolute left-3 bottom-3 px-3 py-2 rounded-xl text-xs pointer-events-none border ${dark ? "bg-gray-900/90 border-gray-700 text-gray-200" : "bg-white/90 border-gray-200"}`}>
          <span className="font-black" style={{ color: TYPE[n.type].color }}>{TYPE[n.type].label}</span> · <b>{n.label}</b>{n.sub ? ` · ${n.sub}` : ""}
        </div>); })()}
      <div className="absolute right-3 bottom-3 flex gap-1">
        <button onPointerDown={e => e.stopPropagation()} onClick={() => setView(v => ({ ...v, k: Math.min(3, v.k * 1.2) }))} className="w-9 h-9 md:w-7 md:h-7 rounded-lg bg-black/40 text-white font-black">+</button>
        <button onPointerDown={e => e.stopPropagation()} onClick={() => setView(v => ({ ...v, k: Math.max(0.3, v.k / 1.2) }))} className="w-9 h-9 md:w-7 md:h-7 rounded-lg bg-black/40 text-white font-black">−</button>
        <button onPointerDown={e => e.stopPropagation()} onClick={() => { userMoved.current = false; fitRef.current(); }} className="px-2 h-7 rounded-lg bg-black/40 text-white text-[10px] font-black">enquadrar</button>
      </div>
    </div>
  );
}

const radius = (n) => n.type === "hub" ? 16 : n.type === "group" ? 9 : n.type === "note" ? 7 : Math.min(14, 3.5 + Math.sqrt(n.w) * 1.6);
const trunc = (s, n) => (s || "").length > n ? s.slice(0, n - 1) + "…" : s;
export { TYPE as BRAIN_TYPES };
