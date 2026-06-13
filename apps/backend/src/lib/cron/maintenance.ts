// lib/cron/maintenance.ts
//
// Tres jobs de mantenimiento. Solo se registran si la variable de entorno
// `MAINTENANCE_CRON_ENABLED` está en 'true' (en local por defecto; en
// serverless/Vercel se desactiva).
//
//  - sweep overdue (cada hora)  → notifica Programados vencidos
//  - sweep km_based (cada 15 min) → revisa umbral por km
//  - monthly reschedule (diario 06:00) → reagenda cambios de aceite mensuales

import cron from 'node-cron';
import {
  notifyOverdueProgrammed,
  sweepKmBasedTriggers,
} from '../maintenance-rescheduler';
import { db } from '../../db/client';
import { companyMaintenanceRecords, companyAssets } from '../../db/schema/operational';
import { and, eq, isNotNull } from 'drizzle-orm';
import { rescheduleCompletedMaintenance } from '../maintenance-rescheduler';

let started = false;

export function startMaintenanceCron() {
  if (started) return;
  if (process.env.MAINTENANCE_CRON_ENABLED !== 'true') {
    console.log('[cron] MAINTENANCE_CRON_ENABLED != true → cron apagado.');
    return;
  }
  started = true;

  // 1) Cada hora: notificar Programados vencidos
  cron.schedule('0 * * * *', async () => {
    try {
      const n = await notifyOverdueProgrammed(24);
      if (n > 0) console.log(`[cron] overdue: notificadas ${n} mantenimientos vencidos.`);
    } catch (err) {
      console.error('[cron] overdue error:', err);
    }
  });

  // 2) Cada 15 min: revisar km_based
  cron.schedule('*/15 * * * *', async () => {
    try {
      // Agrupamos por empresa: una query por cada companyId distinto con km_based activos
      const companies = await db
        .selectDistinct({ companyId: companyMaintenanceRecords.companyId })
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.cadenceKind, 'km_based'),
          eq(companyMaintenanceRecords.status, 'Programado'),
        ));
      let total = 0;
      for (const c of companies) {
        if (c.companyId) total += await sweepKmBasedTriggers(c.companyId);
      }
      if (total > 0) console.log(`[cron] km_based: ${total} mantenimientos pasaron a PendienteAtencion.`);
    } catch (err) {
      console.error('[cron] km_based error:', err);
    }
  });

  // 3) Diario 06:00: reagendar mantenimientos mensuales que aún no tienen un
  //    próximo reagendamiento (defensa por si la lógica on-complete falló).
  cron.schedule('0 6 * * *', async () => {
    try {
      const monthly = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.cadenceKind, 'monthly'),
          eq(companyMaintenanceRecords.status, 'Completado'),
        ));
      let count = 0;
      for (const m of monthly) {
        if (!m.companyId || !m.completedAt) continue;
        // ¿ya tiene un hijo programado?
        // Lo verificamos por parent_id. Si no, reagendamos.
        // (Chequeo liviano: un solo SELECT)
        // Para no inflar, simplemente delegamos al rescheduler con flag:
        const newId = await rescheduleCompletedMaintenance({
          completedId: m.id,
          companyId:   m.companyId,
          executedAt:  m.completedAt,
          odometerKm:  m.odometerKm,
        });
        if (newId) count++;
      }
      if (count > 0) console.log(`[cron] monthly: ${count} mantenimientos mensuales reagendados.`);
    } catch (err) {
      console.error('[cron] monthly error:', err);
    }
  });

  console.log('[cron] maintenance jobs registrados (overdue hourly, km_based /15min, monthly daily 06:00).');
}
