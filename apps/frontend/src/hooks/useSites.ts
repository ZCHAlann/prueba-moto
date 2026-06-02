"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { OperationalSite, SiteStatus } from "../types/fleet";

type CreateSiteInput = Omit<OperationalSite, "id" | "tenantId">;
type UpdateSiteInput = Omit<OperationalSite, "id" | "tenantId">;

type UseSitesReturn = {
  sites: OperationalSite[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createSite: (input: CreateSiteInput) => Promise<string | null>;
  updateSite: (id: string, input: UpdateSiteInput) => Promise<boolean>;
};

function mapApiToSite(data: Record<string, unknown>, companyId: string): OperationalSite {
  return {
    id: String(data.id),
    tenantId: `tenant-company-${companyId}`,
    code: String(data.code ?? ""),
    name: String(data.name ?? ""),
    city: String(data.city ?? ""),
    address: String(data.address ?? ""),
    contact: String(data.contact ?? ""),
    status: (data.status as SiteStatus) ?? "Activa",
    notes: String(data.notes ?? ""),
  };
}

function mapSiteToApi(input: CreateSiteInput | UpdateSiteInput) {
  return {
    code: input.code,
    name: input.name,
    city: input.city,
    address: input.address,
    contact: input.contact,
    status: input.status,
    notes: input.notes,
  };
}

export function useSites(): UseSitesReturn {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [sites, setSites] = useState<OperationalSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/company/${companyId}/sites`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then((body: { data: Record<string, unknown>[] }) => {
        setSites((body.data ?? []).map((item) => mapApiToSite(item, companyId)));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error cargando sedes");
      })
      .finally(() => setLoading(false));
  }, [companyId, tick]);

  const createSite = useCallback(
    async (input: CreateSiteInput): Promise<string | null> => {
      if (!companyId) return null;

      try {
        const res = await fetch(`/api/company/${companyId}/sites`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mapSiteToApi(input)),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
        }

        const data = await res.json() as Record<string, unknown>;
        const newSite = mapApiToSite(data, companyId);
        setSites((current) => [...current, newSite]);
        return String(data.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error creando sede");
        return null;
      }
    },
    [companyId]
  );

  const updateSite = useCallback(
    async (id: string, input: UpdateSiteInput): Promise<boolean> => {
      if (!companyId) return false;

      try {
        const res = await fetch(`/api/company/${companyId}/sites/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mapSiteToApi(input)),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
        }

        const data = await res.json() as Record<string, unknown>;
        const updated = mapApiToSite(data, companyId);
        setSites((current) => current.map((site) => (site.id === id ? updated : site)));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error actualizando sede");
        return false;
      }
    },
    [companyId]
  );

  return { sites, loading, error, refresh, createSite, updateSite };
}