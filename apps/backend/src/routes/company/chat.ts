// routes/company/chat.ts
// ─────────────────────────────────────────────────────────────────────────────
// REST endpoints del chat interno (jul 2026 v8).
//
// Coherente con el spec v2 (Ai Assitant/aplismart-chat-interno-spec-v2.md)
// y con `services/chat-websocket.ts` (que maneja el envío de mensajes vía
// WebSocket en /ws/chat).
//
// Endpoints:
//   GET    /api/company/:id/chat/conversaciones
//     → Lista las conversaciones donde el user actual es participante.
//       Incluye: id, public_id, tipo, nombre, otro_participante (para
//       conversaciones 'directo'), ultimo_mensaje (preview), no_leidos
//       (count de mensajes sin `mensajes_leidos` del user), actualizado_en,
//       online (consulta `isUserOnline` del chat-websocket).
//
//   POST   /api/company/:id/chat/conversaciones
//     → Crea una conversación nueva. Body:
//         { tipo: 'directo' | 'grupo', participantes_ids: number[], nombre? }
//       Para 'directo', exactamente 1 participante. El creador se agrega
//       automáticamente. El campo `rol` se snapshotea desde `company_users.role`
//       al momento de la inserción.
//
//   GET    /api/company/:id/chat/conversaciones/:convId/mensajes
//     → Lista los últimos 200 mensajes de la conversación. Valida que
//       el user sea participante. Marca todos como leídos al devolverlos
//       (INSERT ON CONFLICT en mensajes_leidos).
//
//   GET    /api/company/:id/chat/usuarios
//     → Lista los usuarios activos de la empresa (excluyendo al user
//       actual). Sirve para popular el modal de "nueva conversación".
//
// Permisos: solo usuarios autenticados. El gate de empresa lo hace el
// middleware `requireCompany` del router padre (routes/company/index.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  conversaciones,
  participantes,
  mensajes,
  mensajesLeidos,
  mensajeReacciones,
  companyUsers,
} from '../../db/schema';
import { validate } from '../../lib/validate';
import { AppError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { authenticate } from '../../middlewares/authenticate';
import { requireModule } from '../../middlewares/requireModule';
import { isUserOnline } from '../../services/chat-websocket';

const router = Router({ mergeParams: true });
// Gate de seguridad: el chat interno está protegido por el módulo `chat`
// (separado de `jarvis`). El admin puede desactivar el chat por empresa
// desde Accesos → Empresa → Módulos sin afectar a la IA (y viceversa).
router.use(authenticate);
router.use(requireModule('chat'));

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCompanyId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new AppError(400, 'companyId inválido');
  }
  return id;
}

function getUserId(req: Request): number {
  const sub = String(req.user?.sub ?? '');
  // El `sub` del JWT tiene formato `toId('company-user', '<num>')` → 42
  // Extraemos el último bloque de dígitos con un regex.
  const m = sub.match(/(\d+)$/);
  if (!m) throw new AppError(401, 'userId no encontrado en sesión');
  return Number(m[1]);
}

async function assertParticipant(convId: number, userId: number, companyId: number): Promise<void> {
  // Validamos en una sola query: la conversación pertenece a la empresa
  // Y el user es participante.
  const row = await db
    .select({ empresaId: conversaciones.empresaId, uid: participantes.usuarioId })
    .from(participantes)
    .innerJoin(conversaciones, eq(conversaciones.id, participantes.conversacionId))
    .where(and(
      eq(participantes.conversacionId, convId),
      eq(participantes.usuarioId, userId),
    ))
    .limit(1);
  if (row.length === 0) {
    throw new ForbiddenError('No sos participante de esta conversación');
  }
  if (row[0]!.empresaId !== companyId) {
    throw new ForbiddenError('La conversación no pertenece a esta empresa');
  }
}

// ─── GET /conversaciones ────────────────────────────────────────────────────

