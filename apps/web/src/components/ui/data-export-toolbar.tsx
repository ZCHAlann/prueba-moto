"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import type { AppAccent } from "@/lib/navigation";
import { accentStyles } from "@/lib/navigation";

export type ExportColumn = {
  key: string;
  label: string;
};

export type ExportRow = Record<string, string | number | null | undefined>;

export type ExportSummaryItem = {
  label: string;
  value: string;
  detail?: string;
};

type DataExportToolbarProps = {
  title: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  accent?: AppAccent;
  subtitle?: string;
  summaryItems?: ExportSummaryItem[];
  filenameBase?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  leadingContent?: ReactNode;
  extraContent?: ReactNode;
};

function sanitizeCell(value: ExportRow[string]) {
  return value == null ? "" : String(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildCsv(columns: ExportColumn[], rows: ExportRow[]) {
  const header = columns.map((column) => `"${column.label.replace(/"/g, '""')}"`).join(",");
  const lines = rows.map((row) =>
    columns
      .map((column) => `"${sanitizeCell(row[column.key]).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header, ...lines].join("\n");
}

function buildPlainText(columns: ExportColumn[], rows: ExportRow[]) {
  const header = columns.map((column) => column.label).join("\t");
  const lines = rows.map((row) => columns.map((column) => sanitizeCell(row[column.key])).join("\t"));
  return [header, ...lines].join("\n");
}

function buildSpreadsheetXml(
  title: string,
  brandName: string,
  subtitle: string | undefined,
  columns: ExportColumn[],
  rows: ExportRow[],
  summaryItems: ExportSummaryItem[]
) {
  const summaryRows = summaryItems
    .map(
      (item) => `
      <Row>
        <Cell ss:StyleID="summaryLabel"><Data ss:Type="String">${escapeXml(item.label)}</Data></Cell>
        <Cell ss:StyleID="summaryValue"><Data ss:Type="String">${escapeXml(item.value)}</Data></Cell>
        <Cell ss:StyleID="body"><Data ss:Type="String">${escapeXml(item.detail ?? "")}</Data></Cell>
      </Row>`
    )
    .join("");

  const headerCells = columns
    .map(
      (column) =>
        `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeXml(column.label)}</Data></Cell>`
    )
    .join("");

  const bodyRows = rows
    .map((row) => {
      const cells = columns
        .map(
          (column) =>
            `<Cell ss:StyleID="body"><Data ss:Type="String">${escapeXml(sanitizeCell(row[column.key]))}</Data></Cell>`
        )
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="title">
      <Font ss:Bold="1" ss:Size="16" ss:Color="#0f172a"/>
    </Style>
    <Style ss:ID="subtitle">
      <Font ss:Size="10" ss:Color="#475569"/>
    </Style>
    <Style ss:ID="header">
      <Font ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#0f766e" ss:Pattern="Solid"/>
      <Alignment ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="summaryLabel">
      <Font ss:Bold="1" ss:Color="#0f172a"/>
      <Interior ss:Color="#d1fae5" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="summaryValue">
      <Font ss:Bold="1" ss:Color="#0f172a"/>
      <Interior ss:Color="#ecfeff" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="body">
      <Alignment ss:Vertical="Top" ss:WrapText="1"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/>
      </Borders>
    </Style>
  </Styles>
  <Worksheet ss:Name="Reporte">
    <Table>
      <Row>
        <Cell ss:MergeAcross="${Math.max(columns.length - 1, 0)}" ss:StyleID="title"><Data ss:Type="String">${escapeXml(brandName)}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:MergeAcross="${Math.max(columns.length - 1, 0)}" ss:StyleID="title"><Data ss:Type="String">${escapeXml(title)}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:MergeAcross="${Math.max(columns.length - 1, 0)}" ss:StyleID="subtitle"><Data ss:Type="String">${escapeXml(subtitle || "Exportacion operativa generada desde la plataforma.")}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:MergeAcross="${Math.max(columns.length - 1, 0)}" ss:StyleID="subtitle"><Data ss:Type="String">${escapeXml(`Fecha de exportacion: ${new Date().toLocaleString("es-EC")}`)}</Data></Cell>
      </Row>
      <Row />
      ${summaryRows}
      <Row />
      <Row>${headerCells}</Row>
      ${bodyRows}
    </Table>
  </Worksheet>
</Workbook>`;
}

function buildHtmlTable(
  brandName: string,
  title: string,
  subtitle: string | undefined,
  columns: ExportColumn[],
  rows: ExportRow[],
  summaryItems: ExportSummaryItem[]
) {
  const header = columns
    .map(
      (column) =>
        `<th style="padding:12px 14px;background:#0f766e;color:#fff;text-align:left;font-size:12px;font-weight:700;">${escapeHtml(column.label)}</th>`
    )
    .join("");

  const summary = summaryItems.length
    ? `<section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:0 0 20px;">
        ${summaryItems
          .map(
            (item) => `<article style="border:1px solid #dbeafe;border-radius:12px;padding:14px;background:#f8fafc;">
                <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;color:#0f766e;">${escapeHtml(item.label)}</p>
                <p style="margin:8px 0 0;font-size:24px;font-weight:800;color:#0f172a;">${escapeHtml(item.value)}</p>
                <p style="margin:6px 0 0;font-size:12px;color:#475569;">${escapeHtml(item.detail ?? "")}</p>
              </article>`
          )
          .join("")}
      </section>`
    : "";

  const body = rows
    .map((row, index) => {
      const cells = columns
        .map(
          (column) =>
            `<td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#0f172a;background:${
              index % 2 === 0 ? "#ffffff" : "#f8fafc"
            }">${escapeHtml(sanitizeCell(row[column.key]))}</td>`
        )
        .join("");

      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Inter, Arial, sans-serif; margin: 24px; color: #0f172a; }
      h1 { margin: 0; font-size: 26px; }
      h2 { margin: 4px 0 0; font-size: 15px; color: #0f766e; }
      p { margin: 0 0 20px; color: #475569; }
      table { width: 100%; border-collapse: collapse; }
    </style>
  </head>
  <body>
    <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:20px;">
      <div>
        <h2>${escapeHtml(brandName)}</h2>
        <h1>${escapeHtml(title)}</h1>
        <p style="margin:8px 0 0;">${escapeHtml(subtitle || "Exportacion operativa generada desde el panel.")}</p>
      </div>
      <div style="min-width:220px;border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#f8fafc;">
        <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;color:#0f766e;">Fecha de exportacion</p>
        <p style="margin:8px 0 0;font-size:14px;color:#0f172a;">${escapeHtml(new Date().toLocaleString("es-EC"))}</p>
        <p style="margin:8px 0 0;font-size:11px;color:#64748b;">Filas visibles: ${rows.length}</p>
      </div>
    </div>
    ${summary}
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </body>
</html>`;
}

function downloadBlob(filename: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function openPrintPreview(
  brandName: string,
  title: string,
  subtitle: string | undefined,
  columns: ExportColumn[],
  rows: ExportRow[],
  summaryItems: ExportSummaryItem[]
) {
  const previewWindow = window.open("", "_blank", "noopener,noreferrer,width=1200,height=900");
  if (!previewWindow) {
    throw new Error("El navegador bloqueo la ventana de impresion.");
  }

  previewWindow.document.write(buildHtmlTable(brandName, title, subtitle, columns, rows, summaryItems));
  previewWindow.document.close();
  previewWindow.focus();
  return previewWindow;
}

function buildFilename(title: string, filenameBase: string | undefined, extension: string, brandName: string) {
  const date = new Date().toISOString().slice(0, 10);
  const company = brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const base = (filenameBase || title).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `${company || "aplismart-motors"}-${base}-${date}.${extension}`;
}

export function DataExportToolbar({
  title,
  columns,
  rows,
  accent = "teal",
  subtitle,
  summaryItems = [],
  filenameBase,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar en la tabla",
  leadingContent,
  extraContent,
}: DataExportToolbarProps) {
  const { notifyError, notifySuccess } = useFeedback();
  const { session } = useAuth();
  const { settings } = usePlatform();
  const disabled = rows.length === 0;
  const reportBrandName = session?.companyName || settings.brandName;
  const reportColumns = useMemo<ExportColumn[]>(
    () => [{ key: "__index", label: "#" }, ...columns],
    [columns]
  );
  const reportRows = useMemo<ExportRow[]>(
    () => rows.map((row, index) => ({ __index: index + 1, ...row })),
    [rows]
  );

  const handleCopy = async () => {
    const plainText = buildPlainText(reportColumns, reportRows);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(plainText);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = plainText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      notifySuccess("Contenido copiado", "La tabla se copio al portapapeles.");
    } catch (error) {
      notifyError(
        "No se pudo copiar",
        error instanceof Error ? error.message : "El portapapeles no esta disponible."
      );
    }
  };

  const handleCsv = () => {
    downloadBlob(
      buildFilename(title, filenameBase, "csv", reportBrandName),
      `\uFEFF${buildCsv(reportColumns, reportRows)}`,
      "text/csv;charset=utf-8;"
    );
    notifySuccess("CSV listo", "Se descargo el archivo CSV del listado actual.");
  };

  const handleExcel = () => {
    downloadBlob(
      buildFilename(title, filenameBase, "xls", reportBrandName),
      `\uFEFF${buildSpreadsheetXml(title, reportBrandName, subtitle, reportColumns, reportRows, summaryItems)}`,
      "application/vnd.ms-excel;charset=utf-8;"
    );
    notifySuccess("Excel listo", "Se descargo una hoja compatible con Excel.");
  };

  const handlePdf = () => {
    try {
      const previewWindow = openPrintPreview(
        reportBrandName,
        title,
        subtitle,
        reportColumns,
        reportRows,
        summaryItems
      );
      notifySuccess("Vista PDF abierta", "Usa Guardar como PDF en el dialogo de impresion.");
      window.setTimeout(() => previewWindow.print(), 180);
    } catch (error) {
      notifyError("Ventana emergente bloqueada", "Descargando versión HTML como alternativa.");
      const htmlContent = buildHtmlTable(reportBrandName, title, subtitle, reportColumns, reportRows, summaryItems);
      downloadBlob(buildFilename(title, filenameBase, "html", reportBrandName), htmlContent, "text/html;charset=utf-8;");
    }
  };

  const handlePrint = () => {
    try {
      const previewWindow = openPrintPreview(
        reportBrandName,
        title,
        subtitle,
        reportColumns,
        reportRows,
        summaryItems
      );
      notifySuccess("Vista de impresion abierta", "La tabla quedo lista para imprimir.");
      window.setTimeout(() => previewWindow.print(), 180);
    } catch (error) {
      notifyError("Ventana emergente bloqueada", "Descargando versión HTML como alternativa para imprimir.");
      const htmlContent = buildHtmlTable(reportBrandName, title, subtitle, reportColumns, reportRows, summaryItems);
      downloadBlob(buildFilename(title, filenameBase, "html", reportBrandName), htmlContent, "text/html;charset=utf-8;");
    }
  };

  return (
    <div className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {leadingContent}
          <Button tone={accent} variant="outline" onClick={handleCopy} disabled={disabled} className="px-3 py-2">
            Copiar
          </Button>
          <Button tone={accent} variant="outline" onClick={handleCsv} disabled={disabled} className="px-3 py-2">
            CSV
          </Button>
          <Button tone={accent} variant="outline" onClick={handleExcel} disabled={disabled} className="px-3 py-2">
            Excel
          </Button>
          <Button tone={accent} variant="outline" onClick={handlePdf} disabled={disabled} className="px-3 py-2">
            PDF
          </Button>
          <Button tone={accent} variant="outline" onClick={handlePrint} disabled={disabled} className="px-3 py-2">
            Imprimir
          </Button>
          {extraContent}
        </div>

        {onSearchChange ? (
          <label className="w-full xl:w-[280px]">
            <span className="sr-only">{searchPlaceholder}</span>
            <input
              value={searchValue ?? ""}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              className={`w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition ${accentStyles[accent].focus} focus:ring-2`}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}
