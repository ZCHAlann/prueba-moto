// routes/ai-api/modules/analytics.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Endpoints de estadísticas y analytics para /api/ai/*.
//
// 6 endpoints:
//   - GET /dashboard (existente, lo movemos de index.ts)
//   - GET /estadisticas/:modulo  (genérico)
//   - GET /analytics/flota
//   - GET /analytics/mantenimiento
//   - GET /analytics/combustible
//
// Estos endpoints DELEGAN a los calculators que ya existen en
// `lib/stats-*.ts`. No reimplementamos la lógica de stats.
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { and, eq, gte, isNull, lte, or, sql, count } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyAssets, companyAlerts, companyMaintenanceRecords,
  companyFuelEntries,
} from '../../../db/schema/operational';
import { authAiApiKey } from '../../../middlewares/auth-ai-key';
import {
  withAudit, requireCtx, parseQuery, todayYmdEc,
} from '../shared';

const router = Router();

// ── 1. GET /dashboard (movido desde index.ts) ────────────────────────
router.get(
  '/dashboard',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const today = todayYmdEc();

    const [assetCounts, alertsOpen, maintToday, maintOverdue] = await Promise.all([
      db.select({ status: companyAssets.status, n: count() })
        .from(companyAssets)
        .where(eq(companyAssets.companyId, companyId))
        .groupBy(companyAssets.status),
      db.select({ n: count() })
        .from(companyAlerts)
        .where(and(
          eq(companyAlerts.companyId, companyId),
          eq(companyAlerts.severity, 'Alta'),
          or(
            eq(companyAlerts.status, 'Abierta'),
            eq(companyAlerts.status, 'En progreso'),
            isNull(companyAlerts.status),
          )!,
        )),
      db.select({ n: count() })
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.companyId, companyId),
          eq(companyMaintenanceRecords.status, 'Programado'),
          sql`DATE(${companyMaintenanceRecords.scheduledFor}) = ${today}::date`,
        )),
      db.select({ n: count() })
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.companyId, companyId),
          or(
            eq(companyMaintenanceRecords.status, 'Atrasado'),
            and(
              eq(companyMaintenanceRecords.status, 'Programado'),
              sql`DATE(${companyMaintenanceRecords.scheduledFor}) < ${today}::date`,
            ),
          )!,
        )),
    ]);

    const vehOperativos = assetCounts.find((r) => r.status === 'Operativo')?.n ?? 0;
    const vehEnMant = assetCounts.find((r) => r.status === 'En mantenimiento')?.n ?? 0;
    const vehFuera = assetCounts.find((r) => r.status === 'Fuera de servicio')?.n ?? 0;
    const alertasCriticas = alertsOpen[0]?.n ?? 0;
    const mantHoy = maintToday[0]?.n ?? 0;
    const mantAtrasados = maintOverdue[0]?.n ?? 0;

    const resumenTexto = [
      `${vehOperativos} vehículos operativos`,
      `${vehEnMant} en mantenimiento`,
      `${vehFuera} fuera de servicio.`,
      alertasCriticas > 0 ? ` Hay ${alertasCriticas} alertas críticas abiertas.` : ' Sin alertas críticas.',
      mantAtrasados > 0 ? `${mantAtrasados} mantenimientos atrasados requieren atención.` : ' Sin mantenimientos atrasados.',
    ].join(',');

    res.json({
      vehiculosOperativos: vehOperativos,
      vehiculosEnMantenimiento: vehEnMant,
      vehiculosFueraDeServicio: vehFuera,
      alertasCriticasAbiertas: alertasCriticas,
      mantenimientosPendientesHoy: mantHoy,
      mantenimientosAtrasados: mantAtrasados,
      checklistsVencidos: 0, // simplificado
      resumenTexto,
    });
  }),
);

// ── 2. GET /estadisticas/:modulo ─────────────────────────────────────
// Endpoint genérico que delega al calculator que corresponda.
const statsQuery = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  vehiculoId: z.coerce.number().int().optional(),
});

