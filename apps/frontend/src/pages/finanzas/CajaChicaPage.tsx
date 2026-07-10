"use client";

// pages/finanzas/CajaChicaPage.tsx
//
// jul 2026 — Submódulo Caja Chica (Finanzas).
//
// 3 tabs internas (state local con searchParams):
//   1) Solicitudes  — listado + crear + aprobar/rechazar (modal)
//   2) Vales        — listado + cerrar vale (modal con factura) + PDF
//   3) Historial    — timeline de movimientos + export PDF
//
// Header sticky con:
//   - Saldo actual (currentBalance de la cuenta activa)
//   - Modo (period/balance) + próximo reset si aplica
//   - Botón "Rellenar caja" (solo admin_empresa / owner_empresa)
//   - Botón "Crear solicitud" (todos los que tengan finanzas.caja_chica.crear)
//
// Permisos:
//   - finanzas.caja_chica.ver       requerido para abrir la página
//   - finanzas.caja_chica.crear     permite "+ Nueva solicitud"
//   - finanzas.caja_chica.aprobar   permite aprobar/rechazar
//   - finanzas.caja_chica.reponer   permite "Rellenar caja"

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  Wallet, Plus, Loader2, X, Check, XCircle, FileDown, Eye,
  Receipt, AlertCircle, ChevronRight, Lock, Banknote,
  Calendar, CalendarDays, Building2, User, Hash, FileText, Send, Tag,
  TrendingUp, TrendingDown, RefreshCw, ExternalLink,
  Settings, Save, Edit2, Trash2, MapPin, PowerOff, PlusCircle, Wallet2, CircleDollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import {
  useFinance,
  type FinanceRequest,
  type Voucher,
  type PettyCashMovement,
  type PettyCashAccountWithSite,
} from "../../hooks/useFinance";
import { DatePicker } from "../../components/ui/date-picker/DatePicker";

// ─── Styles (consistente con FacturasPage.tsx) ──────────────────────────────

const inputCls =
  "h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200 dark:placeholder:text-gray-500";

const labelCls =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500";

const cardCls =
  "rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04]";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${day} ${months[Number(m) - 1]} ${y}`;
}

function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  const datePart = fmtDate(date);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${datePart} ${hh}:${mm}`;
}

const REQUEST_STATUS_BADGE: Record<string, string> = {
  pending:   "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  approved:  "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  rejected:  "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:ring-white/[0.10]",
};

const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending:   "Pendiente",
  approved:  "Aprobada",
  rejected:  "Rechazada",
  cancelled: "Cancelada",
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  pending:        "Sin clasificar",
  petty_cash:     "Caja chica",
  annual_expense: "Gasto anual",
};

const CLASSIFICATION_BADGE: Record<string, string> = {
  pending:        "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:ring-white/[0.10]",
  petty_cash:     "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  annual_expense: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30",
};

const VOUCHER_STATUS_BADGE: Record<string, string> = {
  open:      "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  closed:    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:ring-white/[0.10]",
};

const VOUCHER_STATUS_LABEL: Record<string, string> = {
  open:      "Abierto",
  closed:    "Cerrado",
  cancelled: "Cancelado",
};

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  initial_assignment:      "Asignación inicial",
  replenishment:           "Reposición",
  period_reset_out:        "Cierre de periodo",
  period_reset_in:         "Inicio de periodo",
  request_approved_petty:  "Solicitud aprobada",
  request_approved_annual: "Solicitud aprobada (anual)",
  voucher_closed_refund:   "Reembolso de vale",
  voucher_cancelled:       "Vale cancelado",
  manual_adjustment:       "Ajuste manual",
};

const MOVEMENT_TYPE_BADGE: Record<string, string> = {
  initial_assignment:      "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  replenishment:           "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30",
  period_reset_out:        "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:ring-white/[0.10]",
  period_reset_in:         "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30",
  request_approved_petty:  "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
  request_approved_annual: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30",
  voucher_closed_refund:   "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  voucher_cancelled:       "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:ring-white/[0.10]",
  manual_adjustment:       "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:ring-white/[0.10]",
};

// ─── Page ────────────────────────────────────────────────────────────────────

/**
 * jul 2026 v4-b — Router interno para los tabs. Si el user navega a un tab
 * sin permiso, lo mandamos a Solicitudes en lugar de mostrar la página en
 * blanco (peor UX). Vive acá y no inline para que useEffect corra en
 * el cuerpo del componente (regla de hooks).
 */
function TabBodyRouter(props: {
  tab: "solicitudes" | "vales" | "historial" | "configuracion";
  setTab: (t: "solicitudes" | "vales" | "historial" | "configuracion") => void;
  canTabSolicitudes: boolean;
  canTabVales: boolean;
  canTabHistorial: boolean;
  canTabConfig: boolean;
  canApprove: boolean;
  canCreate: boolean;
  canReplenish: boolean;
  canSeeAllRequests: boolean;
  canSeeAllVouchers: boolean;
}) {
  const {
    tab, setTab,
    canTabSolicitudes, canTabVales, canTabHistorial, canTabConfig,
    canApprove, canCreate, canReplenish,
    canSeeAllRequests, canSeeAllVouchers,
  } = props;

  // Redirigir si la pestaña actual no tiene permiso.
  useEffect(() => {
    const allowed =
      (tab === "solicitudes" && canTabSolicitudes) ||
      (tab === "vales"       && canTabVales) ||
      (tab === "historial"   && canTabHistorial) ||
      (tab === "configuracion" && canTabConfig);
    if (!allowed) setTab("solicitudes");
  }, [tab, canTabSolicitudes, canTabVales, canTabHistorial, canTabConfig, setTab]);

  if (tab === "solicitudes" && canTabSolicitudes) {
    return <RequestsTab canApprove={canApprove} canCreate={canCreate} canSeeAll={canSeeAllRequests} />;
  }
  if (tab === "vales" && canTabVales) {
    return <VouchersTab canSeeAll={canSeeAllVouchers} />;
  }
  if (tab === "historial" && canTabHistorial) {
    return <HistoryTab canReplenish={canReplenish} />;
  }
  if (tab === "configuracion" && canTabConfig) {
    return <ConfiguracionTab />;
  }
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
      <Lock className="h-4 w-4" />
      No tienes permiso para ver esta pestaña.
    </div>
  );
}

