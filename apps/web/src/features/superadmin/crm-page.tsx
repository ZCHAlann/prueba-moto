"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHeading, StatCard, SurfaceCard } from "@/components/ui/surface";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";

export function CrmPage() {
  const { leads, companies, billing } = usePlatform();

  const leadCounts = useMemo(
    () => ({
      nuevo: leads.filter((lead) => lead.status === "nuevo").length,
      contactado: leads.filter((lead) => lead.status === "contactado").length,
      demo: leads.filter((lead) => lead.status === "demo agendada").length,
      propuesta: leads.filter((lead) => lead.status === "propuesta enviada").length,
      ganado: leads.filter((lead) => lead.status === "ganado").length,
      perdido: leads.filter((lead) => lead.status === "perdido").length,
    }),
    [leads]
  );

  const topIndustries = useMemo(() => {
    const counts = new Map<string, number>();
    leads.forEach((lead) => {
      counts.set(lead.industry, (counts.get(lead.industry) ?? 0) + 1);
    });
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 4);
  }, [leads]);

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Comercial"
        title="CRM comercial"
        subtitle="Embudo comercial, oportunidades, clientes y renovaciones bajo una sola lectura ejecutiva."
        accent="cyan"
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/master/leads" className="inline-flex">
              <Button tone="teal" variant="solid" className="px-3 py-2">
                Gestionar leads
              </Button>
            </Link>
            <Link href="/master/facturacion" className="inline-flex">
              <Button tone="neutral" variant="outline" className="px-3 py-2">
                Revisar facturacion
              </Button>
            </Link>
          </div>
        }
      />

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Nuevos" value={leadCounts.nuevo.toString()} detail="Entrada reciente" tone="info" />
        <StatCard label="Contactados" value={leadCounts.contactado.toString()} detail="Primer seguimiento" tone="warning" />
        <StatCard label="Demo" value={leadCounts.demo.toString()} detail="Interes calificado" tone="success" />
        <StatCard label="Propuesta" value={leadCounts.propuesta.toString()} detail="Oferta enviada" tone="warning" />
        <StatCard label="Ganados" value={leadCounts.ganado.toString()} detail="Cierre comercial" tone="success" />
        <StatCard label="Perdidos" value={leadCounts.perdido.toString()} detail="Oportunidades descartadas" tone="danger" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <TableCard
          title="Pipeline activo"
          description="Oportunidades comerciales ordenadas por avance."
          action={
            <Link href="/master/leads" className="inline-flex">
              <Button tone="cyan" variant="outline" className="px-3 py-2">
                Abrir listado
              </Button>
            </Link>
          }
        >
          <Table minWidth="min-w-[920px]">
            <TableHead>
              <tr>
                <th className="px-4 py-3 font-semibold">Lead</th>
                <th className="px-4 py-3 font-semibold">Empresa</th>
                <th className="px-4 py-3 font-semibold">Industria</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Asignado</th>
              </tr>
            </TableHead>
            <TableBody>
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-neutral-950">{lead.name}</p>
                    <p className="mt-1 text-xs text-neutral-500">{lead.email} / {lead.phone}</p>
                  </td>
                  <td className="px-4 py-3.5">{lead.company}</td>
                  <td className="px-4 py-3.5">{lead.industry}</td>
                  <td className="px-4 py-3.5">
                    <span className="rounded-lg bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-cyan-200">
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <p>{lead.assignedTo}</p>
                    <p className="mt-1 text-xs text-neutral-500">{lead.createdAt}</p>
                  </td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </TableCard>

        <div className="space-y-4">
          <SurfaceCard>
            <SectionHeading title="Clientes" description="Resumen rapido de cartera activa." />
            <div className="space-y-3 px-4 py-4">
              {companies.filter((company) => company.status !== "Prospecto").map((company) => (
                <div key={company.id} className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                  <p className="text-sm font-semibold text-neutral-950">{company.name}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {company.executive} / {company.industry}
                  </p>
                  <p className="mt-2 text-sm text-neutral-700">
                    {company.enabledModules.length} modulos / {company.status}
                  </p>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionHeading title="Industrias con mas interes" description="Donde estamos capturando mas demanda." />
            <div className="space-y-3 px-4 py-4">
              {topIndustries.length === 0 ? (
                <EmptyState title="Sin leads" description="Aun no hay industrias registradas en el CRM." />
              ) : (
                topIndustries.map(([industry, count]) => (
                  <div key={industry} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3">
                    <p className="text-sm font-semibold text-neutral-950">{industry}</p>
                    <span className="rounded-lg bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-cyan-200">
                      {count} leads
                    </span>
                  </div>
                ))
              )}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionHeading title="Proximas renovaciones" description="Facturacion que conviene cuidar desde comercial." />
            <div className="space-y-3 px-4 py-4">
              {billing.slice(0, 4).map((record) => {
                const company = companies.find((item) => item.id === record.companyId);
                return (
                  <div key={record.id} className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                    <p className="text-sm font-semibold text-neutral-950">{company?.name ?? record.companyId}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {record.amount} / {record.billingCycle}
                    </p>
                    <p className="mt-2 text-sm text-neutral-700">
                      {record.paymentStatus} / {record.nextRenewal}
                    </p>
                  </div>
                );
              })}
            </div>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}
