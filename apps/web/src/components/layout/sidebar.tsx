"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppLogo } from "@/components/layout/app-logo";
import { useSidebar } from "@/components/context/SidebarContext";
import { useAuth } from "@/components/providers/auth-provider";
import { filterOperationalNavigation } from "@/lib/access-control";
import type { PlatformModuleKey } from "@/types/platform";
import { isRouteActive, navigationSections } from "@/lib/navigation";
import { useTheme } from "@/components/providers/theme-provider";
import {
  LayoutGrid,
  User,
  List,
  Table2,
  MapPin,
  PieChart,
  FileText,
  Box,
  Plug,
  Calendar,
  Bell,
  BookOpen,
  ClipboardList,
  Folder,
  Package,
  Zap,
  Users,
  ChevronDown,
  MoreHorizontal,
  Pin,
  PinOff,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  DB: LayoutGrid,
  AC: User,
  GS: Package,
  MT: Zap,
  GE: Zap,
  MN: ClipboardList,
  CK: List,
  AL: Bell,
  RP: PieChart,
  CB: BookOpen,
  GL: MapPin,
  CT: Users,
  US: User,
  RL: List,
  FL: Box,
  CD: User,
  SD: Folder,
  GJ: Folder,
  AS: Table2,
  SG: BookOpen,
  TA: BookOpen,
  LM: List,
  NM: Zap,
  MM: ClipboardList,
  HM: Calendar,
  GN: Zap,
  LA: List,
  NA: Zap,
  MA: ClipboardList,
  HA: Calendar,
  PC: ClipboardList,
  IV: Package,
  CA: BookOpen,
  VA: BookOpen,
  RC: BookOpen,
  KM: Table2,
  CC: List,
  PF: User,
  CF: Plug,
  RG: PieChart,
  GR: BookOpen,
  RI: Table2,
  default: FileText,
};

