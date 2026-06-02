"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type {
  AirConditioningUnit,
  AirConditioningStatus,
  AirConditioningType,
  AcServiceKind,
} from "../types/fleet";

export type AcService = {
  id: string;
  unitId: string;
  date: string;
  kind: AcServiceKind;
  technician: string;
  cost: string;
  findings: string;
  notes: string;
  photoUrls: string[];
};

export type AcRefrigerantLog = {
  id: string;
  unitId: string;
  date: string;
  refrigerantType: string;
  quantity: string;
  unit: "kg" | "lb" | "oz";
  technician: string;
  reason: string;
  notes: string;
};

type CreateUnitInput = Omit<AirConditioningUnit, "id" | "tenantId">;
type CreateServiceInput = Omit<AcService, "id">;
type CreateRefLogInput = Omit<AcRefrigerantLog, "id">;

function mapUnit(u: Record<string, unknown>, companyId: string): AirConditioningUnit {
  return {
    id: String(u.id),
    tenantId: `tenant-company-${companyId}`,
    code: String(u.code ?? ""),
    name: String(u.name ?? ""),
    type: (u.type ?? "Split") as AirConditioningType,
    site: String(u.site ?? u.site_id ?? ""),
    floor: String(u.floor ?? ""),
    area: String(u.area ?? ""),
    serial: String(u.serial ?? ""),
    brand: String(u.brand ?? ""),
    model: String(u.model ?? ""),
    capacityBtu: String(u.capacity_btu ?? u.capacityBtu ?? ""),
    voltage: String(u.voltage ?? ""),
    amperage: String(u.amperage ?? ""),
    refrigerantType: String(u.refrigerant_type ?? u.refrigerantType ?? ""),
    installDate: String(u.install_date ?? u.installDate ?? ""),
    technician: String(u.technician ?? ""),
    status: (u.status ?? "Operativo") as AirConditioningStatus,
    lastService: String(u.last_service ?? u.lastService ?? ""),
    nextService: String(u.next_service ?? u.nextService ?? ""),
    photoUrls: Array.isArray(u.photo_urls ?? u.photoUrls)
      ? (u.photo_urls ?? u.photoUrls) as string[]
      : [],
    notes: String(u.notes ?? ""),
  };
}

function mapService(s: Record<string, unknown>): AcService {
  return {
    id: String(s.id),
    unitId: s.unit_id ? String(s.unit_id) : String(s.unitId ?? ""),
    date: String(s.date ?? ""),
    kind: (s.kind ?? "Limpieza") as AcServiceKind,
    technician: String(s.technician ?? ""),
    cost: String(s.cost ?? ""),
    findings: String(s.findings ?? ""),
    notes: String(s.notes ?? ""),
    photoUrls: Array.isArray(s.photo_urls ?? s.photoUrls)
      ? (s.photo_urls ?? s.photoUrls) as string[]
      : [],
  };
}

function mapRefLog(l: Record<string, unknown>): AcRefrigerantLog {
  return {
    id: String(l.id),
    unitId: l.unit_id ? String(l.unit_id) : String(l.unitId ?? ""),
    date: String(l.date ?? ""),
    refrigerantType: String(l.refrigerant_type ?? l.refrigerantType ?? ""),
    quantity: String(l.quantity ?? ""),
    unit: (l.unit ?? "kg") as "kg" | "lb" | "oz",
    technician: String(l.technician ?? ""),
    reason: String(l.reason ?? ""),
    notes: String(l.notes ?? ""),
  };
}

