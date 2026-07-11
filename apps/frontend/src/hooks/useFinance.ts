// ─────────────────────────────────────────────────────────────────────────────
// hooks/useFinance.ts
//
// jul 2026 — Hook central del módulo Caja Chica + Transacciones (Finanzas).
//
// Endpoints backend:
//   GET    /api/company/:companyId/finance/petty-cash
//   POST   /api/company/:companyId/finance/petty-cash
//   POST   /api/company/:companyId/finance/petty-cash/replenish
//
//   GET    /api/company/:companyId/finance/requests?status=&mine=&siteId=
//   POST   /api/company/:companyId/finance/requests
//   GET    /api/company/:companyId/finance/requests/:id
//   PATCH  /api/company/:companyId/finance/requests/:id/review
//   DELETE /api/company/:companyId/finance/requests/:id
//
//   GET    /api/company/:companyId/finance/vouchers?status=&mine=&siteId=
//   GET    /api/company/:companyId/finance/vouchers/:id
//   PATCH  /api/company/:companyId/finance/vouchers/:id/close
//   GET    /api/company/:companyId/finance/vouchers/:id/pdf   (binary)
//
//   GET    /api/company/:companyId/finance/transactions?scope=&from=&to=
//   GET    /api/company/:companyId/finance/transactions/export.pdf  (binary)
//
// Patrón: un único objeto `useFinance()` que expone sub-objetos:
//   - pettyCash   → info de cuenta + movimientos
//   - requests    → listado + crear + aprobar/rechazar + cancelar
//   - vouchers    → listado + cerrar + PDF
//   - transactions→ feed + export PDF
//
// Cada sub-objeto mantiene su propio loading/error. Las mutaciones devuelven
// `{ ok: boolean, error?: string }` para que el caller muestre toast sin
// tener que catch.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccountMode = "period" | "balance";
export type PeriodKind = "monthly" | "weekly" | null;

export type PettyCashAccount = {
  id: number;
  companyId: number;
  siteId: number;
  mode: AccountMode;
  periodKind: PeriodKind;
  initialAmount: string | number;
  limitAmount: string | number;
  currentBalance: string | number;
  isActive: boolean;
  periodStartedAt: string | Date;
};

export type PettyCashAccountWithSite = {
  id: number;
  siteId: number;
  siteName: string | null;
  siteCode: string | null;
  mode: "period" | "balance";
  periodKind: "monthly" | "weekly" | null;
  currentBalance: number;
  limitAmount: number;
};

export type PettyCashAvailableSite = {
  id: number;
  name: string;
  code: string | null;
  status: string;
};

export type PettyCashMovement = {
  id: number;
  type: string;
  amount: string | number;
  balanceAfter: string | number;
  note: string | null;
  occurredAt: string | Date;
  actorName: string | null;
  relatedRequestId: number | null;
  relatedVoucherId: number | null;
};

export type FinanceRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type FinanceRequestClassification = "pending" | "petty_cash" | "annual_expense";
export type FinanceRequestOrigin = "maintenance" | "maintenance_item" | "standalone";

export type FinanceRequest = {
  id: string;
  numericId: number;
  siteId: number;
  siteName: string | null;
  requesterUserId: number;
  requesterName: string | null;
  approverUserId: number | null;
  approverName: string | null;
  amount: number;
  reason: string;
  origin: FinanceRequestOrigin;
  maintenanceId: number | null;
  maintenanceItemId: number | null;
  classification: FinanceRequestClassification;
  status: FinanceRequestStatus;
  rejectionReason: string | null;
  reviewedAt: string | Date | null;
  createdAt: string | Date;
};

export type VoucherStatus = "open" | "closed" | "cancelled";

export type VoucherPurpose = "repuesto" | "otro";

export type Voucher = {
  id: string;
  numericId: number;
  siteId: number;
  siteName: string | null;
  assignedToUserId: number;
  assignedToName: string | null;
  issuedAmount: number;
  status: VoucherStatus;
  closedActualAmount: number | null;
  closedInvoiceId: number | null;
  refundAmount: number;
  closedAt: string | Date | null;
  createdAt: string | Date;
  requestId: number;
  reason?: string;
  closedNotes?: string | null;
  requesterName?: string | null;
  // jul 2026 v4 — info del request original (para reusar factura al cerrar).
  origin?: 'maintenance' | 'maintenance_item' | 'standalone';
  maintenanceId?: number | null;
  maintenanceItemId?: number | null;
  // jul 2026 v4-b — finance_classification del maintenance_item asociado.
  // Define qué exigir al cerrar el vale:
  //   "repuesto"      → factura + items[]
  //   "mano_obra"     → factura + workshopName (NO items)
  //   "lavada"        → factura + workerName (NO items)
  //   null/undefined  → standalone, sin restricción
  financeClassification?: 'repuesto' | 'mano_obra' | 'lavada' | null;
  // jul 2026 v5 — Migración 0051. Indica si el vale entra al flujo
  // de revisión contable. NULL = legacy (no se revisa).
  purpose?: VoucherPurpose | null;
};