function getIcon(code: string) {
  const Icon = ICON_MAP[code] ?? ICON_MAP.default;
  return <Icon size={20} strokeWidth={1.5} />;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* SidebarContent                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */
function SidebarContent({
  onNavigate,
  forceShowLabels,
  pinned,
}: {
  onNavigate?: () => void;
  forceShowLabels?: boolean;
  pinned?: boolean;
}) {
  const pathname = usePathname();
  const { session } = useAuth();
  const { isMobileOpen, toggleSidebar } = useSidebar();
  const { theme } = useTheme();

  const showLabels = forceShowLabels ?? isMobileOpen;

  const sections = React.useMemo(
    () =>
      filterOperationalNavigation(
        navigationSections,
        session?.role ?? null,
        (session?.modulePermissions ?? []) as PlatformModuleKey[]
      ),
    [session?.role, session?.modulePermissions]
  );

  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<number, number>>({});
  const subMenuRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const isActive = useCallback(
    (href: string) => isRouteActive(pathname, href),
    [pathname]
  );

  useEffect(() => {
    let matched = false;
    sections.forEach((section, idx) => {
      if (section.items.length > 1 && section.items.some((i) => isActive(i.href))) {
        setOpenSubmenu(idx);
        matched = true;
      }
    });
    if (!matched) setOpenSubmenu(null);
  }, [pathname, sections, isActive]);

  useEffect(() => {
    if (openSubmenu !== null && subMenuRefs.current[openSubmenu]) {
      setSubMenuHeight((prev) => ({
        ...prev,
        [openSubmenu]: subMenuRefs.current[openSubmenu]?.scrollHeight ?? 0,
      }));
    }
  }, [openSubmenu]);

  const handleToggle = (idx: number) => {
    setOpenSubmenu((prev) => (prev === idx ? null : idx));
  };

  const showClass = pinned || showLabels
    ? "block"
    : "hidden lg:group-hover/sidebar:block";

  const hideClass = pinned || showLabels
    ? "hidden"
    : "lg:block hidden lg:group-hover/sidebar:hidden";

  const justifyClass = pinned || showLabels
    ? "justify-start"
    : "justify-center lg:group-hover/sidebar:justify-start";

  return (
    <>
      {/* ── Logo ── */}
      <div className={`py-8 flex items-center ${justifyClass} relative`}>
        <span className={hideClass}>
          <AppLogo href="/dashboard" name="" tagline="" theme={theme} compact mark="icon" showTagline={false} />
        </span>
        <span className={showClass}>
          <AppLogo href="/dashboard" name="ApliSmart Motors" tagline="" theme={theme} compact mark="full" showTagline={false} />
        </span>

        <button
          type="button"
          onClick={toggleSidebar}
          className={`absolute right-0 flex items-center justify-center w-7 h-7 rounded-full border border-gray-200 dark:border-white/10 text-gray-400 hover:text-brand-500 hover:border-brand-400 transition-colors ${pinned || showLabels ? "opacity-100" : "hidden lg:group-hover/sidebar:flex"}`}
          aria-label={pinned ? "Desfijar sidebar" : "Fijar sidebar"}
        >
          {pinned ? <PinOff size={14} strokeWidth={1.8} /> : <Pin size={14} strokeWidth={1.8} />}
        </button>
        
      </div>

      {/* ── Nav ── */}
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${justifyClass}`}>
                <span className={showClass}>Menu</span>
                <span className={hideClass}>
                  <MoreHorizontal size={16} />
                </span>
              </h2>

              <ul className="flex flex-col gap-4">
                {sections.map((section, idx) => {
                  const singleItem = section.items.length === 1;
                  const isActiveSection = section.items.some((i) => isActive(i.href));
                  const isOpen = openSubmenu === idx;

                  if (singleItem) {
                    const item = section.items[0];
                    const active = isActive(item.href);
                    return (
                      <li key={section.label}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={active ? "page" : undefined}
                          className={`menu-item group ${
                            active ? "menu-item-active" : "menu-item-inactive"
                          } ${justifyClass}`}
                        >
                          <span className={active ? "menu-item-icon-active" : "menu-item-icon-inactive"}>
                            {getIcon(section.icon)}
                          </span>
                          <span className={`menu-item-text ${showClass}`}>
                            {section.label}
                          </span>
                        </Link>
                      </li>
                    );
                  }

                  return (
                    <li key={section.label}>
                      <button
                        type="button"
                        onClick={() => handleToggle(idx)}
                        className={`menu-item group w-full ${
                          isActiveSection ? "menu-item-active" : "menu-item-inactive"
                        } ${justifyClass}`}
                      >
                        <span className={isActiveSection ? "menu-item-icon-active" : "menu-item-icon-inactive"}>
                          {getIcon(section.icon)}
                        </span>
                        <span className={`menu-item-text flex-1 text-left ${showClass}`}>
                          {section.label}
                        </span>
                        <ChevronDown
                          size={16}
                          className={`ml-auto transition-transform duration-200
                            ${showClass}
                            ${isOpen ? "rotate-180 text-brand-500" : ""}`}
                        />
                      </button>

                      {/* Submenu */}
                      <div
                        ref={(el) => { subMenuRefs.current[idx] = el; }}
                        className={`overflow-hidden transition-all duration-300 ${showClass}`}
                        style={{
                          height: isOpen ? `${subMenuHeight[idx] ?? 0}px` : "0px",
                        }}
                      >
                        <ul className="mt-2 space-y-1 ml-9">
                          {section.items.map((item) => {
                            const active = isActive(item.href);
                            return (
                              <li key={item.href}>
                                <Link
                                  href={item.href}
                                  onClick={onNavigate}
                                  aria-current={active ? "page" : undefined}
                                  className={`menu-dropdown-item ${
                                    active ? "menu-dropdown-item-active" : "menu-dropdown-item-inactive"
                                  }`}
                                >
                                  {item.label}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </nav>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Sidebar (Desktop + Mobile)                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */
export function Sidebar() {
  const { isExpanded, isMobileOpen, toggleMobileSidebar } = useSidebar();
  const { theme } = useTheme();

  return (
    <>
      {/* ── Desktop ── */}
      <aside
        className={`group/sidebar fixed top-0 left-0 h-screen px-5 z-50 hidden lg:flex flex-col
          app-sidebar transition-[width] duration-300 ease-in-out will-change-[width]
          ${isExpanded ? "w-[290px]" : "w-[90px] hover:w-[290px]"}`}
      >
        <SidebarContent pinned={isExpanded} />
      </aside>

      {/* ── Mobile backdrop ── */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden"
          onClick={toggleMobileSidebar}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[290px] flex-col px-5
          app-sidebar lg:hidden transition-transform duration-300 ease-in-out
          ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between pt-4 pb-2 border-b border-gray-200 dark:border-gray-800">
          <AppLogo href="/dashboard" name="ApliSmart Motors" tagline="" theme={theme} compact mark="full" showTagline={false} />
          <button
            type="button"
            onClick={toggleMobileSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
            aria-label="Cerrar menú"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col flex-1 overflow-hidden">
          <SidebarContent onNavigate={toggleMobileSidebar} forceShowLabels />
        </div>
      </aside>
    </>
  );
}