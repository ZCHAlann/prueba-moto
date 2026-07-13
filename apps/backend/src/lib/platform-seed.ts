// src/lib/platform-seed.ts
// jul 2026 — Seed del catálogo de módulos y planes default.
//
// Esta función se ejecuta al arrancar el backend (en `index.ts`) y al
// cambiar el seed desde el frontend. Es idempotente: corre las veces que
// sea; solo crea lo que falta y actualiza lo que cambió.
//
// Fuentes de verdad:
//   - Módulos/submódulos: hardcoded acá (mirror del lib/module-tree.ts
//     del frontend, pero como fuente estable de BD).
//   - Planes: 4 planes (Starter / Pro / Business / Enterprise) sembrados
//     al primer arranque. El superadmin puede editarlos después.
//   - Relación plan → módulos: se siembra asignando cada plan a su set de
//     módulos respectivo.

import { db } from '../db/client';
import {
  platformModules,
  platformModuleSubmodules,
  platformPlanModules,
  platformPlans,
} from '../db/schema/platform';
import { sql } from 'drizzle-orm';

// ─── Catálogo de módulos (espejo del MODULE_TREE del frontend) ────────────────

interface SubmoduleDef {
  id: string;
  label: string;
}

interface ModuleDef {
  id: string;
  label: string;
  description: string;
  icon: string;
  accent: string;
  isCore?: boolean;
  sortOrder: number;
  submodules: SubmoduleDef[];
}

