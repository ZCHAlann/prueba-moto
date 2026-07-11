"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Inbox, History, Loader2, AlertTriangle, AlertCircle,
  Check, Search, Calendar, Truck, Camera, X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useExitAuthorizations, type ConductorContext, type ExitAuthorization, type ExitAuthStatus } from "../../hooks/useExitAuthorizations";
import { SolicitarSalidaWizard } from "./components/SolicitarSalidaWizard";
import { useUploadQueue } from "../../hooks/useUploadQueue";
import { ExitAuthDetailDrawer } from "./components/ExitAuthDetailDrawer";
import { warmupFFmpeg } from "../../lib/mediaCompress";
import { DatePicker } from "@/components/ui/date-picker/DatePicker";
import { fmtDateTimeEc } from "@/lib/datetime";

type SubTab = "entrantes" | "historial";
type HistorialFilter = "Autorizadas" | "Rechazadas";

const fmtDate = fmtDateTimeEc;

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

  const { items, total, pageSize, totalPages, loading, fetchList, fetchConductorContext, decide, remove, wsChangeCount, wsCorrectionsCount, wsLastDecidedId, wsLastAiAptoId, wsLastFailedId, lastAnalysisError } = useExitAuthorizations();

  const [conductorCtx, setConductorCtx] = useState<ConductorContext | null>(null);

  // ── Set de IDs ya vistos — para no mostrar popup de decisiones antiguas
  const [shownIds, setShownIds] = useState<Set<string>>(new Set());
  // Mientras la IA está analizando una autorización recién creada, mostramos
  // un modal con un spinner al conductor. Se cierra cuando el WS le avisa
  // (corrections-sent) o cuando se aprueba/rechaza. Evita que el conductor
  // piense que "no pasó nada" entre que crea la solicitud y recibe el
  // resultado del análisis.
  //
  // Importante: estos useState van ANTES de los useEffect que los usan
  // en sus arrays de dependencias. Si estuvieran después, JS tira TDZ
  // ("Cannot access 'analyzingAuthId' before initialization") al evaluar
  // el array de deps.
  const [analyzingAuthId, setAnalyzingAuthId] = useState<string | null>(null);
  const [analyzingStartedAt, setAnalyzingStartedAt] = useState<number | null>(null);
  const initialLoadDone = useRef(false);
  const [aiAptoPopup, setAiAptoPopup] = useState(false);

  // ── Pre-cargar ffmpeg.wasm al entrar a la pantalla de autorizaciones.
  // El wizard de "Solicitar salida" graba un video (bayoneta de aceite) y
  // necesita ffmpeg.wasm para comprimirlo antes de subir. ffmpeg.wasm pesa
  // ~30 MB (WASM + glue) y tarda 2-3 s en cargar desde la CDN. Si lo
  // arrancamos al mount del page, cuando el usuario termina la primera
  // captura el core ya está listo y no hay freeze perceptible.
  //
  // Es seguro llamarlo aunque ffmpeg no esté disponible: warmupFFmpeg
  // captura el error internamente y `compressVideo()` cae al archivo
  // original.
  useEffect(() => {
    warmupFFmpeg();
  }, []);
  // Cuando el análisis IA falla por video muy grande, abrimos este
  // mini-modal para que el conductor reenvíe solo el video problemático.
  // Para otros errores (rate limit, timeout, etc.) NO se abre — el
  // toast es suficiente.
  const [resubmitErrorTarget, setResubmitErrorTarget] = useState<{ authId: string; message: string } | null>(null);


  // ── Carga inicial
  useEffect(() => {
    if (isConductor) {
      void fetchConductorContext().then((ctx) => {
        if (!ctx) return;
        setConductorCtx(ctx);

        const decided = ctx.authorizations.find(
          (a) => a.status !== "Pendiente" && !shownIds.has(a.id)
        );

      });
    }
  }, [isConductor, fetchConductorContext]);

  // ── Cuando llega un evento WS nuevo → refetch y evaluar popup
  const prevWsCount = useRef(0);
  useEffect(() => {
    if (!isConductor) return;
    if (wsChangeCount === 0) return;
    if (wsChangeCount === prevWsCount.current) return;
    prevWsCount.current = wsChangeCount;
  }, [isConductor, wsChangeCount]);

  // ── Cuando llega corrections-sent / corrections-resubmitted → refrescar
  // el contexto del conductor para que el card amarillo "Corregir ahora"
  // aparezca sin recargar la página.
  const prevWsCorrections = useRef(0);
  useEffect(() => {
    if (!isConductor) return;
    if (wsCorrectionsCount === 0) return;
    if (wsCorrectionsCount === prevWsCorrections.current) return;
    prevWsCorrections.current = wsCorrectionsCount;

    void fetchConductorContext().then((ctx) => {
      if (ctx) setConductorCtx(ctx);
      // Si la IA ya terminó de analizar (recibimos corrections-sent
      // para esta autorización), cerramos el modal de "Analizando...".
      // El card amarillo aparecerá solo porque pendingCorrections
      // ahora tiene un item con correctionsSentAt y no
      // correctionsResubmittedAt.
      if (analyzingAuthId) {
        setAnalyzingAuthId(null);
        setAnalyzingStartedAt(null);
      }
    });
  }, [isConductor, wsCorrectionsCount, fetchConductorContext, analyzingAuthId]);

  // ── Cuando llega una decisión (Autorizada/Rechazada) al conductor →
  // mostrar popup de notificación. Este hook está separado del de
  // correcciones para no mezclarlos.
  //
  // Cambiamos el counter `wsDecidedCount` por `wsLastDecidedId` (authId
  // de la última decisión). Si el authId ya está en `shownIds`, NO
  // se vuelve a mostrar el popup. Esto previene que múltiples eventos
  // WS para el mismo auth disparen el modal N veces.
  useEffect(() => {
    if (!isConductor) return;
    if (!wsLastDecidedId) return;
    if (shownIds.has(wsLastDecidedId)) return;

    void fetchConductorContext().then((ctx) => {
      if (!ctx) return;
      setConductorCtx(ctx);

      // Buscar la autorización específica que disparó este evento.
      const decided = ctx.authorizations.find((a) => a.id === wsLastDecidedId);
      if (!decided) return;
      if (decided.status === "Pendiente") return;
      const decidedDriverNum = String(decided.driverId).replace(/^driver-/, "");
      if (String(ctx.driverId) !== decidedDriverNum) return;

      setShownIds((prev) => new Set([...prev, decided.id]));
      setPendingDecisionPopup({
        status: decided.status as "Autorizada" | "Rechazada",
        auth: decided,
      });
      // Si el supervisor aprobó/rechazó la autorización que el conductor
      // estaba esperando analizar, cerramos el modal de "Analizando...".
      if (analyzingAuthId === decided.id) {
        setAnalyzingAuthId(null);
        setAnalyzingStartedAt(null);
      }
    });
  }, [isConductor, wsLastDecidedId, fetchConductorContext, shownIds, analyzingAuthId]);

  // useEffect — escucha cuando la IA aprueba
  // useEffect — escucha cuando la IA aprueba. Antes era un counter
  // (wsAiAptoCount) que se incrementaba N veces por análisis, lo que
  // disparaba el popup múltiples veces. Ahora usamos el authId del
  // último análisis aprobado, y solo mostramos el popup si el authId
  // cambió (el conductor lo vio una vez, ya no lo re-mostramos).
  const prevWsAiAptoId = useRef<string | null>(null);
  useEffect(() => {
    if (!isConductor) return;
    if (!wsLastAiAptoId) return;
    if (wsLastAiAptoId === prevWsAiAptoId.current) return;
    prevWsAiAptoId.current = wsLastAiAptoId;

    // Cerrar modal de "Analizando..."
    setAnalyzingAuthId(null);
    setAnalyzingStartedAt(null);

    // Mostrar popup "¡La IA aprobó tu solicitud!"
    setAiAptoPopup(true);

    // Refrescar contexto del conductor
    void fetchConductorContext().then((ctx) => { if (ctx) setConductorCtx(ctx); });
  }, [isConductor, wsLastAiAptoId, fetchConductorContext]);

  // useEffect — escucha cuando el análisis IA falla (ej: video muy
  // grande). Cierra el modal "Analizando..." y abre el mini-modal de
  // "Reenviar solo el video problemático".
  const prevWsFailedId = useRef<string | null>(null);
  useEffect(() => {
    if (!isConductor) return;
    if (!wsLastFailedId) return;
    if (wsLastFailedId === prevWsFailedId.current) return;
    prevWsFailedId.current = wsLastFailedId;

    // Cerrar el AnalyzingModal inmediatamente para no dejarlo abierto
    // mientras el conductor lee el toast.
    setAnalyzingAuthId(null);
    setAnalyzingStartedAt(null);

    // El `lastAnalysisError` ya viene seteado en el mismo render que
    // disparó el cambio. Solo abrimos el mini-modal de "reenviar video"
    // cuando el error es VIDEO_TOO_LARGE (peso del video). Para los
    // demás errores (rate limit, timeout, etc.) solo se muestra el
    // toast — no hay nada que el conductor pueda reenviar.
    if (
      lastAnalysisError
      && lastAnalysisError.authId === wsLastFailedId
      && lastAnalysisError.code === "VIDEO_TOO_LARGE"
    ) {
      setResubmitErrorTarget(lastAnalysisError);
    }
  }, [isConductor, wsLastFailedId, lastAnalysisError]);

  // ── Timeout de seguridad: si pasan 60s y la IA no responde (algo
  // falló en el backend), cerramos el modal para no dejar al conductor
  // esperando eternamente. El card amarillo o el popup de decisión
  // aparecerán cuando llegue el WS event correspondiente.
  useEffect(() => {
    if (!analyzingAuthId || !analyzingStartedAt) return;
    const timeoutId = setTimeout(() => {
      setAnalyzingAuthId(null);
      setAnalyzingStartedAt(null);
    }, 60_000);
    return () => clearTimeout(timeoutId);
  }, [analyzingAuthId, analyzingStartedAt]);

  // ── Estado UI
  const [subTab, setSubTab] = useState<SubTab>("entrantes");
  const [wizardOpen, setWizardOpen] = useState(false);
  // Cuando el conductor hace "Corregir ahora" en el card de correcciones
  // pendientes, guardamos la autorización acá. El wizard lee esto para
  // arrancar en modo corrección (no crear una nueva autorización, sino
  // hacer PATCH /:authId/photo por cada item + POST /corrections/submit).
  const [correctionTarget, setCorrectionTarget] = useState<ExitAuthorization | null>(null);
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
  // Page local por subtab (entrantes / historial). Reset a 1 al cambiar filtros.
  const [entrantesPage, setEntrantesPage] = useState(1);
  const [historialPage, setHistorialPage] = useState(1);

  // ── Carga al backend cuando cambian subTab / filtros / página ─────────────
  // El backend pagina y filtra. La lista `items` que llega al hook ya es la
  // página actual del universo filtrado.
  const statusMap: Record<HistorialFilter, ExitAuthStatus> = {
    "Autorizadas": "Autorizada",
    "Rechazadas":  "Rechazada",
  };
  useEffect(() => {
    if (subTab === "entrantes") {
      void fetchList({ status: "Pendiente", page: entrantesPage, pageSize: 7 });
    } else {
      void fetchList({
        status: statusMap[historialFilter],
        q: q.trim() || undefined,
        from: dateFrom || undefined,
        to:   dateTo   || undefined,
        page: historialPage,
        pageSize: 7,
      });
    }
    // fetchList no se incluye en deps: companyIdStr es la única dep estable
    // y el resto son inputs explícitos del efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, historialFilter, q, dateFrom, dateTo, entrantesPage, historialPage]);

  // Reset a página 1 cuando cambian los filtros del historial.
  useEffect(() => { setHistorialPage(1); }, [historialFilter, q, dateFrom, dateTo]);
  // Reset a página 1 al cambiar de tab.
  useEffect(() => { setEntrantesPage(1); setHistorialPage(1); }, [subTab]);

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
        onSolicitar={() => { setCorrectionTarget(null); setWizardOpen(true); }}
        onOpenDetail={(a) => openDetail(a, "viewer")}
        onOpenCorrections={(a) => { setCorrectionTarget(a); setWizardOpen(true); }}
      >
        {wizardOpen && (
          <SolicitarSalidaWizard
            open={wizardOpen}
            onClose={() => { setWizardOpen(false); setCorrectionTarget(null); }}
            onCreated={(auth) => {
              setWizardOpen(false);
              setCorrectionTarget(null);
              // Mostrar el modal de "Analizando con IA..." mientras la IA
              // procesa la autorización. Se cierra cuando llega el primer
              // WS event relacionado (corrections-sent o decided).
              setAnalyzingAuthId(auth.id);
              setAnalyzingStartedAt(Date.now());
              void fetchConductorContext().then(setConductorCtx);
            }}
            initialAsset={myAsset}
            driverId={conductorCtx?.driverId ?? null}
            correctionMode={correctionTarget ? {
              authId: correctionTarget.id,
              // El companyId de la URL del backend debe matchear el del
              // session (parseInt en requireCompany), NO el companyId
              // prefijado del item (ej: "company-1"). Si usamos
              // correctionTarget.companyId, la URL queda como
              // /company/company-1/... y el backend tira 403
              // "ID de empresa inválido".
              companyId: String(session?.companyId ?? ""),
              existingAuthorization: correctionTarget,
              // Los items a corregir se cargan dentro del propio wizard
              // (cuando entra en modo corrección) haciendo fetch a
              // GET /corrections. Acá arrancamos con lista vacía; el
              // useEffect interno del wizard los completa.
              items: [],
            } : null}
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
         <AnalyzingModal
            open={!!analyzingAuthId}
            onClose={() => { setAnalyzingAuthId(null); setAnalyzingStartedAt(null); }}
          />
        {aiAptoPopup && (
          <AiAptoModal onClose={() => setAiAptoPopup(false)} />
        )}
        {resubmitErrorTarget && (
          <ResubmitVideoModal
            target={resubmitErrorTarget}
            onClose={() => setResubmitErrorTarget(null)}
            onSuccess={() => {
              setResubmitErrorTarget(null);
              // Abrir el "Analizando..." mientras el backend dispara el
              // re-análisis. Se cierra solo cuando llega el WS event
              // (analysis-completed o analysis-failed).
              setAnalyzingAuthId(resubmitErrorTarget.authId);
              setAnalyzingStartedAt(Date.now());
              // Refrescar contexto para ver el status actualizado.
              void fetchConductorContext().then((ctx) => { if (ctx) setConductorCtx(ctx); });
            }}
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
              items={items}
              loading={loading}
              total={total}
              totalPages={totalPages}
              page={entrantesPage}
              onChangePage={setEntrantesPage}
              onOpen={(a) => openDetail(a, canDecide ? "operator" : "viewer")}
            />
          </motion.div>
        )}
        {subTab === "historial" && (
          <motion.div key="hist" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
            <HistorialTab
              items={items}
              filter={historialFilter}
              onChangeFilter={setHistorialFilter}
              q={q}
              onChangeQ={setQ}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChangeDateFrom={setDateFrom}
              onChangeDateTo={setDateTo}
              total={total}
              totalPages={totalPages}
              page={historialPage}
              onChangePage={setHistorialPage}
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

      {/* ── Modal "Analizando con IA..." ──
          Se muestra cuando el conductor crea una nueva autorización y la
          IA la está procesando. Se cierra automáticamente cuando llega
          un WS event (corrections-sent o decided) o cuando pasan 60s. */}
      <AnalyzingModal
        open={!!analyzingAuthId}
        onClose={() => { setAnalyzingAuthId(null); setAnalyzingStartedAt(null); }}
      />
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

function EntrantesTab({ items, loading, total, totalPages, page, onChangePage, onOpen }: {
  items: ExitAuthorization[];
  loading: boolean;
  total: number;
  totalPages: number;
  page: number;
  onChangePage: (p: number) => void;
  onOpen: (a: ExitAuthorization) => void;
}) {
  if (loading && items.length === 0) return <CenteredLoader label="Buscando solicitudes entrantes…" />;
  if (items.length === 0) return <EmptyState icon={<Inbox size={18} />} title="Sin solicitudes entrantes" subtitle="Las nuevas solicitudes se mostrarán aquí en tiempo real." />;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-gray-100 dark:border-white/[0.06]">
            <tr>
              {["Hora", "Vehículo", "Conductor", "Estado", ""].map((h, i, arr) => {
                const isLast = i === arr.length - 1;
                return (
                  <th
                    key={h}
                    className={
                      isLast
                        ? ""
                        : "px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                    }
                  >
                    {h}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
            {items.map((a) => (
              <tr key={a.id} className="group cursor-pointer hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition" onClick={() => onOpen(a)}>
                <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtDate(a.requestedAt)}</td>
                <td className="px-5 py-3.5 font-semibold text-gray-800 dark:text-gray-200">{a.assetPlate ?? a.assetLabel ?? "—"}</td>
                <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">{a.driverName ?? "—"}</td>
                <td className="px-5 py-3.5"><StatusPill status={a.status} /></td>
                <td className=" group-hover:bg-gray-50/60 dark:group-hover:bg-white/[0.02] px-5 py-3.5 text-right text-xs text-emerald-600 dark:text-emerald-400 font-semibold opacity-0 group-hover:opacity-100 transition">Revisar →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginator page={page} totalPages={totalPages} total={total} onChange={onChangePage} />
    </div>
  );
}

// ─── Historial tab ────────────────────────────────────────────────────────────

function HistorialTab({ items, filter, onChangeFilter, q, onChangeQ, dateFrom, dateTo, onChangeDateFrom, onChangeDateTo, total, totalPages, page, onChangePage, onOpen }: {
  items: ExitAuthorization[];
  filter: HistorialFilter;
  onChangeFilter: (f: HistorialFilter) => void;
  q: string;
  onChangeQ: (s: string) => void;
  dateFrom: string;
  dateTo: string;
  onChangeDateFrom: (s: string) => void;
  onChangeDateTo: (s: string) => void;
  total: number;
  totalPages: number;
  page: number;
  onChangePage: (p: number) => void;
  onOpen: (a: ExitAuthorization) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="inline-flex shrink-0 rounded-xl border border-gray-200 dark:border-white/[0.08] p-0.5 text-xs font-semibold">
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
        <div className="relative min-w-0 flex-1">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => onChangeQ(e.target.value)} type="text"
            placeholder="Filtrar por placa, conductor, quien aprobó, nota…"
            className="w-full h-9 pl-8 pr-3 text-sm rounded-xl border border-gray-200 dark:border-white/[0.08] bg-transparent outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Calendar size={11} /> Desde
          <DatePicker compact value={dateFrom} onChange={onChangeDateFrom} placeholder="Fecha desde" />
          <span>→</span>
          <DatePicker compact value={dateTo} onChange={onChangeDateTo} placeholder="Fecha hasta" />
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<History size={18} />} title="Sin resultados" subtitle="Ajustá los filtros o esperá nuevas solicitudes." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03]">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-gray-100 dark:border-white/[0.06]">
                <tr>
                  {["Decidida", "Vehículo", "Conductor", "Aprobador", "Estado", ""].map((h, i, arr) => {
                    const isLast = i === arr.length - 1;
                    return (
                      <th
                        key={h}
                        className={
                          isLast
                            ? ""
                            : "px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                        }
                      >
                        {h}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                {items.map((a) => (
                  <tr key={a.id} className="group cursor-pointer hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition" onClick={() => onOpen(a)}>
                    <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtDate(a.decidedAt ?? a.requestedAt)}</td>
                    <td className="px-5 py-3.5 font-semibold text-gray-800 dark:text-gray-200">{a.assetPlate ?? a.assetLabel ?? "—"}</td>
                    <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">{a.driverName ?? "—"}</td>
                    <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">
                      {a.decidedByName ?? (
                        a.decisionNotes?.includes('automáticamente')
                          ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                              Sistema
                            </span>
                          : "—"
                      )}
                    </td>
                    <td className="px-5 py-3.5"><StatusPill status={a.status} /></td>
                    <td className=" group-hover:bg-gray-50/60 dark:group-hover:bg-white/[0.02] px-5 py-3.5 text-right text-xs text-emerald-600 dark:text-emerald-400 font-semibold opacity-0 group-hover:opacity-100 transition">Ver →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginator page={page} totalPages={totalPages} total={total} onChange={onChangePage} />
        </>
      )}
    </div>
  );
}

// ─── Paginator ────────────────────────────────────────────────────────────────

function Paginator({ page, totalPages, total, onChange }: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  // Generar páginas visibles — siempre muestra máximo 5 botones
  const pages: (number | "...")[] = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between px-1">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {total} resultado{total !== 1 ? "s" : ""} · página {page} de {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onChange(page - 1)} disabled={page === 1}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 transition text-xs">
          ‹
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">…</span>
          ) : (
            <button key={p} type="button" onClick={() => onChange(p as number)}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold transition ${
                page === p
                  ? "bg-emerald-500 text-white border border-emerald-500"
                  : "border border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
              }`}>
              {p}
            </button>
          )
        )}
        <button type="button" onClick={() => onChange(page + 1)} disabled={page === totalPages}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 transition text-xs">
          ›
        </button>
      </div>
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

function AiAptoModal({ onClose }: { onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4"
        onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 shadow-2xl">
          <div className="px-6 pt-6 pb-4 text-center">
            <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
              <Check size={26} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white tracking-tight">
              ¡Análisis completado!
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              El sistema revisó todas tus evidencias y tu vehículo está en condiciones de salir.
            </p>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              Tu solicitud está pendiente de aprobación final del supervisor.
            </p>
          </div>
          <div className="px-5 py-3.5 border-t border-gray-200 dark:border-white/[0.08] bg-gray-50/60 dark:bg-white/[0.02]">
            <button type="button" onClick={onClose}
              className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 py-2 text-sm font-semibold text-white transition">
              Entendido
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}


// ─── ResubmitVideoModal ──────────────────────────────────────────────────────
//
// Mini-modal que aparece cuando el análisis IA falla (típicamente
// porque el video de la bayoneta pesa más de 15 MB y supera el límite
// de envío directo a Gemini). Le permite al conductor re-grabar SOLO
// el video problemático, sin tener que pasar por todo el wizard.
//
// Flujo:
//   1. Conductor graba un nuevo video (cámara del celular).
//   2. Se sube en chunks a /api/upload/exit-auth-video-chunk.
//   3. PATCH al /photo con el nuevo `oilBayonetaVideoUrl`.
//   4. POST al /reanalyze (con el body que incluye la URL nueva).
//   5. El backend dispara el reanálisis en background y broadcastea
//      el resultado por WS (analysis-completed o analysis-failed).
//   6. El modal "Analizando..." (que ya está abierto en el page)
//      refleja el nuevo estado.
function ResubmitVideoModal({ target, onClose, onSuccess }: {
  target: { authId: string; message: string };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;
  // Usamos el mismo hook de upload que el wizard. Esto garantiza que
  // la URL devuelta por el backend (`/uploads/exit-auth-video/{cid}/...`)
  // sea la real — antes construíamos una URL falsa con el uploadId
  // que no apuntaba al archivo en disco y el reanálisis fallaba con
  // "Archivo no encontrado".
  //
  // Si el usuario no está autenticado todavía (caso edge), NO montamos
  // el hook con `companyId = ""` porque eso tira errores en el
  // `useUploadQueue` al armar la URL. Mejor no renderizar.
  const { enqueue } = useUploadQueue(companyId ?? "");
  const videoInputRef = useRef<HTMLInputElement>(null);
  const stepId = "resubmit-video"; // stepId único para esta sesión
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Limpia el object URL al desmontar o cambiar el archivo.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function onPickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      setError("El archivo tiene que ser un video.");
      return;
    }
    // Avisamos antes de aceptar archivos enormes: el límite duro de
    // Gemini son 15 MB. Si el conductor re-graba uno más largo, va a
    // fallar otra vez.
    if (f.size > 15 * 1024 * 1024) {
      setError(`El video pesa ${(f.size / 1024 / 1024).toFixed(1)} MB. Tiene que pesar menos de 15 MB.`);
      return;
    }
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    setFile(f);
  }

  function onRemove() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  async function onSubmit() {
    if (!file || !companyId) return;
    setUploading(true);
    setError(null);
    try {
      // 1. Subir vía useUploadQueue. La función `enqueue` devuelve la
      // URL REAL que el backend construyó (e.g.
      // `/uploads/exit-auth-video/1/1782342773380-uu6dtj.mp4`).
      const url = await enqueue(stepId, file, true);

      // 2. PATCH /photo con la URL real.
      const patchRes = await fetch(
        `/api/company/${companyId}/exit-authorizations/${target.authId}/photo`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ field: "oilBayonetaVideoUrl", url }),
        },
      );
      if (!patchRes.ok) {
        const j = await patchRes.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${patchRes.status}`);
      }
      // 3. POST /reanalyze con la URL real en el body. El backend
      // limpia el error, reemplaza la URL y dispara el reanálisis en
      // background. El frontend abre el AnalyzingModal.
      const reanalyzeRes = await fetch(
        `/api/company/${companyId}/exit-authorizations/${target.authId}/reanalyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ oilBayonetaVideoUrl: url }),
        },
      );
      if (!reanalyzeRes.ok) {
        const j = await reanalyzeRes.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${reanalyzeRes.status}`);
      }
      // Listo. El backend broadcastea el resultado por WS. Cerramos
      // este modal y le avisamos al page para que muestre el
      // "Analizando...".
      //
      // Importante: NO ejecutamos `setUploading(false)` en el `finally`
      // porque `onSuccess` desmonta este modal y React tira error al
      // hacer `setState` sobre un componente desmontado. Solo lo
      // reseteamos si hubo un error (el modal sigue montado).
      onSuccess();
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reenviar el video.");
      setUploading(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[65] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4"
        onClick={uploading ? undefined : onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md overflow-hidden rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-white dark:bg-gray-900 shadow-2xl">
          <div className="px-6 pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-xl bg-rose-100 dark:bg-rose-500/20 p-2.5">
                <AlertCircle size={20} className="text-rose-600 dark:text-rose-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">
                  Reenviar el video
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-snug">
                  {target.message}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Graba un video más corto (menor a 15&nbsp;MB). Solo necesitas reenviar este video, las otras fotos quedan igual.
            </p>
            {error && (
              <p className="mt-3 rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                {error}
              </p>
            )}
          </div>

          <div className="px-5 pb-4">
            {previewUrl ? (
              <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.02]">
                <video src={previewUrl} controls className="w-full max-h-64" />
                {!uploading && (
                  <button type="button" onClick={onRemove}
                    className="absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 dark:bg-gray-900/90 text-gray-700 dark:text-gray-200 shadow hover:bg-white">
                    <X size={14} />
                  </button>
                )}
              </div>
            ) : (
              <button type="button" onClick={() => videoInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-gray-300 dark:border-white/[0.12] hover:border-rose-400 dark:hover:border-rose-500/40 hover:bg-rose-50/30 dark:hover:bg-rose-500/[0.04] transition">
                <div className="rounded-full bg-rose-100 dark:bg-rose-500/20 p-3">
                  <Camera size={22} className="text-rose-600 dark:text-rose-400" />
                </div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Grabar video</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Máx. 15&nbsp;MB · mp4 / mov</p>
              </button>
            )}
            <input ref={videoInputRef} type="file" accept="video/*" capture="environment" hidden
              onChange={onPickVideo} />
            {uploading && (
              <div className="mt-2 flex items-center justify-center gap-2 text-xs text-rose-700 dark:text-rose-300">
                <Loader2 size={14} className="animate-spin" />
                Subiendo video, espera unos segundos…
              </div>
            )}
          </div>

          <div className="px-5 py-3.5 border-t border-gray-200 dark:border-white/[0.08] bg-gray-50/60 dark:bg-white/[0.02] flex gap-2">
            <button type="button" onClick={onClose} disabled={uploading}
              className="flex-1 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.08] transition disabled:opacity-50">
              Cancelar
            </button>
            <button type="button" onClick={onSubmit} disabled={!file || uploading}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 py-2 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed">
              {uploading ? <><Loader2 size={14} className="animate-spin" /> Subiendo…</> : "Reenviar"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}


// ─── Conductor view ───────────────────────────────────────────────────────────

function ConductorView({ loading, myAsset, driverId, items, onSolicitar, onOpenDetail, onOpenCorrections, children }: {
  loading: boolean;
  myAsset: { id: string; plate: string; brand: string; model: string } | null;
  driverId: number | null;
  items: ExitAuthorization[];
  onSolicitar: () => void;
  onOpenDetail: (a: ExitAuthorization) => void;
  onOpenCorrections: (a: ExitAuthorization) => void;
  children: React.ReactNode;
}) {
  const { session } = useAuth();
  const pendientes = items.filter((a) => a.status === "Pendiente");
  const ultima = items[0];
  // Detectar si hay autorizaciones con correcciones pendientes (la IA o el
  // supervisor las devolvió para que el conductor rehaga alguna foto/video).
  // Se prioriza la más reciente para mostrarla en el card prominente.
  //
  // Una autorización tiene correcciones PENDIENTES solo si:
  //   - correctionsSentAt está seteada (se enviaron correcciones), Y
  //   - correctionsResubmittedAt NO está seteada (conductor aún no
  //     resubmitió), Y
  //   - status === "Pendiente" (no fue aprobada/rechazada por el supervisor).
  //
  // La última condición es la más importante: si el supervisor decide
  // aprobar o rechazar la salida manualmente, las correcciones pendientes
  // se descartan. El card amarillo debe desaparecer.
  const pendingCorrections = items
    .filter((a) =>
      !!a.correctionsSentAt
      && !a.correctionsResubmittedAt
      && a.status === "Pendiente"
    )
    .sort((a, b) => (b.correctionsSentAt ?? "").localeCompare(a.correctionsSentAt ?? ""));
  const correctionAuth = pendingCorrections[0] ?? null;
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
          {myAsset && (
            <button type="button" onClick={onSolicitar}
              className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-500/30 transition active:scale-95 sm:w-auto">
              <Plus size={14} /> Solicitar autorización de salida
            </button>
          )}
          {!myAsset && (
            <div className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] px-4 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 sm:w-auto">
              <Truck size={14} /> Sin vehículo asignado
            </div>
          )}
        </div>
      </div>

      {/* ── Card de correcciones pendientes (solo si hay alguna). ──
          Aparece con prioridad sobre la última solicitud normal: si el
          supervisor devolvió esta autorización con fotos a rehacer, el
          conductor DEBE entrar a corregirla antes de seguir. */}
      {correctionAuth && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border-2 border-amber-300 dark:border-amber-500/40 bg-gradient-to-br from-amber-50 to-amber-100/40 dark:from-amber-500/[0.08] dark:to-amber-500/[0.02] p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-xl bg-amber-500 text-white p-2.5">
              <AlertCircle size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
                  Correcciones pendientes
                </p>
                {correctionAuth.correctionsRound > 0 && (
                  <span className="inline-flex items-center rounded-md bg-amber-200/70 dark:bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                    Ronda {correctionAuth.correctionsRound}
                  </span>
                )}
              </div>
              <h3 className="mt-1 text-base font-bold text-amber-900 dark:text-amber-200">
                Tu supervisor te pidió rehacer algunas fotos o video
              </h3>
              <p className="mt-0.5 text-sm text-amber-800/80 dark:text-amber-300/80">
                Vehículo <span className="font-semibold">{correctionAuth.assetPlate ?? correctionAuth.assetLabel}</span> ·
                solicitud <span className="font-mono text-xs">#{correctionAuth.id}</span> ·
                enviada {fmtDate(correctionAuth.correctionsSentAt!)}
              </p>
              <button type="button" onClick={() => onOpenCorrections(correctionAuth)}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-amber-500/30 transition active:scale-95">
                <Camera size={14} /> Corregir ahora
              </button>
            </div>
          </div>
        </motion.div>
      )}

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

// ─── Modal "Analizando con IA..." ────────────────────────────────────────────
//
// Se muestra mientras la IA procesa una autorización recién creada.
// Se cierra automáticamente cuando:
//   - Llega un WS event `corrections-sent` para esa autorización, o
//   - Llega un WS event `decided` (aprobada o rechazada), o
//   - Pasan 60s sin respuesta (timeout de seguridad), o
//   - El usuario hace click en "Cerrar".
//
// No se puede navegar mientras está abierto (es modal con backdrop).
function AnalyzingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-7 shadow-2xl text-center">
            {/* Spinner */}
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mb-4">
              <Loader2 size={32} className="text-emerald-600 dark:text-emerald-400 animate-spin" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Analizando…
            </h3>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-snug">
              Estamos revisando tus fotos y video con el sistema de análisis.
              <br />
              Esto toma unos segundos.
            </p>
            <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              <Loader2 size={10} className="animate-spin" />
              Procesando evidencia
            </div>
            <button type="button" onClick={onClose}
              className="mt-5 w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.08] transition active:scale-95">
              Cerrar
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}