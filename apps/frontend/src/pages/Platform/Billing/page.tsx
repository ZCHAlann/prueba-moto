import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import {
  DollarSign, FileText, Clock, AlertTriangle,
  Plus, Pencil, Trash2, RefreshCw, ChevronLeft,
  ChevronRight, CheckCircle, AlertCircle, X,
} from "lucide-react";
import { usePlatformBilling } from "../../../hooks/usePlatformBilling";
import type {
  BillingInvoice,
  CreateInvoiceInput,
  UpdateInvoiceInput,
} from "../../../hooks/usePlatformBilling";
import { usePlatformCompanies } from "../../../hooks/usePlatformCompanies";
import { DatePicker } from "../../../components/ui/date-picker/DatePicker";
import { ExportToolbar } from "../../../components/ui/export-toolbar/ExportToolbar";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val: string | number) {
  return Number(val).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-EC", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("es-EC", { month: "short", year: "2-digit" });
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Borrador",   cls: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400" },
  sent:      { label: "Enviada",    cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" },
  paid:      { label: "Pagada",     cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
  overdue:   { label: "Vencida",    cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300" },
  cancelled: { label: "Cancelada",  cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
};

// ─── Chart base ───────────────────────────────────────────────────────────────

const CHART_BASE: ApexOptions = {
  chart: {
    background: "transparent",
    fontFamily: "Outfit, sans-serif",
    toolbar: { show: false },
    animations: { enabled: true, speed: 600 },
  },
  tooltip: { theme: "dark" },
  grid: { borderColor: "rgba(148,163,184,0.08)", strokeDashArray: 4 },
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, color, delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-white/[0.06] dark:bg-[#0F172A]"
    >
      <div className="flex items-start justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${color}`}>
          {icon}
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold text-gray-800 dark:text-white">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      {sub && <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{sub}</p>}
    </motion.div>
  );
}

// ─── Chart Card ───────────────────────────────────────────────────────────────

function ChartCard({
  title, subtitle, icon, children, delay = 0,
}: {
  title: string; subtitle?: string; icon: React.ReactNode;
  children: React.ReactNode; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-white/[0.06] dark:bg-[#0F172A]"
    >
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-white">{title}</p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </motion.div>
  );
}

function ChartSkeleton({ h = 220 }: { h?: number }) {
  return <div className="animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.04]" style={{ height: h }} />;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl px-4 py-3 shadow-xl text-sm font-medium
        ${type === "success" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}
    >
      {type === "success" ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
      {message}
      <button onClick={onClose} className="ml-1 opacity-70 hover:opacity-100"><X size={13} /></button>
    </motion.div>
  );
}

// ─── Invoice Modal ────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateInvoiceInput | UpdateInvoiceInput, id?: number) => Promise<void>;
  initial?: BillingInvoice | null;
  loading: boolean;
  companies: { id: number; name: string; planId: string | null }[];
}

const inputCls = "h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 placeholder:text-gray-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200";
const selectCls = `${inputCls} appearance-none`;

function InvoiceModal({ open, onClose, onSubmit, initial, loading, companies }: ModalProps) {
  const isEdit = !!initial;

  const [form, setForm] = useState({
    companyId: initial?.companyId ?? 0,
    planId:    initial?.planId    ?? "",
    cycle:     (initial?.cycle    ?? "monthly") as "monthly" | "annual",
    amount:    initial ? String(Number(initial.amount)) : "",
    tax:       initial ? String(Number(initial.tax))    : "0",
    issuedAt:  initial?.issuedAt  ?? new Date().toISOString().slice(0, 10),
    dueAt:     initial?.dueAt     ?? "",
    notes:     initial?.notes     ?? "",
    status:    initial?.status    ?? "draft" as BillingInvoice["status"],
    paidAt:    initial?.paidAt    ?? "",
  });

  const [err, setErr] = useState("");

  async function handleSubmit() {
    setErr("");
    if (!form.issuedAt || !form.dueAt) return setErr("Fecha de emisión y vencimiento requeridas");
    if (!isEdit && (!form.companyId || !form.amount)) return setErr("Empresa y monto requeridos");
    try {
      if (isEdit) {
        await onSubmit({
          status: form.status,
          paidAt: form.paidAt || undefined,
          notes:  form.notes  || undefined,
        } as UpdateInvoiceInput, initial!.id);
      } else {
        await onSubmit({
          companyId: Number(form.companyId),
          planId:    form.planId || undefined,
          cycle:     form.cycle,
          amount:    Number(form.amount),
          tax:       Number(form.tax),
          issuedAt:  form.issuedAt,
          dueAt:     form.dueAt,
          notes:     form.notes || undefined,
        } as CreateInvoiceInput);
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al guardar");
    }
  }

  if (!open) return null;

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">{label}</label>
      {children}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.2 }}
        className="relative z-10 w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-white/[0.08] dark:bg-[#0F172A]"
      >
        <h3 className="mb-5 text-base font-semibold text-gray-800 dark:text-white">
          {isEdit ? `Editar factura ${initial!.invoiceNumber}` : "Nueva factura"}
        </h3>

        <div className="grid gap-3.5 sm:grid-cols-2">
          {!isEdit && (
            <>
              <div className="sm:col-span-2">
                <Field label="Empresa">
                  <select value={form.companyId}
                    onChange={e => setForm(f => ({ ...f, companyId: Number(e.target.value) }))}
                    className={selectCls}>
                    <option value={0}>Seleccionar empresa…</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Ciclo">
                <select value={form.cycle}
                  onChange={e => setForm(f => ({ ...f, cycle: e.target.value as "monthly" | "annual" }))}
                  className={selectCls}>
                  <option value="monthly">Mensual</option>
                  <option value="annual">Anual</option>
                </select>
              </Field>
              <Field label="Monto (sin IVA)">
                <input type="number" min={0} step={0.01} value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className={inputCls} placeholder="0.00" />
              </Field>
              <Field label="IVA">
                <input type="number" min={0} step={0.01} value={form.tax}
                  onChange={e => setForm(f => ({ ...f, tax: e.target.value }))}
                  className={inputCls} placeholder="0.00" />
              </Field>
              <Field label="Fecha de emisión">
                <DatePicker value={form.issuedAt}
                  onChange={v => setForm(f => ({ ...f, issuedAt: v }))} />
              </Field>
              <Field label="Fecha de vencimiento">
                <DatePicker value={form.dueAt}
                  onChange={v => setForm(f => ({ ...f, dueAt: v }))}
                  minDate={form.issuedAt} />
              </Field>
            </>
          )}

          {isEdit && (
            <>
              <Field label="Estado">
                <select value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as BillingInvoice["status"] }))}
                  className={selectCls}>
                  <option value="draft">Borrador</option>
                  <option value="sent">Enviada</option>
                  <option value="paid">Pagada</option>
                  <option value="overdue">Vencida</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </Field>
              {form.status === "paid" && (
                <Field label="Fecha de pago">
                  <DatePicker value={form.paidAt}
                    onChange={v => setForm(f => ({ ...f, paidAt: v }))} />
                </Field>
              )}
            </>
          )}

          <div className="sm:col-span-2">
            <Field label="Notas">
              <textarea value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 resize-none"
                placeholder="Observaciones opcionales…" />
            </Field>
          </div>
        </div>

        {err && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-rose-500">
            <AlertCircle size={12} /> {err}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={loading}
            className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600 transition disabled:opacity-60">
            {loading && <RefreshCw size={12} className="animate-spin" />}
            {isEdit ? "Guardar cambios" : "Crear factura"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export function BillingPage() {
  const [from, setFrom]   = useState("");
  const [to,   setTo]     = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage]   = useState(1);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [modal, setModal] = useState<{ open: boolean; initial?: BillingInvoice | null }>({ open: false });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const { invoices, stats, loading, setFilters, reload, createInvoice, updateInvoice, deleteInvoice } =
    usePlatformBilling();

  const { companies: companiesList } = usePlatformCompanies();

  function applyFilters() {
    setFilters({ from: from || undefined, to: to || undefined, status: statusFilter || undefined });
    setPage(1);
  }

  function clearFilters() {
    setFrom(""); setTo(""); setStatusFilter("");
    setFilters({});
    setPage(1);
  }

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSubmit(data: CreateInvoiceInput | UpdateInvoiceInput, id?: number) {
    setActionLoading(true);
    try {
      if (id) {
        await updateInvoice(id, data as UpdateInvoiceInput);
        showToast("Factura actualizada", "success");
      } else {
        await createInvoice(data as CreateInvoiceInput);
        showToast("Factura creada", "success");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error", "error");
      throw e;
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteInvoice(id);
      showToast("Factura eliminada", "success");
    } catch {
      showToast("Error al eliminar", "error");
    }
    setDeleteConfirm(null);
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  const paginated  = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return invoices.slice(start, start + PAGE_SIZE);
  }, [invoices, page]);

  const totalPages = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE));

  // ── Chart data ────────────────────────────────────────────────────────────

  const lineData = useMemo(() => {
    if (!stats) return { categories: [] as string[], revenue: [] as number[], invoices: [] as number[] };
    return {
      categories: stats.byMonth.map(r => monthLabel(r.month)),
      revenue:    stats.byMonth.map(r => Number(r.revenue)),
      invoices:   stats.byMonth.map(r => Number(r.invoices)),
    };
  }, [stats]);

  const barData = useMemo(() => {
    if (!stats) return { categories: [] as string[], series: [] as number[] };
    return {
      categories: stats.byPlan.map(r => r.plan),
      series:     stats.byPlan.map(r => Number(r.revenue)),
    };
  }, [stats]);

  const lineOpts: ApexOptions = {
    ...CHART_BASE,
    chart: { ...CHART_BASE.chart, type: "line", id: "billing-by-month" },
    stroke: { curve: "smooth", width: [2.5, 1.5], dashArray: [0, 4] },
    fill: {
      type: ["gradient", "solid"],
      gradient: { shadeIntensity: 1, opacityFrom: 0.18, opacityTo: 0.01, stops: [0, 100] },
    },
    colors: ["#465fff", "#12b76a"],
    xaxis: {
      categories: lineData.categories,
      labels: { style: { colors: "#94a3b8", fontSize: "11px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: [
      { labels: { style: { colors: "#94a3b8", fontSize: "11px" }, formatter: v => `$${fmt(v)}` } },
      { opposite: true, labels: { style: { colors: "#94a3b8", fontSize: "11px" } } },
    ],
    legend: { labels: { colors: "#94a3b8" }, fontSize: "12px" },
    dataLabels: { enabled: false },
  };

  const barOpts: ApexOptions = {
    ...CHART_BASE,
    chart: { ...CHART_BASE.chart, type: "bar", id: "billing-by-plan" },
    plotOptions: { bar: { borderRadius: 6, columnWidth: "50%" } },
    colors: ["#7a5af8"],
    xaxis: {
      categories: barData.categories,
      labels: { style: { colors: "#94a3b8", fontSize: "11px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: "#94a3b8", fontSize: "11px" }, formatter: v => `$${fmt(v)}` } },
    dataLabels: { enabled: false },
  };

  // ── Export ────────────────────────────────────────────────────────────────

  const exportColumns = [
    { key: "invoiceNumber", label: "Nº Factura" },
    { key: "companyName",   label: "Empresa"    },
    { key: "planName",      label: "Plan"        },
    { key: "status",        label: "Estado"      },
    { key: "cycle",         label: "Ciclo"       },
    { key: "amount",        label: "Subtotal"    },
    { key: "tax",           label: "IVA"         },
    { key: "total",         label: "Total"       },
    { key: "issuedAt",      label: "Emisión"     },
    { key: "dueAt",         label: "Vencimiento" },
    { key: "paidAt",        label: "Pago"        },
  ];

  const exportRows = invoices.map(inv => ({
    ...inv,
    issuedAt: fmtDate(inv.issuedAt),
    dueAt:    fmtDate(inv.dueAt),
    paidAt:   inv.paidAt ? fmtDate(inv.paidAt) : "—",
    status:   STATUS_META[inv.status]?.label ?? inv.status,
    cycle:    inv.cycle === "monthly" ? "Mensual" : "Anual",
  }));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>

      {/* Modal */}
      <AnimatePresence>
        {modal.open && (
          <InvoiceModal
            open={modal.open}
            initial={modal.initial}
            onClose={() => setModal({ open: false })}
            onSubmit={handleSubmit}
            loading={actionLoading}
            companies={(companiesList ?? []).map((c: { id: number; name: string; planId?: string | null }) => ({
              id: c.id, name: c.name, planId: c.planId ?? null,
            }))}
          />
        )}
      </AnimatePresence>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-1">
            <DollarSign size={11} className="text-violet-500 dark:text-violet-400" />
            <span className="text-xs font-medium text-violet-700 dark:text-violet-400">Superadmin</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Facturación</h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Ingresos, facturas y estado de cobros por empresa.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex flex-wrap items-center gap-2 self-start"
        >
          <DatePicker value={from} onChange={setFrom} placeholder="Desde" maxDate={to || undefined} />
          <span className="text-sm text-gray-300 dark:text-gray-600">—</span>
          <DatePicker value={to} onChange={setTo} placeholder="Hasta" minDate={from || undefined} />
          <button type="button" onClick={applyFilters}
            className="rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 transition">
            Aplicar
          </button>
          {(from || to || statusFilter) && (
            <button type="button" onClick={clearFilters}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 transition dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400">
              Limpiar
            </button>
          )}
          <button type="button" onClick={reload}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 transition dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400">
            <RefreshCw size={12} /> Actualizar
          </button>
          <button type="button" onClick={() => setModal({ open: true, initial: null })}
            className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 transition">
            <Plus size={12} /> Nueva factura
          </button>
        </motion.div>
      </motion.div>

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<DollarSign size={16} />}
          label="Ingresos cobrados"
          value={`$${fmt(stats?.totalRevenue ?? 0)}`}
          sub={`${stats?.countPaid ?? 0} facturas pagadas`}
          color="bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400"
          delay={0.05}
        />
        <KpiCard
          icon={<FileText size={16} />}
          label="Por cobrar"
          value={`$${fmt(stats?.totalPending ?? 0)}`}
          sub={`${stats?.countPending ?? 0} facturas pendientes`}
          color="bg-blue-50 text-blue-500 dark:bg-blue-500/10 dark:text-blue-400"
          delay={0.1}
        />
        <KpiCard
          icon={<AlertTriangle size={16} />}
          label="Vencidas"
          value={`$${fmt(stats?.totalOverdue ?? 0)}`}
          sub={`${stats?.countOverdue ?? 0} facturas vencidas`}
          color="bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400"
          delay={0.15}
        />
        <KpiCard
          icon={<Clock size={16} />}
          label="Total facturas"
          value={String(invoices.length)}
          sub="en el período seleccionado"
          color="bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-400"
          delay={0.2}
        />
      </div>

      {/* ── Charts ─────────────────────────────────────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard
            title="Ingresos mensuales"
            subtitle="Revenue cobrado vs facturas emitidas — últimos 12 meses"
            icon={<DollarSign size={15} />}
            delay={0.25}
          >
            {loading ? <ChartSkeleton h={240} /> : (
              <ReactApexChart
                type="line"
                height={240}
                options={lineOpts}
                series={[
                  { name: "Revenue ($)", type: "area",  data: lineData.revenue   },
                  { name: "Facturas",    type: "line",  data: lineData.invoices  },
                ]}
              />
            )}
          </ChartCard>
        </div>

        <ChartCard
          title="Revenue por plan"
          subtitle="Ingresos cobrados agrupados por plan"
          icon={<FileText size={15} />}
          delay={0.3}
        >
          {loading ? <ChartSkeleton h={240} /> : (
            <ReactApexChart
              type="bar"
              height={240}
              options={barOpts}
              series={[{ name: "Revenue ($)", data: barData.series }]}
            />
          )}
        </ChartCard>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.35 }}
        className="rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-[#0F172A]"
      >
        {/* Table header */}
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/[0.06] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white">Facturas</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{invoices.length} registros</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs text-gray-700 outline-none focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300">
              <option value="">Todos los estados</option>
              <option value="draft">Borrador</option>
              <option value="sent">Enviada</option>
              <option value="paid">Pagada</option>
              <option value="overdue">Vencida</option>
              <option value="cancelled">Cancelada</option>
            </select>
            <ExportToolbar
              title="Facturación"
              subtitle={`${invoices.length} facturas exportadas`}
              filename="facturacion-plataforma"
              columns={exportColumns}
              rows={exportRows}
            />
          </div>
        </div>

        {/* Table body */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                {["Nº Factura", "Empresa", "Plan", "Ciclo", "Total", "Estado", "Emisión", "Vencimiento", ""].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="wait">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-white/[0.03]">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-5 py-3">
                          <div className="h-4 animate-pulse rounded-lg bg-gray-100 dark:bg-white/[0.04]"
                            style={{ width: `${[35, 55, 30, 25, 30, 28, 30, 30, 15][j]}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-sm text-gray-400">
                      No hay facturas con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  paginated.map((inv, i) => (
                    <motion.tr
                      key={inv.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: i * 0.02 }}
                      className="border-b border-gray-50 transition-colors hover:bg-gray-50/60 dark:border-white/[0.03] dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-3 text-xs font-mono text-gray-500 dark:text-gray-400">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-5 py-3 text-xs font-medium text-gray-700 dark:text-gray-300 max-w-[140px] truncate">
                        {inv.companyName ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500 dark:text-gray-400">
                        {inv.planName ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500 dark:text-gray-400">
                        {inv.cycle === "monthly" ? "Mensual" : "Anual"}
                      </td>
                      <td className="px-5 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300">
                        ${fmt(inv.total)}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-semibold ${STATUS_META[inv.status]?.cls}`}>
                          {STATUS_META[inv.status]?.label ?? inv.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                        {fmtDate(inv.issuedAt)}
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                        {fmtDate(inv.dueAt)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button"
                            onClick={() => setModal({ open: true, initial: inv })}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-brand-300 hover:text-brand-500 transition dark:border-white/[0.08] dark:bg-white/[0.03]">
                            <Pencil size={11} />
                          </button>
                          {deleteConfirm === inv.id ? (
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => handleDelete(inv.id)}
                                className="rounded-lg bg-rose-500 px-2 py-1 text-[10px] font-semibold text-white hover:bg-rose-600 transition">
                                Confirmar
                              </button>
                              <button type="button" onClick={() => setDeleteConfirm(null)}
                                className="rounded-lg border border-gray-200 px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-50 transition dark:border-white/[0.08]">
                                No
                              </button>
                            </div>
                          ) : (
                            <button type="button"
                              onClick={() => setDeleteConfirm(inv.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-rose-300 hover:text-rose-500 transition dark:border-white/[0.08] dark:bg-white/[0.03]">
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-white/[0.06]">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Página {page} de {totalPages} — {invoices.length} facturas
          </p>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
              return (
                <button key={p} type="button" onClick={() => setPage(p)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-medium transition
                    ${p === page
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400"
                    }`}>
                  {p}
                </button>
              );
            })}
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default BillingPage;