// src/hooks/useCompanyLimits.ts
//
// jul 2026 — Devuelve los límites del plan asignado a la empresa actual
// y el conteo actual de usuarios por categoría. Usado por la UI de
// /accesos/usuarios para deshabilitar el botón "Nuevo usuario" cuando
// el plan está al máximo y mostrar banners de advertencia.

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

export type RoleKind = "admins" | "supervisors" | "operators" | "drivers";

export interface PlanLimits {
  maxUsers:       number | null;
  maxAdmins:      number | null;
  maxSupervisors: number | null;
  maxOperators:   number | null;
  maxDrivers:     number | null;
  maxAssets:      number | null;
  planName:       string;
  planId:         string;
}

export interface CompanyLimitsResult {
  plan: PlanLimits | null;
  counts: { total: number; admins: number; supervisors: number; operators: number; drivers: number };
  currentAssets: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** True si intentar crear un usuario con ese rol excede los límites. */
  isLimitExceeded: (roleKey: string) => boolean;
  /** True si todavía hay cupo para el rol dado. */
  canCreateRole: (roleKey: string) => boolean;
  /** True si la empresa alcanzó `maxAssets` (no se pueden crear más vehículos). */
  isAssetLimitReached: boolean;
  /** True si todavía hay cupo para crear un activo. */
  canCreateAsset: boolean;
}

function kindFromRole(roleKey: string): RoleKind | null {
  if (["owner_empresa", "admin_empresa"].includes(roleKey)) return "admins";
  if (roleKey === "supervisor") return "supervisors";
  if (roleKey === "operador")   return "operators";
  if (roleKey === "conductor")  return "drivers";
  return null; // custom roles
}

export function useCompanyLimits(): CompanyLimitsResult {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [plan, setPlan]         = useState<PlanLimits | null>(null);
  const [counts, setCounts]     = useState({ total: 0, admins: 0, supervisors: 0, operators: 0, drivers: 0 });
  const [currentAssets, setCurrentAssets] = useState(0);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const fetchLimits = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      // jul 2026 v6 — Antes pegaba a /api/platform/companies/:id/limits
      // (que requiere superadmin de plataforma). Ahora usamos
      // /api/company/:id/limits, accesible para cualquier admin/owner
      // de la empresa — que es quien realmente crea usuarios y activos.
      const res = await fetch(`/api/company/${companyId}/limits`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setPlan(json.plan ? {
        maxUsers:       json.plan.maxUsers,
        maxAdmins:      json.plan.maxAdmins,
        maxSupervisors: json.plan.maxSupervisors,
        maxOperators:   json.plan.maxOperators,
        maxDrivers:     json.plan.maxDrivers,
        maxAssets:      json.plan.maxAssets,
        planName:       json.plan.name,
        planId:         json.plan.id,
      } : null);
      setCounts(json.counts);
      setCurrentAssets(json.currentAssets ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void fetchLimits(); }, [fetchLimits]);

  function isLimitExceeded(roleKey: string): boolean {
    if (!plan) return false;
    const kind = kindFromRole(roleKey);
    if (plan.maxUsers !== null && counts.total >= plan.maxUsers) {
      return kind !== null; // solo bloquea si es uno de los roles contados
    }
    if (kind && plan[`max${kind.charAt(0).toUpperCase()}${kind.slice(1)}` as keyof PlanLimits] !== null) {
      const limit = plan[`max${kind.charAt(0).toUpperCase()}${kind.slice(1)}` as keyof PlanLimits] as number | null;
      if (limit !== null && counts[kind] >= limit) return true;
    }
    return false;
  }

  function canCreateRole(roleKey: string): boolean {
    return !isLimitExceeded(roleKey);
  }

  // jul 2026 — gating de creación de activos (vehículos/flotas). null = sin
  // límite, así que siempre se puede crear.
  const isAssetLimitReached = plan?.maxAssets != null && currentAssets >= plan.maxAssets;
  const canCreateAsset      = !isAssetLimitReached;

  return {
    plan, counts, currentAssets, loading, error,
    refetch: fetchLimits, isLimitExceeded, canCreateRole,
    isAssetLimitReached, canCreateAsset,
  };
}
