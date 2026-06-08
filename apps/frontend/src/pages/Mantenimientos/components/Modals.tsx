import { useState, useRef, useEffect } from "react";
import type { InventoryItem, OilType, Asset } from "./types";
import type { ApiDriver } from "../../../hooks/useDrivers";
import { createPortal } from "react-dom";
import { DatePicker } from "../../../components/ui/date-picker/DatePicker";

// ─── Shared ───────────────────────────────────────────────────────────────────

interface OverlayProps {
  children: React.ReactNode;
  onClose: () => void;
}

function Overlay({ children, onClose }: OverlayProps) {
  return createPortal(
    <div
      className="
        fixed inset-0 z-[999999]
        overflow-y-auto
        bg-black/70
        backdrop-blur-md
      "
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="
          flex
          min-h-full
          items-start
          justify-center
          p-4
          pt-24
          pb-10
        "
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

// ─── Custom Select ────────────────────────────────────────────────────────────

interface SelectOption {
  value: string;
  label: string;
  sub?: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function CustomSelect({ options, value, onChange, placeholder }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white transition hover:border-white/20 focus:border-emerald-500/50 focus:outline-none"
      >
        <span className={selected ? "text-white" : "text-white/30"}>
          {selected ? selected.label : placeholder ?? "Seleccionar..."}
        </span>
        <svg
          className={`shrink-0 text-white/30 transition-transform ${open ? "rotate-180" : ""}`}
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d1117] shadow-xl">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`flex w-full flex-col px-3 py-2.5 text-left transition hover:bg-white/[0.05] ${value === opt.value ? "bg-emerald-500/10" : ""}`}
            >
              <span className={`text-sm font-medium ${value === opt.value ? "text-emerald-400" : "text-white"}`}>
                {opt.label}
              </span>
              {opt.sub && (
                <span className="text-xs text-white/35">{opt.sub}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

const inputCls =
  "h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/20 focus:border-emerald-500/50 focus:outline-none transition";

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

// ─── Close button ─────────────────────────────────────────────────────────────

function CloseBtn({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white/40 hover:bg-white/[0.06] hover:text-white"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

// ─── ItemDetailModal ──────────────────────────────────────────────────────────

interface ItemDetailModalProps {
  item: InventoryItem | null;
  onClose: () => void;
  onEdit?: () => void;
}

export function ItemDetailModal({ item, onClose, onEdit }: ItemDetailModalProps) {
  if (!item) return null;

  const isCritical = item.stock === 0;
  const isLow = item.stock <= item.minStock;
  const statusLabel = isCritical ? "Sin stock" : isLow ? "Stock bajo" : "Disponible";
  const accentColor = isCritical ? "bg-rose-500" : isLow ? "bg-amber-400" : "bg-emerald-500";
  const statusColor = isCritical
    ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
    : isLow
    ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
    : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  const stockPct = Math.min(100, Math.round((item.stock / Math.max((item.minStock ?? 0) * 2, item.stock, 1)) * 100));

  return (
    <Overlay onClose={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1117] shadow-2xl">
        <div className={`h-0.5 w-full ${accentColor}`} />
        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-5">
          <div>
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
              {statusLabel}
            </span>
            <h2 className="mt-2 text-base font-bold text-white">{item.name}</h2>
          </div>
          <CloseBtn onClose={onClose} />
        </div>

        <div className="mx-6 mb-4 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Stock actual</p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-3xl font-black tabular-nums text-white">{item.stock}</span>
                <span className="text-sm text-white/40">{item.unit}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Mínimo</p>
              <p className="mt-1 text-sm font-bold text-white/50">{item.minStock} {item.unit}</p>
            </div>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={`h-full rounded-full ${isCritical ? "bg-rose-500" : isLow ? "bg-amber-400" : "bg-emerald-500"}`}
              style={{ width: `${stockPct}%` }}
            />
          </div>
        </div>

        <div className="mx-6 mb-4 divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.06]">
          {[
            { label: "Código", value: item.code, mono: true },
            { label: "Categoría", value: item.category ?? "—" },
            { label: "Unidad", value: item.unit ?? "—" },
            { label: "Ubicación", value: item.location ?? "—" },
          ].map(({ label, value, mono }) => (
            <div key={label} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-white/40">{label}</span>
              <span className={`text-xs font-semibold ${mono ? "font-mono text-emerald-400" : "text-white/80"}`}>{value}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3 border-t border-white/[0.06] px-6 py-4">
          <button onClick={onClose} className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm font-semibold text-white/50 transition hover:bg-white/[0.05] hover:text-white">
            Cerrar
          </button>
          {onEdit && (
            <button onClick={() => { onEdit(); onClose(); }} className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-black transition hover:bg-emerald-400 active:scale-95">
              Editar repuesto
            </button>
          )}
        </div>
      </div>
    </Overlay>
  );
}

// ─── OilChangeModal ───────────────────────────────────────────────────────────

interface OilChangeForm {
  assetId: string;
  oilTypeId: string;
  date: string;
  reading: string;
  nextReading: string;
  quantity: string;
  technician: string;
  notes: string;
}

interface OilChangeModalProps {
  oilTypes: OilType[];
  assets: Asset[];
  drivers: ApiDriver[];
  preselectedOil: OilType | null;
  onClose: () => void;
  onSubmit: (form: OilChangeForm) => void;
}

export function OilChangeModal({ oilTypes, assets, drivers, preselectedOil, onClose, onSubmit }: OilChangeModalProps) {
  const [form, setForm] = useState<OilChangeForm>({
    assetId: assets[0]?.id ?? "",
    oilTypeId: preselectedOil?.id ?? oilTypes[0]?.id ?? "",
    date: new Date().toISOString().slice(0, 10),
    reading: "",
    nextReading: "",
    quantity: "",
    technician: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof OilChangeForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const selectedOil = oilTypes.find((o) => o.id === form.oilTypeId);
  const isValid = form.assetId && form.oilTypeId && form.date && form.reading && form.quantity;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    await onSubmit(form);
    setSaving(false);
  };

  const assetOptions: SelectOption[] = assets.map((a) => ({
    value: a.id,
    label: `${a.code} — ${a.name}`,
  }));

  const oilOptions: SelectOption[] = oilTypes.map((o) => ({
    value: o.id,
    label: o.name,
    sub: o.viscosity ?? undefined,
  }));

  const driverOptions: SelectOption[] = [
    { value: "", label: "Sin asignar" },
    ...drivers
      .filter((d) => d.status === "Activo")
      .map((d) => ({
        value: d.name,
        label: d.name,
        sub: d.code,
      })),
  ];

  return (
    <Overlay onClose={onClose}>
      <div className="mt-16 w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1117] shadow-2xl">
        <div className="h-0.5 w-full bg-emerald-500" />

        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 pb-4 pt-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Lubricación</p>
            <h2 className="mt-0.5 text-base font-bold text-white">
              {preselectedOil ? `Cambio — ${preselectedOil.name}` : "Nuevo cambio de aceite"}
            </h2>
          </div>
          <CloseBtn onClose={onClose} />
        </div>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-6 py-5">
          <Field label="Activo / Vehículo" required>
            <CustomSelect
              options={assetOptions}
              value={form.assetId}
              onChange={(v) => set("assetId", v)}
              placeholder="Seleccionar activo..."
            />
          </Field>

          <Field label="Tipo de aceite" required>
            <CustomSelect
              options={oilOptions}
              value={form.oilTypeId}
              onChange={(v) => set("oilTypeId", v)}
              placeholder="Seleccionar aceite..."
            />
            {selectedOil && (
              <p className="text-[10px] text-white/30">
                Stock disponible: <span className="font-bold text-emerald-400">{selectedOil.stock} {selectedOil.unit}</span>
              </p>
            )}
          </Field>

          <Field label="Fecha" required>
            <DatePicker
              value={form.date}
              onChange={(v) => set("date", v)}
              placeholder="Seleccionar"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Lectura km" required>
              <input className={inputCls} type="number" placeholder="45200" value={form.reading} onChange={(e) => set("reading", e.target.value)} />
            </Field>
            <Field label="Próxima">
              <input className={inputCls} type="number" placeholder="50200" value={form.nextReading} onChange={(e) => set("nextReading", e.target.value)} />
            </Field>
            <Field label={`Cantidad (${selectedOil?.unit ?? "un"})`} required>
              <input className={inputCls} type="number" placeholder="4" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
            </Field>
          </div>

          <Field label="Técnico responsable">
            <CustomSelect
              options={driverOptions}
              value={form.technician}
              onChange={(v) => set("technician", v)}
              placeholder="Seleccionar técnico..."
            />
          </Field>

          <Field label="Notas">
            <textarea
              rows={3}
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:border-emerald-500/50 focus:outline-none transition"
              placeholder="Observaciones del servicio..."
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </div>

        <div className="flex gap-3 border-t border-white/[0.06] px-6 py-4">
          <button onClick={onClose} className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm font-semibold text-white/50 transition hover:bg-white/[0.05] hover:text-white">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !isValid}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-black transition hover:bg-emerald-400 active:scale-95 disabled:opacity-40"
          >
            {saving ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Guardando...
              </>
            ) : "Registrar cambio"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}