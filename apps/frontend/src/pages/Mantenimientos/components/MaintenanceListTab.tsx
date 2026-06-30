import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search, ChevronLeft, ChevronRight, ChevronDown, Plus, Download, Pencil, Trash2, X,
  Wrench, Package, User as UserIcon, FileDown,
  ClipboardList, Truck, Check, Calendar, AlertTriangle, RefreshCw, CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "../../../context/AuthContext";
import { usePermissions } from "../../../hooks/usePermissions";
import {
  useMaintenancesList,
  useDeleteMaintenance,
  useTakeMaintenance,
  useStartMaintenance,
  useFinalizeMaintenance,
  useCancelRescheduleMaintenance,
  useRequestCorrection,
  useReauthorizeMaintenance,
  useMaintenanceCategories,
  isMaintenanceOverdue,
  type Maintenance,
  type MaintenanceStatus,
  type MaintenanceType,
} from "../../../hooks/useMaintenancesV2";
import { DatePicker } from "../../../components/ui/date-picker/DatePicker";
import { fmtDateTimeEc, fmtDateShortEc } from "@/lib/datetime";
import { MaintenanceFormModal } from "./MaintenanceFormModal";
import { MaintenanceDetailDrawer } from "./MaintenanceDetailDrawer";
import { ReprogramDialog } from "./ReprogramDialog";
import { ConfirmModal } from "../../../components/ui/ConfirmModal";

const PAGE_SIZE = 10;

const STATUS_CFG: Record<MaintenanceStatus, { label: string; cls: string; dot: string }> = {
  Programado:    { label: "Programado",   cls: "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/20",   dot: "bg-violet-500 dark:bg-violet-400" },
  "En proceso":  { label: "En proceso",   cls: "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/20",                     dot: "bg-sky-500 dark:bg-sky-400"        },
  Completado:    { label: "Completado",   cls: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20", dot: "bg-emerald-500 dark:bg-emerald-400" },
  Correccion:    { label: "Corrección",   cls: "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20",               dot: "bg-rose-500 dark:bg-rose-400" },
  Atrasado:      { label: "Atrasado",     cls: "text-rose-700 dark:text-rose-200 bg-rose-100 dark:bg-rose-500/20 border-rose-300 dark:border-rose-500/40",                dot: "bg-rose-600 dark:bg-rose-400"      },
};

const TYPE_CFG: Record<string, { label: string; cls: string; rowAccent: string }> = {
  Correctivo:  { label: "Correctivo",  cls: "text-orange-700 dark:text-orange-300",  rowAccent: "border-l-orange-500"   },
  Programado:  { label: "Programado",  cls: "text-violet-700 dark:text-violet-300",  rowAccent: "border-l-violet-500"   },
  Preventivo:  { label: "Programado",  cls: "text-violet-700 dark:text-violet-300",  rowAccent: "border-l-violet-500"   },
};

function fmtDate(iso?: string | null) {
  return fmtDateShortEc(iso);
}
function fmtDateTime(iso?: string | null) {
  return fmtDateTimeEc(iso);
}
function fmtMoney(n: number | string | null | undefined) {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
}

function userIdFromSession(sub: string | undefined): number | null {
  if (!sub) return null;
  const m = String(sub).match(/(\d+)$/);
  return m ? Number(m[1]) : null;
}

function idFromPrefixedString(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/(\d+)$/);
  return m ? Number(m[1]) : null;
}

interface Props {
  title?: string;
  /** Handler opcional para reautorizar un mantenimiento Atrasado de tipo
   *  Programado. Si no se pasa, usamos el handler interno que llama al
   *  endpoint POST /api/company/{companyId}/maintenances/{id}/reauthorize
   *  y refresca la lista. Se invoca con la fila y el motivo tipeado por
   *  el admin (puede ser string vacío). */
  onReauthorize?: (m: Maintenance, reason: string) => void;
}