export function useAcUnits() {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [units, setUnits] = useState<AirConditioningUnit[]>([]);
  const [services, setServices] = useState<AcService[]>([]);
  const [refrigerantLogs, setRefrigerantLogs] = useState<AcRefrigerantLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/company/${companyId}/ac-units`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/company/${companyId}/ac-units/services`, { cache: "no-store" })
        .then((r) => r.ok ? r.json() : { data: [] }),
      fetch(`/api/company/${companyId}/ac-units/refrigerant-logs`, { cache: "no-store" })
        .then((r) => r.ok ? r.json() : { data: [] }),
    ])
      .then(([unitsBody, servicesBody, logsBody]) => {
        setUnits((unitsBody.data ?? []).map((u: Record<string, unknown>) => mapUnit(u, companyId)));
        setServices((servicesBody.data ?? []).map(mapService));
        setRefrigerantLogs((logsBody.data ?? []).map(mapRefLog));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error cargando A/C"))
      .finally(() => setLoading(false));
  }, [companyId, tick]);

  const createUnit = useCallback(async (input: CreateUnitInput): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/ac-units`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: input.code,
          name: input.name,
          type: input.type,
          site: input.site,
          floor: input.floor,
          area: input.area,
          serial: input.serial,
          brand: input.brand,
          model: input.model,
          capacity_btu: input.capacityBtu,
          voltage: input.voltage,
          amperage: input.amperage,
          refrigerant_type: input.refrigerantType,
          install_date: input.installDate || null,
          technician: input.technician,
          status: input.status,
          last_service: input.lastService || null,
          next_service: input.nextService || null,
          photo_urls: input.photoUrls,
          notes: input.notes,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      }
      refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando unidad A/C");
      return false;
    }
  }, [companyId, refresh]);

  const updateUnit = useCallback(async (id: string, input: Partial<CreateUnitInput>): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/ac-units/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(input.code !== undefined && { code: input.code }),
          ...(input.name !== undefined && { name: input.name }),
          ...(input.type !== undefined && { type: input.type }),
          ...(input.site !== undefined && { site: input.site }),
          ...(input.floor !== undefined && { floor: input.floor }),
          ...(input.area !== undefined && { area: input.area }),
          ...(input.serial !== undefined && { serial: input.serial }),
          ...(input.brand !== undefined && { brand: input.brand }),
          ...(input.model !== undefined && { model: input.model }),
          ...(input.capacityBtu !== undefined && { capacity_btu: input.capacityBtu }),
          ...(input.voltage !== undefined && { voltage: input.voltage }),
          ...(input.amperage !== undefined && { amperage: input.amperage }),
          ...(input.refrigerantType !== undefined && { refrigerant_type: input.refrigerantType }),
          ...(input.installDate !== undefined && { install_date: input.installDate || null }),
          ...(input.technician !== undefined && { technician: input.technician }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.lastService !== undefined && { last_service: input.lastService || null }),
          ...(input.nextService !== undefined && { next_service: input.nextService || null }),
          ...(input.photoUrls !== undefined && { photo_urls: input.photoUrls }),
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
      setError(err instanceof Error ? err.message : "Error actualizando unidad A/C");
      return false;
    }
  }, [companyId, refresh]);

  const createService = useCallback(async (input: CreateServiceInput): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/ac-units/${input.unitId}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: input.date,
          kind: input.kind,
          technician: input.technician,
          cost: input.cost ? parseFloat(input.cost) : null,
          findings: input.findings,
          notes: input.notes,
          photo_urls: input.photoUrls,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      }
      refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando servicio A/C");
      return false;
    }
  }, [companyId, refresh]);

  const createRefrigerantLog = useCallback(async (input: CreateRefLogInput): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(`/api/company/${companyId}/ac-units/${input.unitId}/refrigerant-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: input.date,
          refrigerant_type: input.refrigerantType,
          quantity: parseFloat(input.quantity),
          unit: input.unit,
          technician: input.technician,
          reason: input.reason,
          notes: input.notes,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
      }
      refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando log de refrigerante");
      return false;
    }
  }, [companyId, refresh]);

  return {
    units,
    services,
    refrigerantLogs,
    loading,
    error,
    refresh,
    createUnit,
    updateUnit,
    createService,
    createRefrigerantLog,
  };
}