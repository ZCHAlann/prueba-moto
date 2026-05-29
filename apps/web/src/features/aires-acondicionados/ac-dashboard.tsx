"use client";

import { useAcUnits } from "@/hooks/useAcUnits";
import { StatCard, SurfaceCard } from "@/components/ui/surface";

export function AcDashboard() {
  const { units, services, refrigerantLogs } = useAcUnits();

  const totalUnits = units.length;
  const operativeUnits = units.filter((u) => u.status === "Operativo").length;
  const reviewUnits = units.filter((u) => u.status === "En revision" || u.status === "Pendiente revision").length;
  const outOfServiceUnits = units.filter((u) => u.status === "Fuera de servicio").length;
  const totalServices = services.length;
  const totalRefrigerant = refrigerantLogs.reduce((acc, log) => acc + (parseFloat(log.quantity) || 0), 0);

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Equipos" value={totalUnits.toString()} detail="Instalados" tone="info" />
        <StatCard label="Operativos" value={operativeUnits.toString()} detail="Funcionando" tone="success" />
        <StatCard label="En Revisión" value={reviewUnits.toString()} detail="Requieren atención" tone="warning" />
        <StatCard label="Fuera de Servicio" value={outOfServiceUnits.toString()} detail="Críticos" tone="danger" />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <SurfaceCard className="p-5 flex flex-col items-start justify-center">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">Resumen Operativo</h3>
          <p className="mt-2 text-sm text-neutral-500 dark:text-slate-400 mb-4">
            Visualiza y administra rápidamente todo el parque de aires acondicionados.
          </p>
          <div className="flex gap-4 w-full">
            <div className="flex-1 bg-cyan-50 dark:bg-cyan-950 p-4 rounded-xl border border-cyan-100 dark:border-cyan-900">
              <p className="text-sm font-medium text-cyan-800 dark:text-cyan-300">Servicios Realizados</p>
              <p className="text-3xl font-bold text-cyan-600 dark:text-cyan-400 mt-1">{totalServices}</p>
            </div>
            <div className="flex-1 bg-sky-50 dark:bg-sky-950 p-4 rounded-xl border border-sky-100 dark:border-sky-900">
              <p className="text-sm font-medium text-sky-800 dark:text-sky-300">Refrigerante (kg)</p>
              <p className="text-3xl font-bold text-sky-600 dark:text-sky-400 mt-1">{totalRefrigerant.toFixed(1)}</p>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">Alertas Recientes</h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400 mb-4">
            Equipos que requieren atención prioritaria.
          </p>
          <div className="space-y-3">
            {units.filter((u) => u.status !== "Operativo").slice(0, 4).map((unit) => (
              <div key={unit.id} className="flex items-center justify-between p-3 rounded-lg border border-neutral-100 dark:border-slate-700 bg-neutral-50 dark:bg-slate-800/50">
                <div>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white">{unit.name}</p>
                  <p className="text-xs text-neutral-500 dark:text-slate-400">{unit.site} - {unit.code}</p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  unit.status === "Fuera de servicio"
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400"
                }`}>
                  {unit.status}
                </span>
              </div>
            ))}
            {reviewUnits + outOfServiceUnits === 0 && (
              <div className="p-4 text-center text-sm text-neutral-500 dark:text-slate-400 border border-dashed rounded-lg border-neutral-200 dark:border-slate-700">
                Todos los equipos operan con normalidad.
              </div>
            )}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}