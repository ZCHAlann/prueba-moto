import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { MAP_CONFIG, tileUrlForTheme } from '../../constants/mapConfig';
import { useCarStore } from '../../store/carStore';
import { useSelectionStore } from '../../store/selectionStore';
import { CarMarker } from './CarMarker';
import { MapControls } from './MapControls';
import { GhostRoute } from './GhostRoute';
import { CarSelector } from '../CarSelector';

const FlyToSelected = () => {
  const map = useMap();
  const selectedCar = useSelectionStore((s) => s.selectedCar);

  useEffect(() => {
    if (selectedCar) {
      map.flyTo([selectedCar.position.lat, selectedCar.position.lng], 14, {
        duration: 1.2,
      });
    }
  }, [selectedCar, map]);

  return null;
};

/** Re-renderiza el TileLayer cuando cambia el tema dark/light. */
const ThemeAwareTileLayer = () => {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark')),
    );
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => obs.disconnect();
  }, []);

  return (
    <TileLayer
      attribution={MAP_CONFIG.tileAttribution}
      url={tileUrlForTheme(isDark)}
      key={isDark ? 'dark' : 'light'}
    />
  );
};

export const MapView = () => {
  const cars = useCarStore((s) => s.cars);

  return (
    <div className="relative h-full w-full">
      <style>{`
        .car-marker { background: transparent; border: none; }
        .ghost-route-marker { background: transparent; border: none; }
        .leaflet-popup-content-wrapper {
          border-radius: 14px;
          box-shadow: 0 8px 28px rgba(0,0,0,0.25);
        }
        .leaflet-popup-tip { box-shadow: none; }
        .dark .leaflet-popup-content-wrapper,
        .dark .leaflet-popup-tip {
          background: #0d1320;
          color: #e5e7eb;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .leaflet-control-attribution {
          background: rgba(255,255,255,0.7) !important;
          color: #475569 !important;
        }
        .dark .leaflet-control-attribution {
          background: rgba(13,19,32,0.85) !important;
          color: #94a3b8 !important;
        }
        .dark .leaflet-control-attribution a { color: #a5b4fc !important; }
      `}</style>
      <MapContainer
        center={MAP_CONFIG.defaultCenter}
        zoom={MAP_CONFIG.defaultZoom}
        minZoom={MAP_CONFIG.minZoom}
        maxZoom={MAP_CONFIG.maxZoom}
        zoomControl={false}
        className="h-full w-full bg-slate-100 dark:bg-slate-950"
      >
        <ThemeAwareTileLayer />

        {cars.map((car) => (
          <CarMarker key={car.id} car={car} />
        ))}

        <FlyToSelected />
        <GhostRoute />

        <MapControls />
      </MapContainer>

      <div className="absolute left-4 top-4 z-[400]">
        <CarSelector />
      </div>
    </div>
  );
};
