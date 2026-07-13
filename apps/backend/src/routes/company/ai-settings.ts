// routes/company/ai-settings.ts
// ─────────────────────────────────────────────────────────────────────
// Endpoints para que cada empresa configure su propia IA (jul 2026 v6).
//
// Rutas (todas bajo /company/:id):
//   GET    /ai-settings       → devuelve la config (SIN api_key, solo last4)
//   PUT    /ai-settings       → crea/actualiza config (puede incluir api_key)
//   DELETE /ai-settings       → vuelve a platform_default
//   POST   /ai-settings/test  → prueba la conexión contra el provider
//   GET    /ai-usage?from&to  → métricas de uso (tokens, requests, cost)
//   GET    /ai-providers      → lista de providers + modelos disponibles
//
// Permisos: admin_empresa / owner_empresa / superadmin.
// ─────────────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../../db/client';
import {
  companyAiSettings,
  companyAiApiKeys,
  companyAiUsage,
  companies,
} from '../../db/schema/platform';
import { validate } from '../../lib/validate';
import { logAudit } from '../../lib/audit';
import { AppError, ForbiddenError } from '../../lib/errors';
import {
  encryptSecret,
  decryptSecret,
  last4 as secretLast4,
  fingerprintOf,
} from '../../lib/crypto';
import {
  clearAiConfigCache,
  resolveAiConfig,
} from '../../lib/ai/client-factory';
import { toId } from '../../lib/ids';

const router = Router({ mergeParams: true });

// ─── Helpers ───────────────────────────────────────────────────────────────

function getCompanyIdFromReq(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'companyId inválido');
  }
  return id;
}

function isAdminRole(role?: string): boolean {
  return role === 'owner_empresa' || role === 'admin_empresa' || role === 'superadmin' || role === 'admin_saas';
}

function requireAdminOnCompany(req: Request) {
  if (!isAdminRole(req.user?.role)) {
    throw new ForbiddenError('Solo el admin de la empresa puede modificar la configuración de IA.');
  }
}

// ─── Schemas ───────────────────────────────────────────────────────────────

const providerEnum = z.enum([
  'platform_default',
  'groq',
  'gemini',
  'openai',
  'anthropic',
  'custom',
]);

const putSchema = z.object({
  provider:          providerEnum,
  isEnabled:         z.boolean().default(true),
  // Si viene vacío/null → no tocar la key existente.
  // Si viene string → reemplaza (cifra y guarda fingerprint).
  // Si viene '' explícito → borra la key (cae a platform_default si provider='platform_default').
  apiKey:            z.string().max(500).optional().nullable(),
  apiKeyClear:       z.boolean().optional(),   // true = borrar la key guardada
  modelPrimary:      z.string().max(120).optional().nullable(),
  modelFallback:     z.string().max(120).optional().nullable(),
  modelTtsVoice:     z.string().max(60).optional().nullable(),
  rpmLimit:          z.number().int().positive().max(1_000_000).optional().nullable(),
  tpmLimit:          z.number().int().positive().max(1_000_000_000).optional().nullable(),
  monthlyBudgetUsd:  z.number().nonnegative().max(1_000_000).optional().nullable(),
  useJarvis:         z.boolean().optional(),
  useExitAnalysis:   z.boolean().optional(),
  useAiInsights:     z.boolean().optional(),
  useTts:            z.boolean().optional(),
});

// ─── GET /ai-settings ──────────────────────────────────────────────────────

