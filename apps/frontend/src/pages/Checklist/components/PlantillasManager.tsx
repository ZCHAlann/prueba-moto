"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Wrench, FileText, Trash2, Edit2, GripVertical, X, Check, AlertTriangle,
  Search, Users, CalendarClock, Car, Building2, CircleDot, RefreshCw,
  ChevronRight, ChevronLeft, FileSignature, ListChecks, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  useChecklistCategories, type ChecklistCategory,
  type CadenceKind, type ScopeKind,
} from "../../../hooks/useChecklistCategories";
import { useCompanyUsers } from "../../../hooks/useCompanyUsers";
import { ConfirmModal } from "../../../components/ui/ConfirmModal";
import { usePermissions } from "../../../hooks/usePermissions";

// Roles "de plataforma" (los que el sistema siempre conoce).
const PLATFORM_ROLES: Array<{ key: string; label: string }> = [
  { key: "owner_empresa",  label: "Propietario" },
  { key: "admin_empresa",  label: "Administrador" },
  { key: "supervisor",     label: "Supervisor" },
  { key: "operador",       label: "Operador" },
  { key: "conductor",      label: "Conductor" },
  { key: "mecanico",       label: "Mecánico" },
];

const ASSET_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "Vehiculo",            label: "Vehículo" },
  { value: "Motor",               label: "Motor" },
  { value: "Generador",           label: "Generador" },
  { value: "AireAcondicionado",   label: "Aire acondicionado" },
  { value: "Otro",                label: "Otro" },
];

type Props = {
  /** Llamado cuando el usuario hace click en "Iniciar inspección" desde una plantilla específica. */
  onStartInspection: (plantilla: ChecklistCategory) => void;
};

export function PlantillasManager({ onStartInspection }: Props) {
  const { categories, loading, createCategory, updateCategory, deleteCategory } = useChecklistCategories();
  const { can } = usePermissions();
  // Permisos granulares por submódulo. "checklist.checklist" = gestión de plantillas;
  // "checklist.inspecciones" = ejecutar inspecciones.
  const canCreate     = can("checklist", "checklist", "crear");
  const canEdit       = can("checklist", "checklist", "editar");
  const canDelete     = can("checklist", "checklist", "eliminar");
  const canExecute    = can("checklist", "inspecciones", "crear");

  const [editing, setEditing] = useState<{ kind: "create" } | { kind: "edit"; plantilla: ChecklistCategory } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChecklistCategory | null>(null);
  const [query, setQuery] = useState("");

  const filtered = categories.filter((c) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Header con buscador + crear */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-800 dark:text-white">Plantillas de inspección</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-500">
            {categories.length} plantilla{categories.length !== 1 ? "s" : ""} · define los puntos que se evaluan en cada inspección.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {categories.length > 0 && (
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text" placeholder="Buscar plantilla…"
                value={query} onChange={(e) => setQuery(e.target.value)}
                className="h-9 w-56 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-transparent py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:text-gray-300 dark:placeholder:text-gray-500"
              />
            </div>
          )}
          {canCreate && (
            <button type="button" onClick={() => setEditing({ kind: "create" })}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-500/20 transition active:scale-95">
              <Plus size={14} /> Nueva plantilla
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {!loading && categories.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-500/[0.04] p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-500/15 mb-3">
            <Wrench size={20} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-base font-bold text-gray-800 dark:text-white">Sin plantillas todavía</h2>
          <p className="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
            Crea tu primera plantilla de checklist con los puntos que se deben inspeccionar (frenos, luces, aceite, etc.). Después podrás iniciar inspecciones.
          </p>
          {canCreate && (
            <button type="button" onClick={() => setEditing({ kind: "create" })}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition">
              <Plus size={14} /> Crear primera plantilla
            </button>
          )}
        </div>
      )}

      {/* Listado */}
      {!loading && categories.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Sin resultados para "{query}"
            </div>
          ) : (
            filtered.map((c) => (
              <PlantillaCard
                key={c.id}
                plantilla={c}
                canEdit={canEdit}
                canDelete={canDelete}
                canExecute={canExecute}
                onEdit={() => setEditing({ kind: "edit", plantilla: c })}
                onDelete={() => setPendingDelete(c)}
                onStart={() => onStartInspection(c)}
              />
            ))
          )}
        </div>
      )}

      {/* Editor wizard (4 pasos) */}
      <PlantillaEditorWizard
        target={editing}
        onClose={() => setEditing(null)}
        onCreate={async (input) => {
          try {
            await createCategory(input);
            toast.success("Plantilla creada");
            setEditing(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al crear");
          }
        }}
        onUpdate={async (id, input) => {
          try {
            await updateCategory(id, input);
            toast.success("Plantilla actualizada");
            setEditing(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar");
          }
        }}
      />

      {/* Confirm delete */}
      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          const p = pendingDelete;
          setPendingDelete(null);
          try {
            await deleteCategory(p.id);
            toast.success("Plantilla eliminada", { description: `"${p.name}" se quitó.` });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al eliminar");
          }
        }}
        title="Eliminar plantilla"
        tone="danger"
        confirmLabel="Eliminar"
        description={
          pendingDelete
            ? <>¿Eliminar la plantilla <strong className="text-gray-800 dark:text-white">{pendingDelete.name}</strong>? Las inspecciones ya registradas no se verán afectadas.</>
            : null
        }
      />
    </div>
  );
}

