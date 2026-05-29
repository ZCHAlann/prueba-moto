import { Router } from 'express';
import { eq, and, gte, lte } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyAuditEntries } from '../../db/schema/operational';
import { requireModule } from '../../middlewares/requireModule';
import { toId } from '../../lib/ids';

const router = Router({ mergeParams: true });

const PAGE_SIZE = 50;

// ─── GET /company/:id/audit ───────────────────────────────────────────────────
// Query: ?entity=assets &action=create &from=2024-01-01 &to=2024-12-31 &page=1

router.get('/', requireModule('reportes'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { entity, action, from, to, page } = req.query;
    const pageNum = Math.max(1, parseInt((page as string) || '1', 10));
    const offset = (pageNum - 1) * PAGE_SIZE;

    let rows = await db
      .select()
      .from(companyAuditEntries)
      .where(eq(companyAuditEntries.companyId, companyId))
      .orderBy(companyAuditEntries.createdAt);

    // Filtros en memoria (el volumen de auditoría por empresa es manejable)
    if (entity && typeof entity === 'string') {
      rows = rows.filter((r) => r.entity === entity);
    }
    if (action && typeof action === 'string') {
      rows = rows.filter((r) => r.action === action);
    }
    if (from && typeof from === 'string') {
      const fromDate = new Date(from);
      rows = rows.filter((r) => r.createdAt >= fromDate);
    }
    if (to && typeof to === 'string') {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      rows = rows.filter((r) => r.createdAt <= toDate);
    }

    const total = rows.length;
    const paginated = rows
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + PAGE_SIZE);

    res.json({
      data: paginated.map(serializeEntry),
      total,
      page: pageNum,
      pageSize: PAGE_SIZE,
      pages: Math.ceil(total / PAGE_SIZE),
    });
  } catch (err) {
    next(err);
  }
});

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeEntry(e: typeof companyAuditEntries.$inferSelect) {
  return {
    id: e.id,
    companyId: toId('company', e.companyId),
    entity: e.entity,
    entityId: e.entityId,
    action: e.action,
    actorId: e.actorId ? toId('company-user', e.actorId) : null,
    actorName: e.actorName,
    description: e.description,
    metadata: e.metadata,
    createdAt: e.createdAt,
  };
}

export default router;