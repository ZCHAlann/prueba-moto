// hooks/useMaintenancesV2.ts
// Hooks para el modelo unificado de mantenimientos (v3 — con asignación,
// eventos / timeline, reprogramación, categorías custom, "En proceso").

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { compressIfImage, COMPRESS_OPTS_EVIDENCE } from '../lib/mediaCompress';

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type MaintenanceType     = 'Correctivo' | 'Programado' | 'Lavada';
export type MaintenanceStatus = 'Programado' | 'En proceso' | 'Completado' | 'Correccion' | 'Atrasado';
export type CadenceKind         = 'none' | 'weekly' | 'days' | 'monthly' | 'km_based';

export type MaintenanceEventKind =
  | 'created'
  | 'assigned'
  | 'reassigned'
  | 'taken'
  | 'started'
  | 'item_added'
  | 'note_added'
  | 'photo_uploaded'
  | 'cancelled'
  | 'finalized'
  | 'viewed';

export interface MaintenanceAttachmentItem {
  description: string;
  quantity:    number;
  unitPrice:   number;
  subtotal:    number;
}

export interface MaintenanceAttachment {
  url:        string;
  label:      string;
  uploadedAt?: string;
  // jul 2026 — metadata rica por adjunto para que el ledger de facturas
  // (lib/invoices-sync.ts) pueda crear / mantener filas en
  // `company_invoices` por cada attachment. Todos opcionales: si no
  // vienen, el adjunto se considera evidencia sin factura asociada.
  /** Identificador interno del attachment dentro del mantenimiento
   *  (slugify del label + index). Lo usa el ledger para upsert sin
   *  duplicados cuando el usuario edita el mantenimiento. */
  key?:               string;
  /** Categoría lógica del adjunto. Solo las categorías de mantenimiento
   *  aplican aca (combustible/peaje son módulos de origen independientes,
   *  no categorías de attachment). Backend schema `attachmentSchema`. */
  kind?:              "repuesto" | "mano_obra" | "lavada" | "servicio" | "otro" | null;
  /** Monto del comprobante (USD). Null si no aplica. */
  amount?:            number | null;
  /** Número de factura / comprobante. Vacío o ausente = no factura. */
  invoiceNumber?:     string | null;
  /** jul 2026 — FK lógica al supplier del catálogo (string para IDs serializados). */
  supplierId?:        string | number | null;
  /** jul 2026 — items desglosados del comprobante. Persistidos en
   *  `company_invoices.items` (jsonb). Lo usa el PDF del comprobante
   *  para mostrar las líneas, y los items del mantenimiento en el form
   *  para agruparse por factura via `attachmentKey`. */
  items?:             MaintenanceAttachmentItem[];
}

export interface MaintenanceItem {
  id:           string;
  maintenanceId: string;
  supplierId:   string | null;
  supplierName: string | null;
  name:         string;
  quantity:     number;
  unitCost:     number;
  subtotal:     number;
  photoUrl:     string | null;
  // jul 2026 — Opcion A: FK logica al attachment (factura) al que pertenece.
  attachmentKey?: string | null;
}

export interface MaintenanceEvent {
  id:             string;
  maintenanceId:  string;
  kind:           MaintenanceEventKind;
  actorUserId:    string | null;
  actorName:      string | null;
  payload:        Record<string, unknown>;
  createdAt:      string;
}