router.get('/conversaciones', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = getCompanyId(req);
    const userId = getUserId(req);

    // 1) Traer las conversaciones donde el user es participante + pertenecen
    // a la empresa, OCULTANDO las que aún no tienen mensajes (a menos que
    // el user sea el creador, que la ve como "draft").
    //
    // Razón: cuando user A abre un chat con user B, el frontend crea la
    // conversación inmediatamente (para tener un convId al que mandar
    // mensajes). Pero antes de que A mande el primer mensaje, B no
    // debería ver esa conv en su lista. Una vez que A manda el primer
    // mensaje, ambos la ven.
    //
    // Regla: mostrar la conv si (a) tiene al menos un mensaje, o (b) el
    // user la creó (draft propio).
    const convs = await db
      .select({
        id:           conversaciones.id,
        publicId:     conversaciones.publicId,
        tipo:         conversaciones.tipo,
        nombre:       conversaciones.nombre,
        creadoPor:    conversaciones.creadoPor,
        actualizadoEn: conversaciones.actualizadoEn,
      })
      .from(conversaciones)
      .innerJoin(participantes, eq(participantes.conversacionId, conversaciones.id))
      .where(and(
        eq(participantes.usuarioId, userId),
        eq(conversaciones.empresaId, companyId),
        // (a) tiene al menos un mensaje, o (b) el user es el creador
        sql`(${conversaciones.creadoPor} = ${userId} OR EXISTS (SELECT 1 FROM ${mensajes} m WHERE m.conversacion_id = ${conversaciones.id}))`,
      ))
      .orderBy(desc(conversaciones.actualizadoEn))
      .limit(200);

    if (convs.length === 0) {
      res.json({ data: [] });
      return;
    }

    const convIds = convs.map(c => c.id);

    // 2) Para cada conversación: otros participantes, último mensaje, no leídos.
    const data = await Promise.all(convs.map(async (c) => {
      // Otros participantes (excluyendo al user actual).
      const others = await db
        .select({
          userId:  participantes.usuarioId,
          rol:     participantes.rol,
          name:    companyUsers.username,
          email:   companyUsers.email,
          // FIX jul 2026 v8.2: traer también el avatar (photo_url) para
          // mostrar la foto de perfil en el sidebar en vez de la letra
          // inicial.
          photoUrl: companyUsers.photoUrl,
        })
        .from(participantes)
        .innerJoin(companyUsers, eq(companyUsers.id, participantes.usuarioId))
        .where(and(
          eq(participantes.conversacionId, c.id),
          sql`${participantes.usuarioId} <> ${userId}`,
        ));

      // Último mensaje.
      const [lastMsg] = await db
        .select({
          contenido: mensajes.contenido,
          tipo:       mensajes.tipo,
          creadoEn:   mensajes.creadoEn,
        })
        .from(mensajes)
        .where(eq(mensajes.conversacionId, c.id))
        .orderBy(desc(mensajes.creadoEn))
        .limit(1);

      // No leídos: count de mensajes sin row en mensajes_leidos para este user.
      const [{ unread }] = await db
        .select({ unread: sql<number>`COUNT(*)::int` })
        .from(mensajes)
        .leftJoin(
          mensajesLeidos,
          and(
            eq(mensajesLeidos.mensajeId, mensajes.id),
            eq(mensajesLeidos.usuarioId, userId),
          ),
        )
        .where(and(
          eq(mensajes.conversacionId, c.id),
          isNull(mensajesLeidos.mensajeId),
        ));

      // Para 'directo', el "otro participante" es el único otro. Para 'grupo',
      // podríamos mostrar varios en el futuro — por ahora listamos el primero.
      const otherP = others[0] ?? null;

      return {
        id: c.id,
        public_id: c.publicId,
        tipo: c.tipo,
        nombre: c.nombre,
        actualizado_en: c.actualizadoEn,
        otro_participante: otherP ? {
          user_id: otherP.userId,
          name: otherP.name,
          email: otherP.email,
          rol: otherP.rol,
          avatar_url: otherP.photoUrl,  // FIX jul 2026 v8.2: foto real del user.
          online: isUserOnline(otherP.userId),
        } : null,
        ultimo_mensaje: lastMsg ? {
          contenido: lastMsg.contenido,
          tipo: lastMsg.tipo,
          creado_en: lastMsg.creadoEn,
        } : null,
        no_leidos: Number(unread) || 0,
      };
    }));

    res.json({ data });
  } catch (err) { next(err); }
});

// ─── POST /conversaciones ───────────────────────────────────────────────────

const createSchema = z.object({
  tipo: z.enum(['directo', 'grupo']),
  participantes_ids: z.array(z.number().int().positive()).min(1).max(50),
  nombre: z.string().min(1).max(120).optional(),
});

