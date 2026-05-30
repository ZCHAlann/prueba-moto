import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyUsers } from '../../db/schema/platform';
import { hashPassword, verifyPassword } from '../../services/auth.service';
import { logAudit } from '../../lib/audit';
import { toId, parseId } from '../../lib/ids';
import { AppError, NotFoundError } from '../../lib/errors';

const router = Router({ mergeParams: true }); // necesario para leer :companyId del padre


function getJwtIdentity(req: Express.Request): { userId: number; companyId: number } {
  console.log(req.user)
  const sub = req.user?.sub;
  const rawCompanyId = req.user?.companyId;

  if (!sub || !rawCompanyId) {
    throw new AppError(401, 'Token de sesión inválido o sin empresa asociada.');
  }

  if (!sub.startsWith('company-user-')) {
    // Los platform-users (superadmin, etc.) no tienen empresa — no deben usar esta ruta.
    throw new AppError(403, 'Esta ruta es exclusiva para usuarios de empresa.');
  }

  const userId = parseId('company-user', sub);
  const companyId = Number(rawCompanyId); 
  return { userId, companyId };
}

// ─── Schemas de validación ────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  firstName : z.string().min(1).max(80).optional(),
  lastName  : z.string().min(1).max(80).optional(),
  username  : z.string().min(3).max(80).optional(),
  avatarUrl : z.string().max(2048).optional(),
  phone     : z.string().max(30).optional(),
  timezone  : z.string().max(60).optional(),
  language  : z.string().max(10).optional(),
});

const changePasswordSchema = z
  .object({
    currentPassword : z.string().min(1, 'Ingresa tu contraseña actual.'),
    newPassword     : z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres.'),
    confirmPassword : z.string().min(1, 'Confirma la nueva contraseña.'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message : 'Las contraseñas no coinciden.',
    path    : ['confirmPassword'],
  });

// ─── GET /api/company/:companyId/auth/me ──────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { userId, companyId } = getJwtIdentity(req);

    // WHERE id = userId AND company_id = companyId
    // Si alguien falsifica la URL con otro companyId → 0 filas → 404.
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
      profile   : {
        firstName : profileData.firstName ?? '',
        lastName  : profileData.lastName  ?? '',
        title     : profileData.title     ?? '',
        phone     : profileData.phone     ?? '',
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

    // Verificar que el usuario existe en ESA empresa antes de tocar nada.
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

    // Construir el profileData actualizado (merge superficial).
    const currentProfile = (existing.profileData as Record<string, unknown>) ?? {};
    const nextProfile: Record<string, unknown> = { ...currentProfile };

    if (data.firstName !== undefined) nextProfile.firstName = data.firstName;
    if (data.lastName  !== undefined) nextProfile.lastName  = data.lastName;
    if (data.phone     !== undefined) nextProfile.phone     = data.phone;
    if (data.avatarUrl !== undefined) nextProfile.avatarUrl = data.avatarUrl;
    if (data.timezone  !== undefined) nextProfile.timezone  = data.timezone;
    if (data.language  !== undefined) nextProfile.language  = data.language;

    const updateData: Record<string, unknown> = {
      profileData : nextProfile,
      updatedAt   : new Date(),
    };

    // username vive en columna propia, no en profileData.
    if (data.username !== undefined) updateData.username = data.username;

    // UPDATE también filtra por companyId — doble seguro.
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

    // Buscar el hash actual filtrando por userId Y companyId simultáneamente.
    const [user] = await db
      .select({
        passwordHash : companyUsers.passwordHash,
        companyId    : companyUsers.companyId,
      })
      .from(companyUsers)
      .where(
        and(
          eq(companyUsers.id, userId),
          eq(companyUsers.companyId, companyId)
        )
      )
      .limit(1);

    if (!user) throw new NotFoundError('Usuario', toId('company-user', userId));

    // Verificar contraseña actual — si falla, 422 con field para el stepper.
    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(422).json({
        error : 'Contraseña incorrecta.',
        field : 'currentPassword',
      });
    }

    const newHash = await hashPassword(newPassword);

    // UPDATE también filtra por companyId — nunca toca otra empresa.
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