export interface Maintenance {
  id:            string;
  companyId:     string;
  assetId:       string;
  assetName:     string | null;
  assetPlate:    string | null;
  workshopId:    string | null;
  workshopName:  string | null;
  type:          MaintenanceType;
  status:        MaintenanceStatus;
  category:      string;                   // string libre (acepta customs)
  title:         string | null;
  description:   string | null;
  odometerKm:    number | null;
  // v3.1: mano de obra
  laborCost:     number;
  /** IVA porcentual aplicado (default 15 para Ecuador) */
  ivaPercent:    number;
  cadenceKind:   CadenceKind;
  cadenceValue:  number | null;
  nextTriggerKm: number | null;
  scheduledFor:  string;
  executedAt:    string | null;
  completedAt:   string | null;
  notes:         string | null;
  totalCost:     number;
  // v3.1: campos de lavada
  carwashLocation: string | null;
  carwashProvider: string | null;
  carwashNotes:    string | null;
  /** Costo explícito del servicio de lavada (lo que digitó el admin al crear). */
  carwashTotal:    number;
  /** Adjuntos: facturas, fotos de evidencia, etc. (subidos mientras
   *  el mantenimiento está "En proceso" o "Completado"). */
  attachments:     MaintenanceAttachment[];
  parentId:      string | null;
  createdBy:     string | null;
  completedBy:   string | null;
  // v3
  assignedUserId:   string | null;
  assignedUserName: string | null;
  takenAt:          string | null;
  isReprogrammed:   boolean;
  reprogramReason:  string | null;
  reprogrammedAt:   string | null;
  reprogramCount:   number;
  createdAt:     string;
  updatedAt:     string;
  items:         MaintenanceItem[];
  events:        MaintenanceEvent[];
  correctionReason: string | null;
  correctionRequestedAt: string | null;
  /** Atajo de presentación: derivado de `status === 'Atrasado'`. El backend
   *  lo calcula comparando `scheduledFor` contra la fecha actual en el
   *  response de la API; el frontend puede tolerar que llegue o no el
   *  flag explícito y caer al status. Ver `isMaintenanceOverdue()`. */
  isOverdue?: boolean;
  /** jun 2026 — FK a la última solicitud de reautorización aprobada
   *  que reabrió este mantenimiento. Permite trazabilidad sin releer
   *  la tabla de eventos. NULL si nunca fue reautorizado. */
  lastReauthorizationId?: string | null;
  /** jun 2026 — ISO del momento en que se aprobó esa reautorización
   *  (`updated_at` de la fila del mantenimiento al aprobar). El backend
   *  lo expone junto a `lastReauthorizationId` para que el banner del
   *  drawer pueda mostrar la fecha sin hacer una segunda query. */
  lastReauthorizationAt?: string | null;
}

/** Acción solicitada en una reautorización:
 *  - 'open'       → reabrir (scheduledFor=HOY, status='Programado').
 *  - 'reschedule' → reprogramar (el admin elige la nueva fecha al aprobar).
 */
export type MaintenanceReauthAction = "open" | "reschedule";

/** Estados de una solicitud de reautorización (jun 2026). */
export type MaintenanceReauthStatus = "Pendiente" | "Aprobada" | "Rechazada";

/** Una fila de `company_maintenance_reauthorizations` tal como llega al
 *  frontend (ids serializados como 'reauth-N'). */
export interface MaintenanceReauthorization {
  id:                       string;
  companyId:                string;
  maintenanceId:            string;
  /** Snapshot al pedir: status original (siempre 'Atrasado' al pedir). */
  maintenanceStatus:        string;
  maintenanceScheduledFor:  string;
  action:                   MaintenanceReauthAction;
  status:                   MaintenanceReauthStatus;
  reason:                   string;
  proposedScheduledFor:     string | null;
  requestedByUserId:        string | null;
  requestedByName:          string | null;
  requestedByRole:          string | null;
  decidedByUserId:          string | null;
  decidedByName:            string | null;
  decisionNotes:            string | null;
  decidedAt:                string | null;
  appliedScheduledFor:      string | null;
  createdAt:                string;
  updatedAt:                string;
}

/** Helper local: devuelve si un mantenimiento está atrasado. Prefiere el
 *  flag explícito que mande el backend, pero tolera que solo venga el
 *  status. Útil para mantener la UI consistente mientras la migración a
 *  `status: 'Atrasado'` se completa. */
export function isMaintenanceOverdue(m: Pick<Maintenance, 'status' | 'isOverdue'>): boolean {
  return m.isOverdue === true || m.status === 'Atrasado';
}

export interface CarwashExtra {
  id:            string;
  maintenanceId: string;
  name:          string;
  quantity:      number;
  unitCost:      number;
  subtotal:      number;
  photoUrl:      string | null;
  createdAt:     string;
}

export interface CarwashExtraInput {
  name:     string;
  quantity: number;
  unitCost: number;
  photoUrl?: string | null;
}

