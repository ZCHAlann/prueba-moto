// lib/cron/maintenanceStatusCron.ts
import cron from 'node-cron';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyAssets } from '../../db/schema/operational';
import { syncAssetMaintenanceStatus } from '../maintenanceStatusSync';
import { notifyAdmins } from '../notification-service';

let started = false;

export function startMaintenanceStatusCron() {
  if (started) return;
  if (process.env.MAINTENANCE_CRON_ENABLED !== 'true') {
    console.log('[cron] MAINTENANCE_CRON_ENABLED != true → maintenanceStatusCron apagado.');
    return;
  }
  started = true;

  cron.schedule('5 0 * * *', async () => {
    try {
      const assets = await db
        .select({ id: companyAssets.id, companyId: companyAssets.companyId, name: companyAssets.name, plate: companyAssets.plate })
        .from(companyAssets);

      let changed = 0;
      // Acumular cambios por empresa para notificar en resumen (no spameamos
      // un toast por cada vehículo).
      const changesByCompany = new Map<number, Array<{ assetId: number; label: string; newStatus: string | null; previousStatus: string | null }>>();

      for (const a of assets) {
        try {
          const result = await syncAssetMaintenanceStatus(a.id, a.companyId);
          if (result.changed) {
            changed++;
            const arr = changesByCompany.get(a.companyId) ?? [];
            arr.push({
              assetId: a.id,
              label: a.plate ? `${a.name} (${a.plate})` : a.name,
              newStatus: result.newStatus,
              previousStatus: result.previousStatus,
            });
            changesByCompany.set(a.companyId, arr);
          }
        } catch (err) {
          console.error(`[cron] maintenanceStatusCron error en asset ${a.id}:`, err);
        }
      }

      // Notificar a los admins de cada empresa con los cambios.
      for (const [companyId, list] of changesByCompany) {
        if (!list.length) continue;
        try {
          await notifyAdmins(companyId, {
            kind:    'system',
            title:   `${list.length} vehículo${list.length !== 1 ? 's' : ''} cambió de estado`,
            body:    `Sincronización automática diaria: ${list.slice(0, 3).map((c) => c.label).join(', ')}${list.length > 3 ? '…' : ''}.`,
            payload: {
              reason:    'maintenanceStatusSync',
              changes:   list,
              changedAt: new Date().toISOString(),
            },
          });
        } catch (err) {
          console.warn('[cron] maintenanceStatusCron notify falló (no crítico):', (err as Error).message);
        }
      }

      console.log(`[cron] maintenanceStatusCron: ${changed}/${assets.length} vehículos con cambio de status.`);
    } catch (err) {
      console.error('[cron] maintenanceStatusCron error general:', err);
    }
  }, { timezone: 'America/Guayaquil' });

  console.log('[cron] maintenanceStatusCron registrado (diario 00:05 EC).');
}