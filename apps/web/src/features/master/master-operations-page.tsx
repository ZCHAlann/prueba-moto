"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePlatform } from "@/components/providers/platform-provider";
import { EmptyState, StatCard, SurfaceCard } from "@/components/ui/surface";
import { Table, TableBody, TableCard, TableHead } from "@/components/ui/table";
import { ModulePageHeader } from "@/features/modules/module-page-header";
import { getPlanName } from "@/features/master/helpers";
import type { PlatformModuleKey } from "@/types/platform";

type MasterOperationsPageProps = {
  selectedSlug?: string;
};

const operationModules: Array<{
  slug: string;
  key: PlatformModuleKey;
  title: string;
  description: string;
}> = [
  { slug: "flotas", key: "flotas", title: "Flotas", description: "Vehiculos, estado operativo y disponibilidad por empresa." },
  { slug: "motores", key: "motores", title: "Motores", description: "Motores, datos tecnicos y mantenimiento asociado." },
  { slug: "generadores", key: "generadores", title: "Generadores", description: "Equipos de respaldo electrico y control por sede." },
  { slug: "conductores", key: "conductores", title: "Conductores", description: "Personal, licencias, vigencias y estado." },
  { slug: "asignaciones", key: "asignaciones", title: "Asignaciones", description: "Relacion entre vehiculos, responsables y actas." },
  { slug: "sedes", key: "configuracion", title: "Sedes", description: "Bases operativas, patios, plantas y puntos de control." },
  { slug: "seguros", key: "seguros", title: "Seguros", description: "Polizas, vencimientos y seguimiento documental." },
  { slug: "aceites", key: "tipos_aceite", title: "Tipos de aceite", description: "Catalogo tecnico por vehiculo, motor o generador." },
  { slug: "mantenimiento", key: "mantenimiento", title: "Mantenimiento", description: "Preventivo, correctivo, fechas, responsables y notas." },
  { slug: "inventario", key: "mantenimiento", title: "Inventario", description: "Repuestos, stock y uso de materiales." },
  { slug: "checklist", key: "checklist", title: "Checklist", description: "Inspecciones operativas y evidencias." },
  { slug: "alertas", key: "alertas", title: "Alertas", description: "Vencimientos, avisos manuales y criticidad." },
  { slug: "reportes", key: "reportes", title: "Reportes", description: "Salidas ejecutivas, exportaciones e impresion." },
  { slug: "combustible", key: "combustible", title: "Combustible", description: "Consumo, costo y rendimiento por activo." },
  { slug: "geolocalizacion", key: "geolocalizacion", title: "Geolocalizacion", description: "Mapa, busqueda de unidades e integracion Google Maps." },
  { slug: "configuracion", key: "configuracion", title: "Configuracion empresa", description: "Preferencias, roles, modulos y datos de integracion." },
];

export function MasterOperationsPage({ selectedSlug }: MasterOperationsPageProps) {
  const { companies, plans, modules } = usePlatform();
  const selectedModule = operationModules.find((item) => item.slug === selectedSlug);
  const activeCompanies = companies.filter((company) => company.status === "Activa");

  const moduleRows = useMemo(() => {
    return operationModules.map((operation) => {
      const enabledCompanies = companies.filter((company) =>
        company.enabledModules.includes(operation.key)
      );

      return {
        ...operation,
        moduleName: modules.find((module) => module.key === operation.key)?.name ?? operation.title,
        enabledCompanies,
      };
    });
  }, [companies, modules]);

  const visibleRows = selectedModule
    ? moduleRows.filter((row) => row.slug === selectedModule.slug)
    : moduleRows;

  return (
    <div className="space-y-4">
      <ModulePageHeader
        badge="Operacion completa"
        title={selectedModule ? selectedModule.title : "Supervision operativa"}
        subtitle="Vista master para revisar modulos operativos sin salir del panel administrativo."
        accent="cyan"
      />

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Empresas activas" value={activeCompanies.length.toString()} detail="Clientes operando" tone="success" />
        <StatCard label="Modulos" value={operationModules.length.toString()} detail="Cobertura operativa" tone="info" />
        <StatCard label="Habilitaciones" value={companies.reduce((total, company) => total + company.enabledModules.length, 0).toString()} detail="Modulos asignados" tone="warning" />
        <StatCard label="Panel" value="Master" detail="Sin cambio al panel cliente" tone="neutral" />
      </section>

      <SurfaceCard className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Modulos operativos supervisados</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Usa esta vista para revisar cobertura por empresa. Para operar como cliente, entra por el acceso operativo correspondiente.
            </p>
          </div>
          <Link
            href="/master/empresas"
            className="inline-flex items-center justify-center rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-600"
          >
            Gestionar empresas
          </Link>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {operationModules.slice(0, 8).map((item) => (
            <Link
              key={item.slug}
              href={`/master/operacion/${item.slug}`}
              className={`rounded-lg border px-4 py-3 transition ${
                selectedModule?.slug === item.slug
                  ? "border-cyan-200 bg-cyan-50 text-cyan-800"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-cyan-200 hover:bg-cyan-50"
              }`}
            >
              <p className="font-semibold">{item.title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">{item.description}</p>
            </Link>
          ))}
        </div>
      </SurfaceCard>

      <TableCard
        title="Cobertura por empresa"
        description="Resumen administrativo de modulos habilitados sin abandonar el panel master."
      >
        {companies.length === 0 ? (
          <EmptyState
            title="Sin empresas registradas"
            description="Crea la primera empresa cliente desde Empresas para empezar a habilitar modulos operativos."
            action={
              <Link
                href="/master/empresas"
                className="inline-flex items-center justify-center rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-600"
              >
                Crear empresa
              </Link>
            }
          />
        ) : (
          <Table minWidth="min-w-[980px]">
            <TableHead>
              <tr>
                <th className="px-4 py-3 font-semibold">Modulo</th>
                <th className="px-4 py-3 font-semibold">Descripcion</th>
                <th className="px-4 py-3 font-semibold">Empresas con acceso</th>
                <th className="px-4 py-3 font-semibold">Planes asociados</th>
              </tr>
            </TableHead>
            <TableBody>
              {visibleRows.map((row) => (
                <tr key={row.slug} className="hover:bg-neutral-50">
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-neutral-950">{row.title}</p>
                    <p className="mt-1 text-xs text-neutral-500">{row.moduleName}</p>
                  </td>
                  <td className="px-4 py-3.5 text-neutral-700">{row.description}</td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-neutral-950">{row.enabledCompanies.length} empresas</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {row.enabledCompanies.length
                        ? row.enabledCompanies.slice(0, 3).map((company) => company.name).join(", ")
                        : "Sin habilitaciones"}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-neutral-700">
                    {row.enabledCompanies.length
                      ? Array.from(new Set(row.enabledCompanies.map((company) => getPlanName(plans, company.planId)))).join(", ")
                      : "Pendiente"}
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
