import { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  label: string;            // "Motor", "Cerradura"
  status: string;           // "Encendido", "Bloqueado"
  isActive: boolean;
  onToggle: () => void;
  activeClassName: string;  // tailwind cuando isActive=true
  inactiveClassName: string;
  disabled?: boolean;
  pulse?: boolean;          // muestra el puntito animado cuando activo
}

export const ToggleButton = ({
  icon, label, status, isActive, onToggle,
  activeClassName, inactiveClassName, disabled, pulse = true,
}: Props) => (
  <button
    onClick={onToggle}
    disabled={disabled}
    className={`
      group relative overflow-hidden rounded-2xl p-4 text-left
      ring-1 transition-all duration-200
      active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50
      ${isActive ? activeClassName : inactiveClassName}
    `}
  >
    <div
      className={`
        flex h-10 w-10 items-center justify-center rounded-xl
        ${isActive ? 'bg-white/20' : 'bg-black/5'}
      `}
    >
      {icon}
    </div>

    <div className="mt-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
        {label}
      </div>
      <div className="text-base font-bold leading-tight">{status}</div>
    </div>

    {isActive && pulse && (
      <span className="absolute right-3 top-3 flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
      </span>
    )}
  </button>
);