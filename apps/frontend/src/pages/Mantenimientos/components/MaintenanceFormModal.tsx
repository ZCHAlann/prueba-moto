// pages/Mantenimientos/components/MaintenanceFormModal.tsx
// Modal rediseñado: dark, con cards y mejor jerarquía visual.
// Soporta 3 modos: crear, editar, completar.

import { useEffect, useMemo, useState } from "react";
import {
  X, Plus, Trash2, Save, Check, Calendar as CalIcon, Wrench,
  Droplet, Cog, AlertTriangle, MapPin, Building2, Package,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCreateMaintenance,
  useUpdateMaintenance,
  useCompleteMaintenance,
  type Maintenance,
  type MaintenanceInput,
  type MaintenanceItemInput,
  type MaintenanceType,
  type MaintenanceCategory,
  type CadenceKind,
} from "../../../hooks/useMaintenancesV2";
import { useWorkshopsList } from "../../../hooks/useWorkshops";
import { useSuppliersList } from "../../../hooks/useSuppliers";
import { useAuth } from "../../../context/AuthContext";
import { useAssets } from "../../../hooks/useAssets";
import { usePermissions } from "../../../hooks/usePermissions";

const TYPES: { value: MaintenanceType; label: string; active: string; idle: string }[] = [
  { value: 'Preventivo', label: 'Preventivo',  active: 'border-sky-500 bg-sky-500/10 text-sky-300',     idle: 'border-white/[0.06] text-gray-500 hover:text-gray-300' },
  { value: 'Correctivo', label: 'Correctivo',  active: 'border-orange-500 bg-orange-500/10 text-orange-300', idle: 'border-white/[0.06] text-gray-500 hover:text-gray-300' },
  { value: 'Programado', label: 'Programado',  active: 'border-violet-500 bg-violet-500/10 text-violet-300', idle: 'border-white/[0.06] text-gray-500 hover:text-gray-300' },
];

const CATEGORY_ICON: Record<MaintenanceCategory, React.ReactNode> = {
  'Primordial:Bombas':  <AlertTriangle size={13} />,
  'Primordial:Motores': <Cog size={13} />,
  'Aceite:Cambio':      <Droplet size={13} />,
  'Aceite:Inventario':  <Droplet size={13} />,
  'Otro':               <Wrench size={13} />,
};

const CADENCES: { value: CadenceKind; label: string; needsValue: boolean; isKm?: boolean }[] = [
  { value: 'none',     label: 'No se repite',     needsValue: false },
  { value: 'weekly',   label: 'Cada semana',      needsValue: false },
  { value: 'days',     label: 'Cada N días',      needsValue: true  },
  { value: 'monthly',  label: 'Cada mes (30d)',   needsValue: false },
  { value: 'km_based', label: 'Cada N km',        needsValue: true, isKm: true },
];

interface Props {
  open: boolean;
  onClose: () => void;
  prefill?: { assetId?: string; scheduledFor?: string } | null;
  maintenance?: Maintenance | null;
  completeMode?: boolean;
}

const inputCls = "w-full rounded-lg border border-white/[0.06] bg-[#0f1320] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 transition";

const labelCls = "text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5 block";

