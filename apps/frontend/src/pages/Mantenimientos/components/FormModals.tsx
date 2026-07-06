import { useState } from "react";
import type { OilType } from "./types";

// ─── Overlay ──────────────────────────────────────────────────────────────────

interface OverlayProps {
  children: React.ReactNode;
  onClose: () => void;
}

function Overlay({ children, onClose }: OverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {children}
    </div>
  );
}

const inputCls =
  "h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/20 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition";

// ─── Field ────────────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, required, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">
        {label}
        {required && <span className="ml-1 text-emerald-500">*</span>}
      </label>
      {children}
    </div>
  );
}

// ─── AddOilTypeModal ──────────────────────────────────────────────────────────

type OilForm = Omit<OilType, "id"> & { id?: string };

interface AddOilTypeModalProps {
  initial?: OilType | null;
  onClose: () => void;
  onSubmit: (form: OilForm) => void;
}

export function AddOilTypeModal({ initial, onClose, onSubmit }: AddOilTypeModalProps) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState<OilForm>(
    initial ?? { name: "", brand: "", viscosity: "", application: "", unit: "gal", stock: 0, minStock: 0, notes: "" }
  );
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof OilForm>(k: K, v: OilForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const isValid = form.name && form.brand && form.viscosity;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    await onSubmit({ ...form, stock: Number(form.stock ?? 0), minStock: Number(form.minStock ?? 0) });
    setSaving(false);
  };

  return (
    <Overlay onClose={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-t-3xl border border-white/[0.08] bg-[#0d1117] shadow-2xl sm:rounded-3xl">
        <div className="h-0.5 bg-emerald-500 w-full" />
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 pb-4 pt-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">
              {isEdit ? "Editar aceite" : "Nuevo aceite"}
            </p>
            <h2 className="mt-0.5 text-base font-bold text-white">
              {isEdit ? form.name : "Registrar tipo de aceite"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-white/40 hover:bg-white/[0.06] hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5 space-y-4">
          <Field label="Nombre" required>
            <input
              className={inputCls}
              placeholder="Ej: Mobil Delvac 1300"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca" required>
              <input
                className={inputCls}
                placeholder="Mobil"
                value={form.brand}
                onChange={(e) => set("brand", e.target.value)}
              />
            </Field>
            <Field label="Viscosidad" required>
              <input
                className={inputCls}
                placeholder="15W-40"
                value={form.viscosity}
                onChange={(e) => set("viscosity", e.target.value)}
              />
            </Field>
          </div>
          <Field label="AplicaciÃ³n">
            <input
              className={inputCls}
              placeholder="Motor diÃ©sel"
              value={form.application}
              onChange={(e) => set("application", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Unidad">
              <input
                className={inputCls}
                placeholder="gal"
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
              />
            </Field>
            <Field label="Stock">
              <input
                className={inputCls}
                type="number"
                placeholder="0"
                value={form.stock === 0 ? "" : form.stock}
                onChange={(e) => set("stock", e.target.value === "" ? 0 : Number(e.target.value))}
              />
            </Field>
            <Field label="MÃ­nimo">
              <input
                className={inputCls}
                type="number"
                placeholder="0"
                value={form.minStock === 0 ? "" : form.minStock}
                onChange={(e) => set("minStock", e.target.value === "" ? 0 : Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label="Notas">
            <textarea
              rows={3}
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition"
              placeholder="Observaciones sobre este lubricante..."
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </div>

        <div className="flex gap-3 border-t border-white/[0.06] bg-white/[0.02] px-6 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm font-semibold text-white/50 hover:bg-white/[0.05] hover:text-white transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !isValid}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-black transition hover:bg-emerald-400 active:scale-95 disabled:opacity-40"
          >
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear aceite"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

