import React, { useEffect, useRef, useState } from "react";
import { Camera, X, Trash2, Check, ImagePlus, Loader2, Bell } from "lucide-react";
import { compressPhoto, uploadPhoto, kb } from "../lib/photos";
import { orderNumber } from "../lib/core";

// Janela que abre ao marcar "Finalizado · 100%": o finalizador tira uma ou mais fotos
// do brinquedo. Só dá para concluir com pelo menos 1 foto. Ao concluir, as fotos vão
// para a pasta do pedido e o vendedor recebe o aviso.
export default function PhotoCapture({ row, companyId, dark, mode = "finalizar", sellerName, onCancel, onDone }) {
  const [shots, setShots] = useState([]); // { blob, preview, size }
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const camRef = useRef(null), galRef = useRef(null);
  const pedido = orderNumber(row._orderId ?? row.orderId ?? row.id);

  useEffect(() => () => shots.forEach(s => URL.revokeObjectURL(s.preview)), []); // eslint-disable-line

  const addFiles = async (files) => {
    const list = Array.from(files || []).filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|heic|webp)$/i.test(f.name));
    if (!list.length) return;
    setErr(""); setBusy("Preparando foto…");
    try {
      const out = [];
      for (const f of list) out.push(await compressPhoto(f));
      setShots(s => [...s, ...out]);
    } catch (e) { setErr(e.message || "Não consegui ler a foto."); }
    setBusy("");
  };

  const remove = (i) => setShots(s => { URL.revokeObjectURL(s[i].preview); return s.filter((_, k) => k !== i); });

  const confirm = async () => {
    if (!shots.length || busy) return;
    setErr("");
    try {
      const uploaded = [];
      for (let i = 0; i < shots.length; i++) {
        setBusy(`Enviando foto ${i + 1} de ${shots.length}…`);
        uploaded.push(await uploadPhoto(companyId, pedido, shots[i].blob));
      }
      setBusy("");
      onDone(uploaded);
    } catch (e) { setBusy(""); setErr(e.message || "Falha ao enviar as fotos. Tente de novo."); }
  };

  const total = shots.reduce((a, s) => a + s.size, 0);
  const card = dark ? "bg-gray-900 border-gray-800 text-white" : "bg-white border-gray-200 text-gray-900";
  const sub = dark ? "text-gray-400" : "text-gray-500";

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4" onClick={() => !busy && onCancel()}>
      <div className={`w-full sm:max-w-lg max-h-[95vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border shadow-2xl ${card}`} onClick={e => e.stopPropagation()}>
        <div className="p-5 flex items-start gap-3 border-b" style={{ borderColor: dark ? "#1f2937" : "#f1f5f9" }}>
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white flex-shrink-0" style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}><Camera size={22} /></div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-lg leading-tight">{mode === "finalizar" ? "Foto do brinquedo pronto" : "Adicionar fotos"}</div>
            <div className={`text-sm ${sub}`}><b className="text-orange-500">Pedido {pedido}</b> · {row.toy}{row.clientName ? ` · ${row.clientName}` : ""}</div>
          </div>
          <button disabled={!!busy} onClick={onCancel} className={`p-2 rounded-xl ${sub} hover:text-red-500`}><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          {mode === "finalizar" && <div className={`text-sm rounded-xl px-3 py-2.5 border ${dark ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
            Para marcar <b>100%</b>, tire pelo menos <b>1 foto</b>. Pode tirar quantas quiser — elas ficam na pasta do pedido{sellerName ? <> e o vendedor <b>{sellerName}</b> recebe o aviso na hora</> : ""}.
          </div>}

          <div className="grid grid-cols-2 gap-2">
            <button disabled={!!busy} onClick={() => camRef.current?.click()} className="flex flex-col items-center justify-center gap-1.5 py-5 rounded-2xl text-white font-black shadow-lg active:scale-[.98] transition" style={{ background: "linear-gradient(135deg,#f97316,#ea580c)" }}>
              <Camera size={28} />Tirar foto
            </button>
            <button disabled={!!busy} onClick={() => galRef.current?.click()} className={`flex flex-col items-center justify-center gap-1.5 py-5 rounded-2xl font-black border-2 border-dashed active:scale-[.98] transition ${dark ? "border-gray-700 text-gray-300 hover:bg-gray-800" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
              <ImagePlus size={28} />Da galeria
            </button>
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
          <input ref={galRef} type="file" accept="image/*" multiple className="hidden" data-testid="photo-input" onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />

          {shots.length > 0 && (
            <div>
              <div className={`text-xs font-bold mb-2 ${sub}`}>{shots.length} foto{shots.length > 1 ? "s" : ""} · {kb(total)}</div>
              <div className="grid grid-cols-3 gap-2">
                {shots.map((s, i) => (
                  <div key={s.preview} className="relative aspect-square rounded-xl overflow-hidden border" style={{ borderColor: dark ? "#374151" : "#e5e7eb" }}>
                    <img src={s.preview} alt="" className="w-full h-full object-cover" />
                    <span className="absolute left-1 bottom-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white">{kb(s.size)}</span>
                    {!busy && <button onClick={() => remove(i)} className="absolute top-1 right-1 p-1.5 rounded-lg bg-black/60 text-white hover:bg-red-600"><Trash2 size={13} /></button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {err && <div className="text-sm text-red-500 font-bold">{err}</div>}
          {busy && <div className={`flex items-center gap-2 text-sm font-bold ${sub}`}><Loader2 size={16} className="animate-spin" />{busy}</div>}

          <button disabled={!shots.length || !!busy} onClick={confirm} className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-white transition ${!shots.length || busy ? "opacity-40 cursor-not-allowed" : "shadow-lg shadow-emerald-500/30 active:scale-[.99]"}`} style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
            {mode === "finalizar" ? <><Check size={18} />Concluir 100%{sellerName ? <> e avisar vendedor <Bell size={16} /></> : ""}</> : <><Check size={18} />Salvar fotos</>}
          </button>
          {!shots.length && <div className={`text-center text-xs ${sub}`}>Tire ao menos uma foto para liberar o botão.</div>}
        </div>
      </div>
    </div>
  );
}
