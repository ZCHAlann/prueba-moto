import 'leaflet/dist/leaflet.css';
import { useMemo } from 'react';
import { MapPin, Navigation2, Radio } from 'lucide-react';
import { MapView } from './components/Map';
import { BottomSheet } from './components/BottomSheet';
import { useCarStore } from './store/carStore';

export const GeolocationPage = () => {
  const cars = useCarStore((s) => s.cars);

  const counts = useMemo(
    () => ({
      total: cars.length,
      active: cars.filter((c) => c.state === 'active').length,
      blocked: cars.filter((c) => c.state === 'blocked').length,
    }),
    [cars],
  );

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500">
            <Navigation2 className="h-3.5 w-3.5" />
            Monitoreo en tiempo real
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            Geolocalización
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
            Visualiza la posición, ruta y telemetría de toda la flota.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Stat
            label="Total"
            value={counts.total}
            color="slate"
            icon={<MapPin className="h-3.5 w-3.5" />}
          />
          <Stat
            label="En ruta"
            value={counts.active}
            color="emerald"
            icon={<Radio className="h-3.5 w-3.5" />}
            pulse
          />
          <Stat
            label="Bloqueados"
            value={counts.blocked}
            color="rose"
            icon={<Navigation2 className="h-3.5 w-3.5" />}
          />
        </div>
      </div>

      {/* ── Mapa ───────────────────────────────────────── */}
      <div className="relative h-[calc(100vh-220px)] min-h-[560px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm dark:border-white/[0.06] dark:bg-slate-950">
        <MapView />
        <BottomSheet />
      </div>
    </div>
  );
};

/* ── Stat pill (header) ───────────────────────────────── */
const COLOR_MAP: Record<string, string> = {
  slate:
    'border-slate-200 bg-white text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200',
  emerald:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
  rose:
    'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300',
};

interface StatProps {
  label: string;
  value: number;
  color: keyof typeof COLOR_MAP;
  icon: React.ReactNode;
  pulse?: boolean;
}

const Stat = ({ label, value, color, icon, pulse = false }: StatProps) => (
  <div
    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 shadow-sm ${COLOR_MAP[color]}`}
  >
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
        color === 'emerald'
          ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300'
          : color === 'rose'
          ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300'
          : 'bg-slate-100 text-slate-500 dark:bg-white/[0.05] dark:text-gray-400'
      }`}
    >
      {icon}
    </div>
    <div className="text-left">
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">
        {label}
      </div>
      <div className="flex items-center gap-1.5 text-base font-black leading-none">
        {pulse && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
        )}
        {value}
      </div>
    </div>
  </div>
);
