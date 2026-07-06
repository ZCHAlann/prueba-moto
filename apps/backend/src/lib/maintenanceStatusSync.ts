// lib/maintenanceStatusSync.ts
import { eq, and, ne, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { companyAssets, companyMaintenanceRecords } from '../db/schema/operational';

// Estados de mantenimiento que NO cuentan como "activo hoy".
// Un mantenimiento Completado o Cancelado no debe mantener el vehículo
// bloqueado, aunque su scheduledFor sea la fecha de hoy.
const INACTIVE_MAINTENANCE_STATUSES = ['Completado', 'Cancelado'] as const;

/**
 * Sincroniza el status de UN vehículo según si tiene mantenimientos
 * activos programados para HOY (zona horaria Ecuador).
 *
 * Reglas (confirmadas con negocio):
 *  - Cualquier mantenimiento con scheduledFor = hoy y status distinto de
 *    Completado/Cancelado activa 'En mantenimiento', sin importar si es
 *    'Programado', 'En curso', 'Atrasado', etc.
 *  - El mantenimiento manda: si el vehículo estaba 'Fuera de servicio'
 *    manualmente, se sobrescribe a 'En mantenimiento' igual.
 *  - Al terminar TODOS los mantenimientos activos de hoy, se restaura el
 *    status EXACTO que tenía antes (guardado en statusBeforeMaintenance),
 *    no un valor fijo.
 *  - Si hay 2+ mantenimientos el mismo día, el vehículo permanece en
 *    'En mantenimiento' hasta que el ÚLTIMO se complete/cancele (esto
 *    sale gratis de la lógica: solo miramos "¿hay al menos uno activo
 *    hoy?", no cuál mantenimiento en particular disparó el cambio).
 */
export async function syncAssetMaintenanceStatus(
  assetId: number,
  companyId: number,
): Promise<{ changed: boolean; newStatus: string | null; previousStatus: string | null }> {
  const todayEc = getTodayInEcuador(); // 'YYYY-MM-DD' en America/Guayaquil

  const [asset] = await db
    .select()
    .from(companyAssets)
    .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
    .limit(1);
  if (!asset) return { changed: false, newStatus: null, previousStatus: null };

  const activeToday = await db
    .select({ id: companyMaintenanceRecords.id })
    .from(companyMaintenanceRecords)
    .where(
      and(
        eq(companyMaintenanceRecords.companyId, companyId),
        eq(companyMaintenanceRecords.assetId, assetId),
        // scheduledFor es timestamp — comparamos solo la fecha en tz Ecuador
        sql`(${companyMaintenanceRecords.scheduledFor} AT TIME ZONE 'America/Guayaquil')::date = ${todayEc}::date`,
        // Excluir estados que no cuentan como "activo hoy"
        sql`${companyMaintenanceRecords.status} NOT IN ('Completado', 'Cancelado')`,
      ),
    )
    .limit(1);

  const hasActiveToday = activeToday.length > 0;

  if (hasActiveToday) {
    // Entrar a mantenimiento — solo guardamos el status previo la PRIMERA
    // vez (si ya está en 'En mantenimiento', no pisamos el previo guardado
    // con 'En mantenimiento' mismo, o perderíamos el dato real de antes).
    if (asset.status !== 'En mantenimiento') {
      await db
        .update(companyAssets)
        .set({
          statusBeforeMaintenance: asset.status,
          status: 'En mantenimiento',
          updatedAt: new Date(),
        })
        .where(eq(companyAssets.id, assetId));
      return { changed: true, newStatus: 'En mantenimiento', previousStatus: asset.status };
    }
  } else {
    // Salir de mantenimiento — restaurar el status previo exacto.
    if (asset.status === 'En mantenimiento') {
      const restored = asset.statusBeforeMaintenance ?? 'Operativo';
      await db
        .update(companyAssets)
        .set({
          status: restored,
          statusBeforeMaintenance: null,
          updatedAt: new Date(),
        })
        .where(eq(companyAssets.id, assetId));
      return { changed: true, newStatus: restored, previousStatus: 'En mantenimiento' };
    }
  }

  return { changed: false, newStatus: asset.status, previousStatus: asset.status };
}

function getTodayInEcuador(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' }); // 'YYYY-MM-DD'
}