import { Router } from 'express';
import { eq, and, gte, lte, desc, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyAssets,
  companyWorkshops,
  companyMaintenanceRecords,
  companyFuelEntries,
  companyAlerts,
  companyDrivers,
  companyChecklists,
  companyAuditEntries,
  companySites,
  companyGarages,
  companyAssignments,
  companyInventory,
  companyAcUnits,
  companyAcServices,
  companyOilChanges,
  companyInsurancePolicies,
} from '../../db/schema/operational';
import { requireModule } from '../../middlewares/requireModule';

const router = Router({ mergeParams: true });

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** "2024-03" → "Mar 2024" */
function monthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('es-EC', { month: 'short', year: 'numeric' });
}

/** Date | string | null → "YYYY-MM" | null */
function toYearMonth(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${mm}`;
}

/** Devuelve los últimos N meses como "YYYY-MM", ordenados asc */
function lastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${d.getFullYear()}-${mm}`);
  }
  return months;
}

// ─── GET /company/:id/analytics/dashboard ────────────────────────────────────

router.get('/dashboard', requireModule('dashboard'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    /* Traer todas las tablas en paralelo */
    const [
      assetsRows,
      maintenancesRows,
      fuelRows,
      alertsRows,
      driversRows,
      checklistsRows,
      auditRows,
      sitesRows,
      garagesRows,
      assignmentsRows,
    ] = await Promise.all([
      db.select().from(companyAssets).where(eq(companyAssets.companyId, companyId)),
      db.select().from(companyMaintenanceRecords).where(eq(companyMaintenanceRecords.companyId, companyId)),
      db.select().from(companyFuelEntries).where(eq(companyFuelEntries.companyId, companyId)),
      db.select().from(companyAlerts).where(eq(companyAlerts.companyId, companyId)),
      db.select().from(companyDrivers).where(eq(companyDrivers.companyId, companyId)),
      db.select().from(companyChecklists).where(eq(companyChecklists.companyId, companyId)),
      db.select().from(companyAuditEntries)
        .where(eq(companyAuditEntries.companyId, companyId))
        .orderBy(desc(companyAuditEntries.createdAt))
        .limit(20),
      db.select().from(companySites).where(eq(companySites.companyId, companyId)),
      db.select().from(companyGarages).where(eq(companyGarages.companyId, companyId)),
      db.select().from(companyAssignments).where(eq(companyAssignments.companyId, companyId)),
    ]);

    /* ── KPIs ───────────────────────────────────────────────────────────── */
    const totalAssets       = assetsRows.length;
    const operativeAssets   = assetsRows.filter(a => a.status === 'Operativo').length;
    const totalDrivers      = driversRows.length;
    const activeDrivers     = driversRows.filter(d => d.status === 'Activo').length;
    const openMaintenances  = maintenancesRows.filter(m => m.status !== 'Completado').length;
    const totalMaintenances = maintenancesRows.length;
    const openAlerts        = alertsRows.filter(a => a.status === 'Abierta' || a.status === 'En revisión').length;
    const criticalAlerts    = alertsRows.filter(a => a.status === 'Abierta' && a.severity === 'Alta').length;
const totalFuelGallons  = fuelRows.reduce((acc, f) => acc + Number(f.gallons), 0);
    const totalFuelCost     = fuelRows.filter(f => f.cost !== null).reduce((acc, f) => acc + Number(f.cost), 0);
    const activeAssignments = assignmentsRows.filter(a => a.status === 'Activa').length;
    const totalChecklists   = checklistsRows.length;

    /* ── Charts ─────────────────────────────────────────────────────────── */
    const months = lastNMonths(12);

    /* Combustible por mes (galones + costo) */
    const fuelByMonth: Record<string, { gallons: number; cost: number }> = {};
    for (const f of fuelRows) {
      const m = toYearMonth(f.date);
      if (!m) continue;
      if (!fuelByMonth[m]) fuelByMonth[m] = { gallons: 0, cost: 0 };
      fuelByMonth[m].gallons += Number(f.gallons);
      fuelByMonth[m].cost   += f.cost ? Number(f.cost) : 0;
    }

    const fuelOverTime = {
      categories: months.map(monthLabel),
      galones:    months.map(m => Math.round((fuelByMonth[m]?.gallons ?? 0) * 100) / 100),
      cost:       months.map(m => Math.round((fuelByMonth[m]?.cost   ?? 0) * 100) / 100),
    };

    /* Mantenimientos por mes (count) */
    const maintByMonth: Record<string, number> = {};
    for (const m of maintenancesRows) {
      const key = toYearMonth(m.scheduledFor ?? m.createdAt);
      if (!key) continue;
      maintByMonth[key] = (maintByMonth[key] ?? 0) + 1;
    }

    const maintenancesByMonth = {
      categories: months.map(monthLabel),
      count: months.map(m => maintByMonth[m] ?? 0),
      cost: months.map(m => {
        const total = maintenancesRows
          .filter(r => toYearMonth(r.scheduledFor ?? r.createdAt) === m)
          .reduce((acc, r) => acc + Number(r.totalCost ?? 0), 0);
        return Math.round(total * 100) / 100;
      }),
    };

    /* Assets por categoría */
    const byCategoryMap: Record<string, number> = {};
    for (const a of assetsRows) {
      const cat = a.category ?? 'Sin categoría';
      byCategoryMap[cat] = (byCategoryMap[cat] ?? 0) + 1;
    }
    const assetsByCategory = Object.entries(byCategoryMap)
      .map(([name, value]) => ({ name, value }));

    /* Assets por estado */
    const byStatusMap: Record<string, number> = {
      'Operativo': 0,
      'En mantenimiento': 0,
      'Fuera de servicio': 0,
      'Otro': 0,
    };
    for (const a of assetsRows) {
      const s = a.status ?? 'Otro';
      if (s in byStatusMap) byStatusMap[s]++;
      else byStatusMap['Otro']++;
    }
    const assetsByStatus = Object.entries(byStatusMap)
      .map(([name, value]) => ({ name, value }));

    /* Assets por tipo de combustible */
    const byFuelTypeMap: Record<string, number> = {};
    for (const a of assetsRows) {
      const ft = a.fuelType ?? 'Sin especificar';
      byFuelTypeMap[ft] = (byFuelTypeMap[ft] ?? 0) + 1;
    }
    const assetsByFuelType = Object.entries(byFuelTypeMap)
      .map(([name, value]) => ({ name, value }));

    /* Conductores por tipo de licencia */
    const byLicenseMap: Record<string, number> = {};
    for (const d of driversRows) {
      const lt = d.licenseType ?? 'Sin licencia';
      byLicenseMap[lt] = (byLicenseMap[lt] ?? 0) + 1;
    }
    const driversByLicense = Object.entries(byLicenseMap)
      .map(([name, value]) => ({ name, value }));

    /* Alertas por severidad */
    const bySeverityMap: Record<string, number> = { Alta: 0, Media: 0, Baja: 0 };
    for (const a of alertsRows) {
      const s = a.severity ?? 'Baja';
      if (s in bySeverityMap) bySeverityMap[s]++;
    }
    const alertsBySeverity = Object.entries(bySeverityMap)
      .map(([name, value]) => ({ name, value }));

    /* Alertas por tipo */
    const byAlertTypeMap: Record<string, number> = {};
    for (const a of alertsRows) {
      const t = a.type ?? 'Sin tipo';
      byAlertTypeMap[t] = (byAlertTypeMap[t] ?? 0) + 1;
    }
    const alertsByType = Object.entries(byAlertTypeMap)
      .map(([name, value]) => ({ name, value }));

    /* Mantenimientos por tipo */
    const byKindMap: Record<string, number> = {};
    for (const m of maintenancesRows) {
      const k = m.category ?? 'Sin tipo';
      byKindMap[k] = (byKindMap[k] ?? 0) + 1;
    }

    const maintenancesByKind = Object.entries(byKindMap)
      .map(([name, value]) => ({ name, value }));

    /* ── Fase 1: Vistas inteligentes basadas en relaciones ─────────────── */

    /* 1. Flota por sede (vehículos agrupados por site_id) */
    const siteMap = new Map<number, { name: string; total: number; operative: number }>();
    for (const s of sitesRows) {
      siteMap.set(s.id, { name: s.name, total: 0, operative: 0 });
    }
    for (const a of assetsRows) {
      if (a.siteId == null) continue;
      const entry = siteMap.get(a.siteId) ?? { name: `Sede ${a.siteId}`, total: 0, operative: 0 };
      entry.total += 1;
      if (a.status === 'Operativo') entry.operative += 1;
      siteMap.set(a.siteId, entry);
    }
    const flotaPorSede = Array.from(siteMap.values())
      .map(s => ({ name: s.name, total: s.total, operative: s.operative }))
      .sort((a, b) => b.total - a.total);

    /* 2. KPIs por sede (mini-tabla: capacidad equivalente) */
    const kpisPorSede = flotaPorSede.map(s => ({
      name:        s.name,
      total:       s.total,
      operative:   s.operative,
      availability: s.total > 0 ? Math.round((s.operative / s.total) * 100) : 0,
    }));

    /* 3. Flota por garaje */
    const garageMap = new Map<number, { name: string; total: number; capacity: number }>();
    for (const g of garagesRows) {
      garageMap.set(g.id, { name: g.name, total: 0, capacity: Number(g.capacity ?? 0) });
    }
    for (const a of assetsRows) {
      if (a.garageId == null) continue;
      const entry = garageMap.get(a.garageId) ?? { name: `Garaje ${a.garageId}`, total: 0, capacity: 0 };
      entry.total += 1;
      garageMap.set(a.garageId, entry);
    }
    const flotaPorGaraje = Array.from(garageMap.entries())
      .map(([id, g]) => ({ id, name: g.name, total: g.total, capacity: g.capacity }))
      .sort((a, b) => b.total - a.total);

    /* 4. Ocupación de garajes (% usado vs capacidad) */
    const ocupacionGarajes = flotaPorGaraje
      .filter(g => g.capacity > 0)
      .map(g => ({
        name:      g.name,
        used:      g.total,
        capacity:  g.capacity,
        occupancy: Math.round((g.total / g.capacity) * 100),
      }))
      .sort((a, b) => b.occupancy - a.occupancy);

    /* 5. Consumo de combustible por vehículo (top 10) */
    const consumoByAsset = new Map<number, { gallons: number; cost: number; plate: string; name: string }>();
    for (const f of fuelRows) {
      const a = assetsRows.find(x => x.id === f.assetId);
      const entry = consumoByAsset.get(f.assetId) ?? { gallons: 0, cost: 0, plate: a?.plate ?? '—', name: a?.name ?? '—' };
      entry.gallons += Number(f.gallons);
      entry.cost    += f.cost ? Number(f.cost) : 0;
      consumoByAsset.set(f.assetId, entry);
    }
    const consumoPorVehiculo = Array.from(consumoByAsset.entries())
      .map(([id, v]) => ({ id, plate: v.plate, name: v.name, gallons: Math.round(v.gallons * 100) / 100, cost: Math.round(v.cost * 100) / 100 }))
      .sort((a, b) => b.gallons - a.gallons)
      .slice(0, 10);

    /* 6. Costo de combustible por vehículo (top 10) */
    const costoPorVehiculo = [...consumoPorVehiculo]
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    /* ── Recent activity (desde audit) ──────────────────────────────────── */
    const recentActivity = auditRows.map(e => ({
      id:          String(e.id),
      action:      e.action,
      entity:      e.entity,
      entityId:    e.entityId,
      actor:       e.actorName,
      description: e.description,
      at:          e.createdAt,
    }));

    /* ── Response ────────────────────────────────────────────────────────── */
    res.json({
      kpis: {
        totalAssets,
        operativeAssets,
        totalDrivers,
        activeDrivers,
        openMaintenances,
        totalMaintenances,
        openAlerts,
        criticalAlerts,
        totalFuelGallons: Math.round(totalFuelGallons * 100) / 100,
        totalFuelCost:    Math.round(totalFuelCost     * 100) / 100,
        activeAssignments,
        totalChecklists,
      },
      charts: {
        maintenancesByMonth,
        fuelOverTime,
        assetsByCategory,
        assetsByStatus,
        assetsByFuelType,
        driversByLicense,
        alertsBySeverity,
        alertsByType,
        maintenancesByKind,
      },
      // Fase 1: Vistas inteligentes del dashboard.
      // Cada uno alimenta un submódulo del dashboard controlado por permisos.
      intelligent: {
        flotaPorSede,
        kpisPorSede,
        flotaPorGaraje,
        ocupacionGarajes,
        consumoPorVehiculo,
        costoPorVehiculo,
      },
      recentActivity,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/analytics/fleet ─────────────────────────────────────────

router.get('/fleet', requireModule('flotas'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const assets = await db
      .select()
      .from(companyAssets)
      .where(eq(companyAssets.companyId, companyId));

    // Distribución por tipo
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const a of assets) {
      const type = a.assetType ?? 'Sin tipo';
      const status = a.status ?? 'Sin estado';
      const category = a.category ?? 'Sin categoría';
      byType[type] = (byType[type] ?? 0) + 1;
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      byCategory[category] = (byCategory[category] ?? 0) + 1;
    }

    // Activos sin asignación activa (query simplificada — se puede extender con join)
    res.json({
      total: assets.length,
      byType: Object.entries(byType).map(([label, value]) => ({ label, value })),
      byStatus: Object.entries(byStatus).map(([label, value]) => ({ label, value })),
      byCategory: Object.entries(byCategory).map(([label, value]) => ({ label, value })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/analytics/maintenance ───────────────────────────────────

router.get('/maintenance', requireModule('mantenimiento'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const rows = await db
      .select()
      .from(companyMaintenanceRecords)
      .where(eq(companyMaintenanceRecords.companyId, companyId));

    const byKind: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const costByMonth: Record<string, number> = {};

    for (const m of rows) {
      const kind = m.category ?? 'Sin tipo';
      const status = m.status ?? 'Sin estado';
      const type = m.type ?? 'Programado';
      byKind[kind] = (byKind[kind] ?? 0) + 1;
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      byPriority[type] = (byPriority[type] ?? 0) + 1;

      if (m.totalCost && m.completedAt) {
      const month = toYearMonth(m.completedAt);  // Date → "YYYY-MM"
      if (month) costByMonth[month] = (costByMonth[month] ?? 0) + Number(m.totalCost);
    }
    }

    const totalCost = rows
      .filter((m) => m.totalCost !== null)
      .reduce((acc, m) => acc + Number(m.totalCost), 0);

    res.json({
      total: rows.length,
      totalCost: Math.round(totalCost * 100) / 100,
      byKind: Object.entries(byKind).map(([label, value]) => ({ label, value })),
      byStatus: Object.entries(byStatus).map(([label, value]) => ({ label, value })),
      byPriority: Object.entries(byPriority).map(([label, value]) => ({ label, value })),
      costByMonth: Object.entries(costByMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, cost]) => ({ month, cost: Math.round(cost * 100) / 100 })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/analytics/fuel ─────────────────────────────────────────

router.get('/fuel', requireModule('combustible'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const rows = await db
      .select()
      .from(companyFuelEntries)
      .where(eq(companyFuelEntries.companyId, companyId));

const byMonth: Record<string, { gallons: number; cost: number; entries: number }> = {};
    const byFuelType: Record<string, number> = {};
    const byAsset: Record<number, { gallons: number; cost: number }> = {};

    for (const f of rows) {
      const month = f.date.slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { gallons: 0, cost: 0, entries: 0 };
      byMonth[month].gallons += Number(f.gallons);
      byMonth[month].cost += f.cost ? Number(f.cost) : 0;
      byMonth[month].entries += 1;

      const fuelType = f.fuelType ?? 'Sin tipo';
      byFuelType[fuelType] = (byFuelType[fuelType] ?? 0) + Number(f.gallons);

      if (!byAsset[f.assetId]) byAsset[f.assetId] = { gallons: 0, cost: 0 };
      byAsset[f.assetId].gallons += Number(f.gallons);
      byAsset[f.assetId].cost += f.cost ? Number(f.cost) : 0;
    }

    const totalGallons = rows.reduce((acc, f) => acc + Number(f.gallons), 0);
    const totalCost = rows
      .filter((f) => f.cost !== null)
      .reduce((acc, f) => acc + Number(f.cost), 0);

    res.json({
      total: rows.length,
      totalGallons: Math.round(totalGallons * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      byMonth: Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({
          month,
          gallons: Math.round(v.gallons * 100) / 100,
          cost: Math.round(v.cost * 100) / 100,
          entries: v.entries,
        })),
      byFuelType: Object.entries(byFuelType).map(([label, gallons]) => ({
        label,
        gallons: Math.round(gallons * 100) / 100,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/analytics/dashboard-extended ──────────────────────────
// Endpoints adicionales para los submódulos "inteligentes" del dashboard que
// necesitan queries dedicadas (no entran en el payload base de /dashboard).
// Protegido por `requireModule('dashboard')` — el guard de submódulos se hace
// en el frontend con `can("dashboard", "<submodulo>", "ver")`.

/** GET /dashboard-extended/consumo-por-conductor */
router.get('/dashboard-extended/consumo-por-conductor', requireModule('dashboard'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const limit = Math.min(50, Number(req.query.limit ?? 10));

    const [fuelRows, driversRows] = await Promise.all([
      db.select().from(companyFuelEntries).where(eq(companyFuelEntries.companyId, companyId)),
      db.select().from(companyDrivers).where(eq(companyDrivers.companyId, companyId)),
    ]);

    const byDriver = new Map<number, { gallons: number; cost: number }>();
    for (const f of fuelRows) {
      if (f.driverId == null) continue;
      const entry = byDriver.get(f.driverId) ?? { gallons: 0, cost: 0 };
      entry.gallons += Number(f.gallons);
      entry.cost    += f.cost ? Number(f.cost) : 0;
      byDriver.set(f.driverId, entry);
    }

    const result = Array.from(byDriver.entries()).map(([driverId, v]) => {
      const d = driversRows.find(x => x.id === driverId);
      return {
        id:      driverId,
        name:    d ? `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || d.code : `Conductor ${driverId}`,
        code:    d?.code ?? null,
        gallons: Math.round(v.gallons * 100) / 100,
        cost:    Math.round(v.cost * 100) / 100,
      };
    })
    .sort((a, b) => b.gallons - a.gallons)
    .slice(0, limit);

    res.json({ data: result });
  } catch (err) { next(err); }
});

/** GET /dashboard-extended/estado-asignaciones */
router.get('/dashboard-extended/estado-asignaciones', requireModule('dashboard'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const rows = await db
      .select()
      .from(companyAssignments)
      .where(eq(companyAssignments.companyId, companyId));

    const byStatus: Record<string, number> = {
      'Activa': 0,
      'Finalizada': 0,
      'Cancelada': 0,
      'Otro': 0,
    };
    for (const a of rows) {
      const s = a.status ?? 'Otro';
      if (s in byStatus) byStatus[s]++;
      else byStatus['Otro']++;
    }
    const result = Object.entries(byStatus).map(([name, value]) => ({ name, value }));
    res.json({ data: result, total: rows.length });
  } catch (err) { next(err); }
});

/** GET /dashboard-extended/disponibilidad-conductores */
router.get('/dashboard-extended/disponibilidad-conductores', requireModule('dashboard'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const [driversRows, assignmentsRows] = await Promise.all([
      db.select().from(companyDrivers).where(eq(companyDrivers.companyId, companyId)),
      db.select().from(companyAssignments).where(eq(companyAssignments.companyId, companyId)),
    ]);

    // IDs de conductores con asignación activa
    const assignedActive = new Set(
      assignmentsRows.filter(a => a.status === 'Activa').map(a => a.driverId)
    );

    let activosAsignados = 0;
    let activosSinAsignar = 0;
    let inactivos = 0;
    for (const d of driversRows) {
      if (d.status !== 'Activo') { inactivos++; continue; }
      if (assignedActive.has(d.id)) activosAsignados++;
      else activosSinAsignar++;
    }
    res.json({
      data: [
        { name: 'Activos asignados',    value: activosAsignados },
        { name: 'Activos sin asignar',  value: activosSinAsignar },
        { name: 'Inactivos',            value: inactivos },
      ],
      total: driversRows.length,
    });
  } catch (err) { next(err); }
});

/** GET /dashboard-extended/mis-vehiculos?driverId=X */
router.get('/dashboard-extended/mis-vehiculos', requireModule('dashboard'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const driverId = Number(req.query.driverId);
    if (!driverId) {
      return res.status(400).json({ error: 'driverId es requerido' });
    }

    const [driver] = await db
      .select()
      .from(companyDrivers)
      .where(eq(companyDrivers.id, driverId))
      .limit(1);

    if (!driver) return res.json({ data: null });

    // Asignación activa del conductor
    const assignments = await db
      .select()
      .from(companyAssignments)
      .where(eq(companyAssignments.driverId, driverId));

    const active = assignments.find(a => a.status === 'Activa');
    if (!active) return res.json({ data: { driver, vehicle: null, assignment: null } });

    const [vehicle] = await db
      .select()
      .from(companyAssets)
      .where(inArray(companyAssets.id, [active.assetId]))
      .limit(1);

    res.json({ data: { driver, vehicle, assignment: active } });
  } catch (err) { next(err); }
});

// ────────────────────────────────────────────────────────────────────────
//  Fase 3: 9 endpoints más para cubrir los 11 submódulos restantes
//  (seguros, checklists, aceite, inventario, A/C, auditoría)
// ────────────────────────────────────────────────────────────────────────

/** GET /dashboard-extended/polizas-por-vencer
 * Devuelve cuántas pólizas vencen en 30/60/90 días. */
router.get('/dashboard-extended/polizas-por-vencer', requireModule('dashboard'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const rows = await db
      .select()
      .from(companyInsurancePolicies)
      .where(eq(companyInsurancePolicies.companyId, companyId));

    const now = new Date();
    const addDays = (d: Date, days: number) => {
      const x = new Date(d);
      x.setDate(x.getDate() + days);
      return x;
    };

    let d30 = 0, d60 = 0, d90 = 0, vigentes = 0, vencidas = 0;
    const lista: Array<{ assetId: number; insurer: string; policyNumber: string; endDate: string; daysLeft: number }> = [];
    const assetIds = [...new Set(rows.map(r => r.assetId))];
    const assets = assetIds.length
      ? await db.select().from(companyAssets).where(inArray(companyAssets.id, assetIds))
      : [];
    const assetMap = new Map(assets.map(a => [a.id, a]));

    for (const p of rows) {
      const end = new Date(p.endDate);
      const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diff < 0) vencidas++;
      else if (diff <= 30) d30++;
      else if (diff <= 60) d60++;
      else if (diff <= 90) d90++;
      else vigentes++;
      if (diff >= 0 && diff <= 90) {
        const a = assetMap.get(p.assetId);
        lista.push({
          assetId: p.assetId,
          insurer: p.insurer,
          policyNumber: p.policyNumber,
          endDate: p.endDate,
          daysLeft: diff,
          plate: a?.plate ?? null,
          assetName: a?.name ?? null,
        });
      }
    }

    res.json({
      data: [
        { name: 'Vencidas',         value: vencidas },
        { name: 'Vence en 30 días',  value: d30 },
        { name: 'Vence en 60 días',  value: d60 },
        { name: 'Vence en 90 días',  value: d90 },
        { name: 'Vigentes (+90d)',  value: vigentes },
      ],
      total: rows.length,
      proximas: lista.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 10),
    });
  } catch (err) { next(err); }
});

/** GET /dashboard-extended/cobertura-activos
 * Porcentaje de activos que tienen al menos una póliza vigente. */
router.get('/dashboard-extended/cobertura-activos', requireModule('dashboard'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const [assets, policies] = await Promise.all([
      db.select().from(companyAssets).where(eq(companyAssets.companyId, companyId)),
      db.select().from(companyInsurancePolicies).where(eq(companyInsurancePolicies.companyId, companyId)),
    ]);

    const now = new Date();
    const covered = new Set<number>();
    for (const p of policies) {
      const end = new Date(p.endDate);
      if (end >= now) covered.add(p.assetId);
    }
    const total = assets.length;
    const coveredCount = assets.filter(a => covered.has(a.id)).length;
    const pct = total > 0 ? Math.round((coveredCount / total) * 100) : 0;

    res.json({
      data: [
        { name: 'Con cobertura', value: coveredCount },
        { name: 'Sin cobertura', value: total - coveredCount },
      ],
      total,
      coveragePercent: pct,
    });
  } catch (err) { next(err); }
});

/** GET /dashboard-extended/kpis-checklists */
router.get('/dashboard-extended/kpis-checklists', requireModule('dashboard'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const rows = await db
      .select()
      .from(companyChecklists)
      .where(eq(companyChecklists.companyId, companyId));

    const today = new Date().toISOString().slice(0, 10);
    let todayCount = 0, aprobadas = 0, observadas = 0, pendientes = 0, total = rows.length;
    for (const c of rows) {
      const isoDate = c.date instanceof Date ? c.date.toISOString().slice(0, 10) : String(c.date);
      if (isoDate === today) todayCount++;
      if (c.status === 'Aprobado') aprobadas++;
      else if (c.status === 'Con anomalías' || c.status === 'Observado') observadas++;
      else if (c.status === 'Pendiente') pendientes++;
    }
    res.json({
      data: [
        { name: 'Hoy',         value: todayCount },
        { name: 'Aprobadas',   value: aprobadas },
        { name: 'Con anomalías', value: observadas },
        { name: 'Pendientes',  value: pendientes },
      ],
      total,
    });
  } catch (err) { next(err); }
});

/** GET /dashboard-extended/checklists-pendientes */
router.get('/dashboard-extended/checklists-pendientes', requireModule('dashboard'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const limit = Math.min(50, Number(req.query.limit ?? 10));
    const rows = await db
      .select()
      .from(companyChecklists)
      .where(and(
        eq(companyChecklists.companyId, companyId),
        eq(companyChecklists.status, 'Pendiente'),
      ))
      .orderBy(desc(companyChecklists.date))
      .limit(limit);

    const assetIds = [...new Set(rows.filter(r => r.assetId != null).map(r => r.assetId!))];
    const assets = assetIds.length
      ? await db.select().from(companyAssets).where(inArray(companyAssets.id, assetIds))
      : [];
    const aMap = new Map(assets.map(a => [a.id, a]));

    res.json({
      data: rows.map(r => ({
        id: r.id,
        date: r.date,
        targetKind: r.targetKind,
        targetLabel: r.targetLabel,
        plate: r.assetId ? aMap.get(r.assetId)?.plate ?? null : null,
        assetName: r.assetId ? aMap.get(r.assetId)?.name ?? null : null,
        summary: r.summary,
      })),
      total: rows.length,
    });
  } catch (err) { next(err); }
});

/** GET /dashboard-extended/proximo-cambio-aceite
 * Vehículos cuyo último cambio de aceite está cerca del umbral de next_reading. */
router.get('/dashboard-extended/proximo-cambio-aceite', requireModule('dashboard'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const [rows, assets] = await Promise.all([
      db.select().from(companyOilChanges).where(eq(companyOilChanges.companyId, companyId)),
      db.select().from(companyAssets).where(eq(companyAssets.companyId, companyId)),
    ]);
    const aMap = new Map(assets.map(a => [a.id, a]));

    // Para cada asset, quedarse con el último cambio (mayor reading)
    const byAsset = new Map<number, typeof rows[number]>();
    for (const o of rows) {
      const cur = byAsset.get(o.assetId);
      if (!cur || Number(o.reading) > Number(cur.reading)) byAsset.set(o.assetId, o);
    }

    const items = Array.from(byAsset.values()).map(o => {
      const a = aMap.get(o.assetId);
      const threshold = Number(o.nextReading);
      const current = a ? Number((a as any).odometer ?? 0) : 0; // puede ser 0 si la columna es distinta
      const diff = threshold - current;
      return {
        assetId: o.assetId,
        plate: a?.plate ?? '—',
        assetName: a?.name ?? '—',
        lastChange: o.date,
        lastReading: Number(o.reading),
        nextReading: threshold,
        kmToNext: diff,
        overdue: diff <= 0,
      };
    })
    .filter(x => x.kmToNext <= 1000) // km para que aparezca como "próximo"
    .sort((a, b) => a.kmToNext - b.kmToNext)
    .slice(0, 15);

    res.json({
      data: items,
      total: items.length,
    });
  } catch (err) { next(err); }
});

/** GET /dashboard-extended/inventario-bajo */
router.get('/dashboard-extended/inventario-bajo', requireModule('dashboard'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const rows = await db
      .select()
      .from(companyInventory)
      .where(eq(companyInventory.companyId, companyId));

    const items = rows
      .map(r => {
        const stock = Number(r.stock ?? 0);
        const min = Number(r.minStock ?? 0);
        return {
          id: r.id,
          code: r.code,
          name: r.name,
          category: r.category,
          stock,
          minStock: min,
          unit: r.unit,
          location: r.location,
          deficit: Math.max(0, min - stock),
        };
      })
      .filter(x => x.minStock > 0 && x.stock < x.minStock)
      .sort((a, b) => b.deficit - a.deficit);

    res.json({
      data: items,
      total: items.length,
    });
  } catch (err) { next(err); }
});

/** GET /dashboard-extended/kpis-ac */
router.get('/dashboard-extended/kpis-ac', requireModule('dashboard'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const today = new Date();
    const in30 = new Date(today); in30.setDate(today.getDate() + 30);
    const isoToday = today.toISOString().slice(0, 10);
    const isoIn30 = in30.toISOString().slice(0, 10);

    const [units, services] = await Promise.all([
      db.select().from(companyAcUnits).where(eq(companyAcUnits.companyId, companyId)),
      db.select().from(companyAcServices).where(eq(companyAcServices.companyId, companyId)),
    ]);

    // Por cada unidad, último servicio
    const lastByUnit = new Map<number, typeof services[number]>();
    for (const s of services) {
      const cur = lastByUnit.get(s.unitId);
      if (!cur || new Date(s.date) > new Date(cur.date)) lastByUnit.set(s.unitId, s);
    }

    let operativos = 0, enMantenimiento = 0, fuera = 0;
    let pendientesServicio = 0;
    for (const u of units) {
      const s = (u.status ?? '').toLowerCase();
      if (s.includes('operativ') || s === 'activo' || s === '') operativos++;
      else if (s.includes('mantenimiento')) enMantenimiento++;
      else fuera++;
      const next = u.nextService instanceof Date ? u.nextService.toISOString().slice(0, 10) : String(u.nextService ?? '');
      if (next && next <= isoIn30) pendientesServicio++;
    }

    res.json({
      data: [
        { name: 'Operativos',         value: operativos },
        { name: 'En mantenimiento',   value: enMantenimiento },
        { name: 'Fuera de servicio',   value: fuera },
        { name: 'Servicio próximo',   value: pendientesServicio },
      ],
      total: units.length,
    });
  } catch (err) { next(err); }
});

/** GET /dashboard-extended/servicios-ac-pendientes */
router.get('/dashboard-extended/servicios-ac-pendientes', requireModule('dashboard'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const today = new Date();
    const in60 = new Date(today); in60.setDate(today.getDate() + 60);
    const isoIn60 = in60.toISOString().slice(0, 10);

    const units = await db
      .select()
      .from(companyAcUnits)
      .where(and(
        eq(companyAcUnits.companyId, companyId),
        lte(companyAcUnits.nextService, isoIn60),
      ))
      .orderBy(companyAcUnits.nextService);

    res.json({
      data: units.map(u => ({
        id: u.id,
        code: u.code,
        name: u.name,
        brand: u.brand,
        model: u.model,
        nextService: u.nextService,
        status: u.status,
        technician: u.technician,
      })),
      total: units.length,
    });
  } catch (err) { next(err); }
});

/** GET /dashboard-extended/actividad-por-usuario
 * Top N usuarios por cantidad de acciones en company_audit_entries.
 * Devuelve { actorName, count } — el frontend lo renderiza con tabla. */
router.get('/dashboard-extended/actividad-por-usuario', requireModule('dashboard'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const limit = Math.min(50, Number(req.query.limit ?? 10));
    const rows = await db
      .select()
      .from(companyAuditEntries)
      .where(eq(companyAuditEntries.companyId, companyId));

    const byActor = new Map<string, { name: string; count: number }>();
    for (const r of rows) {
      const key = r.actorId?.toString() ?? 'anon';
      const display = r.actorName ?? 'Anónimo';
      const cur = byActor.get(key) ?? { name: display, count: 0 };
      cur.count++;
      cur.name = display;
      byActor.set(key, cur);
    }
    const items = Array.from(byActor.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(x => ({ actorName: x.name, count: x.count }));

    res.json({ data: items, total: rows.length });
  } catch (err) { next(err); }
});

/** GET /dashboard-extended/actividad-por-entidad
 * Top N pares (entity, action) por cantidad en company_audit_entries.
 * Devuelve { entity, action, count } separado para que el frontend lo
 * mapee a etiquetas legibles con color por entidad. */
router.get('/dashboard-extended/actividad-por-entidad', requireModule('dashboard'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const limit = Math.min(50, Number(req.query.limit ?? 10));
    const rows = await db
      .select()
      .from(companyAuditEntries)
      .where(eq(companyAuditEntries.companyId, companyId));

    const byEntity = new Map<string, { entity: string; action: string; count: number }>();
    for (const r of rows) {
      const key = `${r.entity}:${r.action}`;
      const cur = byEntity.get(key) ?? { entity: r.entity, action: r.action, count: 0 };
      cur.count++;
      byEntity.set(key, cur);
    }
    const items = Array.from(byEntity.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(x => ({ entity: x.entity, action: x.action, count: x.count }));

    res.json({ data: items, total: rows.length });
  } catch (err) { next(err); }
});

// ─── GET /company/:id/analytics/maintenance-costs-by-workshop ──────────────────
// Gasto en mano de obra agrupado por taller. Solo suma el `labor_cost`
// (NO incluye repuestos — esos van en `maintenance-costs`).
router.get('/maintenance-costs-by-workshop', requireModule('mantenimiento'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { from, to, workshopId } = req.query as Record<string, string | undefined>;

    const whereParts: any[] = [eq(companyMaintenanceRecords.companyId, companyId)];
    if (from)   whereParts.push(gte(companyMaintenanceRecords.scheduledFor, new Date(from)));
    if (to)     whereParts.push(lte(companyMaintenanceRecords.scheduledFor, new Date(to)));
    if (workshopId) whereParts.push(eq(companyMaintenanceRecords.workshopId, parseInt(workshopId, 10)));

    const rows = await db
      .select({
        workshopId: companyMaintenanceRecords.workshopId,
        workshopName: companyWorkshops.name,
        laborCost: companyMaintenanceRecords.laborCost,
        type: companyMaintenanceRecords.type,
        totalCost: companyMaintenanceRecords.totalCost,
      })
      .from(companyMaintenanceRecords)
      .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
      .where(and(...whereParts));

    const byWorkshop: Record<string, { workshopId: number | null; name: string; laborTotal: number; partsTotal: number; count: number }> = {};
    let grandLabor = 0;
    let grandParts = 0;
    for (const r of rows) {
      const key = r.workshopId ? String(r.workshopId) : 'sin-taller';
      if (!byWorkshop[key]) {
        byWorkshop[key] = {
          workshopId: r.workshopId,
          name: r.workshopName ?? 'Sin taller',
          laborTotal: 0,
          partsTotal: 0,
          count: 0,
        };
      }
      const labor = Number(r.laborCost ?? 0);
      const parts = Number(r.totalCost ?? 0) - labor; // total = labor + parts (en mantenimientos)
      byWorkshop[key].laborTotal += labor;
      byWorkshop[key].partsTotal += parts;
      byWorkshop[key].count += 1;
      grandLabor += labor;
      grandParts += parts;
    }

    res.json({
      grandTotal: Math.round((grandLabor + grandParts) * 100) / 100,
      grandLabor: Math.round(grandLabor * 100) / 100,
      grandParts:  Math.round(grandParts  * 100) / 100,
      workshops: Object.values(byWorkshop).map((w) => ({
        workshopId: w.workshopId,
        name: w.name,
        laborCost: Math.round(w.laborTotal * 100) / 100,
        partsCost: Math.round(w.partsTotal * 100) / 100,
        totalCost: Math.round((w.laborTotal + w.partsTotal) * 100) / 100,
        count: w.count,
      })),
    });
  } catch (err) { next(err); }
});

// ─── GET /company/:id/analytics/carwash-costs ─────────────────────────────────
// Gasto en lavadas agrupado por vehículo y por mes.
// Suma el `totalCost` de los mantenimientos type='Lavada'.
router.get('/carwash-costs', requireModule('mantenimiento'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { from, to, assetId } = req.query as Record<string, string | undefined>;

    const whereParts: any[] = [
      eq(companyMaintenanceRecords.companyId, companyId),
      eq(companyMaintenanceRecords.type, 'Lavada'),
    ];
    if (from)   whereParts.push(gte(companyMaintenanceRecords.scheduledFor, new Date(from)));
    if (to)     whereParts.push(lte(companyMaintenanceRecords.scheduledFor, new Date(to)));
    if (assetId) whereParts.push(eq(companyMaintenanceRecords.assetId, parseInt(assetId, 10)));

    const rows = await db
      .select({
        assetId:    companyMaintenanceRecords.assetId,
        assetName:  companyAssets.name,
        assetPlate: companyAssets.plate,
        totalCost:  companyMaintenanceRecords.totalCost,
        scheduledFor: companyMaintenanceRecords.scheduledFor,
      })
      .from(companyMaintenanceRecords)
      .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
      .where(and(...whereParts));

    const byAsset: Record<string, { assetId: number | null; name: string; plate: string | null; total: number; count: number }> = {};
    const byMonth: Record<string, number> = {};
    let grand = 0;
    for (const r of rows) {
      const key = r.assetId ? String(r.assetId) : 'sin-vehiculo';
      if (!byAsset[key]) {
        byAsset[key] = { assetId: r.assetId, name: r.assetName ?? 'Sin vehículo', plate: r.assetPlate, total: 0, count: 0 };
      }
      byAsset[key].total += Number(r.totalCost ?? 0);
      byAsset[key].count += 1;
      grand += Number(r.totalCost ?? 0);

      if (r.scheduledFor) {
        const d = new Date(r.scheduledFor);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        byMonth[ym] = (byMonth[ym] ?? 0) + Number(r.totalCost ?? 0);
      }
    }

    res.json({
      grandTotal: Math.round(grand * 100) / 100,
      byVehicle: Object.values(byAsset).map((v) => ({
        assetId: v.assetId,
        name: v.name,
        plate: v.plate,
        total: Math.round(v.total * 100) / 100,
        count: v.count,
      })),
      byMonth: Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, total]) => ({ month, total: Math.round(total * 100) / 100 })),
    });
  } catch (err) { next(err); }
});

// ─── GET /company/:id/analytics/maintenance-costs-by-type ────────────────────
// Gasto total (mano de obra + repuestos) agrupado por tipo de mantenimiento
// (Programado, Correctivo, Lavada) y por mes. Filtros: from, to.
router.get('/maintenance-costs-by-type', requireModule('mantenimiento'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { from, to } = req.query as Record<string, string | undefined>;

    const whereParts: any[] = [eq(companyMaintenanceRecords.companyId, companyId)];
    if (from) whereParts.push(gte(companyMaintenanceRecords.scheduledFor, new Date(from)));
    if (to)   whereParts.push(lte(companyMaintenanceRecords.scheduledFor, new Date(to)));

    const rows = await db
      .select({
        type:        companyMaintenanceRecords.type,
        totalCost:   companyMaintenanceRecords.totalCost,
        laborCost:   companyMaintenanceRecords.laborCost,
        scheduledFor: companyMaintenanceRecords.scheduledFor,
      })
      .from(companyMaintenanceRecords)
      .where(and(...whereParts));

    const byType: Record<string, { total: number; count: number }> = {};
    const byMonth: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const t = r.type ?? 'Programado';
      if (!byType[t]) byType[t] = { total: 0, count: 0 };
      byType[t].total += Number(r.totalCost ?? 0);
      byType[t].count += 1;
      if (r.scheduledFor) {
        const d = new Date(r.scheduledFor);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!byMonth[ym]) byMonth[ym] = {};
        byMonth[ym][t] = (byMonth[ym][t] ?? 0) + Number(r.totalCost ?? 0);
      }
    }

    res.json({
      byType: Object.entries(byType).map(([type, v]) => ({
        type,
        total: Math.round(v.total * 100) / 100,
        count: v.count,
      })),
      byMonth: Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, byType]) => ({
          month,
          byType: Object.fromEntries(
            Object.entries(byType).map(([k, v]) => [k, Math.round(v * 100) / 100])
          ),
        })),
    });
  } catch (err) { next(err); }
});

export default router;