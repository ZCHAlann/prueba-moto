// routes/platform/crm.ts
import { Router } from 'express';
import { z } from 'zod';
import { eq, sql, count, and, desc, gte, lt, ne, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import { validate } from '../../lib/validate';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { platformLeads, companies, platformPlans } from '../../db/schema/platform';

const router = Router();

// ─── Probabilidades por etapa (para forecast) ────────────────────────────────
const STAGE_PROBABILITY: Record<string, number> = {
  nuevo:             0.05,
  contactado:        0.15,
  demo_agendada:     0.40,
  propuesta_enviada: 0.70,
  ganado:            1.00,
  perdido:           0.00,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcDealScore(lead: typeof platformLeads.$inferSelect): number {
  let score = 0;

  // Valor estimado (max 30 pts)
  const value = parseFloat(lead.estimatedValue ?? '0');
  if (value > 0)      score += Math.min(30, Math.floor(value / 1000) * 3);

  // Completitud de datos (max 25 pts)
  if (lead.contactEmail) score += 8;
  if (lead.contactPhone) score += 7;
  if (lead.contactName)  score += 5;
  if (lead.industry)     score += 5;

  // Etapa del pipeline (max 30 pts)
  const stageScore: Record<string, number> = {
    nuevo: 5, contactado: 10, demo_agendada: 20,
    propuesta_enviada: 28, ganado: 30, perdido: 0,
  };
  score += stageScore[lead.status] ?? 0;

  // Urgencia negativa — días sin moverse (max -15 pts)
  const daysSinceUpdate = Math.floor(
    (Date.now() - new Date(lead.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceUpdate > 14) score -= 15;
  else if (daysSinceUpdate > 7) score -= 7;

  return Math.max(0, Math.min(100, score));
}

function calcUrgency(lead: typeof platformLeads.$inferSelect): 'critical' | 'warning' | 'normal' {
  const days = Math.floor(
    (Date.now() - new Date(lead.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days >= 14) return 'critical';
  if (days >= 7)  return 'warning';
  return 'normal';
}

function serializeDeal(lead: typeof platformLeads.$inferSelect) {
  const daysSinceUpdate = Math.floor(
    (Date.now() - new Date(lead.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysInPipeline = Math.floor(
    (Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    id:                   toId('lead', lead.id),
    companyName:          lead.companyName,
    contactName:          lead.contactName,
    contactEmail:         lead.contactEmail,
    contactPhone:         lead.contactPhone,
    industry:             lead.industry,
    country:              lead.country,
    city:                 lead.city,
    status:               lead.status,
    source:               lead.source,
    assignedTo:           lead.assignedTo,
    estimatedValue:       lead.estimatedValue,
    notes:                lead.notes,
    convertedToCompanyId: lead.convertedToCompanyId
      ? toId('company', lead.convertedToCompanyId)
      : null,
    convertedAt:          lead.convertedAt,
    createdAt:            lead.createdAt,
    updatedAt:            lead.updatedAt,
    // Campos calculados
    score:                calcDealScore(lead),
    urgency:              calcUrgency(lead),
    daysSinceUpdate,
    daysInPipeline,
    forecastValue: parseFloat(lead.estimatedValue ?? '0') *
      (STAGE_PROBABILITY[lead.status] ?? 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /platform/crm/pipeline
// Deals agrupados por etapa con totales de valor
// ─────────────────────────────────────────────────────────────────────────────

router.get('/pipeline', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(platformLeads)
      .orderBy(desc(platformLeads.updatedAt));

    const STAGES = ['nuevo','contactado','demo_agendada','propuesta_enviada','ganado','perdido'];

    const pipeline = STAGES.map(stage => {
      const deals = rows
        .filter(r => r.status === stage)
        .map(serializeDeal);

      const totalValue = deals.reduce(
        (sum, d) => sum + parseFloat(d.estimatedValue ?? '0'), 0
      );
      const forecastValue = deals.reduce(
        (sum, d) => sum + d.forecastValue, 0
      );

      return {
        stage,
        deals,
        count:        deals.length,
        totalValue,
        forecastValue,
      };
    });

    res.json({ pipeline });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /platform/crm/stats
// Win rate, velocidad promedio, pipeline health
// ─────────────────────────────────────────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

    const all = await db.select().from(platformLeads);

    const active = all.filter(l =>
      !['ganado','perdido'].includes(l.status)
    );
    const won    = all.filter(l => l.status === 'ganado');
    const lost   = all.filter(l => l.status === 'perdido');

    // Win rate global
    const closed = won.length + lost.length;
    const winRate = closed > 0 ? Math.round((won.length / closed) * 100) : 0;

    // Win rate este mes
    const wonThisMonth = won.filter(l =>
      l.convertedAt && new Date(l.convertedAt) >= startOfMonth
    ).length;
    const closedThisMonth = all.filter(l =>
      ['ganado','perdido'].includes(l.status) &&
      new Date(l.updatedAt) >= startOfMonth
    ).length;
    const winRateThisMonth = closedThisMonth > 0
      ? Math.round((wonThisMonth / closedThisMonth) * 100) : 0;

    // Win rate mes anterior
    const wonLastMonth = won.filter(l =>
      l.convertedAt &&
      new Date(l.convertedAt) >= startOfLastMonth &&
      new Date(l.convertedAt) < startOfMonth
    ).length;
    const closedLastMonth = all.filter(l =>
      ['ganado','perdido'].includes(l.status) &&
      new Date(l.updatedAt) >= startOfLastMonth &&
      new Date(l.updatedAt) < startOfMonth
    ).length;
    const winRateLastMonth = closedLastMonth > 0
      ? Math.round((wonLastMonth / closedLastMonth) * 100) : 0;

    // Velocidad promedio de cierre (días desde creación hasta conversión)
    const closedDeals = won.filter(l => l.convertedAt);
    const avgClosingDays = closedDeals.length > 0
      ? Math.round(
          closedDeals.reduce((sum, l) => {
            const days = Math.floor(
              (new Date(l.convertedAt!).getTime() - new Date(l.createdAt).getTime())
              / (1000 * 60 * 60 * 24)
            );
            return sum + days;
          }, 0) / closedDeals.length
        )
      : 0;

    // Pipeline value total (activos)
    const pipelineValue = active.reduce(
      (sum, l) => sum + parseFloat(l.estimatedValue ?? '0'), 0
    );

    // Forecast value (ponderado por probabilidad)
    const forecastValue = active.reduce(
      (sum, l) => sum + parseFloat(l.estimatedValue ?? '0') * (STAGE_PROBABILITY[l.status] ?? 0), 0
    );

    // Pipeline health
    const stale = active.filter(l => {
      const days = Math.floor(
        (Date.now() - new Date(l.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      return days >= 7;
    }).length;
    const stalePercent = active.length > 0
      ? Math.round((stale / active.length) * 100) : 0;

    let pipelineHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (stalePercent >= 50) pipelineHealth = 'critical';
    else if (stalePercent >= 25) pipelineHealth = 'warning';

    // Actividad reciente (últimos 10 cambios)
    const recentActivity = await db
      .select()
      .from(platformLeads)
      .orderBy(desc(platformLeads.updatedAt))
      .limit(10);

    res.json({
      totalDeals:       all.length,
      activeDeals:      active.length,
      wonDeals:         won.length,
      lostDeals:        lost.length,
      winRate,
      winRateThisMonth,
      winRateLastMonth,
      avgClosingDays,
      pipelineValue,
      forecastValue,
      pipelineHealth,
      staleDeals:       stale,
      stalePercent,
      wonThisMonth,
      recentActivity:   recentActivity.map(serializeDeal),
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /platform/crm/forecast
// Revenue forecast por etapa con probabilidades
// ─────────────────────────────────────────────────────────────────────────────

router.get('/forecast', async (req, res, next) => {
  try {
    const active = await db
      .select()
      .from(platformLeads)
      .where(
        sql`${platformLeads.status} not in ('ganado', 'perdido')`
      );

    const byStage = Object.entries(STAGE_PROBABILITY)
      .filter(([stage]) => !['ganado','perdido'].includes(stage))
      .map(([stage, probability]) => {
        const deals = active.filter(l => l.status === stage);
        const totalValue = deals.reduce(
          (sum, l) => sum + parseFloat(l.estimatedValue ?? '0'), 0
        );
        return {
          stage,
          probability,
          dealCount:     deals.length,
          totalValue,
          forecastValue: totalValue * probability,
        };
      });

    const totalForecast = byStage.reduce((sum, s) => sum + s.forecastValue, 0);
    const totalPipeline = byStage.reduce((sum, s) => sum + s.totalValue, 0);

    res.json({
      byStage,
      totalForecast,
      totalPipeline,
      generatedAt: new Date(),
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /platform/crm/deals/:id/move
// Mover deal a otra etapa con log de actividad
// ─────────────────────────────────────────────────────────────────────────────

router.post('/deals/:id/move', async (req, res, next) => {
  try {
    const leadId = parseId('lead', req.params.id);
    const { status } = z.object({
      status: z.enum(['nuevo','contactado','demo_agendada','propuesta_enviada','ganado','perdido']),
    }).parse(req.body);

    const [existing] = await db
      .select()
      .from(platformLeads)
      .where(eq(platformLeads.id, leadId))
      .limit(1);
    if (!existing) throw new NotFoundError('Lead', req.params.id);

    const [updated] = await db
      .update(platformLeads)
      .set({ status, updatedAt: new Date() })
      .where(eq(platformLeads.id, leadId))
      .returning();

    await logAudit(db, null, {
      entity:      'platform_leads',
      entityId:    toId('lead', updated.id),
      action:      'move',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: `Deal "${updated.companyName}" movido de "${existing.status}" a "${status}".`,
    });

    res.json(serializeDeal(updated));
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /platform/crm/deals/:id/convert
// Convertir deal ganado en empresa (crea la empresa y vincula el lead)
// ─────────────────────────────────────────────────────────────────────────────

const convertSchema = z.object({
  name:            z.string().min(1),
  slug:            z.string().min(1).regex(/^[a-z0-9-]+$/),
  planId:          z.string().default('free'),
  enabledModules:  z.array(z.string()).default([]),
  contractStartAt: z.string().optional(),
  contractEndAt:   z.string().optional(),
});

router.post('/deals/:id/convert', validate(convertSchema), async (req, res, next) => {
  try {
    const leadId = parseId('lead', req.params.id);

    const [lead] = await db
      .select()
      .from(platformLeads)
      .where(eq(platformLeads.id, leadId))
      .limit(1);
    if (!lead) throw new NotFoundError('Lead', req.params.id);

    // Crear la empresa con datos del lead
    const [company] = await db
      .insert(companies)
      .values({
        name:            req.body.name,
        slug:            req.body.slug,
        planId:          req.body.planId,
        status:          'active',
        enabledModules:  req.body.enabledModules,
        industry:        lead.industry ?? undefined,
        country:         lead.country  ?? undefined,
        city:            lead.city     ?? undefined,
        contactName:     lead.contactName  ?? undefined,
        contactEmail:    lead.contactEmail ?? undefined,
        contactPhone:    lead.contactPhone ?? undefined,
        contractStartAt: req.body.contractStartAt ?? undefined,
        contractEndAt:   req.body.contractEndAt   ?? undefined,
      })
      .returning();

    // Vincular lead a empresa creada
    await db
      .update(platformLeads)
      .set({
        status:               'ganado',
        convertedToCompanyId: company.id,
        convertedAt:          new Date(),
        updatedAt:            new Date(),
      })
      .where(eq(platformLeads.id, leadId));

    await logAudit(db, null, {
      entity:      'platform_leads',
      entityId:    toId('lead', lead.id),
      action:      'convert',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: `Deal "${lead.companyName}" convertido a empresa "${company.name}".`,
    });

    res.status(201).json({
      company: {
        id:    toId('company', company.id),
        name:  company.name,
        slug:  company.slug,
        planId: company.planId,
      },
      lead: serializeDeal({ ...lead, status: 'ganado', convertedToCompanyId: company.id }),
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /platform/crm/activity
// Feed de actividad reciente del pipeline
// ─────────────────────────────────────────────────────────────────────────────

router.get('/activity', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    const recent = await db
      .select()
      .from(platformLeads)
      .orderBy(desc(platformLeads.updatedAt))
      .limit(limit);

    const activity = recent.map(l => ({
      id:          toId('lead', l.id),
      companyName: l.companyName,
      status:      l.status,
      updatedAt:   l.updatedAt,
      createdAt:   l.createdAt,
      isNew:       new Date(l.updatedAt).getTime() === new Date(l.createdAt).getTime(),
      estimatedValue: l.estimatedValue,
      score:       calcDealScore(l),
      urgency:     calcUrgency(l),
    }));

    res.json({ activity, total: activity.length });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /platform/crm/search?q=
// Búsqueda global de deals (para Cmd+K)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q as string ?? '').toLowerCase().trim();
    if (!q) return res.json({ results: [] });

    const all = await db.select().from(platformLeads);

    const results = all
      .filter(l =>
        l.companyName.toLowerCase().includes(q) ||
        (l.contactName  ?? '').toLowerCase().includes(q) ||
        (l.contactEmail ?? '').toLowerCase().includes(q)
      )
      .slice(0, 8)
      .map(serializeDeal);

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

export default router;