router.get('/ai-settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = getCompanyIdFromReq(req);
    const [row] = await db
      .select()
      .from(companyAiSettings)
      .where(eq(companyAiSettings.companyId, companyId))
      .limit(1);

    if (!row) {
      // Sin fila → defaults "platform_default".
      return res.json({
        companyId: toId('company', String(companyId)),
        provider: 'platform_default',
        isEnabled: true,
        hasApiKey: false,
        apiKeyLast4: null,
        apiKeySetAt: null,
        modelPrimary: null,
        modelFallback: null,
        modelTtsVoice: null,
        rpmLimit: null,
        tpmLimit: null,
        monthlyBudgetUsd: null,
        useJarvis: true,
        useExitAnalysis: true,
        useAiInsights: true,
        useTts: false,
        killedByPlatform: false,
        createdAt: null,
        updatedAt: null,
        keySource: 'platform',
      });
    }

    return res.json({
      companyId: toId('company', String(companyId)),
      provider: row.provider,
      isEnabled: row.isEnabled,
      hasApiKey: !!row.apiKeyEncrypted,
      apiKeyLast4: row.apiKeyLast4,
      apiKeySetAt: row.apiKeySetAt,
      modelPrimary: row.modelPrimary,
      modelFallback: row.modelFallback,
      modelTtsVoice: row.modelTtsVoice,
      rpmLimit: row.rpmLimit,
      tpmLimit: row.tpmLimit,
      monthlyBudgetUsd: row.monthlyBudgetUsd ? Number(row.monthlyBudgetUsd) : null,
      useJarvis: row.useJarvis,
      useExitAnalysis: row.useExitAnalysis,
      useAiInsights: row.useAiInsights,
      useTts: row.useTts,
      killedByPlatform: row.killedByPlatform,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      keySource: row.apiKeyEncrypted ? 'company' : 'platform',
    });
  } catch (err) { next(err); }
});

// ─── PUT /ai-settings ───────────────────────────────────────────────────────

