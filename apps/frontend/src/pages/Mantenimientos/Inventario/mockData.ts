import type { OilType, InventoryItem, OilChange, Asset } from "../components/types";

// ─── Mock Data ────────────────────────────────────────────────────────────────
// Replace with real API hooks (useInventory, useAssetCenter) when integrating

export const mockOilTypes: OilType[] = [
  {
    id: "oil-1",
    name: "Mobil Delvac 1300",
    brand: "Mobil",
    viscosity: "15W-40",
    application: "Motor diésel",
    unit: "gal",
    stock: 3,
    minStock: 5,
    notes: "Para motores de alta carga. Revisar antes de ruta larga.",
  },
  {
    id: "oil-2",
    name: "Shell Rimula R4",
    brand: "Shell",
    viscosity: "10W-30",
    application: "Motor gasolina/díesel",
    unit: "gal",
    stock: 12,
    minStock: 4,
    notes: "",
  },
  {
    id: "oil-3",
    name: "Castrol GTX",
    brand: "Castrol",
    viscosity: "20W-50",
    application: "Motor gasolina",
    unit: "gal",
    stock: 2,
    minStock: 6,
    notes: "Stock crítico. Solicitar reposición urgente.",
  },
  {
    id: "oil-4",
    name: "Chevron Delo 400",
    brand: "Chevron",
    viscosity: "15W-40",
    application: "Transmisión automática",
    unit: "lt",
    stock: 20,
    minStock: 8,
    notes: "",
  },
];

export const mockInventory: InventoryItem[] = [
  { id: "inv-1", code: "REP-001", name: "Filtro de aceite Fleetguard",  category: "Filtros",   stock: 8,  minStock: 10, unit: "un",  location: "Bodega A - E1" },
  { id: "inv-2", code: "REP-002", name: "Filtro de aire primario",       category: "Filtros",   stock: 15, minStock: 5,  unit: "un",  location: "Bodega A - E2" },
  { id: "inv-3", code: "REP-003", name: "Pastillas de freno delanteras", category: "Frenos",    stock: 2,  minStock: 4,  unit: "par", location: "Bodega B - E3" },
  { id: "inv-4", code: "REP-004", name: "Correa de distribución",        category: "Motor",     stock: 3,  minStock: 2,  unit: "un",  location: "Bodega A - E5" },
  { id: "inv-5", code: "REP-005", name: "Bujías NGK iridium",            category: "Encendido", stock: 0,  minStock: 8,  unit: "un",  location: "Bodega C - E1" },
  { id: "inv-6", code: "REP-006", name: "Batería 12V 90Ah",              category: "Eléctrico", stock: 1,  minStock: 2,  unit: "un",  location: "Bodega B - E1" },
];

export const mockOilChanges: OilChange[] = [
  { id: "chg-1", assetCode: "BUS-012", assetName: "Mercedes Sprinter", oilTypeId: "oil-1", oilName: "Mobil Delvac 1300", date: "2025-05-10", reading: 45200,  nextReading: 50200,  quantity: 4, technician: "Carlos Mendoza", notes: "" },
  { id: "chg-2", assetCode: "CAM-003", assetName: "Hino GH 1726",      oilTypeId: "oil-2", oilName: "Shell Rimula R4",   date: "2025-05-08", reading: 112000, nextReading: 117000, quantity: 6, technician: "Luis Paredes",   notes: "Se cambió también filtro de aceite REP-001" },
  { id: "chg-3", assetCode: "BUS-007", assetName: "Volvo B290R",        oilTypeId: "oil-1", oilName: "Mobil Delvac 1300", date: "2025-04-30", reading: 88600,  nextReading: 93600,  quantity: 5, technician: "Carlos Mendoza", notes: "" },
  { id: "chg-4", assetCode: "CAM-001", assetName: "Freightliner M2",    oilTypeId: "oil-4", oilName: "Chevron Delo 400",  date: "2025-04-22", reading: 203400, nextReading: 208400, quantity: 8, technician: "Pedro Suárez",   notes: "" },
];

export const mockAssets: Asset[] = [
  { id: "asset-1", code: "BUS-012", name: "Mercedes Sprinter" },
  { id: "asset-2", code: "CAM-003", name: "Hino GH 1726" },
  { id: "asset-3", code: "BUS-007", name: "Volvo B290R" },
  { id: "asset-4", code: "CAM-001", name: "Freightliner M2" },
];