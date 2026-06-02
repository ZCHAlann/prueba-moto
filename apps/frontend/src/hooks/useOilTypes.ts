import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { OilType } from "../pages/Mantenimientos/components/types";

export type CreateOilTypePayload = {
  name: string;
  brand?: string | null;
  viscosity?: string | null;
  application?: string | null;
  unit?: string;
  stock?: number;
  minStock?: number;
  notes?: string | null;
};

export type UpdateOilTypePayload = Partial<CreateOilTypePayload>;

function mapApi(raw: Record<string, unknown>): OilType {
  return {
    id: String(raw.id),
    companyId: String(raw.companyId),
    name: String(raw.name ?? ""),
    brand: raw.brand ? String(raw.brand) : null,
    viscosity: raw.viscosity ? String(raw.viscosity) : null,
    application: raw.application ? String(raw.application) : null,
    unit: String(raw.unit ?? "gal"),
    stock: Number(raw.stock ?? 0),
    minStock: Number(raw.minStock ?? 0),
    notes: raw.notes ? String(raw.notes) : null,
    createdAt: String(raw.createdAt ?? ""),
    updatedAt: String(raw.updatedAt ?? ""),
  };
}

export function useOilTypes() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [oilTypes, setOilTypes] = useState<OilType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/oils`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setOilTypes((json.data ?? json).map(mapApi));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar aceites");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { refresh(); }, [refresh]);

  const createOilType = useCallback(async (payload: CreateOilTypePayload): Promise<OilType> => {
    const res = await fetch(`/api/company/${companyId}/oils`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const created = mapApi(await res.json());
    setOilTypes((prev) => [...prev, created]);
    return created;
  }, [companyId]);

  const updateOilType = useCallback(async (id: string, payload: UpdateOilTypePayload): Promise<OilType> => {
    const res = await fetch(`/api/company/${companyId}/oils/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const updated = mapApi(await res.json());
    setOilTypes((prev) => prev.map((o) => (o.id === id ? updated : o)));
    return updated;
  }, [companyId]);

  const deleteOilType = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/company/${companyId}/oils/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    setOilTypes((prev) => prev.filter((o) => o.id !== id));
  }, [companyId]);

  return {
    oilTypes,
    loading,
    error,
    refresh,
    createOilType,
    updateOilType,
    deleteOilType,
  };
}