router.put('/ai-settings', validate(putSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminOnCompany(req);
    const companyId = getCompanyIdFromReq(req);
    const body = req.body as z.infer<typeof putSchema>;

    // Si quiere provider custom pero NO manda key y NO hay key previa → 400.
    const [existing] = await db
      .select()
      .from(companyAiSettings)
      .where(eq(companyAiSettings.companyId, companyId))
      .limit(1);

    const wantsCustomProvider = body.provider !== 'platform_default';
    const hasExistingKey     = !!existing?.apiKeyEncrypted;
    const hasNewKey          = !!body.apiKey && body.apiKey.trim().length > 0;
    const clearsKey          = !!body.apiKeyClear;

    if (wantsCustomProvider && !hasNewKey && !hasExistingKey) {
      throw new AppError(400, `Para usar provider="${body.provider}" necesitás cargar una API key.`);
    }
    if (clearsKey && wantsCustomProvider) {
      throw new AppError(400, `No podés borrar la API key mientras el provider sea custom. Volvé a "platform_default" primero.`);
    }

    // Cifrar la nueva key si vino.
    let apiKeyEncrypted: string | null | undefined = undefined; // undefined = no tocar
    let apiKeyLast4:     string | null | undefined = undefined;
    let apiKeySetAt:     Date   | null | undefined = undefined;
    let fp:              string | null = null;

    if (hasNewKey) {
      const plain = body.apiKey!.trim();
      fp = fingerprintOf(plain);
      apiKeyEncrypted = encryptSecret(plain);
      apiKeyLast4     = secretLast4(plain);
      apiKeySetAt     = new Date();
    } else if (clearsKey) {
      apiKeyEncrypted = null;
      apiKeyLast4     = null;
      apiKeySetAt     = null;
    }

    // Si cambia provider+key, registramos en el historial de fingerprints.
    // Si la misma key se reutiliza (mismo fp) NO duplicamos — usamos UNIQUE.
    if (hasNewKey && fp) {
      try {
        await db.insert(companyAiApiKeys).values({
          companyId,
          provider:    body.provider,
          fingerprint: fp,
        });
      } catch (e: any) {
        // UNIQUE violation → la key ya existe para esa empresa. OK.
        if (!String(e?.message ?? '').includes('uniq')) {
          throw e;
        }
      }
    }

    const patch: any = {
      provider:        body.provider,
      isEnabled:       body.isEnabled,
      updatedAt:       new Date(),
      updatedBy:       Number(req.user?.sub?.replace('company-user-', '') || 0) || null,
    };
    if (body.modelPrimary     !== undefined) patch.modelPrimary    = body.modelPrimary;
    if (body.modelFallback    !== undefined) patch.modelFallback   = body.modelFallback;
    if (body.modelTtsVoice    !== undefined) patch.modelTtsVoice   = body.modelTtsVoice;
    if (body.rpmLimit         !== undefined) patch.rpmLimit        = body.rpmLimit;
    if (body.tpmLimit         !== undefined) patch.tpmLimit        = body.tpmLimit;
    if (body.monthlyBudgetUsd !== undefined) patch.monthlyBudgetUsd = body.monthlyBudgetUsd != null ? String(body.monthlyBudgetUsd) : null;
    if (body.useJarvis        !== undefined) patch.useJarvis       = body.useJarvis;
    if (body.useExitAnalysis  !== undefined) patch.useExitAnalysis = body.useExitAnalysis;
    if (body.useAiInsights    !== undefined) patch.useAiInsights   = body.useAiInsights;
    if (body.useTts           !== undefined) patch.useTts          = body.useTts;
    if (apiKeyEncrypted       !== undefined) patch.apiKeyEncrypted = apiKeyEncrypted;
    if (apiKeyLast4           !== undefined) patch.apiKeyLast4     = apiKeyLast4;
    if (apiKeySetAt           !== undefined) patch.apiKeySetAt     = apiKeySetAt;

    if (existing) {
      await db.update(companyAiSettings).set(patch).where(eq(companyAiSettings.companyId, companyId));
    } else {
      await db.insert(companyAiSettings).values({
        companyId,
        ...patch,
        killedByPlatform: false,
      });
    }

    // Invalidar cache del factory para que el próximo request lea la nueva key.
    clearAiConfigCache(companyId);

    // Audit log — NO logueamos la key cruda, solo fingerprint y last4.
    await logAudit(db, companyId, {
      entity: 'company_ai_settings',
      entityId: String(companyId),
      action: 'update',
      actorId: req.user?.sub,
      actorName: req.user?.name,
      description: `Configuración de IA actualizada: provider=${body.provider}`,
      metadata: {
        provider: body.provider,
        isEnabled: body.isEnabled,
        keyChanged: hasNewKey || clearsKey,
        keyLast4: apiKeyLast4 ?? existing?.apiKeyLast4 ?? null,
        keyFingerprint: fp,
        useJarvis: body.useJarvis,
        useExitAnalysis: body.useExitAnalysis,
        useAiInsights: body.useAiInsights,
        useTts: body.useTts,
      },
    });

    return res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── DELETE /ai-settings (reset a platform_default) ─────────────────────────

router.delete('/ai-settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminOnCompany(req);
    const companyId = getCompanyIdFromReq(req);

    await db.update(companyAiSettings)
      .set({
        provider:        'platform_default',
        apiKeyEncrypted: null,
        apiKeyLast4:     null,
        apiKeySetAt:     null,
        updatedAt:       new Date(),
        updatedBy:       Number(req.user?.sub?.replace('company-user-', '') || 0) || null,
      })
      .where(eq(companyAiSettings.companyId, companyId));

    clearAiConfigCache(companyId);

    await logAudit(db, companyId, {
      entity: 'company_ai_settings',
      entityId: String(companyId),
      action: 'update',
      actorId: req.user?.sub,
      actorName: req.user?.name,
      description: 'Configuración de IA reseteada a platform_default',
      metadata: { reset: true },
    });

    return res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── POST /ai-settings/test ─────────────────────────────────────────────────

router.post('/ai-settings/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminOnCompany(req);
    const companyId = getCompanyIdFromReq(req);
    const cfg = await resolveAiConfig(companyId, { force: true });

    if (cfg.killed) {
      throw new AppError(403, 'La IA está deshabilitada para esta empresa.');
    }
    if (!cfg.apiKey) {
      throw new AppError(503, 'No hay API key para testear. Carga una o activá la global.');
    }

    const start = Date.now();
    let provider: 'groq' | 'gemini' | 'other' = cfg.provider === 'groq' ? 'groq'
                                              : cfg.provider === 'gemini' ? 'gemini'
                                              : 'other';
    if (cfg.provider === 'platform_default') {
      if (cfg.apiKey === process.env.GROQ_API_KEY)   provider = 'groq';
      else if (cfg.apiKey === process.env.GEMINI_API_KEY) provider = 'gemini';
    }

    if (provider === 'groq') {
      const client = new Groq({ apiKey: cfg.apiKey });
      const r = await client.chat.completions.create({
        model: cfg.modelPrimary,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        temperature: 0,
      });
      return res.json({
        ok: true,
        provider,
        model: r.model,
        latencyMs: Date.now() - start,
      });
    }

    if (provider === 'gemini') {
      const client = new GoogleGenerativeAI(cfg.apiKey);
      const model = client.getGenerativeModel({ model: cfg.modelPrimary });
      const r = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 1, temperature: 0 },
      } as any);
      return res.json({
        ok: true,
        provider,
        model: cfg.modelPrimary,
        latencyMs: Date.now() - start,
        responseChars: r.response?.text()?.length ?? 0,
      });
    }

    throw new AppError(400, `Provider "${provider}" no soportado para test todavía.`);
  } catch (err) { next(err); }
});

