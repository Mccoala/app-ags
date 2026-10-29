import React, { useState } from "react";
import SupportWizard from "./SupportWizard";
import { X, Check, Lock, Crown, MessageCircle, AlertTriangle, Sparkles, Package, Camera, Users, Sprout, Factory, Rocket } from "lucide-react";
import { PLANS, EXTRAS, OWNER_WHATSAPP, checkoutLink } from "../lib/plans";

const lim = (v) => v === null || v === undefined || v === Infinity ? "ilimitado" : Number(v).toLocaleString("pt-BR");
export const dBR = (iso) => { try { return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—"; } catch { return "—"; } };
const pct = (u, l) => (l === null || l === undefined || l === Infinity) ? 0 : Math.min(100, Math.round((u / Math.max(1, l)) * 100));
export const waLink = (text) => `https://wa.me/${OWNER_WHATSAPP}?text=${encodeURIComponent(text)}`;


export function UsageBar({ label, used, limit, icon: Icon, dark }) {
  const p = pct(used, limit); const c = p >= 100 ? "#ef4444" : p >= 80 ? "#f59e0b" : "#10b981";
  return (
    <div className={`p-2.5 sm:p-3 rounded-xl ${dark ? "bg-[#161616]" : "bg-[#f3f1ed]"}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 text-[11px] sm:text-xs font-bold mb-1.5"><span className={`flex items-center gap-1.5 ${dark ? "text-[#a3a3a3]" : "text-[#6b6b6b]"}`}>{Icon && <Icon size={13} />}{label}</span><span>{Number(used || 0).toLocaleString("pt-BR")} <span className={dark ? "text-[#737373]" : "text-[#8a8a8a]"}>/ {lim(limit)}</span></span></div>
      <div className={`h-1.5 rounded-full overflow-hidden ${dark ? "bg-[#2a2a2a]" : "bg-[#e2dfd9]"}`}><div className="h-full rounded-full" style={{ width: `${limit === null ? 4 : p}%`, background: c }} /></div>
    </div>
  );
}

// O que cada plano acrescenta ao anterior
const PLAN_COPY = {
  essencial: { icon: Sprout, tag: "Para organizar a produção", base: "Inclui:", items: ["300 pedidos no total", "Até 5 usuários, contando os vendedores", "Extrator de pedidos com IA", "Produção por etapas e finalização"] },
  pro: { icon: Factory, tag: "Para fábricas com vendedores", base: "Tudo do Essencial, mais:", items: ["1.000 pedidos no total", "Até 10 usuários, contando os vendedores", "Finalização com foto (3.000 fotos)", "Área de clientes", "Login do vendedor com aviso e foto do brinquedo pronto", "Pastas de fotos por pedido"] },
  ultra: { icon: Rocket, tag: "Para crescer sem limite", base: "Tudo do PRO, mais:", items: ["Pedidos, usuários e fotos ilimitados", "CRM + IA de vendas para os vendedores", "Dashboard com o Cérebro 24h", "Mapa de clientes e rotas de entrega", "Quadro de pronta entrega"] },
};
const PAID = ["essencial", "pro", "ultra"];

// Vídeo de apresentação: só carrega quando a pessoa aperta o play (economiza internet)
export function PromoVideo({ dark }) {
  const [on, setOn] = useState(false);
  return (
    <div className="mt-6 max-w-3xl mx-auto">
      <div className={`relative w-full aspect-video rounded-2xl overflow-hidden shadow-xl ${dark ? "bg-black" : "bg-[#111]"}`}>
        {on ? (
          <video src="/video/inflatudo-apresentacao.mp4" poster="/video/inflatudo-apresentacao.jpg" controls autoPlay playsInline preload="auto" className="w-full h-full object-contain bg-black" />
        ) : (
          <button onClick={() => setOn(true)} className="group absolute inset-0 w-full h-full" aria-label="Assistir à apresentação do Inflatudo">
            <img src="/video/inflatudo-apresentacao.jpg" alt="" className="w-full h-full object-cover" />
            <span className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />
            <span className="absolute inset-0 flex items-center justify-center"><span className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-2xl shadow-orange-500/40 group-hover:scale-105 transition-transform"><svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" className="ml-1"><path d="M8 5v14l11-7z" /></svg></span></span>
            <span className="absolute left-3 bottom-3 px-3 py-1.5 rounded-full bg-black/70 text-white text-xs sm:text-sm font-bold">Veja o Inflatudo funcionando · 1:32</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function PlansModal({ plan, companyName, companyId, email, onClose, dark, isAdmin, forced = false, onLogout }) {
  const buy = (kind, text) => checkoutLink(kind, companyId, email) || waLink(text);
  const cur = plan?.creator ? "creator" : (plan?.id || "free");
  const curRank = PAID.indexOf(cur);
  const showExtras = isAdmin && (cur === "pro" || cur === "ultra"); // pacotes avulsos só a partir do PRO
  const [help, setHelp] = useState(false);
  const T = dark
    ? { bg: "bg-[#1b1b1b] text-[#ececec]", card: "bg-[#222222] border-[#333]", soft: "text-[#a3a3a3]", line: "border-[#333]", note: "bg-[#161616]", btn: "bg-[#3a3a3a] hover:bg-[#474747] text-white", btnMain: "bg-[#f2f2f2] hover:bg-white text-[#141414]" }
    : { bg: "bg-[#faf9f7] text-[#1a1a1a]", card: "bg-white border-[#e7e5e0]", soft: "text-[#6b6b6b]", line: "border-[#ebe8e3]", note: "bg-[#f3f1ed]", btn: "bg-[#ecebe7] hover:bg-[#e2e0db] text-[#1a1a1a]", btnMain: "bg-[#1a1a1a] hover:bg-black text-white" };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md" onClick={forced ? undefined : onClose}>
      <div className={`relative w-full max-w-5xl max-h-[94vh] overflow-y-auto rounded-3xl shadow-2xl px-5 py-8 sm:px-10 sm:py-12 ${T.bg}`} onClick={e => e.stopPropagation()}>
        {forced
          ? (onLogout && <button onClick={onLogout} className={`absolute top-4 right-4 px-3 py-1.5 rounded-xl text-sm font-bold ${T.soft} hover:opacity-80`}>Sair</button>)
          : <button onClick={onClose} className={`absolute top-4 right-4 p-2 rounded-xl ${T.soft} hover:opacity-80`}><X size={22} /></button>}

        <h2 className="text-center text-[26px] leading-tight sm:text-4xl tracking-tight px-8" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>Planos que crescem com a sua fábrica</h2>
        <p className={`text-center text-sm mt-2 ${T.soft}`}>
          {plan?.creator ? "Conta do criador: acesso total." : cur === "free" ? (plan?.locked ? "Seu teste grátis terminou. Escolha um plano para continuar — seus dados estão salvos." : `Você está testando grátis tudo do Ultra${plan?.daysLeft != null ? ` · faltam ${plan.daysLeft} dia(s)` : ""}. Escolha seu plano para continuar depois do teste.`) : <>Seu plano: <b className={dark ? "text-white" : "text-black"}>{PLANS[cur]?.label}</b>{plan?.locked ? " · vencido" : ""}</>}
        </p>

        <PromoVideo dark={dark} />

        {(plan?.usage || plan?.billing) && !plan?.creator && (
          <div className="mt-6 max-w-3xl mx-auto grid grid-cols-3 gap-2">
            {plan?.usage && <>
              <UsageBar dark={dark} icon={Package} label="Pedidos" used={plan.usage.orders} limit={plan.limits?.orders} />
              <UsageBar dark={dark} icon={Camera} label="Fotos" used={plan.usage.photos} limit={plan.limits?.photos ?? 0} />
              <UsageBar dark={dark} icon={Users} label="Usuários" used={plan.usage.users} limit={plan.limits?.users} />
            </>}
            {plan?.billing && (
              <div className={`col-span-3 rounded-xl px-4 py-3 text-sm flex flex-wrap gap-x-6 gap-y-1 ${plan.billing.pastDue ? "bg-red-500/10 text-red-400" : T.note}`}>
                <span>Ativo desde <b>{dBR(plan.billing.activeSince)}</b></span>
                <span>Último pagamento <b>{dBR(plan.billing.paidAt)}</b></span>
                <span>Próxima cobrança <b>{dBR(plan.billing.nextChargeAt)}</b>{plan.billing.pastDue ? (plan.locked ? " · pagamento não confirmado" : ` · pendente, trava em ${plan.billing.graceLeft} dia(s)`) : plan.billing.daysToCharge != null ? ` · faltam ${plan.billing.daysToCharge} dia(s)` : ""}</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          {PAID.map((id, idx) => {
            const p = PLANS[id], c = PLAN_COPY[id], Icon = c.icon;
            const isCur = id === cur, rec = id === "pro";
            const label = isCur ? "Seu plano atual" : curRank >= 0 && idx < curRank ? `Mudar para ${p.label}` : `Assinar ${p.label}`;
            return (
              <div key={id} className={`relative rounded-2xl border flex flex-col ${T.card} ${rec && !isCur ? (dark ? "ring-1 ring-orange-500/60" : "ring-1 ring-orange-500/50") : ""}`}>
                {rec && <div className="absolute top-5 right-5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-500">Mais recomendado</div>}
                <div className="p-6 pb-5">
                  <Icon size={46} strokeWidth={1.1} className={dark ? "text-[#d9d9d9]" : "text-[#2a2a2a]"} />
                  <div className="mt-4 text-xl font-bold">{p.label}</div>
                  <div className={`text-sm ${T.soft}`}>{c.tag}</div>
                  <div className="mt-5 flex items-end gap-2">
                    <span className="text-4xl font-bold tracking-tight">R$ {p.price}</span>
                    <span className={`text-xs leading-tight pb-1 ${T.soft}`}>BRL / mês<br />cobrado mensalmente</span>
                  </div>
                  {isCur && <div className={`mt-4 rounded-xl px-3.5 py-3 text-sm flex gap-2 ${T.note}`}><Check size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" /><span><b>Você está neste plano.</b>{plan?.billing?.nextChargeAt ? <span className={T.soft}> Renova em {dBR(plan.billing.nextChargeAt)}.</span> : null}</span></div>}
                  {isCur ? <div className={`mt-4 w-full text-center py-3 rounded-xl text-sm font-semibold opacity-60 ${T.btn}`}>{label}</div>
                    : isAdmin ? <a href={buy(id, `Olá! Quero assinar o plano ${p.label} do Inflatudo para a empresa ${companyName || ""}.`)} target="_blank" rel="noreferrer" className={`mt-4 block w-full text-center py-3 rounded-xl text-sm font-semibold transition-colors ${rec ? T.btnMain : T.btn}`}>{label}</a>
                    : <div className={`mt-4 text-center text-xs ${T.soft}`}>Só o dono da conta pode trocar o plano.</div>}
                  {!isCur && isAdmin && <div className={`mt-2 text-center text-[11px] ${T.soft}`}>Sem fidelidade · Cancele quando quiser</div>}
                </div>
                <div className={`border-t ${T.line} p-6 pt-5 flex-1`}>
                  <div className={`text-sm font-semibold mb-3 ${T.soft}`}>{c.base}</div>
                  <ul className="space-y-2.5 text-sm">
                    {c.items.map(t => <li key={t} className="flex items-start gap-2.5"><Check size={16} strokeWidth={2} className={`mt-0.5 flex-shrink-0 ${T.soft}`} /><span>{t}</span></li>)}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {showExtras && (
          <div className={`mt-6 rounded-2xl border p-6 ${T.card}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-lg font-bold">Precisa de mais espaço?</div>
                <p className={`text-sm mt-0.5 ${T.soft}`}>Pacotes avulsos somam ao limite do seu plano, sem mudar a mensalidade.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={buy("orders", `Olá! Quero comprar o pacote de +${EXTRAS.orders.qty} pedidos para a empresa ${companyName || ""}.`)} target="_blank" rel="noreferrer" className={`px-4 py-2.5 rounded-xl text-sm font-semibold ${T.btn}`}>+{EXTRAS.orders.qty} pedidos · R$ {EXTRAS.orders.price}</a>
                <a href={buy("photos", `Olá! Quero comprar o pacote de +${EXTRAS.photos.qty} fotos para a empresa ${companyName || ""}.`)} target="_blank" rel="noreferrer" className={`px-4 py-2.5 rounded-xl text-sm font-semibold ${T.btn}`}>+{EXTRAS.photos.qty} fotos · R$ {EXTRAS.photos.price}</a>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-center"><button onClick={() => setHelp(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white bg-[#25D366] hover:bg-[#1fbe5b]"><MessageCircle size={17} />Ficou com dúvida? Fale no WhatsApp</button></div>
        <p className={`text-xs text-center mt-4 ${T.soft}`}>Pagamento seguro pela Cakto. Ao trocar de plano, o novo vale na hora e a cobrança passa a ser do plano novo.</p>
      </div>
      <button onClick={e => { e.stopPropagation(); setHelp(true); }} title="Tirar dúvidas no WhatsApp" className="fixed bottom-5 right-5 z-[210] w-14 h-14 rounded-full bg-[#25D366] text-white shadow-2xl shadow-green-500/30 flex items-center justify-center hover:scale-105 transition-transform"><MessageCircle size={26} /></button>
      {help && <div onClick={e => e.stopPropagation()}><SupportWizard dark={dark} onClose={() => setHelp(false)} companyName={companyName} email={email} planLabel={plan?.creator ? "Criador" : PLANS[cur]?.label} /></div>}
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
    <div className={`lf-wrap relative overflow-hidden rounded-3xl border min-h-[70vh] flex items-center justify-center ${dark ? "border-white/5 bg-[#070a14]" : "border-black/5 bg-[#fbf7f2]"}`}>
      {/* fundo animado: manchas de luz que flutuam + grade que desliza + faíscas */}
      <div className="lf-blob lf-blob-a" /><div className="lf-blob lf-blob-b" /><div className="lf-blob lf-blob-c" />
      <div className={`lf-grid ${dark ? "" : "lf-grid-light"}`} />
      {Array.from({ length: 14 }).map((_, k) => <span key={k} className="lf-spark" style={{ left: `${(k * 53) % 100}%`, animationDelay: `${(k * 0.7) % 6}s`, animationDuration: `${6 + (k % 5)}s` }} />)}

      <div className="relative z-10 flex flex-col items-center text-center px-6 py-16">
        <div className="lf-lock relative w-24 h-24 mb-7">
          <div className="lf-ring absolute -inset-3 rounded-[2rem]" />
          <div className="lf-halo absolute -inset-6 rounded-full" />
          <div className="relative w-full h-full rounded-[1.75rem] flex items-center justify-center text-white shadow-2xl" style={{ background: "linear-gradient(135deg,#f97316,#ec4899 55%,#a855f7)" }}>
            <Lock size={40} className="lf-shackle" />
            <span className="lf-glint absolute inset-0 rounded-[1.75rem]" />
          </div>
        </div>
        <div className="text-xs font-black uppercase tracking-[0.2em] text-orange-500">Disponível no plano {planName}</div>
        <h2 className={`text-3xl sm:text-4xl font-black mt-3 ${dark ? "text-white" : "text-gray-900"}`}>{title}</h2>
        {desc && <p className={`mt-3 max-w-md ${dark ? "text-gray-400" : "text-gray-600"}`}>{desc}</p>}
        <button onClick={onPlans} className="lf-btn relative overflow-hidden mt-8 px-7 py-3.5 rounded-2xl font-black text-white flex items-center gap-2 shadow-xl shadow-orange-500/30" style={{ background: "linear-gradient(135deg,#f97316,#ea580c)" }}>
          <Crown size={18} className="lf-crown" />Quero esse plano
          <span className="lf-btn-shine" />
        </button>
      </div>
    </div>
  );
}

export function PlanBanner({ plan, onPlans, isAdmin }) {
  if (!plan || plan.creator) return null;
  const warnUse = plan.usage && plan.limits && ["orders", "photos", "users"].find(k => plan.limits[k] !== null && plan.limits[k] > 0 && plan.usage[k] / plan.limits[k] >= 0.8);
  let text = null, tone = "orange";
  if (plan.locked) { text = plan.trial ? "Seu teste grátis terminou. Escolha um plano para continuar usando — seus dados estão salvos." : "Seu plano está vencido. Renove para voltar a criar e editar."; tone = "red"; }
  else if (plan.trial && plan.daysLeft !== null) text = plan.daysLeft <= 1 ? "Último dia do seu teste grátis do Ultra." : `Teste grátis do Ultra: faltam ${plan.daysLeft} dias.`;
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
