import { Router } from 'express';
import { z } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { validate } from '../../lib/validate';
import { requireSuperadmin } from '../../middlewares/requireSuperadmin';
import { NotFoundError } from '../../lib/errors';
import { logAudit } from '../../lib/audit';
import { platformPlans } from '../../db/schema/platform';
import { parsePageParams, buildPageResponse } from '../../lib/pagination';

const router = Router();

// ─── Schema ───────────────────────────────────────────────────────────────────

const planSchema = z.object({
  id:              z.string().min(1),
  name:            z.string().min(1),
  tier:            z.enum(['free', 'starter', 'pro', 'enterprise']),
  monthlyPrice:    z.string().default('0'),
  annualPrice:     z.string().default('0'),
  maxUsers:        z.number().int().nullable().optional(),
  maxAssets:       z.number().int().nullable().optional(),
  allowedModules:  z.array(z.string()).default([]),
  isActive:        z.boolean().default(true),
});

const updatePlanSchema = planSchema.omit({ id: true }).partial();

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializePlan(p: typeof platformPlans.$inferSelect) {
  return {
    id:             p.id,
    name:           p.name,
    tier:           p.tier,
    monthlyPrice:   p.monthlyPrice,
    annualPrice:    p.annualPrice,
    maxUsers:       p.maxUsers,
    maxAssets:      p.maxAssets,
    allowedModules: p.allowedModules,
    isActive:       p.isActive,
    createdAt:      p.createdAt,
    updatedAt:      p.updatedAt,
  };
}

// ─── GET /platform/plans ──────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = parsePageParams(req.query as Record<string, unknown>);

    const [rows, countRow] = await Promise.all([
      db.select().from(platformPlans)
        .orderBy(desc(platformPlans.tier)).limit(pageSize).offset(offset),
      db.select({ value: sql<number>`cast(count(*) as int)` }).from(platformPlans),
    ]);

    const total = countRow?.[0]?.value ?? 0;
    res.json(buildPageResponse(rows.map(serializePlan), total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

// ─── POST /platform/plans  [SA] ───────────────────────────────────────────────

router.post('/', requireSuperadmin, validate(planSchema), async (req, res, next) => {
  try {
    const [created] = await db
      .insert(platformPlans)
      .values(req.body)
      .returning();

    await logAudit(db, null, {
      entity:      'platform_plans',
      entityId:    created.id,
      action:      'create',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: `Plan "${created.name}" creado.`,
    });

    res.status(201).json(serializePlan(created));
  } catch (err) {
    next(err);
  }
});

// ─── PUT /platform/plans/:id  [SA] ───────────────────────────────────────────

router.put('/:id', requireSuperadmin, validate(updatePlanSchema), async (req, res, next) => {
  try {
    const [existing] = await db
      .select()
      .from(platformPlans)
      .where(eq(platformPlans.id, req.params.id))
      .limit(1);
    if (!existing) throw new NotFoundError('Plan', req.params.id);

    const [updated] = await db
      .update(platformPlans)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(platformPlans.id, req.params.id))
      .returning();

    await logAudit(db, null, {
      entity:      'platform_plans',
      entityId:    updated.id,
      action:      'update',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: `Plan "${updated.name}" actualizado.`,
    });

    res.json(serializePlan(updated));
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /platform/plans/:id  [SA] ────────────────────────────────────────

router.delete('/:id', requireSuperadmin, async (req, res, next) => {
  try {
    const [existing] = await db
      .select()
      .from(platformPlans)
      .where(eq(platformPlans.id, req.params.id))
      .limit(1);
    if (!existing) throw new NotFoundError('Plan', req.params.id);

    await db.delete(platformPlans).where(eq(platformPlans.id, req.params.id));

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;