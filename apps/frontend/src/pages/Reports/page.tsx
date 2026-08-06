"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useAssets } from "../../hooks/useAssets";
import { useDrivers } from "../../hooks/useDrivers";
import { useAssignments } from "../../hooks/useAssignments";
import { useMaintenancesList, useMaintenanceCategories } from "../../hooks/useMaintenancesV2";
import { useChecklists } from "../../hooks/useChecklists";
import { useAlerts } from "../../hooks/useAlerts";
import { useFuel } from "../../hooks/useFuel";
import { useExitAuthorizations } from "../../hooks/useExitAuthorizations";
import { useWorkshops } from "../../hooks/useWorkshops";
import { useSuppliers } from "../../hooks/useSuppliers";
import { useCostBreakdown } from "../../hooks/useCostBreakdown";
import { CostBreakdownFilters, CostBreakdownPanel } from "../Mantenimientos/components/CostBreakdown";
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
  Truck,
  Users,
  Wallet,
  Wallet2,
  ClipboardList,
  Fuel,
  Bell,
  Package,
  ShieldCheck,
  ListChecks,
  Wrench,
  BarChart3,
  Table2,
  Sparkles,
  Pin,
  PinOff,
  FileText,
  Sheet,
  FileDown,
  Copy,
  MoreVertical,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ExportToolbar } from "../../components/ui/export-toolbar/ExportToolbar";
import { Pagination as UiPagination } from "../../components/ui/Pagination";
import { GroupedExportButton } from "./GroupedExportButton";
import { DatePicker } from "../../components/ui/date-picker/DatePicker";
import { EstadisticasTab } from "./EstadisticasTab";
import { FiltradoTab } from "./FiltradoTab";
import { ReportDetailDrawer } from "./ReportDetailDrawer";
import { useAuth } from "../../context/AuthContext";
import { useFinance } from "../../hooks/useFinance";
import { usePermissions } from "../../hooks/usePermissions";
import type { PettyCashClosedAccountRow } from "../../hooks/useFinance";
import { fmtDateTimeEc, fmtDateShortEc } from "@/lib/datetime";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 6;
const SIDEBAR_EXPANDED_WIDTH = 216;
const SIDEBAR_COLLAPSED_WIDTH = 56;

/** Quita el prefijo "workshop-"/"supplier-" del ID serializado por el backend.
 *  El backend usa `toId('workshop', n)` que devuelve "workshop-123", pero el
 *  estado del filtro de este módulo (`maintWorkshopId`, `maintSupplierId`)
 *  guarda el número puro. Para que el <select value={n}> matchee contra
 *  <option value="w.id}>, ambos lados tienen que estar en el mismo formato. */
function stripIdPrefix(id: string): string {
  return String(id ?? "").replace(/^(workshop|supplier|asset|maintenance|company|company-user|maint-cat|maint-event)-/, "");
}

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

export type ReportRow = Record<string, unknown>;

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

// ─── Módulos con íconos y colores ─────────────────────────────────────────────

type ModuleDef = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Paleta del sistema: emerald / amber / rose / blue / cyan / violet / orange / fuchsia / teal. */
  palette: "emerald" | "amber" | "rose" | "blue" | "cyan" | "violet" | "orange" | "fuchsia" | "teal";
  short: string;
  /**
   * jul 2026 v6 — Módulo de empresa requerido para que esta sección
   * del sidebar de reportes se muestre. Si la empresa no tiene este
   * módulo activo, el item se oculta del sidebar. Coincide con la
   * `MODULE_TREE` key del backend (gestion, mantenimiento, combustible,
   * checklist, alertas, autorizaciones, etc.).
   */
  requiresModule?: string;
};

const REPORT_MODULES: ModuleDef[] = [
  // jul 2026 v6 — `requiresModule` filtra el sidebar interno de /reportes
  // según los módulos activos de la empresa. Si la empresa no tiene
  // `mantenimiento` activo, "Mantenimiento" no aparece en este sidebar.
  // El backend ya valida con `requireModule(...)` en cada endpoint, pero
  // esta capa evita mostrar opciones que romperían al clickear.
  { id: "rep-001", label: "Gerencial",       icon: ShieldCheck, palette: "emerald", short: "Estado general de la flota"          },
  { id: "rep-002", label: "Asignaciones",    icon: Users,       palette: "blue",    short: "Conductor, placa y disponibilidad",  requiresModule: "gestion"        },
  { id: "rep-003", label: "Gastos",          icon: Wallet,      palette: "amber",   short: "Combustible + mantenimiento",       requiresModule: "combustible"    },
  { id: "rep-004", label: "Checklist",       icon: ClipboardList, palette: "cyan",  short: "Inspecciones y hallazgos",           requiresModule: "checklist"      },
  { id: "rep-005", label: "Combustible",     icon: Fuel,        palette: "orange",  short: "Cargas, km, costo por estación",    requiresModule: "combustible"    },
  { id: "rep-006", label: "Alertas",         icon: Bell,        palette: "rose",    short: "Severidad y estado",                 requiresModule: "alertas"        },
  { id: "rep-008", label: "Autorizaciones",  icon: ShieldCheck, palette: "teal",    short: "Salidas de vehículos",               requiresModule: "autorizaciones" },
  { id: "rep-009", label: "Mantenimiento",   icon: Wrench,      palette: "fuchsia", short: "Órdenes de trabajo",                 requiresModule: "mantenimiento"  },
  // jul 2026 — Histórico de cajas chicas CERRADAS. Cada fila = una cuenta con
  // isActive=false (modo period cerrado por cron, o modo balance reemplazado
  // al reconfigurar). Al click abre un drawer con el flow completo
  // (movements + vouchers + requests) en formato línea de tiempo.
  { id: "rep-010", label: "Caja chica",      icon: Wallet2,     palette: "violet",  short: "Histórico de cajas chicas cerradas", requiresModule: "finanzas"       },
];

const ADMIN_ROLES = new Set(["owner_empresa", "admin_empresa", "superadmin"]);

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

// jul 2026 v9 — Para mantenimiento, el "rango del día" debe
// matchear la fecha PROGRAMADA (scheduledFor) O la fecha REAL de
// trabajo (completedAt). Un mantenimiento programado para mañana
// pero completado HOY debe aparecer en la lista de HOY también.
// Si `otherDate` está seteada, la fila entra si CUALQUIERA de
// las dos fechas cae en el rango.
function isInRangeDual(
  primary:   string | undefined,
  otherDate: string | undefined,
  range:     DateRange,
) {
  if (!primary && !otherDate) return true;
  const d1 = primary   ? String(primary).slice(0, 10)   : null;
  const d2 = otherDate ? String(otherDate).slice(0, 10) : null;
  // La fila entra si scheduledFor está en rango OR completedAt
  // está en rango. Si alguno de los dos está vacío, usamos el
  // otro como único criterio (cae al comportamiento legacy).
  if (d1 && isInRange(d1, range)) return true;
  if (d2 && isInRange(d2, range)) return true;
  // Si los dos están seteados pero ninguno matchea, no entra.
  if (d1 || d2) return false;
  return true;
}

function filterRows(rows: ReportRow[], columns: ReportColumn[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    columns.some((col) => String(row[col.key] ?? "").toLowerCase().includes(q))
  );
}

// ─── Color tokens por paleta (light + dark) ───────────────────────────────────

