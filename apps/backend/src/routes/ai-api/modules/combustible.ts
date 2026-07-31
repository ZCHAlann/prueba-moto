// routes/ai-api/modules/combustible.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Endpoints de combustible (fuel) para /api/ai/*.
// 4 endpoints: 1 resumen existente + 3 nuevos (lista, registrar, anomalías).
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, lte, sql, count } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyFuelEntries, companyAssets, companyDrivers,
  companyStatsAnomalies,
} from '../../../db/schema/operational';
import { authAiApiKey, requireAiApiScope } from '../../../middlewares/auth-ai-key';
import {
  withAudit, requireCtx, parseBody, parseQuery,
  resolveAsset, resolveDriver, todayYmdEc,
} from '../shared';
import { AppError, NotFoundError } from '../../../lib/errors';

const router = Router();

// ── 1. GET /combustible/resumen (existente) ──────────────────────────
router.get(
  '/combustible/resumen',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const today = todayYmdEc();
    const monthStart = today.slice(0, 8) + '01';

    const [mes, top, ultimos] = await Promise.all([
      db.select({
        totalCost: sql<string>`COALESCE(SUM(${companyFuelEntries.cost}), 0)::text`,
        totalGallons: sql<string>`COALESCE(SUM(${companyFuelEntries.gallons}), 0)::text`,
        entries: count(),
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
        assetPlate: companyAssets.plate,
        totalCost: sql<string>`SUM(${companyFuelEntries.cost})::text`,
        totalGallons: sql<string>`SUM(${companyFuelEntries.gallons})::text`,
        entries: count(),
      })
        .from(companyFuelEntries)
        .leftJoin(companyAssets, eq(companyAssets.id, companyFuelEntries.assetId))
        .where(and(
          eq(companyFuelEntries.companyId, companyId),
          gte(companyFuelEntries.date, monthStart),
          lte(companyFuelEntries.date, today),
        ))
        .groupBy(companyFuelEntries.assetId, companyAssets.name, companyAssets.plate)
        .orderBy(sql`SUM(${companyFuelEntries.cost}) DESC`)
        .limit(5),
      db.select({
        id: companyFuelEntries.id, date: companyFuelEntries.date,
        assetName: companyAssets.name,
        gallons: companyFuelEntries.gallons, cost: companyFuelEntries.cost,
      })
        .from(companyFuelEntries)
        .leftJoin(companyAssets, eq(companyAssets.id, companyFuelEntries.assetId))
        .where(eq(companyFuelEntries.companyId, companyId))
        .orderBy(desc(companyFuelEntries.date))
        .limit(5),
    ]);

    const m = mes[0] ?? { totalCost: '0', totalGallons: '0', entries: 0 };
    const totalCost = Number(m.totalCost);
    const totalGallons = Number(m.totalGallons);
    const promedio = top.length > 0 ? totalCost / top.length : 0;

    res.json({
      periodo: { desde: monthStart, hasta: today },
      totalCosto: totalCost,
      totalGalones: totalGallons,
      totalCargas: m.entries,
      promedioPorVehiculo: promedio,
      topVehiculos: top.map((v) => ({
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
      resumenTexto: `Consumo del mes: $${totalCost.toFixed(2)} en ${m.entries} carga(s) (${totalGallons.toFixed(2)} galones). Promedio por vehículo: $${promedio.toFixed(2)}.`,
    });
  }),
);

// ── 2. GET /combustible (lista) ──────────────────────────────────────
const listQuery = z.object({
  vehiculo: z.string().max(120).optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get(
  '/combustible',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const { vehiculo, desde, hasta, limit } = parseQuery(listQuery, req.query);

    const conds = [eq(companyFuelEntries.companyId, companyId)];
    if (vehiculo) {
      const a = await resolveAsset(companyId, vehiculo);
      conds.push(eq(companyFuelEntries.assetId, a.id));
    }
    if (desde) conds.push(gte(companyFuelEntries.date, desde));
    if (hasta) conds.push(lte(companyFuelEntries.date, hasta));

    const rows = await db
      .select({
        id: companyFuelEntries.id,
        date: companyFuelEntries.date,
        assetId: companyFuelEntries.assetId,
        assetName: companyAssets.name,
        assetPlate: companyAssets.plate,
        gallons: companyFuelEntries.gallons,
        liters: companyFuelEntries.liters,
        cost: companyFuelEntries.cost,
        odometer: companyFuelEntries.odometer,
        station: companyFuelEntries.station,
        fuelType: companyFuelEntries.fuelType,
      })
      .from(companyFuelEntries)
      .leftJoin(companyAssets, eq(companyAssets.id, companyFuelEntries.assetId))
      .where(and(...conds))
      .orderBy(desc(companyFuelEntries.date))
      .limit(limit);

    res.json({
      total: rows.length,
      cargas: rows.map((r) => ({
        id: `fuel-${r.id}`,
        fecha: r.date,
        vehiculo: r.assetName,
        vehiculoPlaca: r.assetPlate,
        galones: Number(r.gallons ?? 0),
        litros: Number(r.liters ?? 0),
        costo: Number(r.cost ?? 0),
        odometro: r.odometer ? Number(r.odometer) : null,
        estacion: r.station,
        tipoCombustible: r.fuelType,
      })),
    });
  }),
);

// ── 3. POST /combustible/registrar ───────────────────────────────────
const registrarSchema = z.object({
  vehiculo: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  galones: z.coerce.number().positive().optional(),
  litros: z.coerce.number().positive().optional(),
  costo: z.coerce.number().min(0),
  odometro: z.coerce.number().min(0).optional(),
  estacion: z.string().max(160).optional(),
  tipoCombustible: z.string().max(40).optional(),
  conductor: z.string().max(160).optional(),
});

router.post(
  '/combustible/registrar',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const body = parseBody(registrarSchema, req.body);

    const asset = await resolveAsset(companyId, body.vehiculo);
    let driverId: number | null = null;
    if (body.conductor) {
      driverId = (await resolveDriver(companyId, body.conductor)).id;
    }

    // Si el usuario mandó litros, calcular galones; si mandó galones, calcular litros.
    let gallons = body.galones;
    let liters = body.litros;
    if (gallons != null && liters == null) liters = gallons * 3.78541;
    if (liters != null && gallons == null) gallons = liters / 3.78541;
    if (gallons == null) throw new AppError(400, 'Debe especificar galones o litros');

    const [created] = await db.insert(companyFuelEntries).values({
      companyId,
      assetId: asset.id,
      driverId,
      date: body.fecha ?? todayYmdEc(),
      gallons: String(gallons),
      liters: String(liters ?? 0),
      cost: String(body.costo),
      odometer: body.odometro != null ? String(body.odometro) : null,
      station: body.estacion ?? null,
      fuelType: body.tipoCombustible ?? null,
    }).returning();

    res.status(201).json({
      id: `fuel-${created.id}`,
      vehiculo: asset.name,
      fecha: created.date,
      galones: Number(created.gallons),
      litros: Number(created.liters),
      costo: Number(created.cost),
      odometro: created.odometer ? Number(created.odometer) : null,
      resumenTexto: `Carga de combustible registrada para ${asset.name}: ${Number(created.gallons).toFixed(2)} galones por $${Number(created.cost).toFixed(2)}.`,
    });
  }),
);

// ── 4. GET /combustible/anomalias ────────────────────────────────────
router.get(
  '/combustible/anomalias',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);

    const rows = await db.select()
      .from(companyStatsAnomalies)
      .where(and(
        eq(companyStatsAnomalies.companyId, companyId),
        eq(companyStatsAnomalies.modulo, 'combustible'),
      ))
      .orderBy(desc(companyStatsAnomalies.detectadoEn))
      .limit(50);

    res.json({
      total: rows.length,
      anomalias: rows.map((r) => ({
        id: `anom-${r.id}`,
        tipo: r.tipo,
        dimension: r.dimension,
        dimensionId: r.dimensionId,
        dimensionLabel: r.dimensionLabel,
        severidad: r.severidad,
        descripcion: r.descripcion,
        metadata: r.metadata,
        fecha: r.detectadoEn,
      })),
      resumenTexto: rows.length === 0
        ? 'No hay anomalías de combustible detectadas.'
        : `Hay ${rows.length} anomalía(s) de combustible. La más reciente tiene severidad ${rows[0].severidad}.`,
    });
  }),
);

export default router;
