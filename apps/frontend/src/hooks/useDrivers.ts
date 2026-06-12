"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export type ApiDriver = {
  id: string;
  companyId: number;
  siteId: string | null;
  code: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  licenseNumber: string;
  licenseType: string;
  licenseExpiry: string;
  licensePoints: number;
  status: "Activo" | "Inactivo";
  site: string;
  notes: string;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  // ── Backend enrichment (display-only) ──────────────────────────────────────
  /** Site name — avoids separate useSites() call */
  siteName: string | null;
};

type CreateDriverPayload = {
  code: string;
  name: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  licenseType: string;
  licenseExpiry: string;
  licensePoints: number;
  email: string;
  phone: string;
  site: string;
  status: "Activo" | "Inactivo";
  notes: string;
  photoUrl: string | null;
};

type UpdateDriverPayload = Partial<CreateDriverPayload>;

function mapApi(raw: Record<string, unknown>): ApiDriver {
  const firstName = (raw.firstName as string) ?? "";
  const lastName  = (raw.lastName  as string) ?? "";
  return {
    id: String(raw.id),
    companyId: raw.companyId as number,
    siteId: (raw.siteId as string | null) ?? null,
    code: (raw.code as string) ?? "",
    name: `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    email: (raw.email as string) ?? "",
    phone: (raw.phone as string) ?? "",
    licenseNumber: (raw.licenseNumber as string) ?? "",
    licenseType: (raw.licenseType as string) ?? "",
    licenseExpiry: (raw.licenseExpiry as string) ?? "",
    licensePoints: (raw.licensePoints as number) ?? 0,
    status: (raw.status as "Activo" | "Inactivo") ?? "Activo",
    site: (raw.site as string) ?? "",
    notes: (raw.notes as string) ?? "",
    photoUrl: (raw.photoUrl as string | null) ?? null,
    createdAt: (raw.createdAt as string) ?? "",
    updatedAt: (raw.updatedAt as string) ?? "",
    // ── Backend enrichment ──────────────────────────────────────────────────────
    siteName: (raw.siteName as string | null) ?? null,
  };
}

export function useDrivers() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [drivers, setDrivers] = useState<ApiDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/drivers`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setDrivers((json.data ?? json).map(mapApi));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar conductores");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { refresh(); }, [refresh]);

  const createDriver = useCallback(async (payload: CreateDriverPayload): Promise<ApiDriver> => {
    const res = await fetch(`/api/company/${companyId}/drivers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ✅ camelCase — coincide con el Zod schema del backend
      body: JSON.stringify({
        code: payload.code,
        firstName: payload.firstName,
        lastName: payload.lastName,
        licenseNumber: payload.licenseNumber,
        licenseType: payload.licenseType,
        licenseExpiry: payload.licenseExpiry || null,
        licensePoints: payload.licensePoints,
        email: payload.email || null,
        phone: payload.phone || null,
        status: payload.status,
        notes: payload.notes || null,
        photoUrl: payload.photoUrl ?? null,
      }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const created = mapApi(await res.json());
    setDrivers((prev) => [created, ...prev]);
    return created;
  }, [companyId]);

  const updateDriver = useCallback(async (id: string, payload: UpdateDriverPayload): Promise<ApiDriver> => {
    // ✅ camelCase — coincide con el Zod schema del backend
    const body: Record<string, unknown> = {};
    if (payload.code          !== undefined) body.code          = payload.code;
    if (payload.firstName     !== undefined) body.firstName     = payload.firstName;
    if (payload.lastName      !== undefined) body.lastName      = payload.lastName;
    if (payload.licenseNumber !== undefined) body.licenseNumber = payload.licenseNumber;
    if (payload.licenseType   !== undefined) body.licenseType   = payload.licenseType;
    if (payload.licenseExpiry !== undefined) body.licenseExpiry = payload.licenseExpiry || null;
    if (payload.licensePoints !== undefined) body.licensePoints = payload.licensePoints;
    if (payload.email         !== undefined) body.email         = payload.email || null;
    if (payload.phone         !== undefined) body.phone         = payload.phone || null;
    if (payload.status        !== undefined) body.status        = payload.status;
    if (payload.notes         !== undefined) body.notes         = payload.notes || null;
    if (payload.photoUrl      !== undefined) body.photoUrl      = payload.photoUrl;

    const res = await fetch(`/api/company/${companyId}/drivers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const updated = mapApi(await res.json());
    setDrivers((prev) => prev.map((d) => (d.id === id ? updated : d)));
    return updated;
  }, [companyId]);

  const deleteDriver = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/company/${companyId}/drivers/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    setDrivers((prev) => prev.filter((d) => d.id !== id));
  }, [companyId]);

  return { drivers, loading, error, refresh, createDriver, updateDriver, deleteDriver };
}

/** Sube 1 foto al endpoint de conductores y devuelve la URL pública. */
export async function uploadDriverPhoto(file: File, companyId: number): Promise<string> {
  const fd = new FormData();
  fd.append("photos", file); 
  const res = await fetch(`/api/upload/driver-photos?companyId=${companyId}`, {  
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Upload driver: HTTP ${res.status}`);
  const json = await res.json();
  const url = Array.isArray(json.urls) ? json.urls[0] : json.url;
  if (!url) throw new Error("Upload driver: respuesta sin URL");
  return url;
}