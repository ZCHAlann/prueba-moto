// hooks/useMaintenancesV2.ts
// Hooks para el nuevo modelo unificado de mantenimientos (0006).

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

export type MaintenanceType   = 'Preventivo' | 'Correctivo' | 'Programado';
export type MaintenanceStatus = 'Programado' | 'En curso' | 'PendienteAtencion' | 'Completado' | 'Cancelado';
export type MaintenanceCategory = 'Primordial:Bombas' | 'Primordial:Motores' | 'Aceite:Cambio' | 'Aceite:Inventario' | 'Otro';
export type CadenceKind = 'none' | 'weekly' | 'days' | 'monthly' | 'km_based';

export interface MaintenanceItem {
  id: string;
  maintenanceId: string;
  supplierId: string | null;
  supplierName: string | null;
  name: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
}

export interface Maintenance {
  id: string;
  companyId: string;
  assetId: string;
  assetName: string | null;
  assetPlate: string | null;
  workshopId: string | null;
  workshopName: string | null;
  type: MaintenanceType;
  status: MaintenanceStatus;
  category: MaintenanceCategory;
  title: string | null;
  description: string | null;
  odometerKm: number | null;
  cadenceKind: CadenceKind;
  cadenceValue: number | null;
  nextTriggerKm: number | null;
  scheduledFor: string;
  executedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  totalCost: number;
  parentId: string | null;
  createdBy: string | null;
  completedBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: MaintenanceItem[];
}

export interface MaintenanceItemInput {
  supplierId?: string | null;
  name: string;
  quantity: number;
  unitCost: number;
}

export interface MaintenanceInput {
  assetId: string;
  workshopId?: string | null;
  type?: MaintenanceType;
  status?: MaintenanceStatus;
  category?: MaintenanceCategory;
  title: string;
  description?: string | null;
  odometerKm?: number | null;
  cadenceKind?: CadenceKind;
  cadenceValue?: number | null;
  nextTriggerKm?: number | null;
  scheduledFor: string;
  notes?: string | null;
  items?: MaintenanceItemInput[];
}

export interface ListFilters {
  status?:   MaintenanceStatus;
  type?:     MaintenanceType;
  category?: MaintenanceCategory;
  workshopId?: string;
  assetId?:   string;
  from?:      string;
  to?:        string;
  q?:         string;
}

export interface AgendaRange { from: string; to: string; }

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useMaintenancesList(filters: ListFilters = {}) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['maintenances', companyId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, String(v)); });
      const qs = params.toString();
      const res = await jsonFetch<{ data: Maintenance[]; total: number }>(
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

export function useCompleteMaintenance() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: { completedAt?: string; odometerKm?: number; notes?: string; items?: MaintenanceItemInput[] } }) => {
      return jsonFetch<Maintenance & { rescheduledId: string | null }>(`/api/company/${companyId}/maintenances/${id}/complete`, {
        method: 'POST', body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenances-agenda'] });
      qc.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });
}

export function useCancelMaintenance() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return jsonFetch<Maintenance>(`/api/company/${companyId}/maintenances/${id}/cancel`, {
        method: 'POST', body: JSON.stringify({}),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenances'] });
      qc.invalidateQueries({ queryKey: ['maintenances-agenda'] });
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
