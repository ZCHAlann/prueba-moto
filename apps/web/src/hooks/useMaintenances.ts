"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";

export type MaintenanceKind = "Preventivo" | "Correctivo" | "Predictivo" | "Emergencia";
export type MaintenancePriority = "Programado" | "Emergente" | "Normal" | "Alta";
export type MaintenanceStatus = "Pendiente" | "En proceso" | "Completado";

export type ApiMaintenance = {
  id: string;
  companyId: number;
  assetId: string;
  title: string;
  kind: MaintenanceKind;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  scheduledDate: string;
  dueDate: string;
  completedDate: string | null;
  responsible: string;
  photoNames: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateMaintenancePayload = {
  assetId: string;
  title: string;
  kind: MaintenanceKind;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  scheduledDate: string;
  dueDate: string;
  completedDate: string | null;
  responsible: string;
  photoNames: string[];
  notes: string;
};

export type UpdateMaintenancePayload = Partial<CreateMaintenancePayload>;

function mapApi(raw: Record<string, unknown>): ApiMaintenance {
  return {
    id: String(raw.id),
    companyId: raw.company_id as number,
    assetId: String(raw.asset_id),
    title: (raw.title as string) ?? "",
    kind: (raw.kind as MaintenanceKind) ?? "Preventivo",
    priority: (raw.priority as MaintenancePriority) ?? "Programado",
    status: (raw.status as MaintenanceStatus) ?? "Pendiente",
    scheduledDate: (raw.scheduled_date as string) ?? "",
    dueDate: (raw.due_date as string) ?? "",
    completedDate: (raw.completed_date as string | null) ?? null,
    responsible: (raw.technician as string) ?? "",  // backend usa 'technician'
    photoNames: (raw.photo_urls as string[]) ?? [],
    notes: (raw.notes as string) ?? "",
    createdAt: (raw.created_at as string) ?? "",
    updatedAt: (raw.updated_at as string) ?? "",
  };
}

export function useMaintenances() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [maintenances, setMaintenances] = useState<ApiMaintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/maintenances`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setMaintenances((json.data ?? json).map(mapApi));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar mantenimientos");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { refresh(); }, [refresh]);

  const createMaintenance = useCallback(async (payload: CreateMaintenancePayload): Promise<ApiMaintenance> => {
    const res = await fetch(`/api/company/${companyId}/maintenances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_id: payload.assetId,
        title: payload.title,
        kind: payload.kind,
        priority: payload.priority,
        status: payload.status,
        scheduled_date: payload.scheduledDate,
        due_date: payload.dueDate,
        completed_date: payload.completedDate,
        technician: payload.responsible,
        photo_urls: payload.photoNames,
        notes: payload.notes,
      }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const created = mapApi(await res.json());
    setMaintenances((prev) => [created, ...prev]);
    return created;
  }, [companyId]);

  const updateMaintenance = useCallback(async (id: string, payload: UpdateMaintenancePayload): Promise<ApiMaintenance> => {
    const body: Record<string, unknown> = {};
    if (payload.assetId !== undefined) body.asset_id = payload.assetId;
    if (payload.title !== undefined) body.title = payload.title;
    if (payload.kind !== undefined) body.kind = payload.kind;
    if (payload.priority !== undefined) body.priority = payload.priority;
    if (payload.status !== undefined) body.status = payload.status;
    if (payload.scheduledDate !== undefined) body.scheduled_date = payload.scheduledDate;
    if (payload.dueDate !== undefined) body.due_date = payload.dueDate;
    if (payload.completedDate !== undefined) body.completed_date = payload.completedDate;
    if (payload.responsible !== undefined) body.technician = payload.responsible;
    if (payload.photoNames !== undefined) body.photo_urls = payload.photoNames;
    if (payload.notes !== undefined) body.notes = payload.notes;

    const res = await fetch(`/api/company/${companyId}/maintenances/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const updated = mapApi(await res.json());
    setMaintenances((prev) => prev.map((m) => (m.id === id ? updated : m)));
    return updated;
  }, [companyId]);

  const deleteMaintenance = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/company/${companyId}/maintenances/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    setMaintenances((prev) => prev.filter((m) => m.id !== id));
  }, [companyId]);

  const completeMaintenance = useCallback(async (id: string, completedDate: string): Promise<ApiMaintenance> => {
    const res = await fetch(`/api/company/${companyId}/maintenances/${id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_date: completedDate }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const updated = mapApi(await res.json());
    setMaintenances((prev) => prev.map((m) => (m.id === id ? updated : m)));
    return updated;
  }, [companyId]);

  return {
    maintenances,
    loading,
    error,
    refresh,
    createMaintenance,
    updateMaintenance,
    deleteMaintenance,
    completeMaintenance,
  };
}