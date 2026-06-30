// lib/stats-pdf-types.ts

import type { AIInsights } from "./ai-insights";

export type EstadisticasDataExport = {
  companyName: string;
  modulo: string;
  moduloLabel: string;
  periodo: string;
  fechaRef: string;
  fechaHasta: string;
  bucketActual: string;
  bucketAnterior: string;

  kpis: Array<{
    label: string;
    valor: number | string;
    unidad?: string;
    variacionPct?: number;
    icono?: string;
  }>;

  lineChart: {
    title: string;
    unidad: string;
    data: Array<{ x: string; y: number; proyectado?: boolean }>;
    regresion: { slope: number; r2: number };
  };
  barVChart: {
    title: string;
    unidad: string;
    data: Array<{ x: string; y: number }>;
  };
  barHChart: {
    title: string;
    unidad: string;
    data: Array<{ label: string; value: number; meta?: string }>;
  };
  radarChart: {
    title: string;
    data: Array<{ axis: string; value: number }>;
  };
  exponencialChart: {
    title: string;
    unidad: string;
    data: Array<{ x: string; y: number }>;
  };
  comparacionChart: {
    title: string;
    data: Array<{ label: string; actual: number; anterior: number }>;
  };

  anomalias: Array<{
    tipo: string;
    dimensionLabel: string;
    severidad: "alta" | "media" | "baja";
    descripcion: string;
    detectadoEn?: string;
  }>;

  /** Shape V2 — ver lib/ai-insights.ts. null si no hay análisis IA disponible. */
  insights: AIInsights | null;
  insightsMeta: { fromCache: boolean; model: string; latencyMs: number } | null;
};