import 'leaflet/dist/leaflet.css';
import { MapView } from './components/Map';
import { BottomSheet } from './components/BottomSheet';

export const GeolocationPage = () => {
  return (
    <div className="relative h-[calc(100vh-100px)] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <MapView />
      <BottomSheet />
    </div>
  );
};