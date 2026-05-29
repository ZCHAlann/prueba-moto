"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useSidebar } from "@/components/context/SidebarContext";
import { useFleetOps } from "@/components/providers/fleetops-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { useFeedback } from "@/components/providers/feedback-provider";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getNavigationItem, getNavigationSection } from "@/lib/navigation";

function HamburgerIcon() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M0.583252 1C0.583252 0.585788 0.919038 0.25 1.33325 0.25H14.6666C15.0808 0.25 15.4166 0.585786 15.4166 1C15.4166 1.41421 15.0808 1.75 14.6666 1.75L1.33325 1.75C0.919038 1.75 0.583252 1.41422 0.583252 1ZM0.583252 11C0.583252 10.5858 0.919038 10.25 1.33325 10.25L14.6666 10.25C15.0808 10.25 15.4166 10.5858 15.4166 11C15.4166 11.4142 15.0808 11.75 14.6666 11.75L1.33325 11.75C0.919038 11.75 0.583252 11.4142 0.583252 11ZM1.33325 5.25C0.919038 5.25 0.583252 5.58579 0.583252 6C0.583252 6.41421 0.919038 6.75 1.33325 6.75L7.99992 6.75C8.41413 6.75 8.74992 6.41421 8.74992 6C8.74992 5.58579 8.41413 5.25 7.99992 5.25L1.33325 5.25Z" fill="currentColor" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="fill-gray-500 dark:fill-gray-400" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.003 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z" fill="" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function Topbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const { toggleSidebar, toggleMobileSidebar } = useSidebar();
  const { session, logout } = useAuth(); 
  const { confirmAction } = useFeedback();

  const currentItem = getNavigationItem(pathname);
  const currentSection = getNavigationSection(pathname);
  const canSwitchTenant = session?.role === "superadmin";

  const displayName = session?.name ?? "";
  const displayTitle = session?.title ?? session?.roleLabel ?? "";
  const companyName = session?.companyName ?? "";

  const initials = displayName
    .split(" ")
    .map((chunk: string) => chunk[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleLogout = async () => {
    const confirmed = await confirmAction({
      title: "Cerrar sesion",
      description: "Se cerrara tu sesion operativa y volveras al portal de acceso.",
      confirmLabel: "Salir",
      cancelLabel: "Permanecer",
      accent: "teal",
      successTitle: "Sesion cerrada",
      successDescription: "Tu sesion fue cerrada correctamente.",
      summary: [
        { label: "Usuario", value: displayName },
        { label: "Empresa", value: companyName },
      ],
      action: async () => { logout(); },
    });
    if (confirmed) router.push("/login");
  };

  return (
    <header className="app-topbar sticky top-0 z-20 flex w-full">
      <div className="flex items-center justify-between w-full px-3 py-3 lg:px-6">

        {/* ── Left ── */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={toggleMobileSidebar}
            className="flex lg:hidden items-center justify-center w-10 h-10 rounded-full border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
            aria-label="Abrir menú">
            <HamburgerIcon />
          </button>
          <div className="hidden lg:block">
            <div className="relative">
              <span className="absolute -translate-y-1/2 left-4 top-1/2 pointer-events-none"><SearchIcon /></span>
              <input type="text" value={searchValue} onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Buscar..."
                className="h-11 w-[430px] rounded-full border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:border-white/10 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs text-gray-400 dark:border-white/10 dark:bg-white/5 dark:text-gray-500">
                ⌘ K
              </span>
            </div>
          </div>
          <div className="hidden sm:block lg:hidden min-w-0">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
              {currentSection.label}
              <span className="mx-1.5 text-gray-300 dark:text-gray-600">/</span>
              <span className="text-gray-800 dark:text-gray-200 font-semibold">{currentItem.label}</span>
            </p>
          </div>
        </div>

        {/* ── Right ── */}
        <div className="flex items-center gap-2">

          {/* Empresa — superadmin no tiene selector de tenant por ahora, solo muestra el nombre */}
          <div className="hidden sm:flex flex-col rounded-lg border border-gray-200 dark:border-white/10 px-3 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Empresa</p>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-500 truncate max-w-[140px]">
              {companyName || (canSwitchTenant ? "Plataforma" : "—")}
            </p>
          </div>

          <ThemeToggle />

          <button type="button" aria-label="Notificaciones"
            className="relative flex items-center justify-center w-10 h-10 rounded-full border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
            <span className="absolute right-1.5 top-1.5 z-10 h-2 w-2 rounded-full bg-error-500" />
            <BellIcon />
          </button>

          <div className="relative">
            <button type="button" onClick={() => setUserMenuOpen((v) => !v)} aria-expanded={userMenuOpen}
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                {initials}
              </span>
              <span className="hidden sm:block font-medium text-sm text-gray-700 dark:text-gray-300">
                {displayName}
              </span>
              <span className="text-gray-400 dark:text-gray-500"><ChevronDownIcon /></span>
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} aria-hidden="true" />
                <div className="absolute right-0 z-20 mt-2 w-[240px] flex flex-col rounded-xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-white/10 dark:bg-[#1a2535]">
                  <div className="px-3 py-2 mb-1">
                    <span className="block font-semibold text-gray-800 text-sm dark:text-gray-100">{displayName}</span>
                    <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{displayTitle}</span>
                  </div>
                  <div className="border-t border-gray-100 dark:border-white/10 my-1" />
                  <Link href="/perfil" onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200 transition-colors">
                    Mi perfil
                  </Link>
                  <Link href="/configuracion" onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200 transition-colors">
                    Configuracion
                  </Link>
                  <div className="border-t border-gray-100 dark:border-white/10 my-1" />
                  <button type="button"
                    onClick={async () => { setUserMenuOpen(false); await handleLogout(); }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-error-600 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-900/20 transition-colors">
                    Cerrar sesion
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}