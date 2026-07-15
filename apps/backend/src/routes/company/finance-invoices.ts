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
//       invoice_type_id, supplier_id, q (búsqueda libre),
//       page (default 1), pageSize (default 15, max 200).
//     Devuelve { total, rows: [...], page, pageSize }. Cada row trae la
//     `source_ref` hidratada (datos del fuel/toll/mantenimiento origen) para
//     que el frontend pueda mostrar "factura de peaje X del 2026-07-05"
//     sin tener que pegar a otra ruta.
//
//     Flags opcionales:
//       nopage=true : devuelve TODAS las filas sin paginar. Usado por
//                     /export para generar archivo completo.
//       format=csv|xlsx|txt|pdf : genera archivo descargable con esos
//                     formatos. nopage=true implicito.
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
  // jul 2026 v4-b — hidratación de facturas cerradas desde Caja Chica.
  companyPettyCashVouchers,
  companyPettyCashAccounts,
  companyFinanceRequests,
  companySites,
} from '../../db/schema/operational';
import { companyUsers } from '../../db/schema/platform';
import { requirePermission } from '../../middlewares/requirePermission';
import { AppError, NotFoundError } from '../../lib/errors';
import { toId, parseId, parseIdFlexible } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { buildInvoicePDF } from '../../lib/invoice-pdf';
import type { InvoicePdfInput } from '../../lib/invoice-pdf';
import { parsePageParams, buildPageResponse } from '../../lib/pagination';

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

    // jul 2026 v3 — Totales + items[] para que el drawer del módulo
    // Finanzas muestre el desglose. `row.items` puede ser null/array
    // legacy (string). Lo normalizamos a array de objetos.
    //
    // jul 2026 v4-b — Fallback: invoices legacy (creadas antes de la
    // migración 0050) tienen subtotal/total = 0. Caemos a `amount` (que
    // SIEMPRE estuvo populado) para mantener consistencia con la query
    // mensual de /stats que también usa `amount` como fuente de verdad.
    subtotal:    row.subtotal != null && Number(row.subtotal) > 0
                   ? Number(row.subtotal)
                   : (row.amount != null ? Number(row.amount) : 0),
    ivaPercent:   row.ivaPercent != null ? Number(row.ivaPercent) : 15,
    ivaAmount:    row.ivaAmount != null && Number(row.ivaAmount) > 0
                   ? Number(row.ivaAmount)
                   : 0,
    total:        row.total != null && Number(row.total) > 0
                   ? Number(row.total)
                   : (row.amount != null ? Number(row.amount) : 0),
    workshopName: row.workshopName ?? null,
    workerName:   row.workerName ?? null,
    items:        Array.isArray(row.items) ? row.items : [],
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
  // jul 2026 v4-b — `assetId` se guarda en el value para que /stats pueda
  // agrupar el `byVehicle` por asset real (no por `(module, entity)`).
  // Antes: sourceRef solo exponía `assetCode`/`assetPlate` y el byVehicle
  // generaba keys compuestas `${sourceModule}-${sourceEntityId}` que
  // duplicaban la misma placa N veces.
  let fuelMap = new Map<number, { date: string; assetId: number | null; assetCode: string | null; assetPlate: string | null }>();
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
        assetId: r.assetId ?? null,
        assetCode: a?.code ?? null,
        assetPlate: a?.plate ?? null,
      }];
    }));
  }

  // ── Toll ────────────────────────────────────────────────────────────────
  let tollMap = new Map<number, { date: string; tollName: string | null; assetId: number | null; assetCode: string | null; assetPlate: string | null }>();
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
        assetId: r.assetId ?? null,
        assetCode: a?.code ?? null,
        assetPlate: a?.plate ?? null,
      }];
    }));
  }

  // ── Maintenance ────────────────────────────────────────────────────────
  // jul 2026 v4-b — `assetId` se guarda en el value (igual que fuel/toll)
  // para que /stats pueda agrupar el `byVehicle` por asset real.
  let maintMap = new Map<number, {
    scheduledFor: string;
    completedAt: string | null;
    title: string | null;
    assetId: number | null;
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
        assetId: r.assetId ?? null,
        assetCode: a?.code ?? null,
        assetPlate: a?.plate ?? null,
      }];
    }));
  }

  // jul 2026 v4-b — Vales de caja chica. Cada factura cerrada desde
  // CajaChicaPage tiene sourceModule='petty_cash' y sourceEntityId =
  // id del vale (company_petty_cash_vouchers). Hidratamos:
  //   - valeNumericId, issuedAmount, refundAmount
  //   - accountName / siteName
  //   - requesterName (solicitante), approverName (aprobador)
  //   - assignedToName (operador dueño del vale)
  let voucherMap = new Map<number, {
    voucherNumericId: number;
    issuedAmount: number;
    refundAmount: number;
    accountName: string | null;
    siteName: string | null;
    requesterName: string | null;
    approverName: string | null;
    assignedToName: string | null;
    financeClassification: 'repuesto' | 'mano_obra' | 'lavada' | null;
  }>();
  // jul 2026 v4-b — Envolvemos toda la hydration de vouchers en un
  // try/catch. Si por algún motivo la query contra company_users /
  // company_sites / company_petty_cash_accounts / etc. rompe (ej. una
  // FK nula, una columna nueva sin migrar, o un bug de drizzle con
  // el join), seguimos sin romper el listado. Solo logueamos el error
  // para debug.
  const voucherIds = inputs.filter((i) => i.sourceModule === 'petty_cash').map((i) => i.sourceEntityId);
  if (voucherIds.length) try {
    // jul 2026 v4-b — OJO: companyPettyCashVouchers NO tiene
    // `financeClassification` como columna. La clasificación vive en
    // company_finance_requests (relacionada por requestId). Por eso
    // NO la seleccionamos del voucher acá, la joineamos desde la
    // finance_request más abajo.
    const vrows = await db
      .select({
        id:                 companyPettyCashVouchers.id,
        siteId:             companyPettyCashVouchers.siteId,
        issuedAmount:       companyPettyCashVouchers.issuedAmount,
        refundAmount:       companyPettyCashVouchers.refundAmount,
        requestId:          companyPettyCashVouchers.requestId,
        assignedToUserId:   companyPettyCashVouchers.assignedToUserId,
      })
      .from(companyPettyCashVouchers)
      .where(and(
        eq(companyPettyCashVouchers.companyId, companyId),
        inArray(companyPettyCashVouchers.id, voucherIds),
      ));

    // Hidratar cuentas de caja chica (para siteName / accountName)
    const accountIds = Array.from(new Set(vrows.map((v) => v.siteId).filter(Boolean))) as number[];
    let accountMap = new Map<number, { siteName: string | null; accountName: string | null }>();
    if (accountIds.length) {
      const arows = await db
        .select({
          id:        companyPettyCashAccounts.id,
          siteId:    companyPettyCashAccounts.siteId,
          siteName:  companySites.name,
        })
        .from(companyPettyCashAccounts)
        .leftJoin(companySites, eq(companySites.id, companyPettyCashAccounts.siteId))
        .where(inArray(companyPettyCashAccounts.id, accountIds));
      accountMap = new Map(arows.map((a) => [a.id, { siteName: a.siteName ?? null, accountName: a.siteName ? `Caja · ${a.siteName}` : null }]));
    }

    // Hidratar requester + approver + finance_classification + assignedTo
    // (de company_finance_requests y company_users).
    const requestIds = Array.from(new Set(vrows.map((v) => v.requestId).filter(Boolean))) as number[];
    let requestMap = new Map<number, { requesterName: string | null; approverName: string | null; financeClassification: 'repuesto' | 'mano_obra' | 'lavada' | null }>();
    if (requestIds.length) {
      const rrows = await db
        .select({
          id:                    companyFinanceRequests.id,
          requesterUserId:       companyFinanceRequests.requesterUserId,
          approverUserId:        companyFinanceRequests.approverUserId,
          financeClassification: companyFinanceRequests.financeClassification,
        })
        .from(companyFinanceRequests)
        .where(inArray(companyFinanceRequests.id, requestIds));
      const userIds = Array.from(new Set([
        ...rrows.map((r) => r.requesterUserId).filter(Boolean),
        ...rrows.map((r) => r.approverUserId).filter(Boolean),
      ])) as number[];
      let userMap = new Map<number, string>();
      if (userIds.length) {
        const urows = await db
          .select({ id: companyUsers.id, name: companyUsers.fullName })
          .from(companyUsers)
          .where(inArray(companyUsers.id, userIds));
        userMap = new Map(urows.map((u) => [u.id, u.name ?? ""]));
      }
      requestMap = new Map(rrows.map((r) => [r.id, {
        requesterName: r.requesterUserId ? (userMap.get(r.requesterUserId) ?? null) : null,
        approverName:  r.approverUserId  ? (userMap.get(r.approverUserId)  ?? null) : null,
        financeClassification: (r.financeClassification as 'repuesto' | 'mano_obra' | 'lavada' | null) ?? null,
      }]));
    }

    const assignedIds = Array.from(new Set(vrows.map((v) => v.assignedToUserId).filter(Boolean))) as number[];
    let assignedMap = new Map<number, string>();
    if (assignedIds.length) {
      const arows = await db
        .select({ id: companyUsers.id, name: companyUsers.fullName })
        .from(companyUsers)
        .where(inArray(companyUsers.id, assignedIds));
      assignedMap = new Map(arows.map((u) => [u.id, u.name ?? ""]));
    }

    voucherMap = new Map(vrows.map((v) => {
      const acc = accountMap.get(v.siteId);
      const req = requestMap.get(v.requestId);
      return [v.id, {
        voucherNumericId: v.id,
        issuedAmount:     Number(v.issuedAmount),
        refundAmount:     Number(v.refundAmount ?? 0),
        accountName:      acc?.accountName ?? null,
        siteName:         acc?.siteName ?? null,
        requesterName:    req?.requesterName ?? null,
        approverName:     req?.approverName ?? null,
        assignedToName:   assignedMap.get(v.assignedToUserId) ?? null,
        // financeClassification vive en company_finance_requests, no
        // en company_petty_cash_vouchers. La joineamos vía requestId.
        financeClassification: req?.financeClassification ?? null,
      }];
    }));
  } catch (e) {
    // jul 2026 v4-b — Si la hydration de vouchers rompe, logueamos
    // y seguimos con voucherMap vacío. El listado no se rompe.
    console.error('[finance-invoices] voucher hydration FAILED:', {
      message: (e as Error)?.message,
      stack:   (e as Error)?.stack?.split('\n').slice(0, 6).join('\n'),
    });
  }

  // ── Stitch ─────────────────────────────────────────────────────────────
  // jul 2026 v4-b — El stitch ahora también expone `assetId` en el ref.
  // Antes solo exponía `assetCode`/`assetPlate`; eso obligaba a /stats
  // a agrupar `byVehicle` por `${sourceModule}-${sourceEntityId}`,
  // duplicando la misma placa N veces (una por factura del mismo auto).
  for (const inp of inputs) {
    let ref: Record<string, unknown> | null = null;
    if (inp.sourceModule === 'combustible') {
      const f = fuelMap.get(inp.sourceEntityId);
      if (f) {
        ref = {
          fuelDate:   f.date,
          assetId:    f.assetId,
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
          assetId:    t.assetId,
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
          assetId:                  m.assetId,
          assetCode:                m.assetCode,
          assetPlate:               m.assetPlate,
        };
      }
    } else if (inp.sourceModule === 'petty_cash') {
      const v = voucherMap.get(inp.sourceEntityId);
      if (v) {
        ref = {
          voucherNumericId:        v.voucherNumericId,
          voucherIssuedAmount:     v.issuedAmount,
          voucherRefundAmount:     v.refundAmount,
          voucherAccountName:      v.accountName,
          voucherSiteName:         v.siteName,
          voucherRequesterName:    v.requesterName,
          voucherApproverName:     v.approverName,
          voucherAssignedToName:   v.assignedToName,
          voucherFinanceClassification: v.financeClassification,
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

      // jul 2026 v4-b — DEBUG temporal: loguear el error con stack para
      // encontrar el "Cannot convert undefined or null to object".
      // Lo saco cuando identifiquemos la línea exacta.
      const _dbg = (label: string, e: any) => {
        console.error(`[finance-invoices GET] ${label}:`, e?.message, '\n',
          'cause:', e?.cause?.message, '\n',
          'stack:', e?.stack?.split('\n').slice(0, 8).join('\n'));
      };

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

      // ── Búsqueda libre (jul 2026): jul 2026 v3 ─────────────────────────
      // Coincidencia case-insensitive en invoice_number, supplier_name,
      // workshop_name, worker_name. Si viene vacia o no es string → null.
      const qRaw = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const q = qRaw ? `%${qRaw}%` : null;

      // ── Modo sin paginar (jul 2026 v3) ──────────────────────────────────
      // Para el export general: ?nopage=true&format=csv|xlsx|txt|pdf
      const noPage = req.query.nopage === 'true' || req.query.nopage === '1';
      const formatRaw = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : '';
      const format = ['csv', 'xlsx', 'txt', 'pdf'].includes(formatRaw) ? formatRaw : null;
      const isExport = noPage && format !== null;

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

      // Búsqueda libre (jul 2026 v3 / v4-b): matchea en:
      //   - invoice_number, supplier_name, workshop_name, worker_name
      //     (texto en la propia invoice — match directo).
      //   - status, source_module (texto — match case-insensitive).
      //   - Para facturas cerradas desde Caja Chica, también matchea
      //     contra el operador, sede, vale, solicitante, aprobador.
      //     Esto se hace con EXISTS a company_petty_cash_vouchers +
      //     joins a users/sites.
      if (q) {
        // jul 2026 v3 — Búsqueda libre contra campos de texto de la invoice.
        // v4-b — Simplificado: solo text columns (NO sourceModule/status
        // que son pgEnum y rompen el cast ILIKE en drizzle 0.45.2).
        // Para Caja Chica el `q` matchea contra invoiceNumber ("GEN-..." o
        // "CC-...") y supplierName del comprobante. La búsqueda por
        // operador / sede / vale se hace client-side (ya están visibles
        // en cada fila) o vía endpoint dedicado en una vuelta futura.
        const qClauses = [
          ilike(companyInvoices.invoiceNumber, q),
          ilike(companyInvoices.supplierName,  q),
          ilike(companyInvoices.workshopName,  q),
          ilike(companyInvoices.workerName,    q),
        ];
        conds.push(or(...qClauses)!);
      }

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

      // ── Modo EXPORT (jul 2026 v3) ─────────────────────────────────────────
      // Cuando viene ?nopage=true&format=csv|xlsx|txt|pdf, devolvemos
      // TODAS las filas que matchean los filtros, sin paginar, en el formato
      // pedido. NO se hidrata `source_ref` (solo columnas planas necesarias).
      if (isExport) {
        const allRows = await db
          .select()
          .from(companyInvoices)
          .where(where)
          .orderBy(desc(companyInvoices.invoiceDate), desc(companyInvoices.id));

        const tExportMap = new Map(
          (await hydrateTypeAndSupplierFull(
            allRows.map((r) => ({
              invoiceTypeId: r.invoiceTypeId,
              supplierId:    r.supplierId,
            })),
          )).types,
        );

        // Para export: sin source_ref. Planamos datos clave.
        const flatRows = allRows.map((r) => ({
          invoiceNumber: r.invoiceNumber ?? '',
          invoiceDate:   formatDateOnly(r.invoiceDate),
          sourceModule:  r.sourceModule ?? '',
          kind:          r.kind ?? '',
          invoiceTypeName: r.invoiceTypeId != null ? (tExportMap.get(r.invoiceTypeId)?.name ?? '') : '',
          supplierName:  r.supplierName ?? '',
          workshopName:  r.workshopName ?? '',
          workerName:    r.workerName ?? '',
          subtotal:      r.subtotal != null ? String(r.subtotal) : '0.00',
          ivaAmount:     r.ivaAmount != null ? String(r.ivaAmount) : '0.00',
          total:         r.total != null ? String(r.total) : '0.00',
          status:        r.status ?? '',
          notes:         r.notes ?? '',
        }));

        const filename = `facturas_${new Date().toISOString().slice(0, 10)}.${format}`;
        if (format === 'csv')  { sendCsv (res, flatRows, filename); return; }
        if (format === 'txt')  { sendTxt (res, flatRows, filename); return; }
        if (format === 'xlsx') { await sendXlsx(res, flatRows, filename); return; }
        if (format === 'pdf')  { await sendExportPdf(res, flatRows, filename, companyId); return; }
      }

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

// ─── Helpers de EXPORT (jul 2026 v3) ─────────────────────────────────────────
// Para los formatos CSV / XLSX / TXT / PDF, generamos el archivo en
// memoria y lo devolvemos con Content-Disposition: attachment. Cada
// helper toma las filas planas (flatRows) que arma el caller.
//
// Estructura de flatRows (la misma para individual y general):
//   { invoiceNumber, invoiceDate, sourceModule, kind, invoiceTypeName,
//     supplierName, workshopName, workerName, subtotal, ivaAmount, total,
//     status, notes }
//
// Para el PDF individual usamos el jsPDF detallado del comprobante
// (con items[], header de empresa, etc.). Para el PDF general y los
// demas formatos usamos un layout tabular simple.

type ExportFlatRow = {
  invoiceNumber: string;
  invoiceDate:   string;     // YYYY-MM-DD
  sourceModule:  string;
  kind:          string;
  invoiceTypeName: string;
  supplierName:  string;
  workshopName:  string;
  workerName:    string;
  subtotal:      string;
  ivaAmount:     string;
  total:         string;
  status:        string;
  notes:         string;
};

const EXPORT_HEADERS: Array<{ key: keyof ExportFlatRow; label: string }> = [
  { key: 'invoiceNumber',   label: 'N° Factura' },
  { key: 'invoiceDate',     label: 'Fecha' },
  { key: 'sourceModule',    label: 'Origen' },
  { key: 'kind',            label: 'Tipo' },
  { key: 'invoiceTypeName', label: 'Categoría' },
  { key: 'supplierName',    label: 'Proveedor' },
  { key: 'workshopName',    label: 'Taller' },
  { key: 'workerName',      label: 'Lavador' },
  { key: 'subtotal',        label: 'Subtotal (USD)' },
  { key: 'ivaAmount',       label: 'IVA (USD)' },
  { key: 'total',           label: 'Total (USD)' },
  { key: 'status',          label: 'Estado' },
  { key: 'notes',           label: 'Notas' },
];

function csvEscape(v: string): string {
  // CSV escaping RFC 4180: comilla doble + duplicar comillas internas.
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function sendCsv(res: Response, rows: ExportFlatRow[], filename: string): void {
  const lines: string[] = [];
  lines.push(EXPORT_HEADERS.map((h) => csvEscape(h.label)).join(','));
  for (const r of rows) {
    lines.push(EXPORT_HEADERS.map((h) => csvEscape(String(r[h.key] ?? ''))).join(','));
  }
  // BOM UTF-8 para que Excel reconozca acentos correctamente.
  const body = '\ufeff' + lines.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
}

function sendTxt(res: Response, rows: ExportFlatRow[], filename: string): void {
  const widths = EXPORT_HEADERS.map((h) =>
    Math.max(h.label.length, ...rows.map((r) => String(r[h.key] ?? '').length)),
  );
  const pad = (s: string, w: number) => s.padEnd(w, ' ');
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  const lines: string[] = [];
  lines.push(EXPORT_HEADERS.map((h, i) => pad(h.label, widths[i])).join('  '));
  lines.push(sep);
  for (const r of rows) {
    lines.push(EXPORT_HEADERS.map((h, i) => pad(String(r[h.key] ?? ''), widths[i])).join('  '));
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(lines.join('\n'));
}

async function sendXlsx(
  res: Response,
  rows: ExportFlatRow[],
  filename: string,
): Promise<void> {
  // Dynamic import: exceljs es pesado y solo lo necesitamos para export.
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ApliSmart Motors';
  wb.created = new Date();
  const ws = wb.addWorksheet('Facturas', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = EXPORT_HEADERS.map((h) => ({
    header: h.label,
    key: h.key,
    width: Math.max(h.label.length + 2, 14),
  }));
  // Header style
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' },
  };
  ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' };
  // Rows
  for (const r of rows) {
    ws.addRow({
      invoiceNumber: r.invoiceNumber,
      invoiceDate:   r.invoiceDate,
      sourceModule:  r.sourceModule,
      kind:          r.kind,
      invoiceTypeName: r.invoiceTypeName,
      supplierName:  r.supplierName,
      workshopName:  r.workshopName,
      workerName:    r.workerName,
      subtotal:      Number(r.subtotal) || 0,
      ivaAmount:     Number(r.ivaAmount) || 0,
      total:         Number(r.total) || 0,
      status:        r.status,
      notes:         r.notes,
    });
  }
  // Formato numerico para USD
  ['subtotal', 'ivaAmount', 'total'].forEach((k) => {
    const col = ws.getColumn(k);
    col.numFmt = '"$"#,##0.00';
    col.alignment = { horizontal: 'right' };
  });
  const buf = await wb.xlsx.writeBuffer();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buf as ArrayBuffer));
}

async function sendExportPdf(
  res: Response,
  rows: ExportFlatRow[],
  filename: string,
  companyId: number,
): Promise<void> {
  // PDF general (lista de facturas). Para el PDF individual por
  // factura, usar el endpoint existente /:id/pdf (más detallado).
  const { jsPDF } = (await import('jspdf')).default
    ? await import('jspdf')
    : await import('jspdf');
  // Hay dos shapes de export de jspdf (named/default). El cast cubre ambos.
  const JsPDFCtor = ((jsPDF as any).default ?? jsPDF) as any;
  const doc = new JsPDFCtor({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(14);
  doc.text('Listado de Facturas — ApliSmart Motors', 14, 14);
  doc.setFontSize(9);
  doc.text(`Generado: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}  |  Empresa: ${companyId}  |  Total: ${rows.length}`, 14, 20);

  // Tabla simple con autoTable.
  const autoTableMod = await import('jspdf-autotable');
  const autoTable = (autoTableMod as any).default ?? autoTableMod;

  autoTable(doc, {
    startY: 26,
    head: [EXPORT_HEADERS.map((h) => h.label)],
    body: rows.map((r) => EXPORT_HEADERS.map((h) => String(r[h.key] ?? ''))),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 22 }, // N° Factura
      1: { cellWidth: 20 }, // Fecha
      2: { cellWidth: 22 }, // Origen
      3: { cellWidth: 18 }, // Tipo
      4: { cellWidth: 22 }, // Categoría
      5: { cellWidth: 28 }, // Proveedor
      6: { cellWidth: 28 }, // Taller
      7: { cellWidth: 24 }, // Lavador
      8: { cellWidth: 22, halign: 'right' }, // Subtotal
      9: { cellWidth: 18, halign: 'right' }, // IVA
     10: { cellWidth: 22, halign: 'right' }, // Total
     11: { cellWidth: 16 }, // Estado
     12: { cellWidth: 'auto' }, // Notas
    },
  });

  const buf = doc.output('arraybuffer') as ArrayBuffer;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buf));
}

function formatDateOnly(d: Date | string | null): string {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

// ─── GET /company/:id/finance-invoices/stats ──────────────────────────────────
// jul 2026 v4-b — Submódulo Estadísticas del módulo Finanzas.
// Devuelve agregaciones por mes para un año + vehículo + categoría
// (combustible | peaje | mantenimiento) + breakdown por categoría.
// El frontend usa esto para el gráfico de barras y la tabla drill-down.
// jul 2026 v4-b permisos: este endpoint NO usa 'finanzas.facturas.ver'
// (no lista facturas fila-por-fila). Usa el submódulo propio
// 'finanzas.estadisticas.ver' para que un admin pueda darle Estadísticas
// a un usuario SIN darle el listado completo de Facturas.
router.get(
  '/stats',
  requirePermission('finanzas', 'estadisticas', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const year  = clampInt(req.query.year,  new Date().getUTCFullYear(), 2000, 2100);
      const catRaw = typeof req.query.category === 'string' ? req.query.category : '';
      const category = ['combustible', 'peaje', 'mantenimiento', 'manual'].includes(catRaw)
        ? (catRaw as 'combustible' | 'peaje' | 'mantenimiento' | 'manual')
        : null;
      // jul 2026 v4-b fix — la DB tiene source_module = 'peajes' (plural).
      // El frontend del submódulo Estadísticas envía la categoría "peaje"
      // (singular) o "peajes" (plural). Ambos deben mapear a 'peajes'.
      // Antes: 'peaje' → 'combustible', por lo que filtrar por Peajes
      // mostraba SOLO facturas de combustible y dejaba el resto en $0.00.
      //
      // El tipo del record usa el union EXACTO que acepta la columna
      // company_invoices.source_module en la DB ('combustible' | 'peajes'
      // | 'mantenimiento' | 'petty_cash' | 'manual').
      const moduleMap: Record<string, 'combustible' | 'peajes' | 'mantenimiento' | 'manual'> = {
        combustible: 'combustible',
        peajes: 'peajes',
        peaje: 'peajes',
        mantenimiento: 'mantenimiento',
        manual: 'manual',
      };
      const sourceModuleFilter = catRaw ? moduleMap[catRaw] ?? null : null;

      // jul 2026 v4-b — DEBUG temporal. Loguea en consola del backend
      // qué source_modules existen en company_invoices para esta empresa,
      // agrupados por año. Sirve para diagnosticar por qué una categoría
      // muestra $0 (data en source_module inesperado, en otro año, etc).
      // BORRAR después de validar con el usuario.
      try {
        const debugSourceModules = await db
          .select({
            sourceModule: companyInvoices.sourceModule,
            year:         sql<number>`EXTRACT(YEAR FROM ${companyInvoices.invoiceDate})::int`,
            count:        sql<number>`cast(count(*) as int)`,
            total:        sql<string>`COALESCE(SUM(${companyInvoices.total}), 0)::text`,
            amount:       sql<string>`COALESCE(SUM(${companyInvoices.amount}), 0)::text`,
          })
          .from(companyInvoices)
          .where(eq(companyInvoices.companyId, companyId))
          .groupBy(
            companyInvoices.sourceModule,
            sql`EXTRACT(YEAR FROM ${companyInvoices.invoiceDate})`,
          )
          .orderBy(sql`EXTRACT(YEAR FROM ${companyInvoices.invoiceDate})`, companyInvoices.sourceModule);
        // jul 2026 v4-b — Además, mostramos las primeras 5 invoices raw
        // para ver qué tienen en `invoiceDate`, `total`, `amount`,
        // `subtotal`, `iva_amount`. Eso nos dice si la columna `total`
        // está null y por qué el COALESCE a `amount` no funciona.
        const sampleInvoices = await db
          .select({
            id:            companyInvoices.id,
            sourceModule:  companyInvoices.sourceModule,
            invoiceDate:   companyInvoices.invoiceDate,
            amount:        companyInvoices.amount,
            subtotal:      companyInvoices.subtotal,
            ivaAmount:     companyInvoices.ivaAmount,
            total:         companyInvoices.total,
          })
          .from(companyInvoices)
          .where(eq(companyInvoices.companyId, companyId))
          .orderBy(companyInvoices.invoiceDate)
          .limit(5);
        // eslint-disable-next-line no-console
        console.log('[STATS DEBUG]', JSON.stringify({
          companyId, year, catRaw, category, sourceModuleFilter,
          sourceModuleBreakdown: debugSourceModules,
          sampleInvoices,
        }));
      } catch (debugErr) {
        // eslint-disable-next-line no-console
        console.warn('[STATS DEBUG] failed:', (debugErr as Error).message);
      }

      // jul 2026 v4-b — Traer TODOS los vehículos de la empresa para
      // el dropdown. Lo hacemos ANTES del short-circuit de "manual+asset"
      // porque ese short-circuit también necesita devolver `vehicles`.
      const allCompanyAssets = await db
        .select({
          id:    companyAssets.id,
          plate: companyAssets.plate,
          name:  companyAssets.name,
          code:  companyAssets.code,
        })
        .from(companyAssets)
        .where(eq(companyAssets.companyId, companyId))
        .orderBy(companyAssets.plate);

      // jul 2026 v4-b — Mapeo a la shape que consume el frontend
      // (asset-3 → "ABM-4662", fallback al code o name si no hay placa).
      const vehicles = allCompanyAssets.map((a) => ({
        id:    toId('asset', a.id),
        plate: a.plate ?? a.code ?? a.name ?? `Asset #${a.id}`,
      }));

      // `filterEntityIdsByAsset` solo conoce los 3 módulos con tabla
      // fuente única (combustible | peajes | mantenimiento). Si la
      // categoría es 'manual' (vouchers de caja chica), no hay tabla
      // fuente única que filtrar — pasamos null = "todos los módulos".
      const sourceModuleForFilter: SourceModule | null =
        sourceModuleFilter && sourceModuleFilter !== 'manual'
          ? sourceModuleFilter
          : null;

      // Filtro de vehículo: si viene assetId, resolvemos los sourceEntityIds
      // por módulo (fuel / toll / maintenance) para usar en el WHERE.
      let assetFilter: ReturnType<typeof sql> | null = null;
      if (typeof req.query.assetId === 'string' && req.query.assetId && req.query.assetId !== 'all') {
        try {
          const raw = String(req.query.assetId);
          if (/^asset-\d+$/.test(raw) || /^\d+$/.test(raw)) {
            const assetIdNum = parseIdFlexible('asset', raw);
            const perMod = await filterEntityIdsByAsset(companyId, sourceModuleForFilter, assetIdNum);
            if (perMod.every((p) => p.ids.length === 0)) {
              // Sin matches, devolver array vacío.
              return res.json({
                year,
                category: catRaw || 'all',
                monthly: Array.from({ length: 12 }, (_, i) => ({
                  year, month: i + 1,
                  subtotal: 0, ivaAmount: 0, total: 0, count: 0,
                  byCategory: { combustible: 0, peaje: 0, mantenimiento: 0 },
                })),
                byCategory: { combustible: 0, peaje: 0, mantenimiento: 0 },
                byVehicle: [],
                totals: { subtotal: 0, ivaAmount: 0, total: 0, count: 0 },
              });
            }
            const orClauses = perMod
              .filter((p) => p.ids.length > 0)
              .map((p) => and(
                eq(companyInvoices.sourceModule, p.module),
                inArray(companyInvoices.sourceEntityId, p.ids),
              )!);
            if (orClauses.length > 0) {
              assetFilter = or(...orClauses);
            }
          }
        } catch {
          // ignore malformed assetId
        }
      }

      // jul 2026 v4-b — Short-circuit para `category=manual` con `assetId`.
      // Las invoices de Caja Chica / manuales NO tienen assetId. Si el
      // usuario filtra por un vehículo específico con category=manual,
      // el filtro de asset no matchea nada (no hay datos). Retornamos
      // ceros directamente en vez de ejecutar la query pesada.
      if (catRaw === 'manual' && assetFilter) {
        return res.json({
          year,
          category: 'manual',
          monthly: Array.from({ length: 12 }, (_, i) => ({
            year, month: i + 1,
            subtotal: 0, ivaAmount: 0, total: 0, count: 0,
            byCategory: { combustible: 0, peaje: 0, mantenimiento: 0 },
          })),
          byCategory: { combustible: 0, peaje: 0, mantenimiento: 0 },
          byVehicle: [],
          vehicles,
          totals: { subtotal: 0, ivaAmount: 0, total: 0, count: 0 },
        });
      }

      // WHERE principal: company + año + módulo + asset.
      const conds: any[] = [eq(companyInvoices.companyId, companyId)];
      conds.push(sql`EXTRACT(YEAR FROM ${companyInvoices.invoiceDate}) = ${year}`);
      if (sourceModuleFilter) {
        conds.push(eq(companyInvoices.sourceModule, sourceModuleFilter));
      }
      if (assetFilter) {
        conds.push(assetFilter);
      }
      const where = and(...conds);

      // jul 2026 v4-b — Agregación por (mes, source_module).
      // SIMPLIFICADO: usamos `amount` directamente. Es la única columna
      // que SIEMPRE estuvo poblada (incluso en invoices legacy antes de
      // la migración 0050). El doble COALESCE anidado dentro de SUM con
      // cast ::numeric que tenía antes rompía el bind de postgres-js
      // (tiraba "Failed query:" con `undefined` en params). Ahora es
      // un solo COALESCE plano.
      //
      // Para nuevas invoices con IVA, `amount` es el subtotal antes de
      // IVA. El frontend puede estimar el total con iva como
      // `amount * 1.15` para Ecuador. Para esta iteración, mostramos
      // `amount` como `subtotal` y `total` (= amount sin IVA por ahora).
      const aggRows = await db
        .select({
          month:        sql<number>`EXTRACT(MONTH FROM ${companyInvoices.invoiceDate})::int`,
          sourceModule: companyInvoices.sourceModule,
          subtotal:     sql<string>`COALESCE(SUM(${companyInvoices.amount}), 0)::text`,
          ivaAmount:    sql<string>`0::text`,
          total:        sql<string>`COALESCE(SUM(${companyInvoices.amount}), 0)::text`,
          count:        sql<number>`cast(count(*) as int)`,
        })
        .from(companyInvoices)
        .where(where)
        .groupBy(
          sql`EXTRACT(MONTH FROM ${companyInvoices.invoiceDate})`,
          companyInvoices.sourceModule,
        );

      // Normalizar a 12 meses con shape consistente.
      const monthMap = new Map<number, {
        year: number; month: number;
        subtotal: number; ivaAmount: number; total: number; count: number;
        byCategory: { combustible: number; peaje: number; mantenimiento: number };
      }>();
      for (let m = 1; m <= 12; m++) {
        monthMap.set(m, {
          year: year, month: m,
          subtotal: 0, ivaAmount: 0, total: 0, count: 0,
          byCategory: { combustible: 0, peaje: 0, mantenimiento: 0 },
        });
      }
      let totals = { subtotal: 0, ivaAmount: 0, total: 0, count: 0 };
      const byCategory: Record<'combustible' | 'peaje' | 'mantenimiento', number> = {
        combustible: 0, peaje: 0, mantenimiento: 0,
      };
      for (const r of aggRows) {
        const m = Number(r.month);
        const slot = monthMap.get(m);
        if (!slot) continue;
        const sub = Number(r.subtotal);
        const iva = Number(r.ivaAmount);
        const tot = Number(r.total);
        const cnt = Number(r.count);
        slot.subtotal  += sub;
        slot.ivaAmount += iva;
        slot.total     += tot;
        slot.count     += cnt;
        // Mapear source_module a category para byCategory.
        const key = r.sourceModule === 'combustible' ? 'combustible'
                  : r.sourceModule === 'peajes'     ? 'peaje'
                  : r.sourceModule === 'mantenimiento' ? 'mantenimiento'
                  : null;
        if (key) {
          slot.byCategory[key] += tot;
          byCategory[key] += tot;
        }
        totals.subtotal  += sub;
        totals.ivaAmount += iva;
        totals.total     += tot;
        totals.count     += cnt;
      }

      // jul 2026 v4-b — Lista de vehículos disponibles para el dropdown
      // del submódulo Estadísticas. Se trae DIRECTO de la tabla de
      // Top vehículos por gasto.
      // jul 2026 v4-b fix — Antes el `groupBy` era por (sourceModule,
      // sourceEntityId), por lo que el mismo vehículo aparecía N veces
      // (una por cada factura). Ahora seguimos trayendo filas a ese
      // nivel porque necesitamos el sourceModule para la hidratación,
      // pero abajo dedupeamos por `assetId` real del sourceRef.
      const byVehicleRows = await db
        .select({
          sourceModule: companyInvoices.sourceModule,
          sourceEntityId: companyInvoices.sourceEntityId,
          // jul 2026 v4-b — Usar `amount` directo (mismo motivo que arriba:
          // las invoices legacy tienen `total = 0`).
          total: sql<string>`COALESCE(SUM(${companyInvoices.amount}), 0)::text`,
        })
        .from(companyInvoices)
        .where(where)
        .groupBy(companyInvoices.sourceModule, companyInvoices.sourceEntityId);

      // Hidratar source_ref para traer assetId + placa.
      const inputs: HydrationInput[] = byVehicleRows.map((r) => ({
        sourceModule: r.sourceModule as SourceModule,
        sourceEntityId: r.sourceEntityId,
      }));
      const refMap = await hydrateSourceRefs(companyId, inputs);

      // Agrupamos por `assetId` REAL (no por key compuesta). Las filas
      // sin `ref.assetId` (fuente manual / petty_cash / huérfanas) se
      // EXCLUYEN del `byVehicle` y del dropdown: no son vehículos.
      const vehicleMap = new Map<string, { assetId: string; plate: string; total: number; byCategory: Record<string, number> }>();
      for (const r of byVehicleRows) {
        const ref = refMap.get(`${r.sourceModule}:${r.sourceEntityId}`) ?? null;
        const realAssetId = typeof ref?.assetId === 'number' && ref.assetId > 0
          ? ref.assetId
          : null;
        if (realAssetId == null) continue;  // manual/petty_cash/orphan → no es vehículo
        const assetIdStr = toId('asset', realAssetId);
        const plate = ref?.assetPlate ?? null;
        if (!plate) continue;  // vehículo sin placa legible → tampoco va
        const slot = vehicleMap.get(assetIdStr) ?? {
          assetId: assetIdStr,
          plate,
          total: 0,
          byCategory: { combustible: 0, peaje: 0, mantenimiento: 0 },
        };
        const tot = Number(r.total);
        slot.total += tot;
        const key = r.sourceModule === 'combustible' ? 'combustible'
                  : r.sourceModule === 'peajes'     ? 'peaje'
                  : r.sourceModule === 'mantenimiento' ? 'mantenimiento'
                  : null;
        if (key) slot.byCategory[key] += tot;
        vehicleMap.set(assetIdStr, slot);
      }
      const byVehicle = Array.from(vehicleMap.values()).sort((a, b) => b.total - a.total);

      res.json({
        year,
        category: catRaw || 'all',
        monthly: Array.from(monthMap.values()),
        byCategory,
        byVehicle,
        vehicles,
        totals,
      });
    } catch (err) {
      // jul 2026 v4-b — loguear el error con stack para debug.
      console.error('[finance-invoices /stats] FAILED:', {
        message: (err as Error)?.message,
        stack:   (err as Error)?.stack?.split('\n').slice(0, 8).join('\n'),
      });
      next(err);
    }
  },
);

// ─── GET /company/:id/finance-invoices/drill ─────────────────────────────────
// jul 2026 v4-b — Drill-down: devuelve la lista de invoices filtrada para
// un (year, month, assetId?, category?). El frontend agrupa por semana/día
// según el nivel de expansión.
// jul 2026 v4-b permisos: misma regla que /stats — submódulo propio
// 'finanzas.estadisticas.ver', NO 'finanzas.facturas.ver'.
router.get(
  '/drill',
  requirePermission('finanzas', 'estadisticas', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const year  = clampInt(req.query.year,  new Date().getUTCFullYear(), 2000, 2100);
      const month = clampInt(req.query.month, 0, 0, 12); // 0 = all
      const catRaw = typeof req.query.category === 'string' ? req.query.category : '';
      // jul 2026 v4-b fix — mismo mapeo que en /stats. 'peaje'/'peajes'
      // mapean a source_module='peajes' (plural, según la DB), no a
      // 'combustible'. Antes filtraba por la categoría equivocada.
      const moduleMap: Record<string, 'combustible' | 'peajes' | 'mantenimiento' | 'manual'> = {
        combustible: 'combustible',
        peajes: 'peajes',
        peaje: 'peajes',
        mantenimiento: 'mantenimiento',
        manual: 'manual',
      };
      const sourceModuleFilter = catRaw ? moduleMap[catRaw] ?? null : null;

      // 'manual' (vouchers de caja chica) no tiene tabla fuente propia.
      // Para `filterEntityIdsByAsset`, lo tratamos como "todos los módulos".
      const sourceModuleForFilter: SourceModule | null =
        sourceModuleFilter && sourceModuleFilter !== 'manual'
          ? sourceModuleFilter
          : null;

      const conds: any[] = [eq(companyInvoices.companyId, companyId)];
      conds.push(sql`EXTRACT(YEAR FROM ${companyInvoices.invoiceDate}) = ${year}`);
      if (month > 0) {
        conds.push(sql`EXTRACT(MONTH FROM ${companyInvoices.invoiceDate}) = ${month}`);
      }
      if (sourceModuleFilter) {
        conds.push(eq(companyInvoices.sourceModule, sourceModuleFilter));
      }

      // Filtro por vehículo.
      if (typeof req.query.assetId === 'string' && req.query.assetId && req.query.assetId !== 'all') {
        try {
          const raw = String(req.query.assetId);
          if (/^asset-\d+$/.test(raw) || /^\d+$/.test(raw)) {
            const assetIdNum = parseIdFlexible('asset', raw);
            const perMod = await filterEntityIdsByAsset(companyId, sourceModuleForFilter, assetIdNum);
            const orClauses = perMod
              .filter((p) => p.ids.length > 0)
              .map((p) => and(
                eq(companyInvoices.sourceModule, p.module),
                inArray(companyInvoices.sourceEntityId, p.ids),
              )!);
            if (orClauses.length > 0) conds.push(or(...orClauses));
            else return res.json({ rows: [] });
          }
        } catch { /* ignore */ }
      }

      const where = and(...conds);

      // jul 2026 v4-b — Paginación canónica del proyecto (parsePageParams).
      // Antes el endpoint tenía un .limit(500) hardcoded; ahora usa el
      // sistema estándar: ?page=1&pageSize=50 (max 200). Devuelve la shape
      // { data, total, page, pageSize, totalPages } (buildPageResponse).
      const { page, pageSize, offset } = parsePageParams(
        req.query as Record<string, unknown>,
        // jul 2026 v9 — Default 10 para alinear con caja chica y reportes.
        // El cap se mantiene en 100 para que el admin pueda pedir un
        // dump grande (export, vista completa) sin que se rompa la query.
        { pageSize: 10, maxPageSize: 100 },
      );

      const [rows, [countRow]] = await Promise.all([
        db
          .select()
          .from(companyInvoices)
          .where(where)
          .orderBy(desc(companyInvoices.invoiceDate), desc(companyInvoices.id))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ value: sql<number>`cast(count(*) as int)` })
          .from(companyInvoices)
          .where(where),
      ]);
      const total = Number(countRow?.value ?? 0);

      // Hidratar source_ref + typeName + supplierName.
      const inputs: HydrationInput[] = rows.map((r) => ({
        sourceModule: r.sourceModule as SourceModule,
        sourceEntityId: r.sourceEntityId,
      }));
      const refMap = await hydrateSourceRefs(companyId, inputs);
      const { types: tMap, suppliers: sMap } =
        await hydrateTypeAndSupplierFull(
          rows.map((r) => ({ invoiceTypeId: r.invoiceTypeId, supplierId: r.supplierId })),
        );
      const serialized = rows.map((r) => {
        const t = r.invoiceTypeId != null ? tMap.get(r.invoiceTypeId) : undefined;
        const s = r.supplierId    != null ? sMap.get(r.supplierId)    : undefined;
        return serializeInvoice(r, refMap.get(`${r.sourceModule}:${r.sourceEntityId}`) ?? null, {
          invoiceTypeName: t?.name ?? null,
          invoiceTypeIsActive: t?.isActive ?? null,
          supplierCanonicalName: s?.name ?? null,
          supplierNit: s?.nit ?? null,
        });
      });
      res.json(buildPageResponse(serialized, total, page, pageSize));
    } catch (err) {
      // jul 2026 v4-b — DEBUG temporal del 500.
      console.error('[finance-invoices GET /] FAILED:', {
        message: (err as Error)?.message,
        code:    (err as any)?.code,
        detail:  (err as any)?.detail,
        hint:    (err as any)?.hint,
        stack:   (err as Error)?.stack?.split('\n').slice(0, 10).join('\n'),
      });
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
          // jul 2026 v4-b — totales desglosados para el PDF.
          subtotal:        row.subtotal != null ? String(row.subtotal) : null,
          ivaPercent:      row.ivaPercent != null ? String(row.ivaPercent) : null,
          ivaAmount:       row.ivaAmount != null ? String(row.ivaAmount) : null,
          total:           row.total != null ? String(row.total) : null,
          notes:           row.notes,
          items:           (row.items as Array<{
                              description: string;
                              quantity: string | number;
                              unitPrice: string | number;
                              subtotal: string | number;
                            }> | null) ?? [],
          invoiceTypeName: t?.name ?? null,
          // jul 2026 v4-b — agregamos 'petty_cash' al union.
          sourceModule:    row.sourceModule as
            'combustible' | 'peajes' | 'mantenimiento' | 'petty_cash' | 'manual',
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

// ─── GET /company/:id/finance-invoices/:id/{csv,xlsx,txt} ────────────────────
// jul 2026 v3 — Export individual de UNA factura en formato tabular.
// Mismo formato que el export general (mismas columnas), pero con
// UNA sola fila: la factura solicitada. Útil para descargar el
// comprobante en formato Excel/CSV/TXT sin abrir el PDF.
//
// PDF individual sigue siendo /:id/pdf (más detallado, jsPDF con
// tabla de items y header de empresa).

async function exportSingleInvoiceFlat(
  companyId: number,
  invoiceId: number,
): Promise<ExportFlatRow | null> {
  const [row] = await db
    .select()
    .from(companyInvoices)
    .where(and(
      eq(companyInvoices.id, invoiceId),
      eq(companyInvoices.companyId, companyId),
    ))
    .limit(1);
  if (!row) return null;

  const { types: tMap, suppliers: sMap } =
    await hydrateTypeAndSupplierFull([{
      invoiceTypeId: row.invoiceTypeId,
      supplierId:    row.supplierId,
    }]);
  const t = row.invoiceTypeId != null ? tMap.get(row.invoiceTypeId) : undefined;

  return {
    invoiceNumber:   row.invoiceNumber ?? '',
    invoiceDate:     formatDateOnly(row.invoiceDate),
    sourceModule:    row.sourceModule ?? '',
    kind:            row.kind ?? '',
    invoiceTypeName: t?.name ?? '',
    supplierName:    row.supplierName ?? (sMap.get(row.supplierId ?? -1)?.name ?? ''),
    workshopName:    row.workshopName ?? '',
    workerName:      row.workerName ?? '',
    subtotal:        row.subtotal != null ? String(row.subtotal) : '0.00',
    ivaAmount:       row.ivaAmount != null ? String(row.ivaAmount) : '0.00',
    total:           row.total != null ? String(row.total) : '0.00',
    status:          row.status ?? '',
    notes:           row.notes ?? '',
  };
}

router.get(
  '/:id/csv',
  requirePermission('finanzas', 'facturas', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const invoiceId = parseId('invoice', req.params.id);
      const flat = await exportSingleInvoiceFlat(companyId, invoiceId);
      if (!flat) throw new NotFoundError('Factura', req.params.id);
      const safeName = String(flat.invoiceNumber).replace(/[^A-Za-z0-9_.-]/g, '_');
      sendCsv(res, [flat], `factura-${safeName}.csv`);
    } catch (err) { next(err); }
  },
);

// ─── GET /company/:id/finance-invoices/:id  ───────────────────────────────────
// jul 2026 v4-b — Detalle de UNA factura. Usado por el drawer de mantenimiento
// para mostrar la factura cerrada cuando el operador cerró el vale desde
// CajaChicaPage. Devuelve shape `ApiFinanceInvoice` ya hidratada para
// que el frontend pueda reusar el mismo componente de detalle.
router.get(
  '/:id',
  requirePermission('finanzas', 'facturas', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const invoiceId = parseId('invoice', req.params.id);

      const [row] = await db
        .select({
          inv: companyInvoices,
        })
        .from(companyInvoices)
        .where(and(
          eq(companyInvoices.id, invoiceId),
          eq(companyInvoices.companyId, companyId),
        ))
        .limit(1);
      if (!row) throw new NotFoundError('Factura', req.params.id);

      // Devolvemos lo mínimo que el drawer necesita para mostrar la
      // factura cerrada: id, número, fecha, total, items, archivo.
      // El listado del modulo Finanzas tiene más campos; acá solo
      // devolvemos lo esencial.
      const items = (() => {
        if (!row.inv.items) return [];
        if (Array.isArray(row.inv.items)) return row.inv.items;
        try { return JSON.parse(String(row.inv.items)); } catch { return []; }
      })();

      return res.json({
        invoice: {
          id: toId('invoice', row.inv.id),
          numericId: row.inv.id,
          invoiceNumber: row.inv.invoiceNumber,
          invoiceDate: row.inv.invoiceDate,
          amount: row.inv.amount,
          total: row.inv.total,
          subtotal: row.inv.subtotal,
          ivaPercent: row.inv.ivaPercent,
          ivaAmount: row.inv.ivaAmount,
          kind: row.inv.kind,
          sourceModule: row.inv.sourceModule,
          sourceAttachmentKey: row.inv.sourceAttachmentKey,
          fileUrl: row.inv.fileUrl,
          fileMimeType: row.inv.fileMimeType,
          items,
          workshopName: row.inv.workshopName,
          workerName: row.inv.workerName,
        },
      });
    } catch (err) { next(err); }
  },
);

router.get(
  '/:id/txt',
  requirePermission('finanzas', 'facturas', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const invoiceId = parseId('invoice', req.params.id);
      const flat = await exportSingleInvoiceFlat(companyId, invoiceId);
      if (!flat) throw new NotFoundError('Factura', req.params.id);
      const safeName = String(flat.invoiceNumber).replace(/[^A-Za-z0-9_.-]/g, '_');
      sendTxt(res, [flat], `factura-${safeName}.txt`);
    } catch (err) { next(err); }
  },
);

router.get(
  '/:id/xlsx',
  requirePermission('finanzas', 'facturas', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const invoiceId = parseId('invoice', req.params.id);
      const flat = await exportSingleInvoiceFlat(companyId, invoiceId);
      if (!flat) throw new NotFoundError('Factura', req.params.id);
      const safeName = String(flat.invoiceNumber).replace(/[^A-Za-z0-9_.-]/g, '_');
      await sendXlsx(res, [flat], `factura-${safeName}.xlsx`);
    } catch (err) { next(err); }
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