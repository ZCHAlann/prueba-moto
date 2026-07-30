// routes/company/driver-schedule.ts
// ─────────────────────────────────────────────────────────────────────────────
// jul 2026 — Horario de conductores (driver_time_off).
//
// Regla de negocio: el admin define, por mes, qué conductores están libres
// cada día. NO bloquea asignación a mantenimientos (es solo informativo).
//
// Endpoints:
//   GET    /driver-schedule?from=&to=           → entradas en rango, agrupadas por día
//   GET    /driver-schedule/has-any?month=&year= → bool: ¿hay algo ese mes?
//   GET    /driver-schedule/by-asset?from=&to= → map assetId → [freeDates] (para el calendario de mantenimientos)
//   POST   /driver-schedule                     → upsert (driverId, date)
//   POST   /driver-schedule/bulk                → bulk insert N entries (para el patrón)
//   DELETE /driver-schedule/:id                 → borrar
//   POST   /driver-schedule/copy-from-previous → copia el mes anterior al mes actual
//
// Permisos:
//   - requireModule('gestion', 'conductores')        → ver
//   - requirePermission('gestion', 'conductores', 'crear' | 'editar' | 'eliminar')
//   - superadmin / owner_empresa / admin_empresa → bypass vía requirePermission
//
// jul 2026 v5 — Migrado de `gestion.horario_conductores` a
// `gestion.conductores`. El schedule de conductores es funcionalmente
// parte del módulo Conductores (vive como TAB dentro de
// /operaciones/conductores). Por eso los permisos que gatean los
// endpoints son los mismos que los de la página de Conductores.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyAssets, companyAssignments, companyDrivers, driverTimeOff } from '../../db/schema/operational';
import { requireModule } from '../../middlewares/requireModule';
import { requirePermission } from '../../middlewares/requirePermission';
import { validate } from '../../lib/validate';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString } from '../../lib/validators';

const router = Router({ mergeParams: true });

// jul 2026 — Cache-Control no-store en TODAS las respuestas de este
// router. El schedule cambia seguido (cada entry que se crea/modifica
// cambia el response) y el browser cacheaba las respuestas iniciales
// con 304 Not Modified, devolviendo la copia vieja. No-store fuerza
// al browser a SIEMPRE ir al server. Aplica a GET y POST.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

// ─── Schemas ────────────────────────────────────────────────────────────────

// jul 2026 — Lista de reasons permitidos. Mantengo solo 'libre' por ahora
// (los demás son "futuro": vacaciones, permiso, enfermedad). El campo es
// nullable en DB; si no viene en el POST, queda null.
const reasonSchema = z.enum(['libre', 'vacaciones', 'permiso', 'enfermedad']).nullable().optional();

const createSchema = z.object({
  driverId: z.number().int().positive(),
  date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  reason:   reasonSchema,
  notes:    safeString({ max: 500, allowEmpty: true }).nullable().optional(),
});

const copySchema = z.object({
  targetMonth: z.coerce.number().int().min(1).max(12).optional(),
  targetYear:  z.coerce.number().int().min(2000).max(2100).optional(),
  sourceMonth: z.coerce.number().int().min(1).max(12).optional(),
  sourceYear:  z.coerce.number().int().min(2000).max(2100).optional(),
});

const idParamSchema = z.object({
  // Acepta `dto-13` (formato serializado) o `13` puro. parseId('dto', ...) maneja ambos.
  // jul 2026 — antes era `/^\d+$/` que rechazaba `dto-13` con 500 porque
  // Zod tiraba ANTES de que el handler pudiera usar parseId().
  id: z.string().regex(/^(dto-)?\d+$/, 'id inválido'),
});

