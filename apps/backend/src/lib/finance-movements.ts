// ─────────────────────────────────────────────────────────────────────────────
// lib/finance-movements.ts
//
// jul 2026 — Servicio central del módulo Caja Chica + Gastos Anuales (Finanzas).
//
// Responsabilidades:
//   1) Aplicar aprobación de solicitudes (caja_chica vs annual_expense).
//      → Llama PL/pgSQL fn_apply_finance_request_approval (migration 0046).
//      → Detecta si la caja se quedó sin saldo (límite) y emite alerta.
//   2) Cerrar vales (con reembolso automático si hay sobrante).
//      → Llama PL/pgSQL fn_close_petty_cash_voucher.
//   3) Crear / desactivar / rellenar cuentas de caja chica (modo period o balance).
//   4) Cancelar solicitudes pendientes (operador dueño o admin).
//   5) Emitir WebSocket + Notifications a los actores correctos.
//
// AUDIENCIA — quién recibe qué evento:
//   - finance:request:created       → aprobadores (supervisor con aprobar, admins, owner).
//   - finance:request:approved      → solicitante.
//   - finance:request:rejected      → solicitante.
//   - finance:voucher:issued        → solicitante (assigned).
//   - finance:voucher:closed        → aprobadores (para auditoría).
//   - finance:petty_cash:limit_reached → admin_empresa + owner_empresa.
//   - finance:petty_cash:replenished  → empresa completa.
//
// El WS se envía a TODA la empresa (rooms implícitas por companyId). Los
// eventos privados usan `wsBroadcast` con `targetUserId`. Las notifications
// in-app se filtran por usuario.
//
// El módulo es append-only: la tabla company_petty_cash_movements tiene un
// trigger SQL que rechaza UPDATE/DELETE. Todo cambio de saldo pasa por una
// PL/pgSQL que actualiza la cuenta + inserta el movement atómicamente.
// ─────────────────────────────────────────────────────────────────────────────

import { db, client } from '../db/client';
import { sql, and, eq, desc } from 'drizzle-orm';
// Nota: `client` (postgres-js) se usa directo solo para queries PL/pgSQL
// donde los placeholders tagged de Drizzle infieren mal el tipo.
// Los valores se sanitizan manualmente. NO usar con inputs de usuario sin
// validar antes.
import {
  companyPettyCashAccounts,
  companyPettyCashMovements,
  companyFinanceRequests,
  companyPettyCashVouchers,
  companyAnnualExpenses,
} from '../db/schema/operational';
import { wsBroadcast } from '../services/websocket';
import { notify, notifyAdmins, notifyAdminsExceptActor } from './notification-service';
import { AppError, ForbiddenError } from './errors';

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export type Classification = 'petty_cash' | 'annual_expense';
export type AccountMode = 'period' | 'balance';

export interface PettyCashAccountSnapshot {
  id: number;
  companyId: number;
  siteId: number;
  mode: AccountMode;
  periodKind: 'monthly' | 'weekly' | null;
  initialAmount: string;
  limitAmount: string;
  currentBalance: string;
  isActive: boolean;
  periodStartedAt: Date;
}

/**
 * Llama a la PL/pgSQL fn_apply_finance_request_approval.
 * Devuelve voucherId (si petty_cash) o annualExpenseId (si annual_expense).
 * Lanza AppError(400) si saldo insuficiente, o NotFound si la solicitud no existe.
 */
