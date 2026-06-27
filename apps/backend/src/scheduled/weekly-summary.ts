// scheduled/weekly-summary.ts
// ─────────────────────────────────────────────────────────────────────
// Genera un resumen semanal automático de la operación de cada empresa.
// Corre todos los lunes a las 08:00 (America/Guayaquil) usando node-cron.
//
// El resumen se guarda como un nuevo mensaje en una conversación
// "summaries" del usuario admin/owner principal de la empresa. NO
// requiere que el usuario esté conectado.
//
// Para activarlo, importar `startScheduledJobs()` desde el bootstrap del
// servidor. Se puede apagar con `stopScheduledJobs()`.
// ─────────────────────────────────────────────────────────────────────

import cron from 'node-cron';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { companies, companyUsers } from '../db/schema/platform';
import { aiConversations, aiMessages } from '../db/schema/jarvis';
import { jarvisChat } from '../lib/ai/jarvis';
import { toolCache } from '../lib/ai/tool-cache';

const CRON_EXPR = '0 8 * * 1'; // lunes 08:00
const TIMEZONE = 'America/Guayaquil';

let task: cron.ScheduledTask | null = null;

/**
 * Calcula el rango de fechas de la semana pasada (lunes 00:00 a
 * domingo 23:59:59, hora Ecuador).
 */
function lastWeekRangeEc(now = new Date()): { desde: string; hasta: string } {
  // Ajuste a hora Ecuador (UTC-5).
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const ecNow = new Date(utcMs - 5 * 60 * 60 * 1000);

  // Lunes de esta semana (00:00 EC).
  const day = ecNow.getUTCDay(); // 0=domingo, 1=lunes
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const mondayThisWeek = new Date(ecNow);
  mondayThisWeek.setUTCDate(ecNow.getUTCDate() + diffToMonday);
  mondayThisWeek.setUTCHours(0, 0, 0, 0);

  // Lunes de la semana pasada.
  const mondayLastWeek = new Date(mondayThisWeek);
  mondayLastWeek.setUTCDate(mondayThisWeek.getUTCDate() - 7);
  const sundayLastWeek = new Date(mondayThisWeek);
  sundayLastWeek.setUTCDate(mondayThisWeek.getUTCDate() - 1);
  sundayLastWeek.setUTCHours(23, 59, 59, 999);

  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return { desde: fmt(mondayLastWeek), hasta: fmt(sundayLastWeek) };
}

/** Construye el prompt del resumen en lenguaje natural. */
function buildSummaryPrompt(empresaNombre: string, desde: string, hasta: string): string {
  return `Genera un RESUMEN SEMANAL de la operación de la empresa "${empresaNombre}" para el período del ${desde} al ${hasta}.

Usa las herramientas disponibles para traer estos datos:
1. Mantenimientos realizados en la semana (getMantenimientos con desde/hasta).
2. Combustible consumido en la semana (getCombustible con desde/hasta).
3. Seguros que vencen en los próximos 30 días (getSeguros con porVencer=true, dias=30).
4. Checklists pendientes o vencidos.
5. Asignaciones activas.

Devuelve un resumen ejecutivo breve en 4-6 viñetas con los hallazgos clave. Incluye números absolutos y, si podes, observaciones (ej. "incremento del 12% en combustible vs semana anterior").`;
}

/** Asegura una conversación "summaries" para el usuario. */
async function ensureSummaryConversation(empresaId: number, userId: number): Promise<string> {
  const id = `summary-${empresaId}-${userId}`;
  const [existing] = await db
    .select({ id: aiConversations.id })
    .from(aiConversations)
    .where(eq(aiConversations.id, id))
    .limit(1);
  if (existing) return existing.id;

  await db.insert(aiConversations).values({
    id,
    empresaId,
    userId,
    title: 'Resúmenes semanales',
  });
  return id;
}

/** Genera y guarda el resumen para una empresa/usuario. */
async function runWeeklySummaryForEmpresa(
  empresaId: number,
  empresaNombre: string,
  userId: number,
  userName: string,
): Promise<void> {
  try {
    const { desde, hasta } = lastWeekRangeEc();
    const convId = await ensureSummaryConversation(empresaId, userId);
    const prompt = buildSummaryPrompt(empresaNombre, desde, hasta);

    // Llamamos jarvisChat SIN streaming — es un job background.
    const result = await jarvisChat({
      empresaId,
      userId,
      userName,
      rol: 'owner_empresa',
      empresaNombre,
      conversationId: convId,
      message: prompt,
    });

    // Invalida cache de esta empresa para que la próxima lectura sea fresca.
    toolCache.invalidate(empresaId);

    console.log(
      `[weekly-summary] OK empresa=${empresaId} user=${userId} ` +
      `latency=${result.latencyMs}ms tools=${result.toolsUsed?.length ?? 0}`,
    );
  } catch (err) {
    console.error(
      `[weekly-summary] FAIL empresa=${empresaId} user=${userId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** Itera todas las empresas y genera resumen para el admin/owner principal. */
async function runAllWeeklySummaries(): Promise<void> {
  const start = Date.now();
  console.log('[weekly-summary] tick @', new Date().toISOString());

  // 1) Listar todas las empresas activas.
  const empresas = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.status, 'active'))
    .limit(500);

  for (const emp of empresas) {
    // 2) Para cada empresa, tomar el primer admin/owner (el más antiguo).
    const [owner] = await db
      .select({
        id: companyUsers.id,
        firstName: companyUsers.firstName,
        lastName: companyUsers.lastName,
      })
      .from(companyUsers)
      .where(and(
        eq(companyUsers.companyId, emp.id),
        sql`${companyUsers.role} IN ('owner_empresa', 'admin_empresa')`,
        eq(companyUsers.status, 'active'),
      ))
      .orderBy(companyUsers.createdAt)
      .limit(1);

    if (!owner) continue;
    const userName = `${owner.firstName} ${owner.lastName}`.trim() || 'Administrador';

    await runWeeklySummaryForEmpresa(emp.id, emp.name, owner.id, userName);
  }

  console.log(`[weekly-summary] done in ${Date.now() - start}ms`);
}

/** Inicia los jobs programados. Llamar una vez al arrancar el server. */
export function startScheduledJobs(): void {
  if (task) return;
  task = cron.schedule(CRON_EXPR, () => void runAllWeeklySummaries(), {
    timezone: TIMEZONE,
  });
  console.log(`[weekly-summary] cron scheduled "${CRON_EXPR}" (${TIMEZONE})`);
}

/** Detiene los jobs (útil en tests). */
export function stopScheduledJobs(): void {
  if (task) {
    task.stop();
    task = null;
  }
}

/** Ejecuta manualmente (para tests / trigger desde admin). */
export async function triggerWeeklySummaryNow(): Promise<void> {
  await runAllWeeklySummaries();
}