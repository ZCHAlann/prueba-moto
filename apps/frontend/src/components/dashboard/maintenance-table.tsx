import { useState, useMemo, lazy, Suspense } from "react";
import { useMaintenances } from "../../hooks/useMaintenances";
import { useAssets } from "../../hooks/useAssets";
import { Search, Loader2, Wrench, Zap, Clock, AlertTriangle, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";

// Lazy-load del modal real de mantenimiento
const MaintenanceFormModal = lazy(() =>
  import("../../pages/Mantenimientos/components/MaintenanceFormModal").then((m) => ({ default: m.MaintenanceFormModal ?? m.default }))
);

// ─── Tipos ───────────────────────────────────────────────────────────────────

type TabKey = "todos" | "Programado" | "Correctivo" | "En proceso" | "Correccion";

const TABS: { key: TabKey; label: string; icon: React.ReactNode; color: string; activeColor: string }[] = [
  {
    key: "todos",
    label: "Todos",
    icon: <Wrench size={13} />,
    color: "text-gray-500 dark:text-gray-400",
    activeColor: "border-violet-500 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10",
  },
  {
    key: "Programado",
    label: "Programados",
    icon: <Clock size={13} />,
    color: "text-gray-500 dark:text-gray-400",
    activeColor: "border-violet-500 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10",
  },
  {
    key: "Correctivo",
    label: "Correctivos",
    icon: <Zap size={13} />,
    color: "text-gray-500 dark:text-gray-400",
    activeColor: "border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10",
  },
  {
    key: "En proceso",
    label: "En proceso",
    icon: <AlertTriangle size={13} />,
    color: "text-gray-500 dark:text-gray-400",
    activeColor: "border-sky-500 text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10",
  },
  {
    key: "Correccion",
    label: "Corrección",
    icon: <RotateCcw size={13} />,
    color: "text-gray-500 dark:text-gray-400",
    activeColor: "border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
  },
];

// ─── Badge de estado ─────────────────────────────────────────────────────────

function StatusBadge({ status, type }: { status: string; type?: string }) {
  if (status === "En proceso" || status === "En curso") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 dark:bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
        En proceso
      </span>
    );
  }
  if (status === "Programado") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300">
        Programado
      </span>
    );
  }
  if (status === "Correccion" || status === "Corrección") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
        <RotateCcw size={9} />
        Corrección
      </span>
    );
  }
  if (status === "Completado") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
        Completado
      </span>
    );
  }
  if (status === "Cancelado") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-gray-500 dark:text-gray-400">
        Cancelado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-gray-600 dark:text-gray-300">
      {status}
    </span>
  );
}

function TypePill({ type }: { type: string }) {
  if (type === "Correctivo") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-orange-100 dark:bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:text-orange-300">
        <Zap size={9} /> Correctivo
      </span>
    );
  }
  if (type === "Lavada") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-sky-100 dark:bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
        Lavada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 dark:bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
      <Clock size={9} /> Programado
    </span>
  );
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 8;

// ─── Componente principal ────────────────────────────────────────────────────

