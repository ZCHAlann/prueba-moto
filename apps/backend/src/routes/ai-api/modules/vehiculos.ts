// routes/ai-api/modules/vehiculos.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Endpoints de vehículos (assets) para /api/ai/*.
// 9 endpoints: 2 GET originales + 7 nuevos (write + extras).
// ─────────────────────────────────────────────────────────────────────

import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, isNull, lte, or, sql, count } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyAssets,
  companyAlerts,
  companyMaintenanceRecords,
  companyFuelEntries,
  companyTollEntries,
  assetNotes,
  companyOdometerReadings,
} from '../../../db/schema/operational';
import { authAiApiKey, requireAiApiScope } from '../../../middlewares/auth-ai-key';
import {
  withAudit, requireCtx, parseBody, parseQuery,
  resolveAsset, todayYmdEc, parseEntityId,
} from '../shared';
import { AppError, NotFoundError } from '../../../lib/errors';
import { toId } from '../../../lib/ids';

const router = Router();

// ── 1. GET /vehiculos ─────────────────────────────────────────────────
const listQuery = z.object({
  estado: z.enum(['Operativo', 'En mantenimiento', 'Fuera de servicio']).optional(),
  busqueda: z.string().max(80).optional(),
});

router.get(
  '/vehiculos',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const { estado, busqueda } = parseQuery(listQuery, req.query);

    const conds = [eq(companyAssets.companyId, companyId)];
    if (estado) conds.push(eq(companyAssets.status, estado));
    if (busqueda) {
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
      .limit(200);

    res.json({
      total: rows.length,
      vehiculos: rows.map((r) => ({
        id: `vehicle-${r.id}`,
        nombre: r.name,
        codigo: r.code,
        placa: r.plate,
        estado: r.status,
        marca: r.brand,
        modelo: r.model,
        anio: r.year,
      })),
    });
  }),
);

// ── 2. GET /vehiculos/:id ─────────────────────────────────────────────
router.get(
  '/vehiculos/:id',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'vehicle');

    const [asset] = await db
      .select()
      .from(companyAssets)
      .where(and(eq(companyAssets.id, idNum), eq(companyAssets.companyId, companyId)))
      .limit(1);
    if (!asset) throw new NotFoundError('Vehículo', String(req.params.id));

    const [alertas, proxMaint, ultCarga] = await Promise.all([
      db.select({
        id: companyAlerts.id, title: companyAlerts.title,
        severity: companyAlerts.severity, status: companyAlerts.status,
      })
        .from(companyAlerts)
        .where(and(
          eq(companyAlerts.companyId, companyId),
          eq(companyAlerts.assetId, idNum),
          or(
            eq(companyAlerts.status, 'Abierta'),
            eq(companyAlerts.status, 'En progreso'),
            isNull(companyAlerts.status),
          )!,
        ))
        .orderBy(desc(companyAlerts.createdAt))
        .limit(10),
      db.select({
        id: companyMaintenanceRecords.id,
        title: companyMaintenanceRecords.title,
        category: companyMaintenanceRecords.category,
        status: companyMaintenanceRecords.status,
        scheduledFor: companyMaintenanceRecords.scheduledFor,
      })
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.companyId, companyId),
          eq(companyMaintenanceRecords.assetId, idNum),
          eq(companyMaintenanceRecords.status, 'Programado'),
        ))
        .orderBy(companyMaintenanceRecords.scheduledFor)
        .limit(1),
      db.select({
        date: companyFuelEntries.date,
        gallons: companyFuelEntries.gallons,
        cost: companyFuelEntries.cost,
        odometer: companyFuelEntries.odometer,
      })
        .from(companyFuelEntries)
        .where(and(
          eq(companyFuelEntries.companyId, companyId),
          eq(companyFuelEntries.assetId, idNum),
        ))
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
      anio: asset.year,
      color: asset.color,
      kmActual: ultCarga[0] ? Number(ultCarga[0].odometer ?? 0) : null,
      alertasActivas: alertas.map((a) => ({
        id: `alert-${a.id}`, titulo: a.title, severidad: a.severidad, status: a.status,
      })),
      proximoMantenimiento: proxMaint[0] ? {
        id: `maintenance-${proxMaint[0].id}`,
        titulo: proxMaint[0].title ?? proxMaint[0].category,
        categoria: proxMaint[0].category,
        fecha: proxMaint[0].scheduledFor,
      } : null,
      ultimaCargaCombustible: ultCarga[0] ? {
        fecha: ultCarga[0].date,
        galones: Number(ultCarga[0].gallons ?? 0),
        costo: Number(ultCarga[0].cost ?? 0),
        odometro: Number(ultCarga[0].odometer ?? 0),
      } : null,
    });
  }),
);

