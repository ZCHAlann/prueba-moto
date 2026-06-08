import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { Car } from '../../types/car';
import { STATUS_HEX } from '../../constants/carStatus';
import { useSelectionStore } from '../../store/selectionStore';
import { useCarStore } from '../../store/carStore';
import { formatRelativeTime } from '../../utils/formatters';
import {
  bearingFromRoute,
  rotationForBearing,
} from '../../utils/heading';
import { silhouetteForColor } from '../../data/carSilhouettes';

const buildCarIcon = (
  car: Car,
  isSelected: boolean,
  rotationDeg: number,
) => {
  const color = STATUS_HEX[car.state];
  const photo =
    car.photoUrl && car.photoUrl.length > 0
      ? car.photoUrl
      : silhouetteForColor(car.color);

  // ── Wrapper ─────────────────────────────────────────────
  // 80 × 76 px:
  //   - 64 px de alto para la foto (con sombra)
  //   - 12 px para la placa debajo
  // el `iconAnchor` apunta al centro inferior (≈ punto GPS)
  const wrapperSize = { w: 80, h: 76 };
  const photoSize = { w: 64, h: 44 };

  const selectionRing = isSelected
    ? `box-shadow: 0 0 0 4px ${color}55, 0 6px 18px rgba(0,0,0,0.35);`
    : `box-shadow: 0 4px 12px rgba(0,0,0,0.25);`;

  // Rotación: la cabeza de la foto queda en la izquierda por
  // defecto; `rotationDeg` la orienta al bearing de la ruta.
  // El contenedor externo NO rota (mantiene la posición
  // estable); sólo la foto interior rota.
  const photoHtml = photo
    ? `<img
         src="${photo}"
         alt="${car.brand} ${car.model}"
         draggable="false"
         style="
           width: ${photoSize.w}px;
           height: ${photoSize.h}px;
           object-fit: contain;
           display: block;
           transform: rotate(${rotationDeg}deg);
           transition: transform 0.5s cubic-bezier(.34,1.56,.64,1);
           filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));
           pointer-events: none;
         "
       />`
    : `<div style="
         width: ${photoSize.w}px; height: ${photoSize.h}px;
         display: flex; align-items: center; justify-content: center;
         background: ${color}22; border-radius: 8px;
         color: ${color}; font-size: 22px; font-weight: 800;
         font-family: ui-sans-serif, system-ui, sans-serif;
       ">${car.plate.slice(0, 3)}</div>`;

  const html = `
    <div style="
      position: relative;
      width: ${wrapperSize.w}px;
      height: ${wrapperSize.h}px;
      pointer-events: auto;
    ">
      <!-- Foto del vehículo (rotable) -->
      <div style="
        position: absolute;
        top: 0; left: 50%;
        transform: translateX(-50%);
        width: ${photoSize.w}px;
        height: ${photoSize.h}px;
        background: #ffffff;
        border: 2.5px solid ${color};
        border-radius: 10px;
        padding: 2px;
        ${selectionRing}
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        box-sizing: border-box;
      ">
        ${photoHtml}
      </div>

      <!-- Placa (debajo, no rota) -->
      <div style="
        position: absolute;
        bottom: 8px; left: 50%;
        transform: translateX(-50%);
        background: ${color};
        color: white;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.6px;
        font-family: ui-sans-serif, system-ui, sans-serif;
        white-space: nowrap;
        padding: 2.5px 7px;
        border-radius: 6px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      ">${car.plate}</div>

      <!-- Punta del GPS (ancla al coord exacto) -->
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
    iconSize: [wrapperSize.w, wrapperSize.h],
    iconAnchor: [wrapperSize.w / 2, wrapperSize.h],
  });
};

interface Props {
  car: Car;
}

export const CarMarker = ({ car }: Props) => {
  const selectedId = useSelectionStore((s) => s.selectedCar?.id);
  const selectCar  = useSelectionStore((s) => s.selectCar);
  const route      = useSelectionStore((s) => s.selectedRoute);
  const isSelected = selectedId === car.id;

  // Solo el carro cuya ruta está seleccionada rota con el
  // heading; los demás quedan con la cabeza a la izquierda
  // (comportamiento por defecto).
  const rotationDeg =
    isSelected && route && route.carId === car.id
      ? rotationForBearing(bearingFromRoute(route))
      : 0;

  // toco useCarStore para forzar re-render cuando cambien
  // los carros (no se usa el valor, sólo la suscripción)
  useCarStore((s) => s.cars);

  return (
    <Marker
      position={[car.position.lat, car.position.lng]}
      icon={buildCarIcon(car, isSelected, rotationDeg)}
      eventHandlers={{ click: () => selectCar(car) }}
      zIndexOffset={isSelected ? 1000 : 0}
    >
      <Popup>
        <div className="min-w-[200px] text-sm">
          <div className="flex items-center gap-2.5">
            {car.photoUrl && (
              <img
                src={car.photoUrl}
                alt=""
                className="h-10 w-14 rounded-md object-contain ring-1 ring-slate-200"
              />
            )}
            <div>
              <div className="font-bold text-slate-900">
                {car.brand} {car.model}
              </div>
              <div className="text-[11px] text-slate-500">
                {car.plate} · {car.year} · {car.color}
              </div>
            </div>
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
