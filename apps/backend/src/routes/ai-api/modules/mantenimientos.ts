// routes/ai-api/modules/mantenimientos.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Endpoints de mantenimientos para /api/ai/*.
// 11 endpoints: 3 existentes (read) + 8 nuevos (write + extras).
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, lte, or, sql, count } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyMaintenanceRecords, companyMaintenanceEvents,
  companyMaintenanceItems, companyAssets, companyUsers,
} from '../../../db/schema/operational';
import { authAiApiKey, requireAiApiScope } from '../../../middlewares/auth-ai-key';
import {
  withAudit, requireCtx, parseBody, parseQuery,
  resolveAsset, todayYmdEc, parseEntityId,
} from '../shared';
import { AppError, NotFoundError } from '../../../lib/errors';

const router = Router();

// ── 1. GET /mantenimientos (existente) ─────────────────────────────────
const listQuery = z.object({
  estado: z.enum(['pendiente', 'atrasado', 'completado']).optional(),
  dias: z.coerce.number().int().min(1).max(365).optional(),
});

router.get(
  '/mantenimientos',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const { estado, dias } = parseQuery(listQuery, req.query);
    const today = todayYmdEc();

    const conds = [eq(companyMaintenanceRecords.companyId, companyId)];

    if (estado === 'completado') {
      conds.push(eq(companyMaintenanceRecords.status, 'Completado'));
    } else if (estado === 'atrasado') {
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
      conds.push(eq(companyMaintenanceRecords.status, 'Programado'));
      conds.push(sql`DATE(${companyMaintenanceRecords.scheduledFor}) >= ${today}::date`);
    } else {
      conds.push(
        or(
          eq(companyMaintenanceRecords.status, 'Programado'),
          eq(companyMaintenanceRecords.status, 'Atrasado'),
        )!,
      );
    }

    if (dias) {
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

    res.json({
      total: mantenimientos.length,
      mantenimientos,
      resumenTexto: mantenimientos.length === 0
        ? 'No hay mantenimientos pendientes.'
        : `Hay ${mantenimientos.length} mantenimiento(s) pendiente(s). El más próximo es "${mantenimientos[0].titulo}" del ${mantenimientos[0].vehiculo} para el ${String(mantenimientos[0].fecha).slice(0, 10)}.`,
    });
  }),
);

// ── 2. POST /mantenimientos/create (existente) ────────────────────────
const createSchema = z.object({
  vehiculo: z.string().min(1),
  titulo: z.string().min(3).max(200),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoria: z.string().max(60).default('Otro'),
  notas: z.string().max(1000).optional(),
});

router.post(
  '/mantenimientos/create',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const body = parseBody(createSchema, req.body);
    const asset = await resolveAsset(companyId, body.vehiculo);

    const [created] = await db.insert(companyMaintenanceRecords).values({
      companyId,
      assetId: asset.id,
      title: body.titulo,
      category: body.categoria,
      type: 'Programado',
      status: 'Programado',
      scheduledFor: new Date(`${body.fecha}T08:00:00Z`),
      notes: body.notas ?? null,
      cadenceKind: 'none',
      totalCost: '0', laborCost: '0', ivaPercent: '15', carwashTotal: '0',
      isReprogrammed: false, reprogramCount: 0,
    }).returning();

    res.status(201).json({
      id: `maintenance-${created.id}`,
      titulo: created.title,
      categoria: created.category,
      vehiculo: asset.name,
      fecha: created.scheduledFor,
      estado: created.status,
      resumenTexto: `Mantenimiento "${created.title}" agendado para ${asset.name} el ${body.fecha}.`,
    });
  }),
);

