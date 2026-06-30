// pages/Mantenimientos/components/CostBreakdown.tsx
// ─────────────────────────────────────────────────────────────────────
// Componentes reutilizables para el desglose de costos por taller y proveedor.
// Usados en Reports (rep-009).
//
// API del backend (GET /cost-breakdown):
//   {
//     rango:       { desde, hasta },
//     filtros:     { workshopId, supplierId, assetId },
//     totals:      { manoObra, repuestos, total },
//     byWorkshop:  [{ workshopId, workshopName, total, count }],
//     bySupplier:  [{ supplierId, supplierName, total, itemsCount }],
//     mantenances: [{ id, title, ... manoObra, repuestos, items[], attachments[] }],
//   }
//
// El panel ahora muestra una TABLA de OTs (filtradas por taller/proveedor)
// con filas expandibles que detallan los repuestos y adjuntos. Tiene
// botones para exportar PDF / Excel / copiar en cualquier modo.
// ─────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { ChevronRight, FileText, FileDown, Sheet, Copy, Loader2, Image as ImageIcon, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { useCostBreakdown } from "../../../hooks/useCostBreakdown";
import {
  exportMaintenanceBreakdownPdf,
  exportMaintenanceBreakdownExcel,
  copyMaintenanceBreakdownClipboard,
} from "../../../pages/Reports/maintenanceBreakdownExport";

// ─── fmtMoney helper ────────────────────────────────────────────────

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

// ─── Modal de imagen ampliada ───────────────────────────────────────

function ImageModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Cerrar"
      >
        <X size={18} />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ─── Panel (tabla de OTs) ──────────────────────────────────────────

