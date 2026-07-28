// lib/cron/driver-time-off-reminder.ts
// ─────────────────────────────────────────────────────────────────────────────
// jul 2026 — Cron de recordatorio de "Conductores libres mañana".
//
// Corre diario a las 19:00 hora Ecuador (= 00:00 UTC del día siguiente).
// Para cada empresa que tenga entradas en `driver_time_off` con
// `date = mañana EC`, manda una notificación a los admins (owner_empresa
// + admin_empresa) con la lista de conductores que estarán libres al día
// siguiente.
//
// Por qué 19:00 EC: el admin está terminando su jornada y revisa el panel
// para preparar la logística del día siguiente. No es intrusivo (no es
// a las 7am cuando recién arranca) y le da tiempo para reorganizar
// asignaciones si hace falta.
//
// Por qué NO al conductor: el conductor ya sabe su día libre (lo ve en
// su propio perfil / en el schedule del módulo). El recordatorio es
// para el admin, que es quien planifica y reasigna.
//
// Activado por env var: `DRIVER_TIME_OFF_REMINDER_CRON_ENABLED=true`.
// ─────────────────────────────────────────────────────────────────────────────

import cron from 'node-cron';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyDrivers, driverTimeOff } from '../../db/schema/operational';
import { companies } from '../../db/schema/platform';
import { notifyAdmins } from '../notification-service';

let started = false;

export type DriverTimeOffReminderResult = {
  companiesNotified: number;
  totalDrivers:      number;
};

/**
 * Calcula la fecha "mañana" en formato YYYY-MM-DD interpretado en EC.
 * Helper expuesto para testeo (no se exporta en producción).
 */
export function getTomorrowYmdEc(now: Date = new Date()): string {
  // Sumamos 24h en UTC y reformateamos en EC. Como el cron corre a
  // 19:00 EC = 00:00 UTC del día siguiente, "mañana" desde la
  // perspectiva de EC es el día siguiente de `now` interpretado en EC.
  const tomorrowUtc = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(tomorrowUtc);
}

/**
 * Sweep principal: para cada empresa con `driver_time_off` para mañana,
 * notifica a los admins con la lista de conductores libres.
 *
 * Idempotente: si el cron corre dos veces el mismo día (cold start,
 * re-deploy), las notifs se duplican — el `kind` distinto permite al
 * front dedupe si quiere. NO nos importa para esta primera versión
 * porque la frecuencia es 1x/día.
 */
export async function runDriverTimeOffReminder(
  now: Date = new Date(),
): Promise<DriverTimeOffReminderResult> {
  const tomorrowYmd = getTomorrowYmdEc(now);

  // Traemos TODAS las entradas de mañana agrupadas por empresa.
  // JOIN con company_drivers para tener el nombre, y con companies
  // para filtrar solo empresas activas.
  const rows = await db
    .select({
      companyId:    driverTimeOff.companyId,
      companyName:  companies.name,
      driverId:     driverTimeOff.driverId,
      driverFirstName: companyDrivers.firstName,
      driverLastName:  companyDrivers.lastName,
      driverCode:      companyDrivers.code,
      reason:          driverTimeOff.reason,
    })
    .from(driverTimeOff)
    .innerJoin(companyDrivers, eq(companyDrivers.id, driverTimeOff.driverId))
    .innerJoin(companies, eq(companies.id, driverTimeOff.companyId))
    .where(
      and(
        eq(companies.status, 'active'),
        eq(sql`${driverTimeOff.date}::text`, tomorrowYmd),
        // Defensive: el driver no fue borrado entre el INSERT y el cron
        // (la FK ON DELETE CASCADE ya borra, pero por si acaso).
        eq(companyDrivers.status, 'Activo'),
      ),
    )
    .orderBy(companies.id, companyDrivers.lastName);

  if (rows.length === 0) {
    return { companiesNotified: 0, totalDrivers: 0 };
  }

  // Agrupar por empresa.
  type DriverRow = typeof rows[number];
  const byCompany = new Map<number, { companyName: string; drivers: DriverRow[] }>();
  for (const r of rows) {
    const bucket = byCompany.get(r.companyId) ?? { companyName: r.companyName, drivers: [] };
    bucket.drivers.push(r);
    byCompany.set(r.companyId, bucket);
  }

  // Para cada empresa con entradas, mandar una notif por admin.
  // Si hay 5 admins y 3 conductores libres, mandamos 5 notifs con
  // el mismo body (cada admin recibe su propia copia).
  let totalDrivers = 0;
  for (const [companyId, bucket] of byCompany) {
    const driverList = bucket.drivers
      .map((d) => `${d.driverFirstName} ${d.driverLastName} (${d.driverCode})`)
      .join(', ');
    const body = bucket.drivers.length === 1
      ? `Mañana (${tomorrowYmd}) está libre: ${driverList}.`
      : `Mañana (${tomorrowYmd}) están libres ${bucket.drivers.length} conductores: ${driverList}.`;

    try {
      await notifyAdmins(companyId, {
        kind: 'driver_time_off_reminder',
        title: 'Conductores libres mañana',
        body,
        payload: {
          date:         tomorrowYmd,
          companyId,
          companyName:  bucket.companyName,
          driverCount:  bucket.drivers.length,
          drivers: bucket.drivers.map((d) => ({
            id:        d.driverId,
            firstName: d.driverFirstName,
            lastName:  d.driverLastName,
            code:      d.driverCode,
            reason:    d.reason,
          })),
        },
      });
      totalDrivers += bucket.drivers.length;
    } catch (err) {
      console.warn(
        `[cron:driver-time-off-reminder] notif falló para company ${companyId}:`,
        (err as Error).message,
      );
      // No relanzo: si falla una empresa, las demás siguen.
    }
  }

  return { companiesNotified: byCompany.size, totalDrivers };
}

/**
 * Registra el cron. Idempotente (múltiples llamadas = mismo schedule).
 * Activado por env var `DRIVER_TIME_OFF_REMINDER_CRON_ENABLED=true`.
 */
export function startDriverTimeOffReminderCron() {
  if (started) return;
  if (process.env.DRIVER_TIME_OFF_REMINDER_CRON_ENABLED !== 'true') {
    console.log('[cron] DRIVER_TIME_OFF_REMINDER_CRON_ENABLED != true → cron apagado.');
    return;
  }
  started = true;

  // Diario 19:00 hora Ecuador.
  // node-cron usa la TZ del env cuando se pasa el 3er argumento.
  cron.schedule('0 19 * * *', () => {
    void runDriverTimeOffReminder().then((r) => {
      if (r.companiesNotified > 0) {
        console.log(
          `[cron:driver-time-off-reminder] notif enviada: ${r.companiesNotified} empresas, ${r.totalDrivers} conductores.`,
        );
      }
    });
  }, { timezone: 'America/Guayaquil' });

  console.log('[cron] driver-time-off-reminder registrado (diario 19:00 EC).');
}
