// ============================================================================
// routes/company/finance-invoices.ts
// ============================================================================
// Endpoints de LECTURA + edición selectiva del módulo Finanzas — el ledger
// `company_invoices` (jul 2026 — reversión del modelo CxP; ahora legajo
// simple de facturas del proveedor, no sistema contable).
//
// Endpoints:
//
//   GET  /company/:id/finance-invoices
//     Listado paginado con filtros:
//       assetId, sourceModule, from, to, invoiceNumber (exacto), supplier (LIKE),
//       invoice_type_id, supplier_id,
//       page (default 1), pageSize (default 15, max 200).
//     Devuelve { total, rows: [...], page, pageSize }. Cada row trae la
//     `source_ref` hidratada (datos del fuel/toll/mantenimiento origen) para
//     que el frontend pueda mostrar "factura de peaje X del 2026-07-05"
//     sin tener que pegar a otra ruta.
//
//   GET  /company/:id/finance-invoices/:id
//     Devuelve UNA fila hidratada del ledger, parseando el id como
//     `invoice-N`. 404 si no existe para esta empresa.
//
//   PATCH /company/:id/finance-invoices/:id/notes
//     Edición SOLO del campo `notes`. Atomic update con WHERE company_id.
//     Registra audit entry. Requiere permiso 'finanzas.facturas.editar'.
//
//   GET  /company/:id/finance-invoices/:id/pdf
//     Genera y descarga el comprobante en PDF formato carta (jsPDF). Devuelve
//     `application/pdf` con Content-Disposition: attachment.
//     Requiere permiso 'finanzas.facturas.ver'.
//
// (jul 2026 — EL ENDPOINT PATCH /:id/status (CxP) FUE REMOVIDO. Las facturas
// no tienen estado de pago en este sistema. Para "anular" una factura, usar
// el campo legacy `status` directamente.)
//
// INVARIANTES DE SEGURIDAD:
//   - companyId SIEMPRE viene de req.companyId (del JWT), nunca del body.
//   - sourceModule del query se valida contra whitelist (evita inyección).
//   - from/to se validan con regex YYYY-MM-DD.
//   - page/pageSize se clampa a [1, 200] (default 15).
//   - invoiceNumber del query es búsqueda EXACTA (no LIKE).
//   - supplier del query es LIKE %x% (case-insensitive).
//   - invoice_type_id / supplier_id del query se validan contra whitelists.
// ============================================================================

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, gte, lte, ilike, sql, inArray, desc, or } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyInvoices,
  companyFuelEntries,
  companyTollEntries,
  companyMaintenanceRecords,
  companyAssets,
  companyInvoiceTypes,
  companySuppliers,
} from '../../db/schema/operational';
import { requirePermission } from '../../middlewares/requirePermission';
import { AppError, NotFoundError } from '../../lib/errors';
import { toId, parseId, parseIdFlexible } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { buildInvoicePDF } from '../../lib/invoice-pdf';
import type { InvoicePdfInput } from '../../lib/invoice-pdf';

const router = Router({ mergeParams: true });

// ─── Whitelists / tipos ──────────────────────────────────────────────────────
//
// Reflejan los enums en `db/schema/operational.ts`. Si en el futuro se agregan
// valores a los pgEnums, actualizar acá también (TS strict se queja).

const SOURCE_MODULES = ['combustible', 'peajes', 'mantenimiento'] as const;
type SourceModule = typeof SOURCE_MODULES[number];

// jul 2026 — el modelo CxP fue removido. NO hay `cxp_status` ni vencimientos
// ni formas de pago. El módulo es un legajo simple de facturas del proveedor.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseSourceModule(raw: unknown): SourceModule | null {
  if (typeof raw !== 'string') return null;
  return (SOURCE_MODULES as readonly string[]).includes(raw)
    ? (raw as SourceModule)
    : null;
}

function parseDateLoose(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (!DATE_RE.test(raw)) return null;
  return raw;
}

