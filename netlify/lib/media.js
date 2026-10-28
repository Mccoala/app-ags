import crypto from "node:crypto";
import { db } from "./server.js";

// ── Imagens fora dos dados da empresa ─────────────────────────────────────────
// As fotos ficam em pastas FECHADAS do Supabase Storage, com os bytes originais
// (sem recomprimir: baixar devolve a imagem em qualidade total).
// No banco fica só uma marca curta: "sb:<pasta>/<caminho>".
// Quem está logado recebe um link assinado que vale alguns dias.

const PRIV = "privado";          // imagens dos pedidos, pronta entrega etc.
const PRIVATE_BUCKETS = [PRIV, "fotos"];
const SIGN_SECONDS = 7 * 24 * 3600;
const BASE = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const MARK = "sb:";

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const { error } = await db().storage.getBucket(PRIV);
  if (error) {
    const r = await db().storage.createBucket(PRIV, { public: false });
    if (r.error && !/already exists/i.test(r.error.message)) throw r.error;
  }
  bucketReady = true;
}

// percorre o objeto inteiro (menos _srv) e troca as strings que `fn` devolver
function mapStrings(obj, fn) {
  if (typeof obj === "string") { const r = fn(obj); return r === undefined ? obj : r; }
  if (Array.isArray(obj)) { let ch = false; const out = obj.map(v => { const n = mapStrings(v, fn); if (n !== v) ch = true; return n; }); return ch ? out : obj; }
  if (obj && typeof obj === "object") {
    let ch = false; const out = {};
    for (const [k, v] of Object.entries(obj)) { if (k === "_srv") { out[k] = v; continue; } const n = mapStrings(v, fn); if (n !== v) ch = true; out[k] = n; }
    return ch ? out : obj;
  }
  return obj;
}
function collect(obj, test, acc = new Set()) {
  if (typeof obj === "string") { if (test(obj)) acc.add(obj); }
  else if (Array.isArray(obj)) obj.forEach(v => collect(v, test, acc));
  else if (obj && typeof obj === "object") for (const [k, v] of Object.entries(obj)) { if (k !== "_srv") collect(v, test, acc); }
  return acc;
}

const isDataImg = (s) => s.length > 200 && /^data:image\/[\w.+-]+;base64,/.test(s);
const EXT = { jpeg: "jpg", jpg: "jpg", png: "png", webp: "webp", gif: "gif", heic: "heic", heif: "heif", "svg+xml": "svg" };

// link do nosso Storage (público ou assinado) → marca "sb:pasta/caminho"
function toMark(s) {
  if (!BASE || !s.startsWith(BASE + "/storage/v1/object/")) return undefined;
  const m = s.slice(BASE.length).match(/^\/storage\/v1\/object\/(?:public|sign)\/([^/?]+)\/([^?]+)/);
  if (!m || !PRIVATE_BUCKETS.includes(m[1])) return undefined;
  return `${MARK}${m[1]}/${decodeURIComponent(m[2])}`;
}

// 1) Antes de gravar: links voltam a ser marca; imagens coladas (data:) sobem para a pasta fechada
export async function externalize(app_data, cid) {
  let d = mapStrings(app_data, toMark);
  const imgs = [...collect(d, isDataImg)];
  if (!imgs.length) return d;
  await ensureBucket();
  const map = new Map();
  for (let i = 0; i < imgs.length; i += 6) {
    await Promise.all(imgs.slice(i, i + 6).map(async (s) => {
      const [head, b64] = s.split(",", 2);
      const type = head.slice(5, head.indexOf(";"));
      const buf = Buffer.from(b64, "base64");
      const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 32);
      const path = `${cid}/img/${hash}.${EXT[type.split("/")[1]] || "bin"}`;
      const up = await db().storage.from(PRIV).upload(path, buf, { contentType: type, upsert: true });
      if (up.error) throw up.error;
      map.set(s, `${MARK}${PRIV}/${path}`);
    }));
  }
  return mapStrings(d, (s) => map.get(s));
}

// 2) Antes de mandar para a tela: marca vira link assinado
export async function signForClient(app_data) {
  const marks = [...collect(app_data, (s) => s.startsWith(MARK))];
  if (!marks.length) return app_data;
  const byBucket = {};
  marks.forEach(m => { const rest = m.slice(MARK.length); const i = rest.indexOf("/"); (byBucket[rest.slice(0, i)] ||= []).push(rest.slice(i + 1)); });
  const map = new Map();
  for (const [bucket, paths] of Object.entries(byBucket)) {
    for (let i = 0; i < paths.length; i += 200) {
      const { data, error } = await db().storage.from(bucket).createSignedUrls(paths.slice(i, i + 200), SIGN_SECONDS);
      if (error) { console.warn("sign", bucket, error.message); continue; }
      (data || []).forEach(r => { if (r.signedUrl && r.path) map.set(`${MARK}${bucket}/${r.path}`, r.signedUrl.startsWith("http") ? r.signedUrl : BASE + "/storage/v1" + r.signedUrl); });
    }
  }
  return mapStrings(app_data, (s) => map.get(s));
}

export const hasInlineImages = (app_data) => collect(app_data, isDataImg).size > 0;
export const hasPublicLinks = (app_data) => collect(app_data, (s) => toMark(s) !== undefined).size > 0;
export async function signOne(bucket, path) {
  const { data, error } = await db().storage.from(bucket).createSignedUrl(path, SIGN_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}
