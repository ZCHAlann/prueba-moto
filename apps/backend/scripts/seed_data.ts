import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  companies,
  platformUsers,
  companyUsers,
} from '../src/db/schema/platform';
import {
  companySettings,
  companySites,
  companyAssets,
  companyDrivers,
  companyAssignments,
  companyMaintenances,
  companyFuelEntries,
  companyAlerts,
  companyChecklistCategories,
  companyChecklists,
  companyInventory,
  companyGarages,
  companyAcUnits,
  companyAcServices,
  companyAcRefrigerantLogs,
  companyAuditEntries,
  oilChecks,
} from '../src/db/schema/operational';

const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_fjl2WKQBME9I@ep-divine-glade-act3jqks-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' });
const db = drizzle(pool);

async function seed() {
  console.log('🌱 Seeding database...');

  // ─── 1. COMPANIES ────────────────────────────────────────────────────────────
  const [company] = await db
    .insert(companies)
    .values({
      name: 'Transportes Andes S.A.',
      slug: 'transportes-andes',
      planId: 'pro',
      status: 'active',
      enabledModules: ['assets', 'drivers', 'maintenance', 'fuel', 'checklist', 'ac', 'inventory'],
    })
    .returning();

  console.log('✅ Company created:', company.id);

  // ─── 2. PLATFORM USERS ───────────────────────────────────────────────────────
  const [platformAdmin] = await db
    .insert(platformUsers)
    .values({
      email: 'admin@platform.com',
      username: 'platform_admin',
      passwordHash: '$2b$10$examplehashedpassword1234567890abcdefghij', // bcrypt hash placeholder
      role: 'superadmin',
      status: 'active',
    })
    .returning();

  console.log('✅ Platform user created:', platformAdmin.id);

  // ─── 3. COMPANY USERS ────────────────────────────────────────────────────────
  const [adminUser, managerUser, techUser] = await db
    .insert(companyUsers)
    .values([
      {
        companyId: company.id,
        email: 'admin@transportes-andes.com',
        username: 'admin_andes',
        passwordHash: '$2b$10$examplehashedpassword1234567890abcdefghij',
        role: 'admin',
        status: 'active',
        profileData: { firstName: 'Carlos', lastName: 'Mendoza', phone: '+593987654321' },
      },
      {
        companyId: company.id,
        email: 'gerente@transportes-andes.com',
        username: 'gerente_andes',
        passwordHash: '$2b$10$examplehashedpassword1234567890abcdefghij',
        role: 'manager',
        status: 'active',
        profileData: { firstName: 'María', lastName: 'Torres', phone: '+593912345678' },
      },
      {
        companyId: company.id,
        email: 'tecnico@transportes-andes.com',
        username: 'tecnico_andes',
        passwordHash: '$2b$10$examplehashedpassword1234567890abcdefghij',
        role: 'technician',
        status: 'active',
        profileData: { firstName: 'Andrés', lastName: 'Vega', phone: '+593998765432' },
      },
    ])
    .returning();

  console.log('✅ Company users created');

  // ─── 4. COMPANY SETTINGS ─────────────────────────────────────────────────────
  await db.insert(companySettings).values({
    companyId: company.id,
    maintenanceLeadTimeDays: 7,
    checklistRequired: true,
    fuelCurrency: 'USD',
    alertEmail: 'alertas@transportes-andes.com',
    alertConfigs: [
      { type: 'maintenance_due', daysAhead: 7, enabled: true },
      { type: 'license_expiry', daysAhead: 30, enabled: true },
      { type: 'fuel_anomaly', threshold: 20, enabled: true },
    ],
  });

  console.log('✅ Company settings created');

  // ─── 5. SITES ────────────────────────────────────────────────────────────────
  const [siteGuayaquil, siteQuito] = await db
    .insert(companySites)
    .values([
      {
        companyId: company.id,
        code: 'GYE-01',
        name: 'Sede Guayaquil Central',
        city: 'Guayaquil',
        address: 'Av. de las Américas 1200, Guayaquil',
        contact: 'Carlos Mendoza - 098-765-4321',
        status: 'Activa',
        notes: 'Sede principal y taller de mantenimiento.',
      },
      {
        companyId: company.id,
        code: 'UIO-01',
        name: 'Sede Quito Norte',
        city: 'Quito',
        address: 'Av. Naciones Unidas 1400, Quito',
        contact: 'María Torres - 091-234-5678',
        status: 'Activa',
        notes: 'Operaciones en la sierra.',
      },
    ])
    .returning();

  console.log('✅ Sites created');

  // ─── 6. ASSETS ───────────────────────────────────────────────────────────────
  const [asset1, asset2, asset3] = await db
    .insert(companyAssets)
    .values([
      {
        companyId: company.id,
        siteId: siteGuayaquil.id,
        code: 'VEH-001',
        name: 'Camión Freightliner #1',
        assetType: 'Camión',
        category: 'Transporte pesado',
        status: 'Operativo',
        responsible: 'Pedro Alvarado',
        brand: 'Freightliner',
        model: 'Cascadia 126',
        serial: 'FLC126-20230045',
        plate: 'GYE-1234',
        year: '2021',
        color: 'Blanco',
        maxLoad: '20 ton',
        fuelType: 'Diesel',
        oilType: '15W-40',
        oilCapacity: '15L',
        location: 'Patio GYE-01',
        availability: 'Disponible',
        observations: 'Revisión de frenos pendiente.',
        photoUrls: [],
      },
      {
        companyId: company.id,
        siteId: siteGuayaquil.id,
        code: 'VEH-002',
        name: 'Furgón Mercedes #2',
        assetType: 'Furgón',
        category: 'Transporte liviano',
        status: 'Operativo',
        responsible: 'Luis Paredes',
        brand: 'Mercedes-Benz',
        model: 'Sprinter 316',
        serial: 'WDB9066351R459871',
        plate: 'GYE-5678',
        year: '2022',
        color: 'Gris',
        maxLoad: '3.5 ton',
        fuelType: 'Diesel',
        oilType: '5W-30',
        oilCapacity: '7L',
        location: 'Patio GYE-01',
        availability: 'En ruta',
        observations: 'Vehículo en buen estado.',
        photoUrls: [],
      },
      {
        companyId: company.id,
        siteId: siteQuito.id,
        code: 'VEH-003',
        name: 'Camión Hino #3',
        assetType: 'Camión',
        category: 'Transporte mediano',
        status: 'En mantenimiento',
        responsible: 'Jorge Ramírez',
        brand: 'Hino',
        model: '500 Series FC9J',
        serial: 'JHFC9J-2019-00312',
        plate: 'UIO-9012',
        year: '2019',
        color: 'Azul',
        maxLoad: '8 ton',
        fuelType: 'Diesel',
        oilType: '15W-40',
        oilCapacity: '12L',
        location: 'Taller UIO-01',
        availability: 'No disponible',
        observations: 'Cambio de transmisión en progreso.',
        photoUrls: [],
      },
    ])
    .returning();

  console.log('✅ Assets created');

  // ─── 7. DRIVERS ──────────────────────────────────────────────────────────────
  const [driver1, driver2, driver3] = await db
    .insert(companyDrivers)
    .values([
      {
        companyId: company.id,
        siteId: siteGuayaquil.id,
        userId: adminUser.id,
        code: 'DRV-001',
        firstName: 'Pedro',
        lastName: 'Alvarado',
        email: 'pedro.alvarado@transportes-andes.com',
        phone: '+593999111222',
        licenseNumber: 'L-123456789',
        licenseType: 'E',
        licenseExpiry: '2026-08-15',
        licensePoints: 30,
        status: 'Activo',
        notes: 'Conductor experimentado, más de 10 años.',
        photoUrl: null,
      },
      {
        companyId: company.id,
        siteId: siteGuayaquil.id,
        userId: managerUser.id,
        code: 'DRV-002',
        firstName: 'Luis',
        lastName: 'Paredes',
        email: 'luis.paredes@transportes-andes.com',
        phone: '+593988333444',
        licenseNumber: 'L-987654321',
        licenseType: 'D',
        licenseExpiry: '2025-12-01',
        licensePoints: 25,
        status: 'Activo',
        notes: 'Especialista en rutas urbanas.',
        photoUrl: null,
      },
      {
        companyId: company.id,
        siteId: siteQuito.id,
        userId: techUser.id,
        code: 'DRV-003',
        firstName: 'Jorge',
        lastName: 'Ramírez',
        email: 'jorge.ramirez@transportes-andes.com',
        phone: '+593977555666',
        licenseNumber: 'L-555666777',
        licenseType: 'E',
        licenseExpiry: '2027-03-20',
        licensePoints: 30,
        status: 'Inactivo',
        notes: 'En espera de resolución de mantenimiento del vehículo asignado.',
        photoUrl: null,
      },
    ])
    .returning();

  console.log('✅ Drivers created');

  // ─── 8. ASSIGNMENTS ──────────────────────────────────────────────────────────
  await db.insert(companyAssignments).values([
    {
      companyId: company.id,
      assetId: asset1.id,
      driverId: driver1.id,
      startDate: '2024-01-15',
      endDate: null,
      status: 'Activa',
      notes: 'Asignación permanente ruta Guayaquil-Cuenca.',
      handoverUrl: null,
    },
    {
      companyId: company.id,
      assetId: asset2.id,
      driverId: driver2.id,
      startDate: '2024-03-01',
      endDate: null,
      status: 'Activa',
      notes: 'Rutas urbanas Guayaquil.',
      handoverUrl: null,
    },
    {
      companyId: company.id,
      assetId: asset3.id,
      driverId: driver3.id,
      startDate: '2023-06-01',
      endDate: '2024-11-30',
      status: 'Inactiva',
      notes: 'Asignación suspendida por mantenimiento.',
      handoverUrl: null,
    },
  ]);

  console.log('✅ Assignments created');

  // ─── 9. MAINTENANCES ─────────────────────────────────────────────────────────
  await db.insert(companyMaintenances).values([
    {
      companyId: company.id,
      assetId: asset1.id,
      title: 'Cambio de aceite y filtros',
      kind: 'Preventivo',
      priority: 'Media',
      status: 'Completado',
      scheduledDate: '2024-11-01',
      dueDate: '2024-11-05',
      completedDate: '2024-11-03',
      technician: 'Andrés Vega',
      cost: '185.00',
      notes: 'Se cambió aceite 15W-40, filtro de aceite y filtro de aire.',
      photoUrls: [],
    },
    {
      companyId: company.id,
      assetId: asset1.id,
      title: 'Revisión de sistema de frenos',
      kind: 'Correctivo',
      priority: 'Alta',
      status: 'Pendiente',
      scheduledDate: '2025-01-10',
      dueDate: '2025-01-12',
      completedDate: null,
      technician: 'Andrés Vega',
      cost: null,
      notes: 'Conductor reportó desgaste en pastillas traseras.',
      photoUrls: [],
    },
    {
      companyId: company.id,
      assetId: asset3.id,
      title: 'Reemplazo de transmisión automática',
      kind: 'Correctivo',
      priority: 'Alta',
      status: 'En progreso',
      scheduledDate: '2024-12-01',
      dueDate: '2024-12-20',
      completedDate: null,
      technician: 'Taller Externo Quito',
      cost: '4500.00',
      notes: 'Falla detectada en caja de cambios. Vehículo fuera de servicio.',
      photoUrls: [],
    },
  ]);

  console.log('✅ Maintenances created');

  // ─── 10. FUEL ENTRIES ────────────────────────────────────────────────────────
  await db.insert(companyFuelEntries).values([
    {
      companyId: company.id,
      assetId: asset1.id,
      driverId: driver1.id,
      date: '2024-12-01',
      liters: '120.50',
      cost: '84.35',
      odometer: '145230.00',
      station: 'Primax Av. Américas',
      fuelType: 'Diesel',
      notes: 'Abastecimiento completo antes de ruta larga.',
    },
    {
      companyId: company.id,
      assetId: asset1.id,
      driverId: driver1.id,
      date: '2024-12-08',
      liters: '95.00',
      cost: '66.50',
      odometer: '145890.00',
      station: 'PDV Ruta E35',
      fuelType: 'Diesel',
      notes: null,
    },
    {
      companyId: company.id,
      assetId: asset2.id,
      driverId: driver2.id,
      date: '2024-12-05',
      liters: '45.00',
      cost: '31.50',
      odometer: '78320.00',
      station: 'Petroecuador Centro',
      fuelType: 'Diesel',
      notes: null,
    },
  ]);

  console.log('✅ Fuel entries created');

  // ─── 11. ALERTS ──────────────────────────────────────────────────────────────
  await db.insert(companyAlerts).values([
    {
      companyId: company.id,
      assetId: asset1.id,
      title: 'Mantenimiento próximo a vencer',
      type: 'Mantenimiento',
      severity: 'media',
      status: 'Abierta',
      dueDate: '2025-01-12',
      notes: 'Revisión de frenos programada. Coordinar con taller.',
    },
    {
      companyId: company.id,
      // assetId omitido intencionalmente — alerta global sin vehículo específico
      title: 'Licencia de conductor por vencer',
      type: 'Documentación',
      severity: 'alta',
      status: 'Abierta',
      dueDate: '2025-12-01',
      notes: 'Luis Paredes - Licencia tipo D vence en diciembre 2025.',
    },
    {
      companyId: company.id,
      assetId: asset3.id,
      title: 'Vehículo fuera de servicio prolongado',
      type: 'Operacional',
      severity: 'alta',
      status: 'Abierta',
      dueDate: '2024-12-20',
      notes: 'VEH-003 en taller externo más de 15 días.',
    },
  ]);

  console.log('✅ Alerts created');

  // ─── 12. CHECKLIST CATEGORIES ────────────────────────────────────────────────
  const [catPreOp, catPostOp] = await db
    .insert(companyChecklistCategories)
    .values([
      {
        companyId: company.id,
        name: 'Inspección Pre-Operacional',
        description: 'Checklist obligatorio antes de iniciar ruta.',
        items: [
          'Nivel de aceite',
          'Nivel de agua/refrigerante',
          'Presión de neumáticos',
          'Luces delanteras y traseras',
          'Frenos de servicio',
          'Freno de mano',
          'Cinturón de seguridad',
          'Limpia parabrisas',
          'Espejos retrovisores',
          'Documentos del vehículo',
        ],
      },
      {
        companyId: company.id,
        name: 'Inspección Post-Operacional',
        description: 'Checklist al finalizar ruta o jornada.',
        items: [
          'Reporte de kilómetros recorridos',
          'Estado de neumáticos',
          'Revisión de carrocería (daños)',
          'Estado de carga/furgón',
          'Nivel de combustible',
          'Reporte de novedades',
        ],
      },
    ])
    .returning();

  console.log('✅ Checklist categories created');

  // ─── 13. CHECKLISTS ──────────────────────────────────────────────────────────
  await db.insert(companyChecklists).values([
    {
      companyId: company.id,
      categoryId: catPreOp.id,
      assetId: asset1.id,
      driverId: driver1.id,
      inspectorId: adminUser.id,
      targetKind: 'Vehículo',
      targetLabel: 'Camión Freightliner #1 - GYE-1234',
      date: '2024-12-09',
      status: 'Aprobado',
      summary: 'Vehículo en condiciones óptimas para operar.',
      findings: 'Presión neumático trasero derecho levemente baja. Inflado en sitio.',
      items: [
        { item: 'Nivel de aceite', ok: true, note: '' },
        { item: 'Nivel de agua/refrigerante', ok: true, note: '' },
        { item: 'Presión de neumáticos', ok: false, note: 'Neumático TR levemente bajo. Inflado.' },
        { item: 'Luces delanteras y traseras', ok: true, note: '' },
        { item: 'Frenos de servicio', ok: true, note: '' },
        { item: 'Freno de mano', ok: true, note: '' },
        { item: 'Cinturón de seguridad', ok: true, note: '' },
        { item: 'Limpia parabrisas', ok: true, note: '' },
        { item: 'Espejos retrovisores', ok: true, note: '' },
        { item: 'Documentos del vehículo', ok: true, note: '' },
      ],
      photoUrls: [],
    },
    {
      companyId: company.id,
      categoryId: catPostOp.id,
      assetId: asset2.id,
      driverId: driver2.id,
      inspectorId: managerUser.id,
      targetKind: 'Vehículo',
      targetLabel: 'Furgón Mercedes #2 - GYE-5678',
      date: '2024-12-08',
      status: 'Aprobado',
      summary: 'Sin novedades al finalizar jornada.',
      findings: null,
      items: [
        { item: 'Reporte de kilómetros recorridos', ok: true, note: '320 km recorridos hoy.' },
        { item: 'Estado de neumáticos', ok: true, note: '' },
        { item: 'Revisión de carrocería (daños)', ok: true, note: '' },
        { item: 'Estado de carga/furgón', ok: true, note: '' },
        { item: 'Nivel de combustible', ok: true, note: '30% restante.' },
        { item: 'Reporte de novedades', ok: true, note: 'Sin novedades.' },
      ],
      photoUrls: [],
    },
  ]);

  console.log('✅ Checklists created');

  // ─── 14. INVENTORY ───────────────────────────────────────────────────────────
  await db.insert(companyInventory).values([
    {
      companyId: company.id,
      code: 'INV-OIL-001',
      name: 'Aceite Motor 15W-40',
      category: 'Lubricantes',
      stock: '120.00',
      minStock: '30.00',
      location: 'Bodega GYE-01 - Estante A',
      unit: 'litros',
      notes: 'Marca Mobil Delvac. Reordenar cuando baje de 30L.',
    },
    {
      companyId: company.id,
      code: 'INV-FIL-001',
      name: 'Filtro de aceite Freightliner',
      category: 'Filtros',
      stock: '8.00',
      minStock: '3.00',
      location: 'Bodega GYE-01 - Estante B',
      unit: 'unidades',
      notes: 'Compatible con Cascadia 126.',
    },
    {
      companyId: company.id,
      code: 'INV-NEU-001',
      name: 'Neumático 11R22.5',
      category: 'Neumáticos',
      stock: '4.00',
      minStock: '2.00',
      location: 'Bodega GYE-01 - Zona C',
      unit: 'unidades',
      notes: 'Para camiones pesados. Marca Michelin.',
    },
    {
      companyId: company.id,
      code: 'INV-LIQ-001',
      name: 'Líquido de frenos DOT 4',
      category: 'Líquidos',
      stock: '15.00',
      minStock: '5.00',
      location: 'Bodega GYE-01 - Estante A',
      unit: 'litros',
      notes: null,
    },
  ]);

  console.log('✅ Inventory created');

  // ─── 15. GARAGES ─────────────────────────────────────────────────────────────
  await db.insert(companyGarages).values([
    {
      companyId: company.id,
      code: 'GAR-GYE-01',
      name: 'Garaje Principal Guayaquil',
      location: 'Av. de las Américas 1200, Guayaquil',
      capacity: 20,
      supervisor: 'Carlos Mendoza',
      status: 'Activo',
      notes: 'Cuenta con taller mecánico integrado.',
    },
    {
      companyId: company.id,
      code: 'GAR-UIO-01',
      name: 'Garaje Quito Norte',
      location: 'Av. Naciones Unidas 1400, Quito',
      capacity: 10,
      supervisor: 'María Torres',
      status: 'Activo',
      notes: 'Solo estacionamiento. Mantenimiento coordinado con GYE.',
    },
  ]);

  console.log('✅ Garages created');

  // ─── 16. AC UNITS ────────────────────────────────────────────────────────────
  const [acUnit1, acUnit2] = await db
    .insert(companyAcUnits)
    .values([
      {
        companyId: company.id,
        siteId: siteGuayaquil.id,
        code: 'AC-GYE-001',
        name: 'A/C Sala de Operaciones',
        type: 'Split',
        floor: 'Piso 1',
        area: 'Sala de Operaciones',
        serial: 'LG-AC-2021-00123',
        brand: 'LG',
        model: 'Dual Inverter S18EQ',
        capacityBtu: '18000',
        voltage: '220V',
        amperage: '8A',
        refrigerantType: 'R-410A',
        installDate: '2021-03-15',
        technician: 'FrioCorp Ecuador',
        status: 'Operativo',
        lastService: '2024-06-01',
        nextService: '2025-06-01',
        photoUrls: [],
        notes: 'Servicio anual realizado.',
      },
      {
        companyId: company.id,
        siteId: siteGuayaquil.id,
        code: 'AC-GYE-002',
        name: 'A/C Oficina Administrativa',
        type: 'Split',
        floor: 'Piso 2',
        area: 'Oficina Admin',
        serial: 'CARR-AC-2020-00456',
        brand: 'Carrier',
        model: '42QHC012DS',
        capacityBtu: '12000',
        voltage: '110V',
        amperage: '5.5A',
        refrigerantType: 'R-22',
        installDate: '2020-07-10',
        technician: 'Clima Total',
        status: 'Requiere servicio',
        lastService: '2023-07-01',
        nextService: '2024-07-01',
        photoUrls: [],
        notes: 'Próximo servicio vencido. Programar urgente.',
      },
    ])
    .returning();

  console.log('✅ AC units created');

  // ─── 17. AC SERVICES ─────────────────────────────────────────────────────────
  await db.insert(companyAcServices).values([
    {
      companyId: company.id,
      unitId: acUnit1.id,
      date: '2024-06-01',
      kind: 'Mantenimiento preventivo',
      technician: 'FrioCorp Ecuador',
      cost: '120.00',
      findings: 'Limpieza de filtros y revisión general. Sin anomalías.',
      photoUrls: [],
      notes: 'Servicio anual completado satisfactoriamente.',
    },
    {
      companyId: company.id,
      unitId: acUnit2.id,
      date: '2023-07-01',
      kind: 'Mantenimiento preventivo',
      technician: 'Clima Total',
      cost: '95.00',
      findings: 'Filtros limpios. Se detectó leve fuga de refrigerante R-22.',
      photoUrls: [],
      notes: 'Se agregó refrigerante. Recomiendan reemplazo de equipo a corto plazo.',
    },
  ]);

  console.log('✅ AC services created');

  // ─── 18. AC REFRIGERANT LOGS ─────────────────────────────────────────────────
  await db.insert(companyAcRefrigerantLogs).values([
    {
      companyId: company.id,
      unitId: acUnit2.id,
      date: '2023-07-01',
      refrigerantType: 'R-22',
      quantity: '0.50',
      unit: 'kg',
      technician: 'Clima Total',
      reason: 'Recarga por fuga detectada en servicio anual.',
      notes: 'Se recomienda reemplazo de unidad. R-22 descontinuado.',
    },
  ]);

  console.log('✅ AC refrigerant logs created');

  // ─── 19. OIL CHECKS ──────────────────────────────────────────────────────────
  await db.insert(oilChecks).values([
    {
      companyId: company.id,
      assetId: asset1.id,
      technicianId: techUser.id,
      nivel: 'Normal',
      color: 'Oscuro',
      confianza: '92%',
      puedeSalir: true,
      observaciones: 'Aceite con uso normal, dentro del rango operativo.',
      accionRecomendada: 'Continuar operación. Cambio de aceite en próximos 5,000 km.',
      photoUrl: null,
    },
    {
      companyId: company.id,
      assetId: asset2.id,
      technicianId: techUser.id,
      nivel: 'Bajo',
      color: 'Muy oscuro',
      confianza: '88%',
      puedeSalir: false,
      observaciones: 'Nivel por debajo del mínimo. Color indica aceite muy degradado.',
      accionRecomendada: 'Cambio de aceite inmediato antes de operar el vehículo.',
      photoUrl: null,
    },
  ]);

  console.log('✅ Oil checks created');

  // ─── 20. AUDIT ENTRIES ───────────────────────────────────────────────────────
  await db.insert(companyAuditEntries).values([
    {
      companyId: company.id,
      entity: 'companyAssets',
      entityId: String(asset1.id),
      action: 'create',
      actorId: adminUser.id,
      actorName: 'Carlos Mendoza',
      description: 'Activo VEH-001 creado en el sistema.',
      metadata: { assetCode: 'VEH-001', plate: 'GYE-1234' },
    },
    {
      companyId: company.id,
      entity: 'companyMaintenances',
      entityId: '1',
      action: 'update',
      actorId: techUser.id,
      actorName: 'Andrés Vega',
      description: 'Mantenimiento de aceite marcado como completado.',
      metadata: { status: 'Completado', completedDate: '2024-11-03' },
    },
    {
      companyId: company.id,
      entity: 'companyDrivers',
      entityId: String(driver3.id),
      action: 'update',
      actorId: managerUser.id,
      actorName: 'María Torres',
      description: 'Conductor Jorge Ramírez marcado como Inactivo por mantenimiento de unidad.',
      metadata: { previousStatus: 'Activo', newStatus: 'Inactivo' },
    },
  ]);

  console.log('✅ Audit entries created');

  console.log('\n🎉 Seed completado exitosamente!');
  console.log(`   Empresa: ${company.name} (ID: ${company.id})`);
  console.log(`   Sedes: 2 | Activos: 3 | Conductores: 3`);
  console.log(`   Mantenimientos: 3 | Combustible: 3 registros`);
  console.log(`   Checklist categorías: 2 | Checklists: 2`);
  console.log(`   Inventario: 4 items | Garajes: 2`);
  console.log(`   Unidades A/C: 2 | Alertas: 3 | Oil checks: 2`);

  await pool.end();
}

seed().catch((err) => {
  console.error('❌ Error en seed:', err);
});