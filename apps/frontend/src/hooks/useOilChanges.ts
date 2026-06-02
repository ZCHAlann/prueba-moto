import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { OilChange } from "../pages/Mantenimientos/components/types";

export type CreateOilChangePayload = {
  assetId: string;
  oilTypeId: string;
  date: string;
  reading: number;
  nextReading: number;
  quantity: number;
  technician?: string | null;
  notes?: string | null;
};

function mapApi(raw: Record<string, unknown>): OilChange {
  return {
    id: String(raw.id),
    companyId: String(raw.companyId),
    assetId: String(raw.assetId),
    assetCode: String(raw.assetCode ?? ""),
    assetName: String(raw.assetName ?? ""),
    oilTypeId: String(raw.oilTypeId),
    oilName: String(raw.oilName ?? ""),
    date: String(raw.date ?? ""),
    reading: Number(raw.reading ?? 0),
    nextReading: Number(raw.nextReading ?? 0),
    quantity: Number(raw.quantity ?? 0),
    technician: raw.technician ? String(raw.technician) : null,
    notes: raw.notes ? String(raw.notes) : null,
    createdAt: String(raw.createdAt ?? ""),
  };
}

export function useOilChanges() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [oilChanges, setOilChanges] = useState<OilChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/oil-changes`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setOilChanges((json.data ?? json).map(mapApi));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar cambios de aceite");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { refresh(); }, [refresh]);

  const createOilChange = useCallback(async (payload: CreateOilChangePayload): Promise<OilChange> => {
    const res = await fetch(`/api/company/${companyId}/oil-changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const created = mapApi(await res.json());
    setOilChanges((prev) => [created, ...prev]);
    return created;
  }, [companyId]);

  const deleteOilChange = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/company/${companyId}/oil-changes/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    setOilChanges((prev) => prev.filter((c) => c.id !== id));
  }, [companyId]);

  return {
    oilChanges,
    loading,
    error,
    refresh,
    createOilChange,
    deleteOilChange,
  };
}