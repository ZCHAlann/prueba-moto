"use client";

// ─────────────────────────────────────────────────────────────────────────────
// pages/Reports/components/WidgetConfigModal.tsx
//
// Modal de 2 pasos para CONFIGURAR un widget del canvas:
//   Paso 1 — Tipo de visualización: ¿Gráfica o Tabla? Si gráfica, subtipo.
//   Paso 2 — Alcance (todos / uno / varios) + rango de fechas + período.
//
// Se usa tanto para CREAR (al arrastrar un módulo al canvas) como para
// EDITAR un widget existente (botón ✎ en la tarjeta del widget).
//
// Para edición se pasa la prop `widget` con los valores actuales; el modal
// inicializa su estado desde ese widget.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, BarChart3, Table2, ArrowLeft, ArrowRight, ChevronRight,
  BarChartHorizontal, BarChart, LineChart as LineIcon,
  TrendingUp, PieChart as PieIcon, Radar as RadarIcon, AlertCircle, Check, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { EntityPicker } from "./EntityPicker";
import { DatePicker } from "@/components/ui/date-picker/DatePicker";
import type { CanvasWidget, CanvasWidgetChartType } from "../../../hooks/useCanvasBoards";
import { todayEcuador } from "@/lib/datetime";

type Modulo =
  | "mantenimiento" | "combustible" | "flotas" | "conductores"
  | "checklists" | "alertas" | "ac" | "seguros" | "peajes" | "asignaciones";

/** Módulo → kind de entidad que compara. */
const MODULO_ENTITY_KIND: Record<Modulo, "asset" | "driver"> = {
  mantenimiento: "asset",
  combustible:   "asset",
  flotas:        "asset",
  checklists:    "asset",
  alertas:       "asset",
  ac:            "asset",
  seguros:       "asset",
  peajes:        "asset",
  conductores:   "driver",
  asignaciones:  "driver",
};

type ChartTypeOption = {
  key: CanvasWidgetChartType;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  // null = no se permite con scope='varios'
  allowedScopes: ("todos" | "uno" | "varios")[];
  hint?: string;
};

const CHART_OPTIONS: ChartTypeOption[] = [
  { key: "bar_h",             label: "Barras horizontales",     icon: BarChartHorizontal, allowedScopes: ["todos", "uno", "varios"], hint: "Top N" },
  { key: "bar_v",             label: "Barras verticales",       icon: BarChart,           allowedScopes: ["todos", "uno", "varios"] },
  { key: "line",              label: "Línea / área",            icon: LineIcon,           allowedScopes: ["todos", "uno", "varios"] },
  { key: "line_exponencial",  label: "Línea exponencial",       icon: TrendingUp,         allowedScopes: ["todos", "uno", "varios"] },
  { key: "pie",               label: "Pastel / dona",           icon: PieIcon,            allowedScopes: ["todos", "uno"] },
  { key: "radar",             label: "Radar",                   icon: RadarIcon,          allowedScopes: ["todos", "uno", "varios"] },
];

export type WidgetConfigOutput = {
  modulo: Modulo;
  vizKind: "chart" | "table";
  chartType: CanvasWidgetChartType | null;
  scope: "todos" | "uno" | "varios";
  entityKind: "asset" | "driver" | null;
  entityIds: number[];
  periodo: "month" | "quarter" | "year";
  fechaDesde: string;
  fechaHasta: string;
  title: string | null;
  /** Módulo a mostrar side-by-side con `modulo` (solo charts). Null = sin combinar. */
  secondaryModulo: Modulo | null;
};

