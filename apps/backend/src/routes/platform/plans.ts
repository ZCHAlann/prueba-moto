// src/routes/platform/plans.ts
//
// CRUD de planes desde superadmin. Los planes tienen:
//   - Datos básicos: name, tier, pricing.
//   - Límites globales y por rol (max_users, max_admins, max_supervisors,
//     max_operators, max_drivers, max_assets).
//   - Bullets visibles al usuario (features JSON).
//   - Módulos permitidos (relación vía platform_plan_modules).
//
// `allowedModules` (text[] legacy) se mantiene en sincronía — el superadmin
// puede editar las dos vistas.

import { Router } from 'express';
import { z } from 'zod';
import { eq, desc, sql, inArray, asc, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { validate } from '../../lib/validate';
import { requireSuperadmin } from '../../middlewares/requireSuperadmin';
import { NotFoundError, AppError } from '../../lib/errors';
import { logAudit } from '../../lib/audit';
import {
  platformPlans,
  platformPlanModules,
  platformModules,
  companies,
} from '../../db/schema/platform';
import { parsePageParams, buildPageResponse } from '../../lib/pagination';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const planSchema = z.object({
  id:              z.string().regex(/^[a-z0-9_-]+$/).min(1).max(40),
  name:            z.string().min(1).max(80),
  tier:            z.enum(['free', 'starter', 'pro', 'enterprise']),
  monthlyPrice:    z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
  annualPrice:     z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
  maxUsers:        z.number().int().positive().nullable().optional(),
  maxAdmins:       z.number().int().min(0).nullable().optional(),
  maxSupervisors:  z.number().int().min(0).nullable().optional(),
  maxOperators:    z.number().int().min(0).nullable().optional(),
  maxDrivers:      z.number().int().min(0).nullable().optional(),
  maxAssets:       z.number().int().positive().nullable().optional(),
  description:     z.string().max(500).optional(),
  features:        z.array(z.string().min(1).max(200)).default([]),
  isPopular:       z.boolean().default(false),
  sortOrder:       z.number().int().min(0).default(100),
  currency:        z.string().length(3).default('USD'),
  isActive:        z.boolean().default(true),
  allowedModules:  z.array(z.string()).optional(), // aceptamos la lista — sincronizamos con tabla puente
});

const updatePlanSchema = planSchema.omit({ id: true }).partial();

// ─── Serializer ───────────────────────────────────────────────────────────────

async function getPlanModules(planId: string): Promise<string[]> {
  const rows = await db
    .select({ moduleId: platformPlanModules.moduleId })
    .from(platformPlanModules)
    .where(eq(platformPlanModules.planId, planId));
  return rows.map(r => r.moduleId);
}

function serializePlan(p: typeof platformPlans.$inferSelect, modules: string[] = p.allowedModules) {
  return {
    id:              p.id,
    name:            p.name,
    tier:            p.tier,
    monthlyPrice:    p.monthlyPrice,
    annualPrice:     p.annualPrice,
    maxUsers:        p.maxUsers,
    maxAssets:       p.maxAssets,
    maxAdmins:       p.maxAdmins,
    maxSupervisors:  p.maxSupervisors,
    maxOperators:    p.maxOperators,
    maxDrivers:      p.maxDrivers,
    description:     p.description,
    features:        (p.features as unknown as string[]) ?? [],
    isPopular:       p.isPopular,
    sortOrder:       p.sortOrder,
    currency:        p.currency,
    allowedModules:  modules,
    isActive:        p.isActive,
    createdAt:       p.createdAt,
    updatedAt:       p.updatedAt,
  };
}

async function validateModulesExist(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const rows = await db
    .select({ id: platformModules.id })
    .from(platformModules)
    .where(inArray(platformModules.id, ids));
  const found = new Set(rows.map(r => r.id));
  const missing = ids.filter(i => !found.has(i));
  if (missing.length > 0) {
    throw new AppError(400, `Módulos inexistentes: ${missing.join(', ')}`);
  }
}

// ─── GET / ───────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = parsePageParams(req.query as Record<string, unknown>);

    const [rows, countRow] = await Promise.all([
      db.select().from(platformPlans)
        .orderBy(asc(platformPlans.sortOrder))
        .limit(pageSize).offset(offset),
      db.select({ value: sql<number>`cast(count(*) as int)` }).from(platformPlans),
    ]);

    // Traer todos los módulos por plan en una sola query
    const planIds = rows.map(r => r.id);
    const planModulesRows = planIds.length > 0
      ? await db.select().from(platformPlanModules).where(inArray(platformPlanModules.planId, planIds))
      : [];
    const planModulesMap = new Map<string, string[]>();
    for (const pm of planModulesRows) {
      const arr = planModulesMap.get(pm.planId) ?? [];
      arr.push(pm.moduleId);
      planModulesMap.set(pm.planId, arr);
    }

    const total = countRow?.[0]?.value ?? 0;
    res.json(buildPageResponse(
      rows.map(p => serializePlan(p, planModulesMap.get(p.id) ?? p.allowedModules)),
      total, page, pageSize,
    ));
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id ───────────────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const [row] = await db
      .select()
      .from(platformPlans)
      .where(eq(platformPlans.id, String(req.params.id)))
      .limit(1);
    if (!row) throw new NotFoundError('Plan', String(req.params.id));
    const mods = await getPlanModules(row.id);
    res.json(serializePlan(row, mods));
  } catch (err) {
    next(err);
  }
});

