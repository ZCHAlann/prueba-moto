// lib/maintenance-rescheduler.ts
//
// Reagendamiento automático al completar un mantenimiento.
// Reglas (cadenceKind):
//   - none      → no se reagenda.
//   - weekly    → +7 días desde executedAt.
//   - days(N)   → +N días desde executedAt.
//   - monthly   → +30 días desde executedAt.
//   - km_based(K) → el `nextTriggerKm` se actualiza con el odometerKm + K;
//     el nuevo mantenimiento queda Programado pero el trigger de aviso
//     depende del endpoint de odómetro (lib/odometer-trigger.ts).
//
// El nuevo mantenimiento:
//   - status='Programado'
//   - type heredado del original
//   - category heredada
//   - workshop_id heredado
//   - parent_id = id del mantenimiento original (cadena trazable)
//   - total_cost = 0 (vacío hasta que se complete)
//   - next_trigger_km actualizado si aplica
//
// Se notifica al admin (maintenance_scheduled) y al conductor si está
// asignado al vehículo (futuro: ownership del activo).

import { db } from '../db/client';
import { companyMaintenanceRecords } from '../db/schema/operational';
import { eq, and, inArray } from 'drizzle-orm';
import { notify, notifyAdmins } from './notification-service';

interface RescheduleArgs {
  completedId: number;
  companyId:   number;
  executedAt:  Date;
  odometerKm:  number | null;
}

export async function rescheduleCompletedMaintenance(args: RescheduleArgs): Promise<number | null> {
  const { completedId, companyId, executedAt } = args;

  const [original] = await db
    .select()
    .from(companyMaintenanceRecords)
    .where(and(
      eq(companyMaintenanceRecords.id, completedId),
      eq(companyMaintenanceRecords.companyId, companyId),
    ))
    .limit(1);
  if (!original) return null;

  const cadence = original.cadenceKind;
  if (cadence === 'none') return null;

  let nextDate: Date;
  let nextTriggerKm: number | null = original.nextTriggerKm ?? null;

  switch (cadence) {
    case 'weekly':
      nextDate = new Date(executedAt);
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'days': {
      const n = original.cadenceValue ?? 30;
      nextDate = new Date(executedAt);
      nextDate.setDate(nextDate.getDate() + n);
      break;
    }
    case 'monthly':
      nextDate = new Date(executedAt);
      nextDate.setDate(nextDate.getDate() + 30);
      break;
    case 'km_based': {
      const k = original.cadenceValue ?? 5000;
      const baseKm = args.odometerKm ?? original.odometerKm ?? 0;
      nextTriggerKm = baseKm + k;
      // El next scheduled se programa "en 1 mes" como placeholder; el trigger
      // real es por km. Si el km no se cruza en mucho tiempo, el job diario
      // avisará.
      nextDate = new Date(executedAt);
      nextDate.setDate(nextDate.getDate() + 30);
      break;
    }
    default:
      return null;
  }

  const [next] = await db
    .insert(companyMaintenanceRecords)
    .values({
      companyId:      original.companyId,
      assetId:        original.assetId,
      workshopId:     original.workshopId,
      type:           original.type,
      status:         'Programado',
      category:       original.category,
      title:          original.title,
      description:    original.description,
      odometerKm:     null,
      cadenceKind:    original.cadenceKind,
      cadenceValue:   original.cadenceValue,
      nextTriggerKm,
      scheduledFor:   nextDate,
      parentId:       original.id,
      createdBy:      original.createdBy,
    })
    .returning();

  // Notificar al admin y al usuario que creó el original (si es distinto de admin)
  await notifyAdmins(companyId, {
    kind:  'maintenance_scheduled',
    title: `Mantenimiento reagendado: ${original.title ?? original.category}`,
    body:  `Próxima ejecución: ${nextDate.toLocaleDateString('es-CO')}`,
    payload: { maintenanceId: next.id, parentId: original.id, assetId: original.assetId },
  });

  // Si el creador NO es admin, notificarlo también
  if (original.createdBy) {
    const creatorId = original.createdBy;
    // Heurística: si el rol es admin/owner, notifyAdmins ya lo cubrió. Si no,
    // lo notificamos igual (puede ser un supervisor o un operador que agendó).
    await notify({
      companyId,
      userId:    creatorId,
      kind:      'maintenance_scheduled',
      title:     `Mantenimiento reagendado: ${original.title ?? original.category}`,
      body:      `Próxima ejecución: ${nextDate.toLocaleDateString('es-CO')}`,
      payload:   { maintenanceId: next.id, parentId: original.id, assetId: original.assetId },
    });
  }

  return next.id;
}

