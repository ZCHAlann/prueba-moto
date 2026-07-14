import 'dotenv/config';

// ── Forzar TZ=UTC en todo el proceso Node ────────────────────────────────
// Sin esto, `new Date()` devuelve la hora LOCAL del server (que puede
// ser America/Guayaquil u otra), y los INSERTs con `defaultNow()` o
// `new Date()` guardan timestamps sin TZ interpretados como UTC por
// Postgres → al renderizar en EC se ven 5 horas corridas.
//
// Con TZ=UTC:
//   - `new Date()` siempre devuelve UTC.
//   - `now()` en Postgres devuelve UTC (el server TZ es UTC).
//   - Los timestamps quedan consistentes sin importar la TZ del SO.
//
// El frontend convierte a America/Guayaquil con el helper `fmtDateTimeEc`.
process.env.TZ = 'UTC';

import { createServer } from 'http';
import app from './app';
import { attachWebSocket } from './services/websocket';
import { startMaintenanceCron } from './lib/cron/maintenance';
import { startMaintenanceOverdueCron, runOverdueMaintenance } from './lib/cron/maintenance-overdue';
import { startChecklistOverdueCron, runOverdueChecklists } from './lib/cron/checklist-overdue';
import { startAlertRemindersCron } from './lib/cron/alert-reminders';
import { startMaintenanceStatusCron } from './lib/cron/maintenanceStatusCron';
import { startStatsAnomaliesCron } from './lib/cron/stats-anomalies';
import { startStatsCleanupCron } from './lib/cron/cleanup';
import { startScheduledJobs as startJarvisWeeklySummary } from './scheduled/weekly-summary';
import { startPettyCashPeriodResetCron, startPettyCashLimitCheckCron } from './lib/cron/petty-cash';
import { seedPlatformCatalog } from './lib/platform-seed';

const PORT = process.env.PORT || 5000;

const server = createServer(app);
attachWebSocket(server);

// Seed del catálogo de módulos + 4 planes (Starter/Pro/Business/Enterprise).
// Idempotente: corre las veces que sea. No bloquea el arranque si falla.
//void seedPlatformCatalog()
  //.then(() => console.log('✓ Catalog seed ready'))
  //.catch((err) => console.warn('[boot] seed platform catalog failed:', err?.message ?? err));

// Cron jobs (opcional, se apaga con MAINTENANCE_CRON_ENABLED != true)
startMaintenanceCron();
startMaintenanceStatusCron();
startStatsAnomaliesCron();
startStatsCleanupCron();

// Detección de mantenimientos atrasados (diario 00:05 EC).
// Se apaga con MAINTENANCE_OVERDUE_CRON_ENABLED != true.
startMaintenanceOverdueCron();

// Detección de checklists vencidos (diario 00:10 EC).
// Se apaga con CHECKLIST_OVERDUE_CRON_ENABLED != true.
startChecklistOverdueCron();

// jul 2026 v8 — Re-envío periódico de alertas operativas (cada 5 min).
// Se apaga con ALERT_REMINDERS_CRON_ENABLED != true.
startAlertRemindersCron();

// (jul 2026 — el cron invoice-due-status fue removido: el módulo Finanzas no
// usa modelo CxP contable. Las columnas cxp_status/due_date ya no existen.)

// Sweep inicial best-effort: si por algún motivo el cron diario no se
// ejecutó (deployment, cold start), corremos una pasada al arrancar.
void (async () => {
  try {
    const n = await runOverdueMaintenance();
    if (n > 0) console.log(`[startup] overdue: ${n} mantenimientos marcados como Atrasado en el sweep inicial.`);
  } catch (err) {
    console.warn('[startup] overdue: sweep inicial falló (no crítico):', (err as Error).message);
  }

  // Sweep inicial de checklists vencidos (idempotente).
  try {
    const m = await runOverdueChecklists();
    if (m > 0) console.log(`[startup] checklist-overdue: ${m} checklists persistidos como Vencido en el sweep inicial.`);
  } catch (err) {
    // jun 2026 — logueamos cause también porque Drizzle envuelve el error
    // y el `message` queda genérico ("Failed query: …") sin el real.
    const e = err as Error & { cause?: { message?: string } };
    console.warn(
      '[startup] checklist-overdue: sweep inicial falló (no crítico):',
      e?.message ?? String(err),
      e?.cause?.message ? 'cause=' + e.cause.message : '',
    );
  }
})();

// Resumen semanal Jarvis (lunes 8am EC). Se puede apagar con
// JARVIS_WEEKLY_SUMMARY_ENABLED != true.
if (process.env.JARVIS_WEEKLY_SUMMARY_ENABLED !== 'false') {
  startJarvisWeeklySummary();
}

// jul 2026 — Caja Chica: period reset (diario 00:30 EC) + chequeo de límite
// (cada 1h). Se activan con PETTY_CASH_CRON_ENABLED=true.
startPettyCashPeriodResetCron();
startPettyCashLimitCheckCron();

server.listen(PORT, () => {
  console.log(`✓ Backend corriendo en puerto ${PORT} (TZ=${process.env.TZ})`);
  console.log(`✓ API: http://localhost:${PORT}`);
  console.log(`✓ Health: http://localhost:${PORT}/health`);
  console.log(`✓ WebSocket: ws://localhost:${PORT}/ws`);
});