// routes/company/roles.ts
// CRUD del catálogo de roles por empresa.
//
// GET    /api/company/:id/roles        → lista todos los roles de la empresa
// POST   /api/company/:id/roles        → crea un rol custom
// PATCH  /api/company/:id/roles/:roleId → actualiza (label, description, palette, permissions)
// DELETE /api/company/:id/roles/:roleId → elimina (no se pueden borrar is_system)
// POST   /api/company/:id/roles/seed   → fuerza el seed de los 3 default (idempotente)
//
// Permisos (jun 2026 — split accesos en `usuarios` + `roles`):
//  - GET:    requirePermission('accesos', 'roles', 'ver')
//            → superadmin / owner / admin_empresa pasan por bypass.
//            → Legacy `accesos.accesos.ver` también sirve (shim).
//  - resto:  mismo submódulo pero con acción crear/editar/eliminar.
//  - seed:   solo admin/owner_empresa (acción peligrosa, no granularizable).
//
// `company_users.role` sigue siendo string (key). Esta tabla es la
// fuente de verdad de los permisos por defecto por key.

import { Router } from "express";
import { z } from "zod";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { companyRoles, companyUsers } from "../../db/schema/platform";
import { validate } from "../../lib/validate";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { requirePermission } from "../../middlewares/requirePermission";
import { NotFoundError, AppError, ConflictError } from "../../lib/errors";
import { toId, parseId } from "../../lib/ids";
import { logAudit } from "../../lib/audit";
import { parsePageParams, buildPageResponse } from "../../lib/pagination";
import { notifyAdminsExceptActor } from "../../lib/notification-service";
import {
  ensureDefaultRolesForCompany,
  getPermissionsForRole,
  mergePermissions,
  type ModulePermissionMap,
} from "../../services/role-catalog.service";

const router = Router({ mergeParams: true });

// ── Schemas ──────────────────────────────────────────────────────────────────

const permissionsSchema = z.record(
  z.string(),
  z.record(z.string(), z.array(z.enum(["ver", "crear", "editar", "eliminar"]))),
);

const paletteSchema = z.enum(["Esmeralda", "Rosa", "Púrpura", "Naranja", "Indigo"]);

const createRoleSchema = z.object({
  key:         z
    .string()
    .trim()
    .min(2, "Mín. 2 caracteres")
    .max(60, "Máx. 60 caracteres")
    .regex(/^[a-z0-9_]+$/i, "Solo letras, números y guion bajo"),
  label:       z.string().trim().min(2, "Mín. 2 caracteres").max(80),
  description: z.string().trim().max(500).optional().default(""),
  palette:     paletteSchema.optional().default("Esmeralda"),
  permissions: permissionsSchema.default({}),
});

const updateRoleSchema = z.object({
  label:       z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  palette:     paletteSchema.optional(),
  permissions: permissionsSchema.optional(),
});

// isSystem/label/key NO se pueden cambiar para is_system. Para roles
// custom, sí se puede renombrar pero el `key` no (es FK conceptual).

// ── Serializer ───────────────────────────────────────────────────────────────

function serializeRole(r: typeof companyRoles.$inferSelect) {
  return {
    id:          toId("company-role", r.id),
    companyId:   toId("company", r.companyId),
    key:         r.key,
    label:       r.label,
    description: r.description,
    palette:     r.palette,
    permissions: (r.permissions as ModulePermissionMap) ?? {},
    isSystem:    r.isSystem,
    createdAt:   r.createdAt,
    updatedAt:   r.updatedAt,
  };
}

// ── GET / (todos los roles de la empresa) ────────────────────────────────────
// Cualquier usuario con permiso `accesos.roles.ver` (o legacy
// `accesos.accesos.ver`). Admin/owner pasan por bypass.