// ─── POST / [SA] ────────────────────────────────────────────────────────────

router.post('/', requireSuperadmin, validate(planSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof planSchema>;

    const exists = await db
      .select({ id: platformPlans.id })
      .from(platformPlans)
      .where(eq(platformPlans.id, body.id))
      .limit(1);
    if (exists.length > 0) {
      throw new AppError(409, `Ya existe un plan con id "${body.id}".`);
    }

    const modules = body.allowedModules ?? [];
    if (modules.length > 0) await validateModulesExist(modules);

    const [created] = await db
      .insert(platformPlans)
      .values({
        id: body.id, name: body.name, tier: body.tier,
        monthlyPrice: body.monthlyPrice, annualPrice: body.annualPrice,
        maxUsers: body.maxUsers ?? null, maxAssets: body.maxAssets ?? null,
        maxAdmins: body.maxAdmins ?? null, maxSupervisors: body.maxSupervisors ?? null,
        maxOperators: body.maxOperators ?? null, maxDrivers: body.maxDrivers ?? null,
        description: body.description ?? null,
        features: body.features,
        isPopular: body.isPopular, sortOrder: body.sortOrder,
        currency: body.currency, isActive: body.isActive,
        allowedModules: modules,
      })
      .returning();

    if (modules.length > 0) {
      await db.insert(platformPlanModules).values(
        modules.map(mid => ({ planId: created.id, moduleId: mid })),
      );
    }

    await logAudit(db, null, {
      entity: 'platform_plans', entityId: created.id, action: 'create',
      actorId: req.user!.sub, actorName: req.user!.name,
      description: `Plan "${created.name}" creado.`,
    });

    res.status(201).json(serializePlan(created, modules));
  } catch (err) {
    next(err);
  }
});

// ─── PUT /:id [SA] ──────────────────────────────────────────────────────────

