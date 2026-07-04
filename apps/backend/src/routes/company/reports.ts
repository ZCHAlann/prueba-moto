// routes/company/reports.ts
// Endpoints JSON para alimentar la generación de PDFs client-side con
// @react-pdf/renderer (mismo motor que ActaPdf de Asignaciones).
// El server-side rendering con jspdf queda como legacy/backup al final
// del archivo, por si se requiere en el futuro.

import { Router } from 'express';
import { eq, and, gte, lte, desc, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyMaintenanceRecords,
  companyMaintenanceItems,
  companyMaintenanceReauthorizations,
  companyWorkshops,
  companySuppliers,
  companyAssets,
} from '../../db/schema/operational';
import { requireModule } from '../../middlewares/requireModule';
import { requirePermission } from '../../middlewares/requirePermission';
import { parseId, toId } from '../../lib/ids';

const router = Router({ mergeParams: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadItemsForMaintenanceIds(ids: number[]) {
  if (!ids.length) return new Map<number, any[]>();
  // Antes: traía TODA la tabla company_maintenance_items y filtraba en memoria
  // (secuencial scan + O(N) en JS). Ahora filtra directo en SQL con `inArray`,
  // lo que permite usar el índice (maintenanceId) que crea la migración 0009.
  const all = await db
    .select({
      id:             companyMaintenanceItems.id,
      maintenanceId:  companyMaintenanceItems.maintenanceId,
      supplierId:     companyMaintenanceItems.supplierId,
      supplierName:   companySuppliers.name,
      name:           companyMaintenanceItems.name,
      quantity:       companyMaintenanceItems.quantity,
      unitCost:       companyMaintenanceItems.unitCost,
      subtotal:       companyMaintenanceItems.subtotal,
    })
    .from(companyMaintenanceItems)
    .leftJoin(companySuppliers, eq(companySuppliers.id, companyMaintenanceItems.supplierId))
    .where(inArray(companyMaintenanceItems.maintenanceId, ids));
  const map = new Map<number, any[]>();
  for (const it of all) {
    if (!map.has(it.maintenanceId)) map.set(it.maintenanceId, []);
    map.get(it.maintenanceId)!.push({
      id:            toId('maintenance-item', it.id),
      maintenanceId: toId('maintenance', it.maintenanceId),
      supplierId:    it.supplierId ? toId('supplier', it.supplierId) : null,
      supplierName:  it.supplierName,
      name:          it.name,
      quantity:      Number(it.quantity),
      unitCost:      Number(it.unitCost),
      subtotal:      Number(it.subtotal),
    });
  }
  return map;
}

function serializeMaintenance(m: any, items: any[]) {
  return {
    id:            toId('maintenance', m.id),
    companyId:     toId('company', m.companyId),
    assetId:       toId('asset', m.assetId),
    assetName:     m.assetName,
    assetPlate:    m.assetPlate,
    workshopId:    m.workshopId ? toId('workshop', m.workshopId) : null,
    workshopName:  m.workshopName,
    type:          m.type,
    status:        m.status,
    category:      m.category,
    title:         m.title,
    description:   m.description,
    odometerKm:    m.odometerKm,
    cadenceKind:   m.cadenceKind,
    cadenceValue:  m.cadenceValue,
    nextTriggerKm: m.nextTriggerKm,
    scheduledFor:  m.scheduledFor,
    executedAt:    m.executedAt,
    completedAt:   m.completedAt,
    notes:         m.notes,
    totalCost:     Number(m.totalCost),
    parentId:      m.parentId ? toId('maintenance', m.parentId) : null,
    createdBy:     m.createdBy ? toId('company-user', m.createdBy) : null,
    completedBy:   m.completedBy ? toId('company-user', m.completedBy) : null,
    createdAt:     m.createdAt,
    updatedAt:     m.updatedAt,
    items,
  };
}

// ─── GET /company/:id/reports/maintenance.json ────────────────────────────────
// Devuelve los mantenimientos en un rango (rango opcional, default = próximos 90 días).
// El frontend usa esto para armar el PDF con @react-pdf/renderer.

router.get(
  '/maintenance.json',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'records', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const from = (req.query.from as string) ? new Date(req.query.from as string) : new Date();
      const to   = (req.query.to   as string) ? new Date(req.query.to   as string) : (() => { const d = new Date(); d.setDate(d.getDate() + 90); return d; })();

      const where: any[] = [
        eq(companyMaintenanceRecords.companyId, companyId),
        gte(companyMaintenanceRecords.scheduledFor, from),
        lte(companyMaintenanceRecords.scheduledFor, to),
      ];

      const rows = await db
        .select({
          m: companyMaintenanceRecords,
          assetName:  companyAssets.name,
          assetPlate: companyAssets.plate,
          workshopName: companyWorkshops.name,
        })
        .from(companyMaintenanceRecords)
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
        .where(and(...where))
        .orderBy(desc(companyMaintenanceRecords.scheduledFor));

      const itemsMap = await loadItemsForMaintenanceIds(rows.map((r) => r.m.id));
      res.json({
        data: rows.map((r) => serializeMaintenance(r.m, itemsMap.get(r.m.id) ?? [])),
        total: rows.length,
        range: { from: from.toISOString(), to: to.toISOString() },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /company/:id/reports/maintenance/workshop.json ───────────────────────

router.get(
  '/maintenance/workshop.json',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'records', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const workshopId = parseId('workshop', req.query.workshopId as string);
      const from = (req.query.from as string) ? new Date(req.query.from as string) : null;
      const to   = (req.query.to   as string) ? new Date(req.query.to   as string) : null;

      const where: any[] = [
        eq(companyMaintenanceRecords.companyId, companyId),
        eq(companyMaintenanceRecords.workshopId, workshopId),
      ];
      if (from) where.push(gte(companyMaintenanceRecords.scheduledFor, from));
      if (to)   where.push(lte(companyMaintenanceRecords.scheduledFor, to));

      const [workshop] = await db
        .select()
        .from(companyWorkshops)
        .where(and(eq(companyWorkshops.id, workshopId), eq(companyWorkshops.companyId, companyId)))
        .limit(1);
      if (!workshop) return res.status(404).json({ error: 'Taller no encontrado' });

      const rows = await db
        .select({
          m: companyMaintenanceRecords,
          assetName:  companyAssets.name,
          assetPlate: companyAssets.plate,
          workshopName: companyWorkshops.name,
        })
        .from(companyMaintenanceRecords)
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
        .where(and(...where))
        .orderBy(desc(companyMaintenanceRecords.scheduledFor));

      const itemsMap = await loadItemsForMaintenanceIds(rows.map((r) => r.m.id));
      res.json({
        workshop: { id: toId('workshop', workshop.id), name: workshop.name, nit: workshop.nit },
        data: rows.map((r) => serializeMaintenance(r.m, itemsMap.get(r.m.id) ?? [])),
        total: rows.length,
        range: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /company/:id/reports/maintenance/supplier.json ──────────────────────

router.get(
  '/maintenance/supplier.json',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'records', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const supplierId = parseId('supplier', req.query.supplierId as string);
      const from = (req.query.from as string) ? new Date(req.query.from as string) : null;
      const to   = (req.query.to   as string) ? new Date(req.query.to   as string) : null;

      const [supplier] = await db
        .select()
        .from(companySuppliers)
        .where(and(eq(companySuppliers.id, supplierId), eq(companySuppliers.companyId, companyId)))
        .limit(1);
      if (!supplier) return res.status(404).json({ error: 'Proveedor no encontrado' });

      // Items del proveedor con su mantenimiento asociado
      const itemsWhere: any[] = [eq(companyMaintenanceItems.supplierId, supplierId)];
      const maintWhere: any[] = [eq(companyMaintenanceRecords.companyId, companyId)];
      if (from) maintWhere.push(gte(companyMaintenanceRecords.scheduledFor, from));
      if (to)   maintWhere.push(lte(companyMaintenanceRecords.scheduledFor, to));

      const items = await db
        .select({
          i: companyMaintenanceItems,
          m: companyMaintenanceRecords,
          assetName:  companyAssets.name,
          assetPlate: companyAssets.plate,
        })
        .from(companyMaintenanceItems)
        .innerJoin(companyMaintenanceRecords, eq(companyMaintenanceRecords.id, companyMaintenanceItems.maintenanceId))
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .where(and(...itemsWhere, ...maintWhere))
        .orderBy(desc(companyMaintenanceRecords.scheduledFor));

      res.json({
        supplier: { id: toId('supplier', supplier.id), name: supplier.name, nit: supplier.nit },
        data: items.map((r) => ({
          maintenance: serializeMaintenance(r.m, []),
          item: {
            id:        toId('maintenance-item', r.i.id),
            name:      r.i.name,
            quantity:  Number(r.i.quantity),
            unitCost:  Number(r.i.unitCost),
            subtotal:  Number(r.i.subtotal),
          },
        })),
        total: items.length,
        totalCost: items.reduce((acc, r) => acc + Number(r.i.subtotal), 0),
        range: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /company/:id/reports/maintenance/reauthorizations.json ───────────────
// Jun 2026 — Reporte de reautorizaciones de mantenimiento. Alimenta la pantalla
// /reportes/reautorizaciones. Caller necesita permiso `mantenimiento.records.ver`
// o `mantenimiento.reautorizaciones.editar` (los aprobadores).
router.get(
  '/maintenance/reauthorizations.json',
  requireModule('mantenimiento'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const status = (req.query.status as string | undefined) ?? 'all';
      const from   = (req.query.from   as string | undefined) ?? null;
      const to     = (req.query.to     as string | undefined) ?? null;
      const meId   = Number(req.user!.sub.split('-')[1] ?? '0') || null;
      const meRole = req.user!.role ?? '';

      const conds: any[] = [eq(companyMaintenanceReauthorizations.companyId, companyId)];

      if (status !== 'all') {
        conds.push(eq(companyMaintenanceReauthorizations.status, status as any));
      }
      if (from) conds.push(gte(companyMaintenanceReauthorizations.createdAt, new Date(from)));
      if (to)   conds.push(lte(companyMaintenanceReauthorizations.createdAt, new Date(to)));

      // No-aprobadores solo ven sus propias solicitudes. owner_empresa /
      // admin_empresa / superadmin pasan por bypass en requirePermission (que
      // en realidad no usamos acá — `requireModule('mantenimiento')` solo
      // exige el módulo. El gate fino se hace acá.).
      const isApprover =
        meRole === 'superadmin' ||
        meRole === 'owner_empresa' ||
        meRole === 'admin_empresa';
      if (!isApprover && meId != null) {
        conds.push(eq(companyMaintenanceReauthorizations.requestedByUserId, meId));
      }

      const rows = await db
        .select({
          r:  companyMaintenanceReauthorizations,
          assetName:  companyAssets.name,
          assetPlate: companyAssets.plate,
        })
        .from(companyMaintenanceReauthorizations)
        .leftJoin(
          companyMaintenanceRecords,
          eq(companyMaintenanceRecords.id, companyMaintenanceReauthorizations.maintenanceId),
        )
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .where(and(...conds))
        .orderBy(desc(companyMaintenanceReauthorizations.createdAt))
        .limit(1000);

      res.json({
        data: rows.map((row) => ({
          id:                       toId('reauth', row.r.id),
          maintenanceId:            toId('maintenance', row.r.maintenanceId),
          assetName:                row.assetName ?? null,
          assetPlate:               row.assetPlate ?? null,
          action:                   row.r.action,
          status:                   row.r.status,
          reason:                   row.r.reason,
          requestedByUserId:        row.r.requestedByUserId ? toId('company-user', row.r.requestedByUserId) : null,
          requestedByName:          row.r.requestedByName ?? null,
          requestedByRole:          row.r.requestedByRole ?? null,
          decidedByUserId:          row.r.decidedByUserId ? toId('company-user', row.r.decidedByUserId) : null,
          decidedByName:            row.r.decidedByName ?? null,
          decisionNotes:            row.r.decisionNotes ?? null,
          decidedAt:                row.r.decidedAt ? row.r.decidedAt.toISOString() : null,
          maintenanceScheduledFor:  row.r.maintenanceScheduledFor.toISOString(),
          proposedScheduledFor:     row.r.proposedScheduledFor ? row.r.proposedScheduledFor.toISOString() : null,
          appliedScheduledFor:      row.r.appliedScheduledFor ? row.r.appliedScheduledFor.toISOString() : null,
          createdAt:                row.r.createdAt.toISOString(),
        })),
        total: rows.length,
        range: { from, to },
        filter: { status },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