router.get("/", requirePermission("accesos", "roles", "ver"), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    // Idempotente: si la empresa no tiene los default, los sembramos.
    await ensureDefaultRolesForCompany(companyId);
    const { page, pageSize, offset } = parsePageParams(req.query as Record<string, unknown>);

    const where = eq(companyRoles.companyId, companyId);

    const [rows, countRow] = await Promise.all([
      db.select().from(companyRoles).where(where)
        .orderBy(asc(companyRoles.isSystem), asc(companyRoles.label))
        .limit(pageSize).offset(offset),
      db.select({ value: sql<number>`cast(count(*) as int)` }).from(companyRoles).where(where),
    ]);

    const total = countRow?.[0]?.value ?? 0;
    res.json(buildPageResponse(rows.map(serializeRole), total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

// ── POST / (crear rol custom) ────────────────────────────────────────────────

router.post("/", requirePermission("accesos", "roles", "crear"), validate(createRoleSchema), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const body = req.body as z.infer<typeof createRoleSchema>;

    // Validar que el key no colisione con uno existente
    const existing = await db
      .select({ id: companyRoles.id })
      .from(companyRoles)
      .where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.key, body.key)))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictError(`Ya existe un rol con la clave "${body.key}".`);
    }

    // Tampoco chocar con platform roles
    const RESERVED_KEYS = ["owner_empresa", "admin_empresa", "superadmin"];
    if (RESERVED_KEYS.includes(body.key)) {
      throw new AppError(400, `"${body.key}" es una clave reservada del sistema.`);
    }

    const [created] = await db
      .insert(companyRoles)
      .values({
        companyId,
        key:         body.key,
        label:       body.label,
        description: body.description ?? "",
        palette:     body.palette,
        permissions: body.permissions as unknown as Record<string, unknown>,
        isSystem:    false,
      })
      .returning();

    if (!created) throw new AppError(500, "No se pudo crear el rol.");

    await logAudit(db, companyId, {
      entity: "company_roles",
      entityId: toId("company-role", created.id),
      action: "create",
      actorId: req.user!.sub,
      actorName: req.user!.name,
      description: `Creó el rol personalizado "${created.label}" (key=${created.key}).`,
    });

    // Notificar a los admins (excepto al actor).
    try {
      const actorId = parseId("company-user", req.user!.sub);
      await notifyAdminsExceptActor(companyId, actorId, {
        kind:    'role_created',
        title:   `Nuevo rol personalizado: ${created.label}`,
        body:    `Key: ${created.key} · Creado por ${req.user!.name}.`,
        payload: {
          roleId:   created.id,
          roleKey:  created.key,
          roleLabel: created.label,
          actor:    req.user!.name,
        },
      });
    } catch (err) {
      console.warn('[roles] notify role_created falló (no crítico):', (err as Error).message);
    }

    res.status(201).json(serializeRole(created));
  } catch (err) {
    next(err);
  }
});

// ── PATCH /:roleId ───────────────────────────────────────────────────────────

router.patch("/:roleId", requirePermission("accesos", "roles", "editar"), validate(updateRoleSchema), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const roleId = parseId("company-role", req.params.roleId);
    const body = req.body as z.infer<typeof updateRoleSchema>;

    const [existing] = await db
      .select()
      .from(companyRoles)
      .where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.id, roleId)))
      .limit(1);

    if (!existing) throw new NotFoundError("Rol", req.params.roleId);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.label !== undefined)       patch.label       = body.label;
    if (body.description !== undefined) patch.description = body.description;
    if (body.palette !== undefined)     patch.palette     = body.palette;
    if (body.permissions !== undefined) patch.permissions = body.permissions as unknown as Record<string, unknown>;

    const [updated] = await db
      .update(companyRoles)
      .set(patch)
      .where(eq(companyRoles.id, roleId))
      .returning();

    if (!updated) throw new AppError(500, "No se pudo actualizar el rol.");

    await logAudit(db, companyId, {
      entity: "company_roles",
      entityId: toId("company-role", updated.id),
      action: "update",
      actorId: req.user!.sub,
      actorName: req.user!.name,
      description: `Actualizó el rol "${updated.label}".`,
    });

    try {
      const actorId = parseId("company-user", req.user!.sub);
      await notifyAdminsExceptActor(companyId, actorId, {
        kind:    'role_updated',
        title:   `Rol actualizado: ${updated.label}`,
        body:    `Key: ${updated.key} · Modificado por ${req.user!.name}.`,
        payload: {
          roleId:    updated.id,
          roleKey:   updated.key,
          roleLabel: updated.label,
          actor:     req.user!.name,
        },
      });
    } catch (err) {
      console.warn('[roles] notify role_updated falló (no crítico):', (err as Error).message);
    }

    res.json(serializeRole(updated));
  } catch (err) {
    next(err);
  }
});

// ── DELETE /:roleId ──────────────────────────────────────────────────────────

