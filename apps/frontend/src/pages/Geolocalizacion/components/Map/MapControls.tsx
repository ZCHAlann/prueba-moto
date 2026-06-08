import { Plus, Minus, Crosshair } from 'lucide-react';
import { useMap } from 'react-leaflet';

export const MapControls = () => {
  const map = useMap();

  const btn =
    'flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-lg ring-1 transition active:scale-95 ' +
    'ring-slate-200 hover:bg-slate-50 ' +
    'dark:bg-[#0d1320]/95 dark:ring-white/[0.08] dark:hover:bg-white/[0.06]';

  return (
    <div className="absolute right-4 top-1/2 z-[400] flex -translate-y-1/2 flex-col gap-2">
      <button onClick={() => map.zoomIn()} className={btn} aria-label="Zoom in">
        <Plus className="h-4 w-4 text-slate-700 dark:text-gray-300" />
      </button>
      <button onClick={() => map.zoomOut()} className={btn} aria-label="Zoom out">
        <Minus className="h-4 w-4 text-slate-700 dark:text-gray-300" />
      </button>
      <button
        onClick={() => map.locate({ setView: true, maxZoom: 16 })}
        className={btn}
        aria-label="Mi ubicación"
      >
        <Crosshair className="h-4 w-4 text-slate-700 dark:text-gray-300" />
      </button>
    </div>
  );
};