// ── 3. GET /mantenimientos/atrasados ──────────────────────────────────
router.get(
  '/mantenimientos/atrasados',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const today = todayYmdEc();

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
      })
      .from(companyMaintenanceRecords)
      .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
      .where(and(
        eq(companyMaintenanceRecords.companyId, companyId),
        or(
          eq(companyMaintenanceRecords.status, 'Atrasado'),
          and(
            eq(companyMaintenanceRecords.status, 'Programado'),
            sql`DATE(${companyMaintenanceRecords.scheduledFor}) < ${today}::date`,
          ),
        )!,
      ))
      .orderBy(companyMaintenanceRecords.scheduledFor)
      .limit(100);

    const mantenimientos = rows.map((r) => ({
      id: `maintenance-${r.id}`,
      vehiculo: r.assetName ?? 'Sin vehículo',
      vehiculoPlaca: r.assetPlate ?? null,
      titulo: r.title ?? r.category,
      categoria: r.category,
      estado: r.status,
      fecha: r.scheduledFor,
      diasAtraso: Math.floor(
        (new Date(today).getTime() - new Date(String(r.scheduledFor).slice(0, 10)).getTime())
        / (1000 * 60 * 60 * 24),
      ),
    }));

    res.json({
      total: mantenimientos.length,
      mantenimientos,
      resumenTexto: mantenimientos.length === 0
        ? 'No hay mantenimientos atrasados.'
        : `Hay ${mantenimientos.length} mantenimiento(s) atrasado(s). El más atrasado es "${mantenimientos[0].titulo}" del ${mantenimientos[0].vehiculo} (${mantenimientos[0].diasAtraso} día(s) de atraso).`,
    });
  }),
);

// ── 4. GET /mantenimientos/proximos ───────────────────────────────────
const proximosQuery = z.object({
  dias: z.coerce.number().int().min(1).max(90).default(7),
});

router.get(
  '/mantenimientos/proximos',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const { dias } = parseQuery(proximosQuery, req.query);
    const today = todayYmdEc();

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
      })
      .from(companyMaintenanceRecords)
      .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
      .where(and(
        eq(companyMaintenanceRecords.companyId, companyId),
        eq(companyMaintenanceRecords.status, 'Programado'),
        sql`DATE(${companyMaintenanceRecords.scheduledFor}) BETWEEN ${today}::date AND (${today}::date + INTERVAL '${sql.raw(String(dias))} days')`,
      ))
      .orderBy(companyMaintenanceRecords.scheduledFor)
      .limit(100);

    const mantenimientos = rows.map((r) => ({
      id: `maintenance-${r.id}`,
      vehiculo: r.assetName ?? 'Sin vehículo',
      vehiculoPlaca: r.assetPlate ?? null,
      titulo: r.title ?? r.category,
      categoria: r.category,
      fecha: r.scheduledFor,
    }));

    res.json({
      total: mantenimientos.length,
      dias,
      mantenimientos,
      resumenTexto: mantenimientos.length === 0
        ? `No hay mantenimientos programados para los próximos ${dias} días.`
        : `Hay ${mantenimientos.length} mantenimiento(s) en los próximos ${dias} días. El primero: "${mantenimientos[0].titulo}" del ${mantenimientos[0].vehiculo} el ${String(mantenimientos[0].fecha).slice(0, 10)}.`,
    });
  }),
);

