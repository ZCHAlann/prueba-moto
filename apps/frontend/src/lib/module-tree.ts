export const MODULE_TREE = {
  dashboard: {
    label: "Dashboard",
    submodules: {
      // ── KPIs globales ──
      kpis_flotas:                  "KPIs de flota",
      kpis_mantenimiento:           "KPIs de mantenimiento",
      kpis_combustible:             "KPIs de combustible",
      kpis_conductores:             "KPIs de conductores",

      // ── Gráficas de series ──
      chart_combustible_mes:        "Gráfica combustible por mes",
      chart_mantenimientos_mes:     "Gráfica mantenimientos por mes",
      chart_flotas_estado:          "Gráfica flota por estado",
      chart_flotas_categoria:       "Gráfica flota por categoría",
      chart_conductores_licencia:   "Gráfica conductores por licencia",

      // ── Alertas: pieza consolidada ──
      feed_alertas:                 "Feed de alertas activas",

      // ── Actividad y próximos ──
      timeline_actividad:           "Timeline de actividad reciente",
      tabla_proximos_mantenimientos: "Tabla próximos mantenimientos",

      // ── Por sede ──
      flota_por_sede:               "Flota agrupada por sede",
      kpis_por_sede:                "KPIs por sede",

      // ── Por garaje ──
      flota_por_garaje:             "Flota agrupada por garaje",
      ocupacion_garajes:            "Ocupación de garajes",

      // ── Combustible profundo ──
      consumo_por_vehiculo:         "Consumo de combustible por vehículo",
      costo_por_vehiculo:           "Costo de combustible por vehículo",
      consumo_por_conductor:        "Consumo de combustible por conductor",

      // ── Asignaciones y conductores ──
      estado_asignaciones:           "Estado de asignaciones",
      disponibilidad_conductores:   "Disponibilidad de conductores",
      kpis_mis_vehiculos:           "Mis vehículos asignados",

      // ── Seguros ──
      polizas_por_vencer:           "Pólizas de seguro por vencer",
      cobertura_activos:             "Cobertura de seguros en activos",

      // ── Checklists ──
      kpis_checklists:               "KPIs de inspecciones",
      checklists_pendientes:         "Inspecciones pendientes",

      // ── Aceite e inventario ──
      proximo_cambio_aceite:         "Próximos cambios de aceite",
      inventario_bajo:               "Inventario bajo mínimo",

      // ── Aires acondicionados ──
      kpis_ac:                       "KPIs de aires acondicionados",
      servicios_ac_pendientes:       "Servicios de A/C pendientes",

      // ── Auditoría ──
      actividad_por_usuario:         "Actividad por usuario",
      actividad_por_entidad:        "Actividad por entidad",
    },
  },
  gestion: {
    label: "Gestión",
    submodules: {
      flotas:           "Flotas",
      conductores:      "Conductores",
      sedes:            "Sedes",
      asignaciones:     "Asignar vehículo",
      seguros:          "Seguros vehiculares",
      talleres:         "Talleres",
      proveedores:      "Proveedores",
    },
  },
  motores: {
    label: "Motores",
    submodules: {
      lista_motores:        "Lista de motores",
      mantenimientos_motor: "Mantenimientos de motor",
      historial_motor:      "Historial de motor",
    },
  },
  generadores: {
    label: "Generadores",
    submodules: {
      generadores: "Generadores eléctricos",
    },
  },
  ac: {
    label: "Aires acondicionados",
    submodules: {
      lista_ac:          "Lista de A/C",
      mantenimientos_ac: "Mantenimientos de A/C",
    },
  },
  mantenimiento: {
    label: "Mantenimiento",
    submodules: {
      agenda:       "Agendar",
      execution:    "Preventivo y correctivo",
      records:      "Histórico de mantenimientos",
    },
  },
  checklist: {
    label: "Checklist",
    submodules: {
      // Gestión de plantillas (crear/editar/eliminar categorías).
      checklist: "Checklist",
      // Ejecución de inspecciones (ver/realizar — los usuarios que ejecutan, no los que gestionan).
      inspecciones: "Inspecciones",
      // Historial: ver inspecciones pasadas (anomalías, todos los checklists).
      // Es un permiso separado para que un usuario que ejecuta no vea por defecto
      // el historial de toda la empresa.
      historial: "Historial",
    },
  },
  alertas: {
    label: "Alertas",
    submodules: {
      alertas: "Alertas",
    },
  },
  reportes: {
    label: "Reportes",
    submodules: {
      reportes: "Reportes",
    },
  },
  combustible: {
    label: "Combustible",
    submodules: {
      combustible: "Combustible",
    },
  },
  geolocalizacion: {
    label: "Geolocalización",
    submodules: {
      geolocalizacion: "Geolocalización",
    },
  },
  accesos: {
    label: "Accesos",
    submodules: {
      accesos: "Usuarios y roles",
    },
  },
  autorizaciones: {
    label: "Autorizaciones",
    submodules: {
      autorizaciones: "Autorizaciones de salida",
    },
  },
} as const;

export type ModuleKey    = keyof typeof MODULE_TREE;
export type ActionKey    = "ver" | "crear" | "editar" | "eliminar";
export type PermissionMap = Record<string, Record<string, ActionKey[]>>;

export const ACTION_LABELS: Record<ActionKey, string> = {
  ver:      "Ver",
  crear:    "Crear",
  editar:   "Editar",
  eliminar: "Eliminar",
};

export const ACTION_COLORS: Record<ActionKey, { active: string; inactive: string }> = {
  ver:      {
    active:   "bg-blue-600 text-white border-blue-600",
    inactive: "bg-transparent text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/[0.15]",
  },
  crear:    {
    active:   "bg-green-600 text-white border-green-600",
    inactive: "bg-transparent text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/[0.15]",
  },
  editar:   {
    active:   "bg-amber-500 text-white border-amber-500",
    inactive: "bg-transparent text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/[0.15]",
  },
  eliminar: {
    active:   "bg-red-600 text-white border-red-600",
    inactive: "bg-transparent text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/[0.15]",
  },
};