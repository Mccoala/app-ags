import React, { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, Legend, LineChart, Line } from "recharts";
import { DollarSign, Package, TrendingUp, AlertTriangle, Factory, CheckCircle, Users, Trophy, Clock, MapPin, Scissors, Layers, ChevronRight, Flame } from "lucide-react";
import BrainAI from "../components/BrainAI";
import PeriodBar from "../components/PeriodBar";
import FilterMenu from "../components/FilterMenu";
import { finalizersOf, sameSeller, moneyBR, dateBR, norm, orderNumber, sellerColorOf, todayStr, daysBetween, periodRange, periodBuckets, inRange } from "../lib/core";
import { clientUF, UF_NAMES } from "../lib/geo";

const STAGES = [["cutter", "Corte"], ["tailor", "Costura"], ["prep", "Preparação"], ["assembler", "Montagem"]];
const PERSON_COLORS = ["#f97316", "#38bdf8", "#a855f7", "#22c55e", "#ec4899", "#eab308", "#14b8a6", "#ef4444", "#6366f1", "#84cc16"];
const pctOf = (p) => STAGES.filter(([k]) => p?.[k]).length * 25;
const finStage = (f) => f?.stage || (f?.done ? "finalizado" : "");
const pctChange = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);

function Delta({ cur, prev, money }) {
  if (prev === null || prev === undefined) return null;
  const g = pctChange(cur, prev);
  if (g === null) return <span className="text-slate-500">antes: {money ? moneyBR(prev) : prev}</span>;
  return <span className={g >= 0 ? "text-emerald-500" : "text-red-500"}>{g >= 0 ? "▲" : "▼"} {Math.abs(g).toFixed(1).replace(".", ",")}% <span className="text-slate-500 font-semibold">vs {money ? moneyBR(prev) : prev}</span></span>;
}

function Kpi({ label, value, sub, icon: Icon, color, dark, onClick }) {
  return (
    <button onClick={onClick} className={`text-left rounded-2xl border p-4 transition-all hover:-translate-y-0.5 ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} ${onClick ? "cursor-pointer" : "cursor-default"}`} style={{ boxShadow: `inset 0 3px 0 ${color}` }}>
      <div className="flex items-center justify-between mb-1.5 gap-1"><span className="text-[10px] font-black uppercase tracking-widest text-slate-500 truncate">{label}</span><Icon size={16} style={{ color }} className="flex-shrink-0" /></div>
      <div className="text-2xl font-black tabular-nums" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] font-bold mt-1">{sub}</div>}
    </button>
  );
}

