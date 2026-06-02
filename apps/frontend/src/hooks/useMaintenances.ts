import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

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
  technician: string;
  photoUrls: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  laborCost: number | null;
  partsCost: number | null;
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
  technician: string;     
  laborCost: number | null;
  partsCost: number | null;
  photoUrls: string[];   
  notes: string;
};

export type UpdateMaintenancePayload = Partial<CreateMaintenancePayload>;

function mapApi(raw: Record<string, unknown>): ApiMaintenance {
  return {
    id: String(raw.id),
    companyId: raw.company_id as number,
    assetId: String(raw.assetId ?? raw.asset_id),
    title: (raw.title as string) ?? "",
    kind: (raw.kind as MaintenanceKind) ?? "Preventivo",
    priority: (raw.priority as MaintenancePriority) ?? "Programado",
    status: (raw.status as MaintenanceStatus) ?? "Pendiente",
    scheduledDate: String(raw.scheduledDate ?? raw.scheduled_date ?? ""),
    dueDate: String(raw.dueDate ?? raw.due_date ?? ""),
    completedDate: String(raw.completedDate ?? raw.completed_date ?? ""),
    technician: String(raw.technician ?? raw.responsible ?? ""),
    photoUrls: Array.isArray(raw.photoUrls ?? raw.photo_urls) 
      ? (raw.photoUrls ?? raw.photo_urls) as string[] 
      : [],
    notes: (raw.notes as string) ?? "",
    createdAt: (raw.created_at as string) ?? "",
    laborCost: raw.laborCost != null ? Number(raw.laborCost) : null,
    partsCost: raw.partsCost != null ? Number(raw.partsCost) : null,
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
        assetId: payload.assetId, 
        title: payload.title,
        kind: payload.kind,
        priority: payload.priority,
        status: payload.status,
        scheduledDate: payload.scheduledDate,
        dueDate: payload.dueDate,
        technician: payload.technician, 
        photoUrls: payload.photoUrls,   
        notes: payload.notes,
        laborCost: payload.laborCost,
        partsCost: payload.partsCost,
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
    if (payload.technician !== undefined) body.technician = payload.technician;
    if (payload.photoUrls !== undefined) body.photoUrls = payload.photoUrls;
    if (payload.notes !== undefined) body.notes = payload.notes;
    if (payload.laborCost !== undefined) body.laborCost = payload.laborCost;
    if (payload.partsCost !== undefined) body.partsCost = payload.partsCost;

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