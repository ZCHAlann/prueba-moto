// components/finanzas/ReviewVoucherDetailModal.tsx
//
// jul 2026 v5 — Modal de detalle del vale para el flujo de "Facturas
// por revisar" y "Correcciones" del módulo Caja Chica.
//
// 2 modos:
//   - "review" (Facturas por revisar): muestra semáforo + datos del
//     vale + factura + botones "Ver factura" / "Marcar revisada" / "Cancelar".
//   - "correction" (Correcciones): además muestra el timeline
//     horizontal con todas las fases. Sin botones de acción sobre el
//     semáforo (ya está en rojo). El solicitante puede re-subir foto.

import { useEffect, useState } from "react";
import { Eye, Upload, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { ModalShell } from "../ui/modal/ModalShell";
import { SemaforoPill } from "./SemaforoPill";
import { TimelineHorizontal } from "./TimelineHorizontal";
import {
  useInvoiceReviews,
  type InvoiceReviewRow,
  type TimelineEvent,
  REVIEW_STATUS_LABEL,
  type ReviewCheckKey,
} from "../../hooks/useInvoiceReviews";
import { useAuth } from "../../context/AuthContext";

interface Props {
  review: InvoiceReviewRow;
  mode: "review" | "correction";
  onClose: () => void;
  onAction: () => void;             // después de seen/start para refrescar
  onOpenViewer: (review: InvoiceReviewRow) => void;     // ver la foto
  onOpenChecklist: (review: InvoiceReviewRow) => void;  // abrir checklist
  onReupload: (review: InvoiceReviewRow) => void;       // sub-modal propia
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("es-EC", {
    style: "currency", currency: "USD", maximumFractionDigits: 2,
  }).format(n);
}

export function ReviewVoucherDetailModal({
  review,
  mode,
  onClose,
  onAction,
  onOpenViewer,
  onOpenChecklist,
  onReupload,
}: Props) {
  const { session } = useAuth();
  const reviews = useInvoiceReviews();
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [markingSeen, setMarkingSeen] = useState(false);

  // Cargar timeline (sólo en mode="correction" o cuando se abre la modal)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingTimeline(true);
      try {
        const events = await reviews.timeline(review.numericId);
        if (!cancelled) setTimeline(events);
      } catch (err) {
        toast.error("Error al cargar el timeline");
      } finally {
        if (!cancelled) setLoadingTimeline(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.numericId]);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Determinar si el usuario actual es el solicitante (puede re-subir foto).
  // El backend lo chequea también, esto es sólo para esconder el botón.
  const userId = session?.id ? Number(String(session.id).replace(/\D/g, "")) : null;
  const isRequester = userId !== null && (session as any)?.id === `company-user-${review.voucher.numericId}`;
  // (la comparación real está en el backend; acá mostramos el botón
  // siempre que el vale esté en correction, y si el user no es el
  // solicitante el backend rechazará con 403).

  const handleMarkSeen = async () => {
    setMarkingSeen(true);
    try {
      const r = await reviews.markSeen(review.numericId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Marcada como vista");
      onAction();
    } finally {
      setMarkingSeen(false);
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      title={`Vale #${review.voucher.numericId} — ${mode === "review" ? "Revisión" : "Corrección"}`}
      icon={mode === "review" ? Eye : Upload}
      maxWidthClass="max-w-3xl"
    >
      <div className="space-y-4">
        {/* Header con semáforo + estado */}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Estado de revisión
            </p>
            <div className="mt-1">
              <SemaforoPill status={review.status} />
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Vale · {review.voucher.siteName ?? `Sede #${review.voucher.siteId}`}
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-gray-800 dark:text-gray-100">
              {fmtMoney(review.voucher.issuedAmount)}
            </p>
          </div>
        </div>

        {/* Datos del vale + factura */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 p-3 dark:border-white/[0.08]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Solicitante</p>
            <p className="mt-1 text-sm text-gray-800 dark:text-gray-100">{review.requesterName ?? "—"}</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-3 dark:border-white/[0.08]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Factura</p>
            <p className="mt-1 font-mono text-sm font-semibold text-gray-800 dark:text-gray-100">
              {review.invoice.invoiceNumber}
            </p>
            <p className="text-xs text-gray-500">
              {fmtMoney(review.invoice.total)} · {review.invoice.supplierName ?? "sin proveedor"}
            </p>
          </div>
        </div>

        {/* Si está en corrección, mostrar la nota de la última corrección */}
        {review.lastCorrectionNote && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
              Última corrección solicitada
            </p>
            <p className="mt-1">{review.lastCorrectionNote}</p>
          </div>
        )}

        {/* Timeline */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Línea del tiempo
          </p>
          {loadingTimeline ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : (
            <TimelineHorizontal events={timeline} />
          )}
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap justify-between gap-2 border-t border-gray-200 pt-3 dark:border-white/[0.08]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-200"
          >
            Cerrar
          </button>
          <div className="flex flex-wrap gap-2">
            {mode === "review" && (
              <>
                {review.status === "pending_review" && (
                  <button
                    type="button"
                    disabled={markingSeen}
                    onClick={() => void handleMarkSeen()}
                    className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                  >
                    {markingSeen && <Loader2 className="h-4 w-4 animate-spin" />}
                    Marcar como vista
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onOpenViewer(review)}
                  className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200 dark:hover:bg-sky-500/20"
                >
                  <Eye size={14} />
                  Ver factura
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChecklist(review)}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                >
                  Revisar factura
                </button>
              </>
            )}
            {mode === "correction" && review.status === "correction_requested" && (
              <button
                type="button"
                onClick={() => onReupload(review)}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                <Upload size={14} />
                Subir nueva foto
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
