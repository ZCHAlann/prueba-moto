// ─────────────────────────────────────────────────────────────────────────────
// routes/company/finance-invoice-reviews.ts
//
// jul 2026 v5 — Router del sistema de revisión contable de facturas de
// caja chica (migración 0051).
//
// Solo aplica a vales con `purpose='repuesto'` (los de mantenimiento se
// backfillean a repuesto). Los vales con `purpose='otro'` quedan en
// estado "not_required" y no aparecen en "Facturas por revisar".
//
// Endpoints:
//   GET    /finance/invoice-reviews?tab=&siteId=   → listar por estado
//                                                    (pending|seen|under|
//                                                    correction|approved)
//   GET    /finance/invoice-reviews/:id           → detalle + voucher + invoice
//   POST   /finance/invoice-reviews/:id/seen     → revisor abrió la foto
//   POST   /finance/invoice-reviews/:id/start    → revisor abrió el checklist
//   POST   /finance/invoice-reviews/:id/approve  → aprueba
//   POST   /finance/invoice-reviews/:id/send-to-correction
//                                                 → marca error + notifica
//                                                   al solicitante
//   POST   /finance/invoice-reviews/:id/reupload → solicitante sube nueva
//                                                   foto (regresa a
//                                                   pending_review)
//   GET    /finance/invoice-reviews/:id/timeline → eventos ordenados
//
// Permisos:
//   - finanzas.caja_chica.revisar_facturas → TODO (admin/owner/superadmin
//     bypasean via usePermissions).
//   - El reupload de foto lo hace el solicitante del vale; si no tiene
//     revisar_facturas, el endpoint igual le deja si es el dueño del vale.
//
// Aislamiento: companyId siempre del path param, validado por
// requireCompany. ─────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, asc, sql, isNull, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyPettyCashVouchers,
  companyFinanceRequests,
  companyInvoices,
  companySites,
  companyInvoiceReviews,
  companyInvoiceReviewEvents,
} from '../../db/schema/operational';
import { companyUsers } from '../../db/schema/platform';
import { requirePermission } from '../../middlewares/requirePermission';
import { AppError, NotFoundError } from '../../lib/errors';
import { parseIdFlexible, toId } from '../../lib/ids';
import { validate } from '../../lib/validate';
import { isAdminRole, hasPermOrAdmin } from '../../lib/finance-bypass';
import { notify, notifyAdminsExceptActor } from '../../lib/notification-service';
import {
  recordVoucherReopenForCorrection,
  recordVoucherRecloseForCorrection,
} from '../../lib/finance-movements';

