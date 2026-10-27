import React, { useEffect, useMemo, useState } from "react";
import { Crown, Loader2, RefreshCw, Search, Save, Lock } from "lucide-react";
import { api } from "../lib/api";
import { PLANS } from "../lib/plans";

// ── Painel do criador ─────────────────────────────────────────────────────────
// Só aparece para a conta do criador do Inflatudo. Lista todas as fábricas e deixa
// mudar plano, situação, fim do teste e pacotes extras. O servidor confere de novo.

const PLAN_OPTS = ["free", "essencial", "pro", "ultra"];
const STATUS_OPTS = [["active", "Ativo"], ["trial", "Teste"], ["overdue", "Atrasado"], ["canceled", "Cancelado"], ["blocked", "Bloqueado"]];
const lim = (v) => (v == null ? "∞" : Number(v).toLocaleString("pt-BR"));
const dateIn = (iso) => { try { return iso ? new Date(iso).toISOString().slice(0, 10) : ""; } catch { return ""; } };

function Row({ c, dark, onSaved }) {
  const isCreator = c.plan_id === "creator";
  const [f, setF] = useState({ plan_id: c.plan_id, status: c.status || "active", trial: dateIn(c.trial_ends_at), eo: c.extras?.orders || 0, ep: c.extras?.photos || 0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const dirty = (c.legacy && !isCreator) || f.plan_id !== c.plan_id || f.status !== (c.status || "active") || f.trial !== dateIn(c.trial_ends_at) || Number(f.eo) !== (c.extras?.orders || 0) || Number(f.ep) !== (c.extras?.photos || 0);
  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await api("creatorUpdate", {
        companyId: c.company_id,
        plan_id: isCreator ? undefined : f.plan_id,
        status: f.status,
        trial_ends_at: f.trial ? new Date(`${f.trial}T23:59:59-03:00`).toISOString() : undefined,
        extras: { orders: Number(f.eo) || 0, photos: Number(f.ep) || 0 },
      });
      setMsg("Salvo"); onSaved();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };
  const sel = `rounded-lg px-2 py-1.5 text-sm border outline-none ${dark ? "bg-gray-950 border-gray-700 text-white" : "bg-white border-gray-300"}`;
  const u = c.usage || {}, l = c.limits || {};
  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-black flex items-center gap-2">{isCreator && <Crown size={16} className="text-amber-500" />}{c.company_name || "Sem nome"}{c.legacy && <span title="Conta de antes dos planos: tudo liberado até você escolher um plano e salvar" className="text-[11px] font-bold px-2 py-0.5 rounded bg-sky-500/15 text-sky-500">Antiga · sem plano definido</span>}{c.locked && <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-red-500/15 text-red-500 flex items-center gap-1"><Lock size={11} />Travada</span>}</div>
          <div className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>{c.admin_email} · criada em {c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "—"}{c.daysLeft != null && f.plan_id === "free" ? ` · ${c.daysLeft} dia(s) de teste` : ""}</div>
        </div>
        <div className={`text-xs font-semibold flex gap-3 ${dark ? "text-gray-300" : "text-gray-600"}`}>
          <span>Pedidos {lim(u.orders)}/{lim(l.orders)}</span><span>Fotos {lim(u.photos)}/{lim(l.photos)}</span><span>Usuários {lim(u.users)}/{lim(l.users)}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-bold space-y-1"><div className="opacity-70">Plano</div>
          {isCreator ? <div className="px-2 py-1.5 text-sm font-black text-amber-500">Criador</div>
            : <select value={f.plan_id} onChange={e => setF({ ...f, plan_id: e.target.value })} className={sel}>{PLAN_OPTS.map(p => <option key={p} value={p}>{PLANS[p]?.label || p}</option>)}</select>}
        </label>
        <label className="text-xs font-bold space-y-1"><div className="opacity-70">Situação</div>
          <select value={f.status} onChange={e => setF({ ...f, status: e.target.value })} className={sel}>{STATUS_OPTS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        </label>
        <label className="text-xs font-bold space-y-1"><div className="opacity-70">Fim do teste</div><input type="date" value={f.trial} onChange={e => setF({ ...f, trial: e.target.value })} className={sel} /></label>
        <label className="text-xs font-bold space-y-1"><div className="opacity-70">+ Pedidos extras</div><input type="number" min="0" step="50" value={f.eo} onChange={e => setF({ ...f, eo: e.target.value })} className={`${sel} w-28`} /></label>
        <label className="text-xs font-bold space-y-1"><div className="opacity-70">+ Fotos extras</div><input type="number" min="0" step="500" value={f.ep} onChange={e => setF({ ...f, ep: e.target.value })} className={`${sel} w-28`} /></label>
        <button disabled={!dirty || busy} onClick={save} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 text-white font-bold text-sm disabled:opacity-40">{busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}Salvar</button>
        {msg && <span className={`text-xs font-bold ${msg === "Salvo" ? "text-emerald-500" : "text-red-500"}`}>{msg}</span>}
      </div>
    </div>
  );
}

export default function CreatorTab({ dark }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const load = async () => {
    setErr("");
    try { setList((await api("creatorList")).companies || []); } catch (e) { setErr(e.message); setList([]); }
  };
  useEffect(() => { load(); }, []);
  const shown = useMemo(() => (list || []).filter(c => !q || `${c.company_name} ${c.admin_email}`.toLowerCase().includes(q.toLowerCase())), [list, q]);
  const count = (p) => (list || []).filter(c => c.plan_id === p).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black flex items-center gap-2"><Crown className="text-amber-500" />Painel do criador</h2>
          <p className={`text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>{list ? `${list.length} empresas · Free ${count("free")} · Essencial ${count("essencial")} · PRO ${count("pro")} · Ultra ${count("ultra")}` : "Carregando..."}</p>
        </div>
        <button onClick={() => { setList(null); load(); }} className={`flex items-center gap-2 px-3 py-2 rounded-xl border font-bold text-sm ${dark ? "border-gray-700" : "border-gray-300"}`}><RefreshCw size={15} />Atualizar</button>
      </div>
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}><Search size={16} className="opacity-50" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Procurar empresa ou e-mail" className="bg-transparent outline-none flex-1 text-sm" /></div>
      {err && <div className="text-sm text-red-500 font-semibold">{err}</div>}
      {!list ? <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-orange-500" /></div>
        : <div className="space-y-3">{shown.map(c => <Row key={c.company_id} c={c} dark={dark} onSaved={load} />)}</div>}
    </div>
  );
}
