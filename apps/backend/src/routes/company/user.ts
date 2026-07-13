import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyUsers,
  companyRoles,
  companyUserCounts,
  companies,
  platformPlans,
} from '../../db/schema/platform';
import { validate } from '../../lib/validate';
import { requirePermissionAny } from '../../middlewares/requirePermission';
import { NotFoundError, AppError, ForbiddenError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { hashPassword } from '../../services/auth.service';
import { validators } from '../../lib/validators';
import { syncDriverWithUser, onUserDelete } from '../../services/driver-sync.service';
import { parsePageParams, buildPageResponse } from '../../lib/pagination';
import {
  notify,
  notifyAdminsExceptActor,
} from '../../lib/notification-service';
import { wsBroadcast } from '../../services/websocket';

// ─── Helper: nombre corto del usuario (cargo) para mostrar en el toast ────
//
// Lee `profileData.position` (cargo) o `profileData.area` como fallback.
// Si no hay nada, devuelve el username como último recurso.
function userShortLabel(u: { profileData?: unknown; username: string; email: string }): string {
  const pd = (u.profileData as Record<string, unknown> | null) ?? {};
  const position = typeof pd.position === 'string' ? pd.position.trim() : '';
  const fullName = typeof pd.fullName === 'string' ? pd.fullName.trim() : '';
  const label = fullName || u.username || u.email;
  return position ? `${label} — ${position}` : label;
}

// Mapea roleKey de la empresa a la "categoría de plan" que cuenta
// contra el límite:
//   owner_empresa | admin_empresa | superadmin_empresa → admins
//   supervisor                                                → supervisors
//   operador                                                   → operators
//   conductor                                                  → drivers
// Roles custom (no platform) caen en su key en minúscula.
type RoleKind = 'admins' | 'supervisors' | 'operators' | 'drivers';

function kindFromRole(roleKey: string): RoleKind {
  if (['owner_empresa', 'admin_empresa'].includes(roleKey)) return 'admins';
  if (roleKey === 'supervisor') return 'supervisors';
  if (roleKey === 'operador')   return 'operators';
  if (roleKey === 'conductor')  return 'drivers';
  // Custom roles cuentan como "operators" por defecto (lo más común).
  return 'operators';
}

/**
 * jul 2026 — Valida que la creación/edición de un usuario no supere
 * los límites del plan de la empresa. Lanza AppError(403) con un
 * mensaje claro si se excede.
 *
 * Por diseño: si el admin intenta crear el usuario de todos modos,
 * falla ANTES de tocar la BD, así no queda en estado inconsistente
 * con los triggers.
 *
 * Los superadmin (rol plataforma) y los platformUsers NO se validan
 * acá — es solo para usuarios de empresa.
 */
async function assertWithinPlanLimits(
  companyId: number,
  roleKey: string,
  currentCount: number,
  opts?: { ignoreUserId?: number },
): Promise<void> {
  const [company] = await db
    .select({ planId: companies.planId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) throw new NotFoundError('Empresa', String(companyId));

  const [plan] = await db
    .select()
    .from(platformPlans)
    .where(eq(platformPlans.id, company.planId))
    .limit(1);
  if (!plan) return; // si no hay plan, no aplicar límite

  const [counts] = await db
    .select()
    .from(companyUserCounts)
    .where(eq(companyUserCounts.companyId, companyId))
    .limit(1);
  const c = counts ?? { total: 0, admins: 0, supervisors: 0, operators: 0, drivers: 0, companyId, updatedAt: new Date() };

  // Si ignoreUserId viene (caso PUT), restamos 1 al kind correspondiente
  // para no contar dos veces al usuario que se está editando.
  const kind = kindFromRole(roleKey);
  const kindCount = (() => {
    let n = c[kind];
    return n;
  })();

  // Límite total
  if (plan.maxUsers !== null && c.total + currentCount > plan.maxUsers) {
    throw new AppError(403,
      `El plan "${plan.name}" permite máximo ${plan.maxUsers} usuarios en total. Ya hay ${c.total} activos.`,
    );
  }

  // Límite por rol
  const limitByKind: Record<RoleKind, number | null> = {
    admins:      plan.maxAdmins,
    supervisors: plan.maxSupervisors,
    operators:   plan.maxOperators,
    drivers:     plan.maxDrivers,
  };
  const limit = limitByKind[kind];
  if (limit !== null && kindCount + currentCount > limit) {
    throw new AppError(403,
      `El plan "${plan.name}" permite máximo ${limit} ${labelFor(kind)}. Ya hay ${kindCount} activos.`,
    );
  }
}

function labelFor(kind: RoleKind): string {
  switch (kind) {
    case 'admins':      return 'administradores';
    case 'supervisors': return 'supervisores';
    case 'operators':   return 'operadores';
    case 'drivers':     return 'conductores';
  }
}

const router = Router({ mergeParams: true });

// ─── Schemas ──────────────────────────────────────────────────────────────────

/**
 * Roles "de plataforma" — tienen acceso total sin necesidad de estar
 * en la tabla `company_roles`. Los admins de empresa eligen desde el
 * catálogo persistente (default + custom). Validamos que el `role`
 * enviado en create/update exista en el catálogo de la empresa, o sea
 * uno de los platform roles.
 */
const PLATFORM_ROLES = new Set([
  'owner_empresa',
  'admin_empresa',
  'superadmin',
]);

// jul 2026 v4-b — Acciones de permisos aceptadas en el backend.
// Coinciden con `ActionKey` del frontend (module-tree.ts). Cubre las
// acciones básicas (ver/crear/editar/eliminar) más las custom que
// usamos para Caja Chica, checklists y módulos de finanzas:
//
//   aprobar          - caja_chica (aprobar/rechazar solicitudes),
//                      checklist.reautorizaciones, etc.
//   reponer          - caja_chica (rellenar caja chica)
//   ver_solicitudes  - caja_chica (muestra tab Solicitudes)
//   ver_vales        - caja_chica (muestra tab Vales)
//   ver_historial    - caja_chica (muestra tab Historial)
//   configurar_caja  - caja_chica (muestra tab Configuración)
//   ver_todos        - caja_chica (bypass de filtro por dueño)
//   ver_saldo_total  - caja_chica (card "Saldo total")
//   ver_saldo_sede   - caja_chica (card por sede)
//   revisar_facturas - caja_chica (acceso a pestañas "Facturas por revisar"
//                     y "Correcciones", y a los modales de revisión).
//                     admin/owner/superadmin bypasean via usePermissions.
const PERMISSION_ACTIONS = [
  "ver",
  "crear",
  "editar",
  "eliminar",
  "aprobar",
  "reponer",
  "ver_solicitudes",
  "ver_vales",
  "ver_historial",
  "configurar_caja",
  "ver_todos",
  "ver_saldo_total",
  "ver_saldo_sede",
  "revisar_facturas",
] as const;

const modulePermissionsSchema = z.record(
  z.string(),
  z.record(z.string(), z.array(z.enum(PERMISSION_ACTIONS)))
).default({});

const createCompanyUserSchema = z.object({
  email:             validators.email,
  username:          z.string().trim().min(3, 'El usuario debe tener al menos 3 caracteres').max(40)
                       .regex(/^[a-zA-Z0-9_.-]+$/, 'Solo letras, números, guion, guion bajo y punto'),
  password:          z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  role:              z.string().trim().min(1).max(60),
  status:            z.enum(['active', 'inactive']).default('active'),
  // jun 2026 — cédula/DNI del usuario. Opcional pero recomendado para
  // conductores. Migración 0040. Si el front lo manda vacío, persistimos
  // null (no pisamos profileData.documentNumber).
  dni:               z.string().trim().regex(/^[0-9 \-]{7,20}$/, 'DNI debe tener 7-20 dígitos (puede tener guiones/espacios)').nullable().optional(),
  modulePermissions: modulePermissionsSchema,
  profileData:       z.record(z.string(), z.unknown()).default({}),
  photoUrl:          z.string().min(1).max(2_000_000).nullable().optional(),
});

const updateCompanyUserSchema = createCompanyUserSchema
  .omit({ password: true })
  .extend({ password: z.string().min(8).max(128).optional() })
  .partial();

/** Verifica que un `role` sea válido para la empresa: platform role o key en el catálogo. */
async function assertRoleValid(companyId: number, roleKey: string): Promise<void> {
  if (PLATFORM_ROLES.has(roleKey)) return;
  const [row] = await db
    .select({ id: companyRoles.id })
    .from(companyRoles)
    .where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.key, roleKey)))
    .limit(1);
  if (!row) {
    throw new AppError(400, `El rol "${roleKey}" no existe en el catálogo de la empresa.`);
  }
}

