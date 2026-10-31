// ── Planos do Inflatudo ───────────────────────────────────────────────────────
// Usado pelo app (telas, travas) e pelo servidor (conferência dos limites).
// Pedidos: total cadastrado desde o início (não renova). Fotos: total guardado.
// Usuários: dono + todos os logins da equipe (vendedores contam, em qualquer plano).

const ALL = { photos: true, clients: true, sellers: true, crm: true, dashboard: true, brain: true, map: true, ready: true };
const NONE = { photos: false, clients: false, sellers: false, crm: false, dashboard: false, brain: false, map: false, ready: false };

export const PLANS = {
  // Teste grátis: 7 dias com TUDO do Ultra liberado. No 8º dia trava e leva para os planos.
  free: { id: "free", label: "Teste grátis (Ultra)", price: 0, orders: Infinity, users: Infinity, photos: Infinity, trialDays: 7, features: { ...ALL } },
  essencial: { id: "essencial", label: "Essencial", price: 147, orders: 60, users: 5, photos: 0, features: { ...NONE } },
  pro: { id: "pro", label: "PRO", price: 297, orders: 150, users: 10, photos: 3000, features: { ...NONE, photos: true, clients: true, sellers: true } },
  ultra: { id: "ultra", label: "Ultra", price: 497, orders: Infinity, users: Infinity, photos: Infinity, features: { ...ALL } },
  creator: { id: "creator", label: "Criador", price: 0, orders: Infinity, users: Infinity, photos: Infinity, features: { ...ALL } },
};
export const PLAN_ORDER = ["free", "essencial", "pro", "ultra"];
export const EXTRAS = { orders: { qty: 50, price: 29 }, photos: { qty: 500, price: 19 } };
export const OWNER_WHATSAPP = "5544997180349"; // (44) 99718-0349

// Links de pagamento da Cakto (preencher quando os produtos forem criados).
// O app junta ?sck=<id da empresa> para o pagamento cair na empresa certa.
export const CHECKOUT = {
  essencial: "https://pay.cakto.com.br/i9ntve6_1251964",
  pro: "https://pay.cakto.com.br/39it8at",
  ultra: "https://pay.cakto.com.br/7givcs5",
  orders: "https://pay.cakto.com.br/sttzwu3_1252089", // +50 pedidos
  photos: "https://pay.cakto.com.br/morx3ps", // +500 fotos
};
export function checkoutLink(kind, companyId, email) {
  const base = CHECKOUT[kind];
  if (!base) return null;
  const u = new URL(base);
  if (companyId) u.searchParams.set("sck", companyId);
  if (email) u.searchParams.set("email", email);
  return u.toString();
}

// planos antigos do banco → planos novos
export function normPlan(id) {
  if (!id) return "free";
  if (id === "premium" || id === "completo" || id === "full") return "ultra";
  if (id === "basico" || id === "basic") return "essencial";
  if (id === "trial") return "free";
  return PLANS[id] ? id : "free";
}

// Dias de tolerância depois do vencimento antes de travar
export const GRACE_DAYS = 3;

// Situação da empresa: plano, limites (já com extras), se está travada
export function planState(company) {
  const id = normPlan(company?.plan_id);
  const p = PLANS[id];
  const extras = company?.extras || {};
  const now = Date.now();
  const trialEnd = company?.trial_ends_at ? new Date(company.trial_ends_at).getTime() : null;
  const daysLeft = trialEnd ? Math.ceil((trialEnd - now) / 86400000) : null;
  let locked = false, reason = "";
  if (id === "free" && trialEnd && trialEnd < now) { locked = true; reason = "trial"; }
  if (["expired", "canceled", "cancelled", "overdue", "blocked", "inactive"].includes(String(company?.status || "").toLowerCase()) && id !== "creator") { locked = true; reason = "expired"; }
  // Cobrança: quando foi pago, quando vence. Passou do vencimento + tolerância sem renovar → trava sozinho.
  const b = company?.billing || {};
  const nextMs = b.nextChargeAt ? new Date(b.nextChargeAt).getTime() : null;
  const daysToCharge = nextMs ? Math.ceil((nextMs - now) / 86400000) : null;
  const pastDue = !!nextMs && nextMs < now && id !== "creator" && id !== "free";
  const graceLeft = pastDue ? Math.ceil((nextMs + GRACE_DAYS * 86400000 - now) / 86400000) : null;
  if (pastDue && graceLeft <= 0) { locked = true; reason = "expired"; }
  const billing = (b.activeSince || b.paidAt || nextMs) ? { activeSince: b.activeSince || null, paidAt: b.paidAt || null, nextChargeAt: b.nextChargeAt || null, daysToCharge, pastDue, graceLeft } : null;
  return {
    id, plan: p, label: p.label, features: p.features, creator: id === "creator",
    limits: {
      orders: p.orders === Infinity ? Infinity : p.orders + (Number(extras.orders) || 0),
      photos: p.photos === Infinity ? Infinity : p.photos + (Number(extras.photos) || 0),
      users: p.users,
    },
    trial: id === "free", daysLeft, locked, reason, billing,
  };
}

// Mês atual no horário de Brasília (o limite de pedidos é por mês e zera todo dia 1º)
export const monthKey = (d = new Date()) => new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 7);
// Pedidos lançados neste mês (contador do servidor; excluir pedido não devolve a vaga)
export const ordersThisMonth = (usage) => usage?.month === monthKey() ? Number(usage?.orders_month) || 0 : 0;

// Uso atual da empresa
export function usageOf(appData, usage) {
  const users = (appData?.users || []).length + 1; // todos os logins (vendedores também) + o dono
  return {
    orders: ordersThisMonth(usage),
    photos: (appData?.photos || []).length + (appData?.readyStock || []).reduce((a, r) => a + (r.photos || []).length, 0),
    users,
  };
}
export const fmtLimit = (n) => n === Infinity ? "ilimitado" : Number(n).toLocaleString("pt-BR");