const PALETTE: Record<ModuleDef["palette"], {
  border:    string;
  bg:        string;
  bgActive:  string;
  icon:      string;
  text:      string;
  dot:       string;
  kpi:       string;
  wave:      string;
}> = {
  emerald: {
    border:   "border-emerald-200 dark:border-emerald-500/30",
    bg:       "bg-emerald-50/40 dark:bg-emerald-500/[0.04]",
    bgActive: "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30",
    icon:     "text-emerald-600 dark:text-emerald-400",
    text:     "text-emerald-900 dark:text-emerald-200",
    dot:      "bg-emerald-500",
    kpi:      "from-emerald-500/15 via-emerald-500/5 to-transparent",
    wave:     "#10b981",
  },
  amber: {
    border:   "border-amber-200 dark:border-amber-500/30",
    bg:       "bg-amber-50/40 dark:bg-amber-500/[0.04]",
    bgActive: "bg-amber-500 text-white shadow-lg shadow-amber-500/30",
    icon:     "text-amber-600 dark:text-amber-400",
    text:     "text-amber-900 dark:text-amber-200",
    dot:      "bg-amber-500",
    kpi:      "from-amber-500/15 via-amber-500/5 to-transparent",
    wave:     "#f59e0b",
  },
  rose: {
    border:   "border-rose-200 dark:border-rose-500/30",
    bg:       "bg-rose-50/40 dark:bg-rose-500/[0.04]",
    bgActive: "bg-rose-500 text-white shadow-lg shadow-rose-500/30",
    icon:     "text-rose-600 dark:text-rose-400",
    text:     "text-rose-900 dark:text-rose-300",
    dot:      "bg-rose-500",
    kpi:      "from-rose-500/15 via-rose-500/5 to-transparent",
    wave:     "#f43f5e",
  },
  blue: {
    border:   "border-blue-200 dark:border-blue-500/30",
    bg:       "bg-blue-50/40 dark:bg-blue-500/[0.04]",
    bgActive: "bg-blue-500 text-white shadow-lg shadow-blue-500/30",
    icon:     "text-blue-600 dark:text-blue-400",
    text:     "text-blue-900 dark:text-blue-200",
    dot:      "bg-blue-500",
    kpi:      "from-blue-500/15 via-blue-500/5 to-transparent",
    wave:     "#3b82f6",
  },
  cyan: {
    border:   "border-cyan-200 dark:border-cyan-500/30",
    bg:       "bg-cyan-50/40 dark:bg-cyan-500/[0.04]",
    bgActive: "bg-cyan-500 text-white shadow-lg shadow-cyan-500/30",
    icon:     "text-cyan-600 dark:text-cyan-400",
    text:     "text-cyan-900 dark:text-cyan-200",
    dot:      "bg-cyan-500",
    kpi:      "from-cyan-500/15 via-cyan-500/5 to-transparent",
    wave:     "#06b6d4",
  },
  violet: {
    border:   "border-violet-200 dark:border-violet-500/30",
    bg:       "bg-violet-50/40 dark:bg-violet-500/[0.04]",
    bgActive: "bg-violet-500 text-white shadow-lg shadow-violet-500/30",
    icon:     "text-violet-600 dark:text-violet-400",
    text:     "text-violet-900 dark:text-violet-200",
    dot:      "bg-violet-500",
    kpi:      "from-violet-500/15 via-violet-500/5 to-transparent",
    wave:     "#8b5cf6",
  },
  orange: {
    border:   "border-orange-200 dark:border-orange-500/30",
    bg:       "bg-orange-50/40 dark:bg-orange-500/[0.04]",
    bgActive: "bg-orange-500 text-white shadow-lg shadow-orange-500/30",
    icon:     "text-orange-600 dark:text-orange-400",
    text:     "text-orange-900 dark:text-orange-200",
    dot:      "bg-orange-500",
    kpi:      "from-orange-500/15 via-orange-500/5 to-transparent",
    wave:     "#f97316",
  },
  fuchsia: {
    border:   "border-fuchsia-200 dark:border-fuchsia-500/30",
    bg:       "bg-fuchsia-50/40 dark:bg-fuchsia-500/[0.04]",
    bgActive: "bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/30",
    icon:     "text-fuchsia-600 dark:text-fuchsia-400",
    text:     "text-fuchsia-900 dark:text-fuchsia-200",
    dot:      "bg-fuchsia-500",
    kpi:      "from-fuchsia-500/15 via-fuchsia-500/5 to-transparent",
    wave:     "#d946ef",
  },
  teal: {
    border:   "border-teal-200 dark:border-teal-500/30",
    bg:       "bg-teal-50/40 dark:bg-teal-500/[0.04]",
    bgActive: "bg-teal-500 text-white shadow-lg shadow-teal-500/30",
    icon:     "text-teal-600 dark:text-teal-400",
    text:     "text-teal-900 dark:text-teal-200",
    dot:      "bg-teal-500",
    kpi:      "from-teal-500/15 via-teal-500/5 to-transparent",
    wave:     "#14b8a6",
  },
};

// ─── Agrupación por placa (acordeón colapsable) ───────────────────────────────
// Módulos que muestran sus filas agrupadas por placa/equipo en lugar de una
// tabla plana. Cada módulo tiene su propio campo de agrupación y su propio
// set de columnas numéricas a sumar como subtotal/gran total.

const GROUPED_MODULES = new Set(["rep-003", "rep-004", "rep-005", "rep-008", "rep-009", "rep-010"]);

// jul 2026 — Pill de categoría para la columna "Categoría" del reporte
// de mantenimientos (rep-009). El dot usa el color de la categoría; las
// custom pueden traer un color hex arbitrario que se aplica via inline
// style. `dot` es la clase Tailwind del dot (reservada para built-in);
// `cls` es el estilo completo del pill (texto + fondo tinted).
const CATEGORY_PILL: Record<string, { dot: string; cls: string }> = {
  "Primordial:Bombas":   { dot: "bg-amber-500",   cls: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 ring-1 ring-amber-200/60 dark:ring-amber-500/20" },
  "Primordial:Motores":  { dot: "bg-cyan-500",    cls: "text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-500/10 ring-1 ring-cyan-200/60 dark:ring-cyan-500/20" },
  "Aceite:Cambio":       { dot: "bg-yellow-500",  cls: "text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-500/10 ring-1 ring-yellow-200/60 dark:ring-yellow-500/20" },
  "Aceite:Inventario":   { dot: "bg-emerald-500", cls: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 ring-1 ring-emerald-200/60 dark:ring-emerald-500/20" },
  "Lavada":              { dot: "bg-sky-500",     cls: "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-500/10 ring-1 ring-sky-200/60 dark:ring-sky-500/20" },
  "Otro":                { dot: "bg-gray-400",    cls: "text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/[0.04] ring-1 ring-gray-200/60 dark:ring-white/[0.08]" },
};
const CATEGORY_PILL_FALLBACK = CATEGORY_PILL["Otro"];

/** Resuelve la config visual del pill para una categoría. */
function resolveCategoryPill(
  key: string | null | undefined,
  builtinCats: { key: string; label: string }[],
  customCats: { key: string; label: string; color: string }[],
): { key: string; label: string; dot: string; cls: string; customColor: string | null } {
  const k = key || "Otro";
  // Built-in primero (mismo color/cls que MaintenanceListTab).
  const builtin = builtinCats.find((c) => c.key === k);
  if (builtin && CATEGORY_PILL[k]) {
    return { key: k, label: builtin.label, dot: CATEGORY_PILL[k].dot, cls: CATEGORY_PILL[k].cls, customColor: null };
  }
  // Custom — el color hex viene del backend.
  const custom = customCats.find((c) => c.key === k);
  if (custom) {
    return {
      key: k,
      label: custom.label,
      dot: "",  // no usamos className; el color se aplica via style
      cls: "text-gray-700 dark:text-gray-200 bg-white dark:bg-white/[0.04] ring-1 ring-gray-200 dark:ring-white/[0.08]",
      customColor: custom.color || null,
    };
  }
  // Fallback a "Otro".
  return { key: "Otro", label: "Otro", dot: CATEGORY_PILL_FALLBACK.dot, cls: CATEGORY_PILL_FALLBACK.cls, customColor: null };
}

/** Campo de ReportRow que actúa como clave de agrupación (placa / equipo). */
const GROUP_KEY: Record<string, string> = {
  "rep-003": "plate",
  "rep-004": "equipment",
  "rep-005": "plate",
  "rep-008": "assetPlate",
  "rep-009": "assetPlate",
  "rep-010": "site",
};

/**
 * Columnas numéricas a sumar para el subtotal/total de cada módulo.
 * El valor de estas columnas en ReportRow puede ser number o string
 * con número (e.g. "10.00 USD"); parseNum se encarga de normalizar.
 */
const NUMERIC_COLS: Record<string, string[]> = {
  "rep-003": ["amount"],                // Gastos
  "rep-004": [],                         // Checklist no tiene columna de dinero
  "rep-005": ["total"],                 // Combustible
  "rep-008": [],                         // Autorizaciones no tiene columna de dinero
  "rep-009": ["labor", "parts", "cost"], // Mantenimiento
  "rep-010": ["initial", "final", "movements", "vouchers", "requests"], // Caja chica
};

/** Parsea un valor numérico, ya sea number o string con formato moneda. */
function parseNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Agrupa un array de ReportRow por el valor de `groupKey`.
 * Preserva el orden de primera aparición de cada grupo.
 * Filas con valor vacío o "—" caen bajo "Sin placa".
 */
function groupRowsByKey(
  rows: ReportRow[],
  groupKey: string,
): Array<{ groupValue: string; rows: ReportRow[] }> {
  const map = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const raw = String(row[groupKey] ?? "").trim();
    const key = raw === "" || raw === "—" ? "Sin placa" : raw;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return Array.from(map.entries()).map(([groupValue, rows]) => ({ groupValue, rows }));
}

/** Suma las columnas numéricas de un array de rows. */
function sumNumericCols(
  rows: ReportRow[],
  cols: string[],
): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const col of cols) acc[col] = 0;
  for (const row of rows) {
    for (const col of cols) {
      acc[col] += parseNum(row[col]);
    }
  }
  return acc;
}

/** Formatea un valor numérico de subtotal como moneda USD o entero. */
const MONEY_COLS = new Set(["amount", "total", "cost", "labor", "parts"]);
function fmtSubtotal(value: number, col: string): string {
  if (MONEY_COLS.has(col)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD", maximumFractionDigits: 2,
    }).format(value);
  }
  return value.toLocaleString("es-CO");
}

// ─── Wave chart inline (SVG, sin libs externas) ──────────────────────────────

function WaveBar({ value, max, color }: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? value / max : 0;
  const w = 240;
  const h = 40;
  const points: string[] = [];
  const samples = 40;
  for (let i = 0; i <= samples; i++) {
    const x = (i / samples) * w;
    const phase = (i / samples) * Math.PI * 2.5;
    const baseY = h * (1 - pct);
    const wave = Math.sin(phase) * 7;
    const y = Math.max(3, Math.min(h - 3, baseY + wave * (1 - Math.abs(pct - 0.5) * 0.6)));
    points.push(`${x},${y}`);
  }
  const path = `M ${points.join(" L ")}`;
  const fillPath = `${path} L ${w},${h} L 0,${h} Z`;
  const gradId = `wave-${color.replace("#", "")}-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradId})`} />
      <path d={path} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ─── KPI card con wave + color de módulo ─────────────────────────────────────

