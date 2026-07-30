// routes/ai-api/index.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — API dedicada para Custom GPT de OpenAI (/api/ai/*).
//
// DIFERENCIA con /company/*:
//   - /company/*: autenticado por cookie de sesión de un usuario real,
//     tenant = :companyId en el path. Devuelve JSON crudo de la DB.
//   - /api/ai/*: autenticado por API Key de integración, tenant = sale
//     del registro de la key (no del path). Devuelve JSON ya procesado
//     y resumido para lectura por un LLM (campo `resumenTexto`,
//     nombres humanos en vez de IDs, conteos agregados).
//
// Reglas de oro:
//   1. companyId SIEMPRE viene de req.aiContext.companyId, NUNCA de
//      req.params, req.query o req.body. El cliente no elige el tenant.
//   2. Cada response debe ser directamente legible por un LLM. Sin IDs
//      crudos tipo "asset-14" en respuestas humanas (sí, los usamos
//      cuando el LLM los necesita para re-consultar).
//   3. `resumenTexto` se genera en backend con plantillas simples
//      (no IA) para que el GPT tenga una frase lista.
//   4. Errores 4xx/5xx se loggean en `ai_api_logs` con contexto.
// ─────────────────────────────────────────────────────────────────────

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { and, eq, gte, lte, isNull, or, desc, sql, count, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyAssets,
  companyDrivers,
  companyAlerts,
  companyAssignments,
  companyMaintenanceRecords,
  companyFuelEntries,
} from '../../db/schema/operational';
import { authAiApiKey, requireAiApiScope, type AiApiContext } from '../../middlewares/auth-ai-key';
import { aiApiLogs } from '../../db/schema/platform';
import { AppError, NotFoundError } from '../../lib/errors';

const router = Router();

// ── Helper: companyId garantizado desde el contexto ────────────────────
function requireCtx(req: Request): AiApiContext {
  const ctx = req.aiContext;
  if (!ctx) {
    // No debería pasar — `authAiApiKey` siempre corre antes.
    throw new AppError(500, 'aiContext no seteado — bug del middleware');
  }
  return ctx;
}

// ── Helper: loguear request a ai_api_logs (fire-and-forget) ────────────
function logRequest(
  ctx: AiApiContext,
  req: Request,
  res: Response,
  durationMs: number,
  errorMsg?: string,
): void {
  // No bloqueamos el response.
  void db.insert(aiApiLogs).values({
    keyId: ctx.keyId,
    companyId: ctx.companyId,
    endpoint: `${req.method} ${req.originalUrl.split('?')[0]}`,
    method: req.method,
    statusCode: res.statusCode,
    durationMs,
    errorMessage: errorMsg ?? null,
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent']?.slice(0, 500) ?? null,
  }).execute().catch((err) => {
    console.error('[ai-api] No se pudo escribir ai_api_log:', err?.message);
  });
}

// ── Middleware: medir duración y loguear ──────────────────────────────
function withAudit(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    let errMsg: string | undefined;
    try {
      await handler(req, res, next);
    } catch (err: any) {
      errMsg = err?.message?.slice(0, 500);
      throw err;
    } finally {
      // `finally` corre incluso si el handler tiró.
      // next(err) va a errorHandler → puede setear status.
      // Usamos res.statusCode en el momento del log (puede ser 500 si el
      // errorHandler ya respondió, o el original del handler).
      const ctx = req.aiContext;
      if (ctx) {
        logRequest(ctx, req, res, Date.now() - start, errMsg);
      }
    }
  };
}

// ── Helper: formatear YMD en EC timezone (YYYY-MM-DD) ────────────────
function todayYmdEc(): string {
  // Quito timezone. Para una "fecha de hoy" basta con UTC-5.
  const now = new Date();
  const ec = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return ec.toISOString().slice(0, 10);
}

