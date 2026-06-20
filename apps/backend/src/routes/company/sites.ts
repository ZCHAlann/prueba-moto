import { Router } from 'express';
import { z } from 'zod';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { companySites, companyAssets, companyDrivers } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createSiteSchema = z.object({
  code: z.string().trim().min(1, 'El código es requerido').max(40),
  name: safeString({ min: 2, max: 120, fieldLabel: 'Nombre', allowEmpty: false }),
  city: safeString({ min: 2, max: 100, fieldLabel: 'Ciudad', allowEmpty: false }),
  address: safeString({ min: 5, max: 250, fieldLabel: 'Dirección', allowEmpty: false }),
  contact: validators.phone,
  status: z.enum(['Activa', 'Inactiva']).default('Activa'),
  notes: validators.longTextOptional,
});

const updateSiteSchema = createSiteSchema.partial();

// ─── GET /company/:id/sites ───────────────────────────────────────────────────
// Devuelve cada sede con sus vehículos y conductores vinculados (enrichment),
// para que el frontend no tenga que cruzar con useAssets()/useDrivers() por
// su cuenta. Esto evita inconsistencias de timing/formato de id en el cliente.

router.get('/', requireModule('gestion', 'sedes'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const rows = await db
      .select()
      .from(companySites)
      .where(eq(companySites.companyId, companyId))
      .orderBy(companySites.name);

    const siteIds = rows.map((s) => s.id);

    const [assetRows, driverRows] = siteIds.length
      ? await Promise.all([
          db
            .select({
              id:     companyAssets.id,
              siteId: companyAssets.siteId,
              name:   companyAssets.name,
              plate:  companyAssets.plate,
              status: companyAssets.status,
              brand:  companyAssets.brand,
              model:  companyAssets.model,
            })
            .from(companyAssets)
            .where(and(eq(companyAssets.companyId, companyId), inArray(companyAssets.siteId, siteIds))),
          db
            .select({
              id:          companyDrivers.id,
              siteId:      companyDrivers.siteId,
              firstName:   companyDrivers.firstName,
              lastName:    companyDrivers.lastName,
              status:      companyDrivers.status,
              licenseType: companyDrivers.licenseType,
            })
            .from(companyDrivers)
            .where(and(eq(companyDrivers.companyId, companyId), inArray(companyDrivers.siteId, siteIds))),
        ])
      : [[], []];

    // Agrupar por siteId para no hacer N+1 queries.
    const assetsBySite = new Map<number, typeof assetRows>();
    for (const a of assetRows) {
      if (a.siteId == null) continue;
      if (!assetsBySite.has(a.siteId)) assetsBySite.set(a.siteId, []);
      assetsBySite.get(a.siteId)!.push(a);
    }
    const driversBySite = new Map<number, typeof driverRows>();
    for (const d of driverRows) {
      if (d.siteId == null) continue;
      if (!driversBySite.has(d.siteId)) driversBySite.set(d.siteId, []);
      driversBySite.get(d.siteId)!.push(d);
    }

    res.json({
      data: rows.map((s) =>
        serializeSite(s, assetsBySite.get(s.id) ?? [], driversBySite.get(s.id) ?? []),
      ),
      total: rows.length,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/sites ──────────────────────────────────────────────────

router.post(
  '/',
  requireModule('gestion', 'sedes'),
  requireAdmin,
  validate(createSiteSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createSiteSchema>;

      const [created] = await db
        .insert(companySites)
        .values({ ...body, companyId })
        .returning();

      await logAudit(db, companyId, {
        entity: 'sites',
        entityId: toId('site', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Sede "${created.name}" creada.`,
      });

      res.status(201).json(serializeSite(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/sites/:siteId ──────────────────────────────────────────

router.put(
  '/:siteId',
  requireModule('gestion', 'sedes'),
  requireAdmin,
  validate(updateSiteSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const siteId = parseId('site', req.params.siteId);
      const body = req.body as z.infer<typeof updateSiteSchema>;

      const existing = await db
        .select()
        .from(companySites)
        .where(and(eq(companySites.id, siteId), eq(companySites.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Sede', req.params.siteId);

      const [updated] = await db
        .update(companySites)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(companySites.id, siteId), eq(companySites.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity: 'sites',
        entityId: toId('site', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Sede "${updated.name}" actualizada.`,
      });

      res.json(serializeSite(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/sites/:siteId ───────────────────────────────────────

router.delete(
  '/:siteId',
  requireModule('gestion', 'sedes'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const siteId = parseId('site', req.params.siteId);

      const existing = await db
        .select()
        .from(companySites)
        .where(and(eq(companySites.id, siteId), eq(companySites.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Sede', req.params.siteId);

      await db
        .delete(companySites)
        .where(and(eq(companySites.id, siteId), eq(companySites.companyId, companyId)));

      await logAudit(db, companyId, {
        entity: 'sites',
        entityId: toId('site', siteId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Sede "${existing[0].name}" eliminada.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeSite(
  s: typeof companySites.$inferSelect,
  linkedAssets: Array<{ id: number; name: string; plate: string | null; status: string | null; brand: string | null; model: string | null }> = [],
  linkedDrivers: Array<{ id: number; firstName: string; lastName: string; status: string | null; licenseType: string | null }> = [],
) {
  return {
    id: toId('site', s.id),
    companyId: toId('company', s.companyId),
    code: s.code,
    name: s.name,
    city: s.city,
    address: s.address,
    contact: s.contact,
    status: s.status,
    notes: s.notes,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    // ── Enrichment: vehículos y conductores vinculados a esta sede ──────────
    assetCount: linkedAssets.length,
    driverCount: linkedDrivers.length,
    assets: linkedAssets.map((a) => ({
      id: toId('asset', a.id),
      name: a.name,
      plate: a.plate,
      status: a.status,
      brand: a.brand,
      model: a.model,
    })),
    drivers: linkedDrivers.map((d) => ({
      id: toId('driver', d.id),
      firstName: d.firstName,
      lastName: d.lastName,
      status: d.status,
      licenseType: d.licenseType,
    })),
  };
}
export default router;