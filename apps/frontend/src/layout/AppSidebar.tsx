import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import { ChevronDown, MoreHorizontal, Pin, PinOff } from "lucide-react";
import { useSidebar } from "../context/SidebarContext";
import { useAuth } from "../context/AuthContext";
import { useAlertsBell } from "../context/AlertsBellContext";
import { filterOperationalNavigation } from "../lib/access-control";
import { navigationSections, isRouteActive } from "../lib/navigation";
import type { NavigationSection } from "../lib/navigation";
import {
  LayoutGrid, User, List, Table2, MapPin, PieChart,
  FileText, Box, Plug, Calendar, Bell, BookOpen,
  ClipboardList, Folder, Package, Zap, Users, Wind,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  DB: LayoutGrid, AC: Wind,    GS: Package,  MT: Zap,
  GE: Zap,        MN: ClipboardList, CK: List, AL: Bell,
  RP: PieChart,   CB: BookOpen, GL: MapPin,   CT: Users,
  US: User,       RL: List,    FL: Box,       CD: User,
  SD: Folder,     GJ: Folder,  AS: Table2,    SG: BookOpen,
  TA: BookOpen,   LM: List,    NM: Zap,       MM: ClipboardList,
  HM: Calendar,   GN: Zap,     LA: List,      NA: Zap,
  MA: ClipboardList, HA: Calendar, PC: ClipboardList, IV: Package,
  CA: BookOpen,   VA: BookOpen, RC: BookOpen, KM: Table2,
  CC: List,       PF: User,    CF: Plug,      RG: PieChart,
  GR: BookOpen,   RI: Table2,
  // Platform icons
  EM: Users,      MD: Box,      PL: FileText, AU: List,
  CRM: Users,     LD: FileText, CL: Users,    FC: FileText,
  UG: Users,
  default: FileText,
};

function getIcon(code: string) {
  const Icon = ICON_MAP[code] ?? ICON_MAP.default;
  return <Icon size={20} strokeWidth={1.5} />;
}

type AppSidebarProps = {
  /** Si se pasa, usa estas secciones en lugar de las de operacion filtradas por rol */
  sections?: NavigationSection[];
  /** Ruta base del logo (default: /dashboard) */
  homeHref?: string;
};

