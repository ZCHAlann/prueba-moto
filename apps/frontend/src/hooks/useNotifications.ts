// hooks/useNotifications.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';

// ─── Kinds soportados ─────────────────────────────────────────────────────
// Mantener sincronizado con `notification_kind_enum` del backend
// (db/schema/operational.ts) y con `NotificationKind` en
// lib/notification-service.ts.

export type NotificationKind =
  | 'maintenance_due'
  | 'maintenance_scheduled'
  | 'maintenance_completed'
  | 'maintenance_overshoot_km'
  | 'maintenance_created'
  | 'maintenance_assigned'
  | 'maintenance_taken'
  | 'maintenance_free_pool'
  | 'maintenance_status_changed'
  | 'checklist_created'
  | 'checklist_overdue'
  | 'checklist_reauth_requested'
  | 'checklist_reauth_decided'
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'user_inactive'
  | 'role_created'
  | 'role_updated'
  | 'role_deleted'
  | 'entity_created'
  | 'entity_updated'
  | 'entity_deleted'
  | 'alert_created'
  | 'alert_updated'
  | 'alert_closed'
  | 'anomaly_detected'
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
    // Sin polling — el WebSocket se encarga de invalidar en vivo.
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function useUnreadCount() {
  const { companyId } = useAuth();
  return useQuery({
    queryKey: ['notifications-unread', companyId],
    queryFn: async () => jsonFetch<{ count: number }>(`/api/company/${companyId}/notifications/unread-count`),
    enabled: !!companyId,
    // Sin polling — el WebSocket se encarga de invalidar en vivo.
    refetchOnWindowFocus: true,
    staleTime: 30_000,
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
    onError: (err) => {
      console.error('[useMarkRead] falló:', err);
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
    onError: (err) => {
      console.error('[useMarkAllRead] falló:', err);
    },
  });
}

// jun 2026 — borrar una notificación propia. Endpoint `DELETE /notifications/:id`
// añadido en backend, mismo criterio de auth que PATCH read (filtra por
// userId en el WHERE; si la fila no es del usuario, responde 404).
export function useDeleteNotification() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return jsonFetch<{ ok: boolean }>(`/api/company/${companyId}/notifications/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
    onError: (err) => {
      console.error('[useDeleteNotification] falló:', err);
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