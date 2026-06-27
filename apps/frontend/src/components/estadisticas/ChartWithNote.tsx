"use client";

import type { ReactNode } from "react";
import { useAIInsights } from "./AIInsightsContext";
import { AIInsightNote } from "./AIInsightNote";
import type { ChartRef } from "../../hooks/useEstadisticas";

type Props = {
  chartRef: ChartRef;
  side?: boolean;
  children: ReactNode;
};

export function ChartWithNote({ chartRef, side = true, children, onClick }: Props & { onClick?: () => void }) {
  const { notaPara, color } = useAIInsights();
  const nota = notaPara(chartRef);

  if (!nota) {
    if (!onClick) return <>{children}</>;
    return <div onClick={onClick}>{children}</div>;
  }

  const noteEl = (
    <AIInsightNote
      titulo={nota.titulo}
      detalle={nota.detalle}
      tags={nota.tags}
      recomendacion={nota.recomendacion}
      esAccionPrincipal={nota.esAccionPrincipal}
      severidad={nota.severidad}
      color={color}
    />
  );

  if (!side) {
    return (
      <div className="space-y-2" onClick={onClick}>
        {children}
        {noteEl}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_180px] gap-3 items-start" onClick={onClick}>
      {children}
      <div className="hidden xl:block pt-4">{noteEl}</div>
      <div className="xl:hidden">{noteEl}</div>
    </div>
  );
}
