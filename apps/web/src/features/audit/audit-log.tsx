"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { useAudit, type AuditFilters, type AuditEntry } from "@/hooks/useAudit";
import { useState, useCallback } from "react";

/* ─── Constantes de filtros ──────────────────────────────────────────────── */
const ENTITY_OPTIONS = [
  { value: "", label: "Todas las entidades" },
  { value: "assets",        label: "Activos" },
  { value: "drivers",       label: "Conductores" },
  { value: "maintenances",  label: "Mantenimientos" },
  { value: "fuel",          label: "Combustible" },
  { value: "alerts",        label: "Alertas" },
  { value: "checklists",    label: "Checklists" },
  { value: "assignments",   label: "Asignaciones" },
  { value: "inventory",     label: "Inventario" },
  { value: "sites",         label: "Sedes" },
  { value: "garages",       label: "Garajes" },
  { value: "ac_units",      label: "Unidades AC" },
  { value: "users",         label: "Usuarios" },
  { value: "settings",      label: "Configuración" },
];

const ACTION_OPTIONS = [
  { value: "",        label: "Todas las acciones" },
  { value: "create",  label: "Creación" },
  { value: "update",  label: "Actualización" },
  { value: "delete",  label: "Eliminación" },
  { value: "complete", label: "Completado" },
  { value: "finalize", label: "Finalizado" },
];

const PAGE_SIZE = 20;

/* ─── Badge de acción ────────────────────────────────────────────────────── */
const actionStyles: Record<string, string> = {
  create:   "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  update:   "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  delete:   "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  complete: "bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400",
  finalize: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
};

function ActionBadge({ action }: { action: string }) {
  const style = actionStyles[action] ?? "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
  const labels: Record<string, string> = {
    create: "Creación", update: "Actualización", delete: "Eliminación",
    complete: "Completado", finalize: "Finalizado",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {labels[action] ?? action}
    </span>
  );
}

/* ─── Skeleton row ───────────────────────────────────────────────────────── */
function SkRow() {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      {[160, 80, 80, 200, 100, 120].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div className={`h-3.5 w-[${w}px] animate-pulse rounded bg-gray-200 dark:bg-white/[0.06]`} />
        </td>
      ))}
    </tr>
  );
}

/* ─── Componente principal ───────────────────────────────────────────────── */
export function AuditLog() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;

  /* Filtros locales */
  const [entity, setEntity]   = useState("");
  const [action, setAction]   = useState("");
  const [from, setFrom]       = useState("");
  const [to, setTo]           = useState("");
  const [page, setPage]       = useState(1);

  /* Filtros aplicados — se pasan al hook solo al buscar */
  const [applied, setApplied] = useState<AuditFilters>({ page: 1 });

  const { data, loading, error } = useAudit(companyId, applied);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  /* Aplicar filtros */
  const handleSearch = useCallback(() => {
    const f: AuditFilters = { page: 1 };
    if (entity) f.entity = entity;
    if (action) f.action = action;
    if (from)   f.from   = from;
    if (to)     f.to     = to;
    setPage(1);
    setApplied(f);
  }, [entity, action, from, to]);

  /* Limpiar */
  const handleClear = useCallback(() => {
    setEntity(""); setAction(""); setFrom(""); setTo("");
    setPage(1);
    setApplied({ page: 1 });
  }, []);

  /* Paginación */
  const goToPage = useCallback((p: number) => {
    setPage(p);
    setApplied(prev => ({ ...prev, page: p }));
  }, []);

  /* Formatear fecha */
  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("es-EC", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const entityLabel = (e: string) =>
    ENTITY_OPTIONS.find(o => o.value === e)?.label ?? e;

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Trazabilidad"
        title="Auditoría"
        subtitle="Registro completo de cambios y acciones en la plataforma."
        accent="rose"
      />

      {/* ── Filtros ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-100 dark:bg-white/[0.03]">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">

          {/* Entidad */}
          <div>
            <label className="mb-1.5 block text-theme-xs font-medium text-gray-700 dark:text-gray-400">
              Entidad
            </label>
            <select
              value={entity}
              onChange={e => setEntity(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:text-white/90"
            >
              {ENTITY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Acción */}
          <div>
            <label className="mb-1.5 block text-theme-xs font-medium text-gray-700 dark:text-gray-400">
              Acción
            </label>
            <select
              value={action}
              onChange={e => setAction(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:text-white/90"
            >
              {ACTION_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Desde */}
          <div>
            <label className="mb-1.5 block text-theme-xs font-medium text-gray-700 dark:text-gray-400">
              Desde
            </label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:text-white/90"
            />
          </div>

          {/* Hasta */}
          <div>
            <label className="mb-1.5 block text-theme-xs font-medium text-gray-700 dark:text-gray-400">
              Hasta
            </label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:text-white/90"
            />
          </div>

          {/* Botones */}
          <div className="flex items-end gap-2">
            <button
              onClick={handleSearch}
              className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 transition-colors"
            >
              Buscar
            </button>
            <button
              onClick={handleClear}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.04] focus:outline-none transition-colors"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Contador de resultados */}
        {data && (
          <p className="mt-3 text-theme-xs text-gray-400">
            {data.total.toLocaleString("es-EC")} registro{data.total !== 1 ? "s" : ""} encontrado{data.total !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* ── Tabla ── */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-100 dark:bg-white/[0.03] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Descripción</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Entidad</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Acción</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">ID afectado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Actor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <SkRow key={i} />)
                : error
                ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-red-500">{error}</td>
                  </tr>
                )
                : !data?.data.length
                ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                      No hay registros para los filtros seleccionados.
                    </td>
                  </tr>
                )
                : data.data.map((entry: AuditEntry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-xs">
                      <p className="truncate">{entry.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-600 dark:text-gray-400 capitalize">
                        {entityLabel(entry.entity)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                        {entry.entityId}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {entry.actorName}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {formatDate(entry.createdAt)}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        {/* ── Paginación ── */}
        {data && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 px-4 py-3">
            <p className="text-theme-xs text-gray-400">
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Anterior
              </button>

              {/* Páginas visibles: máximo 5 */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                return (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      p === page
                        ? "bg-brand-500 text-white"
                        : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}