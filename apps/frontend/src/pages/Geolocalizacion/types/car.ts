export type CarState = 'active' | 'off' | 'blocked';
export type EngineState = 'on' | 'off';
export type LockState = 'locked' | 'unlocked';

export interface Car {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  driverId?: string;
  driverName?: string;
  state: CarState;
  engine: EngineState;
  lock: LockState;
  position: { lat: number; lng: number };
  address?: string;
  lastUpdate: string; // ISO
}