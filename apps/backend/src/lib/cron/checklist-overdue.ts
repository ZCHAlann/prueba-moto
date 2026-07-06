// lib/cron/checklist-overdue.ts
// ─────────────────────────────────────────────────────────────────────
// Cron que persiste los checklists vencidos del ciclo anterior como
// filas reales en `company_checklists` con status='Vencido'.
//
// Antes de este cron, GET /checklists/vencidos calculaba los vencidos
// on-demand (sin persistir nada). Eso significaba:
//   - Sin historial permanente.
//   - Imposible cruzar con "se hizo tarde con autorización".
//   - Sin forma de que el operador pidiera permiso para hacer uno atrasado.
//
// Ahora el cron persiste cada "vencido virtual" como una fila con:
//   - status = 'Vencido'
//   - cycleStart / cycleEnd / windowEnd = ventana del ciclo que cerró
//   - isLate = false (no se hizo)
//   - reauthRequestId = null
//
// Idempotencia: antes de insertar, verifica si ya existe una fila
// 'Vencido' para (companyId, categoryId, assetId, cycleStart). Si
// existe, NO la duplica (el cron puede correr varias veces al día o
// tras un restart sin efectos secundarios).
//
// Por scope:
//   - scopeKind != 'pick': una fila 'Vencido' por cada asset que no hizo.
//   - scopeKind == 'pick' : una sola fila 'Vencido' a nivel categoría con
//     assetId=null (representa "los que no hicieron el pick"). Documentado
//     como decisión consciente — evita ensuciar el historial con N filas
//     una por cada usuario.
//
// Solo se activa si `CHECKLIST_OVERDUE_CRON_ENABLED === 'true'`.
// ─────────────────────────────────────────────────────────────────────

import cron from 'node-cron';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyChecklists,
  companyChecklistCategories,
} from '../../db/schema/operational';
import { deriveAssetsForCategory } from '../checklist-helpers';
import { previousCycle, type CadenceKind } from '../periodicity';
import { notifyAdmins } from '../notification-service';

let started = false;

/**
 * Sweep principal: para cada empresa × cada categoría con periodicidad,
 * detecta los pendientes del ciclo anterior y los persiste como 'Vencido'.
 *
 * Devuelve la cantidad de filas insertadas.
 */
