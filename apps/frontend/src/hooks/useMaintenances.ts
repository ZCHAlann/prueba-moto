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
  isOverdue: boolean;
  // ── Backend enrichment (display-only) ──────────────────────────────────────
  /** Vehicle name — avoids separate useAssets() call */
  assetName: string | null;
  assetPlate: string | null;
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
    companyId: (raw.companyId as number) ?? (raw.company_id as number),
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
    createdAt: (raw.createdAt as string) ?? (raw.created_at as string) ?? "",
    laborCost: raw.laborCost != null ? Number(raw.laborCost) : null,
    partsCost: raw.partsCost != null ? Number(raw.partsCost) : null,
    isOverdue: raw.isOverdue === true || raw.status === "Atrasado",
    updatedAt: (raw.updatedAt as string) ?? (raw.updated_at as string) ?? "",
    // ── Backend enrichment ──────────────────────────────────────────────────────
    assetName: (raw.assetName as string | null) ?? null,
    assetPlate: (raw.assetPlate as string | null) ?? null,
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
      // Track A: el backend ahora pagina. Pedimos el cap (100) para
      // que callers que aún no fueron migrados (Reports, Flotas,
      // dashboard) sigan teniendo un dataset razonable en vez de los
      // primeros 20. Cuando esos módulos se migren,，他们会换成
      // useMaintenancesListLegacy o useMaintenancesV2.
      const res = await fetch(`/api/company/${companyId}/maintenances?pageSize=100`);
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

// ─── useMaintenancesList (Track A) ────────────────────────────────────────────
//
// Variante paginada del hook legacy: acepta filtros + page/pageSize y los
// manda al backend en el querystring. Devuelve la página actual + total/
// totalPages del universo filtrado. Para componentes que ya fueron migrados
// a useMaintenancesV2, este hook es opcional. Se conserva para mantener
// compatibilidad con callers existentes que no quieren reescribir.
export type LegacyMaintenanceListFilters = {
  status?: MaintenanceStatus;
  type?: MaintenanceKind;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export function useMaintenancesListLegacy(filters: LegacyMaintenanceListFilters = {}) {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [maintenances, setMaintenances] = useState<ApiMaintenance[]>([]);
  const [total, setTotal]       = useState<number>(0);
  // Estado interno de paginación. El componente puede llamar `setPage(n)` para
  // avanzar/retroceder; el próximo fetch lo manda en el querystring.
  const [page, setPage]         = useState<number>(filters.page ?? 1);
  const [pageSize, setPageSize] = useState<number>(filters.pageSize ?? 20);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status)   params.set("status",   filters.status);
      if (filters.type)     params.set("type",     filters.type);
      if (filters.q)        params.set("q",        filters.q);
      if (filters.from)     params.set("from",     filters.from);
      if (filters.to)       params.set("to",       filters.to);
      // `page` viene del estado local para que `setPage` realmente cambie
      // la página solicitada al backend.
      params.set("page", String(page));
      if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
      const qs = params.toString();
      const res = await fetch(`/api/company/${companyId}/maintenances${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setMaintenances((json.data ?? []).map(mapApi));
      setTotal(Number(json.total ?? 0));
      setPageSize(Number(json.pageSize ?? filters.pageSize ?? 20));
      setTotalPages(Number(json.totalPages ?? 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar mantenimientos");
    } finally {
      setLoading(false);
    }
  }, [companyId, filters.status, filters.type, filters.q, filters.from, filters.to, filters.pageSize, page]);

  useEffect(() => { refresh(); }, [refresh]);

  // `setPage` envuelve el setter nativo para que el componente pueda
  // pedir un cambio de página desde la UI. NO sincroniza contra el
  // `filters.page` original — si el caller quiere pasar `page` por
  // filtro, que use el `page` retornado y dispare un re-render.
  const goToPage = useCallback((n: number) => {
    setPage(n >= 1 ? Math.trunc(n) : 1);
  }, []);

return { maintenances, total, page, pageSize, totalPages, loading, error, refresh, setPage: goToPage };
}