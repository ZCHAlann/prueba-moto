import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Route as RouteIcon,
  MapPin,
  Calendar,
  Gauge,
  Clock,
  ChevronRight,
  Route as RouteLineIcon,
} from 'lucide-react';
import { useVehicleRoutes, type Route } from '../hooks/useVehicleRoutes';

const HQ_DEFAULT: [number, number] = [-2.170998, -79.922359];

const greenIcon = L.divIcon({
  className: 'route-marker',
  html: `<div style="width: 22px; height: 22px; border-radius: 50%; background: #16a34a; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    map.fitBounds(points, { padding: [40, 40] });
  }, [points, map]);
  return null;
}

function toLatLng(coords: any): [number, number][] {
  if (!Array.isArray(coords)) return [];
  if (coords.length === 0) return [];
  if (Array.isArray(coords[0])) {
    return coords
      .map((p: any) => (Array.isArray(p) && p.length >= 2 ? [Number(p[0]), Number(p[1])] : null))
      .filter((x): x is [number, number] => x != null);
  }
  if (typeof coords[0] === 'object' && coords[0] != null) {
    return coords
      .map((p: any) => (p?.lat != null && p?.lng != null ? [Number(p.lat), Number(p.lng)] : null))
      .filter((x): x is [number, number] => x != null);
  }
  return [];
}

function fmtDuration(min?: number | null) {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

type Props = { assetId: string; companyId: string };

export default function TabRutas({ assetId, companyId }: Props) {
  const { routes, loading } = useVehicleRoutes(assetId, companyId);
  const [selected, setSelected] = useState<string | null>(null);

  const selectedRoute: Route | null = routes.find((r) => r.id === selected) ?? null;
  const selectedPoints = toLatLng(selectedRoute?.coordinates);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03]">
      {/* ── Mapa ── */}
      <div className="h-[420px]">
        <MapContainer
          center={HQ_DEFAULT}
          zoom={12}
          style={{ width: '100%', height: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; OpenStreetMap &copy; CARTO'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />

          {routes.map((r) => {
            const pts = toLatLng(r.coordinates);
            if (pts.length < 2) return null;
            const isSel = r.id === selected;
            return (
              <Polyline
                key={r.id}
                positions={pts}
                pathOptions={{
                  color: isSel ? '#16a34a' : '#94a3b8',
                  weight: isSel ? 5 : 3,
                  opacity: isSel ? 1 : 0.55,
                }}
                eventHandlers={{ click: () => setSelected(r.id) }}
              />
            );
          })}

          {selectedPoints.length > 0 && (
            <>
              <Marker position={selectedPoints[0]} icon={greenIcon} />
              <Marker position={selectedPoints[selectedPoints.length - 1]} icon={greenIcon} />
              <FitBounds points={selectedPoints} />
            </>
          )}
        </MapContainer>
      </div>

      {/* ── Rutas registradas — con overflow visible ── */}
      <div className="border-t border-gray-200 dark:border-white/[0.06]">
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <RouteIcon size={13} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-800 dark:text-white">
                Rutas registradas
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                {loading
                  ? "Cargando…"
                  : routes.length === 0
                  ? "Sin rutas"
                  : `${routes.length} ${routes.length === 1 ? "ruta" : "rutas"} · scroll para ver más`}
              </p>
            </div>
          </div>
        </div>

        <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
          {loading && routes.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-gray-400 dark:text-gray-500">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
              Cargando rutas…
            </div>
          ) : routes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-white/[0.05] text-gray-400">
                <MapPin size={16} />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                No hay rutas registradas
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-white/[0.04]">
              {routes.map((r) => {
                const isSel = r.id === selected;
                return (
                  <li
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                    className={`group cursor-pointer transition-colors ${
                      isSel
                        ? "bg-emerald-50 dark:bg-emerald-500/[0.08]"
                        : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        isSel
                          ? "bg-emerald-500 text-white"
                          : "bg-gray-100 dark:bg-white/[0.05] text-gray-500 dark:text-gray-400"
                      }`}>
                        <RouteLineIcon size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">
                          {r.origin ?? "—"} <span className="text-gray-300 dark:text-gray-600 mx-1">→</span> {r.destination ?? "—"}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <Calendar size={10} />
                            {r.date || "—"}
                          </span>
                          {r.distanceKm != null && (
                            <span className="inline-flex items-center gap-1">
                              <Gauge size={10} />
                              {r.distanceKm} km
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Clock size={10} />
                            {fmtDuration(r.durationMin)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight
                        size={14}
                        className={`shrink-0 transition-transform ${
                          isSel
                            ? "translate-x-0.5 text-emerald-500"
                            : "text-gray-300 dark:text-gray-600 group-hover:translate-x-0.5"
                        }`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
