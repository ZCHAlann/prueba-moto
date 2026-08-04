// routes/company/maintenances.ts

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, gte, lte, desc, ilike, or, inArray, sql, isNull, asc, lt, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, client } from '../../db/client';
import {
  companyMaintenanceRecords,
  companyMaintenanceEvents,
  companyMaintenanceReauthorizations,
  companyAssets,
  companyMaintenanceCategories,
  companyMaintenanceSubcategories,
  companyMaintenanceItems,
  companyMaintenanceCarwashExtras,
  companyMaintenanceCarwashPhotos,
  companyWorkshops,
  companySuppliers,
} from '../../db/schema/operational';
import { companyUsers } from '../../db/schema/platform'

const companyUsersAsigned = alias(companyUsers, 'company_users_asigned');
// jul 2026 v9 — Alias top-level para sub-categoría. Lo usan todos
// los selects que llaman a `serializeMaintenance` para traer el
// `key` y `label` de la sub-categoría del mantenimiento (si tiene).
const maintSubcatAlias = alias(companyMaintenanceSubcategories, 'maint_subcat');
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requirePermission } from '../../middlewares/requirePermission';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { requireSupervisor } from '../../middlewares/requireSupervisor';
import { NotFoundError, AppError, ForbiddenError } from '../../lib/errors';
import { toId, parseId, parseIdFlexible } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';
import { findByIdForCompany, updateByIdForCompany } from '../../lib/db-wrapper';
import { parsePageParams, buildPageResponse } from '../../lib/pagination';
import { syncAssetMaintenanceStatus } from '../../lib/maintenanceStatusSync'; // NUEVO v3.4
import {
  syncMaintenanceInvoices,
  deleteInvoicesForSource,
  recalcInvoiceFromAttachment,
} from '../../lib/invoices-sync';
import {
  notify,
  notifyAdmins,
  notifyAdminsExceptActor,
  notifyFreePool,
} from '../../lib/notification-service';

const router = Router({ mergeParams: true });

// ─── Helpers de notificación (mantenimientos) ──────────────────────────────
//
// Reglas:
//   - Crear mantenimiento CON assignedUserId:
//       notif al asignado (kind: maintenance_assigned) + admins (kind: maintenance_created)
//   - Crear mantenimiento SIN assignedUserId (libre):
//       notif a TODOS los operadores activos (kind: maintenance_free_pool)
//       + admins (kind: maintenance_created)
//   - Tomar mantenimiento libre:
//       notif a admins (kind: maintenance_taken)
//   - Cambiar estado:
//       notif al asignado + admins (kind: maintenance_status_changed)
//
// El actor (quien hizo la acción) NO se notifica a sí mismo en el canal admins.
// Si el actor es el operador asignado, NO se notifica el cambio de estado
// que él mismo disparó (evita feedback ruidoso).

function maintTitle(action: string, title?: string | null): string {
  const t = title ?? '(sin título)';
  return `${action}: ${t}`;
}

// jul 2026 v5 — Resuelve la categoría custom (si vino `categoryCustomId`)
// y devuelve { categoryKey, categoryId } para guardar en la fila. Si NO
// viene customId, devuelve lo que ya tenía `body.category` (built-in
// o string libre) y `categoryId = null`.
//
// Reglas:
//   - categoryCustomId presente y válido → key = cat.key, id = cat.id
//   - categoryCustomId presente pero inválido/no pertenece a la empresa
//     → error 400 (no silenciamos — el cliente envió algo que no
//     debería existir).
//   - categoryCustomId ausente → key = body.category ?? 'Otro', id = null
//     (back-compat para todos los clientes que ya mandan `category`).
// jul 2026 v9 — Helper que valida la categoría custom Y la
// sub-categoría opcional. Devuelve `category`, `categoryId`,
// `subcategoryId` listos para insertar. Si viene `subcategoryCustomId`,
// validamos que pertenezca a la misma categoría padre. Si la
// categoría no tiene sub-categorías definidas y el user mandó una,
// rechazamos con 400 (el cliente debe saber que la categoría no
// tiene sub-categorías).
async function resolveCategory(
  companyId: number,
  body: { category?: string; categoryCustomId?: string | null; subcategoryCustomId?: string | null },
): Promise<{ category: string; categoryId: number | null; subcategoryId: number | null }> {
  if (body.categoryCustomId) {
    const id = parseId('maint-cat', body.categoryCustomId);
    const [cat] = await db
      .select()
      .from(companyMaintenanceCategories)
      .where(and(eq(companyMaintenanceCategories.id, id), eq(companyMaintenanceCategories.companyId, companyId)))
      .limit(1);
    if (!cat) {
      throw new AppError(400, `La categoría custom "${body.categoryCustomId}" no existe o no pertenece a esta empresa.`);
    }
    // jul 2026 v9 — Si vino subcategoríaCustomId, validamos que
    // pertenezca a esta misma categoría.
    if (body.subcategoryCustomId) {
      const subId = parseId('maint-subcat', body.subcategoryCustomId);
      const [sub] = await db
        .select()
        .from(companyMaintenanceSubcategories)
        .where(and(
          eq(companyMaintenanceSubcategories.id, subId),
          eq(companyMaintenanceSubcategories.companyId, companyId),
          eq(companyMaintenanceSubcategories.categoryId, cat.id),
        ))
        .limit(1);
      if (!sub) {
        throw new AppError(400, `La sub-categoría "${body.subcategoryCustomId}" no pertenece a la categoría "${cat.label}".`);
      }
      return { category: cat.key, categoryId: cat.id, subcategoryId: sub.id };
    }
    return { category: cat.key, categoryId: cat.id, subcategoryId: null };
  }
  // jul 2026 v9 — Si NO viene `categoryCustomId`, asumimos built-in
  // o string libre. ANTES dejábamos `categoryId = null` (la fila
  // quedaba huérfana). Ahora buscamos en el catálogo de la
  // empresa por (companyId, key) — la migración 0071 sembró las
  // built-in (Primordial:Bombas, ..., Lavada, Otro) para todas
  // las empresas, así que el match debería existir siempre.
  // Si el match no existe (key legacy "re", "pru1" o un string
  // libre), lo dejamos huérfano y el Filtrado lo maneja como
  // tal. La cascada del Filtrado ya filtra por FK O string.
  const key = body.category ?? 'Otro';
  const [match] = await db
    .select({ id: companyMaintenanceCategories.id })
    .from(companyMaintenanceCategories)
    .where(and(
      eq(companyMaintenanceCategories.companyId, companyId),
      eq(companyMaintenanceCategories.key, key),
    ))
    .limit(1);
  return {
    category: key,
    categoryId: match?.id ?? null,
    subcategoryId: null,
  };
}

// ─── Enums ────────────────────────────────────────────────────────────────────
// "En curso" fue renombrado a "En proceso" (UX) — backend lo acepta como alias.
const MAINT_STATUSES = ['Programado', 'En proceso', 'En curso', 'Completado'] as const;
const MAINT_CATEGORIES = ['Primordial:Bombas', 'Primordial:Motores', 'Aceite:Cambio', 'Aceite:Inventario'] as const;
const CADENCE_KINDS = ['none', 'weekly', 'days', 'monthly', 'km_based'] as const;

const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}(T.+)?$|^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (ISO)').optional().nullable();

// ─── Item schema ──────────────────────────────────────────────────────────────
const itemSchema = z.object({
  supplierId: z.string().optional().nullable(),
  name:       safeString({ min: 1, max: 180, fieldLabel: 'Repuesto', allowEmpty: false }),
  quantity:   z.number().positive().max(1_000_000).default(1),
  unitCost:   z.number().nonnegative().max(1_000_000_000).default(0),
  // jul 2026 v4-d — 'amount' (default, back-compat) | 'percent'.
  // Define cómo se interpreta discountValue: importe en $ o % sobre
  // quantity*unitCost. Ver lib/maintenance-totals.computeItemTotals.
  discountType:  z.enum(['amount', 'percent']).default('amount'),
  discountValue: z.number().min(0).default(0),
  ivaPercent:    z.number().min(0).max(100).default(15),
  photoUrl:   z.string().min(1).optional().nullable(),
  attachmentKey: z.string().min(1).max(40).optional().nullable(),
});

// ─── Maintenance schemas ──────────────────────────────────────────────────────
const MAINT_TYPES = ['Correctivo', 'Programado', 'Lavada'] as const;

// Schema individual para un adjunto. La URL la emite el endpoint de
// upload genérico; el frontend la manda de vuelta para guardarla.
//
// jul 2026 — extendemos con campos del módulo Finanzas:
//   • key              — slug opcional. Si falta, lib/invoices-sync
//                        genera uno a partir del label + index.
//   • kind             — invoice_kind_enum: 'repuesto' | 'mano_obra' |
//                        'lavada' | 'servicio' | 'otro'. Default 'otro'.
//   • amount           — monto de la factura asociada a este adjunto.
//                        Opcional (puede ser null si es solo evidencia).
//   • invoiceNumber    — número de factura. Si está vacío/null, el adjunto
//                        es solo evidencia (no genera fila en
//                        company_invoices).
const attachmentSchema = z.object({
  key:           z.string().min(1).max(40).optional(),
  url:           z.string().min(1).max(2_000_000).nullable().optional(),
  label:         z.string().min(1).max(60).default('Adjunto'),
  uploadedAt:    z.string().datetime().optional(),
  // jul 2026 v3 — flag explicito de "es factura". Con la numeracion AUTO
  // el cliente no puede inferirse del invoiceNumber.
  isInvoice:     z.boolean().optional(),
  // jul 2026 v4 — el frontend manda "Otro" (y a veces "otro") cuando
  // el adjunto no encaja en ninguna categoría de factura. Antes esto
  // reventaba con 500 "Invalid option: expected one of repuesto|mano_obra|lavada".
  // La fix: ampliar el enum para aceptar también 'otro' (case-insensitive
  // via .transform) y cualquier valor futuro. La feature de metadata
  // de factura desde mantenimiento se está descontinuando (borrar del
  // frontend en otro ticket), pero mientras tanto el server no debe
  // romper con un 500 confuso.
  kind:          z.string()
                   .transform((s) => s.toLowerCase())
                   .refine((s) => ['repuesto', 'mano_obra', 'lavada', 'otro', 'servicio'].includes(s), {
                     message: 'kind inválido',
                   })
                   .optional(),
  amount:        z.number().nonnegative().max(1_000_000_000).nullable().optional(),
  invoiceNumber: safeString({ max: 60, fieldLabel: 'N.° de factura', allowEmpty: true }).nullable().optional(),
  supplierId:    z.union([z.number().int(), z.string(), z.null()]).optional(),
  // v3 — IVA y totales manuales (no se calculan):
  ivaPercent:    z.number().nonnegative().max(100).nullable().optional(),
  ivaAmount:     z.number().nonnegative().max(1_000_000_000).nullable().optional(),
  // v3 — solo cuando kind es mano_obra:
  workshopName:  safeString({ max: 160, fieldLabel: 'Taller', allowEmpty: true }).nullable().optional(),
  // v3 — solo cuando kind es lavada:
  workerName:    safeString({ max: 160, fieldLabel: 'Lavador', allowEmpty: true }).nullable().optional(),
  // Opción A: items con imagen pendiente por item.
  items:         z.array(z.object({
                    description:   z.string().min(1).max(255),
                    quantity:      z.number().positive(),
                    unitPrice:     z.number().nonnegative(),
                    subtotal:      z.number().nonnegative(),
                    imageUrl:      z.string().nullable().optional(),
                    imagePending:  z.boolean().optional(),
                  })).max(50).optional(),
});

const createMaintenanceSchema = z.object({
  assetId:        z.string().min(1, 'El vehículo es requerido'),
  workshopId:     z.string().optional().nullable(),
  type:           z.enum(MAINT_TYPES).default('Programado'),
  status:         z.enum(MAINT_STATUSES).default('Programado'),
  // jul 2026 v5 — Categoría administrable. Acepta cualquier string de
  // hasta 60 chars (built-in 'Primordial:Bombas' o custom 'refrigeracion').
  // Si llega `categoryCustomId`, el server sobreescribe `category` con el
  // `key` de la categoría custom y guarda `categoryId` para FK.
  category:       z.string().min(1).max(60).default('Otro'),
  // ID serializado de la categoría custom (formato 'maint-cat-N'). Si viene,
  // se valida que pertenezca a la empresa y se prefiere sobre `category`.
  categoryCustomId: z.string().min(1).optional().nullable(),
  // jul 2026 v9 — ID serializado de la sub-categoría (formato
  // 'maint-subcat-N'). Se valida que pertenezca a la misma
  // categoría padre. Si la categoría no tiene sub-categorías, el
  // user no debería mandarla, pero si la manda, se rechaza.
  subcategoryCustomId: z.union([z.string().min(1), z.null()]).optional(),
  title:          safeString({ min: 3, max: 200, fieldLabel: 'Título', allowEmpty: false }),
  description:    validators.longTextOptional,
  odometerKm:     z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  // v3.1: mano de obra (separada de los items)
  laborCost:      z.number().nonnegative().max(1_000_000_000).default(0),
  // IVA: porcentaje aplicado (default 15 para Ecuador)
  ivaPercent:     z.number().nonnegative().max(100).default(15),
  cadenceKind:    z.enum(CADENCE_KINDS).default('none'),
  cadenceValue:   z.number().int().positive().max(1_000_000).optional().nullable(),
  nextTriggerKm:  z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  scheduledFor:   z.string().min(1, 'Fecha programada requerida'),
  notes:          validators.longTextOptional,
  items:          z.array(itemSchema).max(50).default([]),
  // v3.1: campos de lavada (se usan solo cuando type='Lavada')
  carwashLocation: z.string().max(200).optional().nullable(),
  carwashProvider: z.string().max(200).optional().nullable(),
  carwashNotes:    validators.longTextOptional,
  // Costo explícito del servicio (lo que pagó el admin en el modal).
  carwashTotal:    z.number().nonnegative().max(1_000_000_000).optional().nullable(),
  // Adjuntos (facturas, fotos de evidencia) — máximo 30 para evitar
  // payloads enormes.
  attachments:     z.array(attachmentSchema).max(30).optional(),
  // El operador que crea puede auto-asignarse o dejarlo libre. Solo un
  // supervisor/admin/owner puede asignar a otro operador.
  assignedUserId: z.string().optional().nullable(),
});

const updateMaintenanceSchema = z.object({
  workshopId:     z.string().optional().nullable(),
  type:           z.enum(MAINT_TYPES).optional(),
  status:         z.enum(MAINT_STATUSES).optional(),
  category:       z.string().min(1).max(60).optional(),
  categoryCustomId: z.string().min(1).optional().nullable(),
  // jul 2026 v9 — sub-categoría (de la categoría custom actualmente
  // asignada al mantenimiento). `null` la limpia. Si se manda junto
  // con `categoryCustomId`, el backend la respeta al resolver la
  // nueva categoría; si se manda solo, se valida contra la categoría
  // ACTUAL del mantenimiento.
  subcategoryCustomId: z.string().min(1).optional().nullable(),
  title:          safeString({ min: 3, max: 200, fieldLabel: 'Título', allowEmpty: false }).optional(),
  description:    validators.longTextOptional,
  odometerKm:     z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  // v3.1: mano de obra
  laborCost:      z.number().nonnegative().max(1_000_000_000).optional(),
  // IVA: porcentaje aplicado
  ivaPercent:     z.number().nonnegative().max(100).optional(),
  cadenceKind:    z.enum(CADENCE_KINDS).optional(),
  cadenceValue:   z.number().int().positive().max(1_000_000).optional().nullable(),
  nextTriggerKm:  z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  scheduledFor:   z.string().optional(),
  notes:          validators.longTextOptional,
  items:          z.array(itemSchema).max(50).optional(),
  // v3.1: campos de lavada
  carwashLocation: z.string().max(200).optional().nullable(),
  carwashProvider: z.string().max(200).optional().nullable(),
  carwashNotes:    validators.longTextOptional,
  // Costo explícito del servicio.
  carwashTotal:    z.number().nonnegative().max(1_000_000_000).optional().nullable(),
  // Adjuntos (facturas, fotos de evidencia)
  attachments:     z.array(attachmentSchema).max(30).optional(),
  assignedUserId: z.string().optional().nullable(),
});

const cancelRescheduleSchema = z.object({
  newScheduledFor: z.string().min(1, 'Nueva fecha requerida'),
  reason:           safeString({ min: 3, max: 1000, fieldLabel: 'Motivo', allowEmpty: false }),
  // Si true, NO se borran items/attachments/notas — solo se reagenda
  // el mantenimiento. Default false para conservar el comportamiento
  // histórico del endpoint.
  keepItems:        z.boolean().optional().default(false),
});

const reauthorizeSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

// ── jun 2026 — schemas para el flujo de reautorización (pedir / aprobar / rechazar) ──

/** POST /:id/request-reauth — pedido del operador/conductor asignado. */
const requestReauthSchema = z.object({
  /** 'open' → al aprobar, scheduledFor=HOY. 'reschedule' → el admin
   *  elige nueva fecha al aprobar. */
  action: z.enum(['open', 'reschedule']),
  /** Motivo obligatorio. */
  reason: safeString({ min: 3, max: 1000, fieldLabel: 'Motivo', allowEmpty: false }),
  /** Solo si action='reschedule'. Si no viene, el admin elige al aprobar. */
  proposedScheduledFor: z.string().optional().nullable(),
});

/** POST /:id/approve-reauth — aprobación por admin/supervisor. */
const approveReauthSchema = z.object({
  /** ID serializado de la solicitud (reauth-N). */
  reauthId: z.string().min(1),
  /** Solo si la solicitud es action='reschedule'. Si no viene, se usa
   *  la fecha propuesta por el operador. */
  newScheduledFor: z.string().optional().nullable(),
  decisionNotes: safeString({ min: 0, max: 1000, fieldLabel: 'Nota', allowEmpty: true }).optional().nullable(),
});

/** POST /:id/deny-reauth — rechazo por admin/supervisor. */
const denyReauthSchema = z.object({
  reauthId: z.string().min(1),
  decisionNotes: safeString({ min: 3, max: 1000, fieldLabel: 'Motivo del rechazo', allowEmpty: false }),
});

const requestCorrectionSchema = z.object({
  reason: safeString({ min: 3, max: 1000, fieldLabel: 'Motivo', allowEmpty: false }),
  newScheduledFor: z.string().optional().nullable(), // si no viene, se corrige "hoy"
});

const noteSchema = z.object({
  text: safeString({ min: 1, max: 4000, fieldLabel: 'Nota', allowEmpty: false }),
});

const assignSchema = z.object({
  userId: z.string().min(1, 'Operador requerido'),
});

const updateDatesSchema = z.object({
  executedAt:  z.string().datetime().optional().nullable(),
  completedAt: z.string().datetime().optional().nullable(),
}).refine(
  (b) => b.executedAt !== undefined || b.completedAt !== undefined,
  { message: 'Debe enviar al menos executedAt o completedAt.' },
);

const carwashExtraSchema = z.object({
  name:     safeString({ min: 1, max: 180, fieldLabel: 'Nombre', allowEmpty: false }),
  quantity: z.number().positive().max(1_000_000).default(1),
  unitCost: z.number().nonnegative().max(1_000_000_000).default(0),
  photoUrl: z.string().min(1).optional().nullable(),
});

