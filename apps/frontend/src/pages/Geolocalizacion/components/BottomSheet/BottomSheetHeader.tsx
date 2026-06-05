import { X, MapPin, User, Car as CarIcon } from 'lucide-react';
import type { Car } from '../../types/car';
import { STATUS_LABELS } from '../../constants/carStatus';
import { STATUS_TW } from '../../utils/statusColors';

interface Props {
  car: Car;
  onClose: () => void;
}

export const BottomSheetHeader = ({ car, onClose }: Props) => {
  const c = STATUS_TW[car.state];

  return (
    <div className="flex items-start justify-between gap-4 px-6 pb-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100">
          <CarIcon className="h-6 w-6 text-slate-600" />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-bold text-slate-900">
              {car.brand} {car.model}
            </h2>
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
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span className="font-mono">{car.plate}</span>
            {car.address && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {car.address}
              </span>
            )}
          </div>

          {car.driverName && (
            <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
              <User className="h-3 w-3" />
              {car.driverName}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onClose}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        aria-label="Cerrar panel"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};