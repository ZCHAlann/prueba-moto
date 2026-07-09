// lib/cron/petty-cash.ts
//
// jul 2026 — Cron jobs del módulo Caja Chica (Finanzas).
//
// 1) startPettyCashPeriodResetCron()
//    Diario 00:30 EC: para cada cuenta con mode='period' cuyo
//    period_started_at venció según period_kind (monthly/weekly):
//      - Crea movement 'period_reset_out' (negativo = sale saldo actual).
//      - Desactiva la cuenta vieja (is_active=false).
//      - Crea nueva cuenta (is_active=true) con initial_amount configurado.
//      - Movement 'period_reset_in' (positivo = entra nuevo saldo).
//      - WS broadcast a la empresa.
//
// 2) startPettyCashLimitCheckCron()
//    Cada 1h: chequea cuentas activas. Si saldo <= 0 O < 10% del limit_amount,
//    emite alerta (si no se emitió en las últimas 6h, para evitar spam).
//
// Se activan con PETTY_CASH_CRON_ENABLED=true. Por defecto apagadas.

import cron from 'node-cron';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyPettyCashAccounts,
  companyPettyCashMovements,
} from '../../db/schema/operational';
import { notifyAdmins } from '../notification-service';
import { wsBroadcast } from '../../services/websocket';

let periodResetStarted = false;
let limitCheckStarted = false;

const ENABLED = process.env.PETTY_CASH_CRON_ENABLED === 'true';

// ─── Cron 1: period reset ────────────────────────────────────────────────────

export function startPettyCashPeriodResetCron() {
  if (periodResetStarted) return;
  if (!ENABLED) {
    console.log('[cron] PETTY_CASH_CRON_ENABLED != true → pettyCashPeriodReset apagado.');
    return;
  }
  periodResetStarted = true;

  cron.schedule('30 0 * * *', async () => {
    try {
      const result = await runPeriodReset();
      console.log(`[cron] pettyCashPeriodReset: ${result.resetCount} cuenta(s) reseteada(s).`);
    } catch (err) {
      console.error('[cron] pettyCashPeriodReset error general:', err);
    }
  }, { timezone: 'America/Guayaquil' });

  console.log('[cron] pettyCashPeriodReset registrado (diario 00:30 EC).');
}

/**
 * Función exportada para correr manualmente (test, soporte). Devuelve
 * el número de cuentas reseteadas.
 */
export async function runPeriodReset(): Promise<{ resetCount: number }> {
  const now = new Date();

  // 1) Traer cuentas activas en mode='period'.
  const accounts = await db
    .select()
    .from(companyPettyCashAccounts)
    .where(and(
      eq(companyPettyCashAccounts.isActive, true),
      eq(companyPettyCashAccounts.mode, 'period'),
    ));

  let resetCount = 0;

  for (const acc of accounts) {
    const startedAt = new Date(acc.periodStartedAt);
    const nextReset = nextPeriodBoundary(startedAt, acc.periodKind ?? 'monthly');
    if (now < nextReset) continue;

    const oldBalance = Number(acc.currentBalance);

    // 2) Movement period_reset_out (negativo) — el saldo sale.
    await db.insert(companyPettyCashMovements).values({
      companyId: acc.companyId,
      accountId: acc.id,
      type: 'period_reset_out',
      amount: (-oldBalance).toFixed(2),
      balanceAfter: '0',
      actorUserId: acc.createdBy ?? null,
      note: `Cierre de periodo (${acc.periodKind}). Saldo final: $${oldBalance.toFixed(2)}.`,
    });

    // 3) Desactivar cuenta vieja.
    await db
      .update(companyPettyCashAccounts)
      .set({ isActive: false, updatedAt: now })
      .where(eq(companyPettyCashAccounts.id, acc.id));

    // 4) Crear nueva cuenta activa con mismo initial_amount.
    const [newAcc] = await db
      .insert(companyPettyCashAccounts)
      .values({
        companyId: acc.companyId,
        siteId: acc.siteId,
        mode: acc.mode,
        periodKind: acc.periodKind,
        initialAmount: acc.initialAmount,
        limitAmount: acc.limitAmount,
        currentBalance: acc.initialAmount,
        isActive: true,
        periodStartedAt: now,
        createdBy: acc.createdBy,
        updatedBy: acc.createdBy,
      })
      .returning();

    if (newAcc) {
      // 5) Movement period_reset_in (positivo) — entra el nuevo saldo.
      await db.insert(companyPettyCashMovements).values({
        companyId: acc.companyId,
        accountId: newAcc.id,
        type: 'period_reset_in',
        amount: acc.initialAmount,
        balanceAfter: acc.initialAmount,
        actorUserId: acc.createdBy ?? null,
        note: `Inicio de nuevo periodo (${acc.periodKind}). Saldo inicial: $${Number(acc.initialAmount).toFixed(2)}.`,
      });

      // 6) WS broadcast.
      wsBroadcast(acc.companyId, {
        type: 'finance:petty_cash:period_reset',
        data: {
          oldAccountId: acc.id,
          newAccountId: newAcc.id,
          siteId: acc.siteId,
          newBalance: acc.initialAmount,
        },
      });
    }

    resetCount++;
  }

  return { resetCount };
}

