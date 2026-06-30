"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { compressIfImage, COMPRESS_OPTS_EVIDENCE } from "../lib/mediaCompress";
import type {
  AirConditioningUnit,
  AirConditioningStatus,
  AcServiceKind,
} from "../types/fleet";

/* ── Tipos espejo del backend (apps/backend/src/routes/company/ac-units.ts) ── */

export type AcService = {
  id: number;
  unitId: string;
  date: string;
  kind: AcServiceKind | null;
  technician: string | null;
  cost: number | null;
  findings: string | null;
  notes: string | null;
  photoUrls: string[];
  createdAt: string;
};

export type AcRefrigerantLog = {
  id: number;
  unitId: string;
  date: string;
  refrigerantType: string | null;
  quantity: number | null;
  unit: string | null;
  technician: string | null;
  reason: string | null;
  notes: string | null;
};

export type AcUnitDetail = AirConditioningUnit & {
  services: AcService[];
  refrigerantLogs: AcRefrigerantLog[];
};

type CreateUnitInput = Omit<AirConditioningUnit, "id" | "tenantId" | "site"> & {
  siteId?: string | null;
};
type UpdateUnitInput = Partial<CreateUnitInput>;
type CreateServiceInput = {
  unitId: string;
  date: string;
  kind?: AcServiceKind | null;
  technician?: string | null;
  cost?: number | null;
  findings?: string | null;
  notes?: string | null;
  photoUrls: string[];
};

/* ── Mappers ──────────────────────────────────────────────────────────────── */

function mapUnit(raw: Record<string, unknown>): AirConditioningUnit {
  return {
    id: String(raw.id ?? ""),
    tenantId: "",
    code: String(raw.code ?? ""),
    name: String(raw.name ?? ""),
    type: (raw.type ?? "Split") as AirConditioningUnit["type"],
    site: "",
    siteId: raw.siteId ? String(raw.siteId) : null,
    floor: String(raw.floor ?? ""),
    area: String(raw.area ?? ""),
    serial: String(raw.serial ?? ""),
    brand: String(raw.brand ?? ""),
    model: String(raw.model ?? ""),
    capacityBtu: String(raw.capacityBtu ?? ""),
    voltage: String(raw.voltage ?? ""),
    amperage: String(raw.amperage ?? ""),
    refrigerantType: String(raw.refrigerantType ?? ""),
    installDate: String(raw.installDate ?? ""),
    technician: String(raw.technician ?? ""),
    status: (raw.status ?? "Operativo") as AirConditioningStatus,
    lastService: String(raw.lastService ?? ""),
    nextService: String(raw.nextService ?? ""),
    photoUrls: Array.isArray(raw.photoUrls) ? (raw.photoUrls as string[]) : [],
    notes: String(raw.notes ?? ""),
    // ── Backend enrichment ──────────────────────────────────────────────────────
    siteName: (raw.siteName as string | null) ?? null,
  };
}

function mapService(raw: Record<string, unknown>): AcService {
  return {
    id: Number(raw.id ?? 0),
    unitId: String(raw.unitId ?? ""),
    date: String(raw.date ?? ""),
    kind: (raw.kind ?? null) as AcServiceKind | null,
    technician: raw.technician ? String(raw.technician) : null,
    cost: raw.cost != null ? Number(raw.cost) : null,
    findings: raw.findings ? String(raw.findings) : null,
    notes: raw.notes ? String(raw.notes) : null,
    photoUrls: Array.isArray(raw.photoUrls) ? (raw.photoUrls as string[]) : [],
    createdAt: String(raw.createdAt ?? ""),
  };
}

function mapRefLog(raw: Record<string, unknown>): AcRefrigerantLog {
  return {
    id: Number(raw.id ?? 0),
    unitId: String(raw.unitId ?? ""),
    date: String(raw.date ?? ""),
    refrigerantType: raw.refrigerantType ? String(raw.refrigerantType) : null,
    quantity: raw.quantity != null ? Number(raw.quantity) : null,
    unit: raw.unit ? String(raw.unit) : null,
    technician: raw.technician ? String(raw.technician) : null,
    reason: raw.reason ? String(raw.reason) : null,
    notes: raw.notes ? String(raw.notes) : null,
  };
}

/* ── Hook principal ───────────────────────────────────────────────────────── */

