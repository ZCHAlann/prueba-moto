import { Car, ChevronDown } from 'lucide-react';
import type { Car as CarType } from '../../types/car';

interface Props {
  selectedCar: CarType | null;
  totalCount: number;
  open: boolean;
  onClick: () => void;
}

export const CarSelectorButton = ({ selectedCar, totalCount, open, onClick }: Props) => (
  <button
    onClick={onClick}
    className={`
      flex items-center gap-3 rounded-2xl bg-white px-3 py-2
      shadow-lg ring-1 transition
      ${open ? 'ring-blue-500' : 'ring-slate-200 hover:ring-slate-300'}
    `}
  >
    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
      <Car className="h-4 w-4 text-blue-600" />
    </div>

    <div className="text-left">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        Flota
      </div>
      <div className="text-sm font-semibold text-slate-900">
        {selectedCar
          ? `${selectedCar.brand} ${selectedCar.model}`
          : `${totalCount} vehículos`}
      </div>
    </div>

    <ChevronDown
      className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
    />
  </button>
);