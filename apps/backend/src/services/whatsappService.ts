// services/whatsappService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Servicio de notificaciones WhatsApp vía WAHA (jul 2026 v8.6).
//
// REEMPLAZA al plan original de Meta Cloud API. WAHA corre en Docker
// dentro de WSL2 (o en cualquier host accesible) y expone una API HTTP
// simple. Sin Business Manager, sin plantillas aprobadas, sin tokens
// de Meta. Texto libre.
//
// ENDPOINT WAHA: POST /api/sendText
//   body: { session: 'default', chatId: '593999999999@c.us', text: string }
//   headers: { 'X-Api-Key': process.env.WAHA_API_KEY }
//
// FLUJO:
//   1. Hook en mantenimientos.ts llama notifyScheduled / notifyFinalized.
//   2. Esa función arma el texto profesional y llama notifyAll(text).
//   3. notifyAll lee WHATSAPP_NOTIFY_NUMBERS del .env (csv) y manda
//      fire-and-forget a cada número.
//   4. Cada envío se loguea en la tabla whatsapp_notifications_log
//      (éxito o error) para debug futuro.
//   5. Si WAHA está caído o devuelve 401/403, el mantenimiento sigue
//      funcionando (no es bloqueante).
//
// VARIABLES DE ENTORNO REQUERIDAS:
//   WAHA_BASE_URL            ej: http://localhost:3000
//   WAHA_API_KEY             string random (la que pusiste al crear el contenedor)
//   WHATSAPP_NOTIFY_NUMBERS  csv de números, formato 593999999999 sin "+"
//
// Para probar:
//   curl -X POST http://localhost:3000/api/sendText \
//     -H "X-Api-Key: $WAHA_API_KEY" \
//     -H "Content-Type: application/json" \
//     -d '{"session":"default","chatId":"593999999999@c.us","text":"hola"}'
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '../db/client';
import { whatsappNotificationsLog } from '../db/schema/whatsapp';

const WAHA_BASE_URL = process.env.WAHA_BASE_URL || 'http://localhost:3000';
const WAHA_API_KEY  = process.env.WAHA_API_KEY || '';
const SESSION_NAME  = process.env.WAHA_SESSION || 'default';

function getNotifyNumbers(): string[] {
  const raw = process.env.WHATSAPP_NOTIFY_NUMBERS || '';
  return raw
    .split(',')
    .map(n => n.trim().replace(/[^\d]/g, '')) // solo dígitos, sin "+"
    .filter(n => n.length > 0);
}

/**
 * Envía un mensaje a UN número. Devuelve { ok, error? }.
 * No lanza — los errores se loguean.
 */
