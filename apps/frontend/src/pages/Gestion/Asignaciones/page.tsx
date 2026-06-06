import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { usePermissions } from "../../../hooks/usePermissions";
import { useAssets } from "../../../hooks/useAssets";
import { useDrivers } from "../../../hooks/useDrivers";
import { useAssignments } from "../../../hooks/useAssignments";
import { HandoverWizard } from "./components/HandoerWizard";
import type { ApiDriver } from "../../../hooks/useDrivers";
import type { Asset } from "../../../types/activo";
import type { ExistingHandoverData } from "../../../hooks/useHandoverWizard";

// ─── helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function daysSince(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ─── svg icons ────────────────────────────────────────────────────────────────

function CarIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1l2-4h12l2 4h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2" />
      <circle cx="7.5" cy="17.5" r="2.5" /><circle cx="16.5" cy="17.5" r="2.5" />
      <path d="M7.5 15h9" />
    </svg>
  );
}

function DocumentIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function PencilIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// ─── sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, detail, tone }: {
  label: string; value: string | number; detail: string;
  tone: "brand" | "success" | "warning" | "gray";
}) {
  const toneMap = {
    brand:   "bg-brand-50 dark:bg-brand-500/10 border-brand-200 dark:border-brand-500/20 text-brand-600 dark:text-brand-400",
    success: "bg-success-50 dark:bg-success-500/10 border-success-200 dark:border-success-500/20 text-success-600 dark:text-success-400",
    warning: "bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-500/20 text-warning-600 dark:text-warning-400",
    gray:    "bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-400",
  };
  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-800 dark:text-white">{value}</p>
      <p className="mt-0.5 text-xs opacity-60">{detail}</p>
    </div>
  );
}

