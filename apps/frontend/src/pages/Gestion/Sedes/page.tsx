"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useSites } from "@/hooks/useSites";
import { useAssets } from "@/hooks/useAssets";
import { useDrivers } from "@/hooks/useDrivers";
import { usePermissions } from "@/hooks/usePermissions";
import { LocationPickerModal } from "@/components/ui/map/LocationPicker";
import type { OperationalSite, SiteStatus } from "@/types/fleet";

// ─── Types ────────────────────────────────────────────────────────────────────

// Extended to carry coordinates alongside the address string
type SiteFormState = Omit<OperationalSite, "id" | "tenantId"> & {
  latitude?: number;
  longitude?: number;
};

type SiteFormErrors = Partial<Record<keyof Omit<SiteFormState, "latitude" | "longitude">, string>>;

type EnrichedSite = OperationalSite & {
  assetCount: number;
  driverCount: number;
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
  if (!form.name.trim())    errors.name    = "El nombre de la sede es obligatorio.";
  if (!form.city.trim())    errors.city    = "La ciudad es obligatoria.";
  if (!form.address.trim()) errors.address = "La dirección es obligatoria.";
  if (!form.contact.trim()) errors.contact = "El contacto visible es obligatorio.";
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const item = (label: string, onClick: () => void, danger = false) => (
    <button
      onClick={() => { onClick(); setOpen(false); }}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-left transition
        ${danger
          ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]"}`}
    >
      {label}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-xl p-1"
          >
            {item("Ver detalle", onDetail)}
            {hasPermission && item("Editar", onEdit)}
            {hasPermission && item(
              site.status === "Activa" ? "Inactivar" : "Reactivar",
              onToggle,
              site.status === "Activa",
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2"
          >
            <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-white/[0.06]">
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

              {/* Body */}
              <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Código" error={errors.code}>
                    <input
                      className={inputCls}
                      placeholder="SEDE-001"
                      {...field("code")}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
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
                    {...field("name")}
                  />
                </FormField>

                <FormField label="Ciudad / Localidad" error={errors.city}>
                  <input
                    className={inputCls}
                    placeholder="Ciudad, municipio o zona operativa"
                    {...field("city")}
                  />
                </FormField>

                {/* ── Dirección con selector de mapa ── */}
                <FormField label="Dirección" error={errors.address}>
                  <LocationPickerModal
                    value={form.address}
                    onChange={(result) =>
                      setForm((prev) => ({
                        ...prev,
                        address: result.address,
                        latitude: result.latitude || undefined,
                        longitude: result.longitude || undefined,
                      }))
                    }
                    placeholder="Busca o fija la dirección en el mapa…"
                  />
                </FormField>

                <FormField label="Contacto visible" error={errors.contact}>
                  <input
                    className={inputCls}
                    placeholder="Contacto responsable / teléfono"
                    {...field("contact")}
                  />
                </FormField>

                <FormField label="Notas">
                  <textarea
                    className={`${inputCls} resize-none`}
                    rows={3}
                    placeholder="Cobertura, tipo de operación o consideraciones para esta sede."
                    {...field("notes")}
                  />
                </FormField>

                {/* Footer */}
                <div className="flex justify-end gap-2 pt-1">
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

function SiteDetailDrawer({
  site,
  assets,
  drivers,
  hasPermission,
  onClose,
  onEdit,
  onToggleStatus,
}: {
  site: EnrichedSite | null;
  assets: { id: string; name: string; plate?: string; site: string; status: string }[];
  drivers: { id: string; name: string; site: string; status: string }[];
  hasPermission: boolean;
  onClose: () => void;
  onEdit: (site: EnrichedSite) => void;
  onToggleStatus: (site: EnrichedSite) => void;
}) {
  const linkedAssets  = site ? assets.filter((a) => a.site === site.name) : [];
  const linkedDrivers = site ? drivers.filter((d) => d.site === site.name) : [];

  return (
    <AnimatePresence>
      {site && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-2xl flex flex-col"
          >
            {/* Drawer header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-gray-200 dark:border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">{site.code}</p>
                  <h2 className="text-base font-semibold text-gray-800 dark:text-white leading-tight">{site.name}</h2>
                </div>
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

            {/* Drawer body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Status */}
              <div className="flex items-center justify-between">
                <StatusBadge status={site.status} />
                <span className="text-xs text-gray-400 dark:text-gray-500">{site.references} referencias totales</span>
              </div>

              {/* Info block */}
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
                {/* Google Maps link if coordinates exist */}
                {(site as any).latitude && (site as any).longitude && (
                  <div className="px-4 py-3">
                    <a
                      href={`https://www.google.com/maps?q=${(site as any).latitude},${(site as any).longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                        <circle cx="12" cy="9" r="2.5"/>
                      </svg>
                      Ver en Google Maps
                    </a>
                  </div>
                )}
                {site.notes && (
                  <div className="flex items-start gap-3 px-4 py-3">
                    <span className="w-20 shrink-0 text-xs font-medium text-gray-400 dark:text-gray-500 pt-0.5">Notas</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400 italic">{site.notes}</span>
                  </div>
                )}
              </div>

              {/* Linked assets */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Flota vinculada</h3>
                  <span className="rounded-full bg-gray-100 dark:bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    {linkedAssets.length}
                  </span>
                </div>
                {linkedAssets.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500">Sin vehículos asignados a esta sede.</p>
                ) : (
                  <div className="space-y-1.5">
                    {linkedAssets.slice(0, 8).map((a) => (
                      <div key={a.id} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-3 py-2">
                        <span className="text-sm text-gray-800 dark:text-white font-medium truncate">{a.name}</span>
                        <span className="ml-2 shrink-0 text-xs text-gray-400 dark:text-gray-500">{a.status}</span>
                      </div>
                    ))}
                    {linkedAssets.length > 8 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-1">
                        + {linkedAssets.length - 8} más
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Linked drivers */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Conductores vinculados</h3>
                  <span className="rounded-full bg-gray-100 dark:bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    {linkedDrivers.length}
                  </span>
                </div>
                {linkedDrivers.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500">Sin conductores asignados a esta sede.</p>
                ) : (
                  <div className="space-y-1.5">
                    {linkedDrivers.slice(0, 8).map((d) => (
                      <div key={d.id} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-3 py-2">
                        <span className="text-sm text-gray-800 dark:text-white font-medium truncate">{d.name}</span>
                        <span className="ml-2 shrink-0 text-xs text-gray-400 dark:text-gray-500">{d.status}</span>
                      </div>
                    ))}
                    {linkedDrivers.length > 8 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-1">
                        + {linkedDrivers.length - 8} más
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Drawer footer */}
            {hasPermission && (
              <div className="flex gap-2 px-6 py-4 border-t border-gray-200 dark:border-white/[0.06]">
                <button
                  onClick={() => onEdit(site)}
                  className="flex-1 rounded-lg border border-gray-200 dark:border-white/[0.06] px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition"
                >
                  Editar sede
                </button>
                <button
                  onClick={() => onToggleStatus(site)}
                  className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
                    site.status === "Activa"
                      ? "bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-500/20 border border-yellow-200 dark:border-yellow-500/20"
                      : "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-500/20 border border-green-200 dark:border-green-500/20"
                  }`}
                >
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
  const { sites, loading, createSite, updateSite } = useSites();
  const { assets }   = useAssets();
  const { drivers }  = useDrivers();
  const { can }      = usePermissions();

  const [query,       setQuery]       = useState("");
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editingSite, setEditingSite] = useState<OperationalSite | null>(null);
  const [detailSite,  setDetailSite]  = useState<EnrichedSite | null>(null);

  // Enrich sites with reference counts
  const rows = useMemo<EnrichedSite[]>(() => {
    return sites
      .map((site) => {
        const assetCount  = assets.filter((a) => a.site === site.name).length;
        const driverCount = drivers.filter((d) => d.site === site.name).length;
        return { ...site, assetCount, driverCount, references: assetCount + driverCount };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sites, assets, drivers]);

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
      <div className="space-y-5 p-6">
        <div className="h-8 w-48 rounded-lg bg-gray-200 dark:bg-white/[0.06] animate-pulse" />
        <div className="grid grid-cols-4 gap-3">
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
        {/* ── Page header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Gestión</span>
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

        {/* ── KPI row ── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total sedes"  value={String(sites.length)}   detail="Catálogo actual"                   accent="blue"   />
          <KpiCard label="Activas"      value={String(totalActive)}    detail="Disponibles en formularios"        accent="green"  />
          <KpiCard label="Inactivas"    value={String(totalInactive)}  detail="Fuera de alta nueva"               accent="yellow" />
          <KpiCard label="Referencias"  value={String(totalRefs)}      detail="Flota y conductores vinculados"    accent="gray"   />
        </div>

        {/* ── Table card ── */}
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
                      <th
                        key={h}
                        className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide"
                      >
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
                      <td className="px-5 py-3.5">
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

      {/* ── Modals & Drawers ── */}
      <SiteFormModal
        open={modalOpen}
        site={editingSite}
        onClose={() => setModalOpen(false)}
        onCreate={async (form) => { await createSite(form); }}
        onUpdate={async (id, form) => { await updateSite(id, form); }}
      />

      <SiteDetailDrawer
        site={detailSite}
        assets={assets}
        drivers={drivers}
        hasPermission={can("gestion", "sedes", "editar")}
        onClose={() => setDetailSite(null)}
        onEdit={(s) => openEdit(s)}
        onToggleStatus={handleToggleStatus}
      />
    </>
  );
}