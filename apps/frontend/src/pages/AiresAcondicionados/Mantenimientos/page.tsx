import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAcUnits, type AcService } from "../../../hooks/useAcUnits";
import { usePermissions } from "../../../hooks/usePermissions";
import { ModulePageHeader } from "../../../components/features/modules/ModulePageHeader";
import { AcServiceModal } from "../../../components/ac/ac-service-modal";
import type { AirConditioningUnit, AcServiceKind } from "../../../types/fleet";
import {
  Search, Plus, Image as ImageIcon, Wrench, ClipboardList, X, ChevronDown,
  Calendar, User, Tag, DollarSign, FileText,
} from "lucide-react";

/* ── Helper ─────────────────────────────────────────────────────────────── */
function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-EC", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

const KIND_OPTIONS: AcServiceKind[] = [
  "Limpieza", "Recarga", "Reparacion", "Inspeccion", "Preventivo", "Correctivo",
];

/* ── Unit picker modal ─────────────────────────────────────────────────── */
function UnitPickerModal({
  units, onPick, onClose,
}: {
  units: AirConditioningUnit[];
  onPick: (u: AirConditioningUnit) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const v = q.trim().toLowerCase();
    return units.filter((u) =>
      v.length === 0 ||
      u.code.toLowerCase().includes(v) ||
      u.name.toLowerCase().includes(v) ||
      (u.brand ?? "").toLowerCase().includes(v)
    );
  }, [units, q]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0f1623]">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white">Selecciona la unidad</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por código o nombre..."
              className="h-9 w-full rounded-lg border border-gray-200 bg-transparent pl-8 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 dark:border-white/[0.08] dark:text-white"
            />
          </div>
        </div>

        <ul className="max-h-72 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-gray-400 dark:text-gray-500">
              Sin unidades disponibles
            </li>
          ) : filtered.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => onPick(u)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-gray-50 dark:hover:bg-white/[0.05]"
              >
                {u.photoUrls?.[0] ? (
                  <img src={u.photoUrls[0]} alt="" className="h-9 w-9 rounded-lg object-cover ring-1 ring-gray-200 dark:ring-white/[0.08]" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-400 dark:bg-white/[0.05]">
                    <ImageIcon size={14} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">{u.name}</p>
                  <p className="truncate text-xs text-gray-400">{u.code} · {u.brand} {u.model}</p>
                </div>
                <ChevronDown size={14} className="-rotate-90 text-gray-400" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ── Service detail modal ──────────────────────────────────────────────── */
function ServiceDetailModal({
  service, onClose,
}: {
  service: AcService & { unitCode: string; unitName: string };
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0f1623]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-6 dark:border-white/[0.06]">
          <div>
            <h3 className="text-base font-bold text-gray-800 dark:text-white">
              {service.kind ?? "Mantenimiento"}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {service.unitCode} · {service.unitName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-4 py-5 sm:px-6">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2.5 dark:bg-white/[0.03]">
              <Calendar size={14} className="text-cyan-500" />
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Fecha</p>
                <p className="font-semibold text-gray-800 dark:text-white">{fmtDate(service.date)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2.5 dark:bg-white/[0.03]">
              <User size={14} className="text-cyan-500" />
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Técnico</p>
                <p className="font-semibold text-gray-800 dark:text-white">{service.technician || "—"}</p>
              </div>
            </div>
            {service.cost != null && (
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2.5 dark:bg-white/[0.03]">
                <DollarSign size={14} className="text-cyan-500" />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Costo</p>
                  <p className="font-semibold text-gray-800 dark:text-white">
                    ${Number(service.cost).toFixed(2)}
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2.5 dark:bg-white/[0.03]">
              <Tag size={14} className="text-cyan-500" />
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Tipo</p>
                <p className="font-semibold text-gray-800 dark:text-white">{service.kind ?? "—"}</p>
              </div>
            </div>
          </div>

          {service.findings && (
            <section>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Hallazgos
              </h4>
              <p className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-200">
                {service.findings}
              </p>
            </section>
          )}

          {service.notes && (
            <section>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Notas
              </h4>
              <p className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-200">
                {service.notes}
              </p>
            </section>
          )}

          {service.photoUrls.length > 0 && (
            <section>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Evidencia fotográfica
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {service.photoUrls.map((p, i) => (
                  <a
                    key={i}
                    href={p}
                    target="_blank"
                    rel="noreferrer"
                    className="aspect-square overflow-hidden rounded-lg ring-1 ring-gray-200 transition hover:ring-cyan-400 dark:ring-white/[0.08]"
                  >
                    <img src={p} alt="" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Página de mantenimientos ──────────────────────────────────────────── */
export default function AcMaintenancesPage() {
  const { units, getUnitDetail } = useAcUnits();
  const { can } = usePermissions();

  const canCreate = can("ac", "mantenimientos_ac", "crear");

  const [services, setServices] = useState<(AcService & { unitCode: string; unitName: string; unitId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"Todos" | AcServiceKind>("Todos");
  const [unitFilter, setUnitFilter] = useState<string>("Todas");
  const [showPicker, setShowPicker] = useState(false);
  const [target, setTarget] = useState<AirConditioningUnit | null>(null);
  const [selected, setSelected] = useState<(AcService & { unitCode: string; unitName: string; unitId: string }) | null>(null);
  const reloadRef = useRef(0);

  /* Carga todos los servicios recorriendo cada unidad */
  useEffect(() => {
    if (units.length === 0) {
      setLoading(false);
      return;
    }
    let mounted = true;
    setLoading(true);
    Promise.all(
      units.map((u) => getUnitDetail(u.id))
    )
      .then((details) => {
        if (!mounted) return;
        const all: (AcService & { unitCode: string; unitName: string; unitId: string })[] = [];
        for (const d of details) {
          if (!d) continue;
          for (const s of d.services) {
            all.push({
              ...s,
              unitCode: d.code,
              unitName: d.name,
              unitId: d.id,
            });
          }
        }
        all.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setServices(all);
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [units, getUnitDetail, reloadRef.current]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter((s) => {
      const matchQuery =
        q.length === 0 ||
        s.unitCode.toLowerCase().includes(q) ||
        s.unitName.toLowerCase().includes(q) ||
        (s.technician ?? "").toLowerCase().includes(q) ||
        (s.findings ?? "").toLowerCase().includes(q) ||
        (s.notes ?? "").toLowerCase().includes(q);
      const matchKind = kindFilter === "Todos" || s.kind === kindFilter;
      const matchUnit = unitFilter === "Todas" || s.unitId === unitFilter;
      return matchQuery && matchKind && matchUnit;
    });
  }, [services, query, kindFilter, unitFilter]);

  const totalCost = useMemo(
    () => services.reduce((acc, s) => acc + (s.cost ?? 0), 0),
    [services]
  );

  const onServiceCreated = () => {
    reloadRef.current += 1;
    // Re-trigger effect: increment reloadRef forces re-run via dep
    setServices((prev) => [...prev]);
  };

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Servicio técnico"
        title="Mantenimientos de A/C"
        subtitle="Servicios y evidencias registradas por unidad."
        accent="cyan"
        action={
          canCreate ? (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-cyan-500/20 transition hover:bg-cyan-600 active:scale-95"
            >
              <Plus size={16} />
              Nuevo mantenimiento
            </button>
          ) : undefined
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:gap-5 sm:grid-cols-3 md:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Total servicios</p>
          <h4 className="mt-2 text-3xl font-bold text-gray-800 dark:text-white">{services.length}</h4>
          <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">Registrados en el sistema</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Con evidencia</p>
          <h4 className="mt-2 text-3xl font-bold text-gray-800 dark:text-white">
            {services.filter((s) => s.photoUrls.length > 0).length}
          </h4>
          <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">Tienen foto adjunta</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Costo acumulado</p>
          <h4 className="mt-2 text-3xl font-bold text-gray-800 dark:text-white">
            ${totalCost.toFixed(2)}
          </h4>
          <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">Suma de servicios</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Unidades atendidas</p>
          <h4 className="mt-2 text-3xl font-bold text-gray-800 dark:text-white">
            {new Set(services.map((s) => s.unitId)).size}
          </h4>
          <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">De {units.length} totales</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Unidad, técnico, hallazgos..."
              className="h-10 w-full rounded-xl border border-gray-200 bg-transparent pl-9 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 dark:border-white/[0.08] dark:text-white dark:placeholder:text-gray-500"
            />
          </div>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as "Todos" | AcServiceKind)}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300"
          >
            {(["Todos", ...KIND_OPTIONS] as const).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300"
          >
            <option value="Todas">Todas las unidades</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.code} · {u.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Servicios registrados</h3>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {filtered.length} {filtered.length !== 1 ? "resultados" : "resultado"}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.05]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-white/[0.05]">
              <ClipboardList size={24} className="text-gray-400 dark:text-gray-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                Sin mantenimientos registrados
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Selecciona una unidad y registra el primer servicio.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                    {["Unidad", "Fecha", "Tipo", "Técnico", "Costo", "Evidencia", ""].map((h, i) => (
                      <th key={i} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                  {filtered.map((s) => (
                    <tr
                      key={`${s.unitId}-${s.id}`}
                      onClick={() => setSelected(s)}
                      className="group cursor-pointer transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{s.unitName}</p>
                        <p className="text-xs text-gray-400">{s.unitCode}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{fmtDate(s.date)}</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">
                          <Wrench size={11} />{s.kind ?? "—"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{s.technician || "—"}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-gray-800 dark:text-white">
                        {s.cost != null ? `$${Number(s.cost).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-5 py-4">
                        {s.photoUrls.length > 0 ? (
                          <div className="flex -space-x-1.5">
                            {s.photoUrls.slice(0, 3).map((p, i) => (
                              <img
                                key={i}
                                src={p}
                                alt=""
                                className="h-7 w-7 rounded-md object-cover ring-2 ring-white dark:ring-[#0f1623]"
                              />
                            ))}
                            {s.photoUrls.length > 3 && (
                              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 text-[10px] font-semibold text-gray-500 ring-2 ring-white dark:bg-white/[0.05] dark:text-gray-300 dark:ring-[#0f1623]">
                                +{s.photoUrls.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <FileText size={14} className="text-gray-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="divide-y divide-gray-100 dark:divide-white/[0.04] md:hidden">
              {filtered.map((s) => (
                <div
                  key={`${s.unitId}-${s.id}`}
                  onClick={() => setSelected(s)}
                  className="cursor-pointer space-y-1.5 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-white">{s.unitName}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">{s.unitCode}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-lg bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">
                      <Wrench size={11} />{s.kind ?? "—"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                    <span>{fmtDate(s.date)}</span>
                    {s.technician && <span>{s.technician}</span>}
                    {s.cost != null && <span>${Number(s.cost).toFixed(2)}</span>}
                  </div>
                  {s.photoUrls.length > 0 && (
                    <div className="flex gap-1.5">
                      {s.photoUrls.slice(0, 4).map((p, i) => (
                        <img key={i} src={p} alt="" className="h-9 w-9 rounded-md object-cover ring-1 ring-gray-200 dark:ring-white/[0.08]" />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modales */}
      {showPicker && (
        <UnitPickerModal
          units={units}
          onPick={(u) => { setTarget(u); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
      {target && (
        <AcServiceModal
          unit={target}
          onClose={() => setTarget(null)}
          onCreated={() => {
            toast.success("Mantenimiento registrado");
            onServiceCreated();
            setTarget(null);
          }}
        />
      )}
      {selected && (
        <ServiceDetailModal
          service={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
