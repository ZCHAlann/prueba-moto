"use client";

// ─────────────────────────────────────────────────────────────────────────────
// pages/Reports/components/CanvasWidgetRenderer.tsx
//
// Decide qué hook llamar para un widget del canvas según su scope + chartType,
// y renderiza el chart apropiado desde components/estadisticas/charts.tsx.
//
// Para scope='todos'/'uno' usa useEstadisticas (single entity).
// Para scope='varios' usa useEstadisticasMultiEntity (multi entity).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import {
  useEstadisticas,
  useEstadisticasMultiEntity,
  type MultiEntityDataFE,
  type EntityRefFE,
} from "../../../hooks/useEstadisticas";
import type { CanvasWidget } from "../../../hooks/useCanvasBoards";
import { useCombinedWidgetData, type CombinedSeries } from "../../../hooks/useCanvasBoards";
import {
  CHART_PALETTE,
  AreaTendencia, BarVertical, BarHorizontal, RadarC, Donut,
  BarVerticalMulti, BarHorizontalMulti, LineMulti, RadarMulti,
  ChartEmpty,
} from "../../../components/estadisticas/charts";
import { useAuth } from "../../../context/AuthContext";
import { CanvasDataTable } from "./CanvasDataTable";
import { useParams } from "react-router";

type Modulo = CanvasWidget["modulo"];

/** Título legible default para el widget. */
function defaultTitle(w: CanvasWidget): string {
  if (w.title) return w.title;
  return `${w.modulo} · ${chartTypeLabel(w.chartType)}`;
}

/** Etiqueta del chart según chartType (para mostrar en el header). */
function chartTypeLabel(t: CanvasWidget["chartType"]): string {
  switch (t) {
    case "bar_h":             return "Barras horizontales";
    case "bar_v":             return "Barras verticales";
    case "line":              return "Línea";
    case "line_exponencial":  return "Línea exponencial";
    case "pie":               return "Pastel";
    case "radar":             return "Radar";
    default:                  return "Tabla";
  }
}

export function CanvasWidgetRenderer({ widget }: { widget: CanvasWidget }) {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;
  const params = useParams();
  const boardId = (params as Record<string, string | undefined>).boardId ?? null;

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-3 py-1.5 dark:border-white/[0.06]">
        <p className="truncate text-[11px] font-bold text-gray-700 dark:text-gray-200">
          {defaultTitle(widget)}
        </p>
        <span className="flex shrink-0 items-center gap-1">
          {widget.secondaryModulo && widget.vizKind === "chart" && (
            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
              + {widget.secondaryModulo}
            </span>
          )}
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
            {widget.scope === "todos" ? "Flota completa" : widget.scope === "uno" ? "1 entidad" : `${widget.entityIds.length} entidades`}
          </span>
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden p-2">
        {/* Si tiene secondaryModulo Y es chart, ruteamos al body combinado */}
        {widget.vizKind === "chart" && widget.secondaryModulo
          ? <CombinedBody widget={widget} companyId={companyId} boardId={boardId} />
          : widget.scope === "varios"
            ? <MultiBody widget={widget} companyId={companyId} boardId={boardId} />
            : <SingleBody widget={widget} companyId={companyId} boardId={boardId} />}
      </div>
    </div>
  );
}

// ─── Combined body (dos módulos side-by-side) ──────────────────────────────

function CombinedBody({
  widget,
  companyId,
  boardId,
}: {
  widget: CanvasWidget;
  companyId: string | null;
  boardId: string | null;
}) {
  const { data, loading, error } = useCombinedWidgetData(
    companyId, boardId, widget.id, !!widget.secondaryModulo,
  );

  if (loading) return <CenterMsg icon={<Loader2 className="animate-spin" size={20} />} label="Cargando…" />;
  if (error)   return <CenterMsg icon={<AlertCircle size={20} />} label={error} tone="rose" />;
  if (!data)   return <CenterMsg icon={<AlertCircle size={20} />} label="Sin datos" tone="muted" />;
  if (!data.entities.length) {
    return <CenterMsg label="No hay entidades para comparar en este rango." tone="muted" />;
  }

  // Mapeamos al shape de BarVerticalMulti: cada entidad es una "categoría" X.
  // Top N = primeras 12 entidades para que el chart no se sature.
  const TOP = 12;
  const entitiesTop = data.entities.slice(0, TOP);
  const seriesForChart = data.series.map((s) => ({
    name: s.label,
    color: s.color,
    data: entitiesTop.map((e, i) => {
      const found = s.data.find((d) => d.entityId === e.id);
      return { x: truncateLabel(e.label), y: found?.value ?? 0 };
    }),
  }));

  const title = widget.title ?? `${data.primary} vs ${data.secondary}`;
  return (
    <div className="flex h-full w-full flex-col gap-1">
      <p className="shrink-0 truncate text-[10px] font-semibold text-gray-500 dark:text-gray-400">
        {title} · top {entitiesTop.length} de {data.entities.length}
      </p>
      <div className="flex-1 min-h-0">
        <BarVerticalMulti series={seriesForChart} />
      </div>
    </div>
  );
}

function truncateLabel(s: string): string {
  return s.length > 14 ? s.slice(0, 13) + "…" : s;
}

// ─── Single entity ─────────────────────────────────────────────────────────

