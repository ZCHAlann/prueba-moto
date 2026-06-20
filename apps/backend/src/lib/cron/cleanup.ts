// lib/cron/cleanup.ts
// ─────────────────────────────────────────────────────────────────────
// Cron de limpieza nocturna (03:00).
//
//   - Purga `company_stats_insights_cache` > 7 días
//     (el cache tiene TTL 6h; esto limpia filas que ya expiraron).
//   - Purga `company_stats_anomalies` > 90 días.
//   - Purga `company_stats_insights_cache` huérfanas (sin cache hit en 7d).
//
// Solo se activa si `STATS_CLEANUP_CRON_ENABLED === 'true'`.
// ─────────────────────────────────────────────────────────────────────

import cron from 'node-cron';
import { lt, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyStatsInsightsCache, companyStatsAnomalies } from '../../db/schema/operational';

const INSIGHTS_RETENTION_DAYS = 7;
const ANOMALIES_RETENTION_DAYS = 90;

let started = false;

export function startStatsCleanupCron() {
  if (started) return;
  if (process.env.STATS_CLEANUP_CRON_ENABLED !== 'true') {
    console.log('[cron] STATS_CLEANUP_CRON_ENABLED != true → cron apagado.');
    return;
  }
  started = true;

  // Diario 03:00 (hora local del servidor)
  cron.schedule('0 3 * * *', async () => {
    try {
      const result = await runCleanup();
      console.log(`[cron] stats-cleanup: purgados ${result.insights} insights y ${result.anomalies} anomalías.`);
    } catch (err) {
      console.error('[cron] stats-cleanup error:', err);
    }
  });

  console.log(`[cron] stats-cleanup registrado (diario 03:00). Retención: insights=${INSIGHTS_RETENTION_DAYS}d, anomalías=${ANOMALIES_RETENTION_DAYS}d.`);
}

/**
 * Ejecuta el cleanup manualmente. Útil para el endpoint de admin.
 */
export async function runCleanup(): Promise<{ insights: number; anomalies: number }> {
  const insightsCutoff = new Date();
  insightsCutoff.setDate(insightsCutoff.getDate() - INSIGHTS_RETENTION_DAYS);

  const anomaliesCutoff = new Date();
  anomaliesCutoff.setDate(anomaliesCutoff.getDate() - ANOMALIES_RETENTION_DAYS);

  // 1) Purga insights_cache > 7d
  const insightsResult = await db
    .delete(companyStatsInsightsCache)
    .where(lt(companyStatsInsightsCache.createdAt, insightsCutoff))
    .returning({ id: companyStatsInsightsCache.id });

  // 2) Purga anomalías resueltas > 90d (mantenemos las activas aunque sean viejas,
  //    porque pueden ser relevantes para el usuario)
  const anomaliesResult = await db
    .delete(companyStatsAnomalies)
    .where(sql`${companyStatsAnomalies.detectadoEn} < ${anomaliesCutoff.toISOString()}::timestamp AND ${companyStatsAnomalies.metadata}->>'resolvedAt' IS NOT NULL`)
    .returning({ id: companyStatsAnomalies.id });

  return {
    insights:  insightsResult.length,
    anomalies: anomaliesResult.length,
  };
}
