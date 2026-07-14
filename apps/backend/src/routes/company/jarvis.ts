// routes/company/jarvis.ts
// ─────────────────────────────────────────────────────────────────────
// Endpoints del Asistente IA (Jarvis) — versión MVP.
//
// POST   /company/:id/ai/chat         → envía mensaje, recibe respuesta.
// GET    /company/:id/ai/conversations → lista conversaciones del usuario.
// GET    /company/:id/ai/conversations/:cid/messages → mensajes.
//
// Permisos: solo admin_empresa y owner_empresa (Parte III sección 31).
// empresa_id SIEMPRE viene del JWT (req.companyId), nunca del body.
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';
import { and, eq, desc, sql } from 'drizzle-orm';
import { ForbiddenError, AppError } from '../../lib/errors';
import { requireAdminOwner } from '../../middlewares/requireAdminOwner';
import { requirePermission } from '../../middlewares/requirePermission';
import { rateLimitJarvis } from '../../middlewares/rateLimitJarvis';
import { validate } from '../../lib/validate';
import { db } from '../../db/client';
import { aiConversations, aiMessages } from '../../db/schema/jarvis';
import {
  jarvisChat,
  isJarvisEnabled,
  isJarvisEnabledForCompany,
  listMyConversations,
  getConversationMessages,
  listAvailableTools,
} from '../../lib/ai/jarvis';
import { jarvisChatStream } from '../../lib/ai/jarvis-stream';
import { getCacheStats, invalidateCache } from '../../lib/ai/tools/registry';
import { getModelConfig } from '../../lib/ai/model-config';
import {
  synthesizeSpeech,
  synthesizeSpeechForCompany,
  TTS_VOICES,
  isValidVoice,
  DEFAULT_VOICE,
  getTtsStats,
  type VoiceId,
} from '../../lib/ai/tts';
import { getClient as getGroqClient, maybeRecoverPrimary as maybeRecoverGroqKey } from '../../lib/ai/groq-client';
import { getCurrentApiKey } from '../../lib/ai/keys';
import { getGroqClientForCompany } from '../../lib/ai/client-factory';
import { toFile as groqToFile } from 'groq-sdk';
import { triggerWeeklySummaryNow } from '../../scheduled/weekly-summary';
import { getRateLimitStats } from '../../lib/ai/rate-limit';
import { requireModule } from '../../middlewares/requireModule';

const router = Router({ mergeParams: true });

// jul 2026 — El módulo `jarvis` (Asistente IA) sólo está disponible en
// planes Business y Enterprise (ver platform-seed.ts). Aplicamos el gating
// a TODO el router para que chat, voice, conversaciones, transcripción
// TTS, etc. devuelvan 403 si la empresa no tiene `jarvis` en su plan.
// `requireModule` exime a superadmin y a admins de empresa, así que el
// superadmin puede seguir probando desde el panel master aunque la
// empresa esté en un plan que no incluye IA.
router.use(requireModule('jarvis', 'asistente'));

const chatSchema = z.object({
  message:         z.string().min(1, 'Mensaje requerido').max(2000),
  // Acepta string o number (la DB es serial int → JSON lo manda como number).
  // Transformamos a string para mantener consistencia en el orquestador.
  conversationId:  z.union([z.string(), z.number()]).optional().nullable()
                    .transform((v) => v == null ? v : String(v)),
});

// ─── POST /tts ────────────────────────────────────────────────────────
// Sintetiza texto a voz con Groq PlayAI. Devuelve audio WAV.
// Acepta opcionalmente `?voice=Arista-PlayAI&autoplay=true` para
// conveniencias del frontend.

const ttsSchema = z.object({
  text:  z.string().min(1).max(9000),
  voice: z.string().optional(),
});

