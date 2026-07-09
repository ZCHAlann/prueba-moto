// ============================================================================
// routes/company/finance-invoice-types.ts
// ============================================================================
// CRUD de los tipos de comprobante configurables por empresa (CxP).
//
// Endpoints:
//
//   GET  /company/:id/finance-invoice-types
//     Lista los tipos de la empresa. Si la tabla está VACÍA para la empresa,
//     siembra los 6 defaults del sistema (LIBRE / COMBUSTIBLE / PEAJE /
//     REPUESTO / MANO DE OBRA / LAVADA) de forma idempotente y devuelve la
//     lista.
//     Permiso: finanzas.facturas.ver
//
//   POST /company/:id/finance-invoice-types
//     Crea un tipo nuevo. Body: { name: string }.
//     Permiso: finanzas.facturas.editar  +  requireAdmin (solo admin crea).
//     409 si ya existe un tipo con ese name en la empresa.
//
//   DELETE /company/:id/finance-invoice-types/:typeId
//     Si hay FACTURAS que referencian este tipo → 409 + mensaje claro
//     (recomienda marcar como inactivo en lugar de borrar).
//     Si NO hay facturas → DELETE físico de la fila.
//     Si el tipo es del sistema (is_system = true) → 403, no se puede borrar.
//     Permiso: finanzas.facturas.eliminar  +  requireAdmin.
//
// NOTA:
//   El listado NO expone un endpoint PATCH para mantener la API minimal —
//   los tipos son catálogos pequeños (≤10 por empresa típica). Si el admin
//   quiere "renombrar" un tipo, lo borra y crea uno nuevo. Si quiere
//   "desactivarlo", puede hacerlo via DELETE (que devuelve 409 si tiene
//   facturas) — en el futuro podríamos agregar un PATCH /:id { isActive }
//   si el cliente lo pide.
// ============================================================================

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyInvoiceTypes, companyInvoices } from '../../db/schema/operational';
import { requirePermission } from '../../middlewares/requirePermission';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { validate } from '../../lib/validate';
import { AppError, NotFoundError } from '../../lib/errors';
import { safeString } from '../../lib/validators';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { seedIfEmpty } from '../../lib/finance-seed';

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createTypeSchema = z.object({
  name: safeString({ min: 2, max: 80, fieldLabel: 'Nombre', allowEmpty: false }),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function ensureCompanyId(value: number | undefined): number {
  if (value == null) throw new AppError(403, 'companyId ausente en sesión');
  return value;
}

function serializeType(t: typeof companyInvoiceTypes.$inferSelect) {
  return {
    id:        toId('invoice-type', t.id),
    companyId: toId('company', t.companyId),
    name:      t.name,
    isSystem:  t.isSystem,
    isActive:  t.isActive,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

// ─── GET /company/:id/finance-invoice-types ──────────────────────────────────
//
// Lista tipos de la empresa. Si está vacío para esta empresa, siembra los
// 4 defaults de forma idempotente antes de devolver.

router.get(
  '/',
  requirePermission('finanzas', 'facturas', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);

      // Lazy seed: si la empresa todavía no tiene ningún tipo, sembramos
      // los 4 defaults. Es idempotente — si por algún motivo otro request
      // sembró en paralelo, el segundo insert es no-op.
      await seedIfEmpty(db, companyId);

      const rows = await db
        .select()
        .from(companyInvoiceTypes)
        .where(eq(companyInvoiceTypes.companyId, companyId))
        .orderBy(desc(companyInvoiceTypes.isSystem), companyInvoiceTypes.name);

      res.json({
        total: rows.length,
        rows: rows.map(serializeType),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /company/:id/finance-invoice-types ─────────────────────────────────

router.post(
  '/',
  requirePermission('finanzas', 'facturas', 'editar'),
  requireAdmin,
  validate(createTypeSchema),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const body = req.body as z.infer<typeof createTypeSchema>;

      // Insert con ON CONFLICT DO NOTHING para evitar 500 si dos requests
      // compiten por el mismo name. Si conflict, buscamos el existente
      // y devolvemos 409 con su id para que el frontend pueda
      // navegar al tipo ya creado.
      const inserted = await db
        .insert(companyInvoiceTypes)
        .values({ companyId, name: body.name, isSystem: false, isActive: true })
        .onConflictDoNothing({
          target: [companyInvoiceTypes.companyId, companyInvoiceTypes.name],
        })
        .returning();

      if (inserted.length === 0) {
        // Ya existía — devolvemos 409 con el id del existente.
        const [existing] = await db
          .select()
          .from(companyInvoiceTypes)
          .where(and(
            eq(companyInvoiceTypes.companyId, companyId),
            eq(companyInvoiceTypes.name, body.name),
          ))
          .limit(1);
        throw new AppError(
          409,
          `Ya existe un tipo "${body.name}" para esta empresa.`,
        );
      }

      await logAudit(db, companyId, {
        entity: 'finance-invoice-type',
        entityId: toId('invoice-type', inserted[0].id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Tipo de comprobante "${inserted[0].name}" creado.`,
      });

      res.status(201).json(serializeType(inserted[0]));
    } catch (err) {
      next(err);
    }
  },
);

// ─── PATCH /company/:id/finance-invoice-types/:typeId ───────────────────────
//
// jul 2026 — Edita `name` o `isActive` de un tipo de comprobante.
//
// Reglas:
//   - Tipos del sistema (is_system=true): SOLO se puede cambiar `isActive`
//     (desactivar). NO se puede borrar, NO se puede renombrar (mantiene la
//     coherencia: el sync automático setea esos nombres literales).
//   - Tipos custom: se puede editar `name` y `isActive`.
//
// Body: { name?: string, isActive?: boolean }
// Permiso: finanzas.facturas.editar
//
// Devuelve el tipo actualizado.

const patchTypeSchema = z.object({
  name:     safeString({ min: 2, max: 80, fieldLabel: 'Nombre', allowEmpty: false }).optional(),
  isActive: z.boolean().optional(),
});

router.patch(
  '/:typeId',
  requirePermission('finanzas', 'facturas', 'editar'),
  validate(patchTypeSchema),
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const typeId = parseId('invoice-type', String(req.params.typeId));
      const body = req.body as z.infer<typeof patchTypeSchema>;

      const [existing] = await db
        .select()
        .from(companyInvoiceTypes)
        .where(and(
          eq(companyInvoiceTypes.id, typeId),
          eq(companyInvoiceTypes.companyId, companyId),
        ))
        .limit(1);
      if (!existing) throw new NotFoundError('Tipo de comprobante', String(req.params.typeId));

      // Si el tipo es del sistema y se quiere renombrar, rechazar.
      if (existing.isSystem && body.name !== undefined && body.name !== existing.name) {
        throw new AppError(
          403,
          `El tipo "${existing.name}" es del sistema y no se puede renombrar. ` +
          `Si querés otro nombre, desactivá este con PATCH { isActive: false } ` +
          `y creá uno nuevo con POST.`,
        );
      }

      // Si se pasa isActive:false sobre tipo del sistema y ya estaba
      // desactivado, no hacer nada. Si se reactiva, validar permisos extra
      // (requireAdmin implícito por la acción).
      const updates: Partial<typeof companyInvoiceTypes.$inferInsert> = {};
      if (body.name !== undefined && !existing.isSystem) {
        updates.name = body.name;
      }
      if (body.isActive !== undefined && body.isActive !== existing.isActive) {
        updates.isActive = body.isActive;
      }

      if (Object.keys(updates).length === 0) {
        return res.json(serializeType(existing));
      }

      const [updated] = await db
        .update(companyInvoiceTypes)
        .set({ ...updates, updatedAt: sql`now()` })
        .where(and(
          eq(companyInvoiceTypes.id, typeId),
          eq(companyInvoiceTypes.companyId, companyId),
        ))
        .returning();

      await logAudit(db, companyId, {
        entity: 'finance-invoice-type',
        entityId: toId('invoice-type', typeId),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description:
          `Tipo de comprobante "${updated.name}" actualizado. ` +
          `campos=${Object.keys(updates).filter((k) => k !== 'updatedAt').join(',')}`,
      });

      res.json(serializeType(updated));
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /company/:id/finance-invoice-types/:typeId ──────────────────────
//
// Reglas:
//   - is_system = true → 403 (no se pueden borrar los sembrados). Si querés
//     dejarlo fuera del dropdown, usa PATCH { isActive: false }.
//   - Hay facturas que lo referencian (invoice_type_id = typeId) → 409.
//   - Si no, DELETE físico y audit log.

router.delete(
  '/:typeId',
  requirePermission('finanzas', 'facturas', 'eliminar'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = ensureCompanyId(req.companyId);
      const typeId = parseId('invoice-type', String(req.params.typeId));

      const [existing] = await db
        .select()
        .from(companyInvoiceTypes)
        .where(and(
          eq(companyInvoiceTypes.id, typeId),
          eq(companyInvoiceTypes.companyId, companyId),
        ))
        .limit(1);

      if (!existing) throw new NotFoundError('Tipo de comprobante', String(req.params.typeId));

      if (existing.isSystem) {
        throw new AppError(
          403,
          `El tipo "${existing.name}" es del sistema y no puede eliminarse. ` +
          `Si querés sacarlo del dropdown de filtros, hacé PATCH /finance-invoice-types/${typeId} ` +
          `con { isActive: false } en su lugar.`,
        );
      }

      // ¿Hay facturas que lo referencian?
      const [countRow] = await db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(companyInvoices)
        .where(and(
          eq(companyInvoices.companyId, companyId),
          eq(companyInvoices.invoiceTypeId, typeId),
        ));
      const refCount = Number(countRow?.value ?? 0);

      if (refCount > 0) {
        throw new AppError(
          409,
          `No se puede eliminar "${existing.name}" porque ${refCount} ` +
          `factura${refCount !== 1 ? 's' : ''} lo referencia${refCount !== 1 ? 'n' : ''}. ` +
          `Reasigna las facturas a otro tipo antes de eliminar.`,
        );
      }

      await db
        .delete(companyInvoiceTypes)
        .where(and(
          eq(companyInvoiceTypes.id, typeId),
          eq(companyInvoiceTypes.companyId, companyId),
        ));

      await logAudit(db, companyId, {
        entity: 'finance-invoice-type',
        entityId: toId('invoice-type', typeId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Tipo de comprobante "${existing.name}" eliminado.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;