export interface CarwashPhoto {
  id:            string;
  maintenanceId: string;
  photoUrl:      string;
  caption:       string | null;
  uploadedBy:    string | null;
  uploadedByName: string | null;
  createdAt:     string;
}

export interface CarwashPhotoInput {
  /**
   * Archivo a subir. El hook se encarga de hacer POST al endpoint
   * `/upload/photos?category=maintenance&companyId=N` (separado por
   * empresa en el filesystem) y luego persistir la URL resultante
   * con `POST /company/:id/maintenances/:mid/carwash-photos`.
   */
  file: File;
  caption?: string | null;
}

export interface MaintenanceItemInput {
  supplierId?: string | null;
  name:        string;
  quantity:    number;
  unitCost:    number;
  photoUrl?:   string | null;
  // jul 2026 — Opción A: vinculo lógico a la factura del array `attachments`.
  attachmentKey?: string | null;
}

export interface MaintenanceInput {
  assetId:        string;
  workshopId?:    string | null;
  type?:          MaintenanceType;
  status?:        MaintenanceStatus;
  category?:      string;
  categoryCustomId?: string | null;
  title:          string;
  description?:   string | null;
  odometerKm?:    number | null;
  // v3.1: mano de obra
  laborCost?:      number;
  /** IVA porcentual aplicado (default 15 para Ecuador) */
  ivaPercent?:     number;
  cadenceKind?:   CadenceKind;
  cadenceValue?:  number | null;
  nextTriggerKm?: number | null;
  scheduledFor:   string;
  notes?:         string | null;
  items?:         MaintenanceItemInput[];
  /** Adjuntos: facturas, fotos de evidencia, etc. */
  attachments?:   MaintenanceAttachment[];
  // v3.1: campos de lavada
  carwashLocation?: string | null;
  carwashProvider?: string | null;
  carwashNotes?:    string | null;
  carwashTotal?:    number;
  assignedUserId?: string | null;
}

export interface ListFilters {
  status?:     MaintenanceStatus;
  type?:       MaintenanceType;
  category?:   string;
  workshopId?: string;
  assetId?:    string;
  from?:       string;
  to?:         string;
  q?:          string;
  mine?:       'me' | 'all';
  scope?:      'mine' | 'all';
  /** Track A: paginación server-side. */
  page?:       number;
  pageSize?:   number;
}

export interface AgendaRange { from: string; to: string; }

// ─── Categorías ───────────────────────────────────────────────────────────────

export interface MaintenanceCategory {
  id:         string;
  companyId:  string;
  key:        string;
  label:      string;
  shortLabel: string | null;
  color:      string;
  icon:       string;
  isSystem:   boolean;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useMaintenancesList(filters: ListFilters = {}, options?: { enabled?: boolean }) {
  const { companyId } = useAuth();
  const enabled = (options?.enabled ?? true) && !!companyId;
  return useQuery({
    queryKey: ['maintenances', companyId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
      });
      const qs = params.toString();
      const res = await jsonFetch<{
        data: Maintenance[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
        assets?: any[];
        workshops?: any[];
        suppliers?: any[];
      }>(
        `/api/company/${companyId}/maintenances${qs ? `?${qs}` : ''}`,
      );
      return res;
    },
    enabled,
  });
}

// ─── Upload genérico de adjunto (factura / foto de evidencia) ────────────
// Usa el endpoint /api/upload/maintenance-evidence que ya valida mimetype
// + extensión en el backend.
export async function uploadMaintenanceAttachment(
  file: File,
  companyId: number,
): Promise<string> {
  // Validación client-side rápida (mismo set que combustible)
  const ALLOWED = new Set([
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "image/heic", "image/heif", "application/pdf",
  ]);
  if (!ALLOWED.has(file.type)) {
    throw new Error(`Tipo de archivo no permitido: ${file.type || "(vacío)"}`);
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("El archivo supera el tamaño máximo permitido (10 MB)");
  }

  const toUpload = await compressIfImage(file, COMPRESS_OPTS_EVIDENCE);
  const fd = new FormData();
  fd.append("files", toUpload);
  const res = await fetch(
    `/api/upload/maintenance-evidence?companyId=${companyId}`,
    { method: "POST", body: fd, credentials: "include" },
  );
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.clone().json();
      if (j?.error) msg = j.error;
    } catch { /* ignore */ }
    throw new Error(`Upload adjunto: ${msg}`);
  }
  const json = await res.json();
  // El endpoint devuelve `{ urls: [...] }` o `{ urls: [{url, type, name}] }`
  const first = Array.isArray(json.urls) ? json.urls[0] : null;
  const url = typeof first === "string" ? first : first?.url;
  if (!url) throw new Error("Upload adjunto: respuesta sin URL");
  return url;
}