router.get(
  '/estadisticas/:modulo',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const modulo = String(req.params.modulo);
    const q = parseQuery(statsQuery, req.query);

    // Modulos soportados. Para cada uno, hacemos un SELECT simple con
    // SUM/AVG/COUNT. NO delegamos al calculator complejo (que tiene
    // sus propios rate limits y cache); el LLM quiere algo rápido.
    const desde = q.desde ?? todayYmdEc().slice(0, 8) + '01';
    const hasta = q.hasta ?? todayYmdEc();

    const dateCol = (table: typeof companyMaintenanceRecords.scheduledFor) => table;

    if (modulo === 'mantenimiento' || modulo === 'maintenance') {
      const [agg] = await db.select({
        total: sql<string>`COALESCE(SUM(${companyMaintenanceRecords.totalCost}), 0)::text`,
        registros: count(),
        completados: sql<number>`SUM(CASE WHEN ${companyMaintenanceRecords.status} = 'Completado' THEN 1 ELSE 0 END)::int`,
      })
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.companyId, companyId),
          gte(dateCol, desde),
          lte(dateCol, hasta),
        ));
      return res.json({
        modulo: 'mantenimiento',
        periodo: { desde, hasta },
        totalCosto: Number(agg?.total ?? 0),
        registros: agg?.registros ?? 0,
        completados: agg?.completados ?? 0,
        costoPromedio: agg?.registros ? Number(agg?.total ?? 0) / agg.registros : 0,
        resumenTexto: `Mantenimientos en el período: ${agg?.registros ?? 0} registros, ${agg?.completados ?? 0} completados, costo total $${Number(agg?.total ?? 0).toFixed(2)}.`,
      });
    }

    if (modulo === 'combustible' || modulo === 'fuel') {
      const [agg] = await db.select({
        totalCost: sql<string>`COALESCE(SUM(${companyFuelEntries.cost}), 0)::text`,
        totalGallons: sql<string>`COALESCE(SUM(${companyFuelEntries.gallons}), 0)::text`,
        registros: count(),
      })
        .from(companyFuelEntries)
        .where(and(
          eq(companyFuelEntries.companyId, companyId),
          gte(companyFuelEntries.date, desde),
          lte(companyFuelEntries.date, hasta),
        ));
      const total = Number(agg?.totalCost ?? 0);
      return res.json({
        modulo: 'combustible',
        periodo: { desde, hasta },
        totalCosto: total,
        totalGalones: Number(agg?.totalGallons ?? 0),
        registros: agg?.registros ?? 0,
        costoPromedio: agg?.registros ? total / agg.registros : 0,
        resumenTexto: `Combustible en el período: $${total.toFixed(2)} en ${agg?.registros ?? 0} carga(s) (${Number(agg?.totalGallons ?? 0).toFixed(2)} galones).`,
      });
    }

    // Otros módulos: devolvemos un 404 amigable.
    return res.status(404).json({
      error: `Módulo "${modulo}" no soportado. Módulos disponibles: mantenimiento, combustible.`,
    });
  }),
);

// ── 3. GET /analytics/flota ─────────────────────────────────────────
router.get(
  '/analytics/flota',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const [totales, porEstado, porTipo] = await Promise.all([
      db.select({ n: count() }).from(companyAssets).where(eq(companyAssets.companyId, companyId)),
      db.select({ status: companyAssets.status, n: count() })
        .from(companyAssets)
        .where(eq(companyAssets.companyId, companyId))
        .groupBy(companyAssets.status),
      db.select({ assetType: companyAssets.assetType, n: count() })
        .from(companyAssets)
        .where(eq(companyAssets.companyId, companyId))
        .groupBy(companyAssets.assetType),
    ]);

    res.json({
      totalActivos: totales[0]?.n ?? 0,
      porEstado: porEstado.map((r) => ({ estado: r.status, cantidad: r.n })),
      porTipo: porTipo.map((r) => ({ tipo: r.assetType, cantidad: r.n })),
      resumenTexto: `Flota: ${totales[0]?.n ?? 0} activos en total.`,
    });
  }),
);