export async function runOverdueChecklists(): Promise<number> {
  const now = new Date();

  // 1) Empresas que tienen al menos una categoría con periodicidad.
  //    Tomamos solo las categorías candidatas para acotar el query.
  const cats = await db
    .select({
      id: companyChecklistCategories.id,
      companyId: companyChecklistCategories.companyId,
      name: companyChecklistCategories.name,
      cadenceKind: companyChecklistCategories.cadenceKind,
      cadenceDays: companyChecklistCategories.cadenceDays,
      windowDays: companyChecklistCategories.windowDays,
      createdAt: companyChecklistCategories.createdAt,
      scopeKind: companyChecklistCategories.scopeKind,
      scopeAssetType: companyChecklistCategories.scopeAssetType,
      scopeSiteId: companyChecklistCategories.scopeSiteId,
    })
    .from(companyChecklistCategories)
    .where(sql`${companyChecklistCategories.cadenceKind} IN ('weekly', 'days')`);

  if (!cats.length) return 0;

  // Agrupar categorías por empresa para no repetir trabajo.
  const byCompany = new Map<number, typeof cats>();
  for (const c of cats) {
    const arr = byCompany.get(c.companyId) ?? [];
    arr.push(c);
    byCompany.set(c.companyId, arr);
  }

  let inserted = 0;
  // Para notificar al final agrupado por empresa: empresaId -> count
  const overdueByCompany = new Map<number, number>();

  for (const [companyId, categories] of byCompany) {
    for (const cat of categories) {
      const prev = previousCycle(
        {
          cadenceKind: cat.cadenceKind as CadenceKind,
          cadenceDays: cat.cadenceDays,
          windowDays: cat.windowDays,
          createdAt: cat.createdAt,
        },
        now,
      );
      if (!prev) continue;

      if (cat.scopeKind === 'pick') {
        // Para 'pick': NO pre-derivamos assets (el usuario elige al hacer).
        // Una sola fila 'Vencido' a nivel categoría con assetId=null,
        // que representa "los inspectores que NO hicieron el pick de este
        // ciclo". El frontend la muestra una sola vez, no se duplica por
        // usuario (decisión consciente: no ensuciar el historial).
        const exists = await db
          .select({ id: companyChecklists.id })
          .from(companyChecklists)
          .where(and(
            eq(companyChecklists.companyId, companyId),
            eq(companyChecklists.categoryId, cat.id),
            eq(companyChecklists.status, 'Vencido'),
            isNull(companyChecklists.assetId),
            eq(companyChecklists.cycleStart, prev.start),
          ))
          .limit(1);

        if (exists.length > 0) continue;

        await db.insert(companyChecklists).values({
          companyId,
          categoryId: cat.id,
          assetId: null,
          driverId: null,
          inspectorId: null,
          targetKind: 'Otro',
          targetLabel: '(activo no seleccionado)',
          date: prev.end.toISOString().slice(0, 10),
          status: 'Vencido',
          summary: `Plantilla "${cat.name}" — pick no realizado en el ciclo ${prev.label}.`,
          items: [],
          photoUrls: [],
          cycleStart: prev.start,
          cycleEnd:   prev.end,
          windowEnd:  prev.windowEnd,
          isLate: false,
          reauthRequestId: null,
        });
        inserted++;
        overdueByCompany.set(companyId, (overdueByCompany.get(companyId) ?? 0) + 1);
        continue;
      }

      // scopeKind 'site_assets' o 'asset_type': una fila por cada asset
      // que NO tenga un checklist dentro de [cycleStart, cycleEnd).
      // userSiteId=null en este path porque el cron no tiene contexto de
      // usuario individual — usa el fallback "todos los de la empresa".
      const assets = await deriveAssetsForCategory(companyId, cat, null);
      if (!assets.length) continue;

      // Set de assetIds que SÍ hicieron el checklist en el ciclo.
      // (Filtramos por el mismo criterio que /vencidos on-demand: cualquier
      // inspector, no uno específico — porque "vencido" significa "nadie
      // de la empresa lo hizo en este ciclo".)
      const madeRows = await db
        .select({ assetId: companyChecklists.assetId })
        .from(companyChecklists)
        .where(and(
          eq(companyChecklists.companyId, companyId),
          eq(companyChecklists.categoryId, cat.id),
          sql`${companyChecklists.assetId} IN ${assets.map((a) => a.id)}`,
          sql`${companyChecklists.createdAt} >= ${prev.start}`,
          sql`${companyChecklists.createdAt} <  ${prev.end}`,
          sql`${companyChecklists.status} IN ('Aprobado', 'Observado', 'Pendiente', 'Rechazado')`,
        ));

      const madeAssetIds = new Set(
        madeRows.map((r) => r.assetId).filter((x): x is number => x != null),
      );

      for (const a of assets) {
        if (madeAssetIds.has(a.id)) continue;

        // Idempotencia: ¿ya existe una fila 'Vencido' para este (cat, asset, ciclo)?
        const exists = await db
          .select({ id: companyChecklists.id })
          .from(companyChecklists)
          .where(and(
            eq(companyChecklists.companyId, companyId),
            eq(companyChecklists.categoryId, cat.id),
            eq(companyChecklists.assetId, a.id),
            eq(companyChecklists.status, 'Vencido'),
            eq(companyChecklists.cycleStart, prev.start),
          ))
          .limit(1);

        if (exists.length > 0) continue;

        const targetLabel = a.plate ? `${a.name} · ${a.plate}` : a.name;
        await db.insert(companyChecklists).values({
          companyId,
          categoryId: cat.id,
          assetId: a.id,
          driverId: null,
          inspectorId: null,
          targetKind: 'Vehiculo',
          targetLabel,
          date: prev.end.toISOString().slice(0, 10),
          status: 'Vencido',
          summary: `Pendiente del ciclo ${prev.label}.`,
          items: [],
          photoUrls: [],
          cycleStart: prev.start,
          cycleEnd:   prev.end,
          windowEnd:  prev.windowEnd,
          isLate: false,
          reauthRequestId: null,
        });
        inserted++;
        overdueByCompany.set(companyId, (overdueByCompany.get(companyId) ?? 0) + 1);
      }
    }
  }

  // ── Notificaciones (resumen por empresa) ────────────────────────────────────
  // Una sola notif por empresa con el total, no por cada fila (evita spam).
  for (const [companyId, count] of overdueByCompany) {
    try {
      await notifyAdmins(companyId, {
        kind:    'checklist_overdue',
        title:   `${count} checklist${count !== 1 ? 's' : ''} vencido${count !== 1 ? 's' : ''}`,
        body:    `El ciclo cerró sin que se completaran. Operadores pueden pedir reautorización.`,
        payload: {
          count,
          cycleStart: undefined, // se llenaría por empresa si fuera útil
        },
      });
    } catch (err) {
      console.warn('[cron] checklist-overdue notify falló (no crítico):', (err as Error).message);
    }
  }

  return inserted;
}

/**
 * Registra el job diario. 00:10 EC = 05:10 UTC (un poco después del
 * cron de mantenimiento para no chocar).
 *
 * Expresión cron: '10 5 * * *' → minuto 10, hora 5 UTC, todos los días.
 *
 * Se activa con `CHECKLIST_OVERDUE_CRON_ENABLED === 'true'`. Si la env
 * no está, el job queda apagado (igual que los demás crons del módulo).
 */
export function startChecklistOverdueCron() {
  if (started) return;
  if (process.env.CHECKLIST_OVERDUE_CRON_ENABLED !== 'true') {
    console.log('[cron] CHECKLIST_OVERDUE_CRON_ENABLED != true → cron checklist-overdue apagado.');
    return;
  }
  started = true;

  cron.schedule('10 5 * * *', async () => {
    try {
      const n = await runOverdueChecklists();
      if (n > 0) console.log(`[cron] checklist-overdue: ${n} checklists persistidos como Vencido.`);
    } catch (err) {
      console.error('[cron] checklist-overdue error:', err);
    }
  });

  console.log('[cron] checklist-overdue registrado (diario 00:10 EC / 05:10 UTC).');
}