export const MODULES_CATALOG: ModuleDef[] = [
  {
    id: 'dashboard', label: 'Dashboard', description: 'Vista general operativa con KPIs, gráficas y tablas.', icon: 'LayoutDashboard', accent: 'emerald', isCore: true, sortOrder: 10,
    submodules: [
      { id: 'dashboard.kpis_flotas',              label: 'KPIs de flota' },
      { id: 'dashboard.kpis_mantenimiento',       label: 'KPIs de mantenimiento' },
      { id: 'dashboard.kpis_combustible',         label: 'KPIs de combustible' },
      { id: 'dashboard.kpis_conductores',         label: 'KPIs de conductores' },
      { id: 'dashboard.chart_combustible_mes',    label: 'Gráfica combustible por mes' },
      { id: 'dashboard.chart_mantenimientos_mes', label: 'Gráfica mantenimientos por mes' },
      { id: 'dashboard.chart_flotas_estado',      label: 'Gráfica flota por estado' },
      { id: 'dashboard.chart_flotas_categoria',   label: 'Gráfica flota por categoría' },
      { id: 'dashboard.chart_conductores_licencia', label: 'Gráfica conductores por licencia' },
      { id: 'dashboard.feed_alertas',             label: 'Feed de alertas activas' },
      { id: 'dashboard.timeline_actividad',       label: 'Timeline de actividad reciente' },
      { id: 'dashboard.tabla_proximos_mantenimientos', label: 'Próximos mantenimientos' },
      { id: 'dashboard.flota_por_sede',           label: 'Flota agrupada por sede' },
      { id: 'dashboard.kpis_por_sede',            label: 'KPIs por sede' },
      { id: 'dashboard.consumo_por_vehiculo',     label: 'Consumo por vehículo' },
      { id: 'dashboard.costo_por_vehiculo',       label: 'Costo por vehículo' },
      { id: 'dashboard.estado_asignaciones',      label: 'Estado de asignaciones' },
      { id: 'dashboard.disponibilidad_conductores', label: 'Disponibilidad de conductores' },
      { id: 'dashboard.kpis_mis_vehiculos',       label: 'Mis vehículos asignados' },
      { id: 'dashboard.polizas_por_vencer',       label: 'Pólizas por vencer' },
      { id: 'dashboard.cobertura_activos',        label: 'Cobertura de seguros en activos' },
      { id: 'dashboard.kpis_checklists',          label: 'KPIs de inspecciones' },
      { id: 'dashboard.checklists_pendientes',    label: 'Inspecciones pendientes' },
      { id: 'dashboard.proximo_cambio_aceite',    label: 'Próximos cambios de aceite' },
      { id: 'dashboard.kpis_ac',                  label: 'KPis de A/C' },
      { id: 'dashboard.actividad_por_usuario',    label: 'Actividad por usuario' },
    ],
  },
  {
    id: 'gestion', label: 'Gestión', description: 'Flotas, conductores, sedes, garajes, seguros, talleres, proveedores y asignaciones.', icon: 'Settings', accent: 'sky', sortOrder: 20,
    submodules: [
      { id: 'gestion.flotas',       label: 'Flotas' },
      { id: 'gestion.conductores',  label: 'Conductores' },
      { id: 'gestion.sedes',        label: 'Sedes' },
      { id: 'gestion.garajes',      label: 'Garajes' },
      { id: 'gestion.asignaciones', label: 'Asignar vehículo' },
      { id: 'gestion.talleres',     label: 'Talleres' },
      { id: 'gestion.proveedores',  label: 'Proveedores' },
    ],
  },
  {
    id: 'seguros', label: 'Seguros', description: 'Pólizas de seguro de los vehículos.', icon: 'Shield', accent: 'sky', sortOrder: 30,
    submodules: [
      { id: 'seguros.polizas', label: 'Pólizas de seguro' },
    ],
  },
  {
    id: 'generadores', label: 'Generadores', description: 'Equipos de respaldo eléctrico por sede.', icon: 'Zap', accent: 'orange', sortOrder: 40,
    submodules: [
      { id: 'generadores.generadores', label: 'Generadores eléctricos' },
    ],
  },
  {
    id: 'ac', label: 'Aires acondicionados', description: 'Inventario y servicios de unidades A/C.', icon: 'Wind', accent: 'cyan', sortOrder: 50,
    submodules: [
      { id: 'ac.lista_ac',          label: 'Lista de A/C' },
      { id: 'ac.mantenimientos_ac', label: 'Mantenimientos de A/C' },
    ],
  },
  {
    id: 'mantenimiento', label: 'Mantenimiento', description: 'Agenda, ejecución y registro de mantenimientos preventivos y correctivos.', icon: 'Wrench', accent: 'amber', sortOrder: 60,
    submodules: [
      { id: 'mantenimiento.agenda',           label: 'Agendar' },
      { id: 'mantenimiento.execution',        label: 'Preventivo y correctivo' },
      { id: 'mantenimiento.records',          label: 'Histórico de mantenimientos' },
      { id: 'mantenimiento.reautorizaciones', label: 'Reautorización de atrasados' },
    ],
  },
  {
    id: 'checklist', label: 'Checklist', description: 'Plantillas, inspecciones e historial.', icon: 'ClipboardCheck', accent: 'lime', sortOrder: 70,
    submodules: [
      { id: 'checklist.checklist',          label: 'Checklist' },
      { id: 'checklist.inspecciones',       label: 'Inspecciones' },
      { id: 'checklist.historial',          label: 'Historial' },
      { id: 'checklist.reautorizaciones',   label: 'Reautorización de atrasados' },
    ],
  },
  {
    id: 'autorizaciones', label: 'Autorizaciones', description: 'Solicitudes de salida de vehículos con análisis IA.', icon: 'LogOut', accent: 'emerald', sortOrder: 80,
    submodules: [
      { id: 'autorizaciones.autorizaciones', label: 'Autorizaciones de salida' },
    ],
  },
  {
    id: 'alertas', label: 'Alertas', description: 'Alertas manuales, de mantenimiento y vencimientos.', icon: 'AlertTriangle', accent: 'rose', sortOrder: 90,
    submodules: [
      { id: 'alertas.alertas', label: 'Alertas' },
    ],
  },
  {
    id: 'reportes', label: 'Reportes', description: 'Centro de reportes operativos y ejecutivos.', icon: 'FileText', accent: 'cyan', sortOrder: 100,
    submodules: [
      { id: 'reportes.reportes',       label: 'Reportes' },
      { id: 'reportes.estadisticas',   label: 'Estadísticas' },
    ],
  },
  {
    id: 'lienzo', label: 'Lienzo', description: 'Dashboards personalizables con KPIs, gráficos y tablas comparativas.', icon: 'LayoutGrid', accent: 'violet', sortOrder: 110,
    submodules: [
      { id: 'lienzo.lienzo', label: 'Lienzo de presentación' },
    ],
  },
  {
    id: 'combustible', label: 'Combustible', description: 'Control de consumo, costo y rendimiento.', icon: 'Fuel', accent: 'orange', sortOrder: 120,
    submodules: [
      { id: 'combustible.combustible', label: 'Combustible' },
    ],
  },
  {
    id: 'peajes', label: 'Peajes', description: 'Cruces, ruta y monto.', icon: 'TollBoth', accent: 'amber', sortOrder: 130,
    submodules: [
      { id: 'peajes.peajes', label: 'Peajes' },
    ],
  },
  {
    id: 'geolocalizacion', label: 'Geolocalización', description: 'Ubicación operativa y monitoreo de unidades.', icon: 'MapPin', accent: 'teal', sortOrder: 140,
    submodules: [
      { id: 'geolocalizacion.geolocalizacion', label: 'Geolocalización' },
    ],
  },
  {
    id: 'finanzas', label: 'Finanzas', description: 'Facturas, caja chica, transacciones y estadísticas.', icon: 'DollarSign', accent: 'emerald', sortOrder: 150,
    submodules: [
      { id: 'finanzas.facturas',         label: 'Facturas' },
      { id: 'finanzas.caja_chica',       label: 'Caja Chica' },
      { id: 'finanzas.transacciones',    label: 'Transacciones' },
      { id: 'finanzas.estadisticas',     label: 'Estadísticas' },
    ],
  },
  {
    id: 'accesos', label: 'Accesos', description: 'Usuarios, roles y permisos de la empresa.', icon: 'Users', accent: 'teal', sortOrder: 160,
    submodules: [
      { id: 'accesos.usuarios', label: 'Usuarios' },
      { id: 'accesos.roles',    label: 'Roles y permisos' },
    ],
  },
  {
    id: 'jarvis', label: 'Asistente IA', description: 'Asistente IA para consultas y acciones sobre la operación.', icon: 'Sparkles', accent: 'violet', sortOrder: 170,
    submodules: [
      { id: 'jarvis.asistente', label: 'Asistente IA' },
    ],
  },
  {
    id: 'soporte', label: 'Soporte', description: 'Tickets de soporte interno.', icon: 'LifeBuoy', accent: 'emerald', sortOrder: 180,
    submodules: [
      { id: 'soporte.soporte', label: 'Soporte' },
    ],
  },
];

