import crypto from "node:crypto";
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

  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
  let p;
  try { p = JSON.parse(raw || "{}"); } catch { return { statusCode: 400, body: "JSON inválido" }; }
  const h = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));

  // 1) Assinatura da Cakto: X-Cakto-Signature = v1=HMAC-SHA256(senha, "{timestamp}.{corpo}")
  const sigOk = (() => {
    const sig = String(h["x-cakto-signature"] || "").trim(), ts = String(h["x-cakto-timestamp"] || "").trim();
    if (!sig || !ts) return false;
    const tsMs = Number(ts) > 1e12 ? Number(ts) : Number(ts) * 1000;
    if (!isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 10 * 60 * 1000) return false; // aviso velho/repetido
    const mac = crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest();
    const given = sig.split(",").map(x => x.trim()).map(x => x.startsWith("v1=") ? x.slice(3) : x);
    return given.some(g => { const want = /^[0-9a-f]+$/i.test(g) ? mac.toString("hex") : mac.toString("base64"); return g.length === want.length && crypto.timingSafeEqual(Buffer.from(g), Buffer.from(want)); });
  })();
  // 2) Senha no corpo (o jeito antigo da Cakto) ou na URL
  const candidates = [p.secret, (event.queryStringParameters || {}).token, h["x-webhook-token"]].filter(v => typeof v === "string").map(v => v.trim());
  if (!sigOk && !candidates.includes(secret)) {
    const tsH = String(h["x-cakto-timestamp"] || ""), sigH = String(h["x-cakto-signature"] || "").replace(/^v1=/, "");
    const withBody = typeof p.secret === "string" && sigH ? [crypto.createHmac("sha256", p.secret).update(`${tsH}.${raw}`).digest("hex"), crypto.createHmac("sha256", p.secret).update(`${tsH}.${raw}`).digest("base64")].includes(sigH) : false;
    console.warn("Cakto 401", { assinada_com_codigo_do_corpo: withBody, esperado: secret.length, body_secret: typeof p.secret === "string" ? p.secret.trim().length : typeof p.secret, assinatura: !!h["x-cakto-signature"], formato: String(h["x-cakto-signature"] || "").slice(0, 3), ts: h["x-cakto-timestamp"], event: p.event });
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
        const paid = d.paidAt || d?.subscription?.paidAt || new Date().toISOString();
        if (billing.plan !== bought.plan || !billing.activeSince) billing.activeSince = paid; // trocou de plano ou primeira vez
        billing.plan = bought.plan;
        billing.subscriptionId = d?.subscription?.id || billing.subscriptionId || null;
        billing.paidAt = paid;
        // próxima cobrança: a da Cakto, se vier; senão 1 mês depois do pagamento
        const nextFromCakto = d?.subscription?.next_payment_date || d?.subscription?.nextPaymentDate || d?.subscription?.next_charge_date || null;
        const nx = new Date(paid); nx.setMonth(nx.getMonth() + 1);
        billing.nextChargeAt = nextFromCakto ? new Date(nextFromCakto).toISOString() : nx.toISOString();
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
