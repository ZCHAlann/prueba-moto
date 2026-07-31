// routes/ai-api/modules/tickets.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Tickets de soporte.
//
// Los tickets en este sistema son EXCLUSIVAMENTE de plataforma (no hay
// tabla de tickets a nivel de empresa en `company_*`). El módulo de
// tickets se accede vía `/platform/tickets` con scope=plataforma.
//
// Por lo tanto, /api/ai/tickets NO está implementado. Si el Custom GPT
// necesita crear un ticket de soporte, debe usarse el canal de
// plataforma directamente. Si el LLM llama /api/ai/tickets, devolvemos
// un 501 con un mensaje claro para que el LLM no se confunda.
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { authAiApiKey } from '../../../middlewares/auth-ai-key';
import { withAudit } from '../shared';
import { AppError } from '../../../lib/errors';

const router = Router();

router.get(
  '/tickets',
  authAiApiKey,
  withAudit(async (_req, _res) => {
    throw new AppError(
      501,
      'Los tickets de soporte se gestionan a nivel de plataforma (no de empresa). ' +
      'El Custom GPT no puede crear tickets en nombre de una empresa. ' +
      'Si necesitás reportar un bug o pedir soporte, decile al usuario que contacte ' +
      'al equipo de plataforma por WhatsApp o email.',
    );
  }),
);

router.post(
  '/tickets',
  authAiApiKey,
  withAudit(async (_req, _res) => {
    throw new AppError(
      501,
      'Endpoint no implementado. Los tickets son de plataforma, no de empresa.',
    );
  }),
);

export default router;