/**
 * Permisos de un conductor NUEVO o sin permisos asignados.
 *
 * Por diseño un conductor sólo necesita ver sus checklists
 * y los vehículos que tiene asignados. El editor de la UI
 * aplica `readOnlyWithFullAccess` cuando el target es bypass,
 * así que esta plantilla es lo que efectivamente verá el operador
 * al crear un conductor desde la pantalla de Usuarios.
 *
 * Nota: se mantiene acá (no se importa del frontend) para que el
 * backend siempre tenga un fallback determinista aunque el catálogo
 * `company_roles` aún no haya sido sembrado para esa empresa.
 */
function conductorDefaultModulePermissions(): Record<string, Record<string, string[]>> {
  return {
    dashboard:     { dashboard: ['ver'] },
    checklist:     { checklist: ['ver', 'crear'] },
    gestion:       { conductores: ['ver'] },
  };
}

/**
 * Resuelve los permisos que un usuario con `roleKey` debe tener.
 *
 *  - Roles de plataforma (`owner_empresa` / `admin_empresa` /
 *    `superadmin`) → permisos totales (el caller con scope 'full'
 *    los edita a voluntad).
 *  - Cualquier otra `roleKey` → se lee la fila del catálogo
 *    `company_roles` para esta empresa. Si no existe fila,
 *    se usa el fallback hardcoded (sólo `conductor` lo usa hoy).
 *
 * Esto es la FUENTE DE VERDAD para que el operador (scope 'conductor')
 * NO pueda inyectar `modulePermissions` arbitrarios.
 */
