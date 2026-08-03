import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ClipboardCheck, ListChecks, AlertTriangle, ClipboardList, Inbox } from "lucide-react";
import { toast } from "sonner";
import { useChecklistCategories, type ChecklistCategory } from "../../hooks/useChecklistCategories";
import { useChecklists, type Checklist } from "../../hooks/useChecklists";
import { usePermissions } from "../../hooks/usePermissions";
import ChecklistWizard from "./components/wizard/ChecklistWizard";
import { PlantillasManager } from "./components/PlantillasManager";
import { ChecklistHistorial } from "./components/historial/ChecklistHistorial";
import { ChecklistAnomalias } from "./components/historial/ChecklistAnomalias";
import { ChecklistDetailDrawer } from "./components/historial/ChecklistDetailDrawer";
import { ChecklistPendientes } from "./components/ChecklistPendientes";
import { ChecklistReauthInbox } from "./components/ChecklistReauthInbox";

type Tab = "pendientes" | "realizar" | "historial" | "reauth";
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
  const { checklists, loading: checklistsLoading, refetch: refetchChecklists } = useChecklists();
  const { can } = usePermissions();
  const session = (typeof window !== "undefined") ? JSON.parse(localStorage.getItem("aplismart_session") ?? "null") : null;
  const role = (session?.role ?? "") as string;
  // Ver inspecciones: tab Pendientes requiere esto.
  const canSeeInspecciones = ADMIN_ROLES.includes(role) || can("checklist", "inspecciones", "ver");
  // Ver historial: tab Historial requiere esto (permiso separado, no heredado de inspecciones).
  const canSeeHistorial = ADMIN_ROLES.includes(role) || can("checklist", "historial", "ver");
  // Ver plantillas: el tab "Realizar" con el listado de plantillas requiere esto.
  // (No bloquea el "Pendientes" — el filtro de visibilidad ya lo hace server-side.)
  const canSeePlantillas = ADMIN_ROLES.includes(role) || can("checklist", "checklist", "ver");
  // Bandeja de reautorizaciones (aprobar/rechazar): SOLO quien tiene `editar`.
  // OJO: no usar `ver` acá — operador/conductor también tienen `ver` (se
  // auto-selecciona junto con `crear` para que puedan consultar el estado de
  // SUS propias solicitudes), pero esa vista vive dentro de ChecklistPendientes
  // (sección "Atrasados"), no en esta pestaña de bandeja de aprobación.
  const canSeeReauth = ADMIN_ROLES.includes(role) || can("checklist", "reautorizaciones", "editar");
  const canCreate = can("checklist", "checklist", "crear");

  // Tab inicial: si puede ver inspecciones, arranca en "Pendientes"; si no, en "Realizar".
  const [tab, setTab] = useState<Tab>(
    () => (ADMIN_ROLES.includes(role) || can("checklist", "inspecciones", "ver")) ? "pendientes" : "realizar"
  );
  // (el inicial se queda con "inspecciones" porque "Pendientes" no requiere "historial")

  // Deep-link desde otras páginas (ej. ProfilePage → "Mis inspecciones
  // pendientes"). Si llegamos con `?assetId=X` y la pestaña actual no es
  // compatible, saltamos a "pendientes" para que el conductor aterrice en
  // el lugar correcto sin tener que buscar la pestaña a mano.
  //
  // OJO: NO incluir `tab` en las deps. Si lo incluimos, cualquier click
  // del usuario en otra pestaña (p.ej. "Realizar") re-dispara este effect
  // y vuelve a forzar "pendientes" — el usuario no puede cambiar de tab
  // mientras el `?assetId=` siga en la URL. Hacemos el setTab solo cuando
  // el deep-link aparece por primera vez (o cambia a un valor distinto).
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkedAssetId = searchParams.get("assetId");
  const handledDeepLink = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLinkedAssetId) return;
    if (!canSeeInspecciones) return;
    if (handledDeepLink.current === deepLinkedAssetId) return;
    if (tab !== "pendientes") {
      setTab("pendientes");
    }
    handledDeepLink.current = deepLinkedAssetId;
  }, [deepLinkedAssetId, canSeeInspecciones, tab]);

  // Deep-link desde el GlobalSearch: `?checklistId=checklist-123&open=1`.
  // El header lo usa para abrir el detalle de un checklist (inspección)
  // sin tener que buscarlo en la lista. Saltamos a la pestaña correcta
  // (pendientes si es Pendiente, historial si ya está cerrado) y abrimos
  // el drawer. Si el id no matchea, no hacemos nada (probablemente el
  // usuario llegó con un link viejo).
  const deepLinkedChecklistId = searchParams.get("checklistId");
  const openFromLink = searchParams.get("open") === "1";
  const handledChecklistLink = useRef<string | null>(null);
  const [historySubForLink, setHistorySubForLink] = useState<HistorialSub>("todos");
  useEffect(() => {
    if (!deepLinkedChecklistId || !openFromLink) return;
    if (checklistsLoading) return;
    if (handledChecklistLink.current === deepLinkedChecklistId) return;

    // El id puede venir como "checklist-123" o como "123" crudo. Buscamos
    // match por igualdad exacta y por número.
    const numId = Number(String(deepLinkedChecklistId).replace(/^[a-z-]+-/i, ""));
    const found = checklists.find(
      (c) => c.id === deepLinkedChecklistId ||
        Number(c.id) === numId ||
        c.id === `checklist-${numId}`,
    );

    if (!found) {
      handledChecklistLink.current = deepLinkedChecklistId;
      // Si ya terminó de cargar y no aparece, le avisamos al user que
      // ese id no existe (o no es visible para él).
      if (checklists.length > 0) {
        toast.error("No se encontró la inspección solicitada");
      }
      return;
    }

    if (found.status === "Pendiente") {
      if (canSeeInspecciones) setTab("pendientes");
    } else {
      if (canSeeHistorial) {
        setTab("historial");
        setHistorySubForLink("todos");
      }
    }
    setDetail(found);
    handledChecklistLink.current = deepLinkedChecklistId;
    // Limpiamos los params de la URL para que un back del navegador no
    // reabra el modal. Mantenemos la URL "limpia" para compartir.
    const next = new URLSearchParams(searchParams);
    next.delete("checklistId");
    next.delete("open");
    setSearchParams(next, { replace: true });
  }, [deepLinkedChecklistId, openFromLink, checklistsLoading, checklists, canSeeInspecciones, canSeeHistorial, searchParams, setSearchParams]);

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

      {/* tabs: cada tab requiere su permiso independiente.
            Pendientes  -> ver inspecciones
            Realizar    -> ver plantillas
            Historial   -> ver historial (permiso dedicado, NO se hereda)
            Reautorizaciones -> editar reautorizaciones (bandeja de aprobación) */}
      {(canSeeInspecciones || canSeeHistorial || canSeePlantillas || canSeeReauth) && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 dark:border-white/[0.06]">
          {canSeeInspecciones && (
            <TabButton active={tab === "pendientes"} onClick={() => setTab("pendientes")}>
              <ClipboardList size={13} /> Pendientes
            </TabButton>
          )}
          {canSeePlantillas && (
            <TabButton active={tab === "realizar"} onClick={() => setTab("realizar")}>
              <ClipboardCheck size={13} /> Realizar
            </TabButton>
          )}
          {canSeeHistorial && (
            <TabButton active={tab === "historial"} onClick={() => setTab("historial")}>
              <ListChecks size={13} /> Historial
            </TabButton>
          )}
          {canSeeReauth && (
            <TabButton active={tab === "reauth"} onClick={() => setTab("reauth")}>
              <Inbox size={13} /> Reautorizaciones
            </TabButton>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
        {tab === "pendientes" && canSeeInspecciones && (
          <motion.div key="pendientes"
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}>
            <ChecklistPendientes
              categories={categories}
              deepLinkedAssetId={deepLinkedAssetId}
              onOpenWizard={(id) => {
                if (id) {
                  const c = categories.find((x) => x.id === id);
                  if (c) openWizardFor(c);
                }
              }}
            />
          </motion.div>
        )}

        {tab === "realizar" && canSeePlantillas && (
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
            <HistorialTabs initialSub={historySubForLink} onOpenDetail={setDetail} />
          </motion.div>
        )}

        {tab === "reauth" && canSeeReauth && (
          <motion.div key="reauth"
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}>
            {/* Si llegó hasta acá es porque tiene `editar` (ver canSeeReauth arriba),
                así que siempre puede decidir. */}
            <ChecklistReauthInbox canDecide={true} />
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

function HistorialTabs({ initialSub, onOpenDetail }: { initialSub?: HistorialSub; onOpenDetail?: (c: Checklist) => void }) {
  const [sub, setSub] = useState<HistorialSub>(initialSub ?? "anomalias");
  const [detail, setDetail] = useState<Checklist | null>(null);
  // Si el padre nos cambia el initialSub (deep-link), lo aplicamos.
  useEffect(() => {
    if (initialSub) setSub(initialSub);
  }, [initialSub]);
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
            <ChecklistAnomalias onOpenChecklist={onOpenDetail ?? setDetail} pageSize={7} />
          </motion.div>
        ) : (
          <motion.div key="all" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }}>
            <ChecklistHistorial onOpenDetail={onOpenDetail ?? setDetail} pageSize={7} />
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