"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Download, Video, Check, AlertTriangle, Car, User, Calendar,
  MessageSquareWarning, Wrench, Camera, FileText, Loader2, CircleDot, XCircle
} from "lucide-react";
import { toast } from "sonner";
import type { ExitAuthorization, ExitAuthStatus } from "../../../hooks/useExitAuthorizations";
import { ExitAnalysisPanel } from "../../../components/exit-authorizations/ExitAnalysisPanel";
import { useExitAuthorizationAnalysis } from "../../../hooks/useExitAuthorizationAnalysis";
import { fmtDateTimeEc } from "@/lib/datetime";

type Props = {
  authorization: ExitAuthorization | null;
  /** 'viewer' = conductor (sin botones de acción). 'operator' = supervisor/operador/admin/owner. */
  role: "viewer" | "operator";
  onClose: () => void;
  onDecide?: (id: string, action: "approve" | "reject", notes?: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
};

function fmtDate(iso: string | null | undefined): string {
  return fmtDateTimeEc(iso);
}

function StatusPill({ status }: { status: ExitAuthStatus }) {
  const tone =
    status === "Autorizada"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30"
      : status === "Rechazada"
        ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30"
        : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:amber-500/30";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "Autorizada" ? "bg-emerald-500" : status === "Rechazada" ? "bg-rose-500" : "bg-amber-500"}`} />
      {status}
    </span>
  );
}

const ITEM_LABELS: Record<string, string> = {
  refrigerante: "Líquido refrigerante",
  frenos: "Líquido de frenos",
  tablero_luces: "Luces / tablero",
  bateria: "Batería",
  bayoneta_aceite: "Bayoneta de aceite",
};

