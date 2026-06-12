"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, FileText, Download, ChevronLeft, ChevronRight, Wifi, WifiOff, Loader2, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { useChecklists, type Checklist } from "../../../../hooks/useChecklists";
import { useChecklistWebSocket, type WsStatus } from "../../../../hooks/useChecklistWebSocket";
import { generateChecklistPdf } from "./ChecklistPdf";

type Props = {
  onOpenDetail: (c: Checklist) => void;
  /** Tamaño de página (7 por defecto) */
  pageSize?: number;
};

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Aprobado:   "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    Observado:  "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    Pendiente:  "bg-gray-100 text-gray-500 border-gray-200 dark:bg-white/[0.05] dark:text-gray-400 dark:border-white/[0.08]",
  };
  return (
    <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-semibold ${map[status] ?? map.Pendiente}`}>
      {status}
    </span>
  );
}

function ConnectionDot({ status }: { status: WsStatus }) {
  if (status === "open") {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"><Wifi size={11} /> En vivo</span>;
  }
  if (status === "connecting" || status === "idle") {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500"><Loader2 size={11} className="animate-spin" /> Conectando</span>;
  }
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-500"><WifiOff size={11} /> Reconectando</span>;
}

export function ChecklistHistorial({ onOpenDetail, pageSize = 7 }: Props) {
  const { checklists, loading, fetchChecklists } = useChecklists();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [exportingId, setExportingId] = useState<string | null>(null);

  useEffect(() => {
    console.log("[historial] checklists:", checklists.map(c => ({ id: c.id, status: c.status, items: c.items.length })));
  }, [checklists]);
  // Live updates via WebSocket
  const { status: wsStatus } = useChecklistWebSocket((evt) => {
    // Cuando llega cualquier evento del namespace, refetch
    void fetchChecklists();
    if (evt.type === "checklist:created") toast.success("Nuevo checklist registrado");
    if (evt.type === "checklist:deleted")  toast.info("Un checklist fue eliminado");
  });

  useEffect(() => { setPage(1); }, [search]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return [...checklists]
      .sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt))
      .filter((c) => {
        if (!q) return true;
        return (
          (c.targetLabel ?? "").toLowerCase().includes(q) ||
          (c.driverName ?? "").toLowerCase().includes(q) ||
          (c.categoryName ?? "").toLowerCase().includes(q) ||
          (c.inspector ?? "").toLowerCase().includes(q)
        );
      });
  }, [checklists, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  async function handleDownload(c: Checklist) {
    setExportingId(c.id);
    try {
      const blob = await generateChecklistPdf(c);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = (c.date ?? "").slice(0, 10);
      a.download = `checklist-${(c.targetLabel ?? "vehiculo").replace(/[^\w-]+/g, "_")}-${date}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo generar el PDF");
    } finally {
      setExportingId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Historial de inspecciones</h2>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""} · {checklists.length} totales
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionDot status={wsStatus} />
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Buscar vehículo, conductor, categoría…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-64 rounded-xl border border-gray-200 bg-transparent py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:text-gray-300 dark:placeholder:text-gray-500" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400 dark:text-gray-500">
          <Loader2 size={16} className="inline animate-spin mr-2" /> Cargando inspecciones…
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400 dark:text-gray-500">
          {search ? "Sin resultados para esa búsqueda" : "Cuando completes un checklist aparecerá aquí"}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                  {["Fecha", "Vehículo", "Conductor", "Categoría", "Estado", ""].map((h, i) => (
                    <th key={i} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                {pageItems.map((c) => {
                  const observed = c.items.some((i) => i.hasItem === "NO");
                  return (
                    <motion.tr key={c.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="group transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">{c.date}</td>
                      <td className="px-5 py-3.5 font-semibold text-gray-800 dark:text-gray-200">{c.targetLabel || "—"}</td>
                      <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">{c.driverName || "—"}</td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[200px]">{c.categoryName ?? "—"}</p>
                        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                          {observed ? (
                            <><AlertTriangle size={10} className="text-rose-500" />{c.items.filter((i) => i.hasItem === "NO").length} novedad{c.items.filter((i) => i.hasItem === "NO").length !== 1 ? "es" : ""}</>
                          ) : (
                            <><Check size={10} className="text-emerald-500" />{c.items.length} correctos</>
                          )}
                        </p>
                      </td>
                      <td className="px-5 py-3.5"><StatusPill status={c.status} /></td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" onClick={() => onOpenDetail(c)}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 transition hover:border-emerald-300 hover:text-emerald-600 dark:border-white/[0.08] dark:text-gray-400 dark:hover:border-emerald-500/30 dark:hover:text-emerald-400">
                            <FileText size={11} className="inline mr-1" /> Detalle
                          </button>
                          <button type="button" onClick={() => handleDownload(c)} disabled={exportingId === c.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition">
                            {exportingId === c.id
                              ? <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              : <Download size={11} />}
                            {exportingId === c.id ? "…" : "PDF"}
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 dark:border-white/[0.06] px-5 py-3">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Mostrando {start + 1}–{Math.min(start + pageSize, filtered.length)} de {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40">
                  <ChevronLeft size={12} />
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
  );
}
