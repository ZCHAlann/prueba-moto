// pages/Reports/maintenanceBreakdownExport.ts
// ─────────────────────────────────────────────────────────────────────
// Exportadores del desglose de mantenimientos (rep-009).
//
// Específicos para el panel de CostBreakdown — no se reusan del ExportToolbar
// genérico porque acá necesitamos:
//   - PDF con sub-tablas de items + imágenes de repuestos incrustadas
//   - Excel con 3 hojas (Resumen / Detalle Repuestos / Evidencias)
//
// Los filtros del backend ya están aplicados en `mantenances`. Estos helpers
// solo formatean.
// ─────────────────────────────────────────────────────────────────────

import type {
  BreakdownItemRepuesto,
  BreakdownAdjunto,
  BreakdownMantenimiento,
} from "../../hooks/useCostBreakdown";

type Totals = { manoObra: number; repuestos: number; total: number };
type Rango  = { desde: string; hasta: string };
type Mode   = "workshop" | "supplier" | "combined";

type CommonOpts = {
  filename:     string;
  mode:         Mode;
  workshopName?: string;
  supplierName?: string;
  rango:        Rango;
  totals:       Totals;
  mantenances:  BreakdownMantenimiento[];
  supplierId?:  number | null;
};

// ─── Helpers ────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  return `${n.toFixed(2)} USD`;
}

function buildSafeFilename(base: string) {
  return base.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "").slice(0, 60);
}

/** Convierte una URL relativa ("/uploads/foo.jpg") a absoluta. */
function absoluteUrl(maybeRelative: string): string {
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  if (typeof window === "undefined") return maybeRelative;
  return `${window.location.origin}${maybeRelative.startsWith("/") ? "" : "/"}${maybeRelative}`;
}

