"use client";

// pages/Combustible/components/FuelCalendarBreakdown.tsx
//
// Mini-calendario de consumo. Header con select de mes + select de año
// (en vez de flechas), números de día grandes y bold, columna domingo
// acentuada en cyan (acento del módulo), día actual subrayado en cyan.
// Heatmap cyan se mantiene para días con cargas. Click en un día con
// cargas → timeline del día (mismo contenedor). Solo admin/owner.

import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronDown } from "lucide-react";
import type { ApiFuelEntry } from "../../../hooks/useFuel";

type Props = {
  entries: ApiFuelEntry[];
  isAdmin: boolean;
};

function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];
const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function bucketByDay(entries: ApiFuelEntry[], year: number, month: number) {
  const map = new Map<string, ApiFuelEntry[]>();
  for (const e of entries) {
    const d = new Date(e.date);
    if (isNaN(d.getTime())) continue;
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    const key = e.date.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return map;
}

// ── Select compacto tipo "pill" (mes / año) ─────────────────────────────────
function PillSelect<T extends string | number>({
  value,
  options,
  onChange,
  minWidth = 92,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  minWidth?: number;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  return (
    <div
      className="relative inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 dark:border-white/[0.08] dark:bg-white/[0.04]"
      style={{ minWidth }}
    >
      <select
        ref={ref}
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const match = options.find((o) => String(o.value) === raw);
          if (match) onChange(match.value);
        }}
        className="w-full cursor-pointer appearance-none bg-transparent pr-4 text-xs font-bold text-gray-700 outline-none dark:text-gray-200"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={11} className="pointer-events-none absolute right-2 text-gray-400" />
    </div>
  );
}

