import { useState } from 'react';
import { X, Car as CarIcon } from 'lucide-react';
import { useSelectionStore } from '../../store/selectionStore';
import { CarControls } from './CarControls';
import { Tabs } from '../Tabs/Tabs';
import { RouteHistory } from '../RouteHistory';
import { CarStats } from '../CarStats';
import { STATUS_LABELS } from '../../constants/carStatus';
import { STATUS_TW } from '../../utils/statusColors';
import type { TabItem } from '../Tabs/Tabs';
import { useUiStore } from '../../store/uiStore';

const TABS: TabItem[] = [
  { id: 'stats',   label: 'Estadísticas' },
  { id: 'history', label: 'Historial' },
];

export const BottomSheet = () => {
  const selectedCar = useSelectionStore((s) => s.selectedCar);
  const clear       = useSelectionStore((s) => s.clear);
  const [activeTab, setActiveTab] = useState<string>('stats');
  const isCarSelectorOpen = useUiStore(
    (s) => s.isCarSelectorOpen
  );
  const isOpen =
    selectedCar !== null &&
    !isCarSelectorOpen;
  

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
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'}
                `}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Panel principal */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
          {selectedCar && (
            <>
              {/* Header compacto con info del carro + cerrar */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <CarIcon className="h-3.5 w-3.5 text-slate-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-bold text-slate-900">
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
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span className="font-mono">{selectedCar.plate}</span>
                      {selectedCar.driverName && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="truncate">{selectedCar.driverName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={clear}
                  className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Cerrar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Body: layout horizontal | controles | contenido (scrollable) */}
              <div className="grid max-h-[200px] grid-cols-[160px_1fr] divide-x divide-slate-100 overflow-hidden">
                {/* Izquierda: controles (stacked vertical) */}
                <div className="overflow-y-auto p-3">
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