// lib/cron/maintenance-overdue.ts
// ─────────────────────────────────────────────────────────────────────
// Cron que detecta mantenimientos vencidos y los marca como "Atrasado".
//
// Reglas:
//   - type = 'Programado' (los Correctivos NO se marcan atrasados: se
//     ejecutan cuando se puede, no tienen fecha de vencimiento. Igual
//     para Lavada, que es un servicio que se cobra al prestarlo.)
//   - status = 'Programado' (solo lo que nunca se empezó)
//   - scheduledFor < hoy 00:00 (hora Ecuador)
//
// Para cada match:
//   1) UPDATE company_maintenance_records.status = 'Atrasado'
//   2) INSERT en company_maintenance_events kind='overdue'
//      (alimenta el timeline del mantenimiento)
//   3) INSERT en company_notifications kind='maintenance_due'
//      → destinatario: assignedUserId si existe, o todos los
//        owner_empresa / admin_empresa de la empresa.
//
// Idempotencia:
//   - El WHERE excluye 'Atrasado' → un mantenimiento ya marcado
//     no se vuelve a tocar (su status no matchea de nuevo).
//   - Aun si el cron se corre dos veces en el mismo día (ej. manual),
//     la segunda pasada no encuentra candidatos pendientes.
//
// Solo se activa si `MAINTENANCE_OVERDUE_CRON_ENABLED === 'true'`.
// En local queda OFF salvo que se setee la env.
// ─────────────────────────────────────────────────────────────────────

import cron from 'node-cron';
import { and, eq, lt } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyMaintenanceRecords,
  companyMaintenanceEvents,
  companyUsers,
} from '../../db/schema/operational';
import { notify, notifyAdmins } from '../notification-service';

let started = false;

/**
 * Inicio del día en Ecuador (UTC-5) → convertido a UTC porque el
 * backend corre con TZ=UTC. 00:00 Ecuador = 05:00 UTC.
 *
 * Devuelve un Date con la medianoche ECU del día actual, en UTC.
 */
function getEcuadorMidnightUtc(): Date {
  const now = new Date();
  // Pasamos a string en EC y solo nos quedamos con el YYYY-MM-DD.
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // → "YYYY-MM-DD"
  // Construimos directamente la medianoche EC → a UTC es +5h.
  // 00:00 EC = 05:00 UTC del mismo día civil EC.
  return new Date(`${ymd}T05:00:00.000Z`);
}

/**
 * Sweep principal: detecta vencidos, los marca como 'Atrasado', registra
 * el evento en el timeline y notifica a los destinatarios.
 *
 * Devuelve la cantidad de mantenimientos marcados.
 */
