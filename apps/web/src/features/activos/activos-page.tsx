"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAssets } from "@/hooks/useAssets";
import { Button } from "@/components/ui/button";
import { InputField, SelectField } from "@/components/ui/form-controls";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { assetStatusOptions, assetTypeOptions } from "@/features/activos/mock-data";
import type { AssetStatus, AssetType } from "@/types/activo";
import { useAssignments } from "@/hooks/useAssignments";
import { useDrivers } from "@/hooks/useDrivers";

type FilterType = AssetType | "Todos";
type FilterStatus = AssetStatus | "Todos";

export function ActivosPage() {
  // Datos de activos → nuevo backend
  const { assets, loading } = useAssets();
  // assignments y drivers siguen en FleetOps hasta que migren en Día 3
  const { assignments } = useAssignments();
  const { drivers } = useDrivers();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<FilterType>("Todos");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("Todos");

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();

    return assets.filter((asset) => {
      const matchesSearch =
        query.length === 0 ||
        asset.code.toLowerCase().includes(query) ||
        asset.name.toLowerCase().includes(query) ||
        asset.site.toLowerCase().includes(query) ||
        asset.responsible.toLowerCase().includes(query);

      const matchesType = typeFilter === "Todos" || asset.assetType === typeFilter;
      const matchesStatus = statusFilter === "Todos" || asset.status === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [assets, search, statusFilter, typeFilter]);

  const summaryCards = [
    {
      label: "Total activos",
      value: assets.length.toString(),
      detail: "Base actual registrada",
      tone: "info" as const,
    },
    {
      label: "Operativos",
      value: assets.filter((asset) => asset.status === "Operativo").length.toString(),
      detail: "Disponibles para asignacion",
      tone: "success" as const,
    },
    {
      label: "En mantenimiento",
      value: assets
        .filter((asset) => asset.status === "En mantenimiento")
        .length.toString(),
      detail: "Con trabajo tecnico en curso",
      tone: "warning" as const,
    },
    {
      label: "Fuera de servicio",
      value: assets
        .filter((asset) => asset.status === "Fuera de servicio")
        .length.toString(),
      detail: "Con bloqueo operativo",
      tone: "danger" as const,
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <ModulePageHeader
          badge="Primer modulo funcional"
          title="Activos"
          subtitle="Catalogo operativo con flujo real de alta, consulta, edicion e historial tecnico."
          accent="sky"
        />
        <SurfaceCard className="p-6">
          <p className="text-sm text-neutral-500">Cargando activos...</p>
        </SurfaceCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Primer modulo funcional"
        title="Activos"
        subtitle="Catalogo operativo con flujo real de alta, consulta, edicion e historial tecnico."
        accent="sky"
        action={
          <Link href="/activos/nuevo" className="inline-flex">
            <Button tone="sky" variant="solid">Nuevo activo</Button>
          </Link>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            detail={card.detail}
            tone={card.tone}
          />
        ))}
      </section>

      <SurfaceCard className="p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1.6fr_repeat(2,minmax(0,220px))]">
          <InputField
            label="Busqueda"
            type="search"
            value={search}
            onChange={setSearch}
            accent="sky"
            placeholder="Codigo, nombre, sede o responsable"
          />
          <SelectField
            label="Tipo de activo"
            value={typeFilter}
            onChange={(value) => setTypeFilter(value as FilterType)}
            accent="sky"
            options={[
              { value: "Todos", label: "Todos" },
              ...assetTypeOptions.map((option) => ({ value: option, label: option })),
            ]}
          />
          <SelectField
            label="Estado"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as FilterStatus)}
            accent="sky"
            options={[
              { value: "Todos", label: "Todos" },
              ...assetStatusOptions.map((option) => ({ value: option, label: option })),
            ]}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-neutral-600">
          <span className="rounded-lg bg-neutral-100 px-3 py-1 font-medium text-neutral-700">
            Mostrando {filteredAssets.length} de {assets.length} activos
          </span>
          {(search || typeFilter !== "Todos" || statusFilter !== "Todos") && (
            <Button
              variant="ghost"
              tone="sky"
              onClick={() => {
                setSearch("");
                setTypeFilter("Todos");
                setStatusFilter("Todos");
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      </SurfaceCard>

      <TableCard
        title="Listado de activos"
        description="Tabla operativa full width con acceso rapido a ver, editar, historial y mantenimiento."
      >
        {filteredAssets.length === 0 ? (
          <EmptyState
            title="Sin resultados"
            description="Ajusta los filtros para volver a encontrar activos dentro del catalogo actual."
          />
        ) : (
          <Table minWidth="min-w-[1240px]">
            <TableHead>
              <tr>
                <th className="px-5 py-3 font-semibold">Codigo</th>
                <th className="px-5 py-3 font-semibold">Nombre</th>
                <th className="px-5 py-3 font-semibold">Tipo activo</th>
                <th className="px-5 py-3 font-semibold">Estado operativo</th>
                <th className="px-5 py-3 font-semibold">Sede y ubicacion</th>
                <th className="px-5 py-3 font-semibold">Responsable actual</th>
                <th className="px-5 py-3 font-semibold">Seguimiento</th>
                <th className="px-5 py-3 font-semibold">Acciones</th>
              </tr>
            </TableHead>
            <TableBody>
              {filteredAssets.map((asset) => {
                const assignment = assignments.find(
                  (item) => item.assetId === asset.id && item.status === "Activa"
                );
                const driver = drivers.find((item) => item.id === assignment?.driverId);

                return (
                  <tr key={asset.id} className="align-top transition hover:bg-neutral-50">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-neutral-950">{asset.code}</p>
                      <p className="mt-1 text-xs text-neutral-500">{asset.serial}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-neutral-950">{asset.name}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Prox. mant. {asset.nextMaintenance || "Sin fecha"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-neutral-950">{asset.assetType}</p>
                      <p className="mt-1 text-xs text-neutral-500">{asset.category}</p>
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill
                        label={asset.status}
                        tone={
                          asset.status === "Operativo"
                            ? "success"
                            : asset.status === "En mantenimiento"
                              ? "warning"
                              : "danger"
                        }
                      />
                      <p className="mt-2 text-xs text-neutral-500">{asset.availability}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p>{asset.site}</p>
                      <p className="mt-1 text-xs text-neutral-500">{asset.location}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p>{asset.responsible}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {driver ? `Conductor: ${driver.name}` : "Sin asignacion"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-neutral-900">{asset.utilization}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        Alertas activas: {asset.alerts}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/activos/${asset.id}`}
                          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-sky-300 hover:text-sky-700"
                        >
                          Ver
                        </Link>
                        <Link
                          href={`/activos/${asset.id}/editar`}
                          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-sky-300 hover:text-sky-700"
                        >
                          Editar
                        </Link>
                        <Link
                          href={`/activos/${asset.id}#historial`}
                          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-sky-300 hover:text-sky-700"
                        >
                          Historial
                        </Link>
                        <Link
                          href={`/mantenimiento/nuevo?assetId=${asset.id}`}
                          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-sky-300 hover:text-sky-700"
                        >
                          Mantenimiento
                        </Link>
                      </div>
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