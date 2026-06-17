"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, Banknote, Truck, Route, Calendar, Hash, Camera,
  CreditCard, FileText, Loader2, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { ApiTollEntry, CreateTollPayload } from "../../../hooks/useToll";
import { uploadTollPhoto } from "../../../hooks/useToll";
import { DatePicker } from "../../../components/ui/date-picker/DatePicker";

const inputCls =
  "h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-700 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200 dark:placeholder:text-gray-500";

const labelCls =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500";

const errorCls =
  "mt-1 flex items-center gap-1 text-[11px] text-rose-500 dark:text-rose-400";

const TOLL_CATEGORIES = [
  { value: "",            label: "Sin categoría" },
  { value: "Urbano",      label: "Urbano"        },
  { value: "Nacional",    label: "Nacional"      },
  { value: "Departamental",label: "Departamental" },
  { value: "Municipal",   label: "Municipal"     },
  { value: "Privado",     label: "Privado"       },
];

const PAYMENT_METHODS = [
  { value: "",             label: "Sin especificar" },
  { value: "Efectivo",     label: "Efectivo"     },
  { value: "Tarjeta",      label: "Tarjeta"      },
  { value: "Transferencia",label: "Transferencia"},
  { value: "Tag",          label: "Tag electrónico" },
  { value: "Pase",         label: "Pase mensual" },
  { value: "Otro",         label: "Otro"         },
];

type TollFormProps = {
  open: boolean;
  entry: ApiTollEntry | null;
  assets: Array<{ id: string; plate: string; brand: string | null; model: string | null }>;
  assetsLoading?: boolean;
  companyId: number;
  saving?: boolean;
  onClose: () => void;
  onSave: (payload: CreateTollPayload) => Promise<void>;
};

