// routes/company/stats/_empty.ts
// ─────────────────────────────────────────────────────────────────────
// Factory para calculators que aún no tienen implementación real.
// Devuelve un StatResult con shape correcto pero datos vacíos + un
// mensaje claro en la UI. Reemplazar por el calculator real cuando
// se implemente.
// ─────────────────────────────────────────────────────────────────────

import type { StatResult } from "./mantenimiento";

export function emptyResult(modulo: string): StatResult {
  return {
    kpis: [
      { label: `${modulo} — Total`,           valor: 0,        variacionPct: 0, icono: "info" },
      { label: `${modulo} — Período actual`,   valor: 0,        variacionPct: 0, icono: "calendar" },
      { label: `${modulo} — Período anterior`, valor: 0,        variacionPct: 0, icono: "calendar" },
      { label: `${modulo} — Variación`,        valor: "—",      variacionPct: 0, icono: "trending-up" },
    ],
    lineChart:        { title: "Serie por período",                unidad: "—", data: [],     regresion: { slope: 0, r2: 0 } },
    barVChart:        { title: "Distribución por dimensión",       unidad: "—", data: [] },
    barHChart:        { title: "Top elementos",                    unidad: "—", data: [] },
    radarChart:       { title: "Vista de radar",                    data: [] },
    exponencialChart: { title: "Últimos 30 días",                   unidad: "—", data: [] },
    comparacionChart: { title: "Actual vs anterior",               data: [] },
    anomalias:        [],
  };
}
