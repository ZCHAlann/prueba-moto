// ─────────────────────────────────────────────────────────────────────────────
// lib/finance-maintenance-sync.ts
//
// jul 2026 — Sincronización entre Mantenimientos ↔ Caja Chica / Finanzas.
//
// Caso de uso: cuando se cierra un vale desde el drawer de un mantenimiento,
// la factura del proveedor ya fue subida como attachment del mantenimiento
// (en `company_maintenance_records.attachments[]`). El vale no necesita una
// factura nueva — usa esa. Esta función:
//   1) Materializa la `company_invoices` desde el attachment (reusando
//      syncSingleInvoice de lib/invoices-sync).
//   2) Asocia el `closed_invoice_id` al vale.
//   3) Marca los items del mantenimiento correspondientes con
//      `finance_classification='petty_cash'` + `finance_request_id`.
//   4) Llama fn_close_petty_cash_voucher para cerrar el vale.
//
// Todo en una transacción Drizzle. Si algo falla, no se descuenta caja ni se
// marca el vale como cerrado.
// ─────────────────────────────────────────────────────────────────────────────

import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  companyMaintenanceRecords,
  companyMaintenanceItems,
  companyPettyCashVouchers,
  companyPettyCashAccounts,
  companyPettyCashMovements,
  companyFinanceRequests,
  companyInvoices,
} from '../db/schema/operational';
import { syncSingleInvoice, type InvoiceSourceModule } from './invoices-sync';
import { AppError } from './errors';

export interface MaintenanceInvoiceSyncInput {
  voucherId: number;
  invoiceAttachmentKey: string;   // key del attachment en `attachments[]`
  actualAmount: number;
  notes: string | null;
  actorUserId: number;
}

export interface MaintenanceInvoiceSyncResult {
  invoiceId: number;
  refundAmount: number;
}

/**
 * Cierra un vale reusando la factura que el operador subió como attachment
 * del mantenimiento. Hace todo atómico en una sola transacción.
 */
