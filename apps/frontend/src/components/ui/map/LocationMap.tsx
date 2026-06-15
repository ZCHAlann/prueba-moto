// src/components/ui/map/LocationMap.tsx
//
// Mapa genérico con marcadores para Talleres y Proveedores (reutiliza
// el patrón de GarageMap, pero con un marker más representativo y
// soporte para dos tipos de POI vía prop `kind`).
//
// Funcionalidades:
//  - Marcadores con icono representativo (martillo para taller, caja para proveedor).
//  - Trazar ruta desde origen (GPS / búsqueda) hasta un marcador.
//  - Click derecho en el mapa → menú contextual para trazar ruta.
//  - Click en marcador → selecciona y abre detalle.
//  - Soporte dark/light automático vía MutationObserver.

import { useEffect, useRef, useState, useCallback } from "react";

export type MapKind = "workshop" | "supplier";

export type MapPoint = {
  id: string;
  name: string;
  subtitle?: string | null;
  latitude: number;
  longitude: number;
};

type Props = {
  kind: MapKind;
  points: MapPoint[];
  selectedId: string | null;
  onSelectPoint: (id: string) => void;
};

const TILE_DARK  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_LIGHT = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const KIND_META: Record<MapKind, { color: string; glow: string; label: string; }> = {
  workshop: { color: "#f97316", glow: "rgba(249,115,22,.55)", label: "Taller"  },
  supplier: { color: "#06b6d4", glow: "rgba(6,182,212,.55)",  label: "Proveedor" },
};

// ── Routing via OSRM ──────────────────────────────────────────────────────────
async function fetchRoute(from: [number, number], to: [number, number]): Promise<[number, number][]> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("OSRM error");
  const data = await res.json();
  if (data.code !== "Ok") throw new Error("OSRM no route");
  return data.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "es", "User-Agent": "gentrack/1.0" }, signal: AbortSignal.timeout(4000) }
    );
    const d = await res.json();
    return d.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

async function searchPlace(query: string): Promise<any[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  const res = await fetch(url.toString(), {
    headers: { "Accept-Language": "es", "User-Agent": "gentrack/1.0" },
    signal: AbortSignal.timeout(5000),
  });
  return res.json();
}

