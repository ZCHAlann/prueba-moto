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
  mantenimiento: {
    label: "Mantenimiento",
    submodules: {
      ordenes:    "Órdenes de mantenimiento",
      inventario: "Inventario",
      oil:        "Aceites",
    },
  },
  checklist: {
    label: "Checklist",
    submodules: {
      checklist: "Checklist",
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