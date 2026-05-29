"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";

export type ApiAssignment = {
  id: string;
  companyId: number;
  assetId: string;
  driverId: string;
  startDate: string;
  endDate: string | null;
  status: "Activa" | "Inactiva" | "Finalizada";
  notes: string;
  handoverFileName: string;
  createdAt: string;
  updatedAt: string;
};

type CreateAssignmentPayload = {
  assetId: string;
  driverId: string;
  startDate: string;
  endDate: string | null;
  status: "Activa";
  notes: string;
  handoverFileName: string;
};

function mapApi(raw: Record<string, unknown>): ApiAssignment {
  return {
    id: String(raw.id),
    companyId: raw.company_id as number,
    assetId: String(raw.asset_id),
    driverId: String(raw.driver_id),
    startDate: (raw.start_date as string) ?? "",
    endDate: (raw.end_date as string | null) ?? null,
    status: (raw.status as ApiAssignment["status"]) ?? "Activa",
    notes: (raw.notes as string) ?? "",
    handoverFileName: (raw.handover_url as string) ?? "",
    createdAt: (raw.created_at as string) ?? "",
    updatedAt: (raw.updated_at as string) ?? "",
  };
}

export function useAssignments() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [assignments, setAssignments] = useState<ApiAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/assignments`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setAssignments((json.data ?? json).map(mapApi));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar asignaciones");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { refresh(); }, [refresh]);

  const createAssignment = useCallback(async (payload: CreateAssignmentPayload): Promise<ApiAssignment> => {
    const res = await fetch(`/api/company/${companyId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset_id: payload.assetId,
        driver_id: payload.driverId,
        start_date: payload.startDate,
        end_date: payload.endDate,
        status: payload.status,
        notes: payload.notes,
        handover_url: payload.handoverFileName,
      }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const created = mapApi(await res.json());
    setAssignments((prev) => [created, ...prev]);
    return created;
  }, [companyId]);

  const finalizeAssignment = useCallback(async (id: string, endDate: string): Promise<ApiAssignment> => {
    const res = await fetch(`/api/company/${companyId}/assignments/${id}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ end_date: endDate }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const updated = mapApi(await res.json());
    setAssignments((prev) => prev.map((a) => (a.id === id ? updated : a)));
    return updated;
  }, [companyId]);

  return { assignments, loading, error, refresh, createAssignment, finalizeAssignment };
}