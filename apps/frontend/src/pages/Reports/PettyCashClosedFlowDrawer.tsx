"use client";

/**
 * PettyCashClosedFlowDrawer
 *
 * jul 2026 — Línea de tiempo (timeline) del flujo completo de una cuenta de
 * caja chica cerrada. Se renderiza dentro del side panel del módulo Caja
 * Chica histórica (rep-010) en el Centro de Reportes.
 *
 * Mezcla y ordena cronológicamente:
 *   - movements (initial_assignment, replenishment, period_reset_in/out, ...)
 *   - vouchers cerrados (con refundAmount + invoice link)
 *   - solicitudes (created / approved / rejected)
 *
 * Diseño: timeline vertical con dot coloreado por tipo de evento. Cada
 * entry muestra: timestamp, icono, título, descripción, monto, balance
 * (si aplica) y nombre del actor. Header con resumen del periodo.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Loader2, AlertTriangle, Wallet, Plus, Calendar, Receipt,
  Clock, Check, X, XCircle, ArrowDownCircle, ArrowUpCircle,
  Banknote, FileText, Building2, User, RefreshCcw,
} from "lucide-react";
import { useFinance } from "../../hooks/useFinance";
import type {
  PettyCashAccountFlow, PettyCashFlowEvent, PettyCashClosedAccountRow,
} from "../../hooks/useFinance";

type Props = {
  companyId: number | null;
  accountId: number | null;
  closedAccount: PettyCashClosedAccountRow | null;
};

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtMoney(n: number | null | undefined, signed = false): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const v = Number(n);
  const sign = signed && v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)} USD`;
}

function fmtDateTime(s: string | Date | null | undefined): string {
  if (!s) return "—";
  const d = typeof s === "string" ? new Date(s) : s;
  if (isNaN(d.getTime())) return "—";
  const date = d.toISOString().slice(0, 10);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${date} ${hh}:${mm}`;
}

function fmtDate(s: string | Date | null | undefined): string {
  if (!s) return "—";
  const str = typeof s === "string" ? s : s.toISOString();
  return str.slice(0, 10);
}

// ─── Config visual por tipo de evento ────────────────────────────────────────

type EventVisual = {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: "emerald" | "rose" | "amber" | "violet" | "slate" | "blue";
  title: string;
  amountSigned?: boolean;     // si true, muestra + o - según el monto
  showBalance?: boolean;      // si true, muestra balanceAfter a la derecha
};

const TONE_BG: Record<EventVisual["tone"], string> = {
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-500/30",
  rose:    "bg-rose-100    text-rose-700    dark:bg-rose-500/15    dark:text-rose-300    ring-rose-200    dark:ring-rose-500/30",
  amber:   "bg-amber-100   text-amber-700   dark:bg-amber-500/15   dark:text-amber-300   ring-amber-200   dark:ring-amber-500/30",
  violet:  "bg-violet-100  text-violet-700  dark:bg-violet-500/15  dark:text-violet-300  ring-violet-200  dark:ring-violet-500/30",
  slate:   "bg-slate-100   text-slate-600   dark:bg-white/[0.06]   dark:text-slate-300   ring-slate-200   dark:ring-white/[0.10]",
  blue:    "bg-blue-100    text-blue-700    dark:bg-blue-500/15    dark:text-blue-300    ring-blue-200    dark:ring-blue-500/30",
};

const TONE_DOT: Record<EventVisual["tone"], string> = {
  emerald: "bg-emerald-500 ring-emerald-200 dark:ring-emerald-500/40",
  rose:    "bg-rose-500    ring-rose-200    dark:ring-rose-500/40",
  amber:   "bg-amber-500   ring-amber-200   dark:ring-amber-500/40",
  violet:  "bg-violet-500  ring-violet-200  dark:ring-violet-500/40",
  slate:   "bg-slate-400   ring-slate-200   dark:ring-white/20",
  blue:    "bg-blue-500    ring-blue-200    dark:ring-blue-500/40",
};

const MOVEMENT_VISUAL: Record<string, EventVisual> = {
  initial_assignment: { icon: Wallet,   tone: "emerald", title: "Asignación inicial",   amountSigned: false, showBalance: true },
  replenishment:      { icon: Plus,     tone: "emerald", title: "Reposición de caja",   amountSigned: true,  showBalance: true },
  period_reset_in:    { icon: Calendar, tone: "blue",    title: "Inicio de periodo",    amountSigned: true,  showBalance: true },
  period_reset_out:   { icon: Calendar, tone: "rose",    title: "Cierre de periodo",    amountSigned: true,  showBalance: true },
};

const REQUEST_VISUAL: Record<string, EventVisual> = {
  pending:   { icon: Clock, tone: "amber",  title: "Solicitud creada" },
  approved:  { icon: Check, tone: "emerald", title: "Solicitud aprobada" },
  rejected:  { icon: X,     tone: "rose",   title: "Solicitud rechazada" },
  cancelled: { icon: XCircle, tone: "slate", title: "Solicitud cancelada" },
};

const DEFAULT_MOVEMENT_VISUAL: EventVisual = {
  icon: ArrowDownCircle, tone: "slate", title: "Movimiento", amountSigned: true, showBalance: true,
};

// ─── Sub-componente: entry del timeline ───────────────────────────────────────

function TimelineEntry({
  event,
  isLast,
  index,
}: {
  event: PettyCashFlowEvent;
  isLast: boolean;
  index: number;
}) {
  let visual: EventVisual;
  let amount: number | null = null;
  let balanceAfter: number | null = null;
  let primaryText: string | null = null;
  let secondaryText: string | null = null;
  let actorName: string | null = null;
  let timestamp: string;
  let extra: React.ReactNode = null;

  if (event.kind === "movement") {
    visual = MOVEMENT_VISUAL[event.type] ?? DEFAULT_MOVEMENT_VISUAL;
    amount = event.amount;
    balanceAfter = event.balanceAfter;
    primaryText = event.note;
    actorName = event.actorName;
    timestamp = fmtDateTime(event.occurredAt);
    if (event.relatedRequestId != null) {
      extra = (
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          · solicitud #{event.relatedRequestId}
        </span>
      );
    } else if (event.relatedVoucherId != null) {
      extra = (
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          · vale #{event.relatedVoucherId}
        </span>
      );
    }
  } else if (event.kind === "voucher") {
    visual = { icon: Receipt, tone: "violet", title: event.closedAt ? "Vale cerrado" : "Vale emitido" };
    amount = -event.issuedAmount; // vale SIEMPRE resta del saldo al emitirse
    balanceAfter = null; // no lo calculamos acá (sería orden inverso)
    primaryText = event.closedNotes
      ?? (event.closedInvoiceNumber ? `Factura: ${event.closedInvoiceNumber}` : null)
      ?? event.purpose
      ?? null;
    secondaryText = `Asignado a ${event.assignedToName}`;
    actorName = event.assignedToName;
    timestamp = fmtDateTime(event.closedAt ?? event.createdAt);
    if (event.closedInvoiceNumber) {
      extra = (
        <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 dark:bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          <FileText size={9} />
          {event.closedInvoiceNumber}
        </span>
      );
    }
    if (event.refundAmount > 0) {
      secondaryText = `${secondaryText ?? ""} · Reembolso: ${fmtMoney(event.refundAmount)}`.trim();
    }
  } else {
    // request
    visual = REQUEST_VISUAL[event.status] ?? REQUEST_VISUAL.pending;
    amount = event.amount;
    primaryText = event.reason;
    secondaryText = event.approverName
      ? `${event.requesterName} → ${event.approverName}`
      : event.requesterName;
    actorName = event.requesterName;
    timestamp = fmtDateTime(event.reviewedAt ?? event.createdAt);
    if (event.classification && event.classification !== "pending") {
      const label = event.classification === "petty_cash" ? "Caja chica"
                  : event.classification === "annual_expense" ? "Gasto anual"
                  : event.classification;
      extra = (
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          · {label}
        </span>
      );
    }
    if (event.rejectionReason) {
      extra = (
        <span className="text-[10px] text-rose-500 dark:text-rose-400">
          · {event.rejectionReason}
        </span>
      );
    }
  }

  const Icon = visual.icon;
  const dotCls = TONE_DOT[visual.tone];
  const iconCls = TONE_BG[visual.tone];

  return (
    <div className="relative flex gap-3 pb-5" data-event-index={index}>
      {/* Vertical line + dot */}
      <div className="relative flex flex-col items-center">
        <span
          className={`z-10 flex h-8 w-8 items-center justify-center rounded-full ring-4 ${iconCls}`}
        >
          <Icon size={14} />
        </span>
        {!isLast && (
          <span className="absolute top-8 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-gradient-to-b from-gray-200 via-gray-100 to-transparent dark:from-white/[0.08] dark:via-white/[0.04] dark:to-transparent" />
        )}
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-800 dark:text-white">
              {visual.title}
              {extra}
            </p>
            {(primaryText || secondaryText) && (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {primaryText}
                {secondaryText && primaryText && " · "}
                {secondaryText}
              </p>
            )}
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {timestamp}
              {actorName && <> · {actorName}</>}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
            {amount != null && (
              <span
                className={`text-sm font-bold tabular-nums ${
                  amount > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : amount < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {fmtMoney(amount, visual.amountSigned)}
              </span>
            )}
            {visual.showBalance && balanceAfter != null && (
              <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 tabular-nums">
                saldo {fmtMoney(balanceAfter)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function PettyCashClosedFlowDrawer({
  companyId,
  accountId,
  closedAccount,
}: Props) {
  const finance = useFinance();
  const [flow, setFlow] = useState<PettyCashAccountFlow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId || !companyId) {
      setFlow(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await finance.pettyCash.fetchAccountFlow(accountId);
        if (cancelled) return;
        setFlow(data);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setFlow(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, companyId]);

  // Métricas del header (calculadas desde la fila del listado si aún no
  // terminó la carga del flow, así no hay flash de "Sin datos").
  const headerSummary = useMemo(() => {
    if (flow) {
      const a = flow.account;
      const totalReplenishment = flow.timeline
        .filter((e): e is Extract<PettyCashFlowEvent, { kind: "movement" }> =>
          e.kind === "movement" && (e.type === "replenishment" || e.type === "period_reset_in")
        )
        .reduce((sum, e) => sum + Math.max(0, e.amount), 0);
      const totalSpent = flow.timeline
        .filter((e): e is Extract<PettyCashFlowEvent, { kind: "voucher" }> => e.kind === "voucher")
        .reduce((sum, e) => sum + e.issuedAmount, 0);
      const totalRequests = flow.timeline
        .filter((e): e is Extract<PettyCashFlowEvent, { kind: "request" }> => e.kind === "request")
        .length;
      return {
        site: a.siteName,
        siteCode: a.siteCode,
        mode: a.mode,
        periodKind: a.periodKind,
        periodStart: a.periodStartedAt,
        closedAt: a.closedAt,
        isActive: a.isActive,
        initialAmount: a.initialAmount,
        finalBalance: a.currentBalance,
        limitAmount: a.limitAmount,
        totalReplenishment,
        totalSpent,
        totalRequests,
        movementsCount: flow.timeline.filter(e => e.kind === "movement").length,
        vouchersCount:  flow.timeline.filter(e => e.kind === "voucher").length,
      };
    }
    if (closedAccount) {
      return {
        site: closedAccount.siteName,
        siteCode: closedAccount.siteCode,
        mode: closedAccount.mode,
        periodKind: closedAccount.periodKind,
        periodStart: closedAccount.periodStartedAt,
        closedAt: closedAccount.closedAt,
        isActive: false,
        initialAmount: closedAccount.initialAmount,
        finalBalance: closedAccount.finalBalance,
        limitAmount: closedAccount.limitAmount,
        totalReplenishment: 0,
        totalSpent: 0,
        totalRequests: closedAccount.requestCount,
        movementsCount: closedAccount.movementCount,
        vouchersCount: closedAccount.voucherCount,
      };
    }
    return null;
  }, [flow, closedAccount]);

  if (!accountId) {
    return (
      <div className="px-1 py-8 text-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">Sin cuenta seleccionada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header resumen del periodo */}
      {headerSummary && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.04]">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
              <Wallet2Icon />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Cuenta #{accountId}
                {headerSummary.isActive && (
                  <span className="ml-2 inline-flex items-center rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    Activa
                  </span>
                )}
                {!headerSummary.isActive && (
                  <span className="ml-2 inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
                    Cerrada
                  </span>
                )}
              </p>
              <h3 className="mt-0.5 text-sm font-semibold text-gray-800 dark:text-white">
                {headerSummary.site}
                {headerSummary.siteCode && (
                  <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">
                    ({headerSummary.siteCode})
                  </span>
                )}
              </h3>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                <Building2 size={10} className="inline" />{" "}
                {fmtDate(headerSummary.periodStart)} → {fmtDate(headerSummary.closedAt)}
                {" · "}
                {headerSummary.mode === "period"
                  ? `Periodo (${headerSummary.periodKind === "weekly" ? "semanal" : "mensual"})`
                  : "Saldo (umbral)"}
              </p>
            </div>
          </div>

          {/* KPI mini grid */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <KpiMini label="Inicial"  value={fmtMoney(headerSummary.initialAmount)} tone="info" />
            <KpiMini label="Final"    value={fmtMoney(headerSummary.finalBalance)}  tone={headerSummary.finalBalance > 0 ? "success" : "danger"} />
            <KpiMini label="Repuesto" value={fmtMoney(headerSummary.totalReplenishment)} tone="info" icon={<RefreshCcw size={11} />} />
            <KpiMini label="Gastado"  value={fmtMoney(headerSummary.totalSpent)} tone="warning" icon={<Banknote size={11} />} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <span>
              <strong className="block text-sm tabular-nums text-gray-700 dark:text-gray-200">
                {headerSummary.movementsCount}
              </strong>
              movimientos
            </span>
            <span>
              <strong className="block text-sm tabular-nums text-gray-700 dark:text-gray-200">
                {headerSummary.vouchersCount}
              </strong>
              vales
            </span>
            <span>
              <strong className="block text-sm tabular-nums text-gray-700 dark:text-gray-200">
                {headerSummary.totalRequests}
              </strong>
              solicitudes
            </span>
          </div>
        </div>
      )}

      {/* Timeline */}
      {loading && !flow && (
        <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-xs">Cargando flujo...</span>
        </div>
      )}

      {error && !flow && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/[0.08] dark:text-rose-300">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">No se pudo cargar el flujo</p>
            <p className="mt-0.5 text-[11px] opacity-80">{error}</p>
          </div>
        </div>
      )}

      {flow && flow.timeline.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center dark:border-white/[0.08]">
          <ArrowUpCircle size={20} className="mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Esta cuenta no registró movimientos.
          </p>
        </div>
      )}

      {flow && flow.timeline.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.04]">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Línea de tiempo
          </p>
          <div>
            {flow.timeline.map((event, i) => (
              <TimelineEntry
                key={`${event.kind}-${event.id}-${i}`}
                event={event}
                index={i}
                isLast={i === flow.timeline.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes auxiliares ───────────────────────────────────────────────

function Wallet2Icon() {
  return <Wallet size={16} />;
}

type Tone = "info" | "success" | "warning" | "danger";
function KpiMini({
  label, value, tone, icon,
}: {
  label: string;
  value: string;
  tone: Tone;
  icon?: React.ReactNode;
}) {
  const toneCls: Record<Tone, string> = {
    info:    "text-gray-700 dark:text-gray-200",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger:  "text-rose-600 dark:text-rose-400",
  };
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/50 px-3 py-2 dark:border-white/[0.04] dark:bg-white/[0.02]">
      <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {icon}
        {label}
      </p>
      <p className={`mt-0.5 text-sm font-bold tabular-nums ${toneCls[tone]}`}>
        {value}
      </p>
    </div>
  );
}
