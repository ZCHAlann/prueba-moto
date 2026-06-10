import 'dotenv/config';
import { createServer } from 'http';
import app from './app';
import { attachWebSocket } from './services/websocket';

const PORT = process.env.PORT || 5000;

const server = createServer(app);
attachWebSocket(server);

server.listen(PORT, () => {
  console.log(`✓ Backend corriendo en puerto ${PORT}`);
  console.log(`✓ API: http://localhost:${PORT}`);
  console.log(`✓ Health: http://localhost:${PORT}/health`);
  console.log(`✓ WebSocket: ws://localhost:${PORT}/ws`);
});