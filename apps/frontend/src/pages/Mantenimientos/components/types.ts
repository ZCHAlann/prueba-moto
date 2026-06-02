export interface OilType {
  id: string;
  companyId: string;
  name: string;
  brand: string | null;
  viscosity: string | null;
  application: string | null;
  unit: string;
  stock: number;
  minStock: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  companyId: string;
  code: string;
  name: string;
  category: string | null;
  stock: number;
  minStock: number;
  unit: string | null;
  location: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OilChange {
  id: string;
  companyId: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  oilTypeId: string;
  oilName: string;
  date: string;
  reading: number;
  nextReading: number;
  quantity: number;
  technician: string | null;
  notes: string | null;
  createdAt: string;
}

export interface Asset {
  id: string;
  code: string;
  name: string;
}

export type TabKey = "aceites" | "inventario" | "historial";