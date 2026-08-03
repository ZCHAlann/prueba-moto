// pages/Gestion/Drivers/components/HorarioConductoresCalendar.tsx
// ─────────────────────────────────────────────────────────────────────────────
// jul 2026 v5 — Migrado de pages/Gestion/HorarioConductores/page.tsx a un
// child component del módulo Conductores. Antes era un submódulo propio
// de "gestion" (ruta /gestion/horario-conductores), ahora es una TAB
// dentro de la página de Conductores. Razón: el horario de conductores
// es funcionalmente parte de la gestión de conductores (lista de
// libres por día, mismo CRUD que el resto del módulo).
//
// Vista de calendario mensual donde el admin marca, día a día, qué
// conductores están libres. El sistema manda recordatorio diario 19:00 EC
// al admin con la lista de conductores libres del día siguiente.
//
// UX:
//   - Tab "Horario" dentro de /operaciones/conductores (no ruta propia).
//   - Vista mes: cada celda muestra la cantidad de libres + nombres (max 3)
//   - Click en celda → modal con lista completa + selector para agregar
//   - Navegación: ‹ Mes › + botón "Hoy" + "Programar este mes"
//   - El header de página (título "Conductores") lo provee el padre
//     (Drivers/page.tsx) — este componente NO renderiza header propio,
//     solo la navegación del mes + banner + grilla + legend + modals.
//   - Permisos: usa `gestion.conductores.*` (mismo submódulo que la
//     página de Conductores). Editar requiere `crear` o `editar`.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays, ChevronLeft, ChevronRight, Copy, Loader2,
  Trash2, UserMinus, Users, X, AlertCircle, Repeat,
  CheckSquare, Square, Zap, Plus, Wand2,
} from "lucide-react";
import { useAuth } from "../../../../context/AuthContext";
import { usePermissions } from "../../../../hooks/usePermissions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useDriverScheduleList,
  useDriverScheduleHasAny,
  useCreateDriverTimeOff,
  useDeleteDriverTimeOff,
  useCopyDriverScheduleFromPrevious,
  useBulkCreateDriverTimeOff,
  monthRangeEc,
  todayYmdEc,
  type DriverTimeOffEntry,
} from "../../../../hooks/useDriverSchedule";
import { fmtDateShortEc } from "../../../../lib/datetime";

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DAY_NAMES_SHORT = ["L", "M", "M", "J", "V", "S", "D"];
// jul 2026 v3 — Versión completa de los días (para los tooltips).
// "L" se repite 2 veces porque no hay acrónimo estándar para jueves/martes
// en español — los devs suelen usar "M" para ambos y "L" para lunes.
const DAY_NAMES_FULL = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

interface CalendarCell {
  /** YYYY-MM-DD o null si es padding del mes anterior/posterior. */
  date: string | null;
  /** Número del día (1-31) o null. */
  day: number | null;
  isCurrentMonth: boolean;
  isToday: boolean;
}

/**
 * Genera la grilla 6×7 (max 42 celdas) del mes `year/month`. Las celdas
 * de padding (mes anterior/posterior) tienen `date: null` y día del mes
 * anterior/posterior renderizado en gris.
 *
 * Semana arranca en lunes (ISO week).
 */
function buildMonthGrid(year: number, month: number, todayYmd: string): CalendarCell[] {
  // Primer día del mes (en local time, no UTC, para que la grilla no se
  // corra un día por culpa de la TZ).
  const firstOfMonth = new Date(year, month - 1, 1);
  // weekday: 0=Dom, 1=Lun, ... 6=Sáb. Queremos Lun=0.
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  // Días en el mes:
  const daysInMonth = new Date(year, month, 0).getDate();
  // Días en el mes anterior:
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate();

  const cells: CalendarCell[] = [];

  // Padding del mes anterior.
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const pm = month === 1 ? 12 : month - 1;
    const py = month === 1 ? year - 1 : year;
    const ymd = `${py}-${String(pm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date: null, day: d, isCurrentMonth: false, isToday: ymd === todayYmd });
  }

  // Días del mes actual.
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date: ymd, day: d, isCurrentMonth: true, isToday: ymd === todayYmd });
  }

  // Padding del mes siguiente hasta completar 42 (o menos si el mes
  // cabía en menos — pero por seguridad siempre 42 para que la grilla
  // tenga alto constante).
  while (cells.length < 42) {
    const offset = cells.length - (firstWeekday + daysInMonth) + 1;
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    const d = offset;
    const ymd = `${ny}-${String(nm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date: null, day: d, isCurrentMonth: false, isToday: ymd === todayYmd });
  }

  return cells;
}

// ─── Sub-componentes ────────────────────────────────────────────────────────

