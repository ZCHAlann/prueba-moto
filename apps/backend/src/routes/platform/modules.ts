// src/routes/platform/modules.ts
//
// CRUD del catálogo de módulos del sistema (platform_modules +
// platform_module_submodules) — solo accesible por superadmin.
//
// El endpoint devuelve TODOS los módulos (activos e inactivos) con sus
// submódulos. El superadmin puede crear / renombrar / activar módulos,
// pero NO eliminar (los permisos de los usuarios referencian estos IDs).

import { Router } from 'express';
import { z } from 'zod';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { validate } from '../../lib/validate';
import { requireSuperadmin } from '../../middlewares/requireSuperadmin';
import { logAudit } from '../../lib/audit';
import { NotFoundError, AppError } from '../../lib/errors';
import {
  platformModules,
  platformModuleSubmodules,
  platformPlanModules,
} from '../../db/schema/platform';
import { parsePageParams, buildPageResponse } from '../../lib/pagination';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const submoduleSchema = z.object({
  id:        z.string().regex(/^[a-z0-9_.]{2,80}$/, 'id debe ser minúscula y solo letras/números/_/.'),
  label:     z.string().min(1).max(160),
  sortOrder: z.number().int().min(0).default(100),
  isActive:  z.boolean().default(true),
});

const moduleSchema = z.object({
  id:          z.string().regex(/^[a-z0-9_.]{2,60}$/, 'id debe ser minúscula y solo letras/números/_/.'),
  label:       z.string().min(1).max(120),
  description: z.string().max(500).default(''),
  icon:        z.string().max(60).default('Package'),
  accent:      z.string().max(30).default('emerald'),
  isCore:      z.boolean().default(false),
  isActive:    z.boolean().default(true),
  sortOrder:   z.number().int().min(0).default(100),
  submodules:  z.array(submoduleSchema).default([]),
});

const updateModuleSchema = moduleSchema.omit({ id: true, submodules: true }).partial().extend({
  submodules: z.array(submoduleSchema).optional(),
});

// ─── GET /platform/modules ────────────────────────────────────────────────────

router.get('/', async (_req, res, next) => {
  try {
    const { page, pageSize, offset } = parsePageParams({});
    const [rows, countRow] = await Promise.all([
      db.select().from(platformModules)
        .orderBy(asc(platformModules.sortOrder), asc(platformModules.label))
        .limit(pageSize).offset(offset),
      db.select({ value: sql<number>`cast(count(*) as int)` }).from(platformModules),
    ]);

    // Traer submódulos por módulo (un solo query agrupado)
    const subs = await db
      .select()
      .from(platformModuleSubmodules)
      .orderBy(asc(platformModuleSubmodules.sortOrder));
    const subsByMod = new Map<string, typeof subs>();
    for (const s of subs) {
      const arr = subsByMod.get(s.moduleId) ?? [];
      arr.push(s);
      subsByMod.set(s.moduleId, arr);
    }

    const total = countRow?.[0]?.value ?? 0;
    res.json(buildPageResponse(
      rows.map(m => ({
        ...m,
        submodules: subsByMod.get(m.id) ?? [],
      })),
      total, page, pageSize,
    ));
  } catch (err) {
    next(err);
  }
});

// ─── GET /platform/modules/all ────────────────────────────────────────────────
// Sin paginación — para la UI de Superadmin que quiere ver todo el catálogo.