function clampInt(raw: unknown, def: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

/**
 * `companyId` puede ser `undefined` teóricamente (si una middleware no
 * setea el augment de tipos). Usamos un AppError 403 explícito para no
 * filtrar existencia del recurso y para que el shape del error sea
 * consistente con el resto de la app.
 */
function ensureCompanyId(value: number | undefined): number {
  if (value == null) throw new AppError(403, 'companyId ausente en sesión');
  return value;
}

// ─── Serializer ──────────────────────────────────────────────────────────────
//
// Shape uniforme que consume el frontend. La `source_ref` se hidrata con
// los datos display-only del recurso origen (no son parte del contrato
// del ledger pero hacen el listado 100% self-contained).

function serializeInvoice(
  row: typeof companyInvoices.$inferSelect,
  sourceRef: Record<string, unknown> | null,
  denorm: {
    invoiceTypeName: string | null;
    invoiceTypeIsActive: boolean | null;
    supplierCanonicalName: string | null;
    supplierNit: string | null;
  } = {
    invoiceTypeName: null,
    invoiceTypeIsActive: null,
    supplierCanonicalName: null,
    supplierNit: null,
  },
) {
  // supplierName: si hay FK al supplier, usamos el nombre canónico del catálogo.
  // Si no, caemos al texto libre (legacy). El frontend prefiere siempre el
  // canónico cuando está disponible.
  const supplierDisplayName =
    denorm.supplierCanonicalName ?? row.supplierName ?? null;

  return {
    id:                  toId('invoice', row.id),
    companyId:           toId('company', row.companyId),
    sourceModule:        row.sourceModule,
    sourceEntityId:      row.sourceEntityId,
    sourceAttachmentKey: row.sourceAttachmentKey,
    sourceRef,
    kind:                row.kind,
    invoiceNumber:       row.invoiceNumber,
    invoiceDate:         row.invoiceDate,
    amount:              Number(row.amount),
    currency:            row.currency ?? 'USD',
    supplierName:        supplierDisplayName,
    supplierNameLegacy:  row.supplierName ?? null,
    fileUrl:             row.fileUrl ?? null,
    fileMimeType:        row.fileMimeType ?? null,
    status:              row.status,
    notes:               row.notes ?? null,

    // ── jul 2026 — modelo real (NO contable) ─────────────────────────────
    legalNumber:         row.legalNumber ?? null,
    clientTaxId:         row.clientTaxId ?? null,
    invoiceTypeId:       row.invoiceTypeId ? toId('invoice-type', row.invoiceTypeId) : null,
    invoiceTypeName:     denorm.invoiceTypeName,
    invoiceTypeIsActive: denorm.invoiceTypeIsActive,
    supplierId:          row.supplierId ? toId('supplier', row.supplierId) : null,
    supplierNit:         denorm.supplierNit,

    createdAt:           row.createdAt,
    updatedAt:           row.updatedAt,
  };
}

// ─── Hidratación de source_ref ───────────────────────────────────────────────
//
// Para cada fila del ledger, agregamos los datos display-only de su entidad
// origen (fuel / toll / maintenance). Esto evita que el frontend tenga que
// resolver N requests adicionales para mostrar el listado.
//
// Optimización: agrupamos las hydrations por sourceModule y hacemos una
// query batch por módulo. Para 200 rows (cap de limit) son 1-3 queries
// extra en vez de 200.

interface HydrationInput {
  sourceModule: SourceModule;
  sourceEntityId: number;
}

async function hydrateSourceRefs(
  companyId: number,
  inputs: HydrationInput[],
): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();

  const fuelIds = inputs.filter((i) => i.sourceModule === 'combustible').map((i) => i.sourceEntityId);
  const tollIds = inputs.filter((i) => i.sourceModule === 'peajes').map((i) => i.sourceEntityId);
  const maintIds = inputs.filter((i) => i.sourceModule === 'mantenimiento').map((i) => i.sourceEntityId);

  // ── Fuel ────────────────────────────────────────────────────────────────
  let fuelMap = new Map<number, { date: string; assetCode: string | null; assetPlate: string | null }>();
  if (fuelIds.length) {
    const rows = await db
      .select({
        id:    companyFuelEntries.id,
        date:  companyFuelEntries.date,
        assetId: companyFuelEntries.assetId,
      })
      .from(companyFuelEntries)
      .where(and(
        eq(companyFuelEntries.companyId, companyId),
        inArray(companyFuelEntries.id, fuelIds),
      ));
    const assetIds = Array.from(new Set(rows.map((r) => r.assetId)));
    let assetMap = new Map<number, { code: string | null; plate: string | null }>();
    if (assetIds.length) {
      const arows = await db
        .select({ id: companyAssets.id, code: companyAssets.code, plate: companyAssets.plate })
        .from(companyAssets)
        .where(and(
          eq(companyAssets.companyId, companyId),
          inArray(companyAssets.id, assetIds),
        ));
      assetMap = new Map(arows.map((a) => [a.id, { code: a.code, plate: a.plate }]));
    }
    fuelMap = new Map(rows.map((r) => {
      const a = assetMap.get(r.assetId);
      return [r.id, {
        date: r.date,
        assetCode: a?.code ?? null,
        assetPlate: a?.plate ?? null,
      }];
    }));
  }

  // ── Toll ────────────────────────────────────────────────────────────────
  let tollMap = new Map<number, { date: string; tollName: string | null; assetCode: string | null; assetPlate: string | null }>();
  if (tollIds.length) {
    const rows = await db
      .select({
        id:       companyTollEntries.id,
        date:     companyTollEntries.date,
        tollName: companyTollEntries.tollName,
        assetId:  companyTollEntries.assetId,
      })
      .from(companyTollEntries)
      .where(and(
        eq(companyTollEntries.companyId, companyId),
        inArray(companyTollEntries.id, tollIds),
      ));
    const assetIds = Array.from(new Set(rows.map((r) => r.assetId)));
    let assetMap = new Map<number, { code: string | null; plate: string | null }>();
    if (assetIds.length) {
      const arows = await db
        .select({ id: companyAssets.id, code: companyAssets.code, plate: companyAssets.plate })
        .from(companyAssets)
        .where(and(
          eq(companyAssets.companyId, companyId),
          inArray(companyAssets.id, assetIds),
        ));
      assetMap = new Map(arows.map((a) => [a.id, { code: a.code, plate: a.plate }]));
    }
    tollMap = new Map(rows.map((r) => {
      const a = assetMap.get(r.assetId);
      return [r.id, {
        date: r.date,
        tollName: r.tollName,
        assetCode: a?.code ?? null,
        assetPlate: a?.plate ?? null,
      }];
    }));
  }

  // ── Maintenance ────────────────────────────────────────────────────────
  let maintMap = new Map<number, {
    scheduledFor: string;
    completedAt: string | null;
    title: string | null;
    assetCode: string | null;
    assetPlate: string | null;
  }>();
  if (maintIds.length) {
    const rows = await db
      .select({
        id:            companyMaintenanceRecords.id,
        scheduledFor:  companyMaintenanceRecords.scheduledFor,
        completedAt:   companyMaintenanceRecords.completedAt,
        title:         companyMaintenanceRecords.title,
        assetId:       companyMaintenanceRecords.assetId,
      })
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.companyId, companyId),
        inArray(companyMaintenanceRecords.id, maintIds),
      ));
    const assetIds = Array.from(new Set(rows.map((r) => r.assetId)));
    let assetMap = new Map<number, { code: string | null; plate: string | null }>();
    if (assetIds.length) {
      const arows = await db
        .select({ id: companyAssets.id, code: companyAssets.code, plate: companyAssets.plate })
        .from(companyAssets)
        .where(and(
          eq(companyAssets.companyId, companyId),
          inArray(companyAssets.id, assetIds),
        ));
      assetMap = new Map(arows.map((a) => [a.id, { code: a.code, plate: a.plate }]));
    }
    maintMap = new Map(rows.map((r) => {
      const a = assetMap.get(r.assetId);
      const scheduledFor = r.scheduledFor instanceof Date
        ? r.scheduledFor.toISOString().slice(0, 10)
        : String(r.scheduledFor).slice(0, 10);
      const completedAt = r.completedAt instanceof Date
        ? r.completedAt.toISOString().slice(0, 10)
        : r.completedAt
          ? String(r.completedAt).slice(0, 10)
          : null;
      return [r.id, {
        scheduledFor,
        completedAt,
        title: r.title ?? null,
        assetCode: a?.code ?? null,
        assetPlate: a?.plate ?? null,
      }];
    }));
  }

  // ── Stitch ─────────────────────────────────────────────────────────────
  for (const inp of inputs) {
    let ref: Record<string, unknown> | null = null;
    if (inp.sourceModule === 'combustible') {
      const f = fuelMap.get(inp.sourceEntityId);
      if (f) {
        ref = {
          fuelDate:   f.date,
          assetCode:  f.assetCode,
          assetPlate: f.assetPlate,
        };
      }
    } else if (inp.sourceModule === 'peajes') {
      const t = tollMap.get(inp.sourceEntityId);
      if (t) {
        ref = {
          tollDate:   t.date,
          tollName:   t.tollName,
          assetCode:  t.assetCode,
          assetPlate: t.assetPlate,
        };
      }
    } else if (inp.sourceModule === 'mantenimiento') {
      const m = maintMap.get(inp.sourceEntityId);
      if (m) {
        ref = {
          maintenanceScheduledFor: m.scheduledFor,
          maintenanceCompletedAt:   m.completedAt,
          maintenanceTitle:         m.title,
          assetCode:                m.assetCode,
          assetPlate:               m.assetPlate,
        };
      }
    }
    if (ref) out.set(`${inp.sourceModule}:${inp.sourceEntityId}`, ref);
  }

  return out;
}

