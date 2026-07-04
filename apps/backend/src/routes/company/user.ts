import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyUsers, companyRoles } from '../../db/schema/platform';
import { validate } from '../../lib/validate';
import { requirePermissionAny } from '../../middlewares/requirePermission';
import { NotFoundError, AppError, ForbiddenError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { hashPassword } from '../../services/auth.service';
import { validators } from '../../lib/validators';
import { syncDriverWithUser, onUserDelete } from '../../services/driver-sync.service';
import { parsePageParams, buildPageResponse } from '../../lib/pagination';

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

const modulePermissionsSchema = z.record(
  z.string(),
  z.record(z.string(), z.array(z.enum(["ver", "crear", "editar", "eliminar"])))
).default({});

const createCompanyUserSchema = z.object({
  email:             validators.email,
  username:          z.string().trim().min(3, 'El usuario debe tener al menos 3 caracteres').max(40)
                       .regex(/^[a-zA-Z0-9_.-]+$/, 'Solo letras, números, guion, guion bajo y punto'),
  password:          z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  role:              z.string().trim().min(1).max(60),
  status:            z.enum(['active', 'inactive']).default('active'),
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

function serializeUser(u: typeof companyUsers.$inferSelect) {
  const profile = (u.profileData as Record<string, unknown>) ?? {};
  return {
    id:                toId('company-user', u.id),
    companyId:         toId('company', u.companyId),
    email:             u.email,
    username:          u.username,
    role:              u.role,
    status:            u.status,
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

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;