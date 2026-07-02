import { Router } from 'express';
import { eq, and, gte, lte, desc, sql, isNotNull } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyAuditEntries } from '../../db/schema/operational';
import { requireModule } from '../../middlewares/requireModule';
import { toId } from '../../lib/ids';
import { DEFAULT_GEO_TOLERANCE_M } from '../../lib/geo';
import { parsePageParams, buildPageResponse } from '../../lib/pagination';

const router = Router({ mergeParams: true });

// ─── GET /company/:id/audit ───────────────────────────────────────────────────
// Query: ?entity=assets &action=create &from=2024-01-01 &to=2024-12-31 &page=1 &pageSize=50
//
// Paginación SQL real: las condiciones del WHERE (incluyendo los filtros) se
// construyen UNA SOLA VEZ en `conds` y se reusan en la query de datos y en la
// query de count, para que `total` siempre refleje el universo que matchea el
// filtro real (no `data.length`, que sería solo la página).

router.get('/', requireModule('reportes'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { entity, action, from, to } = req.query;
    const { page, pageSize, offset } = parsePageParams(req.query as Record<string, unknown>, { pageSize: 50, maxPageSize: 100 });

    // WHERE compartido entre SELECT paginado y COUNT(*).
    const conds = [eq(companyAuditEntries.companyId, companyId)];
    if (entity && typeof entity === 'string') {
      conds.push(eq(companyAuditEntries.entity, entity));
    }
    if (action && typeof action === 'string') {
      conds.push(eq(companyAuditEntries.action, action));
    }
    if (from && typeof from === 'string') {
      const fromDate = new Date(from);
      if (!Number.isNaN(fromDate.getTime())) {
        conds.push(gte(companyAuditEntries.createdAt, fromDate));
      }
    }
    if (to && typeof to === 'string') {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        conds.push(lte(companyAuditEntries.createdAt, toDate));
      }
    }
    const where = conds.length > 0 ? and(...conds) : undefined;

    const [rows, countRow] = await Promise.all([
      db
        .select()
        .from(companyAuditEntries)
        .where(where)
        .orderBy(desc(companyAuditEntries.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(companyAuditEntries)
        .where(where),
    ]);

    const total = countRow?.[0]?.value ?? 0;
    res.json(buildPageResponse(rows.map(serializeEntry), total, page, pageSize));
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