"use client";

/**
 * ExitAnalysisPanel
 *
 * Panel que muestra el resultado del análisis IA de una autorización de
 * salida. Se integra en el drawer del supervisor.
 *
 * Funcionalidades:
 *   - Muestra los 5 ítems con badge verde/rojo/ámbar y la decisión agregada.
 *   - Permite al supervisor MARCAR un ítem como "mal tomado" con razón.
 *     Eso queda registrado en la tabla exit_analysis_rejections.
 *   - Cuando un ítem está marcado, el panel muestra un banner "Esperando
 *     nueva foto" y un botón "Re-analizar" que solo re-evalúa ese ítem.
 *   - El conductor puede reemplazar una sola foto via PATCH /:authId/photo
 *     (backend lo soporta, el wizard del conductor lo integrará aparte).
 *
 * El botón "Analizar con IA" sigue existiendo para casos donde el análisis
 * automático falló (ej. quota de Gemini) y el supervisor quiere reintentar
 * manualmente.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Camera,
  CircleAlert,
  Droplet,
  Disc,
  Battery,
  Lightbulb,
  X,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useExitAuthorizationAnalysis,
  type AIItemType,
  type AIAnalysisItem,
  type Rejection,
} from '../../hooks/useExitAuthorizationAnalysis';

const ITEM_META: Record<AIItemType, {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  short: string;
  /** Campo URL de la autorización que corresponde a este ítem. */
  photoField: 'coolantPhotoUrl' | 'brakeFluidPhotoUrl' | 'lightsPhotoUrl' | 'batteryPhotoUrl' | 'oilBayonetaVideoUrl';
}> = {
  refrigerante:    { label: 'Refrigerante',       icon: Droplet,    short: 'Nivel y color del refrigerante',  photoField: 'coolantPhotoUrl' },
  frenos:          { label: 'Líquido de frenos',  icon: Disc,       short: 'Nivel y color del líquido de frenos', photoField: 'brakeFluidPhotoUrl' },
  tablero_luces:   { label: 'Tablero / Luces',    icon: Lightbulb,  short: 'Testigos del tablero o luces exteriores', photoField: 'lightsPhotoUrl' },
  bateria:         { label: 'Batería',            icon: Battery,    short: 'Bornes y carcasa', photoField: 'batteryPhotoUrl' },
  bayoneta_aceite: { label: 'Bayoneta de aceite', icon: Camera,     short: 'Nivel y color del aceite', photoField: 'oilBayonetaVideoUrl' },
};

const ITEM_ORDER: AIItemType[] = [
  'refrigerante',
  'frenos',
  'tablero_luces',
  'bateria',
  'bayoneta_aceite',
];

type Props = {
  exitAuthorizationId: string;
  /** Si el usuario actual puede disparar el análisis y rechazar ítems. */
  canTrigger: boolean;
};

