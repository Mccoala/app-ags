import React, { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { PERIOD_PRESETS, dateBR } from "../lib/core";

// Barra de período: atalhos (Máximo, No ano, 1 ano… Hoje) + datas personalizadas
export default function PeriodBar({ value, onChange, custom, onCustom, range, dark, accent = "#f97316" }) {
  const [open, setOpen] = useState(false);
  const chip = (on) => `px-3 py-1.5 rounded-lg text-xs font-black whitespace-nowrap transition-all ${on ? "text-white shadow" : dark ? "text-slate-400 hover:text-white hover:bg-white/5" : "text-slate-500 hover:text-slate-900 hover:bg-black/5"}`;
  return (
    <div className={`rounded-2xl border px-3 py-2.5 flex flex-col md:flex-row md:items-center gap-2 ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Calendar size={15} style={{ color: accent }} />
        <div className="leading-tight">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Período</div>
          {range && <div className="text-[11px] font-bold" style={{ color: accent }}>{dateBR(range.from)}{range.from !== range.to ? ` → ${dateBR(range.to)}` : ""}</div>}
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto hide-scrollbar md:flex-wrap md:overflow-visible flex-1">
        {PERIOD_PRESETS.map(([k, l]) => <button key={k} onClick={() => { onChange(k); setOpen(false); }} className={chip(value === k)} style={value === k ? { background: accent } : {}}>{l}</button>)}
        <button onClick={() => setOpen(!open)} className={`${chip(value === "custom")} flex items-center gap-1`} style={value === "custom" ? { background: accent } : {}}>Personalizado <ChevronDown size={12} /></button>
      </div>
      {open && (
        <div className="flex items-center gap-2 flex-wrap animate-slide-up">
          <input type="date" value={custom?.from || ""} onChange={e => { onCustom({ ...custom, from: e.target.value }); onChange("custom"); }} className={`px-2 py-1.5 rounded-lg text-xs font-bold border outline-none ${dark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200"}`} />
          <span className="text-xs text-slate-500">até</span>
          <input type="date" value={custom?.to || ""} onChange={e => { onCustom({ ...custom, to: e.target.value }); onChange("custom"); }} className={`px-2 py-1.5 rounded-lg text-xs font-bold border outline-none ${dark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200"}`} />
        </div>
      )}
    </div>
  );
}
