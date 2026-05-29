"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";

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

function mapApi(raw: Record<string, unknown>): ApiAlert {
  return {
    id: String(raw.id),
    companyId: raw.company_id as number,
    assetId: raw.asset_id ? String(raw.asset_id) : null,
    title: (raw.title as string) ?? "",
    type: (raw.type as AlertType) ?? "Manual",
    severity: (raw.severity as AlertSeverity) ?? "Media",
    status: (raw.status as AlertStatus) ?? "Abierta",
    dueDate: (raw.due_date as string) ?? "",
    notes: (raw.notes as string) ?? "",
    createdAt: (raw.created_at as string) ?? "",
    updatedAt: (raw.updated_at as string) ?? "",
  };
}

export function useAlerts() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [alerts, setAlerts] = useState<ApiAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/alerts`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setAlerts((json.data ?? json).map(mapApi));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar alertas");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { refresh(); }, [refresh]);

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
  }, [companyId]);

  return {
    alerts,
    loading,
    error,
    refresh,
    createAlert,
    updateAlert,
    patchAlertStatus,
    deleteAlert,
  };
}