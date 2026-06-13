// hooks/useSuppliers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';

export interface Supplier {
  id: string;
  companyId: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  nit: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierInput {
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
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

export function useSuppliersList(q?: string) {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['suppliers', companyId, q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      const qs = params.toString();
      return jsonFetch<{ data: Supplier[]; total: number }>(`/api/company/${companyId}/suppliers${qs ? `?${qs}` : ''}`);
    },
    enabled: !!companyId,
  });
}

export function useCreateSupplier() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SupplierInput) =>
      jsonFetch<Supplier>(`/api/company/${companyId}/suppliers`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useUpdateSupplier() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<SupplierInput> }) =>
      jsonFetch<Supplier>(`/api/company/${companyId}/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useDeleteSupplier() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      jsonFetch<{ ok: boolean }>(`/api/company/${companyId}/suppliers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}
