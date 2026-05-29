import type {
  Asset,
  AssetCategory,
  AssetDocument,
  AssetExpiry,
  AssetStatus,
  AssetType,
  InsurancePolicy,
  OdometerRecord,
  OilChangeRecord,
  OilType,
} from "@/types/activo";

export const assetTypeOptions: AssetType[] = ["Vehiculo", "Maquinaria", "Motor", "Planta electrica"];

export const assetCategoryOptions: AssetCategory[] = ["Camion", "Camioneta", "SUV", "Furgon", "Furgoneta", "Bus", "Volqueta"];

export const assetStatusOptions: AssetStatus[] = ["Operativo", "En mantenimiento", "Fuera de servicio"];

export const defaultAssets: Asset[] = [];

export const defaultAssetDocuments: AssetDocument[] = [];

export const defaultInsurancePolicies: InsurancePolicy[] = [];

export const defaultAssetExpiries: AssetExpiry[] = [];

export const defaultOdometerRecords: OdometerRecord[] = [];

export const defaultOilTypes: OilType[] = [];

export const defaultOilChanges: OilChangeRecord[] = [];
