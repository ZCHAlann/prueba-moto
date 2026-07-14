// routes/company/ai-settings.ts
// ─────────────────────────────────────────────────────────────────────
// Endpoints para que cada empresa configure sus API keys de IA
// (jul 2026 v7 — multi-key por provider).
//
// jul 2026 v7 — CAMBIO DE MODELO:
//   - La empresa SOLO puede cargar su API key de cada provider
//     (Groq para texto/chat/análisis, Gemini para imágenes).
//   - El MODELO lo define ApliSmart, no la empresa. La empresa
//     no puede cambiar ni provider ni modelo.
//   - Si la empresa NO carga su key, se usa la cascada global
//     (env vars / GROQ_API_KEY1..N).
//
// Rutas (todas bajo /company/:id):
//   GET    /ai-settings       → devuelve la config (SIN api_key, solo last4)
//   PUT    /ai-settings       → crea/actualiza config (groq/gemini keys por separado)
//   DELETE /ai-settings       → borra todas las keys (vuelve a platform_default)
//   POST   /ai-settings/test  → prueba la conexión contra el provider
//   GET    /ai-usage?from&to  → métricas de uso (tokens, requests, cost)
//   GET    /ai-providers      → info de los providers (sin catálogo de modelos)
//
// Permisos: admin_empresa / owner_empresa / superadmin.
// ─────────────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
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
  getGroqKeyForCompany,
  getGeminiKeyForCompany,
} from '../../lib/ai/client-factory';
import { toId } from '../../lib/ids';
import { requireModule } from '../../middlewares/requireModule';

const router = Router({ mergeParams: true });

// jul 2026 — El módulo `jarvis` (Asistente IA) sólo está disponible en
// planes Business y Enterprise (ver platform-seed.ts). Aplicamos el gating
// a TODO el router: si la empresa no tiene `jarvis` habilitado, ningún
// endpoint (GET/PUT/DELETE/POST test, ai-usage, ai-providers) responde.
// `requireModule` ya exime a superadmin y a admins de empresa, así que
// el superadmin puede seguir gestionando desde el panel master aunque la
// empresa no tenga el módulo en su plan.
router.use(requireModule('jarvis', 'asistente'));

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

// jul 2026 v7 — schema minimalista. La empresa SOLO puede:
//   - Cargar/borrar su key de Groq
//   - Cargar/borrar su key de Gemini
//   - Prender/apagar `isEnabled`, `useJarvis`, `useExitAnalysis`, `useAiInsights`, `useTts`
//   - Configurar rate limits y budget mensual
// NO hay provider, NO hay modelo — eso lo maneja ApliSmart.

