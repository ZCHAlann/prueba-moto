import { Plus, Minus, Crosshair } from 'lucide-react';
import { useMap } from 'react-leaflet';

export const MapControls = () => {
  const map = useMap();

  const btn =
    'flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-lg ring-1 ring-slate-200 transition hover:bg-slate-50 active:scale-95';

  return (
    <div className="absolute right-4 top-1/2 z-[400] flex -translate-y-1/2 flex-col gap-2">
      <button onClick={() => map.zoomIn()} className={btn} aria-label="Zoom in">
        <Plus className="h-4 w-4 text-slate-700" />
      </button>
      <button onClick={() => map.zoomOut()} className={btn} aria-label="Zoom out">
        <Minus className="h-4 w-4 text-slate-700" />
      </button>
      <button
        onClick={() => map.locate({ setView: true, maxZoom: 16 })}
        className={btn}
        aria-label="Mi ubicación"
      >
        <Crosshair className="h-4 w-4 text-slate-700" />
      </button>
    </div>
  );
};