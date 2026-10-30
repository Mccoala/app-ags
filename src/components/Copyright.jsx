/*! Inflatudo © 2026 — Todos os direitos reservados. Software proprietário protegido pela Lei 9.609/98 (Lei do Software) e Lei 9.610/98 (Direitos Autorais). Cópia, clonagem, engenharia reversa ou redistribuição sem autorização é crime (Lei 9.609/98, art. 12). */
import React from "react";

export const COPYRIGHT_YEAR = 2026;

// Aviso de direitos autorais mostrado nas telas de login/cadastro, equipe e planos
export default function Copyright({ dark = true, className = "" }) {
  return (
    <div className={`text-center text-[11px] leading-relaxed select-none ${dark ? "text-gray-500" : "text-gray-400"} ${className}`}>
      <div className="font-bold">© {COPYRIGHT_YEAR} Inflatudo. Todos os direitos reservados.</div>
      <div>Software protegido pela Lei 9.609/98 (Lei do Software) e Lei 9.610/98 (Direitos Autorais). Proibida a cópia, clonagem ou reprodução, total ou parcial.</div>
    </div>
  );
}