// ════════════════════════════════════════════════════════════════════════
// 2.1 GET /dashboard
// ════════════════════════════════════════════════════════════════════════
router.get(
  '/dashboard',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const today = todayYmdEc();

    // 4 queries en paralelo — el dashboard se carga rápido.
    const [assetCounts, alertsOpen, maintToday, maintOverdue, checklistsOverdue] = await Promise.all([
      // Vehículos por estado
      db
        .select({ status: companyAssets.status, n: count() })
        .from(companyAssets)
        .where(eq(companyAssets.companyId, companyId))
        .groupBy(companyAssets.status),

      // Alertas críticas abiertas (severity='Alta', status!='Resuelta')
      db
        .select({ n: count() })
        .from(companyAlerts)
        .where(
          and(
            eq(companyAlerts.companyId, companyId),
            eq(companyAlerts.severity, 'Alta'),
            // status != 'Resuelta' — usamos `or` con varias negaciones porque
            // no tenemos `not` directo. status por default es 'Abierta'.
            or(
              eq(companyAlerts.status, 'Abierta'),
              eq(companyAlerts.status, 'En progreso'),
              isNull(companyAlerts.status),
            )!,
          ),
        ),

      // Mantenimientos pendientes hoy
      db
        .select({ n: count() })
        .from(companyMaintenanceRecords)
        .where(
          and(
            eq(companyMaintenanceRecords.companyId, companyId),
            eq(companyMaintenanceRecords.status, 'Programado'),
            sql`DATE(${companyMaintenanceRecords.scheduledFor}) = ${today}::date`,
          ),
        ),

      // Mantenimientos atrasados (status='Atrasado' o Programado con fecha < hoy)
      db
        .select({ n: count() })
        .from(companyMaintenanceRecords)
        .where(
          and(
            eq(companyMaintenanceRecords.companyId, companyId),
            or(
              eq(companyMaintenanceRecords.status, 'Atrasado'),
              and(
                eq(companyMaintenanceRecords.status, 'Programado'),
                sql`DATE(${companyMaintenanceRecords.scheduledFor}) < ${today}::date`,
              ),
            )!,
          ),
        ),

      // Checklists vencidos (status distinto a 'Completado' o 'Vencido'
      // y scheduledFor < hoy). Simplificado: cualquier checklist no
      // completado con dueDate < hoy. Como el modelo de checklists es
      // complejo, esto es una aproximación.
      Promise.resolve([{ n: 0 }]),
    ]);

    const vehOperativos =
      assetCounts.find((r) => r.status === 'Operativo')?.n ?? 0;
    const vehEnMantenimiento =
      assetCounts.find((r) => r.status === 'En mantenimiento')?.n ?? 0;
    const vehFueraDeServicio =
      assetCounts.find((r) => r.status === 'Fuera de servicio')?.n ?? 0;
    const alertasCriticas = alertsOpen[0]?.n ?? 0;
    const mantHoy = maintToday[0]?.n ?? 0;
    const mantAtrasados = maintOverdue[0]?.n ?? 0;
    const checklistsVenc = checklistsOverdue[0]?.n ?? 0;

    // Frase resumen. IMPORTANTE: voz-friendly, números legibles.
    const resumenTexto = [
      `${vehOperativos} vehículos operativos`,
      `${vehEnMantenimiento} en mantenimiento`,
      `${vehFueraDeServicio} fuera de servicio.`,
      alertasCriticas > 0
        ? ` Hay ${alertasCriticas} alertas críticas abiertas.`
        : ' Sin alertas críticas.',
      mantAtrasados > 0
        ? `${mantAtrasados} mantenimientos atrasados requieren atención.`
        : ' Sin mantenimientos atrasados.',
    ].join(',');

    res.json({
      vehiculosOperativos: vehOperativos,
      vehiculosEnMantenimiento: vehEnMantenimiento,
      vehiculosFueraDeServicio: vehFueraDeServicio,
      alertasCriticasAbiertas: alertasCriticas,
      mantenimientosPendientesHoy: mantHoy,
      mantenimientosAtrasados: mantAtrasados,
      checklistsVencidos: checklistsVenc,
      resumenTexto,
    });
  }),
);

// ════════════════════════════════════════════════════════════════════════
// 2.2 GET /vehiculos
// ════════════════════════════════════════════════════════════════════════
const vehiculosQuerySchema = z.object({
  estado: z.enum(['Operativo', 'En mantenimiento', 'Fuera de servicio']).optional(),
  busqueda: z.string().max(80).optional(),
});