export type TransactionItem = {
  source: "petty_cash_movement" | "annual_expense";
  id: number;
  amount: string | number;
  occurredAt: string | Date;
  description: string;
  category: string | null;
  relatedVoucherId: number | null;
  relatedRequestId: number | null;
  actorName: string | null;
  balanceAfter: string | null;
};

// ─── Mutaciones — retorno uniforme ───────────────────────────────────────────

export type MutationResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─── Hook principal ─────────────────────────────────────────────────────────

export function useFinance() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  // Memorizamos todo el bundle de funciones juntas. Solo cambia si cambia
  // companyId (login/logout). Esto evita que `useEffect(..., [load])` se
  // dispare en bucle cuando el componente padre re-renderiza.
  return useMemo(() => {
    // ════════════════════════════════════════════════════════════════════
    // PETTY CASH
    // ════════════════════════════════════════════════════════════════════
    const fetchAccount = async (siteId?: number) => {
      if (!companyId) return null;
      const qs = siteId ? `?siteId=${siteId}` : "";
      const res = await fetch(`/api/company/${companyId}/finance/petty-cash${qs}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      return res.json() as Promise<
        | { account: PettyCashAccount | null; movements: PettyCashMovement[]; summary: any }
        | { accounts: PettyCashAccountWithSite[]; availableSites: PettyCashAvailableSite[] }
        | null
      >;
    };

    const upsertAccount = async (params: {
      siteId: number;
      mode: AccountMode;
      periodKind?: PeriodKind;
      initialAmount: number;
      limitAmount: number;
    }): Promise<MutationResult<{ account: PettyCashAccount }>> => {
      if (!companyId) return { ok: false, error: "Sesión inválida" };
      const res = await fetch(`/api/company/${companyId}/finance/petty-cash`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        return { ok: false, error: (await res.text().catch(() => "")) || `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, data };
    };

    const replenishAccount = async (params: {
      accountId: number;
      amount: number;
      note?: string;
    }): Promise<MutationResult<{ newBalance: number }>> => {
      if (!companyId) return { ok: false, error: "Sesión inválida" };
      const res = await fetch(`/api/company/${companyId}/finance/petty-cash/replenish`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        return { ok: false, error: (await res.text().catch(() => "")) || `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, data };
    };

    // ════════════════════════════════════════════════════════════════════
    // REQUESTS
    // ════════════════════════════════════════════════════════════════════
    const fetchRequests = async (filters: {
      status?: FinanceRequestStatus | "all" | "approved";
      mine?: boolean;
      siteId?: number;
    } = {}): Promise<FinanceRequest[]> => {
      if (!companyId) return [];
      const params = new URLSearchParams();
      if (filters.status && filters.status !== "all") params.set("status", filters.status);
      if (filters.mine) params.set("mine", "true");
      if (filters.siteId) params.set("siteId", String(filters.siteId));
      const qs = params.toString();
      const res = await fetch(
        `/api/company/${companyId}/finance/requests${qs ? `?${qs}` : ""}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      const json = await res.json();
      return (json.requests ?? []) as FinanceRequest[];
    };

    const createRequest = async (params: {
      siteId: number;
      amount: number;
      reason: string;
      justificationNotes?: string;
      origin?: FinanceRequestOrigin;
      maintenanceId?: number;
      maintenanceItemId?: number;
      // jul 2026 v5 — Migración 0051. Sólo aplica a standalone. Si
      // viene de mantenimiento, el backend lo fuerza a 'repuesto'.
      purpose?: VoucherPurpose;
    }): Promise<MutationResult<{ id: string; numericId: number }>> => {
      if (!companyId) return { ok: false, error: "Sesión inválida" };
      const res = await fetch(`/api/company/${companyId}/finance/requests`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: "standalone", ...params }),
      });
      if (!res.ok) {
        return { ok: false, error: (await res.text().catch(() => "")) || `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, data };
    };

    const reviewRequest = async (params: {
      requestId: number;
      action: "approve" | "reject";
      classification?: "petty_cash" | "annual_expense";
      rejectionReason?: string;
      voucherAssignedTo?: number;
    }): Promise<MutationResult<{ voucherId: number | null; annualExpenseId: number | null }>> => {
      if (!companyId) return { ok: false, error: "Sesión inválida" };
      const res = await fetch(
        `/api/company/${companyId}/finance/requests/${params.requestId}/review`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: params.action,
            classification: params.classification,
            rejectionReason: params.rejectionReason,
            voucherAssignedTo: params.voucherAssignedTo,
          }),
        },
      );
      if (!res.ok) {
        return { ok: false, error: (await res.text().catch(() => "")) || `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, data };
    };

    const cancelRequest = async (requestId: number): Promise<MutationResult> => {
      if (!companyId) return { ok: false, error: "Sesión inválida" };
      const res = await fetch(`/api/company/${companyId}/finance/requests/${requestId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        return { ok: false, error: (await res.text().catch(() => "")) || `HTTP ${res.status}` };
      }
      return { ok: true, data: null };
    };

    // ════════════════════════════════════════════════════════════════════
    // VOUCHERS
    // ════════════════════════════════════════════════════════════════════
    const fetchVouchers = async (filters: {
      status?: VoucherStatus | "all";
      mine?: boolean;
      siteId?: number;
    } = {}): Promise<Voucher[]> => {
      if (!companyId) return [];
      const params = new URLSearchParams();
      if (filters.status && filters.status !== "all") params.set("status", filters.status);
      if (filters.mine) params.set("mine", "true");
      if (filters.siteId) params.set("siteId", String(filters.siteId));
      const qs = params.toString();
      const res = await fetch(
        `/api/company/${companyId}/finance/vouchers${qs ? `?${qs}` : ""}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      const json = await res.json();
      return (json.vouchers ?? []) as Voucher[];
    };

    const closeVoucher = async (params: {
      voucherId: number;
      actualAmount: number;
      invoiceId?: number;
      notes?: string;
    }): Promise<MutationResult<{ refundAmount: number }>> => {
      if (!companyId) return { ok: false, error: "Sesión inválida" };
      const res = await fetch(
        `/api/company/${companyId}/finance/vouchers/${params.voucherId}/close`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actualAmount: params.actualAmount,
            invoiceId: params.invoiceId,
            notes: params.notes,
          }),
        },
      );
      if (!res.ok) {
        return { ok: false, error: (await res.text().catch(() => "")) || `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, data };
    };

    const downloadVoucherPdf = async (voucherId: number): Promise<void> => {
      if (!companyId) return;
      const res = await fetch(
        `/api/company/${companyId}/finance/vouchers/${voucherId}/pdf`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    };

    /**
     * Cierre de vale desde el drawer de un mantenimiento.
     * La factura viene del attachment del mantenimiento (NO se sube de nuevo).
     */
    const closeVoucherFromMaintenance = async (params: {
      voucherId: number;
      actualAmount: number;
      notes?: string;
      invoiceAttachmentKey: string;
    }): Promise<MutationResult<{ refundAmount: number; invoiceId: number }>> => {
      if (!companyId) return { ok: false, error: "Sesión inválida" };
      const res = await fetch(
        `/api/company/${companyId}/finance/vouchers/${params.voucherId}/close-from-maintenance`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actualAmount: params.actualAmount,
            notes: params.notes,
            invoiceAttachmentKey: params.invoiceAttachmentKey,
          }),
        },
      );
      if (!res.ok) {
        return { ok: false, error: (await res.text().catch(() => "")) || `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, data };
    };

    /**
     * jul 2026 v4 — Sube el comprobante (foto o PDF) al storage de la app.
     * Devuelve la URL relativa + metadata (mime, name, size). Usado por el
     * flujo de cerrar vale STANDALONE en CajaChicaPage.
     */
    const uploadReceipt = async (file: File): Promise<
      MutationResult<{ url: string; type: string; name: string; size: number }>
    > => {
      if (!companyId) return { ok: false, error: "Sesión inválida" };
      const fd = new FormData();
      fd.append("receipt", file);
      const res = await fetch(
        `/api/upload/finance-receipts?companyId=${companyId}`,
        { method: "POST", credentials: "include", body: fd },
      );
      if (!res.ok) {
        return { ok: false, error: (await res.text().catch(() => "")) || `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, data };
    };

    /**
     * jul 2026 v4 — Crea una fila en company_invoices asociada al vale
     * (source_module='petty_cash'). El backend responde con invoiceId,
     * que el caller pasa a closeVoucher en el siguiente paso. Si el
     * vale ya tiene una invoice, este endpoint la UPSERTS.
     */
    const createInvoiceForVoucher = async (params: {
      voucherId: number;
      fileUrl: string;
      fileMimeType: string;
      kind: 'repuesto' | 'mano_obra' | 'lavada' | 'otro';
      supplierName?: string | null;
      supplierId?: number | null;
      ivaPercent?: number | null;
      ivaAmount?: number | null;
      total: number;
      items?: Array<{
        description: string;
        quantity: number | string;
        unitPrice: number | string;
        subtotal: number | string;
        imageUrl?: string | null;
        imagePending?: boolean;
      }>;
      workshopName?: string | null;
      workerName?: string | null;
    }): Promise<MutationResult<{ invoiceId: number; created: boolean }>> => {
      if (!companyId) return { ok: false, error: "Sesión inválida" };
      // jul 2026 v4-b — El backend usa :id en la URL, no en el body, y
      // el Zod schema del endpoint tiene .strict() que rechaza keys
      // desconocidas. Extraemos voucherId del body antes de stringify.
      const { voucherId, ...body } = params;
      const res = await fetch(
        `/api/company/${companyId}/finance/vouchers/${voucherId}/invoice`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        return { ok: false, error: (await res.text().catch(() => "")) || `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, data: { invoiceId: data.invoiceId, created: !!data.created } };
    };

    /**
     * Trae el estado financiero de un mantenimiento:
     * solicitudes pendientes, vale abierto si existe, etc.
     */
    const fetchMaintenanceFinance = async (maintenanceId: number): Promise<{
      requests: FinanceRequest[];
      openVoucher: Voucher | null;
    }> => {
      if (!companyId) return { requests: [], openVoucher: null };
      const res = await fetch(
        `/api/company/${companyId}/finance/maintenance/${maintenanceId}/status`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      return res.json();
    };

    // jul 2026 v4-b — Detalle de UNA factura. Usado por ViewVoucherModal
    // para mostrar los items + comprobante del vale cerrado.
    // El backend espera el ID con prefijo `invoice-N` (lo parsea con
    // parseId('invoice', id)). Si llega pelado, tira 400 "ID inválido".
    const getInvoice = async (invoiceId: number | string): Promise<MutationResult<{ invoice: any }>> => {
      if (!companyId) return { ok: false, error: "Sesión inválida" };
      const idStr = String(invoiceId);
      // Prefijar solo si NO viene ya con `invoice-`.
      const finalId = /^invoice-\d+$/.test(idStr) ? idStr : `invoice-${idStr}`;
      const res = await fetch(
        `/api/company/${companyId}/finance-invoices/${finalId}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        return { ok: false, error: (await res.text().catch(() => "")) || `HTTP ${res.status}` };
      }
      const data = await res.json();
      return { ok: true, data };
    };

    // ════════════════════════════════════════════════════════════════════
    // TRANSACTIONS
    // ════════════════════════════════════════════════════════════════════
    const fetchTransactions = async (filters: {
      scope?: "petty_cash" | "annual" | "all";
      fromDate?: string;
      toDate?: string;
    } = {}): Promise<TransactionItem[]> => {
      if (!companyId) return [];
      const params = new URLSearchParams();
      params.set("scope", filters.scope ?? "all");
      if (filters.fromDate) params.set("from", filters.fromDate);
      if (filters.toDate) params.set("to", filters.toDate);
      const res = await fetch(
        `/api/company/${companyId}/finance/transactions?${params.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      const json = await res.json();
      return (json.items ?? []) as TransactionItem[];
    };

    const downloadTransactionsPdf = async (filters: {
      scope?: "petty_cash" | "annual" | "all";
      fromDate?: string;
      toDate?: string;
    } = {}): Promise<void> => {
      if (!companyId) return;
      const params = new URLSearchParams();
      params.set("scope", filters.scope ?? "all");
      if (filters.fromDate) params.set("from", filters.fromDate);
      if (filters.toDate) params.set("to", filters.toDate);
      const res = await fetch(
        `/api/company/${companyId}/finance/transactions/export.pdf?${params.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    };

    return {
      pettyCash: {
        fetchAccount,
        upsertAccount,
        replenishAccount,
      },
      requests: {
        fetch: fetchRequests,
        create: createRequest,
        review: reviewRequest,
        cancel: cancelRequest,
      },
      vouchers: {
        fetch: fetchVouchers,
        close: closeVoucher,
        closeFromMaintenance: closeVoucherFromMaintenance,
        downloadPdf: downloadVoucherPdf,
        // jul 2026 v4 — Para cerrar vales STANDALONE con comprobante:
        uploadReceipt,
        createInvoice: createInvoiceForVoucher,
      },
      maintenance: {
        fetchFinance: fetchMaintenanceFinance,
      },
      invoices: {
        get: getInvoice,
      },
      transactions: {
        fetch: fetchTransactions,
        downloadPdf: downloadTransactionsPdf,
      },
    };
  }, [companyId]);
}

// ─── Hook de WebSocket específico para finanzas ──────────────────────────────
//
// Re-usa el contexto WebSocket si está disponible. El componente que use
// los datos debe hacer su propio polling si no hay WS. (Para simplificar,
// dejamos el WS opcional — el polling cada 30s en CajaChicaPage es suficiente
// para empezar.)

export function useFinanceRealtime(_onEvent?: (evt: { type: string; data: any }) => void) {
  // Implementación opcional: si el proyecto tiene un contexto WS compartido,
  // subscribirse acá. Lo dejamos como hook vacío para no acoplar a una
  // implementación específica hoy — el polling cubre el caso base.
  return { connected: false };
}