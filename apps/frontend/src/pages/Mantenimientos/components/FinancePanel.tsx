"use client";

// pages/Mantenimientos/components/FinancePanel.tsx
//
// jul 2026 v4 — Botón compacto + indicador de estado financiero del mantenimiento.
//
// UI:
//   - Header del drawer: pill/botón pequeño a la derecha del título (junto a PDF/X).
//   - El botón se mantiene STICKY en la parte superior del drawer (position: sticky;
//     top: 0 dentro del header que ya tiene overflow).
//   - Estados: ninguno / pendiente / gasto-anual / vale-abierto / vale-cerrado.
//   - Al click, abre modal. La sede NO se elige — se autoasigna desde el
//     mantenimiento (item.siteId) o el usuario logueado (fallback).
//
// Componente separado para no inflar el MaintenanceDetailDrawer (que ya tiene
// ~1700 líneas). Se monta solo si el mantenimiento está en "En proceso".

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  DollarSign, Plus, Check, X, Wallet, Clock, CheckCircle2, Loader2, ExternalLink, ChevronRight, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useFinance } from "../../../hooks/useFinance";
import type { Maintenance, MaintenanceAttachment } from "../../../hooks/useMaintenancesV2";

interface Snapshot {
  requests: Array<{
    id: number;
    amount: string;
    reason: string;
    status: string;
    classification: string;
    requesterName: string | null;
    createdAt: Date;
  }>;
  openVoucher: null | {
    id: number;
    issuedAmount: number;
    status: string;
    siteId: number;
    closedInvoiceId?: number | null;
  };
  // jul 2026 v4 — vales ya cerrados. Sirven para mostrar el link al
  // comprobante en el drawer del mantenimiento.
  closedVouchers: Array<{
    id: number;
    issuedAmount: number;
    closedActualAmount: number | null;
    closedInvoiceId: number | null;
    refundAmount: number;
    closedAt: Date | null;
  }>;
}

function fmtMoney(n: string | number | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(num);
}

// ─── Componente principal ──────────────────────────────────────────────────