router.post(
  '/tts',
  requirePermission('jarvis', 'asistente', 'ver'),
  rateLimitJarvis,
  validate(ttsSchema),
  async (req, res, next) => {
    try {
      const { text, voice: reqVoice } = req.body as z.infer<typeof ttsSchema>;
      const voice: VoiceId =
        reqVoice && isValidVoice(reqVoice) ? reqVoice : DEFAULT_VOICE;

      // jul 2026 v7 — per-empresa. Chequea kill-switch y useTts.
      const empresaId = req.companyId!;
      const result = await synthesizeSpeechForCompany(text, voice, empresaId);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', String(result.bytes));
      res.setHeader('X-TTS-Cached', result.cached ? '1' : '0');
      res.setHeader('X-TTS-Voice', result.voice);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(result.buffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'TTS no disponible.';
      // Si falló por falta de key o por texto vacío, devolvemos 503
      // para que el frontend haga fallback a Web Speech API.
      if (msg.includes('GROQ_API_KEY') || msg.includes('Texto vacío')) {
        res.status(503).json({ error: msg });
        return;
      }
      next(err);
    }
  },
);

// ─── GET /tts/voices ─────────────────────────────────────────────────
// Lista las voces disponibles para el selector del frontend.

router.get(
  '/tts/voices',
  requirePermission('jarvis', 'asistente', 'ver'),
  async (_req, res) => {
    res.json({
      voices: TTS_VOICES,
      default: DEFAULT_VOICE,
      stats:   getTtsStats(),
    });
  },
);

// ─── POST /chat ────────────────────────────────────────────────────────

router.post(
  '/chat',
  requirePermission('jarvis', 'asistente', 'ver'),
  rateLimitJarvis,
  validate(chatSchema),
  async (req, res, next) => {
    try {
      const empresaId = req.companyId!;
      const userId    = Number(String(req.user!.sub).replace(/\D/g, ''));
      if (!userId) throw new ForbiddenError('Sesión sin company-user id.');

      const rol = req.user!.role;
      if (rol !== 'owner_empresa' && rol !== 'admin_empresa') {
        throw new ForbiddenError('Solo administradores de empresa pueden usar el asistente.');
      }

      const body = req.body as z.infer<typeof chatSchema>;

      // jul 2026 v6 — chequeo per-empresa: respeta override propio Y
      // cascada global. Si no hay key en ningún lado, 503 amable.
      if (!(await isJarvisEnabledForCompany(empresaId))) {
        res.status(503).json({
          conversationId: null,
          answer: 'El asistente IA no está disponible en este momento. Pedile a tu admin de empresa o al superadmin que configuren una API key de IA.',
          latencyMs: 0,
          noData: true,
        });
        return;
      }

      const result = await jarvisChat({
        empresaId,
        userId,
        userName:  req.user!.name ?? 'Usuario',
        rol,
        empresaNombre: req.user!.companyName ?? 'Tu empresa',
        message:   body.message,
        conversationId: body.conversationId ?? null,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /conversations ────────────────────────────────────────────────
// Lista las conversaciones del usuario. Si viene ?q= hace búsqueda
// full-text case-insensitive sobre el contenido de los mensajes.

router.get(
  '/conversations',
  requirePermission('jarvis', 'asistente', 'ver'),
  async (req, res, next) => {
    try {
      const empresaId = req.companyId!;
      const userId    = Number(String(req.user!.sub).replace(/\D/g, ''));
      if (!userId) throw new ForbiddenError('Sesión sin company-user id.');

      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

      if (!q) {
        const list = await listMyConversations(empresaId, userId);
        res.json({ data: list });
        return;
      }

      // Búsqueda: conversaciones donde AL MENOS UN mensaje (user o
      // assistant) matchea el término. Devolvemos un snippet de 120
      // caracteres alrededor del match.
      const like = `%${q}%`;
      const rows = await db
        .selectDistinct({
          id:        aiConversations.id,
          title:     aiConversations.title,
          createdAt: aiConversations.createdAt,
          updatedAt: aiConversations.updatedAt,
          // Primer mensaje que matchea (para preview).
          matchContent: aiMessages.content,
          matchRole:    aiMessages.role,
          matchAt:      aiMessages.createdAt,
        })
        .from(aiConversations)
        .innerJoin(aiMessages, eq(aiMessages.conversationId, aiConversations.id))
        .where(and(
          eq(aiConversations.empresaId, empresaId),
          eq(aiConversations.userId, userId),
          sql`${aiMessages.content} ILIKE ${like}`,
        ))
        .orderBy(desc(aiConversations.updatedAt))
        .limit(50);

      // Snippet: 60 chars antes + match + 60 chars después.
      const enriched = rows.map((r) => {
        const idx = r.matchContent.toLowerCase().indexOf(q.toLowerCase());
        const start = Math.max(0, idx - 60);
        const end   = Math.min(r.matchContent.length, idx + q.length + 60);
        const snippet = (start > 0 ? '…' : '') + r.matchContent.slice(start, end) + (end < r.matchContent.length ? '…' : '');
        return {
          id:        r.id,
          title:     r.title,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          snippet,
          matchRole: r.matchRole,
        };
      });

      res.json({ data: enriched, query: q });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/conversations',
  requireAdminOwner,
  async (req, res, next) => {
    try {
      const empresaId = req.companyId!;
      const userId    = Number(String(req.user!.sub).replace(/\D/g, ''));
      if (!userId) throw new ForbiddenError('Sesión sin company-user id.');

      const list = await listMyConversations(empresaId, userId);
      res.json({ data: list });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /conversations/:cid/messages ───────────────────────────────────

router.get(
  '/conversations/:cid/messages',
  requirePermission('jarvis', 'asistente', 'ver'),
  async (req, res, next) => {
    try {
      const empresaId = req.companyId!;
      const cid       = req.params.cid;
      if (!cid) throw new AppError(400, 'conversationId requerido.');

      const messages = await getConversationMessages(cid, empresaId);
      res.json({ data: messages });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /conversations/:cid (renombrar título) ───────────────────────

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

router.patch(
  '/conversations/:cid',
  requirePermission('jarvis', 'asistente', 'ver'),
  validate(patchSchema),
  async (req, res, next) => {
    try {
      const empresaId = req.companyId!;
      const userId    = Number(String(req.user!.sub).replace(/\D/g, ''));
      const cidRaw    = req.params.cid;
      const cid       = parseInt(cidRaw ?? '', 10);
      if (!Number.isFinite(cid) || cid <= 0) throw new AppError(400, 'conversationId inválido.');
      if (!userId) throw new ForbiddenError('Sesión sin company-user id.');

      const { title } = req.body as z.infer<typeof patchSchema>;

      // Solo el dueño de la conversación puede renombrarla.
      const [updated] = await db
        .update(aiConversations)
        .set({ title, updatedAt: new Date() })
        .where(and(
          eq(aiConversations.id, cid),
          eq(aiConversations.empresaId, empresaId),
          eq(aiConversations.userId, userId),
        ))
        .returning({ id: aiConversations.id, title: aiConversations.title });

      if (!updated) throw new AppError(404, 'Conversación no encontrada.');
      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /conversations/:cid ─────────────────────────────────────────
// Borra la conversación, todos sus mensajes y tool calls (cascade).

router.delete(
  '/conversations/:cid',
  requirePermission('jarvis', 'asistente', 'ver'),
  async (req, res, next) => {
    try {
      const empresaId = req.companyId!;
      const userId    = Number(String(req.user!.sub).replace(/\D/g, ''));
      const cid       = parseInt(req.params.cid ?? '', 10);
      if (!Number.isFinite(cid) || cid <= 0) throw new AppError(400, 'conversationId inválido.');
      if (!userId) throw new ForbiddenError('Sesión sin company-user id.');

      const deleted = await db
        .delete(aiConversations)
        .where(and(
          eq(aiConversations.id, cid),
          eq(aiConversations.empresaId, empresaId),
          eq(aiConversations.userId, userId),
        ))
        .returning({ id: aiConversations.id });

      if (deleted.length === 0) throw new AppError(404, 'Conversación no encontrada.');
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /tools ───────────────────────────────────────────────────────
// Devuelve el catálogo de tools disponibles para el rol actual.
// Útil para debug del frontend y health check.

router.get(
  '/tools',
  requirePermission('jarvis', 'asistente', 'ver'),
  async (req, res) => {
    const rol = req.user!.role;
    const tools = (rol === 'admin_empresa' || rol === 'owner_empresa')
      ? listAvailableTools(rol)
      : [];
    const empresaId = req.companyId!;
    res.json({
      // jul 2026 v6 — chequeo per-empresa para que el frontend muestre
      // el estado correcto del asistente de ESTA empresa.
      enabled: await isJarvisEnabledForCompany(empresaId),
      tools,
    });
  },
);

// ─── GET /cache/stats ────────────────────────────────────────────────
// Devuelve métricas del cache de tools (hits, misses, tamaño, hit rate).

router.get(
  '/cache/stats',
  requireAdminOwner,
  async (_req, res) => {
    res.json({ data: getCacheStats() });
  },
);

// ─── DELETE /cache ───────────────────────────────────────────────────
// Invalida el cache. Sin body → invalida todo. Con body { empresaId } → solo esa.

router.delete(
  '/cache',
  requireAdminOwner,
  async (req, res) => {
    const empresaId = req.body?.empresaId ?? req.companyId;
    const cleared = invalidateCache(empresaId);
    res.json({ ok: true, cleared });
  },
);

// ─── GET /conversations/:cid/export?format=csv|pdf ─────────────────
// Exporta una conversación completa. CSV y PDF.

router.get(
  '/conversations/:cid/export',
  requirePermission('jarvis', 'asistente', 'ver'),
  async (req, res, next) => {
    try {
      const empresaId = req.companyId!;
      const userId    = Number(String(req.user!.sub).replace(/\D/g, ''));
      if (!userId) throw new ForbiddenError('Sesión sin company-user id.');

      const cidNum = parseInt(req.params.cid ?? '', 10);
      if (!Number.isFinite(cidNum) || cidNum <= 0) {
        throw new AppError(400, 'conversationId inválido.');
      }
      const format = (req.query.format === 'pdf' ? 'pdf' : 'csv') as 'csv' | 'pdf';

      // 1) Cargar conversación (validar empresa + user).
      const [conv] = await db
        .select({
          id:         aiConversations.id,
          title:      aiConversations.title,
          createdAt:  aiConversations.createdAt,
          updatedAt:  aiConversations.updatedAt,
        })
        .from(aiConversations)
        .where(and(
          eq(aiConversations.id, cidNum),
          eq(aiConversations.empresaId, empresaId),
          eq(aiConversations.userId, userId),
        ))
        .limit(1);
      if (!conv) throw new AppError(404, 'Conversación no encontrada.');

      // 2) Cargar mensajes.
      const messages = await db
        .select({
          id:        aiMessages.id,
          role:      aiMessages.role,
          content:   aiMessages.content,
          createdAt: aiMessages.createdAt,
        })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, cidNum))
        .orderBy(aiMessages.createdAt);

      const safeTitle = (conv.title || 'conversacion').replace(/[^\w\-]+/g, '_').slice(0, 40);

      if (format === 'csv') {
        const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
        const lines = ['id,role,fecha,contenido'];
        for (const m of messages) {
          lines.push([
            String(m.id),
            escape(m.role),
            escape(new Date(m.createdAt).toISOString()),
            escape(m.content),
          ].join(','));
        }
        const csv = lines.join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition',
          `attachment; filename="jarvis-${safeTitle}.csv"`);
        res.send(csv);
        return;
      }

      // PDF: usamos jspdf + jspdf-autotable.
      const { jsPDF } = await import('jspdf');
      // jspdf-autotable extiende el prototipo; import side-effect.
      await import('jspdf-autotable');

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 15;
      const colW = pageW - margin * 2;

      // Header.
      doc.setFontSize(16);
      doc.text('Jarvis — Conversación', margin, 18);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Título: ${conv.title || '(sin título)'}`, margin, 25);
      doc.text(`Exportado: ${new Date().toISOString()}`, margin, 30);
      doc.text(`Mensajes: ${messages.length}`, margin, 35);
      doc.setTextColor(0);

      // Tabla.
      const body = messages.map((m) => [
        m.role,
        new Date(m.createdAt).toLocaleString('es-EC'),
        m.content.length > 200 ? m.content.slice(0, 200) + '…' : m.content,
      ]);

      // @ts-ignore — autotable inyecta este método en el prototype.
      doc.autoTable({
        startY: 42,
        head: [['Rol', 'Fecha', 'Contenido']],
        body,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        headStyles: { fillColor: [99, 102, 241] },
        columnStyles: {
          0: { cellWidth: 20, fontStyle: 'bold' },
          1: { cellWidth: 35 },
          2: { cellWidth: 'auto' },
        },
      });

      const pdfBuf = Buffer.from(doc.output('arraybuffer'));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition',
        `attachment; filename="jarvis-${safeTitle}.pdf"`);
      res.send(pdfBuf);
    } catch (err) {
      next(err);
    }
  },
);
// ─── POST /admin/trigger-summary ─────────────────────────────────────
// Dispara manualmente el resumen semanal (útil para admins que quieren
// forzar la generación ahora sin esperar al lunes 8am).

router.post(
  '/admin/trigger-summary',
  requireAdminOwner,
  async (_req, res, next) => {
    try {
      // Fire & forget — el job corre async, no bloqueamos el response.
      void triggerWeeklySummaryNow();
      res.json({ ok: true, message: 'Resumen semanal disparado en background.' });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /admin/stats ────────────────────────────────────────────────
// Métricas combinadas (cache + rate limit + conversaciones del user).

router.get(
  '/admin/stats',
  requireAdminOwner,
  async (req, res, next) => {
    try {
      const empresaId = req.companyId!;
      res.json({
        cache:    getCacheStats(),
        rateLimit: getRateLimitStats(),
        model:    getModelConfig(),
        // El frontend puede mostrar estos números en un panel de debug.
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /chat/stream (Server-Sent Events) ───────────────────────────
// Stream palabra-por-palabra de la respuesta final, mientras las
// tools se ejecutan de forma determinística en el backend.

const streamSchema = z.object({
  message:         z.string().min(1, 'Mensaje requerido').max(2000),
  // Acepta string o number (la DB es serial int → JSON lo manda como number).
  // Transformamos a string para mantener consistencia en el orquestador.
  conversationId:  z.union([z.string(), z.number()]).optional().nullable()
                    .transform((v) => v == null ? v : String(v)),
});

router.post(
  '/chat/stream',
  requirePermission('jarvis', 'asistente', 'ver'),
  rateLimitJarvis,
  validate(streamSchema),
  async (req, res, next) => {
    try {
      const empresaId = req.companyId!;
      const userId    = Number(String(req.user!.sub).replace(/\D/g, ''));
      if (!userId) throw new ForbiddenError('Sesión sin company-user id.');

      const rol = req.user!.role;
      if (rol !== 'owner_empresa' && rol !== 'admin_empresa') {
        throw new ForbiddenError('Solo administradores de empresa pueden usar el asistente.');
      }

      if (!(await isJarvisEnabledForCompany(empresaId))) {
        res.status(503).json({
          message: 'Asistente IA no configurado para esta empresa. Pedile a tu admin de empresa o al superadmin que configuren una API key.',
        });
        return;
      }

      const body = req.body as z.infer<typeof streamSchema>;

      // Headers SSE.
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // desactiva buffering de nginx
      res.flushHeaders?.();

      const send = (event: string, data: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Heartbeat para mantener conexiones vivas en proxies.
      const heartbeat = setInterval(() => {
        res.write(': ping\n\n');
      }, 15_000);

      try {
        await jarvisChatStream(
          {
            empresaId,
            userId,
            userName:  req.user!.name ?? 'Usuario',
            rol,
            empresaNombre: req.user!.companyName ?? 'Tu empresa',
            message:   body.message,
            conversationId: body.conversationId ?? null,
          },
          { send },
        );
      } catch (err) {
        // Si el orquestador tiró una excepción DESPUÉS de que los
        // headers SSE ya se enviaron, NO podemos llamar next(err) — el
        // errorHandler intentaría setear headers otra vez y explotaría
        // con "Cannot set headers after they are sent".
        //
        // En cambio, mandamos un evento SSE `error` y terminamos el
        // stream limpiamente.
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        // eslint-disable-next-line no-console
        console.error('[jarvis/chat/stream] error:', msg, err);
        try {
          res.write(`event: error\n`);
          res.write(`data: ${JSON.stringify({ message: 'Error interno: ' + msg })}\n\n`);
        } catch {
          // res ya está cerrado — nada que hacer.
        }
      } finally {
        clearInterval(heartbeat);
        if (!res.writableEnded) res.end();
      }
    } catch (err) {
      // Este catch es para errores ANTES de enviar headers SSE (auth,
      // validate, isJarvisEnabled). Ahí sí podemos delegar a Express.
      next(err);
    }
  },
);

// ─── POST /voice ──────────────────────────────────────────────────────────────
// Recibe audio crudo del navegador (webm/wav/ogg) desde el hold-to-talk,
// transcribe con Whisper (Groq), pasa el texto por la cascada de chat
// (jarvisChat) y devuelve la respuesta en texto + audio MP3 (ElevenLabs).

/**
 * Transcodifica un buffer de audio (webm/opus/mp4/ogg) a WAV PCM 16 kHz
 * mono usando ffmpeg (vía fluent-ffmpeg). Lo usamos porque Whisper a
 * veces rechaza contenedores webm truncados (header EBML presente pero
 * sin samples), especialmente cuando el usuario suelta el hold-to-talk
 * muy rápido. WAV PCM crudo siempre es válido para Whisper.
 *
 * Devuelve `Buffer` con el WAV (header RIFF + data). Lanza si ffmpeg
 * falla.
 */
function transcodeToWavPcm16k(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const out = new PassThrough();
    out.on('data', (c: Buffer) => chunks.push(c));
    out.on('end',  () => resolve(Buffer.concat(chunks)));
    out.on('error', reject);

    const cmd = ffmpeg()
      .input(input)
      .inputFormat('auto')
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('error', (err) => reject(err))
      .on('end',  () => { /* el stream 'out' ya disparó end */ })
      .pipe(out, { end: true });

    // Si el pipe se cierra prematuramente por error, reject.
    cmd.on('error', () => { /* ya manejado arriba */ });
  });
}
//
// Request:  multipart/form-data
//   - audio           Blob (webm/opus/wav/ogg/mp4). Máx 8 MB.
//   - conversationId  (opcional) string|number
//   - voice           (opcional) VoiceId ElevenLabs
//
// Response: 200
//   {
//     transcript:     "texto transcrito por Whisper",
//     answer:         "respuesta de Jarvis",
//     conversationId: "string|null",
//     audioBase64:    "base64(mp3)" | null,
//     audioMime:      "audio/mpeg" | null,
//     latencyMs:      1234,
//     healedKey:      boolean,
//   }

const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB — chunks cortos
  fileFilter: (_req, file, cb) => {
    const ok = [
      'audio/webm',
      'audio/ogg',
      'audio/opus',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/mpeg',
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a',
      '',
    ].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(new AppError(400, `Mime de audio no soportado: ${file.mimetype || '(vacío)'}.`));
  },
});

router.post(
  '/voice',
  requirePermission('jarvis', 'asistente', 'ver'),
  rateLimitJarvis,
  voiceUpload.single('audio'),
  async (req, res, next) => {
    const t0 = Date.now();
    try {
      const empresaId = req.companyId!;
      const userId    = Number(String(req.user!.sub).replace(/\D/g, ''));
      if (!userId) throw new ForbiddenError('Sesión sin company-user id.');

      if (!(await isJarvisEnabledForCompany(empresaId))) {
        res.status(503).json({
          transcript: '',
          answer: 'El asistente IA no está disponible para esta empresa.',
          noData: true,
        });
        return;
      }

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file || !file.buffer || file.size === 0) {
        throw new AppError(400, 'Falta el archivo "audio" (multipart).');
      }

      // 1) STT: Whisper large-v3. Idioma fijo 'es' (decisión producto).
      // jul 2026 v7 — multi-tenant: usa la key de Groq de la empresa.
      const groq = await getGroqClientForCompany(empresaId);
      if (!groq) throw new AppError(503, 'No hay API key de Groq para esta empresa.');

      // Whisper a veces rechaza webm/opus si el contenedor quedó truncado
      // (header EBML presente pero cluster de samples vacío — típico
      // cuando el usuario suelta el botón a los ~200-300ms). Para blindar
      // esto, transcodificamos SIEMPRE a WAV PCM 16k mono con ffmpeg
      // antes de mandar a Whisper. Si ffmpeg falla por algún motivo,
      // caemos al envío directo del contenedor original.
      const inputMime = file.mimetype || '';
      const inputExt = (file.originalname?.split('.').pop() || '').toLowerCase();
      const isLikelyContainer =
        inputMime.startsWith('audio/webm') ||
        inputMime.startsWith('audio/ogg') ||
        inputMime.startsWith('audio/opus') ||
        inputMime.startsWith('audio/mp4') ||
        inputMime.startsWith('audio/m4a') ||
        ['webm','ogg','opus','mp4','m4a','3gp','mkv','mov'].includes(inputExt);

      let sttBuffer: Buffer = file.buffer;
      let sttFilename = file.originalname || 'voice.bin';
      let sttMime     = inputMime || 'audio/wav';

      if (isLikelyContainer) {
        try {
          const wavBuf = await transcodeToWavPcm16k(file.buffer);
          if (wavBuf && wavBuf.length > 44) { // 44 bytes = header mínimo WAV
            sttBuffer  = wavBuf;
            sttFilename = 'voice.wav';
            sttMime     = 'audio/wav';
          }
        } catch (tcErr) {
          // eslint-disable-next-line no-console
          console.warn('[jarvis/voice] ffmpeg transcode falló, enviando contenedor original:', tcErr);
        }
      }

      // SDK 0.13: pasamos un FileLike (el helper toFile acepta Buffer + name).
      const audioFile = await groqToFile(sttBuffer, sttFilename, { type: sttMime });
      const transcription = await groq.audio.transcriptions.create({
        file: audioFile,
        model:    'whisper-large-v3',
        language: 'es',
        response_format: 'json',
      });

      const transcript = (transcription?.text ?? '').trim();
      if (!transcript) {
        throw new AppError(400, 'Whisper no devolvió texto.');
      }

      // 2) Chat: cascada completa via jarvisChat (tools, persistencia, etc).
      // conversationId puede venir en body (multipart text) o query.
      const convIdRaw =
        (typeof req.body?.conversationId === 'string' && req.body.conversationId) ||
        (typeof req.query.conversationId === 'string' && req.query.conversationId) ||
        (typeof req.query.cid === 'string' && req.query.cid) ||
        undefined;
      const voiceRaw =
        (typeof req.body?.voice === 'string' && req.body.voice) ||
        (typeof req.query.voice === 'string' && req.query.voice) ||
        undefined;

      const chatResult = await jarvisChat({
        empresaId,
        userId,
        userName:  req.user!.name ?? 'Usuario',
        rol:       req.user!.role,
        empresaNombre: req.user!.companyName ?? 'Tu empresa',
        message:   transcript,
        conversationId: convIdRaw ?? null,
      });

      const answerText = chatResult.answer ?? '';

      // 3) TTS: ElevenLabs. Si falla, devolvemos answer sin audio y la app
      // hace fallback a Web Speech API en el cliente.
      let audioBase64: string | null = null;
      let audioMime:  string | null = null;
      try {
        const voiceId: VoiceId =
          voiceRaw && isValidVoice(voiceRaw) ? voiceRaw : DEFAULT_VOICE;
        const tts = await synthesizeSpeechForCompany(answerText, voiceId, empresaId);
        audioBase64 = tts.buffer.toString('base64');
        audioMime   = 'audio/mpeg';
      } catch (ttsErr) {
        // eslint-disable-next-line no-console
        console.warn('[jarvis/voice] TTS falló, devolviendo solo texto:', ttsErr);
      }

      // 4) Auto-rotación: si la última llamada a Groq (Whisper) fue OK,
      // intentamos volver a la key primaria tras el período de gracia.
      const healed = maybeRecoverGroqKey();

      res.json({
        transcript,
        answer:         answerText,
        conversationId: chatResult.conversationId ?? null,
        audioBase64,
        audioMime,
        latencyMs:      Date.now() - t0,
        healedKey:      healed,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;