export function useMaintenanceAgenda(range: AgendaRange) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['maintenances-agenda', companyId, range],
    queryFn: async () => {
      const res = await jsonFetch<{ data: Maintenance[]; total: number }>(
        `/api/company/${companyId}/maintenances/agenda?from=${range.from}&to=${range.to}`,
      );
      return res;
    },
    enabled: !!companyId,
  });
}

export function useMaintenance(id?: string) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['maintenance', companyId, id],
    queryFn: async () => {
      const res = await jsonFetch<Maintenance>(`/api/company/${companyId}/maintenances/${id}`);
      return res;
    },
    enabled: !!companyId && !!id,
  });
}

export function useCreateMaintenance() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: MaintenanceInput) => {
      return jsonFetch<Maintenance>(`/api/company/${companyId}/maintenances`, {
        method: 'POST', body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenances-agenda'] });
    },
  });
}

export function useUpdateMaintenance() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<MaintenanceInput> }) => {
      return jsonFetch<Maintenance>(`/api/company/${companyId}/maintenances/${id}`, {
        method: 'PUT', body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenances-agenda'] });
      qc.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });
}

/** Operador toma un mantenimiento Programado/Corrección disponible o
 *  propio → queda asignado a él, SIN cambiar el estado. */
export function useTakeMaintenance() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return jsonFetch<{ ok: boolean; id: string; status: string; assignedUserId: string }>(
        `/api/company/${companyId}/maintenances/${id}/take`,
        { method: 'POST' },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });
}

/** Operador/admin inicia un mantenimiento ya asignado: pasa a "En proceso". */
export function useStartMaintenance() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return jsonFetch<{ ok: boolean; id: string; status: string }>(
        `/api/company/${companyId}/maintenances/${id}/start`,
        { method: 'POST' },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      qc.invalidateQueries({ queryKey: ['maintenances-agenda'] });
    },
  });
}

/** Admin/supervisor asigna un mantenimiento a un usuario específico. */
export function useAssignMaintenance() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      return jsonFetch<{ ok: boolean; id: string; assignedUserId: string }>(
        `/api/company/${companyId}/maintenances/${id}/assign`,
        { method: 'POST', body: JSON.stringify({ userId }) },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });
}

/**
 * Edita fecha de ejecución y/o finalización de un mantenimiento.
 */
export function useUpdateMaintenanceDates() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, executedAt, completedAt,
    }: { id: string; executedAt?: string | null; completedAt?: string | null }) => {
      return jsonFetch<{ ok: boolean; id: string; executedAt: string | null; completedAt: string | null }>(
        `/api/company/${companyId}/maintenances/${id}/dates`,
        { method: 'PATCH', body: JSON.stringify({ executedAt, completedAt }) },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      qc.invalidateQueries({ queryKey: ['maintenances-agenda'] });
    },
  });
}

/** Operador / admin / supervisor cierran un mantenimiento (status = Completado). */
export function useFinalizeMaintenance() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return jsonFetch<{ ok: boolean; id: string; status: string }>(
        `/api/company/${companyId}/maintenances/${id}/finalize`,
        { method: 'POST' },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      qc.invalidateQueries({ queryKey: ['maintenances-agenda'] });
    },
  });
}

/** Cancelar y reprogramar: vuelve a Programado, mantiene timeline, borra items
 *  (a menos que `keepItems` sea true — en ese caso conserva los repuestos, fotos y
 *  notas que ya estuvieran cargados). */
