import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, Download, ArrowUp } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { fmtDateTimeEc, fmtDateShortEc } from "@/lib/datetime";

/**
 * Jun 2026 — Reporte plano de reautorizaciones de mantenimiento.
 *
 *   - Backend: GET /api/company/:id/reports/maintenance/reauthorizations.json
 *   - Caller con permiso `mantenimiento.records.ver` (o aprobador): ve TODAS.
 *   - Si no, ve solo las propias.
 *   - Filtros: status (Todas/Pendiente/Aprobada/Rechazada), rango desde-hasta,
 *     búsqueda libre sobre nombre del solicitante, vehículo, mantenimiento.
 *   - Exportación a CSV (cliente).
 */
type Row = {
  id:                       string;
  maintenanceId:            string;
  assetName:                string | null;
  assetPlate:               string | null;
  action:                   "open" | "reschedule";
  status:                   "Pendiente" | "Aprobada" | "Rechazada";
  reason:                   string;
  requestedByUserId:        string | null;
  requestedByName:          string | null;
  requestedByRole:          string | null;
  decidedByUserId:          string | null;
  decidedByName:            string | null;
  decisionNotes:            string | null;
  decidedAt:                string | null;
  maintenanceScheduledFor:  string;
  proposedScheduledFor:     string | null;
  appliedScheduledFor:      string | null;
  createdAt:                string;
};

