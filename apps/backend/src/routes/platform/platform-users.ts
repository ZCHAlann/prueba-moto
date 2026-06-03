import { Router } from 'express';
import { eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client';
import { platformUsers } from '../../db/schema/platform';
import { validate } from '../../lib/validate';
import { requireSuperadmin } from '../../middlewares/requireSuperadmin';
import { logAudit } from '../../lib/audit';
import { hashPassword } from '../../services/auth.service';
import { NotFoundError } from '../../lib/errors';

const router = Router();

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeUser(u: typeof platformUsers.$inferSelect) {
  return {
    id:        u.id,
    email:     u.email,
    username:  u.username,
    role:      u.role,
    status:    u.status,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

const createUserSchema = z.object({
  email:    z.string().email(),
  username: z.string().min(3),
  password: z.string().min(8),
  role:     z.enum(['superadmin', 'admin_saas']),
});

const updateUserSchema = z.object({
  email:    z.string().email().optional(),
  username: z.string().min(3).optional(),
  password: z.string().min(8).optional(),
  role:     z.enum(['superadmin', 'admin_saas']).optional(),
  status:   z.enum(['active', 'inactive']).optional(),
});

// ─── GET /platform/platform-users ────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(platformUsers)
      .orderBy(platformUsers.createdAt);
    res.json({ data: rows.map(serializeUser), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── POST /platform/platform-users ── solo superadmin ────────────────────────

router.post('/', requireSuperadmin, validate(createUserSchema), async (req, res, next) => {
  try {
    const { password, ...rest } = req.body as z.infer<typeof createUserSchema>;
    const passwordHash = await hashPassword(password);

    const [created] = await db
      .insert(platformUsers)
      .values({ ...rest, passwordHash })
      .returning();

    await logAudit(db, null, {
      entity:      'platform_users',
      entityId:    String(created.id),
      action:      'create',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: `Usuario de plataforma "${created.email}" creado.`,
    });

    res.status(201).json(serializeUser(created));
  } catch (err) {
    next(err);
  }
});

// ─── PUT /platform/platform-users/:id ── solo superadmin ─────────────────────

router.put('/:id', requireSuperadmin, validate(updateUserSchema), async (req, res, next) => {
  try {
    const id   = parseInt(req.params.id);
    const data = req.body as z.infer<typeof updateUserSchema>;

    const [existing] = await db
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.id, id))
      .limit(1);
    if (!existing) throw new NotFoundError('Usuario', String(id));

    const patch: Record<string, unknown> = { ...data, updatedAt: new Date() };
    if (data.password) {
      patch.passwordHash = await hashPassword(data.password);
      delete patch.password;
    }

    const [updated] = await db
      .update(platformUsers)
      .set(patch)
      .where(eq(platformUsers.id, id))
      .returning();

    await logAudit(db, null, {
      entity:      'platform_users',
      entityId:    String(id),
      action:      'update',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: `Usuario "${updated.email}" actualizado.`,
    });

    res.json(serializeUser(updated));
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /platform/platform-users/:id ── solo superadmin ──────────────────

router.delete('/:id', requireSuperadmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    // No puede eliminarse a sí mismo
    if (id === req.user!.sub) {
      return res.status(400).json({ message: 'No puedes eliminarte a ti mismo.' });
    }

    const [existing] = await db
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.id, id))
      .limit(1);
    if (!existing) throw new NotFoundError('Usuario', String(id));

    await db.delete(platformUsers).where(eq(platformUsers.id, id));

    await logAudit(db, null, {
      entity:      'platform_users',
      entityId:    String(id),
      action:      'delete',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: `Usuario "${existing.email}" eliminado.`,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;