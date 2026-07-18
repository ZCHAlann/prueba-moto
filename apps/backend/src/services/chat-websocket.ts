// services/chat-websocket.ts
// ─────────────────────────────────────────────────────────────────────────────
// WebSocket del chat interno entre personas.
//
// Endpoint: ws://<host>/ws/chat  (separado del /ws genérico de broadcasts).
//
// Auth: misma cookie `aplismart_token` que el resto del sistema. Reusa
// `verifyToken` de auth.service. Filtra por `scope === 'operacion'` y
// exige `companyId`.
//
// Rooms: una por `conversacion_id`. Cuando un cliente se une a una
// conversación, validamos que sea participante (de la DB), y lo metemos
// en el Set<ChatClient> de ese room. Broadcast `io.to('room:N')` se hace
// con un helper `chatBroadcastToRoom(convId, msg)`.
//
// Presencia (opción B del spec v2): mantenemos un Map<userId, Set<clientId>>
// para saber quién está online. Cuando un user se conecta/desconecta,
// broadcast `presence:actualizado` a las conversaciones donde participa.
//
// ─── EVENTOS SOPORTADOS ─────────────────────────────────────────────────────
//
//  cliente → servidor:
//    { type: 'conversacion:unirse', conversacion_id: number }
//    { type: 'mensaje:enviar', conversacion_id, contenido, tipo, adjunto_url? }
//    { type: 'mensaje:leido', mensaje_id: number }
//    { type: 'typing:start', conversacion_id }
//    { type: 'typing:stop',  conversacion_id }
//    { type: 'reaccion:agregar', mensaje_id, emoji }
//    { type: 'reaccion:quitar',  mensaje_id, emoji }
//
//  servidor → cliente:
//    { type: 'hello', data: { userId, companyId } }
//    { type: 'mensaje:recibido', data: { ... } }            ← nuevo mensaje en la conv
//    { type: 'mensaje:entregado', data: { mensaje_id, leido_por[], reacciones[] } }
//    { type: 'mensaje:leido:confirmado', data: { mensaje_id, usuario_id, leido_en } }
//    { type: 'typing:actualizado', data: { conversacion_id, usuario_id, escribiendo } }
//    { type: 'reaccion:actualizada', data: { mensaje_id, reacciones[] } }
//    { type: 'presence:actualizado', data: { user_id, online, last_seen_at? } }
//    { type: 'error', data: { code, message } }
// ─────────────────────────────────────────────────────────────────────────

import { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from './auth.service';
import { db } from '../db/client';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { conversaciones, participantes, mensajes, mensajesLeidos, mensajeReacciones } from '../db/schema';
import { notifyMany } from '../lib/notification-service';

// ─── Types ──────────────────────────────────────────────────────────────────

type ChatClient = WebSocket & {
  isAlive?: boolean;
  userId?: number;
  companyId?: number;
  rol?: string;
  email?: string;
  name?: string;
  /** Foto de perfil del user (jul 2026 v8.2). Se carga al conectar
   *  para no tener que ir a la DB en cada mensaje. */
  photoUrl?: string | null;
  /** Conversaciones a las que está subscripto (rooms). */
  joinedRooms: Set<number>;
};

// ─── State ──────────────────────────────────────────────────────────────────

const clientsByWs       = new Map<WebSocket, ChatClient>();        // lookup rápido
const clientsByUserId   = new Map<number, Set<ChatClient>>();      // para presence
const roomMembers       = new Map<number, Set<ChatClient>>();      // convId → clients

let wss: WebSocketServer | null = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function send(client: ChatClient, payload: object) {
  if (client.readyState !== client.OPEN) return;
  try {
    client.send(JSON.stringify(payload));
  } catch { /* ignore */ }
}

function sendError(client: ChatClient, code: string, message: string) {
  send(client, { type: 'error', data: { code, message } });
}

/**
 * Broadcast a TODOS los clientes de una conversación. Excluye al remitente
 * si se pasa `exceptClient` (útil para que el remitente no reciba su
 * propio mensaje — ya lo tiene optimistamente).
 */
function chatBroadcastToRoom(
  convId: number,
  payload: object,
  exceptClient?: ChatClient,
) {
  const room = roomMembers.get(convId);
  if (!room) return;
  const json = JSON.stringify(payload);
  for (const c of room) {
    if (c === exceptClient) continue;
    if (c.readyState !== c.OPEN) continue;
    try { c.send(json); } catch { /* ignore */ }
  }
}

/**
 * Devuelve los participantes de una conversación que NO son el user dado.
 * Usado para notificar a destinatarios.
 */
async function getOtherParticipantIds(convId: number, excludeUserId: number): Promise<number[]> {
  const rows = await db
    .select({ uid: participantes.usuarioId })
    .from(participantes)
    .where(and(
      eq(participantes.conversacionId, convId),
      // not equal — Drizzle no tiene `ne`, usamos `<>`
      sql`${participantes.usuarioId} <> ${excludeUserId}`,
    ));
  return rows.map(r => r.uid);
}

// ─── Validaciones ───────────────────────────────────────────────────────────

async function isParticipant(convId: number, userId: number): Promise<boolean> {
  // Usamos la API de bajo nivel (db.select) en vez de la relacional
  // (db.query.participantes.findFirst) porque no todas las tablas están
  // registradas en el relational query builder. La query equivalente
  // funciona igual y es más portable.
  const [row] = await db
    .select({ uid: participantes.usuarioId })
    .from(participantes)
    .where(and(
      eq(participantes.conversacionId, convId),
      eq(participantes.usuarioId, userId),
    ))
    .limit(1);
  return !!row;
}

// ─── Presencia ──────────────────────────────────────────────────────────────

function markUserOnline(client: ChatClient) {
  if (!client.userId) return;
  if (!clientsByUserId.has(client.userId)) {
    clientsByUserId.set(client.userId, new Set());
  }
  clientsByUserId.get(client.userId)!.add(client);
}

function markUserOffline(client: ChatClient) {
  if (!client.userId) return;
  const set = clientsByUserId.get(client.userId);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) {
    clientsByUserId.delete(client.userId);
    return true; // última conexión del user → broadcast offline
  }
  return false;
}

