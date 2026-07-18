// routes/company/agent.ts
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Endpoints admin del Asistente IA Transversal.
//
// Coherente con el doc arquitectura secciÃ³n 9 (seguridad, permisos).
//
// Rutas (todas bajo /company/:id, mÃ³dulo 'jarvis'):
//   GET    /agent/ollama-status        â†’ Â¿estÃ¡ Ollama accesible? Â¿estÃ¡ el modelo?
//   GET    /agent/events              â†’ lista eventos del bus
//   GET    /agent/events/:id          â†’ detalle (incluye payload completo)
//   POST   /agent/events/emit         â†’ TEST: emite un evento manualmente
//   POST   /agent/process-now         â†’ fuerza al Agent Core a procesar 1 evento
//   GET    /agent/audit               â†’ lista el audit log
//   GET    /agent/audit/trace/:corr   â†’ trace por correlation_id
//   GET    /agent/proposals           â†’ lista action proposals
//   GET    /agent/proposals/:id       â†’ detalle
//   POST   /agent/proposals/:id/resolve â†’ aprueba o rechaza una proposal
//   POST   /agent/proposals/expire-stale â†’ marca expiradas
//
// Permisos: admin_empresa / owner_empresa / superadmin.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { validate } from '../../lib/validate';
import { AppError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { requireModule } from '../../middlewares/requireModule';
import { isOllamaReady } from '../../lib/ai/ollama-client';
import {
  emitEvent,
  listEvents,
  claimNext,
  releaseStaleLocks,
  type EmitEventInput,
  type AgentEventSource,
} from '../../lib/agent-event-bus';
import { listAudit, traceCorrelation } from '../../lib/agent-audit';
import {
  listProposals,
  getProposalById,
  resolveAction,
  expireOldProposals,
} from '../../lib/agent-action-proposals';
import { processEvent } from '../../lib/agent-core';

const router = Router({ mergeParams: true });

// Mismo gating que el resto de la IA: requiere mÃ³dulo 'jarvis' activo
// en la empresa. El superadmin se exime automÃ¡ticamente.
router.use(requireModule('jarvis', 'asistente'));

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getCompanyIdFromReq(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'companyId invÃ¡lido');
  }
  return id;
}

function isAdminRole(role?: string): boolean {
  return role === 'owner_empresa' || role === 'admin_empresa' || role === 'superadmin' || role === 'admin_saas';
}

function requireAdminOnCompany(req: Request) {
  if (!isAdminRole(req.user?.role)) {
    throw new ForbiddenError('Solo el admin de la empresa puede acceder al Agent Core.');
  }
}

// â”€â”€â”€ GET /agent/ollama-status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/ollama-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminOnCompany(req);
    const status = await isOllamaReady();
    res.json({
      ready:  status.ready,
      model:  status.model,
      available: status.available,
      reason: status.reason,
      // Info adicional para debug
      baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
      envModel: process.env.OLLAMA_MODEL ?? 'gemma4:e2b (default)',
    });
  } catch (err) { next(err); }
});

// â”€â”€â”€ GET /agent/events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminOnCompany(req);
    const agentId = getCompanyIdFromReq(req);
    const status = (req.query.status as 'pending' | 'processed' | 'failed' | 'all') ?? 'all';
    const source = req.query.source as AgentEventSource | undefined;
    const eventType = req.query.eventType as string | undefined;
    const limit  = req.query.limit  ? Number(String(req.query.limit))  : undefined;
    const offset = req.query.offset ? Number(String(req.query.offset)) : undefined;

    const result = await listEvents({
      agentId,
      status,
      source,
      eventType,
      limit,
      offset,
    });
    res.json({
      data:  result.rows,
      total: result.total,
      limit: limit  ?? 50,
      offset: offset ?? 0,
    });
  } catch (err) { next(err); }
});

// â”€â”€â”€ GET /agent/events/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/events/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminOnCompany(req);
    const agentId = getCompanyIdFromReq(req);
    const eventId = Number(req.params.id);
    if (!Number.isFinite(eventId)) throw new AppError(400, 'eventId invÃ¡lido');
    const result = await listEvents({ agentId, limit: 1, offset: 0 });
    const event = result.rows.find((e) => e.id === eventId);
    if (!event) throw new NotFoundError('Evento', String(eventId));
    res.json({ data: event });
  } catch (err) { next(err); }
});

