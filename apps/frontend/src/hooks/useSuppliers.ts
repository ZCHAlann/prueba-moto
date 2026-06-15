// hooks/useSuppliers.ts
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export interface Supplier {
  id: string;
  companyId: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  nit: string | null;
  notes: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierInput {
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  nit?: string | null;
  notes?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export function useSuppliers() {
  const { companyId } = useAuth();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [tick, setTick]           = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/company/${companyId}/suppliers`, { cache: "no-store" })
      .then((res) => { if (!res.ok) throw new Error(`Error ${res.status}`); return res.json(); })
      .then((body: { data: Supplier[] }) => {
        setSuppliers(body.data ?? []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error cargando proveedores"))
      .finally(() => setLoading(false));
  }, [companyId, tick]);

  const createSupplier = useCallback(async (input: SupplierInput): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/suppliers`, {
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
      setError(err instanceof Error ? err.message : "Error creando proveedor");
      return false;
    }
  }, [companyId, refresh]);

  const updateSupplier = useCallback(async (id: string, input: Partial<SupplierInput>): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/suppliers/${id}`, {
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
      setError(err instanceof Error ? err.message : "Error actualizando proveedor");
      return false;
    }
  }, [companyId, refresh]);

  const deleteSupplier = useCallback(async (id: string): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/suppliers/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      }
      setSuppliers((current) => current.filter((s) => s.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando proveedor");
      return false;
    }
  }, [companyId]);

  return { suppliers, loading, error, refresh, createSupplier, updateSupplier, deleteSupplier };
}