export function useCancelRescheduleMaintenance() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, newScheduledFor, reason, keepItems,
    }: {
      id: string;
      newScheduledFor: string;
      reason: string;
      /** Si true, conservar repuestos / fotos / notas que ya estén cargados
       *  en el mantenimiento en lugar de borrarlos en la reprogramación. */
      keepItems?: boolean;
    }) => {
      return jsonFetch<{ ok: boolean; id: string; status: string; isReprogrammed: boolean }>(
        `/api/company/${companyId}/maintenances/${id}/cancel-reschedule`,
        { method: 'POST', body: JSON.stringify({ newScheduledFor, reason, keepItems: !!keepItems }) },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      qc.invalidateQueries({ queryKey: ['maintenances-agenda'] });
    },
  });
}

export function useRequestCorrection() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, reason, newScheduledFor, keepItems,
    }: {
      id: string;
      reason: string;
      newScheduledFor?: string | null;
      /** Si true, conservar repuestos / fotos / notas ya cargados. */
      keepItems?: boolean;
    }) => {
      return jsonFetch<{ ok: boolean; id: string; status: string }>(
        `/api/company/${companyId}/maintenances/${id}/request-correction`,
        { method: 'POST', body: JSON.stringify({
          reason,
          newScheduledFor: newScheduledFor ?? null,
          keepItems: !!keepItems,
        }) },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      qc.invalidateQueries({ queryKey: ['maintenances-agenda'] });
    },
  });
}

/** Reautoriza un mantenimiento "Atrasado" de tipo Programado: alguien
 *  DISTINTO del asignado/creador (típicamente un superior) confirma que
 *  el mantenimiento sigue autorizado para ejecutarse aunque haya pasado
 *  la fecha prevista. El backend bloquea con 403 si quien llama es el
 *  propio asignado/creador, aunque tenga el permiso — es una regla dura,
 *  no un check de UI.
 *
 *  Requiere el permiso independiente `mantenimiento.reautorizaciones.editar`
 *  (no se hereda de `execution` ni de `records`).
 *
 *  Efecto: status pasa de 'Atrasado' a 'Programado' (el estado previo al
 *  vencimiento) — NO a 'En proceso'. El backend registra el evento
 *  "reauthorized" en la línea de tiempo con el motivo opcional. NO aplica
 *  a Correctivo/Lavada. */
export function useReauthorizeMaintenance() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string | null }) => {
      return jsonFetch<{ ok: boolean; status: string }>(
        `/api/company/${companyId}/maintenances/${id}/reauthorize`,
        { method: 'POST', body: JSON.stringify({ reason: reason ?? null }) },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      qc.invalidateQueries({ queryKey: ['maintenances-agenda'] });
    },
  });
}

// ─── jun 2026 — Flujo de reautorización (request → approve/deny) ──────────────

/** Operador/conductor pide una reautorización. Solo válido si el mantenimiento
 *  está 'Atrasado' + 'Programado' y él es asignado o creador. */
export function useRequestMaintenanceReauth() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      action: MaintenanceReauthAction;
      reason: string;
      proposedScheduledFor?: string | null;
    }) => {
      return jsonFetch<MaintenanceReauthorization>(
        `/api/company/${companyId}/maintenances/${input.id}/request-reauth`,
        {
          method: 'POST',
          body: JSON.stringify({
            action:               input.action,
            reason:               input.reason,
            proposedScheduledFor: input.proposedScheduledFor ?? null,
          }),
        },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-reauths'] });
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });
}

/** Bandeja global: lista solicitudes (default 'Pendiente').
 *  Backend ya filtra por scope: full ve TODAS, operador solo las suyas. */
export function useMaintenanceReauths(opts?: { status?: MaintenanceReauthStatus | 'all' }) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['maintenance-reauths', companyId, opts?.status ?? 'Pendiente'],
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set('status', opts?.status ?? 'Pendiente');
      const res = await jsonFetch<MaintenanceReauthorization[]>(
        `/api/company/${companyId}/maintenances/reauths?${qs.toString()}`,
      );
      return res ?? [];
    },
    enabled: !!companyId,
    refetchInterval: 30_000, // la bandeja se refresca sola cada 30s
  });
}

