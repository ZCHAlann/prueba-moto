"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext"; 
import type { ChecklistInspectionItem, ChecklistStatus, ChecklistTargetKind } from "../types/fleet";

export type Checklist = {
  id: string;
  targetKind: ChecklistTargetKind;
  targetLabel: string;
  assetId: string;
  inspector: string;
  inspectorId: string;
  categoryId: string;
  categoryName: string;
  date: string;
  status: ChecklistStatus;
  summary: string;
  findings: string;
  items: ChecklistInspectionItem[];
};

export type CreateChecklistInput = {
  targetKind: ChecklistTargetKind;
  targetId: string;       // "asset-5" | "motor-2" | etc.
  targetLabel: string;
  assetId: string;        // "asset-5" o "" si no es vehículo
  inspectorId: string;    // "driver-3"
  inspector: string;
  categoryId: string;     // "checklist-category-1"
  categoryName: string;
  date: string;
  status: ChecklistStatus;
  summary: string;
  findings: string;
  items: ChecklistInspectionItem[];
};

function parseNumericId(prefixedId: string): number | null {
  const match = /^[a-z-]+-(\d+)$/.exec(prefixedId);
  return match ? Number(match[1]) : null;
}

export function useChecklists() {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChecklists = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/checklists`);
      if (!res.ok) throw new Error("Error al cargar checklists");
      const json = await res.json();
      const raw: Array<Record<string, unknown>> = json.data ?? json;
      setChecklists(
        raw.map((c) => ({
          id: String(c.id),
          targetKind: (c.target_kind as ChecklistTargetKind) ?? "Vehiculo",
          targetLabel: String(c.target_label ?? ""),
          assetId: c.asset_id ? `asset-${c.asset_id}` : "",
          inspector: String(c.inspector_name ?? ""),
          inspectorId: c.driver_id ? `driver-${c.driver_id}` : "",
          categoryId: c.category_id ? `checklist-category-${c.category_id}` : "",
          categoryName: String(c.category_name ?? ""),
          date: String(c.date ?? "").slice(0, 16).replace("T", " "),
          status: (c.status as ChecklistStatus) ?? "Pendiente",
          summary: String(c.summary ?? ""),
          findings: String(c.findings ?? ""),
          items: Array.isArray(c.items) ? (c.items as ChecklistInspectionItem[]) : [],
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchChecklists(); }, [fetchChecklists]);

  const createChecklist = useCallback(
    async (input: CreateChecklistInput) => {
      if (!companyId) return;

      // Limpiar imagePreview antes de enviar al backend
      const itemsForApi = input.items.map(({ imagePreview: _preview, ...rest }) => rest);

      const body = {
        target_kind: input.targetKind,
        target_label: input.targetLabel,
        asset_id: parseNumericId(input.assetId),
        driver_id: parseNumericId(input.inspectorId),
        inspector_name: input.inspector,
        category_id: parseNumericId(input.categoryId),
        category_name: input.categoryName,
        date: input.date,
        status: input.status,
        summary: input.summary,
        findings: input.findings,
        items: itemsForApi,
      };

      const res = await fetch(`/api/company/${companyId}/checklists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Error al crear checklist");
      }
      await fetchChecklists();
    },
    [companyId, fetchChecklists]
  );

  return { checklists, loading, error, createChecklist, refetch: fetchChecklists };
}