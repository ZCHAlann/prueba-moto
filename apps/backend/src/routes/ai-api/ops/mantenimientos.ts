// routes/ai-api/ops/mantenimientos.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Operaciones de mantenimientos para el router.
// ─────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { and, desc, eq, gte, lte, or, sql, count } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyMaintenanceRecords, companyMaintenanceEvents,
  companyMaintenanceItems, companyAssets,
} from '../../../db/schema/operational';
import { registerOperation, type OperationHandler } from '../router';
import { resolveAsset, todayYmdEc, parseEntityId } from '../shared';
import { AppError, NotFoundError } from '../../../lib/errors';

// ── LISTA ────────────────────────────────────────────────────────────
const listFiltros = z.object({
  estado: z.enum(['pendiente', 'atrasado', 'completado']).optional(),
  dias: z.coerce.number().int().min(1).max(365).optional(),
});

const lista: OperationHandler = async (ctx, input) => {
  const filtros = listFiltros.parse(input);
  const today = todayYmdEc();
  const conds = [eq(companyMaintenanceRecords.companyId, ctx.companyId)];

  if (filtros.estado === 'completado') {
    conds.push(eq(companyMaintenanceRecords.status, 'Completado'));
  } else if (filtros.estado === 'atrasado') {
    conds.push(
      or(
        eq(companyMaintenanceRecords.status, 'Atrasado'),
        and(
          eq(companyMaintenanceRecords.status, 'Programado'),
          sql`DATE(${companyMaintenanceRecords.scheduledFor}) < ${today}::date`,
        ),
      )!,
    );
  } else if (filtros.estado === 'pendiente') {
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

  if (filtros.dias) {
    conds.push(
      sql`DATE(${companyMaintenanceRecords.scheduledFor}) BETWEEN ${today}::date AND (${today}::date + INTERVAL '${sql.raw(String(filtros.dias))} days')`,
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
      totalCost: companyMaintenanceRecords.totalCost,
      laborCost: companyMaintenanceRecords.laborCost,
      ivaPercent: companyMaintenanceRecords.ivaPercent,
      odometerKm: companyMaintenanceRecords.odometerKm,
      notes: companyMaintenanceRecords.notes,
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
    costoTotal: Number(r.totalCost ?? 0),
    manoObra: Number(r.laborCost ?? 0),
    ivaPorcentaje: Number(r.ivaPercent ?? 0),
    odometro: r.odometerKm ?? null,
    notas: r.notes ?? null,
  }));

  return {
    total: mantenimientos.length,
    mantenimientos,
    resumenTexto: mantenimientos.length === 0
      ? 'No hay mantenimientos pendientes.'
      : `Hay ${mantenimientos.length} mantenimiento(s) pendiente(s). El más próximo es "${mantenimientos[0].titulo}" del ${mantenimientos[0].vehiculo} para el ${String(mantenimientos[0].fecha).slice(0, 10)}.`,
  };
};

// ─- DETALLE ──────────────────────────────────────────────────────────
const detalleInput = z.object({
  id: z.union([z.string(), z.number()]),
});

const detalle: OperationHandler = async (ctx, input) => {
  const body = detalleInput.parse(input);
  const idNum = parseEntityId(body.id, 'maintenance');

  const [m] = await db.select().from(companyMaintenanceRecords)
    .where(and(eq(companyMaintenanceRecords.id, idNum), eq(companyMaintenanceRecords.companyId, ctx.companyId)))
    .limit(1);
  if (!m) throw new NotFoundError('Mantenimiento', String(body.id));

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

  return {
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
      costoUnitario: Number(it.unitCost ?? 0),
      subtotal: Number(it.subtotal ?? 0),
    })),
    eventos: events.map((e) => ({
      tipo: e.kind,
      fecha: e.createdAt,
      actorId: e.actorUserId,
      detalles: e.payload,
    })),
  };
};

