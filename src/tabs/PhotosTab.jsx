import React, { useEffect, useMemo, useState } from "react";
import { Camera, Folder, FolderOpen, Search, X, Download, ChevronRight, ChevronLeft, Check, Trash2, Loader2, Image as ImageIcon, Eye } from "lucide-react";
import { sameSeller, sellerColorOf, norm, cleanOrderNumber } from "../lib/core";
import { downloadZip, downloadOne, deleteStoredPhoto } from "../lib/photos";

const dt = (iso) => { try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return ""; } };

function Lightbox({ list, index, onClose, onIndex }) {
  const p = list[index];
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") onIndex(Math.min(list.length - 1, index + 1)); if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1)); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [index, list.length]); // eslint-disable-line
  if (!p) return null;
  return (
    <div className="fixed inset-0 z-[300] bg-black/90 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between p-3 text-white" onClick={e => e.stopPropagation()}>
        <div className="text-sm font-bold">Pedido {p.pedido} · {index + 1}/{list.length}<span className="opacity-60 font-normal"> · {dt(p.em)}{p.por ? ` · ${p.por}` : ""}</span></div>
        <div className="flex gap-2">
          <button onClick={() => downloadOne(p, index + 1)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-bold"><Download size={16} />Baixar</button>
          <button onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20"><X size={18} /></button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center relative min-h-0 px-12" onClick={e => e.stopPropagation()}>
        {index > 0 && <button onClick={() => onIndex(index - 1)} className="absolute left-2 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white"><ChevronLeft size={22} /></button>}
        <img src={p.url} alt="" className="max-h-full max-w-full object-contain rounded-lg" />
        {index < list.length - 1 && <button onClick={() => onIndex(index + 1)} className="absolute right-2 p-3 rounded-full bg-white/10 hover:bg-white/25 text-white"><ChevronRight size={22} /></button>}
      </div>
    </div>
  );
}

export default function PhotosTab({ data, persist, dark, user, canEditPhotos, focus, clearFocus }) {
  const [q, setQ] = useState("");
  const [seller, setSeller] = useState(null);
  const [pedido, setPedido] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [lb, setLb] = useState(null);
  const [dl, setDl] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const sellers = data.sellers || [];
  const canon = (n) => sellers.find(s => sameSeller(sellers, s.name, n))?.name || n || "Sem vendedor";
  const mySeller = user?.sellerName ? canon(user.sellerName) : null;

  const photos = useMemo(() => (data.photos || []).map(p => ({ ...p, vendedor: canon(p.vendedor) })).sort((a, b) => (b.em || "").localeCompare(a.em || "")), [data.photos, data.sellers]); // eslint-disable-line

  // Pastas: vendedor → pedido → fotos
  const tree = useMemo(() => {
    const t = new Map();
    photos.forEach(p => {
      if (!t.has(p.vendedor)) t.set(p.vendedor, new Map());
      const m = t.get(p.vendedor);
      if (!m.has(p.pedido)) m.set(p.pedido, []);
      m.get(p.pedido).push(p);
    });
    return t;
  }, [photos]);

  const orderFolder = (vend, ped, list) => {
    const toys = [...new Set(list.map(p => p.toy).filter(Boolean))];
    return { vendedor: vend, pedido: ped, fotos: list, capa: list[0], cliente: list[0]?.cliente || "", toys, ultima: list[0]?.em };
  };

  useEffect(() => {
    if (!focus) return;
    const p = photos.find(x => String(x.pedido) === String(focus));
    if (p) { setQ(""); setSeller(p.vendedor); setPedido(p.pedido); setSel(new Set()); }
    clearFocus && clearFocus();
  }, [focus]); // eslint-disable-line

  const sellerFolders = [...tree.entries()].map(([v, m]) => ({ vendedor: v, pedidos: m.size, fotos: [...m.values()].reduce((a, l) => a + l.length, 0), capas: [...m.values()].flat().sort((x, y) => (y.em || "").localeCompare(x.em || "")).slice(0, 3), ultima: [...m.values()].map(l => l[0].em).sort().pop() }))
    .sort((a, b) => (b.vendedor === mySeller) - (a.vendedor === mySeller) || (b.ultima || "").localeCompare(a.ultima || ""));

  // Busca: por vendedor, número do pedido, cliente ou brinquedo
  const searchResults = useMemo(() => {
    const s = q.trim(); if (!s) return null;
    const n = norm(s), num = cleanOrderNumber(s.replace(/^(ped(ido)?|n[º°o]?)\s*/i, ""));
    const out = [];
    tree.forEach((m, v) => m.forEach((list, ped) => {
      const hay = norm([v, ped, list[0]?.cliente, ...list.map(p => p.toy)].join(" "));
      const hit = (num && /^\d+$/.test(num) && String(ped).includes(num)) || n.split(/\s+/).every(w => hay.includes(w));
      if (hit) out.push(orderFolder(v, ped, list));
    }));
    return out.sort((a, b) => (b.ultima || "").localeCompare(a.ultima || ""));
  }, [q, tree]); // eslint-disable-line

  const curFolders = seller && tree.get(seller) ? [...tree.get(seller).entries()].map(([ped, list]) => orderFolder(seller, ped, list)).sort((a, b) => (b.ultima || "").localeCompare(a.ultima || "")) : [];
  const curPhotos = seller && pedido ? (tree.get(seller)?.get(pedido) || []) : [];

  const go = (v, p) => { setSeller(v); setPedido(p); setSel(new Set()); setConfirmDel(null); };
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const runDownload = async (list, name) => {
    if (!list.length || dl) return;
    try { setDl(`Baixando 0/${list.length}…`); await downloadZip(list, name, (i, t) => setDl(`Baixando ${i}/${t}…`)); }
    catch (e) { alert(e.message || "Falha ao baixar"); }
    setDl("");
  };

  const removePhoto = async (p) => {
    await deleteStoredPhoto(p);
    persist({ ...data, photos: (data.photos || []).filter(x => x.id !== p.id) });
    setConfirmDel(null); setSel(s => { const n = new Set(s); n.delete(p.id); return n; });
    if (curPhotos.length <= 1) setPedido(null);
  };

  const card = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const sub = dark ? "text-gray-400" : "text-gray-500";
  const txt = dark ? "text-white" : "text-gray-900";

  const OrderFolderCard = ({ f, showSeller }) => (
    <button onClick={() => go(f.vendedor, f.pedido)} className={`text-left rounded-2xl border overflow-hidden group hover:border-orange-500/60 transition ${card}`}>
      <div className="relative aspect-[4/3] bg-gray-800 overflow-hidden">
        <img src={f.capa?.url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        <span className="absolute top-2 right-2 flex items-center gap-1 text-[11px] font-black px-2 py-1 rounded-lg bg-black/65 text-white"><Camera size={12} />{f.fotos.length}</span>
        <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center gap-1.5 text-white font-black"><Folder size={15} className="text-orange-400" />Pedido {f.pedido}</div>
        </div>
      </div>
      <div className="p-3">
        <div className={`text-sm font-bold truncate ${txt}`}>{f.cliente || "—"}</div>
        <div className={`text-xs truncate ${sub}`}>{f.toys.join(", ") || "—"}</div>
        <div className="flex items-center justify-between mt-1.5 gap-2">
          {showSeller ? <span className="text-[11px] font-bold truncate" style={{ color: sellerColorOf(sellers, f.vendedor) }}>● {f.vendedor}</span> : <span />}
          <span className={`text-[11px] flex-shrink-0 ${sub}`}>{dt(f.ultima)}</span>
        </div>
      </div>
    </button>
  );

  return (
    <div className="space-y-5">
      {lb !== null && <Lightbox list={curPhotos} index={lb} onIndex={setLb} onClose={() => setLb(null)} />}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className={`text-2xl font-black ${txt}`}>Fotos</h2>
          <p className={`text-sm ${sub}`}>Fotos dos brinquedos finalizados, guardadas por vendedor e número do pedido.</p>
        </div>
        {!canEditPhotos && <span className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${dark ? "bg-blue-500/10 border-blue-500/30 text-blue-400" : "bg-blue-50 border-blue-200 text-blue-700"}`}><Eye size={13} />Ver, buscar e baixar</span>}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por vendedor, nº do pedido, cliente ou brinquedo…" className={`w-full pl-9 pr-9 py-3 rounded-xl border text-sm outline-none focus:border-orange-500 ${dark ? "bg-gray-900 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-200 text-gray-900"}`} />
        {q && <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-orange-500"><X size={15} /></button>}
      </div>

      {/* caminho */}
      {!searchResults && (seller || pedido) && (
        <div className="flex items-center gap-1 text-sm font-bold flex-wrap">
          <button onClick={() => go(null, null)} className={`flex items-center gap-1 px-2 py-1 rounded-lg ${sub} hover:text-orange-500`}><Folder size={15} />Todas as pastas</button>
          {seller && <><ChevronRight size={14} className={sub} /><button onClick={() => go(seller, null)} className="px-2 py-1 rounded-lg hover:underline" style={{ color: sellerColorOf(sellers, seller) }}>{seller}</button></>}
          {pedido && <><ChevronRight size={14} className={sub} /><span className={`px-2 py-1 ${txt}`}>Pedido {pedido}</span></>}
        </div>
      )}

      {dl && <div className="flex items-center gap-2 text-sm font-bold text-orange-500"><Loader2 size={16} className="animate-spin" />{dl}</div>}

      {/* resultados da busca */}
      {searchResults && (
        searchResults.length
          ? <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">{searchResults.map(f => <OrderFolderCard key={f.vendedor + f.pedido} f={f} showSeller />)}</div>
          : <div className={`text-center py-14 ${sub}`}><Search size={32} className="mx-auto mb-2 opacity-30" />Nada encontrado para "{q}"</div>
      )}

      {/* nível 1: pastas dos vendedores */}
      {!searchResults && !seller && (
        sellerFolders.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {sellerFolders.map(f => {
              const c = sellerColorOf(sellers, f.vendedor);
              return (
                <button key={f.vendedor} onClick={() => go(f.vendedor, null)} className={`text-left rounded-2xl border p-4 hover:border-orange-500/60 transition ${card}`} style={{ boxShadow: f.vendedor === mySeller ? `0 0 0 2px ${c}` : undefined }}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${c}22`, color: c }}><FolderOpen size={26} /></div>
                    <div className="min-w-0 flex-1">
                      <div className={`font-black truncate ${txt}`}>{f.vendedor}{f.vendedor === mySeller && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-md text-white align-middle" style={{ background: c }}>MINHA PASTA</span>}</div>
                      <div className={`text-xs ${sub}`}>{f.pedidos} pedido{f.pedidos === 1 ? "" : "s"} · {f.fotos} foto{f.fotos === 1 ? "" : "s"}</div>
                    </div>
                    <ChevronRight size={18} className={sub} />
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 mt-3">
                    {[0, 1, 2].map(i => <div key={i} className={`aspect-square rounded-lg overflow-hidden ${dark ? "bg-gray-800" : "bg-gray-100"}`}>{f.capas[i] && <img src={f.capas[i].url} alt="" loading="lazy" className="w-full h-full object-cover" />}</div>)}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className={`text-center py-16 rounded-2xl border border-dashed ${dark ? "border-gray-800" : "border-gray-300"} ${sub}`}>
            <Camera size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-bold">Nenhuma foto ainda</p>
            <p className="text-sm mt-1">Quando um brinquedo for finalizado em 100%, o finalizador tira a foto e a pasta do pedido aparece aqui.</p>
          </div>
        )
      )}

      {/* nível 2: pedidos do vendedor */}
      {!searchResults && seller && !pedido && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className={`text-sm ${sub}`}>{curFolders.length} pasta{curFolders.length === 1 ? "" : "s"} de pedido</div>
            <button onClick={() => runDownload(curFolders.flatMap(f => f.fotos), `Fotos ${seller}`)} disabled={!!dl} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border ${dark ? "border-gray-700 text-gray-300 hover:bg-gray-800" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}><Download size={15} />Baixar tudo do vendedor</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">{curFolders.map(f => <OrderFolderCard key={f.pedido} f={f} />)}</div>
        </>
      )}

      {/* nível 3: fotos do pedido */}
      {!searchResults && seller && pedido && (
        <div className={`rounded-2xl border p-4 ${card}`}>
          <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
            <div>
              <div className={`text-xl font-black ${txt}`}><span className="text-orange-500">Pedido</span> {pedido}</div>
              <div className={`text-sm ${sub}`}>{curPhotos[0]?.cliente || "—"} · {[...new Set(curPhotos.map(p => p.toy).filter(Boolean))].join(", ")}</div>
              <div className="text-xs font-bold mt-0.5" style={{ color: sellerColorOf(sellers, seller) }}>● {seller}</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setSel(sel.size === curPhotos.length ? new Set() : new Set(curPhotos.map(p => p.id)))} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border ${dark ? "border-gray-700 text-gray-300 hover:bg-gray-800" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}><Check size={15} />{sel.size === curPhotos.length ? "Desmarcar" : "Marcar todas"}</button>
              {sel.size > 0 && <button disabled={!!dl} onClick={() => runDownload(curPhotos.filter(p => sel.has(p.id)), `Pedido ${pedido}`)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border border-orange-500 text-orange-500 hover:bg-orange-500/10`}><Download size={15} />Baixar selecionadas ({sel.size})</button>}
              <button disabled={!!dl} onClick={() => runDownload(curPhotos, `Pedido ${pedido}`)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-black text-white" style={{ background: "linear-gradient(135deg,#f97316,#ea580c)" }}><Download size={15} />Baixar pasta ({curPhotos.length})</button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {curPhotos.map((p, i) => {
              const on = sel.has(p.id);
              return (
                <div key={p.id} className={`relative rounded-xl overflow-hidden border-2 transition ${on ? "border-orange-500" : dark ? "border-gray-800" : "border-gray-200"}`}>
                  <button onClick={() => setLb(i)} className="block w-full aspect-square bg-gray-800"><img src={p.url} alt="" loading="lazy" className="w-full h-full object-cover" /></button>
                  <button onClick={() => toggle(p.id)} title="Selecionar" className={`absolute top-2 left-2 w-7 h-7 rounded-lg flex items-center justify-center border-2 ${on ? "bg-orange-500 border-orange-500 text-white" : "bg-black/40 border-white/80 text-transparent"}`}><Check size={16} /></button>
                  {canEditPhotos && (confirmDel === p.id
                    ? <div className="absolute top-2 right-2 flex gap-1"><button onClick={() => removePhoto(p)} className="px-2 py-1 rounded-lg bg-red-600 text-white text-[11px] font-black">Apagar</button><button onClick={() => setConfirmDel(null)} className="px-2 py-1 rounded-lg bg-black/60 text-white text-[11px] font-bold">Não</button></div>
                    : <button onClick={() => setConfirmDel(p.id)} title="Apagar foto" className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white hover:bg-red-600"><Trash2 size={14} /></button>)}
                  <div className={`px-2 py-1.5 text-[11px] flex justify-between gap-2 ${dark ? "bg-gray-900 text-gray-400" : "bg-white text-gray-500"}`}><span className="truncate">{p.toy || "—"}</span><span className="flex-shrink-0">{dt(p.em)}</span></div>
                </div>
              );
            })}
          </div>
          {!curPhotos.length && <div className={`text-center py-10 ${sub}`}><ImageIcon size={30} className="mx-auto mb-2 opacity-30" />Pasta vazia</div>}
        </div>
      )}
    </div>
  );
}
