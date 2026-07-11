// ─────────────────────────────────────────────────────────────────────────────
// routes/company/finance-petty-cash.ts
//
// jul 2026 — Router del módulo Caja Chica + Transacciones (Finanzas).
//
// Endpoints:
//   GET    /finance/petty-cash                      → cuenta activa + saldo + resumen
//   POST   /finance/petty-cash                      → crear/reemplazar cuenta
//                                                    (admin_empresa/owner_empresa — bypass)
//   POST   /finance/petty-cash/replenish            → rellenar caja
//                                                    (admin_empresa/owner_empresa — bypass)
//
//   GET    /finance/requests?status=&tab=           → listar (cualquiera con permisos)
//   POST   /finance/requests                        → crear solicitud
//                                                    (operadores con finanzas.caja_chica.crear)
//   GET    /finance/requests/:id                    → detalle
//   PATCH  /finance/requests/:id/review             → aprobar (con classification) o rechazar
//                                                    (supervisor con aprobar, admins, owner)
//   DELETE /finance/requests/:id                    → cancelar (solo el solicitante, si pending)
//
//   GET    /finance/vouchers?status=                → listar vales
//   GET    /finance/vouchers/:id                    → detalle
//   GET    /finance/vouchers/:id/pdf                → jsPDF imprimible
//   PATCH  /finance/vouchers/:id/close              → cerrar vale
//                                                    (asignado, o admin)
//
//   GET    /finance/transactions?scope=&from=&to=   → feed de movimientos
//                                                    (cualquiera con finanzas.transactions.ver)
//   GET    /finance/transactions/export.pdf         → jsPDF detallado
//
// Permisos:
//   - finanzas.caja_chica.ver       → GET requests, vouchers, petty-cash
//   - finanzas.caja_chica.crear     → POST requests
//   - finanzas.caja_chica.aprobar   → PATCH review (aprobar/rechazar)
//   - finanzas.caja_chica.reponer   → POST replenish / POST cuenta
//                                     (también accesible a admin_empresa/owner via bypass)
//   - finanzas.transacciones.ver    → GET transactions
//
// Aislamiento: companyId SIEMPRE viene del path param `:id`, validado por
// requireCompany middleware (definido en /routes/company/index.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, asc, sql, inArray, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyPettyCashAccounts,
  companyPettyCashMovements,
  companyPettyCashVouchers,
  companyFinanceRequests,
  companyAnnualExpenses,
  companyInvoices,
  companySites,
  companyMaintenanceItems,
  companyMaintenanceRecords,
  companyInvoiceReviews,
  companyInvoiceReviewEvents,
} from '../../db/schema/operational';
import { companyUsers } from '../../db/schema/platform';
import { requirePermission } from '../../middlewares/requirePermission';
import { AppError, NotFoundError } from '../../lib/errors';
import { toId, parseIdFlexible } from '../../lib/ids';
import { validate } from '../../lib/validate';
import { isAdminRole, hasPermOrAdmin } from '../../lib/finance-bypass';
import {
  applyFinanceRequestApproval,
  rejectFinanceRequest,
  cancelFinanceRequest,
  closePettyCashVoucher,
  upsertPettyCashAccount,
  replenishPettyCashAccount,
  getActiveAccountForSite,
  listMovements,
  listTransactions,
} from '../../lib/finance-movements';
import {
  closeVoucherFromMaintenance,
  getMaintenanceFinanceSnapshot,
} from '../../lib/finance-maintenance-sync';
import { syncSingleInvoice } from '../../lib/invoices-sync';
import { buildTransactionsPdf, buildVoucherPdf } from '../../lib/finance-pdf';
import { wsBroadcast } from '../../services/websocket';

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

// jul 2026 v4-b — Roles de admin a nivel empresa/plataforma. Estos
// bypassean el filtro "ver solo lo mío" en /finance/requests y
// /finance/vouchers, igual que el rol "BYPASS_ROLES" del middleware
// requirePermission. La definición vive en lib/finance-bypass.ts.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── GET /finance/petty-cash  ────────────────────────────────────────────────
// Devuelve: cuenta activa (por sede — si ?siteId), saldo actual, últimos
// movimientos. Sin siteId → devuelve TODAS las cuentas activas de la empresa
// (modo resumen). Útil para el header del módulo.

router.get('/petty-cash', async (req, res, next) => {
  try {
    const companyId = ensureCompanyId(req.companyId);
    const siteId = req.query.siteId ? parseIdFlexible('any', String(req.query.siteId)) : null;

    if (siteId) {
      const account = await getActiveAccountForSite(companyId, siteId);
      if (!account) {
        return res.json({ account: null, movements: [], summary: null });
      }
      const movements = await listMovements({ companyId, accountId: account.id, limit: 50 });
      return res.json({
        account,
        movements,
        summary: {
          currentBalance: Number(account.currentBalance),
          limitAmount: Number(account.limitAmount),
          mode: account.mode,
        },
      });
    }

    // Sin siteId: todas las cuentas activas de la empresa.
    const rows = await db
      .select({
        id: companyPettyCashAccounts.id,
        siteId: companyPettyCashAccounts.siteId,
        siteName: companySites.name,
        siteCode: companySites.code,
        mode: companyPettyCashAccounts.mode,
        periodKind: companyPettyCashAccounts.periodKind,
        currentBalance: companyPettyCashAccounts.currentBalance,
        limitAmount: companyPettyCashAccounts.limitAmount,
      })
      .from(companyPettyCashAccounts)
      .leftJoin(companySites, eq(companySites.id, companyPettyCashAccounts.siteId))
      .where(and(
        eq(companyPettyCashAccounts.companyId, companyId),
        eq(companyPettyCashAccounts.isActive, true),
      ));

    // Listado COMPLETO de sedes de la empresa — para que el admin de finanzas
    // pueda crear cuentas sin necesitar el permiso gestion.sedes.
    // No se filtra por si ya tienen cuenta: se muestran todas y el frontend
    // decide qué sedes ya tienen cuenta activa.
    const allSites = await db
      .select({
        id: companySites.id,
        name: companySites.name,
        code: companySites.code,
        status: companySites.status,
      })
      .from(companySites)
      .where(eq(companySites.companyId, companyId))
      .orderBy(companySites.name);

    return res.json({
      accounts: rows.map(r => ({
        id: r.id,
        siteId: r.siteId,
        siteName: r.siteName,
        siteCode: r.siteCode,
        mode: r.mode,
        periodKind: r.periodKind,
        currentBalance: Number(r.currentBalance),
        limitAmount: Number(r.limitAmount),
      })),
      // jul 2026 v4 — listado de TODAS las sedes de la empresa para el tab
      // "Configuración" (poder crear cuentas nuevas sin permiso gestion.sedes).
      availableSites: allSites.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        status: s.status,
      })),
    });
  } catch (err) {
    // Log detallado para debug — el frontend solo ve un 500 genérico.
    console.error('[finance/petty-cash] GET error:', (err as Error)?.message, (err as Error)?.stack);
    next(err);
  }
});

