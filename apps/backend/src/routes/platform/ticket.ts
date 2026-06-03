import { Router } from 'express';
import { db } from '../../db/client';
import { platformTickets, platformTicketMessages, companies, platformUsers, companyUsers } from '../../db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { authenticate } from '../../middlewares/authenticate';
import { z } from 'zod';
import { validate } from '../../lib/validate';

const router = Router();
router.use(authenticate);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ticketNumber() {
  const now  = new Date();
  const y    = now.getFullYear();
  const m    = String(now.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `TKT-${y}${m}-${rand}`;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const updateSchema = z.object({
  status:     z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  priority:   z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assignedTo: z.number().int().positive().nullable().optional(),
});

const messageSchema = z.object({
  body: z.string().min(1),
});

// ─── GET /platform/tickets ────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { status, priority, companyId } = req.query;

    const conditions = [];
    if (status)    conditions.push(eq(platformTickets.status,    status as string));
    if (priority)  conditions.push(eq(platformTickets.priority,  priority as string));
    if (companyId) conditions.push(eq(platformTickets.companyId, Number(companyId)));

    const tickets = await db
      .select({
        id:           platformTickets.id,
        ticketNumber: platformTickets.ticketNumber,
        title:        platformTickets.title,
        description:  platformTickets.description,
        status:       platformTickets.status,
        priority:     platformTickets.priority,
        category:     platformTickets.category,
        resolvedAt:   platformTickets.resolvedAt,
        closedAt:     platformTickets.closedAt,
        createdAt:    platformTickets.createdAt,
        updatedAt:    platformTickets.updatedAt,
        companyId:    companies.id,
        companyName:  companies.name,
        companySlug:  companies.slug,
        assignedToId:   platformUsers.id,
        assignedToName: platformUsers.username,
        createdByName:  companyUsers.username,
      })
      .from(platformTickets)
      .leftJoin(companies,     eq(platformTickets.companyId,  companies.id))
      .leftJoin(platformUsers, eq(platformTickets.assignedTo, platformUsers.id))
      .leftJoin(companyUsers,  eq(platformTickets.createdBy,  companyUsers.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(platformTickets.createdAt));

    // ── Stats ─────────────────────────────────────────────────────────────
    const [stats] = await db
      .select({
        total:       sql<number>`count(*)`,
        open:        sql<number>`count(case when status = 'open' then 1 end)`,
        inProgress:  sql<number>`count(case when status = 'in_progress' then 1 end)`,
        resolved:    sql<number>`count(case when status = 'resolved' then 1 end)`,
        critical:    sql<number>`count(case when priority = 'critical' then 1 end)`,
      })
      .from(platformTickets);

    return res.json({ tickets, stats });
  } catch (err) {
    next(err);
  }
});

// ─── GET /platform/tickets/:id — detalle con mensajes ─────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    const [ticket] = await db
      .select({
        id:           platformTickets.id,
        ticketNumber: platformTickets.ticketNumber,
        title:        platformTickets.title,
        description:  platformTickets.description,
        status:       platformTickets.status,
        priority:     platformTickets.priority,
        category:     platformTickets.category,
        resolvedAt:   platformTickets.resolvedAt,
        closedAt:     platformTickets.closedAt,
        createdAt:    platformTickets.createdAt,
        updatedAt:    platformTickets.updatedAt,
        companyId:    companies.id,
        companyName:  companies.name,
        assignedToId:   platformUsers.id,
        assignedToName: platformUsers.username,
        createdByName:  companyUsers.username,
      })
      .from(platformTickets)
      .leftJoin(companies,     eq(platformTickets.companyId,  companies.id))
      .leftJoin(platformUsers, eq(platformTickets.assignedTo, platformUsers.id))
      .leftJoin(companyUsers,  eq(platformTickets.createdBy,  companyUsers.id))
      .where(eq(platformTickets.id, id))
      .limit(1);

    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

    const messages = await db
      .select()
      .from(platformTicketMessages)
      .where(eq(platformTicketMessages.ticketId, id))
      .orderBy(platformTicketMessages.createdAt);

    return res.json({ ticket, messages });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /platform/tickets/:id ────────────────────────────────────────────────

router.put('/:id', validate(updateSchema), async (req, res, next) => {
  try {
    const id   = Number(req.params.id);
    const body = req.body;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status     !== undefined) patch.status     = body.status;
    if (body.priority   !== undefined) patch.priority   = body.priority;
    if (body.assignedTo !== undefined) patch.assignedTo = body.assignedTo;

    if (body.status === 'resolved') patch.resolvedAt = new Date();
    if (body.status === 'closed')   patch.closedAt   = new Date();

    const [updated] = await db
      .update(platformTickets)
      .set(patch)
      .where(eq(platformTickets.id, id))
      .returning();

    return res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── POST /platform/tickets/:id/messages ──────────────────────────────────────

router.post('/:id/messages', validate(messageSchema), async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    const actor    = req.user!;

    const [msg] = await db
      .insert(platformTicketMessages)
      .values({
        ticketId,
        authorPlatformUserId: Number(actor.sub.split('-').pop()),
        authorName:  actor.name,
        authorRole:  'platform',
        body:        req.body.body,
      })
      .returning();

    // Auto-pasar a in_progress si estaba open
    await db
      .update(platformTickets)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(
        and(
          eq(platformTickets.id, ticketId),
          eq(platformTickets.status, 'open')
        )
      );

    return res.status(201).json(msg);
  } catch (err) {
    next(err);
  }
});

export default router;