// pages/Reports/GroupedExportButton.tsx
// ─────────────────────────────────────────────────────────────────────
// Dropdown de exportación para los módulos AGRUPADOS por placa.
// Replica el look & feel de ExportToolbar pero delega a las funciones
// de groupedExport.ts (que generan PDF/Excel/CSV con secciones por
// grupo, subtotales visuales y gran total).
//
// El componente es autónomo: recibe columns, rows (ya filtrados),
// groupKey, numericCols, palette y arma los grupos internamente.
// ─────────────────────────────────────────────────────────────────────

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
import {
  exportGroupedToPdf,
  exportGroupedToExcel,
  exportGroupedToCsv,
  copyGroupedToClipboard,
  groupRowsByKey,
  type GroupedColumn,
  type GroupedRow,
} from "./groupedExport";

export type GroupedExportButtonProps = {
  title: string;
  subtitle?: string;
  filename: string;
  columns: GroupedColumn[];
  rows: GroupedRow[];
  groupKey: string;
  numericCols: string[];
  palette: string;
};

// ─── Dropdown item ──────────────────────────────────────────────────

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

// ─── Dropdown portal ────────────────────────────────────────────────

type DropdownPos = { top: number; right: number; openUpward: boolean };

function DropdownPortal({
  pos,
  groupCount,
  totalRows,
  items,
  loading,
  onAction,
  portalRef,
}: {
  pos: DropdownPos;
  groupCount: number;
  totalRows: number;
  items: { id: string; label: string; description: string; icon: React.ReactNode; action: () => Promise<void> | void }[];
  loading: string | null;
  onAction: (id: string, action: () => Promise<void> | void) => void;
  portalRef: React.RefObject<HTMLDivElement | null>;
}) {
  const style: React.CSSProperties = {
    position: "fixed",
    right:    pos.right,
    zIndex:   9999,
    width:    224,
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
      <div className="border-b border-gray-100 px-3.5 py-2 dark:border-white/[0.06]">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          Formato de exportación
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {groupCount} grupo{groupCount !== 1 ? "s" : ""} · {totalRows} fila{totalRows !== 1 ? "s" : ""}
        </p>
      </div>

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
    document.body,
  );
}

// ─── Componente principal ───────────────────────────────────────────

export function GroupedExportButton(props: GroupedExportButtonProps) {
  const { title, subtitle, filename, columns, rows, groupKey, numericCols, palette } = props;

  const groups = groupRowsByKey(rows, groupKey);

  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [pos,     setPos]     = useState<DropdownPos | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
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
          description: `${groups.length} grupo${groups.length !== 1 ? "s" : ""} listos para pegar.`,
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

  if (groups.length === 0) return null;

  const items = [
    { id: "pdf",   label: "PDF",    description: "Una sección por vehículo",         icon: <FileText size={14} />, action: () => exportGroupedToPdf({ title, subtitle, filename, columns, groups, numericCols, palette }) },
    { id: "csv",   label: "CSV",    description: "Texto con cabeceras por vehículo", icon: <FileDown size={14} />, action: () => exportGroupedToCsv({ title, filename, columns, groups, numericCols }) },
    { id: "excel", label: "Excel",  description: "Hoja con secciones coloreadas",    icon: <Sheet    size={14} />, action: () => exportGroupedToExcel({ title, filename, columns, groups, numericCols, palette }) },
    { id: "copy",  label: "Copiar", description: "Para pegar en Excel o Sheets",     icon: <Copy     size={14} />, action: () => copyGroupedToClipboard({ title, filename, columns, groups, numericCols }) },
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
          groupCount={groups.length}
          totalRows={rows.length}
          items={items}
          loading={loading}
          onAction={handle}
          portalRef={portalRef}
        />
      )}
    </div>
  );
}