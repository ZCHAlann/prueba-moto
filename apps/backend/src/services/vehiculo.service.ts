import { db } from '../db/client';
import { eq, desc, and } from 'drizzle-orm';
import { companyAssets, companyFuelEntries, companyMaintenances,
         companyAlerts, companyOilChanges, companyDrivers,
         companyAssignments } from '../db/schema/operational';
import { oilChecks } from '../db/schema/operational';
import { parseId } from '../lib/ids';

export async function getVehicleCockpit(assetId: string, companyId: string) {
  const assetNum   = parseId('asset',   assetId);
  const companyNum = parseId('company', companyId);

  const [[asset], lastFuels, lastOilCheck, lastOilChange,
         maintenances, alerts, activeAssignment] = await Promise.all([

    // Vehículo
    db.select().from(companyAssets)
      .where(and(eq(companyAssets.id, assetNum),
                 eq(companyAssets.companyId, companyNum)))
      .limit(1),

    // Últimas 5 cargas de combustible
    db.select().from(companyFuelEntries)
      .where(and(eq(companyFuelEntries.assetId, assetNum),
                 eq(companyFuelEntries.companyId, companyNum)))
      .orderBy(desc(companyFuelEntries.date)).limit(5),

    // Último oil check IA
    db.select().from(oilChecks)
      .where(and(eq(oilChecks.assetId, assetNum),
                 eq(oilChecks.companyId, companyNum)))
      .orderBy(desc(oilChecks.createdAt)).limit(1),

    // Último cambio de aceite
    db.select().from(companyOilChanges)
      .where(and(eq(companyOilChanges.assetId, assetNum),
                 eq(companyOilChanges.companyId, companyNum)))
      .orderBy(desc(companyOilChanges.date)).limit(1),

    // Mantenimientos pendientes/en proceso
    db.select().from(companyMaintenances)
      .where(and(eq(companyMaintenances.assetId, assetNum),
                 eq(companyMaintenances.companyId, companyNum)))
      .orderBy(desc(companyMaintenances.createdAt)).limit(10),

    // Alertas abiertas
    db.select().from(companyAlerts)
      .where(and(eq(companyAlerts.assetId, assetNum),
                 eq(companyAlerts.companyId, companyNum),
                 eq(companyAlerts.status, 'Abierta')))
      .limit(5),

    // Asignación activa (conductor)
    db.select({ driverId: companyAssignments.driverId })
      .from(companyAssignments)
      .where(and(eq(companyAssignments.assetId, assetNum),
                 eq(companyAssignments.companyId, companyNum),
                 eq(companyAssignments.status, 'Activa')))
      .orderBy(desc(companyAssignments.createdAt)).limit(1),
  ]);

  if (!asset) throw new Error('Vehículo no encontrado');

  // Conductor
  let driver = null;
  if (activeAssignment[0]?.driverId) {
    const [d] = await db.select({
      firstName: companyDrivers.firstName,
      lastName:  companyDrivers.lastName,
      photoUrl:  companyDrivers.photoUrl,
      phone:     companyDrivers.phone,
    }).from(companyDrivers)
      .where(eq(companyDrivers.id, activeAssignment[0].driverId))
      .limit(1);
    driver = d ?? null;
  }

  // Combustible: total últimas 5 cargas
  const totalLiters = lastFuels.reduce((s, f) => s + Number(f.liters), 0);
  const totalCost   = lastFuels.reduce((s, f) => s + Number(f.cost ?? 0), 0);
  const lastOdometer = lastFuels[0]?.odometer ? Number(lastFuels[0].odometer) : null;

  // Aceite: progreso km al próximo cambio
  const oilProgress = lastOilChange[0] && lastOdometer
    ? Math.min(100, Math.round(
        ((lastOdometer - lastOilChange[0].reading) /
         (lastOilChange[0].nextReading - lastOilChange[0].reading)) * 100
      ))
    : null;

  return {
    asset: {
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
    },
    driver,
    fuel: {
      entries:     lastFuels,
      totalLiters: +totalLiters.toFixed(1),
      totalCost:   +totalCost.toFixed(2),
      lastOdometer,
    },
    oilCheck: lastOilCheck[0] ?? null,
    oilChange: lastOilChange[0]
      ? { ...lastOilChange[0], progressPct: oilProgress }
      : null,
    maintenances: maintenances.filter(m =>
      m.status === 'Pendiente' || m.status === 'En proceso'),
    alerts,
  };
}