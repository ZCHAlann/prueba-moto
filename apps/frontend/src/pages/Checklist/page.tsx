import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ClipboardCheck, ListChecks, AlertTriangle } from "lucide-react";
import { useChecklistCategories, type ChecklistCategory } from "../../hooks/useChecklistCategories";
import { useChecklists, type Checklist } from "../../hooks/useChecklists";
import { usePermissions } from "../../hooks/usePermissions";
import ChecklistWizard from "./components/wizard/ChecklistWizard";
import { PlantillasManager } from "./components/PlantillasManager";
import { ChecklistHistorial } from "./components/historial/ChecklistHistorial";
import { ChecklistAnomalias } from "./components/historial/ChecklistAnomalias";
import { ChecklistDetailDrawer } from "./components/historial/ChecklistDetailDrawer";

type Tab = "realizar" | "historial";
type HistorialSub = "anomalias" | "todos";

const ADMIN_ROLES = ["owner_empresa", "admin_empresa", "supervisor"];

function StatCard({ label, value, sub, colorCls, icon }: {
  label: string; value: string | number; sub: string; colorCls: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</p>
        <div className="text-gray-300 dark:text-gray-600">{icon}</div>
      </div>
      <p className={`mt-1.5 text-3xl font-black tabular-nums ${colorCls}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>
    </div>
  );
}

export function ChecklistPage() {
  const { categories, refetch: refetchCategories } = useChecklistCategories();
  const { checklists, refetch: refetchChecklists } = useChecklists();
  const { can } = usePermissions();
  const session = (typeof window !== "undefined") ? JSON.parse(localStorage.getItem("aplismart_session") ?? "null") : null;
  const role = (session?.role ?? "") as string;
  const canSeeHistorial = ADMIN_ROLES.includes(role) || can("checklist", "checklist", "ver");
  const canCreate = can("checklist", "checklist", "crear");

  const [tab, setTab] = useState<Tab>("realizar");

  // Wizard: controlamos apertura + plantilla preseleccionada
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardTemplate, setWizardTemplate] = useState<ChecklistCategory | null>(null);

  const [detail, setDetail] = useState<Checklist | null>(null);

  const approvedCount = useMemo(() => checklists.filter((c) => c.status === "Aprobado").length, [checklists]);
  const observedCount = useMemo(() => checklists.filter((c) => c.status === "Observado").length, [checklists]);

  function handleSaved() {
    void refetchChecklists();
    void refetchCategories();
  }

  function openWizardFor(plantilla: ChecklistCategory) {
    setWizardTemplate(plantilla);
    setWizardOpen(true);
  }

  function openWizardBlank() {
    setWizardTemplate(null);
    setWizardOpen(true);
  }

  return (
    <div className="space-y-5">
      {/* header */}
      <div>
        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest text-emerald-600 dark:bg-emerald-500/[0.12] dark:text-emerald-400">
          Cumplimiento
        </span>
        <h1 className="mt-2 text-2xl font-bold text-gray-800 dark:text-white">Checklist</h1>
        <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
          Crea plantillas con los puntos a inspeccionar y luego registra inspecciones de cada vehículo.
        </p>
      </div>

      {/* tabs (Historial sólo para roles autorizados) */}
      {canSeeHistorial && (
        <div className="flex items-center gap-1 border-b border-gray-200 dark:border-white/[0.06]">
          <TabButton active={tab === "realizar"} onClick={() => setTab("realizar")}>
            <ClipboardCheck size={13} /> Realizar
          </TabButton>
          <TabButton active={tab === "historial"} onClick={() => setTab("historial")}>
            <ListChecks size={13} /> Historial
          </TabButton>
        </div>
      )}

      <AnimatePresence mode="wait">
        {tab === "realizar" && (
          <motion.div key="realizar"
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}>
            <PlantillasManager onStartInspection={openWizardFor} />
          </motion.div>
        )}

        {tab === "historial" && canSeeHistorial && (
          <motion.div key="historial"
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="space-y-4">
            <HistorialTabs />
          </motion.div>
        )}
      </AnimatePresence>

      {/* modales */}
      <ChecklistWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSaved={handleSaved}
        initialCategory={wizardTemplate}
      />
      <ChecklistDetailDrawer checklist={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function TabButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      }`}>
      {children}
      {active && (
        <motion.div
          layoutId="checklist-tab-underline"
          className="absolute -bottom-px left-0 right-0 h-0.5 bg-emerald-500"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
    </button>
  );
}

function HistorialTabs() {
  const [sub, setSub] = useState<HistorialSub>("anomalias");
  const [detail, setDetail] = useState<Checklist | null>(null);
  return (
    <>
      <div className="flex items-center gap-1">
        <SubTab active={sub === "anomalias"} onClick={() => setSub("anomalias")}>
          <AlertTriangle size={12} /> Vehículos con anomalías
        </SubTab>
        <SubTab active={sub === "todos"} onClick={() => setSub("todos")}>
          <ListChecks size={12} /> Todos los checklists
        </SubTab>
      </div>
      <AnimatePresence mode="wait">
        {sub === "anomalias" ? (
          <motion.div key="anom" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
            <ChecklistAnomalias onOpenChecklist={setDetail} pageSize={7} />
          </motion.div>
        ) : (
          <motion.div key="all" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
            <ChecklistHistorial onOpenDetail={setDetail} pageSize={7} />
          </motion.div>
        )}
      </AnimatePresence>
      <ChecklistDetailDrawer checklist={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function SubTab({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active
          ? "border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.02]"
      }`}>
      {children}
    </button>
  );
}