function ItemBadge({
  itemType,
  item,
  rejection,
  isLoading,
  canTrigger,
  onMarkBad,
  onApproveOverride,
  onConfirmFail,
}: {
  itemType: AIItemType;
  item: AIAnalysisItem | null;
  rejection: Rejection | null;
  isLoading: boolean;
  canTrigger: boolean;
  onMarkBad: (itemType: AIItemType) => void;
  onApproveOverride: (itemType: AIItemType) => void;
  onConfirmFail: (itemType: AIItemType) => void;
}) {
  const meta = ITEM_META[itemType];
  const Icon = meta.icon;

  // El ítem está marcado por el supervisor como "esperando nueva foto".
  const isWaitingForRecapture = rejection?.action === 'request_recapture';

  if (isLoading && !item) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] px-3 py-2.5">
        <Icon size={16} className="text-gray-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{meta.label}</p>
          <p className="text-[10px] text-gray-400 flex items-center gap-1">
            <Loader2 size={9} className="animate-spin" /> Analizando…
          </p>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-200 dark:border-white/[0.08] bg-gray-50/50 dark:bg-white/[0.02] px-3 py-2.5">
        <Icon size={16} className="text-gray-300 dark:text-gray-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{meta.label}</p>
          <p className="text-[10px] text-gray-400">{meta.short}</p>
        </div>
      </div>
    );
  }

  // Override del supervisor: si hay rejection con override_approve,
  // mostramos el ítem como aprobado aunque la IA haya dicho que no.
  const supervisorApproved = rejection?.action === 'override_approve';
  const supervisorFailed    = rejection?.action === 'confirm_fail';

  const aprobado = (item.puedeSalir || supervisorApproved) && !supervisorFailed && item.confianza !== 'baja';
  const confBaja = item.confianza === 'baja';
  // "en duda" = confianza baja y el supervisor no intervino todavía. Es
  // distinto de "requiere corrección" (la IA decidió que no, con certeza).
  const enDudaSinResolver = confBaja && !supervisorApproved && !supervisorFailed;
  const requiereAtencion = !item.puedeSalir && !supervisorApproved && !enDudaSinResolver;

  const colorClasses = aprobado
    ? 'border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/5'
    : enDudaSinResolver
    ? 'border-amber-300 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10'
    : requiereAtencion
    ? 'border-rose-200 dark:border-rose-500/20 bg-rose-50/50 dark:bg-rose-500/5'
    : 'border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5';

  const IconStatus = aprobado
    ? CheckCircle2
    : enDudaSinResolver
    ? CircleAlert
    : XCircle; // requiereAtencion: la IA decidió con certeza que no puede salir

  const iconColor = aprobado
    ? 'text-emerald-500'
    : enDudaSinResolver
    ? 'text-amber-500'
    : 'text-rose-500'; // tanto "en duda" como "requiere atención por confianza" usan ámbar; rojo queda reservado para rechazo CIERTO de la IA

  // Resumen del nivel/estado.
  const resumen: string[] = [];
  if (item.nivel) resumen.push(`Nivel: ${item.nivel}`);
  if (item.estado) resumen.push(`Estado: ${item.estado}`);
  if (item.color) resumen.push(`Color: ${item.color}`);

  return (
    <div className={`rounded-lg border ${colorClasses} px-3 py-2.5`}>
      <div className="flex items-start gap-2.5">
        <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
          <Icon size={16} className="text-gray-500" />
          <IconStatus size={12} className={iconColor} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-semibold text-gray-800 dark:text-white">{meta.label}</p>
            <span className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 ${
              item.confianza === 'alta'
                ? 'bg-gray-100 dark:bg-white/[0.06] text-gray-500'
                : item.confianza === 'media'
                ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}>
              Confianza {item.confianza}
            </span>
            {supervisorApproved && (
              <span className="text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                Aprobado por supervisor
              </span>
            )}
            {supervisorFailed && (
              <span className="text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300">
                Rechazado por supervisor
              </span>
            )}
            {enDudaSinResolver && (
              <span className="text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
                <CircleAlert size={9} /> En duda — esperando supervisor
              </span>
            )}
          </div>
          {resumen.length > 0 && (
            <p className="mt-1 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
              {resumen.join(' · ')}
            </p>
          )}
          <p className="mt-1 text-[11px] text-gray-700 dark:text-gray-300 leading-snug">
            {item.observaciones}
          </p>
          {!item.puedeSalir && !supervisorApproved && (
            <p className={`mt-1 text-[11px] font-semibold ${enDudaSinResolver ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'}`}>
              {enDudaSinResolver ? 'Nota de la IA: ' : 'Acción: '}{item.accionRecomendada}
            </p>
          )}

          {/* Banner: esperando nueva foto del conductor */}
          {isWaitingForRecapture && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-100 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 px-2 py-1.5">
              <Camera size={11} className="text-amber-700 dark:text-amber-300 shrink-0" />
              <p className="text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                Esperando nueva foto del conductor
              </p>
            </div>
          )}

          {/* Razón escrita por el supervisor */}
          {rejection && (
            <p className="mt-1.5 text-[10px] italic text-gray-500 dark:text-gray-400">
              "{rejection.reason}" — {rejection.decidedByName ?? 'supervisor'}
            </p>
          )}

          {/* Botones del supervisor: solo si el análisis terminó y el
              supervisor tiene permisos y el ítem falló o requiere atención. */}
          {canTrigger && !isLoading && (requiereAtencion || confBaja) && !isWaitingForRecapture && !supervisorApproved && !supervisorFailed && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => onMarkBad(itemType)}
                className="inline-flex items-center gap-1 rounded-md border border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 px-2 py-1 text-[10px] font-semibold transition"
              >
                <X size={10} />
                Marcar como mal
              </button>
              <button
                type="button"
                onClick={() => onApproveOverride(itemType)}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold transition"
              >
                <Check size={10} />
                Aprobar igual
              </button>
              <button
                type="button"
                onClick={() => onConfirmFail(itemType)}
                className="inline-flex items-center gap-1 rounded-md border border-rose-300 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 px-2 py-1 text-[10px] font-semibold transition"
              >
                <XCircle size={10} />
                Confirmar fallo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Mini-modal para pedir la razón del rechazo manual.
 * Devuelve la razón escrita o null si el usuario canceló.
 */
