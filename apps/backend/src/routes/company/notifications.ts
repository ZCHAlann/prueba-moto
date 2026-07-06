// routes/company/notifications.ts
// In-app notifications + device tokens para Expo Push / FCM.
//
// Reglas de acceso (julio 2026):
//   - Cualquier usuario autenticado de la empresa puede ver SUS PROPIAS
//     notificaciones. NO requiere permisos especiales — la campanita es
//     infraestructura transversal, no un submódulo de mantenimiento.
//   - Admin/owner/superadmin pueden pasar ?scope=all para ver TODAS las
//     de la empresa.
//   - El aislamiento multi-empresa y por usuario está garantizado a nivel
//     SQL (todas las queries filtran por companyId y/o userId).
//
// Permisos:
//   - lecturas (GET) → sin permiso (cualquier user autenticado de la empresa).
//   - escrituras (PATCH read, PATCH read-all) → requirePermission('accesos', 'usuarios', 'editar')
//     (un usuario sin permisos de edición NO debería poder "manejar" notificaciones;
//      es coherente con el resto de UI: solo el admin limpia su bandeja).
//   - devices (POST/DELETE) → sin permiso (necesario para que la app móvil
//     registre su push token al hacer login, incluso sin permisos granulares).

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, isNull, gte } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyNotifications, companyDeviceTokens } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requirePermission } from '../../middlewares/requirePermission';
import { toId, parseId, parseIdFlexible } from '../../lib/ids';
import { markAllRead } from '../../lib/notification-service';

