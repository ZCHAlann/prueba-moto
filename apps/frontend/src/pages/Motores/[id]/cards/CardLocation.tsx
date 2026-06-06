import { useState, useEffect, useRef } from 'react';
import Map, { Marker, Source, Layer, MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useVehicleLocation, Location } from '../hooks/useVehicleLocation';
import CockpitModal from '../common/CockpitModal';

const HQ_DEFAULT = { lat: -2.170998, lng: -79.922359 };
const TRAIL_MAX  = 60; // puntos máximos del rastro

const LIGHT_STYLE = {
  version: 8 as const,
  sources: {
    carto: {
      type: 'raster' as const,
      tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    },
  },
  layers: [{ id: 'carto', type: 'raster' as const, source: 'carto' }],
};

// ─── Marker SVG ──────────────────────────────────────────────────────────────

function VehicleMarker() {
  return (
    <div style={{
      width: 32, height: 32,
      borderRadius: '50%',
      background: 'radial-gradient(circle at 40% 35%, #4ade80, #16a34a)',
      border: '3px solid #fff',
      boxShadow: '0 0 0 4px rgba(22,163,74,0.35), 0 4px 12px rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
        <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
      </svg>
    </div>
  );
}

// ─── Map view ────────────────────────────────────────────────────────────────

type MapViewProps = {
  location: Location;
  trail: [number, number][];
  fullscreen?: boolean;
};

function MapView({ location, trail, fullscreen }: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const lng = location?.lng ?? HQ_DEFAULT.lng;
  const lat = location?.lat ?? HQ_DEFAULT.lat;

  // Fly to new position smoothly
  useEffect(() => {
    const map = mapRef.current;
    if (!map || location?.lat == null) return;
    map.flyTo({ center: [lng, lat], duration: 1200, essential: true });
  }, [lat, lng, location]);

  const trailGeoJSON = {
    type: 'Feature' as const,
    geometry: {
      type: 'LineString' as const,
      coordinates: trail,
    },
    properties: {},
  };

  return (
    <Map
      ref={mapRef}
      initialViewState={{
        longitude: lng,
        latitude: lat,
        zoom: fullscreen ? 15 : 14,
        pitch: fullscreen ? 55 : 45,   // tilt — 0 = top-down, 60 = side view
        bearing: 0,
      }}
      style={{ width: '100%', height: '100%', borderRadius: fullscreen ? 0 : '10px' }}
      mapStyle={LIGHT_STYLE}
      scrollZoom={fullscreen}
      dragRotate
      touchZoomRotate
      attributionControl={false}
    >
      {/* Trail */}
      {trail.length > 1 && (
        <Source id="trail" type="geojson" data={trailGeoJSON}>
          {/* Glow base */}
          <Layer
            id="trail-glow"
            type="line"
            paint={{
              'line-color': '#4ade80',
              'line-width': 6,
              'line-opacity': 0.25,
              'line-blur': 4,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          {/* Main line */}
          <Layer
            id="trail-line"
            type="line"
            paint={{
              'line-color': '#16a34a',
              'line-width': 3,
              'line-opacity': 0.9,
              'line-gradient': [
                'interpolate', ['linear'],
                ['line-progress'],
                0, 'rgba(22,163,74,0)',
                1, '#4ade80',
              ],
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </Source>
      )}

      {/* Vehicle marker */}
      <Marker longitude={lng} latitude={lat} anchor="center">
        <VehicleMarker />
      </Marker>
    </Map>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function IconPin() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#ef4444" stroke="none">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
    </svg>
  );
}

function IconExpand() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="15 3 21 3 21 9"/>
      <polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/>
      <line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

type Props = {
  assetId: string;
  companyId: string;
  fallbackText?: string;
};

export default function CardLocation({ assetId, companyId, fallbackText }: Props) {
  const { location } = useVehicleLocation(assetId, companyId, 5000);
  const [expanded, setExpanded]   = useState(false);
  const [trail, setTrail]         = useState<[number, number][]>([]);

  // Acumular rastro
  useEffect(() => {
    if (location?.lat == null || location?.lng == null) return;
    setTrail((prev) => {
      const next: [number, number][] = [...prev, [location.lng!, location.lat!]];
      return next.length > TRAIL_MAX ? next.slice(-TRAIL_MAX) : next;
    });
  }, [location]);

  const hasGPS = location?.lat != null && location?.lng != null;

  return (
    <>
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        border: '1px solid #e7e3e3',
        padding: '14px 16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        height: '200px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <IconPin />
            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Mi Ubicación</h3>
          </div>
          <button
            onClick={() => setExpanded(true)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}
          >
            <IconExpand />
          </button>
        </div>

        <div style={{ flex: 1, borderRadius: '10px', overflow: 'hidden', minHeight: 0 }}>
          <MapView location={location} trail={trail} />
        </div>

        {!hasGPS && fallbackText && (
          <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>{fallbackText}</p>
        )}
      </div>

      <CockpitModal
        open={expanded}
        onClose={() => setExpanded(false)}
        title="Ubicación en tiempo real"
        maxWidth="95vw"
      >
        <div style={{ height: '75vh' }}>
          <MapView location={location} trail={trail} fullscreen />
        </div>
      </CockpitModal>
    </>
  );
}