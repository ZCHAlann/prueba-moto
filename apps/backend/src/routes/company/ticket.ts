import { Router } from 'express';
import { db } from '../../db/client';
import { platformTickets, platformTicketMessages, platformUsers } from '../../db/schema';
import { eq, desc, and } from 'drizzle-orm';
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

const createSchema = z.object({
  title:       z.string().min(1).max(255),
  description: z.string().min(1),
  priority:    z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  category:    z.string().optional(),
});

const messageSchema = z.object({
  body: z.string().min(1),
});

// ─── GET /company/tickets ─────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const companyId = req.user!.companyId!;

    const tickets = await db
      .select({
        id:           platformTickets.id,
        ticketNumber: platformTickets.ticketNumber,
        title:        platformTickets.title,
        status:       platformTickets.status,
        priority:     platformTickets.priority,
        category:     platformTickets.category,
        resolvedAt:   platformTickets.resolvedAt,
        createdAt:    platformTickets.createdAt,
        updatedAt:    platformTickets.updatedAt,
        assignedToName: platformUsers.username,
      })
      .from(platformTickets)
      .leftJoin(platformUsers, eq(platformTickets.assignedTo, platformUsers.id))
      .where(eq(platformTickets.companyId, companyId))
      .orderBy(desc(platformTickets.createdAt));

    return res.json({ tickets });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/tickets/:id ─────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const companyId = req.user!.companyId!;
    const id        = Number(req.params.id);

    const [ticket] = await db
      .select()
      .from(platformTickets)
      .where(
        and(
          eq(platformTickets.id, id),
          eq(platformTickets.companyId, companyId)
        )
      )
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

// ─── POST /company/tickets ────────────────────────────────────────────────────

router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const companyId = req.user!.companyId!;
    const actor     = req.user!;
    const body      = req.body;

    const [ticket] = await db
      .insert(platformTickets)
      .values({
        companyId,
        createdBy:    Number(actor.sub.split('-').pop()),
        ticketNumber: ticketNumber(),
        title:        body.title,
        description:  body.description,
        priority:     body.priority ?? 'medium',
        category:     body.category ?? null,
        status:       'open',
      })
      .returning();

    return res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/tickets/:id/messages ───────────────────────────────────────

router.post('/:id/messages', validate(messageSchema), async (req, res, next) => {
  try {
    const companyId = req.user!.companyId!;
    const ticketId  = Number(req.params.id);
    const actor     = req.user!;

    // Verificar que el ticket pertenece a la empresa
    const [ticket] = await db
      .select({ id: platformTickets.id })
      .from(platformTickets)
      .where(
        and(
          eq(platformTickets.id, ticketId),
          eq(platformTickets.companyId, companyId)
        )
      )
      .limit(1);

    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });

    const [msg] = await db
      .insert(platformTicketMessages)
      .values({
        ticketId,
        authorCompanyUserId: Number(actor.sub.split('-').pop()),
        authorName: actor.name,
        authorRole: 'company',
        body:       req.body.body,
      })
      .returning();

    await db
      .update(platformTickets)
      .set({ updatedAt: new Date() })
      .where(eq(platformTickets.id, ticketId));

    return res.status(201).json(msg);
  } catch (err) {
    next(err);
  }
});

export default router;