export function MaintenanceListTab({ title, onReauthorize }: Props) {
  const { session, companyId } = useAuth();
  const { can } = usePermissions();
  const meId   = userIdFromSession(session?.id);
  const meRole = session?.role ?? "";
  const isFullAccess = meRole === "owner_empresa" || meRole === "admin_empresa" || meRole === "supervisor";

  const canCreate = can("mantenimiento", "execution", "crear");
  const canEdit   = can("mantenimiento", "execution", "editar");
  const canDelete = can("mantenimiento", "records", "eliminar");
  const canReauthorize = canEdit || isFullAccess;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const [subTab, setSubTab] = useState<"all" | MaintenanceStatus>("all");
  const [catChip, setCatChip] = useState<"all" | string>("all");
  const [typeChip, setTypeChip] = useState<"all" | "Correctivo" | "Programado">("all");

  const [from, setFrom] = useState<string>("");
  const [to,   setTo]   = useState<string>("");

  const [searchParams, setSearchParams] = useSearchParams();
  const assetIdFromUrl = searchParams.get("assetId") || "";

  // KPI click from EstadisticasTab: read ?from=&to=&kpi= params
  useEffect(() => {
    const f = searchParams.get("from");
    const t = searchParams.get("to");
    const kpi = searchParams.get("kpi");
    if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) setFrom(f);
    if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) setTo(t);
    if (kpi) {
      const statusMap: Record<string, typeof subTab> = {
        "Programado": "Programado",
        "En proceso": "En proceso",
        "Completado": "Completado",
        "Corrección": "Correccion",
        "Atrasado":   "Atrasado",
        "En curso": "En proceso",
      };
      const resolved = statusMap[kpi];
      if (resolved) setSubTab(resolved);
    }
  }, []); // run once on mount

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (subTab !== "all")   f.status   = subTab;
    if (catChip !== "all")  f.category = catChip;
    if (typeChip !== "all") f.type     = typeChip;
    if (search) f.q = search;
    if (from)   f.from = from;
    if (to)     f.to   = to;
    if (assetIdFromUrl) f.assetId = assetIdFromUrl;
    return f;
  }, [subTab, catChip, typeChip, search, from, to, assetIdFromUrl]);

  const clearAssetFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("assetId");
    setSearchParams(next, { replace: true });
  };

  const { data, isLoading } = useMaintenancesList(filters);
  const allRows = data?.data ?? [];
  const rows = useMemo(() => allRows, [allRows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows   = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── KPIs por estado ─────────────────────────────────────────────────
  // Para que el conteo por estado NO esté sesgado por el filtro de
  // status activo, hacemos una segunda query paralela con los mismos
  // filtros MENOS status. Así un usuario que filtra "Completado"
  // sigue viendo cuántos hay en cada estado.
  const kpiFilters = useMemo(() => {
    const f: Record<string, string> = { ...filters };
    delete f.status;
    return f;
  }, [filters]);
  const { data: kpiData } = useMaintenancesList(kpiFilters);
  const kpiRows = kpiData?.data ?? [];

  // Conteo por estado. "En curso" se mapea a "En proceso" para que
  // coincida con el chip que el usuario ve.
  const statusCounts = useMemo(() => {
    const acc: Record<MaintenanceStatus, number> = {
      Programado: 0,
      "En proceso": 0,
      Completado: 0,
      Correccion: 0,
      Atrasado: 0,
    };
    for (const m of kpiRows) {
      // Si el backend marca isOverdue pero el status sigue siendo
      // "Programado" (durante el rollout), lo contamos como Atrasado
      // para que la UI sea consistente.
      const isOver = isMaintenanceOverdue(m);
      const s = (isOver
        ? "Atrasado"
        : m.status === "En curso"
          ? "En proceso"
          : m.status) as MaintenanceStatus;
      if (s in acc) acc[s] += 1;
    }
    return acc;
  }, [kpiRows]);

  // Sparkline: serie de los últimos 14 buckets diarios con el conteo
  // de mantenimientos en cada estado. Sirve para la mini-línea del KPI.
  const sparkByStatus = useMemo(() => {
    const buckets: Record<MaintenanceStatus, number[]> = {
      Programado:  new Array(14).fill(0),
      "En proceso": new Array(14).fill(0),
      Completado:  new Array(14).fill(0),
      Correccion:  new Array(14).fill(0),
      Atrasado:    new Array(14).fill(0),
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const m of kpiRows) {
      const d = new Date(m.scheduledFor);
      if (isNaN(d.getTime())) continue;
      const diffDays = Math.floor((today.getTime() - d.getTime()) / 86_400_000);
      if (diffDays < 0 || diffDays > 13) continue;
      const idx = 13 - diffDays; // 0 = más viejo, 13 = hoy
      const isOver = isMaintenanceOverdue(m);
      const s = (isOver
        ? "Atrasado"
        : m.status === "En curso"
          ? "En proceso"
          : m.status) as MaintenanceStatus;
      if (s in buckets) buckets[s][idx] += 1;
    }
    return buckets;
  }, [kpiRows]);

  const { data: customCats = [] } = useMaintenanceCategories();
  const allCategories = useMemo(() => {
    const map: Record<string, { label: string; dot: string; cls: string }> = {
      "Primordial:Bombas":   { label: "Primordial · Bombas",  dot: "bg-amber-500",   cls: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10" },
      "Primordial:Motores":  { label: "Primordial · Motores", dot: "bg-cyan-500",    cls: "text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-500/10" },
      "Aceite:Cambio":       { label: "Aceite · Cambio",      dot: "bg-yellow-500",  cls: "text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-500/10" },
      "Aceite:Inventario":   { label: "Aceite · Inventario",  dot: "bg-emerald-500", cls: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10" },
      "Lavada":              { label: "Lavada",                dot: "bg-sky-500",     cls: "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-500/10" },
      "Otro":                { label: "Otro",                  dot: "bg-gray-400",    cls: "text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/[0.04]" },
    };
    for (const c of customCats) {
      const id = `custom:${c.id}`;
      map[id] = {
        label: c.label,
        dot:   "",
        cls:   "text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/[0.06]",
      };
    }
    return map;
  }, [customCats]);

  const categoryChips: Array<{ id: "all" | string; label: string; dot: React.ReactNode }> = useMemo(() => {
    const dotFor = (key: string): React.ReactNode => {
      if (key === "all") return <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />;
      const cfg = allCategories[key];
      if (!cfg) return <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />;
      if (key.startsWith("custom:")) {
        const id = key.replace("custom:", "");
        const c = customCats.find((x) => x.id === id);
        if (c) return <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />;
      }
      return <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />;
    };
    const base: Array<{ id: "all" | string; label: string; dot: React.ReactNode }> = [
      { id: "all",                   label: "Todas las categorías", dot: <span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> },
      { id: "Primordial:Bombas",     label: "Primordial · Bombas",  dot: dotFor("Primordial:Bombas") },
      { id: "Primordial:Motores",    label: "Primordial · Motores", dot: dotFor("Primordial:Motores") },
      { id: "Aceite:Cambio",         label: "Aceite · Cambio",      dot: dotFor("Aceite:Cambio") },
      { id: "Aceite:Inventario",     label: "Aceite · Inventario",  dot: dotFor("Aceite:Inventario") },
      { id: "Lavada",                label: "Lavada",                 dot: dotFor("Lavada") },
      { id: "Otro",                  label: "Otro",                  dot: dotFor("Otro") },
    ];
    for (const c of customCats) {
      const key = `custom:${c.id}`;
      base.push({ id: key, label: c.label, dot: dotFor(key) });
    }
    return base;
  }, [allCategories, customCats]);

  // Modals & drawer
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<Maintenance | null>(null);
  const [detailId, setDetailId]   = useState<string | null>(null);
  const [reprogramTarget, setReprogramTarget] = useState<Maintenance | null>(null);
  const [reprogramOpen, setReprogramOpen]     = useState(false);
  const [finalizeTarget, setFinalizeTarget]   = useState<Maintenance | null>(null);
  const [deleteTarget, setDeleteTarget]       = useState<Maintenance | null>(null);

  const [correctionTarget, setCorrectionTarget] = useState<Maintenance | null>(null);
  const [correctionOpen, setCorrectionOpen]     = useState(false);
  const correctionMut = useRequestCorrection();

  const delMut        = useDeleteMaintenance();
  const takeMut       = useTakeMaintenance();
  const startMut      = useStartMaintenance();
  const finalizeMut   = useFinalizeMaintenance();
  const rescheduleMut = useCancelRescheduleMaintenance();
  const reauthorizeMut = useReauthorizeMaintenance();

  const onDelete = (m: Maintenance) => setDeleteTarget(m);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const m = deleteTarget;
    setDeleteTarget(null);
    try { await delMut.mutateAsync(m.id); toast.success("Mantenimiento eliminado"); }
    catch (e) { toast.error((e as Error).message); }
  };

  // "Tomar": asigna el mantenimiento a quien lo toma, pero NO cambia el
  // estado (sigue Programado/Corrección hasta que se inicie).
  const onTake = async (m: Maintenance) => {
    try { await takeMut.mutateAsync(m.id); toast.success("Mantenimiento tomado", { description: "Quedó asignado a vos. Iniciálo cuando corresponda." }); }
    catch (e) { toast.error((e as Error).message); }
  };

  // "Iniciar": pasa el mantenimiento (ya asignado) a "En proceso".
  const onStart = async (m: Maintenance) => {
    try { await startMut.mutateAsync(m.id); toast.success("Mantenimiento iniciado"); }
    catch (e) { toast.error((e as Error).message); }
  };

  const onFinalize = (m: Maintenance) => setFinalizeTarget(m);

  const confirmFinalize = async () => {
    if (!finalizeTarget) return;
    const m = finalizeTarget;
    setFinalizeTarget(null);
    try { await finalizeMut.mutateAsync(m.id); toast.success("Mantenimiento completado"); }
    catch (e) { toast.error((e as Error).message); }
  };

  const onReschedule = async (newScheduledFor: string, reason: string, keepItems: boolean) => {
    if (!reprogramTarget) return;
    try {
      await rescheduleMut.mutateAsync({ id: reprogramTarget.id, newScheduledFor, reason, keepItems });
      toast.success("Mantenimiento reprogramado", { description: `Nueva fecha: ${fmtDate(newScheduledFor)}` });
      setReprogramOpen(false);
      setReprogramTarget(null);
    } catch (e) {
      const msg = (e as Error).message;
      // Mensaje claro cuando el backend rechaza mantener items (p.ej. cuando
      // el mantenimiento ya está Completado y no se pueden conservar).
      if (/\bitems?\b/i.test(msg) && /completado/i.test(msg)) {
        toast.error("No se pueden mantener los items: el mantenimiento ya está completado.");
      } else {
        toast.error(msg);
      }
    }
  };

  const onRequestCorrection = async (newScheduledFor: string | null, reason: string, keepItems: boolean) => {
    if (!correctionTarget) return;
    try {
      await correctionMut.mutateAsync({ id: correctionTarget.id, reason, newScheduledFor, keepItems });
      toast.success("Mantenimiento marcado para corrección");
      setCorrectionOpen(false);
      setCorrectionTarget(null);
    } catch (e) {
      const msg = (e as Error).message;
      if (/\bitems?\b/i.test(msg) && /completado/i.test(msg)) {
        toast.error("No se pueden mantener los items: el mantenimiento ya está completado.");
      } else {
        toast.error(msg);
      }
    }
  };

  // Handler opcional via prop (default no-op) que el parent puede pasar.
  // La implementación por defecto usa el hook interno para llamar al nuevo
  // endpoint POST /:id/reauthorize y refrescar la lista al volver.
  const localOnReauthorize = async (m: Maintenance, reason: string) => {
    try {
      await reauthorizeMut.mutateAsync({ id: m.id, reason });
      toast.success("Mantenimiento reautorizado", {
        description: "Sigue autorizado para ejecutarse aunque esté atrasado.",
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const createPrefillType: MaintenanceType | undefined =
    typeChip === "Correctivo" || typeChip === "Programado" ? typeChip : undefined;

  return (
    <motion.div
      key={title}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="flex flex-col gap-4"
    >
      {/* ── KPIs por estado (clickeables) ──────────────────────────────
          Cards estilo "CRÍTICAS / OPERATIVAS / UNIDADES" pero aplicadas
          a los estados de mantenimiento. Click → setea subTab al
          estado correspondiente (toggle off si ya estaba activo). */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatusKpiCard
          label="Programado"
          count={statusCounts.Programado}
          spark={sparkByStatus.Programado}
          color="violet"
          active={subTab === "Programado"}
          onClick={() => { setSubTab(subTab === "Programado" ? "all" : "Programado"); setPage(1); }}
        />
        <StatusKpiCard
          label="En proceso"
          count={statusCounts["En proceso"]}
          spark={sparkByStatus["En proceso"]}
          color="sky"
          active={subTab === "En proceso"}
          onClick={() => { setSubTab(subTab === "En proceso" ? "all" : "En proceso"); setPage(1); }}
        />
        <StatusKpiCard
          label="Completado"
          count={statusCounts.Completado}
          spark={sparkByStatus.Completado}
          color="emerald"
          active={subTab === "Completado"}
          onClick={() => { setSubTab(subTab === "Completado" ? "all" : "Completado"); setPage(1); }}
        />
        <StatusKpiCard
          label="Corrección"
          count={statusCounts.Correccion}
          spark={sparkByStatus.Correccion}
          color="rose"
          active={subTab === "Correccion"}
          onClick={() => { setSubTab(subTab === "Correccion" ? "all" : "Correccion"); setPage(1); }}
        />
        <StatusKpiCard
          label="Atrasados"
          count={statusCounts.Atrasado}
          spark={sparkByStatus.Atrasado}
          color="rose"
          active={subTab === "Atrasado"}
          onClick={() => { setSubTab(subTab === "Atrasado" ? "all" : "Atrasado"); setPage(1); }}
        />
      </div>

      {/* ── Filtro por vehículo activo (vino del cockpit) ── */}
      {assetIdFromUrl && (
        <div className="flex items-center gap-2 rounded-xl border border-indigo-200/60 bg-indigo-50/80 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200">
          <Truck size={13} />
          <span>
            Filtrado por vehículo <code className="rounded bg-white/40 px-1.5 py-0.5 font-mono text-[11px] dark:bg-black/20">{assetIdFromUrl}</code>
          </span>
          <button
            type="button"
            onClick={clearAssetFilter}
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold hover:bg-white/40 dark:hover:bg-black/20"
          >
            <X size={11} /> Quitar filtro
          </button>
        </div>
      )}

      {/* ── Filtros como 3 dropdowns: Estado / Categoría / Tipo ── */}
      <div className="flex flex-wrap items-end gap-2">
        {/* Estado */}
        <FilterDropdown
          label="Estado"
          value={subTab}
          onChange={(v) => { setSubTab(v as typeof subTab); setPage(1); }}
          options={[
            { id: "all",         label: "Todos",       dot: <span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> },
            { id: "Programado",  label: "Programado",  dot: <span className="h-1.5 w-1.5 rounded-full bg-violet-500 dark:bg-violet-400" /> },
            { id: "En proceso",  label: "En proceso",  dot: <span className="h-1.5 w-1.5 rounded-full bg-sky-500 dark:bg-sky-400" /> },
            { id: "Completado",  label: "Completado",  dot: <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" /> },
            { id: "Correccion",  label: "Corrección",  dot: <span className="h-1.5 w-1.5 rounded-full bg-rose-500 dark:bg-rose-400" /> },
            { id: "Atrasado",    label: "Atrasados",   dot: <span className="h-1.5 w-1.5 rounded-full bg-rose-600 dark:bg-rose-400" /> },
          ]}
        />

        {/* Categoría */}
        <FilterDropdown
          label="Categoría"
          value={catChip}
          onChange={(v) => { setCatChip(v); setPage(1); }}
          options={categoryChips.map((c) => ({ id: c.id, label: c.label, dot: c.dot }))}
        />

        {/* Tipo */}
        <FilterDropdown
          label="Tipo"
          value={typeChip}
          onChange={(v) => { setTypeChip(v as typeof typeChip); setPage(1); }}
          options={[
            { id: "all",         label: "Todos",      dot: <span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> },
            { id: "Correctivo",  label: "Correctivo", dot: <span className="h-1.5 w-1.5 rounded-full bg-orange-500 dark:bg-orange-400" /> },
            { id: "Programado",  label: "Programado", dot: <span className="h-1.5 w-1.5 rounded-full bg-violet-500 dark:bg-violet-400" /> },
          ]}
        />
      </div>

      {/* ── Toolbar: título + fechas + search + PDF + Nuevo ── */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 pt-1">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white leading-tight">
            {title}
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {rows.length} resultado{rows.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          <DatePicker label="Desde" value={from} onChange={(v) => { setFrom(v); setPage(1); }} maxDate={to || undefined} />
          <DatePicker label="Hasta" value={to}   onChange={(v) => { setTo(v); setPage(1); }}   minDate={from || undefined} />
          <div className="relative flex-1 sm:flex-none">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              placeholder="Buscar por título, placa o vehículo…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full sm:w-72 h-9 pl-7 pr-2.5 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-violet-400 dark:focus:border-violet-500/50 focus:ring-1 focus:ring-violet-400/20 dark:focus:ring-violet-500/20 transition"
            />
          </div>
          <button
            onClick={async () => {
              const { generateMaintenanceListPdf } = await import("../../../components/features/pdf/MaintenanceListPdf");
              // El módulo Mantenimientos NO incluye sección de desglose
              // de costos (eso vive solo en Reportes).
              const blob = await generateMaintenanceListPdf(
                rows,
                { from: from || new Date().toISOString().slice(0, 10), to: to || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10) },
              );
              const url = URL.createObjectURL(blob);
              window.open(url, "_blank");
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
            }}
            className="h-9 px-3 rounded-lg border border-gray-200 dark:border-white/[0.06] text-sm flex items-center gap-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] bg-white dark:bg-transparent transition"
          >
            <Download size={13} /> PDF
          </button>
          {canCreate && (
            <button
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className="h-9 px-3 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400 text-white flex items-center gap-1.5 transition"
            >
              <Plus size={13} /> Nuevo
            </button>
          )}
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#0f1320] overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">Cargando…</div>
        ) : pageRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-white/[0.06]">
              <ClipboardList size={20} />
            </div>
            <p className="mt-3 text-sm font-medium text-gray-800 dark:text-white">Sin mantenimientos en esta vista.</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Ajustá los filtros o creá un nuevo mantenimiento.</p>
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[400px]">
            <div className="overflow-x-scroll">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-gray-50 dark:bg-white/[0.02] text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Fecha</th>
                    <th className="text-left px-4 py-3 font-semibold">Vehículo</th>
                    <th className="text-left px-4 py-3 font-semibold">Título</th>
                    <th className="text-left px-4 py-3 font-semibold">Asignado</th>
                    <th className="text-left px-4 py-3 font-semibold">Tipo</th>
                    <th className="text-left px-4 py-3 font-semibold">Estado</th>
                    <th className="text-left px-4 py-3 font-semibold">Categoría</th>
                    <th className="text-right px-4 py-3 font-semibold">Costo</th>
                    <th className="">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {pageRows.map((m, i) => {
                    const st = STATUS_CFG[m.status as MaintenanceStatus] ?? STATUS_CFG.Programado;
                    const ty = TYPE_CFG[m.type] ?? TYPE_CFG.Programado;
                    const cat = allCategories[m.category] ?? { label: m.category, dot: "bg-gray-400", cls: "text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/[0.04]" };
                    const overdue = isMaintenanceOverdue(m);
                    // Atrasado siempre domina visualmente: border y fondo.
                    const rowAccent = overdue ? "border-l-rose-500 bg-rose-50/40 dark:bg-rose-500/[0.06]" : `${ty.rowAccent}`;
                    return (
                      <motion.tr
                        key={m.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18, delay: Math.min(i, 10) * 0.025, ease: "easeOut" }}
                        onClick={() => setDetailId(m.id)}
                        className={`border-t border-gray-100 dark:border-white/[0.04] border-l-4 ${overdue ? rowAccent : ty.rowAccent} cursor-pointer transition-colors ${
                          !overdue && i % 2 === 1 ? "bg-gray-50/50 dark:bg-white/[0.015]" : ""
                        } hover:bg-blue-50/40 dark:hover:bg-white/[0.04]`}
                      >
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {fmtDate(m.scheduledFor)}
                          {m.isReprogrammed && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" title={m.reprogramReason ?? ""}>
                              Reprog.
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800 dark:text-white">{m.assetPlate ?? "—"}</div>
                          <div className="text-[11px] text-gray-400 dark:text-gray-500">{m.assetName}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-200 max-w-[220px] truncate">{m.title ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-200">
                          {m.assignedUserName ? (
                            <span className="inline-flex items-center gap-1">
                              <UserIcon size={11} className="text-gray-400" />
                              {m.assignedUserName}
                            </span>
                          ) : <span className="text-gray-400 dark:text-gray-500">—</span>}
                        </td>
                        <td className={`px-4 py-3 font-medium text-xs ${ty.cls}`}>{ty.label}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${st.cls}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                            {overdue && <AlertTriangle size={11} className="shrink-0" />}
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium ${cat.cls}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${cat.dot}`} />
                            {cat.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200 font-medium">{fmtMoney(m.totalCost)}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {/* Reautorizar (solo Atrasado + Programado, si el user
                                tiene permiso de edición): confirma que el mantenimiento
                                sigue autorizado para ejecutarse aunque haya pasado la
                                fecha prevista. Para Correctivo esta acción no aplica
                                (el botón se oculta). Muestra un prompt nativo para que
                                el admin escriba el motivo antes de invocar el endpoint
                                POST /:id/reauthorize. */}
                            {canReauthorize && overdue && m.type === "Programado" && m.status !== "Completado" && (
                              <button
                                onClick={() => {
                                  // window.prompt devuelve null si el admin cancela.
                                  const raw = window.prompt("Motivo de la reautorización (opcional):", "");
                                  if (raw === null) return;
                                  const reason = raw.trim();
                                  void (onReauthorize ?? localOnReauthorize)(m, reason);
                                }}
                                disabled={reauthorizeMut.isPending}
                                className="p-1.5 rounded-md text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 disabled:opacity-50 transition"
                                title="Reautorizar mantenimiento atrasado"
                                aria-label="Reautorizar mantenimiento atrasado"
                              >
                                <CheckCircle2 size={13} />
                              </button>
                            )}
                            {/* Reagendar (solo Atrasado): dispara el ReprogramDialog
                                existente en modo reschedule. Mantenemos también
                                la opción de reagendar para los casos en que el
                                mantenimiento se mueve de fecha, no se reautoriza. */}
                            {overdue && m.status !== "Completado" && (
                              <button
                                onClick={() => { setReprogramTarget(m); setReprogramOpen(true); }}
                                className="p-1.5 rounded-md text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                                title="Reagendar mantenimiento atrasado"
                              >
                                <RefreshCw size={13} />
                              </button>
                            )}
                            {canEdit && (
                              <button
                                onClick={() => { setEditing(m); setModalOpen(true); }}
                                className="p-1.5 rounded-md text-violet-600 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition"
                                title="Editar"
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                            {(canDelete || isFullAccess) && m.status !== "Completado" && (
                              <button
                                onClick={() => onDelete(m)}
                                className="p-1.5 rounded-md text-rose-500 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                                title="Eliminar"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                            {(canDelete || isFullAccess) && m.status === "Completado" && (
                              <button
                                onClick={() => onDelete(m)}
                                className="p-1.5 rounded-md text-rose-500 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                                title="Eliminar mantenimiento completado"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Paginación */}
        {!isLoading && pageRows.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-white/[0.04] text-xs text-gray-400 dark:text-gray-500">
            <div>Mostrando {pageRows.length} de {rows.length}</div>
            <div className="flex items-center gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/[0.04] disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="px-2">Página {page} / {totalPages}</span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/[0.04] disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <MaintenanceFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        prefill={editing ? null : { type: createPrefillType }}
        maintenance={editing}
      />

      <ReprogramDialog
        open={reprogramOpen}
        target={reprogramTarget}
        saving={rescheduleMut.isPending}
        onClose={() => { setReprogramOpen(false); setReprogramTarget(null); }}
        onConfirm={onReschedule}
      />

      <ReprogramDialog
        open={correctionOpen}
        target={correctionTarget}
        saving={correctionMut.isPending}
        mode="correction"
        onClose={() => { setCorrectionOpen(false); setCorrectionTarget(null); }}
        onConfirm={onRequestCorrection}
      />

      <MaintenanceDetailDrawer
        id={detailId}
        isFullAccess={isFullAccess}
        meId={meId}
        onClose={() => setDetailId(null)}
        onEdit={(m) => { setDetailId(null); setEditing(m); setModalOpen(true); }}
        onTake={onTake}
        onStart={onStart}
        onFinalize={onFinalize}
        onReschedule={(m) => { setReprogramTarget(m); setReprogramOpen(true); }}
        onRequestCorrection={(m) => { setCorrectionTarget(m); setCorrectionOpen(true); }}
      />

      <ConfirmModal
        open={!!finalizeTarget}
        onClose={() => setFinalizeTarget(null)}
        onConfirm={confirmFinalize}
        title="Finalizar mantenimiento"
        tone="info"
        confirmLabel="Finalizar"
        description={finalizeTarget ? <>¿Marcar <strong className="text-gray-800 dark:text-white">{finalizeTarget.title}</strong> como completado?</> : null}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Eliminar mantenimiento"
        tone="danger"
        confirmLabel="Eliminar"
        description={deleteTarget ? <>¿Eliminar <strong className="text-gray-800 dark:text-white">{deleteTarget.title}</strong>? Esta acción no se puede deshacer.</> : null}
      />
    </motion.div>
  );
}

// ─── FilterDropdown ──────────────────────────────────────────────────────────

type FilterOption = { id: string; label: string; dot?: React.ReactNode };

function FilterDropdown({
  label, value, options, onChange, align = "left",
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (id: string) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.id === value) ?? options[0];
  const isAll = current?.id === "all" || value === "all";

  return (
    <div ref={ref} className="relative">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 h-9 rounded-lg border px-2.5 text-xs font-medium transition min-w-[160px] ${
          isAll
            ? "border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-400 bg-white dark:bg-white/[0.04] hover:border-gray-300 dark:hover:border-white/[0.12]"
            : "border-violet-300 dark:border-violet-500/40 text-gray-800 dark:text-white bg-violet-50/40 dark:bg-violet-500/10"
        }`}
      >
        {current?.dot}
        <span className="truncate flex-1 text-left">{current?.label ?? "—"}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className={`absolute z-30 mt-1.5 min-w-full rounded-lg border border-gray-200 bg-white shadow-lg dark:border-white/[0.08] dark:bg-[#0f1320] py-1 max-h-72 overflow-y-auto ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {options.map((opt) => {
              const selected = opt.id === value;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { onChange(opt.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs transition ${
                    selected
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"
                      : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  {opt.dot ?? <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />}
                  <span className="flex-1 text-left truncate">{opt.label}</span>
                  {selected && <Check size={11} className="shrink-0 text-blue-600 dark:text-blue-300" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── StatusKpiCard ──────────────────────────────────────────────────────────
// Card KPI clickeable con conteo por estado + sparkline mínima.
// Click → togglea el filtro de estado en la tabla.
//
// Diseño editorial: jerarquía tipográfica, mucho whitespace, una sola
// línea minimalista para la tendencia. Sin animaciones rebotonas, sin
// glow, sin dots, sin áreas rellenas. El color hace el trabajo pesado.
const KPI_COLOR = {
  violet:  { dot: "bg-violet-500",  num: "text-violet-600 dark:text-violet-300"  },
  sky:     { dot: "bg-sky-500",     num: "text-sky-600 dark:text-sky-300"        },
  emerald: { dot: "bg-emerald-500", num: "text-emerald-600 dark:text-emerald-300"},
  rose:    { dot: "bg-rose-500",    num: "text-rose-600 dark:text-rose-300"      },
} as const;

function StatusKpiCard({
  label, count, spark, color, active, onClick,
}: {
  label: string;
  count: number;
  spark: number[];
  color: keyof typeof KPI_COLOR;
  active: boolean;
  onClick: () => void;
}) {
  const palette = KPI_COLOR[color];

  // Línea minimal: solo el path, sin área ni dot.
  const linePath = useMemo(() => {
    const w = 100;
    const h = 24;
    if (spark.every((v) => v === 0)) return "";
    const max = Math.max(1, ...spark);
    const step = w / Math.max(1, spark.length - 1);
    return spark
      .map((v, i) => {
        const x = i * step;
        const y = h - (v / max) * (h - 4) - 2;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }, [spark]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group relative flex flex-col gap-2 rounded-xl border px-4 py-3.5 text-left transition-colors ${
        active
          ? "border-gray-900/15 bg-gray-50 dark:border-white/[0.14] dark:bg-white/[0.05]"
          : "border-gray-200/70 bg-white hover:bg-gray-50/60 dark:border-white/[0.06] dark:bg-white/[0.015] dark:hover:bg-white/[0.03]"
      }`}
    >
      {/* Cabecera: dot + label */}
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${palette.dot} ${active ? "" : "opacity-60 group-hover:opacity-100"} transition-opacity`} />
        <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${
          active ? "text-gray-700 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"
        }`}>
          {label}
        </span>
      </div>

      {/* Número grande */}
      <span className={`text-[28px] font-semibold leading-none tabular-nums tracking-tight ${
        active ? palette.num : "text-gray-900 dark:text-white"
      }`}>
        {count.toLocaleString("es-CO")}
      </span>

      {/* Sparkline minimal */}
      {linePath && (
        <svg
          viewBox="0 0 100 24"
          preserveAspectRatio="none"
          className="h-5 w-full"
          aria-hidden="true"
        >
          <path
            d={linePath}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={active ? palette.num : "text-gray-300 dark:text-gray-600"}
          />
        </svg>
      )}
    </button>
  );
}