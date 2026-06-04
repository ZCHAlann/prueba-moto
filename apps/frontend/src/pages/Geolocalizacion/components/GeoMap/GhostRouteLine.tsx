import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { RouteHistoryItem } from '../../types/geo.types';

interface GhostRouteLineProps {
  route: RouteHistoryItem;
}

export const GhostRouteLine: React.FC<GhostRouteLineProps> = ({ route }) => {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.clearLayers();
      layerRef.current.remove();
    }

    const group = L.layerGroup().addTo(map);
    layerRef.current = group;

    // Animate polyline drawing
    const points = route.polyline;
    let i = 0;
    const line = L.polyline([], {
      color: '#818cf8',
      weight: 3,
      opacity: 0.75,
      dashArray: '8, 6',
    }).addTo(group);

    const interval = setInterval(() => {
      if (i < points.length) {
        line.addLatLng(points[i]);
        i++;
      } else {
        clearInterval(interval);

        // Start marker
        const startIcon = L.divIcon({
          html: `<div style="
            width:14px;height:14px;border-radius:50%;
            background:#3fb950;border:2px solid #fff;
            box-shadow:0 0 8px rgba(63,185,80,0.7);
          "></div>`,
          className: '',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        // End marker
        const endIcon = L.divIcon({
          html: `<div style="
            width:14px;height:14px;border-radius:50%;
            background:#f85149;border:2px solid #fff;
            box-shadow:0 0 8px rgba(248,81,73,0.6);
          "></div>`,
          className: '',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        L.marker(points[0], { icon: startIcon }).addTo(group);
        L.marker(points[points.length - 1], { icon: endIcon }).addTo(group);

        // Fit bounds
        map.fitBounds(line.getBounds(), { padding: [80, 80], animate: true, duration: 0.8 });
      }
    }, 8);

    return () => {
      clearInterval(interval);
      if (layerRef.current) {
        layerRef.current.clearLayers();
        layerRef.current.remove();
        layerRef.current = null;
      }
    };
  }, [route, map]);

  return null;
};