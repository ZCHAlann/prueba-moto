import { Check } from 'lucide-react';
import type { Car as CarType } from '../../types/car';
import { STATUS_LABELS } from '../../constants/carStatus';
import { STATUS_TW } from '../../utils/statusColors';

interface Props {
  car: CarType;
  isSelected: boolean;
  onSelect: () => void;
}

export const CarListItem = ({ car, isSelected, onSelect }: Props) => {
  const c = STATUS_TW[car.state];

  return (
    <button
      onClick={onSelect}
      className={`
        flex w-full items-center gap-3 px-4 py-3 text-left transition
        ${isSelected
          ? 'bg-blue-50/60 dark:bg-blue-500/[0.08]'
          : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'}
      `}
    >
      <div className="flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/[0.06]">
        {car.photoUrl ? (
          <img
            src={car.photoUrl}
            alt=""
            className="h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <span
            className="text-[10px] font-bold text-slate-500 dark:text-gray-400"
            style={{ color: c.text.startsWith('text-') ? undefined : c.text }}
          >
            {car.plate.slice(0, 3)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
            {car.brand} {car.model}
          </span>
          <span className="text-xs text-slate-400 dark:text-gray-500">{car.year}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-gray-400">
          <span className="font-mono">{car.plate}</span>
          <span className="text-slate-300 dark:text-gray-600">·</span>
          <span className="truncate">{car.driverName ?? 'Sin conductor'}</span>
        </div>
      </div>

      <span
        className={`
          inline-flex items-center gap-1.5 rounded-full px-2 py-0.5
          text-[10px] font-semibold uppercase tracking-wide
          ${c.bg} ${c.text}
        `}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
        {STATUS_LABELS[car.state]}
      </span>

      {isSelected && <Check className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />}
    </button>
  );
};
