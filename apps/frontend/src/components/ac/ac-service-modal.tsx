import { useRef, useState } from "react";
import { X, Loader2, ImagePlus, Trash2, Wrench } from "lucide-react";
import { useAcUnits } from "../../hooks/useAcUnits";
import { useCompanyUsers, type CompanyUser } from "../../hooks/useCompanyUsers";
import { DatePicker } from "../ui/date-picker/DatePicker";
import type { AirConditioningUnit, AcServiceKind } from "../../types/fleet";

type Props = {
  unit: AirConditioningUnit;
  onClose: () => void;
  onCreated?: () => void;
};

const KIND_OPTIONS: AcServiceKind[] = [
  "Limpieza", "Recarga", "Reparacion", "Inspeccion", "Preventivo", "Correctivo",
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
  label, required, error, children,
}: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
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

export function AcServiceModal({ unit, onClose, onCreated }: Props) {
  const { createService, uploadAcPhotos } = useAcUnits();
  const { users } = useCompanyUsers();
  const fileRef = useRef<HTMLInputElement>(null);

  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState<AcServiceKind>("Limpieza");
  const [technician, setTechnician] = useState<string>("");
  const [cost, setCost] = useState<string>("");
  const [findings, setFindings] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    if (!list.length) return;
    setFiles((prev) => [...prev, ...list]);
    list.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () =>
        setPreviews((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const removeAt = (i: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
    setPreviews((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    if (!date) { setGlobalError("La fecha es obligatoria."); return; }

    setSaving(true);
    try {
      const photoUrls = files.length ? await uploadAcPhotos(files) : [];
      const ok = await createService({
        unitId: unit.id,
        date,
        kind,
        technician: technician || null,
        cost: cost ? Number(cost) : null,
        findings: findings || null,
        notes: notes || null,
        photoUrls,
      });
      if (ok) {
        onCreated?.();
        onClose();
      } else {
        setGlobalError("No se pudo registrar el mantenimiento.");
      }
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
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0f1623]">
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 px-6 py-4 backdrop-blur dark:border-white/[0.06] dark:bg-[#0f1623]/95">
            <div>
              <h3 className="flex items-center gap-2 text-base font-bold text-gray-800 dark:text-white">
                <Wrench size={16} className="text-cyan-500" />
                Registrar mantenimiento
              </h3>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {unit.code} · {unit.name}
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
            <Field label="Fecha" required>
              <DatePicker
                value={date}
                onChange={setDate}
                placeholder="Seleccionar fecha"
              />
            </Field>
            <Field label="Tipo de servicio">
              <select className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as AcServiceKind)}>
                {KIND_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Técnico">
              <select
                className={selectCls}
                value={technician}
                onChange={(e) => setTechnician(e.target.value)}
              >
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
            <Field label="Costo (USD)">
              <input type="number" step="0.01" min="0" max="1000000" className={inputCls} value={cost}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setCost(Number.isFinite(n) ? String(Math.max(0, Math.min(1000000, n))) : "0");
                }}
                placeholder="0.00" />
            </Field>

            <div className="md:col-span-2">
              <Field label="Hallazgos">
                <textarea rows={2} className={textareaCls} value={findings} maxLength={2000}
                  onChange={(e) => setFindings(e.target.value.slice(0, 2000))} placeholder="¿Qué encontraste en la inspección?" />
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Notas">
                <textarea rows={2} className={textareaCls} value={notes} maxLength={2000}
                  onChange={(e) => setNotes(e.target.value.slice(0, 2000))} />
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Evidencia fotográfica">
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    multiple
                    className="hidden"
                    onChange={onPickFiles}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200 dark:hover:bg-white/[0.08]"
                  >
                    <ImagePlus size={14} />
                    Subir fotos
                  </button>
                  {previews.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {previews.map((src, i) => (
                        <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-lg ring-1 ring-gray-200 dark:ring-white/[0.08]">
                          <img src={src} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeAt(i)}
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
              {saving ? "Guardando..." : "Registrar mantenimiento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
