import { useState, useMemo } from "react";
import { ModulePageHeader } from "../../../components/features/modules/ModulePageHeader";
import { useAudit } from "../../../hooks/useAudit";
import { useAuth } from "../../../context/AuthContext";
import { AuditDrawer } from "../../../components/common/AuditDrawer";
import type { AuditEntry } from "../../../hooks/useAudit";
import {
  Search, Loader2, AlertTriangle, ChevronLeft, ChevronRight,
  Plus, Pencil, Trash2, CheckCheck, RefreshCw, SlidersHorizontal,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("es-EC", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Action config (mini) ─────────────────────────────────────────────────────

const ACTION_META: Record<string, {
  label: string; icon: React.ReactNode;
  bg: string; text: string; border: string; dot: string;
}> = {
  create: {
    label: "Creado",
    icon: <Plus size={11} />,
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  update: {
    label: "Actualizado",
    icon: <Pencil size={11} />,
    bg: "bg-blue-50 dark:bg-blue-500/10",
    text: "text-blue-700 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-500/20",
    dot: "bg-blue-500",
  },
  delete: {
    label: "Eliminado",
    icon: <Trash2 size={11} />,
    bg: "bg-rose-50 dark:bg-rose-500/10",
    text: "text-rose-700 dark:text-rose-400",
    border: "border-rose-200 dark:border-rose-500/20",
    dot: "bg-rose-500",
  },
  complete: {
    label: "Completado",
    icon: <CheckCheck size={11} />,
    bg: "bg-orange-50 dark:bg-orange-500/10",
    text: "text-orange-700 dark:text-orange-400",
    border: "border-orange-200 dark:border-orange-500/20",
    dot: "bg-orange-500",
  },
};

function getActionMeta(action: string) {
  return ACTION_META[action] ?? {
    label: action,
    icon: <RefreshCw size={11} />,
    bg: "bg-gray-100 dark:bg-white/[0.05]",
    text: "text-gray-600 dark:text-gray-400",
    border: "border-gray-200 dark:border-white/[0.08]",
    dot: "bg-gray-400",
  };
}

// ─── Timeline row ─────────────────────────────────────────────────────────────

function TimelineRow({
  entry, isLast, onClick,
}: {
  entry: AuditEntry; isLast: boolean; onClick: () => void;
}) {
  const meta = getActionMeta(entry.action);

  return (
    <div
      onClick={onClick}
      className="group flex cursor-pointer gap-4 rounded-xl px-4 py-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
    >
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center pt-1.5 shrink-0">
        <div className={`h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-[#0d1320] shrink-0 ${meta.dot}`} />
        {!isLast && (
          <div className="mt-1 w-px flex-1 min-h-[32px] bg-gray-200 dark:bg-white/[0.06]" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${meta.bg} ${meta.text} ${meta.border}`}>
              {meta.icon}
              {meta.label}
            </span>
            <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
              {entry.entityId || "—"}
            </span>
          </div>
          <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0 whitespace-nowrap">
            {fmtDate(entry.createdAt)}
          </span>
        </div>

        <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300 leading-snug">
          {entry.description || "Sin descripción"}
        </p>

        {entry.actorName && (
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            por <span className="font-semibold text-gray-500 dark:text-gray-400">{entry.actorName}</span>
          </p>
        )}
      </div>

      {/* Arrow hint */}
      <div className="shrink-0 flex items-center self-center opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight size={14} className="text-gray-400" />
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const ACTIONS = ["create", "update", "delete", "complete"] as const;

export default function MotorHistoryRoute() {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [page, setPage] = useState(1);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  const { data, loading, error } = useAudit(companyId, {
    entity: "maintenances",
    action: filterAction || undefined,
    page,
  });

  // Client-side search filter over current page
  const entries = useMemo(() => {
    if (!data?.data) return [];
    if (!search.trim()) return data.data;
    const q = search.toLowerCase();
    return data.data.filter(
      e =>
        (e.description ?? "").toLowerCase().includes(q) ||
        (e.actorName ?? "").toLowerCase().includes(q) ||
        (e.entityId ?? "").toLowerCase().includes(q)
    );
  }, [data, search]);

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Motores"
        title="Historial de motor"
        subtitle="Registro completo de todos los eventos técnicos sobre motores."
        accent="orange"
      />

      {/* Toolbar */}
      <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por descripción, actor o ID..."
              className="h-10 w-full rounded-xl border border-gray-200 bg-transparent pl-9 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 dark:border-white/[0.08] dark:text-white dark:placeholder:text-gray-500"
            />
          </div>

          {/* Action filter */}
          <div className="relative flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-gray-400 shrink-0" />
            <select
              value={filterAction}
              onChange={e => { setFilterAction(e.target.value); setPage(1); }}
              className="h-10 appearance-none rounded-xl border border-gray-200 bg-white pl-3 pr-8 text-sm text-gray-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300"
            >
              <option value="">Todas las acciones</option>
              {ACTIONS.map(a => (
                <option key={a} value={a}>{getActionMeta(a).label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden dark:border-white/[0.06] dark:bg-white/[0.03]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Historial técnico</h3>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {loading ? "Cargando..." : `${data?.total ?? 0} evento${(data?.total ?? 0) !== 1 ? "s" : ""} registrado${(data?.total ?? 0) !== 1 ? "s" : ""}`}
            </p>
          </div>
          {!loading && totalPages > 1 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Pág. {page} / {totalPages}
            </span>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Cargando historial...</span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <AlertTriangle size={18} className="text-rose-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Error al cargar el historial</p>
            <p className="text-xs text-gray-400 font-mono">{error}</p>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <RefreshCw size={18} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-400 dark:text-gray-500">Sin eventos registrados</p>
          </div>
        )}

        {/* Timeline */}
        {!loading && !error && entries.length > 0 && (
          <div className="px-2 py-3">
            {entries.map((entry, i) => (
              <TimelineRow
                key={entry.id}
                entry={entry}
                isLast={i === entries.length - 1}
                onClick={() => setSelectedEntry(entry)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-white/[0.06]">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-400 dark:hover:bg-white/[0.04]"
            >
              <ChevronLeft size={13} /> Anterior
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={`h-7 w-7 rounded-lg text-xs font-semibold transition
                    ${page === p
                      ? "bg-orange-500 text-white shadow-sm"
                      : "text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05]"
                    }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-400 dark:hover:bg-white/[0.04]"
            >
              Siguiente <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      <AuditDrawer
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </div>
  );
}