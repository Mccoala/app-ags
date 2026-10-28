import React from "react";
import { Calendar } from "lucide-react";
import { PERIOD_PRESETS, dateBR } from "../lib/core";
import FilterMenu from "./FilterMenu";

// Período: um botão só com os atalhos (Máximo, No ano… Hoje) + datas personalizadas
export default function PeriodBar({ value, onChange, custom, onCustom, range, dark, accent = "#f97316" }) {
  const inp = `px-2 py-1.5 rounded-lg text-xs font-bold border outline-none ${dark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200"}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterMenu value={value} onChange={onChange} icon={Calendar} label="Período" dark={dark} accent={accent}
        options={[...PERIOD_PRESETS, ["custom", "Personalizado"]]} />
      {value === "custom" ? (
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={custom?.from || ""} onChange={e => onCustom({ ...custom, from: e.target.value })} className={inp} />
          <span className="text-xs text-slate-500">até</span>
          <input type="date" value={custom?.to || ""} onChange={e => onCustom({ ...custom, to: e.target.value })} className={inp} />
        </div>
      ) : range && (
        <span className="text-xs font-bold" style={{ color: accent }}>{dateBR(range.from)}{range.from !== range.to ? ` → ${dateBR(range.to)}` : ""}</span>
      )}
    </div>
  );
}