// â”€â”€â”€ POST /agent/events/emit (TEST) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const emitSchema = z.object({
  source:        z.enum(['cron', 'chat', 'user', 'tool', 'db', 'jarvis', 'system', 'webhook']),
  eventType:     z.string().min(1).max(120),
  priority:      z.number().int().min(0).max(1000).optional(),
  payload:       z.record(z.string(), z.unknown()).optional(),
  correlationId: z.string().uuid().optional(),
});

router.post('/events/emit', validate(emitSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminOnCompany(req);
    const agentId = getCompanyIdFromReq(req);
    const body = req.body as z.infer<typeof emitSchema>;

    const input: EmitEventInput = {
      agentId,
      source:        body.source as AgentEventSource,
      eventType:     body.eventType,
      priority:      body.priority,
      payload:       body.payload,
      correlationId: body.correlationId,
    };
    const id = await emitEvent(input);
    res.json({ data: { id, ...input } });
  } catch (err) { next(err); }
});

// â”€â”€â”€ POST /agent/process-now â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/process-now', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminOnCompany(req);
    const agentId = getCompanyIdFromReq(req);
    const dryRun  = req.query.dryRun === 'true' || req.body?.dryRun === true;

    // Forzamos el claim solo para esta empresa.
    const event = await claimNext({ agentId, lockTtlMs: 60_000 });
    if (!event) {
      res.json({ data: null, message: 'No hay eventos pendientes para esta empresa' });
      return;
    }

    // processEvent() ya hace el ciclo completo: razonar, actuar, registrar.
    // Como YA tomamos el lock arriba, processEvent lo va a re-claimear y
    // procesar de nuevo. Para evitar doble procesamiento, lo procesamos
    // manualmente con el eventId.
    // (Fase 0: simplificamos â€” dejamos que processEvent haga su flujo,
    //  y si quiere podemos hacer un bypass despuÃ©s.)
    const processedId = await processEvent({ dryRun });

    res.json({
      data: {
        claimed: event,
        processed: processedId,
        dryRun,
      },
    });
  } catch (err) { next(err); }
});

// â”€â”€â”€ POST /agent/release-stale-locks (TEST) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/release-stale-locks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminOnCompany(req);
    const released = await releaseStaleLocks();
    res.json({ data: { released } });
  } catch (err) { next(err); }
});

// â”€â”€â”€ GET /agent/audit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/audit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminOnCompany(req);
    const agentId = getCompanyIdFromReq(req);
    const stage = req.query.stage as any;
    const toolName = req.query.toolName as string | undefined;
    const eventId = req.query.eventId ? Number(String(req.query.eventId)) : undefined;
    const conversationId = req.query.conversationId ? Number(String(req.query.conversationId)) : undefined;
    const correlationId = req.query.correlationId as string | undefined;
    const fromStr = req.query.from as string | undefined;
    const toStr = req.query.to as string | undefined;
    const from = fromStr ? new Date(fromStr) : undefined;
    const to   = toStr   ? new Date(toStr)   : undefined;
    const limit  = req.query.limit  ? Number(String(req.query.limit))  : undefined;
    const offset = req.query.offset ? Number(String(req.query.offset)) : undefined;

    const result = await listAudit({
      agentId,
      stage, toolName, eventId, conversationId, correlationId,
      from, to, limit, offset,
    });
    res.json({
      data:   result.rows,
      total:  result.total,
      limit:  limit  ?? 50,
      offset: offset ?? 0,
    });
  } catch (err) { next(err); }
});

// â”€â”€â”€ GET /agent/audit/trace/:correlationId â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/audit/trace/:correlationId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminOnCompany(req);
    const agentId = getCompanyIdFromReq(req);
    const correlationId = String(req.params.correlationId);
    if (!correlationId) throw new AppError(400, 'correlationId requerido');
    const rows = await traceCorrelation(correlationId, agentId);
    res.json({ data: rows, total: rows.length });
  } catch (err) { next(err); }
});

// â”€â”€â”€ GET /agent/proposals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/proposals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminOnCompany(req);
    const agentId = getCompanyIdFromReq(req);
    const status = (req.query.status as any) ?? 'pending';
    const actionType = req.query.actionType as string | undefined;
    const limit  = req.query.limit  ? Number(String(req.query.limit))  : undefined;
    const offset = req.query.offset ? Number(String(req.query.offset)) : undefined;
    const result = await listProposals({ agentId, status, actionType, limit, offset });
    res.json({
      data:  result.rows,
      total: result.total,
      limit: limit  ?? 50,
      offset: offset ?? 0,
    });
  } catch (err) { next(err); }
});

