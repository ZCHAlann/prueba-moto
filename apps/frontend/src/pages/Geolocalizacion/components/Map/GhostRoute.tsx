import { useEffect } from 'react';
import { Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useSelectionStore } from '../../store/selectionStore';
import { formatDateTime, formatDistance, formatDuration } from '../../utils/formatters';

// Icono de inicio: círculo verde con "A"
const startIcon = L.divIcon({
  className: 'ghost-route-marker',
  html: `
    <div style="
      width: 28px; height: 28px;
      background: #10b981;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 700; font-size: 12px;
      font-family: ui-sans-serif, system-ui, sans-serif;
    ">A</div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// Icono de fin: cuadrado rojo con "B"
const endIcon = L.divIcon({
  className: 'ghost-route-marker',
  html: `
    <div style="
      width: 28px; height: 28px;
      background: #f43f5e;
      border: 3px solid white;
      border-radius: 6px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 700; font-size: 12px;
      font-family: ui-sans-serif, system-ui, sans-serif;
    ">B</div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// Acerca el mapa a la ruta cuando se selecciona
const FitToRoute = () => {
  const map = useMap();
  const routeId = useSelectionStore((s) => s.selectedRoute?.id);

  useEffect(() => {
    const route = useSelectionStore.getState().selectedRoute;
    if (route && route.points.length > 1) {
      const bounds = L.latLngBounds(route.points.map((p) => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, duration: 1 });
    }
  }, [routeId, map]);

  return null;
};

export const GhostRoute = () => {
  const route = useSelectionStore((s) => s.selectedRoute);

  if (!route || route.points.length < 2) return null;

  const positions = route.points.map((p) => [p.lat, p.lng] as [number, number]);
  const start = positions[0];
  const end = positions[positions.length - 1];

  return (
    <>
      <FitToRoute />

      <Polyline
        positions={positions}
        pathOptions={{
          color: '#6366f1',
          weight: 4,
          opacity: 0.6,
          dashArray: '10 6',
          lineCap: 'round',
        }}
      />

      <Marker position={start} icon={startIcon}>
        <Popup>
          <div className="min-w-[160px] text-sm">
            <div className="font-bold text-emerald-700">A · Inicio</div>
            <div className="text-xs text-slate-500">{formatDateTime(route.startedAt)}</div>
            {route.startAddress && <div className="mt-1 text-slate-700">{route.startAddress}</div>}
          </div>
        </Popup>
      </Marker>

      <Marker position={end} icon={endIcon}>
        <Popup>
          <div className="min-w-[160px] text-sm">
            <div className="font-bold text-rose-700">B · Fin</div>
            <div className="text-xs text-slate-500">{formatDateTime(route.endedAt)}</div>
            {route.endAddress && <div className="mt-1 text-slate-700">{route.endAddress}</div>}
            <div className="mt-1.5 text-xs text-slate-500">
              {formatDistance(route.distanceMeters)} · {formatDuration(route.durationSec)}
            </div>
          </div>
        </Popup>
      </Marker>
    </>
  );
};