// ── 5. GET /mantenimientos/:id ────────────────────────────────────────
router.get(
  '/mantenimientos/:id',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'maintenance');

    const [m] = await db.select()
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.id, idNum),
        eq(companyMaintenanceRecords.companyId, companyId),
      ))
      .limit(1);
    if (!m) throw new NotFoundError('Mantenimiento', String(req.params.id));

    const [asset, items, events] = await Promise.all([
      m.assetId
        ? db.select({ name: companyAssets.name, plate: companyAssets.plate })
            .from(companyAssets)
            .where(eq(companyAssets.id, m.assetId))
            .limit(1)
        : Promise.resolve([]),
      db.select().from(companyMaintenanceItems)
        .where(eq(companyMaintenanceItems.maintenanceId, idNum))
        .limit(200),
      db.select().from(companyMaintenanceEvents)
        .where(eq(companyMaintenanceEvents.maintenanceId, idNum))
        .orderBy(desc(companyMaintenanceEvents.createdAt))
        .limit(20),
    ]);

    res.json({
      id: `maintenance-${m.id}`,
      vehiculo: asset[0]?.name ?? 'Sin vehículo',
      vehiculoPlaca: asset[0]?.plate ?? null,
      titulo: m.title,
      categoria: m.category,
      tipo: m.type,
      estado: m.status,
      fecha: m.scheduledFor,
      odometro: m.odometerKm,
      costoTotal: Number(m.totalCost),
      manoObra: Number(m.laborCost),
      ivaPorcentaje: Number(m.ivaPercent),
      notas: m.notes,
      items: items.map((it) => ({
        id: `maint-item-${it.id}`,
        nombre: it.name,
        cantidad: Number(it.quantity ?? 0),
        costoUnitario: Number(it.unitPrice ?? 0),
        subtotal: Number(it.subtotal ?? 0),
      })),
      eventos: events.map((e) => ({
        tipo: e.kind,
        fecha: e.createdAt,
        actorId: e.actorUserId,
        detalles: e.payload,
      })),
    });
  }),
);

// ── 6. POST /mantenimientos/:id/iniciar ───────────────────────────────
router.post(
  '/mantenimientos/:id/iniciar',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'maintenance');

    const [m] = await db.select()
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.id, idNum),
        eq(companyMaintenanceRecords.companyId, companyId),
      ))
      .limit(1);
    if (!m) throw new NotFoundError('Mantenimiento', String(req.params.id));
    if (m.status === 'Completado') throw new AppError(409, 'El mantenimiento ya está completado');
    if (m.status === 'Cancelado') throw new AppError(409, 'El mantenimiento está cancelado');

    const [updated] = await db.update(companyMaintenanceRecords)
      .set({ status: 'En curso', takenAt: new Date(), updatedAt: new Date() })
      .where(eq(companyMaintenanceRecords.id, idNum))
      .returning();

    // Side effect: el vehículo pasa a "En mantenimiento".
    if (m.assetId) {
      const [asset] = await db.select({ id: companyAssets.id, name: companyAssets.name, statusBeforeMaintenance: companyAssets.statusBeforeMaintenance })
        .from(companyAssets).where(eq(companyAssets.id, m.assetId)).limit(1);
      if (asset && asset.statusBeforeMaintenance == null) {
        await db.update(companyAssets)
          .set({
            status: 'En mantenimiento',
            statusBeforeMaintenance: 'Operativo',
            updatedAt: new Date(),
          })
          .where(eq(companyAssets.id, m.assetId));
      }
    }

    res.json({
      id: `maintenance-${updated!.id}`,
      titulo: updated!.title,
      estadoAnterior: m.status,
      estadoNuevo: updated!.status,
      vehiculoCambioEstado: true,
      resumenTexto: `Mantenimiento "${updated!.title}" iniciado. El vehículo ahora está "En mantenimiento".`,
    });
  }),
);

// ── 7. POST /mantenimientos/:id/finalizar ─────────────────────────────
const finalizarSchema = z.object({
  costoTotal: z.coerce.number().min(0).optional(),
  manoObra: z.coerce.number().min(0).optional(),
  ivaPorcentaje: z.coerce.number().min(0).max(100).optional(),
  notas: z.string().max(2000).optional(),
});

