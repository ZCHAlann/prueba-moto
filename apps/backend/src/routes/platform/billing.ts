import { Router } from 'express';
import { db } from '../../db/client';
import { platformInvoices, companies, platformPlans } from '../../db/schema';
import { eq, desc, sql, and, gte, lte } from 'drizzle-orm';
import { authenticate } from '../../middlewares/authenticate';
import { z } from 'zod';
import { validate } from '../../lib/validate';

const router = Router();
router.use(authenticate);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function invoiceNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `INV-${y}${m}-${rand}`;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSchema = z.object({
  companyId: z.number().int().positive(),
  planId:    z.string().optional(),
  cycle:     z.enum(['monthly', 'annual']).default('monthly'),
  amount:    z.number().positive(),
  tax:       z.number().min(0).default(0),
  issuedAt:  z.string(),   // 'YYYY-MM-DD'
  dueAt:     z.string(),
  notes:     z.string().optional(),
});

const updateSchema = z.object({
  status:  z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']).optional(),
  paidAt:  z.string().optional(),
  notes:   z.string().optional(),
});

// ─── GET /platform/billing — lista + stats ────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { from, to, status, companyId } = req.query;

    const conditions = [];
    if (from)       conditions.push(gte(platformInvoices.issuedAt, from as string));
    if (to)         conditions.push(lte(platformInvoices.issuedAt, to as string));
    if (status)     conditions.push(eq(platformInvoices.status, status as string));
    if (companyId)  conditions.push(eq(platformInvoices.companyId, Number(companyId)));

    const invoices = await db
      .select({
        id:            platformInvoices.id,
        invoiceNumber: platformInvoices.invoiceNumber,
        status:        platformInvoices.status,
        cycle:         platformInvoices.cycle,
        amount:        platformInvoices.amount,
        tax:           platformInvoices.tax,
        total:         platformInvoices.total,
        issuedAt:      platformInvoices.issuedAt,
        dueAt:         platformInvoices.dueAt,
        paidAt:        platformInvoices.paidAt,
        notes:         platformInvoices.notes,
        createdAt:     platformInvoices.createdAt,
        companyId:     companies.id,
        companyName:   companies.name,
        companySlug:   companies.slug,
        planId:        platformPlans.id,
        planName:      platformPlans.name,
      })
      .from(platformInvoices)
      .leftJoin(companies,     eq(platformInvoices.companyId, companies.id))
      .leftJoin(platformPlans, eq(platformInvoices.planId,    platformPlans.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(platformInvoices.issuedAt));

    // ── Stats agregados ───────────────────────────────────────────────────
    const [agg] = await db
      .select({
        totalRevenue: sql<number>`coalesce(sum(case when status = 'paid' then total::numeric else 0 end), 0)`,
        totalPending: sql<number>`coalesce(sum(case when status in ('sent','draft') then total::numeric else 0 end), 0)`,
        totalOverdue: sql<number>`coalesce(sum(case when status = 'overdue' then total::numeric else 0 end), 0)`,
        countPaid:    sql<number>`count(case when status = 'paid' then 1 end)`,
        countPending: sql<number>`count(case when status in ('sent','draft') then 1 end)`,
        countOverdue: sql<number>`count(case when status = 'overdue' then 1 end)`,
      })
      .from(platformInvoices)
      .where(conditions.length ? and(...conditions) : undefined);

    // ── Revenue por mes (últimos 12) ──────────────────────────────────────
    const byMonth = await db.execute(sql`
      SELECT
        to_char(issued_at, 'YYYY-MM') AS month,
        coalesce(sum(case when status = 'paid' then total::numeric else 0 end), 0) AS revenue,
        count(*) AS invoices
      FROM platform_invoices
      WHERE issued_at >= now() - interval '12 months'
      GROUP BY month
      ORDER BY month ASC
    `);

    // ── Revenue por plan ──────────────────────────────────────────────────
    const byPlan = await db.execute(sql`
      SELECT
        coalesce(pp.name, 'Sin plan') AS plan,
        coalesce(sum(case when pi.status = 'paid' then pi.total::numeric else 0 end), 0) AS revenue,
        count(*) AS invoices
      FROM platform_invoices pi
      LEFT JOIN platform_plans pp ON pi.plan_id = pp.id
      GROUP BY pp.name
      ORDER BY revenue DESC
    `);

    return res.json({
      invoices,
      stats: {
        ...agg,
        byMonth: byMonth.rows,
        byPlan:  byPlan.rows,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /platform/billing ───────────────────────────────────────────────────

router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const body = req.body;
    const total = Number(body.amount) + Number(body.tax ?? 0);

    const [invoice] = await db
      .insert(platformInvoices)
      .values({
        companyId:     body.companyId,
        planId:        body.planId ?? null,
        invoiceNumber: invoiceNumber(),
        status:        'draft',
        cycle:         body.cycle,
        amount:        String(body.amount),
        tax:           String(body.tax ?? 0),
        total:         String(total),
        issuedAt:      body.issuedAt,
        dueAt:         body.dueAt,
        notes:         body.notes ?? null,
      })
      .returning();

    return res.status(201).json(invoice);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /platform/billing/:id ────────────────────────────────────────────────

router.put('/:id', validate(updateSchema), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = req.body;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) patch.status = body.status;
    if (body.paidAt !== undefined) patch.paidAt = body.paidAt;
    if (body.notes  !== undefined) patch.notes  = body.notes;

    // Auto-set paidAt si status cambia a paid
    if (body.status === 'paid' && !body.paidAt) {
      patch.paidAt = new Date().toISOString().slice(0, 10);
    }

    const [updated] = await db
      .update(platformInvoices)
      .set(patch)
      .where(eq(platformInvoices.id, id))
      .returning();

    return res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /platform/billing/:id ────────────────────────────────────────────

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await db.delete(platformInvoices).where(eq(platformInvoices.id, id));
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;