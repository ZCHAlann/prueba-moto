// components/finanzas/SemaforoPill.tsx
//
// jul 2026 v5/v6 — Bolita de semáforo para la fila de "Facturas por revisar"
// y "Correcciones" del módulo Caja Chica.
//
// v5: Muestra el estado actual de la review como una bolita de color
//     con tooltip al hacer hover. En modo "compacto" solo la bolita; en
//     "default" muestra la bolita + el label.
// v6: Nueva variante "all" — muestra los 5 estados como circulitos
//     lado a lado. El estado actual se renderiza con su color, los
//     demás como placeholders grises. Hover sobre CADA circulito dice
//     el nombre del estado (sea el actual o no).
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

// jul 2026 v6 — Orden visual del semáforo, de izquierda a derecha. NO
// es el orden cronológico de la máquina de estados (ese pasa por
// seen antes de under_review); es el orden que el usuario quiere ver
// en la tabla: pendiente → corrección → aprobada, con vista y
// en-revisión en el medio como "pasos intermedios".
const ALL_STATUSES_IN_ROW: InvoiceReviewStatus[] = [
  'pending_review',
  'seen',
  'under_review',
  'correction_requested',
  'approved',
];

interface Props {
  status: InvoiceReviewStatus;
  variant?: "compact" | "default" | "all";
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

  if (variant === "all") {
    // jul 2026 v6 — Fila de 5 circulitos. El del estado actual con su
    // color, los demás como placeholders grises (ring + bg suave).
    // Hover sobre cada uno muestra el nombre del estado.
    return (
      <span
        className="inline-flex items-center gap-1.5"
        title={title ?? label}
        aria-label={`Estado: ${label}`}
      >
        {ALL_STATUSES_IN_ROW.map((s) => {
          const isActive = s === status;
          const dotColor = REVIEW_STATUS_DOT[s];
          return (
            <span
              key={s}
              title={REVIEW_STATUS_LABEL[s]}
              aria-label={REVIEW_STATUS_LABEL[s]}
              className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/5 dark:ring-white/10"
              style={{
                backgroundColor: isActive ? dotColor : 'transparent',
                borderColor: isActive ? 'transparent' : dotColor,
                opacity: isActive ? 1 : 0.55,
              }}
            />
          );
        })}
      </span>
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
