import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyInsurancePolicies } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';
import { parsePageParams, buildPageResponse } from '../../lib/pagination';

const router = Router({ mergeParams: true });

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createInsuranceSchema = z.object({
  assetId:      z.string().min(1, 'El vehículo es requerido'),
  insurer:      safeString({ min: 2, max: 120, fieldLabel: 'Aseguradora', allowEmpty: false }),
  policyNumber: safeString({ min: 3, max: 60, fieldLabel: 'Número de póliza', allowEmpty: false }),
  coverage:     safeString({ max: 250, fieldLabel: 'Cobertura', allowEmpty: true }).nullable().optional(),
  startDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  endDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  status:       z.enum(['Vigente', 'Por vencer', 'Vencido']).default('Vigente'),
  notes:        validators.longTextOptional,
  fileUrl:      z.string().max(2_000_000).optional().nullable(),
});

const updateInsuranceSchema = createInsuranceSchema.partial();

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializePolicy(p: typeof companyInsurancePolicies.$inferSelect) {
  return {
    id:           toId('insurance', p.id),
    companyId:    toId('company', p.companyId),
    assetId:      toId('asset', p.assetId),
    insurer:      p.insurer,
    policyNumber: p.policyNumber,
    coverage:     p.coverage ?? '',
    startDate:    p.startDate,
    endDate:      p.endDate,
    status:       p.status ?? 'Vigente',
    notes:        p.notes ?? '',
    fileUrl: p.fileUrl ?? null,
    createdAt:    p.createdAt,
    updatedAt:    p.updatedAt,
  };
}

// ─── GET /company/:id/insurance ───────────────────────────────────────────────

router.get('/', requireModule('seguros'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { page, pageSize, offset } = parsePageParams(req.query as Record<string, unknown>);

    const where = eq(companyInsurancePolicies.companyId, companyId);

    const [rows, countRow] = await Promise.all([
      db.select().from(companyInsurancePolicies).where(where)
        .orderBy(desc(companyInsurancePolicies.endDate)).limit(pageSize).offset(offset),
      db.select({ value: sql<number>`cast(count(*) as int)` }).from(companyInsurancePolicies).where(where),
    ]);

    const total = countRow?.[0]?.value ?? 0;
    res.json(buildPageResponse(rows.map(serializePolicy), total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/insurance/:policyId ─────────────────────────────────────

router.get('/:policyId', requireModule('seguros'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const policyId  = parseId('insurance', req.params.policyId);

    const rows = await db
      .select()
      .from(companyInsurancePolicies)
      .where(
        and(
          eq(companyInsurancePolicies.id, policyId),
          eq(companyInsurancePolicies.companyId, companyId),
        )
      )
      .limit(1);

    if (!rows.length) throw new NotFoundError('Póliza', req.params.policyId);

    res.json(serializePolicy(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/insurance ──────────────────────────────────────────────

router.post(
  '/',
  requireModule('seguros'),
  requireAdmin,
  validate(createInsuranceSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body      = req.body as z.infer<typeof createInsuranceSchema>;

      const [created] = await db
        .insert(companyInsurancePolicies)
        .values({
          companyId,
          assetId:      parseId('asset', body.assetId),
          insurer:      body.insurer,
          policyNumber: body.policyNumber,
          coverage:     body.coverage ?? null,
          startDate:    body.startDate,
          endDate:      body.endDate,
          status:       body.status,
          notes:        body.notes ?? null,
          fileUrl: body.fileUrl ?? null,
        })
        .returning();

      await logAudit(db, companyId, {
        entity:      'insurance',
        entityId:    toId('insurance', created.id),
        action:      'create',
        actorId:     req.user!.sub,
        actorName:   req.user!.name,
        description: `Póliza "${created.policyNumber}" de ${created.insurer} registrada.`,
      });

      res.status(201).json(serializePolicy(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/insurance/:policyId ─────────────────────────────────────

router.put(
  '/:policyId',
  requireModule('seguros'),
  requireAdmin,
  validate(updateInsuranceSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const policyId  = parseId('insurance', req.params.policyId);
      const body      = req.body as z.infer<typeof updateInsuranceSchema>;

      const existing = await db
        .select()
        .from(companyInsurancePolicies)
        .where(
          and(
            eq(companyInsurancePolicies.id, policyId),
            eq(companyInsurancePolicies.companyId, companyId),
          )
        )
        .limit(1);

      if (!existing.length) throw new NotFoundError('Póliza', req.params.policyId);

      const updateData: Partial<typeof companyInsurancePolicies.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (body.assetId      !== undefined) updateData.assetId      = parseId('asset', body.assetId);
      if (body.insurer      !== undefined) updateData.insurer      = body.insurer;
      if (body.policyNumber !== undefined) updateData.policyNumber = body.policyNumber;
      if (body.coverage     !== undefined) updateData.coverage     = body.coverage ?? null;
      if (body.startDate    !== undefined) updateData.startDate    = body.startDate;
      if (body.endDate      !== undefined) updateData.endDate      = body.endDate;
      if (body.status       !== undefined) updateData.status       = body.status;
      if (body.notes        !== undefined) updateData.notes        = body.notes ?? null;
      if (body.fileUrl !== undefined) updateData.fileUrl = body.fileUrl ?? null;

      const [updated] = await db
        .update(companyInsurancePolicies)
        .set(updateData)
        .where(
          and(
            eq(companyInsurancePolicies.id, policyId),
            eq(companyInsurancePolicies.companyId, companyId),
          )
        )
        .returning();

      await logAudit(db, companyId, {
        entity:      'insurance',
        entityId:    toId('insurance', updated.id),
        action:      'update',
        actorId:     req.user!.sub,
        actorName:   req.user!.name,
        description: `Póliza "${updated.policyNumber}" de ${updated.insurer} actualizada.`,
      });

      res.json(serializePolicy(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/insurance/:policyId ──────────────────────────────────

router.delete(
  '/:policyId',
  requireModule('seguros'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const policyId  = parseId('insurance', req.params.policyId);

      const existing = await db
        .select()
        .from(companyInsurancePolicies)
        .where(
          and(
            eq(companyInsurancePolicies.id, policyId),
            eq(companyInsurancePolicies.companyId, companyId),
          )
        )
        .limit(1);

      if (!existing.length) throw new NotFoundError('Póliza', req.params.policyId);

      await db
        .delete(companyInsurancePolicies)
        .where(
          and(
            eq(companyInsurancePolicies.id, policyId),
            eq(companyInsurancePolicies.companyId, companyId),
          )
        );

      await logAudit(db, companyId, {
        entity:      'insurance',
        entityId:    toId('insurance', policyId),
        action:      'delete',
        actorId:     req.user!.sub,
        actorName:   req.user!.name,
        description: `Póliza "${existing[0].policyNumber}" de ${existing[0].insurer} eliminada.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;