export async function applyFinanceRequestApproval(params: {
  requestId: number;
  classification: Classification;
  approverUserId: number;
  voucherAssignedTo?: number;
}): Promise<{ voucherId: number | null; annualExpenseId: number | null }> {
  const { requestId, classification, approverUserId, voucherAssignedTo } = params;

  // Leemos la solicitud ANTES para tener companyId (necesario para WS/notif).
  const [req] = await db
    .select()
    .from(companyFinanceRequests)
    .where(eq(companyFinanceRequests.id, requestId))
    .limit(1);
  if (!req) throw new AppError(404, `Solicitud ${requestId} no existe`);

  // Llamada al PL/pgSQL. La función hace TODO atómicamente:
  //   - valida status='pending'
  //   - si petty_cash: chequea saldo, crea voucher, descuenta, inserta movement
  //   - si annual_expense: crea annual_expense (no toca caja)
  // Si la validación falla, la PL/pgSQL lanza EXCEPTION que Drizzle envuelve
  // en un error con .message legible.
  let rows: Array<{ voucher_id: number | null; annual_expense_id: number | null }>;
  try {
    // jul 2026 v4 — Fix del bug del cast a Date con placeholder null.
    //
    // Causa raíz: con Drizzle tagged templates + driver postgres-js, cuando
    // el placeholder es null a veces el driver infiere mal el tipo y manda
    // algo que el binary protocol de PostgreSQL rechaza. La fix correcta es
    // usar el cliente directo de postgres-js (`client`) con `parameters` como
    // array — sin tagged templates — y sanitizar los valores manualmente.
    //
    // SEGURIDAD: los valores que van al SQL son validados ANTES:
    //   - requestId, approverUserId, voucherAssignedTo: Number.isFinite()
    //   - classification: enum restringido ('petty_cash' | 'annual_expense')
    // Sin validación previa, esto sería vulnerable a SQL injection.

    if (classification !== 'petty_cash' && classification !== 'annual_expense') {
      throw new AppError(400, `classification inválida: ${classification}`);
    }

    const p1 = Number(requestId);
    const p2 = classification as string;
    const p3 = Number(approverUserId);
    const p4 = voucherAssignedTo === undefined || voucherAssignedTo === null
      ? null
      : Number(voucherAssignedTo);

    if (!Number.isFinite(p1) || !Number.isFinite(p3)) {
      throw new AppError(400, 'requestId y approverUserId son obligatorios');
    }

    console.log('[applyFinanceRequestApproval] inputs:', { p1, p2, p3, p4 });

    // client.unsafe() del driver postgres-js. Los placeholders son $1, $2, ...
    // y se pasan como array en `parameters`. El driver los manda al binary
    // protocol con los tipos nativos (int, text, null) — no hay inferencia.
    const rawQuery = 'SELECT * FROM fn_apply_finance_request_approval($1::integer, $2::text, $3::integer, $4::integer)';
    const result = await client.unsafe(rawQuery, [p1, p2, p3, p4]);
    rows = (result as any).rows ?? (Array.isArray(result) ? result : []);
  } catch (err) {
    const msg = (err as Error)?.message ?? '';
    if (msg.includes('Saldo insuficiente')) {
      throw new AppError(400, msg);
    }
    if (msg.includes('ya está en estado')) {
      throw new AppError(400, msg);
    }
    if (msg.includes('No hay caja chica activa')) {
      throw new AppError(400, msg);
    }
    throw err;
  }

  const row = rows[0] ?? { voucher_id: null, annual_expense_id: null };
  const voucherId = row.voucher_id ?? null;
  const annualExpenseId = row.annual_expense_id ?? null;

  // ── Emitir eventos WS + notification post-aprobación ─────────────────────
  await db.execute(sql`SELECT 1`); // ensure connection (no-op)

  // 1) WS a la empresa (todos los conectados ven el cambio en el badge).
  wsBroadcast(req.companyId, {
    type: 'finance:request:approved',
    data: {
      requestId,
      classification,
      voucherId,
      annualExpenseId,
      approverUserId,
      amount: req.amount,
    },
  });

  // 2) Notification al solicitante (con title personalizado).
  const verb = classification === 'petty_cash' ? 'aprobada como caja chica' : 'aprobada como gasto anual';
  await notify({
    companyId: req.companyId,
    userId: req.requesterUserId,
    kind: 'finance_request_reviewed',
    title: `Solicitud #${requestId} ${verb}`,
    body: `Monto: $${req.amount}. ${classification === 'petty_cash' ? `Se generó el vale #${voucherId}.` : 'Registrada como gasto anual.'}`,
    payload: { requestId, classification, voucherId, annualExpenseId },
  });

  // 3) Si petty_cash, notificar también que el vale fue emitido.
  if (classification === 'petty_cash' && voucherId) {
    wsBroadcast(req.companyId, {
      type: 'finance:voucher:issued',
      data: { voucherId, requestId, assignedToUserId: voucherAssignedTo ?? req.requesterUserId },
    });
    await notify({
      companyId: req.companyId,
      userId: voucherAssignedTo ?? req.requesterUserId,
      kind: 'finance_voucher_issued',
      title: `Vale de caja #${voucherId} emitido`,
      body: `Monto emitido: $${req.amount}. Cerralo cuando completes la compra.`,
      payload: { voucherId, requestId, amount: req.amount },
    });

    // 4) Chequear si la caja quedó en cero (o por debajo de un umbral) → alerta.
    await checkAndEmitLimitReached(req.companyId, req.siteId);
  }

  return { voucherId, annualExpenseId };
}

