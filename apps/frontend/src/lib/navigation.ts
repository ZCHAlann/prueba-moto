export type AppAccent = "amber" | "cyan" | "emerald" | "lime" | "orange" | "rose" | "sky" | "teal";

export type AppRoute = string;

export type NavigationLeaf = {
  label: string;
  href: AppRoute;
  icon: string;
  description: string;
  accent: AppAccent;
};

export type NavigationSection = {
  label: string;
  icon: string;
  description: string;
  accent: AppAccent;
  items: NavigationLeaf[];
};

export const navigationSections: NavigationSection[] = [
  {
    label: "Dashboard",
    icon: "DB",
    description: "Control general del sistema",
    accent: "emerald",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: "DB",
        description: "Vista general operativa",
        accent: "emerald",
      },
    ],
  },
  {
    label: "Accesos",
    icon: "AC",
    description: "Usuarios, perfiles y control",
    accent: "teal",
    items: [
      {
        label: "Usuarios",
        href: "/accesos/usuarios",
        icon: "US",
        description: "Personal con acceso al sistema",
        accent: "teal",
      },
      {
        label: "Roles y permisos",
        href: "/accesos/roles",
        icon: "RL",
        description: "Matriz base de autorizaciones",
        accent: "teal",
      },
    ],
  },
  {
    label: "Gestion",
    icon: "GS",
    description: "Operacion vehicular y talento",
    accent: "sky",
    items: [
      {
        label: "Flotas",
        href: "/flotas",
        icon: "FL",
        description: "Vehiculos operativos y control de uso",
        accent: "sky",
      },
      {
        label: "Conductores",
        href: "/operaciones/conductores",
        icon: "CD",
        description: "Licencias, estado y disponibilidad",
        accent: "sky",
      },
      {
        label: "Sedes",
        href: "/gestion/sedes",
        icon: "SD",
        description: "Catalogo operativo de patios, bases y plantas",
        accent: "sky",
      },
      {
        label: "Garajes",
        href: "/gestion/garajes",
        icon: "GJ",
        description: "Ubicacion, capacidad y supervisor de resguardo",
        accent: "sky",
      },
      {
        label: "Asignar vehiculo",
        href: "/operaciones/asignaciones",
        icon: "AS",
        description: "Relaciones activas entre vehiculo y conductor",
        accent: "sky",
      },
      {
        label: "Seguros vehiculares",
        href: "/gestion/seguros",
        icon: "SG",
        description: "Polizas, vencimientos y seguimiento",
        accent: "sky",
      }
    ],
  },
  {
    label: "Motores",
    icon: "MT",
    description: "Dominio tecnico de motores",
    accent: "orange",
    items: [
      {
        label: "Lista de motores",
        href: "/motores",
        icon: "LM",
        description: "Inventario tecnico de motores",
        accent: "orange",
      },
      {
        label: "Mantenimientos de motor",
        href: "/motores/mantenimientos",
        icon: "MM",
        description: "Agenda y criticidad por motor",
        accent: "orange",
      },
      {
        label: "Historial de motor",
        href: "/motores/historial",
        icon: "HM",
        description: "Eventos y trazabilidad tecnica",
        accent: "orange",
      },
    ],
  },
  {
    label: "Generadores",
    icon: "GE",
    description: "Respaldo electrico y plantas",
    accent: "orange",
    items: [
      {
        label: "Generadores electricos",
        href: "/generadores",
        icon: "GN",
        description: "Equipos de respaldo por sede y estado",
        accent: "orange",
      },
    ],
  },
  {
    label: "Aires acondicionados",
    icon: "AC",
    description: "Equipos A/C y servicios",
    accent: "cyan",
    items: [
      {
        label: "Lista de A/C",
        href: "/aires-acondicionados",
        icon: "LA",
        description: "Inventario técnico de A/C",
        accent: "cyan",
      },
      {
        label: "Nuevo A/C",
        href: "/aires-acondicionados/nuevo",
        icon: "NA",
        description: "Alta técnica y operativa",
        accent: "cyan",
      },
      {
        label: "Mantenimientos de A/C",
        href: "/aires-acondicionados/mantenimientos",
        icon: "MA",
        description: "Agenda y criticidad por A/C",
        accent: "cyan",
      },
      {
        label: "Historial de A/C",
        href: "/aires-acondicionados/historial",
        icon: "HA",
        description: "Eventos y trazabilidad técnica",
        accent: "cyan",
      },
    ],
  },
  {
    label: "Mantenimiento",
    icon: "MN",
    description: "Operaciones de taller y servicio",
    accent: "amber",
    items: [
      {
        label: "Preventivo y correctivo",
        href: "/mantenimiento",
        icon: "PC",
        description: "OT, fechas y responsables",
        accent: "amber",
      },
      {
        label: "Inventario",
        href: "/mantenimiento/inventario",
        icon: "IV",
        description: "Control de repuestos y stock minimo",
        accent: "amber",
      },
      {
        label: "Verificación de aceite",
        href: "/mantenimiento/verificacion-aceite",
        icon: "VA",
        description: "Análisis con IA del nivel y estado del aceite",
        accent: "amber",
      },
      {
        label: "Registro combustible",
        href: "/mantenimiento/registro-combustible",
        icon: "RC",
        description: "Consumos y rendimiento operativo",
        accent: "amber",
      },
      {
        label: "Kilometraje / horometro",
        href: "/mantenimiento/kilometraje",
        icon: "KM",
        description: "Lecturas para control tecnico",
        accent: "amber",
      },
    ],
  },
  {
    label: "Checklist",
    icon: "CK",
    description: "Inspecciones operativas",
    accent: "lime",
    items: [
      {
        label: "Checklist",
        href: "/checklist",
        icon: "CK",
        description: "Inspecciones y aprobacion de salida",
        accent: "lime",
      }
    ],
  },
  {
    label: "Alertas",
    icon: "AL",
    description: "Seguimiento y severidad",
    accent: "rose",
    items: [
      {
        label: "Alertas",
        href: "/alertas",
        icon: "AL",
        description: "Alertas manuales, de mantenimiento y vencimiento",
        accent: "rose",
      },
    ],
  },
  {
    label: "Reportes",
    icon: "RP",
    description: "Salida ejecutiva y operativa",
    accent: "cyan",
    items: [
      {
        label: "Centro de reportes",
        href: "/reportes",
        icon: "RP",
        description: "Vista general de reportes y exportacion",
        accent: "cyan",
      }
    ],
  },
  {
    label: "Combustible",
    icon: "CB",
    description: "Control general de abastecimiento",
    accent: "orange",
    items: [
      {
        label: "Combustible",
        href: "/combustible",
        icon: "CB",
        description: "Consumo, costo y rendimiento",
        accent: "orange",
      },
    ],
  },
  {
    label: "Geolocalizacion",
    icon: "GL",
    description: "Ubicacion operativa y monitoreo",
    accent: "teal",
    items: [
      {
        label: "Geolocalizacion",
        href: "/geolocalizacion",
        icon: "GL",
        description: "Vista de unidades y zonas activas",
        accent: "teal",
      },
    ],
  },
  {
    label: "Soporte",
    icon: "SP",
    description: "Asistencia y soporte técnico",
    accent: "emerald",
    items: [
      {
        label: "Soporte",
        href: "/soporte",
        icon: "SP",
        description: "Vista general operativa",
        accent: "emerald",
      },
    ],
  },
  {
    label: "Cuenta",
    icon: "CT",
    description: "Perfil y ajustes del sistema",
    accent: "emerald",
    items: [
      {
        label: "Perfil",
        href: "/perfil",
        icon: "PF",
        description: "Datos del usuario actual y preferencias",
        accent: "emerald",
      },
      {
        label: "Configuracion",
        href: "/configuracion",
        icon: "CF",
        description: "Empresa, modulos, branding y notificaciones",
        accent: "emerald",
      },
    ],
  },
];

