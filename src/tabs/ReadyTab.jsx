import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X, Camera, Loader2, Search, Pencil, Trash2, CheckCircle2, RotateCcw, ChevronLeft, ChevronRight, PackageCheck } from "lucide-react";
import { compressPhoto, uploadPhoto, deleteStoredPhoto } from "../lib/photos";
import { norm } from "../lib/core";

// ── Pronta entrega ────────────────────────────────────────────────────────────
// Um quadro de cortiça "infinito": cada brinquedo pronto fica preso por um alfinete.
// Quem pode editar a aba cadastra (fotos, nome, valor). Vendedor só olha.
// Marcar como vendido: só quem lança pedidos na extratora (permissão de editar Pedidos).

const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const parseMoney = (s) => { const t = String(s || "").replace(/[^\d,.-]/g, ""); const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t); return isFinite(n) ? n : 0; };
const newId = () => `pe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const PIN_COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#a855f7", "#ec4899"];
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

const CORK = {
  backgroundColor: "#c08a55",
  backgroundImage: [
    "radial-gradient(rgba(90,50,20,.35) 1px, transparent 1.6px)",
    "radial-gradient(rgba(255,230,190,.25) 1px, transparent 1.4px)",
    "radial-gradient(rgba(70,40,15,.25) 1.5px, transparent 2px)",
  ].join(","),
  backgroundSize: "9px 9px, 13px 13px, 23px 23px",
  backgroundPosition: "0 0, 4px 6px, 11px 3px",
  boxShadow: "inset 0 0 40px rgba(60,30,10,.45)",
};

function Pin({ color }) {
  return (
    <div className="absolute left-1/2 -top-3 -translate-x-1/2 z-10 pointer-events-none" aria-hidden>
      <div className="w-5 h-5 rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, #fff8 0 18%, ${color} 40%, #0006 100%)`, boxShadow: "0 3px 4px rgba(0,0,0,.45)" }} />
      <div className="mx-auto w-[2px] h-2 bg-gray-400/80" />
    </div>
  );
}

function Card({ item, onOpen }) {
  const h = hash(item.id);
  const rot = ((h % 7) - 3) * 0.9; // -2.7° a 2.7°
  const sold = item.status === "vendido";
  const cover = item.photos?.[0]?.url;
  return (
    <button onClick={() => onOpen(item)} className="relative group pt-3 text-left focus:outline-none" style={{ transform: `rotate(${rot}deg)` }}>
      <Pin color={PIN_COLORS[h % PIN_COLORS.length]} />
      <div className="bg-[#fdfcf8] p-2 pb-3 rounded-[3px] transition-transform duration-200 group-hover:-translate-y-1 group-hover:rotate-0" style={{ boxShadow: "0 8px 16px rgba(40,20,5,.35), 0 2px 3px rgba(0,0,0,.2)" }}>
        <div className="relative aspect-square bg-gray-200 overflow-hidden">
          {cover ? <img src={cover} alt={item.name} loading="lazy" className={`w-full h-full object-cover ${sold ? "grayscale opacity-70" : ""}`} />
            : <div className="w-full h-full flex items-center justify-center text-gray-400"><Camera size={28} /></div>}
          {item.photos?.length > 1 && <span className="absolute bottom-1 right-1 text-[10px] font-bold bg-black/60 text-white rounded px-1.5 py-0.5">{item.photos.length} fotos</span>}
          {sold && <div className="absolute inset-0 flex items-center justify-center"><span className="border-4 border-red-600 text-red-600 font-black text-xl tracking-widest px-3 py-1 rounded -rotate-12 bg-white/70">VENDIDO</span></div>}
        </div>
        <div className="mt-2 px-0.5">
          <div className="text-[13px] font-bold text-gray-800 leading-tight line-clamp-2" style={{ fontFamily: "'Segoe Print','Bradley Hand','Comic Sans MS',cursive" }}>{item.name || "Sem nome"}</div>
          <div className={`text-sm font-black mt-0.5 ${sold ? "text-gray-400 line-through" : "text-emerald-700"}`}>{money(item.price)}</div>
        </div>
      </div>
    </button>
  );
}

