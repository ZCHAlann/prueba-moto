// routes/company/whatsapp-settings.ts
// ─────────────────────────────────────────────────────────────────────────────
// CRUD de configuración de WhatsApp por empresa (jul 2026 v8.6).
//
// GET  /api/company/:id/whatsapp-settings → devuelve la config (o defaults
//                                       si no hay fila). El frontend usa
//                                       esto para mostrar la pantalla.
//
// PUT  /api/company/:id/whatsapp-settings → upsert. Body:
//   {
//     notifyNumbers:     string[]   (max 20, cada uno solo dígitos)
//     templateScheduled: string?    (max 1000 chars)
//     templateCompleted: string?    (max 1000 chars)
//     enabled:           boolean?
//   }
//
// Restringido a admin/owner de la empresa (requireAdmin). Superadmin
// también puede entrar (requireModule/permission lo permiten).
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyWhatsappSettings } from '../../db/schema/whatsapp';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { ForbiddenError } from '../../lib/errors';

const router = Router();

function getCompanyIdFromReq(req: Request): number {
  // (jul 2026 v8.6) — El `companyId` SIEMPRE se saca del JWT del
  // usuario autenticado (`req.user.companyId`), no del `:id` de la URL.
  //
  // El middleware `requireCompany` (montado a nivel del router padre
  // en routes/company/index.ts) ya validó que ese `companyId` del JWT
  // coincide con el `:id` de la URL, así que ambos dan lo mismo.
  // Usamos el del JWT para no depender de params de sub-routers.
  const id = req.user?.companyId;
  if (typeof id !== 'number' || !Number.isFinite(id) || id <= 0) {
    throw new ForbiddenError('Sesión sin empresa asociada');
  }
  return id;
}

// Sin `requireModule` porque WhatsApp no es un módulo pago, es
// feature base de la plataforma.

// ─── GET /whatsapp-settings ──────────────────────────────────────────────

router.get(
  '/whatsapp-settings',
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromReq(req);
      const [row] = await db
        .select()
        .from(companyWhatsappSettings)
        .where(eq(companyWhatsappSettings.companyId, companyId))
        .limit(1);
      res.json({
        exists: !!row,
        notifyNumbers:     row?.notifyNumbers     ?? [],
        templateScheduled: row?.templateScheduled ?? null,
        templateCompleted: row?.templateCompleted ?? null,
        enabled:            row?.enabled            ?? true,
        createdAt:          row?.createdAt          ?? null,
        updatedAt:          row?.updatedAt          ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /:id/whatsapp-settings ───────────────────────────────────────────

const putSchema = z.object({
  notifyNumbers:     z.array(
    z.string().regex(/^\d{9,15}$/, 'Número debe tener 9-15 dígitos sin "+"'),
  ).max(20, 'Máximo 20 números destinatarios').default([]),
  templateScheduled: z.string().max(1000, 'Máximo 1000 caracteres').nullable().optional(),
  templateCompleted: z.string().max(1000, 'Máximo 1000 caracteres').nullable().optional(),
  enabled:           z.boolean().optional(),
});

router.put(
  '/whatsapp-settings',
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = getCompanyIdFromReq(req);
      const body = putSchema.parse(req.body);

      const [existing] = await db
        .select()
        .from(companyWhatsappSettings)
        .where(eq(companyWhatsappSettings.companyId, companyId))
        .limit(1);

      const values = {
        companyId,
        notifyNumbers:     body.notifyNumbers,
        templateScheduled: body.templateScheduled ?? null,
        templateCompleted: body.templateCompleted ?? null,
        enabled:            body.enabled            ?? true,
        updatedAt:          new Date(),
      };

      if (existing) {
        await db
          .update(companyWhatsappSettings)
          .set(values)
          .where(eq(companyWhatsappSettings.companyId, companyId));
      } else {
        await db.insert(companyWhatsappSettings).values(values);
      }

      const [row] = await db
        .select()
        .from(companyWhatsappSettings)
        .where(eq(companyWhatsappSettings.companyId, companyId))
        .limit(1);

      res.json({
        ok: true,
        settings: {
          exists: !!row,
          notifyNumbers:     row?.notifyNumbers     ?? [],
          templateScheduled: row?.templateScheduled ?? null,
          templateCompleted: row?.templateCompleted ?? null,
          enabled:            row?.enabled            ?? true,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
