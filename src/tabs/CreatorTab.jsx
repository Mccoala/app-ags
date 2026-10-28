import React, { useEffect, useMemo, useState } from "react";
import { Crown, Loader2, RefreshCw, Search, Save, Lock, KeyRound, Link2, Check, Eye, EyeOff, DollarSign } from "lucide-react";
import { api } from "../lib/api";
import { PLANS } from "../lib/plans";
import { dBR } from "../components/PlanUI";

// ── Painel do criador ─────────────────────────────────────────────────────────
// Só aparece para a conta do criador do Inflatudo. Lista todas as fábricas e deixa
// mudar plano, situação, fim do teste e pacotes extras. O servidor confere de novo.

const PLAN_OPTS = ["free", "essencial", "pro", "ultra"];
const STATUS_OPTS = [["active", "Ativo"], ["trial", "Teste"], ["overdue", "Atrasado"], ["canceled", "Cancelado"], ["blocked", "Bloqueado"]];
const lim = (v) => (v == null ? "∞" : Number(v).toLocaleString("pt-BR"));
const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateIn = (iso) => { try { return iso ? new Date(iso).toISOString().slice(0, 10) : ""; } catch { return ""; } };

// Acesso do dono da fábrica: e-mail, nova senha e link da equipe
function Access({ c, dark, onSaved }) {
  const [email, setEmail] = useState(c.admin_email || "");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/?empresa=${c.company_id}`;
  const dirty = email.trim().toLowerCase() !== (c.admin_email || "") || pw.length > 0;
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt("Copie o link:", link); } };
  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await api("creatorUpdate", { companyId: c.company_id, ...(email.trim().toLowerCase() !== (c.admin_email || "") ? { admin_email: email } : {}), ...(pw ? { password: pw } : {}) });
      setPw(""); setMsg("Acesso salvo"); onSaved();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };
  const inp = `rounded-lg px-2 py-1.5 text-sm border outline-none ${dark ? "bg-gray-950 border-gray-700 text-white" : "bg-white border-gray-300"}`;
  return (
    <div className={`rounded-xl p-3 flex flex-wrap items-end gap-3 ${dark ? "bg-gray-950/60" : "bg-gray-50"}`}>
      <div className="text-xs font-black flex items-center gap-1.5 w-full opacity-80"><KeyRound size={13} />Acesso do dono</div>
      <label className="text-xs font-bold space-y-1 flex-1 min-w-[200px]"><div className="opacity-70">E-mail de acesso</div><input value={email} onChange={e => setEmail(e.target.value)} className={`${inp} w-full`} /></label>
      <label className="text-xs font-bold space-y-1 min-w-[180px]"><div className="opacity-70">Nova senha</div>
        <div className="relative"><input type={show ? "text" : "password"} value={pw} onChange={e => setPw(e.target.value)} placeholder="deixe vazio para manter" autoComplete="new-password" className={`${inp} w-full pr-8`} /><button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-60">{show ? <EyeOff size={14} /> : <Eye size={14} />}</button></div>
      </label>
      <button disabled={!dirty || busy} onClick={save} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500 text-white font-bold text-xs disabled:opacity-40">{busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar acesso</button>
      <button onClick={copy} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border font-bold text-xs ${dark ? "border-gray-700" : "border-gray-300"}`}>{copied ? <><Check size={14} className="text-emerald-500" />Link copiado</> : <><Link2 size={14} />Copiar link da equipe</>}</button>
      {msg && <span className={`text-xs font-bold ${msg === "Acesso salvo" ? "text-emerald-500" : "text-red-500"}`}>{msg}</span>}
    </div>
  );
}