export function FinancePanel({
  maintenanceId, item, onChanged,
}: {
  // Acepta string o number — el id puede venir como "maintenance-28" del
  // selector o como 28 numérico. Lo parseamos abajo.
  maintenanceId: string | number;
  item: Maintenance;
  onChanged: () => void;
}) {
  const finance = useFinance();
  const [snapshot, setSnapshot] = useState<Snapshot>({
    requests: [],
    openVoucher: null,
    closedVouchers: [],
  });
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showCloseVoucher, setShowCloseVoucher] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await finance.maintenance.fetchFinance(maintenanceId);
      setSnapshot(data);
    } catch {
      // Silenciar — el panel solo muestra datos si los hay.
    } finally {
      setLoading(false);
    }
  }, [finance, maintenanceId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const isProceso = item.status === "En proceso" || item.status === "En curso";
  if (!isProceso) return null;

  const pendingRequest = snapshot.requests.find(r => r.status === "pending");
  const annualRequest = snapshot.requests.find(
    r => r.classification === "annual_expense" && r.status === "approved",
  );
  const closedVoucherRequest = snapshot.requests.find(
    r => r.classification === "petty_cash" && r.status === "approved" && !snapshot.openVoucher,
  );

  // ── Render del indicador compacto (botón o badge) ──────────────────────
  // Caso 1: sin solicitud → botón "Caja Chica" verde
  // Caso 2: pendiente → badge ámbar "Solicitud #N · pendiente"
  // Caso 3: gasto anual aprobado → badge violeta "Gasto anual #N"
  // Caso 4: vale abierto → botón verde "Vale #N · abierto" (click → cierra)
  // Caso 5: vale cerrado → badge gris "Vale #N · cerrado"

  let indicator: React.ReactNode = null;
  if (snapshot.requests.length === 0) {
    indicator = (
      <button
        type="button"
        onClick={() => setShowCreate(true)}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 backdrop-blur transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/25"
        title="Solicitar recurso a finanzas"
      >
        {loading ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
        Caja Chica
      </button>
    );
  } else if (pendingRequest) {
    indicator = (
      <span
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200"
        title={`Solicitud #${pendingRequest.id} pendiente — ${pendingRequest.reason} · $${Number(pendingRequest.amount).toFixed(2)}`}
      >
        <Clock size={11} />
        Sol. #{pendingRequest.id} · pendiente
        <a
          href="/finanzas/caja-chica?tab=solicitudes"
          onClick={e => e.stopPropagation()}
          className="ml-1 hover:underline"
          title="Ir a Caja Chica"
        >
          <ExternalLink size={10} />
        </a>
      </span>
    );
  } else if (snapshot.openVoucher) {
    indicator = (
      <button
        type="button"
        onClick={() => setShowCloseVoucher(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-100 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm backdrop-blur transition hover:bg-emerald-200 dark:border-emerald-500/40 dark:bg-emerald-500/25 dark:text-emerald-100 dark:hover:bg-emerald-500/35"
        title={`Vale #${snapshot.openVoucher.id} abierto · Emitido $${snapshot.openVoucher.issuedAmount.toFixed(2)} — Click para finalizar`}
      >
        <Wallet size={11} />
        Vale #{snapshot.openVoucher.id} · abierto
        <ChevronRight size={11} />
      </button>
    );
  } else if (annualRequest) {
    indicator = (
      <span
        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200"
        title={`Solicitud #${annualRequest.id} aprobada como gasto anual · ${annualRequest.reason} · $${Number(annualRequest.amount).toFixed(2)}`}
      >
        <CheckCircle2 size={11} />
        Gasto anual #{annualRequest.id}
      </span>
    );
  } else if (closedVoucherRequest) {
    // jul 2026 v4 — Si hay un vale cerrado y trajo invoiceId, mostramos
    // el link al comprobante directamente.
    const closed = snapshot.closedVouchers.find(v => v.id === closedVoucherRequest.id);
    if (closed?.closedInvoiceId) {
      indicator = (
        <a
          href={`/finanzas/facturas?q=CC-${closed.closedInvoiceId}`}
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/25"
          title={`Solicitud #${closedVoucherRequest.id} cerrada · Ver comprobante CC-${String(closed.closedInvoiceId).padStart(3, "0")}`}
        >
          <CheckCircle2 size={11} />
          Caja #{closedVoucherRequest.id} cerrada
          <ExternalLink size={10} />
        </a>
      );
    } else {
      indicator = (
        <span
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-1.5 text-xs font-medium text-emerald-700/80 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200/80"
          title={`Solicitud #${closedVoucherRequest.id} cerrada (sin comprobante adjunto)`}
        >
          <CheckCircle2 size={11} />
          Caja #{closedVoucherRequest.id} cerrada
        </span>
      );
    }
  }

  return (
    <>
      {indicator}
      {showCreate && (
        <CreateFinanceRequestModal
          maintenanceId={maintenanceId}
          siteId={(item as any).siteId ?? null}
          onClose={() => { setShowCreate(false); void refetch(); onChanged(); }}
        />
      )}
      {showCloseVoucher && snapshot.openVoucher && (
        <CloseVoucherFromMaintenanceModal
          voucherId={snapshot.openVoucher.id}
          issuedAmount={snapshot.openVoucher.issuedAmount}
          attachments={(item.attachments ?? []) as unknown as MaintenanceAttachment[]}
          onClose={() => { setShowCloseVoucher(false); void refetch(); onChanged(); }}
        />
      )}
    </>
  );
}

// ─── Modal: crear solicitud ────────────────────────────────────────────────

function CreateFinanceRequestModal({
  maintenanceId, siteId, onClose,
}: {
  maintenanceId: string | number;
  siteId: number | null;
  onClose: () => void;
}) {
  const finance = useFinance();
  // Sede auto-asignada: del mantenimiento, o de la cuenta activa de la empresa.
  // Traemos SIEMPRE la lista desde el endpoint de finanzas — no usamos
  // session.siteId ni useSites ni ningún hook cruzado. El endpoint
  // /finance/petty-cash devuelve availableSites (todas las sedes de la empresa)
  // sin requerir permiso de gestion.sedes.
  const [siteName, setSiteName] = useState<string>("");
  const [resolvedSiteId, setResolvedSiteId] = useState<number | null>(null);
  const [loadingSite, setLoadingSite] = useState(true);
  const [noAccount, setNoAccount] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await finance.pettyCash.fetchAccount();
        if (!data) {
          setNoAccount(true);
          setLoadingSite(false);
          return;
        }
        // Si hay cuentas, priorizamos la del mantenimiento.
        if ("accounts" in data && data.accounts.length > 0) {
          const matched = siteId
            ? data.accounts.find(a => a.siteId === siteId)
            : null;
          const chosen = matched ?? data.accounts[0];
          setResolvedSiteId(chosen.siteId);
          setSiteName(chosen.siteName ?? `Sede #${chosen.siteId}`);
        } else {
          setNoAccount(true);
        }
      } catch {
        setNoAccount(true);
      } finally {
        setLoadingSite(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (noAccount || !resolvedSiteId) {
      toast.error("No hay caja chica activa. Pedile a un admin que la configure.");
      return;
    }
    if (!amount || !reason.trim()) {
      toast.error("Completá monto y motivo");
      return;
    }
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Monto inválido");
      return;
    }
    setSubmitting(true);
    // maintenanceId puede venir como "maintenance-28" o como 28 numérico.
    // Lo normalizamos a número antes de mandarlo al backend.
    const mIdNum = typeof maintenanceId === 'string'
      ? Number(maintenanceId.replace(/\D/g, ''))
      : maintenanceId;
    if (!Number.isFinite(mIdNum) || mIdNum <= 0) {
      toast.error("ID de mantenimiento inválido");
      setSubmitting(false);
      return;
    }
    const result = await finance.requests.create({
      siteId: resolvedSiteId,
      amount: amt,
      reason: reason.trim(),
      justificationNotes: notes || undefined,
      // 'maintenance' = anticipo genérico atado al mantenimiento completo,
      // sin item específico. El aprobador lo va a asociar al item cuando
      // se concrete la compra.
      origin: "maintenance",
      maintenanceId: mIdNum,
    });
    setSubmitting(false);
    if (result.ok) {
      toast.success(`Solicitud #${result.data.numericId} creada. Pendiente de aprobación.`);
      onClose();
    } else {
      toast.error(result.error);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-gray-900"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 p-4 dark:border-white/[0.06]">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-gray-100">
            <DollarSign size={16} className="text-emerald-500" />
            Solicitar recurso a finanzas
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 p-4">
          {/* Sede auto-asignada — siempre viene del endpoint /finance/petty-cash.
              No usamos session.siteId ni nada del JWT. */}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">Sede</label>
            {loadingSite ? (
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.03]">
                <Loader2 size={14} className="animate-spin" />
                <span>Buscando caja activa…</span>
              </div>
            ) : noAccount ? (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                <AlertCircle size={14} className="shrink-0" />
                <span>No hay caja chica activa en la empresa.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
                <Wallet size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="truncate font-semibold">{siteName}</span>
                <span className="ml-auto shrink-0 rounded-full bg-emerald-200/60 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-200">
                  asignada
                </span>
              </div>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">Monto (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">Motivo</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ej: repuesto urgente para mantenimiento"
              className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200"
              placeholder="Justificación adicional"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || noAccount || !resolvedSiteId}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting && <Loader2 size={12} className="animate-spin" />}
              Crear solicitud
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Modal: cerrar vale desde mantenimiento ────────────────────────────────

function CloseVoucherFromMaintenanceModal({
  voucherId, issuedAmount, attachments, onClose,
}: {
  voucherId: number;
  issuedAmount: number;
  attachments: MaintenanceAttachment[];
  onClose: () => void;
}) {
  const finance = useFinance();
  const invoiceAttachments = attachments.filter(
    a => a.invoiceNumber && String(a.invoiceNumber).trim().length > 0,
  );
  const [attachmentKey, setAttachmentKey] = useState<string>(
    invoiceAttachments[0]?.key ?? "main",
  );
  const [actual, setActual] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const actualNum = parseFloat(actual);
  const willRefund = Number.isFinite(actualNum) && actualNum < issuedAmount;
  const refundPreview = willRefund ? issuedAmount - actualNum : 0;

  const submit = async () => {
    if (!Number.isFinite(actualNum) || actualNum < 0) {
      toast.error("Monto inválido");
      return;
    }
    if (invoiceAttachments.length === 0) {
      toast.error("Primero sube la factura del proveedor como adjunto del mantenimiento");
      return;
    }
    setSubmitting(true);
    const result = await finance.vouchers.closeFromMaintenance({
      voucherId,
      actualAmount: actualNum,
      notes,
      invoiceAttachmentKey: attachmentKey,
    });
    setSubmitting(false);
    if (result.ok) {
      if (result.data.refundAmount > 0) {
        toast.success(`Vale cerrado. Se devolvieron $${result.data.refundAmount.toFixed(2)} a caja chica.`);
      } else {
        toast.success("Vale cerrado");
      }
      onClose();
    } else {
      toast.error(result.error);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-gray-900"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 p-4 dark:border-white/[0.06]">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-gray-100">
            <Check size={16} className="text-emerald-500" />
            Cerrar vale #{voucherId}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:bg-blue-500/10 dark:text-blue-200">
            <p>Vale emitido: <strong>{fmtMoney(issuedAmount)}</strong></p>
            <p className="mt-0.5 text-[10px]">Se usa la factura del mantenimiento (no necesitás subirla de nuevo).</p>
          </div>

          {invoiceAttachments.length === 0 ? (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="font-semibold">No hay facturas cargadas en este mantenimiento.</p>
              <p className="mt-1 text-[10px]">
                Volvé a la sección "Facturas y evidencias" del drawer y subí el PDF del proveedor primero.
              </p>
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Factura a usar
              </label>
              <select
                value={attachmentKey}
                onChange={e => setAttachmentKey(e.target.value)}
                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200"
              >
                {invoiceAttachments.map(a => (
                  <option key={a.key ?? "main"} value={a.key ?? "main"}>
                    {a.label || `Factura ${a.invoiceNumber}`} ({a.invoiceNumber})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Monto realmente gastado (USD)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={actual}
              onChange={e => setActual(e.target.value)}
              placeholder="0.00"
              className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200"
              autoFocus
            />
          </div>

          {willRefund && (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              Se devolverán <strong>{fmtMoney(refundPreview)}</strong> a caja chica.
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200"
              placeholder="Detalles de la compra, observaciones..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || invoiceAttachments.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting && <Loader2 size={12} className="animate-spin" />}
              Cerrar vale
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}