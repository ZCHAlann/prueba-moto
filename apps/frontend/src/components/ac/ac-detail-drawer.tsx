import { useEffect, useState } from "react";
import {
  X, Wrench, Calendar, User, MapPin, Hash, FileText,
  Wind, ImageIcon, ClipboardList, Plus, Tag, Snowflake,
} from "lucide-react";
import type {
  AirConditioningUnit,
} from "../../types/fleet";
import type { AcService, AcRefrigerantLog, AcUnitDetail } from "../../hooks/useAcUnits";

type Props = {
  unit: AirConditioningUnit;
  onClose: () => void;
  onEdit: (u: AirConditioningUnit) => void;
  onAddService: (u: AirConditioningUnit) => void;
  onDelete: (u: AirConditioningUnit) => void;
  loadDetail: (id: string) => Promise<AcUnitDetail | null>;
};

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  Operativo: "success",
  "En revision": "warning",
  "Fuera de servicio": "danger",
  "Pendiente revision": "neutral",
};

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-EC", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function statusTone(s: string) {
  return STATUS_TONE[s] ?? "neutral";
}

function Field({
  icon, label, value,
}: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-white/[0.05] dark:text-gray-400">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</p>
        <p className="mt-0.5 break-words text-sm text-gray-800 dark:text-white">{value || "—"}</p>
      </div>
    </div>
  );
}