async function resolveModulePermissionsForRole(
  companyId: number,
  roleKey: string
): Promise<Record<string, Record<string, string[]>>> {
  if (PLATFORM_ROLES.has(roleKey)) {
    // Bypass roles: full access. El caller decide.
    return {
      dashboard:     { dashboard: ['ver'] },
      gestion: {
        flotas:        ['ver', 'crear', 'editar', 'eliminar'],
        conductores:   ['ver', 'crear', 'editar', 'eliminar'],
        sedes:         ['ver', 'crear', 'editar', 'eliminar'],
        garajes:       ['ver', 'crear', 'editar', 'eliminar'],
        asignaciones:  ['ver', 'crear', 'editar', 'eliminar'],
        talleres:      ['ver', 'crear', 'editar', 'eliminar'],
        proveedores:   ['ver', 'crear', 'editar', 'eliminar'],
      },
      seguros:       { polizas: ['ver', 'crear', 'editar', 'eliminar'] },
      mantenimiento: { agenda: ['ver', 'crear', 'editar', 'eliminar'], execution: ['ver', 'crear', 'editar', 'eliminar'], records: ['ver', 'crear', 'editar', 'eliminar'] },
      combustible:   { combustible: ['ver', 'crear', 'editar', 'eliminar'] },
      peajes:        { peajes: ['ver', 'crear', 'editar', 'eliminar'] },
      checklist:     { checklist: ['ver', 'crear', 'editar', 'eliminar'] },
      alertas:       { alertas: ['ver'] },
      reportes:      { reportes: ['ver'] },
      accesos:       { usuarios: ['ver', 'crear', 'editar', 'eliminar'], roles: ['ver', 'crear', 'editar', 'eliminar'] },
    };
  }
  const [row] = await db
    .select({ permissions: companyRoles.permissions })
    .from(companyRoles)
    .where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.key, roleKey)))
    .limit(1);
  if (row?.permissions && Object.keys(row.permissions as Record<string, unknown>).length > 0) {
    return row.permissions as Record<string, Record<string, string[]>>;
  }
  if (roleKey === 'conductor') return conductorDefaultModulePermissions();
  return {};
}

const permissionsSchema = z.object({
  modulePermissions: modulePermissionsSchema,
});

// ─── Scope de acceso al módulo de usuarios ───────────────────────────────────
//
// Determina qué tanto puede ver/gestionar el caller en /company/:id/users:
//
//   - 'full'      → admin/owner/superadmin (únicos roles con acceso total).
//                    Aunque tengan `accesos.usuarios.*` o
//                    `gestion.conductores.*`, si NO son admin/owner/supervisor
//                    siguen siendo scope 'conductor'.
//   - 'conductor' → cualquier otro usuario autenticado de la empresa, sin
//                    importar qué permisos granulares tenga (excepto
//                    admin/owner/supervisor). Solo puede ver/crear/editar/
//                    eliminar usuarios con role='conductor'. Esto bloquea
//                    que un operador o supervisor con permisos de
//                    `accesos.usuarios.*` escale privilegios sobre admins.
//   - 'none'      → sin acceso al módulo.
//
// Para las acciones individuales (ver/crear/editar/eliminar) seguimos
// gateando por permisos granulares del caller — un scope 'conductor' que
// NO tiene `gestion.conductores.crear` no puede crear, aunque tenga
// acceso al módulo.

function resolveUsersScope(user: NonNullable<Request['user']>): 'full' | 'conductor' | 'none' {
  if (['superadmin', 'owner_empresa', 'admin_empresa'].includes(user.role)) return 'full';

  // Cualquier otro usuario de la empresa (operador, supervisor, conductor
  // o custom roles que no sean admin) → scope 'conductor' por defecto.
  // El detalle fino de qué acción puede hacer (ver/crear/editar/eliminar)
  // se valida con permisos granulares en cada endpoint.
  return 'conductor';
}

// ─── Serializer ───────────────────────────────────────────────────────────────

/**
 * Normaliza `profileData` antes de persistirlo:
 *   - Si el frontend mandó `fullName` (un solo string con nombres y apellidos)
 *     y NO mandó `firstName`, lo partimos en firstName + lastName usando
 *     la convención: primer token = firstName, resto = lastName.
 *   - Esto resuelve el bug donde el módulo Conductores mostraba el driver
 *     con `firstName = username` y `lastName = "—"` porque el profileData
 *     solo traía `fullName`.
 *   - `documentNumber`, `phone`, `siteId`, `area`, `notes`, `site` se
 *     conservan tal cual.
 *
 *   Si el frontend ya manda `firstName` y `lastName` por separado, no se
 *   toca `fullName` (lo dejamos para referencia / mostrar en la tabla de
 *   Accesos).
 */
