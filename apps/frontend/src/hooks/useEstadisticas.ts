// hooks/useEstadisticas.ts
// ─────────────────────────────────────────────────────────────────────
// Hook para consumir el submódulo "reportes > estadisticas" del backend.
// Devuelve: 4 KPIs + 6 shapes de chart + anomalías detectadas.
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";

export type Periodo = "month" | "quarter" | "year";
export type Modulo  =
  | "mantenimiento"
  | "combustible"
  | "flotas"
  | "conductores"
  | "checklists"
  | "alertas"
  | "inventario"
  | "ac"
  | "seguros"
  | "peajes"
  | "asignaciones";

export type KpiItem = {
  label: string;
  valor: number | string;
  unidad?: string;
  variacionPct?: number;
  icono?: string;
};

export type LinePoint   = { x: string; y: number; proyectado?: boolean };
export type BarPoint    = { x: string; y: number };
export type BarHPoint   = { label: string; value: number; meta?: string };
export type RadarPoint  = { axis: string; value: number };
export type BarCompItem = { label: string; actual: number; anterior: number };

export type AnomaliaItem = {
  id?: number;
  tipo: string;
  dimension: string;
  dimensionLabel: string;
  severidad: "baja" | "media" | "alta";
  descripcion: string;
  detectadoEn?: string;
};

// ─── Salud de flota (Fase 5) ────────────────────────────────────

export type TcoBreakdownLite = {
  combustible:   number;
  mantenimiento: number;
  peajes:        number;
  seguros:       number;
  total:         number;
  kmRecorridos:  number;
  costoPorKm:    number;
  costoPorMes:   number;
};

export type TcoItem = {
  assetId: number;
  plate:   string | null;
  name:    string;
  tco:     TcoBreakdownLite;
};

export type ScorecardComponent = {
  key:     "edad" | "mantenimiento" | "combustible" | "alertas" | "estado";
  label:   string;
  score:   number;
  detalle: string;
};

export type ScorecardItem = {
  assetId:        number;
  plate:          string | null;
  name:           string;
  score:          number;
  riskLevel:      "saludable" | "atencion" | "riesgo" | "critico";
  recomendacion:  string;
  componentes:    ScorecardComponent[];
};

export type SaludFlota = {
  tco:           TcoItem[];
  scorecard:     ScorecardItem[];
  fleetAvgScore: number;
  topRiesgo:     ScorecardItem[];
  topTco:        TcoItem[];
};

export type EstadisticasData = {
  modulo: Modulo;
  periodo: Periodo;
  fechaRef: string;
  fechaHasta: string;
  bucketActual: string;
  bucketAnterior: string;
  kpis: KpiItem[];
  lineChart:        { title: string; unidad: string; data: LinePoint[];  regresion: { slope: number; r2: number } };
  barVChart:        { title: string; unidad: string; data: BarPoint[] };
  barHChart:        { title: string; unidad: string; data: BarHPoint[] };
  radarChart:       { title: string; data: RadarPoint[] };
  exponencialChart: { title: string; unidad: string; data: LinePoint[] };
  comparacionChart: { title: string; data: BarCompItem[] };
  anomalias:        AnomaliaItem[];
  salud?:           SaludFlota;
};

export type AnomaliasResponse = {
  modulo: Modulo;
  anomalias: AnomaliaItem[];
};

export type UseEstadisticasParams = {
  companyId: string | null;
  modulo: Modulo;
  periodo?: Periodo;
  fecha?: string;
  fechaHasta?: string;
  assetId?: number | null;
  driverId?: number | null;
  enabled?: boolean;
};

