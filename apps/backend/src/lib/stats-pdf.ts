// lib/stats-pdf.ts
// ─────────────────────────────────────────────────────────────────────
// Generador de PDF para el submódulo "reportes > estadisticas".
//
// Contenido del PDF (una página por sección):
//   1. Header (título, módulo, período, rango, fecha de generación)
//   2. Análisis IA (si existe en cache): resumen ejecutivo + puntos clave
//      + recomendaciones + alertas
//   3. KPIs (4 tarjetas como tabla)
//   4. Series temporales (tabla con los buckets)
//   5. Distribuciones (top N como tabla)
//   6. Anomalías activas (tabla)
//
// Usamos jsPDF (ya en node_modules) sin dependencias extra.
// ─────────────────────────────────────────────────────────────────────

import { jsPDF } from "jspdf";
import type { AIInsights } from "./ai-insights";
import type { EstadisticasDataExport } from "./stats-pdf-types";

const COLOR_TEXT: [number, number, number]   = [31, 41, 55];   // gray-800
const COLOR_MUTED: [number, number, number]  = [107, 114, 128]; // gray-500
const COLOR_HEAD:  [number, number, number]  = [17, 24, 39];   // gray-900
const COLOR_RULE:  [number, number, number]  = [229, 231, 235]; // gray-200
const COLOR_ALTA:  [number, number, number]  = [225, 29, 72];  // rose-600
const COLOR_MEDIA: [number, number, number]  = [217, 119, 6];  // amber-600
const COLOR_BAJA:  [number, number, number]  = [37, 99, 235];  // blue-600

export type PDFExportInput = {
  companyName: string;
  modulo: string;
  moduloLabel: string;
  periodo: string;
  fechaRef: string;
  fechaHasta: string;
  bucketActual: string;
  bucketAnterior: string;
  kpis: Array<{ label: string; valor: number | string; unidad?: string; variacionPct?: number; icono?: string }>;
  lineChart:        { title: string; unidad: string; data: Array<{ x: string; y: number; proyectado?: boolean }>; regresion: { slope: number; r2: number } };
  barVChart:        { title: string; unidad: string; data: Array<{ x: string; y: number }> };
  barHChart:        { title: string; unidad: string; data: Array<{ label: string; value: number; meta?: string }> };
  radarChart:       { title: string; data: Array<{ axis: string; value: number }> };
  exponencialChart: { title: string; unidad: string; data: Array<{ x: string; y: number }> };
  comparacionChart: { title: string; data: Array<{ label: string; actual: number; anterior: number }> };
  anomalias: Array<{ tipo: string; dimensionLabel: string; severidad: "alta" | "media" | "baja"; descripcion: string; detectadoEn?: string }>;
  insights: AIInsights | null;
  insightsMeta: { fromCache: boolean; model: string; latencyMs: number } | null;
};

