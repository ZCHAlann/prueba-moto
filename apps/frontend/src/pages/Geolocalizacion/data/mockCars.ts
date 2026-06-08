import type { Car } from '../types/car';
import { CAR_SILHOUETTES } from './carSilhouettes';

const now = new Date().toISOString();

/**
 * En producción, `photoUrl` debe llegar desde
 * `assets.photoUrls[0]` para ese vehículo. Aquí dejamos
 * las siluetas locales como placeholder visual para que
 * el módulo sea navegable sin backend.
 */
export const mockCars: Car[] = [
  { id: 'car-001', plate: 'TXR-456', brand: 'Toyota',  model: 'Hilux',    year: 2023, color: 'Blanco', driverId: 'drv-001', driverName: 'Martín Dragonjen', state: 'active',  engine: 'on',  lock: 'unlocked', position: { lat: 34.1015, lng: -118.3387 }, address: 'Hollywood Blvd',   lastUpdate: now, photoUrl: CAR_SILHOUETTES.white },
  { id: 'car-002', plate: 'PRL-892', brand: 'Ford',     model: 'Ranger',   year: 2022, color: 'Negro',  driverId: 'drv-002', driverName: 'Carlos Méndez',    state: 'active',  engine: 'on',  lock: 'locked',    position: { lat: 34.0407, lng: -118.2468 }, address: 'Downtown LA',      lastUpdate: now, photoUrl: CAR_SILHOUETTES.black },
  { id: 'car-003', plate: 'MNB-347', brand: 'Chevrolet',model: 'Colorado', year: 2024, color: 'Gris',                                       state: 'off',     engine: 'off', lock: 'locked',    position: { lat: 34.0195, lng: -118.4912 }, address: 'Santa Monica',     lastUpdate: now, photoUrl: CAR_SILHOUETTES.gray  },
  { id: 'car-004', plate: 'BNV-120', brand: 'Nissan',   model: 'Frontier', year: 2023, color: 'Azul',   driverId: 'drv-004', driverName: 'Ana Rodríguez',    state: 'blocked', engine: 'off', lock: 'locked',    position: { lat: 34.0736, lng: -118.4004 }, address: 'Beverly Hills',    lastUpdate: now, photoUrl: CAR_SILHOUETTES.blue  },
  { id: 'car-005', plate: 'KJL-567', brand: 'Toyota',   model: 'Tacoma',   year: 2022, color: 'Rojo',                                        state: 'off',     engine: 'off', lock: 'locked',    position: { lat: 33.9533, lng: -118.4004 }, address: 'Inglewood',        lastUpdate: now, photoUrl: CAR_SILHOUETTES.red   },
  { id: 'car-006', plate: 'HGF-901', brand: 'Ford',     model: 'F-150',    year: 2024, color: 'Plata',  driverId: 'drv-006', driverName: 'Luis Hernández',   state: 'active',  engine: 'on',  lock: 'unlocked', position: { lat: 34.1478, lng: -118.1445 }, address: 'Pasadena',         lastUpdate: now, photoUrl: CAR_SILHOUETTES.silver},
  { id: 'car-007', plate: 'QWE-234', brand: 'RAM',      model: '1500',     year: 2023, color: 'Negro',  driverId: 'drv-007', driverName: 'Sofía Castaño',    state: 'active',  engine: 'on',  lock: 'unlocked', position: { lat: 34.1808, lng: -118.3090 }, address: 'Glendale',         lastUpdate: now, photoUrl: CAR_SILHOUETTES.dark  },
  { id: 'car-008', plate: 'ZXC-778', brand: 'Jeep',     model: 'Gladiator',year: 2024, color: 'Verde',                                      state: 'off',     engine: 'off', lock: 'locked',    position: { lat: 33.7701, lng: -118.1937 }, address: 'Long Beach',       lastUpdate: now, photoUrl: CAR_SILHOUETTES.green },
];
