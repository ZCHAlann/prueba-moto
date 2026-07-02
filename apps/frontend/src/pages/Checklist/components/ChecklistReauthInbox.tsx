"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox, Send, CheckCircle2, ShieldAlert, Loader2, X,
  MessageSquare, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { useChecklistReauth, type ReauthStatus } from "../../../hooks/useChecklistReauth";

/**
 * Bandeja de solicitudes de reautorización para usuarios con permiso
 * `checklist.reautorizaciones.ver`. Renderiza una tabla con el motivo,
 * quién pidió, plantilla, activo y ciclo, y botones de Aprobar/Rechazar.
 *
 * Si el usuario NO tiene `reautorizaciones.editar` (admin o supervisor
 * delegado), los botones se ocultan y la tabla es solo lectura.
 */
export function ChecklistReauthInbox({
  canDecide,
}: {
  canDecide: boolean;
}) {
  const { requests, total, loading, error, fetchRequests, decideRequest } = useChecklistReauth();
  const [statusFilter, setStatusFilter] = useState<ReauthStatus | "all">("Pendiente");
  const [decideModal, setDecideModal] = useState<{
    id: string; decision: "Autorizada" | "Rechazada";
  } | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Re-fetch al backend cuando cambia el filtro de status (paginación del lado
  // del servidor — la lista `requests` ya es la página filtrada).
  useEffect(() => {
    const status = statusFilter === "all" ? undefined : statusFilter;
    void fetchRequests({ status });
    // fetchRequests tiene `companyId` como única dep estable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleSubmitDecide() {
    if (!decideModal) return;
    if (decideModal.decision === "Rechazada" && notes.trim().length < 5) {
      toast.error("La nota es obligatoria al rechazar (mínimo 5 caracteres).");
      return;
    }
    setSubmitting(true);
    try {
      await decideRequest(decideModal.id, {
        decision: decideModal.decision,
        notes: notes.trim() || undefined,
      });
      toast.success(
        decideModal.decision === "Autorizada"
          ? "Reautorización aprobada."
          : "Reautorización rechazada.",
      );
      setDecideModal(null);
      setNotes("");
      // Re-fetch con el filtro actual para que el conteo se mantenga coherente.
      void fetchRequests({ status: statusFilter === "all" ? undefined : statusFilter });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al decidir");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && requests.length === 0) {
    return (
      <div className="space-y-2">
        <div className="h-10 animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.04]" />
        <div className="h-48 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header + filtro */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/[0.04]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
              <Inbox size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                Bandeja de reautorizaciones
              </p>
              <h2 className="text-base font-bold text-gray-800 dark:text-white">
                {total === 0
                  ? "Sin solicitudes"
                  : `${total} ${total === 1 ? "solicitud" : "solicitudes"}`}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {canDecide
                  ? "Aprobad o rechazad las solicitudes de checklists atrasados."
                  : "Solo lectura — no tenés permiso para decidir."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
            {(["Pendiente", "Autorizada", "Rechazada", "all"] as const).map((s) => {
              const isActive = statusFilter === s;
              // El backend pagina y filtra por status; solo tenemos el count
              // del chip activo (es la página actual). Los demás chips muestran
              // el total del backend (que corresponde al universo del filtro
              // activo, no a los otros estados). Para no mentir con un count
              // falso, mostramos el count solo del chip activo.
              const count = isActive ? total : null;
              return (
                <FilterChip
                  key={s}
                  active={isActive}
                  onClick={() => setStatusFilter(s)}
                  label={s === "all" ? "Todas" : s}
                  count={count}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Lista */}
      {requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400 dark:border-white/[0.06]">
          {statusFilter === "Pendiente"
            ? "No hay solicitudes pendientes."
            : statusFilter === "all"
              ? "No hay solicitudes registradas."
              : `No hay solicitudes en estado "${statusFilter}".`}
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <ReauthInboxRow
              key={r.id}
              row={r}
              canDecide={canDecide}
              onApprove={() => { setDecideModal({ id: r.id, decision: "Autorizada" }); setNotes(""); }}
              onReject={()  => { setDecideModal({ id: r.id, decision: "Rechazada" }); setNotes(""); }}
            />
          ))}
        </div>
      )}

      {/* Modal decidir */}
      <AnimatePresence>
        {decideModal && (
          <DecideModal
            decision={decideModal.decision}
            notes={notes}
            setNotes={setNotes}
            submitting={submitting}
            onSubmit={handleSubmitDecide}
            onClose={() => { if (!submitting) { setDecideModal(null); setNotes(""); } }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-componentes ───────────────────────────────────────────────────────

function FilterChip({ active, onClick, label, count }: {
  active: boolean; onClick: () => void; label: string; count: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
        active
          ? "bg-emerald-500 text-white shadow-sm"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.04]"
      }`}
    >
      {label}
      {count != null && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
          active ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600 dark:bg-white/[0.08] dark:text-gray-400"
        }`}>{count}</span>
      )}
    </button>
  );
}

function ReauthInboxRow({ row, canDecide, onApprove, onReject }: {
  row: import("../../../hooks/useChecklistReauth").ChecklistReauthRequest;
  canDecide: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const pending = row.status === "Pendiente";
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start gap-3 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
          <ClipboardList size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-gray-800 dark:text-white truncate">
              {row.categoryName ?? row.categoryId}
            </span>
            {row.assetLabel && (
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                · {row.assetLabel}
              </span>
            )}
            <StatusBadge status={row.status} />
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            Pedido por <strong>{row.requestedByName ?? "—"}</strong> · ciclo {row.cycleStart.slice(0, 10)} – {row.cycleEnd.slice(0, 10)}
          </p>
          <p className="mt-1 text-xs italic text-gray-600 dark:text-gray-400">"{row.reason}"</p>
          {row.status === "Rechazada" && row.decisionNotes && (
            <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
              <span className="font-semibold">Tu nota:</span> {row.decisionNotes}
            </p>
          )}
          {row.status === "Autorizada" && row.completedChecklistId && (
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
              <span className="font-semibold">Ya completada</span> ({row.completedChecklistId})
            </p>
          )}
        </div>

        {canDecide && pending && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onReject}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              <ShieldAlert size={11} /> Rechazar
            </button>
            <button
              type="button"
              onClick={onApprove}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-600 active:scale-95"
            >
              <CheckCircle2 size={11} /> Aprobar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ReauthStatus }) {
  if (status === "Pendiente") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
        Pendiente
      </span>
    );
  }
  if (status === "Autorizada") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
        <CheckCircle2 size={9} /> Autorizada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
      <ShieldAlert size={9} /> Rechazada
    </span>
  );
}

function DecideModal({
  decision, notes, setNotes, submitting, onSubmit, onClose,
}: {
  decision: "Autorizada" | "Rechazada";
  notes: string;
  setNotes: (s: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const rejected = decision === "Rechazada";
  const ok = rejected ? notes.trim().length >= 5 : true;
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-3 sm:p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]"
        >
          <div className={`border-b border-gray-100 px-5 py-4 dark:border-white/[0.06] ${
            rejected
              ? "bg-gradient-to-br from-rose-50/80 via-white to-rose-50/40 dark:from-rose-500/10 dark:via-[#0d1320] dark:to-rose-500/5"
              : "bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/40 dark:from-emerald-500/10 dark:via-[#0d1320] dark:to-emerald-500/5"
          }`}>
            <div className="flex items-center justify-between">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${
                rejected ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
              }`}>
                {rejected ? "Rechazar" : "Aprobar"} reautorización
              </p>
              <button onClick={onClose} disabled={submitting}
                className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-white">
                <X size={14} />
              </button>
            </div>
            <h2 className="mt-0.5 text-base font-bold text-gray-800 dark:text-white">
              {rejected
                ? "Vas a rechazar esta solicitud"
                : "Vas a aprobar esta solicitud"}
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {rejected
                ? "Dejá una nota explicando por qué — el solicitante la va a ver."
                : "El solicitante podrá hacer el checklist atrasado desde la sección Atrasados."}
            </p>
          </div>
          <div className="px-5 py-4">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {rejected ? <>Nota <span className="text-rose-500">*</span></> : "Nota (opcional)"}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder={rejected ? "Mínimo 5 caracteres." : "Algo que el solicitante deba saber (opcional)."}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200"
            />
            {rejected && (
              <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                {notes.trim().length}/5+ caracteres
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <button
              onClick={onClose} disabled={submitting}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]"
            >
              Cancelar
            </button>
            <button
              disabled={!ok || submitting}
              onClick={onSubmit}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold text-white shadow-sm transition disabled:opacity-40 ${
                rejected ? "bg-rose-500 hover:bg-rose-600" : "bg-emerald-500 hover:bg-emerald-600"
              }`}
            >
              {submitting
                ? <><Loader2 size={11} className="animate-spin" /> Enviando…</>
                : rejected
                  ? <><ShieldAlert size={11} /> Rechazar</>
                  : <><CheckCircle2 size={11} /> Aprobar</>}
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}