// ─── Sets de módulos por plan ────────────────────────────────────────────────
//
// Reglas:
//   - Starter: dashboard, gestion, alertas, reportes, combustible, accesos.
//   - Pro: Starter + mantenimiento, checklist, autorizaciones, peajes, geolocalizacion, generadores, seguros, ac, lienzo, finanzas (sin caja chica), soporte.
//   - Business: Pro + caja chica, finanzas avanzado, jarvis, roles custom.
//   - Enterprise: Business + todo lo extra (white label, integraciones a medida).

const ALL_MODULE_IDS = MODULES_CATALOG.map(m => m.id);

const STARTER_MODULES = [
  'dashboard', 'gestion', 'alertas', 'reportes',
  'combustible', 'accesos',
  // Por defecto incluye seguros básicos dentro de gestion
];

const PRO_MODULES = [
  ...STARTER_MODULES,
  'mantenimiento', 'checklist', 'autorizaciones', 'peajes',
  'geolocalizacion', 'generadores', 'seguros', 'ac', 'lienzo',
  'soporte',
];

const BUSINESS_MODULES = [
  ...PRO_MODULES,
  'finanzas',
];

const ENTERPRISE_MODULES = [
  ...ALL_MODULE_IDS,
];

// ─── Definición de los 4 planes ──────────────────────────────────────────────