// ── Haversine ─────────────────────────────────────────────────────────────────
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}
function formatDist(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// ── Marker HTML ───────────────────────────────────────────────────────────────
//
// Pin representativo:
//  - Taller (kind=workshop): un pin con un martillo adentro (naranja).
//  - Proveedor (kind=supplier): un pin con una caja adentro (cian).
//  - El pin se hace más grande y muestra un anillo cuando está seleccionado.

function makeMarkerHTML(p: MapPoint, kind: MapKind, isSelected: boolean): string {
  const meta = KIND_META[kind];
  const iconSvg = kind === "workshop"
    // Martillo dentro del pin
    ? `<g transform="translate(24,20) rotate(-30)">
         <rect x="-7" y="-1.5" width="11" height="3" rx="0.5" fill="white" opacity="0.95"/>
         <rect x="3" y="-5" width="6" height="9" rx="1" fill="white" opacity="0.95"/>
         <rect x="-9" y="-2.5" width="3" height="5" rx="0.5" fill="white" opacity="0.95"/>
       </g>`
    // Caja de paquete dentro del pin
    : `<g transform="translate(24,19)">
         <rect x="-7" y="-2" width="14" height="10" rx="1" fill="white" opacity="0.95"/>
         <rect x="-7" y="-2" width="14" height="3" fill="white" opacity="0.7"/>
         <line x1="0" y1="-2" x2="0" y2="8" stroke="${meta.color}" stroke-width="0.7" opacity="0.4"/>
         <rect x="-1.5" y="-1.5" width="3" height="3" fill="${meta.color}" opacity="0.55"/>
       </g>`;

  const scale  = isSelected ? "scale(1.25)" : "scale(1)";
  const ringSz = isSelected ? 56 : 42;

  return `
    <div style="position:relative;width:48px;height:64px;cursor:pointer;transform:${scale};transform-origin:center bottom;transition:transform .2s ease">
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-62%);
        width:${ringSz}px;height:${ringSz}px;border-radius:50%;
        background:${meta.glow};${isSelected ? `box-shadow:0 0 20px 5px ${meta.glow};` : ""}
        transition:all .3s;pointer-events:none;"></div>
      <svg width="48" height="58" viewBox="0 0 48 58" fill="none" xmlns="http://www.w3.org/2000/svg"
        style="filter:drop-shadow(0 4px 10px ${meta.glow});pointer-events:none">
        <path d="M24 2C14.06 2 6 10.06 6 20C6 34 24 54 24 54C24 54 42 34 42 20C42 10.06 33.94 2 24 2Z"
          fill="${meta.color}" stroke="rgba(255,255,255,.75)" stroke-width="1.5"/>
        ${iconSvg}
      </svg>
      <div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);
        background:rgba(8,10,18,.92);backdrop-filter:blur(6px);color:white;font-size:9px;
        font-weight:700;letter-spacing:.3px;white-space:nowrap;padding:2px 7px;border-radius:6px;
        border:1px solid rgba(255,255,255,.1);max-width:120px;overflow:hidden;text-overflow:ellipsis;
        pointer-events:none;">${p.name}</div>
    </div>`;
}

// ── Route state ───────────────────────────────────────────────────────────────
type RouteState = {
  destLat: number;
  destLng: number;
  destLabel: string;
  destPointId: string | null;
  phase: "picking" | "done";
  searchQuery: string;
  searchResults: any[];
  searching: boolean;
  routeInfo: { distance: string } | null;
  loading: boolean;
};

export function LocationMap({ kind, points, selectedId, onSelectPoint }: Props) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<any>(null);
  const tileRef         = useRef<any>(null);
  const markersRef      = useRef<Map<string, any>>(new Map());
  const userMarkerRef   = useRef<any>(null);
  const routeLayerRef   = useRef<{ remove: () => void } | null>(null);
  const destMarkerRef   = useRef<any>(null);
  const originMarkerRef = useRef<any>(null);
  const leafletRef      = useRef<any>(null);
  const hasFitRef       = useRef(false);
  const pinModeRef      = useRef(false);
  const [pinMode, setPinMode] = useState(false);

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [route, setRoute] = useState<RouteState | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; lat: number; lng: number; pointId: string | null } | null>(null);

  // ── Dark mode observer ────────────────────────────────────────────────────
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // ── Tile swap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !leafletRef.current) return;
    tileRef.current?.remove();
    tileRef.current = leafletRef.current.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, { maxZoom: 19 }).addTo(mapRef.current);
  }, [isDark]);

  // ── drawMarkers ───────────────────────────────────────────────────────────
  const drawMarkers = useCallback((L: any, map: any, pts: MapPoint[], selId: string | null) => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();
    pts.forEach((p) => {
      const icon = L.divIcon({ className: "", html: makeMarkerHTML(p, kind, p.id === selId), iconSize: [48, 80], iconAnchor: [24, 54] });
      const m = L.marker([p.latitude, p.longitude], { icon })
        .addTo(map)
        .on("click", (e: any) => { L.DomEvent.stopPropagation(e); onSelectPoint(p.id); })
        .on("contextmenu", (e: any) => {
          e.originalEvent.preventDefault();
          const containerRect = containerRef.current!.getBoundingClientRect();
          setCtxMenu({
            x: e.originalEvent.clientX - containerRect.left,
            y: e.originalEvent.clientY - containerRect.top,
            lat: p.latitude,
            lng: p.longitude,
            pointId: p.id,
          });
        });
      markersRef.current.set(p.id, m);
    });
    if (pts.length > 0 && !hasFitRef.current) {
      hasFitRef.current = true;
      map.fitBounds(L.latLngBounds(pts.map((p) => [p.latitude, p.longitude])), { padding: [70, 70], maxZoom: 15 });
    }
  }, [kind, onSelectPoint]);

  // ── drawRoute ─────────────────────────────────────────────────────────────
  const drawRoute = useCallback(async (L: any, map: any, from: [number, number], to: [number, number]) => {
    routeLayerRef.current?.remove();
    routeLayerRef.current = null;

    const straight = L.polyline([from, to], { color: "#818cf8", weight: 3, opacity: 0.55, dashArray: "6 8" }).addTo(map);
    routeLayerRef.current = { remove: () => straight.remove() };
    map.fitBounds(L.latLngBounds([from, to]), { padding: [80, 80] });

    const distKm = haversineKm(from, to);
    setRoute((r) => r ? { ...r, phase: "done", loading: true, routeInfo: { distance: formatDist(distKm) } } : r);

    try {
      const coords = await fetchRoute(from, to);
      straight.remove();
      const dark = document.documentElement.classList.contains("dark");
      const glow = L.polyline(coords, { color: dark ? "#818cf8" : "#6366f1", weight: 9, opacity: 0.18 }).addTo(map);
      const line = L.polyline(coords, { color: dark ? "#a5b4fc" : "#4f46e5", weight: 4, opacity: 1, dashArray: "10 6" }).addTo(map);
      routeLayerRef.current = { remove: () => { glow.remove(); line.remove(); } };
      let realKm = 0;
      for (let i = 1; i < coords.length; i++) realKm += haversineKm(coords[i - 1], coords[i]);
      setRoute((r) => r ? { ...r, loading: false, routeInfo: { distance: formatDist(realKm) } } : r);
      map.fitBounds(L.latLngBounds(coords), { padding: [60, 60] });
    } catch {
      setRoute((r) => r ? { ...r, loading: false } : r);
    }
  }, []);

  // ── placeDest ─────────────────────────────────────────────────────────────
  const placeDest = useCallback(async (lat: number, lng: number, pointId: string | null) => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    destMarkerRef.current?.remove();
    const icon = L.divIcon({
      className: "",
      html: `<div style="display:flex;flex-direction:column;align-items:center;animation:drop-in .3s cubic-bezier(.34,1.56,.64,1)">
        <div style="width:22px;height:22px;border-radius:50%;background:#6366f1;border:3px solid white;
          box-shadow:0 2px 12px rgba(99,102,241,.6);"></div>
        <div style="width:2px;height:12px;background:#6366f1;margin-top:-1px;opacity:.7;"></div>
      </div>`,
      iconSize: [22, 34],
      iconAnchor: [11, 34],
    });
    destMarkerRef.current = L.marker([lat, lng], { icon, zIndexOffset: 500 }).addTo(map);

    setRoute({
      destLat: lat, destLng: lng, destLabel: "",
      destPointId: pointId,
      phase: "picking",
      searchQuery: "", searchResults: [], searching: false,
      routeInfo: null, loading: false,
    });

    reverseGeocode(lat, lng).then((label) =>
      setRoute((r) => r ? { ...r, destLabel: label } : r)
    );
  }, []);

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import("leaflet").then((L) => {
      leafletRef.current = L;
      const map = L.map(containerRef.current!, {
        center: [-2.1894, -79.8891],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
      });

      L.control.zoom({ position: "topright" }).addTo(map);
      tileRef.current = L.tileLayer(
        document.documentElement.classList.contains("dark") ? TILE_DARK : TILE_LIGHT,
        { maxZoom: 19 }
      ).addTo(map);

      map.on("click", (e: any) => {
        setCtxMenu(null);
        if (pinModeRef.current) {
          pinModeRef.current = false;
          setPinMode(false);
          placeDest(e.latlng.lat, e.latlng.lng, null);
        }
      });

      map.on("contextmenu", (e: any) => {
        e.originalEvent.preventDefault();
        const containerRect = containerRef.current!.getBoundingClientRect();
        setCtxMenu({
          x: e.originalEvent.clientX - containerRect.left,
          y: e.originalEvent.clientY - containerRect.top,
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          pointId: null,
        });
      });

      mapRef.current = map;
      drawMarkers(L, map, points, selectedId);
    });

    return () => { mapRef.current?.remove(); mapRef.current = null; leafletRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // ── Redraw markers ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !leafletRef.current) return;
    drawMarkers(leafletRef.current, mapRef.current, points, selectedId);
  }, [points, selectedId, drawMarkers]);

  // ── Fly to selected ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !selectedId) return;
    const p = points.find((x) => x.id === selectedId);
    if (p) mapRef.current.flyTo([p.latitude, p.longitude], 16, { duration: 0.8 });
  }, [selectedId, points]);

  // ── Cursor style ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.cursor = pinMode ? "crosshair" : "";
  }, [pinMode]);

  // ── GPS origin ────────────────────────────────────────────────────────────
  function handleGPSOrigin() {
    if (!route) return;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const from: [number, number] = [coords.latitude, coords.longitude];
        const L = leafletRef.current;
        const map = mapRef.current;
        if (!L || !map) return;

        originMarkerRef.current?.remove();
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;border-radius:50%;background:#6366f1;border:3px solid white;box-shadow:0 0 10px rgba(99,102,241,.7)"></div>`,
          iconSize: [16, 16], iconAnchor: [8, 8],
        });
        originMarkerRef.current = L.marker(from, { icon, zIndexOffset: 400 }).addTo(map);

        await drawRoute(L, map, from, [route.destLat, route.destLng]);
      },
      () => alert("No se pudo obtener la ubicación GPS")
    );
  }

  // ── Search origin ─────────────────────────────────────────────────────────
  async function handleSearchOrigin() {
    if (!route?.searchQuery.trim()) return;
    setRoute((r) => r ? { ...r, searching: true } : r);
    try {
      const results = await searchPlace(route!.searchQuery);
      setRoute((r) => r ? { ...r, searching: false, searchResults: results } : r);
    } catch {
      setRoute((r) => r ? { ...r, searching: false } : r);
    }
  }

  async function handleSelectOrigin(item: any) {
    const from: [number, number] = [parseFloat(item.lat), parseFloat(item.lon)];
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !route) return;

    setRoute((r) => r ? { ...r, searchResults: [] } : r);

    originMarkerRef.current?.remove();
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:16px;height:16px;border-radius:50%;background:#6366f1;border:3px solid white;box-shadow:0 0 10px rgba(99,102,241,.7)"></div>`,
      iconSize: [16, 16], iconAnchor: [8, 8],
    });
    originMarkerRef.current = L.marker(from, { icon, zIndexOffset: 400 }).addTo(map);

    await drawRoute(L, map, from, [route.destLat, route.destLng]);
  }

  // ── Clear ─────────────────────────────────────────────────────────────────
  function clearRoute() {
    routeLayerRef.current?.remove(); routeLayerRef.current = null;
    destMarkerRef.current?.remove(); destMarkerRef.current = null;
    originMarkerRef.current?.remove(); originMarkerRef.current = null;
    setRoute(null);
    pinModeRef.current = false;
    setPinMode(false);
  }

  function togglePinMode() {
    if (pinMode) { pinModeRef.current = false; setPinMode(false); }
    else { pinModeRef.current = true; setPinMode(true); setCtxMenu(null); }
  }

  function locateUser() {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pos: [number, number] = [coords.latitude, coords.longitude];
        if (!mapRef.current || !leafletRef.current) return;
        const L = leafletRef.current;
        userMarkerRef.current?.remove();
        const icon = L.divIcon({
          className: "",
          html: `<div style="position:relative;width:28px;height:28px">
            <div style="position:absolute;inset:0;border-radius:50%;background:rgba(99,102,241,.22);animation:gps-pulse 2s infinite"></div>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:#6366f1;border:2.5px solid white;box-shadow:0 0 10px rgba(99,102,241,.7)"></div>
          </div>`,
          iconSize: [28, 28], iconAnchor: [14, 14],
        });
        userMarkerRef.current = L.marker(pos, { icon }).addTo(mapRef.current);
        mapRef.current.flyTo(pos, 15, { duration: 1 });
      },
      () => alert("No se pudo obtener tu ubicación")
    );
  }

  const validCount = points.length;
  const emptyMessage = kind === "workshop"
    ? "Sin talleres con ubicación guardada"
    : "Sin proveedores con ubicación guardada";
  const emptyHint = kind === "workshop"
    ? "Edita un taller y selecciona su dirección en el formulario"
    : "Edita un proveedor y selecciona su dirección en el formulario";

  return (
    <>
      <style>{`
        @keyframes gps-pulse { 0%,100%{transform:scale(1);opacity:.55} 50%{transform:scale(1.7);opacity:.15} }
        @keyframes drop-in { from{transform:translateY(-18px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes fade-in { from{opacity:0;transform:scale(.95)} to{opacity:1;transform:scale(1)} }
        .location-map-root .leaflet-pane          { z-index: 1 !important; }
        .location-map-root .leaflet-tile-pane     { z-index: 1 !important; }
        .location-map-root .leaflet-overlay-pane  { z-index: 2 !important; }
        .location-map-root .leaflet-shadow-pane   { z-index: 3 !important; }
        .location-map-root .leaflet-marker-pane   { z-index: 4 !important; }
        .location-map-root .leaflet-tooltip-pane  { z-index: 5 !important; }
        .location-map-root .leaflet-popup-pane    { z-index: 6 !important; }
        .location-map-root .leaflet-control       { z-index: 7 !important; }
        .location-map-root .leaflet-top,
        .location-map-root .leaflet-bottom        { z-index: 7 !important; }
      `}</style>

      <div
        className="location-map-root relative overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08]"
        style={{ height: 500, position: "relative", zIndex: 0 }}
        onClick={() => setCtxMenu(null)}
      >
        <div ref={containerRef} style={{ height: "100%", width: "100%" }} />

        {/* No hay puntos con ubicación */}
        {validCount === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950/80 backdrop-blur-sm" style={{ zIndex: 10 }}>
            <svg className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
              <circle cx="12" cy="9" r="2.5"/>
            </svg>
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{emptyMessage}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{emptyHint}</p>
          </div>
        )}

        {/* Top-left controls */}
        <div className="absolute top-3 left-3 flex items-center gap-2" style={{ zIndex: 8 }}>
          <button type="button" onClick={locateUser} title="Mi ubicación"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 dark:border-white/[0.1] bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm text-gray-600 dark:text-gray-300 hover:text-indigo-500 dark:hover:text-indigo-400 shadow-sm transition-colors">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
              <circle cx="12" cy="12" r="8" strokeDasharray="2 2" opacity=".35"/>
            </svg>
          </button>

          {!route && (
            <button
              type="button"
              onClick={togglePinMode}
              title={pinMode ? "Cancelar — clic para salir" : "Trazar ruta — clic para colocar destino"}
              className={`flex items-center gap-1.5 rounded-xl border px-3 h-9 text-xs font-semibold shadow-sm transition-all ${
                pinMode
                  ? "border-indigo-400 dark:border-indigo-500/60 bg-indigo-600 text-white animate-pulse"
                  : "border-gray-200 dark:border-white/[0.1] bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm text-gray-700 dark:text-gray-300 hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:text-indigo-600 dark:hover:text-indigo-400"
              }`}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              {pinMode ? "Haz clic en el mapa…" : "Trazar ruta"}
            </button>
          )}

          {route && (
            <button type="button" onClick={clearRoute}
              className="flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-500/30 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm px-3 h-9 text-xs font-semibold text-red-500 dark:text-red-400 shadow-sm hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Limpiar ruta
            </button>
          )}
        </div>

        {/* Route info pill */}
        {route?.phase === "done" && route.routeInfo && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl border border-indigo-200 dark:border-indigo-500/25 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm px-3 py-2 shadow-lg" style={{ zIndex: 8 }}>
            {route.loading && (
              <svg className="h-3.5 w-3.5 animate-spin text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
            )}
            <svg className="h-3.5 w-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12h18M3 12l4-4M3 12l4 4"/></svg>
            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-300">{route.routeInfo.distance}</span>
          </div>
        )}

        {/* Origin picker */}
        {route?.phase === "picking" && (
          <div
            className="absolute bottom-14 left-1/2 -translate-x-1/2 w-[340px] rounded-2xl border border-gray-200 dark:border-white/[0.1] bg-white/97 dark:bg-gray-900/97 backdrop-blur-md shadow-2xl overflow-hidden"
            style={{ zIndex: 9, animation: "fade-in .2s ease" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                <p className="text-xs font-bold text-gray-700 dark:text-white">¿Desde dónde sales?</p>
              </div>
              <button type="button" onClick={clearRoute} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="p-3 space-y-2">
              {route.destLabel && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate px-1">
                  → {route.destLabel.split(",").slice(0, 3).join(",")}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={handleGPSOrigin}
                  className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-3 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                  </svg>
                  Mi ubicación GPS
                </button>
                <button type="button"
                  onClick={() => setRoute((r) => r ? { ...r, searchQuery: r.searchQuery || " " } : r)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.03] px-3 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  Buscar dirección
                </button>
              </div>

              {(route.searchQuery !== null && route.searchQuery !== "") && (
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={route.searchQuery.trim() === "" ? "" : route.searchQuery}
                      onChange={(e) => setRoute((r) => r ? { ...r, searchQuery: e.target.value } : r)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearchOrigin()}
                      placeholder="Ingresa dirección de origen…"
                      className="flex-1 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.03] px-3 py-2 text-xs text-gray-800 dark:text-white placeholder:text-gray-400 outline-none focus:border-indigo-400 transition-colors"
                    />
                    <button type="button" onClick={handleSearchOrigin} disabled={route.searching}
                      className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center gap-1">
                      {route.searching
                        ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
                        : "Buscar"
                      }
                    </button>
                  </div>
                  {route.searchResults.length > 0 && (
                    <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] overflow-hidden divide-y divide-gray-100 dark:divide-white/[0.04] max-h-36 overflow-y-auto bg-white dark:bg-gray-900">
                      {route.searchResults.map((item: any) => (
                        <button key={item.place_id} type="button" onClick={() => handleSelectOrigin(item)}
                          className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors">
                          <svg className="mt-0.5 h-3 w-3 shrink-0 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
                          <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-2">{item.display_name}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right-click context menu */}
        {ctxMenu && (
          <div
            className="absolute rounded-xl border border-gray-200 dark:border-white/[0.1] bg-white dark:bg-gray-900 shadow-xl overflow-hidden py-1"
            style={{ left: ctxMenu.x, top: ctxMenu.y, zIndex: 9, minWidth: 180, animation: "fade-in .15s ease" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button"
              onClick={() => { setCtxMenu(null); placeDest(ctxMenu.lat, ctxMenu.lng, ctxMenu.pointId); }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.05] transition-colors">
              <svg className="h-3.5 w-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              Trazar ruta hasta aquí
            </button>
            <div className="my-1 border-t border-gray-100 dark:border-white/[0.06]" />
            <button type="button"
              onClick={() => { setCtxMenu(null); locateUser(); }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.05] transition-colors">
              <svg className="h-3.5 w-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
              </svg>
              Mi ubicación
            </button>
            <button type="button"
              onClick={() => setCtxMenu(null)}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/[0.05] transition-colors">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Cancelar
            </button>
          </div>
        )}

        {/* Legend (color del marker) */}
        <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm px-3 py-2 text-[10px] font-semibold" style={{ zIndex: 8 }}>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ background: KIND_META[kind].color }} />
            <span className="text-gray-500 dark:text-gray-400">{KIND_META[kind].label}</span>
          </div>
        </div>

        {/* Counter */}
        <div className="absolute bottom-3 right-3 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm px-3 py-2" style={{ zIndex: 8 }}>
          <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">
            {validCount} {validCount === 1 ? (kind === "workshop" ? "taller" : "proveedor") : (kind === "workshop" ? "talleres" : "proveedores")}
          </span>
        </div>
      </div>
    </>
  );
}
