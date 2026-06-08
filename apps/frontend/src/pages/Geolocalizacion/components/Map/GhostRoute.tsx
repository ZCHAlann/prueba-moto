import { useEffect, useState } from 'react';
import { Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useSelectionStore } from '../../store/selectionStore';
import { formatDateTime, formatDistance, formatDuration } from '../../utils/formatters';
import { STATUS_HEX } from '../../constants/carStatus';

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

/** Color del polyline y popup adaptado al tema activo. */
const useThemeColors = () => {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark')),
    );
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => obs.disconnect();
  }, []);

  return {
    isDark,
    lineColor: isDark ? '#a5b4fc' : '#6366f1',
    lineGlow:  isDark ? '#818cf8' : '#6366f1',
  };
};

export const GhostRoute = () => {
  const route = useSelectionStore((s) => s.selectedRoute);
  const { lineColor, lineGlow } = useThemeColors();

  if (!route || route.points.length < 2) return null;

  const positions = route.points.map((p) => [p.lat, p.lng] as [number, number]);
  const start = positions[0];
  const end = positions[positions.length - 1];

  return (
    <>
      <FitToRoute />

      {/* Glow (línea más ancha, opaca) */}
      <Polyline
        positions={positions}
        pathOptions={{
          color: lineGlow,
          weight: 9,
          opacity: 0.18,
          lineCap: 'round',
        }}
      />
      {/* Línea principal punteada */}
      <Polyline
        positions={positions}
        pathOptions={{
          color: lineColor,
          weight: 4,
          opacity: 0.85,
          dashArray: '10 6',
          lineCap: 'round',
        }}
      />

      <Marker position={start} icon={startIcon}>
        <Popup>
          <div className="min-w-[180px] text-sm">
            <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-400">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white"
                style={{ background: STATUS_HEX.active }}
              >
                A
              </span>
              Inicio
            </div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">
              {formatDateTime(route.startedAt)}
            </div>
            {route.startAddress && (
              <div className="mt-1 text-slate-700 dark:text-gray-200">{route.startAddress}</div>
            )}
          </div>
        </Popup>
      </Marker>

      <Marker position={end} icon={endIcon}>
        <Popup>
          <div className="min-w-[180px] text-sm">
            <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-400">
              <span
                className="flex h-5 w-5 items-center justify-center rounded text-[10px] text-white"
                style={{ background: STATUS_HEX.blocked }}
              >
                B
              </span>
              Fin
            </div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">
              {formatDateTime(route.endedAt)}
            </div>
            {route.endAddress && (
              <div className="mt-1 text-slate-700 dark:text-gray-200">{route.endAddress}</div>
            )}
            <div className="mt-1.5 text-xs text-slate-500 dark:text-gray-400">
              {formatDistance(route.distanceMeters)} · {formatDuration(route.durationSec)}
            </div>
          </div>
        </Popup>
      </Marker>
    </>
  );
};