// jul 2026 — Bulk insert para el Patrón de trabajo/descanso.
// Acepta hasta 2000 entries por request (suficiente para 30 días × 60
// conductores con margen). Si el admin necesita más, hace 2 requests.
const bulkEntrySchema = z.object({
  driverId: z.number().int().positive(),
  date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  reason:   reasonSchema,
});
const bulkSchema = z.object({
  entries: z.array(bulkEntrySchema).min(1).max(2000),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convierte (year, month) al rango semi-abierto de fechas [from, toExclusive)
 * para SQL. from = día 1 del mes, toExclusive = día 1 del mes siguiente.
 * Comparación como string 'YYYY-MM-DD' (lexicográfica == cronológica en
 * este formato).
 */
function monthRangeEc(year: number, month: number): { from: string; toExclusive: string } {
  const fromIso = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-01`;
  let ny = year;
  let nm = month + 1;
  if (nm > 12) { ny = ny + 1; nm = 1; }
  const toExclusiveIso = `${ny.toString().padStart(4, '0')}-${nm.toString().padStart(2, '0')}-01`;
  return { from: fromIso, toExclusive: toExclusiveIso };
}

/** Devuelve (year, month) del mes anterior al dado. */
function previousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

/** Devuelve (year, month) del mes actual EC. */
function currentMonthEc(): { year: number; month: number } {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric', month: '2-digit',
  }).format(new Date());
  const [y, m] = ymd.split('-').map(Number);
  return { year: y, month: m };
}

/** Valida que un string sea YYYY-MM-DD. */
function isYmd(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * jul 2026 — Convierte lo que Drizzle devuelve para una columna `date`
 * (PG DATE) a un string 'YYYY-MM-DD' limpio. Drizzle lo retorna como
 * `Date` (con hora 00:00:00 UTC), que al serializar a JSON queda como
 * '2026-07-27T00:00:00.000Z'. El frontend esperaba 'YYYY-MM-DD' y
 * agrupaba las entries en un Map por `e.date` — al recibir el ISO
 * timestamp no matcheaba con el `cell.date` string, y la entry "se
 * perdía" visualmente (aunque seguía en la DB).
 *
 * Esta función es defensiva: si el valor ya es string, lo pasa tal cual
 * (defensivo contra versiones de Drizzle que podrían serializar como
 * string en el futuro). Si es Date, formatea con la zona UTC (no EC)
 * porque la columna `date` de PG no tiene TZ, el "00:00:00" que vemos
 * ya es UTC.
 */
function dateToYmd(d: unknown): string {
  if (typeof d === 'string') {
    // Si ya es YYYY-MM-DD, devolver tal cual. Inline el regex para
    // evitar la confusión de TS con el type guard `s is string` (que
    // narrowea d a string en una dirección y rompe el branch del else).
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    // Si es ISO con tiempo, sacar la parte de fecha.
    return d.slice(0, 10);
  }
  if (d instanceof Date) {
    // UTC porque PG DATE no tiene TZ y Drizzle normaliza a UTC midnight.
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  // Fallback: intentar toString.
  return String(d).slice(0, 10);
}


// ─── GET / ──────────────────────────────────────────────────────────────────

router.get(
  '/',
  requireModule('gestion', 'conductores'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      // Query params: el front puede mandar from y to. Si no, default = mes actual EC.
      //
      // jul 2026 — BUG FIX: antes, si el front mandaba SOLO `from=2026-07-01`
      // (sin `to`), el backend interpretaba como "1 día puntual" (toExclusive
      // = día siguiente). Eso traía entries con date === 2026-07-01 y
      // se perdía el resto del mes. El calendar del front mostraba
      // celdas vacías aunque la DB tuviera entries.
      //
      // Regla nueva: si NO viene `to`, default = fin del mes al que
      // pertenece `from`. Si `from` tampoco viene, default = mes EC actual.
      const fromQ = req.query.from;
      const toQ   = req.query.to;

      // Helper: dado un YMD, devuelve el YMD del día 1 del mes SIGUIENTE.
      // (Lo usamos como `toExclusive` = inicio del mes siguiente.)
      const nextMonthFirstYmd = (ymd: string): string => {
        const [y, m] = ymd.split('-').map(Number);
        const ny = m === 12 ? y + 1 : y;
        const nm = m === 12 ? 1 : m + 1;
        return `${ny}-${String(nm).padStart(2, '0')}-01`;
      };

      const fromIso = isYmd(fromQ)
        ? fromQ
        : monthRangeEc(currentMonthEc().year, currentMonthEc().month).from;
      // toExclusive: si el front lo manda, lo usamos. Si NO, default
      // al inicio del mes SIGUIENTE al de `from` (= "fin de mes exclusivo").
      const toExclusiveIso = isYmd(toQ)
        ? toQ
        : nextMonthFirstYmd(fromIso);

      const rows = await db
        .select({
          id:              driverTimeOff.id,
          companyId:       driverTimeOff.companyId,
          driverId:        driverTimeOff.driverId,
          date:            driverTimeOff.date,
          reason:          driverTimeOff.reason,
          notes:           driverTimeOff.notes,
          createdBy:       driverTimeOff.createdBy,
          createdAt:       driverTimeOff.createdAt,
          updatedAt:       driverTimeOff.updatedAt,
          driverFirstName: companyDrivers.firstName,
          driverLastName:  companyDrivers.lastName,
          driverCode:      companyDrivers.code,
          driverStatus:    companyDrivers.status,
        })
        .from(driverTimeOff)
        .innerJoin(companyDrivers, eq(companyDrivers.id, driverTimeOff.driverId))
        .where(
          and(
            eq(driverTimeOff.companyId, companyId),
            gte(sql`${driverTimeOff.date}::text`, fromIso),
            lt(sql`${driverTimeOff.date}::text`, toExclusiveIso),
          ),
        )
        .orderBy(asc(driverTimeOff.date), asc(companyDrivers.lastName));

      const data = rows.map((r) => ({
        id:        toId('dto', r.id),
        companyId: toId('company', r.companyId),
        driverId:  toId('driver', r.driverId),
        date:      dateToYmd(r.date),
        reason:    r.reason,
        notes:     r.notes,
        createdBy: r.createdBy ? toId('company-user', r.createdBy) : null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        driver: {
          id:        toId('driver', r.driverId),
          firstName: r.driverFirstName,
          lastName:  r.driverLastName,
          code:      r.driverCode,
          status:    r.driverStatus,
        },
      }));

      res.json({ data, from: fromIso, toExclusive: toExclusiveIso });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /has-any ───────────────────────────────────────────────────────────

router.get(
  '/has-any',
  requireModule('gestion', 'conductores'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      // Coerce y validar manualmente (query params son siempre string).
      const month = Number(req.query.month);
      const year  = Number(req.query.year);
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: 'month inválido' });
      }
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: 'year inválido' });
      }
      const r = monthRangeEc(year, month);

      const result = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(driverTimeOff)
        .where(
          and(
            eq(driverTimeOff.companyId, companyId),
            gte(sql`${driverTimeOff.date}::text`, r.from),
            lt(sql`${driverTimeOff.date}::text`, r.toExclusive),
          ),
        );

      const count = result[0]?.count ?? 0;
      res.json({ hasAny: count > 0, count, year, month });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST / ─────────────────────────────────────────────────────────────────

router.post(
  '/',
  requireModule('gestion', 'conductores'),
  requirePermission('gestion', 'conductores', 'crear'),
  validate(createSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createSchema>;
      const meId = parseId('company-user', req.user!.sub);

      // Verificar que el driver existe y pertenece a la empresa.
      const driver = await db
        .select({ id: companyDrivers.id, status: companyDrivers.status })
        .from(companyDrivers)
        .where(
          and(
            eq(companyDrivers.id, body.driverId),
            eq(companyDrivers.companyId, companyId),
          ),
        )
        .limit(1);
      if (driver.length === 0) {
        throw new NotFoundError('driver', String(body.driverId));
      }

      // Upsert via ON CONFLICT (target = unique index companyId+driverId+date).
      const inserted = await db
        .insert(driverTimeOff)
        .values({
          companyId,
          driverId:  body.driverId,
          date:      body.date,
          reason:    body.reason ?? null,
          notes:     body.notes ?? null,
          createdBy: meId,
        })
        .onConflictDoUpdate({
          target: [driverTimeOff.companyId, driverTimeOff.driverId, driverTimeOff.date],
          set: {
            reason: body.reason ?? null,
            notes:  body.notes ?? null,
            // createdBy NO se pisa — preservamos quién lo creó originalmente.
            // updatedAt lo toca el trigger de la DB.
          },
        })
        .returning();

      const row = inserted[0];

      void logAudit(db, companyId, {
        entity: 'driver_schedule',
        entityId: toId('dto', row.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        metadata: {
          driverId: body.driverId,
          date:     body.date,
          reason:   body.reason ?? null,
        },
      });

      res.status(201).json({
        data: {
          id:        toId('dto', row.id),
          companyId: toId('company', row.companyId),
          driverId:  toId('driver', row.driverId),
          date:      dateToYmd(row.date),
          reason:    row.reason,
          notes:     row.notes,
          createdBy: row.createdBy ? toId('company-user', row.createdBy) : null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /:id ────────────────────────────────────────────────────────────

router.delete(
  '/:id',
  requireModule('gestion', 'conductores'),
  requirePermission('gestion', 'conductores', 'eliminar'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      // Acepta `dto-13` o `13`. parseId('dto', ...) maneja ambos.
      // jul 2026 — antes era Number(id) que daba NaN con "dto-13".
      const { id } = idParamSchema.parse(req.params);
      const idNum = parseId('dto', id);

      const existing = await db
        .select({
          id: driverTimeOff.id,
          driverId: driverTimeOff.driverId,
          date: driverTimeOff.date,
        })
        .from(driverTimeOff)
        .where(and(eq(driverTimeOff.id, idNum), eq(driverTimeOff.companyId, companyId)))
        .limit(1);
      if (existing.length === 0) {
        throw new NotFoundError('driver_schedule', id);
      }

      await db
        .delete(driverTimeOff)
        .where(and(eq(driverTimeOff.id, idNum), eq(driverTimeOff.companyId, companyId)));

      void logAudit(db, companyId, {
        entity: 'driver_schedule',
        entityId: toId('dto', idNum),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        metadata: {
          driverId: existing[0].driverId,
          date:     existing[0].date,
        },
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /copy-from-previous ───────────────────────────────────────────────

router.post(
  '/copy-from-previous',
  requireModule('gestion', 'conductores'),
  requirePermission('gestion', 'conductores', 'crear'),
  validate(copySchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const meId = parseId('company-user', req.user!.sub);
      const body = req.body as z.infer<typeof copySchema>;

      const now = currentMonthEc();
      const targetYear  = body.targetYear  ?? now.year;
      const targetMonth = body.targetMonth ?? now.month;
      const prev = previousMonth(targetYear, targetMonth);
      const sourceYear  = body.sourceYear  ?? prev.year;
      const sourceMonth = body.sourceMonth ?? prev.month;

      // 1) Target debe estar vacío.
      const targetRange = monthRangeEc(targetYear, targetMonth);
      const targetCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(driverTimeOff)
        .where(
          and(
            eq(driverTimeOff.companyId, companyId),
            gte(sql`${driverTimeOff.date}::text`, targetRange.from),
            lt(sql`${driverTimeOff.date}::text`, targetRange.toExclusive),
          ),
        );
      if ((targetCount[0]?.count ?? 0) > 0) {
        return res.status(409).json({
          error: 'target_not_empty',
          message: `El mes target (${targetYear}-${String(targetMonth).padStart(2, '0')}) ya tiene entradas. Vacíalo antes de copiar.`,
        });
      }

      // 2) Traer las filas del mes source.
      const sourceRange = monthRangeEc(sourceYear, sourceMonth);
      const sourceRows = await db
        .select({
          driverId: driverTimeOff.driverId,
          date:     driverTimeOff.date,
          reason:   driverTimeOff.reason,
          notes:    driverTimeOff.notes,
        })
        .from(driverTimeOff)
        .where(
          and(
            eq(driverTimeOff.companyId, companyId),
            gte(sql`${driverTimeOff.date}::text`, sourceRange.from),
            lt(sql`${driverTimeOff.date}::text`, sourceRange.toExclusive),
          ),
        )
        .orderBy(asc(driverTimeOff.date));

      if (sourceRows.length === 0) {
        return res.json({ copied: 0, sourceYear, sourceMonth, targetYear, targetMonth });
      }

      // 3) Mapear fechas: source "2026-07-15" → target "2026-08-15".
      // Si el día no existe en el target (ej. 31 → feb), descartar.
      const targetMonthPadded = String(targetMonth).padStart(2, '0');
      const rowsToInsert: {
        companyId: number; driverId: number; date: string;
        reason: string | null; notes: string | null; createdBy: number | null;
      }[] = [];
      let skippedDayMismatch = 0;
      for (const r of sourceRows) {
        const [, , dd] = r.date.split('-');
        const newDate = `${targetYear}-${targetMonthPadded}-${dd}`;
        // Validar que el día es legal en el mes target.
        const [y, m, d] = newDate.split('-').map(Number);
        const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        if (probe.getUTCMonth() !== m - 1) {
          skippedDayMismatch++;
          continue;
        }
        rowsToInsert.push({
          companyId,
          driverId:  r.driverId,
          date:      newDate,
          reason:    r.reason ?? null,
          notes:     r.notes ?? null,
          createdBy: meId,
        });
      }

      // 4) Bulk insert. ON CONFLICT DO NOTHING por si ya existiera (no
      // debería, pero defensivo).
      let inserted = 0;
      if (rowsToInsert.length > 0) {
        const result = await db
          .insert(driverTimeOff)
          .values(rowsToInsert)
          .onConflictDoNothing({
            target: [driverTimeOff.companyId, driverTimeOff.driverId, driverTimeOff.date],
          })
          .returning({ id: driverTimeOff.id });
        inserted = result.length;
      }

      void logAudit(db, companyId, {
        entity: 'driver_schedule',
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `copy_from_previous: ${sourceYear}-${sourceMonth} -> ${targetYear}-${targetMonth} (${inserted} copied, ${sourceRows.length - inserted} skipped, ${skippedDayMismatch} day-mismatch)`,
        metadata: {
          sourceYear, sourceMonth, targetYear, targetMonth,
          copied: inserted,
          skipped: sourceRows.length - inserted,
          skippedDayMismatch,
        },
      });

      res.json({
        copied: inserted,
        sourceYear, sourceMonth, targetYear, targetMonth,
        skippedDayMismatch,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /by-asset ──────────────────────────────────────────────────────────
//
// jul 2026 — Para el calendario de Mantenimientos (Agendar): devuelve
// un map { assetId: [freeDates] } con los días en que el conductor
// ACTIVO de cada vehículo está libre. JOIN:
//
//   driver_time_off
//     JOIN company_drivers
//     JOIN company_assignments (status='Activa', start<=date, end IS NULL OR end>=date)
//     JOIN company_assets (status='Operativo')
//
// Sin asignación activa → el vehículo no aparece en el response (no se
// puede determinar quién es el "driver del vehículo"). Sin entrada en
// driver_time_off → tampoco aparece. Es la combinación de ambos lo que
// habilita el highlight verde en el panel/agenda.
//
// Razonablemente eficiente: con 60 vehículos y 30 días, son ~1800 rows
// máximo. Con índices en (company_id, date) y (company_id, driver_id)
// ya existentes en driver_time_off, el query es sub-segundo.
router.get(
  '/by-asset',
  requireModule('gestion', 'conductores'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const fromQ = req.query.from;
      const toQ   = req.query.to;
      if (!isYmd(fromQ) || !isYmd(toQ)) {
        return res.status(400).json({ error: 'from/to inválidos (YYYY-MM-DD requerido)' });
      }
      const fromIso = fromQ;
      const toExclusiveIso = toQ;

      const rows = await db
        .select({
          assetId: companyAssets.id,
          date:    driverTimeOff.date,
        })
        .from(driverTimeOff)
        .innerJoin(companyDrivers, eq(companyDrivers.id, driverTimeOff.driverId))
        .innerJoin(
          companyAssignments,
          and(
            eq(companyAssignments.driverId, companyDrivers.id),
            eq(companyAssignments.status, 'Activa'),
            // La asignación cubre el día: startDate <= date AND (endDate IS NULL OR endDate >= date)
            //
            // jul 2026 — BUG FIX: antes, `lte(startDate, ${driverTimeOff.date}::text)`
            // y `gte(endDate::text, ${driverTimeOff.date}::text)` mezclaban tipos
            // `date` y `text` — Postgres rechaza con `operator does not exist:
            // date <= text` (SQLSTATE 42883). El cast tiene que ser
            // **consistente** entre los dos lados. Acá casteamos
            // `driver_time_off.date` a `date` (no `text`) y dejamos
            // `startDate`/`endDate` como `date` nativas — la comparación
            // es a nivel de fecha, que es lo semánticamente correcto.
            lte(companyAssignments.startDate, sql`${driverTimeOff.date}::date`),
            or(
              isNull(companyAssignments.endDate),
              gte(companyAssignments.endDate, sql`${driverTimeOff.date}::date`),
            )!,
          ),
        )
        .innerJoin(companyAssets, eq(companyAssets.id, companyAssignments.assetId))
        .where(
          and(
            eq(driverTimeOff.companyId, companyId),
            // Solo días futuros/pasados dentro del rango.
            gte(sql`${driverTimeOff.date}::text`, fromIso),
            lt(sql`${driverTimeOff.date}::text`, toExclusiveIso),
            // Defensive: conductor y vehículo activos al momento de la consulta.
            eq(companyDrivers.status, 'Activo'),
            // status del asset: "Operativo" o "En mantenimiento" (igual
            // puede tener un mantenimiento agendado). Excluimos
            // "Fuera de servicio" para no sugerir que se puede llevar
            // a mantenimiento.
            sql`${companyAssets.status} IN ('Operativo', 'En mantenimiento')`,
          ),
        )
        .orderBy(asc(companyAssets.id), asc(driverTimeOff.date));

      // Agrupar a Map<assetId, Set<date>>. Dedupe por si un conductor
      // tiene 2 assignments activas al mismo asset en la misma fecha
      // (improbable pero defensivo).
      const map: Record<string, string[]> = {};
      for (const r of rows) {
        const dateStr = dateToYmd(r.date);
        const key = toId('asset', r.assetId);
        if (!map[key]) map[key] = [];
        if (!map[key].includes(dateStr)) map[key].push(dateStr);
      }

      res.json({ byAsset: map, from: fromIso, toExclusive: toExclusiveIso });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /bulk ─────────────────────────────────────────────────────────────
//
// jul 2026 — Bulk insert para el Patrón de trabajo/descanso. El cliente
// genera las fechas (lógica de patrón vive en el front) y manda un array
// de entries. El backend hace UN solo INSERT batch con ON CONFLICT DO
// NOTHING (idempotente — si una entry ya existe, no la duplica).
//
// Reglas:
//   - Todos los driverId deben pertenecer a la empresa (cross-company
//     check explícito, no basta con la FK porque el cliente puede mandar
//     cualquier ID).
//   - max 2000 entries por request (validado por zod).
//   - Devuelve { inserted, skipped, total } para que el front sepa
//     cuántas se aplicaron realmente.
router.post(
  '/bulk',
  requireModule('gestion', 'conductores'),
  requirePermission('gestion', 'conductores', 'crear'),
  validate(bulkSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const meId = parseId('company-user', req.user!.sub);
      const { entries } = req.body as z.infer<typeof bulkSchema>;

      // 1) Validar que TODOS los driverId existen y pertenecen a la empresa.
      //    Un set() de IDs únicos para no repetir queries.
      const uniqueDriverIds = Array.from(new Set(entries.map((e) => e.driverId)));
      const validDrivers = await db
        .select({ id: companyDrivers.id })
        .from(companyDrivers)
        .where(
          and(
            eq(companyDrivers.companyId, companyId),
            // inArray
            sql`${companyDrivers.id} = ANY(${sql.raw(`ARRAY[${uniqueDriverIds.join(',') || 'NULL'}]::int[]`)})`,
          ),
        );
      const validIds = new Set(validDrivers.map((d) => d.id));
      const invalidIds = uniqueDriverIds.filter((id) => !validIds.has(id));
      if (invalidIds.length > 0) {
        throw new NotFoundError(
          'driver',
          invalidIds.join(', '),
        );
      }

      // 2) Bulk insert. Drizzle: .values(array) genera un INSERT multi-row.
      //    ON CONFLICT (company_id, driver_id, date) DO NOTHING — la fila
      //    existente no se pisa. createdBy lo seteamos al usuario actual
      //    (en bulk insert no preservamos "quién lo creó originalmente" —
      //    el patrón es del admin que está armando el mes).
      const values = entries.map((e) => ({
        companyId,
        driverId:  e.driverId,
        date:      e.date,
        reason:    e.reason ?? null,
        notes:     null,
        createdBy: meId,
      }));

      const result = await db
        .insert(driverTimeOff)
        .values(values)
        .onConflictDoNothing({
          target: [driverTimeOff.companyId, driverTimeOff.driverId, driverTimeOff.date],
        })
        .returning({ id: driverTimeOff.id });

      const inserted = result.length;
      const skipped = entries.length - inserted;

      void logAudit(db, companyId, {
        entity: 'driver_schedule',
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `bulk: ${inserted} inserted, ${skipped} skipped (already existed)`,
        metadata: {
          total: entries.length,
          inserted,
          skipped,
        },
      });

      res.json({
        total:    entries.length,
        inserted,
        skipped,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
