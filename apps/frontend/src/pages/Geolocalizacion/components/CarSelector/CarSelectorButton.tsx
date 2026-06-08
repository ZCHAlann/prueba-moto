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
      flex items-center gap-3 rounded-2xl px-3 py-2
      bg-white/95 dark:bg-[#0d1320]/95 backdrop-blur
      shadow-lg ring-1 transition
      ${open
        ? 'ring-blue-500 dark:ring-blue-500/70'
        : 'ring-slate-200 hover:ring-slate-300 dark:ring-white/[0.08] dark:hover:ring-white/[0.16]'}
    `}
  >
    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/15">
      <Car className="h-4 w-4 text-blue-600 dark:text-blue-400" />
    </div>

    <div className="text-left">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-gray-500">
        Flota
      </div>
      <div className="text-sm font-semibold text-slate-900 dark:text-white">
        {selectedCar
          ? `${selectedCar.brand} ${selectedCar.model}`
          : `${totalCount} vehículos`}
      </div>
    </div>

    <ChevronDown
      className={`h-4 w-4 text-slate-400 dark:text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
    />
  </button>
);
