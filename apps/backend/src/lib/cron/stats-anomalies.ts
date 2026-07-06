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
import { notifyAdmins } from '../notification-service';

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
  // Si no se pasa companyId, iteramos todas las empresas activas.
  // jun 2026 — el filtro es por `companies.status = 'active'`, NO por
  // `isActive` (esa columna NO existe en `companies`, vive en `platform_plans`).
  // Antes había un `eq(companies.isActive, true)` que generaba SQL inválido
  // (`where = $1`) porque Drizzle no encuentra la columna y serializa el lado
  // izquierdo como string vacío.
  const target = companyId
    ? [{ id: companyId }]
    : await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.status, 'active'));

  let totalInserted = 0, totalUpdated = 0, totalResolved = 0;

  for (const c of target) {
    const detected = await detectAllAnomalies({ companyId: c.id });
    const result = await persistAnomalies(c.id, detected);
    totalInserted += result.inserted;
    totalUpdated  += result.updated;
    totalResolved += result.resolved;

    // Si se detectaron anomalías NUEVAS, notificar a los admins.
    // Una sola notif por empresa con el total — no por cada anomalía
    // (el detector puede generar varias del mismo tipo).
    if (result.inserted > 0) {
      try {
        // Tomar una muestra representativa (la más severa o la primera) para
        // el payload. La campanita muestra el título + el contador.
        const sample = detected[0];
        await notifyAdmins(c.id, {
          kind:    'anomaly_detected',
          title:   `${result.inserted} anomalía${result.inserted !== 1 ? 's' : ''} nueva${result.inserted !== 1 ? 's' : ''} detectada${result.inserted !== 1 ? 's' : ''}`,
          body:    sample
            ? `Ej: ${sample.tipo ?? 'consumo'} — ${sample.descripcion ?? 'ver detalles en Estadísticas'}.`
            : 'Revisa la pestaña de Anomalías para ver los detalles.',
          payload: {
            count: result.inserted,
            sampleTipo: sample?.tipo ?? null,
            anomalyIds: detected.slice(0, 5).map((d: { id?: string | number }) => d.id).filter(Boolean),
          },
        });
      } catch (err) {
        console.warn('[cron] stats-anomalies notify falló (no crítico):', (err as Error).message);
      }
    }
  }

  return {
    companyId: companyId ?? 0,
    inserted: totalInserted,
    updated: totalUpdated,
    resolved: totalResolved,
  };
}
