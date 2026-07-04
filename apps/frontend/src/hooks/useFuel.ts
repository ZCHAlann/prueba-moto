"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { compressIfImage, COMPRESS_OPTS_EVIDENCE } from "../lib/mediaCompress";

// ─── Validación client-side de uploads ──────────────────────────────────────
// Defense in depth: el servidor valida (mimetype + extensión + companyId),
// pero también validamos aquí para fallar rápido con un mensaje claro al
// usuario en vez de gastar un round-trip HTTP.

const CLIENT_ALLOWED_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const CLIENT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function assertFileAllowed(file: File): void {
  if (!CLIENT_ALLOWED_TYPES.has(file.type)) {
    throw new Error(`Tipo de archivo no permitido: ${file.type || "(vacío)"}`);
  }
  if (file.size > CLIENT_MAX_SIZE_BYTES) {
    throw new Error("El archivo supera el tamaño máximo permitido (10 MB)");
  }
}

// ─── Helper: extraer el mensaje del backend de una response no-OK ──────────
// Si la response es JSON con { error } o { message }, lo devolvemos;
// si no, caemos al status code. Esto evita mostrar "Error 403" sin contexto.
async function extractApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.clone().json();
    if (data && typeof data === "object") {
      if (typeof data.error === "string"   && data.error.trim())   return data.error;
      if (typeof data.message === "string" && data.message.trim()) return data.message;
    }
  } catch {
    /* no era JSON */
  }
  return `${fallback} (HTTP ${res.status})`;
}

export type ApiFuelEntry = {
  id: string;
  companyId: number;
  assetId: string;
  driverId: string | null;
  date: string;
  gallons: number;
  liters: number;
  cost: number;
  odometer: number;
  station: string;
  fuelType: string;
  notes: string;
  photoUrl: string | null;
  odometerPhotoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  assetPlate: string | null;
  assetBrand: string | null;
  assetModel: string | null;
  invoiceNumber: string | null; 
};

export type CreateFuelPayload = {
  assetId: string;
  date: string;
  gallons: number;
  cost: number;
  odometer: number;
  station: string;
  notes?: string;
  photoUrl?: string | null;
  odometerPhotoUrl?: string | null;
};

export type UpdateFuelPayload = Partial<CreateFuelPayload>;

function mapApi(raw: Record<string, unknown>): ApiFuelEntry {
  return {
    id: String(raw.id),
    companyId: raw.companyId as number,
    assetId: String(raw.assetId ?? ""),
    driverId: raw.driverId ? String(raw.driverId) : null,
    date: (raw.date as string) ?? "",
    gallons: Number(raw.gallons ?? 0),
    liters: Number(raw.liters ?? 0),
    cost: Number(raw.cost ?? 0),
    odometer: Number(raw.odometer ?? 0),
    station: (raw.station as string) ?? "",
    fuelType: (raw.fuelType as string) ?? "",
    notes: (raw.notes as string) ?? "",
    photoUrl: (raw.photoUrl as string | null) ?? null,
    odometerPhotoUrl: (raw.odometerPhotoUrl as string | null) ?? null,
    createdAt: (raw.createdAt as string) ?? "",
    updatedAt: (raw.updatedAt as string) ?? "",
    assetPlate: (raw.assetPlate as string | null) ?? null,
    assetBrand: (raw.assetBrand as string | null) ?? null,
    assetModel: (raw.assetModel as string | null) ?? null,
    invoiceNumber: (raw.invoiceNumber as string | null) ?? null
  };
}

// Upload del recibo de combustible
export async function uploadFuelPhoto(file: File, companyId: number): Promise<string> {
  assertFileAllowed(file);

  const toUpload = await compressIfImage(file, COMPRESS_OPTS_EVIDENCE);
  const fd = new FormData();
  fd.append("photos", toUpload);
  const res = await fetch(`/api/upload/fuel-photos?companyId=${companyId}`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) throw new Error(await extractApiError(res, "Upload fuel"));
  const json = await res.json();
  const url = Array.isArray(json.urls) ? json.urls[0] : json.url;
  if (!url) throw new Error("Upload fuel: respuesta sin URL");
  return url;
}

// Upload de la foto del odómetro. Mismo endpoint del backend porque
// físicamente es el mismo folder y misma validación de seguridad.
export async function uploadOdometerPhoto(file: File, companyId: number): Promise<string> {
  assertFileAllowed(file);

  const toUpload = await compressIfImage(file, COMPRESS_OPTS_EVIDENCE);
  const fd = new FormData();
  fd.append("photos", toUpload);
  const res = await fetch(`/api/upload/fuel-photos?companyId=${companyId}`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) throw new Error(await extractApiError(res, "Upload odometer"));
  const json = await res.json();
  const url = Array.isArray(json.urls) ? json.urls[0] : json.url;
  if (!url) throw new Error("Upload odometer: respuesta sin URL");
  return url;
}

