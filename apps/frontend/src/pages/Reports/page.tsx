"use client";

import { useEffect, useMemo, useState } from "react";
import { useAssets } from "../../hooks/useAssets";
import { useDrivers } from "../../hooks/useDrivers";
import { useAssignments } from "../../hooks/useAssignments";
import { useMaintenances } from "../../hooks/useMaintenances";
import { useChecklists } from "../../hooks/useChecklists";
import { useAlerts } from "../../hooks/useAlerts";
import { useFuel } from "../../hooks/useFuel";
import { useInventory } from "../../hooks/useInventory";
import { useExitAuthorizations } from "../../hooks/useExitAuthorizations";
import {
  FileBarChart2,
  CalendarRange,
  Search,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Info,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ExportToolbar } from "../../components/ui/export-toolbar/ExportToolbar";
import { DatePicker } from "../../components/ui/date-picker/DatePicker";
import { MaintenanceReports } from "./MaintenanceReports";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 6;

// ─── Types ────────────────────────────────────────────────────────────────────

type Tone = "info" | "success" | "warning" | "danger" | "neutral";

type SummaryItem = {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
};

type ReportColumn = {
  key: string;
  label: string;
};

type ReportRow = Record<string, unknown>;

type ReportPreview = {
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: SummaryItem[];
};

type DateRange = {
  from: string;
  to: string;
};

// ─── Report catalog ───────────────────────────────────────────────────────────

type ReportDef = {
  id: string;
  label: string;
};

const REPORT_CATALOG: ReportDef[] = [
  { id: "rep-001", label: "Gerencial" },
  { id: "rep-002", label: "Asignaciones" },
  { id: "rep-003", label: "Gastos" },
  { id: "rep-004", label: "Checklist" },
  { id: "rep-005", label: "Combustible" },
  { id: "rep-006", label: "Alertas" },
  { id: "rep-007", label: "Inventario" },
  { id: "rep-008", label: "Autorizaciones" },
  { id: "rep-009", label: "Mantenimiento" },
  { id: "rep-010", label: "Costos Mtto." },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number) {
  return `${amount.toFixed(2)} USD`;
}

function isInRange(value: string | undefined, range: DateRange) {
  if (!value) return true;
  const d = value.slice(0, 10);
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}

function filterRows(rows: ReportRow[], columns: ReportColumn[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    columns.some((col) => String(row[col.key] ?? "").toLowerCase().includes(q))
  );
}

// ─── Tone config ──────────────────────────────────────────────────────────────

const TONE: Record<Tone, { bar: string; value: string; icon: React.ReactNode }> = {
  info:    { bar: "bg-brand-500",   value: "text-brand-600 dark:text-brand-400",     icon: <Info size={13} /> },
  success: { bar: "bg-success-500", value: "text-success-600 dark:text-success-400", icon: <CheckCircle2 size={13} /> },
  warning: { bar: "bg-warning-500", value: "text-warning-600 dark:text-warning-400", icon: <AlertTriangle size={13} /> },
  danger:  { bar: "bg-error-500",   value: "text-error-600 dark:text-error-400",     icon: <AlertTriangle size={13} /> },
  neutral: { bar: "bg-gray-400",    value: "text-gray-700 dark:text-gray-200",       icon: <TrendingUp size={13} /> },
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, detail, tone }: SummaryItem) {
  const t = TONE[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${t.bar} opacity-70`} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {label}
        </p>
        <span className={`opacity-60 ${t.value}`}>{t.icon}</span>
      </div>
      <p className={`mt-2 text-3xl font-black tabular-nums ${t.value}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{detail}</p>
    </div>
  );
}

// ─── Report tab ───────────────────────────────────────────────────────────────

