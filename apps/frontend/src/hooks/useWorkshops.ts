import { apiErrorText, extractApiErrorMessage } from "../lib/form-validation";
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
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [tick, setTick]           = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    // jul 2026 v3 — nopage=true trae TODOS los talleres sin paginar
    // (necesario para dropdowns en modales de factura).
    fetch(`/api/company/${companyId}/workshops?nopage=true`, { cache: "no-store" })
      .then(async (res) => { if (!res.ok) throw new Error(await apiErrorText(res, `Error ${res.status}`)); return res.json(); })
      .then((body: { data: Workshop[]; total?: number }) => {
        setWorkshops(body.data ?? []);
        setTotal(typeof body.total === "number" ? body.total : (body.data?.length ?? 0));
      })
      .catch((err: unknown) => setError(extractApiErrorMessage(err, "Error cargando talleres")))
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
        throw new Error(extractApiErrorMessage({ body }, `Error ${res.status}`));
      }
      refresh();
      return true;
    } catch (err) {
      setError(extractApiErrorMessage(err, "Error creando taller"));
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
        throw new Error(extractApiErrorMessage({ body }, `Error ${res.status}`));
      }
      refresh();
      return true;
    } catch (err) {
      setError(extractApiErrorMessage(err, "Error actualizando taller"));
      return false;
    }
  }, [companyId, refresh]);

  const deleteWorkshop = useCallback(async (id: string): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/workshops/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage({ body }, `Error ${res.status}`));
      }
      setWorkshops((current) => current.filter((w) => w.id !== id));
      return true;
    } catch (err) {
      setError(extractApiErrorMessage(err, "Error eliminando taller"));
      return false;
    }
  }, [companyId]);

  return { workshops, total, loading, error, refresh, createWorkshop, updateWorkshop, deleteWorkshop };
}
