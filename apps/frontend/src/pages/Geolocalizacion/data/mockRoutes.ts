import type { Route, RoutePoint } from '../types/route';
import { calculateDistanceMeters } from '../utils/mapHelpers';

const LANDMARKS: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Hollywood',     lat: 34.1015, lng: -118.3387 },
  { name: 'Downtown LA',   lat: 34.0407, lng: -118.2468 },
  { name: 'Santa Monica',  lat: 34.0195, lng: -118.4912 },
  { name: 'Beverly Hills', lat: 34.0736, lng: -118.4004 },
  { name: 'Inglewood',     lat: 33.9533, lng: -118.4004 },
  { name: 'Pasadena',      lat: 34.1478, lng: -118.1445 },
  { name: 'Glendale',      lat: 34.1808, lng: -118.3090 },
  { name: 'Long Beach',    lat: 33.7701, lng: -118.1937 },
  { name: 'LAX',           lat: 33.9416, lng: -118.4085 },
  { name: 'Culver City',   lat: 34.0211, lng: -118.3965 },
];

const generateRoute = (
  carId: string,
  startIdx: number,
  endIdx: number,
  daysAgo: number,
  hour: number
): Route => {
  const start = LANDMARKS[startIdx];
  const end   = LANDMARKS[endIdx];

  const pointCount = 18 + Math.floor(Math.random() * 14);
  const durationMin = 20 + Math.floor(Math.random() * 60);
  const totalSec = durationMin * 60;

  const startTime = new Date();
  startTime.setDate(startTime.getDate() - daysAgo);
  startTime.setHours(hour, Math.floor(Math.random() * 60), 0, 0);

  const points: RoutePoint[] = [];
  for (let i = 0; i < pointCount; i++) {
    const t = i / (pointCount - 1);
    const lat = start.lat + (end.lat - start.lat) * t + (Math.random() - 0.5) * 0.008;
    const lng = start.lng + (end.lng - start.lng) * t + (Math.random() - 0.5) * 0.008;
    const ts = new Date(startTime.getTime() + t * totalSec * 1000).toISOString();
    const speed = 15 + Math.random() * 55;
    points.push({ lat, lng, ts, speed });
  }

  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    distance += calculateDistanceMeters(points[i - 1], points[i]);
  }

  return {
    id: `route-${carId}-${startTime.getTime()}`,
    carId,
    startedAt: startTime.toISOString(),
    endedAt: new Date(startTime.getTime() + totalSec * 1000).toISOString(),
    distanceMeters: distance,
    durationSec: totalSec,
    startAddress: start.name,
    endAddress: end.name,
    points,
  };
};

// Plantillas determinísticas: 5-7 rutas por carro, distribuidas en las últimas 2 semanas
const TEMPLATES: Record<string, Array<{ s: number; e: number; d: number; h: number }>> = {
  'car-001': [
    { s: 0, e: 5, d: 0, h: 14 }, { s: 3, e: 7, d: 1, h: 9 },
    { s: 1, e: 4, d: 3, h: 18 }, { s: 6, e: 2, d: 5, h: 8 },
    { s: 4, e: 8, d: 7, h: 16 }, { s: 0, e: 1, d: 10, h: 12 },
  ],
  'car-002': [
    { s: 1, e: 3, d: 0, h: 17 }, { s: 4, e: 1, d: 2, h: 10 },
    { s: 5, e: 6, d: 4, h: 15 }, { s: 3, e: 8, d: 6, h: 11 },
    { s: 2, e: 5, d: 9, h: 13 },
  ],
  'car-003': [
    { s: 2, e: 0, d: 1, h: 8 }, { s: 3, e: 4, d: 3, h: 19 },
    { s: 8, e: 2, d: 5, h: 14 }, { s: 0, e: 7, d: 8, h: 16 },
    { s: 4, e: 1, d: 12, h: 11 },
  ],
  'car-004': [
    { s: 3, e: 1, d: 2, h: 9 }, { s: 0, e: 6, d: 4, h: 17 },
    { s: 4, e: 7, d: 7, h: 13 }, { s: 1, e: 5, d: 11, h: 10 },
  ],
  'car-005': [
    { s: 4, e: 8, d: 0, h: 15 }, { s: 2, e: 6, d: 2, h: 12 },
    { s: 1, e: 3, d: 5, h: 18 }, { s: 5, e: 0, d: 8, h: 14 },
    { s: 7, e: 4, d: 13, h: 16 },
  ],
  'car-006': [
    { s: 5, e: 1, d: 0, h: 11 }, { s: 0, e: 4, d: 1, h: 19 },
    { s: 6, e: 2, d: 3, h: 14 }, { s: 3, e: 8, d: 6, h: 10 },
    { s: 1, e: 7, d: 9, h: 17 }, { s: 4, e: 5, d: 12, h: 13 },
  ],
  'car-007': [
    { s: 6, e: 0, d: 0, h: 16 }, { s: 1, e: 6, d: 2, h: 9 },
    { s: 4, e: 3, d: 4, h: 18 }, { s: 5, e: 8, d: 7, h: 12 },
    { s: 2, e: 5, d: 10, h: 15 },
  ],
  'car-008': [
    { s: 8, e: 1, d: 1, h: 14 }, { s: 2, e: 4, d: 4, h: 11 },
    { s: 3, e: 5, d: 7, h: 17 }, { s: 0, e: 8, d: 11, h: 10 },
  ],
};

export const mockRoutes: Route[] = Object.entries(TEMPLATES).flatMap(([carId, list]) =>
  list.map((t) => generateRoute(carId, t.s, t.e, t.d, t.h))
);