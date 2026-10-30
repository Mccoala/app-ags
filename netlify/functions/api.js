import crypto from "node:crypto";
import zlib from "node:zlib";
import { db, SECURE, signToken, verifyToken, tokenFromEvent, hashPassword, checkPassword, httpError, json, fail, loadCompany, isCreatorCo, isLegacy, effective, NO_PLAN } from "../lib/server.js";
import { planState, usageOf, normPlan, PLANS } from "../../src/lib/plans.js";
import { externalize, signForClient, hasInlineImages, hasPublicLinks, signOne } from "../lib/media.js";
import { scrubForUser } from "../../src/lib/core.js";

// ─────────────────────────────────────────────────────────────────────────────
// API do Inflatudo. Todo acesso aos dados passa por aqui:
// confere quem está logado, de qual empresa é, e o que o plano permite.
// Uma empresa nunca recebe dados de outra.
// ─────────────────────────────────────────────────────────────────────────────

const meta = (c) => ({ company_id: c.id, company_name: c.company_name, plan: c.plan_id, status: c.status, trial_ends_at: c.trial_ends_at });
const stateOf = (c0) => { const c = effective(c0); const s = planState({ ...c, extras: c.app_data?._srv?.extras, billing: c.app_data?._srv?.billing }); return { ...s, legacy: !isCreatorCo(c0) && isLegacy(c0), limits: { ...s.limits }, usage: usageOf(c.app_data, c.app_data?._srv) }; };
const publicState = (st) => ({ ...st, limits: Object.fromEntries(Object.entries(st.limits).map(([k, v]) => [k, v === Infinity ? null : v])) }); // Infinity não existe em JSON

// Funcionário não recebe senhas nem dados do dono
// Senhas dos funcionários: guardadas embaralhadas (scrypt) e nunca mandadas para a tela
const isHashed = (p) => String(p || "").startsWith("scrypt$");
const publicUsers = (users) => (users || []).map(u => { const { password, ...rest } = u; return { ...rest, hasPassword: !!password }; });
function mergeUsers(incoming, old) {
  return (incoming || []).map(u => {
    const o = (old || []).find(x => String(x.id) === String(u.id));
    const { hasPassword, ...out } = u;
    let pw = out.password;
    if (pw === undefined || pw === null || pw === "") pw = o?.password || ""; // a tela não manda a senha: mantém a guardada
    if (pw && !isHashed(pw)) {
      if (pw === "1234" && out.autoLogin && out.mustChange === undefined) out.mustChange = true; // senha automática antiga: troca no 1º acesso
      pw = hashPassword(pw);
    }
    out.password = pw;
    return out;
  });
}
const hasPlainPasswords = (users) => (users || []).some(u => u.password && !isHashed(u.password));

