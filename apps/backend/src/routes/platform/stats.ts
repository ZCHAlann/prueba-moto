import { Router } from 'express';
import { eq, sql, count, and, gte, lt, isNotNull } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companies,
  platformLeads,
  platformPlans,
  companyUsers,
} from '../../db/schema/platform';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Inicio del mes actual (UTC) */
function startOfCurrentMonth(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Inicio del mes anterior (UTC) */
function startOfPreviousMonth(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
}

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

/** Cuenta registros entre dos fechas */
async function countInRange(
  table: any,
  dateCol: any,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(table)
    .where(
      and(
        gte(dateCol, startDate),
        lt(dateCol, endDate)
      )
    );
  
  return Number(result?.count) || 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /platform/stats
// Devuelve KPIs globales + histórico de 12 meses
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const thisMonth = startOfCurrentMonth();
    const prevMonth = startOfPreviousMonth();
    const last12Months = getLast12MonthStarts();

    // ── 1. Totales de empresas ────────────────────────────────────────────────

    const [companyCounts] = await db
      .select({
        total:     count().as('total'),
        active:    sql<number>`count(*) filter (where ${companies.status} = 'active')`.as('active'),
        trial:     sql<number>`count(*) filter (where ${companies.status} = 'trial')`.as('trial'),
        suspended: sql<number>`count(*) filter (where ${companies.status} = 'suspended')`.as('suspended'),
        inactive:  sql<number>`count(*) filter (where ${companies.status} = 'inactive')`.as('inactive'),
        newThisMonth: sql<number>`
          count(*) filter (where ${companies.createdAt} >= ${thisMonth})
        `.as('new_this_month'),
        newPrevMonth: sql<number>`
          count(*) filter (where ${companies.createdAt} >= ${prevMonth}
                           and   ${companies.createdAt} <  ${thisMonth})
        `.as('new_prev_month'),
      })
      .from(companies);

    // ── 2. Histórico de empresas nuevas (últimos 12 meses) ────────────────────

    const companiesNewByMonth = await Promise.all(
      last12Months.map(async (monthStart, idx) => {
        const monthEnd = new Date(monthStart);
        monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
        return countInRange(companies, companies.createdAt, monthStart, monthEnd);
      })
    );

    // ── 3. Distribución por plan ──────────────────────────────────────────────

    const companiesByPlan = await db
      .select({
        planId: companies.planId,
        planName: platformPlans.name,
        tier: platformPlans.tier,
        total: count().as('total'),
      })
      .from(companies)
      .leftJoin(platformPlans, eq(companies.planId, platformPlans.id))
      .groupBy(companies.planId, platformPlans.name, platformPlans.tier)
      .orderBy(platformPlans.tier);

    // ── 4. KPIs de leads ─────────────────────────────────────────────────────

    const [leadCounts] = await db
      .select({
        total:           count().as('total'),
        nuevo:           sql<number>`count(*) filter (where ${platformLeads.status} = 'nuevo')`.as('nuevo'),
        contactado:      sql<number>`count(*) filter (where ${platformLeads.status} = 'contactado')`.as('contactado'),
        demoAgendada:    sql<number>`count(*) filter (where ${platformLeads.status} = 'demo_agendada')`.as('demo_agendada'),
        propuestaEnviada:sql<number>`count(*) filter (where ${platformLeads.status} = 'propuesta_enviada')`.as('propuesta_enviada'),
        ganado:          sql<number>`count(*) filter (where ${platformLeads.status} = 'ganado')`.as('ganado'),
        perdido:         sql<number>`count(*) filter (where ${platformLeads.status} = 'perdido')`.as('perdido'),
        newThisMonth:    sql<number>`
          count(*) filter (where ${platformLeads.createdAt} >= ${thisMonth})
        `.as('leads_new_this_month'),
        convertedThisMonth: sql<number>`
          count(*) filter (where ${platformLeads.convertedAt} >= ${thisMonth})
        `.as('leads_converted_this_month'),
      })
      .from(platformLeads);

    // ── 5. Histórico de leads nuevos (últimos 12 meses) ──────────────────────

    const leadsNewByMonth = await Promise.all(
      last12Months.map(async (monthStart) => {
        const monthEnd = new Date(monthStart);
        monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
        return countInRange(platformLeads, platformLeads.createdAt, monthStart, monthEnd);
      })
    );

    // ── 6. Histórico de leads ganados (últimos 12 meses) ─────────────────────

    const leadsWonByMonth = await Promise.all(
      last12Months.map(async (monthStart) => {
        const monthEnd = new Date(monthStart);
        monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
        
        const [result] = await db
          .select({ count: count() })
          .from(platformLeads)
          .where(
            and(
              eq(platformLeads.status, 'ganado'),
              gte(platformLeads.convertedAt, monthStart),
              lt(platformLeads.convertedAt, monthEnd)
            )
          );
        
        return Number(result?.count) || 0;
      })
    );

    // Valor estimado total de pipeline activo (no ganado/perdido)
    const [pipelineValue] = await db
      .select({
        total: sql<string>`
          coalesce(sum(${platformLeads.estimatedValue}), 0)
        `.as('pipeline_value'),
      })
      .from(platformLeads)
      .where(
        sql`${platformLeads.status} not in ('ganado', 'perdido')`
      );

    // ── 7. Total de usuarios de empresa ──────────────────────────────────────

    const [userCounts] = await db
      .select({
        total:  count().as('total'),
        active: sql<number>`count(*) filter (where ${companyUsers.status} = 'active')`.as('active'),
      })
      .from(companyUsers);

    // ── 8. Empresas con trial próximo a vencer (≤ 7 días) ────────────────────

    const trialExpiringSoon = await db
      .select({
        id:           companies.id,
        name:         companies.name,
        slug:         companies.slug,
        trialEndsAt:  companies.trialEndsAt,
        contactEmail: companies.contactEmail,
      })
      .from(companies)
      .where(
        and(
          eq(companies.status, 'trial'),
          isNotNull(companies.trialEndsAt),
          gte(companies.trialEndsAt!, now),
          lt(
            companies.trialEndsAt!,
            new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
          )
        )
      )
      .orderBy(companies.trialEndsAt!);

    // ── 9. Últimas 5 empresas creadas ─────────────────────────────────────────

    const recentCompanies = await db
      .select({
        id:       companies.id,
        name:     companies.name,
        slug:     companies.slug,
        planId:   companies.planId,
        status:   companies.status,
        createdAt:companies.createdAt,
      })
      .from(companies)
      .orderBy(sql`${companies.createdAt} desc`)
      .limit(5);

    // ── 10. Tasa de conversión de leads ──────────────────────────────────────

    const totalLeads    = Number(leadCounts.total)  || 0;
    const totalGanados  = Number(leadCounts.ganado) || 0;
    const conversionRate = totalLeads > 0
      ? Math.round((totalGanados / totalLeads) * 10000) / 100   // 2 decimales
      : 0;

    // ── 11. MoM growth (empresas) ────────────────────────────────────────────

    const newThisMonth = Number(companyCounts.newThisMonth) || 0;
    const newPrevMonth = Number(companyCounts.newPrevMonth) || 0;
    const companyGrowthMoM = newPrevMonth > 0
      ? Math.round(((newThisMonth - newPrevMonth) / newPrevMonth) * 10000) / 100
      : null;

    // ─────────────────────────────────────────────────────────────────────────
    // Respuesta
    // ─────────────────────────────────────────────────────────────────────────

    res.json({
      companies: {
        total:       Number(companyCounts.total),
        active:      Number(companyCounts.active),
        trial:       Number(companyCounts.trial),
        suspended:   Number(companyCounts.suspended),
        inactive:    Number(companyCounts.inactive),
        newThisMonth,
        growthMoM:   companyGrowthMoM,
        newByMonth:  companiesNewByMonth,  // array de 12 números
        byPlan:      companiesByPlan.map((r) => ({
          planId:   r.planId,
          planName: r.planName ?? r.planId,
          tier:     r.tier,
          total:    Number(r.total),
        })),
      },

      leads: {
        total:            Number(leadCounts.total),
        byStatus: {
          nuevo:            Number(leadCounts.nuevo),
          contactado:       Number(leadCounts.contactado),
          demoAgendada:     Number(leadCounts.demoAgendada),
          propuestaEnviada: Number(leadCounts.propuestaEnviada),
          ganado:           Number(leadCounts.ganado),
          perdido:          Number(leadCounts.perdido),
        },
        newThisMonth:     Number(leadCounts.newThisMonth),
        convertedThisMonth: Number(leadCounts.convertedThisMonth),
        newByMonth:       leadsNewByMonth,   // array de 12 números
        wonByMonth:       leadsWonByMonth,   // array de 12 números
        conversionRate,
        pipelineValue:    String(pipelineValue.total),
      },

      users: {
        total:  Number(userCounts.total),
        active: Number(userCounts.active),
      },

      alerts: {
        trialExpiringSoon: trialExpiringSoon.map((c) => ({
          id:           c.id,
          name:         c.name,
          slug:         c.slug,
          trialEndsAt:  c.trialEndsAt,
          contactEmail: c.contactEmail,
        })),
      },

      recent: {
        companies: recentCompanies,
      },

      generatedAt: now,
    });
  } catch (err) {
    next(err);
  }
});

export default router;