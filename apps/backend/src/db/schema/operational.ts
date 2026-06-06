
import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  boolean,
  date,
  numeric,
  jsonb,
  timestamp,
  unique,
  integer,
  doublePrecision,
} from 'drizzle-orm/pg-core';
import { companies, companyUsers } from './platform';

// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

export const assetTypeEnum = pgEnum('asset_type_enum', [
  'Vehiculo',
  'Motor',
  'Maquinaria',
  'Planta electrica',
]);

export const assetCategoryEnum = pgEnum('asset_category_enum', [
  'Camion',
  'Camioneta',
  'SUV',
  'Furgon',
  'Furgoneta',
  'Bus',
  'Volqueta',
]);

export const assetStatusEnum = pgEnum('asset_status_enum', [
  'Operativo',
  'En mantenimiento',
  'Fuera de servicio',
]);

export const assetFuelTypeEnum = pgEnum('asset_fuel_type_enum', [
  'Diesel',
  'Gasolina',
  'Electrico',
  'Hibrido',
]);

export const assetAvailabilityEnum = pgEnum('asset_availability_enum', [
  'Disponible',
  'En ruta',
  'No disponible',
]);

// ─────────────────────────────────────────────
// Configuración por empresa
// ─────────────────────────────────────────────

export const companySettings = pgTable('company_settings', {
  companyId: serial('company_id')
    .primaryKey()
    .references(() => companies.id, { onDelete: 'cascade' }),
  maintenanceLeadTimeDays: integer('maintenance_lead_time_days').default(7),
  checklistRequired: boolean('checklist_required').default(true),
  fuelCurrency: varchar('fuel_currency', { length: 10 }).default('USD'),
  alertEmail: varchar('alert_email', { length: 160 }),
  alertConfigs: jsonb('alert_configs').default([]),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// Sedes
// ─────────────────────────────────────────────

export const companySites = pgTable(
  'company_sites',
  {
    id: serial('id').primaryKey(),
    companyId: serial('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    city: varchar('city', { length: 120 }),
    address: text('address'),
    contact: varchar('contact', { length: 160 }),
    status: varchar('status', { length: 40 }).default('Activa'),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('company_sites_company_id_code').on(table.companyId, table.code)]
);

// ─────────────────────────────────────────────
// Activos  (EXTENDIDO con telemática + GPS)
// ─────────────────────────────────────────────

export const companyAssets = pgTable(
  'company_assets',
  {
    id: serial('id').primaryKey(),
    companyId: serial('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    siteId: integer('site_id').references(() => companySites.id, { onDelete: 'set null' }),
    garageId: integer('garage_id').references(() => companyGarages.id, { onDelete: 'set null' }),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    assetType: assetTypeEnum('asset_type'),
    category: assetCategoryEnum('category'),
    status: assetStatusEnum('status').default('Operativo'),
    responsible: varchar('responsible', { length: 160 }),
    brand: varchar('brand', { length: 120 }),
    model: varchar('model', { length: 120 }),
    serial: varchar('serial', { length: 120 }),
    plate: varchar('plate', { length: 40 }),
    year: varchar('year', { length: 10 }),
    color: varchar('color', { length: 60 }),
    maxLoad: varchar('max_load', { length: 40 }),
    fuelType: assetFuelTypeEnum('fuel_type'),
    oilType: varchar('oil_type', { length: 80 }),
    oilCapacity: varchar('oil_capacity', { length: 40 }),
    location: varchar('location', { length: 160 }),
    availability: assetAvailabilityEnum('availability'),
    observations: text('observations'),
    photoUrls: text('photo_urls').array().default([]),

    // ── NUEVO: telemática ────────────────────
    engineOn: boolean('engine_on').default(false),
    locked: boolean('locked').default(false),

    // ── NUEVO: GPS en tiempo real ─────────────
    lastLat: doublePrecision('last_lat'),
    lastLng: doublePrecision('last_lng'),
    lastGpsAt: timestamp('last_gps_at'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('company_assets_company_id_code').on(table.companyId, table.code)]
);

// ─────────────────────────────────────────────
// Conductores
// ─────────────────────────────────────────────

export const companyDrivers = pgTable(
  'company_drivers',
  {
    id: serial('id').primaryKey(),
    companyId: serial('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    siteId: integer('site_id').references(() => companySites.id, { onDelete: 'set null' }),
    userId: integer('user_id').references(() => companyUsers.id, { onDelete: 'set null' }),
    code: varchar('code', { length: 40 }).notNull(),
    firstName: varchar('first_name', { length: 80 }).notNull(),
    lastName: varchar('last_name', { length: 80 }).notNull(),
    email: varchar('email', { length: 160 }),
    phone: varchar('phone', { length: 40 }),
    licenseNumber: varchar('license_number', { length: 80 }),
    licenseType: varchar('license_type', { length: 40 }),
    licenseExpiry: date('license_expiry'),
    licensePoints: integer('license_points').default(0),
    status: varchar('status', { length: 40 }).default('Activo'),
    notes: text('notes'),
    photoUrl: text('photo_url'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('company_drivers_company_id_code').on(table.companyId, table.code)]
);

// ─────────────────────────────────────────────
// Asignaciones
// ─────────────────────────────────────────────

export const companyAssignments = pgTable(
  'company_assignments',
  {
    id: serial('id').primaryKey(),
    companyId: serial('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    assetId: serial('asset_id')
      .notNull()
      .references(() => companyAssets.id, { onDelete: 'cascade' }),
    driverId: serial('driver_id')
      .notNull()
      .references(() => companyDrivers.id, { onDelete: 'cascade' }),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    status: varchar('status', { length: 40 }).default('Activa'),
    notes: text('notes'),
    handoverUrl: text('handover_url'),

    // ── Acta de entrega ──────────────────────
    actaNumber:       varchar('acta_number',       { length: 40 }),
    actaDate:         date('acta_date'),
    actaTime:         varchar('acta_time',         { length: 10 }),
    actaPlace:        varchar('acta_place',        { length: 160 }),
    actaArea:         varchar('acta_area',         { length: 120 }),

    // ── Conductor al momento del acta ────────
    driverDni:        varchar('driver_dni',        { length: 40 }),
    driverPhone:      varchar('driver_phone',      { length: 40 }),
    driverRole:       varchar('driver_role',       { length: 120 }),

    // ── Estado del vehículo ──────────────────
    vehicleOdometer:  varchar('vehicle_odometer',  { length: 40 }),
    vehicleFuelLevel: varchar('vehicle_fuel_level',{ length: 40 }),
    vehicleCondition: varchar('vehicle_condition', { length: 80 }),

    // ── Checklists ───────────────────────────
    novedades:        jsonb('novedades').default({}),
    accesorios:       jsonb('accesorios').default({}),
    novedadesText:    text('novedades_text'),

    // ── Firmas ───────────────────────────────
    signatureLogUrl:  text('signature_log_url'),
    signatureRespUrl: text('signature_resp_url'),

    // ── Fotos del vehículo ───────────────────
    vehiclePhotoUrls: text('vehicle_photo_urls').array().default([]),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  }
);

// ─────────────────────────────────────────────
// Mantenimientos
// ─────────────────────────────────────────────

export const companyMaintenances = pgTable(
  'company_maintenances',
  {
    id: serial('id').primaryKey(),
    companyId: serial('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    assetId: serial('asset_id')
      .notNull()
      .references(() => companyAssets.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    kind: varchar('kind', { length: 40 }),
    priority: varchar('priority', { length: 40 }),
    status: varchar('status', { length: 40 }).default('Pendiente'),
    scheduledDate: date('scheduled_date'),
    dueDate: date('due_date'),
    completedDate: date('completed_date'),
    technician: varchar('technician', { length: 160 }),
    cost: numeric('cost', { precision: 12, scale: 2 }),
    laborCost: numeric('labor_cost', { precision: 12, scale: 2 }),
    partsCost: numeric('parts_cost', { precision: 12, scale: 2 }),
    photoUrls: text('photo_urls').array().default([]),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  }
);

// ─────────────────────────────────────────────
// Combustible
// ─────────────────────────────────────────────

export const companyFuelEntries = pgTable('company_fuel_entries', {
  id: serial('id').primaryKey(),
  companyId: serial('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: serial('asset_id')
    .notNull()
    .references(() => companyAssets.id, { onDelete: 'cascade' }),
  driverId: integer('driver_id').references(() => companyDrivers.id, { onDelete: 'set null' }),
  date: date('date').notNull(),
  liters: numeric('liters', { precision: 10, scale: 2 }).notNull(),
  cost: numeric('cost', { precision: 10, scale: 2 }),
  odometer: numeric('odometer', { precision: 12, scale: 2 }),
  station: varchar('station', { length: 160 }),
  fuelType: varchar('fuel_type', { length: 40 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// Alertas
// ─────────────────────────────────────────────

export const companyAlerts = pgTable('company_alerts', {
  id: serial('id').primaryKey(),
  companyId: serial('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: integer('asset_id').references(() => companyAssets.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 160 }).notNull(),
  type: varchar('type', { length: 80 }),
  severity: varchar('severity', { length: 20 }),
  status: varchar('status', { length: 40 }).default('Abierta'),
  dueDate: date('due_date'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// Checklist categorías
// ─────────────────────────────────────────────

export const companyChecklistCategories = pgTable(
  'company_checklist_categories',
  {
    id: serial('id').primaryKey(),
    companyId: serial('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    items: text('items').array().default([]),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  }
);

// ─────────────────────────────────────────────
// Checklists
// ─────────────────────────────────────────────

export const companyChecklists = pgTable('company_checklists', {
  id: serial('id').primaryKey(),
  companyId: serial('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  categoryId: integer('category_id').references(() => companyChecklistCategories.id, { onDelete: 'set null' }),
  assetId: integer('asset_id').references(() => companyAssets.id, { onDelete: 'set null' }),
  driverId: integer('driver_id').references(() => companyDrivers.id, { onDelete: 'set null' }),
  inspectorId: integer('inspector_id').references(() => companyUsers.id, { onDelete: 'set null' }),
  targetKind: varchar('target_kind', { length: 40 }),
  targetLabel: varchar('target_label', { length: 160 }),
  date: date('date').notNull(),
  status: varchar('status', { length: 40 }).default('Pendiente'),
  summary: text('summary'),
  findings: text('findings'),
  items: jsonb('items').default([]),
  photoUrls: text('photo_urls').array().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// Inventario
// ─────────────────────────────────────────────

export const companyInventory = pgTable(
  'company_inventory',
  {
    id: serial('id').primaryKey(),
    companyId: serial('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 80 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    category: varchar('category', { length: 80 }),
    stock: numeric('stock', { precision: 12, scale: 2 }),
    minStock: numeric('min_stock', { precision: 12, scale: 2 }),
    location: varchar('location', { length: 160 }),
    unit: varchar('unit', { length: 40 }),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('company_inventory_company_id_code').on(table.companyId, table.code)]
);

// ─────────────────────────────────────────────
// Garajes
// ─────────────────────────────────────────────

export const companyGarages = pgTable(
  'company_garages',
  {
    id: serial('id').primaryKey(),
    companyId: serial('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    location: varchar('location', { length: 160 }),
    capacity: integer('capacity'),
    supervisor: varchar('supervisor', { length: 160 }),
    status: varchar('status', { length: 40 }),
    notes: text('notes'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('company_garages_company_id_code').on(table.companyId, table.code)]
);

// ─────────────────────────────────────────────
// Unidades AC
// ─────────────────────────────────────────────

export const companyAcUnits = pgTable(
  'company_ac_units',
  {
    id: serial('id').primaryKey(),
    companyId: serial('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    siteId: integer('site_id').references(() => companySites.id, { onDelete: 'set null' }),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    type: varchar('type', { length: 60 }),
    floor: varchar('floor', { length: 40 }),
    area: varchar('area', { length: 80 }),
    serial: varchar('serial', { length: 120 }),
    brand: varchar('brand', { length: 120 }),
    model: varchar('model', { length: 120 }),
    capacityBtu: varchar('capacity_btu', { length: 40 }),
    voltage: varchar('voltage', { length: 40 }),
    amperage: varchar('amperage', { length: 40 }),
    refrigerantType: varchar('refrigerant_type', { length: 40 }),
    installDate: date('install_date'),
    technician: varchar('technician', { length: 160 }),
    status: varchar('status', { length: 60 }),
    lastService: date('last_service'),
    nextService: date('next_service'),
    photoUrls: text('photo_urls').array().default([]),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('company_ac_units_company_id_code').on(table.companyId, table.code)]
);

export const companyAcServices = pgTable('company_ac_services', {
  id: serial('id').primaryKey(),
  companyId: serial('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  unitId: serial('unit_id')
    .notNull()
    .references(() => companyAcUnits.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  kind: varchar('kind', { length: 60 }),
  technician: varchar('technician', { length: 160 }),
  cost: numeric('cost', { precision: 10, scale: 2 }),
  findings: text('findings'),
  photoUrls: text('photo_urls').array().default([]),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const companyAcRefrigerantLogs = pgTable('company_ac_refrigerant_logs', {
  id: serial('id').primaryKey(),
  companyId: serial('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  unitId: serial('unit_id')
    .notNull()
    .references(() => companyAcUnits.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  refrigerantType: varchar('refrigerant_type', { length: 60 }),
  quantity: numeric('quantity', { precision: 8, scale: 2 }),
  unit: varchar('unit', { length: 10 }),
  technician: varchar('technician', { length: 160 }),
  reason: text('reason'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// Auditoría
// ─────────────────────────────────────────────

export const companyAuditEntries = pgTable('company_audit_entries', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  entity: varchar('entity', { length: 80 }).notNull(),
  entityId: varchar('entity_id', { length: 80 }),
  action: varchar('action', { length: 40 }).notNull(),
  actorId: integer('actor_id'),
  actorName: varchar('actor_name', { length: 160 }),
  description: text('description'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// Oil checks IA
// ─────────────────────────────────────────────

export const oilChecks = pgTable('oil_checks', {
  id: serial('id').primaryKey(),
  companyId: serial('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: integer('asset_id').references(() => companyAssets.id, { onDelete: 'set null' }),
  technicianId: integer('technician_id').references(() => companyUsers.id, { onDelete: 'set null' }),
  nivel: varchar('nivel', { length: 20 }),
  color: varchar('color', { length: 20 }),
  confianza: varchar('confianza', { length: 10 }),
  puedeSalir: boolean('puede_salir').default(false),
  observaciones: text('observaciones'),
  accionRecomendada: text('accion_recomendada'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const companyOilTypes = pgTable(
  'company_oil_types',
  {
    id: serial('id').primaryKey(),
    companyId: serial('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    brand: varchar('brand', { length: 120 }),
    viscosity: varchar('viscosity', { length: 40 }),
    application: varchar('application', { length: 120 }),
    unit: varchar('unit', { length: 20 }).default('gal'),
    stock: integer('stock').default(0),
    minStock: integer('min_stock').default(0),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('company_oil_types_company_id_name').on(table.companyId, table.name),
  ]
);

export const companyOilChanges = pgTable('company_oil_changes', {
  id: serial('id').primaryKey(),
  companyId: serial('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: serial('asset_id')
    .notNull()
    .references(() => companyAssets.id, { onDelete: 'cascade' }),
  oilTypeId: serial('oil_type_id')
    .notNull()
    .references(() => companyOilTypes.id, { onDelete: 'restrict' }),
  date: varchar('date', { length: 10 }).notNull(),
  reading: integer('reading').notNull(),
  nextReading: integer('next_reading').notNull(),
  quantity: integer('quantity').notNull(),
  technician: varchar('technician', { length: 160 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// Seguros
// ─────────────────────────────────────────────

export const companyInsurancePolicies = pgTable('company_insurance_policies', {
  id: serial('id').primaryKey(),
  companyId: serial('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: integer('asset_id')
    .notNull()
    .references(() => companyAssets.id, { onDelete: 'cascade' }),
  insurer: varchar('insurer', { length: 160 }).notNull(),
  policyNumber: varchar('policy_number', { length: 120 }).notNull(),
  coverage: varchar('coverage', { length: 255 }),
  startDate: date('start_date').notNull(),
  endDate:   date('end_date').notNull(),
  status: varchar('status', { length: 40 }).default('Vigente'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ═════════════════════════════════════════════
// NUEVO — asset_notes  (notas del cockpit)
// ═════════════════════════════════════════════

export const assetNotes = pgTable('asset_notes', {
  id:        serial('id').primaryKey(),
  companyId: integer('company_id')
               .notNull()
               .references(() => companies.id, { onDelete: 'cascade' }),
  assetId:   integer('asset_id')
               .notNull()
               .references(() => companyAssets.id, { onDelete: 'cascade' }),
  authorId:  integer('author_id')
               .references(() => companyUsers.id, { onDelete: 'set null' }),
  authorName: varchar('author_name', { length: 160 }),
  body:      text('body').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ═════════════════════════════════════════════
// NUEVO — asset_routes  (rutas registradas)
// ═════════════════════════════════════════════

export const assetRoutes = pgTable('asset_routes', {
  id:           serial('id').primaryKey(),
  companyId:    integer('company_id')
                  .notNull()
                  .references(() => companies.id, { onDelete: 'cascade' }),
  assetId:      integer('asset_id')
                  .notNull()
                  .references(() => companyAssets.id, { onDelete: 'cascade' }),
  driverId:     integer('driver_id')
                  .references(() => companyDrivers.id, { onDelete: 'set null' }),
  date:         date('date').notNull(),
  origin:       varchar('origin', { length: 255 }),
  destination:  varchar('destination', { length: 255 }),
  distanceKm:   doublePrecision('distance_km'),
  durationMin:  integer('duration_min'),
  // GeoJSON LineString o array de [lat, lng] serializado
  coordinates:  jsonb('coordinates').default([]),
  notes:        text('notes'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
});

export const companyDriverReports = pgTable('company_driver_reports', {
  id:            serial('id').primaryKey(),
  companyId:     serial('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  driverId:      serial('driver_id').notNull().references(() => companyDrivers.id, { onDelete: 'cascade' }),
  driverName:    varchar('driver_name', { length: 160 }),
  fuelLevel:     varchar('fuel_level', { length: 20 }),
  oilLevel:      varchar('oil_level', { length: 20 }),
  vehicleFaults: text('vehicle_faults'),
  invoices:      jsonb('invoices').default([]),
  fileUrls:      text('file_urls').array().default([]),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
});