import React from "react";
import { X, Check, Lock, MessageCircle, Crown, AlertTriangle, Sparkles, Package, Camera, Users } from "lucide-react";
import { PLANS, PLAN_ORDER, EXTRAS, OWNER_WHATSAPP, checkoutLink } from "../lib/plans";

const lim = (v) => v === null || v === undefined || v === Infinity ? "ilimitado" : Number(v).toLocaleString("pt-BR");
export const dBR = (iso) => { try { return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—"; } catch { return "—"; } };
const pct = (u, l) => (l === null || l === undefined || l === Infinity) ? 0 : Math.min(100, Math.round((u / Math.max(1, l)) * 100));
export const waLink = (text) => `https://wa.me/${OWNER_WHATSAPP}?text=${encodeURIComponent(text)}`;

const ROWS = [
  ["Pedidos (total)", (p) => lim(p.orders)],
  ["Extrator de pedidos com IA", () => true],
  ["Usuários (vendedor não conta)", (p) => p.users === 1 ? "1" : p.users === Infinity ? "ilimitado" : `até ${p.users}`],
  ["Produção e finalização", (p) => p.features.photos ? "com foto" : "sem foto"],
  ["Fotos guardadas", (p) => p.photos ? lim(p.photos) : false],
  ["Clientes", (p) => p.features.clients],
  ["Vendedor: login, aviso com foto, pastas", (p) => p.features.sellers],
  ["Vendedor: CRM + IA de vendas", (p) => p.features.crm],
  ["Dashboard + Cérebro + IA 24h", (p) => p.features.dashboard],
  ["Mapa de clientes + rotas", (p) => p.features.map],
  ["Pronta entrega", (p) => p.features.ready],
];

export function UsageBar({ label, used, limit, icon: Icon, dark }) {
  const p = pct(used, limit); const c = p >= 100 ? "#ef4444" : p >= 80 ? "#f59e0b" : "#10b981";
  return (
    <div className={`p-3 rounded-xl border ${dark ? "border-gray-800 bg-gray-950/50" : "border-gray-200 bg-gray-50"}`}>
      <div className="flex items-center justify-between text-xs font-bold mb-1.5"><span className="flex items-center gap-1.5 text-gray-400">{Icon && <Icon size={13} />}{label}</span><span>{Number(used || 0).toLocaleString("pt-BR")} <span className="text-gray-500">/ {lim(limit)}</span></span></div>
      <div className={`h-2 rounded-full overflow-hidden ${dark ? "bg-gray-800" : "bg-gray-200"}`}><div className="h-full rounded-full" style={{ width: `${limit === null ? 4 : p}%`, background: c }} /></div>
    </div>
  );
}

export function PlansModal({ plan, companyName, companyId, email, onClose, dark, isAdmin }) {
  const buy = (kind, text) => checkoutLink(kind, companyId, email) || waLink(text);
  const cur = plan?.id || "free";
  const card = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md" onClick={onClose}>
      <div className={`w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-3xl border shadow-2xl p-5 sm:p-8 ${dark ? "bg-gray-950 border-gray-800 text-white" : "bg-white border-gray-100 text-gray-900"}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black">Planos e Assinatura</h2>
            <p className="text-gray-500 mt-1 text-sm">Seu plano: <b className="text-orange-500">{plan?.creator ? "Criador (acesso total)" : PLANS[cur]?.label}</b>{plan?.trial && plan?.daysLeft !== null ? ` · ${plan.daysLeft > 0 ? `faltam ${plan.daysLeft} dia(s) de teste` : "teste encerrado"}` : ""}{plan?.locked && !plan?.trial ? " · vencido" : ""}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-800/50"><X size={22} /></button>
        </div>

        {plan?.billing && !plan?.creator && (
          <div className={`rounded-2xl border p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm ${plan.billing.pastDue ? "border-red-500/40 bg-red-500/10" : card}`}>
            <div><div className="text-[11px] font-black uppercase text-gray-500">Ativo desde</div><div className="font-black">{dBR(plan.billing.activeSince)}</div></div>
            <div><div className="text-[11px] font-black uppercase text-gray-500">Último pagamento</div><div className="font-black">{dBR(plan.billing.paidAt)}</div></div>
            <div><div className="text-[11px] font-black uppercase text-gray-500">Próxima cobrança</div><div className={`font-black ${plan.billing.pastDue ? "text-red-400" : ""}`}>{dBR(plan.billing.nextChargeAt)}{plan.billing.daysToCharge !== null && !plan.billing.pastDue ? <span className="text-gray-500 font-bold"> · faltam {plan.billing.daysToCharge} dia(s)</span> : null}</div>
              {plan.billing.pastDue && <div className="text-xs font-bold text-red-400 mt-0.5">{plan.locked ? "Pagamento não confirmado — acesso travado." : `Pagamento pendente: trava em ${plan.billing.graceLeft} dia(s).`}</div>}</div>
          </div>
        )}

        {plan?.usage && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-6">
            <UsageBar dark={dark} icon={Package} label="Pedidos" used={plan.usage.orders} limit={plan.limits?.orders} />
            <UsageBar dark={dark} icon={Camera} label="Fotos" used={plan.usage.photos} limit={plan.limits?.photos ?? 0} />
            <UsageBar dark={dark} icon={Users} label="Usuários" used={plan.usage.users} limit={plan.limits?.users} />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {PLAN_ORDER.map(id => {
            const p = PLANS[id]; const isCur = id === cur && !plan?.creator; const rec = id === "pro";
            return (
              <div key={id} className={`relative rounded-2xl border p-5 flex flex-col ${card} ${rec ? "ring-2 ring-orange-500" : ""}`}>
                {rec && <div className="absolute -top-3 left-5 bg-orange-500 text-white text-[11px] font-black uppercase px-3 py-1 rounded-full">Recomendado</div>}
                <div className="text-lg font-black">{p.label}</div>
                <div className="mt-1 mb-4">{id === "free" ? <span className="text-3xl font-black text-orange-500">7 dias grátis</span> : <><span className="text-3xl font-black text-orange-500">R$ {p.price}</span><span className="text-sm text-gray-500">/mês</span></>}</div>
                <ul className="space-y-2 text-sm flex-1">
                  {ROWS.map(([l, f]) => { const v = f(p); const on = v !== false; return <li key={l} className={`flex items-start gap-2 ${on ? "" : "opacity-40"}`}>{on ? <Check size={15} className="text-emerald-500 mt-0.5 flex-shrink-0" /> : <X size={15} className="mt-0.5 flex-shrink-0" />}<span>{l}{typeof v === "string" ? <b className="ml-1">{v}</b> : null}</span></li>; })}
                </ul>
                {isCur ? <div className="mt-5 text-center py-2.5 rounded-xl font-black text-sm border border-emerald-500 text-emerald-500">Seu plano atual</div>
                  : id === "free" ? <div className="mt-5 text-center py-2.5 text-xs text-gray-500 font-bold">Para conhecer o sistema</div>
                    : isAdmin ? <a href={buy(p.id, `Olá! Quero assinar o plano ${p.label} do Inflatudo para a empresa ${companyName || ""}.`)} target="_blank" rel="noreferrer" className={`mt-5 text-center py-2.5 rounded-xl font-black text-sm text-white ${rec ? "bg-gradient-to-r from-orange-500 to-orange-600" : "bg-gray-700 hover:bg-gray-600"}`}>Quero o {p.label}</a> : null}
              </div>
            );
          })}
        </div>

        {isAdmin && !plan?.creator && (
          <div className={`mt-6 rounded-2xl border p-5 ${card}`}>
            <div className="font-black mb-1">Precisa de mais espaço sem trocar de plano?</div>
            <p className="text-sm text-gray-500 mb-3">Pacotes avulsos somam ao limite do seu plano.</p>
            <div className="flex flex-wrap gap-2">
              <a href={buy("orders", `Olá! Quero comprar o pacote de +${EXTRAS.orders.qty} pedidos (R$ ${EXTRAS.orders.price}) para a empresa ${companyName || ""}.`)} target="_blank" rel="noreferrer" className="px-4 py-2.5 rounded-xl font-bold text-sm border border-orange-500 text-orange-500 hover:bg-orange-500/10">+{EXTRAS.orders.qty} pedidos · R$ {EXTRAS.orders.price}</a>
              <a href={buy("photos", `Olá! Quero comprar o pacote de +${EXTRAS.photos.qty} fotos (R$ ${EXTRAS.photos.price}) para a empresa ${companyName || ""}.`)} target="_blank" rel="noreferrer" className="px-4 py-2.5 rounded-xl font-bold text-sm border border-orange-500 text-orange-500 hover:bg-orange-500/10">+{EXTRAS.photos.qty} fotos · R$ {EXTRAS.photos.price}</a>
            </div>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-4 flex items-center gap-1.5"><MessageCircle size={13} />A assinatura é feita pelo WhatsApp. A troca de plano vale na hora e a cobrança passa para o valor do plano novo.</p>
      </div>
    </div>
  );
}

const LIMIT_TEXT = {
  limit_orders: ["Você chegou ao limite de pedidos", "Para cadastrar novos pedidos, suba de plano ou compre um pacote extra. Os pedidos que você já tem continuam funcionando normalmente."],
  limit_photos: ["Você chegou ao limite de fotos", "Para guardar novas fotos, suba de plano ou compre um pacote extra de fotos."],
  limit_users: ["Você chegou ao limite de usuários", "Para criar novos logins, suba de plano."],
  locked: ["Seu plano não está ativo", "Você pode ver tudo o que já cadastrou, mas para criar ou editar é preciso escolher um plano."],
};
export function LimitModal({ hit, onClose, onPlans, dark, isAdmin }) {
  const [t, d] = LIMIT_TEXT[hit.code] || ["Não foi possível salvar", hit.message];
  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={onClose}>
      <div className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl ${dark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900"}`} onClick={e => e.stopPropagation()}>
        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center mb-4"><AlertTriangle size={24} /></div>
        <div className="text-xl font-black">{t}</div>
        <p className="text-sm text-gray-400 mt-2">{isAdmin ? d : "Fale com o responsável da empresa para liberar."}</p>
        <div className="flex gap-2 mt-5">
          {isAdmin && <button onClick={() => { onClose(); onPlans(); }} className="flex-1 py-3 rounded-xl font-black text-white bg-gradient-to-r from-orange-500 to-orange-600">Ver planos</button>}
          <button onClick={onClose} className={`px-5 py-3 rounded-xl font-bold ${dark ? "bg-gray-800" : "bg-gray-100"}`}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

export function LockedFeature({ title, planName, desc, onPlans, dark }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5 text-white shadow-xl" style={{ background: "linear-gradient(135deg,#f97316,#a855f7)" }}><Lock size={34} /></div>
      <div className="text-xs font-black uppercase tracking-widest text-orange-500">Disponível no plano {planName}</div>
      <h2 className={`text-2xl sm:text-3xl font-black mt-2 ${dark ? "text-white" : "text-gray-900"}`}>{title}</h2>
      {desc && <p className="text-gray-500 mt-3 max-w-md">{desc}</p>}
      <button onClick={onPlans} className="mt-6 px-6 py-3 rounded-xl font-black text-white bg-gradient-to-r from-orange-500 to-orange-600 flex items-center gap-2"><Crown size={18} />Quero esse plano</button>
    </div>
  );
}

export function PlanBanner({ plan, onPlans, isAdmin }) {
  if (!plan || plan.creator) return null;
  const warnUse = plan.usage && plan.limits && ["orders", "photos", "users"].find(k => plan.limits[k] !== null && plan.limits[k] > 0 && plan.usage[k] / plan.limits[k] >= 0.8);
  let text = null, tone = "orange";
  if (plan.locked) { text = plan.trial ? "Seu teste grátis terminou. Escolha um plano para continuar usando — seus dados estão salvos." : "Seu plano está vencido. Renove para voltar a criar e editar."; tone = "red"; }
  else if (plan.trial && plan.daysLeft !== null) text = plan.daysLeft <= 1 ? "Último dia do seu teste grátis." : `Teste grátis: faltam ${plan.daysLeft} dias.`;
  else if (plan.billing?.pastDue) { text = `Não recebemos o pagamento do plano (venceu em ${dBR(plan.billing.nextChargeAt)}). O acesso trava em ${plan.billing.graceLeft} dia(s).`; tone = "red"; }
  else if (plan.billing?.daysToCharge !== null && plan.billing?.daysToCharge !== undefined && plan.billing.daysToCharge <= 3) text = plan.billing.daysToCharge <= 0 ? "Seu plano renova hoje." : `Seu plano renova em ${plan.billing.daysToCharge} dia(s) (${dBR(plan.billing.nextChargeAt)}).`;
  else if (warnUse) { const n = { orders: "pedidos", photos: "fotos", users: "usuários" }[warnUse]; text = `Você já usou ${plan.usage[warnUse]} de ${plan.limits[warnUse]} ${n} do seu plano.`; }
  if (!text) return null;
  const c = tone === "red" ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-orange-500/10 border-orange-500/20 text-orange-500";
  return (
    <div className={`flex-shrink-0 border-b px-4 md:px-6 py-2 flex items-center justify-between gap-3 ${c}`}>
      <div className="flex items-center gap-2 text-xs font-bold"><Sparkles size={14} />{isAdmin ? text : (plan.locked ? "O acesso da empresa está suspenso. Fale com o responsável." : text)}</div>
      {isAdmin && <button onClick={onPlans} className="text-xs font-black uppercase whitespace-nowrap hover:underline">Ver planos</button>}
    </div>
  );
}

export function SuspendedScreen({ message, onLogout }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white p-6">
      <div className="max-w-sm text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/15 text-red-400 flex items-center justify-center mx-auto mb-5"><Lock size={30} /></div>
        <h2 className="text-2xl font-black">Acesso suspenso</h2>
        <p className="text-gray-400 mt-2">{message || "O plano desta empresa não está ativo. Fale com o responsável da empresa."}</p>
        <button onClick={onLogout} className="mt-6 px-5 py-2.5 rounded-xl bg-gray-800 font-bold">Sair</button>
      </div>
    </div>
  );
}
