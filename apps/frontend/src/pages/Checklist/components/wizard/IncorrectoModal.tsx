"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Upload, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../context/AuthContext";
import { sanitizeString } from "../../../../lib/form-validation";

type Props = {
  open: boolean;
  itemName: string;
  onClose: () => void;
  onSave: (data: { observation: string; photoUrl: string | null }) => void;
};

/**
 * Modal que aparece al marcar un item como "Incorrecto" en el wizard.
 * Permite escribir la observación y subir/tomar una foto (opcional).
 * La foto se sube al backend al confirmar; el resultado (URL) se devuelve
 * al wizard para que la guarde dentro del item.
 */
export default function IncorrectoModal({ open, itemName, onClose, onSave }: Props) {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : "";
  const [observation, setObservation] = useState("");
  const [photoFile, setPhotoFile]     = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setObservation("");
      setPhotoFile(null);
      setPhotoPreview(null);
      setUploading(false);
    }
  }, [open, itemName]);

  const handleFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Solo se aceptan imágenes");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("La imagen no debe pesar más de 10 MB");
      return;
    }
    setPhotoFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handleConfirm = async () => {
    if (!observation.trim()) {
      toast.error("La observación es obligatoria", { description: "Describe brevemente lo que encontraste." });
      return;
    }
    if (observation.trim().length < 3) {
      toast.error("Observación muy corta", { description: "Mínimo 3 caracteres." });
      return;
    }
    setUploading(true);
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        const fd = new FormData();
        fd.append("photo", photoFile);
        const res = await fetch(`/api/upload/checklist-photos?companyId=${companyId}`, {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        if (!res.ok) throw new Error(`Error subiendo foto (HTTP ${res.status})`);
        const json = await res.json();
        photoUrl = json.url as string;
      }
      onSave({ observation: sanitizeString(observation).slice(0, 2000), photoUrl });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "No se pudo guardar la observación");
    } finally {
      setUploading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={() => !uploading && onClose()}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-[61] w-full max-w-md -translate-x-1/2 -translate-y-1/2"
          >
            <div className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
              <div className="h-1 w-full bg-rose-500" />
              <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-gray-100 dark:border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/15">
                    <AlertCircle size={17} className="text-rose-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600 dark:text-rose-400">Incorrecto</p>
                    <h2 className="mt-0.5 text-base font-bold text-gray-800 dark:text-white">Reportar hallazgo</h2>
                  </div>
                </div>
                <button onClick={onClose} disabled={uploading}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition disabled:opacity-40">
                  <X size={14} />
                </button>
              </div>

              <div className="px-5 py-4 space-y-3">
                <div>
                  <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                    Punto revisado:
                  </p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-white line-clamp-2">{itemName}</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                    Observación <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    value={observation}
                    onChange={(e) => setObservation(e.target.value.slice(0, 2000))}
                    maxLength={2000}
                    rows={3}
                    autoFocus
                    placeholder="Describe brevemente lo que encontraste…"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/10 transition resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                    Foto de evidencia <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                  {photoPreview ? (
                    <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-white/[0.08] aspect-video bg-gray-50 dark:bg-white/[0.04] flex items-center justify-center">
                      <img src={photoPreview} alt="Evidencia" className="w-full h-full object-contain" />
                      <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                        disabled={uploading}
                        className="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-rose-500 transition">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={uploading}
                        className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 dark:border-white/[0.08] p-4 hover:border-rose-400 dark:hover:border-rose-500/50 hover:bg-rose-50/40 dark:hover:bg-rose-500/5 transition cursor-pointer">
                        <Camera size={18} className="text-gray-400" />
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Cámara</span>
                      </button>
                      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                        className="flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 dark:border-white/[0.08] p-4 hover:border-rose-400 dark:hover:border-rose-500/50 hover:bg-rose-50/40 dark:hover:bg-rose-500/5 transition cursor-pointer">
                        <Upload size={18} className="text-gray-400" />
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Subir</span>
                      </button>
                    </div>
                  )}
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
                  <input ref={fileInputRef}  type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <button type="button" onClick={onClose} disabled={uploading}
                  className="rounded-lg border border-gray-200 dark:border-white/[0.08] px-3.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.04] transition disabled:opacity-50">
                  Cancelar
                </button>
                <button type="button" onClick={handleConfirm} disabled={uploading || !observation.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-1.5 text-xs font-semibold text-white transition">
                  {uploading && <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {uploading ? "Guardando…" : "Marcar Incorrecto"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
