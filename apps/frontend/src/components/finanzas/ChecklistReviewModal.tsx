// components/finanzas/ChecklistReviewModal.tsx
//
// jul 2026 v5 — Modal del checklist de revisión. 5 checks; el botón
// "Aprobar factura" sólo se habilita si TODOS están marcados. Siempre
// hay un botón "Enviar a corrección" que abre un mini-modal de nota.
//
// Checks (de REVIEW_CHECK_LABELS en useInvoiceReviews.ts):
//   - sello_autorizacion
//   - no_caducada
//   - check_3   (TBD — el dueño definirá el texto)
//   - check_4   (TBD — el dueño definirá el texto)
//   - nombre_ruc_empresa

import { useState } from "react";
import { Check, AlertTriangle, X, Loader2 } from "lucide-react";
import { ModalShell } from "../ui/modal/ModalShell";
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

  return (
    <ModalShell
      onClose={onClose}
      title={`Revisar factura ${review.invoice.invoiceNumber}`}
      icon={Check}
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Header con vale + solicitante */}
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-white/[0.04]">
          <p className="text-gray-600 dark:text-gray-300">
            Vale <span className="font-mono font-semibold">#{review.voucher.numericId}</span> ·
            Solicitante: <span className="font-medium">{review.requesterName ?? "—"}</span> ·
            Total: <span className="font-mono font-semibold">
              {new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(review.invoice.total)}
            </span>
          </p>
        </div>

        {/* Checklist */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Checklist de validación
          </p>
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

        {/* Acciones */}
        <div className="flex flex-wrap justify-between gap-2 border-t border-gray-200 pt-3 dark:border-white/[0.08]">
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
      </div>

      {/* Sub-modal: nota de corrección */}
      {correctionNoteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setCorrectionNoteOpen(false)}
        >
          <div
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
              Describí qué debe corregir el solicitante. Le llegará una
              notificación con este mensaje.
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
          </div>
        </div>
      )}
    </ModalShell>
  );
}