// ─── Asset filter helper ─────────────────────────────────────────────────────
//
// Si el usuario filtra por assetId, podemos usarlo para reducir filas en el
// ledger sin tener que hidratar las 3 tablas fuentes: hacemos un JOIN a las
// tablas fuentes para que el WHERE filtre del lado SQL. Para cada módulo:
//
//   • combustible    → company_fuel_entries.assetId = X
//   • peajes         → company_toll_entries.assetId = X
//   • mantenimiento  → company_maintenance_records.assetId = X
//
// Estrategia: traer los IDs de las entities que matchean el asset para
// CADA módulo aplicable, y filtrar el ledger con IN (source_module,
// source_entity_id) por módulo. Más caro que un JOIN simple pero mantiene
// el orden estable por fecha y la lógica simétrica entre módulos.

// ─── Denormalización de typeName + supplierName ──────────────────────────────
//
// jul 2026 — el listado devuelve invoiceTypeName y supplierName canónico
// (los joins a company_invoice_types y company_suppliers). En vez de un
// LEFT JOIN row-by-row, hacemos 2 queries batch:
//   1) Traemos todos los tipos referenciados en `rows` (1 query, inArray).
//   2) Traemos todos los suppliers referenciados en `rows` (1 query, inArray).
// y los mapeamos a Maps por id. Esto mantiene el costo en O(2) queries
// independientemente del tamaño del listado.

