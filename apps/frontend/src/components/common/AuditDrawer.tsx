import { useEffect, useRef } from "react";
import {
  X, User, Calendar, Tag, Hash, FileText,
  Plus, Pencil, Trash2, CheckCheck, RefreshCw, Info,
} from "lucide-react";
import type { AuditEntry } from "../../hooks/useAudit";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-EC", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Action config ────────────────────────────────────────────────────────────

type ActionConfig = {
  label: string;
  icon: React.ReactNode;
  bg: string;
  text: string;
  border: string;
  dot: string;
};

function getActionConfig(action: string): ActionConfig {
  switch (action) {
    case "create":
      return {
        label: "Creado",
        icon: <Plus size={12} />,
        bg: "bg-emerald-50 dark:bg-emerald-500/10",
        text: "text-emerald-700 dark:text-emerald-400",
        border: "border-emerald-200 dark:border-emerald-500/20",
        dot: "bg-emerald-500",
      };
    case "update":
      return {
        label: "Actualizado",
        icon: <Pencil size={12} />,
        bg: "bg-blue-50 dark:bg-blue-500/10",
        text: "text-blue-700 dark:text-blue-400",
        border: "border-blue-200 dark:border-blue-500/20",
        dot: "bg-blue-500",
      };
    case "delete":
      return {
        label: "Eliminado",
        icon: <Trash2 size={12} />,
        bg: "bg-rose-50 dark:bg-rose-500/10",
        text: "text-rose-700 dark:text-rose-400",
        border: "border-rose-200 dark:border-rose-500/20",
        dot: "bg-rose-500",
      };
    case "complete":
      return {
        label: "Completado",
        icon: <CheckCheck size={12} />,
        bg: "bg-orange-50 dark:bg-orange-500/10",
        text: "text-orange-700 dark:text-orange-400",
        border: "border-orange-200 dark:border-orange-500/20",
        dot: "bg-orange-500",
      };
    default:
      return {
        label: action,
        icon: <RefreshCw size={12} />,
        bg: "bg-gray-100 dark:bg-white/[0.05]",
        text: "text-gray-600 dark:text-gray-400",
        border: "border-gray-200 dark:border-white/[0.08]",
        dot: "bg-gray-400",
      };
  }
}

// ─── Metadata renderer ────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  maintenanceTitle: "Trabajo",
  kind: "Tipo",
  priority: "Prioridad",
  status: "Estado",
  assetId: "ID Motor",
  assetName: "Motor",
  assetCode: "Código",
  scheduledDate: "Fecha inicio",
  dueDate: "Fecha límite",
  completedDate: "Fecha completado",
  technician: "Técnico",
  cost: "Costo",
  notes: "Notas",
};

function MetadataBlock({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 px-4 py-3 dark:border-white/[0.08]">
        <Info size={13} className="text-gray-300 dark:text-gray-600" />
        <span className="text-xs text-gray-400 dark:text-gray-500">Sin metadatos adicionales</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {Object.entries(metadata).map(([key, value]) => (
        <div
          key={key}
          className="grid grid-cols-[140px_1fr] gap-2 rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-2.5 dark:border-white/[0.05] dark:bg-white/[0.03]"
        >
          <span className="truncate text-xs font-semibold text-gray-400 dark:text-gray-500 self-start pt-0.5">
            {FIELD_LABELS[key] ?? key}
          </span>
          <span className="text-xs text-gray-700 dark:text-gray-300 break-words">
            {value === null || value === undefined
              ? <span className="italic text-gray-300 dark:text-gray-600">—</span>
              : typeof value === "object"
              ? <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">{JSON.stringify(value, null, 2)}</pre>
              : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AuditDrawerProps {
  entry: AuditEntry | null;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AuditDrawer({ entry, onClose }: AuditDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isOpen = entry !== null;

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const cfg = entry ? getActionConfig(entry.action) : null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[39] bg-black/20 transition-opacity duration-300
            ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        style={{ top: "var(--header-height, 64px)" }}
      />

      {/* Drawer */}
      <div
        ref={panelRef}
        className={`fixed right-0 z-[40] flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out dark:bg-[#0d1320]
            ${isOpen ? "translate-x-0 border-l border-gray-200 dark:border-white/[0.06]" : "translate-x-[110%]"}`}
        style={{ 
            top: "var(--header-height, 64px)", 
            height: "calc(100vh - var(--header-height, 64px))" 
        }}
        >
        {entry && cfg && (
          <>
            {/* Top accent line */}
            <div className={`h-0.5 w-full ${cfg.dot}`} />

            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-6 py-5 dark:border-white/[0.06]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                    {cfg.icon}
                    {cfg.label}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">#{entry.id}</span>
                </div>
                <h2 className="mt-2 text-sm font-bold leading-snug text-gray-800 dark:text-white">
                  {entry.description || "Sin descripción"}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.08] dark:hover:text-gray-300"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* Info pills */}
              <div className="grid grid-cols-1 gap-2.5">
                {[
                  {
                    icon: <User size={13} className="text-gray-400" />,
                    label: "Actor",
                    value: entry.actorName || "—",
                  },
                  {
                    icon: <Calendar size={13} className="text-gray-400" />,
                    label: "Fecha",
                    value: fmtDateTime(entry.createdAt),
                  },
                  {
                    icon: <Tag size={13} className="text-gray-400" />,
                    label: "Entidad",
                    value: entry.entity,
                  },
                  {
                    icon: <Hash size={13} className="text-gray-400" />,
                    label: "ID de entidad",
                    value: entry.entityId || "—",
                  },
                ].map(({ icon, label, value }) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-2.5 dark:border-white/[0.05] dark:bg-white/[0.03]"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-white/[0.06]">
                      {icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</p>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Metadata */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <FileText size={13} className="text-gray-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Detalle del cambio
                  </h3>
                </div>
                <MetadataBlock metadata={entry.metadata as Record<string, unknown> | null} />
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]"
              >
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}