/** Bandeja por mantenimiento (historial). */
export function useMaintenanceReauthsFor(maintenanceId: string | null) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['maintenance-reauths', companyId, 'by-maint', maintenanceId],
    queryFn: async () => {
      if (!maintenanceId) return [];
      const res = await jsonFetch<MaintenanceReauthorization[]>(
        `/api/company/${companyId}/maintenances/${maintenanceId}/reauths`,
      );
      return res ?? [];
    },
    enabled: !!companyId && !!maintenanceId,
  });
}

/** Admin/supervisor aprueba. action de la solicitud se respeta:
 *  'open' → backend fuerza scheduledFor=HOY.
 *  'reschedule' → backend usa newScheduledFor o la propuesta. */
export function useApproveMaintenanceReauth() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      maintenanceId: string;
      reauthId: string;
      newScheduledFor?: string | null;
      decisionNotes?: string | null;
    }) => {
      return jsonFetch<MaintenanceReauthorization>(
        `/api/company/${companyId}/maintenances/${input.maintenanceId}/approve-reauth`,
        {
          method: 'POST',
          body: JSON.stringify({
            reauthId:         input.reauthId,
            newScheduledFor:  input.newScheduledFor ?? null,
            decisionNotes:    input.decisionNotes ?? null,
          }),
        },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-reauths'] });
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      qc.invalidateQueries({ queryKey: ['maintenances-agenda'] });
    },
  });
}

/** Admin/supervisor rechaza. decisionNotes obligatorio (regla de UI y backend). */
export function useDenyMaintenanceReauth() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      maintenanceId: string;
      reauthId: string;
      decisionNotes: string;
    }) => {
      return jsonFetch<MaintenanceReauthorization>(
        `/api/company/${companyId}/maintenances/${input.maintenanceId}/deny-reauth`,
        {
          method: 'POST',
          body: JSON.stringify({
            reauthId:      input.reauthId,
            decisionNotes: input.decisionNotes,
          }),
        },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-reauths'] });
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });
}

/** Agrega una nota al mantenimiento (queda en la línea de tiempo). */
export function useAddMaintenanceNote() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      return jsonFetch<{ ok: boolean }>(
        `/api/company/${companyId}/maintenances/${id}/notes`,
        { method: 'POST', body: JSON.stringify({ text }) },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });
}

/** Agrega items (repuestos) al mantenimiento en estado "En proceso". */
export function useAddMaintenanceItems() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, items }: { id: string; items: MaintenanceItemInput[] }) => {
      return jsonFetch<{ ok: boolean }>(
        `/api/company/${companyId}/maintenances/${id}/items`,
        { method: 'POST', body: JSON.stringify({ items }) },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      qc.invalidateQueries({ queryKey: ['maintenances'] });
    },
  });
}

// ─── Lavada: adicionales (items extra) y fotos ───────────────────────────────

export function useCarwashExtras(maintenanceId: string | null) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['carwash-extras', companyId, maintenanceId],
    queryFn: async () => {
      const res = await jsonFetch<{ data: CarwashExtra[] }>(
        `/api/company/${companyId}/maintenances/${maintenanceId}/carwash-extras`,
      );
      return res.data ?? [];
    },
    enabled: !!companyId && !!maintenanceId,
  });
}

export function useAddCarwashExtras() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, extras }: { id: string; extras: CarwashExtraInput[] }) => {
      return jsonFetch<{ data: CarwashExtra[] }>(
        `/api/company/${companyId}/maintenances/${id}/carwash-extras`,
        { method: 'POST', body: JSON.stringify({ extras }) },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['carwash-extras'] });
    },
  });
}

export function useCarwashPhotos(maintenanceId: string | null) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['carwash-photos', companyId, maintenanceId],
    queryFn: async () => {
      const res = await jsonFetch<{ data: CarwashPhoto[] }>(
        `/api/company/${companyId}/maintenances/${maintenanceId}/carwash-photos`,
      );
      return res.data ?? [];
    },
    enabled: !!companyId && !!maintenanceId,
  });
}

