import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// ── Conexão com o banco pelo servidor ─────────────────────────────────────────
// Com SUPABASE_SERVICE_ROLE_KEY o servidor passa por cima do bloqueio do banco (RLS).
// Sem ela, usa a chave pública (funciona só enquanto o banco ainda não foi fechado).
export const SECURE = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY_ = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
let _db = null;
export function db() {
  if (!URL_ || !KEY_) throw httpError(500, "Servidor sem as chaves do banco configuradas.");
  if (!_db) _db = createClient(URL_, KEY_, { auth: { persistSession: false, autoRefreshToken: false } });
  return _db;
}

// ── Sessão (token assinado) ───────────────────────────────────────────────────
const SECRET = crypto.createHash("sha256").update(String(process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || KEY_ || "inflatudo") + "|inflatudo-session-v1").digest();
const b64 = (b) => Buffer.from(b).toString("base64url");
export function signToken(payload, days = 30) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + days * 86400000 }));
  const sig = b64(crypto.createHmac("sha256", SECRET).update(body).digest());
  return `${body}.${sig}`;
}
export function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) throw httpError(401, "Faça login novamente.");
  const [body, sig] = token.split(".");
  const good = b64(crypto.createHmac("sha256", SECRET).update(body).digest());
  if (!sig || sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) throw httpError(401, "Sessão inválida. Faça login novamente.");
  const p = JSON.parse(Buffer.from(body, "base64url").toString());
  if (!p.exp || p.exp < Date.now()) throw httpError(401, "Sua sessão expirou. Faça login novamente.");
  return p; // { cid, uid, role }
}
export function tokenFromEvent(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

// ── Senhas (embaralhadas com scrypt) ──────────────────────────────────────────
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 32);
  return `scrypt$${b64(salt)}$${b64(h)}`;
}
export function checkPassword(pw, stored) {
  if (!stored) return false;
  if (!String(stored).startsWith("scrypt$")) {
    const a = Buffer.from(String(pw)), b = Buffer.from(String(stored));
    return a.length === b.length && crypto.timingSafeEqual(a, b); // senha antiga (ainda não embaralhada)
  }
  const [, salt, h] = String(stored).split("$");
  const calc = crypto.scryptSync(String(pw), Buffer.from(salt, "base64url"), 32);
  const want = Buffer.from(h, "base64url");
  return calc.length === want.length && crypto.timingSafeEqual(calc, want);
}

// ── Respostas ─────────────────────────────────────────────────────────────────
export function httpError(status, message, extra = {}) { const e = new Error(message); e.status = status; e.extra = extra; return e; }
export const json = (status, body) => ({ statusCode: status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });
export function fail(e) {
  const status = e.status || 500;
  if (status >= 500) console.error(e);
  return json(status, { error: { message: e.message || "Erro no servidor", ...(e.extra || {}) } });
}

// Empresa completa (só no servidor)
export async function loadCompany(cid, cols = "*") {
  const { data, error } = await db().from("companies").select(cols).eq("id", cid).single();
  if (error || !data) throw httpError(404, "Empresa não encontrada.");
  return data;
}

// ── Planos: conta do criador e empresas antigas ────────────────────────────────
// Conta do criador (Inflatudo): não tem plano nem trava
const CREATOR_ID = String(process.env.CREATOR_COMPANY_ID || "bdf93b82").toLowerCase();
export const isCreatorCo = (c) => c?.plan_id === "creator" || (!!c?.id && String(c.id).toLowerCase().startsWith(CREATOR_ID));
// Empresas que já existiam antes dos planos continuam com tudo liberado até o criador
// (ou a assinatura) definir um plano. Qualquer troca de plano encerra isso sozinha.
export const NO_PLAN = "-";
export const isLegacy = (c) => { const srv = c?.app_data?._srv; if (!srv) return !!c?.app_data; return srv.legacyPlan !== undefined && srv.legacyPlan === (c.plan_id ?? NO_PLAN); };
export const effective = (c) => isCreatorCo(c) ? { ...c, plan_id: "creator", status: "active" } : isLegacy(c) && String(c.status || "").toLowerCase() !== "blocked" ? { ...c, plan_id: "ultra", status: "active", trial_ends_at: null } : c;
