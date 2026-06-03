import { Router } from 'express';
import { eq, sql, count } from 'drizzle-orm';
import { db } from '../../db/client';
import { companies, platformPlans } from '../../db/schema/platform';
import { companyAssets, companyAlerts } from '../../db/schema/operational';

const router = Router();

// ─── GET /platform/fleet-health ──────────────────────────────────────────────
// Panel de salud operativa para el superadmin.
// Devuelve por empresa: assets reales vs límite del plan, alertas activas.

router.get('/', async (req, res, next) => {
  try {
    // 1. Empresas con info de su plan
    const rows = await db
      .select({
        companyId:   companies.id,
        name:        companies.name,
        slug:        companies.slug,
        status:      companies.status,
        planId:      companies.planId,
        planName:    platformPlans.name,
        tier:        platformPlans.tier,
        maxAssets:   platformPlans.maxAssets,
        maxUsers:    platformPlans.maxUsers,
      })
      .from(companies)
      .leftJoin(platformPlans, eq(companies.planId, platformPlans.id))
      .orderBy(platformPlans.tier, companies.name);

    // 2. Assets totales por empresa
    const assetCounts = await db
      .select({
        companyId:   companyAssets.companyId,
        totalAssets: count().as('total_assets'),
      })
      .from(companyAssets)
      .groupBy(companyAssets.companyId);

    const assetMap = new Map(
      assetCounts.map((r) => [r.companyId, Number(r.totalAssets)])
    );

    // 3. Alertas críticas (Alta + Abierta) y de atención (Media + Abierta / cualquier En seguimiento)
    const alertCounts = await db
      .select({
        companyId: companyAlerts.companyId,
        critical: sql<number>`
          count(*) filter (
            where ${companyAlerts.severity} = 'Alta'
            and   ${companyAlerts.status}   = 'Abierta'
          )
        `.as('critical'),
        warning: sql<number>`
          count(*) filter (
            where (
              (${companyAlerts.severity} = 'Media' and ${companyAlerts.status} = 'Abierta')
              or ${companyAlerts.status} = 'En seguimiento'
            )
          )
        `.as('warning'),
      })
      .from(companyAlerts)
      .groupBy(companyAlerts.companyId);

    const alertMap = new Map(
      alertCounts.map((r) => [
        r.companyId,
        { critical: Number(r.critical), warning: Number(r.warning) },
      ])
    );

    // 4. Ensamblar respuesta
    const data = rows.map((c) => {
      const totalAssets   = assetMap.get(c.companyId) ?? 0;
      const alerts        = alertMap.get(c.companyId) ?? { critical: 0, warning: 0 };
      const maxAssets     = c.maxAssets ?? null;
      const saturation    = maxAssets && maxAssets > 0
        ? Math.round((totalAssets / maxAssets) * 100)
        : null;

      return {
        companyId:      c.companyId,
        name:           c.name,
        slug:           c.slug,
        status:         c.status,
        planId:         c.planId,
        planName:       c.planName ?? c.planId,
        tier:           c.tier,
        maxAssets,
        maxUsers:       c.maxUsers ?? null,
        totalAssets,
        saturation,                          // % 0-100, null si plan sin límite
        nearLimit:      saturation !== null && saturation >= 80,
        criticalAlerts: alerts.critical,
        warningAlerts:  alerts.warning,
      };
    });

    res.json({ data, generatedAt: new Date() });
  } catch (err) {
    next(err);
  }
});

export default router;