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
import { PassThrough, Readable } from 'stream';
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
import { CATALOG_V3_TOOLS, countByLayer, countByKind } from '../../lib/ai/tools/catalog';
import { getClassifierCacheStats } from '../../lib/ai/tools/intent-classifier';
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
import { cleanForTts } from '../../lib/ai/text-clean';

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
      // ⚠️ CRÍTICO: la empresa SIEMPRE sale del JWT (req.companyId del
      // middleware de auth), NUNCA del body. Si no, cualquiera podría
      // mandar empresaId=99 y obtener TTS de otra empresa.
      const empresaId = req.companyId!;
      const { text, voice: reqVoice } = req.body as z.infer<typeof ttsSchema>;
      const voice: VoiceId =
        reqVoice && isValidVoice(reqVoice) ? reqVoice : DEFAULT_VOICE;

      // Limpiamos SIEMPRE antes de mandar a Kokoro — este endpoint puede
      // recibir texto con markdown crudo (ej. un botón "leer" que toma el
      // texto ya renderizado en pantalla, con **bold**, tablas, etc.)
      console.log('[TTS DEBUG] texto crudo recibido:', JSON.stringify(text).slice(0, 500));
      const cleanText = await cleanForTts(text);
      const result = await synthesizeSpeechForCompany(cleanText, voice, empresaId);
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
        // jul 2026 v8.5 — Pasamos cookie de sesión y baseUrl para que las
        // tools de ACCIÓN puedan hacer fetch autenticado a otros
        // endpoints del backend.
        cookieHeader: req.headers.cookie,
        baseUrl:      process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`,
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
//
// jul 2026 v9 — Rediseño total del PDF (el layout anterior con tablas
// de colores y `doc.text` mezclando tamaños de fuente dentro de la
// misma línea (heading + inline bold) generaba un bug de kerning en
// algunos viewers de PDF: el texto se veía con espacio extra entre
// CADA letra ("A C B 1 2 3") cuando el visor no encontraba el ancho
// correcto de glyph por el cambio de fuente a mitad de render. Ahora
// TODO el documento usa una sola fuente (helvetica) con un único
// tamaño por bloque, nunca mezclado dentro de una misma línea de
// `doc.text`, y el markdown crudo (**bold**, tablas, etc.) se limpia
// ANTES de decidir cómo se dibuja, no se intenta re-renderizar celda
// por celda. Resultado: documento formal, blanco y negro, con
// espaciado generoso y el flujo de la conversación bien diferenciado
// (Tú / Jarvis) como una carta, no como un dashboard.

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
      // jspdf-autotable puede venir con `default` o como named
      // export según el bundler/loader. Tomamos la función
      // explícitamente y la llamamos como `autoTable(doc, {...})`,
      // NO como `doc.autoTable({...})` (ver lib/finance-pdf.ts).
      const autoTableMod = await import('jspdf-autotable');
      const autoTable = (autoTableMod as any).default ?? autoTableMod;

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 24;          // margen amplio de carta formal
      const contentW = pageW - margin * 2;

      // Paleta estrictamente en escala de grises. Nada de color.
      const INK       = 20;   // texto principal (casi negro)
      const INK_SOFT  = 90;   // metadatos
      const INK_FAINT = 150;  // timestamps / footer
      const RULE      = 210;  // líneas separadoras

      const FONT = 'helvetica';
      const SIZE_TITLE = 16;
      const SIZE_META  = 9;
      const SIZE_LABEL = 9;
      const SIZE_BODY  = 10.5;
      const SIZE_HEAD  = 12;

      // Interlineado generoso — este era el problema principal del
      // diseño anterior: todo estaba apretado. 1.6x el tamaño de
      // fuente da un renglón cómodo de leer.
      const bodyLineH = 6;
      const paraGap   = 4;
      const blockGap  = 10;   // espacio entre mensajes (Tú → Jarvis)

      let cursorY = margin;

      const newPageIfNeeded = (needed: number) => {
        if (cursorY + needed > pageH - margin - 8) {
          doc.addPage();
          cursorY = margin;
        }
      };

      const setStyle = (size: number, style: 'normal' | 'bold', gray: number) => {
        doc.setFont(FONT, style);
        doc.setFontSize(size);
        doc.setTextColor(gray, gray, gray);
      };

      const drawHeader = () => {
        cursorY = margin;
        setStyle(SIZE_TITLE, 'normal', INK);
        doc.text('Conversación con Jarvis', margin, cursorY);
        cursorY += 9;

        setStyle(SIZE_META, 'normal', INK_SOFT);
        doc.text(conv.title || '(sin título)', margin, cursorY);
        cursorY += 6;

        setStyle(8, 'normal', INK_FAINT);
        doc.text(
          `Exportado el ${new Date().toLocaleString('es-EC')} · ${messages.length} mensajes`,
          margin, cursorY,
        );
        cursorY += 8;

        doc.setDrawColor(RULE, RULE, RULE);
        doc.setLineWidth(0.3);
        doc.line(margin, cursorY, pageW - margin, cursorY);
        cursorY += blockGap;
      };

      // ── Limpieza de markdown a texto plano ───────────────────
      //
      // No intentamos "renderizar" markdown con tamaños mezclados en
      // la misma línea (esa mezcla fue la causa del bug de espaciado
      // entre letras). En vez de eso: los headings se muestran como
      // una línea en negrita con su propio bloque de texto (fuente
      // única, tamaño único), las listas se aplanan a guiones simples
      // con sangría, y el **bold** inline se elimina, dejando texto
      // plano legible. Las tablas SÍ usan autoTable, pero con una
      // paleta gris — sin fondos de color.

      type Block =
        | { kind: 'heading'; level: number; text: string }
        | { kind: 'paragraph'; text: string }
        | { kind: 'listitem'; text: string; indent: number }
        | { kind: 'table'; rows: string[][] }
        | { kind: 'code'; lines: string[] }
        | { kind: 'space' };

      const stripInlineMd = (s: string) =>
        s
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*([^*]+)\*/g, '$1')
          .replace(/`([^`]+)`/g, '$1');

      const parseBlocks = (raw: string): Block[] => {
        const text = (raw ?? '').replace(/\r\n/g, '\n');
        const lines = text.split('\n');
        const blocks: Block[] = [];
        let i = 0;

        while (i < lines.length) {
          const line = lines[i];

          if (/^```/.test(line)) {
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !/^```/.test(lines[i])) {
              codeLines.push(lines[i]);
              i++;
            }
            i++;
            blocks.push({ kind: 'code', lines: codeLines });
            continue;
          }

          if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
            const parseRow = (l: string) =>
              l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => stripInlineMd(c.trim()));
            const rows: string[][] = [parseRow(line)];
            i += 2;
            while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== '') {
              rows.push(parseRow(lines[i]));
              i++;
            }
            blocks.push({ kind: 'table', rows });
            continue;
          }

          const h = /^(#{1,3})\s+(.*)$/.exec(line);
          if (h) {
            blocks.push({ kind: 'heading', level: h[1].length, text: stripInlineMd(h[2]) });
            i++;
            continue;
          }

          const listMatch = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
          if (listMatch) {
            const indent = listMatch[1].length;
            const isOrdered = /^\d+\./.test(listMatch[2]);
            const bullet = isOrdered ? listMatch[2] + ' ' : '— ';
            blocks.push({ kind: 'listitem', text: bullet + stripInlineMd(listMatch[3]), indent });
            i++;
            continue;
          }

          if (line.trim() === '') {
            blocks.push({ kind: 'space' });
            i++;
            continue;
          }

          blocks.push({ kind: 'paragraph', text: stripInlineMd(line) });
          i++;
        }

        return blocks;
      };

      const renderBlocks = (raw: string) => {
        const blocks = parseBlocks(raw);

        for (const block of blocks) {
          if (block.kind === 'space') {
            cursorY += paraGap;
            continue;
          }

          if (block.kind === 'code') {
            setStyle(9, 'normal', INK);
            doc.setFont('courier', 'normal');
            for (const cl of block.lines) {
              const wrapped = doc.splitTextToSize(cl || ' ', contentW - 6);
              for (const w of wrapped) {
                newPageIfNeeded(bodyLineH);
                doc.text(w, margin + 3, cursorY);
                cursorY += bodyLineH;
              }
            }
            cursorY += paraGap;
            continue;
          }

          if (block.kind === 'table') {
            newPageIfNeeded(20);
            autoTable(doc, {
              startY: cursorY,
              head: [block.rows[0]],
              body: block.rows.slice(1),
              margin: { left: margin, right: margin },
              theme: 'grid',
              styles: {
                font: FONT,
                fontSize: 9.5,
                cellPadding: 3,
                overflow: 'linebreak',
                lineColor: [RULE, RULE, RULE],
                lineWidth: 0.2,
                textColor: [INK, INK, INK],
                fillColor: [255, 255, 255],
              },
              headStyles: {
                fillColor: [255, 255, 255],
                textColor: [INK, INK, INK],
                fontStyle: 'bold',
                lineWidth: 0.3,
                lineColor: [INK, INK, INK],
              },
              alternateRowStyles: { fillColor: [255, 255, 255] },
            });
            // @ts-ignore
            cursorY = (doc as any).lastAutoTable.finalY + blockGap;
            continue;
          }

          if (block.kind === 'heading') {
            const size = block.level === 1 ? SIZE_HEAD + 2 : block.level === 2 ? SIZE_HEAD : SIZE_HEAD - 1;
            newPageIfNeeded(bodyLineH + 6);
            setStyle(size, 'bold', INK);
            const wrapped = doc.splitTextToSize(block.text, contentW);
            for (const w of wrapped) {
              doc.text(w, margin, cursorY);
              cursorY += bodyLineH + 1;
            }
            cursorY += paraGap;
            continue;
          }

          if (block.kind === 'listitem') {
            setStyle(SIZE_BODY, 'normal', INK);
            const indentX = margin + block.indent * 3;
            const wrapped = doc.splitTextToSize(block.text, contentW - block.indent * 3);
            for (const w of wrapped) {
              newPageIfNeeded(bodyLineH);
              doc.text(w, indentX, cursorY);
              cursorY += bodyLineH;
            }
            continue;
          }

          // paragraph
          setStyle(SIZE_BODY, 'normal', INK);
          const wrapped = doc.splitTextToSize(block.text, contentW);
          for (const w of wrapped) {
            newPageIfNeeded(bodyLineH);
            doc.text(w, margin, cursorY);
            cursorY += bodyLineH;
          }
          cursorY += paraGap;
        }
      };

      const ROLE_LABEL: Record<string, string> = {
        user: 'TÚ',
        assistant: 'JARVIS',
        system: 'SISTEMA',
        tool: 'HERRAMIENTA',
      };

      // ── Render del documento: carta formal, turno por turno ──
      drawHeader();

      messages.forEach((m, idx) => {
        const role = m.role || 'user';
        const label = ROLE_LABEL[role] ?? role.toUpperCase();

        newPageIfNeeded(24);

        // Encabezado de turno: etiqueta en negrita a la izquierda,
        // timestamp fino a la derecha. Misma fuente, mismo tamaño en
        // toda la línea — nunca mezclamos tamaños dentro de un
        // mismo doc.text().
        setStyle(SIZE_LABEL, 'bold', INK);
        doc.text(label, margin, cursorY);

        setStyle(8, 'normal', INK_FAINT);
        const ts = new Date(m.createdAt).toLocaleString('es-EC', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit',
        });
        doc.text(ts, pageW - margin, cursorY, { align: 'right' });

        cursorY += 8;

        renderBlocks(m.content);

        cursorY += blockGap - paraGap;

        if (idx < messages.length - 1) {
          newPageIfNeeded(6);
          doc.setDrawColor(RULE, RULE, RULE);
          doc.setLineWidth(0.2);
          doc.line(margin, cursorY, pageW - margin, cursorY);
          cursorY += blockGap;
        }
      });

      // Footer por página.
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        setStyle(8, 'normal', INK_FAINT);
        doc.text(
          `Jarvis · página ${p} de ${totalPages}`,
          pageW / 2,
          pageH - 12,
          { align: 'center' },
        );
      }

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
        // jul 2026 v3 — Métricas del clasificador de tools.
        // Permite al panel de admin ver cuántas veces el clasificador
        // evitó enviar el schema completo (ahorro de tokens).
        classifier: {
          catalog: {
            total: CATALOG_V3_TOOLS.length,
            byLayer: countByLayer(CATALOG_V3_TOOLS),
            byKind: countByKind(CATALOG_V3_TOOLS),
          },
          cache: getClassifierCacheStats(),
          // Métricas Prometheus:
          // - jarvis_classifier_calls_total
          // - jarvis_classifier_errors_total
          // - jarvis_classifier_needs_write_total
        },
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
  // jul 2026 v3 — modo voz: el frontend lo manda true cuando la
  // pregunta viene del wake word / STT. El orquestador pasa este flag
  // al shared-prompt, que cambia las reglas de formato (sin markdown,
  // sin tablas, sin bullets) para que la respuesta sea leíble por TTS.
  voiceMode:       z.boolean().optional().default(false),
  // jul 2026 v3 — currentModule: ruta actual del user (ej.
  // "/mantenimiento", "/reportes"). Se pasa como PISTA al
  // clasificador, NO como override. El LLM sigue decidiendo qué
  // tools cargar — el user puede preguntar sobre otro módulo
  // estando en otra ruta.
  currentModule:   z.string().optional().nullable(),
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
            voiceMode: body.voiceMode ?? false,
            currentModule: body.currentModule ?? null,
            // jul 2026 v8.5 — cookieHeader y baseUrl para tools de acción.
            cookieHeader: req.headers.cookie,
            baseUrl:      process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`,
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

    // jul 2026 v8.6 — NO usar inputFormat('auto'): a veces ffmpeg
    // autodetecta mal el contenedor (especialmente webm truncados del
    // MediaRecorder) y tira "Invalid input" antes de intentar parsear.
    // Sin hint, ffmpeg prueba TODOS los demuxers y suele tener éxito.
    //
    // NOTA: fluent-ffmpeg no acepta Buffer directo en .input() (en
    // algunas versiones de tipos). Lo envolvemos en un Readable.from()
    // que es más portable.
    const inputStream = Readable.from(input);
    const cmd = ffmpeg()
      .input(inputStream)
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

      // jul 2026 v8.6 — Wake word flow (Vosk STT local en el browser).
      // Si el query trae __skipStt=1, el frontend ya transcribió el
      // audio con Vosk y nos manda el texto en un form field `text`.
      // Saltamos Whisper + ffmpeg completamente y vamos directo al
      // chat. Esto baja la latencia de ~6s a ~3s y elimina el 400
      // "Invalid input" cuando el contenedor webm viene corrupto.
      const skipStt = req.query.__skipStt === '1' || req.query.skipStt === '1';
      const textFromBody = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

      if (skipStt) {
        if (!textFromBody) {
          throw new AppError(400, 'Falta el campo "text" cuando __skipStt=1.');
        }
        // Saltamos directo al chat con el texto pre-transcrito.
        return await handleVoiceChatWithText(
          req,
          res,
          empresaId,
          userId,
          textFromBody,
          // (jul 2026 v8.6) — Historial de la conversación de voz
          // (acumulado en el frontend). El backend lo pasa al LLM
          // como contexto multi-turn sin persistir.
          Array.isArray(req.body?.history) ? req.body.history : [],
          t0,
        );
      }

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
          } else {
            // jul 2026 v8.6 — ffmpeg devolvió un WAV vacío o demasiado
            // chico (header solo). El contenedor original casi seguro
            // también va a fallar en Whisper. Devolvemos 400 claro
            // para que el frontend sepa que reintente.
            throw new AppError(
              400,
              'El audio grabado está vacío o corrupto. Mantené presionado el botón de micrófono al menos 1 segundo antes de soltarlo.',
            );
          }
        } catch (tcErr) {
          if (tcErr instanceof AppError) throw tcErr;
          // jul 2026 v8.6 — antes caíamos al contenedor original, pero
          // Whisper también lo rechazaba con "could not process file".
          // Ahora devolvemos 400 directo: el contenedor está mal y no
          // tiene sentido reintentarlo con la misma entrada.
          // eslint-disable-next-line no-console
          console.warn('[jarvis/voice] ffmpeg transcode falló:', tcErr);
          throw new AppError(
            400,
            'No pude procesar el audio grabado. Asegurate de hablar al menos 1 segundo y que el micrófono no esté silenciado.',
          );
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
        // jul 2026 v8.5 — Voice mode (respuesta hablada) + cookieHeader/baseUrl.
        voiceMode: true,
        cookieHeader: req.headers.cookie,
        baseUrl:      process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`,
      });

      // jul 2026 v8.6 — Usamos `answerSpoken` (limpio) para el TTS, no
      // `answer` (con markdown). Si por alguna razón no viene, caemos
      // al answer normal (defensa redundante).
      const answerText = chatResult.answerSpoken || chatResult.answer || '';

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

