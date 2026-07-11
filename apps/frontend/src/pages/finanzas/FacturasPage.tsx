"use client";

// pages/finanzas/FacturasPage.tsx
//
// jul 2026 — Ledger de comprobantes del proveedor (modelo simple).
//
// Vista: lista de comprobantes generados al subir fotos de facturas al cargar
// combustible / peajes / mantenimiento, o creados manualmente.
//
// Filtros (en este orden de prioridad):
//   1) Vehículo (asset)         — el más importante
//   2) Taller (workshop)       — para mantenimientos
//   3) Tipo (categoría)         — LIBRE / COMBUSTIBLE / PEAJE / REPUESTO / MANO_OBRA / LAVADA / custom
//   4) Rango de fechas          — emisión
//   5) Módulo de origen        — combustible / peajes / mantenimiento / manual
//
// Sin CxP contable: NO hay estado de pago, vencimiento, saldo, forma de pago.
// El "origen" se muestra linkeable: click navega al mantenimiento/combustible/
// peaje que lo originó (si existe la row origen, no es huérfano).
//
// Permisos:
//   - finanzas.facturas.ver      requerido para abrir la página
//   - finanzas.facturas.editar   requerido para editar notas
//   - finanzas.facturas.crear    requerido para "+ Nuevo comprobante"
//   - finanzas.facturas.eliminar requerido para desactivar tipo custom

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Receipt, Search, Filter, X, ChevronLeft, ChevronRight,
  FileText, Loader2, ExternalLink, Pencil, Save,
  Truck, Calendar, Hash, DollarSign, Building2,
  Tag, FolderOpen, Wrench, AlertCircle,
  Plus, Trash2, Settings2, FileDown,
  ArrowUpRight, Wrench as WrenchIcon,
  Download, FileSpreadsheet, FileCode, FileType2, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { useAssets } from "../../hooks/useAssets";
import { useSuppliers } from "../../hooks/useSuppliers";
import { useWorkshops } from "../../hooks/useWorkshops";
import {
  useFinanceInvoicesQuery,
  useUpdateFinanceInvoiceNotes,
  useDownloadInvoicePdf,
  useInvoiceTypesQuery,
  useManageInvoiceTypes,
  type ApiFinanceInvoice,
  type FinanceInvoiceSourceModule,
  type FinanceInvoiceType,
} from "../../hooks/useFinanceInvoices";
import { DatePicker } from "../../components/ui/date-picker/DatePicker";

// ─── Styles ──────────────────────────────────────────────────────────────────

const inputCls =
  "h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200 dark:placeholder:text-gray-500";

