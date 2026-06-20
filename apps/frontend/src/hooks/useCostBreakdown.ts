// hooks/useCostBreakdown.ts
// ─────────────────────────────────────────────────────────────────────
// Hook que consume GET /api/company/:id/maintenances/cost-breakdown.
//
// Devuelve el desglose por mantenimiento: mano de obra (taller) +
// repuestos agrupados por proveedor, con totales por taller y por
// proveedor.
//
// Filtros: rango (from/to), workshopId, supplierId, assetId.
// Cuando filtras por supplierId, el campo `repuestos` de cada
// mantenimiento refleja SOLO la suma de los repuestos de ese proveedor.
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";

export type BreakdownFilters = {
  from?:       string;
  to?:         string;
  workshopId?: number | null;
  supplierId?: number | null;
  assetId?:    number | null;
};

export type BreakdownTaller = {
  workshopId:   number;
  workshopName: string;
  total:        number;
  count:        number;
};

export type BreakdownProveedor = {
  supplierId:   number;
  supplierName: string;
  total:        number;
  itemsCount:   number;
};

export type BreakdownMantenimiento = {
  id:             number;
  title:          string;
  assetPlate:     string;
  assetName:      string | null;
  scheduledDate:  string;
  completedAt:    string | null;
  status:         string;
  workshop:       { id: number; name: string; nit: string | null } | null;
  manoObra:       number;
  repuestos:      number;
  total:          number;
  /** Cuando NO hay supplierId en el filtro: desglose por proveedor dentro de la OT. */
  repuestosPorProveedor: Array<{
    supplierId:   number;
    supplierName: string;
    total:        number;
    itemsCount:   number;
  }> | null;
};

export type CostBreakdown = {
  rango:       { desde: string; hasta: string };
  filtros:     { workshopId: number | null; supplierId: number | null; assetId: number | null };
  totals:      { manoObra: number; repuestos: number; total: number };
  byWorkshop:  BreakdownTaller[];
  bySupplier:  BreakdownProveedor[];
  mantenances: BreakdownMantenimiento[];
};

export function useCostBreakdown(
  companyId: string | null,
  filters: BreakdownFilters = {},
) {
  const [data, setData] = useState<CostBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const filtersKey = JSON.stringify(filters);

  const fetch_ = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (filters.from)       qs.set("from", filters.from);
      if (filters.to)         qs.set("to",   filters.to);
      if (filters.workshopId) qs.set("workshopId", String(filters.workshopId));
      if (filters.supplierId) qs.set("supplierId", String(filters.supplierId));
      if (filters.assetId)    qs.set("assetId",    String(filters.assetId));
      const res = await fetch(
        `/api/company/${companyId}/maintenances/cost-breakdown?${qs.toString()}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status} — ${txt.slice(0, 200)}`);
      }
      const json = (await res.json()) as CostBreakdown;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, filtersKey]);

  useEffect(() => { void fetch_(); }, [fetch_]);

  return { data, loading, error, refetch: fetch_ };
}