const carwashPhotoSchema = z.object({
  photoUrl: z.string().min(1, 'URL de foto requerida'),
  caption:   z.string().max(200).optional().nullable(),
});

const idSchema = z.object({
  id: z.string().min(1),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Roles con visión completa de todos los mantenimientos. */
const FULL_ACCESS_ROLES = new Set(['owner_empresa', 'admin_empresa', 'supervisor']);
function hasFullAccess(role: string | undefined): boolean {
  return role ? FULL_ACCESS_ROLES.has(role) : false;
}

/** El user es admin_empresa o owner_empresa (puede asignar a otros). */
function isCompanyAdmin(role: string | undefined): boolean {
  return role === 'owner_empresa' || role === 'admin_empresa';
}

/**
 * Parsea `from` / `to` (YYYY-MM-DD) como DÍAS CALENDARIO en
 * America/Guayaquil (Ecuador) y devuelve un rango semi-abierto
 * `[from, toExclusive)` apto para `WHERE scheduledFor >= from AND
 * scheduledFor < toExclusive`.
 *
 * Por qué NO usar `new Date('YYYY-MM-DD')` directamente: esa forma se
 * parsea como **UTC midnight** según ECMA-262, así que un mantenimiento
 * agendado para 28 jul 8am EC (= 28 jul 13:00 UTC) quedaba AFUERA del
 * filtro `lte(2026-07-28T00:00:00Z)`. El picker del frontend manda
 * fechas calendario en la zona del usuario (EC), así que el backend
 * tiene que interpretarlas como tales: 00:00 EC → 05:00 UTC (EC es
 * UTC-5 todo el año, sin DST). Devolvemos `toExclusive` como el
 * INICIO del día siguiente para usar con `<` y cubrir el día entero
 * sin off-by-one.
 *
 * Defaults: si el caller no manda `from`/`to`, usamos offsets relativos
 * a HOY EC (no al server-time UTC). Por ejemplo, `toDaysFromToday: 30`
 * → "desde hoy hasta 30 días después, interpretado en EC". Si no se
 * pasan defaults, se devuelve el día de hoy EC.
 *
 * jul 2026 — bug fix. Antes `new Date(req.query.from as string)` se
 * usaba crudo y rompía el filtro para cualquier mantenimiento
 * programado después de las 00:00 UTC (i.e. después de las 7pm EC del
 * día anterior). Síntoma típico: admin/owner abría la lista, veía 0
 * resultados en días con data.
 */
function parseEcDayRange(
  fromStr: string | undefined,
  toStr:   string | undefined,
  defaults: { fromDaysFromToday?: number; toDaysFromToday?: number } = {},
): { from: Date; toExclusive: Date } {
  const EC_TZ = 'America/Guayaquil';

  const ecYmd = (d: Date): string =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: EC_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d); // "YYYY-MM-DD" en EC

  // 00:00 EC del día YYYY-MM-DD = 05:00 UTC (Ecuador es UTC-5, sin DST).
  const ecDayStartUtc = (ymd: string): Date => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 5, 0, 0, 0));
  };

  const addDaysToYmd = (ymd: string, days: number): string => {
    // Importante: construimos el Date a las 12:00 UTC (no 00:00).
    // Razón: EC es UTC-5, así que `Date.UTC(2026, 6, 28)` es 7pm del
    // 27 jul en EC; sumar 1 día vía `setUTCDate` da 7pm del 28 jul
    // en EC, no 29 jul. Para evitar el off-by-one, anclemos al
    // mediodía UTC: `Date.UTC(y, m-1, d, 12)` es 7am del mismo día
    // en EC, y sumar 1 día da 7am del día siguiente en EC (correcto).
    const [y, m, d] = ymd.split('-').map(Number);
    const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    base.setUTCDate(base.getUTCDate() + days);
    return ecYmd(base);
  };

  const isYmd = (s: string | undefined): s is string =>
    typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

  const todayEcYmd = ecYmd(new Date());
  const fromYmd = isYmd(fromStr) ? fromStr
    : (defaults.fromDaysFromToday !== undefined ? addDaysToYmd(todayEcYmd, defaults.fromDaysFromToday) : todayEcYmd);
  const toYmd   = isYmd(toStr)   ? toStr
    : (defaults.toDaysFromToday   !== undefined ? addDaysToYmd(todayEcYmd, defaults.toDaysFromToday)   : todayEcYmd);

  // `toExclusive` = inicio del día SIGUIENTE en EC (uso con `lt`).
  return {
    from:        ecDayStartUtc(fromYmd),
    toExclusive: ecDayStartUtc(addDaysToYmd(toYmd, 1)),
  };
}

function getUserIdFromSub(sub: string | undefined): number | null {
  if (!sub) return null;
  const m = String(sub).match(/(\d+)$/);
  return m ? Number(m[1]) : null;
}

/**
 * Recalcula el `totalCost` de un mantenimiento a partir de:
 *   - laborCost (mano de obra) del registro principal
 *   - suma de (quantity * unitCost) de cada item (repuesto)
 *   - suma de (quantity * unitCost) de cada carwash_extra
 *
 * Persiste el resultado en `company_maintenance_records.totalCost` para
 * que la lista de la tabla lo muestre sin tener que hacer un JOIN extra.
 * No tira error si el mantenimiento no existe — retorna silenciosamente.
 *
 * IMPORTANTE: se debe llamar SIEMPRE que cambien items, carwash extras,
 * o laborCost — no solo desde POST /:id/items. Antes solo se llamaba ahí,
 * lo que dejaba totalCost desactualizado al crear un mantenimiento con
 * items precargados (POST /) o al editar items/laborCost desde el modal
 * de edición (PUT /:id).
 */
async function recalcMaintenanceTotal(maintenanceId: number, companyId: number): Promise<number> {
  const [m] = await db
    .select({
      id: companyMaintenanceRecords.id,
      type: companyMaintenanceRecords.type,
      laborCost: companyMaintenanceRecords.laborCost,
      carwashTotal: companyMaintenanceRecords.carwashTotal,
    })
    .from(companyMaintenanceRecords)
    .where(and(
      eq(companyMaintenanceRecords.id, maintenanceId),
      eq(companyMaintenanceRecords.companyId, companyId),
    ))
    .limit(1);
  if (!m) return 0;

  // jul 2026 v4-b — Migración 0050. Usamos aggregateTotals para que
  // el total del mantenimiento refleje qty * unit * (1-desc) + IVA.
  const extrasRows = await db
    .select({
      quantity:         companyMaintenanceCarwashExtras.quantity,
      unitCost:         companyMaintenanceCarwashExtras.unitCost,
      discountValue:    companyMaintenanceCarwashExtras.discountValue,
      ivaPercent:       companyMaintenanceCarwashExtras.ivaPercent,
    })
    .from(companyMaintenanceCarwashExtras)
    .where(eq(companyMaintenanceCarwashExtras.maintenanceId, maintenanceId));
  const extrasAgg = aggregateTotals(extrasRows);
  const extrasTotal = extrasAgg.grandTotal;

  let total: number;
  if (m.type === 'Lavada') {
    // En lavada el Total = costo del servicio (carwashTotal) + adicionales.
    // No hay laborCost ni items en este tipo.
    total = Number(m.carwashTotal ?? 0) + extrasTotal;
  } else {
    const itemsRows = await db
      .select({
        quantity:         companyMaintenanceItems.quantity,
        unitCost:         companyMaintenanceItems.unitCost,
        discountValue:    companyMaintenanceItems.discountValue,
        ivaPercent:       companyMaintenanceItems.ivaPercent,
      })
      .from(companyMaintenanceItems)
      .where(eq(companyMaintenanceItems.maintenanceId, maintenanceId));
    const itemsAgg = aggregateTotals(itemsRows);
    const labor = m.laborCost != null ? Number(m.laborCost) : 0;
    total = labor + itemsAgg.grandTotal;
  }

  await db
    .update(companyMaintenanceRecords)
    .set({ totalCost: String(total) })
    .where(and(
      eq(companyMaintenanceRecords.id, maintenanceId),
      eq(companyMaintenanceRecords.companyId, companyId),
    ));

  return total;
}

async function loadItemsMap(maintenanceIds: number[]): Promise<Map<number, any[]>> {
  if (!maintenanceIds.length) return new Map();
  const items = await db
    .select({
      id:             companyMaintenanceItems.id,
      maintenanceId:  companyMaintenanceItems.maintenanceId,
      supplierId:     companyMaintenanceItems.supplierId,
      supplierName:   companySuppliers.name,
      name:           companyMaintenanceItems.name,
      quantity:       companyMaintenanceItems.quantity,
      unitCost:       companyMaintenanceItems.unitCost,
      discountType:   companyMaintenanceItems.discountType, 
      discountValue:  companyMaintenanceItems.discountValue,
      ivaPercent:     companyMaintenanceItems.ivaPercent,
      ivaAmount:      companyMaintenanceItems.ivaAmount,
      total:           companyMaintenanceItems.total,
      photoUrl:       companyMaintenanceItems.photoUrl,
      // jul 2026 — Opción A: vínculo lógico al attachment del array `attachments`.
      attachmentKey:  companyMaintenanceItems.attachmentKey,
    })
    .from(companyMaintenanceItems)
    .leftJoin(companySuppliers, eq(companySuppliers.id, companyMaintenanceItems.supplierId))
    .where(inArray(companyMaintenanceItems.maintenanceId, maintenanceIds));

  const map = new Map<number, any[]>();
  for (const i of items) {
    if (!map.has(i.maintenanceId)) map.set(i.maintenanceId, []);
    // jul 2026 v9 — Recalculamos subtotal/iva/total a partir de los
    // datos crudos (quantity, unitCost, discountValue, ivaPercent)
    // en vez de confiar en los valores guardados en la DB.
    //
    // ¿Por qué? En algunos mantenimientos los subtotales quedaron
    // guardados como 0 (probablemente porque el POST inicial mandó
    // quantity o unitCost = 0, y computeItemTotals clampeó todo a
    // 0). Al forzar el recálculo en lectura, garantizamos que el
    // PDF y el frontend SIEMPRE vean el cálculo correcto basado en
    // los datos actuales. Si la fórmula del backend cambió, también
    // se aplica retroactivamente.
    const quantity      = Number(i.quantity);
    const unitCost      = Number(i.unitCost);
    const discountType  = (i.discountType === 'percent' ? 'percent' : 'amount') as 'amount' | 'percent';
    const discountValue = Number(i.discountValue ?? 0);
    const ivaPercent    = Number(i.ivaPercent ?? 15);
    const totals = computeItemTotals({
      quantity,
      unitCost,
      discountValue,
      discountType,
      ivaPercent,
    });
    map.get(i.maintenanceId)!.push({
      id:             toId('maintenance-item', i.id),
      maintenanceId:  toId('maintenance', i.maintenanceId),
      supplierId:     i.supplierId ? toId('supplier', i.supplierId) : null,
      supplierName:   i.supplierName,
      name:           i.name,
      quantity,
      // jul 2026 v9 — antes faltaban `discountValue`, `ivaPercent`,
      // `ivaAmount` y `total` en este mapeo: el SELECT los traía de
      // la DB pero no los exponíamos en la respuesta al frontend.
      // Ahora los serializamos Y los recalculamos para que no haya
      // datos viejos con subtotal=0 persistidos en la DB.
      discountType,
      discountValue,
      ivaPercent,
      ivaAmount:      totals.ivaAmount,
      total:          totals.total,
      unitCost,
      subtotal:       totals.subtotal,
      photoUrl:       i.photoUrl ?? null,
      attachmentKey:  i.attachmentKey ?? null, // jul 2026
    });
  }
  return map;
}

async function loadEventsMap(maintenanceIds: number[]): Promise<Map<number, any[]>> {
  if (!maintenanceIds.length) return new Map();
  const events = await db
    .select({
      id:             companyMaintenanceEvents.id,
      maintenanceId:  companyMaintenanceEvents.maintenanceId,
      kind:           companyMaintenanceEvents.kind,
      actorUserId:    companyMaintenanceEvents.actorUserId,
      actorName:      companyMaintenanceEvents.actorName,
      payload:        companyMaintenanceEvents.payload,
      createdAt:      companyMaintenanceEvents.createdAt,
    })
    .from(companyMaintenanceEvents)
    .where(inArray(companyMaintenanceEvents.maintenanceId, maintenanceIds))
    .orderBy(asc(companyMaintenanceEvents.createdAt));
  const map = new Map<number, any[]>();
  for (const e of events) {
    if (!map.has(e.maintenanceId)) map.set(e.maintenanceId, []);
    map.get(e.maintenanceId)!.push({
      id:             toId('maint-event', e.id),
      maintenanceId:  toId('maintenance', e.maintenanceId),
      kind:           e.kind,
      actorUserId:    e.actorUserId ? toId('company-user', e.actorUserId) : null,
      actorName:      e.actorName,
      payload:        e.payload ?? {},
      createdAt:      e.createdAt,
    });
  }
  return map;
}

// jul 2026 v4-b — Migración 0050. Subtotal/iva/total se calculan con
// el helper de lib/maintenance-totals.ts (mismo fórmula que el frontend).
import { computeItemTotals, aggregateTotals } from '../../lib/maintenance-totals';
import { notifyAll, formatDate, formatCurrency } from '../../services/whatsappService';
// (jul 2026 v8.6) — Multi-tenant: config efectiva de WhatsApp por
// empresa + render de plantillas con placeholders. Si la empresa no
// tiene config, usa defaults globales.
import { getEffectiveWhatsappConfig } from '../../services/whatsappSettingsService';
import { renderTemplate } from '../../services/whatsappTemplateService';

function buildItemValues(maintenanceId: number, items: z.infer<typeof itemSchema>[]) {
  return items.map((i) => {
    const t = computeItemTotals(i);
    return {
      maintenanceId,
      supplierId: i.supplierId ? parseId('supplier', i.supplierId) : null,
      name:       i.name,
      quantity:   i.quantity.toFixed(2),
      unitCost:   i.unitCost.toFixed(2),
      subtotal:   t.subtotal.toFixed(2),
      discountType:  i.discountType ?? 'amount',
      discountValue: (i.discountValue ?? 0).toFixed(2),
      ivaPercent:    (i.ivaPercent    ?? 15).toFixed(2),
      ivaAmount:     t.ivaAmount.toFixed(2),
      total:         t.total.toFixed(2),
      photoUrl:   i.photoUrl ?? null,
      attachmentKey: i.attachmentKey == null ? null : String(i.attachmentKey),
    };
  });
}

function normalizeStatus(status: string): string {
  // Compat: "En curso" lo aceptamos como "En proceso" (renombre UX).
  if (status === 'En curso') return 'En proceso';
  // "Atrasado" es un estado terminal del flujo (lo setea el cron diario).
  // No se normaliza → round-trip exacto para que el filtrado por
  // ?status=Atrasado coincida con el enum del schema.
  return status;
}

function serializeMaintenance(m: any, items: any[], events: any[] = []) {
  return {
    id:            toId('maintenance', m.id),
    companyId:     toId('company', m.companyId),
    assetId:       toId('asset', m.assetId),
    assetName:     m.assetName,
    assetPlate:    m.assetPlate,
    workshopId:    m.workshopId ? toId('workshop', m.workshopId) : null,
    workshopName:  m.workshopName,
    type:          m.type,
    status:        normalizeStatus(m.status),
    // Flag derivado: el cron maintenance-overdue marca los vencidos.
    // Útil para que el frontend muestre badge/banner sin tener que
    // comparar strings.
    isOverdue:     m.status === 'Atrasado',
    category:      m.category,
    // jul 2026 v5 — FK a la categoría custom. NULL para built-in
    // (no hay fila en company_maintenance_categories para esas keys).
    // El frontend lo usa para decidir si el `category` que viene
    // en `m.category` se mapea a una built-in o a una custom.
    categoryId:    m.categoryId != null ? toId('maint-cat', m.categoryId) : null,
    // jul 2026 v9 — Sub-categoría opcional del mantenimiento. Si la
    // categoría del mantenimiento tiene sub-categorías definidas,
    // el user eligió una. NULL si la categoría no tiene sub-categorías
    // o el user no eligió ninguna.
    subcategoryId: m.subcategoryId != null ? toId('maint-subcat', m.subcategoryId) : null,
    subcategoryKey:   m.subcategoryKey ?? null,
    subcategoryLabel: m.subcategoryLabel ?? null,
    title:         m.title,
    description:   m.description,
    odometerKm:    m.odometerKm,
    // v3.1: mano de obra
    laborCost:     m.laborCost != null ? Number(m.laborCost) : 0,
    ivaPercent:    m.ivaPercent != null ? Number(m.ivaPercent) : 15,
    cadenceKind:   m.cadenceKind,
    cadenceValue:  m.cadenceValue,
    nextTriggerKm: m.nextTriggerKm,
    scheduledFor:  m.scheduledFor,
    executedAt:    m.executedAt,
    completedAt:   m.completedAt,
    notes:         m.notes,
    totalCost:     Number(m.totalCost),
    // v3.1: campos de lavada
    carwashLocation: m.carwashLocation ?? null,
    carwashProvider: m.carwashProvider ?? null,
    carwashNotes:    m.carwashNotes ?? null,
    carwashTotal:    Number(m.carwashTotal ?? 0),
    // Adjuntos subidos durante la ejecución. El default del schema
    // garantiza que siempre sea un array.
    attachments:     (m as any).attachments ?? [],
    parentId:      m.parentId ? toId('maintenance', m.parentId) : null,
    createdBy:     m.createdBy ? toId('company-user', m.createdBy) : null,
    completedBy:   m.completedBy ? toId('company-user', m.completedBy) : null,
    // v3
    assignedUserId: m.assignedUserId ? toId('company-user', m.assignedUserId) : null,
    assignedUserName: m.assignedUserName ?? null,
    takenAt:       m.takenAt ?? null,
    isReprogrammed: m.isReprogrammed ?? false,
    reprogramReason: m.reprogramReason ?? null,
    reprogrammedAt: m.reprogrammedAt ?? null,
    reprogramCount: m.reprogramCount ?? 0,
    // jun 2026 — trazabilidad de reautorización. Set en
    // POST /:id/approve-reauth (ver línea ~2310). El front usa esto
    // para mostrar el chip "Reautorizado" similar a "Reprog.".
    // Si está null, el mantenimiento NO pasó por una reautorización.
    lastReauthorizationId: m.lastReauthorizationId != null
                              ? toId('reauth', m.lastReauthorizationId)
                              : null,
    lastReauthorizationAt:  m.lastReauthorizationId != null
                              ? (m.updatedAt instanceof Date ? m.updatedAt.toISOString() : String(m.updatedAt))
                              : null,
    createdAt:     m.createdAt,
    updatedAt:     m.updatedAt,
    items,
    events,
  };
}

/** Jun 2026 — serializa una fila de `company_maintenance_reauthorizations`
 *  al shape que el frontend consume en la Bandeja. */