export async function sendWhatsAppMessage(
  to: string,
  text: string,
  eventType: string,
  contextId?: string,
): Promise<{ ok: boolean; error?: string; statusCode?: number }> {
  if (!WAHA_API_KEY) {
    const msg = 'WAHA_API_KEY no configurada en .env';
    console.warn(`[whatsapp] ${msg}`);
    await logNotification(to, eventType, text, false, msg, undefined, contextId);
    return { ok: false, error: msg };
  }
  const chatId = `${to}@c.us`;
  const url = `${WAHA_BASE_URL.replace(/\/$/, '')}/api/sendText`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key':   WAHA_API_KEY,
      },
      body: JSON.stringify({
        session: SESSION_NAME,
        chatId,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const msg = `WAHA respondió ${res.status}: ${body.slice(0, 200)}`;
      console.warn(`[whatsapp] ${to}: ${msg}`);
      await logNotification(to, eventType, text, false, msg, res.status, contextId);
      return { ok: false, error: msg, statusCode: res.status };
    }
    await logNotification(to, eventType, text, true, null, res.status, contextId);
    return { ok: true, statusCode: res.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[whatsapp] ${to}: ${msg}`);
    await logNotification(to, eventType, text, false, msg, undefined, contextId);
    return { ok: false, error: msg };
  }
}

/**
 * Envía un mensaje a una lista de números. Fire-and-forget.
 *
 * (jul 2026 v8.6) — Si pasás `numbers`, usa esa lista explícita (caso
 * multi-tenant: cada empresa tiene su lista). Si NO pasás nada, usa
 * `WHATSAPP_NOTIFY_NUMBERS` del .env (modo single-tenant / fallback
 * global).
 */
export function notifyAll(
  text: string,
  eventType: string,
  contextId?: string,
  numbers?: string[],
): void {
  const target = numbers && numbers.length > 0 ? numbers : getNotifyNumbers();
  if (target.length === 0) {
    console.warn('[whatsapp] lista de números vacía: no se envía nada');
    return;
  }
  // Fire-and-forget: no await. El log se hace dentro de cada send.
  for (const numero of target) {
    void sendWhatsAppMessage(numero, text, eventType, contextId);
  }
}

// ── Mensajes formateados ─────────────────────────────────────────────

// (jul 2026 v8.6) — Helpers de formato reusables por hooks
// multi-tenant. Ecuador, UTC-5, sin DST.
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(dt);
}

export function formatCurrency(n: number | string | null | undefined): string {
  if (n == null) return 'USD 0.00';
  const v = typeof n === 'string' ? Number(n) : n;
  if (!isFinite(v)) return 'USD 0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
  }).format(v);
}

export function formatScheduledMessage(args: {
  plate: string;
  type: string;
  title?: string | null;
  description?: string | null;
  scheduledFor: Date;
  responsibleName: string;
  isFree: boolean;
  createdByName: string;
}): string {
  const fecha = formatDate(args.scheduledFor);
  return [
    `🚗 *Nuevo mantenimiento agendado*`,
    ``,
    `• Vehículo: ${args.plate}`,
    `• Tipo: ${args.type}`,
    args.title ? `• Título: ${args.title}` : null,
    args.description ? `• Descripción: ${args.description}` : null,
    `• Fecha programada: ${fecha}`,
    args.isFree
      ? `• Responsable: Mantenimiento libre (sin asignar)`
      : `• Responsable: ${args.responsibleName}`,
    `• Creado por: ${args.createdByName}`,
  ].filter(Boolean).join('\n');
}

export function formatFinalizedMessage(args: {
  plate: string;
  type: string;
  title?: string | null;
  description?: string | null;
  totalCost: string;
  completedAt: Date;
  responsibleName: string;
  isFree: boolean;
  finalizedByName: string;
  notes?: string | null;
}): string {
  const fecha = formatDate(args.completedAt);
  const lineas = [
    `✅ *Mantenimiento finalizado*`,
    ``,
    `• Vehículo: ${args.plate}`,
    `• Tipo: ${args.type}`,
    args.title ? `• Título: ${args.title}` : null,
    args.description ? `• Descripción: ${args.description}` : null,
    `• Costo total: $${args.totalCost}`,
    `• Fecha de finalización: ${fecha}`,
    args.isFree
      ? `• Responsable: Mantenimiento libre`
      : `• Responsable: ${args.responsibleName}`,
    `• Finalizado por: ${args.finalizedByName}`,
  ];
  if (args.notes) lineas.push(`• Observaciones: ${args.notes}`);
  return lineas.filter(Boolean).join('\n');
}

// ── Log a DB ─────────────────────────────────────────────────────────

async function logNotification(
  to: string,
  eventType: string,
  text: string,
  ok: boolean,
  error: string | null,
  statusCode: number | undefined,
  contextId: string | undefined,
): Promise<void> {
  try {
    await db.insert(whatsappNotificationsLog).values({
      recipient:    to,
      eventType,
      contextId:    contextId ?? null,
      messageText:  text.slice(0, 4000), // truncar para no explotar storage
      ok,
      error:        error ?? null,
      statusCode:   statusCode ?? null,
    });
  } catch (err) {
    // Si falla el log, no es bloqueante. Solo loguear en consola.
    // eslint-disable-next-line no-console
    console.warn('[whatsapp] no pude escribir en log:', err instanceof Error ? err.message : err);
  }
}
