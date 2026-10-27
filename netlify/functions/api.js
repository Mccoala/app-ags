import crypto from "node:crypto";
import { db, SECURE, signToken, verifyToken, tokenFromEvent, hashPassword, checkPassword, httpError, json, fail, loadCompany, isCreatorCo, isLegacy, effective, NO_PLAN } from "../lib/server.js";
import { planState, usageOf, normPlan, PLANS } from "../../src/lib/plans.js";

// ─────────────────────────────────────────────────────────────────────────────
// API do Inflatudo. Todo acesso aos dados passa por aqui:
// confere quem está logado, de qual empresa é, e o que o plano permite.
// Uma empresa nunca recebe dados de outra.
// ─────────────────────────────────────────────────────────────────────────────

const meta = (c) => ({ company_id: c.id, company_name: c.company_name, plan: c.plan_id, status: c.status, trial_ends_at: c.trial_ends_at });
const stateOf = (c0) => { const c = effective(c0); const s = planState({ ...c, extras: c.app_data?._srv?.extras }); return { ...s, legacy: !isCreatorCo(c0) && isLegacy(c0), limits: { ...s.limits }, usage: usageOf(c.app_data, c.app_data?._srv) }; };
const publicState = (st) => ({ ...st, limits: Object.fromEntries(Object.entries(st.limits).map(([k, v]) => [k, v === Infinity ? null : v])) }); // Infinity não existe em JSON

// Funcionário não recebe senhas nem dados do dono
function scrubForEmployee(appData) {
  const d = { ...appData };
  d.users = (d.users || []).map(u => ({ ...u, password: undefined }));
  return d;
}

async function currentEmployee(c, uid) {
  const u = (c.app_data?.users || []).find(x => String(x.id) === String(uid));
  if (!u) throw httpError(401, "Seu acesso foi removido pela empresa.");
  return u;
}