export default function ReauthReportPage() {
  const { companyId } = useAuth();
  const [status, setStatus] = useState<"all" | "Pendiente" | "Aprobada" | "Rechazada">("all");
  const [from, setFrom]     = useState("");
  const [to, setTo]         = useState("");
  const [search, setSearch] = useState("");

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (status !== "all") p.set("status", status);
    if (from) p.set("from", new Date(from).toISOString());
    if (to)   p.set("to",   new Date(to + "T23:59:59").toISOString());
    return p.toString();
  }, [status, from, to]);

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "maint-reauths", companyId, qs],
    enabled: !!companyId,
    queryFn: async () => {
      const res = await fetch(`/api/company/${companyId}/reports/maintenance/reauthorizations.json?${qs}`, {
        credentials: "include",
      });
      if (!res.ok) return { data: [] as Row[], total: 0 };
      const body = await res.json();
      return { data: (body.data ?? []) as Row[], total: body.total ?? 0 };
    },
  });

  const rows = useMemo(() => {
    const all = data?.data ?? [];
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter((r) =>
      (r.requestedByName ?? "").toLowerCase().includes(q) ||
      (r.assetName ?? "").toLowerCase().includes(q) ||
      (r.assetPlate ?? "").toLowerCase().includes(q) ||
      (r.maintenanceId ?? "").toLowerCase().includes(q) ||
      (r.reason ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  const counts = useMemo(() => {
    const c = { Pendiente: 0, Aprobada: 0, Rechazada: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  // Back-to-top: aparece cuando el usuario scrollea más de 400px.
  // jun 2026 — UX: el reporte es largo y los headers (filtros + cards)
  // quedaban fuera de vista al scrollear la tabla. Con sticky top-0
  // los headers siguen visibles, y el botón ↑ ayuda a volver.
  const [showBackTop, setShowBackTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowBackTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const exportCsv = () => {
    const header = [
      "ID",
      "Mantenimiento",
      "Vehiculo",
      "Placa",
      "Accion",
      "Estado",
      "Programado para",
      "Aprobado/Rechazado",
      "Aplicado",
      "Solicitado por",
      "Rol",
      "Motivo",
      "Decidido por",
      "Nota decision",
      "Fecha pedido",
    ];
    const lines = [header.join(";")];
    for (const r of rows) {
      lines.push([
        r.id,
        r.maintenanceId,
        r.assetName ?? "",
        r.assetPlate ?? "",
        r.action,
        r.status,
        fmtDateShortEc(r.maintenanceScheduledFor),
        r.decidedAt ? fmtDateTimeEc(r.decidedAt) : "",
        r.appliedScheduledFor ? fmtDateShortEc(r.appliedScheduledFor) : "",
        r.requestedByName ?? "",
        r.requestedByRole ?? "",
        (r.reason ?? "").replace(/"/g, '""'),
        r.decidedByName ?? "",
        (r.decisionNotes ?? "").replace(/"/g, '""'),
        fmtDateTimeEc(r.createdAt),
      ].map((v) => `"${String(v ?? "")}"`).join(";"));
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reautorizaciones_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Volver + título sticky — jun 2026 */}
      <div className="sticky top-0 z-10 -mx-4 mb-2 flex items-center justify-between gap-3 border-b border-gray-200 bg-white/85 px-4 py-2.5 backdrop-blur dark:border-white/[0.08] dark:bg-gray-900/85">
        <div className="flex items-center gap-2 text-xs">
          <Link
            to="/mantenimiento"
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-transparent dark:text-gray-200 dark:hover:bg-white/[0.04]"
          >
            ← Bandeja
          </Link>
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white">
            Reporte de reautorizaciones
          </h1>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Estado
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-white/[0.08] dark:bg-gray-900 dark:text-white"
          >
            <option value="all">Todas</option>
            <option value="Pendiente">Pendientes</option>
            <option value="Aprobada">Aprobadas</option>
            <option value="Rechazada">Rechazadas</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Desde
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-white/[0.08] dark:bg-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Hasta
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-white/[0.08] dark:bg-gray-900 dark:text-white"
          />
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Buscar
          </label>
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 mt-[7px] -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Solicitante, vehículo, mantenimiento, motivo..."
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-7 pr-3 text-sm dark:border-white/[0.08] dark:bg-gray-900 dark:text-white"
          />
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          <Download size={13} /> CSV
        </button>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Card label="Pendientes" value={counts.Pendiente} accent="amber" />
        <Card label="Aprobadas"  value={counts.Aprobada}  accent="emerald" />
        <Card label="Rechazadas" value={counts.Rechazada} accent="rose" />
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-white/[0.04]">
              <tr>
                <th className="px-3 py-2.5">Pedido</th>
                <th className="px-3 py-2.5">Vehículo</th>
                <th className="px-3 py-2.5">Acción</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5">Programado</th>
                <th className="px-3 py-2.5">Aplicado</th>
                <th className="px-3 py-2.5">Solicitante</th>
                <th className="px-3 py-2.5">Decisión</th>
                <th className="px-3 py-2.5">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {isLoading && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-xs text-gray-500">Cargando…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-xs text-gray-500">Sin resultados para los filtros aplicados.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
                  <td className="px-3 py-2 align-top">
                    <div className="text-xs text-gray-900 dark:text-white">
                      {fmtDateTimeEc(r.createdAt)}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-gray-400">{r.id}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="text-xs text-gray-800 dark:text-gray-200">
                      {r.assetPlate ? `${r.assetPlate}` : (r.assetName ?? "—")}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono">{r.maintenanceId}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Badge tone={r.action === "open" ? "emerald" : "violet"}>
                      {r.action === "open" ? "Abrir" : "Reprogramar"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Badge tone={
                      r.status === "Aprobada" ? "emerald"
                      : r.status === "Rechazada" ? "rose"
                      : "amber"
                    }>{r.status}</Badge>
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-gray-700 dark:text-gray-300">
                    {fmtDateShortEc(r.maintenanceScheduledFor)}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-gray-700 dark:text-gray-300">
                    {r.appliedScheduledFor ? fmtDateShortEc(r.appliedScheduledFor) : "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-gray-700 dark:text-gray-300">
                    {r.requestedByName ?? "—"}
                    {r.requestedByRole && (
                      <div className="text-[10px] text-gray-400">{r.requestedByRole}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-gray-700 dark:text-gray-300">
                    {r.decidedByName ?? "—"}
                    {r.decidedAt && (
                      <div className="text-[10px] text-gray-400">{fmtDateTimeEc(r.decidedAt)}</div>
                    )}
                    {r.decisionNotes && (
                      <div className="mt-0.5 line-clamp-2 text-[10px] italic text-gray-500">
                        &quot;{r.decisionNotes}&quot;
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-gray-700 dark:text-gray-300">
                    <div className="line-clamp-3 max-w-[260px]">&quot;{r.reason}&quot;</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Botón back-to-top — jun 2026 */}
      {showBackTop && (
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="Volver arriba"
          className="fixed bottom-6 right-6 z-20 inline-flex h-9 items-center gap-1 rounded-full bg-brand-500 px-3 text-xs font-semibold text-white shadow-lg shadow-brand-500/30 hover:bg-brand-600"
        >
          <ArrowUp size={14} /> Arriba
        </button>
      )}
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: number; accent: "emerald" | "amber" | "rose" }) {
  const cls =
    accent === "emerald"
      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
      : accent === "amber"
      ? "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
      : "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10";
  const vCls =
    accent === "emerald" ? "text-emerald-700 dark:text-emerald-300"
    : accent === "amber" ? "text-amber-700 dark:text-amber-300"
    : "text-rose-700 dark:text-rose-300";
  return (
    <div className={`rounded-xl border px-4 py-3 ${cls}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${vCls}`}>{value}</p>
    </div>
  );
}

function Badge({ tone, children }: { tone: "emerald" | "amber" | "rose" | "violet"; children: React.ReactNode }) {
  const cls =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
      : tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
      : tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
      : "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}
