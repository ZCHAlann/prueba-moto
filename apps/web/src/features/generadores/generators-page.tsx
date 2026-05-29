import { defaultGenerators } from "@/features/generadores/mock-data";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { EmptyState, StatCard } from "@/components/ui/surface";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";

export function GeneratorsPage() {
  const operational = defaultGenerators.filter((item) => item.status === "Operativo");
  const maintenance = defaultGenerators.filter((item) => item.status === "En mantenimiento");
  const reserve = defaultGenerators.filter((item) => item.status === "En reserva");
  const nextService = [...defaultGenerators].sort((left, right) =>
    left.nextMaintenance.localeCompare(right.nextMaintenance)
  );

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Generadores"
        title="Generadores electricos"
        subtitle="Control de generadores a motor y equipos de respaldo por sede, responsable y estado operativo."
        accent="orange"
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total equipos" value={String(defaultGenerators.length)} detail="Generadores registrados" tone="info" />
        <StatCard label="Operativos" value={String(operational.length)} detail="Listos para respaldo" tone="success" />
        <StatCard label="En mantenimiento" value={String(maintenance.length)} detail="Requieren intervencion" tone="warning" />
        <StatCard label="En reserva" value={String(reserve.length)} detail="Disponibles para contingencia" tone="neutral" />
      </section>

      <TableCard
        title="Base de generadores"
        description="Vista general para equipos de respaldo, generadores diesel y unidades moviles."
      >
        {defaultGenerators.length === 0 ? (
          <EmptyState
            title="Sin generadores registrados"
            description="Cuando registres generadores electricos, aqui veras potencia, sede, responsable, estado y horas de uso."
          />
        ) : (
          <Table minWidth="min-w-[1180px]">
            <TableHead>
              <tr>
                <th className="px-4 py-3 font-semibold">Codigo</th>
                <th className="px-4 py-3 font-semibold">Equipo</th>
                <th className="px-4 py-3 font-semibold">Categoria</th>
                <th className="px-4 py-3 font-semibold">Potencia</th>
                <th className="px-4 py-3 font-semibold">Combustible</th>
                <th className="px-4 py-3 font-semibold">Sede</th>
                <th className="px-4 py-3 font-semibold">Responsable</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Horas</th>
              </tr>
            </TableHead>
            <TableBody>
              {defaultGenerators.map((generator) => (
                <tr key={generator.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3.5 font-semibold text-neutral-950">{generator.code}</td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-neutral-950">{generator.name}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {generator.brand} / {generator.model}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-neutral-700">{generator.category}</td>
                  <td className="px-4 py-3.5 text-neutral-700">{generator.power}</td>
                  <td className="px-4 py-3.5 text-neutral-700">{generator.fuelType}</td>
                  <td className="px-4 py-3.5 text-neutral-700">{generator.site}</td>
                  <td className="px-4 py-3.5 text-neutral-700">{generator.responsible}</td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                        generator.status === "Operativo"
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : generator.status === "En mantenimiento"
                            ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                            : "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
                      }`}
                    >
                      {generator.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-neutral-700">{generator.runtimeHours}</td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>

      <TableCard
        title="Proximos servicios"
        description="Equipos que requieren atencion pronta para no comprometer disponibilidad."
      >
        {nextService.length === 0 ? (
          <EmptyState
            title="Sin servicios programados"
            description="Los proximos mantenimientos de generadores apareceran cuando agregues equipos y fechas de servicio."
          />
        ) : (
          <Table minWidth="min-w-[980px]">
          <TableHead>
            <tr>
              <th className="px-4 py-3 font-semibold">Equipo</th>
              <th className="px-4 py-3 font-semibold">Sede</th>
              <th className="px-4 py-3 font-semibold">Ultimo servicio</th>
              <th className="px-4 py-3 font-semibold">Proximo mantenimiento</th>
              <th className="px-4 py-3 font-semibold">Nota</th>
            </tr>
          </TableHead>
          <TableBody>
            {nextService.map((generator) => (
              <tr key={`${generator.id}-service`} className="hover:bg-neutral-50">
                <td className="px-4 py-3.5 font-semibold text-neutral-950">{generator.name}</td>
                <td className="px-4 py-3.5 text-neutral-700">{generator.site}</td>
                <td className="px-4 py-3.5 text-neutral-700">{generator.lastService}</td>
                <td className="px-4 py-3.5 text-neutral-700">{generator.nextMaintenance}</td>
                <td className="px-4 py-3.5 text-neutral-700">{generator.notes}</td>
              </tr>
            ))}
          </TableBody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}
