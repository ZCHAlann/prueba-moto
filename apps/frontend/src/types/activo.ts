export type AssetStatus = "Operativo" | "En mantenimiento" | "Fuera de servicio";

export type AssetType = "Vehiculo" | "Maquinaria" | "Motor" | "Planta electrica";

export type AssetCategory =
  | "Camion"
  | "Camioneta"
  | "SUV"
  | "Furgon"
  | "Furgoneta"
  | "Bus"
  | "Volqueta";

export type AssetFuelType = "Diesel" | "Gasolina" | "Electrico" | "Hibrido";

export type Asset = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  assetType: AssetType;
  category: AssetCategory;
  status: AssetStatus;
  site: string;
  siteId: string | null;
  responsible: string;
  brand: string;
  model: string;
  serial: string;
  plate: string;
  year: string;
  observations: string;
  location: string;
  utilization: string;
  nextMaintenance: string;
  lastInspection: string;
  alerts: number;
  availability: string;
  color: string;
  maxLoad: string;
  fuelType: AssetFuelType;
  oilType: string;
  oilCapacity: string;
  photoUrls: string[]; 
  garageId: string | null;
  // ── Backend enrichment (display-only) ──────────────────────────────────────
  /** Current active driver via assignment — avoids separate useDrivers() call */
  currentDriver: { name: string; code: string; phone: string; photoUrl: string | null } | null;
  /**
   * Acta de asignación activa del vehículo (lo que el admin diligencia al
   * momento de la entrega: número/fecha/lugar, odómetro, combustible,
   * condición, fotos, firmas, etc.). Viene del endpoint de detalle, así
   * el drawer no depende de un hook externo.
   * `null` si el vehículo no tiene asignación activa.
   */
  currentAssignment: AssignmentActa | null;
};

/**
 * Subset del "acta de asignación" que se expone en listados y drawers
 * sin necesidad de pegar a `/assignments/:id`. Coincide con el shape que
 * devuelve `serializeAssignment` en el backend.
 */
export type AssignmentActa = {
  id: string;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  // Datos del acta
  actaNumber: string | null;
  actaDate: string | null;
  actaTime: string | null;
  actaPlace: string | null;
  actaArea: string | null;
  handoverUrl: string | null;
  // Vehículo al momento de la entrega
  vehicleOdometer: string | null;
  vehicleFuelLevel: string | null;
  vehicleCondition: string | null;
  vehiclePhotoUrls: string[];
  // Firmas
  signatureLogUrl: string | null;
  signatureRespUrl: string | null;
  // Conductor (snapshot)
  driverDni: string | null;
  driverPhone: string | null;
  driverRole: string | null;
  driverSnapshot: { firstName: string | null; lastName: string | null; phone: string | null } | null;
  // Novedades / accesorios
  novedades: unknown;
  accesorios: unknown;
  novedadesText: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AssetDocumentStatus = "Vigente" | "Por vencer" | "Vencido";

export type AssetDocument = {
  id: string;
  tenantId: string;
  assetId: string;
  title: string;
  category: string;
  status: AssetDocumentStatus;
  issueDate: string;
  expiryDate: string;
  provider: string;
  notes: string;
};

export type InsurancePolicy = {
  id: string;
  tenantId: string;
  assetId: string;
  insurer: string;
  policyNumber: string;
  coverage: string;
  startDate: string;
  endDate: string;
  status: AssetDocumentStatus;
  notes: string;
};

export type AssetExpiry = {
  id: string;
  tenantId: string;
  assetId: string;
  title: string;
  category: string;
  dueDate: string;
  status: AssetDocumentStatus;
  owner: string;
  notes: string;
};

export type OdometerUnit = "Kilometraje" | "Horometro";

export type OdometerRecord = {
  id: string;
  tenantId: string;
  assetId: string;
  recordedAt: string;
  reading: number;
  unit: OdometerUnit;
  source: string;
  notes: string;
};

export type OilType = {
  id: string;
  tenantId: string;
  name: string;
  brand: string;
  viscosity: string;
  application: string;
  unit: string;
  stock: number;
  minStock: number;
  notes: string;
};

export type OilChangeRecord = {
  id: string;
  tenantId: string;
  assetId: string;
  oilTypeId: string;
  date: string;
  reading: number;
  nextReading: number;
  quantity: number;
  technician: string;
  notes: string;
};
