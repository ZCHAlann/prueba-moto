// pages/Mantenimientos/page.tsx
// Página HUB del módulo de Mantenimientos (modelo unificado 0006).
// Layout compacto: solo título + tabs. El calendario toma todo el alto.
// Sub-tabs:
//   1. Agendar                          (maintenance.agenda.ver)
//   2. Preventivo y correctivo          (maintenance.execution.ver)
//   3. Primordiales
//        - Bombas e inyectores          (maintenance.records.ver)
//        - Motores                      (maintenance.records.ver)
//   4. Aceites
//        - Cambios de aceite            (maintenance.records.ver)
//
// NOTA: Talleres y Proveedores NO viven aquí — están en /gestion/talleres y
// /gestion/proveedores. Notificaciones NO aparece como submódulo (es
// transversal, está en la campanita del header).

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePermissions } from "../../hooks/usePermissions";
import { MantenimientosAgendar } from "./Agendar";
import { MaintenanceListTab } from "./components/MaintenanceListTab";
import {
  Calendar as CalIcon, Wrench, Cog, Droplet, AlertTriangle,
} from "lucide-react";

type Tab = 'agendar' | 'preventivo' | 'primordial-bombas' | 'primordial-motores' | 'aceite-cambios';

export function MantenimientosPage() {
  const { can } = usePermissions();

  const canSeeAgenda     = can("maintenance", "agenda",     "ver");
  const canSeeExecution  = can("maintenance", "execution",  "ver");
  const canSeeRecords    = can("maintenance", "records",    "ver");

  // Default tab según permisos
  const [tab, setTab] = useState<Tab>(() => {
    if (canSeeAgenda)    return "agendar";
    if (canSeeExecution) return "preventivo";
    if (canSeeRecords)   return "primordial-bombas";
    return "agendar";
  });

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; show: boolean }> = [
    { id: "agendar",              label: "Agendar",                     icon: <CalIcon size={14} />,         show: canSeeAgenda    },
    { id: "preventivo",           label: "Preventivo y correctivo",     icon: <Wrench size={14} />,         show: canSeeExecution },
    { id: "primordial-bombas",    label: "Primordial · Bombas",         icon: <AlertTriangle size={14} />,  show: canSeeRecords   },
    { id: "primordial-motores",   label: "Primordial · Motores",        icon: <Cog size={14} />,            show: canSeeRecords   },
    { id: "aceite-cambios",       label: "Aceites · Cambios",           icon: <Droplet size={14} />,        show: canSeeRecords   },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] -mt-2">

      {/* Header compacto: solo título + tabs en una línea */}
      <div className="flex items-center justify-between gap-3 px-1 pb-2" style={{ marginBottom: 10 }}>
        <h1 className="text-lg font-bold text-white">Mantenimiento</h1>

        <div className="flex gap-1 overflow-x-auto">
          {tabs.filter((t) => t.show).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 border-b-2 transition whitespace-nowrap ${
                tab === t.id
                  ? "border-violet-500 text-violet-300"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido full-height con animación de tabs (motion.dev / framer-motion) */}
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
            {tab === "agendar"              && canSeeAgenda    && <MantenimientosAgendar />}
            {tab === "preventivo"           && canSeeExecution && <MaintenanceListTab title="Preventivo y correctivo" />}
            {tab === "primordial-bombas"    && canSeeRecords   && <MaintenanceListTab categories={["Primordial:Bombas"]}  title="Primordial · Bombas e inyectores" />}
            {tab === "primordial-motores"   && canSeeRecords   && <MaintenanceListTab categories={["Primordial:Motores"]} title="Primordial · Motores" />}
            {tab === "aceite-cambios"       && canSeeRecords   && <MaintenanceListTab categories={["Aceite:Cambio"]}      title="Aceites · Cambios de aceite" />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default MantenimientosPage;