const putSchema = z.object({
  isEnabled:         z.boolean().optional(),
  // Groq
  groqApiKey:        z.string().max(500).optional().nullable(),
  groqApiKeyClear:   z.boolean().optional(),
  // Gemini
  geminiApiKey:      z.string().max(500).optional().nullable(),
  geminiApiKeyClear: z.boolean().optional(),
  // Rate limits
  rpmLimit:          z.number().int().positive().max(1_000_000).optional().nullable(),
  tpmLimit:          z.number().int().positive().max(1_000_000_000).optional().nullable(),
  monthlyBudgetUsd:  z.number().nonnegative().max(1_000_000).optional().nullable(),
  // Toggles por feature
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
      return res.json({
        companyId: toId('company', String(companyId)),
        // Sin fila → defaults "platform_default".
        isEnabled:        true,
        hasGroqApiKey:    false,
        groqApiKeyLast4:  null,
        groqApiKeySetAt:  null,
        hasGeminiApiKey:  false,
        geminiApiKeyLast4:null,
        geminiApiKeySetAt:null,
        rpmLimit:         null,
        tpmLimit:         null,
        monthlyBudgetUsd: null,
        useJarvis:        true,
        useExitAnalysis:  true,
        useAiInsights:    true,
        useTts:           false,
        killedByPlatform: false,
        createdAt:        null,
        updatedAt:        null,
        // Para compat con el frontend viejo:
        keySource: 'platform',
        provider:  'platform_default',
        // EL modelo lo define ApliSmart, no la empresa. Informativo.
        modelPrimary:   null,
        modelFallback:  null,
        hasApiKey:      false,
        apiKeyLast4:    null,
        apiKeySetAt:    null,
      });
    }

    return res.json({
      companyId:        toId('company', String(companyId)),
      isEnabled:        row.isEnabled,
      hasGroqApiKey:    !!row.groqApiKeyEncrypted,
      groqApiKeyLast4:  row.groqApiKeyLast4,
      groqApiKeySetAt:  row.groqApiKeySetAt,
      hasGeminiApiKey:  !!row.geminiApiKeyEncrypted,
      geminiApiKeyLast4:row.geminiApiKeyLast4,
      geminiApiKeySetAt:row.geminiApiKeySetAt,
      rpmLimit:         row.rpmLimit,
      tpmLimit:         row.tpmLimit,
      monthlyBudgetUsd: row.monthlyBudgetUsd ? Number(row.monthlyBudgetUsd) : null,
      useJarvis:        row.useJarvis,
      useExitAnalysis:  row.useExitAnalysis,
      useAiInsights:    row.useAiInsights,
      useTts:           row.useTts,
      killedByPlatform: row.killedByPlatform,
      createdAt:        row.createdAt,
      updatedAt:        row.updatedAt,
      keySource: (row.groqApiKeyEncrypted || row.geminiApiKeyEncrypted) ? 'company' : 'platform',
      provider:  row.providerOverride ?? 'platform_default',
      // EL modelo lo define ApliSmart. Devolvemos null para que el
      // frontend NO muestre un selector de modelo.
      modelPrimary:   null,
      modelFallback:  null,
      hasApiKey:      !!(row.groqApiKeyEncrypted || row.geminiApiKeyEncrypted),
      apiKeyLast4:    row.groqApiKeyLast4 ?? row.geminiApiKeyLast4 ?? null,
      apiKeySetAt:    row.groqApiKeySetAt ?? row.geminiApiKeySetAt ?? null,
    });
  } catch (err) { next(err); }
});

// ─── PUT /ai-settings ───────────────────────────────────────────────────────

