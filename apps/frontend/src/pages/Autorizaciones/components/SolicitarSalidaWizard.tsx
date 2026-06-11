"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  SolicitarSalidaWizard
// ─────────────────────────────────────────────────────────────────────────────
//  Wizard de 8 pasos:
//    1. Bayoneta de aceite (VIDEO)    — obligatorio
//    2. Líquido refrigerante            — obligatorio
//    3. Líquido de frenos              — obligatorio
//    4. Llanta delantera izquierda      — obligatorio
//    5. Llanta delantera derecha       — obligatorio
//    6. Llanta trasera izquierda       — obligatorio
//    7. Llanta trasera derecha         — obligatorio
//    8. Agua del limpia parabrisas     — obligatorio
//    9. Luces                          — obligatorio
//   10. Batería                         — obligatorio
//   11. Gato hidráulico                 — obligatorio
//   12. Notas + Enviar                 — opcional
//
//  Cada foto/video se comprime y se sube en paralelo al endpoint
//  correspondiente apenas el usuario lo confirma. La subida devuelve
//  la URL pública que se guarda al final, al crear la autorización.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ChevronLeft, ChevronRight, Camera, Video, Upload, Check,
  AlertTriangle, Loader2, Droplet, CircleDot, Battery, Wrench,
  Lightbulb, Wind, Disc3, Disc2, FileText, ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../context/AuthContext";
import { useExitAuthorizations } from "../../../hooks/useExitAuthorizations";
import { compressImage, compressVideo, generateVideoThumbnail } from "../../../lib/mediaCompress";
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
  type: "photo" | "video";
  required: boolean;
  icon: React.ReactNode;
  description: string;
};

const STEPS: Step[] = [
  { id: "oil_bayoneta_video",   label: "Bayoneta de aceite (video)",  type: "video", required: true,  icon: <Disc3 size={14} />,         description: "Graba un video corto mientras realizas la medición de la bayoneta de aceite." },
  { id: "coolant",             label: "Líquido refrigerante",        type: "photo", required: true,  icon: <Droplet size={14} />,       description: "Foto del depósito de refrigerante con el nivel visible." },
  { id: "brake_fluid",         label: "Líquido de frenos",           type: "photo", required: true,  icon: <Droplet size={14} />,       description: "Foto del depósito del líquido de frenos." },
  { id: "tire_front_left",      label: "Llanta delantera izquierda",  type: "photo", required: true,  icon: <CircleDot size={14} />,     description: "Foto de la llanta delantera izquierda." },
  { id: "tire_front_right",     label: "Llanta delantera derecha",   type: "photo", required: true,  icon: <CircleDot size={14} />,     description: "Foto de la llanta delantera derecha." },
  { id: "tire_rear_left",       label: "Llanta trasera izquierda",   type: "photo", required: true,  icon: <CircleDot size={14} />,     description: "Foto de la llanta trasera izquierda." },
  { id: "tire_rear_right",      label: "Llanta trasera derecha",     type: "photo", required: true,  icon: <CircleDot size={14} />,     description: "Foto de la llanta trasera derecha." },
  { id: "windshield_washer",    label: "Agua del limpia parabrisas", type: "photo", required: true,  icon: <Wind size={14} />,         description: "Foto del depósito del líquido del limpia parabrisas." },
  { id: "lights",               label: "Luces",                      type: "photo", required: true,  icon: <Lightbulb size={14} />,     description: "Foto del tablero o las luces exteriores." },
  { id: "battery",              label: "Batería",                    type: "photo", required: true,  icon: <Battery size={14} />,       description: "Foto de la batería del vehículo." },
  { id: "jack",                 label: "Gato hidráulico",            type: "photo", required: true,  icon: <Wrench size={14} />,        description: "Foto del gato hidráulico." },
  { id: "notes",                label: "Notas y enviar",             type: "note",  required: false, icon: <FileText size={14} />,     description: "Comentarios opcionales antes de enviar la solicitud." },
];

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (auth: ExitAuthorization) => void;
  /** opcional: si se pasa, se preselecciona el vehículo y se omite el paso 0 */
  initialAsset?: AssetLite | null;
  /**
   * DriverId resuelto por el padre (vino del /conductor-context).
   * Si no se pasa, el wizard asume que el Conductor ya preseleccionó
   * su asset, y deriva su driverId del JWT (1-a-1 con su companyUser).
   */
  driverId?: number | null;
};

