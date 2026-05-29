"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useFeedback } from "@/components/providers/feedback-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { masterNavigation } from "@/lib/master-navigation";

function getCurrentItem(pathname: string) {
  return masterNavigation.flatMap((section) => section.items).find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ?? masterNavigation[0].items[0];
}

export function SuperadminTopbar() {
  const router = useRouter();
  const pathname = usePathname();
  const currentItem = getCurrentItem(pathname);
  const { settings, profile, companies, leads } = usePlatform();
  const { session, logout } = useAuth();
  const { notifySuccess } = useFeedback();

  return (
    <header className="app-topbar sticky top-0 z-20 border-b border-neutral-200 px-3 py-2.5 backdrop-blur lg:px-4">
      <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-cyan-100 px-2.5 py-1 text-[11px] font-semibold text-cyan-700">ApliSmart Motors</span>
            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">Panel master</span>
          </div>
          <p className="mt-1.5 text-sm font-semibold text-neutral-900">
            Administracion master / <span className="text-neutral-600">{currentItem.label}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Empresas</p>
            <p className="mt-0.5 font-semibold text-neutral-900">{companies.filter((company) => company.status === "Activa").length} activas</p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Leads</p>
            <p className="mt-0.5 font-semibold text-neutral-900">{leads.length} oportunidades</p>
          </div>
          <div className="hidden rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm md:block">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Marca</p>
            <p className="mt-0.5 font-semibold text-neutral-900">{settings.brandTagline}</p>
          </div>
          <ThemeToggle />
          <div className="flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-2 sm:px-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white">
              {session?.name
                ?.split(" ")
                .map((chunk) => chunk[0])
                .slice(0, 2)
                .join("") ?? profile.avatar}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-neutral-950">{session?.name ?? profile.name}</p>
              <p className="text-xs text-neutral-500">{session?.title ?? profile.title}</p>
            </div>
          </div>
          <Button
            tone="neutral"
            variant="outline"
            className="px-3 py-2"
            onClick={() => {
              logout();
              notifySuccess("Sesion cerrada", "Te llevamos al acceso del panel master.");
              router.push("/login");
            }}
          >
            Salir
          </Button>
        </div>
      </div>
    </header>
  );
}
