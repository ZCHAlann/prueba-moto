"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import {
  DataExportToolbar,
  type ExportColumn,
  type ExportRow,
} from "@/components/ui/data-export-toolbar";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { getPlanName } from "@/features/master/helpers";

const exportColumns: ExportColumn[] = [
  { key: "company", label: "Cliente" },
  { key: "plan", label: "Plan" },
  { key: "status", label: "Estado" },
  { key: "executive", label: "Ejecutivo" },
  { key: "modules", label: "Módulos" },
  { key: "renewal", label: "Renovación" },
];

export function ClientsPage() {
  const { companies, plans, billing } = usePlatform();
  const [query, setQuery] = useState("");

  const clientRows = useMemo(
    () =>
      companies
        .filter((company) => company.status !== "Prospecto")
        .map((company) => ({
          ...company,
          billing: billing.find((record) => record.companyId === company.id) ?? null,
        })),
    [billing, companies]
  );

  const filteredClients = useMemo(() => {
    const value = query.trim().toLowerCase();
    return clientRows.filter((company) => {
      return (
        value.length === 0 ||
        company.name.toLowerCase().includes(value) ||
        company.primaryContact.toLowerCase().includes(value) ||
        company.executive.toLowerCase().includes(value) ||
        company.industry.toLowerCase().includes(value)
      );
    });
  }, [clientRows, query]);

  const exportRows = useMemo<ExportRow[]>(
    () =>
      filteredClients.map((client) => ({
        company: client.name,
        plan: getPlanName(plans, client.planId),
        status: client.status,
        executive: client.executive,
        modules: client.enabledModules.length,
        renewal: client.billing?.nextRenewal ?? "Sin registro",
      })),
    [filteredClients, plans]
  );

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Comercial"
        title="Clientes"
        subtitle="Base activa de clientes con plan, módulos habilitados y control de renovación."
        accent="cyan"
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/master/empresas" className="inline-flex">
              <Button tone="cyan" variant="outline" className="px-3 py-2">
                Ver empresas
              </Button>
            </Link>
            <Link href="/master/facturacion" className="inline-flex">
              <Button tone="teal" variant="solid" className="px-3 py-2">
                Facturación
              </Button>
            </Link>
          </div>
        }
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Clientes" value={clientRows.length.toString()} detail="Cartera activa" tone="info" />
        <StatCard label="Enterprise" value={clientRows.filter((company) => company.planId === "enterprise").length.toString()} detail="Cuentas premium" tone="success" />
        <StatCard label="Módulos" value={clientRows.reduce((total, company) => total + company.enabledModules.length, 0).toString()} detail="Habilitaciones acumuladas" tone="warning" />
        <StatCard label="Pendientes de pago" value={clientRows.filter((company) => company.billing?.paymentStatus !== "Al dia").length.toString()} detail="Seguimiento comercial" tone="danger" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <TableCard title="Cartera operativa" description="Relación entre plan, módulos, contacto principal y renovación.">
          <DataExportToolbar
            title="clientes-apli-smart-motors"
            columns={exportColumns}
            rows={exportRows}
            accent="cyan"
            searchValue={query}
            onSearchChange={setQuery}
            searchPlaceholder="Buscar cliente, contacto o ejecutivo"
          />

          {filteredClients.length === 0 ? (
            <EmptyState title="Sin clientes" description="No hay coincidencias para el filtro actual." />
          ) : (
            <Table minWidth="min-w-[1180px]">
              <TableHead>
                <tr>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Contacto</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Módulos</th>
                  <th className="px-4 py-3 font-semibold">Renovación</th>
                </tr>
              </TableHead>
              <TableBody>
                {filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-neutral-950">{client.name}</p>
                      <p className="mt-1 text-xs text-neutral-500">{client.industry}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p>{getPlanName(plans, client.planId)}</p>
                      <p className="mt-1 text-xs text-neutral-500">{client.executive}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p>{client.primaryContact}</p>
                      <p className="mt-1 text-xs text-neutral-500">{client.email}</p>
                    </td>
                    <td className="px-4 py-3.5">{client.status}</td>
                    <td className="px-4 py-3.5">
                      <p>{client.enabledModules.length} activos</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {client.enabledModules.slice(0, 3).join(", ")}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p>{client.billing?.nextRenewal ?? "Sin registro"}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {client.billing?.paymentStatus ?? "Pendiente de setup"}
                      </p>
                    </td>
                  </tr>
                ))}
              </TableBody>
            </Table>
          )}
        </TableCard>

        <div className="space-y-4">
          <SurfaceCard className="p-4">
            <h2 className="text-lg font-semibold text-neutral-950">Renovación cercana</h2>
            <div className="mt-4 space-y-3">
              {clientRows.slice(0, 4).map((client) => (
                <div key={client.id} className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                  <p className="text-sm font-semibold text-neutral-950">{client.name}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {client.billing?.nextRenewal ?? "Sin fecha"} / {client.billing?.amount ?? "Sin tarifa"}
                  </p>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-4">
            <h2 className="text-lg font-semibold text-neutral-950">Cuentas con más módulos</h2>
            <div className="mt-4 space-y-3">
              {[...clientRows]
                .sort((left, right) => right.enabledModules.length - left.enabledModules.length)
                .slice(0, 4)
                .map((client) => (
                  <div key={client.id} className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                    <p className="text-sm font-semibold text-neutral-950">{client.name}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {client.enabledModules.length} módulos / {getPlanName(plans, client.planId)}
                    </p>
                  </div>
                ))}
            </div>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}

