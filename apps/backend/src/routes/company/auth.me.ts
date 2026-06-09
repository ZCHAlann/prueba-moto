import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyUsers } from '../../db/schema/platform';
import { hashPassword, verifyPassword } from '../../services/auth.service';
import { logAudit } from '../../lib/audit';
import { toId, parseId } from '../../lib/ids';
import { AppError, NotFoundError } from '../../lib/errors';
import { validators } from '../../lib/validators';

const router = Router({ mergeParams: true });

function getJwtIdentity(req: Express.Request): { userId: number; companyId: number } {
  const sub = req.user?.sub;
  const rawCompanyId = req.user?.companyId;

  if (!sub || !rawCompanyId) {
    throw new AppError(401, 'Token de sesión inválido o sin empresa asociada.');
  }
  if (!sub.startsWith('company-user-')) {
    throw new AppError(403, 'Esta ruta es exclusiva para usuarios de empresa.');
  }

  const userId    = parseId('company-user', sub);
  const companyId = Number(rawCompanyId);
  return { userId, companyId };
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  firstName : validators.nameOptional,
  lastName  : validators.nameOptional,
  username  : z.string().trim().min(3, 'Mín. 3 caracteres').max(40)
                 .regex(/^[a-zA-Z0-9_.-]+$/, 'Solo letras, números, guion, guion bajo y punto').optional(),
  // photoUrl: columna real — puede ser data-URI (base64) o URL externa, o null para eliminar
  photoUrl  : z.string().max(2_000_000).nullable().optional(),  // ~1.5 MB en base64
  // avatarUrl legado en profileData — se sigue aceptando por compatibilidad
  avatarUrl : z.string().max(2048).optional(),
  phone     : validators.phoneOptional,
  timezone  : z.string().max(60).optional(),
  language  : z.string().max(10).optional(),
});

const changePasswordSchema = z
  .object({
    currentPassword : z.string().min(1, 'Ingresa tu contraseña actual.').max(128),
    newPassword     : z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres.').max(128),
    confirmPassword : z.string().min(1, 'Confirma la nueva contraseña.').max(128),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message : 'Las contraseñas no coinciden.',
    path    : ['confirmPassword'],
  });

// ─── GET /api/company/:companyId/auth/me ──────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { userId, companyId } = getJwtIdentity(req);

    const [user] = await db
      .select()
      .from(companyUsers)
      .where(
        and(
          eq(companyUsers.id, userId),
          eq(companyUsers.companyId, companyId)
        )
      )
      .limit(1);

    if (!user) throw new NotFoundError('Usuario', toId('company-user', userId));

    const profileData = (user.profileData as Record<string, unknown>) ?? {};

    return res.json({
      id        : toId('company-user', user.id),
      kind      : 'company-user',
      companyId : user.companyId,
      email     : user.email,
      username  : user.username,
      role      : user.role,
      status    : user.status,
      // ── Columna real (fuente de verdad para la foto) ──────────────────────
      photoUrl  : user.photoUrl ?? null,
      profile   : {
        firstName : profileData.firstName ?? '',
        lastName  : profileData.lastName  ?? '',
        title     : profileData.title     ?? '',
        phone     : profileData.phone     ?? '',
        // avatarUrl legado — se mantiene por si aún hay código que lo lee
        avatarUrl : profileData.avatarUrl ?? '',
        timezone  : profileData.timezone  ?? 'America/Guayaquil',
        language  : profileData.language  ?? 'es',
      },
      createdAt : user.createdAt,
      updatedAt : user.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/company/:companyId/auth/me ────────────────────────────────────

router.patch('/', async (req, res, next) => {
  try {
    const { userId, companyId } = getJwtIdentity(req);

    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error   : 'Datos inválidos.',
        details : parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    const [existing] = await db
      .select()
      .from(companyUsers)
      .where(
        and(
          eq(companyUsers.id, userId),
          eq(companyUsers.companyId, companyId)
        )
      )
      .limit(1);

    if (!existing) throw new NotFoundError('Usuario', toId('company-user', userId));

    // ── profileData: merge superficial para campos dentro del JSONB ──────────
    const currentProfile = (existing.profileData as Record<string, unknown>) ?? {};
    const nextProfile: Record<string, unknown> = { ...currentProfile };

    if (data.firstName !== undefined) nextProfile.firstName = data.firstName;
    if (data.lastName  !== undefined) nextProfile.lastName  = data.lastName;
    if (data.phone     !== undefined) nextProfile.phone     = data.phone;
    if (data.avatarUrl !== undefined) nextProfile.avatarUrl = data.avatarUrl; // legado
    if (data.timezone  !== undefined) nextProfile.timezone  = data.timezone;
    if (data.language  !== undefined) nextProfile.language  = data.language;

    // ── Columnas propias de la tabla ─────────────────────────────────────────
    const updateData: Record<string, unknown> = {
      profileData : nextProfile,
      updatedAt   : new Date(),
    };

    if (data.username !== undefined) updateData.username = data.username;

    // photoUrl: columna real — null elimina la foto, string la actualiza
    if (data.photoUrl !== undefined) updateData.photoUrl = data.photoUrl;

    const [updated] = await db
      .update(companyUsers)
      .set(updateData)
      .where(
        and(
          eq(companyUsers.id, userId),
          eq(companyUsers.companyId, companyId)
        )
      )
      .returning();

    if (!updated) throw new NotFoundError('Usuario', toId('company-user', userId));

    await logAudit(db, companyId, {
      entity      : 'company_users',
      entityId    : toId('company-user', updated.id),
      action      : 'update',
      actorId     : req.user!.sub,
      actorName   : req.user!.name,
      description : 'Usuario actualizó su propio perfil.',
    });

    return res.json({ ok: true, id: toId('company-user', updated.id) });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/company/:companyId/auth/me/password ───────────────────────────

router.patch('/password', async (req, res, next) => {
  try {
    const { userId, companyId } = getJwtIdentity(req);

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error   : 'Datos inválidos.',
        details : parsed.error.flatten(),
      });
    }

    const { currentPassword, newPassword } = parsed.data;

    const [user] = await db
      .select({ passwordHash: companyUsers.passwordHash, companyId: companyUsers.companyId })
      .from(companyUsers)
      .where(
        and(
          eq(companyUsers.id, userId),
          eq(companyUsers.companyId, companyId)
        )
      )
      .limit(1);

    if (!user) throw new NotFoundError('Usuario', toId('company-user', userId));

    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(422).json({
        error : 'Contraseña incorrecta.',
        field : 'currentPassword',
      });
    }

    const newHash = await hashPassword(newPassword);

    await db
      .update(companyUsers)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(
        and(
          eq(companyUsers.id, userId),
          eq(companyUsers.companyId, companyId)
        )
      );

    await logAudit(db, companyId, {
      entity      : 'company_users',
      entityId    : toId('company-user', userId),
      action      : 'update',
      actorId     : req.user!.sub,
      actorName   : req.user!.name,
      description : 'Usuario cambió su propia contraseña.',
    });

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;