const router = Router({ mergeParams: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureCompanyId(value: number | undefined): number {
  if (value == null) throw new AppError(403, 'companyId ausente en sesión');
  return value;
}

function getUserId(req: any): number {
  if (!req.user?.sub) throw new AppError(403, 'userId ausente en sesión');
  return parseIdFlexible('company-user', String(req.user.sub));
}

const ADMIN_ROLES_BYPASS = new Set([
  'superadmin',
  'owner_empresa',
  'admin_empresa',
]);
function isReviewer(req: any): boolean {
  return hasPermOrAdmin(req, 'finanzas', 'caja_chica', 'revisar_facturas');
}

// Transición de estado — se aplica en cada endpoint y se registra un
// evento en la tabla append-only.
type ReviewStatus =
  | 'pending_review'
  | 'seen'
  | 'under_review'
  | 'correction_requested'
  | 'approved'
  | 'not_required';

const VALID_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  pending_review:        ['seen'],
  seen:                  ['under_review', 'correction_requested'],
  under_review:          ['correction_requested', 'approved'],
  correction_requested:  ['pending_review'], // solo cuando el solicitante sube nueva foto
  approved:              [], // terminal
  not_required:          [], // fuera del flujo
};

async function logEvent(
  tx: typeof db,
  args: {
    companyId: number;
    reviewId: number;
    kind: 'created' | 'reviewer_seen' | 'reviewer_started' | 'correction_requested' | 'photo_reuploaded' | 'approved';
    actorUserId: number | null;
    note?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.insert(companyInvoiceReviewEvents).values({
    companyId:    args.companyId,
    reviewId:     args.reviewId,
    kind:         args.kind,
    actorUserId:  args.actorUserId,
    note:         args.note ?? null,
    metadata:     args.metadata ?? {},
  });
}

async function transitionReview(
  tx: typeof db,
  args: {
    companyId: number;
    reviewId: number;
    from: ReviewStatus;
    to: ReviewStatus;
    actorUserId: number | null;
    note?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  if (!VALID_TRANSITIONS[args.from]?.includes(args.to)) {
    throw new AppError(
      409,
      `Transición inválida: ${args.from} → ${args.to}`,
    );
  }
  const update: Record<string, unknown> = {
    status:    args.to,
    updatedAt: sql`now()`,
  };
  if (args.to === 'correction_requested') {
    update.lastCorrectionAt  = sql`now()`;
    update.lastCorrectionBy  = args.actorUserId;
    update.lastCorrectionNote = args.note ?? null;
  }
  if (args.to === 'approved') {
    update.approvedBy = args.actorUserId;
    update.approvedAt = sql`now()`;
  }
  if (args.to === 'pending_review' && args.from === 'correction_requested') {
    // Limpia la nota de corrección cuando se sube nueva foto.
    update.lastCorrectionNote = null;
  }
  await tx
    .update(companyInvoiceReviews)
    .set(update)
    .where(eq(companyInvoiceReviews.id, args.reviewId));

  await logEvent(tx, {
    companyId:   args.companyId,
    reviewId:    args.reviewId,
    kind:        (() => {
      const map: Record<ReviewStatus, any> = {
        pending_review:       'photo_reuploaded',
        seen:                 'reviewer_seen',
        under_review:         'reviewer_started',
        correction_requested: 'correction_requested',
        approved:             'approved',
        not_required:         'created',
      };
      return map[args.to];
    })(),
    actorUserId: args.actorUserId,
    note:        args.note ?? null,
    metadata:    args.metadata ?? {},
  });
}

// ─── GET /finance/invoice-reviews  ──────────────────────────────────────────
// Lista facturas con su review asociado. tab: pending|seen|under|correction|approved.
// Por defecto devuelve las "pending_review" (la pestaña "Facturas por revisar"
// del frontend). El "semáforo" se computa en runtime desde `status`.

const listQuerySchema = z.object({
  tab: z.enum(['pending_review', 'seen', 'under_review', 'correction_requested', 'approved', 'all']).default('pending_review'),
  siteId: z.string().regex(/^\d+$/).optional(),
}).strict();

router.get('/invoice-reviews', requirePermission('finanzas', 'caja_chica', 'revisar_facturas'), async (req, res, next) => {
  try {
    const companyId = ensureCompanyId(req.companyId);
    const q = listQuerySchema.parse(req.query);
    const siteIdNum = q.siteId ? parseInt(q.siteId, 10) : null;

    // jul 2026 v6 — Mismo resync defensivo que en GET /vouchers:
    // si hay vales con review='correction_requested' pero
    // voucher.status='closed', los reabrimos a 'open' antes de listar.
    // Idempotente y barato.
    try {
      const stale = await db
        .select({ voucherId: companyInvoiceReviews.voucherId })
        .from(companyInvoiceReviews)
        .innerJoin(companyPettyCashVouchers, eq(companyPettyCashVouchers.id, companyInvoiceReviews.voucherId))
        .where(and(
          eq(companyInvoiceReviews.companyId, companyId),
          eq(companyInvoiceReviews.status, 'correction_requested'),
          eq(companyPettyCashVouchers.status, 'closed'),
        ));
      if (stale.length > 0) {
        const ids = stale.map(s => s.voucherId);
        await db
          .update(companyPettyCashVouchers)
          .set({ status: 'open', updatedAt: sql`now()` })
          .where(inArray(companyPettyCashVouchers.id, ids));
        console.log(`[GET /invoice-reviews] Reopen defensivo: ${stale.length} vales reconciliados.`, { companyId, ids });
      }
    } catch (syncErr) {
      console.warn('[GET /invoice-reviews] resync defensivo falló:', (syncErr as Error).message);
    }

    const conditions: any[] = [
      eq(companyInvoiceReviews.companyId, companyId),
      // Nunca devolvemos las 'not_required' (las que no aplican al flujo).
      sql`${companyInvoiceReviews.status} <> 'not_required'`,
    ];
    if (q.tab !== 'all') {
      conditions.push(eq(companyInvoiceReviews.status, q.tab));
    } else {
      // jul 2026 v6/v7 — Cuando se pide "all" (vista general de
      // "Facturas por revisar"), excluimos las que ya están en
      // 'correction_requested' (viven solo en la pestaña "Correcciones")
      // Y las 'approved' (trabajo terminado, no requieren revisión).
      // Si el frontend pide tab=correction_requested o tab=approved
      // explícito, sí las devolvemos.
      conditions.push(sql`${companyInvoiceReviews.status} <> 'correction_requested'`);
      conditions.push(sql`${companyInvoiceReviews.status} <> 'approved'`);
    }
    if (siteIdNum) {
      conditions.push(eq(companyPettyCashVouchers.siteId, siteIdNum));
    }

    const rows = await db
      .select({
        review:        companyInvoiceReviews,
        voucher:       companyPettyCashVouchers,
        invoice:       companyInvoices,
        siteName:      companySites.name,
        requesterName: sql<string>`requester.profile_data->>'fullName'`,
        requesterUsername: sql<string>`requester.username`,
        reviewerName:  sql<string>`reviewer.profile_data->>'fullName'`,
      })
      .from(companyInvoiceReviews)
      .innerJoin(companyPettyCashVouchers, eq(companyPettyCashVouchers.id, companyInvoiceReviews.voucherId))
      .innerJoin(companyInvoices, eq(companyInvoices.id, companyInvoiceReviews.invoiceId))
      .innerJoin(companySites, eq(companySites.id, companyPettyCashVouchers.siteId))
      .leftJoin(companyFinanceRequests, eq(companyFinanceRequests.id, companyPettyCashVouchers.requestId))
      .leftJoin(sql`${companyUsers} AS requester`, sql`requester.id = ${companyFinanceRequests.requesterUserId}`)
      .leftJoin(sql`${companyUsers} AS reviewer`,  sql`reviewer.id = ${companyInvoiceReviews.currentReviewerId}`)
      .where(and(...conditions))
      .orderBy(desc(companyInvoiceReviews.updatedAt))
      .limit(500);

    return res.json({
      reviews: rows.map(r => ({
        id:                  toId('invoice-review', r.review.id),
        numericId:           r.review.id,
        status:              r.review.status,
        lastCorrectionNote:  r.review.lastCorrectionNote,
        lastCorrectionAt:    r.review.lastCorrectionAt,
        approvedAt:          r.review.approvedAt,
        approvedBy:          r.review.approvedBy,
        currentReviewerId:   r.review.currentReviewerId,
        currentReviewerName: r.reviewerName,
        voucher: {
          id:             toId('petty-cash-voucher', r.voucher.id),
          numericId:      r.voucher.id,
          issuedAmount:   Number(r.voucher.issuedAmount),
          closedActualAmount: r.voucher.closedActualAmount ? Number(r.voucher.closedActualAmount) : null,
          purpose:        r.voucher.purpose,
          siteId:         r.voucher.siteId,
          siteName:       r.siteName,
        },
        invoice: {
          id:            toId('invoice', r.invoice.id),
          numericId:     r.invoice.id,
          invoiceNumber: r.invoice.invoiceNumber,
          fileUrl:       r.invoice.fileUrl,
          fileMimeType:  r.invoice.fileMimeType,
          total:         Number(r.invoice.total ?? r.invoice.amount ?? 0),
          supplierName:  r.invoice.supplierName,
        },
        requesterName: r.requesterName ?? r.requesterUsername ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /finance/invoice-reviews/:id  ──────────────────────────────────────

router.get('/invoice-reviews/:id', requirePermission('finanzas', 'caja_chica', 'revisar_facturas'), async (req, res, next) => {
  try {
    const companyId = ensureCompanyId(req.companyId);
    const reviewId = parseIdFlexible('any', String(req.params.id));
    const [row] = await db
      .select({
        review:   companyInvoiceReviews,
        voucher:  companyPettyCashVouchers,
        invoice:  companyInvoices,
        siteName: companySites.name,
      })
      .from(companyInvoiceReviews)
      .innerJoin(companyPettyCashVouchers, eq(companyPettyCashVouchers.id, companyInvoiceReviews.voucherId))
      .innerJoin(companyInvoices, eq(companyInvoices.id, companyInvoiceReviews.invoiceId))
      .innerJoin(companySites, eq(companySites.id, companyPettyCashVouchers.siteId))
      .where(and(
        eq(companyInvoiceReviews.id, reviewId),
        eq(companyInvoiceReviews.companyId, companyId),
      ))
      .limit(1);
    if (!row) throw new NotFoundError('Review', String(reviewId));
    return res.json({
      id:                  toId('invoice-review', row.review.id),
      numericId:           row.review.id,
      status:              row.review.status,
      lastCorrectionNote:  row.review.lastCorrectionNote,
      lastCorrectionAt:    row.review.lastCorrectionAt,
      lastCorrectionBy:    row.review.lastCorrectionBy,
      approvedAt:          row.review.approvedAt,
      approvedBy:          row.review.approvedBy,
      currentReviewerId:   row.review.currentReviewerId,
      voucher: {
        id:                 toId('petty-cash-voucher', row.voucher.id),
        numericId:          row.voucher.id,
        issuedAmount:       Number(row.voucher.issuedAmount),
        closedActualAmount: row.voucher.closedActualAmount ? Number(row.voucher.closedActualAmount) : null,
        purpose:            row.voucher.purpose,
        siteId:             row.voucher.siteId,
        siteName:           row.siteName,
      },
      invoice: {
        id:             toId('invoice', row.invoice.id),
        numericId:      row.invoice.id,
        invoiceNumber:  row.invoice.invoiceNumber,
        fileUrl:        row.invoice.fileUrl,
        fileMimeType:   row.invoice.fileMimeType,
        total:          Number(row.invoice.total ?? row.invoice.amount ?? 0),
        supplierName:   row.invoice.supplierName,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /finance/invoice-reviews/:id/seen  ───────────────────────────────
// El revisor abrió la foto. pending_review → seen.

router.post('/invoice-reviews/:id/seen', requirePermission('finanzas', 'caja_chica', 'revisar_facturas'), async (req, res, next) => {
  try {
    const companyId = ensureCompanyId(req.companyId);
    const userId    = getUserId(req);
    const reviewId  = parseIdFlexible('any', String(req.params.id));

    const [row] = await db
      .select()
      .from(companyInvoiceReviews)
      .where(and(eq(companyInvoiceReviews.id, reviewId), eq(companyInvoiceReviews.companyId, companyId)))
      .limit(1);
    if (!row) throw new NotFoundError('Review', String(reviewId));

    await transitionReview(db, {
      companyId:   companyId,
      reviewId:    row.id,
      from:        row.status as ReviewStatus,
      to:          'seen',
      actorUserId: userId,
    });
    await db
      .update(companyInvoiceReviews)
      .set({ currentReviewerId: userId })
      .where(eq(companyInvoiceReviews.id, row.id));

    return res.json({ ok: true, status: 'seen' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /finance/invoice-reviews/:id/start  ──────────────────────────────
// El revisor abrió el checklist. seen → under_review.

router.post('/invoice-reviews/:id/start', requirePermission('finanzas', 'caja_chica', 'revisar_facturas'), async (req, res, next) => {
  try {
    const companyId = ensureCompanyId(req.companyId);
    const userId    = getUserId(req);
    const reviewId  = parseIdFlexible('any', String(req.params.id));

    const [row] = await db
      .select()
      .from(companyInvoiceReviews)
      .where(and(eq(companyInvoiceReviews.id, reviewId), eq(companyInvoiceReviews.companyId, companyId)))
      .limit(1);
    if (!row) throw new NotFoundError('Review', String(reviewId));

    await transitionReview(db, {
      companyId:   companyId,
      reviewId:    row.id,
      from:        row.status as ReviewStatus,
      to:          'under_review',
      actorUserId: userId,
    });
    return res.json({ ok: true, status: 'under_review' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /finance/invoice-reviews/:id/approve  ────────────────────────────
// under_review → approved. El body trae los 5 checks: si alguno falta, 400.

const approveSchema = z.object({
  checks: z.object({
    // jul 2026 v5 — 5 checks del checklist de revisión contable:
    //   sello_autorizacion  — SRI autorizó la factura
    //   no_caducada         — no pasó la fecha de caducidad
    //   check_3             — monto coincide con vale aprobado
    //   check_4             — fecha de factura coherente con la compra
    //   nombre_ruc_empresa  — factura a nombre de la empresa
    sello_autorizacion:      z.boolean(),
    no_caducada:             z.boolean(),
    check_3:                 z.boolean(),
    check_4:                 z.boolean(),
    nombre_ruc_empresa:      z.boolean(),
  }).strict(),
}).strict();

router.post('/invoice-reviews/:id/approve', requirePermission('finanzas', 'caja_chica', 'revisar_facturas'), validate(approveSchema), async (req, res, next) => {
  try {
    const companyId = ensureCompanyId(req.companyId);
    const userId    = getUserId(req);
    const reviewId  = parseIdFlexible('any', String(req.params.id));
    const { checks } = req.body as z.infer<typeof approveSchema>;

    const allChecked = Object.values(checks).every(v => v === true);
    if (!allChecked) {
      throw new AppError(400, 'Todos los checks deben estar marcados para aprobar');
    }

    const [row] = await db
      .select({
        review:  companyInvoiceReviews,
        voucher: companyPettyCashVouchers,
        request: companyFinanceRequests,
      })
      .from(companyInvoiceReviews)
      .innerJoin(companyPettyCashVouchers, eq(companyPettyCashVouchers.id, companyInvoiceReviews.voucherId))
      .innerJoin(companyFinanceRequests, eq(companyFinanceRequests.id, companyPettyCashVouchers.requestId))
      .where(and(eq(companyInvoiceReviews.id, reviewId), eq(companyInvoiceReviews.companyId, companyId)))
      .limit(1);
    if (!row) throw new NotFoundError('Review', String(reviewId));

    await transitionReview(db, {
      companyId:   companyId,
      reviewId:    row.review.id,
      from:        row.review.status as ReviewStatus,
      to:          'approved',
      actorUserId: userId,
      metadata:    { checks },
    });

    // jul 2026 v6 — Cerrar el vale SIEMPRE que se aprueba una review
    // con closedInvoiceId (que es el caso normal: el vale fue cerrado
    // por el operador, generó una invoice, y ahora la review se aprueba
    // — ya sea en el primer ciclo o después de una corrección). La
    // factura del comprobante original sigue en el ledger, no se duplica.
    if (row.voucher.closedInvoiceId) {
      await db
        .update(companyPettyCashVouchers)
        .set({ status: 'closed', updatedAt: sql`now()` })
        .where(eq(companyPettyCashVouchers.id, row.voucher.id));
      // Solo registramos el movement de "re-cerrado por corrección" si
      // el vale estaba en 'open' antes (es decir, fue reabierto
      // previamente). En el caso normal de un vale que ya estaba
      // 'closed' y se aprueba su review, el historial ya tiene su
      // movement de cierre normal; no duplicamos.
      if (row.voucher.status === 'open') {
        await recordVoucherRecloseForCorrection({
          voucherId:   row.voucher.id,
          actorUserId: userId,
          note:        'Corrección aprobada — vale recerrado.',
        });
      }
    }

    // jul 2026 v6 — Notificar al operador (solicitante del vale) y al
    // aprobador original que la revisión se aprobó y el vale volvió
    // a 'closed'. Si el aprobador y el revisor son la misma persona,
    // no duplicamos la notif.
    try {
      const recipientIds = new Set<number>();
      if (row.request.requesterUserId !== userId) recipientIds.add(row.request.requesterUserId);
      if (row.request.approverUserId && row.request.approverUserId !== userId) recipientIds.add(row.request.approverUserId);
      for (const recipientId of recipientIds) {
        await notify({
          companyId,
          userId:    recipientId,
          kind:      'finance_invoice_approved',
          title:     `Factura del vale #${row.voucher.id} aprobada`,
          body:      'El revisor aprobó la corrección. El vale volvió a quedar cerrado y conciliado.',
          payload:   {
            reviewId:  row.review.id,
            voucherId: row.voucher.id,
            invoiceId: row.review.invoiceId,
          },
        });
      }
    } catch (notifErr) {
      console.warn('[approve] notification skipped:', (notifErr as Error).message);
    }

    return res.json({ ok: true, status: 'approved' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /finance/invoice-reviews/:id/send-to-correction  ─────────────────
// under_review → correction_requested. El body trae la nota (obligatoria).
// Se notifica al solicitante del vale.

const correctionSchema = z.object({
  note: z.string().min(3, 'Indicá por qué se debe corregir').max(1000),
  failedChecks: z.array(z.string()).default([]),
}).strict();

router.post('/invoice-reviews/:id/send-to-correction', requirePermission('finanzas', 'caja_chica', 'revisar_facturas'), validate(correctionSchema), async (req, res, next) => {
  try {
    const companyId = ensureCompanyId(req.companyId);
    const userId    = getUserId(req);
    const reviewId  = parseIdFlexible('any', String(req.params.id));
    const { note, failedChecks } = req.body as z.infer<typeof correctionSchema>;

    const [row] = await db
      .select({
        review:   companyInvoiceReviews,
        voucher:  companyPettyCashVouchers,
        request:  companyFinanceRequests,
      })
      .from(companyInvoiceReviews)
      .innerJoin(companyPettyCashVouchers, eq(companyPettyCashVouchers.id, companyInvoiceReviews.voucherId))
      .innerJoin(companyFinanceRequests, eq(companyFinanceRequests.id, companyPettyCashVouchers.requestId))
      .where(and(eq(companyInvoiceReviews.id, reviewId), eq(companyInvoiceReviews.companyId, companyId)))
      .limit(1);
    if (!row) throw new NotFoundError('Review', String(reviewId));

    await transitionReview(db, {
      companyId:   companyId,
      reviewId:    row.review.id,
      from:        row.review.status as ReviewStatus,
      to:          'correction_requested',
      actorUserId: userId,
      note,
      metadata:    { failedChecks },
    });

    // jul 2026 v6 — Reabrir el vale SIEMPRE que se mande a corrección
    // (sin importar si ya estaba 'open' por un error de un envío previo
    // o si se está reabriendo desde 'closed'). El UPDATE es idempotente.
    // Mismo vale, no se crea otro. El admin lo cierra de nuevo al
    // aprobar; el operador NO lo cierra al re-subir foto.
    await db
      .update(companyPettyCashVouchers)
      .set({ status: 'open', updatedAt: sql`now()` })
      .where(eq(companyPettyCashVouchers.id, row.voucher.id));
    await recordVoucherReopenForCorrection({
      voucherId:   row.voucher.id,
      note,
      actorUserId: userId,
    });

    // Notificar al solicitante.
    await notify({
      companyId,
      userId:    row.request.requesterUserId,
      kind:      'finance_invoice_correction_requested',
      title:     `Factura del vale #${row.voucher.id} requiere corrección`,
      body:      note,
      payload:   {
        reviewId:    row.review.id,
        voucherId:   row.voucher.id,
        invoiceId:   row.review.invoiceId,
        note,
        failedChecks,
      },
    });

    return res.json({ ok: true, status: 'correction_requested' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /finance/invoice-reviews/:id/reupload  ────────────────────────────
// El solicitante sube nueva foto. correction_requested → pending_review.
// El body trae el nuevo fileUrl. NO requiere permiso de revisor; el dueño
// del vale (request.requesterUserId) puede hacerlo.

// jul 2026 v6 — Acepta tanto URL absoluta (https://...) como path
// relativo (/uploads/parts/1/abc.jpg). El endpoint /upload/part-photos
// devuelve path relativo, así que la validación estricta de z.string().url()
// rompía el reupload.
const reuploadSchema = z.object({
  fileUrl:      z.string().min(1).refine(
    (v) => v.startsWith('/') || /^https?:\/\//i.test(v),
    { message: 'fileUrl debe ser una URL absoluta o un path relativo (ej: /uploads/...)' },
  ),
  fileMimeType: z.string().min(1),
}).strict();

router.post('/invoice-reviews/:id/reupload', validate(reuploadSchema), async (req, res, next) => {
  try {
    const companyId = ensureCompanyId(req.companyId);
    const userId    = getUserId(req);
    const reviewId  = parseIdFlexible('any', String(req.params.id));
    const { fileUrl, fileMimeType } = req.body as z.infer<typeof reuploadSchema>;

    const [row] = await db
      .select({
        review:  companyInvoiceReviews,
        voucher: companyPettyCashVouchers,
        request: companyFinanceRequests,
      })
      .from(companyInvoiceReviews)
      .innerJoin(companyPettyCashVouchers, eq(companyPettyCashVouchers.id, companyInvoiceReviews.voucherId))
      .innerJoin(companyFinanceRequests, eq(companyFinanceRequests.id, companyPettyCashVouchers.requestId))
      .where(and(eq(companyInvoiceReviews.id, reviewId), eq(companyInvoiceReviews.companyId, companyId)))
      .limit(1);
    if (!row) throw new NotFoundError('Review', String(reviewId));

    // Solo el solicitante del vale o un admin puede re-subir.
    if (row.request.requesterUserId !== userId && !isReviewer(req)) {
      throw new AppError(403, 'Solo el solicitante del vale o un revisor puede subir una nueva foto');
    }

    // jul 2026 v5 — Plazo de 1 día para corregir. Si pasaron más de
    // 24h desde `lastCorrectionAt`, el operador ya no puede re-subir
    // la foto. Tiene que pedir un nuevo vale al admin. (Los admin
    // bypasean este check via isReviewer, así que un admin puede
    // reabrir la corrección si lo necesita.)
    if (row.review.status === 'correction_requested' && row.review.lastCorrectionAt) {
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      const elapsed = Date.now() - new Date(row.review.lastCorrectionAt).getTime();
      // Admin (revisor) bypasea el plazo. Operador dueño, no.
      if (elapsed > ONE_DAY_MS && row.request.requesterUserId === userId) {
        throw new AppError(
          409,
          'Venció el plazo de 1 día para corregir la factura. Pedile al admin que reabra la corrección o genere un vale nuevo.',
        );
      }
    }

    // Actualizar la factura con la nueva foto.
    await db
      .update(companyInvoices)
      .set({ fileUrl, fileMimeType, updatedAt: sql`now()` })
      .where(eq(companyInvoices.id, row.review.invoiceId));

    await transitionReview(db, {
      companyId:   companyId,
      reviewId:    row.review.id,
      from:        row.review.status as ReviewStatus,
      to:          'pending_review',
      actorUserId: userId,
      note:        'Nueva foto subida por el solicitante',
      metadata:    { fileUrl, fileMimeType },
    });

    // jul 2026 v6 — Notificar a admins (excepto el actor) y al
    // aprobador original de la solicitud que el operador subió la
    // nueva foto y la review vuelve a 'pending_review' esperando
    // revisión. Mismo patrón que send-to-correction, para que el
    // revisor tenga la foto en su inbox.
    try {
      await notifyAdminsExceptActor(companyId, userId, {
        kind:    'finance_invoice_correction_resubmitted',
        title:   `Nueva foto del vale #${row.voucher.id} lista para revisar`,
        body:    'El operador subió una nueva foto de la factura tras la corrección. Pendiente de revisar.',
        payload: {
          reviewId:  row.review.id,
          voucherId: row.voucher.id,
          invoiceId: row.review.invoiceId,
        },
      });
      const [reqRow] = await db
        .select({ approverUserId: companyFinanceRequests.approverUserId })
        .from(companyFinanceRequests)
        .where(eq(companyFinanceRequests.id, row.voucher.requestId))
        .limit(1);
      const approverId = reqRow?.approverUserId ?? null;
      if (approverId && approverId !== userId) {
        await notify({
          companyId,
          userId:    approverId,
          kind:      'finance_invoice_correction_resubmitted',
          title:     `Nueva foto del vale #${row.voucher.id} lista para revisar`,
          body:      'El operador subió una nueva foto de la factura tras la corrección. Pendiente de revisar.',
          payload:   {
            reviewId:  row.review.id,
            voucherId: row.voucher.id,
            invoiceId: row.review.invoiceId,
          },
        });
      }
    } catch (notifErr) {
      // No-crítico: si falla la notif, igual la foto ya quedó
      // guardada y la review pasó a 'pending_review'.
      console.warn('[reupload] notification skipped:', (notifErr as Error).message);
    }

    return res.json({ ok: true, status: 'pending_review' });
  } catch (err) {
    next(err);
  }
});

// ─── GET /finance/invoice-reviews/:id/timeline  ─────────────────────────────

router.get('/invoice-reviews/:id/timeline', requirePermission('finanzas', 'caja_chica', 'revisar_facturas'), async (req, res, next) => {
  try {
    const companyId = ensureCompanyId(req.companyId);
    const reviewId  = parseIdFlexible('any', String(req.params.id));

    // Verificar que la review existe y pertenece a la empresa.
    const [review] = await db
      .select({ id: companyInvoiceReviews.id })
      .from(companyInvoiceReviews)
      .where(and(eq(companyInvoiceReviews.id, reviewId), eq(companyInvoiceReviews.companyId, companyId)))
      .limit(1);
    if (!review) throw new NotFoundError('Review', String(reviewId));

    const events = await db
      .select({
        id:           companyInvoiceReviewEvents.id,
        kind:         companyInvoiceReviewEvents.kind,
        actorUserId:  companyInvoiceReviewEvents.actorUserId,
        note:         companyInvoiceReviewEvents.note,
        metadata:     companyInvoiceReviewEvents.metadata,
        createdAt:    companyInvoiceReviewEvents.createdAt,
        actorName:    sql<string>`actor.profile_data->>'fullName'`,
        actorUsername: sql<string>`actor.username`,
      })
      .from(companyInvoiceReviewEvents)
      .leftJoin(sql`${companyUsers} AS actor`, sql`actor.id = ${companyInvoiceReviewEvents.actorUserId}`)
      .where(eq(companyInvoiceReviewEvents.reviewId, reviewId))
      .orderBy(asc(companyInvoiceReviewEvents.createdAt));

    return res.json({
      events: events.map(e => ({
        id:            e.id,
        kind:          e.kind,
        actorUserId:   e.actorUserId,
        actorName:     e.actorName ?? e.actorUsername ?? null,
        note:          e.note,
        metadata:      e.metadata,
        createdAt:     e.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