// ─── POST /finance/petty-cash  ───────────────────────────────────────────────
// Crea o reemplaza la cuenta activa de una sede.
// Solo admin_empresa / owner_empresa (BYPASS_ROLES en requirePermission).

const upsertAccountSchema = z.object({
  siteId:         z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  mode:           z.enum(['period', 'balance']),
  periodKind:     z.enum(['monthly', 'weekly']).optional(),
  initialAmount:  z.number().nonnegative(),
  limitAmount:    z.number().nonnegative(),
}).strict();

router.post('/petty-cash',
  requirePermission('finanzas', 'caja_chica', 'reponer'),
  validate(upsertAccountSchema),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const userId    = getUserId(req);
      const body = req.body as z.infer<typeof upsertAccountSchema>;
      const siteId = typeof body.siteId === 'string' ? parseInt(body.siteId, 10) : body.siteId;

      const account = await upsertPettyCashAccount({
        companyId,
        siteId,
        mode: body.mode,
        periodKind: body.periodKind,
        initialAmount: body.initialAmount,
        limitAmount: body.limitAmount,
        actorUserId: userId,
      });

      wsBroadcast(companyId, {
        type: 'finance:account:upserted',
        data: { accountId: account.id, siteId: account.siteId, mode: account.mode },
      });

      return res.status(201).json({ account });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /finance/petty-cash/replenish  ─────────────────────────────────────
// Solo admin_empresa / owner_empresa.

const replenishSchema = z.object({
  accountId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  amount:    z.number().positive(),
  note:      z.string().max(280).optional(),
}).strict();

router.post('/petty-cash/replenish',
  requirePermission('finanzas', 'caja_chica', 'reponer'),
  validate(replenishSchema),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const userId    = getUserId(req);
      const body = req.body as z.infer<typeof replenishSchema>;
      const accountId = typeof body.accountId === 'string' ? parseInt(body.accountId, 10) : body.accountId;

      console.log('[finance/petty-cash/replenish] actorUserId=', userId, 'accountId=', accountId, 'amount=', body.amount);

      const result = await replenishPettyCashAccount({
        accountId,
        amount: body.amount,
        actorUserId: userId,
        note: body.note ?? undefined,
      });

      return res.status(201).json({
        ok: true,
        newBalance: result.newBalance,
      });
    } catch (err) {
      console.error('[finance/petty-cash/replenish] error:', (err as Error)?.message, (err as Error)?.stack);
      next(err);
    }
  },
);

// ─── GET /finance/requests  ──────────────────────────────────────────────────
// Listado de solicitudes. Query params:
//   - status: pending | approved | rejected | cancelled (opcional, default todos)
//   - tab:    pending | approved | rejected | all (alias para compatibilidad UI)
//   - mine:   'true' → solo del solicitante actual
//   - siteId: filtrar por sede
//
// jul 2026 v4-b — Permisos granulares (mismo modelo que /vouchers):
//   - Si el user tiene `caja_chica.aprobar` o `caja_chica.reponer`
//     o `caja_chica.ver_todos` (admin de finanzas), ve TODAS las solicitudes.
//   - Si NO, ve solo las suyas (requesterUserId = me).
//   - El query param `?mine=true` fuerza el filtro de propias.