type FormState = {
  assetId:       string;
  date:          string;
  tollName:      string;
  category:      string;
  amount:        string;
  paymentMethod: string;
  route:         string;
  odometer:      string;
  axes:          string;
  notes:         string;
  photoUrl:      string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const EMPTY: FormState = {
  assetId:       "",
  date:          new Date().toISOString().slice(0, 10),
  tollName:      "",
  category:      "",
  amount:        "",
  paymentMethod: "",
  route:         "",
  odometer:      "",
  axes:          "",
  notes:         "",
  photoUrl:      "",
};

function toForm(e: ApiTollEntry): FormState {
  return {
    assetId:       e.assetId,
    date:          e.date,
    tollName:      e.tollName,
    category:      e.category ?? "",
    amount:        String(e.amount),
    paymentMethod: e.paymentMethod ?? "",
    route:         e.route ?? "",
    odometer:      e.odometer != null ? String(e.odometer) : "",
    axes:          e.axes != null ? String(e.axes) : "",
    notes:         e.notes ?? "",
    photoUrl:      e.photoUrl ?? "",
  };
}

export function TollFormModal({ open, entry, assets, assetsLoading, companyId, saving, onClose, onSave }: TollFormProps) {
  const [form, setForm]   = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(entry ? toForm(entry) : EMPTY);
      setErrors({});
    }
  }, [open, entry]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
  };

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!form.assetId)  e.assetId  = "Selecciona un vehículo.";
    if (!form.date)     e.date     = "Fecha requerida.";
    if (!form.tollName.trim()) e.tollName = "Nombre del peaje requerido.";
    if (!form.amount.trim() || isNaN(Number(form.amount)) || Number(form.amount) < 0) {
      e.amount = "Monto inválido.";
    }
    if (form.odometer.trim() && (isNaN(Number(form.odometer)) || Number(form.odometer) < 0)) {
      e.odometer = "Odómetro inválido.";
    }
    if (form.axes.trim() && (isNaN(Number(form.axes)) || Number(form.axes) < 1)) {
      e.axes = "Ejes inválido.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error("Revisa los campos", { description: "Hay datos inválidos." });
      return;
    }
    await onSave({
      assetId:       form.assetId,
      driverId:      entry?.driverId ?? null,
      date:          form.date,
      tollName:      form.tollName.trim(),
      category:      form.category || null,
      amount:        Number(form.amount),
      paymentMethod: form.paymentMethod || null,
      route:         form.route.trim() || null,
      odometer:      form.odometer.trim() ? Number(form.odometer) : null,
      axes:          form.axes.trim() ? Number(form.axes) : null,
      notes:         form.notes.trim() || null,
      photoUrl:      form.photoUrl.trim() || null,
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 max-h-[90vh] flex flex-col"
          >
            <div className="rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.06] dark:bg-gray-900 overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-500 dark:bg-amber-500/10">
                    <Banknote size={18} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                      {entry ? "Editar peaje" : "Registrar peaje"}
                    </h2>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Carga el cruce con su monto y datos del trayecto.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={onSubmit} className="flex flex-col overflow-hidden">
                <div className="overflow-y-auto px-6 py-5 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Vehículo */}
                    <div className="sm:col-span-2">
                      <label className={labelCls}><Truck size={10} className="inline mr-1" />Vehículo</label>
                      <select
                        value={form.assetId}
                        disabled={assetsLoading}
                        onChange={(e) => set("assetId", e.target.value)}
                        className={`${inputCls} ${errors.assetId ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10" : ""} ${assetsLoading ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        <option value="">{assetsLoading ? "Cargando vehículos…" : "Selecciona un vehículo…"}</option>
                        {assets.map((a) => (
                          <option key={a.id} value={a.id}>{a.plate} {a.brand || a.model ? `· ${a.brand ?? ""} ${a.model ?? ""}`.trim() : ""}</option>
                        ))}
                      </select>
                      {errors.assetId && <p className={errorCls}><AlertCircle size={10} />{errors.assetId}</p>}
                    </div>

                    {/* Fecha */}
                    <div>
                      <label className={labelCls}><Calendar size={10} className="inline mr-1" />Fecha</label>
                      <DatePicker
                        value={form.date}
                        onChange={(v) => set("date", v)}
                      />
                      {errors.date && <p className={errorCls}><AlertCircle size={10} />{errors.date}</p>}
                    </div>

                    {/* Monto */}
                    <div>
                      <label className={labelCls}><Hash size={10} className="inline mr-1" />Monto (COP)</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="100"
                        value={form.amount}
                        onChange={(e) => set("amount", e.target.value)}
                        placeholder="0"
                        className={`${inputCls} ${errors.amount ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10" : ""}`}
                      />
                      {errors.amount && <p className={errorCls}><AlertCircle size={10} />{errors.amount}</p>}
                    </div>

                    {/* Nombre del peaje */}
                    <div className="sm:col-span-2">
                      <label className={labelCls}><Banknote size={10} className="inline mr-1" />Nombre del peaje</label>
                      <input
                        type="text"
                        value={form.tollName}
                        onChange={(e) => set("tollName", e.target.value)}
                        maxLength={200}
                        placeholder="Ej. Peaje Norte, Caseta Autopista Medellín…"
                        className={`${inputCls} ${errors.tollName ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10" : ""}`}
                      />
                      {errors.tollName && <p className={errorCls}><AlertCircle size={10} />{errors.tollName}</p>}
                    </div>

                    {/* Ruta */}
                    <div className="sm:col-span-2">
                      <label className={labelCls}><Route size={10} className="inline mr-1" />Ruta / trayecto</label>
                      <input
                        type="text"
                        value={form.route}
                        onChange={(e) => set("route", e.target.value)}
                        maxLength={200}
                        placeholder="Ej. Bogotá → Medellín"
                        className={inputCls}
                      />
                    </div>

                    {/* Categoría */}
                    <div>
                      <label className={labelCls}><FileText size={10} className="inline mr-1" />Categoría</label>
                      <select
                        value={form.category}
                        onChange={(e) => set("category", e.target.value)}
                        className={inputCls}
                      >
                        {TOLL_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>

                    {/* Método de pago */}
                    <div>
                      <label className={labelCls}><CreditCard size={10} className="inline mr-1" />Método de pago</label>
                      <select
                        value={form.paymentMethod}
                        onChange={(e) => set("paymentMethod", e.target.value)}
                        className={inputCls}
                      >
                        {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>

                    {/* Odómetro */}
                    <div>
                      <label className={labelCls}><Hash size={10} className="inline mr-1" />Odómetro (km)</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={form.odometer}
                        onChange={(e) => set("odometer", e.target.value)}
                        placeholder="0"
                        className={`${inputCls} ${errors.odometer ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10" : ""}`}
                      />
                      {errors.odometer && <p className={errorCls}><AlertCircle size={10} />{errors.odometer}</p>}
                    </div>

                    {/* Ejes */}
                    <div>
                      <label className={labelCls}><Hash size={10} className="inline mr-1" />Ejes</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="12"
                        value={form.axes}
                        onChange={(e) => set("axes", e.target.value)}
                        placeholder="2"
                        className={`${inputCls} ${errors.axes ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10" : ""}`}
                      />
                      {errors.axes && <p className={errorCls}><AlertCircle size={10} />{errors.axes}</p>}
                    </div>

                    {/* Notas */}
                    <div className="sm:col-span-2">
                      <label className={labelCls}><FileText size={10} className="inline mr-1" />Notas</label>
                      <textarea
                        value={form.notes}
                        onChange={(e) => set("notes", e.target.value)}
                        rows={2}
                        placeholder="Observaciones relevantes."
                        className={`${inputCls} resize-none`}
                      />
                    </div>

                    {/* Foto */}
                    <div className="sm:col-span-2">
                      <label className={labelCls}><Camera size={10} className="inline mr-1" />Foto del tiquete (opcional)</label>
                      <div className="flex items-center gap-3">
                        {form.photoUrl ? (
                          <img src={form.photoUrl} alt="tiquete" className="h-20 w-20 rounded-lg object-cover border border-gray-200 dark:border-white/[0.08]" />
                        ) : (
                          <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-400 dark:border-white/[0.08]">
                            <Camera size={18} />
                          </div>
                        )}
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3.5 py-2 text-sm font-semibold text-amber-700 transition hover:border-amber-400 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                          {uploading ? <><Loader2 size={14} className="animate-spin" /> Subiendo…</> : "Subir foto"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploading}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setUploading(true);
                              try {
                                const url = await uploadTollPhoto(file, companyId);
                                set("photoUrl", url);
                                toast.success("Foto subida");
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Error al subir");
                              } finally {
                                setUploading(false);
                                e.target.value = "";
                              }
                            }}
                          />
                        </label>
                        {form.photoUrl && (
                          <button
                            type="button"
                            onClick={() => set("photoUrl", "")}
                            className="text-xs font-semibold text-gray-500 hover:text-rose-500"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-gray-200 px-6 py-3 sm:flex-row sm:justify-end dark:border-white/[0.06]">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-white/[0.06] dark:text-gray-400 dark:hover:bg-white/[0.04] transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-amber-500/20 transition"
                  >
                    {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando…</> : entry ? "Guardar cambios" : "Crear peaje"}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