/**
 * jul 2026 — Modal con 2 tabs:
 *   - "Copiar del mes anterior": copia las fechas exactas.
 *   - "Patrón de trabajo/descanso": define X días trabajo + Y descanso,
 *     repite el ciclo desde un día de inicio. Genera las fechas
 *     client-side y manda al endpoint bulk.
 *
 * El header explica que el mes target está vacío. Los tabs ofrecen
 * las dos opciones: copiar o patrón. Cada uno tiene su propio botón
/**
 * jul 2026 v2 — Paleta de colores para los avatares de conductores.
 * Cada driverId mapea determinísticamente a un color del sistema
 * (mismo driverId → mismo color, siempre). El palette es un subset
 * curado de `accentStyles` en `lib/navigation.ts` — los 9 acentos
 * que el sistema ya usa para nav, badges, KPIs, etc. El shuffle
 * por hash evita que dos drivers consecutivos del catálogo caigan
 * en el mismo color.
 */
// jul 2026 v4 — Pastel. Opacities bajos (8 light / 15 dark) y
// ring apenas visible. Mismo hash determinístico por driverId.
const DRIVER_PALETTE = [
  { bg: "bg-violet-100 dark:bg-violet-500/15",  text: "text-violet-700 dark:text-violet-300",  ring: "ring-violet-300/60 dark:ring-violet-500/30" },
  { bg: "bg-emerald-100 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-300/60 dark:ring-emerald-500/30" },
  { bg: "bg-amber-100 dark:bg-amber-500/15",    text: "text-amber-700 dark:text-amber-300",      ring: "ring-amber-300/60 dark:ring-amber-500/30" },
  { bg: "bg-sky-100 dark:bg-sky-500/15",        text: "text-sky-700 dark:text-sky-300",          ring: "ring-sky-300/60 dark:ring-sky-500/30" },
  { bg: "bg-rose-100 dark:bg-rose-500/15",      text: "text-rose-700 dark:text-rose-300",        ring: "ring-rose-300/60 dark:ring-rose-500/30" },
  { bg: "bg-cyan-100 dark:bg-cyan-500/15",      text: "text-cyan-700 dark:text-cyan-300",        ring: "ring-cyan-300/60 dark:ring-cyan-500/30" },
  { bg: "bg-teal-100 dark:bg-teal-500/15",      text: "text-teal-700 dark:text-teal-300",        ring: "ring-teal-300/60 dark:ring-teal-500/30" },
  { bg: "bg-orange-100 dark:bg-orange-500/15",  text: "text-orange-700 dark:text-orange-300",    ring: "ring-orange-300/60 dark:ring-orange-500/30" },
  { bg: "bg-lime-100 dark:bg-lime-500/15",      text: "text-lime-700 dark:text-lime-300",        ring: "ring-lime-300/60 dark:ring-lime-500/30" },
] as const;

/**
 * Hash determinístico simple: djb2 sobre el string, mod |palette|.
 * Es rápido y no requiere librerías; el módulo del hash cae dentro del
 * rango del palette (0..8) con buena distribución. Mismo driverId
 * (ej. "driver-7") SIEMPRE cae en el mismo slot.
 */
function driverColorIndex(driverId: string): number {
  let h = 5381;
  for (let i = 0; i < driverId.length; i++) {
    h = (h * 33) ^ driverId.charCodeAt(i);
  }
  // Math.abs puede ser 0, pero el módulo con 0 es 0 (no rompe).
  return Math.abs(h) % DRIVER_PALETTE.length;
}

function getDriverColor(driverId: string) {
  return DRIVER_PALETTE[driverColorIndex(driverId)];
}

/** "Juan Pérez" → "JP". Si solo hay un nombre, primera letra + primera letra del apellido o "?" como fallback. */
function getInitials(firstName: string, lastName: string): string {
  const f = (firstName ?? "").trim().charAt(0).toUpperCase();
  const l = (lastName ?? "").trim().charAt(0).toUpperCase();
  return (f + l) || "?";
}

/**
 * Avatar circular con iniciales (o `photoUrl` si existe). El color de
 * fondo es determinístico por driverId para que el mismo conductor
 * tenga siempre el mismo color en TODA la UI (calendario, modal,
 * header del modal). Tamaño `sm` (24px) para celdas, `md` (32px)
 * para listas del modal.
 */
function DriverAvatar({
  driverId,
  firstName,
  lastName,
  size = "sm",
}: {
  driverId: string;
  firstName: string;
  lastName: string;
  size?: "sm" | "md" | "lg";
}) {
  const c = getDriverColor(driverId);
  const initials = getInitials(firstName, lastName);
  const sz = size === "lg" ? "h-10 w-10 text-sm" : size === "md" ? "h-8 w-8 text-xs" : "h-6 w-6 text-[10px]";
  return (
    <span
      className={
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 " +
        c.bg + " " + c.text + " " + c.ring + " " + sz
      }
      title={`${firstName} ${lastName}`}
    >
      {initials}
    </span>
  );
}

