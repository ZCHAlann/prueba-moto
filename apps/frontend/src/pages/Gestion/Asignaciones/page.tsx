import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { usePermissions } from "../../../hooks/usePermissions";
import { useAssets } from "../../../hooks/useAssets";
import { useDrivers } from "../../../hooks/useDrivers";
import { useAssignments } from "../../../hooks/useAssignments";
import type { ApiDriver } from "../../../hooks/useDrivers";
import type { Asset } from "../../../types/activo";

// ─── helpers ────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function daysSince(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ─── svg icons ───────────────────────────────────────────────────────────────

function CarIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1l2-4h12l2 4h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2" />
      <circle cx="7.5" cy="17.5" r="2.5" />
      <circle cx="16.5" cy="17.5" r="2.5" />
      <path d="M7.5 15h9" />
    </svg>
  );
}

function DocumentIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function ArrowsUpDownIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M7 16V4m0 0L3 8m4-4l4 4" />
      <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: "brand" | "success" | "warning" | "gray";
}) {
  const toneMap = {
    brand:
      "bg-brand-50 dark:bg-brand-500/10 border-brand-200 dark:border-brand-500/20 text-brand-600 dark:text-brand-400",
    success:
      "bg-success-50 dark:bg-success-500/10 border-success-200 dark:border-success-500/20 text-success-600 dark:text-success-400",
    warning:
      "bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-500/20 text-warning-600 dark:text-warning-400",
    gray: "bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-400",
  };

  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-800 dark:text-white">{value}</p>
      <p className="mt-0.5 text-xs opacity-60">{detail}</p>
    </div>
  );
}

