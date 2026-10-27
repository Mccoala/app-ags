import { supabase } from "./supabase";
import { orderNumber } from "./core";
import { importRetry } from "./safeImport";

// ── Fotos dos brinquedos finalizados ─────────────────────────────────────────
// A foto é reduzida no próprio celular (lado maior 1280px, JPEG ~70%) → normalmente 120–300 KB.
// Vai para o Supabase Storage (pasta "fotos"); se a pasta ainda não existir, fica guardada
// numa versão menor dentro dos dados da empresa, para nunca perder a foto.

export const BUCKET = "fotos";

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não consegui abrir essa imagem.")); };
    img.src = url;
  });
}

function draw(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
  return c;
}
const toBlob = (canvas, q) => new Promise(r => canvas.toBlob(b => r(b), "image/jpeg", q));

// Reduz a foto. Devolve { blob, preview (url local), size }
export async function compressPhoto(file, maxSide = 1280, quality = 0.72) {
  const img = await loadImage(file);
  const blob = await toBlob(draw(img, maxSide), quality);
  return { blob, preview: URL.createObjectURL(blob), size: blob.size };
}

const blobToDataURL = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });

async function smallDataURL(blob) {
  const img = await loadImage(blob);
  return blobToDataURL(await toBlob(draw(img, 720), 0.6));
}

// Envia uma foto e devolve { url, path, inline }
export async function uploadPhoto(companyId, pedido, blob) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const path = `${companyId}/${String(pedido).replace(/[^\w-]/g, "")}/${id}.jpg`;
  try {
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("sem link");
    return { id, url: data.publicUrl, path };
  } catch (e) {
    console.warn("Storage indisponível, guardando a foto reduzida nos dados", e?.message || e);
    return { id, url: await smallDataURL(blob), path: null, inline: true };
  }
}

export async function deleteStoredPhoto(photo) {
  if (!photo?.path) return;
  try { await supabase.storage.from(BUCKET).remove([photo.path]); } catch { }
}

// Monta os registros que vão para data.photos
export function photoRecords(uploaded, { order, item, seller, by }) {
  const now = new Date().toISOString();
  return uploaded.map(u => ({
    id: u.id, url: u.url, path: u.path || null, inline: !!u.inline,
    pedido: orderNumber(order.id), orderId: order.id, itemId: item?.itemId || null, toy: item?.toy || "",
    vendedor: seller || order.seller || "Sem vendedor", cliente: order.clientName || "", em: now, por: by || "",
  }));
}

// ── Download ─────────────────────────────────────────────────────────────────
async function fetchBlob(url) {
  if (url.startsWith("data:")) return (await fetch(url)).blob();
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Falha ao baixar a foto (${r.status})`);
  return r.blob();
}

function saveBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const safe = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

export async function downloadOne(photo, index = 1) {
  saveBlob(await fetchBlob(photo.url), `pedido-${safe(photo.pedido)}-${index}.jpg`);
}

// Baixa várias fotos num .zip. Se vierem de mais de um pedido, cria uma pasta por pedido.
export async function downloadZip(photos, zipName, onProgress) {
  if (photos.length === 1) return downloadOne(photos[0]);
  const { default: JSZip } = await importRetry(() => import("jszip"));
  const zip = new JSZip();
  const multi = new Set(photos.map(p => p.pedido)).size > 1;
  const counter = {};
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    counter[p.pedido] = (counter[p.pedido] || 0) + 1;
    const name = `pedido-${safe(p.pedido)}-${counter[p.pedido]}.jpg`;
    const folder = multi ? `Pedido ${safe(p.pedido)}${p.cliente ? ` - ${safe(p.cliente)}` : ""}/` : "";
    zip.file(folder + name, await fetchBlob(p.url));
    onProgress && onProgress(i + 1, photos.length);
  }
  saveBlob(await zip.generateAsync({ type: "blob" }), `${safe(zipName) || "fotos"}.zip`);
}

export const kb = (n) => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