router.get('/all', async (_req, res, next) => {
  try {
    const mods = await db
      .select()
      .from(platformModules)
      .orderBy(asc(platformModules.sortOrder), asc(platformModules.label));
    const subs = await db
      .select()
      .from(platformModuleSubmodules)
      .orderBy(asc(platformModuleSubmodules.sortOrder));
    const subsByMod = new Map<string, typeof subs>();
    for (const s of subs) {
      const arr = subsByMod.get(s.moduleId) ?? [];
      arr.push(s);
      subsByMod.set(s.moduleId, arr);
    }
    res.json({
      data: mods.map(m => ({ ...m, submodules: subsByMod.get(m.id) ?? [] })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /platform/modules/:id ───────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const [m] = await db
      .select()
      .from(platformModules)
      .where(eq(platformModules.id, id))
      .limit(1);
    if (!m) throw new NotFoundError('Módulo', id);

    const subs = await db
      .select()
      .from(platformModuleSubmodules)
      .where(eq(platformModuleSubmodules.moduleId, m.id))
      .orderBy(asc(platformModuleSubmodules.sortOrder));

    res.json({ ...m, submodules: subs });
  } catch (err) {
    next(err);
  }
});

// ─── POST /platform/modules [SA] ──────────────────────────────────────────────

router.post('/', requireSuperadmin, validate(moduleSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof moduleSchema>;

    const exists = await db
      .select({ id: platformModules.id })
      .from(platformModules)
      .where(eq(platformModules.id, body.id))
      .limit(1);
    if (exists.length > 0) {
      throw new AppError(409, `Ya existe un módulo con id "${body.id}".`);
    }

    const [created] = await db
      .insert(platformModules)
      .values({
        id: body.id, label: body.label, description: body.description,
        icon: body.icon, accent: body.accent, isCore: body.isCore,
        isActive: body.isActive, sortOrder: body.sortOrder,
      })
      .returning();

    if (body.submodules.length > 0) {
      await db.insert(platformModuleSubmodules).values(
        body.submodules.map(s => ({
          id: s.id, moduleId: created.id, label: s.label,
          sortOrder: s.sortOrder, isActive: s.isActive,
        }))
      );
    }

    await logAudit(db, null, {
      entity: 'platform_modules', entityId: created.id, action: 'create',
      actorId: req.user!.sub, actorName: req.user!.name,
      description: `Módulo "${created.label}" creado.`,
    });

    res.status(201).json({ ...created, submodules: body.submodules });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /platform/modules/:id [SA] ──────────────────────────────────────────

router.put('/:id', requireSuperadmin, validate(updateModuleSchema), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const [existing] = await db
      .select()
      .from(platformModules)
      .where(eq(platformModules.id, id))
      .limit(1);
    if (!existing) throw new NotFoundError('Módulo', id);

    const body = req.body as z.infer<typeof updateModuleSchema>;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    for (const k of ['label', 'description', 'icon', 'accent', 'isCore', 'isActive', 'sortOrder'] as const) {
      if (body[k] !== undefined) updateData[k] = body[k];
    }

    if (Object.keys(updateData).length > 1) {
      await db.update(platformModules).set(updateData as any).where(eq(platformModules.id, id));
    }

    // Submódulos: si vienen, reemplazamos el set completo.
    if (body.submodules !== undefined) {
      await db.delete(platformModuleSubmodules).where(eq(platformModuleSubmodules.moduleId, id));
      if (body.submodules.length > 0) {
        await db.insert(platformModuleSubmodules).values(
          body.submodules.map(s => ({
            id: s.id, moduleId: id, label: s.label,
            sortOrder: s.sortOrder, isActive: s.isActive,
          }))
        );
      }
    }

    const [updated] = await db
      .select()
      .from(platformModules)
      .where(eq(platformModules.id, id))
      .limit(1);
    const subs = await db
      .select()
      .from(platformModuleSubmodules)
      .where(eq(platformModuleSubmodules.moduleId, id))
      .orderBy(asc(platformModuleSubmodules.sortOrder));

    await logAudit(db, null, {
      entity: 'platform_modules', entityId: id, action: 'update',
      actorId: req.user!.sub, actorName: req.user!.name,
      description: `Módulo "${updated.label}" actualizado.`,
    });

    res.json({ ...updated, submodules: subs });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /platform/modules/:id [SA] ───────────────────────────────────────
//
// No eliminamos módulos físicamente: hay permisos de usuarios y relaciones
// con planes que referencian el id. En su lugar marcamos isActive=false.

router.delete('/:id', requireSuperadmin, async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const [existing] = await db
      .select()
      .from(platformModules)
      .where(eq(platformModules.id, id))
      .limit(1);
    if (!existing) throw new NotFoundError('Módulo', id);
    if (existing.isCore) {
      throw new AppError(400, `No se puede desactivar un módulo core ("${existing.label}").`);
    }

    await db
      .update(platformModules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(platformModules.id, id));

    // Quitar de todos los planes
    await db
      .delete(platformPlanModules)
      .where(eq(platformPlanModules.moduleId, id));

    await logAudit(db, null, {
      entity: 'platform_modules', entityId: id, action: 'delete',
      actorId: req.user!.sub, actorName: req.user!.name,
      description: `Módulo "${existing.label}" desactivado.`,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
