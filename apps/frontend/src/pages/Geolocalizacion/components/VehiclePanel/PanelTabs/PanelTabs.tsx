import React, { useState } from 'react';
import { Vehicle } from '../../../types/geo.types';
import { RouteHistory } from './RouteHistory/RouteHistory';
import { VehicleStats } from './VehicleStats/VehicleStats';

type Tab = 'history' | 'stats';

interface PanelTabsProps {
  vehicle: Vehicle;
}

export const PanelTabs: React.FC<PanelTabsProps> = ({ vehicle }) => {
  const [active, setActive] = useState<Tab>('stats');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'stats',   label: 'Estadísticas'      },
    { key: 'history', label: 'Historial de rutas' },
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-gray-100 dark:border-white/[0.06] px-5 shrink-0">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            className={`
              relative py-3.5 px-4 text-sm font-medium transition-colors duration-150
              focus:outline-none
              ${active === key
                ? 'text-sky-600 dark:text-sky-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }
            `}
          >
            {label}
            {active === key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500 dark:bg-sky-400 rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {active === 'stats'   && <VehicleStats vehicle={vehicle} />}
        {active === 'history' && <RouteHistory vehicleId={vehicle.id} />}
      </div>
    </div>
  );
};