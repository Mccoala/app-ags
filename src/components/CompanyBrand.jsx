import React, { useRef, useState } from "react";
import { Upload, Check, ImagePlus, Factory, RefreshCw } from "lucide-react";
import { BrandMark, BrandWord } from "./Brand";

// ── Marca da fábrica do cliente ──────────────────────────────────────────────
// Depois do cadastro, a fábrica coloca o próprio nome e a logo (1:1). Elas
// aparecem no lugar da marca Inflatudo dentro do app, com a mesma animação.
// Fica em data.brand = { name, logo } (a logo vai como imagem; o servidor guarda
// numa pasta fechada e devolve o link assinado).

const CACHE = (cid) => `inflatudo_brand_${cid || "x"}`;
export const cacheBrand = (cid, brand) => { try { localStorage.setItem(CACHE(cid), JSON.stringify({ name: brand?.name || "", logo: brand?.logo && !String(brand.logo).startsWith("data:") ? brand.logo : "" })); } catch { } };
export const cachedBrand = (cid) => { try { return JSON.parse(localStorage.getItem(CACHE(cid)) || "null"); } catch { return null; } };
export const hasBrand = (b) => !!(b && b.name && String(b.name).trim() && b.logo);

// Ícone: logo da fábrica num quadradinho arredondado, com a mesma animação de "inflar"
export function CompanyMark({ brand, size = 40, animate = "intro", className = "" }) {
  if (!brand?.logo) return <BrandMark size={size} animate={animate} className={className} />;
  const anim = animate === "intro" ? "bi-inflate .9s cubic-bezier(.34,1.56,.64,1) both, bi-breathe 4.5s ease-in-out 1.2s infinite" : animate === "pulse" ? "bi-pulse 1.4s ease-in-out infinite" : animate === "breathe" ? "bi-breathe 4.5s ease-in-out infinite" : "none";
  return (
    <span className={`inline-flex flex-shrink-0 bi-hover ${className}`} title={brand.name || ""} style={{ width: size, height: size }}>
      <img src={brand.logo} alt={brand.name || "Logo"} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: size * 0.26, background: "#fff", boxShadow: "0 6px 18px rgba(0,0,0,.25), inset 0 0 0 1px rgba(255,255,255,.1)", animation: anim, transformOrigin: "50% 80%" }} />
    </span>
  );
}

// Nome: escrito com a mesma entrada da logo Inflatudo (aparece da esquerda)
export function CompanyWord({ brand, height = 21, animate = true, className = "", style }) {
  if (!brand?.name) return <BrandWord height={height} animate={animate} className={className} style={style} />;
  return <span className={`block font-black truncate ${className}`} title={brand.name}
    style={{ fontSize: height * (brand.name.length > 18 ? 0.7 : brand.name.length > 12 ? 0.84 : 1.02), lineHeight: 1.05, letterSpacing: "-0.02em", animation: animate ? "bi-wipe .8s cubic-bezier(.16,1,.3,1) .25s both" : "none", ...style }}>{brand.name}</span>;
}

// Recorta a imagem no centro em quadrado 512x512 (mantém transparência em PNG)
export async function squareLogo(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const cv = document.createElement("canvas"); cv.width = cv.height = 512;
    const ctx = cv.getContext("2d"); ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 512, 512);
    const png = /png|webp|svg|gif/i.test(file.type);
    return cv.toDataURL(png ? "image/png" : "image/jpeg", 0.9);
  } finally { URL.revokeObjectURL(url); }
}

