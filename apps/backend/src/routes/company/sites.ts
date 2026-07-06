import { Router } from 'express';
import { z } from 'zod';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { companySites, companyAssets, companyDrivers } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';
import { invalidateSiteStatusCache } from '../../lib/userStatus.db';
import { notifyEntityCrud } from '../../lib/notify-entity';

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

      try {
        await notifyEntityCrud({
          companyId, actorSub: req.user!.sub, actorName: req.user!.name,
          crudKind: 'entity_created', entityKey: 'Sede',
          entityId: created.id, entityLabel: created.name,
        });
      } catch (err) {
        console.warn('[sites] notify falló (no crítico):', (err as Error).message);
      }

      res.status(201).json(serializeSite(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /company/:id/sites/:siteId/impact ────────────────────────────────────
//
// Devuelve el conteo de conductores/vehículos que se verían afectados
// si esta sede pasa a 'Inactiva'. El frontend lo usa para mostrar el
// modal de confirmación con números reales (Fase 3.2) sin tener que
// hacer el PUT todavía.

router.get('/:siteId/impact', requireModule('gestion', 'sedes'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const siteId = parseId('site', req.params.siteId);

    // 1) Sede debe existir y pertenecer a la empresa
    const [site] = await db
      .select({ id: companySites.id, name: companySites.name, status: companySites.status })
      .from(companySites)
      .where(and(eq(companySites.id, siteId), eq(companySites.companyId, companyId)))
      .limit(1);
    if (!site) throw new NotFoundError('Sede', req.params.siteId);

    // 2) Conteos
    const driverRows = await db
      .select({ status: companyDrivers.status })
      .from(companyDrivers)
      .where(and(eq(companyDrivers.companyId, companyId), eq(companyDrivers.siteId, siteId)));

    const driversActivosCount   = driverRows.filter(d => d.status === 'Activo').length;
    const driversInactivosCount = driverRows.filter(d => d.status === 'Inactivo').length;

    const [assetRow] = await db
      .select({ value: sql<number>`cast(count(*) as int)` })
      .from(companyAssets)
      .where(and(eq(companyAssets.companyId, companyId), eq(companyAssets.siteId, siteId)));

    const affectedDriversOnDeactivation = driversActivosCount;

    res.json({
      site: {
        id: toId('site', site.id),
        name: site.name,
        status: site.status,
      },
      // Conductores que tienen status='Activo' y se bloquearían si la sede pasa a Inactiva
      affectedDriversOnDeactivation,
      // Desglose útil para el modal
      driversActivosCount,
      driversInactivosCount,
      assetsCount: assetRow?.value ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

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

      const previousStatus = existing[0]!.status;
      const newStatus      = body.status ?? previousStatus;

      const [updated] = await db
        .update(companySites)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(companySites.id, siteId), eq(companySites.companyId, companyId)))
        .returning();

      // Si cambió el status de la sede, contar conductores afectados y
      // registrar en auditoría. La cascada NO se persiste en company_drivers
      // (se calcula dinámicamente vía isUserEffectivelyActive), pero sí
      // queremos dejar rastro de quién decidió inactivar la sede.
      let auditDescription = `Sede "${updated.name}" actualizada.`;
      let affectedDriversCount = 0;

      if (previousStatus === 'Activa' && newStatus === 'Inactiva') {
        // Contar conductores activos que se bloquearán por la cascada
        const affected = await db
          .select({ value: sql<number>`cast(count(*) as int)` })
          .from(companyDrivers)
          .where(and(
            eq(companyDrivers.companyId, companyId),
            eq(companyDrivers.siteId, siteId),
            eq(companyDrivers.status, 'Activo'),
          ));
        affectedDriversCount = affected[0]?.value ?? 0;

        auditDescription = `Sede "${updated.name}" desactivada. ${affectedDriversCount} conductor${affectedDriversCount !== 1 ? 'es' : ''} quedará${affectedDriversCount !== 1 ? 'n' : ''} sin acceso por cascada.`;

        // Invalidar el cache de statusEffectivo para que la próxima
        // request de cualquier conductor de esta sede vea el cambio
        // sin esperar al TTL de 60s.
        invalidateSiteStatusCache(siteId);
      } else if (previousStatus === 'Inactiva' && newStatus === 'Activa') {
        // Reactivación: los conductores manualmente Activos vuelven
        // a tener acceso automático. También invalidamos cache.
        invalidateSiteStatusCache(siteId);
        auditDescription = `Sede "${updated.name}" reactivada. Los conductores con estado manual Activo recuperan el acceso automáticamente.`;
      }

      await logAudit(db, companyId, {
        entity: 'sites',
        entityId: toId('site', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: auditDescription,
        metadata: {
          previousStatus,
          newStatus,
          affectedDriversCount,
        },
      });

      try {
        await notifyEntityCrud({
          companyId, actorSub: req.user!.sub, actorName: req.user!.name,
          crudKind: 'entity_updated', entityKey: 'Sede',
          entityId: updated.id, entityLabel: updated.name,
          extra: {
            previousStatus,
            newStatus,
            affectedDriversCount,
          },
        });
      } catch (err) {
        console.warn('[sites] notify falló (no crítico):', (err as Error).message);
      }

      // Devolvemos el conteo en la response para que el frontend
      // (toast / UI) pueda mostrarlo sin pedir un GET extra.
      res.json({
        ...serializeSite(updated),
        _impact: {
          previousStatus,
          newStatus,
          affectedDriversCount,
        },
      });
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

      try {
        await notifyEntityCrud({
          companyId, actorSub: req.user!.sub, actorName: req.user!.name,
          crudKind: 'entity_deleted', entityKey: 'Sede',
          entityId: existing[0].id, entityLabel: existing[0].name,
        });
      } catch (err) {
        console.warn('[sites] notify falló (no crítico):', (err as Error).message);
      }

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