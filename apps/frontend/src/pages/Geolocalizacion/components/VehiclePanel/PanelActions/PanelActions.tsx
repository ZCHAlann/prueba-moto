import React from 'react';
import { useGeo } from '../../../GeoContext';
import { Vehicle } from '../../../types/geo.types';
import { ActionButton } from './ActionButton';

const STATUS_CLASSES: Record<string, { pill: string; dot: string; label: string }> = {
  active:  { pill: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20', dot: 'bg-emerald-500', label: 'Encendido' },
  idle:    { pill: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',           dot: 'bg-amber-400',   label: 'Idle'       },
  offline: { pill: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-white/[0.05] dark:text-gray-400 dark:border-white/[0.08]',              dot: 'bg-gray-400',    label: 'Apagado'    },
  blocked: { pill: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',                       dot: 'bg-red-500',     label: 'Bloqueado'  },
};

const EngineIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M9 5v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="9" cy="9" r="1.5" fill="currentColor"/>
  </svg>
);

const LockIcon = ({ locked }: { locked: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="4" y="8" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    {locked
      ? <path d="M6 8V6a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      : <path d="M6 8V6a3 3 0 016 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2"/>
    }
    <circle cx="9" cy="12" r="1" fill="currentColor"/>
  </svg>
);

const HornIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M3 6.5h2l4-3v11l-4-3H3v-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M13 6a4 4 0 010 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M15 4a7 7 0 010 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>
  </svg>
);

interface PanelActionsProps {
  vehicle: Vehicle;
  canControl: boolean;
}

export const PanelActions: React.FC<PanelActionsProps> = ({ vehicle, canControl }) => {
  const { sendCommand } = useGeo();
  const cls = STATUS_CLASSES[vehicle.status] ?? STATUS_CLASSES.offline;
  const isRunning = vehicle.status === 'active' || vehicle.status === 'idle';

  return (
    <div className="w-[220px] shrink-0 border-r border-gray-100 dark:border-white/[0.06] p-4 flex flex-col gap-0">
      {/* Header */}
      <div className="mb-4">
        <div className="font-mono font-bold text-lg text-gray-800 dark:text-white leading-none tracking-tight">
          {vehicle.plate}
        </div>
        <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
          {vehicle.model} · {vehicle.driverName ?? 'Sin conductor'}
        </div>
        <div className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${cls.pill}`}>
          <span
            className={`w-1.5 h-1.5 rounded-full inline-block ${cls.dot}`}
            style={{ animation: vehicle.status === 'active' ? 'geo-pulse 2s infinite' : 'none' }}
          />
          {cls.label}
        </div>
      </div>

      <div className="w-full h-px bg-gray-100 dark:bg-white/[0.06] mb-4" />

      {/* Buttons */}
      <div className="flex flex-col gap-2">
        <ActionButton
          icon={<EngineIcon />}
          label={isRunning ? 'Apagar motor' : 'Encender motor'}
          description={isRunning ? 'Detiene remotamente' : 'Enciende remotamente'}
          colorCls={isRunning ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}
          bgCls={isRunning ? 'bg-red-50 dark:bg-red-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10'}
          borderCls={isRunning ? 'border-red-200 dark:border-red-500/20' : 'border-emerald-200 dark:border-emerald-500/20'}
          requiresConfirm
          disabled={!canControl}
          onAction={() => sendCommand(vehicle.id, isRunning ? 'engine_off' : 'engine_on')}
        />
        <ActionButton
          icon={<LockIcon locked={vehicle.isLocked} />}
          label={vehicle.isLocked ? 'Desbloquear' : 'Bloquear vehículo'}
          description={vehicle.isLocked ? 'Quita el bloqueo' : 'Bloquea el arranque'}
          colorCls={vehicle.isLocked ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
          bgCls={vehicle.isLocked ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10'}
          borderCls={vehicle.isLocked ? 'border-emerald-200 dark:border-emerald-500/20' : 'border-red-200 dark:border-red-500/20'}
          requiresConfirm
          disabled={!canControl}
          onAction={() => sendCommand(vehicle.id, vehicle.isLocked ? 'unlock' : 'lock')}
        />
        <ActionButton
          icon={<HornIcon />}
          label="Bocina de alerta"
          description="Señal sonora en el vehículo"
          colorCls="text-amber-600 dark:text-amber-400"
          bgCls="bg-amber-50 dark:bg-amber-500/10"
          borderCls="border-amber-200 dark:border-amber-500/20"
          disabled={!canControl || vehicle.status === 'offline'}
          onAction={() => sendCommand(vehicle.id, 'horn')}
        />
      </div>
    </div>
  );
};