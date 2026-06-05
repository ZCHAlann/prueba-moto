import { Calendar, Clock, X, Eye, ArrowRight } from 'lucide-react';
import type { Route } from '../../types/route';
import { formatDistance, formatDuration } from '../../utils/formatters';

interface Props {
  route: Route;
  isSelected: boolean;
  onSelect: () => void;
  onClose: () => void;
}

export const RouteItem = ({ route, isSelected, onSelect, onClose }: Props) => {
  const d = new Date(route.startedAt);
  const dateStr = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  const timeStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      onClick={onSelect}
      className={`
        group relative cursor-pointer overflow-hidden rounded-xl border p-3 transition
        ${isSelected
          ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-200'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {dateStr}
            </span>
            <span className="text-slate-300">·</span>
            <span>{timeStr}</span>
            <span className="text-slate-300">·</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(route.durationSec)}
            </span>
            <span className="text-slate-300">·</span>
            <span className="font-semibold text-slate-700">
              {formatDistance(route.distanceMeters)}
            </span>
          </div>

          <div className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-900">
            <span className="truncate">{route.startAddress}</span>
            <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
            <span className="truncate">{route.endAddress}</span>
          </div>
        </div>

        {isSelected && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-600"
            aria-label="Cerrar ruta"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isSelected && (
        <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-blue-700">
          <Eye className="h-3 w-3" />
          Mostrando ruta en el mapa
        </div>
      )}
    </div>
  );
};