import 'dotenv/config';
import { createServer } from 'http';
import app from './app';
import { attachWebSocket } from './services/websocket';
import { startMaintenanceCron } from './lib/cron/maintenance';

const PORT = process.env.PORT || 5000;

const server = createServer(app);
attachWebSocket(server);

// Cron jobs (opcional, se apaga con MAINTENANCE_CRON_ENABLED != true)
startMaintenanceCron();

server.listen(PORT, () => {
  console.log(`✓ Backend corriendo en puerto ${PORT}`);
  console.log(`✓ API: http://localhost:${PORT}`);
  console.log(`✓ Health: http://localhost:${PORT}/health`);
  console.log(`✓ WebSocket: ws://localhost:${PORT}/ws`);
});