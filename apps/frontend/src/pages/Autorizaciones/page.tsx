"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Inbox, History, Loader2, AlertTriangle,
  Check, Search, Calendar, Truck,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useExitAuthorizations, type ConductorContext, type ExitAuthorization, type ExitAuthStatus } from "../../hooks/useExitAuthorizations";
import { SolicitarSalidaWizard } from "./components/SolicitarSalidaWizard";
import { ExitAuthDetailDrawer } from "./components/ExitAuthDetailDrawer";
import { DatePicker } from "@/components/ui/date-picker/DatePicker";

type SubTab = "entrantes" | "historial";
type HistorialFilter = "Autorizadas" | "Rechazadas";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return String(iso).slice(0, 16).replace("T", " ");
}

function statusTone(s: ExitAuthStatus) {
  if (s === "Autorizada") return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30";
  if (s === "Rechazada")  return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30";
  return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30";
}

function StatusPill({ status }: { status: ExitAuthStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${statusTone(status)}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "Autorizada" ? "bg-emerald-500" : status === "Rechazada" ? "bg-rose-500" : "bg-amber-500"}`} />
      {status}
    </span>
  );
}

export function AutorizacionesPage() {
  const { session } = useAuth();
  const role = session?.role ?? "";
  const isConductor = role === "conductor";
  const canDecide = ["supervisor", "admin_empresa", "owner_empresa"].includes(role);

  const { items, loading, fetchList, fetchConductorContext, decide, remove, wsChangeCount, wsDecidedCount  } = useExitAuthorizations();

  const [conductorCtx, setConductorCtx] = useState<ConductorContext | null>(null);

  // ── Set de IDs ya vistos — para no mostrar popup de decisiones antiguas
  const [shownIds, setShownIds] = useState<Set<string>>(new Set());
  const initialLoadDone = useRef(false);

  // ── Carga inicial
  useEffect(() => {
    if (isConductor) {
      void fetchConductorContext().then((ctx) => {
        if (!ctx) return;
        setConductorCtx(ctx);

        // resto de los logs de debug del popup, igual que antes
        console.log("[popup] ctx.authorizations:", ctx.authorizations.map(a => ({ id: a.id, status: a.status })));
        console.log("[popup] shownIds:", [...shownIds]);

        const decided = ctx.authorizations.find(
          (a) => a.status !== "Pendiente" && !shownIds.has(a.id)
        );
        console.log("[popup] decided:", decided);
        console.log("[popup] driverId match:", ctx.driverId, decided?.driverId, String(ctx.driverId) === String(decided?.driverId));
      });
      void fetchList();
    } else {
      void fetchList();
    }
  }, [isConductor, fetchConductorContext, fetchList]);

  // ── Cuando llega un evento WS nuevo → refetch y evaluar popup
  const prevWsCount = useRef(0);
  useEffect(() => {
    if (!isConductor) return;
    if (wsChangeCount === 0) return;
    if (wsChangeCount === prevWsCount.current) return;
    prevWsCount.current = wsChangeCount;

    console.log("[popup] wsChangeCount cambió a", wsChangeCount);

    void fetchConductorContext().then((ctx) => {
      console.log("[popup] ctx.authorizations:", ctx?.authorizations.map(a => ({ id: a.id, status: a.status })));
      console.log("[popup] shownIds:", [...shownIds]);
      if (!ctx) return;
      setConductorCtx(ctx);

      // Buscar la primera autorización decidida que el conductor no haya visto
      const decided = ctx.authorizations.find(
        (a) => a.status !== "Pendiente" && !shownIds.has(a.id)
      );
      if (!decided) return;
      const decidedDriverNum = String(decided.driverId).replace(/^driver-/, "");
      if (String(ctx.driverId) !== decidedDriverNum) return;

      setShownIds((prev) => new Set([...prev, decided.id]));
      setPendingDecisionPopup({
        status: decided.status as "Autorizada" | "Rechazada",
        auth: decided,
      });
    });
  }, [isConductor, wsDecidedCount, fetchConductorContext, shownIds]);

  // ── Estado UI
  const [subTab, setSubTab] = useState<SubTab>("entrantes");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detail, setDetail] = useState<ExitAuthorization | null>(null);
  const [detailMode, setDetailMode] = useState<"viewer" | "operator">("viewer");
  const [pendingDecisionPopup, setPendingDecisionPopup] = useState<{
    status: "Autorizada" | "Rechazada";
    auth: ExitAuthorization;
  } | null>(null);

  const effectiveItems = isConductor ? (conductorCtx?.authorizations ?? []) : items;

  function openDetail(a: ExitAuthorization, mode: "viewer" | "operator") {
    setDetail(a);
    setDetailMode(mode);
  }

  // ── Filtros del historial
  const [historialFilter, setHistorialFilter] = useState<HistorialFilter>("Autorizadas");
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    const statusMap: Record<HistorialFilter, ExitAuthStatus> = {
      "Autorizadas": "Autorizada",
      "Rechazadas":  "Rechazada",
    };
    let list = items.filter((a) => a.status === statusMap[historialFilter]);
    if (q.trim()) {
      const Q = q.toLowerCase();
      list = list.filter((a) =>
        (a.assetPlate ?? "").toLowerCase().includes(Q) ||
        (a.driverName ?? "").toLowerCase().includes(Q) ||
        (a.decidedByName ?? "").toLowerCase().includes(Q) ||
        (a.notes ?? "").toLowerCase().includes(Q),
      );
    }
    if (dateFrom) list = list.filter((a) => (a.decidedAt ?? a.requestedAt) >= dateFrom);
    if (dateTo)   list = list.filter((a) => (a.decidedAt ?? a.requestedAt) <= dateTo + "T23:59:59");
    return list;
  }, [items, historialFilter, q, dateFrom, dateTo]);

  // ── Render conductor
  if (isConductor) {
    const myAsset = conductorCtx?.asset
      ? { id: conductorCtx.asset.id, plate: conductorCtx.asset.plate, brand: conductorCtx.asset.brand, model: conductorCtx.asset.model }
      : null;
    return (
      <ConductorView
        loading={loading}
        myAsset={myAsset}
        driverId={conductorCtx?.driverId ?? null}
        items={effectiveItems}
        onSolicitar={() => setWizardOpen(true)}
        onOpenDetail={(a) => openDetail(a, "viewer")}
      >
        {wizardOpen && (
          <SolicitarSalidaWizard
            open={wizardOpen}
            onClose={() => setWizardOpen(false)}
            onCreated={() => void fetchConductorContext().then(setConductorCtx)}
            initialAsset={myAsset}
            driverId={conductorCtx?.driverId ?? null}
          />
        )}
        {detail && <ExitAuthDetailDrawer authorization={detail} role={detailMode} onClose={() => setDetail(null)} />}
        {pendingDecisionPopup && (
          <DecisionPopup
            status={pendingDecisionPopup.status}
            auth={pendingDecisionPopup.auth}
            onClose={() => setPendingDecisionPopup(null)}
          />
        )}
      </ConductorView>
    );
  }

  // ── Render supervisor/admin
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest text-emerald-600 dark:bg-emerald-500/[0.12] dark:text-emerald-400">
            Cumplimiento
          </span>
          <h1 className="mt-2 text-2xl font-bold text-gray-800 dark:text-white">Autorizaciones de salida</h1>
          <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
            Supervise las solicitudes de salida de vehículos, apruebe o rechace las pendientes y revise el historial.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void fetchList()} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-3.5 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.05] disabled:opacity-50 transition">
            {loading ? <Loader2 size={13} className="animate-spin" /> : null} Refrescar
          </button>
        </div>
      </header>

      <SubTabs value={subTab} onChange={setSubTab} />

      <AnimatePresence mode="wait">
        {subTab === "entrantes" && (
          <motion.div key="ent" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
            <EntrantesTab
              items={items.filter((a) => a.status === "Pendiente")}
              loading={loading}
              onOpen={(a) => openDetail(a, canDecide ? "operator" : "viewer")}
            />
          </motion.div>
        )}
        {subTab === "historial" && (
          <motion.div key="hist" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
            <HistorialTab
              items={filtered}
              filter={historialFilter}
              onChangeFilter={setHistorialFilter}
              q={q}
              onChangeQ={setQ}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChangeDateFrom={setDateFrom}
              onChangeDateTo={setDateTo}
              onOpen={(a) => openDetail(a, canDecide ? "operator" : "viewer")}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {detail && (
        <ExitAuthDetailDrawer
          authorization={detail}
          role={detailMode}
          onClose={() => setDetail(null)}
          onDecide={detailMode === "operator" && isPending(detail) ? async (id, action, notes) => {
            const updated = await decide(id, action, notes);
            setDetail(null);
            setPendingDecisionPopup({
              status: updated.status as "Autorizada" | "Rechazada",
              auth: updated,
            });
          } : undefined}
          onDelete={detailMode === "operator" && !isPending(detail) ? (id) => remove(id) : undefined}
        />
      )}

      {pendingDecisionPopup && (
        <DecisionPopup
          status={pendingDecisionPopup.status}
          auth={pendingDecisionPopup.auth}
          onClose={() => setPendingDecisionPopup(null)}
        />
      )}
    </div>
  );
}

function isPending(a: ExitAuthorization): boolean {
  return a.status === "Pendiente";
}

// ─── SubTabs ──────────────────────────────────────────────────────────────────

function SubTabs({ value, onChange }: { value: SubTab; onChange: (v: SubTab) => void }) {
  const tabs: { key: SubTab; label: string; icon: React.ReactNode }[] = [
    { key: "entrantes", label: "Solicitudes pendientes", icon: <Inbox size={12} /> },
    { key: "historial", label: "Historial",              icon: <History size={12} /> },
  ];
  return (
    <div className="flex items-center gap-1">
      {tabs.map((it) => {
        const active = value === it.key;
        return (
          <button key={it.key} type="button" onClick={() => onChange(it.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
              active
                ? "border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.02]"
            }`}>
            {it.icon} {it.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Entrantes tab ────────────────────────────────────────────────────────────

function EntrantesTab({ items, loading, onOpen }: {
  items: ExitAuthorization[];
  loading: boolean;
  onOpen: (a: ExitAuthorization) => void;
}) {
  if (loading && items.length === 0) return <CenteredLoader label="Buscando solicitudes entrantes…" />;
  if (items.length === 0) return <EmptyState icon={<Inbox size={18} />} title="Sin solicitudes entrantes" subtitle="Las nuevas solicitudes se mostrarán aquí en tiempo real." />;
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03]">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 dark:border-white/[0.06]">
          <tr>
            {["Hora", "Vehículo", "Conductor", "Estado", ""].map((h) => (
              <th key={h} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
          {items.map((a) => (
            <tr key={a.id} className="group cursor-pointer hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition" onClick={() => onOpen(a)}>
              <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtDate(a.requestedAt)}</td>
              <td className="px-5 py-3.5 font-semibold text-gray-800 dark:text-gray-200">{a.assetPlate ?? a.assetLabel ?? "—"}</td>
              <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">{a.driverName ?? "—"}</td>
              <td className="px-5 py-3.5"><StatusPill status={a.status} /></td>
              <td className="px-5 py-3.5 text-right text-xs text-emerald-600 dark:text-emerald-400 font-semibold opacity-0 group-hover:opacity-100 transition">Revisar →</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Historial tab ────────────────────────────────────────────────────────────

function HistorialTab({ items, filter, onChangeFilter, q, onChangeQ, dateFrom, dateTo, onChangeDateFrom, onChangeDateTo, onOpen }: {
  items: ExitAuthorization[];
  filter: HistorialFilter;
  onChangeFilter: (f: HistorialFilter) => void;
  q: string;
  onChangeQ: (s: string) => void;
  dateFrom: string;
  dateTo: string;
  onChangeDateFrom: (s: string) => void;
  onChangeDateTo: (s: string) => void;
  onOpen: (a: ExitAuthorization) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-3">
        <div className="inline-flex rounded-xl border border-gray-200 dark:border-white/[0.08] p-0.5 text-xs font-semibold">
          {(["Autorizadas", "Rechazadas"] as HistorialFilter[]).map((f) => {
            const active = filter === f;
            return (
              <button key={f} type="button" onClick={() => onChangeFilter(f)}
                className={`px-3 py-1.5 rounded-lg transition ${active ? "bg-emerald-500 text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>
                {f}
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => onChangeQ(e.target.value)} type="text"
            placeholder="Filtrar por placa, conductor, quien aprobó, nota…"
            className="w-full h-9 pl-8 pr-3 text-sm rounded-xl border border-gray-200 dark:border-white/[0.08] bg-transparent outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Calendar size={11} /> Desde
          <DatePicker value={dateFrom} onChange={onChangeDateFrom} placeholder="Fecha desde" />
          <span>→</span>
          <DatePicker value={dateTo} onChange={onChangeDateTo} placeholder="Fecha hasta" />
        </div>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={<History size={18} />} title="Sin resultados" subtitle="Ajustá los filtros o esperá nuevas solicitudes." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03]">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 dark:border-white/[0.06]">
              <tr>
                {["Decidida", "Vehículo", "Conductor", "Aprobador", "Estado", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
              {items.map((a) => (
                <tr key={a.id} className="group cursor-pointer hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition" onClick={() => onOpen(a)}>
                  <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtDate(a.decidedAt ?? a.requestedAt)}</td>
                  <td className="px-5 py-3.5 font-semibold text-gray-800 dark:text-gray-200">{a.assetPlate ?? a.assetLabel ?? "—"}</td>
                  <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">{a.driverName ?? "—"}</td>
                  <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">{a.decidedByName ?? "—"}</td>
                  <td className="px-5 py-3.5"><StatusPill status={a.status} /></td>
                  <td className="px-5 py-3.5 text-right text-xs text-emerald-600 dark:text-emerald-400 font-semibold opacity-0 group-hover:opacity-100 transition">Ver →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Empty / Loader ───────────────────────────────────────────────────────────

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] py-16 text-center">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 dark:bg-white/[0.06] text-gray-400 mb-2">{icon}</div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>
    </div>
  );
}

function CenteredLoader({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] py-16 text-center text-sm text-gray-500 dark:text-gray-400">
      <Loader2 size={16} className="inline animate-spin mr-2" /> {label}
    </div>
  );
}

// ─── Conductor view ───────────────────────────────────────────────────────────

function ConductorView({ loading, myAsset, driverId, items, onSolicitar, onOpenDetail, children }: {
  loading: boolean;
  myAsset: { id: string; plate: string; brand: string; model: string } | null;
  driverId: number | null;
  items: ExitAuthorization[];
  onSolicitar: () => void;
  onOpenDetail: (a: ExitAuthorization) => void;
  children: React.ReactNode;
}) {
  const { session } = useAuth();
  const pendientes = items.filter((a) => a.status === "Pendiente");
  const ultima = items[0];
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-emerald-200/60 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-50/40 to-white dark:from-emerald-500/[0.04] dark:to-gray-900 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
              <Truck size={10} /> Vehículo asignado
            </span>
            <h2 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
              {myAsset?.plate ?? "Sin vehículo asignado"}
            </h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {[myAsset?.brand, myAsset?.model].filter(Boolean).join(" ") || "—"}
            </p>
            {driverId && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Conductor: <span className="font-semibold text-gray-700 dark:text-gray-300">{session?.name ?? ""}</span>
              </p>
            )}
          </div>
          <button type="button" onClick={onSolicitar}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition active:scale-95">
            <Plus size={14} /> Solicitar autorización de salida
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Solicitudes totales" value={items.length} />
        <MiniStat label="Pendientes"          value={pendientes.length} tone="amber" />
        <MiniStat label="Autorizadas"         value={items.filter((a) => a.status === "Autorizada").length} tone="emerald" />
        <MiniStat label="Rechazadas"          value={items.filter((a) => a.status === "Rechazada").length} tone="rose" />
      </div>

      {loading ? <CenteredLoader label="Cargando solicitudes…" />
        : ultima ? (
          <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-5">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white mb-3">Última solicitud registrada</h3>
            <button type="button" onClick={() => onOpenDetail(ultima)} className="w-full text-left">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{ultima.assetPlate ?? ultima.assetLabel}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Solicitada {fmtDate(ultima.requestedAt)}</p>
                </div>
                <StatusPill status={ultima.status} />
              </div>
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-500/[0.04] p-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Aún no has realizado ninguna solicitud.</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Cuando completes tu primera inspección de pre-salida, aparecerá aquí.</p>
          </div>
        )}

      {children}
    </div>
  );
}

function MiniStat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "amber" | "emerald" | "rose" }) {
  const c = { neutral: "text-gray-700 dark:text-gray-200", amber: "text-amber-600 dark:text-amber-400", emerald: "text-emerald-600 dark:text-emerald-400", rose: "text-rose-600 dark:text-rose-400" }[tone];
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${c}`}>{value}</p>
    </div>
  );
}

// ─── Decision popup ───────────────────────────────────────────────────────────

function DecisionPopup({ status, auth, onClose }: {
  status: "Autorizada" | "Rechazada";
  auth: ExitAuthorization;
  onClose: () => void;
}) {
  const isAprob = status === "Autorizada";
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4"
        onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 shadow-2xl">
          <div className="px-6 pt-6 pb-4 text-center">
            <div className={`mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full ${isAprob ? "bg-emerald-100 dark:bg-emerald-500/20" : "bg-rose-100 dark:bg-rose-500/20"}`}>
              {isAprob
                ? <Check size={26} className="text-emerald-600 dark:text-emerald-400" />
                : <AlertTriangle size={26} className="text-rose-600 dark:text-rose-400" />}
            </div>
            <h2 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white tracking-tight">
              {isAprob ? "¡Salida aprobada!" : "Salida rechazada"}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {auth.assetPlate ?? auth.assetLabel ?? "Tu vehículo"} · {fmtDate(auth.decidedAt ?? auth.requestedAt)}
            </p>
            {auth.decisionNotes && (
              <div className={`mt-4 rounded-xl border px-3 py-2 text-left text-sm ${isAprob ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10" : "border-rose-200 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10"}`}>
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1">Motivo</p>
                <p className="text-gray-800 dark:text-gray-200">{auth.decisionNotes}</p>
              </div>
            )}
          </div>
          <div className="px-5 py-3.5 border-t border-gray-200 dark:border-white/[0.08] bg-gray-50/60 dark:bg-white/[0.02] flex items-center gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 dark:border-white/[0.08] py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.04] transition">
              Cerrar
            </button>
            <button type="button" onClick={onClose}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold text-white transition ${isAprob ? "bg-emerald-500 hover:bg-emerald-600" : "bg-rose-500 hover:bg-rose-600"}`}>
              Entendido
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}