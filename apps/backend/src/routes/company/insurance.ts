import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyInsurancePolicies } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';

const router = Router({ mergeParams: true });

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createInsuranceSchema = z.object({
  assetId:      z.string().min(1, 'El vehículo es requerido'),
  insurer:      z.string().min(1, 'La aseguradora es requerida'),
  policyNumber: z.string().min(1, 'El número de póliza es requerido'),
  coverage:     z.string().optional().nullable(),
  startDate:    z.string().min(1, 'La fecha de inicio es requerida'),
  endDate:      z.string().min(1, 'La fecha de vencimiento es requerida'),
  status:       z.enum(['Vigente', 'Por vencer', 'Vencido']).default('Vigente'),
  notes:        z.string().optional().nullable(),
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
    createdAt:    p.createdAt,
    updatedAt:    p.updatedAt,
  };
}

// ─── GET /company/:id/insurance ───────────────────────────────────────────────

router.get('/', requireModule('seguros'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const rows = await db
      .select()
      .from(companyInsurancePolicies)
      .where(eq(companyInsurancePolicies.companyId, companyId))
      .orderBy(companyInsurancePolicies.endDate);

    res.json({ data: rows.map(serializePolicy), total: rows.length });
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