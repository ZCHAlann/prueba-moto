import React from 'react';
import { Vehicle } from '../../../../types/geo.types';
import { SpeedometerGauge } from './SpeedometerGauge';

const StatCard: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-4">
    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3">
      {label}
    </p>
    {children}
  </div>
);

const FuelWidget: React.FC<{ fuel: number }> = ({ fuel }) => {
  const isLow      = fuel < 15;
  const isMedium   = fuel >= 15 && fuel < 40;
  const colorCls   = isLow ? 'text-red-600 dark:text-red-400' : isMedium ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
  const status     = isLow ? 'Crítico' : isMedium ? 'Bajo' : 'Normal';
  const kmLeft     = Math.round(fuel * 4.5);

  return (
    <StatCard label="Combustible">
      <div className="flex items-baseline gap-2 mb-2.5">
        <span className="font-mono font-bold text-xl text-gray-800 dark:text-white">{fuel}%</span>
        <span className={`text-xs font-semibold ${colorCls}`}>{status}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.08] overflow-hidden mb-1.5">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${fuel}%`,
            background: `linear-gradient(to right, #dc2626, #d97706, #16a34a)`,
            backgroundSize: `${100 / (fuel / 100)}% 100%`,
            backgroundPositionX: `${fuel}%`,
          }}
        />
      </div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500">
        Aprox. {kmLeft} km restantes
      </div>
    </StatCard>
  );
};

const OdometerWidget: React.FC<{ odometer: number }> = ({ odometer }) => (
  <StatCard label="Odómetro">
    <div className="font-mono font-bold text-xl text-gray-800 dark:text-white tabular-nums">
      {odometer.toLocaleString('es-EC')}
    </div>
    <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">km</div>
    <div className="flex items-center gap-1.5">
      <span className="text-emerald-500 text-xs">↑</span>
      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">+47.3 km hoy</span>
    </div>
  </StatCard>
);

const BatteryWidget: React.FC<{ voltage: number }> = ({ voltage }) => {
  const pct    = Math.max(0, Math.min(100, ((voltage - 11.5) / (13.8 - 11.5)) * 100));
  const isLow  = voltage < 11.8;
  const isMid  = voltage >= 11.8 && voltage < 12.2;
  const isChg  = voltage > 13.5;

  const segColor = isLow
    ? 'bg-red-400 dark:bg-red-500'
    : isMid
    ? 'bg-amber-400 dark:bg-amber-500'
    : isChg
    ? 'bg-sky-400 dark:bg-sky-500'
    : 'bg-emerald-400 dark:bg-emerald-500';

  const status = isLow ? 'Crítica' : isMid ? 'Baja' : isChg ? 'Cargando' : 'Normal';
  const statusCls = isLow
    ? 'text-red-600 dark:text-red-400'
    : isMid
    ? 'text-amber-600 dark:text-amber-400'
    : isChg
    ? 'text-sky-600 dark:text-sky-400'
    : 'text-emerald-600 dark:text-emerald-400';

  return (
    <StatCard label="Batería">
      <div className="flex items-baseline gap-2 mb-2.5">
        <span className="font-mono font-semibold text-lg text-gray-800 dark:text-white">{voltage}V</span>
        <span className={`text-xs font-semibold ${statusCls}`}>{status}</span>
      </div>
      <div className="flex items-center gap-1 mb-1.5">
        {[0, 20, 40, 60, 80].map(threshold => (
          <div
            key={threshold}
            className={`flex-1 h-2 rounded-sm transition-colors duration-300 ${pct > threshold ? segColor : 'bg-gray-100 dark:bg-white/[0.08]'}`}
          />
        ))}
        <div className="w-1 h-2 rounded-r-sm bg-gray-100 dark:bg-white/[0.08] ml-0.5" />
      </div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500">
        Última carga: hace 2h
      </div>
    </StatCard>
  );
};

interface VehicleStatsProps {
  vehicle: Vehicle;
}

export const VehicleStats: React.FC<VehicleStatsProps> = ({ vehicle }) => (
  <div className="flex-1 overflow-y-auto p-4 geo-scrollbar">
    <div className="grid grid-cols-2 gap-3">
      <StatCard label="Velocidad">
        <SpeedometerGauge speed={vehicle.speed} />
      </StatCard>
      <FuelWidget fuel={vehicle.fuel} />
      <OdometerWidget odometer={vehicle.odometer} />
      <BatteryWidget voltage={vehicle.batteryVoltage} />
    </div>
  </div>
);