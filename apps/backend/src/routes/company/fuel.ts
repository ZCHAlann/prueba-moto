import { Router } from 'express';
import { z } from 'zod';
import { eq, and, gte, lte } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyFuelEntries, companyAssets, companyDrivers } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { safeString, validators } from '../../lib/validators';
import { toId, parseId, parseIdFlexible  } from '../../lib/ids';
import { NotFoundError } from '../../lib/errors';
import { logAudit } from '../../lib/audit';



const router = Router({ mergeParams: true });

// ─── Constante de conversión ────────────────────────────────────────────────
const GAL_PER_LITER = 0.264172052; // US gallon por litro
const LITER_PER_GAL = 3.785411784; // litro por US gallon

function galToLiter(gal: number): number {
  return Number((gal * LITER_PER_GAL).toFixed(4));
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createFuelSchema = z.object({
  assetId: z.string().min(1, 'El activo es requerido'),
  driverId: z.string().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  /** Volumen en galones US (enviado desde el frontend). */
  gallons: z.number().positive('Los galones deben ser mayores a 0').max(10_000_000),
  cost: z.number().nonnegative().max(1_000_000_000).optional().nullable(),
  odometer: z.number().nonnegative().max(100_000_000).optional().nullable(),
  station: safeString({ max: 120, fieldLabel: 'Estación', allowEmpty: true }).nullable().optional(),
  fuelType: z.enum(['Diesel', 'Gasolina', 'Electrico', 'Hibrido']).optional().nullable(),
  notes: validators.longTextOptional,
  photoUrl: z.string().min(1).max(2_000_000).nullable().optional(),
  odometerPhotoUrl: z.string().min(1).max(2_000_000).nullable().optional(),
});

const updateFuelSchema = z.object({
  assetId: z.string().optional(),
  driverId: z.string().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)').optional(),
  gallons: z.number().positive().max(10_000_000).optional(),
  cost: z.number().nonnegative().max(1_000_000_000).optional().nullable(),
  odometer: z.number().nonnegative().max(100_000_000).optional().nullable(),
  station: safeString({ max: 120, fieldLabel: 'Estación', allowEmpty: true }).nullable().optional(),
  fuelType: z.enum(['Diesel', 'Gasolina', 'Electrico', 'Hibrido']).optional().nullable(),
  notes: validators.longTextOptional,
  photoUrl: z.string().min(1).max(2_000_000).nullable().optional(),
  odometerPhotoUrl: z.string().min(1).max(2_000_000).nullable().optional(),
});

// ─── GET /company/:id/fuel ────────────────────────────────────────────────────
// Query: ?assetId=asset-1 &driverId=driver-1 &from=2024-01-01 &to=2024-12-31

