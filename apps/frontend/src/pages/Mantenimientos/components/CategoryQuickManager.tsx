// pages/Mantenimientos/components/CategoryQuickManager.tsx
//
// jul 2026 v5 — Modal chico para gestionar las categorías custom de
// mantenimiento. Se abre desde el botón "+" al lado del dropdown de
// Categoría en el form modal de mantenimiento. La idea es que el admin
// pueda crear / editar / borrar categorías sin salir del flujo donde
// las está usando.
//
// Tiene el CRUD completo (listar, crear, editar, borrar). El "create"
// además notifica al padre (`onCreated`) para que auto-seleccione la
// categoría recién creada en su `<select>`.

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, Trash2, Save, Tag, X, Hash, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useMaintenanceCategories,
  useCreateMaintenanceCategory,
  useUpdateMaintenanceCategory,
  useDeleteMaintenanceCategory,
  type MaintenanceCategory,
} from "../../../hooks/useMaintenancesV2";
import { usePermissions } from "../../../hooks/usePermissions";

const inputCls =
  "h-9 w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.04] px-3 text-xs text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/20 focus:border-violet-500/60 dark:focus:border-violet-500/50 focus:outline-none transition";

const labelCls =
  "text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500 block mb-1";

// Paleta de colores. La misma que en el CategoriesManager original —
// la mantenemos acá para no tener que importar el componente viejo (que
// era de página entera y ya no se usa).
const COLOR_PALETTE: Array<{ key: string; label: string; bg: string; ring: string; text: string; dot: string }> = [
  { key: "sky",     label: "Cielo",     bg: "bg-sky-50 dark:bg-sky-500/10",       ring: "ring-sky-300",     text: "text-sky-700 dark:text-sky-300",     dot: "bg-sky-500" },
  { key: "violet",  label: "Violeta",   bg: "bg-violet-50 dark:bg-violet-500/10", ring: "ring-violet-300",  text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  { key: "amber",   label: "Ámbar",     bg: "bg-amber-50 dark:bg-amber-500/10",   ring: "ring-amber-300",   text: "text-amber-700 dark:text-amber-300",  dot: "bg-amber-500" },
  { key: "emerald", label: "Esmeralda", bg: "bg-emerald-50 dark:bg-emerald-500/10", ring: "ring-emerald-300", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  { key: "rose",    label: "Rosa",      bg: "bg-rose-50 dark:bg-rose-500/10",     ring: "ring-rose-300",    text: "text-rose-700 dark:text-rose-300",    dot: "bg-rose-500" },
  { key: "cyan",    label: "Cian",      bg: "bg-cyan-50 dark:bg-cyan-500/10",     ring: "ring-cyan-300",    text: "text-cyan-700 dark:text-cyan-300",    dot: "bg-cyan-500" },
  { key: "orange",  label: "Naranja",   bg: "bg-orange-50 dark:bg-orange-500/10", ring: "ring-orange-300", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  { key: "lime",    label: "Lima",      bg: "bg-lime-50 dark:bg-lime-500/10",     ring: "ring-lime-300",    text: "text-lime-700 dark:text-lime-300",    dot: "bg-lime-500" },
  { key: "fuchsia", label: "Fucsia",    bg: "bg-fuchsia-50 dark:bg-fuchsia-500/10", ring: "ring-fuchsia-300", text: "text-fuchsia-700 dark:text-fuchsia-300", dot: "bg-fuchsia-500" },
  { key: "teal",    label: "Teal",      bg: "bg-teal-50 dark:bg-teal-500/10",     ring: "ring-teal-300",    text: "text-teal-700 dark:text-teal-300",    dot: "bg-teal-500" },
  { key: "slate",   label: "Pizarra",   bg: "bg-slate-50 dark:bg-slate-500/10",   ring: "ring-slate-300",   text: "text-slate-700 dark:text-slate-300",  dot: "bg-slate-500" },
];

function colorByKey(key: string) {
  return COLOR_PALETTE.find((c) => c.key === key) ?? COLOR_PALETTE[0];
}

// jul 2026 v5 — slug automático a partir del label. Solo letras/
// números/guion bajo, lowercase, sin tildes.
function autoKey(label: string): string {
  return label
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "cat";
}

interface FormState {
  key:        string;
  label:      string;
  shortLabel: string;
  color:      string;
}

const EMPTY_FORM: FormState = {
  key:        "",
  label:      "",
  shortLabel: "",
  color:      "sky",
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** Llamado cuando se crea una categoría nueva — el padre la usa
   *  para auto-seleccionarla en su `<select>`. */
  onCreated?: (cat: MaintenanceCategory) => void;
}

export function CategoryQuickManager({ open, onClose, onCreated }: Props) {
  const { can } = usePermissions();
  const canCreate = can("mantenimiento", "records", "crear");
  const canEdit   = can("mantenimiento", "records", "editar");
  const canDelete = can("mantenimiento", "records", "eliminar");

  const { data: cats = [], refetch } = useMaintenanceCategories();
  const createMut = useCreateMaintenanceCategory();
  const updateMut = useUpdateMaintenanceCategory();
  const deleteMut = useDeleteMaintenanceCategory();

  const [editingId, setEditingId]   = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [form, setForm]             = useState<FormState>(EMPTY_FORM);

  const editingCat = editingId ? cats.find((c) => c.id === editingId) ?? null : null;

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function startEdit(c: MaintenanceCategory) {
    setEditingId(c.id);
    setForm({
      key:        c.key,
      label:      c.label,
      shortLabel: c.shortLabel ?? "",
      color:      c.color || "sky",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function submit() {
    if (!form.label.trim()) { toast.error("El nombre es requerido"); return; }
    const trimmedKey = (form.key.trim() || autoKey(form.label)).trim();
    if (!/^[A-Za-z0-9_\-:]+$/.test(trimmedKey)) {
      toast.error("La clave solo puede tener letras, números, guion, guion bajo y dos puntos");
      return;
    }
    if (trimmedKey.length < 2 || trimmedKey.length > 60) {
      toast.error("La clave debe tener entre 2 y 60 caracteres");
      return;
    }

    setSaving(true);
    try {
      if (editingCat) {
        // key NO se edita (rompe filtros de mantenimientos que la usen)
        await updateMut.mutateAsync({
          id: editingCat.id,
          body: {
            label:      form.label,
            shortLabel: form.shortLabel.trim() || null,
            color:      form.color,
          },
        });
        toast.success("Categoría actualizada");
        setEditingId(null);
      } else {
        const created = await createMut.mutateAsync({
          key:        trimmedKey,
          label:      form.label,
          shortLabel: form.shortLabel.trim() || undefined,
          color:      form.color,
        });
        toast.success("Categoría creada");
        // Avisamos al padre para que la auto-seleccione en su <select>.
        onCreated?.(created);
        // Limpiamos el form para que pueda crear otra si quiere.
        setForm(EMPTY_FORM);
        // Forzamos refetch por si el cache quedó desfasado.
        void refetch();
      }
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (/409/.test(msg) || /duplicad|existe|already/i.test(msg)) {
        toast.error(`Ya existe una categoría con la clave "${trimmedKey}"`);
      } else {
        toast.error(msg || "No se pudo guardar la categoría");
      }
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(c: MaintenanceCategory) {
    const ok = window.confirm(
      `¿Eliminar la categoría "${c.label}"?\n\n` +
      `Los mantenimientos existentes que la usen conservarán la key como texto, pero ya no aparecerá en los filtros ni en los dropdowns.`,
    );
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(c.id);
      toast.success("Categoría eliminada");
      if (editingId === c.id) cancelEdit();
      void refetch();
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (/categor.*en uso|foreign key/i.test(msg)) {
        toast.error("No se puede eliminar: hay mantenimientos que la están usando");
      } else {
        toast.error(msg || "No se pudo eliminar la categoría");
      }
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.96, y: 8, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 4, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0b0f1a] shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2">
                <Tag size={15} className="text-violet-500 dark:text-violet-300" />
                <h2 className="text-sm font-bold text-gray-800 dark:text-white">
                  Categorías de mantenimiento
                </h2>
                <span className="inline-flex items-center rounded-md bg-gray-100 dark:bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold text-gray-500 dark:text-gray-400">
                  {cats.length}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* ── Form crear / editar ── */}
              {(canCreate || (editingCat && canEdit)) && (
                <div
                  className={`rounded-xl border p-3.5 space-y-2.5 ${
                    editingCat
                      ? "border-violet-200 dark:border-violet-500/30 bg-violet-50/50 dark:bg-violet-500/[0.05]"
                      : "border-gray-200 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02]"
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500">
                    {editingCat ? "Editar" : "Nueva categoría"}
                  </p>

                  {/* Label + shortLabel */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Nombre *</label>
                      <input
                        className={inputCls}
                        value={form.label}
                        onChange={(e) => {
                          const next = e.target.value;
                          setForm((f) => ({
                            ...f,
                            label: next,
                            // auto-key solo en modo crear, y solo si el key
                            // actual está vacío o todavía coincide con la
                            // sugerencia previa.
                            key: editingCat || f.key ? f.key : autoKey(next),
                          }));
                        }}
                        placeholder="Ej. Refrigeración"
                        maxLength={120}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Corta (opcional)</label>
                      <input
                        className={inputCls}
                        value={form.shortLabel}
                        onChange={(e) => setForm({ ...form, shortLabel: e.target.value })}
                        placeholder="Refrig."
                        maxLength={40}
                      />
                    </div>
                  </div>

                  {/* Key (read-only en edit, editable en create) */}
                  <div>
                    <label className={labelCls}>Clave interna</label>
                    {editingCat ? (
                      <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-gray-50/60 dark:bg-white/[0.02] text-xs font-mono text-gray-500 dark:text-gray-400">
                        <Hash size={11} />
                        {form.key}
                        <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 italic">
                          (no se cambia después)
                        </span>
                      </div>
                    ) : (
                      <>
                        <input
                          className={inputCls}
                          value={form.key}
                          onChange={(e) => setForm({ ...form, key: e.target.value })}
                          placeholder="refrigeracion (auto si vacío)"
                          maxLength={60}
                        />
                        <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                          Identificador interno. Solo letras, números, guion y guion bajo.
                        </p>
                      </>
                    )}
                  </div>

                  {/* Color picker inline */}
                  <div>
                    <label className={labelCls}>Color</label>
                    <div className="flex flex-wrap gap-1.5">
                      {COLOR_PALETTE.map((c) => {
                        const selected = form.color === c.key;
                        return (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => setForm({ ...form, color: c.key })}
                            title={c.label}
                            // jul 2026 v5 — bug fix: el botón no podía
                            // seleccionarse porque mezclaba `style={{
                            // backgroundColor: "sky-500" }}` (inválido)
                            // con la clase Tailwind del span interno. Ahora
                            // la clase `c.dot` se aplica directamente al
                            // botón, sin style inline.
                            className={[
                              "h-6 w-6 rounded-md transition",
                              c.dot,
                              selected
                                ? `ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#0b0f1a] ${c.ring}`
                                : "ring-1 ring-gray-300/60 dark:ring-white/10 hover:ring-gray-400 dark:hover:ring-white/30",
                            ].join(" ")}
                          >
                            {selected && (
                              <span className="block h-full w-full rounded-md ring-1 ring-inset ring-white/40" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Botones */}
                  <div className="flex items-center gap-2 pt-1">
                    {editingCat && (
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={saving}
                        className="h-8 px-3 rounded-md text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={submit}
                      disabled={saving}
                      className="h-8 px-3 ml-auto rounded-md text-xs font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400 text-white inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                      {saving ? "Guardando…" : editingCat ? "Guardar cambios" : "Crear y usar"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Lista de categorías existentes ── */}
              {cats.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/[0.08] py-6 text-center">
                  <Tag size={18} className="mx-auto text-gray-300 dark:text-gray-600" />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                    Todavía no creaste categorías propias. Usá las de sistema
                    o creá una arriba.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                    Existentes ({cats.length})
                  </p>
                  <ul className="space-y-1">
                    {cats.map((c) => {
                      const cCfg = colorByKey(c.color);
                      const isEditingThis = editingId === c.id;
                      return (
                        <li
                          key={c.id}
                          className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition ${
                            isEditingThis
                              ? "border-violet-300 dark:border-violet-500/40 bg-violet-50/40 dark:bg-violet-500/[0.06]"
                              : "border-gray-200 dark:border-white/[0.06] hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                          }`}
                        >
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${cCfg.dot}`}
                            title={cCfg.label}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-gray-800 dark:text-white">
                              {c.label}
                            </p>
                            <p className="truncate text-[10px] font-mono text-gray-400 dark:text-gray-500">
                              {c.key}
                              {c.shortLabel && <span className="ml-1.5 not-italic">· {c.shortLabel}</span>}
                            </p>
                          </div>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => (isEditingThis ? cancelEdit() : startEdit(c))}
                              className="p-1 text-gray-400 hover:text-violet-500 dark:hover:text-violet-300 rounded-md hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                              title={isEditingThis ? "Cancelar edición" : "Editar"}
                            >
                              <Pencil size={11} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => onDelete(c)}
                              className="p-1 text-gray-400 hover:text-rose-500 dark:hover:text-rose-300 rounded-md hover:bg-rose-50 dark:hover:bg-rose-500/[0.06] transition"
                              title="Eliminar"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default CategoryQuickManager;
