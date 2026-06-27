// pages/Reports/groupedExport.ts
// ─────────────────────────────────────────────────────────────────────
// Exportadores para los módulos agrupados por placa (rep-003, rep-004,
// rep-005, rep-008, rep-009).
//
// A diferencia del ExportToolbar genérico (que aplana todos los grupos en
// una sola tabla), aquí cada grupo es una SECCIÓN con cabecera coloreada,
// su propia tabla, un subtotal visualmente diferenciado y, al final, un
// gran total. Esto aplica a PDF, Excel y CSV.
//
// Los filtros (rango de fechas, búsqueda, etc.) ya están aplicados en
// `rows` antes de llamar a estas funciones. Cada función respeta eso.
// ─────────────────────────────────────────────────────────────────────

export type GroupedColumn = { key: string; label: string };
export type GroupedRow = Record<string, unknown>;

export type Group = {
  groupValue: string;
  rows: GroupedRow[];
};

// ─── Helpers compartidos ────────────────────────────────────────────

export function groupRowsByKey(
  rows: GroupedRow[],
  groupKey: string,
): Group[] {
  const map = new Map<string, GroupedRow[]>();
  for (const row of rows) {
    const raw = String(row[groupKey] ?? "").trim();
    const key = raw === "" || raw === "—" ? "Sin placa" : raw;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return Array.from(map.entries()).map(([groupValue, rows]) => ({ groupValue, rows }));
}

function parseNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

const MONEY_COLS = new Set(["amount", "total", "cost", "labor", "parts"]);

function fmtSubtotal(value: number, col: string): string {
  if (MONEY_COLS.has(col)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD", maximumFractionDigits: 2,
    }).format(value);
  }
  return value.toLocaleString("es-CO");
}

/** Paleta de un módulo → color hex (para usar en PDF fill y Excel fill).
 *  Todo en escala de grises para un look editorial blanco/negro. */
export const PALETTE_HEX: Record<string, string> = {
  emerald: "#374151",
  amber:   "#374151",
  rose:    "#111827",
  blue:    "#1f2937",
  cyan:    "#374151",
  violet:  "#4b5563",
  orange:  "#1f2937",
  fuchsia: "#374151",
  teal:    "#1f2937",
};