/**
 * Cierra un vale. Si hay sobrante, devuelve automáticamente a la caja.
 */
export async function closePettyCashVoucher(params: {
  voucherId: number;
  actualAmount: number;
  invoiceId: number | null;
  notes: string | null;
  actorUserId: number;
}): Promise<{ refundAmount: number }> {
  const { voucherId, actualAmount, invoiceId, notes, actorUserId } = params;

  const [voucher] = await db
    .select()
    .from(companyPettyCashVouchers)
    .where(eq(companyPettyCashVouchers.id, voucherId))
    .limit(1);
  if (!voucher) throw new AppError(404, `Vale ${voucherId} no existe`);

  let refundAmount = 0;
  try {
    // jul 2026 v4-b — postgres-js trata `undefined` JS como literal
    // "undefined" y rompe el bind de tipos. Normalizamos TODOS los
    // opcionales a string/number/Date/null para que la PL los acepte.
    const safeNotes      = notes == null ? "" : String(notes);
    const safeInvoiceId  = invoiceId == null ? null : Number(invoiceId);
    const rows = await db.execute<{ fn_close_petty_cash_voucher: number }>(sql`
      SELECT fn_close_petty_cash_voucher(
        ${Number(voucherId)}::integer,
        ${Number(actualAmount)}::numeric,
        ${safeInvoiceId}::integer,
        ${safeNotes}::text,
        ${Number(actorUserId)}::integer
      )
    `) as unknown as Array<{ fn_close_petty_cash_voucher: number }>;
    refundAmount = Number(rows[0]?.fn_close_petty_cash_voucher ?? 0);
  } catch (err) {
    // jul 2026 v4-b — logueo full del error para debug (postgres-js suele
    // escupir "Failed query:" sin SQL state cuando algo falla en el bind).
    console.error('[closePettyCashVoucher] FAILED', {
      message: (err as Error)?.message,
      code:    (err as any)?.code,
      detail:  (err as any)?.detail,
      hint:    (err as any)?.hint,
      cause:   (err as any)?.cause?.message,
      stack:   (err as Error)?.stack?.split('\n').slice(0, 5).join('\n'),
      params: { voucherId, actualAmount, invoiceId, notes: notes?.slice(0, 80), actorUserId },
    });
    const msg = (err as Error)?.message ?? '';
    if (msg.includes('ya está en estado')) throw new AppError(400, msg);
    if (msg.includes('no puede ser negativo')) throw new AppError(400, msg);
    if (msg.includes('no existe')) throw new AppError(404, msg);
    throw err;
  }

  // Emitir eventos
  wsBroadcast(voucher.companyId, {
    type: 'finance:voucher:closed',
    data: { voucherId, actualAmount, refundAmount, actorUserId },
  });

  await notify({
    companyId: voucher.companyId,
    userId: voucher.assignedToUserId,
    kind: 'finance_voucher_closed',
    title: `Vale #${voucherId} cerrado`,
    body: refundAmount > 0
      ? `Gastaste $${actualAmount} de $${voucher.issuedAmount}. Se devolvieron $${refundAmount} a caja chica.`
      : `Gastaste $${actualAmount} de $${voucher.issuedAmount}. Sin reembolso.`,
    payload: { voucherId, actualAmount, refundAmount, invoiceId },
  });

  // jul 2026 v4 — También notificar al aprobador original (si fue otro
  // usuario) para que tenga visibilidad del cierre en su inbox.
  try {
    const [reqRow] = await db
      .select({ approverUserId: companyFinanceRequests.approverUserId })
      .from(companyFinanceRequests)
      .where(eq(companyFinanceRequests.id, voucher.requestId))
      .limit(1);
    const approverId = reqRow?.approverUserId ?? null;
    if (approverId && approverId !== voucher.assignedToUserId) {
      await notify({
        companyId: voucher.companyId,
        userId: approverId,
        kind: 'finance_voucher_closed',
        title: `Vale #${voucherId} cerrado por operador`,
        body: refundAmount > 0
          ? `Emitido $${voucher.issuedAmount.toFixed(2)} · gastado $${actualAmount} · reembolso $${refundAmount.toFixed(2)}.`
          : `Emitido $${voucher.issuedAmount.toFixed(2)} · gastado $${actualAmount} · sin reembolso.`,
        payload: { voucherId, actualAmount, refundAmount, invoiceId, actorUserId },
      });
    }
  } catch (approverNotifErr) {
    // No-crítico: un fallo en la notificación del aprobador no debe
    // romper el cierre del vale ya ejecutado en PL/pgSQL.
    console.warn('[closePettyCashVoucher] approver notification skipped:', (approverNotifErr as Error).message);
  }

  return { refundAmount };
}

