import React from 'react';
import { useGeo } from '../../GeoContext';

const STATUS_COLOR: Record<string, string> = {
  active:  'var(--geo-active)',
  idle:    'var(--geo-idle)',
  offline: 'var(--geo-offline)',
  blocked: 'var(--geo-blocked)',
};

const STATUS_LABEL: Record<string, string> = {
  active:  'Encendido · En movimiento',
  idle:    'Encendido · Detenido',
  offline: 'Apagado',
  blocked: 'Bloqueado',
};

const STATUS_CLASSES: Record<string, { pill: string; dot: string; bar: string }> = {
  active:  { pill: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20', dot: 'bg-emerald-500', bar: 'border-t-emerald-500' },
  idle:    { pill: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',           dot: 'bg-amber-400',   bar: 'border-t-amber-400'   },
  offline: { pill: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-white/[0.05] dark:text-gray-400 dark:border-white/[0.08]',              dot: 'bg-gray-400',    bar: 'border-t-gray-400'    },
  blocked: { pill: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',                       dot: 'bg-red-500',     bar: 'border-t-red-500'     },
};

export const VehicleFloatCard: React.FC = () => {
  const { vehicles, selectedVehicleId } = useGeo();
  const vehicle = vehicles.find(v => v.id === selectedVehicleId);
  if (!vehicle) return null;

  const cls = STATUS_CLASSES[vehicle.status] ?? STATUS_CLASSES.offline;
  const color = STATUS_COLOR[vehicle.status];

  const relativeTime = (d: Date) => {
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return `hace ${diff}s`;
    if (diff < 3600) return `hace ${Math.floor(diff / 60)}min`;
    return `hace ${Math.floor(diff / 3600)}h`;
  };

  return (
    <div
      className={`absolute top-[72px] left-4 z-[999] w-64 rounded-xl border border-t-2 bg-white shadow-lg dark:bg-[#0d1117] dark:border-white/[0.08] overflow-hidden ${cls.bar}`}
      style={{ animation: 'geo-slide-left 300ms cubic-bezier(0.16,1,0.3,1)' }}
    >
      {/* Status bar */}
      <div className={`flex items-center gap-2 px-4 py-1.5 border-b border-gray-100 dark:border-white/[0.06] ${cls.pill.includes('emerald') ? 'bg-emerald-50/60 dark:bg-emerald-500/5' : cls.pill.includes('amber') ? 'bg-amber-50/60 dark:bg-amber-500/5' : cls.pill.includes('red') ? 'bg-red-50/60 dark:bg-red-500/5' : 'bg-gray-50 dark:bg-white/[0.02]'}`}>
        <span
          className={`inline-block w-2 h-2 rounded-full shrink-0 ${cls.dot}`}
          style={{ animation: vehicle.status === 'active' ? 'geo-pulse 2s infinite' : 'none' }}
        />
        <span className={`font-semibold text-[10px] uppercase tracking-widest ${cls.pill.split(' ').filter(c => c.startsWith('text-') || c.startsWith('dark:text-')).join(' ')}`}>
          {STATUS_LABEL[vehicle.status]}
        </span>
      </div>

      {/* Main info */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="font-mono font-bold text-xl text-gray-800 dark:text-white leading-none tracking-tight">
              {vehicle.plate}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {vehicle.model}
            </div>
          </div>
          {/* Mini car icon */}
          <svg width="36" height="36" viewBox="0 0 32 32" fill="none" opacity="0.7">
            <rect x="8" y="6" width="16" height="20" rx="4" fill={color} />
            <rect x="9.5" y="8" width="13" height="6" rx="2" fill="rgba(0,0,0,0.3)" />
            <rect x="9.5" y="16" width="13" height="5" rx="1.5" fill="rgba(0,0,0,0.2)" />
            <rect x="5" y="10" width="3" height="3" rx="1" fill={color} opacity="0.6" />
            <rect x="24" y="10" width="3" height="3" rx="1" fill={color} opacity="0.6" />
            <rect x="5.5" y="8" width="4" height="3.5" rx="1.2" fill="rgba(0,0,0,0.35)" />
            <rect x="22.5" y="8" width="4" height="3.5" rx="1.2" fill="rgba(0,0,0,0.35)" />
            <rect x="5.5" y="22" width="4" height="3.5" rx="1.2" fill="rgba(0,0,0,0.35)" />
            <rect x="22.5" y="22" width="4" height="3.5" rx="1.2" fill="rgba(0,0,0,0.35)" />
          </svg>
        </div>

        {/* Driver */}
        {vehicle.driverName && (
          <div className="border-t border-gray-100 dark:border-white/[0.06] pt-3 pb-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-gray-400 shrink-0">
                <circle cx="6" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M1 11c0-2.761 2.239-4 5-4s5 1.239 5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <span className="text-xs text-gray-600 dark:text-gray-300">{vehicle.driverName}</span>
            </div>
            {vehicle.driverPhone && (
              <div className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-gray-400 shrink-0">
                  <path d="M2 2h2.5l1 2.5-1.5 1A7.002 7.002 0 005.5 8l1-1.5L9 7.5V10A1 1 0 018 11C4.134 11 1 7.866 1 4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                </svg>
                <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{vehicle.driverPhone}</span>
              </div>
            )}
          </div>
        )}

        {/* Location */}
        <div className="border-t border-gray-100 dark:border-white/[0.06] pt-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-gray-400 shrink-0">
              <path d="M5 0C3.07 0 1.5 1.57 1.5 3.5c0 2.625 3.5 6.5 3.5 6.5S8.5 6.125 8.5 3.5C8.5 1.57 6.93 0 5 0zm0 4.75a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z"/>
            </svg>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              Guayaquil · {relativeTime(vehicle.lastSeen)}
            </span>
          </div>
          <div className="flex gap-3">
            <span className="text-[10px] text-gray-400">📡 Señal: Excelente</span>
            <span className="text-[10px] text-gray-400">🛰 8 satélites</span>
          </div>
        </div>
      </div>
    </div>
  );
};