export async function runOverdueMaintenance(): Promise<number> {
  const todayMidnightEc = getEcuadorMidnightUtc();

  // 1) Candidatos: solo Programados que nunca se empezaron (status='Programado')
  //    y que ya vencieron. Correctivo/Lavada quedan fuera porque no tienen
  //    una fecha de vencimiento real (Correctivo se ejecuta cuando se puede;
  //    Lavada es un servicio por demanda).
  const candidates = await db
    .select({
      id:         companyMaintenanceRecords.id,
      companyId:  companyMaintenanceRecords.companyId,
      assetId:    companyMaintenanceRecords.assetId,
      title:      companyMaintenanceRecords.title,
      status:     companyMaintenanceRecords.status,
      scheduledFor: companyMaintenanceRecords.scheduledFor,
      assignedUserId: companyMaintenanceRecords.assignedUserId,
    })
    .from(companyMaintenanceRecords)
    .where(and(
      eq(companyMaintenanceRecords.type, 'Programado'),
      eq(companyMaintenanceRecords.status, 'Programado'),
      lt(companyMaintenanceRecords.scheduledFor, todayMidnightEc),
    ));

  if (!candidates.length) return 0;

  let marked = 0;
  for (const m of candidates) {
    // 2) UPDATE status = 'Atrasado' (condicional: solo si sigue
    //    'Programado'). Evita pisar cambios manuales concurrentes
    //    (ej. operador que recién lo tomó o admin que lo reprogramó).
    const updated = await db
      .update(companyMaintenanceRecords)
      .set({ status: 'Atrasado' })
      .where(and(
        eq(companyMaintenanceRecords.id, m.id),
        eq(companyMaintenanceRecords.type, 'Programado'),
        eq(companyMaintenanceRecords.status, 'Programado'),
      ))
      .returning({ id: companyMaintenanceRecords.id });

    if (!updated.length) {
      // Otro proceso ya lo cambió antes de llegar acá. No notificamos.
      continue;
    }
    marked++;

    // 3) Evento de timeline (system actor: name='cron').
    try {
      await db.insert(companyMaintenanceEvents).values({
        companyId:     m.companyId,
        maintenanceId: m.id,
        kind:          'overdue',
        actorUserId:   null,
        actorName:     'cron',
        payload: {
          previousStatus: m.status,
          scheduledFor:   m.scheduledFor,
          detectedAt:     new Date().toISOString(),
          cutoffEc:       todayMidnightEc.toISOString(),
        },
      });
    } catch (err) {
      console.warn('[cron] overdue: evento falló (no crítico):', (err as Error).message);
    }

    // 4) Notificación in-app + WS + FCM (vía notify/notifyAdmins).
    const title = `Mantenimiento atrasado: ${m.title ?? '(sin título)'}`;
    const body  = `El mantenimiento programado para ${m.scheduledFor.toLocaleDateString('es-CO')} está vencido.`;
    try {
      if (m.assignedUserId) {
        // Confirmamos que el asignado sigue activo antes de notificarlo
        // directo. Si no, caemos al fallback de admins.
        const [assignee] = await db
          .select({ id: companyUsers.id })
          .from(companyUsers)
          .where(and(
            eq(companyUsers.id, m.assignedUserId),
            eq(companyUsers.companyId, m.companyId),
            eq(companyUsers.status, 'active'),
          ))
          .limit(1);

        if (assignee) {
          await notify({
            companyId: m.companyId,
            userId:    m.assignedUserId,
            kind:      'maintenance_due',
            title,
            body,
            payload:   {
              maintenanceId: m.id,
              assetId:       m.assetId,
              reason:        'overdue',
              scheduledFor:  m.scheduledFor,
            },
          });
        } else {
          // El asignado ya no está activo → notifyAdmins.
          await notifyAdmins(m.companyId, {
            kind:   'maintenance_due',
            title,
            body,
            payload: {
              maintenanceId: m.id,
              assetId:       m.assetId,
              reason:        'overdue',
              scheduledFor:  m.scheduledFor,
            },
          });
        }
      } else {
        // Sin asignado → todos los admins de la empresa.
        await notifyAdmins(m.companyId, {
          kind:   'maintenance_due',
          title,
          body,
          payload: {
            maintenanceId: m.id,
            assetId:       m.assetId,
            reason:        'overdue',
            scheduledFor:  m.scheduledFor,
          },
        });
      }
    } catch (err) {
      // jun 2026 — más contexto: "Cannot read properties of undefined (reading 'id')"
      // venía sin saber qué mantenimiento disparó el error. Mejor logueamos
      // el maintenanceId y el assigneeId para diagnosticar fácil.
      const e = err as Error;
      console.warn(
        '[cron] overdue: notify falló (no crítico) maintenanceId=' + m.id +
        ' assignedUserId=' + m.assignedUserId + ' err=' + (e?.message ?? String(err)) +
        (e?.stack ? '\n' + e.stack.split('\n').slice(0, 4).join('\n') : ''),
      );
    }
  }

  return marked;
}

/**
 * Registra el job diario. Ecuador 00:05 = UTC 05:05 (TZ forzada en index.ts).
 * Expresión cron: '5 5 * * *' → minuto 5, hora 5 UTC, todos los días.
 *
 * Se activa con `MAINTENANCE_OVERDUE_CRON_ENABLED === 'true'`. Si la env
 * no está, el job queda apagado (igual que los demás crons del módulo).
 */
export function startMaintenanceOverdueCron() {
  if (started) return;
  if (process.env.MAINTENANCE_OVERDUE_CRON_ENABLED !== 'true') {
    console.log('[cron] MAINTENANCE_OVERDUE_CRON_ENABLED != true → cron overdue apagado.');
    return;
  }
  started = true;

  // Diario 05:05 UTC (00:05 hora Ecuador, ya que el server corre con TZ=UTC).
  cron.schedule('5 5 * * *', async () => {
    try {
      const n = await runOverdueMaintenance();
      if (n > 0) console.log(`[cron] overdue: ${n} mantenimientos marcados como Atrasado.`);
    } catch (err) {
      console.error('[cron] overdue error:', err);
    }
  });

  console.log('[cron] maintenance-overdue registrado (diario 00:05 EC / 05:05 UTC).');
}