// Formulário (nome + logo) usado no início e na tela de Equipe
export function BrandEditor({ brand, onSave, dark, compact = false, cta = "Salvar" }) {
  const [name, setName] = useState(brand?.name || "");
  const [logo, setLogo] = useState(brand?.logo || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const inp = useRef(null);
  const pick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    if (!/^image\//.test(f.type)) { setErr("Escolha uma imagem (PNG ou JPG)."); return; }
    setBusy(true); setErr("");
    try { setLogo(await squareLogo(f)); setSaved(false); } catch { setErr("Não consegui abrir essa imagem. Tente outra."); }
    setBusy(false);
  };
  const ok = name.trim().length >= 2 && !!logo;
  const changed = name.trim() !== (brand?.name || "") || logo !== (brand?.logo || "");
  const save = () => { if (!ok) return; onSave({ name: name.trim(), logo }); setSaved(true); };
  const box = dark ? "bg-gray-800 border-gray-700 text-white" : "bg-gray-50 border-gray-200 text-gray-900";
  return (
    <div className={`flex ${compact ? "flex-col sm:flex-row" : "flex-col"} gap-5 items-center`}>
      <button type="button" onClick={() => inp.current?.click()} data-tour="brand-logo"
        className={`relative group flex-shrink-0 rounded-[28%] overflow-hidden border-2 border-dashed flex items-center justify-center transition ${logo ? "border-transparent" : dark ? "border-gray-600 hover:border-orange-500" : "border-gray-300 hover:border-orange-500"}`}
        style={{ width: compact ? 112 : 148, height: compact ? 112 : 148, background: logo ? "#fff" : undefined }}>
        {logo ? <img src={logo} alt="" className="w-full h-full object-cover" style={{ animation: "bi-inflate .9s cubic-bezier(.34,1.56,.64,1) both" }} />
          : <div className={`flex flex-col items-center gap-1.5 text-xs font-bold ${dark ? "text-gray-400" : "text-gray-500"}`}>{busy ? <RefreshCw size={26} className="animate-spin" /> : <ImagePlus size={30} />}Logo 1:1</div>}
        {logo && <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-black gap-1"><Upload size={15} />Trocar</div>}
        <input ref={inp} type="file" accept="image/*" className="hidden" onChange={pick} />
      </button>
      <div className="w-full flex-1 min-w-0">
        <label className={`text-xs font-black uppercase tracking-widest ${dark ? "text-gray-400" : "text-gray-500"}`}>Nome da fábrica</label>
        <div className={`mt-1.5 flex items-center gap-2 px-3 py-2.5 rounded-xl border ${box}`}><Factory size={17} className="text-orange-500 flex-shrink-0" />
          <input value={name} onChange={e => { setName(e.target.value.slice(0, 40)); setSaved(false); }} placeholder="Ex.: Brinquedos Alegria" className="flex-1 bg-transparent outline-none text-sm font-bold" /></div>
        <p className={`mt-2 text-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>A logo é recortada em quadrado (1:1). Use PNG com fundo transparente para ficar mais bonita.</p>
        {err && <p className="mt-2 text-xs font-bold text-red-500">{err}</p>}
        <button type="button" disabled={!ok || (!changed && saved)} onClick={save}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-white bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg shadow-orange-500/25 disabled:opacity-40 disabled:shadow-none">
          {saved && !changed ? <><Check size={18} />Salvo</> : <>{cta}</>}
        </button>
        {!ok && <p className={`mt-2 text-[11px] text-center ${dark ? "text-gray-500" : "text-gray-400"}`}>{!logo ? "Falta a logo" : "Falta o nome"} para continuar.</p>}
      </div>
    </div>
  );
}

// Infla sentado em cima da caixa (pula, acena e volta a sentar)
function InflaSentado() {
  const safari = typeof navigator !== "undefined" && /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
  const cls = "absolute left-1/2 -translate-x-1/2 bottom-full -mb-[3px] w-[min(150px,18vh)] h-auto pointer-events-none select-none drop-shadow-[0_10px_14px_rgba(0,0,0,.4)]";
  return safari ? <img src="/video/infla-sentado.webp" alt="" aria-hidden="true" className={cls} />
    : <video src="/video/infla-sentado.webm" muted playsInline autoPlay loop aria-hidden="true" className={cls} />;
}

// Primeira tela depois do cadastro: obrigatório colocar nome e logo
export function BrandSetupModal({ brand, onSave, dark, companyName }) {
  return (
    <div className="fixed inset-0 z-[420] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`relative w-full max-w-md mt-[min(150px,18vh)] rounded-3xl p-6 sm:p-7 shadow-2xl ${dark ? "bg-gray-900 text-white border border-gray-800" : "bg-white text-gray-900"}`} style={{ animation: "bi-inflate .7s cubic-bezier(.34,1.56,.64,1) both" }}>
        <InflaSentado />
        <div className="text-center mb-5">
          <div className="text-[11px] font-black uppercase tracking-[.2em] text-orange-500">Passo 1 · Sua marca</div>
          <h2 className="text-2xl font-black mt-1">Deixe o sistema com a cara da sua fábrica</h2>
          <p className={`mt-2 text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>O nome e a logo aparecem no lugar da nossa marca para você e para toda a sua equipe.</p>
        </div>
        <BrandEditor brand={{ name: brand?.name || companyName || "", logo: brand?.logo || "" }} onSave={onSave} dark={dark} cta="Continuar" />
      </div>
    </div>
  );
}
