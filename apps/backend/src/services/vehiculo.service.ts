import { db } from '../db/client';
import { eq, desc, and, sql, gte, isNull, asc, lte } from 'drizzle-orm';
import {
  companyAssets,
  companyFuelEntries,
  companyMaintenanceRecords,   // ← nombre correcto
  companyAlerts,
  companyOilChanges,
  companyDrivers,
  companyAssignments,
  companyInsurancePolicies,
} from '../db/schema/operational';
import {
  oilChecks,
  assetNotes,
  assetRoutes,
} from '../db/schema/operational';
import { parseId } from '../lib/ids';

// ─────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────

function assetIdParams(assetId: string, companyId: string) {
  return {
    assetNum:   parseId('asset',   assetId),
    companyNum: parseId('company', companyId),
  };
}

function formatAssetRow(asset: any) {
  return {
    id:           `asset-${asset.id}`,
    name:         asset.name,
    plate:        asset.plate,
    brand:        asset.brand,
    model:        asset.model,
    year:         asset.year,
    status:       asset.status,
    availability: asset.availability,
    fuelType:     asset.fuelType,
    photoUrls:    asset.photoUrls,
    location:     asset.location,
    engineOn:     asset.engineOn ?? false,
    locked:       asset.locked   ?? false,
    lastLat:      asset.lastLat  ?? null,
    lastLng:      asset.lastLng  ?? null,
    lastGpsAt:    asset.lastGpsAt ?? null,
  };
}

// ═══════════════════════════════════════════════
//  COCKPIT
// ═══════════════════════════════════════════════

