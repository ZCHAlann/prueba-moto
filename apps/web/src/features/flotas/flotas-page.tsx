"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFeedback } from "@/components/providers/feedback-provider";
import { useAssets } from "@/hooks/useAssets";
import { Button } from "@/components/ui/button";
import {
  DataExportToolbar,
  type ExportColumn,
  type ExportRow,
} from "@/components/ui/data-export-toolbar";
import { SelectField } from "@/components/ui/form-controls";
import { EmptyState, StatCard } from "@/components/ui/surface";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";

const exportColumns: ExportColumn[] = [
  { key: "plate", label: "Placa" },
  { key: "vehicle", label: "Vehiculo" },
  { key: "type", label: "Tipo" },
  { key: "site", label: "Sede" },
  { key: "responsible", label: "Responsable" },
  { key: "status", label: "Estado" },
  { key: "fuelOil", label: "Combustible / aceite" },
];

export function FlotasPage() {
  const { assets, deleteAsset } = useAssets();
  const { confirmAction } = useFeedback();
  const vehicles = useMemo(() => assets.filter((item) => item.assetType === "Vehiculo"), [assets]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos");
  const [category, setCategory] = useState("Todos");

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return vehicles.filter((vehicle) => {
      const matchesQuery =
        value.length === 0 ||
        vehicle.plate.toLowerCase().includes(value) ||
        vehicle.brand.toLowerCase().includes(value) ||
        vehicle.model.toLowerCase().includes(value) ||
        vehicle.responsible.toLowerCase().includes(value) ||
        vehicle.site.toLowerCase().includes(value);
      const matchesStatus = status === "Todos" || vehicle.status === status;
      const matchesCategory = category === "Todos" || vehicle.category === category;
      return matchesQuery && matchesStatus && matchesCategory;
    });
  }, [category, query, status, vehicles]);

  const exportRows = filtered.map<ExportRow>((vehicle) => ({
    plate: vehicle.plate,
    vehicle: `${vehicle.brand} ${vehicle.model}`,
    type: vehicle.category,
    site: vehicle.site,
    responsible: vehicle.responsible,
    status: vehicle.status,
    fuelOil: `${vehicle.fuelType} / ${vehicle.oilType}`,
  }));

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Gestion vehicular"
        title="Flotas"
        subtitle="Centro operativo de vehiculos con menos scroll lateral y filtros compactos en la misma barra de trabajo."
        accent="sky"
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Vehiculos" value={vehicles.length.toString()} detail="Base total de la empresa" tone="info" />
        <StatCard label="Operativos" value={vehicles.filter((item) => item.status === "Operativo").length.toString()} detail="Listos para despacho" tone="success" />
        <StatCard label="En mantenimiento" value={vehicles.filter((item) => item.status === "En mantenimiento").length.toString()} detail="Con restriccion tecnica" tone="warning" />
        <StatCard label="Fuera de servicio" value={vehicles.filter((item) => item.status === "Fuera de servicio").length.toString()} detail="Detenidos por novedad" tone="danger" />
      </section>

      <TableCard title="Vehiculos operativos" description="Tabla principal de flota con filtros integrados y acciones mas visibles.">
        <DataExportToolbar
          title="Flotas"
          columns={exportColumns}
          rows={exportRows}
          accent="sky"
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Buscar por placa, marca, responsable o sede"
          leadingContent={
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/flotas/nuevo" className="inline-flex">
                <Button tone="sky" variant="solid" className="px-3 py-2">
                  Nuevo vehiculo
                </Button>
              </Link>
              <Link href="/gestion/sedes" className="inline-flex">
                <Button tone="neutral" variant="outline" className="px-3 py-2">
                  Gestionar sedes
                </Button>
              </Link>
            </div>
          }
          extraContent={
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[180px_180px]">
              <SelectField
                label="Estado"
                value={status}
                onChange={setStatus}
                accent="sky"
                options={[
                  { value: "Todos", label: "Todos" },
                  { value: "Operativo", label: "Operativo" },
                  { value: "En mantenimiento", label: "En mantenimiento" },
                  { value: "Fuera de servicio", label: "Fuera de servicio" },
                ]}
              />
              <SelectField
                label="Tipo"
                value={category}
                onChange={setCategory}
                accent="sky"
                options={[
                  { value: "Todos", label: "Todos" },
                  { value: "Camion", label: "Camion" },
                  { value: "Camioneta", label: "Camioneta" },
                  { value: "SUV", label: "SUV" },
                  { value: "Furgon", label: "Furgon" },
                  { value: "Bus", label: "Bus" },
                  { value: "Volqueta", label: "Volqueta" },
                ]}
              />
            </div>
          }
        />

        {filtered.length === 0 ? (
          <EmptyState title="Sin vehiculos" description="No hay coincidencias para los filtros seleccionados en la flota actual." />
        ) : (
          <Table minWidth="min-w-[1180px]">
            <TableHead>
              <tr>
                <th className="px-4 py-3 font-semibold">#</th>
                <th className="px-4 py-3 font-semibold">Placa</th>
                <th className="px-4 py-3 font-semibold">Vehiculo</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Sede</th>
                <th className="px-4 py-3 font-semibold">Responsable</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Combustible / aceite</th>
                <th className="px-4 py-3 font-semibold">Acciones</th>
              </tr>
            </TableHead>
            <TableBody>
              {filtered.map((vehicle, index) => (
                <tr key={vehicle.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3.5 font-semibold text-neutral-500">{index + 1}</td>
                  <td className="px-4 py-3.5 font-semibold text-neutral-950">{vehicle.plate}</td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-neutral-950">{vehicle.brand} {vehicle.model}</p>
                    <p className="mt-1 text-xs text-neutral-500">{vehicle.year} / Chasis {vehicle.serial}</p>
                  </td>
                  <td className="px-4 py-3.5">{vehicle.category}</td>
                  <td className="px-4 py-3.5">
                    <p>{vehicle.site}</p>
                    <p className="mt-1 text-xs text-neutral-500">{vehicle.location}</p>
                  </td>
                  <td className="px-4 py-3.5">{vehicle.responsible}</td>
                  <td className="px-4 py-3.5">
                    <StatusPill label={vehicle.status} tone={vehicle.status === "Operativo" ? "success" : vehicle.status === "En mantenimiento" ? "warning" : "danger"} />
                  </td>
                  <td className="px-4 py-3.5">
                    <p>{vehicle.fuelType}</p>
                    <p className="mt-1 text-xs text-neutral-500">{vehicle.oilType} / {vehicle.oilCapacity}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/flotas/${vehicle.id}`} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-sky-300 hover:text-sky-700">Ver</Link>
                      <Link href={`/flotas/${vehicle.id}/editar`} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-sky-300 hover:text-sky-700">Editar</Link>
                      <Link href={`/mantenimiento/nuevo?assetId=${vehicle.id}`} className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50">Mantenimiento</Link>
                      <button
                        type="button"
                        onClick={async () => {
                          await confirmAction({
                            title: "Eliminar vehiculo",
                            description: "Se eliminara la unidad de la base de flota junto con sus relaciones operativas visibles.",
                            confirmLabel: "Eliminar vehiculo",
                            accent: "rose",
                            successTitle: "Vehiculo eliminado",
                            successDescription: "La unidad ya no aparece en la flota activa.",
                            summary: [
                              { label: "Placa", value: vehicle.plate },
                              { label: "Vehiculo", value: `${vehicle.brand} ${vehicle.model}` },
                              { label: "Responsable", value: vehicle.responsible },
                              { label: "Estado", value: vehicle.status },
                            ],
                            action: async () => {
                              deleteAsset(vehicle.id);
                            },
                          });
                        }}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </TableBody>
          </Table>
        )}
      </TableCard>
    </div>
  );
}
