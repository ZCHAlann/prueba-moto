// services/driver-sync.service.ts
//
// Mantiene la fila de `company_drivers` sincronizada con `company_users`.
//
// Reglas:
//   - Cuando un companyUser tiene role=conductor, debe existir
//     exactamente una fila en company_drivers con el mismo (company_id, user_id).
//   - Cuando el role cambia a algo distinto de "conductor", la fila del
//     driver se borra (el FK está en CASCADE, igual lo hacemos explícito).
//   - Al crear un driver directo (POST /drivers), si el body trae un
//     `userId`, se valida que ese user exista y sea de la misma empresa.
//
// Esto resuelve el problema histórico donde el módulo Autorizaciones
// llamaba a `company_drivers` con `user_id = companyUserId` y a veces
// no encontraba la fila (driver creado a mano sin user, o user creado
// sin driver). Ahora la garantía es 1-a-1 y automática.

import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { companyDrivers } from "../db/schema/operational";
import { companyUsers } from "../db/schema/platform";

export type SyncResult =
  | { action: "created";  driverId: number }
  | { action: "updated";  driverId: number }
  | { action: "deleted";  driverId: number }
  | { action: "no-op";    driverId: number | null };

/**
 * Garantiza que company_drivers tenga (o no tenga) una fila para este user
 * según su rol actual. Llamar tras:
 *   - POST /company/:id/users (creación)
 *   - PATCH /company/:id/users/:userId (cambio de rol / update)
 */
export async function syncDriverWithUser(input: {
  companyId: number;
  userId:    number;
  role:      string;
}): Promise<SyncResult> {
  const { companyId, userId, role } = input;
  const isConductor = role === "conductor";

  const [existing] = await db
    .select({ id: companyDrivers.id })
    .from(companyDrivers)
    .where(and(eq(companyDrivers.companyId, companyId), eq(companyDrivers.userId, userId)))
    .limit(1);

  if (isConductor) {
    if (existing) {
      return { action: "no-op", driverId: existing.id };
    }
    // Resolver firstName / lastName del companyUser.username si es posible
    const [u] = await db
      .select({ username: companyUsers.username, email: companyUsers.email, photoUrl: companyUsers.photoUrl })
      .from(companyUsers)
      .where(eq(companyUsers.id, userId))
      .limit(1);
    const name = (u?.username ?? "Conductor").split(/\s+/);
    const firstName = name[0] ?? "Conductor";
    const lastName  = name.slice(1).join(" ") || "—";
    const code      = `COND-${userId}`;

    const [created] = await db
      .insert(companyDrivers)
      .values({
        companyId,
        userId,
        code,
        firstName,
        lastName,
        email:   u?.email ?? null,
        photoUrl: u?.photoUrl ?? null,
        status:  "Activo",
      })
      .returning({ id: companyDrivers.id });
    return { action: "created", driverId: created!.id };
  }

  // Cualquier otro rol ⇒ no debe haber driver row.
  if (existing) {
    await db
      .delete(companyDrivers)
      .where(eq(companyDrivers.id, existing.id));
    return { action: "deleted", driverId: existing.id };
  }
  return { action: "no-op", driverId: null };
}

/**
 * Llamar ANTES de borrar un companyUser. El FK CASCADE borra el driver
 * automáticamente, pero esta función existe por simetría / logging.
 */
export async function onUserDelete(_input: { companyId: number; userId: number }): Promise<void> {
  // No-op: la cascade lo hace. Dejado para que el call-site sea explícito
  // y fácil de testear.
  return;
}
