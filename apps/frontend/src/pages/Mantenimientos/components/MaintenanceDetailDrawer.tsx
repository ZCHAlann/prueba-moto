// pages/Mantenimientos/components/MaintenanceDetailDrawer.tsx
//
// Drawer lateral con toda la info del mantenimiento.
// v3: Reasignación con dropdown de operadores (reemplaza input de texto libre).

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Truck, Calendar, Hash, Download, RefreshCw, CheckCircle2, Play,
  User as UserIcon, Clock, AlertCircle, Package,
} from "lucide-react";
import { toast } from "sonner";
import {
  useMaintenance,
  useAddMaintenanceNote,
  useAddMaintenanceItems,
  useAssignMaintenance,
  type Maintenance,
} from "../../../hooks/useMaintenancesV2";
import { useCompanyUsers } from "../../../hooks/useCompanyUsers";
import { useAuth } from "../../../context/AuthContext";

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtMoney(n: number | string | null | undefined) {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v);
}

const STATUS_DOT: Record<string, string> = {
  Programado:   "bg-violet-500",
  "En proceso": "bg-sky-500",
  Completado:   "bg-emerald-500",
};

const EVENT_LABEL: Record<string, string> = {
  created:        "Mantenimiento creado",
  assigned:       "Asignado a un operador",
  reassigned:     "Reasignado",
  taken:          "Operador tomó el mantenimiento",
  item_added:     "Repuestos agregados",
  note_added:     "Nota agregada",
  photo_uploaded: "Foto subida",
  cancelled:      "Cancelado y reprogramado",
  finalized:      "Finalizado como completado",
  viewed:         "Visualizado por un usuario",
};

