import { useEffect, useRef, useState } from "react";
import type { UseOilCheckReturn, OilCheckResult } from "../../../hooks/useOilCheck";

// ─── Config ───────────────────────────────────────────────────────────────────

const PAGE_SIZE = 7;

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconSearch({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconFilter({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function IconChevronDown({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconChevronLeft({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconChevronRight({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconCalendar({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconUser({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconTruck({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

function IconBrain({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  );
}

function IconCameraOff({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nivelFromString(nivel: string): "Normal" | "Bajo" | "Crítico" {
  const n = nivel?.toLowerCase();
  if (n?.includes("normal") || n?.includes("bueno") || n?.includes("ok")) return "Normal";
  if (n?.includes("bajo") || n?.includes("regular")) return "Bajo";
  return "Crítico";
}

function levelColors(nivel: string) {
  const n = nivelFromString(nivel);
  if (n === "Normal")  return { bar: "bg-emerald-400", badge: "bg-emerald-400/15 text-emerald-300 border border-emerald-400/25", text: "text-emerald-300" };
  if (n === "Bajo")    return { bar: "bg-amber-400",   badge: "bg-amber-400/15 text-amber-300 border border-amber-400/25",     text: "text-amber-300"   };
  return                      { bar: "bg-red-400",     badge: "bg-red-400/15 text-red-300 border border-red-400/25",           text: "text-red-300"     };
}

/** Parsea ISO o timestamps sin timezone — evita NaN */
function parseDate(iso: string): Date {
  if (!iso) return new Date(NaN);
  // Si no tiene indicador de zona horaria, asumir UTC agregando Z
  const s = /[Z+]/.test(iso) || iso.includes("-", 10) ? iso : iso + "Z";
  return new Date(s);
}

function timeAgo(iso: string) {
  const date = parseDate(iso);
  if (isNaN(date.getTime())) return "Fecha desconocida";
  const diff = Date.now() - date.getTime();
  const min  = Math.floor(diff / 60000);
  const hr   = Math.floor(min / 60);
  const day  = Math.floor(hr  / 24);
  if (min < 1)   return "Ahora mismo";
  if (min < 60)  return `Hace ${min} min`;
  if (hr  < 24)  return `Hace ${hr} h`;
  return `Hace ${day} día${day > 1 ? "s" : ""}`;
}

function formatFull(iso: string) {
  const date = parseDate(iso);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-EC", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, valueClass }: { label: string; value: number; valueClass: string }) {
  return (
    <div className="px-4 py-3.5 rounded-xl bg-white/4 border border-white/8">
      <p className="text-white/30 text-xs uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

// ─── Record Row ───────────────────────────────────────────────────────────────

function RecordRow({ record }: { record: OilCheckResult }) {
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef<HTMLDivElement>(null);
  const colors = levelColors(record.nivel);
  const nivel  = nivelFromString(record.nivel);

  // Label para mostrar en fila: placa si existe, sino nombre de activo, sino ID
  const assetLabel      = record.assetPlate ?? record.assetName ?? record.assetId;
  // Nombre del técnico o fallback al ID
  const technicianLabel = record.technicianName ?? record.technicianId;

  useEffect(() => {
    if (expanded && expandedRef.current) {
      setTimeout(() => {
        expandedRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);
    }
  }, [expanded]);

  return (
    <div
      className={`
        rounded-xl border transition-all duration-200
        ${expanded
          ? "border-amber-400/30 bg-amber-400/4"
          : "border-white/8 bg-white/2 hover:border-white/15 hover:bg-white/4"
        }
      `}
    >
      {/* Main row */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 text-left cursor-pointer"
        aria-expanded={expanded}
      >
        {/* Color bar */}
        <div className={`w-1 h-8 rounded-full flex-shrink-0 ${colors.bar}`} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          {/* Placa arriba */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-0.5">
            <span className="font-mono font-semibold text-amber-300 text-sm tracking-wide">
              {assetLabel}
            </span>
          </div>
          {/* Nombre del técnico + tiempo */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-white/40 text-xs truncate max-w-[180px]">{technicianLabel}</span>
            <span className="text-white/20 text-xs">·</span>
            <span className="text-white/30 text-xs">{timeAgo(record.createdAt)}</span>
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${colors.badge}`}>
            {nivel}
          </span>
          <span className={`text-xs font-medium hidden sm:inline ${colors.text}`}>
            {record.color}
          </span>
          <span className={`text-white/25 text-sm transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>
            <IconChevronDown size={14} />
          </span>
        </div>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div
          ref={expandedRef}
          className="border-t border-white/8 px-4 sm:px-5 pb-5 pt-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Photo */}
            {record.photo_url ? (
              <div className="rounded-xl overflow-hidden border border-white/10 bg-black/20 flex items-center justify-center">
                <img
                  src={record.photo_url}
                  alt={`Verificación ${assetLabel}`}
                  className="w-full max-h-64 object-contain"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-white/8 bg-white/3 h-40 sm:h-48 flex flex-col items-center justify-center gap-2 text-white/20">
                <IconCameraOff size={24} />
                <span className="text-xs">Sin foto registrada</span>
              </div>
            )}

            {/* Details */}
            <div className="flex flex-col gap-3">

              {/* Full date */}
              <div className="flex items-center gap-2 text-white/35 text-xs">
                <IconCalendar size={14} />
                {formatFull(record.createdAt)}
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-2">
                <div className="px-3 py-3 rounded-lg bg-white/4 border border-white/8">
                  <p className="text-white/30 text-xs uppercase tracking-widest mb-1">Nivel</p>
                  <p className={`text-base font-semibold ${colors.text}`}>{record.nivel}</p>
                </div>
                <div className="px-3 py-3 rounded-lg bg-white/4 border border-white/8">
                  <p className="text-white/30 text-xs uppercase tracking-widest mb-1">Color</p>
                  <p className={`text-base font-semibold ${colors.text}`}>{record.color}</p>
                </div>
              </div>

              {/* Technician */}
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/4 border border-white/8">
                <span className="text-white/30 flex-shrink-0"><IconUser size={14} /></span>
                <div className="min-w-0">
                  <p className="text-white/25 text-xs">Técnico</p>
                  <p className="text-white/65 text-xs font-medium truncate">{technicianLabel}</p>
                </div>
              </div>

              {/* Asset */}
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white/4 border border-white/8">
                <span className="text-white/30 flex-shrink-0"><IconTruck size={14} /></span>
                <div className="min-w-0">
                  <p className="text-white/25 text-xs">Activo</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-white/65 text-xs font-mono font-medium">{record.assetPlate ?? record.assetId}</p>
                    {record.assetName && (
                      <p className="text-white/35 text-xs truncate">· {record.assetName}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Confianza */}
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/4 border border-white/8">
                <span className="text-white/35 text-xs">Confianza</span>
                <span className="text-white/70 text-xs font-semibold">{record.confianza}</span>
              </div>

              {/* Observaciones */}
              {record.observaciones && (
                <div className="px-3 py-3 rounded-lg bg-white/4 border border-white/8">
                  <p className="text-white/30 text-xs font-semibold uppercase tracking-widest mb-1.5">Observaciones</p>
                  <p className="text-white/60 text-xs leading-relaxed">{record.observaciones}</p>
                </div>
              )}

              {/* IA recommendation */}
              <div className="px-3 py-3 rounded-lg bg-amber-400/6 border border-amber-400/15">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-amber-400/60"><IconBrain size={12} /></span>
                  <p className="text-amber-400/60 text-xs font-semibold uppercase tracking-widest">
                    Recomendación IA
                  </p>
                </div>
                <p className="text-white/60 text-xs leading-relaxed">{record.accion_recomendada}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Props = { oilCheck: UseOilCheckReturn };

export default function OilCheckHistory({ oilCheck }: Props) {
  const { history: records, historyLoading: loading, historyError } = oilCheck;

  const [filterAsset, setFilterAsset] = useState("");
  const [page, setPage]               = useState(1);

  // Ordenar de más reciente a más antiguo
  const sorted = [...records].sort(
    (a, b) => parseDate(b.createdAt).getTime() - parseDate(a.createdAt).getTime()
  );

  const filtered = sorted.filter((r) =>
    filterAsset ? r.assetId === filterAsset : true,
  );

  // Reset a página 1 cuando cambia el filtro
  useEffect(() => { setPage(1); }, [filterAsset]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Opciones del filtro: mostrar placa o nombre si están disponibles
  const assetOptions = [...new Map(
    records.map((r) => [r.assetId, { id: r.assetId, label: r.assetPlate ?? r.assetName ?? r.assetId }])
  ).values()];

  const total    = records.length;
  const alerts   = records.filter((r) => nivelFromString(r.nivel) !== "Normal").length;
  const critical = records.filter((r) => nivelFromString(r.nivel) === "Crítico").length;

  return (
    <div className="w-full h-full overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Historial de verificaciones</h2>
          <p className="text-white/35 text-sm mt-1">
            {total} registros · solo visible para supervisores y administradores
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <span className="text-white/30"><IconFilter size={14} /></span>
          <select
            value={filterAsset}
            onChange={(e) => setFilterAsset(e.target.value)}
            className="
              bg-white/5 border border-white/10 text-white/70 text-sm
              rounded-lg px-3 py-2 outline-none cursor-pointer
              hover:border-white/20 focus:border-amber-400/50 transition-colors
              min-w-[160px]
            "
          >
            <option value="">Todos los activos</option>
            {assetOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <KpiCard label="Total"      value={total}    valueClass="text-white"       />
        <KpiCard label="Con alerta" value={alerts}   valueClass="text-amber-300"   />
        <KpiCard label="Críticos"   value={critical} valueClass="text-red-300"     />
      </div>

      {/* Error */}
      {historyError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-400/10 border border-red-400/20 mb-4 text-red-300 text-xs">
          {historyError}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-white/25">
          <IconSearch size={32} />
          <p className="text-sm mt-3">
            {filterAsset ? "Sin registros para este activo" : "Sin registros aún"}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {paginated.map((record) => (
              <RecordRow key={record.id} record={record} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/8">
              <span className="text-white/30 text-xs">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 text-white/40 hover:border-white/20 hover:text-white/60 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                >
                  <IconChevronLeft size={14} />
                </button>

                {/* Page numbers */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) =>
                    p === "…" ? (
                      <span key={`ellipsis-${idx}`} className="w-8 text-center text-white/20 text-xs">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors
                          ${page === p
                            ? "bg-amber-400/15 border border-amber-400/30 text-amber-300"
                            : "border border-white/8 text-white/35 hover:border-white/20 hover:text-white/55"
                          }`}
                      >
                        {p}
                      </button>
                    )
                  )
                }

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 text-white/40 hover:border-white/20 hover:text-white/60 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                >
                  <IconChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}