export function CostBreakdownPanel({
  companyId,
  workshopId,
  supplierId,
  from,
  to,
  workshopName,
  supplierName,
  onClear,
}: {
  companyId: string | null;
  workshopId: number | null;
  supplierId: number | null;
  /** YYYY-MM-DD, opcional — restringe el desglose al rango. */
  from?: string;
  /** YYYY-MM-DD, opcional. */
  to?: string;
  /** Nombres opcionales para usar en el header del PDF. */
  workshopName?: string;
  supplierName?: string;
  onClear: () => void;
}) {
  const enabled = companyId != null && (workshopId != null || supplierId != null);
  const { data, loading, error } = useCostBreakdown(companyId, {
    workshopId,
    supplierId,
    from,
    to,
  });

  const [openRow, setOpenRow]     = useState<number | null>(null);
  const [imgModal, setImgModal]   = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  if (!enabled) return null;

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

  const totalManoObra  = data.mantenances.reduce((acc, m) => acc + m.manoObra, 0);
  // Cuando hay supplierId, el subtotal de repuestos por OT ya viene filtrado
  // (es `repuestosProveedor`). Cuando no, sumamos `repuestos` (todos los items).
  const totalRepuestos = data.mantenances.reduce(
    (acc, m) => acc + (m.repuestosProveedor ?? m.repuestos),
    0,
  );
  const totalTotal     = data.mantenances.reduce(
    (acc, m) => acc + m.manoObra + (m.repuestosProveedor ?? m.repuestos),
    0,
  );

  // ── Helpers de export ──────────────────────────────────────────────

  async function runExport(id: string, fn: () => Promise<void>) {
    setExporting(id);
    try { await fn(); }
    catch (err) {
      toast.error("Error al exportar", { description: err instanceof Error ? err.message : "Intenta de nuevo." });
    }
    finally { setExporting(null); }
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="border-b border-gray-100 bg-gray-50/40 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
      {/* Header */}
      <div className="mb-2.5 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] font-semibold text-gray-800 dark:text-white">
          Desglose de costos
          {data.rango && (
            <span className="ml-2 text-[10px] font-normal text-gray-500">
              · {data.rango.desde} → {data.rango.hasta}
            </span>
          )}
          {supplierId != null && supplierName && (
            <span className="ml-2 text-[10px] font-normal text-violet-600 dark:text-violet-300">
              · proveedor: {supplierName}
            </span>
          )}
          {workshopId != null && workshopName && !supplierId && (
            <span className="ml-2 text-[10px] font-normal text-violet-600 dark:text-violet-300">
              · taller: {workshopName}
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => runExport("pdf", () => exportMaintenanceBreakdownPdf({
              title:        "Desglose de mantenimientos",
              filename:     `mantenimientos-desglose-${data.rango.desde}-a-${data.rango.hasta}`,
              mode:         supplierId ? "supplier" : (workshopId ? "workshop" : "combined"),
              workshopName, supplierName,
              rango:        data.rango,
              totals:       { manoObra: totalManoObra, repuestos: totalRepuestos, total: totalTotal },
              mantenances:  data.mantenances,
              supplierId,
            }))}
            disabled={exporting !== null}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300"
          >
            {exporting === "pdf" ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
            PDF
          </button>
          <button
            type="button"
            onClick={() => runExport("excel", () => exportMaintenanceBreakdownExcel({
              filename:     `mantenimientos-desglose-${data.rango.desde}-a-${data.rango.hasta}`,
              mode:         supplierId ? "supplier" : (workshopId ? "workshop" : "combined"),
              workshopName, supplierName,
              rango:        data.rango,
              totals:       { manoObra: totalManoObra, repuestos: totalRepuestos, total: totalTotal },
              mantenances:  data.mantenances,
              supplierId,
            }))}
            disabled={exporting !== null}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300"
          >
            {exporting === "excel" ? <Loader2 size={12} className="animate-spin" /> : <Sheet size={12} />}
            Excel
          </button>
          <button
            type="button"
            onClick={() => runExport("copy", () => copyMaintenanceBreakdownClipboard({
              mantenances:  data.mantenances,
              totals:       { manoObra: totalManoObra, repuestos: totalRepuestos, total: totalTotal },
              rango:        data.rango,
              supplierId,
            }))}
            disabled={exporting !== null}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300"
          >
            {exporting === "copy" ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
            Copiar
          </button>
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <KpiCell label="Mano de obra" value={fmtMoney(totalManoObra)} accent="violet" />
        <KpiCell label={supplierId ? "Repuestos (proveedor)" : "Repuestos"} value={fmtMoney(totalRepuestos)} accent="cyan" />
        <KpiCell label="Total" value={fmtMoney(totalTotal)} accent="emerald" />
      </div>

      {/* Tabla de OTs */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.02]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60 text-[10px] uppercase tracking-wider text-gray-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-gray-400">
              <th className="px-3 py-2 text-left w-6" />
              <th className="px-3 py-2 text-left">Vehículo</th>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Taller</th>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2 text-right">Mano obra</th>
              <th className="px-3 py-2 text-right">Repuestos</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
            {data.mantenances.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-[11px] text-gray-400 dark:text-gray-500">
                  Ningún mantenimiento coincide con los filtros activos.
                </td>
              </tr>
            ) : data.mantenances.map((m) => {
              const isOpen   = openRow === m.id;
              // Cuando supplierId está activo, mostrar solo lo de ese proveedor.
              const repuestosCell = supplierId != null
                ? (m.repuestosProveedor ?? 0)
                : m.repuestos;
              const otTotal = m.manoObra + repuestosCell;
              return (
                <RowGroup
                  key={m.id}
                  row={m}
                  isOpen={isOpen}
                  onToggle={() => setOpenRow(isOpen ? null : m.id)}
                  repuestosCell={repuestosCell}
                  otTotal={otTotal}
                  hasItems={m.items.length > 0}
                  supplierActive={supplierId != null}
                  onImageClick={setImgModal}
                />
              );
            })}

            {/* Fila de totales */}
            {data.mantenances.length > 0 && (
              <tr className="bg-gray-100/70 font-semibold dark:bg-white/[0.04]">
                <td colSpan={6} className="px-3 py-2 text-right text-[11px] tracking-wider text-gray-600 dark:text-gray-300">
                  TOTAL ({data.mantenances.length} mantenimiento)
                </td>
                <td className="px-3 py-2 text-right text-[11px] tabular-nums text-gray-800 dark:text-white">
                  {fmtMoney(totalManoObra)}
                </td>
                <td className="px-3 py-2 text-right text-[11px] tabular-nums text-gray-800 dark:text-white">
                  {fmtMoney(totalRepuestos)}
                </td>
                <td className="px-3 py-2 text-right text-[12px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {fmtMoney(totalTotal)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de imagen */}
      {imgModal && (
        <ImageModal src={imgModal} alt="Evidencia" onClose={() => setImgModal(null)} />
      )}
    </div>
  );
}

// ─── Sub-componentes ────────────────────────────────────────────────

function KpiCell({ label, value, accent }: { label: string; value: string; accent: "violet" | "cyan" | "emerald" }) {
  const colors = {
    violet:  "text-violet-700 dark:text-violet-300",
    cyan:    "text-cyan-700 dark:text-cyan-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
  } as const;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-0.5 text-sm font-bold tabular-nums ${colors[accent]}`}>{value}</p>
    </div>
  );
}

function RowGroup({
  row, isOpen, onToggle, repuestosCell, otTotal, hasItems, supplierActive, onImageClick,
}: {
  row: import("../../../hooks/useCostBreakdown").BreakdownMantenimiento;
  isOpen: boolean;
  onToggle: () => void;
  repuestosCell: number;
  otTotal: number;
  hasItems: boolean;
  supplierActive: boolean;
  onImageClick: (src: string) => void;
}) {
  const statusColors: Record<string, string> = {
    Programado:   "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    "En proceso": "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    Completado:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    Corrección:   "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  };
  const statusCls = statusColors[row.status] ?? "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300";

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer transition-colors hover:bg-gray-50/60 dark:hover:bg-white/[0.02] ${
          isOpen ? "bg-blue-50/30 dark:bg-blue-500/[0.04]" : ""
        }`}
      >
        <td className="px-3 py-2.5 align-middle">
          {hasItems ? (
            <ChevronRight
              size={12}
              className={`text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
            />
          ) : (
            <span className="block h-3 w-3" />
          )}
        </td>
        <td className="px-3 py-2.5 align-middle">
          <div className="font-medium text-gray-800 dark:text-white">{row.assetPlate}</div>
          {row.assetName && <div className="text-[10px] text-gray-400 dark:text-gray-500">{row.assetName}</div>}
        </td>
        <td className="px-3 py-2.5 align-middle">
          <div className="text-gray-700 dark:text-gray-200">{row.title}</div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500">#{row.id}</div>
        </td>
        <td className="px-3 py-2.5 align-middle text-[11px] text-gray-600 dark:text-gray-300">
          {row.workshop?.name ?? <span className="text-gray-400 dark:text-gray-500">—</span>}
        </td>
        <td className="px-3 py-2.5 align-middle text-[11px] tabular-nums text-gray-600 dark:text-gray-300">
          {row.scheduledDate ? row.scheduledDate.slice(0, 10) : "—"}
        </td>
        <td className="px-3 py-2.5 align-middle">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCls}`}>
            {row.status}
          </span>
        </td>
        <td className="px-3 py-2.5 align-middle text-right text-[11px] tabular-nums text-gray-700 dark:text-gray-200">
          {fmtMoney(row.manoObra)}
        </td>
        <td className="px-3 py-2.5 align-middle text-right text-[11px] tabular-nums">
          <span className={supplierActive ? "text-violet-700 dark:text-violet-300 font-semibold" : "text-gray-700 dark:text-gray-200"}>
            {fmtMoney(repuestosCell)}
          </span>
          {supplierActive && (
            <div className="text-[9px] text-violet-500 dark:text-violet-400">del proveedor</div>
          )}
        </td>
        <td className="px-3 py-2.5 align-middle text-right text-[12px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
          {fmtMoney(otTotal)}
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-gray-50/40 dark:bg-white/[0.015]">
          <td colSpan={9} className="px-3 py-3">
            <ExpandedDetails
              row={row}
              supplierActive={supplierActive}
              onImageClick={onImageClick}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedDetails({
  row, supplierActive, onImageClick,
}: {
  row: import("../../../hooks/useCostBreakdown").BreakdownMantenimiento;
  supplierActive: boolean;
  onImageClick: (src: string) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Sub-tabla de repuestos */}
      {row.items.length > 0 && (
        <div className="rounded-md border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03] overflow-hidden">
          <div className="border-b border-gray-100 bg-gray-50/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-gray-400">
            Repuestos ({row.items.length})
          </div>
          <table className="w-full text-[11px]">
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
              {row.items.map((it, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 w-10">
                    {it.photoUrl ? (
                      <button
                        type="button"
                        onClick={() => onImageClick(it.photoUrl!)}
                        className="block h-7 w-7 overflow-hidden rounded border border-gray-200 hover:ring-2 hover:ring-violet-400 dark:border-white/[0.1]"
                      >
                        <img src={it.photoUrl} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                      </button>
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded border border-dashed border-gray-200 text-gray-300 dark:border-white/[0.06]">
                        <ImageIcon size={12} />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="font-medium text-gray-800 dark:text-white">{it.name}</div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500">{it.supplierName}</div>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-300">
                    {it.quantity} × {fmtMoney(it.unitCost)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-gray-800 dark:text-white">
                    {fmtMoney(it.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {supplierActive && row.repuestosProveedor != null && (
            <div className="flex items-center justify-between border-t border-violet-200 bg-violet-50/40 px-3 py-1.5 text-[11px] dark:border-violet-500/30 dark:bg-violet-500/[0.06]">
              <span className="font-semibold text-violet-700 dark:text-violet-300">
                Subtotal repuestos (proveedor seleccionado)
              </span>
              <span className="font-bold tabular-nums text-violet-700 dark:text-violet-300">
                {fmtMoney(row.repuestosProveedor)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Adjuntos / evidencias */}
      {row.attachments.length > 0 && (
        <div className="rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Evidencias adjuntas ({row.attachments.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {row.attachments.map((a, i) => (
              <a
                key={i}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-100 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-gray-300"
              >
                <FileDown size={10} />
                {a.label || a.url.split("/").pop() || "Adjunto"}
                <ExternalLink size={9} className="opacity-50" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}