export async function getVehicleCockpit(assetId: string, companyId: string) {
  const { assetNum, companyNum } = assetIdParams(assetId, companyId);

  const [
    [asset],
    lastFuels,
    lastOilCheck,
    lastOilChange,
    maintenances,
    alerts,
    activeAssignmentRow,
    insuranceRow,
    notes,
  ] = await Promise.all([

    db.select().from(companyAssets)
      .where(and(eq(companyAssets.id, assetNum),
                 eq(companyAssets.companyId, companyNum)))
      .limit(1),

    db.select().from(companyFuelEntries)
      .where(and(eq(companyFuelEntries.assetId, assetNum),
                 eq(companyFuelEntries.companyId, companyNum)))
      .orderBy(desc(companyFuelEntries.date)).limit(5),

    db.select().from(oilChecks)
      .where(and(eq(oilChecks.assetId, assetNum),
                 eq(oilChecks.companyId, companyNum)))
      .orderBy(desc(oilChecks.createdAt)).limit(1),

    db.select().from(companyOilChanges)
      .where(and(eq(companyOilChanges.assetId, assetNum),
                 eq(companyOilChanges.companyId, companyNum)))
      .orderBy(desc(companyOilChanges.date)).limit(1),

    // ← companyMaintenanceRecords tiene assetId y companyId directos
    db.select({
      id:          companyMaintenanceRecords.id,
      title:       companyMaintenanceRecords.title,
      status:      companyMaintenanceRecords.status,
      type:        companyMaintenanceRecords.type,
      scheduledFor: companyMaintenanceRecords.scheduledFor,
      category:    companyMaintenanceRecords.category,
    }).from(companyMaintenanceRecords)
      .where(and(eq(companyMaintenanceRecords.assetId, assetNum),
                 eq(companyMaintenanceRecords.companyId, companyNum)))
      .orderBy(desc(companyMaintenanceRecords.scheduledFor)).limit(10),

    db.select().from(companyAlerts)
      .where(and(eq(companyAlerts.assetId, assetNum),
                 eq(companyAlerts.companyId, companyNum),
                 eq(companyAlerts.status, 'Abierta')))
      .limit(5),

    db.select().from(companyAssignments)
      .where(and(eq(companyAssignments.assetId, assetNum),
                 eq(companyAssignments.companyId, companyNum),
                 eq(companyAssignments.status, 'Activa')))
      .orderBy(desc(companyAssignments.createdAt)).limit(1),

    db.select().from(companyInsurancePolicies)
      .where(and(eq(companyInsurancePolicies.assetId, assetNum),
                 eq(companyInsurancePolicies.companyId, companyNum),
                 eq(companyInsurancePolicies.status, 'Vigente')))
      .orderBy(desc(companyInsurancePolicies.endDate)).limit(1),

    db.select().from(assetNotes)
      .where(and(eq(assetNotes.assetId, assetNum),
                 eq(assetNotes.companyId, companyNum)))
      .orderBy(desc(assetNotes.createdAt)).limit(5),
  ]);

  if (!asset) throw new Error('Vehículo no encontrado');

  // Conductor
  const activeAssignment = activeAssignmentRow[0] ?? null;
  let driver: any = null;
  if (activeAssignment?.driverId) {
    const [d] = await db.select({
      firstName:     companyDrivers.firstName,
      lastName:      companyDrivers.lastName,
      photoUrl:      companyDrivers.photoUrl,
      phone:         companyDrivers.phone,
      email:         companyDrivers.email,
      licenseNumber: companyDrivers.licenseNumber,
      licenseType:   companyDrivers.licenseType,
      licenseExpiry: companyDrivers.licenseExpiry,
    }).from(companyDrivers)
      .where(eq(companyDrivers.id, activeAssignment.driverId))
      .limit(1);

    if (d) driver = d;
  }

  // Combustible
  const totalGallons = lastFuels.reduce((s, f) => s + Number(f.gallons), 0);
  const totalCost    = lastFuels.reduce((s, f) => s + Number(f.cost ?? 0), 0);
  const lastOdometer = lastFuels[0]?.odometer ? Number(lastFuels[0].odometer) : null;

  // Progreso aceite
  const oilProgress = lastOilChange[0] && lastOdometer
    ? Math.min(100, Math.round(
        ((lastOdometer - lastOilChange[0].reading) /
         (lastOilChange[0].nextReading - lastOilChange[0].reading)) * 100
      ))
    : null;

  // Insurance
  const insurance = insuranceRow[0]
    ? {
        id:           `insurance-${insuranceRow[0].id}`,
        insurer:      insuranceRow[0].insurer,
        policyNumber: insuranceRow[0].policyNumber,
        coverage:     insuranceRow[0].coverage,
        startDate:    insuranceRow[0].startDate,
        endDate:      insuranceRow[0].endDate,
        status:       insuranceRow[0].status,
        notes:        insuranceRow[0].notes,
      }
    : null;

  // Assignment
  const activeAssignmentOut = activeAssignment
    ? {
        id:        `assignment-${activeAssignment.id}`,
        driverId:  activeAssignment.driverId,
        startDate: activeAssignment.startDate,
        endDate:   activeAssignment.endDate,
        status:    activeAssignment.status,
      }
    : null;

  // Notes
  const notesOut = notes.map((n: any) => ({
    id:         `note-${n.id}`,
    body:       n.body,
    authorId:   n.authorId,
    authorName: n.authorName,
    createdAt:  n.createdAt,
  }));

  // Mantenimientos — mapear al shape que espera el frontend
  // status en companyMaintenanceRecords: 'Programado' | 'En curso' | 'PendienteAtencion' | 'Completado' | 'Cancelado'
  // el frontend filtra por 'Pendiente' | 'En proceso' — adaptamos
  const maintenancesMapped = maintenances
    .filter(m => m.status === 'Programado' || m.status === 'En curso' || m.status === 'PendienteAtencion')
    .map(m => ({
      id:       `maintenance-${m.id}`,
      title:    m.title ?? '(sin título)',
      priority: 'Media',                           // companyMaintenanceRecords no tiene priority
      status:   m.status === 'En curso' ? 'En proceso' : 'Pendiente',
      dueDate:  m.scheduledFor instanceof Date
                  ? m.scheduledFor.toISOString().slice(0, 10)
                  : String(m.scheduledFor ?? ''),
    }));

  return {
    asset:            formatAssetRow(asset),
    driver,
    fuel: {
      entries:      lastFuels,
      totalGallons: +totalGallons.toFixed(2),
      totalCost:    +totalCost.toFixed(2),
      lastOdometer,
    },
    oilCheck:  lastOilCheck[0] ?? null,
    oilChange: lastOilChange[0]
                 ? { ...lastOilChange[0], progressPct: oilProgress }
                 : null,
    maintenances: maintenancesMapped,
    alerts,
    insurance,
    notes:            notesOut,
    activeAssignment: activeAssignmentOut,
  };
}

// ═══════════════════════════════════════════════
//  CONTROLES — GPS / status / engine / lock
// ═══════════════════════════════════════════════

