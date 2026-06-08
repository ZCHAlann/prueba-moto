import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid, ShieldCheck, ShieldOff, Search,
  CheckCircle, ChevronDown, Save, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { usePlatformCompanies } from "../../../hooks/usePlatformCompanies";
import { usePlatformPlans }     from "../../../hooks/usePlatformPlans";
import { PlatformKpiCard }      from "../../../components/platform";
import { MODULE_TREE, type ModuleKey } from "../../../lib/module-tree";
import type { PlatformCompany } from "../../../types/platform";

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULE_KEYS = Object.keys(MODULE_TREE) as ModuleKey[];

const MODULE_ICONS: Record<ModuleKey, string> = {
  dashboard:       "📊",
  gestion:         "🚗",
  motores:         "⚙️",
  ac:              "❄️",
  mantenimiento:   "🔧",
  checklist:       "✅",
  alertas:         "🔔",
  reportes:        "📈",
  combustible:     "⛽",
  geolocalizacion: "📍",
  accesos:         "🔐",
};

const MODULE_DESCRIPTIONS: Record<ModuleKey, string> = {
  dashboard:       "Vista general de métricas y estado de la flota",
  gestion:         "Flotas, conductores, sedes, garajes, asignaciones y seguros",
  motores:         "Gestión de motores, mantenimientos e historial",
  ac:              "Inventario de aires acondicionados y sus servicios",
  mantenimiento:   "Órdenes de mantenimiento, inventario y aceites",
  checklist:       "Listas de verificación y auditorías de vehículos",
  alertas:         "Sistema de alertas y notificaciones operativas",
  reportes:        "Generación y exportación de reportes",
  combustible:     "Control y registro de consumo de combustible",
  geolocalizacion: "Rastreo y geolocalización de activos",
  accesos:         "Gestión de usuarios, roles y permisos",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

const AVATAR_COLORS = [
  ["bg-brand-100 dark:bg-brand-500/20",    "text-brand-700 dark:text-brand-300"],
  ["bg-violet-100 dark:bg-violet-500/20",  "text-violet-700 dark:text-violet-300"],
  ["bg-emerald-100 dark:bg-emerald-500/20","text-emerald-700 dark:text-emerald-300"],
  ["bg-amber-100 dark:bg-amber-500/20",    "text-amber-700 dark:text-amber-300"],
  ["bg-rose-100 dark:bg-rose-500/20",      "text-rose-700 dark:text-rose-300"],
  ["bg-cyan-100 dark:bg-cyan-500/20",      "text-cyan-700 dark:text-cyan-300"],
];

function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

// ─── Company Selector ─────────────────────────────────────────────────────────

function CompanySelector({
  companies, selected, onSelect, search, onSearch,
}: {
  companies: PlatformCompany[];
  selected: PlatformCompany | null;
  onSelect: (c: PlatformCompany) => void;
  search: string;
  onSearch: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* Search */}
      <div className="relative">
        <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text" value={search} onChange={e => onSearch(e.target.value)}
          placeholder="Buscar empresa…"
          className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-8 pr-3 text-xs
            text-gray-700 placeholder:text-gray-400 outline-none transition
            focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10
            dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300"
        />
      </div>

      {/* List */}
      <div className="flex flex-col gap-1 max-h-[420px] overflow-y-auto pr-0.5">
        {companies.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400">Sin resultados</p>
        ) : (
          companies.map(c => {
            const [bg, text] = avatarColor(c.name);
            const isSelected = selected?.id === c.id;
            return (
              <motion.button key={c.id} type="button" whileTap={{ scale: 0.98 }}
                onClick={() => onSelect(c)}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all
                  ${isSelected
                    ? "border-brand-300 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10"
                    : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50 dark:border-white/[0.05] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
                  }`}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${bg} ${text}`}>
                  {getInitials(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-xs font-semibold ${isSelected ? "text-brand-700 dark:text-brand-300" : "text-gray-700 dark:text-gray-200"}`}>
                    {c.name}
                  </p>
                  <p className="truncate text-[10px] text-gray-400">{c.enabledModules.length} módulos activos</p>
                </div>
                {isSelected && (
                  <CheckCircle size={14} className="shrink-0 text-brand-500" />
                )}
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Module Card ──────────────────────────────────────────────────────────────

function ModuleCard({
  moduleKey, enabled, suggestedByPlan, onToggle,
}: {
  moduleKey: ModuleKey;
  enabled: boolean;
  suggestedByPlan: boolean;
  onToggle: () => void;
}) {
  const mod = MODULE_TREE[moduleKey];
  const subCount = Object.keys(mod.submodules).length;
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      whileTap={{ scale: 0.99 }}
      className={`relative overflow-hidden rounded-2xl border transition-all cursor-pointer
        ${enabled
          ? "border-brand-300/70 bg-brand-50/60 dark:border-brand-500/30 dark:bg-brand-500/[0.07]"
          : "border-gray-200 bg-white hover:border-gray-300 dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:border-white/[0.1]"
        }`}
      onClick={onToggle}
    >
      {/* Top accent */}
      {enabled && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-brand-500 opacity-70" />
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg
              ${enabled
                ? "bg-brand-100 dark:bg-brand-500/20"
                : "bg-gray-100 dark:bg-white/[0.06]"
              }`}
            >
              {MODULE_ICONS[moduleKey]}
            </div>

            <div>
              <p className={`text-sm font-semibold ${enabled ? "text-brand-700 dark:text-brand-300" : "text-gray-800 dark:text-white"}`}>
                {mod.label}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
                {MODULE_DESCRIPTIONS[moduleKey]}
              </p>
            </div>
          </div>

          {/* Toggle pill */}
          <div className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold transition-all
            ${enabled
              ? "bg-brand-500 text-white"
              : "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400"
            }`}
          >
            {enabled ? "Activo" : "Bloqueado"}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
            {subCount} submódulo{subCount !== 1 ? "s" : ""}
          </span>

          {suggestedByPlan && (
            <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              Incluido en plan
            </span>
          )}

          {/* Expand submódulos */}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
            className="ml-auto flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Ver submódulos
            <ChevronDown size={10} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Submódulos expandibles */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3 dark:border-white/[0.06]">
                {Object.entries(mod.submodules).map(([key, label]) => (
                  <span key={key}
                    className={`rounded-lg px-2 py-0.5 text-[10px] font-medium
                      ${enabled
                        ? "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-400"
                        : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
                      }`}
                  >
                    {label as string}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ModulesPage() {
  const { companies, updateCompany } = usePlatformCompanies();
  const { plans }                    = usePlatformPlans();

  const [companySearch, setCompanySearch] = useState("");
  const [selectedId,    setSelectedId]    = useState<number | null>(companies[0]?.id ?? null);
  const [draft,         setDraft]         = useState<ModuleKey[]>([]);
  const [dirty,         setDirty]         = useState(false);
  const [submitting,    setSubmitting]    = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────

  const filteredCompanies = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    return q ? companies.filter(c => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)) : companies;
  }, [companies, companySearch]);

  const selected = useMemo(() =>
    companies.find(c => c.id === selectedId) ?? null,
  [companies, selectedId]);

  const planModules = useMemo(() => {
    if (!selected) return [] as ModuleKey[];
    const plan = plans.find(p => p.id === selected.planId);
    // allowedModules del plan son strings — casteamos a ModuleKey
    return (plan?.allowedModules ?? []) as ModuleKey[];
  }, [selected, plans]);

  const enabledCount  = draft.length;
  const blockedCount  = MODULE_KEYS.length - enabledCount;
  const planCount     = planModules.length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function selectCompany(c: PlatformCompany) {
    setSelectedId(c.id);
    setDraft((c.enabledModules ?? []) as ModuleKey[]);
    setDirty(false);
  }

  function toggleModule(key: ModuleKey) {
    setDraft(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
    setDirty(true);
  }

  function resetDraft() {
    if (!selected) return;
    setDraft((selected.enabledModules ?? []) as ModuleKey[]);
    setDirty(false);
  }

  function applyPlan() {
    setDraft(planModules);
    setDirty(true);
  }

  async function handleSave() {
    if (!selected) return;
    setSubmitting(true);
    try {
      await updateCompany(selected.id, { enabledModules: draft });
      toast.success(`Módulos de "${selected.name}" actualizados`);
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-cyan-200 dark:border-cyan-500/20 bg-cyan-50 dark:bg-cyan-500/10 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
            <span className="text-xs font-medium text-cyan-700 dark:text-cyan-400">Panel master</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Módulos por empresa</h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Controla qué módulos tiene habilitados cada empresa en la plataforma.
          </p>
        </div>

        {/* Save bar */}
        <AnimatePresence>
          {dirty && selected && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 self-start rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-500/20 dark:bg-amber-500/10"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Cambios sin guardar</span>
              <button type="button" onClick={resetDraft}
                className="ml-2 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300"
              >
                <RotateCcw size={11} /> Descartar
              </button>
              <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={handleSave}
                disabled={submitting}
                className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 disabled:opacity-60"
              >
                {submitting ? (
                  <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : (
                  <Save size={11} />
                )}
                Guardar
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      {selected && (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            { icon: <LayoutGrid size={16} />, label: "Empresa",    value: selected.name,          sub: selected.industry ?? "Sin industria", accent: "bg-brand-500"   },
            { icon: <ShieldCheck size={16} />,label: "Habilitados",value: enabledCount.toString(), sub: "Módulos activos",                    accent: "bg-emerald-500" },
            { icon: <ShieldOff size={16} />,  label: "Bloqueados", value: blockedCount.toString(), sub: "Sin acceso",                         accent: "bg-rose-500"    },
            { icon: <LayoutGrid size={16} />, label: "Plan",       value: planCount.toString(),    sub: `Incluidos en plan ${selected.planId}`,accent: "bg-amber-500"  },
          ].map((kpi, i) => (
            <motion.div key={kpi.label}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.07 }}
            >
              <PlatformKpiCard {...kpi} />
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Layout principal ───────────────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-4">

        {/* Sidebar empresas (1/4) */}
        <motion.div
          initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
          className="rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-white/[0.06] dark:bg-white/[0.03]"
        >
          <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white">Empresas</h3>
          <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">Selecciona para editar módulos</p>
          <CompanySelector
            companies={filteredCompanies}
            selected={selected}
            onSelect={selectCompany}
            search={companySearch}
            onSearch={setCompanySearch}
          />
        </motion.div>

        {/* Módulos grid (3/4) */}
        <div className="xl:col-span-3">
          {!selected ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 py-24 dark:border-white/[0.06]">
              <LayoutGrid size={24} className="text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-medium text-gray-400">Selecciona una empresa para gestionar sus módulos</p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {/* Toolbar */}
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {selected.name}
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    — {enabledCount} de {MODULE_KEYS.length} módulos activos
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={applyPlan}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]"
                  >
                    Aplicar plan
                  </button>
                  <button type="button"
                    onClick={() => { setDraft(MODULE_KEYS); setDirty(true); }}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300"
                  >
                    Habilitar todos
                  </button>
                  <button type="button"
                    onClick={() => { setDraft([]); setDirty(true); }}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300"
                  >
                    Bloquear todos
                  </button>
                </div>
              </div>

              {/* Grid */}
              <div className="grid gap-3 sm:grid-cols-2">
                {MODULE_KEYS.map((key, i) => (
                  <motion.div key={key}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.04 }}
                  >
                    <ModuleCard
                      moduleKey={key}
                      enabled={draft.includes(key)}
                      suggestedByPlan={planModules.includes(key)}
                      onToggle={() => toggleModule(key)}
                    />
                  </motion.div>
                ))}
              </div>

              {/* Bottom save */}
              {dirty && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  className="mt-5 flex justify-end gap-2"
                >
                  <button type="button" onClick={resetDraft}
                    className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300"
                  >
                    <RotateCcw size={13} /> Descartar cambios
                  </button>
                  <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={handleSave}
                    disabled={submitting}
                    className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 disabled:opacity-60"
                  >
                    {submitting ? (
                      <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                    ) : (
                      <Save size={13} />
                    )}
                    Guardar módulos
                  </motion.button>
                </motion.div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}