export function MaintenanceDetailDrawer({
  id, isFullAccess, meId, onClose, onEdit, onTake, onFinalize, onReschedule,
}: {
  id: string | null;
  isFullAccess: boolean;
  meId: number | null;
  onClose: () => void;
  onEdit: (m: Maintenance) => void;
  onTake: (m: Maintenance) => void;
  onFinalize: (m: Maintenance) => void;
  onReschedule: (m: Maintenance) => void;
}) {
  const { data: m, isLoading, refetch } = useMaintenance(id ?? undefined);
  const { session } = useAuth();
  const meRole = session?.role ?? "";

  // Usuarios de la empresa para el selector de reasignación
  const { users: companyUsers } = useCompanyUsers();
  const operadores = useMemo(
    () => companyUsers.filter((u) => u.role === "operador" && u.status === "active"),
    [companyUsers],
  );

  const [newNote, setNewNote] = useState("");
  const [newItem, setNewItem] = useState<{ name: string; quantity: number; unitCost: number }>({
    name: "", quantity: 1, unitCost: 0,
  });
  // Dropdown de reasignación (id del usuario seleccionado)
  const [assignTo, setAssignTo] = useState("");

  const addNoteMut  = useAddMaintenanceNote();
  const addItemsMut = useAddMaintenanceItems();
  const assignMut   = useAssignMaintenance();

  useEffect(() => {
    setNewNote("");
    setNewItem({ name: "", quantity: 1, unitCost: 0 });
    setAssignTo("");
  }, [id]);

  if (!id) return null;
  const item: Maintenance | null = m ?? null;

  const meIdStr = meId != null ? String(meId) : null;
  const isOwn = item ? (meIdStr != null && (item.assignedUserId === meIdStr || item.createdBy === meIdStr)) : false;
  const canOperate = isFullAccess || isOwn;

  const isProgramado = item?.status === "Programado";
  const isProceso    = item?.status === "En proceso";
  const isCompleto   = item?.status === "Completado";

  // Nombre del operador actualmente asignado (para el select por defecto)
  const currentAssignedId = item?.assignedUserId ?? "";

  return (
    <AnimatePresence>
      {id && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl dark:bg-gray-900"
          >
            {isLoading || !item ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">Cargando…</div>
            ) : (
              <div className="flex h-full flex-col">

                {/* Header */}
                <div className={`relative border-l-4 ${STATUS_DOT[item.status]?.replace("bg-", "border-l-") ?? "border-l-gray-300"} border-b border-gray-200 dark:border-white/[0.06] px-5 py-4`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200">
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[item.status]}`} />
                          {item.status}
                        </span>
                        {item.isReprogrammed && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                            <RefreshCw size={10} /> Re-programado
                          </span>
                        )}
                        {item.type && (
                          <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-white/[0.04] dark:text-gray-300">
                            {item.type}
                          </span>
                        )}
                      </div>
                      <h2 className="mt-2 text-lg font-bold text-gray-800 dark:text-white">{item.title ?? "Mantenimiento"}</h2>
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 font-mono">#{item.id}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={async () => {
                          const { generateMaintenanceDetailPdf } = await import("../../../components/features/pdf/MaintenanceDetailPdf");
                          const blob = await generateMaintenanceDetailPdf(item);
                          const url = URL.createObjectURL(blob);
                          window.open(url, "_blank");
                          setTimeout(() => URL.revokeObjectURL(url), 60_000);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.05] transition"
                      >
                        <Download size={13} /> PDF
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">

                  {/* Reprog. reason */}
                  {item.isReprogrammed && item.reprogramReason && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300">
                        Reprogramado{item.reprogramCount > 1 ? ` (${item.reprogramCount}×)` : ""}
                      </p>
                      <p className="mt-1 text-sm text-amber-900 dark:text-amber-100 whitespace-pre-wrap">{item.reprogramReason}</p>
                      {item.reprogrammedAt && (
                        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">Reprogramado el {fmtDateTime(item.reprogrammedAt)}</p>
                      )}
                    </div>
                  )}

                  <Section title="Vehículo">
                    <Row icon={<Truck size={12} />} label="Placa"  value={item.assetPlate ?? "—"} />
                    <Row icon={<Truck size={12} />} label="Nombre" value={item.assetName ?? "—"} />
                  </Section>

                  <Section title="Asignación">
                    <Row
                      icon={<UserIcon size={12} />}
                      label="Asignado a"
                      value={
                        item.assignedUserName
                          ? <span className="font-medium text-sky-700 dark:text-sky-300">{item.assignedUserName}</span>
                          : <span className="text-gray-400 italic">Libre — sin asignar</span>
                      }
                    />
                    {item.takenAt && <Row icon={<Clock size={12} />} label="Tomado el" value={fmtDateTime(item.takenAt)} />}
                  </Section>

                  <Section title="Programación">
                    <Row icon={<Calendar size={12} />} label="Programado" value={fmtDateTime(item.scheduledFor)} />
                    <Row icon={<Calendar size={12} />} label="Ejecutado"  value={fmtDateTime(item.executedAt)} />
                    <Row icon={<Calendar size={12} />} label="Completado" value={fmtDateTime(item.completedAt)} />
                    {item.odometerKm != null && (
                      <Row icon={<Hash size={12} />} label="Odómetro" value={`${item.odometerKm.toLocaleString("es-CO")} km`} />
                    )}
                  </Section>

                  {item.description && (
                    <Section title="Descripción">
                      <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-700 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-200 whitespace-pre-wrap">
                        {item.description}
                      </p>
                    </Section>
                  )}

                  {/* Avance: items, notas — solo en En proceso / Completado para los suyos (o admin) */}
                  {(isProceso || isCompleto) && canOperate && (
                    <Section title="Repuestos y avance">
                      {item.items && item.items.length > 0 && (
                        <ul className="divide-y divide-gray-100 dark:divide-white/[0.05] rounded-lg border border-gray-200 dark:border-white/[0.06] overflow-hidden mb-3">
                          {item.items.map((it) => (
                            <li key={it.id} className="flex items-start gap-3 px-3 py-2.5 text-xs">
                              {it.photoUrl ? (
                                <img src={it.photoUrl} alt={it.name} className="h-10 w-10 rounded-md object-cover" />
                              ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 text-gray-400 dark:bg-white/[0.04]">
                                  <Package size={14} />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-800 dark:text-white truncate">{it.name}</p>
                                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                  {it.supplierName ? `${it.supplierName} · ` : ""}{it.quantity} × {fmtMoney(it.unitCost)}
                                </p>
                              </div>
                              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">{fmtMoney(it.subtotal)}</p>
                            </li>
                          ))}
                        </ul>
                      )}

                      {isProceso && (
                        <div className="space-y-2">
                          {/* Agregar repuesto */}
                          <details className="rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-2.5">
                            <summary className="cursor-pointer text-xs font-semibold text-gray-600 dark:text-gray-300">+ Agregar repuesto</summary>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                              <input
                                placeholder="Nombre"
                                value={newItem.name}
                                onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
                                className="rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2 py-1.5 col-span-2"
                              />
                              <input
                                type="number" placeholder="Cant." value={newItem.quantity}
                                onChange={(e) => setNewItem((p) => ({ ...p, quantity: Number(e.target.value) }))}
                                className="rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2 py-1.5"
                              />
                              <input
                                type="number" placeholder="Costo unit." value={newItem.unitCost}
                                onChange={(e) => setNewItem((p) => ({ ...p, unitCost: Number(e.target.value) }))}
                                className="rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2 py-1.5"
                              />
                              <button
                                onClick={async () => {
                                  if (!newItem.name.trim()) { toast.error("Nombre requerido"); return; }
                                  try {
                                    await addItemsMut.mutateAsync({
                                      id: item.id,
                                      items: [{ name: newItem.name, quantity: newItem.quantity, unitCost: newItem.unitCost }],
                                    });
                                    setNewItem({ name: "", quantity: 1, unitCost: 0 });
                                    toast.success("Repuesto agregado");
                                    refetch();
                                  } catch (e) { toast.error((e as Error).message); }
                                }}
                                className="col-span-2 rounded-md bg-sky-600 hover:bg-sky-700 px-3 py-1.5 text-xs font-medium text-white transition"
                              >
                                Guardar repuesto
                              </button>
                            </div>
                          </details>

                          {/* Agregar nota */}
                          <details className="rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-2.5">
                            <summary className="cursor-pointer text-xs font-semibold text-gray-600 dark:text-gray-300">+ Agregar nota</summary>
                            <div className="mt-2 space-y-2">
                              <textarea
                                rows={2}
                                placeholder="Escribí una nota…"
                                value={newNote}
                                onChange={(e) => setNewNote(e.target.value)}
                                className="w-full rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2 py-1.5 text-xs resize-none"
                              />
                              <button
                                onClick={async () => {
                                  if (!newNote.trim()) { toast.error("Nota requerida"); return; }
                                  try {
                                    await addNoteMut.mutateAsync({ id: item.id, text: newNote });
                                    setNewNote("");
                                    toast.success("Nota agregada");
                                    refetch();
                                  } catch (e) { toast.error((e as Error).message); }
                                }}
                                className="rounded-md bg-sky-600 hover:bg-sky-700 px-3 py-1.5 text-xs font-medium text-white transition"
                              >
                                Guardar nota
                              </button>
                            </div>
                          </details>
                        </div>
                      )}
                    </Section>
                  )}

                  {/* Timeline: solo para full access */}
                  {isFullAccess && item.events && item.events.length > 0 && (
                    <Section title="Línea de tiempo">
                      <ol className="relative space-y-3 pl-5 before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-px before:bg-gray-200 dark:before:bg-white/[0.08]">
                        {item.events.map((e) => (
                          <li key={e.id} className="relative">
                            <span className="absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-white dark:ring-gray-900" />
                            <div className="text-xs text-gray-800 dark:text-white">
                              <p className="font-medium">{EVENT_LABEL[e.kind] ?? e.kind}</p>
                              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                {fmtDateTime(e.createdAt)}{e.actorName ? ` · ${e.actorName}` : ""}
                              </p>
                              {e.kind === "cancelled" && (e.payload as any)?.reason && (
                                <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                                  Motivo: {String((e.payload as any).reason)}
                                </p>
                              )}
                              {e.kind === "taken" && (
                                <p className="mt-0.5 text-[11px] text-sky-700 dark:text-sky-300">
                                  Operador tomó el mantenimiento y pasó a En proceso.
                                </p>
                              )}
                              {e.kind === "finalized" && (
                                <p className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                                  Mantenimiento cerrado como completado.
                                </p>
                              )}
                              {e.kind === "item_added" && (
                                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                  {String((e.payload as any).count ?? 0)} repuesto(s) — total {fmtMoney((e.payload as any).totalAdded ?? 0)}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </Section>
                  )}

                  <Section title="Costo total">
                    <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 dark:border-violet-500/20 dark:bg-violet-500/10">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-300">Total</p>
                      <p className="mt-0.5 text-2xl font-bold text-violet-700 dark:text-violet-200">{fmtMoney(item.totalCost)}</p>
                    </div>
                  </Section>

                  {/* ── Reasignar operador — solo admin/owner/supervisor ─────── */}
                  {isFullAccess && (isProgramado || isProceso) && (
                    <Section title="Reasignar operador">
                      <div className="p-3 space-y-2">
                        <select
                          value={assignTo || currentAssignedId}
                          onChange={(e) => setAssignTo(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-3 py-2 text-xs text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400/30 transition"
                        >
                          <option value="">— Sin asignar (libre) —</option>
                          {operadores.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.username}{u.email ? ` — ${u.email}` : ""}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={async () => {
                            try {
                              await assignMut.mutateAsync({ id: item.id, userId: assignTo });
                              toast.success(assignTo ? "Operador asignado" : "Asignación eliminada");
                              setAssignTo("");
                              refetch();
                            } catch (e) { toast.error((e as Error).message); }
                          }}
                          disabled={assignMut.isPending || (!assignTo && !currentAssignedId)}
                          className="w-full rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-3 py-1.5 text-xs font-medium text-white transition"
                        >
                          {assignMut.isPending ? "Guardando…" : "Confirmar asignación"}
                        </button>
                      </div>
                    </Section>
                  )}
                </div>

                {/* Footer con acciones contextuales */}
                <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 dark:border-white/[0.06] px-5 py-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-gray-200 dark:border-white/[0.06] px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition"
                  >
                    Cerrar
                  </button>

                  {/* Iniciar — Programado, operador (libre o dueño) */}
                  {isProgramado && meRole === "operador" && (!item.assignedUserId || item.assignedUserId === String(meId)) && (
                    <button
                      onClick={() => onTake(item)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 px-4 py-2 text-xs font-semibold text-white transition"
                    >
                      <Play size={13} /> Iniciar mantenimiento
                    </button>
                  )}

                  {/* Tomar — admin/supervisor en programado libre */}
                  {isProgramado && isFullAccess && !item.assignedUserId && (
                    <button
                      onClick={() => onTake(item)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 px-4 py-2 text-xs font-semibold text-white transition"
                    >
                      <Play size={13} /> Tomar mantenimiento
                    </button>
                  )}

                  {/* Asignado a otro — informativo */}
                  {isProgramado && !isFullAccess && item.assignedUserId && String(item.assignedUserId) !== String(meId) && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/[0.06] px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                      <AlertCircle size={12} /> Asignado a {item.assignedUserName}
                    </span>
                  )}

                  {/* Reprogramar */}
                  {(isProceso || isProgramado) && canOperate && (
                    <button
                      onClick={() => onReschedule(item)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 px-4 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300 transition"
                    >
                      <RefreshCw size={13} /> Reprogramar
                    </button>
                  )}

                  {/* Finalizar */}
                  {isProceso && canOperate && (
                    <button
                      onClick={() => onFinalize(item)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition"
                    >
                      <CheckCircle2 size={13} /> Finalizar
                    </button>
                  )}

                  {isCompleto && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 size={12} /> Mantenimiento completado
                    </span>
                  )}
                </div>

              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{title}</p>
      <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] divide-y divide-gray-100 dark:divide-white/[0.04]">
        {children}
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-gray-500 dark:text-gray-400">
        {icon}
        {label}
      </span>
      <span className="text-right text-gray-800 dark:text-white">{value}</span>
    </div>
  );
}