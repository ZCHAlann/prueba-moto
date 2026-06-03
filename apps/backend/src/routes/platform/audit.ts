import { Router } from 'express';
import { db } from '../../db/client';
import { platformAuditEntries, platformUsers } from '../../db/schema/platform';
import { desc, eq, and, gte, lte, ilike, or } from 'drizzle-orm';
import { toId } from '../../lib/ids';

const router = Router();

// GET /platform/audit/stats
router.get('/stats', async (req, res, next) => {
  try {
    const { from, to } = req.query as Record<string, string>;

    const conditions = [];
    if (from) conditions.push(gte(platformAuditEntries.createdAt, new Date(from)));
    if (to)   conditions.push(lte(platformAuditEntries.createdAt, new Date(to)));
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select({
        action:    platformAuditEntries.action,
        entity:    platformAuditEntries.entity,
        actorEmail:platformAuditEntries.actorEmail,
        createdAt: platformAuditEntries.createdAt,
      })
      .from(platformAuditEntries)
      .where(where)
      .orderBy(desc(platformAuditEntries.createdAt));

    // ── Acciones por día (últimos 14 días) ─────────────────────────────────
    const last14: Record<string, number> = {};
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      last14[d.toISOString().slice(0, 10)] = 0;
    }
    for (const r of rows) {
      const day = new Date(r.createdAt).toISOString().slice(0, 10);
      if (day in last14) last14[day]++;
    }

    // ── Top acciones ───────────────────────────────────────────────────────
    const actionCount: Record<string, number> = {};
    for (const r of rows) {
      actionCount[r.action] = (actionCount[r.action] ?? 0) + 1;
    }
    const topActions = Object.entries(actionCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([action, count]) => ({ action, count }));

    // ── Por entidad ────────────────────────────────────────────────────────
    const entityCount: Record<string, number> = {};
    for (const r of rows) {
      const e = r.entity ?? 'unknown';
      entityCount[e] = (entityCount[e] ?? 0) + 1;
    }
    const byEntity = Object.entries(entityCount)
      .map(([entity, count]) => ({ entity, count }));

    // ── Top actores ────────────────────────────────────────────────────────
    const actorCount: Record<string, number> = {};
    for (const r of rows) {
      const a = r.actorEmail ?? 'sistema';
      actorCount[a] = (actorCount[a] ?? 0) + 1;
    }
    const topActors = Object.entries(actorCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([actor, count]) => ({ actor, count }));

    // ── Por hora del día ───────────────────────────────────────────────────
    const hourCount: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourCount[h] = 0;
    for (const r of rows) {
      const h = new Date(r.createdAt).getHours();
      hourCount[h]++;
    }
    const byHour = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: hourCount[h],
    }));

    res.json({ byDay: last14, topActions, byEntity, topActors, byHour, total: rows.length });
  } catch (err) {
    next(err);
  }
});


// GET /platform/audit
// Query params: page, limit, entity, action, actorId, from, to, search
router.get('/', async (req, res, next) => {
  try {
    const page    = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit   = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset  = (page - 1) * limit;

    const { entity, action, actorId, from, to, search } = req.query as Record<string, string>;

    const conditions = [];

    if (entity)   conditions.push(eq(platformAuditEntries.entity, entity));
    if (action)   conditions.push(eq(platformAuditEntries.action, action));
    if (actorId)  conditions.push(eq(platformAuditEntries.actorId, parseInt(actorId)));
    if (from)     conditions.push(gte(platformAuditEntries.createdAt, new Date(from)));
    if (to)       conditions.push(lte(platformAuditEntries.createdAt, new Date(to)));
    if (search) {
      conditions.push(
        or(
          ilike(platformAuditEntries.description, `%${search}%`),
          ilike(platformAuditEntries.actorEmail,  `%${search}%`),
          ilike(platformAuditEntries.action,      `%${search}%`),
        )
      );
    }

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(platformAuditEntries)
        .where(where)
        .orderBy(desc(platformAuditEntries.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ id: platformAuditEntries.id })
        .from(platformAuditEntries)
        .where(where),
    ]);

    res.json({
      data:  rows,
      total: countRows.length,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
});



export default router;