function Row({ c, dark, onSaved }) {
  const isCreator = c.plan_id === "creator";
  const [f, setF] = useState({ plan_id: c.plan_id, status: c.status || "active", trial: dateIn(c.trial_ends_at), eo: c.extras?.orders || 0, ep: c.extras?.photos || 0, next: dateIn(c.billing?.nextChargeAt) });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const dirty = (c.legacy && !isCreator) || f.plan_id !== c.plan_id || f.status !== (c.status || "active") || f.trial !== dateIn(c.trial_ends_at) || Number(f.eo) !== (c.extras?.orders || 0) || Number(f.ep) !== (c.extras?.photos || 0) || f.next !== dateIn(c.billing?.nextChargeAt);
  const save = async () => {
    setBusy(true); setMsg("");
    try {
      await api("creatorUpdate", {
        companyId: c.company_id,
        plan_id: isCreator ? undefined : f.plan_id,
        status: f.status,
        trial_ends_at: f.trial ? new Date(`${f.trial}T23:59:59-03:00`).toISOString() : undefined,
        ...(Number(f.eo) !== (c.extras?.orders || 0) || Number(f.ep) !== (c.extras?.photos || 0) ? { extras: { orders: Number(f.eo) || 0, photos: Number(f.ep) || 0 } } : {}),
        ...(f.next !== dateIn(c.billing?.nextChargeAt) ? { nextChargeAt: f.next ? new Date(`${f.next}T23:59:59-03:00`).toISOString() : null } : {}),
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
          <div className="mt-1 text-sm font-black text-emerald-500 flex items-center gap-1"><DollarSign size={14} />Faturou {money(c.revenue)}<span className={`text-xs font-semibold ${dark ? "text-gray-400" : "text-gray-500"}`}> · {c.orders_count || 0} pedido(s) no total</span></div>
        </div>
        <div className="flex flex-col items-end gap-1">
        {c.billing && !isCreator && (
          <div className={`text-xs font-semibold flex flex-wrap gap-3 ${dark ? "text-gray-300" : "text-gray-600"}`}>
            <span>Ativo desde {dBR(c.billing.activeSince)}</span><span>Pago em {dBR(c.billing.paidAt)}</span>
            <span className={c.billing.pastDue ? "text-red-500 font-black" : "text-emerald-500 font-black"}>{c.billing.pastDue ? `Atrasada desde ${dBR(c.billing.nextChargeAt)}` : `Em dia · renova ${dBR(c.billing.nextChargeAt)}${c.billing.daysToCharge !== null ? ` (${c.billing.daysToCharge}d)` : ""}`}</span>
          </div>
        )}
        <div className={`text-xs font-semibold flex gap-3 ${dark ? "text-gray-300" : "text-gray-600"}`}>
          <span>Pedidos {lim(u.orders)}/{lim(l.orders)}</span><span>Fotos {lim(u.photos)}/{lim(l.photos)}</span><span>Usuários {lim(u.users)}/{lim(l.users)}</span>
        </div>
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
        {!isCreator && f.plan_id !== "free" && <label className="text-xs font-bold space-y-1"><div className="opacity-70">Próxima cobrança</div><input type="date" value={f.next} onChange={e => setF({ ...f, next: e.target.value })} className={sel} /></label>}
        <label className="text-xs font-bold space-y-1"><div className="opacity-70">+ Pedidos extras</div><input type="number" min="0" step="50" value={f.eo} onChange={e => setF({ ...f, eo: e.target.value })} className={`${sel} w-28`} /></label>
        <label className="text-xs font-bold space-y-1"><div className="opacity-70">+ Fotos extras</div><input type="number" min="0" step="500" value={f.ep} onChange={e => setF({ ...f, ep: e.target.value })} className={`${sel} w-28`} /></label>
        <button disabled={!dirty || busy} onClick={save} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-500 text-white font-bold text-sm disabled:opacity-40">{busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}Salvar</button>
        {msg && <span className={`text-xs font-bold ${msg === "Salvo" ? "text-emerald-500" : "text-red-500"}`}>{msg}</span>}
      </div>
      <Access c={c} dark={dark} onSaved={onSaved} />
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
