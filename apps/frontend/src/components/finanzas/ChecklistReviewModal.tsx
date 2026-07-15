// components/finanzas/ChecklistReviewModal.tsx
//
// jul 2026 v5/v7 — Modal del checklist de revisión.
//
// v5: Modal con 5 checks; el botón "Aprobar factura" sólo se habilita
//     si TODOS están marcados. "Enviar a corrección" abre un sub-modal
//     de nota.
// v7: Rediseño como DRAWER LATERAL DERECHO flotante con
//     `framer-motion` (slide-in desde la derecha, fade del fondo).
//     Razón: el modal fullscreen tapaba la foto de la factura. El
//     revisor necesita verla mientras marca los checks para validar
//     visualmente que el comprobante cumple cada punto del checklist.
//     En pantallas anchas el drawer es ~480px; en chicas sigue
//     siendo usable.
//
// Layout (ancho >= md):
//   [ foto de la factura    |  checklist + acciones ]
// En angosto: la foto queda arriba como preview pequeño y el checklist
// abajo. Esto último lo cubrimos con flex-col en pantallas chicas.
//
// Checks (de REVIEW_CHECK_LABELS en useInvoiceReviews.ts):
//   - sello_autorizacion      → La factura cuenta con el sello de autorización del SRI
//   - no_caducada             → La factura no ha caducado
//   - check_3                 → El monto de la factura coincide con el monto del vale aprobado
//   - check_4                 → La fecha de la factura es coherente con la fecha de la compra
//   - nombre_ruc_empresa      → El nombre y RUC de la empresa están correctos

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, AlertTriangle, X, Loader2, FileText, ExternalLink } from "lucide-react";
import {
  REVIEW_CHECK_LABELS,
  type ReviewChecks,
  type ReviewCheckKey,
  type InvoiceReviewRow,
} from "../../hooks/useInvoiceReviews";

interface Props {
  review: InvoiceReviewRow;
  onClose: () => void;
  onApprove: (checks: ReviewChecks) => Promise<void>;
  onSendToCorrection: (note: string, failedKeys: ReviewCheckKey[]) => Promise<void>;
}

const CHECK_KEYS: ReviewCheckKey[] = [
  "sello_autorizacion",
  "no_caducada",
  "check_3",
  "check_4",
  "nombre_ruc_empresa",
];

function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(url);
}
function isPdfUrl(url: string): boolean {
  return /\.pdf(\?.*)?$/i.test(url);
}

