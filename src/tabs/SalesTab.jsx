import React, { useMemo, useState } from "react";
import { Users, Package, DollarSign, Phone, Search, Calendar, MessageCircle, TrendingUp, Layers, Star, X, Edit3, Check, Clock } from "lucide-react";
import AIChat from "../components/AIChat";
import { moneyBR, dateBR, norm, orderNumber, sellerColorOf, aiSnapshot, todayStr, daysBetween, whatsappLink, matchQuery, orderHaystack } from "../lib/core";
import { clientUF } from "../lib/geo";

const STATUS_LABEL = { aguardando: "Aguardando", producao: "Em produção", concluido: "Concluído" };
const CRM_STAGES = [
  ["novo", "Cliente novo", "#3b82f6"],
  ["negociando", "Negociando", "#eab308"],
  ["posvenda", "Pós-venda", "#14b8a6"],
  ["recompra", "Oportunidade de recompra", "#22c55e"],
  ["frio", "Esfriou", "#94a3b8"],
];
const stageInfo = (k) => CRM_STAGES.find(s => s[0] === k) || null;

const canEditSales = (user) => {
  if (!user) return false;
  if (user.role === "admin") return true;
  const p = user.permissions;
  if (Array.isArray(p)) return p.includes("sales");
  return p?.sales === "edit";
};

// Situação automática do cliente pelo tempo desde a última compra
function health(days, orders) {
  if (days === null) return { label: "Sem compras", color: "#94a3b8" };
  if (orders === 1 && days <= 30) return { label: "Novo", color: "#3b82f6" };
  if (days <= 90) return { label: "Ativo", color: "#22c55e" };
  if (days <= 180) return { label: "Esfriando", color: "#eab308" };
  return { label: "Inativo", color: "#ef4444" };
}

