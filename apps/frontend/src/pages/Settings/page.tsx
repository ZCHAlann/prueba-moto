"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/hooks/useSettings";
import { useSettingsFormOptions } from "../../hooks/useFormOptions";
import type { CompanySettings } from "@/types/fleet";
import { AISettingsPanel } from "./AISettingsPanel";

// ─── Iconos inline ────────────────────────────────────────────────────────────

function IconBuilding({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M9 21V9h6v12" />
    </svg>
  );
}
function IconWrench({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
function IconGrid({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function IconBell({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}
function IconSparkles({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3zM19 14l.95 2.3 2.3.95-2.3.95L19 20.5l-.95-2.3-2.3-.95 2.3-.95L19 14zM5 16l.7 1.7L7.4 18.4l-1.7.7L5 20.8l-.7-1.7-1.7-.7 1.7-.7L5 16z" />
    </svg>
  );
  );
}
function IconLoader({ className }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
    </svg>
  );
}
function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconChevron({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Componentes base ─────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.05] ${className}`} />;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  disabled?: boolean;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        className={`
          w-full rounded-xl border bg-white dark:bg-white/[0.03] px-4 py-2.5 text-sm
          text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600
          transition-all outline-none
          border-gray-200 dark:border-white/[0.06]
          focus:border-brand-400 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
      />
      {hint && <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-4 py-2.5 text-sm text-gray-800 dark:text-white outline-none focus:border-brand-400 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
  );
}

function SectionCard({
  icon,
  title,
  description,
  children,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-6 space-y-5"
    >
      <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-white/[0.04]">
        <div className="w-8 h-8 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-white">{title}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{description}</p>
        </div>
      </div>
      {children}
    </motion.div>
  );
}

function SaveButton({ loading, label = "Guardar cambios" }: { loading: boolean; label?: string }) {
  return (
    <div className="flex justify-end pt-2">
      <button
        type="submit"
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-60"
      >
        {loading ? <IconLoader className="w-4 h-4" /> : <IconCheck className="w-4 h-4" />}
        {loading ? "Guardando..." : label}
      </button>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "brand" | "success" | "warning" | "danger";
}) {
  const tones = {
    brand:   "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 border-brand-100 dark:border-brand-500/20",
    success: "bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-400 border-success-100 dark:border-success-500/20",
    warning: "bg-warning-50 dark:bg-warning-500/10 text-warning-700 dark:text-warning-400 border-warning-100 dark:border-warning-500/20",
    danger:  "bg-error-50 dark:bg-error-500/10 text-error-700 dark:text-error-400 border-error-100 dark:border-error-500/20",
  };

  return (
    <div className={`rounded-2xl border px-5 py-4 space-y-1 ${tones[tone]}`}>
      <p className="text-xs font-semibold tracking-widest uppercase opacity-70">{label}</p>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-xs opacity-60">{detail}</p>
    </div>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${
        enabled ? "bg-brand-500" : "bg-gray-200 dark:bg-white/[0.1]"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          enabled ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

const boolOptions = [
  { value: "true",  label: "Sí" },
  { value: "false", label: "No" },
];

export function SettingsPage() {
  const { session } = useAuth();

  const { settings, loading: loadingSettings, updateSettings } = useSettings();
  const { data: settingsOptions } = useSettingsFormOptions();
  const sitesCount   = settingsOptions?.sitesCount   ?? 0;
  const assetsCount  = settingsOptions?.assetsCount  ?? 0;
  const driversCount = settingsOptions?.driversCount ?? 0;

  const [form, setForm]           = useState<CompanySettings | null>(null);
  const [savingOp,  setSavingOp]  = useState(false);

  // Sincronizar form cuando carga settings
  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  function setField<K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) {
    setForm((f) => f ? { ...f, [key]: value } : f);
  }

  // ── Guardar configuración operativa ────────────────────────────────────────

  async function handleSaveOperational(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSavingOp(true);
    const ok = await updateSettings({
      maintenanceLeadTimeDays : form.maintenanceLeadTimeDays,
      checklistRequired       : form.checklistRequired,
      fuelCurrency            : form.fuelCurrency,
      alertEmail              : form.alertEmail,
    });
    setSavingOp(false);
    if (ok) toast.success("Configuración operativa guardada.");
    else    toast.error("No se pudo guardar la configuración.");
  }

  // ── Skeleton ───────────────────────────────────────────────────────────────

  if (loadingSettings || !form) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="space-y-2">
          <Skeleton className="w-20 h-5" />
          <Skeleton className="w-56 h-8" />
          <Skeleton className="w-80 h-4" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const companyName = session?.companyName ?? "—";
  const companyCode = companyName.slice(0, 3).toUpperCase();

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-1"
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-lg bg-brand-50 dark:bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:text-brand-400 tracking-wide">
            Cuenta
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white tracking-tight">
          Configuración del sistema
        </h1>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Parámetros operativos, notificaciones y estructura de la empresa activa.
        </p>
      </motion.div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
      >
        <KpiCard label="Empresa activa" value={companyCode}                                           detail={companyName}                              tone="brand"   />
        <KpiCard label="Sedes"          value={String(sitesCount)}                                    detail="Catálogo de sedes"                        tone="success" />
        <KpiCard label="Lead time"      value={`${form.maintenanceLeadTimeDays}d`}                    detail="Días antes del mantenimiento"             tone="warning" />
        <KpiCard label="Checklist"      value={form.checklistRequired ? "Obligatorio" : "Opcional"}  detail="Requerido en operación"                   tone="danger"  />
      </motion.div>

      {/* ── Grid principal ─────────────────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-2">

        {/* ── Operación y notificaciones ─────────────────────────────────── */}
        <SectionCard
          icon={<IconWrench className="w-4 h-4 text-brand-600 dark:text-brand-400" />}
          title="Operación y notificaciones"
          description="Parámetros base de mantenimiento, checklist y alertas"
          delay={0.1}
        >
          <form onSubmit={handleSaveOperational} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Lead time mantenimiento (días)"
                type="number"
                value={form.maintenanceLeadTimeDays === 0 ? "" : String(form.maintenanceLeadTimeDays)}
                onChange={(v) => setField("maintenanceLeadTimeDays", v === "" ? 0 : Number(v))}
              />
              <Field
                label="Moneda combustible"
                value={form.fuelCurrency}
                onChange={(v) => setField("fuelCurrency", v)}
                placeholder="USD"
              />
            </div>
            <Field
              label="Correo de alertas"
              type="email"
              value={form.alertEmail}
              onChange={(v) => setField("alertEmail", v)}
              placeholder="alertas@empresa.com"
            />

            {/* Checklist toggle */}
            <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-white/[0.06] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Checklist obligatorio</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Requerido antes de cada operación</p>
              </div>
              <Toggle
                enabled={form.checklistRequired}
                onChange={(v) => setField("checklistRequired", v)}
              />
            </div>

            <SaveButton loading={savingOp} label="Guardar configuración" />
          </form>
        </SectionCard>

        {/* ── Estructura operativa ───────────────────────────────────────── */}
        <SectionCard
          icon={<IconGrid className="w-4 h-4 text-brand-600 dark:text-brand-400" />}
          title="Estructura operativa"
          description="Sedes, activos y conductores registrados en la empresa"
          delay={0.15}
        >
          <div className="space-y-3">
            {/* Stats grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: "Sedes",       value: sitesCount,   href: "/gestion/sedes" },
                { label: "Activos",     value: assetsCount,  href: "/flotas" },
                { label: "Conductores", value: driversCount, href: "/conductores" },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="group rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-4 py-3 hover:border-brand-300 dark:hover:border-brand-500/40 transition-all"
                >
                  <p className="text-2xl font-bold text-gray-800 dark:text-white">{item.value}</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-400 dark:text-gray-500">{item.label}</p>
                    <IconChevron className="w-3 h-3 text-gray-300 dark:text-gray-600 group-hover:text-brand-400 transition-colors" />
                  </div>
                </a>
              ))}
            </div>

            {/* Alertas configurables */}
            {(form.alertConfigs ?? []).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500 px-1">
                  Alertas configuradas
                </p>
                {(form.alertConfigs ?? []).map((cfg) => (
                  <div
                    key={cfg.id}
                    className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-white/[0.06] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{cfg.id}</p>
                    </div>
                    <Toggle
                      enabled={cfg.enabled}
                      onChange={async () => {
                        const ok = await updateSettings({
                          alertConfigs: (form.alertConfigs ?? []).map((c) =>
                            c.id === cfg.id ? { ...c, enabled: !c.enabled } : c
                          ),
                        });
                        if (!ok) toast.error("No se pudo actualizar la alerta.");
                        else toast.success("Alerta actualizada.");
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* ── Módulos habilitados ─────────────────────────────────────────────── */}
      <SectionCard
        icon={<IconBell className="w-4 h-4 text-brand-600 dark:text-brand-400" />}
        title="Módulos habilitados"
        description="Funcionalidades activas para esta empresa"
        delay={0.2}
      >
        <div className="flex flex-wrap gap-2">
          {(session as any)?.companyModules?.map((key: string) => (
            <span
              key={key}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-100 dark:border-brand-500/20 bg-brand-50 dark:bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-700 dark:text-brand-400"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 dark:bg-brand-500" />
              {key}
            </span>
          )) ?? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Sin módulos configurados.</p>
          )}
        </div>
      </SectionCard>

      {/* ── Asistente IA (jul 2026 v6) ───────────────────────────────────── */}
      <SectionCard
        icon={<IconSparkles className="w-4 h-4 text-brand-600 dark:text-brand-400" />}
        title="Asistente IA"
        description="Configurá tu propio provider, modelo y API key de IA. Si no tocás nada, usamos la configuración global de la plataforma."
        delay={0.25}
      >
        <AISettingsPanel />
      </SectionCard>

    </div>
  );
}