export function buildStatsPDF(input: PDFExportInput): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14; // margin
  let y = M;

  // ─── Helpers ──────────────────────────────────────────────
  function setText(color: [number, number, number], size = 10, bold = false) {
    doc.setTextColor(color[0], color[1], color[2]);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
  }
  function rule(yy: number) {
    doc.setDrawColor(COLOR_RULE[0], COLOR_RULE[1], COLOR_RULE[2]);
    doc.setLineWidth(0.2);
    doc.line(M, yy, W - M, yy);
  }
  function ensureSpace(needed: number) {
    if (y + needed > H - M) {
      doc.addPage();
      y = M;
    }
  }
  function heading(text: string, size = 13) {
    ensureSpace(12);
    setText(COLOR_HEAD, size, true);
    doc.text(text, M, y);
    y += size * 0.5;
    rule(y);
    y += 4;
  }
  function paragraph(text: string, color: [number, number, number] = COLOR_TEXT) {
    setText(color, 10);
    const lines = doc.splitTextToSize(text, W - M * 2);
    ensureSpace(lines.length * 5);
    doc.text(lines, M, y);
    y += lines.length * 5 + 1;
  }
  function table(headers: string[], rows: Array<Array<string | number>>, colWidths: number[]) {
    const rowH = 6;
    const totalW = colWidths.reduce((a, b) => a + b, 0);
    ensureSpace((rows.length + 1) * rowH + 4);

    // Header
    setText([255, 255, 255], 9, true);
    doc.setFillColor(COLOR_HEAD[0], COLOR_HEAD[1], COLOR_HEAD[2]);
    doc.rect(M, y - 4, totalW, rowH, "F");
    let x = M + 1.5;
    headers.forEach((h, i) => {
      doc.text(h, x, y);
      x += colWidths[i];
    });
    y += rowH - 1;

    // Rows
    rows.forEach((row, idx) => {
      if (idx % 2 === 0) {
        doc.setFillColor(249, 250, 251);
        doc.rect(M, y - 4, totalW, rowH, "F");
      }
      setText(COLOR_TEXT, 9);
      x = M + 1.5;
      row.forEach((cell, i) => {
        const s = String(cell);
        const maxW = colWidths[i] - 3;
        const truncated = doc.splitTextToSize(s, maxW);
        doc.text(truncated[0] ?? "", x, y);
        x += colWidths[i];
      });
      y += rowH - 1;
    });
    y += 3;
  }

  // ─── Header ───────────────────────────────────────────────
  setText([255, 255, 255], 16, true);
  doc.setFillColor(COLOR_HEAD[0], COLOR_HEAD[1], COLOR_HEAD[2]);
  doc.rect(0, 0, W, 26, "F");
  doc.text("Reporte de Estadísticas", M, 12);
  setText([200, 210, 220], 9);
  doc.text(`${input.companyName} · ${input.moduloLabel}`, M, 19);
  setText([180, 190, 200], 8);
  doc.text(`Período: ${input.periodo} (${input.bucketActual})  ·  Rango: ${input.fechaRef} → ${input.fechaHasta}`, M, 23);
  y = 34;

  setText(COLOR_MUTED, 8);
  doc.text(`Generado: ${new Date().toLocaleString("es-EC")}`, W - M, 23, { align: "right" });

  // ─── Análisis IA ──────────────────────────────────────────
  if (input.insights) {
    heading("Análisis IA");
    if (input.insightsMeta) {
      setText(COLOR_MUTED, 8);
      doc.text(
        `${input.insightsMeta.fromCache ? "Desde caché" : "Generado en vivo"} · ${input.insightsMeta.model} · ${input.insightsMeta.latencyMs}ms`,
        M, y
      );
      y += 5;
    }
    if (input.insights.resumenEjecutivo) {
      paragraph(input.insights.resumenEjecutivo);
    }
    if (input.insights.puntosClave.length > 0) {
      heading("Puntos clave", 11);
      input.insights.puntosClave.forEach((p) => {
        ensureSpace(6);
        setText(COLOR_TEXT, 9);
        doc.text(`• ${p}`, M + 2, y);
        y += 5;
      });
      y += 2;
    }
    if (input.insights.recomendaciones.length > 0) {
      heading("Recomendaciones", 11);
      const rows = input.insights.recomendaciones.map((r) => [
        r.prioridad.toUpperCase(),
        r.titulo,
        r.accion,
      ]);
      table(
        ["Prioridad", "Título", "Acción"],
        rows,
        [22, 50, W - M * 2 - 22 - 50],
      );
    }
    if (input.insights.alertas.length > 0) {
      heading("Alertas", 11);
      const rows = input.insights.alertas.map((a) => [
        a.severidad.toUpperCase(),
        a.titulo,
        a.detalle,
      ]);
      table(
        ["Severidad", "Título", "Detalle"],
        rows,
        [22, 50, W - M * 2 - 22 - 50],
      );
    }
  }

  // ─── KPIs ─────────────────────────────────────────────────
  heading("KPIs del período");
  const kpiRows = input.kpis.map((k) => {
    const variacion = k.variacionPct != null ? `${k.variacionPct > 0 ? "+" : ""}${k.variacionPct.toFixed(1)}%` : "—";
    return [
      k.label,
      typeof k.valor === "number" ? formatNumber(k.valor, 0) : String(k.valor),
      k.unidad ?? "—",
      variacion,
    ];
  });
  table(
    ["Indicador", "Valor", "Unidad", "Variación vs período anterior"],
    kpiRows,
    [70, 35, 25, W - M * 2 - 70 - 35 - 25],
  );

  // ─── Serie temporal ───────────────────────────────────────
  heading(`Tendencia: ${input.lineChart.title}`);
  setText(COLOR_MUTED, 8);
  doc.text(`Regresión: pendiente ${input.lineChart.regresion.slope.toFixed(2)} ${input.lineChart.unidad}/período · R² = ${input.lineChart.regresion.r2.toFixed(3)}`, M, y);
  y += 4;
  table(
    ["Período", `Valor (${input.lineChart.unidad})`, "Tipo"],
    input.lineChart.data.map((p) => [
      p.x,
      formatNumber(p.y, 2),
      p.proyectado ? "Proyectado" : "Real",
    ]),
    [40, 50, W - M * 2 - 40 - 50],
  );

  // ─── Distribución barV ────────────────────────────────────
  if (input.barVChart.data.length > 0) {
    heading(`Distribución: ${input.barVChart.title}`);
    table(
      ["Categoría", `Valor (${input.barVChart.unidad})`],
      input.barVChart.data.map((p) => [p.x, formatNumber(p.y, 2)]),
      [80, W - M * 2 - 80],
    );
  }

  // ─── Top barH ─────────────────────────────────────────────
  if (input.barHChart.data.length > 0) {
    heading(`Top: ${input.barHChart.title}`);
    table(
      ["Elemento", `Valor (${input.barHChart.unidad})`, "Detalle"],
      input.barHChart.data.map((p) => [p.label, formatNumber(p.value, 2), p.meta ?? "—"]),
      [70, 40, W - M * 2 - 70 - 40],
    );
  }

  // ─── Radar ────────────────────────────────────────────────
  if (input.radarChart.data.length > 0) {
    heading(`Distribución radial: ${input.radarChart.title}`);
    table(
      ["Eje", "Valor"],
      input.radarChart.data.map((p) => [p.axis, formatNumber(p.value, 2)]),
      [80, W - M * 2 - 80],
    );
  }

  // ─── Exponencial ──────────────────────────────────────────
  if (input.exponencialChart.data.length > 0) {
    heading(`Serie diaria: ${input.exponencialChart.title}`);
    table(
      ["Día", `Valor (${input.exponencialChart.unidad})`],
      input.exponencialChart.data.map((p) => [p.x, formatNumber(p.y, 2)]),
      [40, W - M * 2 - 40],
    );
  }

  // ─── Comparación ──────────────────────────────────────────
  if (input.comparacionChart.data.length > 0) {
    heading(`Comparación: ${input.comparacionChart.title}`);
    table(
      ["Categoría", "Actual", "Anterior", "Δ"],
      input.comparacionChart.data.map((c) => [
        c.label,
        formatNumber(c.actual, 2),
        formatNumber(c.anterior, 2),
        formatNumber(c.actual - c.anterior, 2),
      ]),
      [60, 35, 35, W - M * 2 - 60 - 35 - 35],
    );
  }

  // ─── Anomalías ────────────────────────────────────────────
  if (input.anomalias.length > 0) {
    heading(`Anomalías activas (${input.anomalias.length})`);
    const rows = input.anomalias.map((a) => [
      a.severidad.toUpperCase(),
      a.dimensionLabel,
      a.descripcion,
      a.detectadoEn ? new Date(a.detectadoEn).toLocaleString("es-EC") : "—",
    ]);
    table(
      ["Severidad", "Elemento", "Descripción", "Detectado"],
      rows,
      [20, 45, 80, W - M * 2 - 20 - 45 - 80],
    );
  }

  // ─── Footer en cada página ────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    setText(COLOR_MUTED, 7);
    doc.text(
      `Página ${i} de ${totalPages}  ·  Reporte generado por Estadísticas`,
      W / 2, H - 6, { align: "center" }
    );
  }

  return Buffer.from(doc.output("arraybuffer"));
}

function formatNumber(n: number, d: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-EC", { minimumFractionDigits: d, maximumFractionDigits: d });
}
