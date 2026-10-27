import React, { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, Legend, LineChart, Line } from "recharts";
import { DollarSign, Package, TrendingUp, TrendingDown, AlertTriangle, Factory, CheckCircle, Users, Trophy, Clock, Sparkles, MapPin, Scissors } from "lucide-react";
import BrainAI from "../components/BrainAI";
import { sameSeller, moneyBR, dateBR, norm, orderNumber, sellerColorOf, aiSnapshot, todayStr, daysBetween } from "../lib/core";
import { clientUF, UF_NAMES } from "../lib/geo";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const STAGES = [["cutter", "Corte"], ["tailor", "Costura"], ["prep", "Preparação"], ["assembler", "Montagem"]];

function Kpi({ label, value, sub, icon: Icon, color, dark, onClick }) {
  return (
    <button onClick={onClick} className={`text-left rounded-2xl border p-4 transition-all hover:-translate-y-0.5 ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} ${onClick ? "cursor-pointer" : "cursor-default"}`} style={{ boxShadow: `inset 0 3px 0 ${color}` }}>
      <div className="flex items-center justify-between mb-1.5"><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span><Icon size={16} style={{ color }} /></div>
      <div className="text-2xl font-black tabular-nums" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] font-bold text-slate-500 mt-1 flex items-center gap-1">{sub}</div>}
    </button>
  );
}

function Panel({ title, icon: Icon, right, children, dark, className = "" }) {
  return (
    <div className={`rounded-2xl border p-5 ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} ${className}`}>
      <div className="flex items-center justify-between mb-4 gap-2"><h3 className="font-black text-base flex items-center gap-2">{Icon && <Icon size={17} className="text-orange-500" />}{title}</h3>{right}</div>
      {children}
    </div>
  );
}

