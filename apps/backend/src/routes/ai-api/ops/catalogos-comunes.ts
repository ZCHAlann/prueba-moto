// routes/ai-api/ops/catalogos-comunes.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Operaciones de combustible, peajes, seguros, talleres,
// proveedores y sites. Van juntos porque son catálogos con CRUD simple.
// ─────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { and, desc, eq, gte, lte, sql, count, ilike, or, inArray } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyAssets, companyFuelEntries, companyTollEntries,
  companyInsurancePolicies, companyWorkshops, companySuppliers, companySites,
  companyStatsAnomalies, companyDrivers,
} from '../../../db/schema/operational';
import { registerOperation, type OperationHandler } from '../router';
import { resolveAsset, todayYmdEc } from '../shared';
import { AppError, NotFoundError } from '../../../lib/errors';

// ─────────────────────────────────────────────────────────────────────
//  COMBUSTIBLE
// ─────────────────────────────────────────────────────────────────────

const combustibleListFiltros = z.object({
  vehiculo: z.string().optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const combustibleLista: OperationHandler = async (ctx, input) => {
  const filtros = combustibleListFiltros.parse(input);
  const conds = [eq(companyFuelEntries.companyId, ctx.companyId)];
  if (filtros.vehiculo) {
    const a = await resolveAsset(ctx.companyId, filtros.vehiculo);
    conds.push(eq(companyFuelEntries.assetId, a.id));
  }
  if (filtros.desde) conds.push(gte(companyFuelEntries.date, filtros.desde));
  if (filtros.hasta) conds.push(lte(companyFuelEntries.date, filtros.hasta));

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
    .limit(filtros.limit);

  return {
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
  };
};

const combustibleResumen: OperationHandler = async (ctx) => {
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
        eq(companyFuelEntries.companyId, ctx.companyId),
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
        eq(companyFuelEntries.companyId, ctx.companyId),
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
      .where(eq(companyFuelEntries.companyId, ctx.companyId))
      .orderBy(desc(companyFuelEntries.date))
      .limit(5),
  ]);

  const m = mes[0] ?? { totalCost: '0', totalGallons: '0', entries: 0 };
  const totalCost = Number(m.totalCost);
  const totalGallons = Number(m.totalGallons);
  const promedio = top.length > 0 ? totalCost / top.length : 0;

  return {
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
  };
};

