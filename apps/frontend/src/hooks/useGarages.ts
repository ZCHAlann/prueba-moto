import { apiErrorText, extractApiErrorMessage } from "../lib/form-validation";
"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { GarageRecord, GarageStatus } from "../types/fleet";

type CreateGarageInput = Omit<GarageRecord, "id" | "tenantId">;
type UpdateGarageInput = Partial<CreateGarageInput>;

export function useGarages() {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [garages, setGarages] = useState<GarageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/company/${companyId}/garages`, { cache: "no-store" })
      .then(async (res) => { if (!res.ok) throw new Error(await apiErrorText(res, `Error ${res.status}`)); return res.json(); })
      .then((body: { data: Record<string, unknown>[] }) => {
        setGarages((body.data ?? []).map((g) => ({
          id: String(g.id),
          tenantId: `tenant-company-${companyId}`,
          code: String(g.code ?? ""),
          name: String(g.name ?? ""),
          location: String(g.location ?? ""),
          capacity: Number(g.capacity ?? 0),
          supervisor: String(g.supervisor ?? ""),
          status: (g.status ?? "Activo") as GarageStatus,
          notes: String(g.notes ?? ""),
          latitude: (g.latitude as number | null) ?? null,
          longitude: (g.longitude as number | null) ?? null,
        })));
      })
      .catch((err: unknown) => setError(extractApiErrorMessage(err, "Error cargando garajes")))
      .finally(() => setLoading(false));
  }, [companyId, tick]);

  const createGarage = useCallback(async (input: CreateGarageInput): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/garages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage({ body }, `Error ${res.status}`));
      }
      refresh();
      return true;
    } catch (err) {
      setError(extractApiErrorMessage(err, "Error creando garaje"));
      return false;
    }
  }, [companyId, refresh]);

  const updateGarage = useCallback(async (id: string, input: UpdateGarageInput): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/garages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage({ body }, `Error ${res.status}`));
      }
      refresh();
      return true;
    } catch (err) {
      setError(extractApiErrorMessage(err, "Error actualizando garaje"));
      return false;
    }
  }, [companyId, refresh]);

  const deleteGarage = useCallback(async (id: string): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/garages/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage({ body }, `Error ${res.status}`));
      }
      setGarages((current) => current.filter((g) => g.id !== id));
      return true;
    } catch (err) {
      setError(extractApiErrorMessage(err, "Error eliminando garaje"));
      return false;
    }
  }, [companyId]);

  return { garages, loading, error, refresh, createGarage, updateGarage, deleteGarage };
}