router.post(
  '/mantenimientos/:id/finalizar',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'maintenance');
    const body = parseBody(finalizarSchema, req.body ?? {});

    const [m] = await db.select()
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.id, idNum),
        eq(companyMaintenanceRecords.companyId, companyId),
      ))
      .limit(1);
    if (!m) throw new NotFoundError('Mantenimiento', String(req.params.id));
    if (m.status === 'Completado') throw new AppError(409, 'El mantenimiento ya está completado');
    if (m.status === 'Cancelado') throw new AppError(409, 'El mantenimiento está cancelado — no se puede finalizar');

    const updates: Record<string, unknown> = {
      status: 'Completado',
      completedAt: new Date(),
      executedAt: new Date(),
      updatedAt: new Date(),
    };
    if (body.costoTotal !== undefined) updates.totalCost = String(body.costoTotal);
    if (body.manoObra !== undefined) updates.laborCost = String(body.manoObra);
    if (body.ivaPorcentaje !== undefined) updates.ivaPercent = String(body.ivaPorcentaje);
    if (body.notas !== undefined) updates.notes = body.notas;

    const [updated] = await db.update(companyMaintenanceRecords)
      .set(updates)
      .where(eq(companyMaintenanceRecords.id, idNum))
      .returning();

    // Side effect: vehículo vuelve a su estado anterior (típicamente Operativo).
    if (m.assetId) {
      const [asset] = await db.select({ id: companyAssets.id, statusBeforeMaintenance: companyAssets.statusBeforeMaintenance })
        .from(companyAssets).where(eq(companyAssets.id, m.assetId)).limit(1);
      if (asset?.statusBeforeMaintenance) {
        await db.update(companyAssets)
          .set({
            status: asset.statusBeforeMaintenance,
            statusBeforeMaintenance: null,
            updatedAt: new Date(),
          })
          .where(eq(companyAssets.id, m.assetId));
      }
    }

    res.json({
      id: `maintenance-${updated!.id}`,
      titulo: updated!.title,
      estado: updated!.status,
      costoTotal: Number(updated!.totalCost),
      vehiculoVolvioOperativo: true,
      resumenTexto: `Mantenimiento "${updated!.title}" finalizado (costo $${Number(updated!.totalCost).toFixed(2)}). El vehículo volvió a su estado anterior.`,
    });
  }),
);

// ── 8. POST /mantenimientos/:id/cancelar ──────────────────────────────
const cancelarSchema = z.object({
  motivo: z.string().min(3).max(500),
});

router.post(
  '/mantenimientos/:id/cancelar',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'maintenance');
    const body = parseBody(cancelarSchema, req.body);

    const [m] = await db.select()
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.id, idNum),
        eq(companyMaintenanceRecords.companyId, companyId),
      ))
      .limit(1);
    if (!m) throw new NotFoundError('Mantenimiento', String(req.params.id));
    if (m.status === 'Completado') throw new AppError(409, 'No se puede cancelar un mantenimiento completado');
    if (m.status === 'Cancelado') throw new AppError(409, 'El mantenimiento ya está cancelado');

    const [updated] = await db.update(companyMaintenanceRecords)
      .set({
        status: 'Cancelado',
        reprogramReason: body.motivo,
        updatedAt: new Date(),
      })
      .where(eq(companyMaintenanceRecords.id, idNum))
      .returning();

    // Side effect: si el vehículo estaba "En mantenimiento" por este trabajo, vuelve a Operativo.
    if (m.assetId) {
      const [asset] = await db.select({ statusBeforeMaintenance: companyAssets.statusBeforeMaintenance })
        .from(companyAssets).where(eq(companyAssets.id, m.assetId)).limit(1);
      if (asset?.statusBeforeMaintenance) {
        await db.update(companyAssets)
          .set({ status: asset.statusBeforeMaintenance, statusBeforeMaintenance: null, updatedAt: new Date() })
          .where(eq(companyAssets.id, m.assetId));
      }
    }

    res.json({
      id: `maintenance-${updated!.id}`,
      titulo: updated!.title,
      estado: updated!.status,
      motivo: body.motivo,
      resumenTexto: `Mantenimiento "${updated!.title}" cancelado. Motivo: ${body.motivo}.`,
    });
  }),
);

