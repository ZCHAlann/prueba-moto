import { useMemo, useState, useRef, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useChecklistCategories, type ChecklistCategory } from "../../../hooks/useChecklistCategories";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


type Props = { open: boolean; onClose: () => void };
type View = "list" | "create" | "edit";
type FormState = { name: string; description: string; items: string[] };
const emptyForm: FormState = { name: "", description: "", items: [] };

// ── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, error, hint, children }: {
  label: string; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
      {error && <p className="text-xs font-medium text-error-500">{error}</p>}
    </div>
  );
}

function FieldInput({ value, onChange, placeholder, error }: {
  value: string; onChange: (v: string) => void; placeholder?: string; error?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-xl border bg-white/[0.05] px-3 py-2.5 text-sm text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none transition focus:ring-2 ${
        error
          ? "border-error-300 focus:border-error-500 focus:ring-error-500/10 dark:border-error-500/40"
          : "border-gray-200 dark:border-white/[0.08] focus:border-brand-500 focus:ring-brand-500/10"
      }`}
    />
  );
}

// ── Item sortable individual ─────────────────────────────────────────────────
function SortableItem({
  id, index, value, onChange, onRemove, onEnter,
}: {
  id: string; index: number; value: string;
  onChange: (v: string) => void; onRemove: () => void; onEnter: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="flex items-center gap-2"
    >
      {/* drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex h-9 w-9 shrink-0 cursor-grab active:cursor-grabbing items-center justify-center rounded-xl border border-gray-200 dark:border-white/[0.08] text-gray-300 dark:text-gray-600 transition hover:border-gray-300 dark:hover:border-white/[0.15] hover:text-gray-400 dark:hover:text-gray-400"
        aria-label="Arrastrar para reordenar"
      >
        <svg viewBox="0 0 10 14" className="h-3.5 w-3.5" fill="currentColor">
          <circle cx="3" cy="2"  r="1.1"/><circle cx="7" cy="2"  r="1.1"/>
          <circle cx="3" cy="7"  r="1.1"/><circle cx="7" cy="7"  r="1.1"/>
          <circle cx="3" cy="12" r="1.1"/><circle cx="7" cy="12" r="1.1"/>
        </svg>
      </button>

      {/* número */}
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 dark:border-white/[0.08] text-xs font-semibold text-gray-400 dark:text-gray-500 select-none">
        {index + 1}
      </span>

      {/* input */}
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onEnter(); } }}
        className="flex-1 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-gray-800 dark:text-gray-200 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
      />

      {/* eliminar */}
      <button
        type="button"
        onClick={onRemove}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 dark:border-white/[0.08] text-gray-300 dark:text-gray-600 transition hover:border-error-200 dark:hover:border-error-500/30 hover:bg-error-50 dark:hover:bg-error-500/[0.08] hover:text-error-400"
        aria-label="Eliminar item"
      >
        <svg viewBox="0 0 10 10" className="h-3 w-3" fill="none">
          <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}

// ── ChipInput (ahora con drag-to-reorder) ────────────────────────────────────
type ItemWithId = { id: string; value: string };

function ChipInput({ items, onChange, error }: {
  items: string[]; onChange: (items: string[]) => void; error?: string;
}) {
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // internamente usamos items con id estable para dnd-kit
  const [rows, setRows] = useState<ItemWithId[]>(() =>
    items.map(v => ({ id: crypto.randomUUID(), value: v }))
  );

  // sincroniza hacia afuera cada vez que rows cambia
  function emit(next: ItemWithId[]) {
    setRows(next);
    onChange(next.map(r => r.value).filter(Boolean));
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex(r => r.id === active.id);
    const newIndex = rows.findIndex(r => r.id === over.id);
    emit(arrayMove(rows, oldIndex, newIndex));
  }

  function addItem() {
    const v = inputVal.trim();
    if (!v) return;
    if (rows.some(r => r.value === v)) { setInputVal(""); return; }
    emit([...rows, { id: crypto.randomUUID(), value: v }]);
    setInputVal("");
    inputRef.current?.focus();
  }

  function removeItem(id: string) {
    emit(rows.filter(r => r.id !== id));
  }

  function updateItem(id: string, value: string) {
    emit(rows.map(r => r.id === id ? { ...r, value } : r));
  }

  return (
    <div className="flex flex-col gap-2">
      {/* fila de agregar */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addItem}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 dark:border-white/[0.08] text-gray-400 dark:text-gray-500 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-500 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/[0.08] dark:hover:text-brand-400"
        >
          <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
        <input
          ref={inputRef}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
          placeholder="Escribe un item y presiona Enter o +"
          className={`flex-1 rounded-xl border bg-white/[0.05] px-3 py-2 text-sm text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none transition focus:ring-2 ${
            error
              ? "border-error-300 focus:border-error-500 focus:ring-error-500/10 dark:border-error-500/40"
              : "border-gray-200 dark:border-white/[0.08] focus:border-brand-500 focus:ring-brand-500/10"
          }`}
        />
      </div>

      {/* lista sortable */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
          <AnimatePresence initial={false}>
            {rows.map((row, i) => (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                style={{ overflow: "hidden" }}
              >
                <div className="pb-0">
                  <SortableItem
                    id={row.id}
                    index={i}
                    value={row.value}
                    onChange={v => updateItem(row.id, v)}
                    onRemove={() => removeItem(row.id)}
                    onEnter={() => inputRef.current?.focus()}
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </SortableContext>
      </DndContext>
    </div>
  );
}

// ── Category form ─────────────────────────────────────────────────────────────
function CategoryForm({ initial, onSave, onCancel, saving, title }: {
  initial: FormState; onSave: (f: FormState) => void;
  onCancel: () => void; saving: boolean; title: string;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<"name" | "items", string>>>({});

  function validate() {
    const e: typeof errors = {};
    if (!form.name.trim()) e.name = "El nombre es requerido";
    if (form.items.length === 0) e.items = "Agrega al menos un item";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{title}</p>

      <Field label="Nombre de la categoría" error={errors.name}>
        <FieldInput
          value={form.name}
          onChange={v => { setForm(f => ({ ...f, name: v })); setErrors(e => ({ ...e, name: undefined })); }}
          placeholder="Ej. Revisión diaria de vehículo"
          error={!!errors.name}
        />
      </Field>

      <Field label="Descripción">
        <input
          type="text"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Uso recomendado o condición de aplicación"
          className="w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white/[0.05] px-3 py-2.5 text-sm text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
        />
      </Field>

      <Field label="Items de inspección" error={errors.items}
        hint={form.items.length === 0 ? "Presiona Enter o + para agregar. Clic en un chip para editarlo." : undefined}
      >
        <ChipInput
          items={form.items}
          onChange={items => { setForm(f => ({ ...f, items })); setErrors(e => ({ ...e, items: undefined })); }}
          error={errors.items}
        />
      </Field>

      {form.items.length > 0 && (
        <div className="rounded-xl border border-success-200 bg-success-50 px-3 py-2 text-xs text-success-700 dark:border-success-500/20 dark:bg-success-500/[0.08] dark:text-success-400">
          <span className="font-bold">{form.items.length}</span> item{form.items.length !== 1 ? "s" : ""} agregado{form.items.length !== 1 ? "s" : ""}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-4 py-2 text-sm font-semibold text-gray-500 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-white/[0.05]">
          Cancelar
        </button>
        <button type="button" onClick={() => { if (validate()) onSave(form); }} disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95 disabled:opacity-50">
          {saving && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          )}
          Guardar categoría
        </button>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function CategoryModal({ open, onClose }: Props) {
  const { categories, createCategory, updateCategory, deleteCategory } = useChecklistCategories();
  const [view, setView] = useState<View>("list");
  const [editing, setEditing] = useState<ChecklistCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return [...categories]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter(c => !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  }, [categories, search]);

  function resetToList() { setView("list"); setEditing(null); }

  async function handleCreate(form: FormState) {
    setSaving(true);
    try {
      await createCategory({ name: form.name.trim(), description: form.description.trim(), items: form.items });
      toast.success("Categoría creada");
      resetToList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear categoría");
    } finally { setSaving(false); }
  }

  async function handleUpdate(form: FormState) {
    if (!editing) return;
    setSaving(true);
    try {
      await updateCategory(editing.id, { name: form.name.trim(), description: form.description.trim(), items: form.items });
      toast.success("Categoría actualizada");
      resetToList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteCategory(id);
      toast.success("Categoría eliminada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally { setDeletingId(null); }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="cat-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
          <motion.div key="cat-modal"
            initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }} transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.06] dark:bg-gray-900"
          >
            {/* header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/[0.06] px-6 py-5">
              <div>
                <h2 className="text-base font-semibold text-gray-800 dark:text-white">Categorías de checklist</h2>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                  {categories.length} categoría{categories.length !== 1 ? "s" : ""} disponibles
                </p>
              </div>
              <div className="flex items-center gap-2">
                {view === "list" && (
                  <button type="button" onClick={() => setView("create")}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-600 transition hover:bg-brand-100 dark:border-brand-500/20 dark:bg-brand-500/[0.08] dark:text-brand-400 dark:hover:bg-brand-500/[0.15]">
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    Nueva
                  </button>
                )}
                <button type="button" onClick={() => { resetToList(); onClose(); }}
                  className="rounded-xl border border-gray-200 dark:border-white/[0.08] p-2 text-gray-400 transition hover:bg-gray-50 dark:hover:bg-white/[0.05] hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label="Cerrar">
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none">
                    <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <AnimatePresence mode="wait">
                {view === "list" && (
                  <motion.div key="list" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }} className="space-y-4">
                    <div className="relative">
                      <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" viewBox="0 0 16 16" fill="none">
                        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                        <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                      <input type="text" placeholder="Buscar categoría…" value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-transparent py-2 pl-9 pr-4 text-sm text-gray-700 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"/>
                    </div>

                    {filtered.length === 0 ? (
                      <div className="py-12 text-center">
                        <p className="text-sm text-gray-400 dark:text-gray-500">{search ? "Sin resultados" : "No hay categorías aún"}</p>
                        {!search && (
                          <button type="button" onClick={() => setView("create")}
                            className="mt-3 text-sm font-semibold text-brand-500 hover:text-brand-600 dark:text-brand-400">
                            Crear primera categoría →
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filtered.map(cat => (
                          <motion.div key={cat.id} layout
                            className="group rounded-2xl border border-gray-100 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] p-4 transition hover:border-gray-200 dark:hover:border-white/[0.10]">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-gray-800 dark:text-white">{cat.name}</p>
                                  <span className="rounded-full bg-brand-50 dark:bg-brand-500/[0.12] px-2 py-0.5 text-xs font-bold text-brand-600 dark:text-brand-400">
                                    {cat.items.length}
                                  </span>
                                </div>
                                {cat.description && (
                                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 line-clamp-1">{cat.description}</p>
                                )}
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {cat.items.slice(0, 4).map(item => (
                                    <span key={item} className="rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                                      {item}
                                    </span>
                                  ))}
                                  {cat.items.length > 4 && (
                                    <span className="rounded-lg bg-brand-50 dark:bg-brand-500/[0.10] px-2 py-0.5 text-xs font-semibold text-brand-600 dark:text-brand-400">
                                      +{cat.items.length - 4} más
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <button type="button" onClick={() => { setEditing(cat); setView("edit"); }}
                                  className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 transition hover:border-gray-300 dark:hover:border-white/[0.18] hover:text-gray-700 dark:hover:text-gray-200">
                                  Editar
                                </button>
                                <button type="button" onClick={() => handleDelete(cat.id)} disabled={deletingId === cat.id}
                                  className="rounded-xl border border-error-200 dark:border-error-500/20 px-3 py-1.5 text-xs font-semibold text-error-500 transition hover:border-error-300 dark:hover:border-error-500/40 hover:bg-error-50 dark:hover:bg-error-500/[0.08] disabled:opacity-40">
                                  {deletingId === cat.id ? "…" : "Eliminar"}
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}

                {view === "create" && (
                  <motion.div key="create" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                    <CategoryForm title="Nueva categoría" initial={emptyForm} onSave={handleCreate} onCancel={resetToList} saving={saving}/>
                  </motion.div>
                )}

                {view === "edit" && editing && (
                  <motion.div key="edit" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                    <CategoryForm
                      title={`Editando: ${editing.name}`}
                      initial={{ name: editing.name, description: editing.description, items: [...editing.items] }}
                      onSave={handleUpdate} onCancel={resetToList} saving={saving}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}