// hooks/useMaintenanceData.ts
//
// jul 2026 v3 — Hook UNICO para el submódulo Data de Mantenimientos.
// NO usa otros hooks del sistema (useAssets, useFuel, useToll, etc.) a
// propósito: el gating se hace a nivel endpoint en `maintenance-data.ts`,
// donde `requirePermission('mantenimiento', 'data', 'ver')` se evalúa una
// sola vez. Si un hook cruzado fallara por falta de permiso de su propio
// módulo, la página se rompería — esto evita ese acoplamiento.
//
// Cada función es un fetch directo con credentials. La paginación de los
// listados es 20 (configurada en el backend; el front solo pasa `page`).

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export type ModuleKey = "mantenimiento" | "combustible" | "peajes" | "checklist" | "alertas";

export type MaintenanceDataAsset = {
  id: string;
  plate: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  year: string | null;
  status: string;
  siteName: string | null;
};

export type MaintenanceDataCategory = {
  key: string;
  label: string;
  shortLabel: string | null;
  color: string;
  icon: string;
  isSystem: boolean;
  isCustom: boolean;
  count: number;
};

export type ModuleListItem = { key: ModuleKey; label: string; available: boolean };

type PageResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function apiGet<T>(companyId: string, path: string): Promise<T> {
  const res = await fetch(`/api/company/${companyId}${path}`, { credentials: "include" });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useMaintenanceData() {
  const { companyId } = useAuth();

  // ── Módulos disponibles (paso 2) ──
  const [modules, setModules]       = useState<ModuleListItem[]>([]);
  const [modulesLoading, setModLdg] = useState(true);
  const fetchModules = useCallback(async () => {
    if (!companyId) return;
    setModLdg(true);
    try {
      const r = await apiGet<{ data: ModuleListItem[]; available: boolean }>(
        companyId, `/maintenance-data/modules`,
      );
      setModules(r.data);
    } catch {
      setModules([]);
    } finally {
      setModLdg(false);
    }
  }, [companyId]);
  useEffect(() => { void fetchModules(); }, [fetchModules]);

  // ── Assets (paso 1) ──
  const [assets, setAssets]           = useState<MaintenanceDataAsset[]>([]);
  const [assetsTotal, setAssetsTotal] = useState(0);
  const [assetsLoading, setAstLdg]    = useState(false);
  const fetchAssets = useCallback(async (q?: string) => {
    if (!companyId) return;
    setAstLdg(true);
    try {
      const params = new URLSearchParams();
      if (q && q.trim()) params.set("q", q.trim());
      params.set("pageSize", "20");
      const r = await apiGet<PageResponse<MaintenanceDataAsset>>(
        companyId, `/maintenance-data/assets?${params.toString()}`,
      );
      setAssets(r.data);
      setAssetsTotal(r.total);
    } catch {
      setAssets([]);
      setAssetsTotal(0);
    } finally {
      setAstLdg(false);
    }
  }, [companyId]);

  // ── Categorías de mantenimiento (paso 3) ──
  const [categories, setCats]     = useState<MaintenanceDataCategory[]>([]);
  const [catsLoading, setCatsLdg] = useState(false);
  const fetchCategories = useCallback(async (assetId: string) => {
    if (!companyId) return;
    setCatsLdg(true);
    try {
      const r = await apiGet<{ data: MaintenanceDataCategory[]; assetId: string }>(
        companyId, `/maintenance-data/categories?assetId=${encodeURIComponent(assetId)}`,
      );
      setCats(r.data);
    } catch {
      setCats([]);
    } finally {
      setCatsLdg(false);
    }
  }, [companyId]);

  // ── Detalle por módulo (paso 4) ──
  // El shape concreto se conoce en la página (DetailResponse). Acá lo
  // dejamos tipado flojo (Record<string, unknown>[]) para no acoplar el
  // hook a TODOS los shapes de los 5 módulos — la página hace narrowing
  // al renderizar.
  type DetailRow = Record<string, unknown>;
  type DetailResponse = { data: DetailRow[]; total: number; page: number; pageSize: number; totalPages: number; summary?: Record<string, number> };
  const [detail, setDetail]       = useState<DetailResponse | null>(null);
  const [detailLoading, setDtlLdg] = useState(false);
  const fetchDetail = useCallback(async (moduleKey: ModuleKey, assetId: string, category?: string, page = 1): Promise<DetailResponse | null> => {
    if (!companyId) return null;
    setDtlLdg(true);
    try {
      const params = new URLSearchParams({ assetId, page: String(page), pageSize: "20" });
      if (moduleKey === "mantenimiento" && category) params.set("category", category);
      const r = await apiGet<DetailResponse>(
        companyId, `/maintenance-data/${moduleKey}?${params.toString()}`,
      );
      setDetail(r);
      return r;
    } catch {
      setDetail(null);
      return null;
    } finally {
      setDtlLdg(false);
    }
  }, [companyId]);

  // jul 2026 v3 — Reset del detalle. useCallback para que la ref sea
  // estable entre renders (ver comment en el return).
  const resetDetail = useCallback(() => setDetail(null), []);

  return {
    companyId,
    // paso 2
    modules, modulesLoading, refetchModules: fetchModules,
    // paso 1
    assets, assetsTotal, assetsLoading, fetchAssets,
    // paso 3
    categories, catsLoading, fetchCategories,
    // paso 4
    detail, detailLoading, fetchDetail,
    // jul 2026 v3 — Limpia el cache del detalle cuando cambia el step
    // (asset/module/category). Sin esto, durante la animación de salida
    // del panel anterior la data persistida en `detail` se seguía
    // mostrando, causando el flash de data desactualizada.
    //
    // Envuelto en useCallback para que su referencia sea estable entre
    // renders. Si cambia la ref en cada render y se mete en deps de un
    // useEffect, el useEffect se dispara en cada render → loop infinito
    // de setState → pantalla queda en skeleton permanente.
    resetDetail,
  };
}
