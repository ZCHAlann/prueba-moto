
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
    userId: integer('user_id').references(() => companyUsers.id, { onDelete: 'cascade' }),
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
  });

// ── Proveedores ───────────────────────────────────────────────────────────────
export const companySuppliers = pgTable('company_suppliers', {
  id:           serial('id').primaryKey(),
  companyId:    integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name:         varchar('name', { length: 120 }).notNull(),
  contactName:  varchar('contact_name', { length: 120 }),
  phone:        varchar('phone', { length: 40 }),
  email:        varchar('email', { length: 180 }),
  nit:          varchar('nit', { length: 40 }),
  notes:        text('notes'),
  address:      text('address'),
  latitude:     doublePrecision('latitude'),
  longitude:    doublePrecision('longitude'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
});

// ── Asignaciones de vehículo → conductor ─────────────────────────────────────
// Declaración reconstruida desde el snapshot 0001 (la tabla existe en BD desde
// la migración inicial; solo faltaba la declaración TS).
export const companyAssignments = pgTable('company_assignments', {
  id:               serial('id').primaryKey(),
  companyId:        integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  assetId:          integer('asset_id').notNull().references(() => companyAssets.id, { onDelete: 'cascade' }),
  driverId:         integer('driver_id').notNull().references(() => companyDrivers.id, { onDelete: 'cascade' }),
  startDate:        date('start_date').notNull(),
  endDate:          date('end_date'),
  status:           varchar('status', { length: 40 }).default('Activa'),
  notes:            text('notes'),
  handoverUrl:      text('handover_url'),
  actaNumber:       varchar('acta_number', { length: 40 }),
  actaDate:         date('acta_date'),
  actaTime:         varchar('acta_time', { length: 10 }),
  actaPlace:        varchar('acta_place', { length: 160 }),
  actaArea:         varchar('acta_area', { length: 120 }),
  driverDni:        varchar('driver_dni', { length: 40 }),
  driverPhone:      varchar('driver_phone', { length: 40 }),
  driverRole:       varchar('driver_role', { length: 120 }),
  vehicleOdometer:  varchar('vehicle_odometer', { length: 40 }),
  vehicleFuelLevel: varchar('vehicle_fuel_level', { length: 40 }),
  vehicleCondition: varchar('vehicle_condition', { length: 80 }),
  novedades:        jsonb('novedades').default({}),
  accesorios:       jsonb('accesorios').default({}),
  novedadesText:    text('novedades_text'),
  signatureLogUrl:  text('signature_log_url'),
  signatureRespUrl: text('signature_resp_url'),
  vehiclePhotoUrls: text('vehicle_photo_urls').array().default([]),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
});

// ── Talleres (módulo "gestion" — compartido) ────────────────────────────────
export const companyWorkshops = pgTable('company_workshops', {
  id:           serial('id').primaryKey(),
  companyId:    integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name:         varchar('name', { length: 120 }).notNull(),
  address:      text('address'),
  phone:        varchar('phone', { length: 40 }),
  contactName:  varchar('contact_name', { length: 120 }),
  nit:          varchar('nit', { length: 40 }),
  notes:        text('notes'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
});

// ── Lecturas de odómetro ─────────────────────────────────────────────────────
export const companyOdometerReadings = pgTable('company_odometer_readings', {
  id:         serial('id').primaryKey(),
  companyId:  integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  assetId:    integer('asset_id').notNull().references(() => companyAssets.id, { onDelete: 'cascade' }),
  km:         integer('km').notNull(),
  takenAt:    timestamp('taken_at').notNull().defaultNow(),
  source:     varchar('source', { length: 20 }).notNull().default('manual'),
  notes:      text('notes'),
  createdBy:  integer('created_by').references(() => companyUsers.id, { onDelete: 'set null' }),
});

// ── Mantenimientos ───────────────────────────────────────────────────────────
//
// Enums del módulo de mantenimiento. Alinear los valores con la BD actual:
//   - 0006 creó maintenance_type_enum = ('Preventivo', 'Correctivo', 'Programado')
//     y maintenance_status_enum = ('Programado','En curso','PendienteAtencion','Completado','Cancelado')
//   - 0009 quitó 'Preventivo' del type enum → ('Correctivo', 'Programado')
//   - 0010 agregó 'Lavada' al type enum → ('Correctivo', 'Programado', 'Lavada')
//   - 0006 creó maintenance_category_enum y maintenance_cadence_enum (sin cambios posteriores).
//
// Si en el futuro agregas/quitás valores, mantené estos pgEnum sincronizados
// con la BD — pgEnum NO valida en TS, pero el insert fallará en runtime.

export const maintenanceTypeEnum = pgEnum('maintenance_type_enum', [
  'Correctivo',
  'Programado',
  'Lavada',
]);

export const maintenanceStatusEnum = pgEnum('maintenance_status_enum', [
  'Programado',
  'En curso',
  'PendienteAtencion',
  'Completado',
  'Cancelado',
  'Correccion',
]);

export const maintenanceCategoryEnum = pgEnum('maintenance_category_enum', [
  'Primordial:Bombas',
  'Primordial:Motores',
  'Aceite:Cambio',
  'Aceite:Inventario',
  'Otro',
]);

export const maintenanceCadenceEnum = pgEnum('maintenance_cadence_enum', [
  'none',
  'weekly',
  'days',
  'monthly',
  'km_based',
]);

export const notificationKindEnum = pgEnum('notification_kind_enum', [
  'maintenance_due',
  'maintenance_scheduled',
  'maintenance_completed',
  'maintenance_overshoot_km',
  'workshop_assigned',
  'supplier_invoice',
  'system',
]);

export const devicePlatformEnum = pgEnum('device_platform_enum', [
  'android',
  'ios',
  'web',
]);

export const companyMaintenanceRecords = pgTable('company_maintenance_records', {
  id:              serial('id').primaryKey(),
  companyId:       integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  assetId:         integer('asset_id').notNull().references(() => companyAssets.id, { onDelete: 'cascade' }),
  workshopId:      integer('workshop_id').references(() => companyWorkshops.id, { onDelete: 'set null' }),
  type:            maintenanceTypeEnum('type').notNull().default('Programado'),
  status:          maintenanceStatusEnum('status').notNull().default('Programado'),
  category:        maintenanceCategoryEnum('category').notNull().default('Otro'),
  title:           varchar('title', { length: 200 }),
  description:     text('description'),
  odometerKm:      integer('odometer_km'),
  cadenceKind:     maintenanceCadenceEnum('cadence_kind').notNull().default('none'),
  cadenceValue:    integer('cadence_value'),
  nextTriggerKm:   integer('next_trigger_km'),
  scheduledFor:    timestamp('scheduled_for').notNull(),
  executedAt:      timestamp('executed_at'),
  completedAt:     timestamp('completed_at'),
  notes:           text('notes'),
  totalCost:       numeric('total_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  // v3.1: mano de obra separada de los repuestos
  laborCost:       numeric('labor_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  // v3.1: campos específicos de Lavada (cuando type='Lavada')
  carwashLocation: varchar('carwash_location', { length: 200 }),
  carwashProvider: varchar('carwash_provider', { length: 200 }),
  carwashNotes:    text('carwash_notes'),
  // Costo explícito del servicio de lavada. El admin lo digita en el modal
  // y se persiste acá (separado de totalCost que también queda reflejado).
  carwashTotal:    numeric('carwash_total', { precision: 12, scale: 2 }).notNull().default('0'),
  // Adjuntos (facturas, fotos de evidencia, etc.) subidos durante
  // la ejecución del mantenimiento. Array jsonb:
  //   [{ url: string, label: string, uploadedAt: string }]
  attachments:     jsonb('attachments').notNull().default([]),
  parentId:        integer('parent_id'),
  createdBy:       integer('created_by').references(() => companyUsers.id, { onDelete: 'set null' }),
  completedBy:     integer('completed_by').references(() => companyUsers.id, { onDelete: 'set null' }),
  // v3: asignación, eventos, reprogramación
  assignedUserId:  integer('assigned_user_id').references(() => companyUsers.id, { onDelete: 'set null' }),
  takenAt:         timestamp('taken_at'),
  isReprogrammed:  boolean('is_reprogrammed').notNull().default(false),
  reprogramReason: text('reprogram_reason'),
  reprogrammedAt:  timestamp('reprogrammed_at'),
  reprogramCount:  integer('reprogram_count').notNull().default(0),
  correctionReason:    text('correction_reason'),
  correctionRequestedAt: timestamp('correction_requested_at'),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
});

// ── Eventos de mantenimiento (timeline) ───────────────────────────────────────
export const companyMaintenanceEvents = pgTable('company_maintenance_events', {
  id:             serial('id').primaryKey(),
  companyId:      integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  maintenanceId:  integer('maintenance_id').notNull().references(() => companyMaintenanceRecords.id, { onDelete: 'cascade' }),
  // Tipos de evento: created, assigned, reassigned, taken, item_added, note_added,
  // photo_uploaded, cancelled, finalized, viewed
  kind:           varchar('kind', { length: 40 }).notNull(),
  actorUserId:    integer('actor_user_id').references(() => companyUsers.id, { onDelete: 'set null' }),
  actorName:      varchar('actor_name', { length: 160 }),
  payload:        jsonb('payload').notNull().default({}),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
});

// ── Categorías de mantenimiento por empresa (custom) ─────────────────────────
export const companyMaintenanceCategories = pgTable('company_maintenance_categories', {
  id:          serial('id').primaryKey(),
  companyId:   integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  key:         varchar('key', { length: 60 }).notNull(),
  label:       varchar('label', { length: 120 }).notNull(),
  shortLabel:  varchar('short_label', { length: 40 }),
  color:       varchar('color', { length: 20 }).notNull().default('sky'),
  icon:        varchar('icon', { length: 40 }).notNull().default('wrench'),
  isSystem:    boolean('is_system').notNull().default(false),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
});

// ── Items / repuestos ────────────────────────────────────────────────────────
export const companyMaintenanceItems = pgTable('company_maintenance_items', {
  id:             serial('id').primaryKey(),
  maintenanceId:  integer('maintenance_id').notNull().references(() => companyMaintenanceRecords.id, { onDelete: 'cascade' }),
  supplierId:     integer('supplier_id').references(() => companySuppliers.id, { onDelete: 'set null' }),
  name:           varchar('name', { length: 180 }).notNull(),
  photoUrl:       text('photo_url'),
  quantity:       numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
  unitCost:       numeric('unit_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  subtotal:       numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
});

// ── Adicionales de Lavada (items extra que el operador agrega al servicio) ───
export const companyMaintenanceCarwashExtras = pgTable('company_maintenance_carwash_extras', {
  id:             serial('id').primaryKey(),
  maintenanceId:  integer('maintenance_id').notNull().references(() => companyMaintenanceRecords.id, { onDelete: 'cascade' }),
  name:           varchar('name', { length: 180 }).notNull(),
  quantity:       numeric('quantity', { precision: 10, scale: 2 }).notNull().default('1'),
  unitCost:       numeric('unit_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  subtotal:       numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
  photoUrl:       text('photo_url'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
});

// ── Fotos del servicio de Lavada (separadas de las fotos de repuestos) ─────
export const companyMaintenanceCarwashPhotos = pgTable('company_maintenance_carwash_photos', {
  id:             serial('id').primaryKey(),
  maintenanceId:  integer('maintenance_id').notNull().references(() => companyMaintenanceRecords.id, { onDelete: 'cascade' }),
  photoUrl:       text('photo_url').notNull(),
  caption:        varchar('caption', { length: 200 }),
  uploadedBy:     integer('uploaded_by').references(() => companyUsers.id, { onDelete: 'set null' }),
  uploadedByName: varchar('uploaded_by_name', { length: 160 }),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
});

// ── Notificaciones in-app ────────────────────────────────────────────────────
export const companyNotifications = pgTable('company_notifications', {
  id:         serial('id').primaryKey(),
  companyId:  integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  userId:     integer('user_id').notNull().references(() => companyUsers.id, { onDelete: 'cascade' }),
  kind:       notificationKindEnum('kind').notNull(),
  title:      varchar('title', { length: 200 }).notNull(),
  body:       text('body'),
  payload:    jsonb('payload').notNull().default({}),
  readAt:     timestamp('read_at'),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
});

// ── Tokens de dispositivo (FCM / Web Push) ───────────────────────────────────
export const companyDeviceTokens = pgTable('company_device_tokens', {
  id:          serial('id').primaryKey(),
  userId:      integer('user_id').notNull().references(() => companyUsers.id, { onDelete: 'cascade' }),
  companyId:   integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  token:       text('token').notNull().unique(),
  platform:    devicePlatformEnum('platform').notNull(),
  lastSeenAt:  timestamp('last_seen_at').notNull().defaultNow(),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
});

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
  photoUrl: text('photo_url'),
  odometerPhotoUrl: text('odometer_photo_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// Peajes — gastos de peaje por vehículo
// ─────────────────────────────────────────────

export const companyTollEntries = pgTable('company_toll_entries', {
  id: serial('id').primaryKey(),
  companyId: serial('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  assetId: serial('asset_id')
    .notNull()
    .references(() => companyAssets.id, { onDelete: 'cascade' }),
  driverId: integer('driver_id').references(() => companyDrivers.id, { onDelete: 'set null' }),
  date: date('date').notNull(),
  // Nombre del peaje / caseta (ej. "Peaje Norte Bogotá", "Caseta Autopista Medellín")
  tollName: varchar('toll_name', { length: 200 }).notNull(),
  // Categoría del peaje — útil para distinguir tipo de vía
  category: varchar('category', { length: 40 }),
  // Costo del peaje
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  // Método de pago
  paymentMethod: varchar('payment_method', { length: 40 }),
  // Ruta o trayecto asociado (opcional, ej. "Bogotá → Medellín")
  route: varchar('route', { length: 200 }),
  // Odómetro al momento del cruce
  odometer: numeric('odometer', { precision: 12, scale: 2 }),
  // Cantidad de ejes declarados (camiones / buses)
  axes: integer('axes'),
  notes: text('notes'),
  photoUrl: text('photo_url'),
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
//
// Una "categoría" es la plantilla que define QUÉ se inspecciona (items).
// Desde 2026-06 soporta asignación, periodicidad y alcance:
//
//  - Asignación (target_roles + target_user_ids):
//      * Ambos vacíos  -> visible para todos los usuarios de la empresa.
//      * Alguno lleno  -> visible solo si el usuario está en la unión (rol O user_id).
//
//  - Periodicidad (cadence_kind + cadence_days + window_days):
//      * 'none'  -> no hay ciclo, no genera pendientes.
//      * 'weekly'-> ciclo lunes 00:00 — domingo 23:59 (semana natural).
//      * 'days'  -> ciclo cada N días corridos (cadence_days).
//      * window_days = margen desde el inicio del ciclo para hacer el checklist.
//                      Vencido -> no se puede hacer, pasa al historial.
//
//  - Alcance (scope_kind + scope_asset_type + scope_site_id):
//      * 'pick'         -> el usuario elige el activo al hacer el checklist.
//      * 'site_assets'  -> aplica a todos los vehículos de la sede del usuario.
//      * 'asset_type'   -> aplica a todos los activos de un tipo (Vehiculo, etc.).
//
export const checklistCadenceKindEnum = pgEnum('checklist_cadence_kind_enum', [
  'none',
  'weekly',
  'days',
]);

export const checklistScopeKindEnum = pgEnum('checklist_scope_kind_enum', [
  'pick',
  'site_assets',
  'asset_type',
]);

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

    // ── Asignación (opcional) ──
    targetRoles: text('target_roles').array().notNull().default([]),
    targetUserIds: text('target_user_ids').array().notNull().default([]),

    // ── Periodicidad ──
    cadenceKind: checklistCadenceKindEnum('cadence_kind')
      .notNull()
      .default('none'),
    cadenceDays: integer('cadence_days'),
    windowDays: integer('window_days').notNull().default(7),

    // ── Alcance del activo ──
    scopeKind: checklistScopeKindEnum('scope_kind').notNull().default('pick'),
    scopeAssetType: varchar('scope_asset_type', { length: 40 }),
    scopeSiteId: integer('scope_site_id'),

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
  targetKind: varchar('target_kind', { length: 40 }).notNull().default('Vehiculo'),
  targetLabel: varchar('target_label', { length: 160 }).notNull().default(''),
  date: date('date').notNull().defaultNow(),
  status: varchar('status', { length: 40 }).notNull().default('Pendiente'),
  summary: text('summary'),
  findings: text('findings'),
  items: jsonb('items').notNull().default([]),
  photoUrls: text('photo_urls').array().notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// Autorizaciones de salida de vehículos
// ─────────────────────────────────────────────
//
// Una "autorización" es la solicitud que hace un conductor para sacar un
// vehículo del garaje. El conductor registra un video midiendo la bayoneta
// del aceite + 7 fotos (refrigerante, líquido de frenos, las 4 llantas,
// agua del limpia parabrisas, luces, batería, gato hidráulico).
// Un supervisor/operador/admin/owner autoriza o rechaza.
//
// Estado:
//  - Pendiente : esperando decisión
//  - Autorizada : aprobada por un aprobador
//  - Rechazada  : rechazada con nota
//
// `tire_photos_url` es text[] porque son 4 fotos de las 4 llantas.
// El resto de las evidencias son URLs simples (image o video) excepto el
// video de la bayoneta que también es una URL simple.
export const exitAuthorizationStatusEnum = pgEnum('exit_authorization_status_enum', [
  'Pendiente',
  'Autorizada',
  'Rechazada',
]);

export const companyExitAuthorizations = pgTable(
  'company_exit_authorizations',
  {
    id: serial('id').primaryKey(),
    companyId: integer('company_id').notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    assetId: integer('asset_id').notNull()
      .references(() => companyAssets.id, { onDelete: 'restrict' }),
    driverId: integer('driver_id').notNull()
      .references(() => companyDrivers.id, { onDelete: 'restrict' }),

    status: exitAuthorizationStatusEnum('status').notNull().default('Pendiente'),

    // Evidencias (URLs en /uploads/...).
    // El video de la bayoneta se guarda junto con un thumbnail generado client-side.
    oilBayonetaVideoUrl:       text('oil_bayoneta_video_url'),
    oilBayonetaVideoThumbUrl: text('oil_bayoneta_video_thumb_url'),
    coolantPhotoUrl:          text('coolant_photo_url'),
    brakeFluidPhotoUrl:       text('brake_fluid_photo_url'),
    tirePhotosUrl:            text('tire_photos_url').array().notNull().default([]),
    windshieldWasherPhotoUrl: text('windshield_washer_photo_url'),
    lightsPhotoUrl:           text('lights_photo_url'),
    batteryPhotoUrl:          text('battery_photo_url'),
    jackPhotoUrl:             text('jack_photo_url'),

    notes: text('notes'),

    // Decisión.
    decisionNotes:    text('decision_notes'),
    decisionByUserId: integer('decision_by_user_id')
      .references(() => companyUsers.id, { onDelete: 'set null' }),
    decidedAt:        timestamp('decided_at'),

    requestedAt: timestamp('requested_at').notNull().defaultNow(),
    createdAt:   timestamp('created_at').notNull().defaultNow(),
    updatedAt:   timestamp('updated_at').notNull().defaultNow(),
  },
);

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
  fileUrl: text('file_url'),
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

// ═════════════════════════════════════════════
// Anomalías detectadas en Estadísticas
// ═════════════════════════════════════════════
//
// Una anomalía es una desviación significativa (z-score > 1) entre un
// valor del período actual y la media histórica 3-6 meses del mismo
// módulo+agrupador. Se genera en background al refrescar el tablero.
//
// Severidad:
//   'baja'  1.0 ≤ z < 1.5
//   'media' 1.5 ≤ z < 2.0
//   'alta'  z ≥ 2.0
//
// `dimension` agrupa la anomalía por:
//   - 'asset'     → por vehículo (dimension_id = asset_id)
//   - 'driver'    → por conductor
//   - 'category'  → por categoría (ej. tipo de mantenimiento)
//   - 'general'   → sin agrupación específica
export const companyStatsAnomalies = pgTable('company_stats_anomalies', {
  id:              serial('id').primaryKey(),
  companyId:       integer('company_id')
                     .notNull()
                     .references(() => companies.id, { onDelete: 'cascade' }),
  modulo:          varchar('modulo', { length: 40 }).notNull(),                 // 'mantenimiento' | 'combustible' | 'flotas'
  tipo:            varchar('tipo', { length: 80 }).notNull(),                   // ej. 'costo_total', 'consumo_litros'
  dimension:       varchar('dimension', { length: 40 }),                        // 'asset' | 'driver' | 'category' | 'general'
  dimensionId:     integer('dimension_id'),
  dimensionLabel:  varchar('dimension_label', { length: 200 }),
  severidad:       varchar('severidad', { length: 10 }).notNull(),              // 'baja' | 'media' | 'alta'
  descripcion:     text('descripcion').notNull(),
  metadata:        jsonb('metadata').notNull().default({}),
  detectadoEn:     timestamp('detectado_en').notNull().defaultNow(),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
});

// ═════════════════════════════════════════════
// Cache de análisis IA de Estadísticas (Fase 4)
// ═════════════════════════════════════════════
//
// Una fila por combinación de (empresa, módulo, período, rango, filtros).
// TTL por defecto: 6h. El frontend puede forzar regeneración pasando
// `forzarRegenerar: true` al endpoint.
//
// `inputHash` permite cachear respuestas idénticas aunque cambien los
// `createdAt` (por ejemplo, dos clicks del mismo usuario en minutos).
export const companyStatsInsightsCache = pgTable('company_stats_insights_cache', {
  id:                serial('id').primaryKey(),
  companyId:         integer('company_id')
                       .notNull()
                       .references(() => companies.id, { onDelete: 'cascade' }),
  modulo:            varchar('modulo', { length: 40 }).notNull(),
  periodo:           varchar('periodo', { length: 20 }).notNull(),
  fechaRef:          date('fecha_ref').notNull(),
  fechaHasta:        date('fecha_hasta').notNull(),
  assetId:           integer('asset_id'),
  driverId:          integer('driver_id'),
  provider:          varchar('provider', { length: 40 }).notNull(),
  model:             varchar('model', { length: 80 }).notNull(),
  payload:           jsonb('payload').notNull(),
  responseRaw:       text('response_raw').notNull(),
  resumenEjecutivo:  text('resumen_ejecutivo'),
  puntosClave:       jsonb('puntos_clave').notNull().default([]),
  recomendaciones:   jsonb('recomendaciones').notNull().default([]),
  alertas:           jsonb('alertas').notNull().default([]),
  inputTokens:       integer('input_tokens'),
  outputTokens:      integer('output_tokens'),
  totalTokens:       integer('total_tokens'),
  latencyMs:         integer('latency_ms'),
  createdAt:         timestamp('created_at').notNull().defaultNow(),
  expiresAt:         timestamp('expires_at').notNull(),
  inputHash:         varchar('input_hash', { length: 64 }).notNull(),
});