// ─- ATRASADOS ────────────────────────────────────────────────────────
const atrasados: OperationHandler = async (ctx) => {
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
      totalCost: companyMaintenanceRecords.totalCost,
      laborCost: companyMaintenanceRecords.laborCost,
      ivaPercent: companyMaintenanceRecords.ivaPercent,
      odometerKm: companyMaintenanceRecords.odometerKm,
      notes: companyMaintenanceRecords.notes,
    })
    .from(companyMaintenanceRecords)
    .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
    .where(and(
      eq(companyMaintenanceRecords.companyId, ctx.companyId),
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
    costoTotal: Number(r.totalCost ?? 0),
    manoObra: Number(r.laborCost ?? 0),
    ivaPorcentaje: Number(r.ivaPercent ?? 0),
    odometro: r.odometerKm ?? null,
    notas: r.notes ?? null,
    diasAtraso: Math.floor(
      (new Date(today).getTime() - new Date(String(r.scheduledFor).slice(0, 10)).getTime())
      / (1000 * 60 * 60 * 24),
    ),
  }));

  return {
    total: mantenimientos.length,
    mantenimientos,
    resumenTexto: mantenimientos.length === 0
      ? 'No hay mantenimientos atrasados.'
      : `Hay ${mantenimientos.length} mantenimiento(s) atrasado(s). El más atrasado es "${mantenimientos[0].titulo}" del ${mantenimientos[0].vehiculo} (${mantenimientos[0].diasAtraso} día(s) de atraso).`,
  };
};

// ─- PRÓXIMOS ─────────────────────────────────────────────────────────
const proximosInput = z.object({
  dias: z.coerce.number().int().min(1).max(90).default(7),
});

const proximos: OperationHandler = async (ctx, input) => {
  const body = proximosInput.parse(input);
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
      totalCost: companyMaintenanceRecords.totalCost,
      laborCost: companyMaintenanceRecords.laborCost,
      ivaPercent: companyMaintenanceRecords.ivaPercent,
      odometerKm: companyMaintenanceRecords.odometerKm,
      notes: companyMaintenanceRecords.notes,
    })
    .from(companyMaintenanceRecords)
    .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
    .where(and(
      eq(companyMaintenanceRecords.companyId, ctx.companyId),
      eq(companyMaintenanceRecords.status, 'Programado'),
      sql`DATE(${companyMaintenanceRecords.scheduledFor}) BETWEEN ${today}::date AND (${today}::date + INTERVAL '${sql.raw(String(body.dias))} days')`,
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
    costoTotal: Number(r.totalCost ?? 0),
    manoObra: Number(r.laborCost ?? 0),
    ivaPorcentaje: Number(r.ivaPercent ?? 0),
    odometro: r.odometerKm ?? null,
    notas: r.notes ?? null,
  }));

  return {
    total: mantenimientos.length,
    dias: body.dias,
    mantenimientos,
    resumenTexto: mantenimientos.length === 0
      ? `No hay mantenimientos programados para los próximos ${body.dias} días.`
      : `Hay ${mantenimientos.length} mantenimiento(s) en los próximos ${body.dias} días. El primero: "${mantenimientos[0].titulo}" del ${mantenimientos[0].vehiculo} el ${String(mantenimientos[0].fecha).slice(0, 10)}.`,
  };
};

// ─- CREAR ─────────────────────────────────────────────────────────────
const crearInput = z.object({
  vehiculo: z.string().min(1),
  titulo: z.string().min(3).max(200),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoria: z.string().max(60).default('Otro'),
  notas: z.string().max(1000).optional(),
});

