export const MODULE_TREE = {
  dashboard: {
    label: "Dashboard",
    submodules: {
      // ── KPIs globales ──
      // jul 2026 v6 — Cada submódulo declara de cuál módulo real
      // depende (requires). El editor de permisos los oculta si la
      // empresa no tiene ese módulo habilitado, así no se asignan
      // permisos a submódulos que no existen para la empresa.
      kpis_flotas:                  { label: "KPIs de flota",                  requires: ["gestion"] },
      kpis_mantenimiento:           { label: "KPIs de mantenimiento",         requires: ["mantenimiento"] },
      kpis_combustible:             { label: "KPIs de combustible",            requires: ["combustible"] },
      kpis_conductores:             { label: "KPIs de conductores",           requires: ["gestion"] },

      // ── Gráficas de series ──
      chart_combustible_mes:        { label: "Gráfica combustible por mes",    requires: ["combustible"] },
      chart_mantenimientos_mes:     { label: "Gráfica mantenimientos por mes", requires: ["mantenimiento"] },
      chart_flotas_estado:          { label: "Gráfica flota por estado",      requires: ["gestion"] },
      chart_flotas_categoria:       { label: "Gráfica flota por categoría",   requires: ["gestion"] },
      chart_conductores_licencia:   { label: "Gráfica conductores por licencia", requires: ["gestion"] },

      // ── Alertas: pieza consolidada ──
      feed_alertas:                 { label: "Feed de alertas activas",       requires: ["alertas"] },

      // ── Actividad y próximos ──
      timeline_actividad:           { label: "Timeline de actividad reciente", requires: ["alertas"] },
      tabla_proximos_mantenimientos: { label: "Tabla próximos mantenimientos", requires: ["mantenimiento"] },

      // ── Por sede ──
      flota_por_sede:               { label: "Flota agrupada por sede",       requires: ["gestion"] },
      kpis_por_sede:                { label: "KPIs por sede",                 requires: ["gestion"] },

      // ── Por garaje ──
      flota_por_garaje:             { label: "Flota agrupada por garaje",     requires: ["gestion"] },
      ocupacion_garajes:            { label: "Ocupación de garajes",          requires: ["gestion"] },

      // ── Combustible profundo ──
      consumo_por_vehiculo:         { label: "Consumo de combustible por vehículo", requires: ["combustible"] },
      costo_por_vehiculo:           { label: "Costo de combustible por vehículo",    requires: ["combustible"] },
      consumo_por_conductor:        { label: "Consumo de combustible por conductor", requires: ["combustible"] },

      // ── Asignaciones y conductores ──
      estado_asignaciones:           { label: "Estado de asignaciones",       requires: ["gestion"] },
      disponibilidad_conductores:   { label: "Disponibilidad de conductores", requires: ["gestion"] },
      kpis_mis_vehiculos:           { label: "Mis vehículos asignados",       requires: ["gestion"] },

      // ── Seguros ──
      polizas_por_vencer:           { label: "Pólizas de seguro por vencer",  requires: ["seguros"] },
      cobertura_activos:             { label: "Cobertura de seguros en activos", requires: ["seguros"] },

      // ── Checklists ──
      kpis_checklists:               { label: "KPIs de inspecciones",          requires: ["checklist"] },
      checklists_pendientes:         { label: "Inspecciones pendientes",      requires: ["checklist"] },

      // ── Aceite ──
      proximo_cambio_aceite:         { label: "Próximos cambios de aceite",   requires: ["gestion"] },

      // ── Aires acondicionados ──
      kpis_ac:                       { label: "KPIs de aires acondicionados",  requires: ["ac"] },
      servicios_ac_pendientes:       { label: "Servicios de A/C pendientes",   requires: ["ac"] },

      // ── Auditoría ──
      actividad_por_usuario:         { label: "Actividad por usuario",         requires: ["alertas"] },
      actividad_por_entidad:        { label: "Actividad por entidad",        requires: ["alertas"] },
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
      // mantenimiento).
      facturas: "Facturas",
      // jul 2026 v4 — Caja Chica:
      //   ver    = ver pestaña + listar solicitudes/vales/historial
      //   crear  = crear solicitud (operador)
      //   aprobar= aprobar/rechazar + clasificar como caja chica / gasto anual
      // Rellenar caja chica es acción separada "reponer" (solo admin/owner).
      caja_chica: "Caja Chica",
      // jul 2026 v4 — Transacciones: línea de tiempo global (caja chica +
      // gastos anuales), filtros, exportar PDF.
      transacciones: "Transacciones",
      // jul 2026 v4-b — Submódulo Estadísticas: agregaciones (gráfico de
      // barras 12 meses, drill-down semana/día, top vehículos). Permiso
      // independiente de facturas: un usuario puede ver Estadísticas SIN
      // tener acceso al listado fila-por-fila de facturas. Coherente con
      // como caja_chica y transacciones tienen su propio permission path.
      estadisticas: "Estadísticas",
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
// jul 2026 v4 — agregamos `aprobar` (caja_chica, checklist.reauth, etc.) y
// `reponer` (solo caja_chica — rellenar caja chica). El backend acepta
// cualquier string en permissions[] — los extras son semánticos.
// jul 2026 v4-b — Acciones granulares adicionales para Caja Chica:
//   ver_solicitudes  = puede ver la pestaña de Solicitudes (default de `ver`)
//   ver_vales        = puede ver la pestaña Vales
//   ver_historial    = puede ver la pestaña Historial (timeline movimientos)
//   configurar_caja  = pestaña Configuración (reponer / crear cuenta)
//   ver_saldo_total  = puede ver la card "Saldo total" (suma de todas las cajas)
//   ver_saldo_sede   = puede ver la card por sede (su caja chica asignada).
//                       Si solo tiene `ver_saldo_sede`, no ve la card de total.
//                       admin_empresa / owner_empresa / superadmin bypasean.
//   revisar_facturas = acceso a las pestañas "Facturas por revisar" y
//                       "Correcciones" del submódulo Caja Chica, y a los
//                       modales de revisión contable. admin/owner/superadmin bypasean.
export type ActionKey    = "ver" | "crear" | "editar" | "eliminar" | "aprobar" | "reponer"
                          | "ver_solicitudes" | "ver_vales" | "ver_historial" | "configurar_caja"
                          | "ver_todos"
                          | "ver_saldo_total" | "ver_saldo_sede"
                          | "revisar_facturas";
export type PermissionMap = Record<string, Record<string, ActionKey[]>>;

// jul 2026 v6 — Cada submódulo puede declarar de cuáles módulos de la
// empresa depende. Si la empresa no tiene esos módulos activos, el
// PermissionEditor (y otros consumidores) lo ocultan. Útil para el
// `dashboard.*` que agrupa submódulos que viven en módulos reales
// (mantenimiento, combustible, alertas, gestion, etc.) pero que están
// anidados bajo `dashboard` para el permission system.
export interface SubmoduleDef {
  label: string;
  /** Módulos de empresa requeridos. Si la empresa no tiene TODOS estos
   *  módulos habilitados, el submódulo se oculta en el editor. Vacío
   *  = siempre visible (no depende de nada). */
  requires?: string[];
}

export const ACTION_LABELS: Record<ActionKey, string> = {
  ver:                "Ver",
  crear:              "Crear",
  editar:             "Editar",
  eliminar:           "Eliminar",
  aprobar:            "Aprobar",
  reponer:            "Reponer",
  ver_solicitudes:    "Ver Solicitudes",
  ver_vales:          "Ver Vales",
  ver_historial:      "Ver Historial",
  configurar_caja:    "Configurar Caja",
  ver_todos:          "Ver Todos",
  ver_saldo_total:    "Ver Saldo Total",
  ver_saldo_sede:     "Ver Saldo por Sede",
  // jul 2026 v5 — Permiso granular para revisar facturas de
  // repuestos. Configurable desde Accesos → Usuarios para darlo
  // individualmente a quien deba revisar (admin/owner bypasean).
  revisar_facturas:   "Revisar Facturas",
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
  aprobar:  {
    active:   "bg-violet-600 text-white border-violet-600",
    inactive: "bg-transparent text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/[0.15]",
  },
  reponer:  {
    active:   "bg-cyan-600 text-white border-cyan-600",
    inactive: "bg-transparent text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/[0.15]",
  },
  // jul 2026 v5 — Acciones granulares. Todas comparten el "inactive"
  // gris (no tienen un color fuerte asignado). El editor las muestra
  // como toggles adicionales; si no se tildan, no aparecen en el
  // mapa `modulePermissions` del usuario.
  ver_solicitudes: {
    active:   "bg-slate-700 text-white border-slate-700",
    inactive: "bg-transparent text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/[0.15]",
  },
  ver_vales: {
    active:   "bg-slate-700 text-white border-slate-700",
    inactive: "bg-transparent text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/[0.15]",
  },
  ver_historial: {
    active:   "bg-slate-700 text-white border-slate-700",
    inactive: "bg-transparent text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/[0.15]",
  },
  configurar_caja: {
    active:   "bg-slate-700 text-white border-slate-700",
    inactive: "bg-transparent text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/[0.15]",
  },
  ver_todos: {
    active:   "bg-slate-700 text-white border-slate-700",
    inactive: "bg-transparent text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/[0.15]",
  },
  ver_saldo_total: {
    active:   "bg-slate-700 text-white border-slate-700",
    inactive: "bg-transparent text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/[0.15]",
  },
  ver_saldo_sede: {
    active:   "bg-slate-700 text-white border-slate-700",
    inactive: "bg-transparent text-gray-400 dark:text-gray-500 border-gray-200 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/[0.15]",
  },
  // jul 2026 v5 — Acento violeta para distinguir "Revisar Facturas"
  // del resto (es la acción de contabilidad, la más "pesada").
  revisar_facturas: {
    active:   "bg-violet-600 text-white border-violet-600",
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