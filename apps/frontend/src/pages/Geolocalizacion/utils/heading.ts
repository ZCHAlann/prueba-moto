import type { Route } from '../types/route';

/**
 * Bearing (rumbo) en grados entre dos puntos geográficos.
 * 0°  = norte (arriba en el mapa)
 * 90° = este (derecha)
 * 180° = sur (abajo)
 * 270° = oeste (izquierda)
 */
export const computeBearing = (
  from: { lat: number; lng: number },
  to:   { lat: number; lng: number },
): number => {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from.lng);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
};

/**
 * Bearing de la ruta actual = dirección del último segmento
 * (movimiento más reciente). Devuelve null si la ruta no tiene
 * al menos 2 puntos.
 */
export const bearingFromRoute = (route: Route | null | undefined): number | null => {
  if (!route || route.points.length < 2) return null;
  const last  = route.points[route.points.length - 1];
  const prev  = route.points[route.points.length - 2];
  return computeBearing(prev, last);
};

/**
 * Heading "por defecto" de la foto subida por el usuario.
 * La foto del activo está en vista lateral con la cabeza del
 * carro apuntando a la IZQUIERDA → bearing 270° (oeste).
 */
export const PHOTO_DEFAULT_HEADING = 270;

/**
 * Rota una foto cuyo head está a `PHOTO_DEFAULT_HEADING` para
 * que apunte al `bearing` deseado. Devuelve un string CSS
 * listo para `transform: rotate(...)`.
 */
export const rotationForBearing = (bearing: number | null): number => {
  if (bearing === null) return 0;
  return bearing - PHOTO_DEFAULT_HEADING;
};