export function useEstadisticas(params: UseEstadisticasParams) {
  const { companyId, modulo, periodo = "month", fecha, fechaHasta, assetId, driverId, enabled = true } = params;
  const [data, setData]       = useState<EstadisticasData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!companyId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("periodo", periodo);
      if (fecha)       qs.set("fecha", fecha);
      if (fechaHasta)  qs.set("fechaHasta", fechaHasta);
      if (assetId)     qs.set("assetId", String(assetId));
      if (driverId)    qs.set("driverId", String(driverId));

      const res = await fetch(
        `/api/company/${companyId}/estadisticas/${modulo}?${qs.toString()}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status} — ${txt.slice(0, 200)}`);
      }
      const json = (await res.json()) as EstadisticasData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [companyId, modulo, periodo, fecha, fechaHasta, assetId, driverId, enabled]);

  useEffect(() => { void fetch_(); }, [fetch_]);

  return { data, loading, error, refetch: fetch_ };
}

export function useAnomalias(
  companyId: string | null,
  modulo: Modulo | null,
  options: { incluirResueltas?: boolean; limite?: number } = {},
) {
  const { incluirResueltas = false, limite = 100 } = options;
  const [data, setData]       = useState<AnomaliaItem[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const refetch = () => setRefreshTick((t) => t + 1);

  useEffect(() => {
    if (!companyId || !modulo) {
      setData([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    const qs = new URLSearchParams();
    if (incluirResueltas) qs.set("incluirResueltas", "true");
    if (limite)           qs.set("limite", String(limite));
    fetch(
      `/api/company/${companyId}/estadisticas/${modulo}/anomalias?${qs.toString()}`,
      { credentials: "include" }
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: AnomaliasResponse & { total?: number }) => {
        setData(j.anomalias ?? []);
        setTotal(j.total ?? (j.anomalias?.length ?? 0));
      })
      .catch(() => {
        setData([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [companyId, modulo, incluirResueltas, limite, refreshTick]);

  return { data, total, loading, refetch };
}

/**
 * Hook para forzar la redetección de anomalías.
 * Útil para el botón "Refrescar" del tab Historial.
 */
export function useRedetectarAnomalias(companyId: string | null) {
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<{ inserted: number; updated: number; resolved: number } | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const redetectar = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/estadisticas/redetectar`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setResult({
        inserted: json.inserted ?? 0,
        updated:  json.updated  ?? 0,
        resolved: json.resolved ?? 0,
      });
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { redetectar, loading, result, error };
}

// ─── Análisis IA ─────────────────────────────────────────────────

export type AIInsights = {
  resumenEjecutivo: string;
  puntosClave: string[];
  recomendaciones: Array<{ titulo: string; accion: string; prioridad: "alta" | "media" | "baja" }>;
  alertas: Array<{ titulo: string; detalle: string; severidad: "alta" | "media" | "baja" }>;
};

export type AnalisisIAResult = {
  modulo: Modulo;
  periodo: Periodo;
  fechaRef: string;
  fechaHasta: string;
  fromCache: boolean;
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  insights: AIInsights;
};

export type UseAnalisisIAParams = {
  companyId: string | null;
  modulo: Modulo;
  periodo?: Periodo;
  fecha?: string;
  fechaHasta?: string;
  assetId?: number | null;
  driverId?: number | null;
  /** Si true, no auto-dispara al montar. El usuario debe click "Analizar". */
  manual?: boolean;
};

export function useAnalisisIA(params: UseAnalisisIAParams) {
  const { companyId, modulo, periodo = "month", fecha, fechaHasta, assetId, driverId, manual = false } = params;
  const [data, setData]         = useState<AnalisisIAResult | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [forzar, setForzar]     = useState(false);

  const ejecutar = useCallback(async (opts: { forzarRegenerar?: boolean } = {}) => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/estadisticas/${modulo}/analisis-ia`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodo,
          fecha,
          fechaHasta,
          assetId,
          driverId,
          forzarRegenerar: opts.forzarRegenerar ?? forzar,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status} — ${txt.slice(0, 200)}`);
      }
      const json = (await res.json()) as AnalisisIAResult;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [companyId, modulo, periodo, fecha, fechaHasta, assetId, driverId, forzar]);

  // Auto-disparar al montar (a menos que sea manual)
  useEffect(() => {
    if (manual) return;
    void ejecutar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual, modulo, fecha, fechaHasta, assetId, driverId, periodo]);

  return {
    data,
    loading,
    error,
    ejecutar,
    regenerar: () => {
      setForzar(true);
      void ejecutar({ forzarRegenerar: true });
    },
  };
}

// ─── Multi-rango ──────────────────────────────────────────────

export type MultiRango = {
  id:    string;
  label: string;
  desde: string;
  hasta: string;
};

export type MultiKpi = {
  label:    string;
  icono?:   string;
  porRango: Record<string, { valor: number | string; unidad?: string; variacionPct?: number }>;
};

export type MultiLinePoint = { x: string } & Record<string, number | null | undefined>;

export type MultiBarH = { label: string } & Record<string, number | string | undefined>;

export type MultiAnomalia = {
  rangoId:        string;
  id?:            number;
  tipo:           string;
  dimension:      string;
  dimensionLabel: string;
  severidad:      "baja" | "media" | "alta";
  descripcion:    string;
  detectadoEn?:   string;
};

export type EstadisticasMultiData = {
  modulo:  Modulo;
  periodo: Periodo;
  rangos:  MultiRango[];
  kpis:    MultiKpi[];
  lineChart:        { title: string; unidad: string; data: MultiLinePoint[]; regresion: number | null };
  barVChart:        { title: string; unidad: string; data: Array<{ x: string } & Record<string, number>> };
  barHChart:        { title: string; unidad: string; data: MultiBarH[] };
  comparacionChart: { title: string; data: Array<{ label: string } & Record<string, number | string>> };
  anomalias:        MultiAnomalia[];
  warnings:         string[];
};

export type UseEstadisticasMultiParams = {
  companyId: string | null;
  modulo: Modulo;
  rangos: MultiRango[];
  periodo?: Periodo;
  assetId?: number | null;
  driverId?: number | null;
  enabled?: boolean;
};

export function useEstadisticasMulti(params: UseEstadisticasMultiParams) {
  const { companyId, modulo, rangos, periodo = "month", assetId, driverId, enabled = true } = params;
  const [data, setData]       = useState<EstadisticasMultiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const rangosKey = JSON.stringify(rangos);

  const fetch_ = useCallback(async () => {
    if (!companyId || !enabled || rangos.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("periodo", periodo);
      rangos.forEach((r) => qs.append("rangos", `${r.desde}..${r.hasta}`));
      if (assetId)  qs.set("assetId",  String(assetId));
      if (driverId) qs.set("driverId", String(driverId));
      const res = await fetch(
        `/api/company/${companyId}/estadisticas/${modulo}/multi?${qs.toString()}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status} — ${txt.slice(0, 200)}`);
      }
      const json = (await res.json()) as EstadisticasMultiData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, modulo, periodo, assetId, driverId, rangosKey, enabled]);

  useEffect(() => { void fetch_(); }, [fetch_]);

  return { data, loading, error, refetch: fetch_ };
}

// ─── Exportar PDF ────────────────────────────────────────────────

export type ExportarPDFParams = {
  companyId: string;
  modulo: Modulo;
  periodo: Periodo;
  fecha: string;
  fechaHasta: string;
  assetId?: number | null;
  driverId?: number | null;
};

export function useExportarPDF() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [ultimoArchivo, setUltimoArchivo] = useState<string | null>(null);

  const exportar = useCallback(async (params: ExportarPDFParams) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/company/${params.companyId}/estadisticas/${params.modulo}/exportar-pdf`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodo:    params.periodo,
            fecha:      params.fecha,
            fechaHasta: params.fechaHasta,
            assetId:    params.assetId,
            driverId:   params.driverId,
          }),
        }
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status} — ${txt.slice(0, 200)}`);
      }
      // Extraer filename del header
      const dispo = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(dispo);
      const filename = match?.[1] ?? `estadisticas-${params.modulo}.pdf`;

      // Disparar descarga en el navegador
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setUltimoArchivo(filename);
      return filename;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar PDF");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { exportar, loading, error, ultimoArchivo };
}