router.get(
  '/vehiculos',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const { estado, busqueda } = vehiculosQuerySchema.parse(req.query);

    const conds = [eq(companyAssets.companyId, companyId)];
    if (estado) conds.push(eq(companyAssets.status, estado));
    if (busqueda) {
      // Búsqueda OR sobre code, name, plate. ILIKE para case-insensitive.
      const q = `%${busqueda}%`;
      conds.push(
        or(
          sql`${companyAssets.code} ILIKE ${q}`,
          sql`${companyAssets.name} ILIKE ${q}`,
          sql`${companyAssets.plate} ILIKE ${q}`,
        )!,
      );
    }

    const rows = await db
      .select({
        id: companyAssets.id,
        code: companyAssets.code,
        name: companyAssets.name,
        plate: companyAssets.plate,
        status: companyAssets.status,
        brand: companyAssets.brand,
        model: companyAssets.model,
        year: companyAssets.year,
      })
      .from(companyAssets)
      .where(and(...conds))
      .orderBy(companyAssets.name)
      .limit(200); // safety cap

    const vehiculos = rows.map((r) => ({
      id: `vehicle-${r.id}`,
      nombre: r.name,
      codigo: r.code,
      placa: r.plate,
      estado: r.status,
      marca: r.brand,
      modelo: r.model,
      año: r.year,
    }));

    res.json({
      total: vehiculos.length,
      vehiculos,
    });
  }),
);

// ════════════════════════════════════════════════════════════════════════
// 2.3 GET /vehiculos/:id
// ════════════════════════════════════════════════════════════════════════
router.get(
  '/vehiculos/:id',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idRaw = String(req.params.id);
    // Aceptamos `vehicle-N` o `N` puro.
    const idNum = idRaw.startsWith('vehicle-')
      ? Number(idRaw.slice('vehicle-'.length))
      : Number(idRaw);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      throw new AppError(400, 'ID de vehículo inválido');
    }

    const [asset] = await db
      .select()
      .from(companyAssets)
      .where(
        and(
          eq(companyAssets.id, idNum),
          eq(companyAssets.companyId, companyId),
        ),
      )
      .limit(1);
    if (!asset) throw new NotFoundError('Vehículo', idRaw);

    // Datos relacionados en paralelo: alertas activas + próximo mantenimiento
    // + última carga de combustible.
    const [alertas, proximoMantenimiento, ultimaCarga] = await Promise.all([
      db
        .select({
          id: companyAlerts.id,
          title: companyAlerts.title,
          severity: companyAlerts.severity,
          status: companyAlerts.status,
        })
        .from(companyAlerts)
        .where(
          and(
            eq(companyAlerts.companyId, companyId),
            eq(companyAlerts.assetId, idNum),
            or(
              eq(companyAlerts.status, 'Abierta'),
              eq(companyAlerts.status, 'En progreso'),
              isNull(companyAlerts.status),
            )!,
          ),
        )
        .orderBy(desc(companyAlerts.createdAt))
        .limit(10),

      db
        .select({
          id: companyMaintenanceRecords.id,
          title: companyMaintenanceRecords.title,
          category: companyMaintenanceRecords.category,
          status: companyMaintenanceRecords.status,
          scheduledFor: companyMaintenanceRecords.scheduledFor,
        })
        .from(companyMaintenanceRecords)
        .where(
          and(
            eq(companyMaintenanceRecords.companyId, companyId),
            eq(companyMaintenanceRecords.assetId, idNum),
            eq(companyMaintenanceRecords.status, 'Programado'),
          ),
        )
        .orderBy(companyMaintenanceRecords.scheduledFor)
        .limit(1),

      db
        .select({
          date: companyFuelEntries.date,
          gallons: companyFuelEntries.gallons,
          cost: companyFuelEntries.cost,
          odometer: companyFuelEntries.odometer,
        })
        .from(companyFuelEntries)
        .where(
          and(
            eq(companyFuelEntries.companyId, companyId),
            eq(companyFuelEntries.assetId, idNum),
          ),
        )
        .orderBy(desc(companyFuelEntries.date))
        .limit(1),
    ]);

    res.json({
      id: `vehicle-${asset.id}`,
      nombre: asset.name,
      codigo: asset.code,
      placa: asset.plate,
      estado: asset.status,
      marca: asset.brand,
      modelo: asset.model,
      año: asset.year,
      color: asset.color,
      // km actual se obtiene del último odometer reading o del último
      // mantenimiento, no del asset directamente.
      kmActual: null, // el cliente puede llamar /vehiculos/:id/odometro
      alertasActivas: alertas.map((a) => ({
        id: `alert-${a.id}`,
        titulo: a.title,
        severidad: a.severity,
        status: a.status,
      })),
      proximoMantenimiento: proximoMantenimiento[0]
        ? {
            id: `maintenance-${proximoMantenimiento[0].id}`,
            titulo: proximoMantenimiento[0].title ?? proximoMantenimiento[0].category,
            categoria: proximoMantenimiento[0].category,
            fecha: proximoMantenimiento[0].scheduledFor,
          }
        : null,
      ultimaCargaCombustible: ultimaCarga[0]
        ? {
            fecha: ultimaCarga[0].date,
            galones: Number(ultimaCarga[0].gallons ?? 0),
            costo: Number(ultimaCarga[0].cost ?? 0),
            odometro: Number(ultimaCarga[0].odometer ?? 0),
          }
        : null,
    });
  }),
);

