import { useMemo } from "react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePermissions } from "../../hooks/usePermissions";
import { MantenimientosAgendar } from "./Agendar";
import { MaintenanceListTab } from "./components/MaintenanceListTab";
// jul 2026 — MaintenanceReauthInbox y useMaintenanceReauths se importaban
// para el flujo viejo de reautorización manual. Ese flujo está deprecado
// (lo reemplaza el cron de auto-reassign). Los dejamos comentados para
// rollback rápido en caso de emergencia: descomentar + restaurar el tab
// "reauths" en la lista de tabs y la rama `tab === "reauths"` en el render.
// import { MaintenanceReauthInbox } from "./components/MaintenanceReauthInbox";
import {
  Calendar as CalIcon, Wrench, AlertTriangle, History,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  useMaintenancesList,
  // useMaintenanceReauths,
  isMaintenanceOverdue,
} from "../../hooks/useMaintenancesV2";

type Tab = "agendar" | "lista" | "historial";

export function MantenimientosPage() {
  const { can } = usePermissions();
  const { session } = useAuth();
  const meRole = session?.role ?? "";

  const canSeeAgenda    = can("mantenimiento", "agenda",    "ver");
  const canSeeExecution = can("mantenimiento", "execution", "ver");
  const canSeeRecords   = can("mantenimiento", "records",   "ver");
  // jul 2026 — El flujo de reautorización manual se reemplaza por el
  // cron de auto-reassign (`startMaintenanceAutoReassignCron`). El
  // operador ya no necesita pedir permiso: a las 21:00 EC el sistema
  // mueve los pendientes automáticamente. Por eso ocultamos el tab y el
  // badge. La variable `canSeeReauths` se deja comentada por si hay
  // que restaurar en una emergencia; pero el `tab` ya no se incluye.
  // const canSeeReauths    = can("mantenimiento", "reautorizaciones", "ver");
  // const canApproveReauth = can("mantenimiento", "reautorizaciones", "editar");
  // jul 2026 — Historial de mantenimientos CERRADOS. Granular: el operador
  // no entra acá por default (la lista principal muestra lo pendiente).
  // Owner/Admin lo ven por bypass de role; el resto necesita el permiso
  // explícito `mantenimiento.historial.ver`.
  const isOwnerOrAdmin   = meRole === "owner_empresa" || meRole === "admin_empresa";
  const canSeeHistorial  = isOwnerOrAdmin || can("mantenimiento", "historial", "ver");

  // Banner de atrasados: se muestra si el user logueado es operador
  // (o cualquier rol que opere mantenimientos) y tiene AL MENOS UN
  // mantenimiento con status === 'Atrasado' asignado a él.
  const isOperatorLike = meRole === "operador" || meRole === "supervisor";
  const { data: mineData } = useMaintenancesList(
    { scope: "mine" },
    { enabled: isOperatorLike },
  );
  const myOverdueCount = useMemo(() => {
    const items = mineData?.data ?? [];
    return items.filter((m) => isMaintenanceOverdue(m) && m.status !== "Completado").length;
  }, [mineData]);

  // jun 2026 — contador de pendientes para el badge del tab.
  // jul 2026 — El tab de reauths ya no se muestra (reemplazado por el
  // cron de auto-reassign). Dejamos la query comentada para rollback
  // rápido en caso de emergencia: descomentar + restaurar el `tab`
  // correspondiente en la lista de tabs.
  // const { data: reauthsPendientes } = useMaintenanceReauths({ status: "Pendiente" });
  // const pendingCount = reauthsPendientes?.length ?? 0;

  // Default: arranca en la lista principal. Si no tiene permiso, va a
  // la agenda.
  const [tab, setTab] = useState<Tab>(() => {
    if (canSeeExecution || canSeeRecords) return "lista";
    return "agendar";
  });

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; show: boolean; badge?: number }> = [
    { id: "lista",   label: "Todos los mantenimientos",  icon: <Wrench size={14} />, show: canSeeExecution || canSeeRecords },
    { id: "agendar", label: "Agendar",                  icon: <CalIcon size={14} />, show: canSeeAgenda },
    // jul 2026 — Tab dedicada al historial de mantenimientos CERRADOS.
    // Permission gate: admin/owner lo ven por role, el resto necesita
    // el permiso granular `mantenimiento.historial.ver`. La lista interna
    // se renderiza con mode="historial" (subTab fijo en "Completado").
    { id: "historial", label: "Historial (cerrados)",   icon: <History size={14} />, show: canSeeHistorial },
  ];

  return (
    <div className="flex flex-col min-h-[calc(100vh-7rem)] -mt-2">

      {/* Header: título + tabs */}
      <div className="flex items-center justify-between gap-3 px-1 pb-2" style={{ marginBottom: 10 }}>
        <h1 className="text-lg font-bold text-gray-800 dark:text-white">Mantenimiento</h1>

        <div className="flex gap-1 overflow-x-auto">
          {tabs.filter((t) => t.show).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 border-b-2 transition whitespace-nowrap ${
                tab === t.id
                  ? "border-violet-500 text-violet-600 dark:text-violet-300"
                  : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              }`}
            >
              {t.icon}
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className="ml-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Banner de pendientes vencidos para el operador:
          visible solo si tiene ≥1 mantenimiento con fecha pasada asignado
          a él. jul 2026 — ya NO dice "Hacé clic en Reautorizaciones": el
          flujo viejo está reemplazado por el cron de auto-reassign
          (21:00 EC). El banner ahora es solo informativo. */}
      {isOperatorLike && myOverdueCount > 0 && (
        <div
          role="alert"
          className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-amber-800 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div className="flex-1 text-xs leading-snug">
            <span className="font-semibold">Tenés {myOverdueCount} mantenimiento{myOverdueCount !== 1 ? "s" : ""} con fecha vencida.</span>{" "}
            Si no se completan hoy, el sistema los va a reagendar automáticamente para mañana a las 21:00 EC.
          </div>
        </div>
      )}

      {/* Contenido */}
      <div className="flex-1 min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="h-full"
          >
            {tab === "agendar" && canSeeAgenda && <MantenimientosAgendar />}
            {tab === "lista" && (canSeeExecution || canSeeRecords) && (
              <MaintenanceListTab title="Mantenimientos" mode="active" />
            )}
            {/* jul 2026 — Tab reauths oculto: el flujo de reautorización
                manual se reemplazó por el cron de auto-reassign. La línea
                queda comentada para rollback rápido. */}
            {/* {tab === "reauths" && canSeeReauths && <MaintenanceReauthInbox />} */}
            {/* jul 2026 — Tab Historial: solo mantenimientos CERRADOS.
                La lista interna fija subTab="Completado" via el prop mode. */}
            {tab === "historial" && canSeeHistorial && (
              <MaintenanceListTab title="Historial de mantenimientos cerrados" mode="historial" />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default MantenimientosPage;