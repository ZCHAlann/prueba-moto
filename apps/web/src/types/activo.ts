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