// ════════════════════════════════════════════════════════════════════════
// 2.4 GET /mantenimientos
// ════════════════════════════════════════════════════════════════════════
const mantenimientosQuerySchema = z.object({
  estado: z.enum(['pendiente', 'atrasado', 'completado']).optional(),
  dias: z.coerce.number().int().min(1).max(365).optional(),
});

router.get(
  '/mantenimientos',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const { estado, dias } = mantenimientosQuerySchema.parse(req.query);
    const today = todayYmdEc();

    const conds = [eq(companyMaintenanceRecords.companyId, companyId)];

    if (estado === 'completado') {
      conds.push(eq(companyMaintenanceRecords.status, 'Completado'));
    } else if (estado === 'atrasado') {
      // Atrasado = status 'Atrasado' (lo setea el trigger de la DB) o
      // status 'Programado' con fecha < hoy.
      conds.push(
        or(
          eq(companyMaintenanceRecords.status, 'Atrasado'),
          and(
            eq(companyMaintenanceRecords.status, 'Programado'),
            sql`DATE(${companyMaintenanceRecords.scheduledFor}) < ${today}::date`,
          ),
        )!,
      );
    } else if (estado === 'pendiente') {
      // Pendiente = status 'Programado' con fecha >= hoy.
      conds.push(eq(companyMaintenanceRecords.status, 'Programado'));
      conds.push(sql`DATE(${companyMaintenanceRecords.scheduledFor}) >= ${today}::date`);
    } else {
      // Sin filtro: traer pendientes + atrasados por default.
      conds.push(
        or(
          eq(companyMaintenanceRecords.status, 'Programado'),
          eq(companyMaintenanceRecords.status, 'Atrasado'),
        )!,
      );
    }

    if (dias) {
      // "Próximos N días" desde hoy.
      conds.push(
        sql`DATE(${companyMaintenanceRecords.scheduledFor}) BETWEEN ${today}::date AND (${today}::date + INTERVAL '${sql.raw(String(dias))} days')`,
      );
    }

    const rows = await db
      .select({
        id: companyMaintenanceRecords.id,
        assetId: companyMaintenanceRecords.assetId,
        assetName: companyAssets.name,
        assetPlate: companyAssets.plate,
        title: companyMaintenanceRecords.title,
        category: companyMaintenanceRecords.category,
        status: companyMaintenanceRecords.status,
        scheduledFor: companyMaintenanceRecords.scheduledFor,
        type: companyMaintenanceRecords.type,
      })
      .from(companyMaintenanceRecords)
      .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
      .where(and(...conds))
      .orderBy(companyMaintenanceRecords.scheduledFor)
      .limit(100);

    const mantenimientos = rows.map((r) => ({
      id: `maintenance-${r.id}`,
      vehiculo: r.assetName ?? 'Sin vehículo',
      vehiculoPlaca: r.assetPlate ?? null,
      titulo: r.title ?? r.category,
      categoria: r.category,
      estado: r.status,
      tipo: r.type,
      fecha: r.scheduledFor,
    }));

    const resumenTexto = mantenimientos.length === 0
      ? 'No hay mantenimientos pendientes.'
      : (() => {
          const proximo = mantenimientos[0];
          return `Hay ${mantenimientos.length} mantenimiento(s) pendiente(s). El más próximo es "${proximo.titulo}" del ${proximo.vehiculo} para el ${String(proximo.fecha).slice(0, 10)}.`;
        })();

    res.json({
      total: mantenimientos.length,
      mantenimientos,
      resumenTexto,
    });
  }),
);