const actions = {
  // Diagnóstico simples (não expõe nada)
  async ping() { return { ok: true, secure: SECURE }; },

  async register({ companyName, email, password }) {
    companyName = String(companyName || "").trim(); email = String(email || "").trim().toLowerCase();
    if (!companyName || !email || !password) throw httpError(400, "Preencha todos os campos.");
    if (String(password).length < 4) throw httpError(400, "A senha precisa ter pelo menos 4 caracteres.");
    const { data: exists } = await db().from("companies").select("id").eq("admin_email", email).maybeSingle();
    if (exists) throw httpError(409, "E-mail já está em uso.");
    const trialEnd = new Date(Date.now() + PLANS.free.trialDays * 86400000).toISOString();
    const app_data = { users: [], clients: [], team: [], sellers: [], orders: [], production: [], finalization: [], _srv: { orders_created: 0 } };
    const { data: c, error } = await db().from("companies").insert([{ company_name: companyName, admin_email: email, admin_password: hashPassword(password), trial_ends_at: trialEnd, status: "trial", plan_id: "free", app_data }]).select("id, company_name, admin_email, plan_id, status, trial_ends_at").single();
    if (error) throw httpError(400, /unique/i.test(error.message) ? "E-mail já está em uso." : "Não foi possível criar a conta.");
    const token = signToken({ cid: c.id, uid: "owner", role: "admin" });
    return { token, user: { id: c.id, name: c.company_name, email: c.admin_email, role: "admin", ...meta(c) } };
  },

  async adminLogin({ email, password }) {
    email = String(email || "").trim().toLowerCase();
    if (!email || !password) throw httpError(400, "Preencha todos os campos.");
    const { data: c } = await db().from("companies").select("id, company_name, admin_email, admin_password, plan_id, status, trial_ends_at").eq("admin_email", email).maybeSingle();
    if (!c || !checkPassword(password, c.admin_password)) throw httpError(401, "E-mail ou senha incorretos.");
    if (!String(c.admin_password).startsWith("scrypt$")) await db().from("companies").update({ admin_password: hashPassword(password) }).eq("id", c.id); // embaralha a senha antiga
    const token = signToken({ cid: c.id, uid: "owner", role: "admin" });
    return { token, user: { id: c.id, name: c.company_name, email: c.admin_email, role: "admin", ...meta(c) } };
  },

  async employeeLogin({ companyId, login, password }) {
    if (!companyId) throw httpError(400, "Link de empresa inválido. Peça o link correto ao seu administrador.");
    if (!login || !password) throw httpError(400, "Preencha usuário e senha.");
    let c; try { c = await loadCompany(companyId, "id, company_name, plan_id, status, trial_ends_at, app_data"); } catch { throw httpError(404, "Empresa não encontrada. Confira o link com o seu administrador."); }
    const l = String(login).trim().toLowerCase();
    const emp = (c.app_data?.users || []).find(u => String(u.email || "").trim().toLowerCase() === l && checkPassword(password, u.password));
    if (!emp) throw httpError(401, "Usuário ou senha incorretos.");
    const st = stateOf(c);
    if (st.locked) throw httpError(402, "O acesso desta empresa está suspenso. Fale com o responsável.", { code: "locked" });
    const token = signToken({ cid: c.id, uid: emp.id, role: "employee" });
    return { token, user: { id: emp.id, name: emp.name, role: "employee", permissions: emp.permissions || [], sellerName: emp.sellerName || "", company_id: c.id, company_name: c.company_name } };
  },

  async load(_, s) {
    const c = await loadCompany(s.cid);
    const st = stateOf(c);
    let user = null, app_data = c.app_data || {};
    if (s.role === "employee") {
      const emp = await currentEmployee(c, s.uid);
      if (st.locked) throw httpError(402, "O acesso desta empresa está suspenso. Fale com o responsável.", { code: "locked" });
      user = { permissions: emp.permissions || [], sellerName: emp.sellerName || "", name: emp.name };
      app_data = scrubForEmployee(app_data);
    }
    return { app_data, company: meta(c), plan: publicState(st), user };
  },

  async save({ app_data }, s) {
    if (!app_data || typeof app_data !== "object") throw httpError(400, "Dados inválidos.");
    const c = await loadCompany(s.cid);
    const st = stateOf(c);
    if (st.locked) throw httpError(402, st.reason === "trial" ? "Seu teste grátis terminou. Escolha um plano para continuar." : "Seu plano está vencido. Renove para continuar.", { code: "locked" });
    const cur = c.app_data || {};
    const srv = { orders_created: 0, ...(cur._srv || {}) };
    if (!cur._srv && c.app_data) srv.legacyPlan = c.plan_id ?? NO_PLAN; // empresa antiga: guarda o plano de agora
    srv.orders_created = Math.max(srv.orders_created || 0, (cur.orders || []).length);
    const curIds = new Set((cur.orders || []).map(o => String(o.id)));
    const newOrders = (app_data.orders || []).filter(o => !curIds.has(String(o.id))).length;
    const next = { ...app_data, _srv: srv };
    if (s.role === "employee") {
      await currentEmployee(c, s.uid);
      next.users = cur.users || []; // funcionário não mexe em logins e senhas
    }
    // limites do plano (só bloqueia o que aumenta)
    if (newOrders > 0 && srv.orders_created + newOrders > st.limits.orders) throw httpError(403, "Você chegou ao limite de pedidos do seu plano.", { code: "limit_orders", limit: st.limits.orders });
    const before = usageOf(cur, srv), after = usageOf(next, srv);
    if (after.users > before.users && after.users > st.limits.users) throw httpError(403, "Você chegou ao limite de usuários do seu plano.", { code: "limit_users", limit: st.limits.users });
    if (after.photos > before.photos && after.photos > st.limits.photos) throw httpError(403, "Você chegou ao limite de fotos do seu plano.", { code: "limit_photos", limit: st.limits.photos });
    srv.orders_created += newOrders;
    next._srv = srv;
    const { error } = await db().from("companies").update({ app_data: next }).eq("id", s.cid);
    if (error) throw httpError(500, "Não foi possível salvar agora.");
    return { ok: true, plan: publicState(stateOf({ ...c, app_data: next })) };
  },

  async poll({ full }, s) {
    const c = await loadCompany(s.cid, "id, plan_id, status, trial_ends_at, app_data");
    const st = stateOf(c);
    if (s.role === "employee") { await currentEmployee(c, s.uid); if (st.locked) throw httpError(402, "O acesso desta empresa está suspenso.", { code: "locked" }); }
    const a = c.app_data || {};
    const out = { notifications: a.notifications || [], photos: a.photos || [], readyStock: a.readyStock || [], plan: publicState(st) };
    if (full) Object.assign(out, { production: a.production || [], finalization: a.finalization || [], orders: a.orders || [] });
    return out;
  },

  async uploadPhoto({ pedido, data }, s) {
    const c = await loadCompany(s.cid, "id, plan_id, status, trial_ends_at, app_data");
    const st = stateOf(c);
    if (st.locked) throw httpError(402, "Plano vencido.", { code: "locked" });
    if (!st.features.photos && !st.features.ready) throw httpError(403, "Fotos estão disponíveis a partir do plano PRO.", { code: "feature" });
    if (usageOf(c.app_data, c.app_data?._srv).photos >= st.limits.photos) throw httpError(403, "Você chegou ao limite de fotos do seu plano.", { code: "limit_photos" });
    const buf = Buffer.from(String(data || ""), "base64");
    if (!buf.length || buf.length > 4 * 1024 * 1024) throw httpError(400, "Foto inválida ou grande demais.");
    const id = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    const path = `${s.cid}/${String(pedido || "geral").replace(/[^\w-]/g, "")}/${id}.jpg`;
    let up = await db().storage.from("fotos").upload(path, buf, { contentType: "image/jpeg" });
    if (up.error && /not found|bucket/i.test(up.error.message) && SECURE) { await db().storage.createBucket("fotos", { public: true }); up = await db().storage.from("fotos").upload(path, buf, { contentType: "image/jpeg" }); }
    if (up.error) throw httpError(500, "Não consegui guardar a foto agora.", { code: "storage" });
    const { data: pub } = db().storage.from("fotos").getPublicUrl(path);
    return { id, url: pub.publicUrl, path };
  },

  async deletePhoto({ path }, s) {
    if (!path || !String(path).startsWith(`${s.cid}/`)) throw httpError(403, "Foto de outra empresa.");
    if (s.role === "employee") { const c = await loadCompany(s.cid, "id, app_data"); await currentEmployee(c, s.uid); }
    await db().storage.from("fotos").remove([path]);
    return { ok: true };
  },

  // ── Painel do criador ──
  async creatorList(_, s) {
    await requireCreator(s);
    const { data, error } = await db().from("companies").select("id, company_name, admin_email, plan_id, status, trial_ends_at, created_at, app_data");
    if (error) throw httpError(500, "Não consegui listar as empresas.");
    return { companies: data.map(c => { const st = stateOf(c); return { ...meta(c), admin_email: c.admin_email, created_at: c.created_at, plan_id: st.id, legacy: st.legacy, locked: st.locked, daysLeft: st.daysLeft, usage: st.usage, limits: publicState(st).limits, extras: c.app_data?._srv?.extras || {} }; }).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))) };
  },
  async creatorUpdate({ companyId, plan_id, status, trial_ends_at, extras }, s) {
    await requireCreator(s);
    if (companyId === s.cid && plan_id && plan_id !== "creator") throw httpError(400, "A conta do criador não muda de plano.");
    const c = await loadCompany(companyId, "id, plan_id, app_data");
    if (isCreatorCo(c) && plan_id && plan_id !== "creator") throw httpError(400, "A conta do criador não muda de plano.");
    const patch = {};
    if (plan_id) { if (!PLANS[plan_id]) throw httpError(400, "Plano inválido."); patch.plan_id = plan_id; }
    const a0 = c.app_data || {};
    if (plan_id && !isCreatorCo(c)) patch.app_data = { ...a0, _srv: { orders_created: (a0.orders || []).length, ...(a0._srv || {}), legacyPlan: undefined } };
    if (status) patch.status = status;
    if (trial_ends_at) patch.trial_ends_at = trial_ends_at;
    if (extras) { const a = patch.app_data || c.app_data || {}; patch.app_data = { ...a, _srv: { ...(a._srv || {}), extras: { orders: Math.max(0, Number(extras.orders) || 0), photos: Math.max(0, Number(extras.photos) || 0) } } }; }
    const { error } = await db().from("companies").update(patch).eq("id", companyId);
    if (error) throw httpError(500, "Não consegui atualizar.");
    return { ok: true };
  },
};

async function requireCreator(s) {
  if (s.role !== "admin") throw httpError(403, "Só o criador.");
  const c = await loadCompany(s.cid, "id, plan_id");
  if (!isCreatorCo(c)) throw httpError(403, "Só o criador.");
}

const PUBLIC = new Set(["ping", "register", "adminLogin", "employeeLogin"]);

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: { message: "Method Not Allowed" } });
  try {
    const body = JSON.parse(event.body || "{}");
    const fn = actions[body.action];
    if (!fn) throw httpError(400, "Ação desconhecida.");
    const session = PUBLIC.has(body.action) ? null : verifyToken(tokenFromEvent(event));
    return json(200, await fn(body, session));
  } catch (e) { return fail(e); }
};