/**
 * Siguiente "boundary" de periodo (monthly/weekly) desde una fecha base.
 */
function nextPeriodBoundary(from: Date, kind: 'monthly' | 'weekly'): Date {
  if (kind === 'monthly') {
    const d = new Date(from);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d;
  }
  // weekly
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

// ─── Cron 2: limit check (cada 1h) ───────────────────────────────────────────

export function startPettyCashLimitCheckCron() {
  if (limitCheckStarted) return;
  if (!ENABLED) {
    console.log('[cron] PETTY_CASH_CRON_ENABLED != true → pettyCashLimitCheck apagado.');
    return;
  }
  limitCheckStarted = true;

  cron.schedule('0 * * * *', async () => {
    try {
      const result = await runLimitCheck();
      console.log(`[cron] pettyCashLimitCheck: ${result.alertsSent} alerta(s) emitida(s).`);
    } catch (err) {
      console.error('[cron] pettyCashLimitCheck error general:', err);
    }
  }, { timezone: 'America/Guayaquil' });

  console.log('[cron] pettyCashLimitCheck registrado (cada 1h).');
}

/**
 * Revisa todas las cuentas activas. Si saldo <= 0 o < 10% del limit_amount,
 * emite alerta a los admins — salvo que ya se haya emitido una alerta
 * idéntica en las últimas 6h (idempotencia básica contra spam).
 */
export async function runLimitCheck(): Promise<{ alertsSent: number }> {
  const accounts = await db
    .select()
    .from(companyPettyCashAccounts)
    .where(eq(companyPettyCashAccounts.isActive, true));

  let alertsSent = 0;
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

  for (const acc of accounts) {
    const balance = Number(acc.currentBalance);
    const limit = Number(acc.limitAmount);

    // jul 2026 v4 — limitAmount es el UMBRAL DE ALERTA. Alerta cuando
    // balance <= 0 o balance < limit. Si limit = 0, alertar solo al llegar a 0.
    const shouldAlert = balance <= 0 || (limit > 0 && balance < limit);
    if (!shouldAlert) continue;

    // Buscamos si ya se emitió una alerta reciente para esta cuenta.
    const recent = await db
      .select({ id: companyPettyCashMovements.id })
      .from(companyPettyCashMovements)
      .where(and(
        eq(companyPettyCashMovements.accountId, acc.id),
        eq(companyPettyCashMovements.type, 'manual_adjustment'),
        sql`${companyPettyCashMovements.note} LIKE 'LIMIT_ALERT:%'`,
        sql`${companyPettyCashMovements.occurredAt} > ${sixHoursAgo.toISOString()}::timestamp`,
      ))
      .limit(1);

    if (recent.length > 0) continue;

    // Insertamos un movement "sentinel" (no afecta el saldo, lo bloqueamos
    // en la PL/pgSQL si quisiéramos — pero como es append-only y la cuenta
    // no se toca, es seguro). Solo lo usamos como marca de "ya alertamos".
    await db.insert(companyPettyCashMovements).values({
      companyId: acc.companyId,
      accountId: acc.id,
      type: 'manual_adjustment',
      amount: '0',
      balanceAfter: acc.currentBalance,
      actorUserId: null,
      note: `LIMIT_ALERT: saldo=$${balance.toFixed(2)} límite=$${limit.toFixed(2)} (${new Date().toISOString()})`,
    });

    // WS + notification a admins.
    wsBroadcast(acc.companyId, {
      type: 'finance:petty_cash:limit_reached',
      data: { accountId: acc.id, siteId: acc.siteId, balance, limit },
    });
    await notifyAdmins(acc.companyId, {
      kind: 'finance_petty_cash_limit_reached',
      title: 'Caja chica por agotarse',
      body: `Saldo actual: $${balance.toFixed(2)} (límite $${limit.toFixed(2)}). Rellená la caja para que las solicitudes sigan aprobándose.`,
      payload: { accountId: acc.id, siteId: acc.siteId, balance, limit },
    });

    alertsSent++;
  }

  return { alertsSent };
}