export async function getVehicleLocation(assetId: string, companyId: string) {
  const { assetNum, companyNum } = assetIdParams(assetId, companyId);

  const [row] = await db.select({
    lastLat:   companyAssets.lastLat,
    lastLng:   companyAssets.lastLng,
    lastGpsAt: companyAssets.lastGpsAt,
  }).from(companyAssets)
    .where(and(eq(companyAssets.id, assetNum),
               eq(companyAssets.companyId, companyNum)))
    .limit(1);

  if (!row) throw new Error('Vehículo no encontrado');
  return { lat: row.lastLat ?? null, lng: row.lastLng ?? null, updatedAt: row.lastGpsAt ?? null };
}

export async function updateAssetStatus(
  assetId: string, companyId: string, status: 'Operativo' | 'Fuera de servicio' | 'En mantenimiento'
) {
  const { assetNum, companyNum } = assetIdParams(assetId, companyId);

  const [row] = await db.update(companyAssets)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(companyAssets.id, assetNum),
               eq(companyAssets.companyId, companyNum)))
    .returning({ status: companyAssets.status });

  if (!row) throw new Error('Vehículo no encontrado');
  return { status: row.status };
}

export async function toggleEngine(assetId: string, companyId: string) {
  const { assetNum, companyNum } = assetIdParams(assetId, companyId);

  const [row] = await db.execute(sql`
    UPDATE company_assets
       SET engine_on  = NOT COALESCE(engine_on, false),
           updated_at = NOW()
     WHERE id = ${assetNum} AND company_id = ${companyNum}
     RETURNING engine_on
  `) as any;

  if (!row || (Array.isArray(row) && row.length === 0)) throw new Error('Vehículo no encontrado');
  const updated = Array.isArray(row) ? row[0] : row;
  return { engineOn: updated.engine_on ?? updated.engineOn ?? false };
}

export async function toggleLock(assetId: string, companyId: string) {
  const { assetNum, companyNum } = assetIdParams(assetId, companyId);

  const [row] = await db.execute(sql`
    UPDATE company_assets
       SET locked     = NOT COALESCE(locked, false),
           updated_at = NOW()
     WHERE id = ${assetNum} AND company_id = ${companyNum}
     RETURNING locked
  `) as any;

  if (!row || (Array.isArray(row) && row.length === 0)) throw new Error('Vehículo no encontrado');
  const updated = Array.isArray(row) ? row[0] : row;
  return { locked: updated.locked ?? false };
}

// ═══════════════════════════════════════════════
//  DAILY USAGE
// ═══════════════════════════════════════════════

export async function getDailyUsage(assetId: string, companyId: string, dateIso: string) {
  const { assetNum, companyNum } = assetIdParams(assetId, companyId);

  const routes = await db.select({
    coordinates: assetRoutes.coordinates,
    createdAt:   assetRoutes.createdAt,
  }).from(assetRoutes)
    .where(and(eq(assetRoutes.assetId, assetNum),
               eq(assetRoutes.companyId, companyNum),
               eq(assetRoutes.date, dateIso)))
    .orderBy(asc(assetRoutes.createdAt));

  const hours: { hour: number; km: number }[] = Array.from({ length: 24 }, (_, h) => ({ hour: h, km: 0 }));

  for (const r of routes) {
    const created = (r.createdAt as any) instanceof Date ? (r.createdAt as Date) : new Date(r.createdAt as any);
    const hour = created.getUTCHours();
    const dist = (r.coordinates as any)?.distanceKm ?? 0;
    hours[hour].km += Number(dist) || 0;
  }

  let acc = 0;
  for (const h of hours) { acc += h.km; h.km = +acc.toFixed(2); }

  return hours;
}

// ═══════════════════════════════════════════════
//  STATS
// ═══════════════════════════════════════════════

function monthsAgoIso(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

export async function getStatsFuel(assetId: string, companyId: string) {
  const { assetNum, companyNum } = assetIdParams(assetId, companyId);
  const since = monthsAgoIso(12);

  const rows = await db.select({
    date:    companyFuelEntries.date,
    gallons: companyFuelEntries.gallons,
  }).from(companyFuelEntries)
    .where(and(eq(companyFuelEntries.assetId, assetNum),
               eq(companyFuelEntries.companyId, companyNum),
               gte(companyFuelEntries.date, since.toISOString().slice(0, 10))));

  const buckets = new Map<string, number>();
  for (const r of rows) {
    const d = (r.date as any) instanceof Date ? (r.date as unknown as Date) : new Date(r.date as any);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, (buckets.get(key) ?? 0) + Number(r.gallons));
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, liters]) => ({ month, liters: +liters.toFixed(2) }));
}