/**
 * Rechaza una solicitud pendiente. El operador dueño o un aprobador pueden
 * invocarlo. (El backend ya validó permisos vía requirePermission.)
 */
export async function rejectFinanceRequest(params: {
  requestId: number;
  approverUserId: number;
  reason: string;
}): Promise<void> {
  const { requestId, approverUserId, reason } = params;

  const [req] = await db
    .select()
    .from(companyFinanceRequests)
    .where(eq(companyFinanceRequests.id, requestId))
    .limit(1);
  if (!req) throw new AppError(404, `Solicitud ${requestId} no existe`);
  if (req.status !== 'pending') {
    throw new AppError(400, `La solicitud ya está en estado "${req.status}"`);
  }

  await db
    .update(companyFinanceRequests)
    .set({
      status: 'rejected',
      classification: 'pending',
      approverUserId,
      rejectionReason: reason,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companyFinanceRequests.id, requestId));

  wsBroadcast(req.companyId, {
    type: 'finance:request:rejected',
    data: { requestId, reason, approverUserId },
  });

  await notify({
    companyId: req.companyId,
    userId: req.requesterUserId,
    kind: 'finance_request_reviewed',
    title: `Solicitud #${requestId} rechazada`,
    body: `Motivo: ${reason}`,
    payload: { requestId, reason },
  });
}

/**
 * Operador dueño cancela su propia solicitud pendiente.
 */
export async function cancelFinanceRequest(params: {
  requestId: number;
  actorUserId: number;
}): Promise<void> {
  const { requestId, actorUserId } = params;

  const [req] = await db
    .select()
    .from(companyFinanceRequests)
    .where(eq(companyFinanceRequests.id, requestId))
    .limit(1);
  if (!req) throw new AppError(404, `Solicitud ${requestId} no existe`);
  if (req.status !== 'pending') {
    throw new AppError(400, `Solo se pueden cancelar solicitudes pendientes`);
  }
  if (req.requesterUserId !== actorUserId) {
    throw new ForbiddenError('Solo el solicitante puede cancelar la solicitud');
  }

  await db
    .update(companyFinanceRequests)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(companyFinanceRequests.id, requestId));

  wsBroadcast(req.companyId, {
    type: 'finance:request:cancelled',
    data: { requestId, actorUserId },
  });
}

/**
 * Crea (o reemplaza) la cuenta de caja chica de una sede.
 * Si ya existe una activa para esa sede, la desactiva y crea la nueva
 * (mantenemos historial).
 */