/** Devuelve si un user tiene al menos una conexión WS abierta. Útil para
 *  mostrar el dot verde de "online" en la lista de conversaciones y en
 *  el endpoint /chat/usuarios (mostrar dot al lado de cada user). */
export function isUserOnline(userId: number): boolean {
  return (clientsByUserId.get(userId)?.size ?? 0) > 0;
}

async function broadcastPresenceToJoinedRooms(client: ChatClient, online: boolean) {
  if (!client.userId) return;
  const lastSeenAt = online ? null : new Date();
  for (const convId of client.joinedRooms) {
    chatBroadcastToRoom(convId, {
      type: 'presence:actualizado',
      data: { user_id: client.userId, online, last_seen_at: lastSeenAt },
    });
  }
  // Persistir last_seen_at en participantes
  if (!online && client.joinedRooms.size > 0) {
    try {
      await db
        .update(participantes)
        .set({ lastSeenAt: new Date() })
        .where(and(
          inArray(participantes.conversacionId, Array.from(client.joinedRooms)),
          eq(participantes.usuarioId, client.userId),
        ));
    } catch (err) {
      console.warn('[chat-ws] no pude actualizar last_seen_at:', (err as Error).message);
    }
  }
}

// ─── Handlers de eventos ───────────────────────────────────────────────────

async function handleUnirse(client: ChatClient, convId: number) {
  if (!Number.isFinite(convId) || convId <= 0) {
    return sendError(client, 'BAD_CONV_ID', 'conversacion_id inválido');
  }
  if (!client.userId) return;

  const isPart = await isParticipant(convId, client.userId);
  if (!isPart) {
    return sendError(client, 'NOT_PARTICIPANT', 'No sos participante de esta conversación');
  }

  // Unirse al room
  if (!roomMembers.has(convId)) roomMembers.set(convId, new Set());
  roomMembers.get(convId)!.add(client);
  client.joinedRooms.add(convId);

  send(client, { type: 'conversacion:unirse:ok', data: { conversacion_id: convId } });

  // Broadcast presence al room
  chatBroadcastToRoom(convId, {
    type: 'presence:actualizado',
    data: { user_id: client.userId, online: true },
  }, client); // excluye al que se une
}