async function hydrateTypeAndSupplierFull(
  rows: Array<{ invoiceTypeId: number | null; supplierId: number | null }>,
): Promise<{
  types: Map<number, { name: string; isActive: boolean }>;
  suppliers: Map<number, { name: string; nit: string | null }>;
}> {
  const types = new Map<number, { name: string; isActive: boolean }>();
  const suppliers = new Map<number, { name: string; nit: string | null }>();
  const typeIds = Array.from(
    new Set(rows.map((r) => r.invoiceTypeId).filter((v): v is number => v != null)),
  );
  const supplierIds = Array.from(
    new Set(rows.map((r) => r.supplierId).filter((v): v is number => v != null)),
  );

  const queries: Promise<any>[] = [];
  if (typeIds.length) {
    queries.push(
      db
        .select({
          id: companyInvoiceTypes.id,
          name: companyInvoiceTypes.name,
          isActive: companyInvoiceTypes.isActive,
        })
        .from(companyInvoiceTypes)
        .where(inArray(companyInvoiceTypes.id, typeIds)),
    );
  }
  if (supplierIds.length) {
    queries.push(
      db
        .select({
          id: companySuppliers.id,
          name: companySuppliers.name,
          nit: companySuppliers.nit,
        })
        .from(companySuppliers)
        .where(inArray(companySuppliers.id, supplierIds)),
    );
  }

  const results = await Promise.all(queries);
  let i = 0;
  if (typeIds.length) {
    const tRows = results[i++] ?? [];
    for (const t of tRows) types.set(t.id, { name: t.name, isActive: t.isActive });
  }
  if (supplierIds.length) {
    const sRows = results[i++] ?? [];
    for (const s of sRows) suppliers.set(s.id, { name: s.name, nit: s.nit ?? null });
  }
  return { types, suppliers };
}