// ── 3. POST /vehiculos/create ────────────────────────────────────────
const createSchema = z.object({
  nombre: z.string().min(2).max(160),
  codigo: z.string().min(1).max(40),
  placa: z.string().max(40).optional(),
  anio: z.string().max(10).optional(),
  marca: z.string().max(120).optional(),
  modelo: z.string().max(120).optional(),
  color: z.string().max(60).optional(),
  assetType: z.enum(['Vehiculo', 'Maquinaria', 'Equipo']).default('Vehiculo'),
  fuelType: z.enum(['Gasolina', 'Diesel', 'Electrico', 'Hibrido', 'Gas']).optional(),
  responsible: z.string().max(160).optional(),
});

router.post(
  '/vehiculos/create',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const body = parseBody(createSchema, req.body);

    // Validar que el código no esté duplicado en la empresa.
    const [existing] = await db
      .select({ id: companyAssets.id })
      .from(companyAssets)
      .where(and(
        eq(companyAssets.companyId, companyId),
        eq(companyAssets.code, body.codigo),
      ))
      .limit(1);
    if (existing) {
      throw new AppError(409, `Ya existe un vehículo con código "${body.codigo}"`);
    }

    const [created] = await db.insert(companyAssets).values({
      companyId,
      name: body.nombre,
      code: body.codigo,
      plate: body.placa ?? null,
      year: body.anio ?? null,
      brand: body.marca ?? null,
      model: body.modelo ?? null,
      color: body.color ?? null,
      assetType: body.assetType,
      fuelType: body.fuelType,
      responsible: body.responsible ?? null,
      status: 'Operativo',
      photoUrls: [],
    }).returning();

    res.status(201).json({
      id: `vehicle-${created.id}`,
      nombre: created.name,
      codigo: created.code,
      placa: created.plate,
      estado: created.status,
      resumenTexto: `Vehículo "${created.name}" creado en estado Operativo.`,
    });
  }),
);

// ── 4. PATCH /vehiculos/:id/estado ────────────────────────────────────
const estadoSchema = z.object({
  estado: z.enum(['Operativo', 'En mantenimiento', 'Fuera de servicio']),
  motivo: z.string().max(500).optional(),
});

router.patch(
  '/vehiculos/:id/estado',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'vehicle');
    const body = parseBody(estadoSchema, req.body);

    const [existing] = await db.select({ id: companyAssets.id, status: companyAssets.status })
      .from(companyAssets)
      .where(and(eq(companyAssets.id, idNum), eq(companyAssets.companyId, companyId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Vehículo', String(req.params.id));

    const [updated] = await db.update(companyAssets)
      .set({ status: body.estado, updatedAt: new Date() })
      .where(eq(companyAssets.id, idNum))
      .returning({ id: companyAssets.id, name: companyAssets.name, status: companyAssets.status });

    // Side effect: si vuelve a Operativo, limpiar statusBeforeMaintenance.
    if (body.estado === 'Operativo') {
      await db.update(companyAssets)
        .set({ statusBeforeMaintenance: null })
        .where(eq(companyAssets.id, idNum));
    }

    res.json({
      id: `vehicle-${updated!.id}`,
      nombre: updated!.name,
      estadoAnterior: existing.status,
      estadoNuevo: updated!.status,
      motivo: body.motivo ?? null,
      resumenTexto: `Vehículo "${updated!.name}" cambió de "${existing.status}" a "${updated!.status}".${body.motivo ? ` Motivo: ${body.motivo}.` : ''}`,
    });
  }),
);

