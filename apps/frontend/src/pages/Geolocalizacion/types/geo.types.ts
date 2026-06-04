export type VehicleStatus = 'active' | 'idle' | 'offline' | 'blocked';

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  driverName: string | null;
  driverPhone: string | null;
  status: VehicleStatus;
  position: { lat: number; lng: number } | null;
  heading: number;
  lastSeen: Date;
  speed: number;
  fuel: number;
  odometer: number;
  batteryVoltage: number;
  isLocked: boolean;
}

export interface RouteHistoryItem {
  id: string;
  vehicleId: string;
  startAt: Date;
  endAt: Date;
  distanceKm: number;
  durationMinutes: number;
  avgSpeedKmh: number;
  originAddress: string;
  destinationAddress: string;
  polyline: [number, number][];
}

export type VehicleCommand = 'engine_on' | 'engine_off' | 'lock' | 'unlock' | 'horn';

export interface GeoContextState {
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  selectVehicle: (id: string) => void;
  clearSelection: () => void;
  ghostRoute: RouteHistoryItem | null;
  setGhostRoute: (route: RouteHistoryItem | null) => void;
  sendCommand: (vehicleId: string, command: VehicleCommand) => Promise<void>;
}