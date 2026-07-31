// routes/ai-api/modules/finanzas.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Endpoints de finanzas (caja chica + facturas) para /api/ai/*.
//
// 6 endpoints:
//   - GET  /finanzas/caja-chica
//   - GET  /finanzas/solicitudes
//   - POST /finanzas/solicitudes/create
//   - PATCH /finanzas/solicitudes/:id/revisar
//   - GET  /finanzas/facturas
//   - GET  /finanzas/facturas/stats
//
// Las facturas NO se pueden crear vía API (la API original no tiene
// endpoint de creación — se crean vía maintenance attachments).
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, lte, sql, count } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyPettyCashAccounts, companyFinanceRequests, companyInvoices,
} from '../../../db/schema/operational';
import { authAiApiKey, requireAiApiScope } from '../../../middlewares/auth-ai-key';
import {
  withAudit, requireCtx, parseBody, parseQuery, todayYmdEc, parseEntityId,
} from '../shared';
import { AppError, NotFoundError } from '../../../lib/errors';

const router = Router();

// ── 1. GET /finanzas/caja-chica ──────────────────────────────────────
router.get(
  '/finanzas/caja-chica',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const accounts = await db.select()
      .from(companyPettyCashAccounts)
      .where(eq(companyPettyCashAccounts.companyId, companyId))
      .orderBy(companyPettyCashAccounts.id);

    res.json({
      total: accounts.length,
      cuentas: accounts.map((a) => ({
        id: `petty-cash-${a.id}`,
        siteId: a.siteId ? `site-${a.siteId}` : null,
        modo: a.mode,
        periodo: a.periodKind,
        montoInicial: Number(a.initialAmount),
        limite: Number(a.limitAmount),
        saldoActual: Number(a.currentBalance),
        activa: a.isActive,
        fechaInicioPeriodo: a.periodStartedAt,
      })),
    });
  }),
);

// ── 2. GET /finanzas/solicitudes ────────────────────────────────────
const solicitudesQuery = z.object({
  estado: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get(
  '/finanzas/solicitudes',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const { estado, limit } = parseQuery(solicitudesQuery, req.query);

    const conds = [eq(companyFinanceRequests.companyId, companyId)];
    if (estado) conds.push(eq(companyFinanceRequests.status, estado));

    const rows = await db
      .select()
      .from(companyFinanceRequests)
      .where(and(...conds))
      .orderBy(desc(companyFinanceRequests.createdAt))
      .limit(limit);

    res.json({
      total: rows.length,
      solicitudes: rows.map((r) => ({
        id: `finance-request-${r.id}`,
        monto: Number(r.amount),
        motivo: r.reason,
        justificacion: r.justificationNotes,
        status: r.status,
        clasificacion: r.classification,
        origen: r.origin,
        createdAt: r.createdAt,
        reviewedAt: r.reviewedAt,
        rejectionReason: r.rejectionReason,
      })),
    });
  }),
);

// ── 3. POST /finanzas/solicitudes/create ─────────────────────────────
const solicitudSchema = z.object({
  monto: z.coerce.number().min(0),
  motivo: z.string().min(3).max(280),
  justificacion: z.string().max(2000).optional(),
  siteId: z.string().optional(),  // formato "site-N" — el primer site de la empresa
});

router.post(
  '/finanzas/solicitudes/create',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const body = parseBody(solicitudSchema, req.body);

    // Resolver siteId: si el cliente mandó "site-N", parseamos; si no, el primer site de la empresa.
    let siteId: number;
    if (body.siteId) {
      const m = String(body.siteId).match(/^(?:site-)?(\d+)$/);
      if (!m) throw new AppError(400, 'siteId inválido');
      siteId = Number(m[1]);
    } else {
      // Buscar el primer site de la empresa.
      const { companySites } = await import('../../../db/schema/operational');
      const [firstSite] = await db.select({ id: companySites.id })
        .from(companySites)
        .where(eq(companySites.companyId, companyId))
        .orderBy(companySites.id)
        .limit(1);
      if (!firstSite) throw new AppError(400, 'La empresa no tiene sedes — no se puede crear la solicitud');
      siteId = firstSite.id;
    }

    // El requesterUserId es requerido pero como la API key no tiene un
    // usuario humano concreto, usamos un "system" user. Si no existe,
    // fallamos con 400 explicando que se necesita un usuario real.
    // Workaround: si la empresa tiene un owner, usamos ese.
    const { companyUsers } = await import('../../../db/schema/platform');
    const [owner] = await db.select({ id: companyUsers.id })
      .from(companyUsers)
      .where(and(
        eq(companyUsers.companyId, companyId),
        eq(companyUsers.role, 'owner_empresa'),
      ))
      .limit(1);
    if (!owner) {
      throw new AppError(400, 'La empresa no tiene un owner. No se puede crear la solicitud desde la API.');
    }

    const [created] = await db.insert(companyFinanceRequests).values({
      companyId,
      siteId,
      requesterUserId: owner.id,
      amount: String(body.monto),
      reason: body.motivo,
      justificationNotes: body.justificacion ?? null,
      origin: 'standalone',
      classification: 'pending',
      status: 'pending',
    }).returning();

    res.status(201).json({
      id: `finance-request-${created.id}`,
      monto: Number(created.amount),
      motivo: created.reason,
      status: created.status,
      resumenTexto: `Solicitud de recurso por $${Number(created.amount).toFixed(2)} creada, pendiente de aprobación.`,
    });
  }),
);

