import { Fuel, Gauge as GaugeIcon, Car as CarIcon } from 'lucide-react';
import { useCarTelemetry } from '../../hooks/useCarTelemetry';
import { Speedometer } from './Speedometer';
import { SmallGauge } from './SmallGauge';
import { TelemetryStatus } from './TelemetryStatus';

export const CarStats = () => {
  const t = useCarTelemetry();

  if (!t) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-slate-900 px-6 py-12 text-center text-slate-400">
        <CarIcon className="h-8 w-8 text-slate-600 dark:text-slate-700" />
        <div className="text-sm font-medium text-slate-200">Sin telemetría</div>
        <div className="text-xs text-slate-500 dark:text-slate-600">
          Selecciona un vehículo para ver los datos en vivo.
        </div>
      </div>
    );
  }

  const fuelRatio = t.fuel / t.fuelMax;
  const fuelColor =
    fuelRatio < 0.15 ? '#f43f5e' :
    fuelRatio < 0.30 ? '#f59e0b' :
                       '#10b981';

  const mileageMax = Math.ceil(t.mileage / 15000) * 15000;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-4 shadow-inner ring-1 ring-white/[0.04]">
      <div className="grid grid-cols-2 gap-3">
        <SmallGauge
          icon={<Fuel className="h-3 w-3" />}
          label="Combustible"
          value={t.fuel}
          max={t.fuelMax}
          unit="litros"
          formatValue={(v) => v.toFixed(1)}
          color={fuelColor}
        />
        <SmallGauge
          icon={<GaugeIcon className="h-3 w-3" />}
          label="Odómetro"
          value={t.mileage}
          max={mileageMax}
          unit="km"
          formatValue={(v) => Math.round(v).toLocaleString('es-ES')}
          color="#64748b"
        />
      </div>

      <div className="mt-3 flex justify-center">
        <Speedometer value={t.speed} max={180} unit="km/h" />
      </div>

      <TelemetryStatus timestamp={t.ts} />
    </div>
  );
};
