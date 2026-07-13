// pages/Mantenimientos/components/MaintenanceDetailDrawer.tsx
//
// Drawer lateral con toda la info del mantenimiento.
// v3.1: rediseño con mejor jerarquía, header con tipo, secciones
// claramente separadas, mano de obra, lavada (cuando aplica), y
// línea de tiempo con colores por acción y por usuario.
// v3.2: agregado soporte de foto al agregar repuesto desde el drawer.
// v3.3: estado "Correccion" — solo owner/admin/supervisor pueden marcar
// un mantenimiento Completado para corrección (con o sin reagendar).
// v3.4: mano de obra editable en línea (En proceso) + sección de
// facturas y evidencias (adjuntos), igual que en MaintenanceFormModal.
// Ambos campos quedan reflejados automáticamente en el PDF de detalle.
// v3.5: se separa "Tomar"  de "Iniciar". Tomar solo asigna (sigue
// Programado/Corrección); Iniciar pasa a En proceso. Se agrega la
// sección "Taller"  (faltaba mostrarse en el drawer).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Truck, Calendar, Hash, Download, RefreshCw, CheckCircle2, Play,
  User as UserIcon, Clock, AlertCircle, Package, Wrench, MapPin,
  Store, Plus, Image as ImageIcon, Camera, DollarSign, FileText,
  CalendarDays, TruckIcon, ClipboardList, History, Receipt, Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useMaintenance,
  useAddMaintenanceNote,
  useAddMaintenanceItems,
  useDeleteMaintenanceItem,
  useAssignMaintenance,
  useUpdateMaintenance,
  useCarwashExtras,
  useAddCarwashExtras,
  useCarwashPhotos,
  useAddCarwashPhotos,
  uploadMaintenanceAttachment,
  uploadPartPhoto,
  type Maintenance,
  type MaintenanceItemInput,
  type CarwashExtraInput,
  type CarwashPhotoInput,
  type MaintenanceAttachment,
} from "../../../hooks/useMaintenancesV2";
import { useMaintenanceFormOptions } from "../../../hooks/useFormOptions";
import { useSuppliers } from "../../../hooks/useSuppliers";
import { useAuth } from "../../../context/AuthContext";
import { EditDatesInline } from "../../../components/features/maintenances/EditDatesInline";
import { fmtDateTimeEc, fmtDateShortEc } from "@/lib/datetime";
import {
  AttachmentFacturaModal,
  type AttachmentFacturaResult,
} from "./AttachmentFacturaModal";
import { FinancePanel } from "./FinancePanel";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  return fmtDateShortEc(iso);
}
function fmtDateTime(iso: string | null) {
  return fmtDateTimeEc(iso);
}
function fmtMoney(n: number | string | null | undefined) {
  const v = typeof n === "string" ? Number(n) : (n || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
}

// Color determinístico por usuario (basado en hash del id).
function colorForUser(id: number | string | null | undefined): { ring: string; bg: string; text: string; dot: string } {
  if (id == null) return { ring: "ring-gray-300", bg: "bg-gray-100 dark:bg-white/[0.05]", text: "text-gray-600 dark:text-gray-300", dot: "bg-gray-400" };
  const n = typeof id === "string" ? Number(id.replace(/\D/g, "")) || 0 : id;
  const palette = [
    { ring: "ring-rose-300",    bg: "bg-rose-50 dark:bg-rose-500/10",       text: "text-rose-700 dark:text-rose-200",       dot: "bg-rose-500" },
    { ring: "ring-amber-300",   bg: "bg-amber-50 dark:bg-amber-500/10",     text: "text-amber-700 dark:text-amber-200",     dot: "bg-amber-500" },
    { ring: "ring-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-200", dot: "bg-emerald-500" },
    { ring: "ring-sky-300",     bg: "bg-sky-50 dark:bg-sky-500/10",         text: "text-sky-700 dark:text-sky-200",         dot: "bg-sky-500" },
    { ring: "ring-violet-300",  bg: "bg-violet-50 dark:bg-violet-500/10",   text: "text-violet-700 dark:text-violet-200",   dot: "bg-violet-500" },
    { ring: "ring-fuchsia-300", bg: "bg-fuchsia-50 dark:bg-fuchsia-500/10", text: "text-fuchsia-700 dark:text-fuchsia-200", dot: "bg-fuchsia-500" },
    { ring: "ring-cyan-300",   bg: "bg-cyan-50 dark:bg-cyan-500/10",       text: "text-cyan-700 dark:text-cyan-200",       dot: "bg-cyan-500" },
    { ring: "ring-orange-300",  bg: "bg-orange-50 dark:bg-orange-500/10",   text: "text-orange-700 dark:text-orange-200",   dot: "bg-orange-500" },
  ];
  return palette[Math.abs(n) % palette.length];
}

// Colores por tipo de evento (línea de tiempo)
const KIND_META: Record<string, { label: string; dot: string; ring: string; tone: string }> = {
  created: { label: "Mantenimiento creado",       dot: "bg-violet-500",  ring: "ring-violet-300",   tone: "text-violet-700 dark:text-violet-200" },
  assigned: { label: "Asignado a un operador",     dot: "bg-sky-500",     ring: "ring-sky-300",      tone: "text-sky-700 dark:text-sky-200" },
  reassigned: { label: "Reasignado",                 dot: "bg-sky-500",     ring: "ring-sky-300",      tone: "text-sky-700 dark:text-sky-200" },
  taken: { label: "Operador tomó el mantenimiento", dot: "bg-amber-500", ring: "ring-amber-300",    tone: "text-amber-700 dark:text-amber-200" },
  started: { label: "Mantenimiento iniciado",     dot: "bg-sky-500",     ring: "ring-sky-300",      tone: "text-sky-700 dark:text-sky-200" },
  item_added: { label: "Repuestos / adicionales",     dot: "bg-cyan-500",    ring: "ring-cyan-300",     tone: "text-cyan-700 dark:text-cyan-200" },
  note_added: { label: "Nota agregada",               dot: "bg-slate-500",   ring: "ring-slate-300",    tone: "text-slate-700 dark:text-slate-200" },
  photo_uploaded: { label: "Foto subida",                 dot: "bg-fuchsia-500", ring: "ring-fuchsia-300",  tone: "text-fuchsia-700 dark:text-fuchsia-200" },
  cancelled: { label: "Reprogramado",                dot: "bg-amber-500",   ring: "ring-amber-300",    tone: "text-amber-700 dark:text-amber-200" },
  reauthorized: { label: "Reautorizado",                dot: "bg-orange-500",  ring: "ring-orange-300",   tone: "text-orange-700 dark:text-orange-200" },
  overdue: { label: "Marcado como atrasado",       dot: "bg-rose-500",    ring: "ring-rose-300",     tone: "text-rose-700 dark:text-rose-200" },
  correction_requested: { label: "Marcado para corrección",     dot: "bg-rose-500",    ring: "ring-rose-300",     tone: "text-rose-700 dark:text-rose-200" },
  finalized: { label: "Finalizado",                  dot: "bg-emerald-500", ring: "ring-emerald-300",  tone: "text-emerald-700 dark:text-emerald-200" },
  viewed: { label: "Visualizado",                 dot: "bg-gray-400",    ring: "ring-gray-300",     tone: "text-gray-500 dark:text-gray-400" },
};

const TYPE_LABEL: Record<string, string> = {
  Programado: "Programado",
  Correctivo: "Correctivo",
  Lavada: "Lavada",
};

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function Kpi({ label, value, accent = "violet" }: { label: string; value: string; accent: "violet" | "emerald" | "sky" | "amber" | "rose" | "orange" }) {
  const tones: Record<string, string> = {
    violet: "border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/10",
    emerald: "border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10",
    sky: "border-sky-200 dark:border-sky-500/20 bg-sky-50 dark:bg-sky-500/10",
    amber: "border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10",
    rose: "border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10",
    orange: "border-orange-200 dark:border-orange-500/20 bg-orange-50 dark:bg-orange-500/10",
  };
  const textTones: Record<string, string> = {
    violet: "text-violet-700 dark:text-violet-200",
    emerald: "text-emerald-700 dark:text-emerald-200",
    sky: "text-sky-700 dark:text-sky-200",
    amber: "text-amber-700 dark:text-amber-200",
    rose: "text-rose-700 dark:text-rose-200",
    orange: "text-orange-700 dark:text-orange-200",
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${tones[accent]}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-0.5 text-base font-bold ${textTones[accent]}`}>{value}</p>
    </div>
  );
}

function Section({ icon, title, children, right }: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          {icon}
          {title}
        </p>
        {right}
      </div>
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

// ─── Timeline agrupado (viewed colapsado) ───────────────────────────────────

type EventNode = {
  id: string;
  kind: string;
  actorUserId: string | null;
  actorName: string | null;
  payload: any;
  createdAt: string;
};

function groupViewedEvents(events: EventNode[]): Array<EventNode | { kind: "viewed_group"; count: number; users: Array<{ name: string; id: string | null; at: string }>; createdAt: string }> {
  const out: any[] = [];
  let i = 0;
  while (i < events.length) {
    const e = events[i];
    if (e.kind !== "viewed") {
      out.push(e);
      i++;
      continue;
    }
    // Agrupa los viewed consecutivos
    const group: typeof events = [e];
    let j = i + 1;
    while (j < events.length && events[j].kind === "viewed") { group.push(events[j]); j++; }
    if (group.length === 1) {
      out.push(group[0]);
    } else {
      const users = group.map((g) => ({ name: g.actorName || "—", id: g.actorUserId, at: g.createdAt }));
      // Mantener el último "at"  como createdAt del grupo
      out.push({ kind: "viewed_group", count: group.length, users, createdAt: group[group.length - 1].createdAt });
    }
    i = j;
  }
  return out;
}

// Devuelve true si la URL parece ser una imagen (para decidir si mostrar
// thumbnail o un ícono de documento genérico, ej. para PDFs de factura).
function isImageUrl(url: string): boolean {
  return /\.(jpeg|png|webp|gif|heic|heif)$/i.test(url);
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function MaintenanceDetailDrawer({
  id, isFullAccess, meId, onClose, onEdit, onTake, onStart, onFinalize, onReschedule, onRequestCorrection,
}: {
  id: string | null;
  isFullAccess: boolean;
  meId: number | null;
  onClose: () => void;
  onEdit: (m: Maintenance) => void;
  onTake: (m: Maintenance) => void;
  onStart: (m: Maintenance) => void;
  onFinalize: (m: Maintenance) => void;
  onReschedule: (m: Maintenance) => void;
  onRequestCorrection: (m: Maintenance) => void;
}) {
  const { data: m, isLoading, refetch } = useMaintenance(id || undefined);
  const { session } = useAuth();
  const meRole = session.role || "";

  // Datos de lavada (extras y fotos)
  const itemId = m?.id || null;
  const { data: carwashExtras = [] } = useCarwashExtras(itemId);
  const { data: carwashPhotos = [] } = useCarwashPhotos(itemId);

  // Usuarios de la empresa para el selector de reasignación. Se
  // consumen del endpoint del módulo de Mantenimiento (no del de
  // Accesos/Usuarios) para que un usuario con permiso de Mantenimiento
  // pero NO de Accesos pueda igual reasignar.
  const { data: formOptions } = useMaintenanceFormOptions();
  const operadores = useMemo(
    () => (formOptions?.users || []).filter((u) => u.role === "operador"),
    [formOptions],
  );

  const [newNote, setNewNote] = useState("");
  const [newItem, setNewItem] = useState<{
    name: string;
    quantity: string;
    unitCost: string;
    discountValue: string;          // jul 2026 v4-c — IMPORTE (no %).
    ivaPercent: string;
    photoUrl: string | null;
    uploading: boolean;
    supplierId: string | null;
    // jul 2026 — Opcion A: vinculo lógico a un attachment del array
    // `attachments[]`. NULL = sin factura asignada (solo evidencia).
    attachmentKey: string | null;
  }>({
    name: "", quantity: "1", unitCost: "", discountValue: "", ivaPercent: "15",
    photoUrl: null, uploading: false, supplierId: null, attachmentKey: null,
  });
  // Batch de repuestos pendientes por agregar
  const [pendingItems, setPendingItems] = useState<{
    name: string;
    quantity: string;
    unitCost: string;
    discountValue: string;   // jul 2026 v4-c — IMPORTE (no %).
    ivaPercent: string;
    photoUrl: string | null;
    uploading: boolean;
    supplierId: string | null;
    attachmentKey: string | null;
  }[]>([]);
  // IVA% editable (default 15 para Ecuador)
  const [ivaPercentDraft, setIvaPercentDraft] = useState<number>(15);
  const { suppliers } = useSuppliers();
  const [assignTo, setAssignTo] = useState("");
  // Estado local para nuevos adicionales / fotos de lavada
  const [newExtra, setNewExtra] = useState<{ name: string; quantity: number; unitCost: number; photoUrl: string }>({
    name: "", quantity: 1, unitCost: 0, photoUrl: "",
  });
  const [newPhotoCaption, setNewPhotoCaption] = useState<string>("");
  // Ref al input file de lavada (usado para resetear el control tras subir).
  const carwashPhotoInputRef = useRef<HTMLInputElement | null>(null);

  // Mano de obra (edición en línea, solo Programado/Correctivo en proceso)
  const [laborCostDraft, setLaborCostDraft] = useState<number>(0);
  const [savingLabor, setSavingLabor] = useState(false);

  // Facturas y evidencias (adjuntos)
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  // jul 2026 — guardamos el archivo recién subido + URL mientras el modal
  // "factura o evidencia" decide qué hacer con él.
  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; file: File } | null>(null);
  const attachmentFileRef = useRef<HTMLInputElement | null>(null);

  const addNoteMut = useAddMaintenanceNote();
  const addItemsMut = useAddMaintenanceItems();
  const deleteItemMut = useDeleteMaintenanceItem();
  const assignMut = useAssignMaintenance();
  const updateMut = useUpdateMaintenance();
  const addCarwashExtraMut = useAddCarwashExtras();
  const addCarwashPhotoMut = useAddCarwashPhotos();

  useEffect(() => {
    setNewNote("");
    setNewItem({ name: "", quantity: "1", unitCost: "", discountValue: "", ivaPercent: "15", photoUrl: null, uploading: false, supplierId: null, attachmentKey: null });
    setPendingItems([]);
    setIvaPercentDraft(m?.ivaPercent || 15);
    setNewExtra({ name: "", quantity: 1, unitCost: 0, photoUrl: "" });
    setNewPhotoCaption("");
    setAssignTo("");
    setLaborCostDraft(0);
  }, [id]);

  // Sincroniza el draft de mano de obra cuando llegan/cambian los datos
  // del mantenimiento (la carga es async, así que no alcanza con el
  // efecto de arriba, que solo corre al cambiar `id`).
  useEffect(() => {
    if (m) setLaborCostDraft(m.laborCost || 0);
  }, [m?.id, m?.laborCost]);

  const item: Maintenance | null = m || null;
  const events = (item?.events || []) as EventNode[];

  // Sync IVA% con el valor guardado cuando llegan los datos
  useEffect(() => {
    if (item?.ivaPercent != null) setIvaPercentDraft(item.ivaPercent);
  }, [item?.ivaPercent]);

  // IMPORTANTE: este useMemo debe ir ANTES de cualquier `return null` para
  // no violar las Rules of Hooks. Si el componente re-renderiza con un
  // `id` distinto, el orden de hooks debe ser estable.
  const groupedEvents = useMemo(() => groupViewedEvents(events), [events]);

  // Normalización: el backend manda `item.assignedUserId` con el prefijo
  // "company-user-N" (toId()), pero `meId` es un número puro. Compararlos
  // como string siempre falla. Extraemos el id numérico de ambos para
  // comparar apples-to-apples.
  const idFromPrefixed = (s: string | null | undefined): number | null => {
    if (!s) return null;
    const m = String(s).match(/(\d+)$/);
    return m ? Number(m[1]) : null;
  };
  const assignedNum = idFromPrefixed(item?.assignedUserId);
  const createdByNum = idFromPrefixed(item?.createdBy);
  const meIdNum = meId != null ? meId : null;

  const isOwn = item
    ? (meIdNum != null && (assignedNum === meIdNum || createdByNum === meIdNum))
    : false;
  const canOperate = isFullAccess || isOwn;

  // Solo owner/admin/supervisor pueden marcar un mantenimiento Completado
  // como "Corrección". isFullAccess ya cubre exactamente esos 3 roles
  // (ver MaintenanceListTab: isFullAccess = owner_empresa || admin_empresa || supervisor).
  const canManageCorrection = isFullAccess;
  const canEditDates =
    meRole === "owner_empresa" || meRole === "admin_empresa" || meRole === "operador";

  const isProgramado = item?.status === "Programado";
  const isProceso = item?.status === "En proceso";
  const isCompleto = item?.status === "Completado";
  const isCorreccion = item?.status === "Correccion";
  const isLavada = item?.type?.toString() === "Lavada";

  // El mantenimiento está libre (sin nadie asignado) Disponible para
  // ser tomado por cualquiera con permiso (operador o full access).
  const isFree = assignedNum == null;
  // Ya es de quien está mirando el drawer (asignado a él, sea
  // operador o full access que se auto-asignó).
  const isMine = meIdNum != null && assignedNum === meIdNum;

  const currentAssignedId = item?.assignedUserId || "";
  const partsCost = (item?.totalCost || 0) - (item?.laborCost || 0);
  // Para lavada: el "Total"  del servicio = carwashTotal. Los "Repuestos /
  // Extras" no aplican como tal — lo que sí hay son los adicionales que el
  // operador agregó al servicio (carwashExtras).
  const carwashExtrasCost = carwashExtras.reduce(
    (acc, e) => acc + Number(e.quantity || 0) * Number(e.unitCost || 0),
    0,
  );

  // Mano de obra: editable en línea mientras está "En proceso" y el
  // usuario puede operar sobre el mantenimiento (dueño o full access).
  // Fuera de ese estado se muestra de solo lectura (igual que antes).
  const canEditLabor = !isLavada && isProceso && canOperate;

  const saveLaborCost = async (value: number) => {
    if (!item) return;
    if (value === (item.laborCost || 0)) return;
    setSavingLabor(true);
    try {
      await updateMut.mutateAsync({ id: item.id, body: { laborCost: value } });
      toast.success("Mano de obra actualizada");
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
      setLaborCostDraft(item.laborCost || 0);
    } finally {
      setSavingLabor(false);
    }
  };

  // Facturas y evidencias: subir habilitado mientras está "En proceso" y
  // el usuario puede operar. La sección igual se muestra (solo lectura)
  // si ya hay adjuntos cargados, sin importar el estado.
  const canUploadAttachment = !isLavada && isProceso && canOperate;
  const attachments = item?.attachments || [];
  // jul 2026 — Opcion A: solo los attachments que tienen invoiceNumber
  // son candidatos a recibir items "agregados después" desde el form de
  // repuestos. Los demás quedan como evidencia visual.
  const attachmentsWithInvoice = useMemo(
    () => attachments.filter((a) => a.invoiceNumber && String(a.invoiceNumber).trim().length > 0),
    [attachments],
  );

  const handleAttachmentUpload = async (file: File) => {
    if (!item) return;
    setUploadingAttachment(true);
    try {
      const url = await uploadMaintenanceAttachment(file, Number(session.companyId || 0));
      // jul 2026 — guardamos el archivo + URL y abrimos el modal "factura o
      // evidencia" ANTES de guardar en el mantenimiento. El modal decide
      // y devuelve el attachment final con todos los metadatos.
      setPendingAttachment({
        url,
        file,
      });
    } catch (err) {
      toast.error("No se pudo subir el adjunto", {
        description: err instanceof Error ? err.message : "Error",
      });
      if (attachmentFileRef.current) attachmentFileRef.current.value = "";
    } finally {
      setUploadingAttachment(false);
    }
  };

  // jul 2026 — modal "factura o evidencia"
  const handleAttachmentModalClose = useCallback(() => {
    setPendingAttachment(null);
    if (attachmentFileRef.current) attachmentFileRef.current.value = "";
  }, []);

  const handleAttachmentModalSubmit = useCallback(async (result: {
    url: string;
    isInvoice: boolean;
    kind?: "repuesto" | "mano_obra" | "lavada" | null;
    supplierId?: number | null;
    workshopName?: string | null;
    workerName?: string | null;
    invoiceNumber?: string | null;
    ivaAmount?: number | null;
    total?: number | null;
    items?: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      imageUrl?: string | null;
      imagePending?: boolean;
    }>;
  }) => {
    if (!item) return;
    try {
      const newKey = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      // jul 2026 v3 — el backend AUTOGENERA el invoiceNumber, el cliente
      // ya no lo manda. El criterio de "es factura" es ahora `isInvoice`.
      const isInvoice = result.isInvoice === true;
      const label = isInvoice
        ? `Factura · (autogenerada)`
        : `Evidencia · ${result.url.split("/").pop()?.slice(0, 40) ?? "adjunto"}`;
      const newAttachment: MaintenanceAttachment & {
        kind?: string;
        supplierId?: number | null;
        workshopName?: string | null;
        workerName?: string | null;
        amount?: number | null;
        ivaAmount?: number | null;
        items?: typeof result.items;
        key?: string;
        // Flag explicito para el sync (backend lo lee como senal de "crear fila en ledger").
        isInvoice?: boolean;
      } = {
        key: newKey,
        url: result.url,
        label,
        uploadedAt: new Date().toISOString(),
        ...(isInvoice
          ? {
              // NO mandamos invoiceNumber — el backend lo autogenera.
              isInvoice: true,
              kind: (result.kind ?? "repuesto"),
              supplierId: result.supplierId ?? null,
              workshopName: result.workshopName ?? null,
              workerName: result.workerName ?? null,
              amount: result.total ?? null,
              ivaAmount: result.ivaAmount ?? null,
              items: result.items ?? [],
            }
          : { isInvoice: false }),
      };
      const nextAttachments = [...attachments, newAttachment];
      await updateMut.mutateAsync({ id: item.id, body: { attachments: nextAttachments } });

      // Propagacion bidireccional v3 — si la factura trae items, los creamos
      // como repuestos del mantenimiento ya atados a este attachment via
      // `attachmentKey`. Asi aparecen de una en el listado del drawer y
      // suman al total del mantenimiento.
      if (result.isInvoice && result.items && result.items.length > 0) {
        try {
          await addItemsMut.mutateAsync({
            id: item.id,
            items: result.items.map((it) => ({
              name: it.description,
              quantity: Number(it.quantity) || 0,
              unitCost: Number(it.unitPrice) || 0,
              // jul 2026 v4-c — al subir factura los items no traen
              // descuento, así que lo dejamos en 0. El IVA por defecto 15.
              discountValue: 0,
              ivaPercent:    15,
              photoUrl: it.imageUrl ?? null,
              supplierId: result.supplierId ?? null,
              attachmentKey: newKey,
            })),
          });
          toast.success(`Factura agregada con ${result.items.length} item${result.items.length !== 1 ? "s" : ""}.`);
        } catch (e) {
          toast.error("Factura guardada, pero no se pudieron agregar los items al mantenimiento", {
            description: (e as Error).message,
          });
        }
      } else {
        toast.success(result.invoiceNumber ? "Factura agregada." : "Evidencia agregada.");
      }
      refetch();
      handleAttachmentModalClose();
    } catch (err) {
      toast.error("No se pudo guardar el adjunto", {
        description: err instanceof Error ? err.message : "Error",
      });
    }
  }, [item, attachments, updateMut, addItemsMut, refetch, handleAttachmentModalClose]);

  return (
    <>
      {/* jul 2026 — modal: factura o evidencia al subir archivo.
          Aparece después de subir el archivo a storage, antes de guardarlo
          en el mantenimiento. Decide los metadatos del attachment. */}
      {pendingAttachment && (
        <AttachmentFacturaModal
          fileUrl={pendingAttachment.url}
          fileMimeType={pendingAttachment.file.type}
          fileLabel={pendingAttachment.file.name}
          // jul 2026 v3 — sincronizar mano de obra bidireccional con
          // el campo "Mano de obra" del drawer. Si el operador edita
          // el valor en el modal, se guarda en el mantenimiento via
          // `saveLaborCost` (igual que el campo en línea).
          initialLaborCost={item?.laborCost ?? 0}
          onLaborCostChange={canEditLabor ? saveLaborCost : undefined}
          onClose={handleAttachmentModalClose}
          onSubmit={handleAttachmentModalSubmit}
        />
      )}

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
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl dark:bg-[#0b0f1a]"
            >
              {isLoading || !item ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">Cargando…</div>
              ) : (
                <>
                  {/* ─── Header (sticky en la parte superior del drawer) ─── */}
                  <div
                    className="sticky top-0 z-10 shrink-0 border-b border-gray-200 dark:border-white/[0.06] px-5 pt-4 pb-4 backdrop-blur"
                    style={{
                    background:
                      `linear-gradient(135deg, ${statusGradient(item.status)} 0%, transparent 70%)`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={item.status} />
                        <TypeBadge type={item.type} />
                        {item.isReprogrammed && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
                            <RefreshCw size={10} /> Re-programado{item.reprogramCount > 1 ? ` (${item.reprogramCount}×)` : ""}
                          </span>
                        )}
                        {isCorreccion && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-200">
                            <RefreshCw size={10} /> En corrección
                          </span>
                        )}
                        {/* jun 2026 — chip de reautorización. Distinto de
                            "Re-programado" (éste viene del flujo de atrasados:
                            operador pidió reabrir, admin aprobó, vuelve a
                            Programado). Vector CheckCircle2 para diferenciar
                            visualmente del RefreshCw de reprogramación. */}
                        {item.lastReauthorizationId && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200" title={item.lastReauthorizationAt ? `Aprobado el ${fmtDateTime(item.lastReauthorizationAt)}` : "Aprobado"}>
                            <CheckCircle2 size={10} /> Reautorizado
                          </span>
                        )}
                      </div>
                      <h2 className="mt-2 truncate text-lg font-bold text-gray-800 dark:text-white">
                        {item.title || "Mantenimiento"}
                      </h2>
                      <p className="mt-0.5 font-mono text-[11px] text-gray-400 dark:text-gray-500">
                        Folio #{item.id}
                      </p>
                      {/* jul 2026 v4 — Indicador compacto de Caja Chica,
                          debajo del título. Como el header es sticky, queda
                          fijo en la parte superior del drawer. */}
                      <div className="mt-2">
                        <FinancePanel maintenanceId={item.id} item={item} onChanged={() => refetch()} />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={async () => {
                          const { generateMaintenanceDetailPdf } = await import("../../../components/features/pdf/MaintenanceDetailPdf");
                          const blob = await generateMaintenanceDetailPdf(item);
                          const url = URL.createObjectURL(blob);
                          window.open(url, "_blank");
                          setTimeout(() => URL.revokeObjectURL(url), 60_000);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-gray-700 backdrop-blur dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 hover:bg-white dark:hover:bg-white/[0.08] transition"
                      >
                        <Download size={13} /> PDF
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-white/70 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white transition"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* ─── Body ─── */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">

                  {item.isReprogrammed && item.reprogramReason && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300">
                        Reprogramado{item.reprogramCount > 1 ? ` (${item.reprogramCount}×)` : ""}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900 dark:text-amber-100">{item.reprogramReason}</p>
                      {item.reprogrammedAt && (
                        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">Reprogramado el {fmtDateTime(item.reprogrammedAt)}</p>
                      )}
                    </div>
                  )}

                  {/* jun 2026 — Banner de reautorización aprobado. Aparece
                      cuando el mantenimiento pasó por el flujo de atrasados:
                      un operador pidió reabrirlo, un admin/supervisor
                      aprobó la solicitud y volvió a Programado.
                      Independiente de `isReprogrammed` — una reaut puede
                      haber sido sólo 'open' (sin nueva fecha) y aún así
                      dejar lastReauthorizationId poblado. */}
                  {item.lastReauthorizationId && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                        Reautorizado
                      </p>
                      <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-100">
                        El mantenimiento pasó por una solicitud de reautorización aprobada.
                      </p>
                      {item.lastReauthorizationAt && (
                        <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                          Aprobado el {fmtDateTime(item.lastReauthorizationAt)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── Banner: motivo de la corrección ── */}
                  {item.correctionReason && (isCorreccion || isProceso) && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 dark:border-rose-500/30 dark:bg-rose-500/10">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-rose-700 dark:text-rose-300">
                        Motivo de la corrección
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-rose-900 dark:text-rose-100">{item.correctionReason}</p>
                      {item.correctionRequestedAt && (
                        <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-300">Solicitada el {fmtDateTime(item.correctionRequestedAt)}</p>
                      )}
                    </div>
                  )}

                  {/* ── Vehículo ── */}
                  <Section icon={<Truck size={11} />} title="Vehículo">
                    <Row label="Placa"  value={item.assetPlate || "—"} />
                    <Row label="Nombre" value={item.assetName || "—"} />
                  </Section>

                  {/* ── Taller ── */}
                  {item.workshopName && (
                    <Section icon={<Wrench size={11} />} title="Taller">
                      <Row label="Nombre"  value={item.workshopName} />
                    </Section>
                  )}

                  {/* ── Asignación ── */}
                  <Section icon={<UserIcon size={11} />} title="Asignación">
                    <Row
                      label="Asignado a"
                      value={
                        item.assignedUserName
                          ? <span className="font-medium text-sky-700 dark:text-sky-300">{item.assignedUserName}</span>
                          : <span className="italic text-gray-400">Libre — sin asignar</span>
                      }
                    />
                    {item.takenAt && <Row icon={<Clock size={11} />} label="Tomado el" value={fmtDateTime(item.takenAt)} />}
                  </Section>

                  {/* ── Programación ── */}
                  <Section icon={<Calendar size={11} />} title="Programación">
                    <Row label="Programado"  value={fmtDateTime(item.scheduledFor)} />
                    {canEditDates ? (
                      <>
                        <EditDatesInline
                          maintenanceId={item.id}
                          label="Ejecutado"
                          value={item.executedAt}
                          field="executedAt"
                          onSaved={refetch}
                        />
                        <EditDatesInline
                          maintenanceId={item.id}
                          label="Completado"
                          value={item.completedAt}
                          field="completedAt"
                          onSaved={refetch}
                        />
                      </>
                    ) : (
                      <>
                        <Row label="Ejecutado"  value={fmtDateTime(item.executedAt)} />
                        <Row label="Completado"  value={fmtDateTime(item.completedAt)} />
                      </>
                    )}
                    {item.odometerKm != null && (
                      <Row icon={<Hash size={11} />} label="Odómetro" value={`${item.odometerKm.toLocaleString("es-CO")} km`} />
                    )}
                  </Section>

                  {/* ── Costo (mano de obra editable en proceso + repuestos + total) ── */}
                  <Section icon={<DollarSign size={11} />} title="Costo">
                    <div className="grid grid-cols-3 gap-2 px-3 py-3">
                      {!isLavada && (
                        canEditLabor ? (
                          <div className="rounded-lg border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/10 px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                              Mano de obra
                            </p>
                            <div className="mt-1 flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                value={laborCostDraft === 0 ? "" : laborCostDraft}
                                onChange={(e) => setLaborCostDraft(e.target.value === "" ? 0 : Number(e.target.value))}
                                onBlur={() => saveLaborCost(laborCostDraft)}
                                className="w-full min-w-0 rounded-md border border-violet-200 dark:border-violet-500/30 bg-white dark:bg-white/[0.04] px-2 py-1 text-sm font-bold text-violet-700 dark:text-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-400/30 transition"
                              />
                              {savingLabor && <Loader2 size={12} className="shrink-0 animate-spin text-violet-500" />}
                            </div>
                          </div>
                        ) : (
                          <Kpi label="Mano de obra" value={fmtMoney(item.laborCost)} accent="violet" />
                        )
                      )}
                      {/* En lavada no hay "Repuestos / Extras" como tal — los
                          adicionales del servicio (carwashExtras) son lo que
                          más se le parece. Mostramos ese monto y el total
                          reflejando el costo del servicio. */}
                      {isLavada ? (
                        <Kpi
                          label="Adicionales del servicio"
                          value={fmtMoney(carwashExtrasCost)}
                          accent="sky"
                        />
                      ) : (
                        <Kpi label="Repuestos / Extras" value={fmtMoney(partsCost)} accent="sky" />
                      )}
                      <Kpi label="Total"  value={fmtMoney(item.totalCost)} accent="emerald" />
                    </div>
                  </Section>

                  {/* ── Lavada: campos específicos ── */}
                  {isLavada && (
                    <Section icon={<MapPin size={11} />} title="Lavada">
                      <Row icon={<Store size={11} />} label="Lugar / Proveedor" value={item.carwashLocation || "—"} />
                      <Row icon={<UserIcon size={11} />} label="Encargado"  value={item.carwashProvider || "—"} />
                      <Row icon={<DollarSign size={11} />} label="Costo del servicio" value={(item.carwashTotal || 0) > 0 ? fmtMoney(item.carwashTotal!) : "—"} />
                      {item.carwashNotes && (
                        <div className="px-3 py-2 text-xs">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Notas</p>
                          <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-200">{item.carwashNotes}</p>
                        </div>
                      )}
                    </Section>
                  )}

                  {item.description && (
                    <Section icon={<FileText size={11} />} title="Descripción">
                      <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-700 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-200 whitespace-pre-wrap">
                        {item.description}
                      </p>
                    </Section>
                  )}

                  {/* ── Facturas y evidencias — Programado/Correctivo, no lavada ──
                      Subida habilitada en "En proceso" (dueño o full access);
                      la sección se muestra de solo lectura si ya hay adjuntos
                      cargados, sin importar el estado (ej. ya Completado). */}
                  {!isLavada && (canUploadAttachment || attachments.length > 0) && (
                    <Section
                      icon={<Receipt size={11} />}
                      title={`Facturas y evidencias${attachments.length ? ` · ${attachments.length}` : ""}`}
                      right={
                        canUploadAttachment ? (
                          <button
                            type="button"
                            disabled={uploadingAttachment}
                            onClick={() => attachmentFileRef.current?.click()}
                            className="inline-flex items-center gap-1 rounded-md border border-sky-200 dark:border-sky-500/40 px-2 py-1 text-[11px] font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition disabled:opacity-50"
                          >
                            {uploadingAttachment ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
                            {uploadingAttachment ? "Subiendo…" : "Subir archivo"}
                          </button>
                        ) : undefined
                      }
                    >
                      {attachments.length === 0 ? (
                        <p className="px-3 py-3 text-center text-xs text-gray-400 dark:text-gray-500">
                          Sin facturas o evidencias todavía.
                        </p>
                      ) : (
                        <ul className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                          {attachments.map((a) => {
                            const isInvoice = a.invoiceNumber && String(a.invoiceNumber).trim().length > 0;
                            return (
                              <li key={a.url} className="flex items-center gap-3 px-3 py-2.5 text-xs">
                                <a
                                  href={a.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 text-gray-500 dark:bg-white/[0.06]"
                                  title={a.label}
                                >
                                  {isImageUrl(a.url) ? (
                                    <img src={a.url} alt={a.label} className="h-full w-full object-cover" />
                                  ) : (
                                    <FileText size={16} />
                                  )}
                                </a>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-medium text-gray-800 dark:text-white">{a.label}</p>
                                  {a.uploadedAt && (
                                    <p className="text-[11px] text-gray-400 dark:text-gray-500">{fmtDateTime(a.uploadedAt)}</p>
                                  )}
                                </div>
                                {(a as any).key && canOperate && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!item) return;
                                      const msg = isInvoice
                                        ? `Borrar la factura ${a.invoiceNumber}? Esto elimina sus items del mantenimiento y la fila del ledger Finanzas.`
                                        : `Quitar este adjunto? Sus items asociados tambien se borraran del mantenimiento.`;
                                      if (!confirm(msg)) return;
                                      try {
                                        const targetKey = (a as any).key ?? null;
                                        const nextAtt = attachments.filter((x: any) => (x as any).key !== targetKey);
                                        // jul 2026 v3 — REEMPLAZO ATÓMICO via PATCH: el backend
                                        // borra todos los items del mantenimiento y re-inserta
                                        // solo los que queremos mantener. Un solo request,
                                        // una sola transacción en backend, recalcula la factura.
                                        const itemsToKeep = (item.items || [])
                                          .filter((it: any) => it.attachmentKey !== targetKey)
                                          .map((it: any) => ({
                                            name: it.name,
                                            quantity: Number(it.quantity) || 0,
                                            unitCost: Number(it.unitCost) || 0,
                                            photoUrl: it.photoUrl ?? null,
                                            supplierId: it.supplierId ?? null,
                                            attachmentKey: it.attachmentKey ?? null,
                                          }));
                                        await updateMut.mutateAsync({
                                          id: item.id,
                                          body: {
                                            attachments: nextAtt,
                                            items: itemsToKeep,
                                          },
                                        });
                                        toast.success(isInvoice ? "Factura y sus items borrados." : "Adjunto y sus items borrados.");
                                        refetch();
                                      } catch (e) {
                                        toast.error((e as Error).message);
                                      }
                                    }}
                                    className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 shrink-0"
                                    title={isInvoice ? "Borrar factura" : "Quitar adjunto"}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {canUploadAttachment && (
                        <input
                          ref={attachmentFileRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleAttachmentUpload(file);
                          }}
                        />
                      )}
                    </Section>
                  )}

                  {/* ── Repuestos / avance — Programado/Correctivo en proceso o ya completado ── */}
                  {!isLavada && (isProceso || isCompleto) && canOperate && (
                    <Section icon={<Package size={11} />} title="Repuestos y avance">
                      {item.items && item.items.length > 0 && (
                        <>
                          {/* jul 2026 — Resumen agrupado por factura (Opcion A).
                              Solo si hay al menos 1 attachment con invoiceNumber.
                              Items con attachmentKey NULL quedan abajo en el
                              listado plano. */}
                          {attachmentsWithInvoice.length > 0 && (
                            <div className="px-3 pb-3 pt-1">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">
                                Items por factura
                              </p>
                              <div className="space-y-2">
                                {attachmentsWithInvoice.map((att, idx) => {
                                  const attKey = att.key || `att-${idx}`;
                                  const itemsInThis = (item.items || []).filter(
                                    (it) => it.attachmentKey === attKey,
                                  );
                                  const subtotal = itemsInThis.reduce(
                                    (acc, it) => acc + Number(it.subtotal || 0),
                                    0,
                                  );
                                  if (itemsInThis.length === 0) return null;
                                  return (
                                    <div
                                      key={attKey}
                                      className="rounded-lg border border-gray-200 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.03] px-2.5 py-2"
                                    >
                                      <div className="flex items-center justify-between mb-1.5">
                                        <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 truncate">
                                          {att.label}
                                          {att.invoiceNumber ? (
                                            <span className="ml-1 font-mono text-[10px] text-gray-500 dark:text-gray-400">
                                              · {att.invoiceNumber}
                                            </span>
                                          ) : null}
                                        </p>
                                        <span className="text-[11px] font-bold tabular-nums text-gray-700 dark:text-gray-200">
                                          {fmtMoney(subtotal)}
                                        </span>
                                      </div>
                                      <ul className="space-y-1">
                                        {itemsInThis.map((it) => (
                                          <li key={it.id} className="flex items-center justify-between gap-2 text-[11px] text-gray-600 dark:text-gray-300">
                                            <span className="truncate flex-1">
                                              <span className="font-medium">{it.quantity}</span>
                                              <span className="text-gray-400 mx-1">×</span>
                                              <span className="truncate">{it.name}</span>
                                            </span>
                                            <span className="font-mono tabular-nums text-gray-500 dark:text-gray-400">
                                              ${(Number(it.subtotal) || 0).toFixed(2)}
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  );
                                })}
                                {/* Items sin factura asignada */}
                                {(item.items || []).some((it) => !it.attachmentKey) && (
                                  <p className="text-[10px] text-rose-600 dark:text-rose-300 italic">
                                    Hay items sin factura asignada (mirá el listado plano).
                                  </p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Listado plano (siempre, complementario al resumen). */}
                          <ul className="divide-y divide-gray-100 dark:divide-white/[0.05] border-t border-gray-100 dark:border-white/[0.05]">
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
                                    {it.supplierName ? `${it.supplierName} · ` : ""}{it.attachmentKey ? `factura · ${attachments.find((a) => (a.key || "main") === it.attachmentKey)?.invoiceNumber || ""} · ` : ""}{it.quantity} × {fmtMoney(it.unitCost)}
                                  </p>
                                  {/* jul 2026 v4 — badge si este item disparó una solicitud de caja chica. */}
                                  {(it as any).financeRequestId && (
                                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30" title={`Solicitud #${(it as any).financeRequestId} enviada a finanzas`}>
                                      💰 Solicitud #{(it as any).financeRequestId}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">{fmtMoney(it.subtotal)}</p>
                                {/* jul 2026 v3 — papelera por item. Si tiene attachmentKey, el backend
                                    recalcula la factura dueña (la marca 'anulada' si no quedan items). */}
                                {canOperate && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!item) return;
                                      if (!confirm(`Borrar "${it.name}"?${it.attachmentKey ? " Esto también lo quita de la factura asociada y recalcula el total." : ""}`)) return;
                                      try {
                                        await deleteItemMut.mutateAsync({ id: item.id, itemId: it.id });
                                        toast.success("Item borrado.");
                                        refetch();
                                      } catch (err) {
                                        toast.error((err as Error).message);
                                      }
                                    }}
                                    className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 shrink-0"
                                    title="Borrar item"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}

                      {isProceso && (
                        <div className="space-y-2 px-3 py-2.5">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Acciones</p>

                          {/* ── Batch: lista de repuestos pendientes + formulario de nuevo repuesto ── */}
                          <div className="rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">

                            {/* Encabezado con botón guardar (visible solo si hay pendientes) */}
                            {pendingItems.length > 0 && (
                              <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-white/[0.06] bg-sky-50 dark:bg-sky-500/10 px-3 py-2">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
                                  <Package size={12} />
                                  <span>{pendingItems.length} repuesto{pendingItems.length !== 1 ? "s" : ""} pendiente{pendingItems.length !== 1 ? "s" : ""}</span>
                                </div>
                                <button
                                  onClick={async () => {
                                    try {
                                      // Guardar IVA% primero (si cambió)
                                      if (ivaPercentDraft !== (item.ivaPercent || 15)) {
                                        await updateMut.mutateAsync({ id: item.id, body: { ivaPercent: ivaPercentDraft } });
                                      }
                                      // Guardar los repuestos
                                      await addItemsMut.mutateAsync({
                                        id: item.id,
                                        items: pendingItems.map((it) => ({
                                          name: it.name,
                                          quantity: Number(it.quantity) || 0,
                                          unitCost: Number(it.unitCost) || 0,
                                          // jul 2026 v4-c — IMPORTE del descuento (no %).
                                          discountValue: Number(it.discountValue) || 0,
                                          ivaPercent:    Number(it.ivaPercent) || 15,
                                          photoUrl: it.photoUrl,
                                          supplierId: it.supplierId,
                                          // jul 2026 — Opcion A: vinculo lógico a
                                          // la factura (attachment con invoiceNumber).
                                          // Null si no hay factura asignada.
                                          attachmentKey: it.attachmentKey,
                                        })),
                                      });
                                      setPendingItems([]);
                                      setNewItem({ name: "", quantity: "1", unitCost: "", discountValue: "", ivaPercent: "15", photoUrl: null, uploading: false, supplierId: null, attachmentKey: null });
                                      toast.success(`${pendingItems.length} repuesto${pendingItems.length !== 1 ? "s" : ""} agregado${pendingItems.length !== 1 ? "s" : ""}`);
                                      refetch();
                                    } catch (e) { toast.error((e as Error).message); }
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 hover:bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white transition shadow-sm"
                                >
                                  <CheckCircle2 size={12} />
                                  Guardar todos
                                </button>
                              </div>
                            )}

                            {/* Formulario: agregar nuevo repuesto */}
                            <div className="px-3 py-2.5 space-y-2.5">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                                  {pendingItems.length === 0 ? "Agregar repuestos" : "Agregar más"}
                                </p>
                                {/* jul 2026 v5 — IVA% GLOBAL: ya no se repite por cada
                                    item. Un único cuadrito arriba a la derecha aplica
                                    a TODOS los repuestos que se agreguen. Al apretar
                                    "Agregar" se snapshotea en el item pendiente. */}
                                <div className="flex items-center gap-2">
                                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                    IVA %
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={String(ivaPercentDraft)}
                                    onChange={(e) => {
                                      const raw = e.target.value.replace(/[^0-9.]/g, "");
                                      setIvaPercentDraft(Number(raw) || 0);
                                    }}
                                    className="w-16 rounded-md border border-sky-300 dark:border-sky-500/40 bg-white dark:bg-gray-800 px-2 py-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300 text-center focus:outline-none focus:ring-1 focus:ring-sky-400/40 tabular-nums"
                                    title="Este % se aplica a todos los repuestos que agregues"
                                  />
                                </div>
                              </div>

                              {/* Línea única: foto · nombre · proveedor · factura · cant · precio · desc · + Agregar.
                                  jul 2026 v5 — mismo layout que MaintenanceFormModal. Sin
                                  input de IVA por item (ya está arriba como global). */}
                              <div className="grid grid-cols-12 gap-2 text-xs">
                                {/* Foto */}
                                <div className="col-span-1 shrink-0">
                                  {newItem.photoUrl ? (
                                    <div className="relative h-9 w-9 rounded-md overflow-hidden border border-gray-200 dark:border-white/[0.08]">
                                      <img src={newItem.photoUrl} alt="" className="h-full w-full object-cover" />
                                      <button
                                        type="button"
                                        onClick={() => setNewItem((p) => ({ ...p, photoUrl: null }))}
                                        className="absolute top-0 right-0 bg-black/60 text-white p-0.5"
                                        title="Quitar foto"
                                      >
                                        <X size={9} />
                                      </button>
                                    </div>
                                  ) : (
                                    <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-dashed border-gray-300 dark:border-white/[0.08] text-gray-400 hover:border-sky-400 hover:text-sky-500 transition">
                                      {newItem.uploading ? (
                                        <Loader2 size={13} className="animate-spin" />
                                      ) : (
                                        <Camera size={13} />
                                      )}
                                      <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                                        disabled={newItem.uploading}
                                        className="hidden"
                                        onChange={async (e) => {
                                          const f = e.target.files?.[0];
                                          if (!f) return;
                                          setNewItem((p) => ({ ...p, uploading: true }));
                                          try {
                                            const url = await uploadPartPhoto(f, session.companyId || undefined);
                                            setNewItem((p) => ({ ...p, photoUrl: url }));
                                            toast.success("Foto subida");
                                          } catch (err) {
                                            toast.error((err as Error).message);
                                          } finally {
                                            setNewItem((p) => ({ ...p, uploading: false }));
                                          }
                                        }}
                                      />
                                    </label>
                                  )}
                                </div>

                                {/* Nombre */}
                                <input
                                  placeholder="Nombre del repuesto"
                                  value={newItem.name}
                                  onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
                                  className="col-span-3 min-w-0 rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
                                />

                                {/* Proveedor */}
                                <select
                                  value={newItem.supplierId || ""}
                                  onChange={(e) => setNewItem((p) => ({ ...p, supplierId: e.target.value || null }))}
                                  className="col-span-2 min-w-0 rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-800 px-2.5 py-2 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
                                >
                                  <option value="">Sin proveedor</option>
                                  {suppliers.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>

                                {/* Factura (Opcion A) */}
                                <select
                                  value={newItem.attachmentKey || ""}
                                  onChange={(e) => setNewItem((p) => ({ ...p, attachmentKey: e.target.value || null }))}
                                  disabled={attachmentsWithInvoice.length === 0}
                                  title={
                                    attachmentsWithInvoice.length === 0
                                      ? "Subí una factura con número en 'Facturas y evidencias' para poder asignar este repuesto."
                                      : "A qué factura pertenece este repuesto"
                                  }
                                  className="col-span-2 min-w-0 rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-800 px-2.5 py-2 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-sky-400/40 disabled:opacity-50"
                                >
                                  <option value="">Sin factura</option>
                                  {attachmentsWithInvoice.map((a, idx) => (
                                    <option key={a.key || a.url || idx} value={a.key || `att-${idx}`}>
                                      {a.label}
                                      {a.invoiceNumber ? ` · ${a.invoiceNumber}` : ""}
                                    </option>
                                  ))}
                                </select>

                                {/* Cantidad */}
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="Cant."
                                  value={newItem.quantity}
                                  onChange={(e) => setNewItem((p) => ({ ...p, quantity: e.target.value }))}
                                  className="col-span-1 min-w-0 rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-800 px-2.5 py-2 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-400/40 tabular-nums text-right"
                                  title="Cantidad"
                                />

                                {/* Precio unitario (USD) */}
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="Precio"
                                  value={newItem.unitCost}
                                  onChange={(e) => setNewItem((p) => ({ ...p, unitCost: e.target.value }))}
                                  className="col-span-1 min-w-0 rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-800 px-2.5 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-sky-400/40 tabular-nums text-right"
                                  title="Precio unitario (USD)"
                                />

                                {/* jul 2026 v4-c — Descuento (importe monetario) */}
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="$ Desc."
                                  value={newItem.discountValue}
                                  // jul 2026 v5 — normalización de coma/punto. Antes
                                  // se guardaba el string crudo y "0,50" → NaN al
                                  // hacer Number() → 0, lo que hacía que el
                                  // descuento pareciera "no guardarse".
                                  onChange={(e) => {
                                    const v = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
                                    setNewItem((p) => ({ ...p, discountValue: v }));
                                  }}
                                  className="col-span-1 min-w-0 rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-800 px-2.5 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-sky-400/40 tabular-nums text-right"
                                  title="Descuento (importe monetario, ej: 0.50)"
                                />

                                {/* Agregar a la lista */}
                                <button
                                  onClick={() => {
                                    if (!newItem.name.trim()) { toast.error("Nombre requerido"); return; }
                                    // jul 2026 v5 — al pushear, snapshot del IVA global.
                                    // (Antes se guardaba el del input por item, pero como
                                    // ahora NO hay input por item, usamos el global.)
                                    // También normalizamos qty/unitCost/desc.
                                    const toNum = (s: string) => {
                                      const v = Number(String(s).replace(",", "."));
                                      return Number.isFinite(v) ? v : 0;
                                    };
                                    const pending = {
                                      ...newItem,
                                      quantity:      String(toNum(newItem.quantity) || 1),
                                      unitCost:      String(toNum(newItem.unitCost)),
                                      discountValue: String(toNum(newItem.discountValue)),
                                      ivaPercent:    String(ivaPercentDraft),
                                    };
                                    setPendingItems((prev) => [...prev, pending]);
                                    setNewItem({ name: "", quantity: "1", unitCost: "", discountValue: "", ivaPercent: String(ivaPercentDraft), photoUrl: null, uploading: false, supplierId: null, attachmentKey: null });
                                    toast.success("Repuesto agregado a la lista");
                                  }}
                                  className="col-span-1 inline-flex items-center justify-center gap-1 rounded-md border border-sky-200 dark:border-sky-500/40 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 px-2.5 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 transition whitespace-nowrap"
                                >
                                  <Plus size={11} /> Agregar
                                </button>
                              </div>

                              {/* Preview de pendientes */}
                              {pendingItems.length > 0 && (
                                <ul className="mt-1 divide-y divide-gray-100 dark:divide-white/[0.05] rounded-md border border-gray-100 dark:border-white/[0.05] overflow-hidden">
                                  {pendingItems.map((it, idx) => (
                                    <li key={idx} className="flex items-center gap-2 bg-white dark:bg-white/[0.02] px-2.5 py-2 text-xs">
                                      {it.photoUrl ? (
                                        <img src={it.photoUrl} alt="" className="h-7 w-7 rounded object-cover shrink-0" />
                                      ) : (
                                        <div className="h-7 w-7 rounded bg-gray-100 dark:bg-white/[0.05] flex items-center justify-center shrink-0">
                                          <Package size={10} className="text-gray-400" />
                                        </div>
                                      )}
                                      <span className="flex-1 truncate font-medium text-gray-700 dark:text-gray-200">{it.name}</span>
                                      {it.supplierId && (
                                        <span className="text-[10px] text-gray-400">{suppliers.find(s => s.id === it.supplierId)?.name}</span>
                                      )}
                                      <span className="text-[10px] text-gray-500 tabular-nums">
                                        {it.quantity} × {fmtMoney(Number(it.unitCost) || 0)}
                                        {Number(it.discountValue) > 0 && (
                                          <span className="ml-1 text-rose-600 dark:text-rose-400">- {fmtMoney(Number(it.discountValue))}</span>
                                        )}
                                        {Number(it.ivaPercent) > 0 && (
                                          <span className="ml-1 text-blue-600 dark:text-blue-400">+ {it.ivaPercent}% IVA</span>
                                        )}
                                      </span>
                                      {/* jul 2026 v4-c — Total: subtotal (post descuento)
                                          + IVA. Subtotal = quantity * unitCost - discountValue. */}
                                      {(() => {
                                        const qty   = Number(it.quantity) || 0;
                                        const cost  = Number(it.unitCost) || 0;
                                        const disc  = Math.max(0, Math.min(qty * cost, Number(it.discountValue) || 0));
                                        const sub   = Math.max(0, qty * cost - disc);
                                        const iva   = (Number(it.ivaPercent) || 0) / 100;
                                        const total = sub + sub * iva;
                                        return (
                                          <span className="font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
                                            {fmtMoney(total)}
                                          </span>
                                        );
                                      })()}
                                      <button
                                        type="button"
                                        onClick={() => setPendingItems((prev) => prev.filter((_, i) => i !== idx))}
                                        className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10 transition"
                                        title="Quitar"
                                      >
                                        <X size={11} />
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>

                          {/* Agregar nota */}
                          <details className="rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-2.5">
                            <summary className="cursor-pointer text-xs font-semibold text-gray-600 dark:text-gray-300 inline-flex items-center gap-1.5">
                              <Plus size={12} /> Agregar nota
                            </summary>
                            <div className="mt-2 flex flex-col sm:flex-row sm:items-end gap-2">
                              <textarea
                                rows={2}
                                placeholder="Escribí una nota…"
                                value={newNote}
                                onChange={(e) => setNewNote(e.target.value)}
                                className="flex-1 rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2 py-1.5 text-xs resize-none"
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
                                className="rounded-md bg-sky-600 hover:bg-sky-700 px-3 py-1.5 text-xs font-medium text-white transition shrink-0"
                              >
                                Guardar nota
                              </button>
                            </div>
                          </details>
                        </div>
                      )}
                    </Section>
                  )}

                  {/* ── Lavada: adicionales y fotos ── */}
                  {isLavada && isProceso && canOperate && (
                    <Section icon={<Package size={11} />} title="Adicionales de la lavada">
                      {carwashExtras.length > 0 && (
                        <ul className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                          {carwashExtras.map((e) => (
                            <li key={e.id} className="flex items-start gap-3 px-3 py-2.5 text-xs">
                              {e.photoUrl ? (
                                <img src={e.photoUrl} alt={e.name} className="h-10 w-10 rounded-md object-cover" />
                              ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sky-100 text-sky-400 dark:bg-sky-500/10">
                                  <Package size={14} />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-800 dark:text-white truncate">{e.name}</p>
                                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                  {e.quantity} × {fmtMoney(e.unitCost)}
                                </p>
                              </div>
                              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">{fmtMoney(e.subtotal)}</p>
                            </li>
                          ))}
                        </ul>
                      )}

                      <details className="rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-2.5 mx-3 my-2.5" open>
                        <summary className="cursor-pointer text-xs font-semibold text-gray-600 dark:text-gray-300 inline-flex items-center gap-1.5">
                          <Plus size={12} /> Agregar adicional
                        </summary>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <input
                            placeholder="Nombre (ej: encerado, aromatizante)"
                            value={newExtra.name}
                            onChange={(e) => setNewExtra((p) => ({ ...p, name: e.target.value }))}
                            className="rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2 py-1.5 col-span-2"
                          />
                          <input
                            type="number"  min={0} placeholder="Cant." value={newExtra.quantity}
                            onChange={(e) => setNewExtra((p) => ({ ...p, quantity: Number(e.target.value) }))}
                            className="rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2 py-1.5"
                          />
                          <input
                            type="number"  min={0} placeholder="Costo unit." value={newExtra.unitCost === 0 ? "" : newExtra.unitCost}
                            onChange={(e) => setNewExtra((p) => ({ ...p, unitCost: e.target.value === "" ? 0 : Number(e.target.value) }))}
                            className="rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2 py-1.5"
                          />
                          <input
                            placeholder="URL foto (opcional)"
                            value={newExtra.photoUrl}
                            onChange={(e) => setNewExtra((p) => ({ ...p, photoUrl: e.target.value }))}
                            className="rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2 py-1.5 col-span-2"
                          />
                          <button
                            onClick={async () => {
                              if (!newExtra.name.trim()) { toast.error("Nombre requerido"); return; }
                              try {
                                await addCarwashExtraMut.mutateAsync({
                                  id: item.id,
                                  extras: [{
                                    name: newExtra.name,
                                    quantity: newExtra.quantity,
                                    unitCost: newExtra.unitCost,
                                    photoUrl: newExtra.photoUrl.trim() || null,
                                  }],
                                });
                                setNewExtra({ name: "", quantity: 1, unitCost: 0, photoUrl: "" });
                                toast.success("Adicional agregado");
                                refetch();
                              } catch (e) { toast.error((e as Error).message); }
                            }}
                            className="col-span-2 rounded-md bg-sky-600 hover:bg-sky-700 px-3 py-1.5 text-xs font-medium text-white transition"
                          >
                            Guardar adicional
                          </button>
                        </div>
                      </details>

                      {/* Fotos */}
                      {carwashPhotos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 px-3 pb-3">
                          {carwashPhotos.map((p) => (
                            <figure key={p.id} className="overflow-hidden rounded-md border border-gray-200 dark:border-white/[0.06]">
                              <img src={p.photoUrl} alt={p.caption || "Foto"} className="h-20 w-full object-cover" />
                              {p.caption && <figcaption className="px-1.5 py-1 text-[10px] text-gray-500 dark:text-gray-400">{p.caption}</figcaption>}
                            </figure>
                          ))}
                        </div>
                      )}

                      <details className="rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-2.5 mx-3 my-2.5">
                        <summary className="cursor-pointer text-xs font-semibold text-gray-600 dark:text-gray-300 inline-flex items-center gap-1.5">
                          <Camera size={12} /> Subir foto
                        </summary>
                        <div className="mt-2 space-y-2 text-xs">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            ref={carwashPhotoInputRef}
                            onChange={async (e) => {
                              const files = Array.from(e.target.files || []);
                              if (!files.length) return;
                              try {
                                await addCarwashPhotoMut.mutateAsync({
                                  id: item.id,
                                  photos: files.map((f) => ({ file: f, caption: newPhotoCaption.trim() || null })),
                                });
                                setNewPhotoCaption("");
                                if (carwashPhotoInputRef.current) carwashPhotoInputRef.current.value = "";
                                toast.success(files.length === 1 ? "Foto subida" : `${files.length} fotos subidas`);
                                refetch();
                              } catch (err) { toast.error((err as Error).message); }
                            }}
                            className="w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-sky-700"
                          />
                          <input
                            placeholder="Caption (opcional, aplica a todas)"
                            value={newPhotoCaption}
                            onChange={(e) => setNewPhotoCaption(e.target.value)}
                            className="w-full rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2 py-1.5"
                          />
                        </div>
                      </details>
                    </Section>
                  )}

                  {/* ── Línea de tiempo (con colores y agrupada) — solo owner/admin ── */}
                  {canManageCorrection && item.events && item.events.length > 0 && (
                    <Section icon={<History size={11} />} title={`Línea de tiempo · ${item.events.length}`}>
                      <div className="max-h-72 overflow-y-auto px-2 py-3">
                        <ol className="relative space-y-3 pl-5 before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-px before:bg-gray-200 dark:before:bg-white/[0.08]">
                          {groupedEvents.map((e, idx) => {
                            if ((e as any).kind === "viewed_group") {
                              const grp = e as any;
                              return (
                                <li key={`vg-${idx}`} className="relative">
                                  <span className="absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-full bg-gray-400 ring-2 ring-white dark:ring-gray-900" />
                                  <details className="rounded-md border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-2.5 py-1.5 text-xs">
                                    <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-200">
                                      Visto por {grp.count} {grp.count === 1 ? "usuario" : "usuarios"}
                                    </summary>
                                    <ul className="mt-1.5 space-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                      {grp.users.map((u: any, i: number) => (
                                        <li key={i} className="flex items-center justify-between gap-2">
                                          <span className="inline-flex items-center gap-1.5">
                                            <span className={`h-1.5 w-1.5 rounded-full ${colorForUser(u.id).dot}`} />
                                            {u.name}
                                          </span>
                                          <span className="text-gray-400 dark:text-gray-500">{fmtDateTime(u.at)}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                </li>
                              );
                            }
                            const ev = e as EventNode;
                            const meta = KIND_META[ev.kind] || { label: ev.kind, dot: "bg-gray-400", ring: "ring-gray-300", tone: "text-gray-600" };
                            return (
                              <li key={ev.id} className="relative">
                                <span className={`absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-full ${meta.dot} ring-2 ring-white dark:ring-gray-900`} />
                                <div className="text-xs text-gray-800 dark:text-white">
                                  <p className={`font-medium ${meta.tone}`}>{meta.label}</p>
                                  {ev.actorName && (
                                    <p className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                                      <span className={`h-1.5 w-1.5 rounded-full ${colorForUser(ev.actorUserId).dot}`} />
                                      {ev.actorName}
                                    </p>
                                  )}
                                  <p className="text-[11px] text-gray-400 dark:text-gray-500">{fmtDateTime(ev.createdAt)}</p>
                                  {ev.kind === "cancelled" && (ev.payload as any).reason && (
                                    <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">Motivo: {String((ev.payload as any).reason)}</p>
                                  )}
                                  {ev.kind === "correction_requested" && (ev.payload as any).reason && (
                                    <p className="mt-0.5 text-[11px] text-rose-700 dark:text-rose-300">
                                      Motivo: {String((ev.payload as any).reason)}
                                      {(ev.payload as any).rescheduled && (ev.payload as any).newScheduledFor && (
                                        <> · Reagendado para {fmtDateTime(String((ev.payload as any).newScheduledFor))}</>
                                      )}
                                    </p>
                                  )}
                                  {ev.kind === "item_added" && (
                                    <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                                      {String((ev.payload as any).count || 0)} {(ev.payload as any).kind === "carwash_extra" ? "adicional(es)" : "repuesto(s)"} — total {fmtMoney((ev.payload as any).totalAdded || 0)}
                                    </p>
                                  )}
                                  {ev.kind === "finalized" && (
                                    <p className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">Mantenimiento cerrado como completado.</p>
                                  )}
                                  {ev.kind === "taken" && (
                                    <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">Operador tomó el mantenimiento (sigue {normalizeStatusLabel(item.status)} hasta que se inicie).</p>
                                  )}
                                  {ev.kind === "started" && (
                                    <p className="mt-0.5 text-[11px] text-sky-700 dark:text-sky-300">El mantenimiento pasó a En proceso.</p>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    </Section>
                  )}

                  {/* ── Reasignar operador — solo admin/owner/supervisor ── */}
                  {isFullAccess && (isProgramado || isProceso || isCorreccion) && (
                    <Section icon={<UserIcon size={11} />} title="Reasignar operador">
                      <div className="p-3 space-y-2">
                        <select
                          value={assignTo || currentAssignedId}
                          onChange={(e) => setAssignTo(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-3 py-2 text-xs text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400/30 transition"
                        >
                          <option value="">— Sin asignar (libre) —</option>
                          {operadores.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.fullName || u.username}
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

                {/* ─── Footer ─── */}
                <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.02] px-5 py-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-gray-200 dark:border-white/[0.06] px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition"
                  >
                    Cerrar
                  </button>

                  {/* Tomar — Programado/Corrección, libre, para cualquiera con permiso
                      (operador o full access). Solo asigna; NO cambia el estado. */}
                  {(isProgramado || isCorreccion) && isFree && (
                    <button
                      onClick={() => onTake(item)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 px-4 py-2 text-xs font-semibold text-white transition"
                    >
                      <UserIcon size={13} /> {isCorreccion ? "Tomar corrección" : "Tomar mantenimiento"}
                    </button>
                  )}

                  {/* Iniciar — Programado/Corrección, ya asignado a quien mira (o
                      full access dueño/creador). Pasa a En proceso. */}
                  {(isProgramado || isCorreccion) && !isFree && (isMine || canOperate) && (
                    <button
                      onClick={() => onStart(item)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 px-4 py-2 text-xs font-semibold text-white transition"
                    >
                      <Play size={13} /> {isCorreccion ? "Iniciar corrección" : "Iniciar mantenimiento"}
                    </button>
                  )}

                  {/* Asignado a otro — informativo (no es libre ni es suyo) */}
                  {(isProgramado || isCorreccion) && !isFree && !isMine && !isFullAccess && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/[0.06] px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                      <AlertCircle size={12} /> Asignado a {item.assignedUserName}
                    </span>
                  )}

                  {/* Reprogramar — disponible también en Corrección (aún no iniciada) */}
                  {(isProceso || isProgramado || isCorreccion) && canOperate && !isLavada && (
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

                  {/* Marcar corrección — solo sobre un Completado, solo owner/admin/supervisor */}
                  {isCompleto && canManageCorrection && (
                    <button
                      onClick={() => onRequestCorrection(item)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 px-4 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 transition"
                    >
                      <RefreshCw size={13} /> Marcar corrección
                    </button>
                  )}

                  {isCompleto && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 size={12} /> Mantenimiento completado
                    </span>
                  )}
                </div>
              </>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Helpers de status / type ───────────────────────────────────────────────

function normalizeStatusLabel(status: string): string {
  return status === "Correccion" ? "en Corrección" : "Programado";
}

function statusGradient(status: string): string {
  switch (status) {
    case "Programado": return "rgba(124, 58, 237, 0.10)";
    case "En proceso": return "rgba(56, 189, 248, 0.10)";
    case "Completado": return "rgba(16, 185, 129, 0.10)";
    case "Correccion": return "rgba(244, 63, 94, 0.10)";
    default: return "rgba(148, 163, 184, 0.10)";
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { dot: string; cls: string }> = {
    Programado: { dot: "bg-violet-500",  cls: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-200" },
    "En proceso": { dot: "bg-sky-500",     cls: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-200" },
    Completado: { dot: "bg-emerald-500", cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200" },
    Correccion: { dot: "bg-rose-500",    cls: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200" },
  };
  const c = map[status] || { dot: "bg-gray-400", cls: "border-gray-200 bg-gray-50 text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200" };
  const label = status === "Correccion" ? "Corrección" : status;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${c.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    Programado: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200",
    Correctivo: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-200",
    Lavada: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${map[type] || "border-gray-200 bg-gray-50 text-gray-700"}`}>
      {TYPE_LABEL[type] || type}
    </span>
  );
}