export function ExitAuthDetailDrawer({ authorization, role, onClose, onDecide, onDelete }: Props) {
  const [busy, setBusy] = useState<"approve" | "reject" | "delete" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");

  // ── Modal de rechazo manual por imagen ──
  // Cuando el supervisor click la X sobre una imagen específica, se
  // abre este modal para pedir la razón. Al confirmar, acumula la
  // rejection en DB (no envía al conductor — eso lo hace el botón
  // "Devolver al conductor" del footer que consolida Gemini + manuales).
  const [rejectTarget, setRejectTarget] = useState<{
    field: 'coolantPhotoUrl' | 'brakeFluidPhotoUrl' | 'lightsPhotoUrl' | 'batteryPhotoUrl' | 'oilBayonetaVideoUrl';
    itemType: 'refrigerante' | 'frenos' | 'tablero_luces' | 'bateria' | 'bayoneta_aceite';
    label: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [rejectTick, setRejectTick] = useState(0); // fuerza refresh del panel después de rechazar

  // La IA es la autoridad: el botón "Aprobar salida" debe respetar su
  // decisión. Si el análisis no terminó, está en duda, o marcó algún
  // ítem como no apto, no se puede aprobar a ciegas — el supervisor
  // primero debe resolver eso desde el panel de análisis (overrides).
  //
  // También extraemos rejectionsByType (para mostrar el candado rojo en
  // las imágenes rechazadas) y returnToDriver (consolida y envía).
  const {
    overallDecision,
    isComplete: analysisComplete,
    itemsToCorrect,
    itemsAwaitingReview,
    rejectionsByType,
    effectiveStatuses,
    returnToDriver,
    companyId: hookCompanyId,
  } = useExitAuthorizationAnalysis(authorization?.id ?? null);

  useEffect(() => {
    if (!authorization) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy && !exporting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [authorization, onClose, busy, exporting]);

  useEffect(() => {
    if (authorization) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [authorization]);

  if (!authorization) return null;

  const a = authorization;
  const isPending = a.status === "Pendiente";
  const canDecide = role === "operator" && isPending;
  const canDelete = role === "operator" && !isPending;

  // Si la autorización tiene algún análisis de IA, su decisión efectiva
  // manda. Sin análisis (autorización vacía o nunca analizada), se
  // permite aprobar directo — no hay autoridad de la IA que respetar.
  const hasAnalysis = overallDecision !== "pendiente";
  const aiBlocksApproval = hasAnalysis && analysisComplete && overallDecision !== "apto";
  const approveBlockedReason = !analysisComplete
    ? "Esperando que termine el análisis de IA."
    : overallDecision === "requiere_revision_humana"
    ? `La IA marcó ${itemsAwaitingReview.length} ${itemsAwaitingReview.length === 1 ? "ítem" : "ítems"} en duda. Resolvélo desde el panel de análisis antes de aprobar.`
    : overallDecision === "requiere_correccion"
    ? `La IA indica que ${itemsToCorrect.length} ${itemsToCorrect.length === 1 ? "ítem" : "ítems"} no puede${itemsToCorrect.length === 1 ? "" : "n"} salir. Hacé override desde el panel de análisis si querés aprobar igual.`
    : null;

  const aiSummaryForReject = useMemo(() => {
    const failing = effectiveStatuses.filter((s) => !s.puedeSalir);
    if (failing.length === 0) return "";
    return failing
      .map((s) => `• ${ITEM_LABELS[s.itemType] ?? s.itemType}: ${s.razon}`)
      .join("\n");
  }, [effectiveStatuses]);

  async function downloadPdf() {
    setExporting(true);
    try {
      const { generateExitAuthPdf } = await import("./ExitAuthorizationPdf");
      const blob = await generateExitAuthPdf(a);
      const url = URL.createObjectURL(blob);
      const xa = document.createElement("a");
      xa.href = url;
      const date = (a.requestedAt ?? "").slice(0, 10);
      xa.download = `autorizacion-${(a.assetPlate ?? a.assetLabel ?? "vehiculo").replace(/[^\w-]+/g, "_")}-${date}.pdf`;
      document.body.appendChild(xa);
      xa.click();
      xa.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo generar el PDF");
    } finally {
      setExporting(false);
    }
  }

  async function handleApprove() {
    if (!onDecide) return;
    setBusy("approve");
    try { await onDecide(a.id, "approve"); } finally { setBusy(null); }
  }
  async function handleReject() {
    if (!onDecide) return;
    setBusy("reject");
    const notes = rejectNotes.trim() || aiSummaryForReject || undefined;
    try { await onDecide(a.id, "reject", notes); } finally { setBusy(null); }
  }

  /**
   * Devolver al conductor con correcciones:
   * - El panel de análisis ya acumuló las correcciones (IA + rechazos
   *   manuales del supervisor).
   * - El supervisor hace click en el botón del footer.
   * - El backend consolida la lista y notifica al conductor por WS.
   *   La autorización queda en status Pendiente pero con
   *   correctionsSnapshot poblado.
   *
   * GEMINI también puede disparar este mismo flujo automáticamente
   * (ver autoSendCorrectionsToDriver en exit-corrections.service) —
   * no necesitamos pasar por acá para que el conductor vea el card
   * amarillo con "Corregir ahora". Este botón es para el caso donde
   * el supervisor acumuló correcciones manuales ADEMÁS de las de la
   * IA y quiere mandarlas consolidadas.
   */
  async function handleReturnToDriver() {
    if (!a.id) return;
    setBusy("return");
    try {
      const result = await returnToDriver();
      if (result) {
        toast.success(`Devuelta al conductor con ${result.correctionsCount} correcciones (ronda ${result.round}).`);
      } else {
        toast.error("No se pudo devolver al conductor.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al devolver al conductor");
    } finally {
      setBusy(null);
    }
  }
  async function handleDelete() {
    if (!onDelete) return;
    if (!confirm("¿Eliminar esta autorización? Esta acción no se puede deshacer.")) return;
    setBusy("delete");
    try { await onDelete(a.id); } finally { setBusy(null); }
  }

  /**
   * Abre el modal de rechazo manual para una imagen específica.
   * Al confirmar, acumula la rejection en DB — no envía al conductor
   * todavía. El supervisor confirma el envío con "Devolver al
   * conductor con correcciones" del footer.
   */
  function openImageRejectDialog(
    field: 'coolantPhotoUrl' | 'brakeFluidPhotoUrl' | 'lightsPhotoUrl' | 'batteryPhotoUrl' | 'oilBayonetaVideoUrl',
  ) {
    const meta = EVIDENCE_TO_ITEM_TYPE[field];
    if (!meta) return;
    setRejectTarget({ field, itemType: meta.itemType, label: meta.label });
    setRejectReason('');
  }

  async function confirmImageReject() {
    if (!rejectTarget || !authorization) return;
    if (rejectReason.trim().length < 3) {
      toast.error("Escribí una razón (mínimo 3 caracteres).");
      return;
    }
    // El companyId viene del hook (que ya lo resuelve de la sesión).
    // NO parsear la URL del browser: el frontend corre en Vite (5173)
    // y la URL no tiene /company/N — eso causaba el error
    // "No se pudo determinar la empresa" que el usuario veía.
    if (!hookCompanyId) {
      toast.error("No se pudo determinar la empresa desde la sesión. Reintentá iniciar sesión.");
      return;
    }
    setRejectSubmitting(true);
    try {
      const res = await fetch(
        `/api/company/${hookCompanyId}/exit-authorizations/${authorization.id}/items/${rejectTarget.itemType}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'request_recapture',
            reason: rejectReason.trim(),
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      toast.success(`Imagen de "${rejectTarget.label}" marcada para rehacer.`);
      setRejectTarget(null);
      setRejectReason('');
      setRejectTick(t => t + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al marcar la imagen");
    } finally {
      setRejectSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {authorization && (
        <>
          <motion.div key="bd"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            onClick={() => { if (!busy && !exporting) onClose(); }}
            className="fixed inset-0 z-40 bg-gray-900/40 backdrop-blur-[2px]" />

          <motion.aside key="dr"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-white/[0.08]">

            {/* HEADER */}
            <header className="px-4 py-5 sm:px-7 border-b border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 dark:bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                      <Wrench size={10} /> Autorización
                    </span>
                    <StatusPill status={a.status} />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight truncate">
                    {a.assetPlate ?? a.assetLabel ?? "Vehículo"}
                  </h2>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 truncate">
                    {a.assetName ?? a.assetLabel ?? "—"}
                  </p>
                </div>
                <button type="button" onClick={onClose} disabled={!!busy || exporting}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-gray-200 transition disabled:opacity-50">
                  <X size={18} />
                </button>
              </div>
            </header>

            {/* BODY */}
            <div className="flex-1 overflow-y-auto bg-gray-50/40 dark:bg-gray-950/20">
              {/* Meta */}
              <div className="px-4 py-5 sm:px-7">
                <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] divide-y divide-gray-100 dark:divide-white/[0.06]">
                  <MetaRow icon={<Car size={12} />}      label="Placa"     value={a.assetPlate ?? a.assetLabel ?? "—"} />
                  <MetaRow icon={<User size={12} />}     label="Conductor" value={a.driverName ?? "—"} />
                  <MetaRow icon={<Calendar size={12} />} label="Solicitada" value={fmtDate(a.requestedAt)} />
                  {a.decidedAt && <MetaRow icon={<Check size={12} />} label="Decidida" value={fmtDate(a.decidedAt)} />}
                  {a.decidedByName && <MetaRow icon={<User size={12} />} label="Decisor" value={a.decidedByName} />}
                </div>
              </div>

              {/* Análisis IA (5 ítems: refrigerante, frenos, tablero/luces, batería, bayoneta) */}
              <div className="px-4 pb-5 sm:px-7">
                <ExitAnalysisPanel
                  exitAuthorizationId={a.id}
                  canTrigger={canDecide}
                />
              </div>

              {/* Evidencias */}
              <div className="px-4 pb-5 sm:px-7 space-y-4">
                <SectionTitle icon={<Camera size={12} />}>Evidencias</SectionTitle>

                {/* Video de la bayoneta (analizado por IA — tiene X para rechazar) */}
                <EvidenceRow
                  label="Bayoneta de aceite (video)"
                  videoUrl={a.oilBayonetaVideoUrl}
                  thumbUrl={a.oilBayonetaVideoThumbUrl}
                  type="video"
                  onReject={canDecide ? () => openImageRejectDialog('oilBayonetaVideoUrl') : undefined}
                  rejected={!!rejectionsByType?.['bayoneta_aceite']}
                  rejectBusy={rejectSubmitting && rejectTarget?.field === 'oilBayonetaVideoUrl'}
                />

                {/* Llantas (4) — no se analizan con IA, no llevan X */}
                <TiresRow urls={a.tirePhotosUrl} />

                {/* Fotos individuales — las 4 que la IA analiza llevan X */}
                <PhotoEvidence
                  label="Líquido refrigerante"
                  url={a.coolantPhotoUrl}
                  onReject={canDecide && a.coolantPhotoUrl ? () => openImageRejectDialog('coolantPhotoUrl') : undefined}
                  rejected={!!rejectionsByType?.['refrigerante']}
                  rejectBusy={rejectSubmitting && rejectTarget?.field === 'coolantPhotoUrl'}
                />
                <PhotoEvidence
                  label="Líquido de frenos"
                  url={a.brakeFluidPhotoUrl}
                  onReject={canDecide && a.brakeFluidPhotoUrl ? () => openImageRejectDialog('brakeFluidPhotoUrl') : undefined}
                  rejected={!!rejectionsByType?.['frenos']}
                  rejectBusy={rejectSubmitting && rejectTarget?.field === 'brakeFluidPhotoUrl'}
                />
                <PhotoEvidence
                  label="Agua del limpia parabrisas"
                  url={a.windshieldWasherPhotoUrl}
                />
                <PhotoEvidence
                  label="Luces"
                  url={a.lightsPhotoUrl}
                  onReject={canDecide && a.lightsPhotoUrl ? () => openImageRejectDialog('lightsPhotoUrl') : undefined}
                  rejected={!!rejectionsByType?.['tablero_luces']}
                  rejectBusy={rejectSubmitting && rejectTarget?.field === 'lightsPhotoUrl'}
                />
                <PhotoEvidence
                  label="Batería"
                  url={a.batteryPhotoUrl}
                  onReject={canDecide && a.batteryPhotoUrl ? () => openImageRejectDialog('batteryPhotoUrl') : undefined}
                  rejected={!!rejectionsByType?.['bateria']}
                  rejectBusy={rejectSubmitting && rejectTarget?.field === 'batteryPhotoUrl'}
                />
                <PhotoEvidence
                  label="Gato hidráulico"
                  url={a.jackPhotoUrl}
                />
              </div>

              {/* Notas */}
              {(a.notes || a.decisionNotes) && (
                <div className="px-7 pb-5 space-y-3">
                  {a.notes && (
                    <div>
                      <SectionTitle icon={<FileText size={12} />}>Notas del conductor</SectionTitle>
                      <p className="mt-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{a.notes}</p>
                    </div>
                  )}
                  {a.decisionNotes && (
                    <div>
                      <SectionTitle icon={<MessageSquareWarning size={12} />}>
                        {a.status === "Autorizada" ? "Motivo de aprobación" : "Motivo de rechazo"}
                      </SectionTitle>
                      <p className={
                        a.status === "Autorizada"
                          // Verde si la autorización fue aprobada
                          ? "mt-2 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/[0.04] px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100"
                          // Rojo si fue rechazada
                          : "mt-2 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/60 dark:bg-rose-500/[0.04] px-4 py-3 text-sm text-rose-900 dark:text-rose-100"
                      }>{a.decisionNotes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* FOOTER */}
            <footer className="border-t border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 shrink-0">
              <div className="flex flex-col gap-3 px-4 py-3 sm:px-5 sm:py-3.5">
                {canDelete ? (
                  <button type="button" onClick={handleDelete} disabled={!!busy}
                    className="self-start rounded-lg border border-rose-200 dark:border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-40 transition">
                    Eliminar
                  </button>
                ) : null}

                {canDecide ? (
                  <div className="w-full">
                    <textarea
                      placeholder={aiSummaryForReject || "Nota de rechazo (opcional)…"}
                      value={rejectNotes}
                      onChange={(e) => setRejectNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/10 resize-none" />
                    {rejectNotes.length > 0 && (
                      <button type="button" onClick={() => setRejectNotes("")}
                        className="mt-1 text-xs text-gray-500 dark:text-gray-400 underline">
                        Limpiar nota de rechazo
                      </button>
                    )}
                  </div>
                ) : null}

                {canDecide ? (
                  <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                    <button
                      type="button"
                      onClick={handleReturnToDriver}
                      disabled={!!busy}
                      title="Devolver al conductor para que rehaga las fotos marcadas. El sistema le notificará qué fotos rehacer."
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/15 disabled:opacity-40 transition"
                    >
                      {busy === "return" && <Loader2 size={12} className="animate-spin" />}
                      Devolver al conductor con correcciones
                    </button>
                    <button type="button" onClick={handleReject} disabled={!!busy}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/15 disabled:opacity-40 transition"
                      title="Rechazar definitivamente sin esperar correcciones. Las correcciones acumuladas se descartan.">
                      {busy === "reject" && <Loader2 size={12} className="animate-spin" />}
                      Rechazar
                    </button>
                    <button type="button" onClick={handleApprove} disabled={!!busy}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 px-4 py-2 text-xs font-semibold text-white transition">
                      {busy === "approve" && <Loader2 size={12} className="animate-spin" />}
                      Aprobar salida
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={downloadPdf} disabled={exporting}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition sm:w-auto">
                    {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    {exporting ? "Generando…" : "Descargar PDF"}
                  </button>
                )}
              </div>
            </footer>
          </motion.aside>

          {/* Modal de rechazo manual por imagen. Acumula sin enviar. */}
          <AnimatePresence>
            {rejectTarget && (
              <motion.div
                key="img-reject-modal"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                onClick={() => !rejectSubmitting && setRejectTarget(null)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-md rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 p-5 shadow-2xl"
                >
                  <div className="flex items-start gap-2.5 mb-3">
                    <div className="shrink-0 rounded-lg bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 p-2">
                      <XCircle size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Marcar imagen de "{rejectTarget.label}"
                      </h3>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Se acumula junto con las correcciones de la IA. Cuando confirmes
                        el envío al conductor, se le notificará que rehaga esta imagen
                        con tu razón.
                      </p>
                    </div>
                  </div>
                  <textarea
                    autoFocus
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    placeholder='Ej: "la foto está borrosa", "no se ve el nivel del depósito"…'
                    className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/10 resize-none"
                  />
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setRejectTarget(null)}
                      disabled={rejectSubmitting}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] rounded-lg transition disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={confirmImageReject}
                      disabled={rejectSubmitting || rejectReason.trim().length < 3}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition"
                    >
                      {rejectSubmitting && <Loader2 size={11} className="animate-spin" />}
                      Acumular corrección
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

/**
 * Mapeo entre el campo URL de la autorización y el itemType que usa el
 * backend (exit_auth_item_type). Lo usamos para saber qué itemType
 * corresponde a cada evidencia visible, así podemos rechazar esa
 * imagen individualmente con POST /items/:itemType/reject.
 *
 * Solo las 5 evidencias que pasan por la IA tienen itemType. Las otras
 * (llantas, gata, limpiaparabrisas) no se pueden rechazar individualmente
 * desde la imagen — habría que rechazar la solicitud entera.
 */
const EVIDENCE_TO_ITEM_TYPE: Record<string, {
  itemType: 'refrigerante' | 'frenos' | 'tablero_luces' | 'bateria' | 'bayoneta_aceite';
  label: string;
}> = {
  coolantPhotoUrl:    { itemType: 'refrigerante',    label: 'Líquido refrigerante'        },
  brakeFluidPhotoUrl: { itemType: 'frenos',          label: 'Líquido de frenos'          },
  lightsPhotoUrl:     { itemType: 'tablero_luces',   label: 'Luces / tablero'            },
  batteryPhotoUrl:    { itemType: 'bateria',         label: 'Batería'                    },
  oilBayonetaVideoUrl:{ itemType: 'bayoneta_aceite', label: 'Bayoneta de aceite (video)' },
};

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <span className="text-gray-400 dark:text-gray-500">{icon}</span>
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 shrink-0 w-24">{label}</span>
      <span className="text-sm text-gray-800 dark:text-gray-200 truncate flex-1 text-right">{value}</span>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
      {icon} {children}
    </p>
  );
}

function PhotoEvidence({
  label,
  url,
  onReject,
  rejected,
  rejectBusy,
}: {
  label: string;
  url: string | null;
  /**
   * Si se pasa, se muestra una X flotante en la esquina superior
   * derecha de la imagen para que el supervisor pueda rechazarla
   * manualmente. Al click se abre el modal de razón.
   */
  onReject?: () => void;
  /** Si ya está marcada como "rehacer foto", muestra el candado rojo. */
  rejected?: boolean;
  /** Spinner mientras se procesa el rechazo. */
  rejectBusy?: boolean;
}) {
  if (!url) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.02] px-4 py-3 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2">
        <Camera size={12} /> {label} — sin foto
      </div>
    );
  }
  return (
    <div className={`rounded-xl border bg-white dark:bg-white/[0.02] overflow-hidden ${rejected ? 'border-rose-300 dark:border-rose-500/40' : 'border-gray-200 dark:border-white/[0.08]'}`}>
      <div className="relative">
        <a href={url} target="_blank" rel="noopener noreferrer" className="block group">
          <img src={url} alt={label} className={`w-full h-44 object-cover group-hover:opacity-90 transition ${rejected ? 'opacity-60' : ''}`} />
        </a>
        {/* X flotante para rechazar manualmente esta imagen.
            Acumula la rejection (no envía al conductor) — el supervisor
            después confirma con "Devolver al conductor" en el footer. */}
        {onReject && (
          <button
            type="button"
            onClick={onReject}
            disabled={rejectBusy}
            title={rejected ? "Esta imagen ya está marcada para rehacer. Click para ver/quitar." : "Marcar esta imagen como mal tomada"}
            className={`absolute top-2 right-2 inline-flex items-center justify-center h-7 w-7 rounded-full shadow-md transition active:scale-95 ${
              rejected
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : 'bg-white/95 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200'
            } disabled:opacity-50`}
          >
            {rejectBusy ? <Loader2 size={13} className="animate-spin" /> : <X size={13} strokeWidth={2.5} />}
          </button>
        )}
        {rejected && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow">
            <XCircle size={10} /> A rehacer
          </span>
        )}
        {!rejected && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            <Camera size={10} /> Ver
          </span>
        )}
      </div>
      <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function TiresRow({ urls }: { urls: string[] }) {
  const labels = ["Delantera izquierda", "Delantera derecha", "Trasera izquierda", "Trasera derecha"];
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Llantas</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {labels.map((label, i) => {
          const url = urls[i];
          if (!url) {
            return (
              <div key={i} className="rounded-lg border border-dashed border-gray-200 dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.02] px-2 py-3 text-[10px] text-gray-400 dark:text-gray-500 flex flex-col items-center gap-1">
                <CircleDot size={14} />
                {label}
                <span>—</span>
              </div>
            );
          }
          return (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
              className="relative block rounded-lg border border-gray-200 dark:border-white/[0.08] overflow-hidden group">
              <img src={url} alt={label} className="w-full h-24 object-cover group-hover:opacity-90 transition" />
              <span className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white bg-black/70">{label}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function EvidenceRow({ label, videoUrl, thumbUrl, type, onReject, rejected, rejectBusy }: {
  label: string; videoUrl: string | null; thumbUrl: string | null; type: "video" | "image";
  onReject?: () => void;
  rejected?: boolean;
  rejectBusy?: boolean;
}) {
  if (!videoUrl) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.02] px-4 py-3 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2">
        <Video size={12} /> {label} — sin video
      </div>
    );
  }
  return (
    <div className={`rounded-xl border bg-white dark:bg-white/[0.02] overflow-hidden ${rejected ? 'border-rose-300 dark:border-rose-500/40' : 'border-gray-200 dark:border-white/[0.08]'}`}>
      <div className="relative bg-gray-900">
        <video src={videoUrl} controls poster={thumbUrl ?? undefined} className={`w-full max-h-56 ${rejected ? 'opacity-60' : ''}`} />
        {onReject && (
          <button
            type="button"
            onClick={onReject}
            disabled={rejectBusy}
            title={rejected ? "Este video ya está marcado para rehacer." : "Marcar este video como mal tomado"}
            className={`absolute top-2 right-2 inline-flex items-center justify-center h-7 w-7 rounded-full shadow-md transition active:scale-95 ${
              rejected
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : 'bg-white/95 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200'
            } disabled:opacity-50`}
          >
            {rejectBusy ? <Loader2 size={13} className="animate-spin" /> : <X size={13} strokeWidth={2.5} />}
          </button>
        )}
        {rejected && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow">
            <XCircle size={10} /> A rehacer
          </span>
        )}
      </div>
      <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
        <Video size={11} /> {label}
      </p>
    </div>
  );
}
