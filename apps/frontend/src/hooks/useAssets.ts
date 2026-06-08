import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { Asset, AssetCategory, AssetFuelType, AssetStatus, AssetType } from "../types/activo";

type CreateAssetInput = Omit<Asset, "id" | "tenantId">;
type UpdateAssetInput = Omit<Asset, "id" | "tenantId">;

type UseAssetsReturn = {
  assets: Asset[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  getAsset: (id: string) => Asset | undefined;
  createAsset: (input: CreateAssetInput) => Promise<string | null>;
  updateAsset: (id: string, input: UpdateAssetInput) => Promise<boolean>;
  deleteAsset: (id: string) => Promise<boolean>;
};

function mapApiToAsset(data: Record<string, unknown>, companyId: string): Asset {
  return {
    id: String(data.id),
    tenantId: `tenant-company-${companyId}`,
    code: String(data.code ?? ""),
    name: String(data.name ?? ""),
    assetType: (data.assetType ?? data.asset_type ?? "Vehiculo") as AssetType,
    category: String(data.category ?? "") as AssetCategory,
    status: (data.status ?? "Operativo") as AssetStatus,
    site: String(data.site ?? data.location ?? ""),
    siteId: data.siteId ? String(data.siteId) : null,
    responsible: String(data.responsible ?? ""),
    brand: String(data.brand ?? ""),
    model: String(data.model ?? ""),
    serial: String(data.serial ?? ""),
    plate: String(data.plate ?? ""),
    year: String(data.year ?? ""),
    observations: String(data.observations ?? ""),
    location: String(data.location ?? ""),
    utilization: String(data.utilization ?? "0%"),
    nextMaintenance: String(data.nextMaintenance ?? data.next_maintenance ?? ""),
    lastInspection: String(data.lastInspection ?? data.last_inspection ?? ""),
    alerts: Number(data.alerts ?? 0),
    availability: String(data.availability ?? "Disponible"),
    color: String(data.color ?? ""),
    maxLoad: String(data.maxLoad ?? data.max_load ?? ""),
    fuelType: String(data.fuelType ?? data.fuel_type ?? "")  as AssetFuelType,
    oilType: String(data.oilType ?? data.oil_type ?? ""),
    oilCapacity: String(data.oilCapacity ?? data.oil_capacity ?? ""),
    garageId: data.garageId ? String(data.garageId) : null,
    photoUrls: Array.isArray(data.photoUrls ?? data.photo_urls) ? (data.photoUrls ?? data.photo_urls) as string[] : [],
    // ── Backend enrichment ──────────────────────────────────────────────────────
    currentDriver: (data.currentDriver as { name: string; code: string; phone: string; photoUrl: string | null } | null) ?? null,
  };
}

function mapAssetToApi(input: CreateAssetInput | UpdateAssetInput) {
  return {
    code: input.code,
    name: input.name,
    assetType: input.assetType,
    category: input.category,
    status: input.status,
    site: input.site,
    responsible: input.responsible,
    brand: input.brand,
    model: input.model,
    serial: input.serial,
    plate: input.plate,
    year: input.year,
    observations: input.observations,
    location: input.location,
    utilization: input.utilization,
    nextMaintenance: input.nextMaintenance,
    lastInspection: input.lastInspection,
    alerts: input.alerts,
    availability: input.availability,
    color: input.color,
    maxLoad: input.maxLoad,
    fuelType: input.fuelType,
    oilType: input.oilType,
    oilCapacity: input.oilCapacity,
    siteId: input.siteId ?? null,
    garageId: input.garageId ?? null,
  };
}

export function useAssets(): UseAssetsReturn {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/company/${companyId}/assets`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then((body: { data: Record<string, unknown>[] }) => {
        setAssets((body.data ?? []).map((item) => mapApiToAsset(item, companyId)));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error cargando activos");
      })
      .finally(() => setLoading(false));
  }, [companyId, tick]);

  const getAsset = useCallback(
    (id: string) => assets.find((asset) => asset.id === id),
    [assets]
  );

  const createAsset = useCallback(
    async (input: CreateAssetInput): Promise<string | null> => {
      if (!companyId) return null;

      try {
        const res = await fetch(`/api/company/${companyId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mapAssetToApi(input)),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
        }

        const data = await res.json() as Record<string, unknown>;
        const newAsset = mapApiToAsset(data, companyId);
        setAssets((current) => [...current, newAsset]);
        return String(data.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error creando activo");
        return null;
      }
    },
    [companyId]
  );

  const updateAsset = useCallback(
    async (id: string, input: UpdateAssetInput): Promise<boolean> => {
      if (!companyId) return false;

      try {
        const res = await fetch(`/api/company/${companyId}/assets/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mapAssetToApi(input)),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
        }

        const data = await res.json() as Record<string, unknown>;
        const updated = mapApiToAsset(data, companyId);
        setAssets((current) => current.map((asset) => (asset.id === id ? updated : asset)));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error actualizando activo");
        return false;
      }
    },
    [companyId]
  );

  const deleteAsset = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) return false;

      try {
        const res = await fetch(`/api/company/${companyId}/assets/${id}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
        }

        setAssets((current) => current.filter((asset) => asset.id !== id));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error eliminando activo");
        return false;
      }
    },
    [companyId]
  );

  return { assets, loading, error, refresh, getAsset, createAsset, updateAsset, deleteAsset };
}