function CopyPromptModal({
  open,
  onConfirmCopy,
  onConfirmPattern,
  onDismiss,
  isLoadingCopy,
  isLoadingPattern,
  sourceLabel,
  targetLabel,
  patternPreview,
  selectedDriverCount,
  daysOn,
  setDaysOn,
  daysOff,
  setDaysOff,
  startDay,
  setStartDay,
  patternDryRun,
  isLoadingDryRun,
}: {
  open: boolean;
  onConfirmCopy: () => void;
  onConfirmPattern: () => void;
  onDismiss: () => void;
  isLoadingCopy: boolean;
  isLoadingPattern: boolean;
  sourceLabel: string;
  targetLabel: string;
  /** Texto previsualizado del patrón (ej. "1-10 trabajo, 11-12 descanso, ...") */
  patternPreview: string;
  /** Cantidad de conductores seleccionados para aplicar el patrón */
  selectedDriverCount: number;
  // Pattern state
  daysOn: number;
  setDaysOn: (n: number) => void;
  daysOff: number;
  setDaysOff: (n: number) => void;
  startDay: number;
  setStartDay: (n: number) => void;
  /** Click en "Generar preview" para hacer un round-trip al backend
   *  y contar cuántos entries se crearían realmente. */
  patternDryRun: () => void;
  isLoadingDryRun: boolean;
}) {
  const [tab, setTab] = useState<"copy" | "pattern">("copy");
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-white/[0.08] dark:bg-[#1a1a23]">
        {/* Header */}
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-500/15">
            <Copy size={18} className="text-violet-600 dark:text-violet-300" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {targetLabel} está vacío
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Elegí cómo querés arrancar la programación de este mes.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div role="tablist" className="mb-4 flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-white/[0.08] dark:bg-white/[0.02]">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "copy"}
            onClick={() => setTab("copy")}
            className={
              "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition " +
              (tab === "copy"
                ? "bg-white text-gray-900 shadow-sm dark:bg-white/[0.08] dark:text-white"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200")
            }
          >
            <Copy size={12} />
            Copiar del mes anterior
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pattern"}
            onClick={() => setTab("pattern")}
            className={
              "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition " +
              (tab === "pattern"
                ? "bg-white text-gray-900 shadow-sm dark:bg-white/[0.08] dark:text-white"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200")
            }
          >
            <Repeat size={12} />
            Patrón de trabajo/descanso
          </button>
        </div>

        {/* Tab content */}
        {tab === "copy" ? (
          <div className="mb-2">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Copia las fechas exactas de <strong className="font-semibold">{sourceLabel}</strong> a <strong className="font-semibold">{targetLabel}</strong>.
              Útil si el patrón se mantiene de un mes al otro.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Definí un ciclo de trabajo/descanso. Se aplica a{" "}
              <strong>{selectedDriverCount}</strong> conductor{selectedDriverCount !== 1 ? "es" : ""}.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Días trabajo
                </label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={daysOn}
                  onChange={(e) => setDaysOn(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                  className="mt-0.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm font-semibold tabular-nums dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Días descanso
                </label>
                <input
                  type="number"
                  min={0}
                  max={31}
                  value={daysOff}
                  onChange={(e) => setDaysOff(Math.max(0, Math.min(31, Number(e.target.value) || 0)))}
                  className="mt-0.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm font-semibold tabular-nums dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Inicio
                </label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={startDay}
                  onChange={(e) => setStartDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                  className="mt-0.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm font-semibold tabular-nums dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                />
              </div>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50/60 px-3 py-2 text-[11px] text-gray-700 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-gray-200">
              <div className="mb-1 font-semibold uppercase tracking-wider text-[10px] text-gray-500 dark:text-gray-400">
                Vista previa
              </div>
              <div className="font-mono leading-relaxed">{patternPreview}</div>
            </div>
            {patternDryRun && (
              <button
                type="button"
                onClick={patternDryRun}
                disabled={isLoadingDryRun}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.06]"
              >
                {isLoadingDryRun && <Loader2 size={11} className="animate-spin" />}
                Calcular cuántas se aplicarían
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            disabled={isLoadingCopy || isLoadingPattern}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.06]"
          >
            Empezar de cero
          </button>
          {tab === "copy" ? (
            <button
              type="button"
              onClick={onConfirmCopy}
              disabled={isLoadingCopy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {isLoadingCopy && <Loader2 size={13} className="animate-spin" />}
              Copiar {sourceLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={onConfirmPattern}
              disabled={isLoadingPattern || selectedDriverCount === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {isLoadingPattern && <Loader2 size={13} className="animate-spin" />}
              Generar y aplicar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Genera la lista de fechas "libres" dado un patrón de N días
 * on + M días off, empezando en startDay del mes.
 * Devuelve strings 'YYYY-MM-DD'.
 *
 * Ejemplo: daysOn=10, daysOff=2, startDay=1, year=2026, month=7
 *   → días 1-10 trabajo, 11-12 descanso, 13-22 trabajo, 23-24 descanso, 25-31 trabajo
 *   → "libres" = [11, 12, 23, 24]
 *
 * Solo considera el mes en cuestión. Si el ciclo se "corta" porque
 * termina el mes antes de completar, los días restantes se truncan
 * silenciosamente.
 */
function generatePatternDates(
  year: number,
  month: number,
  daysOn: number,
  daysOff: number,
  startDay: number,
): string[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const cycle = daysOn + daysOff;
  if (cycle <= 0 || startDay < 1 || startDay > daysInMonth) return [];
  const free: string[] = [];
  for (let d = startDay; d <= daysInMonth; d++) {
    // offset desde el inicio del ciclo (0 = startDay)
    const offset = d - startDay;
    const posInCycle = offset % cycle;
    if (posInCycle >= daysOn) {
      // Día de descanso
      const ymd = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      free.push(ymd);
    }
  }
  return free;
}

/** Genera el texto de preview del patrón (ej. "1-10 trabajo, 11-12 descanso, 13-22 trabajo, 23-24 descanso, 25-31 trabajo"). */
function generatePatternPreviewText(
  year: number,
  month: number,
  daysOn: number,
  daysOff: number,
  startDay: number,
): string {
  const daysInMonth = new Date(year, month, 0).getDate();
  const cycle = daysOn + daysOff;
  if (cycle <= 0) return "Ciclo inválido";
  const segments: string[] = [];
  let currentStart: number | null = null;
  let currentKind: "trabajo" | "descanso" | null = null;
  const flush = (endDay: number) => {
    if (currentStart == null || currentKind == null) return;
    if (currentStart === endDay) {
      segments.push(`${currentStart} ${currentKind}`);
    } else {
      segments.push(`${currentStart}-${endDay} ${currentKind}`);
    }
  };
  for (let d = startDay; d <= daysInMonth; d++) {
    const offset = d - startDay;
    const posInCycle = offset % cycle;
    const kind: "trabajo" | "descanso" = posInCycle < daysOn ? "trabajo" : "descanso";
    if (kind !== currentKind) {
      // Cerrar el anterior
      if (currentKind != null) flush(d - 1);
      currentStart = d;
      currentKind = kind;
    }
  }
  if (currentKind != null) flush(daysInMonth);
  return segments.join(", ");
}

function DayModal({
  date,
  entries,
  onClose,
}: {
  date: string | null;
  entries: DriverTimeOffEntry[];
  onClose: () => void;
}) {
  const { companyId } = useAuth();
  const { can } = usePermissions();
  // Traemos todos los drivers (Activos) para el selector. La página
  // /gestion/conductores usa useDrivers() que mantiene estado propio;
  // para el modal del horario es más simple un useQuery directo contra
  // el endpoint.
  // jul 2026 v6 — Mandamos `?date=YYYY-MM-DD` para que el backend
  // devuelva `currentAssetPlate` (placa del auto que el conductor
  // tiene ASIGNADO en esa fecha). Así en lugar de mostrar el código
  // del conductor (`COND-373`) mostramos la placa del auto
  // (`ABM-4662`), que es lo que el usuario quiere ver al agendar.
  const { data: driversData } = useQuery({
    queryKey: ["drivers-list", companyId, date],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: "200" });
      if (date) params.set("date", date);
      const res = await fetch(`/api/company/${companyId}/drivers?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{
        data: Array<{
          id: string;
          firstName: string;
          lastName: string;
          code: string;
          status: string;
          currentAssetPlate?: string | null;
        }>;
      }>;
    },
    enabled: !!companyId,
  });
  const createMut = useCreateDriverTimeOff();
  const deleteMut = useDeleteDriverTimeOff();
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);

  // jul 2026 v5 — Migrado a `gestion.conductores` (antes era un
  // submódulo propio `gestion.horario_conductores` que ya no existe).
  // El horario vive dentro del módulo Conductores como una tab.
  const canEdit = can("gestion", "conductores", "crear") || can("gestion", "conductores", "editar");

  // Invalidate de React Query: cuando se cambia de mes, queremos reusar
  // el cache si la queryKey coincide. Pero al cambiar de día no hace
  // falta revalidar.
  const range = useMemo(() => {
    if (!date) return null;
    // El modal siempre muestra 1 día → [date, date+1).
    const [y, m, d] = date.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1, 5, 0, 0));
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Guayaquil",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(next);
    return { from: date, to: ymd };
  }, [date]);

  if (!date) return null;

  const driversAvail = (driversData?.data ?? []).filter(
    (d) => !entries.some((e) => e.driverId === d.id),
  );

  const handleAdd = async (driverId: string) => {
    // driverId viene como "driver-N", necesitamos el número.
    const m = driverId.match(/^driver-(\d+)$/);
    if (!m) return;
    try {
      await createMut.mutateAsync({ driverId: Number(m[1]), date });
      setPicking(false);
      toast.success("Conductor agregado");
    } catch (err) {
      toast.error((err as Error).message || "No se pudo agregar");
    }
  };

  const handleRemove = async (entry: DriverTimeOffEntry) => {
    try {
      await deleteMut.mutateAsync(entry.id);
      toast.success("Conductor quitado");
    } catch (err) {
      toast.error((err as Error).message || "No se pudo quitar");
    }
  };

  // Refrescar la lista del mes (que contiene este día) después de add/remove.
  useEffect(() => {
    if (!range || !companyId) return;
    // Nada que hacer — la mutation ya invalida. Pero por las dudas, re-fetch
    // explícito de la lista del día (no la usamos, pero limpia el cache).
    qc.invalidateQueries({ queryKey: ["driverSchedule", companyId] });
  }, [entries.length, range, companyId, qc]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-white/[0.08] dark:bg-[#1a1a23]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Conductores libres — {fmtDateShortEc(date)}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {entries.length} conductor{entries.length !== 1 ? "es" : ""} libre{entries.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Lista de libres con avatares — jul 2026 v2 */}
        {entries.length === 0 ? (
          <div className="my-6 flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400">
            <UserMinus size={28} className="opacity-40" />
            <p className="text-sm">No hay conductores libres este día</p>
          </div>
        ) : (
          <ul className="mb-4 max-h-72 space-y-1.5 overflow-y-auto">
            {entries.map((e) => {
              const c = getDriverColor(e.driverId);
              return (
                <li
                  key={e.id}
                  className={
                    "group flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors " +
                    c.bg + " border-transparent hover:border-current/20"
                  }
                >
                  <DriverAvatar
                    driverId={e.driverId}
                    firstName={e.driver.firstName}
                    lastName={e.driver.lastName}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {e.driver.firstName} {e.driver.lastName}
                      </span>
                      {e.reason && e.reason !== "libre" && (
                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                          {e.reason}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      {e.driver.currentAssetPlate
                        ? <>· {e.driver.currentAssetPlate}</>
                        : e.driver.code}
                    </span>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleRemove(e)}
                      disabled={deleteMut.isPending}
                      className="rounded-md p-1.5 text-rose-500 opacity-0 transition-opacity hover:bg-rose-100 group-hover:opacity-100 disabled:opacity-50 dark:hover:bg-rose-500/20"
                      aria-label="Quitar"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Botón agregar */}
        {canEdit && (
          <>
            {!picking ? (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/[0.1] dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/[0.04]"
              >
                <Users size={14} />
                Agregar conductor libre
              </button>
            ) : (
              <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2 dark:border-violet-500/20 dark:bg-violet-500/5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                    Selecciona un conductor
                  </span>
                  <button
                    type="button"
                    onClick={() => setPicking(false)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Cancelar
                  </button>
                </div>
                {driversAvail.length === 0 ? (
                  <p className="px-2 py-3 text-center text-sm text-gray-500">
                    Todos los conductores ya están en la lista
                  </p>
                ) : (
                  <ul className="max-h-48 space-y-1 overflow-y-auto">
                    {driversAvail.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => handleAdd(d.id)}
                          disabled={createMut.isPending}
                          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-violet-100/60 disabled:opacity-50 dark:hover:bg-violet-500/10"
                        >
                          <DriverAvatar
                            driverId={d.id}
                            firstName={d.firstName}
                            lastName={d.lastName}
                            size="sm"
                          />
                          <span className="flex-1 truncate">
                            {d.firstName} {d.lastName}{" "}
                            <span className="text-xs text-gray-500">
                              {d.currentAssetPlate
                                ? <>· {d.currentAssetPlate}</>
                                : `(${d.code})`}
                            </span>
                          </span>
                          <Plus size={12} className="shrink-0 text-violet-700 dark:text-violet-300" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────

export function HorarioConductoresCalendar() {
  const { can } = usePermissions();
  const { companyId } = useAuth();
  // jul 2026 v5 — Migrado a `gestion.conductores.ver`. Mismo permiso
  // que la página de Conductores: si podés ver la lista, podés ver
  // el horario. Para editar, ver `canEdit` en DayModal.
  const canView = can("gestion", "conductores", "ver");

  const [year, setYear] = useState(() => {
    const t = todayYmdEc();
    return Number(t.split("-")[0]);
  });
  const [month, setMonth] = useState(() => {
    const t = todayYmdEc();
    return Number(t.split("-")[1]);
  });

  const todayYmd = useMemo(todayYmdEc, []);
  const range = useMemo(() => monthRangeEc(year, month), [year, month]);
  // jul 2026 — BUG FIX: `range` tiene `toExclusive` (semántica backend),
  // pero el hook espera `to`. Sin el mapping, el hook solo mandaba
  // `from` al backend, que caía al fallback de "1 día" y la respuesta
  // venía vacía. Acá mapeamos explícito.
  const { data, isLoading, error } = useDriverScheduleList({
    from: range.from,
    to:   range.toExclusive,
  });
  const { data: hasAny } = useDriverScheduleHasAny(year, month);
  const copyMut = useCopyDriverScheduleFromPrevious();

  // jul 2026 — El modal de "Copiar / Patrón" ahora se abre desde un
  // BOTÓN en el header (no más popup automático). El usuario lo abre
  // cuando quiere. Mantenemos `showCopyPrompt` como flag del modal
  // y `isMonthEmpty` como hint para destacar el botón.
  const [showCopyPrompt, setShowCopyPrompt] = useState(false);
  // jul 2026 — `isMonthEmpty` se usa para poner un dot/badge en el
  // botón "Programar este mes" cuando el mes actual está vacío, así
  // el admin sabe de un vistazo que podría usar el asistente.
  const isMonthEmpty = hasAny ? !hasAny.hasAny : false;

  const dismissCopyPrompt = () => {
    setShowCopyPrompt(false);
  };

  const handleCopy = async () => {
    try {
      const r = await copyMut.mutateAsync({ targetMonth: month, targetYear: year });
      toast.success(`Se copiaron ${r.copied} entradas.`);
      if (r.skippedDayMismatch > 0) {
        toast.warning(`${r.skippedDayMismatch} entradas se saltaron por mismatch de día (ej. 31 → feb).`);
      }
      dismissCopyPrompt();
    } catch (err) {
      toast.error((err as Error).message || "No se pudo copiar");
    }
  };

  // ── jul 2026 — Patrón de trabajo/descanso ─────────────────────────────
  const [daysOn, setDaysOn] = useState(10);
  const [daysOff, setDaysOff] = useState(2);
  const [startDay, setStartDay] = useState(1);
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<number>>(new Set());
  // Por default, todos los conductores activos seleccionados. Se setea
  // cuando llega la lista del backend.
  const [driverListInitialized, setDriverListInitialized] = useState(false);

  // Traemos los conductores activos para el selector.
  const { data: driversData } = useQuery({
    queryKey: ["drivers-active", companyId],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: "200", status: "Activo" });
      const res = await fetch(`/api/company/${companyId}/drivers?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{
        data: Array<{ id: string; firstName: string; lastName: string; code: string; status: string }>;
      }>;
    },
    enabled: !!companyId,
  });

  // Cuando llegan los drivers por primera vez, los seleccionamos todos.
  useEffect(() => {
    if (driverListInitialized) return;
    const list = driversData?.data ?? [];
    if (list.length === 0) return;
    setSelectedDriverIds(new Set(list.map((d) => Number(d.id.match(/^driver-(\d+)$/)?.[1] ?? 0)).filter(Boolean)));
    setDriverListInitialized(true);
  }, [driversData, driverListInitialized]);

  const patternDates = useMemo(
    () => generatePatternDates(year, month, daysOn, daysOff, startDay),
    [year, month, daysOn, daysOff, startDay],
  );
  const patternPreviewText = useMemo(
    () => generatePatternPreviewText(year, month, daysOn, daysOff, startDay),
    [year, month, daysOn, daysOff, startDay],
  );

  const bulkMut = useBulkCreateDriverTimeOff();
  const handleApplyPattern = async () => {
    if (selectedDriverIds.size === 0) {
      toast.error("Seleccioná al menos un conductor");
      return;
    }
    if (patternDates.length === 0) {
      toast.error("El patrón no genera ningún día libre");
      return;
    }
    const entries: Array<{ driverId: number; date: string; reason: null }> = [];
    for (const driverId of selectedDriverIds) {
      for (const date of patternDates) {
        entries.push({ driverId, date, reason: null });
      }
    }
    try {
      const r = await bulkMut.mutateAsync(entries);
      toast.success(
        `Patrón aplicado: ${r.inserted} entradas creadas (${r.skipped} ya existían).`,
      );
      if (r.skipped > 0) {
        toast.warning(`${r.skipped} entradas se omitieron porque ya existían.`);
      }
      dismissCopyPrompt();
    } catch (err) {
      toast.error((err as Error).message || "No se pudo aplicar el patrón");
    }
  };

  // Modal de día
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const entriesByDate = useMemo(() => {
    const map = new Map<string, DriverTimeOffEntry[]>();
    for (const e of data?.data ?? []) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [data]);

  // jul 2026 v3 — Total de entries del mes, para el badge del header.
  const totalEntriesInMonth = data?.data?.length ?? 0;

  const cells = useMemo(() => buildMonthGrid(year, month, todayYmd), [year, month, todayYmd]);

  // Permisos
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-12 text-center text-gray-500">
        <AlertCircle size={28} className="opacity-40" />
        <p className="text-sm">No tienes permiso para ver la gestión de conductores.</p>
      </div>
    );
  }

  const goPrev = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); } else { setMonth(month - 1); }
  };
  const goNext = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); } else { setMonth(month + 1); }
  };
  const goToday = () => {
    const t = todayYmdEc().split("-");
    setYear(Number(t[0]));
    setMonth(Number(t[1]));
  };

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
  const isCurrentMonth = year === Number(todayYmd.split("-")[0]) && month === Number(todayYmd.split("-")[1]);

  // Source label para el prompt
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const sourceLabel = `${MONTH_NAMES[prev.month - 1]} ${prev.year}`;

  return (
    <div className="space-y-5">
      {/* jul 2026 v5 — Este componente ya no renderiza el header de
          página (ícono + título "Horario de conductores" + descripción).
          Esos elementos los provee el padre (Drivers/page.tsx via
          ModulePageHeader). Acá solo va la navegación de mes (arrows,
          month label, "Hoy", "Programar este mes") que es específica
          del calendario. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        {/* Navegación de mes — jul 2026 v4: pastel, sin gradientes. */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Mes anterior"
            className="group flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-all duration-150 hover:scale-110 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-600 active:scale-95 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-400 dark:hover:border-violet-500/30 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
          >
            <ChevronLeft size={18} className="transition-transform group-hover:-translate-x-0.5" />
          </button>
          <div className="min-w-[160px] px-3 py-1.5 text-center">
            <span className="text-base font-bold tracking-tight text-gray-800 dark:text-white">
              {monthLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={goNext}
            aria-label="Mes siguiente"
            className="group flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-all duration-150 hover:scale-110 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-600 active:scale-95 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-400 dark:hover:border-violet-500/30 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
          >
            <ChevronRight size={18} className="transition-transform group-hover:translate-x-0.5" />
          </button>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={goToday}
              className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-700 transition-all hover:scale-105 active:scale-95 dark:bg-violet-500/20 dark:text-violet-200"
            >
              <CalendarDays size={11} />
              Hoy
            </button>
          )}
          {/* jul 2026 v4 — Botón "Programar este mes" en pastel amber.
              Sin gradient, ícono Zap (no Sparkles que parecía emoji). */}
          <button
            type="button"
            onClick={() => setShowCopyPrompt(true)}
            className={
              "ml-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition " +
              (isMonthEmpty
                ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.06]")
            }
            title={
              isMonthEmpty
                ? "Este mes no tiene programación. Click para usar el asistente (copiar del mes anterior o aplicar un patrón)."
                : "Abrir el asistente de programación mensual"
            }
          >
            <Wand2 size={12} />
            Programar este mes
            {isMonthEmpty && (
              <span
                className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 dark:bg-amber-300"
                aria-label="Mes vacío"
              />
            )}
          </button>
        </div>
      </div>

      {/* Estado */}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          No se pudo cargar el horario: {(error as Error).message}
        </div>
      )}

      {/* Calendario */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
        <div>
          {/* Header de días — jul 2026 v4: pastel muy sutil, sin gradient,
              weekend apenas tintado. */}
          <div className="mb-2 grid grid-cols-7 gap-1.5">
            {DAY_NAMES_SHORT.map((d, i) => {
              const isWeekend = i === 5 || i === 6;
              return (
                <div
                  key={i}
                  title={DAY_NAMES_FULL[i]}
                  className={
                    "rounded-md py-1.5 text-center text-[11px] font-bold uppercase tracking-wider " +
                    (isWeekend
                      ? "text-amber-500/80 bg-amber-50/40 dark:text-amber-400/80 dark:bg-amber-500/5"
                      : "text-gray-400 dark:text-gray-500")
                  }
                >
                  {d}
                </div>
              );
            })}
          </div>

        {/* jul 2026 v4 — Banner CTA "mes vacío" — pastel sólido, sin
            gradient, sin ícono que parezca emoji. Más discreto y
            elegante que la v2. */}
        {isMonthEmpty && !isLoading && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/25 dark:bg-amber-500/10">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-500/20">
              <CalendarDays size={18} className="text-amber-700 dark:text-amber-300" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                {monthLabel} no tiene programación
              </h3>
              <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
                Usá el asistente para copiar el mes anterior o aplicar un patrón de trabajo/descanso.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCopyPrompt(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/40 dark:bg-white/[0.04] dark:text-amber-200 dark:hover:bg-amber-500/20"
            >
              <Wand2 size={12} />
              Programar
            </button>
          </div>
        )}

        {/* Grilla 6x7 */}
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((cell, i) => {
              const cellEntries = cell.date ? entriesByDate.get(cell.date) ?? [] : [];
              const count = cellEntries.length;
              const visibleDrivers = cellEntries.slice(0, 3);
              const hiddenCount = Math.max(0, count - 3);
              // jul 2026 v4 — Color del "primer driver" del día. Sin
              // gradient: bg pastel sólido del PALETTE (ya suficientemente
              // suave en v4).
              const tintColor = count > 0 ? getDriverColor(cellEntries[0]?.driverId ?? "default") : null;
              const colInRow = i % 7;
              const isWeekend = colInRow === 5 || colInRow === 6;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!cell.date}
                  onClick={() => cell.date && setSelectedDate(cell.date)}
                  className={
                    "group relative flex min-h-[88px] flex-col items-stretch gap-1.5 overflow-hidden rounded-xl border p-1.5 text-left transition-all duration-200 " +
                    (cell.date
                      ? cell.isToday
                        // Hoy: pastel violet plano + ring simple, sin shadow glow
                        ? "border-violet-200 bg-violet-50 ring-1 ring-violet-300/60 dark:border-violet-500/30 dark:bg-violet-500/10 dark:ring-violet-400/40"
                        : count > 0 && tintColor
                          // Con entries: pastel del primer driver (sin gradient)
                          ? `border-transparent ${tintColor.bg} ${tintColor.ring} ring-1`
                          : isWeekend
                            // Weekend sin entries: tinte amber muy suave
                            ? "border-amber-100 bg-amber-50/40 dark:border-amber-500/10 dark:bg-amber-500/[0.03]"
                            // Default: neutral
                            : "border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.02]"
                      : "border-transparent bg-transparent cursor-default") +
                    (cell.date && !cell.isToday
                      ? " hover:-translate-y-0.5 hover:shadow-md hover:border-violet-200 active:translate-y-0 dark:hover:border-violet-500/30"
                      : "") +
                    (cell.isCurrentMonth ? "" : " opacity-40")
                  }
                >
                  {/* jul 2026 v4 — Strip lateral del color del primer
                      driver, versión pastel (no saturada). */}
                  {cell.date && count > 0 && tintColor && (
                    <span
                      className={
                        "absolute inset-y-0 left-0 w-1 rounded-l-xl " +
                        tintColor.text.replace("text-", "bg-").replace("-700", "-200").replace("-300", "-500/40")
                      }
                    />
                  )}

                  {/* Header: día + count badge */}
                  <div className="flex items-center justify-between">
                    <span
                      className={
                        "text-xs font-bold tabular-nums " +
                        (cell.isCurrentMonth
                          ? cell.isToday
                            ? "text-violet-700 dark:text-violet-200"
                            : isWeekend && count === 0
                              ? "text-amber-600/80 dark:text-amber-400/70"
                              : "text-gray-700 dark:text-gray-200"
                          : "text-gray-300 dark:text-gray-600")
                      }
                    >
                      {cell.day}
                    </span>
                    {count > 0 && (
                      <span
                        className={
                          "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums " +
                          (tintColor?.bg ?? "") + " " + (tintColor?.text ?? "")
                        }
                      >
                        {count}
                      </span>
                    )}
                  </div>

                  {/* Stack de avatares (overlap) */}
                  {cell.date && count > 0 && (
                    <div className="flex flex-1 flex-col justify-end gap-1">
                      <div className="flex items-center -space-x-1.5">
                        {visibleDrivers.map((e) => (
                          <DriverAvatar
                            key={e.id}
                            driverId={e.driverId}
                            firstName={e.driver.firstName}
                            lastName={e.driver.lastName}
                            size="sm"
                          />
                        ))}
                        {hiddenCount > 0 && (
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-700 ring-1 ring-gray-300 dark:bg-white/[0.08] dark:text-gray-300 dark:ring-white/[0.12]">
                            +{hiddenCount}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* jul 2026 v4 — "Empezar aquí": hint más suave. Border
                      dashed ámbar muy tenue + pill plana, sin sombras. */}
                  {cell.date && cell.day === 1 && cell.isCurrentMonth && isMonthEmpty && count === 0 && (
                    <div className="absolute inset-1.5 flex items-center justify-center rounded-lg border border-dashed border-amber-200/80 pointer-events-none dark:border-amber-500/25">
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
                        Empezar aquí
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Leyenda — jul 2026 v2: muestra un set de los colores del
            palette para que el admin vea que cada color representa
            un conductor diferente (consistente con los avatares). */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Colores
          </span>
          {DRIVER_PALETTE.slice(0, 6).map((c, i) => (
            <span
              key={i}
              className={"inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold " + c.bg + " " + c.text}
              title="Conductor"
            >
              {String.fromCharCode(65 + i)}
            </span>
          ))}
          <span className="ml-auto text-[10px] text-gray-400">
            Click en una celda para editar
          </span>
        </div>
        </div>
      </div>

      {/* Modal de día */}
      {selectedDate && (
        <DayModal
          date={selectedDate}
          entries={entriesByDate.get(selectedDate) ?? []}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {/* Prompt de copia / patrón */}
      <CopyPromptModal
        open={showCopyPrompt}
        onConfirmCopy={handleCopy}
        onConfirmPattern={handleApplyPattern}
        onDismiss={dismissCopyPrompt}
        isLoadingCopy={copyMut.isPending}
        isLoadingPattern={bulkMut.isPending}
        sourceLabel={sourceLabel}
        targetLabel={monthLabel}
        patternPreview={patternPreviewText}
        selectedDriverCount={selectedDriverIds.size}
        daysOn={daysOn}
        setDaysOn={setDaysOn}
        daysOff={daysOff}
        setDaysOff={setDaysOff}
        startDay={startDay}
        setStartDay={setStartDay}
        patternDryRun={() => {
          const total = patternDates.length * selectedDriverIds.size;
          toast.info(`Se crearían ${total} entradas (${patternDates.length} días × ${selectedDriverIds.size} conductores).`);
        }}
        isLoadingDryRun={false}
      />
    </div>
  );
}

// Helper deprecado: se removió porque ahora usamos useAuth() directamente
// en el componente padre. Se deja el comentario vacío para que cualquier
// search engine interno no se confunda.

export default HorarioConductoresCalendar;
