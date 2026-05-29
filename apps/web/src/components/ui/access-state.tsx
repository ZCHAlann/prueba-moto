"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SurfaceCard } from "@/components/ui/surface";

export function AppLoadingState({
  title = "Validando acceso",
  description = "Estamos preparando tu sesion para mostrarte la ruta correcta.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-[760px] items-center justify-center px-4 py-10">
      <SurfaceCard className="w-full p-8 text-center">
        <span className="mx-auto inline-flex h-12 w-12 animate-spin rounded-full border-4 border-teal-200 border-r-teal-500" />
        <h1 className="mt-5 text-2xl font-bold text-neutral-950">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">{description}</p>
      </SurfaceCard>
    </div>
  );
}

export function AccessDeniedState({
  title = "Acceso denegado",
  description,
  homeHref,
  homeLabel,
}: {
  title?: string;
  description: string;
  homeHref: string;
  homeLabel: string;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-[860px] items-center justify-center px-4 py-10">
      <SurfaceCard className="w-full p-8">
        <div className="inline-flex rounded-lg bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
          Restriccion por rol
        </div>
        <h1 className="mt-5 text-3xl font-bold text-neutral-950">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">{description}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={homeHref} className="inline-flex">
            <Button tone="teal" variant="solid">
              {homeLabel}
            </Button>
          </Link>
          <Link href="/perfil" className="inline-flex">
            <Button tone="neutral" variant="outline">
              Ver mi perfil
            </Button>
          </Link>
        </div>
      </SurfaceCard>
    </div>
  );
}