// ── 4. PATCH /finanzas/solicitudes/:id/revisar ────────────────────────
const revisarSchema = z.object({
  decision: z.enum(['Aprobar', 'Rechazar']),
  motivo: z.string().max(2000).optional(),
});

router.patch(
  '/finanzas/solicitudes/:id/revisar',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'finance-request');
    const body = parseBody(revisarSchema, req.body);

    const [existing] = await db.select()
      .from(companyFinanceRequests)
      .where(and(
        eq(companyFinanceRequests.id, idNum),
        eq(companyFinanceRequests.companyId, companyId),
      ))
      .limit(1);
    if (!existing) throw new NotFoundError('Solicitud', String(req.params.id));
    if (existing.status !== 'pending') {
      throw new AppError(409, `La solicitud ya está "${existing.status}"`);
    }

    const [updated] = await db.update(companyFinanceRequests)
      .set({
        status: body.decision === 'Aprobar' ? 'approved' : 'rejected',
        rejectionReason: body.decision === 'Rechazar' ? (body.motivo ?? null) : null,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companyFinanceRequests.id, idNum))
      .returning();

    res.json({
      id: `finance-request-${updated!.id}`,
      status: updated!.status,
      motivo: body.motivo ?? null,
      resumenTexto: `Solicitud ${body.decision === 'Aprobar' ? 'aprobada' : 'rechazada'}${body.motivo ? `: ${body.motivo}` : ''}.`,
    });
  }),
);

// ── 5. GET /finanzas/facturas (read-only) ────────────────────────────
const facturasQuery = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get(
  '/finanzas/facturas',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const { desde, hasta, limit } = parseQuery(facturasQuery, req.query);

    const conds = [eq(companyInvoices.companyId, companyId)];
    if (desde) conds.push(gte(companyInvoices.invoiceDate, desde));
    if (hasta) conds.push(lte(companyInvoices.invoiceDate, hasta));

    const rows = await db.select()
      .from(companyInvoices)
      .where(and(...conds))
      .orderBy(desc(companyInvoices.invoiceDate))
      .limit(limit);

    res.json({
      total: rows.length,
      facturas: rows.map((r) => ({
        id: `invoice-${r.id}`,
        numero: r.invoiceNumber,
        fecha: r.invoiceDate,
        total: Number(r.total ?? 0),
        subtotal: Number(r.subtotal ?? 0),
        iva: Number(r.ivaAmount ?? 0),
        ivaPorcentaje: Number(r.ivaPercent ?? 0),
        estado: r.status,
        sourceModule: r.sourceModule,
      })),
    });
  }),
);

// ── 6. GET /finanzas/facturas/stats ─────────────────────────────────
router.get(
  '/finanzas/facturas/stats',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const today = todayYmdEc();
    const monthStart = today.slice(0, 8) + '01';

    const [mes, total] = await Promise.all([
      db.select({
        total: sql<string>`COALESCE(SUM(${companyInvoices.total}), 0)::text`,
        iva: sql<string>`COALESCE(SUM(${companyInvoices.ivaAmount}), 0)::text`,
        count: count(),
      })
        .from(companyInvoices)
        .where(and(
          eq(companyInvoices.companyId, companyId),
          gte(companyInvoices.invoiceDate, monthStart),
          lte(companyInvoices.invoiceDate, today),
        )),
      db.select({ n: count() })
        .from(companyInvoices)
        .where(eq(companyInvoices.companyId, companyId)),
    ]);

    res.json({
      periodo: { desde: monthStart, hasta: today },
      totalFacturas: total[0]?.n ?? 0,
      mes: {
        total: Number(mes[0]?.total ?? 0),
        iva: Number(mes[0]?.iva ?? 0),
        cantidad: mes[0]?.count ?? 0,
      },
      resumenTexto: `Facturas del mes: ${mes[0]?.count ?? 0} por un total de $${Number(mes[0]?.total ?? 0).toFixed(2)} (IVA incluido).`,
    });
  }),
);

export default router;