function KpiCard({
  item,
  palette,
  maxValue,
  numericValue,
}: {
  item: SummaryItem;
  palette: ModuleDef["palette"];
  maxValue: number;
  numericValue: number;
}) {
  const p = PALETTE[palette];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`relative overflow-hidden rounded-2xl border ${p.border} ${p.bg} p-3.5`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${p.kpi}`} />

      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          {item.label}
        </p>
        <span className={`h-2 w-2 rounded-full ${p.dot} shadow-[0_0_0_3px] shadow-current/10`} />
      </div>

      <p className={`relative mt-1 text-xl sm:text-2xl font-black tabular-nums ${p.text}`}>
        {item.value}
      </p>
      <p className="relative mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
        {item.detail}
      </p>

      <div className="relative mt-1.5 -mx-1 -mb-1">
        <WaveBar value={numericValue} max={maxValue} color={p.wave} />
      </div>
    </motion.div>
  );
}

// ─── Sidebar de módulos (hover-expand, igual lógica que EstadisticasTab) ──────

function ModuleSidebar({
  activeId,
  onSelect,
  modules,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  modules: ModuleDef[];
}) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const closeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expanded = pinned || hovered;

  function enter() {
    if (closeRef.current) { clearTimeout(closeRef.current); closeRef.current = null; }
    setHovered(true);
  }
  function leave() {
    if (pinned) return;
    closeRef.current = setTimeout(() => setHovered(false), 200);
  }

  return (
    <motion.nav
      aria-label="Módulos de reporte"
      onMouseEnter={enter}
      onMouseLeave={leave}
      animate={{ width: expanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="relative shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]"
      style={{ willChange: "width" }}
    >
      <div className="flex h-full flex-col p-2">
        <div className={`flex items-center pb-2 pt-1 ${expanded ? "justify-start px-1.5" : "justify-center"}`}>
          {expanded ? (
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              Módulos
            </p>
          ) : (
            <FileBarChart2 size={15} className="text-gray-400" />
          )}
        </div>

        <ul className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden">
          {modules.map((m) => {
            const isActive = activeId === m.id;
            const Icon = m.icon;
            const p = PALETTE[m.palette];
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onSelect(m.id)}
                  title={!expanded ? m.label : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative flex w-full items-center gap-2.5 rounded-xl text-left transition-colors
                    ${expanded ? "px-2 py-2" : "h-11 w-11 mx-auto justify-center"}
                    ${isActive
                      ? p.bgActive
                      : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                    }`}
                >
                  <span
                    className={`flex shrink-0 items-center justify-center rounded-lg
                      ${expanded ? "h-7 w-7" : "h-8 w-8"}
                      ${isActive ? "bg-white/20 text-white" : `${p.bg} ${p.icon}`}`}
                  >
                    <Icon size={expanded ? 13 : 15} />
                  </span>
                  {expanded && (
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-xs font-semibold ${isActive ? "text-white" : ""}`}>
                        {m.label}
                      </span>
                      <span className={`block truncate text-[10px] ${isActive ? "text-white/80" : "text-gray-400 dark:text-gray-500"}`}>
                        {m.short}
                      </span>
                    </span>
                  )}
                  {isActive && (
                    <motion.span
                      layoutId="module-active-dot"
                      className={`h-1.5 w-1.5 rounded-full bg-white ${expanded ? "" : "absolute right-1.5 top-1.5"}`}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className={`mt-1 flex border-t border-gray-100 pt-2 dark:border-white/[0.05] ${expanded ? "justify-end px-1" : "justify-center"}`}>
          <button
            type="button"
            onClick={() => setPinned((v) => !v)}
            title={pinned ? "Soltar" : "Fijar"}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
              pinned
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
            }`}
          >
            {pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
        </div>
      </div>
    </motion.nav>
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
    <div className="flex items-center justify-between border-t border-gray-100 dark:border-white/[0.06] px-4 py-2.5">
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

// ─── GroupedExportKebab ──────────────────────────────────────────────────────
// jul 2026 v9.5 — Variante COMPACTA de GroupedExportButton. En vez del
// botón grande "Exportar" con icono, usamos 3 puntitos verticales
// (MoreVertical de Lucide) que ocupa lo mínimo y deja respirar la
// carpetita. Al hacer click abre el mismo dropdown de 4 opciones
// (PDF / CSV / Excel / Copiar) usando portal para no chocar con
// el overflow del contenedor scrollable.
//
// Reutiliza las funciones de `groupedExport.ts` directamente para no
// duplicar lógica de generación. Solo cambia el trigger visual.
// ────────────────────────────────────────────────────────────────────────────


import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  exportGroupedToPdf,
  exportGroupedToExcel,
  exportGroupedToCsv,
  copyGroupedToClipboard,
  type GroupedColumn,
  type GroupedRow,
} from "./groupedExport";

type GroupedExportKebabProps = {
  title: string;
  subtitle?: string;
  filename: string;
  columns: GroupedColumn[];
  rows: GroupedRow[];
  numericCols: string[];
  palette: string;
};

function GroupedExportKebab({
  title, subtitle, filename, columns, rows, numericCols, palette,
}: GroupedExportKebabProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number; openUpward: boolean } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const recalcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setPos({
      top: rect.bottom,
      right: window.innerWidth - rect.right,
      openUpward: spaceBelow < 240,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function run(id: string, fn: () => Promise<void> | void) {
    setLoading(id);
    setOpen(false);
    try {
      await fn();
      toast.success(id === "copy" ? "Copiado" : "Archivo generado", {
        description: id === "copy" ? "Listo para pegar." : "Descarga iniciada.",
      });
    } catch (err) {
      toast.error("Error al exportar", {
        description: err instanceof Error ? err.message : "Intenta de nuevo.",
      });
    } finally {
      setLoading(null);
    }
  }

  const groups = [{ groupValue: title.split(" — ").pop() ?? title, rows }];
  const items: { id: string; label: string; icon: React.ReactNode; run: () => Promise<void> | void }[] = [
    { id: "pdf",   label: "Exportar a PDF",   icon: <FileText size={13} />, run: () => exportGroupedToPdf({ title, subtitle, filename, columns, groups, numericCols, palette }) },
    { id: "csv",   label: "Exportar a CSV",   icon: <FileDown size={13} />, run: () => exportGroupedToCsv({ title, filename, columns, groups, numericCols }) },
    { id: "excel", label: "Exportar a Excel", icon: <Sheet    size={13} />, run: () => exportGroupedToExcel({ title, filename, columns, groups, numericCols, palette }) },
    { id: "copy",  label: "Copiar al portapapeles", icon: <Copy size={13} />, run: () => copyGroupedToClipboard({ title, filename, columns, groups, numericCols }) },
  ];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { recalcPos(); setOpen((v) => !v); }}
        disabled={loading !== null}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
        title="Opciones de exportación"
        aria-label="Exportar"
      >
        {loading
          ? <Loader2 size={13} className="animate-spin" />
          : <MoreVertical size={14} />
        }
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: pos.openUpward ? undefined : pos.top + 6,
            bottom: pos.openUpward ? `calc(100vh - ${pos.top}px + 6px)` : undefined,
            right: pos.right,
            zIndex: 9999,
          }}
          className="min-w-[180px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl shadow-black/[0.08] dark:border-white/[0.08] dark:bg-gray-900 dark:shadow-black/40"
        >
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              disabled={loading === it.id}
              onClick={() => run(it.id, it.run)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12px] text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-white/[0.04]"
            >
              <span className="text-gray-400 dark:text-gray-500">{it.icon}</span>
              <span className="font-medium">{it.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── GroupedReportTable ──────────────────────────────────────────────────────
// Tabla con acordeón agrupado por placa/equipo. Reemplaza la tabla plana
// para los módulos en GROUPED_MODULES.
//
// Cada grupo es colapsable; cuando se abre muestra las filas del grupo y
// (si hay columnas numéricas) una fila de subtotal al final. Al pie de
// todos los grupos se muestra una fila de gran total.
//
// Comportamiento:
//  • Un solo grupo abierto a la vez (click en otro cierra el anterior).
//  • Al cambiar las filas (filtros), se cierran todos los grupos.
//  • El header de la tabla (nombres de columna) siempre está visible arriba.
//  • (rep-009) Cada carpetita puede tener su propio filtro de categoría,
//    que solo afecta las filas mostradas DENTRO de esa carpetita — el
//    encabezado colapsado y el gran total siguen reflejando todo.
//
// FIX SCROLL: antes el header y cada grupo abierto eran contenedores
// `overflow-x-auto` INDEPENDIENTES, cada uno con su propio `scrollLeft`.
// Al arrastrar la barra horizontal de un bloque, el otro no se enteraba
// — resultado: las filas se movían pero el header quedaba fijo (o al
// revés). Ahora hay un ÚNICO `overflow-x-auto` que envuelve header +
// todos los grupos, así que todo se desplaza siempre en conjunto.

function GroupedReportTable({
  columns,
  rows,
  groupKey,
  numericCols,
  moduleId,
  palette,
  moduleTitle,
  moduleSubtitle,
  moduleFilename,
  onRowClick,
  categories,
  enableCategoryFilter = false,
  subcategories,
  enableSubcategoryFilter = false,
  types,
  enableTypeFilter = false,
}: {
  columns: ReportColumn[];
  rows: ReportRow[];
  groupKey: string;
  numericCols: string[];
  moduleId: string;
  palette: ModuleDef["palette"];
  moduleTitle: string;
  moduleSubtitle: string;
  moduleFilename: string;
  onRowClick: (row: ReportRow) => void;
  categories?: { key: string; label: string }[];
  enableCategoryFilter?: boolean;
  subcategories?: Array<{ parentKey: string; key: string; label: string }>;
  enableSubcategoryFilter?: boolean;
  types?: { key: string; label: string }[];
  enableTypeFilter?: boolean;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [groupCategoryFilter, setGroupCategoryFilter] = useState<Record<string, string>>({});
  const [groupTypeFilter, setGroupTypeFilter] = useState<Record<string, string>>({});
  const [groupSubcategoryFilter, setGroupSubcategoryFilter] = useState<Record<string, string>>({});

  const p = PALETTE[palette];

  const groups = useMemo(() => groupRowsByKey(rows, groupKey), [rows, groupKey]);
  const grandTotal = useMemo(() => sumNumericCols(rows, numericCols), [rows, numericCols]);

  useEffect(() => {
    setOpenGroup(null);
    setGroupCategoryFilter({});
    setGroupTypeFilter({});
    setGroupSubcategoryFilter({});
  }, [rows]);

  function toggle(g: string) {
    setOpenGroup((cur) => (cur === g ? null : g));
  }

  function setCategoryFor(groupValue: string, catKey: string) {
    setGroupCategoryFilter((prev) => ({ ...prev, [groupValue]: catKey }));
    setGroupSubcategoryFilter((prev) => {
      if (!(groupValue in prev)) return prev;
      const { [groupValue]: _drop, ...rest } = prev;
      return rest;
    });
  }
  function setTypeFor(groupValue: string, typeKey: string) {
    setGroupTypeFilter((prev) => ({ ...prev, [groupValue]: typeKey }));
  }
  function setSubcategoryFor(groupValue: string, subKey: string) {
    setGroupSubcategoryFilter((prev) => ({ ...prev, [groupValue]: subKey }));
  }

  const handleExportPdf = (groupValue: string, groupRows: ReportRow[]) => {
    void import("./groupedExport").then(({ exportGroupedToPdf }) => {
      void exportGroupedToPdf({
        title: `${moduleTitle} — ${groupValue}`,
        subtitle: moduleSubtitle,
        filename: `${moduleFilename}-${groupValue.replace(/\s+/g, "_").toLowerCase()}.pdf`,
        columns,
        groups: [{ groupValue, rows: groupRows }],
        numericCols,
        palette,
      });
    });
  };
  const handleExportExcel = (groupValue: string, groupRows: ReportRow[]) => {
    void import("./groupedExport").then(({ exportGroupedToExcel }) => {
      void exportGroupedToExcel({
        title: `${moduleTitle} — ${groupValue}`,
        filename: `${moduleFilename}-${groupValue.replace(/\s+/g, "_").toLowerCase()}.xlsx`,
        columns,
        groups: [{ groupValue, rows: groupRows }],
        numericCols,
        palette,
      });
    });
  };

  // ── Grid único compartido por header, filas, subtotales y total general ──
  // jul 2026 v10.1 — Antes la fila de la carpetita (toggle) y las de
  // subtotal/total armaban un grid APARTE solo para las columnas numéricas,
  // con columnGap: 24. El header no tenía ese gap, así que cada columna
  // numérica quedaba desplazada respecto al header (arrastrando el error
  // en cascada: MANO OBRA, REPUESTOS y COSTO TOTAL cada vez más desalineados).
  // Ahora TODAS las filas usan el mismo `gridTemplate`, columna por columna,
  // así que quedan pegadas al pixel contra el header. Se agrega una columna
  // extra de 44px al final, reservada para el botón de exportar (kebab),
  // que en el header y en las filas de datos simplemente queda vacía.
  const gridTemplate = useMemo(
    () =>
      [
        ...columns.map((col) =>
          numericCols.includes(col.key)
            ? "108px"
            : `minmax(${Math.max(110, col.label.length * 9 + 36)}px, 1.3fr)`
        ),
        "44px", // columna de acciones (kebab)
      ].join(" "),
    [columns, numericCols],
  );

  // Índice de la primera columna numérica. Todo lo que va ANTES de ese
  // índice es el "área de etiqueta" (nombre del grupo, badge, etc.), que
  // ocupa esas columnas vía gridColumn span. Todo lo que va DESDE ese
  // índice se recorre celda por celda: numérica → valor, no numérica → vacío.
  // Esto también soporta módulos donde la columna numérica NO es la última
  // (ej. rep-003 "Gastos", donde "amount" va antes de "status"/"date").
  const firstNumericIdx = useMemo(() => {
    const idx = columns.findIndex((c) => numericCols.includes(c.key));
    return idx === -1 ? columns.length : idx;
  }, [columns, numericCols]);

  const minTableWidth = useMemo(
    () =>
      columns.reduce(
        (sum, col) =>
          sum + (numericCols.includes(col.key) ? 108 : Math.max(110, col.label.length * 9 + 36)),
        0,
      ) + 44,
    [columns, numericCols],
  );

  const [page, setPage] = useState(1);
  const pageSize = 10;
  useEffect(() => { setPage(1); }, [groups.length]);
  const pagedGroups = groups.slice((page - 1) * pageSize, page * pageSize);

  if (groups.length === 0) return null;

  return (
    <div>
      <div className="max-h-[70vh] overflow-x-auto overflow-y-auto rounded-lg border border-gray-200/60 dark:border-white/[0.06]">
        <div style={{ minWidth: minTableWidth }}>
          {/* ── Header (siempre visible) ── */}
          <div
            className="sticky top-0 z-20 grid border-b border-gray-200 bg-gray-50/95 backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#0f172a]/95"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {columns.map((col) => (
              <div
                key={col.key}
                title={col.label}
                className={`truncate px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 ${
                  numericCols.includes(col.key) ? "text-right" : "text-left"
                }`}
              >
                {col.label}
              </div>
            ))}
          </div>

          {/* ── Lista de grupos ── */}
          <div>
            {pagedGroups.map(({ groupValue, rows: groupRows }) => {
              const isOpen = openGroup === groupValue;
              const subtotals = sumNumericCols(groupRows, numericCols);
              const groupId = `group-${moduleId}-${groupValue.replace(/\s+/g, "_")}`;

              const catFilter = groupCategoryFilter[groupValue] ?? "all";
              const typeFilter = groupTypeFilter[groupValue] ?? "all";
              const subFilter = groupSubcategoryFilter[groupValue] ?? "all";

              const filteredGroupRows = groupRows.filter((r) => {
                if (enableCategoryFilter && catFilter !== "all" && String(r.categoryKey ?? "") !== catFilter) return false;
                if (enableTypeFilter && typeFilter !== "all" && String(r.kind ?? "") !== typeFilter) return false;
                if (enableSubcategoryFilter && subFilter !== "all") {
                  if (String(r.subcategoryKey ?? "") !== subFilter) return false;
                }
                return true;
              });
              const filteredSubtotals = sumNumericCols(filteredGroupRows, numericCols);

              const subsForGroup = enableSubcategoryFilter
                ? (subcategories ?? []).filter((s) => (catFilter === "all" ? true : s.parentKey === catFilter))
                : [];

              const anyFilterActive =
                (enableCategoryFilter && catFilter !== "all") ||
                (enableSubcategoryFilter && subFilter !== "all") ||
                (enableTypeFilter && typeFilter !== "all");

              return (
                <div key={groupValue} className="border-b border-gray-100 dark:border-white/[0.06]">
                  {/* ── Fila toggle de la carpetita — mismo grid que el header ── */}
                  <button
                    type="button"
                    onClick={() => toggle(groupValue)}
                    aria-expanded={isOpen}
                    aria-controls={groupId}
                    className={`grid w-full items-center text-left transition-colors cursor-pointer ${
                      isOpen
                        ? `${p.bg} border-l-4 ${p.border}`
                        : "bg-gray-50/40 dark:bg-white/[0.02] hover:bg-gray-100 dark:hover:bg-white/[0.04]"
                    }`}
                    style={{ gridTemplateColumns: gridTemplate }}
                  >
                    <div
                      style={{ gridColumn: `1 / ${firstNumericIdx + 1}` }}
                      className="flex min-w-0 items-center gap-3 px-4 py-3.5"
                    >
                      <ChevronRight
                        size={14}
                        className={`shrink-0 text-gray-400 dark:text-gray-500 transition-transform ${
                          isOpen ? "rotate-90" : ""
                        }`}
                      />
                      <span className={`h-1.5 w-1.5 rounded-full ${p.dot} shrink-0`} />
                      <span className="min-w-0 truncate font-semibold text-sm text-gray-800 dark:text-white">
                        {groupValue}
                      </span>
                      <span className="shrink-0 rounded-md bg-gray-200/60 dark:bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 tabular-nums">
                        {groupRows.length} registro{groupRows.length !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {columns.slice(firstNumericIdx).map((col) => (
                      <div
                        key={col.key}
                        className={`px-4 py-3.5 ${
                          numericCols.includes(col.key)
                            ? "text-right tabular-nums text-sm font-bold text-gray-800 dark:text-white"
                            : ""
                        }`}
                      >
                        {numericCols.includes(col.key) ? fmtSubtotal(subtotals[col.key] ?? 0, col.key) : null}
                      </div>
                    ))}

                    <div
                      className="flex items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GroupedExportKebab
                        title={`${moduleTitle} — ${groupValue}`}
                        subtitle={moduleSubtitle}
                        filename={`${moduleFilename}-${groupValue.replace(/\s+/g, "_").toLowerCase()}`}
                        columns={columns}
                        rows={filteredGroupRows}
                        numericCols={numericCols}
                        palette={palette}
                      />
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        id={groupId}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        {/* ── Dropdowns de Tipo, Categoría y Sub-categoría ── */}
                        {((enableTypeFilter && types && types.length > 0) ||
                          (enableCategoryFilter && categories && categories.length > 0) ||
                          (enableSubcategoryFilter && subcategories && subcategories.length > 0)) && (
                          <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/60 dark:bg-white/[0.02] px-4 py-2">
                            {enableTypeFilter && types && types.length > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                  Tipo
                                </span>
                                <select
                                  value={typeFilter}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => setTypeFor(groupValue, e.target.value)}
                                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-gray-200"
                                >
                                  <option value="all">Todos los tipos</option>
                                  {types.map((t) => (
                                    <option key={t.key} value={t.key}>{t.label}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            {enableCategoryFilter && categories && categories.length > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                  Categoría
                                </span>
                                <select
                                  value={catFilter}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => setCategoryFor(groupValue, e.target.value)}
                                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-gray-200"
                                >
                                  <option value="all">Todas las categorías</option>
                                  {categories.map((c) => (
                                    <option key={c.key} value={c.key}>{c.label}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            {enableSubcategoryFilter && subcategories && subcategories.length > 0 && subsForGroup.length > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                  Subcategoría
                                </span>
                                <select
                                  value={subFilter}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => setSubcategoryFor(groupValue, e.target.value)}
                                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-gray-200"
                                >
                                  <option value="all">
                                    {catFilter === "all" ? "Todas las sub-categorías" : "Todas (de esta cat.)"}
                                  </option>
                                  {subsForGroup.map((s) => (
                                    <option key={`${s.parentKey}::${s.key}`} value={s.key}>{s.label}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            {anyFilterActive && (
                              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                                {filteredGroupRows.length} de {groupRows.length}
                              </span>
                            )}
                          </div>
                        )}

                        <div>
                          {filteredGroupRows.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-gray-400 dark:text-gray-500">
                              Sin registros para esta categoría.
                            </div>
                          ) : (
                            filteredGroupRows.map((row, i) => (
                              <div
                                key={i}
                                style={{ gridTemplateColumns: gridTemplate }}
                                className="grid text-sm border-b border-gray-100/70 last:border-b-0 dark:border-white/[0.03] hover:bg-gray-50/80 dark:hover:bg-white/[0.02] cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRowClick(row);
                                }}
                                title="Ver detalle"
                              >
                                {columns.map((col) => (
                                  <div
                                    key={col.key}
                                    title={String(row[col.key] ?? "—")}
                                    className={`truncate px-4 py-3 text-gray-600 dark:text-gray-300 ${
                                      numericCols.includes(col.key) ? "text-right tabular-nums" : ""
                                    }`}
                                  >
                                    {col.key === "category" && row.categoryConfig ? (
                                      (() => {
                                        const cfg = row.categoryConfig as {
                                          key: string; label: string; dot: string; cls: string; customColor: string | null;
                                        };
                                        const sub = row.subcategory as string | null;
                                        const subColor = row.subcategoryColor as string | null;
                                        return (
                                          <div className="flex flex-col items-start gap-0.5">
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.cls}`}>
                                              <span
                                                className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`}
                                                style={cfg.customColor ? { backgroundColor: cfg.customColor } : undefined}
                                              />
                                              <span className="whitespace-normal">{cfg.label}</span>
                                            </span>
                                            {sub && (
                                              <span className="inline-flex items-center gap-1 pl-1 text-[10px] text-gray-500 dark:text-gray-400">
                                                <span
                                                  className="h-1 w-1 rounded-full"
                                                  style={subColor ? { backgroundColor: subColor } : undefined}
                                                />
                                                <span className="truncate max-w-[200px]">{cfg.label} · {sub}</span>
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })()
                                    ) : (
                                      String(row[col.key] ?? "—")
                                    )}
                                  </div>
                                ))}
                              </div>
                            ))
                          )}
                        </div>

                        {/* ── Subtotal del grupo — mismo grid que el header ── */}
                        {numericCols.length > 0 && filteredGroupRows.length > 0 && (
                          <div
                            className="grid items-center border-t border-gray-100 dark:border-white/[0.05] bg-gray-50/60 py-2.5 dark:bg-white/[0.03]"
                            style={{ gridTemplateColumns: gridTemplate }}
                          >
                            <div
                              style={{ gridColumn: `1 / ${firstNumericIdx + 1}` }}
                              className="px-4 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                            >
                              Subtotal {groupValue}
                              {anyFilterActive && (
                                <span className="ml-1 font-normal normal-case text-gray-400">
                                  ({[
                                    typeFilter !== "all" ? (types?.find((t) => t.key === typeFilter)?.label ?? typeFilter) : null,
                                    catFilter !== "all" ? (categories?.find((c) => c.key === catFilter)?.label ?? catFilter) : null,
                                  ].filter(Boolean).join(" · ")})
                                </span>
                              )}
                            </div>
                            {columns.slice(firstNumericIdx).map((col) => (
                              <div
                                key={col.key}
                                className={`px-4 ${
                                  numericCols.includes(col.key)
                                    ? "text-right tabular-nums text-sm font-bold text-gray-800 dark:text-white"
                                    : ""
                                }`}
                              >
                                {numericCols.includes(col.key)
                                  ? fmtSubtotal(filteredSubtotals[col.key] ?? 0, col.key)
                                  : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {/* ── Total general — mismo grid que el header ── */}
            {numericCols.length > 0 && (
              <div
                className="sticky bottom-0 z-20 grid items-center border-t-2 border-gray-200 bg-gray-100/95 py-3 backdrop-blur-sm dark:border-white/[0.1] dark:bg-[#0f172a]/95"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div
                  style={{ gridColumn: `1 / ${firstNumericIdx + 1}` }}
                  className="flex items-center gap-3 px-4"
                >
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-200">
                    TOTAL GENERAL
                  </span>
                  <span className="rounded-md bg-gray-200/60 dark:bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:text-gray-300 tabular-nums">
                    {rows.length} registros
                  </span>
                </div>
                {columns.slice(firstNumericIdx).map((col) => (
                  <div
                    key={col.key}
                    className={`px-4 ${
                      numericCols.includes(col.key)
                        ? "text-right tabular-nums text-sm font-black text-gray-900 dark:text-white"
                        : ""
                    }`}
                  >
                    {numericCols.includes(col.key) ? fmtSubtotal(grandTotal[col.key] ?? 0, col.key) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <UiPagination
        page={page}
        totalPages={Math.max(1, Math.ceil(groups.length / pageSize))}
        total={groups.length}
        pageSize={pageSize}
        onPageChange={setPage}
        itemLabel="grupo"
        itemLabelPlural="grupos"
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const { session } = useAuth();
  const isAdmin = !!session && ADMIN_ROLES.has(session.role as string);
  const { can } = usePermissions();
  const companyModules = (session?.companyModules ?? []) as string[];
  const hasCompanyContext = !!session?.companyId;
  const visibleReportModules = useMemo(() => {
    if (!hasCompanyContext) return REPORT_MODULES;
    if (companyModules.length === 0) return REPORT_MODULES;
    return REPORT_MODULES.filter((m) =>
      !m.requiresModule || companyModules.includes(m.requiresModule)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyModules, hasCompanyContext, REPORT_MODULES.length]);
  const { assets,       loading: loadingAssets }       = useAssets();
  const { drivers,      loading: loadingDrivers }      = useDrivers();
  const { assignments,  loading: loadingAssignments }  = useAssignments();
  const { data: maintenancesPage, isLoading: loadingMaintenances } = useMaintenancesList({ status: "Completado", pageSize: 100 });
  const maintenances = maintenancesPage?.data ?? [];
  const { checklists,   loading: loadingChecklists }   = useChecklists();
  const { alerts,       loading: loadingAlerts }       = useAlerts();
  const { fuelEntries,  loading: loadingFuel }         = useFuel();
  const { items: exitAuths, loading: loadingExitAuths, fetchList: fetchExitAuths } = useExitAuthorizations();
  const { workshops } = useWorkshops();
  const { suppliers } = useSuppliers();
  const { data: maintCategoriesRaw } = useMaintenanceCategories();
  const customMaintCategories = maintCategoriesRaw ?? [];
  const maintCategories = useMemo(() => {
    const builtIn: { key: string; label: string }[] = [
      { key: "Primordial:Bombas",  label: "Primordial · Bombas"  },
      { key: "Primordial:Motores", label: "Primordial · Motores" },
      { key: "Aceite:Cambio",      label: "Aceite · Cambio"      },
      { key: "Aceite:Inventario",  label: "Aceite · Inventario"  },
      { key: "Lavada",             label: "Lavada"               },
      { key: "Otro",               label: "Otro"                 },
    ];
    const custom = customMaintCategories.map((c) => ({ key: c.key, label: c.label }));
    return [...builtIn, ...custom];
  }, [customMaintCategories]);

  useEffect(() => {
    void fetchExitAuths();
  }, [fetchExitAuths]);

  const finance = useFinance();

  const [activeId, setActiveId] = useState(() => visibleReportModules[0]?.id ?? "rep-001");
  const [search, setSearch]     = useState("");
  const [page, setPage]         = useState(1);
  const defaultRange = useMemo<DateRange>(() => {
    const to   = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return {
      from: from.toISOString().slice(0, 10),
      to:   to.toISOString().slice(0, 10),
    };
  }, []);
  const [draft, setDraft]       = useState<DateRange>(defaultRange);
  const [applied, setApplied]   = useState<DateRange>(defaultRange);
  const [maintSubtab, setMaintSubtab] = useState<"todos" | "programados" | "en_proceso" | "completados" | "atrasados">("todos");
  const [maintCategory, setMaintCategory] = useState<"all" | "Correctivo" | "Programado" | "Lavada">("all");
  const [maintWorkshopId,  setMaintWorkshopId]  = useState<number | null>(null);
  const [maintSupplierId,  setMaintSupplierId]  = useState<number | null>(null);
  const [view, setView] = useState<"tablas" | "estadisticas" | "filtrado">("tablas");

  const [selectedRow, setSelectedRow] = useState<ReportRow | null>(null);

  const [closedAccounts, setClosedAccounts] = useState<PettyCashClosedAccountRow[]>([]);
  const [closedAccountsTotal, setClosedAccountsTotal] = useState(0);
  const [loadingClosedAccounts, setLoadingClosedAccounts] = useState(false);
  const [pettyCashModeFilter, setPettyCashModeFilter] = useState<"all" | "period" | "balance">("all");

  useEffect(() => {
    if (activeId !== "rep-010") return;
    if (!session?.companyId) return;
    let cancelled = false;
    setLoadingClosedAccounts(true);
    void (async () => {
      try {
        const res = await finance.pettyCash.fetchClosedAccounts({
          from: applied.from || undefined,
          to:   applied.to   || undefined,
          mode: pettyCashModeFilter,
          page: 1,
          pageSize: 100,
        });
        if (cancelled) return;
        setClosedAccounts(res.rows);
        setClosedAccountsTotal(res.total);
      } catch (err) {
        if (cancelled) return;
        setClosedAccounts([]);
        setClosedAccountsTotal(0);
      } finally {
        if (!cancelled) setLoadingClosedAccounts(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, applied.from, applied.to, pettyCashModeFilter, session?.companyId]);

  const loading =
    loadingAssets || loadingDrivers || loadingAssignments ||
    loadingMaintenances || loadingChecklists || loadingAlerts ||
    loadingFuel || loadingExitAuths || (activeId === "rep-010" && loadingClosedAccounts);

  const activeModule = useMemo(
    () => visibleReportModules.find((m) => m.id === activeId) ?? visibleReportModules[0] ?? REPORT_MODULES[0],
    [visibleReportModules, activeId],
  );
  const activePalette = PALETTE[activeModule.palette];

  function handleTabChange(id: string) {
    setActiveId(id);
    setPage(1);
    setSearch("");
    if (id !== "rep-009") {
      setMaintSubtab("todos");
      setMaintCategory("all");
      setMaintWorkshopId(null);
      setMaintSupplierId(null);
    }
    if (id !== "rep-010") {
      setPettyCashModeFilter("all");
    }
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  // ─── Preview ───────────────────────────────────────────────────────────────

  const preview = useMemo<ReportPreview>(() => {

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
        __raw:           { asset: a },
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
        const driver     = drivers.find((d) => d.id === a.driverId);
        const asset      = assets.find((x) => x.id === a.assetId);
        const driverName = a.driverName ?? (driver ? `${driver.firstName} ${driver.lastName}`.trim() || driver.code : null) ?? "Sin conductor";
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
          __raw:       { assignment: a, driver: driver ?? null, asset: asset ?? null },
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
          __raw: { kind: "fuel", fuel: e, asset: asset ?? null },
        };
      });
      const maintRows: ReportRow[] = maintenances.map((e) => {
        const asset = assets.find((a) => a.id === e.assetId);
        const cost = e.totalCost ?? (e.laborCost ?? 0);
        return {
          plate: e.assetPlate ?? asset?.plate ?? "—", type: asset?.category ?? "—", brand: asset?.brand ?? "—",
          expenseType: `Mantenimiento ${e.type}`,
          amount: formatCurrency(cost),
          status: e.status, date: e.scheduledFor, __date: e.scheduledFor,
          __raw: { kind: "maintenance", maintenance: e, asset: asset ?? null },
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
          { label: "Mantenimiento", value: maintenances.length.toString(),  detail: "Mantenimientos incluidos",      tone: "success" },
        ],
      };
    }

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
          __raw:      { checklist: c, asset: asset ?? null },
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
      const rows: ReportRow[] = fuelEntries.map((e) => {
        const asset = assets.find((a) => a.id === e.assetId);
        return {
          invoice:   e.invoiceNumber || "—",
          plate:     asset?.plate ?? "—",
          kmStart:   Math.max(e.odometer - 420, 0),
          kmEnd:     e.odometer,
          unitPrice: `${(e.cost / e.gallons).toFixed(2)} USD`,
          total:     formatCurrency(e.cost),
          date:      e.date,
          station:   e.station,
          __date:    e.date,
          __raw:     { fuel: e, asset: asset ?? null },
        };
      });
      return {
        title: "Historial de cargas de combustible",
        description: "Carga, kilometraje, costo y estación.",
        columns,
        rows,
        summary: [
          { label: "Cargas",  value: fuelEntries.length.toString(),                                  detail: "Registros emitidos", tone: "info"    },
          { label: "Galones", value: fuelEntries.reduce((t, e) => t + e.gallons, 0).toFixed(2),    detail: "Volumen total",      tone: "warning" },
          { label: "Costo",   value: formatCurrency(fuelEntries.reduce((t, e) => t + e.cost, 0)), detail: "Acumulado",          tone: "success" },
        ],
      };
    }

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
          __raw:      { alert: a, asset: asset ?? null },
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
          requestedAt:   fmtDateTimeEc(a.requestedAt),
          decidedAt:     fmtDateTimeEc(a.decidedAt),
          decidedBy:     a.decidedByName ?? (decider ? `${decider.firstName} ${decider.lastName}`.trim() : "—"),
          decisionNotes: a.decisionNotes ?? "—",
          __date:        a.requestedAt,
          __raw:         { exitAuth: a, driver: driver ?? null, decider: decider ?? null },
        };
      });
      return {
        title: "Reporte de autorizaciones de salida",
        description: "Solicitudes de salida de vehículos, su estado y quién las decidió.",
        columns,
        rows,
        summary: [
          { label: "Total",       value: exitAuths.length.toString(),                                           detail: "Solicitudes registradas", tone: "info"    },
          { label: "Autorizadas", value: exitAuths.filter((a) => a.status === "Autorizada").length.toString(),  detail: "Aprobadas",               tone: "success" },
          { label: "Rechazadas",  value: exitAuths.filter((a) => a.status === "Rechazada").length.toString(),   detail: "Denegadas",               tone: "danger"  },
          { label: "Pendientes",  value: exitAuths.filter((a) => a.status === "Pendiente").length.toString(),   detail: "En espera",               tone: "warning" },
        ],
      };
    }

    if (activeId === "rep-009") {
      const columns: ReportColumn[] = [
        { key: "kind",          label: "Tipo"        },
        { key: "category",      label: "Categoría"   },
        { key: "scheduledDate", label: "Programado"  },
        { key: "completedDate", label: "Completado"  },
        { key: "technician",    label: "Técnico"     },
        { key: "labor",         label: "Mano obra"   },
        { key: "parts",         label: "Repuestos"   },
        { key: "cost",          label: "Costo total" },
      ];
      const rows: ReportRow[] = maintenances.map((m) => {
        const labor = m.laborCost ?? 0;
        const total = m.totalCost ?? labor;
        const parts = Math.max(0, total - labor);
        const plate = m.assetPlate
                   || m.assetName
                   || (m as any).__raw?.asset?.plate
                   || "—";
        const catKey = m.category ?? "Otro";
        const catPill = resolveCategoryPill(catKey, maintCategories, customMaintCategories);
        let subForRow: { id: string; key: string; label: string; color: string } | null = null;
        if (m.subcategoryId) {
          for (const c of customMaintCategories) {
            const s = (c.subcategories ?? []).find((x) => x.id === m.subcategoryId);
            if (s) { subForRow = { id: s.id, key: s.key, label: s.label, color: s.color }; break; }
          }
        } else if (m.subcategory) {
          for (const c of customMaintCategories) {
            const s = (c.subcategories ?? []).find((x) => x.key === m.subcategory);
            if (s) { subForRow = { id: s.id, key: s.key, label: s.label, color: s.color }; break; }
          }
          if (!subForRow && m.subcategoryLabel) {
            subForRow = { id: "", key: m.subcategory, label: m.subcategoryLabel, color: "#94a3b8" };
          }
        }
        return {
          kind:          m.type ?? "—",
          category:      catPill.label,
          categoryConfig: catPill,
          subcategory:      subForRow?.label ?? null,
          subcategoryKey:   subForRow?.key   ?? null,
          subcategoryId:    subForRow?.id    ?? null,
          subcategoryColor: subForRow?.color ?? null,
          scheduledDate: m.scheduledFor ? m.scheduledFor.slice(0, 10) : "—",
          completedDate: m.completedAt  ? m.completedAt.slice(0, 10)  : "—",
          technician:    m.assignedUserName || "—",
          labor,
          parts,
          cost:          total,
          assetPlate:    plate,
          categoryKey:   catKey,
          categoryName:  catPill.label,
          __status:      m.status,
          __date:        m.scheduledFor,
          __completedAt: m.completedAt ?? null,
          __workshopId:  m.workshopId ?? null,
          __raw:         { maintenance: m, asset: assets.find((x) => x.id === m.assetId) ?? null },
        };
      });
      return {
        title: "Reporte de mantenimientos",
        description: "Órdenes de trabajo agrupadas por categoría, costo y tipo. Use los filtros para acotar por taller o proveedor y ver el desglose.",
        columns,
        rows,
        summary: [
          { label: "Total",       value: maintenances.length.toString(),                                          detail: "Mantenimientos registrados", tone: "info"    },
          { label: "Pendientes",  value: maintenances.filter((m) => m.status === "Programado").length.toString(), detail: "Sin iniciar",    tone: "warning" },
          { label: "En proceso",  value: maintenances.filter((m) => m.status === "En proceso").length.toString(), detail: "En taller",      tone: "info"    },
          { label: "Completados", value: maintenances.filter((m) => m.status === "Completado").length.toString(), detail: "Cerrados",       tone: "success" },
        ],
      };
    }

    if (activeId === "rep-010") {
      const columns: ReportColumn[] = [
        { key: "site",        label: "Sede"        },
        { key: "period",      label: "Periodo"     },
        { key: "mode",        label: "Modo"        },
        { key: "initial",     label: "Inicial"     },
        { key: "final",       label: "Saldo final" },
        { key: "movements",   label: "Movimientos" },
        { key: "vouchers",    label: "Vales"       },
        { key: "requests",    label: "Solicitudes" },
        { key: "creator",     label: "Creada por"  },
      ];
      const rows: ReportRow[] = closedAccounts.map((a) => {
        const periodKindLabel = a.periodKind === "monthly" ? "Mensual"
                              : a.periodKind === "weekly"  ? "Semanal"
                              : "—";
        const modeLabel = a.mode === "period"  ? `Periodo · ${periodKindLabel}`
                        : a.mode === "balance" ? "Saldo (umbral)"
                        : "—";
        const periodStartStr = a.periodStartedAt instanceof Date
          ? a.periodStartedAt.toISOString().slice(0, 10)
          : String(a.periodStartedAt).slice(0, 10);
        const periodEndStr = a.closedAt instanceof Date
          ? a.closedAt.toISOString().slice(0, 10)
          : String(a.closedAt).slice(0, 10);
        return {
          site:      a.siteName,
          period:    `${periodStartStr} → ${periodEndStr}`,
          mode:      modeLabel,
          initial:   formatCurrency(a.initialAmount),
          final:     formatCurrency(a.finalBalance),
          movements: a.movementCount.toString(),
          vouchers:  a.voucherCount.toString(),
          requests:  a.requestCount.toString(),
          creator:   a.createdByName ?? "—",
          __siteId:  a.siteId,
          __date:    a.periodStartedAt,
          __raw:     { kind: "closed-petty-cash", closedAccount: a },
        };
      });
      return {
        title: "Cajas chicas cerradas",
        description: "Histórico de cuentas de caja chica cerradas (por mes o por reconfiguración). Click en una fila para ver el flujo completo (movimientos, vales, solicitudes).",
        columns,
        rows,
        summary: [
          { label: "Cuentas cerradas", value: closedAccountsTotal.toString(),                              detail: "Periodos históricos",  tone: "info"    },
          { label: "Periodo (mensual)", value: closedAccounts.filter(a => a.mode === "period").length.toString(),  detail: "Cerradas por fin de mes",     tone: "success" },
          { label: "Periodo (saldo)",   value: closedAccounts.filter(a => a.mode === "balance").length.toString(), detail: "Reemplazadas manual",   tone: "warning" },
        ],
      };
    }

    return { title: "", description: "", columns: [], rows: [], summary: [] };

  }, [
    activeId,
    assets, drivers, assignments, maintenances, checklists, alerts, fuelEntries, exitAuths, workshops,
    closedAccounts, closedAccountsTotal,
  ]);

  // ─── Filtered rows ─────────────────────────────────────────────────────────

  const rangedRows = useMemo(
    () => preview.rows.filter((r) => {
      if (activeId === "rep-009") {
        return isInRangeDual(
          String(r.__date ?? ""),
          (r as { __completedAt?: string | null }).__completedAt ?? null,
          applied,
        );
      }
      return isInRange(String(r.__date ?? ""), applied);
    }),
    [applied, preview.rows, activeId]
  );

  const visibleRows = useMemo(() => {
    let filtered = filterRows(rangedRows, preview.columns, search);
    if (activeId === "rep-009") {
      if (maintSubtab !== "todos") {
        const statusMap: Record<string, string> = {
          programados: "Programado",
          en_proceso:  "En proceso",
          completados: "Completado",
          atrasados:   "Atrasado",
        };
        const target = statusMap[maintSubtab];
        filtered = filtered.filter((r) => r.__status === target);
      }
      if (maintCategory !== "all") {
        filtered = filtered.filter((r) => r.kind === maintCategory);
      }
      if (maintWorkshopId != null) {
        filtered = filtered.filter((r) => r.__workshopId === maintWorkshopId);
      }
    }
    return filtered;
  }, [rangedRows, preview.columns, search, activeId, maintSubtab, maintCategory, maintWorkshopId]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const pagedRows  = visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const numericSummary = useMemo(() => {
    return preview.summary.map((s) => {
      const cleaned = String(s.value).replace(/[^\d.-]/g, "");
      const n = Number(cleaned);
      return { ...s, n: Number.isFinite(n) ? n : 0 };
    });
  }, [preview.summary]);
  const maxSummaryValue = useMemo(
    () => Math.max(1, ...numericSummary.map((s) => s.n)),
    [numericSummary]
  );

  const breakdownActivo =
    activeId === "rep-009" &&
    (maintWorkshopId != null || maintSupplierId != null);
  const mostrarAgrupada = GROUPED_MODULES.has(activeId) && !breakdownActivo;

  // jul 2026 v10 — Set de columnas numéricas del módulo activo, para
  // alinear a la derecha tanto el header como las celdas de la tabla
  // PLANA (la que no usa GroupedReportTable). Antes solo la tabla
  // agrupada tenía esta alineación; en la tabla plana "MANO OBRA",
  // "REPUESTOS" y "COSTO TOTAL" quedaban con el header a la izquierda
  // y los valores sin alinear consistentemente contra él.
  const activeNumericCols = useMemo(
    () => new Set(NUMERIC_COLS[activeId] ?? []),
    [activeId],
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest text-brand-600 dark:bg-brand-500/[0.12] dark:text-brand-400">
            <Sparkles size={10} />
            {view === "estadisticas" ? "Inteligencia de negocio" :
             view === "filtrado"     ? "Drill-down por día" :
                                       "Reportes"}
          </span>
          <h1 className="mt-1.5 text-2xl font-bold text-gray-800 dark:text-white">
            {view === "estadisticas" ? "Estadísticas" :
             view === "filtrado"     ? "Filtrado" :
                                       "Centro de reportes"}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
            {view === "estadisticas"
              ? "Resumen inteligente, tendencias y desglose por módulo con análisis IA."
              : view === "filtrado"
              ? "Cascada de 6 niveles para encontrar el detalle de un día específico por vehículo y módulo."
              : "Consulta, filtra y revisa datos de la operación diaria por módulo."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {view === "tablas" && (
            <span className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-400">
              <FileBarChart2 size={13} className="text-brand-500" />
              {visibleRows.length} registros
              {totalPages > 1 && (
                <span className="ml-1 text-gray-400">· Pág. {page}/{totalPages}</span>
              )}
            </span>
          )}
          {view === "filtrado" && (
            <span className="flex items-center gap-1.5 rounded-xl border border-fuchsia-200 bg-fuchsia-50/40 px-3 py-2 text-xs font-medium text-fuchsia-700 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/[0.08] dark:text-fuchsia-300">
              <ListChecks size={13} />
              Cascada de 6 niveles
            </span>
          )}

          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setView((v) => (v === "tablas" ? "estadisticas" : "tablas"))}
                className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                  view === "estadisticas"
                    ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/[0.12] dark:text-brand-300"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]"
                }`}
              >
                {view === "estadisticas" ? (
                  <>
                    <Table2 size={13} />
                    <span>Volver a tablas</span>
                  </>
                ) : (
                  <>
                    <BarChart3 size={13} />
                    <span>Estadísticas</span>
                    <span className="pointer-events-none absolute -right-2 -top-2 h-2 w-2 rounded-full bg-brand-500 shadow-[0_0_0_3px_rgba(59,130,246,0.15)]" />
                  </>
                )}
              </button>
              {can("reportes", "filtrado", "ver") && (
                <button
                  type="button"
                  onClick={() => setView((v) => (v === "filtrado" ? "tablas" : "filtrado"))}
                  className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                    view === "filtrado"
                      ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/[0.12] dark:text-fuchsia-300"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]"
                  }`}
                >
                  {view === "filtrado" ? (
                    <>
                      <Table2 size={13} />
                      <span>Volver a tablas</span>
                    </>
                  ) : (
                    <>
                      <ListChecks size={13} />
                      <span>Filtrado</span>
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Vista condicional: Estadísticas / Filtrado / Tablas ── */}
      {view === "estadisticas" ? (
        session?.companyId && <EstadisticasTab companyId={session.companyId} />
      ) : view === "filtrado" ? (
        <motion.div
          key="filtrado"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
          <FiltradoTab />
        </motion.div>
      ) : (
        <div className="flex items-start gap-3">

          {/* ── Sidebar de módulos (hover-expand, sticky) ── */}
          <div className="sticky top-4 self-start">
            <ModuleSidebar
              activeId={activeId}
              onSelect={handleTabChange}
              modules={visibleReportModules}
            />
          </div>

          {/* ── Panel principal con animación de cambio de módulo ── */}
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeId}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="space-y-3"
              >
                {/* ── KPI cards con wave del módulo activo ── */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                  {numericSummary.map((item) => (
                    <KpiCard
                      key={`${activeId}-${item.label}`}
                      item={item}
                      palette={activeModule.palette}
                      maxValue={maxSummaryValue}
                      numericValue={item.n}
                    />
                  ))}
                </div>

                {/* ── Main card ── */}
                <div className={`overflow-hidden rounded-2xl border ${activePalette.border} bg-white dark:bg-white/[0.03]`}>

                  {/* Card title con marca del módulo activo */}
                  <div className="flex items-start gap-3 border-b border-gray-100 px-4 py-3 dark:border-white/[0.06]">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${activePalette.bg} ${activePalette.icon}`}>
                      {(() => {
                        const Icon = activeModule.icon;
                        return <Icon size={15} />;
                      })()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
                        {preview.title}
                      </h2>
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                        {preview.description}
                      </p>
                    </div>
                  </div>

                  {/* Sub-filtros del tab Mantenimiento */}
                  {activeId === "rep-009" && (
                    <div className="flex flex-col gap-2.5 border-b border-gray-100 px-4 py-3 dark:border-white/[0.06]">
                      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {([
                            { id: "todos",       label: "Todos"       },
                            { id: "programados", label: "Programados" },
                            { id: "en_proceso",  label: "En proceso"  },
                            { id: "completados", label: "Completados" },
                            { id: "atrasados",   label: "Atrasados", statusValue: "Atrasado" },
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
                            <option value="Correctivo">Correctivo</option>
                            <option value="Programado">Programado</option>
                            <option value="Lavada">Lavada</option>
                          </select>
                        </div>
                      </div>

                      <CostBreakdownFilters
                        workshops={workshops.map((w) => ({ id: stripIdPrefix(w.id), name: w.name }))}
                        suppliers={suppliers.map((s) => ({ id: stripIdPrefix(s.id), name: s.name }))}
                        workshopId={maintWorkshopId}
                        supplierId={maintSupplierId}
                        onWorkshopChange={(id) => { setMaintWorkshopId(id); setPage(1); }}
                        onSupplierChange={(id) => { setMaintSupplierId(id); setPage(1); }}
                      />
                    </div>
                  )}

                  {/* Sub-filtros del tab Caja Chica histórica (rep-010) */}
                  {activeId === "rep-010" && (
                    <div className="flex flex-col gap-2.5 border-b border-gray-100 px-4 py-3 dark:border-white/[0.06] sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {([
                          { id: "all",     label: "Todas"                          },
                          { id: "period",  label: "Periodo (mensual/semanal)"      },
                          { id: "balance", label: "Saldo (reconfiguración manual)" },
                        ] as const).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => { setPettyCashModeFilter(opt.id); setPage(1); }}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                              pettyCashModeFilter === opt.id
                                ? `${activePalette.bgActive} text-white shadow-sm`
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        {closedAccountsTotal} {closedAccountsTotal === 1 ? "cuenta cerrada" : "cuentas cerradas"} en el rango seleccionado
                      </p>
                    </div>
                  )}

                  {/* Date filter */}
                  <div className={`flex flex-col gap-2.5 border-b border-gray-100 px-4 py-2.5 dark:border-white/[0.06] sm:flex-row sm:items-center sm:justify-between ${activePalette.bg}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <CalendarRange size={13} className={activePalette.icon} />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                        Rango
                      </span>
                      <DatePicker
                        label=""
                        compact
                        value={draft.from}
                        onChange={(v) => setDraft((p) => ({ ...p, from: v }))}
                        maxDate={draft.to || undefined}
                      />
                      <span className="text-xs text-gray-400">—</span>
                      <DatePicker
                        label=""
                        compact
                        value={draft.to}
                        onChange={(v) => setDraft((p) => ({ ...p, to: v }))}
                        minDate={draft.from || undefined}
                      />
                      <button
                        type="button"
                        onClick={() => { setApplied(draft); setPage(1); }}
                        className={`ml-1 inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white shadow-sm transition active:scale-95 ${activePalette.bgActive}`}
                      >
                        Aplicar
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">
                      {applied.from
                        ? fmtDateShortEc(applied.from)
                        : "Inicio abierto"
                      } — {applied.to
                        ? fmtDateShortEc(applied.to)
                        : "Fin abierto"
                      }
                    </p>
                  </div>

                  {/* Desglose de costos (solo rep-009) */}
                  {activeId === "rep-009" && (
                    <CostBreakdownPanel
                      companyId={session?.companyId ?? null}
                      workshopId={maintWorkshopId}
                      supplierId={maintSupplierId}
                      from={applied.from || undefined}
                      to={applied.to || undefined}
                      workshopName={workshops.find((w) => stripIdPrefix(w.id) === String(maintWorkshopId))?.name}
                      supplierName={suppliers.find((s) => stripIdPrefix(s.id) === String(maintSupplierId))?.name}
                      onClear={() => { setMaintWorkshopId(null); setMaintSupplierId(null); }}
                    />
                  )}

                  {/* Search + Export */}
                  <div className="border-b border-gray-100 px-4 py-2.5 dark:border-white/[0.06]">
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
                      {GROUPED_MODULES.has(activeId) ? (
                        <GroupedExportButton
                          title={preview.title}
                          subtitle={`Rango: ${applied.from || "inicio abierto"} — ${applied.to || "fin abierto"}`}
                          filename={`reporte-${activeId}`}
                          columns={preview.columns}
                          rows={visibleRows}
                          groupKey={GROUP_KEY[activeId] ?? "plate"}
                          numericCols={NUMERIC_COLS[activeId] ?? []}
                          palette={activeModule.palette}
                        />
                      ) : (
                        <ExportToolbar
                          title={preview.title}
                          columns={preview.columns}
                          rows={visibleRows}
                          subtitle={`Rango: ${applied.from || "inicio abierto"} — ${applied.to || "fin abierto"}`}
                          filename={`reporte-${activeId}`}
                        />
                      )}
                    </div>
                  </div>

                  {/* Table body */}
                  {loading ? (
                    <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
                      <Loader2 size={18} className="animate-spin" />
                      <span className="text-sm">Cargando datos...</span>
                    </div>
                  ) : visibleRows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-14">
                      <FileBarChart2 size={20} className="text-gray-300 dark:text-gray-600" />
                      <p className="text-sm font-medium text-gray-400 dark:text-gray-500">Sin registros</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        Ninguna fila coincide con el rango o filtro actual.
                      </p>
                    </div>
                  ) : mostrarAgrupada ? (
                    // ── Módulos agrupados: acordeón por placa (sin paginación) ──
                    <GroupedReportTable
                      columns={preview.columns}
                      rows={visibleRows}
                      groupKey={GROUP_KEY[activeId] ?? "plate"}
                      numericCols={NUMERIC_COLS[activeId] ?? []}
                      moduleId={activeId}
                      palette={activeModule.palette}
                      moduleTitle={preview.title}
                      moduleSubtitle={`Rango: ${applied.from || "inicio abierto"} — ${applied.to || "fin abierto"}`}
                      moduleFilename={`reporte-${activeId}`}
                      onRowClick={setSelectedRow}
                      categories={activeId === "rep-009" ? maintCategories : undefined}
                      enableCategoryFilter={activeId === "rep-009"}
                      subcategories={activeId === "rep-009"
                        ? customMaintCategories.flatMap((c) =>
                            (c.subcategories ?? []).map((s) => ({
                              parentKey: c.key,
                              key:       s.key,
                              label:     s.label,
                            })),
                          )
                        : undefined}
                      enableSubcategoryFilter={activeId === "rep-009"}
                      types={activeId === "rep-009" ? [
                        { key: "Programado", label: "Programado" },
                        { key: "Correctivo", label: "Correctivo" },
                        { key: "Lavada",     label: "Lavada" },
                      ] : undefined}
                      enableTypeFilter={activeId === "rep-009"}
                    />
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[840px] text-sm">
                          <thead>
                            <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                              {preview.columns.map((col) => (
                                <th
                                  key={col.key}
                                  className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 ${
                                    activeNumericCols.has(col.key) ? "text-right" : "text-left"
                                  }`}
                                >
                                  {col.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody key={`${activeId}-${page}`} className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                            {pagedRows.map((row, i) => (
                              <motion.tr
                                key={i}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.16, delay: i * 0.025, ease: "easeOut" }}
                                className="hover:bg-gray-50/80 dark:hover:bg-white/[0.02] cursor-pointer"
                                onClick={() => setSelectedRow(row)}
                                title="Ver detalle"
                              >
                                {preview.columns.map((col) => (
                                  <td
                                    key={col.key}
                                    className={`px-4 py-2.5 text-gray-600 dark:text-gray-300 ${
                                      activeNumericCols.has(col.key) ? "text-right tabular-nums" : ""
                                    }`}
                                  >
                                    {/* jul 2026 — Special case para la columna
                                        "category" del rep-009: renderiza un pill
                                        coloreado con dot + label. El cell renderer
                                        genérico usa String() lo que destruiría el JSX.
                                        NO usar whitespace-nowrap: cuando la columna
                                        queda angosta, el browser recorta con ellipsis
                                        ("Aceite · Cam..."). El label puede envolver
                                        a 2 líneas si hace falta — el fondo del pill
                                        se expande y el texto queda siempre completo. */}
                                    {col.key === "category" && row.categoryConfig ? (
                                      (() => {
                                        const cfg = row.categoryConfig as {
                                          key: string;
                                          label: string;
                                          dot: string;
                                          cls: string;
                                          customColor: string | null;
                                        };
                                        const sub = row.subcategory as string | null;
                                        const subColor = row.subcategoryColor as string | null;
                                        return (
                                          <div className="flex flex-col items-start gap-0.5">
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.cls}`}>
                                              <span
                                                className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot}`}
                                                style={cfg.customColor ? { backgroundColor: cfg.customColor } : undefined}
                                              />
                                              <span className="whitespace-normal">{cfg.label}</span>
                                            </span>
                                            {sub && (
                                              <span className="inline-flex items-center gap-1 pl-1 text-[10px] text-gray-500 dark:text-gray-400">
                                                <span
                                                  className="h-1 w-1 rounded-full"
                                                  style={subColor ? { backgroundColor: subColor } : undefined}
                                                />
                                                <span className="truncate max-w-[200px]">
                                                  {cfg.label} · {sub}
                                                </span>
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })()
                                    ) : (
                                      String(row[col.key] ?? "—")
                                    )}
                                  </td>
                                ))}
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

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
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* ── Drawer router: al hacer click en una fila, mira `__raw` y elige
              el drawer del módulo correspondiente. Los módulos que aún no
              tienen drawer dedicado (los demás) muestran un placeholder con
              el JSON crudo. ── */}
      <ReportDetailDrawer
        row={selectedRow}
        moduleId={activeId}
        onClose={() => setSelectedRow(null)}
      />
    </div>
  );
}