/** Descarga una imagen y la devuelve como dataURL base64. Si falla, devuelve null. */
async function fetchImageBase64(url: string): Promise<string | null> {
  try {
    const abs = absoluteUrl(url);
    const res = await fetch(abs, { credentials: "include" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ─── PDF ────────────────────────────────────────────────────────────

export async function exportMaintenanceBreakdownPdf(opts: CommonOpts): Promise<void> {
  const { title, filename, mode, workshopName, supplierName, rango, totals, mantenances } = opts;
  if (mantenances.length === 0) throw new Error("No hay mantenimientos para exportar.");

  const { default: jsPDF }     = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc   = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const now = new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric" });

  // ── Header del reporte ──
  let cursorY = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(30, 30, 30);
  doc.text(title, margin, cursorY + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  const subtituloPartes: string[] = [];
  if (mode === "workshop" && workshopName)  subtituloPartes.push(`Taller: ${workshopName}`);
  if (mode === "supplier" && supplierName)  subtituloPartes.push(`Proveedor: ${supplierName}`);
  if (mode === "combined") {
    if (workshopName) subtituloPartes.push(`Taller: ${workshopName}`);
    if (supplierName) subtituloPartes.push(`Proveedor: ${supplierName}`);
  }
  const subtitulo = [
    `Rango: ${rango.desde} — ${rango.hasta}`,
    ...subtituloPartes,
  ].join("  ·  ");
  doc.text(subtitulo, margin, cursorY + 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generado: ${now}`, pageW - margin, cursorY + 6, { align: "right" });
  doc.text(`${mantenances.length} OT`, pageW - margin, cursorY + 12, { align: "right" });

  cursorY += 18;
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, cursorY, pageW - margin, cursorY);
  cursorY += 5;

  // ── KPIs ──
  const kpiY = cursorY;
  const colW = (pageW - 2 * margin) / 3;
  const drawKpi = (x: number, label: string, value: string, r: number, g: number, b: number) => {
    doc.setFillColor(r, g, b);
    doc.rect(x, kpiY, colW - 2, 11, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(label.toUpperCase(), x + 3, kpiY + 4.5);
    doc.setFontSize(11);
    doc.text(value, x + 3, kpiY + 9.5);
  };
  drawKpi(margin,                "Mano de obra", fmtMoney(totals.manoObra),  139, 92, 246);
  drawKpi(margin + colW,         "Repuestos",    fmtMoney(totals.repuestos),  6,  182, 212);
  drawKpi(margin + 2 * colW,     "Total",        fmtMoney(totals.total),      16, 185, 129);
  cursorY = kpiY + 16;

  // ── Por cada mantenimiento: sub-tabla + imágenes + adjuntos ──
  for (const m of mantenances) {
    // ¿Hay suficiente espacio? Si no, saltar de página.
    if (cursorY > pageH - 40) { doc.addPage(); cursorY = 14; }

    // Header del mantenimiento
    doc.setFillColor(243, 244, 246);
    doc.rect(margin, cursorY, pageW - 2 * margin, 9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    const titulo = `#${m.id} · ${m.assetPlate} · ${m.title}`;
    doc.text(titulo, margin + 3, cursorY + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(
      `${m.workshop?.name ?? "Sin taller"} · ${m.status} · ${m.scheduledDate?.slice(0, 10) ?? "—"}`,
      pageW - margin - 3,
      cursorY + 6,
      { align: "right" },
    );
    cursorY += 11;

    // Mini-KPIs de la OT
    const otRepuestos = opts.supplierId != null ? (m.repuestosProveedor ?? 0) : m.repuestos;
    const otTotal     = m.manoObra + otRepuestos;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(`Mano obra: ${fmtMoney(m.manoObra)}`, margin + 3, cursorY + 4);
    doc.text(`Repuestos: ${fmtMoney(otRepuestos)}`, margin + 60, cursorY + 4);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(16, 185, 129);
    doc.text(`Total: ${fmtMoney(otTotal)}`, pageW - margin - 3, cursorY + 4, { align: "right" });
    cursorY += 8;

    // Sub-tabla de items (si hay)
    if (m.items.length > 0) {
      if (cursorY > pageH - 30) { doc.addPage(); cursorY = 14; }
      autoTable(doc, {
        startY: cursorY,
        head: [["Proveedor", "Ítem", "Cant.", "Precio unit.", "Subtotal", "Foto"]],
        body: m.items.map((it) => [
          it.supplierName,
          it.name,
          String(it.quantity),
          fmtMoney(it.unitCost),
          fmtMoney(it.subtotal),
          it.photoUrl ? "📷" : "—",
        ]),
        styles: { fontSize: 7.5, cellPadding: 2, textColor: [50, 50, 50], lineColor: [230, 230, 230], lineWidth: 0.2 },
        headStyles: { fillColor: [220, 220, 230], textColor: [60, 60, 70], fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: "auto" },
          2: { cellWidth: 14, halign: "right" },
          3: { cellWidth: 28, halign: "right" },
          4: { cellWidth: 28, halign: "right" },
          5: { cellWidth: 12, halign: "center" },
        },
        margin: { left: margin, right: margin },
      });
      cursorY = (doc as any).lastAutoTable.finalY + 4;
    }

    // Imágenes de items (descargadas como base64, hasta 3 por OT)
    const itemsWithPhoto = m.items.filter((it) => it.photoUrl);
    if (itemsWithPhoto.length > 0) {
      if (cursorY > pageH - 50) { doc.addPage(); cursorY = 14; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text("Evidencia fotográfica:", margin + 3, cursorY + 4);
      cursorY += 6;

      const imgSize = 35;
      const imgGap = 4;
      const maxPerRow = Math.floor((pageW - 2 * margin - margin) / (imgSize + imgGap));
      const rowsOfImages: BreakdownItemRepuesto[][] = [];
      for (let i = 0; i < itemsWithPhoto.length; i += maxPerRow) {
        rowsOfImages.push(itemsWithPhoto.slice(i, i + maxPerRow));
      }
      for (const row of rowsOfImages) {
        if (cursorY + imgSize > pageH - 14) { doc.addPage(); cursorY = 14; }
        let x = margin + 3;
        for (const it of row) {
          const dataUrl = await fetchImageBase64(it.photoUrl!);
          if (dataUrl) {
            try {
              doc.addImage(dataUrl, "JPEG", x, cursorY, imgSize, imgSize);
            } catch {
              // Formato no soportado por jsPDF, intentar como PNG
              try { doc.addImage(dataUrl, "PNG", x, cursorY, imgSize, imgSize); }
              catch { /* ignorar imagen rota */ }
            }
            doc.setFont("helvetica", "normal");
            doc.setFontSize(6.5);
            doc.setTextColor(110, 110, 110);
            doc.text(it.name.slice(0, 28), x, cursorY + imgSize + 3);
          }
          x += imgSize + imgGap;
        }
        cursorY += imgSize + 6;
      }
    }

    // Adjuntos / links de evidencias
    if (m.attachments.length > 0) {
      if (cursorY > pageH - 20) { doc.addPage(); cursorY = 14; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text("Adjuntos:", margin + 3, cursorY + 4);
      cursorY += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(60, 100, 200);
      for (const a of m.attachments) {
        if (cursorY > pageH - 10) { doc.addPage(); cursorY = 14; }
        doc.text(`• ${a.label || "Adjunto"}: ${a.url}`, margin + 5, cursorY + 3);
        cursorY += 4;
      }
      doc.setTextColor(30, 30, 30);
    }

    cursorY += 6; // separación entre OTs
  }

  // ── Pie de página (números de página) ──
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(`Página ${i} de ${totalPages}`, pageW / 2, pageH - 6, { align: "center" });
  }

  doc.save(`${buildSafeFilename(filename)}.pdf`);
}

// ─── Excel ──────────────────────────────────────────────────────────

export async function exportMaintenanceBreakdownExcel(opts: CommonOpts): Promise<void> {
  const { filename, range: _range, ...rest } = { ...opts };
  const { rango, totals, mantenances } = rest;

  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Motors Aplismart";
  wb.created = new Date();

  // ── Hoja 1: Resumen ──
  const wsResumen = wb.addWorksheet("Resumen");
  wsResumen.columns = [
    { header: "Vehículo",  key: "assetPlate",   width: 14 },
    { header: "OT",        key: "title",        width: 30 },
    { header: "Taller",    key: "workshopName", width: 24 },
    { header: "Fecha",     key: "scheduledDate",width: 12 },
    { header: "Estado",    key: "status",       width: 14 },
    { header: "Mano obra", key: "manoObra",     width: 14 },
    { header: "Repuestos", key: "repuestos",    width: 14 },
    { header: "Total",     key: "total",        width: 14 },
  ];

  // Header con KPIs en la primera fila
  const headerRow = wsResumen.addRow({
    assetPlate:   "",
    title:        `Reporte de mantenimientos · ${rango.desde} — ${rango.hasta}`,
  });
  headerRow.font = { bold: true, size: 12, color: { argb: "FF1F2937" } };
  wsResumen.mergeCells(headerRow.number, 1, headerRow.number, 8);
  headerRow.height = 22;

  // KPIs en 3 filas
  const kpiRow = (label: string, value: number) => {
    const r = wsResumen.addRow({ title: label, total: value });
    r.getCell(2).numFmt = '"$"#,##0.00';
    r.getCell(2).font = { bold: true };
    r.getCell(1).font = { bold: true, color: { argb: "FF6B7280" } };
    return r;
  };
  kpiRow("Mano de obra", totals.manoObra);
  kpiRow("Repuestos",    totals.repuestos);
  kpiRow("Total",        totals.total);

  wsResumen.addRow([]); // fila vacía

  // Header de columnas
  const colsHeader = wsResumen.addRow([
    "Vehículo", "OT", "Taller", "Fecha", "Estado", "Mano obra", "Repuestos", "Total",
  ]);
  colsHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
    cell.alignment = { vertical: "middle" };
  });

  // Filas
  mantenances.forEach((m, i) => {
    const repuestos = opts.supplierId != null ? (m.repuestosProveedor ?? 0) : m.repuestos;
    const row = wsResumen.addRow({
      assetPlate:    m.assetPlate,
      title:         m.title,
      workshopName:  m.workshop?.name ?? "",
      scheduledDate: m.scheduledDate ? m.scheduledDate.slice(0, 10) : "",
      status:        m.status,
    });
    row.getCell(6).value = m.manoObra;
    row.getCell(6).numFmt = '"$"#,##0.00';
    row.getCell(7).value = repuestos;
    row.getCell(7).numFmt = '"$"#,##0.00';
    row.getCell(8).value = m.manoObra + repuestos;
    row.getCell(8).numFmt = '"$"#,##0.00';
    if (i % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFAFA" } };
      });
    }
  });

  // ── Hoja 2: Detalle Repuestos ──
  const wsDetalle = wb.addWorksheet("Detalle Repuestos");
  wsDetalle.columns = [
    { header: "OT #",         key: "mantId",       width: 8 },
    { header: "Vehículo",     key: "assetPlate",   width: 14 },
    { header: "Título OT",    key: "title",        width: 30 },
    { header: "Proveedor",    key: "supplierName", width: 22 },
    { header: "Ítem",         key: "name",         width: 28 },
    { header: "Cantidad",     key: "quantity",     width: 10 },
    { header: "Precio unit.", key: "unitCost",     width: 14 },
    { header: "Subtotal",     key: "subtotal",     width: 14 },
    { header: "Foto URL",     key: "photoUrl",     width: 40 },
  ];

  const detalleHeader = wsDetalle.addRow([
    "OT #", "Vehículo", "Título OT", "Proveedor", "Ítem",
    "Cantidad", "Precio unit.", "Subtotal", "Foto URL",
  ]);
  detalleHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
    cell.alignment = { vertical: "middle" };
  });

  mantenances.forEach((m) => {
    m.items.forEach((it) => {
      const r = wsDetalle.addRow({
        mantId:       m.id,
        assetPlate:   m.assetPlate,
        title:        m.title,
        supplierName: it.supplierName,
        name:         it.name,
        quantity:     it.quantity,
      });
      r.getCell(7).value = it.unitCost;
      r.getCell(7).numFmt = '"$"#,##0.00';
      r.getCell(8).value = it.subtotal;
      r.getCell(8).numFmt = '"$"#,##0.00';
      if (it.photoUrl) {
        r.getCell(9).value = { text: it.photoUrl, hyperlink: absoluteUrl(it.photoUrl) };
        r.getCell(9).font = { color: { argb: "FF2563EB" }, underline: true };
      }
    });
  });

  // ── Hoja 3: Evidencias ──
  const totalAdjuntos = mantenances.reduce((acc, m) => acc + m.attachments.length, 0);
  if (totalAdjuntos > 0) {
    const wsEvid = wb.addWorksheet("Evidencias");
    wsEvid.columns = [
      { header: "OT #",      key: "mantId",     width: 8 },
      { header: "Vehículo",  key: "assetPlate", width: 14 },
      { header: "Título OT", key: "title",      width: 30 },
      { header: "Etiqueta",  key: "label",      width: 22 },
      { header: "URL",       key: "url",        width: 60 },
    ];
    const evidHeader = wsEvid.addRow([
      "OT #", "Vehículo", "Título OT", "Etiqueta", "URL",
    ]);
    evidHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
      cell.alignment = { vertical: "middle" };
    });
    mantenances.forEach((m) => {
      m.attachments.forEach((a: BreakdownAdjunto) => {
        const r = wsEvid.addRow({
          mantId:     m.id,
          assetPlate: m.assetPlate,
          title:      m.title,
          label:      a.label,
        });
        r.getCell(5).value = { text: a.url, hyperlink: absoluteUrl(a.url) };
        r.getCell(5).font = { color: { argb: "FF2563EB" }, underline: true };
      });
    });
  }

  // ── Guardar ──
  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement("a");
  a.href     = url;
  a.download = `${buildSafeFilename(filename)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Copiar al portapapeles ────────────────────────────────────────

export async function copyMaintenanceBreakdownClipboard(opts: {
  mantenances: BreakdownMantenimiento[];
  totals:      Totals;
  rango:       Rango;
  supplierId?: number | null;
}): Promise<void> {
  const { mantenances, totals, rango, supplierId } = opts;
  const lines: string[] = [];

  lines.push(`Desglose de mantenimientos · ${rango.desde} — ${rango.hasta}`);
  lines.push(`Mano de obra: ${fmtMoney(totals.manoObra)}`);
  lines.push(`Repuestos:    ${fmtMoney(totals.repuestos)}`);
  lines.push(`Total:        ${fmtMoney(totals.total)}`);
  lines.push("");

  const header = ["#OT", "Vehículo", "OT", "Taller", "Fecha", "Estado", "Mano obra", "Repuestos", "Total"];
  lines.push(header.join("\t"));
  for (const m of mantenances) {
    const rep = supplierId != null ? (m.repuestosProveedor ?? 0) : m.repuestos;
    lines.push([
      String(m.id),
      m.assetPlate,
      m.title,
      m.workshop?.name ?? "",
      m.scheduledDate?.slice(0, 10) ?? "",
      m.status,
      fmtMoney(m.manoObra),
      fmtMoney(rep),
      fmtMoney(m.manoObra + rep),
    ].join("\t"));
  }

  await navigator.clipboard.writeText(lines.join("\n"));
}