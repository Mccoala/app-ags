import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

// Um botão só que guarda todas as opções de filtro numa listinha.
// options: [[valor, rótulo, cor?]]
export default function FilterMenu({ value, onChange, options, label, icon: Icon, dark, accent = "#f97316", align = "left", footer }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close); document.addEventListener("touchstart", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("touchstart", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const cur = options.find(o => o[0] === value);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} className={`flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-xl border text-sm font-bold whitespace-nowrap transition-colors ${dark ? "bg-gray-900 border-gray-700 text-white hover:border-gray-500" : "bg-white border-gray-200 text-gray-800 hover:border-gray-400"}`}>
        {Icon && <Icon size={15} style={{ color: accent }} />}
        {label && <span className="text-slate-500 font-semibold">{label}:</span>}
        <span style={cur?.[2] ? { color: cur[2] } : {}}>{cur?.[1] ?? "—"}</span>
        <ChevronDown size={15} className={`opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className={`absolute z-[250] mt-1.5 min-w-[200px] max-h-[60vh] overflow-y-auto rounded-xl border shadow-2xl p-1 ${align === "right" ? "right-0" : "left-0"} ${dark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}`}>
          {options.map(([k, l, c]) => {
            const on = k === value;
            return (
              <button key={k} type="button" onClick={() => { onChange(k); setOpen(false); }} className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm text-left font-semibold ${on ? "" : dark ? "hover:bg-white/5" : "hover:bg-black/5"}`} style={on ? { background: `${accent}22`, color: accent } : c ? { color: c } : {}}>
                <span>{l}</span>{on && <Check size={15} />}
              </button>
            );
          })}
          {footer && <div className={`mt-1 pt-1 border-t ${dark ? "border-gray-800" : "border-gray-100"}`}>{footer(() => setOpen(false))}</div>}
        </div>
      )}
    </div>
  );
}