// ── 5. POST /vehiculos/:id/nota ───────────────────────────────────────
const notaSchema = z.object({
  texto: z.string().min(3).max(2000),
});

router.post(
  '/vehiculos/:id/nota',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'vehicle');
    const body = parseBody(notaSchema, req.body);

    const [asset] = await db.select({ id: companyAssets.id, name: companyAssets.name })
      .from(companyAssets)
      .where(and(eq(companyAssets.id, idNum), eq(companyAssets.companyId, companyId)))
      .limit(1);
    if (!asset) throw new NotFoundError('Vehículo', String(req.params.id));

    const [created] = await db.insert(assetNotes).values({
      companyId,
      assetId: idNum,
      authorName: 'AI Assistant',
      body: body.texto,
    }).returning();

    res.status(201).json({
      id: `note-${created.id}`,
      vehiculo: asset.name,
      texto: created.body,
      autor: created.authorName,
      fecha: created.createdAt,
      resumenTexto: `Nota agregada al vehículo "${asset.name}".`,
    });
  }),
);

// ── 6. POST /vehiculos/:id/odometro ───────────────────────────────────
const odometroSchema = z.object({
  km: z.coerce.number().int().min(0).max(9_999_999),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source: z.enum(['manual', 'gps']).default('manual'),
});

router.post(
  '/vehiculos/:id/odometro',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'vehicle');
    const body = parseBody(odometroSchema, req.body);

    const [asset] = await db.select({ id: companyAssets.id, name: companyAssets.name })
      .from(companyAssets)
      .where(and(eq(companyAssets.id, idNum), eq(companyAssets.companyId, companyId)))
      .limit(1);
    if (!asset) throw new NotFoundError('Vehículo', String(req.params.id));

    const [created] = await db.insert(companyOdometerReadings).values({
      companyId,
      assetId: idNum,
      km: body.km,
      source: body.source,
      takenAt: body.fecha ? new Date(`${body.fecha}T12:00:00Z`) : new Date(),
    }).returning();

    res.status(201).json({
      id: `odometer-${created.id}`,
      vehiculo: asset.name,
      km: Number(created.km),
      fecha: created.takenAt,
      source: created.source,
      resumenTexto: `Odómetro de "${asset.name}" actualizado a ${body.km} km.`,
    });
  }),
);

// ── 7. GET /vehiculos/:id/costos ──────────────────────────────────────
router.get(
  '/vehiculos/:id/costos',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'vehicle');

    const [asset] = await db.select({ id: companyAssets.id, name: companyAssets.name })
      .from(companyAssets)
      .where(and(eq(companyAssets.id, idNum), eq(companyAssets.companyId, companyId)))
      .limit(1);
    if (!asset) throw new NotFoundError('Vehículo', String(req.params.id));

    const [mant, fuel, toll] = await Promise.all([
      db.select({
        totalCost: sql<string>`COALESCE(SUM(${companyMaintenanceRecords.totalCost}), 0)::text`,
        count: count(),
      })
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.companyId, companyId),
          eq(companyMaintenanceRecords.assetId, idNum),
          eq(companyMaintenanceRecords.status, 'Completado'),
        )),
      db.select({
        totalCost: sql<string>`COALESCE(SUM(${companyFuelEntries.cost}), 0)::text`,
        count: count(),
      })
        .from(companyFuelEntries)
        .where(and(
          eq(companyFuelEntries.companyId, companyId),
          eq(companyFuelEntries.assetId, idNum),
        )),
      db.select({
        totalCost: sql<string>`COALESCE(SUM(${companyTollEntries.amount}), 0)::text`,
        count: count(),
      })
        .from(companyTollEntries)
        .where(and(
          eq(companyTollEntries.companyId, companyId),
          eq(companyTollEntries.assetId, idNum),
        )),
    ]);

    const m = mant[0] ?? { totalCost: '0', count: 0 };
    const f = fuel[0] ?? { totalCost: '0', count: 0 };
    const t = toll[0] ?? { totalCost: '0', count: 0 };
    const total = Number(m.totalCost) + Number(f.totalCost) + Number(t.totalCost);

    res.json({
      vehiculo: asset.name,
      mantenimiento: { total: Number(m.totalCost), registros: m.count },
      combustible:  { total: Number(f.totalCost), registros: f.count },
      peajes:       { total: Number(t.totalCost), registros: t.count },
      total,
      resumenTexto: `Costos totales de "${asset.name}": $${total.toFixed(2)} (mantenimiento $${Number(m.totalCost).toFixed(2)}, combustible $${Number(f.totalCost).toFixed(2)}, peajes $${Number(t.totalCost).toFixed(2)}).`,
    });
  }),
);

