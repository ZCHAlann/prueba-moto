import { Router } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyAssets,
  companyMaintenances,
  companyFuelEntries,
  companyAlerts,
  companyDrivers,
  companyChecklists,
  companyAuditEntries,
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
    ] = await Promise.all([
      db.select().from(companyAssets).where(eq(companyAssets.companyId, companyId)),
      db.select().from(companyMaintenances).where(eq(companyMaintenances.companyId, companyId)),
      db.select().from(companyFuelEntries).where(eq(companyFuelEntries.companyId, companyId)),
      db.select().from(companyAlerts).where(eq(companyAlerts.companyId, companyId)),
      db.select().from(companyDrivers).where(eq(companyDrivers.companyId, companyId)),
      db.select().from(companyChecklists).where(eq(companyChecklists.companyId, companyId)),
      db.select().from(companyAuditEntries)
        .where(eq(companyAuditEntries.companyId, companyId))
        .orderBy(desc(companyAuditEntries.createdAt))
        .limit(20),
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
    const totalFuelLiters   = fuelRows.reduce((acc, f) => acc + Number(f.liters), 0);
    const totalFuelCost     = fuelRows.filter(f => f.cost !== null).reduce((acc, f) => acc + Number(f.cost), 0);
    const activeAssignments = 0; // extender cuando se traiga companyAssignments
    const totalChecklists   = checklistsRows.length;

    /* ── Charts ─────────────────────────────────────────────────────────── */
    const months = lastNMonths(12);

    /* Combustible por mes (litros + costo) */
    const fuelByMonth: Record<string, { liters: number; cost: number }> = {};
    for (const f of fuelRows) {
      const m = toYearMonth(f.date);
      if (!m) continue;
      if (!fuelByMonth[m]) fuelByMonth[m] = { liters: 0, cost: 0 };
      fuelByMonth[m].liters += Number(f.liters);
      fuelByMonth[m].cost   += f.cost ? Number(f.cost) : 0;
    }

    const fuelOverTime = {
      categories: months.map(monthLabel),
      liters:     months.map(m => Math.round((fuelByMonth[m]?.liters ?? 0) * 100) / 100),
      cost:       months.map(m => Math.round((fuelByMonth[m]?.cost   ?? 0) * 100) / 100),
    };

    /* Mantenimientos por mes (count) */
    const maintByMonth: Record<string, number> = {};
    for (const m of maintenancesRows) {
      const key = toYearMonth(m.scheduledDate ?? m.createdAt);
      if (!key) continue;
      maintByMonth[key] = (maintByMonth[key] ?? 0) + 1;
    }

    const maintenancesByMonth = {
      categories: months.map(monthLabel),
      count:      months.map(m => maintByMonth[m] ?? 0),
      cost: months.map(m => {
        const total = maintenancesRows
          .filter(r => toYearMonth(r.scheduledDate ?? r.createdAt) === m && r.cost !== null)
          .reduce((acc, r) => acc + Number(r.cost), 0);
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
      const k = m.kind ?? 'Sin tipo';
      byKindMap[k] = (byKindMap[k] ?? 0) + 1;
    }
    const maintenancesByKind = Object.entries(byKindMap)
      .map(([name, value]) => ({ name, value }));

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
        totalFuelLiters:  Math.round(totalFuelLiters  * 100) / 100,
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
      .from(companyMaintenances)
      .where(eq(companyMaintenances.companyId, companyId));

    const byKind: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const costByMonth: Record<string, number> = {};

    for (const m of rows) {
      const kind = m.kind ?? 'Sin tipo';
      const status = m.status ?? 'Sin estado';
      const priority = m.priority ?? 'Normal';
      byKind[kind] = (byKind[kind] ?? 0) + 1;
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      byPriority[priority] = (byPriority[priority] ?? 0) + 1;

      if (m.cost && m.completedDate) {
        const month = m.completedDate.slice(0, 7); // "YYYY-MM"
        costByMonth[month] = (costByMonth[month] ?? 0) + Number(m.cost);
      }
    }

    const totalCost = rows
      .filter((m) => m.cost !== null)
      .reduce((acc, m) => acc + Number(m.cost), 0);

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

    const byMonth: Record<string, { liters: number; cost: number; entries: number }> = {};
    const byFuelType: Record<string, number> = {};
    const byAsset: Record<number, { liters: number; cost: number }> = {};

    for (const f of rows) {
      const month = f.date.slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { liters: 0, cost: 0, entries: 0 };
      byMonth[month].liters += Number(f.liters);
      byMonth[month].cost += f.cost ? Number(f.cost) : 0;
      byMonth[month].entries += 1;

      const fuelType = f.fuelType ?? 'Sin tipo';
      byFuelType[fuelType] = (byFuelType[fuelType] ?? 0) + Number(f.liters);

      if (!byAsset[f.assetId]) byAsset[f.assetId] = { liters: 0, cost: 0 };
      byAsset[f.assetId].liters += Number(f.liters);
      byAsset[f.assetId].cost += f.cost ? Number(f.cost) : 0;
    }

    const totalLiters = rows.reduce((acc, f) => acc + Number(f.liters), 0);
    const totalCost = rows
      .filter((f) => f.cost !== null)
      .reduce((acc, f) => acc + Number(f.cost), 0);

    res.json({
      total: rows.length,
      totalLiters: Math.round(totalLiters * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      byMonth: Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({
          month,
          liters: Math.round(v.liters * 100) / 100,
          cost: Math.round(v.cost * 100) / 100,
          entries: v.entries,
        })),
      byFuelType: Object.entries(byFuelType).map(([label, liters]) => ({
        label,
        liters: Math.round(liters * 100) / 100,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;