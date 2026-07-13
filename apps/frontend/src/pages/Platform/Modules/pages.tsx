// src/pages/Platform/Modules/pages.tsx
//
// CRUD del catálogo de módulos de la plataforma. El superadmin ve el
// árbol completo de módulos con sus submódulos, y puede:
//   - Activar / desactivar un módulo.
//   - Crear módulos nuevos con sus submódulos.
//   - Editar label y descripción.
//   - NO eliminar (no es reversible por FK constraints).

import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus, Package, Pencil, Trash2, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight, Search, Loader2, Layers,
} from "lucide-react";
import { toast } from "sonner";
import {
  PlatformModal, ModalActions,
  InputField, TextareaField,
} from "../../../components/platform";
import { usePlatformModules, usePlatformPlans } from "../../../hooks/usePlatformPlans";
import { useAuth } from "../../../context/AuthContext";
import type { PlatformModule, PlatformSubmodule } from "../../../types/platform";

// ─── Editor de submódulos (reutilizable) ──────────────────────────────────────

function SubmodulesEditor({
  submodules, onChange,
}: { submodules: PlatformSubmodule[]; onChange: (s: PlatformSubmodule[]) => void }) {
  function add() {
    onChange([
      ...submodules,
      {
        id: `nuevo.${Date.now()}`,
        moduleId: "",
        label: "",
        sortOrder: (submodules.length + 1) * 10,
        isActive: true,
      },
    ]);
  }

  function update(idx: number, patch: Partial<PlatformSubmodule>) {
    onChange(submodules.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  function remove(idx: number) {
    onChange(submodules.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Submódulos ({submodules.length})
        </p>
        <button type="button" onClick={add}
          className="inline-flex items-center gap-1 rounded-lg bg-brand-500/10 px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-500/20 dark:bg-brand-500/15 dark:text-brand-400">
          <Plus size={11} /> Agregar
        </button>
      </div>
      <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50/50 p-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
        {submodules.length === 0 && (
          <p className="px-2 py-3 text-center text-[11px] text-gray-400">
            Sin submódulos. Agregá uno con el botón de arriba.
          </p>
        )}
        {submodules.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 dark:bg-white/[0.03]">
            <input value={s.id} onChange={e => update(i, { id: e.target.value })}
              placeholder="id.submodulo"
              className="h-7 flex-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-mono outline-none focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200" />
            <input value={s.label} onChange={e => update(i, { label: e.target.value })}
              placeholder="Label"
              className="h-7 flex-[2] rounded-md border border-gray-200 bg-white px-2 text-xs outline-none focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200" />
            <button type="button" onClick={() => remove(i)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10">
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Modal de edición/creación ───────────────────────────────────────────────

interface ModuleEditForm {
  id: string;
  label: string;
  description: string;
  icon: string;
  accent: string;
  isCore: boolean;
  isActive: boolean;
  sortOrder: number;
  submodules: PlatformSubmodule[];
}

const EMPTY: ModuleEditForm = {
  id: "", label: "", description: "", icon: "Package", accent: "emerald",
  isCore: false, isActive: true, sortOrder: 100, submodules: [],
};

function ModuleForm({
  form, onChange, isEdit,
}: { form: ModuleEditForm; onChange: (f: ModuleEditForm) => void; isEdit: boolean }) {
  function set<K extends keyof ModuleEditForm>(k: K, v: ModuleEditForm[K]) {
    onChange({ ...form, [k]: v });
  }
  return (
    <div className="grid gap-4 p-6 sm:grid-cols-2">
      <InputField label="ID del módulo (slug)" value={form.id} required
        disabled={isEdit}
        placeholder="ej. mantenimiento"
        onChange={e => set("id", e.target.value)} />
      <InputField label="Nombre visible" value={form.label} required
        placeholder="Mantenimiento"
        onChange={e => set("label", e.target.value)} />
      <InputField label="Icono (Lucide)" value={form.icon}
        placeholder="Wrench"
        onChange={e => set("icon", e.target.value)} />
      <InputField label="Acento" value={form.accent}
        placeholder="emerald | sky | orange | violet | …"
        onChange={e => set("accent", e.target.value)} />
      <InputField label="Orden" type="number"
        value={form.sortOrder}
        onChange={e => set("sortOrder", Number(e.target.value) || 100)} />
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={() => set("isCore", !form.isCore)}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          {form.isCore ? <ToggleRight size={20} className="text-brand-500" /> : <ToggleLeft size={20} className="text-gray-400" />}
          Core (no se puede quitar)
        </button>
        <button type="button" onClick={() => set("isActive", !form.isActive)}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          {form.isActive ? <ToggleRight size={20} className="text-emerald-500" /> : <ToggleLeft size={20} className="text-gray-400" />}
          Activo
        </button>
      </div>
      <div className="sm:col-span-2">
        <TextareaField label="Descripción" rows={2} colSpan="full"
          value={form.description}
          onChange={e => set("description", e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <SubmodulesEditor
          submodules={form.submodules}
          onChange={s => set("submodules", s)}
        />
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function ModulesPage() {
  const { session }  = useAuth();
  void session;
  const { modules, loading, refetch } = usePlatformModules();
  const { plans: _plans, toggleModule: _tm } = usePlatformPlans();
  void _plans;
  void _tm;

  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]   = useState<PlatformModule | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm]         = useState<ModuleEditForm>(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return modules.filter(m =>
      !q ||
      m.label.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q),
    );
  }, [modules, search]);

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY);
    setModalOpen(true);
  }

  function openEdit(m: PlatformModule) {
    setEditing(m);
    setCreating(false);
    setForm({
      id: m.id, label: m.label, description: m.description ?? "",
      icon: m.icon ?? "Package", accent: m.accent ?? "emerald",
      isCore: m.isCore, isActive: m.isActive, sortOrder: m.sortOrder,
      submodules: m.submodules,
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const url = editing ? `/api/platform/modules/${editing.id}` : "/api/platform/modules";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      toast.success(editing ? "Módulo actualizado" : "Módulo creado");
      setModalOpen(false);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(m: PlatformModule) {
    if (!confirm(`¿Desactivar el módulo "${m.label}"? Las empresas con este módulo lo perderán.`)) return;
    try {
      const res = await fetch(`/api/platform/modules/${m.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      toast.success("Módulo desactivado");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al desactivar");
    }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            <span className="text-xs font-medium text-violet-700 dark:text-violet-400">Plataforma</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Catálogo de módulos</h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Gestiona los módulos disponibles en la plataforma. Cada plan activa un subconjunto.
          </p>
        </div>
        <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={openCreate}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600">
          <Plus size={15} /> Nuevo módulo
        </motion.button>
      </motion.div>

      {/* Búsqueda */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar módulo…" className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-4 text-sm outline-none focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300" />
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">{filtered.length} módulos</span>
      </div>

      {/* Lista / Tabla */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Cargando…
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}
          className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
          {filtered.map((m, i) => {
            const isOpen = !!expanded[m.id];
            return (
              <motion.div key={m.id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: i * 0.02 }}
                className={`border-b border-gray-100 dark:border-white/[0.04] last:border-b-0`}>
                <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/80 dark:hover:bg-white/[0.02]">
                  <button type="button" onClick={() => toggleExpand(m.id)}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05]">
                    {isOpen ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
                  </button>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg
                    ${m.isActive
                      ? "bg-brand-50 dark:bg-brand-500/10"
                      : "bg-gray-100 dark:bg-white/[0.05]"}`}>
                    <Package size={14} className={m.isActive ? "text-brand-500" : "text-gray-400"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800 dark:text-white">{m.label}</p>
                      {m.isCore && (
                        <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-700 dark:bg-violet-500/20 dark:text-violet-400">
                          Core
                        </span>
                      )}
                      {!m.isActive && (
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                          Inactivo
                        </span>
                      )}
                      <p className="font-mono text-[10px] text-gray-400">{m.id}</p>
                    </div>
                    {m.description && (
                      <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500 line-clamp-1">{m.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{m.submodules.length} submódulos</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => openEdit(m)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-brand-500 dark:border-white/[0.08]">
                      <Pencil size={12} />
                    </button>
                    {!m.isCore && m.isActive && (
                      <button type="button" onClick={() => handleDeactivate(m)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-rose-500 dark:border-white/[0.08]">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden border-t border-gray-100 bg-gray-50/50 px-12 py-2 dark:border-white/[0.04] dark:bg-white/[0.02]">
                      {m.submodules.length === 0 ? (
                        <p className="py-3 text-center text-[11px] text-gray-400">Sin submódulos definidos</p>
                      ) : (
                        m.submodules.map(s => (
                          <div key={s.id} className="flex items-center gap-2 border-b border-gray-100/80 py-2 last:border-b-0 dark:border-white/[0.02]">
                            <Layers size={11} className="text-gray-300 dark:text-gray-600" />
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-200">{s.label}</p>
                            <p className="ml-auto font-mono text-[10px] text-gray-400">{s.id}</p>
                            {!s.isActive && (
                              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-500 dark:bg-white/[0.06]">
                                Inactivo
                              </span>
                            )}
                          </div>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Modal create/edit */}
      <PlatformModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar módulo: ${editing.label}` : "Nuevo módulo"}
        subtitle={editing ? "Modificá sus submódulos, label y propiedades." : "Definí un nuevo módulo con sus submódulos."}
        icon={<Package size={15} />}
        iconBg="bg-violet-50 dark:bg-violet-500/[0.12]"
        iconColor="text-violet-600 dark:text-violet-400"
        maxWidth="max-w-2xl"
        footer={
          <ModalActions
            onCancel={() => setModalOpen(false)}
            submitting={submitting}
            submitLabel={editing ? "Guardar cambios" : "Crear módulo"} />
        }
      >
        <form onSubmit={handleSubmit}>
          <ModuleForm form={form} onChange={setForm} isEdit={!!editing} />
        </form>
      </PlatformModal>
    </div>
  );
}
