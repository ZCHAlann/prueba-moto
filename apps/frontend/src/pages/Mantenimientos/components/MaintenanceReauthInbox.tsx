import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Inbox, Check, X, Unlock, Calendar, MessageSquare,
  ChevronRight, FileText,
} from "lucide-react";
import { usePermissions } from "../../../hooks/usePermissions";
import {
  useMaintenanceReauths,
  useMaintenanceReauthsFor,
  useApproveMaintenanceReauth,
  useDenyMaintenanceReauth,
  type MaintenanceReauthorization,
  type MaintenanceReauthStatus,
} from "../../../hooks/useMaintenancesV2";
import { fmtDateTimeEc, fmtDateShortEc } from "@/lib/datetime";

/**
 * Jun 2026 — Bandeja de solicitudes de reautorización.
 *
 * Dos modos:
 *   - Aprobador (admin/supervisor con `reautorizaciones.editar`) → bandeja
 *     global con filtros Pendiente / Aprobada / Rechazada / Todas.
 *   - Operador/Conductor con solo `reautorizaciones.ver` → solo ve SUS
 *     propias solicitudes (filtro de backend en GET /reauths).
 *
 * Acciones:
 *   - Aprobar → abre modal con campo de notas y (si action === 'reschedule')
 *               campo fecha. Si action === 'open', la fecha se ignora (HOY).
 *   - Rechazar → modal chico solo con motivo obligatorio.
 */