function DriverCard({ driver, selected, hasActiveAssignment, onClick }: {
  driver: ApiDriver; selected: boolean; hasActiveAssignment: boolean; onClick: () => void;
}) {
  return (
    <button type="button" disabled={hasActiveAssignment} onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition-all ${
        hasActiveAssignment
          ? "cursor-not-allowed opacity-40 bg-gray-50 dark:bg-white/[0.02] border-gray-200 dark:border-white/[0.06]"
          : selected
          ? "border-brand-400 dark:border-brand-500 bg-brand-50 dark:bg-brand-500/10 shadow-sm ring-1 ring-brand-300 dark:ring-brand-500/30"
          : "border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] hover:border-brand-300 dark:hover:border-brand-500/40 hover:bg-brand-50/50 dark:hover:bg-brand-500/5"
      }`}>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-500/20 text-xs font-bold text-brand-700 dark:text-brand-300">
          {driver.photoUrl
            ? <img src={driver.photoUrl} alt={driver.name} className="h-9 w-9 rounded-full object-cover" />
            : getInitials(driver.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">{driver.name}</p>
          <p className="truncate text-xs text-gray-400 dark:text-gray-500">{driver.code}</p>
        </div>
        {hasActiveAssignment && (
          <span className="ml-auto shrink-0 rounded-full bg-warning-100 dark:bg-warning-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-warning-600 dark:text-warning-400">
            Asignado
          </span>
        )}
      </div>
    </button>
  );
}

function AssetCard({ asset, selected, onClick }: {
  asset: Asset; selected: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition-all ${
        selected
          ? "border-brand-400 dark:border-brand-500 bg-brand-50 dark:bg-brand-500/10 shadow-sm ring-1 ring-brand-300 dark:ring-brand-500/30"
          : "border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] hover:border-brand-300 dark:hover:border-brand-500/40 hover:bg-brand-50/50 dark:hover:bg-brand-500/5"
      }`}>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400">
          <CarIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">{asset.plate}</p>
          <p className="truncate text-xs text-gray-400 dark:text-gray-500">{asset.brand} {asset.model}</p>
        </div>
      </div>
    </button>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export function AssignmentsPage() {
  const { can } = usePermissions();
  const canCreate   = can("gestion", "asignaciones", "crear");
  const canFinalize = can("gestion", "asignaciones", "editar");

  const { assets,   loading: assetsLoading  } = useAssets();
  const { drivers,  loading: driversLoading } = useDrivers();
  const { assignments, loading: assignmentsLoading, createAssignment, updateHandover, finalizeAssignment } =
    useAssignments();

  const loading = assetsLoading || driversLoading || assignmentsLoading;

  // ── view mode ─────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<"board" | "table">("board");

  // ── board selection ───────────────────────────────────────────────────────
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedAssetId,  setSelectedAssetId]  = useState<string | null>(null);

  // ── wizard — create mode ──────────────────────────────────────────────────
  const [wizardOpen, setWizardOpen] = useState(false);

  // ── wizard — edit mode ────────────────────────────────────────────────────
  const [editWizardOpen,        setEditWizardOpen]        = useState(false);
  const [editAssignmentId,      setEditAssignmentId]      = useState<string | null>(null);
  const [editExistingData,      setEditExistingData]      = useState<ExistingHandoverData | null>(null);
  const [editWizardDriverId,    setEditWizardDriverId]    = useState<string | null>(null);
  const [editWizardAssetId,     setEditWizardAssetId]     = useState<string | null>(null);

  // ── detail drawer ─────────────────────────────────────────────────────────
  const [drawerAssignmentId, setDrawerAssignmentId] = useState<string | null>(null);

  // ── table search ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");

  // ── derived ───────────────────────────────────────────────────────────────
  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status === "Activa"),
    [assignments],
  );

  const availableAssets = useMemo(
    () => assets.filter((asset) => !activeAssignments.some((a) => a.assetId === asset.id)),
    [assets, activeAssignments],
  );

  const rows = useMemo(
    () =>
      assignments
        .map((a) => {
          const asset  = assets.find((x) => x.id === a.assetId);
          const driver = drivers.find((x) => x.id === a.driverId);
          return {
            ...a,
            driverCode: driver?.code ?? "—",
            driverName: driver?.name ?? "Sin conductor",
            plate: asset?.plate ?? a.assetId,
            unit:  asset ? `${asset.brand} ${asset.model}` : a.assetId,
          };
        })
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [assignments, assets, drivers],
  );

  const filteredRows = useMemo(() => {
    const v = query.trim().toLowerCase();
    if (!v) return rows;
    return rows.filter(
      (r) =>
        r.driverCode.toLowerCase().includes(v) ||
        r.driverName.toLowerCase().includes(v) ||
        r.plate.toLowerCase().includes(v) ||
        r.unit.toLowerCase().includes(v),
    );
  }, [rows, query]);

  const drawerAssignment = useMemo(
    () => (drawerAssignmentId ? rows.find((r) => r.id === drawerAssignmentId) : null),
    [drawerAssignmentId, rows],
  );

  // Wizard create — objetos seleccionados
  const wizardDriver = selectedDriverId ? drivers.find((d) => d.id === selectedDriverId) ?? null : null;
  const wizardAsset  = selectedAssetId  ? assets.find((a) => a.id === selectedAssetId)   ?? null : null;

  // Wizard edit — objetos de la asignación a editar
  const editWizardDriver = editWizardDriverId ? drivers.find((d) => d.id === editWizardDriverId) ?? null : null;
  const editWizardAsset  = editWizardAssetId  ? assets.find((a) => a.id === editWizardAssetId)   ?? null : null;

  // ── actions ───────────────────────────────────────────────────────────────

  function handleDriverClick(driverId: string) {
    if (!canCreate) return;
    setSelectedDriverId((prev) => (prev === driverId ? null : driverId));
    setSelectedAssetId(null);
  }

  function handleAssetClick(assetId: string) {
    if (!canCreate) return;
    if (!selectedDriverId) { toast.warning("Selecciona primero un conductor"); return; }
    setSelectedAssetId(assetId);
    setWizardOpen(true);
  }

  function handleWizardClose() {
    setWizardOpen(false);
    setSelectedDriverId(null);
    setSelectedAssetId(null);
  }

  function handleWizardComplete() {
    setWizardOpen(false);
    setSelectedDriverId(null);
    setSelectedAssetId(null);
    toast.success("Asignación y acta guardadas correctamente");
  }

  // ── edit acta ─────────────────────────────────────────────────────────────

  function handleEditActa(assignmentId: string) {
    const assignment = assignments.find((a) => a.id === assignmentId);
    if (!assignment) return;

    // Armar ExistingHandoverData desde la asignación
    const existing: ExistingHandoverData = {
      actaNumber:       assignment.actaNumber       ?? null,
      actaDate:         assignment.actaDate         ?? null,
      actaTime:         assignment.actaTime         ?? null,
      actaPlace:        assignment.actaPlace        ?? null,
      actaArea:         assignment.actaArea         ?? null,
      driverDni:        assignment.driverDni        ?? null,
      driverPhone:      assignment.driverPhone      ?? null,
      driverRole:       assignment.driverRole       ?? null,
      vehicleOdometer:  assignment.vehicleOdometer  ?? null,
      vehicleFuelLevel: assignment.vehicleFuelLevel ?? null,
      vehicleCondition: assignment.vehicleCondition ?? null,
      novedades:        assignment.novedades        as Record<string, unknown> ?? null,
      accesorios:       assignment.accesorios       as Record<string, unknown> ?? null,
      novedadesText:    assignment.novedadesText    ?? null,
      signatureLogUrl:  assignment.signatureLogUrl  ?? null,
      signatureRespUrl: assignment.signatureRespUrl ?? null,
      vehiclePhotoUrls: assignment.vehiclePhotoUrls ?? [],
      handoverUrl:      assignment.handoverUrl      ?? null,
    };

    setEditAssignmentId(assignmentId);
    setEditExistingData(existing);
    setEditWizardDriverId(assignment.driverId);
    setEditWizardAssetId(assignment.assetId);
    setEditWizardOpen(true);
  }

  function handleEditWizardClose() {
    setEditWizardOpen(false);
    setEditAssignmentId(null);
    setEditExistingData(null);
    setEditWizardDriverId(null);
    setEditWizardAssetId(null);
  }

  function handleEditWizardComplete() {
    handleEditWizardClose();
    toast.success("Acta actualizada correctamente");
  }

  // ── finalize ──────────────────────────────────────────────────────────────

  async function handleFinalize(id: string, plate: string) {
    if (!canFinalize) return;
    try {
      await finalizeAssignment(id, new Date().toISOString().slice(0, 10));
      toast.success(`Asignación de ${plate} finalizada`);
      if (drawerAssignmentId === id) setDrawerAssignmentId(null);
    } catch {
      toast.error("No se pudo finalizar la asignación");
    }
  }

  // ── loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />
        <div className="grid gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="inline-flex items-center rounded-full bg-brand-50 dark:bg-brand-500/10 px-2.5 py-0.5 text-xs font-semibold text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-500/20">
            Asignaciones
          </span>
          <h1 className="mt-2 text-2xl font-bold text-gray-800 dark:text-white">Gestión de asignaciones</h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Conecta conductores con vehículos, controla asignaciones activas y gestiona el historial.
          </p>
        </div>
        <div className="flex items-center gap-1 self-start rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.03] p-1">
          {(["board", "table"] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => setViewMode(mode)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                viewMode === mode
                  ? "bg-white dark:bg-white/[0.08] text-gray-800 dark:text-white shadow-sm"
                  : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              }`}>
              {mode === "board" ? "Tablero" : "Historial"}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPIs ── */}
      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <KpiCard label="Activas"          value={activeAssignments.length}                              detail="Relaciones en curso"       tone="brand"   />
        <KpiCard label="Finalizadas"      value={assignments.filter((a) => a.status !== "Activa").length} detail="Historial cerrado"        tone="gray"    />
        <KpiCard label="Vehículos libres" value={availableAssets.length}                               detail="Sin asignación activa"    tone="success" />
        <KpiCard label="Conductores libres" value={drivers.filter((d) => !activeAssignments.some((a) => a.driverId === d.id)).length} detail="Disponibles para asignar" tone="warning" />
      </section>

      {/* ── BOARD VIEW ── */}
      {viewMode === "board" && (
        <div className="space-y-4">
          {/* connection board */}
          <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] overflow-hidden">
            <div className="border-b border-gray-200 dark:border-white/[0.06] px-5 py-4">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white">Tablero de conexión</h2>
              <p className="mt-0.5 text-sm text-gray-400 dark:text-gray-500">
                {canCreate
                  ? "Selecciona un conductor → luego un vehículo para iniciar el acta de entrega."
                  : "Solo lectura — no tienes permiso para crear asignaciones."}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
              {/* drivers */}
              <div className="border-b border-gray-200 dark:border-white/[0.06] md:border-b-0 md:border-r p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Conductores ({drivers.length})
                </p>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {drivers.length === 0 && <p className="text-sm text-gray-400">Sin conductores registrados.</p>}
                  {drivers.map((driver) => (
                    <DriverCard
                      key={driver.id}
                      driver={driver}
                      selected={selectedDriverId === driver.id}
                      hasActiveAssignment={activeAssignments.some((a) => a.driverId === driver.id)}
                      onClick={() => handleDriverClick(driver.id)}
                    />
                  ))}
                </div>
              </div>

              {/* assets */}
              <div className="p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Vehículos disponibles ({availableAssets.length})
                </p>
                {canCreate && !selectedDriverId && (
                  <div className="mb-3 rounded-xl border border-dashed border-brand-200 dark:border-brand-500/30 bg-brand-50/50 dark:bg-brand-500/5 px-4 py-3">
                    <p className="text-xs text-brand-600 dark:text-brand-400">← Primero selecciona un conductor</p>
                  </div>
                )}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {availableAssets.length === 0 && <p className="text-sm text-gray-400">Todos los vehículos están asignados.</p>}
                  {availableAssets.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      selected={selectedAssetId === asset.id}
                      onClick={() => handleAssetClick(asset.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* active assignments */}
          {activeAssignments.length > 0 && (
            <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] overflow-hidden">
              <div className="border-b border-gray-200 dark:border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-semibold text-gray-800 dark:text-white">Asignaciones activas</h2>
                <p className="mt-0.5 text-sm text-gray-400 dark:text-gray-500">Pares conductor ↔ vehículo en curso.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02]">
                      {["Conductor", "Código", "Vehículo", "Placa", "Desde", "Días", "Acta", "Acciones"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeAssignments.map((a) => {
                      const asset  = assets.find((x) => x.id === a.assetId);
                      const driver = drivers.find((x) => x.id === a.driverId);
                      const days   = daysSince(a.startDate);
                      return (
                        <tr key={a.id}
                          className="border-b border-gray-100 dark:border-white/[0.04] last:border-0 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3.5">
                            <p className="text-sm font-semibold text-gray-800 dark:text-white">{driver?.name ?? "—"}</p>
                          </td>
                          <td className="px-4 py-3.5 text-sm text-gray-400">{driver?.code ?? "—"}</td>
                          <td className="px-4 py-3.5">
                            <p className="text-sm text-gray-600 dark:text-gray-300">{asset ? `${asset.brand} ${asset.model}` : "—"}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="text-sm font-semibold text-gray-800 dark:text-white">{asset?.plate ?? "—"}</p>
                          </td>
                          <td className="px-4 py-3.5 text-sm text-gray-500">{a.startDate}</td>
                          <td className="px-4 py-3.5 text-sm text-gray-500">{days === 0 ? "Hoy" : `${days}d`}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              {a.handoverUrl ? (
                                <a href={a.handoverUrl} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-brand-600 dark:text-brand-400 text-xs hover:opacity-80">
                                  <DocumentIcon className="h-3.5 w-3.5" /> Ver acta
                                </a>
                              ) : (
                                <span className="text-xs text-gray-400">Sin acta</span>
                              )}
                              {/* ── Botón editar acta ── */}
                              {canFinalize && (
                                <button
                                  type="button"
                                  onClick={() => handleEditActa(a.id)}
                                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                  title="Editar acta"
                                >
                                  <PencilIcon className="h-3.5 w-3.5" />
                                  {a.handoverUrl ? "Editar" : "Crear acta"}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setDrawerAssignmentId(a.id)}
                                className="rounded-lg border border-gray-200 dark:border-white/[0.06] px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
                                Detalle
                              </button>
                              {canFinalize && (
                                <button type="button" onClick={() => handleFinalize(a.id, asset?.plate ?? a.assetId)}
                                  className="rounded-lg border border-error-200 dark:border-error-500/20 px-2.5 py-1 text-xs font-medium text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-500/10 transition-colors">
                                  Finalizar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TABLE / HISTORY VIEW ── */}
      {viewMode === "table" && (
        <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-gray-200 dark:border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-800 dark:text-white">Historial de asignaciones</h2>
              <p className="mt-0.5 text-sm text-gray-400">{assignments.length} registros en total</p>
            </div>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por conductor, placa…"
              className="w-full rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-brand-400 dark:focus:border-brand-500 transition-colors sm:w-64" />
          </div>

          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm font-medium text-gray-400">Sin registros</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02]">
                    {["#", "Conductor", "Código", "Vehículo", "Placa", "Desde", "Estado", "Acta", "Acciones"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => (
                    <tr key={row.id}
                      className="border-b border-gray-100 dark:border-white/[0.04] last:border-0 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3.5 text-sm text-gray-400">{index + 1}</td>
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{row.driverName}</p>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-400">{row.driverCode}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300">{row.unit}</td>
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{row.plate}</p>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">{row.startDate}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                          row.status === "Activa"
                            ? "bg-success-50 dark:bg-success-500/10 border-success-200 dark:border-success-500/20 text-success-600 dark:text-success-400"
                            : "bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-400"
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          {row.handoverUrl ? (
                            <a href={row.handoverUrl} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-brand-600 dark:text-brand-400 text-xs hover:opacity-80">
                              <DocumentIcon className="h-3.5 w-3.5" /> Ver acta
                            </a>
                          ) : (
                            <span className="text-xs text-gray-400">Sin acta</span>
                          )}
                          {/* ── Botón editar acta (historial también) ── */}
                          {canFinalize && (
                            <button
                              type="button"
                              onClick={() => handleEditActa(row.id)}
                              className="flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                              title="Editar acta"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                              {row.handoverUrl ? "Editar" : "Crear acta"}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setDrawerAssignmentId(row.id)}
                            className="rounded-lg border border-gray-200 dark:border-white/[0.06] px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
                            Detalle
                          </button>
                          {canFinalize && row.status === "Activa" && (
                            <button type="button" onClick={() => handleFinalize(row.id, row.plate)}
                              className="rounded-lg border border-error-200 dark:border-error-500/20 px-2.5 py-1 text-xs font-medium text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-500/10 transition-colors">
                              Finalizar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── HANDOVER WIZARD — create mode ── */}
      {wizardDriver && wizardAsset && (
        <HandoverWizard
          open={wizardOpen}
          driverId={selectedDriverId!}
          assetId={selectedAssetId!}
          driver={wizardDriver}
          asset={wizardAsset}
          assignmentCount={assignments.length}
          onClose={handleWizardClose}
          onComplete={handleWizardComplete}
          createAssignment={createAssignment}
          updateHandover={updateHandover}
        />
      )}

      {/* ── HANDOVER WIZARD — edit mode ── */}
      {editWizardDriver && editWizardAsset && (
        <HandoverWizard
          open={editWizardOpen}
          driverId={editWizardDriverId!}
          assetId={editWizardAssetId!}
          driver={editWizardDriver}
          asset={editWizardAsset}
          assignmentCount={assignments.length}
          onClose={handleEditWizardClose}
          onComplete={handleEditWizardComplete}
          createAssignment={createAssignment}
          updateHandover={updateHandover}
          editMode
          existingAssignmentId={editAssignmentId!}
          existingData={editExistingData}
        />
      )}

      {/* ── DETAIL DRAWER ── */}
      <AnimatePresence>
        {drawerAssignment && (
          <>
            <motion.div key="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-gray-950/40 backdrop-blur-sm"
              onClick={() => setDrawerAssignmentId(null)} />
            <motion.div key="drawer"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 350, damping: 35 }}
              className="fixed right-0 top-0 z-50 h-full w-full max-w-sm border-l border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto">
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-bold text-gray-800 dark:text-white">Detalle de asignación</h2>
                <button type="button" onClick={() => setDrawerAssignmentId(null)}
                  className="rounded-lg border border-gray-200 dark:border-white/[0.06] p-1.5 text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors">
                  ✕
                </button>
              </div>

              <div className="space-y-5 px-5 py-5">
                {/* driver */}
                {(() => {
                  const driver = drivers.find((d) => d.id === drawerAssignment.driverId);
                  return (
                    <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Conductor</p>
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-500/20 text-sm font-bold text-brand-700 dark:text-brand-300 overflow-hidden">
                          {driver?.photoUrl
                            ? <img src={driver.photoUrl} alt={driver.name} className="h-12 w-12 object-cover" />
                            : driver ? getInitials(driver.name) : "?"}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 dark:text-white">{driver?.name ?? "—"}</p>
                          <p className="text-sm text-gray-400">{driver?.code}</p>
                          {driver?.licenseType && (
                            <p className="mt-1 text-xs text-gray-400">Lic. {driver.licenseType} · vence {driver.licenseExpiry}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* asset */}
                {(() => {
                  const asset = assets.find((a) => a.id === drawerAssignment.assetId);
                  return (
                    <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Vehículo</p>
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500">
                          <CarIcon className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 dark:text-white">{asset?.plate ?? "—"}</p>
                          <p className="text-sm text-gray-400">{asset ? `${asset.brand} ${asset.model} ${asset.year}` : "—"}</p>
                          {asset?.color && <p className="mt-1 text-xs text-gray-400">Color: {asset.color}</p>}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* meta */}
                <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] divide-y divide-gray-100 dark:divide-white/[0.04]">
                  {[
                    { label: "Fecha inicio", value: drawerAssignment.startDate },
                    { label: "Días activa",  value: drawerAssignment.status === "Activa" ? `${daysSince(drawerAssignment.startDate)} días` : "Finalizada" },
                    { label: "Estado",       value: drawerAssignment.status },
                    ...(drawerAssignment.actaNumber ? [{ label: "N.° Acta", value: drawerAssignment.actaNumber }] : []),
                    ...(drawerAssignment.vehicleOdometer ? [{ label: "Km entrega", value: drawerAssignment.vehicleOdometer }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between px-4 py-3">
                      <span className="text-xs text-gray-400">{label}</span>
                      <span className="text-sm font-medium text-gray-800 dark:text-white">{value}</span>
                    </div>
                  ))}
                </div>

                {/* handover */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Acta de entrega</p>
                  {drawerAssignment.handoverUrl ? (
                    <a href={drawerAssignment.handoverUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl border border-brand-200 dark:border-brand-500/20 bg-brand-50 dark:bg-brand-500/10 px-4 py-3 text-sm font-medium text-brand-600 dark:text-brand-400 hover:opacity-80 transition-opacity">
                      <DocumentIcon className="h-4 w-4 shrink-0" /> Ver acta adjunta
                    </a>
                  ) : (
                    <p className="rounded-xl border border-dashed border-gray-200 dark:border-white/[0.06] px-4 py-3 text-sm text-gray-400 text-center">
                      Sin acta adjunta
                    </p>
                  )}
                  {/* Editar acta desde el drawer también */}
                  {canFinalize && (
                    <button
                      type="button"
                      onClick={() => {
                        setDrawerAssignmentId(null);
                        handleEditActa(drawerAssignment.id);
                      }}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-white/[0.06] px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                    >
                      <PencilIcon className="h-4 w-4" />
                      {drawerAssignment.handoverUrl ? "Editar acta" : "Crear acta"}
                    </button>
                  )}
                </div>

                {/* finalize */}
                {canFinalize && drawerAssignment.status === "Activa" && (
                  <button type="button" onClick={() => handleFinalize(drawerAssignment.id, drawerAssignment.plate)}
                    className="w-full rounded-xl border border-error-200 dark:border-error-500/20 bg-error-50 dark:bg-error-500/10 py-2.5 text-sm font-semibold text-error-600 dark:text-error-400 hover:bg-error-100 dark:hover:bg-error-500/20 transition-colors">
                    Finalizar asignación
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}