// ── 8. GET /vehiculos/:id/ubicacion ──────────────────────────────────
router.get(
  '/vehiculos/:id/ubicacion',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'vehicle');

    const [asset] = await db.select({
      id: companyAssets.id,
      name: companyAssets.name,
      lastLat: companyAssets.lastLat,
      lastLng: companyAssets.lastLng,
      lastGpsAt: companyAssets.lastGpsAt,
      engineOn: companyAssets.engineOn,
      locked: companyAssets.locked,
    })
      .from(companyAssets)
      .where(and(eq(companyAssets.id, idNum), eq(companyAssets.companyId, companyId)))
      .limit(1);
    if (!asset) throw new NotFoundError('Vehículo', String(req.params.id));

    if (asset.lastLat == null || asset.lastLng == null) {
      return res.json({
        vehiculo: asset.name,
        tieneGps: false,
        mensaje: `${asset.name} no tiene ubicación GPS registrada.`,
      });
    }

    res.json({
      vehiculo: asset.name,
      tieneGps: true,
      latitud: asset.lastLat,
      longitud: asset.lastLng,
      ultimaActualizacion: asset.lastGpsAt,
      motorEncendido: asset.engineOn ?? false,
      bloqueado: asset.locked ?? false,
      resumenTexto: `${asset.name} está en lat ${asset.lastLat.toFixed(4)}, lng ${asset.lastLng.toFixed(4)} (última actualización: ${asset.lastGpsAt?.toISOString() ?? 'desconocida'}).`,
    });
  }),
);

// ── 9. DELETE /vehiculos/:id (requiere confirmar: true) ──────────────
const deleteSchema = z.object({
  confirmar: z.literal(true, {
    errorMap: () => ({ message: 'Debe ser true explícitamente' }),
  }),
});

router.delete(
  '/vehiculos/:id',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'vehicle');
    parseBody(deleteSchema, req.body ?? {}); // lanza 400 si no está confirmar: true

    const [asset] = await db.select({ id: companyAssets.id, name: companyAssets.name })
      .from(companyAssets)
      .where(and(eq(companyAssets.id, idNum), eq(companyAssets.companyId, companyId)))
      .limit(1);
    if (!asset) throw new NotFoundError('Vehículo', String(req.params.id));

    // Soft-delete: marcar como "Fuera de servicio" + flag en notas. NO
    // borramos la fila porque hay mantenimientos / fuel / peajes
    // referenciando este vehículo. El borrado real requiere un proceso
    // de archivo que no hacemos en este endpoint.
    await db.update(companyAssets)
      .set({
        status: 'Fuera de servicio',
        notes: `[BAJA por AI] ${new Date().toISOString()} — confirmado por API Key`,
        updatedAt: new Date(),
      })
      .where(eq(companyAssets.id, idNum));

    res.json({
      id: `vehicle-${idNum}`,
      nombre: asset.name,
      mensaje: `Vehículo "${asset.name}" marcado como Fuera de servicio. Esta acción es reversible cambiando el estado manualmente.`,
      resumenTexto: `Vehículo "${asset.name}" dado de baja (soft-delete).`,
    });
  }),
);

export default router;