router.delete("/:roleId", requirePermission("accesos", "roles", "eliminar"), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const roleId = parseId("company-role", req.params.roleId);

    const [existing] = await db
      .select()
      .from(companyRoles)
      .where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.id, roleId)))
      .limit(1);

    if (!existing) throw new NotFoundError("Rol", req.params.roleId);

    if (existing.isSystem) {
      throw new AppError(400, "Los roles del sistema (supervisor/operador/conductor) no se pueden eliminar.");
    }

    // Si hay usuarios usando este rol, no lo dejamos borrar (mejor renombrar
    // o reasignar). Devolvemos 409 con la cantidad para que la UI muestre
    // un mensaje útil.
    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(companyUsers)
      .where(and(eq(companyUsers.companyId, companyId), eq(companyUsers.role, existing.key)));

    if ((countRow?.count ?? 0) > 0) {
      throw new ConflictError(
        `No se puede eliminar: ${countRow!.count} usuario${countRow!.count !== 1 ? "s" : ""} tiene${countRow!.count !== 1 ? "n" : ""} este rol. Reasígnalos primero.`,
      );
    }

    await db.delete(companyRoles).where(eq(companyRoles.id, roleId));

    await logAudit(db, companyId, {
      entity: "company_roles",
      entityId: req.params.roleId,
      action: "delete",
      actorId: req.user!.sub,
      actorName: req.user!.name,
      description: `Eliminó el rol personalizado "${existing.label}" (key=${existing.key}).`,
    });

    try {
      const actorId = parseId("company-user", req.user!.sub);
      await notifyAdminsExceptActor(companyId, actorId, {
        kind:    'role_deleted',
        title:   `Rol eliminado: ${existing.label}`,
        body:    `Key: ${existing.key} · Eliminado por ${req.user!.name}.`,
        payload: {
          roleId:    existing.id,
          roleKey:   existing.key,
          roleLabel: existing.label,
          actor:     req.user!.name,
        },
      });
    } catch (err) {
      console.warn('[roles] notify role_deleted falló (no crítico):', (err as Error).message);
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── POST /seed (forzar seed de default) ──────────────────────────────────────
// Útil cuando se crea la empresa vía API en tests/CLI, o como recovery.

router.post("/seed", requireAdmin, async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    await ensureDefaultRolesForCompany(companyId);
    const { page, pageSize, offset } = parsePageParams(req.query as Record<string, unknown>);

    const where = eq(companyRoles.companyId, companyId);

    const [rows, countRow] = await Promise.all([
      db.select().from(companyRoles).where(where)
        .orderBy(asc(companyRoles.isSystem), asc(companyRoles.label))
        .limit(pageSize).offset(offset),
      db.select({ value: sql<number>`cast(count(*) as int)` }).from(companyRoles).where(where),
    ]);

    const total = countRow?.[0]?.value ?? 0;
    res.json(buildPageResponse(rows.map(serializeRole), total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

// ── Export ───────────────────────────────────────────────────────────────────
// Helper público: dado un companyId y un roleKey, devuelve el set
// final de permisos del usuario. Reglas:
//   1. Si el usuario tiene override per-user (cualquier submódulo con
//      al menos una acción), ESE override manda completamente. El rol
//      se IGNORA — el admin está diciendo "este user tiene exactamente
//      estos permisos, no los del rol".
//   2. Si el user NO tiene override per-user, hereda los permisos del
//      rol (catálogo) + los permisos derivados automáticos.
//
// Esto refleja el flujo del producto: el admin crea roles como plantilla
// y luego, al asignar/crear un user, define sus permisos reales. Los
// permisos del user son la fuente de verdad.
export async function getFinalPermissionsForUser(
  companyId: number,
  roleKey: string,
  perUserOverride: ModulePermissionMap,
): Promise<ModulePermissionMap> {
  const hasUserOverride = perUserOverride
    && Object.values(perUserOverride).some((subs) =>
        subs && Object.values(subs).some((actions) => Array.isArray(actions) && actions.length > 0)
      );

  // Override per-user manda completamente. NO mergeamos con el rol.
  // NO sumamos derivados — el admin debe asignar los lookups que quiera
  // explícitamente si la página los necesita.
  if (hasUserOverride) {
    return { ...perUserOverride };
  }

  // Sin override: heredar del rol tal cual.
  const base = await getPermissionsForRole(companyId, roleKey);
  return base;
}

export default router;
