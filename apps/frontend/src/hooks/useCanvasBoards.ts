"use client";

// ─────────────────────────────────────────────────────────────────────────────
// hooks/useCanvasBoards.ts
//
// Hooks CRUD para el Lienzo de Presentación.
//
// - useCanvasBoards: lista (propios + compartidos de la empresa).
// - useCanvasBoard(boardId): detalle de un board (board + widgets).
// - createBoard / updateBoard / deleteBoard: mutaciones.
// - createWidget / updateWidget / deleteWidget: mutaciones de widgets.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type CanvasBoard = {
  id: string;
  companyId: string;
  ownerUserId: string | null;
  name: string;
  description: string | null;
  panelModules: string[];
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CanvasWidgetVizKind = "chart" | "table";
export type CanvasWidgetChartType =
  | "bar_h" | "bar_v" | "line" | "line_exponencial" | "pie" | "radar";
export type CanvasWidgetScope = "todos" | "uno" | "varios";
export type CanvasWidgetEntityKind = "asset" | "driver";
export type CanvasWidgetPeriodo = "month" | "quarter" | "year";
export type CanvasWidgetSourceField =
  | "lineChart" | "barVChart" | "barHChart" | "radarChart"
  | "exponencialChart" | "comparacionChart" | "kpis";

export type CanvasWidget = {
  id: string;
  boardId: string;
  companyId: string;
  modulo: string;
  vizKind: CanvasWidgetVizKind;
  chartType: CanvasWidgetChartType | null;
  scope: CanvasWidgetScope;
  entityKind: CanvasWidgetEntityKind | null;
  entityIds: number[];
  periodo: CanvasWidgetPeriodo;
  fechaDesde: string;
  fechaHasta: string;
  sourceField: CanvasWidgetSourceField;
  secondaryModulo: string | null;
  posX: number;
  posY: number;
  width: number;
  height: number;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function mapBoard(raw: Record<string, unknown>): CanvasBoard {
  return {
    id:           String(raw.id),
    companyId:    String(raw.companyId),
    ownerUserId:  raw.ownerUserId ? String(raw.ownerUserId) : null,
    name:         String(raw.name ?? ""),
    description:  strOrNull(raw.description),
    panelModules: Array.isArray(raw.panelModules) ? (raw.panelModules as string[]) : [],
    isShared:     raw.isShared === true,
    createdAt:    String(raw.createdAt ?? ""),
    updatedAt:    String(raw.updatedAt ?? ""),
  };
}

function mapWidget(raw: Record<string, unknown>): CanvasWidget {
  return {
    id:           String(raw.id),
    boardId:      String(raw.boardId),
    companyId:    String(raw.companyId),
    modulo:       String(raw.modulo),
    vizKind:      (raw.vizKind === "table" ? "table" : "chart") as CanvasWidgetVizKind,
    chartType:    raw.chartType ? (raw.chartType as CanvasWidgetChartType) : null,
    scope:        (raw.scope === "uno" || raw.scope === "varios" ? raw.scope : "todos") as CanvasWidgetScope,
    entityKind:   raw.entityKind ? (raw.entityKind as CanvasWidgetEntityKind) : null,
    entityIds:    Array.isArray(raw.entityIds) ? (raw.entityIds as number[]) : [],
    periodo:      (raw.periodo === "quarter" || raw.periodo === "year" ? raw.periodo : "month") as CanvasWidgetPeriodo,
    fechaDesde:   String(raw.fechaDesde ?? "").slice(0, 10),
    fechaHasta:   String(raw.fechaHasta ?? "").slice(0, 10),
    sourceField:  String(raw.sourceField ?? "lineChart") as CanvasWidgetSourceField,
    secondaryModulo: strOrNull(raw.secondaryModulo),
    posX:         num(raw.posX),
    posY:         num(raw.posY),
    width:        num(raw.width) || 420,
    height:       num(raw.height) || 300,
    title:        strOrNull(raw.title),
    createdAt:    String(raw.createdAt ?? ""),
    updatedAt:    String(raw.updatedAt ?? ""),
  };
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useCanvasBoards() {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [boards, setBoards] = useState<CanvasBoard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/canvas-boards`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const raw: Array<Record<string, unknown>> = Array.isArray(json) ? json : (json.data ?? []);
      setBoards(raw.map(mapBoard));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void fetchList(); }, [fetchList]);

  return { boards, loading, error, refetch: fetchList };
}

export type CanvasBoardDetail = {
  board: CanvasBoard;
  widgets: CanvasWidget[];
};

export function useCanvasBoard(boardId: string | null) {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [detail, setDetail]   = useState<CanvasBoardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!companyId || !boardId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/canvas-boards/${boardId}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setDetail({
        board:   mapBoard(json.board),
        widgets: Array.isArray(json.widgets) ? (json.widgets as Array<Record<string, unknown>>).map(mapWidget) : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [companyId, boardId]);

  useEffect(() => { void fetchDetail(); }, [fetchDetail]);

  return { detail, loading, error, refetch: fetchDetail };
}

// ─── Mutaciones ─────────────────────────────────────────────────────────────

export type CreateBoardInput = {
  name: string;
  description?: string;
  panelModules?: string[];
  isShared?: boolean;
};

export type UpdateBoardInput = Partial<CreateBoardInput>;

export async function createBoard(
  companyId: string,
  input: CreateBoardInput,
): Promise<CanvasBoard> {
  const res = await fetch(`/api/company/${companyId}/canvas-boards`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return mapBoard(await res.json());
}

export async function updateBoard(
  companyId: string,
  boardId: string,
  input: UpdateBoardInput,
): Promise<CanvasBoard> {
  const numericId = parseInt(boardId.replace(/\D/g, ""), 10);
  const res = await fetch(`/api/company/${companyId}/canvas-boards/canvas-board-${numericId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return mapBoard(await res.json());
}

export async function deleteBoard(companyId: string, boardId: string): Promise<void> {
  const numericId = parseInt(boardId.replace(/\D/g, ""), 10);
  const res = await fetch(`/api/company/${companyId}/canvas-boards/canvas-board-${numericId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
}

// ─── Widget mutations ──────────────────────────────────────────────────────

export type CreateWidgetInput = {
  modulo?:     string;
  vizKind?:    "chart" | "table";
  chartType?:  CanvasWidgetChartType | null;
  scope?:      CanvasWidgetScope;
  entityKind?: CanvasWidgetEntityKind | null;
  entityIds?:  number[];
  periodo?:    CanvasWidgetPeriodo;
  fechaDesde?: string;
  fechaHasta?: string;
  title?:      string | null;
  sourceField?: CanvasWidgetSourceField;
  secondaryModulo?: string | null;
};


export type UpdateWidgetGeometryInput = {
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  title?: string | null;
  sourceField?: CanvasWidgetSourceField;
};

/**
 * Update completo de un widget: además de geometría permite cambiar módulo,
 * vizKind, chartType, scope, entityKind, entityIds, periodo, fechas y título.
 *
 * Todos los campos son opcionales; sólo se aplican los que llegan.
 */
export type UpdateWidgetInput = {
  // Geometría
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  // Configuración completa
  modulo?:     string;
  vizKind?:    "chart" | "table";
  chartType?:  CanvasWidgetChartType | null;
  scope?:      CanvasWidgetScope;
  entityKind?: CanvasWidgetEntityKind | null;
  entityIds?:  number[];
  periodo?:    CanvasWidgetPeriodo;
  fechaDesde?: string;
  fechaHasta?: string;
  title?:      string | null;
  sourceField?: CanvasWidgetSourceField;
  secondaryModulo?: string | null;
};

export async function createWidget(
  companyId: string,
  boardId: string,
  input: CreateWidgetInput,
): Promise<CanvasWidget> {
  const numericBoardId = parseInt(boardId.replace(/\D/g, ""), 10);
  const res = await fetch(`/api/company/${companyId}/canvas-boards/canvas-board-${numericBoardId}/widgets`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return mapWidget(await res.json());
}

export async function updateWidget(
  companyId: string,
  boardId: string,
  widgetId: string,
  input: UpdateWidgetGeometryInput | UpdateWidgetInput,
): Promise<CanvasWidget> {
  const numericBoardId = parseInt(boardId.replace(/\D/g, ""), 10);
  const numericWidgetId = parseInt(widgetId.replace(/\D/g, ""), 10);
  const res = await fetch(`/api/company/${companyId}/canvas-boards/canvas-board-${numericBoardId}/widgets/canvas-widget-${numericWidgetId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return mapWidget(await res.json());
}

export async function deleteWidget(
  companyId: string,
  boardId: string,
  widgetId: string,
): Promise<void> {
  const numericBoardId = parseInt(boardId.replace(/\D/g, ""), 10);
  const numericWidgetId = parseInt(widgetId.replace(/\D/g, ""), 10);
  const res = await fetch(`/api/company/${companyId}/canvas-boards/canvas-board-${numericBoardId}/widgets/canvas-widget-${numericWidgetId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
}

// ─── Rows específicas del módulo (para TABLAS) ───────────────────────────

export type CanvasRowsColumn = {
  key: string;
  label: string;
  type: "string" | "number" | "currency" | "date";
};

export type CanvasRowsPayload = {
  modulo:   string;
  widgetId: string;
  columns:  CanvasRowsColumn[];
  rows:     Array<Record<string, string | number | null>>;
  warning:  string | null;
};

export type UseCanvasWidgetRowsResult = {
  data:    CanvasRowsPayload | null;
  loading: boolean;
  error:   string | null;
  refetch: () => void;
};

/**
 * Hook que carga las filas específicas del módulo del widget (Combustible,
 * Mantenimiento, Conductores, etc.) para alimentar la tabla del lienzo.
 *
 * Antes se usaba el payload agregado del calculator; ahora se devuelven
 * los mismos registros que el usuario ve en la lista del módulo, con
 * columnas legibles y tipos para formateo correcto.
 */
export function useCanvasWidgetRows(
  companyId: string | null,
  boardId: string | null,
  widgetId: string | null,
): UseCanvasWidgetRowsResult {
  const [data, setData]       = useState<CanvasRowsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [tick, setTick]       = useState(0);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!companyId || !boardId || !widgetId) {
      setData(null);
      setLoading(false);
      return;
    }
    const numericBoardId  = parseInt(boardId.replace(/\D/g, ""), 10);
    const numericWidgetId = parseInt(widgetId.replace(/\D/g, ""), 10);
    if (!Number.isFinite(numericBoardId) || !Number.isFinite(numericWidgetId)) {
      setError("ID de widget/board inválido.");
      return;
    }

    setLoading(true);
    setError(null);

    fetch(
      `/api/company/${companyId}/canvas-boards/canvas-board-${numericBoardId}/widgets/canvas-widget-${numericWidgetId}/rows`,
      { credentials: "include", cache: "no-store" },
    )
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then((body: CanvasRowsPayload) => setData(body))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Error cargando filas"),
      )
      .finally(() => setLoading(false));
  }, [companyId, boardId, widgetId, tick]);

  return { data, loading, error, refetch };
}

// ─── Datos COMBINADOS de dos módulos (para charts con secondaryModulo) ────

export type CombinedSeries = {
  modulo: string;
  label:  string;
  unidad: string;
  color:  string;
  data:   Array<{ entityId: number; value: number }>;
};

export type CombinedWidgetPayload = {
  modulo:    string;
  widgetId:  string;
  entities:  Array<{ id: number; label: string; sublabel: string | null }>;
  series:    CombinedSeries[];
  totals:    Array<{ entityId: number; value: number }>;
  primary:   string;
  secondary: string;
};

export type UseCombinedWidgetDataResult = {
  data:    CombinedWidgetPayload | null;
  loading: boolean;
  error:   string | null;
};

/**
 * Hook para widgets con `secondaryModulo` set. Devuelve dos series
 * paralelas agregadas por entidad, una por módulo.
 */
export function useCombinedWidgetData(
  companyId: string | null,
  boardId: string | null,
  widgetId: string | null,
  hasSecondary: boolean,
): UseCombinedWidgetDataResult {
  const [data, setData]       = useState<CombinedWidgetPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!hasSecondary || !companyId || !boardId || !widgetId) {
      setData(null);
      setLoading(false);
      return;
    }
    const numericBoardId  = parseInt(boardId.replace(/\D/g, ""), 10);
    const numericWidgetId = parseInt(widgetId.replace(/\D/g, ""), 10);
    if (!Number.isFinite(numericBoardId) || !Number.isFinite(numericWidgetId)) {
      setError("ID de widget/board inválido.");
      return;
    }

    setLoading(true);
    setError(null);

    fetch(
      `/api/company/${companyId}/canvas-boards/canvas-board-${numericBoardId}/widgets/canvas-widget-${numericWidgetId}/combined-data`,
      { credentials: "include", cache: "no-store" },
    )
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then((body: CombinedWidgetPayload) => setData(body))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Error cargando datos combinados"),
      )
      .finally(() => setLoading(false));
  }, [companyId, boardId, widgetId, hasSecondary]);

  return { data, loading, error };
}