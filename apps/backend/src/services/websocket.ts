// ─────────────────────────────────────────────────────────────────────────────
// WebSocket server — broadcast en tiempo real para tablas reactivas
//   - ws://<host>/ws
//   - Auth: acepta token en query string (?token=<jwt>) o en cookie
//     `aplismart_token` (httpOnly). El server la lee y la verifica con
//     `verifyToken` y exige `scope === 'operacion'` + `companyId`.
//   - Rooms: implícitas por companyId (cada cliente lleva su companyId
//     pegado; `wsBroadcast` filtra).
//   - Tipos de mensaje: { type: 'checklist:created'|'checklist:updated'|'checklist:deleted', data: ... }
//
// Uso desde cualquier route handler:
//   import { wsBroadcast } from '../services/websocket';
//   wsBroadcast(companyId, { type: 'checklist:created', data: {...} });
// ─────────────────────────────────────────────────────────────────────────────

import { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from './auth.service';

type WsClient = WebSocket & {
  isAlive?: boolean;
  companyId?: number;
  userId?: number;
  role?: string;
};

const clients = new Set<WsClient>();
let wss: WebSocketServer | null = null;

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join('='));
  }
  return out;
}

export function attachWebSocket(server: HttpServer) {
  if (wss) return wss;

  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    //console.log('WS UPGRADE');
    //console.log(req.headers.cookie);
    //console.log(req.url);
    if (!req.url || !req.url.startsWith('/ws')) {
      socket.destroy();
      return;
    }

    // ── Auth ─ leer el token de query string o de la cookie httpOnly ──
    const url = new URL(req.url, 'http://localhost');
    let token = url.searchParams.get('token');
    if (!token) {
      const cookies = parseCookies(req.headers.cookie);
      token = cookies['aplismart_token'] ?? null;
    }
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const payload = verifyToken(token);
      if (!payload || payload.scope !== 'operacion' || !payload.companyId) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      wss!.handleUpgrade(req, socket, head, (ws) => {
        const client = ws as WsClient;
        client.isAlive = true;
        client.companyId = payload.companyId!;
        client.userId = Number(String(payload.sub).replace(/\D/g, '')) || undefined;
        client.role = payload.role;
        clients.add(client);

        // ── Mensaje de bienvenida ──
        try {
          client.send(JSON.stringify({
            type: 'hello',
            data: { companyId: client.companyId, userId: client.userId },
          }));
        } catch { /* noop */ }

        // ── Loop de keep-alive ──
        client.on('pong', () => { client.isAlive = true; });

        // ── Mensajes entrantes (ping opcional) ──
        client.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg?.type === 'ping') {
              client.send(JSON.stringify({ type: 'pong', t: Date.now() }));
            }
          } catch { /* ignore non-JSON */ }
        });

        // ── Cleanup ──
        client.on('close', () => { clients.delete(client); });
        client.on('error', () => { clients.delete(client); });
      });
    } catch (err) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  // ── Keep-alive cada 30s ──
  setInterval(() => {
    for (const c of clients) {
      if (c.isAlive === false) { c.terminate(); clients.delete(c); continue; }
      c.isAlive = false;
      try { c.ping(); } catch { /* noop */ }
    }
  }, 30_000).unref?.();

  return wss;
}

/**
 * Envía un mensaje a todos los clientes conectados cuya sesión pertenece a `companyId`.
 * - En producción, filtra adicionalmente por `targetUserId` si el evento es privado.
 * - Usa try/catch por cliente para no abortar el broadcast si uno falla.
 */
export function wsBroadcast(
  companyId: number,
  payload: { type: string; data?: unknown },
  options?: { targetUserId?: number },
) {
  const json = JSON.stringify(payload);
  for (const c of clients) {
    if (c.readyState !== c.OPEN) continue;
    if (c.companyId !== companyId) continue;
    if (options?.targetUserId && c.userId !== options.targetUserId) continue;
    try {
      c.send(json);
    } catch { /* ignore */ }
  }
}

/**
 * Número de clientes conectados por companyId — útil para debug.
 */
export function wsStats() {
  const byCompany = new Map<number, number>();
  for (const c of clients) {
    if (c.companyId) byCompany.set(c.companyId, (byCompany.get(c.companyId) ?? 0) + 1);
  }
  return { total: clients.size, byCompany: Object.fromEntries(byCompany) };
}
