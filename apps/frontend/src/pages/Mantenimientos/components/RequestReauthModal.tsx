import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { X, AlertOctagon, Unlock, Calendar, Check } from "lucide-react";
import {
  useRequestMaintenanceReauth,
  type Maintenance,
  type MaintenanceReauthAction,
} from "../../../hooks/useMaintenancesV2";
import { DatePicker } from "../../../components/ui/date-picker/DatePicker";

type Props = {
  open: boolean;
  target: Maintenance | null;
  onClose: () => void;
};

/**
 * Jun 2026 — Modal "Pedir reautorización" para operadores / conductores.
 *
 * Solo se abre desde la fila atrasada de un mantenimiento que el caller
 * tiene asignado o creó. El backend exige:
 *   - status === 'Atrasado'
 *   - type === 'Programado'
 *   - caller === assignedUserId || createdBy
 *
 * Reglas de UX:
 *   - action por defecto = 'open' (reabrir a HOY).
 *   - si elige 'reschedule', debe proponer fecha.
 *   - motivo obligatorio (min 3 chars, igual que el backend).
 */
export function RequestReauthModal({ open, target, onClose }: Props) {
  const requestMut = useRequestMaintenanceReauth();
  const [action, setAction] = useState<MaintenanceReauthAction>("open");
  const [reason, setReason] = useState("");
  const [proposedDate, setProposedDate] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Reset state cada vez que cambia el target o se reabre el modal.
  useEffect(() => {
    if (open && target) {
      setAction("open");
      setReason("");
      setProposedDate(null);
      setLocalError(null);
    }
  }, [open, target]);

  if (!open || !target) return null;

  const handleSubmit = async () => {
    setLocalError(null);
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setLocalError("Contanos brevemente qué pasó (mínimo 3 caracteres).");
      return;
    }
    if (action === "reschedule" && !proposedDate) {
      setLocalError("Elegí la fecha para reprogramar.");
      return;
    }
    setSubmitting(true);
    try {
      await requestMut.mutateAsync({
        id:                    target.id,
        action,
        reason:                trimmed,
        proposedScheduledFor:  action === "reschedule" ? proposedDate : null,
      });
      toast.success("Solicitud enviada", {
        description:
          action === "open"
            ? "Pediste que reabran el mantenimiento para hoy. Un supervisor la va a revisar."
            : "Pediste la reprogramación. Un supervisor la va a revisar.",
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No pudimos enviar la solicitud.";
      // Mensaje amigable para el caso 409 (ya hay pendiente).
      if (msg.includes("Ya hay una solicitud pendiente")) {
        setLocalError(msg);
      } else {
        toast.error("No se pudo enviar la solicitud", { description: msg });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const scheduledFmt = target.scheduledFor
    ? new Date(target.scheduledFor).toLocaleDateString("es-EC", {
        day: "2-digit", month: "short", year: "numeric",
      })
    : "—";

  return (
    <AnimatePresence>
      <motion.div
        key="reauth-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          key="reauth-card"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", damping: 22, stiffness: 240 }}
          className="relative w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-white/[0.08] dark:bg-gray-900"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reauth-title"
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="absolute right-3 top-3 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>

          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <AlertOctagon size={22} />
            </div>
            <div className="flex-1">
              <h2
                id="reauth-title"
                className="text-base font-semibold text-gray-900 dark:text-white"
              >
                Pedir reautorización
              </h2>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                Mantenimiento <strong>{target.title ?? target.category}</strong>{" "}
                del vehículo <strong>{target.assetPlate ?? target.assetName ?? "—"}</strong>{" "}
                (programado originalmente para {scheduledFmt}).
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            Este mantenimiento está <strong>atrasado</strong>. Por política del
            sistema no podés editarlo, reprogramarlo ni marcarlo como iniciado
            por tu cuenta. Pedile a un supervisor que lo reabra o lo reprograme.
          </div>

          {/* Selector de acción */}
          <div className="mt-5 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              ¿Qué necesitás?
            </p>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                action === "open"
                  ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                  : "border-gray-200 hover:border-gray-300 dark:border-white/[0.08] dark:hover:border-white/[0.16]"
              }`}
            >
              <input
                type="radio"
                name="reauth-action"
                value="open"
                checked={action === "open"}
                onChange={() => setAction("open")}
                className="mt-1 h-4 w-4 cursor-pointer accent-emerald-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
                  <Unlock size={14} /> Abrir para hoy
                </div>
                <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                  El supervisor reabrió el mantenimiento con la fecha de hoy,
                  para que puedas tomarlo apenas lo apruebe. Queda como
                  &quot;Programado&quot; (no se pasa a En proceso solo).
                </p>
              </div>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                action === "reschedule"
                  ? "border-violet-400 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/10"
                  : "border-gray-200 hover:border-gray-300 dark:border-white/[0.08] dark:hover:border-white/[0.16]"
              }`}
            >
              <input
                type="radio"
                name="reauth-action"
                value="reschedule"
                checked={action === "reschedule"}
                onChange={() => setAction("reschedule")}
                className="mt-1 h-4 w-4 cursor-pointer accent-violet-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
                  <Calendar size={14} /> Reprogramar a otra fecha
                </div>
                <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                  Proponé una fecha. El supervisor puede aceptarla o cambiarla
                  al aprobar. El mantenimiento vuelve a &quot;Programado&quot;.
                </p>
              </div>
            </label>
          </div>

          {/* Fecha propuesta si action === 'reschedule' */}
          {action === "reschedule" && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Fecha propuesta
              </p>
              <DatePicker
                value={proposedDate}
                onChange={(v) => setProposedDate(v)}
                placeholder="Elegí el día"
              />
            </div>
          )}

          {/* Motivo */}
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Motivo (obligatorio)
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Ej: Tuve un imprevisto familiar / el vehículo no estaba disponible / …"
              maxLength={1000}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-white/[0.08] dark:bg-gray-950 dark:text-white dark:placeholder:text-gray-500"
            />
            <p className="mt-1 text-right text-[10px] text-gray-400">
              {reason.length}/1000
            </p>
          </div>

          {localError && (
            <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
              {localError}
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || reason.trim().length < 3}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                "Enviando…"
              ) : (
                <>
                  <Check size={14} /> Enviar solicitud
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
