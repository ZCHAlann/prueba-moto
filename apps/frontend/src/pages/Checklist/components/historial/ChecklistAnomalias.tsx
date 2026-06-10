"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Filter, AlertTriangle, ChevronRight, Loader2, X } from "lucide-react";
import { useChecklistAnomalies, type VehicleAnomaly } from "../../../../hooks/useChecklists";
import type { Checklist } from "../../../../hooks/useChecklists";
import { ChecklistDetailDrawer } from "./ChecklistDetailDrawer";
import { useAuth } from "../../../../context/AuthContext";

type Props = {
  onOpenChecklist?: (c: Checklist) => void;
  pageSize?: number;
};

type Mode = "day" | "range";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Mini-modal para elegir entre varios checklists del mismo vehículo ─────────

function SelectChecklistModal({
  anomaly,
  checklists,
  onSelect,
  onClose,
}: {
  anomaly: VehicleAnomaly;
  checklists: Checklist[];
  onSelect: (c: Checklist) => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 bg-gray-900/40 backdrop-blur-[2px] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="modal"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 shadow-2xl"
        >
          {/* header */}
          <div className="flex items-start justify-between border-b border-gray-200 dark:border-white/[0.08] px-5 py-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-rose-500">
                {anomaly.count} hallazgo{anomaly.count !== 1 ? "s" : ""}
              </p>
              <h2 className="mt-0.5 text-base font-semibold text-gray-900 dark:text-white tracking-tight">
                {anomaly.assetLabel}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Selecciona la inspección que deseas revisar
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-gray-200 transition"
            >
              <X size={16} />
            </button>
          </div>

          {/* lista */}
          <ul className="divide-y divide-gray-100 dark:divide-white/[0.04] max-h-80 overflow-y-auto">
            {checklists.map((c) => {
              const noCount = c.items.filter((i) => i.hasItem === "NO").length;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c)}
                    className="group w-full flex items-center gap-3 px-5 py-3 text-left transition hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-500/10">
                      <AlertTriangle size={14} className="text-rose-500 dark:text-rose-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
                        {c.categoryName ?? "Sin categoría"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {c.date} · {c.driverName ?? "Sin conductor"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-rose-50 dark:bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                      {noCount} novedad{noCount !== 1 ? "es" : ""}
                    </span>
                    <ChevronRight size={13} className="text-gray-300 group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-300 shrink-0 transition" />
                  </button>
                </li>
              );
            })}
          </ul>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ChecklistAnomalias({ onOpenChecklist, pageSize = 7 }: Props) {
  const { anomalies, loading: loadingAnom, fetchAnomalies } = useChecklistAnomalies();
  const { session } = useAuth();

  const [mode, setMode] = useState<Mode>("day");
  const [day, setDay] = useState<string>(todayISO());
  const [from, setFrom] = useState<string>(todayISO());
  const [to, setTo] = useState<string>(todayISO());
  const [page, setPage] = useState(1);

  // Estado del drawer
  const [drawerChecklist, setDrawerChecklist] = useState<Checklist | null>(null);

  // Estado del mini-modal de selección (cuando hay >1 checklist)
  const [selectModal, setSelectModal] = useState<{
    anomaly: VehicleAnomaly;
    checklists: Checklist[];
  } | null>(null);

  // Loading por anomalía al hacer click
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "day") void fetchAnomalies({ date: day });
    else if (from && to) void fetchAnomalies({ from, to });
  }, [mode, day, from, to, fetchAnomalies]);

  useEffect(() => { setPage(1); }, [anomalies]);

  const totalPages = Math.max(1, Math.ceil(anomalies.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const start      = (safePage - 1) * pageSize;
  const pageItems  = anomalies.slice(start, start + pageSize);
  const totalChecks = useMemo(() => anomalies.reduce((acc, a) => acc + a.count, 0), [anomalies]);

  async function handleClickAnomaly(a: VehicleAnomaly) {
    const key = a.assetId ?? a.assetLabel;
    setLoadingKey(key);
    try {
      const companyId = session?.companyId;
      if (!companyId) {
        console.warn("[Anomalias] sin companyId en session");
        return;
      }

      const qs = new URLSearchParams();
      if (mode === "day") qs.set("date", day);
      else { qs.set("from", from); qs.set("to", to); }

      const res = await fetch(`/api/company/${companyId}/checklists?${qs.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        console.error("[Anomalias] fetch falló:", res.status, res.statusText);
        throw new Error("HTTP " + res.status);
      }
      const json = await res.json();
      console.log("[Anomalias] fetch ok, total filas:", Array.isArray(json) ? json.length : (json.data?.length ?? 0));

      const all: Checklist[] = (Array.isArray(json) ? json : json.data ?? []).map(
        (raw: Record<string, unknown>) => ({
          id:           String(raw.id),
          targetKind:   (raw.targetKind  as Checklist["targetKind"]) ?? "Vehiculo",
          targetLabel:  (raw.targetLabel as string | null) ?? null,
          assetId:      raw.assetId ? String(raw.assetId) : (raw.asset_id ? `asset-${raw.asset_id}` : null),
          driverId:     raw.driverId ? String(raw.driverId) : null,
          inspectorId:  raw.inspectorId ? String(raw.inspectorId) : null,
          inspector:    String(raw.inspector ?? ""),
          categoryId:   raw.categoryId ? String(raw.categoryId) : null,
          categoryName: (raw.categoryName as string | null) ?? null,
          date:         String(raw.date ?? "").slice(0, 10),
          status:       (raw.status as Checklist["status"]) ?? "Observado",
          summary:      (raw.summary   as string | null) ?? null,
          findings:     (raw.findings  as string | null) ?? null,
          items:        Array.isArray(raw.items)     ? (raw.items     as Checklist["items"])   : [],
          photoUrls:    Array.isArray(raw.photoUrls) ? (raw.photoUrls as string[])             :
                        Array.isArray(raw.photo_urls)? (raw.photo_urls as string[])            : [],
          assetName:    (raw.assetName  as string | null) ?? null,
          driverName:   (raw.driverName as string | null) ?? null,
          createdAt:    String(raw.createdAt ?? ""),
          updatedAt:    String(raw.updatedAt ?? ""),
        })
      );

      // Filtrar: solo "Observado" + pertenecen a este vehículo
      const filtered = all.filter((c) => {
        if (c.status !== "Observado") return false;
        if (a.assetId && c.assetId) return c.assetId === a.assetId;
        const label = c.targetLabel ?? "";
        return (
          label === a.assetLabel ||
          label === a.assetName  ||
          (c.assetName ?? "") === a.assetLabel
        );
      });

      console.log("[Anomalias] filtered para asset", key, "→", filtered.length, "fila(s)");

      if (filtered.length === 0) {
        toast.info("Sin inspecciones con hallazgo en este período");
        return;
      }
      if (filtered.length === 1) {
        setDrawerChecklist(filtered[0]);
      } else {
        setSelectModal({ anomaly: a, checklists: filtered });
      }
    } catch (err) {
      console.error("[Anomalias] error:", err);
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
        {/* header */}
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Vehículos con anomalías</h2>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {anomalies.length} vehículo{anomalies.length !== 1 ? "s" : ""} · {totalChecks} hallazgo{totalChecks !== 1 ? "s" : ""} en el período
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-gray-200 dark:border-white/[0.08] p-0.5 text-xs font-semibold">
              <button type="button" onClick={() => setMode("day")}
                className={`px-3 py-1.5 rounded-lg transition ${mode === "day" ? "bg-emerald-500 text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>
                <Calendar size={11} className="inline mr-1" /> Día
              </button>
              <button type="button" onClick={() => setMode("range")}
                className={`px-3 py-1.5 rounded-lg transition ${mode === "range" ? "bg-emerald-500 text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}>
                <Filter size={11} className="inline mr-1" /> Rango
              </button>
            </div>
            {mode === "day" ? (
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
                className="h-8 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-transparent px-2.5 text-xs text-gray-700 dark:text-gray-300 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
            ) : (
              <div className="flex items-center gap-1.5">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                  className="h-8 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-transparent px-2.5 text-xs text-gray-700 dark:text-gray-300 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
                <span className="text-[10px] text-gray-400">→</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                  className="h-8 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-transparent px-2.5 text-xs text-gray-700 dark:text-gray-300 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
              </div>
            )}
          </div>
        </div>

        {/* cuerpo */}
        {loadingAnom ? (
          <div className="py-16 text-center text-sm text-gray-400 dark:text-gray-500">
            <Loader2 size={16} className="inline animate-spin mr-2" /> Buscando anomalías…
          </div>
        ) : anomalies.length === 0 ? (
          <div className="py-16 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 mb-2">
              <AlertTriangle size={18} className="text-emerald-500" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Sin anomalías en este período</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Los vehículos aparecerán aquí cuando se les registre un checklist con hallazgos.
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100 dark:divide-white/[0.04]">
              {pageItems.map((a) => {
                const key = a.assetId ?? a.assetLabel;
                const isLoading = loadingKey === key;
                return (
                  <button
                    key={a.assetLabel}
                    type="button"
                    onClick={() => handleClickAnomaly(a)}
                    disabled={isLoading}
                    className="w-full flex items-center gap-3 px-5 py-3.5 text-left transition hover:bg-gray-50/60 dark:hover:bg-white/[0.02] disabled:opacity-60"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-500/10">
                      {isLoading
                        ? <Loader2 size={15} className="animate-spin text-rose-400" />
                        : <AlertTriangle size={15} className="text-rose-600 dark:text-rose-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">{a.assetLabel}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {a.assetName ? `${a.assetName} · ` : ""}Última: {a.lastAnomalyAt?.slice(0, 10)}
                      </p>
                    </div>
                    <span className="rounded-full bg-rose-50 dark:bg-rose-500/10 px-2.5 py-0.5 text-xs font-bold text-rose-600 dark:text-rose-400 shrink-0">
                      {a.count} hallazgo{a.count !== 1 ? "s" : ""}
                    </span>
                    <ChevronRight size={14} className="text-gray-400 shrink-0" />
                  </button>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 dark:border-white/[0.06] px-5 py-3">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Mostrando {start + 1}–{Math.min(start + pageSize, anomalies.length)} de {anomalies.length}
                </p>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40">
                    <ChevronRight size={12} className="rotate-180" />
                  </button>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 tabular-nums px-2">
                    {safePage} / {totalPages}
                  </span>
                  <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40">
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Mini-modal de selección (múltiples checklists) */}
      {selectModal && (
        <SelectChecklistModal
          anomaly={selectModal.anomaly}
          checklists={selectModal.checklists}
          onSelect={(c) => {
            setSelectModal(null);
            setDrawerChecklist(c);
          }}
          onClose={() => setSelectModal(null)}
        />
      )}

      {/* Drawer de detalle — modo anomalías: solo lo que hay que corregir */}
      <ChecklistDetailDrawer
        checklist={drawerChecklist}
        onClose={() => setDrawerChecklist(null)}
        focusOnAnomalies
      />
    </>
  );
}