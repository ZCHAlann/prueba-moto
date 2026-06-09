import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { hash } from 'bcryptjs';
import * as platformSchema from '../src/db/schema/platform';
import * as operationalSchema from '../src/db/schema/operational';

const {
  platformPlans, companies, platformUsers, companyUsers,
  platformSettings, platformLeads, platformInvoices, platformTickets, platformTicketMessages,
  platformAuditEntries,
} = platformSchema;

const {
  companySettings, companySites, companyAssets, companyDrivers,
  companyAssignments, companyMaintenances, companyFuelEntries,
  companyAlerts, companyChecklistCategories, companyChecklists,
  companyInventory, companyGarages, companyAcUnits, companyAcServices,
  companyAcRefrigerantLogs, companyAuditEntries, oilChecks,
  companyOilTypes, companyOilChanges, companyInsurancePolicies,
  assetNotes, assetRoutes, companyDriverReports,
} = operationalSchema;

const SALT_ROUNDS = 10;
const hashPassword = (p: string) => hash(p, SALT_ROUNDS);

async function main() {
  const client = postgres(
    'jeje'
  );
  const db = drizzle(client);

  console.log('🌱 Iniciando seed...\n');

  // ─────────────────────────────────────────────
  // 1. Platform settings (singleton)
  // ─────────────────────────────────────────────
  await db.insert(platformSettings).values({
    id: 1,
    platformName: 'ApliSmart Motors',
    supportEmail: 'soporte@aplismart.io',
    defaultTimezone: 'America/Guayaquil',
    defaultLanguage: 'es',
    defaultTrialDays: 14,
    defaultMaxUsers: 10,
    defaultMaxAssets: 50,
    passwordMinLength: 8,
    passwordRequireUpper: true,
    passwordRequireNumber: true,
    passwordRequireSymbol: false,
    passwordExpiryDays: 0,
    sessionExpiryHours: 24,
    maxLoginAttempts: 5,
    lockoutMinutes: 30,
    notifyOnNewCompany: true,
    notifyOnTrialExpiring: true,
    notifyOnLoginFailure: false,
  }).onConflictDoNothing();
  console.log('✅ platform_settings');

  // ─────────────────────────────────────────────
  // 2. Planes
  // ─────────────────────────────────────────────
  await db.insert(platformPlans).values([
    {
      id: 'free',
      name: 'Free',
      tier: 'free',
      monthlyPrice: '0',
      annualPrice: '0',
      maxUsers: 3,
      maxAssets: 10,
      allowedModules: ['activos', 'conductores'],
      isActive: true,
    },
    {
      id: 'starter',
      name: 'Starter',
      tier: 'starter',
      monthlyPrice: '49.00',
      annualPrice: '490.00',
      maxUsers: 10,
      maxAssets: 50,
      allowedModules: ['activos', 'conductores', 'mantenimiento', 'combustible', 'alertas'],
      isActive: true,
    },
    {
      id: 'pro',
      name: 'Pro',
      tier: 'pro',
      monthlyPrice: '99.00',
      annualPrice: '990.00',
      maxUsers: 30,
      maxAssets: 200,
      allowedModules: [
        'activos', 'conductores', 'mantenimiento', 'combustible',
        'alertas', 'checklist', 'inventario', 'garajes', 'ac', 'seguros',
      ],
      isActive: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      tier: 'enterprise',
      monthlyPrice: '249.00',
      annualPrice: '2490.00',
      maxUsers: null,
      maxAssets: null,
      allowedModules: [
        'activos', 'conductores', 'mantenimiento', 'combustible',
        'alertas', 'checklist', 'inventario', 'garajes', 'ac', 'seguros', 'auditoria',
      ],
      isActive: true,
    },
  ]).onConflictDoNothing();
  console.log('✅ platform_plans');

  // ─────────────────────────────────────────────
  // 3. SuperAdmin (platform user)
  // ─────────────────────────────────────────────
  const [superAdmin] = await db.insert(platformUsers).values({
    email: 'admin@aplismart.io',
    username: 'superadmin',
    passwordHash: await hashPassword('Admin123!'),
    role: 'superadmin',
    status: 'active',
    failedLoginAttempts: 0,
  }).returning();
  console.log('✅ platform_users (superadmin)');

  // ─────────────────────────────────────────────
  // 4. Empresa demo
  // ─────────────────────────────────────────────
  const [empresa] = await db.insert(companies).values({
    name: 'Transportes Ecuavial S.A.',
    slug: 'ecuavial',
    planId: 'pro',
    status: 'active',
    enabledModules: [
      'activos', 'conductores', 'mantenimiento', 'combustible',
      'alertas', 'checklist', 'inventario', 'garajes', 'ac', 'seguros',
    ],
    industry: 'transporte',
    country: 'Ecuador',
    city: 'Guayaquil',
    contactName: 'Carlos Mendoza',
    contactEmail: 'cmendoza@ecuavial.com',
    contactPhone: '+593 99 123 4567',
    website: 'https://ecuavial.com',
    contractStartAt: '2024-01-01',
    contractEndAt: '2025-12-31',
  }).returning();
  console.log('✅ companies');

  // ─────────────────────────────────────────────
  // 5. Company settings
  // ─────────────────────────────────────────────
  await db.insert(companySettings).values({
    companyId: empresa.id,
    maintenanceLeadTimeDays: 7,
    checklistRequired: true,
    fuelCurrency: 'USD',
    alertEmail: 'alertas@ecuavial.com',
    alertConfigs: [],
  }).onConflictDoNothing();
  console.log('✅ company_settings');

  // ─────────────────────────────────────────────
  // 6. Usuarios de empresa
  // ─────────────────────────────────────────────
  const [adminUser, ownerUser, operadorUser] = await db.insert(companyUsers).values([
    {
      companyId: empresa.id,
      email: 'admin@ecuavial.com',
      username: 'admin_ecuavial',
      passwordHash: await hashPassword('Admin123!'),
      role: 'admin_empresa',
      status: 'active',
      profileData: { firstName: 'Carlos', lastName: 'Mendoza' },
      modulePermissions: {},
      failedLoginAttempts: 0,
    },
    {
      companyId: empresa.id,
      email: 'owner@ecuavial.com',
      username: 'owner_ecuavial',
      passwordHash: await hashPassword('Owner123!'),
      role: 'owner_empresa',
      status: 'active',
      profileData: { firstName: 'Ana', lastName: 'Torres' },
      modulePermissions: {},
      failedLoginAttempts: 0,
    },
    {
      companyId: empresa.id,
      email: 'operador@ecuavial.com',
      username: 'operador_ecuavial',
      passwordHash: await hashPassword('Operador123!'),
      role: 'operador',
      status: 'active',
      profileData: { firstName: 'Pedro', lastName: 'Guzmán' },
      modulePermissions: {},
      failedLoginAttempts: 0,
    },
  ]).returning();
  console.log('✅ company_users');

  // ─────────────────────────────────────────────
  // 7. Sedes
  // ─────────────────────────────────────────────
  const [sedeGye, sedeUio] = await db.insert(companySites).values([
    {
      companyId: empresa.id,
      code: 'GYE-01',
      name: 'Sede Guayaquil',
      city: 'Guayaquil',
      address: 'Av. Juan Tanca Marengo km 3.5',
      contact: 'Carlos Mendoza',
      status: 'Activa',
    },
    {
      companyId: empresa.id,
      code: 'UIO-01',
      name: 'Sede Quito',
      city: 'Quito',
      address: 'Av. Eloy Alfaro N32-500',
      contact: 'Lucía Ramírez',
      status: 'Activa',
    },
  ]).returning();
  console.log('✅ company_sites');

  // ─────────────────────────────────────────────
  // 8. Garajes (antes de activos por FK garageId)
  // ─────────────────────────────────────────────
  const [garGye, garUio] = await db.insert(companyGarages).values([
    {
      companyId: empresa.id,
      code: 'GAR-GYE',
      name: 'Garaje Central Guayaquil',
      location: 'Av. Juan Tanca Marengo km 3.5',
      capacity: 20,
      supervisor: 'Pedro Guzmán',
      status: 'Activo',
      latitude: -2.1894,
      longitude: -79.8891,
    },
    {
      companyId: empresa.id,
      code: 'GAR-UIO',
      name: 'Garaje Quito Norte',
      location: 'Av. Eloy Alfaro N32-500',
      capacity: 10,
      supervisor: 'Jorge Naranjo',
      status: 'Activo',
      latitude: -0.1807,
      longitude: -78.4678,
    },
  ]).returning();
  console.log('✅ company_garages');

  // ─────────────────────────────────────────────
  // 9. Activos (con campos de telemática y GPS)
  // ─────────────────────────────────────────────
  const [activo1, activo2, activo3, activo4] = await db.insert(companyAssets).values([
    {
      companyId: empresa.id,
      siteId: sedeGye.id,
      garageId: garGye.id,
      code: 'VH-001',
      name: 'Camión Hino GH 2021',
      assetType: 'Vehiculo',
      category: 'Camion',
      status: 'Operativo',
      brand: 'Hino',
      model: 'GH 1727',
      serial: 'JH1GH1727MK000001',
      plate: 'ABC-1234',
      year: '2021',
      color: 'Blanco',
      maxLoad: '27000 kg',
      fuelType: 'Diesel',
      oilType: '15W-40',
      oilCapacity: '11 lts',
      availability: 'Disponible',
      responsible: 'Pedro Guzmán',
      photoUrls: [],
      // Telemática
      engineOn: false,
      locked: true,
      lastLat: -2.1500,
      lastLng: -79.8800,
      lastGpsAt: new Date('2025-05-30T08:00:00Z'),
    },
    {
      companyId: empresa.id,
      siteId: sedeGye.id,
      garageId: garGye.id,
      code: 'VH-002',
      name: 'Camioneta Toyota Hilux 2022',
      assetType: 'Vehiculo',
      category: 'Camioneta',
      status: 'Operativo',
      brand: 'Toyota',
      model: 'Hilux 4x4',
      serial: 'MR0EX32G800002',
      plate: 'DEF-5678',
      year: '2022',
      color: 'Plata',
      fuelType: 'Diesel',
      oilType: '5W-30',
      oilCapacity: '6 lts',
      availability: 'En ruta',
      responsible: 'Ana Torres',
      photoUrls: [],
      // Telemática
      engineOn: true,
      locked: false,
      lastLat: -2.2200,
      lastLng: -79.9100,
      lastGpsAt: new Date('2025-05-30T10:30:00Z'),
    },
    {
      companyId: empresa.id,
      siteId: sedeUio.id,
      garageId: garUio.id,
      code: 'VH-003',
      name: 'Bus Hino RN 2020',
      assetType: 'Vehiculo',
      category: 'Bus',
      status: 'En mantenimiento',
      brand: 'Hino',
      model: 'RN8J',
      serial: 'JH1RN8J5LM000003',
      plate: 'GHI-9012',
      year: '2020',
      color: 'Azul',
      fuelType: 'Diesel',
      availability: 'No disponible',
      photoUrls: [],
      // Telemática
      engineOn: false,
      locked: true,
      lastLat: -0.1807,
      lastLng: -78.4678,
      lastGpsAt: new Date('2025-05-28T16:00:00Z'),
    },
    {
      companyId: empresa.id,
      siteId: sedeGye.id,
      garageId: garGye.id,
      code: 'GEN-001',
      name: 'Generador Caterpillar 150kVA',
      assetType: 'Planta electrica',
      status: 'Operativo',
      brand: 'Caterpillar',
      model: 'C4.4',
      serial: 'CAT-C44-000004',
      year: '2019',
      fuelType: 'Diesel',
      oilType: '15W-40',
      oilCapacity: '14 lts',
      availability: 'Disponible',
      photoUrls: [],
      engineOn: false,
      locked: false,
    },
  ]).returning();
  console.log('✅ company_assets');

  // ─────────────────────────────────────────────
  // 10. Conductores
  // ─────────────────────────────────────────────
  const [conductor1, conductor2, conductor3] = await db.insert(companyDrivers).values([
    {
      companyId: empresa.id,
      siteId: sedeGye.id,
      code: 'DRV-001',
      firstName: 'Roberto',
      lastName: 'Villacís',
      email: 'rvillacis@ecuavial.com',
      phone: '+593 98 765 4321',
      licenseNumber: '1704567890',
      licenseType: 'E',
      licenseExpiry: '2026-03-15',
      licensePoints: 30,
      status: 'Activo',
    },
    {
      companyId: empresa.id,
      siteId: sedeGye.id,
      code: 'DRV-002',
      firstName: 'María',
      lastName: 'Cevallos',
      email: 'mcevallos@ecuavial.com',
      phone: '+593 97 654 3210',
      licenseNumber: '0912345678',
      licenseType: 'C',
      licenseExpiry: '2025-11-20',
      licensePoints: 28,
      status: 'Activo',
    },
    {
      companyId: empresa.id,
      siteId: sedeUio.id,
      code: 'DRV-003',
      firstName: 'Jorge',
      lastName: 'Naranjo',
      email: 'jnaranjo@ecuavial.com',
      phone: '+593 96 543 2109',
      licenseNumber: '1756789012',
      licenseType: 'E',
      licenseExpiry: '2027-06-30',
      licensePoints: 30,
      status: 'Activo',
    },
  ]).returning();
  console.log('✅ company_drivers');

  // ─────────────────────────────────────────────
  // 11. Asignaciones (con campos de acta de entrega)
  // ─────────────────────────────────────────────
  const [asign1] = await db.insert(companyAssignments).values([
    {
      companyId: empresa.id,
      assetId: activo1.id,
      driverId: conductor1.id,
      startDate: '2024-01-15',
      status: 'Activa',
      notes: 'Asignación permanente ruta Guayaquil-Quito',
      // Acta de entrega
      actaNumber: 'ACTA-2024-001',
      actaDate: '2024-01-15',
      actaTime: '08:00',
      actaPlace: 'Sede Guayaquil - Oficina de Operaciones',
      actaArea: 'Logística',
      driverDni: '1704567890',
      driverPhone: '+593 98 765 4321',
      driverRole: 'Conductor de Ruta',
      vehicleOdometer: '120000',
      vehicleFuelLevel: '3/4',
      vehicleCondition: 'Bueno',
      novedades: { frenos: 'OK', llantas: 'OK', luces: 'OK' },
      accesorios: { gato: true, llanta_repuesto: true, triangulo: true, extintor: true },
      novedadesText: 'Vehículo en buen estado general al momento de la entrega.',
      vehiclePhotoUrls: [],
    },
    {
      companyId: empresa.id,
      assetId: activo2.id,
      driverId: conductor2.id,
      startDate: '2024-03-01',
      status: 'Activa',
      actaNumber: 'ACTA-2024-002',
      actaDate: '2024-03-01',
      actaTime: '09:00',
      actaPlace: 'Sede Guayaquil',
      actaArea: 'Operaciones',
      driverDni: '0912345678',
      driverPhone: '+593 97 654 3210',
      driverRole: 'Conductora Urbana',
      vehicleOdometer: '75000',
      vehicleFuelLevel: '1/2',
      vehicleCondition: 'Muy Bueno',
      novedades: { frenos: 'OK', llantas: 'OK', luces: 'OK' },
      accesorios: { gato: true, llanta_repuesto: true, triangulo: true, extintor: true },
      vehiclePhotoUrls: [],
    },
  ]).returning();
  console.log('✅ company_assignments');

  // ─────────────────────────────────────────────
  // 12. Mantenimientos
  // ─────────────────────────────────────────────
  await db.insert(companyMaintenances).values([
    {
      companyId: empresa.id,
      assetId: activo1.id,
      title: 'Cambio de aceite y filtros',
      kind: 'Preventivo',
      priority: 'Media',
      status: 'Completado',
      scheduledDate: '2024-11-10',
      completedDate: '2024-11-10',
      technician: 'Pedro Guzmán',
      cost: '180.00',
      laborCost: '60.00',
      partsCost: '120.00',
      notes: 'Se cambió filtro de aceite, aire y combustible.',
      photoUrls: [],
    },
    {
      companyId: empresa.id,
      assetId: activo3.id,
      title: 'Revisión de frenos',
      kind: 'Correctivo',
      priority: 'Alta',
      status: 'En proceso',
      scheduledDate: '2025-05-20',
      dueDate: '2025-05-25',
      technician: 'Pedro Guzmán',
      cost: '350.00',
      laborCost: '100.00',
      partsCost: '250.00',
      photoUrls: [],
    },
    {
      companyId: empresa.id,
      assetId: activo2.id,
      title: 'Revisión preventiva 30.000 km',
      kind: 'Preventivo',
      priority: 'Baja',
      status: 'Pendiente',
      scheduledDate: '2025-07-01',
      technician: 'Pedro Guzmán',
      photoUrls: [],
    },
  ]);
  console.log('✅ company_maintenances');

  // ─────────────────────────────────────────────
  // 13. Combustible
  // ─────────────────────────────────────────────
  await db.insert(companyFuelEntries).values([
    {
      companyId: empresa.id,
      assetId: activo1.id,
      driverId: conductor1.id,
      date: '2025-05-28',
      liters: '120.50',
      cost: '90.38',
      odometer: '154320.00',
      station: 'Primax Av. Quito',
      fuelType: 'Diesel',
    },
    {
      companyId: empresa.id,
      assetId: activo2.id,
      driverId: conductor2.id,
      date: '2025-05-29',
      liters: '45.00',
      cost: '33.75',
      odometer: '89450.00',
      station: 'EP Petroecuador Kennedy',
      fuelType: 'Diesel',
    },
    {
      companyId: empresa.id,
      assetId: activo4.id,
      date: '2025-05-30',
      liters: '60.00',
      cost: '45.00',
      station: 'Tanque interno',
      fuelType: 'Diesel',
    },
  ]);
  console.log('✅ company_fuel_entries');

  // ─────────────────────────────────────────────
  // 14. Alertas
  // ─────────────────────────────────────────────
  await db.insert(companyAlerts).values([
    {
      companyId: empresa.id,
      assetId: activo2.id,
      title: 'Licencia de conductor por vencer',
      type: 'Documento',
      severity: 'media',
      status: 'Abierta',
      dueDate: '2025-11-20',
      notes: 'Licencia del conductor María Cevallos vence en noviembre.',
    },
    {
      companyId: empresa.id,
      assetId: activo1.id,
      title: 'Mantenimiento preventivo próximo',
      type: 'Mantenimiento',
      severity: 'baja',
      status: 'Abierta',
      dueDate: '2025-08-10',
    },
    {
      companyId: empresa.id,
      assetId: activo3.id,
      title: 'Vehículo en mantenimiento no programado',
      type: 'Operativo',
      severity: 'alta',
      status: 'Abierta',
    },
  ]);
  console.log('✅ company_alerts');

  // ─────────────────────────────────────────────
  // 15. Checklist categorías
  // ─────────────────────────────────────────────
  const [catPre, catPost] = await db.insert(companyChecklistCategories).values([
    {
      companyId: empresa.id,
      name: 'Inspección pre-viaje',
      description: 'Revisión antes de salir a ruta',
      items: ['Nivel de aceite', 'Presión de neumáticos', 'Luces', 'Frenos', 'Cinturones', 'Documentos'],
    },
    {
      companyId: empresa.id,
      name: 'Inspección post-viaje',
      description: 'Revisión al retornar de ruta',
      items: ['Carrocería sin daños', 'Nivel de combustible', 'Limpieza interna', 'Reporte de novedades'],
    },
  ]).returning();
  console.log('✅ company_checklist_categories');

  // ─────────────────────────────────────────────
  // 16. Checklists
  // ─────────────────────────────────────────────
  await db.insert(companyChecklists).values([
    {
      companyId: empresa.id,
      categoryId: catPre.id,
      assetId: activo1.id,
      driverId: conductor1.id,
      inspectorId: adminUser.id,
      targetKind: 'Vehiculo',
      targetLabel: 'Camión Hino GH - ABC-1234',
      date: '2025-05-30',
      status: 'Completado',
      summary: 'Vehículo en buen estado',
      items: [
        { name: 'Nivel de aceite', result: 'OK' },
        { name: 'Presión de neumáticos', result: 'OK' },
        { name: 'Luces', result: 'OK' },
        { name: 'Frenos', result: 'OK' },
        { name: 'Cinturones', result: 'OK' },
        { name: 'Documentos', result: 'OK' },
      ],
      photoUrls: [],
    },
    {
      companyId: empresa.id,
      categoryId: catPost.id,
      assetId: activo2.id,
      driverId: conductor2.id,
      inspectorId: adminUser.id,
      targetKind: 'Vehiculo',
      targetLabel: 'Camioneta Toyota Hilux - DEF-5678',
      date: '2025-05-29',
      status: 'Completado',
      summary: 'Sin novedades al retorno',
      items: [
        { name: 'Carrocería sin daños', result: 'OK' },
        { name: 'Nivel de combustible', result: 'Bajo' },
        { name: 'Limpieza interna', result: 'OK' },
        { name: 'Reporte de novedades', result: 'Sin novedades' },
      ],
      photoUrls: [],
    },
  ]);
  console.log('✅ company_checklists');

  // ─────────────────────────────────────────────
  // 17. Inventario
  // ─────────────────────────────────────────────
  await db.insert(companyInventory).values([
    {
      companyId: empresa.id,
      code: 'INV-001',
      name: 'Filtro de aceite Hino GH',
      category: 'Filtros',
      stock: '12.00',
      minStock: '4.00',
      unit: 'unidad',
      location: 'Bodega A - Estante 1',
    },
    {
      companyId: empresa.id,
      code: 'INV-002',
      name: 'Aceite motor 15W-40 (galón)',
      category: 'Lubricantes',
      stock: '24.00',
      minStock: '8.00',
      unit: 'galón',
      location: 'Bodega A - Estante 2',
    },
    {
      companyId: empresa.id,
      code: 'INV-003',
      name: 'Pastillas de freno Toyota Hilux',
      category: 'Frenos',
      stock: '3.00',
      minStock: '4.00',
      unit: 'juego',
      location: 'Bodega B - Estante 1',
      notes: 'Stock bajo — requiere reposición',
    },
    {
      companyId: empresa.id,
      code: 'INV-004',
      name: 'Neumático 11R22.5 (Hino)',
      category: 'Neumáticos',
      stock: '6.00',
      minStock: '2.00',
      unit: 'unidad',
      location: 'Bodega B - Zona neumáticos',
    },
    {
      companyId: empresa.id,
      code: 'INV-005',
      name: 'Filtro de aire Caterpillar C4.4',
      category: 'Filtros',
      stock: '4.00',
      minStock: '2.00',
      unit: 'unidad',
      location: 'Bodega A - Estante 3',
    },
  ]);
  console.log('✅ company_inventory');

  // ─────────────────────────────────────────────
  // 18. Unidades AC
  // ─────────────────────────────────────────────
  const [ac1, ac2] = await db.insert(companyAcUnits).values([
    {
      companyId: empresa.id,
      siteId: sedeGye.id,
      code: 'AC-001',
      name: 'Aire acondicionado oficina principal',
      type: 'Split',
      floor: 'PB',
      area: 'Oficina administrativa',
      brand: 'LG',
      model: 'S18ET',
      serial: 'LG-S18-2022-001',
      capacityBtu: '18000',
      voltage: '220V',
      refrigerantType: 'R410A',
      installDate: '2022-01-10',
      technician: 'Servicio Técnico LG',
      status: 'Operativo',
      lastService: '2025-01-15',
      nextService: '2025-07-15',
      photoUrls: [],
    },
    {
      companyId: empresa.id,
      siteId: sedeGye.id,
      code: 'AC-002',
      name: 'Aire acondicionado sala de reuniones',
      type: 'Split',
      floor: '1er piso',
      area: 'Sala de reuniones',
      brand: 'Midea',
      model: 'MSA-12CR',
      capacityBtu: '12000',
      refrigerantType: 'R32',
      status: 'Operativo',
      lastService: '2024-11-20',
      nextService: '2025-05-20',
      photoUrls: [],
    },
  ]).returning();
  console.log('✅ company_ac_units');

  // ─────────────────────────────────────────────
  // 19. Servicios AC
  // ─────────────────────────────────────────────
  await db.insert(companyAcServices).values([
    {
      companyId: empresa.id,
      unitId: ac1.id,
      date: '2025-01-15',
      kind: 'Mantenimiento preventivo',
      technician: 'Servicio Técnico LG',
      cost: '85.00',
      findings: 'Limpieza de filtros y evaporador. Sin novedades.',
      photoUrls: [],
    },
    {
      companyId: empresa.id,
      unitId: ac2.id,
      date: '2024-11-20',
      kind: 'Mantenimiento preventivo',
      technician: 'Servicio Técnico Midea',
      cost: '65.00',
      findings: 'Limpieza general. Filtros en buen estado.',
      photoUrls: [],
    },
  ]);
  console.log('✅ company_ac_services');

  // ─────────────────────────────────────────────
  // 20. Refrigerante logs
  // ─────────────────────────────────────────────
  await db.insert(companyAcRefrigerantLogs).values([
    {
      companyId: empresa.id,
      unitId: ac1.id,
      date: '2025-01-15',
      refrigerantType: 'R410A',
      quantity: '0.50',
      unit: 'kg',
      technician: 'Servicio Técnico LG',
      reason: 'Recarga por baja presión detectada en mantenimiento preventivo.',
    },
  ]);
  console.log('✅ company_ac_refrigerant_logs');

  // ─────────────────────────────────────────────
  // 21. Tipos de aceite
  // ─────────────────────────────────────────────
  const [oilType1, oilType2] = await db.insert(companyOilTypes).values([
    {
      companyId: empresa.id,
      name: 'Mobil Delvac 15W-40',
      brand: 'Mobil',
      viscosity: '15W-40',
      application: 'Motor diesel pesado',
      unit: 'gal',
      stock: 20,
      minStock: 8,
    },
    {
      companyId: empresa.id,
      name: 'Castrol GTX 5W-30',
      brand: 'Castrol',
      viscosity: '5W-30',
      application: 'Motor gasolina/diesel liviano',
      unit: 'gal',
      stock: 10,
      minStock: 4,
    },
  ]).returning();
  console.log('✅ company_oil_types');

  // ─────────────────────────────────────────────
  // 22. Cambios de aceite
  // ─────────────────────────────────────────────
  await db.insert(companyOilChanges).values([
    {
      companyId: empresa.id,
      assetId: activo1.id,
      oilTypeId: oilType1.id,
      date: '2025-05-10',
      reading: 154000,
      nextReading: 159000,
      quantity: 3,
      technician: 'Pedro Guzmán',
      notes: 'Cambio rutinario cada 5.000 km',
    },
    {
      companyId: empresa.id,
      assetId: activo2.id,
      oilTypeId: oilType2.id,
      date: '2025-04-20',
      reading: 89000,
      nextReading: 94000,
      quantity: 2,
      technician: 'Pedro Guzmán',
    },
    {
      companyId: empresa.id,
      assetId: activo4.id,
      oilTypeId: oilType1.id,
      date: '2025-03-15',
      reading: 3200,
      nextReading: 3700,
      quantity: 3,
      technician: 'Pedro Guzmán',
      notes: 'Cambio preventivo generador',
    },
  ]);
  console.log('✅ company_oil_changes');

  // ─────────────────────────────────────────────
  // 23. Oil checks IA
  // ─────────────────────────────────────────────
  await db.insert(oilChecks).values([
    {
      companyId: empresa.id,
      assetId: activo1.id,
      technicianId: adminUser.id,
      nivel: 'normal',
      color: 'oscuro',
      confianza: '92%',
      puedeSalir: true,
      observaciones: 'Aceite oscuro pero dentro del rango operativo.',
      accionRecomendada: 'Programar cambio en el próximo mantenimiento.',
    },
    {
      companyId: empresa.id,
      assetId: activo2.id,
      technicianId: operadorUser.id,
      nivel: 'normal',
      color: 'claro',
      confianza: '97%',
      puedeSalir: true,
      observaciones: 'Aceite en buen estado, cambio reciente.',
      accionRecomendada: 'Sin acción requerida.',
    },
  ]);
  console.log('✅ oil_checks');

  // ─────────────────────────────────────────────
  // 24. Seguros
  // ─────────────────────────────────────────────
  await db.insert(companyInsurancePolicies).values([
    {
      companyId: empresa.id,
      assetId: activo1.id,
      insurer: 'Seguros Equinoccial',
      policyNumber: 'POL-2024-00123',
      coverage: 'Todo riesgo + responsabilidad civil',
      startDate: '2024-01-01',
      endDate: '2025-01-01',
      status: 'Vencido',
    },
    {
      companyId: empresa.id,
      assetId: activo1.id,
      insurer: 'Seguros Equinoccial',
      policyNumber: 'POL-2025-00456',
      coverage: 'Todo riesgo + responsabilidad civil',
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      status: 'Vigente',
    },
    {
      companyId: empresa.id,
      assetId: activo2.id,
      insurer: 'Aseguradora del Sur',
      policyNumber: 'POL-2025-00789',
      coverage: 'Todo riesgo',
      startDate: '2025-03-01',
      endDate: '2025-12-15',
      status: 'Por vencer',
    },
    {
      companyId: empresa.id,
      assetId: activo4.id,
      insurer: 'Chubb Ecuador',
      policyNumber: 'POL-2025-01010',
      coverage: 'Equipo electrónico y maquinaria',
      startDate: '2025-01-15',
      endDate: '2026-01-15',
      status: 'Vigente',
    },
  ]);
  console.log('✅ company_insurance_policies');

  // ─────────────────────────────────────────────
  // 25. Asset Notes (notas del cockpit) — NUEVO
  // ─────────────────────────────────────────────
  await db.insert(assetNotes).values([
    {
      companyId: empresa.id,
      assetId: activo1.id,
      authorId: adminUser.id,
      authorName: 'Carlos Mendoza',
      body: 'Revisar el estado del sistema de escape en el próximo ingreso a taller. El conductor reportó ruido inusual en carretera.',
    },
    {
      companyId: empresa.id,
      assetId: activo1.id,
      authorId: operadorUser.id,
      authorName: 'Pedro Guzmán',
      body: 'Se ajustaron los espejos retrovisores y se verificó el buen funcionamiento del sistema de iluminación trasero.',
    },
    {
      companyId: empresa.id,
      assetId: activo2.id,
      authorId: adminUser.id,
      authorName: 'Carlos Mendoza',
      body: 'Pendiente renovación de la póliza de seguro antes del 15 de diciembre de 2025.',
    },
    {
      companyId: empresa.id,
      assetId: activo3.id,
      authorId: adminUser.id,
      authorName: 'Carlos Mendoza',
      body: 'Vehículo en mantenimiento correctivo por falla en sistema de frenos. Estimado de retorno: 26 de mayo de 2025.',
    },
  ]);
  console.log('✅ asset_notes');

  // ─────────────────────────────────────────────
  // 26. Asset Routes (rutas registradas) — NUEVO
  // ─────────────────────────────────────────────
  await db.insert(assetRoutes).values([
    {
      companyId: empresa.id,
      assetId: activo1.id,
      driverId: conductor1.id,
      date: '2025-05-28',
      origin: 'Guayaquil - Sede Principal',
      destination: 'Quito - Centro de Distribución Norte',
      distanceKm: 421.5,
      durationMin: 285,
      coordinates: [
        [-2.1500, -79.8800],
        [-1.8000, -79.5000],
        [-0.9000, -78.7000],
        [-0.1807, -78.4678],
      ],
      notes: 'Ruta sin novedades. Entrega completada a las 14:30.',
    },
    {
      companyId: empresa.id,
      assetId: activo2.id,
      driverId: conductor2.id,
      date: '2025-05-29',
      origin: 'Sede Guayaquil',
      destination: 'Puerto Marítimo Guayaquil',
      distanceKm: 12.3,
      durationMin: 35,
      coordinates: [
        [-2.1894, -79.8891],
        [-2.2300, -79.9000],
        [-2.2761, -79.9000],
      ],
      notes: 'Ruta urbana de carga. Sin novedades.',
    },
    {
      companyId: empresa.id,
      assetId: activo1.id,
      driverId: conductor1.id,
      date: '2025-05-30',
      origin: 'Quito - Centro de Distribución Norte',
      destination: 'Guayaquil - Sede Principal',
      distanceKm: 421.5,
      durationMin: 290,
      coordinates: [
        [-0.1807, -78.4678],
        [-0.9000, -78.7000],
        [-1.8000, -79.5000],
        [-2.1500, -79.8800],
      ],
      notes: 'Retorno a base. Conductor reportó tráfico en Riobamba (+20 min).',
    },
  ]);
  console.log('✅ asset_routes');

  // ─────────────────────────────────────────────
  // 27. Driver Reports — NUEVO
  // ─────────────────────────────────────────────
  await db.insert(companyDriverReports).values([
    {
      companyId: empresa.id,
      driverId: conductor1.id,
      driverName: 'Roberto Villacís',
      fuelLevel: '3/4',
      oilLevel: 'Normal',
      vehicleFaults: 'Ruido leve en sistema de escape. Pendiente revisión en taller.',
      invoices: [
        { description: 'Peaje Riobamba', amount: 2.50, date: '2025-05-28' },
        { description: 'Alimentación en ruta', amount: 8.00, date: '2025-05-28' },
      ],
      fileUrls: [],
    },
    {
      companyId: empresa.id,
      driverId: conductor2.id,
      driverName: 'María Cevallos',
      fuelLevel: '1/4',
      oilLevel: 'Normal',
      vehicleFaults: null,
      invoices: [
        { description: 'Parqueadero Puerto', amount: 3.00, date: '2025-05-29' },
      ],
      fileUrls: [],
    },
    {
      companyId: empresa.id,
      driverId: conductor3.id,
      driverName: 'Jorge Naranjo',
      fuelLevel: '1/2',
      oilLevel: 'Bajo',
      vehicleFaults: 'Nivel de aceite bajo. Se agregó 1 litro preventivamente.',
      invoices: [],
      fileUrls: [],
    },
  ]);
  console.log('✅ company_driver_reports');

  // ─────────────────────────────────────────────
  // 28. Auditoría empresa
  // ─────────────────────────────────────────────
  await db.insert(companyAuditEntries).values([
    {
      companyId: empresa.id,
      entity: 'asset',
      entityId: String(activo1.id),
      action: 'create',
      actorId: adminUser.id,
      actorName: 'Carlos Mendoza',
      description: 'Activo VH-001 creado',
      metadata: { code: 'VH-001' },
    },
    {
      companyId: empresa.id,
      entity: 'asset',
      entityId: String(activo2.id),
      action: 'create',
      actorId: adminUser.id,
      actorName: 'Carlos Mendoza',
      description: 'Activo VH-002 creado',
      metadata: { code: 'VH-002' },
    },
    {
      companyId: empresa.id,
      entity: 'driver',
      entityId: String(conductor1.id),
      action: 'create',
      actorId: adminUser.id,
      actorName: 'Carlos Mendoza',
      description: 'Conductor DRV-001 registrado',
      metadata: { code: 'DRV-001' },
    },
    {
      companyId: empresa.id,
      entity: 'assignment',
      entityId: String(asign1.id),
      action: 'create',
      actorId: adminUser.id,
      actorName: 'Carlos Mendoza',
      description: 'Asignación VH-001 → Roberto Villacís creada',
      metadata: { actaNumber: 'ACTA-2024-001' },
    },
  ]);
  console.log('✅ company_audit_entries');

  // ─────────────────────────────────────────────
  // 29. Lead demo
  // ─────────────────────────────────────────────
  await db.insert(platformLeads).values([
    {
      companyName: 'Logística del Pacífico S.A.',
      contactName: 'Andrés Moreira',
      contactEmail: 'amoreira@logpac.com',
      contactPhone: '+593 99 888 7766',
      industry: 'logística',
      country: 'Ecuador',
      city: 'Guayaquil',
      status: 'demo_agendada',
      source: 'web',
      assignedTo: superAdmin.id,
      estimatedValue: '1200.00',
    },
    {
      companyName: 'Constructora Andina Cía. Ltda.',
      contactName: 'Verónica Salazar',
      contactEmail: 'vsalazar@constructoraandina.com',
      contactPhone: '+593 98 111 2233',
      industry: 'construcción',
      country: 'Ecuador',
      city: 'Cuenca',
      status: 'contactado',
      source: 'referido',
      assignedTo: superAdmin.id,
      estimatedValue: '2500.00',
      notes: 'Interesada en módulo de maquinaria pesada.',
    },
  ]);
  console.log('✅ platform_leads');

  // ─────────────────────────────────────────────
  // 30. Facturas demo
  // ─────────────────────────────────────────────
  await db.insert(platformInvoices).values([
    {
      companyId: empresa.id,
      planId: 'pro',
      invoiceNumber: 'INV-2025-0001',
      status: 'paid',
      cycle: 'monthly',
      amount: '99.00',
      tax: '11.88',
      total: '110.88',
      issuedAt: '2025-04-01',
      dueAt: '2025-04-10',
      paidAt: '2025-04-05',
    },
    {
      companyId: empresa.id,
      planId: 'pro',
      invoiceNumber: 'INV-2025-0002',
      status: 'paid',
      cycle: 'monthly',
      amount: '99.00',
      tax: '11.88',
      total: '110.88',
      issuedAt: '2025-05-01',
      dueAt: '2025-05-10',
      paidAt: '2025-05-05',
    },
    {
      companyId: empresa.id,
      planId: 'pro',
      invoiceNumber: 'INV-2025-0003',
      status: 'sent',
      cycle: 'monthly',
      amount: '99.00',
      tax: '11.88',
      total: '110.88',
      issuedAt: '2025-06-01',
      dueAt: '2025-06-10',
    },
  ]);
  console.log('✅ platform_invoices');

  // ─────────────────────────────────────────────
  // 31. Tickets de soporte
  // ─────────────────────────────────────────────
  const [ticket1, ticket2] = await db.insert(platformTickets).values([
    {
      companyId: empresa.id,
      createdBy: adminUser.id,
      assignedTo: superAdmin.id,
      ticketNumber: 'TKT-2025-0001',
      title: 'Error al exportar reporte de combustible',
      description: 'Al intentar exportar el reporte mensual de combustible en PDF, el sistema arroja un error 500.',
      status: 'in_progress',
      priority: 'high',
      category: 'bug',
    },
    {
      companyId: empresa.id,
      createdBy: ownerUser.id,
      assignedTo: superAdmin.id,
      ticketNumber: 'TKT-2025-0002',
      title: 'Consulta sobre módulo de telemática GPS',
      description: '¿El plan Pro incluye actualización de GPS en tiempo real o es un módulo adicional?',
      status: 'open',
      priority: 'medium',
      category: 'consulta',
    },
  ]).returning();
  console.log('✅ platform_tickets');

  await db.insert(platformTicketMessages).values([
    {
      ticketId: ticket1.id,
      authorCompanyUserId: adminUser.id,
      authorName: 'Carlos Mendoza',
      authorRole: 'company',
      body: 'Buenos días, el error ocurre específicamente cuando el rango de fechas supera los 3 meses. El resto funciona bien.',
    },
    {
      ticketId: ticket1.id,
      authorPlatformUserId: superAdmin.id,
      authorName: 'Admin ApliSmart',
      authorRole: 'platform',
      body: 'Gracias por el detalle. Reproducimos el error. Será resuelto en el próximo deploy (estimado 24-48h).',
    },
    {
      ticketId: ticket2.id,
      authorCompanyUserId: ownerUser.id,
      authorName: 'Ana Torres',
      authorRole: 'company',
      body: 'Necesitamos saber si podemos activar el rastreo GPS sin cambiar de plan.',
    },
    {
      ticketId: ticket2.id,
      authorPlatformUserId: superAdmin.id,
      authorName: 'Admin ApliSmart',
      authorRole: 'platform',
      body: 'Hola Ana, el módulo GPS en tiempo real está incluido en el plan Pro. Los campos ya están activos en su cuenta. Le envío la guía de activación.',
    },
  ]);
  console.log('✅ platform_ticket_messages');

  // ─────────────────────────────────────────────
  // 32. Auditoría plataforma
  // ─────────────────────────────────────────────
  await db.insert(platformAuditEntries).values([
    {
      actorId: superAdmin.id,
      actorEmail: 'admin@aplismart.io',
      action: 'company.created',
      entity: 'company',
      entityId: String(empresa.id),
      description: 'Empresa Transportes Ecuavial S.A. creada',
      metadata: { slug: 'ecuavial', planId: 'pro' },
    },
    {
      actorId: superAdmin.id,
      actorEmail: 'admin@aplismart.io',
      action: 'plan.assigned',
      entity: 'company',
      entityId: String(empresa.id),
      description: 'Plan Pro asignado a Transportes Ecuavial S.A.',
      metadata: { planId: 'pro', cycle: 'monthly' },
    },
  ]);
  console.log('✅ platform_audit_entries');

  // ─────────────────────────────────────────────
  // Resumen
  // ─────────────────────────────────────────────
  console.log('\n🎉 Seed completado exitosamente!');
  console.log('\n📋 Tablas pobladas:');
  console.log('  Platform:    platform_settings, platform_plans, platform_users');
  console.log('               platform_leads, platform_invoices, platform_tickets');
  console.log('               platform_ticket_messages, platform_audit_entries');
  console.log('  Operational: companies, company_settings, company_sites, company_garages');
  console.log('               company_assets (con GPS/telemática), company_drivers');
  console.log('               company_assignments (con acta de entrega), company_maintenances');
  console.log('               company_fuel_entries, company_alerts');
  console.log('               company_checklist_categories, company_checklists');
  console.log('               company_inventory, company_ac_units, company_ac_services');
  console.log('               company_ac_refrigerant_logs, company_oil_types, company_oil_changes');
  console.log('               oil_checks, company_insurance_policies, company_audit_entries');
  console.log('  Nuevas:      asset_notes, asset_routes, company_driver_reports ✨');
  console.log('\n📋 Credenciales de acceso:');
  console.log('  SuperAdmin   → admin@aplismart.io      / Admin123!');
  console.log('  Admin emp.   → admin@ecuavial.com      / Admin123!');
  console.log('  Owner emp.   → owner@ecuavial.com      / Owner123!');
  console.log('  Operador     → operador@ecuavial.com   / Operador123!');

  await client.end();
}

main().catch((err) => {
  console.error('❌ Error en seed:', err);
});