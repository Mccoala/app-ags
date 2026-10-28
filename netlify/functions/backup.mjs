import zlib from "node:zlib";
import { db } from "../lib/server.js";

// ── Cópia de segurança diária ─────────────────────────────────────────────────
// Todo dia guarda TODAS as empresas (dados completos) numa pasta fechada do
// Supabase Storage ("backups"), um arquivo por dia, e mantém os últimos 30 dias.
// As fotos já ficam em pastas fechadas próprias e nunca são apagadas por aqui.

const BUCKET = "backups";
const KEEP_DAYS = 30;

export default async () => {
  const started = Date.now();
  const { error: be } = await db().storage.getBucket(BUCKET);
  if (be) {
    const r = await db().storage.createBucket(BUCKET, { public: false });
    if (r.error && !/already exists/i.test(r.error.message)) throw r.error;
  }
  const { data, error } = await db().from("companies").select("*");
  if (error) throw error;
  const day = new Date().toISOString().slice(0, 10);
  const body = zlib.gzipSync(Buffer.from(JSON.stringify({ at: new Date().toISOString(), companies: data })));
  const up = await db().storage.from(BUCKET).upload(`${day}.json.gz`, body, { contentType: "application/gzip", upsert: true });
  if (up.error) throw up.error;

  // apaga só as cópias com mais de 30 dias
  const { data: files } = await db().storage.from(BUCKET).list("", { limit: 1000 });
  const limit = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  const old = (files || []).map(f => f.name).filter(n => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(n) && n.slice(0, 10) < limit);
  if (old.length) await db().storage.from(BUCKET).remove(old);

  console.log(`backup ${day}: ${data.length} empresas, ${Math.round(body.length / 1024)} KB, ${Date.now() - started} ms, removidos ${old.length}`);
  return new Response("ok");
};

export const config = { schedule: "0 6 * * *" }; // todo dia às 03:00 (horário de Brasília)
