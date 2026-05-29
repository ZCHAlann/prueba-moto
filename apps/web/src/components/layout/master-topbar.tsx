"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useFeedback } from "@/components/providers/feedback-provider";
import { usePlatform } from "@/components/providers/platform-provider";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { masterNavigation } from "@/lib/master-navigation";

function getCurrentItem(pathname: string) {
  return masterNavigation.flatMap((section) => section.items).find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ?? masterNavigation[0].items[0];
}

export function MasterTopbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const currentItem = getCurrentItem(pathname);
  const { settings, profile, companies, leads } = usePlatform();
  const { session, logout } = useAuth();
  const { confirmAction } = useFeedback();
  const displayName = session?.name ?? profile.name;
  const displayTitle = session?.title ?? profile.title;
  const initials =
    session?.name
      ?.split(" ")
      .map((chunk) => chunk[0])
      .slice(0, 2)
      .join("") ?? profile.avatar;

  const handleLogout = async () => {
    const confirmed = await confirmAction({
      title: "Cerrar sesion master",
      description: "Se cerrara tu sesion actual y volveras al acceso del panel master.",
      confirmLabel: "Salir",
      cancelLabel: "Permanecer",
      accent: "cyan",
      successTitle: "Sesion cerrada",
      successDescription: "Tu acceso master fue cerrado correctamente.",
      summary: [
        { label: "Usuario", value: displayName },
        { label: "Panel", value: "Master" },
      ],
      action: async () => {
        logout();
      },
    });

    if (confirmed) {
      router.push("/login");
    }
  };

  return (
    <header className="app-topbar sticky top-0 z-20 border-b border-neutral-200 px-3 py-2 backdrop-blur lg:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 shrink-0">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-cyan-100 px-2.5 py-1 text-[11px] font-semibold text-cyan-700">ApliSmart Motors</span>
            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">Master</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-neutral-900">
            Administracion master / <span className="text-neutral-600">{currentItem.label}</span>
          </p>
        </div>

        <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
          <div className="hidden rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm md:block">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Empresas</p>
            <p className="font-semibold text-neutral-900">{companies.filter((company) => company.status === "Activa").length} activas</p>
          </div>
          <div className="hidden rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Leads</p>
            <p className="font-semibold text-neutral-900">{leads.length} oportunidades</p>
          </div>
          <div className="hidden max-w-[230px] rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm 2xl:block">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Marca</p>
            <p className="truncate font-semibold text-neutral-900">{settings.brandTagline}</p>
          </div>
          <ThemeToggle />
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((current) => !current)}
              className="flex min-w-0 items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-2 text-left shadow-sm transition hover:border-cyan-300 sm:px-3"
              aria-expanded={userMenuOpen}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-bold text-white">
                {initials}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block truncate text-sm font-semibold text-neutral-950">{displayName}</span>
                <span className="block truncate text-xs text-neutral-500">{displayTitle}</span>
              </span>
              <span className="text-xs text-neutral-500">v</span>
            </button>

            {userMenuOpen ? (
              <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl">
                <div className="border-b border-neutral-100 px-4 py-3">
                  <p className="text-sm font-semibold text-neutral-950">{displayName}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{displayTitle}</p>
                </div>
                <Link
                  href="/master/configuracion"
                  onClick={() => setUserMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Editar cuenta master
                </Link>
                <Link
                  href="/master/usuarios"
                  onClick={() => setUserMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Usuarios del panel
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    setUserMenuOpen(false);
                    await handleLogout();
                  }}
                  className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50"
                >
                  Cerrar sesion
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