export function useAcUnits() {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [units, setUnits] = useState<AirConditioningUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  /* Carga listado de unidades */
  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    fetch(`/api/company/${companyId}/ac-units`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then((body: { data: Record<string, unknown>[] }) => {
        setUnits((body.data ?? []).map(mapUnit));
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Error cargando aires acondicionados")
      )
      .finally(() => setLoading(false));
  }, [companyId, tick]);

  /* Detalle de una unidad (incluye servicios + recargas) */
  const getUnitDetail = useCallback(
    async (id: string): Promise<AcUnitDetail | null> => {
      if (!companyId) return null;
      try {
        const res = await fetch(`/api/company/${companyId}/ac-units/${id}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const raw = (await res.json()) as Record<string, unknown>;
        const unit = mapUnit(raw);
        return {
          ...unit,
          services: Array.isArray(raw.services)
            ? (raw.services as Record<string, unknown>[]).map(mapService)
            : [],
          refrigerantLogs: Array.isArray(raw.refrigerantLogs)
            ? (raw.refrigerantLogs as Record<string, unknown>[]).map(mapRefLog)
            : [],
        };
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Error cargando detalle de A/C"
        );
        return null;
      }
    },
    [companyId]
  );

  /* Crear unidad */
  const createUnit = useCallback(
    async (input: CreateUnitInput): Promise<string | null> => {
      if (!companyId) return null;
      try {
        const body: Record<string, unknown> = {
          code: input.code,
          name: input.name,
          type: input.type,
          floor: input.floor,
          area: input.area,
          serial: input.serial,
          brand: input.brand,
          model: input.model,
          capacityBtu: input.capacityBtu,
          voltage: input.voltage,
          amperage: input.amperage,
          refrigerantType: input.refrigerantType,
          installDate: input.installDate || null,
          technician: input.technician,
          status: input.status,
          lastService: input.lastService || null,
          nextService: input.nextService || null,
          photoUrls: input.photoUrls,
          notes: input.notes,
        };
        if (input.siteId) body.siteId = input.siteId;

        const res = await fetch(`/api/company/${companyId}/ac-units`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(
            (errBody as { message?: string }).message ?? `Error ${res.status}`
          );
        }
        const data = (await res.json()) as Record<string, unknown>;
        refresh();
        return String(data.id ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error creando A/C");
        return null;
      }
    },
    [companyId, refresh]
  );

  /* Actualizar unidad */
  const updateUnit = useCallback(
    async (id: string, input: UpdateUnitInput): Promise<boolean> => {
      if (!companyId) return false;
      try {
        const body: Record<string, unknown> = {};
        const fields: (keyof UpdateUnitInput)[] = [
          "code", "name", "type", "floor", "area", "serial", "brand", "model",
          "capacityBtu", "voltage", "amperage", "refrigerantType",
          "installDate", "technician", "status", "lastService",
          "nextService", "photoUrls", "notes", "siteId",
        ];
        for (const f of fields) {
          if (input[f] !== undefined) {
            if (f === "installDate" || f === "lastService" || f === "nextService") {
              body[f] = (input[f] as string) || null;
            } else if (f === "siteId") {
              body.siteId = input[f] ?? null;
            } else {
              body[f] = input[f];
            }
          }
        }

        const res = await fetch(`/api/company/${companyId}/ac-units/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(
            (errBody as { message?: string }).message ?? `Error ${res.status}`
          );
        }
        refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error actualizando A/C");
        return false;
      }
    },
    [companyId, refresh]
  );

  /* Eliminar unidad */
  const deleteUnit = useCallback(
    async (id: string): Promise<boolean> => {
      if (!companyId) return false;
      try {
        const res = await fetch(`/api/company/${companyId}/ac-units/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(
            (errBody as { message?: string }).message ?? `Error ${res.status}`
          );
        }
        setUnits((current) => current.filter((u) => u.id !== id));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error eliminando A/C");
        return false;
      }
    },
    [companyId]
  );

  /* Crear mantenimiento (servicio) con evidencia en fotos */
  const createService = useCallback(
    async (input: CreateServiceInput): Promise<boolean> => {
      if (!companyId) return false;
      try {
        const body = {
          date: input.date,
          kind: input.kind ?? null,
          technician: input.technician ?? null,
          cost: input.cost ?? null,
          findings: input.findings ?? null,
          notes: input.notes ?? null,
          photoUrls: input.photoUrls,
        };
        const res = await fetch(
          `/api/company/${companyId}/ac-units/${input.unitId}/services`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(
            (errBody as { message?: string }).message ?? `Error ${res.status}`
          );
        }
        refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error registrando mantenimiento");
        return false;
      }
    },
    [companyId, refresh]
  );

  /* Crear log de recarga de refrigerante */
  const createRefrigerantLog = useCallback(
    async (input: {
      unitId: string;
      date: string;
      refrigerantType?: string | null;
      quantity?: number | null;
      unit?: string | null;
      technician?: string | null;
      reason?: string | null;
      notes?: string | null;
    }): Promise<boolean> => {
      if (!companyId) return false;
      try {
        const res = await fetch(
          `/api/company/${companyId}/ac-units/${input.unitId}/refrigerant-logs`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: input.date,
              refrigerantType: input.refrigerantType ?? null,
              quantity: input.quantity ?? null,
              unit: input.unit ?? null,
              technician: input.technician ?? null,
              reason: input.reason ?? null,
              notes: input.notes ?? null,
            }),
          }
        );
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(
            (errBody as { message?: string }).message ?? `Error ${res.status}`
          );
        }
        refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error registrando recarga");
        return false;
      }
    },
    [companyId, refresh]
  );

  /* Subir fotos a la unidad (POST /upload/ac-photos) */
  const uploadAcPhotos = useCallback(
    async (files: File[]): Promise<string[]> => {
      if (!companyId || files.length === 0) return [];
      try {
        const form = new FormData();
        // Comprimir cada foto antes de subirla (PDFs y archivos no-imagen se suben tal cual)
        const compressed = await Promise.all(
          files.map((f) => compressIfImage(f, COMPRESS_OPTS_EVIDENCE))
        );
        compressed.forEach((f) => form.append("photos", f));
        const res = await fetch(
          `/api/upload/ac-photos?companyId=${companyId}`,
          { method: "POST", body: form }
        );
        if (!res.ok) throw new Error(`Upload ${res.status}`);
        const data = (await res.json()) as { urls?: string[] };
        return Array.isArray(data.urls) ? data.urls : [];
      } catch {
        return [];
      }
    },
    [companyId]
  );

  return {
    units,
    loading,
    error,
    refresh,
    getUnitDetail,
    createUnit,
    updateUnit,
    deleteUnit,
    createService,
    createRefrigerantLog,
    uploadAcPhotos,
  };
}