function DriverCard({
  driver,
  selected,
  hasActiveAssignment,
  onClick,
}: {
  driver: ApiDriver;
  selected: boolean;
  hasActiveAssignment: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={hasActiveAssignment}
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition-all ${
        hasActiveAssignment
          ? "cursor-not-allowed opacity-40 bg-gray-50 dark:bg-white/[0.02] border-gray-200 dark:border-white/[0.06]"
          : selected
          ? "border-brand-400 dark:border-brand-500 bg-brand-50 dark:bg-brand-500/10 shadow-sm ring-1 ring-brand-300 dark:ring-brand-500/30"
          : "border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] hover:border-brand-300 dark:hover:border-brand-500/40 hover:bg-brand-50/50 dark:hover:bg-brand-500/5"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-500/20 text-xs font-bold text-brand-700 dark:text-brand-300">
          {driver.photoUrl ? (
            <img src={driver.photoUrl} alt={driver.name} className="h-9 w-9 rounded-full object-cover" />
          ) : (
            getInitials(driver.name)
          )}
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

function AssetCard({
  asset,
  selected,
  onClick,
}: {
  asset: Asset;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition-all ${
        selected
          ? "border-brand-400 dark:border-brand-500 bg-brand-50 dark:bg-brand-500/10 shadow-sm ring-1 ring-brand-300 dark:ring-brand-500/30"
          : "border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] hover:border-brand-300 dark:hover:border-brand-500/40 hover:bg-brand-50/50 dark:hover:bg-brand-500/5"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400">
          <CarIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">{asset.plate}</p>
          <p className="truncate text-xs text-gray-400 dark:text-gray-500">
            {asset.brand} {asset.model}
          </p>
        </div>
      </div>
    </button>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export function AssignmentsPage() {
  const { can } = usePermissions();

  const canCreate   = can("gestion", "asignaciones", "crear");
  const canFinalize = can("gestion", "asignaciones", "editar");  // finalizar = editar

  const { assets, loading: assetsLoading } = useAssets();
  const { drivers, loading: driversLoading } = useDrivers();
  const { assignments, loading: assignmentsLoading, createAssignment, finalizeAssignment } =
    useAssignments();

  const loading = assetsLoading || driversLoading || assignmentsLoading;

  // ── view mode ────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<"board" | "table">("board");

  // ── board selection state ─────────────────────────────────────────────────
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  // ── confirm modal state ───────────────────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmForm, setConfirmForm] = useState({
    startDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [confirmLoading, setConfirmLoading] = useState(false);

  // ── detail drawer state ───────────────────────────────────────────────────
  const [drawerAssignmentId, setDrawerAssignmentId] = useState<string | null>(null);

  // ── table search ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState("");

  // ── derived data ──────────────────────────────────────────────────────────
  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status === "Activa"),
    [assignments]
  );

  const availableAssets = useMemo(
    () => assets.filter((asset) => !activeAssignments.some((a) => a.assetId === asset.id)),
    [assets, activeAssignments]
  );

  const unassignedDrivers = useMemo(
    () => drivers.filter((d) => !activeAssignments.some((a) => a.driverId === d.id)),
    [drivers, activeAssignments]
  );

  const rows = useMemo(
    () =>
      assignments
        .map((a) => {
          const asset = assets.find((x) => x.id === a.assetId);
          const driver = drivers.find((x) => x.id === a.driverId);
          return {
            ...a,
            driverCode: driver?.code ?? "—",
            driverName: driver?.name ?? "Sin conductor",
            plate: asset?.plate ?? a.assetId,
            unit: asset ? `${asset.brand} ${asset.model}` : a.assetId,
          };
        })
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [assignments, assets, drivers]
  );

  const filteredRows = useMemo(() => {
    const v = query.trim().toLowerCase();
    if (!v) return rows;
    return rows.filter(
      (r) =>
        r.driverCode.toLowerCase().includes(v) ||
        r.driverName.toLowerCase().includes(v) ||
        r.plate.toLowerCase().includes(v) ||
        r.unit.toLowerCase().includes(v)
    );
  }, [rows, query]);

  const drawerAssignment = useMemo(
    () => (drawerAssignmentId ? rows.find((r) => r.id === drawerAssignmentId) : null),
    [drawerAssignmentId, rows]
  );

  // ── actions ───────────────────────────────────────────────────────────────

  function handleDriverClick(driverId: string) {
    if (!canCreate) return;
    setSelectedDriverId((prev) => (prev === driverId ? null : driverId));
    setSelectedAssetId(null);
  }

  function handleAssetClick(assetId: string) {
    if (!canCreate) return;
    if (!selectedDriverId) {
      toast.warning("Selecciona primero un conductor");
      return;
    }
    setSelectedAssetId((prev) => (prev === assetId ? null : assetId));
    if (selectedAssetId !== assetId) {
      setConfirmForm({ startDate: new Date().toISOString().slice(0, 10), notes: "" });
      setConfirmOpen(true);
    }
  }

  async function handleConfirm() {
    if (!selectedDriverId || !selectedAssetId) return;
    setConfirmLoading(true);
    try {
      await createAssignment({
        assetId: selectedAssetId,
        driverId: selectedDriverId,
        startDate: confirmForm.startDate,
        endDate: null,
        status: "Activa",
        notes: confirmForm.notes,
        handoverFileName: "",
      });
      toast.success("Asignación creada correctamente");
      setConfirmOpen(false);
      setSelectedDriverId(null);
      setSelectedAssetId(null);
    } catch {
      toast.error("No se pudo crear la asignación");
    } finally {
      setConfirmLoading(false);
    }
  }

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
          <h1 className="mt-2 text-2xl font-bold text-gray-800 dark:text-white">
            Gestión de asignaciones
          </h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Conecta conductores con vehículos, controla asignaciones activas y gestiona el historial.
          </p>
        </div>
        {/* view toggle */}
        <div className="flex items-center gap-1 self-start rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => setViewMode("board")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              viewMode === "board"
                ? "bg-white dark:bg-white/[0.08] text-gray-800 dark:text-white shadow-sm"
                : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
          >
            Tablero
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              viewMode === "table"
                ? "bg-white dark:bg-white/[0.08] text-gray-800 dark:text-white shadow-sm"
                : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
          >
            Historial
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <KpiCard label="Activas" value={activeAssignments.length} detail="Relaciones en curso" tone="brand" />
        <KpiCard label="Finalizadas" value={assignments.filter((a) => a.status !== "Activa").length} detail="Historial cerrado" tone="gray" />
        <KpiCard label="Vehículos libres" value={availableAssets.length} detail="Sin asignación activa" tone="success" />
        <KpiCard label="Conductores libres" value={unassignedDrivers.length} detail="Disponibles para asignar" tone="warning" />
      </section>

      {/* ── BOARD VIEW ── */}
      {viewMode === "board" && (
        <div className="space-y-4">
          {/* connection board */}
          <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] overflow-hidden">
            <div className="border-b border-gray-200 dark:border-white/[0.06] px-5 py-4">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                Tablero de conexión
              </h2>
              <p className="mt-0.5 text-sm text-gray-400 dark:text-gray-500">
                {canCreate
                  ? "Selecciona un conductor → luego un vehículo para crear la asignación."
                  : "Solo lectura — no tienes permiso para crear asignaciones."}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
              {/* drivers column */}
              <div className="border-b border-gray-200 dark:border-white/[0.06] md:border-b-0 md:border-r p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Conductores disponibles ({drivers.length})
                </p>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {drivers.length === 0 && (
                    <p className="text-sm text-gray-400 dark:text-gray-500">Sin conductores registrados.</p>
                  )}
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

              {/* assets column */}
              <div className="p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Vehículos disponibles ({availableAssets.length})
                </p>
                {canCreate && !selectedDriverId && (
                  <div className="mb-3 rounded-xl border border-dashed border-brand-200 dark:border-brand-500/30 bg-brand-50/50 dark:bg-brand-500/5 px-4 py-3">
                    <p className="text-xs text-brand-600 dark:text-brand-400">
                      ← Primero selecciona un conductor
                    </p>
                  </div>
                )}
                {!canCreate && (
                  <div className="mb-3 rounded-xl border border-dashed border-gray-200 dark:border-white/[0.06] px-4 py-3">
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Sin permiso para crear asignaciones.
                    </p>
                  </div>
                )}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {availableAssets.length === 0 && (
                    <p className="text-sm text-gray-400 dark:text-gray-500">Todos los vehículos están asignados.</p>
                  )}
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

          {/* active assignments pairs */}
          {activeAssignments.length > 0 && (
            <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] overflow-hidden">
              <div className="border-b border-gray-200 dark:border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                  Asignaciones activas
                </h2>
                <p className="mt-0.5 text-sm text-gray-400 dark:text-gray-500">
                  Pares conductor ↔ vehículo en curso.
                </p>
              </div>
              <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
                {activeAssignments.map((a) => {
                  const asset = assets.find((x) => x.id === a.assetId);
                  const driver = drivers.find((x) => x.id === a.driverId);
                  const days = daysSince(a.startDate);
                  return (
                    <div
                      key={a.id}
                      className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-500/20 text-xs font-bold text-brand-700 dark:text-brand-300">
                            {driver ? getInitials(driver.name) : "?"}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800 dark:text-white leading-tight">
                              {driver?.name ?? "—"}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">{driver?.code}</p>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-success-50 dark:bg-success-500/10 px-2 py-0.5 text-[10px] font-semibold text-success-600 dark:text-success-400 border border-success-200 dark:border-success-500/20">
                          Activa
                        </span>
                      </div>

                      {/* separator with arrows icon */}
                      <div className="my-3 flex items-center gap-2">
                        <div className="h-px flex-1 bg-gray-200 dark:bg-white/[0.06]" />
                        <span className="text-gray-400 dark:text-gray-500">
                          <ArrowsUpDownIcon className="h-3.5 w-3.5" />
                        </span>
                        <div className="h-px flex-1 bg-gray-200 dark:bg-white/[0.06]" />
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400">
                          <CarIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800 dark:text-white leading-tight">
                            {asset?.plate ?? "—"}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {asset ? `${asset.brand} ${asset.model}` : "—"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {days === 0 ? "Hoy" : `${days}d activa`} · {a.startDate}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setDrawerAssignmentId(a.id)}
                            className="rounded-lg border border-gray-200 dark:border-white/[0.06] px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
                          >
                            Detalle
                          </button>
                          {canFinalize && (
                            <button
                              type="button"
                              onClick={() => handleFinalize(a.id, asset?.plate ?? a.assetId)}
                              className="rounded-lg border border-error-200 dark:border-error-500/20 px-2.5 py-1 text-xs font-medium text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-500/10 transition-colors"
                            >
                              Finalizar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
              <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                Historial de asignaciones
              </h2>
              <p className="mt-0.5 text-sm text-gray-400 dark:text-gray-500">
                {assignments.length} registros en total
              </p>
            </div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por conductor, placa…"
              className="w-full rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-brand-400 dark:focus:border-brand-500 transition-colors sm:w-64"
            />
          </div>

          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm font-medium text-gray-400 dark:text-gray-500">Sin registros</p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">No hay asignaciones para el filtro aplicado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02]">
                    {["#", "Acciones", "Documento", "Vehículo", "Fecha", "Estado", "Acta"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => (
                    <tr
                      key={row.id}
                      className="border-b border-gray-100 dark:border-white/[0.04] last:border-0 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3.5 text-sm text-gray-400 dark:text-gray-500">{index + 1}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setDrawerAssignmentId(row.id)}
                            className="rounded-lg border border-gray-200 dark:border-white/[0.06] px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
                          >
                            Detalle
                          </button>
                          {canFinalize && row.status === "Activa" && (
                            <button
                              type="button"
                              onClick={() => handleFinalize(row.id, row.plate)}
                              className="rounded-lg border border-error-200 dark:border-error-500/20 px-2.5 py-1 text-xs font-medium text-error-600 dark:text-error-400 hover:bg-error-50 dark:hover:bg-error-500/10 transition-colors"
                            >
                              Finalizar
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{row.driverCode}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{row.driverName}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{row.plate}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{row.unit}</p>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300">{row.startDate}</td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                            row.status === "Activa"
                              ? "bg-success-50 dark:bg-success-500/10 border-success-200 dark:border-success-500/20 text-success-600 dark:text-success-400"
                              : "bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-400 dark:text-gray-500">
                        {row.handoverFileName ? (
                          <a
                            href={row.handoverFileName}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-600 dark:text-brand-400 underline underline-offset-2 hover:opacity-80"
                          >
                            Ver acta
                          </a>
                        ) : (
                          "Sin acta"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CONFIRM MODAL ── */}
      <AnimatePresence>
        {confirmOpen && canCreate && selectedDriverId && selectedAssetId && (() => {
          const driver = drivers.find((d) => d.id === selectedDriverId);
          const asset = assets.find((a) => a.id === selectedAssetId);
          return (
            <motion.div
              key="confirm-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-gray-950/50 backdrop-blur-sm"
              onClick={() => setConfirmOpen(false)}
            >
              <motion.div
                key="confirm-modal"
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-gray-200 dark:border-white/[0.06] px-5 py-4">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-white">Confirmar asignación</h2>
                  <p className="mt-0.5 text-sm text-gray-400 dark:text-gray-500">
                    Revisa los datos antes de crear la relación operativa.
                  </p>
                </div>

                <div className="px-5 py-5 space-y-4">
                  {/* summary */}
                  <div className="rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] divide-y divide-gray-100 dark:divide-white/[0.04]">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-500/20 text-xs font-bold text-brand-700 dark:text-brand-300">
                        {driver ? getInitials(driver.name) : "?"}
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 dark:text-gray-500">Conductor</p>
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{driver?.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400">
                        <CarIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 dark:text-gray-500">Vehículo</p>
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">
                          {asset?.plate} · {asset?.brand} {asset?.model}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* date */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                      Fecha de asignación
                    </label>
                    <input
                      type="date"
                      value={confirmForm.startDate}
                      onChange={(e) => setConfirmForm((f) => ({ ...f, startDate: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-gray-800 dark:text-white outline-none focus:border-brand-400 dark:focus:border-brand-500 transition-colors"
                    />
                  </div>

                  {/* notes */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                      Observaciones (opcional)
                    </label>
                    <textarea
                      rows={3}
                      value={confirmForm.notes}
                      onChange={(e) => setConfirmForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="Condiciones de entrega, novedades…"
                      className="w-full resize-none rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-brand-400 dark:focus:border-brand-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-white/[0.06] px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                    className="rounded-xl border border-gray-200 dark:border-white/[0.06] px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={confirmLoading}
                    className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
                  >
                    {confirmLoading ? "Guardando…" : "Confirmar asignación"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── DETAIL DRAWER ── */}
      <AnimatePresence>
        {drawerAssignment && (
          <>
            <motion.div
              key="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-gray-950/40 backdrop-blur-sm"
              onClick={() => setDrawerAssignmentId(null)}
            />
            <motion.div
              key="drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 350, damping: 35 }}
              className="fixed right-0 top-0 z-50 h-full w-full max-w-sm border-l border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto"
            >
              {/* drawer header */}
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-bold text-gray-800 dark:text-white">Detalle de asignación</h2>
                <button
                  type="button"
                  onClick={() => setDrawerAssignmentId(null)}
                  className="rounded-lg border border-gray-200 dark:border-white/[0.06] p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-5 px-5 py-5">
                {/* driver section */}
                {(() => {
                  const driver = drivers.find((d) => d.id === drawerAssignment.driverId);
                  return (
                    <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        Conductor
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-500/20 text-sm font-bold text-brand-700 dark:text-brand-300 overflow-hidden">
                          {driver?.photoUrl ? (
                            <img src={driver.photoUrl} alt={driver.name} className="h-12 w-12 object-cover" />
                          ) : (
                            driver ? getInitials(driver.name) : "?"
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 dark:text-white">{driver?.name ?? "—"}</p>
                          <p className="text-sm text-gray-400 dark:text-gray-500">{driver?.code}</p>
                          {driver?.licenseType && (
                            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                              Lic. {driver.licenseType} · vence {driver.licenseExpiry}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* asset section */}
                {(() => {
                  const asset = assets.find((a) => a.id === drawerAssignment.assetId);
                  return (
                    <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        Vehículo
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400">
                          <CarIcon className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 dark:text-white">{asset?.plate ?? "—"}</p>
                          <p className="text-sm text-gray-400 dark:text-gray-500">
                            {asset ? `${asset.brand} ${asset.model} ${asset.year}` : "—"}
                          </p>
                          {asset?.color && (
                            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                              Color: {asset.color}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* assignment meta */}
                <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] divide-y divide-gray-100 dark:divide-white/[0.04]">
                  {[
                    { label: "Fecha inicio", value: drawerAssignment.startDate },
                    {
                      label: "Días activa",
                      value:
                        drawerAssignment.status === "Activa"
                          ? `${daysSince(drawerAssignment.startDate)} días`
                          : "Finalizada",
                    },
                    { label: "Estado", value: drawerAssignment.status },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between px-4 py-3">
                      <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
                      <span className="text-sm font-medium text-gray-800 dark:text-white">{value}</span>
                    </div>
                  ))}
                </div>

                {/* handover */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Acta de entrega
                  </p>
                  {drawerAssignment.handoverFileName ? (
                    <a
                      href={drawerAssignment.handoverFileName}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl border border-brand-200 dark:border-brand-500/20 bg-brand-50 dark:bg-brand-500/10 px-4 py-3 text-sm font-medium text-brand-600 dark:text-brand-400 hover:opacity-80 transition-opacity"
                    >
                      <DocumentIcon className="h-4 w-4 shrink-0" />
                      Ver acta adjunta
                    </a>
                  ) : (
                    <p className="rounded-xl border border-dashed border-gray-200 dark:border-white/[0.06] px-4 py-3 text-sm text-gray-400 dark:text-gray-500 text-center">
                      Sin acta adjunta
                    </p>
                  )}
                </div>

                {/* notes */}
                {drawerAssignment.notes && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      Observaciones
                    </p>
                    <p className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {drawerAssignment.notes}
                    </p>
                  </div>
                )}

                {/* finalize action */}
                {canFinalize && drawerAssignment.status === "Activa" && (
                  <button
                    type="button"
                    onClick={() => handleFinalize(drawerAssignment.id, drawerAssignment.plate)}
                    className="w-full rounded-xl border border-error-200 dark:border-error-500/20 bg-error-50 dark:bg-error-500/10 py-2.5 text-sm font-semibold text-error-600 dark:text-error-400 hover:bg-error-100 dark:hover:bg-error-500/20 transition-colors"
                  >
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