async function filterEntityIdsByAsset(
  companyId: number,
  sourceModule: SourceModule | null,
  assetId: number,
): Promise<{ module: SourceModule; ids: number[] }[]> {
  const modules: SourceModule[] = sourceModule
    ? [sourceModule]
    : [...SOURCE_MODULES];

  const out: { module: SourceModule; ids: number[] }[] = [];

  for (const mod of modules) {
    let ids: number[] = [];
    if (mod === 'combustible') {
      const rows = await db
        .select({ id: companyFuelEntries.id })
        .from(companyFuelEntries)
        .where(and(
          eq(companyFuelEntries.companyId, companyId),
          eq(companyFuelEntries.assetId, assetId),
        ));
      ids = rows.map((r) => r.id);
    } else if (mod === 'peajes') {
      const rows = await db
        .select({ id: companyTollEntries.id })
        .from(companyTollEntries)
        .where(and(
          eq(companyTollEntries.companyId, companyId),
          eq(companyTollEntries.assetId, assetId),
        ));
      ids = rows.map((r) => r.id);
    } else if (mod === 'mantenimiento') {
      const rows = await db
        .select({ id: companyMaintenanceRecords.id })
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.companyId, companyId),
          eq(companyMaintenanceRecords.assetId, assetId),
        ));
      ids = rows.map((r) => r.id);
    }
    out.push({ module: mod, ids });
  }
  return out;
}

// ─── GET /company/:id/finance-invoices ────────────────────────────────────────