function serializeReauth(r: typeof companyMaintenanceReauthorizations.$inferSelect) {
  return {
    id:                       toId('reauth', r.id),
    companyId:                toId('company', r.companyId),
    maintenanceId:            toId('maintenance', r.maintenanceId),
    maintenanceStatus:        r.maintenanceStatus,
    maintenanceScheduledFor:  r.maintenanceScheduledFor instanceof Date
                                ? r.maintenanceScheduledFor.toISOString()
                                : String(r.maintenanceScheduledFor),
    action:                   r.action,
    status:                   r.status,
    reason:                   r.reason,
    proposedScheduledFor:     r.proposedScheduledFor
                                ? (r.proposedScheduledFor instanceof Date
                                    ? r.proposedScheduledFor.toISOString()
                                    : String(r.proposedScheduledFor))
                                : null,
    requestedByUserId:        r.requestedByUserId != null ? toId('company-user', r.requestedByUserId) : null,
    requestedByName:          r.requestedByName ?? null,
    requestedByRole:          r.requestedByRole ?? null,
    decidedByUserId:          r.decidedByUserId != null ? toId('company-user', r.decidedByUserId) : null,
    decidedByName:            r.decidedByName ?? null,
    decisionNotes:            r.decisionNotes ?? null,
    decidedAt:                r.decidedAt ? (r.decidedAt instanceof Date ? r.decidedAt.toISOString() : String(r.decidedAt)) : null,
    appliedScheduledFor:      r.appliedScheduledFor
                                ? (r.appliedScheduledFor instanceof Date
                                    ? r.appliedScheduledFor.toISOString()
                                    : String(r.appliedScheduledFor))
                                : null,
    createdAt:                r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    updatedAt:                r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
  };
}