export async function getStatsMaintenances(assetId: string, companyId: string) {
  const { assetNum, companyNum } = assetIdParams(assetId, companyId);
  const since = monthsAgoIso(12);

  const rows = await db.select({
    scheduledFor: companyMaintenanceRecords.scheduledFor,
    createdAt:    companyMaintenanceRecords.createdAt,
    status:       companyMaintenanceRecords.status,
  }).from(companyMaintenanceRecords)
    .where(and(eq(companyMaintenanceRecords.assetId, assetNum),
               eq(companyMaintenanceRecords.companyId, companyNum),
               gte(companyMaintenanceRecords.createdAt, since)));

  const buckets = new Map<string, { Pendiente: number; 'En proceso': number; Completado: number }>();
  for (const r of rows) {
    const d = (r.createdAt as any) instanceof Date ? (r.createdAt as Date) : new Date(r.createdAt as any);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(key) ?? { Pendiente: 0, 'En proceso': 0, Completado: 0 };

    // mapear status nuevo → shape del frontend
    if (r.status === 'Programado' || r.status === 'PendienteAtencion') bucket.Pendiente += 1;
    else if (r.status === 'En curso') bucket['En proceso'] += 1;
    else if (r.status === 'Completado') bucket.Completado += 1;

    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, counts]) => ({ month, ...counts }));
}

export async function getStatsOdometer(assetId: string, companyId: string) {
  const { assetNum, companyNum } = assetIdParams(assetId, companyId);
  const since = monthsAgoIso(12);

  const rows = await db.select({
    date:     companyFuelEntries.date,
    odometer: companyFuelEntries.odometer,
  }).from(companyFuelEntries)
    .where(and(eq(companyFuelEntries.assetId, assetNum),
               eq(companyFuelEntries.companyId, companyNum),
               gte(companyFuelEntries.date, since.toISOString().slice(0, 10))))
    .orderBy(asc(companyFuelEntries.date));

  return rows
    .filter((r: any) => r.odometer != null)
    .map((r: any) => {
      const d = (r.date as any) instanceof Date ? (r.date as Date) : new Date(r.date as any);
      return { date: d.toISOString().slice(0, 10), odometer: Number(r.odometer) };
    });
}

export async function getStatsCosts(assetId: string, companyId: string) {
  const { assetNum, companyNum } = assetIdParams(assetId, companyId);
  const since = monthsAgoIso(12);

  const [fuels, maintenances] = await Promise.all([
    db.select({
      date: companyFuelEntries.date,
      cost: companyFuelEntries.cost,
    }).from(companyFuelEntries)
      .where(and(eq(companyFuelEntries.assetId, assetNum),
                 eq(companyFuelEntries.companyId, companyNum),
                 gte(companyFuelEntries.date, since.toISOString().slice(0, 10)))),

    // ← totalCost está directo en companyMaintenanceRecords
    db.select({
      createdAt: companyMaintenanceRecords.createdAt,
      totalCost: companyMaintenanceRecords.totalCost,
    }).from(companyMaintenanceRecords)
      .where(and(eq(companyMaintenanceRecords.assetId, assetNum),
                 eq(companyMaintenanceRecords.companyId, companyNum),
                 gte(companyMaintenanceRecords.createdAt, since))),
  ]);

  const fuelMap = new Map<string, number>();
  for (const f of fuels) {
    const d = (f.date as any) instanceof Date ? (f.date as unknown as Date) : new Date(f.date as any);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    fuelMap.set(key, (fuelMap.get(key) ?? 0) + Number(f.cost ?? 0));
  }

  const maintMap = new Map<string, number>();
  for (const m of maintenances) {
    const d = (m.createdAt as any) instanceof Date ? (m.createdAt as Date) : new Date(m.createdAt as any);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    maintMap.set(key, (maintMap.get(key) ?? 0) + Number(m.totalCost ?? 0));
  }

  const months = new Set<string>([...fuelMap.keys(), ...maintMap.keys()]);
  return Array.from(months)
    .sort()
    .map((month) => ({
      month,
      fuel:        +(fuelMap.get(month)  ?? 0).toFixed(2),
      maintenance: +(maintMap.get(month) ?? 0).toFixed(2),
    }));
}

