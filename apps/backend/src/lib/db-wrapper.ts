// lib/db-wrapper.ts
// ─────────────────────────────────────────────────────────────────────────────
// Wrapper de Drizzle para queries por id filtradas por empresa.
//
// Motivación: el patrón actual en el código es
//
//   const [row] = await db
//     .select()
//     .from(tabla)
//     .where(eq(tabla.id, id))               // ❌ falta eq(tabla.companyId, ...)
//     .limit(1);
//
// Un descuido humano en este patrón = IDOR. La auditoría de 2026-07-01
// encontró 4 de estos (analytics:585, maintenances:1241, maintenances:1715,
// maintenances:1940). El wrapper de abajo reduce la superficie de error:
//
//   const row = await findByIdForCompany(companyMaintenanceRecords, id, companyId);
//     // Equivale a:
//     //   SELECT * FROM tabla WHERE id = ? AND company_id = ? LIMIT 1
//     // Si la fila existe pero pertenece a otra empresa → undefined.
//
// Las funciones rechazan a TypeScript si la tabla no tiene `id: number` y
// `companyId: number` (los dos campos que necesitamos). Para tablas
// globales (companies, platformUsers, etc.) seguir usando `db` directamente
// — no se aplica el wrapper.
//
// Por qué funciones sueltas y no `db.findById(...)`:
//   - No hay que extender la API de `db` (que viene de Drizzle y la cambio
//     en cada upgrade).
//   - Las funciones son explícitas sobre la relación con la empresa.
//   - Fáciles de testear con un mock del `db`.
//   - Funcionan en cualquier tabla que tenga `id` y `companyId`.
//
// Para casos donde se necesita un control fino (joins complejos, filtros
// adicionales), seguir usando `db.select().from(...).where(and(eq(...), ...))`
// directamente, pero recordar agregar SIEMPRE `eq(tabla.companyId, companyId)`
// en el AND.
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";

/**
 * Tipo de tabla que tiene `id: number` y `companyId: number`.
 * Las funciones de abajo requieren este shape — TypeScript falla si
 * pasás una tabla sin estas columnas.
 */
type CompanyScopedTable = PgTable & {
  id: PgColumn;
  companyId: PgColumn;
};

/**
 * SELECT de una fila por id, restringida a la empresa del JWT.
 *
 * @returns la fila si existe Y pertenece a la empresa; undefined en caso contrario.
 *
 * Ejemplo:
 *   const driver = await findByIdForCompany(companyDrivers, id, companyId);
 *   if (!driver) throw new NotFoundError('Conductor', id);
 */
export async function findByIdForCompany<T>(
  table: CompanyScopedTable,
  id: number,
  companyId: number,
): Promise<T | undefined> {
  const [row] = await db
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select()
    .from(table as any)
    .where(and(
      eq(table.id, id),
      eq(table.companyId, companyId),
    ))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return row as T | undefined;
}

/**
 * UPDATE de una fila por id, restringida a la empresa. Solo afecta la fila
 * si pertenece a la empresa. Devuelve la fila actualizada, o undefined si
 * no se actualizó (id no existe o pertenece a otra empresa).
 *
 * IMPORTANTE: `data` debe respetar el shape de la tabla (sin incluir campos
 * que no querés permitir, ej. `companyId`). El caller valida.
 */
export async function updateByIdForCompany<T, TData extends Partial<T>>(
  table: CompanyScopedTable,
  id: number,
  companyId: number,
  data: TData,
): Promise<T | undefined> {
  const [updated] = await db
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(table as any)
    .set(data as Partial<T>)
    .where(and(
      eq(table.id, id),
      eq(table.companyId, companyId),
    ))
    .returning();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return updated as T | undefined;
}

/**
 * DELETE de una fila por id, restringida a la empresa. Solo borra si
 * pertenece a la empresa. Devuelve true si borró, false si no.
 *
 * OJO: usar con cuidado. Si la tabla tiene FKs con ON DELETE RESTRICT,
 * el delete falla con error de constraint. Para esos casos, mejor
 * soft-delete (UPDATE con un campo deletedAt) o desvincular dependencias
 * manualmente antes.
 */
export async function deleteByIdForCompany(
  table: CompanyScopedTable,
  id: number,
  companyId: number,
): Promise<boolean> {
  const result = await db
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .delete(table as any)
    .where(and(
      eq(table.id, id),
      eq(table.companyId, companyId),
    ))
    .returning({ id: table.id });
  return result.length > 0;
}

/**
 * Verifica que un id pertenece a la empresa, sin traer la fila.
 * Útil cuando solo necesitamos el booleano ("¿el recurso es mío?").
 *
 * Más barato que `findByIdForCompany` porque no transfiere las columnas.
 */
export async function belongsToCompany(
  table: CompanyScopedTable,
  id: number,
  companyId: number,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await db
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select({ id: (table as any).id })
    .from(table as any)
    .where(and(
      eq(table.id, id),
      eq(table.companyId, companyId),
    ))
    .limit(1);
  return result.length > 0;
}