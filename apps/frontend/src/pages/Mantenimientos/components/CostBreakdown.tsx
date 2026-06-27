// pages/Mantenimientos/components/CostBreakdown.tsx
// ─────────────────────────────────────────────────────────────────────
// Componentes reutilizables para el desglose de costos por taller y proveedor.
//
// Historia:
//   Originalmente vivían dentro de apps/frontend/src/pages/Reports/page.tsx
//   pero ahora se reusan desde el módulo de Mantenimientos
//   (MaintenanceListTab) además de Reports. Se extraen acá.
//
// API del backend (GET /cost-breakdown):
//   {
//     rango:     { desde, hasta },
//     filtros:   { workshopId, supplierId, assetId },
//     totals:    { manoObra, repuestos, total },
//     byWorkshop:  [{ workshopId, workshopName, total, count }],
//     bySupplier:  [{ supplierId, supplierName, total, itemsCount }],
//     mantenances: [...],
//   }
// ─────────────────────────────────────────────────────────────────────

import { useCostBreakdown } from "../../../hooks/useCostBreakdown";

// ─── fmtMoney helper ────────────────────────────────────────────────
// Formatea un número como moneda USD. Si ya existe uno similar en
// apps/frontend/src/lib/, podemos importarlo en lugar de duplicar.

export function fmtMoney(n: number): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "0.00 USD";
  return `${n.toFixed(2)} USD`;
}

// ─── Filtros ─────────────────────────────────────────────────────────

export function CostBreakdownFilters({
  workshops,
  suppliers,
  workshopId,
  supplierId,
  onWorkshopChange,
  onSupplierChange,
}: {
  workshops: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  workshopId: number | null;
  supplierId: number | null;
  onWorkshopChange: (id: number | null) => void;
  onSupplierChange: (id: number | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3 dark:border-white/[0.06]">
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Taller</span>
        <select
          value={workshopId ?? ""}
          onChange={(e) => onWorkshopChange(e.target.value ? Number(e.target.value) : null)}
          className="h-8 rounded-md border border-gray-200 bg-white px-2 text-[11px] text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200"
        >
          <option value="">Todos los talleres</option>
          {workshops.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Proveedor (repuestos)</span>
        <select
          value={supplierId ?? ""}
          onChange={(e) => onSupplierChange(e.target.value ? Number(e.target.value) : null)}
          className="h-8 rounded-md border border-gray-200 bg-white px-2 text-[11px] text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200"
        >
          <option value="">Todos los proveedores</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {(workshopId || supplierId) && (
        <button
          type="button"
          onClick={() => { onWorkshopChange(null); onSupplierChange(null); }}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-500 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300"
        >
          Limpiar filtros
        </button>
      )}

      <p className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
        La mano de obra se atribuye al <strong className="text-gray-600 dark:text-gray-300">taller</strong>; los repuestos al <strong className="text-gray-600 dark:text-gray-300">proveedor</strong>.
      </p>
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────

export function CostBreakdownPanel({
  companyId,
  workshopId,
  supplierId,
  from,
  to,
  onClear,
}: {
  companyId: string | null;
  workshopId: number | null;
  supplierId: number | null;
  /** YYYY-MM-DD, opcional — restringe el desglose al rango. */
  from?: string;
  /** YYYY-MM-DD, opcional. */
  to?: string;
  onClear: () => void;
}) {
  const enabled = companyId != null && (workshopId != null || supplierId != null);
  const { data, loading, error } = useCostBreakdown(companyId, {
    workshopId,
    supplierId,
    from,
    to,
  });

  if (!enabled) {
    // Cuando no hay filtro de taller ni proveedor activo, no renderizamos
    // nada: el hint ya está inline en CostBreakdownFilters ("La mano de obra
    // se atribuye al taller; los repuestos al proveedor"). Renderizar un
    // empty state aparte sumaba una fila con border-b que partía la UI
    // y daba sensación de layout entrecortado.
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 text-gray-400 dark:border-white/[0.06]">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
        <span className="text-[11px]">Cargando desglose…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-[11px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
        Error al cargar el desglose: {error ?? "sin datos"}
      </div>
    );
  }

  return (
    <div className="border-b border-gray-100 bg-gray-50/40 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[11px] font-semibold text-gray-800 dark:text-white">
          Desglose de costos
          {data.rango && (
            <span className="ml-2 text-[10px] font-normal text-gray-500">
              · {data.rango.desde} → {data.rango.hasta}
            </span>
          )}
          {supplierId != null && <span className="ml-2 text-[10px] font-normal text-gray-500">· repuestos solo del proveedor seleccionado</span>}
          {workshopId != null && !supplierId && <span className="ml-2 text-[10px] font-normal text-gray-500">· taller seleccionado</span>}
        </p>
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
        >
          Limpiar
        </button>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Mano de obra</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-800 dark:text-white">{fmtMoney(data.totals.manoObra)}</p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Repuestos</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-800 dark:text-white">{fmtMoney(data.totals.repuestos)}</p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-gray-800 dark:text-white">{fmtMoney(data.totals.total)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.byWorkshop.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Por taller</p>
            <div className="space-y-1">
              {data.byWorkshop.map((w) => (
                <div key={w.workshopId} className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-2.5 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <div>
                    <p className="text-[11px] font-medium text-gray-700 dark:text-gray-200">{w.workshopName}</p>
                    <p className="text-[9px] text-gray-400">{w.count} OT</p>
                  </div>
                  <p className="text-[11px] font-bold tabular-nums text-gray-800 dark:text-white">{fmtMoney(w.total)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.bySupplier.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Por proveedor</p>
            <div className="space-y-1">
              {data.bySupplier.map((s) => (
                <div key={s.supplierId} className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-2.5 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <div>
                    <p className="text-[11px] font-medium text-gray-700 dark:text-gray-200">{s.supplierName}</p>
                    <p className="text-[9px] text-gray-400">{s.itemsCount} repuestos</p>
                  </div>
                  <p className="text-[11px] font-bold tabular-nums text-gray-800 dark:text-white">{fmtMoney(s.total)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}