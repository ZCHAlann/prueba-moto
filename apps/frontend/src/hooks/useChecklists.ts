"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ChecklistItemPresence = "SI" | "NO";
export type ChecklistItemCondition = "Bueno" | "Regular" | "Malo";
export type ChecklistStatus = "Aprobado" | "Observado" | "Pendiente" | "Rechazado";
export type ChecklistTargetKind = "Vehiculo" | "Generador" | "Motor" | "AireAcondicionado" | "Otro";

/** Item individual dentro de una inspección. Coincide con el schema del backend. */
export type ChecklistInspectionItem = {
  itemName: string;
  hasItem: ChecklistItemPresence;
  condition?: ChecklistItemCondition | null;
  comment?: string | null;
  photoUrl?: string | null;
};

export type Checklist = {
  id: string;
  targetKind: ChecklistTargetKind;
  targetLabel: string | null;
  assetId: string | null;
  driverId: string | null;
  inspectorId: string | null;
  inspector: string;        // legacy: cuando backend aún enviaba inspector_name
  categoryId: string | null;
  categoryName: string | null;
  date: string;             // "YYYY-MM-DD"
  status: ChecklistStatus;
  summary: string | null;
  findings: string | null;
  items: ChecklistInspectionItem[];
  photoUrls: string[];
  // ── Backend enrichment (display-only) ──────────────────────────────────────
  assetName: string | null;
  driverName: string | null;
  categoryName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateChecklistInput = {
  targetKind: ChecklistTargetKind;
  targetLabel: string;
  assetId: string | null;
  driverId: string | null;
  categoryId: string | null;
  date: string;             // "YYYY-MM-DD"
  status: ChecklistStatus;
  summary?: string;
  findings?: string;
  items: ChecklistInspectionItem[];
  photoUrls?: string[];
  // Si viene, el checklist se crea como consecuencia de una reautorización
  // aprobada (checklist atrasado). El backend setea isLate=true y permite
  // bypassear el bloqueo de ciclo cerrado.
  reauthRequestId?: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convierte "asset-12" → 12. Devuelve null si no matchea. */
function parseNumericId(prefixedId: string | null | undefined): number | null {
  if (!prefixedId) return null;
  const m = /^[a-z-]+-(\d+)$/.exec(prefixedId);
  return m ? Number(m[1]) : null;
}

// ─── Mapper: shape del backend → Checklist del frontend ─────────────────────

function mapApi(raw: Record<string, unknown>): Checklist {
  return {
    id:           String(raw.id),
    targetKind:   (raw.targetKind as ChecklistTargetKind) ?? "Vehiculo",
    targetLabel:  (raw.targetLabel as string | null) ?? null,
    assetId:      raw.assetId ? String(raw.assetId) : (raw.asset_id ? `asset-${raw.asset_id}` : null),
    driverId:     raw.driverId ? String(raw.driverId) : (raw.driver_id ? `driver-${raw.driver_id}` : null),
    inspectorId:  raw.inspectorId ? String(raw.inspectorId) : null,
    inspector:    String(raw.inspector ?? raw.inspector_name ?? ""),
    categoryId:   raw.categoryId ? String(raw.categoryId) : (raw.category_id ? `checklist-category-${raw.category_id}` : null),
    categoryName: (raw.categoryName as string | null) ?? (raw.category_name as string | null) ?? null,
    date:         String(raw.date ?? "").slice(0, 10),
    status:       (raw.status as ChecklistStatus) ?? "Pendiente",
    summary:      (raw.summary as string | null) ?? null,
    findings:     (raw.findings as string | null) ?? null,
    items:        Array.isArray(raw.items) ? (raw.items as ChecklistInspectionItem[]) : [],
    photoUrls:    Array.isArray(raw.photoUrls) ? (raw.photoUrls as string[]) : (Array.isArray(raw.photo_urls) ? (raw.photo_urls as string[]) : []),
    assetName:    (raw.assetName as string | null) ?? null,
    driverName:   (raw.driverName as string | null) ?? null,
    createdAt:    String(raw.createdAt ?? ""),
    updatedAt:    String(raw.updatedAt ?? ""),
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export type ListChecklistsParams = {
  status?: ChecklistStatus;
  assetId?: string;
  driverId?: string;
  categoryId?: string;
  date?: string;       // YYYY-MM-DD (un día)
  from?: string;       // YYYY-MM-DD (rango inicio)
  to?: string;         // YYYY-MM-DD (rango fin)
};

export function useChecklists() {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const fetchChecklists = useCallback(async (params: ListChecklistsParams = {}) => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (params.status)    qs.set("status",    params.status);
      if (params.assetId)   qs.set("assetId",   params.assetId);
      if (params.driverId)  qs.set("driverId",  params.driverId);
      if (params.categoryId) qs.set("categoryId", params.categoryId);
      if (params.date)      qs.set("date",      params.date);
      if (params.from)      qs.set("from",      params.from);
      if (params.to)        qs.set("to",        params.to);
      const url = `/api/company/${companyId}/checklists${qs.toString() ? `?${qs}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`Error al cargar checklists (HTTP ${res.status})`);
      const json = await res.json();
      const raw: Array<Record<string, unknown>> = Array.isArray(json) ? json : (json.data ?? []);
      setChecklists(raw.map(mapApi));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void fetchChecklists(); }, [fetchChecklists]);

  const createChecklist = useCallback(
    async (input: CreateChecklistInput) => {
      if (!companyId) throw new Error("companyId requerido");
      const body = {
        targetKind:  input.targetKind,
        targetLabel: input.targetLabel,
        assetId:     input.assetId || null,
        driverId:    input.driverId || null,
        categoryId:  input.categoryId || null,
        date:        input.date,
        status:      input.status,
        summary:     input.summary ?? null,
        findings:    input.findings ?? null,
        items:       input.items,
        photoUrls:   input.photoUrls ?? [],
        reauthRequestId: input.reauthRequestId ?? null,
      };
      const res = await fetch(`/api/company/${companyId}/checklists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `Error al crear checklist (HTTP ${res.status})`);
      }
      await fetchChecklists();
    },
    [companyId, fetchChecklists]
  );

  const deleteChecklist = useCallback(
    async (id: string) => {
      if (!companyId) throw new Error("companyId requerido");
      const numericId = parseNumericId(id) ?? Number(id);
      const res = await fetch(`/api/company/${companyId}/checklists/checklist-${numericId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Error al eliminar checklist (HTTP ${res.status})`);
      await fetchChecklists();
    },
    [companyId, fetchChecklists]
  );

  return {
    checklists,
    loading,
    error,
    fetchChecklists,
    createChecklist,
    deleteChecklist,
    refetch: () => fetchChecklists(),
  };
}

// ─── Hook: anomalías por día / rango ────────────────────────────────────────

export type VehicleAnomaly = {
  assetId: string | null;
  assetLabel: string;
  assetName: string | null;
  assetPlate: string | null;
  count: number;
  lastAnomalyAt: string;
  checklistIds: string[];
};

export function useChecklistAnomalies() {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [anomalies, setAnomalies] = useState<VehicleAnomaly[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const fetchAnomalies = useCallback(
    async (params: { date?: string; from?: string; to?: string } = {}) => {
      if (!companyId) return;
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (params.date) qs.set("date", params.date);
        if (params.from) qs.set("from", params.from);
        if (params.to)   qs.set("to",   params.to);
        const url = `/api/company/${companyId}/checklists/anomalies${qs.toString() ? `?${qs}` : ""}`;
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setAnomalies(Array.isArray(json.data) ? json.data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    },
    [companyId]
  );

  return { anomalies, loading, error, fetchAnomalies };
}
