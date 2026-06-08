import { useRef, useState } from "react";
import { X, Loader2, ImagePlus, Trash2 } from "lucide-react";
import { useAcUnits } from "../../hooks/useAcUnits";
import { useSites } from "../../hooks/useSites";
import { useCompanyUsers, type CompanyUser } from "../../hooks/useCompanyUsers";
import { DatePicker } from "../ui/date-picker/DatePicker";
import type {
  AirConditioningType,
  AirConditioningStatus,
} from "../../types/fleet";

type Props = { onClose: () => void };

type FormValues = {
  code: string;
  name: string;
  type: AirConditioningType;
  siteId: string;
  floor: string;
  area: string;
  serial: string;
  brand: string;
  model: string;
  capacityBtu: string;
  voltage: string;
  amperage: string;
  refrigerantType: string;
  installDate: string;
  technician: string;
  status: AirConditioningStatus;
  nextService: string;
  notes: string;
};

function getInitialValues(): FormValues {
  return {
    code: "",
    name: "",
    type: "Split",
    siteId: "",
    floor: "",
    area: "",
    serial: "",
    brand: "",
    model: "",
    capacityBtu: "",
    voltage: "",
    amperage: "",
    refrigerantType: "",
    installDate: "",
    technician: "",
    status: "Operativo",
    nextService: "",
    notes: "",
  };
}

function validate(v: FormValues): Partial<Record<keyof FormValues, string>> {
  const e: Partial<Record<keyof FormValues, string>> = {};
  if (!v.code.trim()) e.code = "El código es obligatorio.";
  if (!v.name.trim()) e.name = "El nombre es obligatorio.";
  if (!v.brand.trim()) e.brand = "La marca es obligatoria.";
  return e;
}

const TYPE_OPTIONS: AirConditioningType[] = [
  "Split", "Cassette", "Ventana", "Central", "Chiller", "Fan-coil", "Otro",
];
const STATUS_OPTIONS: AirConditioningStatus[] = [
  "Operativo", "En revision", "Fuera de servicio", "Pendiente revision",
];