export default function DashboardTab({ data, dark, goTo, persist, setData, user }) {
  const [sellerPeriod, setSellerPeriod] = useState("mes");
  const orders = data.orders || [];
  const prod = data.production || [];
  const fin = data.finalization || [];
  const today = todayStr();
  const now = new Date();
  const curM = mk(now), prevM = mk(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const m = useMemo(() => {
    const rev = (list) => list.reduce((a, o) => a + (Number(o.totalPrice) || 0), 0);
    const monthOrders = orders.filter(o => (o.createdAt || "").startsWith(curM));
    const prevOrders = orders.filter(o => (o.createdAt || "").startsWith(prevM));
    const open = orders.filter(o => o.status !== "concluido");
    const late = open.filter(o => o.deadline && o.deadline < today);
    const toys = (o) => (o.items || []).filter(it => !it.isMotor);
    const pctOf = (p) => STAGES.filter(([k]) => p?.[k]).length * 25;
    const inProd = orders.flatMap(o => toys(o).map(it => ({ o, it, p: prod.find(x => x.itemId === it.itemId) }))).filter(x => pctOf(x.p) < 100 && x.o.status !== "concluido");
    const finStage = (f) => f.stage || (f.done ? "finalizado" : "");
    const inFin = fin.filter(f => finStage(f) !== "finalizado");
    const doneMonth = fin.filter(f => finStage(f) === "finalizado" && (f.finDate || "").startsWith(curM)).length;

    // últimos 6 meses
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1); return { key: mk(d), label: `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` }; })
      .map(x => { const os = orders.filter(o => (o.createdAt || "").startsWith(x.key)); return { ...x, faturamento: rev(os), pedidos: os.length, brinquedos: os.reduce((a, o) => a + toys(o).length, 0) }; });

    // vendedores
    const sellerNames = [...new Set([...(data.sellers || []).map(s => s.name), ...orders.map(o => o.seller).filter(Boolean)])];
    const sellers = sellerNames.map(name => {
      const os = orders.filter(o => sameSeller(data.sellers, o.seller, name));
      const osM = os.filter(o => (o.createdAt || "").startsWith(curM));
      return { name, color: sellerColorOf(data, name), total: rev(os), month: rev(osM), orders: os.length, ordersMonth: osM.length, toys: os.reduce((a, o) => a + toys(o).length, 0), clients: new Set(os.map(o => norm(o.clientName))).size, open: os.filter(o => o.status !== "concluido").length };
    }).sort((a, b) => (sellerPeriod === "mes" ? b.month - a.month : b.total - a.total));

    // equipe de produção
    const team = (data.team || []).map(t => {
      const stages = {}; let total = 0;
      STAGES.forEach(([k, label]) => { const n = prod.filter(p => p[k] === t.name).length; if (n) { stages[label] = n; total += n; } });
      const finals = fin.filter(f => f.finalizer === t.name).length;
      const openNow = prod.filter(p => STAGES.some(([k]) => p[k] === t.name) && pctOf(p) < 100).length;
      return { ...t, stages, total: total + finals, finals, openNow };
    }).sort((a, b) => b.total - a.total);

    // funil
    const stageCount = STAGES.map(([k, label]) => ({ label, done: orders.flatMap(toys).filter(it => prod.find(p => p.itemId === it.itemId)?.[k]).length }));
    const allToys = orders.flatMap(toys).length;

    // top brinquedos / clientes
    const toyMap = {}; orders.forEach(o => toys(o).forEach(it => { const k = (it.toy || "").trim(); if (!k) return; toyMap[k] = toyMap[k] || { n: 0, v: 0 }; toyMap[k].n++; toyMap[k].v += Number(it.price) || 0; }));
    const topToys = Object.entries(toyMap).sort((a, b) => b[1].n - a[1].n).slice(0, 6);
    const clientMap = {}; orders.forEach(o => { const k = o.clientName || "—"; clientMap[k] = clientMap[k] || { n: 0, v: 0, last: "" }; clientMap[k].n++; clientMap[k].v += Number(o.totalPrice) || 0; if ((o.createdAt || "") > clientMap[k].last) clientMap[k].last = o.createdAt; });
    const topClients = Object.entries(clientMap).sort((a, b) => b[1].v - a[1].v).slice(0, 6);

    // próximas entregas
    const upcoming = open.filter(o => o.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 8);

    // estados
    const states = {}; orders.forEach(o => { const c = (data.clients || []).find(x => x.name === o.clientName); const uf = clientUF(c) || "—"; states[uf] = (states[uf] || 0) + (Number(o.totalPrice) || 0); });
    const topStates = Object.entries(states).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return { monthRev: rev(monthOrders), prevRev: rev(prevOrders), monthOrders, open, late, inProd, inFin, doneMonth, months, sellers, team, stageCount, allToys, topToys, topClients, upcoming, topStates, totalRev: rev(orders) };
  }, [data, sellerPeriod]); // eslint-disable-line

  const growth = m.prevRev > 0 ? ((m.monthRev - m.prevRev) / m.prevRev) * 100 : null;
  const ticket = m.monthOrders.length ? m.monthRev / m.monthOrders.length : 0;
  const tt = { backgroundColor: dark ? "#0f172a" : "#fff", border: `1px solid ${dark ? "#1e293b" : "#e2e8f0"}`, borderRadius: 12, fontSize: 12 };
  const maxSeller = Math.max(1, ...m.sellers.map(s => sellerPeriod === "mes" ? s.month : s.total));
  const go = (t) => goTo && goTo(t);

  return (
    <div className="space-y-5 animate-slide-up pb-10">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h2 className="page-title page-title-underline">Painel do Gerente</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">{MONTHS[now.getMonth()].toUpperCase()} {now.getFullYear()} · vendas, produção e equipe num lugar só</p>
        </div>
      </div>

      <BrainAI data={data} dark={dark} persist={persist || ((nd) => setData && setData(nd))} canWrite={user?.role === "admin" || user?.permissions?.dashboard === "edit" || (Array.isArray(user?.permissions) && user.permissions.includes("dashboard"))} />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi dark={dark} label="Faturamento do mês" value={moneyBR(m.monthRev)} color="#f97316" icon={DollarSign}
          sub={growth === null ? "sem mês anterior p/ comparar" : <>{growth >= 0 ? <TrendingUp size={12} className="text-emerald-500" /> : <TrendingDown size={12} className="text-red-500" />}{growth >= 0 ? "+" : ""}{growth.toFixed(1).replace(".", ",")}% vs {moneyBR(m.prevRev)}</>} />
        <Kpi dark={dark} label="Pedidos no mês" value={m.monthOrders.length} color="#3b82f6" icon={Package} sub={`ticket médio ${moneyBR(ticket)}`} onClick={() => go("orders")} />
        <Kpi dark={dark} label="Em aberto" value={m.open.length} color="#a855f7" icon={Clock} sub={<><AlertTriangle size={12} className={m.late.length ? "text-red-500" : "text-emerald-500"} />{m.late.length} atrasado(s)</>} onClick={() => go("orders")} />
        <Kpi dark={dark} label="Na produção" value={m.inProd.length} color="#eab308" icon={Factory} sub="brinquedos sendo feitos" onClick={() => go("production")} />
        <Kpi dark={dark} label="Na finalização" value={m.inFin.length} color="#14b8a6" icon={Sparkles} sub={`${m.doneMonth} finalizados no mês`} onClick={() => go("finalization")} />
        <Kpi dark={dark} label="Faturamento total" value={moneyBR(m.totalRev)} color="#22c55e" icon={CheckCircle} sub={`${(data.orders || []).length} pedidos no sistema`} />
      </div>

      <div>
        <div className="space-y-5">
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5 items-start">
          <Panel dark={dark} title="Faturamento e pedidos — últimos 6 meses" icon={TrendingUp}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={m.months} margin={{ left: 0, right: 8, top: 6 }}>
                <defs><linearGradient id="gFat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f97316" stopOpacity={0.45} /><stop offset="1" stopColor="#f97316" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? "#1e293b" : "#f1f5f9"} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12, fontWeight: 700 }} />
                <YAxis yAxisId="v" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : v} width={40} />
                <YAxis yAxisId="n" orientation="right" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} width={24} allowDecimals={false} />
                <Tooltip contentStyle={tt} formatter={(v, n) => n === "faturamento" ? [moneyBR(v), "Faturamento"] : [v, n === "pedidos" ? "Pedidos" : "Brinquedos"]} />
                <Area yAxisId="v" type="monotone" dataKey="faturamento" stroke="#f97316" strokeWidth={3} fill="url(#gFat)" animationDuration={900} />
                <Area yAxisId="n" type="monotone" dataKey="pedidos" stroke="#3b82f6" strokeWidth={2} fill="transparent" animationDuration={1100} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          <Panel dark={dark} title="Vendedores" icon={Trophy} right={
            <div className={`flex p-0.5 rounded-lg text-[11px] font-black ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
              {[["mes", "Este mês"], ["total", "Tudo"]].map(([k, l]) => <button key={k} onClick={() => setSellerPeriod(k)} className={`px-2.5 py-1 rounded-md ${sellerPeriod === k ? "bg-orange-500 text-white" : "text-slate-500"}`}>{l}</button>)}
            </div>}>
            {m.sellers.length === 0 && <p className="text-sm text-slate-500">Nenhum vendedor ainda. Eles são cadastrados automaticamente quando entram pedidos.</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {m.sellers.map((s, i) => {
                const val = sellerPeriod === "mes" ? s.month : s.total;
                return (
                  <div key={s.name} className={`rounded-xl p-3 border ${dark ? "border-gray-800 bg-gray-800/30" : "border-gray-100 bg-gray-50"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm text-white flex-shrink-0" style={{ background: s.color, boxShadow: `0 6px 14px ${s.color}55` }}>{i + 1}º</div>
                        <div className="min-w-0"><div className="font-black text-sm truncate" style={{ color: s.color }}>{s.name}</div><div className="text-[10px] font-bold text-slate-500">{sellerPeriod === "mes" ? `${s.ordersMonth} pedidos no mês` : `${s.orders} pedidos · ${s.clients} clientes`}</div></div>
                      </div>
                      <div className="font-black text-sm tabular-nums">{moneyBR(val)}</div>
                    </div>
                    <div className={`mt-2 h-2 rounded-full overflow-hidden ${dark ? "bg-gray-800" : "bg-gray-200"}`}><div className="h-full rounded-full" style={{ width: `${(val / maxSeller) * 100}%`, background: s.color, transition: "width .8s cubic-bezier(.2,.8,.2,1)" }} /></div>
                    <div className="flex gap-3 mt-1.5 text-[10px] font-bold text-slate-500"><span>{s.toys} brinquedos</span><span>{s.open} em aberto</span><span>total {moneyBR(s.total)}</span></div>
                  </div>
                );
              })}
            </div>
          </Panel>

          </div>
          <TeamPerformance data={data} dark={dark} goTo={go} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Panel dark={dark} title="Esteira de produção" icon={Factory}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={m.stageCount} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <XAxis type="number" hide domain={[0, Math.max(1, m.allToys)]} />
                  <YAxis type="category" dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12, fontWeight: 700 }} width={80} />
                  <Tooltip contentStyle={tt} formatter={(v) => [`${v} de ${m.allToys} brinquedos`, "Etapa feita"]} cursor={{ fill: "transparent" }} />
                  <Bar dataKey="done" radius={[0, 8, 8, 0]} barSize={22} animationDuration={900} background={{ fill: dark ? "#1f2937" : "#f1f5f9", radius: 8 }}>
                    {m.stageCount.map((_, i) => <Cell key={i} fill={["#3b82f6", "#a855f7", "#f59e0b", "#22c55e"][i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <Panel dark={dark} title="Próximas entregas" icon={Clock}>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                {m.upcoming.length === 0 && <p className="text-sm text-slate-500">Nenhuma entrega em aberto.</p>}
                {m.upcoming.map(o => {
                  const d = daysBetween(today, o.deadline);
                  return (
                    <div key={o.id} className="flex items-center gap-2 text-sm">
                      <span className="font-black tabular-nums w-14">Nº{orderNumber(o.id)}</span>
                      <span className="flex-1 truncate font-semibold">{o.clientName}</span>
                      <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${d < 0 ? "bg-red-500/15 text-red-500" : d <= 3 ? "bg-amber-500/15 text-amber-500" : "bg-sky-500/15 text-sky-500"}`}>{d < 0 ? `${-d}d atrasado` : d === 0 ? "hoje" : `${d}d`}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Panel dark={dark} title="Mais vendidos" icon={Package}>
              <div className="space-y-2">{m.topToys.map(([n, v]) => <div key={n} className="flex justify-between text-sm gap-2"><span className="truncate font-semibold">{n}</span><span className="font-black">{v.n}x</span></div>)}{!m.topToys.length && <p className="text-sm text-slate-500">—</p>}</div>
            </Panel>
            <Panel dark={dark} title="Melhores clientes" icon={Users}>
              <div className="space-y-2">{m.topClients.map(([n, v]) => <div key={n} className="flex justify-between text-sm gap-2"><span className="truncate font-semibold">{n}</span><span className="font-black tabular-nums">{moneyBR(v.v)}</span></div>)}{!m.topClients.length && <p className="text-sm text-slate-500">—</p>}</div>
            </Panel>
            <Panel dark={dark} title="Estados" icon={MapPin} right={<button onClick={() => go("routes")} className="text-[11px] font-black text-orange-500 hover:underline">Ver mapa</button>}>
              <div className="space-y-2">{m.topStates.map(([uf, v]) => <div key={uf} className="flex justify-between text-sm gap-2"><span className="truncate font-semibold">{uf === "—" ? "Sem estado" : UF_NAMES[uf] || uf}</span><span className="font-black tabular-nums">{moneyBR(v)}</span></div>)}{!m.topStates.length && <p className="text-sm text-slate-500">—</p>}</div>
            </Panel>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Rendimento da equipe: cada pessoa comparada com ela mesma (mês a mês) e com o setor ──
const SECTORS = [["cutter", "Corte"], ["tailor", "Costura"], ["prep", "Preparação"], ["assembler", "Montagem"], ["fin", "Finalização"]];
function TeamPerformance({ data, dark, goTo }) {
  const now = new Date();
  const [sector, setSector] = useState("tailor");
  const [month, setMonth] = useState(mk(now));
  const [focus, setFocus] = useState("");
  const shift = (m, d) => { const [y, mm] = m.split("-").map(Number); return mk(new Date(y, mm - 1 + d, 1)); };
  const label = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
  const prevM = shift(month, -1);
  const months6 = Array.from({ length: 6 }, (_, i) => shift(month, i - 5));

  // registros: { pessoa, mes|null }
  const records = useMemo(() => {
    const out = [];
    if (sector === "fin") (data.finalization || []).forEach(f => { const st = f.stage || (f.done ? "finalizado" : ""); if (f.finalizer && st === "finalizado") out.push({ p: f.finalizer, m: (f.finDate || "").slice(0, 7) || null }); });
    else (data.production || []).forEach(p => { if (p[sector]) out.push({ p: p[sector], m: (p[`${sector}At`] || "").slice(0, 7) || null }); });
    return out;
  }, [data, sector]);
  const roleName = SECTORS.find(s => s[0] === sector)[1];
  const roleMatch = (t) => sector === "fin" ? t.role === "Finalizador" : sector === "assembler" ? ["Montagem", "Preparação"].includes(t.role) : t.role === roleName;
  const people = [...new Set([...(data.team || []).filter(roleMatch).map(t => t.name), ...records.map(r => r.p)])];
  const count = (p, m) => records.filter(r => r.p === p && r.m === m).length;
  const rows = people.map(p => {
    const cur = count(p, month), prev = count(p, prevM);
    return { p, cur, prev, total: records.filter(r => r.p === p).length, undated: records.filter(r => r.p === p && !r.m).length, var: prev ? ((cur - prev) / prev) * 100 : null };
  }).sort((a, b) => b.cur - a.cur || b.total - a.total);
  const active = rows.filter(r => r.cur > 0);
  const avg = active.length ? active.reduce((s, r) => s + r.cur, 0) / active.length : 0;
  const undatedAll = records.filter(r => !r.m).length;
  const chart = rows.map(r => ({ nome: r.p.split(" ")[0], [label(month)]: r.cur, [label(prevM)]: r.prev }));
  const who = focus || rows[0]?.p || "";
  const trend = months6.map(m => {
    const per = people.map(p => count(p, m)).filter(n => n > 0);
    return { mes: label(m), [who || "pessoa"]: who ? count(who, m) : 0, "média do setor": per.length ? +(per.reduce((s, n) => s + n, 0) / per.length).toFixed(1) : 0 };
  });
  const tt = { backgroundColor: dark ? "#0f172a" : "#fff", border: `1px solid ${dark ? "#1e293b" : "#e2e8f0"}`, borderRadius: 12, fontSize: 12 };
  const card = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const inp = `px-2.5 py-1.5 rounded-lg text-xs font-bold border outline-none ${dark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200"}`;

  return (
    <div className={`rounded-2xl border p-5 ${card}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <h3 className="font-black text-base flex items-center gap-2"><Scissors size={17} className="text-orange-500" />Rendimento da equipe</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex p-0.5 rounded-lg ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
            {SECTORS.map(([k, l]) => <button key={k} onClick={() => { setSector(k); setFocus(""); }} className={`px-2.5 py-1 rounded-md text-[11px] font-black ${sector === k ? "bg-orange-500 text-white" : "text-slate-500"}`}>{l}</button>)}
          </div>
          <div className="flex items-center gap-1"><button onClick={() => setMonth(shift(month, -1))} className="px-1.5 font-black text-slate-400">‹</button><input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} className={inp} /><button onClick={() => setMonth(shift(month, 1))} className="px-1.5 font-black text-slate-400">›</button></div>
          <button onClick={() => goTo && goTo("team")} className="text-[11px] font-black text-orange-500 hover:underline">Gerenciar equipe</button>
        </div>
      </div>

      {people.length === 0 ? <p className="text-sm text-slate-500">Ninguém cadastrado em {roleName}. Cadastre na aba Equipe.</p> : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div>
            <div className="text-xs font-black text-slate-500 mb-2">{roleName}: {label(month)} x {label(prevM)} (itens feitos)</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chart} margin={{ left: -18, right: 6, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? "#1e293b" : "#f1f5f9"} />
                <XAxis dataKey="nome" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip contentStyle={tt} cursor={{ fill: dark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.03)" }} />
                <Legend wrapperStyle={{ fontSize: 11, fontWeight: 800 }} />
                <Bar dataKey={label(prevM)} fill={dark ? "#475569" : "#cbd5e1"} radius={[5, 5, 0, 0]} animationDuration={700} />
                <Bar dataKey={label(month)} fill="#f97316" radius={[5, 5, 0, 0]} animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead><tr className="text-slate-500 text-left"><th className="py-1.5 pr-2">Pessoa</th><th className="pr-2 text-right">{label(month)}</th><th className="pr-2 text-right">{label(prevM)}</th><th className="pr-2 text-right">Variação</th><th className="pr-2 text-right">vs média</th><th className="text-right">Total</th></tr></thead>
                <tbody>{rows.map(r => {
                  const vsAvg = avg && r.cur ? ((r.cur - avg) / avg) * 100 : null;
                  return (
                    <tr key={r.p} onClick={() => setFocus(r.p)} className={`cursor-pointer border-t ${dark ? "border-gray-800 hover:bg-gray-800/50" : "border-gray-100 hover:bg-gray-50"} ${who === r.p ? "text-orange-500" : ""}`}>
                      <td className="py-1.5 pr-2 font-bold truncate max-w-[140px]">{r.p}</td>
                      <td className="pr-2 text-right font-black tabular-nums">{r.cur}</td>
                      <td className="pr-2 text-right tabular-nums text-slate-500">{r.prev}</td>
                      <td className={`pr-2 text-right font-black tabular-nums ${r.var === null ? "text-slate-500" : r.var >= 0 ? "text-emerald-500" : "text-red-500"}`}>{r.var === null ? (r.cur ? "novo" : "—") : `${r.var >= 0 ? "▲" : "▼"} ${Math.abs(r.var).toFixed(0)}%`}</td>
                      <td className={`pr-2 text-right font-bold tabular-nums ${vsAvg === null ? "text-slate-500" : vsAvg >= 0 ? "text-emerald-500" : "text-amber-500"}`}>{vsAvg === null ? "—" : `${vsAvg >= 0 ? "+" : ""}${vsAvg.toFixed(0)}%`}</td>
                      <td className="text-right tabular-nums">{r.total}{r.undated ? <span className="text-slate-500"> ({r.undated} s/ data)</span> : ""}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="text-xs font-black text-slate-500">Evolução de <span className="text-orange-500">{who || "—"}</span> x média do setor (6 meses)</div>
              <select value={who} onChange={e => setFocus(e.target.value)} className={inp}>{rows.map(r => <option key={r.p} value={r.p}>{r.p}</option>)}</select>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend} margin={{ left: -18, right: 10, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? "#1e293b" : "#f1f5f9"} />
                <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip contentStyle={tt} />
                <Legend wrapperStyle={{ fontSize: 11, fontWeight: 800 }} />
                <Line type="monotone" dataKey={who || "pessoa"} stroke="#f97316" strokeWidth={3} dot={{ r: 4 }} animationDuration={900} />
                <Line type="monotone" dataKey="média do setor" stroke="#38bdf8" strokeWidth={2} strokeDasharray="5 4" dot={false} animationDuration={1100} />
              </LineChart>
            </ResponsiveContainer>
            <div className={`mt-3 p-3 rounded-xl text-xs ${dark ? "bg-gray-800/50 text-slate-400" : "bg-gray-50 text-slate-500"}`}>
              Média do setor em {label(month)}: <b className={dark ? "text-white" : "text-gray-900"}>{avg.toFixed(1).replace(".", ",")}</b> itens por pessoa (só quem trabalhou no mês).
              {undatedAll > 0 && <> · <b>{undatedAll}</b> registro(s) antigos sem data contam só no total — as datas passaram a ser gravadas em 26/10/2026.</>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
