import React, { useState, useMemo, useEffect, useRef, lazy, Suspense } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { scaleLinear } from "d3-scale";
import { X, AlertTriangle, Package, Layers, Users, DollarSign, Navigation, Filter, RefreshCw, MapPin, TrendingUp } from "lucide-react";
import { STATE_COORDS, UF_NAMES, clientUF } from "../lib/geo";
import { sameSeller, moneyBR, dateBR, norm, orderNumber, sellerColorOf } from "../lib/core";

const RealMap = lazy(() => import("../components/RealMap"));
const GEO_URL = "/brazil-states.json";
const STATUS_LABEL = { aguardando: "Aguardando", producao: "Em produção", concluido: "Concluído" };

// Cada "medida" do mapa tem sua cor: sem filtro = clientes em verde
const METRICS = {
  clients: { label: "Clientes", short: "clientes", color: ["#14532d", "#22c55e"], light: ["#dcfce7", "#15803d"], icon: Users, fmt: v => `${v}` },
  orders: { label: "Pedidos", short: "pedidos", color: ["#1e3a8a", "#3b82f6"], light: ["#dbeafe", "#1d4ed8"], icon: Package, fmt: v => `${v}` },
  toys: { label: "Brinquedos", short: "brinquedos", color: ["#4c1d95", "#a855f7"], light: ["#f3e8ff", "#7e22ce"], icon: Layers, fmt: v => `${v}` },
  revenue: { label: "Faturamento", short: "faturado", color: ["#7c2d12", "#f97316"], light: ["#ffedd5", "#c2410c"], icon: DollarSign, fmt: v => moneyBR(v) },
};

// Número que "corre" até o valor final
function CountUp({ value, format = (v) => v, duration = 700 }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now(), a = from.current, b = Number(value) || 0;
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - start) / duration), e = 1 - Math.pow(1 - k, 3);
      setShown(a + (b - a) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(Math.round(shown))}</>;
}

