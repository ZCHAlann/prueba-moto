import { Link } from "react-router";
import { useEffect, useRef, useMemo, useState } from "react";
import { toast } from "sonner";
import { useMotors } from "../../hooks/useMotors";
import { StatusPill } from "../../components/common/StatusPill";
import { ModulePageHeader } from "../../components/features/modules/ModulePageHeader";
import { Search, Plus, MoreVertical, Eye, Pencil, Trash2, Cpu, AlertTriangle } from "lucide-react";
import { MotorCreateModal } from "../../components/motors/motor-create-modal";
import { MotorEditModal } from "../../components/motors/motor-editar-modal";
import type { Asset } from "../../types/activo";
import { useNavigate } from "react-router";
import { usePermissions } from "../../hooks/usePermissions";

/* ── Confirm delete dialog ── */
function ConfirmDeleteDialog({
  motor,
  onConfirm,
  onCancel,
  loading,
}: {
  motor: Asset;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0f1623]">
        <div className="px-6 pb-4 pt-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/10">
            <AlertTriangle size={18} className="text-rose-500" />
          </div>
          <h3 className="text-base font-bold text-gray-800 dark:text-white">Eliminar motor</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            El motor saldrá del inventario técnico de la empresa activa.
          </p>
        </div>

        <div className="mx-6 mb-5 rounded-xl border border-gray-100 bg-gray-50 p-3.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
          {[
            { label: "Código",    value: motor.code },
            { label: "Serie",     value: motor.serial ?? "—" },
            { label: "Estado",    value: motor.status },
            { label: "Ubicación", value: motor.location ?? "—" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-1">
              <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{value}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-rose-500 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 active:scale-95 disabled:opacity-60"
          >
            {loading ? "Eliminando..." : "Eliminar motor"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Stat card ── */
function StatCard({
  label,
  value,
  detail,
  tone,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "info" | "success" | "warning" | "neutral";
  icon?: React.ReactNode;
}) {
  const toneMap = {
    info: {
      bg: "bg-blue-50 dark:bg-blue-500/10",
      text: "text-blue-600 dark:text-blue-400",
      bar: "bg-blue-400",
    },
    success: {
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
      text: "text-emerald-600 dark:text-emerald-400",
      bar: "bg-emerald-400",
    },
    warning: {
      bg: "bg-amber-50 dark:bg-amber-500/10",
      text: "text-amber-600 dark:text-amber-400",
      bar: "bg-amber-400",
    },
    neutral: {
      bg: "bg-gray-100 dark:bg-white/[0.05]",
      text: "text-gray-500 dark:text-gray-400",
      bar: "bg-gray-300 dark:bg-gray-600",
    },
  };
  const t = toneMap[tone];

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 transition-all duration-200 hover:shadow-md dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${t.bar} opacity-60`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {label}
          </p>
          <h4 className="mt-2 text-3xl font-bold tabular-nums text-gray-800 dark:text-white">
            {value}
          </h4>
          <p className="mt-1.5 truncate text-xs text-gray-400 dark:text-gray-500">{detail}</p>
        </div>
        <div className={`shrink-0 rounded-xl p-2.5 ${t.bg}`}>
          <span className={t.text}>{icon ?? <Cpu size={16} />}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Row actions dropdown ── */
function RowActions({
  motor,
  onDelete,
  onEdit,
  canEdit,
  canDelete,
}: {
  motor: Asset;
  onDelete: (m: Asset) => void;
  onEdit: (m: Asset) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Si no tiene ninguna acción disponible, no mostrar el menú
  if (!canEdit && !canDelete) return null;

  return (
    <div ref={ref} className="relative flex justify-end">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Acciones"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition-all hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700 dark:border-white/[0.08] dark:hover:bg-white/[0.05] dark:hover:text-gray-300"
      >
        <MoreVertical size={15} />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-white/[0.08] dark:bg-gray-900 dark:ring-white/5">
          <Link
            to={`/motores/${motor.id}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            <Eye size={14} className="text-gray-400" />
            Ver detalle
          </Link>
          {canEdit && (
            <button
              type="button"
              onClick={() => { setOpen(false); onEdit(motor); }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              <Pencil size={14} className="text-gray-400" />
              Editar
            </button>
          )}
          {canDelete && (
            <>
              <div className="mx-3 border-t border-gray-100 dark:border-white/[0.06]" />
              <button
                type="button"
                onClick={() => { setOpen(false); onDelete(motor); }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
              >
                <Trash2 size={14} />
                Eliminar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Empty state ── */
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-white/[0.05]">
        <Cpu size={24} className="text-gray-400 dark:text-gray-500" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
          {hasFilters ? "Sin coincidencias" : "Sin motores registrados"}
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          {hasFilters
            ? "Prueba ajustando los filtros de búsqueda."
            : "Registra el primer motor para comenzar."}
        </p>
      </div>
    </div>
  );
}

/* ── Main page ── */
export function MotorsPage() {
  const { motors, deleteMotor } = useMotors();
  const { can } = usePermissions();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos");
  const [showModal, setShowModal] = useState(false);
  const [motorToEdit, setMotorToEdit] = useState<Asset | null>(null);
  const [motorToDelete, setMotorToDelete] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const canCreate = can("motores", "lista_motores", "crear");
  const canEdit   = can("motores", "lista_motores", "editar");
  const canDelete = can("motores", "lista_motores", "eliminar");

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return motors.filter((motor) => {
      const matchesQuery =
        value.length === 0 ||
        motor.code.toLowerCase().includes(value) ||
        (motor.serial ?? "").toLowerCase().includes(value) ||
        (motor.brand ?? "").toLowerCase().includes(value) ||
        (motor.model ?? "").toLowerCase().includes(value);
      const matchesStatus = status === "Todos" || motor.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [motors, query, status]);

  const statusTone = (s: string) =>
    s === "Operativo" ? "success" : s === "En mantenimiento" ? "warning" : "danger";

  const hasFilters = query.trim().length > 0 || status !== "Todos";

  const handleConfirmDelete = async () => {
    if (!motorToDelete) return;
    setDeleting(true);
    try {
      const ok = await deleteMotor(motorToDelete.id);
      if (ok) {
        toast.success("Motor eliminado", {
          description: "El registro técnico fue retirado correctamente.",
        });
        setMotorToDelete(null);
      } else {
        toast.error("No se pudo eliminar el motor", {
          description: "Intenta de nuevo o contacta al soporte.",
        });
      }
    } catch {
      toast.error("Error inesperado", {
        description: "No se pudo completar la operación.",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Dominio técnico"
        title="Motores"
        subtitle="Inventario técnico de motores registrados en la empresa."
        accent="orange"
        action={
          canCreate ? (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 active:scale-95"
            >
              <Plus size={16} />
              Nuevo motor
            </button>
          ) : undefined
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:gap-5 xl:grid-cols-4">
        <StatCard label="Total"             value={motors.length.toString()}                                                detail="Base técnica registrada" tone="info"    />
        <StatCard label="Operativos"        value={motors.filter((m) => m.status === "Operativo").length.toString()}        detail="Listos para uso"         tone="success" />
        <StatCard label="Mantenimiento"     value={motors.filter((m) => m.status === "En mantenimiento").length.toString()} detail="Intervenidos por taller" tone="warning" />
        <StatCard label="Fuera de servicio" value={motors.filter((m) => m.status === "Fuera de servicio").length.toString()} detail="Fuera de operación"      tone="neutral" />
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Código, serie, marca o modelo..."
              className="h-10 w-full rounded-xl border border-gray-200 bg-transparent pl-9 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 dark:border-white/[0.08] dark:text-white dark:placeholder:text-gray-500"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300"
          >
            {["Todos", "Operativo", "En mantenimiento", "Fuera de servicio"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Lista de motores</h3>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {filtered.length} {filtered.length !== 1 ? "resultados" : "resultado"}
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); setStatus("Todos"); }}
                  className="ml-2 text-orange-500 underline-offset-2 hover:underline"
                >
                  Limpiar filtros
                </button>
              )}
            </p>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState hasFilters={hasFilters} />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                    {["Código", "Serie", "Motor", "Aceite", "Ubicación", "Estado", ""].map((h, i) => (
                      <th key={i} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                  {filtered.map((motor) => (
                    <tr
                      key={motor.id}
                      onClick={() => navigate(`/motores/${motor.id}`)}
                      className="group transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02] cursor-pointer"
                    >
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-orange-400 opacity-0 transition-opacity group-hover:opacity-100" />
                          <span className="text-sm font-semibold text-gray-800 dark:text-white">{motor.code}</span>
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono text-sm text-gray-500 dark:text-gray-400">{motor.serial ?? "—"}</td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{motor.brand} {motor.model}</p>
                        <p className="mt-0.5 text-xs text-gray-400">{motor.year || "—"}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                        <span className="font-medium">{motor.oilType ?? "—"}</span>
                        {motor.oilCapacity && <span className="ml-1 text-gray-400">/ {motor.oilCapacity}</span>}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{motor.location ?? "—"}</td>
                      <td className="px-5 py-4">
                        <StatusPill label={motor.status} tone={statusTone(motor.status)} />
                      </td>
                      <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                        <RowActions
                          motor={motor}
                          onDelete={setMotorToDelete}
                          onEdit={setMotorToEdit}
                          canEdit={canEdit}
                          canDelete={canDelete}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="divide-y divide-gray-100 dark:divide-white/[0.04] md:hidden">
              {filtered.map((motor) => (
                <div key={motor.id} className="space-y-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-gray-800 dark:text-white">{motor.code}</p>
                      <p className="mt-0.5 font-mono text-xs text-gray-400">{motor.serial ?? "—"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill label={motor.status} tone={statusTone(motor.status)} />
                      <RowActions
                        motor={motor}
                        onDelete={setMotorToDelete}
                        onEdit={setMotorToEdit}
                        canEdit={canEdit}
                        canDelete={canDelete}
                      />
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{motor.brand} {motor.model}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
                    {motor.oilType && <span>{motor.oilType}</span>}
                    {motor.oilCapacity && <span>{motor.oilCapacity}</span>}
                    {motor.year && <span>{motor.year}</span>}
                  </div>
                  {motor.location && <p className="text-xs text-gray-400">{motor.location}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {showModal && <MotorCreateModal onClose={() => setShowModal(false)} />}
      {motorToEdit && <MotorEditModal motor={motorToEdit} onClose={() => setMotorToEdit(null)} />}
      {motorToDelete && (
        <ConfirmDeleteDialog
          motor={motorToDelete}
          onConfirm={handleConfirmDelete}
          onCancel={() => setMotorToDelete(null)}
          loading={deleting}
        />
      )}
    </div>
  );
}