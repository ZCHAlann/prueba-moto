// lib/notification-service.ts
//
// Servicio centralizado de notificaciones in-app + push + WS.
//
// ─── Canales ──────────────────────────────────────────────────────────────
//   1) In-app  — siempre. Inserta en company_notifications.
//   2) WebSocket — siempre. Emite { type: 'notification', data } al destinatario.
//   3) Push (Expo o FCM) — según el formato del token guardado:
//
//      • Token Expo (`ExponentPushToken[...]`)  → Expo Push API (expo-server-sdk)
//        Recomendado para apps Expo. NO requiere credenciales Firebase.
//
//      • Token FCM/APNs nativo (string largo hex) → firebase-admin
//        Para apps nativas (no Expo). Requiere FIREBASE_SERVICE_ACCOUNT_JSON.
//
// ─── Audiencia ────────────────────────────────────────────────────────────
//   - `notify(userId)`                  → un usuario específico.
//   - `notifyAdmins(companyId)`         → todos los owner_empresa / admin_empresa de la empresa.
//   - `notifyAdminsExceptActor(...)`    → admins, excluyendo al actor que ejecutó la acción.
//   - `notifyRole(companyId, roleKey)`  → todos los usuarios activos con ese rol.
//   - `notifyRoles(companyId, roleKeys)`→ varios roles a la vez.
//   - `notifyFreePool(companyId)`       → todos los operadores activos (mantenimiento "libre").
//   - `notifyMany(users[])`             → fan-out a una lista arbitraria de (companyId, userId).
//
// ─── Aislamiento ──────────────────────────────────────────────────────────
//   TODAS las inserciones filtran por companyId. No hay forma de notificar
//   a otra empresa, ni siquiera por error. El WS además filtra por companyId
//   y opcionalmente por targetUserId.

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
  // ── Mantenimientos (originales) ─────────────────────────────────────────
  | 'maintenance_due'
  | 'maintenance_scheduled'
  | 'maintenance_completed'
  | 'maintenance_overshoot_km'
  | 'maintenance_created'
  | 'maintenance_assigned'
  | 'maintenance_taken'
  | 'maintenance_free_pool'
  | 'maintenance_status_changed'
  | 'maintenance_reauth_requested'
  | 'maintenance_reauth_decided'
  // ── Checklists ──────────────────────────────────────────────────────────
  | 'checklist_created'
  | 'checklist_overdue'
  | 'checklist_reauth_requested'
  | 'checklist_reauth_decided'
  // ── Accesos / Usuarios ───────────────────────────────────────────────────
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'user_inactive'
  // ── Accesos / Roles ──────────────────────────────────────────────────────
  | 'role_created'
  | 'role_updated'
  | 'role_deleted'
  // ── Gestión genérico (talleres, proveedores, vehículos, conductores, etc.) ─
  | 'entity_created'
  | 'entity_updated'
  | 'entity_deleted'
  // ── Alertas operativas (conductor → admins) ──────────────────────────────
  | 'alert_created'
  | 'alert_updated'
  | 'alert_closed'
  // ── Anomalías IA ─────────────────────────────────────────────────────────
  | 'anomaly_detected'
  // ── Sistema ──────────────────────────────────────────────────────────────
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

/** Args "compartibles" (sin companyId/userId) — para fan-out. */
export type BroadcastArgs = Omit<NotifyArgs, 'companyId' | 'userId'>;

// ── Push clients (lazy, opcional) ───────────────────────────────────────────
//
// Hay DOS sistemas de push que soportamos:
//
//   1) Expo Push (RECOMENDADO para apps Expo):
//        - lib: `expo-server-sdk`
//        - tokens empiezan con "ExponentPushToken[...]"
//        - NO requiere credenciales del backend (Expo hostea el relay)
//        - opcional: EXPO_ACCESS_TOKEN para subir el rate limit (default 1000 msg/s)
//
//   2) Firebase Cloud Messaging (apps nativas):
//        - lib: `firebase-admin`
//        - tokens son strings largos hex (no empiezan con ExponentPushToken)
//        - REQUIERE FIREBASE_SERVICE_ACCOUNT_JSON en el .env del backend
//
// Ambos son NO-OP silenciosos si no están configurados. La notificación
// igual se guarda in-app + WS.