// â”€â”€â”€ GET /agent/proposals/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/proposals/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminOnCompany(req);
    const agentId = getCompanyIdFromReq(req);
    const id = String(req.params.id);
    const proposal = await getProposalById(id);
    if (!proposal) throw new NotFoundError('Proposal', id);
    if (proposal.agentId !== agentId) {
      throw new ForbiddenError('Proposal no pertenece a esta empresa');
    }
    res.json({ data: proposal });
  } catch (err) { next(err); }
});

// â”€â”€â”€ POST /agent/proposals/:id/resolve â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const resolveSchema = z.object({
  approved:         z.boolean(),
  rejectionReason:  z.string().max(500).optional(),
  result:           z.record(z.string(), z.unknown()).optional(),
});

router.post(
  '/proposals/:id/resolve',
  validate(resolveSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAdminOnCompany(req);
      const agentId = getCompanyIdFromReq(req);
      const id = String(req.params.id);
      const body = req.body as z.infer<typeof resolveSchema>;

      // Verificar que la proposal pertenece a esta empresa.
      const proposal = await getProposalById(id);
      if (!proposal) throw new NotFoundError('Proposal', id);
      if (proposal.agentId !== agentId) {
        throw new ForbiddenError('Proposal no pertenece a esta empresa');
      }

      const resolvedBy = Number(req.user?.sub);
      if (!Number.isFinite(resolvedBy)) {
        throw new AppError(403, 'userId ausente en sesiÃ³n');
      }

      const result = await resolveAction({
        proposalId:      id,
        resolvedBy,
        approved:        body.approved,
        rejectionReason: body.rejectionReason,
        result:          body.result,
      });
      res.json({ data: { status: result.status, proposal: result.proposal } });
    } catch (err) { next(err); }
  },
);

// â”€â”€â”€ POST /agent/proposals/expire-stale â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/proposals/expire-stale', async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireAdminOnCompany(req);
    const expired = await expireOldProposals();
    res.json({ data: { expired } });
  } catch (err) { next(err); }
});

// ─── POST /agent/test-llm (EXPERIMENTAL, solo para probar modelos) ────────
//
// Este endpoint es AISLADO del flujo principal. NO toca agent-core.ts,
// NO usa el bus de eventos, NO crea audit log. Solo llama al LLM directo
// y devuelve el response crudo + lo que se parseó.
//
// Sirve para probar modelos como gemma4 sin afectar el sistema en
// producción. Si funciona, podemos migrar el flujo principal.
const testLlmSchema = z.object({
  text: z.string().min(1).max(2000),
  model: z.string().optional(),
});

router.post(
  '/test-llm',
  validate(testLlmSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAdminOnCompany(req);
      const body = req.body as z.infer<typeof testLlmSchema>;
      const agentId = getCompanyIdFromReq(req);

      // Importación dinámica para no cargar alt en el flujo normal.
      const { altLlmCaller } = await import('../../lib/agent-core.alt');

      // Forzar el modelo (override de env var) para esta request.
      if (body.model) process.env.ALT_LLM_MODEL = body.model;
      const usedModel = body.model ?? process.env.ALT_LLM_MODEL ?? 'gemma4:e2b';

      const event = {
        id: 0,
        agentId,
        source: 'user' as const,
        eventType: 'test.direct_query',
        priority: 0,
        payload: { text: body.text },
        correlationId: null,
        claimAttempts: 0,
        claimError: null,
        createdAt: new Date(),
        processedAt: null,
        claimExpiresAt: null,
      };

      const toolContext = {
        empresaId: agentId,
        userId: Number(req.user?.sub) || 0,
        rol: 'admin_empresa' as const,
      };

      const t0 = Date.now();
      let decision: any;
      let error: string | null = null;
      try {
        decision = await altLlmCaller.reason({
          systemPrompt: 'Eres el Agent Core de Motors ApliSmart (modo de prueba experimental).',
          event,
          toolContext,
        });
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      const elapsed = Date.now() - t0;

      res.json({
        data: {
          ok: error == null,
          model: usedModel,
          elapsedMs: elapsed,
          decision,
          error,
        },
      });
    } catch (err) { next(err); }
  },
);

export default router;