// ─── GET /ai-usage?from&to ──────────────────────────────────────────────────

router.get('/ai-usage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = getCompanyIdFromReq(req);
    const fromDate = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86400_000);
    const toDate   = req.query.to   ? new Date(String(req.query.to))   : new Date();
    // gte/lte sobre una columna `date` esperan strings 'YYYY-MM-DD'.
    const fromStr = fromDate.toISOString().slice(0, 10);
    const toStr   = toDate.toISOString().slice(0, 10);

    const rows = await db
      .select({
        periodDay:   companyAiUsage.periodDay,
        feature:     companyAiUsage.feature,
        provider:    companyAiUsage.provider,
        tokensIn:    sql<number>`sum(${companyAiUsage.tokensIn})::int`,
        tokensOut:   sql<number>`sum(${companyAiUsage.tokensOut})::int`,
        requests:    sql<number>`sum(${companyAiUsage.requests})::int`,
        costUsd:     sql<string>`sum(${companyAiUsage.costUsd})::numeric`,
      })
      .from(companyAiUsage)
      .where(and(
        eq(companyAiUsage.companyId, companyId),
        gte(companyAiUsage.periodDay, fromStr),
        sql`${companyAiUsage.periodDay} <= ${toStr}`,
      ))
      .groupBy(companyAiUsage.periodDay, companyAiUsage.feature, companyAiUsage.provider)
      .orderBy(desc(companyAiUsage.periodDay));

    return res.json({ from: fromStr, to: toStr, rows });
  } catch (err) { next(err); }
});

// ─── GET /ai-providers (catálogo) ───────────────────────────────────────────

router.get('/ai-providers', async (_req: Request, res: Response) => {
  return res.json({
    providers: [
      {
        id: 'platform_default',
        label: 'Usar configuración global de la plataforma',
        description: 'Todas las empresas usan la key configurada en el backend (env vars).',
        models: [],
      },
      {
        id: 'groq',
        label: 'Groq',
        description: 'Modelos open-source rápidos (Llama, Mixtral). Recomendado para Jarvis.',
        models: [
          'llama-3.3-70b-versatile',
          'llama-3.1-8b-instant',
          'llama-3.1-70b-versatile',
          'mixtral-8x7b-32768',
        ],
      },
      {
        id: 'gemini',
        label: 'Google Gemini',
        description: 'Modelos multimodales de Google. Recomendado para análisis de imágenes.',
        models: [
          'gemini-2.5-flash',
          'gemini-2.5-pro',
          'gemini-2.0-flash',
          'gemini-1.5-pro',
        ],
      },
      {
        id: 'openai',
        label: 'OpenAI',
        description: 'GPT-4o, GPT-4o-mini, etc. (próximamente).',
        models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
      },
      {
        id: 'anthropic',
        label: 'Anthropic Claude',
        description: 'Claude 3.5 Sonnet, Haiku (próximamente).',
        models: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
      },
      {
        id: 'custom',
        label: 'Custom (OpenAI-compatible)',
        description: 'Cualquier endpoint compatible con la API de OpenAI (próximamente).',
        models: [],
      },
    ],
  });
});

export default router;