import React, { useLayoutEffect, useRef } from "react";

// Caixa de mensagem que cresce com o texto (quebra linha sozinha).
// Enter envia · Shift+Enter pula linha · no celular, Enter pula linha e envia pelo botão.
const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

export default function ChatBox({ value, onChange, onSend, placeholder, className = "", autoFocus, maxRows = 7 }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const max = line * maxRows + 22;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [value, maxRows]);
  return (
    <textarea ref={ref} rows={1} value={value} autoFocus={autoFocus} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !touch && !e.nativeEvent.isComposing) { e.preventDefault(); if (value.trim()) onSend(); } }}
      className={`flex-1 min-w-0 resize-none leading-5 ${className}`} />
  );
}
