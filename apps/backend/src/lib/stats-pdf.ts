// lib/stats-pdf.ts
// ─────────────────────────────────────────────────────────────────────
// Generador de PDF para el submódulo "reportes > estadisticas".
//
// Contenido del PDF (una página por sección):
//   1. Header (título, módulo, período, rango, fecha de generación)
//   2. Análisis IA (si existe en cache): resumen narrativo + métricas +
//      acción principal + hallazgos secundarios — shape V2, ver
//      lib/ai-insights.ts
//   3. KPIs (4 tarjetas como tabla)
//   4. Series temporales (tabla con los buckets)
//   5. Distribuciones (top N como tabla)
//   6. Anomalías activas (tabla)
//
// Usamos jsPDF (ya en node_modules) sin dependencias extra.
//
// NOTA (migración V1→V2 de ai-insights.ts): este archivo consumía antes
// el shape viejo (resumenEjecutivo, puntosClave, recomendaciones,
// alertas). Se actualizó para usar el shape V2 real (resumenNarrativo,
// nivelAtencion, metricas, accionPrincipal, hallazgosSecundarios).
// ─────────────────────────────────────────────────────────────────────

import { jsPDF } from "jspdf";
import type { EstadisticasDataExport } from "./stats-pdf-types";

const COLOR_TEXT: [number, number, number]   = [31, 41, 55];   // gray-800
const COLOR_MUTED: [number, number, number]  = [107, 114, 128]; // gray-500
const COLOR_HEAD:  [number, number, number]  = [17, 24, 39];   // gray-900
const COLOR_RULE:  [number, number, number]  = [229, 231, 235]; // gray-200
const COLOR_ALTA:  [number, number, number]  = [225, 29, 72];  // rose-600
const COLOR_MEDIA: [number, number, number]  = [217, 119, 6];  // amber-600
const COLOR_BAJA:  [number, number, number]  = [37, 99, 235];  // blue-600
const COLOR_OK:    [number, number, number]  = [5, 150, 105];  // emerald-600

export type PDFExportInput = EstadisticasDataExport;

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
  function severityColor(sev: "alta" | "media" | "baja"): [number, number, number] {
    return sev === "alta" ? COLOR_ALTA : sev === "media" ? COLOR_MEDIA : COLOR_BAJA;
  }
  function nivelAtencionColor(n: "ok" | "media" | "alta"): [number, number, number] {
    return n === "alta" ? COLOR_ALTA : n === "media" ? COLOR_MEDIA : COLOR_OK;
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

  // ─── Análisis IA (shape V2) ───────────────────────────────
  if (input.insights) {
    const ins = input.insights;
    heading("Análisis IA");

    if (input.insightsMeta) {
      setText(COLOR_MUTED, 8);
      doc.text(
        `${input.insightsMeta.fromCache ? "Desde caché" : "Generado en vivo"} · ${input.insightsMeta.model} · ${input.insightsMeta.latencyMs}ms`,
        M, y
      );
      y += 5;
    }

    // Nivel de atención (badge textual + resumen narrativo)
    ensureSpace(8);
    const nivelColor = nivelAtencionColor(ins.nivelAtencion);
    setText(nivelColor, 9, true);
    doc.text(`Nivel de atención: ${ins.nivelAtencion.toUpperCase()}`, M, y);
    y += 6;

    if (ins.resumenNarrativo) {
      paragraph(ins.resumenNarrativo);
    }

    // Métricas de soporte
    if (ins.metricas.length > 0) {
      heading("Métricas clave", 11);
      table(
        ["Indicador", "Valor"],
        ins.metricas.map((m) => [m.label, m.valor]),
        [90, W - M * 2 - 90],
      );
    }

    // Acción principal
    if (ins.accionPrincipal) {
      heading("Acción principal", 11);
      setText(COLOR_HEAD, 10, true);
      ensureSpace(6);
      doc.text(ins.accionPrincipal.titulo, M, y);
      y += 5;
      if (ins.accionPrincipal.justificacion) {
        paragraph(ins.accionPrincipal.justificacion);
      }
      const refs: string[] = [];
      if (ins.accionPrincipal.refAssetPlate) refs.push(`Vehículo: ${ins.accionPrincipal.refAssetPlate}`);
      if (ins.accionPrincipal.refDriverName) refs.push(`Conductor: ${ins.accionPrincipal.refDriverName}`);
      if (refs.length > 0) {
        setText(COLOR_MUTED, 8);
        ensureSpace(5);
        doc.text(refs.join("  ·  "), M, y);
        y += 5;
      }
      y += 2;
    }

    // Hallazgos secundarios
    if (ins.hallazgosSecundarios.length > 0) {
      heading("Hallazgos", 11);
      ins.hallazgosSecundarios.forEach((h) => {
        ensureSpace(11);
        setText(severityColor(h.severidad), 9, true);
        doc.text(`[${h.severidad.toUpperCase()}] ${h.titulo}`, M, y);
        y += 4.5;
        setText(COLOR_TEXT, 9);
        const lines = doc.splitTextToSize(h.detalle, W - M * 2 - 2);
        doc.text(lines, M + 2, y);
        y += lines.length * 4.5;
        if (h.recomendacion) {
          setText(COLOR_MUTED, 8.5);
          const recLines = doc.splitTextToSize(`→ ${h.recomendacion}`, W - M * 2 - 2);
          ensureSpace(recLines.length * 4.2);
          doc.text(recLines, M + 2, y);
          y += recLines.length * 4.2;
        }
        y += 2;
      });
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