function SingleBody({
  widget,
  companyId,
  boardId,
}: {
  widget: CanvasWidget;
  companyId: string | null;
  boardId: string | null;
}) {
  const assetId  = widget.scope === "uno" && widget.entityKind === "asset"  ? widget.entityIds[0] ?? null : null;
  const driverId = widget.scope === "uno" && widget.entityKind === "driver" ? widget.entityIds[0] ?? null : null;

  // Para tablas NO usamos el calculator agregado: las filas reales vienen
  // del endpoint /widgets/:id/rows. Solo cargamos las estadísticas si vamos
  // a dibujar un chart.
  const isChart = widget.vizKind === "chart";

  const { data, loading, error } = useEstadisticas({
    companyId,
    modulo:      widget.modulo as Modulo,
    periodo:     widget.periodo,
    fecha:       widget.fechaDesde,
    fechaHasta:  widget.fechaHasta,
    assetId:     assetId ?? undefined,
    driverId:    driverId ?? undefined,
    enabled:     isChart,
  });

  if (widget.vizKind === "table") {
    return <CanvasDataTable companyId={companyId} boardId={boardId} widgetId={widget.id} />;
  }

  if (loading) return <CenterMsg icon={<Loader2 className="animate-spin" size={20} />} label="Cargando…" />;
  if (error)   return <CenterMsg icon={<AlertCircle size={20} />} label={error} tone="rose" />;
  if (!data)   return <CenterMsg icon={<AlertCircle size={20} />} label="Sin datos" tone="muted" />;

  const color = CHART_PALETTE.blue;
  switch (widget.chartType) {
    case "bar_h":
      return <BarHorizontal data={data.barHChart.data} color={color} unidad={data.barHChart.unidad} />;
    case "bar_v":
      return <BarVertical data={data.barVChart.data} color={color} />;
    case "line":
      return <AreaTendencia data={data.lineChart.data} color={color} unidad={data.lineChart.unidad} />;
    case "line_exponencial":
      return <AreaTendencia data={data.exponencialChart.data} color={color} unidad={data.exponencialChart.unidad} />;
    case "pie":
      return <Donut data={data.barVChart.data} color={color} />;
    case "radar":
      return <RadarC data={data.radarChart.data} color={color} />;
    default:
      return <ChartEmpty label="Tipo de chart no soportado" />;
  }
}

// ─── Multi entity ──────────────────────────────────────────────────────────

function MultiBody({
  widget,
  companyId,
  boardId,
}: {
  widget: CanvasWidget;
  companyId: string | null;
  boardId: string | null;
}) {
  const isChart = widget.vizKind === "chart";

  const { data, loading, error } = useEstadisticasMultiEntity({
    companyId,
    modulo:    widget.modulo as Modulo,
    entityKind: widget.entityKind ?? "asset",
    entityIds: widget.entityIds,
    periodo:   widget.periodo,
    desde:     widget.fechaDesde,
    hasta:     widget.fechaHasta,
    enabled:   isChart,
  });

  if (widget.vizKind === "table") {
    return <CanvasDataTable companyId={companyId} boardId={boardId} widgetId={widget.id} />;
  }

  if (loading) return <CenterMsg icon={<Loader2 className="animate-spin" size={20} />} label="Cargando…" />;
  if (error)   return <CenterMsg icon={<AlertCircle size={20} />} label={error} tone="rose" />;
  if (!data)   return <CenterMsg icon={<AlertCircle size={20} />} label="Sin datos" tone="muted" />;

  switch (widget.chartType) {
    case "bar_h":
      return <BarHorizontalMulti items={data.barHChart.data} title={data.barHChart.title} />;
    case "bar_v":
      return <BarVerticalMulti series={buildSeries(data)} title={data.barVChart.title} />;
    case "line":
      return <LineMulti series={buildSeries(data)} mode="area" unidad={data.lineChart.unidad} />;
    case "line_exponencial":
      return <LineMulti series={buildSeries(data)} mode="area" unidad={data.exponencialChart.unidad} />;
    case "pie":
      return <ChartEmpty label="Pastel no soportado con varias entidades" />;
    case "radar":
      return <RadarMulti series={data.radarChart.series} />;
    default:
      return <ChartEmpty label="Tipo de chart no soportado" />;
  }
}

/** Construye las series para LineMulti/BarVerticalMulti a partir del payload. */
function buildSeries(
  data: MultiEntityDataFE,
): Array<{ name: string; color: string; data: Array<{ x: string; y: number }> }> {
  const buckets = data.lineChart.data.map((row) => row.x);
  return data.entidades.map((ent: EntityRefFE) => ({
    name: ent.label,
    color: ent.color,
    data: buckets.map((bucket, i) => {
      const val = data.lineChart.data[i]?.[String(ent.id)];
      return { x: bucket, y: typeof val === "number" ? val : 0 };
    }),
  }));
}

// ─── UI helpers ────────────────────────────────────────────────────────────

function CenterMsg({ icon, label, tone }: {
  icon: React.ReactNode; label: string;
  tone?: "muted" | "rose";
}) {
  const toneCls = tone === "rose"
    ? "text-rose-500 dark:text-rose-400"
    : "text-gray-300 dark:text-gray-600";
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2">
      <span className={toneCls}>{icon}</span>
      <p className="text-[12px] font-medium text-gray-400 dark:text-gray-500 text-center px-4 max-w-[240px]">{label}</p>
    </div>
  );
}