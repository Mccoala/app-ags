import React, { useEffect, useMemo, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Factory, Navigation, Route, Trash2, MapPin, Search, X, Crosshair, ExternalLink, Edit3, Check } from "lucide-react";
import { moneyBR, norm, sellerColorOf, whatsappLink, orderNumber } from "../lib/core";
import { normalizeState, UF_NAMES } from "../lib/geo";

import { loadCities, locateCity } from "../lib/cities";

const km = (a, b) => {
  const R = 6371, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const fmtKm = (v) => `${Math.round(v).toLocaleString("pt-BR")} km`;
const fmtTime = (s) => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`; };

// Ícones guardados para não serem recriados a cada atualização da tela (recriar "engole" o clique)
const ICONS = new Map();
const pinIcon = (color, label, selected) => { const k = `${color}|${label}|${selected}`; if (!ICONS.has(k)) ICONS.set(k, makePin(color, label, selected)); return ICONS.get(k); };
const makePin = (color, label, selected) => L.divIcon({
  className: "",
  iconSize: [34, 42], iconAnchor: [17, 40], popupAnchor: [0, -36],
  html: `<div style="position:relative;width:34px;height:42px;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35))">
    <svg viewBox="0 0 34 42" width="34" height="42"><path d="M17 41C17 41 3 26 3 16a14 14 0 1 1 28 0c0 10-14 25-14 25z" fill="${color}" stroke="${selected ? "#fff" : "rgba(255,255,255,.85)"}" stroke-width="${selected ? 3 : 2}"/></svg>
    <div style="position:absolute;top:6px;left:0;right:0;text-align:center;color:#fff;font:900 11px Inter,system-ui">${label}</div>
    ${selected ? `<div style="position:absolute;inset:-6px;border-radius:50%;border:2px solid ${color};animation:pinPulse 1.6s ease-out infinite"></div>` : ""}
  </div>`
});
const factoryIcon = L.divIcon({
  className: "", iconSize: [44, 44], iconAnchor: [22, 22],
  html: `<div style="width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#f97316,#ea580c);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 6px rgba(249,115,22,.25),0 10px 20px rgba(0,0,0,.35);font-size:22px">🏭</div>`
});

function FitTo({ points, trigger }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 9, { animate: true });
    else map.fitBounds(L.latLngBounds(points), { padding: [50, 50], animate: true, maxZoom: 11 });
  }, [trigger]); // eslint-disable-line
  return null;
}
function ClickToPlace({ active, onPick }) {
  useMapEvents({ click(e) { if (active) onPick(e.latlng); } });
  return null;
}

export default function RealMap({ data, save, dark, orders, canEdit }) {
  const [cities, setCities] = useState(null);
  const [route, setRoute] = useState([]); // nomes de clientes na ordem da rota
  const [routeGeo, setRouteGeo] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routing, setRouting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [factoryForm, setFactoryForm] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [fitKey, setFitKey] = useState(0);
  const [focus, setFocus] = useState(null);
  const [picked, setPicked] = useState(null);

  useEffect(() => { loadCities().then(setCities).catch(() => setCities({ rows: [], byKey: new Map(), byName: new Map() })); }, []);
  const factory = data.settings?.factory || null;
  useEffect(() => { if (cities && !factory && canEdit) setFactoryForm(true); }, [cities]); // eslint-disable-line

  // Um ponto por cliente (com os pedidos dele dentro do filtro atual)
  const points = useMemo(() => {
    if (!cities) return [];
    const byClient = new Map();
    orders.forEach(o => {
      const key = norm(o.clientName);
      if (!byClient.has(key)) byClient.set(key, { name: o.clientName, orders: [] });
      byClient.get(key).orders.push(o);
    });
    const out = [];
    byClient.forEach(({ name, orders: os }) => {
      const c = (data.clients || []).find(x => norm(x.name) === norm(name));
      // A posição vem sempre da cidade/estado cadastrados (mudou na aba Clientes → muda aqui)
      let pos = null;
      const city = locateCity(cities, c?.city, c?.state);
      if (!pos && city) pos = { lat: city.lat, lng: city.lng };
      const last = [...os].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
      out.push({ name, client: c, city, pos, orders: os, revenue: os.reduce((a, o) => a + (Number(o.totalPrice) || 0), 0), seller: last?.seller, color: sellerColorOf(data, last?.seller) });
    });
    // Clientes da mesma cidade: espalha um pouco para não ficarem um em cima do outro
    const groups = {};
    out.filter(p => p.pos && !p.pos.exact).forEach(p => { const k = `${p.pos.lat},${p.pos.lng}`; (groups[k] = groups[k] || []).push(p); });
    Object.values(groups).forEach(g => g.length > 1 && g.forEach((p, i) => { const a = (i / g.length) * Math.PI * 2; p.pos = { lat: p.pos.lat + Math.sin(a) * 0.02, lng: p.pos.lng + Math.cos(a) * 0.02 }; }));
    return out;
  }, [cities, orders, data.clients, data.sellers]);

  const located = points.filter(p => p.pos);
  const missing = points.filter(p => !p.pos);
  const routePoints = route.map(n => located.find(p => p.name === n)).filter(Boolean);

  useEffect(() => { setFitKey(k => k + 1); }, [located.length, !!factory]);
  useEffect(() => { setRouteGeo(null); setRouteInfo(null); }, [route.join("|"), factory?.lat, factory?.lng]);

  const saveFactory = (f) => { save({ ...data, settings: { ...(data.settings || {}), factory: f } }); setFactoryForm(false); setPlacing(false); setCityQuery(""); setFitKey(k => k + 1); };
  const cityMatches = useMemo(() => {
    if (!cities || cityQuery.trim().length < 2) return [];
    const q = norm(cityQuery);
    return cities.rows.filter(c => c.key.startsWith(q)).slice(0, 8).concat(cities.rows.filter(c => !c.key.startsWith(q) && c.key.includes(q)).slice(0, 4));
  }, [cityQuery, cities]);

  const toggleRoute = (name) => setRoute(r => r.includes(name) ? r.filter(x => x !== name) : [...r, name]);
  const move = (i, d) => setRoute(r => { const a = [...r]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });

  // Rota pelas estradas (OSRM, gratuito). Se falhar, mostra linha reta com distância aproximada.
  const calcRoute = async (optimize) => {
    if (!factory || !routePoints.length) return;
    setRouting(true);
    const stops = [factory, ...routePoints.map(p => p.pos)];
    const coords = stops.map(p => `${p.lng},${p.lat}`).join(";");
    try {
      const url = optimize
        ? `https://router.project-osrm.org/trip/v1/driving/${coords}?source=first&roundtrip=true&overview=full&geometries=geojson`
        : `https://router.project-osrm.org/route/v1/driving/${coords};${factory.lng},${factory.lat}?overview=full&geometries=geojson`;
      const r = await fetch(url).then(x => x.json());
      const trip = optimize ? r.trips?.[0] : r.routes?.[0];
      if (!trip) throw new Error("sem rota");
      if (optimize && r.waypoints) {
        const ordered = r.waypoints.slice(1).map((w, i) => ({ w, name: routePoints[i].name })).sort((a, b) => a.w.waypoint_index - b.w.waypoint_index).map(x => x.name);
        setRoute(ordered);
      }
      setRouteGeo(trip.geometry.coordinates.map(([lng, lat]) => [lat, lng]));
      setRouteInfo({ km: trip.distance / 1000, secs: trip.duration, roads: true });
    } catch {
      const pts = [factory, ...routePoints.map(p => p.pos), factory];
      let d = 0; for (let i = 1; i < pts.length; i++) d += km(pts[i - 1], pts[i]);
      setRouteGeo(pts.map(p => [p.lat, p.lng]));
      setRouteInfo({ km: d * 1.25, secs: null, roads: false });
    }
    setRouting(false);
  };
  const gmapsUrl = factory && routePoints.length ? `https://www.google.com/maps/dir/${[factory, ...routePoints.map(p => p.pos), factory].map(p => `${p.lat},${p.lng}`).join("/")}` : null;



  const card = dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200";
  const inp = `w-full px-3 py-2 rounded-xl text-sm border outline-none ${dark ? "bg-gray-800 text-white border-gray-700" : "bg-white border-gray-200 text-gray-900"} focus:border-emerald-500`;
  const allPts = [...located.map(p => [p.pos.lat, p.pos.lng]), ...(factory ? [[factory.lat, factory.lng]] : [])];
  // Mapa do OpenStreetMap (gratuito, sem chave). No modo escuro as cores são invertidas por CSS.
  const tiles = { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' };

  return (
    <div className="flex flex-col xl:flex-row gap-5">
      <style>{`@keyframes pinPulse{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.6);opacity:0}} .leaflet-container{font-family:Inter,system-ui,sans-serif;border-radius:16px}${dark ? ' .osm-dark .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.92) contrast(.88) saturate(.7)}' : ''} .leaflet-popup-content-wrapper{border-radius:14px} .route-dash{stroke-dasharray:10 8;animation:dash 1s linear infinite}@keyframes dash{to{stroke-dashoffset:-18}}`}</style>

      <div className={`xl:w-[68%] rounded-2xl border p-2 relative ${card}`}>
        {(placing) && <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-black shadow-xl">Clique no mapa onde fica a sua fábrica <button onClick={() => setPlacing(false)} className="ml-2 underline">cancelar</button></div>}
        <MapContainer className={dark ? "osm-dark" : ""} center={[-15, -50]} zoom={4} minZoom={3} maxZoom={18} scrollWheelZoom style={{ height: "min(620px, 72vh)", width: "100%", cursor: placing ? "crosshair" : undefined }}>
          <TileLayer url={tiles.url} attribution={tiles.attr} maxZoom={19} />
          <FitTo points={allPts} trigger={fitKey} />
          <ClickToPlace active={placing} onPick={(ll) => saveFactory({ name: factory?.name || "Minha fábrica", lat: +ll.lat.toFixed(5), lng: +ll.lng.toFixed(5), city: factory?.city || "" })} />
          {focus && <FocusOn pos={focus} />}
          {factory && (
            <Marker position={[factory.lat, factory.lng]} icon={factoryIcon} draggable={canEdit} eventHandlers={{ dragend: (e) => saveFactory({ ...factory, ...e.target.getLatLng() }) }}>
              <Tooltip direction="top" offset={[0, -20]}>{factory.name || "Fábrica"}</Tooltip>
            </Marker>
          )}
          {routeGeo && <Polyline positions={routeGeo} pathOptions={{ color: "#10b981", weight: 5, opacity: 0.9, className: routeInfo?.roads ? "" : "route-dash" }} />}
          {located.map(p => {
            const inRoute = route.indexOf(p.name);
            return (
              <Marker key={p.name} position={[p.pos.lat, p.pos.lng]} icon={pinIcon(p.color, inRoute >= 0 ? inRoute + 1 : p.orders.length, inRoute >= 0 || picked === p.name)}
                eventHandlers={{ click: () => setPicked(p.name) }}>
                <Tooltip direction="top" offset={[0, -34]}>{p.name}</Tooltip>
              </Marker>
            );
          })}
        </MapContainer>
        {(() => {
          const p = located.find(x => x.name === picked); if (!p) return null;
          const inRoute = route.indexOf(p.name);
          const dist = factory ? km(factory, p.pos) : null;
          const wa = whatsappLink(p.client?.phone, `Olá ${p.name}! 🎈 Aqui é da fábrica. Tudo certo com os seus brinquedos? 😊`);
          return (
            <div className={`absolute top-3 right-3 z-[500] w-[270px] max-w-[calc(100%-24px)] p-3.5 rounded-2xl border shadow-2xl animate-slide-up ${dark ? "bg-gray-950/95 border-gray-700 text-slate-200" : "bg-white/95 border-gray-200 text-gray-900"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="font-black text-sm leading-tight">{p.name}</div><div className="text-[11px] text-slate-500 font-semibold">{p.city ? `${p.city.name} - ${p.city.uf}` : (p.client?.city || "")}</div></div>
                <button onClick={() => setPicked(null)} className="opacity-60 hover:opacity-100 flex-shrink-0"><X size={15} /></button>
              </div>
              <div className="text-xs mt-2 space-y-0.5">
                <div><b>{p.orders.length}</b> pedido(s) · <b>{moneyBR(p.revenue)}</b></div>
                {p.seller && <div>Vendedor: <b style={{ color: p.color }}>{p.seller}</b></div>}
                {dist !== null && <div>Da fábrica: <b>{fmtKm(dist)}</b> em linha reta</div>}
                <div className="text-slate-500">Pedidos: {p.orders.map(o => orderNumber(o.id)).join(", ")}</div>
              </div>
              <div className="flex gap-1.5 flex-wrap mt-2.5">
                <button onClick={() => toggleRoute(p.name)} className={`px-2.5 py-1.5 rounded-lg text-xs font-black text-white ${inRoute >= 0 ? "bg-red-500" : "bg-emerald-500"}`}>{inRoute >= 0 ? "Tirar da rota" : "➕ Adicionar à rota"}</button>
                {wa && <a href={wa} target="_blank" rel="noreferrer" className="px-2.5 py-1.5 rounded-lg text-xs font-black text-white bg-[#25D366]">💬 WhatsApp</a>}
              </div>
              <div className="text-[10px] text-slate-500 mt-2">A localização vem da cidade e do estado do cliente. Para corrigir, edite na aba Clientes.</div>
            </div>
          );
        })()}
        <div className="text-[11px] text-slate-500 font-bold text-center mt-2">{located.length} cliente{located.length === 1 ? "" : "s"} no mapa · role para dar zoom e ver as cidades vizinhas · cor do pino = vendedor</div>
      </div>

      <div className="xl:w-[32%] space-y-4 min-w-0">
        {/* FÁBRICA */}
        <div className={`rounded-2xl border p-4 ${card}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-black text-sm flex items-center gap-2"><Factory size={16} className="text-orange-500" />Sua fábrica</h3>
            {factory && canEdit && !factoryForm && <button onClick={() => setFactoryForm(true)} className="text-xs font-bold text-orange-500 flex items-center gap-1"><Edit3 size={12} />Editar</button>}
          </div>
          {factory && !factoryForm && (
            <button onClick={() => setFocus({ lat: factory.lat, lng: factory.lng, t: Date.now() })} className="text-left w-full">
              <div className="font-bold">{factory.name || "Minha fábrica"}</div>
              <div className="text-xs text-slate-500">{factory.city || `${factory.lat.toFixed(3)}, ${factory.lng.toFixed(3)}`}</div>
            </button>
          )}
          {!factory && !factoryForm && <p className="text-xs text-slate-500">{canEdit ? "Cadastre a localização da fábrica para ver distâncias e rotas." : "O gerente ainda não cadastrou a localização da fábrica."}</p>}
          {factoryForm && canEdit && (
            <div className="space-y-2 mt-1">
              <p className="text-xs text-slate-500">{factory ? "Altere a localização da fábrica." : "Primeiro acesso: onde fica a sua fábrica? Isso é usado para calcular distâncias e rotas."}</p>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={cityQuery} onChange={e => setCityQuery(e.target.value)} placeholder="Digite a cidade da fábrica…" className={`${inp} pl-8`} />
                {cityMatches.length > 0 && (
                  <div className={`absolute z-[600] mt-1 w-full rounded-xl border shadow-2xl overflow-hidden ${card}`}>
                    {cityMatches.map(c => <button key={`${c.name}-${c.uf}`} onClick={() => saveFactory({ name: factory?.name || "Minha fábrica", city: `${c.name} - ${c.uf}`, lat: c.lat, lng: c.lng })} className={`w-full text-left px-3 py-2 text-sm font-semibold ${dark ? "hover:bg-gray-800" : "hover:bg-gray-50"}`}>{c.name} <span className="text-slate-500">- {c.uf}</span></button>)}
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => { setPlacing(true); }} className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white flex items-center gap-1"><MapPin size={13} />Marcar no mapa</button>
                <button onClick={() => navigator.geolocation?.getCurrentPosition(p => saveFactory({ name: factory?.name || "Minha fábrica", city: "Localização atual", lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }), () => alert("Não foi possível pegar sua localização. Digite a cidade ou marque no mapa."))} className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1 ${dark ? "border-gray-700" : "border-gray-300"}`}><Crosshair size={13} />Estou na fábrica</button>
                {factory && <button onClick={() => setFactoryForm(false)} className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500">Fechar</button>}
              </div>
              {factory && <p className="text-[11px] text-slate-500">Dica: você também pode arrastar o ícone 🏭 no mapa.</p>}
            </div>
          )}
        </div>

        {/* ROTA */}
        <div className={`rounded-2xl border p-4 ${card}`}>
          <h3 className="font-black text-sm flex items-center gap-2 mb-2"><Route size={16} className="text-emerald-500" />Planejar rota</h3>
          {!route.length && <p className="text-xs text-slate-500">Clique num cliente no mapa e em <b>"Adicionar à rota"</b>. A rota sai da fábrica, passa pelos clientes e volta.</p>}
          <div className="space-y-1.5">
            {route.map((n, i) => {
              const p = located.find(x => x.name === n);
              return (
                <div key={n} className={`flex items-center gap-2 p-2 rounded-xl ${dark ? "bg-gray-800/60" : "bg-gray-50"}`}>
                  <span className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <button onClick={() => { if (p) { setFocus({ ...p.pos, t: Date.now() }); setPicked(p.name); } }} className="flex-1 min-w-0 text-left"><div className="text-sm font-bold truncate">{n}</div><div className="text-[10px] text-slate-500">{p?.city ? `${p.city.name} - ${p.city.uf}` : ""}{factory && p ? ` · ${fmtKm(km(factory, p.pos))} da fábrica` : ""}</div></button>
                  <button onClick={() => move(i, -1)} className="px-1 text-slate-500 hover:text-white">▲</button>
                  <button onClick={() => move(i, 1)} className="px-1 text-slate-500 hover:text-white">▼</button>
                  <button onClick={() => toggleRoute(n)} className="p-1 text-slate-500 hover:text-red-500"><X size={14} /></button>
                </div>
              );
            })}
          </div>
          {route.length > 0 && (
            <div className="mt-3 space-y-2">
              {!factory && <p className="text-xs font-bold text-amber-500">Cadastre a fábrica acima para calcular a rota.</p>}
              <div className="flex gap-2 flex-wrap">
                <button disabled={!factory || routing} onClick={() => calcRoute(false)} className="px-3 py-2 rounded-xl text-xs font-black bg-emerald-500 text-white disabled:opacity-40 flex items-center gap-1"><Navigation size={13} />{routing ? "Calculando…" : "Calcular rota"}</button>
                <button disabled={!factory || routing || route.length < 2} onClick={() => calcRoute(true)} className={`px-3 py-2 rounded-xl text-xs font-black border disabled:opacity-40 ${dark ? "border-gray-700" : "border-gray-300"}`}>Melhor ordem</button>
                <button onClick={() => setRoute([])} className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 flex items-center gap-1"><Trash2 size={12} />Limpar</button>
              </div>
              {routeInfo && (
                <div className="rounded-xl p-3 bg-emerald-500/10 border border-emerald-500/30 animate-slide-up">
                  <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{routeInfo.roads ? "Rota pelas estradas (ida e volta)" : "Estimativa (linha reta +25%)"}</div>
                  <div className="text-2xl font-black">{fmtKm(routeInfo.km)}</div>
                  {routeInfo.secs && <div className="text-xs font-bold text-slate-500">≈ {fmtTime(routeInfo.secs)} dirigindo, sem paradas</div>}
                </div>
              )}
              {gmapsUrl && <a href={gmapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500 hover:underline"><ExternalLink size={12} />Abrir rota no Google Maps</a>}
            </div>
          )}
        </div>

        {/* CLIENTES */}
        <div className={`rounded-2xl border p-4 ${card}`}>
          <h3 className="font-black text-sm mb-2">Clientes {factory && <span className="text-slate-500 font-bold">· por distância</span>}</h3>
          <div className="space-y-1 max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
            {[...located].sort((a, b) => factory ? km(factory, a.pos) - km(factory, b.pos) : b.revenue - a.revenue).map(p => (
              <div key={p.name} className={`flex items-center gap-2 p-2 rounded-lg ${dark ? "hover:bg-gray-800" : "hover:bg-gray-50"}`}>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
                <button onClick={() => { setFocus({ ...p.pos, t: Date.now() }); setPicked(p.name); }} className="flex-1 min-w-0 text-left"><div className="text-sm font-bold truncate">{p.name}</div><div className="text-[10px] text-slate-500">{p.city ? `${p.city.name} - ${p.city.uf}` : ""}{factory ? ` · ${fmtKm(km(factory, p.pos))}` : ""}</div></button>
                <button onClick={() => toggleRoute(p.name)} title="Adicionar à rota" className={`text-xs font-black px-2 py-1 rounded-lg ${route.includes(p.name) ? "bg-emerald-500 text-white" : "text-emerald-500"}`}>{route.includes(p.name) ? <Check size={12} /> : "+ rota"}</button>
              </div>
            ))}
            {!located.length && <p className="text-xs text-slate-500">Nenhum cliente com cidade reconhecida neste filtro.</p>}
          </div>
          {missing.length > 0 && (
            <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs">
              <b className="text-amber-500">{missing.length} cliente(s) sem cidade reconhecida:</b> <span className="text-slate-500">{missing.slice(0, 6).map(m => m.name).join(", ")}{missing.length > 6 ? "…" : ""}. Corrija a cidade e o estado na aba Clientes.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FocusOn({ pos }) {
  const map = useMap();
  useEffect(() => { map.flyTo([pos.lat, pos.lng], Math.max(map.getZoom(), 11), { duration: 0.8 }); }, [pos.t]); // eslint-disable-line
  return null;
}
