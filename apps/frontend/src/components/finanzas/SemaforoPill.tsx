// components/finanzas/SemaforoPill.tsx
//
// jul 2026 v5 — Bolita de semáforo para la fila de "Facturas por revisar"
// y "Correcciones" del módulo Caja Chica.
//
// Muestra el estado actual de la review como una bolita de color con
// tooltip al hacer hover. En modo "compacto" solo la bolita; en
// "default" muestra la bolita + el label.
//
// Los 5 estados (semáforo):
//   pending_review       → azul      → "Pendiente de revisar"
//   seen                 → naranja   → "Vista por revisor"
//   under_review         → amarillo  → "En revisión"
//   correction_requested → rojo      → "Enviada a corrección"
//   approved             → verde     → "Aprobada"

import {
  REVIEW_STATUS_LABEL,
  REVIEW_STATUS_DOT,
  type InvoiceReviewStatus,
} from "../../hooks/useInvoiceReviews";

interface Props {
  status: InvoiceReviewStatus;
  variant?: "compact" | "default";
  showLabel?: boolean;
  title?: string;
}

export function SemaforoPill({
  status,
  variant = "default",
  showLabel,
  title,
}: Props) {
  const color = REVIEW_STATUS_DOT[status] ?? REVIEW_STATUS_DOT.not_required;
  const label = REVIEW_STATUS_LABEL[status] ?? status;
  const effectiveShowLabel = showLabel ?? variant === "default";

  if (variant === "compact") {
    return (
      <span
        title={title ?? label}
        className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/5 dark:ring-white/10"
        style={{ backgroundColor: color }}
      />
    );
  }

  return (
    <span
      title={title ?? label}
      className="inline-flex items-center gap-1.5"
    >
      <span
        className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/5 dark:ring-white/10"
        style={{ backgroundColor: color }}
      />
      {effectiveShowLabel && (
        <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
          {label}
        </span>
      )}
    </span>
  );
}