interface PlanDef {
  id: string;
  name: string;
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  monthlyPrice: string;
  annualPrice: string;
  maxUsers: number | null;
  maxAdmins: number | null;
  maxSupervisors: number | null;
  maxOperators: number | null;
  maxDrivers: number | null;
  maxAssets: number | null;
  description: string;
  features: string[];
  isPopular?: boolean;
  sortOrder: number;
  modules: string[];
}

export const PLAN_DEFS: PlanDef[] = [
  {
    id: 'starter',
    name: 'Starter',
    tier: 'starter',
    monthlyPrice: '29',
    annualPrice: '290',
    maxUsers:     10,
    maxAdmins:    2,
    maxSupervisors: 2,
    maxOperators: 2,
    maxDrivers:   10,
    maxAssets:    30,
    description: 'Para equipos pequeños que recién ordenan su operación.',
    features: [
      'Hasta 10 usuarios y 30 vehículos',
      '1 sede',
      'Gestión de flotas y conductores',
      'Combustible y alertas básicas',
      'Reportes operativos estándar',
      'Soporte por correo',
    ],
    sortOrder: 20,
    modules: STARTER_MODULES,
  },
  {
    id: 'pro',
    name: 'Pro',
    tier: 'pro',
    monthlyPrice: '89',
    annualPrice: '890',
    maxUsers:     30,
    maxAdmins:    3,
    maxSupervisors: 5,
    maxOperators: 10,
    maxDrivers:   30,
    maxAssets:    200,
    description: 'El más elegido. Pensado para empresas con varias sedes y mantenimiento programado.',
    features: [
      'Hasta 30 usuarios y 200 vehículos',
      'Hasta 5 sedes',
      'Mantenimiento y checklist',
      'Autorizaciones de salida con análisis IA',
      'Combustible, peajes y reportes avanzados',
      'Motores, generadores y aires acondicionados',
      'Soporte prioritario',
    ],
    isPopular: true,
    sortOrder: 30,
    modules: PRO_MODULES,
  },
  {
    id: 'business',
    name: 'Business',
    tier: 'pro',           // mapea a 'pro' en el enum hasta migrarlo
    monthlyPrice: '199',
    annualPrice: '1990',
    maxUsers:     100,
    maxAdmins:    10,
    maxSupervisors: 30,
    maxOperators: 50,
    maxDrivers:   100,
    maxAssets:    1000,
    description: 'Para operaciones grandes con caja chica, finanzas y roles a medida.',
    features: [
      'Hasta 100 usuarios y 1000 vehículos',
      'Sedes ilimitadas',
      'Finanzas: facturas, caja chica, transacciones',
      'Roles personalizados por empresa',
      'Lienzo de dashboards personalizables',
      'Asistente IA Jarvis',
      'Soporte 24/7',
    ],
    sortOrder: 40,
    modules: BUSINESS_MODULES,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tier: 'enterprise',
    monthlyPrice: '499',
    annualPrice: '4990',
    maxUsers:     null,
    maxAdmins:    null,
    maxSupervisors: null,
    maxOperators: null,
    maxDrivers:   null,
    maxAssets:    null,
    description: 'Para operaciones críticas con todo habilitado y soporte dedicado.',
    features: [
      'Usuarios y activos ilimitados',
      'Todo lo de Business + integraciones a medida',
      'Onboarding dedicado y gerente de cuenta',
      'SLA personalizado',
      'White-label opcional',
    ],
    sortOrder: 50,
    modules: ENTERPRISE_MODULES,
  },
];

