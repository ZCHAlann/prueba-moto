import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  companyFuelEntries,
  companyMaintenances,
} from '../src/db/schema/operational';

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_fjl2WKQBME9I@ep-divine-glade-act3jqks-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
});
const db = drizzle(pool);

// ID de la empresa y activos/conductores que ya existen en la DB
const COMPANY_ID = 2;

// Ajusta estos IDs según lo que devuelva tu DB
// (SELECT id FROM company_assets WHERE company_id = 2 LIMIT 3)
const ASSET_IDS  = [1, 2, 3];   // VEH-001, VEH-002, VEH-003
const DRIVER_IDS = [1, 2, 3];   // DRV-001, DRV-002, DRV-003

/** Devuelve "YYYY-MM-DD" para el día D del mes M meses atrás desde hoy */
function dateOf(monthsAgo: number, day: number): string {
  const d = new Date();
  d.setUTCDate(day);
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  const yyyy = d.getUTCFullYear();
  const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function seed() {
  console.log('🌱 Seeding fuel & maintenance data for company', COMPANY_ID);

  // ─── FUEL ENTRIES — 2-4 cargas por mes, últimos 12 meses ─────────────────
  await db.insert(companyFuelEntries).values([
    // hace 12 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], driverId: DRIVER_IDS[0], date: dateOf(12, 3),  liters: '118.00', cost: '82.60',  odometer: '130000.00', station: 'Primax GYE',       fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], driverId: DRIVER_IDS[1], date: dateOf(12, 14), liters: '44.00',  cost: '30.80',  odometer: '65000.00',  station: 'PDV Centro',        fuelType: 'Diesel', notes: null },

    // hace 11 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], driverId: DRIVER_IDS[0], date: dateOf(11, 5),  liters: '125.50', cost: '87.85',  odometer: '131200.00', station: 'Primax Américas',   fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], driverId: DRIVER_IDS[1], date: dateOf(11, 18), liters: '48.00',  cost: '33.60',  odometer: '65800.00',  station: 'Petroecuador Sur',  fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[2], driverId: DRIVER_IDS[2], date: dateOf(11, 22), liters: '90.00',  cost: '63.00',  odometer: '98000.00',  station: 'PDV Ruta E35',      fuelType: 'Diesel', notes: null },

    // hace 10 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], driverId: DRIVER_IDS[0], date: dateOf(10, 2),  liters: '110.00', cost: '77.00',  odometer: '132500.00', station: 'Primax GYE',        fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], driverId: DRIVER_IDS[1], date: dateOf(10, 10), liters: '52.00',  cost: '36.40',  odometer: '66900.00',  station: 'PDV Centro',        fuelType: 'Diesel', notes: null },

    // hace 9 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], driverId: DRIVER_IDS[0], date: dateOf(9, 7),   liters: '130.00', cost: '91.00',  odometer: '134000.00', station: 'Primax Américas',   fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[2], driverId: DRIVER_IDS[2], date: dateOf(9, 19),  liters: '95.00',  cost: '66.50',  odometer: '99500.00',  station: 'PDV Ruta E35',      fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], driverId: DRIVER_IDS[1], date: dateOf(9, 25),  liters: '47.00',  cost: '32.90',  odometer: '68200.00',  station: 'Petroecuador Norte', fuelType: 'Diesel', notes: null },

    // hace 8 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], driverId: DRIVER_IDS[0], date: dateOf(8, 4),   liters: '122.00', cost: '85.40',  odometer: '135800.00', station: 'Primax GYE',        fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], driverId: DRIVER_IDS[1], date: dateOf(8, 15),  liters: '50.00',  cost: '35.00',  odometer: '69500.00',  station: 'PDV Centro',        fuelType: 'Diesel', notes: null },

    // hace 7 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], driverId: DRIVER_IDS[0], date: dateOf(7, 6),   liters: '135.00', cost: '94.50',  odometer: '137500.00', station: 'Primax Américas',   fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[2], driverId: DRIVER_IDS[2], date: dateOf(7, 11),  liters: '100.00', cost: '70.00',  odometer: '101000.00', station: 'PDV Ruta E35',      fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], driverId: DRIVER_IDS[1], date: dateOf(7, 20),  liters: '53.00',  cost: '37.10',  odometer: '71000.00',  station: 'Petroecuador Sur',  fuelType: 'Diesel', notes: null },

    // hace 6 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], driverId: DRIVER_IDS[0], date: dateOf(6, 3),   liters: '128.00', cost: '89.60',  odometer: '139200.00', station: 'Primax GYE',        fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], driverId: DRIVER_IDS[1], date: dateOf(6, 17),  liters: '46.00',  cost: '32.20',  odometer: '72300.00',  station: 'PDV Centro',        fuelType: 'Diesel', notes: null },

    // hace 5 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], driverId: DRIVER_IDS[0], date: dateOf(5, 8),   liters: '140.00', cost: '98.00',  odometer: '141000.00', station: 'Primax Américas',   fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[2], driverId: DRIVER_IDS[2], date: dateOf(5, 13),  liters: '88.00',  cost: '61.60',  odometer: '102500.00', station: 'PDV Ruta E35',      fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], driverId: DRIVER_IDS[1], date: dateOf(5, 22),  liters: '55.00',  cost: '38.50',  odometer: '73800.00',  station: 'Petroecuador Norte', fuelType: 'Diesel', notes: null },

    // hace 4 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], driverId: DRIVER_IDS[0], date: dateOf(4, 5),   liters: '115.00', cost: '80.50',  odometer: '142800.00', station: 'Primax GYE',        fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], driverId: DRIVER_IDS[1], date: dateOf(4, 16),  liters: '49.00',  cost: '34.30',  odometer: '75000.00',  station: 'PDV Centro',        fuelType: 'Diesel', notes: null },

    // hace 3 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], driverId: DRIVER_IDS[0], date: dateOf(3, 9),   liters: '132.00', cost: '92.40',  odometer: '144500.00', station: 'Primax Américas',   fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[2], driverId: DRIVER_IDS[2], date: dateOf(3, 14),  liters: '97.00',  cost: '67.90',  odometer: '104000.00', station: 'PDV Ruta E35',      fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], driverId: DRIVER_IDS[1], date: dateOf(3, 23),  liters: '51.00',  cost: '35.70',  odometer: '76500.00',  station: 'Petroecuador Sur',  fuelType: 'Diesel', notes: null },

    // hace 2 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], driverId: DRIVER_IDS[0], date: dateOf(2, 6),   liters: '120.00', cost: '84.00',  odometer: '146000.00', station: 'Primax GYE',        fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], driverId: DRIVER_IDS[1], date: dateOf(2, 18),  liters: '54.00',  cost: '37.80',  odometer: '77800.00',  station: 'PDV Centro',        fuelType: 'Diesel', notes: null },

    // hace 1 mes
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], driverId: DRIVER_IDS[0], date: dateOf(1, 4),   liters: '138.00', cost: '96.60',  odometer: '147800.00', station: 'Primax Américas',   fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[2], driverId: DRIVER_IDS[2], date: dateOf(1, 10),  liters: '92.00',  cost: '64.40',  odometer: '105500.00', station: 'PDV Ruta E35',      fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], driverId: DRIVER_IDS[1], date: dateOf(1, 21),  liters: '48.00',  cost: '33.60',  odometer: '79100.00',  station: 'Petroecuador Norte', fuelType: 'Diesel', notes: null },

    // mes actual
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], driverId: DRIVER_IDS[0], date: dateOf(0, 3),   liters: '125.00', cost: '87.50',  odometer: '149200.00', station: 'Primax GYE',        fuelType: 'Diesel', notes: null },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], driverId: DRIVER_IDS[1], date: dateOf(0, 12),  liters: '46.00',  cost: '32.20',  odometer: '80400.00',  station: 'PDV Centro',        fuelType: 'Diesel', notes: null },
  ]);

  console.log('✅ Fuel entries creadas (12 meses)');

  // ─── MAINTENANCES — 1-3 por mes, últimos 12 meses ────────────────────────
  await db.insert(companyMaintenances).values([
    // hace 12 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], title: 'Cambio de aceite y filtros',        kind: 'Preventivo',  priority: 'Media', status: 'Completado',   scheduledDate: dateOf(12, 5),  dueDate: dateOf(12, 7),  completedDate: dateOf(12, 6),  technician: 'Andrés Vega',          cost: '185.00', notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], title: 'Revisión general 10,000 km',        kind: 'Preventivo',  priority: 'Baja',  status: 'Completado',   scheduledDate: dateOf(12, 12), dueDate: dateOf(12, 14), completedDate: dateOf(12, 13), technician: 'Taller Interno',       cost: '95.00',  notes: null, photoUrls: [] },

    // hace 11 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[2], title: 'Reparación de frenos traseros',     kind: 'Correctivo',  priority: 'Alta',  status: 'Completado',   scheduledDate: dateOf(11, 3),  dueDate: dateOf(11, 5),  completedDate: dateOf(11, 4),  technician: 'Taller Externo Quito', cost: '420.00', notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], title: 'Cambio de correa de distribución',  kind: 'Preventivo',  priority: 'Alta',  status: 'Completado',   scheduledDate: dateOf(11, 18), dueDate: dateOf(11, 20), completedDate: dateOf(11, 19), technician: 'Andrés Vega',          cost: '310.00', notes: null, photoUrls: [] },

    // hace 10 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], title: 'Cambio de neumáticos delanteros',   kind: 'Preventivo',  priority: 'Media', status: 'Completado',   scheduledDate: dateOf(10, 7),  dueDate: dateOf(10, 9),  completedDate: dateOf(10, 8),  technician: 'Taller Interno',       cost: '560.00', notes: null, photoUrls: [] },

    // hace 9 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], title: 'Cambio de aceite y filtros',        kind: 'Preventivo',  priority: 'Media', status: 'Completado',   scheduledDate: dateOf(9, 4),   dueDate: dateOf(9, 6),   completedDate: dateOf(9, 5),   technician: 'Andrés Vega',          cost: '185.00', notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[2], title: 'Revisión sistema eléctrico',        kind: 'Correctivo',  priority: 'Media', status: 'Completado',   scheduledDate: dateOf(9, 15),  dueDate: dateOf(9, 17),  completedDate: dateOf(9, 16),  technician: 'Taller Externo Quito', cost: '230.00', notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], title: 'Calibración de frenos',             kind: 'Preventivo',  priority: 'Media', status: 'Completado',   scheduledDate: dateOf(9, 22),  dueDate: dateOf(9, 24),  completedDate: dateOf(9, 23),  technician: 'Taller Interno',       cost: '75.00',  notes: null, photoUrls: [] },

    // hace 8 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], title: 'Revisión de suspensión delantera',  kind: 'Preventivo',  priority: 'Media', status: 'Completado',   scheduledDate: dateOf(8, 8),   dueDate: dateOf(8, 10),  completedDate: dateOf(8, 9),   technician: 'Andrés Vega',          cost: '145.00', notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[2], title: 'Cambio de batería',                 kind: 'Correctivo',  priority: 'Alta',  status: 'Completado',   scheduledDate: dateOf(8, 19),  dueDate: dateOf(8, 21),  completedDate: dateOf(8, 20),  technician: 'Taller Externo Quito', cost: '195.00', notes: null, photoUrls: [] },

    // hace 7 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], title: 'Cambio de aceite 5W-30',            kind: 'Preventivo',  priority: 'Media', status: 'Completado',   scheduledDate: dateOf(7, 5),   dueDate: dateOf(7, 7),   completedDate: dateOf(7, 6),   technician: 'Taller Interno',       cost: '110.00', notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], title: 'Reparación de escape',              kind: 'Correctivo',  priority: 'Media', status: 'Completado',   scheduledDate: dateOf(7, 14),  dueDate: dateOf(7, 16),  completedDate: dateOf(7, 15),  technician: 'Andrés Vega',          cost: '275.00', notes: null, photoUrls: [] },

    // hace 6 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], title: 'Cambio de aceite y filtros',        kind: 'Preventivo',  priority: 'Media', status: 'Completado',   scheduledDate: dateOf(6, 3),   dueDate: dateOf(6, 5),   completedDate: dateOf(6, 4),   technician: 'Andrés Vega',          cost: '185.00', notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[2], title: 'Revisión de dirección hidráulica',  kind: 'Preventivo',  priority: 'Baja',  status: 'Completado',   scheduledDate: dateOf(6, 17),  dueDate: dateOf(6, 19),  completedDate: dateOf(6, 18),  technician: 'Taller Externo Quito', cost: '160.00', notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], title: 'Cambio de pastillas de freno',      kind: 'Preventivo',  priority: 'Media', status: 'Completado',   scheduledDate: dateOf(6, 24),  dueDate: dateOf(6, 26),  completedDate: dateOf(6, 25),  technician: 'Taller Interno',       cost: '220.00', notes: null, photoUrls: [] },

    // hace 5 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], title: 'Revisión de neumáticos',            kind: 'Preventivo',  priority: 'Baja',  status: 'Completado',   scheduledDate: dateOf(5, 9),   dueDate: dateOf(5, 11),  completedDate: dateOf(5, 10),  technician: 'Andrés Vega',          cost: '60.00',  notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[2], title: 'Reparación de fuga de aceite',      kind: 'Correctivo',  priority: 'Alta',  status: 'Completado',   scheduledDate: dateOf(5, 20),  dueDate: dateOf(5, 22),  completedDate: dateOf(5, 21),  technician: 'Taller Externo Quito', cost: '340.00', notes: null, photoUrls: [] },

    // hace 4 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], title: 'Cambio de aceite 5W-30',            kind: 'Preventivo',  priority: 'Media', status: 'Completado',   scheduledDate: dateOf(4, 6),   dueDate: dateOf(4, 8),   completedDate: dateOf(4, 7),   technician: 'Taller Interno',       cost: '110.00', notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], title: 'Cambio de amortiguadores',          kind: 'Preventivo',  priority: 'Media', status: 'Completado',   scheduledDate: dateOf(4, 15),  dueDate: dateOf(4, 17),  completedDate: dateOf(4, 16),  technician: 'Andrés Vega',          cost: '480.00', notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[2], title: 'Revisión general post-reparación',  kind: 'Preventivo',  priority: 'Baja',  status: 'Completado',   scheduledDate: dateOf(4, 22),  dueDate: dateOf(4, 24),  completedDate: dateOf(4, 23),  technician: 'Taller Externo Quito', cost: '85.00',  notes: null, photoUrls: [] },

    // hace 3 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], title: 'Cambio de aceite y filtros',        kind: 'Preventivo',  priority: 'Media', status: 'Completado',   scheduledDate: dateOf(3, 4),   dueDate: dateOf(3, 6),   completedDate: dateOf(3, 5),   technician: 'Andrés Vega',          cost: '185.00', notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], title: 'Reparación de aire acondicionado',  kind: 'Correctivo',  priority: 'Media', status: 'Completado',   scheduledDate: dateOf(3, 12),  dueDate: dateOf(3, 14),  completedDate: dateOf(3, 13),  technician: 'Taller Interno',       cost: '290.00', notes: null, photoUrls: [] },

    // hace 2 meses
    { companyId: COMPANY_ID, assetId: ASSET_IDS[2], title: 'Cambio de neumáticos traseros',     kind: 'Preventivo',  priority: 'Media', status: 'Completado',   scheduledDate: dateOf(2, 7),   dueDate: dateOf(2, 9),   completedDate: dateOf(2, 8),   technician: 'Taller Externo Quito', cost: '620.00', notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], title: 'Revisión de transmisión',           kind: 'Preventivo',  priority: 'Alta',  status: 'Completado',   scheduledDate: dateOf(2, 18),  dueDate: dateOf(2, 20),  completedDate: dateOf(2, 19),  technician: 'Andrés Vega',          cost: '350.00', notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], title: 'Cambio de filtro de combustible',   kind: 'Preventivo',  priority: 'Baja',  status: 'Completado',   scheduledDate: dateOf(2, 24),  dueDate: dateOf(2, 26),  completedDate: dateOf(2, 25),  technician: 'Taller Interno',       cost: '45.00',  notes: null, photoUrls: [] },

    // hace 1 mes
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], title: 'Cambio de aceite y filtros',        kind: 'Preventivo',  priority: 'Media', status: 'Completado',   scheduledDate: dateOf(1, 5),   dueDate: dateOf(1, 7),   completedDate: dateOf(1, 6),   technician: 'Andrés Vega',          cost: '185.00', notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[2], title: 'Reparación de sistema de frenos',   kind: 'Correctivo',  priority: 'Alta',  status: 'Completado',   scheduledDate: dateOf(1, 14),  dueDate: dateOf(1, 16),  completedDate: dateOf(1, 15),  technician: 'Taller Externo Quito', cost: '390.00', notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[1], title: 'Revisión general 20,000 km',        kind: 'Preventivo',  priority: 'Media', status: 'En progreso',   scheduledDate: dateOf(1, 22),  dueDate: dateOf(1, 24),  completedDate: null,           technician: 'Taller Interno',       cost: null,     notes: null, photoUrls: [] },

    // mes actual
    { companyId: COMPANY_ID, assetId: ASSET_IDS[0], title: 'Revisión de frenos delanteros',     kind: 'Preventivo',  priority: 'Media', status: 'Pendiente',    scheduledDate: dateOf(0, 8),   dueDate: dateOf(0, 10),  completedDate: null,           technician: 'Andrés Vega',          cost: null,     notes: null, photoUrls: [] },
    { companyId: COMPANY_ID, assetId: ASSET_IDS[2], title: 'Cambio de aceite 15W-40',           kind: 'Preventivo',  priority: 'Media', status: 'Pendiente',    scheduledDate: dateOf(0, 15),  dueDate: dateOf(0, 17),  completedDate: null,           technician: 'Taller Externo Quito', cost: null,     notes: null, photoUrls: [] },
  ]);

  console.log('✅ Maintenances creadas (12 meses)');
  console.log('\n🎉 Seed adicional completado');
  console.log('   Fuel entries: 32 registros | Maintenances: 32 registros');

  await pool.end();
}

seed().catch((err) => {
  console.error('❌ Error en seed:', err);
  process.exit(1);
});