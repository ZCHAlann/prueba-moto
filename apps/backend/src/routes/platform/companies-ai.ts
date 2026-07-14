// routes/platform/companies-ai.ts
// ─────────────────────────────────────────────────────────────────────
// Acciones del superadmin sobre la config de IA de una empresa (jul 2026 v6).
//
//   GET   /platform/companies/:id/ai-settings  → ver config (incluye killed)
//   GET   /platform/companies/:id/ai-usage     → métricas (mes actual)
//   POST  /platform/companies/:id/ai-disable   → kill-switch ON
//   POST  /platform/companies/:id/ai-enable    → kill-switch OFF
//
// El superadmin NO edita la API key de la empresa desde acá (eso lo hace
// el admin de la empresa). Sí puede forzar isEnabled=false (kill-switch)
// para cortar el uso de IA de una empresa puntual sin esperar a que
// llegue el disable natural.
// ─────────────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from 'express';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyAiSettings,
  companyAiUsage,
  companies,
} from '../../db/schema/platform';
import { logPlatformAudit } from '../../lib/audit';
import { clearAiConfigCache } from '../../lib/ai/client-factory';
import { AppError } from '../../lib/errors';
import { toId } from '../../lib/ids';

const router = Router({ mergeParams: true });

// ─── GET /platform/companies/:id/ai-settings ────────────────────────────────

router.get('/:id/ai-settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = Number(req.params.id);
    if (!Number.isFinite(companyId) || companyId <= 0) throw new AppError(400, 'id inválido');

    const [row] = await db
      .select()
      .from(companyAiSettings)
      .where(eq(companyAiSettings.companyId, companyId))
      .limit(1);

    const [company] = await db
      .select({ id: companies.id, name: companies.name, slug: companies.slug })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) throw new AppError(404, 'Empresa no encontrada');

    return res.json({
      company: {
        id: toId('company', String(company.id)),
        name: company.name,
        slug: company.slug,
      },
      config: row ? {
        provider:         row.providerOverride ?? 'platform_default',
        isEnabled:        row.isEnabled,
        hasGroqApiKey:    !!row.groqApiKeyEncrypted,
        groqApiKeyLast4:  row.groqApiKeyLast4,
        groqApiKeySetAt:  row.groqApiKeySetAt,
        hasGeminiApiKey:  !!row.geminiApiKeyEncrypted,
        geminiApiKeyLast4:row.geminiApiKeyLast4,
        geminiApiKeySetAt:row.geminiApiKeySetAt,
        // Compat con frontend viejo:
        hasApiKey:        !!(row.groqApiKeyEncrypted || row.geminiApiKeyEncrypted),
        apiKeyLast4:      row.groqApiKeyLast4 ?? row.geminiApiKeyLast4 ?? null,
        apiKeySetAt:      row.groqApiKeySetAt ?? row.geminiApiKeySetAt ?? null,
        // El modelo lo define ApliSmart.
        modelPrimary:     null,
        modelFallback:    null,
        rpmLimit:         row.rpmLimit,
        tpmLimit:         row.tpmLimit,
        monthlyBudgetUsd: row.monthlyBudgetUsd ? Number(row.monthlyBudgetUsd) : null,
        useJarvis:        row.useJarvis,
        useExitAnalysis:  row.useExitAnalysis,
        useAiInsights:    row.useAiInsights,
        useTts:           row.useTts,
        killedByPlatform: row.killedByPlatform,
        keySource:        (row.groqApiKeyEncrypted || row.geminiApiKeyEncrypted) ? 'company' : 'platform',
      } : {
        provider: 'platform_default',
        isEnabled: true,
        hasApiKey: false,
        killedByPlatform: false,
        keySource: 'platform',
        // Defaults.
        useJarvis: true, useExitAnalysis: true, useAiInsights: true, useTts: false,
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /platform/companies/:id/ai-usage ──────────────────────────────────

router.get('/:id/ai-usage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = Number(req.params.id);
    if (!Number.isFinite(companyId) || companyId <= 0) throw new AppError(400, 'id inválido');

    const fromDate = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86400_000);
    const toDate   = req.query.to   ? new Date(String(req.query.to))   : new Date();
    const fromStr = fromDate.toISOString().slice(0, 10);
    const toStr   = toDate.toISOString().slice(0, 10);

    const rows = await db
      .select({
        periodDay: companyAiUsage.periodDay,
        feature:   companyAiUsage.feature,
        provider:  companyAiUsage.provider,
        tokensIn:  sql<number>`sum(${companyAiUsage.tokensIn})::int`,
        tokensOut: sql<number>`sum(${companyAiUsage.tokensOut})::int`,
        requests:  sql<number>`sum(${companyAiUsage.requests})::int`,
        costUsd:   sql<string>`sum(${companyAiUsage.costUsd})::numeric`,
      })
      .from(companyAiUsage)
      .where(and(
        eq(companyAiUsage.companyId, companyId),
        gte(companyAiUsage.periodDay, fromStr),
        sql`${companyAiUsage.periodDay} <= ${toStr}`,
      ))
      .groupBy(companyAiUsage.periodDay, companyAiUsage.feature, companyAiUsage.provider)
      .orderBy(desc(companyAiUsage.periodDay));

    return res.json({ companyId, from: fromStr, to: toStr, rows });
  } catch (err) { next(err); }
});

// ─── POST /platform/companies/:id/ai-disable (kill-switch) ──────────────────

router.post('/:id/ai-disable', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = Number(req.params.id);
    if (!Number.isFinite(companyId) || companyId <= 0) throw new AppError(400, 'id inválido');
    const reason = String(req.body?.reason ?? '').slice(0, 280) || null;

    // upsert: si no existe la fila, crearla con todo en default + killed=true.
    const [existing] = await db
      .select()
      .from(companyAiSettings)
      .where(eq(companyAiSettings.companyId, companyId))
      .limit(1);

    if (existing) {
      await db.update(companyAiSettings)
        .set({ killedByPlatform: true, updatedAt: new Date() })
        .where(eq(companyAiSettings.companyId, companyId));
    } else {
      await db.insert(companyAiSettings).values({
        companyId,
        providerOverride: 'platform_default',
        killedByPlatform: true,
        isEnabled: true,
      });
    }

    clearAiConfigCache(companyId);

    await logPlatformAudit(db, {
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      action: 'company.ai_kill_switch',
      entity: 'company',
      entityId: String(companyId),
      description: `IA desactivada por plataforma (kill-switch) para empresa ${companyId}`,
      metadata: { killed: true, reason },
    });

    return res.json({ ok: true, killed: true });
  } catch (err) { next(err); }
});

// ─── POST /platform/companies/:id/ai-enable ─────────────────────────────────

router.post('/:id/ai-enable', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = Number(req.params.id);
    if (!Number.isFinite(companyId) || companyId <= 0) throw new AppError(400, 'id inválido');

    await db.update(companyAiSettings)
      .set({ killedByPlatform: false, updatedAt: new Date() })
      .where(eq(companyAiSettings.companyId, companyId));

    clearAiConfigCache(companyId);

    await logPlatformAudit(db, {
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      action: 'company.ai_reactivate',
      entity: 'company',
      entityId: String(companyId),
      description: `IA reactivada por plataforma para empresa ${companyId}`,
      metadata: { killed: false },
    });

    return res.json({ ok: true, killed: false });
  } catch (err) { next(err); }
});

export default router;