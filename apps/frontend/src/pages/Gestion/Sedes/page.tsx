"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useSites, type EnrichedOperationalSite, type SiteLinkedAsset, type SiteLinkedDriver } from "@/hooks/useSites";
import { usePermissions } from "@/hooks/usePermissions";
import { LocationPickerModal } from "@/components/ui/map/LocationPicker";
import { RowActionMenu } from "@/components/ui/table/RowActionMenu";
import type { OperationalSite, SiteStatus } from "@/types/fleet";

// ─── Types ────────────────────────────────────────────────────────────────────

type SiteFormState = Omit<OperationalSite, "id" | "tenantId"> & {
  latitude?: number;
  longitude?: number;
};

type SiteFormErrors = Partial<Record<keyof Omit<SiteFormState, "latitude" | "longitude">, string>>;

// EnrichedSite ahora usa directamente los datos que vienen del backend
type EnrichedSite = EnrichedOperationalSite & {
  references: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createEmptyForm(): SiteFormState {
  return {
    code: "",
    name: "",
    city: "",
    address: "",
    latitude: undefined,
    longitude: undefined,
    contact: "",
    status: "Activa",
    notes: "",
  };
}

function validateSite(form: SiteFormState): SiteFormErrors {
  const errors: SiteFormErrors = {};
  if (!form.code.trim())    errors.code    = "El código de sede es obligatorio.";
  else if (form.code.length > 40) errors.code = "Máximo 40 caracteres.";
  if (!form.name.trim())    errors.name    = "El nombre de la sede es obligatorio.";
  else if (form.name.length > 120) errors.name = "Máximo 120 caracteres.";
  if (!form.city.trim())    errors.city    = "La ciudad es obligatoria.";
  else if (form.city.length > 100) errors.city = "Máximo 100 caracteres.";
  if (!form.address.trim()) errors.address = "La dirección es obligatoria.";
  else if (form.address.length < 5) errors.address = "Mínimo 5 caracteres.";
  else if (form.address.length > 250) errors.address = "Máximo 250 caracteres.";
  if (!form.contact.trim()) errors.contact = "El contacto es obligatorio.";
  else if (!/^\d{10}$/.test(form.contact)) errors.contact = "El contacto debe tener exactamente 10 dígitos.";
  if (form.notes && form.notes.length > 2000) errors.notes = "Máximo 2000 caracteres.";
  return errors;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent: "blue" | "green" | "yellow" | "gray";
}) {
  const dot: Record<typeof accent, string> = {
    blue:   "bg-blue-500",
    green:  "bg-green-500",
    yellow: "bg-yellow-400",
    gray:   "bg-gray-400 dark:bg-gray-500",
  };
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <span className={`h-2 w-2 rounded-full ${dot[accent]}`} />
        <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-800 dark:text-white">{value}</p>
      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{detail}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: SiteStatus }) {
  return status === "Activa" ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      Activa
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 dark:bg-yellow-500/10 px-2.5 py-1 text-xs font-medium text-yellow-700 dark:text-yellow-400">
      <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
      Inactiva
    </span>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.04] px-3 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 dark:focus:border-blue-400 transition";

// ─── Three-dot menu ───────────────────────────────────────────────────────────

