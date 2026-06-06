import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useVehicleRoutes, Route } from '../hooks/useVehicleRoutes';

const HQ_DEFAULT: [number, number] = [-2.170998, -79.922359];

const greenIcon = L.divIcon({
  className: 'route-marker',
  html: `<div style="width: 22px; height: 22px; border-radius: 50%; background: #16a34a; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    map.fitBounds(points, { padding: [40, 40] });
  }, [points, map]);
  return null;
}

function toLatLng(coords: any): [number, number][] {
  if (!Array.isArray(coords)) return [];
  if (coords.length === 0) return [];
  if (Array.isArray(coords[0])) {
    return coords
      .map((p: any) => (Array.isArray(p) && p.length >= 2 ? [Number(p[0]), Number(p[1])] : null))
      .filter((x): x is [number, number] => x != null);
  }
  if (typeof coords[0] === 'object' && coords[0] != null) {
    return coords
      .map((p: any) => (p?.lat != null && p?.lng != null ? [Number(p.lat), Number(p.lng)] : null))
      .filter((x): x is [number, number] => x != null);
  }
  return [];
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontWeight: 500,
  fontSize: 11, textTransform: 'uppercase', color: '#94a3b8',
};
const td: React.CSSProperties = { padding: '10px 14px', color: '#0f172a', fontSize: 13 };

type Props = { assetId: string; companyId: string };

export default function TabRutas({ assetId, companyId }: Props) {
  const { routes, loading } = useVehicleRoutes(assetId, companyId);
  const [selected, setSelected] = useState<string | null>(null);

  const selectedRoute: Route | null = routes.find((r) => r.id === selected) ?? null;
  const selectedPoints = toLatLng(selectedRoute?.coordinates);

  return (
    <div style={{ borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>

      {/* ── Mapa ── */}
      <div style={{ height: '420px' }}>
        <MapContainer
          center={HQ_DEFAULT}
          zoom={12}
          style={{ width: '100%', height: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; OpenStreetMap &copy; CARTO'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />

          {routes.map((r) => {
            const pts = toLatLng(r.coordinates);
            if (pts.length < 2) return null;
            const isSel = r.id === selected;
            return (
              <Polyline
                key={r.id}
                positions={pts}
                pathOptions={{
                  color: isSel ? '#16a34a' : '#cbd5e1',
                  weight: isSel ? 5 : 3,
                  opacity: isSel ? 1 : 0.5,
                }}
                eventHandlers={{ click: () => setSelected(r.id) }}
              />
            );
          })}

          {selectedPoints.length > 0 && (
            <>
              <Marker position={selectedPoints[0]} icon={greenIcon} />
              <Marker position={selectedPoints[selectedPoints.length - 1]} icon={greenIcon} />
              <FitBounds points={selectedPoints} />
            </>
          )}
        </MapContainer>
      </div>

      {/* ── Tabla — flujo normal debajo del mapa ── */}
      <div style={{
        background: '#fff',
        borderTop: '1px solid #e2e8f0',
        maxHeight: '220px',
        overflowY: 'auto',
      }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            Cargando rutas…
          </div>
        ) : routes.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            No hay rutas registradas
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
              <tr>
                <th style={th}>Fecha</th>
                <th style={th}>Origen → Destino</th>
                <th style={th}>Km</th>
                <th style={th}>Duración</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  style={{
                    cursor: 'pointer',
                    background: r.id === selected ? '#f0fdf4' : 'transparent',
                    borderTop: '1px solid #f1f5f9',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { if (r.id !== selected) e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = r.id === selected ? '#f0fdf4' : 'transparent'; }}
                >
                  <td style={td}>{r.date}</td>
                  <td style={td}>{r.origin ?? '—'} → {r.destination ?? '—'}</td>
                  <td style={td}>{r.distanceKm != null ? `${r.distanceKm} km` : '—'}</td>
                  <td style={td}>{r.durationMin != null ? `${Math.floor(r.durationMin / 60)}h ${r.durationMin % 60}m` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}