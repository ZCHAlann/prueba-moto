// pages/Mantenimientos/components/MaintenanceFormModal.tsx
//
// Modal dark/light completo. Soporta 3 tipos:
//   * Programado: variante normal (vehículo, taller, cadencia, items, mano de obra)
//   * Correctivo: variante normal, arranca en En proceso, auto-asignado
//   * Lavada: variante simplificada (sin taller, sin items, sin cadencia);
//     tiene lugar/proveedor/notas y total cost
//
// Al agendar (maintenance = null), el selector de tipo se muestra.
// Al editar (maintenance != null), el selector también.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X, Plus, Trash2, Save, Calendar as CalIcon,
  Building2, Package, ImagePlus, XCircle,
  Wrench, Droplet, MapPin, Store, DollarSign, Hash,
  Receipt, FileText, Camera, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCreateMaintenance,
  useUpdateMaintenance,
  uploadMaintenanceAttachment,
  type Maintenance,
  type MaintenanceInput,
  type MaintenanceItemInput,
  type MaintenanceType,
  type CadenceKind,
} from "../../../hooks/useMaintenancesV2";
import { useWorkshops } from "../../../hooks/useWorkshops";
import { useSuppliers } from "../../../hooks/useSuppliers";
import { useAssets } from "../../../hooks/useAssets";
import { useCompanyUsers } from "../../../hooks/useCompanyUsers";
import { usePermissions } from "../../../hooks/usePermissions";
import { useAuth } from "../../../context/AuthContext";

// ─── Upload helper ─────────────────────────────────────────────────────────────
// Valida mimetype/tamaño en el cliente para fallar rápido con un mensaje
// claro (el backend re-valida con whitelist y companyId).

const PART_ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "image/heic", "image/heif", "application/pdf",
]);
const PART_MAX_SIZE_BYTES = 10 * 1024 * 1024;

