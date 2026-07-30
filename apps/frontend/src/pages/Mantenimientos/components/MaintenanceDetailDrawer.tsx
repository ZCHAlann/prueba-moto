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
  Store, Plus, Image as ImageIcon, ImagePlus, XCircle, Camera, DollarSign, FileText,
  CalendarDays, TruckIcon, ClipboardList, History, Receipt, Loader2,
  Trash2, Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  useMaintenance,
  useAddMaintenanceNote,
  useAddMaintenanceItems,
  useUpdateMaintenanceItem,
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
import { computeItemTotals, aggregateTotals } from "../../../lib/maintenance-totals";
import { EditDatesInline } from "../../../components/features/maintenances/EditDatesInline";
import { fmtDateTimeEc, fmtDateShortEc } from "@/lib/datetime";
import { compressIfImage, COMPRESS_OPTS_EVIDENCE } from "../../../lib/mediaCompress";
import {
  AttachmentFacturaModal,
  type AttachmentFacturaResult,
} from "./AttachmentFacturaModal";
import { FinancePanel } from "./FinancePanel";
import { ConfirmModal } from "../../../components/ui/ConfirmModal";

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
    // jul 2026 v3 — Tipo de descuento. "amount" = $ directos.
    // "percent" = % sobre el subtotal pre-descuento. El backend
    // (computeDiscountAmount) lo respeta. Si es null/undefined, se
    // interpreta como "amount" (importe).
    discountType: "amount" | "percent";
    ivaPercent: string;
    photoUrl: string | null;
    uploading: boolean;
    supplierId: string | null;
  }>({
    name: "", quantity: "1", unitCost: "", discountValue: "", discountType: "amount", ivaPercent: "15",
    photoUrl: null, uploading: false, supplierId: null,
  });
  // IVA% editable (default 15 para Ecuador)
  const [ivaPercentDraft, setIvaPercentDraft] = useState<number>(15);
  const { suppliers } = useSuppliers();
  const [assignTo, setAssignTo] = useState("");
  // Estado local para nuevos adicionales / fotos de lavada
  const [newExtra, setNewExtra] = useState<{ name: string; quantity: number; unitCost: number; photoUrl: string }>({
    name: "", quantity: 1, unitCost: 0, photoUrl: "",
  });
  // jul 2026 — Estado de upload para la foto del ADICIONAL de lavada.
  // Antes el form pedía "URL foto (opcional)" como texto plano, obligando al
  // operador a subir el archivo por otro lado y pegar la URL. Ahora el form
  // acepta un file real: lo sube a /api/upload/photos, recibe la URL, y la
  // guarda en `newExtra.photoUrl` para cuando se confirme "Guardar adicional".
  const [uploadingExtraPhoto, setUploadingExtraPhoto] = useState(false);
  const extraPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [newPhotoCaption, setNewPhotoCaption] = useState<string>("");
  // Ref al input file de lavada (usado para resetear el control tras subir).
  const carwashPhotoInputRef = useRef<HTMLInputElement | null>(null);

  // jul 2026 v2 — Drafts de edición por item guardado. Key = itemId.
  // Cada fila de la tabla tiene su propio set de inputs (igual al modal
  // de edición) que escribe acá. "Guardar" hace DELETE del viejo +
  // POST del nuevo con los valores actualizados.
  type ItemDraft = {
    name: string;
    quantity: string;
    unitCost: string;
    discountValue: string;
    discountType: "amount" | "percent";
    ivaPercent: string;
    photoUrl: string | null;
    uploading: boolean;
    supplierId: string | null;
  };
  const [editingItems, setEditingItems] = useState<Record<string, ItemDraft>>({});
  const itemRowRef = useRef<HTMLInputElement | null>(null);
  // jul 2026 v3 — Autoguardado con debounce 800ms. Por cada itemId
  // guardamos:
  //   - el `timeoutId` del setTimeout activo (para cancelarlo si el
  //     user sigue editando)
  //   - el `requestSeq` (para descartar respuestas viejas si la edición
  //     cambió mientras el fetch estaba en vuelo)
  //   - el estado visual `saving: "pending" | "saving" | "saved" | "error"`
  //     que se muestra al lado de la papelera.
  type SaveStatus = "pending" | "saving" | "saved" | "error";
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const requestSeq = useRef<Record<string, number>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});

  // Mano de obra (edición en línea, solo Programado/Correctivo en proceso)
  const [laborCostDraft, setLaborCostDraft] = useState<number>(0);
  const [savingLabor, setSavingLabor] = useState(false);

  // Facturas y evidencias (adjuntos)
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  // jul 2026 — guardamos el archivo recién subido + URL mientras el modal
  // "factura o evidencia" decide qué hacer con él.
  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; file: File } | null>(null);
  const attachmentFileRef = useRef<HTMLInputElement | null>(null);

  // jul 2026 v3 — modales de confirmación (reemplazan a window.confirm).
  // Borrar item del mantenimiento: el modal guarda el itemId a borrar
  // y un flag si era una factura (para el texto).
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<{
    itemId: string;
    name: string;
    attachmentKey: string | null | undefined;
  } | null>(null);
  // Borrar factura (attachment del mantenimiento).
  const [confirmDeleteAttachment, setConfirmDeleteAttachment] = useState<{
    a: MaintenanceAttachment & { key?: string };
    isInvoice: boolean;
  } | null>(null);

  const addNoteMut = useAddMaintenanceNote();
  const addItemsMut = useAddMaintenanceItems();
  const updateItemMut = useUpdateMaintenanceItem();
  const deleteItemMut = useDeleteMaintenanceItem();
  const assignMut = useAssignMaintenance();
  const updateMut = useUpdateMaintenance();
  const addCarwashExtraMut = useAddCarwashExtras();
  const addCarwashPhotoMut = useAddCarwashPhotos();

  // jul 2026 — Sube la foto del ADICIONAL de lavada y guarda la URL en
  // `newExtra.photoUrl`. Replica el patrón de useAddCarwashPhotos (mismo
  // endpoint /api/upload/photos?category=maintenance) pero sin persistir
  // todavía — la foto queda "en el adicional en draft" hasta que el
  // operador aprieta "Guardar adicional" (recién ahí se manda al backend
  // vía addCarwashExtraMut). Si el operador cancela, el siguiente
  // useEffect con cambio de `id` resetea el form y la URL huérfana queda
  // en el storage (se limpia aparte con cron o manualmente).
  const { companyId: companyIdForUpload } = useAuth();
  const handleExtraPhotoFile = async (file: File) => {
    if (!companyIdForUpload) {
      toast.error("Sesión inválida");
      return;
    }
    setUploadingExtraPhoto(true);
    try {
      const toUpload = await compressIfImage(file, COMPRESS_OPTS_EVIDENCE);
      const fd = new FormData();
      fd.append("photos", toUpload);
      const upRes = await fetch(
        `/api/upload/photos?category=maintenance&companyId=${encodeURIComponent(String(companyIdForUpload))}`,
        { method: "POST", body: fd, credentials: "include" },
      );
      if (!upRes.ok) {
        const body = await upRes.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Error subiendo foto (${upRes.status})`);
      }
      const upData = (await upRes.json()) as { urls?: string[] };
      const url = upData.urls?.[0];
      if (!url) throw new Error("El servidor no devolvió la URL de la foto.");
      setNewExtra((p) => ({ ...p, photoUrl: url }));
      toast.success("Foto lista — tocá 'Guardar adicional' para confirmar");
    } catch (err) {
      toast.error("No se pudo subir la foto del adicional", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setUploadingExtraPhoto(false);
      if (extraPhotoInputRef.current) extraPhotoInputRef.current.value = "";
    }
  };

  useEffect(() => {
    setNewNote("");
    setNewItem({ name: "", quantity: "1", unitCost: "", discountValue: "", discountType: "amount", ivaPercent: "15", photoUrl: null, uploading: false, supplierId: null });
    setIvaPercentDraft(m?.ivaPercent || 15);
    setNewExtra({ name: "", quantity: 1, unitCost: 0, photoUrl: "" });
    setNewPhotoCaption("");
    setAssignTo("");
    setLaborCostDraft(0);
    setEditingItems({});
    setSaveStatus({});
    // Cancelar debounces pendientes de mantenimientos anteriores
    Object.values(debounceTimers.current).forEach(clearTimeout);
    debounceTimers.current = {};
  }, [id]);

  // Sincroniza el draft de mano de obra cuando llegan/cambian los datos
  // del mantenimiento (la carga es async, así que no alcanza con el
  // efecto de arriba, que solo corre al cambiar `id`).
  useEffect(() => {
    if (m) setLaborCostDraft(m.laborCost || 0);
  }, [m?.id, m?.laborCost]);

  // jul 2026 v2 — Hidratar los drafts de edición de items guardados. Se
  // inicializan UNA vez por cada itemId nuevo (no pisamos lo que el user
  // está escribiendo). Así el operador puede tipear tranquilo sin que el
  // refetch le borre lo que escribió.
  useEffect(() => {
    if (!m?.items) return;
    setEditingItems((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const it of m.items) {
        if (!next[it.id]) {
          next[it.id] = {
            name:            it.name,
            quantity:        String(it.quantity),
            unitCost:        String(it.unitCost),
            discountValue:   String(it.discountValue ?? 0),
            discountType:    (it.discountType as "amount" | "percent") ?? "amount",
            ivaPercent:      String(it.ivaPercent ?? 15),
            photoUrl:        it.photoUrl ?? null,
            uploading:       false,
            supplierId:      it.supplierId ?? null,
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [m?.items]);

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

  // jul 2026 v9 — Autoguardado de un item. Ahora usamos PATCH (UPDATE
  // in-place) en vez del viejo flujo DELETE+POST, que duplicaba
  // items cuando el invalidateQueries traía la lista antes de que
  // el DELETE se committeara. PATCH es 1 sola operación, imposible
  // duplicar. Si el user sigue editando, el debounce timer se resetea
  // y este guardado nunca se dispara (lo cancela el próximo keystroke).
  // `seq` evita pisar el resultado de un guardado más reciente.
  const persistItem = async (itemId: string, draft: ItemDraft) => {
    if (!item) return;
    const seq = (requestSeq.current[itemId] ?? 0) + 1;
    requestSeq.current[itemId] = seq;
    setSaveStatus((p) => ({ ...p, [itemId]: "saving" }));
    try {
      await updateItemMut.mutateAsync({
        id: item.id,
        itemId,
        item: {
          name: draft.name,
          quantity: Number(draft.quantity) || 0,
          unitCost: Number(draft.unitCost) || 0,
          discountValue: Number(draft.discountValue) || 0,
          discountType:  draft.discountType,
          ivaPercent:    Number(draft.ivaPercent) || 15,
          photoUrl: draft.photoUrl,
          supplierId: draft.supplierId,
        },
      });
      // Si en el medio el user editó más, no pisamos el draft ni el status.
      if (requestSeq.current[itemId] === seq) {
        setSaveStatus((p) => ({ ...p, [itemId]: "saved" }));
        // Limpiar el draft (el item mantiene su mismo id, no se recrea).
        setEditingItems((p) => {
          const next = { ...p };
          delete next[itemId];
          return next;
        });
        refetch();
        // Después de 2s, limpiar el check verde (si la fila sigue visible)
        setTimeout(() => {
          setSaveStatus((p) => {
            if (p[itemId] === "saved") {
              const next = { ...p };
              delete next[itemId];
              return next;
            }
            return p;
          });
        }, 2000);
      }
    } catch (err) {
      if (requestSeq.current[itemId] === seq) {
        setSaveStatus((p) => ({ ...p, [itemId]: "error" }));
        toast.error((err as Error).message);
      }
    }
  };

  // jul 2026 v3 — Handler de edición. Se llama desde cada onChange de
  // los inputs de un item existente. Marca el item como "pending"
  // (mostrando un dot ámbar), resetea el debounce timer y agenda el
  // guardado en 800ms. Si el user sigue editando, el timer se cancela
  // y se vuelve a agendar.
  const handleItemEdit = (itemId: string, patch: Partial<ItemDraft>) => {
    setEditingItems((p) => {
      const cur = p[itemId];
      if (!cur) return p;
      return { ...p, [itemId]: { ...cur, ...patch } };
    });
    setSaveStatus((p) => ({ ...p, [itemId]: "pending" }));
    const existing = debounceTimers.current[itemId];
    if (existing) clearTimeout(existing);
    debounceTimers.current[itemId] = setTimeout(() => {
      delete debounceTimers.current[itemId];
      // Releer el draft actual del state (puede haber cambiado
      // múltiples veces durante el debounce).
      setEditingItems((p) => {
        const cur = p[itemId];
        if (cur) persistItem(itemId, cur);
        return p;
      });
    }, 800);
  };

  // Facturas y evidencias: subir habilitado mientras está "En proceso" y
  // el usuario puede operar. La sección igual se muestra (solo lectura)
  // si ya hay adjuntos cargados, sin importar el estado.
  // jul 2026 v8.6 — desde esta versión, lavadas también permiten subir
  // fotos de evidencia en "En proceso" (antes solo Programado/Correctivo).
  const canUploadAttachment = isProceso && canOperate;
  const attachments = item?.attachments || [];

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

      {/* jul 2026 v3 — modales de confirmación (reemplazan a window.confirm). */}
      <ConfirmModal
        open={!!confirmDeleteItem}
        title={`Borrar "${confirmDeleteItem?.name ?? ""}"`}
        description={
          confirmDeleteItem?.attachmentKey
            ? "Esto también lo quita de la factura asociada y recalcula el total."
            : "Esta acción no se puede deshacer."
        }
        confirmLabel="Borrar"
        tone="danger"
        onConfirm={async () => {
          if (!item || !confirmDeleteItem) return;
          try {
            await deleteItemMut.mutateAsync({ id: item.id, itemId: confirmDeleteItem.itemId });
            setEditingItems((p) => {
              const next = { ...p };
              delete next[confirmDeleteItem.itemId];
              return next;
            });
            toast.success("Item borrado.");
            refetch();
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setConfirmDeleteItem(null);
          }
        }}
        onClose={() => setConfirmDeleteItem(null)}
      />

      <ConfirmModal
        open={!!confirmDeleteAttachment}
        title={confirmDeleteAttachment?.isInvoice ? `Borrar la factura ${confirmDeleteAttachment?.a.invoiceNumber ?? ""}?` : "Quitar este adjunto?"}
        description={
          confirmDeleteAttachment?.isInvoice
            ? "Esto elimina sus items del mantenimiento y la fila del ledger Finanzas."
            : "Sus items asociados tambien se borraran del mantenimiento."
        }
        confirmLabel="Borrar"
        tone="danger"
        onConfirm={async () => {
          if (!item || !confirmDeleteAttachment) return;
          const a = confirmDeleteAttachment.a;
          const isInvoice = confirmDeleteAttachment.isInvoice;
          try {
            const targetKey = (a as any).key ?? null;
            const nextAtt = attachments.filter((x: any) => (x as any).key !== targetKey);
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
              body: { attachments: nextAtt, items: itemsToKeep },
            });
            toast.success(isInvoice ? "Factura y sus items borrados." : "Adjunto y sus items borrados.");
            refetch();
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setConfirmDeleteAttachment(null);
          }
        }}
        onClose={() => setConfirmDeleteAttachment(null)}
      />

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

                  {/* ── Facturas y evidencias — Programado/Correctivo y Lavada (jul 2026 v8.6) ──
                      Subida habilitada en "En proceso" (dueño o full access);
                      la sección se muestra de solo lectura si ya hay adjuntos
                      cargados, sin importar el estado (ej. ya Completado).
                      Desde jul 2026 v8.6 también se permite en lavadas para
                      que el operador suba fotos del proceso. */}
                  {(canUploadAttachment || attachments.length > 0) && (
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
                                    onClick={() => {
                                      if (!item) return;
                                      setConfirmDeleteAttachment({
                                        a: a as MaintenanceAttachment & { key?: string },
                                        isInvoice,
                                      });
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

                  {/* ── Repuestos / avance — Programado/Correctivo en proceso o ya completado ──
                       v2: replica del modal de edición. Misma tabla estilo
                       factura, mismo header "Repuestos / Insumos" + control
                       IVA% + botón "+ Agregar" arriba a la derecha, sin
                       columna "Factura", sin bloque "Acciones", sin preview
                       de pendientes (el modal tampoco tiene batch: agrega
                       de a uno y se va guardando). El toggle $/% está
                       DENTRO de la celda Desc. de la fila de inputs. */}
                  {!isLavada && (isProceso || isCompleto) && canOperate && (
                    <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4 space-y-3">
                      {/* Header: título a la izquierda, control IVA% + Agregar a la derecha */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Package size={14} className="text-violet-600 dark:text-violet-400" />
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
                            Repuestos / Insumos
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          {isProceso && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                % IVA
                              </span>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step="0.01"
                                value={ivaPercentDraft}
                                disabled={false}
                                onChange={(e) => setIvaPercentDraft(e.target.value === "" ? 0 : Number(e.target.value))}
                                onBlur={() => {
                                  // Persistir el IVA% global en el mantenimiento
                                  // al salir del input, igual que el modal.
                                  if (item && ivaPercentDraft !== (item.ivaPercent || 15)) {
                                    updateMut.mutateAsync({ id: item.id, body: { ivaPercent: ivaPercentDraft } })
                                      .then(() => refetch())
                                      .catch((e) => toast.error((e as Error).message));
                                  }
                                }}
                                className="w-16 rounded-md border border-violet-200 dark:border-violet-500/30 bg-white dark:bg-[#0f1320] px-2 py-1 text-xs text-right tabular-nums text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-400/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                          )}
                          {isProceso && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (!newItem.name.trim()) { toast.error("Nombre requerido"); return; }
                                try {
                                  // Guardar IVA% si cambió
                                  if (item && ivaPercentDraft !== (item.ivaPercent || 15)) {
                                    await updateMut.mutateAsync({ id: item.id, body: { ivaPercent: ivaPercentDraft } });
                                  }
                                  // Guardar el repuesto
                                  await addItemsMut.mutateAsync({
                                    id: item.id,
                                    items: [{
                                      name: newItem.name,
                                      quantity: Number(newItem.quantity) || 0,
                                      unitCost: Number(newItem.unitCost) || 0,
                                      discountValue: Number(newItem.discountValue) || 0,
                                      discountType:  newItem.discountType || "amount",
                                      ivaPercent:    ivaPercentDraft,
                                      photoUrl: newItem.photoUrl,
                                      supplierId: newItem.supplierId,
                                    }],
                                  });
                                  setNewItem({ name: "", quantity: "1", unitCost: "", discountValue: "", discountType: "amount", ivaPercent: String(ivaPercentDraft), photoUrl: null, uploading: false, supplierId: null });
                                  toast.success("Repuesto agregado");
                                  refetch();
                                } catch (e) { toast.error((e as Error).message); }
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-violet-200 dark:border-violet-500/40 px-2.5 py-1 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition"
                            >
                              <Plus size={12} /> Agregar
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Tabla estilo factura — mismo markup visual que el modal */}
                      {(isProceso || (item.items && item.items.length > 0)) && (
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
                                {isProceso && <th className="px-2 py-2 border border-gray-300 dark:border-white/[0.1] w-8" />}
                              </tr>
                            </thead>
                            <tbody>
                              {/* Filas guardadas — v2: ahora EDITABLES.
                                  Cada item tiene su propio set de inputs
                                  (calcados al modal de edición). El cálculo
                                  en vivo usa `computeItemTotals` para que
                                  Subtotal/IVA/Total reflejen los cambios
                                  aunque el backend no haya recalculado.
                                  El botón "Guardar" hace DELETE del viejo +
                                  POST del nuevo con los valores nuevos. */}
                              {item.items && item.items.map((it) => {
                                const draft: ItemDraft = editingItems[it.id] ?? {
                                  name: it.name, quantity: String(it.quantity), unitCost: String(it.unitCost),
                                  discountValue: String(it.discountValue ?? 0), discountType: (it.discountType as "amount" | "percent") ?? "amount",
                                  ivaPercent: String(it.ivaPercent ?? 15), photoUrl: it.photoUrl ?? null,
                                  uploading: false, supplierId: it.supplierId ?? null,
                                };
                                const totals = computeItemTotals(draft);
                                return (
                                  <tr
                                    key={it.id}
                                    className="align-middle bg-white dark:bg-transparent"
                                  >
                                    {/* Repuesto + foto — input editable */}
                                    <td className="px-2.5 py-1.5 border border-gray-200 dark:border-white/[0.07] min-w-[160px]">
                                      {isProceso ? (
                                        <>
                                          <input
                                            placeholder="Nombre del repuesto"
                                            value={draft.name}
                                            onChange={(e) => handleItemEdit(it.id, { name: e.target.value })}
                                            className="w-full min-w-0 bg-transparent border-0 px-0 py-0.5 text-xs text-gray-800 dark:text-white placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-violet-400/50 focus:rounded-sm"
                                          />
                                          <div className="mt-1">
                                            {draft.photoUrl ? (
                                              <div className="relative inline-block h-7 w-7 rounded overflow-hidden border border-gray-200 dark:border-white/[0.08]">
                                                <img src={draft.photoUrl} alt="" className="h-full w-full object-cover" />
                                                <button
                                                  type="button"
                                                  onClick={() => handleItemEdit(it.id, { photoUrl: null })}
                                                  className="absolute top-0 right-0 bg-black/60 text-white p-0.5"
                                                  title="Quitar foto"
                                                >
                                                  <XCircle size={9} />
                                                </button>
                                              </div>
                                            ) : (
                                              <label className="inline-flex items-center gap-1 cursor-pointer rounded border border-dashed border-gray-300 dark:border-white/[0.08] px-1.5 py-0.5 text-[9px] text-gray-400 dark:text-gray-500 hover:border-violet-400 dark:hover:border-violet-500/50 transition">
                                                <ImagePlus size={9} /> {draft.uploading ? "Subiendo…" : "Foto"}
                                                <input
                                                  type="file"
                                                  accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf"
                                                  disabled={draft.uploading}
                                                  className="hidden"
                                                  onChange={async (e) => {
                                                    const f = e.target.files?.[0];
                                                    if (!f) return;
                                                    handleItemEdit(it.id, { uploading: true });
                                                    try {
                                                      const url = await uploadPartPhoto(f, session.companyId || undefined);
                                                      handleItemEdit(it.id, { uploading: false, photoUrl: url });
                                                      toast.success("Foto subida");
                                                    } catch (err) {
                                                      toast.error((err as Error).message);
                                                      handleItemEdit(it.id, { uploading: false });
                                                    }
                                                  }}
                                                />
                                              </label>
                                            )}
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <div className="flex items-center gap-1.5">
                                            {draft.photoUrl ? (
                                              <img src={draft.photoUrl} alt="" className="h-7 w-7 rounded object-cover border border-gray-200 dark:border-white/[0.08] shrink-0" />
                                            ) : (
                                              <div className="h-7 w-7 rounded bg-gray-100 dark:bg-white/[0.05] flex items-center justify-center shrink-0">
                                                <Package size={10} className="text-gray-400" />
                                              </div>
                                            )}
                                            <span className="truncate text-gray-800 dark:text-white">{draft.name}</span>
                                          </div>
                                        </>
                                      )}
                                      {(it as any).financeRequestId && (
                                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30" title={`Solicitud #${(it as any).financeRequestId} enviada a finanzas`}>
                                          💰 Solicitud #{(it as any).financeRequestId}
                                        </span>
                                      )}
                                    </td>
                                    {/* Proveedor */}
                                    <td className="px-2.5 py-1.5 border border-gray-200 dark:border-white/[0.07] hidden md:table-cell min-w-[130px]">
                                      {isProceso ? (
                                        <select
                                          value={draft.supplierId || ""}
                                          onChange={(e) => handleItemEdit(it.id, { supplierId: e.target.value || null })}
                                          className="w-full min-w-0 bg-transparent border-0 px-0 py-0.5 text-xs text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-400/50 focus:rounded-sm"
                                        >
                                          <option value="">Sin proveedor</option>
                                          {suppliers.map((s) => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                          ))}
                                        </select>
                                      ) : (
                                        <span className="text-gray-700 dark:text-gray-200">{it.supplierName || <span className="text-gray-400">—</span>}</span>
                                      )}
                                    </td>
                                    {/* Cantidad */}
                                    <td className="px-2 py-1.5 border border-gray-200 dark:border-white/[0.07] w-14">
                                      {isProceso ? (
                                        <input
                                          type="number" min={0} step="0.01"
                                          value={draft.quantity}
                                          onChange={(e) => handleItemEdit(it.id, { quantity: e.target.value })}
                                          className="w-full min-w-0 bg-transparent border-0 px-0 py-0.5 text-xs text-right tabular-nums text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-400/50 focus:rounded-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                      ) : (
                                        <span className="block text-right tabular-nums text-gray-800 dark:text-white">{Number(draft.quantity) || 0}</span>
                                      )}
                                    </td>
                                    {/* Precio unitario */}
                                    <td className="px-2 py-1.5 border border-gray-200 dark:border-white/[0.07] w-20">
                                      {isProceso ? (
                                        <input
                                          type="number" min={0} step="0.01"
                                          value={draft.unitCost}
                                          onChange={(e) => handleItemEdit(it.id, { unitCost: e.target.value })}
                                          className="w-full min-w-0 bg-transparent border-0 px-0 py-0.5 text-xs text-right tabular-nums text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-400/50 focus:rounded-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                      ) : (
                                        <span className="block text-right tabular-nums text-gray-800 dark:text-white">{fmtMoney(Number(draft.unitCost) || 0)}</span>
                                      )}
                                    </td>
                                    {/* Desc. con toggle $/%, igual al modal */}
                                    <td className="px-2 py-1.5 border border-gray-200 dark:border-white/[0.07] w-24">
                                      {isProceso ? (
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="number" min={0}
                                            max={draft.discountType === "percent" ? 100 : undefined}
                                            step="0.01" placeholder="0"
                                            value={draft.discountValue}
                                            onChange={(e) => handleItemEdit(it.id, { discountValue: e.target.value })}
                                            className="w-full min-w-0 bg-transparent border-0 px-0 py-0.5 text-xs text-right tabular-nums text-gray-800 dark:text-white placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-violet-400/50 focus:rounded-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleItemEdit(it.id, { discountType: draft.discountType === "amount" ? "percent" : "amount" })}
                                            className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300 hover:bg-fuchsia-200 dark:hover:bg-fuchsia-500/30 transition shrink-0"
                                            title={draft.discountType === "percent" ? "Cambiar a descuento en $" : "Cambiar a descuento en %"}
                                          >
                                            {draft.discountType === "percent" ? "%" : "$"}
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="block text-right tabular-nums text-gray-700 dark:text-gray-300">
                                          {Number(draft.discountValue) > 0 ? (
                                            <>
                                              <span className="inline-block mr-1 px-1 py-0.5 text-[9px] font-bold rounded bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300 align-middle">
                                                {draft.discountType === "percent" ? "%" : "$"}
                                              </span>
                                              {fmtMoney(Number(draft.discountValue))}
                                            </>
                                          ) : (
                                            <span className="text-gray-400">—</span>
                                          )}
                                        </span>
                                      )}
                                    </td>
                                    {/* Subtotal (calculado en vivo con computeItemTotals) */}
                                    <td className="px-2.5 py-1.5 border border-gray-200 dark:border-white/[0.07] text-right tabular-nums text-gray-700 dark:text-gray-300">
                                      {fmtMoney(totals.subtotal)}
                                    </td>
                                    {/* IVA (calculado) */}
                                    <td className="px-2.5 py-1.5 border border-gray-200 dark:border-white/[0.07] text-right tabular-nums text-gray-700 dark:text-gray-300">
                                      {fmtMoney(totals.ivaAmount)}
                                    </td>
                                    {/* Total (calculado) */}
                                    <td className="px-2.5 py-1.5 border border-gray-200 dark:border-white/[0.07] text-right tabular-nums font-bold text-violet-700 dark:text-violet-300">
                                      {fmtMoney(totals.total)}
                                    </td>
                                    {/* Acciones: indicador de autoguardado + papelera (modal) */}
                                    {isProceso && (
                                      <td className="px-1.5 py-1.5 border border-gray-200 dark:border-white/[0.07]">
                                        <div className="flex items-center gap-1">
                                          {/* Indicador de autoguardado (pending/saving/saved/error) */}
                                          {saveStatus[it.id] === "pending" && (
                                            <span title="Cambios sin guardar (se guardan automáticamente)" className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                                          )}
                                          {saveStatus[it.id] === "saving" && (
                                            <Loader2 size={11} className="animate-spin text-violet-500 shrink-0" title="Guardando…" />
                                          )}
                                          {saveStatus[it.id] === "saved" && (
                                            <span title="Guardado" className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-emerald-100 dark:bg-emerald-500/20 shrink-0">
                                              <Check size={10} className="text-emerald-600 dark:text-emerald-300" />
                                            </span>
                                          )}
                                          {saveStatus[it.id] === "error" && (
                                            <AlertCircle size={11} className="text-rose-500 shrink-0" title="Error al guardar" />
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (!item) return;
                                              setConfirmDeleteItem({
                                                itemId: it.id,
                                                name: it.name,
                                                attachmentKey: it.attachmentKey ?? null,
                                              });
                                            }}
                                            className="rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 shrink-0"
                                            title="Borrar item"
                                          >
                                            <Trash2 size={11} />
                                          </button>
                                        </div>
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}

                              {/* Fila de inputs (solo en proceso) — calcada al modal */}
                              {isProceso && (
                                <tr className="align-middle bg-violet-50/40 dark:bg-violet-500/[0.04]">
                                  {/* Repuesto + foto */}
                                  <td className="px-2.5 py-1.5 border border-gray-200 dark:border-white/[0.07] min-w-[160px]">
                                    <input
                                      placeholder="Nombre del repuesto"
                                      value={newItem.name}
                                      onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
                                      className="w-full min-w-0 bg-transparent border-0 px-0 py-0.5 text-xs text-gray-800 dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-violet-400/50 focus:rounded-sm"
                                    />
                                    <div className="mt-1">
                                      {newItem.photoUrl ? (
                                        <div className="relative inline-block h-7 w-7 rounded overflow-hidden border border-gray-200 dark:border-white/[0.08]">
                                          <img src={newItem.photoUrl} alt="" className="h-full w-full object-cover" />
                                          <button
                                            type="button"
                                            onClick={() => setNewItem((p) => ({ ...p, photoUrl: null }))}
                                            className="absolute top-0 right-0 bg-black/60 text-white p-0.5"
                                            title="Quitar foto"
                                          >
                                            <XCircle size={9} />
                                          </button>
                                        </div>
                                      ) : (
                                        <label className="inline-flex items-center gap-1 cursor-pointer rounded border border-dashed border-gray-300 dark:border-white/[0.08] px-1.5 py-0.5 text-[9px] text-gray-400 dark:text-gray-500 hover:border-violet-400 dark:hover:border-violet-500/50 transition">
                                          <ImagePlus size={9} /> {newItem.uploading ? "Subiendo…" : "Foto"}
                                          <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf"
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
                                  </td>
                                  {/* Proveedor */}
                                  <td className="px-2.5 py-1.5 border border-gray-200 dark:border-white/[0.07] hidden md:table-cell min-w-[130px]">
                                    <select
                                      value={newItem.supplierId || ""}
                                      onChange={(e) => setNewItem((p) => ({ ...p, supplierId: e.target.value || null }))}
                                      className="w-full min-w-0 bg-transparent border-0 px-0 py-0.5 text-xs text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-400/50 focus:rounded-sm"
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
                                      value={newItem.quantity}
                                      onChange={(e) => setNewItem((p) => ({ ...p, quantity: e.target.value }))}
                                      className="w-full min-w-0 bg-transparent border-0 px-0 py-0.5 text-xs text-right tabular-nums text-gray-800 dark:text-white placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-violet-400/50 focus:rounded-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                  </td>
                                  {/* Precio unitario */}
                                  <td className="px-2 py-1.5 border border-gray-200 dark:border-white/[0.07] w-20">
                                    <input
                                      type="number" min={0} step="0.01" placeholder="0.00"
                                      value={newItem.unitCost}
                                      onChange={(e) => setNewItem((p) => ({ ...p, unitCost: e.target.value }))}
                                      className="w-full min-w-0 bg-transparent border-0 px-0 py-0.5 text-xs text-right tabular-nums text-gray-800 dark:text-white placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-violet-400/50 focus:rounded-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                  </td>
                                  {/* Desc. con toggle $/%, igual al modal */}
                                  <td className="px-2 py-1.5 border border-gray-200 dark:border-white/[0.07] w-24">
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number" min={0}
                                        max={newItem.discountType === "percent" ? 100 : undefined}
                                        step="0.01" placeholder="0"
                                        value={newItem.discountValue}
                                        onChange={(e) => setNewItem((p) => ({ ...p, discountValue: e.target.value }))}
                                        className="w-full min-w-0 bg-transparent border-0 px-0 py-0.5 text-xs text-right tabular-nums text-gray-800 dark:text-white placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-violet-400/50 focus:rounded-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setNewItem((p) => ({ ...p, discountType: p.discountType === "amount" ? "percent" : "amount" }))}
                                        className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300 hover:bg-fuchsia-200 dark:hover:bg-fuchsia-500/30 transition shrink-0"
                                        title={newItem.discountType === "percent" ? "Cambiar a descuento en $" : "Cambiar a descuento en %"}
                                      >
                                        {newItem.discountType === "percent" ? "%" : "$"}
                                      </button>
                                    </div>
                                  </td>
                                  {/* Subtotal (calculado) */}
                                  <td className="px-2.5 py-1.5 border border-gray-200 dark:border-white/[0.07] text-right tabular-nums text-gray-700 dark:text-gray-300">
                                    {(() => {
                                      const qty = Number(newItem.quantity) || 0;
                                      const unit = Number(newItem.unitCost) || 0;
                                      const pre = qty * unit;
                                      const dVal = Number(newItem.discountValue) || 0;
                                      const dAmt = newItem.discountType === "percent"
                                        ? pre * Math.min(100, Math.max(0, dVal)) / 100
                                        : Math.min(pre, Math.max(0, dVal));
                                      return fmtMoney(pre - dAmt);
                                    })()}
                                  </td>
                                  {/* IVA (calculado) */}
                                  <td className="px-2.5 py-1.5 border border-gray-200 dark:border-white/[0.07] text-right tabular-nums text-gray-700 dark:text-gray-300">
                                    {(() => {
                                      const qty = Number(newItem.quantity) || 0;
                                      const unit = Number(newItem.unitCost) || 0;
                                      const pre = qty * unit;
                                      const dVal = Number(newItem.discountValue) || 0;
                                      const dAmt = newItem.discountType === "percent"
                                        ? pre * Math.min(100, Math.max(0, dVal)) / 100
                                        : Math.min(pre, Math.max(0, dVal));
                                      const sub = pre - dAmt;
                                      const iva = sub * ivaPercentDraft / 100;
                                      return fmtMoney(iva);
                                    })()}
                                  </td>
                                  {/* Total (calculado) */}
                                  <td className="px-2.5 py-1.5 border border-gray-200 dark:border-white/[0.07] text-right tabular-nums font-bold text-violet-700 dark:text-violet-300">
                                    {(() => {
                                      const qty = Number(newItem.quantity) || 0;
                                      const unit = Number(newItem.unitCost) || 0;
                                      const pre = qty * unit;
                                      const dVal = Number(newItem.discountValue) || 0;
                                      const dAmt = newItem.discountType === "percent"
                                        ? pre * Math.min(100, Math.max(0, dVal)) / 100
                                        : Math.min(pre, Math.max(0, dVal));
                                      const sub = pre - dAmt;
                                      const iva = sub * ivaPercentDraft / 100;
                                      return fmtMoney(sub + iva);
                                    })()}
                                  </td>
                                  {/* (botón Agregar está arriba en el header) */}
                                  {isProceso && <td className="px-1.5 py-1.5 border border-gray-200 dark:border-white/[0.07]" />}
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Subtotal / Descuento / IVA / Total — igual al modal, debajo de la tabla.
                          v2: usa `aggregateTotals` con los drafts actuales (no con los
                          valores del backend) para que refleje los cambios en vivo.
                          `aggregateTotals` SIEMPRE está en sync con los Subtotal/IVA/
                          Total de cada fila porque cada fila usa la misma lib. */}
                      {item.items && item.items.length > 0 && (() => {
                        // Mezclar: para los items con draft, usar el draft. Para los
                        // items sin draft (recién hidratándose), usar el item crudo.
                        const itemsForAgg = item.items.map((it) => {
                          const d = editingItems[it.id];
                          return d ?? {
                            quantity: it.quantity, unitCost: it.unitCost,
                            discountValue: it.discountValue ?? 0, discountType: it.discountType ?? "amount",
                            ivaPercent: it.ivaPercent ?? 15,
                          };
                        });
                        const agg = aggregateTotals(itemsForAgg);
                        const itemsTot = agg.grandTotal;
                        return (
                          <div className="rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-4 py-3 space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
                              <span className="tabular-nums text-gray-800 dark:text-white">{fmtMoney(agg.grandSubtotal)}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-500 dark:text-gray-400">Descuento</span>
                              <span className="tabular-nums text-rose-600 dark:text-rose-400">
                                - {fmtMoney(agg.totalDiscount)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-500 dark:text-gray-400">IVA ({ivaPercentDraft}%)</span>
                              <span className="tabular-nums text-gray-800 dark:text-white">{fmtMoney(agg.grandIva)}</span>
                            </div>
                            <div className="flex items-center justify-between border-t border-gray-200 dark:border-white/[0.06] pt-1.5 mt-1.5">
                              <span className="text-sm font-bold text-gray-800 dark:text-white">Total</span>
                              <span className="text-base font-bold tabular-nums text-violet-700 dark:text-violet-300">{fmtMoney(itemsTot)}</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Agregar nota */}
                      {isProceso && (
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
                      )}
                    </div>
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
                          {/* jul 2026 — Foto del adicional: file input real, NO URL text.
                              Antes este campo era un <input placeholder="URL foto (opcional)">
                              que obligaba al operador a subir el archivo por fuera y pegar
                              la URL. Ahora: file picker → upload a /api/upload/photos →
                              URL guardada en newExtra.photoUrl. Preview con miniatura + botón
                              para cambiar/quitar. */}
                          <div className="col-span-2 flex items-center gap-2">
                            {newExtra.photoUrl ? (
                              <>
                                <a
                                  href={newExtra.photoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.04]"
                                  title="Ver foto"
                                >
                                  {/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(newExtra.photoUrl) ? (
                                    <img src={newExtra.photoUrl} alt="Foto" className="h-full w-full object-cover" />
                                  ) : (
                                    <FileText size={16} className="text-gray-400" />
                                  )}
                                </a>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[10px] text-gray-500 dark:text-gray-400">
                                    {newExtra.photoUrl.split("/").pop()}
                                  </p>
                                  <div className="mt-0.5 flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={uploadingExtraPhoto}
                                      onClick={() => extraPhotoInputRef.current?.click()}
                                      className="text-[10px] font-semibold text-sky-700 dark:text-sky-300 hover:underline disabled:opacity-50"
                                    >
                                      Cambiar
                                    </button>
                                    <span className="text-[10px] text-gray-300 dark:text-gray-600">·</span>
                                    <button
                                      type="button"
                                      disabled={uploadingExtraPhoto}
                                      onClick={() => setNewExtra((p) => ({ ...p, photoUrl: "" }))}
                                      className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
                                    >
                                      Quitar
                                    </button>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={uploadingExtraPhoto}
                                onClick={() => extraPhotoInputRef.current?.click()}
                                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 dark:border-white/[0.12] bg-white dark:bg-white/[0.02] px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition disabled:opacity-50"
                              >
                                {uploadingExtraPhoto ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Camera size={12} />
                                )}
                                {uploadingExtraPhoto ? "Subiendo…" : "Subir foto (opcional)"}
                              </button>
                            )}
                            <input
                              ref={extraPhotoInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void handleExtraPhotoFile(file);
                              }}
                            />
                          </div>
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