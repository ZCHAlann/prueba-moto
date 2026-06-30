"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ChevronLeft, ChevronRight, Camera, Video, Upload, Check,
  Loader2, Droplet, CircleDot, Battery, Wrench,
  Lightbulb, Wind, Disc3, FileText, Lock, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../context/AuthContext";
import { useExitAuthorizations } from "../../../hooks/useExitAuthorizations";
import { compressIfImage, COMPRESS_OPTS_EVIDENCE } from "../../../lib/mediaCompress";
import { useUploadQueue } from "../../../hooks/useUploadQueue";
import type { ExitAuthorization } from "../../../hooks/useExitAuthorizations";

type AssetLite = { id: string; plate: string; brand: string; model: string };

type StepId =
  | "oil_bayoneta_video"
  | "coolant"
  | "brake_fluid"
  | "tire_front_left"
  | "tire_front_right"
  | "tire_rear_left"
  | "tire_rear_right"
  | "windshield_washer"
  | "lights"
  | "battery"
  | "jack"
  | "notes";

type Step = {
  id: StepId;
  label: string;
  type: "photo" | "video" | "note";
  required: boolean;
  icon: React.ReactNode;
  description: string;
};

const STEPS: Step[] = [
  { id: "oil_bayoneta_video", label: "Bayoneta de aceite (video)", type: "video", required: true, icon: <Disc3 size={14} />, description: "Graba un video corto mientras realizas la medición de la bayoneta de aceite." },
  { id: "coolant", label: "Líquido refrigerante", type: "photo", required: true, icon: <Droplet size={14} />, description: "Foto del depósito de refrigerante con el nivel visible." },
  { id: "brake_fluid", label: "Líquido de frenos", type: "photo", required: true, icon: <Droplet size={14} />, description: "Foto del depósito del líquido de frenos." },
  { id: "tire_front_left", label: "Llanta delantera izquierda", type: "photo", required: true, icon: <CircleDot size={14} />, description: "Foto de la llanta delantera izquierda." },
  { id: "tire_front_right", label: "Llanta delantera derecha", type: "photo", required: true, icon: <CircleDot size={14} />, description: "Foto de la llanta delantera derecha." },
  { id: "tire_rear_left", label: "Llanta trasera izquierda", type: "photo", required: true, icon: <CircleDot size={14} />, description: "Foto de la llanta trasera izquierda." },
  { id: "tire_rear_right", label: "Llanta trasera derecha", type: "photo", required: true, icon: <CircleDot size={14} />, description: "Foto de la llanta trasera derecha." },
  { id: "windshield_washer", label: "Agua del limpia parabrisas", type: "photo", required: true, icon: <Wind size={14} />, description: "Foto del depósito del líquido del limpia parabrisas." },
  { id: "lights", label: "Luces", type: "photo", required: true, icon: <Lightbulb size={14} />, description: "Foto del tablero o las luces exteriores." },
  { id: "battery", label: "Batería", type: "photo", required: true, icon: <Battery size={14} />, description: "Foto de la batería del vehículo." },
  { id: "jack", label: "Gato hidráulico", type: "photo", required: true, icon: <Wrench size={14} />, description: "Foto del gato hidráulico." },
  { id: "notes", label: "Notas y enviar", type: "note", required: false, icon: <FileText size={14} />, description: "Comentarios opcionales antes de enviar la solicitud." },
];

const MEDIA_STEP_IDS = STEPS.filter((s) => s.type !== "note").map((s) => s.id);

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (auth: ExitAuthorization) => void;
  initialAsset?: AssetLite | null;
  driverId?: number | null;
  correctionMode?: {
    authId: string;
    companyId: string;
    items: Array<{
      stepId: StepId;
      reason: string;
      photoField: 'coolantPhotoUrl' | 'brakeFluidPhotoUrl' | 'lightsPhotoUrl' | 'batteryPhotoUrl' | 'oilBayonetaVideoUrl';
    }>;
    existingAuthorization: ExitAuthorization;
  } | null;
};