export default function SalesTab({ data, setData, persist, dark, user }) {
  const locked = user?.role !== "admin" && user?.sellerName;
  const sellerList = (data.sellers || []).map(s => s.name);
  const [chosen, setChosen] = useState(locked || sellerList[0] || "");
  const seller = locked || chosen;
  const [tab, setTab] = useState("crm");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("todos");
  const [editing, setEditing] = useState(null);
  const canEdit = canEditSales(user);
  const save = (nd) => (persist ? persist(nd) : setData(nd));
  const color = sellerColorOf(data, seller);
  const today = todayStr();
  const curM = today.slice(0, 7);

  const mine = useMemo(() => (data.orders || []).filter(o => norm(o.seller) === norm(seller)), [data.orders, seller]);
  const clients = useMemo(() => {
    const map = new Map();
    mine.forEach(o => {
      const k = norm(o.clientName);
      if (!map.has(k)) map.set(k, { name: o.clientName, orders: [] });
      map.get(k).orders.push(o);
    });
    return [...map.values()].map(c => {
      const info = (data.clients || []).find(x => norm(x.name) === norm(c.name)) || {};
      const sorted = [...c.orders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const last = sorted[0]?.createdAt || null;
      const days = last ? daysBetween(last, today) : null;
      const toys = c.orders.reduce((a, o) => a + (o.items || []).filter(it => !it.isMotor).length, 0);
      return { ...c, info, last, days, toys, total: c.orders.reduce((a, o) => a + (Number(o.totalPrice) || 0), 0), open: c.orders.filter(o => o.status !== "concluido").length, h: health(days, c.orders.length), crm: info.crm || {} };
    }).sort((a, b) => b.total - a.total);
  }, [mine, data.clients]); // eslint-disable-line

  const kpi = {
    total: mine.reduce((a, o) => a + (Number(o.totalPrice) || 0), 0),
    month: mine.filter(o => (o.createdAt || "").startsWith(curM)).reduce((a, o) => a + (Number(o.totalPrice) || 0), 0),
    orders: mine.length, open: mine.filter(o => o.status !== "concluido").length,
    toys: mine.reduce((a, o) => a + (o.items || []).filter(it => !it.isMotor).length, 0),
    clients: clients.length,
  };
  const toContact = clients.filter(c => c.crm.next && c.crm.next <= today);

  const filtered = clients.filter(c => {
    if (filter === "contatar" && !(c.crm.next && c.crm.next <= today)) return false;
    if (filter === "esfriando" && !["Esfriando", "Inativo"].includes(c.h.label)) return false;
    if (filter === "abertos" && !c.open) return false;
    if (!q.trim()) return true;
    const hay = norm([c.name, c.info.city, c.info.state, c.info.phone, c.crm.notes, ...c.orders.map(o => orderHaystack(o))].join(" "));
    return matchQuery(hay, "", q);
  });

  const saveCrm = (clientName, patch) => {
    const list = [...(data.clients || [])];
    const idx = list.findIndex(x => norm(x.name) === norm(clientName));
    if (idx >= 0) list[idx] = { ...list[idx], ...(patch.phone !== undefined ? { phone: patch.phone } : {}), crm: { ...(list[idx].crm || {}), ...patch.crm } };
    else list.push({ id: Date.now(), name: clientName, city: "", state: "", phone: patch.phone || "", email: "", crm: patch.crm || {} });
    save({ ...data, clients: list });
  };

  const card = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const inp = `px-3 py-2 rounded-xl text-sm border outline-none ${dark ? "bg-gray-800 text-white border-gray-700" : "bg-white border-gray-200 text-gray-900"} focus:border-orange-500`;

  if (!seller) return (
    <div className={`rounded-2xl border p-10 text-center ${card}`}><Users size={36} className="mx-auto mb-3 opacity-40" /><p className="font-bold">Nenhum vendedor cadastrado ainda.</p><p className="text-sm text-slate-500">Eles aparecem aqui automaticamente quando entram pedidos com representante.</p></div>
  );

  return (
    <div className="space-y-5 animate-slide-up pb-10">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="page-title page-title-underline">Área do Vendedor</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">Seus clientes, suas vendas e quem chamar hoje</p>
        </div>
        {locked ? (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl font-black" style={{ background: `${color}22`, color }}>● {seller}</div>
        ) : (
          <div className="flex gap-1.5 flex-wrap">
            {sellerList.map(n => { const c = sellerColorOf(data, n); const on = n === seller; return <button key={n} onClick={() => setChosen(n)} className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${on ? "text-white" : ""}`} style={on ? { background: c, borderColor: c, boxShadow: `0 6px 16px ${c}55` } : { borderColor: `${c}55`, color: c }}>{n}</button>; })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[["Vendido no mês", moneyBR(kpi.month), DollarSign, color], ["Total vendido", moneyBR(kpi.total), TrendingUp, "#22c55e"], ["Pedidos", kpi.orders, Package, "#3b82f6"], ["Em aberto", kpi.open, Clock, "#a855f7"], ["Brinquedos vendidos", kpi.toys, Layers, "#f97316"], ["Clientes", kpi.clients, Users, "#14b8a6"]].map(([l, v, I, c]) => (
          <div key={l} className={`rounded-2xl border p-4 ${card}`} style={{ boxShadow: `inset 0 3px 0 ${c}` }}>
            <div className="flex items-center justify-between mb-1"><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{l}</span><I size={15} style={{ color: c }} /></div>
            <div className="text-xl font-black tabular-nums" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {toContact.length > 0 && (
        <div className="rounded-2xl p-4 border border-emerald-500/30 bg-emerald-500/10 flex items-center gap-3 flex-wrap">
          <Calendar size={18} className="text-emerald-500" />
          <span className="font-black text-sm">Chamar hoje:</span>
          {toContact.map(c => { const wa = whatsappLink(c.info.phone, `Oi ${c.name}! 👋 Tudo bem? Aqui é ${seller}. 🎈`); return wa
            ? <a key={c.name} href={wa} target="_blank" rel="noreferrer" className="px-3 py-1 rounded-full bg-[#25D366] text-white text-xs font-black">💬 {c.name}</a>
            : <span key={c.name} className="px-3 py-1 rounded-full bg-gray-500/20 text-xs font-black">{c.name}</span>; })}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-4">
          <div className={`flex gap-1 p-1 rounded-xl border w-fit ${card}`}>
            {[["crm", "Meus clientes"], ["pedidos", "Minhas vendas"]].map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-xs font-black ${tab === k ? "text-white" : "text-slate-500"}`} style={tab === k ? { background: color } : {}}>{l}</button>)}
          </div>

          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente, cidade, brinquedo, nº do pedido…" className={`${inp} w-full pl-9`} />
          </div>

          {tab === "crm" && (
            <>
              <div className="flex gap-1.5 flex-wrap">
                {[["todos", `Todos (${clients.length})`], ["contatar", `Chamar hoje (${toContact.length})`], ["esfriando", "Esfriando / inativos"], ["abertos", "Com pedido em aberto"]].map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${filter === k ? "bg-orange-500 text-white" : dark ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-600"}`}>{l}</button>)}
              </div>
              <div className="space-y-3">
                {filtered.map(c => {
                  const wa = whatsappLink(c.info.phone, `Oi ${c.name}! 👋 Aqui é ${seller}, tudo bem? 🎈 Passando pra saber como estão os brinquedos e se posso te ajudar com algo novo! 😊`);
                  const st = stageInfo(c.crm.stage);
                  return (
                    <div key={c.name} className={`rounded-2xl border p-4 ${card}`}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-base">{c.name}</span>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: `${c.h.color}22`, color: c.h.color }}>{c.h.label}</span>
                            {st && <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: `${st[2]}22`, color: st[2] }}>{st[1]}</span>}
                          </div>
                          <div className="text-xs text-slate-500 font-semibold mt-0.5">{[c.info.city, clientUF(c.info)].filter(Boolean).join(" - ") || "Cidade não informada"} · {c.info.phone || "sem telefone"}</div>
                          <div className="text-xs font-bold mt-1.5 flex gap-3 flex-wrap">
                            <span>{c.orders.length} pedido{c.orders.length > 1 ? "s" : ""}</span><span>{c.toys} brinquedo{c.toys !== 1 ? "s" : ""}</span><span className="text-emerald-500">{moneyBR(c.total)}</span>
                            <span className="text-slate-500">última compra {dateBR(c.last)}{c.days !== null ? ` (${c.days}d)` : ""}</span>
                          </div>
                          {c.crm.next && <div className={`text-xs font-bold mt-1 ${c.crm.next <= today ? "text-emerald-500" : "text-slate-500"}`}>📅 Próximo contato: {dateBR(c.crm.next)}</div>}
                          {c.crm.notes && <div className={`text-xs mt-1.5 p-2 rounded-lg ${dark ? "bg-gray-800 text-gray-300" : "bg-gray-50 text-gray-600"}`}>📝 {c.crm.notes}</div>}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {wa ? <a href={wa} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl bg-[#25D366] text-white text-sm font-black flex items-center gap-1.5 shadow-lg shadow-green-500/20 hover:-translate-y-0.5 transition-all">💬 WhatsApp</a>
                            : <span className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 border border-dashed border-slate-500/40">sem WhatsApp</span>}
                          {canEdit && <button onClick={() => setEditing(c)} className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1 ${dark ? "border-gray-700" : "border-gray-300"}`}><Edit3 size={13} />CRM</button>}
                        </div>
                      </div>
                      <div className="flex gap-1.5 flex-wrap mt-3">
                        {c.orders.slice(0, 6).map(o => <span key={o.id} className={`text-[11px] font-bold px-2 py-1 rounded-lg ${dark ? "bg-gray-800" : "bg-gray-100"}`}>Nº{orderNumber(o.id)} · {STATUS_LABEL[o.status] || o.status} · {moneyBR(o.totalPrice)}</span>)}
                      </div>
                    </div>
                  );
                })}
                {filtered.length === 0 && <div className={`rounded-2xl border p-10 text-center text-slate-500 ${card}`}>Nenhum cliente neste filtro.</div>}
              </div>
            </>
          )}

          {tab === "pedidos" && (
            <div className="space-y-2.5">
              {[...mine].filter(o => !q.trim() || matchQuery(orderHaystack(o), o.id, q)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(o => {
                const toys = (o.items || []).filter(it => !it.isMotor); const motors = (o.items || []).length - toys.length;
                return (
                  <div key={o.id} className={`rounded-2xl border p-4 ${card}`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="font-black text-2xl tabular-nums leading-none"><span className="text-orange-500 text-base">Nº</span>{orderNumber(o.id)}</div>
                        <div className="font-bold mt-1">{o.clientName}</div>
                        <div className="text-xs text-slate-500 font-semibold">{dateBR(o.createdAt)} · prazo {dateBR(o.deadline)} · {toys.length} brinquedo(s){motors ? ` + ${motors} motor(es)` : ""}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-lg tabular-nums">{moneyBR(o.totalPrice)}</div>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${o.status === "concluido" ? "bg-emerald-500/15 text-emerald-500" : o.status === "producao" ? "bg-amber-500/15 text-amber-500" : "bg-sky-500/15 text-sky-500"}`}>{STATUS_LABEL[o.status] || o.status}</span>
                      </div>
                    </div>
                    <div className="text-xs mt-2 text-slate-500">{toys.map(t => t.toy).join(" · ")}</div>
                  </div>
                );
              })}
              {mine.length === 0 && <div className={`rounded-2xl border p-10 text-center text-slate-500 ${card}`}>Nenhuma venda ainda.</div>}
            </div>
          )}
        </div>

        <div className="xl:sticky xl:top-0 self-start w-full">
          <AIChat key={seller} dark={dark} accent={color} title={`IA de vendas de ${seller}`} subtitle="Pergunte sobre seus clientes e vendas" height={480} storageKey={`chat-vendas-${norm(seller)}`}
            system={`Você é o assistente comercial (CRM) do vendedor ${seller}, numa fábrica de brinquedos infláveis. Use SOMENTE os dados deste vendedor. Ajude a decidir quem chamar, quando oferecer recompra, quais clientes estão esfriando, e escreva mensagens de WhatsApp curtas e simpáticas com emojis quando pedirem.`}
            buildContext={() => aiSnapshot(data, { sellerName: seller })}
            suggestions={["Quem eu devo chamar esta semana e por quê?", "Quais clientes estão esfriando?", "Escreva uma mensagem de WhatsApp de recompra para meu melhor cliente", "Quanto vendi este mês comparado ao mês passado?", "Quais brinquedos eu mais vendo?"]} />
        </div>
      </div>

      {editing && <CrmModal c={editing} dark={dark} inp={inp} onClose={() => setEditing(null)} onSave={(patch) => { saveCrm(editing.name, patch); setEditing(null); }} />}
    </div>
  );
}

function CrmModal({ c, dark, inp, onClose, onSave }) {
  const [stage, setStage] = useState(c.crm.stage || "");
  const [next, setNext] = useState(c.crm.next || "");
  const [notes, setNotes] = useState(c.crm.notes || "");
  const [phone, setPhone] = useState(c.info.phone || "");
  const quick = (d) => { const t = new Date(); t.setDate(t.getDate() + d); setNext(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`); };
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className={`w-full max-w-md rounded-2xl border p-5 space-y-3 animate-slide-up ${dark ? "bg-gray-900 border-gray-700 text-white" : "bg-white border-gray-200"}`}>
        <div className="flex items-center justify-between"><h3 className="font-black text-lg">{c.name}</h3><button onClick={onClose} className="opacity-60 hover:opacity-100"><X size={18} /></button></div>
        <div><label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500">WhatsApp</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-0000" className={`${inp} w-full`} /></div>
        <div><label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500">Etapa</label>
          <div className="flex flex-wrap gap-1.5">{CRM_STAGES.map(([k, l, col]) => <button key={k} onClick={() => setStage(stage === k ? "" : k)} className="px-2.5 py-1 rounded-lg text-xs font-bold border" style={stage === k ? { background: col, color: "#fff", borderColor: col } : { borderColor: `${col}66`, color: col }}>{l}</button>)}</div></div>
        <div><label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500">Próximo contato</label>
          <div className="flex gap-1.5 flex-wrap items-center"><input type="date" value={next} onChange={e => setNext(e.target.value)} className={inp} />{[["Amanhã", 1], ["1 semana", 7], ["1 mês", 30]].map(([l, d]) => <button key={l} onClick={() => quick(d)} className="px-2 py-1 rounded-lg text-xs font-bold text-orange-500">{l}</button>)}{next && <button onClick={() => setNext("")} className="text-xs text-slate-500">limpar</button>}</div></div>
        <div><label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500">Anotações</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Ex.: quer orçamento de tobogã para dezembro" className={`${inp} w-full resize-none`} /></div>
        <button onClick={() => onSave({ phone, crm: { stage, next, notes } })} className="w-full py-2.5 rounded-xl text-sm font-black text-white flex items-center justify-center gap-1" style={{ background: "linear-gradient(135deg,#f97316,#eab308)" }}><Check size={15} />Salvar</button>
      </div>
    </div>
  );
}
