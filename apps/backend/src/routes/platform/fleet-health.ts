import { Router } from 'express';
import { eq, sql, count, and, gte, lt } from 'drizzle-orm';
import { db } from '../../db/client';
import { companies, platformPlans } from '../../db/schema/platform';
import { companyAssets, companyAlerts } from '../../db/schema/operational';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Retorna array de 12 fechas [mes-11, mes-10, ..., mes actual] en UTC */
function getLast12MonthStarts(): Date[] {
  const months: Date[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setUTCMonth(now.getUTCMonth() - i);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    months.push(d);
  }
  return months;
}

function monthKey(d: Date | string): string {
  // Drizzle a veces devuelve el resultado de `sql<Date>...` como string
  // ISO (ej: "2026-07-01 00:00:00+00"). Lo aceptamos y parseamos.
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`monthKey: invalid date value: ${String(d)}`);
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MONTH_LABELS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Etiquetas de los 12 meses que cubren `last12Months`. Se devuelven
 *  al frontend para que la gráfica NO asuma Ene..Dic del año corriente. */
function getLast12MonthLabels(): string[] {
  return getLast12MonthStarts().map((d) => MONTH_LABELS_ES[d.getUTCMonth()]);
}

// ─── GET /platform/fleet-health ──────────────────────────────────────────────
// Panel de salud operativa para el superadmin.
// Devuelve por empresa:
//   - info de plan
//   - assets totales (snapshot actual)
//   - assetsByMonth: # de assets NUEVOS por mes (últimos 12)
//   - totalByMonth: acumulado de assets hasta fin de ese mes (running total)
//   - alertas activas (críticas + atención)
//
// Antes del mes de creación de la empresa, los valores son 0 (la
// empresa no existía, no podía tener assets). El último valor de
// `totalByMonth` siempre coincide con `totalAssets` para coherencia.

router.get('/', async (req, res, next) => {
  try {
    // 1. Empresas con info de su plan
    const rows = await db
      .select({
        companyId: companies.id,
        name:      companies.name,
        slug:      companies.slug,
        status:    companies.status,
        planId:    companies.planId,
        planName:  platformPlans.name,
        tier:      platformPlans.tier,
        maxAssets: platformPlans.maxAssets,
        maxUsers:  platformPlans.maxUsers,
        createdAt: companies.createdAt,
      })
      .from(companies)
      .leftJoin(platformPlans, eq(companies.planId, platformPlans.id))
      .orderBy(platformPlans.tier, companies.name);

    // 2. Assets totales por empresa (snapshot actual)
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

    // 3. Assets creados por mes (últimos 12 meses), por empresa.
    //    Una sola query con date_trunc para evitar N+1.
    const last12Months = getLast12MonthStarts();
    const oldestMonth = last12Months[0];
    const newestMonthExclusive = new Date(last12Months[11]);
    newestMonthExclusive.setUTCMonth(newestMonthExclusive.getUTCMonth() + 1);

    const assetsByMonthRows = await db
      .select({
        companyId:  companyAssets.companyId,
        monthStart: sql<Date>`date_trunc('month', ${companyAssets.createdAt})`.as('month_start'),
        cnt:        count().as('cnt'),
      })
      .from(companyAssets)
      .where(
        and(
          gte(companyAssets.createdAt, oldestMonth),
          lt(companyAssets.createdAt, newestMonthExclusive),
        )
      )
      .groupBy(
        companyAssets.companyId,
        sql`date_trunc('month', ${companyAssets.createdAt})`,
      );

    // Indexar por (companyId, "YYYY-MM") para lookup O(1).
    type ByMonthMap = Map<number, Map<string, number>>;
    const assetsByMonthMap: ByMonthMap = new Map();
    for (const r of assetsByMonthRows) {
      const companyMap = assetsByMonthMap.get(r.companyId) ?? new Map<string, number>();
      const key = monthKey(r.monthStart as unknown as Date);
      companyMap.set(key, Number(r.cnt));
      assetsByMonthMap.set(r.companyId, companyMap);
    }

    // 4. Alertas críticas + atención
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

    // 5. Ensamblar respuesta
    const data = rows.map((c) => {
      const totalAssets = assetMap.get(c.companyId) ?? 0;
      const alerts      = alertMap.get(c.companyId) ?? { critical: 0, warning: 0 };
      const maxAssets   = c.maxAssets ?? null;
      const saturation  = maxAssets && maxAssets > 0
        ? Math.round((totalAssets / maxAssets) * 100)
        : null;

      const companyMonthMap   = assetsByMonthMap.get(c.companyId) ?? new Map<string, number>();
      const companyCreatedKey = monthKey(c.createdAt);

      // Encontrar el primer índice de la ventana que es >= mes de creación.
      // Antes de ese índice → 0 (empresa no existía, 0 assets).
      const createdMonthIdx = last12Months.findIndex(
        (m) => monthKey(m) >= companyCreatedKey,
      );
      const safeCreatedIdx = createdMonthIdx < 0 ? 0 : createdMonthIdx;

      // assetsByMonth: # de assets NUEVOS en ese mes.
      const assetsByMonth: number[] = last12Months.map((m, idx) => {
        if (idx < safeCreatedIdx) return 0;
        return companyMonthMap.get(monthKey(m)) ?? 0;
      });

      // totalByMonth: acumulado. El último valor debe ser exactamente
      // `totalAssets` para que la línea cierre con el número real.
      // Si la query filtró por últimos 12 meses, los assets creados
      // ANTES de la ventana no se contaron. Los sumamos al primer mes
      // válido para mantener la coherencia con `totalAssets`.
      const sumInWindow = assetsByMonth.reduce((s, v) => s + v, 0);
      const beforeWindow = Math.max(0, totalAssets - sumInWindow);

      const totalByMonth: number[] = [];
      let running = 0;
      for (let i = 0; i < assetsByMonth.length; i++) {
        if (i < safeCreatedIdx) {
          totalByMonth.push(0);
        } else if (i === safeCreatedIdx) {
          running = assetsByMonth[i] + beforeWindow;
          totalByMonth.push(running);
        } else {
          running += assetsByMonth[i];
          totalByMonth.push(running);
        }
      }

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
        saturation,
        nearLimit:      saturation !== null && saturation >= 80,
        criticalAlerts: alerts.critical,
        warningAlerts:  alerts.warning,
        createdAt:      c.createdAt,
        assetsByMonth,
        totalByMonth,
      };
    });

    res.json({
      data,
      // Etiquetas dinámicas de los 12 meses que cubren `assetsByMonth`
      // y `totalByMonth`. Sin esto, el frontend hardcodeaba Ene..Dic
      // y las gráficas se desfasaban por la ventana móvil.
      monthLabels: getLast12MonthLabels(),
      generatedAt: new Date(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
