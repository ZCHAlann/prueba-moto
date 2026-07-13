import { Router } from 'express';
import { eq, sql, count, and, isNotNull } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companies,
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
  const start = startDate.toISOString();
  const end = endDate.toISOString();
  
  const [result] = await db
    .select({ count: count() })
    .from(table)
    .where(
      and(
        sql`${dateCol} >= ${start}::timestamptz`,
        sql`${dateCol} < ${end}::timestamptz`
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
          count(*) filter (where ${companies.createdAt} >= ${thisMonth.toISOString()}::timestamptz)
        `.as('new_this_month'),
        newPrevMonth: sql<number>`
          count(*) filter (where ${companies.createdAt} >= ${prevMonth.toISOString()}::timestamptz
                          and   ${companies.createdAt} <  ${thisMonth.toISOString()}::timestamptz)
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

    // ── 4. (Leads removidos del dashboard de platform.
    //        El módulo Comercial fue retirado: la tabla
    //        `platform_leads` ya no se consulta acá.) ───────────────

    // ── 5. Total de usuarios de empresa ──────────────────────────────────────

    const [userCounts] = await db
      .select({
        total:  count().as('total'),
        active: sql<number>`count(*) filter (where ${companyUsers.status} = 'active')`.as('active'),
      })
      .from(companyUsers);



    // ── 6. Empresas con trial próximo a vencer (≤ 7 días) ────────────────────
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nowIso = now.toISOString();
    const sevenDaysIso = sevenDaysFromNow.toISOString();

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
          sql`${companies.trialEndsAt} >= ${nowIso}::timestamptz`,
          sql`${companies.trialEndsAt} < ${sevenDaysIso}::timestamptz`
        )
      )
      .orderBy(companies.trialEndsAt!);

    // ── 7. Últimas 5 empresas creadas ─────────────────────────────────────────

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

    // ── 8. MoM growth (empresas) ────────────────────────────────────────────

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

      // (Sección `leads` removida: el módulo Comercial fue retirado
      //  del dashboard de superadmin. La tabla `platform_leads`
      //  sigue existiendo en DB pero ya no se consulta en /stats.)

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