router.get(
  '/',
  requirePermission('finanzas', 'facturas', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);

      // ── Parsear y validar query params ────────────────────────────────────
      const sourceModuleParam = parseSourceModule(req.query.sourceModule);
      if (req.query.sourceModule !== undefined && sourceModuleParam === null) {
        throw new AppError(
          400,
          `sourceModule inválido. Valores permitidos: ${SOURCE_MODULES.join(', ')}`,
        );
      }

      const from = parseDateLoose(req.query.from);
      if (req.query.from !== undefined && from === null) {
        throw new AppError(400, 'from debe tener formato YYYY-MM-DD.');
      }
      const to = parseDateLoose(req.query.to);
      if (req.query.to !== undefined && to === null) {
        throw new AppError(400, 'to debe tener formato YYYY-MM-DD.');
      }

      const invoiceNumberQ =
        typeof req.query.invoiceNumber === 'string' && req.query.invoiceNumber.trim()
          ? req.query.invoiceNumber.trim()
          : null;

      const supplierQ =
        typeof req.query.supplier === 'string' && req.query.supplier.trim()
          ? `%${req.query.supplier.trim()}%`
          : null;

      const limit  = clampInt(req.query.limit,  50, 1, 200);
      const offset = clampInt(req.query.offset,  0, 0, 1_000_000);

      // assetId: parseIdFlexible acepta "asset-12" o "12". Si falla o es
      // 'all', lo ignoramos (semántica: traer facturas de cualquier activo).
      let assetIdNum: number | null = null;
      if (req.query.assetId !== undefined && req.query.assetId !== 'all') {
        try {
          const raw = String(req.query.assetId);
          if (/^asset-\d+$/.test(raw) || /^\d+$/.test(raw)) {
            assetIdNum = parseIdFlexible('asset', raw);
          }
        } catch {
          // id malformado → ignorar el filtro
          assetIdNum = null;
        }
      }

      // ── filtros nuevos (jul 2026 — modelo real, NO CxP) ──────────────────
      //
      // El módulo Finanzas ya no filtra por estado CxP (pagado/pendiente/etc).
      // Todos los comprobantes están "vigentes" por defecto. El filtro de
      // estado legacy se removió.

      // invoice_type_id: acepta 'invoice-type-12' o '12'.
      let invoiceTypeIdNum: number | null = null;
      if (req.query.invoice_type_id !== undefined && req.query.invoice_type_id !== 'all') {
        try {
          const raw = String(req.query.invoice_type_id);
          if (/^invoice-type-\d+$/.test(raw) || /^\d+$/.test(raw)) {
            invoiceTypeIdNum = parseIdFlexible('invoice-type', raw);
          }
        } catch {
          invoiceTypeIdNum = null;
        }
      }

      // supplier_id: acepta 'supplier-12' o '12'.
      let supplierIdNum: number | null = null;
      if (req.query.supplier_id !== undefined && req.query.supplier_id !== 'all') {
        try {
          const raw = String(req.query.supplier_id);
          if (/^supplier-\d+$/.test(raw) || /^\d+$/.test(raw)) {
            supplierIdNum = parseIdFlexible('supplier', raw);
          }
        } catch {
          supplierIdNum = null;
        }
      }

      // (jul 2026 — REMOVIDO: due_from / due_to. Los comprobantes no tienen
      // fecha de vencimiento en este sistema. Filtros restantes de fecha son
      // solo emission range: `from` y `to` mapean a company_invoices.invoice_date.)

      // ── WHERE principal (sin asset, que se resuelve abajo) ────────────────
      const conds: any[] = [eq(companyInvoices.companyId, companyId)];
      if (sourceModuleParam) {
        conds.push(eq(companyInvoices.sourceModule, sourceModuleParam));
      }
      if (from) conds.push(gte(companyInvoices.invoiceDate, from));
      if (to)   conds.push(lte(companyInvoices.invoiceDate, to));
      if (invoiceNumberQ) {
        conds.push(eq(companyInvoices.invoiceNumber, invoiceNumberQ));
      }
      if (supplierQ) conds.push(ilike(companyInvoices.supplierName, supplierQ));

      // invoice_type_id (catálogo company_invoice_types)
      if (invoiceTypeIdNum != null) {
        conds.push(eq(companyInvoices.invoiceTypeId, invoiceTypeIdNum));
      }
      // supplier_id
      if (supplierIdNum != null) {
        conds.push(eq(companyInvoices.supplierId, supplierIdNum));
      }
      // (jul 2026 — REMOVIDO filtro de due_date: ya no hay vencimientos.)

      // ── Si hay filtro por assetId, resolvemos los entity IDs por módulo ───
      // y los unificamos en un OR (source_module=X AND source_entity_id IN (...))
      // para que el WHERE del ledger se mantenga compacto.
      if (assetIdNum != null) {
        const perMod = await filterEntityIdsByAsset(companyId, sourceModuleParam, assetIdNum);
        if (perMod.every((p) => p.ids.length === 0)) {
          // El activo no tiene NINGÚN evento en los módulos aplicables.
          // Devolvemos lista vacía sin pegarle al ledger.
          return res.json({ total: 0, rows: [] });
        }
        const orClauses: any[] = [];
        for (const p of perMod) {
          if (p.ids.length === 0) continue;
          orClauses.push(and(
            eq(companyInvoices.sourceModule, p.module),
            inArray(companyInvoices.sourceEntityId, p.ids),
          )!);
        }
        if (orClauses.length === 0) {
          return res.json({ total: 0, rows: [] });
        }
        // Agrupamos todos los módulos en un OR (cualquier match pasa)
        conds.push(or(...orClauses));
      }

      const where = and(...conds);

      // ── SELECT + COUNT en paralelo ────────────────────────────────────────
      const [rows, [countRow]] = await Promise.all([
        db
          .select()
          .from(companyInvoices)
          .where(where)
          .orderBy(desc(companyInvoices.invoiceDate), desc(companyInvoices.id))
          .limit(limit)
          .offset(offset),
        db
          .select({ value: sql<number>`cast(count(*) as int)` })
          .from(companyInvoices)
          .where(where),
      ]);

      const total = Number(countRow?.value ?? 0);

      // ── Hidratación de source_ref (1-3 queries batch) ──────────────────────
      const inputs: HydrationInput[] = rows.map((r) => ({
        sourceModule: r.sourceModule as SourceModule,
        sourceEntityId: r.sourceEntityId,
      }));
      const refMap = await hydrateSourceRefs(companyId, inputs);

      // ── Hidratación de typeName + supplierName canónico (jul 2026) ─────────
      // 2 queries batch en lugar de un LEFT JOIN por fila.
      const { types: typeMap, suppliers: supplierMap } =
        await hydrateTypeAndSupplierFull(
          rows.map((r) => ({
            invoiceTypeId: r.invoiceTypeId,
            supplierId:    r.supplierId,
          })),
        );

      res.json({
        total,
        rows: rows.map((r) => {
          const t = r.invoiceTypeId != null ? typeMap.get(r.invoiceTypeId) : undefined;
          const s = r.supplierId    != null ? supplierMap.get(r.supplierId) : undefined;
          return serializeInvoice(
            r,
            refMap.get(`${r.sourceModule}:${r.sourceEntityId}`) ?? null,
            {
              invoiceTypeName:     t?.name ?? null,
              invoiceTypeIsActive: t?.isActive ?? null,
              supplierCanonicalName: s?.name ?? null,
              supplierNit:         s?.nit ?? null,
            },
          );
        }),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /company/:id/finance-invoices/:id ────────────────────────────────────

router.get(
  '/:id',
  requirePermission('finanzas', 'facturas', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const invoiceId = parseId('invoice', req.params.id);

      const [row] = await db
        .select()
        .from(companyInvoices)
        .where(and(
          eq(companyInvoices.id, invoiceId),
          eq(companyInvoices.companyId, companyId),
        ))
        .limit(1);

      if (!row) throw new NotFoundError('Factura', req.params.id);

      const refMap = await hydrateSourceRefs(companyId, [{
        sourceModule: row.sourceModule as SourceModule,
        sourceEntityId: row.sourceEntityId,
      }]);
      const sourceRef = refMap.get(`${row.sourceModule}:${row.sourceEntityId}`) ?? null;

      // Hidratación typeName + supplierName canónico (jul 2026)
      const { types: typeMap, suppliers: supplierMap } =
        await hydrateTypeAndSupplierFull([{
          invoiceTypeId: row.invoiceTypeId,
          supplierId:    row.supplierId,
        }]);
      const t = row.invoiceTypeId != null ? typeMap.get(row.invoiceTypeId) : undefined;
      const s = row.supplierId    != null ? supplierMap.get(row.supplierId) : undefined;

      res.json(serializeInvoice(row, sourceRef, {
        invoiceTypeName:       t?.name ?? null,
        invoiceTypeIsActive:   t?.isActive ?? null,
        supplierCanonicalName: s?.name ?? null,
        supplierNit:           s?.nit ?? null,
      }));
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /company/:id/finance-invoices/:id/pdf ────────────────────────────────
//
// jul 2026 — Genera y descarga el PDF del comprobante (formato carta, jsPDF).
// Devuelve `application/pdf` directamente. Content-Disposition: attachment
// para forzar la descarga.
//
// Seguridad:
//   - Misma hidratación que GET /:id (no se duplica el código, se reusa el
//     GET list para una fila equivalente).
//   - companyId SIEMPRE del JWT.
//   - 404 si la factura no es de la empresa.

router.get(
  '/:id/pdf',
  requirePermission('finanzas', 'facturas', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const invoiceId = parseId('invoice', req.params.id);

      // 1) Cargar la fila cruda.
      const [row] = await db
        .select()
        .from(companyInvoices)
        .where(and(
          eq(companyInvoices.id, invoiceId),
          eq(companyInvoices.companyId, companyId),
        ))
        .limit(1);

      if (!row) throw new NotFoundError('Factura', req.params.id);

      // 2) Hidratar sourceRef + typeName + supplier (mismo patrón que GET /:id).
      const refMap = await hydrateSourceRefs(companyId, [{
        sourceModule: row.sourceModule as SourceModule,
        sourceEntityId: row.sourceEntityId,
      }]);
      const sourceRef = refMap.get(`${row.sourceModule}:${row.sourceEntityId}`) ?? null;

      const { types: typeMap, suppliers: supplierMap } =
        await hydrateTypeAndSupplierFull([{
          invoiceTypeId: row.invoiceTypeId,
          supplierId:    row.supplierId,
        }]);
      const t = row.invoiceTypeId != null ? typeMap.get(row.invoiceTypeId) : undefined;
      const s = row.supplierId    != null ? supplierMap.get(row.supplierId) : undefined;

      const serialized = serializeInvoice(row, sourceRef, {
        invoiceTypeName:       t?.name ?? null,
        invoiceTypeIsActive:   t?.isActive ?? null,
        supplierCanonicalName: s?.name ?? null,
        supplierNit:           s?.nit ?? null,
      });

      // 3) Cargar empresa.
      const { companies } = await import('../../db/schema/platform');
      const [companyRow] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      const companyForPdf = {
        name:    companyRow?.name ?? 'Empresa',
        nit:     (companyRow as unknown as { nit: string | null } | undefined)?.nit ?? null,
        address: (companyRow as unknown as { address: string | null } | undefined)?.address ?? null,
        phone:   (companyRow as unknown as { phone: string | null } | undefined)?.phone ?? null,
        email:   (companyRow as unknown as { email: string | null } | undefined)?.email ?? null,
        logoUrl: null,
      };

      // 4) Hidratar supplier completo si está.
      let supplierForPdf: InvoicePdfInput['supplier'] = null;
      if (s) {
        supplierForPdf = {
          name:        s.name,
          nit:         s.nit ?? null,
          contactName: (s as unknown as { contactName: string | null }).contactName ?? null,
          phone:       (s as unknown as { phone: string | null }).phone ?? null,
          email:       (s as unknown as { email: string | null }).email ?? null,
          address:     (s as unknown as { address: string | null }).address ?? null,
        };
      }

      // 5) Construir PDF.
      const pdfBuffer: Buffer = buildInvoicePDF({
        invoice: {
          id:              row.id,
          invoiceNumber:   row.invoiceNumber,
          legalNumber:     row.legalNumber,
          issueDate:       String(row.invoiceDate),
          amount:          String(row.amount),
          notes:           row.notes,
          items:           (row.items as Array<{
                              description: string;
                              quantity: string | number;
                              unitPrice: string | number;
                              subtotal: string | number;
                            }> | null) ?? [],
          invoiceTypeName: t?.name ?? null,
          sourceModule:    row.sourceModule as 'combustible' | 'peajes' | 'mantenimiento' | 'manual',
          sourceRef:       (serialized.sourceRef ?? null) as InvoicePdfInput['invoice']['sourceRef'],
        },
        supplier: supplierForPdf,
        company:  companyForPdf,
      });

      // 6) Headers de respuesta.
      const safeName = String(row.invoiceNumber).replace(/[^A-Za-z0-9_.-]/g, '_');
      const filename = `comprobante-${safeName}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      res.setHeader('Content-Length', String(pdfBuffer.length));
      res.send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /company/:id/finance-invoices/:id/notes ───────────────────────────
//
// Solo permite editar `notes`. Es atómico: UPDATE … WHERE id = ? AND
// company_id = ? — si la fila no pertenece a la empresa, devuelve 404
// (no 403) para no filtrar existencia.

const patchNotesSchema = z.object({
  notes: z.string().max(4000).nullable().optional(),
});

router.patch(
  '/:id/notes',
  requirePermission('finanzas', 'facturas', 'editar'),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const invoiceId = parseId('invoice', req.params.id);

      // Validar body manualmente para no requerir middleware de Zod solo acá.
      const parsed = patchNotesSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'Validación fallida');
      }

      const newNotes = parsed.data.notes === undefined ? null : parsed.data.notes;
      const normalizedNotes = newNotes && newNotes.trim() === '' ? null : newNotes;

      // Verificar que la fila existe para esta empresa (404 si no).
      const [exists] = await db
        .select({ id: companyInvoices.id })
        .from(companyInvoices)
        .where(and(
          eq(companyInvoices.id, invoiceId),
          eq(companyInvoices.companyId, companyId),
        ))
        .limit(1);
      if (!exists) throw new NotFoundError('Factura', req.params.id);

      // UPDATE atómico con WHERE company_id (defensa en profundidad: aunque
      // alguien hackee el id, no puede tocar otra empresa).
      const [updated] = await db
        .update(companyInvoices)
        .set({ notes: normalizedNotes, updatedAt: sql`now()` })
        .where(and(
          eq(companyInvoices.id, invoiceId),
          eq(companyInvoices.companyId, companyId),
        ))
        .returning();

      await logAudit(db, companyId, {
        entity: 'finance-invoice',
        entityId: toId('invoice', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Notas de factura "${updated.invoiceNumber}" actualizadas.`,
        metadata: { newNotes: normalizedNotes },
      });

      // Hidratamos para devolver la misma shape que el GET individual.
      const refMap = await hydrateSourceRefs(companyId, [{
        sourceModule: updated.sourceModule as SourceModule,
        sourceEntityId: updated.sourceEntityId,
      }]);
      const sourceRef = refMap.get(`${updated.sourceModule}:${updated.sourceEntityId}`) ?? null;

      const { types: typeMap, suppliers: supplierMap } =
        await hydrateTypeAndSupplierFull([{
          invoiceTypeId: updated.invoiceTypeId,
          supplierId:    updated.supplierId,
        }]);
      const t = updated.invoiceTypeId != null ? typeMap.get(updated.invoiceTypeId) : undefined;
      const s = updated.supplierId    != null ? supplierMap.get(updated.supplierId) : undefined;

      res.json(serializeInvoice(updated, sourceRef, {
        invoiceTypeName:       t?.name ?? null,
        invoiceTypeIsActive:   t?.isActive ?? null,
        supplierCanonicalName: s?.name ?? null,
        supplierNit:           s?.nit ?? null,
      }));
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /company/:id/finance-invoices/:id/status ──────────────────────────
// (jul 2026 — REMOVIDO: el modelo CxP contable ya no existe. Las facturas
// son legajos simples sin estados de pago. Para "anular" una factura, usar
// PATCH /finance-invoices/:id { status: 'anulada' } sobre el campo legacy.)
// ──────────────────────────────────────────────────────────────────────────────

export default router;