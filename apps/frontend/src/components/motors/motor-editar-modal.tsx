import { useState, useRef, useEffect } from "react";
 import { toast } from "sonner";
import { useMotors } from "../../hooks/useMotors";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { DatePicker } from "../ui/date-picker/DatePicker";
import type { Asset, AssetFuelType, AssetStatus } from "../../types/activo";
import { useDrivers } from "../../hooks/useDrivers";

/* ── Types ── */
type EditMotorFormValues = {
  code: string;
  name: string;
  serial: string;
  brand: string;
  model: string;
  year: string;
  fuelType: AssetFuelType;
  oilType: string;
  oilCapacity: string;
  status: AssetStatus;
  location: string;
  responsible: string;
  observations: string;
  nextMaintenance: string;
};

type FormErrors = Partial<Record<keyof EditMotorFormValues, string>>;

/* ── Helpers ── */
function toFormValues(motor: Asset): EditMotorFormValues {
  return {
    code:            motor.code,
    name:            motor.name,
    serial:          motor.serial ?? "",
    brand:           motor.brand ?? "",
    model:           motor.model ?? "",
    year:            motor.year ?? "",
    fuelType:        motor.fuelType ?? "Diesel",
    oilType:         motor.oilType ?? "",
    oilCapacity:     motor.oilCapacity ?? "",
    status:          motor.status,
    location:        motor.location ?? "",
    responsible:     motor.responsible ?? "",
    observations:    motor.observations ?? "",
    nextMaintenance: motor.nextMaintenance ?? "",
  };
}

function validate(values: EditMotorFormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.code.trim())     errors.code     = "El código es obligatorio.";
  if (!values.name.trim())     errors.name     = "El nombre es obligatorio.";
  if (!values.brand.trim())    errors.brand    = "La marca es obligatoria.";
  if (!values.model.trim())    errors.model    = "El modelo es obligatorio.";
  if (!values.oilType.trim())  errors.oilType  = "El tipo de aceite es obligatorio.";
  if (!values.oilCapacity.trim()) errors.oilCapacity = "La capacidad de aceite es obligatoria.";
  return errors;
}

/* ── UI primitives ── */
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}

