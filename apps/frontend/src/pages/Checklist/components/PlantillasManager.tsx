"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Wrench, FileText, Trash2, Edit2, GripVertical, X, Check, AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";
import { useChecklistCategories, type ChecklistCategory } from "../../../hooks/useChecklistCategories";
import { ConfirmModal } from "../../../components/ui/ConfirmModal";
import { usePermissions } from "../../../hooks/usePermissions";

type Props = {
  /** Llamado cuando el usuario hace click en "Iniciar inspección" desde una plantilla específica. */
  onStartInspection: (plantilla: ChecklistCategory) => void;
};

/**
 * Editor inline de plantillas de checklist.
 *
 * Reemplaza el CategoryModal: la lista + crear/editar/eliminar viven
 * dentro del tab "Realizar" (no como modal separado). Cada plantilla
 * muestra un resumen, sus items, y los botones para editar, eliminar
 * o iniciar una inspección con esa plantilla.
 */
export function PlantillasManager({ onStartInspection }: Props) {
  const { categories, loading, createCategory, updateCategory, deleteCategory } = useChecklistCategories();
  const { can } = usePermissions();
  const canManage = can("checklist", "checklist", "crear");

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
          {canManage && (
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
          {canManage && (
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
                canManage={canManage}
                onEdit={() => setEditing({ kind: "edit", plantilla: c })}
                onDelete={() => setPendingDelete(c)}
                onStart={() => onStartInspection(c)}
              />
            ))
          )}
        </div>
      )}

      {/* Editor modal */}
      <PlantillaEditorModal
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

function PlantillaCard({ plantilla, canManage, onEdit, onDelete, onStart }: {
  plantilla: ChecklistCategory;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStart: () => void;
}) {
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
        {canManage && (
          <div className="flex shrink-0 flex-col gap-1 opacity-0 group-hover:opacity-100 transition">
            <button type="button" onClick={onEdit} title="Editar plantilla"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:border-emerald-300 hover:text-emerald-600 dark:hover:border-emerald-500/40 dark:hover:text-emerald-400 transition">
              <Edit2 size={12} />
            </button>
            <button type="button" onClick={onDelete} title="Eliminar plantilla"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:border-rose-300 hover:text-rose-500 dark:hover:border-rose-500/40 dark:hover:text-rose-400 transition">
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/[0.06] flex items-center justify-end">
        <button type="button" onClick={onStart}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition active:scale-95">
          <Plus size={12} /> Iniciar inspección
        </button>
      </div>
    </div>
  );
}

// ── Editor modal (crear/editar) ───────────────────────────────────────────────

type PlantillaEditorModalProps = {
  target: { kind: "create" } | { kind: "edit"; plantilla: ChecklistCategory } | null;
  onClose: () => void;
  onCreate: (input: { name: string; description: string; items: string[] }) => void | Promise<void>;
  onUpdate: (id: string, input: { name: string; description: string; items: string[] }) => void | Promise<void>;
};

function PlantillaEditorModal({ target, onClose, onCreate, onUpdate }: PlantillaEditorModalProps) {
  const isOpen = !!target;
  const isEdit = target?.kind === "edit";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const [draftItem, setDraftItem] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target?.kind === "create") {
      setName(""); setDescription(""); setItems([]); setDraftItem(""); setTouched(false);
    } else if (target?.kind === "edit") {
      setName(target.plantilla.name);
      setDescription(target.plantilla.description);
      setItems([...target.plantilla.items]);
      setDraftItem("");
      setTouched(false);
    }
  }, [target]);

  const trimmedName = name.trim();
  const isValid = trimmedName.length >= 2 && items.length > 0;
  const showError = touched && !isValid;

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

  const handleSubmit = async () => {
    setTouched(true);
    if (!isValid) return;
    setSaving(true);
    try {
      if (target?.kind === "edit") {
        await onUpdate(target.plantilla.id, { name: trimmedName, description: description.trim(), items });
      } else {
        await onCreate({ name: trimmedName, description: description.trim(), items });
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

              <div className="px-5 py-4 space-y-3.5 overflow-y-auto">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                    Nombre *
                  </label>
                  <input
                    type="text" value={name} maxLength={80} autoFocus
                    onChange={(e) => setName(e.target.value.slice(0, 80))}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                    placeholder="Ej. Revisión diaria de vehículo"
                    className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition"
                  />
                  {showError && trimmedName.length < 2 && (
                    <p className="mt-1 text-xs text-rose-500">El nombre debe tener al menos 2 caracteres.</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                    Descripción
                  </label>
                  <textarea
                    value={description} maxLength={500}
                    onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                    placeholder="Uso recomendado o condición de aplicación (opcional)" rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                    Puntos a inspeccionar *
                  </label>

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
                    <ul className="mt-2 space-y-1.5">
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

                  {showError && items.length === 0 && (
                    <p className="mt-1 text-xs text-rose-500 flex items-center gap-1">
                      <AlertTriangle size={11} /> Agrega al menos un punto a inspeccionar.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] shrink-0">
                <button type="button" onClick={onClose}
                  className="rounded-lg border border-gray-200 dark:border-white/[0.08] px-3.5 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.04] transition">
                  Cancelar
                </button>
                <button type="button" onClick={handleSubmit} disabled={!isValid || saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-1.5 text-sm font-semibold text-white transition">
                  {saving && <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {isEdit ? "Guardar cambios" : "Crear plantilla"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
