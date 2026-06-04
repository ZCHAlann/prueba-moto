import React, { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useGeo } from '../../GeoContext';
import { VehicleMarker } from './VehicleMarker';
import { GhostRouteLine } from './GhostRouteLine';
import { RouteInfoBanner } from './RouteInfoBanner';

// Forces Leaflet to recalculate its size after mount inside fixed containers
const MapInvalidator: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(t);
  }, [map]);
  return null;
};

const FlyToSelected: React.FC = () => {
  const { vehicles, selectedVehicleId } = useGeo();
  const map = useMap();
  useEffect(() => {
    if (!selectedVehicleId) return;
    const v = vehicles.find(v => v.id === selectedVehicleId);
    if (v?.position) map.flyTo([v.position.lat, v.position.lng], 15, { duration: 1.2, animate: true });
  }, [selectedVehicleId, vehicles, map]);
  return null;
};

export const GeoMap: React.FC = () => {
  const { vehicles, selectedVehicleId, selectVehicle, ghostRoute } = useGeo();

  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
      <MapContainer
        center={[-2.1962, -79.8862]}
        zoom={13}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
        attributionControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <MapInvalidator />
        <FlyToSelected />

        {vehicles.map(v =>
          v.position ? (
            <VehicleMarker
              key={v.id}
              vehicle={v}
              isSelected={v.id === selectedVehicleId}
              onClick={() => selectVehicle(v.id)}
            />
          ) : null
        )}

        {ghostRoute && <GhostRouteLine route={ghostRoute} />}
      </MapContainer>

      {ghostRoute && <RouteInfoBanner route={ghostRoute} />}
    </div>
  );
};