export function useAddCarwashPhotos() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, photos }: { id: string; photos: CarwashPhotoInput[] }) => {
      // 1) Subir cada File al endpoint genérico de uploads. La URL final
      //    queda separada por empresa: /uploads/maintenance/<companyId>/<file>.
      const uploaded: { url: string; caption: string | null }[] = [];
      for (const p of photos) {
        const toUpload = await compressIfImage(p.file, COMPRESS_OPTS_EVIDENCE);
        const fd = new FormData();
        fd.append('photos', toUpload);
        const upRes = await fetch(
          `/api/upload/photos?category=maintenance&companyId=${encodeURIComponent(String(companyId))}`,
          { method: 'POST', body: fd, credentials: 'include' },
        );
        if (!upRes.ok) {
          const body = await upRes.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Error subiendo foto (${upRes.status})`);
        }
        const upData = await upRes.json() as { urls?: string[] };
        const url = upData.urls?.[0];
        if (!url) throw new Error('El servidor no devolvió la URL de la foto.');
        // jul 2026 — el backend espera `photoUrl` en carwash-photos (no `url`)
        uploaded.push({ photoUrl: url, caption: p.caption ?? null });
      }
      // 2) Persistir cada URL en la tabla de carwash-photos de la lavada.
      return jsonFetch<{ data: CarwashPhoto[] }>(
        `/api/company/${companyId}/maintenances/${id}/carwash-photos`,
        { method: 'POST', body: JSON.stringify({ photos: uploaded }) },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['carwash-photos'] });
    },
  });
}

export function useDeleteMaintenance() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return jsonFetch<{ ok: boolean }>(`/api/company/${companyId}/maintenances/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenances-agenda'] });
    },
  });
}

// ─── Categorías custom ────────────────────────────────────────────────────────

export function useMaintenanceCategories() {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['maintenance-categories', companyId],
    queryFn: async () => {
      const res = await jsonFetch<{ data: MaintenanceCategory[] }>(
        `/api/company/${companyId}/maintenances/categories`,
      );
      return res.data ?? [];
    },
    enabled: !!companyId,
  });
}

export function useCreateMaintenanceCategory() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { key: string; label: string; shortLabel?: string; color?: string; icon?: string }) => {
      return jsonFetch<MaintenanceCategory>(
        `/api/company/${companyId}/maintenances/categories`,
        { method: 'POST', body: JSON.stringify(body) },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-categories'] });
    },
  });
}

export function useDeleteMaintenanceCategory() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return jsonFetch<{ ok: boolean }>(
        `/api/company/${companyId}/maintenances/categories/${id}`,
        { method: 'DELETE' },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-categories'] });
    },
  });
}

// ─── Upload de foto de repuesto (consolidado) ───────────────────────────────
// Antes esta función estaba duplicada en MaintenanceFormModal.tsx y
// MaintenanceDetailDrawer.tsx. La centralizamos acá para que la compresión
// y la validación sean consistentes en ambos puntos de entrada.

/**
 * Sube la foto de un repuesto al endpoint `/api/upload/part-photos`.
 * Valida mimetype + tamaño en el cliente para fallar rápido con un mensaje
 * claro (el backend re-valida con whitelist y companyId).
 */
export async function uploadPartPhoto(
  file: File,
  companyId: string | number | undefined,
): Promise<string> {
  if (!companyId) {
    throw new Error('Sesión sin empresa: no se puede subir la foto.');
  }

  const ALLOWED = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'image/heic', 'image/heif', 'application/pdf',
  ]);
  if (!ALLOWED.has(file.type)) {
    throw new Error(`Tipo de archivo no permitido: ${file.type || '(vacío)'}`);
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('El archivo supera el tamaño máximo permitido (10 MB).');
  }

  const toUpload = await compressIfImage(file, COMPRESS_OPTS_EVIDENCE);

  const fd = new FormData();
  fd.append('photo', toUpload);
  const res = await fetch(`/api/upload/part-photos?companyId=${companyId}`, {
    method: 'POST',
    body: fd,
    credentials: 'include',
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
  if (!json.url) throw new Error('Upload part-photo: respuesta sin URL');
  return json.url as string;
}