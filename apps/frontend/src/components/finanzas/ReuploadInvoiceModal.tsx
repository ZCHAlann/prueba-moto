// components/finanzas/ReuploadInvoiceModal.tsx
//
// jul 2026 v5 — Modal para que el solicitante del vale suba una nueva
// foto de la factura cuando está en estado "correction_requested".
// Al confirmar: sube el archivo al storage, llama al endpoint reupload
// del backend, y refresca la lista.
//
// El operador tiene 24h desde que se mandó a corrección. Si venció el
// plazo, el botón de subir se deshabilita y se muestra un mensaje con
// el tiempo vencido. Un admin (revisor) puede reabrir la corrección
// desde la pestaña "Facturas por revisar".

import { useEffect, useRef, useState } from "react";
import { Upload, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { ModalShell } from "../ui/modal/ModalShell";
import {
  useInvoiceReviews,
  type InvoiceReviewRow,
  isCorrectionExpired,
  getCorrectionRemainingMs,
  formatRemaining,
  // jul 2026 v6 — Para envolver mensajes de "Transición inválida" del
  // backend en algo legible para el user final.
  friendlyInvoiceReviewError,
} from "../../hooks/useInvoiceReviews";
import { useAuth } from "../../context/AuthContext";

interface Props {
  review: InvoiceReviewRow;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReuploadInvoiceModal({ review, onClose, onSuccess }: Props) {
  const { session } = useAuth();
  const reviews = useInvoiceReviews();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [now, setNow] = useState<number>(Date.now());

  // jul 2026 v5 — Tick de 1 minuto para refrescar el countdown.
  // No necesitamos precisión de segundos: el plazo es 24h.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const onFileChange = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("El archivo no puede pesar más de 10 MB");
      return;
    }
    setFile(f);
  };

  const submit = async () => {
    if (!file) {
      toast.error("Adjuntá la foto de la factura");
      return;
    }
    if (!session?.companyId) {
      toast.error("Sesión inválida");
      return;
    }
    setUploading(true);
    try {
      // 1) Subir el archivo al endpoint genérico de upload.
      // Endpoint /upload/part-photos (el companyId sale del JWT, no del
      // query). El field que multer espera es "photo" (no "file").
      const fd = new FormData();
      fd.append("photo", file);
      const upRes = await fetch(
        `/api/upload/part-photos`,
        { method: "POST", credentials: "include", body: fd },
      );
      if (!upRes.ok) {
        toast.error("Error al subir la foto");
        setUploading(false);
        return;
      }
      const upJson = await upRes.json();
      const fileUrl = upJson.url ?? upJson.fileUrl;
      if (!fileUrl) {
        toast.error("El backend no devolvió URL del archivo");
        setUploading(false);
        return;
      }

      // 2) Llamar al endpoint reupload de review.
      const r = await reviews.reupload(review.numericId, fileUrl, file.type);
      if (!r.ok) {
        // jul 2026 v6 — envolver el mensaje del backend (puede ser
        // "Transición inválida: correction_requested → pending_review"
        // si el estado cambió mientras se subía la foto) en algo legible.
        toast.error(friendlyInvoiceReviewError(r.error, "reupload"));
        setUploading(false);
        return;
      }
      toast.success("Foto actualizada. La factura volvió a revisión pendiente.");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error("Error inesperado al subir la foto");
    } finally {
      setUploading(false);
    }
  };

  const expired = isCorrectionExpired(review.lastCorrectionAt, now);
  const remainingMs = getCorrectionRemainingMs(review.lastCorrectionAt, now);

  return (
    <ModalShell
      onClose={onClose}
      title={`Reemplazar factura del vale #${review.voucher.numericId}`}
      icon={Upload}
      maxWidthClass="max-w-md"
    >
      <div className="space-y-4">
        {review.lastCorrectionNote && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
              Motivo de la corrección
            </p>
            <p className="mt-1">{review.lastCorrectionNote}</p>
          </div>
        )}

        {/* jul 2026 v5 — Countdown del plazo de 1 día. */}
        {remainingMs !== null && (
          <div
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
              expired
                ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
                : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
            }`}
          >
            <Clock size={14} className="flex-shrink-0" />
            <span className="font-medium">
              {expired
                ? `Venció el plazo de 1 día para corregir. ${formatRemaining(remainingMs)}.`
                : `Tenés ${formatRemaining(remainingMs)} para subir la nueva foto.`}
            </span>
          </div>
        )}

        {/* Si venció, en vez del input de archivo mostramos un mensaje
            de bloqueo. */}
        {expired ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200">
            <p className="font-semibold text-gray-800 dark:text-white">
              Plazo de corrección vencido
            </p>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
              Pasaron más de 24h desde que se te pidió la corrección.
              Pedile al admin que reabra la corrección o que genere un
              vale nuevo si necesitás cargar otra factura.
            </p>
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Nueva foto de la factura
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={e => onFileChange(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm font-medium text-gray-600 transition hover:border-emerald-400 hover:bg-emerald-50/50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:border-emerald-500/50"
            >
              <Upload size={16} />
              {file ? file.name : "Elegir archivo (imagen o PDF, máx 10 MB)"}
            </button>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={expired || !file || uploading}
            onClick={() => void submit()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            {expired ? "Plazo vencido" : "Subir y enviar a revisión"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
