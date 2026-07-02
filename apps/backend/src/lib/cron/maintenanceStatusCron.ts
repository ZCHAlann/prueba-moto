// lib/cron/maintenanceStatusCron.ts
import cron from 'node-cron';
import { db } from '../../db/client';
import { companyAssets } from '../../db/schema/operational';
import { syncAssetMaintenanceStatus } from '../maintenanceStatusSync';

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
        .select({ id: companyAssets.id, companyId: companyAssets.companyId })
        .from(companyAssets);

      let changed = 0;
      for (const a of assets) {
        try {
          await syncAssetMaintenanceStatus(a.id, a.companyId);
          changed++;
        } catch (err) {
          console.error(`[cron] maintenanceStatusCron error en asset ${a.id}:`, err);
        }
      }
      console.log(`[cron] maintenanceStatusCron: ${changed}/${assets.length} vehículos revisados.`);
    } catch (err) {
      console.error('[cron] maintenanceStatusCron error general:', err);
    }
  }, { timezone: 'America/Guayaquil' });

  console.log('[cron] maintenanceStatusCron registrado (diario 00:05 EC).');
}