async function handleEnviarMensaje(
  client: ChatClient,
  payload: {
    conversacion_id: number;
    contenido?: string;
    tipo?: string;
    adjunto_url?: string;
    adjunto_mime_type?: string;
    adjunto_size_bytes?: number;
    /**
     * UUID generado por el cliente al crear el placeholder optimista.
     * El backend lo devuelve en `mensaje:recibido` y `mensaje:enviado:ack`
     * para que el cliente matchee placeholder ↔ real sin tener que
     * comparar por contenido (que se rompe cuando el user envía el
     * mismo texto dos veces — el placeholder #2 se matchea con el
     * mensaje #1, causando duplicación).
     * Opcional, pero recomendado.
     */
    client_msg_id?: string;
  },
) {
  if (!client.userId) return;
  const { conversacion_id, contenido, tipo = 'texto', adjunto_url, adjunto_mime_type, adjunto_size_bytes, client_msg_id } = payload;
  if (!conversacion_id) {
    return sendError(client, 'BAD_PAYLOAD', 'conversacion_id requerido');
  }
  if (!contenido?.trim() && !adjunto_url) {
    return sendError(client, 'EMPTY_MESSAGE', 'contenido o adjunto_url requerido');
  }

  // Validar participación
  if (!(await isParticipant(conversacion_id, client.userId))) {
    return sendError(client, 'NOT_PARTICIPANT', 'No sos participante de esta conversación');
  }

  // INSERT mensaje
  //
  // Idempotencia por client_msg_id (jul 2026 v8.2):
  //   Si el cliente ya envió un mensaje con este UUID (por ejemplo un
  //   retry después de un glitch de red), el INSERT va a fallar por el
  //   UNIQUE INDEX uq_mensajes_client_msg_id. En ese caso, devolvemos
  //   el mensaje existente en vez de crear un duplicado.
  let inserted: { id: number; publicId: string; creadoEn: Date } | null = null;
  if (client_msg_id) {
    // Primero, intentar encontrar el mensaje existente (caso retry).
    const [existing] = await db
      .select({ id: mensajes.id, publicId: mensajes.publicId, creadoEn: mensajes.creadoEn })
      .from(mensajes)
      .where(and(
        eq(mensajes.remitenteId, client.userId),
        eq(mensajes.clientMsgId, client_msg_id),
      ))
      .limit(1);
    if (existing) {
      inserted = existing;
    }
  }
  if (!inserted) {
    try {
      const [row] = await db
        .insert(mensajes)
        .values({
          conversacionId:    conversacion_id,
          remitenteId:       client.userId,
          contenido:         contenido ?? null,
          tipo,
          adjuntoUrl:        adjunto_url ?? null,
          adjuntoMimeType:   adjunto_mime_type ?? null,
          adjuntoSizeBytes:  adjunto_size_bytes ?? null,
          clientMsgId:       client_msg_id ?? null,
        })
        .returning({ id: mensajes.id, publicId: mensajes.publicId, creadoEn: mensajes.creadoEn });
      inserted = row ?? null;
    } catch (err) {
      return sendError(client, 'DB_ERROR', `No pude guardar el mensaje: ${(err as Error).message}`);
    }
  }
  if (!inserted) return sendError(client, 'DB_ERROR', 'INSERT no devolvió id');

  // UPDATE conversaciones.actualizado_en
  try {
    await db
      .update(conversaciones)
      .set({ actualizadoEn: new Date() })
      .where(eq(conversaciones.id, conversacion_id));
  } catch (err) {
    console.warn('[chat-ws] no pude bump actualizado_en:', (err as Error).message);
  }

  // Construir el mensaje completo para emitir
  const fullMessage = {
    id:                  inserted.id,
    public_id:           inserted.publicId,
    conversacion_id,
    remitente_id:        client.userId,
    remitente_nombre:    client.name ?? null,
    // FIX jul 2026 v8.2: foto del remitente para el avatar en cada
    // burbuja de mensaje.
    remitente_avatar_url: client.photoUrl ?? null,
    contenido:           contenido ?? null,
    tipo,
    adjunto_url:         adjunto_url ?? null,
    adjunto_mime_type:   adjunto_mime_type ?? null,
    adjunto_size_bytes:  adjunto_size_bytes ?? null,
    creado_en:           inserted.creadoEn.toISOString(),
    client_msg_id:       client_msg_id ?? null,
  };

  // Emit a la sala
  chatBroadcastToRoom(conversacion_id, { type: 'mensaje:recibido', data: fullMessage });

  // Ack al remitente
  send(client, {
    type: 'mensaje:enviado:ack',
    data: {
      mensaje_id:    inserted.id,
      public_id:     inserted.publicId,
      creado_en:     inserted.creadoEn.toISOString(),
      client_msg_id: client_msg_id ?? null,
    },
  });

  // `mensaje:entregado` a los demás clientes conectados en la sala
  // (les confirma que recibieron el mensaje, y le pasa al remitente la
  // info de que su mensaje fue entregado a los recipients online).
  const otrosConectados = Array.from(roomMembers.get(conversacion_id) ?? [])
    .filter(c => c !== client && c.userId && c.readyState === c.OPEN);
  if (otrosConectados.length > 0) {
    const entregadoPayload = {
      type: 'mensaje:entregado',
      data: {
        mensaje_id:      inserted.id,
        conversacion_id,
        entregado_a:     otrosConectados.map(c => c.userId),
        entregado_en:    new Date().toISOString(),
      },
    };
    for (const c of otrosConectados) {
      send(c, entregadoPayload);
    }
  }

  // Hook de extensión para IA (chat analyzer). Hoy es solo logging;
  // en la fase siguiente se conecta al Agent Core.
  onMensajePersistido(fullMessage).catch(err => {
    console.warn('[chat-ws] onMensajePersistido falló:', (err as Error).message);
  });

  // Push a destinatarios offline
  try {
    const otrosUserIds = await getOtherParticipantIds(conversacion_id, client.userId);
    const destinatariosOffline = otrosUserIds.filter(uid => !isUserOnline(uid));
    if (destinatariosOffline.length > 0) {
      const preview = contenido?.slice(0, 80) ?? '[adjunto]';
      await notifyMany(destinatariosOffline, {
        title: `${client.name ?? 'Alguien'} en ${client.email ?? 'el chat'}`,
        body:  preview,
        data: {
          tipo: 'chat',
          conversacion_id,
          mensaje_id: inserted.id,
        },
      });
    }
  } catch (err) {
    console.warn('[chat-ws] push notifications fallaron:', (err as Error).message);
  }
}

