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
import { startStatsAnomaliesCron } from './lib/cron/stats-anomalies';
import { startStatsCleanupCron } from './lib/cron/cleanup';
import { startScheduledJobs as startJarvisWeeklySummary } from './scheduled/weekly-summary';

const PORT = process.env.PORT || 5000;

const server = createServer(app);
attachWebSocket(server);

// Cron jobs (opcional, se apaga con MAINTENANCE_CRON_ENABLED != true)
startMaintenanceCron();
startStatsAnomaliesCron();
startStatsCleanupCron();

// Resumen semanal Jarvis (lunes 8am EC). Se puede apagar con
// JARVIS_WEEKLY_SUMMARY_ENABLED != true.
if (process.env.JARVIS_WEEKLY_SUMMARY_ENABLED !== 'false') {
  startJarvisWeeklySummary();
}

server.listen(PORT, () => {
  console.log(`✓ Backend corriendo en puerto ${PORT} (TZ=${process.env.TZ})`);
  console.log(`✓ API: http://localhost:${PORT}`);
  console.log(`✓ Health: http://localhost:${PORT}/health`);
  console.log(`✓ WebSocket: ws://localhost:${PORT}/ws`);
});