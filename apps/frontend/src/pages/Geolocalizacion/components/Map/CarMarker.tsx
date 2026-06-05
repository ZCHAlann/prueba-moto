import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { Car } from '../../types/car';
import { STATUS_HEX } from '../../constants/carStatus';
import { useSelectionStore } from '../../store/selectionStore';
import { formatRelativeTime } from '../../utils/formatters';

const createCarIcon = (car: Car, isSelected: boolean) => {
  const color = STATUS_HEX[car.state];

  const html = `
    <div style="position: relative; width: 54px; height: 62px;">
      <!-- Badge con el carro + placa -->
      <div style="
        position: absolute;
        top: 0; left: 0;
        background: white;
        border: 2.5px solid ${color};
        border-radius: 10px;
        padding: 5px 7px 4px;
        box-shadow: ${
          isSelected
            ? `0 0 0 4px ${color}33, 0 4px 14px rgba(0,0,0,0.22)`
            : '0 3px 10px rgba(0,0,0,0.18)'
        };
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
        min-width: 52px;
        transition: box-shadow 0.2s ease;
      ">
        <!-- Carro vectorial (vista superior) -->
        <svg
          width="28"
          height="28"
          viewBox="0 0 32 32"
          xmlns="http://www.w3.org/2000/svg"
          style="display: block;"
        >
          <!-- Llantas (capa de atrás) -->
          <rect x="2"  y="9"  width="3" height="5" rx="1" fill="#1e293b" />
          <rect x="27" y="9"  width="3" height="5" rx="1" fill="#1e293b" />
          <rect x="2"  y="18" width="3" height="5" rx="1" fill="#1e293b" />
          <rect x="27" y="18" width="3" height="5" rx="1" fill="#1e293b" />

          <!-- Carrocería -->
          <rect
            x="5" y="5" width="22" height="22" rx="5"
            fill="white"
            stroke="${color}"
            stroke-width="2"
          />

          <!-- Parabrisas delantero -->
          <rect
            x="8" y="8" width="16" height="5" rx="1.2"
            fill="${color}" opacity="0.4"
          />

          <!-- Techo (línea central sutil) -->
          <rect
            x="9" y="15" width="14" height="2" rx="0.5"
            fill="${color}" opacity="0.18"
          />

          <!-- Parabrisas trasero -->
          <rect
            x="8" y="19" width="16" height="5" rx="1.2"
            fill="${color}" opacity="0.4"
          />

          <!-- Faros delanteros (puntitos) -->
          <circle cx="10" cy="6.5" r="0.8" fill="${color}" />
          <circle cx="22" cy="6.5" r="0.8" fill="${color}" />

          <!-- Luces traseras -->
          <circle cx="10" cy="25.5" r="0.8" fill="${color}" />
          <circle cx="22" cy="25.5" r="0.8" fill="${color}" />
        </svg>

        <!-- Placa -->
        <span style="
          font-size: 8.5px;
          font-weight: 700;
          color: #0f172a;
          letter-spacing: 0.4px;
          font-family: ui-sans-serif, system-ui, sans-serif;
          white-space: nowrap;
          margin-top: 1px;
        ">${car.plate}</span>
      </div>

      <!-- Triángulo apuntando a la posición exacta -->
      <div style="
        position: absolute;
        bottom: 0; left: 50%;
        transform: translateX(-50%);
        width: 0; height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 7px solid ${color};
      "></div>
    </div>
  `;

  return L.divIcon({
    className: 'car-marker',
    html,
    iconSize: [54, 62],
    iconAnchor: [27, 62], // la punta del triángulo cae en el lat/lng exacto
  });
};

interface Props {
  car: Car;
}

export const CarMarker = ({ car }: Props) => {
  const selectedId = useSelectionStore((s) => s.selectedCar?.id);
  const selectCar  = useSelectionStore((s) => s.selectCar);
  const isSelected = selectedId === car.id;

  return (
    <Marker
      position={[car.position.lat, car.position.lng]}
      icon={createCarIcon(car, isSelected)}
      eventHandlers={{ click: () => selectCar(car) }}
    >
      <Popup>
        <div className="min-w-[180px] text-sm">
          <div className="font-bold text-slate-900">
            {car.brand} {car.model}
          </div>
          <div className="text-xs text-slate-500">
            {car.plate} · {car.year}
          </div>
          {car.driverName && (
            <div className="mt-1.5 text-xs text-slate-700">👤 {car.driverName}</div>
          )}
          {car.address && (
            <div className="mt-0.5 text-xs text-slate-500">📍 {car.address}</div>
          )}
          <div className="mt-1.5 text-[10px] uppercase tracking-wide text-slate-400">
            Actualizado {formatRelativeTime(car.lastUpdate)}
          </div>
        </div>
      </Popup>
    </Marker>
  );
};