let expoClient: any | null = null;
let expoChecked = false;

async function getExpoClient(): Promise<any | null> {
  if (expoChecked) return expoClient;
  expoChecked = true;
  try {
    const { Expo } = await import('expo-server-sdk');
    expoClient = new Expo();
    return expoClient;
  } catch (err) {
    console.warn('[notifications] expo-server-sdk no inicializado:', (err as Error).message);
    expoClient = null;
    return null;
  }
}

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

/**
 * Detecta si un token es de Expo (empieza con "ExponentPushToken[") o
 * de FCM/APNs nativo.
 */
function isExpoPushToken(token: string): boolean {
  return typeof token === 'string' && token.startsWith('ExponentPushToken[');
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Notifica a UN usuario específico.
 * - In-app: SIEMPRE.
 * - WS en tiempo real (filtrado por companyId y targetUserId).
 * - Push (Expo o FCM según el formato del token guardado).
 */
export async function notify(args: NotifyArgs): Promise<InferSelectModel<typeof companyNotifications> | null> {
  const { companyId, userId, kind, title, body, payload = {} } = args;

  // Guard: si nos llega algo raro, logueamos y salimos sin romper el request.
  if (!companyId || !userId) {
    console.warn('[notifications] notify() llamado sin companyId/userId:', { companyId, userId, kind });
    return null;
  }

  // 1) In-app
  const [row] = await db
    .insert(companyNotifications)
    .values({ companyId, userId, kind, title, body: body ?? null, payload })
    .returning();

  if (!row) return null;

  // 2) WebSocket (en tiempo real, sin esperar el push)
  try {
    wsBroadcast(companyId, {
      type: 'notification',
      data: {
        id:        row.id,
        kind:      row.kind,
        title:     row.title,
        body:      row.body,
        payload:   row.payload,
        readAt:    row.readAt,
        createdAt: row.createdAt,
      },
    }, { targetUserId: userId });
  } catch { /* noop */ }

  // 3) Push — fan-out a TODOS los tokens del usuario.
  //    Si tiene tokens Expo Y tokens FCM, mandamos por ambos canales
  //    (caso raro: usuario con dos devices).
  try {
    const tokens = await db
      .select({ token: companyDeviceTokens.token })
      .from(companyDeviceTokens)
      .where(and(
        eq(companyDeviceTokens.userId, userId),
        eq(companyDeviceTokens.companyId, companyId),
      ));

    if (tokens.length) {
      const expoTokens = tokens.map((t) => t.token).filter(isExpoPushToken);
      const fcmTokens  = tokens.map((t) => t.token).filter((t) => !isExpoPushToken(t));

      // (a) Expo Push (si hay SDK)
      if (expoTokens.length) {
        const expo = await getExpoClient();
        if (expo) {
          const messages = expoTokens.map((token: string) => ({
            to:    token,
            sound: 'default',
            title,
            body:  body ?? '',
            data:  Object.fromEntries(
              Object.entries({ kind, ...(payload as Record<string, unknown>) })
                .map(([k, v]) => [k, String(v)]),
            ),
            priority: 'high' as const,
            // iOS: mostrar alerta aunque la app esté en foreground.
            // Android: prioridad high + sound default.
          }));
          const chunks = expo.chunkPushNotifications(messages);
          for (const chunk of chunks) {
            try {
              await expo.sendPushNotificationsAsync(chunk);
            } catch (err) {
              console.warn('[notifications] Expo chunk falló (no crítico):', (err as Error).message);
            }
          }
        }
      }

      // (b) FCM (si hay SDK)
      if (fcmTokens.length) {
        const messaging = await getFcm();
        if (messaging) {
          await messaging.sendEachForMulticast({
            tokens: fcmTokens,
            notification: { title, body: body ?? undefined },
            data: Object.fromEntries(
              Object.entries({ kind, ...(payload as Record<string, string>) }).map(([k, v]) => [k, String(v)]),
            ),
            android: { priority: 'high' },
          });
        }
      }
    }
  } catch (err) {
    console.warn('[notifications] Push send falló (no crítico):', (err as Error).message);
  }

  return row;
}

/**
 * Notifica a TODOS los admins (owner_empresa / admin_empresa) activos de la empresa.
 * Útil cuando un mantenimiento se completa, se reagenda, etc.
 */
export async function notifyAdmins(
  companyId: number,
  args: BroadcastArgs,
): Promise<void> {
  const admins = await db
    .select({ id: companyUsers.id })
    .from(companyUsers)
    .where(and(
      eq(companyUsers.companyId, companyId),
      inArray(companyUsers.role, ['owner_empresa', 'admin_empresa']),
      eq(companyUsers.status, 'active'),
    ));
  await Promise.all(admins.map((a) => notify({ ...args, companyId, userId: a.id })));
}

/**
 * Igual que notifyAdmins, pero EXCLUYE al actor que ejecutó la acción.
 * Sirve para que un admin que crea/edita/borra a otro usuario NO se notifique
 * a sí mismo (es feedback ruidoso).
 */
export async function notifyAdminsExceptActor(
  companyId: number,
  actorUserId: number,
  args: BroadcastArgs,
): Promise<void> {
  const admins = await db
    .select({ id: companyUsers.id })
    .from(companyUsers)
    .where(and(
      eq(companyUsers.companyId, companyId),
      inArray(companyUsers.role, ['owner_empresa', 'admin_empresa']),
      eq(companyUsers.status, 'active'),
    ));
  await Promise.all(
    admins
      .filter((a) => a.id !== actorUserId)
      .map((a) => notify({ ...args, companyId, userId: a.id })),
  );
}

/**
 * Notifica a TODOS los usuarios activos con un `roleKey` específico
 * dentro de la empresa. Ej: notificar a todos los operadores.
 *
 * Importante: `roleKey` es el `company_users.role` (varchar). El rol por
 * defecto 'operador' se matchea tal cual. Roles custom también.
 */
export async function notifyRole(
  companyId: number,
  roleKey: string,
  args: BroadcastArgs,
): Promise<void> {
  const users = await db
    .select({ id: companyUsers.id })
    .from(companyUsers)
    .where(and(
      eq(companyUsers.companyId, companyId),
      eq(companyUsers.role, roleKey),
      eq(companyUsers.status, 'active'),
    ));
  await Promise.all(users.map((u) => notify({ ...args, companyId, userId: u.id })));
}

/**
 * Variante de notifyRole para múltiples roles a la vez.
 *   notifyRoles(companyId, ['operador', 'admin_empresa'], args)
 */
export async function notifyRoles(
  companyId: number,
  roleKeys: string[],
  args: BroadcastArgs,
): Promise<void> {
  if (!roleKeys.length) return;
  const users = await db
    .select({ id: companyUsers.id })
    .from(companyUsers)
    .where(and(
      eq(companyUsers.companyId, companyId),
      inArray(companyUsers.role, roleKeys),
      eq(companyUsers.status, 'active'),
    ));
  await Promise.all(users.map((u) => notify({ ...args, companyId, userId: u.id })));
}

/**
 * Notifica a TODOS los operadores activos de la empresa.
 * Caso de uso: se crea un mantenimiento "libre" (sin assignedUserId) y
 * queremos que cualquier operador lo pueda tomar.
 *
 * Por convención: NO excluye al actor. Si el actor es operador (raro pero
 * posible en una empresa pequeña), también le llega — así sabe que el
 * mantenimiento ya está disponible en la lista general.
 */
export async function notifyFreePool(
  companyId: number,
  args: BroadcastArgs,
): Promise<void> {
  return notifyRole(companyId, 'operador', args);
}

/**
 * Fan-out a una lista arbitraria de (userId) dentro de la misma empresa.
 * Útil cuando ya resolvimos los destinatarios en otra query y queremos
 * reutilizar el path de notify (in-app + WS + push) sin duplicar SQL.
 */
export async function notifyMany(
  companyId: number,
  userIds: number[],
  args: BroadcastArgs,
): Promise<void> {
  if (!userIds.length) return;
  // Dedupe por si el caller ya pasó duplicados.
  const unique = Array.from(new Set(userIds));
  await Promise.all(unique.map((uid) => notify({ ...args, companyId, userId: uid })));
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