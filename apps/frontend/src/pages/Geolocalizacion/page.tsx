import React, { useEffect, useRef, useState } from 'react';
import { GeoProvider, useGeo } from './GeoContext';
import { GeoMap } from './components/GeoMap/GeoMap';
import { VehicleSelector } from './components/VehicleSelector/VehicleSelector';
import { VehicleFloatCard } from './components/VehicleFloatCard/VehicleFloatCard';
import { VehiclePanel } from './components/VehiclePanel/VehiclePanel';
import './geolocalizacion.css';

const GeolocalizacionInner: React.FC = () => {
  const { selectedVehicleId } = useGeo();
  const [rect, setRect] = useState({ top: 0, left: 0, width: '100vw', height: '100vh' });
  const mapKeyRef = useRef(0); // remount map when rect changes
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => {
    const compute = () => {
      const aside  = document.querySelector('aside');
      const header = document.querySelector('header');
      const sW = aside  ? aside.getBoundingClientRect().width  : 0;
      const hH = header ? header.getBoundingClientRect().height : 0;
      setRect({
        top:    hH,
        left:   sW,
        width:  `${window.innerWidth  - sW}px`,
        height: `${window.innerHeight - hH}px`,
      });
      // Remount map so Leaflet picks up new dimensions
      mapKeyRef.current += 1;
      setMapKey(mapKeyRef.current);
    };

    compute();

    const ro = new ResizeObserver(compute);
    const aside  = document.querySelector('aside');
    const header = document.querySelector('header');
    if (aside)  ro.observe(aside);
    if (header) ro.observe(header);
    window.addEventListener('resize', compute);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top:    rect.top,
        left:   rect.left,
        width:  rect.width,
        height: rect.height,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'Outfit, sans-serif',
        background: '#080b10',
      }}
    >
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <GeoMap key={mapKey} />
        <VehicleSelector />
        {selectedVehicleId && <VehicleFloatCard />}
      </div>
      <VehiclePanel canControl={true} />
    </div>
  );
};

const GeolocalizacionPage: React.FC = () => (
  <GeoProvider>
    <GeolocalizacionInner />
  </GeoProvider>
);

export default GeolocalizacionPage;