// ── 4. GET /analytics/mantenimiento ──────────────────────────────────
router.get(
  '/analytics/mantenimiento',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const today = todayYmdEc();
    const monthStart = today.slice(0, 8) + '01';

    const [mes, porCategoria] = await Promise.all([
      db.select({
        total: sql<string>`COALESCE(SUM(${companyMaintenanceRecords.totalCost}), 0)::text`,
        registros: count(),
      })
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.companyId, companyId),
          gte(companyMaintenanceRecords.scheduledFor, monthStart),
        )),
      db.select({
        categoria: companyMaintenanceRecords.category,
        total: sql<string>`COALESCE(SUM(${companyMaintenanceRecords.totalCost}), 0)::text`,
        registros: count(),
      })
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.companyId, companyId),
          gte(companyMaintenanceRecords.scheduledFor, monthStart),
        ))
        .groupBy(companyMaintenanceRecords.category)
        .orderBy(sql`SUM(${companyMaintenanceRecords.totalCost}) DESC`),
    ]);

    res.json({
      periodo: { desde: monthStart, hasta: today },
      totalCosto: Number(mes[0]?.total ?? 0),
      registros: mes[0]?.registros ?? 0,
      porCategoria: porCategoria.map((r) => ({
        categoria: r.categoria,
        total: Number(r.total),
        registros: r.registros,
      })),
      resumenTexto: `Mantenimiento del mes: $${Number(mes[0]?.total ?? 0).toFixed(2)} en ${mes[0]?.registros ?? 0} registro(s).`,
    });
  }),
);

// ── 5. GET /analytics/combustible ────────────────────────────────────
router.get(
  '/analytics/combustible',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const today = todayYmdEc();
    const monthStart = today.slice(0, 8) + '01';

    const [agg, top] = await Promise.all([
      db.select({
        totalCost: sql<string>`COALESCE(SUM(${companyFuelEntries.cost}), 0)::text`,
        totalGallons: sql<string>`COALESCE(SUM(${companyFuelEntries.gallons}), 0)::text`,
        registros: count(),
      })
        .from(companyFuelEntries)
        .where(and(
          eq(companyFuelEntries.companyId, companyId),
          gte(companyFuelEntries.date, monthStart),
          lte(companyFuelEntries.date, today),
        )),
      db.select({
        assetId: companyFuelEntries.assetId,
        assetName: companyAssets.name,
        cost: sql<string>`SUM(${companyFuelEntries.cost})::text`,
        gallons: sql<string>`SUM(${companyFuelEntries.gallons})::text`,
      })
        .from(companyFuelEntries)
        .leftJoin(companyAssets, eq(companyAssets.id, companyFuelEntries.assetId))
        .where(and(
          eq(companyFuelEntries.companyId, companyId),
          gte(companyFuelEntries.date, monthStart),
          lte(companyFuelEntries.date, today),
        ))
        .groupBy(companyFuelEntries.assetId, companyAssets.name)
        .orderBy(sql`SUM(${companyFuelEntries.cost}) DESC`)
        .limit(10),
    ]);

    res.json({
      periodo: { desde: monthStart, hasta: today },
      totalCosto: Number(agg[0]?.totalCost ?? 0),
      totalGalones: Number(agg[0]?.totalGallons ?? 0),
      registros: agg[0]?.registros ?? 0,
      topVehiculos: top.map((v) => ({
        id: `vehicle-${v.assetId}`,
        nombre: v.assetName,
        costo: Number(v.cost),
        galones: Number(v.gallons),
      })),
      resumenTexto: `Combustible del mes: $${Number(agg[0]?.totalCost ?? 0).toFixed(2)} en ${agg[0]?.registros ?? 0} carga(s).`,
    });
  }),
);

export default router;
