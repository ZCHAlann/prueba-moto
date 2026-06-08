import { Power, Lock, Unlock, ShieldAlert } from 'lucide-react';
import { useCarStatus } from '../../hooks/useCarStatus';

interface RowProps {
  icon: React.ReactNode;
  label: string;
  status: string;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
  activeBg: string;
  activeIcon: string;
  inactiveBg: string;
  inactiveIcon: string;
}

const ControlRow = ({
  icon, label, status, isActive, onClick, disabled,
  activeBg, activeIcon, inactiveBg, inactiveIcon,
}: RowProps) => {
  const c = isActive ? { bg: activeBg, icon: activeIcon } : { bg: inactiveBg, icon: inactiveIcon };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition
        ${c.bg}
        ${disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:brightness-95 active:scale-[0.98]'}
      `}
    >
      <div className={`flex h-7 w-7 items-center justify-center rounded-md ${c.icon}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500">
          {label}
        </div>
        <div className="text-xs font-bold leading-tight text-slate-900 dark:text-white">
          {status}
        </div>
      </div>
    </button>
  );
};

export const CarControls = () => {
  const { isOn, isLocked, isBlocked, toggleEngine, toggleLock } = useCarStatus();

  return (
    <div className="space-y-1.5">
      {isBlocked && (
        <div className="flex items-start gap-1.5 rounded-md border border-rose-200 bg-rose-50 p-1.5 text-[9px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <ShieldAlert className="mt-0.5 h-2.5 w-2.5 shrink-0" />
          <div>
            <div className="font-bold">Bloqueado</div>
            <div className="text-rose-600/80 dark:text-rose-300/80">No se puede encender.</div>
          </div>
        </div>
      )}

      <ControlRow
        icon={<Power className="h-3.5 w-3.5" />}
        label="Motor"
        status={isOn ? 'Encendido' : 'Apagado'}
        isActive={isOn}
        onClick={toggleEngine}
        disabled={isBlocked}
        activeBg="border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10"
        activeIcon="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300"
        inactiveBg="border-slate-200 bg-white dark:border-white/[0.08] dark:bg-white/[0.03]"
        inactiveIcon="bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-gray-300"
      />

      <ControlRow
        icon={isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        label="Cerradura"
        status={isLocked ? 'Bloqueado' : 'Desbloqueado'}
        isActive={isLocked}
        onClick={toggleLock}
        activeBg="border-rose-200 bg-rose-50/60 dark:border-rose-500/30 dark:bg-rose-500/10"
        activeIcon="bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300"
        inactiveBg="border-blue-200 bg-blue-50/60 dark:border-blue-500/30 dark:bg-blue-500/10"
        inactiveIcon="bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300"
      />
    </div>
  );
};