// ── Card de plantilla ─────────────────────────────────────────────────────────

function PlantillaCard({ plantilla, canEdit, canDelete, canExecute, onEdit, onDelete, onStart }: {
  plantilla: ChecklistCategory;
  canEdit: boolean;
  canDelete: boolean;
  canExecute: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStart: () => void;
}) {
  const showActions = canEdit || canDelete;
  return (
    <div className="group rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-4 hover:border-emerald-300 dark:hover:border-emerald-500/30 transition">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{plantilla.name}</p>
            <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              {plantilla.items.length} pts
            </span>
          </div>
          {plantilla.description && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{plantilla.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {plantilla.items.slice(0, 5).map((it) => (
              <span key={it} className="rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2 py-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                {it}
              </span>
            ))}
            {plantilla.items.length > 5 && (
              <span className="rounded-lg bg-gray-100 dark:bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                +{plantilla.items.length - 5} más
              </span>
            )}
          </div>
        </div>
        {showActions && (
          <div className="flex shrink-0 flex-col gap-1 opacity-0 group-hover:opacity-100 transition">
            {canEdit && (
              <button type="button" onClick={onEdit} title="Editar plantilla"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:border-emerald-300 hover:text-emerald-600 dark:hover:border-emerald-500/40 dark:hover:text-emerald-400 transition">
                <Edit2 size={12} />
              </button>
            )}
            {canDelete && (
              <button type="button" onClick={onDelete} title="Eliminar plantilla"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:border-rose-300 hover:text-rose-500 dark:hover:border-rose-500/40 dark:hover:text-rose-400 transition">
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06] flex items-center justify-end">
        {canExecute ? (
          <button type="button" onClick={onStart}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition active:scale-95">
            <Plus size={12} /> Iniciar inspección
          </button>
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Sin permiso para realizar
          </span>
        )}
      </div>
    </div>
  );
}

// ── Editor wizard (crear/editar) ──────────────────────────────────────────────

type PlantillaInput = {
  name: string;
  description: string;
  items: string[];
  targetRoles?: string[];
  targetUserIds?: string[];
  cadenceKind?: CadenceKind;
  cadenceDays?: number | null;
  windowDays?: number;
  scopeKind?: ScopeKind;
  scopeAssetType?: string | null;
  scopeSiteId?: number | null;
};

type PlantillaEditorModalProps = {
  target: { kind: "create" } | { kind: "edit"; plantilla: ChecklistCategory } | null;
  onClose: () => void;
  onCreate: (input: PlantillaInput) => void | Promise<void>;
  onUpdate: (id: string, input: PlantillaInput) => void | Promise<void>;
};

// ─── Stepper config ──────────────────────────────────────────────────────────
const STEPS: Array<{ key: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { key: "basicos",      label: "Básicos",     icon: FileSignature },
  { key: "asignacion",   label: "Asignación",  icon: Users },
  { key: "periodicidad", label: "Periodicidad",icon: CalendarClock },
  { key: "items",        label: "Items",       icon: ListChecks },
];

function PlantillaEditorWizard({ target, onClose, onCreate, onUpdate }: PlantillaEditorModalProps): JSX.Element {
  const isOpen = !!target;
  const isEdit = target?.kind === "edit";

  // ── Estado del wizard
  const [step, setStep] = useState(0);

  // ── Campos básicos
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // ── Asignación
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [targetUserIds, setTargetUserIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState("");

  // ── Periodicidad
  const [cadenceKind, setCadenceKind] = useState<CadenceKind>("none");
  const [cadenceDays, setCadenceDays] = useState<number>(7);
  const [windowDays, setWindowDays] = useState<number>(7);

  // ── Alcance
  const [scopeKind, setScopeKind] = useState<ScopeKind>("pick");
  const [scopeAssetType, setScopeAssetType] = useState<string>("Vehiculo");
  const [scopeSiteId, setScopeSiteId] = useState<number | null>(null);

  // ── Items (último paso)
  const [items, setItems] = useState<string[]>([]);
  const [draftItem, setDraftItem] = useState("");
  const [itemsTouched, setItemsTouched] = useState(false);

  const [saving, setSaving] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  // Hooks auxiliares
  const { users: companyUsers } = useCompanyUsers();

  useEffect(() => {
    if (target?.kind === "create") {
      setName(""); setDescription("");
      setTargetRoles([]); setTargetUserIds([]); setUserSearch("");
      setCadenceKind("none"); setCadenceDays(7); setWindowDays(7);
      setScopeKind("pick"); setScopeAssetType("Vehiculo"); setScopeSiteId(null);
      setItems([]); setDraftItem(""); setItemsTouched(false);
      setStep(0); setStepError(null);
    } else if (target?.kind === "edit") {
      setName(target.plantilla.name);
      setDescription(target.plantilla.description);
      setTargetRoles([...target.plantilla.targetRoles]);
      setTargetUserIds([...target.plantilla.targetUserIds]);
      setUserSearch("");
      setCadenceKind(target.plantilla.cadenceKind);
      setCadenceDays(target.plantilla.cadenceDays ?? 7);
      setWindowDays(target.plantilla.windowDays);
      setScopeKind(target.plantilla.scopeKind);
      setScopeAssetType(target.plantilla.scopeAssetType ?? "Vehiculo");
      setScopeSiteId(target.plantilla.scopeSiteId);
      setItems([...target.plantilla.items]);
      setDraftItem(""); setItemsTouched(false);
      setStep(0); setStepError(null);
    }
  }, [target]);

  const trimmedName = name.trim();

  const handleAddItem = () => {
    const v = draftItem.trim();
    if (!v) return;
    if (items.includes(v)) { setDraftItem(""); return; }
    setItems([...items, v]);
    setDraftItem("");
  };

  const handleRemoveItem = (i: number) => {
    setItems(items.filter((_, idx) => idx !== i));
  };

  const handleMove = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };

  const handleToggleRole = (key: string) => {
    setTargetRoles((prev) => prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]);
  };

  const handleToggleUser = (id: string) => {
    setTargetUserIds((prev) => prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]);
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return companyUsers.slice(0, 20);
    return companyUsers
      .filter((u) => {
        const name = `${u.username ?? ""} ${u.email ?? ""}`.toLowerCase();
        return name.includes(q);
      })
      .slice(0, 20);
  }, [companyUsers, userSearch]);

  // ── Validación por paso
  function canAdvanceFromStep(s: number): { ok: boolean; reason?: string } {
    if (s === 0) {
      if (trimmedName.length < 2) return { ok: false, reason: "El nombre debe tener al menos 2 caracteres." };
      return { ok: true };
    }
    if (s === 2) {
      if (cadenceKind === "days" && (cadenceDays == null || cadenceDays < 1)) {
        return { ok: false, reason: "Define cada cuántos días se repite." };
      }
      if (scopeKind === "asset_type" && !scopeAssetType) {
        return { ok: false, reason: "Selecciona un tipo de activo." };
      }
      return { ok: true };
    }
    if (s === 3) {
      if (items.length === 0) return { ok: false, reason: "Agrega al menos un punto a inspeccionar." };
      return { ok: true };
    }
    return { ok: true };
  }

  function handleNext() {
    const r = canAdvanceFromStep(step);
    if (!r.ok) {
      setStepError(r.reason ?? "Revisa este paso antes de continuar.");
      if (step === 3) setItemsTouched(true);
      return;
    }
    setStepError(null);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function handlePrev() {
    setStepError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function handleJumpTo(s: number) {
    // Solo permite ir a pasos ya visitados, o al siguiente inmediato si el actual pasa validación
    if (s < step) {
      setStepError(null);
      setStep(s);
      return;
    }
    if (s === step + 1) {
      handleNext();
      return;
    }
    // Saltos hacia adelante lejanos: exige validar todos los intermedios.
    for (let i = step; i < s; i++) {
      const r = canAdvanceFromStep(i);
      if (!r.ok) {
        setStepError(r.reason ?? "Revisa los pasos anteriores.");
        setStep(i);
        return;
      }
    }
    setStepError(null);
    setStep(s);
  }

  const handleSubmit = async () => {
    // Validar todos los pasos
    for (let s = 0; s < STEPS.length; s++) {
      const r = canAdvanceFromStep(s);
      if (!r.ok) {
        setStepError(r.reason ?? "Revisa los pasos.");
        setStep(s);
        if (s === 3) setItemsTouched(true);
        return;
      }
    }
    setSaving(true);
    try {
      const input: PlantillaInput = {
        name: trimmedName,
        description: description.trim(),
        items,
        targetRoles,
        targetUserIds,
        cadenceKind,
        cadenceDays: cadenceKind === "days" ? cadenceDays : null,
        windowDays,
        scopeKind,
        scopeAssetType: scopeKind === "asset_type" ? scopeAssetType : null,
        scopeSiteId: scopeKind !== "pick" ? scopeSiteId : null,
      };
      if (target?.kind === "edit") {
        await onUpdate(target.plantilla.id, input);
      } else {
        await onCreate(input);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2"
          >
            <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.06] shrink-0">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    {isEdit ? "Editar" : "Nueva"} plantilla
                  </p>
                  <h2 className="mt-0.5 text-base font-semibold text-gray-800 dark:text-white">
                    {isEdit ? "Modificar plantilla" : "Crear plantilla de inspección"}
                  </h2>
                </div>
                <button type="button" onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition">
                  <X size={14} />
                </button>
              </div>

              {/* Stepper */}
              <div className="flex items-center gap-1.5 border-b border-gray-100 dark:border-white/[0.04] bg-gray-50/40 dark:bg-white/[0.02] px-4 py-2.5 shrink-0 overflow-x-auto">
                {STEPS.map((s, i) => {
                  const completed = i < step;
                  const active = i === step;
                  const reachable = i <= step;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => reachable && handleJumpTo(i)}
                      className={`group flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                        active
                          ? "bg-emerald-500 text-white shadow-sm"
                          : completed
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : reachable
                          ? "bg-gray-200 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                          : "bg-gray-100 text-gray-400 dark:bg-white/[0.03] dark:text-gray-500"
                      } ${reachable ? "cursor-pointer hover:opacity-90" : "cursor-not-allowed"}`}
                      title={s.label}
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/30 text-[9px] tabular-nums">
                        {completed ? <Check size={9} strokeWidth={3} /> : i + 1}
                      </span>
                      {s.label}
                    </button>
                  );
                })}
              </div>

              {/* Body del step activo */}
              <div className="px-5 py-4 overflow-y-auto flex-1">
                <AnimatePresence mode="wait">
                  {step === 0 && (
                    <motion.div key="s0" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }} className="space-y-3.5">
                      <div className="flex items-center gap-2">
                        <FileSignature size={14} className="text-emerald-600 dark:text-emerald-400" />
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-700 dark:text-gray-300">
                          Paso 1 · Datos básicos
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                          Nombre de la plantilla *
                        </label>
                        <input
                          type="text" value={name} maxLength={80} autoFocus
                          onChange={(e) => setName(e.target.value.slice(0, 80))}
                          placeholder="Ej. Revisión semanal de vehículo"
                          className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                          Descripción
                        </label>
                        <textarea
                          value={description} maxLength={500}
                          onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                          placeholder="Uso recomendado o condición de aplicación (opcional)" rows={3}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition resize-none"
                        />
                      </div>
                    </motion.div>
                  )}

                  {step === 1 && (
                    <motion.div key="s1" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }} className="space-y-3.5">
                      <div className="flex items-center gap-2">
                        <Users size={14} className="text-emerald-600 dark:text-emerald-400" />
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-700 dark:text-gray-300">
                          Paso 2 · Asignación
                        </p>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Si no marcas nada, esta plantilla es visible para todos los usuarios de la empresa. Si marcas al menos un rol o usuario, solo ellos la verán.
                      </p>
                      <div>
                        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                          Roles
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {PLATFORM_ROLES.map((r) => {
                            const active = targetRoles.includes(r.key);
                            return (
                              <button
                                key={r.key}
                                type="button"
                                onClick={() => handleToggleRole(r.key)}
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                                  active
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
                                    : "border-gray-200 bg-white text-gray-600 hover:border-emerald-200 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-400"
                                }`}
                              >
                                {active ? <Check size={10} /> : <CircleDot size={10} />}
                                {r.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                          Usuarios específicos
                        </label>
                        <div className="relative">
                          <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                            placeholder="Buscar usuario..."
                            className="h-8 w-full rounded-lg border border-gray-200 bg-white pl-7 pr-3 text-xs text-gray-800 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                          />
                        </div>
                        <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/40 p-1 dark:border-white/[0.04] dark:bg-white/[0.02]">
                          {filteredUsers.length === 0 ? (
                            <p className="px-2 py-1.5 text-[11px] text-gray-400">Sin resultados.</p>
                          ) : (
                            filteredUsers.map((u) => {
                              const id = String(u.id);
                              const active = targetUserIds.includes(id);
                              const label = u.username || u.email;
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => handleToggleUser(id)}
                                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition ${
                                    active
                                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                                      : "hover:bg-gray-100 dark:hover:bg-white/[0.05] text-gray-700 dark:text-gray-300"
                                  }`}
                                >
                                  <span className="truncate">{label}</span>
                                  {active && <Check size={11} />}
                                </button>
                              );
                            })
                          )}
                        </div>
                        {targetUserIds.length > 0 && (
                          <p className="mt-1 text-[10px] text-gray-500">
                            {targetUserIds.length} {targetUserIds.length === 1 ? "usuario seleccionado" : "usuarios seleccionados"}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {step === 2 && (
                    <motion.div key="s2" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }} className="space-y-3.5">
                      <div className="flex items-center gap-2">
                        <CalendarClock size={14} className="text-emerald-600 dark:text-emerald-400" />
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-700 dark:text-gray-300">
                          Paso 3 · Periodicidad y alcance
                        </p>
                      </div>
                      {/* Periodicidad */}
                      <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] p-3 space-y-3">
                        <div className="flex items-center gap-2">
                          <RefreshCw size={12} className="text-gray-500" />
                          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-700 dark:text-gray-300">
                            Periodicidad
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                          {([
                            { v: "none",   label: "Sin periodicidad", icon: <X size={10} /> },
                            { v: "weekly", label: "Semanal (lun–dom)", icon: <CalendarClock size={10} /> },
                            { v: "days",   label: "Cada N días",       icon: <RefreshCw size={10} /> },
                          ] as Array<{ v: CadenceKind; label: string; icon: React.ReactNode }>).map((opt) => {
                            const active = cadenceKind === opt.v;
                            return (
                              <button
                                key={opt.v}
                                type="button"
                                onClick={() => setCadenceKind(opt.v)}
                                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition ${
                                  active
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
                                    : "border-gray-200 bg-white text-gray-600 hover:border-emerald-200 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-400"
                                }`}
                              >
                                {opt.icon}
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                        {cadenceKind === "days" && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                                Cada cuántos días
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={365}
                                value={cadenceDays}
                                onChange={(e) => setCadenceDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:border-emerald-400 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                                Ventana (días)
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={60}
                                value={windowDays}
                                onChange={(e) => setWindowDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:border-emerald-400 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                              />
                            </div>
                          </div>
                        )}
                        {cadenceKind === "weekly" && (
                          <div>
                            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                              Ventana (días desde el lunes)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={7}
                              value={windowDays}
                              onChange={(e) => setWindowDays(Math.max(1, Math.min(7, Number(e.target.value) || 1)))}
                              className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:border-emerald-400 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                            />
                          </div>
                        )}
                        {cadenceKind !== "none" && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            El usuario tendrá {windowDays} {windowDays === 1 ? "día" : "días"} desde el inicio del ciclo para hacerla. Pasado ese tiempo, el pendiente pasa al historial como vencido.
                          </p>
                        )}
                      </div>
                      {/* Alcance */}
                      <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] p-3 space-y-3">
                        <div className="flex items-center gap-2">
                          <Car size={12} className="text-gray-500" />
                          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-700 dark:text-gray-300">
                            Alcance de activos
                          </p>
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                          {([
                            { v: "pick",         label: "Elegir al hacer",        icon: <Car size={10} /> },
                            { v: "site_assets",  label: "Todos de mi sede",       icon: <Building2 size={10} /> },
                            { v: "asset_type",   label: "Por tipo de activo",     icon: <CircleDot size={10} /> },
                          ] as Array<{ v: ScopeKind; label: string; icon: React.ReactNode }>).map((opt) => {
                            const active = scopeKind === opt.v;
                            return (
                              <button
                                key={opt.v}
                                type="button"
                                onClick={() => setScopeKind(opt.v)}
                                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition ${
                                  active
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
                                    : "border-gray-200 bg-white text-gray-600 hover:border-emerald-200 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-400"
                                }`}
                              >
                                {opt.icon}
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                        {scopeKind === "asset_type" && (
                          <div>
                            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                              Tipo de activo
                            </label>
                            <select
                              value={scopeAssetType}
                              onChange={(e) => setScopeAssetType(e.target.value)}
                              className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:border-emerald-400 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                            >
                              {ASSET_TYPE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          {scopeKind === "pick"        && "El usuario elegirá el vehículo cada vez que abra la inspección."}
                          {scopeKind === "site_assets" && "Aplica a todos los vehículos de la sede del usuario. El sistema generará los pendientes automáticamente."}
                          {scopeKind === "asset_type"  && `Aplica a todos los ${ASSET_TYPE_OPTIONS.find(o => o.value === scopeAssetType)?.label.toLowerCase() ?? "activos"} de la empresa. El sistema generará los pendientes automáticamente.`}
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {step === 3 && (
                    <motion.div key="s3" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }} className="space-y-3.5">
                      <div className="flex items-center gap-2">
                        <ListChecks size={14} className="text-emerald-600 dark:text-emerald-400" />
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-700 dark:text-gray-300">
                          Paso 4 · Puntos a inspeccionar
                        </p>
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                          <Sparkles size={9} />
                          {items.length} {items.length === 1 ? "punto" : "puntos"}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Define los puntos que el usuario evaluará como Correcto / Incorrecto. El orden se mantiene tal como los listes.
                      </p>
                      <div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text" value={draftItem}
                            onChange={(e) => setDraftItem(e.target.value.slice(0, 120))}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddItem(); } }}
                            placeholder="Ej. Frenos delanteros — Escribe y presiona Enter"
                            className="flex-1 h-10 px-3 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition"
                          />
                          <button type="button" onClick={handleAddItem}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:border-emerald-400 hover:text-emerald-600 dark:hover:border-emerald-500/40 dark:hover:text-emerald-400 transition">
                            <Plus size={14} />
                          </button>
                        </div>
                        {items.length > 0 && (
                          <ul className="mt-2 space-y-1.5 max-h-72 overflow-y-auto pr-1">
                            {items.map((it, i) => (
                              <li key={`${it}-${i}`} className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2.5 py-1.5">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                  {i + 1}
                                </span>
                                <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{it}</span>
                                <button type="button" onClick={() => handleMove(i, -1)} disabled={i === 0}
                                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 transition">
                                  <GripVertical size={11} className="rotate-180" />
                                </button>
                                <button type="button" onClick={() => handleMove(i, 1)} disabled={i === items.length - 1}
                                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 transition">
                                  <GripVertical size={11} />
                                </button>
                                <button type="button" onClick={() => handleRemoveItem(i)}
                                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:text-rose-500 dark:hover:text-rose-400 transition">
                                  <X size={12} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {itemsTouched && items.length === 0 && (
                          <p className="mt-1 text-xs text-rose-500 flex items-center gap-1">
                            <AlertTriangle size={11} /> Agrega al menos un punto a inspeccionar.
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Error de paso */}
              {stepError && (
                <div className="mx-5 mb-2 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  <AlertTriangle size={11} />
                  {stepError}
                </div>
              )}

              {/* Footer con navegación */}
              <div className="flex flex-col-reverse gap-2 border-t border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] px-4 py-3 shrink-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <button type="button" onClick={onClose}
                  className="rounded-lg border border-gray-200 dark:border-white/[0.08] px-3.5 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.04] transition">
                  Cancelar
                </button>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={handlePrev} disabled={step === 0}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-white/[0.08] px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition">
                    <ChevronLeft size={13} /> Atrás
                  </button>
                  {step < STEPS.length - 1 ? (
                    <button type="button" onClick={handleNext}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 px-3.5 py-1.5 text-sm font-semibold text-white transition active:scale-95">
                      Siguiente <ChevronRight size={13} />
                    </button>
                  ) : (
                    <button type="button" onClick={handleSubmit} disabled={saving}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-1.5 text-sm font-semibold text-white transition active:scale-95">
                      {saving && <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                      {isEdit ? "Guardar cambios" : "Crear plantilla"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
