// hooks/useMaintenancesV2.ts
// Hooks para el modelo unificado de mantenimientos (v3 — con asignación,
// eventos / timeline, reprogramación, categorías custom, "En proceso").

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';

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

export type MaintenanceType     = 'Correctivo' | 'Programado';
export type MaintenanceStatus   = 'Programado' | 'En proceso' | 'Completado';
export type CadenceKind         = 'none' | 'weekly' | 'days' | 'monthly' | 'km_based';

export type MaintenanceEventKind =
  | 'created'
  | 'assigned'
  | 'reassigned'
  | 'taken'
  | 'item_added'
  | 'note_added'
  | 'photo_uploaded'
  | 'cancelled'
  | 'finalized'
  | 'viewed';

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
  cadenceKind:   CadenceKind;
  cadenceValue:  number | null;
  nextTriggerKm: number | null;
  scheduledFor:  string;
  executedAt:    string | null;
  completedAt:   string | null;
  notes:         string | null;
  totalCost:     number;
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
}

export interface MaintenanceItemInput {
  supplierId?: string | null;
  name:        string;
  quantity:    number;
  unitCost:    number;
  photoUrl?:   string | null;
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
  cadenceKind?:   CadenceKind;
  cadenceValue?:  number | null;
  nextTriggerKm?: number | null;
  scheduledFor:   string;
  notes?:         string | null;
  items?:         MaintenanceItemInput[];
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

export function useMaintenancesList(filters: ListFilters = {}) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['maintenances', companyId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, String(v)); });
      const qs = params.toString();
      const res = await jsonFetch<{ data: Maintenance[]; total: number; assets?: any[]; workshops?: any[]; suppliers?: any[] }>(
        `/api/company/${companyId}/maintenances${qs ? `?${qs}` : ''}`,
      );
      return res;
    },
    enabled: !!companyId,
  });
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

/** Operador toma un mantenimiento Programado disponible → pasa a "En proceso". */
export function useTakeMaintenance() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return jsonFetch<{ ok: boolean; id: string; status: string }>(
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

/** Cancelar y reprogramar: vuelve a Programado, mantiene timeline, borra items. */
export function useCancelRescheduleMaintenance() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, newScheduledFor, reason }: { id: string; newScheduledFor: string; reason: string }) => {
      return jsonFetch<{ ok: boolean; id: string; status: string; isReprogrammed: boolean }>(
        `/api/company/${companyId}/maintenances/${id}/cancel-reschedule`,
        { method: 'POST', body: JSON.stringify({ newScheduledFor, reason }) },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenance'] });
      qc.invalidateQueries({ queryKey: ['maintenances-agenda'] });
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