async function handleMensajeLeido(client: ChatClient, mensajeId: number) {
  if (!client.userId || !Number.isFinite(mensajeId)) return;

  // Buscar el mensaje y la conversación
  const [msg] = await db
    .select({ convId: mensajes.conversacionId, remitenteId: mensajes.remitenteId })
    .from(mensajes)
    .where(eq(mensajes.id, mensajeId))
    .limit(1);
  if (!msg) return sendError(client, 'MSG_NOT_FOUND', 'Mensaje no existe');

  // Validar participación
  if (!(await isParticipant(msg.convId, client.userId))) {
    return sendError(client, 'NOT_PARTICIPANT', 'No podés marcar como leído mensajes de conversaciones donde no participás');
  }

  // INSERT ON CONFLICT DO NOTHING (idempotente)
  try {
    await db
      .insert(mensajesLeidos)
      .values({ mensajeId, usuarioId: client.userId })
      .onConflictDoNothing();
  } catch (err) {
    return sendError(client, 'DB_ERROR', `No pude marcar como leído: ${(err as Error).message}`);
  }

  // Broadcast al room (excluye al que leyó)
  chatBroadcastToRoom(msg.convId, {
    type: 'mensaje:leido:confirmado',
    data: {
      mensaje_id: mensajeId,
      usuario_id: client.userId,
      leido_en: new Date().toISOString(),
    },
  }, client);
}

function handleTyping(client: ChatClient, convId: number, escribiendo: boolean) {
  if (!client.userId) return;
  if (!Number.isFinite(convId)) return;
  if (!client.joinedRooms.has(convId)) {
    return sendError(client, 'NOT_IN_ROOM', 'Tenés que unirte a la conversación primero');
  }
  // Broadcast a la sala, excluyendo al que está tipeando
  chatBroadcastToRoom(convId, {
    type: 'typing:actualizado',
    data: { conversacion_id: convId, usuario_id: client.userId, escribiendo },
  }, client);
}

