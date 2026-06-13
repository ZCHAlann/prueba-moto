export const MODULE_TREE = {
  dashboard: {
    label: "Dashboard",
    submodules: {
      dashboard: "Dashboard",
    },
  },
  gestion: {
    label: "Gestión",
    submodules: {
      flotas:       "Flotas",
      conductores:  "Conductores",
      sedes:        "Sedes",
      garajes:      "Garajes",
      asignaciones: "Asignar vehículo",
      seguros:      "Seguros vehiculares",
      talleres:     "Talleres",
      proveedores:  "Proveedores",
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