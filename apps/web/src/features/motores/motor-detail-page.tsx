"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useMotors } from "@/components/providers/motors-provider";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { defaultMotorAlerts, defaultMotorHistory, defaultMotorUpcomingTasks } from "@/features/motores/mock-data";

type MotorDetailPageProps = {
  motorId: string;
};

export function MotorDetailPage({ motorId }: MotorDetailPageProps) {
  const router = useRouter();
  const { confirmAction } = useFeedback();
  const { motors, deleteMotor, motorAuditEntries } = useMotors();
  const motor = useMemo(() => motors.find((item) => item.id === motorId), [motorId, motors]);
  const history = defaultMotorHistory.filter((item) => item.motorId === motorId);
  const tasks = defaultMotorUpcomingTasks.filter((item) => item.motorId === motorId);
  const alerts = defaultMotorAlerts.filter((item) => item.motorId === motorId);
  const audit = motorAuditEntries.filter((item) => item.motorId === motorId).slice(0, 6);

  if (!motor) {
    return <EmptyState title="Motor no encontrado" description="No existe un motor con ese identificador dentro de la empresa activa." />;
  }

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Detalle de motor"
        title={`${motor.internalCode} / ${motor.brand} ${motor.model}`}
        subtitle="Ficha tecnica completa del motor con resumen, historial, proximos mantenimientos, alertas y trazabilidad visible."
        accent="orange"
        action={
          <div className="flex flex-wrap gap-3">
            <Link href={`/motores/${motor.id}/editar`} className="rounded-lg border border-orange-200 bg-white px-4 py-2.5 text-sm font-semibold text-orange-700 transition hover:bg-orange-50">Editar motor</Link>
            <button type="button" onClick={async () => {
              await confirmAction({
                title: "Eliminar motor",
                description: "El motor saldra del dominio tecnico y de sus listados asociados.",
                confirmLabel: "Eliminar motor",
                accent: "rose",
                successTitle: "Motor eliminado",
                successDescription: "El inventario tecnico ya fue actualizado.",
                summary: [
                  { label: "Codigo", value: motor.internalCode },
                  { label: "Serie", value: motor.serial },
                  { label: "Estado", value: motor.status },
                  { label: "Ubicacion", value: motor.location },
                ],
                action: async () => {
                  deleteMotor(motor.id);
                  router.push("/motores");
                },
              });
            }} className="rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50">Eliminar</button>
          </div>
        }
      />

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Estado" value={motor.status} detail={motor.location} tone={motor.status === "Operativo" ? "success" : motor.status === "En mantenimiento" ? "warning" : motor.status === "Reserva" ? "info" : "danger"} />
        <StatCard label="Horas de uso" value={motor.hoursUsed.toString()} detail={`Proximo mantenimiento ${motor.nextMaintenance}`} tone="warning" />
        <StatCard label="Combustible" value={motor.fuelType} detail={`${motor.oilType} / ${motor.oilCapacity}`} tone="info" />
        <StatCard label="Responsable" value={motor.responsible} detail="Custodio tecnico actual" tone="neutral" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SurfaceCard className="p-6">
          <h2 className="text-lg font-semibold text-neutral-950">Resumen tecnico</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Meta label="Codigo interno" value={motor.internalCode} />
            <Meta label="Serie" value={motor.serial} />
            <Meta label="Marca" value={motor.brand} />
            <Meta label="Modelo" value={motor.model} />
            <Meta label="Potencia" value={motor.power} />
            <Meta label="Combustible" value={motor.fuelType} />
            <Meta label="Tipo de aceite" value={motor.oilType} />
            <Meta label="Capacidad de aceite" value={motor.oilCapacity} />
          </div>
          <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">{motor.observations}</div>
        </SurfaceCard>

        <SurfaceCard className="p-6">
          <h2 className="text-lg font-semibold text-neutral-950">Alertas asociadas</h2>
          <div className="mt-4 space-y-3">
            {alerts.length === 0 ? <EmptyState title="Sin alertas" description="Este motor no tiene alertas activas en este momento." /> : alerts.map((item) => (
              <div key={item.id} className="rounded-lg border border-neutral-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-neutral-950">{item.title}</p>
                  <StatusPill label={item.severity} tone={item.severity === "Alta" ? "danger" : item.severity === "Media" ? "warning" : "info"} />
                </div>
                <p className="mt-2 text-sm text-neutral-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <TableCard title="Proximos mantenimientos" description="Tareas tecnicas pendientes y criticidad del motor.">
          {tasks.length === 0 ? <EmptyState title="Sin tareas" description="No existen tareas pendientes para este motor." /> : (
            <Table minWidth="min-w-[720px]">
              <TableHead>
                <tr>
                  <th className="px-5 py-3 font-semibold">Trabajo</th>
                  <th className="px-5 py-3 font-semibold">Fecha</th>
                  <th className="px-5 py-3 font-semibold">Estado</th>
                </tr>
              </TableHead>
              <TableBody>
                {tasks.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50">
                    <td className="px-5 py-4 font-semibold text-neutral-950">{item.title}</td>
                    <td className="px-5 py-4">{item.dueDate}</td>
                    <td className="px-5 py-4"><StatusPill label={item.status} tone={item.status === "Critico" ? "danger" : "info"} /></td>
                  </tr>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>

      <TableCard title="Historial tecnico" description="Eventos tecnicos recientes de este motor.">
          {history.length === 0 ? <EmptyState title="Sin historial" description="Todavia no hay eventos registrados para este motor." /> : (
            <Table minWidth="min-w-[720px]">
              <TableHead>
                <tr>
                  <th className="px-5 py-3 font-semibold">Fecha</th>
                  <th className="px-5 py-3 font-semibold">Tipo</th>
                  <th className="px-5 py-3 font-semibold">Evento</th>
                </tr>
              </TableHead>
              <TableBody>
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50">
                    <td className="px-5 py-4">{item.date}</td>
                    <td className="px-5 py-4">{item.type}</td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-neutral-950">{item.title}</p>
                      <p className="mt-1 text-xs text-neutral-500">{item.detail}</p>
                    </td>
                  </tr>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>
      </section>

      <TableCard title="Auditoria visible" description="Cambios recientes hechos sobre este motor en ApliSmart Motors.">
        {audit.length === 0 ? <EmptyState title="Sin auditoria" description="Aun no hay eventos auditables sobre este motor." /> : (
          <Table minWidth="min-w-[720px]">
            <TableHead>
              <tr>
                <th className="px-5 py-3 font-semibold">Fecha</th>
                <th className="px-5 py-3 font-semibold">Actor</th>
                <th className="px-5 py-3 font-semibold">Accion</th>
                <th className="px-5 py-3 font-semibold">Detalle</th>
              </tr>
            </TableHead>
            <TableBody>
              {audit.map((item) => (
                <tr key={item.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-4">{item.at}</td>
                  <td className="px-5 py-4">{item.actor}</td>
                  <td className="px-5 py-4">{item.action}</td>
                  <td className="px-5 py-4">{item.description}</td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 font-semibold text-neutral-950">{value}</p>
    </div>
  );
}