export async function upsertPettyCashAccount(params: {
  companyId: number;
  siteId: number;
  mode: AccountMode;
  periodKind?: 'monthly' | 'weekly';
  initialAmount: number;
  limitAmount: number;
  actorUserId: number;
}): Promise<PettyCashAccountSnapshot> {
  const { companyId, siteId, mode, periodKind, initialAmount, limitAmount, actorUserId } = params;

  if (mode === 'period' && !periodKind) {
    throw new AppError(400, 'periodKind es obligatorio cuando mode="period"');
  }
  if (mode === 'balance' && periodKind) {
    throw new AppError(400, 'periodKind debe ser NULL cuando mode="balance"');
  }

  // Desactivar cuenta activa previa (si hay).
  const [existing] = await db
    .select()
    .from(companyPettyCashAccounts)
    .where(and(
      eq(companyPettyCashAccounts.siteId, siteId),
      eq(companyPettyCashAccounts.isActive, true),
    ))
    .limit(1);

  if (existing) {
    await db
      .update(companyPettyCashAccounts)
      .set({ isActive: false, updatedAt: new Date(), updatedBy: actorUserId })
      .where(eq(companyPettyCashAccounts.id, existing.id));
  }

  // Crear nueva cuenta.
  const [row] = await db
    .insert(companyPettyCashAccounts)
    .values({
      companyId,
      siteId,
      mode,
      periodKind: periodKind ?? null,
      initialAmount: initialAmount.toFixed(2),
      limitAmount: limitAmount.toFixed(2),
      currentBalance: initialAmount.toFixed(2),
      isActive: true,
      periodStartedAt: new Date(),
      createdBy: actorUserId,
      updatedBy: actorUserId,
    })
    .returning();

  if (!row) throw new Error('No se pudo crear la cuenta de caja chica');

  // Movement inicial (entrada de plata).
  await db.insert(companyPettyCashMovements).values({
    companyId,
    accountId: row.id,
    type: 'initial_assignment',
    amount: initialAmount.toFixed(2),
    balanceAfter: initialAmount.toFixed(2),
    actorUserId,
    note: existing
      ? `Reemplaza cuenta anterior #${existing.id} (cerrada por reconfiguración).`
      : 'Asignación inicial de caja chica.',
  });

  return mapAccount(row);
}

/**
 * Rellena una cuenta de caja chica existente (suma al saldo actual).
 * Solo admin_empresa / owner_empresa.
 */
export async function replenishPettyCashAccount(params: {
  accountId: number;
  amount: number;
  actorUserId: number;
  note?: string;
}): Promise<{ newBalance: number }> {
  const { accountId, amount, actorUserId, note } = params;
  if (amount <= 0) throw new AppError(400, 'El monto a reponer debe ser positivo');
  if (!Number.isFinite(accountId) || accountId <= 0) {
    throw new AppError(400, `accountId inválido: ${accountId}`);
  }
  if (!Number.isFinite(actorUserId) || actorUserId <= 0) {
    throw new AppError(400, `actorUserId inválido: ${actorUserId}`);
  }

  const [account] = await db
    .select()
    .from(companyPettyCashAccounts)
    .where(eq(companyPettyCashAccounts.id, accountId))
    .limit(1);
  if (!account) throw new AppError(404, `Cuenta ${accountId} no existe`);
  if (!account.isActive) throw new AppError(400, 'La cuenta no está activa');

  const newBalance = Number(account.currentBalance) + amount;

  await db
    .update(companyPettyCashAccounts)
    .set({ currentBalance: newBalance.toFixed(2), updatedAt: new Date(), updatedBy: actorUserId })
    .where(eq(companyPettyCashAccounts.id, accountId));

  await db.insert(companyPettyCashMovements).values({
    companyId: account.companyId,
    accountId: account.id,
    type: 'replenishment',
    amount: amount.toFixed(2),
    balanceAfter: newBalance.toFixed(2),
    actorUserId,
    note: note ?? `Reposición manual de $${amount}.`,
  });

  // WS + notification a toda la empresa.
  wsBroadcast(account.companyId, {
    type: 'finance:petty_cash:replenished',
    data: { accountId, amount, newBalance, actorUserId },
  });
  await notifyAdminsExceptActor(account.companyId, actorUserId, {
    kind: 'finance_petty_cash_replenished',
    title: 'Caja chica rellenada',
    body: `Se repusieron $${amount}. Saldo actual: $${newBalance.toFixed(2)}.`,
    payload: { accountId, amount, newBalance },
  });

  return { newBalance };
}