router.put('/:id', requireSuperadmin, validate(updatePlanSchema), async (req, res, next) => {
  try {
    const [existing] = await db
      .select()
      .from(platformPlans)
      .where(eq(platformPlans.id, String(req.params.id)))
      .limit(1);
    if (!existing) throw new NotFoundError('Plan', String(req.params.id));

    const body = req.body as z.infer<typeof updatePlanSchema>;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    const fields = [
      'name', 'tier', 'monthlyPrice', 'annualPrice',
      'maxUsers', 'maxAssets', 'maxAdmins', 'maxSupervisors',
      'maxOperators', 'maxDrivers', 'description', 'features',
      'isPopular', 'sortOrder', 'currency', 'isActive',
    ] as const;
    for (const k of fields) {
      if (body[k] !== undefined) updateData[k] = body[k];
    }

    const [updated] = await db
      .update(platformPlans)
      .set(updateData as any)
      .where(eq(platformPlans.id, String(req.params.id)))
      .returning();

    // Si vienen allowedModules, sincronizar la tabla puente
    let mods = existing.allowedModules;
    if (body.allowedModules !== undefined) {
      if (body.allowedModules.length > 0) await validateModulesExist(body.allowedModules);
      mods = body.allowedModules;
      await db.update(platformPlans)
        .set({ allowedModules: mods })
        .where(eq(platformPlans.id, String(req.params.id)));
      await db.delete(platformPlanModules).where(eq(platformPlanModules.planId, String(req.params.id)));
      if (mods.length > 0) {
        await db.insert(platformPlanModules).values(
          mods.map(mid => ({ planId: String(req.params.id), moduleId: mid })),
        );
      }
    } else {
      mods = await getPlanModules(String(req.params.id));
    }

    await logAudit(db, null, {
      entity: 'platform_plans', entityId: updated.id, action: 'update',
      actorId: req.user!.sub, actorName: req.user!.name,
      description: `Plan "${updated.name}" actualizado.`,
    });

    res.json(serializePlan(updated, mods));
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /:id [SA] ───────────────────────────────────────────────────────

router.delete('/:id', requireSuperadmin, async (req, res, next) => {
  try {
    const [existing] = await db
      .select()
      .from(platformPlans)
      .where(eq(platformPlans.id, String(req.params.id)))
      .limit(1);
    if (!existing) throw new NotFoundError('Plan', String(req.params.id));

    // No permitir borrar si hay empresas usándolo
    const rawCount = await db
      .select({ value: sql<number>`cast(count(*) as int)` })
      .from(companies)
      .where(eq(companies.planId, existing.id));
    const inUse = rawCount?.[0]?.value ?? 0;
    if (inUse > 0) {
      throw new AppError(400, `No se puede eliminar el plan: hay ${inUse} empresa(s) usándolo.`);
    }

    await db.delete(platformPlans).where(eq(platformPlans.id, String(req.params.id)));

    await logAudit(db, null, {
      entity: 'platform_plans', entityId: String(req.params.id), action: 'delete',
      actorId: req.user!.sub, actorName: req.user!.name,
      description: `Plan "${existing.name}" eliminado.`,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/modules [SA] — agrega un módulo al plan ──────────────────────

router.post('/:id/modules/:moduleId', requireSuperadmin, async (req, res, next) => {
  try {
    const planId = String(req.params.id);
    const moduleId = String(req.params.moduleId);

    const [plan] = await db.select().from(platformPlans).where(eq(platformPlans.id, planId)).limit(1);
    if (!plan) throw new NotFoundError('Plan', planId);
    const [mod] = await db.select().from(platformModules).where(eq(platformModules.id, moduleId)).limit(1);
    if (!mod) throw new NotFoundError('Módulo', moduleId);

    await db.insert(platformPlanModules).values({ planId, moduleId }).onConflictDoNothing();

    // Re-sincronizar allowedModules (text[])
    const all = await getPlanModules(planId);
    await db.update(platformPlans).set({ allowedModules: all }).where(eq(platformPlans.id, planId));

    res.json({ ok: true, modules: all });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /:id/modules/:moduleId [SA] ─────────────────────────────────────

router.delete('/:id/modules/:moduleId', requireSuperadmin, async (req, res, next) => {
  try {
    await db.delete(platformPlanModules)
      .where(and(eq(platformPlanModules.planId, String(req.params.id)), eq(platformPlanModules.moduleId, String(req.params.moduleId))));

    const all = await getPlanModules(String(req.params.id));
    await db.update(platformPlans).set({ allowedModules: all }).where(eq(platformPlans.id, String(req.params.id)));

    res.json({ ok: true, modules: all });
  } catch (err) {
    next(err);
  }
});

export default router;
