// routes/ai-api/modules/sesion.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Endpoint /api/ai/sesion: info de la API Key actual.
//
// Útil para que el Custom GPT sepa qué empresa está consultando y
// qué scopes tiene la key. Llamarlo una vez al inicio de la sesión.
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { aiApiKeys, companies } from '../../../db/schema/platform';
import { authAiApiKey } from '../../../middlewares/auth-ai-key';
import { withAudit, requireCtx } from '../shared';
import { NotFoundError } from '../../../lib/errors';

const router = Router();

router.get(
  '/sesion',
  authAiApiKey,
  withAudit(async (req, res) => {
    const ctx = requireCtx(req);

    const [company] = await db.select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      status: companies.status,
      industry: companies.industry,
      country: companies.country,
      city: companies.city,
    })
      .from(companies)
      .where(eq(companies.id, ctx.companyId))
      .limit(1);
    if (!company) throw new NotFoundError('Empresa', String(ctx.companyId));

    // Stats de uso: cuántas requests se hicieron con esta key en el día.
    const { aiApiLogs } = await import('../../../db/schema/platform');
    const { sql, and, gte } = await import('drizzle-orm');
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [todayCount] = await db.select({
      n: sql<number>`COUNT(*)::int`,
    })
      .from(aiApiLogs)
      .where(and(
        eq(aiApiLogs.keyId, ctx.keyId),
        gte(aiApiLogs.createdAt, today),
      ));

    res.json({
      empresa: {
        id: `company-${company.id}`,
        nombre: company.name,
        slug: company.slug,
        estado: company.status,
        industria: company.industry,
        pais: company.country,
        ciudad: company.city,
      },
      apiKey: {
        nombre: ctx.keyName,
        prefix: ctx.keyPrefix,
        scopes: ctx.scopes,
      },
      uso: {
        requestsHoy: todayCount?.n ?? 0,
        rateLimit: '60 req/min por API Key',
      },
      instrucciones: {
        formatoFechas: 'YYYY-MM-DD (ISO 8601). Timezone implícita: America/Guayaquil (UTC-5).',
        resolucionEntidades: 'Los vehículos, conductores, talleres, proveedores y sedes se resuelven por nombre/código/placa — NO por ID interno. Si una búsqueda falla, devolvemos 404 con el término buscado.',
        confirmacion: 'Para DELETE /vehiculos/:id se requiere "confirmar: true" en el body. El resto de operaciones de escritura asume que el LLM ya confirmó con el usuario antes de llamar la Action.',
        errores: 'Todos los errores vienen en español, listos para que el LLM los transmita al usuario tal cual.',
      },
    });
  }),
);

export default router;
