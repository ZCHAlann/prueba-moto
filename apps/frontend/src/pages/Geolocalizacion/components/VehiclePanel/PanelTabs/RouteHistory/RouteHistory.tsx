import React, { useState } from 'react';
import { RouteHistoryItem } from '../../../../types/geo.types';
import { useGeo } from '../../../../GeoContext';
import { MOCK_ROUTES } from '../../../../mockData';

const RouteHistoryItemCard: React.FC<{
  route: RouteHistoryItem;
  isSelected: boolean;
  onSelect: () => void;
  onClose: () => void;
}> = ({ route, isSelected, onSelect, onClose }) => {
  const [hovered, setHovered] = useState(false);

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('es-EC', { weekday: 'short', day: '2-digit', month: 'short' });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  const speedPct = Math.min((route.avgSpeedKmh / 120) * 100, 100);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`
        py-3 pl-3 pr-0 border-b border-gray-100 dark:border-white/[0.06] cursor-pointer
        border-l-2 transition-all duration-150
        ${isSelected
          ? 'border-l-sky-500 bg-sky-50/60 dark:bg-sky-500/5'
          : hovered
          ? 'border-l-sky-300 bg-gray-50 dark:bg-white/[0.02]'
          : 'border-l-transparent'
        }
      `}
    >
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="text-gray-400 shrink-0">
            <circle cx="2.5" cy="2.5" r="2" stroke="currentColor" strokeWidth="1.2"/>
            <circle cx="11.5" cy="11.5" r="2" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M2.5 4.5 Q7 7 11.5 9.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5" fill="none"/>
          </svg>
          <span className="font-mono text-[11px] font-medium text-gray-700 dark:text-gray-300">
            {fmtDate(route.startAt)} · {fmtTime(route.startAt)} → {fmtTime(route.endAt)}
          </span>
        </div>
        <span className="font-mono font-semibold text-sm text-sky-600 dark:text-sky-400 shrink-0 ml-2">
          {route.distanceKm} km
        </span>
      </div>

      <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-1 truncate">
        {route.originAddress} → {route.destinationAddress}
      </div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">
        {Math.floor(route.durationMinutes / 60)}h {route.durationMinutes % 60}min · {route.avgSpeedKmh} km/h prom
      </div>

      {/* Speed bar */}
      <div className="h-1 bg-gray-100 dark:bg-white/[0.08] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 rounded-full transition-all"
          style={{ width: `${speedPct}%` }}
        />
      </div>

      {isSelected && (
        <button
          onClick={e => { e.stopPropagation(); onClose(); }}
          className="mt-2 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          ✕ Cerrar ruta
        </button>
      )}
    </div>
  );
};

interface RouteHistoryProps {
  vehicleId: string;
}

export const RouteHistory: React.FC<RouteHistoryProps> = ({ vehicleId }) => {
  const { ghostRoute, setGhostRoute } = useGeo();
  const routes = MOCK_ROUTES.filter(r => r.vehicleId === vehicleId);
  const totalKm = routes.reduce((s, r) => s + r.distanceKm, 0).toFixed(1);

  return (
    <div className="flex-1 overflow-y-auto px-5 py-3 geo-scrollbar">
      <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">
        Últimas rutas ·{' '}
        <span className="text-sky-600 dark:text-sky-400 font-medium">Total: {totalKm} km esta semana</span>
      </div>

      {routes.length === 0 ? (
        <div className="text-center text-sm text-gray-400 dark:text-gray-500 mt-8">
          Sin rutas registradas
        </div>
      ) : (
        routes.map(route => (
          <RouteHistoryItemCard
            key={route.id}
            route={route}
            isSelected={ghostRoute?.id === route.id}
            onSelect={() => setGhostRoute(ghostRoute?.id === route.id ? null : route)}
            onClose={() => setGhostRoute(null)}
          />
        ))
      )}
    </div>
  );
};