// ─── Helpers privados ────────────────────────────────────────────────────────

/**
 * Chequea si el saldo de la cuenta cayó a 0 (o por debajo del 10% del límite)
 * y emite alerta a los admins. Llamado después de cada aprobación petty_cash.
 */
async function checkAndEmitLimitReached(companyId: number, siteId: number): Promise<void> {
  const [account] = await db
    .select()
    .from(companyPettyCashAccounts)
    .where(and(
      eq(companyPettyCashAccounts.siteId, siteId),
      eq(companyPettyCashAccounts.isActive, true),
    ))
    .limit(1);

  if (!account) return;
  const balance = Number(account.currentBalance);
  const limit = Number(account.limitAmount);

  // jul 2026 v4 — limitAmount es el UMBRAL DE ALERTA, no un techo.
  // Alerta cuando: balance <= 0 (caja vacía) o balance < limit (caja bajó
  // del umbral configurado). Si limit = 0, alertar siempre que llegue a 0.
  const shouldAlert = balance <= 0 || (limit > 0 && balance < limit);
  if (!shouldAlert) return;

  wsBroadcast(companyId, {
    type: 'finance:petty_cash:limit_reached',
    data: { accountId: account.id, siteId, balance, limit },
  });
  await notifyAdmins(companyId, {
    kind: 'finance_petty_cash_limit_reached',
    title: 'Caja chica por agotarse',
    body: balance <= 0
      ? `La caja chica está en $0. Rellenala para que las solicitudes sigan aprobándose.`
      : `Saldo actual: $${balance.toFixed(2)} (umbral de alerta: $${limit.toFixed(2)}). Rellená la caja.`,
    payload: { accountId: account.id, siteId, balance, limit },
  });
}

function mapAccount(row: typeof companyPettyCashAccounts.$inferSelect): PettyCashAccountSnapshot {
  return {
    id: row.id,
    companyId: row.companyId,
    siteId: row.siteId,
    mode: row.mode,
    periodKind: row.periodKind,
    initialAmount: row.initialAmount,
    limitAmount: row.limitAmount,
    currentBalance: row.currentBalance,
    isActive: row.isActive,
    periodStartedAt: row.periodStartedAt,
  };
}

/**
 * Snapshot de la cuenta activa de una sede. null si no hay.
 */
export async function getActiveAccountForSite(
  companyId: number,
  siteId: number,
): Promise<PettyCashAccountSnapshot | null> {
  const [row] = await db
    .select()
    .from(companyPettyCashAccounts)
    .where(and(
      eq(companyPettyCashAccounts.companyId, companyId),
      eq(companyPettyCashAccounts.siteId, siteId),
      eq(companyPettyCashAccounts.isActive, true),
    ))
    .limit(1);
  return row ? mapAccount(row) : null;
}

/**
 * Lista los últimos N movimientos de una cuenta. Para el historial.
 */