const combustibleRegistrarInput = z.object({
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

const combustibleRegistrar: OperationHandler = async (ctx, input) => {
  const body = combustibleRegistrarInput.parse(input);
  const asset = await resolveAsset(ctx.companyId, body.vehiculo);

  let gallons = body.galones;
  let liters = body.litros;
  if (gallons != null && liters == null) liters = gallons * 3.78541;
  if (liters != null && gallons == null) gallons = liters / 3.78541;
  if (gallons == null) throw new AppError(400, 'Debe especificar galones o litros');

  const [created] = await db.insert(companyFuelEntries).values({
    companyId: ctx.companyId,
    assetId: asset.id,
    date: body.fecha ?? todayYmdEc(),
    gallons: String(gallons),
    liters: String(liters ?? 0),
    cost: String(body.costo),
    odometer: body.odometro != null ? String(body.odometro) : null,
    station: body.estacion ?? null,
    fuelType: body.tipoCombustible ?? null,
  }).returning();

  return {
    id: `fuel-${created.id}`,
    vehiculo: asset.name,
    fecha: created.date,
    galones: Number(created.gallons),
    litros: Number(created.liters),
    costo: Number(created.cost),
    odometro: created.odometer ? Number(created.odometer) : null,
    resumenTexto: `Carga de combustible registrada para ${asset.name}: ${Number(created.gallons).toFixed(2)} galones por $${Number(created.cost).toFixed(2)}.`,
  };
};

const combustibleAnomalias: OperationHandler = async (ctx) => {
  const rows = await db.select()
    .from(companyStatsAnomalies)
    .where(and(
      eq(companyStatsAnomalies.companyId, ctx.companyId),
      eq(companyStatsAnomalies.modulo, 'combustible'),
    ))
    .orderBy(desc(companyStatsAnomalies.detectadoEn))
    .limit(50);

  return {
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
  };
};

// ─────────────────────────────────────────────────────────────────────
//  PEAJES
// ─────────────────────────────────────────────────────────────────────

const peajesListFiltros = z.object({
  vehiculo: z.string().optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const peajesLista: OperationHandler = async (ctx, input) => {
  const filtros = peajesListFiltros.parse(input);
  const conds = [eq(companyTollEntries.companyId, ctx.companyId)];
  if (filtros.vehiculo) {
    const a = await resolveAsset(ctx.companyId, filtros.vehiculo);
    conds.push(eq(companyTollEntries.assetId, a.id));
  }
  if (filtros.desde) conds.push(gte(companyTollEntries.date, filtros.desde));
  if (filtros.hasta) conds.push(lte(companyTollEntries.date, filtros.hasta));

  const rows = await db
    .select({
      id: companyTollEntries.id,
      date: companyTollEntries.date,
      assetId: companyTollEntries.assetId,
      assetName: companyAssets.name,
      assetPlate: companyAssets.plate,
      tollName: companyTollEntries.tollName,
      amount: companyTollEntries.amount,
      category: companyTollEntries.category,
      route: companyTollEntries.route,
    })
    .from(companyTollEntries)
    .leftJoin(companyAssets, eq(companyAssets.id, companyTollEntries.assetId))
    .where(and(...conds))
    .orderBy(desc(companyTollEntries.date))
    .limit(filtros.limit);

  return {
    total: rows.length,
    peajes: rows.map((r) => ({
      id: `toll-${r.id}`,
      fecha: r.date,
      vehiculo: r.assetName,
      vehiculoPlaca: r.assetPlate,
      nombre: r.tollName,
      categoria: r.category,
      ruta: r.route,
      monto: Number(r.amount),
    })),
  };
};

const peajesResumen: OperationHandler = async (ctx) => {
  const today = todayYmdEc();
  const monthStart = today.slice(0, 8) + '01';

  const [mes, top] = await Promise.all([
    db.select({
      totalAmount: sql<string>`COALESCE(SUM(${companyTollEntries.amount}), 0)::text`,
      count: count(),
    })
      .from(companyTollEntries)
      .where(and(
        eq(companyTollEntries.companyId, ctx.companyId),
        gte(companyTollEntries.date, monthStart),
        lte(companyTollEntries.date, today),
      )),
    db.select({
      assetId: companyTollEntries.assetId,
      assetName: companyAssets.name,
      totalAmount: sql<string>`SUM(${companyTollEntries.amount})::text`,
      count: count(),
    })
      .from(companyTollEntries)
      .leftJoin(companyAssets, eq(companyAssets.id, companyTollEntries.assetId))
      .where(and(
        eq(companyTollEntries.companyId, ctx.companyId),
        gte(companyTollEntries.date, monthStart),
        lte(companyTollEntries.date, today),
      ))
      .groupBy(companyTollEntries.assetId, companyAssets.name)
      .orderBy(sql`SUM(${companyTollEntries.amount}) DESC`)
      .limit(5),
  ]);

  const m = mes[0] ?? { totalAmount: '0', count: 0 };
  const total = Number(m.totalAmount);

  return {
    periodo: { desde: monthStart, hasta: today },
    totalMonto: total,
    totalCruzamientos: m.count,
    topVehiculos: top.map((v) => ({
      id: `vehicle-${v.assetId}`,
      nombre: v.assetName,
      montoTotal: Number(v.totalAmount),
      cruzamientos: v.count,
    })),
    resumenTexto: `Peajes del mes: $${total.toFixed(2)} en ${m.count} cruce(s).`,
  };
};

const peajesRegistrarInput = z.object({
  vehiculo: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nombre: z.string().min(2).max(200),
  monto: z.coerce.number().min(0),
  categoria: z.string().max(40).optional(),
  ruta: z.string().max(200).optional(),
  ejes: z.coerce.number().int().min(0).optional(),
  numeroFactura: z.string().max(60).optional(),
});

const peajesRegistrar: OperationHandler = async (ctx, input) => {
  const body = peajesRegistrarInput.parse(input);
  const asset = await resolveAsset(ctx.companyId, body.vehiculo);

  const [created] = await db.insert(companyTollEntries).values({
    companyId: ctx.companyId,
    assetId: asset.id,
    date: body.fecha ?? todayYmdEc(),
    tollName: body.nombre,
    amount: String(body.monto),
    category: body.categoria ?? null,
    route: body.ruta ?? null,
    axes: body.ejes ?? null,
    invoiceNumber: body.numeroFactura ?? null,
  }).returning();

  return {
    id: `toll-${created.id}`,
    vehiculo: asset.name,
    fecha: created.date,
    nombre: created.tollName,
    monto: Number(created.amount),
    resumenTexto: `Peaje "${created.tollName}" registrado para ${asset.name}: $${Number(created.amount).toFixed(2)}.`,
  };
};

// ─────────────────────────────────────────────────────────────────────
//  SEGUROS
// ─────────────────────────────────────────────────────────────────────

const segurosListFiltros = z.object({
  vehiculo: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const segurosLista: OperationHandler = async (ctx, input) => {
  const filtros = segurosListFiltros.parse(input);
  const conds = [eq(companyInsurancePolicies.companyId, ctx.companyId)];
  if (filtros.vehiculo) {
    const a = await resolveAsset(ctx.companyId, filtros.vehiculo);
    conds.push(eq(companyInsurancePolicies.assetId, a.id));
  }
  const rows = await db
    .select({
      id: companyInsurancePolicies.id,
      assetId: companyInsurancePolicies.assetId,
      assetName: companyAssets.name,
      insurer: companyInsurancePolicies.insurer,
      policyNumber: companyInsurancePolicies.policyNumber,
      coverage: companyInsurancePolicies.coverage,
      startDate: companyInsurancePolicies.startDate,
      endDate: companyInsurancePolicies.endDate,
      status: companyInsurancePolicies.status,
    })
    .from(companyInsurancePolicies)
    .leftJoin(companyAssets, eq(companyAssets.id, companyInsurancePolicies.assetId))
    .where(and(...conds))
    .orderBy(desc(companyInsurancePolicies.endDate))
    .limit(filtros.limit);

  return {
    total: rows.length,
    polizas: rows.map((r) => ({
      id: `insurance-${r.id}`,
      vehiculo: r.assetName,
      aseguradora: r.insurer,
      numero: r.policyNumber,
      cobertura: r.coverage,
      fechaInicio: r.startDate,
      fechaVencimiento: r.endDate,
      estado: r.status,
    })),
  };
};

const segurosPorVencer: OperationHandler = async (ctx) => {
  const today = todayYmdEc();
  const [yStr, mStr] = today.split('-');
  const limit = new Date(Number(yStr), Number(mStr) + 2, 0);
  // jul 2026 v7 — companyInsurancePolicies.endDate es `date` → string YYYY-MM-DD.
  const limitDate = limit.toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: companyInsurancePolicies.id,
      assetId: companyInsurancePolicies.assetId,
      assetName: companyAssets.name,
      insurer: companyInsurancePolicies.insurer,
      policyNumber: companyInsurancePolicies.policyNumber,
      endDate: companyInsurancePolicies.endDate,
    })
    .from(companyInsurancePolicies)
    .leftJoin(companyAssets, eq(companyAssets.id, companyInsurancePolicies.assetId))
    .where(and(
      eq(companyInsurancePolicies.companyId, ctx.companyId),
      gte(companyInsurancePolicies.endDate, today),
      lte(companyInsurancePolicies.endDate, limitDate),
    ))
    .orderBy(companyInsurancePolicies.endDate)
    .limit(50);

  return {
    total: rows.length,
    polizas: rows.map((r) => {
      const daysToExpire = Math.floor(
        (new Date(String(r.endDate)).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        id: `insurance-${r.id}`,
        vehiculo: r.assetName,
        aseguradora: r.insurer,
        numero: r.policyNumber,
        fechaVencimiento: r.endDate,
        diasParaVencer: daysToExpire,
        alerta: daysToExpire <= 30 ? 'URGENTE' : daysToExpire <= 60 ? 'PROXIMO' : 'OK',
      };
    }),
    resumenTexto: rows.length === 0
      ? 'No hay pólizas por vencer en los próximos 60 días.'
      : `Hay ${rows.length} póliza(s) por vencer en los próximos 60 días. La más urgente vence en ${rows[0].endDate}.`,
  };
};

const segurosCrearInput = z.object({
  vehiculo: z.string().min(1),
  aseguradora: z.string().min(2).max(160),
  numero: z.string().min(1).max(120),
  cobertura: z.string().max(255).optional(),
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const segurosCrear: OperationHandler = async (ctx, input) => {
  const body = segurosCrearInput.parse(input);
  const asset = await resolveAsset(ctx.companyId, body.vehiculo);

  if (body.fechaVencimiento <= body.fechaInicio) {
    throw new AppError(400, 'La fecha de vencimiento debe ser posterior a la fecha de inicio');
  }

  const [created] = await db.insert(companyInsurancePolicies).values({
    companyId: ctx.companyId,
    assetId: asset.id,
    insurer: body.aseguradora,
    policyNumber: body.numero,
    coverage: body.cobertura ?? null,
    startDate: body.fechaInicio,
    endDate: body.fechaVencimiento,
    status: 'Vigente',
  }).returning();

  return {
    id: `insurance-${created.id}`,
    vehiculo: asset.name,
    aseguradora: created.insurer,
    numero: created.policyNumber,
    fechaVencimiento: created.endDate,
    estado: created.status,
    resumenTexto: `Póliza de seguro "${created.policyNumber}" creada para ${asset.name}, vigente hasta ${created.endDate}.`,
  };
};

// ─────────────────────────────────────────────────────────────────────
//  TALLERES
// ─────────────────────────────────────────────────────────────────────

const talleresLista: OperationHandler = async (ctx) => {
  const rows = await db.select().from(companyWorkshops)
    .where(eq(companyWorkshops.companyId, ctx.companyId))
    .orderBy(companyWorkshops.name)
    .limit(200);

  return {
    total: rows.length,
    talleres: rows.map((r) => ({
      id: `workshop-${r.id}`,
      nombre: r.name,
      nit: r.nit,
      contacto: r.contactName,
      telefono: r.phone,
      direccion: r.address,
      notas: r.notes,
    })),
  };
};

const talleresCrearInput = z.object({
  nombre: z.string().min(2).max(120),
  nit: z.string().max(40).optional(),
  contacto: z.string().max(120).optional(),
  telefono: z.string().max(40).optional(),
  direccion: z.string().max(500).optional(),
  notas: z.string().max(2000).optional(),
});

const talleresCrear: OperationHandler = async (ctx, input) => {
  const body = talleresCrearInput.parse(input);

  const [created] = await db.insert(companyWorkshops).values({
    companyId: ctx.companyId,
    name: body.nombre,
    nit: body.nit ?? null,
    contactName: body.contacto ?? null,
    phone: body.telefono ?? null,
    address: body.direccion ?? null,
    notes: body.notas ?? null,
  }).returning();

  return {
    id: `workshop-${created.id}`,
    nombre: created.name,
    resumenTexto: `Taller "${created.name}" creado.`,
  };
};

// ─────────────────────────────────────────────────────────────────────
//  PROVEEDORES
// ─────────────────────────────────────────────────────────────────────

const proveedoresListFiltros = z.object({
  busqueda: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const proveedoresLista: OperationHandler = async (ctx, input) => {
  const filtros = proveedoresListFiltros.parse(input);
  const conds = [eq(companySuppliers.companyId, ctx.companyId)];
  if (filtros.busqueda) {
    const q = `%${filtros.busqueda}%`;
    conds.push(
      or(
        ilike(companySuppliers.name, q),
        ilike(companySuppliers.nit, q),
        ilike(companySuppliers.contactName, q),
      )!,
    );
  }
  const rows = await db.select().from(companySuppliers)
    .where(and(...conds))
    .orderBy(companySuppliers.name)
    .limit(filtros.limit);

  return {
    total: rows.length,
    proveedores: rows.map((r) => ({
      id: `supplier-${r.id}`,
      nombre: r.name,
      nit: r.nit,
      contacto: r.contactName,
      telefono: r.phone,
      email: r.email,
      direccion: r.address,
      notas: r.notes,
    })),
  };
};

const proveedoresCrearInput = z.object({
  nombre: z.string().min(2).max(120),
  nit: z.string().max(40).optional(),
  contacto: z.string().max(120).optional(),
  telefono: z.string().max(40).optional(),
  email: z.string().email().optional(),
  direccion: z.string().max(500).optional(),
  notas: z.string().max(2000).optional(),
});

const proveedoresCrear: OperationHandler = async (ctx, input) => {
  const body = proveedoresCrearInput.parse(input);

  const [created] = await db.insert(companySuppliers).values({
    companyId: ctx.companyId,
    name: body.nombre,
    nit: body.nit ?? null,
    contactName: body.contacto ?? null,
    phone: body.telefono ?? null,
    email: body.email ?? null,
    address: body.direccion ?? null,
    notes: body.notas ?? null,
  }).returning();

  return {
    id: `supplier-${created.id}`,
    nombre: created.name,
    nit: created.nit,
    resumenTexto: `Proveedor "${created.name}" creado.`,
  };
};

// ─────────────────────────────────────────────────────────────────────
//  SITES / SEDES
// ─────────────────────────────────────────────────────────────────────

const sedesLista: OperationHandler = async (ctx) => {
  const rows = await db.select().from(companySites)
    .where(eq(companySites.companyId, ctx.companyId))
    .orderBy(companySites.name)
    .limit(200);

  return {
    total: rows.length,
    sedes: rows.map((r) => ({
      id: `site-${r.id}`,
      nombre: r.name,
      codigo: r.code,
      ciudad: r.city,
      direccion: r.address,
      contacto: r.contact,
      estado: r.status,
      notas: r.notes,
    })),
  };
};

const sedesCrearInput = z.object({
  nombre: z.string().min(2).max(160),
  codigo: z.string().min(1).max(40),
  ciudad: z.string().max(120).optional(),
  direccion: z.string().max(500).optional(),
  contacto: z.string().max(160).optional(),
  notas: z.string().max(2000).optional(),
});

const sedesCrear: OperationHandler = async (ctx, input) => {
  const body = sedesCrearInput.parse(input);

  const [created] = await db.insert(companySites).values({
    companyId: ctx.companyId,
    name: body.nombre,
    code: body.codigo,
    city: body.ciudad ?? null,
    address: body.direccion ?? null,
    contact: body.contacto ?? null,
    notes: body.notas ?? null,
  }).returning();

  return {
    id: `site-${created.id}`,
    nombre: created.name,
    codigo: created.code,
    resumenTexto: `Sede "${created.name}" creada.`,
  };
};

// ─────────────────────────────────────────────────────────────────────
//  REGISTRO
// ─────────────────────────────────────────────────────────────────────

export function registerCatalogosComunesOps() {
  // Combustible
  registerOperation({ modulo: 'combustible', operacion: 'lista', scope: 'read',
    summary: 'Lista de cargas de combustible (filtrable por vehiculo y fechas)',
    inputSchema: combustibleListFiltros, handler: combustibleLista });
  registerOperation({ modulo: 'combustible', operacion: 'resumen', scope: 'read',
    summary: 'Resumen del mes actual (costo, galones, top vehiculos, ultimas cargas)',
    inputSchema: z.object({}), handler: combustibleResumen });
  registerOperation({ modulo: 'combustible', operacion: 'registrar', scope: 'write',
    summary: 'Registra una nueva carga de combustible',
    inputSchema: combustibleRegistrarInput, handler: combustibleRegistrar });
  registerOperation({ modulo: 'combustible', operacion: 'anomalias', scope: 'read',
    summary: 'Anomalias detectadas en consumo de combustible',
    inputSchema: z.object({}), handler: combustibleAnomalias });

  // Peajes
  registerOperation({ modulo: 'peajes', operacion: 'lista', scope: 'read',
    summary: 'Lista de cruces de peaje (filtrable por vehiculo y fechas)',
    inputSchema: peajesListFiltros, handler: peajesLista });
  registerOperation({ modulo: 'peajes', operacion: 'resumen', scope: 'read',
    summary: 'Resumen de peajes del mes',
    inputSchema: z.object({}), handler: peajesResumen });
  registerOperation({ modulo: 'peajes', operacion: 'registrar', scope: 'write',
    summary: 'Registra un cruce de peaje',
    inputSchema: peajesRegistrarInput, handler: peajesRegistrar });

  // Seguros
  registerOperation({ modulo: 'seguros', operacion: 'lista', scope: 'read',
    summary: 'Lista de polizas de seguro',
    inputSchema: segurosListFiltros, handler: segurosLista });
  registerOperation({ modulo: 'seguros', operacion: 'por_vencer', scope: 'read',
    summary: 'Polizas vigentes que vencen en los proximos 60 dias',
    inputSchema: z.object({}), handler: segurosPorVencer });
  registerOperation({ modulo: 'seguros', operacion: 'crear', scope: 'write',
    summary: 'Crea una poliza de seguro',
    inputSchema: segurosCrearInput, handler: segurosCrear });

  // Talleres
  registerOperation({ modulo: 'talleres', operacion: 'lista', scope: 'read',
    summary: 'Lista de talleres',
    inputSchema: z.object({}), handler: talleresLista });
  registerOperation({ modulo: 'talleres', operacion: 'crear', scope: 'write',
    summary: 'Crea un taller',
    inputSchema: talleresCrearInput, handler: talleresCrear });

  // Proveedores
  registerOperation({ modulo: 'proveedores', operacion: 'lista', scope: 'read',
    summary: 'Lista de proveedores (con busqueda opcional)',
    inputSchema: proveedoresListFiltros, handler: proveedoresLista });
  registerOperation({ modulo: 'proveedores', operacion: 'crear', scope: 'write',
    summary: 'Crea un proveedor',
    inputSchema: proveedoresCrearInput, handler: proveedoresCrear });

  // Sedes
  registerOperation({ modulo: 'sedes', operacion: 'lista', scope: 'read',
    summary: 'Lista de sedes',
    inputSchema: z.object({}), handler: sedesLista });
  registerOperation({ modulo: 'sedes', operacion: 'crear', scope: 'write',
    summary: 'Crea una sede',
    inputSchema: sedesCrearInput, handler: sedesCrear });
}
