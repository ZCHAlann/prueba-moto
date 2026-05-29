"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAssetCenter } from "@/components/providers/asset-center-provider";
import { useFeedback } from "@/components/providers/feedback-provider";
import { Button } from "@/components/ui/button";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { AssetCompliancePanel } from "@/features/activos/asset-compliance-panel";
import { AssetTechnicalPanel } from "@/features/activos/asset-technical-panel";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { useAssets } from "@/hooks/useAssets";
import { useAssignments } from "@/hooks/useAssignments";
import { useMaintenances } from "@/hooks/useMaintenances";
import { useAlerts } from "@/hooks/useAlerts";
import { useDrivers } from "@/hooks/useDrivers";
import { useAuth } from "@/components/providers/auth-provider";
import { useAudit } from "@/hooks/useAudit";

type VehicleDetailPageProps = {
  vehicleId: string;
};

export function VehicleDetailPage({ vehicleId }: VehicleDetailPageProps) {
  const router = useRouter();
  const { confirmAction } = useFeedback();
  const { assets, deleteAsset } = useAssets();
  const { assignments } = useAssignments();
  const { maintenances } = useMaintenances();
  const { alerts } = useAlerts();
  const { drivers } = useDrivers();
  const { session } = useAuth();
  const { data: auditData } = useAudit(session?.companyId ?? null);
  const auditEntries = auditData?.data ?? [];
  const { assetCenterAuditEntries } = useAssetCenter();

  const vehicle = useMemo(() => assets.find((item) => item.id === vehicleId), [assets, vehicleId]);
  const currentAssignment = assignments.find((item) => item.assetId === vehicleId && item.status === "Activa");
  const assignedDriver = drivers.find((item) => item.id === currentAssignment?.driverId);
  const vehicleMaintenances = maintenances.filter((item) => item.assetId === vehicleId).slice(0, 4);
  const vehicleAlerts = alerts.filter((item) => item.assetId === vehicleId).slice(0, 4);
  const audit = [...auditEntries.filter((item) => item.entityId === vehicleId), ...assetCenterAuditEntries.filter((item) => item.assetId === vehicleId)].slice(0, 8);

  if (!vehicle) {
    return <EmptyState title="Vehiculo no encontrado" description="La unidad solicitada no existe dentro de la empresa activa." />;
  }

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Detalle de vehiculo"
        title={`${vehicle.plate} / ${vehicle.brand} ${vehicle.model}`}
        subtitle="Centro de datos del vehiculo con resumen tecnico, estado operativo, cumplimiento documental, historiales y proximas novedades."
        accent="sky"
        action={
          <div className="flex flex-wrap gap-3">
            <Link href={`/flotas/${vehicle.id}/editar`} className="rounded-lg border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50">Editar vehiculo</Link>
            <Link href={`/mantenimiento/nuevo?assetId=${vehicle.id}`} className="rounded-lg border border-amber-200 bg-white px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50">Crear mantenimiento</Link>
            <Button tone="danger" variant="outline" onClick={async () => {
              await confirmAction({
                title: "Eliminar vehiculo",
                description: "La unidad saldra de la base principal y sus relaciones operativas activas se cerraran.",
                confirmLabel: "Eliminar vehiculo",
                accent: "rose",
                successTitle: "Vehiculo eliminado",
                successDescription: "La unidad fue retirada de ApliSmart Motors.",
                summary: [
                  { label: "Placa", value: vehicle.plate },
                  { label: "Vehiculo", value: `${vehicle.brand} ${vehicle.model}` },
                  { label: "Estado", value: vehicle.status },
                  { label: "Sede", value: vehicle.site },
                ],
                action: async () => {
                  deleteAsset(vehicle.id);
                  router.push("/flotas");
                },
              });
            }}>Eliminar</Button>
          </div>
        }
      />

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Estado" value={vehicle.status} detail={vehicle.availability} tone={vehicle.status === "Operativo" ? "success" : vehicle.status === "En mantenimiento" ? "warning" : "danger"} />
        <StatCard label="Sede" value={vehicle.site} detail={vehicle.location} tone="info" />
        <StatCard label="Responsable" value={vehicle.responsible} detail={assignedDriver ? `Asignado a ${assignedDriver.name}` : "Sin asignacion activa"} tone="neutral" />
        <StatCard label="Proximo mantenimiento" value={vehicle.nextMaintenance} detail={`Ultima inspeccion ${vehicle.lastInspection}`} tone="warning" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SurfaceCard className="p-6">
          <h2 className="text-lg font-semibold text-neutral-950">Resumen tecnico</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Meta label="Placa" value={vehicle.plate} />
            <Meta label="Tipo" value={vehicle.category} />
            <Meta label="Marca" value={vehicle.brand} />
            <Meta label="Modelo" value={vehicle.model} />
            <Meta label="Ano" value={vehicle.year} />
            <Meta label="Serie / chasis" value={vehicle.serial} />
            <Meta label="Color" value={vehicle.color} />
            <Meta label="Carga maxima" value={vehicle.maxLoad} />
            <Meta label="Combustible" value={vehicle.fuelType} />
            <Meta label="Aceite" value={`${vehicle.oilType} / ${vehicle.oilCapacity}`} />
            <Meta label="Codigo interno" value={vehicle.code} />
            <Meta label="Utilizacion" value={vehicle.utilization} />
          </div>
          <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
            {vehicle.observations}
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-6">
          <h2 className="text-lg font-semibold text-neutral-950">Operacion actual</h2>
          <div className="mt-5 space-y-4 text-sm text-neutral-700">
            <div className="rounded-lg border border-neutral-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Estado operativo</p>
              <div className="mt-2"><StatusPill label={vehicle.status} tone={vehicle.status === "Operativo" ? "success" : vehicle.status === "En mantenimiento" ? "warning" : "danger"} /></div>
            </div>
            <div className="rounded-lg border border-neutral-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Asignacion actual</p>
              <p className="mt-2 font-semibold text-neutral-950">{assignedDriver ? assignedDriver.name : "Sin conductor asignado"}</p>
              <p className="mt-1 text-neutral-500">{currentAssignment ? `Inicio ${currentAssignment.startDate}` : "Disponible para nueva asignacion."}</p>
            </div>
            <div className="rounded-lg border border-neutral-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Alertas visibles</p>
              <p className="mt-2 text-2xl font-bold text-neutral-950">{vehicleAlerts.length}</p>
              <p className="mt-1 text-neutral-500">Eventos abiertos asociados a esta unidad.</p>
            </div>
          </div>
        </SurfaceCard>
      </section>

      <AssetCompliancePanel assetId={vehicle.id} owner={vehicle.responsible} />
      <AssetTechnicalPanel assetId={vehicle.id} />

      <section className="grid gap-6 xl:grid-cols-2">
        <TableCard title="Proximos mantenimientos" description="Trabajos programados y en curso para esta unidad.">
          {vehicleMaintenances.length === 0 ? (
            <EmptyState title="Sin mantenimientos" description="No hay mantenimientos asociados a esta unidad todavia." />
          ) : (
            <Table minWidth="min-w-[720px]">
              <TableHead>
                <tr>
                  <th className="px-5 py-3 font-semibold">Trabajo</th>
                  <th className="px-5 py-3 font-semibold">Responsable</th>
                  <th className="px-5 py-3 font-semibold">Fecha</th>
                  <th className="px-5 py-3 font-semibold">Estado</th>
                </tr>
              </TableHead>
              <TableBody>
                {vehicleMaintenances.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-neutral-950">{item.title}</p>
                      <p className="mt-1 text-xs text-neutral-500">{item.kind}</p>
                    </td>
                    <td className="px-5 py-4">{item.responsible}</td>
                    <td className="px-5 py-4">{item.dueDate}</td>
                    <td className="px-5 py-4"><StatusPill label={item.status} tone={item.status === "Pendiente" ? "warning" : item.status === "En proceso" ? "info" : "success"} /></td>
                  </tr>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>

        <TableCard title="Alertas asociadas" description="Vencimientos y novedades activas vinculadas a la unidad.">
          {vehicleAlerts.length === 0 ? (
            <EmptyState title="Sin alertas" description="La unidad no tiene alertas abiertas en este momento." />
          ) : (
            <Table minWidth="min-w-[720px]">
              <TableHead>
                <tr>
                  <th className="px-5 py-3 font-semibold">Alerta</th>
                  <th className="px-5 py-3 font-semibold">Tipo</th>
                  <th className="px-5 py-3 font-semibold">Vence</th>
                  <th className="px-5 py-3 font-semibold">Estado</th>
                </tr>
              </TableHead>
              <TableBody>
                {vehicleAlerts.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-neutral-950">{item.title}</p>
                      <p className="mt-1 text-xs text-neutral-500">{item.notes}</p>
                    </td>
                    <td className="px-5 py-4">{item.type}</td>
                    <td className="px-5 py-4">{item.dueDate}</td>
                    <td className="px-5 py-4"><StatusPill label={item.status} tone={item.status === "Abierta" ? "warning" : item.status === "En seguimiento" ? "info" : "success"} /></td>
                  </tr>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>
      </section>

      <TableCard title="Auditoria visible" description="Cambios de la unidad y eventos documentales en una sola vista.">
        {audit.length === 0 ? (
          <EmptyState title="Sin auditoria" description="Aun no hay eventos registrados para este vehiculo." />
        ) : (
          <Table minWidth="min-w-[900px]">
            <TableHead>
              <tr>
                <th className="px-5 py-3 font-semibold">Fecha</th>
                <th className="px-5 py-3 font-semibold">Actor</th>
                <th className="px-5 py-3 font-semibold">Entidad</th>
                <th className="px-5 py-3 font-semibold">Accion</th>
                <th className="px-5 py-3 font-semibold">Detalle</th>
              </tr>
            </TableHead>
            <TableBody>
              {audit.map((item) => (
                <tr key={item.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-4">{"at" in item ? item.at : "--"}</td>
                  <td className="px-5 py-4">{"actorName" in item ? item.actorName : (item as {actor: string}).actor}</td>
                  <td className="px-5 py-4">{item.entity}</td>
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
