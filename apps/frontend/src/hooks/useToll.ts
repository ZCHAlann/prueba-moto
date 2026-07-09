"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { compressIfImage, COMPRESS_OPTS_EVIDENCE } from "../lib/mediaCompress";

export type ApiTollEntry = {
  id: string;
  companyId: string;
  assetId: string;
  driverId: string | null;
  date: string;
  tollName: string;
  category: string | null;
  amount: number;
  paymentMethod: string | null;
  route: string | null;
  odometer: number | null;
  axes: number | null;
  notes: string | null;
  photoUrl: string | null;
  // ── Backend enrichment (display-only) ──────────────────────────────────────
  assetPlate: string | null;
  assetBrand: string | null;
  assetModel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateTollPayload = {
  assetId:       string;
  driverId?:     string | null;
  date:          string;
  tollName:      string;
  category?:     string | null;
  amount:        number;
  paymentMethod?: string | null;
  route?:        string | null;
  odometer?:     number | null;
  axes?:         number | null;
  notes?:        string | null;
  photoUrl?:     string | null;
  // jul 2026 — número de factura / comprobante del peaje. Si viene vacío
  // o ausente, no se crea fila en el ledger de facturas.
  // El backend lo rechaza con 400 si se manda al editar (es inmutable
  // post-creación, como en combustible).
  invoiceNumber?: string | null;
};

export type UpdateTollPayload = Partial<CreateTollPayload>;

export type TollLookupAsset = {
  id: string;
  plate: string;
  brand: string | null;
  model: string | null;
};

function mapApi(raw: Record<string, unknown>): ApiTollEntry {
  return {
    id:            String(raw.id),
    companyId:     String(raw.companyId ?? raw.company_id),
    assetId:       String(raw.assetId   ?? raw.asset_id),
    driverId:      raw.driverId  ? String(raw.driverId) : (raw.driver_id ? String(raw.driver_id) : null),
    date:          String(raw.date ?? ""),
    tollName:      String(raw.tollName      ?? raw.toll_name      ?? ""),
    category:      (raw.category      as string | null) ?? null,
    amount:        Number(raw.amount ?? 0),
    paymentMethod: (raw.paymentMethod as string | null) ?? (raw.payment_method as string | null) ?? null,
    route:         (raw.route         as string | null) ?? null,
    odometer:      raw.odometer !== null && raw.odometer !== undefined ? Number(raw.odometer) : null,
    axes:          raw.axes !== null && raw.axes !== undefined ? Number(raw.axes) : null,
    notes:         (raw.notes as string | null) ?? null,
    photoUrl:      (raw.photoUrl as string | null) ?? (raw.photo_url as string | null) ?? null,
    // Enrichment
    assetPlate: (raw.assetPlate as string | null) ?? null,
    assetBrand: (raw.assetBrand as string | null) ?? null,
    assetModel: (raw.assetModel as string | null) ?? null,
    createdAt:   (raw.createdAt as string) ?? (raw.created_at as string) ?? "",
    updatedAt:   (raw.updatedAt as string) ?? (raw.updated_at as string) ?? "",
  };
}

export type TollPageState = {
  data: ApiTollEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type TollFilters = {
  assetId?: string;
  driverId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

/**
 * Hook con DOS slots independientes:
 *   - `page`        → paginado al backend (la TABLA)
 *   - `allEntries`  → SIN paginar (KPIs `totalAmount` y `monthAmount` del componente)
 */
export function useToll() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  // Slot paginado.
  const [page, setPageState] = useState<TollPageState>({
    data: [], total: 0, page: 1, pageSize: 20, totalPages: 1,
  });
  // Slot "all".
  const [allEntries, setAllEntries] = useState<ApiTollEntry[]>([]);
  const [allTotal, setAllTotal]       = useState(0);
  const [assets, setAssets] = useState<TollLookupAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  /** Fetch PAGINADO para la tabla. */
  const fetchPage = useCallback(async (filters: TollFilters = {}) => {
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
      const res = await fetch(`/api/company/${companyId}/toll${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
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
      setError(err instanceof Error ? err.message : "Error al cargar peajes");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  /** Fetch SIN paginar (para KPIs del componente). */
  const fetchAll = useCallback(async (filters: Omit<TollFilters, "page" | "pageSize"> = {}) => {
    if (!companyId) return;
    try {
      const params = new URLSearchParams();
      if (filters.assetId)  params.set("assetId",  filters.assetId);
      if (filters.driverId) params.set("driverId", filters.driverId);
      if (filters.from)     params.set("from",     filters.from);
      if (filters.to)       params.set("to",       filters.to);
      params.set("nopage", "true");
      const qs = params.toString();
      const res = await fetch(`/api/company/${companyId}/toll${qs ? `?${qs}` : ""}`);
      if (!res.ok) return;
      const json = await res.json();
      setAllEntries((json.data ?? []).map(mapApi));
      setAllTotal(typeof json.total === "number" ? json.total : 0);
      if (Array.isArray(json.assets)) setAssets(json.assets);
    } catch {
      // silencioso
    }
  }, [companyId]);

  useEffect(() => { void fetchPage(); }, [fetchPage]);

  // Compatibilidad: `tollEntries` = data de la página actual, `refresh` = refetch page.
  const tollEntries = page.data;
  const refresh = useCallback(() => fetchPage(), [fetchPage]);

  const createTollEntry = useCallback(async (payload: CreateTollPayload): Promise<ApiTollEntry> => {
    const res = await fetch(`/api/company/${companyId}/toll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        assetId:       payload.assetId,
        driverId:      payload.driverId || null,
        date:          payload.date,
        tollName:      payload.tollName,
        category:      payload.category || null,
        amount:        payload.amount,
        paymentMethod: payload.paymentMethod || null,
        route:         payload.route || null,
        odometer:      payload.odometer ?? null,
        axes:          payload.axes ?? null,
        notes:         payload.notes ?? "",
        photoUrl:      payload.photoUrl ?? null,
        invoiceNumber: payload.invoiceNumber ?? null,
      }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const created = mapApi(await res.json());
    setPageState((prev) => ({ ...prev, data: [created, ...prev.data], total: prev.total + 1 }));
    setAllEntries((prev) => [created, ...prev]);
    setAllTotal((t) => t + 1);
    return created;
  }, [companyId]);

  const updateTollEntry = useCallback(async (id: string, payload: UpdateTollPayload): Promise<ApiTollEntry> => {
    const res = await fetch(`/api/company/${companyId}/toll/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        ...(payload.assetId       !== undefined && { assetId:       payload.assetId }),
        ...(payload.driverId      !== undefined && { driverId:      payload.driverId }),
        ...(payload.date          !== undefined && { date:          payload.date }),
        ...(payload.tollName      !== undefined && { tollName:      payload.tollName }),
        ...(payload.category      !== undefined && { category:      payload.category }),
        ...(payload.amount        !== undefined && { amount:        payload.amount }),
        ...(payload.paymentMethod !== undefined && { paymentMethod: payload.paymentMethod }),
        ...(payload.route         !== undefined && { route:         payload.route }),
        ...(payload.odometer      !== undefined && { odometer:      payload.odometer }),
        ...(payload.axes          !== undefined && { axes:          payload.axes }),
        ...(payload.notes         !== undefined && { notes:         payload.notes }),
        ...(payload.photoUrl      !== undefined && { photoUrl:      payload.photoUrl }),
      }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const updated = mapApi(await res.json());
    setPageState((prev) => ({ ...prev, data: prev.data.map((t) => (t.id === id ? updated : t)) }));
    setAllEntries((prev) => prev.map((t) => (t.id === id ? updated : t)));
    return updated;
  }, [companyId]);

  const deleteTollEntry = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/company/${companyId}/toll/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    setPageState((prev) => ({ ...prev, data: prev.data.filter((t) => t.id !== id), total: Math.max(0, prev.total - 1) }));
    setAllEntries((prev) => prev.filter((t) => t.id !== id));
    setAllTotal((t) => Math.max(0, t - 1));
  }, [companyId]);

  return {
    // Slot paginado.
    tollEntries,
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
    // Slot "all".
    allEntries,
    allTotal,
    assets,
    loading,
    error,
    refresh,
    fetchPage,
    fetchAll,
    createTollEntry,
    updateTollEntry,
    deleteTollEntry,
  };
}


/** Sube 1 foto de peaje al endpoint correspondiente y devuelve la URL pública. */
export async function uploadTollPhoto(file: File, companyId: number): Promise<string> {
  const toUpload = await compressIfImage(file, COMPRESS_OPTS_EVIDENCE);
  const fd = new FormData();
  fd.append("photos", toUpload);
  const res = await fetch(`/api/upload/toll-photos?companyId=${companyId}`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Upload toll: HTTP ${res.status}`);
  const json = await res.json();
  const url = Array.isArray(json.urls) ? json.urls[0] : json.url;
  if (!url) throw new Error("Upload toll: respuesta sin URL");
  return url;
}