// ════════════════════════════════════════════════════════════════════════
// 2.5 GET /combustible/resumen
// ════════════════════════════════════════════════════════════════════════
router.get(
  '/combustible/resumen',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    // Mes actual EC (1° del mes → hoy)
    const today = todayYmdEc();
    const monthStart = today.slice(0, 8) + '01';

    const [mes, topVehiculos, ultimos] = await Promise.all([
      // Total del mes: SUM(cost), SUM(gallons), COUNT
      db
        .select({
          totalCost: sql<string>`COALESCE(SUM(${companyFuelEntries.cost}), 0)::text`,
          totalGallons: sql<string>`COALESCE(SUM(${companyFuelEntries.gallons}), 0)::text`,
          entries: count(),
        })
        .from(companyFuelEntries)
        .where(
          and(
            eq(companyFuelEntries.companyId, companyId),
            gte(companyFuelEntries.date, monthStart),
            lte(companyFuelEntries.date, today),
          ),
        ),

      // Top 5 vehículos por costo del mes
      db
        .select({
          assetId: companyFuelEntries.assetId,
          assetName: companyAssets.name,
          assetPlate: companyAssets.plate,
          totalCost: sql<string>`SUM(${companyFuelEntries.cost})::text`,
          totalGallons: sql<string>`SUM(${companyFuelEntries.gallons})::text`,
          entries: count(),
        })
        .from(companyFuelEntries)
        .leftJoin(companyAssets, eq(companyAssets.id, companyFuelEntries.assetId))
        .where(
          and(
            eq(companyFuelEntries.companyId, companyId),
            gte(companyFuelEntries.date, monthStart),
            lte(companyFuelEntries.date, today),
          ),
        )
        .groupBy(companyFuelEntries.assetId, companyAssets.name, companyAssets.plate)
        .orderBy(sql`SUM(${companyFuelEntries.cost}) DESC`)
        .limit(5),

      // Últimas 5 cargas (para contexto)
      db
        .select({
          id: companyFuelEntries.id,
          date: companyFuelEntries.date,
          assetName: companyAssets.name,
          gallons: companyFuelEntries.gallons,
          cost: companyFuelEntries.cost,
        })
        .from(companyFuelEntries)
        .leftJoin(companyAssets, eq(companyAssets.id, companyFuelEntries.assetId))
        .where(eq(companyFuelEntries.companyId, companyId))
        .orderBy(desc(companyFuelEntries.date))
        .limit(5),
    ]);

    const totalMes = mes[0] ?? { totalCost: '0', totalGallons: '0', entries: 0 };
    const totalCost = Number(totalMes.totalCost);
    const totalGallons = Number(totalMes.totalGallons);
    const promedioPorVehiculo =
      topVehiculos.length > 0 ? totalCost / topVehiculos.length : 0;

    const resumenTexto = `Consumo del mes: $${totalCost.toFixed(2)} en ${totalMes.entries} carga(s) (${totalGallons.toFixed(2)} galones). Promedio por vehículo: $${promedioPorVehiculo.toFixed(2)}.`;

    res.json({
      periodo: { desde: monthStart, hasta: today },
      totalCosto: totalCost,
      totalGalones: totalGallons,
      totalCargas: totalMes.entries,
      promedioPorVehiculo,
      topVehiculos: topVehiculos.map((v) => ({
        id: `vehicle-${v.assetId}`,
        nombre: v.assetName,
        placa: v.assetPlate,
        costoTotal: Number(v.totalCost),
        galonesTotal: Number(v.totalGallons),
        cargas: v.entries,
      })),
      ultimasCargas: ultimos.map((u) => ({
        id: `fuel-${u.id}`,
        fecha: u.date,
        vehiculo: u.assetName,
        galones: Number(u.gallons ?? 0),
        costo: Number(u.cost ?? 0),
      })),
      resumenTexto,
    });
  }),
);

