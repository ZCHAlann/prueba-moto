"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export type ApiFuelEntry = {
  id: string;
  companyId: number;
  assetId: string;
  driverId: string | null;
  date: string;
  liters: number;
  cost: number;
  odometer: number;
  station: string;
  fuelType: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  // ── Backend enrichment (display-only) ──────────────────────────────────────
  /** Vehicle plate — avoids separate useAssets() call */
  assetPlate: string | null;
  assetBrand: string | null;
  assetModel: string | null;
};

export type CreateFuelPayload = {
  assetId: string;
  date: string;
  liters: number;
  cost: number;
  odometer: number;
  station: string;
  notes?: string;
};

function mapApi(raw: Record<string, unknown>): ApiFuelEntry {
  return {
    id: String(raw.id),
    companyId: raw.companyId as number,
    assetId: String(raw.assetId ?? ""),
    driverId: raw.driverId ? String(raw.driverId) : null,
    date: (raw.date as string) ?? "",
    liters: Number(raw.liters ?? 0),
    cost: Number(raw.cost ?? 0),
    odometer: Number(raw.odometer ?? 0),
    station: (raw.station as string) ?? "",
    fuelType: (raw.fuelType as string) ?? "",
    notes: (raw.notes as string) ?? "",
    createdAt: (raw.createdAt as string) ?? "",
    updatedAt: (raw.updatedAt as string) ?? "",
    // ── Backend enrichment ──────────────────────────────────────────────────────
    assetPlate: (raw.assetPlate as string | null) ?? null,
    assetBrand: (raw.assetBrand as string | null) ?? null,
    assetModel: (raw.assetModel as string | null) ?? null,
  };
}

export function useFuel() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [fuelEntries, setFuelEntries] = useState<ApiFuelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/fuel`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setFuelEntries((json.data ?? json).map(mapApi));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar combustible");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { refresh(); }, [refresh]);

  const createFuelEntry = useCallback(async (payload: CreateFuelPayload): Promise<ApiFuelEntry> => {
    const res = await fetch(`/api/company/${companyId}/fuel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_id: payload.assetId,
        date: payload.date,
        liters: payload.liters,
        cost: payload.cost,
        odometer: payload.odometer,
        station: payload.station,
        notes: payload.notes ?? "",
      }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const created = mapApi(await res.json());
    setFuelEntries((prev) => [created, ...prev]);
    return created;
  }, [companyId]);

  const deleteFuelEntry = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/company/${companyId}/fuel/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    setFuelEntries((prev) => prev.filter((e) => e.id !== id));
  }, [companyId]);

  return { fuelEntries, loading, error, refresh, createFuelEntry, deleteFuelEntry };
}