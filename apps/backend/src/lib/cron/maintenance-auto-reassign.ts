// lib/cron/maintenance-auto-reassign.ts
// ─────────────────────────────────────────────────────────────────────
// Cron de REASIGNACIÓN AUTOMÁTICA diaria.
//
// jul 2026 — Reemplaza el flujo viejo de "Atrasado + reautorización
// manual". A las 21:00 hora Ecuador (02:00 UTC del día siguiente), este
// cron:
//   1) Busca mantenimientos NO completados (status ∈ Programado / En
//      proceso / Atrasado) cuyo `scheduledFor` ya pasó.
//   2) Los reagenda para el DÍA SIGUIENTE (00:00 EC del día siguiente).
//   3) Marca `isReprogrammed=true`, incrementa `reprogramCount`, setea
//      `reprogrammedAt` y `reprogramReason` para trazabilidad.
//   4) Inserta un evento `reassigned_daily` en
//      `company_maintenance_events` con el payload completo (scheduledFor
//      anterior, scheduledFor nuevo, motivo, cron que lo detectó).
//   5) Notifica al asignado (si existe) + a todos los admins de la
//      empresa (owner_empresa + admin_empresa) vía `notify()` y
//      `notifyAdmins()` — el WS broadcast y el FCM los entrega
//      automáticamente.
//
// Por qué NO incluye type=Lavada: el lavado es un servicio por demanda
// (no tiene fecha de vencimiento real). Si la empresa no lo cobró, no
// se "reagenda", se queda como Completado o lo que sea. Mismo
// razonamiento que en el cron viejo de Atrasado.
//
// Por qué NO incluye type=Correctivo: los correctivos se ejecutan
// cuando se puede (no tienen fecha de vencimiento). Si están vencidos
// es un problema operativo pero no un "no cumplimiento" — el operador
// los trabaja cuando aparecen. Mismo razonamiento.
//
// Solo se activa si `MAINTENANCE_AUTO_REASSIGN_CRON_ENABLED === 'true'`.
// ─────────────────────────────────────────────────────────────────────

import cron from 'node-cron';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyMaintenanceRecords,
  companyMaintenanceEvents,
} from '../../db/schema/operational';
import { companyUsers } from '../../db/schema/platform';
import { notify, notifyAdmins } from '../notification-service';

let started = false;

/**
 * Medianoche de MAÑANA en Ecuador → convertido a UTC porque el backend
 * corre con TZ=UTC. 00:00 EC del día siguiente = 05:00 UTC del día
 * siguiente.
 *
 * Esta es la fecha a la que se van a mover los mantenimientos no
 * completados al final del día.
 */
function getEcuadorTomorrowMidnightUtc(now: Date = new Date()): Date {
  // Pasamos a string en EC, le sumamos 1 día, y construimos la medianoche.
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // → "YYYY-MM-DD" (en EC)
  // Sumamos 1 día. Truco simple: crear la fecha localmente y sumar 86400s.
  // En vez de eso, parseamos y sumamos.
  const [y, m, d] = ymd.split('-').map(Number);
  // Construimos la medianoche de MAÑANA en EC.
  const next = new Date(Date.UTC(y, m - 1, d + 1, 5, 0, 0)); // 00:00 EC mañana = 05:00 UTC mañana
  return next;
}

/**
 * Resultado de un sweep de reassign.
 */
export type ReassignResult = {
  total: number;          // cuántos se procesaron
  byStatus: Record<string, number>; // desglose por status previo
  byCompany: Array<{ companyId: number; count: number }>;
};

/**
 * Sweep principal: detecta no-completados vencidos y los reagenda al
 * día siguiente. Devuelve la cantidad de mantenimientos reagendados.
 *
 * Es idempotente: la condición WHERE usa `isReprogrammed=false` (con un
 * status específico) para que un sweep manual duplicado no toque los
 * mismos registros. Si el operador ya marcó el mantenimiento como
 * Completado entre el primer sweep y el segundo, el WHERE excluye
 * Completado y no se vuelve a tocar.
 */