function userDisplayName(u: CompanyUser): string {
  const profile = u.profileData as { name?: string; firstName?: string; lastName?: string };
  if (profile?.name) return profile.name;
  if (profile?.firstName || profile?.lastName) {
    return `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim();
  }
  return u.username;
}

const inputCls =
  "h-10 w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 transition";
const selectCls =
  "h-10 w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 px-3 text-sm text-gray-800 dark:text-white focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 transition cursor-pointer";
const textareaCls =
  "w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 transition";

function Field({
  label, error, required, children,
}: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}

export function AcCreateModal({ onClose }: Props) {
  const { createUnit, uploadAcPhotos } = useAcUnits();
  const { sites } = useSites();
  const { users } = useCompanyUsers();
  const fileRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<FormValues>(getInitialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

  const set = (key: keyof FormValues, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const onPickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPhotoFiles((prev) => [...prev, ...files]);
    files.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () =>
        setPhotoPreviews((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const removePhoto = (idx: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    const errs = validate(values);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const photoUrls = photoFiles.length ? await uploadAcPhotos(photoFiles) : [];
      const ok = await createUnit({
        code: values.code,
        name: values.name,
        type: values.type,
        siteId: values.siteId || null,
        floor: values.floor,
        area: values.area,
        serial: values.serial,
        brand: values.brand,
        model: values.model,
        capacityBtu: values.capacityBtu,
        voltage: values.voltage,
        amperage: values.amperage,
        refrigerantType: values.refrigerantType,
        installDate: values.installDate,
        technician: values.technician,
        status: values.status,
        nextService: values.nextService,
        photoUrls,
        notes: values.notes,
      });
      if (ok) onClose();
      else setGlobalError("No se pudo registrar la unidad A/C.");
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0f1623]">
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 px-6 py-4 backdrop-blur dark:border-white/[0.06] dark:bg-[#0f1623]/95">
            <div>
              <h3 className="text-base font-bold text-gray-800 dark:text-white">Nueva unidad de aire acondicionado</h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Registra el equipo y sus datos técnicos.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-white/5 dark:hover:text-gray-200"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-2">
            <Field label="Código" required error={errors.code}>
              <input className={inputCls} value={values.code} onChange={(e) => set("code", e.target.value)} placeholder="AC-001" />
            </Field>
            <Field label="Nombre" required error={errors.name}>
              <input className={inputCls} value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="A/C Sala de juntas" />
            </Field>

            <Field label="Tipo">
              <select className={selectCls} value={values.type} onChange={(e) => set("type", e.target.value as AirConditioningType)}>
                {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select className={selectCls} value={values.status} onChange={(e) => set("status", e.target.value as AirConditioningStatus)}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>

            <Field label="Sede">
              <select className={selectCls} value={values.siteId} onChange={(e) => set("siteId", e.target.value)}>
                <option value="">— Sin sede —</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Piso / Área">
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} value={values.floor} onChange={(e) => set("floor", e.target.value)} placeholder="Piso 2" />
                <input className={inputCls} value={values.area} onChange={(e) => set("area", e.target.value)} placeholder="Sala" />
              </div>
            </Field>

            <Field label="Marca" required error={errors.brand}>
              <input className={inputCls} value={values.brand} onChange={(e) => set("brand", e.target.value)} placeholder="LG, Samsung, Daikin..." />
            </Field>
            <Field label="Modelo">
              <input className={inputCls} value={values.model} onChange={(e) => set("model", e.target.value)} />
            </Field>
            <Field label="Serie">
              <input className={inputCls} value={values.serial} onChange={(e) => set("serial", e.target.value)} />
            </Field>
            <Field label="Capacidad (BTU)">
              <input className={inputCls} value={values.capacityBtu} onChange={(e) => set("capacityBtu", e.target.value)} placeholder="12000" />
            </Field>
            <Field label="Voltaje">
              <input className={inputCls} value={values.voltage} onChange={(e) => set("voltage", e.target.value)} placeholder="110V / 220V" />
            </Field>
            <Field label="Amperaje">
              <input className={inputCls} value={values.amperage} onChange={(e) => set("amperage", e.target.value)} />
            </Field>
            <Field label="Refrigerante">
              <input className={inputCls} value={values.refrigerantType} onChange={(e) => set("refrigerantType", e.target.value)} placeholder="R-410A, R-22..." />
            </Field>
            <Field label="Técnico responsable">
              <select className={selectCls} value={values.technician} onChange={(e) => set("technician", e.target.value)}>
                <option value="">— Seleccionar técnico —</option>
                {users
                  .filter((u) => u.status === "active")
                  .map((u) => (
                    <option key={u.id} value={userDisplayName(u)}>
                      {userDisplayName(u)} · {u.role}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Fecha de instalación">
              <DatePicker
                value={values.installDate}
                onChange={(v) => set("installDate", v)}
                placeholder="Seleccionar fecha"
              />
            </Field>
            <Field label="Próximo servicio">
              <DatePicker
                value={values.nextService}
                onChange={(v) => set("nextService", v)}
                placeholder="Seleccionar fecha"
              />
            </Field>

            <div className="md:col-span-2">
              <Field label="Fotos de la unidad">
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    multiple
                    className="hidden"
                    onChange={onPickPhotos}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200 dark:hover:bg-white/[0.08]"
                  >
                    <ImagePlus size={14} />
                    Subir fotos
                  </button>
                  {photoPreviews.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {photoPreviews.map((src, i) => (
                        <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-lg ring-1 ring-gray-200 dark:ring-white/[0.08]">
                          <img src={src} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePhoto(i)}
                            className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100"
                          >
                            <Trash2 size={14} className="text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Notas">
                <textarea rows={3} className={textareaCls} value={values.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Observaciones generales..." />
              </Field>
            </div>

            {globalError && (
              <div className="md:col-span-2">
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  {globalError}
                </p>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-cyan-500/20 transition hover:bg-cyan-600 active:scale-95 disabled:opacity-60"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Guardando..." : "Crear unidad"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
