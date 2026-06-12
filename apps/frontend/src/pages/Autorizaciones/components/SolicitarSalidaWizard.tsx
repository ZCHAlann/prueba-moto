"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ChevronLeft, ChevronRight, Camera, Video, Upload, Check,
  Loader2, Droplet, CircleDot, Battery, Wrench,
  Lightbulb, Wind, Disc3, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../context/AuthContext";
import { useExitAuthorizations } from "../../../hooks/useExitAuthorizations";
import { compressImage } from "../../../lib/mediaCompress";
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
};

export function SolicitarSalidaWizard({ open, onClose, onCreated, initialAsset = null, driverId = null }: Props) {
  const { session } = useAuth();
  const companyId = session?.companyId;
  const { create } = useExitAuthorizations();
  const { enqueue, resolveAll, getState, reset } = useUploadQueue(companyId ?? "");

  const myDriverId: number | null = (() => {
    if (driverId) return driverId;
    if (session?.role !== "conductor") return null;
    const sessAny = session as unknown as { companyUserId?: number; id?: string };
    const cuid = sessAny.companyUserId ?? (sessAny.id ? Number(String(sessAny.id).replace(/\D/g, "")) : null);
    return cuid ?? null;
  })();

  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  const [assetId] = useState<number | null>(initialAsset?.id ? Number(initialAsset.id) : null);
  // Previews locales — URLs de objeto creadas con URL.createObjectURL
  // El chofer ve la foto/video inmediatamente sin esperar el upload
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Limpiar object URLs al desmontar para no leakear memoria
  const previewsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      // Limpiar previews anteriores
      Object.values(previewsRef.current).forEach(URL.revokeObjectURL);
      previewsRef.current = {};
      setLocalPreviews({});
      setStepIdx(0);
      setNotes("");
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach(URL.revokeObjectURL);
    };
  }, []);

  if (!open) return null;

  const hasPreview = (stepId: string) => !!localPreviews[stepId];
  const totalRequired = STEPS.filter((s) => s.required).length;
  const completedRequired = STEPS.filter((s) => s.required && hasPreview(s.id)).length;
  // El chofer puede avanzar apenas tiene preview local — no espera el upload
  const canAdvance = !step.required || hasPreview(step.id);

  async function handleFile(captured: File) {
    if (!companyId) return;

    // 1. Preview local inmediato
    const localUrl = URL.createObjectURL(captured);
    previewsRef.current[step.id] = localUrl;
    setLocalPreviews((prev) => ({ ...prev, [step.id]: localUrl }));

    // 2. Comprimir imagen (no video) antes de encolar
    let toUpload = captured;
    if (captured.type.startsWith("image/")) {
      try { toUpload = await compressImage(captured); } catch { /* usar original */ }
    }

    // 3. Lanzar upload en background — sin await
    const isVideo = step.type === "video";
    enqueue(step.id, toUpload, isVideo).catch(() => {
      toast.error(`Error subiendo ${step.label} — reintentá`);
    });
  }

  function next() { if (canAdvance) setStepIdx((i) => Math.min(STEPS.length - 1, i + 1)); }
  function prev() { setStepIdx((i) => Math.max(0, i - 1)); }

  async function handleSubmit() {
    if (!assetId || !myDriverId || !companyId) {
      toast.error("Faltan datos del vehículo o conductor");
      return;
    }

    // Verificar que no haya uploads en error
    const errorSteps = MEDIA_STEP_IDS.filter((id) => getState(id) === "error");
    if (errorSteps.length > 0) {
      toast.error("Algunos archivos fallaron al subir. Retrocedé y volvé a capturarlos.");
      return;
    }

    setSubmitting(true);
    try {
      // Esperar cualquier upload que todavía esté en vuelo
      // Si todos terminaron mientras el chofer navegaba, esto es instantáneo
      const urls = await resolveAll(MEDIA_STEP_IDS);

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

      toast.success("Solicitud enviada");
      onCreated(created);
      onClose();
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
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Nueva autorización</p>
              <h2 className="mt-0.5 text-lg font-semibold text-gray-900 dark:text-white tracking-tight">Solicitar autorización de salida</h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                Paso {stepIdx + 1} de {STEPS.length} · {completedRequired}/{totalRequired} completados
              </p>
            </div>
            <button type="button" onClick={onClose} disabled={submitting}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-gray-200 transition disabled:opacity-50">
              <X size={18} />
            </button>
          </div>

          {/* Barra de progreso principal */}
          <div className="mt-3 h-1 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }} />
          </div>

          {/* Indicadores de upload por paso */}
          <div className="mt-2 flex gap-1">
            {STEPS.filter((s) => s.type !== "note").map((s) => {
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait">
            <motion.div key={step.id}
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.15 }}>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white mb-1">
                <span className="text-emerald-500">{step.icon}</span>
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

                  {/* Resumen de estados de upload en el paso final */}
                  <div className="mt-4 rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.02] p-3 space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Estado de subidas</p>
                    {STEPS.filter((s) => s.type !== "note").map((s) => {
                      const state = getState(s.id);
                      return (
                        <div key={s.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600 dark:text-gray-400 truncate">{s.label}</span>
                          {state === "done"      && <span className="text-emerald-500 font-semibold shrink-0">✓ Listo</span>}
                          {state === "uploading" && <span className="text-amber-500 font-semibold shrink-0 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Subiendo</span>}
                          {state === "error"     && <span className="text-rose-500 font-semibold shrink-0">✗ Error</span>}
                          {state === "idle"      && <span className="text-gray-400 shrink-0">—</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <CaptureStep
                  step={step}
                  previewUrl={localPreviews[step.id] ?? null}
                  onCapture={handleFile}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-gray-200 dark:border-white/[0.08] bg-gray-50/60 dark:bg-white/[0.02] shrink-0">
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 px-5 py-1.5 text-sm font-semibold text-white transition">
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? "Enviando…" : "Enviar solicitud"}
            </button>
          )}
        </footer>
      </motion.div>
    </div>
  );
}

// ─── CaptureStep ─────────────────────────────────────────────────────────────
// Ya no recibe `uploading` — el upload es transparente en background

function CaptureStep({ step, previewUrl, onCapture }: {
  step: Step;
  previewUrl: string | null;
  onCapture: (f: File) => void;
}) {
  const [hasCamera, setHasCamera] = useState(false);
  const [previewKind, setPreviewKind] = useState<"image" | "video" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHasCamera(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  useEffect(() => {
    if (!previewUrl) { setPreviewKind(null); return; }
    if (/\.(webm|mp4|mov)/i.test(previewUrl) || previewUrl.startsWith("blob:")) {
      // Para blob URLs de video usamos el tipo del step
      setPreviewKind(step.type === "video" ? "video" : "image");
    } else {
      setPreviewKind("image");
    }
  }, [previewUrl, step.type]);

  const isVideo = step.type === "video";

  async function capture() {
    if (isVideo) { videoInputRef.current?.click(); return; }
    if (!hasCamera) { fileInputRef.current?.click(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      const track = stream.getVideoTracks()[0];
      const cap = new (window as any).ImageCapture(track);
      const blob = await cap.takePhoto();
      track.stop();
      onCapture(new File([blob], "captura.jpg", { type: "image/jpeg" }));
    } catch {
      fileInputRef.current?.click();
    }
  }

  return (
    <div>
      <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-white/[0.08] bg-gray-50/50 dark:bg-white/[0.02] p-4 min-h-[260px] flex items-center justify-center overflow-hidden">
        {previewUrl ? (
          previewKind === "video"
            ? <video src={previewUrl} controls className="max-h-72 rounded-lg" />
            : <img src={previewUrl} alt="preview" className="max-h-72 rounded-lg object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            {isVideo ? <Video size={28} /> : <Camera size={28} />}
            <p className="text-xs">Sin captura</p>
            <p className="text-[10px]">Captura o sube {isVideo ? "un video" : "una foto"} desde tu dispositivo</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {hasCamera && !isVideo && (
          <button type="button" onClick={capture}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition">
            <Camera size={13} /> Tomar foto
          </button>
        )}
        <button type="button" onClick={() => (isVideo ? videoInputRef.current?.click() : fileInputRef.current?.click())}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] px-3.5 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition">
          <Upload size={13} /> Subir {isVideo ? "video" : "archivo"}
        </button>
        {previewUrl && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Check size={11} /> Listo
          </span>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onCapture(f); e.target.value = ""; }} />
      {isVideo && (
        <input ref={videoInputRef} type="file" accept="video/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onCapture(f); e.target.value = ""; }} />
      )}
    </div>
  );
}