import { Car, Check } from 'lucide-react';
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
        ${isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'}
      `}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
        <Car className="h-5 w-5 text-slate-600" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-slate-900">
            {car.brand} {car.model}
          </span>
          <span className="text-xs text-slate-400">{car.year}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
          <span className="font-mono">{car.plate}</span>
          <span>·</span>
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

      {isSelected && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
    </button>
  );
};