export async function listMovements(params: {
  companyId: number;
  accountId?: number;
  siteId?: number;
  limit?: number;
}): Promise<Array<{
  id: number;
  type: typeof companyPettyCashMovements.$inferSelect.type;
  amount: string;
  balanceAfter: string;
  note: string | null;
  occurredAt: Date;
  requesterName: string | null;
  actorName: string | null;
  relatedRequestId: number | null;
  relatedVoucherId: number | null;
}>> {
  const { companyId, accountId, siteId, limit = 100 } = params;

  // Si nos pasan siteId, primero resolvemos la cuenta activa.
  let targetAccountId = accountId;
  if (!targetAccountId && siteId) {
    const acc = await getActiveAccountForSite(companyId, siteId);
    targetAccountId = acc?.id;
  }
  if (!targetAccountId) return [];

  // companyUsers tiene el nombre en profileData->>'fullName' (jsonb), no en
  // una columna directa. Usamos COALESCE con un fallback al username.
  const rows = await db.execute<{
    id: number;
    type: string;
    amount: string;
    balance_after: string;
    note: string | null;
    occurred_at: Date;
    related_request_id: number | null;
    related_voucher_id: number | null;
    actor_name: string | null;
  }>(sql`
    SELECT
      m.id, m.type, m.amount, m.balance_after, m.note, m.occurred_at,
      m.related_request_id, m.related_voucher_id,
      COALESCE(u.profile_data->>'fullName', u.username) AS actor_name
    FROM company_petty_cash_movements m
    LEFT JOIN company_users u ON u.id = m.actor_user_id
    WHERE m.account_id = ${targetAccountId}
    ORDER BY m.occurred_at DESC
    LIMIT ${limit}
  `);

  const list = rows as unknown as Array<{
    id: number;
    type: string;
    amount: string;
    balance_after: string;
    note: string | null;
    occurred_at: Date;
    related_request_id: number | null;
    related_voucher_id: number | null;
    actor_name: string | null;
  }>;

  return list.map(r => ({
    id: r.id,
    type: r.type as typeof companyPettyCashMovements.$inferSelect.type,
    amount: r.amount,
    balanceAfter: r.balance_after,
    note: r.note,
    occurredAt: r.occurred_at,
    requesterName: null,
    actorName: r.actor_name ?? null,
    relatedRequestId: r.related_request_id,
    relatedVoucherId: r.related_voucher_id,
  }));
}

/**
 * Lista gastos anuales de la empresa con filtros opcionales por rango
 * de fechas y por vehículo.
 */
export async function listAnnualExpenses(params: {
  companyId: number;
  fromDate?: string;
  toDate?: string;
  vehicleId?: number;
}): Promise<Array<typeof companyAnnualExpenses.$inferSelect>> {
  const conditions = [eq(companyAnnualExpenses.companyId, params.companyId)];
  if (params.fromDate) conditions.push(sql`${companyAnnualExpenses.occurredAt} >= ${params.fromDate}::date`);
  if (params.toDate)   conditions.push(sql`${companyAnnualExpenses.occurredAt} <= ${params.toDate}::date`);
  if (params.vehicleId) conditions.push(eq(companyAnnualExpenses.vehicleId, params.vehicleId));

  return db
    .select()
    .from(companyAnnualExpenses)
    .where(and(...conditions))
    .orderBy(desc(companyAnnualExpenses.occurredAt));
}

/**
 * Lista todas las transacciones del módulo (movimientos de caja chica +
 * gastos anuales) en un rango. Pensado para la pestaña "Transacciones".
 */
