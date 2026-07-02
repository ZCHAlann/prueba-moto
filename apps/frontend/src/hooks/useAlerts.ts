import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export type AlertSeverity = "Alta" | "Media" | "Baja";
export type AlertStatus = "Abierta" | "En seguimiento" | "Cerrada";
export type AlertType = "Vencimiento" | "Mantenimiento" | "Manual";

export type ApiAlert = {
  id: string;
  companyId: number;
  assetId: string | null;
  title: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  dueDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  // ── Backend enrichment (display-only) ──────────────────────────────────────
  /** Asset name — avoids separate useAssets() call */
  assetName: string | null;
  assetPlate: string | null;
};

export type CreateAlertPayload = {
  assetId: string;
  title: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  dueDate: string;
  notes: string;
};

export type UpdateAlertPayload = Partial<CreateAlertPayload>;

export type AlertsPage = {
  data: ApiAlert[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AlertsFilters = {
  status?: AlertStatus;
  severity?: AlertSeverity;
  assetId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

function mapApi(raw: Record<string, unknown>): ApiAlert {
  return {
    id: String(raw.id),
    companyId: (raw.companyId as number) ?? (raw.company_id as number),
    assetId: raw.assetId ? String(raw.assetId) : (raw.asset_id ? String(raw.asset_id) : null),
    title: (raw.title as string) ?? "",
    type: (raw.type as AlertType) ?? "Manual",
    severity: (raw.severity as AlertSeverity) ?? "Media",
    status: (raw.status as AlertStatus) ?? "Abierta",
    dueDate: (raw.dueDate as string) ?? (raw.due_date as string) ?? "",
    notes: (raw.notes as string) ?? "",
    createdAt: (raw.createdAt as string) ?? (raw.created_at as string) ?? "",
    updatedAt: (raw.updatedAt as string) ?? (raw.updated_at as string) ?? "",
    // ── Backend enrichment ──────────────────────────────────────────────────────
    assetName: (raw.assetName as string | null) ?? null,
    assetPlate: (raw.assetPlate as string | null) ?? null,
  };
}

export function useAlerts() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  // `alerts` mantiene la firma del componente (array de la página actual).
  const [alerts, setAlerts] = useState<ApiAlert[]>([]);
  const [assets, setAssets] = useState<Array<{ id: string; name: string | null; plate: string | null }>>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (filters: AlertsFilters = {}) => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.status)   params.set("status",   filters.status);
      if (filters.severity) params.set("severity", filters.severity);
      if (filters.assetId)  params.set("assetId",  filters.assetId);
      if (filters.q)        params.set("q",        filters.q);
      if (filters.page)     params.set("page",     String(filters.page));
      if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
      const qs = params.toString();
      const res = await fetch(`/api/company/${companyId}/alerts${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setAlerts((json.data ?? []).map(mapApi));
      setTotal(typeof json.total === "number" ? json.total : 0);
      setPage(typeof json.page === "number" ? json.page : 1);
      setPageSize(typeof json.pageSize === "number" ? json.pageSize : 20);
      setTotalPages(typeof json.totalPages === "number" ? json.totalPages : 1);
      if (Array.isArray(json.assets)) setAssets(json.assets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar alertas");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void fetchPage(); }, [fetchPage]);

  const createAlert = useCallback(async (payload: CreateAlertPayload): Promise<ApiAlert> => {
    const res = await fetch(`/api/company/${companyId}/alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_id: payload.assetId || null,
        title: payload.title,
        type: payload.type,
        severity: payload.severity,
        status: payload.status,
        due_date: payload.dueDate,
        notes: payload.notes,
      }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const created = mapApi(await res.json());
    setAlerts((prev) => [created, ...prev]);
    setTotal((t) => t + 1);
    return created;
  }, [companyId]);

  const updateAlert = useCallback(async (id: string, payload: UpdateAlertPayload): Promise<ApiAlert> => {
    const body: Record<string, unknown> = {};
    if (payload.assetId !== undefined) body.asset_id = payload.assetId || null;
    if (payload.title !== undefined) body.title = payload.title;
    if (payload.type !== undefined) body.type = payload.type;
    if (payload.severity !== undefined) body.severity = payload.severity;
    if (payload.status !== undefined) body.status = payload.status;
    if (payload.dueDate !== undefined) body.due_date = payload.dueDate;
    if (payload.notes !== undefined) body.notes = payload.notes;

    const res = await fetch(`/api/company/${companyId}/alerts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const updated = mapApi(await res.json());
    setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    return updated;
  }, [companyId]);

  const patchAlertStatus = useCallback(async (id: string, status: AlertStatus): Promise<ApiAlert> => {
    const res = await fetch(`/api/company/${companyId}/alerts/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const updated = mapApi(await res.json());
    setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    return updated;
  }, [companyId]);

  const deleteAlert = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/company/${companyId}/alerts/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  }, [companyId]);

  return {
    alerts,
    assets,
    total,
    page,
    pageSize,
    totalPages,
    loading,
    error,
    fetchPage,
    createAlert,
    updateAlert,
    patchAlertStatus,
    deleteAlert,
  };
}