/** Hex → [r, g, b] para jsPDF (0-255). */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Hex → ARGB para ExcelJS (FF + hex sin #). */
function hexToArgb(hex: string, alpha = "FF"): string {
  return `${alpha}${hex.replace("#", "").toUpperCase()}`;
}

/** Mezcla un hex con blanco para obtener un tinte claro (e.g. para fill de cabecera). */
function mixWithWhite(hex: string, ratio = 0.85): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * ratio);
  const out = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${out(mix(r))}${out(mix(g))}${out(mix(b))}`;
}

function buildSafeFilename(base: string) {
  return base.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "").slice(0, 60);
}

// ─── PDF ────────────────────────────────────────────────────────────

export type ExportGroupedPdfArgs = {
  title: string;
  subtitle?: string;
  filename: string;
  columns: GroupedColumn[];
  groups: Group[];
  numericCols: string[];
  palette: string;
};

export async function exportGroupedToPdf(args: ExportGroupedPdfArgs): Promise<void> {
  const { title, subtitle, filename, columns, groups, numericCols, palette } = args;
  if (groups.length === 0) throw new Error("No hay datos para exportar.");

  const { default: jsPDF }     = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc   = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const now = new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric" });

  const [pr, pg, pb] = hexToRgb(PALETTE_HEX[palette] ?? "#3b82f6");
  const [lightR, lightG, lightB] = hexToRgb(mixWithWhite(PALETTE_HEX[palette] ?? "#3b82f6", 0.85));

  let cursorY = 14;

  // ── Cabecera del reporte ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(30, 30, 30);
  doc.text(title, margin, cursorY + 6);

  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text(subtitle, margin, cursorY + 12);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generado: ${now}`, pageW - margin, cursorY + 6, { align: "right" });
  doc.text(`${groups.length} grupo${groups.length !== 1 ? "s" : ""}`, pageW - margin, cursorY + 12, { align: "right" });

  cursorY += subtitle ? 18 : 14;
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, cursorY, pageW - margin, cursorY);
  cursorY += 6;

  // ── Por cada grupo ──
  for (const { groupValue, rows } of groups) {
    // Salto de página si no hay espacio suficiente
    if (cursorY > pageH - 30) { doc.addPage(); cursorY = 14; }

    // Cabecera del grupo (rectángulo coloreado)
    doc.setFillColor(pr, pg, pb);
    doc.roundedRect(margin, cursorY, pageW - 2 * margin, 8, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    const title = `${groupValue}  ·  ${rows.length} registro${rows.length !== 1 ? "s" : ""}`;
    doc.text(title, margin + 4, cursorY + 5.5);
    cursorY += 11;

    // Tabla del grupo
    autoTable(doc, {
      startY: cursorY,
      head: [columns.map((c) => c.label)],
      body: rows.map((row) => columns.map((c) => String(row[c.key] ?? ""))),
      styles: { fontSize: 8, cellPadding: 2.5, textColor: [50, 50, 50], lineColor: [230, 230, 230], lineWidth: 0.2 },
      headStyles: { fillColor: [245, 245, 245], textColor: [80, 80, 80], fontStyle: "bold", lineColor: [220, 220, 220], lineWidth: 0.3 },
      alternateRowStyles: { fillColor: [252, 252, 252] },
      margin: { left: margin, right: margin },
    });
    cursorY = (doc as any).lastAutoTable.finalY + 2;

    // Subtotal del grupo (si hay columnas numéricas)
    if (numericCols.length > 0) {
      if (cursorY > pageH - 18) { doc.addPage(); cursorY = 14; }
      const subtotals = computeSubtotals(rows, numericCols);

      doc.setFillColor(lightR, lightG, lightB);
      doc.rect(margin, cursorY, pageW - 2 * margin, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      doc.text(`Subtotal ${groupValue}`, margin + 4, cursorY + 5);

      // Valores a la derecha
      const labelWidth = 50;
      let xPos = pageW - margin - 4;
      // Renderizamos en orden inverso para que aparezcan alineados a la derecha
      const rightSegments: string[] = [];
      for (const col of numericCols) {
        rightSegments.push(fmtSubtotal(subtotals[col] ?? 0, col));
      }
      doc.setTextColor(30, 30, 30);
      let offsetX = xPos;
      for (let i = rightSegments.length - 1; i >= 0; i--) {
        const seg = rightSegments[i];
        const segW = doc.getTextWidth(seg);
        offsetX -= segW;
        doc.text(seg, offsetX, cursorY + 5);
        offsetX -= 4; // separador
      }
      cursorY += 10;
    }

    // Separación entre grupos
    cursorY += 4;
  }

  // ── Gran total ──
  if (numericCols.length > 0) {
    if (cursorY > pageH - 18) { doc.addPage(); cursorY = 14; }
    const allRows = groups.flatMap((g) => g.rows);
    const grand = computeSubtotals(allRows, numericCols);

    doc.setFillColor(pr, pg, pb);
    doc.rect(margin, cursorY, pageW - 2 * margin, 9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(`TOTAL GENERAL  ·  ${allRows.length} registros`, margin + 4, cursorY + 6);

    // Valores a la derecha
    let offsetX = pageW - margin - 4;
    for (let i = numericCols.length - 1; i >= 0; i--) {
      const col = numericCols[i];
      const seg = fmtSubtotal(grand[col] ?? 0, col);
      const segW = doc.getTextWidth(seg);
      offsetX -= segW;
      doc.text(seg, offsetX, cursorY + 6);
      offsetX -= 4;
    }
  }

  // Pie de página
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

export type ExportGroupedExcelArgs = {
  title: string;
  filename: string;
  columns: GroupedColumn[];
  groups: Group[];
  numericCols: string[];
  palette: string;
};

export async function exportGroupedToExcel(args: ExportGroupedExcelArgs): Promise<void> {
  const { title, filename, columns, groups, numericCols, palette } = args;
  if (groups.length === 0) throw new Error("No hay datos para exportar.");

  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Motors Aplismart";
  wb.created = new Date();

  const ws = wb.addWorksheet(title.slice(0, 31));

  const baseHex = PALETTE_HEX[palette] ?? "#3b82f6";
  const headerFill = hexToArgb(baseHex);
  const headerLightFill = hexToArgb(mixWithWhite(baseHex, 0.85));
  const grandTotalFill = hexToArgb(baseHex);
  const subtotalFill = hexToArgb("#f5f5f5");

  // ── Por cada grupo ──
  for (const { groupValue, rows } of groups) {
    // Cabecera de grupo (fila con fondo coloreado, texto blanco)
    const headerRow = ws.addRow([`${groupValue}  ·  ${rows.length} registro${rows.length !== 1 ? "s" : ""}`]);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerFill } };
    headerRow.alignment = { vertical: "middle", indent: 1 };
    ws.mergeCells(headerRow.number, 1, headerRow.number, columns.length);
    headerRow.height = 20;

    // Column headers
    const colHeaderRow = ws.addRow(columns.map((c) => c.label));
    colHeaderRow.eachCell((cell) => {
      cell.font      = { bold: true, color: { argb: "FF505050" } };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: subtotalFill } };
      cell.border    = { bottom: { style: "thin", color: { argb: "FFDCDCDC" } } };
      cell.alignment = { vertical: "middle" };
    });

    // Filas de detalle
    rows.forEach((row, i) => {
      const dataRow = ws.addRow(columns.map((c) => String(row[c.key] ?? "")));
      if (i % 2 === 1) {
        dataRow.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCFCFC" } };
        });
      }
    });

    // Subtotal del grupo
    if (numericCols.length > 0) {
      const subtotals = computeSubtotals(rows, numericCols);
      const subRow = ws.addRow([]);
      const firstCell = subRow.getCell(1);
      firstCell.value = `Subtotal ${groupValue}`;
      firstCell.font = { bold: true, italic: true, color: { argb: "FF505050" } };
      firstCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerLightFill } };
      firstCell.alignment = { vertical: "middle", indent: 1 };

      columns.forEach((col, i) => {
        if (i === 0) return;
        const cell = subRow.getCell(i + 1);
        if (numericCols.includes(col.key)) {
          cell.value = subtotals[col.key] ?? 0;
          cell.numFmt = MONEY_COLS.has(col.key) ? '"$"#,##0.00' : '#,##0';
          cell.font = { bold: true, color: { argb: "FF1F2937" } };
          cell.alignment = { horizontal: "right" };
        }
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerLightFill } };
      });
      subRow.height = 18;
    }

    // Fila vacía entre grupos
    ws.addRow([]);
  }

  // ── Gran total ──
  if (numericCols.length > 0) {
    const allRows = groups.flatMap((g) => g.rows);
    const grand = computeSubtotals(allRows, numericCols);
    const totalRow = ws.addRow([]);
    const firstCell = totalRow.getCell(1);
    firstCell.value = `TOTAL GENERAL  ·  ${allRows.length} registros`;
    firstCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    firstCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: grandTotalFill } };
    firstCell.alignment = { vertical: "middle", indent: 1 };

    columns.forEach((col, i) => {
      if (i === 0) return;
      const cell = totalRow.getCell(i + 1);
      if (numericCols.includes(col.key)) {
        cell.value = grand[col.key] ?? 0;
        cell.numFmt = MONEY_COLS.has(col.key) ? '"$"#,##0.00' : '#,##0';
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.alignment = { horizontal: "right" };
      }
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: grandTotalFill } };
    });
    totalRow.height = 22;
  }

  // Ancho de columnas
  columns.forEach((col, i) => {
    let max = col.label.length;
    for (const { rows } of groups) {
      for (const r of rows) {
        const len = String(r[col.key] ?? "").length;
        if (len > max) max = len;
      }
    }
    ws.getColumn(i + 1).width = Math.min(max + 4, 42);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement("a");
  a.href     = url;
  a.download = `${buildSafeFilename(filename)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── CSV ────────────────────────────────────────────────────────────

export type ExportGroupedCsvArgs = {
  title: string;
  filename: string;
  columns: GroupedColumn[];
  groups: Group[];
  numericCols: string[];
};

export function exportGroupedToCsv(args: ExportGroupedCsvArgs): void {
  const { title, filename, columns, groups, numericCols } = args;
  if (groups.length === 0) throw new Error("No hay datos para exportar.");

  const lines: string[] = [];

  // Cabecera del reporte
  lines.push(`# ${title}`);
  lines.push(`# Generado: ${new Date().toLocaleDateString("es-EC")}`);
  lines.push("");

  // Columnas header (solo una vez al inicio como referencia)
  lines.push(columns.map((c) => c.label).join(","));
  lines.push("");

  for (const { groupValue, rows } of groups) {
    // Cabecera de grupo (como separador visual)
    lines.push(`=== ${groupValue} (${rows.length} registro${rows.length !== 1 ? "s" : ""}) ===`);

    // Filas de detalle
    for (const row of rows) {
      const cells = columns.map((c) => {
        const v = String(row[c.key] ?? "");
        return csvEscape(v);
      });
      lines.push(cells.join(","));
    }

    // Subtotal del grupo
    if (numericCols.length > 0) {
      const subtotals = computeSubtotals(rows, numericCols);
      const subCells = columns.map((c) => {
        if (c.key === columns[0].key) return `--- Subtotal ${groupValue} ---`;
        if (numericCols.includes(c.key)) return fmtSubtotal(subtotals[c.key] ?? 0, c.key);
        return "";
      });
      lines.push(subCells.join(","));
    }

    lines.push(""); // línea vacía entre grupos
  }

  // Gran total
  if (numericCols.length > 0) {
    const allRows = groups.flatMap((g) => g.rows);
    const grand = computeSubtotals(allRows, numericCols);
    const grandCells = columns.map((c) => {
      if (c.key === columns[0].key) return `*** TOTAL GENERAL (${allRows.length} registros) ***`;
      if (numericCols.includes(c.key)) return fmtSubtotal(grand[c.key] ?? 0, c.key);
      return "";
    });
    lines.push(grandCells.join(","));
  }

  const content = lines.join("\n");
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${buildSafeFilename(filename)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(s: string): string {
  const needsQuotes = s.includes(",") || s.includes('"') || s.includes("\n");
  if (!needsQuotes) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

// ─── Copiar al portapapeles ────────────────────────────────────────

export async function copyGroupedToClipboard(args: ExportGroupedCsvArgs): Promise<void> {
  const { columns, groups, numericCols } = args;
  const lines: string[] = [];

  for (const { groupValue, rows } of groups) {
    lines.push(`=== ${groupValue} (${rows.length} registros) ===`);
    lines.push(columns.map((c) => c.label).join("\t"));
    for (const row of rows) {
      lines.push(columns.map((c) => String(row[c.key] ?? "")).join("\t"));
    }
    if (numericCols.length > 0) {
      const subtotals = computeSubtotals(rows, numericCols);
      const subCells = columns.map((c) => {
        if (c.key === columns[0].key) return `Subtotal ${groupValue}`;
        if (numericCols.includes(c.key)) return fmtSubtotal(subtotals[c.key] ?? 0, c.key);
        return "";
      });
      lines.push(subCells.join("\t"));
    }
    lines.push("");
  }

  if (numericCols.length > 0) {
    const allRows = groups.flatMap((g) => g.rows);
    const grand = computeSubtotals(allRows, numericCols);
    const grandCells = columns.map((c) => {
      if (c.key === columns[0].key) return `TOTAL GENERAL (${allRows.length} registros)`;
      if (numericCols.includes(c.key)) return fmtSubtotal(grand[c.key] ?? 0, c.key);
      return "";
    });
    lines.push(grandCells.join("\t"));
  }

  await navigator.clipboard.writeText(lines.join("\n"));
}

// ─── Helper interno ─────────────────────────────────────────────────

function computeSubtotals(rows: GroupedRow[], numericCols: string[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const col of numericCols) acc[col] = 0;
  for (const row of rows) {
    for (const col of numericCols) {
      acc[col] += parseNum(row[col]);
    }
  }
  return acc;
}