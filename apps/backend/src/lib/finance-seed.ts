// ============================================================================
// lib/finance-seed.ts
// ============================================================================
// Seed de los tipos de comprobante por defecto en `company_invoice_types`.
//
// Cuándo se llama:
//   - Por ahora no hay un hook de "primer uso" automático (el módulo Finanzas
//     se está extendiendo para soportar CxP). El seed se ejecuta de forma
//     perezosa desde el GET /finance-invoice-types (la primera vez que un
//     usuario abre la página de tipos, si la tabla está vacía para su
//     empresa, sembramos los defaults).
//   - Si en el futuro se quiere sembrar al crear una empresa, agregar acá
//     un nuevo `seedDefaultInvoiceTypesForCompany(tx, companyId)` que el
//     flujo de company-creation llame.
//
// Idempotencia:
//   - Usa `onConflictDoNothing` con el UNIQUE (company_id, name). Si los
//     tipos ya existen, la operación es un no-op (no se duplican filas).
//
// Categorías default (jul 2026 — ajustado jul/2026 reversión CxP):
// El modelo real del módulo NO es contable. Son **categorías de la foto del
// comprobante del proveedor**. El backend setea automáticamente el tipo según
// el origen del attachment:
//
//   - LIBRE       : comprobante sin origen (caso raro, manual).
//   - COMBUSTIBLE : foto subida al cargar combustible → tipo COMBUSTIBLE.
//   - PEAJE       : foto subida al registrar peaje.
//   - REPUESTO    : attachment de mantenimiento con kind: 'repuesto'.
//   - MANO DE OBRA: attachment de mantenimiento con kind: 'mano_obra'.
//   - LAVADA      : attachment de mantenimiento con kind: 'lavada'.
//
// Las primeras 5 también las setea automáticamente lib/invoices-sync.ts; el 6
// (LIBRE) es para cuando el operador crea un comprobante sin atar a nada.
//
// `SERVICIOS` y `TALLER` se quitaron del seed: NO son orígenes automáticos
// en este sistema — esos servicios los emite tu flota, no el proveedor.
// El admin puede CREARLOS como custom si la empresa quiere.
//
// ============================================================================

import { eq } from 'drizzle-orm';
import { companyInvoiceTypes } from '../db/schema/operational';

/**
 * Tipo "cualquiera" para Drizzle tx — el seed funciona con el cliente
 * principal `db` o con una transacción `tx`.
 */
type DrizzleTx = any;

export const DEFAULT_INVOICE_TYPE_NAMES = [
  'LIBRE',
  'COMBUSTIBLE',
  'PEAJE',
  'REPUESTO',
  'MANO DE OBRA',
  'LAVADA',
] as const;

export type DefaultInvoiceTypeName = typeof DEFAULT_INVOICE_TYPE_NAMES[number];

/**
 * Inserta las 4 categorías default para una empresa si no existen ya.
 *
 * - Idempotente: usa onConflictDoNothing sobre el UNIQUE (company_id, name).
 *   Si ya hay 1, 2, 3 o 4 filas, solo inserta las que faltan.
 * - Acepta `db` o `tx`: cualquier drizzle ejecutor funciona porque la
 *   operación es una sola INSERT con ON CONFLICT.
 *
 * @returns Cantidad de filas insertadas (0..4).
 */
export async function seedDefaultInvoiceTypes(
  tx: DrizzleTx,
  companyId: number,
): Promise<{ inserted: number }> {
  if (!Number.isFinite(companyId) || companyId <= 0) {
    throw new Error(`seedDefaultInvoiceTypes: companyId inválido (${companyId})`);
  }

  const rows = DEFAULT_INVOICE_TYPE_NAMES.map((name) => ({
    companyId,
    name,
    isSystem: true,
    isActive: true,
  }));

  const inserted = await tx
    .insert(companyInvoiceTypes)
    .values(rows)
    .onConflictDoNothing({ target: [companyInvoiceTypes.companyId, companyInvoiceTypes.name] })
    .returning({ id: companyInvoiceTypes.id });

  return { inserted: inserted.length };
}

/**
 * Devuelve true si la empresa ya tiene AL MENOS un tipo sembrado
 * (sea del seed o creado manualmente). Útil para que el handler del
 * GET /finance-invoice-types decida si llamar al seed antes de listar.
 */
export async function companyHasAnyInvoiceType(
  tx: DrizzleTx,
  companyId: number,
): Promise<boolean> {
  const rows = await tx
    .select({ id: companyInvoiceTypes.id })
    .from(companyInvoiceTypes)
    .where(eq(companyInvoiceTypes.companyId, companyId))
    .limit(1);
  return rows.length > 0;
}

/**
 * Combina `seedDefaultInvoiceTypes` + `companyHasAnyInvoiceType`:
 * siembra SOLO si la empresa no tiene ningún tipo aún.
 *
 * Esta es la versión "lazy seed" que el GET /finance-invoice-types puede
 * llamar de forma segura (no rompe si la tabla ya tiene filas).
 */
export async function seedIfEmpty(
  tx: DrizzleTx,
  companyId: number,
): Promise<{ seeded: boolean; inserted: number }> {
  const has = await companyHasAnyInvoiceType(tx, companyId);
  if (has) return { seeded: false, inserted: 0 };
  const { inserted } = await seedDefaultInvoiceTypes(tx, companyId);
  return { seeded: inserted > 0, inserted };
}