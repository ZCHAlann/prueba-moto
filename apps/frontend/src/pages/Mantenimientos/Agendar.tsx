// pages/Mantenimientos/Agendar.tsx
// Drag & drop migrado a HTML5 nativo (dataTransfer) para compatibilidad
// total con FullCalendar — sin dnd-kit. El diseño visual es idéntico.
// Light/dark theme completo siguiendo el patrón de GaragesPage.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import {
  Car, Plus, Download, Search, ChevronLeft, ChevronRight,
  PanelLeftClose, PanelLeftOpen,
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

const DAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function fmtHumanDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return `${DAYS_ES[date.getDay()]} ${d} de ${MONTHS_ES[date.getMonth()]}`;
}

function toLocalIso(d: Date): string {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function toLocalDate(d: Date): string {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
type AssetLite = { id: string; name: string; plate?: string | null; status?: string };

// ─── VehicleCard (draggable — HTML5 nativo) ───────────────────────────────────

function VehicleCard({
  asset,
  compact = false,
  onDragStarted,
}: {
  asset: AssetLite;
  compact?: boolean;
  onDragStarted?: (a: AssetLite) => void;
}) {
  const [dragging, setDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("application/motors-asset", asset.id);
    e.dataTransfer.setData("text/plain", asset.id);
    setDragging(true);
    onDragStarted?.(asset);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
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

// ─── Floating drag card (sigue al cursor manualmente) ─────────────────────────

function FloatingDragCard({
  asset,
  dateLabel,
  pos,
}: {
  asset: AssetLite | null;
  dateLabel: string | null;
  pos: { x: number; y: number };
}) {
  if (!asset) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: pos.x + 16,
        top: pos.y - 20,
        pointerEvents: "none",
        zIndex: 9999,
      }}
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
        <div className="mt-2 pt-2 border-t border-violet-200 dark:border-violet-500/30 text-[11px] text-violet-700 dark:text-violet-200">
          <span className="font-semibold uppercase tracking-wider text-violet-500 dark:text-violet-300/80">Agendar para</span>
          <div className="font-semibold text-gray-800 dark:text-white mt-0.5">{dateLabel}</div>
        </div>
      )}
    </div>
  );
}