export function MaintenanceReauthInbox() {
  const { can } = usePermissions();
  const canApprove = can("mantenimiento", "reautorizaciones", "editar");

  const [statusFilter, setStatusFilter] = useState<MaintenanceReauthStatus | "all">("Pendiente");
  const { data: rows = [], isLoading } = useMaintenanceReauths({ status: statusFilter });

  // Modal de aprobar
  const [approving, setApproving] = useState<MaintenanceReauthorization | null>(null);
  // Modal de rechazar
  const [denying,  setDenying]   = useState<MaintenanceReauthorization | null>(null);
  // Detalle (timeline por mantenimiento)
  const [detailReauth, setDetailReauth] = useState<MaintenanceReauthorization | null>(null);

  const counts = useMemo(() => {
    const all = rows.length;
    return { all, displayed: all };
  }, [rows]);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header de la bandeja + filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Inbox size={16} className="text-violet-500" />
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
            {canApprove ? "Bandeja de reautorizaciones" : "Mis solicitudes"}
          </h2>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
            {counts.displayed}
          </span>
          <Link
            to="/mantenimiento/reportes/reautorizaciones"
            className="ml-2 inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/[0.04]"
          >
            <FileText size={11} /> Ver reporte
          </Link>
        </div>
        <div className="flex gap-1">
          {(
            [
              { id: "Pendiente", label: "Pendientes" },
              { id: "Aprobada",  label: "Aprobadas"  },
              { id: "Rechazada", label: "Rechazadas" },
              { id: "all",       label: "Todas"      },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                statusFilter === f.id
                  ? "border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/[0.04]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-900">
        {isLoading && (
          <div className="p-6 text-center text-xs text-gray-500">Cargando…</div>
        )}
        {!isLoading && rows.length === 0 && (
          <EmptyState
            title={
              statusFilter === "Pendiente"
                ? "Sin solicitudes pendientes"
                : "Nada por acá"
            }
            description={
              statusFilter === "Pendiente"
                ? "Cuando un operador pida que reabran un mantenimiento atrasado, va a aparecer acá."
                : "Cambiá el filtro para ver solicitudes en otros estados."
            }
          />
        )}
        {!isLoading && rows.length > 0 && (
          <ul className="divide-y divide-gray-100 dark:divide-white/[0.06]">
            {rows.map((r) => (
              <ReauthRow
                key={r.id}
                row={r}
                canApprove={canApprove}
                onApprove={() => setApproving(r)}
                onDeny={() => setDenying(r)}
                onViewDetail={() => setDetailReauth(r)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Modales */}
      {approving && (
        <ApproveReauthModal
          row={approving}
          onClose={() => setApproving(null)}
        />
      )}
      {denying && (
        <DenyReauthModal
          row={denying}
          onClose={() => setDenying(null)}
        />
      )}
      {detailReauth && (
        <ReauthDetailDrawer
          row={detailReauth}
          onClose={() => setDetailReauth(null)}
        />
      )}
    </div>
  );
}

// ───────────────────────────── Fila ──────────────────────────────────────────

function ReauthRow({
  row, canApprove, onApprove, onDeny, onViewDetail,
}: {
  row: MaintenanceReauthorization;
  canApprove: boolean;
  onApprove: () => void;
  onDeny: () => void;
  onViewDetail: () => void;
}) {
  const actionMeta = row.action === "open"
    ? { icon: <Unlock size={12} />,  label: "Abrir",     tone: "emerald" }
    : { icon: <Calendar size={12} />, label: "Reprogramar", tone: "violet" };

  const statusMeta =
    row.status === "Pendiente"
      ? { label: "Pendiente", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" }
      : row.status === "Aprobada"
      ? { label: "Aprobada",  cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" }
      : { label: "Rechazada", cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" };

  return (
    <li className="group flex flex-col gap-2 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
            actionMeta.tone === "emerald"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300"
          }`}>
            {actionMeta.icon}
            {actionMeta.label}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${statusMeta.cls}`}>
            {row.status}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            pedida por <strong className="text-gray-700 dark:text-gray-200">{row.requestedByName ?? "—"}</strong>
            {row.requestedByRole ? ` (${row.requestedByRole})` : ""}
          </span>
        </div>
        <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
          Mantenimiento <span className="font-mono text-xs text-gray-500">{row.maintenanceId}</span>
          {" · "}
          <span className="text-xs text-gray-600 dark:text-gray-400">
            programado originalmente para {fmtDateShortEc(row.maintenanceScheduledFor)}
          </span>
        </p>
        <p className="mt-1 line-clamp-2 text-xs text-gray-600 dark:text-gray-400">
          &quot;{row.reason}&quot;
        </p>
        {row.appliedScheduledFor && (
          <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
            Aplicada: {fmtDateTimeEc(row.appliedScheduledFor)}
          </p>
        )}
        {/* Seguimiento para el operador (puede ver, no aprobar).
            Mostramos quién decidió, cuándo y la nota — fundamental para que
            el operador sepa POR QUÉ su pedido fue rechazado y qué hacer. */}
        {!canApprove && row.status !== "Pendiente" && (
          <p className="mt-1 line-clamp-2 text-[11px] text-gray-500 dark:text-gray-400">
            {row.status === "Aprobada" ? "Aprobada" : "Rechazada"} por{" "}
            <strong className="text-gray-700 dark:text-gray-200">{row.decidedByName ?? "—"}</strong>
            {row.decidedAt && <> el {fmtDateTimeEc(row.decidedAt)}</>}
            {row.decisionNotes && (
              <span className="ml-1 italic text-gray-600 dark:text-gray-300">
                &mdash; &quot;{row.decisionNotes}&quot;
              </span>
            )}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onViewDetail}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
          title="Ver detalle / timeline"
        >
          <ChevronRight size={14} />
        </button>
        {canApprove && row.status === "Pendiente" && (
          <>
            <button
              type="button"
              onClick={onDeny}
              className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              <X size={12} /> Rechazar
            </button>
            <button
              type="button"
              onClick={onApprove}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-emerald-600"
            >
              <Check size={12} /> Aprobar
            </button>
          </>
        )}
      </div>
    </li>
  );
}

// ────────────────────────── Aprobar modal ────────────────────────────────────

function ApproveReauthModal({
  row, onClose,
}: { row: MaintenanceReauthorization; onClose: () => void }) {
  const approveMut = useApproveMaintenanceReauth();
  const [decisionNotes, setDecisionNotes] = useState("");
  const isReschedule = row.action === "reschedule";
  const [scheduledFor, setScheduledFor] = useState<string | null>(
    row.proposedScheduledFor ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setError(null);
    if (isReschedule && !scheduledFor) {
      setError("Elegí la fecha para reprogramar.");
      return;
    }
    setSubmitting(true);
    try {
      await approveMut.mutateAsync({
        maintenanceId:   row.maintenanceId,
        reauthId:        row.id,
        newScheduledFor: isReschedule ? scheduledFor : null,
        decisionNotes:   decisionNotes.trim() || null,
      });
      toast.success("Reautorización aprobada", {
        description: isReschedule
          ? `El mantenimiento fue reprogramado a ${fmtDateShortEc(scheduledFor!)}.`
          : "El mantenimiento fue reabierto para hoy.",
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo aprobar.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell onClose={onClose} title="Aprobar reautorización" submitting={submitting}>
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200">
        <p>
          <strong>Pedida por:</strong> {row.requestedByName ?? "—"}
          {row.requestedByRole ? ` (${row.requestedByRole})` : ""}
        </p>
        <p className="mt-1">
          <strong>Mantenimiento:</strong> {row.maintenanceId} · programado para {fmtDateShortEc(row.maintenanceScheduledFor)}
        </p>
        <p className="mt-1 italic text-gray-600 dark:text-gray-300">&quot;{row.reason}&quot;</p>
      </div>

      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
        {isReschedule ? (
          <>
            Vas a <strong>reprogramar</strong> este mantenimiento. Elegí la nueva fecha abajo. Al aprobar, vuelve a &quot;Programado&quot; (no pasa a En proceso solo).
          </>
        ) : (
          <>
            Vas a <strong>abrir</strong> este mantenimiento para hoy. Al aprobar, vuelve a &quot;Programado&quot; (no pasa a En proceso solo). El operador podrá tomarlo apenas lo necesite.
          </>
        )}
      </div>

      {isReschedule && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Nueva fecha
          </p>
          <input
            type="date"
            value={scheduledFor ? scheduledFor.slice(0, 10) : ""}
            onChange={(e) => setScheduledFor(e.target.value ? new Date(e.target.value).toISOString() : null)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-white/[0.08] dark:bg-gray-950 dark:text-white"
          />
          {row.proposedScheduledFor && (
            <p className="mt-1 text-[11px] text-gray-500">
              El operador propuso {fmtDateShortEc(row.proposedScheduledFor)}. Cambiala si querés.
            </p>
          )}
        </div>
      )}

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Nota (opcional)
        </p>
        <textarea
          value={decisionNotes}
          onChange={(e) => setDecisionNotes(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Ej: OK, le damos margen hasta el viernes."
          className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-white/[0.08] dark:bg-gray-950 dark:text-white"
        />
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
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
          onClick={handleApprove}
          disabled={submitting || (isReschedule && !scheduledFor)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:opacity-50"
        >
          <Check size={14} /> {submitting ? "Aprobando…" : "Aprobar"}
        </button>
      </div>
    </ModalShell>
  );
}

// ────────────────────────── Rechazar modal ───────────────────────────────────

function DenyReauthModal({
  row, onClose,
}: { row: MaintenanceReauthorization; onClose: () => void }) {
  const denyMut = useDenyMaintenanceReauth();
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeny = async () => {
    setError(null);
    if (notes.trim().length < 3) {
      setError("Contanos brevemente por qué la rechazás (mínimo 3 caracteres).");
      return;
    }
    setSubmitting(true);
    try {
      await denyMut.mutateAsync({
        maintenanceId: row.maintenanceId,
        reauthId:      row.id,
        decisionNotes: notes.trim(),
      });
      toast.success("Solicitud rechazada", {
        description: "El mantenimiento sigue Atrasado como estaba.",
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo rechazar.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell onClose={onClose} title="Rechazar solicitud" submitting={submitting}>
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200">
        <p>
          <strong>Pedida por:</strong> {row.requestedByName ?? "—"}
          {row.requestedByRole ? ` (${row.requestedByRole})` : ""}
        </p>
        <p className="mt-1 italic">&quot;{row.reason}&quot;</p>
      </div>
      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Motivo del rechazo (obligatorio)
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Ej: Esperá a tu supervisor directo antes de reprogramar."
          className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-white/[0.08] dark:bg-gray-950 dark:text-white"
        />
        <p className="mt-1 text-right text-[10px] text-gray-400">{notes.length}/1000</p>
      </div>
      {error && (
        <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      )}
      <div className="mt-5 flex items-center justify-end gap-2">
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
          onClick={handleDeny}
          disabled={submitting || notes.trim().length < 3}
          className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-600 disabled:opacity-50"
        >
          <X size={14} /> {submitting ? "Rechazando…" : "Rechazar"}
        </button>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────── Detalle (drawer) ────────────────────────────────

function ReauthDetailDrawer({
  row, onClose,
}: { row: MaintenanceReauthorization; onClose: () => void }) {
  const { data: history = [] } = useMaintenanceReauthsFor(row.maintenanceId);
  // Mezclamos la fila actual en el array (puede que la query no haya
  // refrescado todavía).
  const all = useMemo(() => {
    const set = new Map<string, MaintenanceReauthorization>();
    for (const r of history) set.set(r.id, r);
    set.set(row.id, row);
    return Array.from(set.values()).sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
  }, [history, row]);

  return (
    <AnimatePresence>
      <motion.div
        key="reauth-detail-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 26, stiffness: 220 }}
          className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl dark:bg-gray-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Historial de reautorizaciones
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                Mantenimiento <span className="font-mono">{row.maintenanceId}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
            >
              <X size={16} />
            </button>
          </div>

          <ol className="mt-5 space-y-3">
            {all.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-gray-200 px-3 py-2.5 text-xs dark:border-white/[0.08]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-gray-400">{r.id}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                      r.status === "Aprobada"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : r.status === "Rechazada"
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <p className="mt-1 text-gray-800 dark:text-gray-200">
                  <strong>{r.requestedByName ?? "—"}</strong> pidió{" "}
                  {r.action === "open" ? "abrir" : "reprogramar a " + fmtDateShortEc(r.proposedScheduledFor)}.
                </p>
                <p className="mt-1 italic text-gray-600 dark:text-gray-400">&quot;{r.reason}&quot;</p>
                {r.decidedByName && (
                  <p className="mt-1 text-gray-500">
                    {r.status === "Aprobada" ? "Aprobada" : "Rechazada"} por{" "}
                    <strong>{r.decidedByName}</strong> el {fmtDateTimeEc(r.decidedAt)}.
                    {r.appliedScheduledFor && (
                      <> Aplicada: {fmtDateShortEc(r.appliedScheduledFor)}.</>
                    )}
                  </p>
                )}
                {r.decisionNotes && (
                  <p className="mt-1 rounded-md bg-gray-50 px-2 py-1 text-gray-600 dark:bg-white/[0.04] dark:text-gray-300">
                    <MessageSquare size={11} className="mr-1 inline" />{r.decisionNotes}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  );
}

// ───────────────────────────── Helpers ───────────────────────────────────────

function ModalShell({
  title, onClose, submitting, children,
}: {
  title: string;
  onClose: () => void;
  submitting: boolean;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ type: "spring", damping: 22, stiffness: 240 }}
          className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-white/[0.08] dark:bg-gray-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <Check size={16} />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="absolute right-3 top-3 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-50"
          >
            <X size={16} />
          </button>
          <div className="mt-4">{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="rounded-full bg-gray-100 p-3 dark:bg-white/[0.04]">
        <Inbox size={20} className="text-gray-400" />
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{title}</p>
      <p className="max-w-xs text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}