router.get('/requests', async (req, res, next) => {
  try {
    const companyId = ensureCompanyId(req.companyId);
    const userId    = getUserId(req);

    const rawStatus = typeof req.query.status === 'string' ? req.query.status
                    : typeof req.query.tab   === 'string' ? req.query.tab
                    : null;
    const mine = req.query.mine === 'true' || req.query.mine === '1';
    const siteIdRaw = req.query.siteId;
    const siteId = siteIdRaw ? parseIdFlexible('any', String(siteIdRaw)) : null;

    // jul 2026 v4-b — Permisos granulares (idéntico al patrón de /vouchers).
    const userPerms     = ((req.user as any)?.modulePermissions as Record<string, Record<string, string[]>>) ?? {};
    const cajaChicaPerms = new Set(userPerms.finanzas?.caja_chica ?? []);
    const canSeeAllRequests =
      isAdminRole(req) ||  // admin/owner/superadmin bypassean siempre
      cajaChicaPerms.has('aprobar') ||
      cajaChicaPerms.has('reponer') ||
      cajaChicaPerms.has('ver_todos');

    const conditions: any[] = [eq(companyFinanceRequests.companyId, companyId)];
    if (rawStatus && rawStatus !== 'all') {
      // 'approved' agrupa approved_petty + approved_annual — ambos tienen status='approved'.
      if (rawStatus === 'approved') {
        conditions.push(eq(companyFinanceRequests.status, 'approved'));
      } else if (['pending', 'rejected', 'cancelled'].includes(rawStatus)) {
        conditions.push(eq(companyFinanceRequests.status, rawStatus as 'pending' | 'rejected' | 'cancelled'));
      }
    }
    // v4-b — Si NO tiene permiso para ver todas, o el frontend mandó mine=true,
    // filtra por requesterUserId = me. Esto es independiente del site/status.
    if (!canSeeAllRequests || mine) {
      conditions.push(eq(companyFinanceRequests.requesterUserId, userId));
    }
    if (siteId) conditions.push(eq(companyFinanceRequests.siteId, siteId));

    const rows = await db
      .select({
        id: companyFinanceRequests.id,
        siteId: companyFinanceRequests.siteId,
        siteName: companySites.name,
        requesterUserId: companyFinanceRequests.requesterUserId,
        approverUserId: companyFinanceRequests.approverUserId,
        amount: companyFinanceRequests.amount,
        reason: companyFinanceRequests.reason,
        origin: companyFinanceRequests.origin,
        maintenanceId: companyFinanceRequests.maintenanceId,
        maintenanceItemId: companyFinanceRequests.maintenanceItemId,
        classification: companyFinanceRequests.classification,
        status: companyFinanceRequests.status,
        rejectionReason: companyFinanceRequests.rejectionReason,
        reviewedAt: companyFinanceRequests.reviewedAt,
        createdAt: companyFinanceRequests.createdAt,
      })
      .from(companyFinanceRequests)
      .leftJoin(companySites, eq(companySites.id, companyFinanceRequests.siteId))
      .where(and(...conditions))
      .orderBy(desc(companyFinanceRequests.createdAt))
      .limit(200);

    // Hidratamos nombres de usuario con una query batch.
    const userIds = Array.from(new Set([
      ...rows.map(r => r.requesterUserId),
      ...rows.map(r => r.approverUserId).filter((x): x is number => x != null),
    ]));
    const userMap = new Map<number, { fullName: string; username: string }>();
    if (userIds.length > 0) {
      const users = await db
        .select({
          id: companyUsers.id,
          username: companyUsers.username,
          profileData: companyUsers.profileData,
        })
        .from(companyUsers)
        .where(inArray(companyUsers.id, userIds));
      for (const u of users) {
        const fn = (u.profileData as any)?.fullName as string | undefined;
        userMap.set(u.id, { fullName: fn ?? u.username, username: u.username });
      }
    }

    return res.json({
      requests: rows.map(r => ({
        id: toId('finance-request', r.id),
        numericId: r.id,
        siteId: r.siteId,
        siteName: r.siteName,
        requesterUserId: r.requesterUserId,
        requesterName: userMap.get(r.requesterUserId)?.fullName ?? null,
        approverUserId: r.approverUserId,
        approverName: r.approverUserId ? (userMap.get(r.approverUserId)?.fullName ?? null) : null,
        amount: Number(r.amount),
        reason: r.reason,
        origin: r.origin,
        maintenanceId: r.maintenanceId,
        maintenanceItemId: r.maintenanceItemId,
        classification: r.classification,
        status: r.status,
        rejectionReason: r.rejectionReason,
        reviewedAt: r.reviewedAt,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /finance/requests  ─────────────────────────────────────────────────
// Cualquier operador con finanzas.caja_chica.crear puede crear una solicitud.

// jul 2026 v4 — 3 origins posibles:
//   - 'standalone'        → nada atado, solo caja chica general
//   - 'maintenance'       → atado al mantenimiento completo (anticipo genérico,
//                          sin item específico). Solo requiere maintenanceId.
//   - 'maintenance_item'  → atado a un item puntual del mantenimiento. Requiere
//                          maintenanceId + maintenanceItemId.
const createRequestSchema = z.object({
  siteId:             z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  amount:             z.number().positive(),
  reason:             z.string().min(3).max(280),
  justificationNotes: z.string().max(1000).optional(),
  origin:             z.enum(['maintenance', 'maintenance_item', 'standalone']).default('standalone'),
  maintenanceId:      z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
  maintenanceItemId:  z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
  // jul 2026 v5 — Migración 0051. Clasifica el destino del vale.
  // Si viene de un mantenimiento, se fuerza a 'repuesto' (ignora lo
  // que mande el cliente). Para standalone, el operador elige.
  purpose:            z.enum(['repuesto', 'otro']).optional(),
}).strict().refine(
  // Si origin es 'maintenance' o 'maintenance_item', maintenanceId es obligatorio.
  (data) => data.origin === 'standalone' || !!data.maintenanceId,
  { message: 'maintenanceId es obligatorio cuando origin no es standalone' },
).refine(
  // maintenanceItemId solo es obligatorio para 'maintenance_item' (item puntual).
  (data) => data.origin !== 'maintenance_item' || !!data.maintenanceItemId,
  { message: 'maintenanceItemId es obligatorio cuando origin="maintenance_item"' },
).refine(
  // jul 2026 v5 — Si es standalone, el operador DEBE elegir purpose.
  // Si viene de mantenimiento, se setea automáticamente a 'repuesto'.
  (data) => data.origin !== 'standalone' || !!data.purpose,
  { message: 'purpose es obligatorio cuando la solicitud es standalone (repuesto | otro)' },
);

router.post('/requests',
  requirePermission('finanzas', 'caja_chica', 'crear'),
  validate(createRequestSchema),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const userId    = getUserId(req);
      const body = req.body as z.infer<typeof createRequestSchema>;
      const siteId = typeof body.siteId === 'string' ? parseInt(body.siteId, 10) : body.siteId;
      const maintenanceId     = body.maintenanceId     ? (typeof body.maintenanceId     === 'string' ? parseInt(body.maintenanceId, 10)     : body.maintenanceId)     : null;
      const maintenanceItemId = body.maintenanceItemId ? (typeof body.maintenanceItemId === 'string' ? parseInt(body.maintenanceItemId, 10) : body.maintenanceItemId) : null;

      // jul 2026 v4-b — Para que la solicitud tenga una cuenta asociada
      // (y más adelante el vale emitido por la aprobación), validamos
      // que la sede tenga una cuenta de caja chica ACTIVA. Si no, la
      // solicitud queda sin accountId y la aprobación falla después
      // con "no hay caja chica activa". Lo cortamos acá con un mensaje
      // claro.
      if (siteId == null) {
        throw new AppError(400, 'No se puede crear la solicitud sin sede (siteId es obligatorio).');
      }
      const account = await getActiveAccountForSite(companyId, siteId);
      if (!account) {
        throw new AppError(
          400,
          `La sede #${siteId} no tiene una cuenta de caja chica activa. Pedile al admin que cree una desde Caja Chica > Configuración.`
        );
      }

      const [created] = await db
        .insert(companyFinanceRequests)
        .values({
          companyId,
          siteId,
          requesterUserId: userId,
          amount: body.amount.toFixed(2),
          reason: body.reason,
          justificationNotes: body.justificationNotes ?? null,
          origin: body.origin,
          maintenanceId,
          maintenanceItemId,
          // jul 2026 v5 — Si viene de mantenimiento forzamos 'repuesto'.
          // Si es standalone, el operador eligió purpose.
          purpose: body.origin === 'standalone' ? (body.purpose ?? null) : 'repuesto',
        })
        .returning();

      if (!created) throw new Error('No se pudo crear la solicitud');

      // Si origin='maintenance_item', vinculamos el item a esta solicitud
      // para que el badge "Solicitud enviada" aparezca en el drawer.
      if (maintenanceItemId) {
        await db
          .update(companyMaintenanceItems)
          .set({ financeRequestId: created.id })
          .where(eq(companyMaintenanceItems.id, maintenanceItemId));
      }

      // WS + notification a los aprobadores (broadcast a la empresa; los
      // aprobadores son los que tienen el permiso y filtran en el frontend).
      wsBroadcast(companyId, {
        type: 'finance:request:created',
        data: {
          requestId: created.id,
          siteId: created.siteId,
          amount: created.amount,
          requesterUserId: created.requesterUserId,
          origin: created.origin,
        },
      });

      return res.status(201).json({
        // jul 2026 v4-b — id/numericId al top level (además del bloque
        // `request`) para que el frontend pueda mostrar el toast "Solicitud
        // #N creada" sin tener que acceder a .request.numericId.
        id: toId('finance-request', created.id),
        numericId: created.id,
        request: {
          id: toId('finance-request', created.id),
          numericId: created.id,
          status: created.status,
          classification: created.classification,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /finance/requests/:id  ──────────────────────────────────────────────

router.get('/requests/:id', async (req, res, next) => {
  try {
    const companyId = ensureCompanyId(req.companyId);
    const numericId = parseIdFlexible('any', String(req.params.id));

    const [row] = await db
      .select({
        req: companyFinanceRequests,
        requesterUsername: companyUsers.username,
        requesterProfile: companyUsers.profileData,
      })
      .from(companyFinanceRequests)
      .leftJoin(companyUsers, eq(companyUsers.id, companyFinanceRequests.requesterUserId))
      .where(and(
        eq(companyFinanceRequests.id, numericId),
        eq(companyFinanceRequests.companyId, companyId),
      ))
      .limit(1);

    if (!row) throw new NotFoundError('Solicitud', String(numericId));

    // Si la solicitud tiene voucher asociado, lo devolvemos también.
    const [voucher] = await db
      .select()
      .from(companyPettyCashVouchers)
      .where(eq(companyPettyCashVouchers.requestId, numericId))
      .limit(1);

    const requesterName = ((row.requesterProfile as any)?.fullName as string) ?? row.requesterUsername ?? null;

    return res.json({
      request: {
        id: toId('finance-request', row.req.id),
        numericId: row.req.id,
        siteId: row.req.siteId,
        requesterUserId: row.req.requesterUserId,
        requesterName,
        approverUserId: row.req.approverUserId,
        amount: Number(row.req.amount),
        reason: row.req.reason,
        justificationNotes: row.req.justificationNotes,
        origin: row.req.origin,
        maintenanceId: row.req.maintenanceId,
        maintenanceItemId: row.req.maintenanceItemId,
        classification: row.req.classification,
        status: row.req.status,
        rejectionReason: row.req.rejectionReason,
        reviewedAt: row.req.reviewedAt,
        createdAt: row.req.createdAt,
      },
      voucher: voucher ? {
        id: voucher.id,
        status: voucher.status,
        issuedAmount: Number(voucher.issuedAmount),
        closedActualAmount: voucher.closedActualAmount ? Number(voucher.closedActualAmount) : null,
        refundAmount: Number(voucher.refundAmount),
        closedAt: voucher.closedAt,
      } : null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /finance/requests/:id/review  ─────────────────────────────────────
// Aprueba (con classification) o rechaza. Solo aprobadores.

const reviewSchema = z.object({
  action:         z.enum(['approve', 'reject']),
  classification: z.enum(['petty_cash', 'annual_expense']).optional(),
  rejectionReason: z.string().min(3).max(500).optional(),
  voucherAssignedTo: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
}).strict().refine(
  (data) => data.action !== 'approve' || data.classification,
  { message: 'classification es obligatorio al aprobar' },
).refine(
  (data) => data.action !== 'reject' || data.rejectionReason,
  { message: 'rejectionReason es obligatorio al rechazar' },
);

router.patch('/requests/:id/review',
  requirePermission('finanzas', 'caja_chica', 'aprobar'),
  validate(reviewSchema),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const userId    = getUserId(req);
      const numericId = parseIdFlexible('any', String(req.params.id));
      const body = req.body as z.infer<typeof reviewSchema>;

      if (body.action === 'approve') {
        // Parseamos voucherAssignedTo. Si no viene, mandamos null (no undefined)
        // para que la PL/pgSQL lo acepte como NULL.
        const assigned = body.voucherAssignedTo != null
          ? (typeof body.voucherAssignedTo === 'string' ? parseInt(body.voucherAssignedTo, 10) : Number(body.voucherAssignedTo))
          : null;
        const result = await applyFinanceRequestApproval({
          requestId: numericId,
          classification: body.classification!,
          approverUserId: userId,
          voucherAssignedTo: assigned ?? undefined,
        });
        return res.json({ ok: true, ...result });
      }

      await rejectFinanceRequest({
        requestId: numericId,
        approverUserId: userId,
        reason: body.rejectionReason!,
      });
      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /finance/requests/:id  ───────────────────────────────────────────
// El solicitante cancela su propia solicitud pendiente.

router.delete('/requests/:id', async (req, res, next) => {
  try {
    const numericId = parseIdFlexible('any', String(req.params.id));
    const userId    = getUserId(req);
    await cancelFinanceRequest({ requestId: numericId, actorUserId: userId });
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /finance/vouchers  ──────────────────────────────────────────────────

router.get('/vouchers', async (req, res, next) => {
  try {
    const companyId = ensureCompanyId(req.companyId);
    const userId    = getUserId(req);

    const rawStatus = typeof req.query.status === 'string' ? req.query.status : null;
    const mine = req.query.mine === 'true' || req.query.mine === '1';
    const siteIdRaw = req.query.siteId;
    const siteId = siteIdRaw ? parseIdFlexible('any', String(siteIdRaw)) : null;

    // jul 2026 v4 — Filtro por permisos:
    // - Si el usuario es admin/owner/superadmin (BYPASS_ROLES), ve TODO.
    // - Si tiene finanzas.caja_chica.aprobar o .reponer o .ver_todos
    //   (admin de finanzas), ve TODO.
    // - Si NO, ve solo los suyos (assignedToUserId = me).
    // - El query param `mine=true` fuerza el filtro de propios.
    const userPerms = ((req.user as any)?.modulePermissions as Record<string, Record<string, string[]>>) ?? {};
    const cajaChicaPerms = new Set(userPerms.finanzas?.caja_chica ?? []);
    const canSeeAll =
      isAdminRole(req) ||
      cajaChicaPerms.has('aprobar')   ||
      cajaChicaPerms.has('reponer')   ||
      cajaChicaPerms.has('ver_todos');

    const conditions: any[] = [eq(companyPettyCashVouchers.companyId, companyId)];
    if (rawStatus && rawStatus !== 'all') {
      if (['open', 'closed', 'cancelled'].includes(rawStatus)) {
        conditions.push(eq(companyPettyCashVouchers.status, rawStatus as 'open' | 'closed' | 'cancelled'));
      }
    }
    // Si no tiene permiso para ver todos O el frontend mandó mine=true,
    // filtra por assignedToUserId = me.
    if (!canSeeAll || mine) {
      conditions.push(eq(companyPettyCashVouchers.assignedToUserId, userId));
    }
    if (siteId) conditions.push(eq(companyPettyCashVouchers.siteId, siteId));

    const rows = await db
      .select({
        v: companyPettyCashVouchers,
        siteName: companySites.name,
        assigneeUsername: companyUsers.username,
        assigneeProfile: companyUsers.profileData,
        // jul 2026 v4 — origin / maintenanceId para que el frontend sepa
        // si este vale viene de un mantenimiento y por tanto al cerrarlo
        // debe reusar la factura del maintenance, en vez de pedir upload.
        reqOrigin: companyFinanceRequests.origin,
        reqMaintenanceId: companyFinanceRequests.maintenanceId,
        reqMaintenanceItemId: companyFinanceRequests.maintenanceItemId,
        // jul 2026 v4-b — finance_classification del maintenance_item
        // asociado (repuesto | mano_obra | lavada | null).
        reqFinanceClassification: companyMaintenanceItems.financeClassification,
      })
      .from(companyPettyCashVouchers)
      .leftJoin(companySites, eq(companySites.id, companyPettyCashVouchers.siteId))
      .leftJoin(companyUsers, eq(companyUsers.id, companyPettyCashVouchers.assignedToUserId))
      .leftJoin(companyFinanceRequests, eq(companyFinanceRequests.id, companyPettyCashVouchers.requestId))
      .leftJoin(
        companyMaintenanceItems,
        eq(companyMaintenanceItems.id, companyFinanceRequests.maintenanceItemId),
      )
      .where(and(...conditions))
      .orderBy(desc(companyPettyCashVouchers.createdAt))
      .limit(200);

    return res.json({
      vouchers: rows.map(r => {
        const name = ((r.assigneeProfile as any)?.fullName as string) ?? r.assigneeUsername ?? null;
        return {
          id: toId('petty-cash-voucher', r.v.id),
          numericId: r.v.id,
          siteId: r.v.siteId,
          siteName: r.siteName,
          assignedToUserId: r.v.assignedToUserId,
          assignedToName: name,
          issuedAmount: Number(r.v.issuedAmount),
          status: r.v.status,
          closedActualAmount: r.v.closedActualAmount ? Number(r.v.closedActualAmount) : null,
          closedInvoiceId: r.v.closedInvoiceId,
          refundAmount: Number(r.v.refundAmount),
          closedAt: r.v.closedAt,
          createdAt: r.v.createdAt,
          requestId: r.v.requestId,
          // jul 2026 v4 — payload extra para que CajaChicaPage
          // sepa cómo cerrar el vale (reusar factura vs upload).
          origin: r.reqOrigin ?? 'standalone',
          maintenanceId: r.reqMaintenanceId ?? null,
          maintenanceItemId: r.reqMaintenanceItemId ?? null,
          // v4-b — útil para que el modal sepa qué tipo de factura
          // exigir al cerrar (repuesto exige items; mano de obra/lavada
          // solo monto + nombre).
          financeClassification: r.reqFinanceClassification ?? null,
          // v5 — Migración 0051. Indica si el vale entra al flujo de
          // revisión contable. NULL = legacy (no se revisa).
          purpose: r.v.purpose ?? null,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /finance/vouchers/:id/pdf  ──────────────────────────────────────────

router.get('/vouchers/:id/pdf', async (req, res, next) => {
  try {
    const companyId = ensureCompanyId(req.companyId);
    const numericId = parseIdFlexible('any', String(req.params.id));

    // Hidratamos todos los datos del vale para el PDF.
    const [row] = await db
      .select({
        v: companyPettyCashVouchers,
        siteName: companySites.name,
        assigneeUsername: companyUsers.username,
        assigneeProfile: companyUsers.profileData,
        requestReason: companyFinanceRequests.reason,
      })
      .from(companyPettyCashVouchers)
      .leftJoin(companySites, eq(companySites.id, companyPettyCashVouchers.siteId))
      .leftJoin(companyUsers, eq(companyUsers.id, companyPettyCashVouchers.assignedToUserId))
      .leftJoin(companyFinanceRequests, eq(companyFinanceRequests.id, companyPettyCashVouchers.requestId))
      .where(and(
        eq(companyPettyCashVouchers.id, numericId),
        eq(companyPettyCashVouchers.companyId, companyId),
      ))
      .limit(1);

    if (!row) throw new NotFoundError('Vale', String(numericId));

    const assigneeName = ((row.assigneeProfile as any)?.fullName as string) ?? row.assigneeUsername ?? 'Operador';
    const pdfBuffer = await buildVoucherPdf({
      voucher: row.v,
      siteName: row.siteName ?? '—',
      assigneeName,
      requestReason: row.requestReason ?? '',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="vale-caja-chica-${row.v.id}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /finance/vouchers/:id/close  ──────────────────────────────────────

// jul 2026 v4-b — invoiceId es OBLIGATORIO. Reglas de negocio:
//   1. El comprobante SIEMPRE debe quedar registrado en company_invoices.
//   2. El frontend sube el archivo a /upload/finance-receipts, crea la
//      invoice con /finance/vouchers/:id/invoice y pasa el invoiceId acá.
//   3. Sin invoiceId, el vale NO se cierra (devuelve 400).
// Esto garantiza trazabilidad contable: cada vale cerrado está vinculado
// a un comprobante físico en el ledger.
const closeSchema = z.object({
  actualAmount: z.number().nonnegative(),
  invoiceId:    z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  notes:        z.string().max(500).optional(),
}).strict();

router.patch('/vouchers/:id/close', validate(closeSchema), async (req, res, next) => {
  try {
    const numericId = parseIdFlexible('any', String(req.params.id));
    const userId    = getUserId(req);
    const body = req.body as z.infer<typeof closeSchema>;

    const invoiceId = typeof body.invoiceId === 'string'
      ? parseInt(body.invoiceId, 10)
      : body.invoiceId;

    const result = await closePettyCashVoucher({
      voucherId: numericId,
      actualAmount: body.actualAmount,
      invoiceId,
      notes: body.notes ?? null,
      actorUserId: userId,
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ─── POST /finance/vouchers/:id/invoice  ──────────────────────────────────────
// jul 2026 v4 — Cuando el vale es STANDALONE (sin mantenimiento atrás), el
// operador sube el comprobante desde CajaChicaPage. Para que la factura
// quede en el ledger unificado y visible desde Facturas, creamos una fila
// en company_invoices con source_module='petty_cash' y sourceEntityId=
// voucher.numericId. Devolvemos el invoiceId recién creado, que el
// frontend luego pasa a PATCH /vouchers/:id/close.
//
// Body (JSON):
//   fileUrl: string           — URL del archivo subido a /upload/finance-receipts
//   fileMimeType: string      — image/jpeg | image/png | application/pdf
//   kind: 'repuesto' | 'mano_obra' | 'lavada'   (default 'repuesto')
//   supplierName?: string | null
//   ivaPercent?: number       — default 15
//   ivaAmount?: number | null — input manual del operador
//   total: number             — total final del comprobante (input)
//   items?: Array<{...}>      — ver SyncSingleInvoiceInput.items
router.post('/vouchers/:id/invoice', validate(
  z.object({
    fileUrl:      z.string().min(1),
    fileMimeType: z.string().min(1),
    kind:         z.enum(['repuesto', 'mano_obra', 'lavada', 'otro']).default('repuesto'),
    supplierName: z.string().max(255).optional().nullable(),
    supplierId:   z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional().nullable(),
    ivaPercent:   z.number().min(0).max(100).optional().nullable(),
    ivaAmount:    z.number().min(0).optional().nullable(),
    total:        z.number().min(0),
    items:        z.array(z.object({
      description: z.string(),
      quantity:    z.number().or(z.string()),
      unitPrice:   z.number().or(z.string()),
      subtotal:    z.number().or(z.string()),
      imageUrl:    z.string().optional().nullable(),
      imagePending:z.boolean().optional(),
    })).optional(),
    workshopName: z.string().max(255).optional().nullable(),
    workerName:   z.string().max(255).optional().nullable(),
    // jul 2026 v4-b — Si el vale viene de un mantenimiento, el frontend
    // envía el attachmentKey elegido (suele ser el attachment del item
    // de repuesto o mano de obra). Si se omite, usamos 'main'.
    attachmentKey: z.string().min(1).max(64).default('main'),
  }).strict(),
), async (req, res, next) => {
  try {
    const companyId = ensureCompanyId(req.companyId);
    const voucherId = parseIdFlexible('any', String(req.params.id));

    // Validar que el vale existe y pertenece a la empresa. Cargamos
    // también el request asociado para saber si viene de mantenimiento
    // y, en ese caso, materializar la invoice como de mantenimiento.
    const [voucher] = await db
      .select({
        id: companyPettyCashVouchers.id,
        companyId: companyPettyCashVouchers.companyId,
        requestId: companyPettyCashVouchers.requestId,
      })
      .from(companyPettyCashVouchers)
      .where(eq(companyPettyCashVouchers.id, voucherId))
      .limit(1);
    if (!voucher || voucher.companyId !== companyId) {
      throw new AppError(404, `Vale ${voucherId} no existe`);
    }

    const [request] = await db
      .select({
        origin: companyFinanceRequests.origin,
        maintenanceId: companyFinanceRequests.maintenanceId,
        maintenanceItemId: companyFinanceRequests.maintenanceItemId,
      })
      .from(companyFinanceRequests)
      .where(eq(companyFinanceRequests.id, voucher.requestId))
      .limit(1);
    const fromMaintenance = !!request?.maintenanceId;

    // syncSingleInvoice exige SyncSingleInvoiceInput estrictamente tipado.
    const dataInput = req.body as unknown as {
      fileUrl: string;
      fileMimeType: string;
      kind?: 'repuesto' | 'mano_obra' | 'lavada' | 'otro';
      supplierName?: string | null;
      supplierId?: number | null;
      ivaPercent?: number | null;
      ivaAmount?: number | null;
      total: number;
      items?: Array<{ description: string; quantity: number | string; unitPrice: number | string; subtotal: number | string; imageUrl?: string | null; imagePending?: boolean }>;
      workshopName?: string | null;
      workerName?: string | null;
      attachmentKey?: string;
    };

    const supplierIdNum = dataInput.supplierId
      ? (typeof dataInput.supplierId === 'string' ? parseInt(dataInput.supplierId, 10) : dataInput.supplierId)
      : null;
    const attachmentKey = dataInput.attachmentKey ?? 'main';

    let result;
    if (fromMaintenance && request) {
      // ── Camino mantenimiento: la factura queda como "de mantenimiento"
      //    para que el drawer la liste, y actualizamos el attachment
      //    correspondiente con el invoiceNumber autogenerado. ────────
      result = await syncSingleInvoice({
        tx: db,
        companyId,
        sourceModule: 'mantenimiento',
        sourceEntityId: request.maintenanceId!,
        attachmentKey,
        data: {
          invoiceNumber: '',
          invoiceDate:   new Date().toISOString().slice(0, 10),
          amount:        dataInput.total,
          supplierName:  dataInput.supplierName ?? null,
          supplierId:    supplierIdNum,
          fileUrl:       dataInput.fileUrl,
          fileMimeType:  dataInput.fileMimeType,
          kind:          (dataInput.kind ?? 'repuesto') as any,
          ivaPercent:   dataInput.ivaPercent ?? null,
          ivaAmount:    dataInput.ivaAmount ?? null,
          total:        dataInput.total,
          workshopName: dataInput.workshopName ?? null,
          workerName:   dataInput.workerName ?? null,
          items: dataInput.items ?? [],
        },
      });

      // También actualizar el attachment del mantenimiento con el
      // invoiceNumber recién generado + items. Hacemos read-modify-write
      // atómico a nivel de fila para evitar perder cambios concurrentes.
      if (result.id) {
        const [fresh] = await db
          .select({ invoiceNumber: companyInvoices.invoiceNumber })
          .from(companyInvoices)
          .where(eq(companyInvoices.id, result.id))
          .limit(1);
        const newInvoiceNumber = fresh?.invoiceNumber ?? null;

        const [maintenance] = await db
          .select()
          .from(companyMaintenanceRecords)
          .where(eq(companyMaintenanceRecords.id, request.maintenanceId!))
          .limit(1);
        if (maintenance) {
          const attachments = (maintenance.attachments as Array<Record<string, unknown>>) ?? [];
          const idx = attachments.findIndex((a: any) => (a.key || 'main') === attachmentKey);
          if (idx >= 0) {
            const att = { ...(attachments[idx] as any) };
            att.url          = dataInput.fileUrl;
            att.fileMimeType = dataInput.fileMimeType;
            att.amount       = dataInput.total;
            if (dataInput.items && dataInput.items.length > 0) att.items = dataInput.items;
            if (dataInput.workshopName) att.workshopName = dataInput.workshopName;
            if (dataInput.workerName)   att.workerName   = dataInput.workerName;
            if (dataInput.supplierName) att.supplierName = dataInput.supplierName;
            if (newInvoiceNumber) att.invoiceNumber = newInvoiceNumber;
            attachments[idx] = att;
            await db
              .update(companyMaintenanceRecords)
              .set({ attachments: attachments as any, updatedAt: sql`now()` })
              .where(eq(companyMaintenanceRecords.id, request.maintenanceId!));
          }
        }
      }
    } else {
      // ── Camino standalone: factura petty_cash con prefijo CC-XXX ──
      result = await syncSingleInvoice({
        tx: db,
        companyId,
        sourceModule: 'petty_cash',
        sourceEntityId: 1_000_000 + voucherId,
        attachmentKey:  `voucher-${voucherId}`,
        data: {
          invoiceNumber: '',
          invoiceDate:   new Date().toISOString().slice(0, 10),
          amount:        dataInput.total,
          supplierName:  dataInput.supplierName ?? null,
          supplierId:    supplierIdNum,
          fileUrl:       dataInput.fileUrl,
          fileMimeType:  dataInput.fileMimeType,
          kind:          (dataInput.kind ?? 'repuesto') as any,
          ivaPercent:   dataInput.ivaPercent ?? null,
          ivaAmount:    dataInput.ivaAmount ?? null,
          total:        dataInput.total,
          workshopName: dataInput.workshopName ?? null,
          workerName:   dataInput.workerName ?? null,
          items: dataInput.items ?? [],
        },
      });
    }

    if (!result.id) {
      throw new AppError(500, 'No se pudo crear la factura.');
    }

    // jul 2026 v5 — Crear la review de la factura si el vale es de
    // repuestos. Los vales de "otro" quedan como not_required (fuera
    // del flujo de revisión contable).
    const [voucherRow] = await db
      .select({ purpose: companyPettyCashVouchers.purpose })
      .from(companyPettyCashVouchers)
      .where(eq(companyPettyCashVouchers.id, voucherId))
      .limit(1);
    const isRepuesto = voucherRow?.purpose === 'repuesto';
    if (isRepuesto) {
      // Sólo crear si no existe (idempotente si el cliente reintenta).
      const [existing] = await db
        .select({ id: companyInvoiceReviews.id })
        .from(companyInvoiceReviews)
        .where(eq(companyInvoiceReviews.invoiceId, result.id))
        .limit(1);
      if (!existing) {
        const [review] = await db
          .insert(companyInvoiceReviews)
          .values({
            companyId,
            invoiceId:   result.id,
            voucherId,
            status:      'pending_review',
          })
          .returning({ id: companyInvoiceReviews.id });
        if (review) {
          await db.insert(companyInvoiceReviewEvents).values({
            companyId,
            reviewId: review.id,
            kind:     'created',
            note:     'Vale cerrado con factura — entra al flujo de revisión contable.',
            metadata: { voucherId, invoiceId: result.id },
          });
        }
      }
    } else {
      // Marcar como not_required para que la query de /invoice-reviews
      // lo ignore por defecto. No creamos eventos porque no se revisa.
      const [existing] = await db
        .select({ id: companyInvoiceReviews.id })
        .from(companyInvoiceReviews)
        .where(eq(companyInvoiceReviews.invoiceId, result.id))
        .limit(1);
      if (!existing) {
        await db.insert(companyInvoiceReviews).values({
          companyId,
          invoiceId:   result.id,
          voucherId,
          status:      'not_required',
        });
      }
    }

    return res.json({
      ok: true,
      invoiceId: result.id,
      created:   result.created,
      // v4-b — Útil para que el cliente sepa qué sourceModule quedó
      // registrado y dirija al usuario al lugar correcto.
      sourceModule: fromMaintenance ? 'mantenimiento' : 'petty_cash',
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /finance/transactions  ──────────────────────────────────────────────
// Feed unificado (movimientos de caja chica + gastos anuales).

router.get('/transactions',
  requirePermission('finanzas', 'transacciones', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const scopeRaw = typeof req.query.scope === 'string' ? req.query.scope : 'all';
      const scope = (['petty_cash', 'annual', 'all'] as const).includes(scopeRaw as any)
        ? (scopeRaw as 'petty_cash' | 'annual' | 'all')
        : 'all';
      const fromDate = typeof req.query.from === 'string' && DATE_RE.test(req.query.from)
        ? req.query.from : undefined;
      const toDate   = typeof req.query.to   === 'string' && DATE_RE.test(req.query.to)
        ? req.query.to : undefined;

      const items = await listTransactions({ companyId, scope, fromDate, toDate });
      return res.json({ items });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /finance/transactions/export.pdf  ───────────────────────────────────

router.get('/transactions/export.pdf',
  requirePermission('finanzas', 'transacciones', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const scopeRaw = typeof req.query.scope === 'string' ? req.query.scope : 'all';
      const scope = (['petty_cash', 'annual', 'all'] as const).includes(scopeRaw as any)
        ? (scopeRaw as 'petty_cash' | 'annual' | 'all')
        : 'all';
      const fromDate = typeof req.query.from === 'string' && DATE_RE.test(req.query.from)
        ? req.query.from : undefined;
      const toDate   = typeof req.query.to   === 'string' && DATE_RE.test(req.query.to)
        ? req.query.to : undefined;

      const items = await listTransactions({ companyId, scope, fromDate, toDate });
      const pdfBuffer = await buildTransactionsPdf({
        companyName: (req.user as any)?.companyName ?? 'Empresa',
        scope,
        fromDate,
        toDate,
        items: items as any,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="transacciones-${fromDate ?? 'all'}-a-${toDate ?? 'all'}.pdf"`,
      );
      return res.send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /finance/vouchers/:id/close-from-maintenance  ──────────────────────
// jul 2026 v4 — Cierra un vale reusando una factura YA subida al mantenimiento
// (NO requiere upload adicional). El operador cierra el vale desde el drawer del
// mantenimiento, asignando el attachment que contiene la factura del proveedor.

const closeFromMaintenanceSchema = z.object({
  actualAmount:         z.number().nonnegative(),
  notes:                z.string().max(500).optional(),
  invoiceAttachmentKey: z.string().min(1).max(40),
}).strict();

router.post('/vouchers/:id/close-from-maintenance',
  validate(closeFromMaintenanceSchema),
  async (req, res, next) => {
    try {
      const numericId = parseIdFlexible('any', String(req.params.id));
      const userId    = getUserId(req);
      const body = req.body as z.infer<typeof closeFromMaintenanceSchema>;

      const result = await closeVoucherFromMaintenance({
        voucherId: numericId,
        actualAmount: body.actualAmount,
        notes: body.notes ?? null,
        invoiceAttachmentKey: body.invoiceAttachmentKey,
        actorUserId: userId,
      });

      return res.json({
        ok: true,
        invoiceId: result.invoiceId,
        refundAmount: result.refundAmount,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /finance/maintenance/:maintenanceId/status  ─────────────────────────
// Snapshot del estado financiero de un mantenimiento:
//   - todas las solicitudes asociadas
//   - vale abierto si existe
// Usado por el panel sticky en el drawer del mantenimiento.

router.get('/maintenance/:maintenanceId/status', async (req, res, next) => {
  try {
    const maintenanceId = parseIdFlexible('any', String(req.params.maintenanceId));
    const snapshot = await getMaintenanceFinanceSnapshot(maintenanceId);
    return res.json(snapshot);
  } catch (err) {
    next(err);
  }
});

export default router;