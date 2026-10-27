import { lazy } from "react";

// Quando sai uma versão nova no Netlify, os arquivos antigos (ex.: RealMap-xxxx.js) deixam de existir.
// Quem estava com o app aberto tenta buscar o arquivo antigo e dá erro. Aqui o app percebe isso
// e recarrega sozinho uma vez, já pegando a versão nova — sem mostrar tela de erro.

export const isChunkError = (e) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Loading chunk|Unable to preload CSS|Failed to fetch dynamically/i
    .test(String(e?.message || e || ""));

export function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem("inflatudo-reload-at") || 0);
    if (Date.now() - last < 30000) return false; // evita ficar recarregando em loop
    sessionStorage.setItem("inflatudo-reload-at", String(Date.now()));
  } catch { }
  window.location.reload();
  return true;
}

export async function importRetry(fn, tries = 2) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (!isChunkError(e)) throw e;
      if (i >= tries) {
        if (reloadForNewVersion()) return new Promise(() => { }); // a página vai recarregar
        throw e;
      }
      await new Promise(r => setTimeout(r, 700 * (i + 1)));
    }
  }
}

export const lazyRetry = (fn) => lazy(() => importRetry(fn));