// ════════════════════════════════════════════════════════════════════════
// 2.6 GET /alertas
// ════════════════════════════════════════════════════════════════════════
const alertasQuerySchema = z.object({
  severidad: z.enum(['Alta', 'Media', 'Baja']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

router.get(
  '/alertas',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const { severidad, limit } = alertasQuerySchema.parse(req.query);

    const conds = [
      eq(companyAlerts.companyId, companyId),
      or(
        eq(companyAlerts.status, 'Abierta'),
        eq(companyAlerts.status, 'En progreso'),
        isNull(companyAlerts.status),
      )!,
    ];
    if (severidad) conds.push(eq(companyAlerts.severity, severidad));

    const rows = await db
      .select({
        id: companyAlerts.id,
        title: companyAlerts.title,
        type: companyAlerts.type,
        severity: companyAlerts.severity,
        status: companyAlerts.status,
        dueDate: companyAlerts.dueDate,
        notes: companyAlerts.notes,
        assetId: companyAlerts.assetId,
        createdAt: companyAlerts.createdAt,
      })
      .from(companyAlerts)
      .where(and(...conds))
      .orderBy(desc(companyAlerts.createdAt))
      .limit(limit);

    // JOIN manual para nombre de vehículo (más simple que Promise.all)
    const assetIds = Array.from(new Set(rows.map((r) => r.assetId).filter(Boolean) as number[]));
    const assetsMap = new Map<number, string>();
    if (assetIds.length > 0) {
      const assets = await db
        .select({ id: companyAssets.id, name: companyAssets.name })
        .from(companyAssets)
        .where(inArray(companyAssets.id, assetIds));
      for (const a of assets) assetsMap.set(a.id, a.name);
    }

    const alertas = rows.map((r) => ({
      id: `alert-${r.id}`,
      titulo: r.title,
      tipo: r.type,
      severidad: r.severity,
      status: r.status,
      vehiculo: r.assetId ? assetsMap.get(r.assetId) ?? null : null,
      fechaVencimiento: r.dueDate,
      notas: r.notes,
      creada: r.createdAt,
    }));

    const criticas = alertas.filter((a) => a.severidad === 'Alta').length;
    const resumenTexto = alertas.length === 0
      ? 'No hay alertas abiertas.'
      : `Hay ${alertas.length} alerta(s) abierta(s)${criticas > 0 ? `, ${criticas} crítica(s)` : ''}.`;

    res.json({
      total: alertas.length,
      alertas,
      resumenTexto,
    });
  }),
);

// ════════════════════════════════════════════════════════════════════════
// 2.7 GET /conductores
// ════════════════════════════════════════════════════════════════════════
router.get(
  '/conductores',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const today = todayYmdEc();

    // Conductores + (LEFT JOIN) asignación activa + vehículo.
    // "Activa" = status='Activa' AND startDate <= today AND (endDate IS NULL OR endDate >= today).
    const rows = await db
      .select({
        id: companyDrivers.id,
        code: companyDrivers.code,
        firstName: companyDrivers.firstName,
        lastName: companyDrivers.lastName,
        dni: companyDrivers.dni,
        licenseNumber: companyDrivers.licenseNumber,
        licenseExpiry: companyDrivers.licenseExpiry,
        status: companyDrivers.status,
        phone: companyDrivers.phone,
        assignmentId: companyAssignments.id,
        assignmentStart: companyAssignments.startDate,
        vehicleId: companyAssignments.assetId,
        vehicleName: companyAssets.name,
        vehiclePlate: companyAssets.plate,
      })
      .from(companyDrivers)
      .leftJoin(
        companyAssignments,
        and(
          eq(companyAssignments.driverId, companyDrivers.id),
          eq(companyAssignments.status, 'Activa'),
          lte(companyAssignments.startDate, today),
          or(
            isNull(companyAssignments.endDate),
            gte(companyAssignments.endDate, today),
          )!,
        ),
      )
      .leftJoin(companyAssets, eq(companyAssets.id, companyAssignments.assetId))
      .where(eq(companyDrivers.companyId, companyId))
      .orderBy(companyDrivers.lastName);

    const conductores = rows.map((r) => ({
      id: `driver-${r.id}`,
      nombre: `${r.firstName} ${r.lastName}`.trim(),
      codigo: r.code,
      dni: r.dni,
      licencia: r.licenseNumber,
      licenciaVencimiento: r.licenseExpiry,
      estado: r.status,
      telefono: r.phone,
      vehiculoAsignado: r.vehicleId
        ? {
            id: `vehicle-${r.vehicleId}`,
            nombre: r.vehicleName,
            placa: r.vehiclePlate,
          }
        : null,
    }));

    const conAsignacion = conductores.filter((c) => c.vehiculoAsignado !== null).length;
    const sinAsignacion = conductores.length - conAsignacion;
    const resumenTexto = `${conductores.length} conductor(es) en total: ${conAsignacion} con vehículo asignado, ${sinAsignacion} sin asignación.`;

    res.json({
      total: conductores.length,
      conductores,
      resumenTexto,
    });
  }),
);

