// pages/Mantenimientos/components/SuppliersManager.tsx
// CRUD inline de proveedores — mismo patrón visual que Flotas (sin KPIs).
// El header vive dentro del card de la tabla. La página que lo wrappea
// (/gestion/proveedores) no debe tener ModulePageHeader.

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, Search, X, Save, Truck, Mail, Phone, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSuppliersList, useCreateSupplier, useUpdateSupplier, useDeleteSupplier, type Supplier, type SupplierInput } from "../../../hooks/useSuppliers";
import { usePermissions } from "../../../hooks/usePermissions";

const PAGE_SIZE = 7;
const inputCls = "h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/20 focus:border-violet-500/50 focus:outline-none transition";

export function SuppliersManager() {
  const { can } = usePermissions();
  const canCreate = can("gestion", "proveedores", "crear");
  const canEdit   = can("gestion", "proveedores", "editar");
  const canDelete = can("gestion", "proveedores", "eliminar");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useSuppliersList(search);
  const rows = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows   = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const createMut = useCreateSupplier();
  const updateMut = useUpdateSupplier();
  const deleteMut = useDeleteSupplier();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierInput>({ name: '', contactName: null, phone: null, email: null, nit: null, notes: null });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', contactName: null, phone: null, email: null, nit: null, notes: null });
    setModalOpen(true);
  };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, contactName: s.contactName, phone: s.phone, email: s.email, nit: s.nit, notes: s.notes });
    setModalOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) { toast.error("El nombre es requerido"); return; }
    try {
      if (editing) { await updateMut.mutateAsync({ id: editing.id, body: form }); toast.success("Proveedor actualizado"); }
      else         { await createMut.mutateAsync(form);                              toast.success("Proveedor creado"); }
      setModalOpen(false);
    } catch (e) { toast.error((e as Error).message); }
  };

  const onDelete = async (s: Supplier) => {
    if (!confirm(`¿Eliminar el proveedor "${s.name}"?`)) return;
    try { await deleteMut.mutateAsync(s.id); toast.success("Proveedor eliminado"); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* Card único: header interno + toolbar + tabla */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03]">
        {/* Header de la card con título + botón */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Proveedores</h3>
            <p className="text-xs text-gray-400">{rows.length} resultado{rows.length !== 1 ? 's' : ''}</p>
          </div>
          {canCreate && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 self-start sm:self-auto rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-violet-500/20 hover:bg-violet-400 active:scale-95"
            >
              <Plus size={14} />Nuevo proveedor
            </button>
          )}
        </div>

        {/* Toolbar con búsqueda */}
        <div className="flex flex-wrap items-center gap-2.5 px-5 py-3 border-b border-white/[0.06]">
          <div className="relative min-w-0 flex-1">
            <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por nombre, contacto o NIT…"
              className="h-9 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] pl-8 pr-3 text-sm text-white placeholder:text-white/30 focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/10"
            />
          </div>
        </div>

        {/* Tabla */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
            <Loader2 size={18} className="animate-spin" /><span className="text-sm">Cargando proveedores…</span>
          </div>
        ) : pageRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14">
            <Truck size={20} className="text-gray-500" />
            <p className="text-sm text-gray-400">Sin proveedores para los filtros actuales</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    {["Nombre", "Contacto", "Email", "Teléfono", "NIT", ""].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((s) => (
                    <tr
                      key={s.id}
                      className="group border-b border-white/[0.04] transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-500/10 text-violet-300 text-[10px] font-black uppercase">
                            {s.name.slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-white">{s.name}</p>
                            {s.notes && <p className="mt-0.5 truncate text-[11px] text-gray-400">{s.notes}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-300">{s.contactName ?? "—"}</td>
                      <td className="px-4 py-3.5">
                        {s.email ? (
                          <a href={`mailto:${s.email}`} className="text-violet-300 hover:text-violet-200 text-xs inline-flex items-center gap-1">
                            <Mail size={11} /><span className="truncate max-w-[160px] inline-block align-middle">{s.email}</span>
                          </a>
                        ) : (
                          <span className="text-xs text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {s.phone ? (
                          <a href={`tel:${s.phone}`} className="text-sm text-gray-200 hover:text-white inline-flex items-center gap-1">
                            <Phone size={11} />{s.phone}
                          </a>
                        ) : (
                          <span className="text-xs text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-400">{s.nit ?? "—"}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <button
                              onClick={() => openEdit(s)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-white/[0.08] hover:text-violet-300"
                              title="Editar"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => onDelete(s)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-rose-500/10 hover:text-rose-300"
                              title="Eliminar"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-white/[0.04] px-5 py-3 text-xs text-gray-500">
                <span>Pág. {page} / {totalPages}</span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-gray-400 hover:bg-white/[0.04] disabled:opacity-30"
                  >
                    <ChevronLeft size={12} />Anterior
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-gray-400 hover:bg-white/[0.04] disabled:opacity-30"
                  >
                    Siguiente<ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6"
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1320] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/10 text-violet-300">
                  <Truck size={16} />
                </div>
                <div>
                  <p className="text-base font-bold text-white">{editing ? "Editar proveedor" : "Nuevo proveedor"}</p>
                  <p className="text-xs text-gray-400">{editing ? "Modifica los datos del proveedor" : "Registra un proveedor de repuestos o servicios"}</p>
                </div>
              </div>
              <button onClick={() => setModalOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-white/[0.06]">
                <X size={15} />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-gray-400">Nombre <span className="text-violet-400">*</span></span>
                <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Repuestos del Sur" />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-gray-400">Contacto</span>
                  <input className={inputCls} value={form.contactName ?? ''} onChange={(e) => setForm({ ...form, contactName: e.target.value || null })} placeholder="Nombre del responsable" />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-gray-400">NIT</span>
                  <input className={inputCls} value={form.nit ?? ''} onChange={(e) => setForm({ ...form, nit: e.target.value || null })} placeholder="900123456-7" />
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-gray-400">Email</span>
                <input className={inputCls} type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value || null })} placeholder="contacto@empresa.com" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-gray-400">Teléfono</span>
                <input className={inputCls} value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value || null })} placeholder="+57 300 000 0000" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-gray-400">Notas</span>
                <textarea
                  rows={2}
                  className={inputCls + ' py-2'}
                  value={form.notes ?? ''}
                  onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
                  placeholder="Observaciones, condiciones de pago, etc."
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] bg-white/[0.02] px-5 py-3.5">
              <button onClick={() => setModalOpen(false)} className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-white/[0.06]">
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={createMut.isPending || updateMut.isPending}
                className="flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50 active:scale-95"
              >
                {(createMut.isPending || updateMut.isPending) ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editing ? "Guardar cambios" : "Crear proveedor"}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