export function CajaChicaPage() {
  const { session } = useAuth();
  const { can } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();

  // jul 2026 v4-b — Permisos granulares por pestaña interna.
  // Las nuevas acciones "ver_solicitudes", "ver_vales", "ver_historial",
  // "configurar_caja" permiten que el admin configure visibilidad
  // independiente de cada tab. Si el usuario solo tiene `caja_chica.ver`,
  // caemos al fallback legacy para no romper a usuarios existentes:
  //   .ver (implícito)   => muestra Solicitudes
  //   .aprobar           => muestra Vales
  //   .aprobar o .reponer=> muestra Historial
  //   .reponer           => muestra Configuración
  const canView     = can("finanzas", "caja_chica", "ver");
  const canCreate   = can("finanzas", "caja_chica", "crear");
  const canApprove  = can("finanzas", "caja_chica", "aprobar");
  const canReplenish = can("finanzas", "caja_chica", "reponer");

  // ── Acciones virtuales por pestaña ──
  // El usuario con la nueva acción "X" la tiene; si no, vemos si coincide
  // con alguna de las legacy (ver/crear/aprobar/reponer) para no romper
  // operadores que aún no migraron sus permisos.
  const canTabSolicitudes  = can("finanzas", "caja_chica", "ver_solicitudes")  || canView;
  const canTabVales        = can("finanzas", "caja_chica", "ver_vales")        || canApprove;
  const canTabHistorial    = can("finanzas", "caja_chica", "ver_historial")    || canApprove || canReplenish;
  const canTabConfig       = can("finanzas", "caja_chica", "configurar_caja")  || canReplenish;

  // `ver_todos` es el permiso de "admin de finanzas" — bypass de filtros
  // por dueño tanto en solicitudes como en vales. Si no lo tiene, ve
  // solo los suyos.
  const canSeeAllRequests  = can("finanzas", "caja_chica", "ver_todos") || canApprove || canReplenish;
  const canSeeAllVouchers  = can("finanzas", "caja_chica", "ver_todos") || canApprove || canReplenish;

  const tab = (searchParams.get("tab") ?? "solicitudes") as "solicitudes" | "vales" | "historial" | "configuracion";
  const setTab = (t: typeof tab) => setSearchParams({ tab: t });

  if (!canView) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4">
        <Lock className="h-12 w-12 text-gray-300 dark:text-gray-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No tienes permiso para ver Caja Chica.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      {/* Header */}
      <Header
        canCreate={canCreate}
        canReplenish={canReplenish}
        activeTab={tab}
        onTabChange={setTab}
        canTabVales={canTabVales}
        canTabHistorial={canTabHistorial}
        canTabConfig={canTabConfig}
      />

      {/* Tab content.
          Si la URL apunta a un tab que el user no tiene permiso, redirigimos
          a "solicitudes" (que siempre existe si canView). El useEffect
          vive en el cuerpo del componente, no dentro del JSX. */}
      <TabBodyRouter
        tab={tab}
        setTab={setTab}
        canTabSolicitudes={canTabSolicitudes}
        canTabVales={canTabVales}
        canTabHistorial={canTabHistorial}
        canTabConfig={canTabConfig}
        canApprove={canApprove}
        canCreate={canCreate}
        canReplenish={canReplenish}
        canSeeAllRequests={canSeeAllRequests}
        canSeeAllVouchers={canSeeAllVouchers}
      />
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header({
  canCreate, canReplenish, activeTab, onTabChange,
  canTabVales, canTabHistorial, canTabConfig,
}: {
  canCreate: boolean;
  canReplenish: boolean;
  activeTab: "solicitudes" | "vales" | "historial" | "configuracion";
  onTabChange: (t: "solicitudes" | "vales" | "historial" | "configuracion") => void;
  // jul 2026 v4-b — Flags por tab. El padre los computa usando
  // `usePermissions()` con permisos granulares (`ver_vales`, etc.).
  // El Header los recibe como props en vez de recalcularlos, para
  // que coincidan con el gate del TabBodyRouter de abajo (si el tab
  // aparece acá pero está bloqueado allá, el usuario lo ve sin
  // contenido, que es peor UX).
  canTabVales: boolean;
  canTabHistorial: boolean;
  canTabConfig: boolean;
}) {
  const { session } = useAuth();
  const finance = useFinance();
  // jul 2026 v4-b — La visibilidad de cada tab se pasa como prop
  // desde el padre (CajaChicaPage) que es donde corre usePermissions().
  // Antes el Header calculaba su propio `canApprove` y se usaba como
  // gate para mostrar los tabs Vales/Historial, lo cual filtraba al
  // operador aunque tuviera `ver_vales` tildado. Ahora la decisión
  // viene del padre en las props canTabVales/Historial/Config.
  const [accounts, setAccounts] = useState<PettyCashAccountWithSite[]>([]);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [showReplenish, setShowReplenish] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingAccount(true);
      try {
        const result = await finance.pettyCash.fetchAccount();
        if (cancelled) return;
        if (result && "accounts" in result) {
          setAccounts(result.accounts);
        }
      } catch (err) {
        console.error("Error loading accounts:", err);
      } finally {
        if (!cancelled) setLoadingAccount(false);
      }
    })();
    return () => { cancelled = true; };
  }, [finance, refreshKey]);

  const totalBalance = accounts.reduce((s, a) => s + a.currentBalance, 0);
  const totalLimit   = accounts.reduce((s, a) => s + a.limitAmount, 0);

  return (
    <div className="space-y-4">
      {/* Title + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <Wallet className="h-7 w-7 text-emerald-500" />
            Caja Chica
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Solicitudes, vales e historial de movimientos.
          </p>
        </div>
        <div className="flex gap-2">
          {canReplenish && accounts.length > 0 && (
            <button
              type="button"
              onClick={() => setShowReplenish(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
            >
              <RefreshCw className="h-4 w-4" />
              Rellenar caja
            </button>
          )}
          {canCreate && accounts.length > 0 && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4" />
              Nueva solicitud
            </button>
          )}
        </div>
      </div>

      {/* Saldo card por sede */}
      {loadingAccount ? (
        <div className={`${cardCls} flex items-center justify-center p-6`}>
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : accounts.length === 0 ? (
        <div className={`${cardCls} p-6`}>
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                No hay caja chica configurada en ninguna sede.
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {canReplenish
                  ? "Configurá la primera cuenta desde la sección de configuración de empresa."
                  : "Pedile a un administrador que configure la caja chica para empezar a usarla."}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className={`${cardCls} p-4`}>
            <p className={labelCls}>Saldo total</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {fmtMoney(totalBalance)}
            </p>
            {totalLimit > 0 && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Límite total: {fmtMoney(totalLimit)}
              </p>
            )}
          </div>
          {accounts.map(a => (
            <div key={a.id} className={`${cardCls} p-4`}>
              <p className={labelCls}>
                {a.siteName ?? `Sede #${a.siteId}`}
                {a.siteCode && <span className="ml-1 text-gray-400">· {a.siteCode}</span>}
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {fmtMoney(a.currentBalance)}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {a.mode === "period"
                  ? `Modo: ${a.periodKind === "monthly" ? "Mensual" : "Semanal"}`
                  : `Límite: ${fmtMoney(a.limitAmount)}`}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs
          Visibilidad por tab (jul 2026 v4):
            Solicitudes   - finanzas.caja_chica.ver
            Vales         - finanzas.caja_chica.aprobar (admin/supervisor) | .reponer | .crear (operador solo ve los suyos, pero igual lo necesita)
            Historial     - finanzas.caja_chica.aprobar | .reponer (auditoria)
            Configuracion - finanzas.caja_chica.reponer (admin/owner)
         Operadores puros (solo ver+crear) caen siempre en Solicitudes. */}
      <div className="flex border-b border-gray-200 dark:border-white/[0.08]">
        {([
          { key: "solicitudes", label: "Solicitudes" },
          ...(canTabVales     ? [{ key: "vales" as const,       label: "Vales" }]       : []),
          ...(canTabHistorial ? [{ key: "historial" as const,   label: "Historial" }]   : []),
          ...(canTabConfig    ? [{ key: "configuracion" as const, label: "Configuración" }] : []),
        ] as const).map(({ key: t, label }) => (
          <button
            key={t}
            type="button"
            onClick={() => onTabChange(t)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              activeTab === t
                ? "border-emerald-500 text-emerald-700 dark:text-emerald-300"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {showCreate && <CreateRequestModal onClose={() => { setShowCreate(false); refresh(); }} />}
      {showReplenish && accounts[0] && (
        <ReplenishModal
          accountId={accounts[0].id}
          currentBalance={accounts[0].currentBalance}
          onClose={() => { setShowReplenish(false); refresh(); }}
        />
      )}
    </div>
  );
}

// ─── Tab: Solicitudes ────────────────────────────────────────────────────────

function RequestsTab({ canApprove, canCreate }: { canApprove: boolean; canCreate: boolean }) {
  const finance = useFinance();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected" | "cancelled">("pending");
  const [requests, setRequests] = useState<FinanceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<FinanceRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await finance.requests.fetch({
        status: filter === "all" ? "all" : filter,
      });
      setRequests(rows);
    } catch (err) {
      toast.error("Error al cargar solicitudes");
    } finally {
      setLoading(false);
    }
  }, [finance, filter]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      {/* Sub-filtros */}
      <div className="flex flex-wrap gap-2">
        {(["pending", "approved", "rejected", "cancelled"] as const).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              filter === f
                ? "bg-emerald-600 text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300"
            }`}
          >
            {REQUEST_STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={`${cardCls} flex items-center justify-center p-10`}>
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : requests.length === 0 ? (
        <div className={`${cardCls} p-10 text-center`}>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No hay solicitudes {filter === "pending" ? "pendientes" : `(${REQUEST_STATUS_LABEL[filter].toLowerCase()})`}.
          </p>
        </div>
      ) : (
        <div className={`${cardCls} overflow-hidden`}>
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-white/[0.04]">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">ID</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Solicitante</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Sede</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500">Monto</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Motivo</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Estado</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Clasificación</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Fecha</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {requests.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.03]">
                  <td className="px-4 py-3 text-sm font-mono text-gray-700 dark:text-gray-300">#{r.numericId}</td>
                  <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">{r.requesterName ?? `User #${r.requesterUserId}`}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{r.siteName ?? `Sede #${r.siteId}`}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtMoney(r.amount)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate" title={r.reason}>{r.reason}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${REQUEST_STATUS_BADGE[r.status]}`}>
                      {REQUEST_STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${CLASSIFICATION_BADGE[r.classification]}`}>
                      {CLASSIFICATION_LABEL[r.classification]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{fmtDate(r.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setSelected(r)}
                        className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
                        title="Ver detalle"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {canApprove && r.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => setSelected(r)}
                          className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Revisar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <RequestDetailModal
          request={selected}
          canApprove={canApprove}
          onClose={() => { setSelected(null); void load(); }}
        />
      )}
    </div>
  );
}

// ─── Tab: Vales ──────────────────────────────────────────────────────────────

function VouchersTab({ canSeeAll }: { canSeeAll: boolean }) {
  const { session } = useAuth();
  const finance = useFinance();
  const [filter, setFilter] = useState<"all" | "open" | "closed" | "cancelled">("open");
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Voucher | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // jul 2026 v4-b — userId del dueño. El backend expone el id del
  // usuario en `session.id` (no en `sub`), con shape "company-user-12".
  // Extraemos los dígitos para comparar con assignedToUserId (number).
  const userId = session?.id ? Number(String(session.id).replace(/\D/g, "")) : null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await finance.vouchers.fetch({ status: filter });
      // jul 2026 v4-b — Debug temporal: confirmar que userId y
      // assignedToUserId están bien. Se puede quitar cuando validemos
      // el flujo en producción.
      if (typeof window !== "undefined") {
        // eslint-disable-next-line no-console
        console.log("[CajaChica VouchersTab]", {
          sessionSub: session?.sub,
          userId,
          rowsCount: rows.length,
          rows: rows.map(r => ({ id: r.numericId, assignedToUserId: r.assignedToUserId, status: r.status })),
        });
      }
      setVouchers(rows);
    } catch (err) {
      toast.error("Error al cargar vales");
    } finally {
      setLoading(false);
    }
  }, [finance, filter, refreshKey, session?.sub, userId]);

  useEffect(() => { void load(); }, [load]);

  const downloadPdf = useCallback(async (v: Voucher) => {
    try {
      await finance.vouchers.downloadPdf(v.numericId);
    } catch (err) {
      toast.error("Error al generar el PDF");
    }
  }, [finance]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["open", "closed", "cancelled", "all"] as const).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              filter === f
                ? "bg-emerald-600 text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300"
            }`}
          >
            {f === "all" ? "Todos" : VOUCHER_STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={`${cardCls} flex items-center justify-center p-10`}>
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : vouchers.length === 0 ? (
        <div className={`${cardCls} p-10 text-center`}>
          <p className="text-sm text-gray-500 dark:text-gray-400">No hay vales {filter === "open" ? "abiertos" : filter === "all" ? "registrados" : `(${VOUCHER_STATUS_LABEL[filter].toLowerCase()})`}.</p>
        </div>
      ) : (
        <div className={`${cardCls} overflow-hidden`}>
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-white/[0.04]">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Vale</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Operador</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Sede</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500">Emitido</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500">Gastado</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500">Reembolso</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Estado</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500">Fecha</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {vouchers.map(v => {
                // jul 2026 v4-b — Regla de cierre: SÓLO el dueño del vale
                // (assignedToUserId === userId de la sesión actual) puede
                // ver el botón "Finalizar". Un admin o supervisor con
                // aprobar/reponer no debe finalizar vales ajenos desde
                // acá — eso le corresponde al operador dueño (o se hace
                // por el flujo del drawer del mantenimiento, no por
                // Caja Chica). Si en el futuro el admin quiere cancelar
                // un vale, se agregará un botón "Cancelar" separado.
                //
                // Convertimos ambos a number para evitar mismatch por
                // tipo (a veces el backend manda string según el path).
                const ownerIdNum = Number(v.assignedToUserId);
                const userIdNum  = Number(userId);
                const isOwner = userIdNum > 0 && ownerIdNum === userIdNum;
                const canClose = v.status === "open" && isOwner;
                return (
                  <tr key={v.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-3 text-sm font-mono text-gray-700 dark:text-gray-300">#{v.numericId}</td>
                    <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">{v.assignedToName ?? `User #${v.assignedToUserId}`}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{v.siteName ?? `Sede #${v.siteId}`}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtMoney(v.issuedAmount)}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-gray-300">{v.closedActualAmount !== null ? fmtMoney(v.closedActualAmount) : "—"}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      {v.refundAmount > 0
                        ? <span className="font-semibold text-amber-600 dark:text-amber-400">+ {fmtMoney(v.refundAmount)}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${VOUCHER_STATUS_BADGE[v.status]}`}>
                        {VOUCHER_STATUS_LABEL[v.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{fmtDate(v.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {canClose && (
                          <button
                            type="button"
                            onClick={() => setSelected(v)}
                            className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            Finalizar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void downloadPdf(v)}
                          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
                          title="Descargar vale PDF"
                        >
                          <FileDown className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <CloseVoucherModal
          voucher={selected}
          onClose={() => { setSelected(null); setRefreshKey(k => k + 1); }}
        />
      )}
    </div>
  );
}

// ─── Tab: Historial ──────────────────────────────────────────────────────────

function HistoryTab({ canReplenish: _ }: { canReplenish: boolean }) {
  const finance = useFinance();
  const [siteId, setSiteId] = useState<number | undefined>(undefined);
  const [accounts, setAccounts] = useState<PettyCashAccountWithSite[]>([]);
  const [items, setItems] = useState<Array<{
    id: number;
    type: string;
    amount: string | number;
    balanceAfter: string | number;
    note: string | null;
    occurredAt: string | Date;
    actorName: string | null;
    relatedRequestId: number | null;
    relatedVoucherId: number | null;
  }>>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const accData = await finance.pettyCash.fetchAccount(siteId);
      if (accData && "movements" in accData) {
        setItems(accData.movements);
      } else {
        setItems([]);
      }
    } catch (err) {
      toast.error("Error al cargar el historial");
    } finally {
      setLoading(false);
    }
  }, [finance, siteId]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await finance.pettyCash.fetchAccount();
        if (data && "accounts" in data) setAccounts(data.accounts);
      } catch {}
    })();
  }, [finance]);

  useEffect(() => { void load(); }, [load]);

  const exportPdf = useCallback(async () => {
    try {
      await finance.transactions.downloadPdf({ scope: "petty_cash" });
    } catch (err) {
      toast.error("Error al exportar el PDF");
    }
  }, [finance]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px]">
          <label className={labelCls}>Sede</label>
          <select
            value={siteId ?? ""}
            onChange={e => setSiteId(e.target.value ? Number(e.target.value) : undefined)}
            className={inputCls}
          >
            <option value="">Todas</option>
            {accounts.map(a => (
              <option key={a.id} value={a.siteId}>
                {a.siteName ?? `Sede #${a.siteId}`} {a.siteCode ? `(${a.siteCode})` : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void exportPdf()}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200"
        >
          <FileDown className="h-4 w-4" />
          Exportar PDF
        </button>
      </div>

      {loading ? (
        <div className={`${cardCls} flex items-center justify-center p-10`}>
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : items.length === 0 ? (
        <div className={`${cardCls} p-10 text-center`}>
          <p className="text-sm text-gray-500 dark:text-gray-400">Sin movimientos todavía.</p>
        </div>
      ) : (
        <div className="relative space-y-3">
          {/* Timeline vertical line */}
          <div className="absolute left-[19px] top-2 bottom-2 w-px bg-gray-200 dark:bg-white/[0.08]" />
          {items.map(m => {
            const amount = Number(m.amount);
            const isNegative = amount < 0;
            return (
              <div key={m.id} className={`${cardCls} relative ml-0 flex gap-3 p-4 sm:ml-10`}>
                <div className={`absolute -left-10 top-5 flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-white dark:ring-gray-900 ${
                  isNegative ? "bg-rose-500" : "bg-emerald-500"
                } text-white shadow-sm`}>
                  {isNegative ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {MOVEMENT_TYPE_LABEL[m.type] ?? m.type}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {fmtDateTime(m.occurredAt)} · {m.actorName ?? "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${isNegative ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {isNegative ? "−" : "+"} {fmtMoney(Math.abs(amount))}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Saldo: {fmtMoney(m.balanceAfter)}
                      </p>
                    </div>
                  </div>
                  {m.note && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{m.note}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Modal: Crear Solicitud ──────────────────────────────────────────────────

function CreateRequestModal({ onClose, initialSiteId }: { onClose: () => void; initialSiteId?: number }) {
  const finance = useFinance();
  const [accounts, setAccounts] = useState<PettyCashAccountWithSite[]>([]);
  const [siteId, setSiteId] = useState<number | null>(initialSiteId ?? null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // jul 2026 v4-b — Si nos pasan un initialSiteId (caso "solicitar
    // recurso desde un mantenimiento"), el modal no le pregunta al
    // operador qué sede: ya la sabemos. Sólo cargamos las cuentas
    // para validación posterior.
    if (initialSiteId) {
      void (async () => {
        const data = await finance.pettyCash.fetchAccount();
        if (data && "accounts" in data) {
          setAccounts(data.accounts);
        }
      })();
      return;
    }
    void (async () => {
      const data = await finance.pettyCash.fetchAccount();
      if (data && "accounts" in data) {
        setAccounts(data.accounts);
        // Si hay una sola cuenta, autoseccionamos y NO mostramos el
        // dropdown (cero fricción para el caso más común).
        if (data.accounts.length === 1) {
          setSiteId(data.accounts[0].siteId);
        } else if (data.accounts[0]) {
          setSiteId(data.accounts[0].siteId);
        }
      }
    })();
  }, [finance, initialSiteId]);

  const submit = async () => {
    if (!siteId || !amount || !reason) {
      toast.error("Completá sede, monto y motivo");
      return;
    }
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Monto inválido");
      return;
    }
    setSubmitting(true);
    const result = await finance.requests.create({
      siteId,
      amount: amt,
      reason,
      justificationNotes: notes || undefined,
      origin: "standalone",
    });
    setSubmitting(false);
    if (result.ok) {
      toast.success(`Solicitud #${result.data.numericId} creada`);
      onClose();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <ModalShell onClose={onClose} title="Nueva solicitud de caja chica" icon={Plus}>
      <div className="space-y-4">
        {/* jul 2026 v4-b — Si initialSiteId viene del FinancePanel
            (mantenimiento), no mostramos el select de sede: el sistema
            ya sabe de dónde sale. Lo dejamos sólo cuando el operador
            abre el modal desde "Nueva solicitud" y la empresa tiene
            VARIAS cuentas activas. */}
        {!initialSiteId && accounts.length > 1 && (
          <div>
            <label className={labelCls}>Sede de la caja</label>
            <select
              value={siteId ?? ""}
              onChange={(e) => setSiteId(Number(e.target.value))}
              className={inputCls}
            >
              {accounts.map(a => (
                <option key={a.id} value={a.siteId}>{a.siteName ?? `Sede #${a.siteId}`}</option>
              ))}
            </select>
          </div>
        )}
        {/* Cuando hay initialSiteId o una sola cuenta, mostramos solo
            un banner informativo con la sede resuelta. */}
        {(initialSiteId || accounts.length === 1) && siteId && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-200">
            <Building2 className="inline h-4 w-4 mr-1" />
            Sede: <strong>
              {accounts.find(a => a.siteId === siteId)?.siteName
                ?? `Sede #${siteId}`}
            </strong>
          </div>
        )}
          <label className={labelCls}>Sede</label>
          <select
            value={siteId ?? ""}
            onChange={e => setSiteId(Number(e.target.value))}
            className={inputCls}
          >
            {accounts.length === 0 && <option value="">— No hay cajas activas —</option>}
            {accounts.map(a => (
              <option key={a.id} value={a.siteId}>
                {a.siteName ?? `Sede #${a.siteId}`} — saldo {fmtMoney(a.currentBalance)}
              </option>
            ))}
          </select>
      </div>
        <div>
          <label className={labelCls}>Monto (USD)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Motivo</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Ej: bombilla para camioneta X"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Notas adicionales (opcional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className={`${inputCls} h-auto py-2`}
            placeholder="Detalles, justificación, etc."
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-200">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Crear solicitud
          </button>
      </div>
    </ModalShell>
  );
}

// ─── Modal: Rellenar Caja ────────────────────────────────────────────────────

function ReplenishModal({
  accountId, currentBalance, onClose,
}: {
  accountId: number;
  currentBalance: number;
  onClose: () => void;
}) {
  const finance = useFinance();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Monto inválido");
      return;
    }
    setSubmitting(true);
    const result = await finance.pettyCash.replenishAccount({ accountId, amount: amt, note });
    setSubmitting(false);
    if (result.ok) {
      toast.success(`Caja rellenada. Nuevo saldo: ${fmtMoney(result.data.newBalance)}`);
      onClose();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <ModalShell onClose={onClose} title="Rellenar caja chica" icon={RefreshCw}>
      <div className="space-y-4">
        <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-500/10 dark:text-blue-200">
          Saldo actual: <strong>{fmtMoney(currentBalance)}</strong>
        </div>
        <div>
          <label className={labelCls}>Monto a reponer (USD)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className={inputCls}
            autoFocus
          />
        </div>
        <div>
          <label className={labelCls}>Nota (opcional)</label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Ej: reposición mensual"
            className={inputCls}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-200">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Reponer
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Modal: Detalle Solicitud + Aprobar/Rechazar ────────────────────────────

function RequestDetailModal({
  request, canApprove, onClose,
}: {
  request: FinanceRequest;
  canApprove: boolean;
  onClose: () => void;
}) {
  const finance = useFinance();
  const { session } = useAuth();
  const [rejectionReason, setRejectionReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);

  const isOwner = request.requesterUserId === Number(String(session?.sub ?? "").replace(/\D/g, ""));

  const approve = async (classification: "petty_cash" | "annual_expense") => {
    setSubmitting(true);
    const result = await finance.requests.review({
      requestId: request.numericId,
      action: "approve",
      classification,
    });
    setSubmitting(false);
    if (result.ok) {
      toast.success(
        classification === "petty_cash"
          ? `Aprobada como caja chica${result.data.voucherId ? ` — vale #${result.data.voucherId}` : ""}`
          : `Aprobada como gasto anual`,
      );
      onClose();
    } else {
      toast.error(result.error);
    }
  };

  const reject = async () => {
    if (rejectionReason.trim().length < 3) {
      toast.error("Indicá un motivo de rechazo");
      return;
    }
    setSubmitting(true);
    const result = await finance.requests.review({
      requestId: request.numericId,
      action: "reject",
      rejectionReason: rejectionReason.trim(),
    });
    setSubmitting(false);
    if (result.ok) {
      toast.success("Solicitud rechazada");
      onClose();
    } else {
      toast.error(result.error);
    }
  };

  const cancel = async () => {
    if (!confirm("¿Cancelar tu solicitud?")) return;
    setSubmitting(true);
    const result = await finance.requests.cancel(request.numericId);
    setSubmitting(false);
    if (result.ok) {
      toast.success("Solicitud cancelada");
      onClose();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <ModalShell onClose={onClose} title={`Solicitud #${request.numericId}`} icon={Receipt}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailRow icon={User} label="Solicitante" value={request.requesterName ?? `User #${request.requesterUserId}`} />
          <DetailRow icon={Building2} label="Sede" value={request.siteName ?? `Sede #${request.siteId}`} />
          <DetailRow icon={Banknote} label="Monto" value={fmtMoney(request.amount)} />
          <DetailRow icon={Calendar} label="Fecha" value={fmtDateTime(request.createdAt)} />
          <DetailRow icon={Hash} label="Estado" value={
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${REQUEST_STATUS_BADGE[request.status]}`}>
              {REQUEST_STATUS_LABEL[request.status]}
            </span>
          } />
          <DetailRow icon={Tag} label="Clasificación" value={
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${CLASSIFICATION_BADGE[request.classification]}`}>
              {CLASSIFICATION_LABEL[request.classification]}
            </span>
          } />
        </div>
        <div>
          <p className={labelCls}>Motivo</p>
          <p className="text-sm text-gray-800 dark:text-gray-200">{request.reason}</p>
        </div>
        {request.justificationNotes && (
          <div>
            <p className={labelCls}>Notas</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{request.justificationNotes}</p>
          </div>
        )}
        {request.rejectionReason && (
          <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
            <strong>Motivo del rechazo:</strong> {request.rejectionReason}
          </div>
        )}

        {/* Acciones */}
        <div className="border-t border-gray-100 pt-3 dark:border-white/[0.06]">
          {request.status === "pending" && canApprove && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Aprobar como:</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void approve("petty_cash")}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Check className="h-4 w-4" />
                  Caja chica
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void approve("annual_expense")}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                >
                  <Check className="h-4 w-4" />
                  Gasto anual
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setShowRejectInput(s => !s)}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:bg-transparent dark:text-rose-300"
                >
                  <XCircle className="h-4 w-4" />
                  Rechazar
                </button>
              </div>
              {showRejectInput && (
                <div className="space-y-2 pt-2">
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                    placeholder="Motivo del rechazo"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void reject()}
                    className="rounded-xl bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                  >
                    Confirmar rechazo
                  </button>
                </div>
              )}
            </div>
          )}

          {request.status === "pending" && isOwner && !canApprove && (
            <button
              type="button"
              onClick={() => void cancel()}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-500/40 dark:bg-transparent dark:text-slate-300"
            >
              Cancelar mi solicitud
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Modal: Cerrar Vale ──────────────────────────────────────────────────────

function CloseVoucherModal({
  voucher, onClose,
}: {
  voucher: Voucher;
  onClose: () => void;
}) {
  const finance = useFinance();
  const [actual, setActual] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // jul 2026 v4-b — Estado del comprobante + items + taller/lavador
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [items, setItems] = useState<Array<{
    description: string; quantity: string; unitPrice: string; subtotal: string;
  }>>([]);
  const [workshopName, setWorkshopName] = useState("");
  const [workerName, setWorkerName] = useState("");

  const actualNum = parseFloat(actual);
  const willRefund = Number.isFinite(actualNum) && actualNum < voucher.issuedAmount;
  const refundPreview = willRefund ? voucher.issuedAmount - actualNum : 0;

  const origin = voucher.origin ?? "standalone";
  const hasMaintenance = origin !== "standalone" && !!voucher.maintenanceId;

  // jul 2026 v4-b — finance_classification define qué exigir:
  //   - "repuesto"  → factura + items[] (obligatorio al menos 1 item)
  //   - "mano_obra" → factura + workshopName
  //   - "lavada"    → factura + workerName
  //   - null/undef  → standalone, pero igual pide comprobante (regla
  //     nueva: comprobante SIEMPRE obligatorio, no hay caso sin factura).
  const fclass: "repuesto" | "mano_obra" | "lavada" | null =
    (voucher.financeClassification ?? null) as any;

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setReceipt(file);
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setReceiptPreview(String(reader.result ?? ""));
      reader.readAsDataURL(file);
    } else {
      setReceiptPreview(null);
    }
  };

  const addItem = () => {
    setItems(prev => [
      ...prev,
      { description: "", quantity: "1", unitPrice: "0", subtotal: "0" },
    ]);
  };
  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };
  const updateItem = (idx: number, field: string, value: string) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, [field]: value };
      // Recalcular subtotal = qty * unitPrice
      if (field === "quantity" || field === "unitPrice") {
        const q = parseFloat(next.quantity) || 0;
        const u = parseFloat(next.unitPrice) || 0;
        next.subtotal = (q * u).toFixed(2);
      }
      return next;
    }));
  };

  // jul 2026 v4-b — Comprobante SIEMPRE obligatorio (sin importar
  // si el vale viene de mantenimiento o es standalone). El backend
  // rechaza el cierre con 400 si no hay invoiceId.
  const receiptRequired = true;
  // ¿Items obligatorios? Sí cuando fclass === "repuesto".
  const itemsRequired  = hasMaintenance && fclass === "repuesto";

  const submit = async () => {
    if (!Number.isFinite(actualNum) || actualNum < 0) {
      toast.error("Monto inválido");
      return;
    }
    if (receiptRequired && !receipt) {
      toast.error("Adjuntá el comprobante (imagen o PDF) — es obligatorio");
      return;
    }
    if (itemsRequired && items.length === 0) {
      toast.error("Agregá al menos un ítem (es repuesto)");
      return;
    }
    if (hasMaintenance && fclass === "mano_obra" && !workshopName.trim()) {
      toast.error("Indicá el taller que realizó la mano de obra");
      return;
    }
    if (hasMaintenance && fclass === "lavada" && !workerName.trim()) {
      toast.error("Indicá el nombre del lavador");
      return;
    }
    setSubmitting(true);

    let invoiceId: number | undefined;

    // Siempre: subir comprobante + crear invoice antes de cerrar.
    if (receipt) {
      const upRes = await finance.vouchers.uploadReceipt(receipt);
      if (!upRes.ok) {
        setSubmitting(false);
        toast.error(`Error al subir comprobante: ${upRes.error}`);
        return;
      }
      const invRes = await finance.vouchers.createInvoice({
        voucherId: voucher.numericId,
        fileUrl: upRes.data.url,
        fileMimeType: upRes.data.type,
        kind: (fclass ?? "repuesto") as any,
        total: actualNum,
        items: itemsRequired
          ? items.map(it => ({
              description: it.description,
              quantity: parseFloat(it.quantity) || 1,
              unitPrice: parseFloat(it.unitPrice) || 0,
              subtotal: parseFloat(it.subtotal) || 0,
            }))
          : [],
        ivaPercent: 15,
        ivaAmount: 0,
        workshopName: fclass === "mano_obra" ? workshopName.trim() : null,
        workerName:   fclass === "lavada" ? workerName.trim() : null,
      });
      if (!invRes.ok) {
        setSubmitting(false);
        toast.error(`Error al crear factura: ${invRes.error}`);
        return;
      }
      invoiceId = invRes.data.invoiceId;
    }

    const result = await finance.vouchers.close({
      voucherId: voucher.numericId,
      actualAmount: actualNum,
      invoiceId,
      notes,
    });
    setSubmitting(false);
    if (result.ok) {
      if (result.data.refundAmount > 0) {
        toast.success(`Vale cerrado. Se devolvieron ${fmtMoney(result.data.refundAmount)} a caja chica.`);
      } else {
        toast.success("Vale cerrado");
      }
      onClose();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <ModalShell onClose={onClose} title={`Cerrar vale #${voucher.numericId}`} icon={Check}>
      <div className="space-y-4">
        <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-500/10 dark:text-blue-200">
          Monto emitido: <strong>{fmtMoney(voucher.issuedAmount)}</strong>
        </div>

        {/* Banner contextual según el origen (jul 2026 v4) */}
        {hasMaintenance && fclass ? (
          <div className="flex items-start gap-2 rounded-xl bg-violet-50 p-3 text-xs text-violet-800 dark:bg-violet-500/10 dark:text-violet-200">
            <FileText className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              Este vale es del mantenimiento #{voucher.maintenanceId}, clasificado
              como <strong>{fclass.replace("_", " ")}</strong>.
              {fclass === "repuesto"  && " Adjuntá el comprobante con sus ítems (repuestos comprados)."}
              {fclass === "mano_obra" && " Adjuntá el comprobante del taller que hizo la mano de obra."}
              {fclass === "lavada"    && " Adjuntá el comprobante e indicá el nombre del lavador."}
              La factura quedará registrada en el ledger del mantenimiento.
            </div>
          </div>
        ) : hasMaintenance ? (
          <div className="flex items-start gap-2 rounded-xl bg-violet-50 p-3 text-xs text-violet-800 dark:bg-violet-500/10 dark:text-violet-200">
            <FileText className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              Este vale viene de un <strong>mantenimiento #{voucher.maintenanceId}</strong>.
              Si querés, adjuntá el comprobante. La factura se asociará al mantenimiento.
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-700 dark:bg-white/[0.04] dark:text-slate-300">
            <Receipt className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              Vale <strong>independiente</strong>. Adjuntá el comprobante
              (imagen o PDF) para registrar la factura en el ledger.
            </div>
          </div>
        )}

        <div>
          <label className={labelCls}>Monto realmente gastado (USD)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={actual}
            onChange={e => setActual(e.target.value)}
            placeholder="0.00"
            className={inputCls}
            autoFocus
          />
        </div>
        {willRefund && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            Se devolverán <strong>{fmtMoney(refundPreview)}</strong> a caja chica.
          </div>
        )}

        {/* Bloque dinámico por fclass: nombre del taller / lavador */}
        {hasMaintenance && fclass === "mano_obra" && (
          <div>
            <label className={labelCls}>Taller que hizo la mano de obra</label>
            <input
              type="text"
              value={workshopName}
              onChange={e => setWorkshopName(e.target.value)}
              placeholder="Ej. Talleres Pérez"
              className={inputCls}
            />
          </div>
        )}
        {hasMaintenance && fclass === "lavada" && (
          <div>
            <label className={labelCls}>Nombre del lavador</label>
            <input
              type="text"
              value={workerName}
              onChange={e => setWorkerName(e.target.value)}
              placeholder="Ej. Carlos Rodríguez"
              className={inputCls}
            />
          </div>
        )}

        {/* Items obligatorios solo cuando fclass === "repuesto" */}
        {hasMaintenance && fclass === "repuesto" && (
          <div>
            <label className={labelCls}>Ítems del repuesto</label>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 rounded-lg border border-gray-200 p-2 dark:border-white/[0.06]">
                  <input
                    className={`${inputCls} col-span-6`}
                    placeholder="Descripción (Ej. Pastilla freno)"
                    value={it.description}
                    onChange={e => updateItem(idx, "description", e.target.value)}
                  />
                  <input
                    type="number" min="0" step="0.01"
                    className={`${inputCls} col-span-2`}
                    placeholder="Cant."
                    value={it.quantity}
                    onChange={e => updateItem(idx, "quantity", e.target.value)}
                  />
                  <input
                    type="number" min="0" step="0.01"
                    className={`${inputCls} col-span-2`}
                    placeholder="Precio"
                    value={it.unitPrice}
                    onChange={e => updateItem(idx, "unitPrice", e.target.value)}
                  />
                  <div className="col-span-1 flex items-center justify-center text-xs text-gray-600 dark:text-gray-400">
                    {fmtMoney(parseFloat(it.subtotal) || 0)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="col-span-1 rounded-lg p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                    aria-label="Eliminar ítem"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
              >
                <Plus className="h-3 w-3" /> Agregar ítem
              </button>
            </div>
          </div>
        )}

        {/* Comprobante — SIEMPRE obligatorio.
            Visual: label con icono, área de drop con botón "Examinar…",
            preview con tamaño controlado (no estirado) y opción de
            reemplazar / quitar. */}
        <div>
          <label className={labelCls}>
            <Receipt className="mr-1 inline h-3 w-3" />
            Comprobante (obligatorio · imagen o PDF)
          </label>

          {receipt ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/[0.08]">
              {receiptPreview ? (
                <div className="relative">
                  <img
                    src={receiptPreview}
                    alt="Vista previa del comprobante"
                    className="mx-auto block max-h-32 w-auto object-contain bg-gray-50 dark:bg-white/[0.04]"
                  />
                  <button
                    type="button"
                    onClick={() => { setReceipt(null); setReceiptPreview(null); }}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                    aria-label="Quitar comprobante"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3">
                  <FileText className="h-5 w-5 shrink-0 text-rose-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-200">
                      {receipt.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {(receipt.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setReceipt(null); setReceiptPreview(null); }}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
                    aria-label="Quitar comprobante"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-3 py-2 dark:border-white/[0.04] dark:bg-white/[0.03]">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {receipt.type.startsWith("image/") ? "Imagen" : "PDF"} · listo para enviar
                </span>
                <label
                  htmlFor="voucher-receipt-replace"
                  className="cursor-pointer rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
                >
                  Reemplazar
                </label>
                <input
                  id="voucher-receipt-replace"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleReceiptChange}
                  className="hidden"
                />
              </div>
            </div>
          ) : (
            <label
              htmlFor="voucher-receipt-upload"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 px-4 py-6 text-center transition hover:border-emerald-400 hover:bg-emerald-50/40 dark:border-white/[0.1] dark:bg-white/[0.02] dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Subí la foto o PDF del comprobante
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  JPG, PNG, WebP o PDF · máx 16 MB
                </p>
              </div>
              <span className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
                Examinar archivo
              </span>
              <input
                id="voucher-receipt-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleReceiptChange}
                className="hidden"
              />
            </label>
          )}
        </div>

        <div>
          <label className={labelCls}>Notas (opcional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className={`${inputCls} h-auto py-2`}
            placeholder="Qué compraste, observaciones, etc."
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-200">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Subiendo y cerrando..." : "Cerrar vale"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Componentes auxiliares ──────────────────────────────────────────────────

/**
 * jul 2026 v4-b — ModalShell con tres zonas:
 *   1. Header (sticky, fijo arriba)
 *   2. Body (scrolleable vertical si el contenido no entra)
 *   3. Footer opcional (sticky, fijo abajo — usualmente para los
 *      botones "Cancelar / Confirmar" que SIEMPRE deben verse).
 *
 * Sin esto, los modales largos (ej. CerrarVale con ítems, factura,
 * taller/lavador) se estiraban a pantalla completa y los botones
 * quedaban fuera del viewport.
 */
function ModalShell({
  onClose, title, icon: Icon, children, footer,
}: {
  onClose: () => void;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-gray-900"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 p-4 dark:border-white/[0.06]">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100">
            <Icon className="h-5 w-5 text-emerald-500" />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-gray-100 bg-gray-50 p-4 dark:border-white/[0.06] dark:bg-white/[0.04]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function DetailRow({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

// ─── Tab: Configuración (solo admin_empresa / owner_empresa / canReplenish) ──
//
// jul 2026 v4 — Pantalla para crear la primera cuenta de caja chica, rellenar
// cuentas existentes, y ver el historial de cuentas desactivadas.
//
// NO usa useSites ni session.siteId — todo se trae del endpoint
// /finance/petty-cash que devuelve availableSites (lista de sedes de la empresa)
// y accounts (cuentas activas). Esto evita requerir el permiso gestion.sedes
// para configurar caja chica.

function ConfiguracionTab() {
  const { session } = useAuth();
  const [accounts, setAccounts] = useState<PettyCashAccountWithSite[]>([]);
  const [availableSites, setAvailableSites] = useState<Array<{
    id: number; name: string; code: string | null; status: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showReplenish, setShowReplenish] = useState<{ id: number; currentBalance: number; siteName: string | null } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/company/${session?.companyId}/finance/petty-cash`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setAccounts(data.accounts ?? []);
        setAvailableSites(data.availableSites ?? []);
      } catch (err) {
        toast.error("Error al cargar configuración de caja chica");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.companyId, refreshKey]);

  // Sedes que ya tienen cuenta activa → se muestran en la lista de "Cuentas activas".
  // Sedes sin cuenta activa → se muestran en "Sedes pendientes" con botón Crear.
  const siteIdsWithAccount = new Set(accounts.map(a => a.siteId));
  const sitesWithoutAccount = availableSites.filter(s => !siteIdsWithAccount.has(s.id));
  const totalActiveBalance = accounts.reduce((s, a) => s + a.currentBalance, 0);

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className={`${cardCls} p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={labelCls}>Saldo total activo</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {fmtMoney(totalActiveBalance)}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {accounts.length} cuenta(s) activa(s) · {availableSites.length} sede(s) total
            </p>
          </div>
          {sitesWithoutAccount.length > 0 && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <PlusCircle size={14} />
              Crear cuenta nueva
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className={`${cardCls} flex items-center justify-center p-10`}>
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* Cuentas activas */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300">
              <Wallet size={14} className="text-emerald-500" />
              Cuentas activas ({accounts.length})
            </h3>
            {accounts.length === 0 ? (
              <div className={`${cardCls} p-6 text-center`}>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No hay cuentas de caja chica configuradas todavía.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map(a => (
                  <div
                    key={a.id}
                    className={`${cardCls} flex items-center justify-between gap-3 p-4`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-emerald-500" />
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {a.siteName ?? `Sede #${a.siteId}`}
                          {a.siteCode && <span className="ml-1 text-xs text-gray-400">({a.siteCode})</span>}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Modo: {a.mode === "period"
                          ? (a.periodKind === "monthly" ? "Mensual" : "Semanal")
                          : `Acumulativo (límite ${fmtMoney(a.limitAmount)})`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {fmtMoney(a.currentBalance)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">saldo actual</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => setShowReplenish({
                          id: a.id, currentBalance: a.currentBalance, siteName: a.siteName,
                        })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300"
                      >
                        <PlusCircle size={12} />
                        Rellenar
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreate({ preSelectedSiteId: a.siteId } as any)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300"
                        title="Reemplazar (desactiva esta y crea una nueva con la misma sede)"
                      >
                        <Edit2 size={12} />
                        Reemplazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sedes pendientes */}
          {sitesWithoutAccount.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300">
                <PlusCircle size={14} className="text-amber-500" />
                Sedes sin caja chica ({sitesWithoutAccount.length})
              </h3>
              <div className="space-y-2">
                {sitesWithoutAccount.map(s => (
                  <div
                    key={s.id}
                    className={`${cardCls} flex items-center justify-between gap-3 p-3`}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                          {s.name}
                          {s.code && <span className="ml-1 text-xs text-gray-400">({s.code})</span>}
                        </p>
                        {s.status !== "Activa" && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400">
                            Sede {s.status}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCreate({ preSelectedSiteId: s.id } as any)}
                      disabled={s.status !== "Activa"}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
                    >
                      <Plus size={12} />
                      Crear cuenta aquí
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info: qué hace este tab */}
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
            <p className="font-semibold">¿Cómo funciona?</p>
            <ul className="mt-1 list-disc pl-4 space-y-0.5">
              <li><strong>Modo Acumulativo:</strong> la caja se rellena hasta un límite. Cuando se gasta, el saldo baja. Cuando se rellena, sube.</li>
              <li><strong>Modo Period:</strong> cada mes (o semana) la caja se resetea al monto inicial automáticamente.</li>
              <li>Cuando el saldo llega a 0, se envía alerta al administraodor y dueño de la emprese para que rellene el recurso.</li>
            </ul>
          </div>
        </>
      )}

      {showCreate && (
        <ConfiguracionCuentaModal
          availableSites={availableSites}
          existingAccounts={accounts}
          preSelectedSiteId={(showCreate as any).preSelectedSiteId}
          onClose={() => { setShowCreate(false); refresh(); }}
        />
      )}

      {showReplenish && (
        <ConfiguracionReplenishModal
          accountId={showReplenish.id}
          currentBalance={showReplenish.currentBalance}
          siteName={showReplenish.siteName}
          onClose={() => { setShowReplenish(null); refresh(); }}
        />
      )}
    </div>
  );
}

// ─── Modal: Crear/Reemplazar cuenta de caja chica ──────────────────────────

function ConfiguracionCuentaModal({
  availableSites, existingAccounts, preSelectedSiteId, onClose,
}: {
  availableSites: Array<{ id: number; name: string; code: string | null; status: string }>;
  existingAccounts: PettyCashAccountWithSite[];
  preSelectedSiteId?: number;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const [siteId, setSiteId] = useState<number | null>(preSelectedSiteId ?? null);
  const [mode, setMode] = useState<"period" | "balance">("balance");
  const [periodKind, setPeriodKind] = useState<"monthly" | "weekly">("monthly");
  const [initialAmount, setInitialAmount] = useState("");
  const [limitAmount, setLimitAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isReplacement = siteId ? existingAccounts.some(a => a.siteId === siteId) : false;

  // Sedes disponibles: todas las activas. Si es replacement, también dejamos
  // la sede actual (que ya tiene cuenta).
  const candidates = availableSites.filter(s => s.status === "Activa");

  const submit = async () => {
    if (!siteId) {
      toast.error("Seleccioná una sede");
      return;
    }
    const init = parseFloat(initialAmount);
    const limit = parseFloat(limitAmount);
    if (!Number.isFinite(init) || init < 0) {
      toast.error("Monto inicial inválido");
      return;
    }
    if (mode === "balance" && (!Number.isFinite(limit) || limit < 0)) {
      toast.error("Límite inválido (debe ser 0 o positivo)");
      return;
    }
    if (mode === "period" && !periodKind) {
      toast.error("Seleccioná el periodo (mensual/semanal)");
      return;
    }

    setSubmitting(true);
    const res = await fetch(`/api/company/${session?.companyId}/finance/petty-cash`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId,
        mode,
        periodKind: mode === "period" ? periodKind : undefined,
        initialAmount: init,
        limitAmount: mode === "balance" ? limit : init,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(await res.text().catch(() => "") || "Error al crear la cuenta");
      return;
    }
    const data = await res.json();
    toast.success(`Cuenta creada${isReplacement ? " (reemplazó la anterior)" : ""}. Saldo: $${Number(data.account.currentBalance).toFixed(2)}`);
    onClose();
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
            <Settings size={16} className="text-emerald-500" />
            {isReplacement ? "Reemplazar cuenta" : "Nueva cuenta de caja chica"}
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
          {isReplacement && (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              <strong>Reemplazo:</strong> la cuenta actual de esta sede se desactivará (queda en el historial). Se crea una nueva con el saldo inicial que indiques.
            </div>
          )}

          <div>
            <label className={labelCls}>Sede</label>
            <select
              value={siteId ?? ""}
              onChange={e => setSiteId(Number(e.target.value))}
              className={inputCls}
            >
              <option value="">— Seleccionar sede —</option>
              {candidates.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.code ? ` (${s.code})` : ""}
                  {existingAccounts.some(a => a.siteId === s.id) ? " · ya tiene cuenta" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Modo</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("balance")}
                className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  mode === "balance"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300"
                }`}
              >
                <TrendingUp size={14} className={mode === "balance" ? "text-emerald-600" : "text-gray-400"} />
                Acumulativo
                <span className="text-[10px] font-normal opacity-70">con umbral</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("period")}
                className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  mode === "period"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300"
                }`}
              >
                <RefreshCw size={14} className={mode === "period" ? "text-emerald-600" : "text-gray-400"} />
                Por periodo
                <span className="text-[10px] font-normal opacity-70">se resetea</span>
              </button>
            </div>
          </div>

          {mode === "period" && (
            <div>
              <label className={labelCls}>Periodo</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPeriodKind("monthly")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    periodKind === "monthly"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300"
                  }`}
                >
                  <Calendar size={13} className={periodKind === "monthly" ? "text-emerald-600" : "text-gray-400"} />
                  Mensual
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodKind("weekly")}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    periodKind === "weekly"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300"
                  }`}
                >
                  <CalendarDays size={13} className={periodKind === "weekly" ? "text-emerald-600" : "text-gray-400"} />
                  Semanal
                </button>
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Monto inicial (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={initialAmount}
              onChange={e => setInitialAmount(e.target.value)}
              placeholder="0.00"
              className={inputCls}
              autoFocus
            />
          </div>

          {mode === "balance" && (
            <div>
              <label className={labelCls}>Umbral de alerta (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={limitAmount}
                onChange={e => setLimitAmount(e.target.value)}
                placeholder="0.00"
                className={inputCls}
              />
              <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                Cuando el saldo baje de este valor, se alerta al administrador y al dueño de la empresa para rellenar el recurso.
              </p>
            </div>
          )}

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
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting && <Loader2 size={12} className="animate-spin" />}
              {isReplacement ? "Reemplazar" : "Crear cuenta"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Modal: Rellenar cuenta existente ───────────────────────────────────────

function ConfiguracionReplenishModal({
  accountId, currentBalance, siteName, onClose,
}: {
  accountId: number;
  currentBalance: number;
  siteName: string | null;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Monto inválido");
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/company/${session?.companyId}/finance/petty-cash/replenish`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, amount: amt, note }),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(await res.text().catch(() => "") || "Error al rellenar");
      return;
    }
    const data = await res.json();
    toast.success(`Caja rellenada. Nuevo saldo: $${Number(data.newBalance).toFixed(2)}`);
    onClose();
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
            <CircleDollarSign size={16} className="text-blue-500" />
            Rellenar caja chica
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
            <p>
              <strong>{siteName ?? `Cuenta #${accountId}`}</strong>
              <br />
              Saldo actual: <strong>{fmtMoney(currentBalance)}</strong>
            </p>
          </div>
          <div>
            <label className={labelCls}>Monto a reponer (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className={inputCls}
              autoFocus
            />
          </div>
          <div>
            <label className={labelCls}>Nota (opcional)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Ej: reposición mensual"
              className={inputCls}
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
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting && <Loader2 size={12} className="animate-spin" />}
              Reponer
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default CajaChicaPage;