// ─── Plan "free" (legacy para empresas existentes / trial) ──────────────────

export const PLAN_LEGACY_FREE: PlanDef = {
  id: 'free',
  name: 'Free',
  tier: 'free',
  monthlyPrice: '0',
  annualPrice: '0',
  maxUsers:     3,
  maxAdmins:    1,
  maxSupervisors: 1,
  maxOperators: 1,
  maxDrivers:   3,
  maxAssets:    5,
  description: 'Plan inicial gratuito con funcionalidades mínimas.',
  features: [
    'Hasta 3 usuarios y 5 vehículos',
    'Dashboard y alertas básicas',
    'Sin mantenimiento ni checklist',
    'Solo comunidad / soporte por correo',
  ],
  sortOrder: 10,
  modules: ['dashboard', 'gestion', 'alertas', 'accesos'],
};

// ─── Run idempotente ─────────────────────────────────────────────────────────

export async function seedPlatformCatalog(): Promise<void> {
  // 1) Módulos y submódulos
  for (const m of MODULES_CATALOG) {
    await db
      .insert(platformModules)
      .values({
        id: m.id, label: m.label, description: m.description,
        icon: m.icon, accent: m.accent, isCore: !!m.isCore,
        sortOrder: m.sortOrder, isActive: true,
      })
      .onConflictDoUpdate({
        target: platformModules.id,
        set: {
          label: m.label, description: m.description,
          icon: m.icon, accent: m.accent, sortOrder: m.sortOrder,
          isCore: !!m.isCore, updatedAt: new Date(),
        },
      });

    for (const s of m.submodules) {
      await db
        .insert(platformModuleSubmodules)
        .values({ id: s.id, moduleId: m.id, label: s.label, isActive: true, sortOrder: 100 })
        .onConflictDoUpdate({
          target: platformModuleSubmodules.id,
          set: { moduleId: m.id, label: s.label },
        });
    }
  }

  // 2) Planes (incluido legacy free)
  const allPlans = [...PLAN_DEFS, PLAN_LEGACY_FREE];
  for (const p of allPlans) {
    await db
      .insert(platformPlans)
      .values({
        id: p.id, name: p.name, tier: p.tier,
        monthlyPrice: p.monthlyPrice, annualPrice: p.annualPrice,
        maxUsers: p.maxUsers, maxAdmins: p.maxAdmins,
        maxSupervisors: p.maxSupervisors, maxOperators: p.maxOperators,
        maxDrivers: p.maxDrivers, maxAssets: p.maxAssets,
        description: p.description, features: p.features,
        isPopular: !!p.isPopular, sortOrder: p.sortOrder,
        currency: 'USD', isActive: true,
        allowedModules: p.modules, // compat
      })
      .onConflictDoUpdate({
        target: platformPlans.id,
        set: {
          name: p.name, tier: p.tier,
          monthlyPrice: p.monthlyPrice, annualPrice: p.annualPrice,
          maxUsers: p.maxUsers, maxAdmins: p.maxAdmins,
          maxSupervisors: p.maxSupervisors, maxOperators: p.maxOperators,
          maxDrivers: p.maxDrivers, maxAssets: p.maxAssets,
          description: p.description, features: p.features,
          isPopular: !!p.isPopular, sortOrder: p.sortOrder,
          updatedAt: new Date(),
        },
      });

    // 3) Relación plan-módulo (sin tocar lo que el usuario ya deshabilitó)
    for (const modId of p.modules) {
      // Chequear si existe (idempotente)
      const exists = await db.execute(sql`
        SELECT 1 FROM platform_plan_modules
        WHERE plan_id = ${p.id} AND module_id = ${modId}
        LIMIT 1
      `);
      if (exists.length === 0) {
        await db.insert(platformPlanModules).values({ planId: p.id, moduleId: modId });
      }
    }
  }

  console.log('[seed] platform catalog: %d modules, %d plans', MODULES_CATALOG.length, allPlans.length);
}
