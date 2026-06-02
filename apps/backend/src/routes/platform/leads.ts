import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { validate } from '../../lib/validate';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { platformLeads, companies } from '../../db/schema/platform';

const router = Router();

// ─── Schema ───────────────────────────────────────────────────────────────────

const createLeadSchema = z.object({
  companyName:    z.string().min(1),
  contactName:    z.string().optional(),
  contactEmail:   z.string().email().optional().or(z.literal('')),
  contactPhone:   z.string().optional(),
  industry:       z.string().optional(),
  country:        z.string().optional(),
  city:           z.string().optional(),
  status:         z.enum(['nuevo', 'contactado', 'demo_agendada', 'propuesta_enviada', 'ganado', 'perdido']).default('nuevo'),
  source:         z.string().optional(),
  assignedTo:     z.number().int().nullable().optional(),
  estimatedValue: z.string().optional(),
  notes:          z.string().optional(),
});

const updateLeadSchema = createLeadSchema.partial().extend({
  convertedToCompanyId: z.number().int().nullable().optional(),
  convertedAt:          z.string().datetime().optional(),
});

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeLead(l: typeof platformLeads.$inferSelect) {
  return {
    id:                   toId('lead', l.id),
    companyName:          l.companyName,
    contactName:          l.contactName,
    contactEmail:         l.contactEmail,
    contactPhone:         l.contactPhone,
    industry:             l.industry,
    country:              l.country,
    city:                 l.city,
    status:               l.status,
    source:               l.source,
    assignedTo:           l.assignedTo,
    estimatedValue:       l.estimatedValue,
    notes:                l.notes,
    convertedToCompanyId: l.convertedToCompanyId
      ? toId('company', l.convertedToCompanyId)
      : null,
    convertedAt:          l.convertedAt,
    createdAt:            l.createdAt,
    updatedAt:            l.updatedAt,
  };
}

// ─── GET /platform/leads ──────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = db.select().from(platformLeads).orderBy(platformLeads.createdAt);
    const rows = status
      ? await db.select().from(platformLeads).where(eq(platformLeads.status, status as string))
      : await query;
    res.json({ data: rows.map(serializeLead), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── GET /platform/leads/:id ─────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const leadId = parseId('lead', req.params.id);
    const [row] = await db
      .select()
      .from(platformLeads)
      .where(eq(platformLeads.id, leadId))
      .limit(1);
    if (!row) throw new NotFoundError('Lead', req.params.id);
    res.json(serializeLead(row));
  } catch (err) {
    next(err);
  }
});

// ─── POST /platform/leads ─────────────────────────────────────────────────────

router.post('/', validate(createLeadSchema), async (req, res, next) => {
  try {
    const [created] = await db
      .insert(platformLeads)
      .values(req.body)
      .returning();

    await logAudit(db, null, {
      entity:      'platform_leads',
      entityId:    toId('lead', created.id),
      action:      'create',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: `Lead "${created.companyName}" creado.`,
    });

    res.status(201).json(serializeLead(created));
  } catch (err) {
    next(err);
  }
});

// ─── PUT /platform/leads/:id ─────────────────────────────────────────────────

router.put('/:id', validate(updateLeadSchema), async (req, res, next) => {
  try {
    const leadId = parseId('lead', req.params.id);

    const [existing] = await db
      .select()
      .from(platformLeads)
      .where(eq(platformLeads.id, leadId))
      .limit(1);
    if (!existing) throw new NotFoundError('Lead', req.params.id);

    const updateData = { ...req.body, updatedAt: new Date() };

    // Si se convierte a empresa, registrar timestamp
    if (req.body.convertedToCompanyId && !existing.convertedAt) {
      updateData.convertedAt = new Date();
      updateData.status = 'ganado';
    }

    const [updated] = await db
      .update(platformLeads)
      .set(updateData)
      .where(eq(platformLeads.id, leadId))
      .returning();

    await logAudit(db, null, {
      entity:      'platform_leads',
      entityId:    toId('lead', updated.id),
      action:      'update',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: `Lead "${updated.companyName}" actualizado a "${updated.status}".`,
    });

    res.json(serializeLead(updated));
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /platform/leads/:id ──────────────────────────────────────────────

router.delete('/:id', async (req, res, next) => {
  try {
    const leadId = parseId('lead', req.params.id);

    const [existing] = await db
      .select()
      .from(platformLeads)
      .where(eq(platformLeads.id, leadId))
      .limit(1);
    if (!existing) throw new NotFoundError('Lead', req.params.id);

    await db.delete(platformLeads).where(eq(platformLeads.id, leadId));

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;