export async function closeVoucherFromMaintenance(
  input: MaintenanceInvoiceSyncInput,
): Promise<MaintenanceInvoiceSyncResult> {
  const { voucherId, invoiceAttachmentKey, actualAmount, notes, actorUserId } = input;

  // ── Validaciones previas (fuera de transacción para fallar rápido) ──
  const [voucher] = await db
    .select()
    .from(companyPettyCashVouchers)
    .where(eq(companyPettyCashVouchers.id, voucherId))
    .limit(1);
  if (!voucher) throw new AppError(404, `Vale ${voucherId} no existe`);
  if (voucher.status !== 'open') {
    throw new AppError(400, `El vale ya está en estado "${voucher.status}"`);
  }

  const [request] = await db
    .select()
    .from(companyFinanceRequests)
    .where(eq(companyFinanceRequests.id, voucher.requestId))
    .limit(1);
  if (!request) throw new AppError(404, `Solicitud del vale no existe`);
  if (!request.maintenanceId) {
    throw new AppError(400, `El vale no está asociado a un mantenimiento`);
  }

  const [maintenance] = await db
    .select()
    .from(companyMaintenanceRecords)
    .where(eq(companyMaintenanceRecords.id, request.maintenanceId))
    .limit(1);
  if (!maintenance) throw new AppError(404, `Mantenimiento ${request.maintenanceId} no existe`);

  const attachments = (maintenance.attachments as Array<Record<string, unknown>>) ?? [];
  const attachment = attachments.find((a: any) => (a.key || 'main') === invoiceAttachmentKey);
  if (!attachment) {
    throw new AppError(404, `Attachment "${invoiceAttachmentKey}" no existe en el mantenimiento`);
  }

  // ── Materializar la factura desde el attachment ──────────────────────
  // Usamos syncSingleInvoice (que ya hace upsert por UNIQUE key).
  // Para evitar race conditions, todo dentro de una transacción.
  return await db.transaction(async (tx) => {
    const invoiceResult = await syncSingleInvoice({
      tx: tx as any,
      companyId: voucher.companyId,
      sourceModule: 'mantenimiento' as InvoiceSourceModule,
      sourceEntityId: maintenance.id,
      data: {
        kind: (attachment as any).kind ?? 'repuesto',
        invoiceNumber: (attachment as any).invoiceNumber || '',
        invoiceDate: (attachment as any).invoiceDate || new Date().toISOString().slice(0, 10),
        amount: String(Number((attachment as any).amount ?? actualAmount)),
        currency: 'USD',
        supplierName: (attachment as any).supplierName ?? null,
        supplierId: (attachment as any).supplierId ?? null,
        fileUrl: (attachment as any).url ?? null,
        fileMimeType: (attachment as any).fileMimeType ?? null,
        items: Array.isArray((attachment as any).items)
          ? (attachment as any).items
          : [],
        // IVA: si el attachment lo trae, usarlo. Si no, 15% default Ecuador.
        ivaPercent: (attachment as any).ivaPercent ?? 15,
        workshopName: (attachment as any).workshopName ?? null,
        workerName: (attachment as any).workerName ?? null,
      } as any,
      attachmentKey: invoiceAttachmentKey,
      currency: 'USD',
    });

    const invoiceId = (invoiceResult as any).id;
    if (!invoiceId) throw new AppError(500, 'No se pudo materializar la factura');

    // Vincular la factura con la solicitud.
    await tx
      .update(companyInvoices)
      .set({ financeRequestId: request.id })
      .where(eq(companyInvoices.id, invoiceId));

    // ── Cerrar el vale (con la factura ya asociada) ────────────────────
    // El helper closePettyCashVoucher usa db.execute con la PL/pgSQL, lo cual
    // funciona dentro de la transacción (Postgres respeta la tx a nivel de
    // conexión). Pero si la PL/pgSQL hace COMMIT/ROLLBACK implícito, podría
    // romper la tx. Para evitarlo, hacemos el cierre manualmente aquí mismo
    // reusando la misma lógica de la PL/pgSQL pero inline.

    // 1) Marcar vale cerrado
    const issuedAmount = Number(voucher.issuedAmount);
    const refundAmount = Math.max(issuedAmount - actualAmount, 0);
    await tx
      .update(companyPettyCashVouchers)
      .set({
        status: 'closed',
        closedAt: new Date(),
        closedActualAmount: actualAmount.toFixed(2),
        closedInvoiceId: invoiceId,
        closedNotes: notes,
        refundAmount: refundAmount.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(companyPettyCashVouchers.id, voucherId));

    // 2) Si hay reembolso, devolver a caja
    if (refundAmount > 0) {
      // Lock + update de la cuenta
      const [account] = await tx
        .select()
        .from(companyPettyCashAccounts)
        .where(eq(companyPettyCashAccounts.id, voucher.accountId))
        .for('update')
        .limit(1);

      if (!account) throw new AppError(404, 'Cuenta de caja chica no encontrada');

      const newBalance = Number(account.currentBalance) + refundAmount;
      await tx
        .update(companyPettyCashAccounts)
        .set({ currentBalance: newBalance.toFixed(2), updatedAt: new Date() })
        .where(eq(companyPettyCashAccounts.id, voucher.accountId));

      // Insertar movement append-only
      await tx.insert(companyPettyCashMovements).values({
        companyId: voucher.companyId,
        accountId: voucher.accountId,
        type: 'voucher_closed_refund',
        amount: refundAmount.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        relatedVoucherId: voucherId,
        actorUserId,
        note: `Reembolso por vale #${voucherId} (cerrado desde mantenimiento #${maintenance.id})`,
      });
    }

    // 3) Marcar items del mantenimiento que correspondan a esta solicitud
    await tx
      .update(companyMaintenanceItems)
      .set({
        financeRequestId: request.id,
        financeClassification: 'petty_cash',
      })
      .where(and(
        eq(companyMaintenanceItems.maintenanceId, maintenance.id),
        eq(companyMaintenanceItems.financeRequestId, request.id),
      ));

    return {
      invoiceId,
      refundAmount,
    };
  });
}

/**
 * Snapshot del estado financiero de un mantenimiento:
 *   - todas las solicitudes asociadas
 *   - si hay un vale abierto (cualquiera de las solicitudes petty_cash aprobadas)
 *
 * Usado por el panel sticky en el drawer del mantenimiento.
 */
export async function getMaintenanceFinanceSnapshot(maintenanceId: number): Promise<{
  requests: Array<{
    id: number;
    amount: string;
    reason: string;
    status: string;
    classification: string;
    requesterName: string | null;
    createdAt: Date;
  }>;
  openVoucher: {
    id: number;
    issuedAmount: number;
    status: string;
    siteId: number;
  } | null;
  // jul 2026 v4 — vales ya cerrados (incluyen su closedInvoiceId para
  // que el drawer de mantenimiento muestre el link al comprobante
  // aunque el vale haya sido cerrado vía CajaChicaPage).
  closedVouchers: Array<{
    id: number;
    issuedAmount: number;
    closedActualAmount: number | null;
    closedInvoiceId: number | null;
    refundAmount: number;
    closedAt: Date | null;
  }>;
}> {
  // Traer solicitudes
  const reqs = await db
    .select({
      id: companyFinanceRequests.id,
      amount: companyFinanceRequests.amount,
      reason: companyFinanceRequests.reason,
      status: companyFinanceRequests.status,
      classification: companyFinanceRequests.classification,
      createdAt: companyFinanceRequests.createdAt,
      requesterProfile: sql<string>`(SELECT profile_data->>'fullName' FROM company_users WHERE id = ${companyFinanceRequests.requesterUserId})`,
    })
    .from(companyFinanceRequests)
    .where(eq(companyFinanceRequests.maintenanceId, maintenanceId))
    .orderBy(companyFinanceRequests.createdAt);

  // Buscar vale abierto entre las solicitudes petty_cash aprobadas
  const reqIds = reqs.filter(r => r.classification === 'petty_cash').map(r => r.id);
  let openVoucher: any = null;
  const closedVouchers: Array<{
    id: number;
    issuedAmount: number;
    closedActualAmount: number | null;
    closedInvoiceId: number | null;
    refundAmount: number;
    closedAt: Date | null;
  }> = [];

  if (reqIds.length > 0) {
    const vouchers = await db
      .select({
        id: companyPettyCashVouchers.id,
        issuedAmount: companyPettyCashVouchers.issuedAmount,
        status: companyPettyCashVouchers.status,
        siteId: companyPettyCashVouchers.siteId,
        assignedToUserId: companyPettyCashVouchers.assignedToUserId,
        closedInvoiceId: companyPettyCashVouchers.closedInvoiceId,
        closedActualAmount: companyPettyCashVouchers.closedActualAmount,
        refundAmount: companyPettyCashVouchers.refundAmount,
        closedAt: companyPettyCashVouchers.closedAt,
      })
      .from(companyPettyCashVouchers)
      .where(inArray(companyPettyCashVouchers.requestId, reqIds))
      .orderBy(desc(companyPettyCashVouchers.createdAt));

    for (const v of vouchers) {
      if (v.status === 'open') {
        if (!openVoucher) {
          openVoucher = {
            id: v.id,
            issuedAmount: Number(v.issuedAmount),
            status: v.status,
            siteId: v.siteId,
            assignedToUserId: v.assignedToUserId,
            closedInvoiceId: v.closedInvoiceId,
            closedActualAmount: v.closedActualAmount ? Number(v.closedActualAmount) : null,
            refundAmount: Number(v.refundAmount),
            closedAt: v.closedAt,
          };
        }
      } else if (v.status === 'closed') {
        closedVouchers.push({
          id: v.id,
          issuedAmount: Number(v.issuedAmount),
          closedActualAmount: v.closedActualAmount ? Number(v.closedActualAmount) : null,
          closedInvoiceId: v.closedInvoiceId,
          refundAmount: Number(v.refundAmount),
          closedAt: v.closedAt,
        });
      }
    }
  }

  return {
    requests: reqs.map(r => ({
      id: r.id,
      amount: r.amount,
      reason: r.reason,
      status: r.status,
      classification: r.classification,
      requesterName: r.requesterProfile,
      createdAt: r.createdAt,
    })),
    openVoucher,
    closedVouchers,
  };
}