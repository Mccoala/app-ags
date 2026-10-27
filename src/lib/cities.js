import { norm } from "./core";
import { normalizeState } from "./geo";

// ── Cidades do Brasil (5.570 municípios com coordenadas, carregado sob demanda) ──
let CITIES_PROMISE = null;
export function loadCities() {
  if (!CITIES_PROMISE) CITIES_PROMISE = fetch("/municipios.json").then(r => r.json()).then(rows => {
    const byKey = new Map(), byName = new Map();
    rows.forEach(([name, uf, lat, lng, capital]) => {
      const c = { name, uf, lat, lng, capital: !!capital, key: norm(name) };
      byKey.set(`${c.key}|${uf}`, c);
      if (!byName.has(c.key)) byName.set(c.key, []);
      byName.get(c.key).push(c);
    });
    return { rows: rows.map(([name, uf, lat, lng]) => ({ name, uf, lat, lng, key: norm(name) })), byKey, byName };
  });
  return CITIES_PROMISE;
}

// Acha a cidade do cliente ("Campinas", "Campinas - SP", "Campinas/SP", com ou sem estado separado)
export function locateCity(cities, cityText, stateText) {
  if (!cities || !cityText) return null;
  let raw = String(cityText);
  let uf = normalizeState(stateText);
  const m = raw.match(/^(.*?)[\s]*[-\/,(]\s*([A-Za-z]{2})\)?\s*$/);
  if (m) { raw = m[1]; uf = uf || m[2].toUpperCase(); }
  const key = norm(raw);
  if (uf && cities.byKey.has(`${key}|${uf}`)) return cities.byKey.get(`${key}|${uf}`);
  const list = cities.byName.get(key);
  if (list?.length) return uf ? (list.find(c => c.uf === uf) || list[0]) : list[0];
  return null;
}

export const distanceKm = (a, b) => {
  const R = 6371, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