router.get('/', requireModule('combustible'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { assetId, driverId, from, to } = req.query;

    let rows = await db
      .select()
      .from(companyFuelEntries)
      .where(eq(companyFuelEntries.companyId, companyId))
      .orderBy(companyFuelEntries.date);

    if (assetId && typeof assetId === 'string') {
      const parsedAssetId = parseIdFlexible('asset', assetId);
      rows = rows.filter((f) => f.assetId === parsedAssetId);
    }

    if (driverId && typeof driverId === 'string') {
      const parsedDriverId = parseIdFlexible('driver', driverId);
      rows = rows.filter((f) => f.driverId === parsedDriverId);
    }

    if (from && typeof from === 'string') {
      rows = rows.filter((f) => f.date >= from);
    }

    if (to && typeof to === 'string') {
      rows = rows.filter((f) => f.date <= to);
    }

    // ── Enrichment: cargar nombres de activos ─────────────────────────────────
    const assetsRows = await db
      .select({ id: companyAssets.id, plate: companyAssets.plate, brand: companyAssets.brand, model: companyAssets.model })
      .from(companyAssets)
      .where(eq(companyAssets.companyId, companyId));

    const assetMap = new Map(assetsRows.map(a => [a.id, { plate: a.plate, brand: a.brand, model: a.model }]));

    res.json({
      data: rows.map(f => serializeFuel(f, assetMap.get(f.assetId))),
      total: rows.length,
      assets: assetsRows.map(a => ({
        id: toId('asset', a.id),
        plate: a.plate,
        brand: a.brand,
        model: a.model,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/fuel/:fuelId ────────────────────────────────────────────

router.get('/:fuelId', requireModule('combustible'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const fuelId = parseId('fuel', req.params.fuelId);

    const rows = await db
      .select()
      .from(companyFuelEntries)
      .where(and(eq(companyFuelEntries.id, fuelId), eq(companyFuelEntries.companyId, companyId)))
      .limit(1);

    if (!rows.length) throw new NotFoundError('Registro de combustible', req.params.fuelId);

    // ── Enrichment ────────────────────────────────────────────────────────────
    const [assetInfo] = await db
      .select({ plate: companyAssets.plate, brand: companyAssets.brand, model: companyAssets.model })
      .from(companyAssets)
      .where(eq(companyAssets.id, rows[0].assetId))
      .limit(1);

    res.json(serializeFuel(rows[0], assetInfo ?? null));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/fuel ───────────────────────────────────────────────────

router.post(
  '/',
  requireModule('combustible'),
  validate(createFuelSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createFuelSchema>;

      const assetId = parseIdFlexible('asset', body.assetId);
      const driverId = body.driverId ? parseIdFlexible('driver', body.driverId) : null;

      const asset = await db
        .select()
        .from(companyAssets)
        .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
        .limit(1);
      if (!asset.length) throw new NotFoundError('Activo', body.assetId);

      if (driverId) {
        const driver = await db
          .select()
          .from(companyDrivers)
          .where(and(eq(companyDrivers.id, driverId), eq(companyDrivers.companyId, companyId)))
          .limit(1);
        if (!driver.length) throw new NotFoundError('Conductor', body.driverId!);
      }

      const [created] = await db
        .insert(companyFuelEntries)
        .values({
          companyId,
          assetId,
          driverId: driverId ?? undefined,
          date: body.date,
          gallons: String(body.gallons.toFixed(4)),
          liters: String(galToLiter(body.gallons)),
          cost: body.cost !== undefined && body.cost !== null ? String(body.cost) : undefined,
          odometer: body.odometer !== undefined && body.odometer !== null ? String(body.odometer) : undefined,
          station: body.station ?? null,
          fuelType: body.fuelType ?? null,
          notes: body.notes ?? null,
          photoUrl: body.photoUrl ?? null,
          odometerPhotoUrl: body.odometerPhotoUrl ?? null,
        })
        .returning();

      // ── Generar N.° de factura autoincremental ────────────────────────────
      // Usamos el `id` serial que Postgres ya asignó de forma atómica (sin
      // condiciones de carrera, sin necesidad de un contador aparte).
      // Formato: FAC-0001, FAC-0002... — único a nivel de TODA la tabla,
      // no por empresa (evita tener que lockear filas de un contador
      // compartido entre empresas).
      const invoiceNumber = `FAC-${String(created.id).padStart(4, '0')}`;
      const [withInvoice] = await db
        .update(companyFuelEntries)
        .set({ invoiceNumber })
        .where(eq(companyFuelEntries.id, created.id))
        .returning();

      await logAudit(db, companyId, {
        entity: 'fuel',
        entityId: toId('fuel', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Carga de combustible registrada: ${body.gallons.toFixed(2)} gal para "${asset[0].name}" (${invoiceNumber}).`,
      });

      res.status(201).json(serializeFuel(withInvoice, { plate: asset[0].plate, brand: asset[0].brand, model: asset[0].model }));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/fuel/:fuelId ────────────────────────────────────────────

router.put(
  '/:fuelId',
  requireModule('combustible'),
  requireAdmin,
  validate(updateFuelSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const fuelId = parseId('fuel', req.params.fuelId);
      const body = req.body as z.infer<typeof updateFuelSchema>;

      // Defensa explícita: invoiceNumber NUNCA es editable por el cliente,
      // sin importar qué schema esté activo. Se genera una sola vez al
      // crear el registro y es inmutable de ahí en adelante.
      if ('invoiceNumber' in req.body) {
        return next(new AppError(400, 'El número de factura no puede modificarse manualmente.'));
      }

      const existing = await db
        .select()
        .from(companyFuelEntries)
        .where(and(eq(companyFuelEntries.id, fuelId), eq(companyFuelEntries.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Registro de combustible', req.params.fuelId);

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.assetId !== undefined) updateData.assetId = parseIdFlexible('asset', body.assetId!);
      if (body.driverId !== undefined) updateData.driverId = body.driverId ? parseIdFlexible('driver', body.driverId) : null;
      if (body.date !== undefined) updateData.date = body.date;
      if (body.gallons !== undefined) {
        updateData.gallons = String(body.gallons.toFixed(4));
        updateData.liters = String(galToLiter(body.gallons));
      }
      if (body.cost !== undefined) updateData.cost = body.cost !== null ? String(body.cost) : null;
      if (body.odometer !== undefined) updateData.odometer = body.odometer !== null ? String(body.odometer) : null;
      if (body.station !== undefined) updateData.station = body.station;
      if (body.fuelType !== undefined) updateData.fuelType = body.fuelType;
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.photoUrl !== undefined) updateData.photoUrl = body.photoUrl;
      if (body.odometerPhotoUrl !== undefined) updateData.odometerPhotoUrl = body.odometerPhotoUrl;
      // Nota: invoiceNumber deliberadamente ausente de este bloque — es inmutable.

      const [updated] = await db
        .update(companyFuelEntries)
        .set(updateData)
        .where(and(eq(companyFuelEntries.id, fuelId), eq(companyFuelEntries.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity: 'fuel',
        entityId: toId('fuel', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Registro de combustible "${toId('fuel', updated.id)}" actualizado.`,
      });

      const [assetInfo] = await db
        .select({ plate: companyAssets.plate, brand: companyAssets.brand, model: companyAssets.model })
        .from(companyAssets)
        .where(eq(companyAssets.id, updated.assetId))
        .limit(1);

      res.json(serializeFuel(updated, assetInfo ?? null));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/fuel/:fuelId ─────────────────────────────────────────

router.delete(
  '/:fuelId',
  requireModule('combustible'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const fuelId = parseId('fuel', req.params.fuelId);

      const existing = await db
        .select()
        .from(companyFuelEntries)
        .where(and(eq(companyFuelEntries.id, fuelId), eq(companyFuelEntries.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Registro de combustible', req.params.fuelId);

      await db
        .delete(companyFuelEntries)
        .where(and(eq(companyFuelEntries.id, fuelId), eq(companyFuelEntries.companyId, companyId)));

      await logAudit(db, companyId, {
        entity: 'fuel',
        entityId: toId('fuel', fuelId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Registro de combustible eliminado.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeFuel(
  f: typeof companyFuelEntries.$inferSelect,
  assetInfo?: { plate: string | null; brand: string | null; model: string | null } | null
) {
  return {
    id: toId('fuel', f.id),
    companyId: toId('company', f.companyId),
    assetId: toId('asset', f.assetId),
    driverId: f.driverId ? toId('driver', f.driverId) : null,
    date: f.date,
    gallons: Number(f.gallons),
    liters: Number(f.liters),
    cost: f.cost !== null ? Number(f.cost) : null,
    odometer: f.odometer !== null ? Number(f.odometer) : null,
    station: f.station,
    fuelType: f.fuelType,
    notes: f.notes,
    photoUrl: f.photoUrl,
    odometerPhotoUrl: f.odometerPhotoUrl ?? null,
    invoiceNumber: f.invoiceNumber ?? null, // NUEVO
    assetPlate: assetInfo?.plate ?? null,
    assetBrand: assetInfo?.brand ?? null,
    assetModel: assetInfo?.model ?? null,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

// ─── GET /company/:id/fuel/analytics/insights ─────────────────────────────────
//
// Análisis automático de combustible (solo admin/owner).
// Detecta:
//   - Picos de consumo por vehículo (z-score > 2 sobre su media histórica).
//   - Top 5 / Bottom 5 vehículos por litros totales en el rango.
//   - Mejor / peor rendimiento (km/L) por vehículo.
//   - Tendencia (sube / baja / estable) comparando 1ra vs 2da mitad del rango.
//   - Mes más caro y más barato por vehículo (picos positivos y negativos).
//
// Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD&assetId=asset-42 (opcional)

router.get('/analytics/insights', requireModule('combustible'), requireAdmin, async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { from, to, assetId } = req.query as { from?: string; to?: string; assetId?: string };

    const conditions: any[] = [eq(companyFuelEntries.companyId, companyId)];
    if (from) conditions.push(gte(companyFuelEntries.date, from));
    if (to)   conditions.push(lte(companyFuelEntries.date, to));
    if (assetId) conditions.push(eq(companyFuelEntries.assetId, parseIdFlexible('asset', assetId)));

    const rows = await db
      .select({
        id:        companyFuelEntries.id,
        date:      companyFuelEntries.date,
        gallons:   companyFuelEntries.gallons,
        cost:      companyFuelEntries.cost,
        odometer:  companyFuelEntries.odometer,
        assetId:   companyFuelEntries.assetId,
        assetName: companyAssets.name,
        assetPlate: companyAssets.plate,
      })
      .from(companyFuelEntries)
      .leftJoin(companyAssets, eq(companyAssets.id, companyFuelEntries.assetId))
      .where(and(...conditions))
      .orderBy(companyFuelEntries.date);

    if (rows.length === 0) {
      return res.json({
        range: { from: from ?? null, to: to ?? null, totalRecords: 0 },
        topConsumers: [],
        bottomConsumers: [],
        bestEfficiency: [],
        worstEfficiency: [],
        peaks: [],
        trends: [],
        insights: [],
      });
    }

    // 1) Agrupar por vehículo
    type Row = typeof rows[number];
    const byAsset = new Map<number, Row[]>();
    for (const r of rows) {
      if (!byAsset.has(r.assetId)) byAsset.set(r.assetId, []);
      byAsset.get(r.assetId)!.push(r);
    }

    // 2) Stats por vehículo
    type AssetStats = {
      assetId: number;
      plate: string | null;
      name: string | null;
      totalGallons: number;
      totalCost: number;
      records: number;
      meanGallons: number;
      stdGallons: number;
      // Para eficiencia (km/gal): requiere al menos 2 registros con odómetro
      efficiency: number | null;
      firstHalf: number;
      secondHalf: number;
      trend: 'up' | 'down' | 'stable';
      peakRow: Row | null;
    };

    const assetStats: AssetStats[] = [];

    for (const [assetId, assetRows] of byAsset) {
      const totalGallons = assetRows.reduce((s, r) => s + Number(r.gallons), 0);
      const totalCost    = assetRows.reduce((s, r) => s + Number(r.cost ?? 0), 0);
      const n = assetRows.length;
      const mean = totalGallons / n;
      const variance = assetRows.reduce((s, r) => s + Math.pow(Number(r.gallons) - mean, 2), 0) / n;
      const std = Math.sqrt(variance);

      // Eficiencia: el último odómetro - el primero, sobre los galones entre medio
      let efficiency: number | null = null;
      const odoRows = assetRows.filter((r) => r.odometer != null).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      if (odoRows.length >= 2) {
        const odoStart = Number(odoRows[0].odometer);
        const odoEnd   = Number(odoRows[odoRows.length - 1].odometer);
        const km = odoEnd - odoStart;
        if (km > 0 && totalGallons > 0) efficiency = km / totalGallons;
      }

      // Tendencia: comparar 1ra mitad vs 2da mitad
      const half = Math.floor(n / 2);
      const firstHalf  = half > 0 ? assetRows.slice(0, half).reduce((s, r) => s + Number(r.gallons), 0) / half : 0;
      const secondHalf = n - half > 0 ? assetRows.slice(half).reduce((s, r) => s + Number(r.gallons), 0) / (n - half) : 0;
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (firstHalf > 0) {
        const ratio = (secondHalf - firstHalf) / firstHalf;
        if (ratio > 0.15) trend = 'up';
        else if (ratio < -0.15) trend = 'down';
      }

      // Pico: el registro con z-score más alto
      let peakRow: Row | null = null;
      let peakZ = 0;
      if (std > 0) {
        for (const r of assetRows) {
          const z = Math.abs((Number(r.gallons) - mean) / std);
          if (z > 2 && z > peakZ) {
            peakZ = z;
            peakRow = r;
          }
        }
      }

      assetStats.push({
        assetId,
        plate:  assetRows[0]?.assetPlate ?? null,
        name:   assetRows[0]?.assetName ?? null,
        totalGallons,
        totalCost,
        records: n,
        meanGallons: mean,
        stdGallons: std,
        efficiency,
        firstHalf,
        secondHalf,
        trend,
        peakRow,
      });
    }

    // 3) Top 5 / Bottom 5 por galones
    const sorted = [...assetStats].sort((a, b) => b.totalGallons - a.totalGallons);
    const topConsumers    = sorted.slice(0, 5).map((s) => ({
      assetId: toId('asset', s.assetId),
      plate: s.plate, name: s.name,
      totalGallons: Math.round(s.totalGallons * 100) / 100,
      totalCost: Math.round(s.totalCost * 100) / 100,
      records: s.records,
    }));
    const bottomConsumers = sorted.slice(-5).reverse().filter((s) => s.records >= 2).map((s) => ({
      assetId: toId('asset', s.assetId),
      plate: s.plate, name: s.name,
      totalGallons: Math.round(s.totalGallons * 100) / 100,
      totalCost: Math.round(s.totalCost * 100) / 100,
      records: s.records,
    }));

    // 4) Mejor / peor eficiencia
    const withEff = assetStats.filter((s) => s.efficiency != null);
    const bestEff = [...withEff].sort((a, b) => (b.efficiency ?? 0) - (a.efficiency ?? 0)).slice(0, 3).map((s) => ({
      assetId: toId('asset', s.assetId),
      plate: s.plate, name: s.name,
      efficiency: Math.round((s.efficiency ?? 0) * 100) / 100,
    }));
    const worstEff = [...withEff].sort((a, b) => (a.efficiency ?? 0) - (b.efficiency ?? 0)).slice(0, 3).map((s) => ({
      assetId: toId('asset', s.assetId),
      plate: s.plate, name: s.name,
      efficiency: Math.round((s.efficiency ?? 0) * 100) / 100,
    }));

    // 5) Picos (z-score > 2)
    const peaks = assetStats
      .filter((s) => s.peakRow != null)
      .map((s) => {
        const r = s.peakRow!;
        const z = (Number(r.gallons) - s.meanGallons) / s.stdGallons;
        return {
          assetId: toId('asset', s.assetId),
          plate: s.plate, name: s.name,
          date: r.date,
          gallons: Math.round(Number(r.gallons) * 100) / 100,
          cost: r.cost != null ? Math.round(Number(r.cost) * 100) / 100 : null,
          avgGallons: Math.round(s.meanGallons * 100) / 100,
          zScore: Math.round(z * 100) / 100,
          severity: z > 3 ? 'extreme' : 'high',
        };
      })
      .sort((a, b) => b.zScore - a.zScore)
      .slice(0, 10);

    // 6) Tendencias (sube / baja / estable)
    const trends = assetStats.filter((s) => s.records >= 3).map((s) => ({
      assetId: toId('asset', s.assetId),
      plate: s.plate, name: s.name,
      trend: s.trend,
      firstHalfAvg: Math.round(s.firstHalf * 100) / 100,
      secondHalfAvg: Math.round(s.secondHalf * 100) / 100,
      changePct: s.firstHalf > 0 ? Math.round(((s.secondHalf - s.firstHalf) / s.firstHalf) * 100) : 0,
    }));

    // 7) Insights generados (texto corto con color)
    const insights: Array<{ kind: 'positive' | 'negative' | 'warning' | 'info'; text: string; assetId?: string }> = [];

    if (topConsumers.length > 0) {
      const t = topConsumers[0];
      insights.push({
        kind: 'warning',
        text: `${t.plate ?? t.name ?? 'Un vehículo'} es el mayor consumidor: ${t.totalGallons} gal en el período.`,
        assetId: t.assetId,
      });
    }
    for (const p of peaks) {
      const ratio = p.zScore;
      insights.push({
        kind: ratio > 3 ? 'negative' : 'warning',
        text: `Pico en ${p.plate ?? p.name} el ${p.date}: ${p.gallons} gal (${ratio}× su media de ${p.avgGallons} gal). Posible causa: ruta larga, carga extra o error de odómetro.`,
        assetId: p.assetId,
      });
    }
    for (const t of trends.filter((x) => x.trend !== 'stable')) {
      const dir = t.trend === 'up' ? 'subió' : 'bajó';
      const kind = t.trend === 'up' ? 'negative' : 'positive';
      insights.push({
        kind: kind as 'positive' | 'negative',
        text: `Consumo de ${t.plate ?? t.name} ${dir} ${Math.abs(t.changePct)}% en la 2da mitad del período.`,
        assetId: t.assetId,
      });
    }
    if (bestEff.length > 0) {
      const b = bestEff[0];
      insights.push({
        kind: 'positive',
        text: `${b.plate ?? b.name} tiene el mejor rendimiento: ${b.efficiency} km/gal.`,
        assetId: b.assetId,
      });
    }
    if (worstEff.length > 0) {
      const w = worstEff[0];
      insights.push({
        kind: 'warning',
        text: `${w.plate ?? w.name} tiene el peor rendimiento: ${w.efficiency} km/gal. Revisar presión de llantas, alineación o carga.`,
        assetId: w.assetId,
      });
    }

    res.json({
      range: { from: from ?? null, to: to ?? null, totalRecords: rows.length },
      topConsumers,
      bottomConsumers,
      bestEfficiency: bestEff,
      worstEfficiency: worstEff,
      peaks,
      trends,
      insights,
    });
  } catch (err) {
    next(err);
  }
});

export default router;