export default function MapTab({ data, setData, persist, dark, user }) {
  const [view, setView] = useState("estados"); // "estados" | "real"
  const [metric, setMetric] = useState("clients");
  const [status, setStatus] = useState("todos");
  // Vendedor logado vê só os próprios clientes no mapa
  const lockedSeller = user?.role !== "admin" && user?.sellerName ? user.sellerName : "";
  const [sellerSel, setSellerSel] = useState("");
  const seller = lockedSeller || sellerSel;
  const setSeller = (v) => { if (!lockedSeller) setSellerSel(v); };
  const [toy, setToy] = useState("");
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [minToys, setMinToys] = useState("");
  const [selectedState, setSelectedState] = useState(null);
  const [hover, setHover] = useState(null);
  const [showFilters, setShowFilters] = useState(true);

  const canEdit = user?.role === "admin" || (user?.permissions && !Array.isArray(user.permissions) && (user.permissions.clients === "edit" || user.permissions.routes === "edit"));
  const save = (nd) => (persist ? persist(nd) : setData(nd));
  const orders = data.orders || [];
  const clients = data.clients || [];
  const clientOf = (name) => clients.find(c => norm(c.name) === norm(name));

  // Nomes de brinquedos cadastrados (atualiza sozinho quando entra pedido novo)
  const toyNames = useMemo(() => {
    const set = new Map();
    orders.forEach(o => (o.items || []).filter(it => !it.isMotor && it.toy).forEach(it => {
      const key = norm(it.toy);
      if (!set.has(key)) set.set(key, it.toy.trim());
    }));
    return [...set.values()].sort((a, b) => a.localeCompare(b));
  }, [orders]);
  const sellers = (data.sellers || []).map(s => s.name);

  const activeFilters = [status !== "todos", !lockedSeller && seller, toy, minValue, maxValue, minToys].filter(Boolean).length;
  const clearFilters = () => { setStatus("todos"); setSeller(""); setToy(""); setMinValue(""); setMaxValue(""); setMinToys(""); };

  const filteredOrders = useMemo(() => orders.filter(o => {
    if (status === "producao" && o.status === "concluido") return false;
    if (status === "concluidos" && o.status !== "concluido") return false;
    if (seller && !sameSeller(data.sellers, o.seller, seller)) return false;
    const toys = (o.items || []).filter(it => !it.isMotor);
    if (toy && !toys.some(it => norm(it.toy) === norm(toy))) return false;
    if (minValue && (Number(o.totalPrice) || 0) < Number(minValue)) return false;
    if (maxValue && (Number(o.totalPrice) || 0) > Number(maxValue)) return false;
    if (minToys && toys.length < Number(minToys)) return false;
    return true;
  }), [orders, status, seller, toy, minValue, maxValue, minToys]);

  // Agrega tudo por estado
  const { byState, noState } = useMemo(() => {
    const byState = {}; const noState = [];
    filteredOrders.forEach(o => {
      const c = clientOf(o.clientName);
      const uf = clientUF(c);
      if (!uf) { noState.push(o); return; }
      const s = byState[uf] || (byState[uf] = { orders: [], clients: new Set(), toys: 0, revenue: 0, sellers: {}, toyCount: {}, cities: {} });
      s.orders.push({ ...o, _city: c?.city });
      s.clients.add(norm(o.clientName));
      const toys = (o.items || []).filter(it => !it.isMotor);
      s.toys += toys.length;
      s.revenue += Number(o.totalPrice) || 0;
      const sk = o.seller || "Sem vendedor";
      s.sellers[sk] = s.sellers[sk] || { orders: 0, revenue: 0 };
      s.sellers[sk].orders += 1; s.sellers[sk].revenue += Number(o.totalPrice) || 0;
      toys.forEach(it => { const k = (it.toy || "").trim(); if (k) s.toyCount[k] = (s.toyCount[k] || 0) + 1; });
      const city = c?.city || "Cidade não informada";
      s.cities[city] = (s.cities[city] || 0) + 1;
    });
    return { byState, noState };
  }, [filteredOrders, clients]);

  const valueOf = (s) => !s ? 0 : metric === "clients" ? s.clients.size : metric === "orders" ? s.orders.length : metric === "toys" ? s.toys : s.revenue;
  const M = METRICS[metric];
  const maxV = Math.max(1, ...Object.values(byState).map(valueOf));
  const scale = scaleLinear().domain([0, maxV]).range(dark ? M.color : M.light);
  const ranking = Object.entries(byState).sort((a, b) => valueOf(b[1]) - valueOf(a[1]));
  const totals = {
    clients: new Set(filteredOrders.map(o => norm(o.clientName))).size,
    orders: filteredOrders.length,
    toys: filteredOrders.reduce((a, o) => a + (o.items || []).filter(it => !it.isMotor).length, 0),
    revenue: filteredOrders.reduce((a, o) => a + (Number(o.totalPrice) || 0), 0),
  };

  const noStateClients = [...new Map(noState.map(o => [o.clientName, o])).values()];
  const setClientState = (clientName, uf) => {
    if (!uf) return;
    const nd = { ...data, clients: [...clients] };
    const idx = nd.clients.findIndex(c => norm(c.name) === norm(clientName));
    if (idx >= 0) nd.clients[idx] = { ...nd.clients[idx], state: uf };
    else nd.clients.push({ id: Date.now(), name: clientName, city: "", state: uf, phone: "", email: "" });
    save(nd);
  };

  const sel = selectedState ? byState[selectedState] : null;
  const card = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const inp = `px-3 py-2 rounded-xl text-sm font-semibold border outline-none ${dark ? "bg-gray-800 text-white border-gray-700" : "bg-white border-gray-200 text-gray-900"} focus:border-orange-500`;
  const lbl = "block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1";

  return (
    <div className="space-y-5 animate-slide-up">
      <style>{`
        @keyframes mapPulse { 0%{ r: var(--r0); opacity:.55 } 100%{ r: calc(var(--r0) * 2.6); opacity:0 } }
        .map-pulse { animation: mapPulse 2.2s ease-out infinite; }
        .geo-path { transition: fill .55s cubic-bezier(.2,.8,.2,1), stroke .3s; }
        @keyframes barGrow { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        .bar-grow { transform-origin: left; animation: barGrow .7s cubic-bezier(.2,.8,.2,1) both; }
      `}</style>

      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="page-title page-title-underline">Mapa de Vendas</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">Onde estão seus clientes, quanto cada região compra e como chegar até eles</p>
        </div>
        <div className={`flex gap-1 p-1 rounded-xl border ${card}`}>
          <button onClick={() => setView("estados")} className={`px-3 py-2 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${view === "estados" ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30" : "text-slate-500 hover:text-orange-500"}`}><Layers size={14} />Por estado</button>
          <button onClick={() => setView("real")} className={`px-3 py-2 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all ${view === "real" ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30" : "text-slate-500 hover:text-emerald-500"}`}><Navigation size={14} />Mapa real e rotas</button>
        </div>
      </div>

      {/* Filtros (valem para o mapa todo e dentro de cada estado) */}
      <div className={`rounded-2xl border p-4 ${card}`}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-2 text-sm font-black"><Filter size={15} className="text-orange-500" />Filtros {activeFilters > 0 && <span className="px-2 py-0.5 rounded-full bg-orange-500 text-white text-[10px]">{activeFilters}</span>}</button>
          {activeFilters > 0 && <button onClick={clearFilters} className="text-xs font-bold text-orange-500 hover:underline">Limpar filtros</button>}
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <div><label className={lbl}>Pedidos</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className={`${inp} w-full`}>
                <option value="todos">Todos vendidos</option><option value="producao">Em aberto / produção</option><option value="concluidos">Concluídos</option>
              </select></div>
            {lockedSeller ? <div><label className={lbl}>Vendedor</label><div className={`${inp} w-full truncate`} style={{ color: sellerColorOf(data, lockedSeller) }}>● {lockedSeller}</div></div> : (<div><label className={lbl}>Vendedor</label>
              <select value={seller} onChange={e => setSeller(e.target.value)} className={`${inp} w-full`}>
                <option value="">Todos</option>{sellers.map(n => <option key={n} value={n}>{n}</option>)}
              </select></div>)}
            <div><label className={lbl}>Brinquedo</label>
              <select value={toy} onChange={e => setToy(e.target.value)} className={`${inp} w-full`}>
                <option value="">Todos</option>{toyNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select></div>
            <div><label className={lbl}>Valor do pedido (R$)</label>
              <div className="flex gap-1"><input type="number" placeholder="mín." value={minValue} onChange={e => setMinValue(e.target.value)} className={`${inp} w-full min-w-0`} /><input type="number" placeholder="máx." value={maxValue} onChange={e => setMaxValue(e.target.value)} className={`${inp} w-full min-w-0`} /></div></div>
            <div><label className={lbl}>Brinquedos no pedido</label>
              <select value={minToys} onChange={e => setMinToys(e.target.value)} className={`${inp} w-full`}>
                <option value="">Qualquer</option>{[2, 3, 4, 5, 10].map(n => <option key={n} value={n}>{n} ou mais</option>)}
              </select></div>
            <div><label className={lbl}>Colorir o mapa por</label>
              <select value={metric} onChange={e => setMetric(e.target.value)} className={`${inp} w-full`}>
                {Object.entries(METRICS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select></div>
          </div>
        )}
      </div>

      {/* Totais com animação */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Object.entries(METRICS).map(([k, m]) => {
          const Icon = m.icon; const on = metric === k;
          return (
            <button key={k} onClick={() => setMetric(k)} className={`text-left rounded-2xl border p-4 transition-all ${card} ${on ? "ring-2 -translate-y-0.5" : "opacity-80 hover:opacity-100"}`} style={on ? { boxShadow: `0 12px 30px -12px ${m.color[1]}`, borderColor: m.color[1], "--tw-ring-color": m.color[1] } : {}}>
              <div className="flex items-center justify-between mb-1"><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{m.label}</span><Icon size={16} style={{ color: m.color[1] }} /></div>
              <div className="text-2xl font-black tabular-nums" style={{ color: m.color[1] }}><CountUp value={totals[k]} format={m.fmt} /></div>
            </button>
          );
        })}
      </div>

      {noStateClients.length > 0 && canEdit && (
        <div className={`rounded-2xl border p-4 ${dark ? "bg-amber-500/5 border-amber-500/30" : "bg-amber-50 border-amber-200"}`}>
          <div className="flex items-center gap-2 text-sm font-bold text-amber-500 mb-1"><AlertTriangle size={16} /> {noState.length} pedido{noState.length > 1 ? "s" : ""} fora do mapa: cliente sem estado cadastrado</div>
          <p className={`text-xs mb-3 ${dark ? "text-gray-400" : "text-gray-600"}`}>Escolha o estado de cada cliente e ele aparece no mapa na hora.</p>
          <div className="flex flex-wrap gap-2">
            {noStateClients.slice(0, 12).map(o => (
              <div key={o.clientName} className={`flex items-center gap-2 pl-3 pr-1 py-1 rounded-xl border ${card}`}>
                <span className="text-xs font-bold truncate max-w-[160px]">{o.clientName || "Sem nome"}</span>
                <select defaultValue="" onChange={e => setClientState(o.clientName, e.target.value)} className={`${inp} !py-1 !px-2 text-xs`}>
                  <option value="">UF</option>{Object.keys(UF_NAMES).sort().map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "real" ? (
        <Suspense fallback={<div className={`rounded-2xl border h-[600px] flex items-center justify-center ${card}`}><RefreshCw className="animate-spin text-emerald-500" /></div>}>
          <RealMap data={data} save={save} dark={dark} orders={filteredOrders} canEdit={canEdit} />
        </Suspense>
      ) : (
        <div className="flex flex-col lg:flex-row gap-5">
          {/* MAPA POR ESTADO */}
          <div className={`lg:w-[62%] rounded-2xl border p-3 relative overflow-hidden ${card}`}>
            <div className={`absolute top-3 left-3 z-10 p-3 rounded-xl border backdrop-blur-md ${dark ? "bg-gray-900/80 border-gray-700" : "bg-white/85 border-gray-200"}`}>
              <div className="text-[10px] font-black uppercase text-slate-500 mb-1">{M.label} por estado</div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400">0</span>
                <div className="w-24 h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${scale(0)}, ${scale(maxV)})` }} />
                <span className="text-[10px] font-bold text-slate-400">{M.fmt(maxV)}</span>
              </div>
            </div>
            {hover && (
              <div className={`absolute top-3 right-3 z-10 px-3 py-2 rounded-xl border text-xs pointer-events-none shadow-xl ${dark ? "bg-gray-900/95 border-gray-700" : "bg-white/95 border-gray-200"}`}>
                <div className="font-black text-sm">{UF_NAMES[hover] || hover}</div>
                {byState[hover] ? (
                  <div className="text-slate-500 font-bold space-y-0.5 mt-1">
                    <div>{byState[hover].clients.size} clientes · {byState[hover].orders.length} pedidos</div>
                    <div>{byState[hover].toys} brinquedos · {moneyBR(byState[hover].revenue)}</div>
                  </div>
                ) : <div className="text-slate-500 font-bold">Sem vendas neste filtro</div>}
              </div>
            )}
            <ComposableMap projection="geoMercator" projectionConfig={{ scale: 760, center: [-53, -15] }} width={800} height={700} style={{ width: "100%", height: "auto" }}>
              <Geographies geography={GEO_URL}>
                {({ geographies }) => geographies.map(geo => {
                  const uf = geo.properties.sigla;
                  const s = byState[uf];
                  const isSel = selectedState === uf;
                  const fill = s ? scale(valueOf(s)) : (dark ? "#1a2233" : "#f1f5f9");
                  return (
                    <Geography key={geo.rsmKey} geography={geo} className="geo-path"
                      fill={fill} stroke={isSel ? "#fff" : (dark ? "#0b1220" : "#cbd5e1")} strokeWidth={isSel ? 2 : 0.6}
                      onClick={() => setSelectedState(isSel ? null : uf)} onMouseEnter={() => setHover(uf)} onMouseLeave={() => setHover(null)}
                      style={{ default: { outline: "none", filter: isSel ? `drop-shadow(0 0 10px ${M.color[1]})` : "none" }, hover: { outline: "none", cursor: "pointer", filter: `brightness(1.25) drop-shadow(0 0 6px ${M.color[1]}88)` }, pressed: { outline: "none" } }} />
                  );
                })}
              </Geographies>
              {ranking.map(([uf, s]) => {
                const v = valueOf(s); const r0 = 5 + 14 * Math.sqrt(v / maxV);
                return (
                  <Marker key={uf} coordinates={STATE_COORDS[uf]} onClick={() => setSelectedState(uf)}>
                    <circle className="map-pulse" style={{ "--r0": `${r0}px` }} r={r0} fill={M.color[1]} pointerEvents="none" />
                    <circle r={r0} fill={M.color[1]} fillOpacity={0.9} stroke="#fff" strokeWidth={1.5} style={{ cursor: "pointer", transition: "r .5s" }} />
                    <text textAnchor="middle" y={4} style={{ fontSize: Math.max(9, r0 * 0.75), fontWeight: 900, fill: "#fff", pointerEvents: "none" }}>{metric === "revenue" ? "" : v}</text>
                    <text textAnchor="middle" y={r0 + 12} style={{ fontSize: 10, fontWeight: 800, fill: dark ? "#e2e8f0" : "#334155", pointerEvents: "none" }}>{uf}</text>
                  </Marker>
                );
              })}
            </ComposableMap>
            <div className="text-[11px] text-slate-500 font-bold text-center">Clique num estado para ver faturamento, pedidos, vendedores e cidades</div>
          </div>

          {/* PAINEL LATERAL */}
          <div className="lg:w-[38%] min-w-0">
            {sel ? (
              <StatePanel uf={selectedState} s={sel} data={data} dark={dark} card={card} onClose={() => setSelectedState(null)} seller={seller} setSeller={setSeller} />
            ) : (
              <div className={`rounded-2xl border p-5 h-full ${card}`}>
                <h3 className="font-black text-sm uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2"><TrendingUp size={15} />Ranking por {M.label.toLowerCase()}</h3>
                <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1 custom-scrollbar">
                  {ranking.map(([uf, s], i) => (
                    <button key={uf} onClick={() => setSelectedState(uf)} className="w-full text-left p-3 rounded-xl border border-transparent hover:border-orange-500/30 hover:bg-orange-500/5 transition-all">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-xs text-white" style={{ background: scale(valueOf(s)) }}>{uf}</div>
                          <div>
                            <div className="font-black text-sm">{UF_NAMES[uf]}</div>
                            <div className="text-[10px] font-bold text-slate-500">{s.clients.size} clientes · {s.orders.length} pedidos · {s.toys} brinq.</div>
                          </div>
                        </div>
                        <div className="font-black text-sm tabular-nums" style={{ color: M.color[1] }}>{M.fmt(valueOf(s))}</div>
                      </div>
                      <div className={`mt-2 h-1.5 rounded-full overflow-hidden ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
                        <div className="h-full rounded-full bar-grow" style={{ width: `${(valueOf(s) / maxV) * 100}%`, background: M.color[1], animationDelay: `${i * 60}ms` }} />
                      </div>
                    </button>
                  ))}
                  {ranking.length === 0 && <div className="text-center py-16 opacity-50"><Layers size={40} className="mx-auto mb-3" /><p className="font-black text-sm">Nenhuma venda com estes filtros</p></div>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatePanel({ uf, s, data, dark, card, onClose, seller, setSeller }) {
  const [tab, setTab] = useState("resumo");
  const sellers = Object.entries(s.sellers).sort((a, b) => b[1].revenue - a[1].revenue);
  const maxSeller = Math.max(1, ...sellers.map(([, v]) => v.revenue));
  const toys = Object.entries(s.toyCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const cities = Object.entries(s.cities).sort((a, b) => b[1] - a[1]);
  const kpi = [["Faturamento", moneyBR(s.revenue), "#f97316"], ["Pedidos", s.orders.length, "#3b82f6"], ["Clientes", s.clients.size, "#22c55e"], ["Ticket médio", moneyBR(s.revenue / Math.max(1, s.orders.length)), "#a855f7"]];
  return (
    <div className={`rounded-2xl border p-5 animate-slide-up ${card}`} style={{ borderColor: "#f9731655" }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Estado</div>
          <h3 className="font-black text-2xl text-orange-500 leading-tight">{UF_NAMES[uf]}</h3>
          {seller && <button onClick={() => setSeller("")} className="mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${sellerColorOf(data, seller)}22`, color: sellerColorOf(data, seller) }}>Só {seller} ✕</button>}
        </div>
        <button onClick={onClose} className={`p-2 rounded-xl ${dark ? "hover:bg-gray-800" : "hover:bg-gray-100"}`}><X size={18} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {kpi.map(([l, v, c]) => <div key={l} className={`rounded-xl p-3 ${dark ? "bg-gray-800/60" : "bg-gray-50"}`}><div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{l}</div><div className="font-black text-lg tabular-nums" style={{ color: c }}>{v}</div></div>)}
      </div>
      <div className={`flex gap-1 p-1 rounded-xl mb-3 ${dark ? "bg-gray-800/60" : "bg-gray-100"}`}>
        {[["resumo", "Vendedores"], ["brinquedos", "Brinquedos"], ["cidades", "Cidades"], ["pedidos", "Pedidos"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 py-1.5 rounded-lg text-[11px] font-black transition-all ${tab === k ? "bg-orange-500 text-white" : "text-slate-500"}`}>{l}</button>
        ))}
      </div>
      <div className="max-h-[330px] overflow-y-auto pr-1 custom-scrollbar space-y-2">
        {tab === "resumo" && sellers.map(([name, v], i) => {
          const c = sellerColorOf(data, name);
          return (
            <button key={name} onClick={() => setSeller(seller === name ? "" : name)} title="Clique para ver só este vendedor" className={`w-full text-left p-2.5 rounded-xl transition-all ${seller === name ? "ring-2" : ""} ${dark ? "hover:bg-gray-800" : "hover:bg-gray-50"}`} style={{ "--tw-ring-color": c }}>
              <div className="flex justify-between text-sm font-bold"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{name}</span><span className="tabular-nums">{moneyBR(v.revenue)}</span></div>
              <div className="text-[10px] text-slate-500 font-bold mb-1">{v.orders} pedido{v.orders > 1 ? "s" : ""}</div>
              <div className={`h-2 rounded-full overflow-hidden ${dark ? "bg-gray-800" : "bg-gray-100"}`}><div className="h-full rounded-full bar-grow" style={{ width: `${(v.revenue / maxSeller) * 100}%`, background: c, animationDelay: `${i * 70}ms` }} /></div>
            </button>
          );
        })}
        {tab === "brinquedos" && toys.map(([name, n], i) => (
          <div key={name} className="p-2">
            <div className="flex justify-between text-sm font-bold"><span className="truncate pr-2">{name}</span><span>{n}x</span></div>
            <div className={`h-2 mt-1 rounded-full overflow-hidden ${dark ? "bg-gray-800" : "bg-gray-100"}`}><div className="h-full rounded-full bar-grow bg-purple-500" style={{ width: `${(n / toys[0][1]) * 100}%`, animationDelay: `${i * 70}ms` }} /></div>
          </div>
        ))}
        {tab === "cidades" && cities.map(([c, n]) => (
          <div key={c} className={`flex justify-between items-center p-2.5 rounded-xl ${dark ? "bg-gray-800/40" : "bg-gray-50"}`}><span className="text-sm font-bold flex items-center gap-2"><MapPin size={13} className="text-emerald-500" />{c}</span><span className="text-xs font-black text-slate-500">{n} pedido{n > 1 ? "s" : ""}</span></div>
        ))}
        {tab === "pedidos" && s.orders.map(o => {
          const c = sellerColorOf(data, o.seller);
          return (
            <div key={o.id} className={`p-3 rounded-xl border ${dark ? "bg-gray-800/50 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
              <div className="flex justify-between items-start">
                <span className="font-black text-lg tabular-nums"><span className="text-orange-500 text-sm">Nº</span>{orderNumber(o.id)}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${o.status === "concluido" ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400"}`}>{STATUS_LABEL[o.status] || o.status}</span>
              </div>
              <div className="text-sm font-black truncate">{o.clientName}</div>
              <div className="text-[11px] text-slate-500 font-bold flex items-center gap-2 flex-wrap">
                {o.seller && <span style={{ color: c }}>● {o.seller}</span>}<span>{o._city || "—"}</span><span>{moneyBR(o.totalPrice)}</span><span>prazo {dateBR(o.deadline)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
