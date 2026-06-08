import { useState } from 'react';
import { X, Car as CarIcon } from 'lucide-react';
import { useSelectionStore } from '../../store/selectionStore';
import { CarControls } from './CarControls';
import { RouteHistory } from '../RouteHistory';
import { CarStats } from '../CarStats';
import { STATUS_LABELS } from '../../constants/carStatus';
import { STATUS_TW } from '../../utils/statusColors';
import { useUiStore } from '../../store/uiStore';

const TABS: Array<{ id: string; label: string }> = [
  { id: 'stats',   label: 'Estadísticas' },
  { id: 'history', label: 'Historial' },
];

export const BottomSheet = () => {
  const selectedCar = useSelectionStore((s) => s.selectedCar);
  const clear       = useSelectionStore((s) => s.clear);
  const [activeTab, setActiveTab] = useState<string>('stats');
  const isCarSelectorOpen = useUiStore((s) => s.isCarSelectorOpen);
  const isOpen = selectedCar !== null && !isCarSelectorOpen;

  return (
    <div
      className={`
        pointer-events-none absolute bottom-0 inset-x-0 z-[600]
        flex justify-center p-4
        transition-transform duration-300 ease-out
        ${isOpen ? 'translate-y-0' : 'translate-y-[120%]'}
      `}
    >
      <div className="pointer-events-auto w-full max-w-5xl">
        {/* Tabs (pill style, encima del panel) */}
        <div className="mb-1 ml-1 flex gap-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  rounded-md px-3 py-1 text-xs font-bold transition
                  ${isActive
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 ' +
                      'dark:bg-[#0d1320] dark:text-white dark:ring-white/[0.08]'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 ' +
                      'dark:bg-white/[0.05] dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-200'}
                `}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Panel principal */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 dark:bg-[#0d1320] dark:ring-white/[0.08]">
          {selectedCar && (
            <>
              {/* Header con info del carro + cerrar */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-2 dark:border-white/[0.06]">
                <div className="flex min-w-0 items-center gap-2.5">
                  {selectedCar.photoUrl ? (
                    <div className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/[0.06]">
                      <img
                        src={selectedCar.photoUrl}
                        alt=""
                        className="h-full w-full object-contain"
                        draggable={false}
                      />
                    </div>
                  ) : (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/[0.05]">
                      <CarIcon className="h-3.5 w-3.5 text-slate-600 dark:text-gray-300" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
                        {selectedCar.brand} {selectedCar.model}
                      </span>
                      <span
                        className={`
                          inline-flex items-center gap-1 rounded-full px-1.5 py-0.5
                          text-[9px] font-bold uppercase tracking-wide
                          ${STATUS_TW[selectedCar.state].bg} ${STATUS_TW[selectedCar.state].text}
                        `}
                      >
                        <span className={`h-1 w-1 rounded-full ${STATUS_TW[selectedCar.state].dot}`} />
                        {STATUS_LABELS[selectedCar.state]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-gray-400">
                      <span className="font-mono">{selectedCar.plate}</span>
                      {selectedCar.driverName && (
                        <>
                          <span className="text-slate-300 dark:text-gray-600">·</span>
                          <span className="truncate">{selectedCar.driverName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={clear}
                  className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-gray-500 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
                  aria-label="Cerrar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Body: layout horizontal | controles | contenido (scrollable) */}
              <div className="grid max-h-[260px] grid-cols-[180px_1fr] divide-x divide-slate-100 overflow-hidden dark:divide-white/[0.06]">
                {/* Izquierda: controles (stacked vertical) */}
                <div className="overflow-y-auto bg-slate-50/50 p-3 dark:bg-white/[0.02]">
                  <CarControls />
                </div>

                {/* Derecha: contenido del tab activo */}
                <div className="overflow-y-auto p-3">
                  {activeTab === 'history' && <RouteHistory />}
                  {activeTab === 'stats'   && <CarStats />}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