export function SolicitarSalidaWizard({ open, onClose, onCreated, initialAsset = null, driverId = null, correctionMode = null }: Props) {
  const { session } = useAuth();
  const companyId = session?.companyId;
  const { create } = useExitAuthorizations();
  const { enqueue, resolveAll, getState, reset, stats, MAX_CONCURRENT } = useUploadQueue(correctionMode?.companyId ?? companyId ?? "");

  const myDriverId: number | null = (() => {
    if (driverId) return driverId;
    if (session?.role !== "conductor") return null;
    const sessAny = session as unknown as { companyUserId?: number; id?: string };
    const cuid = sessAny.companyUserId ?? (sessAny.id ? Number(String(sessAny.id).replace(/\D/g, "")) : null);
    return cuid ?? null;
  })();

  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  type CorrectionItemLocal = {
    stepId: StepId;
    reason: string;
    photoField: 'coolantPhotoUrl' | 'brakeFluidPhotoUrl' | 'lightsPhotoUrl' | 'batteryPhotoUrl' | 'oilBayonetaVideoUrl';
  };
  const [localCorrectionItems, setLocalCorrectionItems] = useState<CorrectionItemLocal[] | null>(null);
  const [correctionsLoading, setCorrectionsLoading] = useState(false);
  const [correctionsError, setCorrectionsError] = useState<string | null>(null);

  const ITEM_TYPE_TO_STEP: Record<string, { stepId: StepId; photoField: CorrectionItemLocal['photoField'] } | null> = {
    refrigerante:    { stepId: "coolant",            photoField: "coolantPhotoUrl"      },
    frenos:          { stepId: "brake_fluid",        photoField: "brakeFluidPhotoUrl"   },
    tablero_luces:   { stepId: "lights",             photoField: "lightsPhotoUrl"       },
    bateria:         { stepId: "battery",            photoField: "batteryPhotoUrl"      },
    bayoneta_aceite: { stepId: "oil_bayoneta_video", photoField: "oilBayonetaVideoUrl"  },
    llanta_delantera_izq:  null,
    llanta_delantera_der:  null,
    llanta_trasera_izq:    null,
    llanta_trasera_der:    null,
    limpiaparabrisas:      null,
    gato:                  null,
  };

  const [assetId] = useState<number | null>(initialAsset?.id ? Number(initialAsset.id) : null);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const previewsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      Object.values(previewsRef.current).forEach(URL.revokeObjectURL);
      previewsRef.current = {};
      setLocalPreviews({});
      setStepIdx(0);
      setNotes("");
      reset();
      setLocalCorrectionItems(null);
      setCorrectionsError(null);
      setCorrectionsLoading(false);
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    if (!correctionMode) return;
    if (correctionMode.items.length > 0) {
      setLocalCorrectionItems(correctionMode.items.map((i) => ({
        stepId: i.stepId,
        reason: i.reason,
        photoField: i.photoField,
      })));
      return;
    }
    let cancelled = false;
    setCorrectionsLoading(true);
    setCorrectionsError(null);
    fetch(`/api/company/${correctionMode.companyId}/exit-authorizations/${correctionMode.authId}/corrections`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{
          round: number;
          sentAt: string;
          items: Array<{ itemType: string; photoField: CorrectionItemLocal['photoField']; reason: string }>;
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        const mapped: CorrectionItemLocal[] = [];
        const skipped: string[] = [];
        for (const it of data.items) {
          const m = ITEM_TYPE_TO_STEP[it.itemType];
          if (m) {
            mapped.push({ stepId: m.stepId, reason: it.reason, photoField: it.photoField });
          } else {
            skipped.push(it.itemType);
          }
        }
        if (skipped.length > 0) {
          console.warn('[wizard:corrections] tipos sin mapping (no se pueden rehacer):', skipped);
        }
        setLocalCorrectionItems(mapped);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[wizard:corrections] error:', err);
        setCorrectionsError(err instanceof Error ? err.message : 'Error al cargar correcciones');
      })
      .finally(() => {
        if (!cancelled) setCorrectionsLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, correctionMode]);

  useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach(URL.revokeObjectURL);
    };
  }, []);

  if (!open) return null;

  const hasPreview = (stepId: string) => !!localPreviews[stepId];

  const isCorrectionMode = !!correctionMode;
  const effectiveCorrectionItems = localCorrectionItems ?? (correctionMode?.items ?? []);
  const correctionStepIds = new Set<StepId>(
    effectiveCorrectionItems.map((i) => i.stepId)
  );

  // ── FIX 1: Progreso y condición de submit adaptados al modo ──
  // En corrección: solo cuentan los steps que el supervisor marcó.
  // En normal: cuentan todos los steps requeridos.
  const relevantSteps = isCorrectionMode
    ? STEPS.filter((s) => correctionStepIds.has(s.id as StepId))
    : STEPS.filter((s) => s.required);

  const totalRequired = relevantSteps.length;
  const completedRequired = relevantSteps.filter((s) => hasPreview(s.id)).length;

  const isStepLocked = (stepId: StepId): boolean => {
    if (!isCorrectionMode) return false;
    if (stepId === "notes") return false;
    return !correctionStepIds.has(stepId);
  };

  // ── FIX 2: Reason del step actual para mostrárselo al conductor ──
  const currentCorrectionItem = isCorrectionMode
    ? effectiveCorrectionItems.find((i) => i.stepId === step.id) ?? null
    : null;

  function getCurrentUrlForStep(stepId: StepId): string | null {
    if (!isCorrectionMode) return null;
    const auth = correctionMode!.existingAuthorization as unknown as Record<string, any>;
    switch (stepId) {
      case "coolant":            return auth.coolantPhotoUrl ?? null;
      case "brake_fluid":        return auth.brakeFluidPhotoUrl ?? null;
      case "lights":             return auth.lightsPhotoUrl ?? null;
      case "battery":            return auth.batteryPhotoUrl ?? null;
      case "oil_bayoneta_video": return auth.oilBayonetaVideoUrl ?? null;
      case "windshield_washer":  return auth.windshieldWasherPhotoUrl ?? null;
      case "jack":               return auth.jackPhotoUrl ?? null;
      case "tire_front_left":    return Array.isArray(auth.tirePhotosUrl) ? (auth.tirePhotosUrl[0] ?? null) : null;
      case "tire_front_right":   return Array.isArray(auth.tirePhotosUrl) ? (auth.tirePhotosUrl[1] ?? null) : null;
      case "tire_rear_left":     return Array.isArray(auth.tirePhotosUrl) ? (auth.tirePhotosUrl[2] ?? null) : null;
      case "tire_rear_right":    return Array.isArray(auth.tirePhotosUrl) ? (auth.tirePhotosUrl[3] ?? null) : null;
      default:                   return null;
    }
  }

  function isStepConsideredComplete(stepId: StepId): boolean {
    if (hasPreview(stepId)) return true;
    if (isCorrectionMode && !correctionStepIds.has(stepId) && stepId !== "notes") {
      return true;
    }
    return false;
  }
  const canAdvance = !step.required || isStepConsideredComplete(step.id);

  function getNextUnlockedStep(currentIdx: number): number {
    if (!isCorrectionMode) return Math.min(STEPS.length - 1, currentIdx + 1);
    for (let i = currentIdx + 1; i < STEPS.length; i++) {
      if (!isStepLocked(STEPS[i].id)) return i;
    }
    return STEPS.length - 1;
  }

  async function handleFile(captured: File) {
    if (!companyId) return;

    if (isStepLocked(step.id)) {
      toast.error("Esta foto no necesita correcciones. Avanza al siguiente paso.");
      return;
    }

    const sizeMB = +(captured.size / 1024 / 1024).toFixed(2);

    const MAX_VIDEO_MB = 50;
    if (step.type === "video" && sizeMB > MAX_VIDEO_MB) {
      toast.error(
        `El video es demasiado grande (${sizeMB} MB). ` +
        `La duración máxima permitida es de 2 minutos. ` +
        `Grabe un video más corto o reduzca la calidad de la cámara a 720p.`,
        { duration: 14000 },
      );
      return;
    }

    const localUrl = URL.createObjectURL(captured);
    previewsRef.current[step.id] = localUrl;
    setLocalPreviews((prev) => ({ ...prev, [step.id]: localUrl }));

    // Comprimir si es imagen; PDFs y otros pasan tal cual. Mantenemos
    // COMPRESS_OPTS_EVIDENCE (1280px / q0.78) coherente con el resto
    // de las fotos de evidencia — era la opción local EXIT_AUTH_COMPRESS_OPTS,
    // idéntica en valores.
    const toUpload = await compressIfImage(captured, COMPRESS_OPTS_EVIDENCE);

    const isVideo = step.type === "video";
    enqueue(step.id, toUpload, isVideo).catch((err: any) => {
      console.error("[wizard:capture-error] full err:", err);
      let msg = err?.message ?? String(err);
      if (err?.name === "TypeError" && /fetch/i.test(msg)) {
        msg = "No se pudo conectar al servidor. Revisá tu conexión.";
      } else if (err?.name === "AbortError") {
        msg = "Subida cancelada por timeout.";
      }
      toast.error(`${step.label}: ${msg}`, { duration: 8000 });
    });
  }

  function next() { if (canAdvance) setStepIdx((i) => getNextUnlockedStep(i)); }
  function prev() { setStepIdx((i) => Math.max(0, i - 1)); }

  async function handleSubmit() {
    if (!assetId || !myDriverId || !companyId) {
      toast.error("Faltan datos del vehículo o conductor");
      return;
    }

    if (isCorrectionMode && (correctionsLoading || !localCorrectionItems)) {
      toast.error("Esperá a que terminen de cargar las correcciones.");
      return;
    }

    // ── FIX 1 (submit): En corrección, solo validar los steps marcados ──
    const missing = MEDIA_STEP_IDS.filter((id) => {
      if (localPreviews[id]) return false;
      if (isCorrectionMode && !correctionStepIds.has(id)) return false;
      return true;
    });
    if (missing.length > 0) {
      toast.error("Faltan capturas por subir. Completá todos los pasos antes de enviar.");
      return;
    }

    const errorSteps = MEDIA_STEP_IDS.filter((id) => {
      if (isCorrectionMode && !correctionStepIds.has(id)) return false;
      return getState(id) === "error";
    });
    if (errorSteps.length > 0) {
      toast.error("Algunos archivos fallaron al subir. Volvé atrás y repetí esas capturas.");
      return;
    }

    const uploadingSteps = MEDIA_STEP_IDS.filter((id) => {
      if (isCorrectionMode && !correctionStepIds.has(id)) return false;
      return getState(id) === "uploading";
    });
    if (uploadingSteps.length > 0) {
      toast.error(
        `Esperá a que termine de subirse el archivo (${uploadingSteps.length} en curso). Esto puede tardar unos segundos.`,
        { duration: 6000 },
      );
      return;
    }

    setSubmitting(true);
    try {
      const urls = await resolveAll(MEDIA_STEP_IDS);

      if (isCorrectionMode && correctionMode) {
        const correctionCompanyId = correctionMode.companyId;
        const correctionAuthId = correctionMode.authId;
        if (effectiveCorrectionItems.length === 0) {
          throw new Error("No hay correcciones para enviar. Recargá la página.");
        }

        for (const item of effectiveCorrectionItems) {
          const newUrl = urls[item.stepId];
          if (!newUrl) {
            throw new Error(`No hay URL nueva para ${item.stepId}. Volvé a tomar la foto.`);
          }
          if (!correctionStepIds.has(item.stepId)) continue;
          const patchRes = await fetch(
            `/api/company/${correctionCompanyId}/exit-authorizations/${correctionAuthId}/photo`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ field: item.photoField, url: newUrl }),
            },
          );
          if (!patchRes.ok) {
            const body = await patchRes.json().catch(() => ({}));
            throw new Error((body as { error?: string }).error ?? `HTTP ${patchRes.status}`);
          }
        }

        const submitRes = await fetch(
          `/api/company/${correctionCompanyId}/exit-authorizations/${correctionAuthId}/corrections/submit`,
          { method: 'POST', credentials: 'include' },
        );
        if (!submitRes.ok) {
          const body = await submitRes.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `HTTP ${submitRes.status}`);
        }
        // El backend responde 200 OK apenas persiste el state. El
        // re-análisis de Gemini corre en background y se entera el
        // cliente por WS. Acá cerramos el wizard y disparamos el
        // modal "Reanalizando con IA..." del page.
        //
        // NOTA: el backend ya no devuelve la lista de items a
        // re-analizar (el reanálisis es async), así que no podemos
        // mostrar el conteo. Mostramos un mensaje genérico.
        await submitRes.json().catch(() => ({}));
        toast.success(
          "Correcciones enviadas. La IA está re-analizando tus fotos.",
        );
        setSubmitting(false);

        onClose();
        // onCreated recibe un ExitAuthorization; acá nos alcanza con
        // pasar el `id` porque page.tsx solo usa `auth.id` para
        // abrir el AnalyzingModal con ese authId. Hacemos cast a
        // ExitAuthorization.
        onCreated({ id: correctionAuthId } as unknown as ExitAuthorization);
        return;


      }

      const tires = ["tire_front_left", "tire_front_right", "tire_rear_left", "tire_rear_right"]
        .map((k) => urls[k])
        .filter((u): u is string => !!u);

      const created = await create({
        assetId,
        driverId: myDriverId,
        oilBayonetaVideoUrl:      urls["oil_bayoneta_video"] ?? null,
        oilBayonetaVideoThumbUrl: null,
        coolantPhotoUrl:          urls["coolant"] ?? null,
        brakeFluidPhotoUrl:       urls["brake_fluid"] ?? null,
        tirePhotosUrl:            tires,
        windshieldWasherPhotoUrl: urls["windshield_washer"] ?? null,
        lightsPhotoUrl:           urls["lights"] ?? null,
        batteryPhotoUrl:          urls["battery"] ?? null,
        jackPhotoUrl:             urls["jack"] ?? null,
        notes: notes.trim() || null,
      });

      onClose();
      onCreated(created);
      toast.success("Solicitud enviada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al enviar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-[2px] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="flex flex-col w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 shadow-2xl">

        {/* Header */}
        <header className="px-6 py-4 border-b border-gray-200 dark:border-white/[0.08] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${isCorrectionMode ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {isCorrectionMode ? "Corrección de autorización" : "Nueva autorización"}
              </p>
              <h2 className="mt-0.5 text-lg font-semibold text-gray-900 dark:text-white tracking-tight">
                {isCorrectionMode ? "Volver a tomar las fotos marcadas" : "Solicitar autorización de salida"}
              </h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                Paso {stepIdx + 1} de {STEPS.length} · {completedRequired}/{totalRequired} completados
                {isCorrectionMode && ` · ${correctionStepIds.size} foto(s) a rehacer`}
              </p>
            </div>
            <button type="button" onClick={onClose} disabled={submitting}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-gray-200 transition disabled:opacity-50">
              <X size={18} />
            </button>
          </div>

          {/* Barra de progreso — en corrección refleja solo los steps a rehacer */}
          <div className="mt-3 h-1 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${isCorrectionMode ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: totalRequired > 0 ? `${(completedRequired / totalRequired) * 100}%` : "0%" }}
            />
          </div>

          {/* Indicadores de upload — en corrección solo muestra los steps marcados */}
          <div className="mt-2 flex gap-1">
            {STEPS
              .filter((s) => s.type !== "note")
              .filter((s) => isCorrectionMode ? correctionStepIds.has(s.id as StepId) : true)
              .map((s) => {
                const state = getState(s.id);
                const preview = hasPreview(s.id);
                return (
                  <div key={s.id} title={s.label}
                    className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                      state === "done"      ? "bg-emerald-500" :
                      state === "uploading" ? "bg-amber-400 animate-pulse" :
                      state === "error"     ? "bg-rose-500" :
                      preview               ? "bg-emerald-200 dark:bg-emerald-500/30" :
                      "bg-gray-200 dark:bg-white/[0.06]"
                    }`} />
                );
              })}
          </div>
        </header>

        {/* Banner modo corrección */}
        {isCorrectionMode && (
          <div className="shrink-0 px-6 py-3 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={18} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="flex-1 min-w-0">
                {correctionsLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-amber-600" />
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                      Cargando correcciones…
                    </p>
                  </div>
                ) : correctionsError ? (
                  <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                    Error al cargar correcciones: {correctionsError}
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                      Tu supervisor te pidió rehacer {correctionStepIds.size} foto(s) o video.
                    </p>
                    <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300 leading-snug">
                      Solo los pasos marcados con candado abierto requieren acción. Los demás ya
                      están bien. Cuando termines, tocá "Enviar correcciones".
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait">
            <motion.div key={step.id}
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.15 }}>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white mb-1">
                <span className={isCorrectionMode && correctionStepIds.has(step.id as StepId) ? "text-amber-500" : "text-emerald-500"}>
                  {step.icon}
                </span>
                {step.label}
                {step.required && <span className="ml-1 text-[10px] uppercase tracking-wider text-rose-500">Obligatorio</span>}
                {/* Indicador de upload del paso actual */}
                {step.type !== "note" && (() => {
                  const state = getState(step.id);
                  if (state === "uploading") return <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-amber-500"><Loader2 size={10} className="animate-spin" /> Subiendo…</span>;
                  if (state === "done")      return <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-500"><Check size={10} /> Subido</span>;
                  if (state === "error")     return <span className="ml-auto text-[10px] text-rose-500">Error al subir</span>;
                  return null;
                })()}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{step.description}</p>

              {step.type === "note" ? (
                <div>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500}
                    placeholder="Algo para que el supervisor tenga en cuenta…" rows={5}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-sm text-gray-800 dark:text-gray-200 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 resize-none" />
                  <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">{notes.length}/500</p>

                  <div className="mt-4 rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.02] p-3 space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">
                      {isCorrectionMode ? "Pasos a corregir" : "Estado de subidas"}
                    </p>
                    {STEPS
                      .filter((s) => s.type !== "note")
                      .filter((s) => isCorrectionMode ? correctionStepIds.has(s.id as StepId) : true)
                      .map((s) => {
                        const state = getState(s.id);
                        // En corrección, mostrar la razón junto al label
                        const reason = isCorrectionMode
                          ? effectiveCorrectionItems.find((i) => i.stepId === s.id)?.reason ?? null
                          : null;
                        return (
                          <div key={s.id} className="flex items-start justify-between gap-2 text-xs">
                            <div className="flex-1 min-w-0">
                              <span className="text-gray-600 dark:text-gray-400 truncate block">{s.label}</span>
                              {reason && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400 leading-snug block mt-0.5">
                                  {reason}
                                </span>
                              )}
                            </div>
                            {state === "done"      && <span className="text-emerald-500 font-semibold shrink-0">Listo</span>}
                            {state === "uploading" && <span className="text-amber-500 font-semibold shrink-0 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Subiendo</span>}
                            {state === "error"     && <span className="text-rose-500 font-semibold shrink-0">Error</span>}
                            {state === "idle"      && <span className="text-gray-400 shrink-0">Pendiente</span>}
                          </div>
                        );
                    })}
                  </div>
                </div>
              ) : isCorrectionMode && isStepLocked(step.id) ? (
                // Step bloqueado: muestra la foto actual, no se puede rehacer
                <LockedPreview
                  step={step}
                  currentUrl={getCurrentUrlForStep(step.id)}
                  reason={null}
                />
              ) : (
                // ── FIX 2: Se pasa el reason del item al CaptureStep ──
                <CaptureStep
                  step={step}
                  previewUrl={localPreviews[step.id] ?? null}
                  onCapture={handleFile}
                  correctionReason={currentCorrectionItem?.reason ?? null}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <footer className="flex flex-col gap-2 px-5 py-3.5 border-t border-gray-200 dark:border-white/[0.08] bg-gray-50/60 dark:bg-white/[0.02] shrink-0">
          {/* Stats de subida concurrentes */}
          {stats.total > 0 && stats.uploading > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-400">
              <Loader2 size={12} className="animate-spin text-amber-500" />
              <span>
                Subiendo {stats.uploading} archivo{stats.uploading !== 1 ? "s" : ""} de {stats.total} ({(stats.done + stats.error)} listos{stats.error > 0 ? `, ${stats.error} con error` : ""})
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={prev} disabled={stepIdx === 0 || submitting}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-white/[0.08] px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 transition">
            <ChevronLeft size={14} /> Atrás
          </button>
          {stepIdx < STEPS.length - 1 ? (
            <button type="button" onClick={next} disabled={!canAdvance}
              className="inline-flex items-center gap-1 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 disabled:opacity-40 px-4 py-1.5 text-sm font-semibold text-white transition">
              Siguiente <ChevronRight size={14} />
            </button>
          ) : (
            <button type="button" onClick={handleSubmit}
              disabled={submitting || completedRequired < totalRequired || !assetId || !myDriverId}
              className={`inline-flex items-center gap-1.5 rounded-lg disabled:opacity-40 px-5 py-1.5 text-sm font-semibold text-white transition ${
                isCorrectionMode
                  ? "bg-amber-500 hover:bg-amber-600"
                  : "bg-emerald-500 hover:bg-emerald-600"
              }`}>
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? "Enviando…" : isCorrectionMode ? "Enviar correcciones" : "Enviar solicitud"}
            </button>
          )}
          </div>
        </footer>
      </motion.div>
    </div>
  );
}

// ─── LockedPreview ────────────────────────────────────────────────────────────

function LockedPreview({ step, currentUrl, reason }: {
  step: Step;
  currentUrl: string | null;
  reason: string | null;
}) {
  const isVideo = step.type === "video";
  return (
    <div className="space-y-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border-2 border-dashed border-gray-300 dark:border-white/[0.12] bg-gray-100 dark:bg-white/[0.02]">
        {currentUrl ? (
          isVideo ? (
            <video src={currentUrl} controls className="h-full w-full object-cover opacity-70" />
          ) : (
            <img src={currentUrl} alt={step.label} className="h-full w-full object-cover opacity-70" />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="text-center">
              <Lock size={32} className="mx-auto text-gray-300 dark:text-gray-600" />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Sin preview disponible</p>
            </div>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-full bg-white/95 dark:bg-gray-900/95 px-3 py-1.5 shadow-lg flex items-center gap-1.5">
            <Lock size={13} className="text-gray-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              No requiere corrección
            </span>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/5 p-2.5 text-[11px] text-emerald-700 dark:text-emerald-300">
        <p className="font-semibold mb-0.5">Esta foto ya está bien — no la toques.</p>
        <p className="text-emerald-600 dark:text-emerald-400 leading-snug">
          {reason ?? "No se detectó ningún problema con esta evidencia."}
        </p>
      </div>
    </div>
  );
}

// ─── CaptureStep ──────────────────────────────────────────────────────────────

function CaptureStep({ step, previewUrl, onCapture, correctionReason }: {
  step: Step;
  previewUrl: string | null;
  onCapture: (f: File) => void;
  correctionReason?: string | null;
}) {
  const [previewKind, setPreviewKind] = useState<"image" | "video" | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoInputRef = useRef<HTMLInputElement>(null);
  const galleryVideoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!previewUrl) { setPreviewKind(null); return; }
    if (/\.(webm|mp4|mov)/i.test(previewUrl) || previewUrl.startsWith("blob:")) {
      setPreviewKind(step.type === "video" ? "video" : "image");
    } else {
      setPreviewKind("image");
    }
  }, [previewUrl, step.type]);

  const isVideo = step.type === "video";

  function openCamera() {
    if (isVideo) {
      cameraVideoInputRef.current?.click();
    } else {
      cameraInputRef.current?.click();
    }
  }

  function openGallery() {
    if (isVideo) {
      galleryVideoInputRef.current?.click();
    } else {
      galleryInputRef.current?.click();
    }
  }

  return (
    <div>
      {/* ── FIX 2: Banner con la razón del supervisor ── */}
      {correctionReason && (
        <div className="mb-3 rounded-lg border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5 flex items-start gap-2">
          <AlertCircle size={14} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <p className="text-[11px] font-bold text-amber-800 dark:text-amber-200 uppercase tracking-wider mb-0.5">
              Motivo del rechazo
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-snug">
              {correctionReason}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-white/[0.08] bg-gray-50/50 dark:bg-white/[0.02] p-4 min-h-[260px] flex items-center justify-center overflow-hidden">
        {previewUrl ? (
          previewKind === "video"
            ? <video src={previewUrl} controls className="max-h-72 rounded-lg" />
            : <img src={previewUrl} alt="preview" className="max-h-72 rounded-lg object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            {isVideo ? <Video size={28} /> : <Camera size={28} />}
            <p className="text-xs">Sin captura</p>
            <p className="text-[10px]">Tomá una {isVideo ? "video" : "foto"} o subí un archivo desde tu dispositivo</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!isVideo && (
          <button type="button" onClick={openCamera}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition">
            <Camera size={13} /> Tomar foto
          </button>
        )}
        <button type="button" onClick={openGallery}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition">
          <Upload size={13} /> {isVideo ? "Subir video" : "Subir archivo"}
        </button>
        {previewUrl && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Check size={11} /> Listo
          </span>
        )}
        {isVideo && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            Duración máxima: 2 minutos. Si el video supera los 50 MB, grabe menos tiempo o reduzca la calidad a 720p.
          </span>
        )}
      </div>

      {!isVideo && (
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onCapture(f); e.target.value = ""; }} />
      )}
      {!isVideo && (
        <input ref={galleryInputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onCapture(f); e.target.value = ""; }} />
      )}
      {isVideo && (
        <input ref={cameraVideoInputRef} type="file" accept="video/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onCapture(f); e.target.value = ""; }} />
      )}
      {isVideo && (
        <input ref={galleryVideoInputRef} type="file" accept="video/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onCapture(f); e.target.value = ""; }} />
      )}
    </div>
  );
}