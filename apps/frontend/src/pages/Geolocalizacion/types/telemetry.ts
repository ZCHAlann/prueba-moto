export interface Telemetry {
  carId: string;
  speed: number;      // km/h
  fuel: number;       // litros actuales
  fuelMax: number;    // capacidad del tanque
  mileage: number;    // km acumulados
  lat: number;
  lng: number;
  ts: string;         // ISO
}