// ═══════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════

export async function listAssetRoutes(assetId: string, companyId: string) {
  const { assetNum, companyNum } = assetIdParams(assetId, companyId);

  const rows = await db.select().from(assetRoutes)
    .where(and(eq(assetRoutes.assetId, assetNum),
               eq(assetRoutes.companyId, companyNum)))
    .orderBy(desc(assetRoutes.date));

  return rows.map((r: any) => ({
    id:          `route-${r.id}`,
    date:        r.date,
    origin:      r.origin,
    destination: r.destination,
    distanceKm:  r.distanceKm,
    durationMin: r.durationMin,
    coordinates: r.coordinates,
    notes:       r.notes,
    driverId:    r.driverId,
  }));
}

export async function createAssetRoute(
  assetId: string,
  companyId: string,
  payload: {
    date: string; origin?: string; destination?: string;
    distanceKm?: number; durationMin?: number;
    coordinates?: any; driverId?: number; notes?: string;
  }
) {
  const { assetNum, companyNum } = assetIdParams(assetId, companyId);

  const [row] = await db.insert(assetRoutes).values({
    companyId:   companyNum,
    assetId:     assetNum,
    driverId:    payload.driverId    ?? null,
    date:        payload.date,
    origin:      payload.origin      ?? null,
    destination: payload.destination ?? null,
    distanceKm:  payload.distanceKm  ?? null,
    durationMin: payload.durationMin ?? null,
    coordinates: payload.coordinates ?? [],
    notes:       payload.notes       ?? null,
  }).returning();

  return {
    id:          `route-${row.id}`,
    date:        row.date,
    origin:      row.origin,
    destination: row.destination,
    distanceKm:  row.distanceKm,
    durationMin: row.durationMin,
    coordinates: row.coordinates,
    notes:       row.notes,
    driverId:    row.driverId,
  };
}

// ═══════════════════════════════════════════════
//  NOTES
// ═══════════════════════════════════════════════

export async function listAssetNotes(
  assetId: string, companyId: string, opts: { limit?: number; offset?: number } = {}
) {
  const { assetNum, companyNum } = assetIdParams(assetId, companyId);
  const limit  = Math.min(opts.limit  ?? 50, 200);
  const offset = opts.offset ?? 0;

  const rows = await db.select().from(assetNotes)
    .where(and(eq(assetNotes.assetId, assetNum),
               eq(assetNotes.companyId, companyNum)))
    .orderBy(desc(assetNotes.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((n: any) => ({
    id:         `note-${n.id}`,
    body:       n.body,
    authorId:   n.authorId,
    authorName: n.authorName,
    createdAt:  n.createdAt,
  }));
}

export async function createAssetNote(
  assetId: string,
  companyId: string,
  author: { id?: number | null; name?: string | null },
  body: string
) {
  const { assetNum, companyNum } = assetIdParams(assetId, companyId);
  const trimmed = (body ?? '').trim();
  if (!trimmed) throw new Error('El cuerpo de la nota no puede estar vacío');

  const [row] = await db.insert(assetNotes).values({
    companyId:  companyNum,
    assetId:    assetNum,
    authorId:   author.id   ?? null,
    authorName: author.name ?? null,
    body:       trimmed,
  }).returning();

  return {
    id:         `note-${row.id}`,
    body:       row.body,
    authorId:   row.authorId,
    authorName: row.authorName,
    createdAt:  row.createdAt,
  };
}

export async function deleteAssetNote(
  assetId: string, companyId: string, noteId: number
) {
  const { assetNum, companyNum } = assetIdParams(assetId, companyId);

  const [row] = await db.delete(assetNotes)
    .where(and(eq(assetNotes.id, noteId),
               eq(assetNotes.assetId, assetNum),
               eq(assetNotes.companyId, companyNum)))
    .returning({ id: assetNotes.id, authorId: assetNotes.authorId });

  if (!row) throw new Error('Nota no encontrada');
  return { id: `note-${row.id}`, authorId: row.authorId };
}