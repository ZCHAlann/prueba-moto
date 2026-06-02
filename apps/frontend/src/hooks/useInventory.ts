"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { InventoryItem } from "../pages/Mantenimientos/components/types";

type CreateInventoryInput = Omit<InventoryItem, "id" | "companyId" | "createdAt" | "updatedAt" | "notes"> & { notes?: string | null };
type UpdateInventoryInput = Partial<CreateInventoryInput>;

export function useInventory() {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/company/${companyId}/inventory`, { cache: "no-store" })
      .then((res) => { if (!res.ok) throw new Error(`Error ${res.status}`); return res.json(); })
      .then((body: { data: Record<string, unknown>[] }) => {
        setInventory((body.data ?? []).map((item) => ({
          id: String(item.id),
          companyId: String(item.companyId ?? ""),
          code: String(item.code ?? ""),
          name: String(item.name ?? ""),
          category: item.category ? String(item.category) : null,
          stock: Number(item.stock ?? 0),
          minStock: Number(item.minStock ?? item.min_stock ?? 0),
          location: item.location ? String(item.location) : null,
          unit: item.unit ? String(item.unit) : null,
          notes: item.notes ? String(item.notes) : null,
          createdAt: String(item.createdAt ?? item.created_at ?? ""),
          updatedAt: String(item.updatedAt ?? item.updated_at ?? ""),
        })));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error cargando inventario"))
      .finally(() => setLoading(false));
  }, [companyId, tick]);

  const createItem = useCallback(async (input: CreateInventoryInput): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: input.code,
          name: input.name,
          category: input.category,
          stock: input.stock,
          min_stock: input.minStock,
          location: input.location,
          unit: input.unit,
          notes: input.notes ?? "",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      }
      refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando item");
      return false;
    }
  }, [companyId, refresh]);

  const updateItem = useCallback(async (id: string, input: UpdateInventoryInput): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/inventory/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(input.code !== undefined && { code: input.code }),
          ...(input.name !== undefined && { name: input.name }),
          ...(input.category !== undefined && { category: input.category }),
          ...(input.stock !== undefined && { stock: input.stock }),
          ...(input.minStock !== undefined && { min_stock: input.minStock }),
          ...(input.location !== undefined && { location: input.location }),
          ...(input.unit !== undefined && { unit: input.unit }),
          ...(input.notes !== undefined && { notes: input.notes }),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      }
      refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando item");
      return false;
    }
  }, [companyId, refresh]);

  const deleteItem = useCallback(async (id: string): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/inventory/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      }
      setInventory((current) => current.filter((item) => item.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando item");
      return false;
    }
  }, [companyId]);

  return { inventory, loading, error, refresh, createItem, updateItem, deleteItem };
}