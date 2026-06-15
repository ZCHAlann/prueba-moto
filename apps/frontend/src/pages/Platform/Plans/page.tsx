// src/pages/Platform/Plans/page.tsx
import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Layers, Users, HardDrive, ToggleLeft, ToggleRight, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../context/AuthContext";
import { usePlatformPlans } from "../../../hooks/usePlatformPlans";
import { usePlatformStats } from "../../../hooks/usePlatformStats";
import {
  PlatformModal,
  PlatformKpiCard,
  PlatformSearchBar,
  ModalActions,
  InputField,
  SelectField,
  TextareaField,
} from "../../../components/platform";
import { StatusPill } from "../../../components/common/StatusPill";
import type { PlatformPlan, PlatformPlanInput, PlanTier } from "../../../types/platform";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_ORDER: PlanTier[] = ["free", "starter", "pro", "enterprise"];

const TIER_META: Record<PlanTier, { label: string; color: string; accent: string; chartColor: string }> = {
  free:       { label: "Free",       color: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-white/[0.05] dark:text-gray-400 dark:border-white/[0.08]",         accent: "bg-gray-400",    chartColor: "#9ca3af" },
  starter:    { label: "Starter",    color: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",             accent: "bg-blue-500",    chartColor: "#3b82f6" },
  pro:        { label: "Pro",        color: "bg-brand-50 text-brand-600 border-brand-200 dark:bg-brand-500/10 dark:text-brand-400 dark:border-brand-500/20",       accent: "bg-brand-500",   chartColor: "#465fff" },
  enterprise: { label: "Enterprise", color: "bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20", accent: "bg-violet-500",  chartColor: "#7c3aed" },
};

const AVAILABLE_MODULES = [
  "dashboard","accesos","gestion","motores","generadores",
  "aires_acondicionados","mantenimiento","checklist",
  "alertas","reportes","combustible","geolocalizacion","cuenta",
];

const EMPTY_FORM: PlatformPlanInput = {
  id: "",
  name: "",
  tier: "starter",
  monthlyPrice: "0",
  annualPrice: "0",
  maxUsers: null,
  maxAssets: null,
  allowedModules: [],
  isActive: true,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: PlanTier }) {
  const m = TIER_META[tier];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${m.color}`}>
      {m.label}
    </span>
  );
}

function fmt(n: string | number) {
  return Number(n).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Plan Form ────────────────────────────────────────────────────────────────

function PlanForm({
  form,
  onChange,
  isEdit,
}: {
  form: PlatformPlanInput;
  onChange: (f: PlatformPlanInput) => void;
  isEdit: boolean;
}) {
  function set<K extends keyof PlatformPlanInput>(key: K, val: PlatformPlanInput[K]) {
    onChange({ ...form, [key]: val });
  }

  function toggleModule(mod: string) {
    const has = form.allowedModules.includes(mod);
    set("allowedModules", has
      ? form.allowedModules.filter((m) => m !== mod)
      : [...form.allowedModules, mod]
    );
  }

  return (
    <div className="grid gap-4 p-6 sm:grid-cols-2">
      {/* ID (solo en creación) */}
      {!isEdit && (
        <InputField
          label="ID del plan (slug)"
          placeholder="ej. pro_annual"
          value={form.id}
          onChange={(e) => set("id", e.target.value)}
          required
        />
      )}

      {/* Nombre */}
      <InputField
        label="Nombre"
        placeholder="ej. Pro Mensual"
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
        colSpan={isEdit ? undefined : undefined}
        required
      />

      {/* Tier */}
      <SelectField
        label="Tier"
        value={form.tier}
        onChange={(e) => set("tier", e.target.value as PlanTier)}
      >
        {TIER_ORDER.map((t) => (
          <option key={t} value={t}>{TIER_META[t].label}</option>
        ))}
      </SelectField>

      {/* Precios */}
      <InputField
        label="Precio mensual (USD)"
        type="number"
        min={0}
        step={0.01}
        value={form.monthlyPrice}
        onChange={(e) => set("monthlyPrice", e.target.value)}
      />
      <InputField
        label="Precio anual (USD)"
        type="number"
        min={0}
        step={0.01}
        value={form.annualPrice}
        onChange={(e) => set("annualPrice", e.target.value)}
      />

      {/* Límites */}
      <InputField
        label="Máx. usuarios (vacío = ilimitado)"
        type="number"
        min={1}
        value={form.maxUsers ?? ""}
        onChange={(e) => set("maxUsers", e.target.value === "" ? null : Number(e.target.value))}
        placeholder="Ilimitado"
      />
      <InputField
        label="Máx. activos (vacío = ilimitado)"
        type="number"
        min={1}
        value={form.maxAssets ?? ""}
        onChange={(e) => set("maxAssets", e.target.value === "" ? null : Number(e.target.value))}
        placeholder="Ilimitado"
      />

      {/* Módulos */}
      <div className="sm:col-span-2">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Módulos permitidos ({form.allowedModules.length}/{AVAILABLE_MODULES.length})
        </p>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_MODULES.map((mod) => {
            const active = form.allowedModules.includes(mod);
            return (
              <motion.button
                key={mod}
                type="button"
                whileTap={{ scale: 0.93 }}
                onClick={() => toggleModule(mod)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
                  active
                    ? "border-brand-400 bg-brand-50 text-brand-600 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-400"
                    : "border-gray-200 text-gray-500 hover:border-gray-300 dark:border-white/[0.08] dark:text-gray-500 dark:hover:border-white/[0.15]"
                }`}
              >
                {mod}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Activo */}
      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => set("isActive", !form.isActive)}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
        >
          {form.isActive
            ? <ToggleRight size={22} className="text-brand-500" />
            : <ToggleLeft  size={22} className="text-gray-400" />
          }
          {form.isActive ? "Plan activo" : "Plan inactivo"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PlansPage() {
  const { session } = useAuth();
  const isSuperadmin = session?.role === "superadmin";

  const { plans, loading, createPlan, updatePlan, deletePlan } = usePlatformPlans();
  const { data: stats } = usePlatformStats();

  const [search,     setSearch]     = useState("");
  const [modalOpen,  setModalOpen]  = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing,    setEditing]    = useState<PlatformPlan | null>(null);
  const [deleting,   setDeleting]   = useState<PlatformPlan | null>(null);
  const [form,       setForm]       = useState<PlatformPlanInput>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans.filter((p) =>
      !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
  }, [plans, search]);

  const activePlans = plans.filter((p) => p.isActive).length;

  // empresas por plan desde stats
  const companiesByPlan: Record<string, number> = stats?.companies.byPlan ?? {};

  // ── Chart: barras verticales por tier ─────────────────────────────────────

  const chartSeries = useMemo(() => {
    const counts = TIER_ORDER.map((tier) => {
      return plans
        .filter((p) => p.tier === tier)
        .reduce((acc, p) => acc + (companiesByPlan[p.id] ?? 0), 0);
    });
    return [{ name: "Empresas", data: counts }];
  }, [plans, companiesByPlan]);

  const chartOptions: ApexOptions = {
    chart: {
      type: "bar",
      background: "transparent",
      fontFamily: "Outfit, sans-serif",
      toolbar: { show: false },
    },
    colors: TIER_ORDER.map((t) => TIER_META[t].chartColor),
    plotOptions: {
      bar: {
        distributed: true,
        borderRadius: 6,
        columnWidth: "45%",
        borderRadiusApplication: "end",
      },
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      categories: TIER_ORDER.map((t) => TIER_META[t].label),
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { fontSize: "12px", colors: "#9ca3af" } },
    },
    yaxis: {
      labels: { style: { colors: ["#6B7280"], fontSize: "12px" } },
    },
    grid: {
      yaxis: { lines: { show: true } },
      borderColor: "rgba(156,163,175,0.12)",
    },
    tooltip: { theme: "dark" },
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(plan: PlatformPlan) {
    setEditing(plan);
    setForm({
      id:             plan.id,
      name:           plan.name,
      tier:           plan.tier,
      monthlyPrice:   plan.monthlyPrice,
      annualPrice:    plan.annualPrice,
      maxUsers:       plan.maxUsers,
      maxAssets:      plan.maxAssets,
      allowedModules: plan.allowedModules,
      isActive:       plan.isActive,
    });
    setModalOpen(true);
  }

  function openDelete(plan: PlatformPlan) {
    setDeleting(plan);
    setDeleteOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        await updatePlan(editing.id, form);
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            <span className="text-xs font-medium text-violet-700 dark:text-violet-400">Plataforma</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Planes de suscripción</h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Define los tiers, precios y módulos disponibles para cada plan.
          </p>
        </div>

        {isSuperadmin && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={openCreate}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600"
          >
            <Plus size={15} />
            Nuevo plan
          </motion.button>
        )}
      </motion.div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            icon: <Layers size={16} />,
            label: "Planes activos",
            value: activePlans.toString(),
            sub: `${plans.length} planes en total`,
            accent: "bg-brand-500",
          },
          {
            icon: <ShieldCheck size={16} />,
            label: "Tier Enterprise",
            value: (companiesByPlan["enterprise"] ?? 0).toString(),
            sub: "Empresas en enterprise",
            accent: "bg-violet-500",
          },
          {
            icon: <Users size={16} />,
            label: "Empresas en Pro",
            value: (companiesByPlan["pro"] ?? 0).toString(),
            sub: "Empresas en plan pro",
            accent: "bg-blue-500",
          },
          {
            icon: <HardDrive size={16} />,
            label: "Total empresas",
            value: (stats?.companies.total ?? 0).toString(),
            sub: "Distribuidas en todos los planes",
            accent: "bg-success-500",
          },
        ].map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.07 }}
          >
            <PlatformKpiCard {...kpi} />
          </motion.div>
        ))}
      </div>

      {/* ── Fila: Gráfica + Tabla ──────────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-3">

        {/* Chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.28 }}
          className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-white/[0.06] dark:bg-white/[0.03]"
        >
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Empresas por tier</h3>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 mb-4">
            Distribución de clientes por nivel de plan
          </p>
          <ReactApexChart
            options={chartOptions}
            series={chartSeries}
            type="bar"
            height={200}
          />

          {/* Tier legend chips */}
          <div className="mt-3 flex flex-wrap gap-2">
            {TIER_ORDER.map((tier) => {
              const count = plans
                .filter((p) => p.tier === tier)
                .reduce((acc, p) => acc + (companiesByPlan[p.id] ?? 0), 0);
              return (
                <div key={tier} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: TIER_META[tier].chartColor }}
                  />
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    {TIER_META[tier].label} ({count})
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Tabla de planes */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.35 }}
          className="xl:col-span-2 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]"
        >
          {/* Card header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Todos los planes</h3>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{filtered.length} planes</p>
            </div>
            <PlatformSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Buscar plan…"
            />
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span className="text-sm">Cargando planes…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <Layers size={20} className="text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-medium text-gray-400 dark:text-gray-500">Sin planes</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                    {["Plan", "Tier", "Precio mensual", "Precio anual", "Límites", "Módulos", "Estado", ""].map((h, i, arr) => (
                      <th
                        key={h}
                        className={`px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 ${i === arr.length - 1 ? "" : ""}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                  <AnimatePresence>
                    {filtered.map((plan, i) => (
                      <motion.tr
                        key={plan.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18, delay: i * 0.04 }}
                        className="group transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02]"
                      >
                        {/* Plan */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${TIER_META[plan.tier].accent}`} />
                            <div>
                              <p className="font-semibold text-gray-800 dark:text-white">{plan.name}</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">{plan.id}</p>
                            </div>
                          </div>
                        </td>

                        {/* Tier */}
                        <td className="px-5 py-3.5">
                          <TierBadge tier={plan.tier} />
                        </td>

                        {/* Precio mensual */}
                        <td className="px-5 py-3.5 tabular-nums text-gray-700 dark:text-gray-200 font-medium">
                          ${fmt(plan.monthlyPrice)}
                        </td>

                        {/* Precio anual */}
                        <td className="px-5 py-3.5 tabular-nums text-gray-700 dark:text-gray-200 font-medium">
                          ${fmt(plan.annualPrice)}
                        </td>

                        {/* Límites */}
                        <td className="px-5 py-3.5">
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <Users size={10} />
                              {plan.maxUsers ?? "∞"} usuarios
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                              <HardDrive size={10} />
                              {plan.maxAssets ?? "∞"} activos
                            </span>
                          </div>
                        </td>

                        {/* Módulos */}
                        <td className="px-5 py-3.5">
                          <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                            {plan.allowedModules.length} módulos
                          </span>
                        </td>

                        {/* Estado */}
                        <td className="px-5 py-3.5">
                          <StatusPill
                            label={plan.isActive ? "Activo" : "Inactivo"}
                            tone={plan.isActive ? "success" : "neutral"}
                          />
                        </td>

                        {/* Acciones */}
                        <td className=" group-hover:bg-gray-50/80 dark:group-hover:bg-white/[0.02] px-5 py-3.5">
                          {isSuperadmin && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.9 }}
                                onClick={() => openEdit(plan)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-brand-300 hover:text-brand-500 dark:border-white/[0.08] dark:hover:border-brand-500/40"
                              >
                                <Pencil size={13} />
                              </motion.button>
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.9 }}
                                onClick={() => openDelete(plan)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:border-error-300 hover:text-error-500 dark:border-white/[0.08] dark:hover:border-error-500/40"
                              >
                                <Trash2 size={13} />
                              </motion.button>
                            </div>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Modal crear/editar ─────────────────────────────────────────────── */}
      <PlatformModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar plan — ${editing.name}` : "Nuevo plan"}
        subtitle={editing ? "Modifica los datos del plan." : "Define id, precio y módulos del nuevo tier."}
        icon={<Layers size={15} />}
        iconBg="bg-brand-50 dark:bg-brand-500/[0.12]"
        iconColor="text-brand-600 dark:text-brand-400"
        footer={
          <ModalActions
            onCancel={() => setModalOpen(false)}
            submitting={submitting}
            submitLabel={editing ? "Guardar cambios" : "Crear plan"}
          />
        }
      >
        <form id="plan-form" onSubmit={handleSubmit}>
          <PlanForm form={form} onChange={setForm} isEdit={!!editing} />
        </form>
      </PlatformModal>

      {/* ── Modal confirmar eliminación ────────────────────────────────────── */}
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
            submitting={submitting}
            submitLabel="Sí, eliminar"
            danger
          />
        }
      >
        <form onSubmit={handleDelete}>
          <div className="px-6 py-4">
            <div className="rounded-xl border border-error-100 bg-error-50 px-4 py-3 dark:border-error-500/20 dark:bg-error-500/[0.07]">
              <p className="text-sm text-error-700 dark:text-error-400">
                Las empresas asignadas a este plan quedarán sin plan asignado.
              </p>
            </div>
          </div>
        </form>
      </PlatformModal>

    </div>
  );
}