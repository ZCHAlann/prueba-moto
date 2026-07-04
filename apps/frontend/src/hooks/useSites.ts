"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { OperationalSite, SiteStatus } from "../types/fleet";

type CreateSiteInput = Omit<OperationalSite, "id" | "tenantId">;
type UpdateSiteInput = Omit<OperationalSite, "id" | "tenantId">;

// ── Enrichment: vehículos y conductores vinculados a la sede ───────────────
// El backend resuelve esto en GET /sites (ver routes/company/sites.ts), así
// que esta página no necesita combinar con useAssets()/useDrivers() aparte.
export interface SiteLinkedAsset {
  id: string;
  name: string;
  plate: string | null;
  status: string | null;
  brand: string | null;
  model: string | null;
}

export interface SiteLinkedDriver {
  id: string;
  firstName: string;
  lastName: string;
  status: string | null;
  licenseType: string | null;
}

export type EnrichedOperationalSite = OperationalSite & {
  assetCount: number;
  driverCount: number;
  assets: SiteLinkedAsset[];
  drivers: SiteLinkedDriver[];
};

type UseSitesReturn = {
  sites: EnrichedOperationalSite[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createSite: (input: CreateSiteInput) => Promise<string | null>;
  updateSite: (id: string, input: UpdateSiteInput) => Promise<boolean>;
  /**
   * Vista previa del impacto de desactivar una sede.
   * Devuelve conteos de conductores/vehículos afectados. Usado por
   * el modal de confirmación antes del PUT.
   */
  getSiteImpact: (id: string) => Promise<SiteImpactPreview | null>;
};

/** Shape de la respuesta de GET /:siteId/impact (Fase 2.4). */
export interface SiteImpactPreview {
  site: { id: string; name: string; status: string };
  /** Conductores manualmente Activos que se bloquearían al desactivar la sede */
  affectedDriversOnDeactivation: number;
  driversActivosCount: number;
  driversInactivosCount: number;
  assetsCount: number;
}

function mapApiToSite(data: Record<string, unknown>, companyId: string): EnrichedOperationalSite {
  return {
    id: String(data.id ?? ""),
    tenantId: `tenant-company-${companyId}`,
    code: String(data.code ?? ""),
    name: String(data.name ?? ""),
    city: String(data.city ?? ""),
    address: String(data.address ?? ""),
    contact: String(data.contact ?? ""),
    status: (data.status as SiteStatus) ?? "Activa",
    notes: String(data.notes ?? ""),
    // ── Enrichment del backend ──────────────────────────────────────────────
    assetCount: Number(data.assetCount ?? 0),
    driverCount: Number(data.driverCount ?? 0),
    assets: Array.isArray(data.assets) ? (data.assets as SiteLinkedAsset[]) : [],
    drivers: Array.isArray(data.drivers) ? (data.drivers as SiteLinkedDriver[]) : [],
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

  const [sites, setSites] = useState<EnrichedOperationalSite[]>([]);
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
        // El PUT no recalcula assets/drivers vinculados (no cambian al editar
        // los datos de la sede) — conservamos los que ya teníamos en memoria.
        setSites((current) =>
          current.map((site) =>
            site.id === id
              ? { ...updated, assetCount: site.assetCount, driverCount: site.driverCount, assets: site.assets, drivers: site.drivers }
              : site
          )
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error actualizando sede");
        return false;
      }
    },
    [companyId]
  );

  // ── Vista previa del impacto de desactivar una sede (Fase 2.4) ─────────
  const getSiteImpact = useCallback(
    async (id: string): Promise<SiteImpactPreview | null> => {
      if (!companyId) return null;
      try {
        const res = await fetch(
          `/api/company/${companyId}/sites/${id}/impact`,
          { credentials: "include" },
        );
        if (!res.ok) return null;
        const data = await res.json() as Record<string, unknown>;
        return {
          site: {
            id: String((data.site as Record<string, unknown>)?.id ?? id),
            name: String((data.site as Record<string, unknown>)?.name ?? ""),
            status: String((data.site as Record<string, unknown>)?.status ?? "Activa"),
          },
          affectedDriversOnDeactivation: Number(data.affectedDriversOnDeactivation ?? 0),
          driversActivosCount:          Number(data.driversActivosCount ?? 0),
          driversInactivosCount:         Number(data.driversInactivosCount ?? 0),
          assetsCount:                   Number(data.assetsCount ?? 0),
        };
      } catch {
        return null;
      }
    },
    [companyId]
  );

  return { sites, loading, error, refresh, createSite, updateSite, getSiteImpact };
}