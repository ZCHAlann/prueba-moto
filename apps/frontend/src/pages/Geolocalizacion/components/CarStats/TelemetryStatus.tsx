import { useEffect, useState } from 'react';
import { formatRelativeTime } from '../../utils/formatters';

interface Props {
  timestamp: string;
}

export const TelemetryStatus = ({ timestamp }: Props) => {
  // Re-render cada segundo para mantener el "hace X seg" actualizado
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mt-4 flex items-center justify-center gap-2 text-xs">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <span className="font-bold tracking-wider text-emerald-400">EN VIVO</span>
      <span className="text-slate-600 dark:text-slate-700">·</span>
      <span className="text-slate-400 dark:text-slate-500">
        Actualizado {formatRelativeTime(timestamp)}
      </span>
    </div>
  );
};