const router = Router({ mergeParams: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ADMIN_ROLES = new Set(['superadmin', 'owner_empresa', 'admin_empresa']);

function serializeNotification(n: typeof companyNotifications.$inferSelect) {
  return {
    id:        toId('notification', n.id),
    companyId: toId('company', n.companyId),
    userId:    toId('company-user', n.userId),
    kind:      n.kind,
    title:     n.title,
    body:      n.body,
    payload:   n.payload,
    readAt:    n.readAt,
    createdAt: n.createdAt,
  };
}

// ─── GET /company/:id/notifications ──────────────────────────────────────────

router.get(
  '/',
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const userId    = parseId('company-user', req.user!.sub);
      const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
      const scopeAll   = req.query.scope === 'all' && ADMIN_ROLES.has(req.user!.role);
      const limit      = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);

      const where: any[] = [eq(companyNotifications.companyId, companyId)];
      if (!scopeAll) where.push(eq(companyNotifications.userId, userId));
      if (unreadOnly) where.push(isNull(companyNotifications.readAt));

      const rows = await db
        .select()
        .from(companyNotifications)
        .where(and(...where))
        .orderBy(desc(companyNotifications.createdAt))
        .limit(limit);

      res.json({
        data: rows.map(serializeNotification),
        total: rows.length,
        scope: scopeAll ? 'all' : 'self',
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /company/:id/notifications/unread-count ────────────────────────────

router.get(
  '/unread-count',
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const userId    = parseId('company-user', req.user!.sub);

      const rows = await db
        .select({ id: companyNotifications.id })
        .from(companyNotifications)
        .where(and(
          eq(companyNotifications.companyId, companyId),
          eq(companyNotifications.userId, userId),
          isNull(companyNotifications.readAt),
        ));
      res.json({ count: rows.length });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /company/:id/notifications/:id/read ──────────────────────────────

router.patch(
  '/:id/read',
  // jun 2026 — sin requirePermission. Marcar como leída es una operación
  // personal del dueño de la notificación (la query filtra por
  // `userId = req.user.sub`, ver abajo). Antes pedía `accesos.usuarios.editar`
  // que un operador / conductor típico no tenía → 403 silencioso → el
  // botón "marcar como leída" no hacía nada.
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const userId    = parseId('company-user', req.user!.sub);
      const id        = parseId('notification', req.params.id);

      console.log('[PATCH /notifications/:id/read]', { companyId, userId, notificationId: id });

      const [row] = await db
        .update(companyNotifications)
        .set({ readAt: new Date() })
        .where(and(
          eq(companyNotifications.id, id),
          eq(companyNotifications.companyId, companyId),
          eq(companyNotifications.userId, userId),  // solo el dueño puede marcarla
        ))
        .returning();

      if (!row) {
        // Si no se actualizó, devolvemos 404 explícito para distinguir
        // "no existe / no es tuyo" de "fallo del servidor". Antes
        // devolvía {ok:true} silencioso y el front pensaba que sí
        // había marcado y luego invalidaba → puntito azul seguía ahí.
        console.log('[PATCH /notifications/:id/read] no-op: notificación no encontrada o no del usuario', { id, userId, companyId });
        return res.status(404).json({ ok: false, code: 'not_found' });
      }
      console.log('[PATCH /notifications/:id/read] OK', { id, readAt: row.readAt });
      res.json(serializeNotification(row));
    } catch (err) {
      console.error('[PATCH /notifications/:id/read] error:', err);
      next(err);
    }
  },
);

// ─── PATCH /company/:id/notifications/read-all ──────────────────────────────

router.patch(
  '/read-all',
  // jun 2026 — sin requirePermission (mismo motivo que PATCH /:id/read).
  // `markAllRead(companyId, userId)` opera solo sobre las filas del caller.
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const userId    = parseId('company-user', req.user!.sub);

      console.log('[PATCH /notifications/read-all]', { companyId, userId });
      const updated = await markAllRead(companyId, userId);
      console.log('[PATCH /notifications/read-all] OK', { updated });
      res.json({ ok: true, updated });
    } catch (err) {
      console.error('[PATCH /notifications/read-all] error:', err);
      next(err);
    }
  },
);

// ─── POST /company/:id/notifications/devices ─────────────────────────────────
// Registra (o actualiza) el push token (Expo o FCM) del usuario actual.
// Sin permisos especiales — la app móvil NECESITA poder hacer esto apenas
// hace login, incluso si el user tiene un rol restringido.

const registerDeviceSchema = z.object({
  token:    z.string().min(10).max(2_000),
  platform: z.enum(['android', 'ios', 'web']),
});

router.post(
  '/devices',
  validate(registerDeviceSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const userId    = parseId('company-user', req.user!.sub);
      const body      = req.body as z.infer<typeof registerDeviceSchema>;

      // upsert: si el token ya existe, actualiza last_seen_at y userId
      await db
        .insert(companyDeviceTokens)
        .values({ userId, companyId, token: body.token, platform: body.platform })
        .onConflictDoUpdate({
          target: companyDeviceTokens.token,
          set:    { lastSeenAt: new Date(), userId, companyId, platform: body.platform },
        });

      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /company/:id/notifications/:id ───────────────────────────────────
// jun 2026 — borrar una notificación propia. Sólo el dueño de la fila puede
// borrarla (filtro por userId = req.user.sub). Sin permisos especiales: es
// una operación personal sobre notificaciones que el usuario ya vio.
//
// Devuelve 404 si no existe o no es del usuario (mismo criterio que PATCH /:id/read).
router.delete(
  '/:id',
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const userId    = parseId('company-user', req.user!.sub);
      const id        = parseId('notification', req.params.id);

      console.log('[DELETE /notifications/:id]', { companyId, userId, notificationId: id });

      const [row] = await db
        .delete(companyNotifications)
        .where(and(
          eq(companyNotifications.id, id),
          eq(companyNotifications.companyId, companyId),
          eq(companyNotifications.userId, userId),
        ))
        .returning({ id: companyNotifications.id });

      if (!row) {
        console.log('[DELETE /notifications/:id] no-op: notificación no encontrada o no del usuario', { id, userId, companyId });
        return res.status(404).json({ ok: false, code: 'not_found' });
      }
      console.log('[DELETE /notifications/:id] OK', { id });
      res.json({ ok: true });
    } catch (err) {
      console.error('[DELETE /notifications/:id] error:', err);
      next(err);
    }
  },
);

// ─── DELETE /company/:id/notifications/devices/:token ────────────────────────

router.delete(
  '/devices/:token',
  async (req, res, next) => {
    try {
      const userId = parseId('company-user', req.user!.sub);
      await db
        .delete(companyDeviceTokens)
        .where(and(
          eq(companyDeviceTokens.userId, userId),
          eq(companyDeviceTokens.token, req.params.token),
        ));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;