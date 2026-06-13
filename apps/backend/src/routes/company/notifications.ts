// routes/company/notifications.ts
// In-app notifications + device tokens para FCM/Web Push.
//
// Permisos:
//   - maintenance.notifications.ver      → ver las propias
//   - admin_empresa/owner_empresa/superadmin → pueden pasar ?scope=all para
//     ver TODAS las de la empresa (para la campanita del admin).

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, isNull, gte } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyNotifications, companyDeviceTokens } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
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
  requireModule('maintenance'),
  requirePermission('maintenance', 'notifications', 'ver'),
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
  requireModule('maintenance'),
  requirePermission('maintenance', 'notifications', 'ver'),
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
  requireModule('maintenance'),
  requirePermission('maintenance', 'notifications', 'editar'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const userId    = parseId('company-user', req.user!.sub);
      const id        = parseId('notification', req.params.id);

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
        // Silencio si no es del usuario (no leak info)
        return res.json({ ok: true });
      }
      res.json(serializeNotification(row));
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /company/:id/notifications/read-all ──────────────────────────────

router.patch(
  '/read-all',
  requireModule('maintenance'),
  requirePermission('maintenance', 'notifications', 'editar'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const userId    = parseId('company-user', req.user!.sub);

      const updated = await markAllRead(companyId, userId);
      res.json({ ok: true, updated });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /company/:id/notifications/devices ─────────────────────────────────
// Registra (o actualiza) el token FCM/Web Push del usuario actual.

const registerDeviceSchema = z.object({
  token:    z.string().min(10).max(2_000),
  platform: z.enum(['android', 'ios', 'web']),
});

router.post(
  '/devices',
  requireModule('maintenance'),
  requirePermission('maintenance', 'notifications', 'ver'),
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

// ─── DELETE /company/:id/notifications/devices/:token ────────────────────────

router.delete(
  '/devices/:token',
  requireModule('maintenance'),
  requirePermission('maintenance', 'notifications', 'ver'),
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