router.put('/ai-settings', validate(putSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminOnCompany(req);
    const companyId = getCompanyIdFromReq(req);
    const body = req.body as z.infer<typeof putSchema>;

    const [existing] = await db
      .select()
      .from(companyAiSettings)
      .where(eq(companyAiSettings.companyId, companyId))
      .limit(1);

    // ─── Groq key ────────────────────────────────────────────────────
    let groqEnc:  string | null | undefined = undefined;  // undefined = no tocar
    let groqLast4:string | null | undefined = undefined;
    let groqAt:   Date   | null | undefined = undefined;
    let groqFp:   string | null = null;

    if (body.groqApiKey && body.groqApiKey.trim().length > 0) {
      const plain = body.groqApiKey.trim();
      groqFp   = fingerprintOf(plain);
      groqEnc  = encryptSecret(plain);
      groqLast4= secretLast4(plain);
      groqAt   = new Date();
    } else if (body.groqApiKeyClear) {
      groqEnc  = null;
      groqLast4= null;
      groqAt   = null;
    }

    // ─── Gemini key ──────────────────────────────────────────────────
    let gemEnc:  string | null | undefined = undefined;
    let gemLast4:string | null | undefined = undefined;
    let gemAt:   Date   | null | undefined = undefined;
    let gemFp:   string | null = null;

    if (body.geminiApiKey && body.geminiApiKey.trim().length > 0) {
      const plain = body.geminiApiKey.trim();
      gemFp   = fingerprintOf(plain);
      gemEnc  = encryptSecret(plain);
      gemLast4= secretLast4(plain);
      gemAt   = new Date();
    } else if (body.geminiApiKeyClear) {
      gemEnc  = null;
      gemLast4= null;
      gemAt   = null;
    }

    // Registrar fingerprints en historial (si se subió alguna key nueva).
    const fingerprints: Array<{ provider: string; fp: string }> = [];
    if (groqEnc && groqFp) fingerprints.push({ provider: 'groq', fp: groqFp });
    if (gemEnc && gemFp) fingerprints.push({ provider: 'gemini', fp: gemFp });
    for (const { provider, fp } of fingerprints) {
      try {
        await db.insert(companyAiApiKeys).values({ companyId, provider, fingerprint: fp });
      } catch (e: any) {
        // UNIQUE violation → la key ya existe. OK.
        if (!String(e?.message ?? '').includes('uniq')) throw e;
      }
    }

    // Determinar el provider_override para mantener compat con el campo
    // viejo. NO se usa para decidir nada — es solo informacional.
    const newOverride = (groqEnc || gemEnc) ? 'platform_default' : 'platform_default';

    const patch: any = {
      updatedAt: new Date(),
      updatedBy: Number(req.user?.sub?.replace('company-user-', '') || 0) || null,
    };
    if (body.isEnabled        !== undefined) patch.isEnabled        = body.isEnabled;
    if (groqEnc               !== undefined) patch.groqApiKeyEncrypted = groqEnc;
    if (groqLast4             !== undefined) patch.groqApiKeyLast4     = groqLast4;
    if (groqAt                !== undefined) patch.groqApiKeySetAt     = groqAt;
    if (gemEnc                !== undefined) patch.geminiApiKeyEncrypted = gemEnc;
    if (gemLast4              !== undefined) patch.geminiApiKeyLast4     = gemLast4;
    if (gemAt                 !== undefined) patch.geminiApiKeySetAt     = gemAt;
    if (body.rpmLimit         !== undefined) patch.rpmLimit          = body.rpmLimit;
    if (body.tpmLimit         !== undefined) patch.tpmLimit          = body.tpmLimit;
    if (body.monthlyBudgetUsd !== undefined) patch.monthlyBudgetUsd = body.monthlyBudgetUsd != null ? String(body.monthlyBudgetUsd) : null;
    if (body.useJarvis        !== undefined) patch.useJarvis         = body.useJarvis;
    if (body.useExitAnalysis  !== undefined) patch.useExitAnalysis   = body.useExitAnalysis;
    if (body.useAiInsights    !== undefined) patch.useAiInsights     = body.useAiInsights;
    if (body.useTts           !== undefined) patch.useTts            = body.useTts;
    patch.providerOverride    = newOverride;

    if (existing) {
      await db.update(companyAiSettings).set(patch).where(eq(companyAiSettings.companyId, companyId));
    } else {
      await db.insert(companyAiSettings).values({
        companyId,
        ...patch,
        killedByPlatform: false,
      });
    }

    clearAiConfigCache(companyId);

    await logAudit(db, companyId, {
      entity: 'company_ai_settings',
      entityId: String(companyId),
      action: 'update',
      actorId: req.user?.sub,
      actorName: req.user?.name,
      description: 'Configuración de IA actualizada (multi-key v7).',
      metadata: {
        keyChanged: (groqEnc !== undefined) || (gemEnc !== undefined),
        groqKeyLast4: groqLast4 ?? existing?.groqApiKeyLast4 ?? null,
        geminiKeyLast4: gemLast4 ?? existing?.geminiApiKeyLast4 ?? null,
        useJarvis: body.useJarvis,
        useExitAnalysis: body.useExitAnalysis,
        useAiInsights: body.useAiInsights,
        useTts: body.useTts,
      },
    });

    return res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── DELETE /ai-settings (reset total a platform_default) ───────────────────

router.delete('/ai-settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminOnCompany(req);
    const companyId = getCompanyIdFromReq(req);

    await db.update(companyAiSettings)
      .set({
        groqApiKeyEncrypted:  null,
        groqApiKeyLast4:       null,
        groqApiKeySetAt:       null,
        geminiApiKeyEncrypted: null,
        geminiApiKeyLast4:     null,
        geminiApiKeySetAt:     null,
        providerOverride:      'platform_default',
        updatedAt:             new Date(),
        updatedBy:             Number(req.user?.sub?.replace('company-user-', '') || 0) || null,
      })
      .where(eq(companyAiSettings.companyId, companyId));

    clearAiConfigCache(companyId);

    await logAudit(db, companyId, {
      entity: 'company_ai_settings',
      entityId: String(companyId),
      action: 'update',
      actorId: req.user?.sub,
      actorName: req.user?.name,
      description: 'Keys de IA reseteadas a platform_default',
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

    // jul 2026 v7 — el body puede especificar qué provider testear.
    // Si no, testeamos ambos.
    const provider = (req.body?.provider as 'groq' | 'gemini' | undefined) ?? 'groq';

    const start = Date.now();

    if (provider === 'groq') {
      const key = await getGroqKeyForCompany(companyId, 'jarvis');
      if (!key) throw new AppError(503, 'No hay API key de Groq para testear.');
      const client = new Groq({ apiKey: key.apiKey });
      const r = await client.chat.completions.create({
        model: key.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        temperature: 0,
      });
      return res.json({
        ok: true,
        provider,
        model: r.model,
        keySource: key.keySource,
        latencyMs: Date.now() - start,
      });
    }

    if (provider === 'gemini') {
      const key = await getGeminiKeyForCompany(companyId, 'exit_analysis');
      if (!key) throw new AppError(503, 'No hay API key de Gemini para testear.');
      const client = new GoogleGenerativeAI(key.apiKey);
      const model = client.getGenerativeModel({ model: key.model });
      const r = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 1, temperature: 0 },
      } as any);
      return res.json({
        ok: true,
        provider,
        model: key.model,
        keySource: key.keySource,
        latencyMs: Date.now() - start,
        responseChars: r.response?.text()?.length ?? 0,
      });
    }

    throw new AppError(400, `Provider "${provider}" no soportado.`);
  } catch (err) { next(err); }
});