const crear: OperationHandler = async (ctx, input) => {
  const body = crearInput.parse(input);
  const asset = await resolveAsset(ctx.companyId, body.vehiculo);

  const [created] = await db.insert(companyMaintenanceRecords).values({
    companyId: ctx.companyId,
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

  return {
    id: `maintenance-${created.id}`,
    titulo: created.title,
    categoria: created.category,
    vehiculo: asset.name,
    fecha: created.scheduledFor,
    estado: created.status,
    resumenTexto: `Mantenimiento "${created.title}" agendado para ${asset.name} el ${body.fecha}.`,
  };
};

// ─- INICIAR ───────────────────────────────────────────────────────────
const iniciarInput = z.object({
  id: z.union([z.string(), z.number()]),
});

const iniciar: OperationHandler = async (ctx, input) => {
  const body = iniciarInput.parse(input);
  const idNum = parseEntityId(body.id, 'maintenance');

  const [m] = await db.select().from(companyMaintenanceRecords)
    .where(and(eq(companyMaintenanceRecords.id, idNum), eq(companyMaintenanceRecords.companyId, ctx.companyId)))
    .limit(1);
  if (!m) throw new NotFoundError('Mantenimiento', String(body.id));
  if (m.status === 'Completado') throw new AppError(409, 'El mantenimiento ya está completado');
  if (m.status === 'Cancelado') throw new AppError(409, 'El mantenimiento está cancelado');

  const [updated] = await db.update(companyMaintenanceRecords)
    .set({ status: 'En curso', takenAt: new Date(), updatedAt: new Date() })
    .where(eq(companyMaintenanceRecords.id, idNum))
    .returning();

  if (m.assetId) {
    const [asset] = await db.select({ statusBeforeMaintenance: companyAssets.statusBeforeMaintenance })
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

  return {
    id: `maintenance-${updated!.id}`,
    titulo: updated!.title,
    estadoAnterior: m.status,
    estadoNuevo: updated!.status,
    vehiculoCambioEstado: true,
    resumenTexto: `Mantenimiento "${updated!.title}" iniciado. El vehículo ahora está "En mantenimiento".`,
  };
};

// ─- FINALIZAR ─────────────────────────────────────────────────────────
const finalizarInput = z.object({
  id: z.union([z.string(), z.number()]),
  costoTotal: z.coerce.number().min(0).optional(),
  manoObra: z.coerce.number().min(0).optional(),
  ivaPorcentaje: z.coerce.number().min(0).max(100).optional(),
  notas: z.string().max(2000).optional(),
});

const finalizar: OperationHandler = async (ctx, input) => {
  const body = finalizarInput.parse(input);
  const idNum = parseEntityId(body.id, 'maintenance');

  const [m] = await db.select().from(companyMaintenanceRecords)
    .where(and(eq(companyMaintenanceRecords.id, idNum), eq(companyMaintenanceRecords.companyId, ctx.companyId)))
    .limit(1);
  if (!m) throw new NotFoundError('Mantenimiento', String(body.id));
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

  if (m.assetId) {
    const [asset] = await db.select({ statusBeforeMaintenance: companyAssets.statusBeforeMaintenance })
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

  return {
    id: `maintenance-${updated!.id}`,
    titulo: updated!.title,
    estado: updated!.status,
    costoTotal: Number(updated!.totalCost),
    vehiculoVolvioOperativo: true,
    resumenTexto: `Mantenimiento "${updated!.title}" finalizado (costo $${Number(updated!.totalCost).toFixed(2)}). El vehículo volvió a su estado anterior.`,
  };
};

// ─- CANCELAR ──────────────────────────────────────────────────────────
const cancelarInput = z.object({
  id: z.union([z.string(), z.number()]),
  motivo: z.string().min(3).max(500),
});

const cancelar: OperationHandler = async (ctx, input) => {
  const body = cancelarInput.parse(input);
  const idNum = parseEntityId(body.id, 'maintenance');

  const [m] = await db.select().from(companyMaintenanceRecords)
    .where(and(eq(companyMaintenanceRecords.id, idNum), eq(companyMaintenanceRecords.companyId, ctx.companyId)))
    .limit(1);
  if (!m) throw new NotFoundError('Mantenimiento', String(body.id));
  if (m.status === 'Completado') throw new AppError(409, 'No se puede cancelar un mantenimiento completado');
  if (m.status === 'Cancelado') throw new AppError(409, 'El mantenimiento ya está cancelado');

  const [updated] = await db.update(companyMaintenanceRecords)
    .set({ status: 'Cancelado', reprogramReason: body.motivo, updatedAt: new Date() })
    .where(eq(companyMaintenanceRecords.id, idNum))
    .returning();

  if (m.assetId) {
    const [asset] = await db.select({ statusBeforeMaintenance: companyAssets.statusBeforeMaintenance })
      .from(companyAssets).where(eq(companyAssets.id, m.assetId)).limit(1);
    if (asset?.statusBeforeMaintenance) {
      await db.update(companyAssets)
        .set({ status: asset.statusBeforeMaintenance, statusBeforeMaintenance: null, updatedAt: new Date() })
        .where(eq(companyAssets.id, m.assetId));
    }
  }

  return {
    id: `maintenance-${updated!.id}`,
    titulo: updated!.title,
    estado: updated!.status,
    motivo: body.motivo,
    resumenTexto: `Mantenimiento "${updated!.title}" cancelado. Motivo: ${body.motivo}.`,
  };
};

// ─- ITEM (repuesto) ───────────────────────────────────────────────────
const itemInput = z.object({
  id: z.union([z.string(), z.number()]),
  nombre: z.string().min(2).max(200),
  cantidad: z.coerce.number().positive(),
  costoUnitario: z.coerce.number().min(0),
  proveedor: z.string().max(120).optional(),
  notas: z.string().max(500).optional(),
});

const item: OperationHandler = async (ctx, input) => {
  const body = itemInput.parse(input);
  const idNum = parseEntityId(body.id, 'maintenance');

  const [m] = await db.select({ id: companyMaintenanceRecords.id, assetId: companyMaintenanceRecords.assetId })
    .from(companyMaintenanceRecords)
    .where(and(eq(companyMaintenanceRecords.id, idNum), eq(companyMaintenanceRecords.companyId, ctx.companyId)))
    .limit(1);
  if (!m) throw new NotFoundError('Mantenimiento', String(body.id));
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

  const [agg] = await db.select({
    total: sql<string>`COALESCE(SUM(${companyMaintenanceItems.subtotal}), 0)::text`,
  })
    .from(companyMaintenanceItems)
    .where(eq(companyMaintenanceItems.maintenanceId, idNum));

  await db.update(companyMaintenanceRecords)
    .set({ totalCost: agg?.total ?? '0', updatedAt: new Date() })
    .where(eq(companyMaintenanceRecords.id, idNum));

  return {
    id: `maint-item-${created.id}`,
    nombre: created.name,
    cantidad: Number(created.quantity),
    costoUnitario: Number(created.unitCost),
    subtotal: Number(created.subtotal),
    mantenimientoTotalActualizado: Number(agg?.total ?? 0),
    resumenTexto: `Repuesto "${body.nombre}" agregado al mantenimiento (subtotal $${subtotal.toFixed(2)}). Total del mantenimiento: $${Number(agg?.total ?? 0).toFixed(2)}.`,
  };
};

// ─- NOTA ──────────────────────────────────────────────────────────────
const notaInput = z.object({
  id: z.union([z.string(), z.number()]),
  texto: z.string().min(3).max(2000),
});

const nota: OperationHandler = async (ctx, input) => {
  const body = notaInput.parse(input);
  const idNum = parseEntityId(body.id, 'maintenance');

  const [m] = await db.select({ id: companyMaintenanceRecords.id, title: companyMaintenanceRecords.title })
    .from(companyMaintenanceRecords)
    .where(and(eq(companyMaintenanceRecords.id, idNum), eq(companyMaintenanceRecords.companyId, ctx.companyId)))
    .limit(1);
  if (!m) throw new NotFoundError('Mantenimiento', String(body.id));

  await db.insert(companyMaintenanceEvents).values({
    companyId: ctx.companyId,
    maintenanceId: idNum,
    kind: 'note_added',
    actorName: 'AI Assistant',
    payload: { text: body.texto },
  });

  await db.update(companyMaintenanceRecords)
    .set({
      notes: body.texto,
      updatedAt: new Date(),
    })
    .where(eq(companyMaintenanceRecords.id, idNum));

  return {
    id: `maintenance-${idNum}`,
    mantenimiento: m.title,
    texto: body.texto,
    resumenTexto: `Nota agregada al mantenimiento "${m.title}".`,
  };
};

// ─- EDITAR (PATCH generico) ──────────────────────────────────────────
// jul 2026 — Permite editar cualquier subset de campos editables del
// mantenimiento. El frontend manda solo los campos que quiere cambiar.
//
// Campos editables:
//   - title          (string, max 200)
//   - description    (string)
//   - category       (string, max 60)
//   - odometerKm     (number)
//   - scheduledFor   (ISO 8601 string: "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm:ssZ")
//                    — soporta fecha CON hora, no solo YYYY-MM-DD.
//   - notes          (string)
//   - carwashLocation, carwashProvider, carwashNotes, carwashTotal (lavada)
const editarInput = z.object({
  id: z.union([z.string(), z.number()]),
  title:           z.string().min(1).max(200).optional(),
  description:     z.string().max(2000).optional(),
  category:        z.string().max(60).optional(),
  odometerKm:      z.coerce.number().int().min(0).optional(),
  // scheduledFor acepta fecha sola o fecha+hora. Si trae T, se respeta
  // la hora exacta. Si es solo YYYY-MM-DD, se interpreta como mediodia
  // UTC para evitar que se corra a otro dia por zona horaria.
  scheduledFor:    z.string().min(10).max(40).optional(),
  notes:           z.string().max(2000).optional(),
  carwashLocation: z.string().max(200).optional(),
  carwashProvider: z.string().max(200).optional(),
  carwashNotes:    z.string().max(1000).optional(),
  carwashTotal:    z.coerce.number().min(0).optional(),
}).refine((d) => d.id !== undefined, { message: 'Falta "id"' })
  .refine((d) => {
    // Al menos un campo ademas del id.
    const { id, ...rest } = d;
    return Object.keys(rest).length > 0;
  }, { message: 'Debe incluir al menos un campo a editar (title, scheduledFor, notes, etc.)' });

const editar: OperationHandler = async (ctx, input) => {
  const body = editarInput.parse(input);
  const idNum = parseEntityId(body.id, 'maintenance');

  // Verificar que el mantenimiento existe y pertenece a la empresa.
  const [existing] = await db.select({
    id: companyMaintenanceRecords.id,
    companyId: companyMaintenanceRecords.companyId,
    status: companyMaintenanceRecords.status,
    title: companyMaintenanceRecords.title,
    scheduledFor: companyMaintenanceRecords.scheduledFor,
  })
    .from(companyMaintenanceRecords)
    .where(and(
      eq(companyMaintenanceRecords.id, idNum),
      eq(companyMaintenanceRecords.companyId, ctx.companyId),
    ))
    .limit(1);
  if (!existing) throw new NotFoundError('Mantenimiento', String(body.id));

  // No se puede editar algo cancelado o completado.
  if (existing.status === 'Cancelado') {
    throw new AppError(409, 'No se puede editar un mantenimiento cancelado');
  }
  if (existing.status === 'Completado') {
    throw new AppError(409, 'No se puede editar un mantenimiento completado. Si necesitas corregir, cancelalo y crea uno nuevo.');
  }

  // Construir el objeto de update solo con los campos provistos.
  const updates: any = { updatedAt: new Date() };
  const cambios: string[] = [];

  if (body.title          !== undefined) { updates.title = body.title;          cambios.push('título'); }
  if (body.description    !== undefined) { updates.description = body.description; cambios.push('descripción'); }
  if (body.category       !== undefined) { updates.category = body.category;      cambios.push('categoría'); }
  if (body.odometerKm     !== undefined) { updates.odometerKm = body.odometerKm;  cambios.push('odómetro'); }
  if (body.notes          !== undefined) { updates.notes = body.notes;            cambios.push('notas'); }
  if (body.carwashLocation!== undefined) { updates.carwashLocation = body.carwashLocation; cambios.push('lugar de lavada'); }
  if (body.carwashProvider!== undefined) { updates.carwashProvider = body.carwashProvider; cambios.push('proveedor de lavada'); }
  if (body.carwashNotes   !== undefined) { updates.carwashNotes = body.carwashNotes; cambios.push('notas de lavada'); }
  if (body.carwashTotal   !== undefined) { updates.carwashTotal = String(body.carwashTotal); cambios.push('costo de lavada'); }

  if (body.scheduledFor !== undefined) {
    // Parsear fecha con o sin hora. Si es YYYY-MM-DD puro, usamos
    // mediodia UTC para evitar corrimientos por zona horaria.
    const s = body.scheduledFor;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      updates.scheduledFor = new Date(`${s}T12:00:00.000Z`);
    } else {
      const d = new Date(s);
      if (isNaN(d.getTime())) {
        throw new AppError(400, `scheduledFor inválido: "${s}" (usar YYYY-MM-DD o YYYY-MM-DDTHH:mm:ssZ)`);
      }
      updates.scheduledFor = d;
    }
    cambios.push('fecha programada');
  }

  await db.update(companyMaintenanceRecords)
    .set(updates)
    .where(eq(companyMaintenanceRecords.id, idNum));

  // Registrar evento en el timeline (auditoría).
  await db.insert(companyMaintenanceEvents).values({
    companyId: ctx.companyId,
    maintenanceId: idNum,
    kind: 'edited',
    actorName: 'AI Assistant',
    payload: { changes: cambios, editedFields: Object.keys(updates).filter(k => k !== 'updatedAt') },
  });

  return {
    id: `maintenance-${idNum}`,
    cambiosRealizados: cambios,
    resumenTexto: `Mantenimiento "${existing.title}" actualizado. Campos cambiados: ${cambios.join(', ')}.`,
  };
};

// ── REGISTRO ──────────────────────────────────────────────────────────
export function registerMantenimientosOps() {
  registerOperation({ modulo: 'mantenimientos', operacion: 'lista', scope: 'read',
    summary: 'Lista de mantenimientos (pendientes o atrasados por defecto)',
    inputSchema: listFiltros, handler: lista });
  registerOperation({ modulo: 'mantenimientos', operacion: 'detalle', scope: 'read',
    summary: 'Detalle completo de un mantenimiento con items y eventos',
    inputSchema: detalleInput, handler: detalle });
  registerOperation({ modulo: 'mantenimientos', operacion: 'atrasados', scope: 'read',
    summary: 'Solo mantenimientos atrasados (con dias de atraso)',
    inputSchema: z.object({}), handler: atrasados });
  registerOperation({ modulo: 'mantenimientos', operacion: 'proximos', scope: 'read',
    summary: 'Mantenimientos programados en los proximos N dias (default 7)',
    inputSchema: proximosInput, handler: proximos });
  registerOperation({ modulo: 'mantenimientos', operacion: 'crear', scope: 'write',
    summary: 'Agenda un mantenimiento',
    inputSchema: crearInput, handler: crear });
  registerOperation({ modulo: 'mantenimientos', operacion: 'editar', scope: 'write',
    summary: 'Edita campos de un mantenimiento existente (fecha con hora, titulo, notas, etc.)',
    inputSchema: editarInput, handler: editar });
  registerOperation({ modulo: 'mantenimientos', operacion: 'iniciar', scope: 'write',
    summary: 'Inicia un mantenimiento (cambia status a En curso, vehiculo pasa a En mantenimiento)',
    inputSchema: iniciarInput, handler: iniciar });
  registerOperation({ modulo: 'mantenimientos', operacion: 'finalizar', scope: 'write',
    summary: 'Finaliza un mantenimiento (cambia status a Completado, vehiculo vuelve a su estado anterior)',
    inputSchema: finalizarInput, handler: finalizar });
  registerOperation({ modulo: 'mantenimientos', operacion: 'cancelar', scope: 'write',
    summary: 'Cancela un mantenimiento con motivo (libera el vehiculo)',
    inputSchema: cancelarInput, handler: cancelar });
  registerOperation({ modulo: 'mantenimientos', operacion: 'item', scope: 'write',
    summary: 'Agrega un repuesto al mantenimiento (recalcula el total)',
    inputSchema: itemInput, handler: item });
  registerOperation({ modulo: 'mantenimientos', operacion: 'nota', scope: 'write',
    summary: 'Agrega una nota al mantenimiento',
    inputSchema: notaInput, handler: nota });
}