function Viewer({ item, onClose, canManage, canSell, onEdit, onSell, onUnsell, onDelete, dark }) {
  const [i, setI] = useState(0);
  const ph = item.photos || [];
  const sold = item.status === "vendido";
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-3" onClick={onClose}>
      <div className={`w-full max-w-lg rounded-2xl overflow-hidden ${dark ? "bg-gray-900 text-white" : "bg-white"}`} onClick={e => e.stopPropagation()}>
        <div className="relative bg-black aspect-square">
          {ph[i] ? <img src={ph[i].url} alt="" className="w-full h-full object-contain" /> : <div className="w-full h-full flex items-center justify-center text-gray-500"><Camera size={40} /></div>}
          {i > 0 && <button onClick={() => setI(i - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/15 text-white"><ChevronLeft /></button>}
          {i < ph.length - 1 && <button onClick={() => setI(i + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/15 text-white"><ChevronRight /></button>}
          <button onClick={onClose} className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white"><X size={18} /></button>
          {ph.length > 1 && <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1.5">{ph.map((_, k) => <span key={k} className={`w-2 h-2 rounded-full ${k === i ? "bg-white" : "bg-white/40"}`} />)}</div>}
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div><div className="text-lg font-black">{item.name}</div><div className="text-emerald-500 font-black text-xl">{money(item.price)}</div></div>
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${sold ? "bg-red-500/15 text-red-500" : "bg-emerald-500/15 text-emerald-500"}`}>{sold ? "Vendido" : "Disponível"}</span>
          </div>
          {sold && <div className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>Vendido{item.soldAt ? ` em ${new Date(item.soldAt).toLocaleDateString("pt-BR")}` : ""}{item.soldTo ? ` para ${item.soldTo}` : ""}{item.seller ? ` · vendedor ${item.seller}` : ""}{item.orderId ? ` · pedido ${item.orderId}` : ""}{item.soldBy ? ` · marcado por ${item.soldBy}` : ""}</div>}
          <div className="flex flex-wrap gap-2">
            {canSell && !sold && <button onClick={onSell} className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"><CheckCircle2 size={18} />Marcar como vendido</button>}
            {canSell && sold && <button onClick={onUnsell} className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold border ${dark ? "border-gray-700" : "border-gray-300"}`}><RotateCcw size={16} />Voltar para disponível</button>}
            {canManage && <button onClick={onEdit} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold border ${dark ? "border-gray-700" : "border-gray-300"}`}><Pencil size={16} />Editar</button>}
            {canManage && <button onClick={onDelete} className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-red-500 border border-red-500/40"><Trash2 size={16} />Tirar do quadro</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Editor({ initial, onClose, onSave, dark, companyId }) {
  const [name, setName] = useState(initial?.name || "");
  const [price, setPrice] = useState(initial?.price ? String(initial.price).replace(".", ",") : "");
  const [photos, setPhotos] = useState(initial?.photos || []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const removed = useRef([]);

  const addFiles = async (files) => {
    setErr(""); setBusy(true);
    try {
      for (const f of Array.from(files || [])) {
        const { blob } = await compressPhoto(f, 1280, 0.75, name || "Pronta entrega");
        const up = await uploadPhoto(companyId, "pronta-entrega", blob);
        setPhotos(p => [...p, { id: up.id, url: up.url, path: up.path || null }]);
      }
    } catch (e) { setErr(e.message || "Não consegui enviar a foto."); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const save = () => {
    if (!name.trim()) return setErr("Coloque o nome do brinquedo.");
    removed.current.forEach(deleteStoredPhoto);
    onSave({ name: name.trim(), price: parseMoney(price), photos });
  };
  const inp = `w-full rounded-xl px-3 py-2.5 border outline-none focus:border-orange-500 ${dark ? "bg-gray-950 border-gray-700 text-white" : "bg-white border-gray-300"}`;
  return (
    <div className="fixed inset-0 z-[300] bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className={`w-full max-w-md rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto ${dark ? "bg-gray-900 text-white" : "bg-white"}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="text-lg font-black">{initial ? "Editar brinquedo" : "Novo brinquedo pronto"}</h3><button onClick={onClose} className="p-1"><X /></button></div>
        <div>
          <div className="text-xs font-bold mb-1.5 opacity-70">Fotos</div>
          <div className="grid grid-cols-4 gap-2">
            {photos.map(p => (
              <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-200">
                <img src={p.url} alt="" className="w-full h-full object-cover" />
                <button onClick={() => { removed.current.push(p); setPhotos(photos.filter(x => x.id !== p.id)); }} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white"><X size={12} /></button>
              </div>
            ))}
            <button disabled={busy} onClick={() => fileRef.current?.click()} className={`aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-xs font-bold gap-1 ${dark ? "border-gray-700 text-gray-400" : "border-gray-300 text-gray-500"}`}>
              {busy ? <Loader2 className="animate-spin" size={20} /> : <><Camera size={20} />Foto</>}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
        </div>
        <div><div className="text-xs font-bold mb-1.5 opacity-70">Nome do brinquedo</div><input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Tobogã Selva 5m" className={inp} /></div>
        <div><div className="text-xs font-bold mb-1.5 opacity-70">Valor (R$)</div><input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" placeholder="Ex.: 8.500,00" className={inp} /></div>
        {err && <div className="text-sm text-red-500 font-semibold">{err}</div>}
        <button disabled={busy} onClick={save} className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-black disabled:opacity-50">{initial ? "Salvar" : "Pendurar no quadro"}</button>
      </div>
    </div>
  );
}

export default function ReadyTab({ data, persist, dark, user, canEditReady, canSellReady }) {
  const [q, setQ] = useState("");
  const [show, setShow] = useState("disponivel");
  const [open, setOpen] = useState(null);
  const [edit, setEdit] = useState(null); // null | "new" | item
  const list = data.readyStock || [];
  const isAdmin = user?.role === "admin";
  const canManage = isAdmin || !!canEditReady;
  const canSell = isAdmin || !!canSellReady;

  const shown = useMemo(() => {
    const nq = norm(q);
    return list
      .filter(r => show === "todos" || (show === "vendido" ? r.status === "vendido" : r.status !== "vendido"))
      .filter(r => !nq || norm(r.name).includes(nq))
      .sort((a, b) => (a.status === "vendido") - (b.status === "vendido") || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }, [list, q, show]);
  const avail = list.filter(r => r.status !== "vendido");
  const total = avail.reduce((s, r) => s + Number(r.price || 0), 0);

  const save = (patch) => {
    const items = edit === "new"
      ? [...list, { id: newId(), status: "disponivel", createdAt: new Date().toISOString(), createdBy: user?.name, ...patch }]
      : list.map(r => r.id === edit.id ? { ...r, ...patch } : r);
    persist({ ...data, readyStock: items });
    setEdit(null); setOpen(null);
  };
  const setStatus = (item, sold) => {
    const patch = sold ? { status: "vendido", soldAt: new Date().toISOString(), soldBy: user?.name } : { status: "disponivel", soldAt: null, soldBy: null, soldTo: null, orderId: null, seller: null };
    persist({ ...data, readyStock: list.map(r => r.id === item.id ? { ...r, ...patch } : r) });
    setOpen(null);
  };
  const remove = (item) => {
    if (!window.confirm(`Tirar "${item.name}" do quadro?`)) return;
    (item.photos || []).forEach(deleteStoredPhoto);
    persist({ ...data, readyStock: list.filter(r => r.id !== item.id) });
    setOpen(null);
  };

  const chip = (k, label) => <button key={k} onClick={() => setShow(k)} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${show === k ? "bg-orange-500 text-white" : dark ? "bg-gray-800 text-gray-300" : "bg-white text-gray-600 border border-gray-200"}`}>{label}</button>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black flex items-center gap-2"><PackageCheck className="text-orange-500" />Pronta entrega</h2>
          <p className={`text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>{avail.length} brinquedo{avail.length === 1 ? "" : "s"} disponíve{avail.length === 1 ? "l" : "is"}{total ? ` · ${money(total)} no quadro` : ""}{!canManage ? " · só visualização" : ""}</p>
        </div>
        {canManage && <button onClick={() => setEdit("new")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold shadow"><Plus size={18} />Adicionar brinquedo</button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border flex-1 min-w-[180px] ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}><Search size={16} className="opacity-50" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Procurar brinquedo" className="bg-transparent outline-none flex-1 text-sm" /></div>
        {chip("disponivel", "Disponíveis")}{chip("vendido", "Vendidos")}{chip("todos", "Todos")}
      </div>

      <div className="rounded-2xl p-4 sm:p-6 min-h-[60vh] border-[10px]" style={{ ...CORK, borderColor: "#7a4b25" }}>
        {shown.length === 0 ? (
          <div className="h-[50vh] flex flex-col items-center justify-center text-center">
            <div className="bg-[#fdfcf8] px-6 py-5 rounded shadow-lg -rotate-2 max-w-xs" style={{ fontFamily: "'Segoe Print','Bradley Hand','Comic Sans MS',cursive" }}>
              <div className="font-bold text-gray-800">{list.length ? "Nada aqui com esse filtro." : "O quadro está vazio."}</div>
              {canManage && !list.length && <div className="text-sm text-gray-600 mt-1">Toque em “Adicionar brinquedo” para pendurar o primeiro.</div>}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-5 gap-y-8">
            {shown.map(it => <Card key={it.id} item={it} onOpen={setOpen} />)}
          </div>
        )}
      </div>

      {open && <Viewer item={open} dark={dark} canManage={canManage} canSell={canSell} onClose={() => setOpen(null)} onEdit={() => setEdit(open)} onSell={() => setStatus(open, true)} onUnsell={() => setStatus(open, false)} onDelete={() => remove(open)} />}
      {edit && <Editor initial={edit === "new" ? null : edit} dark={dark} companyId={user?.company_id} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  );
}