export function MaintenanceFormModal({ open, onClose, prefill, maintenance, completeMode = false }: Props) {
  const { can } = usePermissions();
  const canComplete = can('maintenance', 'execution', 'editar');

  const { assets: assetsList = [] } = useAssets();
  const { data: wsData } = useWorkshopsList();
  const { data: supData } = useSuppliersList();

  const assets    = assetsList;
  const workshops = wsData?.data ?? [];
  const suppliers = supData?.data ?? [];

  const isEditing = !!maintenance;
  const isCompleting = completeMode && isEditing;

  const createMut = useCreateMaintenance();
  const updateMut = useUpdateMaintenance();
  const completeMut = useCompleteMaintenance();

  // ─── Form state ────────────────────────────────────────────────────────────
  const [assetId, setAssetId] = useState('');
  const [workshopId, setWorkshopId] = useState<string>('');
  const [type, setType] = useState<MaintenanceType>('Preventivo');
  const [category, setCategory] = useState<MaintenanceCategory>('Otro');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [odometerKm, setOdometerKm] = useState<number | null>(null);
  const [cadenceKind, setCadenceKind] = useState<CadenceKind>('none');
  const [cadenceValue, setCadenceValue] = useState<number | null>(null);
  const [nextTriggerKm, setNextTriggerKm] = useState<number | null>(null);
  const [scheduledFor, setScheduledFor] = useState<string>('');
  const [items, setItems] = useState<MaintenanceItemInput[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    if (maintenance) {
      setAssetId(maintenance.assetId);
      setWorkshopId(maintenance.workshopId ?? '');
      setType(maintenance.type);
      setCategory(maintenance.category);
      setTitle(maintenance.title ?? '');
      setDescription(maintenance.description ?? '');
      setOdometerKm(maintenance.odometerKm);
      setCadenceKind(maintenance.cadenceKind);
      setCadenceValue(maintenance.cadenceValue);
      setNextTriggerKm(maintenance.nextTriggerKm);
      setScheduledFor(maintenance.scheduledFor?.slice(0, 16) ?? '');
      setItems(maintenance.items.map((i) => ({
        supplierId: i.supplierId,
        name: i.name,
        quantity: i.quantity,
        unitCost: i.unitCost,
      })));
      setNotes(maintenance.notes ?? '');
    } else {
      setAssetId(prefill?.assetId ?? '');
      setWorkshopId('');
      setType('Preventivo');
      setCategory('Otro');
      setTitle('');
      setDescription('');
      setOdometerKm(null);
      setCadenceKind('none');
      setCadenceValue(null);
      setNextTriggerKm(null);
      setScheduledFor(prefill?.scheduledFor ?? new Date().toISOString().slice(0, 16));
      setItems([]);
      setNotes('');
    }
  }, [open, maintenance, prefill]);

  const totalCost = useMemo(
    () => items.reduce((acc, i) => acc + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0), 0),
    [items],
  );

  if (!open) return null;

  const submitCreate = async () => {
    if (!assetId || !title || !scheduledFor) {
      toast.error('Completa vehículo, título y fecha programada');
      return;
    }
    const payload: MaintenanceInput = {
      assetId, workshopId: workshopId || null, type, category, title,
      description: description || null, odometerKm: odometerKm ?? null,
      cadenceKind, cadenceValue: cadenceValue ?? null, nextTriggerKm: nextTriggerKm ?? null,
      scheduledFor: new Date(scheduledFor).toISOString(),
      notes: notes || null, items: items.length ? items : undefined,
    };
    try {
      await createMut.mutateAsync(payload);
      toast.success('Mantenimiento creado');
      onClose();
    } catch (e) { toast.error((e as Error).message); }
  };

  const submitUpdate = async () => {
    if (!maintenance) return;
    try {
      await updateMut.mutateAsync({
        id: maintenance.id,
        body: {
          workshopId: workshopId || null, type, category, title,
          description: description || null, odometerKm: odometerKm ?? null,
          cadenceKind, cadenceValue: cadenceValue ?? null, nextTriggerKm: nextTriggerKm ?? null,
          scheduledFor: new Date(scheduledFor).toISOString(),
          notes: notes || null, items: items.length ? items : undefined,
        },
      });
      toast.success('Mantenimiento actualizado');
      onClose();
    } catch (e) { toast.error((e as Error).message); }
  };

  const submitComplete = async () => {
    if (!maintenance) return;
    try {
      const res = await completeMut.mutateAsync({
        id: maintenance.id,
        body: {
          odometerKm: odometerKm ?? undefined,
          notes: notes || undefined,
          items: items.length ? items : undefined,
        },
      });
      toast.success(res.rescheduledId ? `Completado. Reagendado: ${res.scheduledFor?.slice(0,10)}` : 'Completado');
      onClose();
    } catch (e) { toast.error((e as Error).message); }
  };

  const addItem = () => setItems((prev) => [...prev, { name: '', quantity: 1, unitCost: 0, supplierId: null }]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, patch: Partial<MaintenanceItemInput>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const headerTitle = isCompleting ? 'Completar mantenimiento' : isEditing ? 'Editar mantenimiento' : 'Agendar mantenimiento';
  const headerSubtitle = isCompleting
    ? 'Registra el cierre, agrega los repuestos finales y confirma el odómetro.'
    : isEditing ? 'Modifica la información del mantenimiento seleccionado.' : 'Programa un nuevo mantenimiento arrastrando un vehículo o completando los datos.';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl bg-[#0f1320] border border-white/[0.06] shadow-2xl my-4 overflow-hidden">

        {/* Header */}
        <div className="relative px-5 sm:px-7 py-4 border-b border-white/[0.06] bg-gradient-to-br from-violet-500/10 via-transparent to-transparent">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-violet-400">
                {isCompleting ? 'Cierre' : isEditing ? 'Edición' : 'Nuevo'}
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white mt-0.5">{headerTitle}</h2>
              <p className="text-xs text-gray-400 mt-1 max-w-md">{headerSubtitle}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-white rounded-md hover:bg-white/[0.06] transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-7 py-5 space-y-5 max-h-[calc(100vh-220px)] overflow-y-auto">

          {/* Vehículo + Fecha */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Vehículo *</label>
              <select
                className={inputCls}
                value={assetId}
                disabled={isEditing}
                onChange={(e) => setAssetId(e.target.value)}
              >
                <option value="">Seleccionar…</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.plate ? `${a.plate} — ${a.name}` : a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Fecha y hora *</label>
              <input
                type="datetime-local"
                className={inputCls}
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            </div>
          </div>

          {/* Taller + Categoría */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                <span className="inline-flex items-center gap-1.5">
                  <Building2 size={11} /> Taller (opcional)
                </span>
              </label>
              <select className={inputCls} value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}>
                <option value="">Sin asignar</option>
                {workshops.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Categoría</label>
              <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as MaintenanceCategory)}>
                <option value="Primordial:Bombas">Primordial · Bombas e inyectores</option>
                <option value="Primordial:Motores">Primordial · Motores</option>
                <option value="Aceite:Cambio">Aceite · Cambio</option>
                <option value="Aceite:Inventario">Aceite · Inventario</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
          </div>

          {/* Tipo (botones segmentados) */}
          <div>
            <label className={labelCls}>Tipo de mantenimiento</label>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition ${
                    type === t.value ? t.active : t.idle
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Título + Descripción */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className={labelCls}>Título *</label>
              <input
                className={inputCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Cambio de aceite y filtro"
              />
            </div>
            <div>
              <label className={labelCls}>Descripción</label>
              <textarea
                className={inputCls + ' min-h-[70px] resize-none'}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalles adicionales sobre el trabajo a realizar…"
              />
            </div>
          </div>

          {/* Periodicidad */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CalIcon size={14} className="text-violet-400" />
              <span className="text-xs font-semibold text-gray-200 uppercase tracking-wider">
                Periodicidad (reagendamiento automático)
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                className={inputCls}
                value={cadenceKind}
                onChange={(e) => setCadenceKind(e.target.value as CadenceKind)}
              >
                {CADENCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              {CADENCES.find((c) => c.value === cadenceKind)?.needsValue && (
                <input
                  type="number"
                  min={1}
                  className={inputCls}
                  value={cadenceValue ?? ''}
                  onChange={(e) => setCadenceValue(e.target.value ? Number(e.target.value) : null)}
                  placeholder={CADENCES.find((c) => c.value === cadenceKind)?.isKm ? 'Kilómetros' : 'Días'}
                />
              )}
              {cadenceKind === 'km_based' && (
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={nextTriggerKm ?? ''}
                  onChange={(e) => setNextTriggerKm(e.target.value ? Number(e.target.value) : null)}
                  placeholder="Km en que se disparará"
                />
              )}
            </div>
          </div>

          {/* Odómetro (solo en complete) */}
          {isCompleting && (
            <div>
              <label className={labelCls}>Odómetro al completar (km)</label>
              <input
                type="number"
                min={0}
                className={inputCls}
                value={odometerKm ?? ''}
                onChange={(e) => setOdometerKm(e.target.value ? Number(e.target.value) : null)}
                placeholder="Lectura actual del vehículo"
              />
            </div>
          )}

          {/* Items / repuestos */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package size={14} className="text-violet-400" />
                <span className="text-xs font-semibold text-gray-200 uppercase tracking-wider">
                  Repuestos / Insumos
                </span>
              </div>
              <button
                type="button"
                onClick={addItem}
                className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 border border-violet-500/20 transition"
              >
                <Plus size={12} /> Agregar
              </button>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-gray-500 py-3 text-center">Sin items. Agrega repuestos o insumos.</p>
            ) : (
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                    <input
                      className={`${inputCls} col-span-5`}
                      placeholder="Repuesto"
                      value={it.name}
                      onChange={(e) => updateItem(idx, { name: e.target.value })}
                    />
                    <select
                      className={`${inputCls} col-span-3`}
                      value={it.supplierId ?? ''}
                      onChange={(e) => updateItem(idx, { supplierId: e.target.value || null })}
                    >
                      <option value="">Sin proveedor</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <input
                      className={`${inputCls} col-span-1`}
                      type="number" min={0} step="0.01"
                      value={it.quantity}
                      onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                      title="Cantidad"
                    />
                    <input
                      className={`${inputCls} col-span-2`}
                      type="number" min={0}
                      value={it.unitCost}
                      onChange={(e) => updateItem(idx, { unitCost: Number(e.target.value) })}
                      title="Costo unitario"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="col-span-1 p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-md transition"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <div className="text-right text-sm font-semibold pt-2 border-t border-white/[0.04]">
                  Total:{' '}
                  <span className="text-violet-300">
                    ${totalCost.toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className={labelCls}>
              {isCompleting ? 'Notas de cierre' : 'Notas'}
            </label>
            <textarea
              className={inputCls + ' min-h-[60px] resize-none'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex flex-col sm:flex-row sm:justify-end gap-2 border-t border-white/[0.06] bg-[#0f1320] px-5 sm:px-7 py-3.5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm border border-white/[0.06] text-gray-300 hover:bg-white/[0.04] transition order-2 sm:order-1"
          >
            Cancelar
          </button>
          {isCompleting ? (
            canComplete && (
              <button
                onClick={submitComplete}
                disabled={completeMut.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-400 flex items-center justify-center gap-1.5 disabled:opacity-50 order-1 sm:order-2"
              >
                <Check size={14} />
                {completeMut.isPending ? 'Completando…' : 'Marcar completado'}
              </button>
            )
          ) : isEditing ? (
            <button
              onClick={submitUpdate}
              disabled={updateMut.isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-500 text-white hover:bg-violet-400 flex items-center justify-center gap-1.5 disabled:opacity-50 order-1 sm:order-2"
            >
              <Save size={14} />
              {updateMut.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          ) : (
            <button
              onClick={submitCreate}
              disabled={createMut.isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-500 text-white hover:bg-violet-400 flex items-center justify-center gap-1.5 disabled:opacity-50 order-1 sm:order-2"
            >
              <Plus size={14} />
              {createMut.isPending ? 'Creando…' : 'Crear mantenimiento'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default MaintenanceFormModal;
