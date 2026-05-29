"use client";

import Link from "next/link";
import { useAssetCenter } from "@/components/providers/asset-center-provider";
import { useAssets } from "@/hooks/useAssets";
import { Button } from "@/components/ui/button";
import { StatCard, SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { AssetCompliancePanel } from "@/features/activos/asset-compliance-panel";
import { AssetTechnicalPanel } from "@/features/activos/asset-technical-panel";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { useAssignments } from "@/hooks/useAssignments";
import { useDrivers } from "@/hooks/useDrivers";
import { useMaintenances } from "@/hooks/useMaintenances";
import { useChecklists } from "@/hooks/useChecklists";
import { useAlerts } from "@/hooks/useAlerts";
import { useFuel } from "@/hooks/useFuel";
import { useAudit } from "@/hooks/useAudit";
import { useAuth } from "@/components/providers/auth-provider";
type AssetDetailPageProps = {
  assetId: string;
};

export function AssetDetailPage({ assetId }: AssetDetailPageProps) {
  const { assetCenterAuditEntries } = useAssetCenter();

  // Activos → nuevo backend
  const { assets, loading } = useAssets();

  // El resto sigue en FleetOps hasta que migren sus módulos (Días 3-5)
  const { assignments } = useAssignments();
  const { drivers } = useDrivers();
  const { maintenances } = useMaintenances();
  const { checklists } = useChecklists();
  const { alerts } = useAlerts();
  const { fuelEntries } = useFuel();
  const { session } = useAuth();
  const { data: auditData } = useAudit(session?.companyId ?? null);
  const auditEntries = auditData?.data ?? [];

  if (loading) {
    return (
      <SurfaceCard className="p-6">
        <p className="text-sm text-neutral-500">Cargando activo...</p>
      </SurfaceCard>
    );
  }

  const asset = assets.find((item) => item.id === assetId);

  if (!asset) {
    return (
      <SurfaceCard className="p-6">
        <p className="text-lg font-semibold text-neutral-950">Activo no encontrado</p>
        <p className="mt-2 text-sm text-neutral-600">Revisa la ruta o vuelve al listado principal de activos.</p>
      </SurfaceCard>
    );
  }

  const activeAssignment = assignments.find(
    (assignment) => assignment.assetId === asset.id && assignment.status === "Activa"
  );
  const assignedDriver = drivers.find((driver) => driver.id === activeAssignment?.driverId);
  const relatedMaintenances = maintenances.filter((item) => item.assetId === asset.id);
  const relatedChecklists = checklists.filter((item) => item.assetId === asset.id);
  const relatedAlerts = alerts.filter((item) => item.assetId === asset.id);
  const relatedFuel = fuelEntries.filter((item) => item.assetId === asset.id);
  const relatedAudit = [
    ...auditEntries.filter((item) => item.entityId === asset.id),
    ...assetCenterAuditEntries.filter((item) => item.assetId === asset.id),
  ]
    .sort((left, right) => {
      const leftAt = 'createdAt' in left ? left.createdAt : left.at;
      const rightAt = 'createdAt' in right ? right.createdAt : right.at;
      return rightAt.localeCompare(leftAt);
    })
    .slice(0, 10);

  return (
    <div id="historial" className="space-y-6">
      <ModulePageHeader
        badge="Centro de datos del activo"
        title={`${asset.code} / ${asset.name}`}
        subtitle="Vista integral del activo con operacion, responsables, cumplimiento, combustible y historial tecnico 360."
        accent="sky"
        action={
          <div className="flex flex-wrap gap-3">
            <Link href={`/mantenimiento/nuevo?assetId=${asset.id}`} className="inline-flex">
              <Button tone="amber" variant="solid">Mantenimiento</Button>
            </Link>
            <Link href={`/activos/${asset.id}/editar`} className="inline-flex">
              <Button tone="sky" variant="solid">Editar activo</Button>
            </Link>
            <Link href="/activos" className="inline-flex">
              <Button tone="neutral" variant="outline">Volver al listado</Button>
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Estado"
          value={asset.status}
          detail={asset.availability}
          tone={asset.status === "Operativo" ? "success" : asset.status === "En mantenimiento" ? "warning" : "danger"}
        />
        <StatCard label="Alertas" value={relatedAlerts.length.toString()} detail="Eventos asociados al activo" tone="danger" />
        <StatCard label="Mantenimientos" value={relatedMaintenances.length.toString()} detail="Trabajos tecnicos acumulados" tone="warning" />
        <StatCard label="Checklists" value={relatedChecklists.length.toString()} detail="Inspecciones registradas" tone="info" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.95fr]">
        <SurfaceCard className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-sky-700">{asset.assetType}</p>
              <h2 className="mt-1 text-2xl font-bold text-neutral-950">{asset.name}</h2>
              <p className="mt-2 text-sm text-neutral-600">{asset.observations}</p>
            </div>
            <StatusPill
              label={asset.status}
              tone={asset.status === "Operativo" ? "success" : asset.status === "En mantenimiento" ? "warning" : "danger"}
            />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <DetailCard label="Resumen" value={`${asset.assetType} / ${asset.category}`} />
            <DetailCard label="Sede" value={`${asset.site} / ${asset.location}`} />
            <DetailCard label="Responsable" value={asset.responsible} />
            <DetailCard label="Conductor actual" value={assignedDriver?.name ?? "Sin asignacion"} />
            <DetailCard label="Proximo mantenimiento" value={asset.nextMaintenance || "No programado"} />
            <DetailCard label="Ultima inspeccion" value={asset.lastInspection || "Sin dato"} />
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-5">
          <h3 className="text-lg font-semibold text-neutral-950">Datos tecnicos</h3>
          <dl className="mt-4 space-y-3">
            <MetaRow label="Marca" value={asset.brand} />
            <MetaRow label="Modelo" value={asset.model} />
            <MetaRow label="Serie" value={asset.serial} />
            <MetaRow label="Placa" value={asset.plate || "N/A"} />
            <MetaRow label="Anio" value={asset.year} />
            <MetaRow label="Utilizacion" value={asset.utilization} />
            <MetaRow label="Alertas activas" value={asset.alerts.toString()} />
          </dl>
        </SurfaceCard>
      </section>

      <AssetCompliancePanel assetId={asset.id} owner={asset.responsible} />
      <AssetTechnicalPanel assetId={asset.id} />

      <section className="grid gap-6 xl:grid-cols-2">
        <HistoryCard
          title="Mantenimiento"
          items={relatedMaintenances.map((item) => ({ title: item.title, meta: `${item.kind} / ${item.status}`, detail: `${item.scheduledDate} / Responsable: ${item.responsible}` }))}
        />
        <HistoryCard
          title="Checklist"
          items={relatedChecklists.map((item) => ({ title: item.summary, meta: `${item.status} / ${item.date}`, detail: `${item.inspector} / ${item.findings}` }))}
        />
        <HistoryCard
          title="Alertas"
          items={relatedAlerts.map((item) => ({ title: item.title, meta: `${item.type} / ${item.severity}`, detail: `${item.status} / vence ${item.dueDate}` }))}
        />
        <HistoryCard
          title="Combustible"
          items={relatedFuel.map((item) => ({ title: `${item.liters} L en ${item.station}`, meta: `${item.date} / costo ${item.cost.toFixed(2)} USD`, detail: `Lectura ${item.odometer}` }))}
        />
      </section>

      <HistoryCard
        title="Auditoria visible"
        items={relatedAudit.map((item) => ({ 
          title: item.description, 
          meta: `${item.action} / ${'actorName' in item ? item.actorName : item.actor}`,
          detail: 'createdAt' in item ? item.createdAt : item.at,
        }))}
      />
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-neutral-900">{value}</p>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-neutral-100 pb-3 text-sm last:border-none last:pb-0">
      <dt className="font-medium text-neutral-500">{label}</dt>
      <dd className="text-right font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}

function HistoryCard({ title, items }: { title: string; items: Array<{ title: string; meta: string; detail: string }> }) {
  return (
    <SurfaceCard className="p-5">
      <h3 className="text-lg font-semibold text-neutral-950">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-neutral-500">Sin registros en esta seccion.</p>
        ) : (
          items.map((item) => (
            <div key={`${title}-${item.title}-${item.meta}`} className="rounded-lg border border-neutral-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold text-neutral-950">{item.title}</p>
                <span className="text-xs font-medium text-neutral-500">{item.meta}</span>
              </div>
              <p className="mt-2 text-sm text-neutral-600">{item.detail}</p>
            </div>
          ))
        )}
      </div>
    </SurfaceCard>
  );
}