function isPastDate(iso: string): boolean {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso + "T00:00:00");
  return d < today;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function MantenimientosAgendar() {
  const { companyId } = useAuth();
  const { can } = usePermissions();
  const canCreate = can("maintenance", "execution", "crear");
  const canEdit   = can("maintenance", "execution", "editar");

  const calendarRef  = useRef<FullCalendar | null>(null);
  const calendarWrap = useRef<HTMLDivElement>(null);

  // ── Estado drag (HTML5 nativo) ───────────────────────────────────────────
  const dragAssetRef                     = useRef<AssetLite | null>(null);
  const [activeAsset, setActiveAsset]    = useState<AssetLite | null>(null);
  const [hoveredDate, setHoveredDate]    = useState<string | null>(null);
  const [cursorPos, setCursorPos]        = useState({ x: 0, y: 0 });

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [search, setSearch]           = useState("");
  const [fcTitle, setFcTitle]         = useState("");

  const [viewRange, setViewRange] = useState(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setDate(to.getDate() + 30);
    return { from: toLocalDate(from), to: toLocalDate(to) };
  });

  const { assets: assetsList = [] } = useAssets();
  const { data: agenda, isLoading }  = useMaintenanceAgenda(viewRange);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<Maintenance | null>(null);
  const [prefill, setPrefill]     = useState<{ assetId?: string; scheduledFor?: string } | null>(null);

  // ── Eventos ──────────────────────────────────────────────────────────────
  const events: EventInput[] = useMemo(() =>
    (agenda?.data ?? []).map((m) => ({
      id:              m.id,
      title:           `${m.assetPlate ?? m.assetName ?? "Vehículo"}\n${m.title ?? m.category}`,
      start:           m.scheduledFor,
      backgroundColor: STATUS_COLOR[m.status] ?? "#7c3aed",
      borderColor:     STATUS_COLOR[m.status] ?? "#7c3aed",
      textColor:       "#fff",
      classNames:      ["agenda-event"],
      extendedProps:   { maintenance: m },
    })),
  [agenda]);

  // ── Filtro de vehículos ───────────────────────────────────────────────────
  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assetsList;
    return assetsList.filter((a) =>
      (a.plate ?? "").toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
    );
  }, [assetsList, search]);

  // ── Listeners globales para drag HTML5 sobre el calendario ───────────────
  const handleCalDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes("application/motors-asset")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setCursorPos({ x: e.clientX, y: e.clientY });

    const el   = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest<HTMLElement>(".fc-daygrid-day[data-date]");
    const date = cell?.dataset.date ?? null;
    setHoveredDate(date && !isPastDate(date) ? date : null);
  }, []);

  const handleCalDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!calendarWrap.current?.contains(e.relatedTarget as Node)) {
      setHoveredDate(null);
    }
  }, []);

  const handleCalDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const assetId = e.dataTransfer.getData("application/motors-asset");
    const el      = document.elementFromPoint(e.clientX, e.clientY);
    const cell    = el?.closest<HTMLElement>(".fc-daygrid-day[data-date]");
    const dateStr = cell?.dataset.date ?? null;

    setActiveAsset(null);
    setHoveredDate(null);
    dragAssetRef.current = null;

    if (!assetId) return;

    if (!canCreate) {
      toast.error("No tenés permiso para agendar mantenimientos");
      return;
    }

    if (dateStr && isPastDate(dateStr)) {
      toast.error("No podés agendar en fechas pasadas");
      return;
    }

    if (dateStr) {
      setPrefill({ assetId, scheduledFor: `${dateStr}T08:00` });
    } else {
      const todayStr = toLocalDate(new Date());
      setPrefill({ assetId, scheduledFor: `${todayStr}T08:00` });
    }
    setEditing(null);
    setModalOpen(true);
  }, [canCreate]);

  useEffect(() => {
    const cleanup = () => {
      dragAssetRef.current = null;
      setActiveAsset(null);
      setHoveredDate(null);
    };
    document.addEventListener("dragend", cleanup);
    return () => document.removeEventListener("dragend", cleanup);
  }, []);

  // ── Calendar handlers ─────────────────────────────────────────────────────
  const handleEventClick = useCallback((info: EventClickArg) => {
    const m = info.event.extendedProps.maintenance as Maintenance | undefined;
    if (!m) return;
    if (canEdit) { setEditing(m); setModalOpen(true); }
    else toast("No tenés permiso para editar este mantenimiento");
  }, [canEdit]);

  const handleSelect = useCallback((info: DateSelectArg) => {
    if (!canCreate) return;
    if (isPastDate(toLocalDate(info.start))) {
      toast.error("No podés agendar en fechas pasadas");
      calendarRef.current?.getApi().unselect();
      return;
    }
    setPrefill({ scheduledFor: toLocalIso(info.start) });
    setEditing(null);
    setModalOpen(true);
  }, [canCreate]);

  const toggleSidebar = () => {
    setSidebarOpen((v) => {
      setTimeout(() => calendarRef.current?.getApi().updateSize(), 350);
      return !v;
    });
  };

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (api) setFcTitle(api.view.title);
  }, [agenda]);

  useEffect(() => {
    const el = calendarWrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => calendarRef.current?.getApi().updateSize());
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Estilos FullCalendar: light y dark adaptativos vía media query + clase .dark
  useEffect(() => {
    if (document.getElementById("agendar-fc-styles")) return;
    const style = document.createElement("style");
    style.id = "agendar-fc-styles";
    style.innerHTML = `
      /* ── Light base ── */
      .fc {
        --fc-border-color: rgba(0,0,0,0.08);
        --fc-page-bg-color: transparent;
        --fc-neutral-bg-color: rgba(0,0,0,0.02);
        color: #1f2937;
        font-family: inherit;
      }
      .fc .fc-toolbar { display: none; }
      .fc .fc-col-header-cell-cushion { color: #6b7280; font-weight: 600; font-size: 10px; padding: 6px 4px; text-transform: uppercase; letter-spacing: 0.05em; text-decoration: none; }
      .fc .fc-daygrid-day-number { color: #374151; font-size: 13px; font-weight: 600; padding: 4px 6px; text-decoration: none; }
      .fc .fc-day-today { background: rgba(124,58,237,0.06) !important; }
      .fc .fc-day-today .fc-daygrid-day-number { color: #7c3aed; }
      .fc .fc-day-other .fc-daygrid-day-number { color: #9ca3af; }
      .fc .fc-daygrid-day-frame { min-height: 0 !important; padding: 2px; box-sizing: border-box; }
      .fc .fc-daygrid-day-frame:hover { background: rgba(0,0,0,0.02); }
      .fc .fc-daygrid-body, .fc .fc-daygrid-body table, .fc .fc-scrollgrid-sync-table { height: 100% !important; }
      .fc .fc-scroller { overflow: hidden !important; height: 100% !important; }
      .fc .fc-scroller-harness, .fc .fc-scroller-harness-liquid { height: 100% !important; }
      .fc .fc-scroller-liquid-absolute { overflow: hidden !important; top: 0 !important; bottom: 0 !important; left: 0 !important; right: 0 !important; }
      .fc .fc-view-harness { flex: 1 1 0% !important; overflow: hidden !important; }
      .agenda-event { border-radius: 8px !important; padding: 4px 8px !important; font-size: 11px !important; font-weight: 500 !important; margin: 2px 4px !important; line-height: 1.3 !important; }
      .agenda-event .fc-event-title { white-space: pre-line !important; }
      .fc .fc-scrollgrid { border: none !important; }
      .fc-theme-standard td, .fc-theme-standard th, .fc-theme-standard .fc-scrollgrid { border-color: rgba(0,0,0,0.06) !important; }
      .fc-list { border: none !important; }
      .fc-list-day-cushion { background: rgba(0,0,0,0.03) !important; }
      .fc-list-event:hover td { background: rgba(124,58,237,0.05) !important; }
      .fc-list-event-title, .fc-list-event-time { color: #1f2937 !important; }
      .fc-highlight { background: rgba(124,58,237,0.10) !important; }
      .fc .fc-day-past { opacity: 0.45; }
      .fc .fc-day-past .fc-daygrid-day-number { color: #9ca3af !important; }
      .fc .fc-day-past .fc-daygrid-day-frame { cursor: not-allowed !important; }

      /* ── Dark overrides ── */
      .dark .fc {
        --fc-border-color: rgba(255,255,255,0.06);
        --fc-neutral-bg-color: rgba(255,255,255,0.02);
        color: #fff;
      }
      .dark .fc .fc-col-header-cell-cushion { color: #9ca3af; }
      .dark .fc .fc-daygrid-day-number { color: #d1d5db; }
      .dark .fc .fc-day-today { background: rgba(124,58,237,0.08) !important; }
      .dark .fc .fc-day-today .fc-daygrid-day-number { color: #a78bfa; }
      .dark .fc .fc-day-other .fc-daygrid-day-number { color: #4b5563; }
      .dark .fc .fc-daygrid-day-frame:hover { background: rgba(255,255,255,0.02); }
      .dark .fc-theme-standard td, .dark .fc-theme-standard th, .dark .fc-theme-standard .fc-scrollgrid { border-color: rgba(255,255,255,0.04) !important; }
      .dark .fc-list-day-cushion { background: rgba(255,255,255,0.04) !important; }
      .dark .fc-list-event:hover td { background: rgba(124,58,237,0.08) !important; }
      .dark .fc-list-event-title, .dark .fc-list-event-time { color: #fff !important; }
      .dark .fc-highlight { background: rgba(124,58,237,0.15) !important; }
      .dark .fc .fc-day-past .fc-daygrid-day-number { color: #4b5563 !important; }

      /* DROP TARGET */
      .fc-daygrid-day.fc-day-drop-target {
        background: rgba(124, 58, 237, 0.15) !important;
        box-shadow: inset 0 0 0 2px #7c3aed, 0 0 0 4px rgba(124,58,237,0.2) !important;
        transition: background 100ms ease, box-shadow 100ms ease;
        z-index: 5;
        border-radius: 6px;
        position: relative;
      }
      .dark .fc-daygrid-day.fc-day-drop-target {
        background: rgba(124, 58, 237, 0.30) !important;
        box-shadow: inset 0 0 0 2px #a78bfa, 0 0 0 4px rgba(124,58,237,0.4) !important;
      }
      .fc-daygrid-day.fc-day-drop-target .fc-daygrid-day-number { color: #7c3aed !important; font-weight: 700; }
      .dark .fc-daygrid-day.fc-day-drop-target .fc-daygrid-day-number { color: #ffffff !important; }
      .fc-daygrid-day.fc-day-drop-target::after {
        content: "Soltar aquí";
        position: absolute; bottom: 6px; left: 50%; transform: translateX(-50%);
        background: #7c3aed; color: #fff; font-size: 10px; font-weight: 700;
        padding: 3px 10px; border-radius: 999px; z-index: 6; pointer-events: none;
        text-transform: uppercase; letter-spacing: 0.05em;
        box-shadow: 0 4px 12px rgba(124,58,237,0.4); white-space: nowrap;
      }

      /* Atenúa los demás días durante el drag */
      .fc.fc-has-dragging .fc-daygrid-day:not(.fc-day-drop-target) .fc-daygrid-day-frame {
        opacity: 0.5; transition: opacity 120ms ease;
      }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    document.querySelectorAll(".fc-day-drop-target")
      .forEach((el) => el.classList.remove("fc-day-drop-target"));

    const fcRoot = document.querySelector(".fc");

    if (!activeAsset) {
      fcRoot?.classList.remove("fc-has-dragging");
      return;
    }

    fcRoot?.classList.add("fc-has-dragging");

    if (!hoveredDate) return;
    document.querySelector(`.fc-daygrid-day[data-date="${hoveredDate}"]`)
      ?.classList.add("fc-day-drop-target");
  }, [hoveredDate, activeAsset]);

  return (
    <>
      <FloatingDragCard
        asset={activeAsset}
        dateLabel={hoveredDate ? fmtHumanDate(hoveredDate) : null}
        pos={cursorPos}
      />

      <div className="flex h-full gap-0 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#0b0f1a] relative">

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <div
          className={`
            flex flex-col shrink-0 border-r border-gray-200 dark:border-white/[0.06]
            transition-all duration-300 overflow-hidden
            bg-gray-50 dark:bg-transparent
            ${sidebarOpen ? "w-[260px]" : "w-[56px]"}
          `}
        >
          <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200 dark:border-white/[0.06] min-h-[52px]">
            {sidebarOpen && (
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                Vehículos
              </span>
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
            {filteredAssets.length === 0 ? (
              sidebarOpen && (
                <p className="text-[11px] text-gray-400 dark:text-gray-600 text-center py-4">Sin vehículos</p>
              )
            ) : (
              filteredAssets.map((a) => (
                <VehicleCard
                  key={a.id}
                  asset={{ id: a.id, name: a.name, plate: a.plate, status: a.status }}
                  compact={!sidebarOpen}
                  onDragStarted={(asset) => {
                    dragAssetRef.current = asset;
                    setActiveAsset(asset);
                  }}
                />
              ))
            )}
          </div>

          <div className="shrink-0 border-t border-gray-200 dark:border-white/[0.06] px-2 py-2 space-y-1">
            {sidebarOpen && (
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-1.5 px-1">
                Estados
              </p>
            )}
            {Object.entries(STATUS_COLOR).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 px-1">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: v }} />
                {sidebarOpen && (
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{STATUS_LABEL[k] ?? k}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Calendario ────────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-white/[0.06] shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => calendarRef.current?.getApi().prev()}
                className="grid h-7 w-7 place-items-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                title="Anterior"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => calendarRef.current?.getApi().next()}
                className="grid h-7 w-7 place-items-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                title="Siguiente"
              >
                <ChevronRight size={15} />
              </button>
              <button
                onClick={() => calendarRef.current?.getApi().today()}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white bg-gray-100 dark:bg-white/[0.04] hover:bg-gray-200 dark:hover:bg-white/[0.08] border border-gray-200 dark:border-white/[0.06] transition"
              >
                Hoy
              </button>
            </div>

            <h2 className="text-base font-semibold text-gray-800 dark:text-white capitalize">{fcTitle}</h2>

            <div className="flex items-center gap-1.5">
              {(["dayGridMonth", "timeGridWeek", "listWeek"] as const).map((v, i) => {
                const labels = ["Mes", "Semana", "Lista"];
                return (
                  <button
                    key={v}
                    onClick={() => calendarRef.current?.getApi().changeView(v)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white bg-gray-100 dark:bg-white/[0.04] hover:bg-gray-200 dark:hover:bg-white/[0.08] border border-gray-200 dark:border-white/[0.06] transition"
                  >
                    {labels[i]}
                  </button>
                );
              })}

              <div className="w-px h-4 bg-gray-200 dark:bg-white/[0.08] mx-1" />

              <button
                onClick={async () => {
                  const { generateMaintenanceListPdf } = await import("../../components/features/pdf/MaintenanceListPdf");
                  const blob = await generateMaintenanceListPdf(agenda?.data ?? [], viewRange);
                  const url = URL.createObjectURL(blob);
                  window.open(url, "_blank");
                  setTimeout(() => URL.revokeObjectURL(url), 60_000);
                }}
                disabled={isLoading}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white bg-gray-100 dark:bg-white/[0.04] hover:bg-gray-200 dark:hover:bg-white/[0.08] border border-gray-200 dark:border-white/[0.06] transition disabled:opacity-50"
              >
                <Download size={12} /> PDF
              </button>

              <button
                onClick={() => { setPrefill(null); setEditing(null); setModalOpen(true); }}
                disabled={!canCreate}
                className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400 text-white disabled:opacity-50 transition"
              >
                <Plus size={12} /> Nuevo
              </button>
            </div>
          </div>

          {/* Contenedor del calendario */}
          <div
            ref={calendarWrap}
            className="flex-1 min-h-0 overflow-hidden"
            onDragOver={handleCalDragOver}
            onDragLeave={handleCalDragLeave}
            onDrop={handleCalDrop}
          >
            <FullCalendar
              ref={calendarRef as any}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={false}
              expandRows={true}
              height="100%"
              locale="es"
              firstDay={1}
              events={events}
              eventClick={handleEventClick}
              selectable={canCreate}
              select={handleSelect}
              selectMirror
              dayMaxEvents={2}
              fixedWeekCount={true}
              showNonCurrentDates={true}
              datesSet={(arg) => {
                setViewRange({ from: toLocalDate(arg.start), to: toLocalDate(arg.end) });
                setTimeout(() => {
                  const api = calendarRef.current?.getApi();
                  if (api) setFcTitle(api.view.title);
                }, 0);
              }}
              viewDidMount={() => {
                const api = calendarRef.current?.getApi();
                if (api) setFcTitle(api.view.title);
              }}
              eventDidMount={(info) => {
                const m = info.event.extendedProps.maintenance as Maintenance | undefined;
                if (!m) return;
                info.el.setAttribute("title", `${m.title ?? m.category} · ${m.type} · ${m.status}`);
              }}
              slotMinTime="06:00:00"
              slotMaxTime="22:00:00"
            />
          </div>

          {/* Banner flotante durante drag */}
          {activeAsset && hoveredDate && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-end justify-center pb-6">
              <div className="rounded-2xl bg-violet-600/95 backdrop-blur px-6 py-4 shadow-2xl border border-violet-400/40 text-center min-w-[240px]">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-100/80">
                  Agendar para
                </p>
                <p className="text-base font-bold text-white capitalize mt-1">
                  {fmtHumanDate(hoveredDate)}
                </p>
                <p className="text-[11px] text-violet-100/70 mt-1">
                  Soltá para crear el mantenimiento
                </p>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="absolute bottom-3 right-4 text-[11px] text-gray-400 dark:text-gray-500 animate-pulse">
              Cargando…
            </div>
          )}
        </div>
      </div>

      <MaintenanceFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        prefill={prefill}
        maintenance={editing}
      />
    </>
  );
}

export default MantenimientosAgendar;