/**
 * Job diario: notifica mantenimientos Programados cuya `scheduledFor` ya pasó
 * por más de `graceHours` (default 24h). Marca la fila con un payload
 * `notifiedOverdue: true` para no notificar 2 veces el mismo día.
 */
export async function notifyOverdueProgrammed(graceHours = 24): Promise<number> {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - graceHours);

  const overdue = await db
    .select()
    .from(companyMaintenanceRecords)
    .where(and(
      eq(companyMaintenanceRecords.status, 'Programado'),
    ));

  let count = 0;
  for (const m of overdue) {
    if (m.scheduledFor > cutoff) continue;
    if ((m.payload as any)?.notifiedOverdue) continue;

    await notifyAdmins(m.companyId, {
      kind:   'maintenance_due',
      title:  `Mantenimiento vencido: ${m.title ?? m.category}`,
      body:   `Programado para ${m.scheduledFor.toLocaleDateString('es-CO')}`,
      payload: { maintenanceId: m.id, assetId: m.assetId },
    });
    // Marcar como notificado (sin columna extra, usamos el payload jsonb)
    await db
      .update(companyMaintenanceRecords)
      .set({ payload: { ...(m.payload as any), notifiedOverdue: true } })
      .where(eq(companyMaintenanceRecords.id, m.id));
    count++;
  }
  return count;
}

/**
 * Job cada 15 min: revisa mantenimientos km_based cuyo `nextTriggerKm` ya
 * fue cruzado por la última lectura de odómetro. Los marca como
 * `PendienteAtencion` y notifica.
 */
export async function sweepKmBasedTriggers(companyId: number): Promise<number> {
  // Implementación lazy: importamos dinámicamente para no crear ciclo.
  const { companyOdometerReadings } = await import('../db/schema/operational');
  const { desc } = await import('drizzle-orm');

  const triggers = await db
    .select()
    .from(companyMaintenanceRecords)
    .where(and(
      eq(companyMaintenanceRecords.status, 'Programado'),
      eq(companyMaintenanceRecords.cadenceKind, 'km_based'),
    ));

  let count = 0;
  for (const t of triggers) {
    if (t.nextTriggerKm == null) continue;

    const [lastReading] = await db
      .select({ km: companyOdometerReadings.km })
      .from(companyOdometerReadings)
      .where(and(
        eq(companyOdometerReadings.assetId, t.assetId),
        eq(companyOdometerReadings.companyId, companyId),
      ))
      .orderBy(desc(companyOdometerReadings.takenAt))
      .limit(1);

    if (!lastReading) continue;
    if (lastReading.km < t.nextTriggerKm) continue;

    await db
      .update(companyMaintenanceRecords)
      .set({ status: 'PendienteAtencion' })
      .where(eq(companyMaintenanceRecords.id, t.id));

    await notifyAdmins(companyId, {
      kind:  'maintenance_overshoot_km',
      title: `Mantenimiento por km pendiente: ${t.title ?? t.category}`,
      body:  `El vehículo llegó a ${lastReading.km} km (umbral ${t.nextTriggerKm})`,
      payload: { maintenanceId: t.id, assetId: t.assetId, currentKm: lastReading.km, thresholdKm: t.nextTriggerKm },
    });
    count++;
  }
  return count;
}
