import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { useAlertsBell } from "../../context/AlertsBellContext";
import type { ApiAlert, AlertSeverity } from "../../hooks/useAlerts";
import { Bell, AlertTriangle, CalendarClock, Wrench, FileEdit, CheckCircle2, X } from "lucide-react";
import { fmtDateShortEc } from "@/lib/datetime";

/* ── Helpers ──────────────────────────────────────────────────────────── */

const SEVERITY_BG: Record<AlertSeverity, string> = {
  Alta:  "bg-rose-500",
  Media: "bg-amber-500",
  Baja:  "bg-blue-500",
};

const SEVERITY_RING: Record<AlertSeverity, string> = {
  Alta:  "ring-rose-200 dark:ring-rose-500/40",
  Media: "ring-amber-200 dark:ring-amber-500/40",
  Baja:  "ring-blue-200 dark:ring-blue-500/40",
};

const TYPE_ICON: Record<string, React.ElementType> = {
  Vencimiento:   CalendarClock,
  Mantenimiento: Wrench,
  Manual:        FileEdit,
};

function fmtRelative(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min  = Math.round(diff / 60_000);
  if (min < 1)    return "ahora";
  if (min < 60)   return `hace ${min} min`;
  const hr = Math.round(min / 60);
  if (hr  < 24)   return `hace ${hr} h`;
  const days = Math.round(hr / 24);
  if (days < 7)   return `hace ${days} d`;
  return fmtDateShortEc(iso);
}

/* ── Componente ───────────────────────────────────────────────────────── */

export default function NotificationDropdown() {
  const { alerts, loading, openCount, followUpCount, refresh } = useAlertsBell();
  const [isOpen, setIsOpen] = useState(false);

  // Refrescar al abrir (para que la lista esté fresca)
  useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen, refresh]);

  const recent = useMemo(
    () =>
      [...alerts]
        .filter((a) => a.status === "Abierta" || a.status === "En seguimiento")
        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
        .slice(0, 8),
    [alerts],
  );

  const showPing = openCount > 0;

  return (
    <div className="relative">
      <button
        className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full dropdown-toggle hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Notificaciones"
      >
        {showPing && (
          <span className="absolute right-1 top-1 z-10 h-2 w-2 rounded-full bg-rose-500">
            <span className="absolute inline-flex w-full h-full bg-rose-500 rounded-full opacity-75 animate-ping" />
          </span>
        )}
        {!showPing && openCount === 0 && !loading && (
          <span className="absolute right-2 top-2 z-10 h-2 w-2 rounded-full bg-emerald-500" />
        )}

        {/* Badge numérico */}
        {openCount > 0 && (
          <span className="absolute -right-1 -top-1 z-20 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm shadow-rose-500/40 ring-2 ring-white dark:ring-gray-900">
            {openCount > 99 ? "99+" : openCount}
          </span>
        )}

        <Bell size={20} strokeWidth={1.7} className="fill-current" />
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute -right-[240px] mt-[17px] flex h-[480px] w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[361px] lg:right-0"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Notificaciones
            </h5>
            <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
              {loading
                ? "Cargando..."
                : openCount === 0
                ? "Sin alertas abiertas"
                : `${openCount} abierta${openCount !== 1 ? "s" : ""} · ${followUpCount} en seguimiento`}
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-500 transition dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <ul className="flex flex-col h-auto overflow-y-auto custom-scrollbar">
          {loading && alerts.length === 0 ? (
            <li className="px-4 py-8 text-center text-xs text-gray-400 dark:text-gray-500">
              Cargando alertas...
            </li>
          ) : recent.length === 0 ? (
            <li className="px-4 py-10 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10">
                <CheckCircle2 size={18} />
              </div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Todo al día
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                No tienes alertas pendientes.
              </p>
            </li>
          ) : (
            recent.map((a: ApiAlert) => {
              const TypeIcon = TYPE_ICON[a.type] ?? AlertTriangle;
              const isOpenA  = a.status === "Abierta";
              return (
                <li key={a.id}>
                  <DropdownItem
                    onItemClick={() => setIsOpen(false)}
                    className="flex gap-3 rounded-lg border-b border-gray-100 p-3 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/5"
                    to="/alertas"
                  >
                    <span
                      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ${SEVERITY_RING[a.severity]}`}
                    >
                      <TypeIcon size={16} className="text-gray-600 dark:text-gray-300" />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-gray-900 ${SEVERITY_BG[a.severity]}`}
                      />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="mb-0.5 flex items-center gap-2 text-theme-sm text-gray-800 dark:text-white/90">
                        <span className="truncate font-semibold">{a.title || "Alerta sin título"}</span>
                        {isOpenA && (
                          <span className="inline-flex shrink-0 items-center rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                            Abierta
                          </span>
                        )}
                        {!isOpenA && a.status === "En seguimiento" && (
                          <span className="inline-flex shrink-0 items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
                            Seguimiento
                          </span>
                        )}
                      </span>

                      <span className="line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                        {a.notes || a.type} · severidad {a.severity}
                      </span>

                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                        {a.dueDate && (
                          <>
                            <CalendarClock size={10} />
                            <span>vence {fmtRelative(a.dueDate)}</span>
                          </>
                        )}
                        {!a.dueDate && <span>{fmtRelative(a.createdAt)}</span>}
                      </span>
                    </span>
                  </DropdownItem>
                </li>
              );
            })
          )}
        </ul>

        <Link
          to="/alertas"
          onClick={() => setIsOpen(false)}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          Ver todas las alertas
          {openCount > 0 && (
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {openCount > 99 ? "99+" : openCount}
            </span>
          )}
        </Link>
      </Dropdown>
    </div>
  );
}