export type FuelPageState = {
  data: ApiFuelEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type FuelFilters = {
  assetId?: string;
  driverId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

/**
 * Hook con DOS slots independientes:
 *   - `page`        → paginado al backend (para la TABLA)
 *   - `allEntries`  → SIN paginar (para KPIs, FuelCharts, FuelCalendarBreakdown
 *                      y exports a PDF/Excel — features que necesitan el dataset
 *                      completo del filtro aplicado).
 *
 * El componente decide qué slot usar en cada caso. Ambos slots pueden tener
 * filtros distintos y no se pisan: la tabla puede estar en página 5 mientras
 * el chart muestra los N entries del universo filtrado.
 */
export function useFuel() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  // Slot "paginada".
  const [page, setPageState] = useState<FuelPageState>({
    data: [], total: 0, page: 1, pageSize: 20, totalPages: 1,
  });
  // Slot "all" (independiente del paginado).
  const [allEntries, setAllEntries] = useState<ApiFuelEntry[]>([]);
  const [allTotal, setAllTotal]       = useState(0);
  const [assets, setAssets] = useState<Array<{ id: string; plate: string; brand: string | null; model: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  /** Fetch PAGINADO para la tabla. */
  const fetchPage = useCallback(async (filters: FuelFilters = {}) => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.assetId)  params.set("assetId",  filters.assetId);
      if (filters.driverId) params.set("driverId", filters.driverId);
      if (filters.from)     params.set("from",     filters.from);
      if (filters.to)       params.set("to",       filters.to);
      if (filters.page)     params.set("page",     String(filters.page));
      if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
      const qs = params.toString();
      const res = await fetch(`/api/company/${companyId}/fuel${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(await extractApiError(res, "Error al cargar combustible"));
      const json = await res.json();
      setPageState({
        data: (json.data ?? []).map(mapApi),
        total: typeof json.total === "number" ? json.total : 0,
        page: typeof json.page === "number" ? json.page : 1,
        pageSize: typeof json.pageSize === "number" ? json.pageSize : 20,
        totalPages: typeof json.totalPages === "number" ? json.totalPages : 1,
      });
      if (Array.isArray(json.assets)) setAssets(json.assets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar combustible");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  /** Fetch SIN paginar (para stats/charts/calendario/exports). */
  const fetchAll = useCallback(async (filters: Omit<FuelFilters, "page" | "pageSize"> = {}) => {
    if (!companyId) return;
    try {
      const params = new URLSearchParams();
      if (filters.assetId)  params.set("assetId",  filters.assetId);
      if (filters.driverId) params.set("driverId", filters.driverId);
      if (filters.from)     params.set("from",     filters.from);
      if (filters.to)       params.set("to",       filters.to);
      params.set("nopage", "true");
      const qs = params.toString();
      const res = await fetch(`/api/company/${companyId}/fuel${qs ? `?${qs}` : ""}`);
      if (!res.ok) return; // silencioso — los charts son secundarios
      const json = await res.json();
      setAllEntries((json.data ?? []).map(mapApi));
      setAllTotal(typeof json.total === "number" ? json.total : 0);
      if (Array.isArray(json.assets)) setAssets(json.assets);
    } catch {
      // silencioso
    }
  }, [companyId]);

  useEffect(() => { void fetchPage(); }, [fetchPage]);

  // Compatibilidad: `fuelEntries` = data de la página actual, `refresh` = refetch page.
  const fuelEntries = page.data;
  const refresh = useCallback(() => fetchPage(), [fetchPage]);

  const createFuelEntry = useCallback(async (payload: CreateFuelPayload): Promise<ApiFuelEntry> => {
    const res = await fetch(`/api/company/${companyId}/fuel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        assetId:          payload.assetId,
        date:             payload.date,
        gallons:          payload.gallons,
        cost:             payload.cost,
        odometer:         payload.odometer,
        station:          payload.station,
        notes:            payload.notes ?? "",
        photoUrl:         payload.photoUrl ?? null,
        odometerPhotoUrl: payload.odometerPhotoUrl ?? null,
        invoiceNumber: payload.invoiceNumber ?? null,
      }),
    });
    if (!res.ok) throw new Error(await extractApiError(res, "Error al guardar"));
    const created = mapApi(await res.json());
    // Optimistic update en ambos slots (el "all" puede incluirlo en su próxima
    // petición, pero el local update evita recargar).
    setPageState((prev) => ({ ...prev, data: [created, ...prev.data], total: prev.total + 1 }));
    setAllEntries((prev) => [created, ...prev]);
    setAllTotal((t) => t + 1);
    return created;
  }, [companyId]);

  const updateFuelEntry = useCallback(async (id: string, payload: UpdateFuelPayload): Promise<ApiFuelEntry> => {
    const res = await fetch(`/api/company/${companyId}/fuel/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        ...(payload.assetId          !== undefined && { assetId:          payload.assetId          }),
        ...(payload.date             !== undefined && { date:             payload.date             }),
        ...(payload.gallons          !== undefined && { gallons:          payload.gallons          }),
        ...(payload.cost             !== undefined && { cost:             payload.cost             }),
        ...(payload.odometer         !== undefined && { odometer:         payload.odometer         }),
        ...(payload.station          !== undefined && { station:          payload.station          }),
        ...(payload.notes            !== undefined && { notes:            payload.notes            }),
        ...(payload.photoUrl         !== undefined && { photoUrl:         payload.photoUrl         }),
        ...(payload.odometerPhotoUrl !== undefined && { odometerPhotoUrl: payload.odometerPhotoUrl }),
        ...(payload.invoiceNumber !== undefined && { invoiceNumber: payload.invoiceNumber }),
      }),
    });
    if (!res.ok) throw new Error(await extractApiError(res, "Error al actualizar"));
    const updated = mapApi(await res.json());
    setPageState((prev) => ({ ...prev, data: prev.data.map((e) => e.id === id ? updated : e) }));
    setAllEntries((prev) => prev.map((e) => e.id === id ? updated : e));
    return updated;
  }, [companyId]);

  const deleteFuelEntry = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/company/${companyId}/fuel/${id}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) throw new Error(await extractApiError(res, "Error al eliminar"));
    setPageState((prev) => ({ ...prev, data: prev.data.filter((e) => e.id !== id), total: Math.max(0, prev.total - 1) }));
    setAllEntries((prev) => prev.filter((e) => e.id !== id));
    setAllTotal((t) => Math.max(0, t - 1));
  }, [companyId]);

  return {
    // Slot paginado (la tabla).
    fuelEntries,
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
    // Slot "all" (charts / stats / exports).
    allEntries,
    allTotal,
    // Catálogo auxiliar.
    assets,
    loading,
    error,
    refresh,
    fetchPage,
    fetchAll,
    createFuelEntry,
    updateFuelEntry,
    deleteFuelEntry,
  };
}

// ─── Insights / analytics ───────────────────────────────────────────────────

export type FuelInsight = {
  kind: "positive" | "negative" | "warning" | "info";
  text: string;
  assetId?: string;
};

export type FuelPeak = {
  assetId: string;
  plate: string | null;
  name: string | null;
  date: string;
  gallons: number;
  cost: number | null;
  avgGallons: number;
  zScore: number;
  severity: "high" | "extreme";
};

export type FuelVehicleSummary = {
  assetId: string;
  plate: string | null;
  name: string | null;
  totalGallons: number;
  totalCost: number;
  records: number;
};

export type FuelEfficiencyItem = {
  assetId: string;
  plate: string | null;
  name: string | null;
  efficiency: number;
};

export type FuelTrendItem = {
  assetId: string;
  plate: string | null;
  name: string | null;
  trend: "up" | "down" | "stable";
  firstHalfAvg: number;
  secondHalfAvg: number;
  changePct: number;
};

export type FuelInsightsResponse = {
  range: { from: string | null; to: string | null; totalRecords: number };
  topConsumers:    FuelVehicleSummary[];
  bottomConsumers: FuelVehicleSummary[];
  bestEfficiency:  FuelEfficiencyItem[];
  worstEfficiency: FuelEfficiencyItem[];
  peaks:           FuelPeak[];
  trends:          FuelTrendItem[];
  insights:        FuelInsight[];
};

export function useFuelInsights(from?: string, to?: string) {
  const { session } = useAuth();
  const companyId = session?.companyId;
  const [data,    setData]    = useState<FuelInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
      if (from && DATE_RE.test(from)) params.set("from", from);
      if (to   && DATE_RE.test(to))   params.set("to",   to);
      const res = await fetch(
        `/api/company/${companyId}/fuel/analytics/insights?${params.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(await extractApiError(res, "Error al cargar insights"));
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar insights");
    } finally {
      setLoading(false);
    }
  }, [companyId, from, to]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}