async function handleReaccionAgregar(
  client: ChatClient,
  mensajeId: number,
  emoji: string,
) {
  if (!client.userId) return;
  if (!Number.isFinite(mensajeId)) {
    return sendError(client, 'BAD_MSG_ID', 'mensaje_id inválido');
  }
  if (!emoji || emoji.length > 16) {
    return sendError(client, 'BAD_EMOJI', 'emoji requerido (max 16 chars)');
  }

  // Buscar el mensaje y la conversación.
  const [msg] = await db
    .select({ convId: mensajes.conversacionId, remitenteId: mensajes.remitenteId })
    .from(mensajes)
    .where(eq(mensajes.id, mensajeId))
    .limit(1);
  if (!msg) return sendError(client, 'MSG_NOT_FOUND', 'Mensaje no existe');

  if (!(await isParticipant(msg.convId, client.userId))) {
    return sendError(client, 'NOT_PARTICIPANT', 'No podés reaccionar mensajes donde no participás');
  }

  // Insert idempotente (UNIQUE evita duplicados).
  await db
    .insert(mensajeReacciones)
    .values({ mensajeId, usuarioId: client.userId, emoji })
    .onConflictDoNothing();

  // Broadcast a la sala la lista actualizada de reacciones.
  const reacciones = await db
    .select({
      usuario_id: mensajeReacciones.usuarioId,
      emoji:      mensajeReacciones.emoji,
    })
    .from(mensajeReacciones)
    .where(eq(mensajeReacciones.mensajeId, mensajeId));

  chatBroadcastToRoom(msg.convId, {
    type: 'reaccion:actualizada',
    data: { mensaje_id: mensajeId, reacciones },
  });
}

async function handleReaccionQuitar(
  client: ChatClient,
  mensajeId: number,
  emoji: string,
) {
  if (!client.userId) return;
  if (!Number.isFinite(mensajeId)) {
    return sendError(client, 'BAD_MSG_ID', 'mensaje_id inválido');
  }
  if (!emoji) {
    return sendError(client, 'BAD_EMOJI', 'emoji requerido');
  }

  const [msg] = await db
    .select({ convId: mensajes.conversacionId })
    .from(mensajes)
    .where(eq(mensajes.id, mensajeId))
    .limit(1);
  if (!msg) return sendError(client, 'MSG_NOT_FOUND', 'Mensaje no existe');

  if (!(await isParticipant(msg.convId, client.userId))) {
    return sendError(client, 'NOT_PARTICIPANT', 'No podés quitar reacciones donde no participás');
  }

  await db
    .delete(mensajeReacciones)
    .where(and(
      eq(mensajeReacciones.mensajeId, mensajeId),
      eq(mensajeReacciones.usuarioId, client.userId),
      eq(mensajeReacciones.emoji, emoji),
    ));

  const reacciones = await db
    .select({
      usuario_id: mensajeReacciones.usuarioId,
      emoji:      mensajeReacciones.emoji,
    })
    .from(mensajeReacciones)
    .where(eq(mensajeReacciones.mensajeId, mensajeId));

  chatBroadcastToRoom(msg.convId, {
    type: 'reaccion:actualizada',
    data: { mensaje_id: mensajeId, reacciones },
  });
}

// ─── Hook de extensión (IA / Chat Analyzer) ────────────────────────────────
//
// Hoy solo loguea. La semana que viene esto se conecta al Agent Core:
// dispara el Chat Analyzer que decide si el mensaje amerita una acción
// operativa (ej. "se me rompió el freno" → propuesta de mantenimiento).
//
// IMPORTANTE: este hook se llama DESPUÉS de emitir `mensaje:recibido` y
// de hacer push, así que si la IA tarda 30s, los participantes ya
// recibieron el mensaje. La IA solo puede proponer acciones, no afecta
// el flujo de chat.
async function onMensajePersistido(mensaje: Record<string, unknown>) {
  console.log(`[chat-ws] mensaje persistido: id=${mensaje.id} conv=${mensaje.conversacion_id} remitente=${mensaje.remitente_id}`);
  // TODO fase 2: emitir evento al Agent Core (`emitEvent` con
  //   source='chat', eventType='chat.mensaje_recibido',
  //   payload={ mensaje_id, conversacion_id, contenido, remitente_id }).
  //   El Agent Core decide si dispara el Chat Analyzer.
}

// ─── Setup del WebSocket server ────────────────────────────────────────────

