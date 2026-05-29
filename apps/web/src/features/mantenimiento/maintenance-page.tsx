"use client";

import Link from "next/link";
import { useAssets } from "@/hooks/useAssets";
import { useMaintenances } from "@/hooks/useMaintenances";
import { Button } from "@/components/ui/button";
import { EmptyState, StatCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";

export function MaintenancePage() {
  // ── hooks nuevos ─────────────────────────────────────────────────────────────
  const { maintenances, loading: maintenancesLoading } = useMaintenances();
  const { assets, loading: assetsLoading } = useAssets();

  const loading = maintenancesLoading || assetsLoading;

  if (loading) {
    return (
      <div className="space-y-6">
        <ModulePageHeader badge="Gestion tecnica" title="Mantenimiento" subtitle="Cargando ordenes…" accent="amber" />
        <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Gestion tecnica"
        title="Mantenimiento"
        subtitle="OTs visibles, fechas claras, responsables definidos y acceso directo a inventario, cambios de aceite y registros tecnicos."
        accent="amber"
        action={
          <div className="flex gap-3">
            <Link href="/mantenimiento/inventario" className="inline-flex">
              <Button tone="amber" variant="outline">Inventario</Button>
            </Link>
            <Link href="/mantenimiento/cambios-aceite" className="inline-flex">
              <Button tone="amber" variant="outline">Cambios de aceite</Button>
            </Link>
            <Link href="/mantenimiento/nuevo" className="inline-flex">
              <Button tone="amber" variant="solid">Nuevo mantenimiento</Button>
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Pendientes"
          value={maintenances.filter((r) => r.status === "Pendiente").length.toString()}
          detail="Pendientes por iniciar"
          tone="warning"
        />
        <StatCard
          label="En proceso"
          value={maintenances.filter((r) => r.status === "En proceso").length.toString()}
          detail="OTs intervenidas actualmente"
          tone="info"
        />
        <StatCard
          label="Completados"
          value={maintenances.filter((r) => r.status === "Completado").length.toString()}
          detail="Trabajos cerrados"
          tone="success"
        />
      </section>

      <TableCard
        title="Ordenes de mantenimiento"
        description="Seguimiento tecnico con vehiculo, responsable, fechas y notas visibles."
      >
        {maintenances.length === 0 ? (
          <EmptyState
            title="Sin mantenimientos"
            description="Todavia no hay ordenes registradas en la empresa activa."
          />
        ) : (
          <Table minWidth="min-w-[1040px]">
            <TableHead>
              <tr>
                <th className="px-5 py-3 font-semibold">Vehiculo</th>
                <th className="px-5 py-3 font-semibold">Trabajo</th>
                <th className="px-5 py-3 font-semibold">Tipo</th>
                <th className="px-5 py-3 font-semibold">Responsable</th>
                <th className="px-5 py-3 font-semibold">Fechas</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 font-semibold">Acciones</th>
              </tr>
            </TableHead>
            <TableBody>
              {maintenances.map((record) => {
                const asset = assets.find((a) => a.id === record.assetId);
                return (
                  <tr key={record.id} className="hover:bg-neutral-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-neutral-950">{asset?.plate ?? record.assetId}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {asset ? `${asset.brand} ${asset.model}` : "Vehiculo"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-neutral-950">{record.title}</p>
                      <p className="mt-1 text-xs text-neutral-500">{record.notes}</p>
                    </td>
                    <td className="px-5 py-4">{record.kind}</td>
                    <td className="px-5 py-4">{record.responsible}</td>
                    <td className="px-5 py-4">
                      <p>{record.scheduledDate}</p>
                      <p className="mt-1 text-xs text-neutral-500">Vence {record.dueDate}</p>
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill
                        label={record.status}
                        tone={
                          record.status === "Pendiente"
                            ? "warning"
                            : record.status === "En proceso"
                              ? "info"
                              : "success"
                        }
                      />
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/mantenimiento/${record.id}/editar`}
                        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-amber-300 hover:text-amber-700"
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}