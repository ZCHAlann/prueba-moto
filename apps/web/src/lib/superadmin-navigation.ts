export type SuperadminNavItem = {
  label: string;
  href: string;
  icon: string;
  description: string;
};

export const superadminNavigation = [
  {
    label: "Panel master",
    items: [
      { label: "Dashboard", href: "/master", icon: "SA", description: "Vision general del producto" },
      { label: "Empresas", href: "/master/empresas", icon: "EM", description: "Empresas, planes y estado" },
      { label: "Planes", href: "/master/planes", icon: "PL", description: "Oferta comercial y limites" },
      { label: "Modulos", href: "/master/modulos", icon: "MD", description: "Habilitacion por empresa" },
      { label: "Usuarios globales", href: "/master/usuarios", icon: "UG", description: "Roles de plataforma" },
      { label: "Auditoria", href: "/master/auditoria", icon: "AU", description: "Logs y trazabilidad" },
      { label: "Configuracion", href: "/master/configuracion", icon: "CF", description: "Accesos, branding e integraciones" },
      { label: "Contenido", href: "/master/contenido", icon: "CT", description: "Mensaje comercial y marca" },
    ],
  },
  {
    label: "Comercial",
    items: [
      { label: "CRM", href: "/master/crm", icon: "CRM", description: "Embudo y seguimiento" },
      { label: "Leads", href: "/master/leads", icon: "LD", description: "Solicitudes de demo y oportunidades" },
      { label: "Clientes", href: "/master/clientes", icon: "CL", description: "Cartera activa" },
      { label: "Facturacion", href: "/master/facturacion", icon: "FC", description: "Renovaciones y pagos" },
    ],
  },
  {
    label: "Operacion completa",
    items: [
      { label: "Dashboard operativo", href: "/dashboard", icon: "DB", description: "KPIs y actividad de empresa" },
      { label: "Flotas", href: "/flotas", icon: "FL", description: "Vehiculos, detalle y estado" },
      { label: "Motores", href: "/motores", icon: "MT", description: "Lista, detalle e historial" },
      { label: "Generadores", href: "/generadores", icon: "GE", description: "Equipos de respaldo electrico" },
      { label: "Conductores", href: "/operaciones/conductores", icon: "CD", description: "Personal, licencias y estado" },
      { label: "Asignar vehiculo", href: "/operaciones/asignaciones", icon: "AS", description: "Asignaciones y actas PDF" },
      { label: "Sedes", href: "/gestion/sedes", icon: "SD", description: "Bases, patios y plantas" },
      { label: "Seguros vehiculares", href: "/gestion/seguros", icon: "SG", description: "Polizas y vencimientos" },
      { label: "Tipos de aceite", href: "/gestion/tipos-aceite", icon: "TA", description: "Catalogo tecnico" },
      { label: "Mantenimiento", href: "/mantenimiento", icon: "MN", description: "Preventivo y correctivo" },
      { label: "Inventario", href: "/mantenimiento/inventario", icon: "IV", description: "Repuestos y stock" },
      { label: "Checklist", href: "/checklist", icon: "CK", description: "Inspecciones operativas" },
      { label: "Alertas", href: "/alertas", icon: "AL", description: "Seguimiento y criticidad" },
      { label: "Reportes", href: "/reportes", icon: "RP", description: "Reportes y exportaciones" },
      { label: "Combustible", href: "/combustible", icon: "CB", description: "Consumo y rendimiento" },
      { label: "Geolocalizacion", href: "/geolocalizacion", icon: "GL", description: "Mapa y unidades" },
      { label: "Configuracion empresa", href: "/configuracion", icon: "CF", description: "Sedes, roles y preferencias" },
      { label: "Perfil", href: "/perfil", icon: "PF", description: "Cuenta y preferencias" },
    ],
  },
] satisfies { label: string; items: SuperadminNavItem[] }[];
