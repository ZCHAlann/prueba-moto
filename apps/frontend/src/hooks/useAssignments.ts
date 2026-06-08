import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export type ApiAssignment = {
  id: string;
  companyId: number;
  assetId: string;
  driverId: string;
  startDate: string;
  endDate: string | null;
  status: "Activa" | "Inactiva" | "Finalizada";
  notes: string;
  handoverUrl: string | null;
  // ── Acta de entrega ──────────────────
  actaNumber:       string | null;
  actaDate:         string | null;
  actaTime:         string | null;
  actaPlace:        string | null;
  actaArea:         string | null;
  driverDni:        string | null;
  driverPhone:      string | null;
  driverRole:       string | null;
  vehicleOdometer:  string | null;
  vehicleFuelLevel: string | null;
  vehicleCondition: string | null;
  novedades:        Record<string, unknown>;
  accesorios:       Record<string, unknown>;
  novedadesText:    string | null;
  signatureLogUrl:  string | null;
  signatureRespUrl: string | null;
  vehiclePhotoUrls: string[];
  createdAt: string;
  updatedAt: string;
  // ── Backend enrichment (display-only) ──────────────────────────────────────
  /** Asset name for display without a separate useAssets() call */
  assetName: string | null;
  assetPlate: string | null;
  assetBrand: string | null;
  /** Driver name for display without a separate useDrivers() call */
  driverName: string | null;
  driverCode: string | null;
};

export type HandoverPayload = {
  actaNumber?:       string | null;
  actaDate?:         string | null;
  actaTime?:         string | null;
  actaPlace?:        string | null;
  actaArea?:         string | null;
  driverDni?:        string | null;
  driverPhone?:      string | null;
  driverRole?:       string | null;
  vehicleOdometer?:  string | null;
  vehicleFuelLevel?: string | null;
  vehicleCondition?: string | null;
  novedades?:        Record<string, unknown>;
  accesorios?:       Record<string, unknown>;
  novedadesText?:    string | null;
  signatureLogUrl?:  string | null;
  signatureRespUrl?: string | null;
  vehiclePhotoUrls?: string[];
  handoverUrl?:      string | null;
};

type CreateAssignmentPayload = {
  assetId: string;
  driverId: string;
  startDate: string;
  endDate?: string | null;
  notes?: string;
};

function mapApi(raw: Record<string, unknown>): ApiAssignment {
  return {
    id:               String(raw.id),
    companyId:        raw.companyId as number,
    assetId:          String(raw.assetId ?? raw.asset_id),
    driverId:         String(raw.driverId ?? raw.driver_id),
    startDate:   String(raw.startDate ?? raw.start_date ?? ""),
    endDate:     (raw.endDate ?? raw.end_date ?? null) as string | null,
    status:           (raw.status as ApiAssignment["status"]) ?? "Activa",
    notes:            (raw.notes as string) ?? "",
    handoverUrl: (raw.handoverUrl ?? raw.handover_url ?? null) as string | null,
    actaNumber:       (raw.actaNumber as string | null) ?? null,
    actaDate:         (raw.actaDate as string | null) ?? null,
    actaTime:         (raw.actaTime as string | null) ?? null,
    actaPlace:        (raw.actaPlace as string | null) ?? null,
    actaArea:         (raw.actaArea as string | null) ?? null,
    driverDni:        (raw.driverDni as string | null) ?? null,
    driverPhone:      (raw.driverPhone as string | null) ?? null,
    driverRole:       (raw.driverRole as string | null) ?? null,
    vehicleOdometer:  (raw.vehicleOdometer as string | null) ?? null,
    vehicleFuelLevel: (raw.vehicleFuelLevel as string | null) ?? null,
    vehicleCondition: (raw.vehicleCondition as string | null) ?? null,
    novedades:        (raw.novedades as Record<string, unknown>) ?? {},
    accesorios:       (raw.accesorios as Record<string, unknown>) ?? {},
    novedadesText:    (raw.novedadesText as string | null) ?? null,
    signatureLogUrl:  (raw.signatureLogUrl as string | null) ?? null,
    signatureRespUrl: (raw.signatureRespUrl as string | null) ?? null,
    vehiclePhotoUrls: (raw.vehiclePhotoUrls as string[]) ?? [],
    createdAt:        (raw.createdAt as string) ?? "",
    updatedAt:        (raw.updatedAt as string) ?? "",
    // ── Backend enrichment ──────────────────────────────────────────────────────
    assetName:    (raw.assetName as string | null) ?? null,
    assetPlate:   (raw.assetPlate as string | null) ?? null,
    assetBrand:   (raw.assetBrand as string | null) ?? null,
    driverName:   (raw.driverName as string | null) ?? null,
    driverCode:   (raw.driverCode as string | null) ?? null,
  };
}

export function useAssignments() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [assignments, setAssignments] = useState<ApiAssignment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

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

  const createAssignment = useCallback(
    async (payload: CreateAssignmentPayload): Promise<ApiAssignment> => {
      const res = await fetch(`/api/company/${companyId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId:   payload.assetId,
          driverId:  payload.driverId,
          startDate: payload.startDate,
          endDate:   payload.endDate ?? null,
          notes:     payload.notes ?? "",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `Error ${res.status}`);
      }
      const created = mapApi(await res.json());
      setAssignments((prev) => [created, ...prev]);
      return created;
    },
    [companyId],
  );

  const updateHandover = useCallback(
    async (id: string, payload: HandoverPayload): Promise<ApiAssignment> => {
      const res = await fetch(`/api/company/${companyId}/assignments/${id}/handover`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `Error ${res.status}`);
      }
      const updated = mapApi(await res.json());
      setAssignments((prev) => prev.map((a) => (a.id === id ? updated : a)));
      return updated;
    },
    [companyId],
  );

  const finalizeAssignment = useCallback(
    async (id: string, endDate: string): Promise<ApiAssignment> => {
      const res = await fetch(`/api/company/${companyId}/assignments/${id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ end_date: endDate }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const updated = mapApi(await res.json());
      setAssignments((prev) => prev.map((a) => (a.id === id ? updated : a)));
      return updated;
    },
    [companyId],
  );

  return { assignments, loading, error, refresh, createAssignment, updateHandover, finalizeAssignment };
}