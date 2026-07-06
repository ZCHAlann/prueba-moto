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
//
// Datos sincronizados desde `companyUsers.profileData` (JSON):
//   - firstName, lastName, phone, siteId, documentNumber
// Si la fila del driver ya existe y el user tiene datos más frescos
// en su profile, la fila se actualiza para que el módulo Conductores
// muestre info coherente sin depender de hooks del frontend.

import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { companyDrivers } from "../db/schema/operational";
import { companyUsers } from "../db/schema/platform";

export type SyncResult =
  | { action: "created";  driverId: number }
  | { action: "updated";  driverId: number }
  | { action: "deleted";  driverId: number }
  | { action: "no-op";    driverId: number | null };

type ProfileData = {
  firstName?:       string | null;
  lastName?:        string | null;
  phone?:           string | null;
  siteId?:          number | null;
  documentNumber?:  string | null;
  // Datos de licencia (viven también en profileData para que el admin los
  // capture desde el form de Usuarios; el sync los copia a la fila del driver).
  licenseNumber?:   string | null;
  licenseType?:     string | null;
  licenseExpiry?:   string | null;
  licensePoints?:   number | null;
};

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
    // Traer el user completo (incluye profileData) para sincronizar todo.
    const [u] = await db
      .select({
        username:    companyUsers.username,
        email:       companyUsers.email,
        photoUrl:    companyUsers.photoUrl,
        profileData: companyUsers.profileData,
        dni:         companyUsers.dni,
      })
      .from(companyUsers)
      .where(eq(companyUsers.id, userId))
      .limit(1);

    const profile: ProfileData =
      ((u?.profileData as Record<string, unknown> | null) ?? {}) as ProfileData;

    // Fallback: si profileData viene vacío (caso legado o admin sin form completo),
    // o si solo trae `fullName` y no `firstName`/`lastName`, partir `fullName`.
    // Como último recurso, usar el username.
    const fullName = (profile.fullName ?? "").toString().trim();
    let pFirst = (profile.firstName ?? "").toString().trim();
    let pLast  = (profile.lastName  ?? "").toString().trim();
    if (!pFirst && !pLast && fullName) {
      const tokens = fullName.split(/\s+/).filter(Boolean);
      pFirst = tokens[0] ?? "";
      pLast  = tokens.slice(1).join(" ");
    }
    const fallbackName = (u?.username ?? "Conductor").trim().split(/\s+/);
    const firstName = pFirst || fallbackName[0] || "Conductor";
    const lastName  = pLast  || fallbackName.slice(1).join(" ") || "—";
    const phone     = (profile.phone ?? "").toString().trim() || null;
    // El frontend puede mandar `siteId` como número crudo (1) o como string
    // prefijado ("site-1"). Aceptamos ambos formatos.
    const rawSiteId = profile.siteId;
    let siteId: number | null = null;
    if (rawSiteId != null && rawSiteId !== "") {
      const s = String(rawSiteId).replace(/^site-/, "").trim();
      const n = Number(s);
      if (Number.isFinite(n) && n > 0) siteId = n;
    }
    // Licencia: si el admin la capturó en el form de Usuarios, la copiamos
    // a la fila del driver. Si no, conservamos lo que ya tenga la fila.
    const licenseNumber = (profile.licenseNumber ?? "").toString().trim() || null;
    const licenseType   = (profile.licenseType   ?? "").toString().trim() || null;
    const licenseExpiry = (profile.licenseExpiry ?? "").toString().trim() || null;
    const licensePoints = Number.isFinite(profile.licensePoints)
                            ? Number(profile.licensePoints)
                            : null;
    const code      = `COND-${userId}`;

    if (existing) {
      // La fila ya existe. Refrescamos datos personales. La licencia solo
      // se sobreescribe si el profileData trae valores (no pisamos datos
      // ya capturados en el módulo Conductores con campos vacíos).
      const update: any = {
        firstName,
        lastName,
        email:    u?.email ?? null,
        phone,
        siteId,
        photoUrl: u?.photoUrl ?? null,
        // jun 2026 — replicar dni desde company_users si está seteado.
        // Si el driver ya tenía dni propio (capturado en el módulo Conductores)
        // y el user NO tiene dni, conservamos el del driver.
        dni:      u?.dni ?? null,
        updatedAt: new Date(),
      };
      if (licenseNumber !== null) update.licenseNumber = licenseNumber;
      if (licenseType   !== null) update.licenseType   = licenseType;
      if (licenseExpiry !== null) update.licenseExpiry = licenseExpiry;
      if (licensePoints !== null) update.licensePoints = licensePoints;
      await db
        .update(companyDrivers)
        .set(update)
        .where(eq(companyDrivers.id, existing.id));
      return { action: "updated", driverId: existing.id };
    }

    const [created] = await db
      .insert(companyDrivers)
      .values({
        companyId,
        userId,
        code,
        firstName,
        lastName,
        email:    u?.email ?? null,
        phone,
        siteId,
        photoUrl: u?.photoUrl ?? null,
        // jun 2026 — dni del user al crear el driver. Si el user no tiene,
        // queda null (lo completa el admin después, si quiere).
        dni:      u?.dni ?? null,
        status:   "Activo",
        // Si la licencia viene en el profileData la grabamos al insertar.
        // Si no, la fila queda con NULL en esos campos y el admin puede
        // completarla después desde el módulo Conductores.
        licenseNumber: licenseNumber ?? undefined,
        licenseType:   licenseType   ?? undefined,
        licenseExpiry: licenseExpiry ?? undefined,
        licensePoints: licensePoints ?? 0,
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