// ── 9. POST /mantenimientos/:id/item (agregar repuesto) ───────────────
const itemSchema = z.object({
  nombre: z.string().min(2).max(200),
  cantidad: z.coerce.number().positive(),
  costoUnitario: z.coerce.number().min(0),
  proveedor: z.string().max(120).optional(),
  notas: z.string().max(500).optional(),
});

router.post(
  '/mantenimientos/:id/item',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'maintenance');
    const body = parseBody(itemSchema, req.body);

    const [m] = await db.select({ id: companyMaintenanceRecords.id, assetId: companyMaintenanceRecords.assetId })
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.id, idNum),
        eq(companyMaintenanceRecords.companyId, companyId),
      ))
      .limit(1);
    if (!m) throw new NotFoundError('Mantenimiento', String(req.params.id));
    if (m.status === 'Completado') throw new AppError(409, 'No se pueden agregar items a un mantenimiento completado');
    if (m.status === 'Cancelado') throw new AppError(409, 'No se pueden agregar items a un mantenimiento cancelado');

    const subtotal = body.cantidad * body.costoUnitario;
    const [created] = await db.insert(companyMaintenanceItems).values({
      maintenanceId: idNum,
      name: body.nombre,
      quantity: String(body.cantidad),
      unitCost: String(body.costoUnitario),
      subtotal: String(subtotal),
    }).returning();

    // Recalcular total del mantenimiento.
    const [agg] = await db.select({
      total: sql<string>`COALESCE(SUM(${companyMaintenanceItems.subtotal}), 0)::text`,
    })
      .from(companyMaintenanceItems)
      .where(eq(companyMaintenanceItems.maintenanceId, idNum));

    await db.update(companyMaintenanceRecords)
      .set({ totalCost: agg?.total ?? '0', updatedAt: new Date() })
      .where(eq(companyMaintenanceRecords.id, idNum));

    res.status(201).json({
      id: `maint-item-${created.id}`,
      nombre: created.name,
      cantidad: Number(created.quantity),
      costoUnitario: Number(created.unitCost),
      subtotal: Number(created.subtotal),
      mantenimientoTotalActualizado: Number(agg?.total ?? 0),
      resumenTexto: `Repuesto "${body.nombre}" agregado al mantenimiento (subtotal $${subtotal.toFixed(2)}). Total del mantenimiento: $${Number(agg?.total ?? 0).toFixed(2)}.`,
    });
  }),
);

// ── 10. POST /mantenimientos/:id/nota ─────────────────────────────────
const notaSchema = z.object({
  texto: z.string().min(3).max(2000),
});

router.post(
  '/mantenimientos/:id/nota',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'maintenance');
    const body = parseBody(notaSchema, req.body);

    const [m] = await db.select({ id: companyMaintenanceRecords.id, title: companyMaintenanceRecords.title })
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.id, idNum),
        eq(companyMaintenanceRecords.companyId, companyId),
      ))
      .limit(1);
    if (!m) throw new NotFoundError('Mantenimiento', String(req.params.id));

    await db.insert(companyMaintenanceEvents).values({
      companyId,
      maintenanceId: idNum,
      kind: 'note_added',
      actorName: 'AI Assistant',
      payload: { text: body.texto },
    });

    // Si el mantenimiento ya tiene notas previas, las concatenamos; si no, este es el primer texto.
    const [updated] = await db.update(companyMaintenanceRecords)
      .set({
        notes: m.title && body.texto
          ? `${body.texto}\n\n— AI Assistant, ${new Date().toISOString().slice(0, 16)}`
          : body.texto,
        updatedAt: new Date(),
      })
      .where(eq(companyMaintenanceRecords.id, idNum))
      .returning({ id: companyMaintenanceRecords.id });

    res.status(201).json({
      id: `maintenance-${idNum}`,
      mantenimiento: m.title,
      texto: body.texto,
      resumenTexto: `Nota agregada al mantenimiento "${m.title}".`,
    });
  }),
);

export default router;
