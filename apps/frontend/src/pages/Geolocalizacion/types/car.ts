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
  /**
   * Foto del activo (tabla `assets.photoUrls[0]`).
   * Si no se provee, el marker usa un ícono de fallback.
   * La foto debe estar en vista lateral con la **cabeza del carro
   * apuntando hacia la IZQUIERDA** (heading 270° / oeste).
   */
  photoUrl?: string;
}