"use client";

// pages/Auditoria/components/AuditMapPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Mapa SOLO-LECTURA con pines de eventos del audit. Misma estética que
// GarageMap/LocationMap pero SIN ruteo, SIN búsqueda, SIN reverse
// geocode — es un dashboard de inspección, no una herramienta de
// navegación. Por eso es un componente aparte, no un wrapper.
//
// Pins de garaje se dibujan aparte (props `garages`) — fondo gris — y
// los pines de eventos van encima, coloreados por status (match verde,
// anomalia ambar, no_garage gris).
//
// Hover/click sync con la lista (vía props hoveredEventId/selectedEventId
// y onHoverEvent/onSelectEvent).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useCallback } from "react";
import type { AuditLocationEvent } from "../../../hooks/useAudit";

type GaragePoint = { id: number | string; name: string; latitude: number; longitude: number };

type Props = {
  events: AuditLocationEvent[];
  garages?: GaragePoint[];
  hoveredEventId?: number | string | null;
  selectedEventId?: number | string | null;
  onHoverEvent?: (id: number | string | null) => void;
  onSelectEvent?: (id: number | string | null) => void;
  /** Si la altura debe ser fija o flexible (default 460). */
  height?: number;
};

const TILE_DARK  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_LIGHT = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const STATUS_COLOR: Record<AuditLocationEvent["status"], string> = {
  match:     "#22c55e",
  anomaly:   "#f59e0b",
  no_garage: "#94a3b8",
};

const STATUS_LABEL: Record<AuditLocationEvent["status"], string> = {
  match:     "Dentro de rango",
  anomaly:   "Fuera de rango",
  no_garage: "Sin garaje matcheado",
};

function makeEventPinHTML(e: AuditLocationEvent, isHover: boolean, isSelected: boolean): string {
  const color = STATUS_COLOR[e.status];
  const size = isSelected ? 22 : isHover ? 18 : 14;
  const glow = isSelected ? "rgba(34,197,94,.55)" : isHover ? "rgba(99,102,241,.45)" : `${color}55`;
  return `
    <div style="position:relative;width:24px;height:24px;cursor:pointer;display:flex;align-items:center;justify-content:center">
      <div style="position:absolute;inset:0;border-radius:50%;background:${glow};transform:scale(${isSelected ? 1.6 : isHover ? 1.3 : 1});transition:transform .15s"></div>
      <div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 2px 6px ${glow}"></div>
    </div>`;
}

function makeGaragePinHTML(g: GaragePoint, isHover: boolean): string {
  const sz = isHover ? 18 : 14;
  return `
    <div style="position:relative;width:24px;height:24px;cursor:pointer;display:flex;align-items:center;justify-content:center">
      <div style="position:relative;width:${sz}px;height:${sz}px;border-radius:4px;background:#475569;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>
    </div>`;
}

export function AuditMapPanel({
  events, garages = [],
  hoveredEventId = null, selectedEventId = null,
  onHoverEvent, onSelectEvent,
  height = 460,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const tileRef      = useRef<any>(null);
  const leafletRef   = useRef<any>(null);
  const eventMarkers = useRef<Map<string, any>>(new Map());
  const garageMarkers = useRef<Map<string, any>>(new Map());
  const hasFitRef    = useRef(false);

  // ── Init map ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import("leaflet").then((L) => {
      leafletRef.current = L;
      const map = L.map(containerRef.current!, {
        center: [-2.1894, -79.8891],   // Guayaquil default
        zoom: 13,
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: true,
      });
      tileRef.current = L.tileLayer(
        document.documentElement.classList.contains("dark") ? TILE_DARK : TILE_LIGHT,
        { maxZoom: 19 },
      ).addTo(map);
      mapRef.current = map;
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  // ── Draw garage markers ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    const map = mapRef.current;

    garageMarkers.current.forEach((m) => m.remove());
    garageMarkers.current.clear();

    for (const g of garages) {
      if (g.latitude == null || g.longitude == null) continue;
      const icon = L.divIcon({
        className: "",
        html: makeGaragePinHTML(g, false),
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const m = L.marker([g.latitude, g.longitude], { icon, zIndexOffset: 100 })
        .addTo(map)
        .bindTooltip(g.name, { direction: "top", offset: [0, -8] });
      garageMarkers.current.set(String(g.id), m);
    }
  }, [garages]);

  // ── Draw event markers ──────────────────────────────────────────────
  const drawEventMarkers = useCallback(() => {
    if (!mapRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    const map = mapRef.current;

    eventMarkers.current.forEach((m) => m.remove());
    eventMarkers.current.clear();

    for (const e of events) {
      const isHover = hoveredEventId != null && String(hoveredEventId) === String(e.auditId);
      const isSel   = selectedEventId != null && String(selectedEventId) === String(e.auditId);
      const icon = L.divIcon({
        className: "",
        html: makeEventPinHTML(e, isHover, isSel),
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const m = L.marker([e.latitude, e.longitude], { icon, zIndexOffset: isSel ? 500 : 200 })
        .addTo(map)
        .on("click", () => onSelectEvent?.(e.auditId))
        .on("mouseover", () => onHoverEvent?.(e.auditId))
        .on("mouseout",  () => onHoverEvent?.(null))
        .bindTooltip(
          `<div style="font-size:10px;line-height:1.2"><strong>${e.actorName}</strong><br/>${e.entity} · ${e.action}<br/><span style="color:#64748b">${STATUS_LABEL[e.status]}</span></div>`,
          { direction: "top", offset: [0, -8] },
        );
      eventMarkers.current.set(String(e.auditId), m);
    }

    // Auto-fit cuando es la primera carga con datos
    if (!hasFitRef.current && events.length > 0) {
      hasFitRef.current = true;
      const allPoints: [number, number][] = [
        ...events.map((e) => [e.latitude, e.longitude] as [number, number]),
        ...garages.filter((g) => g.latitude && g.longitude).map((g) => [g.latitude, g.longitude] as [number, number]),
      ];
      if (allPoints.length > 0) {
        map.fitBounds(L.latLngBounds(allPoints), { padding: [60, 60], maxZoom: 15 });
      }
    }
  }, [events, garages, hoveredEventId, selectedEventId, onHoverEvent, onSelectEvent]);

  useEffect(() => { drawEventMarkers(); }, [drawEventMarkers]);

  // ── Fly to selected ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || selectedEventId == null) return;
    const e = events.find((x) => String(x.auditId) === String(selectedEventId));
    if (e) mapRef.current.flyTo([e.latitude, e.longitude], 16, { duration: 0.8 });
  }, [selectedEventId, events]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08]" style={{ height }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />

      {/* Empty state */}
      {events.length === 0 && garages.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50/80 dark:bg-gray-950/80 backdrop-blur-sm" style={{ zIndex: 400 }}>
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Sin eventos geolocalizados todavía</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Las acciones con GPS aparecerán acá</p>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm px-3 py-2 text-[10px] font-semibold" style={{ zIndex: 400 }}>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.match }} />
          <span className="text-gray-500 dark:text-gray-400">OK</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.anomaly }} />
          <span className="text-gray-500 dark:text-gray-400">Anomalía</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.no_garage }} />
          <span className="text-gray-500 dark:text-gray-400">Sin garaje</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-sm" style={{ background: "#475569" }} />
          <span className="text-gray-500 dark:text-gray-400">Garaje</span>
        </div>
      </div>
    </div>
  );
}
