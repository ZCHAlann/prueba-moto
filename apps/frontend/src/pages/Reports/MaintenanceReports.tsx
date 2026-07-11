import { useEffect, useState } from "react";
import { Wrench, Store, Droplet, DollarSign, Calendar, TrendingUp } from "lucide-react";
import { DatePicker } from "../../components/ui/date-picker/DatePicker";
import { useAuth } from "../../context/AuthContext";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Tipos ────────────────────────────────────────────────────────────────

type WorkshopCost = {
  workshopId: number | null;
  name: string;
  laborCost: number;
  partsCost: number;
  totalCost: number;
  count: number;
};

type WorkshopReport = {
  grandTotal: number;
  grandLabor: number;
  grandParts: number;
  workshops: WorkshopCost[];
};

type TypeCost = {
  type: string;
  total: number;
  count: number;
};

type TypeReport = {
  byType: TypeCost[];
  byMonth: Array<{ month: string; byType: Record<string, number> }>;
};

type CarwashVehicle = {
  assetId: number | null;
  name: string;
  plate: string | null;
  total: number;
  count: number;
};

type CarwashReport = {
  grandTotal: number;
  byVehicle: CarwashVehicle[];
  byMonth: Array<{ month: string; total: number }>;
};

// ─── Componente ───────────────────────────────────────────────────────────

export function MaintenanceReports() {
  const { companyId } = useAuth();
  const [from, setFrom] = useState<string>("");
  const [to,   setTo]   = useState<string>("");
  const [workshopId, setWorkshopId] = useState<string>("");

  const qs = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to)   p.set("to",   to);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  // ─── Queries ────────────────────────────────────────────────────────────
  const [workshop, setWorkshop] = useState<WorkshopReport | null>(null);
  const [byType,   setByType]   = useState<TypeReport | null>(null);
  const [carwash,  setCarwash]  = useState<CarwashReport | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState<string | null>(null);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setErr(null);
    try {
      const [w, t, c] = await Promise.all([
        fetchJson<WorkshopReport>(`/api/company/${companyId}/analytics/maintenance-costs-by-workshop${qs(workshopId ? { workshopId } : {})}`),
        fetchJson<TypeReport>   (`/api/company/${companyId}/analytics/maintenance-costs-by-type${qs()}`),
        fetchJson<CarwashReport>(`/api/company/${companyId}/analytics/carwash-costs${qs()}`),
      ]);
      setWorkshop(w);
      setByType(t);
      setCarwash(c);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [companyId]);

  return (
    <div className="space-y-4">
      {/* ── Filtros ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:flex-wrap">
          <DatePicker compact label="Desde" value={from} onChange={setFrom} maxDate={to || undefined} />
          <DatePicker compact label="Hasta" value={to}   onChange={setTo}   minDate={from || undefined} />
          <div className="flex-1" />
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition"
          >
            <Calendar size={13} /> {loading ? "Cargando…" : "Aplicar filtros"}
          </button>
        </div>
        {err && (
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">Error: {err}</p>
        )}
      </div>

      {/* ── 1. Mano de obra por taller ── */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
        <header className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store size={16} className="text-violet-500" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Mano de obra por taller</h2>
          </div>
          {workshop && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Total: <span className="font-semibold text-violet-700 dark:text-violet-300">{fmtMoney(workshop.grandLabor)}</span>
            </p>
          )}
        </header>
        {!workshop || workshop.workshops.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400 dark:text-gray-500">Sin datos para el rango seleccionado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  <th className="px-3 py-2 text-left font-semibold">Taller</th>
                  <th className="px-3 py-2 text-right font-semibold">Mantenimientos</th>
                  <th className="px-3 py-2 text-right font-semibold">Mano de obra</th>
                  <th className="px-3 py-2 text-right font-semibold">Repuestos</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                {workshop.workshops.map((w, i) => (
                  <tr key={i} className="hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-white">{w.name}</td>
                    <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">{w.count}</td>
                    <td className="px-3 py-2 text-right text-violet-700 dark:text-violet-300 font-medium">{fmtMoney(w.laborCost)}</td>
                    <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">{fmtMoney(w.partsCost)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-white">{fmtMoney(w.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── 2. Costos por tipo (Programado / Correctivo / Lavada) ── */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
        <header className="mb-3 flex items-center gap-2">
          <Wrench size={16} className="text-orange-500" />
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Costos por tipo de mantenimiento</h2>
        </header>
        {!byType || byType.byType.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400 dark:text-gray-500">Sin datos para el rango seleccionado.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {byType.byType.map((t) => {
              const colors: Record<string, string> = {
                Programado: "border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-200",
                Correctivo: "border-orange-200 dark:border-orange-500/20 bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-200",
                Lavada:     "border-sky-200 dark:border-sky-500/20 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-200",
              };
              return (
                <div key={t.type} className={`rounded-lg border px-4 py-3 ${colors[t.type] ?? "border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02]"}`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">{t.type}</p>
                  <p className="mt-0.5 text-2xl font-bold">{fmtMoney(t.total)}</p>
                  <p className="text-[11px] opacity-70">{t.count} mantenimiento{t.count === 1 ? "" : "s"}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Serie mensual */}
        {byType && byType.byMonth.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
              <TrendingUp size={11} /> Serie mensual
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500">
                    <th className="px-3 py-2 text-left font-semibold">Mes</th>
                    {byType.byType.map((t) => (
                      <th key={t.type} className="px-3 py-2 text-right font-semibold">{t.type}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                  {byType.byMonth.map((row) => {
                    const monthTotal = Object.values(row.byType).reduce((acc, v) => acc + v, 0);
                    return (
                      <tr key={row.month}>
                        <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-200">{row.month}</td>
                        {byType.byType.map((t) => (
                          <td key={t.type} className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">
                            {row.byType[t.type] ? fmtMoney(row.byType[t.type]!) : "—"}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-white">{fmtMoney(monthTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── 3. Lavadas ── */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
        <header className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Droplet size={16} className="text-sky-500" />
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Lavadas</h2>
          </div>
          {carwash && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Total: <span className="font-semibold text-sky-700 dark:text-sky-300">{fmtMoney(carwash.grandTotal)}</span>
            </p>
          )}
        </header>
        {!carwash || (carwash.byVehicle.length === 0 && carwash.byMonth.length === 0) ? (
          <p className="py-6 text-center text-xs text-gray-400 dark:text-gray-500">Sin lavadas para el rango seleccionado.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Por vehículo */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Por vehículo</p>
              {carwash.byVehicle.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">Sin datos.</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-white/[0.04] rounded-lg border border-gray-200 dark:border-white/[0.06] overflow-hidden">
                  {carwash.byVehicle.map((v, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                      <div>
                        <p className="font-medium text-gray-800 dark:text-white">{v.name}</p>
                        {v.plate && <p className="text-[11px] text-gray-400 dark:text-gray-500">{v.plate}</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sky-700 dark:text-sky-300">{fmtMoney(v.total)}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">{v.count} lavada{v.count === 1 ? "" : "s"}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Por mes */}
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Por mes</p>
              {carwash.byMonth.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">Sin datos.</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-white/[0.04] rounded-lg border border-gray-200 dark:border-white/[0.06] overflow-hidden">
                  {carwash.byMonth.map((m, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                      <span className="font-medium text-gray-700 dark:text-gray-200">{m.month}</span>
                      <span className="font-semibold text-sky-700 dark:text-sky-300">{fmtMoney(m.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