async function uploadPartPhoto(file: File, companyId?: string | number): Promise<string> {
  if (!PART_ALLOWED_TYPES.has(file.type)) {
    throw new Error(`Tipo de archivo no permitido: ${file.type || "(vacío)"}. Use JPG, PNG, WebP, HEIC o PDF.`);
  }
  if (file.size > PART_MAX_SIZE_BYTES) {
    throw new Error("El archivo supera el tamaño máximo permitido (10 MB).");
  }

  const fd = new FormData();
  fd.append("photo", file);
  const qs = companyId ? `?companyId=${companyId}` : "";

  // Validación client-side de companyId: si el user no tiene sesión
  // con companyId, no tiene sentido intentar el upload.
  if (!companyId) {
    throw new Error("Sesión sin empresa: no se puede subir la foto.");
  }

  const res = await fetch(`/api/upload/part-photos${qs}`, {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.clone().json();
      if (j?.error) msg = j.error;
    } catch { /* ignore */ }
    throw new Error(`Upload part-photo: ${msg}`);
  }
  const json = await res.json();
  if (!json.url) throw new Error("Upload part-photo: respuesta sin URL");
  return json.url as string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TYPES: { value: MaintenanceType; label: string; active: string; idle: string; description: string }[] = [
  {
    value: "Programado",
    label: "Programado",
    description: "Se agenda con anticipación. Asignado a un taller.",
    active: "border-violet-400 dark:border-violet-500 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300",
    idle:   "border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-white/[0.12]",
  },
  {
    value: "Correctivo",
    label: "Correctivo",
    description: "Urgencia: algo se rompió. Arranca en En proceso.",
    active: "border-orange-400 dark:border-orange-500 bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300",
    idle:   "border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-white/[0.12]",
  },
  {
    value: "Lavada",
    label: "Lavada",
    description: "Servicio de lavado. Lugar, costo, fotos.",
    active: "border-sky-400 dark:border-sky-500 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300",
    idle:   "border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-white/[0.12]",
  },
];

const CADENCES: { value: CadenceKind; label: string; needsValue: boolean; isKm?: boolean }[] = [
  { value: "none",     label: "No se repite",   needsValue: false },
  { value: "weekly",   label: "Cada semana",    needsValue: false },
  { value: "days",     label: "Cada N días",    needsValue: true  },
  { value: "monthly",  label: "Cada mes (30d)", needsValue: false },
  { value: "km_based", label: "Cada N km",      needsValue: true, isKm: true },
];

// ─── Extended item type (local only — photoUrl is UI state, not persisted via this type) ─

type ItemRow = MaintenanceItemInput & {
  /** URL pública una vez subida, o null si aún no tiene foto. */
  photoUrl: string | null;
  /** true mientras se sube la foto de este item. */
  uploading: boolean;
};

// ─── Styles ────────────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-[#0f1320] px-3 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-400/30 dark:focus:ring-violet-500/40 focus:border-violet-400 dark:focus:border-violet-500/40 transition";

const labelCls = "text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5 block";

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  prefill?: { assetId?: string; scheduledFor?: string } | null;
  maintenance?: Maintenance | null;
  /**
   * Si true, oculta el selector de tipo (al agendar desde calendario o
   * desde el panel del cockpit: se sobreentiende que es Programado).
   * El tipo solo se elige al editar un mantenimiento existente o cuando
   * el usuario decide explícitamente abrir el modal "nuevo".
   */
  hideTypeSelector?: boolean;
  defaultType?: MaintenanceType;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function MaintenanceFormModal({
  open, onClose, prefill, maintenance, hideTypeSelector = false, defaultType,
}: Props) {
  const { session } = useAuth();
  const { can } = usePermissions();
  const canCreate = can("mantenimiento", "execution", "crear");
  const canEdit   = can("mantenimiento", "execution", "editar");
  const isFullAccess = session?.role === "owner_empresa" || session?.role === "admin_empresa" || session?.role === "supervisor";

  const createMut = useCreateMaintenance();
  const updateMut = useUpdateMaintenance();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  const { assets: assetsList = [] } = useAssets();
  const { workshops = [] } = useWorkshops();
  const { suppliers = [] } = useSuppliers();
  const { users: companyUsers = [] } = useCompanyUsers();

  // ─── Form state ──────────────────────────────────────────────────────────
  const isEditing = !!maintenance;
  const [type, setType]                       = useState<MaintenanceType>(defaultType ?? "Programado");
  const [status, setStatus]                   = useState<string>("Programado");
  const [assetId, setAssetId]                 = useState<string>("");
  const [workshopId, setWorkshopId]           = useState<string>("");
  const [category, setCategory]               = useState<string>("Otro");
  const [title, setTitle]                     = useState<string>("");
  const [description, setDescription]         = useState<string>("");
  const [odometerKm, setOdometerKm]           = useState<number | null>(null);
  const [laborCost, setLaborCost]             = useState<number>(0);
  const [cadenceKind, setCadenceKind]         = useState<CadenceKind>("none");
  const [cadenceValue, setCadenceValue]       = useState<number | null>(null);
  const [nextTriggerKm, setNextTriggerKm]     = useState<number | null>(null);
  const [scheduledFor, setScheduledFor]       = useState<string>("");
  const [notes, setNotes]                     = useState<string>("");
  const [items, setItems]                     = useState<ItemRow[]>([]);
  const [assignedUserId, setAssignedUserId]   = useState<string>("");
  // Adjuntos (facturas, fotos de evidencia) — sincronizados con
  // maintenance.attachments.
  const [attachments, setAttachments]         = useState<{ url: string; label: string; uploadedAt?: string }[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachmentFileRef                     = useRef<HTMLInputElement>(null);
  // Lavada
  const [carwashLocation, setCarwashLocation] = useState<string>("");
  const [carwashProvider, setCarwashProvider] = useState<string>("");
  const [carwashNotes, setCarwashNotes]       = useState<string>("");
  const [carwashTotal, setCarwashTotal]       = useState<number | null>(null);

  // ─── Inicializar form al abrir ─────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (maintenance) {
      // Editar
      setType(maintenance.type);
      setStatus(maintenance.status);
      setAssetId(maintenance.assetId ?? "");
      setWorkshopId(maintenance.workshopId ?? "");
      setCategory(maintenance.category);
      setTitle(maintenance.title ?? "");
      setDescription(maintenance.description ?? "");
      setOdometerKm(maintenance.odometerKm);
      setLaborCost(maintenance.laborCost ?? 0);
      setCadenceKind(maintenance.cadenceKind ?? "none");
      setCadenceValue(maintenance.cadenceValue);
      setNextTriggerKm(maintenance.nextTriggerKm);
      setScheduledFor(maintenance.scheduledFor?.slice(0, 16) ?? "");
      setNotes(maintenance.notes ?? "");
      setItems((maintenance.items ?? []).map((i) => ({ ...i, photoUrl: i.photoUrl ?? null, uploading: false })));
      setAssignedUserId(maintenance.assignedUserId ?? "");
      setCarwashLocation(maintenance.carwashLocation ?? "");
      setCarwashProvider(maintenance.carwashProvider ?? "");
      setCarwashNotes(maintenance.carwashNotes ?? "");
      setAttachments(maintenance.attachments ?? []);
      setCarwashTotal(null);
    } else {
      // Crear
      setType(defaultType ?? (prefill?.assetId ? "Programado" : "Programado"));
      setStatus("Programado");
      setAssetId(prefill?.assetId ?? "");
      setWorkshopId("");
      setCategory("Otro");
      setTitle("");
      setDescription("");
      setOdometerKm(null);
      setLaborCost(0);
      setCadenceKind("none");
      setCadenceValue(null);
      setNextTriggerKm(null);
      setScheduledFor(prefill?.scheduledFor ?? new Date().toISOString().slice(0, 16));
      setNotes("");
      setItems([]);
      setAssignedUserId("");
      setCarwashLocation("");
      setCarwashProvider("");
      setCarwashNotes("");
      setAttachments([]);
      setCarwashTotal(null);
    }
  }, [open, maintenance, prefill, defaultType]);

  // Cuando cambia el tipo, ajustar status por defecto (UI) y limpiar items si es Lavada
  useEffect(() => {
    if (isEditing) return;
    if (type === "Correctivo" || type === "Lavada") setStatus("En proceso");
    else setStatus("Programado");
    if (type === "Lavada" && items.length) setItems([]);
    // Auto-asignación del operador: si NO es full access y crea Correctivo/Lavada,
    // se auto-asigna (lo está haciendo él mismo).
    if (!isEditing && !isFullAccess && (type === "Correctivo" || type === "Lavada") && session?.sub) {
      const meId = session.sub.replace("company-user-", "");
      setAssignedUserId(meId);
    }
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLavada = type === "Lavada";

  // ─── Items ──────────────────────────────────────────────────────────────
  const addItem = () => {
    setItems((p) => [...p, { name: "", quantity: 1, unitCost: 0, photoUrl: null, uploading: false }]);
  };
  const updateItem = (idx: number, patch: Partial<ItemRow>) => {
    setItems((p) => p.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeItem = (idx: number) => {
    setItems((p) => p.filter((_, i) => i !== idx));
  };
  const handleItemPhoto = async (idx: number, file: File) => {
    updateItem(idx, { uploading: true });
    setUploadingIdx(idx);
    try {
      const url = await uploadPartPhoto(file, session?.companyId);
      updateItem(idx, { photoUrl: url });
      toast.success("Foto subida");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al subir la foto";
      toast.error("No se pudo subir la foto del repuesto", { description: message });
    } finally {
      updateItem(idx, { uploading: false });
      setUploadingIdx(null);
    }
  };

  // ─── Submit ─────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!title.trim()) { toast.error("Título requerido"); return; }
    if (!assetId) { toast.error("Vehículo requerido"); return; }
    if (!scheduledFor) { toast.error("Fecha programada requerida"); return; }
    if (!canCreate && !canEdit) { toast.error("No tenés permiso"); return; }

    const payload: MaintenanceInput = {
      assetId, type, status, category, title,
      description: description || null,
      odometerKm: odometerKm ?? null,
      laborCost: laborCost || 0,
      cadenceKind,
      cadenceValue: cadenceValue ?? null,
      nextTriggerKm: nextTriggerKm ?? null,
      scheduledFor: new Date(scheduledFor).toISOString(),
      notes: notes || null,
      // Lavada: no items / no workshop / no cadencia
      items: isLavada ? [] : (items.length ? items.map((i) => ({
        name: i.name, quantity: i.quantity, unitCost: i.unitCost,
        photoUrl: i.photoUrl, supplierId: i.supplierId ?? null,
      })) : undefined),
      carwashLocation: isLavada ? (carwashLocation.trim() || null) : null,
      carwashProvider: isLavada ? (carwashProvider.trim() || null) : null,
      carwashNotes:    isLavada ? (carwashNotes.trim() || null) : null,
      // Adjuntos: solo aplicables en Programado→En proceso o Completado.
      // En creación el array está vacío (no se pueden subir fotos antes de
      // que exista el ID). En edición se mandan los actuales.
      attachments: isEditing && !isLavada ? attachments : (isEditing ? attachments : []),
      assignedUserId: assignedUserId || null,
    };
    try {
      if (isEditing && maintenance) {
        await updateMut.mutateAsync({ id: maintenance.id, body: payload });
        toast.success("Mantenimiento actualizado");
      } else {
        await createMut.mutateAsync(payload);
        toast.success("Mantenimiento creado");
      }
      onClose();
    } catch (e) { toast.error((e as Error).message); }
  };

  if (!open) return null;
  const isReadOnly = isEditing ? !canEdit : !canCreate;
  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0b0f1a]">
        {/* Header */}
        <div className="relative shrink-0 border-b border-gray-100 dark:border-white/[0.06] bg-gradient-to-br from-violet-50 dark:from-violet-500/10 via-transparent to-transparent px-5 sm:px-7 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400">
                {isEditing ? "Edición" : "Nuevo"}
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-white mt-0.5">
                {isEditing ? "Editar mantenimiento" : (isLavada ? "Registrar lavada" : "Agendar mantenimiento")}
              </h2>
              <p className="text-xs text-gray-400 dark:text-gray-400 mt-1 max-w-md">
                {isLavada
                  ? "Servicio de lavado: lugar, costo y fotos. No genera orden de taller."
                  : isEditing ? "Modifica la información del mantenimiento seleccionado." : "Programa el mantenimiento de un vehículo."}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-5 max-h-[calc(90vh-220px)]">
          {isReadOnly && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              No tenés permiso para {isEditing ? "editar" : "crear"} mantenimientos.
            </div>
          )}

          {/* Tipo de mantenimiento */}
          <div>
            <label className={labelCls}>Tipo de mantenimiento</label>
            <div className={`grid gap-2 ${isLavada ? "grid-cols-3" : "grid-cols-3"}`}>
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => !isReadOnly && setType(t.value)}
                  disabled={isReadOnly}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition text-left ${
                    type === t.value ? t.active : t.idle
                  } ${isReadOnly ? "opacity-60 cursor-not-allowed" : ""}`}
                  title={t.description}
                >
                  <p className="font-semibold">{t.label}</p>
                  <p className="text-[10px] font-normal mt-0.5 opacity-80">{t.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* ── Vehículo + Fecha ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Vehículo *</label>
              <select
                className={inputCls}
                value={assetId}
                disabled={isEditing || isReadOnly}
                onChange={(e) => setAssetId(e.target.value)}
              >
                <option value="">Seleccionar…</option>
                {assetsList.map((a) => (
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
                disabled={isReadOnly}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            </div>
          </div>

          {/* ── Lavada: lugar + proveedor + notas + total ── */}
          {isLavada ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin size={11} /> Lugar / Establecimiento *
                    </span>
                  </label>
                  <input
                    placeholder="Ej: Lavadero El Sol, Lavandería 24h…"
                    value={carwashLocation}
                    disabled={isReadOnly}
                    onChange={(e) => setCarwashLocation(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    <span className="inline-flex items-center gap-1.5">
                      <Store size={11} /> Encargado (opcional)
                    </span>
                  </label>
                  <input
                    placeholder="Nombre de quien realizó el servicio"
                    value={carwashProvider}
                    disabled={isReadOnly}
                    onChange={(e) => setCarwashProvider(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Costo del servicio (opcional)</label>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={carwashTotal ?? ""}
                  disabled={isReadOnly}
                  onChange={(e) => setCarwashTotal(e.target.value === "" ? null : Number(e.target.value))}
                  className={inputCls}
                />
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                  Si no lo indicás acá, lo podés cargar después con los adicionales en el detalle.
                </p>
              </div>
              <div>
                <label className={labelCls}>Notas (opcional)</label>
                <textarea
                  rows={2}
                  placeholder="Detalle del servicio, observaciones, etc."
                  value={carwashNotes}
                  disabled={isReadOnly}
                  onChange={(e) => setCarwashNotes(e.target.value)}
                  className={`${inputCls} min-h-[60px] resize-none`}
                />
              </div>
            </>
          ) : (
            <>
              {/* ── Programado / Correctivo: taller + categoría ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 size={11} /> Taller (opcional)
                    </span>
                  </label>
                  <select
                    className={inputCls}
                    value={workshopId}
                    disabled={isReadOnly}
                    onChange={(e) => setWorkshopId(e.target.value)}
                  >
                    <option value="">— Sin taller —</option>
                    {workshops.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>
                    <span className="inline-flex items-center gap-1.5">
                      <Hash size={11} /> Categoría
                    </span>
                  </label>
                  <select
                    className={inputCls}
                    value={category}
                    disabled={isReadOnly}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="Primordial:Bombas">Primordial · Bombas e inyectores</option>
                    <option value="Primordial:Motores">Primordial · Motores</option>
                    <option value="Aceite:Cambio">Aceite · Cambio</option>
                    <option value="Aceite:Inventario">Aceite · Inventario</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* ── Título + Descripción ── */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className={labelCls}>Título *</label>
              <input
                placeholder={isLavada ? "Ej: Lavado completo + encerado" : "Ej: Cambio de aceite y filtros"}
                value={title}
                disabled={isReadOnly}
                onChange={(e) => setTitle(e.target.value)}
                className={inputCls}
              />
            </div>
            {!isLavada && (
              <div>
                <label className={labelCls}>Descripción</label>
                <textarea
                  rows={2}
                  placeholder="Detalle del trabajo, observaciones, etc."
                  value={description}
                  disabled={isReadOnly}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`${inputCls} min-h-[60px] resize-none`}
                />
              </div>
            )}
          </div>

          {/* ── Mano de obra + odómetro (solo Programado/Correctivo) ── */}
          {!isLavada && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  <span className="inline-flex items-center gap-1.5">
                    <DollarSign size={11} /> Mano de obra
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={laborCost}
                  disabled={isReadOnly}
                  onChange={(e) => setLaborCost(Number(e.target.value))}
                  className={inputCls}
                />
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                  Servicio del taller. Se muestra separado de los repuestos.
                </p>
              </div>
              <div>
                <label className={labelCls}>
                  <span className="inline-flex items-center gap-1.5">
                    <Hash size={11} /> Odómetro (km)
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder="Lectura actual del vehículo"
                  value={odometerKm ?? ""}
                  disabled={isReadOnly}
                  onChange={(e) => setOdometerKm(e.target.value === "" ? null : Number(e.target.value))}
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {/* ── Asignación (solo admin/owner/supervisor) ── */}
          {isFullAccess && !isLavada && (
            <div>
              <label className={labelCls}>Asignar a un operador (opcional)</label>
              <select
                className={inputCls}
                value={assignedUserId}
                disabled={isReadOnly}
                onChange={(e) => setAssignedUserId(e.target.value)}
              >
                <option value="">— Sin asignar (libre) —</option>
                {companyUsers
                  .filter((u) => u.role === "operador" && u.status === "active")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}{u.email ? ` — ${u.email}` : ""}
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                Los operadores solo pueden asignarse a sí mismos. Si no asignás, queda libre.
              </p>
            </div>
          )}

          {/* ── Repuestos / Insumos ──
              Solo se muestra cuando el mantenimiento ya está "En proceso",
              "Completado", o cuando ya hay items cargados. Al agendar un
              mantenimiento nuevo (status=Programado, sin items), la sección
              está oculta — se desbloquea cuando el operador lo inicia y
              empieza a cargar repuestos. */}
          {!isLavada && (status === "En proceso" || status === "Completado" || items.length > 0) && (
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package size={14} className="text-violet-600 dark:text-violet-400" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
                    Repuestos / Insumos
                  </span>
                </div>
                <button
                  type="button"
                  onClick={addItem}
                  disabled={isReadOnly}
                  className="inline-flex items-center gap-1 rounded-md border border-violet-200 dark:border-violet-500/40 px-2.5 py-1 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition"
                >
                  <Plus size={12} /> Agregar
                </button>
              </div>
              {items.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">
                  Sin repuestos. El operador puede agregar después.
                </p>
              )}
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className="rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-2.5">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2 text-xs">
                      <input
                        placeholder="Nombre del repuesto"
                        value={it.name}
                        disabled={isReadOnly}
                        onChange={(e) => updateItem(idx, { name: e.target.value })}
                        className={`${inputCls} md:col-span-5 py-1.5`}
                      />
                      <select
                        value={it.supplierId ?? ""}
                        disabled={isReadOnly}
                        onChange={(e) => updateItem(idx, { supplierId: e.target.value || null })}
                        className={`${inputCls} md:col-span-3 py-1.5`}
                      >
                        <option value="">Sin proveedor</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <input
                        type="number" min={0} placeholder="Cant."
                        value={it.quantity}
                        disabled={isReadOnly}
                        onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                        className={`${inputCls} md:col-span-1 py-1.5`}
                      />
                      <input
                        type="number" min={0} placeholder="$ unit."
                        value={it.unitCost}
                        disabled={isReadOnly}
                        onChange={(e) => updateItem(idx, { unitCost: Number(e.target.value) })}
                        className={`${inputCls} md:col-span-2 py-1.5`}
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        disabled={isReadOnly}
                        className="md:col-span-1 inline-flex items-center justify-center text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-md p-1.5 transition"
                        title="Quitar"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {it.photoUrl ? (
                        <div className="relative h-12 w-12 rounded-md overflow-hidden border border-gray-200 dark:border-white/[0.08]">
                          <img src={it.photoUrl} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => updateItem(idx, { photoUrl: null })}
                            className="absolute top-0 right-0 bg-black/60 text-white p-0.5"
                            title="Quitar foto"
                          >
                            <XCircle size={12} />
                          </button>
                        </div>
                      ) : (
                        <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border border-dashed border-gray-300 dark:border-white/[0.08] px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400 hover:border-violet-400 dark:hover:border-violet-500/50 transition">
                          <ImagePlus size={12} /> {it.uploading ? "Subiendo…" : "Foto"}
                          <input
                            ref={uploadingIdx === idx ? fileInputRef : undefined}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf"
                            disabled={isReadOnly || it.uploading}
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleItemPhoto(idx, f);
                            }}
                          />
                        </label>
                      )}
                      <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                        Subtotal: <strong className="text-gray-800 dark:text-white">${(it.quantity * it.unitCost).toLocaleString("es-CO")}</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Cadencia (solo Programado) ── */}
          {type === "Programado" && (
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Wrench size={14} className="text-violet-600 dark:text-violet-400" />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
                  Periodicidad (opcional)
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  className={inputCls}
                  value={cadenceKind}
                  disabled={isReadOnly}
                  onChange={(e) => setCadenceKind(e.target.value as CadenceKind)}
                >
                  {CADENCES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                {CADENCES.find((c) => c.value === cadenceKind)?.needsValue && (
                  <input
                    type="number"
                    min={1}
                    placeholder={CADENCES.find((c) => c.value === cadenceKind)?.isKm ? "Kilómetros" : "Días"}
                    value={cadenceValue ?? ""}
                    disabled={isReadOnly}
                    onChange={(e) => setCadenceValue(e.target.value === "" ? null : Number(e.target.value))}
                    className={inputCls}
                  />
                )}
              </div>
              {cadenceKind === "km_based" && (
                <div>
                  <label className={labelCls}>Próximo trigger (km) — opcional</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Ej: 150000"
                    value={nextTriggerKm ?? ""}
                    disabled={isReadOnly}
                    onChange={(e) => setNextTriggerKm(e.target.value === "" ? null : Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Facturas y evidencias ── */}
          {/* Se muestra cuando el mantenimiento ya está "En proceso" o
              "Completado", o si ya tiene adjuntos. Igual que la sección
              de repuestos: arranca oculta al agendar, aparece al iniciar. */}
          {!isLavada && (status === "En proceso" || status === "Completado" || attachments.length > 0) && (
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt size={14} className="text-sky-600 dark:text-sky-400" />
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-700 dark:text-gray-200">
                    Facturas y evidencias
                  </p>
                  {attachments.length > 0 && (
                    <span className="inline-flex items-center rounded-md bg-sky-100 dark:bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
                      {attachments.length}
                    </span>
                  )}
                </div>
                {!isReadOnly && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={uploadingAttachment}
                      onClick={() => attachmentFileRef.current?.click()}
                      className="inline-flex items-center gap-1 rounded-md border border-sky-200 dark:border-sky-500/40 px-2.5 py-1 text-xs font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition disabled:opacity-50"
                    >
                      {uploadingAttachment ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
                      {uploadingAttachment ? "Subiendo…" : "Subir archivo"}
                    </button>
                  </div>
                )}
              </div>

              {/* Lista de adjuntos */}
              {attachments.length > 0 && (
                <ul className="space-y-1.5">
                  {attachments.map((a, idx) => (
                    <li
                      key={a.url}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] p-2"
                    >
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 flex h-12 w-12 items-center justify-center overflow-hidden rounded-md bg-gray-100 dark:bg-white/[0.06] text-gray-500"
                        title={a.label}
                      >
                        {/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(a.url) ? (
                          <img src={a.url} alt={a.label} className="h-full w-full object-cover" />
                        ) : (
                          <FileText size={20} />
                        )}
                      </a>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-gray-800 dark:text-white">
                          {a.label}
                        </p>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-[10px] text-gray-400 dark:text-gray-500 hover:underline"
                        >
                          {a.url.split("/").pop()}
                        </a>
                      </div>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => setAttachments((p) => p.filter((_, i) => i !== idx))}
                          className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                          title="Quitar"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <input
                ref={attachmentFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingAttachment(true);
                  try {
                    const url = await uploadMaintenanceAttachment(file, Number(session?.companyId ?? 0));
                    // Auto-label: si el archivo es PDF → "Factura"; si es imagen → "Evidencia".
                    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
                    const label = isPdf
                      ? `Factura · ${file.name.replace(/\.pdf$/i, "").slice(0, 40)}`
                      : `Evidencia · ${file.name.replace(/\.[^.]+$/, "").slice(0, 40)}`;
                    setAttachments((p) => [
                      ...p,
                      { url, label, uploadedAt: new Date().toISOString() },
                    ]);
                    toast.success("Adjunto subido");
                  } catch (err) {
                    toast.error("No se pudo subir el adjunto", {
                      description: err instanceof Error ? err.message : "Error",
                    });
                  } finally {
                    setUploadingAttachment(false);
                    if (attachmentFileRef.current) attachmentFileRef.current.value = "";
                  }
                }}
              />
            </div>
          )}

          {/* ── Notas ── */}
          <div>
            <label className={labelCls}>Notas internas</label>
            <textarea
              rows={2}
              placeholder="Anotaciones que verá el equipo interno (no se imprime en PDF)."
              value={notes}
              disabled={isReadOnly}
              onChange={(e) => setNotes(e.target.value)}
              className={`${inputCls} min-h-[60px] resize-none`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex flex-col sm:flex-row sm:justify-end gap-2 border-t border-gray-100 dark:border-white/[0.06] bg-white dark:bg-[#0f1320] px-5 sm:px-7 py-3.5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm border border-gray-200 dark:border-white/[0.06] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition order-2 sm:order-1"
          >
            Cancelar
          </button>

          {isEditing ? (
            <button
              onClick={submit}
              disabled={saving || isReadOnly}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400 text-white flex items-center justify-center gap-1.5 disabled:opacity-50 order-1 sm:order-2"
            >
              <Save size={14} />
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={saving || isReadOnly}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400 text-white flex items-center justify-center gap-1.5 disabled:opacity-50 order-1 sm:order-2"
            >
              <Plus size={14} />
              {saving ? "Creando…" : (isLavada ? "Registrar lavada" : "Crear mantenimiento")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default MaintenanceFormModal;
