// lib/cron/alert-reminders.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 v8 — Re-envío periódico de alertas operativas.
//
// Una alerta (status='Abierta' o 'En seguimiento') con
// `reminder_interval_minutes > 0` y `next_reminder_at <= NOW()` se
// re-envía como notificación a sus destinatarios. Después del
// re-envío, `last_reminded_at = NOW()` y `next_reminder_at` se
// recalcula (`last + interval`).
//
// CORRE CADA 5 MINUTOS. El intervalo mínimo de recordatorio es 30 min
// (Alta), así que no hay riesgo de duplicación por re-envíos
// demasiado frecuentes.
//
// Destinatarios: mismos que se usan en la creación de la alerta
// (admins + supervisores de la empresa, excluyendo el actor original).
//
// El cron se activa con la env var `ALERT_REMINDERS_CRON_ENABLED=true`.
// Por defecto está apagado para que no se dispare en local sin querer.
// ─────────────────────────────────────────────────────────────────────

import cron from 'node-cron';
import { and, eq, isNotNull, lte, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyAlerts, companyAssets } from '../../db/schema/operational';
import { companyUsers } from '../../db/schema/platform';
import { notifyMany } from '../notification-service';
import { logAudit } from '../audit';

let started = false;

/**
 * Una sola pasada del job. Devuelve la cantidad de alertas procesadas.
 * Exportada para poder correrla desde tests o desde un endpoint
 * admin de "disparar recordatorios ahora".
 */
export async function runAlertRemindersOnce(): Promise<number> {
  const now = new Date();

  // 1) Buscar alertas con `next_reminder_at <= now` y status vigente.
  const due = await db
    .select({
      id:               companyAlerts.id,
      companyId:        companyAlerts.companyId,
      assetId:          companyAlerts.assetId,
      title:            companyAlerts.title,
      severity:         companyAlerts.severity,
      type:             companyAlerts.type,
      status:           companyAlerts.status,
      reminderIntervalMinutes: companyAlerts.reminderIntervalMinutes,
    })
    .from(companyAlerts)
    .where(and(
      isNotNull(companyAlerts.nextReminderAt),
      lte(companyAlerts.nextReminderAt, now),
      inArray(companyAlerts.status, ['Abierta', 'En seguimiento']),
      sql`${companyAlerts.reminderIntervalMinutes} > 0`,
    ))
    .limit(200);

  if (due.length === 0) return 0;

  let processed = 0;
  for (const a of due) {
    try {
      // 2) Resolver destinatarios: admins + supervisores de la empresa
      //    (mismo criterio que en POST /alerts). No hay "actor" porque
      //    el recordatorio NO excluye a nadie — va a TODOS los que
      //    recibieron la alerta original.
      const recipients = await db
        .select({ id: companyUsers.id })
        .from(companyUsers)
        .where(and(
          eq(companyUsers.companyId, a.companyId),
          inArray(companyUsers.role, ['admin_empresa', 'owner_empresa', 'supervisor']),
          eq(companyUsers.status, 'active'),
        ));

      const userIds = recipients.map((r) => r.id);
      if (userIds.length === 0) {
        // Nadie para notificar — deshabilitamos recordatorios para no loopear.
        await db.update(companyAlerts)
          .set({
            reminderIntervalMinutes: 0,
            nextReminderAt: null,
            updatedAt: new Date(),
          })
          .where(eq(companyAlerts.id, a.id));
        continue;
      }

      // 3) Enrichment: nombre/placa del activo (para el body de la notif).
      let assetInfo: { name: string | null; plate: string | null } | null = null;
      if (a.assetId) {
        const [r] = await db
          .select({ name: companyAssets.name, plate: companyAssets.plate })
          .from(companyAssets)
          .where(eq(companyAssets.id, a.assetId))
          .limit(1);
        assetInfo = r ?? null;
      }

      // 4) Enviar notificación.
      const title = `Recordatorio (${a.severity}): ${a.title}`;
      const body  = assetInfo
        ? `Vehículo: ${assetInfo.name}${assetInfo.plate ? ` (${assetInfo.plate})` : ''}`
        : 'Alerta sin vehículo asignado.';

      await notifyMany(a.companyId, userIds, {
        kind:    'alert_reminder',
        title,
        body,
        payload: {
          alertId:         a.id,
          severity:        a.severity,
          type:            a.type ?? 'Manual',
          assetId:         a.assetId,
          reminderCount:   true,  // marca explícita para el frontend
        },
      });

      // 5) Actualizar `last_reminded_at` y `next_reminder_at`.
      //    new_next = NOW() + interval. Usamos SQL para que el reloj
      //    sea el del server de BD (consistente con `next_reminder_at`
      //    calculado en el endpoint).
      const newNext = new Date(now.getTime() + a.reminderIntervalMinutes * 60_000);
      await db.update(companyAlerts)
        .set({
          lastRemindedAt: now,
          nextReminderAt: newNext,
          updatedAt:      now,
        })
        .where(eq(companyAlerts.id, a.id));

      await logAudit(db, a.companyId, {
        entity:    'alerts',
        entityId:  `alert-${a.id}`,
        action:    'update',
        actorId:   'system-cron',
        actorName: 'Sistema (cron alert-reminders)',
        description: `Recordatorio enviado a ${userIds.length} destinatario(s).`,
      });

      processed++;
    } catch (err) {
      console.error(`[cron:alert-reminders] alerta ${a.id} falló:`, (err as Error).message);
      // Continuar con la siguiente — un fallo no debe tumbar el batch.
    }
  }

  if (processed > 0) {
    console.log(`[cron:alert-reminders] ${processed} alertas re-enviadas.`);
  }
  return processed;
}

export function startAlertRemindersCron() {
  if (started) return;
  if (process.env.ALERT_REMINDERS_CRON_ENABLED !== 'true') {
    console.log('[cron] ALERT_REMINDERS_CRON_ENABLED != true → cron apagado.');
    return;
  }
  started = true;

  // Cada 5 minutos.
  cron.schedule('*/5 * * * *', () => {
    void runAlertRemindersOnce();
  });

  console.log('[cron] alert-reminders registrado (cada 5 min).');
}