function normalizeProfileData(
  profileData: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!profileData || typeof profileData !== "object") return {};
  const out: Record<string, unknown> = { ...profileData };

  const hasFirst = typeof out.firstName === "string" && (out.firstName as string).trim().length > 0;
  const hasLast  = typeof out.lastName  === "string" && (out.lastName  as string).trim().length > 0;
  const fullRaw  = typeof out.fullName  === "string" ? (out.fullName as string).trim() : "";

  if (!hasFirst && !hasLast && fullRaw.length > 0) {
    // El frontend solo envió fullName. Partirlo.
    const tokens = fullRaw.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) {
      out.firstName = tokens[0];
    } else {
      out.firstName = tokens[0];
      out.lastName  = tokens.slice(1).join(" ");
    }
  } else if (!hasFirst && hasLast && fullRaw.length > 0) {
    // Mandó lastName pero no firstName. Sacar firstName de fullName si el
    // prefijo de fullName coincide con algo distinto al lastName.
    const tokens = fullRaw.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      out.firstName = tokens.slice(0, tokens.length - 1).join(" ");
    }
  }

  // Trim a todos los string para evitar espacios fantasma
  for (const k of Object.keys(out)) {
    if (typeof out[k] === "string") out[k] = (out[k] as string).trim();
  }

  return out;
}

/**
 * jun 2026 — Normaliza un DNI/cédula: lo deja en sólo dígitos, sin
 * espacios ni guiones. Devuelve null si el input está vacío o no tiene
 * dígitos suficientes (mínimo 7, para tolerar cédulas no-EC legacy).
 */
function normalizeDni(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 20) return null;
  return digits;
}

function serializeUser(u: typeof companyUsers.$inferSelect) {
  const profile = (u.profileData as Record<string, unknown>) ?? {};
  return {
    id:                toId('company-user', u.id),
    companyId:         toId('company', u.companyId),
    email:             u.email,
    username:          u.username,
    role:              u.role,
    status:            u.status,
    // jun 2026 — DNI/cédula del usuario. Si está NULL pero hay un
    // documentNumber en profileData (data legacy), lo exponemos como
    // fallback para que el frontend pueda autorrellenar. El writer
    // backend se asegura de que, una vez aplicado este fix, las nuevas
    // ediciones persistan en la columna dni (no solo en profileData).
    dni:               u.dni ?? (typeof profile.documentNumber === 'string' ? profile.documentNumber : null) ?? null,
    modulePermissions: (u.modulePermissions as Record<string, Record<string, string[]>>) ?? {},
    permissions:       {},  // deprecado, siempre vacío
    profileData:       profile,
    createdAt:         u.createdAt,
    updatedAt:         u.updatedAt,
    // Lo expone el frontend para sincronizar invalidación de sesión tras
    // cambios de permisos/rol.
    permissionsUpdatedAt: u.updatedAt?.toISOString() ?? null,
  };
}

// ─── GET /company/:id/users ───────────────────────────────────────────────────