const labelCls =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(n: string | number | null, currency: string | null) {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(num)) return "—";
  const cur = currency || "USD";
  try {
    return new Intl.NumberFormat("es-EC", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${cur} ${num.toFixed(2)}`;
  }
}

function fmtDate(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

const SOURCE_MODULE_LABELS: Record<FinanceInvoiceSourceModule, string> = {
  combustible:   "Combustible",
  peajes:        "Peajes",
  mantenimiento: "Mantenimiento",
  // jul 2026 v4
  petty_cash:    "Caja Chica",
  manual:        "Manual",
};

// Color por categoría para el badge de tipo
const TYPE_BADGE: Record<string, string> = {
  LIBRE:          "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:ring-white/[0.10]",
  COMBUSTIBLE:    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  PEAJE:          "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30",
  REPUESTO:       "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
  "MANO DE OBRA": "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  LAVADA:         "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30",
  SERVICIOS:      "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30",
  TALLER:         "bg-stone-100 text-stone-700 ring-stone-200 dark:bg-stone-500/15 dark:text-stone-300 dark:ring-stone-500/30",
};

const STATUS_STYLES: Record<ApiFinanceInvoice["status"], string> = {
  vigente:   "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  corregida: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  anulada:   "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
};

const STATUS_LABELS: Record<ApiFinanceInvoice["status"], string> = {
  vigente:   "Vigente",
  corregida: "Corregida",
  anulada:   "Anulada",
};

const PAGE_SIZE = 15;

/** URL interna para navegar al origen según sourceModule. */
function originHref(inv: ApiFinanceInvoice): string | null {
  const sr = inv.sourceRef;
  if (!sr) return null;
  switch (inv.sourceModule) {
    case "mantenimiento": {
      const id = inv.sourceEntityId;
      return `/mantenimientos?open=${id}`;
    }
    case "combustible": {
      const id = inv.sourceEntityId;
      return sr.assetId ? `/combustible?assetId=${sr.assetId}&open=${id}` : `/combustible?open=${id}`;
    }
    case "peajes": {
      const id = inv.sourceEntityId;
      return sr.assetId ? `/peajes?assetId=${sr.assetId}&open=${id}` : `/peajes?open=${id}`;
    }
    // jul 2026 v4 — Facturas standalone de Caja Chica: el "origen" es el
    // vale. Decodificamos sourceEntityId = 1_000_000 + voucherId (ver
    // POST /finance/vouchers/:id/invoice en el backend).
    case "petty_cash": {
      const rawId = inv.sourceEntityId ?? 0;
      const voucherId = rawId > 1_000_000 ? rawId - 1_000_000 : rawId;
      return `/finanzas/caja-chica?tab=vales&voucher=${voucherId}`;
    }
    default:
      return null;
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function FacturasPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { can } = usePermissions();
  const canView   = can("finanzas", "facturas", "ver");
  const canEdit   = can("finanzas", "facturas", "editar");
  const canCreate = can("finanzas", "facturas", "crear");

  const companyId = session?.companyId;
  const { assets: assetsList, loading: assetsLoading } = useAssets();
  const { suppliers, loading: suppliersLoading, refresh: refreshSuppliers } = useSuppliers();
  const { workshops, loading: workshopsLoading, refresh: refreshWorkshops } = useWorkshops();
  const { rows, total, loading, error, fetchInvoices, fetchInvoiceById } = useFinanceInvoicesQuery();
  const { updateNotes, saving: savingNotes } = useUpdateFinanceInvoiceNotes();
  const { downloadPdf, downloading: downloadingPdf } = useDownloadInvoicePdf();
  const { types, loading: typesLoading, fetchTypes } = useInvoiceTypesQuery();
  const { createType, updateType, deleteType } = useManageInvoiceTypes();

  // ── Filtros ────────────────────────────────────────────────────────────
  // Prioridad: Vehículo > Taller > Tipo > Módulo origen > Fechas
  // jul 2026 v3 — búsqueda automática: cualquier cambio en un dropdown
  // o fecha dispara refetch inmediatamente (sin apretar "Buscar").
  // El botón "Buscar" se mantiene como atajo manual opcional.
  // El input "q" (búsqueda libre) tiene debounce de 250ms.
  const [q, setQ]                     = useState("");
  const [qDebounced, setQDebounced]   = useState("");
  const [assetId, setAssetId]         = useState<string>("all");
  const [workshopId, setWorkshopId]   = useState<string>("all");
  const [typeId, setTypeId]           = useState<string>("all");
  const [sourceModule, setSourceModule] = useState<"all" | FinanceInvoiceSourceModule>("all");
  const [from, setFrom]               = useState("");
  const [to, setTo]                   = useState("");
  const [page, setPage]               = useState(1);

  // Debounce del input de búsqueda libre (250ms).
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  // ── Drawer detalle ─────────────────────────────────────────────────────
  const [detail, setDetail]             = useState<ApiFinanceInvoice | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft]     = useState<string>("");

  // ── Modal admin tipos ──────────────────────────────────────────────────
  const [showManageTypes, setShowManageTypes] = useState(false);

  // ── Menú de export por fila (jul 2026 v3) ──────────────────────────────
  const [openExportMenuId, setOpenExportMenuId] = useState<string | null>(null);

  // ── Refetch ───────────────────────────────────────────────────────────
  const runFetch = useCallback(
    (overrides?: { page?: number }) => {
      if (!canView || !companyId) return;
      const targetPage = overrides?.page ?? page;
      void fetchInvoices({
        q:             qDebounced || undefined,
        assetId:       assetId === "all" ? "all" : Number(assetId),
        sourceModule:  sourceModule === "all" ? undefined : sourceModule,
        invoiceTypeId: typeId === "all" ? undefined : Number(typeId),
        from:          from || undefined,
        to:            to || undefined,
        page:          targetPage,
        pageSize:      PAGE_SIZE,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canView, companyId, qDebounced, assetId, workshopId, typeId, sourceModule, from, to, page],
  );

  // jul 2026 v3 — AUTO-SEARCH: cualquier cambio en cualquier filtro o
  // en la búsqueda libre (con debounce) dispara un refetch a página 1.
  // Antes había que apretar "Buscar". Ahora solo el dropdown o la fecha
  // bastan. El botón "Buscar" queda como atajo opcional.
  useEffect(() => {
    if (!canView || !companyId) return;
    void fetchInvoices({
      q:             qDebounced || undefined,
      assetId:       assetId === "all" ? "all" : Number(assetId),
      sourceModule:  sourceModule === "all" ? undefined : sourceModule,
      invoiceTypeId: typeId === "all" ? undefined : Number(typeId),
      from:          from || undefined,
      to:            to || undefined,
      page:          1,
      pageSize:      PAGE_SIZE,
    });
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, companyId, qDebounced, assetId, workshopId, typeId, sourceModule, from, to]);

  // Refetch cuando el page cambia (cambia sin resetear filtros).
  useEffect(() => {
    if (page === 1) return; // ya disparado arriba
    runFetch({ page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Carga inicial de catálogos.
  useEffect(() => {
    if (canView && companyId) {
      void refreshSuppliers();
      void refreshWorkshops();
      void fetchTypes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, companyId]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total],
  );

  // ── Handlers ─────────────────────────────────────────────────────────
  const onSearch = () => {
    // jul 2026 v3 — el botón "Buscar" es ahora opcional (atajo manual).
    // El refetch automático del useEffect anterior ya dispara al cambiar
    // filtros. Solo forzamos el refetch inmediato para feedback visual.
    setPage(1);
    void fetchInvoices({
      q:             qDebounced || undefined,
      assetId:       assetId === "all" ? "all" : Number(assetId),
      sourceModule:  sourceModule === "all" ? undefined : sourceModule,
      invoiceTypeId: typeId === "all" ? undefined : Number(typeId),
      from:          from || undefined,
      to:            to || undefined,
      page:          1,
      pageSize:      PAGE_SIZE,
    });
  };

  const onClearFilters = () => {
    setQ("");
    setAssetId("all");
    setWorkshopId("all");
    setTypeId("all");
    setSourceModule("all");
    setFrom("");
    setTo("");
    setPage(1);
    // El useEffect superior dispara el refetch al cambiar state.
  };

  // ── Export individual por factura (PDF / CSV / XLSX / TXT) ───────────
  // jul 2026 v3 — el backend expone /:id/{pdf,csv,xlsx,txt} que
  // devuelven el archivo con Content-Disposition: attachment.
  // Aquí disparamos la descarga via fetch con credentials y guardamos
  // el blob con el nombre sugerido.
  const triggerBlobDownload = async (url: string, fallbackName: string) => {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
      }
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename="([^"]+)"/);
      const name = m?.[1] ?? fallbackName;
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      toast.error("No se pudo descargar", { description: (err as Error).message });
    }
  };

  const onDownloadInvoice = (inv: ApiFinanceInvoice, format: "pdf" | "csv" | "xlsx" | "txt") => {
    const safeName = inv.invoiceNumber.replace(/[^A-Za-z0-9_.-]/g, "_");
    const url = `/api/company/${companyId}/finance-invoices/${inv.id}/${format}`;
    void triggerBlobDownload(url, `factura-${safeName}.${format}`);
  };

  // ── Export GENERAL (jul 2026 v3) ──────────────────────────────────────
  // Manda TODAS las filas filtradas (nopage=true) en el formato pedido.
  // NO usa el paginado del front. El backend respeta los mismos filtros
  // (q, assetId, sourceModule, invoiceTypeId, from, to) del listado.
  const [openExportAllMenu, setOpenExportAllMenu] = useState(false);
  const onExportAll = (format: "pdf" | "csv" | "xlsx" | "txt") => {
    setOpenExportAllMenu(false);
    const params = new URLSearchParams();
    if (qDebounced)                              params.set("q", qDebounced);
    if (assetId !== "all")                       params.set("assetId", assetId);
    if (sourceModule !== "all")                  params.set("sourceModule", sourceModule);
    if (typeId !== "all")                        params.set("invoiceTypeId", typeId);
    if (from)                                    params.set("from", from);
    if (to)                                      params.set("to",   to);
    params.set("nopage", "true");
    params.set("format", format);
    const url = `/api/company/${companyId}/finance-invoices?${params.toString()}`;
    void triggerBlobDownload(url, `facturas_${new Date().toISOString().slice(0, 10)}.${format}`);
  };

  const openDetail = async (inv: ApiFinanceInvoice) => {
    setDetail(inv);
    setNotesDraft(inv.notes ?? "");
    setEditingNotes(false);
    const full = await fetchInvoiceById(inv.id);
    if (full) setDetail(full);
  };

  const closeDetail = () => {
    if (editingNotes && !window.confirm("Tenés cambios sin guardar. ¿Cerrar de todos modos?")) {
      return;
    }
    setDetail(null);
    setEditingNotes(false);
    setNotesDraft("");
  };

  const saveNotes = async () => {
    if (!detail) return;
    const updated = await updateNotes(detail.id, notesDraft.trim() || null);
    if (updated) {
      setDetail(updated);
      setEditingNotes(false);
      toast.success("Notas guardadas");
    } else {
      toast.error("No se pudieron guardar las notas");
    }
  };

  const onDownloadPdf = async (inv: ApiFinanceInvoice) => {
    const ok = await downloadPdf(inv.id, inv.invoiceNumber);
    if (!ok) {
      toast.error("No se pudo descargar el PDF.");
    }
  };

  const goToOrigin = (inv: ApiFinanceInvoice) => {
    const href = originHref(inv);
    if (!href) return;
    closeDetail();
    navigate(href);
  };

  // ─── Render: gate de permiso ─────────────────────────────────────────
  if (!canView) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-500/20 dark:bg-amber-500/10">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300">
            <AlertCircle size={20} />
          </div>
          <h2 className="text-base font-semibold text-amber-900 dark:text-amber-200">Acceso restringido</h2>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            No tenés permiso para ver el modulo de Finanzas.
            Pedile al administrador que active <strong>Finanzas &raquo; Facturas</strong> en tu rol.
          </p>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────
  const firstShown = rows.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastShown  = (page - 1) * PAGE_SIZE + rows.length;
  const hasFiltersActive = q !== "" || assetId !== "all" || workshopId !== "all" || typeId !== "all" || sourceModule !== "all" || from || to;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow">
            <Receipt size={18} />
          </span>
          <div>
            <h1 className="text-lg font-bold text-gray-800 dark:text-white">Facturas</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Comprobantes de gasto de combustible, peajes, mantenimiento y compras libres.
            </p>
          </div>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => setShowManageTypes(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            <Settings2 size={13} /> Tipos
          </button>
        )}

        {/* jul 2026 v3 — Botón "Exportar" general (respeta filtros). */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenExportAllMenu((v) => !v)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-sky-200 bg-white px-3 text-xs font-medium text-sky-700 transition hover:bg-sky-50 dark:border-sky-500/30 dark:bg-white/[0.05] dark:text-sky-300 dark:hover:bg-sky-500/10"
          >
            <Download size={13} /> Exportar <ChevronDown size={11} />
          </button>
          {openExportAllMenu && (
            <div
              className="absolute right-0 z-30 mt-1 w-44 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-white/[0.08] dark:bg-[#0b0f1a]"
              onMouseLeave={() => setOpenExportAllMenu(false)}
            >
              <p className="px-3 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Exportar {total} factura{total !== 1 ? "s" : ""} (filtros aplicados)
              </p>
              {([
                { fmt: "pdf"  as const, icon: <FileText size={12} />,         label: "PDF" },
                { fmt: "csv"  as const, icon: <FileType2 size={12} />,        label: "CSV" },
                { fmt: "xlsx" as const, icon: <FileSpreadsheet size={12} />,  label: "XLSX" },
                { fmt: "txt"  as const, icon: <FileCode size={12} />,         label: "TXT" },
              ]).map((opt) => (
                <button
                  key={opt.fmt}
                  type="button"
                  onClick={() => onExportAll(opt.fmt)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                >
                  {opt.icon}
                  <span>Descargar {opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Filtros ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-gray-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Filtros
          </span>
          {hasFiltersActive && (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-300">
              (filtros activos — la búsqueda es automática)
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
          {/* jul 2026 v4-b — Buscador único ancho + rango de fechas con
              gap-4 (antes gap-3 + col-span-2 los dejaba pegados). */}
          <div className="lg:col-span-5">
            <label className={labelCls}><Search size={10} className="inline mr-1" />Buscar</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="N° factura, proveedor, taller, vehículo, vale, operador..."
              className={inputCls}
            />
          </div>

          {/* Fechas — cada una con 2.5 cols para que tengan ancho cómodo
              y no se peguen entre sí. */}
          <div className="lg:col-span-3">
            <label className={labelCls}><Calendar size={10} className="inline mr-1" />Desde</label>
            <DatePicker compact value={from} onChange={setFrom} />
          </div>
          <div className="lg:col-span-3">
            <label className={labelCls}><Calendar size={10} className="inline mr-1" />Hasta</label>
            <DatePicker compact value={to} onChange={setTo} />
          </div>

          {/* Acciones */}
          <div className="lg:col-span-1 flex items-end justify-end">
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]"
              title="Limpiar filtros"
            >
              <X size={13} /> Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabla ──────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="px-3 py-2.5">Vehículo</th>
                <th className="px-3 py-2.5">Taller</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">N° Factura</th>
                <th className="px-3 py-2.5">Proveedor</th>
                <th className="px-3 py-2.5">F. Emitido</th>
                <th className="px-3 py-2.5 text-right">Monto</th>
                <th className="px-3 py-2.5">Origen</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                    <Loader2 size={16} className="inline mr-2 animate-spin" />
                    Cargando comprobantes…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <FolderOpen size={20} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      Sin comprobantes
                    </h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Cuando registres peajes, combustible o mantenimientos con foto de la
                      factura del proveedor, aparecerán acá agrupados por vehículo y taller.
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((inv) => {
                  const href = originHref(inv);
                  const typeKey = inv.invoiceTypeName ?? "OTRO";
                  const badgeCls = TYPE_BADGE[typeKey] ?? TYPE_BADGE.LIBRE;
                  return (
                    <tr
                      key={inv.id}
                      className="text-gray-700 transition hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-3 py-2.5 text-xs">
                        <div className="flex flex-col">
                          {/* jul 2026 v4-b — Para facturas de Caja Chica, no
                              hay vehículo. Mostramos el # de vale en su lugar. */}
                          {inv.sourceModule === "petty_cash" ? (
                            <>
                              <span className="font-mono font-medium text-emerald-700 dark:text-emerald-300">
                                {inv.sourceRef?.voucherNumericId
                                  ? `Vale #${inv.sourceRef.voucherNumericId}`
                                  : "—"}
                              </span>
                              {inv.sourceRef?.voucherSiteName && (
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                  {inv.sourceRef.voucherSiteName}
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="font-medium">
                                {inv.sourceRef?.assetPlate ?? inv.sourceRef?.assetCode ?? "—"}
                              </span>
                              {inv.sourceRef?.assetCode && inv.sourceRef?.assetPlate && (
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                  {inv.sourceRef.assetCode}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {/* jul 2026 v4-b — Para Caja Chica, "Taller" no
                            aplica. Mostramos el operador dueño del vale
                            para que la fila tenga contexto. */}
                        {inv.sourceModule === "petty_cash" ? (
                          inv.sourceRef?.voucherAssignedToName ?? (
                            <span className="text-gray-400 dark:text-gray-500">—</span>
                          )
                        ) : (
                          inv.sourceRef?.workshopName ?? <span className="text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${badgeCls}`}>
                          {typeKey}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-medium">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {inv.supplier?.name ?? inv.supplierName ?? (
                          <span className="text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                        {fmtDate(inv.invoiceDate)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">
                        {fmtMoney(inv.amount, inv.currency)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                        {href ? (
                          <button
                            type="button"
                            onClick={() => goToOrigin(inv)}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                          >
                            <ArrowUpRight size={10} /> {SOURCE_MODULE_LABELS[inv.sourceModule]}
                          </button>
                        ) : (
                          <span className="rounded-md border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:border-white/[0.08] dark:text-gray-400">
                            {SOURCE_MODULE_LABELS[inv.sourceModule]}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${STATUS_STYLES[inv.status]}`}
                        >
                          {STATUS_LABELS[inv.status]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openDetail(inv)}
                            title="Ver detalle"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 dark:border-white/[0.08] dark:text-gray-400 dark:hover:bg-white/[0.04]"
                          >
                            <FileText size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => openDetail(inv)}
                            title="Editar / notas"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-emerald-200 text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                          >
                            <Pencil size={13} />
                          </button>
                          {/* jul 2026 v3 — Menu dropdown de export por fila */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setOpenExportMenuId(openExportMenuId === inv.id ? null : inv.id)}
                              title="Exportar"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-sky-200 text-sky-700 transition hover:bg-sky-50 dark:border-sky-500/30 dark:text-sky-300 dark:hover:bg-sky-500/10"
                            >
                              <Download size={13} />
                            </button>
                            {openExportMenuId === inv.id && (
                              <div
                                className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-white/[0.08] dark:bg-[#0b0f1a]"
                                onMouseLeave={() => setOpenExportMenuId(null)}
                              >
                                {([
                                  { fmt: "pdf"  as const, icon: <FileText size={12} />,         label: "PDF" },
                                  { fmt: "csv"  as const, icon: <FileType2 size={12} />,        label: "CSV" },
                                  { fmt: "xlsx" as const, icon: <FileSpreadsheet size={12} />,  label: "XLSX" },
                                  { fmt: "txt"  as const, icon: <FileCode size={12} />,         label: "TXT" },
                                ]).map((opt) => (
                                  <button
                                    key={opt.fmt}
                                    type="button"
                                    onClick={() => {
                                      setOpenExportMenuId(null);
                                      onDownloadInvoice(inv, opt.fmt);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                                  >
                                    {opt.icon}
                                    <span>Descargar {opt.label}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / paginación */}
        <div className="flex flex-col items-center justify-between gap-2 border-t border-gray-100 px-4 py-3 sm:flex-row dark:border-white/[0.05]">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {rows.length === 0 ? (
              <span>Mostrando 0 de {total.toLocaleString("es-EC")}</span>
            ) : (
              <span>
                Mostrando del <strong className="text-gray-700 dark:text-white">{firstShown}</strong> al{" "}
                <strong className="text-gray-700 dark:text-white">{lastShown}</strong> de un total de{" "}
                <strong className="text-gray-700 dark:text-white">{total.toLocaleString("es-EC")}</strong>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-500 transition hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-400 dark:hover:bg-white/[0.04]"
            >
              <ChevronLeft size={12} /> Anterior
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Pagina <strong className="text-gray-700 dark:text-white">{page}</strong> de{" "}
              <strong className="text-gray-700 dark:text-white">{totalPages}</strong>
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-500 transition hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-400 dark:hover:bg-white/[0.04]"
            >
              Siguiente <ChevronRight size={12} />
            </button>
          </div>
        </div>

        {error && (
          <div className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        )}
      </div>

      {/* ── Drawer detalle ────────────────────────────────────────────── */}
      {detail && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeDetail}
          />
          <aside className="relative ml-auto flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-[#0b0f1a]">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-gradient-to-br from-emerald-50 dark:from-emerald-500/10 via-transparent to-transparent px-5 py-4 dark:border-white/[0.06]">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  Comprobante
                </div>
                <h2 className="text-base font-bold text-gray-800 dark:text-white mt-0.5">
                  {detail.invoiceNumber}
                  {detail.legalNumber && (
                    <span className="ml-2 text-xs font-mono font-normal text-gray-500 dark:text-gray-400">
                      ({detail.legalNumber})
                    </span>
                  )}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {detail.invoiceTypeName ?? "—"} · {SOURCE_MODULE_LABELS[detail.sourceModule]}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Field icon={<Calendar size={11} />} label="F. Emitido" value={fmtDate(detail.invoiceDate)} />
                <Field icon={<DollarSign size={11} />} label="Monto"   value={fmtMoney(detail.amount, detail.currency)} />
                <Field icon={<Building2 size={11} />} label="Proveedor" value={detail.supplier?.name ?? detail.supplierName ?? "—"} />
                <Field icon={<Hash size={11} />} label="N° Identif."  value={detail.supplier?.nit ?? detail.clientTaxId ?? "—"} />
              </div>

              {/* Origen — clickeable */}
              {detail.sourceRef && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <div className="flex items-center gap-2 mb-2">
                    <Truck size={12} className="text-gray-500 dark:text-gray-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Origen
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5 text-xs text-gray-700 dark:text-gray-200">
                    {detail.sourceRef.assetPlate && (
                      <FieldRow label="Vehiculo"
                        value={`${detail.sourceRef.assetPlate}${detail.sourceRef.assetCode ? ` (${detail.sourceRef.assetCode})` : ""}`} />
                    )}
                    {detail.sourceRef.fuelStation && <FieldRow label="Estación" value={detail.sourceRef.fuelStation} />}
                    {detail.sourceRef.fuelDate && <FieldRow label="Fecha carga" value={fmtDate(detail.sourceRef.fuelDate)} />}
                    {detail.sourceRef.tollName && <FieldRow label="Peaje" value={detail.sourceRef.tollName} />}
                    {detail.sourceRef.tollDate && <FieldRow label="Fecha peaje" value={fmtDate(detail.sourceRef.tollDate)} />}
                    {detail.sourceRef.maintenanceTitle && <FieldRow label="Mant. título" value={detail.sourceRef.maintenanceTitle} />}
                    {detail.sourceRef.maintenanceScheduledFor && (
                      <FieldRow label="Mant. programado" value={fmtDate(detail.sourceRef.maintenanceScheduledFor)} />
                    )}
                    {detail.sourceRef.maintenanceCompletedAt && (
                      <FieldRow label="Mant. completado" value={fmtDate(detail.sourceRef.maintenanceCompletedAt)} />
                    )}
                    {detail.sourceRef.workshopName && <FieldRow label="Taller" value={detail.sourceRef.workshopName} />}
                  </div>
                  {originHref(detail) && (
                    <button
                      type="button"
                      onClick={() => goToOrigin(detail)}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-[11px] font-semibold text-white transition"
                    >
                      <ArrowUpRight size={12} /> Ir al origen ({SOURCE_MODULE_LABELS[detail.sourceModule]})
                    </button>
                  )}
                </div>
              )}

              {/* Archivo */}
              <div>
                <label className={labelCls}>Archivo adjunto</label>
                {detail.fileUrl ? (
                  <a
                    href={detail.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-400 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  >
                    {/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(detail.fileUrl) ? (
                      <img src={detail.fileUrl} alt="adjunto" className="h-12 w-12 rounded-md object-cover" />
                    ) : (
                      <FileText size={20} />
                    )}
                    <span>Abrir archivo</span>
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-500">Sin archivo adjunto.</p>
                )}
              </div>

              {/* jul 2026 v3 — DESGLOSE de items de la factura.
                  Lo que el operador cargó en el modal "¿factura?" se
                  persiste en `company_invoices.items[]` (jsonb). Lo
                  mostramos en el drawer para que el desglose sea visible
                  desde el módulo Finanzas, no solo desde el mantenimiento. */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={labelCls + " mb-0"}>Desglose</label>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">
                    {(detail.items?.length ?? 0)} item{(detail.items?.length ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
                {detail.items && detail.items.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-white/[0.06]">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-white/[0.02]">
                        <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          <th className="px-2 py-2 text-left">Item</th>
                          <th className="px-2 py-2 text-right">Cant.</th>
                          <th className="px-2 py-2 text-right">P. unit.</th>
                          <th className="px-2 py-2 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                        {detail.items.map((it, idx) => (
                          <tr key={idx}>
                            <td className="px-2 py-2 text-gray-700 dark:text-gray-200">
                              <div className="flex items-center gap-2">
                                {it.imageUrl ? (
                                  <img src={it.imageUrl} alt="" className="h-7 w-7 rounded object-cover shrink-0" />
                                ) : (
                                  <div className="h-7 w-7 rounded bg-gray-100 dark:bg-white/[0.04] shrink-0" />
                                )}
                                <span className="truncate">{it.description}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                              {Number(it.quantity).toFixed(2)}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                              {fmtMoney(it.unitPrice, detail.currency)}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums font-semibold text-gray-700 dark:text-gray-200">
                              {fmtMoney(it.subtotal, detail.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 dark:bg-white/[0.02]">
                        <tr className="text-[11px]">
                          <td className="px-2 py-2 font-semibold text-gray-700 dark:text-gray-200" colSpan={3}>
                            Totales
                          </td>
                          <td className="px-2 py-2 text-right font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                            {fmtMoney(
                              detail.items.reduce((acc, it) => acc + Number(it.subtotal || 0), 0),
                              detail.currency,
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic px-1 py-2 rounded-md border border-dashed border-gray-200 dark:border-white/[0.06]">
                    Esta factura no tiene items registrados.
                  </p>
                )}
              </div>

              {/* Notas */}
              <div>
                <div className="flex items-center justify-between">
                  <label className={labelCls}>Notas</label>
                  {!editingNotes && canEdit && (
                    <button
                      type="button"
                      onClick={() => { setEditingNotes(true); setNotesDraft(detail.notes ?? ""); }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300"
                    >
                      <Pencil size={11} /> Editar
                    </button>
                  )}
                </div>
                {editingNotes ? (
                  <div className="space-y-2">
                    <textarea
                      rows={4}
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Anotaciones internas…"
                      className={`${inputCls} resize-none min-h-[100px] py-2.5`}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => { setEditingNotes(false); setNotesDraft(detail.notes ?? ""); }}
                        disabled={savingNotes}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.04]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveNotes()}
                        disabled={savingNotes}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {savingNotes ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-xs text-gray-700 dark:text-gray-200">
                    {detail.notes || <span className="text-gray-400 dark:text-gray-500">Sin notas.</span>}
                  </p>
                )}
              </div>
            </div>

            {/* Footer del drawer */}
            <div className="border-t border-gray-200 px-5 py-3 dark:border-white/[0.06] space-y-2">
              {originHref(detail) && (
                <button
                  type="button"
                  onClick={() => goToOrigin(detail)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white transition"
                >
                  <ArrowUpRight size={14} /> Ir al origen
                </button>
              )}
              <button
                type="button"
                disabled={downloadingPdf}
                onClick={() => onDownloadPdf(detail)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 px-3 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
              >
                {downloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                Descargar comprobante en PDF
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Modal admin tipos ─────────────────────────────────────────── */}
      {showManageTypes && (
        <ManageTypesModal
          types={types}
          onClose={() => { setShowManageTypes(false); void fetchTypes(); }}
          onCreate={async (name) => {
            const ok = await createType(name);
            if (ok) {
              toast.success(`Tipo "${name}" creado.`);
              await fetchTypes();
              return true;
            }
            toast.error(`No se pudo crear "${name}".`);
            return false;
          }}
          onUpdate={async (id, payload) => {
            const ok = await updateType(id, payload);
            if (ok) {
              toast.success("Tipo actualizado.");
              await fetchTypes();
              return true;
            }
            toast.error("No se pudo actualizar el tipo.");
            return false;
          }}
          onDelete={async (id) => {
            const ok = await deleteType(id);
            if (ok) {
              toast.success("Tipo desactivado.");
              await fetchTypes();
              return true;
            }
            toast.error("No se pudo desactivar el tipo.");
            return false;
          }}
        />
      )}
    </div>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xs font-medium text-gray-800 dark:text-white">{value}</div>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-800 dark:text-white text-right">{value}</span>
    </div>
  );
}

// ─── Modal admin tipos ───────────────────────────────────────────────────────

function ManageTypesModal(props: {
  types: FinanceInvoiceType[];
  onClose: () => void;
  onCreate: (name: string) => Promise<boolean>;
  onUpdate: (id: number, payload: { name?: string; isActive?: boolean }) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const toggleActive = async (id: number, currentActive: boolean) => {
    const ok = await props.onUpdate(id, { isActive: !currentActive });
    if (ok) {
      toast.success(currentActive ? "Tipo desactivado." : "Tipo reactivado.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.06] dark:bg-[#0b0f1a]">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-white/[0.06]">
          <h2 className="text-base font-bold text-gray-800 dark:text-white">Tipos de comprobante</h2>
          <button
            type="button"
            onClick={props.onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-white/[0.06]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Los tipos del sistema se siembran automáticamente (LIBRE, COMBUSTIBLE, PEAJE,
            REPUESTO, MANO DE OBRA, LAVADA). Podés crear tipos custom y desactivar los
            que no uses. Los del sistema <strong>no se pueden borrar</strong> ni renombrar.
          </p>

          {/* Crear nuevo */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={labelCls}>Crear nuevo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: HOTELERIA"
                className={inputCls}
              />
            </div>
            <button
              type="button"
              disabled={!name.trim()}
              onClick={async () => {
                const ok = await props.onCreate(name.trim());
                if (ok) setName("");
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Plus size={14} /> Agregar
            </button>
          </div>

          {/* Lista */}
          <div className="space-y-1.5">
            {props.types.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">Sin tipos configurados.</p>
            ) : (
              props.types.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    t.isActive
                      ? "border-gray-200 bg-white dark:border-white/[0.08] dark:bg-white/[0.03]"
                      : "border-gray-200/50 bg-gray-50 opacity-60 dark:border-white/[0.06] dark:bg-white/[0.02]"
                  }`}
                >
                  {editingId === t.id ? (
                    <>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        disabled={t.isSystem}
                        className={`${inputCls} h-8 flex-1 ${t.isSystem ? "opacity-60" : ""}`}
                      />
                      {!t.isSystem && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (editName.trim()) {
                              const ok = await props.onUpdate(t.id, { name: editName.trim() });
                              if (ok) setEditingId(null);
                            }
                          }}
                          className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                        >
                          Guardar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); setEditName(""); }}
                        className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 dark:border-white/[0.06]"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <Tag size={12} className="text-gray-400" />
                      <span className="flex-1 font-medium text-gray-800 dark:text-white">
                        {t.name}
                      </span>
                      {t.isSystem && (
                        <span className="inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                          Sistema
                        </span>
                      )}
                      {!t.isActive && (
                        <span className="inline-flex items-center rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                          Inactivo
                        </span>
                      )}
                      {!t.isSystem && (
                        <button
                          type="button"
                          onClick={() => { setEditingId(t.id); setEditName(t.name); }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-400 dark:hover:bg-white/[0.04]"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleActive(t.id, t.isActive)}
                        className={`inline-flex h-7 items-center justify-center rounded-md border px-2 text-[10px] font-semibold transition ${
                          t.isActive
                            ? "border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10"
                            : "border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                        }`}
                      >
                        {t.isActive ? "Desactivar" : "Activar"}
                      </button>
                      {!t.isSystem && (
                        <button
                          type="button"
                          onClick={() => void props.onDelete(t.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                          title="Eliminar físicamente (solo custom)"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-gray-200 px-5 py-3 dark:border-white/[0.06]">
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.04]"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

export default FacturasPage;
