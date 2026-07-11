// components/finanzas/InvoiceViewerModal.tsx
//
// jul 2026 v5 — Modal que muestra la foto (o PDF) de la factura del vale
// para que el revisor la vea. Tiene un botón "Revisar factura" que
// marca el estado como `under_review` y abre el modal de checklist.
//
// Visualmente: la factura se renderiza embebida (img o iframe). Si el
// mime es PDF, abrimos en un iframe a pantalla completa; si es imagen,
// un <img> con object-contain. Un botón "Cerrar" en el header.

import { useEffect, useState } from "react";
import { X, Loader2, ExternalLink } from "lucide-react";
import { ModalShell } from "../ui/modal/ModalShell";
import type { InvoiceReviewRow } from "../../hooks/useInvoiceReviews";

interface Props {
  review: InvoiceReviewRow;
  onClose: () => void;
  onStartReview: () => void | Promise<void>;
}

export function InvoiceViewerModal({ review, onClose, onStartReview }: Props) {
  const [starting, setStarting] = useState(false);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const invoice = review.invoice;
  const isPdf = invoice.fileMimeType?.toLowerCase().includes("pdf") ?? false;
  const isImage = invoice.fileMimeType?.toLowerCase().startsWith("image/") ?? false;

  return (
    <ModalShell
      onClose={onClose}
      title={`Factura ${invoice.invoiceNumber}`}
      icon={X}
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-4">
        {/* Metadata */}
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-white/[0.04]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Vale</p>
              <p className="font-mono font-semibold text-gray-800 dark:text-gray-100">#{review.voucher.numericId}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Total</p>
              <p className="font-mono font-semibold text-gray-800 dark:text-gray-100">
                {new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(invoice.total)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Proveedor</p>
              <p className="text-gray-800 dark:text-gray-100">{invoice.supplierName ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Solicitante</p>
              <p className="text-gray-800 dark:text-gray-100">{review.requesterName ?? "—"}</p>
            </div>
          </div>
        </div>

        {/* Visor */}
        <div className="flex h-[60vh] items-center justify-center overflow-auto rounded-xl border border-gray-200 bg-white dark:border-white/[0.08] dark:bg-slate-800">
          {!invoice.fileUrl ? (
            <p className="text-sm text-gray-400">Esta factura no tiene archivo adjunto.</p>
          ) : isImage ? (
            <img
              src={invoice.fileUrl}
              alt={`Factura ${invoice.invoiceNumber}`}
              className="max-h-full max-w-full object-contain"
            />
          ) : isPdf ? (
            <iframe
              src={invoice.fileUrl}
              title={`Factura ${invoice.invoiceNumber}`}
              className="h-full w-full"
            />
          ) : (
            <div className="text-center">
              <p className="text-sm text-gray-500">Tipo de archivo no soportado para vista previa.</p>
              <a
                href={invoice.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:underline"
              >
                Abrir en nueva pestaña <ExternalLink size={11} />
              </a>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-200"
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={starting}
            onClick={async () => {
              setStarting(true);
              try { await onStartReview(); } finally { setStarting(false); }
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
          >
            {starting && <Loader2 className="h-4 w-4 animate-spin" />}
            Revisar factura
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
