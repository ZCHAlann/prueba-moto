"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, Fuel, Droplets, DollarSign, Gauge, MapPin,
  FileText, Camera, Loader2, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { ApiFuelEntry, CreateFuelPayload } from "../../../hooks/useFuel";
import { uploadFuelPhoto } from "../../../hooks/useFuel";
import { DatePicker } from "../../../components/ui/date-picker/DatePicker";

// ── Helpers ────────────────────────────────────────────────────────────────────

const inputCls =
  "h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200 dark:placeholder:text-gray-500";

const labelCls =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500";

const errorCls =
  "mt-1 flex items-center gap-1 text-[11px] text-error-500 dark:text-error-400";

// ── Types ──────────────────────────────────────────────────────────────────────

type FuelFormProps = {
  open: boolean;
  entry: ApiFuelEntry | null;
  assets: Array<{ id: number; plate: string; brand: string | null; model: string | null; name?: string | null }>;
  assetsLoading?: boolean;
  companyId: number;
  onClose: () => void;
  onSave: (payload: CreateFuelPayload, id?: string) => Promise<void>;
};

type FormState = {
  assetId:  string;
  date:     string;
  liters:   string;
  cost:     string;
  odometer: string;
  station:  string;
  notes:    string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const EMPTY: FormState = {
  assetId:  "",
  date:     new Date().toISOString().slice(0, 10),
  liters:   "",
  cost:     "",
  odometer: "",
  station:  "",
  notes:    "",
};

function toForm(e: ApiFuelEntry): FormState {
  return {
    assetId:  e.assetId,
    date:     e.date,
    liters:   String(e.liters),
    cost:     String(e.cost),
    odometer: String(e.odometer),
    station:  e.station,
    notes:    e.notes ?? "",
  };
}

function validate(f: FormState): FormErrors {
  const errs: FormErrors = {};
  if (!f.assetId)                            errs.assetId  = "Selecciona un vehículo.";
  if (!f.date)                               errs.date     = "La fecha es requerida.";
  if (!f.liters || Number(f.liters) <= 0)    errs.liters   = "Ingresa los litros cargados.";
  if (!f.cost   || Number(f.cost)   <= 0)    errs.cost     = "Ingresa el costo total.";
  if (!f.odometer || Number(f.odometer) < 0) errs.odometer = "Ingresa el odómetro.";
  if (!f.station.trim())                     errs.station  = "Ingresa la estación/gasolinera.";
  return errs;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function FuelFormModal({ open, entry, assets, assetsLoading, companyId, onClose, onSave }: FuelFormProps) {
  const isEdit = !!entry;

  const [form,         setForm]         = useState<FormState>(EMPTY);
  const [errors,       setErrors]       = useState<FormErrors>({});
  const [saving,       setSaving]       = useState(false);
  const [photoFile,    setPhotoFile]    = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reinicializar cuando se abre
  useEffect(() => {
    if (!open) return;
    setForm(entry ? toForm(entry) : EMPTY);
    setErrors({});
    setPhotoFile(null);
    setPhotoPreview(entry?.photoUrl ?? null);
  }, [open, entry]);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }));
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit() {
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    try {
      let photoUrl: string | null = entry?.photoUrl ?? null;

      if (photoFile) {
        setUploadingPhoto(true);
        try {
          photoUrl = await uploadFuelPhoto(photoFile, companyId);
        } finally {
          setUploadingPhoto(false);
        }
      } else if (!photoPreview) {
        photoUrl = null;
      }

      const payload: CreateFuelPayload = {
        assetId:  form.assetId,
        date:     form.date,
        liters:   Number(form.liters),
        cost:     Number(form.cost),
        odometer: Number(form.odometer),
        station:  form.station.trim(),
        notes:    form.notes.trim() || undefined,
        photoUrl,
      };

      await onSave(payload, isEdit ? entry!.id : undefined);
      onClose();
    } catch {
      // el padre ya muestra el toast de error
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-warning-50 dark:bg-warning-500/[0.12]">
                  <Fuel size={15} className="text-warning-600 dark:text-warning-400" />
                </div>
                <h2 className="text-base font-bold text-gray-800 dark:text-white">
                  {isEdit ? "Editar registro" : "Nuevo registro de combustible"}
                </h2>
              </div>
              <button
                onClick={onClose}
                disabled={saving}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:hover:bg-white/[0.05]"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              <div className="space-y-4">

                {/* Vehículo */}
                <div>
                  <label className={labelCls}>
                    <Fuel size={10} className="inline mr-1" />
                    Vehículo
                  </label>
                  <select
                    value={form.assetId}
                    disabled={assetsLoading}
                    onChange={(e) => set("assetId", e.target.value)}
                    className={`${inputCls} ${errors.assetId ? "border-error-400 focus:border-error-500 focus:ring-error-500/10" : ""} ${assetsLoading ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <option value="">
                      {assetsLoading ? "Cargando vehículos…" : "Selecciona un vehículo…"}
                    </option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.plate} — {[a.brand, a.model].filter(Boolean).join(" ") || a.name}
                      </option>
                    ))}
                  </select>
                  {errors.assetId && (
                    <p className={errorCls}><AlertCircle size={10} />{errors.assetId}</p>
                  )}
                </div>

                {/* Fecha */}
                <div>
                  <DatePicker
                    label="Fecha de carga"
                    value={form.date}
                    onChange={(v) => set("date", v)}
                    maxDate={new Date().toISOString().slice(0, 10)}
                  />
                  {errors.date && (
                    <p className={errorCls}><AlertCircle size={10} />{errors.date}</p>
                  )}
                </div>

                {/* Litros + Costo */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>
                      <Droplets size={10} className="inline mr-1" />
                      Litros
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={form.liters}
                      onChange={(e) => set("liters", e.target.value)}
                      className={`${inputCls} ${errors.liters ? "border-error-400" : ""}`}
                    />
                    {errors.liters && (
                      <p className={errorCls}><AlertCircle size={10} />{errors.liters}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>
                      <DollarSign size={10} className="inline mr-1" />
                      Costo (USD)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={form.cost}
                      onChange={(e) => set("cost", e.target.value)}
                      className={`${inputCls} ${errors.cost ? "border-error-400" : ""}`}
                    />
                    {errors.cost && (
                      <p className={errorCls}><AlertCircle size={10} />{errors.cost}</p>
                    )}
                  </div>
                </div>

                {/* Odómetro */}
                <div>
                  <label className={labelCls}>
                    <Gauge size={10} className="inline mr-1" />
                    Odómetro (km)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Lectura actual del odómetro"
                    value={form.odometer}
                    onChange={(e) => set("odometer", e.target.value)}
                    className={`${inputCls} ${errors.odometer ? "border-error-400" : ""}`}
                  />
                  {errors.odometer && (
                    <p className={errorCls}><AlertCircle size={10} />{errors.odometer}</p>
                  )}
                </div>

                {/* Estación */}
                <div>
                  <label className={labelCls}>
                    <MapPin size={10} className="inline mr-1" />
                    Estación / Gasolinera
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre o ubicación de la estación"
                    value={form.station}
                    onChange={(e) => set("station", e.target.value)}
                    className={`${inputCls} ${errors.station ? "border-error-400" : ""}`}
                  />
                  {errors.station && (
                    <p className={errorCls}><AlertCircle size={10} />{errors.station}</p>
                  )}
                </div>

                {/* Notas */}
                <div>
                  <label className={labelCls}>
                    <FileText size={10} className="inline mr-1" />
                    Notas <span className="normal-case font-normal">(opcional)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Observaciones adicionales…"
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-700 outline-none transition resize-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200 dark:placeholder:text-gray-500"
                  />
                </div>

                {/* Foto */}
                <div>
                  <label className={labelCls}>
                    <Camera size={10} className="inline mr-1" />
                    Foto del recibo <span className="normal-case font-normal">(opcional)</span>
                  </label>
                  {photoPreview ? (
                    <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 dark:border-white/[0.08]">
                      <img
                        src={photoPreview}
                        alt="Foto del recibo"
                        className="h-36 w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={removePhoto}
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 text-sm text-gray-400 transition hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-500 dark:border-white/[0.10] dark:hover:border-brand-500/40 dark:hover:bg-brand-500/[0.05]"
                    >
                      <Camera size={15} />
                      Subir foto del recibo
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </div>

              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4 dark:border-white/[0.06]">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 active:scale-95 disabled:opacity-50 transition"
              >
                {saving
                  ? <><Loader2 size={14} className="animate-spin" />{uploadingPhoto ? "Subiendo foto…" : "Guardando…"}</>
                  : isEdit ? "Guardar cambios" : "Registrar carga"
                }
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}