router.post('/conversaciones', validate(createSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = getCompanyId(req);
    const userId = getUserId(req);
    const { tipo, participantes_ids, nombre } = req.body as z.infer<typeof createSchema>;

    // Para 'directo' tiene que haber exactamente 1 otro participante.
    if (tipo === 'directo' && participantes_ids.length !== 1) {
      throw new AppError(400, 'Conversación directa requiere exactamente 1 otro participante');
    }

    // Verificar que todos los participantes existen y son de la misma empresa.
    const allIds = Array.from(new Set([userId, ...participantes_ids]));
    const users = await db
      .select({
        id:        companyUsers.id,
        companyId: companyUsers.companyId,
        rol:       companyUsers.role,
        username:  companyUsers.username,
        status:    companyUsers.status,
      })
      .from(companyUsers)
      .where(inArray(companyUsers.id, allIds));

    if (users.length !== allIds.length) {
      throw new NotFoundError('Usuario', 'uno o más');
    }
    const wrongCompany = users.find(u => u.companyId !== companyId);
    if (wrongCompany) {
      throw new ForbiddenError(`El usuario ${wrongCompany.username} no pertenece a esta empresa`);
    }
    const inactive = users.find(u => u.status !== 'active');
    if (inactive) {
      throw new ForbiddenError(`El usuario ${inactive.username} no está activo`);
    }

    // Insertar conversación.
    const [newConv] = await db
      .insert(conversaciones)
      .values({
        empresaId: companyId,
        tipo,
        nombre: nombre ?? null,
        creadoPor: userId,
      })
      .returning();

    if (!newConv) {
      throw new AppError(500, 'No se pudo crear la conversación');
    }

    // Insertar participantes (creador + invitados). Snapshot del rol actual.
    const participantRows = users.map(u => ({
      conversacionId: newConv.id,
      usuarioId:      u.id,
      rol:            u.rol,
    }));
    await db.insert(participantes).values(participantRows);

    res.json({
      data: {
        id: newConv.id,
        public_id: newConv.publicId,
        tipo: newConv.tipo,
        nombre: newConv.nombre,
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /conversaciones/:convId/mensajes ───────────────────────────────────
// jul 2026 v8.2: paginación cursor-based para no morirse con conversaciones
// largas. El cliente pide páginas con `?before=<id>&limit=<n>`.
//
//   - Sin `before`: devuelve los últimos N mensajes (los más recientes).
//   - Con `before`: devuelve hasta N mensajes con id < before (más viejos
//     que ese cursor), en orden ASC.
//
// Response shape:
//   { data: [...], has_more: bool, next_cursor: number | null }
//   - `has_more`: true si hay mensajes más viejos (id < next_cursor).
//   - `next_cursor`: el id del mensaje más viejo de este batch. Pasalo
//     como `before=` para la próxima página.

const MESSAGES_DEFAULT_LIMIT = 20;
const MESSAGES_MAX_LIMIT = 100;

router.get('/conversaciones/:convId/mensajes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = getCompanyId(req);
    const userId = getUserId(req);
    const convId = Number(req.params.convId);
    if (!Number.isFinite(convId) || convId <= 0) {
      throw new AppError(400, 'convId inválido');
    }

    // Paginación: ?before=<id>&limit=<n>
    const rawLimit = Number(req.query.limit);
    const limit = Math.min(
      Math.max(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : MESSAGES_DEFAULT_LIMIT, 1),
      MESSAGES_MAX_LIMIT,
    );
    const rawBefore = req.query.before;
    const before = rawBefore !== undefined ? Number(rawBefore) : null;
    const useCursor = before !== null && Number.isFinite(before) && before > 0;

    await assertParticipant(convId, userId, companyId);

    const selectCols = {
      id:               mensajes.id,
      publicId:         mensajes.publicId,
      conversacionId:   mensajes.conversacionId,
      remitenteId:      mensajes.remitenteId,
      remitenteName:    companyUsers.username,
      // FIX jul 2026 v8.2: foto del remitente para el avatar en cada
      // burbuja de mensaje.
      remitentePhotoUrl: companyUsers.photoUrl,
      contenido:        mensajes.contenido,
      tipo:             mensajes.tipo,
      adjuntoUrl:       mensajes.adjuntoUrl,
      adjuntoMimeType:  mensajes.adjuntoMimeType,
      adjuntoSizeBytes: mensajes.adjuntoSizeBytes,
      clientMsgId:      mensajes.clientMsgId,
      creadoEn:         mensajes.creadoEn,
    };

    // Tipo de fila inferido de la select. Usamos un alias simple (any)
    // porque Drizzle infiere un tipo muy verboso que no vale la pena tipear
    // a mano. Las propiedades que usamos después (`m.id`, `m.clientMsgId`,
    // etc.) están garantizadas por el `selectCols` de arriba.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows: any[];

    if (useCursor) {
      // Paginación hacia atrás: mensajes con id < before, en orden ASC.
      rows = await db
        .select(selectCols)
        .from(mensajes)
        .innerJoin(companyUsers, eq(companyUsers.id, mensajes.remitenteId))
        .where(and(
          eq(mensajes.conversacionId, convId),
          lt(mensajes.id, before as number),
        ))
        .orderBy(asc(mensajes.id))
        .limit(limit);
    } else {
      // Carga inicial: últimos N mensajes. Tomamos DESC con limit, después
      // invertimos in-memory para devolver en orden cronológico (ASC).
      const descRows = await db
        .select(selectCols)
        .from(mensajes)
        .innerJoin(companyUsers, eq(companyUsers.id, mensajes.remitenteId))
        .where(eq(mensajes.conversacionId, convId))
        .orderBy(desc(mensajes.id))
        .limit(limit);
      rows = descRows.reverse();
    }

    if (rows.length === 0) {
      return res.json({ data: [], has_more: false, next_cursor: null });
    }

    const msgIds = rows.map(r => r.id);
    const firstId = rows[0]!.id;          // el más viejo de este batch
    const lastId = rows[rows.length - 1]!.id;  // el más nuevo

    // ¿Hay más mensajes más viejos? (id < firstId)
    const [{ count: olderCount }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(mensajes)
      .where(and(
        eq(mensajes.conversacionId, convId),
        lt(mensajes.id, firstId),
      ));
    const hasMore = olderCount > 0;
    const nextCursor = hasMore ? firstId : null;

    // Reacciones de estos mensajes (jul 2026 v8.1).
    const reaccionesRows = await db
      .select({
        mensajeId: mensajeReacciones.mensajeId,
        usuarioId: mensajeReacciones.usuarioId,
        emoji:     mensajeReacciones.emoji,
        creadoEn:  mensajeReacciones.creadoEn,
      })
      .from(mensajeReacciones)
      .where(inArray(mensajeReacciones.mensajeId, msgIds));

    // Read receipts: por mensaje, quién lo leyó y cuándo.
    const leidosRows = await db
      .select({
        mensajeId: mensajesLeidos.mensajeId,
        usuarioId: mensajesLeidos.usuarioId,
        leidoEn:   mensajesLeidos.leidoEn,
      })
      .from(mensajesLeidos)
      .where(inArray(mensajesLeidos.mensajeId, msgIds));

    // Marcar todos como leídos (idempotente). Esto aplica a la página que
    // se acaba de cargar — si hay más viejas que el user no ha visto,
    // quedan como no_leidas (lo cual es correcto: no las ha leído).
    await db
      .insert(mensajesLeidos)
      .values(msgIds.map(id => ({ mensajeId: id, usuarioId: userId })))
      .onConflictDoNothing();

    // Agrupar por mensaje.
    const reaccionesByMsg = new Map<number, Array<{ usuario_id: number; emoji: string; creado_en: Date }>>();
    for (const r of reaccionesRows) {
      const arr = reaccionesByMsg.get(r.mensajeId) ?? [];
      arr.push({ usuario_id: r.usuarioId, emoji: r.emoji, creado_en: r.creadoEn });
      reaccionesByMsg.set(r.mensajeId, arr);
    }
    const leidosByMsg = new Map<number, Array<{ usuario_id: number; leido_en: Date }>>();
    for (const r of leidosRows) {
      const arr = leidosByMsg.get(r.mensajeId) ?? [];
      arr.push({ usuario_id: r.usuarioId, leido_en: r.leidoEn });
      leidosByMsg.set(r.mensajeId, arr);
    }

    res.json({
      data: rows.map(m => ({
        id: m.id,
        public_id: m.publicId,
        conversacion_id: m.conversacionId,
        remitente_id: m.remitenteId,
        remitente_nombre: m.remitenteName,
        // FIX jul 2026 v8.2: foto del remitente para el avatar.
        remitente_avatar_url: m.remitentePhotoUrl,
        contenido: m.contenido,
        tipo: m.tipo,
        adjunto_url: m.adjuntoUrl,
        adjunto_mime_type: m.adjuntoMimeType,
        adjunto_size_bytes: m.adjuntoSizeBytes,
        client_msg_id: m.clientMsgId,
        creado_en: m.creadoEn,
        reacciones:   reaccionesByMsg.get(m.id)   ?? [],
        leido_por:    leidosByMsg.get(m.id)        ?? [],
      })),
      has_more: hasMore,
      next_cursor: nextCursor,
    });
  } catch (err) { next(err); }
});

// ─── POST /conversaciones/:convId/mensajes/:msgId/reacciones ─────────────────
// jul 2026 v8.1 — Agrega una reacción a un mensaje. Si el user ya tenía
// esa misma reacción, no hace nada (UNIQUE constraint). Devuelve la lista
// actualizada de reacciones del mensaje.
const reaccionSchema = z.object({
  emoji: z.string().min(1).max(16),
});

router.post('/conversaciones/:convId/mensajes/:msgId/reacciones', validate(reaccionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = getCompanyId(req);
    const userId = getUserId(req);
    const convId = Number(req.params.convId);
    const msgId = Number(req.params.msgId);
    const { emoji } = req.body as z.infer<typeof reaccionSchema>;

    if (!Number.isFinite(convId) || convId <= 0) throw new AppError(400, 'convId inválido');
    if (!Number.isFinite(msgId)  || msgId <= 0)  throw new AppError(400, 'msgId inválido');

    await assertParticipant(convId, userId, companyId);

    // Validar que el mensaje pertenece a esta conversación.
    const [msg] = await db
      .select({ convId: mensajes.conversacionId, remitenteId: mensajes.remitenteId })
      .from(mensajes)
      .where(eq(mensajes.id, msgId))
      .limit(1);
    if (!msg) throw new NotFoundError('Mensaje', msgId);
    if (msg.convId !== convId) {
      throw new ForbiddenError('El mensaje no pertenece a esta conversación');
    }

    // Insert con ON CONFLICT DO NOTHING (idempotente: si ya está, no falla).
    await db
      .insert(mensajeReacciones)
      .values({ mensajeId: msgId, usuarioId: userId, emoji })
      .onConflictDoNothing();

    // Devolver la lista actualizada de reacciones del mensaje.
    const reacciones = await db
      .select({
        usuario_id: mensajeReacciones.usuarioId,
        emoji:      mensajeReacciones.emoji,
        creado_en:  mensajeReacciones.creadoEn,
      })
      .from(mensajeReacciones)
      .where(eq(mensajeReacciones.mensajeId, msgId));

    res.json({ data: { mensaje_id: msgId, reacciones } });
  } catch (err) { next(err); }
});

// ─── DELETE /conversaciones/:convId/mensajes/:msgId/reacciones/:emoji ───────
// Quita una reacción del user actual sobre un mensaje. Si no la tenía,
// no hace nada (idempotente).
router.delete('/conversaciones/:convId/mensajes/:msgId/reacciones/:emoji', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = getCompanyId(req);
    const userId = getUserId(req);
    const convId = Number(req.params.convId);
    const msgId = Number(req.params.msgId);
    const emoji = String(req.params.emoji ?? '');

    if (!Number.isFinite(convId) || convId <= 0) throw new AppError(400, 'convId inválido');
    if (!Number.isFinite(msgId)  || msgId <= 0)  throw new AppError(400, 'msgId inválido');
    if (!emoji) throw new AppError(400, 'emoji requerido');

    await assertParticipant(convId, userId, companyId);

    await db
      .delete(mensajeReacciones)
      .where(and(
        eq(mensajeReacciones.mensajeId, msgId),
        eq(mensajeReacciones.usuarioId, userId),
        eq(mensajeReacciones.emoji, emoji),
      ));

    res.json({ data: { mensaje_id: msgId, emoji, removed: true } });
  } catch (err) { next(err); }
});

// ─── GET /usuarios ──────────────────────────────────────────────────────────

router.get('/usuarios', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = getCompanyId(req);
    const userId = getUserId(req);

    const users = await db
      .select({
        id:       companyUsers.id,
        username: companyUsers.username,
        email:    companyUsers.email,
        rol:      companyUsers.role,
      })
      .from(companyUsers)
      .where(and(
        eq(companyUsers.companyId, companyId),
        eq(companyUsers.status, 'active'),
        sql`${companyUsers.id} <> ${userId}`,
      ))
      .orderBy(companyUsers.username);

    res.json({
      data: users.map(u => ({
        id: u.id,
        name: u.username,
        email: u.email,
        rol: u.rol,
        online: isUserOnline(u.id),
      })),
    });
  } catch (err) { next(err); }
});

export default router;
