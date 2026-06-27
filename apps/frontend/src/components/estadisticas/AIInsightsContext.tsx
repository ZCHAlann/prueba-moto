"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  useAnalisisIA,
  type Modulo, type Periodo, type AnalisisIAResult, type ChartRef,
} from "../../hooks/useEstadisticas";

type ModuloVisual = { key: Modulo; label: string; color: string };

type Nota = {
  titulo: string;
  detalle: string;
  tags?: string[];
  recomendacion?: string;
  esAccionPrincipal: boolean;
  severidad?: "alta" | "media" | "baja";
};

type AIInsightsContextValue = {
  data: AnalisisIAResult | null;
  loading: boolean;
  error: string | null;
  regenerar: () => void;
  color: string;
  notaPara: (ref: ChartRef) => Nota | null;
};

export const AIInsightsContext = createContext<AIInsightsContextValue | null>(null);

export function useAIInsights() {
  const ctx = useContext(AIInsightsContext);
  if (!ctx) throw new Error("useAIInsights debe usarse dentro de <AIInsightsProvider>");
  return ctx;
}

type Props = {
  companyId: string;
  modulo: ModuloVisual;
  periodo: Periodo;
  fecha: string;
  fechaHasta: string;
  assetId: number | null;
  driverId: number | null;
  children: ReactNode;
};

export function AIInsightsProvider({
  companyId, modulo, periodo, fecha, fechaHasta, assetId, driverId, children,
}: Props) {
  const { data, loading, error, regenerar } = useAnalisisIA({
    companyId, modulo: modulo.key, periodo, fecha, fechaHasta, assetId, driverId,
    manual: false,
  });

  const notaPara = useMemo(() => {
    const map = new Map<ChartRef, Nota>();
    if (data?.insights) {
      const { accionPrincipal, hallazgosSecundarios } = data.insights;

      if (accionPrincipal?.chartRef) {
        map.set(accionPrincipal.chartRef as ChartRef, {
          titulo: accionPrincipal.titulo,
          detalle: accionPrincipal.justificacion,
          esAccionPrincipal: true,
          tags: [accionPrincipal.refAssetPlate, accionPrincipal.refDriverName].filter(Boolean) as string[],
        });
      }

      for (const h of hallazgosSecundarios) {
        const ref = (h.chartRef as ChartRef) ?? "general";
        if (!map.has(ref)) {
          map.set(ref, {
            titulo: h.titulo,
            detalle: h.detalle,
            esAccionPrincipal: false,
            severidad: h.severidad,
            tags: h.tags,
            recomendacion: h.recomendacion,
          });
        }
      }

      // Aviso en consola si el backend está mandando todo bajo el mismo ref
      // (señal de que el prompt aún no diferencia chartRef por hallazgo)
      const refsUsados = [
        accionPrincipal?.chartRef,
        ...hallazgosSecundarios.map(h => h.chartRef),
      ].filter(Boolean);
      const unicos = new Set(refsUsados);
      if (refsUsados.length > 1 && unicos.size === 1) {
        console.warn(
          "[AIInsights] Todos los hallazgos comparten el mismo chartRef:",
          [...unicos][0],
          "— revisar el prompt del backend."
        );
      }
    }
    return (ref: ChartRef) => map.get(ref) ?? null;
  }, [data]);

  return (
    <AIInsightsContext.Provider value={{ data, loading, error, regenerar, color: modulo.color, notaPara }}>
      {children}
    </AIInsightsContext.Provider>
  );
}
