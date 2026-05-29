"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import { EmptyState, SectionHeading, StatCard, SurfaceCard } from "@/components/ui/surface";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { getPlanName, roleLabelMap } from "@/features/master/helpers";

export function SuperadminDashboardPage() {
  const { companies, globalUsers, plans, modules, leads, billing, logs } = usePlatform();

  const activeCompanies = companies.filter((company) => company.status === "Activa");
  const activePlans = new Set(activeCompanies.map((company) => company.planId)).size;
  const pendingRenewals = billing.filter((record) => record.paymentStatus !== "Al dia");
  const criticalLogs = logs.filter((log) => log.severity === "critical");

  const moduleUsage = useMemo(() => {
    const counts = modules.map((module) => ({
      key: module.key,
      name: module.name,
      enabled: companies.filter((company) => company.enabledModules.includes(module.key)).length,
    }));

    return counts.sort((left, right) => right.enabled - left.enabled).slice(0, 6);
  }, [companies, modules]);

  const pipeline = useMemo(
    () => ({
      nuevo: leads.filter((lead) => lead.status === "nuevo").length,
      demos: leads.filter((lead) => lead.status === "demo agendada").length,
      propuestas: leads.filter((lead) => lead.status === "propuesta enviada").length,
      ganados: leads.filter((lead) => lead.status === "ganado").length,
    }),
    [leads]
  );

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Panel master"
        title="Centro ejecutivo"
        subtitle="Control de empresas, planes, ventas y salud general de ApliSmart Motors."
        accent="cyan"
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/master/leads" className="inline-flex">
              <Button tone="teal" variant="solid" className="px-3 py-2">
                Revisar leads
              </Button>
            </Link>
            <Link href="/master/contenido" className="inline-flex">
              <Button tone="neutral" variant="outline" className="px-3 py-2">
                Editar contenido publico
              </Button>
            </Link>
          </div>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Empresas activas" value={activeCompanies.length.toString()} detail="Clientes y cuentas en curso" tone="success" />
        <StatCard label="Usuarios globales" value={globalUsers.length.toString()} detail="Plataforma y clientes" tone="info" />
        <StatCard label="Planes activos" value={activePlans.toString()} detail="Oferta ya desplegada" tone="warning" />
        <StatCard label="Solicitudes demo" value={leads.length.toString()} detail="Embudo comercial visible" tone="danger" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <TableCard
          title="Empresas y cuentas"
          description="Estado, plan, contacto principal y modulos visibles por empresa."
          action={
            <Link href="/master/empresas" className="inline-flex">
              <Button tone="cyan" variant="outline" className="px-3 py-2">
                Gestionar empresas
              </Button>
            </Link>
          }
        >
          <Table minWidth="min-w-[980px]">
            <TableHead>
              <tr>
                <th className="px-4 py-3 font-semibold">Empresa</th>
                <th className="px-4 py-3 font-semibold">Plan</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Contacto</th>
                <th className="px-4 py-3 font-semibold">Ejecutivo</th>
                <th className="px-4 py-3 font-semibold">Modulos</th>
              </tr>
            </TableHead>
            <TableBody>
              {companies.map((company) => (
                <tr key={company.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-neutral-950">{company.name}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      Pagina: /{company.slug} / {company.industry}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">{getPlanName(plans, company.planId)}</td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                        company.status === "Activa"
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : company.status === "Prospecto"
                            ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                            : "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200"
                      }`}
                    >
                      {company.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <p>{company.primaryContact}</p>
                    <p className="mt-1 text-xs text-neutral-500">{company.email}</p>
                  </td>
                  <td className="px-4 py-3.5">{company.executive}</td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-neutral-950">
                      {company.enabledModules.length} habilitados
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {company.enabledModules.slice(0, 3).join(", ")}
                    </p>
                  </td>
                </tr>
              ))}
            </TableBody>
          </Table>
        </TableCard>

        <div className="space-y-4">
          <SurfaceCard>
            <SectionHeading title="Embudo comercial" description="Estado actual de leads y avance del pipeline." />
            <div className="grid gap-3 px-4 py-4">
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-sm font-semibold text-neutral-950">Nuevos</p>
                <p className="mt-2 text-2xl font-bold text-neutral-950">{pipeline.nuevo}</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-sm font-semibold text-neutral-950">Demos agendadas</p>
                <p className="mt-2 text-2xl font-bold text-neutral-950">{pipeline.demos}</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-sm font-semibold text-neutral-950">Propuestas enviadas</p>
                <p className="mt-2 text-2xl font-bold text-neutral-950">{pipeline.propuestas}</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-sm font-semibold text-neutral-950">Ganados</p>
                <p className="mt-2 text-2xl font-bold text-neutral-950">{pipeline.ganados}</p>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionHeading title="Renovaciones y pagos" description="Clientes que requieren seguimiento inmediato." />
            <div className="space-y-3 px-4 py-4">
              {pendingRenewals.length === 0 ? (
                <EmptyState title="Sin alertas de facturacion" description="No hay renovaciones criticas por revisar ahora." />
              ) : (
                pendingRenewals.map((record) => {
                  const company = companies.find((item) => item.id === record.companyId);
                  return (
                    <div key={record.id} className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                      <p className="text-sm font-semibold text-neutral-950">
                        {company?.name ?? record.companyId}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {record.amount} / {record.billingCycle}
                      </p>
                      <p className="mt-2 text-sm text-neutral-700">
                        {record.paymentStatus} / Proxima renovacion {record.nextRenewal}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </SurfaceCard>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SurfaceCard>
          <SectionHeading title="Alertas de plataforma" description="Eventos delicados para la operacion comercial y administrativa." />
          <div className="space-y-3 px-4 py-4">
            {criticalLogs.length === 0 ? (
              <EmptyState title="Plataforma estable" description="No hay eventos criticos registrados." />
            ) : (
              criticalLogs.map((log) => (
                <div key={log.id} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
                  <p className="text-sm font-semibold text-rose-900">{log.entity}</p>
                  <p className="mt-1 text-sm text-rose-800">{log.detail}</p>
                  <p className="mt-2 text-xs text-rose-700">{log.at}</p>
                </div>
              ))
            )}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeading title="Adopcion de modulos" description="Modulos mas habilitados por empresa." />
          <div className="space-y-3 px-4 py-4">
            {moduleUsage.map((module) => (
              <div key={module.key} className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-neutral-950">{module.name}</p>
                  <span className="rounded-lg bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-cyan-200">
                    {module.enabled} empresas
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeading title="Roles visibles" description="Separacion clara entre plataforma y operacion." />
          <div className="space-y-3 px-4 py-4">
            {globalUsers.map((user) => (
              <div key={user.id} className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">{user.name}</p>
                    <p className="mt-1 text-xs text-neutral-500">{user.title}</p>
                  </div>
                  <span
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                      user.companyId
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
                    }`}
                  >
                    {roleLabelMap[user.role]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}
