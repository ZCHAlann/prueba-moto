// src/pages/Platform/Plans/page.tsx
//
// Gestión visual de planes desde superadmin. Cards con pricing, módulos
// y límites, en una grilla de 4 columnas. Edit in-place con un modal
// de tabs (Basico / Limites / Modulos).

import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus, Layers, Users, HardDrive, Pencil, Trash2, Check,
  ToggleLeft, ToggleRight, Sparkles, X, Package, Crown,
  Loader2, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  PlatformModal, ModalActions,
  InputField, SelectField, TextareaField,
} from "../../../components/platform";
import { usePlatformPlans, usePlatformModules } from "../../../hooks/usePlatformPlans";
import type {
  PlatformPlan, PlatformPlanInput, PlanTier, PlatformModule,
} from "../../../types/platform";

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_ORDER: PlanTier[] = ["free", "starter", "pro", "enterprise"];

const TIER_META: Record<PlanTier, { label: string; icon: any; color: string; accent: string; chartColor: string }> = {
  free:       { label: "Free",       icon: Package,  color: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-white/[0.05] dark:text-gray-400 dark:border-white/[0.08]",         accent: "bg-gray-400",    chartColor: "#9ca3af" },
  starter:    { label: "Starter",    icon: Layers,   color: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",             accent: "bg-blue-500",    chartColor: "#3b82f6" },
  pro:        { label: "Pro",        icon: Sparkles, color: "bg-brand-50 text-brand-600 border-brand-200 dark:bg-brand-500/10 dark:text-brand-400 dark:border-brand-500/20",       accent: "bg-brand-500",   chartColor: "#465fff" },
  enterprise: { label: "Enterprise", icon: Crown,    color: "bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20", accent: "bg-violet-500",  chartColor: "#7c3aed" },
};

const EMPTY_FORM: PlatformPlanInput = {
  id: "", name: "", tier: "starter",
  monthlyPrice: "0", annualPrice: "0",
  maxUsers: null, maxAssets: null,
  maxAdmins: null, maxSupervisors: null, maxOperators: null, maxDrivers: null,
  description: "", features: [],
  isPopular: false, sortOrder: 100, currency: "USD",
  allowedModules: [], isActive: true,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: string | number) {
  return Number(n).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function limitLabel(v: number | null | undefined) {
  if (v === null || v === undefined) return "∞";
  return String(v);
}

function limitMeterColor(used: number, max: number | null | undefined): "emerald" | "amber" | "rose" {
  if (max === null || max === undefined) return "emerald";
  const pct = (used / max) * 100;
  if (pct >= 100) return "rose";
  if (pct >= 80) return "amber";
  return "emerald";
}

const METER_COLORS = {
  emerald: "bg-emerald-500",
  amber:   "bg-amber-500",
  rose:    "bg-rose-500",
} as const;

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan, onEdit, onDelete,
}: {
  plan: PlatformPlan;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tier = (plan as any).tier || "pro";
  const meta = TIER_META[tier as PlanTier] ?? TIER_META.starter;
  const TierIcon = meta.icon;
  const price = Number(plan.monthlyPrice);
  const total = (plan.maxUsers ?? 0) > 0 ? plan.maxUsers : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white
        ${plan.isPopular
          ? "border-brand-300 shadow-xl shadow-brand-500/10 dark:border-brand-500/40"
          : "border-gray-200 dark:border-white/[0.06]"
        }
        dark:bg-white/[0.03]`}
    >
      {plan.isPopular && (
        <div className="absolute -top-px left-1/2 -translate-x-1/2 translate-y-px whitespace-nowrap rounded-b-md bg-brand-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Más popular
        </div>
      )}
      {!plan.isActive && (
        <div className="absolute right-3 top-3 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
          Inactivo
        </div>
      )}

      <div className={`px-5 pb-5 pt-7 ${plan.isPopular ? "pt-9" : ""}`}>
        <div className="flex items-center gap-2">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${meta.color}`}>
            <TierIcon size={16} />
          </div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">{plan.name}</h3>
        </div>

        {plan.description && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{plan.description}</p>
        )}

        <div className="mt-4 flex items-baseline gap-1">
          {price > 0 && <span className="text-sm text-gray-400">$</span>}
          <span className="text-3xl font-bold text-gray-800 dark:text-white">
            {price > 0 ? fmt(plan.monthlyPrice) : "Gratis"}
          </span>
          {price > 0 && <span className="text-xs text-gray-400">/mes</span>}
        </div>

        {/* Features */}
        {plan.features.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {plan.features.slice(0, 6).map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300">
                <Check size={12} className="mt-0.5 flex-shrink-0 text-emerald-500" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Stats */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Stat icon={<Users size={11}/>} label="Usuarios" value={limitLabel(plan.maxUsers)} />
          <Stat icon={<HardDrive size={11}/>} label="Activos" value={limitLabel(plan.maxAssets)} />
        </div>

        {/* Módulos */}
        <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {plan.allowedModules.length} módulos habilitados
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {plan.allowedModules.slice(0, 5).map(m => (
              <span key={m} className="rounded bg-white px-1.5 py-0.5 text-[9px] font-medium text-gray-500 dark:bg-white/[0.05] dark:text-gray-400">
                {m}
              </span>
            ))}
            {plan.allowedModules.length > 5 && (
              <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-medium text-gray-500 dark:bg-white/[0.05] dark:text-gray-400">
                +{plan.allowedModules.length - 5}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-auto flex gap-2 border-t border-gray-100 bg-gray-50/50 px-5 py-3 dark:border-white/[0.04] dark:bg-white/[0.02]">
        <button type="button" onClick={onEdit}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white py-1.5 text-xs font-semibold text-gray-600 transition hover:border-brand-400 hover:text-brand-600 dark:border-white/[0.08] dark:bg-white/[0.03]">
          <Pencil size={11}/> Editar
        </button>
        <button type="button" onClick={onDelete}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition hover:border-rose-300 hover:text-rose-500 dark:border-white/[0.08] dark:bg-white/[0.03]">
          <Trash2 size={11}/>
        </button>
      </div>
    </motion.div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-white/[0.03]">
      <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
        {icon} {label}
      </div>
      <div className="text-sm font-bold text-gray-800 dark:text-white">{value}</div>
    </div>
  );
}

// ─── Plan Form (tabs: básico / límites / módulos) ─────────────────────────────

function PlanForm({
  form, onChange, isEdit, availableModules,
}: {
  form: PlatformPlanInput;
  onChange: (f: PlatformPlanInput) => void;
  isEdit: boolean;
  availableModules: PlatformModule[];
}) {
  const [tab, setTab] = useState<"basic" | "limits" | "modules" | "marketing">("basic");

  function set<K extends keyof PlatformPlanInput>(k: K, v: PlatformPlanInput[K]) {
    onChange({ ...form, [k]: v });
  }
  function toggleModule(mid: string) {
    const has = form.allowedModules.includes(mid);
    set("allowedModules", has ? form.allowedModules.filter(m => m !== mid) : [...form.allowedModules, mid]);
  }
  function addFeature() {
    set("features", [...form.features, ""]);
  }
  function updateFeature(i: number, v: string) {
    set("features", form.features.map((f, j) => j === i ? v : f));
  }
  function removeFeature(i: number) {
    set("features", form.features.filter((_, j) => j !== i));
  }

  const tabs: Array<{ id: typeof tab; label: string }> = [
    { id: "basic",    label: "Básico" },
    { id: "limits",   label: "Límites" },
    { id: "modules",  label: "Módulos" },
    { id: "marketing",label: "Marketing" },
  ];

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-100 px-6 dark:border-white/[0.06]">
        {tabs.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`relative px-3 py-2 text-xs font-semibold transition
              ${tab === t.id
                ? "text-brand-600 dark:text-brand-400"
                : "text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}>
            {t.label}
            {tab === t.id && (
              <motion.span layoutId="planFormTab"
                className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-500" />
            )}
          </button>
        ))}
      </div>

      <div className="px-6 py-5">
        {tab === "basic" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {!isEdit && (
              <InputField label="ID del plan (slug)" required value={form.id}
                placeholder="ej. pro_monthly"
                onChange={e => set("id", e.target.value)} />
            )}
            <InputField label="Nombre" required value={form.name}
              placeholder="Pro Mensual"
              onChange={e => set("name", e.target.value)} />
            <SelectField label="Tier" value={form.tier}
              onChange={e => set("tier", e.target.value as PlanTier)}>
              {TIER_ORDER.map(t => (
                <option key={t} value={t}>{TIER_META[t].label}</option>
              ))}
            </SelectField>
            <InputField label="Orden" type="number" value={form.sortOrder}
              onChange={e => set("sortOrder", Number(e.target.value) || 100)} />

            <InputField label="Precio mensual (USD)" type="number" min={0} step={0.01}
              value={form.monthlyPrice}
              onChange={e => set("monthlyPrice", e.target.value)} />
            <InputField label="Precio anual (USD)" type="number" min={0} step={0.01}
              value={form.annualPrice}
              onChange={e => set("annualPrice", e.target.value)} />
            <InputField label="Moneda" value={form.currency}
              onChange={e => set("currency", e.target.value.toUpperCase())} />

            <div className="sm:col-span-2 flex items-center gap-3">
              <button type="button" onClick={() => set("isPopular", !form.isPopular)}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                {form.isPopular
                  ? <ToggleRight size={20} className="text-brand-500" />
                  : <ToggleLeft size={20} className="text-gray-400" />
                }
                Popular (mostrarlo destacado)
              </button>
              <button type="button" onClick={() => set("isActive", !form.isActive)}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                {form.isActive
                  ? <ToggleRight size={20} className="text-emerald-500" />
                  : <ToggleLeft size={20} className="text-gray-400" />
                }
                Plan activo
              </button>
            </div>
          </div>
        )}

        {tab === "limits" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <LimitInput label="Máx. usuarios (total)" value={form.maxUsers}
              onChange={v => set("maxUsers", v)} />
            <LimitInput label="Máx. activos (vehículos+generadores+AC)" value={form.maxAssets}
              onChange={v => set("maxAssets", v)} />
            <LimitInput label="Máx. admins" value={form.maxAdmins}
              onChange={v => set("maxAdmins", v)} hint="admin_empresa + owner_empresa" />
            <LimitInput label="Máx. supervisores" value={form.maxSupervisors}
              onChange={v => set("maxSupervisors", v)} />
            <LimitInput label="Máx. operadores" value={form.maxOperators}
              onChange={v => set("maxOperators", v)} />
            <LimitInput label="Máx. conductores" value={form.maxDrivers}
              onChange={v => set("maxDrivers", v)} />

            <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 text-amber-600 dark:text-amber-400" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Los límites por rol NO PUEDEN EXCEDER el máximo total. El backend los valida en cada POST/PUT de usuarios.
                </p>
              </div>
            </div>
          </div>
        )}

        {tab === "modules" && (
          <div>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              Elegí qué módulos tendrá disponible este plan. ({form.allowedModules.length} seleccionados de {availableModules.length})
            </p>
            <div className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {availableModules.map(m => {
                const active = form.allowedModules.includes(m.id);
                return (
                  <button key={m.id} type="button"
                    onClick={() => toggleModule(m.id)}
                    disabled={m.isCore}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition
                      ${m.isCore
                        ? "border-violet-300 bg-violet-50/50 dark:border-violet-500/20 dark:bg-violet-500/10 cursor-not-allowed"
                        : active
                          ? "border-brand-400 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10"
                          : "border-gray-200 hover:border-gray-300 dark:border-white/[0.08] dark:hover:border-white/[0.15]"
                      }`}>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${active ? "text-brand-700 dark:text-brand-300" : "text-gray-700 dark:text-gray-200"}`}>
                        {m.label}
                      </p>
                      <p className="font-mono text-[9px] text-gray-400">{m.id}</p>
                    </div>
                    {m.isCore ? (
                      <span className="rounded bg-violet-200 px-1 text-[9px] font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">CORE</span>
                    ) : active ? <Check size={12} className="text-brand-500" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === "marketing" && (
          <div className="space-y-4">
            <TextareaField label="Descripción corta" rows={2} colSpan="full"
              value={form.description ?? ""}
              placeholder="Para empresas con varias sedes y mantenimiento programado…"
              onChange={e => set("description", e.target.value)} />

            <div>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Features del plan (bullets)
                </p>
                <button type="button" onClick={addFeature}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-500/10 px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-500/20 dark:bg-brand-500/15 dark:text-brand-400">
                  <Plus size={11}/> Agregar
                </button>
              </div>
              <div className="mt-2 space-y-1.5">
                {form.features.length === 0 && (
                  <p className="text-[11px] text-gray-400">Sin features. Agregá bullets con el botón de arriba.</p>
                )}
                {form.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="flex h-7 w-7 items-center justify-center text-brand-500">
                      <Check size={11} />
                    </span>
                    <input value={f}
                      onChange={e => updateFeature(i, e.target.value)}
                      placeholder={`Feature #${i+1}`}
                      className="h-7 flex-1 rounded-md border border-gray-200 bg-white px-2 text-xs outline-none focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200" />
                    <button type="button" onClick={() => removeFeature(i)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10">
                      <X size={11}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LimitInput({
  label, value, onChange, hint,
}: { label: string; value: number | null; onChange: (v: number | null) => void; hint?: string }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</label>
      <input type="number" min={0}
        placeholder="Ilimitado"
        value={value ?? ""}
        onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200" />
      {hint && <p className="mt-1 text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PlansPage() {
  const { plans, loading, createPlan, updatePlan, deletePlan } = usePlatformPlans();
  const { modules: allModules } = usePlatformModules();

  const [modalOpen,  setModalOpen]  = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing,    setEditing]    = useState<PlatformPlan | null>(null);
  const [deleting,   setDeleting]   = useState<PlatformPlan | null>(null);
  const [form,       setForm]       = useState<PlatformPlanInput>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Ordenar por sortOrder
  const sortedPlans = useMemo(() =>
    [...plans].sort((a, b) => a.sortOrder - b.sortOrder),
  [plans]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, allowedModules: [] });
    setModalOpen(true);
  }

  function openEdit(plan: PlatformPlan) {
    setEditing(plan);
    setForm({
      id: plan.id, name: plan.name, tier: plan.tier,
      monthlyPrice: plan.monthlyPrice, annualPrice: plan.annualPrice,
      maxUsers: plan.maxUsers, maxAssets: plan.maxAssets,
      maxAdmins: plan.maxAdmins, maxSupervisors: plan.maxSupervisors,
      maxOperators: plan.maxOperators, maxDrivers: plan.maxDrivers,
      description: plan.description ?? "", features: plan.features ?? [],
      isPopular: plan.isPopular, sortOrder: plan.sortOrder,
      currency: plan.currency, allowedModules: plan.allowedModules,
      isActive: plan.isActive,
    });
    setModalOpen(true);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      if (editing) {
        const { id, ...rest } = form;
        await updatePlan(editing.id, rest);
        toast.success("Plan actualizado");
      } else {
        await createPlan(form);
        toast.success("Plan creado");
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setSubmitting(true);
    try {
      await deletePlan(deleting.id);
      toast.success(`Plan "${deleting.name}" eliminado`);
      setDeleteOpen(false);
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            <span className="text-xs font-medium text-violet-700 dark:text-violet-400">Plataforma</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Planes de suscripción</h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Define los tiers, precios, límites por rol y módulos incluidos en cada plan.
          </p>
        </div>
        <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={openCreate}
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600">
          <Plus size={15} /> Nuevo plan
        </motion.button>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Planes" value={plans.length.toString()} sub="totales" color="bg-brand-500" />
        <KpiTile label="Popular" value={plans.filter(p => p.isPopular).length.toString()} sub="destacado" color="bg-amber-500" />
        <KpiTile label="Activos" value={plans.filter(p => p.isActive).length.toString()} sub="visibles al público" color="bg-emerald-500" />
        <KpiTile label="Empresas" value={plans.reduce((acc, p) => acc + (p.maxUsers ?? 0), 0).toString()} sub="usuarios máx. totales" color="bg-violet-500" />
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Cargando…
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {sortedPlans.map((plan, i) => (
            <motion.div key={plan.id}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}>
              <PlanCard
                plan={plan}
                onEdit={() => openEdit(plan)}
                onDelete={() => { setDeleting(plan); setDeleteOpen(true); }}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal crear/editar */}
      <PlatformModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar plan: ${editing.name}` : "Nuevo plan"}
        subtitle={editing ? "Modificá los datos del plan." : "Define precios, límites y módulos del nuevo tier."}
        icon={<Layers size={15} />}
        iconBg="bg-brand-50 dark:bg-brand-500/[0.12]"
        iconColor="text-brand-600 dark:text-brand-400"
        maxWidth="max-w-3xl"
        footer={
          <ModalActions
            onCancel={() => setModalOpen(false)}
            onConfirm={handleSubmit}
            submitting={submitting}
            submitLabel={editing ? "Guardar cambios" : "Crear plan"} />
        }
      >
        <PlanForm
          form={form}
          onChange={setForm}
          isEdit={!!editing}
          availableModules={allModules}
        />
      </PlatformModal>

      {/* Modal eliminar */}
      <PlatformModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Eliminar plan"
        subtitle={`¿Seguro que deseas eliminar "${deleting?.name}"? Esta acción no se puede deshacer.`}
        icon={<Trash2 size={15} />}
        iconBg="bg-error-50 dark:bg-error-500/[0.12]"
        iconColor="text-error-600 dark:text-error-400"
        maxWidth="max-w-md"
        footer={
          <ModalActions
            onCancel={() => setDeleteOpen(false)}
            onConfirm={handleDelete}
            submitting={submitting}
            submitLabel="Sí, eliminar"
            danger />
        }
      >
        <div className="px-6 py-4">
          <div className="rounded-xl border border-error-100 bg-error-50 px-4 py-3 dark:border-error-500/20 dark:bg-error-500/[0.07]">
            <p className="text-sm text-error-700 dark:text-error-400">
              Las empresas asignadas a este plan quedarán sin plan asignado.
            </p>
          </div>
        </div>
      </PlatformModal>
    </div>
  );
}

function KpiTile({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color} text-white shadow-sm`}>
        <Layers size={16} />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</p>
        <p className="text-base font-bold text-gray-800 dark:text-white">{value}</p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500">{sub}</p>
      </div>
    </div>
  );
}