export function ChecklistReviewModal({
  review,
  onClose,
  onApprove,
  onSendToCorrection,
}: Props) {
  const [checks, setChecks] = useState<ReviewChecks>({
    sello_autorizacion: false,
    no_caducada:        false,
    check_3:            false,
    check_4:            false,
    nombre_ruc_empresa: false,
  });
  const [submitting, setSubmitting] = useState<null | "approve" | "correction">(null);
  const [correctionNoteOpen, setCorrectionNoteOpen] = useState(false);
  const [correctionNote, setCorrectionNote] = useState("");

  const allChecked = CHECK_KEYS.every(k => checks[k]);
  const failedKeys = CHECK_KEYS.filter(k => !checks[k]);

  const handleApprove = async () => {
    if (!allChecked) return;
    setSubmitting("approve");
    try { await onApprove(checks); } finally { setSubmitting(null); }
  };

  const handleSendToCorrection = async () => {
    if (correctionNote.trim().length < 3) return;
    setSubmitting("correction");
    try {
      await onSendToCorrection(correctionNote.trim(), failedKeys);
    } finally {
      setSubmitting(null);
    }
  };

  const fileUrl = review.invoice.fileUrl;
  const showFile = !!fileUrl;

  return (
    <AnimatePresence>
      <motion.div
        key="checklist-drawer"
        // Backdrop con fade
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 flex justify-end bg-black/40"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.aside
          // Panel lateral con slide-in desde la derecha
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "tween", ease: [0.16, 1, 0.3, 1], duration: 0.32 }}
          className="flex h-full w-full max-w-[min(1100px,95vw)] flex-col bg-white shadow-2xl ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10"
          role="dialog"
          aria-label={`Revisar factura ${review.invoice.invoiceNumber}`}
        >
          {/* Header */}
          <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-white/[0.08]">
            <div className="flex min-w-0 items-center gap-2">
              <Check size={18} className="flex-shrink-0 text-emerald-500" />
              <h2 className="truncate text-sm font-bold text-gray-800 dark:text-white">
                Revisar factura {review.invoice.invoiceNumber}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </header>

          {/* Body: foto (izq) + checklist (der). En angosto se apila. */}
          <div className="flex flex-1 min-h-0 flex-col md:flex-row">
            {/* Columna izquierda: foto de la factura (para verla mientras
                se marcan los checks). En angosto se ve como preview
                chico colapsable; lo mostramos siempre. */}
            <section
              className="flex min-h-[260px] flex-shrink-0 flex-col border-b border-gray-200 bg-slate-100 dark:border-white/[0.08] dark:bg-slate-950 md:min-h-0 md:flex-1 md:border-b-0 md:border-r"
              aria-label="Comprobante"
            >
              <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:border-white/[0.08] dark:bg-slate-900/60 dark:text-gray-400">
                <span>Comprobante</span>
                {showFile && (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-600 hover:underline dark:text-sky-300"
                  >
                    <ExternalLink size={11} /> Abrir
                  </a>
                )}
              </div>
              <div className="flex flex-1 items-center justify-center overflow-auto p-3">
                {!showFile ? (
                  <div className="flex flex-col items-center gap-2 text-center text-xs text-gray-500 dark:text-gray-400">
                    <FileText size={28} className="text-gray-300 dark:text-gray-600" />
                    <span>Esta factura no tiene un comprobante adjunto.</span>
                  </div>
                ) : isImageUrl(fileUrl) ? (
                  <img
                    src={fileUrl}
                    alt="Comprobante de la factura"
                    className="max-h-full max-w-full rounded-md object-contain shadow-sm"
                  />
                ) : isPdfUrl(fileUrl) ? (
                  <iframe
                    src={fileUrl}
                    title="Comprobante PDF"
                    className="h-full w-full rounded-md border border-gray-200 bg-white dark:border-white/[0.08]"
                  />
                ) : (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                  >
                    <FileText size={14} /> Abrir comprobante
                  </a>
                )}
              </div>
              {/* Datos clave de la factura — siempre visibles al pie de la foto. */}
              <div className="flex-shrink-0 border-t border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600 dark:border-white/[0.08] dark:bg-slate-900/60 dark:text-gray-300">
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-3">
                  <div>
                    <span className="font-semibold text-gray-500 dark:text-gray-400">Vale:</span>{" "}
                    <span className="font-mono">#{review.voucher.numericId}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-gray-500 dark:text-gray-400">Solicitante:</span>{" "}
                    {review.requesterName ?? "—"}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-500 dark:text-gray-400">Total:</span>{" "}
                    <span className="font-mono font-semibold text-gray-800 dark:text-white">
                      {new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(review.invoice.total)}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Columna derecha: checklist + acciones */}
            <section
              className="flex min-h-0 w-full flex-col md:w-[420px] md:flex-shrink-0"
              aria-label="Checklist de validación"
            >
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Checklist de validación
                </p>
                <div className="space-y-2">
                  {CHECK_KEYS.map(key => (
                    <label
                      key={key}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 transition hover:border-emerald-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-emerald-500/40"
                    >
                      <input
                        type="checkbox"
                        checked={checks[key]}
                        onChange={e => setChecks(prev => ({ ...prev, [key]: e.target.checked }))}
                        className="mt-0.5 h-4 w-4 cursor-pointer rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="flex-1 text-sm text-gray-800 dark:text-gray-100">
                        {REVIEW_CHECK_LABELS[key]}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">
                  Marcá los checks mientras revisás la foto a la
                  izquierda. Si todo está bien, aprobá. Si hay algo
                  mal, mandá a corrección.
                </p>
              </div>

              {/* Acciones — pegadas al fondo del drawer. */}
              <div className="flex flex-shrink-0 flex-wrap justify-between gap-2 border-t border-gray-200 bg-white px-5 py-3 dark:border-white/[0.08] dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setCorrectionNoteOpen(true)}
                  disabled={submitting !== null}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
                >
                  <AlertTriangle size={14} />
                  Enviar a corrección
                </button>
                <button
                  type="button"
                  disabled={!allChecked || submitting !== null}
                  onClick={() => void handleApprove()}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
                >
                  {submitting === "approve" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Aprobar factura
                </button>
              </div>
            </section>
          </div>

          {/* Sub-modal: nota de corrección (animado). */}
          <AnimatePresence>
            {correctionNoteOpen && (
              <motion.div
                key="correction-sub"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
                onClick={() => setCorrectionNoteOpen(false)}
              >
                <motion.div
                  initial={{ scale: 0.96, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.96, opacity: 0 }}
                  transition={{ type: "tween", duration: 0.15 }}
                  className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-white/[0.08] dark:bg-slate-800"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-white">
                      Motivo de la corrección
                    </h3>
                    <button
                      type="button"
                      onClick={() => setCorrectionNoteOpen(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p className="mb-2 text-xs text-gray-500">
                    Describí qué debe corregir el solicitante. Le
                    llegará una notificación con este mensaje.
                  </p>
                  <textarea
                    value={correctionNote}
                    onChange={e => setCorrectionNote(e.target.value)}
                    rows={4}
                    maxLength={1000}
                    placeholder="Ej: la foto está cortada, no se ve el RUC del proveedor…"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200"
                  />
                  <p className="mt-1 text-[10px] text-gray-400">
                    {correctionNote.length} / 1000
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setCorrectionNoteOpen(false)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-200"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={correctionNote.trim().length < 3 || submitting === "correction"}
                      onClick={() => void handleSendToCorrection()}
                      className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      {submitting === "correction" && <Loader2 className="h-3 w-3 animate-spin" />}
                      Enviar a corrección
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}
