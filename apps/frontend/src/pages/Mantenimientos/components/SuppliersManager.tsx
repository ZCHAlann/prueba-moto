import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, Trash2, Search, Save, Truck, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { useSuppliers, type Supplier, type SupplierInput } from "../../../hooks/useSuppliers";
import { usePermissions } from "../../../hooks/usePermissions";
import { LocationPickerModal } from "../../../components/ui/map/LocationPicker";
import { LocationMap, type MapPoint } from "../../../components/ui/map/LocationMap";

const PAGE_SIZE = 7;
const inputCls =
  "h-10 w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.04] px-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/20 focus:border-violet-500/60 dark:focus:border-violet-500/50 focus:outline-none transition";

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-500">
        {label}{required && <span className="ml-1 text-violet-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function IconEdit({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function IconMap({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}
function IconList({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}
function IconClose({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function SuppliersManager() {
  const { can } = usePermissions();
  const canCreate = can("gestion", "proveedores", "crear");
  const canEdit   = can("gestion", "proveedores", "editar");
  const canDelete = can("gestion", "proveedores", "eliminar");

  const { suppliers, loading, createSupplier, updateSupplier, deleteSupplier } = useSuppliers();

  const [view, setView]             = useState<"map" | "list">("map");
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState("");
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState<Supplier | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.contactName ?? '').toLowerCase().includes(q) ||
      (s.nit ?? '').toLowerCase().includes(q) ||
      (s.email ?? '').toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows   = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const mapPoints: MapPoint[] = useMemo(
    () => filteredRows
      .filter((s) => s.latitude && s.longitude)
      .map((s) => ({ id: s.id, name: s.name, subtitle: s.email, latitude: s.latitude!, longitude: s.longitude! })),
    [filteredRows]
  );

  const selected = useMemo(() => suppliers.find((s) => s.id === selectedId) ?? null, [suppliers, selectedId]);

  const [form, setForm] = useState<SupplierInput & { address: string }>({
    name: '', contactName: '', phone: '', email: '', nit: '', notes: '',
    latitude: undefined, longitude: undefined, address: '',
  });

  function openCreate() {
    setEditing(null);
    setForm({ name: '', contactName: '', phone: '', email: '', nit: '', notes: '', latitude: undefined, longitude: undefined, address: '' });
    setModalOpen(true);
  }
  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name, contactName: s.contactName ?? '', phone: s.phone ?? '',
      email: s.email ?? '', nit: s.nit ?? '', notes: s.notes ?? '',
      latitude: s.latitude, longitude: s.longitude, address: s.address ?? '',
    });
    setModalOpen(true);
  }

  async function submit() {
    if (!form.name.trim()) { toast.error("El nombre es requerido"); return; }
    setSaving(true);
    try {
      const body: SupplierInput = {
        name: form.name, contactName: form.contactName || null, phone: form.phone || null,
        email: form.email || null, nit: form.nit || null, notes: form.notes || null,
        address: form.address || null, latitude: form.latitude ?? null, longitude: form.longitude ?? null,
      };
      if (editing) {
        const ok = await updateSupplier(editing.id, body);
        if (ok) toast.success("Proveedor actualizado"); else toast.error("No se pudo actualizar el proveedor");
      } else {
        const ok = await createSupplier(body);
        if (ok) toast.success("Proveedor creado"); else toast.error("No se pudo crear el proveedor");
      }
      setModalOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(s: Supplier) {
    if (!confirm(`¿Eliminar el proveedor "${s.name}"?`)) return;
    const ok = await deleteSupplier(s.id);
    if (ok) toast.success("Proveedor eliminado"); else toast.error("No se pudo eliminar el proveedor");
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />
        <div className="h-[440px] animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="space-y-5"
    >
      {/* Card principal */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 dark:border-white/[0.06] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Proveedores</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {filteredRows.length} resultado{filteredRows.length !== 1 ? 's' : ''} · {mapPoints.length} con ubicación
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Toggle mapa / lista */}
            <div className="flex items-center gap-0.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.02] p-1">
              {([
                { key: "map"  as const, label: "Mapa",  Icon: IconMap  },
                { key: "list" as const, label: "Lista", Icon: IconList },
              ]).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
                    view === key
                      ? "bg-white dark:bg-white/[0.08] text-gray-800 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>
            {canCreate && (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-violet-500/20 hover:bg-violet-400 active:scale-95"
              >
                <Plus size={14} /> Nuevo proveedor
              </button>
            )}
          </div>
        </div>

        {/* Búsqueda */}
        <div className="flex flex-wrap items-center gap-2.5 px-5 py-3 border-b border-gray-100 dark:border-white/[0.06]">
          <div className="relative min-w-0 flex-1">
            <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar por nombre, contacto, NIT o email…"
              className="h-9 w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-transparent pl-8 pr-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:border-violet-400 dark:focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/10"
            />
          </div>
        </div>

        {/* Body */}
        {view === "map" ? (
          <div className="p-3 sm:p-5">
            <LocationMap
              kind="supplier"
              points={mapPoints}
              selectedId={selectedId}
              onSelectPoint={(id) => setSelectedId(id)}
            />
          </div>
        ) : (
          <>
            {pageRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-14">
                <Truck size={20} className="text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-400 dark:text-gray-500">Sin proveedores para los filtros actuales</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-white/[0.04]">
                      {["Nombre", "Contacto", "Email", "Teléfono", "NIT", "Dirección", ""].map((h, i) => (
                        <th key={i} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((s) => (
                      <tr
                        key={s.id}
                        className="group border-b border-gray-100 dark:border-white/[0.04] transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan-50 dark:bg-cyan-500/10 text-cyan-500 dark:text-cyan-300">
                              <Package size={14} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-gray-800 dark:text-white">{s.name}</p>
                              {s.latitude && s.longitude && (
                                <p className="text-[10px] text-emerald-500 dark:text-emerald-400">📍 con ubicación</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-gray-600 dark:text-gray-300">{s.contactName ?? "—"}</td>
                        <td className="px-4 py-3.5">
                          {s.email ? (
                            <a
                              href={`mailto:${s.email}`}
                              className="text-violet-500 dark:text-violet-300 hover:text-violet-600 dark:hover:text-violet-200 text-xs inline-flex items-center gap-1"
                            >
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                <polyline points="22,6 12,13 2,6"/>
                              </svg>
                              <span className="truncate max-w-[160px] inline-block align-middle">{s.email}</span>
                            </a>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-gray-700 dark:text-gray-200">{s.phone ?? "—"}</td>
                        <td className="px-4 py-3.5 text-xs text-gray-400">{s.nit ?? "—"}</td>
                        <td className="px-4 py-3.5 text-xs text-gray-400 max-w-[220px] truncate">{s.address ?? "—"}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex justify-end gap-1">
                            {canEdit && (
                              <button
                                onClick={() => openEdit(s)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-violet-500 dark:hover:text-violet-300"
                                title="Editar"
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => onDelete(s)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-500 dark:hover:text-rose-300"
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
            )}

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 dark:border-white/[0.04] px-5 py-3 text-xs text-gray-500 dark:text-gray-500">
                <span>Pág. {page} / {totalPages}</span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-md border border-gray-200 dark:border-white/[0.08] px-2.5 py-1 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                  >‹</button>
                  <span className="px-2">de {totalPages}</span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-md border border-gray-200 dark:border-white/[0.08] px-2.5 py-1 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                  >›</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* MODAL */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-gray-950/50 dark:bg-gray-950/60 backdrop-blur-sm grid place-items-center px-3 py-6"
            onClick={() => setModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1320] shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/[0.06] px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-50 dark:bg-cyan-500/10 text-cyan-500 dark:text-cyan-300">
                    <Truck size={16} />
                  </div>
                  <div>
                    <p className="text-base font-bold text-gray-800 dark:text-white">{editing ? "Editar proveedor" : "Nuevo proveedor"}</p>
                    <p className="text-xs text-gray-400">{editing ? "Modifica los datos del proveedor" : "Registra un proveedor de repuestos o servicios"}</p>
                  </div>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
                >
                  <IconClose className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3 px-5 py-4 max-h-[65vh] overflow-y-auto">
                <Field label="Nombre" required>
                  <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Repuestos del Sur" />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Contacto">
                    <input className={inputCls} value={form.contactName ?? ''} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Nombre del responsable" />
                  </Field>
                  <Field label="NIT">
                    <input className={inputCls} value={form.nit ?? ''} onChange={(e) => setForm({ ...form, nit: e.target.value })} placeholder="900123456-7" />
                  </Field>
                </div>
                <Field label="Email">
                  <input className={inputCls} type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contacto@empresa.com" />
                </Field>
                <Field label="Teléfono">
                  <input className={inputCls} value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+57 300 000 0000" />
                </Field>
                <Field label="Ubicación">
                  <LocationPickerModal
                    value={form.address ?? ''}
                    onChange={(result) => setForm((f) => ({
                      ...f, address: String(result.address ?? ''),
                      latitude: result.latitude || undefined,
                      longitude: result.longitude || undefined,
                    }))}
                    placeholder="Busca la dirección del proveedor…"
                  />
                </Field>
                <Field label="Notas">
                  <textarea
                    rows={2}
                    className={inputCls + ' !h-auto py-2'}
                    value={form.notes ?? ''}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Observaciones, condiciones de pago, etc."
                  />
                </Field>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-gray-100 dark:border-white/[0.06] bg-gray-50/80 dark:bg-white/[0.02] px-5 py-3.5">
                <button
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
                >
                  Cancelar
                </button>
                <button
                  onClick={submit}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50 active:scale-95"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {editing ? "Guardar cambios" : "Crear proveedor"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DRAWER detalle */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-gray-950/20 dark:bg-gray-950/40"
              onClick={() => setSelectedId(null)}
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 350, damping: 35 }}
              className="fixed right-0 top-0 z-50 h-full w-full max-w-sm border-l border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1320] shadow-2xl overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/[0.06] px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-50 dark:bg-cyan-500/10 text-cyan-500 dark:text-cyan-300">
                    <Truck size={16} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-800 dark:text-white">{selected.name}</h2>
                    <p className="text-xs text-gray-400">{selected.nit ?? "—"}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
                >
                  <IconClose className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 px-5 py-5">
                {[
                  { label: "Contacto",  value: selected.contactName ?? "—" },
                  { label: "Email",     value: selected.email ?? "—" },
                  { label: "Teléfono",  value: selected.phone ?? "—" },
                  { label: "NIT",       value: selected.nit ?? "—" },
                  { label: "Dirección", value: selected.address ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</p>
                    <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-200 break-words">{value}</p>
                  </div>
                ))}

                {selected.latitude && selected.longitude && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selected.latitude},${selected.longitude}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-xl border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/10 px-4 py-3 text-sm font-medium text-violet-600 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-500/15 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                        <circle cx="12" cy="9" r="2.5"/>
                      </svg>
                      Ver en Google Maps
                    </div>
                    <svg className="h-3.5 w-3.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
                    </svg>
                  </a>
                )}

                {selected.notes && (
                  <div className="rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Notas</p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{selected.notes}</p>
                  </div>
                )}

                {(canEdit || canDelete) && (
                  <div className="flex gap-3 pt-1">
                    {canEdit && (
                      <button
                        onClick={() => { setSelectedId(null); openEdit(selected); }}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-white/[0.08] py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
                      >
                        <IconEdit className="h-4 w-4" /> Editar
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => onDelete(selected)}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 py-2.5 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors"
                      >
                        <Trash2 size={14} /> Eliminar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}