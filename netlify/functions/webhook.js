import { db, isCreatorCo } from "../lib/server.js";
import { normPlan } from "../../src/lib/plans.js";

// ── Pagamentos da Cakto ───────────────────────────────────────────────────────
// A Cakto avisa aqui cada venda, renovação, atraso e cancelamento.
// Segurança: o aviso só vale se vier com a senha do webhook (CAKTO_WEBHOOK_SECRET
// ou WEBHOOK_SECRET na Netlify), que a Cakto manda no campo "secret".
// Empresa: o link de pagamento leva ?sck=<id da empresa>; se não vier, procura pelo e-mail.
// Plano: pelo nome do produto/oferta (Essencial, PRO, Ultra). Extras: "pedidos" ou "fotos" no nome.

const ok = (msg) => ({ statusCode: 200, headers: { "Content-Type": "text/plain; charset=utf-8" }, body: msg });
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const PAID = ["purchase_approved", "subscription_created", "subscription_renewed", "subscription_late_recovered", "subscription_resumed"];
const LATE = ["subscription_late", "subscription_renewal_refused"];
const ENDED = ["subscription_canceled", "refund", "chargeback"];

// O que foi comprado, pelo nome do produto/oferta
function whatWasBought(d) {
  const name = norm(`${d?.product?.name || ""} ${d?.offer?.name || ""}`);
  const num = (re, def) => { const m = name.match(re); return m ? Number(m[1].replace(/\D/g, "")) : def; };
  if (/\bpedidos?\b/.test(name) && !/\b(essencial|pro|ultra)\b/.test(name)) return { extra: "orders", qty: num(/\+?\s*(\d[\d.]*)\s*pedidos?/, 50) };
  if (/\bfotos?\b/.test(name) && !/\b(essencial|pro|ultra)\b/.test(name)) return { extra: "photos", qty: num(/\+?\s*(\d[\d.]*)\s*fotos?/, 500) };
  if (/\bultra\b/.test(name)) return { plan: "ultra" };
  if (/\bpro\b/.test(name)) return { plan: "pro" };
  if (/\bessencial\b/.test(name)) return { plan: "essencial" };
  return {};
}

async function findCompany(d) {
  const sck = d?.sck || d?.metadata?.sck || null;
  const cols = "id, plan_id, status, admin_email, app_data";
  if (sck && /^[0-9a-f-]{20,}$/i.test(sck)) {
    const { data } = await db().from("companies").select(cols).eq("id", sck).maybeSingle();
    if (data) return data;
  }
  const email = String(d?.customer?.email || "").trim().toLowerCase();
  if (email) {
    const { data } = await db().from("companies").select(cols).ilike("admin_email", email).limit(1);
    if (data?.[0]) return data[0];
  }
  return null;
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const secret = String(process.env.CAKTO_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || "").trim();
  if (!secret) return ok("Webhook desligado (configure CAKTO_WEBHOOK_SECRET)");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { statusCode: 500, body: "Servidor sem SUPABASE_SERVICE_ROLE_KEY" };

  let p;
  try { p = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "JSON inválido" }; }
  const h = event.headers || {};
  const candidates = [p.secret, p?.data?.secret, (event.queryStringParameters || {}).token, h["x-webhook-token"], h["x-cakto-secret"], h["x-webhook-secret"], h["secret"]]
    .filter(v => typeof v === "string").map(v => v.trim());
  if (!candidates.includes(secret)) {
    // diagnóstico sem expor a senha: onde veio algo e com quantos caracteres
    console.warn("Cakto 401", { esperado: secret.length, body_secret: typeof p.secret === "string" ? p.secret.trim().length : typeof p.secret, data_secret: typeof p?.data?.secret, headers: Object.keys(h).filter(k => !/cookie|authorization/i.test(k)), event: p.event });
    return { statusCode: 401, body: "Unauthorized" };
  }

  const ev = String(p.event || "").toLowerCase();
  const d = p.data || {};
  if (![...PAID, ...LATE, ...ENDED].includes(ev)) return ok(`Evento ${ev || "?"} ignorado`);

  try {
    const c = await findCompany(d);
    if (!c) { console.warn("Cakto: empresa não encontrada", { ev, sck: d.sck, email: d?.customer?.email }); return ok("Empresa não encontrada — nada alterado"); }
    if (isCreatorCo(c)) return ok("Conta do criador — nada alterado");

    const bought = whatWasBought(d);
    const a = c.app_data || {};
    const srv = { orders_created: (a.orders || []).length, ...(a._srv || {}) };
    delete srv.legacyPlan; // pagou: deixa de ser conta antiga
    const billing = { ...(srv.billing || {}) };
    const seen = new Set(billing.seen || []);
    const key = `${ev}:${d.id || ""}`;
    if (d.id && seen.has(key)) return ok("Aviso repetido — já processado");
    const patch = {};
    let msg = "";

    if (PAID.includes(ev)) {
      if (bought.extra) {
        // pacote extra: soma uma vez só (renovação de extra não existe)
        const ex = { orders: 0, photos: 0, ...(srv.extras || {}) };
        ex[bought.extra] = (Number(ex[bought.extra]) || 0) + (bought.qty || 0);
        srv.extras = ex;
        msg = `Extra +${bought.qty} ${bought.extra}`;
      } else if (bought.plan) {
        patch.plan_id = bought.plan;
        patch.status = "active";
        billing.plan = bought.plan;
        billing.subscriptionId = d?.subscription?.id || billing.subscriptionId || null;
        billing.paidAt = d.paidAt || new Date().toISOString();
        msg = `Plano ${bought.plan} ativo`;
      } else {
        return ok("Produto sem plano reconhecido (o nome precisa ter Essencial, PRO, Ultra, pedidos ou fotos)");
      }
    } else if (bought.plan) {
      // atraso / cancelamento: só trava se for do plano atual (quem trocou de plano cancela o antigo sem travar)
      const current = normPlan(c.plan_id);
      if (bought.plan !== current) return ok(`Aviso do plano ${bought.plan}, mas a empresa está no ${current} — nada alterado`);
      patch.status = LATE.includes(ev) ? "overdue" : "canceled";
      msg = `Empresa travada (${patch.status})`;
    } else {
      return ok("Aviso de extra/sem plano — nada alterado");
    }

    if (d.id) billing.seen = [...seen, key].slice(-100);
    billing.lastEvent = { ev, at: new Date().toISOString(), amount: d.amount ?? null, offer: d?.offer?.name || null };
    srv.billing = billing;
    patch.app_data = { ...a, _srv: srv };

    const { error } = await db().from("companies").update(patch).eq("id", c.id);
    if (error) throw error;
    console.log("Cakto:", ev, c.id, msg);
    return ok(msg);
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Erro ao processar" };
  }
};