export const navigationItems = navigationSections.flatMap((section) => section.items);

export const accentStyles: Record<
  AppAccent,
  {
    activeNav: string;
    icon: string;
    pill: string;
    header: string;
    soft: string;
    dot: string;
    focus: string;
    section: string;
  }
> = {
  amber: {
    activeNav: "bg-amber-300 text-zinc-950 shadow-[0_18px_40px_-22px_rgba(245,158,11,0.95)]",
    icon: "bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/20",
    pill: "bg-amber-500/15 text-amber-800 ring-1 ring-amber-300/70",
    header: "border-amber-200 bg-gradient-to-br from-amber-400/14 via-white to-orange-400/10",
    soft: "bg-amber-500/10 text-amber-700 ring-1 ring-amber-200",
    dot: "bg-amber-400",
    focus: "focus:border-amber-400 focus:ring-amber-200",
    section: "border-amber-400/20 bg-amber-400/10 text-amber-100",
  },
  cyan: {
    activeNav: "bg-cyan-300 text-zinc-950 shadow-[0_18px_40px_-22px_rgba(34,211,238,0.95)]",
    icon: "bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-300/20",
    pill: "bg-cyan-500/15 text-cyan-800 ring-1 ring-cyan-300/70",
    header: "border-cyan-200 bg-gradient-to-br from-cyan-400/14 via-white to-sky-400/10",
    soft: "bg-cyan-500/10 text-cyan-700 ring-1 ring-cyan-200",
    dot: "bg-cyan-400",
    focus: "focus:border-cyan-400 focus:ring-cyan-200",
    section: "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
  },
  emerald: {
    activeNav: "bg-emerald-300 text-zinc-950 shadow-[0_18px_40px_-22px_rgba(16,185,129,0.95)]",
    icon: "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/20",
    pill: "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-300/70",
    header: "border-emerald-200 bg-gradient-to-br from-emerald-400/14 via-white to-teal-400/10",
    soft: "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-200",
    dot: "bg-emerald-400",
    focus: "focus:border-emerald-400 focus:ring-emerald-200",
    section: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
  },
  lime: {
    activeNav: "bg-lime-300 text-zinc-950 shadow-[0_18px_40px_-22px_rgba(132,204,22,0.95)]",
    icon: "bg-lime-400/15 text-lime-200 ring-1 ring-lime-300/20",
    pill: "bg-lime-500/15 text-lime-800 ring-1 ring-lime-300/70",
    header: "border-lime-200 bg-gradient-to-br from-lime-400/14 via-white to-emerald-400/10",
    soft: "bg-lime-500/10 text-lime-700 ring-1 ring-lime-200",
    dot: "bg-lime-400",
    focus: "focus:border-lime-400 focus:ring-lime-200",
    section: "border-lime-400/20 bg-lime-400/10 text-lime-100",
  },
  orange: {
    activeNav: "bg-orange-300 text-zinc-950 shadow-[0_18px_40px_-22px_rgba(249,115,22,0.95)]",
    icon: "bg-orange-400/15 text-orange-200 ring-1 ring-orange-300/20",
    pill: "bg-orange-500/15 text-orange-800 ring-1 ring-orange-300/70",
    header: "border-orange-200 bg-gradient-to-br from-orange-400/14 via-white to-amber-400/10",
    soft: "bg-orange-500/10 text-orange-700 ring-1 ring-orange-200",
    dot: "bg-orange-400",
    focus: "focus:border-orange-400 focus:ring-orange-200",
    section: "border-orange-400/20 bg-orange-400/10 text-orange-100",
  },
  rose: {
    activeNav: "bg-rose-300 text-zinc-950 shadow-[0_18px_40px_-22px_rgba(244,63,94,0.95)]",
    icon: "bg-rose-400/15 text-rose-200 ring-1 ring-rose-300/20",
    pill: "bg-rose-500/15 text-rose-800 ring-1 ring-rose-300/70",
    header: "border-rose-200 bg-gradient-to-br from-rose-400/14 via-white to-orange-400/10",
    soft: "bg-rose-500/10 text-rose-700 ring-1 ring-rose-200",
    dot: "bg-rose-400",
    focus: "focus:border-rose-400 focus:ring-rose-200",
    section: "border-rose-400/20 bg-rose-400/10 text-rose-100",
  },
  sky: {
    activeNav: "bg-sky-300 text-zinc-950 shadow-[0_18px_40px_-22px_rgba(14,165,233,0.95)]",
    icon: "bg-sky-400/15 text-sky-200 ring-1 ring-sky-300/20",
    pill: "bg-sky-500/15 text-sky-800 ring-1 ring-sky-300/70",
    header: "border-sky-200 bg-gradient-to-br from-sky-400/14 via-white to-cyan-400/10",
    soft: "bg-sky-500/10 text-sky-700 ring-1 ring-sky-200",
    dot: "bg-sky-400",
    focus: "focus:border-sky-400 focus:ring-sky-200",
    section: "border-sky-400/20 bg-sky-400/10 text-sky-100",
  },
  teal: {
    activeNav: "bg-teal-300 text-zinc-950 shadow-[0_18px_40px_-22px_rgba(20,184,166,0.95)]",
    icon: "bg-teal-400/15 text-teal-200 ring-1 ring-teal-300/20",
    pill: "bg-teal-500/15 text-teal-800 ring-1 ring-teal-300/70",
    header: "border-teal-200 bg-gradient-to-br from-teal-400/14 via-white to-emerald-400/10",
    soft: "bg-teal-500/10 text-teal-700 ring-1 ring-teal-200",
    dot: "bg-teal-400",
    focus: "focus:border-teal-400 focus:ring-teal-200",
    section: "border-teal-400/20 bg-teal-400/10 text-teal-100",
  },
};

export function isRouteActive(pathname: string, href: AppRoute) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getNavigationItem(pathname: string) {
  return (
    [...navigationItems]
      .sort((left, right) => right.href.length - left.href.length)
      .find((item) => isRouteActive(pathname, item.href)) ?? navigationItems[0]
  );
}

export function getNavigationSection(pathname: string) {
  const item = getNavigationItem(pathname);
  return navigationSections.find((section) => section.items.some((entry) => entry.href === item.href)) ?? navigationSections[0];
}