function ReportTab({
  label, active, onClick,
}: {
  label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
        active
          ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/[0.12] dark:text-brand-400"
          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50 dark:border-white/[0.06] dark:bg-transparent dark:text-gray-400 dark:hover:bg-white/[0.04]"
      }`}
    >
      {label}
    </button>
  );
}

// ─── Pagination component ─────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-gray-100 dark:border-white/[0.06] px-5 py-3">
      <button
        disabled={page <= 1}
        onClick={onPrev}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 transition-colors"
      >
        <ChevronLeft size={13} />Anterior
      </button>
      <div className="flex gap-1">
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={`h-7 w-7 rounded-lg text-xs font-semibold transition-colors ${
              page === p
                ? "bg-brand-500 text-white"
                : "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.05]"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      <button
        disabled={page >= totalPages}
        onClick={onNext}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 transition-colors"
      >
        Siguiente<ChevronRight size={13} />
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const { assets,       loading: loadingAssets }       = useAssets();
  const { drivers,      loading: loadingDrivers }      = useDrivers();
  const { assignments,  loading: loadingAssignments }  = useAssignments();
  const { maintenances, loading: loadingMaintenances } = useMaintenances();
  const { checklists,   loading: loadingChecklists }   = useChecklists();
  const { alerts,       loading: loadingAlerts }       = useAlerts();
  const { fuelEntries,  loading: loadingFuel }         = useFuel();
  const { inventory,    loading: loadingInventory }    = useInventory();
  const { items: exitAuths, loading: loadingExitAuths, fetchList: fetchExitAuths } = useExitAuthorizations();

  useEffect(() => {
    void fetchExitAuths();
  }, [fetchExitAuths]);

  const loading =
    loadingAssets || loadingDrivers || loadingAssignments ||
    loadingMaintenances || loadingChecklists || loadingAlerts ||
    loadingFuel || loadingInventory || loadingExitAuths;

  const [activeId, setActiveId] = useState("rep-001");
  const [search, setSearch]     = useState("");
  const [page, setPage]         = useState(1);
  const [draft, setDraft]       = useState<DateRange>({ from: "", to: "" });
  const [applied, setApplied]   = useState<DateRange>({ from: "", to: "" });
  // Sub-filtros del tab "Mantenimiento". Solo aplican cuando activeId === "rep-009".
  const [maintSubtab, setMaintSubtab] = useState<"todos" | "programados" | "en_proceso" | "completados">("todos");
  const [maintCategory, setMaintCategory] = useState<"all" | "Preventivo" | "Correctivo" | "Motor" | "Inyector">("all");

  // Reset page when tab or search changes
  function handleTabChange(id: string) {
    setActiveId(id);
    setPage(1);
    setSearch("");
    if (id !== "rep-009") {
      setMaintSubtab("todos");
      setMaintCategory("all");
    }
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  // ─── Preview ───────────────────────────────────────────────────────────────

  const preview = useMemo<ReportPreview>(() => {

    // ── rep-001 Gerencial ──────────────────────────────────────────────────
    if (activeId === "rep-001") {
      const columns: ReportColumn[] = [
        { key: "type",            label: "Tipo" },
        { key: "brand",           label: "Marca" },
        { key: "plate",           label: "Placa" },
        { key: "status",          label: "Estado" },
        { key: "nextMaintenance", label: "Prox. mantenimiento" },
        { key: "comments",        label: "Comentarios" },
      ];
      const rows: ReportRow[] = assets.map((a) => ({
        type:            a.category,
        brand:           a.brand,
        plate:           a.plate,
        status:          a.status,
        nextMaintenance: a.nextMaintenance,
        comments:        a.observations ?? "—",
        __date:          a.nextMaintenance,
      }));
      return {
        title: "Reporte gerencial detallado",
        description: "Estado general y próximos mantenimientos por unidad.",
        columns,
        rows,
        summary: [
          { label: "Unidades",   value: assets.length.toString(),                                         detail: "Base actual",      tone: "info"    },
          { label: "Operativas", value: assets.filter((a) => a.status === "Operativo").length.toString(), detail: "En servicio",       tone: "success" },
          { label: "Críticas",   value: assets.filter((a) => a.status !== "Operativo").length.toString(), detail: "Requieren acción",  tone: "warning" },
        ],
      };
    }

    // ── rep-002 Asignaciones ───────────────────────────────────────────────
    if (activeId === "rep-002") {
      const columns: ReportColumn[] = [
        { key: "document",    label: "Documento" },
        { key: "name",        label: "Conductor" },
        { key: "licenseType", label: "Licencia" },
        { key: "phone",       label: "Celular" },
        { key: "plate",       label: "Placa" },
        { key: "type",        label: "Tipo" },
        { key: "brand",       label: "Marca" },
        { key: "status",      label: "Estado" },
        { key: "date",        label: "Fecha asignación" },
      ];
      const rows: ReportRow[] = assignments.map((a) => {
        // prefer backend-enriched fields, fall back to local join
        const driver     = drivers.find((d) => d.id === a.driverId);
        const asset      = assets.find((x) => x.id === a.assetId);
        const driverName = a.driverName ?? driver?.name ?? "Sin conductor";
        const driverCode = a.driverCode ?? driver?.code ?? "—";
        const plate      = a.assetPlate ?? asset?.plate ?? "—";
        const brand      = a.assetBrand ?? asset?.brand ?? "—";
        const assetType  = asset?.category ?? "—";
        return {
          document:    driverCode,
          name:        driverName,
          licenseType: driver?.licenseType ?? "—",
          phone:       driver?.phone        ?? "—",
          plate,
          type:        assetType,
          brand,
          status:      a.status,
          date:        a.startDate,
          __date:      a.startDate,
        };
      });
      return {
        title: "Historial de asignación de vehículos",
        description: "Conductor, placa y estado de cada asignación.",
        columns,
        rows,
        summary: [
          { label: "Asignaciones", value: assignments.length.toString(),                                      detail: "Base histórica", tone: "info"    },
          { label: "Activas",      value: assignments.filter((a) => a.status === "Activa").length.toString(), detail: "En curso",       tone: "success" },
          { label: "Con acta",     value: assignments.filter((a) => !!a.handoverUrl).length.toString(),       detail: "Soporte PDF",    tone: "neutral" },
        ],
      };
    }

    // ── rep-003 Gastos ─────────────────────────────────────────────────────
    if (activeId === "rep-003") {
      const columns: ReportColumn[] = [
        { key: "plate",       label: "Placa" },
        { key: "type",        label: "Tipo" },
        { key: "brand",       label: "Marca" },
        { key: "expenseType", label: "Tipo gasto" },
        { key: "amount",      label: "Importe" },
        { key: "status",      label: "Estado" },
        { key: "date",        label: "Fecha" },
      ];
      const fuelRows: ReportRow[] = fuelEntries.map((e) => {
        const asset = assets.find((a) => a.id === e.assetId);
        return {
          plate: asset?.plate ?? "—", type: asset?.category ?? "—", brand: asset?.brand ?? "—",
          expenseType: "Combustible", amount: formatCurrency(e.cost), status: "Validado",
          date: e.date, __date: e.date,
        };
      });
      const maintRows: ReportRow[] = maintenances.map((e) => {
        const asset = assets.find((a) => a.id === e.assetId);
        return {
          plate: asset?.plate ?? "—", type: asset?.category ?? "—", brand: asset?.brand ?? "—",
          expenseType: `Mantenimiento ${e.kind}`,
          amount: formatCurrency(e.kind === "Correctivo" ? 780 : 340),
          status: e.status, date: e.scheduledDate, __date: e.scheduledDate,
        };
      });
      const rows = [...fuelRows, ...maintRows].sort((a, b) =>
        String(b.__date).localeCompare(String(a.__date))
      );
      return {
        title: "Reporte detallado de gastos vehiculares",
        description: "Combustible y mantenimiento consolidados.",
        columns,
        rows,
        summary: [
          { label: "Movimientos",   value: rows.length.toString(),          detail: "Registros totales", tone: "info"    },
          { label: "Combustible",   value: fuelEntries.length.toString(),   detail: "Cargas incluidas",  tone: "warning" },
          { label: "Mantenimiento", value: maintenances.length.toString(),  detail: "OT incluidas",      tone: "success" },
        ],
      };
    }

    // ── rep-004 Checklist ──────────────────────────────────────────────────
    if (activeId === "rep-004") {
      const columns: ReportColumn[] = [
        { key: "targetKind", label: "Tipo equipo" },
        { key: "equipment",  label: "Equipo" },
        { key: "category",   label: "Categoría" },
        { key: "status",     label: "Estado" },
        { key: "finding",    label: "Novedades" },
        { key: "inspector",  label: "Inspector" },
        { key: "date",       label: "Fecha" },
      ];
      const rows: ReportRow[] = checklists.map((c) => {
        const asset  = assets.find((a) => a.id === c.assetId);
        const issues = c.items.filter((i) => i.hasItem === "NO" || i.condition !== "Bueno");
        return {
          targetKind: c.targetKind ?? "Vehículo",
          equipment:  c.targetLabel || asset?.plate || asset?.name || "—",
          category:   c.categoryName || asset?.category || "—",
          status:     c.status,
          finding:    issues.length > 0 ? `Sí (${issues.length})` : "No",
          inspector:  c.inspector,
          date:       c.date,
          __date:     c.date,
        };
      });
      return {
        title: "Historial de checklist",
        description: "Inspecciones, resultado y responsable.",
        columns,
        rows,
        summary: [
          { label: "Total",      value: checklists.length.toString(),                                           detail: "Inspecciones",    tone: "info"    },
          { label: "Aprobados",  value: checklists.filter((c) => c.status === "Aprobado").length.toString(),    detail: "Sin observación", tone: "success" },
          { label: "Observados", value: checklists.filter((c) => c.status === "Observado").length.toString(),   detail: "Con hallazgos",   tone: "warning" },
        ],
      };
    }

    // ── rep-005 Combustible ────────────────────────────────────────────────
    if (activeId === "rep-005") {
      const columns: ReportColumn[] = [
        { key: "invoice",   label: "Factura" },
        { key: "plate",     label: "Placa" },
        { key: "kmStart",   label: "Km. inicial" },
        { key: "kmEnd",     label: "Km. final" },
        { key: "unitPrice", label: "Precio unitario" },
        { key: "total",     label: "Importe total" },
        { key: "date",      label: "Fecha carga" },
        { key: "station",   label: "Estación" },
      ];
      const rows: ReportRow[] = fuelEntries.map((e, i) => {
        const asset = assets.find((a) => a.id === e.assetId);
        return {
          invoice:   `FAC-${String(i + 1).padStart(4, "0")}`,
          plate:     asset?.plate ?? "—",
          kmStart:   Math.max(e.odometer - 420, 0),
          kmEnd:     e.odometer,
          unitPrice: `${(e.cost / e.liters).toFixed(2)} USD`,
          total:     formatCurrency(e.cost),
          date:      e.date,
          station:   e.station,
          __date:    e.date,
        };
      });
      return {
        title: "Historial de cargas de combustible",
        description: "Carga, kilometraje, costo y estación.",
        columns,
        rows,
        summary: [
          { label: "Cargas",  value: fuelEntries.length.toString(),                               detail: "Registros emitidos", tone: "info"    },
          { label: "Litros",  value: fuelEntries.reduce((t, e) => t + e.liters, 0).toFixed(0),    detail: "Volumen total",      tone: "warning" },
          { label: "Costo",   value: formatCurrency(fuelEntries.reduce((t, e) => t + e.cost, 0)), detail: "Acumulado",          tone: "success" },
        ],
      };
    }

    // ── rep-006 Alertas ────────────────────────────────────────────────────
    if (activeId === "rep-006") {
      const columns: ReportColumn[] = [
        { key: "plate",      label: "Placa" },
        { key: "title",      label: "Alerta" },
        { key: "severity",   label: "Severidad" },
        { key: "status",     label: "Estado" },
        { key: "recordDate", label: "Fecha" },
        { key: "notes",      label: "Notas" },
      ];
      const rows: ReportRow[] = alerts.map((a) => {
        const asset = assets.find((x) => x.id === a.assetId);
        return {
          plate:      asset?.plate ?? "—",
          title:      a.title,
          severity:   a.severity,
          status:     a.status,
          recordDate: a.dueDate,
          notes:      a.notes,
          __date:     a.dueDate,
        };
      });
      return {
        title: "Alertas de flota",
        description: "Seguimiento de alertas por severidad y estado.",
        columns,
        rows,
        summary: [
          { label: "Total",    value: alerts.length.toString(),                                        detail: "Base total",  tone: "info"    },
          { label: "Abiertas", value: alerts.filter((a) => a.status === "Abierta").length.toString(),  detail: "Pendientes",  tone: "warning" },
          { label: "Cerradas", value: alerts.filter((a) => a.status === "Cerrada").length.toString(),  detail: "Resueltas",   tone: "success" },
        ],
      };
    }

    // ── rep-007 Inventario ─────────────────────────────────────────────────
    if (activeId === "rep-007") {
      const columns: ReportColumn[] = [
        { key: "code",        label: "Código" },
        { key: "description", label: "Descripción" },
        { key: "category",    label: "Categoría" },
        { key: "stock",       label: "Stock" },
        { key: "minStock",    label: "Mínimo" },
        { key: "location",    label: "Ubicación" },
        { key: "unit",        label: "Unidad" },
      ];
      const rows: ReportRow[] = inventory.map((e) => ({
        code:        e.code,
        description: e.name,
        category:    e.category ?? "—",
        stock:       e.stock,
        minStock:    e.minStock,
        location:    e.location ?? "—",
        unit:        e.unit ?? "—",
      }));
      return {
        title: "Reporte de inventario y materiales",
        description: "Stock actual y ítems por debajo del mínimo.",
        columns,
        rows,
        summary: [
          { label: "Ítems",       value: inventory.length.toString(),                                    detail: "Catálogo actual",      tone: "info"    },
          { label: "Bajo mínimo", value: inventory.filter((i) => i.stock <= i.minStock).length.toString(), detail: "Requieren reposición", tone: "warning" },
          { label: "Stock total", value: inventory.reduce((t, i) => t + i.stock, 0).toString(),          detail: "Unidades acumuladas",  tone: "success" },
        ],
      };
    }

    // ── rep-008 Autorizaciones ─────────────────────────────────────────────
    if (activeId === "rep-008") {
      const columns: ReportColumn[] = [
        { key: "assetPlate",    label: "Vehículo"         },
        { key: "driverName",    label: "Conductor"        },
        { key: "status",        label: "Estado"           },
        { key: "requestedAt",   label: "Solicitada"       },
        { key: "decidedAt",     label: "Decidida"         },
        { key: "decidedBy",     label: "Aprobada por"     },
        { key: "decisionNotes", label: "Nota de decisión" },
      ];
      const rows: ReportRow[] = exitAuths.map((a) => {
        const driver   = drivers.find((d) => d.id === a.driverId);
        const driverNm = a.driverName ?? (driver ? `${driver.firstName} ${driver.lastName}`.trim() : "—");
        const plate    = a.assetPlate ?? assets.find((x) => x.id === a.assetId)?.plate ?? "—";
        const decider  = drivers.find((d) => d.id === a.decisionByUserId);
        return {
          assetPlate:    plate,
          driverName:    driverNm,
          status:        a.status,
          requestedAt:   a.requestedAt ? a.requestedAt.slice(0, 16).replace("T", " ") : "—",
          decidedAt:     a.decidedAt   ? a.decidedAt.slice(0, 16).replace("T", " ")   : "—",
          decidedBy:     a.decidedByName ?? (decider ? `${decider.firstName} ${decider.lastName}`.trim() : "—"),
          decisionNotes: a.decisionNotes ?? "—",
          __date:        a.requestedAt,
        };
      });
      return {
        title: "Reporte de autorizaciones de salida",
        description: "Solicitudes de salida de vehículos, su estado y quién las decidió.",
        columns,
        rows,
        summary: [
          { label: "Total",       value: exitAuths.length.toString(),                                              detail: "Solicitudes registradas", tone: "info"    },
          { label: "Autorizadas", value: exitAuths.filter((a) => a.status === "Autorizada").length.toString(),    detail: "Aprobadas",               tone: "success" },
          { label: "Rechazadas",  value: exitAuths.filter((a) => a.status === "Rechazada").length.toString(),     detail: "Denegadas",               tone: "danger"  },
          { label: "Pendientes",  value: exitAuths.filter((a) => a.status === "Pendiente").length.toString(),     detail: "En espera",               tone: "warning" },
        ],
      };
    }

    // ── rep-009 Mantenimiento ───────────────────────────────────────────────
    if (activeId === "rep-009") {
      const columns: ReportColumn[] = [
        { key: "title",       label: "Título"     },
        { key: "kind",        label: "Tipo"       },
        { key: "category",    label: "Categoría"  },
        { key: "assetPlate",  label: "Vehículo"   },
        { key: "status",      label: "Estado"     },
        { key: "scheduledFor",label: "Programado" },
        { key: "executedAt",  label: "Ejecutado"  },
        { key: "workshop",    label: "Taller"     },
        { key: "technician",  label: "Técnico"    },
        { key: "cost",        label: "Costo total"},
      ];
      const rows: ReportRow[] = maintenances.map((m) => {
        const plate = m.assetPlate ?? assets.find((x) => x.id === m.assetId)?.plate ?? "—";
        return {
          title:        m.title,
          kind:         m.kind,
          category:     m.category,
          assetPlate:   plate,
          status:       m.status,
          scheduledFor: m.scheduledFor ? m.scheduledFor.slice(0, 10) : "—",
          executedAt:   m.executedAt   ? m.executedAt.slice(0, 10)   : "—",
          workshop:     m.workshopName ?? "—",
          technician:   m.technician   ?? "—",
          cost:         (m.laborCost ?? 0) + (m.partsCost ?? 0),
          __status:     m.status, // para sub-filtros
          __date:       m.scheduledFor,
        };
      });
      return {
        title: "Reporte de mantenimientos",
        description: "Órdenes de trabajo con estado, costo y tipo. Use las sub-pestañas para filtrar por estado o categoría.",
        columns,
        rows,
        summary: [
          { label: "Total",        value: maintenances.length.toString(),                                          detail: "OT registradas",          tone: "info"    },
          { label: "Programados",  value: maintenances.filter((m) => m.status === "Programado").length.toString(),  detail: "Pendientes de ejecución",  tone: "warning" },
          { label: "En proceso",   value: maintenances.filter((m) => m.status === "En proceso").length.toString(),  detail: "En taller",                tone: "info"    },
          { label: "Completados",  value: maintenances.filter((m) => m.status === "Completado").length.toString(),  detail: "Cerrados",                 tone: "success" },
        ],
      };
    }

    // Fallback vacío (nunca debería llegar aquí)
    return { title: "", description: "", columns: [], rows: [], summary: [] };

  }, [activeId, assets, drivers, assignments, maintenances, checklists, alerts, fuelEntries, inventory, exitAuths]);

  // ─── Filtered rows ─────────────────────────────────────────────────────────

  const rangedRows = useMemo(
    () => preview.rows.filter((r) => isInRange(String(r.__date ?? ""), applied)),
    [applied, preview.rows]
  );

  const visibleRows = useMemo(() => {
    let filtered = filterRows(rangedRows, preview.columns, search);
    // Sub-filtros del tab Mantenimiento (estado + categoría)
    if (activeId === "rep-009") {
      if (maintSubtab !== "todos") {
        const statusMap: Record<string, string> = {
          programados: "Programado",
          en_proceso:  "En proceso",
          completados: "Completado",
        };
        const target = statusMap[maintSubtab];
        filtered = filtered.filter((r) => r.__status === target);
      }
      if (maintCategory !== "all") {
        filtered = filtered.filter((r) => r.category === maintCategory);
      }
    }
    return filtered;
  }, [rangedRows, preview.columns, search, activeId, maintSubtab, maintCategory]);

  const totalPages  = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const pagedRows   = visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest text-brand-600 dark:bg-brand-500/[0.12] dark:text-brand-400">
            Reportes
          </span>
          <h1 className="mt-2 text-2xl font-bold text-gray-800 dark:text-white">
            Centro de reportes
          </h1>
          <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
            Consulta, filtra y revisa datos de la operación diaria por módulo.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeId !== "rep-010" && (
            <span className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-400">
              <FileBarChart2 size={13} className="text-brand-500" />
              {visibleRows.length} registros
              {totalPages > 1 && (
                <span className="ml-1 text-gray-400">· Pág. {page}/{totalPages}</span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* ── KPI cards (ocultas en rep-010) ── */}
      {activeId !== "rep-010" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {preview.summary.map((item) => (
            <StatCard key={item.label} {...item} />
          ))}
        </div>
      )}

      {/* ── Main card ── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">

        {/* Card title (oculto en rep-010 porque MaintenanceReports trae su propio header) */}
        {activeId !== "rep-010" && (
          <div className="border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
              {preview.title}
            </h2>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {preview.description}
            </p>
          </div>
        )}

        {/* Report tabs */}
        <div className="flex flex-wrap gap-2 border-b border-gray-100 px-5 py-3.5 dark:border-white/[0.06]">
          {REPORT_CATALOG.map((r) => (
            <ReportTab
              key={r.id}
              label={r.label}
              active={activeId === r.id}
              onClick={() => handleTabChange(r.id)}
            />
          ))}
        </div>

        {/* Sub-filtros del tab Mantenimiento */}
        {activeId === "rep-009" && (
          <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-3.5 dark:border-white/[0.06] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {([
                { id: "todos",       label: "Todos"      },
                { id: "programados", label: "Programados"},
                { id: "en_proceso",  label: "En proceso" },
                { id: "completados", label: "Completados"},
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { setMaintSubtab(opt.id); setPage(1); }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    maintSubtab === opt.id
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 dark:text-gray-500">Categoría:</span>
              <select
                value={maintCategory}
                onChange={(e) => { setMaintCategory(e.target.value as typeof maintCategory); setPage(1); }}
                className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-gray-200"
              >
                <option value="all">Todas</option>
                <option value="Preventivo">Preventivo</option>
                <option value="Correctivo">Correctivo</option>
                <option value="Motor">Motor</option>
                <option value="Inyector">Inyector</option>
              </select>
            </div>
          </div>
        )}

        {/* Date filter */}
        <div className="border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <DatePicker
                label="Desde"
                value={draft.from}
                onChange={(v) => setDraft((p) => ({ ...p, from: v }))}
                maxDate={draft.to || undefined}
              />
              <DatePicker
                label="Hasta"
                value={draft.to}
                onChange={(v) => setDraft((p) => ({ ...p, to: v }))}
                minDate={draft.from || undefined}
              />
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => { setApplied(draft); setPage(1); }}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95"
                >
                  Consultar
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <CalendarRange size={13} className="shrink-0 text-brand-400" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Rango aplicado
                </p>
                <p className="mt-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                  {applied.from
                    ? new Date(applied.from + "T00:00:00").toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" })
                    : "Inicio abierto"
                  } — {applied.to
                    ? new Date(applied.to + "T00:00:00").toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" })
                    : "Fin abierto"
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Search + Export (oculto en rep-010) */}
        {activeId !== "rep-010" && (
          <div className="border-b border-gray-100 px-5 py-3 dark:border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Buscar dentro del reporte..."
                  className="h-9 w-full rounded-xl border border-gray-200 bg-transparent pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:text-gray-300 dark:placeholder:text-gray-500"
                />
              </div>
              <ExportToolbar
                title={preview.title}
                columns={preview.columns}
                rows={visibleRows}
                subtitle={`Rango: ${applied.from || "inicio abierto"} — ${applied.to || "fin abierto"}`}
                filename={`reporte-${activeId}`}
              />
            </div>
          </div>
        )}

        {/* Table body (oculto en rep-010: usamos MaintenanceReports) */}
        {activeId === "rep-010" ? (
          <div className="p-5">
            <MaintenanceReports />
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Cargando datos...</span>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <FileBarChart2 size={20} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm font-medium text-gray-400 dark:text-gray-500">Sin registros</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Ninguna fila coincide con el rango o filtro actual.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                    {preview.columns.map((col) => (
                      <th
                        key={col.key}
                        className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                  {pagedRows.map((row, i) => (
                    <tr
                      key={i}
                      className="transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02]"
                    >
                      {preview.columns.map((col) => (
                        <td
                          key={col.key}
                          className="px-5 py-3.5 text-gray-600 dark:text-gray-300"
                        >
                          {String(row[col.key] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ── */}
            <Pagination
              page={page}
              totalPages={totalPages}
              onPrev={() => setPage((p) => p - 1)}
              onNext={() => setPage((p) => p + 1)}
              onPage={setPage}
            />
          </>
        )}

      </div>
    </div>
  );
}