function ReasonDialog({
  open,
  title,
  placeholder,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  placeholder: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 p-5 shadow-2xl"
      >
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          La razón se guarda con la decisión y se muestra al conductor.
        </p>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/10 resize-none"
        />
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] rounded-lg transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={reason.trim().length < 3}
            onClick={() => { onConfirm(reason.trim()); setReason(''); }}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition"
          >
            Confirmar
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function ExitAnalysisPanel({ exitAuthorizationId, canTrigger }: Props) {
  const {
    itemsByType,
    rejectionsByType,
    effectiveStatuses,
    corrections,
    status,
    overallDecision,
    itemsToCorrect,
    itemsAwaitingReview,
    isComplete,
    loading,
    error,
    trigError,
    triggerAnalysis,
    reanalyze,
    markItem,
    returnToDriver,
  } = useExitAuthorizationAnalysis(exitAuthorizationId);

  const [reasonDialog, setReasonDialog] = useState<{
    itemType: AIItemType;
    action: 'request_recapture' | 'override_approve' | 'confirm_fail';
    title: string;
    placeholder: string;
  } | null>(null);

  const hasAnalyses = Object.keys(itemsByType).length > 0;
  const isAnalyzing = status === 'en_proceso' || (loading && !hasAnalyses);
  const pendingRecaptures = Object.values(rejectionsByType).filter(r => r.action === 'request_recapture');

  function openReasonDialog(
    itemType: AIItemType,
    action: 'request_recapture' | 'override_approve' | 'confirm_fail',
  ) {
    const meta = ITEM_META[itemType];
    const title = action === 'request_recapture'
      ? `Marcar "${meta.label}" como mal tomada`
      : action === 'override_approve'
      ? `Aprobar "${meta.label}" manualmente`
      : `Confirmar fallo de "${meta.label}"`;
    const placeholder = action === 'request_recapture'
      ? 'Ej: "la foto está borrosa", "no se ve el nivel del depósito"…'
      : action === 'override_approve'
      ? '¿Por qué aprobás este ítem aunque la IA marcó fallo?…'
      : '¿Por qué confirmás el rechazo de este ítem?…';

    setReasonDialog({ itemType, action, title, placeholder });
  }

  async function confirmReason(reason: string) {
    if (!reasonDialog) return;
    const ok = await markItem(reasonDialog.itemType, reasonDialog.action, reason);
    setReasonDialog(null);
    if (ok) {
      const labels: Record<string, string> = {
        request_recapture: 'Ítem marcado. Se le pedirá al conductor rehacer solo esta foto.',
        override_approve:  'Aprobado manualmente.',
        confirm_fail:      'Fallo confirmado.',
      };
      toast.success(labels[reasonDialog.action] ?? 'Listo');
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.02]">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {isAnalyzing
            ? <Loader2 size={14} className="animate-spin text-amber-500 shrink-0" />
            : <Bot size={14} className="text-gray-500 shrink-0" />
          }
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Análisis IA
          </p>
          {isComplete && (
            <span className={`text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 ${
              overallDecision === 'apto'
                ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : overallDecision === 'requiere_correccion'
                ? 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300'
                : 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300'
            }`}>
              {overallDecision === 'apto'
                ? 'Apto para salir'
                : overallDecision === 'requiere_correccion'
                ? 'Requiere corrección'
                : 'Requiere revisión humana'}
            </span>
          )}
          {itemsAwaitingReview.length > 0 && (
            <span
              className="text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300"
              title="La IA no tuvo suficiente certeza en estos ítems. Decidí tú: aprobalo manualmente o pedile al conductor que rehaga la foto."
            >
              {itemsAwaitingReview.length} {itemsAwaitingReview.length === 1 ? 'ítem en duda' : 'ítems en duda'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canTrigger && !hasAnalyses && !loading && (
            <button
              type="button"
              onClick={() => void triggerAnalysis()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 px-3 py-1.5 text-[11px] font-semibold text-white transition"
            >
              <Bot size={11} />
              Analizar con IA
            </button>
          )}

          {canTrigger && isComplete && pendingRecaptures.length > 0 && (
            <button
              type="button"
              onClick={() => void reanalyze()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold transition"
              title={`Re-evalúa los ${pendingRecaptures.length} ítems marcados para reenvío`}
            >
              <RefreshCw size={11} />
              Re-analizar {pendingRecaptures.length} {pendingRecaptures.length === 1 ? 'ítem' : 'ítems'}
            </button>
          )}

          {canTrigger && isComplete && itemsToCorrect.length > 0 && pendingRecaptures.length === 0 && (
            <button
              type="button"
              onClick={() => void reanalyze()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold transition"
              title={`Re-evalúa los ${itemsToCorrect.length} ítems que la IA marcó como no_salir`}
            >
              <RefreshCw size={11} />
              Re-analizar {itemsToCorrect.length} {itemsToCorrect.length === 1 ? 'ítem' : 'ítems'}
            </button>
          )}

          {canTrigger && isComplete && itemsToCorrect.length === 0 && pendingRecaptures.length === 0 && (
            <button
              type="button"
              onClick={() => void triggerAnalysis()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] px-2.5 py-1.5 text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
            >
              <RefreshCw size={10} />
              Re-analizar todo
            </button>
          )}
        </div>
      </div>

      {/* Contador de correcciones acumuladas + botón "Devolver al conductor".
          Este botón se muestra cuando hay al menos 1 corrección (IA + manuales). */}
      {canTrigger && isComplete && (itemsToCorrect.length > 0 || pendingRecaptures.length > 0) && (
        <div className="flex items-center gap-3 px-4 py-3 bg-rose-50 dark:bg-rose-950 border-l-2 border-rose-600">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
              {itemsToCorrect.length} corrección(es) acumulada(s)
            </p>
            <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">
              {(() => {
                const manualCount = itemsToCorrect.filter(
                  (t) => rejectionsByType[t]?.action === 'request_recapture',
                ).length;
                const iaOnlyCount = itemsToCorrect.length - manualCount;
                return (
                  <>
                    {iaOnlyCount > 0 && `${iaOnlyCount} de la IA`}
                    {iaOnlyCount > 0 && manualCount > 0 && ' · '}
                    {manualCount > 0 && `${manualCount} manuales`}
                  </>
                );
              })()}
            </p>
            {corrections.awaitingResubmission && (
              <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1 font-semibold">
                Ya enviada al conductor — esperando que rehaga las fotos.
              </p>
            )}
          </div>
          {!corrections.awaitingResubmission && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`¿Devolver al conductor con ${itemsToCorrect.length + pendingRecaptures.length} correcciones? Se le notificará qué fotos rehacer.`)) return;
                const result = await returnToDriver();
                if (result) {
                  toast.success(`Devuelta al conductor (ronda ${result.round}). ${result.correctionsCount} correcciones enviadas.`);
                } else {
                  toast.error(trigError ?? 'No se pudo devolver al conductor.');
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 text-[11px] font-semibold transition"
            >
              <XCircle size={11} />
              Devolver al conductor
            </button>
          )}
        </div>
      )}

      {/* Contenido */}
      <div className="p-4 space-y-2">
        {error && <p className="text-xs text-rose-500">Error: {error}</p>}
        {trigError && <p className="text-xs text-rose-500">{trigError}</p>}

        {!hasAnalyses && !loading && !error && !trigError && (
          <div className="text-center py-6">
            <Bot size={28} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {canTrigger
                ? 'Esperando que la IA revise las 5 evidencias del vehículo.'
                : 'El análisis IA aún no fue iniciado para esta solicitud.'}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              Refrigerante, frenos, tablero/luces, batería y bayoneta de aceite.
            </p>
          </div>
        )}

        <AnimatePresence>
          {(hasAnalyses || isAnalyzing) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-2"
            >
              {ITEM_ORDER.map((itemType) => {
                const typeItems = itemsByType[itemType] ?? [];
                const latest = typeItems[0] ?? null;
                const rejection = rejectionsByType[itemType] ?? null;
                const effective = effectiveStatuses.find((s) => s.itemType === itemType) ?? null;
                const isEnDuda = effective?.enDuda ?? false;
                return (
                  <motion.div
                    key={itemType}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <ItemBadge
                      itemType={itemType}
                      item={latest}
                      rejection={rejection}
                      isLoading={isAnalyzing && !latest}
                      canTrigger={canTrigger}
                      onMarkBad={(t) => openReasonDialog(t, 'request_recapture')}
                      onApproveOverride={(t) => openReasonDialog(t, 'override_approve')}
                      onConfirmFail={(t) => openReasonDialog(t, 'confirm_fail')}
                    />
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Decisión final */}
        {isComplete && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-3 flex items-start gap-2 rounded-lg px-4 py-3 ${
              overallDecision === 'apto'
                ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20'
                : overallDecision === 'requiere_correccion'
                ? 'bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20'
                : 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20'
            }`}
          >
            {overallDecision === 'apto'
              ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
              : overallDecision === 'requiere_correccion'
              ? <XCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
              : <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
            }
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${
                overallDecision === 'apto'
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : overallDecision === 'requiere_correccion'
                  ? 'text-rose-700 dark:text-rose-300'
                  : 'text-amber-700 dark:text-amber-300'
              }`}>
                {overallDecision === 'apto' && 'IA: todos los ítems pasan. El vehículo puede salir.'}
                {overallDecision === 'requiere_correccion' && `IA: ${itemsToCorrect.length} ${itemsToCorrect.length === 1 ? 'ítem requiere' : 'ítems requieren'} corrección.`}
                {overallDecision === 'requiere_revision_humana' && 'IA: confianza insuficiente. Requiere revisión manual.'}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                La decisión final sigue siendo del supervisor.
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Modal de razón */}
      <ReasonDialog
        open={reasonDialog !== null}
        title={reasonDialog?.title ?? ''}
        placeholder={reasonDialog?.placeholder ?? ''}
        onConfirm={confirmReason}
        onCancel={() => setReasonDialog(null)}
      />
    </div>
  );
}