function RowMenu({
  site,
  hasPermission,
  onDetail,
  onEdit,
  onToggle,
}: {
  site: EnrichedSite;
  hasPermission: boolean;
  onDetail: () => void;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const isActive = site.status === "Activa";
  return (
    <RowActionMenu
      ariaLabel="Acciones de la sede"
      items={[
        { label: "Ver detalle",                         onClick: onDetail, tone: "default" },
        { label: "Editar",                              onClick: onEdit,   tone: "default", disabled: !hasPermission },
        { label: isActive ? "Inactivar" : "Reactivar",  onClick: onToggle, tone: isActive ? "warning" : "success", disabled: !hasPermission },
      ]}
    />
  );
}

// ─── Site Form Modal ──────────────────────────────────────────────────────────

function SiteFormModal({
  open,
  site,
  onClose,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  site: OperationalSite | null;
  onClose: () => void;
  onCreate: (form: SiteFormState) => Promise<void>;
  onUpdate: (id: string, form: SiteFormState) => Promise<void>;
}) {
  const [form, setForm] = useState<SiteFormState>(() =>
    site
      ? {
          code: site.code,
          name: site.name,
          city: site.city,
          address: site.address,
          latitude: (site as any).latitude,
          longitude: (site as any).longitude,
          contact: site.contact,
          status: site.status,
          notes: site.notes,
        }
      : createEmptyForm()
  );
  const [errors, setErrors] = useState<SiteFormErrors>({});
  const [saving, setSaving] = useState(false);

  // Sync when site changes (edit vs create)
  useEffect(() => {
    if (open) {
      setForm(
        site
          ? {
              code: site.code,
              name: site.name,
              city: site.city,
              address: site.address,
              latitude: (site as any).latitude,
              longitude: (site as any).longitude,
              contact: site.contact,
              status: site.status,
              notes: site.notes,
            }
          : createEmptyForm()
      );
      setErrors({});
    }
  }, [open, site]);

  const field = (key: keyof Omit<SiteFormState, "latitude" | "longitude">) => ({
    value: form[key] as string,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => setForm((prev) => ({ ...prev, [key]: e.target.value })),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors = validateSite(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error("Formulario incompleto", {
        description: "Completa todos los campos obligatorios.",
      });
      return;
    }

    setSaving(true);
    try {
      if (site) {
        await onUpdate(site.id, form);
        toast.success("Sede actualizada", {
          description: "El catálogo operativo ya refleja el cambio.",
        });
      } else {
        await onCreate(form);
        toast.success("Sede creada", {
          description: "La sede ya está disponible en formularios.",
        });
      }
      onClose();
    } catch {
      toast.error("Error al guardar", { description: "No se pudo completar la operación." });
    } finally {
      setSaving(false);
    }
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
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2"
          >
            <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-white/[0.06]">
                <div>
                  <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                    {site ? "Editar sede" : "Nueva sede"}
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                    Base visible para usuarios, flotas y conductores.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 3l10 10M13 3L3 13" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="px-4 py-5 sm:px-6 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Código" error={errors.code}>
                    <input
                      className={inputCls}
                      placeholder="SEDE-001"
                      maxLength={40}
                      value={form.code}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase().slice(0, 40) }))
                      }
                    />
                  </FormField>
                  <FormField label="Estado">
                    <select className={inputCls} {...field("status")}>
                      <option value="Activa">Activa</option>
                      <option value="Inactiva">Inactiva</option>
                    </select>
                  </FormField>
                </div>

                <FormField label="Nombre de sede" error={errors.name}>
                  <input
                    className={inputCls}
                    placeholder="Nombre de la sede principal"
                    maxLength={120}
                    {...field("name")}
                  />
                </FormField>

                <FormField label="Ciudad / Localidad" error={errors.city}>
                  <input
                    className={inputCls}
                    placeholder="Ciudad, municipio o zona operativa"
                    maxLength={100}
                    {...field("city")}
                  />
                </FormField>

                <FormField label="Dirección" error={errors.address}>
                  <LocationPickerModal
                    value={form.address}
                    onChange={(result) =>
                      setForm((prev) => ({
                        ...prev,
                        address: String(result.address ?? '').slice(0, 250),
                        latitude: result.latitude || undefined,
                        longitude: result.longitude || undefined,
                      }))
                    }
                    placeholder="Busca o fija la dirección en el mapa…"
                  />
                </FormField>

                <FormField label="Contacto (10 dígitos)" error={errors.contact}>
                  <input
                    className={inputCls}
                    placeholder="0990000000"
                    maxLength={10}
                    value={form.contact}
                    onKeyDown={(e) => { if (!/[0-9]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'].includes(e.key)) e.preventDefault(); }}
                    onChange={(e) => setForm((prev) => ({ ...prev, contact: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  />
                </FormField>

                <FormField label="Notas" error={errors.notes}>
                  <textarea
                    className={`${inputCls} resize-none`}
                    rows={3}
                    maxLength={2000}
                    placeholder="Cobertura, tipo de operación o consideraciones para esta sede."
                    {...field("notes")}
                  />
                </FormField>

                <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-gray-200 dark:border-white/[0.06] px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-4 py-2 text-sm font-medium text-white transition"
                  >
                    {saving ? "Guardando…" : site ? "Guardar cambios" : "Crear sede"}
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

// ─── Site Detail Drawer ───────────────────────────────────────────────────────
// FIX: ahora recibe el EnrichedSite directamente y usa site.assets / site.drivers
// que el backend ya resolvió — no filtra desde hooks globales.

function SiteDetailDrawer({
  site,
  hasPermission,
  onClose,
  onEdit,
  onToggleStatus,
}: {
  site: EnrichedSite | null;
  hasPermission: boolean;
  onClose: () => void;
  onEdit: (site: EnrichedSite) => void;
  onToggleStatus: (site: EnrichedSite) => void;
}) {
  const [hoveredAsset,  setHoveredAsset]  = useState<string | null>(null);
  const [hoveredDriver, setHoveredDriver] = useState<string | null>(null);

  // ✅ FIX: usar los arrays que ya vienen resueltos desde el backend
  const linkedAssets  = site?.assets  ?? [];
  const linkedDrivers = site?.drivers ?? [];

  return (
    <AnimatePresence>
      {site && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-start justify-between px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">{site.code}</p>
                  <h2 className="text-base font-semibold text-gray-800 dark:text-white leading-tight">{site.name}</h2>
                </div>
              </div>
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 3l10 10M13 3L3 13"/>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 space-y-6">
              {/* Status */}
              <div className="flex items-center justify-between">
                <StatusBadge status={site.status} />
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {linkedAssets.length + linkedDrivers.length} referencias
                </span>
              </div>

              {/* Info */}
              <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] divide-y divide-gray-200 dark:divide-white/[0.06]">
                {[
                  { label: "Ciudad",    value: site.city },
                  { label: "Dirección", value: site.address },
                  { label: "Contacto",  value: site.contact },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-start gap-3 px-4 py-3">
                    <span className="w-20 shrink-0 text-xs font-medium text-gray-400 dark:text-gray-500 pt-0.5">{label}</span>
                    <span className="text-sm text-gray-800 dark:text-white">{value || "—"}</span>
                  </div>
                ))}
                {site.notes && (
                  <div className="flex items-start gap-3 px-4 py-3">
                    <span className="w-20 shrink-0 text-xs font-medium text-gray-400 dark:text-gray-500 pt-0.5">Notas</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400 italic">{site.notes}</span>
                  </div>
                )}
              </div>

              {/* Mapa de recursos */}
              <div>
                <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">Mapa de recursos</p>

                {linkedAssets.length === 0 && linkedDrivers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/[0.06] px-4 py-6 text-center text-xs text-gray-400">
                    Sin vehículos ni conductores vinculados a esta sede.
                  </div>
                ) : (
                  <div className="relative overflow-y-auto max-h-72 pr-1">
                    {/* Sede — nodo raíz */}
                    <div className="flex justify-center mb-6">
                      <div className="flex items-center gap-2 rounded-xl border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-4 py-2.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600 dark:text-blue-400">
                          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                        </svg>
                        <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">{site.name}</span>
                      </div>
                    </div>

                    <div className="absolute left-1/2 top-[52px] -translate-x-px w-px bg-gray-200 dark:bg-white/[0.08]" style={{ height: "28px" }} />

                    {linkedAssets.length > 0 && linkedDrivers.length > 0 && (
                      <div className="absolute top-[80px] left-1/4 right-1/4 h-px bg-gray-200 dark:bg-white/[0.08]" />
                    )}

                    <div className={`grid gap-6 mt-10 ${linkedAssets.length > 0 && linkedDrivers.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>

                      {/* Columna vehículos */}
                      {linkedAssets.length > 0 && (
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-px h-5 bg-gray-200 dark:bg-white/[0.08]" />
                          <div className="flex items-center gap-1.5 rounded-lg border border-sky-200 dark:border-sky-500/20 bg-sky-50 dark:bg-sky-500/10 px-3 py-1.5 mb-1">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-600 dark:text-sky-400">
                              <rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                            </svg>
                            <span className="text-[11px] font-bold text-sky-700 dark:text-sky-300 uppercase tracking-wide">Vehículos ({linkedAssets.length})</span>
                          </div>

                          <div className="flex flex-col items-center gap-1.5 w-full">
                            {linkedAssets.map((asset) => (
                              <div key={asset.id} className="flex flex-col items-center w-full">
                                <div className="w-px h-3 bg-gray-200 dark:bg-white/[0.08]" />
                                <div
                                  className="relative w-full"
                                  onMouseEnter={() => setHoveredAsset(asset.id)}
                                  onMouseLeave={() => setHoveredAsset(null)}
                                >
                                  <div className={`rounded-xl border px-3 py-2 text-center transition-all cursor-default ${
                                    hoveredAsset === asset.id
                                      ? "border-sky-300 dark:border-sky-500/40 bg-sky-50 dark:bg-sky-500/10"
                                      : "border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03]"
                                  }`}>
                                    <p className="text-xs font-bold text-gray-800 dark:text-white truncate">{asset.plate || asset.name}</p>
                                    <p className="text-[10px] text-gray-400 truncate">{asset.brand} {asset.model}</p>
                                  </div>

                                  {hoveredAsset === asset.id && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 w-44 rounded-xl border border-sky-200 dark:border-sky-500/20 bg-white dark:bg-gray-900 shadow-lg px-3 py-2.5">
                                      <p className="text-[10px] font-bold uppercase tracking-widest text-sky-500 mb-1">Vehículo</p>
                                      <p className="text-xs font-semibold text-gray-800 dark:text-white">{asset.plate || "Sin placa"}</p>
                                      {asset.brand && <p className="text-[11px] text-gray-500">{asset.brand} {asset.model}</p>}
                                      <div className={`mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                        asset.status === "Operativo"
                                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                                          : asset.status === "En mantenimiento"
                                          ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                                          : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"
                                      }`}>
                                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                        {asset.status}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Columna conductores */}
                      {linkedDrivers.length > 0 && (
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-px h-5 bg-gray-200 dark:bg-white/[0.08]" />
                          <div className="flex items-center gap-1.5 rounded-lg border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/10 px-3 py-1.5 mb-1">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-600 dark:text-violet-400">
                              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                            </svg>
                            <span className="text-[11px] font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wide">Conductores ({linkedDrivers.length})</span>
                          </div>

                          <div className="flex flex-col items-center gap-1.5 w-full">
                            {linkedDrivers.map((driver) => (
                              <div key={driver.id} className="flex flex-col items-center w-full">
                                <div className="w-px h-3 bg-gray-200 dark:bg-white/[0.08]" />
                                <div
                                  className="relative w-full"
                                  onMouseEnter={() => setHoveredDriver(driver.id)}
                                  onMouseLeave={() => setHoveredDriver(null)}
                                >
                                  <div className={`rounded-xl border px-3 py-2 text-center transition-all cursor-default ${
                                    hoveredDriver === driver.id
                                      ? "border-violet-300 dark:border-violet-500/40 bg-violet-50 dark:bg-violet-500/10"
                                      : "border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03]"
                                  }`}>
                                    <p className="text-xs font-bold text-gray-800 dark:text-white truncate">{driver.firstName} {driver.lastName}</p>
                                    <p className="text-[10px] text-gray-400">Lic. {driver.licenseType || "—"}</p>
                                  </div>

                                  {hoveredDriver === driver.id && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 w-44 rounded-xl border border-violet-200 dark:border-violet-500/20 bg-white dark:bg-gray-900 shadow-lg px-3 py-2.5">
                                      <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500 mb-1">Conductor</p>
                                      <p className="text-xs font-semibold text-gray-800 dark:text-white">{driver.firstName} {driver.lastName}</p>
                                      {driver.licenseType && <p className="text-[11px] text-gray-500">Licencia tipo {driver.licenseType}</p>}
                                      <div className={`mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                        driver.status === "Activo"
                                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                                          : "bg-gray-100 text-gray-500 dark:bg-white/[0.05] dark:text-gray-400"
                                      }`}>
                                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                        {driver.status}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            {hasPermission && (
              <div className="flex flex-col-reverse gap-2 px-4 py-4 sm:flex-row sm:px-6 border-t border-gray-200 dark:border-white/[0.06]">
                <button onClick={() => onEdit(site)}
                  className="flex-1 rounded-lg border border-gray-200 dark:border-white/[0.06] px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition">
                  Editar sede
                </button>
                <button onClick={() => onToggleStatus(site)}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
                    site.status === "Activa"
                      ? "bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-100 border border-yellow-200 dark:border-yellow-500/20"
                      : "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-100 border border-green-200 dark:border-green-500/20"
                  }`}>
                  {site.status === "Activa" ? "Inactivar" : "Reactivar"}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SitesManagementPage() {
  // ✅ FIX: eliminados useAssets() y useDrivers() — toda la info viene de useSites()
  const { sites, loading, createSite, updateSite } = useSites();
  const { can } = usePermissions();

  const [query,       setQuery]       = useState("");
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editingSite, setEditingSite] = useState<OperationalSite | null>(null);
  const [detailSite,  setDetailSite]  = useState<EnrichedSite | null>(null);

  // ✅ FIX: usamos assetCount/driverCount que ya vienen del backend en cada site
  const rows = useMemo<EnrichedSite[]>(() => {
    return sites
      .map((site) => ({
        ...site,
        references: site.assetCount + site.driverCount,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sites]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (s) =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.contact.toLowerCase().includes(q),
    );
  }, [query, rows]);

  const openCreate = () => { setEditingSite(null); setModalOpen(true); };
  const openEdit   = (site: OperationalSite) => { setEditingSite(site); setModalOpen(true); setDetailSite(null); };

  const handleToggleStatus = async (site: EnrichedSite) => {
    const next: SiteStatus = site.status === "Activa" ? "Inactiva" : "Activa";
    try {
      await updateSite(site.id, { ...site, status: next });
      toast.success(next === "Activa" ? "Sede reactivada" : "Sede inactivada", {
        description: "El catálogo ya refleja el nuevo estado operativo.",
      });
      setDetailSite((prev) => (prev?.id === site.id ? { ...prev, status: next } : prev));
    } catch {
      toast.error("Error al cambiar estado");
    }
  };

  if (loading) {
    return (
      <div className="space-y-5 p-4 sm:p-6">
        <div className="h-8 w-48 rounded-lg bg-gray-200 dark:bg-white/[0.06] animate-pulse" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-200 dark:bg-white/[0.06] animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-gray-200 dark:bg-white/[0.06] animate-pulse" />
      </div>
    );
  }

  const totalActive   = sites.filter((s) => s.status === "Activa").length;
  const totalInactive = sites.filter((s) => s.status === "Inactiva").length;
  const totalRefs     = rows.reduce((acc, s) => acc + s.references, 0);

  return (
    <>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Sedes</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Sedes</h1>
            <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
              Catálogo operativo real para crear, revisar e inactivar sedes.
            </p>
          </div>
          {can("gestion", "sedes", "crear") && (
            <button
              onClick={openCreate}
              className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M7 1v12M1 7h12" />
              </svg>
              Nueva sede
            </button>
          )}
        </div>

        {/* KPI row */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total sedes"  value={String(sites.length)}   detail="Catálogo actual"                accent="blue"   />
          <KpiCard label="Activas"      value={String(totalActive)}    detail="Disponibles en formularios"    accent="green"  />
          <KpiCard label="Inactivas"    value={String(totalInactive)}  detail="Fuera de alta nueva"           accent="yellow" />
          <KpiCard label="Referencias"  value={String(totalRefs)}      detail="Flota y conductores vinculados" accent="gray"  />
        </div>

        {/* Table card */}
        <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.06]">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Catálogo de sedes</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Vista compacta con dirección, contacto y referencias operativas.
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              >
                <circle cx="6.5" cy="6.5" r="4.5" />
                <path d="M10.5 10.5l3.5 3.5" />
              </svg>
              <input
                className="w-full rounded-lg border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.04] pl-9 pr-4 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition"
                placeholder="Buscar por código, sede, ciudad…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-400">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-800 dark:text-white">Sin sedes</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {query ? "No hay resultados para esa búsqueda." : "Todavía no hay sedes registradas."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-white/[0.06]">
                    {["Código", "Sede", "Contacto", "Estado", "Referencias", ""].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                  {filtered.map((site) => (
                    <tr
                      key={site.id}
                      className="group hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs font-semibold text-gray-800 dark:text-white bg-gray-100 dark:bg-white/[0.06] rounded px-1.5 py-0.5">
                          {site.code}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-800 dark:text-white">{site.name}</p>
                        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                          {site.city} · {site.address}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">{site.contact}</td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={site.status} />
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{site.references}</p>
                        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                          {site.assetCount} flota · {site.driverCount} conductores
                        </p>
                      </td>
                      <td className="group-hover:bg-gray-50/80 dark:group-hover:bg-white/[0.02] px-5 py-3.5">
                        <RowMenu
                          site={site}
                          hasPermission={can("gestion", "sedes", "editar")}
                          onDetail={() => setDetailSite(site)}
                          onEdit={() => openEdit(site)}
                          onToggle={() => handleToggleStatus(site)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!can("gestion", "sedes", "crear") && !can("gestion", "sedes", "editar") && (
          <div className="rounded-xl border border-yellow-200 dark:border-yellow-500/20 bg-yellow-50 dark:bg-yellow-500/10 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
            Solo perfiles administradores pueden crear o editar sedes.
          </div>
        )}
      </div>

      {/* Modals & Drawers */}
      <SiteFormModal
        open={modalOpen}
        site={editingSite}
        onClose={() => setModalOpen(false)}
        onCreate={async (form) => { await createSite(form); }}
        onUpdate={async (id, form) => { await updateSite(id, form); }}
      />

      {/* ✅ FIX: SiteDetailDrawer ya no recibe assets/drivers externos */}
      <SiteDetailDrawer
        site={detailSite}
        hasPermission={can("gestion", "sedes", "editar")}
        onClose={() => setDetailSite(null)}
        onEdit={(s) => openEdit(s)}
        onToggleStatus={handleToggleStatus}
      />
    </>
  );
}