export async function runReassignUnfinished(): Promise<ReassignResult> {
  const now = new Date();
  const tomorrowMidnightEc = getEcuadorTomorrowMidnightUtc(now);

  // 1) Candidatos: NO completados (Programado / En proceso / Atrasado)
  //    cuyo scheduledFor ya pasó. Lavada y Correctivo quedan fuera por
  //    diseño (ver comentario del header).
  //    `isReprogrammed=false` evita que el cron pise un reprog anterior
  //    que el operador/admin haya hecho explícitamente hoy.
  const candidates = await db
    .select({
      id:             companyMaintenanceRecords.id,
      companyId:      companyMaintenanceRecords.companyId,
      assetId:        companyMaintenanceRecords.assetId,
      title:          companyMaintenanceRecords.title,
      status:         companyMaintenanceRecords.status,
      scheduledFor:   companyMaintenanceRecords.scheduledFor,
      assignedUserId: companyMaintenanceRecords.assignedUserId,
      reprogramCount: companyMaintenanceRecords.reprogramCount,
    })
    .from(companyMaintenanceRecords)
    .where(and(
      // Usamos sql template en vez de inArray() porque drizzle's inArray
      // chilla con columnas enum (espera Aliased<string>). El cast ::text
      // es solo de typescript: la columna YA es texto/enum en PG.
      sql`${companyMaintenanceRecords.status}::text IN ('Programado', 'En proceso', 'Atrasado')`,
      eq(companyMaintenanceRecords.type, 'Programado'),
      lt(companyMaintenanceRecords.scheduledFor, tomorrowMidnightEc),
    ));

  if (!candidates.length) {
    return { total: 0, byStatus: {}, byCompany: [] };
  }

  const byStatus: Record<string, number> = {};
  const byCompanyMap = new Map<number, number>();
  let processed = 0;

  for (const m of candidates) {
    // 2) UPDATE scheduledFor = mañana, isReprogrammed = true,
    //    reprogramCount += 1, reprogrammedAt = now, reprogramReason =
    //    "Reagendado automáticamente por no completarse a las 21:00 EC".
    //    El WHERE sigue incluyendo el status original para evitar pisa-
    //    dos concurrentes (ej. operador que recién lo marcó Completado).
    const updated = await db
      .update(companyMaintenanceRecords)
      .set({
        scheduledFor:    tomorrowMidnightEc,
        isReprogrammed:   true,
        reprogramCount:   sql`${companyMaintenanceRecords.reprogramCount} + 1`,
        reprogrammedAt:   now,
        reprogramReason:  'Reagendado automáticamente por no completarse a las 21:00 EC.',
      })
      .where(and(
        eq(companyMaintenanceRecords.id, m.id),
        // Mismo truco de sql template que arriba (inArray no funciona con
        // columnas enum en drizzle). Mantenemos el status al reagendar
        // por seguridad contra cambios concurrentes.
        sql`${companyMaintenanceRecords.status}::text IN ('Programado', 'En proceso', 'Atrasado')`,
      ))
      .returning({ id: companyMaintenanceRecords.id });

    if (!updated.length) {
      // Otro proceso (operador/admin) cambió el status antes de llegar
      // acá (probablemente lo marcó Completado). No reagendamos.
      continue;
    }
    processed++;
    byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
    byCompanyMap.set(m.companyId, (byCompanyMap.get(m.companyId) ?? 0) + 1);

    // 3) Evento de timeline (system actor: name='cron-auto-reassign').
    //    El kind `reassigned_daily` es NUEVO (no confundir con el
    //    `reassigned` manual que ya existía). Lo elegimos para que el
    //    timeline pueda distinguir "el operador pidió reprogramar" de
    //    "el sistema reagendó porque no se hizo".
    try {
      await db.insert(companyMaintenanceEvents).values({
        companyId:     m.companyId,
        maintenanceId: m.id,
        kind:          'reassigned_daily',
        actorUserId:   null,
        actorName:     'cron-auto-reassign',
        payload: {
          previousStatus:   m.status,
          previousScheduledFor: m.scheduledFor,
          newScheduledFor:   tomorrowMidnightEc.toISOString(),
          reason:            'no_completed_by_21ec',
          detectedAt:        now.toISOString(),
        },
      });
    } catch (err) {
      console.warn(
        '[cron] auto-reassign: evento falló (no crítico) maintenanceId=' + m.id +
        ' err=' + (err as Error)?.message,
      );
    }

    // 4) Notificación al asignado (si existe) + admins.
    const title = `Mantenimiento reagendado: ${m.title ?? '(sin título)'}`;
    const body  = `No se completó hoy (${m.scheduledFor.toLocaleDateString('es-CO')}) y se movió automáticamente al ${tomorrowMidnightEc.toLocaleDateString('es-CO')}.`;
    const payload = {
      maintenanceId: m.id,
      assetId:       m.assetId,
      reason:        'auto_reassigned_daily',
      previousScheduledFor: m.scheduledFor,
      newScheduledFor: tomorrowMidnightEc.toISOString(),
    };

    try {
      if (m.assignedUserId) {
        // Validamos que el asignado siga activo antes de notificarlo
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
            kind:      'maintenance_status_changed',
            title,
            body,
            payload,
          });
        }
      }
      // Siempre notifyAdmins: el user pidió que llegue al operador +
      // admin + owner, así que los admins van seguro.
      await notifyAdmins(m.companyId, {
        kind: 'maintenance_status_changed',
        title,
        body,
        payload,
      });
    } catch (err) {
      const e = err as Error;
      console.warn(
        '[cron] auto-reassign: notify falló (no crítico) maintenanceId=' + m.id +
        ' err=' + (e?.message ?? String(err)),
      );
    }
  }

  return {
    total: processed,
    byStatus,
    byCompany: Array.from(byCompanyMap.entries()).map(([companyId, count]) => ({ companyId, count })),
  };
}

/**
 * Registra el job diario. 21:00 hora Ecuador = 02:00 UTC del día
 * siguiente (Ecuador es UTC-5). Expresión cron: `'0 2 * * *'` → minuto
 * 0, hora 2 UTC, todos los días.
 *
 * Se activa con `MAINTENANCE_AUTO_REASSIGN_CRON_ENABLED === 'true'`.
 * En local queda OFF salvo que se setee la env.
 */
export function startMaintenanceAutoReassignCron() {
  if (started) return;
  if (process.env.MAINTENANCE_AUTO_REASSIGN_CRON_ENABLED !== 'true') {
    console.log('[cron] MAINTENANCE_AUTO_REASSIGN_CRON_ENABLED != true → cron auto-reassign apagado.');
    return;
  }
  started = true;

  // Diario 02:00 UTC = 21:00 hora Ecuador del día ANTERIOR. Equivalente
  // absoluto al 21:00 EC del día que termina.
  cron.schedule('0 2 * * *', async () => {
    try {
      const r = await runReassignUnfinished();
      if (r.total > 0) {
        const byStatusStr = Object.entries(r.byStatus)
          .map(([k, v]) => `${k}=${v}`).join(' ');
        console.log(
          `[cron] auto-reassign: ${r.total} mantenimientos reagendados (${byStatusStr}).`,
        );
      } else {
        console.log('[cron] auto-reassign: 0 mantenimientos para reagendar.');
      }
    } catch (err) {
      console.error('[cron] auto-reassign error:', err);
    }
  });

  console.log('[cron] maintenance-auto-reassign registrado (diario 21:00 EC / 02:00 UTC).');
}