export function attachChatWebSocket(server: HttpServer) {
  if (wss) return wss;

  wss = new WebSocketServer({ noServer: true, path: '/ws/chat' });

  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    // Solo manejamos upgrades que empiecen con /ws/chat
    if (!req.url || !req.url.startsWith('/ws/chat')) {
      return; // No es nuestro → el server lo maneja (o lo destruye)
    }

    // ── Auth vía cookie ──────────────────────────────────────────────
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies['aplismart_token'] ?? null;
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    let payload: ReturnType<typeof verifyToken>;
    try {
      payload = verifyToken(token);
    } catch (err) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    if (!payload || !payload.companyId) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss!.handleUpgrade(req, socket, head, async (ws) => {
      const client = ws as ChatClient;
      client.isAlive = true;
      // El `sub` del JWT tiene formato `toId('company-user', '<num>')` → 42
      // Lo extraemos con un regex simple. Para platform users (sub con
      // prefijo platform-user) NO deberían poder chatear — el gate de
      // `companyId` ya los bloquea.
      const subStr = String(payload.sub ?? '');
      const numMatch = subStr.match(/(\d+)$/);
      client.userId = numMatch ? Number(numMatch[1]) : undefined;
      client.companyId = payload.companyId!;
      client.rol = payload.role;
      client.email = payload.email;
      client.name = payload.name;
      // FIX jul 2026 v8.2: traer el avatar (photo_url) del user para
      // incluirlo en el `mensaje:recibido` broadcast. Si falla la query,
      // no rompemos la conexión: dejamos null y el cliente usa la letra
      // inicial.
      try {
        const [u] = await db
          .select({ photoUrl: companyUsers.photoUrl })
          .from(companyUsers)
          .where(eq(companyUsers.id, client.userId!))
          .limit(1);
        client.photoUrl = u?.photoUrl ?? null;
      } catch (err) {
        console.warn('[chat-ws] no pude cargar photoUrl del user:', (err as Error).message);
        client.photoUrl = null;
      }
      client.joinedRooms = new Set();

      clientsByWs.set(ws, client);
      markUserOnline(client);

      // Mensaje de bienvenida
      send(client, {
        type: 'hello',
        data: { userId: client.userId, companyId: client.companyId, rol: client.rol },
      });

      // Keep-alive
      client.on('pong', () => { client.isAlive = true; });

      // Mensajes entrantes
      client.on('message', (raw) => {
        let msg: any;
        try { msg = JSON.parse(raw.toString()); }
        catch { return sendError(client, 'BAD_JSON', 'Mensaje no es JSON válido'); }

        if (!msg || typeof msg !== 'object') return;

        switch (msg.type) {
          case 'ping':
            send(client, { type: 'pong', t: Date.now() });
            break;
          case 'conversacion:unirse':
            void handleUnirse(client, Number(msg.conversacion_id));
            break;
          case 'mensaje:enviar':
            void handleEnviarMensaje(client, {
              conversacion_id:    Number(msg.conversacion_id),
              contenido:          msg.contenido,
              tipo:               msg.tipo,
              adjunto_url:        msg.adjunto_url,
              adjunto_mime_type:  msg.adjunto_mime_type,
              adjunto_size_bytes: msg.adjunto_size_bytes,
              client_msg_id:      msg.client_msg_id,
            });
            break;
          case 'mensaje:leido':
            void handleMensajeLeido(client, Number(msg.mensaje_id));
            break;
          case 'typing:start':
            handleTyping(client, Number(msg.conversacion_id), true);
            break;
          case 'typing:stop':
            handleTyping(client, Number(msg.conversacion_id), false);
            break;
          case 'reaccion:agregar':
            void handleReaccionAgregar(client, Number(msg.mensaje_id), String(msg.emoji ?? ''));
            break;
          case 'reaccion:quitar':
            void handleReaccionQuitar(client, Number(msg.mensaje_id), String(msg.emoji ?? ''));
            break;
          default:
            sendError(client, 'UNKNOWN_TYPE', `Tipo de evento desconocido: ${msg.type}`);
        }
      });

      // Cleanup
      const cleanup = () => {
        // Salir de todos los rooms
        for (const convId of client.joinedRooms) {
          roomMembers.get(convId)?.delete(client);
          if (roomMembers.get(convId)?.size === 0) roomMembers.delete(convId);
        }
        client.joinedRooms.clear();
        clientsByWs.delete(ws);
        const wasLast = markUserOffline(client);
        if (wasLast) {
          void broadcastPresenceToJoinedRooms(client, false);
        }
      };
      client.on('close', cleanup);
      client.on('error', cleanup);
    });
  });

  // Keep-alive cada 30s
  setInterval(() => {
    for (const c of clientsByWs.keys()) {
      const client = c as ChatClient;
      if (client.isAlive === false) { client.terminate(); continue; }
      client.isAlive = false;
      try { client.ping(); } catch { /* noop */ }
    }
  }, 30_000).unref?.();

  return wss;
}

/** Stats de debug. */
export function chatWsStats() {
  return {
    totalClients: clientsByWs.size,
    totalUsers:   clientsByUserId.size,
    rooms:        roomMembers.size,
    roomDetails:  Array.from(roomMembers.entries()).map(([convId, set]) => ({
      conversacion_id: convId,
      clients: set.size,
    })),
  };
}
