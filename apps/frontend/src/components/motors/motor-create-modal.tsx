import { useState } from "react";
import { useNavigate } from "react-router";
import { useMotors } from "../../hooks/useMotors";
import { useDrivers } from "../../hooks/useDrivers";
import { useAssignments } from "../../hooks/useAssignments";
import { X, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { DatePicker } from "../ui/date-picker/DatePicker";
import type { AssetFuelType, AssetStatus } from "../../types/activo";

type VehicleFormValues = {
  code: string; name: string; serial: string; brand: string; model: string;
  year: string; plate: string; color: string; maxLoad: string;
  fuelType: AssetFuelType; oilType: string; oilCapacity: string;
  status: AssetStatus; location: string; driverId: string;
  observations: string; nextMaintenance: string;
};

type FormErrors = Partial<Record<keyof VehicleFormValues, string>>;

function getInitialValues(): VehicleFormValues {
  return {
    code: "", name: "", serial: "", brand: "", model: "", year: "", plate: "",
    color: "", maxLoad: "", fuelType: "Diesel", oilType: "", oilCapacity: "",
    status: "Operativo", location: "", driverId: "", observations: "",
    nextMaintenance: new Date().toISOString().slice(0, 10),
  };
}

function validate(v: VehicleFormValues): FormErrors {
  const e: FormErrors = {};
  if (!v.code.trim())        e.code        = "El código es obligatorio.";
  if (!v.name.trim())        e.name        = "El nombre es obligatorio.";
  if (!v.brand.trim())       e.brand       = "La marca es obligatoria.";
  if (!v.model.trim())       e.model       = "El modelo es obligatorio.";
  if (!v.plate.trim())       e.plate       = "La placa es obligatoria.";
  if (!v.oilType.trim())     e.oilType     = "El tipo de aceite es obligatorio.";
  if (!v.oilCapacity.trim()) e.oilCapacity = "La capacidad de aceite es obligatoria.";
  if (v.year.trim() && !/^\d{4}$/.test(v.year.trim()))
    e.year = "Debe ser un año de 4 dígitos (ej. 2021).";
  return e;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</label>
      {children}
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}

const inputCls = "h-10 w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition";
const selectCls = "h-10 w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 px-3 text-sm text-gray-800 dark:text-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition cursor-pointer";

const STEPS = ["Identificación", "Técnico", "Operativo"];
const STEP_REQUIRED: Array<Array<keyof VehicleFormValues>> = [
  ["code", "name", "brand", "model", "plate"],
  ["oilType", "oilCapacity"],
  [],
];
const STATUS_OPTIONS: AssetStatus[]   = ["Operativo", "En mantenimiento", "Fuera de servicio"];
const FUEL_OPTIONS:   AssetFuelType[] = ["Diesel", "Gasolina", "Electrico", "Hibrido"];

type Props = { onClose: () => void };

export function MotorCreateModal({ onClose }: Props) {
  const navigate = useNavigate();
  const { createMotor }      = useMotors();
  const { drivers, loading: driversLoading } = useDrivers();
  const { createAssignment } = useAssignments();

  const [step,   setStep]   = useState(0);
  const [values, setValues] = useState<VehicleFormValues>(getInitialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const set = (key: keyof VehicleFormValues, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const next = () => {
    const allErrors  = validate(values);
    const stepErrors = Object.fromEntries(
      STEP_REQUIRED[step].filter((k) => allErrors[k]).map((k) => [k, allErrors[k]])
    ) as FormErrors;
    if (Object.keys(stepErrors).length > 0) { setErrors(stepErrors); return; }
    setErrors({});
    setStep((s) => s + 1);
  };

  const submit = async () => {
    const allErrors = validate(values);
    if (Object.keys(allErrors).length > 0) { setErrors(allErrors); return; }

    setSaving(true);
    setGlobalError(null);
    try {
      const selectedDriver = drivers.find((d) => d.id === values.driverId);
      const assetId = await createMotor({
        code: values.code, name: values.name, assetType: "Vehiculo",
        serial: values.serial, brand: values.brand, model: values.model,
        year: values.year, plate: values.plate, color: values.color,
        maxLoad: values.maxLoad, fuelType: values.fuelType, oilType: values.oilType,
        oilCapacity: values.oilCapacity, status: values.status, location: values.location,
        responsible: selectedDriver?.name ?? "", observations: values.observations,
        category: "Furgoneta", site: "", utilization: "0%",
        nextMaintenance: values.nextMaintenance, lastInspection: "", alerts: 0,
        availability: "Disponible", photoUrls: [],
      });

      if (!assetId) { setGlobalError("No se pudo registrar el vehículo."); return; }

      if (values.driverId && assetId) {
        try {
          await createAssignment({
            assetId, driverId: values.driverId,
            startDate: new Date().toISOString().slice(0, 10),
            endDate: null, status: "Activa", notes: "", handoverFileName: "",
          });
        } catch { /* asignación falló pero vehículo creado */ }
      }

      onClose();
      navigate(`/motores/${assetId}`);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0f1623]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 pb-4 pt-5 dark:border-white/[0.06]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-500">Nuevo vehículo</p>
            <h2 className="mt-0.5 text-base font-bold text-gray-800 dark:text-white">{STEPS[step]}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 dark:hover:bg-white/10">
            <X size={16} />
          </button>
        </div>

        {/* Progress */}
        <div className="h-0.5 bg-gray-100 dark:bg-white/[0.06]">
          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 bg-gray-50 px-6 py-3 dark:bg-white/[0.02]">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold transition
                ${i < step    ? "bg-blue-500 text-white"
                : i === step  ? "bg-blue-100 text-blue-600 ring-2 ring-blue-400 dark:bg-blue-500/20 dark:text-blue-400"
                :                "bg-gray-200 text-gray-400 dark:bg-white/[0.08]"}`}
              >
                {i < step ? "✓" : i + 1}
              </div>
              <span className={`hidden text-xs font-medium sm:block ${i === step ? "text-blue-500" : "text-gray-400"}`}>{s}</span>
              {i < STEPS.length - 1 && <div className="ml-1 h-px w-6 bg-gray-200 dark:bg-white/[0.08]" />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="max-h-[55vh] overflow-y-auto px-6 py-5">
          {globalError && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">
              {globalError}
            </div>
          )}

          {step === 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Código" error={errors.code}><input className={inputCls} value={values.code} maxLength={40}
                onChange={(e) => set("code", e.target.value.toUpperCase().slice(0, 40))} placeholder="VEH-001" /></Field>
              <Field label="Nombre" error={errors.name}><input className={inputCls} value={values.name} maxLength={120}
                onChange={(e) => set("name", e.target.value.slice(0, 120))} placeholder="Camión Freightliner #1" /></Field>
              <Field label="Marca" error={errors.brand}><input className={inputCls} value={values.brand} maxLength={80}
                onChange={(e) => set("brand", e.target.value.slice(0, 80))} placeholder="Mercedes-Benz" /></Field>
              <Field label="Modelo" error={errors.model}><input className={inputCls} value={values.model} maxLength={80}
                onChange={(e) => set("model", e.target.value.slice(0, 80))} placeholder="Actros 2651" /></Field>
              <Field label="Placa" error={errors.plate}><input className={inputCls} value={values.plate} maxLength={8}
                onChange={(e) => set("plate", e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8))} placeholder="ABC-1234" /></Field>
              <Field label="Serie"><input className={inputCls} value={values.serial} maxLength={60}
                onChange={(e) => set("serial", e.target.value.slice(0, 60))} placeholder="SN-123456" /></Field>
              <Field label="Año" error={errors.year}><input className={inputCls} value={values.year} onChange={(e) => set("year", e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="2021" inputMode="numeric" maxLength={4} /></Field>
              <Field label="Color"><input className={inputCls} value={values.color} maxLength={40}
                onChange={(e) => set("color", e.target.value.slice(0, 40))} placeholder="Blanco" /></Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tipo de combustible">
                <select className={selectCls} value={values.fuelType} onChange={(e) => set("fuelType", e.target.value)}>
                  {FUEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Tipo de aceite" error={errors.oilType}><input className={inputCls} value={values.oilType} maxLength={60}
                onChange={(e) => set("oilType", e.target.value.slice(0, 60))} placeholder="15W-40" /></Field>
              <Field label="Capacidad de aceite" error={errors.oilCapacity}><input className={inputCls} value={values.oilCapacity} maxLength={20}
                onChange={(e) => set("oilCapacity", e.target.value.slice(0, 20))} placeholder="15 L" /></Field>
              <Field label="Carga máxima" error={errors.maxLoad}><input className={inputCls} value={values.maxLoad} maxLength={20}
                onChange={(e) => set("maxLoad", e.target.value.slice(0, 20))} placeholder="5000 kg" /></Field>
              <Field label="Próximo mantenimiento">
                <DatePicker
                  value={values.nextMaintenance}
                  onChange={(v) => set("nextMaintenance", v)}
                  placeholder="Seleccionar fecha"
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Estado">
                <select className={selectCls} value={values.status} onChange={(e) => set("status", e.target.value as AssetStatus)}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Ubicación"><input className={inputCls} value={values.location} maxLength={200}
                onChange={(e) => set("location", e.target.value.slice(0, 200))} placeholder="Patio principal" /></Field>
              <Field label="Conductor asignado">
                {driversLoading ? (
                  <div className="flex h-10 items-center gap-2 rounded-xl border border-gray-200 px-3 dark:border-white/[0.08]">
                    <Loader2 size={14} className="animate-spin text-gray-400" />
                    <span className="text-sm text-gray-400">Cargando conductores…</span>
                  </div>
                ) : (
                  <select className={selectCls} value={values.driverId} onChange={(e) => set("driverId", e.target.value)}>
                    <option value="">— Sin asignar —</option>
                    {drivers.filter((d) => d.status === "Activo").map((d) => {
                      const label = [d.firstName, d.lastName].filter(Boolean).join(" ") || d.code;
                      return <option key={d.id} value={d.id}>{label} · {d.licenseType}</option>;
                    })}
                  </select>
                )}
              </Field>
              <Field label="Observaciones">
                <textarea className="w-full resize-none rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 py-2.5 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition" rows={3} maxLength={2000} value={values.observations} onChange={(e) => set("observations", e.target.value.slice(0, 2000))} placeholder="Notas adicionales…" />
              </Field>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button type="button" onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/10">
            <ChevronLeft size={15} />
            {step === 0 ? "Cancelar" : "Anterior"}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 active:scale-95">
              Siguiente <ChevronRight size={15} />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 active:scale-95 disabled:opacity-60">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Guardando…" : "Crear vehículo"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}