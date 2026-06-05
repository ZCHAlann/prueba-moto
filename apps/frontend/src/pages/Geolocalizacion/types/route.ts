export interface RoutePoint {
  lat: number;
  lng: number;
  ts: string;
  speed: number;
}

export interface Route {
  id: string;
  carId: string;
  startedAt: string;
  endedAt: string;
  distanceMeters: number;
  durationSec: number;
  points: RoutePoint[];
  startAddress: string;
  endAddress: string;
}