export function MaintenanceTable() {
  const { maintenances, loading: hookLoading } = useMaintenances();
  const { assets } = useAssets();

  const [search, setSearch]       = useState("");
  const [tab, setTab]             = useState<TabKey>("todos");
  const [page, setPage]           = useState(1);
  // Mantenimiento seleccionado para abrir el modal completo
  const [editing, setEditing]     = useState<typeof maintenances[0] | null>(null);

  const assetLabel = (assetId: string) => {
    const a = assets.find((x) => x.id === assetId);
    return a?.plate || a?.name || assetId;
  };

  // ── Filtrado ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    return maintenances
      .filter((m) => m.status !== "Completado" && m.status !== "Cancelado")
      .filter((m) => {
        if (tab === "todos") return true;
        if (tab === "En proceso") return m.status === "En proceso" || m.status === "En curso";
        if (tab === "Correccion") return m.status === "Correccion" || m.status === "Corrección";
        if (tab === "Programado") return m.type === "Programado" && m.status === "Programado";
        if (tab === "Correctivo") return m.type === "Correctivo";
        return true;
      })
      .filter((m) =>
        !q ||
        (m.title ?? "").toLowerCase().includes(q) ||
        assetLabel(m.assetId).toLowerCase().includes(q) ||
        (m.kind ?? m.type ?? "").toLowerCase().includes(q)
      );
  }, [maintenances, search, tab, assets]);

  // ── Conteos por tab ────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const active = maintenances.filter((m) => m.status !== "Completado" && m.status !== "Cancelado");
    return {
      todos:       active.length,
      Programado:  active.filter((m) => m.type === "Programado" && m.status === "Programado").length,
      Correctivo:  active.filter((m) => m.type === "Correctivo").length,
      "En proceso": active.filter((m) => m.status === "En proceso" || m.status === "En curso").length,
      Correccion:  active.filter((m) => m.status === "Correccion" || m.status === "Corrección").length,
    };
  }, [maintenances]);

  // ── Paginación ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageItems  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleTabChange = (key: TabKey) => {
    setTab(key);
    setPage(1);
  };

  const handleSearchChange = (q: string) => {
    setSearch(q);
    setPage(1);
  };

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-white/[0.05] bg-white dark:bg-white/[0.02] shadow-sm">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 px-4 pt-4 sm:px-6 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Próximos mantenimientos
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Buscar..."
                className="h-8 w-44 rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-100 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300 dark:placeholder-gray-500 dark:focus:border-violet-500 transition-all"
              />
            </div>
          </div>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div className="mt-3 flex gap-1 overflow-x-auto px-4 sm:px-6 border-b border-gray-100 dark:border-white/[0.05]">
          {TABS.map((t) => {
            const count = counts[t.key as keyof typeof counts] ?? 0;
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => handleTabChange(t.key)}
                className={`
                  inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-xs font-semibold transition-all
                  ${isActive
                    ? `${t.activeColor} border-current`
                    : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  }
                `}
              >
                {t.icon}
                {t.label}
                {count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                    isActive
                      ? "bg-current/10 text-current"
                      : "bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Tabla ──────────────────────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/[0.05]">
                <th className="px-4 sm:px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Unidad</th>
                <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Servicio</th>
                <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 hidden sm:table-cell">Tipo</th>
                <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 hidden md:table-cell">Fecha</th>
                <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Estado</th>
                <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
              {hookLoading ? (
                <tr>
                  <td className="py-12 text-center" colSpan={6}>
                    <div className="flex items-center justify-center gap-2 text-gray-400">
                      <Loader2 size={14} className="animate-spin" />
                      <span className="text-sm">Cargando...</span>
                    </div>
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td className="py-12 text-center" colSpan={6}>
                    <p className="text-sm font-medium text-gray-400 dark:text-gray-500">
                      {search ? "Sin resultados" : "Sin mantenimientos en esta categoría"}
                    </p>
                    {!search && (
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        Los registros aparecen al programarse desde el módulo de mantenimiento.
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                pageItems.map((m) => (
                  <tr
                    key={m.id}
                    className="group hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    {/* Unidad */}
                    <td className="px-4 sm:px-6 py-3">
                      <span className="font-semibold text-sm text-gray-800 dark:text-white/90">
                        {assetLabel(m.assetId)}
                      </span>
                    </td>

                    {/* Servicio */}
                    <td className="px-3 py-3 max-w-[180px]">
                      <p className="text-sm text-gray-700 dark:text-gray-200 truncate">{m.title}</p>
                    </td>

                    {/* Tipo */}
                    <td className="px-3 py-3 hidden sm:table-cell">
                      <TypePill type={m.kind ?? m.type ?? ""} />
                    </td>

                    {/* Fecha */}
                    <td className="px-3 py-3 hidden md:table-cell text-sm text-gray-400 dark:text-gray-500 font-mono tabular-nums">
                      {m.scheduledDate ?? m.dueDate ?? "—"}
                    </td>

                    {/* Estado */}
                    <td className="px-3 py-3">
                      <StatusBadge status={m.status} type={m.kind ?? m.type} />
                    </td>

                    {/* Acción */}
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setEditing(m)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition"
                      >
                        <Wrench size={11} />
                        {(m.status === "En proceso" || m.status === "En curso")
                          ? "Finalizar"
                          : m.status === "Correccion" || m.status === "Corrección"
                          ? "Corregir"
                          : "Ver / editar"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Paginación ─────────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 dark:border-white/[0.05] px-4 sm:px-6 py-3">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {filtered.length} resultado{filtered.length !== 1 ? "s" : ""} ·{" "}
              página {safePage} de {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft size={13} />
              </button>

              {/* Números de página: muestra hasta 5 centrados en la actual */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  if (totalPages <= 5) return true;
                  return p === 1 || p === totalPages || Math.abs(p - safePage) <= 1;
                })
                .reduce<(number | "…")[]>((acc, p, i, arr) => {
                  if (i > 0 && typeof arr[i - 1] === "number" && (p as number) - (arr[i - 1] as number) > 1) {
                    acc.push("…");
                  }
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p as number)}
                      className={`flex h-7 min-w-[28px] items-center justify-center rounded-md px-1.5 text-xs font-semibold transition ${
                        safePage === p
                          ? "bg-violet-600 text-white"
                          : "border border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal real de mantenimiento ────────────────────────────────────── */}
      {editing && (
        <Suspense fallback={null}>
          <MaintenanceFormModal
            open={!!editing}
            maintenance={editing as any}
            onClose={() => setEditing(null)}
          />
        </Suspense>
      )}
    </>
  );
}