const AppSidebar: React.FC<AppSidebarProps> = ({ sections: sectionsProp, homeHref = "/dashboard" }) => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleSidebar } = useSidebar();
  const { session } = useAuth();
  const { openCount: alertsOpenCount } = useAlertsBell();
  const location = useLocation();

  const operationSections = useMemo(
    () =>
      filterOperationalNavigation(
        navigationSections,
        session?.role ?? null,
        (session?.modulePermissions ?? {}) as Record<string, string[]>,
        session?.companyModules ?? [],
      ),
    [session?.role, session?.modulePermissions, session?.companyModules]
  );

  const sections = sectionsProp ?? operationSections;

  // Mapa de href → badge numérico. Solo cargamos contadores de cosas que
  // queremos resaltar (ej. alertas abiertas).
  const badgeForHref = useCallback(
    (href: string): number | null => {
      if (href === "/alertas") return alertsOpenCount > 0 ? alertsOpenCount : null;
      return null;
    },
    [alertsOpenCount],
  );

  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);

  const isActive = useCallback(
    (href: string) => isRouteActive(location.pathname, href),
    [location.pathname]
  );

  const showLabels = isExpanded || isHovered || isMobileOpen;

  useEffect(() => {
    sections.forEach((section, idx) => {
      if (
        section.items.length > 1 &&
        section.items.some((i) => isActive(i.href))
      ) {
        setOpenSubmenu(idx);
      }
    });
  }, [location.pathname, sections, isActive]);

  const toggleSubmenu = (idx: number) =>
    setOpenSubmenu((prev) => (prev === idx ? null : idx));

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 
        bg-white dark:bg-gray-900 dark:border-gray-800 
        text-gray-900 h-screen transition-all duration-300 ease-in-out 
        z-50 border-r border-gray-200
        ${isExpanded || isMobileOpen ? "w-[290px]" : isHovered ? "w-[290px]" : "w-[90px]"}
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Logo + Pin */}
      <div className={`py-8 flex items-center relative ${showLabels ? "justify-start" : "lg:justify-center"}`}>
        <Link to={homeHref}>
          {showLabels ? (
            <>
              <img
                src="/images/logo/logo-dark.png"
                className="dark:hidden"
                alt="Logo"
                width={150}
                height={40}
              />
              <img
                src="/images/logo/logo.png"
                className="hidden dark:block"
                alt="Logo"
                width={150}
                height={40}
              />
            </>
          ) : (
            <>
              <img
                src="/images/logo/favicon-aplismart.png"
                className="dark:hidden"
                alt="Logo"
                width={100}
                height={100}
              />
              <img
                src="/images/logo/favicon-aplismart-light.png"
                className="hidden dark:block"
                alt="Logo"
                width={100}
                height={70}
              />
            </>
          )}
        </Link>

        {/* Badge de plataforma cuando está en modo platform */}
        {sectionsProp && showLabels && (
          <span className="ml-3 inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-violet-400">
            Platform
          </span>
        )}

        {showLabels && (
          <button
            type="button"
            onClick={toggleSidebar}
            className="absolute right-0 flex items-center justify-center w-7 h-7 rounded-full border border-gray-200 dark:border-white/10 text-gray-400 hover:text-brand-500 hover:border-brand-400 transition-colors"
            aria-label={isExpanded ? "Desfijar sidebar" : "Fijar sidebar"}
          >
            {isExpanded ? <PinOff size={14} strokeWidth={1.8} /> : <Pin size={14} strokeWidth={1.8} />}
          </button>
        )}
      </div>

      {/* Nav */}
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <h2 className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${showLabels ? "justify-start" : "lg:justify-center"}`}>
            {showLabels ? "Menú" : <MoreHorizontal size={16} />}
          </h2>

          <ul className="flex flex-col gap-4">
            {sections.map((section, idx) => {
              const singleItem      = section.items.length === 1;
              const isActiveSection = section.items.some((i) => isActive(i.href));
              const isOpen          = openSubmenu === idx;

              if (singleItem) {
                const item   = section.items[0];
                const active = isActive(item.href);
                const badge  = badgeForHref(item.href);
                return (
                  <li key={section.label}>
                    <Link
                      to={item.href}
                      className={`menu-item group ${active ? "menu-item-active" : "menu-item-inactive"} ${showLabels ? "justify-start" : "lg:justify-center"}`}
                    >
                      <span className={`relative ${active ? "menu-item-icon-active" : "menu-item-icon-inactive"}`}>
                        {getIcon(section.icon)}
                        {badge !== null && !showLabels && (
                          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-gray-900">
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </span>
                      {showLabels && (
                        <>
                          <span className="menu-item-text flex-1">{section.label}</span>
                          {badge !== null && (
                            <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold leading-none text-white shadow-sm shadow-rose-500/30">
                              {badge > 99 ? "99+" : badge}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  </li>
                );
              }

              return (
                <li key={section.label}>
                  <button
                    type="button"
                    onClick={() => toggleSubmenu(idx)}
                    className={`menu-item group w-full ${isActiveSection ? "menu-item-active" : "menu-item-inactive"} ${showLabels ? "justify-start" : "lg:justify-center"}`}
                  >
                    <span className={isActiveSection ? "menu-item-icon-active" : "menu-item-icon-inactive"}>
                      {getIcon(section.icon)}
                    </span>
                    {showLabels && (
                      <>
                        <span className="menu-item-text flex-1 text-left">{section.label}</span>
                        <ChevronDown
                          size={16}
                          className={`ml-auto transition-transform duration-200 ${isOpen ? "rotate-180 text-brand-500" : ""}`}
                        />
                      </>
                    )}
                  </button>

                  <div
                    className={`grid transition-all duration-300 ease-in-out ${
                      isOpen && showLabels ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <ul className="overflow-hidden mt-2 space-y-1 ml-9">
                      {section.items.map((item) => {
                        const active = isActive(item.href);
                        return (
                          <li key={item.href}>
                            <Link
                              to={item.href}
                              className={`menu-dropdown-item ${active ? "menu-dropdown-item-active" : "menu-dropdown-item-inactive"}`}
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
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;