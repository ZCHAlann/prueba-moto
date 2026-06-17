"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

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

export function useToll() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [tollEntries, setTollEntries] = useState<ApiTollEntry[]>([]);
  const [assets, setAssets] = useState<TollLookupAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/toll`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setTollEntries((json.data ?? json).map(mapApi));
      if (Array.isArray(json.assets)) setAssets(json.assets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar peajes");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { refresh(); }, [refresh]);

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
      }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const created = mapApi(await res.json());
    setTollEntries((prev) => [created, ...prev]);
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
    setTollEntries((prev) => prev.map((t) => (t.id === id ? updated : t)));
    return updated;
  }, [companyId]);

  const deleteTollEntry = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/company/${companyId}/toll/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    setTollEntries((prev) => prev.filter((t) => t.id !== id));
  }, [companyId]);

  return {
    tollEntries,
    assets,
    loading,
    error,
    refresh,
    createTollEntry,
    updateTollEntry,
    deleteTollEntry,
  };
}

/** Sube 1 foto de peaje al endpoint correspondiente y devuelve la URL pública. */
export async function uploadTollPhoto(file: File, companyId: number): Promise<string> {
  const fd = new FormData();
  fd.append("photos", file);
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