export function SolicitarSalidaWizard({ open, onClose, onCreated, initialAsset = null, driverId = null }: Props) {
  const { session } = useAuth();
  const companyId = session?.companyId;
  const { create } = useExitAuthorizations();

  // El padre siempre nos pasa driverId (vino del conductor-context).
  // Si por alguna razón no viene, derivamos del JWT (1-a-1 con cuId).
  const myDriverId: number | null = (() => {
    if (driverId) return driverId;
    if (session?.role !== "conductor") return null;
    const sessAny = session as unknown as { companyUserId?: number; id?: string };
    const cuid = sessAny.companyUserId ?? (sessAny.id ? Number(String(sessAny.id).replace(/\D/g, "")) : null);
    return cuid ?? null;
  })();

  // Si no hay driverId pero el rol es conductor, no se puede continuar.
  const canSubmit = myDriverId !== null;

  // Paso activo
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  // Datos
  const [assetId, setAssetId] = useState<number | null>(initialAsset?.id ?? null);
  const [urls, setUrls] = useState<Record<StepId, string | null | string[]>>({
    oil_bayoneta_video:   null,
    oil_bayoneta_video_thumb: null,
    coolant:             null,
    brake_fluid:         null,
    tire_front_left:     null,
    tire_front_right:    null,
    tire_rear_left:      null,
    tire_rear_right:     null,
    windshield_washer:   null,
    lights:              null,
    battery:             null,
    jack:                null,
    notes:               null,
  });
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStepIdx(0);
      setAssetId(initialAsset?.id ?? null);
      setUrls({
        oil_bayoneta_video: null, oil_bayoneta_video_thumb: null,
        coolant: null, brake_fluid: null,
        tire_front_left: null, tire_front_right: null,
        tire_rear_left: null, tire_rear_right: null,
        windshield_washer: null, lights: null, battery: null, jack: null,
        notes: null,
      });
      setNotes("");
    }
  }, [open, initialAsset]);

  if (!open) return null;

  // Helpers de progreso (declarados antes de cualquier return que los use
  // para evitar ReferenceError por TDZ).
  const stepHas = (s: Step, u: typeof urls) => {
    if (!s.required) return true;
    if (s.id === "oil_bayoneta_video") return !!u.oil_bayoneta_video;
    if (s.id === "notes") return true;
    return !!u[s.id];
  };
  const totalRequired = STEPS.filter((s) => s.required).length;
  const completedRequired = STEPS.filter((s) => s.required && stepHas(s, urls)).length;
  const canAdvance = (s: Step = step) => !s.required || stepHas(s, urls);

  async function handleFile(captured: File) {
    if (!companyId) return;
    setUploading(true);
    try {
      // Compresión local primero
      let toUpload = captured;
      if (captured.type.startsWith("image/")) {
        toUpload = await compressImage(captured);
      } else if (captured.type.startsWith("video/")) {
        toUpload = await compressVideo(captured);
      }
      const form = new FormData();
      form.append(step.type === "video" ? "video" : "photos", toUpload);
      const endpoint =
        step.type === "video"
          ? `/api/upload/exit-auth-video?companyId=${companyId}`
          : `/api/upload/exit-auth-photos?companyId=${companyId}`;
      const res = await fetch(endpoint, { method: "POST", credentials: "include", body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: { urls?: string[]; url?: string } = await res.json();
      const uploadedUrl = step.type === "video" ? json.url : (json.urls?.[0] ?? null);
      if (!uploadedUrl) throw new Error("No se obtuvo la URL");

      if (step.id === "oil_bayoneta_video") {
        // Genera thumb client-side a partir del original
        const thumb = await generateVideoThumbnail(captured).catch(() => null);
        setUrls((prev) => ({
          ...prev,
          oil_bayoneta_video: uploadedUrl,
          oil_bayoneta_video_thumb: thumb ?? prev.oil_bayoneta_video_thumb,
        }));
      } else if (step.id.startsWith("tire_")) {
        setUrls((prev) => ({
          ...prev,
          [step.id]: [...(Array.isArray(prev[step.id]) ? (prev[step.id] as string[]) : []), uploadedUrl],
        }));
      } else {
        setUrls((prev) => ({ ...prev, [step.id]: uploadedUrl }));
      }
      toast.success("Subido y comprimido");
    } catch (err) {
      console.error(err);
      toast.error("No se pudo subir el archivo");
    } finally {
      setUploading(false);
    }
  }

  function next() { if (canAdvance()) setStepIdx((i) => Math.min(STEPS.length - 1, i + 1)); }
  function prev() { setStepIdx((i) => Math.max(0, i - 1)); }

  async function handleSubmit() {
    if (!assetId || !myDriverId || !companyId) {
      toast.error("Faltan datos del vehículo o conductor");
      return;
    }
    setSubmitting(true);
    try {
      const tires = ["tire_front_left","tire_front_right","tire_rear_left","tire_rear_right"]
        .map((k) => (urls as Record<string, unknown>)[k] as string[] | null)
        .filter((v): v is string[] => Array.isArray(v) && v.length > 0)
        .map((arr) => arr[0]!) // 1 foto por llanta
        .filter(Boolean);
      const created = await create({
        assetId, driverId: myDriverId,
        oilBayonetaVideoUrl:    urls.oil_bayoneta_video as string | null,
        oilBayonetaVideoThumbUrl: urls.oil_bayoneta_video_thumb as string | null,
        coolantPhotoUrl:        urls.coolant as string | null,
        brakeFluidPhotoUrl:     urls.brake_fluid as string | null,
        tirePhotosUrl:          tires,
        windshieldWasherPhotoUrl: urls.windshield_washer as string | null,
        lightsPhotoUrl:         urls.lights as string | null,
        batteryPhotoUrl:        urls.battery as string | null,
        jackPhotoUrl:           urls.jack as string | null,
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

  // ─── Render ────────────────────────────────────────────────────────────────
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
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Paso {stepIdx + 1} de {STEPS.length} · {completedRequired}/{totalRequired} completados</p>
            </div>
            <button type="button" onClick={onClose} disabled={submitting}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-gray-200 transition disabled:opacity-50">
              <X size={18} />
            </button>
          </div>
          {/* progress */}
          <div className="mt-3 h-1 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }} />
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait">
            <motion.div key={step.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.15 }}>
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white mb-1">
                <span className="text-emerald-500">{step.icon}</span>
                {step.label}
                {step.required && <span className="ml-1 text-[10px] uppercase tracking-wider text-rose-500">Obligatorio</span>}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{step.description}</p>

              {step.id === "notes" ? (
                <div>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500}
                    placeholder="Algo para que el supervisor tenga en cuenta…"
                    rows={5}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-sm text-gray-800 dark:text-gray-200 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 resize-none" />
                  <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">{notes.length}/500</p>
                </div>
              ) : (
                <CaptureStep
                  step={step}
                  previewUrl={getPreview(step.id, urls)}
                  onCapture={handleFile}
                  uploading={uploading}
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
            <button type="button" onClick={next} disabled={!canAdvance() || uploading}
              className="inline-flex items-center gap-1 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 disabled:opacity-40 px-4 py-1.5 text-sm font-semibold text-white transition">
              Siguiente <ChevronRight size={14} />
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={submitting || completedRequired < totalRequired || !assetId || !myDriverId}
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

function getPreview(stepId: StepId, urls: Record<StepId, unknown>): string | null {
  if (stepId === "oil_bayoneta_video") {
    return (urls.oil_bayoneta_video_thumb as string | null) ?? (urls.oil_bayoneta_video as string | null) ?? null;
  }
  if (stepId === "notes") return null;
  const v = urls[stepId];
  if (Array.isArray(v)) return v[0] ?? null;
  return (v as string | null) ?? null;
}

// ─── CaptureStep: muestra preview + botones de captura/subida ───────────────

function CaptureStep({ step, previewUrl, onCapture, uploading }: {
  step: Step; previewUrl: string | null; onCapture: (f: File) => void; uploading: boolean;
}) {
  const [hasCamera, setHasCamera] = useState(false);
  const [previewKind, setPreviewKind] = useState<"image" | "video" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHasCamera(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  useEffect(() => {
    if (!previewUrl) {
      setPreviewKind(null);
      return;
    }
    // Detectar tipo por extensión / mime si es un blob URL
    if (previewUrl.startsWith("data:video") || /\.(webm|mp4|mov)/i.test(previewUrl)) {
      setPreviewKind("video");
    } else {
      setPreviewKind("image");
    }
  }, [previewUrl]);

  const accept = step.type === "video" ? "video/*" : "image/*";
  const isVideo = step.type === "video";

  async function capture() {
    if (!hasCamera || isVideo) {
      // Captura nativa de browser → fallback al input file
      if (isVideo) videoInputRef.current?.click();
      else fileInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      const cap = new (window as any).ImageCapture(track);
      const blob = await cap.takePhoto();
      track.stop();
      const file = new File([blob], "captura.jpg", { type: "image/jpeg" });
      onCapture(file);
    } catch {
      fileInputRef.current?.click();
    }
  }

  return (
    <div>
      <div className="rounded-xl border-2 border-dashed border-gray-200 dark:border-white/[0.08] bg-gray-50/50 dark:bg-white/[0.02] p-4 min-h-[260px] flex items-center justify-center overflow-hidden">
        {previewUrl ? (
          previewKind === "video" ? (
            <video src={previewUrl} controls className="max-h-72 rounded-lg" />
          ) : (
            <img src={previewUrl} alt="preview" className="max-h-72 rounded-lg object-contain" />
          )
        ) : uploading ? (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <Loader2 size={28} className="animate-spin" />
            <p className="text-xs">Comprimiendo y subiendo…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            {isVideo ? <Video size={28} /> : <Camera size={28} />}
            <p className="text-xs">Sin captura</p>
            <p className="text-[10px] text-gray-400">Captura o sube un {isVideo ? "video" : "foto"} desde tu dispositivo</p>
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

      <input ref={fileInputRef} type="file" accept={accept} capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onCapture(f); e.target.value = ""; }} />
      {isVideo && (
        <input ref={videoInputRef} type="file" accept="video/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onCapture(f); e.target.value = ""; }} />
      )}
    </div>
  );
}
