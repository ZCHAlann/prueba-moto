// lib/cron/stats-anomalies.ts
// ─────────────────────────────────────────────────────────────────────
// Cron job: detecta y persiste anomalías de Estadísticas cada 30 min.
//
// Solo se activa si `STATS_ANOMALIES_CRON_ENABLED === 'true'`. Por
// defecto OFF para que en local no se acumulen sweeps innecesarios.
//
// En el frontend, el tab "Historial" se beneficia de este job para
// mostrar anomalías detectadas en las últimas 24h sin tener que
// recalcular en cada request.
// ─────────────────────────────────────────────────────────────────────

import cron from 'node-cron';
import { eq, and, gte } from 'drizzle-orm';
import { db } from '../../db/client';
import { companies } from '../../db/schema/platform';
import { detectAllAnomalies } from '../stats-anomalies';
import { persistAnomalies } from '../stats-anomalies-persist';

let started = false;

export function startStatsAnomaliesCron() {
  if (started) return;
  if (process.env.STATS_ANOMALIES_CRON_ENABLED !== 'true') {
    console.log('[cron] STATS_ANOMALIES_CRON_ENABLED != true → cron apagado.');
    return;
  }
  started = true;

  // Cada 30 minutos
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await runSweep();
      console.log(`[cron] stats-anomalies: insertadas=${result.inserted} actualizadas=${result.updated} resueltas=${result.resolved}`);
    } catch (err) {
      console.error('[cron] stats-anomalies error:', err);
    }
  });

  console.log('[cron] stats-anomalies registrado (cada 30 min).');
}

/**
 * Ejecuta un sweep manual. Útil para:
 *   - El endpoint POST /admin/estadisticas/redetectar
 *   - Tests
 */
export async function runSweep(companyId?: number): Promise<{ companyId: number; inserted: number; updated: number; resolved: number }> {
  // Si no se pasa companyId, iteramos todas las empresas activas
  const target = companyId
    ? [{ id: companyId }]
    : await db.select({ id: companies.id }).from(companies).where(eq(companies.isActive, true));

  let totalInserted = 0, totalUpdated = 0, totalResolved = 0;

  for (const c of target) {
    const detected = await detectAllAnomalies({ companyId: c.id });
    const result = await persistAnomalies(c.id, detected);
    totalInserted += result.inserted;
    totalUpdated  += result.updated;
    totalResolved += result.resolved;
  }

  return {
    companyId: companyId ?? 0,
    inserted: totalInserted,
    updated: totalUpdated,
    resolved: totalResolved,
  };
}
