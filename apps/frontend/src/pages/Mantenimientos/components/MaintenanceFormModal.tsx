import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X, Plus, Trash2, Save, Calendar as CalIcon,
  Building2, Package, ImagePlus, XCircle,
  Wrench, Droplet, MapPin, Store, DollarSign, Hash,
  Receipt, FileText, Camera, Loader2, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCreateMaintenance,
  useUpdateMaintenance,
  useMaintenanceCategories,
  uploadMaintenanceAttachment,
  uploadPartPhoto,
  type Maintenance,
  type MaintenanceInput,
  type MaintenanceItemInput,
  type MaintenanceAttachment,
  type MaintenanceType,
  type CadenceKind,
} from "../../../hooks/useMaintenancesV2";
import { CategoryQuickManager } from "./CategoryQuickManager";
import { useWorkshops } from "../../../hooks/useWorkshops";
import { useSuppliers } from "../../../hooks/useSuppliers";
import { useMaintenanceFormOptions } from "../../../hooks/useFormOptions";
import { usePermissions } from "../../../hooks/usePermissions";
import { useAuth } from "../../../context/AuthContext";
import { computeItemTotals, aggregateTotals } from "../../../lib/maintenance-totals";

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

// jul 2026 — categorias disponibles para un adjunto de mantenimiento.
// Debe coincidir con el `attachmentSchema` del backend en
// routes/company/maintenances.ts: repuesto / mano_obra / lavada /
// servicio / otro. combustible y peaje NO aparecen aca porque son
// modulos de origen independientes (tienen su propio flujo de facturas).
const ATTACHMENT_KINDS: { value: NonNullable<MaintenanceAttachment["kind"]>; label: string }[] = [
  { value: "repuesto",  label: "Repuesto" },
  { value: "mano_obra", label: "Mano de obra" },
  { value: "lavada",    label: "Lavada" },
  { value: "servicio",  label: "Servicio" },
  { value: "otro",      label: "Otro" },
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

// jul 2026 v4-f — Input "de celda" para la tabla de repuestos estilo
// factura: SIN borde ni fondo propios (se apoya en el borde de la celda
// que ya dibuja la tabla), transparente, sin flechitas nativas del
// spinner numérico. Solo aparece un anillo sutil al enfocar. Así la
// tabla se lee como una factura real, no como un formulario con cajas
// superpuestas.
const cellInputCls =
  "w-full min-w-0 bg-transparent border-0 px-0 py-0.5 text-xs text-gray-800 dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-violet-400/50 focus:rounded-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

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

  const { data: formOptions } = useMaintenanceFormOptions();
  const assetsList = formOptions?.assets ?? [];
  const companyUsers = formOptions?.users ?? [];
  const { workshops = [] } = useWorkshops();
  const { suppliers = [] } = useSuppliers();
  // jul 2026 v5 — Categorías custom que la empresa creó. Se muestran en
  // el dropdown debajo de las built-in. También nos sirven para resolver
  // el `categoryCustomId` cuando estamos editando un mantenimiento cuya
  // categoría es custom.
  const { data: customCats = [] } = useMaintenanceCategories();

  // ─── Form state ──────────────────────────────────────────────────────────
  const isEditing = !!maintenance;
  const [type, setType]                       = useState<MaintenanceType>(defaultType ?? "Programado");
  const [status, setStatus]                   = useState<string>("Programado");
  const [assetId, setAssetId]                 = useState<string>("");
  const [workshopId, setWorkshopId]           = useState<string>("");
  // jul 2026 v5 — `category` es la key que se guarda en BD
  // (built-in: "Primordial:Bombas"; custom: la `key` que eligió la
  // empresa al crear la categoría, o "Otro" por default). `categoryCustomId`
  // se manda solo si la categoría elegida es custom — el backend lo usa
  // para hidratar la FK `category_id`. Si la categoría es built-in,
  // `categoryCustomId` queda en null.
  const [category, setCategory]               = useState<string>("Otro");
  const [categoryCustomId, setCategoryCustomId] = useState<string | null>(null);
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
  // jul 2026 v4-d — % de IVA único aplicado a TODOS los items del
  // mantenimiento. Antes se preguntaba por fila, lo cual era redundante
  // cuando (como es casi siempre) el % es el mismo para todo. Al
  // cambiarlo, se propaga a cada item vía applyGlobalIva().
  const [globalIvaPercent, setGlobalIvaPercent] = useState<number>(15);
  // Adjuntos (facturas, fotos de evidencia) — sincronizados con
  // maintenance.attachments. Cada item puede traer metadata rica
  // (kind / amount / invoiceNumber) que el backend usa para crear
  // / actualizar filas en el ledger `company_invoices` (jul 2026).
  const [attachments, setAttachments]         = useState<MaintenanceAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachmentFileRef                     = useRef<HTMLInputElement>(null);
  // jul 2026 v5 — Modal chico para gestionar categorías custom (botón
  // "+" al lado del dropdown de Categoría). Cuando se crea una nueva
  // desde adentro, el `onCreated` la auto-selecciona acá.
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  // Archivo elegido pero todavía sin clasificar (factura / evidencia).
  // Se sube recién cuando la persona elige el tipo en el mini-panel de
  // abajo — así el label queda correcto sin tener que adivinarlo por
  // la extensión del archivo (una factura puede ser perfectamente un .jpg).
  const [pendingAttachmentFile, setPendingAttachmentFile] = useState<File | null>(null);
  // jul 2026 — índice del attachment cuyo mini-panel de edicion esta
  // expandido (kind/amount/invoiceNumber). null = todos cerrados.
  const [editingAttachmentUrl, setEditingAttachmentUrl] = useState<string | null>(null);
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
      // jul 2026 v5 — el backend ahora devuelve `categoryId` (FK) en el
      // response. Si viene, esa fila es custom. Si no, la categoría es
      // built-in o un string libre.
      setCategory(maintenance.category);
      setCategoryCustomId(maintenance.categoryId ?? null);
      setTitle(maintenance.title ?? "");
      setDescription(maintenance.description ?? "");
      setOdometerKm(maintenance.odometerKm);
      setLaborCost(maintenance.laborCost ?? 0);
      setCadenceKind(maintenance.cadenceKind ?? "none");
      setCadenceValue(maintenance.cadenceValue);
      setNextTriggerKm(maintenance.nextTriggerKm);
      setScheduledFor(maintenance.scheduledFor?.slice(0, 16) ?? "");
      setNotes(maintenance.notes ?? "");
      setItems((maintenance.items ?? []).map((i) => ({
        ...i,
        discountType: (i as any).discountType ?? "amount",
        photoUrl: i.photoUrl ?? null,
        uploading: false,
      })));
      // jul 2026 v4-d — hidratar el % de IVA global desde el primer item
      // existente (todos deberían compartir el mismo valor en la práctica).
      const firstIva = maintenance.items?.[0]?.ivaPercent;
      setGlobalIvaPercent(firstIva != null ? Number(firstIva) : 15);
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
      setCategoryCustomId(null);
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
      setGlobalIvaPercent(15);
      setAssignedUserId("");
      setCarwashLocation("");
      setCarwashProvider("");
      setCarwashNotes("");
      setAttachments([]);
      setCarwashTotal(null);
    }
    setPendingAttachmentFile(null);
  }, [open, maintenance, prefill, defaultType]);

  // Cuando cambia el tipo, ajustar status por defecto (UI) y limpiar items si es Lavada
  useEffect(() => {
    if (isEditing) return;
    if (type === "Correctivo" || type === "Lavada") setStatus("En proceso");
    else setStatus("Programado");
    if (type === "Lavada" && items.length) setItems([]);
    // jul 2026 v5 — al cambiar a Lavada, fijamos la categoría "Lavada"
    // (built-in, no custom) y limpiamos el id. Al volver a Programado/
    // Correctivo, si la categoría era Lavada, la reseteamos a "Otro".
    if (type === "Lavada") {
      setCategory("Lavada");
      setCategoryCustomId(null);
    } else if (category === "Lavada") {
      setCategory("Otro");
      setCategoryCustomId(null);
    }
    // Auto-asignación del operador: si NO es full access y crea Correctivo/Lavada,
    // se auto-asigna (lo está haciendo él mismo).
    if (!isEditing && !isFullAccess && (type === "Correctivo" || type === "Lavada") && session?.id) {
      setAssignedUserId(session.id);
    }
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autocompletar "Encargado" en Lavada con el conductor asignado al
  // vehículo seleccionado. Se recalcula cada vez que cambia el vehículo
  // (el conductor del asset manda); el usuario puede igual editarlo a
  // mano para ese envío puntual. No aplica al editar un mantenimiento
  // ya existente (ahí se respeta lo que ya estaba guardado al abrir).
  useEffect(() => {
    if (isEditing) return;
    if (type !== "Lavada") return;
    if (!assetId) return;
    const asset = assetsList.find((a) => a.id === assetId);
    const driverName = asset?.currentDriver?.name?.trim();
    setCarwashProvider(driverName || "");
  }, [assetId, type, assetsList, isEditing]);

  const isLavada = type === "Lavada";

  // ─── Items ──────────────────────────────────────────────────────────────
  const addItem = () => {
    // jul 2026 v4-b — Migración 0050. Defaults: 15% IVA Ecuador,
    // 0% descuento. quantity=1, unitCost=0. photoUrl null hasta que
    // se suba.
    // jul 2026 v4-d — el % de IVA nuevo toma el valor global vigente
    // (no un 15 fijo) y discountType arranca en 'amount' (importe $).
    setItems((p) => [
      ...p,
      {
        name: "",
        quantity: 1,
        unitCost: 0,
        discountType: "amount",
        discountValue: 0,  // jul 2026 v4-c — IMPORTE o % segun discountType.
        ivaPercent: globalIvaPercent,
        photoUrl: null,
        uploading: false,
      },
    ]);
  };
  const updateItem = (idx: number, patch: Partial<ItemRow>) => {
    setItems((p) => p.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const removeItem = (idx: number) => {
    setItems((p) => p.filter((_, i) => i !== idx));
  };

  // jul 2026 v4-d — Cambia el % de IVA global y lo propaga a todos los
  // items existentes de una sola vez. Ya no se pregunta por fila.
  const applyGlobalIva = (value: number) => {
    setGlobalIvaPercent(value);
    setItems((prev) => prev.map((it) => ({ ...it, ivaPercent: value })));
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

  // ─── Adjuntos (facturas / evidencias) ────────────────────────────────────
  // Sube el archivo ya elegido (pendingAttachmentFile) con el tipo que la
  // persona acaba de seleccionar en el mini-panel.
  //
  // jul 2026 — al elegir "Factura" el attachment se crea con kind='otro'
  // por default y campos amount/invoiceNumber vacios. El usuario puede
  // (y debe) refinarlos en el mini-panel inline que aparece debajo de
  // cada attachment subido. Esos campos viajan al backend, que crea /
  // actualiza la fila correspondiente en el ledger `company_invoices`.
  const uploadPendingAttachment = async (kind: "invoice" | "evidence") => {
    const file = pendingAttachmentFile;
    if (!file) return;
    setUploadingAttachment(true);
    try {
      const url = await uploadMaintenanceAttachment(file, Number(session?.companyId ?? 0));
      const baseName = file.name.replace(/\.[^.]+$/, "").slice(0, 40);
      const label = kind === "invoice" ? `Factura · ${baseName}` : `Evidencia · ${baseName}`;
      // Para "invoice" dejamos campos editables vacios; el usuario los
      // completa en el editor inline. Para "evidence" los campos quedan
      // en null para que el backend NO cree fila en el ledger.
      const newAttachment: MaintenanceAttachment = kind === "invoice"
        ? { url, label, uploadedAt: new Date().toISOString(), kind: "otro", amount: null, invoiceNumber: null }
        : { url, label, uploadedAt: new Date().toISOString(), kind: "otro", amount: null, invoiceNumber: null };
      setAttachments((p) => [...p, newAttachment]);
      toast.success(kind === "invoice" ? "Factura subida" : "Evidencia subida");
    } catch (err) {
      toast.error("No se pudo subir el adjunto", {
        description: err instanceof Error ? err.message : "Error",
      });
    } finally {
      setUploadingAttachment(false);
      setPendingAttachmentFile(null);
      if (attachmentFileRef.current) attachmentFileRef.current.value = "";
    }
  };

  /** Actualiza los campos editables (kind/amount/invoiceNumber) de un
   *  attachment ya subido. Se llama desde los inputs inline. */
  const updateAttachmentMeta = (
    url: string,
    patch: Partial<Pick<MaintenanceAttachment, "kind" | "amount" | "invoiceNumber" | "label">>,
  ) => {
    setAttachments((p) =>
      p.map((a) => (a.url === url ? { ...a, ...patch } : a)),
    );
  };

  // ─── Submit ─────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!title.trim()) { toast.error("Título requerido"); return; }
    if (!assetId) { toast.error("Vehículo requerido"); return; }
    if (!scheduledFor) { toast.error("Fecha programada requerida"); return; }
    if (!canCreate && !canEdit) { toast.error("No tenés permiso"); return; }

    const payload: MaintenanceInput = {
      assetId, type, status, category, title,
      // jul 2026 v5 — manda `categoryCustomId` solo si la categoría elegida
      // es custom. El backend lo usa para hidratar la FK `category_id` y
      // resolver el `key`. Si la categoría es built-in, no mandamos el id
      // y el backend deja `category_id` en null.
      ...(categoryCustomId ? { categoryCustomId } : {}),
      workshopId: isLavada ? null : (workshopId || null),
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
        // jul 2026 v4-d — descuento por importe ($) o porcentaje (%),
        // según discountType. El backend resuelve el importe efectivo.
        discountType:  i.discountType ?? "amount",
        discountValue: i.discountValue ?? 0,
        ivaPercent:    i.ivaPercent ?? 15,
        photoUrl: i.photoUrl, supplierId: i.supplierId ?? null,
      })) : undefined),
      carwashLocation: isLavada ? (carwashLocation.trim() || null) : null,
      carwashProvider: isLavada ? (carwashProvider.trim() || null) : null,
      carwashNotes:    isLavada ? (carwashNotes.trim() || null) : null,
      // Costo explícito que digitó el admin en el modal de lavada.
      carwashTotal:    isLavada ? (carwashTotal ?? 0)             : 0,
      // Adjuntos: se permiten para cualquier tipo de mantenimiento
      // (jul 2026 v8.6 — también en lavadas, donde no hay items de
      // repuesto pero sí se quieren subir fotos de evidencia al
      // pasar a "En proceso" o "Completado").
      // En creación el array está vacío. En edición se mandan los actuales.
      attachments: isEditing ? attachments : [],
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
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0b0f1a]">
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
                    {/* jul 2026 v5 — Botón "+" al lado del label para abrir
                        el modal de gestión rápida de categorías. Mismo
                        permiso que "crear" (records.crear) — sin permiso,
                        el botón no aparece. */}
                    {canCreate && !isReadOnly && (
                      <button
                        type="button"
                        onClick={() => setCategoryManagerOpen(true)}
                        className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-300 hover:text-violet-700 dark:hover:text-violet-200 transition"
                        title="Crear o editar categorías"
                      >
                        <Plus size={10} /> Gestionar
                      </button>
                    )}
                  </label>
                  <select
                    className={inputCls}
                    // jul 2026 v5 — el value del select es la `key` (built-in
                    // o custom), no la `categoryCustomId`. El id lo trackeamos
                    // aparte en `categoryCustomId` para mandar al backend.
                    value={category}
                    disabled={isReadOnly}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCategory(v);
                      // Si el value coincide con la `key` de una categoría
                      // custom, seteamos su id. Si no, es built-in → null.
                      const match = customCats.find((c) => c.key === v);
                      setCategoryCustomId(match ? match.id : null);
                    }}
                  >
                    {/* Built-in (no editables — vienen del sistema) */}
                    <optgroup label="Del sistema">
                      <option value="Primordial:Bombas">Primordial · Bombas e inyectores</option>
                      <option value="Primordial:Motores">Primordial · Motores</option>
                      <option value="Aceite:Cambio">Aceite · Cambio</option>
                      <option value="Aceite:Inventario">Aceite · Inventario</option>
                      <option value="Otro">Otro</option>
                    </optgroup>
                    {/* Custom: las que la empresa creó en el modal de gestión */}
                    {customCats.length > 0 && (
                      <optgroup label="De la empresa">
                        {customCats.map((c) => (
                          <option key={c.id} value={c.key}>{c.label}</option>
                        ))}
                      </optgroup>
                    )}
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
                  .filter((u) => u.role === "operador")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName || u.username}
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                Los operadores solo pueden asignarse a sí mismos. Si no asignás, queda libre.
              </p>
            </div>
          )}

          {!isLavada && (status === "En proceso" || status === "Completado" || items.length > 0) && (
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Package size={14} className="text-violet-600 dark:text-violet-400" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
                    Repuestos / Insumos
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      % IVA
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={globalIvaPercent}
                      disabled={isReadOnly}
                      onChange={(e) => applyGlobalIva(e.target.value === "" ? 0 : Number(e.target.value))}
                      className="w-16 rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0f1320] px-2 py-1 text-xs text-right tabular-nums text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-400/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
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
              </div>

              {items.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">
                  Sin repuestos. El operador puede agregar después.
                </p>
              )}

              {/* jul 2026 v4-d — Tabla estilo factura: encabezado fijo,
                  filas con bordes finos, alineación numérica a la derecha
                  (como los PDFs de taller). El % IVA ya no aparece por
                  columna — ver control global arriba. La columna "Desc."
                  incluye el toggle $/%. */}
              {items.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-gray-300 dark:border-white/[0.1]">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-white/[0.05] text-[10px] font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                        <th className="px-2.5 py-2 text-left border border-gray-300 dark:border-white/[0.1]">Repuesto</th>
                        <th className="px-2.5 py-2 text-left border border-gray-300 dark:border-white/[0.1] hidden md:table-cell">Proveedor</th>
                        <th className="px-2.5 py-2 text-right border border-gray-300 dark:border-white/[0.1]">Cant.</th>
                        <th className="px-2.5 py-2 text-right border border-gray-300 dark:border-white/[0.1]">Precio unit.</th>
                        <th className="px-2.5 py-2 text-right border border-gray-300 dark:border-white/[0.1]">Desc.</th>
                        <th className="px-2.5 py-2 text-right border border-gray-300 dark:border-white/[0.1]">Subtotal</th>
                        <th className="px-2.5 py-2 text-right border border-gray-300 dark:border-white/[0.1]">IVA</th>
                        <th className="px-2.5 py-2 text-right border border-gray-300 dark:border-white/[0.1]">Total</th>
                        <th className="px-2 py-2 border border-gray-300 dark:border-white/[0.1] w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => {
                        const t = computeItemTotals(it);
                        const discountType = it.discountType ?? "amount";
                        return (
                          <tr
                            key={idx}
                            className={`align-middle ${idx % 2 === 1 ? "bg-gray-50/60 dark:bg-white/[0.015]" : "bg-white dark:bg-transparent"}`}
                          >
                            {/* Repuesto + foto */}
                            <td className="px-2.5 py-1.5 border border-gray-200 dark:border-white/[0.07] min-w-[160px]">
                              <input
                                placeholder="Nombre del repuesto"
                                value={it.name}
                                disabled={isReadOnly}
                                onChange={(e) => updateItem(idx, { name: e.target.value })}
                                className={cellInputCls}
                              />
                              <div className="mt-1">
                                {it.photoUrl ? (
                                  <div className="relative inline-block h-8 w-8 rounded overflow-hidden border border-gray-200 dark:border-white/[0.08]">
                                    <img src={it.photoUrl} alt="" className="h-full w-full object-cover" />
                                    <button
                                      type="button"
                                      onClick={() => updateItem(idx, { photoUrl: null })}
                                      className="absolute top-0 right-0 bg-black/60 text-white p-0.5"
                                      title="Quitar foto"
                                    >
                                      <XCircle size={9} />
                                    </button>
                                  </div>
                                ) : (
                                  <label className="inline-flex items-center gap-1 cursor-pointer rounded border border-dashed border-gray-300 dark:border-white/[0.08] px-1.5 py-0.5 text-[9px] text-gray-400 dark:text-gray-500 hover:border-violet-400 dark:hover:border-violet-500/50 transition">
                                    <ImagePlus size={9} /> {it.uploading ? "Subiendo…" : "Foto"}
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
                              </div>
                            </td>

                            {/* Proveedor */}
                            <td className="px-2.5 py-1.5 border border-gray-200 dark:border-white/[0.07] hidden md:table-cell min-w-[130px]">
                              <select
                                value={it.supplierId ?? ""}
                                disabled={isReadOnly}
                                onChange={(e) => updateItem(idx, { supplierId: e.target.value || null })}
                                className={cellInputCls}
                              >
                                <option value="">Sin proveedor</option>
                                {suppliers.map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                            </td>

                            {/* Cantidad */}
                            <td className="px-2 py-1.5 border border-gray-200 dark:border-white/[0.07] w-14">
                              <input
                                type="number" min={0} step="0.01" placeholder="1"
                                value={it.quantity}
                                disabled={isReadOnly}
                                onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                                className={`${cellInputCls} text-right tabular-nums`}
                                title="Cantidad"
                              />
                            </td>

                            {/* Precio unitario */}
                            <td className="px-2 py-1.5 border border-gray-200 dark:border-white/[0.07] w-20">
                              <input
                                type="number" min={0} step="0.01" placeholder="0.00"
                                value={it.unitCost === 0 ? "" : it.unitCost}
                                disabled={isReadOnly}
                                onChange={(e) => updateItem(idx, { unitCost: e.target.value === "" ? 0 : Number(e.target.value) })}
                                className={`${cellInputCls} text-right tabular-nums`}
                                title="Precio unitario"
                              />
                            </td>

                            {/* jul 2026 v4-f — Descuento: input sin borde
                                (igual que el resto de la fila) + toggle
                                $/% chico como un par de letras discretas
                                al lado, no como botones grandes. */}
                            <td className="px-2 py-1.5 border border-gray-200 dark:border-white/[0.07] w-24">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={discountType === "percent" ? 100 : undefined}
                                  step="0.01"
                                  placeholder="0"
                                  value={it.discountValue ?? 0}
                                  disabled={isReadOnly}
                                  onChange={(e) => updateItem(idx, { discountValue: e.target.value === "" ? 0 : Number(e.target.value) })}
                                  className={`${cellInputCls} text-right tabular-nums flex-1 min-w-0`}
                                  title={discountType === "percent" ? "% de descuento" : "Descuento en $"}
                                />
                                <div className="flex shrink-0 rounded border border-gray-200 dark:border-white/[0.1] overflow-hidden text-[9px] font-bold leading-none">
                                  <button
                                    type="button"
                                    disabled={isReadOnly}
                                    onClick={() => updateItem(idx, { discountType: "amount" })}
                                    className={`px-1 py-1 transition ${
                                      discountType === "amount"
                                        ? "bg-violet-600 text-white"
                                        : "bg-transparent text-gray-300 dark:text-gray-600 hover:text-gray-500"
                                    }`}
                                    title="Descuento en importe ($)"
                                  >
                                    $
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isReadOnly}
                                    onClick={() => updateItem(idx, { discountType: "percent" })}
                                    className={`px-1 py-1 border-l border-gray-200 dark:border-white/[0.1] transition ${
                                      discountType === "percent"
                                        ? "bg-violet-600 text-white"
                                        : "bg-transparent text-gray-300 dark:text-gray-600 hover:text-gray-500"
                                    }`}
                                    title="Descuento en porcentaje (%)"
                                  >
                                    %
                                  </button>
                                </div>
                              </div>
                            </td>

                            {/* Subtotal / IVA / Total calculados */}
                            <td className="px-2.5 py-1.5 border border-gray-200 dark:border-white/[0.07] text-right tabular-nums text-gray-700 dark:text-gray-200">
                              ${t.subtotal.toFixed(2)}
                            </td>
                            <td className="px-2.5 py-1.5 border border-gray-200 dark:border-white/[0.07] text-right tabular-nums text-gray-500 dark:text-gray-400">
                              ${t.ivaAmount.toFixed(2)}
                            </td>
                            <td className="px-2.5 py-1.5 border border-gray-200 dark:border-white/[0.07] text-right tabular-nums font-semibold text-gray-900 dark:text-white">
                              ${t.total.toFixed(2)}
                            </td>

                            {/* Acción */}
                            <td className="px-1 py-1.5 border border-gray-200 dark:border-white/[0.07] text-center">
                              <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                disabled={isReadOnly}
                                className="inline-flex items-center justify-center text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded p-1 transition"
                                title="Quitar"
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer con totales agregados (jul 2026 v4-d) — estilo
                  factura: subtotal, descuento, IVA al % global (ya no hace
                  falta desglose por bucket porque todos comparten el
                    mismo %), total. */}
              {items.length > 0 && (() => {
                const agg = aggregateTotals(items);
                return (
                  <div className="rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden mt-2">
                    <div className="ml-auto w-full sm:w-72 divide-y divide-gray-100 dark:divide-white/[0.06]">
                      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300">
                        <span>Subtotal</span>
                        <span className="font-mono">${agg.grandSubtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300">
                        <span>Descuento</span>
                        <span className="font-mono">- ${agg.totalDiscount.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300">
                        <span>IVA ({globalIvaPercent}%)</span>
                        <span className="font-mono">${agg.grandIva.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 text-sm font-bold text-gray-900 dark:text-white bg-gray-50 dark:bg-white/[0.03]">
                        <span>Total</span>
                        <span className="font-mono">${agg.grandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
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
              de repuestos: arranca oculta al agendar, aparece al iniciar.
              Al elegir un archivo, se pregunta explícitamente si es
              Factura o Evidencia antes de subirlo (mini-panel abajo). */}
          {(status === "En proceso" || status === "Completado" || attachments.length > 0) && (
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
                {!isReadOnly && !pendingAttachmentFile && (
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

              {/* ── Mini-panel de clasificación: aparece tras elegir el
                  archivo, antes de que se suba. Evita adivinar si es
                  factura o evidencia por el tipo de archivo. ── */}
              {pendingAttachmentFile && (
                <div className="rounded-lg border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 p-3">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-2">
                    <span className="truncate">{pendingAttachmentFile.name}</span> — ¿qué tipo de archivo es?
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={uploadingAttachment}
                      onClick={() => uploadPendingAttachment("invoice")}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-orange-600 hover:bg-orange-700 px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
                    >
                      <Receipt size={12} /> Factura
                    </button>
                    <button
                      type="button"
                      disabled={uploadingAttachment}
                      onClick={() => uploadPendingAttachment("evidence")}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-sky-600 hover:bg-sky-700 px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
                    >
                      <Camera size={12} /> Evidencia
                    </button>
                    <button
                      type="button"
                      disabled={uploadingAttachment}
                      onClick={() => {
                        setPendingAttachmentFile(null);
                        if (attachmentFileRef.current) attachmentFileRef.current.value = "";
                      }}
                      className="inline-flex items-center justify-center rounded-md border border-gray-200 dark:border-white/[0.08] px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                      title="Cancelar"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {uploadingAttachment && (
                    <p className="mt-2 text-[11px] text-sky-700 dark:text-sky-300 inline-flex items-center gap-1">
                      <Loader2 size={10} className="animate-spin" /> Subiendo…
                    </p>
                  )}
                </div>
              )}

              {/* Lista de adjuntos */}
              {attachments.length > 0 && (
                <ul className="space-y-1.5">
                  {attachments.map((a) => {
                    const isExpanded = editingAttachmentUrl === a.url;
                    const hasInvoiceData = !!(a.invoiceNumber && a.invoiceNumber.trim());
                    return (
                      <li
                        key={a.url}
                        className="rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04]"
                      >
                        <div className="flex items-center gap-3 p-2">
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
                            <div className="flex items-center gap-2 mt-0.5">
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate text-[10px] text-gray-400 dark:text-gray-500 hover:underline max-w-[180px]"
                              >
                                {a.url.split("/").pop()}
                              </a>
                              {hasInvoiceData && (
                                <span className="inline-flex items-center rounded-md bg-emerald-100 dark:bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                  {a.invoiceNumber}
                                </span>
                              )}
                            </div>
                          </div>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => setEditingAttachmentUrl(isExpanded ? null : a.url)}
                              className={`shrink-0 inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition ${
                                isExpanded
                                  ? "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300"
                                  : "text-sky-600 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10"
                              }`}
                              title="Editar metadata de factura"
                            >
                              <Pencil size={11} /> Factura
                            </button>
                          )}
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => setAttachments((p) => p.filter((x) => x.url !== a.url))}
                              className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                              title="Quitar"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>

                        {/* Mini-panel de edicion inline (kind / amount / invoiceNumber) */}
                        {isExpanded && (
                          <div className="border-t border-gray-200 dark:border-white/[0.06] bg-sky-50/60 dark:bg-sky-500/[0.04] p-3 space-y-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                              Metadata de factura
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                              <div className="sm:col-span-4">
                                <label className={labelCls}>Tipo</label>
                                <select
                                  value={a.kind ?? "otro"}
                                  disabled={isReadOnly}
                                  onChange={(e) => updateAttachmentMeta(a.url, { kind: e.target.value as NonNullable<MaintenanceAttachment["kind"]> })}
                                  className={`${inputCls} py-1.5 text-xs`}
                                >
                                  {ATTACHMENT_KINDS.map((k) => (
                                    <option key={k.value} value={k.value}>{k.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="sm:col-span-3">
                                <label className={labelCls}>Monto (USD)</label>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={a.amount ?? ""}
                                  disabled={isReadOnly}
                                  placeholder="0"
                                  onChange={(e) => updateAttachmentMeta(a.url, {
                                    amount: e.target.value === "" ? null : Number(e.target.value),
                                  })}
                                  className={`${inputCls} py-1.5 text-xs`}
                                />
                              </div>
                              <div className="sm:col-span-5">
                                <label className={labelCls}>Numero de factura</label>
                                <input
                                  type="text"
                                  maxLength={60}
                                  value={a.invoiceNumber ?? ""}
                                  disabled={isReadOnly}
                                  placeholder="Vacio = sin factura"
                                  onChange={(e) => updateAttachmentMeta(a.url, { invoiceNumber: e.target.value })}
                                  className={`${inputCls} py-1.5 text-xs`}
                                />
                              </div>
                            </div>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">
                              Si completas el numero de factura, el backend creara o actualizara una fila
                              en el ledger <code className="text-[10px]">company_invoices</code> para
                              este mantenimiento.
                            </p>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* El input ya NO sube directo: solo guarda el file
                  pendiente y dispara el mini-panel de clasificación. */}
              <input
                ref={attachmentFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setPendingAttachmentFile(file);
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

      {/* jul 2026 v5 — Modal de gestión rápida de categorías. Se abre
          con el botón "+" del dropdown de Categoría. Al crear una
          categoría nueva, la auto-seleccionamos en el select. */}
      <CategoryQuickManager
        open={categoryManagerOpen}
        onClose={() => setCategoryManagerOpen(false)}
        onCreated={(cat) => {
          setCategory(cat.key);
          setCategoryCustomId(cat.id);
        }}
      />
    </div>
  );
}

export default MaintenanceFormModal;