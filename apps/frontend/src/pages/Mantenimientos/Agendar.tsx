import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import {
  Car, Plus, Download, Search, ChevronLeft, ChevronRight,
  PanelLeftClose, PanelLeftOpen, X, Clock, Wrench, Tag, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { useAssets } from "../../hooks/useAssets";
import { useMaintenanceAgenda } from "../../hooks/useMaintenancesV2";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { MaintenanceFormModal } from "./components/MaintenanceFormModal";
import type { Maintenance } from "../../hooks/useMaintenancesV2";
import type { EventClickArg, EventInput, DateSelectArg } from "@fullcalendar/core";

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  Programado:        "#7c3aed",
  "En curso":        "#3b82f6",
  PendienteAtencion: "#ef4444",
  Completado:        "#10b981",
  Cancelado:         "#6b7280",
};

const STATUS_LABEL: Record<string, string> = {
  Programado:        "Programado",
  "En curso":        "En curso",
  PendienteAtencion: "Pendiente atención",
  Completado:        "Completado",
  Cancelado:         "Cancelado",
};

const DAYS_ES    = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const MONTHS_ES  = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function fmtHumanDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return `${DAYS_ES[date.getDay()]} ${d} de ${MONTHS_ES[date.getMonth()]}`;
}

function fmtTime(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function toLocalIso(d: Date): string {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function toLocalDate(d: Date): string {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

function isPastDate(iso: string): boolean {
  const today = new Date(); today.setHours(0,0,0,0);
  return new Date(iso + "T00:00:00") < today;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
type AssetLite = { id: string; name: string; plate?: string | null; status?: string };

// ─── VehicleCard ─────────────────────────────────────────────────────────────
function VehicleCard({ asset, compact = false, onDragStarted }: {
  asset: AssetLite; compact?: boolean; onDragStarted?: (a: AssetLite) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData("application/motors-asset", asset.id);
        e.dataTransfer.setData("text/plain", asset.id);
        setDragging(true);
        onDragStarted?.(asset);
      }}
      onDragEnd={() => setDragging(false)}
      className={`
        group flex items-center gap-2.5 rounded-xl border cursor-grab active:cursor-grabbing
        select-none transition-all duration-150
        border-gray-200 dark:border-white/[0.06]
        bg-white dark:bg-white/[0.03]
        hover:bg-violet-50 dark:hover:bg-white/[0.07]
        hover:border-violet-300 dark:hover:border-violet-500/40
        ${dragging ? "opacity-30 scale-95" : ""}
        ${compact ? "p-2 justify-center" : "p-2.5"}
      `}
    >
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400">
        <Car size={14} />
      </div>
      {!compact && (
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-white truncate leading-tight">
            {asset.plate ?? asset.name}
          </p>
          {asset.plate && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{asset.name}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FloatingDragCard ────────────────────────────────────────────────────────
function FloatingDragCard({ asset, dateLabel, pos }: {
  asset: AssetLite | null; dateLabel: string | null; pos: { x: number; y: number };
}) {
  if (!asset) return null;
  return (
    <div
      style={{ position:"fixed", left:pos.x+16, top:pos.y-20, pointerEvents:"none", zIndex:9999 }}
      className="rounded-xl border border-violet-300 dark:border-violet-500/60 bg-white dark:bg-[#0f1320] shadow-2xl px-3 py-2.5 w-56"
    >
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400">
          <Car size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{asset.plate ?? asset.name}</p>
          {asset.plate && <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{asset.name}</p>}
        </div>
      </div>
      {dateLabel && (
        <div className="mt-2 pt-2 border-t border-violet-200 dark:border-violet-500/30 text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-violet-500 dark:text-violet-300/80">Agendar para</span>
          <div className="font-semibold text-gray-800 dark:text-white mt-0.5">{dateLabel}</div>
        </div>
      )}
    </div>
  );
}

// ─── DayListModal — lista de mantenimientos del día ──────────────────────────
function DayListModal({ date, events, onClose, onSelect }: {
  date: string;
  events: Maintenance[];
  onClose: () => void;
  onSelect: (m: Maintenance) => void;
}) {
  // Trap focus / close on overlay click
  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xs rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0f172a] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-gray-100 dark:border-white/[0.06]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              {MONTHS_ES[Number(date.split("-")[1]) - 1]} {date.split("-")[0]}
            </p>
            <p className="text-xl font-bold text-gray-900 dark:text-white capitalize leading-tight">
              {DAYS_ES[new Date(date + "T12:00").getDay()]} {Number(date.split("-")[2])}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              {events.length} mantenimiento{events.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition mt-0.5"
          >
            <X size={13} />
          </button>
        </div>

        {/* Lista */}
        <div className="px-2 py-2 max-h-64 overflow-y-auto space-y-0.5">
          {events.map((m) => {
            const color = STATUS_COLOR[m.status] ?? "#7c3aed";
            const time  = m.scheduledFor ? fmtTime(m.scheduledFor) : null;
            return (
              <button
                key={m.id}
                onClick={() => { onSelect(m); onClose(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/[0.04] transition text-left group"
              >
                {/* Barra de color */}
                <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: color }} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-800 dark:text-white truncate leading-tight">
                    {m.assetPlate ?? m.assetName ?? "Vehículo"}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                    {m.title ?? m.category}
                  </p>
                </div>

                {/* Hora + badge */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {time && (
                    <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>
                      {time}
                    </span>
                  )}
                  <span
                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                    style={{ background: `${color}20`, color }}
                  >
                    {STATUS_LABEL[m.status] ?? m.status}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── MaintenanceDetailModal — detalles del mantenimiento ─────────────────────
function MaintenanceDetailModal({ maintenance, onClose, onEdit, canEdit }: {
  maintenance: Maintenance;
  onClose: () => void;
  onEdit: () => void;
  canEdit: boolean;
}) {
  const m     = maintenance;
  const color = STATUS_COLOR[m.status] ?? "#7c3aed";
  const time  = m.scheduledFor ? fmtTime(m.scheduledFor) : null;
  const dateH = m.scheduledFor ? fmtHumanDate(m.scheduledFor.slice(0, 10)) : null;

  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0f172a] shadow-2xl overflow-hidden">

        {/* Header coloreado */}
        <div
          className="px-5 pt-5 pb-4"
          style={{ background: `linear-gradient(135deg, ${color}18 0%, ${color}08 100%)` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                style={{ background: `${color}20` }}
              >
                <Wrench size={16} style={{ color }} />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold text-gray-900 dark:text-white truncate leading-tight">
                  {m.title ?? m.category}
                </p>
                <p className="text-[12px] text-gray-500 dark:text-gray-400 truncate">
                  {m.assetPlate ?? m.assetName ?? "Vehículo"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-black/[0.06] dark:hover:bg-white/[0.06] transition mt-0.5"
            >
              <X size={13} />
            </button>
          </div>

          {/* Badge estado */}
          <div className="mt-3">
            <span
              className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
              style={{ background: `${color}25`, color }}
            >
              {STATUS_LABEL[m.status] ?? m.status}
            </span>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="px-5 py-4 space-y-3">
          {/* Fecha y hora */}
          {(dateH || time) && (
            <div className="flex items-center gap-2.5">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400">
                <Calendar size={13} />
              </div>
              <div>
                {dateH && <p className="text-[13px] font-semibold text-gray-800 dark:text-white capitalize">{dateH}</p>}
                {time  && <p className="text-[11px] text-gray-400 dark:text-gray-500">{time}</p>}
              </div>
            </div>
          )}

          {/* Tipo */}
          {m.type && (
            <div className="flex items-center gap-2.5">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400">
                <Tag size={13} />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wider font-semibold">Tipo</p>
                <p className="text-[13px] font-medium text-gray-700 dark:text-gray-200">{m.type}</p>
              </div>
            </div>
          )}

          {/* Descripción */}
          {m.description && (
            <div className="rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.04] px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Descripción</p>
              <p className="text-[12px] text-gray-600 dark:text-gray-300 leading-relaxed">{m.description}</p>
            </div>
          )}
        </div>

        {/* Footer acciones */}
        <div className="px-5 pb-5 flex items-center gap-2 pt-1 border-t border-gray-100 dark:border-white/[0.04]">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.10] transition"
          >
            Cerrar
          </button>
          {canEdit && (
            <button
              onClick={onEdit}
              className="flex-1 py-2 rounded-xl text-xs font-semibold text-white transition"
              style={{ background: color }}
            >
              Editar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function MantenimientosAgendar() {
  const { companyId } = useAuth();
  const { can } = usePermissions();
  const canCreate = can("maintenance", "execution", "crear");
  const canEdit   = can("maintenance", "execution", "editar");

  const calendarRef  = useRef<FullCalendar | null>(null);
  const calendarWrap = useRef<HTMLDivElement>(null);

  // ── Estado drag ──────────────────────────────────────────────────────────
  const dragAssetRef                     = useRef<AssetLite | null>(null);
  const [activeAsset, setActiveAsset]    = useState<AssetLite | null>(null);
  const [hoveredDate, setHoveredDate]    = useState<string | null>(null);
  const [cursorPos, setCursorPos]        = useState({ x: 0, y: 0 });

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [search, setSearch]           = useState("");
  const [fcTitle, setFcTitle]         = useState("");

  // ── Modales ──────────────────────────────────────────────────────────────
  const [dayListModal, setDayListModal]       = useState<{ date: string; events: Maintenance[] } | null>(null);
  const [detailModal, setDetailModal]         = useState<Maintenance | null>(null);
  const [formModalOpen, setFormModalOpen]     = useState(false);
  const [editing, setEditing]                 = useState<Maintenance | null>(null);
  const [prefill, setPrefill]                 = useState<{ assetId?: string; scheduledFor?: string } | null>(null);

  const [viewRange, setViewRange] = useState(() => {
    const from = new Date(); from.setHours(0,0,0,0);
    const to   = new Date(); to.setDate(to.getDate() + 30);
    return { from: toLocalDate(from), to: toLocalDate(to) };
  });

  const { assets: assetsList = [] } = useAssets();
  const { data: agenda, isLoading } = useMaintenanceAgenda(viewRange);

  // ── Lookup por fecha ──────────────────────────────────────────────────────
  const eventsByDate = useMemo(() => {
    const map: Record<string, Maintenance[]> = {};
    for (const m of agenda?.data ?? []) {
      if (!m.scheduledFor) continue;
      const d = m.scheduledFor.slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(m);
    }
    // Ordenar por hora
    for (const k in map) map[k].sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));
    return map;
  }, [agenda]);

  // ── Eventos FC ────────────────────────────────────────────────────────────
  const events: EventInput[] = useMemo(() =>
    (agenda?.data ?? []).map((m) => ({
      id:              m.id,
      title:           m.assetPlate ?? m.assetName ?? "Vehículo",
      start:           m.scheduledFor,
      backgroundColor: STATUS_COLOR[m.status] ?? "#7c3aed",
      borderColor:     "transparent",
      textColor:       "#fff",
      classNames:      ["agenda-pill"],
      extendedProps:   { maintenance: m },
    })),
  [agenda]);

  // ── Filtro vehículos ──────────────────────────────────────────────────────
  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? assetsList.filter((a) => (a.plate ?? "").toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      : assetsList;
  }, [assetsList, search]);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const handleCalDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes("application/motors-asset")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setCursorPos({ x: e.clientX, y: e.clientY });
    const cell = (document.elementFromPoint(e.clientX, e.clientY))?.closest<HTMLElement>(".fc-daygrid-day[data-date]");
    const date = cell?.dataset.date ?? null;
    setHoveredDate(date && !isPastDate(date) ? date : null);
  }, []);

  const handleCalDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!calendarWrap.current?.contains(e.relatedTarget as Node)) setHoveredDate(null);
  }, []);

  const handleCalDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const assetId = e.dataTransfer.getData("application/motors-asset");
    const cell    = (document.elementFromPoint(e.clientX, e.clientY))?.closest<HTMLElement>(".fc-daygrid-day[data-date]");
    const dateStr = cell?.dataset.date ?? null;
    setActiveAsset(null); setHoveredDate(null); dragAssetRef.current = null;
    if (!assetId) return;
    if (!canCreate) { toast.error("No tenés permiso para agendar mantenimientos"); return; }
    if (dateStr && isPastDate(dateStr)) { toast.error("No podés agendar en fechas pasadas"); return; }
    setPrefill({ assetId, scheduledFor: `${dateStr ?? toLocalDate(new Date())}T08:00` });
    setEditing(null); setFormModalOpen(true);
  }, [canCreate]);

  useEffect(() => {
    const cleanup = () => { dragAssetRef.current = null; setActiveAsset(null); setHoveredDate(null); };
    document.addEventListener("dragend", cleanup);
    return () => document.removeEventListener("dragend", cleanup);
  }, []);

  // ── Calendar event click → DayListModal ──────────────────────────────────
  const handleEventClick = useCallback((info: EventClickArg) => {
    info.jsEvent.preventDefault();
    info.jsEvent.stopPropagation();
    const m = info.event.extendedProps.maintenance as Maintenance | undefined;
    if (!m) return;
    const dateStr = m.scheduledFor?.slice(0, 10) ?? "";
    const evtsForDay = eventsByDate[dateStr] ?? [m];
    if (evtsForDay.length === 1) {
      // Un solo evento → ir directo al detalle
      setDetailModal(m);
    } else {
      setDayListModal({ date: dateStr, events: evtsForDay });
    }
  }, [eventsByDate]);

  // ── +N more click → DayListModal ─────────────────────────────────────────
  const handleMoreClick = useCallback((info: any) => {
    info.jsEvent?.preventDefault?.();
    const dateStr = toLocalDate(info.date as Date);
    setDayListModal({ date: dateStr, events: eventsByDate[dateStr] ?? [] });
    return false;
  }, [eventsByDate]);

  // ── Click número de día → DayListModal (si tiene eventos) ────────────────
  useEffect(() => {
    const wrap = calendarWrap.current;
    if (!wrap) return;
    const handler = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest<HTMLElement>(".fc-daygrid-day-number");
      if (!link) return;
      const cell = link.closest<HTMLElement>(".fc-daygrid-day[data-date]");
      if (!cell) return;
      const dateStr = cell.dataset.date;
      if (!dateStr) return;
      const evts = eventsByDate[dateStr];
      if (!evts || evts.length === 0) return;
      e.preventDefault(); e.stopPropagation();
      setDayListModal({ date: dateStr, events: evts });
    };
    wrap.addEventListener("click", handler as EventListener);
    return () => wrap.removeEventListener("click", handler as EventListener);
  }, [eventsByDate]);

  // ── Select vacío → form modal ─────────────────────────────────────────────
  const handleSelect = useCallback((info: DateSelectArg) => {
    if (!canCreate) return;
    if (isPastDate(toLocalDate(info.start))) {
      toast.error("No podés agendar en fechas pasadas");
      calendarRef.current?.getApi().unselect(); return;
    }
    setPrefill({ scheduledFor: toLocalIso(info.start) });
    setEditing(null); setFormModalOpen(true);
  }, [canCreate]);

  const toggleSidebar = () => {
    setSidebarOpen((v) => { setTimeout(() => calendarRef.current?.getApi().updateSize(), 350); return !v; });
  };

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (api) setFcTitle(api.view.title);
  }, [agenda]);

  useEffect(() => {
    const el = calendarWrap.current; if (!el) return;
    const ro = new ResizeObserver(() => requestAnimationFrame(() => calendarRef.current?.getApi().updateSize()));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Highlight drop target ────────────────────────────────────────────────
  useEffect(() => {
    document.querySelectorAll(".fc-day-drop-target").forEach((el) => el.classList.remove("fc-day-drop-target"));
    const fcRoot = document.querySelector(".fc");
    if (!activeAsset) { fcRoot?.classList.remove("fc-has-dragging"); return; }
    fcRoot?.classList.add("fc-has-dragging");
    if (!hoveredDate) return;
    document.querySelector(`.fc-daygrid-day[data-date="${hoveredDate}"]`)?.classList.add("fc-day-drop-target");
  }, [hoveredDate, activeAsset]);

  // ── Estilos globales ──────────────────────────────────────────────────────
  useEffect(() => {
    if (document.getElementById("agendar-fc-styles")) return;
    const s = document.createElement("style");
    s.id = "agendar-fc-styles";
    s.innerHTML = `
      /* ════════ BASE LIGHT ════════ */
      .fc {
        --fc-border-color: rgba(0,0,0,0.07);
        --fc-page-bg-color: transparent;
        --fc-neutral-bg-color: rgba(0,0,0,0.02);
        color: #1f2937;
        font-family: inherit;
      }
      .fc .fc-toolbar { display:none; }

      /* Header días semana */
      .fc .fc-col-header-cell-cushion {
        color:#6b7280; font-weight:600; font-size:10px;
        padding:6px 4px; text-transform:uppercase;
        letter-spacing:.05em; text-decoration:none;
      }

      /* Número de día */
      .fc .fc-daygrid-day-number {
        color:#374151; font-size:12px; font-weight:600;
        padding:4px 6px; text-decoration:none; cursor:pointer;
        display:block; line-height:1;
      }
      .fc .fc-day-today .fc-daygrid-day-number { color:#7c3aed; }
      .fc .fc-day-other .fc-daygrid-day-number { color:#9ca3af; }
      .fc .fc-day-today { background:rgba(124,58,237,0.05) !important; }

      /* ══ ALTURA NATURAL DE CELDAS — para que el contenedor scrollee ══ */
      .fc .fc-daygrid-body { width:100% !important; }
      .fc .fc-daygrid-body table { table-layout:fixed !important; width:100% !important; }
      /* Fila de la cuadrícula: altura mínima cómoda; las celdas pueden crecer si hay muchos eventos */
      .fc .fc-daygrid-body tr { height: 110px !important; }
      .fc .fc-daygrid-day-frame {
        min-height:0 !important;
        height:auto !important;
        overflow:hidden !important;
        box-sizing:border-box;
        padding:2px;
        position:relative;
      }
      .fc .fc-daygrid-day-events {
        margin-bottom:0 !important;
        overflow:hidden !important;
      }
      .fc .fc-daygrid-day-top { flex-shrink:0; }

      /* Scrollers: dejar que el contenedor padre (overflow-y-auto) haga el scroll */
      .fc .fc-scroller { overflow:visible !important; height:auto !important; }
      .fc .fc-scroller-harness, .fc .fc-scroller-harness-liquid { height:auto !important; overflow:visible !important; }
      .fc .fc-scroller-liquid-absolute { overflow:visible !important; inset:0 !important; }
      .fc .fc-view-harness { flex:0 0 auto !important; overflow:visible !important; }
      .fc .fc-daygrid-body, .fc .fc-daygrid-body table,
      .fc .fc-scrollgrid-sync-table { height:auto !important; }

      /* ════════ PILLS ════════ */
      .fc .agenda-pill {
        border-radius:5px !important;
        padding:0 !important;
        margin:1px 3px !important;
        font-size:10px !important;
        font-weight:500 !important;
        line-height:1 !important;
        height:18px !important;
        border:none !important;
        background:transparent !important;
        box-shadow:none !important;
        overflow:hidden !important;
      }
      .fc .agenda-pill .fc-event-main {
        padding:0 !important; height:100% !important;
        display:flex !important; align-items:center !important;
        overflow:hidden !important;
      }
      .fc .agenda-pill .fc-daygrid-event-dot,
      .fc .agenda-pill .fc-event-title,
      .fc .agenda-pill .fc-event-time { display:none !important; }

      .agendar-pill-inner {
        height:18px; border-radius:5px;
        display:flex; align-items:center; gap:3px;
        padding:0 5px;
        background:rgba(255,255,255,0.92);
        border:1px solid rgba(0,0,0,0.07);
        overflow:hidden; box-sizing:border-box; width:100%;
      }

      /* "+N more" link */
      .fc .fc-daygrid-more-link {
        font-size:9px !important; font-weight:700 !important;
        color:#7c3aed !important; margin:1px 3px !important;
        padding:1px 5px !important; border-radius:4px !important;
        background:rgba(124,58,237,0.10) !important;
        text-decoration:none !important; display:block !important;
        line-height:16px !important; height:16px !important;
      }
      .fc .fc-daygrid-more-link:hover { background:rgba(124,58,237,0.18) !important; }

      /* Ocultar el popover nativo de FC */
      .fc-more-popover { display:none !important; }

      /* Grilla */
      .fc .fc-scrollgrid { border:none !important; }
      .fc-theme-standard td, .fc-theme-standard th,
      .fc-theme-standard .fc-scrollgrid { border-color:rgba(0,0,0,0.06) !important; }

      /* List view */
      .fc-list { border:none !important; }
      .fc-list-day-cushion { background:rgba(0,0,0,0.03) !important; }
      .fc-list-event:hover td { background:rgba(124,58,237,0.05) !important; }
      .fc-list-event-title, .fc-list-event-time { color:#1f2937 !important; }
      .fc-highlight { background:rgba(124,58,237,0.10) !important; }

      /* Past days */
      .fc .fc-day-past { opacity:.45; }
      .fc .fc-day-past .fc-daygrid-day-number { color:#9ca3af !important; }
      .fc .fc-day-past .fc-daygrid-day-frame { cursor:not-allowed !important; }

      /* ════════ DARK ════════ */
      .dark .fc { --fc-border-color:rgba(255,255,255,0.05); color:#fff; }
      .dark .fc .fc-col-header-cell-cushion { color:#9ca3af; }
      .dark .fc .fc-daygrid-day-number { color:#d1d5db; }
      .dark .fc .fc-day-today { background:rgba(124,58,237,0.08) !important; }
      .dark .fc .fc-day-today .fc-daygrid-day-number { color:#a78bfa; }
      .dark .fc .fc-day-other .fc-daygrid-day-number { color:#4b5563; }
      .dark .fc-theme-standard td, .dark .fc-theme-standard th,
      .dark .fc-theme-standard .fc-scrollgrid { border-color:rgba(255,255,255,0.04) !important; }
      .dark .fc-list-day-cushion { background:rgba(255,255,255,0.04) !important; }
      .dark .fc-list-event:hover td { background:rgba(124,58,237,0.08) !important; }
      .dark .fc-list-event-title, .dark .fc-list-event-time { color:#fff !important; }
      .dark .fc-highlight { background:rgba(124,58,237,0.15) !important; }
      .dark .fc .fc-day-past .fc-daygrid-day-number { color:#4b5563 !important; }
      .dark .agendar-pill-inner {
        background:rgba(255,255,255,0.05) !important;
        border-color:rgba(255,255,255,0.06) !important;
      }
      .dark .fc .fc-daygrid-more-link { color:#a78bfa !important; background:rgba(124,58,237,0.18) !important; }
      .dark .fc .fc-daygrid-more-link:hover { background:rgba(124,58,237,0.28) !important; }

      /* ════════ DROP TARGET ════════ */
      .fc-daygrid-day.fc-day-drop-target {
        background:rgba(124,58,237,0.15) !important;
        box-shadow:inset 0 0 0 2px #7c3aed, 0 0 0 4px rgba(124,58,237,0.2) !important;
        border-radius:6px; position:relative; z-index:5;
      }
      .dark .fc-daygrid-day.fc-day-drop-target {
        background:rgba(124,58,237,0.28) !important;
        box-shadow:inset 0 0 0 2px #a78bfa, 0 0 0 4px rgba(124,58,237,0.35) !important;
      }
      .fc-daygrid-day.fc-day-drop-target .fc-daygrid-day-number { color:#7c3aed !important; font-weight:700; }
      .dark .fc-daygrid-day.fc-day-drop-target .fc-daygrid-day-number { color:#fff !important; }
      .fc-daygrid-day.fc-day-drop-target::after {
        content:"Soltar aquí"; position:absolute; bottom:5px; left:50%; transform:translateX(-50%);
        background:#7c3aed; color:#fff; font-size:9px; font-weight:700;
        padding:2px 9px; border-radius:999px; z-index:6; pointer-events:none;
        text-transform:uppercase; letter-spacing:.05em;
        box-shadow:0 4px 12px rgba(124,58,237,0.4); white-space:nowrap;
      }
      .fc.fc-has-dragging .fc-daygrid-day:not(.fc-day-drop-target) .fc-daygrid-day-frame {
        opacity:.45; transition:opacity 120ms ease;
      }
    `;
    document.head.appendChild(s);
  }, []);

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <>
      <FloatingDragCard asset={activeAsset} dateLabel={hoveredDate ? fmtHumanDate(hoveredDate) : null} pos={cursorPos} />

      {/* Modal lista del día */}
      {dayListModal && (
        <DayListModal
          date={dayListModal.date}
          events={dayListModal.events}
          onClose={() => setDayListModal(null)}
          onSelect={(m) => setDetailModal(m)}
        />
      )}

      {/* Modal detalle */}
      {detailModal && (
        <MaintenanceDetailModal
          maintenance={detailModal}
          onClose={() => setDetailModal(null)}
          canEdit={canEdit}
          onEdit={() => {
            setEditing(detailModal);
            setDetailModal(null);
            setFormModalOpen(true);
          }}
        />
      )}

      <div className="flex h-full gap-0 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#0b0f1a] relative">

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <div className={`flex flex-col shrink-0 min-h-0 border-r border-gray-200 dark:border-white/[0.06] transition-all duration-300 overflow-hidden bg-gray-50 dark:bg-transparent ${sidebarOpen ? "w-[260px]" : "w-[56px]"}`}>

          <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200 dark:border-white/[0.06] min-h-[52px]">
            {sidebarOpen && (
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Vehículos</span>
            )}
            <button
              onClick={toggleSidebar}
              className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/[0.06] transition"
              title={sidebarOpen ? "Colapsar" : "Expandir"}
            >
              {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            </button>
          </div>

          {sidebarOpen && (
            <div className="px-2 pt-2 pb-1">
              <div className="relative">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  placeholder="Buscar vehículo…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-6 pr-2 py-1.5 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] text-xs text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-violet-400 dark:focus:border-violet-500/50 focus:ring-1 focus:ring-violet-400/20 dark:focus:ring-violet-500/20"
                />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 space-y-1.5 min-h-0">
            {filteredAssets.length === 0
              ? sidebarOpen && <p className="text-[11px] text-gray-400 dark:text-gray-600 text-center py-4">Sin vehículos</p>
              : filteredAssets.map((a) => (
                  <VehicleCard
                    key={a.id}
                    asset={{ id: a.id, name: a.name, plate: a.plate, status: a.status }}
                    compact={!sidebarOpen}
                    onDragStarted={(asset) => { dragAssetRef.current = asset; setActiveAsset(asset); }}
                  />
                ))
            }
          </div>

          <div className="shrink-0 border-t border-gray-200 dark:border-white/[0.06] px-2 py-2 space-y-1">
            {sidebarOpen && (
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-1.5 px-1">Estados</p>
            )}
            {Object.entries(STATUS_COLOR).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 px-1">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: v }} />
                {sidebarOpen && <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{STATUS_LABEL[k] ?? k}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* ── Calendario ──────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-white/[0.06] shrink-0">
            <div className="flex items-center gap-1.5">
              <button onClick={() => calendarRef.current?.getApi().prev()} className="grid h-7 w-7 place-items-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"><ChevronLeft size={15} /></button>
              <button onClick={() => calendarRef.current?.getApi().next()} className="grid h-7 w-7 place-items-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"><ChevronRight size={15} /></button>
              <button onClick={() => calendarRef.current?.getApi().today()} className="px-2.5 py-1 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white bg-gray-100 dark:bg-white/[0.04] hover:bg-gray-200 dark:hover:bg-white/[0.08] border border-gray-200 dark:border-white/[0.06] transition">Hoy</button>
            </div>

            <h2 className="text-base font-semibold text-gray-800 dark:text-white capitalize">{fcTitle}</h2>

            <div className="flex items-center gap-1.5">
              {(["dayGridMonth","timeGridWeek","listWeek"] as const).map((v, i) => (
                <button key={v} onClick={() => calendarRef.current?.getApi().changeView(v)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white bg-gray-100 dark:bg-white/[0.04] hover:bg-gray-200 dark:hover:bg-white/[0.08] border border-gray-200 dark:border-white/[0.06] transition">
                  {["Mes","Semana","Lista"][i]}
                </button>
              ))}

              <div className="w-px h-4 bg-gray-200 dark:bg-white/[0.08] mx-1" />

              <button
                onClick={async () => {
                  const { generateMaintenanceListPdf } = await import("../../components/features/pdf/MaintenanceListPdf");
                  const blob = await generateMaintenanceListPdf(agenda?.data ?? [], viewRange);
                  const url  = URL.createObjectURL(blob);
                  window.open(url, "_blank");
                  setTimeout(() => URL.revokeObjectURL(url), 60_000);
                }}
                disabled={isLoading}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white bg-gray-100 dark:bg-white/[0.04] hover:bg-gray-200 dark:hover:bg-white/[0.08] border border-gray-200 dark:border-white/[0.06] transition disabled:opacity-50"
              >
                <Download size={12} /> PDF
              </button>

              <button
                onClick={() => { setPrefill(null); setEditing(null); setFormModalOpen(true); }}
                disabled={!canCreate}
                className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400 text-white disabled:opacity-50 transition"
              >
                <Plus size={12} /> Nuevo
              </button>
            </div>
          </div>

          {/* Calendario */}
          <div
            ref={calendarWrap}
            className="flex-1 min-h-0 overflow-y-auto"
            onDragOver={handleCalDragOver}
            onDragLeave={handleCalDragLeave}
            onDrop={handleCalDrop}
          >
            <FullCalendar
              ref={calendarRef as any}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={false}
              expandRows={false}
              height="auto"
              contentHeight="auto"
              locale="es"
              firstDay={1}
              events={events}
              eventClick={handleEventClick}
              selectable={canCreate}
              select={handleSelect}
              selectMirror
              dayMaxEvents={3}
              moreLinkClick={handleMoreClick}
              fixedWeekCount={true}
              showNonCurrentDates={true}

              eventContent={(arg) => {
                const m     = arg.event.extendedProps?.maintenance as Maintenance | undefined;
                const color = arg.event.backgroundColor ?? "#7c3aed";
                const plate = m?.assetPlate ?? m?.assetName ?? "Vehículo";
                const time  = m?.scheduledFor ? fmtTime(m.scheduledFor) : "";
                return (
                  <div className="agendar-pill-inner">
                    <span style={{ flexShrink:0, height:6, width:6, borderRadius:"50%", backgroundColor:color, display:"inline-block" }} />
                    {time && (
                      <span style={{ flexShrink:0, fontSize:10, fontWeight:600, color, fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap" }}>
                        {time}
                      </span>
                    )}
                    <span style={{ fontSize:10, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", minWidth:0 }}>
                      {plate}
                    </span>
                  </div>
                );
              }}

              datesSet={(arg) => {
                setViewRange({ from: toLocalDate(arg.start), to: toLocalDate(arg.end) });
                setTimeout(() => { const api = calendarRef.current?.getApi(); if (api) setFcTitle(api.view.title); }, 0);
              }}
              viewDidMount={() => { const api = calendarRef.current?.getApi(); if (api) setFcTitle(api.view.title); }}
              eventDidMount={(info) => {
                const m = info.event.extendedProps.maintenance as Maintenance | undefined;
                if (m) info.el.setAttribute("title", `${m.title ?? m.category} · ${m.type} · ${m.status}`);
              }}
              slotMinTime="06:00:00"
              slotMaxTime="22:00:00"
            />
          </div>

          {/* Banner drop */}
          {activeAsset && hoveredDate && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-end justify-center pb-6">
              <div className="rounded-2xl bg-violet-600/95 backdrop-blur px-6 py-4 shadow-2xl border border-violet-400/40 text-center min-w-[240px]">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-100/80">Agendar para</p>
                <p className="text-base font-bold text-white capitalize mt-1">{fmtHumanDate(hoveredDate)}</p>
                <p className="text-[11px] text-violet-100/70 mt-1">Soltá para crear el mantenimiento</p>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="absolute bottom-3 right-4 text-[11px] text-gray-400 dark:text-gray-500 animate-pulse">Cargando…</div>
          )}
        </div>
      </div>

      <MaintenanceFormModal
        open={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        prefill={prefill}
        maintenance={editing}
        hideTypeSelector={!editing}
      />
    </>
  );
}

export default MantenimientosAgendar;