// pages/Mantenimientos/page.tsx
// Light/dark theme completo.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePermissions } from "../../hooks/usePermissions";
import { MantenimientosAgendar } from "./Agendar";
import { MaintenanceListTab } from "./components/MaintenanceListTab";
import {
  Calendar as CalIcon, Wrench,
} from "lucide-react";

type Tab = "agendar" | "lista";

export function MantenimientosPage() {
  const { can } = usePermissions();

  const canSeeAgenda    = can("maintenance", "agenda",    "ver");
  const canSeeExecution = can("maintenance", "execution", "ver");
  const canSeeRecords   = can("maintenance", "records",   "ver");

  // Default: si el user tiene permiso de ver la lista, arrancar ahí. Si no, agenda.
  const [tab, setTab] = useState<Tab>(() => {
    if (canSeeExecution || canSeeRecords) return "lista";
    return "agendar";
  });

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; show: boolean }> = [
    { id: "lista",  label: "Todos los mantenimientos",  icon: <Wrench size={14} />, show: canSeeExecution || canSeeRecords },
    { id: "agendar",label: "Agendar",                  icon: <CalIcon size={14} />, show: canSeeAgenda    },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] -mt-2">

      {/* Header: título + tabs */}
      <div className="flex items-center justify-between gap-3 px-1 pb-2" style={{ marginBottom: 10 }}>
        <h1 className="text-lg font-bold text-gray-800 dark:text-white">Mantenimiento</h1>

        <div className="flex gap-1 overflow-x-auto">
          {tabs.filter((t) => t.show).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 border-b-2 transition whitespace-nowrap ${
                tab === t.id
                  ? "border-violet-500 text-violet-600 dark:text-violet-300"
                  : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 min-h-0 overflow-hidden">
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
              <MaintenanceListTab title="Mantenimientos" />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default MantenimientosPage;