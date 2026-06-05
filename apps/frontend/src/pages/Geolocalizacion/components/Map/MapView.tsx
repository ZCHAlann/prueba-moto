import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { MAP_CONFIG } from '../../constants/mapConfig';
import { useCarStore } from '../../store/carStore';
import { useSelectionStore } from '../../store/selectionStore';
import { CarMarker } from './CarMarker';
import { MapControls } from './MapControls';
import { GhostRoute } from './GhostRoute';   // ← import
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

export const MapView = () => {
  const cars = useCarStore((s) => s.cars);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={MAP_CONFIG.defaultCenter}
        zoom={MAP_CONFIG.defaultZoom}
        minZoom={MAP_CONFIG.minZoom}
        maxZoom={MAP_CONFIG.maxZoom}
        zoomControl={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution={MAP_CONFIG.tileAttribution}
          url={MAP_CONFIG.tileUrl}
        />

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