export function AcDetailDrawer({
  unit, onClose, onEdit, onAddService, onDelete, loadDetail,
}: Props) {
  const [detail, setDetail] = useState<AcUnitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loadDetail(unit.id).then((d) => {
      if (!mounted) return;
      setDetail(d);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [unit.id, loadDetail]);

  const services: AcService[] = detail?.services ?? [];
  const refrigerantLogs: AcRefrigerantLog[] = detail?.refrigerantLogs ?? [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl dark:bg-[#0f1623]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-100 bg-white/95 px-6 py-4 backdrop-blur dark:border-white/[0.06] dark:bg-[#0f1623]/95">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300">
                <Wind size={16} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-gray-800 dark:text-white">{unit.name}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {unit.code} · {unit.brand} {unit.model}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${
                statusTone(unit.status) === "success" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20" :
                statusTone(unit.status) === "warning" ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20" :
                statusTone(unit.status) === "danger"  ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20" :
                "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200 dark:bg-white/[0.05] dark:text-gray-400 dark:ring-white/10"
              }`}>{unit.status}</span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:bg-white/[0.05] dark:text-gray-300">
                <Tag size={11} />{unit.type}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.05]" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Fotos */}
              <section>
                <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Fotografías
                </h4>
                {(detail?.photoUrls?.length ?? 0) === 0 ? (
                  <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400 dark:border-white/[0.08] dark:bg-white/[0.03]">
                    <ImageIcon size={18} className="text-gray-300 dark:text-gray-600" />
                    Sin fotos registradas
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {detail!.photoUrls.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActivePhoto(url)}
                        className="group relative aspect-square overflow-hidden rounded-xl ring-1 ring-gray-200 transition hover:ring-cyan-400 dark:ring-white/[0.08]"
                      >
                        <img src={url} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Datos técnicos */}
              <section>
                <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Datos técnicos
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field icon={<Hash size={13} />}        label="Serie"          value={unit.serial} />
                  <Field icon={<MapPin size={13} />}      label="Ubicación"      value={unit.floor || unit.area ? `${unit.floor ?? ""}${unit.floor && unit.area ? " · " : ""}${unit.area ?? ""}` : "—"} />
                  <Field icon={<Snowflake size={13} />}   label="Capacidad"      value={unit.capacityBtu ? `${unit.capacityBtu} BTU` : ""} />
                  <Field icon={<Snowflake size={13} />}   label="Refrigerante"   value={unit.refrigerantType} />
                  <Field icon={<Hash size={13} />}        label="Voltaje"        value={unit.voltage} />
                  <Field icon={<Hash size={13} />}        label="Amperaje"       value={unit.amperage} />
                  <Field icon={<User size={13} />}        label="Técnico"        value={unit.technician} />
                  <Field icon={<Calendar size={13} />}    label="Instalación"    value={fmtDate(unit.installDate)} />
                  <Field icon={<Wrench size={13} />}      label="Último servicio" value={fmtDate(unit.lastService)} />
                  <Field icon={<Wrench size={13} />}      label="Próximo servicio" value={fmtDate(unit.nextService)} />
                </div>
              </section>

              {unit.notes && (
                <section>
                  <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Notas
                  </h4>
                  <p className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-200">
                    {unit.notes}
                  </p>
                </section>
              )}

              {/* Mantenimientos */}
              <section>
                <div className="mb-2.5 flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Mantenimientos ({services.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => onAddService(unit)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-600 transition hover:bg-cyan-500/20 dark:text-cyan-300"
                  >
                    <Plus size={12} />
                    Registrar
                  </button>
                </div>

                {services.length === 0 ? (
                  <div className="flex h-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400 dark:border-white/[0.08] dark:bg-white/[0.03]">
                    <ClipboardList size={16} className="text-gray-300 dark:text-gray-600" />
                    Sin mantenimientos
                  </div>
                ) : (
                  <ol className="space-y-2.5">
                    {services
                      .slice()
                      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                      .map((s) => (
                        <li
                          key={s.id}
                          className="rounded-xl border border-gray-100 bg-white p-3 text-sm dark:border-white/[0.06] dark:bg-white/[0.03]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-gray-800 dark:text-white">
                                {s.kind ?? "Servicio"}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {fmtDate(s.date)} {s.technician ? `· ${s.technician}` : ""}
                              </p>
                            </div>
                            {s.cost != null && (
                              <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                ${Number(s.cost).toFixed(2)}
                              </span>
                            )}
                          </div>
                          {s.findings && (
                            <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300">{s.findings}</p>
                          )}
                          {s.notes && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{s.notes}</p>
                          )}
                          {s.photoUrls.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {s.photoUrls.map((p, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setActivePhoto(p)}
                                  className="h-12 w-12 overflow-hidden rounded-lg ring-1 ring-gray-200 transition hover:ring-cyan-400 dark:ring-white/[0.08]"
                                >
                                  <img src={p} alt="" className="h-full w-full object-cover" />
                                </button>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                  </ol>
                )}
              </section>

              {/* Recargas de refrigerante */}
              {refrigerantLogs.length > 0 && (
                <section>
                  <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Recargas de refrigerante ({refrigerantLogs.length})
                  </h4>
                  <ol className="space-y-2">
                    {refrigerantLogs.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs dark:border-white/[0.06] dark:bg-white/[0.03]"
                      >
                        <div>
                          <p className="font-semibold text-gray-700 dark:text-gray-200">
                            {r.refrigerantType ?? "—"} · {r.quantity ?? "—"} {r.unit ?? ""}
                          </p>
                          <p className="text-gray-500 dark:text-gray-400">
                            {fmtDate(r.date)} {r.technician ? `· ${r.technician}` : ""}
                          </p>
                        </div>
                        {r.reason && (
                          <span className="ml-2 max-w-[40%] truncate text-gray-400" title={r.reason}>
                            {r.reason}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2 border-t border-gray-100 bg-white/95 px-6 py-3 backdrop-blur dark:border-white/[0.06] dark:bg-[#0f1623]/95">
          <button
            type="button"
            onClick={() => onDelete(unit)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
          >
            <FileText size={12} />
            Eliminar
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAddService(unit)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50 dark:border-cyan-500/30 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
            >
              <Wrench size={12} />
              Mantenimiento
            </button>
            <button
              type="button"
              onClick={() => onEdit(unit)}
              className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-600"
            >
              Editar
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {activePhoto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4"
          onClick={() => setActivePhoto(null)}
        >
          <img src={activePhoto} alt="" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