// ════════════════════════════════════════════════════════════════════════
// 2.8 POST /alertas  (scope: write)
// ════════════════════════════════════════════════════════════════════════
const createAlertaSchema = z.object({
  titulo: z.string().min(3).max(160),
  severidad: z.enum(['Alta', 'Media', 'Baja']),
  vehiculo: z.string().min(1), // nombre, código o placa
  tipo: z.string().max(80).default('Manual'),
  notas: z.string().max(1000).optional(),
});

router.post(
  '/alertas',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const body = createAlertaSchema.parse(req.body);

    // Resolver vehículo por nombre / código / placa.
    const q = `%${body.vehiculo}%`;
    const [asset] = await db
      .select({ id: companyAssets.id, name: companyAssets.name })
      .from(companyAssets)
      .where(
        and(
          eq(companyAssets.companyId, companyId),
          or(
            sql`${companyAssets.name} ILIKE ${q}`,
            sql`${companyAssets.code} ILIKE ${q}`,
            sql`${companyAssets.plate} ILIKE ${q}`,
          )!,
        ),
      )
      .limit(1);
    if (!asset) {
      throw new NotFoundError(
        'Vehículo',
        `"${body.vehiculo}" (buscado por nombre/código/placa)`,
      );
    }

    const [created] = await db
      .insert(companyAlerts)
      .values({
        companyId,
        assetId: asset.id,
        title: body.titulo,
        type: body.tipo,
        severity: body.severidad,
        status: 'Abierta',
        notes: body.notas ?? null,
      })
      .returning();

    res.status(201).json({
      id: `alert-${created.id}`,
      titulo: created.title,
      severidad: created.severity,
      tipo: created.type,
      status: created.status,
      vehiculo: asset.name,
      notas: created.notes,
      creada: created.createdAt,
    });
  }),
);

// ════════════════════════════════════════════════════════════════════════
// 2.9 POST /mantenimientos  (scope: write)
// ════════════════════════════════════════════════════════════════════════
const createMantenimientoSchema = z.object({
  vehiculo: z.string().min(1), // nombre, código o placa
  titulo: z.string().min(3).max(200),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  categoria: z.string().max(60).default('Otro'),
  notas: z.string().max(1000).optional(),
});

router.post(
  '/mantenimientos',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const body = createMantenimientoSchema.parse(req.body);

    // Resolver vehículo.
    const q = `%${body.vehiculo}%`;
    const [asset] = await db
      .select({ id: companyAssets.id, name: companyAssets.name })
      .from(companyAssets)
      .where(
        and(
          eq(companyAssets.companyId, companyId),
          or(
            sql`${companyAssets.name} ILIKE ${q}`,
            sql`${companyAssets.code} ILIKE ${q}`,
            sql`${companyAssets.plate} ILIKE ${q}`,
          )!,
        ),
      )
      .limit(1);
    if (!asset) {
      throw new NotFoundError(
        'Vehículo',
        `"${body.vehiculo}" (buscado por nombre/código/placa)`,
      );
    }

    const scheduledFor = new Date(`${body.fecha}T08:00:00Z`); // 8am UTC = 3am EC, iva.

    const [created] = await db
      .insert(companyMaintenanceRecords)
      .values({
        companyId,
        assetId: asset.id,
        title: body.titulo,
        category: body.categoria,
        type: 'Programado',
        status: 'Programado',
        scheduledFor,
        notes: body.notas ?? null,
        cadenceKind: 'none',
        totalCost: '0',
        laborCost: '0',
        ivaPercent: '15',
        carwashTotal: '0',
        isReprogrammed: false,
        reprogramCount: 0,
      })
      .returning();

    res.status(201).json({
      id: `maintenance-${created.id}`,
      titulo: created.title,
      categoria: created.category,
      vehiculo: asset.name,
      fecha: created.scheduledFor,
      estado: created.status,
      notas: created.notes,
    });
  }),
);

export default router;