// Agrega este componente arriba en el archivo, junto a Field:
function SelectField({
  value,
  onChange,
  options,
  placeholder = "— Sin asignar —",
  loading = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (loading) return (
    <div className="flex h-10 items-center px-3 rounded-xl border border-gray-200 dark:border-white/[0.08] text-sm text-gray-400">
      Cargando…
    </div>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={inputCls + " flex items-center justify-between text-left"}
      >
        <span className={selected ? "text-gray-800 dark:text-white" : "text-gray-400"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronRight size={14} className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-white/[0.08] dark:bg-gray-900">
          <div className="max-h-48 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.05]"
            >
              {placeholder}
            </button>
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full px-3 py-2 text-left text-sm transition hover:bg-gray-50 dark:hover:bg-white/[0.05]
                  ${o.value === value ? "font-semibold text-orange-500" : "text-gray-700 dark:text-gray-300"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "h-10 w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 transition";

/* ── Steps ── */
const STEPS = ["Identificación", "Técnico", "Operativo"];

const STEP_FIELDS: Array<Array<keyof EditMotorFormValues>> = [
  ["code", "name", "brand", "model"],
  ["oilType", "oilCapacity"],
  [],
];

const STATUS_OPTIONS: AssetStatus[] = ["Operativo", "En mantenimiento", "Fuera de servicio"];
const FUEL_OPTIONS: AssetFuelType[] = ["Diesel", "Gasolina", "Electrico", "Hibrido"];

/* ── Props ── */
type Props = {
  motor: Asset;
  onClose: () => void;
};

/* ── Component ── */
export function MotorEditModal({ motor, onClose }: Props) {
  const { updateMotor } = useMotors();
  const { drivers, loading: driversLoading } = useDrivers();

  const [step, setStep]     = useState(0);
  const [values, setValues] = useState<EditMotorFormValues>(() => toFormValues(motor));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  const set = (key: keyof EditMotorFormValues, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const next = () => {
    const allErrors = validate(values);
    const stepErrors = Object.fromEntries(
      STEP_FIELDS[step].filter((k) => allErrors[k]).map((k) => [k, allErrors[k]])
    ) as FormErrors;

    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    setStep((s) => s + 1);
  };

  const submit = async () => {
    const allErrors = validate(values);
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      toast.error("Formulario incompleto", { description: "Revisa los campos con error." });
      return;
    }

    setSaving(true);
    const ok = await updateMotor(motor.id, {
      // campos del form
      code:            values.code,
      name:            values.name,
      serial:          values.serial,
      brand:           values.brand,
      model:           values.model,
      year:            values.year,
      fuelType:        values.fuelType,
      oilType:         values.oilType,
      oilCapacity:     values.oilCapacity,
      status:          values.status,
      location:        values.location,
      responsible:     values.responsible,
      observations:    values.observations,
      nextMaintenance: values.nextMaintenance,
      assetType:       "Motor",
      // campos que no se editan en este form → preservar del motor original
      category:        motor.category,
      site:            motor.site,
      plate:           motor.plate,
      color:           motor.color,
      maxLoad:         motor.maxLoad,
      utilization:     motor.utilization,
      lastInspection:  motor.lastInspection,
      alerts:          motor.alerts,
      availability:    motor.availability,
      photoUrls:       motor.photoUrls,
    });
    setSaving(false);

  if (ok) {
    toast.success("Motor actualizado", { description: "Los cambios fueron guardados correctamente." });
    onClose();
  } else {
    toast.error("No se pudo guardar", { description: "Intenta de nuevo." });
  }
};
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0f1623] shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/[0.06] px-6 pb-4 pt-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">Editar motor</p>
            <h2 className="mt-0.5 text-base font-bold text-gray-800 dark:text-white">
              {motor.code} — {motor.brand} {motor.model}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 dark:hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-gray-100 dark:bg-white/[0.06]">
          <div
            className="h-full bg-orange-500 transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 bg-gray-50 px-6 py-3 dark:bg-white/[0.02]">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold transition
                ${i < step  ? "bg-orange-500 text-white"
                : i === step ? "bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 ring-2 ring-orange-400"
                :               "bg-gray-200 dark:bg-white/[0.08] text-gray-400"}`}
              >
                {i < step ? "✓" : i + 1}
              </div>
              <span className={`hidden text-xs font-medium sm:block ${i === step ? "text-orange-500" : "text-gray-400"}`}>
                {s}
              </span>
              {i < STEPS.length - 1 && <div className="ml-1 h-px w-6 bg-gray-200 dark:bg-white/[0.08]" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="max-h-[55vh] overflow-y-auto px-6 py-5">

          {/* Step 0 — Identificación */}
          {step === 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Código" error={errors.code}>
                <input className={inputCls} value={values.code} onChange={(e) => set("code", e.target.value)} placeholder="MOT-001" />
              </Field>
              <Field label="Nombre" error={errors.name}>
                <input className={inputCls} value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="Motor Cummins #1" />
              </Field>
              <Field label="Marca" error={errors.brand}>
                <input className={inputCls} value={values.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Cummins" />
              </Field>
              <Field label="Modelo" error={errors.model}>
                <input className={inputCls} value={values.model} onChange={(e) => set("model", e.target.value)} placeholder="ISX15" />
              </Field>
              <Field label="Serie">
                <input className={inputCls} value={values.serial} onChange={(e) => set("serial", e.target.value)} placeholder="CM-ISX15-2021-001" />
              </Field>
              <Field label="Año">
                <input className={inputCls} value={values.year} onChange={(e) => set("year", e.target.value)} placeholder="2021" />
              </Field>
            </div>
          )}

          {/* Step 1 — Técnico */}
          {step === 1 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tipo de combustible">
                <select className={inputCls + " cursor-pointer"} value={values.fuelType} onChange={(e) => set("fuelType", e.target.value)}>
                  {FUEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Tipo de aceite" error={errors.oilType}>
                <input className={inputCls} value={values.oilType} onChange={(e) => set("oilType", e.target.value)} placeholder="15W-40" />
              </Field>
              <Field label="Capacidad de aceite" error={errors.oilCapacity}>
                <input className={inputCls} value={values.oilCapacity} onChange={(e) => set("oilCapacity", e.target.value)} placeholder="15L" />
              </Field>
              <Field label="Próximo mantenimiento">
                <DatePicker
                  value={values.nextMaintenance}
                  onChange={(v) => set("nextMaintenance", v)}
                  placeholder="Seleccionar fecha"
                />
              </Field>
            </div>
          )}

          {/* Step 2 — Operativo */}
          {step === 2 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Estado">
                <select className={inputCls + " cursor-pointer"} value={values.status} onChange={(e) => set("status", e.target.value as AssetStatus)}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Ubicación">
                <input className={inputCls} value={values.location} onChange={(e) => set("location", e.target.value)} placeholder="Taller principal" />
              </Field>
              <Field label="Responsable">
                <SelectField
                  value={values.responsible}
                  onChange={(v) => set("responsible", v)}
                  loading={driversLoading}
                  options={drivers
                    .filter((d) => d.status === "Activo")
                    .map((d) => ({ value: d.name, label: `${d.firstName} ${d.lastName}` }))
                  }
                />
              </Field>
              <Field label="Observaciones">
                <textarea
                  rows={3}
                  className="w-full resize-none rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 py-2.5 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 transition"
                  value={values.observations}
                  onChange={(e) => set("observations", e.target.value)}
                  placeholder="Notas adicionales..."
                />
              </Field>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] px-6 py-4">
          <button
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-white/[0.08] px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 transition hover:bg-gray-100 dark:hover:bg-white/10"
          >
            <ChevronLeft size={15} />
            {step === 0 ? "Cancelar" : "Anterior"}
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 active:scale-95"
            >
              Siguiente
              <ChevronRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 active:scale-95 disabled:opacity-60"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}