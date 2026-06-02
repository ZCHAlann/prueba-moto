export type MasterNavItem = {
  label: string;
  href: string;
  icon: string;
  description: string;
};

export const masterNavigation = [
  {
    label: "Panel master",
    items: [
      { label: "Dashboard", href: "/master", icon: "SA", description: "Vision general del producto" },
      { label: "Empresas", href: "/master/empresas", icon: "EM", description: "Empresas, planes y estado" },
      { label: "Planes", href: "/master/planes", icon: "PL", description: "Oferta comercial y limites" },
      { label: "Modulos", href: "/master/modulos", icon: "MD", description: "Habilitacion por empresa" },
      { label: "Usuarios", href: "/master/usuarios", icon: "US", description: "Accesos y roles" },
      { label: "Auditoria", href: "/master/auditoria", icon: "AU", description: "Logs y trazabilidad" },
      { label: "Configuracion", href: "/master/configuracion", icon: "CF", description: "Accesos, branding e integraciones" },
      { label: "Contenido", href: "/master/contenido", icon: "CT", description: "Mensaje comercial y marca" },
      { label: "Flyers app movil", href: "/master/mobile-flyers", icon: "FM", description: "Promociones visibles en Android y iPhone" },
    ],
  },
  {
    label: "Comercial",
    items: [
      { label: "CRM", href: "/master/crm", icon: "CRM", description: "Embudo y seguimiento" },
      { label: "Leads", href: "/master/leads", icon: "LD", description: "Solicitudes de demo y oportunidades" },
      { label: "Clientes", href: "/master/clientes", icon: "CL", description: "Cartera activa" },
      { label: "Facturacion", href: "/master/facturacion", icon: "FC", description: "Renovaciones y pagos" },
      { label: "Pagos y pasarelas", href: "/master/pagos", icon: "PG", description: "Checkout, cobros y gateways" },
    ],
  },
  {
    label: "Operacion completa",
    items: [
      { label: "Vista operativa", href: "/master/operacion", icon: "DB", description: "Supervision sin salir del master" },
      { label: "Flotas", href: "/master/operacion/flotas", icon: "FL", description: "Vehiculos, detalle y estado" },
      { label: "Motores", href: "/master/operacion/motores", icon: "MT", description: "Lista, detalle e historial" },
      { label: "Generadores", href: "/master/operacion/generadores", icon: "GE", description: "Equipos de respaldo electrico" },
      { label: "Conductores", href: "/master/operacion/conductores", icon: "CD", description: "Personal, licencias y estado" },
      { label: "Asignaciones", href: "/master/operacion/asignaciones", icon: "AS", description: "Asignaciones y actas PDF" },
      { label: "Sedes", href: "/master/operacion/sedes", icon: "SD", description: "Bases, patios y plantas" },
      { label: "Seguros", href: "/master/operacion/seguros", icon: "SG", description: "Polizas y vencimientos" },
      { label: "Aceites", href: "/master/operacion/aceites", icon: "TA", description: "Catalogo tecnico" },
      { label: "Mantenimiento", href: "/master/operacion/mantenimiento", icon: "MN", description: "Preventivo y correctivo" },
      { label: "Inventario", href: "/master/operacion/inventario", icon: "IV", description: "Repuestos y stock" },
      { label: "Checklist", href: "/master/operacion/checklist", icon: "CK", description: "Inspecciones operativas" },
      { label: "Alertas", href: "/master/operacion/alertas", icon: "AL", description: "Seguimiento y criticidad" },
      { label: "Reportes", href: "/master/operacion/reportes", icon: "RP", description: "Reportes y exportaciones" },
      { label: "Combustible", href: "/master/operacion/combustible", icon: "CB", description: "Consumo y rendimiento" },
      { label: "Geolocalizacion", href: "/master/operacion/geolocalizacion", icon: "GL", description: "Mapa y unidades" },
      { label: "Configuracion empresa", href: "/master/operacion/configuracion", icon: "CF", description: "Sedes, roles y preferencias" },
    ],
  },
] satisfies { label: string; items: MasterNavItem[] }[];