router.get(
  '/',
  // Acepta `gestion.conductores.ver` (operador con scope 'conductor')
  // o `accesos.usuarios.ver` (legacy: `accesos.accesos.ver`).
  requirePermissionAny([
    { module: 'accesos', submodule: 'usuarios' },
    { module: 'gestion', submodule: 'conductores' },
  ], 'ver'),
  async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { page, pageSize, offset } = parsePageParams(req.query as Record<string, unknown>);
    const scope = resolveUsersScope(req.user!);

    // WHERE base: siempre aislado por empresa. Si el caller es scope
    // 'conductor' (cualquier usuario que NO sea admin/owner/superadmin,
    // sin importar qué permisos tenga), se filtra role='conductor' en
    // el WHERE — no en el frontend — para que no haya forma de pedir
    // "todos" desde el cliente ni de filtrar mal en la UI.
    const conds = [eq(companyUsers.companyId, companyId)];
    if (scope === 'conductor') {
      conds.push(eq(companyUsers.role, 'conductor'));
    }
    const where = and(...conds);

    const [rows, countRow] = await Promise.all([
      db.select().from(companyUsers)
        .where(where).orderBy(desc(companyUsers.createdAt))
        .limit(pageSize).offset(offset),
      db.select({ value: sql<number>`cast(count(*) as int)` }).from(companyUsers).where(where),
    ]);

    const total = countRow?.[0]?.value ?? 0;
    res.json(buildPageResponse(rows.map(serializeUser), total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/users/:userId ──────────────────────────────────────────

router.get(
  '/:userId',
  requirePermissionAny([
    { module: 'accesos', submodule: 'usuarios' },
    { module: 'gestion', submodule: 'conductores' },
  ], 'ver'),
  async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const userId    = parseId('company-user', req.params.userId);
    const scope     = resolveUsersScope(req.user!);

    const rows = await db
      .select()
      .from(companyUsers)
      .where(
        and(
          eq(companyUsers.id, userId),
          eq(companyUsers.companyId, companyId),
        )
      )
      .limit(1);

    if (!rows.length) throw new NotFoundError('Usuario', req.params.userId);

    // Scope 'conductor': solo puede consultar usuarios role='conductor'.
    // Sin este chequeo, alguien con solo `gestion.conductores.ver` podría
    // adivinar/iterar IDs y leer datos de admins/operadores/supervisores.
    if (scope === 'conductor' && rows[0].role !== 'conductor') {
      throw new ForbiddenError('No tienes permiso para ver este usuario.');
    }

    res.json(serializeUser(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/users ──────────────────────────────────────────────────

router.post(
  '/',
  validate(createCompanyUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const body = req.body as z.infer<typeof createCompanyUserSchema>;
      const isAdmin = ['superadmin', 'owner_empresa', 'admin_empresa'].includes(user.role);
      // `scope` resume el modo del caller para este módulo:
      //   - 'full'      → admin/owner/superadmin (puede hacer de todo)
      //   - 'conductor' → cualquier otro rol (solo rol 'conductor', ignora
      //                   modulePermissions del body y los fuerza del rol)
      const scope: 'full' | 'conductor' = isAdmin ? 'full' : 'conductor';

      // Para no-admins, exigimos scope 'conductor' (que es lo único
      // posible bajo la nueva regla) + permiso granular para crear.
      // Con la regla nueva, scope='conductor' SIEMPRE para no-admin, así
      // que la lógica de abajo aplica para todo caller que no sea admin.
      if (!isAdmin) {
        // El caller debe tener el permiso granular `gestion.conductores.crear`
        // O el permiso `accesos.usuarios.crear` (legacy: `accesos.accesos.crear`).
        // Sin esto, un usuario sin permisos de creación no podría crear nada,
        // aunque vea el listado de conductores.
        const perms = (user.modulePermissions as unknown as Record<string, Record<string, string[]>> | undefined) ?? {};
        const hasConductorCrear = (perms?.gestion?.conductores ?? []).includes('crear');
        const hasUsuariosCrear   = (perms?.accesos?.usuarios   ?? []).includes('crear');
        const hasLegacyCrear     = (perms?.accesos?.accesos    ?? []).includes('crear');
        if (!hasConductorCrear && !hasUsuariosCrear && !hasLegacyCrear) {
          throw new ForbiddenError(
            'No tienes permisos para crear usuarios. Se requiere el permiso granular "Crear" en Conductores o Usuarios.'
          );
        }
        if (body.role !== 'conductor') {
          throw new ForbiddenError(
            'Solo puedes crear usuarios con rol "conductor" si no eres administrador.'
          );
        }
      }

      const companyId = req.companyId!;
      await assertRoleValid(companyId, body.role);

      // jul 2026 — Validar límites del plan ANTES de crear el usuario.
      // El trigger sync_company_user_counts recalcula al insertar, así
      // que la verificación acá solo agrega +1 al conteo actual.
      await assertWithinPlanLimits(companyId, body.role, 1);

      const passwordHash = await hashPassword(body.password);

      const { modulePermissions, profileData, photoUrl, ...rest } = body;

      const normalizedProfile = normalizeProfileData(profileData);

      // ── Regla anti-injection de permisos ───────────────────────────────
      // Si el caller NO es admin (scope 'conductor'), IGNORAMOS cualquier
      // `modulePermissions` que venga en el body y derivamos los permisos
      // desde la plantilla del rol. Así el operador NO puede "fabricar"
      // permisos arbitrarios para un conductor.
      const resolvedModulePermissions =
        scope === 'conductor'
          ? await resolveModulePermissionsForRole(companyId, rest.role)
          : (modulePermissions ?? {});

      const [created] = await db
        .insert(companyUsers)
        .values({
          companyId,
          email:             rest.email,
          username:          rest.username,
          passwordHash,
          role:              rest.role,
          status:            rest.status,
          // jun 2026 — persistimos dni normalizado (sólo dígitos) si vino.
          // Si NO vino, caemos al valor de profileData.documentNumber
          // como compat: el caller del backfill vía SQL (migración 0040)
          // ya pobló dni a partir de ahí, pero esto cubre el caso
          // "POST que solo trae profileData.documentNumber" sin dni explícito.
          dni:               normalizeDni(body.dni)
                              ?? (typeof normalizedProfile.documentNumber === 'string'
                                    ? String(normalizedProfile.documentNumber).replace(/\D/g, '') || null
                                    : null),
          modulePermissions: resolvedModulePermissions,
          profileData:       normalizedProfile,
          photoUrl:          photoUrl ?? null,
        })
        .returning();

      // 1-a-1: si el rol es conductor, crear/asegurar su fila en drivers.
      await syncDriverWithUser({
        companyId,
        userId:  created.id,
        role:    created.role,
      });

      await logAudit(db, companyId, {
        entity:      'company_users',
        entityId:    toId('company-user', created.id),
        action:      'create',
        actorId:     req.user!.sub,
        actorName:   req.user!.name,
        description: `Usuario "${created.email}" creado en la empresa.`,
      });

      // Notificar a los admins (excepto al actor si es admin).
      // Si el usuario recién creado es admin/owner, no le llega notif
      // (sería redundante — ya sabe que existe).
      try {
        const actorId = parseId('company-user', req.user!.sub);
        await notifyAdminsExceptActor(companyId, actorId, {
          kind:    'user_created',
          title:   `Nuevo usuario: ${userShortLabel(created)}`,
          body:    `Rol: ${created.role} · Email: ${created.email}`,
          payload: {
            userId:  created.id,
            email:   created.email,
            role:    created.role,
            status:  created.status,
            actor:   req.user!.name,
          },
        });
        // Si el nuevo usuario está activo, también le llega un "bienvenida"
        // para que sepa que su cuenta ya existe.
        if (created.status === 'active') {
          await notify({
            companyId,
            userId:    created.id,
            kind:      'user_created',
            title:     'Tu cuenta fue creada',
            body:      `Ya puedes iniciar sesión con el rol "${created.role}".`,
            payload:   { userId: created.id, self: true },
          });
        }
      } catch (err) {
        console.warn('[users] notify user_created falló (no crítico):', (err as Error).message);
      }

      res.status(201).json(serializeUser(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/users/:userId ──────────────────────────────────────────

router.put(
  '/:userId',
  // Antes: requireAdmin (solo owner/admin/superadmin, hardcodeado).
  // Jun 2026: permiso granular. Acepta `accesos.usuarios.editar`
  // (con shim a `accesos.accesos.editar`) O `gestion.conductores.editar`
  // — un operador con scope 'conductor' que solo tiene el CRUD de
  // `gestion.conductores` también puede editar conductores.
  requirePermissionAny([
    { module: 'accesos',  submodule: 'usuarios' },
    { module: 'gestion',  submodule: 'conductores' },
  ], 'editar'),
  validate(updateCompanyUserSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const userId    = parseId('company-user', req.params.userId as string);
      const body      = req.body as z.infer<typeof updateCompanyUserSchema>;
      const caller    = req.user!;
      const scope     = resolveUsersScope(caller);

      const existing = await db
        .select()
        .from(companyUsers)
        .where(
          and(
            eq(companyUsers.id, userId),
            eq(companyUsers.companyId, companyId),
          )
        )
        .limit(1);

    if (!existing.length) throw new NotFoundError('Usuario', req.params.userId as string);

    // Scope 'conductor': el caller solo puede editar usuarios role='conductor'.
    // Aunque tenga `accesos.usuarios.editar` (permo granular), si no es
    // admin/owner/superadmin solo toca conductores.
    if (scope === 'conductor' && existing[0].role !== 'conductor') {
      throw new ForbiddenError(
        'No tienes permiso para editar este usuario. Solo puedes editar usuarios con rol "conductor".'
      );
    }

    // Scope 'conductor': no puede CAMBIAR el rol a algo distinto de 'conductor'
    // (eso sería escalar privilegios).
    if (scope === 'conductor' && body.role !== undefined && body.role !== 'conductor') {
      throw new ForbiddenError(
        'No puedes cambiar el rol de un usuario. Solo puedes asignar rol "conductor".'
      );
    }

    if (body.role !== undefined) {
      await assertRoleValid(companyId, body.role);

      // jul 2026 — Si cambia el rol, validar que el nuevo rol no exceda
      // los límites del plan. Si NO cambia el rol, no validamos (el conteo
      // se mantiene estable).
      await assertWithinPlanLimits(companyId, body.role, 0);
    }

    // Regla: solo admin_empresa/owner_empresa pueden cambiar la foto de
    // perfil de un usuario (propio o ajeno). Cualquier otro rol con permiso
    // de edición (ej. operador con `gestion.conductores.editar`) puede
    // seguir editando el resto de los campos, pero NO photoUrl.
    const isAdminOrOwner =
      caller.role === 'admin_empresa' || caller.role === 'owner_empresa';
    if (!isAdminOrOwner && body.photoUrl !== undefined) {
      throw new ForbiddenError('No tienes permiso para cambiar fotos de perfil.');
    }

    const { password, modulePermissions, profileData, ...rest } = body;

      const updateData: Partial<typeof companyUsers.$inferInsert> & Record<string, unknown> = {
        ...rest,
        updatedAt: new Date(),
      };

      if (password) {
        updateData.passwordHash = await hashPassword(password);
      }

      if (modulePermissions !== undefined) {
        // ── Regla anti-injection de permisos ─────────────────────────────
        // Si el caller NO es admin (scope 'conductor'), IGNORAMOS cualquier
        // `modulePermissions` que venga en el body y derivamos los permisos
        // desde la plantilla del rol actual del usuario (respetando si el
        // role cambió en este mismo PUT).
        if (scope === 'conductor') {
          const roleForPerms = body.role ?? existing[0].role;
          updateData.modulePermissions =
            await resolveModulePermissionsForRole(companyId, roleForPerms);
        } else {
          updateData.modulePermissions = modulePermissions;
        }
      }

      if (profileData !== undefined) {
        const currentProfile = (existing[0].profileData as Record<string, unknown>) ?? {};
        const merged = { ...currentProfile, ...profileData };
        updateData.profileData = normalizeProfileData(merged);
      }

      // jun 2026 — dni explícito: si el front lo mandó, normalizar y
      // pisar la columna dedicada. Si el front NO lo mandó, NO tocamos
      // la columna (dejamos el valor que ya estaba).
      if (body.dni !== undefined) {
        updateData.dni = normalizeDni(body.dni);
      }

      // Debug temporal — ver qué updateData llega al UPDATE real.
      const [updated] = await db
        .update(companyUsers)
        .set(updateData)
        .where(
          and(
            eq(companyUsers.id, userId),
            eq(companyUsers.companyId, companyId),
          )
        )
        .returning();

      // 1-a-1: sincronizar driver si cambió rol, username, photoUrl o profileData
      // (profileData trae firstName/lastName/phone/siteId que se copian al driver).
      if (
        body.role        !== undefined ||
        body.username    !== undefined ||
        body.profileData !== undefined ||
        body.photoUrl    !== undefined
      ) {
        await syncDriverWithUser({
          companyId,
          userId:  updated.id,
          role:    updated.role,
        });
      }

      await logAudit(db, companyId, {
        entity:      'company_users',
        entityId:    toId('company-user', updated.id),
        action:      'update',
        actorId:     req.user!.sub,
        actorName:   req.user!.name,
        description: `Usuario "${updated.email}" actualizado.`,
      });

      // Notificación: detectar cambio de status → 'inactive' para diferenciar
      // de un update normal (regla del usuario).
      try {
        const actorId = parseId('company-user', req.user!.sub);
        const wasActive = existing[0].status === 'active';
        const nowInactive = updated.status === 'inactive';
        const becameInactive = wasActive && nowInactive;
        const becameActive   = existing[0].status === 'inactive' && updated.status === 'active';

        if (becameInactive) {
          // Cambio a inactivo: notificar admins (excepto actor) + al propio
          // usuario (para que sepa que su cuenta fue suspendida).
          await notifyAdminsExceptActor(companyId, actorId, {
            kind:    'user_inactive',
            title:   `Usuario inactivado: ${userShortLabel(updated)}`,
            body:    `Antes activo, ahora inactivo.`,
            payload: {
              userId:   updated.id,
              email:    updated.email,
              role:     updated.role,
              actor:    req.user!.name,
            },
          });
          await notify({
            companyId,
            userId:    updated.id,
            kind:      'user_inactive',
            title:     'Tu cuenta fue inactivada',
            body:      `Ya no podrás iniciar sesión. Contacta a un administrador.`,
            payload:   { userId: updated.id, self: true },
          });
        } else if (becameActive) {
          await notifyAdminsExceptActor(companyId, actorId, {
            kind:    'user_updated',
            title:   `Usuario reactivado: ${userShortLabel(updated)}`,
            body:    `La cuenta volvió a estar activa.`,
            payload: { userId: updated.id, email: updated.email, actor: req.user!.name },
          });
          await notify({
            companyId,
            userId:    updated.id,
            kind:      'user_updated',
            title:     'Tu cuenta fue reactivada',
            body:      `Ya puedes iniciar sesión de nuevo.`,
            payload:   { userId: updated.id, self: true },
          });
        } else {
          // Update "normal" (sin cambio de status): notificar admins + al propio usuario.
          await notifyAdminsExceptActor(companyId, actorId, {
            kind:    'user_updated',
            title:   `Usuario editado: ${userShortLabel(updated)}`,
            body:    `Datos del usuario actualizados.`,
            payload: { userId: updated.id, email: updated.email, actor: req.user!.name },
          });
          // Solo notificar al propio usuario si NO es el actor (si edita sus
          // propios datos, ya lo sabe).
          if (updated.id !== actorId) {
            await notify({
              companyId,
              userId:    updated.id,
              kind:      'user_updated',
              title:     'Tus datos fueron actualizados',
              body:      `Un administrador modificó tu cuenta.`,
              payload:   { userId: updated.id, self: true, actor: req.user!.name },
            });
          }
        }
      } catch (err) {
        console.warn('[users] notify user_updated falló (no crítico):', (err as Error).message);
      }

      res.json(serializeUser(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/users/:userId/permissions ───────────────────────────────

router.put(
  '/:userId/permissions',
  // Antes: requireAdmin. Ahora: permiso granular. Acepta
  // `accesos.usuarios.editar` (con shim legacy) O
  // `gestion.conductores.editar` — un operador con scope 'conductor'
  // también puede modificar los permisos de un conductor.
  requirePermissionAny([
    { module: 'accesos',  submodule: 'usuarios' },
    { module: 'gestion',  submodule: 'conductores' },
  ], 'editar'),
  validate(permissionsSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const userId    = parseId('company-user', req.params.userId);
      const { modulePermissions } = req.body as z.infer<typeof permissionsSchema>;
      const caller    = req.user!;
      const scope     = resolveUsersScope(caller);

      const existing = await db
        .select()
        .from(companyUsers)
        .where(
          and(
            eq(companyUsers.id, userId),
            eq(companyUsers.companyId, companyId),
          )
        )
        .limit(1);

      if (!existing.length) throw new NotFoundError('Usuario', req.params.userId);

      // Scope 'conductor': solo puede modificar permisos de usuarios
      // role='conductor'. Esto evita que un operador edite los permisos
      // de un admin o de sí mismo para escalar privilegios.
      if (scope === 'conductor' && existing[0].role !== 'conductor') {
        throw new ForbiddenError(
          'No tienes permiso para modificar los permisos de este usuario. ' +
          'Solo puedes modificar permisos de usuarios con rol "conductor".'
        );
      }

      // ── Regla anti-injection de permisos ───────────────────────────────
      // Si el caller NO es admin (scope 'conductor'), IGNORAMOS el body y
      // sobrescribimos los permisos con la plantilla del rol del target.
      // Así NO es posible que un operador "fabrique" permisos para un
      // conductor (p. ej. darle accesos.* o reportes.*).
      const finalPermissions =
        scope === 'conductor'
          ? await resolveModulePermissionsForRole(companyId, existing[0].role)
          : modulePermissions;

      const [updated] = await db
        .update(companyUsers)
        .set({ modulePermissions: finalPermissions, updatedAt: new Date() })
        .where(
          and(
            eq(companyUsers.id, userId),
            eq(companyUsers.companyId, companyId),
          )
        )
        .returning();

      await logAudit(db, companyId, {
        entity:      'company_users',
        entityId:    toId('company-user', updated.id),
        action:      'update',
        actorId:     req.user!.sub,
        actorName:   req.user!.name,
        description: `Permisos de "${updated.email}" actualizados.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/users/:userId ───────────────────────────────────────

router.delete(
  '/:userId',
  // Antes: requireAdmin. Ahora: permiso granular. Acepta
  // `accesos.usuarios.eliminar` (con shim legacy) O
  // `gestion.conductores.eliminar`.
  requirePermissionAny([
    { module: 'accesos',  submodule: 'usuarios' },
    { module: 'gestion',  submodule: 'conductores' },
  ], 'eliminar'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const userId    = parseId('company-user', req.params.userId as string);
      const caller    = req.user!;
      const scope     = resolveUsersScope(caller);

      const existing = await db
        .select()
        .from(companyUsers)
        .where(
          and(
            eq(companyUsers.id, userId),
            eq(companyUsers.companyId, companyId),
          )
        )
        .limit(1);

      if (!existing.length) throw new NotFoundError('Usuario', req.params.userId as string);

      // Scope 'conductor': solo puede eliminar usuarios role='conductor'.
      // Un operador sin ser admin no debería poder eliminar admins u
      // otros operadores/supervisores.
      if (scope === 'conductor' && existing[0].role !== 'conductor') {
        throw new ForbiddenError(
          'No tienes permiso para eliminar este usuario. ' +
          'Solo puedes eliminar usuarios con rol "conductor".'
        );
      }

      await db
        .delete(companyUsers)
        .where(
          and(
            eq(companyUsers.id, userId),
            eq(companyUsers.companyId, companyId),
          )
        );

      // FK CASCADE borra la fila de drivers automáticamente; onUserDelete
      // es no-op pero se llama por simetría.
      await onUserDelete({ companyId, userId });

      await logAudit(db, companyId, {
        entity:      'company_users',
        entityId:    toId('company-user', userId),
        action:      'delete',
        actorId:     req.user!.sub,
        actorName:   req.user!.name,
        description: `Usuario "${existing[0].email}" eliminado de la empresa.`,
      });

      // Notificar a los admins (excepto actor). No se puede notificar al
      // usuario eliminado porque su fila ya no existe.
      try {
        const actorId = parseId('company-user', req.user!.sub);
        await notifyAdminsExceptActor(companyId, actorId, {
          kind:    'user_deleted',
          title:   `Usuario eliminado: ${userShortLabel(existing[0])}`,
          body:    `${existing[0].email} fue removido de la empresa.`,
          payload: {
            userId:   existing[0].id,
            email:    existing[0].email,
            role:     existing[0].role,
            actor:    req.user!.name,
          },
        });
      } catch (err) {
        console.warn('[users] notify user_deleted falló (no crítico):', (err as Error).message);
      }

      res.json({ ok: true });
    } catch (err) {
      // jul 2026 v6 — log extendido para diagnosticar el "Failed query"
      // opaco de Drizzle. Si vuelve a fallar un DELETE por FK, vamos a
      // ver el SQL state (23503 = FK violation) y el detail exactos.
      console.error('[DELETE /company/:id/users/:userId] failed for id =', req.params.userId, {
        message: (err as Error)?.message,
        code:    (err as any)?.code,
        detail:  (err as any)?.detail,
        hint:    (err as any)?.hint,
        cause:   (err as any)?.cause?.message ?? (err as any)?.cause,
        stack:   (err as Error)?.stack?.split('\n').slice(0, 5).join('\n'),
      });
      next(err);
    }
  }
);

export default router;