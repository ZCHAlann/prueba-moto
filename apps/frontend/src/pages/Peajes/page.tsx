"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote, Plus, X, Truck, DollarSign, MapPin,
  Calendar, Route, Camera, ChevronLeft, ChevronRight,
  Pencil, Trash2, Search, Filter, FileText,
  FileSpreadsheet, Loader2,
  CreditCard, Hash, Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useToll, type ApiTollEntry, type CreateTollPayload } from "../../hooks/useToll";
import { usePermissions } from "../../hooks/usePermissions";
import { useAuth } from "../../context/AuthContext";
import { DatePicker } from "../../components/ui/date-picker/DatePicker";
import { RowActionMenu } from "../../components/ui/table/RowActionMenu";
import { TollDetailDrawer } from "./components/TollDetailDrawer";
import { TollFormModal } from "./components/TollFormModal";
import { DeleteConfirm } from "./components/DeleteConfirm";

const PAGE_SIZE = 8;

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(ymd: string) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

type KpiProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  accent: "blue" | "green" | "amber" | "violet";
};

function KpiCard({ icon, label, value, detail, accent }: KpiProps) {
  const cfg = {
    blue:   { bar: "bg-blue-500",   bg: "bg-blue-50 dark:bg-blue-500/10",     text: "text-blue-600 dark:text-blue-400"   },
    green:  { bar: "bg-emerald-500",bg: "bg-emerald-50 dark:bg-emerald-500/10",text: "text-emerald-600 dark:text-emerald-400"},
    amber:  { bar: "bg-amber-500",  bg: "bg-amber-50 dark:bg-amber-500/10",  text: "text-amber-600 dark:text-amber-400"  },
    violet: { bar: "bg-violet-500", bg: "bg-violet-50 dark:bg-violet-500/10", text: "text-violet-600 dark:text-violet-400" },
  }[accent];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className={`absolute inset-y-0 left-0 w-1 ${cfg.bar}`} />
      <div className="flex items-start gap-3 pl-2">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${cfg.bg} ${cfg.text}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</p>
          <p className="text-2xl font-bold tabular-nums text-gray-800 dark:text-white leading-tight">{value}</p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 truncate">{detail}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function PeajesPage() {
  const { session } = useAuth();
  const { tollEntries, assets, loading, createTollEntry, updateTollEntry, deleteTollEntry } = useToll();
  const { can } = usePermissions();
  const canCreate = can("peajes", "peajes", "crear");
  const canEdit   = can("peajes", "peajes", "editar");
  const canDelete = can("peajes", "peajes", "eliminar");

  const [search, setSearch]   = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]   = useState("");
  const [page, setPage]       = useState(1);

  // Modal & drawer state
  const [formOpen, setFormOpen]   = useState(false);
  const [editEntry, setEditEntry] = useState<ApiTollEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiTollEntry | null>(null);
  const [detailEntry, setDetailEntry]   = useState<ApiTollEntry | null>(null);
  const [saving, setSaving]     = useState(false);

  // ── Stats ──
  const totalAmount = tollEntries.reduce((s, t) => s + t.amount, 0);
  const totalCount  = tollEntries.length;
  const todayIso    = new Date().toISOString().slice(0, 10);
  const todayCount  = tollEntries.filter((t) => t.date === todayIso).length;
  const monthIso    = todayIso.slice(0, 7);
  const monthAmount = tollEntries.filter((t) => t.date.startsWith(monthIso)).reduce((s, t) => s + t.amount, 0);

  // ── Filtered rows ──
  const filtered = useMemo(() => {
    let base = tollEntries;
    if (search) {
      const q = search.toLowerCase();
      base = base.filter((t) =>
        t.tollName.toLowerCase().includes(q) ||
        (t.route ?? "").toLowerCase().includes(q) ||
        (t.assetPlate ?? "").toLowerCase().includes(q) ||
        (t.notes ?? "").toLowerCase().includes(q)
      );
    }
    if (dateFrom) base = base.filter((t) => t.date >= dateFrom);
    if (dateTo)   base = base.filter((t) => t.date <= dateTo);
    return base;
  }, [tollEntries, search, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Handlers ──
  const handleSave = async (payload: CreateTollPayload) => {
    setSaving(true);
    try {
      if (editEntry) {
        await updateTollEntry(editEntry.id, payload);
        toast.success("Peaje actualizado");
      } else {
        await createTollEntry(payload);
        toast.success("Peaje registrado", { description: `${payload.tollName} por ${fmtMoney(payload.amount)}` });
      }
      setFormOpen(false);
      setEditEntry(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTollEntry(deleteTarget.id);
      toast.success("Peaje eliminado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    }
    setDeleteTarget(null);
  };

  const exportCsv = () => {
    const headers = ["Fecha", "Peaje", "Vehículo", "Ruta", "Método de pago", "Monto", "Notas"];
    const rows = filtered.map((t) => [
      t.date, t.tollName, t.assetPlate ?? "—", t.route ?? "—",
      t.paymentMethod ?? "—", String(t.amount), t.notes ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `peajes_${todayIso}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 dark:border-amber-500/20 dark:bg-amber-500/10">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Operación</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Peajes</h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Gastos de peaje por vehículo. Visualizá el total mensual y filtrá por rango o ruta.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={filtered.length === 0}
            onClick={async () => {
              try {
                const { generateTollListPdf } = await import("../../components/features/pdf/TollListPdf");
                // Si el user no aplicó rango, usamos el primer y último cruce visible
                const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
                const from = dateFrom || sorted[0]?.date || new Date().toISOString().slice(0, 10);
                const to   = dateTo   || sorted[sorted.length - 1]?.date || from;
                const blob = await generateTollListPdf(filtered, { from, to });
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank");
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "No se pudo generar el PDF");
              }
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            <FileText size={14} /> PDF
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            <FileSpreadsheet size={14} /> CSV
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={() => { setEditEntry(null); setFormOpen(true); }}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-amber-500/20 transition hover:bg-amber-600 active:scale-95"
            >
              <Plus size={14} /> Nuevo peaje
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard icon={<Banknote size={18} />}      label="Total"        value={fmtMoney(totalAmount)} detail={`${totalCount} registros`} accent="blue" />
        <KpiCard icon={<Calendar size={18} />}      label="Hoy"          value={String(todayCount)}    detail="Cruces en el día"        accent="green" />
        <KpiCard icon={<DollarSign size={18} />}    label="Este mes"     value={fmtMoney(monthAmount)} detail={`${monthIso}`}           accent="amber" />
        <KpiCard icon={<Route size={18} />}         label="Promedio"     value={
          totalCount > 0 ? fmtMoney(totalAmount / totalCount) : "—"
        } detail="Por cruce"                          accent="violet" />
      </div>

      {/* Toolbar */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por peaje, ruta, vehículo o notas…"
              className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-500 transition"
            />
          </div>
          <DatePicker
            label="Desde"
            value={dateFrom}
            onChange={(v) => { setDateFrom(v); setPage(1); }}
            maxDate={dateTo || undefined}
          />
          <DatePicker
            label="Hasta"
            value={dateTo}
            onChange={(v) => { setDateTo(v); setPage(1); }}
            minDate={dateFrom || undefined}
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
            <Loader2 size={16} className="animate-spin" /> Cargando peajes…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-500 dark:bg-amber-500/10">
              <Banknote size={20} />
            </div>
            <p className="mt-3 text-sm font-medium text-gray-800 dark:text-white">Sin peajes registrados</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {search || dateFrom || dateTo ? "No hay resultados para ese filtro." : "Cargá el primer cruce para empezar."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-widest text-gray-400 dark:bg-white/[0.02] dark:text-gray-500">
                  <tr>
                    <th className="px-5 py-3 text-left font-semibold">Fecha</th>
                    <th className="px-5 py-3 text-left font-semibold">Peaje</th>
                    <th className="px-5 py-3 text-left font-semibold">Vehículo</th>
                    <th className="px-5 py-3 text-left font-semibold">Ruta</th>
                    <th className="px-5 py-3 text-left font-semibold">Pago</th>
                    <th className="px-5 py-3 text-right font-semibold">Monto</th>
                    <th className="px-5 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                  {pageRows.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setDetailEntry(t)}
                      className="cursor-pointer border-l-4 border-l-amber-500 transition hover:bg-amber-50/30 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtDate(t.date)}</td>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-800 dark:text-white">{t.tollName}</p>
                        {t.category && (
                          <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{t.category}</p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-800 dark:text-white">{t.assetPlate ?? "—"}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{t.assetBrand} {t.assetModel}</p>
                      </td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-300 max-w-[200px] truncate">
                        {t.route ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Route size={12} className="text-gray-400" />
                            {t.route}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-600 dark:text-gray-300 text-xs">
                        {t.paymentMethod ? (
                          <span className="inline-flex items-center gap-1.5">
                            <CreditCard size={12} className="text-gray-400" />
                            {t.paymentMethod}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-800 dark:text-white">{fmtMoney(t.amount)}</td>
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          <RowActionMenu
                            ariaLabel="Acciones del peaje"
                            items={[
                              { label: "Ver detalle", onClick: () => setDetailEntry(t), tone: "default" },
                              ...(canEdit   ? [{ label: "Editar",   onClick: () => { setEditEntry(t); setFormOpen(true); }, tone: "default" as const }] : []),
                              ...(canDelete ? [{ label: "Eliminar", onClick: () => setDeleteTarget(t), tone: "danger"  as const }] : []),
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-white/[0.06]">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {filtered.length} resultado{filtered.length !== 1 ? "s" : ""} · Pág. {page} / {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-500 transition hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-400 dark:hover:bg-white/[0.04]"
                  >
                    <ChevronLeft size={12} /> Anterior
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-500 transition hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-400 dark:hover:bg-white/[0.04]"
                  >
                    Siguiente <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {!canCreate && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          No tenés permiso para registrar peajes. Pedile al administrador que active el módulo <strong>Peajes</strong> en tu rol.
        </div>
      )}

      {/* Modals & Drawer */}
      <TollFormModal
        open={formOpen}
        entry={editEntry}
        assets={assets}
        assetsLoading={loading}
        companyId={Number(session?.companyId ?? 0)}
        saving={saving}
        onClose={() => { setFormOpen(false); setEditEntry(null); }}
        onSave={handleSave}
      />

      <TollDetailDrawer
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
        onEdit={(t) => { setDetailEntry(null); setEditEntry(t); setFormOpen(true); }}
      />

      <DeleteConfirm
        entry={deleteTarget}
        assets={assets}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default PeajesPage;
