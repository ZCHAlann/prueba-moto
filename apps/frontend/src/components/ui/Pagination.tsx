// components/ui/Pagination.tsx
//
// jul 2026 v9 — Paginación canónica (Anterior / Siguiente / N de M).
//
// Reglas:
//   - Si `totalPages === 1`, no se renderiza (no hay nada que paginar).
//   - Si `page > totalPages`, se hace clamp a `totalPages` (defensivo).
//   - "Anterior" deshabilitado en `page === 1`; "Siguiente" deshabilitado
//     en `page === totalPages`.
//   - Muestra "Mostrando X–Y de Z" para que el admin sepa dónde está.
//   - El "page" es 1-indexed (no 0-indexed), igual que el backend.

import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Etiqueta de la entidad ("solicitudes", "vales", "transacciones", ...). */
  itemLabel?: string;
  /** Plural de la entidad, default = itemLabel + "s". */
  itemLabelPlural?: string;
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  itemLabel = "registro",
  itemLabelPlural,
}: PaginationProps) {
  // Sin paginación posible: no renderizar nada.
  if (totalPages <= 1) return null;

  const safePage    = Math.min(Math.max(1, page), totalPages);
  const safeTotal   = Math.max(0, total);
  const lastShown   = Math.min(safePage * pageSize, safeTotal);
  const firstShown  = safeTotal === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const plural      = itemLabelPlural ?? `${itemLabel}s`;
  const isFirst     = safePage <= 1;
  const isLast      = safePage >= totalPages;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-3 text-xs text-gray-500 dark:text-gray-400">
      <p>
        Mostrando{" "}
        <span className="font-semibold text-gray-700 dark:text-gray-200">{firstShown}</span>
        {"–"}
        <span className="font-semibold text-gray-700 dark:text-gray-200">{lastShown}</span>
        {" de "}
        <span className="font-semibold text-gray-700 dark:text-gray-200">{safeTotal}</span>
        {" "}
        {safeTotal === 1 ? itemLabel : plural}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={isFirst}
          aria-label="Página anterior"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 transition hover:border-gray-300 dark:hover:border-white/[0.16] hover:bg-gray-50 dark:hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={14} />
          Anterior
        </button>
        <span className="px-2 tabular-nums">
          Página <span className="font-semibold text-gray-700 dark:text-gray-200">{safePage}</span> de{" "}
          <span className="font-semibold text-gray-700 dark:text-gray-200">{totalPages}</span>
        </span>
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={isLast}
          aria-label="Página siguiente"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 transition hover:border-gray-300 dark:hover:border-white/[0.16] hover:bg-gray-50 dark:hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Siguiente
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