function Panel({ title, icon: Icon, right, children, dark, className = "", subtitle }) {
  return (
    <div className={`rounded-2xl border p-5 ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} ${className}`}>
      <div className="flex items-start justify-between mb-4 gap-2">
        <div><h3 className="font-black text-base flex items-center gap-2">{Icon && <Icon size={17} className="text-orange-500" />}{title}</h3>{subtitle && <p className="text-[11px] text-slate-500 font-semibold mt-0.5">{subtitle}</p>}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function DashboardTab({ data, dark, goTo, persist, setData, user }) {
  // O cérebro grande do painel aparece só no computador (no celular fica o botão flutuante)
  const [isDesktop, setIsDesktop] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);
  useEffect(() => { const f = () => setIsDesktop(window.innerWidth >= 768); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const [period, setPeriod] = useState("mes");
  const [custom, setCustom] = useState({});
  const orders = data.orders || [];
  const prod = data.production || [];
  const fin = data.finalization || [];
  const today = todayStr();
  const earliest = orders.map(o => o.createdAt).filter(Boolean).sort()[0];
  const range = periodRange(period, custom, earliest);
  const go = (t) => goTo && goTo(t);
  const toysOf = (o) => (o.items || []).filter(it => !it.isMotor);
  const rev = (l) => l.reduce((a, o) => a + (Number(o.totalPrice) || 0), 0);

  const m = useMemo(() => {
    const cur = orders.filter(o => inRange(o.createdAt, range.from, range.to));
    const prev = range.prevFrom ? orders.filter(o => inRange(o.createdAt, range.prevFrom, range.prevTo)) : null;
    const open = orders.filter(o => o.status !== "concluido");
    const late = open.filter(o => o.deadline && o.deadline < today);
    const finDone = fin.filter(f => finStage(f) === "finalizado" && inRange(f.finDate, range.from, range.to)).length;
    const finDonePrev = range.prevFrom ? fin.filter(f => finStage(f) === "finalizado" && inRange(f.finDate, range.prevFrom, range.prevTo)).length : null;

    const chart = periodBuckets(range).map(b => { const os = orders.filter(o => inRange(o.createdAt, b.from, b.to)); return { label: b.label, faturamento: rev(os), pedidos: os.length }; });

    const sellerNames = [...new Set([...(data.sellers || []).map(s => s.name), ...orders.map(o => o.seller).filter(Boolean)])];
    const sellers = sellerNames.map(name => {
      const all = orders.filter(o => sameSeller(data.sellers, o.seller, name));
      const c = all.filter(o => inRange(o.createdAt, range.from, range.to));
      const p = prev ? all.filter(o => inRange(o.createdAt, range.prevFrom, range.prevTo)) : null;
      return { name, color: sellerColorOf(data, name), value: rev(c), prev: p ? rev(p) : null, orders: c.length, toys: c.reduce((a, o) => a + toysOf(o).length, 0), clients: new Set(c.map(o => norm(o.clientName))).size, open: all.filter(o => o.status !== "concluido").length, total: rev(all) };
    }).sort((a, b) => b.value - a.value || b.total - a.total);

    // Esteira: onde cada brinquedo em aberto está agora
    const pipeline = [{ key: "wait", label: "Aguardando corte", color: "#64748b", items: [] }, ...STAGES.slice(1).map(([, l], i) => ({ key: `s${i}`, label: `Aguardando ${l.toLowerCase()}`, color: ["#3b82f6", "#a855f7", "#f59e0b"][i], items: [] })), { key: "fin", label: "Na finalização", color: "#14b8a6", items: [] }];
    orders.filter(o => o.status !== "concluido").forEach(o => toysOf(o).forEach(it => {
      const p = prod.find(x => x.itemId === it.itemId) || {};
      const f = fin.find(x => x.itemId === it.itemId);
      if (pctOf(p) === 100) { if (finStage(f) !== "finalizado") pipeline[4].items.push({ o, it }); return; }
      const idx = STAGES.findIndex(([k]) => !p[k]);
      pipeline[Math.max(0, idx)].items.push({ o, it });
    }));
    const maxStage = Math.max(1, ...pipeline.map(s => s.items.length));

    const upcoming = open.filter(o => o.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 8).map(o => {
      const ts = toysOf(o);
      const pcts = ts.map(it => { const f = fin.find(x => x.itemId === it.itemId); return finStage(f) === "finalizado" ? 100 : pctOf(prod.find(x => x.itemId === it.itemId)) * 0.8 + (finStage(f) === "finalizando" ? 10 : 0); });
      return { o, pct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0, d: daysBetween(today, o.deadline) };
    });

    const toyMap = {}; cur.forEach(o => toysOf(o).forEach(it => { const k = (it.toy || "").trim(); if (!k) return; toyMap[k] = toyMap[k] || { n: 0, v: 0 }; toyMap[k].n++; toyMap[k].v += Number(it.price) || 0; }));
    const topToys = Object.entries(toyMap).sort((a, b) => b[1].n - a[1].n || b[1].v - a[1].v).slice(0, 6);
    const clientMap = {}; cur.forEach(o => { const k = o.clientName || "—"; clientMap[k] = clientMap[k] || { n: 0, v: 0, last: "", seller: o.seller }; clientMap[k].n++; clientMap[k].v += Number(o.totalPrice) || 0; if ((o.createdAt || "") > clientMap[k].last) clientMap[k].last = o.createdAt; });
    const topClients = Object.entries(clientMap).sort((a, b) => b[1].v - a[1].v).slice(0, 6);
    const st = {}; cur.forEach(o => { const c = (data.clients || []).find(x => x.name === o.clientName); const uf = clientUF(c) || "—"; st[uf] = st[uf] || { v: 0, n: 0 }; st[uf].v += Number(o.totalPrice) || 0; st[uf].n++; });
    const topStates = Object.entries(st).sort((a, b) => b[1].v - a[1].v).slice(0, 6);

    return { cur, prev, open, late, finDone, finDonePrev, chart, sellers, pipeline, maxStage, upcoming, topToys, topClients, topStates };
  }, [data, range.from, range.to, range.prevFrom]); // eslint-disable-line

  const curRev = rev(m.cur), prevRev = m.prev ? rev(m.prev) : null;
  const curToys = m.cur.reduce((a, o) => a + toysOf(o).length, 0), prevToys = m.prev ? m.prev.reduce((a, o) => a + toysOf(o).length, 0) : null;
  const ticket = m.cur.length ? curRev / m.cur.length : 0;
  const tt = { backgroundColor: dark ? "#0f172a" : "#fff", border: `1px solid ${dark ? "#1e293b" : "#e2e8f0"}`, borderRadius: 12, fontSize: 12 };
  const maxSeller = Math.max(1, ...m.sellers.map(s => s.value));
  const sub = dark ? "bg-gray-800/40 border-gray-800" : "bg-gray-50 border-gray-100";

  return (
    <div className="space-y-5 animate-slide-up pb-10">
      <div>
        <h2 className="page-title page-title-underline">Painel do Gerente</h2>
        <p className="text-sm text-slate-500 mt-1 font-medium">Vendas, produção e equipe num lugar só</p>
      </div>

      {isDesktop && <div data-tour="brain" className="hidden md:block"><BrainAI data={data} dark={dark} user={user} persist={persist || ((nd) => setData && setData(nd))} canWrite={user?.role === "admin" || user?.permissions?.dashboard === "edit" || (Array.isArray(user?.permissions) && user.permissions.includes("dashboard"))} /></div>}

      <PeriodBar value={period} onChange={setPeriod} custom={custom} onCustom={setCustom} range={range} dark={dark} />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi dark={dark} label="Faturamento" value={moneyBR(curRev)} color="#f97316" icon={DollarSign} sub={<Delta cur={curRev} prev={prevRev} money />} />
        <Kpi dark={dark} label="Pedidos" value={m.cur.length} color="#3b82f6" icon={Package} sub={<Delta cur={m.cur.length} prev={m.prev ? m.prev.length : null} />} onClick={() => go("orders")} />
        <Kpi dark={dark} label="Brinquedos vendidos" value={curToys} color="#a855f7" icon={Layers} sub={<Delta cur={curToys} prev={prevToys} />} />
        <Kpi dark={dark} label="Ticket médio" value={moneyBR(Math.round(ticket))} color="#22c55e" icon={TrendingUp} sub={<span className="text-slate-500">por pedido no período</span>} />
        <Kpi dark={dark} label="Finalizados" value={m.finDone} color="#14b8a6" icon={CheckCircle} sub={<Delta cur={m.finDone} prev={m.finDonePrev} />} onClick={() => go("finalization")} />
        <Kpi dark={dark} label="Em aberto agora" value={m.open.length} color="#eab308" icon={Clock} sub={<span className={m.late.length ? "text-red-500" : "text-emerald-500"}><AlertTriangle size={11} className="inline -mt-0.5" /> {m.late.length} atrasado(s)</span>} onClick={() => go("production")} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 items-start">
        <Panel dark={dark} className="xl:col-span-3" title="Faturamento e pedidos" subtitle={`${range.label} · por ${range.bucket === "day" ? "dia" : "mês"}`} icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={m.chart} margin={{ left: 0, right: 8, top: 6 }}>
              <defs><linearGradient id="gFat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f97316" stopOpacity={0.45} /><stop offset="1" stopColor="#f97316" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? "#1e293b" : "#f1f5f9"} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }} minTickGap={12} />
              <YAxis yAxisId="v" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : v} width={40} />
              <YAxis yAxisId="n" orientation="right" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} width={24} allowDecimals={false} />
              <Tooltip contentStyle={tt} formatter={(v, n) => n === "faturamento" ? [moneyBR(v), "Faturamento"] : [v, "Pedidos"]} />
              <Area yAxisId="v" type="monotone" dataKey="faturamento" stroke="#f97316" strokeWidth={3} fill="url(#gFat)" animationDuration={900} />
              <Area yAxisId="n" type="monotone" dataKey="pedidos" stroke="#3b82f6" strokeWidth={2} fill="transparent" animationDuration={1100} />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel dark={dark} className="xl:col-span-2" title="Vendedores" subtitle={range.label} icon={Trophy}>
          {m.sellers.length === 0 && <p className="text-sm text-slate-500">Nenhum vendedor ainda. Eles entram sozinhos quando chegam pedidos.</p>}
          <div className="space-y-2.5">
            {m.sellers.map((s, i) => (
              <div key={s.name} className={`rounded-xl p-3 border ${sub}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm text-white flex-shrink-0" style={{ background: s.color, boxShadow: `0 6px 14px ${s.color}55` }}>{i + 1}º</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2"><span className="font-black text-sm truncate" style={{ color: s.color }}>{s.name}</span><span className="font-black text-sm tabular-nums flex-shrink-0">{moneyBR(s.value)}</span></div>
                    <div className={`mt-1.5 h-2 rounded-full overflow-hidden ${dark ? "bg-gray-800" : "bg-gray-200"}`}><div className="h-full rounded-full" style={{ width: `${(s.value / maxSeller) * 100}%`, background: s.color, transition: "width .8s cubic-bezier(.2,.8,.2,1)" }} /></div>
                    <div className="flex flex-wrap gap-x-3 mt-1 text-[10px] font-bold text-slate-500"><span>{s.orders} pedido(s)</span><span>{s.toys} brinquedo(s)</span><span>{s.clients} cliente(s)</span><span>{s.open} em aberto</span>{s.prev !== null && <Delta cur={s.value} prev={s.prev} money />}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <TeamPerformance key={period} data={data} dark={dark} goTo={go} initPeriod={period} earliest={earliest} />

      <Panel dark={dark} title="Esteira de produção" subtitle="Onde cada brinquedo em aberto está agora · clique para abrir" icon={Factory}>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {m.pipeline.map((st, i) => {
            const n = st.items.length; const isMax = n > 0 && n === m.maxStage;
            const oldest = [...st.items].sort((a, b) => String(a.o.deadline).localeCompare(String(b.o.deadline))).slice(0, 3);
            return (
              <button key={st.key} onClick={() => go(st.key === "fin" ? "finalization" : "production")} className={`relative text-left rounded-2xl p-4 border overflow-hidden transition-all hover:-translate-y-0.5 ${sub}`} style={{ boxShadow: isMax ? `0 0 0 2px ${st.color}, 0 12px 30px -10px ${st.color}` : undefined }}>
                <div className="absolute inset-x-0 bottom-0 transition-all duration-700" style={{ height: `${(n / m.maxStage) * 100}%`, background: `linear-gradient(180deg, ${st.color}00, ${st.color}38)` }} />
                <div className="relative">
                  <div className="flex items-center justify-between gap-1"><span className="text-[10px] font-black uppercase tracking-widest" style={{ color: st.color }}>{i + 1}. {st.label}</span>{i < 4 && <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />}</div>
                  <div className="text-4xl font-black tabular-nums mt-1" style={{ color: st.color }}>{n}</div>
                  <div className="text-[11px] font-bold text-slate-500">brinquedo(s)</div>
                  {isMax && <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: st.color }}><Flame size={11} />maior fila</div>}
                  <div className="mt-2 space-y-0.5">{oldest.map(({ o, it }) => <div key={it.itemId} className="text-[11px] truncate"><b>Nº{orderNumber(o.id)}</b> <span className="text-slate-500">{it.toy}</span></div>)}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel dark={dark} title="Próximas entregas" subtitle="Pedidos em aberto por prazo" icon={Clock} right={<button onClick={() => go("orders")} className="text-[11px] font-black text-orange-500 hover:underline">Ver pedidos</button>}>
          <div className="space-y-2">
            {m.upcoming.length === 0 && <p className="text-sm text-slate-500">Nenhuma entrega em aberto. 🎉</p>}
            {m.upcoming.map(({ o, pct, d }) => {
              const c = sellerColorOf(data, o.seller);
              const tone = d < 0 ? "#ef4444" : d <= 3 ? "#f59e0b" : "#38bdf8";
              return (
                <div key={o.id} className={`flex items-center gap-3 p-3 rounded-xl border ${sub}`} style={{ boxShadow: `inset 3px 0 0 ${tone}` }}>
                  <div className="w-14 text-center flex-shrink-0"><div className="text-lg font-black tabular-nums leading-none" style={{ color: tone }}>{d < 0 ? -d : d}</div><div className="text-[9px] font-black uppercase text-slate-500">{d < 0 ? "dias atraso" : d === 0 ? "hoje" : "dias"}</div></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><span className="font-black text-sm flex-shrink-0">Nº{orderNumber(o.id)}</span><span className="text-sm font-semibold truncate">{o.clientName}</span></div>
                    <div className="flex items-center gap-2 mt-1 min-w-0"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} /><span className="text-[11px] font-bold truncate" style={{ color: c }}>{o.seller || "—"}</span><span className="text-[11px] text-slate-500 flex-shrink-0">· prazo {dateBR(o.deadline)}</span></div>
                    <div className={`mt-1.5 h-1.5 rounded-full overflow-hidden ${dark ? "bg-gray-800" : "bg-gray-200"}`}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "#22c55e" : "#f97316" }} /></div>
                  </div>
                  <div className="text-xs font-black tabular-nums w-10 text-right">{pct}%</div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel dark={dark} title="Mais vendidos" subtitle={range.label} icon={Package}>
          {!m.topToys.length && <p className="text-sm text-slate-500">Sem vendas neste período.</p>}
          <div className="space-y-2.5">
            {m.topToys.map(([n, v], i) => (
              <div key={n} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs flex-shrink-0" style={{ background: i === 0 ? "linear-gradient(135deg,#f97316,#eab308)" : dark ? "#1f2937" : "#f1f5f9", color: i === 0 ? "#fff" : "#94a3b8" }}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2 text-sm"><span className="font-bold truncate">{n}</span><span className="font-black flex-shrink-0">{v.n}x</span></div>
                  <div className={`mt-1 h-2 rounded-full overflow-hidden ${dark ? "bg-gray-800" : "bg-gray-200"}`}><div className="h-full rounded-full" style={{ width: `${(v.n / m.topToys[0][1].n) * 100}%`, background: "linear-gradient(90deg,#a855f7,#ec4899)" }} /></div>
                  <div className="text-[10px] font-bold text-slate-500 mt-0.5">{moneyBR(v.v)} vendidos</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel dark={dark} title="Melhores clientes" subtitle={range.label} icon={Users} right={<button onClick={() => go("clients")} className="text-[11px] font-black text-orange-500 hover:underline">Ver clientes</button>}>
          {!m.topClients.length && <p className="text-sm text-slate-500">Sem vendas neste período.</p>}
          <div className="space-y-2.5">
            {m.topClients.map(([n, v]) => {
              const c = sellerColorOf(data, v.seller);
              return (
                <div key={n} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-xs text-white flex-shrink-0" style={{ background: `linear-gradient(135deg, ${c}aa, ${c})` }}>{n.split(" ").slice(0, 2).map(x => x[0]).join("")}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2 text-sm"><span className="font-bold truncate">{n}</span><span className="font-black tabular-nums flex-shrink-0">{moneyBR(v.v)}</span></div>
                    <div className={`mt-1 h-1.5 rounded-full overflow-hidden ${dark ? "bg-gray-800" : "bg-gray-200"}`}><div className="h-full rounded-full" style={{ width: `${(v.v / Math.max(1, m.topClients[0][1].v)) * 100}%`, background: c }} /></div>
                    <div className="text-[10px] font-bold text-slate-500 mt-0.5 truncate">{v.n} pedido(s) · última {dateBR(v.last)} · <span style={{ color: c }}>{v.seller}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel dark={dark} title="Vendas por estado" subtitle={range.label} icon={MapPin} right={<button onClick={() => go("routes")} className="text-[11px] font-black text-orange-500 hover:underline">Abrir mapa</button>}>
          {!m.topStates.length && <p className="text-sm text-slate-500">Sem vendas neste período.</p>}
          <div className="space-y-2.5">
            {(() => { const tot = Math.max(1, m.topStates.reduce((a, [, v]) => a + v.v, 0)); return m.topStates.map(([uf, v]) => (
              <div key={uf} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs flex-shrink-0 text-emerald-400" style={{ background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.3)" }}>{uf === "—" ? "?" : uf}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2 text-sm"><span className="font-bold truncate">{uf === "—" ? "Sem estado" : UF_NAMES[uf] || uf}</span><span className="font-black tabular-nums flex-shrink-0">{moneyBR(v.v)}</span></div>
                  <div className={`mt-1 h-1.5 rounded-full overflow-hidden ${dark ? "bg-gray-800" : "bg-gray-200"}`}><div className="h-full rounded-full bg-emerald-500" style={{ width: `${(v.v / tot) * 100}%` }} /></div>
                  <div className="text-[10px] font-bold text-slate-500 mt-0.5">{((v.v / tot) * 100).toFixed(0)}% do faturamento · {v.n} pedido(s)</div>
                </div>
              </div>
            )); })()}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ── Rendimento da equipe: cada pessoa comparada com ela mesma (período anterior) e com o setor ──
const SECTORS = [["cutter", "Corte"], ["tailor", "Costura"], ["prep", "Preparação"], ["assembler", "Montagem"], ["fin", "Finalização"]];
function TeamPerformance({ data, dark, goTo, initPeriod = "mes", earliest }) {
  const [sector, setSector] = useState("tailor");
  // período próprio do rendimento (o gerente escolhe aqui) e com o que comparar
  const [period, setPeriod] = useState(initPeriod);
  const [custom, setCustom] = useState({});
  const [cmp, setCmp] = useState("prev"); // prev | yoy | custom | none
  const [cmpCustom, setCmpCustom] = useState({});
  const range = useMemo(() => {
    const r = periodRange(period, custom, earliest);
    const yearBack = (d) => d ? `${Number(d.slice(0, 4)) - 1}${d.slice(4)}` : d;
    if (cmp === "none") return { ...r, prevFrom: null, prevTo: null, cmpLabel: "" };
    if (cmp === "yoy") return { ...r, prevFrom: yearBack(r.from), prevTo: yearBack(r.to), cmpLabel: "mesmo período do ano passado" };
    if (cmp === "custom") return cmpCustom.from && cmpCustom.to ? { ...r, prevFrom: cmpCustom.from <= cmpCustom.to ? cmpCustom.from : cmpCustom.to, prevTo: cmpCustom.from <= cmpCustom.to ? cmpCustom.to : cmpCustom.from, cmpLabel: `${dateBR(cmpCustom.from)} → ${dateBR(cmpCustom.to)}` } : { ...r, prevFrom: null, prevTo: null, cmpLabel: "" };
    return r.prevFrom ? { ...r, cmpLabel: `período anterior (${dateBR(r.prevFrom)} → ${dateBR(r.prevTo)})` } : { ...r, cmpLabel: "" };
  }, [period, custom, earliest, cmp, cmpCustom]);
  const [picked, setPicked] = useState(null); // null = todos do setor
  const records = useMemo(() => {
    const out = [];
    if (sector === "fin") (data.finalization || []).forEach(f => { if (finStage(f) === "finalizado") finalizersOf(f).forEach(n => out.push({ p: n, d: (f.finDate || "").slice(0, 10) || null })); });
    else (data.production || []).forEach(p => { if (p[sector]) out.push({ p: p[sector], d: (p[`${sector}At`] || "").slice(0, 10) || null }); });
    return out;
  }, [data, sector]);
  const roleName = SECTORS.find(s => s[0] === sector)[1];
  const roleMatch = (t) => sector === "fin" ? t.role === "Finalizador" : sector === "assembler" ? ["Montagem", "Preparação"].includes(t.role) : t.role === roleName;
  const people = [...new Set([...(data.team || []).filter(roleMatch).map(t => t.name), ...records.map(r => r.p)])];
  const colorOfP = (p) => PERSON_COLORS[people.indexOf(p) % PERSON_COLORS.length];
  const countIn = (p, from, to) => records.filter(r => r.p === p && r.d && r.d >= from && r.d <= to).length;
  const rows = people.map(p => {
    const cur = countIn(p, range.from, range.to), prev = range.prevFrom ? countIn(p, range.prevFrom, range.prevTo) : null;
    return { p, cur, prev, total: records.filter(r => r.p === p).length, undated: records.filter(r => r.p === p && !r.d).length, var: prev ? ((cur - prev) / prev) * 100 : null };
  }).sort((a, b) => b.cur - a.cur || b.total - a.total);
  const active = rows.filter(r => r.cur > 0);
  const avg = active.length ? active.reduce((s, r) => s + r.cur, 0) / active.length : 0;
  const undatedAll = records.filter(r => !r.d).length;
  const chosen = picked === null ? people : people.filter(p => picked.includes(p));
  const togglePerson = (p) => setPicked(prev => { const base = prev === null ? [...people] : prev; return base.includes(p) ? base.filter(x => x !== p) : [...base, p]; });
  const barData = rows.filter(r => chosen.includes(r.p)).map(r => ({ nome: r.p.split(" ")[0], p: r.p, atual: r.cur, anterior: r.prev ?? 0 }));
  const trend = periodBuckets(range).map(b => {
    const per = people.map(p => countIn(p, b.from, b.to)).filter(n => n > 0);
    const row = { label: b.label, "média do setor": per.length ? +(per.reduce((s, n) => s + n, 0) / per.length).toFixed(1) : 0 };
    chosen.forEach(p => { row[p] = countIn(p, b.from, b.to); });
    return row;
  });
  const tt = { backgroundColor: dark ? "#0f172a" : "#fff", border: `1px solid ${dark ? "#1e293b" : "#e2e8f0"}`, borderRadius: 12, fontSize: 12 };
  const card = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";

  return (
    <div className={`rounded-2xl border p-5 ${card}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <div>
          <h3 className="font-black text-base flex items-center gap-2"><Scissors size={17} className="text-orange-500" />Rendimento da equipe</h3>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">{range.label}{range.prevFrom ? ` · comparado com ${range.cmpLabel}` : ""} · itens feitos</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <FilterMenu value={sector} onChange={(k) => { setSector(k); setPicked(null); }} label="Setor" dark={dark} options={SECTORS} />
          <button onClick={() => goTo && goTo("team")} className="text-[11px] font-black text-orange-500 hover:underline">Gerenciar equipe</button>
        </div>
      </div>
      <div className={`flex items-center gap-2 flex-wrap mb-4 p-2.5 rounded-xl ${dark ? "bg-white/5" : "bg-gray-50"}`}>
        <PeriodBar value={period} onChange={setPeriod} custom={custom} onCustom={setCustom} range={periodRange(period, custom, earliest)} dark={dark} />
        <FilterMenu value={cmp} onChange={setCmp} label="Comparar com" dark={dark} accent="#38bdf8"
          options={[["prev", "Período anterior"], ["yoy", "Mesmo período do ano passado"], ["custom", "Outro período…"], ["none", "Não comparar"]]} />
        {cmp === "custom" && <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={cmpCustom.from || ""} onChange={e => setCmpCustom({ ...cmpCustom, from: e.target.value })} className={`px-2 py-1.5 rounded-lg text-xs font-bold border outline-none ${dark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200"}`} />
          <span className="text-xs text-slate-500">até</span>
          <input type="date" value={cmpCustom.to || ""} onChange={e => setCmpCustom({ ...cmpCustom, to: e.target.value })} className={`px-2 py-1.5 rounded-lg text-xs font-bold border outline-none ${dark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200"}`} />
        </div>}
      </div>

      {people.length === 0 ? <p className="text-sm text-slate-500">Ninguém cadastrado em {roleName}. Cadastre na aba Equipe.</p> : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {people.map(p => {
              const on = chosen.includes(p); const c = colorOfP(p);
              return (
                <label key={p} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-bold cursor-pointer select-none ${on ? "" : dark ? "border-gray-700 text-gray-500" : "border-gray-200 text-gray-400"}`} style={on ? { borderColor: c, color: c, background: `${c}18` } : {}}>
                  <input type="checkbox" checked={on} onChange={() => togglePerson(p)} className="w-3.5 h-3.5" style={{ accentColor: c }} />{p}
                </label>
              );
            })}
            <button onClick={() => setPicked(null)} className={`px-2 py-1 rounded-md text-[11px] font-black ${picked === null ? "bg-orange-500 text-white" : "text-slate-500"}`}>Todos</button>
            <button onClick={() => setPicked([])} className="px-2 py-1 rounded-md text-[11px] font-black text-slate-500">Nenhum</button>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div>
              <div className="text-xs font-black text-slate-500 mb-2">Período escolhido (cor cheia){range.prevFrom ? " x comparação (cor clara)" : ""}</div>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={barData} margin={{ left: -18, right: 6, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? "#1e293b" : "#f1f5f9"} />
                  <XAxis dataKey="nome" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip contentStyle={tt} cursor={{ fill: dark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.03)" }} formatter={(v, n) => [v, n === "atual" ? "Período atual" : "Período anterior"]} />
                  {range.prevFrom && <Bar dataKey="anterior" radius={[5, 5, 0, 0]} animationDuration={700}>{barData.map(d => <Cell key={d.p} fill={colorOfP(d.p)} fillOpacity={0.3} />)}</Bar>}
                  <Bar dataKey="atual" radius={[5, 5, 0, 0]} animationDuration={900}>{barData.map(d => <Cell key={d.p} fill={colorOfP(d.p)} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-xs">
                  <thead><tr className="text-slate-500 text-left"><th className="py-1.5 pr-2">Pessoa</th><th className="pr-2 text-right">Atual</th>{range.prevFrom && <th className="pr-2 text-right">Comparação</th>}{range.prevFrom && <th className="pr-2 text-right">Variação</th>}<th className="pr-2 text-right">vs média</th><th className="text-right">Total</th></tr></thead>
                  <tbody>{rows.map(r => {
                    const vsAvg = avg && r.cur ? ((r.cur - avg) / avg) * 100 : null; const c = colorOfP(r.p);
                    return (
                      <tr key={r.p} onClick={() => togglePerson(r.p)} className={`cursor-pointer border-t ${dark ? "border-gray-800 hover:bg-gray-800/50" : "border-gray-100 hover:bg-gray-50"} ${chosen.includes(r.p) ? "" : "opacity-40"}`}>
                        <td className="py-1.5 pr-2 font-bold truncate max-w-[140px]"><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: c }} />{r.p}</td>
                        <td className="pr-2 text-right font-black tabular-nums" style={{ color: c }}>{r.cur}</td>
                        {range.prevFrom && <td className="pr-2 text-right tabular-nums text-slate-500">{r.prev}</td>}
                        {range.prevFrom && <td className={`pr-2 text-right font-black tabular-nums ${r.var === null ? "text-slate-500" : r.var >= 0 ? "text-emerald-500" : "text-red-500"}`}>{r.var === null ? (r.cur ? "novo" : "—") : `${r.var >= 0 ? "▲" : "▼"} ${Math.abs(r.var).toFixed(0)}%`}</td>}
                        <td className={`pr-2 text-right font-bold tabular-nums ${vsAvg === null ? "text-slate-500" : vsAvg >= 0 ? "text-emerald-500" : "text-amber-500"}`}>{vsAvg === null ? "—" : `${vsAvg >= 0 ? "+" : ""}${vsAvg.toFixed(0)}%`}</td>
                        <td className="text-right tabular-nums">{r.total}{r.undated ? <span className="text-slate-500"> ({r.undated} s/ data)</span> : ""}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </div>
            <div>
              <div className="text-xs font-black text-slate-500 mb-2">Evolução no período · cada pessoa x média do setor</div>
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={trend} margin={{ left: -18, right: 10, top: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? "#1e293b" : "#f1f5f9"} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }} minTickGap={10} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip contentStyle={tt} />
                  <Legend wrapperStyle={{ fontSize: 11, fontWeight: 800 }} />
                  {chosen.map(p => <Line key={p} type="monotone" dataKey={p} stroke={colorOfP(p)} strokeWidth={2.5} dot={{ r: 3 }} animationDuration={800} />)}
                  <Line type="monotone" dataKey="média do setor" stroke={dark ? "#e2e8f0" : "#334155"} strokeWidth={2} strokeDasharray="5 4" dot={false} animationDuration={1000} />
                </LineChart>
              </ResponsiveContainer>
              <div className={`mt-3 p-3 rounded-xl text-xs ${dark ? "bg-gray-800/50 text-slate-400" : "bg-gray-50 text-slate-500"}`}>
                Média do setor no período: <b className={dark ? "text-white" : "text-gray-900"}>{avg.toFixed(1).replace(".", ",")}</b> itens por pessoa (só quem trabalhou).
                {undatedAll > 0 && <> · <b>{undatedAll}</b> registro(s) antigos sem data contam só no total — as datas passaram a ser gravadas em 26/10/2026.</>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
