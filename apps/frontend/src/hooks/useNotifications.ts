// hooks/useNotifications.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';

export type NotificationKind =
  | 'maintenance_due'
  | 'maintenance_scheduled'
  | 'maintenance_completed'
  | 'maintenance_overshoot_km'
  | 'workshop_assigned'
  | 'supplier_invoice'
  | 'system';

export interface Notification {
  id: string;
  companyId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
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

export function useNotifications(opts?: { unreadOnly?: boolean; scopeAll?: boolean; limit?: number }) {
  const { companyId } = useAuth();
  const unreadOnly = opts?.unreadOnly ?? false;
  const scopeAll   = opts?.scopeAll   ?? false;
  const limit      = opts?.limit      ?? 20;
  return useQuery({
    queryKey: ['notifications', companyId, { unreadOnly, scopeAll, limit }],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (unreadOnly) p.set('unreadOnly', 'true');
      if (scopeAll)   p.set('scope', 'all');
      p.set('limit', String(limit));
      return jsonFetch<{ data: Notification[]; total: number; scope: 'all' | 'self' }>(
        `/api/company/${companyId}/notifications?${p.toString()}`,
      );
    },
    enabled: !!companyId,
    refetchInterval: 30_000, // poll de respaldo
  });
}

export function useUnreadCount() {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['notifications-unread', companyId],
    queryFn: async () => jsonFetch<{ count: number }>(`/api/company/${companyId}/notifications/unread-count`),
    enabled: !!companyId,
    refetchInterval: 15_000,
  });
}

export function useMarkRead() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await jsonFetch<{ ok: boolean }>(`/api/company/${companyId}/notifications/${id}/read`, { method: 'PATCH' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });
}

export function useMarkAllRead() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      return jsonFetch<{ ok: boolean; updated: number }>(`/api/company/${companyId}/notifications/read-all`, { method: 'PATCH' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });
}

export function useRegisterDeviceToken() {
  const { companyId } = useAuth();
  return useMutation({
    mutationFn: async (body: { token: string; platform: 'android' | 'ios' | 'web' }) => {
      return jsonFetch<{ ok: boolean }>(`/api/company/${companyId}/notifications/devices`, {
        method: 'POST', body: JSON.stringify(body),
      });
    },
  });
}