// ─── GET /ai-usage?from&to ──────────────────────────────────────────────────

router.get('/ai-usage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = getCompanyIdFromReq(req);
    const fromDate = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86400_000);
    const toDate   = req.query.to   ? new Date(String(req.query.to))   : new Date();
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

// ─── GET /ai-providers (catálogo minimalista) ──────────────────────────────
//
// jul 2026 v7 — la empresa NO elige modelo. Devolvemos solo info
// de los providers que acepta el sistema, con nota explícita de
// que el modelo lo define ApliSmart.
router.get('/ai-providers', async (_req: Request, res: Response) => {
  return res.json({
    providers: [
      {
        id: 'groq',
        label: 'Groq (texto, chat, análisis)',
        description:
          'API key de Groq. Usada para el chat Jarvis, análisis de ' +
          'estadísticas, resúmenes semanales, etc. El modelo lo define ' +
          'ApliSmart — vos solo cargás tu key.',
        managedBy: 'aplismart',
        model: 'llama-3.3-70b-versatile',
      },
      {
        id: 'gemini',
        label: 'Gemini (imágenes de autorizaciones)',
        description:
          'API key de Google Gemini. Usada para análisis multimodal ' +
          '(fotos de evidencia en autorizaciones de salida). El modelo ' +
          'lo define ApliSmart — vos solo cargás tu key.',
        managedBy: 'aplismart',
        model: 'gemini-2.5-flash',
      },
    ],
    note:
      'El modelo NO lo elegís vos. ApliSmart define el modelo que se ' +
      'usa con tu key. Si querés cambiar el modelo, contactá al equipo ' +
      'de plataforma.',
  });
});

export default router;
