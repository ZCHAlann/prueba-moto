import { useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { useCarStore } from '../../store/carStore';
import { useSelectionStore } from '../../store/selectionStore';
import { CarListItem } from './CarListItem';
import type { Car, CarState } from '../../types/car';

const FILTERS: Array<{ key: CarState | 'all'; label: string }> = [
  { key: 'all',     label: 'Todos' },
  { key: 'active',  label: 'Activos' },
  { key: 'off',     label: 'Apagados' },
  { key: 'blocked', label: 'Bloqueados' },
];

interface Props {
  onSelect: (car: Car) => void;
}

export const CarSelectorDropdown = ({ onSelect }: Props) => {
  const cars           = useCarStore((s) => s.cars);
  const filter         = useCarStore((s) => s.filter);
  const setFilter      = useCarStore((s) => s.setFilter);
  const search         = useCarStore((s) => s.search);
  const setSearch      = useCarStore((s) => s.setSearch);
  const selectedId     = useSelectionStore((s) => s.selectedCar?.id);
  const selectCar      = useSelectionStore((s) => s.selectCar);

  const counts = useMemo(
    () => ({
      all:     cars.length,
      active:  cars.filter((c) => c.state === 'active').length,
      off:     cars.filter((c) => c.state === 'off').length,
      blocked: cars.filter((c) => c.state === 'blocked').length,
    }),
    [cars],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cars.filter((car) => {
      const matchFilter = filter === 'all' || car.state === filter;
      if (!matchFilter) return false;
      if (!q) return true;
      return (
        car.plate.toLowerCase().includes(q) ||
        car.brand.toLowerCase().includes(q) ||
        car.model.toLowerCase().includes(q) ||
        (car.driverName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [cars, filter, search]);

  return (
    <div className="absolute left-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-[#0d1320] dark:ring-white/[0.08]">
      {/* Header */}
      <div className="border-b border-slate-100 p-4 dark:border-white/[0.06]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Seleccionar vehículo
          </h3>
          <span className="text-xs text-slate-500 dark:text-gray-400">
            {cars.length} en flota
          </span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar placa, marca, conductor…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-500 dark:focus:border-blue-500/60 dark:focus:bg-[#0d1320]"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-gray-500 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-slate-100 px-2 py-2 dark:border-white/[0.06]">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`
                flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition
                ${active
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-white/[0.05]'}
              `}
            >
              {f.label}
              <span className={`ml-1 text-[10px] ${active ? 'text-blue-500/70 dark:text-blue-300/70' : 'text-slate-400 dark:text-gray-500'}`}>
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-white/[0.05]">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-gray-400">
            No se encontraron vehículos
          </div>
        ) : (
          filtered.map((car) => (
            <CarListItem
              key={car.id}
              car={car}
              isSelected={selectedId === car.id}
              onSelect={() => {
                selectCar(car);
                onSelect(car);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
};