async function recordEvent(
  companyId: number,
  maintenanceId: number,
  kind: string,
  actor: { userId: number | null; name: string | null },
  payload: Record<string, unknown> = {},
) {
  await db.insert(companyMaintenanceEvents).values({
    companyId,
    maintenanceId,
    kind,
    actorUserId: actor.userId,
    actorName: actor.name,
    payload,
  });
}

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get(
  '/',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const { status, type, category, workshopId, assetId, from, to, q, mine, scope, overdue, excludeStatus } = req.query as Record<string, string | undefined>;
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;
      const isFull = hasFullAccess(meRole);

      // ?overdue=true → filtra directamente por status='Atrasado' (lo setea
      // el cron diario maintenance-overdue). Tiene precedencia sobre ?status
      // porque es un shortcut semántico: "mostrame los vencidos".
      const overdueOnly = overdue === 'true' || overdue === '1';

      // Paginación canónica del contrato  Default pageSize=20, cap maxPageSize=100.
      const { page, pageSize, offset } = parsePageParams(req.query, {
        pageSize: 5,
        maxPageSize: 100,
      });

      // ─── WHERE compartido entre SELECT paginado y COUNT ────────────────────
      // Mantener UNA sola fuente de condiciones es crítico para que `total`
      // refleje exactamente el universo de la página (regla del contrato).
      const conditions: any[] = [eq(companyMaintenanceRecords.companyId, companyId)];

      // Filtrado por role:
      //  - full access (admin/owner/supervisor) → ve todo, salvo que ?scope=mine
      //  - operador → ve lo suyo (assigned_user_id = me OR created_by = me)
      //    + lo que está LIBRE (assigned_user_id IS NULL) para poder tomarlo.
      //  - ?scope=mine fuerza la vista estricta "solo lo mío", sin los libres,
      //    tanto para operador como para full access.
      if (scope === 'mine') {
        if (meId == null) {
          return res.json(buildPageResponse<unknown>([], 0, page, pageSize));
        }
        conditions.push(
          or(
            eq(companyMaintenanceRecords.assignedUserId, meId),
            eq(companyMaintenanceRecords.createdBy, meId),
          )!,
        );
      } else if (!isFull) {
        if (meId == null) {
          return res.json(buildPageResponse<unknown>([], 0, page, pageSize));
        }
        conditions.push(
          or(
            eq(companyMaintenanceRecords.assignedUserId, meId),
            eq(companyMaintenanceRecords.createdBy, meId),
            isNull(companyMaintenanceRecords.assignedUserId),
          )!,
        );
      } else if (mine === 'me' && meId != null) {
        conditions.push(
          or(
            eq(companyMaintenanceRecords.assignedUserId, meId),
            eq(companyMaintenanceRecords.createdBy, meId),
          )!,
        );
      }
      if (overdueOnly) {
        // Shortcut semántico: solo los marcados como Atrasado por el cron.
        conditions.push(eq(companyMaintenanceRecords.status, 'Atrasado'));
      } else if (status) {
        const s = normalizeStatus(status);
        if (s === 'En proceso') {
          conditions.push(or(
            eq(companyMaintenanceRecords.status, 'En proceso'),
            eq(companyMaintenanceRecords.status, 'En curso'),
          )!);
        } else {
          conditions.push(eq(companyMaintenanceRecords.status, s));
        }
      }
      // jul 2026 — excludeStatus: filtra MANTENIMIENTOS cuyo status NO sea
      // el pasado. Usado por la lista principal (default = "no mostrar
      // Completado") y por el calendario (también "no Completado"). El
      // historial de cerrados vive en su propio tab (sub_status=Completado).
      // Es excluyente: si el caller pasa ambos `status` y `excludeStatus`,
      // gana `status` (filtro más específico). Usamos `sql` template en vez
      // de `ne()` porque drizzle's ne() exige un literal del enum y acá el
      // valor viene de req.query (string genérico).
      if (excludeStatus && !status) {
        conditions.push(sql`${companyMaintenanceRecords.status} != ${excludeStatus}`);
      }
      if (type)      conditions.push(eq(companyMaintenanceRecords.type, type as any));
      if (category)  conditions.push(eq(companyMaintenanceRecords.category, category));
      // jul 2026 v9 — Filtrar por sub-categoría. Si viene id válido,
      // filtramos por FK; si viene negativo (huérfano, no debería
      // llegar acá pero por las dudas) lo ignoramos.
      if (req.query.subcategoryId !== undefined && req.query.subcategoryId !== '') {
        const subId = Number(req.query.subcategoryId);
        if (Number.isFinite(subId) && subId > 0) {
          conditions.push(eq(companyMaintenanceRecords.subcategoryId, subId));
        }
      }
      if (workshopId) conditions.push(eq(companyMaintenanceRecords.workshopId, parseId('workshop', workshopId)));
      if (assetId)   conditions.push(eq(companyMaintenanceRecords.assetId, parseId('asset', assetId)));
      // Numérico para usar en _filterAsset (la response). Try/catch porque
      // parseId tira error si el formato no es válido — en ese caso caemos
      // a null (el frontend no mostrará chip si el id era inválido).
      const assetIdNum = (() => {
        if (!assetId) return null;
        try { return parseId('asset', assetId); } catch { return null; }
      })();
      // jul 2026 — `from`/`to` se interpretan como DÍAS CALENDARIO en
      // America/Guayaquil (ver `parseEcDayRange` arriba). Antes
      // `new Date('YYYY-MM-DD')` se parseaba como UTC midnight, así que
      // un mantenimiento agendado para 28 jul 8am EC quedaba AFUERA
      // del filtro `lte(2026-07-28T00:00:00Z)`.
      if (from || to) {
        const range = parseEcDayRange(from, to, { fromDaysFromToday: 0, toDaysFromToday: 0 });
        conditions.push(gte(companyMaintenanceRecords.scheduledFor, range.from));
        conditions.push(lt(companyMaintenanceRecords.scheduledFor, range.toExclusive));
      }
      if (q && q.trim().length > 0) {
        const needle = `%${q.trim()}%`;
        conditions.push(or(
          ilike(companyMaintenanceRecords.title,       needle),
          ilike(companyMaintenanceRecords.description, needle),
          ilike(companyMaintenanceRecords.notes,       needle),
          // La búsqueda libre también matchea por placa y por
          // nombre del vehículo, así un solo input cubre todo.
          ilike(companyAssets.plate,                  needle),
          ilike(companyAssets.name,                   needle),
        )!);
      }
      const where = and(...conditions);

      // jul 2026 v9 — JOIN a sub-categoría. Se aplica a TODOS los
      // selects que llaman a `serializeMaintenance`. Traemos key
      // y label de la sub-categoría para exponer en el response.
      // Enriquecemos el `m` con `subcategoryKey`/`subcategoryLabel`
      // al mergear (línea 901-907 abajo).

      // SELECT paginado + COUNT(*) en paralelo, ambos con el MISMO `where`.
      // El count se castea a int (Postgres devuelve bigint → rompe JSON.stringify).
      const baseSelect = db
        .select({
          m: companyMaintenanceRecords,
          assetName:  companyAssets.name,
          assetPlate: companyAssets.plate,
          workshopName: companyWorkshops.name,
          assignedUserName: companyUsersAsigned.username,
          subcategoryKey:   maintSubcatAlias.key,
          subcategoryLabel: maintSubcatAlias.label,
        })
        .from(companyMaintenanceRecords)
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
        .leftJoin(companyUsersAsigned, eq(companyUsersAsigned.id, companyMaintenanceRecords.assignedUserId))
        .leftJoin(maintSubcatAlias, eq(maintSubcatAlias.id, companyMaintenanceRecords.subcategoryId));

      const [rows, [countRow]] = await Promise.all([
        baseSelect
          .where(where)
          .orderBy(desc(companyMaintenanceRecords.scheduledFor))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ value: sql<number>`cast(count(*) as int)` })
          .from(companyMaintenanceRecords)
          .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
          .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
          .leftJoin(companyUsersAsigned, eq(companyUsersAsigned.id, companyMaintenanceRecords.assignedUserId))
          .leftJoin(maintSubcatAlias, eq(maintSubcatAlias.id, companyMaintenanceRecords.subcategoryId))
          .where(where),
      ]);

      const total = Number(countRow?.value ?? 0);

      const ids = rows.map((r) => (r.m as any).id);
      const [itemsMap, eventsMap] = await Promise.all([loadItemsMap(ids), loadEventsMap(ids)]);

      const data = rows.map((r) => {
        // Merge de la fila + los joins (assetPlate, assetName, workshopName,
        // assignedUserName) para que `serializeMaintenance` los encuentre
        // en `m.xxx` como espera.
        const merged = { ...r.m, ...r };
        return serializeMaintenance(merged, itemsMap.get((r.m as any).id) ?? [], eventsMap.get((r.m as any).id) ?? []);
      });

      // Lookups (no son parte del WHERE — son datos display-only para los
      // filtros del frontend). Se conservan como claves hermanas de la
      // respuesta paginada (compatibilidad con `useMaintenancesList`).
      //
      // `users` se filtra a roles que pueden ser asignados a un
      // mantenimiento: operador y supervisor. NO se devuelven los
      // owners/admins de la empresa — esos no son asignables.
      const [assetsRows, workshopsRows, suppliersRows, usersRows] = await Promise.all([
        db
          .select({
            id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate,
            brand: companyAssets.brand, model: companyAssets.model,
            code: companyAssets.code, status: companyAssets.status,
            siteId: companyAssets.siteId,
          })
          .from(companyAssets)
          .where(eq(companyAssets.companyId, companyId)),
        db
          .select({ id: companyWorkshops.id, name: companyWorkshops.name })
          .from(companyWorkshops)
          .where(eq(companyWorkshops.companyId, companyId)),
        db
          .select({ id: companySuppliers.id, name: companySuppliers.name })
          .from(companySuppliers)
          .where(eq(companySuppliers.companyId, companyId)),
        db
          .select({
            id:        companyUsers.id,
            username:  companyUsers.username,
            role:      companyUsers.role,
            firstName: sql<string>`${companyUsers.profileData}->>'firstName'`,
            lastName:  sql<string>`${companyUsers.profileData}->>'lastName'`,
          })
          .from(companyUsers)
          .where(and(
            eq(companyUsers.companyId, companyId),
            inArray(companyUsers.role, ['operador', 'supervisor', 'conductor']),
          )),
      ]);

      res.json({
        ...buildPageResponse(data, total, page, pageSize),
        assets:   assetsRows.map((a) => ({
          id:     toId('asset', a.id),
          name:   a.name,
          plate:  a.plate,
          brand:  a.brand,
          model:  a.model,
          code:   a.code,
          status: a.status,
          siteId: a.siteId ? toId('site', a.siteId) : null,
        })),
        workshops: workshopsRows.map((w) => ({ id: toId('workshop', w.id), name: w.name })),
        suppliers: suppliersRows.map((s) => ({ id: toId('supplier', s.id), name: s.name })),
        // Usuarios asignables. Mismo permiso (mantenimiento.execution.ver)
        // — no se filtra por módulo de Accesos/Usuarios.
        users: usersRows.map((u) => ({
          id:        toId('company-user', u.id),
          username:  u.username,
          role:      u.role,
          firstName: u.firstName ?? null,
          lastName:  u.lastName  ?? null,
          fullName:  [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.username,
        })),
        // Cuando el listado viene filtrado por ?assetId=X, devolvemos
        // además los metadatos del asset usado como filtro. El frontend
        // los usa para mostrar el chip de "Filtrado por vehículo ABC-123"
        // SIN tener que pegarle al endpoint de Flotas (que requiere
        // permiso de `gestion/flotas`). El módulo de Mantenimiento ya
        // validó su propio permiso acá.
        ...(assetIdNum
          ? {
              _filterAsset: (() => {
                const a = assetsRows.find((x) => x.id === assetIdNum);
                return a
                  ? { id: toId('asset', a.id), name: a.name, plate: a.plate, code: a.code }
                  : null;
              })(),
            }
          : {}),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /agenda ──────────────────────────────────────────────────────────────
router.get(
  '/agenda',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'agenda', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      // jul 2026 — `from`/`to` interpretados como DÍAS CALENDARIO en EC
      // (ver `parseEcDayRange` arriba). Default: [hoy EC, hoy EC + 30d).
      const { from, toExclusive } = parseEcDayRange(
        req.query.from as string | undefined,
        req.query.to   as string | undefined,
        { fromDaysFromToday: 0, toDaysFromToday: 30 },
      );
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;
      const isFull = hasFullAccess(meRole);

      const whereParts: any[] = [
        eq(companyMaintenanceRecords.companyId, companyId),
        gte(companyMaintenanceRecords.scheduledFor, from),
        lt(companyMaintenanceRecords.scheduledFor, toExclusive),
      ];
      // Igual que en GET / : el operador ve lo suyo + lo libre (sin asignar)
      // para poder tomarlo desde la agenda también.
      if (!isFull && meId != null) {
        whereParts.push(
          or(
            eq(companyMaintenanceRecords.assignedUserId, meId),
            eq(companyMaintenanceRecords.createdBy, meId),
            isNull(companyMaintenanceRecords.assignedUserId),
          )!,
        );
      }

      const rows = await db
        .select({
          m: companyMaintenanceRecords,
          assetName:  companyAssets.name,
          assetPlate: companyAssets.plate,
          workshopName: companyWorkshops.name,
          subcategoryKey:   maintSubcatAlias.key,
          subcategoryLabel: maintSubcatAlias.label,
        })
        .from(companyMaintenanceRecords)
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
        .leftJoin(maintSubcatAlias, eq(maintSubcatAlias.id, companyMaintenanceRecords.subcategoryId))
        .where(and(...whereParts))
        .orderBy(asc(companyMaintenanceRecords.scheduledFor));

      const ids = rows.map((r) => (r.m as any).id);
      const [itemsMap, eventsMap] = await Promise.all([loadItemsMap(ids), loadEventsMap(ids)]);
      res.json({
        data: rows.map((r) => serializeMaintenance({ ...r.m, ...r }, itemsMap.get((r.m as any).id) ?? [], eventsMap.get((r.m as any).id) ?? [])),
        total: rows.length,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /categories ─────────────────────────────────────────────────────────
router.get(
  '/categories',
  requireModule('mantenimiento'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const [rows, subs] = await Promise.all([
        db
          .select()
          .from(companyMaintenanceCategories)
          .where(eq(companyMaintenanceCategories.companyId, companyId))
          .orderBy(companyMaintenanceCategories.label),
        // jul 2026 — Traemos todas las sub-categorías de la empresa
        // y las agrupamos por `categoryId` para anidarlas.
        db
          .select()
          .from(companyMaintenanceSubcategories)
          .where(eq(companyMaintenanceSubcategories.companyId, companyId))
          .orderBy(asc(companyMaintenanceSubcategories.order)),
      ]);
      const subsByCat = new Map<number, typeof subs>();
      for (const s of subs) {
        if (!subsByCat.has(s.categoryId)) subsByCat.set(s.categoryId, []);
        subsByCat.get(s.categoryId)!.push(s);
      }
      res.json({
        data: rows.map((c) => {
          const list = subsByCat.get(c.id) ?? [];
          return {
            id:        toId('maint-cat', c.id),
            companyId: toId('company', c.companyId),
            key:       c.key,
            label:     c.label,
            shortLabel: c.shortLabel,
            color:     c.color,
            icon:      c.icon,
            isSystem:  c.isSystem,
            subcategories: list.map((s) => ({
              id: toId('maint-subcat', s.id),
              key: s.key,
              label: s.label,
              shortLabel: s.shortLabel,
              color: s.color,
              icon: s.icon,
              order: s.order,
            })),
          };
        }),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /cost-breakdown ───────────────────────────────────────────────────────
// IMPORTANTE: esta ruta está ANTES de /:id. Si se pone después, Express
// matchea "cost-breakdown" como id numérico y devuelve 404.
router.get(
  "/cost-breakdown",
  requireModule("mantenimiento"),
  requirePermission("mantenimiento", "records", "ver"),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      // jul 2026 — `from`/`to` interpretados como DÍAS CALENDARIO en EC
      // (ver `parseEcDayRange` arriba). Default: últimos 12 meses, desde
      // el inicio del día EC correspondiente hasta fin del día EC
      // correspondiente.
      const { from, toExclusive } = parseEcDayRange(
        req.query.from as string | undefined,
        req.query.to   as string | undefined,
        { fromDaysFromToday: -365, toDaysFromToday: 0 },
      );
      const workshopId = req.query.workshopId ? Number(req.query.workshopId) : null;
      const supplierId = req.query.supplierId ? Number(req.query.supplierId) : null;
      const assetId    = req.query.assetId    ? Number(req.query.assetId)    : null;

      const whereMant: any[] = [
        eq(companyMaintenanceRecords.companyId, companyId),
        gte(companyMaintenanceRecords.scheduledFor, from),
        lt(companyMaintenanceRecords.scheduledFor, toExclusive),
      ];
      if (assetId)    whereMant.push(eq(companyMaintenanceRecords.assetId, assetId));
      if (workshopId) whereMant.push(eq(companyMaintenanceRecords.workshopId, workshopId));

      const mantenances = await db
        .select({
          id:             companyMaintenanceRecords.id,
          title:          companyMaintenanceRecords.title,
          assetId:        companyMaintenanceRecords.assetId,
          workshopId:     companyMaintenanceRecords.workshopId,
          status:         companyMaintenanceRecords.status,
          totalCost:      companyMaintenanceRecords.totalCost,
          laborCost:      companyMaintenanceRecords.laborCost,
          scheduledFor:   companyMaintenanceRecords.scheduledFor,
          completedAt:    companyMaintenanceRecords.completedAt,
          attachments:    companyMaintenanceRecords.attachments,
        })
        .from(companyMaintenanceRecords)
        .where(and(...whereMant))
        .orderBy(desc(companyMaintenanceRecords.scheduledFor));

      const mantenimientoIds = mantenances.map((m) => m.id);
      let items: Array<{
        id: number; mantenimientoId: number; supplierId: number | null;
        name: string; quantity: string; unitCost: string; subtotal: string;
        photoUrl: string | null;
      }> = [];
      if (mantenimientoIds.length) {
        const whereItems: any[] = [inArray(companyMaintenanceItems.maintenanceId, mantenimientoIds)];
        if (supplierId) whereItems.push(eq(companyMaintenanceItems.supplierId, supplierId));
        items = await db
          .select({
            id:             companyMaintenanceItems.id,
            mantenimientoId: companyMaintenanceItems.maintenanceId,
            supplierId:     companyMaintenanceItems.supplierId,
            name:           companyMaintenanceItems.name,
            quantity:       companyMaintenanceItems.quantity,
            unitCost:       companyMaintenanceItems.unitCost,
            subtotal:       companyMaintenanceItems.subtotal,
            photoUrl:       companyMaintenanceItems.photoUrl,
            attachmentKey:  companyMaintenanceItems.attachmentKey, // jul 2026
          })
          .from(companyMaintenanceItems)
          .where(and(...whereItems));
      }

      const [workshops, suppliers, assetRows] = await Promise.all([
        db.select().from(companyWorkshops).where(eq(companyWorkshops.companyId, companyId)),
        db.select().from(companySuppliers).where(eq(companySuppliers.companyId, companyId)),
        mantenances.length
          ? db
              .select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate })
              .from(companyAssets)
              .where(and(
                eq(companyAssets.companyId, companyId),
                inArray(companyAssets.id, mantenances.map((m) => m.assetId).filter((id): id is number => id != null)),
              ))
          : Promise.resolve([] as Array<{ id: number; name: string; plate: string | null }>),
      ]);

      const workshopMap  = new Map(workshops.map((w)  => [w.id,  { name: w.name,  nit: w.nit  }]));
      const supplierMap  = new Map(suppliers.map((s)  => [s.id,  { name: s.name,  nit: s.nit  }]));
      const assetMap     = new Map(assetRows.map((a)   => [a.id,  { name: a.name,  plate: a.plate }]));

      const itemsByMant = new Map<number, typeof items>();
      for (const it of items) {
        if (!itemsByMant.has(it.mantenimientoId)) itemsByMant.set(it.mantenimientoId, []);
        itemsByMant.get(it.mantenimientoId)!.push(it);
      }

      const mantenancesOut = mantenances.map((m) => {
        const myItems = itemsByMant.get(m.id) ?? [];
        const repuestos = myItems.reduce((acc, it) => acc + Number(it.subtotal ?? 0), 0);
        const labor     = Number(m.laborCost ?? 0);
        const total     = Number(m.totalCost ?? 0);
        const repuestosProveedorTotal = supplierId
          ? round2(repuestos)
          : null;
        const repuestosPorProveedorList = !supplierId
          ? (() => {
              const map: Record<number, { supplierId: number; supplierName: string; total: number; count: number }> = {};
              for (const it of myItems) {
                if (!it.supplierId) continue;
                if (!map[it.supplierId]) {
                  map[it.supplierId] = {
                    supplierId: it.supplierId,
                    supplierName: supplierMap.get(it.supplierId)?.name ?? "Sin proveedor",
                    total: 0,
                    count: 0,
                  };
                }
                map[it.supplierId].total += Number(it.subtotal ?? 0);
                map[it.supplierId].count += 1;
              }
              return Object.values(map).map((r) => ({
                supplierId:   r.supplierId,
                supplierName: r.supplierName,
                total:        round2(r.total),
                itemsCount:   r.count,
              }));
            })()
          : null;
        return {
          id:             m.id,
          title:          m.title ?? "—",
          assetPlate:     assetMap.get(m.assetId)?.plate || assetMap.get(m.assetId)?.name || "—",
          assetName:      assetMap.get(m.assetId)?.name ?? null,
          scheduledDate:  m.scheduledFor,
          completedAt:    m.completedAt,
          status:         m.status,
          workshop:       m.workshopId ? {
            id:    m.workshopId,
            name:  workshopMap.get(m.workshopId)?.name ?? "—",
            nit:   workshopMap.get(m.workshopId)?.nit  ?? null,
          } : null,
          manoObra:       round2(labor),
          repuestos:      round2(repuestos),
          repuestosProveedor: repuestosProveedorTotal,
          total:          round2(total),
          items: myItems.map((it) => ({
            supplierId:   it.supplierId,
            supplierName: it.supplierId ? (supplierMap.get(it.supplierId)?.name ?? "Sin proveedor") : "Sin proveedor",
            name:         it.name,
            quantity:     Number(it.quantity),
            unitCost:     Number(it.unitCost),
            subtotal:     Number(it.subtotal),
            photoUrl:     it.photoUrl,
          })),
          attachments:    Array.isArray(m.attachments) ? m.attachments : [],
          repuestosPorProveedor: repuestosPorProveedorList,
        };
      });

      const byWorkshop: Record<number, { workshopId: number; workshopName: string; total: number; count: number }> = {};
      for (const m of mantenances) {
        if (!m.workshopId) continue;
        if (!byWorkshop[m.workshopId]) {
          byWorkshop[m.workshopId] = {
            workshopId:   m.workshopId,
            workshopName: workshopMap.get(m.workshopId)?.name ?? "—",
            total:        0,
            count:        0,
          };
        }
        byWorkshop[m.workshopId].total += Number(m.totalCost ?? 0);
        byWorkshop[m.workshopId].count += 1;
      }

      const bySupplier: Record<number, { supplierId: number; supplierName: string; total: number; itemsCount: number }> = {};
      for (const it of items) {
        if (!it.supplierId) continue;
        if (!bySupplier[it.supplierId]) {
          bySupplier[it.supplierId] = {
            supplierId:   it.supplierId,
            supplierName: supplierMap.get(it.supplierId)?.name ?? "Sin proveedor",
            total:        0,
            itemsCount:   0,
          };
        }
        bySupplier[it.supplierId].total += Number(it.subtotal ?? 0);
        bySupplier[it.supplierId].itemsCount += 1;
      }

      const totals = {
        manoObra:  round2(mantenances.reduce((a, m) => a + Number(m.laborCost ?? 0), 0)),
        repuestos: round2(items.reduce((a, it) => a + Number(it.subtotal ?? 0), 0)),
        total:     round2(mantenances.reduce((a, m) => a + Number(m.totalCost ?? 0), 0)),
      };

      return res.json({
        // jul 2026 — `toExclusive` es el INICIO del día SIGUIENTE
        // (exclusivo para `lt`); para el reporte le mostramos al user
        // el último día INCLUIDO, que es `toExclusive - 1ms`.
        rango:        { desde: from.toISOString().slice(0, 10), hasta: new Date(toExclusive.getTime() - 1).toISOString().slice(0, 10) },
        filtros:      { workshopId, supplierId, assetId },
        totals,
        byWorkshop:   Object.values(byWorkshop).sort((a, b) => b.total - a.total),
        bySupplier:   Object.values(bySupplier).sort((a, b) => b.total - a.total),
        mantenances:  mantenancesOut,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /reauths ─────────────────────────────────────────────────────────────
// Bandeja global (todas las pendientes de la empresa). El front la usa
// con filtro `?status=Pendiente`. Caller debe tener permiso editar para
// ver TODAS; si no, ve solo las suyas.
//
// IMPORTANTE: esta ruta está ANTES de `GET /:id` (líneas abajo) porque
// Express matchea en orden. Si va después, `GET /reauths` cae en el
// handler de `/:id` (que valida con regex `^maintenance-\d+$` y termina
// devolviendo 404 "Mantenimiento con id reauths no encontrado").
router.get(
  '/reauths',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'reautorizaciones', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const meId      = getUserIdFromSub(req.user!.sub);
      const meRole    = req.user!.role ?? '';
      const isFull    = hasFullAccess(meRole);
      const statusFilter = (req.query.status as string | undefined) ?? 'Pendiente';

      const conds: any[] = [
        eq(companyMaintenanceReauthorizations.companyId, companyId),
      ];
      if (statusFilter !== 'all') {
        conds.push(eq(companyMaintenanceReauthorizations.status, statusFilter as any));
      }
      if (!isFull && meId != null) {
        conds.push(eq(companyMaintenanceReauthorizations.requestedByUserId, meId));
      }

      const rows = await db
        .select()
        .from(companyMaintenanceReauthorizations)
        .where(and(...conds))
        .orderBy(desc(companyMaintenanceReauthorizations.createdAt))
        .limit(500);

      res.json(rows.map(serializeReauth));
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /assets  ──────────────────────────────────────────────────────────────
// jul 2026 — Catálogo paginado de assets para el sidebar del calendario
// de agendar (página /mantenimientos/agendar). El endpoint viejo
// (GET /maintenances) devuelve TODOS los assets de la empresa en el
// payload de catálogos, lo cual rompe la performance cuando hay 500+
// vehículos. Este endpoint nuevo trae solo una página por vez y
// soporta `?q=` para el buscador del sidebar.
//
// IMPORTANTE: esta ruta DEBE ir ANTES del `GET /:id` de abajo. Si se
// pone después, Express matchea "assets" como id numérico y devuelve
// 404 con "Mantenimiento con id assets no encontrado".
//
// Permiso: `mantenimiento` (mismo que el resto del router). El sidebar
// lo consume el operador que está agendando, no requiere permiso de
// Flotas (gestion/flotas).
//
// Query params:
//   - page:      número de página (1-indexed). Default 1.
//   - pageSize:  tamaño de página. Default 20, max 100.
//   - q:         filtro opcional por nombre/placa/código (ILIKE).
//
// Response: { items, total, page, pageSize, totalPages }
// ─────────────────────────────────────────────────────────────────────────

const assetSearchSchema = z.object({
  page:     z.coerce.number().int().positive().max(10_000).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  q:        z.string().max(60).optional().nullable(),
});

router.get(
  '/assets',
  requireModule('mantenimiento'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const params = assetSearchSchema.parse(req.query);
      const offset = (params.page - 1) * params.pageSize;

      // Filtro de búsqueda: case-insensitive sobre name/plate/code.
      const q = params.q?.trim();
      const searchFilter = q && q.length > 0
        ? or(
            ilike(companyAssets.name, `%${q}%`),
            ilike(companyAssets.plate, `%${q}%`),
            ilike(companyAssets.code, `%${q}%`),
          )
        : undefined;

      const where = searchFilter
        ? and(eq(companyAssets.companyId, companyId), searchFilter)
        : eq(companyAssets.companyId, companyId);

      const [rows, countRow] = await Promise.all([
        db
          .select({
            id:     companyAssets.id,
            name:   companyAssets.name,
            plate:  companyAssets.plate,
            brand:  companyAssets.brand,
            model:  companyAssets.model,
            code:   companyAssets.code,
            status: companyAssets.status,
            siteId: companyAssets.siteId,
          })
          .from(companyAssets)
          .where(where)
          // Orden estable: por nombre y, como tie-breaker, por id. Sin
          // tie-breaker el orden de paginación se rompe entre requests
          // cuando hay nombres duplicados.
          .orderBy(asc(companyAssets.name), asc(companyAssets.id))
          .limit(params.pageSize)
          .offset(offset),
        db
          .select({ value: sql<number>`cast(count(*) as int)` })
          .from(companyAssets)
          .where(where),
      ]);

      const total = Number(countRow?.value ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / params.pageSize));

      res.json({
        items: rows.map((a) => ({
          id:     toId('asset', a.id),
          name:   a.name,
          plate:  a.plate,
          brand:  a.brand,
          model:  a.model,
          code:   a.code,
          status: a.status,
          siteId: a.siteId ? toId('site', a.siteId) : null,
        })),
        total,
        page:     params.page,
        pageSize: params.pageSize,
        totalPages,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id ──────────────────────────────────────────────────────────────────
router.get(
  '/:id',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      if (!/^maintenance-\d+$/.test(req.params.id)) {
        throw new NotFoundError('Mantenimiento', req.params.id);
      }
      const id = parseId('maintenance', req.params.id);
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;
      const isFull = hasFullAccess(meRole);

      const [row] = await db
        .select({
          m: companyMaintenanceRecords,
          assetName:  companyAssets.name,
          assetPlate: companyAssets.plate,
          workshopName: companyWorkshops.name,
          assignedUserName: companyUsersAsigned.username,
          subcategoryKey:   maintSubcatAlias.key,
          subcategoryLabel: maintSubcatAlias.label,
        })
        .from(companyMaintenanceRecords)
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
        .leftJoin(companyUsersAsigned, eq(companyUsersAsigned.id, companyMaintenanceRecords.assignedUserId))
        .leftJoin(maintSubcatAlias, eq(maintSubcatAlias.id, companyMaintenanceRecords.subcategoryId))
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!row) throw new NotFoundError('Mantenimiento', req.params.id);

      const m = { ...(row.m as any), ...row } as any;
      if (!isFull) {
        const isMine = meId != null && (m.assignedUserId === meId || m.createdBy === meId);
        const isFree = m.assignedUserId == null;
        if (!isMine && !isFree) {
          throw new NotFoundError('Mantenimiento', req.params.id);
        }
      }

      const itemsMap  = await loadItemsMap([m.id]);
      const eventsMap = await loadEventsMap([m.id]);

      if (meId != null) {
        await recordEvent(companyId, m.id, 'viewed', { userId: meId, name: req.user!.name ?? null });
      }

      res.json(serializeMaintenance(m, itemsMap.get(m.id) ?? [], eventsMap.get(m.id) ?? []));
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST / ───────────────────────────────────────────────────────────────────
router.post(
  '/',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'crear'),
  validate(createMaintenanceSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createMaintenanceSchema>;
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;
      const isFull = hasFullAccess(meRole);

      const assetId = parseId('asset', body.assetId);
      const workshopId = body.workshopId ? parseId('workshop', body.workshopId) : null;
      // jul 2026 v5 — resuelve categoría (customId manda sobre `category`).
      const resolvedCategory = await resolveCategory(companyId, body);

      // jul 2026 v9 — Anti-duplicado por vehiculo+día. Si ya existe un
      // mantenimiento NO completado y NO cancelado del mismo vehículo
      // en la misma fecha (mismo YYYY-MM-DD en America/Guayaquil),
      // rechazamos el POST con 409 MAINTENANCE_DUPLICATE_DAY.
      // Esto evita que arrastrar el mismo vehículo al calendario
      // dos veces (o doble submit) cree dos mantenimientos superpuestos.
      // El frontend puede usar el id devuelto para abrir el existente.
      if (body.scheduledFor) {
        const schedDate = new Date(body.scheduledFor);
        // dayKey YYYY-MM-DD en UTC (el frontend ya manda YYYY-MM-DD o ISO
        // con la zona del user; tomamos la parte de fecha del ISO).
        const dayKey = (typeof body.scheduledFor === 'string' ? body.scheduledFor : String(body.scheduledFor)).slice(0, 10);
        const dayStart = new Date(`${dayKey}T00:00:00.000Z`);
        const dayEnd   = new Date(`${dayKey}T23:59:59.999Z`);
        if (!isNaN(schedDate.getTime())) {
          const [existing] = await db
            .select({ id: companyMaintenanceRecords.id, status: companyMaintenanceRecords.status, title: companyMaintenanceRecords.title })
            .from(companyMaintenanceRecords)
            .where(and(
              eq(companyMaintenanceRecords.companyId, companyId),
              eq(companyMaintenanceRecords.assetId, assetId),
              gte(companyMaintenanceRecords.scheduledFor, dayStart),
              lte(companyMaintenanceRecords.scheduledFor, dayEnd),
              ne(companyMaintenanceRecords.status, 'Completado'),
              ne(companyMaintenanceRecords.status, 'Cancelado'),
            ))
            .limit(1);
          if (existing) {
            throw new AppError(409,
              `Ya existe el mantenimiento #${existing.id} ("${existing.title ?? 'sin titulo'}") para este vehiculo en ${dayKey} (estado: ${existing.status}). ` +
              `Usa modificar(mantenimientos, editar, id) para editarlo o cancelalo antes de crear uno nuevo.`,
              'MAINTENANCE_DUPLICATE_DAY',
            );
          }
        }
      }

      let assignedUserId: number | null = null;
      if (body.assignedUserId) {
        const targetId = parseId('company-user', body.assignedUserId);
        if (!isFull && targetId !== meId) {
          throw new ForbiddenError('Solo administradores o supervisores pueden asignar mantenimientos a otros usuarios.');
        }
        const [target] = await db
          .select({ companyId: companyUsers.companyId })
          .from(companyUsers)
          .where(and(eq(companyUsers.id, targetId), eq(companyUsers.companyId, companyId)))
          .limit(1);
        if (!target) {
          throw new ForbiddenError('El usuario asignado no pertenece a esta empresa.');
        }
        assignedUserId = targetId;
      } else {
        const isUrgente = body.type === 'Correctivo' || body.type === 'Lavada';
        if (!isFull && isUrgente && meId != null) {
          assignedUserId = meId;
        }
      }

      const isUrgente = body.type === 'Correctivo' || body.type === 'Lavada';
      const finalStatus = isUrgente
        ? 'En proceso'
        : normalizeStatus(body.status ?? 'Programado');

      const [created] = await db
        .insert(companyMaintenanceRecords)
        .values({
          companyId,
          assetId,
          workshopId,
          type:           body.type,
          status:         finalStatus,
          category:       resolvedCategory.category,
          categoryId:     resolvedCategory.categoryId,
          // jul 2026 v9 — Sub-categoría opcional. Validada arriba
          // por `resolveCategory` (verifica que pertenezca a la
          // misma categoría padre).
          subcategoryId:  resolvedCategory.subcategoryId,
          title:          body.title,
          description:    body.description ?? null,
          odometerKm:     body.odometerKm ?? null,
          laborCost:      String(body.laborCost ?? 0),
          ivaPercent:     String(body.ivaPercent ?? 15),
          cadenceKind:    body.cadenceKind,
          cadenceValue:   body.cadenceValue ?? null,
          nextTriggerKm:  body.nextTriggerKm ?? null,
          scheduledFor:   new Date(body.scheduledFor),
          executedAt:     isUrgente ? new Date() : null,
          notes:          body.notes ?? null,
          totalCost:      body.type === 'Lavada' ? String(body.carwashTotal ?? 0) : '0',
          carwashLocation: body.type === 'Lavada' ? (body.carwashLocation ?? null) : null,
          carwashProvider: body.type === 'Lavada' ? (body.carwashProvider ?? null) : null,
          carwashNotes:    body.type === 'Lavada' ? (body.carwashNotes ?? null) : null,
          carwashTotal:    body.type === 'Lavada' ? (body.carwashTotal ?? 0)         : 0,
          attachments:     body.attachments ?? [],
          createdBy:      meId,
          assignedUserId,
        })
        .returning();

      if (body.type !== 'Lavada' && body.items?.length) {
        for (const values of buildItemValues(created.id, body.items)) {
          await db.insert(companyMaintenanceItems).values(values);
        }
      }
      await recalcMaintenanceTotal(created.id, companyId);

      // ── Sincronizar ledger Finanzas (módulo de facturas) ───────────────────
      // Cada mantenimiento puede traer N facturas (una por adjunto con
      // invoiceNumber). syncMaintenanceInvoices se encarga de:
      //   1. UPSERT por (mantenimiento, attachment key) si el adjunto
      //      tiene invoiceNumber no-vacío.
      //   2. Borrar del ledger cualquier factura previa del mantenimiento
      //      cuyo attachment key ya no esté en la nueva lista (caso
      //      "adjuntos eliminados en el edit modal").
      // Si body.attachments está vacío o todos los invoiceNumber están
      // vacíos, la función es no-op para UPSERT pero igual borra
      // cualquier huérfana previa del mantenimiento (defensivo).
      try {
        await syncMaintenanceInvoices({
          tx: db,
          companyId,
          maintenanceId: created.id,
          attachments: (body.attachments ?? []) as Array<{
            key?: string;
            url: string;
            label?: string;
            uploadedAt?: string;
            kind?: 'repuesto' | 'mano_obra' | 'lavada' | 'servicio' | 'otro';
            amount?: number | null;
            invoiceNumber?: string | null;
          }>,
        });
      } catch (invErr) {
        console.warn('[maintenances] syncMaintenanceInvoices falló (no crítico):', (invErr as Error).message);
      }

      // NUEVO v3.4 — sincroniza el status del vehículo si el mantenimiento
      // recién creado ya cuenta como "activo hoy".
      await syncAssetMaintenanceStatus(assetId, companyId);

      await recordEvent(companyId, created.id, 'created', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, { title: body.title, type: body.type, status: finalStatus });
      if (assignedUserId) {
        await recordEvent(companyId, created.id, 'assigned', {
          userId: meId,
          name:   req.user!.name ?? null,
        }, { assignedUserId, selfAssigned: assignedUserId === meId });
      }

      const [full] = await db
        .select({
          m: companyMaintenanceRecords,
          assetName:  companyAssets.name,
          assetPlate: companyAssets.plate,
          workshopName: companyWorkshops.name,
          assignedUserName: companyUsersAsigned.username,
          subcategoryKey:   maintSubcatAlias.key,
          subcategoryLabel: maintSubcatAlias.label,
        })
        .from(companyMaintenanceRecords)
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
        .leftJoin(companyUsersAsigned, eq(companyUsersAsigned.id, companyMaintenanceRecords.assignedUserId))
        .leftJoin(maintSubcatAlias, eq(maintSubcatAlias.id, companyMaintenanceRecords.subcategoryId))
        .where(eq(companyMaintenanceRecords.id, created.id))
        .limit(1);
      const itemsMap  = await loadItemsMap([created.id]);
      const eventsMap = await loadEventsMap([created.id]);

      // ── Notificaciones ────────────────────────────────────────────────────────
      // Reglas:
      //   - Mantenimiento CON assignedUserId  → notif al asignado (si no es actor) + admins.
      //   - Mantenimiento SIN assignedUserId → notif a TODOS los operadores (free pool)
      //                                         + admins.
      //   - El actor (quien creó) NO se notifica a sí mismo en admins.
      try {
        const actorId = meId ?? -1;
        const [assetInfo] = await db
          .select({ name: companyAssets.name, plate: companyAssets.plate })
          .from(companyAssets)
          .where(eq(companyAssets.id, assetId))
          .limit(1);
        const assetLabel = assetInfo
          ? `${assetInfo.name}${assetInfo.plate ? ` (${assetInfo.plate})` : ''}`
          : 'Vehículo';
        const bodyCreated  = `${assetLabel} · ${body.type ?? 'Programado'}`;
        const titleCreated = maintTitle('Nuevo mantenimiento', body.title);
        const basePayload = {
          maintenanceId: created.id,
          assetId,
          assetLabel,
          type:        body.type ?? 'Programado',
          status:      finalStatus,
          scheduledFor: body.scheduledFor,
          actor:       req.user!.name ?? null,
        };

        if (assignedUserId) {
          // (1) Notificar al operador asignado (si NO es el actor).
          if (assignedUserId !== actorId) {
            await notify({
              companyId,
              userId:  assignedUserId,
              kind:    'maintenance_assigned',
              title:   maintTitle('Mantenimiento asignado', body.title),
              body:    bodyCreated,
              payload: basePayload,
            });
          }
          // (2) Notificar a los admins (excepto actor).
          await notifyAdminsExceptActor(companyId, actorId, {
            kind:    'maintenance_created',
            title:   titleCreated,
            body:    `${bodyCreated} · Asignado a operador`,
            payload: basePayload,
          });
        } else {
          // Mantenimiento LIBRE (sin asignar) → notificar a TODOS los operadores.
          await notifyFreePool(companyId, {
            kind:    'maintenance_free_pool',
            title:   maintTitle('Mantenimiento disponible', body.title),
            body:    bodyCreated,
            payload: basePayload,
          });
          // También notificar a los admins (excepto actor) para que sepan
          // que hay algo en la piscina.
          await notifyAdminsExceptActor(companyId, actorId, {
            kind:    'maintenance_created',
            title:   titleCreated,
            body:    `${bodyCreated} · Libre (sin asignar)`,
            payload: basePayload,
          });
        }
      } catch (err) {
        console.warn('[maintenances] notify created falló (no crítico):', (err as Error).message);
      }

      // ── WhatsApp (jul 2026 v8.6) ─────────────────────────────────
      // (jul 2026 v8.6) — WhatsApp multi-tenant: usamos la config
      // efectiva de la empresa (su lista de números + plantilla
      // custom, o defaults si no tiene). Fire-and-forget: si WAHA
      // está caído, el mantenimiento igual queda creado.
      try {
        const isFree = !created.assignedUserId;
        const responsibleName = isFree
          ? ''
          : (full?.assignedUserName ?? 'Sin asignar');
        const createdByName = req.user!.name ?? 'Operador';
        const waConfig = await getEffectiveWhatsappConfig(companyId);
        if (waConfig.enabled && waConfig.notifyNumbers.length > 0) {
          const msg = renderTemplate(waConfig.templateScheduled, {
            placa:             full?.assetPlate ?? 'desconocida',
            tipo:              created.type,
            titulo:            created.title ?? '',
            descripcion:       created.description ?? '',
            fecha:             formatDate(created.scheduledFor),
            responsable:       responsibleName || 'Sin asignar',
            responsable_linea: responsibleName
              ? `• Responsable: ${responsibleName}`
              : '• Responsable: Mantenimiento libre (sin asignar)',
            creado_por:        createdByName,
          });
          notifyAll(
            msg,
            'maintenance_scheduled',
            String(created.id),
            waConfig.notifyNumbers,
          );
        }
      } catch (err) {
        console.warn('[maintenances] whatsapp scheduled falló (no crítico):', (err as Error).message);
      }

      res.status(201).json(serializeMaintenance({ ...full!.m, ...full! }, itemsMap.get(created.id) ?? [], eventsMap.get(created.id) ?? []));
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /:id ──────────────────────────────────────────────────────────────────
router.put(
  '/:id',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
  validate(updateMaintenanceSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const body = req.body as z.infer<typeof updateMaintenanceSchema>;
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;
      const isFull = hasFullAccess(meRole);

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);

      if (!isFull) {
        if (meId == null || (existing.assignedUserId !== meId && existing.createdBy !== meId)) {
          throw new NotFoundError('Mantenimiento', req.params.id);
        }
      }

      // Regla (jun 2026): un mantenimiento Atrasado SOLO lo puede editar
      // alguien con scope full (admin/owner/supervisor). El operador o
      // conductor asignado NO puede auto-escalarse: tiene que pedir que
      // se lo reabran / reprogramen a través del flujo de reautorización.
      if (existing.status === 'Atrasado' && !isFull) {
        throw new ForbiddenError(
          'Este mantenimiento está atrasado. No podés editarlo directamente — pedí que lo reautoricen o reprogramen.',
        );
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.workshopId !== undefined) updateData.workshopId = body.workshopId ? parseId('workshop', body.workshopId) : null;
      if (body.type !== undefined) updateData.type = body.type;
      if (body.status !== undefined) updateData.status = normalizeStatus(body.status);
      // jul 2026 v5 — Si viene categoryCustomId, ese manda y se sobreescriben
      // tanto `category` (con el `key` de la custom) como `categoryId`.
      // Si NO viene customId pero sí `category`, eso es lo que se guarda
      // (built-in o string libre). Si no viene ninguno, no se toca la
      // categoría actual del mantenimiento.
      if (body.categoryCustomId !== undefined) {
        const resolved = await resolveCategory(companyId, body);
        updateData.category   = resolved.category;
        updateData.categoryId = resolved.categoryId;
        // jul 2026 v9 — Si el user mandó una subcategoría y la
        // categoría custom se eligió en este mismo PATCH, se
        // respeta la subcategoría. Si NO mandó subcategoría pero
        // la categoría SÍ tiene, se resetea a null (el user la
        // está cambiando, no la conserva).
        updateData.subcategoryId = resolved.subcategoryId;
      } else if (body.category !== undefined) {
        updateData.category   = body.category;
        updateData.categoryId = null; // vuelve a built-in / string libre
        // jul 2026 v9 — Cambió la categoría a built-in / libre, no
        // hay sub-categoría que aplique.
        updateData.subcategoryId = null;
      }
      // jul 2026 v9 — Si el user SOLO mandó `subcategoryCustomId`
      // (sin tocar la categoría), validamos y actualizamos. Esto
      // es útil cuando el user quiere asignar/cambiar la
      // sub-categoría sin tocar la categoría padre.
      if (body.subcategoryCustomId !== undefined && body.categoryCustomId === undefined) {
        // Necesitamos la categoría ACTUAL del mantenimiento para
        // validar que la sub-categoría le pertenece.
        const [current] = await db
          .select({ categoryId: companyMaintenanceRecords.categoryId })
          .from(companyMaintenanceRecords)
          .where(eq(companyMaintenanceRecords.id, id))
          .limit(1);
        if (!current) {
          throw new NotFoundError('Mantenimiento', req.params.id);
        }
        if (body.subcategoryCustomId === null) {
          updateData.subcategoryId = null;
        } else {
          const subId = parseId('maint-subcat', body.subcategoryCustomId);
          const [sub] = await db
            .select()
            .from(companyMaintenanceSubcategories)
            .where(and(
              eq(companyMaintenanceSubcategories.id, subId),
              eq(companyMaintenanceSubcategories.companyId, companyId),
              current.categoryId != null
                ? eq(companyMaintenanceSubcategories.categoryId, current.categoryId)
                : sql`false`,
            ))
            .limit(1);
          if (!sub) {
            throw new AppError(400, `La sub-categoría no pertenece a la categoría actual del mantenimiento.`);
          }
          updateData.subcategoryId = sub.id;
        }
      }
      if (body.title !== undefined) updateData.title = body.title;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.odometerKm !== undefined) updateData.odometerKm = body.odometerKm;
      if (body.laborCost !== undefined) updateData.laborCost = String(body.laborCost);
      if (body.ivaPercent !== undefined) updateData.ivaPercent = String(body.ivaPercent);
      if (body.cadenceKind !== undefined) updateData.cadenceKind = body.cadenceKind;
      if (body.cadenceValue !== undefined) updateData.cadenceValue = body.cadenceValue;
      if (body.nextTriggerKm !== undefined) updateData.nextTriggerKm = body.nextTriggerKm;
      if (body.scheduledFor !== undefined) updateData.scheduledFor = new Date(body.scheduledFor);
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.carwashLocation !== undefined) updateData.carwashLocation = body.carwashLocation ?? null;
      if (body.carwashProvider !== undefined) updateData.carwashProvider = body.carwashProvider ?? null;
      if (body.carwashNotes !== undefined) updateData.carwashNotes = body.carwashNotes ?? null;
      if (body.carwashTotal !== undefined) {
        updateData.carwashTotal = body.carwashTotal ?? 0;
      }
      if (body.attachments !== undefined) updateData.attachments = body.attachments;
      if (body.assignedUserId !== undefined) {
        const newAssigned = body.assignedUserId ? parseId('company-user', body.assignedUserId) : null;
        if (!isFull && newAssigned !== meId) {
          throw new ForbiddenError('Solo administradores o supervisores pueden reasignar a otro usuario.');
        }
        if (newAssigned != null) {
          const [target] = await db
            .select({ companyId: companyUsers.companyId })
            .from(companyUsers)
            .where(and(eq(companyUsers.id, newAssigned), eq(companyUsers.companyId, companyId)))
            .limit(1);
          if (!target) {
            throw new ForbiddenError('El usuario asignado no pertenece a esta empresa.');
          }
        }
        if (newAssigned !== existing.assignedUserId) {
          updateData.assignedUserId = newAssigned;
          await recordEvent(companyId, id, 'reassigned', {
            userId: meId,
            name:   req.user!.name ?? null,
          }, { from: existing.assignedUserId, to: newAssigned });
        }
      }

      // jul 2026 v9 — FIX: el bug "could not determine data type
      // of parameter $13 42P18" salía cuando un valor del
      // updateData era `undefined` o `null` (postgres.js lo manda
      // como `null` sin tipo OID, y Postgres no puede inferir).
      // El `if (body.X !== undefined) updateData.X = ...` YA filtra
      // el `undefined` (incluido el que el form ya no manda), y
      // el frontend ahora OMITE los campos opcionales vacíos
      // (`cadenceValue`, `nextTriggerKm`) en lugar de mandar
      // `null`. Limpiamos los `undefined` que pudieran haber
      // quedado antes del `.set(updateData)`.
      for (const k of Object.keys(updateData)) {
        if (updateData[k] === undefined) delete updateData[k];
      }

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set(updateData)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      if (body.items) {
        await db
          .delete(companyMaintenanceItems)
          .where(
            and(
              eq(companyMaintenanceItems.maintenanceId, id),
              sql`${companyMaintenanceItems.maintenanceId} IN (
                SELECT id FROM ${companyMaintenanceRecords}
                WHERE ${companyMaintenanceRecords.companyId} = ${companyId}
              )`,
            )!,
          );
        if (body.items.length) {
          // jul 2026 v4-b — Fix DEFINITIVO: drizzle 0.45.2 + postgres-js
          // rompe el bindeo cuando un campo del objeto es `undefined`
          // (lo strip'a del INSERT y queda un mismatch entre 12
          // placeholders y 11 params → "Failed query:" sin SQL state).
          // Saltamos la abstracción de drizzle y usamos client.unsafe
          // con SQL parametrizado manual. Controlamos 100% qué se bindea.
          const rows = buildItemValues(id, body.items);
          for (const r of rows) {
            await client.unsafe(
              `INSERT INTO company_maintenance_items
                (maintenance_id, supplier_id, name, photo_url,
                  quantity, unit_cost, subtotal,
                  discount_type, discount_value, iva_percent, iva_amount, total,
                  attachment_key)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
              [
                r.maintenanceId,
                r.supplierId,
                r.name,
                r.photoUrl,
                r.quantity,
                r.unitCost,
                r.subtotal,
                r.discountType,
                r.discountValue,
                r.ivaPercent,
                r.ivaAmount,
                r.total,
                r.attachmentKey,
              ],
            );
          }
        }
      }

      // jul 2026 v3 — recalcular el ledger de Finanzas para cada
      // attachmentKey afectado. Se ejecuta SIEMPRE que venga items
      // o attachments en el body. Cubre:
      //   • Repuesto agregado al drawer con attachmentKey → factura.
      //   • Repuesto editado (qty/unit) → subtotal/total recalculados.
      //   • Repuesto eliminado del drawer → se quita de la factura.
      //   • Attachment completo borrado → items caen al key anterior;
      //     recalc marca la factura como 'anulada' si no quedan.
      if (body.items !== undefined || body.attachments !== undefined) {
        const affectedKeys = new Set<string>();
        if (body.items) {
          for (const it of body.items) {
            if (it.attachmentKey && it.attachmentKey.trim().length > 0) {
              affectedKeys.add(it.attachmentKey);
            }
          }
        }
        // Keys huérfanas: existían antes pero ya no están en after.
        const beforeAttachments = (existing as any).attachments ?? [];
        const afterAttachments  = body.attachments ?? beforeAttachments;
        const beforeKeys = new Set(
          (beforeAttachments as Array<{ key?: string }>)
            .map((a) => a.key ?? '')
            .filter(Boolean),
        );
        const afterKeys = new Set(
          (afterAttachments as Array<{ key?: string }>)
            .map((a) => a.key ?? '')
            .filter(Boolean),
        );
        for (const k of beforeKeys) {
          if (!afterKeys.has(k)) affectedKeys.add(k);
        }
        for (const key of affectedKeys) {
          try {
            await recalcInvoiceFromAttachment({
              tx: db,
              companyId,
              maintenanceId: id,
              attachmentKey: key,
            });
          } catch (recErr) {
            console.warn(
              '[maintenances] recalcInvoiceFromAttachment falló para key',
              key,
              ':',
              (recErr as Error).message,
            );
          }
        }
      }

      await recalcMaintenanceTotal(id, companyId);

      // ── Sincronizar ledger Finanzas (módulo de facturas) ───────────────────
      // Llamamos SIEMPRE: si el operador no envió attachments nuevos,
      // syncMaintenanceInvoices es no-op para UPSERT pero igual borra
      // cualquier factura previa del mantenimiento cuyo attachment key
      // ya no esté (defensivo contra ediciones que solo cambiaron items).
      // Si SÍ envió attachments, toma la lista final como fuente de
      // verdad para el ledger.
      //
      // Usamos `updated.attachments` (la fila ya actualizada) en lugar de
      // `body.attachments` para reflejar exactamente lo que quedó
      // persistido. Si el body no traía attachments, esto preserva la
      // lista anterior y syncMaintenanceInvoices es efectivamente un
      // reconciliador idempotente.
      try {
        // jul 2026 v3 — el cast debe incluir TODOS los campos que
        // syncMaintenanceInvoices espera (incluido `isInvoice`, sin
        // este campo el sync SKIP-ea el attachment aunque sea factura).
        // El backend ya hizo el PATCH, asi que `updated.attachments`
        // tiene la lista final persistida (incluye el attachment nuevo
        // y el campo `isInvoice: true` que el frontend mando).
        await syncMaintenanceInvoices({
          tx: db,
          companyId,
          maintenanceId: id,
          attachments: (Array.isArray((updated as any).attachments)
            ? (updated as any).attachments
            : []) as any,
        });
      } catch (invErr) {
        // jul 2026 v3 — loguear con detalle (incluye stack) para
        // diagnosticar por qué las facturas no aparecen en Finanzas.
        console.error('[maintenances] syncMaintenanceInvoices falló en PUT:', (invErr as Error).message);
        console.error((invErr as Error).stack);
      }

      // NUEVO v3.4 — solo si status o scheduledFor pudieron cambiar si
      // "hoy" cuenta como activo. Evita queries innecesarias en ediciones
      // que no tocan esos campos (ej. solo cambiar laborCost o notes).
      if (body.status !== undefined || body.scheduledFor !== undefined) {
        await syncAssetMaintenanceStatus(existing.assetId, companyId);
      }

      const [full] = await db
        .select({
          m: companyMaintenanceRecords,
          assetName:  companyAssets.name,
          assetPlate: companyAssets.plate,
          workshopName: companyWorkshops.name,
          assignedUserName: companyUsersAsigned.username,
          subcategoryKey:   maintSubcatAlias.key,
          subcategoryLabel: maintSubcatAlias.label,
        })
        .from(companyMaintenanceRecords)
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
        .leftJoin(companyUsersAsigned, eq(companyUsersAsigned.id, companyMaintenanceRecords.assignedUserId))
        .leftJoin(maintSubcatAlias, eq(maintSubcatAlias.id, companyMaintenanceRecords.subcategoryId))
        .where(and(
          eq(companyMaintenanceRecords.id, id),
          eq(companyMaintenanceRecords.companyId, companyId),
        ))
        .limit(1);
      if (!full) throw new NotFoundError('Mantenimiento', req.params.id);
      const itemsMap  = await loadItemsMap([id]);
      const eventsMap = await loadEventsMap([id]);
      res.json(serializeMaintenance({ ...full.m, ...full }, itemsMap.get(id) ?? [], eventsMap.get(id) ?? []));
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /categories ────────────────────────────────────────────────────────
router.post(
  '/categories',
  requireModule('mantenimiento'),
  requireAdmin,
  validate(z.object({
    key:        z.string().min(2).max(60).regex(/^[A-Za-z0-9_\-:]+$/, 'Solo letras, números, guion, guion bajo y dos puntos'),
    label:      z.string().min(2).max(120),
    shortLabel: z.string().min(1).max(40).optional().nullable(),
    color:      z.string().min(2).max(20).default('sky'),
    icon:       z.string().min(2).max(40).default('wrench'),
    // jul 2026 — Sub-categorías opcionales. Cada una con su propio
    // key/label/color/icon. La key debe ser única DENTRO de la
    // categoría (constraint de la DB).
    subcategories: z.array(z.object({
      key:        z.string().min(2).max(60).regex(/^[A-Za-z0-9_\-:]+$/),
      label:      z.string().min(2).max(120),
      shortLabel: z.string().min(1).max(40).optional().nullable(),
      color:      z.string().min(2).max(20).default('sky'),
      icon:       z.string().min(2).max(40).default('wrench'),
    })).optional().default([]),
  })),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as {
        key: string; label: string; shortLabel?: string | null; color?: string; icon?: string;
        subcategories?: Array<{ key: string; label: string; shortLabel?: string | null; color?: string; icon?: string }>;
      };
      try {
        // jul 2026 — Creamos categoría + sub-categorías en una
        // transacción. Si la categoría falla, las sub-categorías no
        // se crean; si las sub-categorías fallan, hacemos rollback
        // de la categoría.
        const created = await db.transaction(async (tx) => {
          const [cat] = await tx
            .insert(companyMaintenanceCategories)
            .values({
              companyId,
              key:        body.key,
              label:      body.label,
              shortLabel: body.shortLabel ?? null,
              color:      body.color ?? 'sky',
              icon:       body.icon ?? 'wrench',
              isSystem:   false,
            })
            .returning();
          const subs = body.subcategories ?? [];
          if (subs.length > 0) {
            await tx.insert(companyMaintenanceSubcategories).values(
              subs.map((s, i) => ({
                companyId,
                categoryId: cat.id,
                key:        s.key,
                label:      s.label,
                shortLabel: s.shortLabel ?? null,
                color:      s.color ?? 'sky',
                icon:       s.icon ?? 'wrench',
                order:      i,
                isSystem:   false,
              })),
            );
          }
          return cat;
        });
        // Re-fetch con sub-categorías para devolver al cliente
        const subs = await db
          .select()
          .from(companyMaintenanceSubcategories)
          .where(eq(companyMaintenanceSubcategories.categoryId, created.id))
          .orderBy(asc(companyMaintenanceSubcategories.order));
        res.status(201).json({
          id: toId('maint-cat', created.id),
          companyId: toId('company', created.companyId),
          key: created.key,
          label: created.label,
          shortLabel: created.shortLabel,
          color: created.color,
          icon: created.icon,
          isSystem: created.isSystem,
          subcategories: subs.map((s) => ({
            id: toId('maint-subcat', s.id),
            key: s.key,
            label: s.label,
            shortLabel: s.shortLabel,
            color: s.color,
            icon: s.icon,
            order: s.order,
          })),
        });
      } catch (e: any) {
        if (e?.code === '23505') {
          throw new AppError(409, `Ya existe una categoría (o sub-categoría) con esa clave.`);
        }
        throw e;
      }
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /categories/:catId ────────────────────────────────────────────────────
// jul 2026 v5 — Editar una categoría custom (label, shortLabel, color, icon).
// NO se permite tocar la `key` después de creada (rompería los filtros
// de los mantenimientos existentes que la usen como value en `category`).
//
// jul 2026 v9 — Si el body incluye `subcategories`, se REEMPLAZA
// la lista completa de sub-categorías de esta categoría. Las
// sub-categorías viejas se borran (CASCADE → los mantenimientos
// que apuntaban a ellas quedan con `subcategoryId = NULL` pero
// siguen vivos). Las nuevas se crean en el orden del array.
// Esto simplifica el UX del form: el admin edita la lista
// completa, no una por una.
router.put(
  '/categories/:catId',
  requireModule('mantenimiento'),
  requireAdmin,
  validate(z.object({
    label:      z.string().min(2).max(120).optional(),
    shortLabel: z.string().min(1).max(40).optional().nullable(),
    color:      z.string().min(2).max(20).optional(),
    icon:       z.string().min(2).max(40).optional(),
    subcategories: z.array(z.object({
      key:        z.string().min(2).max(60).regex(/^[A-Za-z0-9_\-:]+$/),
      label:      z.string().min(2).max(120),
      shortLabel: z.string().min(1).max(40).optional().nullable(),
      color:      z.string().min(2).max(20).default('sky'),
      icon:       z.string().min(2).max(40).default('wrench'),
    })).optional(),
  })),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const catId = parseId('maint-cat', req.params.catId);
      const body = req.body as {
        label?: string; shortLabel?: string | null; color?: string; icon?: string;
        subcategories?: Array<{ key: string; label: string; shortLabel?: string | null; color?: string; icon?: string }>;
      };
      const [cat] = await db
        .select()
        .from(companyMaintenanceCategories)
        .where(and(eq(companyMaintenanceCategories.id, catId), eq(companyMaintenanceCategories.companyId, companyId)))
        .limit(1);
      if (!cat) throw new NotFoundError('Categoría', req.params.catId);
      if (cat.isSystem) throw new ForbiddenError('No se puede editar una categoría del sistema.');

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.label !== undefined)      updateData.label      = body.label;
      if (body.shortLabel !== undefined) updateData.shortLabel = body.shortLabel;
      if (body.color !== undefined)      updateData.color      = body.color;
      if (body.icon !== undefined)       updateData.icon       = body.icon;

      const updated = await db.transaction(async (tx) => {
        const [u] = await tx
          .update(companyMaintenanceCategories)
          .set(updateData)
          .where(and(eq(companyMaintenanceCategories.id, catId), eq(companyMaintenanceCategories.companyId, companyId)))
          .returning();
        if (body.subcategories !== undefined) {
          // Reemplazamos la lista completa. ON DELETE CASCADE borra
          // los registros hijos (mantenimientos con subcategoryId
          // apuntando acá quedan con NULL por la FK SET NULL).
          await tx
            .delete(companyMaintenanceSubcategories)
            .where(eq(companyMaintenanceSubcategories.categoryId, catId));
          if (body.subcategories.length > 0) {
            await tx.insert(companyMaintenanceSubcategories).values(
              body.subcategories.map((s, i) => ({
                companyId,
                categoryId: catId,
                key:        s.key,
                label:      s.label,
                shortLabel: s.shortLabel ?? null,
                color:      s.color ?? 'sky',
                icon:       s.icon ?? 'wrench',
                order:      i,
                isSystem:   false,
              })),
            );
          }
        }
        return u;
      });

      // Re-leemos las sub-categorías finales para devolver al cliente
      const subs = await db
        .select()
        .from(companyMaintenanceSubcategories)
        .where(eq(companyMaintenanceSubcategories.categoryId, catId))
        .orderBy(asc(companyMaintenanceSubcategories.order));
      res.json({
        id: toId('maint-cat', updated.id),
        companyId: toId('company', updated.companyId),
        key: updated.key,
        label: updated.label,
        shortLabel: updated.shortLabel,
        color: updated.color,
        icon: updated.icon,
        isSystem: updated.isSystem,
        subcategories: subs.map((s) => ({
          id: toId('maint-subcat', s.id),
          key: s.key,
          label: s.label,
          shortLabel: s.shortLabel,
          color: s.color,
          icon: s.icon,
          order: s.order,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/take ───────────────────────────────────────────────────────────
router.post(
  '/:id/take',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'crear'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meId = getUserIdFromSub(req.user!.sub);
      if (meId == null) throw new ForbiddenError('Sesión sin userId.');

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);
      if (existing.status !== 'Programado' && existing.status !== 'En curso' && existing.status !== 'En proceso' && existing.status !== 'Correccion') {
        throw new ForbiddenError(`No se puede tomar un mantenimiento en estado "${existing.status}".`);
      }
      if (existing.assignedUserId && existing.assignedUserId !== meId) {
        throw new AppError(409, 'Este mantenimiento ya está asignado a otro operador.');
      }

      if (existing.assignedUserId === meId) {
        return res.json({
          ok: true,
          id: toId('maintenance', existing.id),
          status: normalizeStatus(existing.status),
          assignedUserId: toId('company-user', meId),
        });
      }

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set({
          assignedUserId: meId,
          takenAt:        new Date(),
          updatedAt:      new Date(),
        })
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      await recordEvent(companyId, id, 'taken', { userId: meId, name: req.user!.name ?? null });

      // Notificar a admins (excepto actor) que un operador tomó este mantenimiento.
      try {
        await notifyAdminsExceptActor(companyId, meId, {
          kind:    'maintenance_taken',
          title:   maintTitle('Mantenimiento tomado', updated.title),
          body:    `${req.user!.name ?? 'Operador'} tomó este mantenimiento.`,
          payload: {
            maintenanceId: updated.id,
            assetId:       updated.assetId,
            takenByUserId: meId,
            actor:         req.user!.name ?? null,
          },
        });
      } catch (err) {
        console.warn('[maintenances] notify taken falló (no crítico):', (err as Error).message);
      }

      res.json({
        ok: true,
        id: toId('maintenance', updated.id),
        status: normalizeStatus(updated.status),
        assignedUserId: toId('company-user', meId),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/start ──────────────────────────────────────────────────────────
router.post(
  '/:id/start',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'crear'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;
      const isFull = hasFullAccess(meRole);
      if (meId == null) throw new ForbiddenError('Sesión sin userId.');

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);
      if (existing.status !== 'Programado' && existing.status !== 'En curso' && existing.status !== 'Correccion') {
        throw new ForbiddenError(`No se puede iniciar un mantenimiento en estado "${normalizeStatus(existing.status)}".`);
      }
      const isMine = existing.assignedUserId === meId || existing.createdBy === meId;
      if (!isFull && !isMine) {
        throw new ForbiddenError('Este mantenimiento está asignado a otro operador.');
      }
      const assignedUserId = existing.assignedUserId ?? meId;

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set({
          assignedUserId,
          takenAt:        existing.takenAt ?? new Date(),
          executedAt:     new Date(),
          status:         'En proceso',
          updatedAt:      new Date(),
        })
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      await recordEvent(companyId, id, 'started', { userId: meId, name: req.user!.name ?? null });

      // NUEVO v3.4
      await syncAssetMaintenanceStatus(existing.assetId, companyId);

      // Notificar al asignado (si no es el actor) + admins del cambio de estado.
      try {
        const notifyTarget = updated.assignedUserId;
        if (notifyTarget && notifyTarget !== meId) {
          await notify({
            companyId, userId: notifyTarget,
            kind:    'maintenance_status_changed',
            title:   maintTitle('Mantenimiento iniciado', updated.title),
            body:    `Tu mantenimiento cambió a "En proceso".`,
            payload: {
              maintenanceId: updated.id, assetId: updated.assetId,
              previousStatus: normalizeStatus(existing.status),
              newStatus: 'En proceso',
              actor: req.user!.name ?? null,
            },
          });
        }
        await notifyAdminsExceptActor(companyId, meId, {
          kind:    'maintenance_status_changed',
          title:   maintTitle('Mantenimiento en proceso', updated.title),
          body:    `${req.user!.name ?? 'Operador'} lo inició.`,
          payload: {
            maintenanceId: updated.id, assetId: updated.assetId,
            previousStatus: normalizeStatus(existing.status),
            newStatus: 'En proceso',
            actor: req.user!.name ?? null,
          },
        });
      } catch (err) {
        console.warn('[maintenances] notify start falló (no crítico):', (err as Error).message);
      }

      res.json({ ok: true, id: toId('maintenance', updated.id), status: 'En proceso' });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/assign ─────────────────────────────────────────────────────────
router.post(
  '/:id/assign',
  requireSupervisor,
  validate(assignSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const body = req.body as z.infer<typeof assignSchema>;
      const meId = getUserIdFromSub(req.user!.sub);
      const targetId = parseId('company-user', body.userId);

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set({
          assignedUserId: targetId,
          updatedAt: new Date(),
        })
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      await recordEvent(companyId, id, 'assigned', { userId: meId, name: req.user!.name ?? null }, { targetId });
      res.json({ ok: true, id: toId('maintenance', updated.id), assignedUserId: toId('company-user', targetId) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /:id/dates ─────────────────────────────────────────────────────────
router.patch(
  '/:id/dates',
  requireModule('mantenimiento'),
  requireAdmin,
  validate(updateDatesSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meRole = req.user!.role;

      if (meRole !== 'owner_empresa' && meRole !== 'admin_empresa' && meRole !== 'operador') {
        throw new ForbiddenError('Solo administradores, propietarios u operadores pueden editar estas fechas.');
      }

      const body = req.body as z.infer<typeof updateDatesSchema>;

      const [existing] = await db
        .select({ id: companyMaintenanceRecords.id })
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.executedAt !== undefined) {
        updateData.executedAt = body.executedAt ? new Date(body.executedAt) : null;
      }
      if (body.completedAt !== undefined) {
        updateData.completedAt = body.completedAt ? new Date(body.completedAt) : null;
      }

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set(updateData)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      res.json({
        ok: true,
        id: toId('maintenance', updated.id),
        executedAt: updated.executedAt,
        completedAt: updated.completedAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/finalize ───────────────────────────────────────────────────────
router.post(
  '/:id/finalize',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;
      const isFull = hasFullAccess(meRole);

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);
      if (existing.status === 'Completado') {
        throw new ForbiddenError('Este mantenimiento ya está completado.');
      }
      if (!isFull) {
        if (meId == null || (existing.assignedUserId !== meId && existing.createdBy !== meId)) {
          throw new ForbiddenError('Solo puedes finalizar mantenimientos asignados a vos.');
        }
      }

      // (jul 2026 v8.6) — Recalcular total ANTES de finalizar para
      // que el totalCost del WhatsApp refleje IVA + items + extras
      // actualizados. Bug conocido: este endpoint antes solo
      // cambiaba status sin tocar totalCost.
      await recalcMaintenanceTotal(id, companyId);

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set({
          status:      'Completado',
          completedAt: new Date(),
          completedBy: meId,
          updatedAt:   new Date(),
        })
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      await recordEvent(companyId, id, 'finalized', { userId: meId, name: req.user!.name ?? null });

      // NUEVO v3.4 — puede liberar el vehículo si este era el último
      // mantenimiento activo de hoy.
      await syncAssetMaintenanceStatus(existing.assetId, companyId);

      // Notificar al asignado (si no es el actor) + admins.
      try {
        const notifyTarget = updated.assignedUserId;
        if (notifyTarget && notifyTarget !== meId) {
          await notify({
            companyId, userId: notifyTarget,
            kind:    'maintenance_status_changed',
            title:   maintTitle('Mantenimiento completado', updated.title),
            body:    `Tu mantenimiento cambió a "Completado".`,
            payload: {
              maintenanceId: updated.id, assetId: updated.assetId,
              previousStatus: normalizeStatus(existing.status),
              newStatus: 'Completado',
              actor: req.user!.name ?? null,
            },
          });
        }
        await notifyAdminsExceptActor(companyId, meId, {
          kind:    'maintenance_status_changed',
          title:   maintTitle('Mantenimiento completado', updated.title),
          body:    `${req.user!.name ?? 'Operador'} lo finalizó.`,
          payload: {
            maintenanceId: updated.id, assetId: updated.assetId,
            previousStatus: normalizeStatus(existing.status),
            newStatus: 'Completado',
            actor: req.user!.name ?? null,
          },
        });
      } catch (err) {
        console.warn('[maintenances] notify complete falló (no crítico):', (err as Error).message);
      }

      // ── WhatsApp (jul 2026 v8.6) ─────────────────────────────────
      // Fire-and-forget: notifica que el mantenimiento se finalizó.
      // El recalcMaintenanceTotal ya corrió arriba, así que
      // updated.totalCost refleja el total con IVA + items + extras.
      try {
        const [finalData] = await db
          .select({
            plate:              companyAssets.plate,
            assignedUserName:   companyUsersAsigned.username,
          })
          .from(companyMaintenanceRecords)
          .leftJoin(companyAssets, eq(companyMaintenanceRecords.assetId, companyAssets.id))
          .leftJoin(
            companyUsersAsigned,
            eq(companyMaintenanceRecords.assignedUserId, companyUsersAsigned.id),
          )
          .where(eq(companyMaintenanceRecords.id, id))
          .limit(1);
        const isFree = !updated.assignedUserId;
        const responsibleName = isFree
          ? ''
          : (finalData?.assignedUserName ?? 'Sin asignar');
        const finalizedByName = req.user!.name ?? 'Operador';

        // (jul 2026 v8.6) — Multi-tenant: leemos config efectiva de la
        // empresa. Si no hay config, defaults globales. Si está
        // deshabilitado, no enviamos nada.
        const waConfig = await getEffectiveWhatsappConfig(companyId);
        if (waConfig.enabled && waConfig.notifyNumbers.length > 0) {
          const observations = updated.notes ?? '';
          const costStr = formatCurrency(updated.totalCost);
          const msg = renderTemplate(waConfig.templateCompleted, {
            placa:               finalData?.plate ?? 'desconocida',
            tipo:                updated.type,
            titulo:              updated.title ?? '',
            descripcion:         updated.description ?? '',
            costo:               costStr,
            fecha_fin:           formatDate(updated.completedAt ?? new Date()),
            responsable:         responsibleName || 'Sin asignar',
            responsable_linea:   responsibleName
              ? `• Responsable: ${responsibleName}`
              : '• Responsable: Mantenimiento libre (sin asignar)',
            observaciones:       observations,
            observaciones_linea: observations
              ? `• Observaciones: ${observations}`
              : '',
            finalizado_por:      finalizedByName,
          });
          notifyAll(
            msg,
            'maintenance_finalized',
            String(updated.id),
            waConfig.notifyNumbers,
          );
        }
      } catch (err) {
        console.warn('[maintenances] whatsapp finalized falló (no crítico):', (err as Error).message);
      }

      res.json({ ok: true, id: toId('maintenance', updated.id), status: 'Completado' });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/cancel-reschedule ─────────────────────────────────────────────
router.post(
  '/:id/cancel-reschedule',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
  validate(cancelRescheduleSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const body = req.body as z.infer<typeof cancelRescheduleSchema>;
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;
      const isFull = hasFullAccess(meRole);
      const keepItems = body.keepItems === true;

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);
      if (!isFull) {
        if (meId == null || (existing.assignedUserId !== meId && existing.createdBy !== meId)) {
          throw new ForbiddenError('Solo puedes cancelar mantenimientos asignados a vos.');
        }
      }

      if (!keepItems) {
        await db.delete(companyMaintenanceItems).where(eq(companyMaintenanceItems.maintenanceId, id));
      }

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set({
          status:         'Programado',
          scheduledFor:   new Date(body.newScheduledFor),
          isReprogrammed: true,
          reprogramReason: body.reason,
          reprogrammedAt:  new Date(),
          reprogramCount:  (existing.reprogramCount ?? 0) + 1,
          executedAt:      null,
          takenAt:         null,
          completedAt:     null,
          completedBy:     null,
          updatedAt:       new Date(),
        })
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      await recalcMaintenanceTotal(id, companyId);

      await recordEvent(companyId, id, 'cancelled', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, {
        reason:          body.reason,
        newScheduledFor: body.newScheduledFor,
        previousDate:    existing.scheduledFor,
        itemsCleared:    !keepItems,
        keepItems,
      });

      // NUEVO v3.4 — clave: si scheduledFor deja de ser "hoy" (se reagendó
      // para otra fecha), esto libera el vehículo; si sigue siendo hoy
      // (reagendado a hoy mismo por algún motivo), lo mantiene.
      await syncAssetMaintenanceStatus(existing.assetId, companyId);

      res.json({
        ok: true,
        id: toId('maintenance', updated.id),
        status: 'Programado',
        isReprogrammed: true,
        keepItems,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/reauthorize ────────────────────────────────────────────────────
router.post(
  '/:id/reauthorize',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'reautorizaciones', 'editar'),
  validate(reauthorizeSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meId = getUserIdFromSub(req.user!.sub);
      const body = req.body as z.infer<typeof reauthorizeSchema>;

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.id, id),
          eq(companyMaintenanceRecords.companyId, companyId),
        ))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);

      if (existing.status !== 'Atrasado') {
        throw new ForbiddenError('Solo se pueden reautorizar mantenimientos atrasados.');
      }
      if (existing.type !== 'Programado') {
        throw new ForbiddenError('Solo mantenimientos Programados soportan reautorización.');
      }

      if (meId != null && (existing.assignedUserId === meId || existing.createdBy === meId)) {
        throw new ForbiddenError(
          'No podés reautorizar un mantenimiento que tenías asignado o que vos mismo creaste. ' +
          'Pedile a un superior que lo reautorice.',
        );
      }

      await db
        .update(companyMaintenanceRecords)
        .set({ status: 'Programado', updatedAt: new Date() })
        .where(and(
          eq(companyMaintenanceRecords.id, id),
          eq(companyMaintenanceRecords.companyId, companyId),
        ));

      await recordEvent(companyId, id, 'reauthorized', {
        userId: meId,
        name: req.user!.name ?? null,
      }, {
        reason: body?.reason ?? null,
        previousStatus: existing.status,
        newStatus: 'Programado',
      });

      // NUEVO v3.4 — si scheduledFor (que sigue siendo la fecha original,
      // ya pasada) coincide con "hoy" por alguna coincidencia, o si el
      // mantenimiento se reautoriza el mismo día en que estaba programado,
      // esto lo activa.
      await syncAssetMaintenanceStatus(existing.assetId, companyId);

      res.json({ ok: true, status: 'Programado' });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/request-reauth ──────────────────────────────────────────────────
// Jun 2026 — flujo de reautorización de mantenimiento atrasado.
// El operador/conductor ASIGNADO no puede auto-escalarse: tiene que
// crear una solicitud pendiente acá. La bandeja de los aprobadores
// (admin/supervisor con permiso `mantenimiento.reautorizaciones.editar`)
// la resuelve luego.
router.post(
  '/:id/request-reauth',
  requireModule('mantenimiento'),
  // Cualquier operador asignado puede pedir reautorización de SU mantenimiento.
  // Verificación estricta de ownership se hace más abajo (existing.assignedUserId === meId).
  requirePermission('mantenimiento', 'reautorizaciones', 'ver'),
  validate(requestReauthSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id        = parseId('maintenance', req.params.id);
      const meId      = getUserIdFromSub(req.user!.sub);
      const meRole    = req.user!.role ?? '';
      const body      = req.body as z.infer<typeof requestReauthSchema>;

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.id, id),
          eq(companyMaintenanceRecords.companyId, companyId),
        ))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);

      if (existing.status !== 'Atrasado') {
        throw new ForbiddenError(
          'Solo se pueden reautorizar mantenimientos atrasados.',
        );
      }
      if (existing.type !== 'Programado') {
        throw new ForbiddenError(
          'Solo mantenimientos Programados soportan reautorización.',
        );
      }
      // Si el caller es full (admin/owner/supervisor), ya tiene
      // acceso directo al endpoint viejo de reautorizar — no debería
      // estar pasando por acá. Igual lo dejamos pasar por consistencia.
      const isFull = hasFullAccess(meRole);
      if (!isFull) {
        // Igual que en POST /:id/reauthorize: el asignado / creador NO se
        // auto-aprueba (regla fuerte para evitar fraude). Como acá solo
        // está PIDIENDO la reapertura, sí le permitimos.
        if (meId == null) {
          throw new ForbiddenError('No se pudo identificar tu usuario.');
        }
        if (existing.assignedUserId !== meId && existing.createdBy !== meId) {
          throw new ForbiddenError(
            'Solo el usuario asignado o el creador del mantenimiento puede pedir una reautorización.',
          );
        }
      }

      // Bloquea si ya hay una solicitud Pendiente abierta (idempotencia
      // de UX: el operador no debería spamear el botón).
      const [pending] = await db
        .select({ id: companyMaintenanceReauthorizations.id })
        .from(companyMaintenanceReauthorizations)
        .where(and(
          eq(companyMaintenanceReauthorizations.maintenanceId, id),
          eq(companyMaintenanceReauthorizations.companyId, companyId),
          eq(companyMaintenanceReauthorizations.status, 'Pendiente'),
        ))
        .limit(1);
      if (pending) {
        throw new AppError(
          409,
          'Ya hay una solicitud pendiente para este mantenimiento. Esperá a que la aprueben o la rechacen.',
        );
      }

      const [created] = await db
        .insert(companyMaintenanceReauthorizations)
        .values({
          companyId,
          maintenanceId:           id,
          maintenanceStatus:       existing.status,
          maintenanceScheduledFor: existing.scheduledFor,
          action:                  body.action,
          status:                  'Pendiente',
          reason:                  body.reason,
          proposedScheduledFor:    body.action === 'reschedule' && body.proposedScheduledFor
                                    ? new Date(body.proposedScheduledFor)
                                    : null,
          requestedByUserId:       meId ?? null,
          requestedByName:         req.user!.name ?? null,
          requestedByRole:         meRole,
        })
        .returning();

      // Auditoría timeline del mantenimiento (para reportes / drawer).
      await recordEvent(companyId, id, 'reauth_requested', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, {
        reauthId: toId('reauth', created.id),
        action:   body.action,
        reason:   body.reason,
      });

      // Notificación a admins (excepto al actor si fuera admin/supervisor).
      try {
        const actorIdForNotify = meId ?? undefined;
        await notifyAdminsExceptActor(companyId, actorIdForNotify, {
          kind:    'maintenance_reauth_requested',
          title:   `Reautorización solicitada: ${existing.title ?? 'Mantenimiento'}`,
          body:    `Solicitada por ${req.user!.name ?? 'el asignado'} (${body.action})`,
          payload: {
            maintenanceId: id,
            reauthId:      toId('reauth', created.id),
            action:        body.action,
            reason:        body.reason,
            actor:         req.user!.name,
          },
        });
      } catch (err) {
        console.warn('[maintenances] notify reauth_requested falló:', (err as Error).message);
      }

      res.status(201).json(serializeReauth(created));
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id/reauths ─────────────────────────────────────────────────────────
// Bandeja: lista solicitudes. Si el caller es full, ve TODAS las de la
// empresa. Si no, ve solo las SUYAS (las que pidió).
router.get(
  '/:id/reauths',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'reautorizaciones', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id        = parseId('maintenance', req.params.id);
      const meId      = getUserIdFromSub(req.user!.sub);
      const meRole    = req.user!.role ?? '';
      const isFull    = hasFullAccess(meRole);

      const conds = [
        eq(companyMaintenanceReauthorizations.companyId, companyId),
        eq(companyMaintenanceReauthorizations.maintenanceId, id),
      ];
      if (!isFull && meId != null) {
        conds.push(eq(companyMaintenanceReauthorizations.requestedByUserId, meId));
      }

      const rows = await db
        .select()
        .from(companyMaintenanceReauthorizations)
        .where(and(...conds))
        .orderBy(desc(companyMaintenanceReauthorizations.createdAt));

      res.json(rows.map(serializeReauth));
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/approve-reauth ─────────────────────────────────────────────────
// Aprueba una solicitud Pendiente. Caller debe tener `reautorizaciones.editar`.
// Si la solicitud.action === 'open' → status=Programado, scheduledFor=HOY.
// Si 'reschedule' → status=Programado, scheduledFor=newScheduledFor
//                  (o la propuesta si no vino).
router.post(
  '/:id/approve-reauth',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'reautorizaciones', 'editar'),
  validate(approveReauthSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id        = parseId('maintenance', req.params.id);
      const meId      = getUserIdFromSub(req.user!.sub);
      const body      = req.body as z.infer<typeof approveReauthSchema>;

      const reauthIdNum = parseId('reauth', body.reauthId);

      const [reauth] = await db
        .select()
        .from(companyMaintenanceReauthorizations)
        .where(and(
          eq(companyMaintenanceReauthorizations.id, reauthIdNum),
          eq(companyMaintenanceReauthorizations.companyId, companyId),
        ))
        .limit(1);
      if (!reauth) throw new NotFoundError('Solicitud de reautorización', body.reauthId);
      if (reauth.status !== 'Pendiente') {
        throw new AppError(409, `La solicitud ya está ${reauth.status}.`);
      }
      if (reauth.maintenanceId !== id) {
        throw new AppError(400, 'La solicitud no corresponde a este mantenimiento.');
      }

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.id, id),
          eq(companyMaintenanceRecords.companyId, companyId),
        ))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);
      if (existing.status !== 'Atrasado') {
        throw new AppError(409, 'Este mantenimiento ya no está atrasado. Cancelá la solicitud y reintentá.');
      }

      // Resolver nueva fecha.
      let appliedDate: Date;
      if (reauth.action === 'open') {
        // 'open' = HOY. Forzamos, ignoramos newScheduledFor.
        appliedDate = new Date();
      } else {
        // 'reschedule' = el admin (o el operador) eligió una fecha.
        if (body.newScheduledFor) {
          appliedDate = new Date(body.newScheduledFor);
        } else if (reauth.proposedScheduledFor) {
          appliedDate = reauth.proposedScheduledFor instanceof Date
            ? reauth.proposedScheduledFor
            : new Date(String(reauth.proposedScheduledFor));
        } else {
          throw new ForbiddenError(
            'Para reprogramar, indicá la nueva fecha (newScheduledFor) o pedísela al operador.',
          );
        }
      }

      const now = new Date();

      // 1) Marcar la solicitud como Aprobada.
      const [updatedReauth] = await db
        .update(companyMaintenanceReauthorizations)
        .set({
          status:               'Aprobada',
          decidedByUserId:      meId ?? null,
          decidedByName:        req.user!.name ?? null,
          decisionNotes:        body.decisionNotes ?? null,
          decidedAt:            now,
          appliedScheduledFor:  appliedDate,
          updatedAt:            now,
        })
        .where(eq(companyMaintenanceReauthorizations.id, reauth.id))
        .returning();

      // 2) Reabrir el mantenimiento.
      //    Status siempre 'Programado' (no auto-pasar a 'En proceso').
      //    Limpia `isOverdue` implícito: el status ya no es Atrasado.
      //    Si la acción era 'reschedule', también marca isReprogrammed=true.
      const isReschedule = reauth.action === 'reschedule';
      await db
        .update(companyMaintenanceRecords)
        .set({
          status:               'Programado',
          scheduledFor:         appliedDate,
          // Si era reprogramación, marcamos el flag.
          ...(isReschedule ? {
            isReprogrammed:    true,
            reprogramReason:   body.decisionNotes ?? reauth.reason,
            reprogrammedAt:    now,
            reprogramCount:    (existing.reprogramCount ?? 0) + 1,
          } : {}),
          // Trazabilidad del último request aprobado.
          lastReauthorizationId: reauth.id,
          updatedAt:            now,
        })
        .where(and(
          eq(companyMaintenanceRecords.id, id),
          eq(companyMaintenanceRecords.companyId, companyId),
        ));

      // 3) Auditoría timeline del mantenimiento.
      await recordEvent(companyId, id, 'reauthorized', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, {
        reauthId:     toId('reauth', reauth.id),
        action:       reauth.action,
        newScheduledFor: appliedDate.toISOString(),
        previousStatus:  existing.status,
        newStatus:    'Programado',
        notes:        body.decisionNotes ?? null,
      });

      // 4) Sincronizar el status del asset (porque el mantenimiento
      //    ya no está Atrasado, el asset podría habilitarse).
      await syncAssetMaintenanceStatus(existing.assetId, companyId);

      // 5) Notificación al solicitante (operador/conductor que pidió la reaut.)
      try {
        if (reauth.requestedByUserId) {
          await notify({
            companyId,
            userId:  reauth.requestedByUserId,
            kind:    'maintenance_reauth_decided',
            title:   `Reautorización aprobada: ${existing.title ?? 'Mantenimiento'}`,
            body:    `Aprobada por ${req.user!.name ?? 'un administrador'}. Nueva fecha: ${appliedDate.toLocaleDateString('es-AR')}`,
            payload: {
              maintenanceId:   id,
              reauthId:        toId('reauth', reauth.id),
              decision:        'Aprobada',
              newScheduledFor: appliedDate.toISOString(),
              notes:           body.decisionNotes ?? null,
            },
          });
        }
      } catch (err) {
        console.warn('[maintenances] notify reauth_decided (approve) falló:', (err as Error).message);
      }

      res.json(serializeReauth(updatedReauth));
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/deny-reauth ────────────────────────────────────────────────────
// Rechaza una solicitud Pendiente. Caller debe tener `reautorizaciones.editar`.
// El mantenimiento queda Atrasado como estaba. Solo se registra el rechazo
// en la tabla + timeline.
router.post(
  '/:id/deny-reauth',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'reautorizaciones', 'editar'),
  validate(denyReauthSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id        = parseId('maintenance', req.params.id);
      const meId      = getUserIdFromSub(req.user!.sub);
      const body      = req.body as z.infer<typeof denyReauthSchema>;

      const reauthIdNum = parseId('reauth', body.reauthId);

      const [reauth] = await db
        .select()
        .from(companyMaintenanceReauthorizations)
        .where(and(
          eq(companyMaintenanceReauthorizations.id, reauthIdNum),
          eq(companyMaintenanceReauthorizations.companyId, companyId),
        ))
        .limit(1);
      if (!reauth) throw new NotFoundError('Solicitud de reautorización', body.reauthId);
      if (reauth.status !== 'Pendiente') {
        throw new AppError(409, `La solicitud ya está ${reauth.status}.`);
      }
      if (reauth.maintenanceId !== id) {
        throw new AppError(400, 'La solicitud no corresponde a este mantenimiento.');
      }

      const now = new Date();

      const [updatedReauth] = await db
        .update(companyMaintenanceReauthorizations)
        .set({
          status:          'Rechazada',
          decidedByUserId: meId ?? null,
          decidedByName:   req.user!.name ?? null,
          decisionNotes:   body.decisionNotes,
          decidedAt:       now,
          updatedAt:       now,
        })
        .where(eq(companyMaintenanceReauthorizations.id, reauth.id))
        .returning();

      // Auditoría timeline.
      await recordEvent(companyId, id, 'reauth_denied', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, {
        reauthId: toId('reauth', reauth.id),
        notes:    body.decisionNotes,
      });

      // Notificación al solicitante.
      try {
        if (reauth.requestedByUserId) {
          const [existing] = await db
            .select({ title: companyMaintenanceRecords.title })
            .from(companyMaintenanceRecords)
            .where(eq(companyMaintenanceRecords.id, id))
            .limit(1);
          await notify({
            companyId,
            userId:  reauth.requestedByUserId,
            kind:    'maintenance_reauth_decided',
            title:   `Reautorización rechazada: ${existing?.title ?? 'Mantenimiento'}`,
            body:    `Rechazada por ${req.user!.name ?? 'un administrador'}.${body.decisionNotes ? ' Motivo: ' + body.decisionNotes : ''}`,
            payload: {
              maintenanceId: id,
              reauthId:      toId('reauth', reauth.id),
              decision:      'Rechazada',
              notes:         body.decisionNotes ?? null,
            },
          });
        }
      } catch (err) {
        console.warn('[maintenances] notify reauth_decided (deny) falló:', (err as Error).message);
      }

      // jun 2026 — limpiar `last_reauthorization_id` del mantenimiento si
      // esta es la decisión más reciente y NO hay una aprobación posterior.
      // El chip "Reautorizado" debe representar el estado vigente de
      // decisión, no el histórico: si la última decisión es un rechazo,
      // no mostramos el chip verde.
      // Lógica:
      //   1. ¿Hay alguna reaut aprobada para este mantenimiento
      //      cuyo `decided_at` sea MAYOR al `decided_at` de la rechazada
      //      que acabamos de procesar? Si sí → esa aprobación gana, no tocar.
      //   2. Si no → la última decisión del mantenimiento es este rechazo →
      //      `last_reauthorization_id = NULL`.
      const laterApproved = await db
        .select({ id: companyMaintenanceReauthorizations.id })
        .from(companyMaintenanceReauthorizations)
        .where(and(
          eq(companyMaintenanceReauthorizations.maintenanceId, id),
          eq(companyMaintenanceReauthorizations.status, 'Aprobada'),
          // Decidida después de esta rechazada (o pendiente, decided_at NULL)
          or(
            gte(companyMaintenanceReauthorizations.decidedAt, now),
            isNull(companyMaintenanceReauthorizations.decidedAt),
          )!,
        ))
        .limit(1);
      if (laterApproved.length === 0) {
        await db
          .update(companyMaintenanceRecords)
          .set({ lastReauthorizationId: null, updatedAt: now })
          .where(eq(companyMaintenanceRecords.id, id));
      }

      res.json(serializeReauth(updatedReauth));
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/request-correction ────────────────────────────────────────────
router.post(
  '/:id/request-correction',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
  validate(requestCorrectionSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const body = req.body as z.infer<typeof requestCorrectionSchema>;
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;

      if (meRole !== 'owner_empresa' && meRole !== 'admin_empresa' && meRole !== 'supervisor') {
        throw new ForbiddenError('Solo administradores o supervisores pueden marcar una corrección.');
      }

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);
      if (existing.status !== 'Completado') {
        throw new ForbiddenError('Solo se puede solicitar corrección sobre un mantenimiento completado.');
      }

      const updateData: Record<string, unknown> = {
        status:                'Correccion',
        correctionReason:      body.reason,
        correctionRequestedAt: new Date(),
        completedAt:           null,
        completedBy:           null,
        updatedAt:             new Date(),
      };
      if (body.newScheduledFor) {
        updateData.scheduledFor = new Date(body.newScheduledFor);
      }

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set(updateData)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      await recordEvent(companyId, id, 'correction_requested', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, {
        reason: body.reason,
        newScheduledFor: body.newScheduledFor ?? null,
        rescheduled: !!body.newScheduledFor,
      });

      // NUEVO v3.4 — reabrir un Completado a Correccion puede activar de
      // nuevo el status del vehículo si la fecha (nueva o la original)
      // corresponde a hoy.
      await syncAssetMaintenanceStatus(existing.assetId, companyId);

      // Notificar al asignado (si no es el actor) + admins.
      try {
        const notifyTarget = updated.assignedUserId;
        if (notifyTarget && notifyTarget !== meId) {
          await notify({
            companyId, userId: notifyTarget,
            kind:    'maintenance_status_changed',
            title:   maintTitle('Mantenimiento requiere corrección', updated.title),
            body:    `Un supervisor pidió correcciones.`,
            payload: {
              maintenanceId: updated.id, assetId: updated.assetId,
              previousStatus: 'Completado', newStatus: 'Correccion',
              reason: body.reason ?? null,
              actor: req.user!.name ?? null,
            },
          });
        }
        await notifyAdminsExceptActor(companyId, meId, {
          kind:    'maintenance_status_changed',
          title:   maintTitle('Mantenimiento enviado a corrección', updated.title),
          body:    `Volvió a estado "Correccion".`,
          payload: {
            maintenanceId: updated.id, assetId: updated.assetId,
            previousStatus: 'Completado', newStatus: 'Correccion',
            reason: body.reason ?? null,
            actor: req.user!.name ?? null,
          },
        });
      } catch (err) {
        console.warn('[maintenances] notify correction falló (no crítico):', (err as Error).message);
      }

      res.json({
        ok: true,
        id: toId('maintenance', updated.id),
        status: 'Correccion',
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/notes ──────────────────────────────────────────────────────────
router.post(
  '/:id/notes',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
  validate(noteSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const body = req.body as z.infer<typeof noteSchema>;
      const meId = getUserIdFromSub(req.user!.sub);
      await recordEvent(companyId, id, 'note_added', { userId: meId, name: req.user!.name ?? null }, { text: body.text });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/items ──────────────────────────────────────────────────────────
router.post(
  '/:id/items',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
  validate(z.object({ items: z.array(itemSchema).max(50) })),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meId = getUserIdFromSub(req.user!.sub);
      const body = req.body as { items: z.infer<typeof itemSchema>[] };

      // jul 2026 v3 — antes fallaba con "values() must be called with at
// least one value" cuando el cliente mandaba items=[] (caso típico:
// borrar todos los items de un mantenimiento para limpiar la factura).
// Permitimos items=[] como no-op: solo recalculamos el total.
      if (body.items.length > 0) {
        for (const values of buildItemValues(id, body.items)) {
          await db.insert(companyMaintenanceItems).values(values);
        }
      }
      const total = await recalcMaintenanceTotal(id, companyId);

      await recordEvent(companyId, id, 'item_added', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, { count: body.items.length, totalAdded: total });

      res.json({ ok: true, totalCost: total });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /:id/items/:itemId ─────────────────────────────────────────────────
// jul 2026 v9 — Edita un item existente IN-PLACE. Antes el frontend
// usaba DELETE + POST para "actualizar" un item, lo que causaba
// duplicaciones si el DELETE no se completaba antes del refetch
// (race condition entre el invalidateQueries doble y el refetch
// manual). Ahora hay UPDATE real: 1 sola operación, 1 solo refetch,
// imposible duplicar.
router.patch(
  '/:id/items/:itemId',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
  validate(itemSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const maintenanceId = parseId('maintenance', req.params.id);
      const itemIdRaw = String(req.params.itemId);
      const itemIdMatch = /^(?:maintenance[-_]?item-)?(\d+)$/i.exec(itemIdRaw)
                       || /^(\d+)$/.exec(itemIdRaw);
      if (!itemIdMatch) {
        throw new AppError(400, `ID de item inválido: ${req.params.itemId}`);
      }
      const itemId = Number(itemIdMatch[1]);
      const body = req.body as z.infer<typeof itemSchema>;
      const meId = getUserIdFromSub(req.user!.sub);

      // Verificar que el item pertenece a este mantenimiento.
      const [existing] = await db
        .select({ id: companyMaintenanceItems.id })
        .from(companyMaintenanceItems)
        .where(
          and(
            eq(companyMaintenanceItems.id, itemId),
            eq(companyMaintenanceItems.maintenanceId, maintenanceId),
          ),
        )
        .limit(1);
      if (!existing) {
        throw new AppError(404, 'Item no encontrado en este mantenimiento.');
      }

      // Recalcular subtotal/iva/total con los datos nuevos.
      const totals = computeItemTotals({
        quantity:      body.quantity,
        unitCost:      body.unitCost,
        discountValue: body.discountValue,
        discountType:  body.discountType,
        ivaPercent:    body.ivaPercent,
      });

      await db
        .update(companyMaintenanceItems)
        .set({
          supplierId:    body.supplierId ? parseId('supplier', body.supplierId) : null,
          name:          body.name,
          quantity:      body.quantity.toFixed(2),
          unitCost:      body.unitCost.toFixed(2),
          subtotal:      totals.subtotal.toFixed(2),
          discountType:  body.discountType ?? 'amount',
          discountValue: (body.discountValue ?? 0).toFixed(2),
          ivaPercent:    (body.ivaPercent ?? 15).toFixed(2),
          ivaAmount:     totals.ivaAmount.toFixed(2),
          total:         totals.total.toFixed(2),
          photoUrl:      body.photoUrl ?? null,
        })
        .where(eq(companyMaintenanceItems.id, itemId));

      const total = await recalcMaintenanceTotal(maintenanceId, companyId);

      await recordEvent(companyId, maintenanceId, 'item_updated', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, { itemId, totalAfter: total });

      res.json({ ok: true, totalCost: total });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /:id/items/:itemId ────────────────────────────────────────────────
// jul 2026 v3 — borrar un item del mantenimiento. Si el item tiene
// `attachment_key`, recalcula la factura del ledger (subtotal/total/items)
// y la marca como 'anulada' si no quedan items.
router.delete(
  '/:id/items/:itemId',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const maintenanceId = parseId('maintenance', req.params.id);
      // jul 2026 — FIX: el toId() del backend usa el prefijo `maintenance-item`
      // (con guión, lowercase) en TODAS las rutas que devuelven items. Aceptamos:
      //   - `maintenance-item-81`   (formato generado por toId)
      //   - `maintenanceItem-81`   (formato alternativo)
      //   - `81`                    (ID numérico puro)
      // El parseIdFlexible estándar NO matchea `maintenance-item-81` (su regex
      // `^item-(\d+)$` no lo captura), así que usamos uno propio que agarra
      // el último segmento numérico del ID.
      const itemIdRaw = String(req.params.itemId);
      const itemIdMatch = /^(?:maintenance[-_]?item-)?(\d+)$/i.exec(itemIdRaw)
                       || /^(\d+)$/.exec(itemIdRaw);
      if (!itemIdMatch) {
        throw new AppError(400, `ID inválido: ${req.params.itemId}`);
      }
      const itemId = Number(itemIdMatch[1]);

      // 1) Cargar el item antes de borrar (necesitamos el attachmentKey
      //    para el recalc de la factura dueña).
      const [existingItem] = await db
        .select({
          id:           companyMaintenanceItems.id,
          attachmentKey: companyMaintenanceItems.attachmentKey,
        })
        .from(companyMaintenanceItems)
        .where(
          and(
            eq(companyMaintenanceItems.id, itemId),
            eq(companyMaintenanceItems.maintenanceId, maintenanceId),
          ),
        )
        .limit(1);

      if (!existingItem) {
        return res.status(404).json({ error: 'Item no encontrado' });
      }

      // 2) Borrar el item.
      await db
        .delete(companyMaintenanceItems)
        .where(eq(companyMaintenanceItems.id, itemId));

      // 3) Recalcular el total del mantenimiento.
      await recalcMaintenanceTotal(maintenanceId, companyId);

      // 4) Si el item tenía attachment_key, recalcular la factura
      //    dueña en el ledger de Finanzas.
      if (existingItem.attachmentKey) {
        try {
          await recalcInvoiceFromAttachment({
            tx: db,
            companyId,
            maintenanceId,
            attachmentKey: existingItem.attachmentKey,
          });
        } catch (recErr) {
          console.warn(
            '[maintenances] recalcInvoice falló al borrar item',
            itemId,
            ':',
            (recErr as Error).message,
          );
        }
      }

      res.json({ ok: true, deleted: { id: itemId, attachmentKey: existingItem.attachmentKey } });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/carwash-extras ─────────────────────────────────────────────────
router.post(
  '/:id/carwash-extras',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
  validate(z.object({ extras: z.array(carwashExtraSchema).max(50) })),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meId = getUserIdFromSub(req.user!.sub);
      const body = req.body as { extras: z.infer<typeof carwashExtraSchema>[] };

      const [m] = await db
        .select({ id: companyMaintenanceRecords.id, type: companyMaintenanceRecords.type })
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!m) throw new NotFoundError('Mantenimiento', req.params.id);
      if (m.type !== 'Lavada') {
        throw new ForbiddenError('Los adicionales de lavada solo aplican a mantenimientos de tipo Lavada.');
      }

      const inserted = await db.insert(companyMaintenanceCarwashExtras).values(
        body.extras.map((e) => ({
          maintenanceId: id,
          name:     e.name,
          quantity: String(e.quantity),
          unitCost: String(e.unitCost),
          subtotal: (e.quantity * e.unitCost).toFixed(2),
          photoUrl: e.photoUrl ?? null,
        }))
      ).returning();

      const newTotal = await recalcMaintenanceTotal(id, companyId);
      const addedTotal = body.extras.reduce((acc, i) => acc + i.quantity * i.unitCost, 0);

      await recordEvent(companyId, id, 'item_added', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, { count: body.extras.length, totalAdded: addedTotal, kind: 'carwash_extra' });

      res.status(201).json({
        data: inserted.map((e) => ({
          id: e.id,
          maintenanceId: toId('maintenance', e.maintenanceId),
          name: e.name,
          quantity: Number(e.quantity),
          unitCost: Number(e.unitCost),
          subtotal: Number(e.subtotal),
          photoUrl: e.photoUrl,
          createdAt: e.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id/carwash-extras ──────────────────────────────────────────────────
router.get(
  '/:id/carwash-extras',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const [m] = await db
        .select({ companyId: companyMaintenanceRecords.companyId })
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.id, id),
          eq(companyMaintenanceRecords.companyId, companyId),
        ))
        .limit(1);
      if (!m) throw new NotFoundError('Mantenimiento', req.params.id);

      const rows = await db
        .select()
        .from(companyMaintenanceCarwashExtras)
        .where(eq(companyMaintenanceCarwashExtras.maintenanceId, id))
        .orderBy(companyMaintenanceCarwashExtras.createdAt);

      res.json({
        data: rows.map((e) => ({
          id: e.id,
          maintenanceId: toId('maintenance', e.maintenanceId),
          name: e.name,
          quantity: Number(e.quantity),
          unitCost: Number(e.unitCost),
          subtotal: Number(e.subtotal),
          photoUrl: e.photoUrl,
          createdAt: e.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/carwash-photos ─────────────────────────────────────────────────
router.post(
  '/:id/carwash-photos',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
  validate(z.object({ photos: z.array(carwashPhotoSchema).max(20) })),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meId = getUserIdFromSub(req.user!.sub);
      const body = req.body as { photos: z.infer<typeof carwashPhotoSchema>[] };

      const [m] = await db
        .select({ id: companyMaintenanceRecords.id, type: companyMaintenanceRecords.type, companyId: companyMaintenanceRecords.companyId })
        .from(companyMaintenanceRecords)
        .where(eq(companyMaintenanceRecords.id, id))
        .limit(1);
      if (!m || m.companyId !== companyId) throw new NotFoundError('Mantenimiento', req.params.id);
      if (m.type !== 'Lavada') {
        throw new ForbiddenError('Las fotos de lavada solo aplican a mantenimientos de tipo Lavada.');
      }

      const inserted = await db.insert(companyMaintenanceCarwashPhotos).values(
        body.photos.map((p) => ({
          maintenanceId:  id,
          photoUrl:       p.photoUrl,
          caption:        p.caption ?? null,
          uploadedBy:     meId,
          uploadedByName: req.user!.name ?? null,
        }))
      ).returning();

      await recordEvent(companyId, id, 'photo_uploaded', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, { count: body.photos.length, kind: 'carwash_photo' });

      res.status(201).json({
        data: inserted.map((p) => ({
          id: p.id,
          maintenanceId: toId('maintenance', p.maintenanceId),
          photoUrl: p.photoUrl,
          caption: p.caption,
          uploadedBy: p.uploadedBy ? toId('company-user', p.uploadedBy) : null,
          uploadedByName: p.uploadedByName,
          createdAt: p.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id/carwash-photos ──────────────────────────────────────────────────
router.get(
  '/:id/carwash-photos',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const [m] = await db
        .select({ companyId: companyMaintenanceRecords.companyId })
        .from(companyMaintenanceRecords)
        .where(eq(companyMaintenanceRecords.id, id))
        .limit(1);
      if (!m || m.companyId !== companyId) throw new NotFoundError('Mantenimiento', req.params.id);
      const rows = await db
        .select()
        .from(companyMaintenanceCarwashPhotos)
        .where(eq(companyMaintenanceCarwashPhotos.maintenanceId, id))
        .orderBy(companyMaintenanceCarwashPhotos.createdAt);
      res.json({
        data: rows.map((p) => ({
          id: p.id,
          maintenanceId: toId('maintenance', p.maintenanceId),
          photoUrl: p.photoUrl,
          caption: p.caption,
          uploadedBy: p.uploadedBy ? toId('company-user', p.uploadedBy) : null,
          uploadedByName: p.uploadedByName,
          createdAt: p.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /categories/:catId ───────────────────────────────────────────────
router.delete(
  '/categories/:catId',
  requireModule('mantenimiento'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const catId = parseId('maint-cat', req.params.catId);
      const [cat] = await db
        .select()
        .from(companyMaintenanceCategories)
        .where(and(eq(companyMaintenanceCategories.id, catId), eq(companyMaintenanceCategories.companyId, companyId)))
        .limit(1);
      if (!cat) throw new NotFoundError('Categoría', req.params.catId);
      if (cat.isSystem) throw new ForbiddenError('No se puede eliminar una categoría del sistema.');
      await db
        .delete(companyMaintenanceCategories)
        .where(and(eq(companyMaintenanceCategories.id, catId), eq(companyMaintenanceCategories.companyId, companyId)));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── /complete (legacy compat) ───────────────────────────────────────────────
router.post(
  '/:id/complete',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
  async (req, res, next) => {
    req.url = req.url.replace('/complete', '/finalize');
    return router.handle(req, res, next);
  },
);

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
router.delete(
  '/:id',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'records', 'eliminar'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;

      if (meRole !== 'owner_empresa' && meRole !== 'admin_empresa') {
        throw new ForbiddenError('Solo administradores pueden eliminar mantenimientos.');
      }

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);

      await db.delete(companyMaintenanceItems).where(eq(companyMaintenanceItems.maintenanceId, id));
      await db.delete(companyMaintenanceCarwashExtras).where(eq(companyMaintenanceCarwashExtras.maintenanceId, id));
      await db.delete(companyMaintenanceCarwashPhotos).where(eq(companyMaintenanceCarwashPhotos.maintenanceId, id));
      await db.delete(companyMaintenanceEvents).where(eq(companyMaintenanceEvents.maintenanceId, id));
      // ── Limpiar ledger Finanzas ANTES de borrar el mantenimiento ──────────
      // Borra TODAS las facturas sincronizadas de este mantenimiento
      // (mantenimientos multi-factura). Si no se hace, quedan filas
      // huérfanas en company_invoices apuntando a un id inexistente.
      try {
        await deleteInvoicesForSource({
          tx: db,
          companyId,
          sourceModule: 'mantenimiento',
          sourceEntityId: id,
        });
      } catch (invErr) {
        console.warn('[maintenances] deleteInvoicesForSource falló (no crítico):', (invErr as Error).message);
      }
      await db
        .delete(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)));

      // NUEVO v3.4 — borrar el mantenimiento puede haber sido el único
      // motivo por el que el vehículo seguía "En mantenimiento".
      await syncAssetMaintenanceStatus(existing.assetId, companyId);

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/recalc-total ────────────────────────────────────────────────
//
// jul 2026 v9.1 — Recalcula los `subtotal/iva/total` de CADA item
// del mantenimiento, usando la nueva lib `maintenance-totals.ts`
// (que respeta `discountType`). Esto es para los mantenimientos
// viejos que tienen esos campos mal guardados porque se calcularon
// con la fórmula de monto en vez de porcentaje.
//
// Endpoint temporal. Después de ejecutarlo una vez por cada
// mantenimiento viejo, se puede borrar.
//
// Uso: `POST /api/company/:companyId/maintenances/:id/recalc-total`
//
// Devuelve: `{ ok: true, totalCost, itemsUpdated }`.
//
// Permisos: solo admin/owner (los datos de costos son sensibles).

router.post(
  '/:id/recalc-total',
  requirePermission('mantenimiento', 'execution', 'editar'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);

      // Verificar que el mantenimiento existe.
      const [m] = await db
        .select({ id: companyMaintenanceRecords.id, laborCost: companyMaintenanceRecords.laborCost })
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.id, id),
          eq(companyMaintenanceRecords.companyId, companyId),
        ))
        .limit(1);
      if (!m) throw new NotFoundError('Mantenimiento', String(id));

      // Traer todos los items crudos.
      const items = await db
        .select({
          id:        companyMaintenanceItems.id,
          quantity:  companyMaintenanceItems.quantity,
          unitCost:  companyMaintenanceItems.unitCost,
          discountType:  companyMaintenanceItems.discountType,
          discountValue: companyMaintenanceItems.discountValue,
          ivaPercent:    companyMaintenanceItems.ivaPercent,
        })
        .from(companyMaintenanceItems)
        .where(eq(companyMaintenanceItems.maintenanceId, id));

      // Recalcular cada item con la lib nueva (respeta discountType)
      // y persistir el resultado.
      let itemsUpdated = 0;
      for (const it of items) {
        const totals = computeItemTotals({
          quantity:      it.quantity,
          unitCost:      it.unitCost,
          discountValue: it.discountValue,
          discountType:  it.discountType,
          ivaPercent:    it.ivaPercent,
        });
        await db
          .update(companyMaintenanceItems)
          .set({
            subtotal:  totals.subtotal.toFixed(2),
            ivaAmount: totals.ivaAmount.toFixed(2),
            total:     totals.total.toFixed(2),
          })
          .where(eq(companyMaintenanceItems.id, it.id));
        itemsUpdated++;
      }

      // Recalcular el total del mantenimiento (mano de obra + items).
      const totalCost = await recalcMaintenanceTotal(id, companyId);

      res.json({ ok: true, totalCost, itemsUpdated });
    } catch (err) {
      next(err);
    }
  }
);

function round2(n: number): number { return Math.round(n * 100) / 100; }

export default router;