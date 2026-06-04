import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { Vehicle } from '../../types/geo.types';

const STATUS_COLORS: Record<string, string> = {
  active:  '#3fb950',
  idle:    '#d29922',
  offline: '#484f58',
  blocked: '#f85149',
  selected:'#38bdf8',
};

const STATUS_GLOWS: Record<string, string> = {
  active:  'rgba(63,185,80,0.7)',
  idle:    'rgba(210,153,34,0.6)',
  offline: 'transparent',
  blocked: 'rgba(248,81,73,0.6)',
  selected:'rgba(56,189,248,0.7)',
};

function buildMarkerHTML(vehicle: Vehicle, isSelected: boolean): string {
  const colorKey = isSelected ? 'selected' : vehicle.status;
  const color    = STATUS_COLORS[colorKey];
  const glow     = STATUS_GLOWS[colorKey];
  const opacity  = vehicle.status === 'offline' ? 0.55 : 1;
  const rotate   = vehicle.status === 'active' ? vehicle.heading : 0;

  const lockIcon = vehicle.isLocked ? `
    <g transform="translate(20,4)">
      <rect x="0" y="3" width="10" height="8" rx="1.5" fill="${color}" opacity="0.9"/>
      <path d="M2.5 3V2a2.5 2.5 0 015 0v1" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.9"/>
    </g>` : '';

  const pulseRing = isSelected ? `
    <circle cx="16" cy="38" r="8" fill="none" stroke="${color}" stroke-width="1.5"
      style="animation: geo-ring 1.5s ease-out infinite; transform-origin: 16px 38px; opacity:0.8"/>` : '';

  const anchorPulse = (vehicle.status === 'active' || isSelected) ? `
    style="animation: geo-pulse 2s ease-in-out infinite; transform-origin: 16px 38px;"` : '';

  return `
    <div style="position:relative;width:32px;height:52px;opacity:${opacity}">
      ${pulseRing}
      <div ${anchorPulse}>
        <svg width="32" height="44" viewBox="0 0 32 44" xmlns="http://www.w3.org/2000/svg"
          style="filter:drop-shadow(0 0 8px ${glow});transform:rotate(${rotate}deg);transform-origin:16px 22px">
          <!-- Car body top-down -->
          <ellipse cx="16" cy="22" rx="10" ry="16" fill="${color}" opacity="0.15" stroke="${color}" stroke-width="0.5"/>
          <rect x="8" y="10" width="16" height="24" rx="5" fill="${color}"/>
          <!-- Windshields -->
          <rect x="9.5" y="12" width="13" height="7" rx="2.5" fill="rgba(0,0,0,0.4)"/>
          <rect x="9.5" y="21" width="13" height="7" rx="2" fill="rgba(0,0,0,0.3)"/>
          <!-- Side mirrors -->
          <rect x="4" y="15" width="4" height="3" rx="1" fill="${color}"/>
          <rect x="24" y="15" width="4" height="3" rx="1" fill="${color}"/>
          <!-- Wheels -->
          <rect x="5" y="11" width="5" height="4" rx="1.5" fill="rgba(0,0,0,0.5)"/>
          <rect x="22" y="11" width="5" height="4" rx="1.5" fill="rgba(0,0,0,0.5)"/>
          <rect x="5" y="29" width="5" height="4" rx="1.5" fill="rgba(0,0,0,0.5)"/>
          <rect x="22" y="29" width="5" height="4" rx="1.5" fill="rgba(0,0,0,0.5)"/>
          <!-- Anchor dot -->
          <circle cx="16" cy="40" r="3" fill="${color}" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>
          ${lockIcon}
        </svg>
      </div>
      <!-- Plate label -->
      <div style="
        position:absolute;top:-18px;left:50%;transform:translateX(-50%);
        background:rgba(0,0,0,0.82);
        border:1px solid ${color};
        border-radius:4px;padding:2px 6px;
        font-family:'DM Mono',monospace;font-size:9px;font-weight:500;
        color:${color};white-space:nowrap;
        backdrop-filter:blur(4px);
        box-shadow: 0 0 6px ${glow};
      ">${vehicle.plate}</div>
    </div>`;
}

interface VehicleMarkerProps {
  vehicle: Vehicle;
  isSelected: boolean;
  onClick: () => void;
}

export const VehicleMarker: React.FC<VehicleMarkerProps> = ({ vehicle, isSelected, onClick }) => {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!vehicle.position) return;

    const icon = L.divIcon({
      html: buildMarkerHTML(vehicle, isSelected),
      className: '',
      iconSize: [32, 70],
      iconAnchor: [16, 55],
    });

    if (!markerRef.current) {
      markerRef.current = L.marker([vehicle.position.lat, vehicle.position.lng], { icon, zIndexOffset: isSelected ? 1000 : 0 })
        .addTo(map)
        .on('click', onClick);
    } else {
      markerRef.current.setLatLng([vehicle.position.lat, vehicle.position.lng]);
      markerRef.current.setIcon(icon);
      markerRef.current.setZIndexOffset(isSelected ? 1000 : 0);
    }

    return () => {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    };
  }, [vehicle, isSelected, map, onClick]);

  return null;
};