"use client";

import Link from "next/link";
import { useAssets } from "@/hooks/useAssets";
import { useDrivers } from "@/hooks/useDrivers";
import { useAssignments } from "@/hooks/useAssignments";
import { StatCard } from "@/components/ui/surface";
import { ModulePageHeader } from "@/features/modules/module-page-header";

const cards = [
  {
    title: "Conductores",
    description: "Listado operativo con alta, edicion y baja controlada.",
    href: "/operaciones/conductores",
  },
  {
    title: "Asignaciones",
    description: "Relacion activa entre conductor y vehiculo con historial.",
    href: "/operaciones/asignaciones",
  },
];

export function OperationsHubPage() {
  const { drivers } = useDrivers();
  const { assignments } = useAssignments();
  const { assets } = useAssets();

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Centro operativo"
        title="Operaciones"
        subtitle="Gestiona la capa humana y la asignacion diaria de vehiculos sin salir del flujo operativo."
        accent="cyan"
      />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Conductores"
          value={drivers.length.toString()}
          detail="Base de operadores disponible"
          tone="info"
        />
        <StatCard
          label="Asignaciones activas"
          value={assignments.filter((item) => item.status === "Activa").length.toString()}
          detail="Relaciones en curso"
          tone="success"
        />
        <StatCard
          label="Vehiculos disponibles"
          value={assets.filter((asset) => asset.status === "Operativo").length.toString()}
          detail="Listos para despacho"
          tone="warning"
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300"
          >
            <p className="text-lg font-semibold text-neutral-950">{card.title}</p>
            <p className="mt-2 text-sm leading-6 text-neutral-600">{card.description}</p>
            <p className="mt-4 text-sm font-semibold text-cyan-700">Abrir modulo</p>
          </Link>
        ))}
      </section>
    </div>
  );
}

