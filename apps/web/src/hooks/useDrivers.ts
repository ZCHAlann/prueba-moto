"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";

export type ApiDriver = {
  id: string;
  companyId: number;
  siteId: number | null;
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
};

type UpdateDriverPayload = Partial<CreateDriverPayload>;

function mapApi(raw: Record<string, unknown>): ApiDriver {
  const firstName = (raw.firstName as string) ?? "";
  const lastName  = (raw.lastName  as string) ?? "";
  return {
    id: String(raw.id),
    companyId: raw.company_id as number,
    siteId: (raw.site_id as number | null) ?? null,
    code: (raw.code as string) ?? "",
    name: `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    email: (raw.email as string) ?? "",
    phone: (raw.phone as string) ?? "",
    licenseNumber: (raw.license_number as string) ?? "",
    licenseType: (raw.license_type as string) ?? "",
    licenseExpiry: (raw.license_expiry as string) ?? "",
    licensePoints: (raw.license_points as number) ?? 0,
    status: (raw.status as "Activo" | "Inactivo") ?? "Activo",
    site: (raw.site as string) ?? "",
    notes: (raw.notes as string) ?? "",
    photoUrl: (raw.photo_url as string | null) ?? null,
    createdAt: (raw.created_at as string) ?? "",
    updatedAt: (raw.updated_at as string) ?? "",
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
      body: JSON.stringify({
        code: payload.code,
        first_name: payload.firstName,
        last_name: payload.lastName,
        license_number: payload.licenseNumber,
        license_type: payload.licenseType,
        license_expiry: payload.licenseExpiry,
        license_points: payload.licensePoints,
        email: payload.email,
        phone: payload.phone,
        site: payload.site,
        status: payload.status,
        notes: payload.notes,
      }),
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const created = mapApi(await res.json());
    setDrivers((prev) => [created, ...prev]);
    return created;
  }, [companyId]);

  const updateDriver = useCallback(async (id: string, payload: UpdateDriverPayload): Promise<ApiDriver> => {
    const body: Record<string, unknown> = {};
    if (payload.code !== undefined) body.code = payload.code;
    if (payload.firstName !== undefined) body.first_name = payload.firstName;
    if (payload.lastName !== undefined) body.last_name = payload.lastName;
    if (payload.licenseNumber !== undefined) body.license_number = payload.licenseNumber;
    if (payload.licenseType !== undefined) body.license_type = payload.licenseType;
    if (payload.licenseExpiry !== undefined) body.license_expiry = payload.licenseExpiry;
    if (payload.licensePoints !== undefined) body.license_points = payload.licensePoints;
    if (payload.email !== undefined) body.email = payload.email;
    if (payload.phone !== undefined) body.phone = payload.phone;
    if (payload.site !== undefined) body.site = payload.site;
    if (payload.status !== undefined) body.status = payload.status;
    if (payload.notes !== undefined) body.notes = payload.notes;

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