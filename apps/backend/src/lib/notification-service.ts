// lib/notification-service.ts
//
// Servicio centralizado de notificaciones.
//
// Canales:
//   1) In-app  — siempre. Inserta en company_notifications.
//   2) WebSocket — siempre. Emite { type: 'notification', data } al destinatario.
//   3) FCM push — si hay tokens en company_device_tokens. Si firebase-admin no
//      está inicializado (sin credenciales), se ignora silenciosamente.
//
// Audiencia:
//   - `notify(userId)`        → un usuario específico.
//   - `notifyAdmins(companyId)` → todos los owner_empresa / admin_empresa de la empresa.
//   - `notifyRole(companyId, roleKey)` → todos los usuarios con ese rol (futuro).
//
// Aislamiento: TODAS las inserciones filtran por companyId. No hay forma de
// notificar a otra empresa.

import { db } from '../db/client';
import {
  companyNotifications,
  companyDeviceTokens,
  companyUsers,
} from '../db/schema/operational';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { wsBroadcast } from '../services/websocket';
import type { InferSelectModel } from 'drizzle-orm';

export type NotificationKind =
  | 'maintenance_due'
  | 'maintenance_scheduled'
  | 'maintenance_completed'
  | 'maintenance_overshoot_km'
  | 'workshop_assigned'
  | 'supplier_invoice'
  | 'system';

export interface NotifyArgs {
  companyId:   number;
  userId:      number;             // destinatario único
  kind:        NotificationKind;
  title:       string;
  body?:       string;
  payload?:    Record<string, unknown>;
}

// ── FCM (lazy, opcional) ──────────────────────────────────────────────────────
//
// Se inicializa UNA vez si el backend tiene `FIREBASE_SERVICE_ACCOUNT_JSON` en
// el env. Si no, las llamadas a FCM se vuelven no-op silenciosos y la notif
// igual se guarda in-app + WS.

let fcmAdmin: any | null = null;
let fcmChecked = false;

async function getFcm(): Promise<any | null> {
  if (fcmChecked) return fcmAdmin;
  fcmChecked = true;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    const { cert } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');
    const { initializeApp, getApps } = await import('firebase-admin/app');
    if (!getApps().length) {
      const creds = JSON.parse(raw);
      initializeApp({ credential: cert(creds) });
    }
    fcmAdmin = getMessaging();
    return fcmAdmin;
  } catch (err) {
    console.warn('[notifications] FCM no inicializado:', (err as Error).message);
    fcmAdmin = null;
    return null;
  }
}

// ── API pública ───────────────────────────────────────────────────────────────

export async function notify(args: NotifyArgs): Promise<InferSelectModel<typeof companyNotifications> | null> {
  const { companyId, userId, kind, title, body, payload = {} } = args;

  // 1) In-app
  const [row] = await db
    .insert(companyNotifications)
    .values({ companyId, userId, kind, title, body: body ?? null, payload })
    .returning();

  // 2) WebSocket (en tiempo real, sin esperar el FCM)
  try {
    wsBroadcast(companyId, {
      type: 'notification',
      data: {
        id:       row.id,
        kind:     row.kind,
        title:    row.title,
        body:     row.body,
        payload:  row.payload,
        readAt:   row.readAt,
        createdAt: row.createdAt,
      },
    }, { targetUserId: userId });
  } catch { /* noop */ }

  // 3) FCM push
  try {
    const messaging = await getFcm();
    if (messaging) {
      const tokens = await db
        .select({ token: companyDeviceTokens.token })
        .from(companyDeviceTokens)
        .where(and(eq(companyDeviceTokens.userId, userId), eq(companyDeviceTokens.companyId, companyId)));
      if (tokens.length) {
        await messaging.sendEachForMulticast({
          tokens: tokens.map((t) => t.token),
          notification: { title, body: body ?? undefined },
          data: Object.fromEntries(
            Object.entries({ kind, ...(payload as Record<string, string>) }).map(([k, v]) => [k, String(v)]),
          ),
          android: { priority: 'high' },
        });
      }
    }
  } catch (err) {
    console.warn('[notifications] FCM send falló (no crítico):', (err as Error).message);
  }

  return row;
}

/**
 * Notifica a TODOS los admins (owner_empresa / admin_empresa) de la empresa.
 * Útil cuando un mantenimiento se completa y hay que avisar al supervisor.
 */
export async function notifyAdmins(companyId: number, args: Omit<NotifyArgs, 'companyId' | 'userId'>): Promise<void> {
  const admins = await db
    .select({ id: companyUsers.id })
    .from(companyUsers)
    .where(and(
      eq(companyUsers.companyId, companyId),
      inArray(companyUsers.role, ['admin_empresa']),
      eq(companyUsers.status, 'active'),
    ));
  await Promise.all(admins.map((a) => notify({ ...args, companyId, userId: a.id })));
}

/**
 * Marca como leídas todas las notificaciones sin leer de un usuario.
 * Devuelve la cantidad actualizada.
 */
export async function markAllRead(companyId: number, userId: number): Promise<number> {
  const result = await db
    .update(companyNotifications)
    .set({ readAt: new Date() })
    .where(and(
      eq(companyNotifications.companyId, companyId),
      eq(companyNotifications.userId, userId),
      isNull(companyNotifications.readAt),
    ))
    .returning({ id: companyNotifications.id });
  return result.length;
}
