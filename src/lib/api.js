// ── Comunicação com o servidor seguro (netlify/functions/api.js) ──────────────
// O app nunca fala direto com o banco: tudo passa pelo servidor, que confere
// quem está logado e de qual empresa ele é.
export const SESSION_KEY = "ags_session";

export function getToken() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null")?.token || null; } catch { return null; }
}

export class ApiError extends Error {
  constructor(message, status, code, extra) { super(message); this.status = status; this.code = code; this.extra = extra || {}; }
}

let onAuthLost = null;
export const setOnAuthLost = (fn) => { onAuthLost = fn; };

export async function api(action, payload = {}) {
  let res;
  try {
    res = await fetch("/.netlify/functions/api", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch { throw new ApiError("Sem conexão com o servidor. Confira a internet.", 0, "network"); }
  let body = null; try { body = await res.json(); } catch { }
  if (!res.ok) {
    const e = body?.error || {};
    const err = new ApiError(e.message || `Erro ${res.status}`, res.status, e.code, e);
    if (res.status === 401 && action !== "adminLogin" && action !== "employeeLogin" && onAuthLost) onAuthLost(err);
    throw err;
  }
  return body;
}

// Cabeçalhos para a função da IA (precisa estar logado)
export const aiHeaders = (kind = "extract") => ({ "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}), "X-AI-Kind": kind });