export function WidgetConfigModal({
  modulo: moduloProp,
  widget,
  onClose,
  onSubmit,
}: {
  /** Requerido al crear; si se pasa `widget`, su modulo tiene prioridad. */
  modulo?: Modulo;
  /** Si se pasa, el modal abre en modo edición con los valores pre-rellenos. */
  widget?: CanvasWidget;
  onClose: () => void;
  onSubmit: (out: WidgetConfigOutput) => void | Promise<void>;
}) {
  // En modo edición el módulo viene del widget; al crear viene por prop.
  const modulo: Modulo = (widget?.modulo as Modulo) ?? moduloProp!;

  // ─── Estado ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1);

  const [vizKind,  setVizKind]  = useState<"chart" | "table">(widget?.vizKind ?? "chart");
  const [chartType, setChartType] = useState<CanvasWidgetChartType | null>(
    widget?.chartType ?? "bar_v",
  );

  const entityKind = useMemo(() => MODULO_ENTITY_KIND[modulo], [modulo]);

  const [scope, setScope] = useState<"todos" | "uno" | "varios">(widget?.scope ?? "todos");
  const [entityIds, setEntityIds] = useState<number[]>(widget?.entityIds ?? []);
  const today = todayEcuador();
  const [fechaDesde, setFechaDesde] = useState<string>(widget?.fechaDesde ?? today);
  const [fechaHasta, setFechaHasta] = useState<string>(widget?.fechaHasta ?? today);
  const [periodo, setPeriodo]       = useState<"month" | "quarter" | "year">(widget?.periodo ?? "month");
  const [title, setTitle]           = useState<string>(widget?.title ?? "");

  // ─── Validación ─────────────────────────────────────────────────────────
  const canGoStep2 =
    (vizKind === "table") ||
    (vizKind === "chart" && chartType !== null);

  const canSubmit =
    scope === "todos" ||
    (entityKind !== null && entityIds.length === 1) ||
    (entityKind !== null && entityIds.length >= 2 && entityIds.length <= 6);

  // ─── Handlers ───────────────────────────────────────────────────────────
  function handleSubmit() {
    if (vizKind === "chart" && !chartType) {
      toast.error("Elegí un tipo de gráfica.");
      return;
    }
    if (scope !== "todos" && entityIds.length === 0) {
      toast.error("Elegí al menos una entidad.");
      return;
    }
    if (scope === "uno" && entityIds.length !== 1) {
      toast.error("Para 'Uno' tenés que elegir exactamente 1 entidad.");
      return;
    }
    if (scope === "varios" && (entityIds.length < 2 || entityIds.length > 6)) {
      toast.error("Para 'Varios' elegí entre 2 y 6 entidades.");
      return;
    }
    if (!fechaDesde || !fechaHasta) {
      toast.error("Elegí el rango de fechas.");
      return;
    }
    onSubmit({
      modulo,
      vizKind,
      chartType: vizKind === "chart" ? chartType : null,
      scope,
      entityKind: scope === "todos" ? null : entityKind,
      // Filtramos NaN/null: si el EntityPicker dejó IDs inválidos en el
      // state (por ejemplo durante una transición de scope), no los
      // mandamos al backend.
      entityIds:  scope === "todos"
        ? []
        : entityIds.filter((id): id is number => Number.isFinite(id)),
      periodo,
      fechaDesde,
      fechaHasta,
      title: title.trim() || null,
      // Aún no hay UI en el modal para combinar con un segundo módulo;
      // se manda null explícito para satisfacer WidgetConfigOutput.
      secondaryModulo: null,
    });
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-3 sm:p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-white/[0.06]">
            <div>
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                {widget ? <Pencil size={10} /> : null}
                {widget ? "Editar widget" : `Paso ${step} de 2`}
              </p>
              <h2 className="text-base font-bold text-gray-800 dark:text-white">
                {widget
                  ? (step === 1 ? "Visualización" : "Alcance y fechas")
                  : (step === 1 ? "Elegí cómo visualizar" : "Alcance y fechas")}
              </h2>
            </div>
            <button onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-white">
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <AnimatePresence mode="wait">
              {step === 1 ? (
                <motion.div key="step1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.15 }}>
                  {/* Viz kind */}
                  <div className="grid grid-cols-2 gap-2">
                    <VizButton active={vizKind === "chart"} onClick={() => setVizKind("chart")} icon={<BarChart3 size={18} />} label="Gráfica" />
                    <VizButton active={vizKind === "table"} onClick={() => setVizKind("table")} icon={<Table2 size={18} />} label="Tabla" />
                  </div>

                  {/* Chart type — solo si vizKind='chart' */}
                  {vizKind === "chart" && (
                    <div className="mt-4">
                      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Subtipo de gráfica
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {CHART_OPTIONS.map((opt) => (
                          <ChartTypeBtn
                            key={opt.key}
                            active={chartType === opt.key}
                            onClick={() => setChartType(opt.key)}
                            icon={<opt.icon size={16} />}
                            label={opt.label}
                            hint={opt.hint}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Title override */}
                  <div className="mt-4">
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Título <span className="font-normal text-gray-400">(opcional)</span>
                    </p>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={160}
                      placeholder="Sin título — usa el default del módulo"
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200"
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div key="step2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.15 }} className="space-y-4">
                  {/* Alcance */}
                  <div>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Alcance</p>
                    <div className="flex flex-wrap gap-1.5">
                      <ScopeBtn active={scope === "todos"}  onClick={() => { setScope("todos"); setEntityIds([]); }}  label="Todos"  hint="Toda la empresa" />
                      <ScopeBtn active={scope === "uno"}    onClick={() => { setScope("uno");   setEntityIds([]); }}  label="Uno"    hint={entityKind === "asset" ? "Un vehículo" : "Un conductor"} />
                      <ScopeBtn active={scope === "varios"} onClick={() => { setScope("varios"); setEntityIds([]); }} label="Varios" hint="Comparar 2-6" />
                    </div>
                  </div>

                  {/* Selector de entidad (oculto si scope='todos') */}
                  {scope !== "todos" && (
                    <div>
                      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {entityKind === "asset" ? "Activos" : "Conductores"} {scope === "uno" ? "(elegí 1)" : "(2-6)"}
                      </p>
                      <EntityPicker
                        kind={entityKind}
                        selectedIds={entityIds}
                        multi={scope === "varios"}
                        onChange={setEntityIds}
                      />
                      {scope === "varios" && entityIds.length > 0 && entityIds.length < 2 && (
                        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                          Para "Varios" necesitás al menos 2.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Período */}
                  <div>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Período</p>
                    <div className="flex gap-1.5">
                      <PeriodoBtn active={periodo === "month"}   onClick={() => setPeriodo("month")}   label="Mes" />
                      <PeriodoBtn active={periodo === "quarter"} onClick={() => setPeriodo("quarter")} label="Trimestre" />
                      <PeriodoBtn active={periodo === "year"}    onClick={() => setPeriodo("year")}    label="Año" />
                    </div>
                  </div>

                  {/* Fechas */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Desde</p>
                      <DatePicker
                        value={fechaDesde}
                        onChange={(v) => setFechaDesde(typeof v === "string" ? v : String(v ?? ""))}
                      />
                    </div>
                    <div>
                      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Hasta</p>
                      <DatePicker
                        value={fechaHasta}
                        onChange={(v) => setFechaHasta(typeof v === "string" ? v : String(v ?? ""))}
                      />
                    </div>
                  </div>

                  {/* Validación visual */}
                  {!canSubmit && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" />
                      <span>
                        {scope !== "todos" && entityIds.length === 0
                          ? `Elegí ${entityKind === "asset" ? "un activo" : "un conductor"}.`
                          : scope === "uno" && entityIds.length !== 1
                          ? "Para 'Uno' exactamente 1."
                          : scope === "varios" && entityIds.length < 2
                          ? "Para 'Varios' al menos 2."
                          : "Revisá las fechas."}
                      </span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-5 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
            {step === 1 ? (
              <>
                <button
                  onClick={onClose}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => canGoStep2 && setStep(2)}
                  disabled={!canGoStep2}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-40"
                >
                  Siguiente <ArrowRight size={12} />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]"
                >
                  <ArrowLeft size={12} /> Atrás
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-40"
                >
                  <Check size={12} /> {widget ? "Guardar cambios" : "Crear widget"}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </>
  );
}

// ─── Botones auxiliares ────────────────────────────────────────────────────

function VizButton({ active, onClick, icon, label }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-4 text-sm font-bold transition ${
        active
          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300"
      }`}
    >
      {icon} {label}
    </button>
  );
}

function ChartTypeBtn({ active, onClick, icon, label, hint }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition ${
        active
          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200"
      }`}
    >
      <span className="flex items-center gap-1.5 text-xs font-bold">{icon} {label}</span>
      {hint && <span className="text-[10px] font-normal opacity-70">{hint}</span>}
    </button>
  );
}

function ScopeBtn({ active, onClick, label, hint }: {
  active: boolean; onClick: () => void; label: string; hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
        active
          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.07]"
      }`}
    >
      {label}
      <span className="text-[10px] font-normal opacity-70">{hint}</span>
      {active && <ChevronRight size={11} />}
    </button>
  );
}

function PeriodoBtn({ active, onClick, label }: {
  active: boolean; onClick: () => void; label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
        active
          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.07]"
      }`}
    >
      {label}
    </button>
  );
}