export function FuelCalendarBreakdown({ entries, isAdmin }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  if (!isAdmin) return null;

  const dayBuckets = useMemo(
    () => bucketByDay(entries, viewYear, viewMonth),
    [entries, viewYear, viewMonth]
  );

  const maxGallons = useMemo(() => {
    let m = 0;
    for (const arr of dayBuckets.values()) {
      const g = arr.reduce((a, e) => a + Number(e.gallons ?? 0), 0);
      if (g > m) m = g;
    }
    return m;
  }, [dayBuckets]);

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const cells: Array<{ key: string; day: number | null }> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ key: `pad-${i}`, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ key: `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, day: d });
  }

  const selectedEntries = selectedDay ? (dayBuckets.get(selectedDay) ?? []) : [];
  const sortedSelected = useMemo(() => {
    return [...selectedEntries].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  }, [selectedEntries]);

  const selectedTotals = useMemo(() => {
    const gallons = sortedSelected.reduce((a, e) => a + Number(e.gallons ?? 0), 0);
    const cost = sortedSelected.reduce((a, e) => a + Number(e.cost ?? 0), 0);
    return { gallons, cost, count: sortedSelected.length };
  }, [sortedSelected]);

  function intensityFor(day: number | null): number {
    if (day == null) return 0;
    const key = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const arr = dayBuckets.get(key);
    if (!arr || arr.length === 0) return 0;
    const g = arr.reduce((a, e) => a + Number(e.gallons ?? 0), 0);
    if (maxGallons <= 0) return 0;
    return Math.max(0.25, g / maxGallons);
  }

  function dayGallons(day: number): number {
    const key = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const arr = dayBuckets.get(key);
    if (!arr) return 0;
    return arr.reduce((a, e) => a + Number(e.gallons ?? 0), 0);
  }

  function isToday(day: number): boolean {
    return day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
  }

  // Año actual ± rango razonable para el select
  const yearOptions = useMemo(() => {
    const base = today.getFullYear();
    const arr: number[] = [];
    for (let y = base - 3; y <= base + 1; y++) arr.push(y);
    if (!arr.includes(viewYear)) arr.push(viewYear);
    return arr.sort((a, b) => a - b);
  }, [viewYear]);

  // ── Estilo: tarjeta compacta, header con selects de mes/año, grid de
  //    7 cols, columna domingo acentuada en cyan, día actual subrayado ──
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-4">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={selectedDay ? "timeline" : "calendar"}
          initial={{ opacity: 0, x: selectedDay ? 16 : -16, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: selectedDay ? -16 : 16, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        >
      {selectedDay ? (
        // ── Timeline view ─────────────────────────────────────────────
        <>
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition"
              title="Volver al calendario"
            >
              <ArrowLeft size={12} /> Calendario
            </button>
            <h3 className="text-sm font-bold text-gray-800 dark:text-white">
              {(() => {
                const d = new Date(selectedDay);
                return `${d.getDate()} ${MONTH_LABELS[d.getMonth()].toLowerCase()}`;
              })()}
            </h3>
          </div>

          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
            {selectedTotals.count} carga{selectedTotals.count !== 1 ? "s" : ""} ·{" "}
            <span className="font-bold text-cyan-600 dark:text-cyan-400">{selectedTotals.gallons.toFixed(2)} gal</span>
            {" · "}
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(selectedTotals.cost)}</span>
          </p>

          <div className="relative pl-5">
            {sortedSelected.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 py-4 text-center">Sin cargas.</p>
            ) : (
              <ol className="space-y-2.5">
                {sortedSelected.map((e, idx) => {
                  const time = e.createdAt
                    ? new Date(e.createdAt).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })
                    : "—";
                  const isLast = idx === sortedSelected.length - 1;
                  return (
                    <li key={e.id} className="relative">
                      {!isLast && (
                        <span className="absolute left-[-12px] top-3.5 bottom-[-10px] w-px bg-cyan-300 dark:bg-cyan-500/40" />
                      )}
                      <span className="absolute left-[-16px] top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full border-2 border-cyan-500 bg-white dark:bg-gray-900">
                        <span className="h-1 w-1 rounded-full bg-cyan-500" />
                      </span>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[12px] font-bold text-gray-800 dark:text-white truncate">
                          {e.assetPlate ?? e.assetName ?? "Vehículo"}
                        </p>
                        <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">{time}</span>
                      </div>
                      <p className="text-[10.5px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {Number(e.gallons).toFixed(2)} gal · {fmtMoney(Number(e.cost))}
                        {e.station ? ` · ${e.station}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </>
      ) : (
        // ── Calendar view ─────────────────────────────────────────────
        <>
          {/* Header: título + badge tipo "hoja de calendario" cyan */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-white leading-tight">Consumo diario</h3>
              <p className="text-[10.5px] text-gray-400 dark:text-gray-500">Selecciona un día con carga</p>
            </div>
            <div className="flex h-9 w-9 flex-col items-center justify-center rounded-lg bg-cyan-500 text-white leading-none shrink-0">
              <span className="text-[8px] font-bold uppercase tracking-wide opacity-80">
                {MONTH_LABELS[today.getMonth()].slice(0, 3)}
              </span>
              <span className="text-sm font-black tabular-nums">{today.getDate()}</span>
            </div>
          </div>

          {/* Selects de mes / año */}
          <div className="flex items-center gap-2 mb-3">
            <PillSelect
              value={viewMonth}
              minWidth={104}
              options={MONTH_LABELS.map((m, i) => ({ value: i, label: m }))}
              onChange={(v) => setViewMonth(v)}
            />
            <PillSelect
              value={viewYear}
              minWidth={68}
              options={yearOptions.map((y) => ({ value: y, label: String(y) }))}
              onChange={(v) => setViewYear(v)}
            />
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1 text-center">
            {WEEKDAY_LABELS.map((w, i) => {
              const isSunday = i === 6;
              return (
                <div
                  key={i}
                  className={`text-[10px] font-bold ${
                    isSunday
                      ? "text-cyan-600 dark:text-cyan-400"
                      : "text-gray-400 dark:text-gray-500"
                  }`}
                >
                  {w}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, idx) => {
              if (c.day == null) return <div key={c.key} className="h-9" />;
              const intensity = intensityFor(c.day);
              const hasData = intensity > 0;
              const todayMark = isToday(c.day);
              const gallons = dayGallons(c.day);
              const isSundayCol = idx % 7 === 6;

              const bg = hasData ? `rgba(6, 182, 212, ${0.18 + intensity * 0.6})` : "transparent";
              const textColor = hasData && intensity > 0.55
                ? "text-white"
                : hasData
                  ? "text-cyan-900 dark:text-cyan-50"
                  : isSundayCol
                    ? "text-cyan-600 dark:text-cyan-400"
                    : "text-gray-700 dark:text-gray-300";

              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => hasData && setSelectedDay(c.key)}
                  disabled={!hasData}
                  className={`h-9 flex items-center justify-center rounded-md text-[13px] font-bold transition ${
                    hasData ? "hover:scale-105 cursor-pointer" : "cursor-default"
                  }`}
                  style={hasData ? { background: bg } : undefined}
                  title={hasData ? `${gallons.toFixed(1)} gal` : undefined}
                >
                  <span className={`${textColor} ${todayMark ? "underline decoration-cyan-500 decoration-2 underline-offset-[3px]" : ""}`}>
                    {c.day}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Leyenda mínima */}
          <div className="mt-3 flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500">
            <div className="inline-flex items-center gap-1">
              <span>Menor</span>
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "rgba(6, 182, 212, 0.2)" }} />
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "rgba(6, 182, 212, 0.5)" }} />
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "rgba(6, 182, 212, 0.8)" }} />
              <span>Mayor</span>
            </div>
            <span className="tabular-nums">{dayBuckets.size} días con carga</span>
          </div>
        </>
      )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}