"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  Save,
  FileText,
  Sheet,
  FileDown,
  Copy,
  Loader2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExportColumn = {
  key: string;
  label: string;
};

export type ExportRow = Record<string, unknown>;

export type ExportToolbarProps = {
  title: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  subtitle?: string;
  logoUrl?: string;
  filename?: string;
};

// ─── Export utils ─────────────────────────────────────────────────────────────

function buildSafeFilename(base: string) {
  return base
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 60);
}

function rowsToMatrix(columns: ExportColumn[], rows: ExportRow[]): string[][] {
  const header = columns.map((c) => c.label);
  const body   = rows.map((row) => columns.map((c) => String(row[c.key] ?? "")));
  return [header, ...body];
}

// ── PDF ────────────────────────────────────────────────────────────────────────

export async function exportToPdf({
  title, subtitle, logoUrl, filename, columns, rows,
}: ExportToolbarProps) {
  const { default: jsPDF }     = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc   = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const now   = new Date().toLocaleDateString("es-EC", {
    day: "2-digit", month: "long", year: "numeric",
  });

  let cursorY = 14;

  if (logoUrl) {
    try {
      const img = new Image();
      img.src = logoUrl;
      await new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); });
      doc.addImage(img, "PNG", 14, cursorY, 28, 10);
    } catch { /* continúa sin logo */ }
    cursorY += 2;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text(title, logoUrl ? 48 : 14, cursorY + 6);

  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(subtitle, logoUrl ? 48 : 14, cursorY + 12);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generado: ${now}`, pageW - 14, cursorY + 6, { align: "right" });

  cursorY += subtitle ? 18 : 14;
  doc.setDrawColor(220, 220, 220);
  doc.line(14, cursorY, pageW - 14, cursorY);
  cursorY += 4;

  autoTable(doc, {
    startY: cursorY,
    head:   [columns.map((c) => c.label)],
    body:   rows.map((row) => columns.map((c) => String(row[c.key] ?? ""))),
    styles: { fontSize: 8, cellPadding: 3, textColor: [50, 50, 50], lineColor: [230, 230, 230], lineWidth: 0.2 },
    headStyles: { fillColor: [245, 245, 245], textColor: [80, 80, 80], fontStyle: "bold", lineColor: [220, 220, 220], lineWidth: 0.3 },
    alternateRowStyles: { fillColor: [252, 252, 252] },
    margin: { left: 14, right: 14 },
  });

  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(`Página ${i} de ${totalPages}`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" });
  }

  doc.save(`${buildSafeFilename(filename ?? title)}.pdf`);
}

// ── Excel ──────────────────────────────────────────────────────────────────────

export async function exportToExcel({ title, filename, columns, rows }: ExportToolbarProps) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Motors Aplismart";
  wb.created = new Date();

  const ws = wb.addWorksheet(title.slice(0, 31));

  const headerRow = ws.addRow(columns.map((c) => c.label));
  headerRow.eachCell((cell) => {
    cell.font      = { bold: true, color: { argb: "FF505050" } };
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
    cell.border    = { bottom: { style: "thin", color: { argb: "FFDCDCDC" } } };
    cell.alignment = { vertical: "middle" };
  });

  rows.forEach((row, i) => {
    const dataRow = ws.addRow(columns.map((c) => String(row[c.key] ?? "")));
    if (i % 2 === 1) {
      dataRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCFCFC" } };
      });
    }
  });

  columns.forEach((col, i) => {
    const max = Math.max(col.label.length, ...rows.map((r) => String(r[col.key] ?? "").length));
    ws.getColumn(i + 1).width = Math.min(max + 4, 42);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement("a");
  a.href     = url;
  a.download = `${buildSafeFilename(filename ?? title)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── CSV ────────────────────────────────────────────────────────────────────────

export function exportToCsv({ title, filename, columns, rows }: ExportToolbarProps) {
  const matrix  = rowsToMatrix(columns, rows);
  const content = matrix
    .map((row) =>
      row.map((cell) => {
        const str = cell.replace(/"/g, '""');
        return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str}"` : str;
      }).join(",")
    )
    .join("\n");

  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${buildSafeFilename(filename ?? title)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Copiar ─────────────────────────────────────────────────────────────────────

export async function copyToClipboard({ columns, rows }: Pick<ExportToolbarProps, "columns" | "rows">) {
  const matrix  = rowsToMatrix(columns, rows);
  const content = matrix.map((row) => row.join("\t")).join("\n");
  await navigator.clipboard.writeText(content);
}

// ─── Dropdown item ────────────────────────────────────────────────────────────

function DropdownItem({
  icon, label, description, loading, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-white/[0.04]"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-400">
        {loading ? <Loader2 size={13} className="animate-spin" /> : icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800 dark:text-white">{label}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{description}</p>
      </div>
    </button>
  );
}

// ─── Portal dropdown ──────────────────────────────────────────────────────────

type DropdownPos = { top: number; right: number; openUpward: boolean };

function DropdownPortal({
  pos,
  rows,
  items,
  loading,
  onAction,
  portalRef,
}: {
  pos: DropdownPos;
  rows: ExportRow[];
  items: { id: string; label: string; description: string; icon: React.ReactNode; action: () => Promise<void> | void }[];
  loading: string | null;
  onAction: (id: string, action: () => Promise<void> | void) => void;
  portalRef: React.RefObject<HTMLDivElement | null>;
}) {
  const style: React.CSSProperties = {
    position: "fixed",
    right:    pos.right,
    zIndex:   9999,
    width:    208,
    ...(pos.openUpward
      ? { bottom: `calc(100vh - ${pos.top}px + 6px)` }
      : { top: pos.top + 6 }),
  };

  return createPortal(
    <div
      ref={portalRef}
      style={style}
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl shadow-black/[0.08] dark:border-white/[0.08] dark:bg-gray-900 dark:shadow-black/40"
    >
      {/* Header */}
      <div className="border-b border-gray-100 px-3.5 py-2 dark:border-white/[0.06]">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          Formato de exportación
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {rows.length} fila{rows.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Items */}
      <div className="py-1">
        {items.map((item, i) => (
          <div key={item.id}>
            <DropdownItem
              icon={item.icon}
              label={item.label}
              description={item.description}
              loading={loading === item.id}
              onClick={() => onAction(item.id, item.action)}
            />
            {i < items.length - 1 && (
              <div className="mx-3.5 border-t border-gray-100 dark:border-white/[0.04]" />
            )}
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ExportToolbar(props: ExportToolbarProps) {
  const { rows } = props;

  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [pos,     setPos]     = useState<DropdownPos | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  // ✅ FIX: el portalRef ahora vive en el padre para que el listener pueda verlo
  const portalRef  = useRef<HTMLDivElement>(null);

  const recalcPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect       = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < 280;

    setPos({
      top:       openUpward ? rect.top : rect.bottom,
      right:     window.innerWidth - rect.right,
      openUpward,
    });
  }, []);

  const handleToggle = () => {
    if (!open) recalcPos();
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;

    const close = (e: MouseEvent) => {
      // ✅ FIX: ignorar clicks dentro del trigger Y dentro del portal
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (portalRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const closeOnScroll = () => setOpen(false);

    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", closeOnScroll, true);

    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [open]);

  async function handle(id: string, action: () => Promise<void> | void) {
    setLoading(id);
    setOpen(false);
    try {
      await action();
      if (id === "copy") {
        toast.success("Copiado al portapapeles", {
          description: `${rows.length} fila${rows.length !== 1 ? "s" : ""} listas para pegar.`,
        });
      } else {
        toast.success("Archivo generado", {
          description: "La descarga comenzó automáticamente.",
        });
      }
    } catch (err) {
      toast.error("Error al exportar", {
        description: err instanceof Error ? err.message : "Intenta de nuevo.",
      });
    } finally {
      setLoading(null);
    }
  }

  const items = [
    { id: "pdf",   label: "PDF",    description: "Documento con cabecera y tabla", icon: <FileText size={14} />, action: () => exportToPdf(props)     },
    { id: "csv",   label: "CSV",    description: "Texto separado por comas",       icon: <FileDown size={14} />, action: () => exportToCsv(props)     },
    { id: "excel", label: "Excel",  description: "Hoja de cálculo .xlsx",          icon: <Sheet    size={14} />, action: () => exportToExcel(props)   },
    { id: "copy",  label: "Copiar", description: "Para pegar en Excel o Sheets",   icon: <Copy     size={14} />, action: () => copyToClipboard(props) },
  ];

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        disabled={loading !== null}
        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all active:scale-95 disabled:opacity-50
          ${open
            ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/[0.12] dark:text-brand-400"
            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]"
          }`}
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        Exportar
      </button>

      {open && pos && (
        <DropdownPortal
          pos={pos}
          rows={rows}
          items={items}
          loading={loading}
          onAction={handle}
          portalRef={portalRef}
        />
      )}
    </div>
  );
}