import React from 'react';
import { RouteHistoryItem } from '../../types/geo.types';
import { useGeo } from '../../GeoContext';

interface RouteInfoBannerProps {
  route: RouteHistoryItem;
}

export const RouteInfoBanner: React.FC<RouteInfoBannerProps> = ({ route }) => {
  const { setGhostRoute } = useGeo();

  const fmt     = (d: Date) => d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (d: Date) => d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });

  return (
    <div
      className="
        absolute top-4 left-1/2 -translate-x-1/2 z-[1100]
        flex items-center gap-3 px-4 py-2
        bg-white/90 dark:bg-[#0d1117]/90
        backdrop-blur-md
        border border-sky-200 dark:border-sky-500/30
        rounded-xl shadow-md
        whitespace-nowrap
      "
      style={{ animation: 'geo-fade-in 300ms ease-out' }}
    >
      {/* Route icon */}
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
        <circle cx="3" cy="3" r="2" fill="#16a34a"/>
        <circle cx="13" cy="13" r="2" fill="#dc2626"/>
        <path d="M3 5 Q8 8 13 11" stroke="#818cf8" strokeWidth="1.5" strokeDasharray="2,2" fill="none"/>
      </svg>

      {/* Date + time */}
      <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
        {fmtDate(route.startAt)} · {fmt(route.startAt)}–{fmt(route.endAt)}
      </span>

      <span className="text-gray-200 dark:text-white/20">·</span>

      {/* Distance */}
      <span className="font-mono text-xs font-semibold text-sky-600 dark:text-sky-400">
        {route.distanceKm} km
      </span>

      {/* Duration + speed */}
      <span className="text-[11px] text-gray-500 dark:text-gray-400">
        {Math.floor(route.durationMinutes / 60)}h {route.durationMinutes % 60}min · {route.avgSpeedKmh} km/h prom
      </span>

      {/* Close */}
      <button
        onClick={() => setGhostRoute(null)}
        className="
          ml-1 px-2 py-0.5 rounded-lg text-[11px] font-medium
          bg-red-50 dark:bg-red-500/10
          text-red-600 dark:text-red-400
          border border-red-200 dark:border-red-500/20
          hover:bg-red-100 dark:hover:bg-red-500/20
          transition-colors
        "
      >
        ✕
      </button>
    </div>
  );
};