/**
 * jul 2026 v8.6 — Wake word flow (Vosk STT local en el browser).
 *
 * Helper que ejecuta el chat + TTS sin pasar por Whisper. Usado cuando
 * el frontend manda `?__skipStt=1` con un campo `text` pre-transcrito
 * por Vosk. Salva ~2-3s vs el flujo tradicional con Whisper + ffmpeg.
 *
 * Comparte el response shape del endpoint /voice original.
 */
async function handleVoiceChatWithText(
  req: any,
  res: any,
  empresaId: number,
  userId: number,
  transcript: string,
  ephemeralHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  t0: number,
): Promise<void> {
  // jul 2026 v8.5 — Voice mode + cookieHeader/baseUrl para tools
  // de acción que pegan al backend vía HTTP.
  const convIdRaw =
    (typeof req.body?.conversationId === 'string' && req.body.conversationId) ||
    (typeof req.query.conversationId === 'string' && req.query.conversationId) ||
    (typeof req.query.cid === 'string' && req.query.cid) ||
    undefined;
  const voiceRaw =
    (typeof req.body?.voice === 'string' && req.body.voice) ||
    (typeof req.query.voice === 'string' && req.query.voice) ||
    undefined;
  void convIdRaw; // en ephemeral el conversationId se ignora.

  const chatResult = await jarvisChat({
    empresaId,
    userId,
    userName:  req.user!.name ?? 'Usuario',
    rol:       req.user!.role,
    empresaNombre: req.user!.companyName ?? 'Tu empresa',
    message:   transcript,
    // (jul 2026 v8.6) — Modo ephemeral: el wake word → STT → jarvis
    // NO persiste la conversación. El user quiere una respuesta
    // hablada sin que aparezca en su historial de chat.
    // Pero para dar continuidad multi-turn (el LLM tiene contexto
    // de los turnos previos), le mandamos el historial en memoria.
    conversationId: null,
    voiceMode: true,
    ephemeral:  true,
    ephemeralHistory,
    cookieHeader: req.headers.cookie,
    baseUrl:      process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`,
  });

  const answerText = chatResult.answerSpoken || chatResult.answer || '';

  // TTS ElevenLabs con fallback a "sin audio" si falla.
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

  res.json({
    transcript,
    answer:         answerText,
    conversationId: chatResult.conversationId ?? null,
    audioBase64,
    audioMime,
    latencyMs:      Date.now() - t0,
    healedKey:      false, // no hubo Whisper, no aplica auto-recovery
  });
}

export default router;