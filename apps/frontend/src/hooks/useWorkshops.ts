// hooks/useWorkshops.ts
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export interface Workshop {
  id: string;
  companyId: string;
  name: string;
  address: string | null;
  phone: string | null;
  contactName: string | null;
  nit: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkshopInput {
  name: string;
  address?: string | null;
  phone?: string | null;
  contactName?: string | null;
  nit?: string | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export function useWorkshops() {
  const { companyId } = useAuth();

  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [tick, setTick]           = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/company/${companyId}/workshops`, { cache: "no-store" })
      .then((res) => { if (!res.ok) throw new Error(`Error ${res.status}`); return res.json(); })
      .then((body: { data: Workshop[] }) => {
        setWorkshops(body.data ?? []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error cargando talleres"))
      .finally(() => setLoading(false));
  }, [companyId, tick]);

  const createWorkshop = useCallback(async (input: WorkshopInput): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/workshops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      }
      refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando taller");
      return false;
    }
  }, [companyId, refresh]);

  const updateWorkshop = useCallback(async (id: string, input: Partial<WorkshopInput>): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/workshops/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      }
      refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando taller");
      return false;
    }
  }, [companyId, refresh]);

  const deleteWorkshop = useCallback(async (id: string): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/workshops/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      }
      setWorkshops((current) => current.filter((w) => w.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando taller");
      return false;
    }
  }, [companyId]);

  return { workshops, loading, error, refresh, createWorkshop, updateWorkshop, deleteWorkshop };
}