// Vendedor com "ver só o que é dele": o servidor manda só os pedidos, produção, clientes e avisos dele.
// Fotos e pronta entrega vêm completos. Ao gravar, junta de volta com o resto da empresa.
const sellerScoped = (emp) => !!emp?.sellerName && emp.ownOnly !== false;
function scopeForSeller(a, emp) {
  const v = scrubForUser(a, { role: "employee", sellerName: emp.sellerName });
  return { ...v, photos: a.photos || [], readyStock: a.readyStock || [], settings: a.settings };
}
const SCOPED_KEYS = { orders: (x) => String(x.id), production: (x) => String(x.itemId), finalization: (x) => String(x.itemId), clients: (x) => String(x.id ?? x.name), notifications: (x) => String(x.id), log: (x) => `${x.em}|${x.usuario}|${x.texto}` };
function mergeScoped(cur, inc, emp) {
  const vis = scopeForSeller(cur, emp);
  const out = { ...cur, ...inc };
  for (const [k, key] of Object.entries(SCOPED_KEYS)) {
    const seen = new Set((vis[k] || []).map(key));
    const incMap = new Map((inc[k] || []).map(x => [key(x), x]));
    const res = [];
    for (const x of cur[k] || []) { // mantém a ordem: troca o que ele vê pela versão nova, o resto fica igual
      const id = key(x);
      if (!seen.has(id)) res.push(x);
      else if (incMap.has(id)) { res.push(incMap.get(id)); incMap.delete(id); }
    }
    out[k] = [...res, ...incMap.values()];
  }
  out.log = (out.log || []).slice(-800);
  out.brain = cur.brain; out.sellers = cur.sellers; out.users = cur.users; // o que o vendedor não vê fica como está
  return out;
}

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

  async employeeLogin({ companyId, login, password, newPassword }) {
    if (!companyId) throw httpError(400, "Link de empresa inválido. Peça o link correto ao seu administrador.");
    if (!login || !password) throw httpError(400, "Preencha usuário e senha.");
    let c; try { c = await loadCompany(companyId, "id, company_name, plan_id, status, trial_ends_at, app_data"); } catch { throw httpError(404, "Empresa não encontrada. Confira o link com o seu administrador."); }
    const l = String(login).trim().toLowerCase();
    const byLogin = (c.app_data?.users || []).find(u => String(u.email || "").trim().toLowerCase() === l);
    if (byLogin && !byLogin.password) throw httpError(403, "Seu acesso ainda não foi liberado. Peça ao gerente para definir sua senha.", { code: "no_password" });
    const emp = byLogin && checkPassword(password, byLogin.password) ? byLogin : null;
    if (!emp) throw httpError(401, "Usuário ou senha incorretos.");
    const st = stateOf(c);
    if (st.locked) throw httpError(402, "O acesso desta empresa está suspenso. Fale com o responsável.", { code: "locked" });
    // primeiro acesso (ou senha 1234 antiga): a pessoa cria a própria senha antes de entrar
    const weak = String(password) === "1234";
    if (emp.mustChange || weak) {
      if (!newPassword) throw httpError(409, "Primeiro acesso: crie sua senha.", { code: "must_change" });
      if (String(newPassword).length < 6) throw httpError(400, "A senha nova precisa ter pelo menos 6 caracteres.", { code: "must_change" });
      if (String(newPassword) === String(password)) throw httpError(400, "A senha nova precisa ser diferente da atual.", { code: "must_change" });
      const a = c.app_data || {};
      const users = (a.users || []).map(u => u.id === emp.id ? { ...u, password: hashPassword(newPassword), mustChange: false } : u);
      const fixed = mergeUsers(users, users); // aproveita e embaralha qualquer senha antiga
      const { error } = await db().from("companies").update({ app_data: { ...a, users: fixed } }).eq("id", c.id);
      if (error) throw httpError(500, "Não consegui salvar a senha agora.");
    }
    const token = signToken({ cid: c.id, uid: emp.id, role: "employee" });
    return { token, user: { id: emp.id, name: emp.name, role: "employee", permissions: emp.permissions || [], sellerName: emp.sellerName || "", company_id: c.id, company_name: c.company_name } };
  },

  async load(_, s) {
    const c = await loadCompany(s.cid);
    // fotos antigas guardadas dentro dos dados: passam para a pasta fechada (uma vez só)
    if (c.app_data && (hasInlineImages(c.app_data) || hasPublicLinks(c.app_data))) {
      try {
        const moved = await externalize(c.app_data, c.id);
        if (moved !== c.app_data) {
          const { error } = await db().from("companies").update({ app_data: moved }).eq("id", c.id);
          if (!error) c.app_data = moved;
        }
      } catch (e) { console.warn("migração de fotos adiada", e.message); }
    }
    if (c.app_data && hasPlainPasswords(c.app_data.users)) {
      const moved = { ...c.app_data, users: mergeUsers(c.app_data.users, c.app_data.users) };
      const { error } = await db().from("companies").update({ app_data: moved }).eq("id", c.id);
      if (!error) c.app_data = moved;
    }
    const st = stateOf(c);
    let user = null, app_data = c.app_data || {};
    if (s.role === "employee") {
      const emp = await currentEmployee(c, s.uid);
      if (st.locked) throw httpError(402, "O acesso desta empresa está suspenso. Fale com o responsável.", { code: "locked" });
      user = { permissions: emp.permissions || [], sellerName: emp.sellerName || "", name: emp.name, ownOnly: emp.ownOnly !== false };
      app_data = scrubForEmployee(sellerScoped(emp) ? scopeForSeller(app_data, emp) : app_data);
    }
    app_data = await signForClient({ ...app_data, users: publicUsers(app_data.users) });
    return { app_data, company: meta(c), plan: publicState(st), user };
  },

  async save({ app_data, deleted }, s) {
    if (!app_data || typeof app_data !== "object") throw httpError(400, "Dados inválidos.");
    const c = await loadCompany(s.cid);
    app_data = await externalize(app_data, s.cid); // fotos novas vão para a pasta fechada, com qualidade original
    if (s.role === "employee") { // vendedor que só vê o que é dele: junta as mudanças com o resto da empresa
      const emp0 = await currentEmployee(c, s.uid);
      if (sellerScoped(emp0)) app_data = mergeScoped(c.app_data || {}, app_data, emp0);
    }
    // Proteção: nunca deixa uma tela vazia (que não carregou) gravar por cima da empresa
    {
      const cur0 = c.app_data || {};
      const n0 = (cur0.orders || []).length, n1 = Array.isArray(app_data.orders) ? app_data.orders.length : 0;
      const filled = (a) => ["orders", "clients", "team", "production", "finalization", "users"].reduce((t, k) => t + ((a?.[k] || []).length || 0), 0);
      // exclusão pedida de propósito: só libera se TODOS os pedidos que sumiram estão na lista de excluídos
      const keep = new Set((app_data.orders || []).map(o => String(o.id)));
      const gone = (cur0.orders || []).filter(o => !keep.has(String(o.id))).map(o => String(o.id));
      const asked = new Set((Array.isArray(deleted) ? deleted : []).map(String));
      const intended = gone.length > 0 && gone.every(id => asked.has(id));
      const wipe = !intended && filled(cur0) >= 3 && filled(app_data) === 0;
      const bigDrop = !intended && n0 >= 3 && n1 < n0 * 0.5;
      if (wipe || bigDrop) {
        console.warn("save bloqueado (encolheu demais)", { cid: s.cid, antes: n0, depois: n1, wipe });
        throw httpError(409, "Para proteger seus dados, esta gravação foi bloqueada: a tela estava com informações faltando. Atualize a página.", { code: "shrink_blocked" });
      }
    }
    const st = stateOf(c);
    if (st.locked) throw httpError(402, st.reason === "trial" ? "Seu teste grátis terminou. Escolha um plano para continuar." : "Seu plano está vencido. Renove para continuar.", { code: "locked" });
    const cur = c.app_data || {};
    const srv = { orders_created: 0, ...(cur._srv || {}) };
    if (!cur._srv && c.app_data) srv.legacyPlan = c.plan_id ?? NO_PLAN; // empresa antiga: guarda o plano de agora
    srv.orders_created = Math.max(srv.orders_created || 0, (cur.orders || []).length);
    const curIds = new Set((cur.orders || []).map(o => String(o.id)));
    const newOrders = (app_data.orders || []).filter(o => !curIds.has(String(o.id))).length;
    // Pedidos excluídos ficam guardados na lixeira (dá para recuperar)
    const newIds = new Set((app_data.orders || []).map(o => String(o.id)));
    const gone = (cur.orders || []).filter(o => !newIds.has(String(o.id)));
    if (gone.length) {
      const at = new Date().toISOString(), by = s.role === "employee" ? `func:${s.uid}` : "admin";
      srv.trash = [...(srv.trash || []), ...gone.map(o => ({ at, by, order: o, production: (cur.production || []).filter(p => String(p.orderId) === String(o.id)), finalization: (cur.finalization || []).filter(f => String(f.orderId) === String(o.id)) }))].slice(-300);
    }
    const next = { ...app_data, _srv: srv };
    if (s.role === "employee") {
      await currentEmployee(c, s.uid);
      next.users = cur.users || []; // funcionário não mexe em logins e senhas
    } else next.users = mergeUsers(app_data.users, cur.users); // senha nova → embaralhada; sem senha na tela → mantém a guardada
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
    let emp = null;
    if (s.role === "employee") { emp = await currentEmployee(c, s.uid); if (st.locked) throw httpError(402, "O acesso desta empresa está suspenso.", { code: "locked" }); }
    const a = sellerScoped(emp) ? scopeForSeller(c.app_data || {}, emp) : (c.app_data || {});
    const out = { notifications: a.notifications || [], photos: a.photos || [], readyStock: a.readyStock || [], plan: publicState(st) };
    if (full) Object.assign(out, { production: a.production || [], finalization: a.finalization || [], orders: a.orders || [] });
    return await signForClient(out);
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
    if (up.error && /not found|bucket/i.test(up.error.message) && SECURE) { await db().storage.createBucket("fotos", { public: false }); up = await db().storage.from("fotos").upload(path, buf, { contentType: "image/jpeg" }); }
    if (up.error) throw httpError(500, "Não consegui guardar a foto agora.", { code: "storage" });
    return { id, url: await signOne("fotos", path), path };
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
    return { companies: data.map(c => { const st = stateOf(c); return { ...meta(c), admin_email: c.admin_email, created_at: c.created_at, plan_id: st.id, legacy: st.legacy, locked: st.locked, billing: st.billing, daysLeft: st.daysLeft, usage: st.usage, limits: publicState(st).limits, extras: c.app_data?._srv?.extras || {}, revenue: revenueOf(c.app_data), orders_count: (c.app_data?.orders || []).length }; }).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))) };
  },
  async creatorUpdate({ companyId, plan_id, status, trial_ends_at, extras, nextChargeAt, admin_email, password }, s) {
    await requireCreator(s);
    // acesso do dono da fábrica (vale também para a própria conta do criador)
    const access = {};
    if (admin_email !== undefined) {
      const em = String(admin_email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw httpError(400, "E-mail inválido.");
      const { data: other } = await db().from("companies").select("id").eq("admin_email", em).neq("id", companyId).maybeSingle();
      if (other) throw httpError(409, "Esse e-mail já é usado por outra empresa.");
      access.admin_email = em;
    }
    if (password !== undefined && password !== "") {
      if (String(password).length < 6) throw httpError(400, "A senha precisa ter pelo menos 6 caracteres.");
      access.admin_password = hashPassword(password);
    }
    if (companyId === s.cid && plan_id && plan_id !== "creator") throw httpError(400, "A conta do criador não muda de plano.");
    const c = await loadCompany(companyId, "id, plan_id, app_data");
    if (isCreatorCo(c) && plan_id && plan_id !== "creator") throw httpError(400, "A conta do criador não muda de plano.");
    const patch = { ...access };
    if (plan_id) { if (!PLANS[plan_id]) throw httpError(400, "Plano inválido."); patch.plan_id = plan_id; }
    const a0 = c.app_data || {};
    if (plan_id && !isCreatorCo(c)) patch.app_data = { ...a0, _srv: { orders_created: (a0.orders || []).length, ...(a0._srv || {}), legacyPlan: undefined } };
    if (status) patch.status = status;
    if (trial_ends_at) patch.trial_ends_at = trial_ends_at;
    if (extras) { const a = patch.app_data || c.app_data || {}; patch.app_data = { ...a, _srv: { ...(a._srv || {}), extras: { orders: Math.max(0, Number(extras.orders) || 0), photos: Math.max(0, Number(extras.photos) || 0) } } }; }
    if (nextChargeAt !== undefined) { const a = patch.app_data || c.app_data || {}; const srv = { ...(a._srv || {}) }; srv.billing = { ...(srv.billing || {}), nextChargeAt: nextChargeAt || null, ...(nextChargeAt && !srv.billing?.activeSince ? { activeSince: new Date().toISOString() } : {}) }; patch.app_data = { ...a, _srv: srv }; }
    const { error } = await db().from("companies").update(patch).eq("id", companyId);
    if (error) throw httpError(500, "Não consegui atualizar.");
    return { ok: true };
  },

  // Apagar a conta (login) de uma fábrica. Antes guarda uma cópia completa na pasta
  // fechada "backups/apagadas" — se a cópia falhar, nada é apagado.
  async creatorDelete({ companyId, confirmName }, s) {
    await requireCreator(s);
    if (!companyId || companyId === s.cid) throw httpError(400, "Não dá para apagar a conta do criador.");
    const { data: c, error: e1 } = await db().from("companies").select("*").eq("id", companyId).maybeSingle();
    if (e1 || !c) throw httpError(404, "Empresa não encontrada.");
    if (isCreatorCo(c)) throw httpError(400, "Não dá para apagar a conta do criador.");
    const norm = (x) => String(x || "").trim().toLowerCase();
    if (!confirmName || norm(confirmName) !== norm(c.company_name)) throw httpError(400, "Digite o nome da empresa exatamente para confirmar.");
    const body = zlib.gzipSync(Buffer.from(JSON.stringify({ deletedAt: new Date().toISOString(), deletedBy: s.uid || "criador", company: c })));
    const path = `apagadas/${new Date().toISOString().slice(0, 10)}-${companyId}.json.gz`;
    let up = await db().storage.from("backups").upload(path, body, { contentType: "application/gzip", upsert: true });
    if (up.error && /not found|bucket/i.test(up.error.message)) { await db().storage.createBucket("backups", { public: false }); up = await db().storage.from("backups").upload(path, body, { contentType: "application/gzip", upsert: true }); }
    if (up.error) throw httpError(500, "Não consegui guardar a cópia de segurança, então não apaguei nada.");
    const { error } = await db().from("companies").delete().eq("id", companyId);
    if (error) throw httpError(500, `Não consegui apagar: ${error.message}`);
    return { ok: true, backup: path };
  },
};

// Quanto a fábrica já vendeu (soma dos pedidos)
function revenueOf(a) {
  return (a?.orders || []).reduce((t, o) => t + (Number(o.totalPrice) || (o.items || []).reduce((x, i) => x + (Number(i.price) || 0), 0)), 0);
}

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
    // conta apagada: qualquer sessão aberta dela cai na hora (volta para o login)
    if (session) {
      const { data: alive, error } = await db().from("companies").select("id").eq("id", session.cid).maybeSingle();
      if (!error && !alive) throw httpError(401, "Esta conta não existe mais.", { code: "account_deleted" });
    }
    return json(200, await fn(body, session));
  } catch (e) { return fail(e); }
};
