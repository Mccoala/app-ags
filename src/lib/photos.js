import { api } from "./api";
import { orderNumber } from "./core";
import { importRetry } from "./safeImport";

// ── Fotos dos brinquedos finalizados ─────────────────────────────────────────
// A foto sai em alta qualidade (lado maior até 2560px, JPEG 88%) com data e hora carimbadas.
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

export const fmtDateTime = (iso) => { try { const d = new Date(iso); return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`; } catch { return ""; } };

// Carimbo no canto da foto: "Pedido 1505 · 27/10/2026 01:05" (vai junto quando baixar ou mandar no WhatsApp)
function stamp(canvas, text) {
  const ctx = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
  const fs = Math.max(14, Math.round(Math.min(w, h) * 0.035));
  ctx.font = `800 ${fs}px Inter, system-ui, sans-serif`;
  const pad = Math.round(fs * 0.55), tw = ctx.measureText(text).width;
  const bw = tw + pad * 2, bh = fs + pad * 1.6, x = Math.round(fs * 0.6), y = h - bh - Math.round(fs * 0.6);
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, bw, bh, fs * 0.4); ctx.fill(); } else ctx.fillRect(x, y, bw, bh);
  ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(text, x + pad, y + bh / 2);
}

// Reduz a foto e marca data/hora. Devolve { blob, preview (url local), size, takenAt }
export async function compressPhoto(file, maxSide = 1280, quality = 0.72, label = "") {
  const img = await loadImage(file);
  const takenAt = new Date().toISOString();
  let canvas = draw(img, maxSide);
  stamp(canvas, `${label ? label + " · " : ""}${fmtDateTime(takenAt)}`);
  let blob = await toBlob(canvas, quality);
  if (blob.size > 3.4 * 1024 * 1024) { // limite do envio: reduz só o necessário
    canvas = draw(img, Math.round(maxSide * 0.75));
    stamp(canvas, `${label ? label + " · " : ""}${fmtDateTime(takenAt)}`);
    blob = await toBlob(canvas, Math.min(quality, 0.82));
  }
  return { blob, preview: URL.createObjectURL(blob), size: blob.size, takenAt };
}

const blobToDataURL = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });

async function smallDataURL(blob) {
  const img = await loadImage(blob);
  return blobToDataURL(await toBlob(draw(img, 720), 0.6));
}

// Envia uma foto pelo servidor seguro e devolve { id, url, path }
export async function uploadPhoto(companyId, pedido, blob) {
  const b64 = (await blobToDataURL(blob)).split(",")[1];
  try {
    return await api("uploadPhoto", { pedido, data: b64 });
  } catch (e) {
    if (e.code !== "storage") throw e; // limite do plano / plano vencido: avisa quem tirou a foto
    console.warn("Armazenamento indisponível, guardando a foto reduzida nos dados", e.message);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return { id, url: await smallDataURL(blob), path: null, inline: true };
  }
}

export async function deleteStoredPhoto(photo) {
  if (!photo?.path) return;
  try { await api("deletePhoto", { path: photo.path }); } catch { }
}

// Monta os registros que vão para data.photos
export function photoRecords(uploaded, { order, item, seller, by }) {
  const now = new Date().toISOString();
  return uploaded.map(u => ({
    id: u.id, url: u.url, path: u.path || null, inline: !!u.inline,
    pedido: orderNumber(order.id), orderId: order.id, itemId: item?.itemId || null, toy: item?.toy || "",
    vendedor: seller || order.seller || "Sem vendedor", cliente: order.clientName || "", em: u.em || now, por: by || "",
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
