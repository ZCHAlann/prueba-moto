"use client";

// hooks/useMaintenanceAssets.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Catálogo paginado e infinito de assets para el sidebar
// del calendario de agendar (página /mantenimientos/agendar).
//
// Antes, el sidebar recibía TODOS los assets de la empresa en el
// payload de catálogos del endpoint GET /maintenances. Con flotas
// de 500+ vehículos eso rompía la performance (DOM pesado, scroll
// lento). Ahora el sidebar consume este hook que pagina de a 20
// y se auto-completa con scroll infinito (IntersectionObserver en
// el último item de la lista).
//
// Endpoint: GET /api/company/:id/maintenances/assets?page=N&pageSize=20&q=
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";

export interface MaintenanceAssetListItem {
  id: string;
  name: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
  code: string | null;
  status: string;
  siteId: string | null;
}

interface MaintenanceAssetListPage {
  items: MaintenanceAssetListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const PAGE_SIZE = 20;

export function useMaintenanceAssets() {
  const { companyId } = useAuth();
  const cid = companyId ? String(companyId) : null;

  const query = useInfiniteQuery<
    MaintenanceAssetListPage,
    Error,
    InfiniteData<MaintenanceAssetListPage, number>,
    [string, string | null],
    number
  >({
    queryKey: ["maintenance-assets", cid],
    initialPageParam: 1,
    enabled: !!cid,
    staleTime: 60_000,            // 1 min — la flota no cambia tan seguido
    gcTime: 5 * 60_000,           // 5 min en caché
    queryFn: async ({ pageParam }) => {
      if (!cid) throw new Error("Sin companyId");
      const res = await fetch(
        `/api/company/${cid}/maintenances/assets?page=${pageParam}&pageSize=${PAGE_SIZE}`,
        { cache: "no-store", credentials: "include" },
      );
      if (!res.ok) throw new Error(`Error al cargar vehículos (${res.status})`);
      return (await res.json()) as MaintenanceAssetListPage;
    },
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
  });

  // Aplanar todas las páginas en un único array para renderizar.
  const items = useMemo<MaintenanceAssetListItem[]>(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  const total = query.data?.pages[0]?.total ?? 0;
  const totalLoaded = items.length;

  return {
    items,
    total,
    totalLoaded,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: !!query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useMaintenanceAssetsSearch(q: string) {
  // jul 2026 — Variante para el buscador del sidebar. En vez de
  // paginar, busca server-side y devuelve un único array.
  // Se usa cuando el usuario escribe en el input de búsqueda.
  const { companyId } = useAuth();
  const cid = companyId ? String(companyId) : null;
  const debounced = useDebouncedValue(q, 200);

  const query = useInfiniteQuery<
    MaintenanceAssetListPage,
    Error,
    InfiniteData<MaintenanceAssetListPage, number>,
    [string, string | null, string],
    number
  >({
    queryKey: ["maintenance-assets-search", cid, debounced],
    initialPageParam: 1,
    enabled: !!cid && debounced.trim().length >= 1,
    staleTime: 30_000,
    queryFn: async ({ pageParam }) => {
      if (!cid) throw new Error("Sin companyId");
      const url = new URL(
        `/api/company/${cid}/maintenances/assets`,
        window.location.origin,
      );
      url.searchParams.set("page", String(pageParam));
      url.searchParams.set("pageSize", String(PAGE_SIZE));
      url.searchParams.set("q", debounced.trim());
      const res = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
      if (!res.ok) throw new Error(`Error al buscar vehículos (${res.status})`);
      return (await res.json()) as MaintenanceAssetListPage;
    },
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
  });

  const items = useMemo<MaintenanceAssetListItem[]>(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  return {
    items,
    total: query.data?.pages[0]?.total ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: !!query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
