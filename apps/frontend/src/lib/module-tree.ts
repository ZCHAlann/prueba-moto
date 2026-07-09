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

      // ── Aceite ──
      proximo_cambio_aceite:         "Próximos cambios de aceite",

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
      // Jun 2026 — `garajes` faltaba en el MODULE_TREE aunque la ruta
      // backend `garages.ts` lo usa y el sidebar expone /gestion/garajes.
      garajes:          "Garajes",
      asignaciones:     "Asignar vehículo",
      // Jun 2026 — alineado al backend. Las rutas suppliers.ts y
      // workshops.ts usan los keys en inglés `suppliers` y `workshops`,
      // pero los shims en requirePermission.ts ahora aceptan también
      // las keys en español del MODULE_TREE.
      talleres:         "Talleres",
      proveedores:      "Proveedores",
    },
  },
  // Jun 2026 — antes estaba como submódulo de `gestion` (`gestion.seguros`),
  // pero el backend usa `requireModule('seguros')` (módulo top-level).
  // Se extrajo a módulo propio para que el editor de permisos y los gates
  // coincidan con el backend.
  seguros: {
    label: "Seguros",
    submodules: {
      polizas: "Pólizas de seguro",
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
      // Jun 2026 — reautorización de mantenimientos atrasados (flujo
      // pedir/aprobar/rechazar, similar al de checklist.reautorizaciones).
      // Backend lo usa en maintenances.ts:1612.
      reautorizaciones: "Reautorización de atrasados",
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
      // Reautorización de checklists atrasados: flujo de "pedir permiso" +
      // "aprobar/rechazar". El operador/conductor pide con `crear`, el admin
      // (o un supervisor delegado) aprueba/rechaza con `editar`. Ver sirve
      // para listar las solicitudes propias o de la empresa según corresponda.
      reautorizaciones: "Reautorización de atrasados",
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
      // Submódulo "Estadísticas" — solo owner/admin por defecto (ver ROLE_DEFAULT_PERMISSIONS).
      // Se renderiza como tab colorida dentro de /reportes con KPIs + 6 charts + matemática.
      estadisticas: "Estadísticas",
    },
  },
  lienzo: {
    label: "Lienzo",
    submodules: {
      // Módulo top-level dedicado al dashboard builder. Antes vivía como
      // submódulo de `reportes` (compat shim en backend) — ahora es módulo
      // propio para que aparezca como entrada destacada en el sidebar.
      lienzo: "Lienzo de presentación",
    },
  },
  combustible: {
    label: "Combustible",
    submodules: {
      combustible: "Combustible",
    },
  },
  peajes: {
    label: "Peajes",
    submodules: {
      peajes: "Peajes",
    },
  },
  finanzas: {
    label: "Finanzas",
    submodules: {
      // jul 2026 — ledger de comprobantes (facturas de combustible / peajes /
      // mantenimiento). El submódulo `facturas` es el único consumidor hoy;
      // en el futuro podrían agregarse `estadisticas` (KPIs agregados),
      // `conciliacion`, etc.
      facturas: "Facturas",
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
      // Jun 2026 — split: antes era un único submódulo `accesos` que
      // tapaba "usuarios" y "roles" juntos. Ahora son dos separados
      // para poder dar permiso de uno sin el otro.
      //
      // Nota de compat: tokens viejos pueden seguir trayendo
      // `accesos.accesos.*`; el shim en `requirePermission` (backend)
      // y el helper `expandLegacyAccessPerms` (frontend) los mapean.
      usuarios: "Usuarios",
      roles:    "Roles y permisos",
    },
  },
  autorizaciones: {
    label: "Autorizaciones",
    submodules: {
      autorizaciones: "Autorizaciones de salida",
    },
  },
  jarvis: {
    label: "Asistente IA",
    submodules: {
      // Acción: 'ver' (semántica = "puede usar el asistente").
      // Bypass admin/owner incorporado en requirePermission, así que por
      // defecto solo admin_empresa / owner_empresa pueden usarlo. Un
      // superadmin puede extender 'ver' a roles granulares vía el
      // editor de permisos.
      asistente: "Asistente IA",
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

/** Cuenta cuántos módulos tienen al menos una acción activa en algún submódulo. */
export function countModulesWithAccess(permissions: PermissionMap): number {
  let count = 0;
  for (const subs of Object.values(permissions ?? {})) {
    if (!subs) continue;
    const hasAccess = Object.values(subs).some(
      (actions) => Array.isArray(actions) && actions.length > 0
    );
    if (hasAccess) count++;
  }
  return count;
}