export async function listTransactions(params: {
  companyId: number;
  fromDate?: string;
  toDate?: string;
  scope: 'petty_cash' | 'annual' | 'all';
}): Promise<Array<{
  source: 'petty_cash_movement' | 'annual_expense';
  id: number;
  amount: string;
  occurredAt: Date | string;
  description: string;
  category: string | null;
  relatedVoucherId: number | null;
  relatedRequestId: number | null;
  actorName: string | null;
  balanceAfter: string | null;
}>> {
  const { companyId, fromDate, toDate, scope } = params;
  const out: Array<{
    source: 'petty_cash_movement' | 'annual_expense';
    id: number;
    amount: string;
    occurredAt: Date | string;
    description: string;
    category: string | null;
    relatedVoucherId: number | null;
    relatedRequestId: number | null;
    actorName: string | null;
    balanceAfter: string | null;
  }> = [];

  // ── Movimientos de caja chica ──
  if (scope === 'petty_cash' || scope === 'all') {
    const pettyRows = await db.execute<{
      id: number;
      amount: string;
      balance_after: string;
      note: string | null;
      occurred_at: Date;
      type: string;
      related_voucher_id: number | null;
      related_request_id: number | null;
      actor_name: string | null;
    }>(sql`
      SELECT
        m.id, m.amount, m.balance_after, m.note, m.occurred_at, m.type,
        m.related_voucher_id, m.related_request_id,
        COALESCE(u.profile_data->>'fullName', u.username) AS actor_name
      FROM company_petty_cash_movements m
      LEFT JOIN company_users u ON u.id = m.actor_user_id
      WHERE m.company_id = ${companyId}
        ${fromDate ? sql`AND m.occurred_at >= ${fromDate}::timestamp` : sql``}
        ${toDate   ? sql`AND m.occurred_at <= ${toDate}::timestamp`   : sql``}
      ORDER BY m.occurred_at DESC
      LIMIT 500
    `) as unknown as Array<{
      id: number;
      amount: string;
      balance_after: string;
      note: string | null;
      occurred_at: Date;
      type: string;
      related_voucher_id: number | null;
      related_request_id: number | null;
      actor_name: string | null;
    }>;

    for (const r of pettyRows) {
      out.push({
        source: 'petty_cash_movement',
        id: r.id,
        amount: r.amount,
        occurredAt: r.occurred_at,
        description: r.note ?? humanizeMovementType(r.type),
        category: r.type,
        relatedVoucherId: r.related_voucher_id,
        relatedRequestId: r.related_request_id,
        actorName: r.actor_name ?? null,
        balanceAfter: r.balance_after,
      });
    }
  }

  // ── Gastos anuales ──
  if (scope === 'annual' || scope === 'all') {
    const annualRows = await db.execute<{
      id: number;
      amount: string;
      occurred_at: string;
      description: string;
      category: string | null;
      related_request_id: number | null;
      actor_name: string | null;
    }>(sql`
      SELECT
        a.id, a.amount, a.occurred_at::text, a.description, a.category,
        a.finance_request_id AS related_request_id,
        COALESCE(u.profile_data->>'fullName', u.username) AS actor_name
      FROM company_annual_expenses a
      LEFT JOIN company_users u ON u.id = a.actor_user_id
      WHERE a.company_id = ${companyId}
        ${fromDate ? sql`AND a.occurred_at >= ${fromDate}::date` : sql``}
        ${toDate   ? sql`AND a.occurred_at <= ${toDate}::date`   : sql``}
      ORDER BY a.occurred_at DESC
      LIMIT 500
    `) as unknown as Array<{
      id: number;
      amount: string;
      occurred_at: string;
      description: string;
      category: string | null;
      related_request_id: number | null;
      actor_name: string | null;
    }>;

    for (const r of annualRows) {
      out.push({
        source: 'annual_expense',
        id: r.id,
        amount: r.amount,
        occurredAt: r.occurred_at,
        description: r.description,
        category: r.category,
        relatedVoucherId: null,
        relatedRequestId: r.related_request_id,
        actorName: r.actor_name ?? null,
        balanceAfter: null,
      });
    }
  }

  // Sort final por fecha DESC.
  out.sort((a, b) => {
    const ta = new Date(a.occurredAt).getTime();
    const tb = new Date(b.occurredAt).getTime();
    return tb - ta;
  });

  return out;
}

function humanizeMovementType(type: string): string {
  switch (type) {
    case 'initial_assignment':         return 'Asignación inicial de caja';
    case 'replenishment':              return 'Reposición de caja';
    case 'period_reset_out':           return 'Cierre de periodo (salida)';
    case 'period_reset_in':            return 'Inicio de periodo (entrada)';
    case 'request_approved_petty':     return 'Solicitud aprobada (caja chica)';
    case 'request_approved_annual':    return 'Solicitud aprobada (gasto anual)';
    case 'voucher_closed_refund':      return 'Reembolso por vale cerrado';
    case 'voucher_cancelled':          return 'Vale cancelado';
    case 'manual_adjustment':          return 'Ajuste manual';
    default: return type;
  }
}