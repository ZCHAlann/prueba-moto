// hooks/useWorkshops.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';

export interface Workshop {
  id: string;
  companyId: string;
  name: string;
  address: string | null;
  phone: string | null;
  contactName: string | null;
  nit: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkshopInput {
  name: string;
  address?: string | null;
  phone?: string | null;
  contactName?: string | null;
  nit?: string | null;
  notes?: string | null;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return res.json() as Promise<T>;
}

export function useWorkshopsList(q?: string) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['workshops', companyId, q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      const qs = params.toString();
      return jsonFetch<{ data: Workshop[]; total: number }>(`/api/company/${companyId}/workshops${qs ? `?${qs}` : ''}`);
    },
    enabled: !!companyId,
  });
}

export function useCreateWorkshop() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: WorkshopInput) =>
      jsonFetch<Workshop>(`/api/company/${companyId}/workshops`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workshops'] }),
  });
}

export function useUpdateWorkshop() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<WorkshopInput> }) =>
      jsonFetch<Workshop>(`/api/company/${companyId}/workshops/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workshops'] }),
  });
}

export function useDeleteWorkshop() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      jsonFetch<{ ok: boolean }>(`/api/company/${companyId}/workshops/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workshops'] }),
  });
}
