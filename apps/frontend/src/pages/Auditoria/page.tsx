"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Download, MapPin, ShieldCheck, ShieldAlert, Activity, Users, BarChart3, Sparkles, Loader2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAuditDashboard } from "../../hooks/useAuditDashboard";
import { useGarages } from "../../hooks/useGarages";
import { AuditDrawer } from "../../components/common/AuditDrawer";
import { AuditMapPanel } from "./components/AuditMapPanel";
import { AlertCard } from "./components/AlertCard";
import { TimelineSlider } from "./components/TimelineSlider";
import { ActivityFeed } from "./components/ActivityFeed";

const fmtNumberEc = (n: number) => new Intl.NumberFormat("es-EC").format(n);

export function AuditoriaPage() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;

  const { events, stats, filters, setFilters, loadingList, loadingStats,
          selectedEventId, setSelectedEventId, hoveredEventId, setHoveredEventId } =
    useAuditDashboard(companyId);

  const { items: garages } = useGarages();
  const garagePoints = useMemo(
    () => (garages ?? [])
      .filter((g: any) => g.latitude != null && g.longitude != null)
      .map((g: any) => ({ id: g.id, name: g.name, latitude: g.latitude, longitude: g.longitude })),
    [garages],
  );

  // ── Filtro local por hora del día (timeline slider) ─────────────────
  const [hourCutoff, setHourCutoff] = useState<number | null>(null);
  const visibleEvents = useMemo(() => {
    if (hourCutoff == null) return events;
    return events.filter((e) => {
      const h = new Date(e.createdAt).getHours();
      return h <= hourCutoff;
    });
  }, [events, hourCutoff]);
  const visibleLocations = useMemo(() => {
    if (!stats?.locations) return [];
    if (hourCutoff == null) return stats.locations;
    return stats.locations.filter((e) => new Date(e.createdAt).getHours() <= hourCutoff);
  }, [stats, hourCutoff]);

  // ── Date range presets ──────────────────────────────────────────────
  const applyRange = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setFilters({ ...filters, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) });
  };

  const selectedEntry = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  return (
    <div className="flex flex-col gap-5 p-5 sm:p-6 max-w-[1600px] mx-auto">
      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            <Activity size={11} className="inline -mt-0.5 mr-1" /> Monitoreo
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">
            Auditoría
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Actividad geolocalizada de tu empresa. {totalEvents} {totalEvents === 1 ? "evento" : "eventos"} en este rango.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-0.5 text-[11px] font-semibold">
            {[
              { label: "Hoy",   days: 0 },
              { label: "7d",    days: 7 },
              { label: "30d",   days: 30 },
              { label: "Todo",  days: -1 },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => opt.days < 0
                  ? setFilters({ ...filters, from: undefined, to: undefined })
                  : applyRange(opt.days)}
                className="px-2.5 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] transition text-gray-600 dark:text-gray-300"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] px-3 py-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition">
            <Download size={12} /> Exportar
          </button>
        </div>
      </header>

      {/* ── ROW: location KPIs ──────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Eventos"          value={fmtNumberEc(stats.byLocationMatch.total)} icon={<Activity size={14} />} />
          <KpiCard label="Con GPS"          value={fmtNumberEc(stats.byLocationMatch.withGeo)} icon={<MapPin size={14} />} tone="indigo" />
          <KpiCard label="Dentro de rango"  value={fmtNumberEc(stats.byLocationMatch.withinRange)} icon={<ShieldCheck size={14} />} tone="emerald" />
          <KpiCard label="Fuera de rango"   value={fmtNumberEc(stats.byLocationMatch.outOfRange)} icon={<ShieldAlert size={14} />} tone="amber" />
        </div>
      )}

      {/* ── ROW: alertas (top anomalous actors) ─────────────────────── */}
      {stats && stats.topAnomalousActors.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <Sparkles size={13} className="text-amber-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Top anomalías (fuera de rango)
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {stats.topAnomalousActors.slice(0, 4).map((a, i) => (
              <AlertCard key={a.actorId} actor={a} index={i} onClick={() => {
                // Click no navega a nada específico hoy — el actor
                // aparece en múltiples eventos; el supervisor usa
                // la lista para profundizar. Dejamos el handler
                // listo para fase siguiente (filtrar por actor).
              }} />
            ))}
          </div>
        </section>
      )}

      {/* ── ROW: mapa + lista sincronizados ─────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <MapPin size={13} className="text-indigo-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Mapa de eventos
            </h2>
            {loadingStats && <Loader2 size={11} className="animate-spin text-gray-400" />}
          </div>
          <AuditMapPanel
            events={visibleLocations}
            garages={garagePoints}
            hoveredEventId={hoveredEventId != null ? hoveredEventId : null}
            selectedEventId={selectedEventId != null ? selectedEventId : null}
            onHoverEvent={(id) => setHoveredEventId(id != null ? String(id) : null)}
            onSelectEvent={(id) => setSelectedEventId(id != null ? String(id) : null)}
            height={460}
          />
          <div className="mt-2.5">
            <TimelineSlider value={hourCutoff ?? 23} onChange={setHourCutoff} />
            {hourCutoff != null && hourCutoff < 23 && (
              <button onClick={() => setHourCutoff(null)} className="mt-1 text-[10px] text-indigo-500 hover:underline">
                Quitar filtro de hora
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] overflow-hidden flex flex-col">
          <div className="px-3.5 py-2.5 border-b border-gray-100 dark:border-white/[0.06] flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Actividad en vivo
            </h2>
            <span className="text-[10px] font-mono text-gray-400">
              {visibleEvents.length} / {totalEvents}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto" style={{ maxHeight: 510 }}>
            {loadingList ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 size={16} className="animate-spin" />
              </div>
            ) : (
              <ActivityFeed
                events={visibleEvents}
                selectedEventId={selectedEventId}
                hoveredEventId={hoveredEventId}
                onSelect={setSelectedEventId}
                onHover={setHoveredEventId}
              />
            )}
          </div>
        </div>
      </section>

      {/* ── ROW: stats inferiores (top actions, by entity, top actors) ── */}
      {stats && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <StatCard title="Top acciones" icon={<BarChart3 size={12} />}>
            <ul className="space-y-1.5">
              {stats.topActions.slice(0, 6).map((a) => {
                const max = stats.topActions[0]?.count ?? 1;
                const pct = Math.round((a.count / max) * 100);
                return (
                  <li key={a.action} className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-600 dark:text-gray-300 w-24 shrink-0 truncate font-mono uppercase">{a.action}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
                      <div className="h-full bg-indigo-500/70 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 tabular-nums w-8 text-right">{fmtNumberEc(a.count)}</span>
                  </li>
                );
              })}
            </ul>
          </StatCard>

          <StatCard title="Por entidad" icon={<Activity size={12} />}>
            <ul className="space-y-1.5">
              {stats.byEntity.slice(0, 6).map((e) => {
                const max = stats.byEntity[0]?.count ?? 1;
                const pct = Math.round((e.count / max) * 100);
                return (
                  <li key={e.entity} className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-600 dark:text-gray-300 w-24 shrink-0 truncate">{e.entity}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
                      <div className="h-full bg-blue-500/70 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 tabular-nums w-8 text-right">{fmtNumberEc(e.count)}</span>
                  </li>
                );
              })}
            </ul>
          </StatCard>

          <StatCard title="Top actores" icon={<Users size={12} />}>
            <ul className="space-y-1.5">
              {stats.topActors.slice(0, 6).map((a) => {
                const max = stats.topActors[0]?.count ?? 1;
                const pct = Math.round((a.count / max) * 100);
                return (
                  <li key={a.actorId} className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-600 dark:text-gray-300 flex-1 min-w-0 truncate">{a.actorName}</span>
                    <div className="w-16 h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
                      <div className="h-full bg-emerald-500/70 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 tabular-nums w-8 text-right">{fmtNumberEc(a.count)}</span>
                  </li>
                );
              })}
            </ul>
          </StatCard>
        </section>
      )}

      {/* ── Drawer de detalle ────────────────────────────────────────── */}
      <AuditDrawer
        entry={selectedEntry}
        onClose={() => setSelectedEventId(null)}
      />
    </div>
  );
}

function KpiCard({ label, value, icon, tone = "gray" }: { label: string; value: string; icon: React.ReactNode; tone?: "gray"|"indigo"|"emerald"|"amber" }) {
  const tones = {
    gray:    "border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] text-gray-500",
    indigo:  "border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/40 dark:bg-indigo-500/[0.04] text-indigo-600 dark:text-indigo-400",
    emerald: "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/[0.04] text-emerald-600 dark:text-emerald-400",
    amber:   "border-amber-200 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/[0.04] text-amber-600 dark:text-amber-400",
  } as const;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
      className={`rounded-xl border ${tones[tone]} px-4 py-3`}
    >
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider opacity-80">
        <span>{label}</span>
        <span className="opacity-70">{icon}</span>
      </div>
      <p className="mt-1.5 text-2xl font-semibold text-gray-900 dark:text-white tabular-nums">{value}</p>
    </motion.div>
  );
}

function StatCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-gray-400">{icon}</span>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default AuditoriaPage;
