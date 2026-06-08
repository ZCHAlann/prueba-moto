export type UserRole = "admin" | "operaciones" | "mantenimiento" | "consulta";

export type Permission =
  | "assets.manage"
  | "drivers.manage"
  | "assignments.manage"
  | "maintenance.manage"
  | "checklists.manage"
  | "alerts.manage"
  | "reports.export"
  | "fuel.manage"
  | "inventory.manage"
  | "garages.manage"
  | "ac.manage"
  | "settings.manage";

export type Tenant = {
  id: string;
  code: string;
  name: string;
  sector: string;
};

export type UserProfile = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: UserRole;
};

export type CompanySettings = {
  tenantId: string;
  maintenanceLeadTimeDays: number;
  checklistRequired: boolean;
  fuelCurrency: string;
  alertEmail: string;
  alertConfigs: AlertConfig[];
};

export type SiteStatus = "Activa" | "Inactiva";

export type OperationalSite = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  city: string;
  address: string;
  contact: string;
  status: SiteStatus;
  notes: string;
};

export type DriverStatus = "Activo" | "Inactivo";

export type Driver = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  licenseType: string;
  licenseExpiry: string;
  licensePoints: number;
  email: string;
  phone: string;
  site: string;
  status: DriverStatus;
  notes: string;
};

export type AssignmentStatus = "Activa" | "Finalizada";

export type Assignment = {
  id: string;
  tenantId: string;
  assetId: string;
  driverId: string;
  startDate: string;
  endDate: string | null;
  status: AssignmentStatus;
  notes: string;
  handoverFileName: string;
};

export type MaintenanceStatus = "Pendiente" | "En proceso" | "Completado";

export type MaintenanceKind = "Preventivo" | "Correctivo";

export type MaintenancePriority = "Programado" | "Emergente";

export type MaintenanceRecord = {
  id: string;
  tenantId: string;
  assetId: string;
  title: string;
  kind: MaintenanceKind;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  scheduledDate: string;
  dueDate: string;
  completedDate: string | null;
  responsible: string;
  photoNames: string[];
  notes: string;
};

export type GarageStatus = "Activo" | "Inactivo";

export type GarageRecord = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  location: string;
  capacity: number;
  supervisor: string;
  status: GarageStatus;
  notes: string;
  latitude: number | null; 
  longitude: number | null;
};

export type AirConditioningStatus = "Operativo" | "En revision" | "Fuera de servicio" | "Pendiente revision";

export type AirConditioningType = "Split" | "Cassette" | "Ventana" | "Central" | "Chiller" | "Fan-coil" | "Otro";

export type AirConditioningUnit = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: AirConditioningType;
  site: string;
  siteId?: string | null;
  floor?: string;
  area?: string;
  serial?: string;
  brand?: string;
  model?: string;
  capacityBtu?: string;
  voltage?: string;
  amperage?: string;
  refrigerantType?: string;
  installDate?: string;
  technician?: string;
  status: AirConditioningStatus;
  lastService?: string;
  nextService?: string;
  photoUrls: string[];
  notes?: string;
  // legacy compat
  assetId?: string;
  // ── Backend enrichment (display-only) ──────────────────────────────────────
  /** Site name — avoids separate useSites() call */
  siteName?: string | null;
};

export type AcServiceKind = "Limpieza" | "Recarga" | "Reparacion" | "Inspeccion" | "Preventivo" | "Correctivo";

export type AcServiceRecord = {
  id: string;
  tenantId: string;
  unitId: string;
  date: string;
  kind: AcServiceKind;
  technician: string;
  cost: string;
  findings: string;
  photoUrls: string[];
  notes: string;
};

export type AcRefrigerantLog = {
  id: string;
  tenantId: string;
  unitId: string;
  date: string;
  refrigerantType: string;
  quantity: string;
  unit: "kg" | "lb" | "oz";
  technician: string;
  reason: string;
  notes: string;
};

export type ChecklistStatus = "Aprobado" | "Observado";

export type ChecklistItemPresence = "SI" | "NO";

export type ChecklistItemCondition = "Bueno" | "Regular" | "Malo";

export type ChecklistTargetKind = "Vehiculo" | "Motor" | "Generador";

export type ChecklistCategory = {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  items: string[];
  createdAt: string;
};

export type ChecklistInspectionItem = {
  itemName: string;
  hasItem: ChecklistItemPresence;
  condition: ChecklistItemCondition;
  comment: string;
  imageName: string;
  imagePreview?: string;
};

export type ChecklistRecord = {
  id: string;
  tenantId: string;
  targetKind: ChecklistTargetKind;
  targetId: string;
  targetLabel: string;
  assetId: string;
  inspectorId: string;
  inspector: string;
  categoryId: string;
  categoryName: string;
  date: string;
  status: ChecklistStatus;
  summary: string;
  findings: string;
  items: ChecklistInspectionItem[];
};

export type AlertType = "Vencimiento" | "Mantenimiento" | "Manual";

export type AlertSeverity = "Alta" | "Media" | "Baja";

export type AlertStatus = "Abierta" | "En seguimiento" | "Cerrada";

export type AlertRecord = {
  id: string;
  tenantId: string;
  assetId: string | null;
  title: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  dueDate: string;
  notes: string;
};

export type AlertConfig = {
  id: string;
  tenantId?: string;
  key?: string;
  label: string;
  description: string;
  enabled: boolean;
};

export type ReportCategory = "Operativo" | "Mantenimiento" | "Combustible" | "Ejecutivo";

export type ReportFormat = "PDF" | "XLSX";

export type ReportRecord = {
  id: string;
  tenantId: string;
  name: string;
  category: ReportCategory;
  format: ReportFormat;
  status: "Listo" | "Generado";
  lastGeneratedAt: string;
  description: string;
};

export type FuelEntry = {
  id: string;
  tenantId: string;
  assetId: string;
  date: string;
  liters: number;
  cost: number;
  odometer: number;
  station: string;
};

export type InventoryItem = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  location: string;
  unit: string;
};

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "assign"
  | "approve"
  | "close"
  | "generate"
  | "export";

export type AuditEntry = {
  id: string;
  tenantId: string;
  entity: string;
  entityId: string;
  action: AuditAction;
  actor: string;
  at: string;
  description: string;
};
