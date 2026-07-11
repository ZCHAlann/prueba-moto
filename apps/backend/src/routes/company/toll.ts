// routes/company/toll.ts
//
// Endpoints CRUD de peajes. Espejo de `fuel.ts` con los campos propios
// de peajes (tollName, amount, paymentMethod, route, axes).

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyTollEntries, companyAssets, companyDrivers } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId, parseIdFlexible } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';
import { parsePageParams, buildPageResponse } from '../../lib/pagination';
import { notifyEntityCrud } from '../../lib/notify-entity';
import {
  syncSingleInvoice,
  deleteInvoicesForSource,
} from '../../lib/invoices-sync';

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const TOLL_CATEGORIES = ['Urbano', 'Nacional', 'Departamental', 'Municipal', 'Privado'] as const;
const PAYMENT_METHODS = ['Efectivo', 'Tarjeta', 'Transferencia', 'Tag', 'Pase', 'Otro'] as const;

const createTollSchema = z.object({
  assetId:       z.string().min(1, 'El activo es requerido'),
  driverId:      z.string().optional().nullable(),
  date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  tollName:      safeString({ min: 2, max: 200, fieldLabel: 'Nombre del peaje', allowEmpty: false }),
  category:      z.enum(TOLL_CATEGORIES).optional().nullable(),
  amount:        z.number().nonnegative('El monto no puede ser negativo').max(1_000_000_000),
  paymentMethod: z.enum(PAYMENT_METHODS).optional().nullable(),
  route:         safeString({ max: 200, fieldLabel: 'Ruta', allowEmpty: true }).nullable().optional(),
  odometer:      z.number().nonnegative().max(100_000_000).optional().nullable(),
  axes:          z.number().int().min(1).max(12).optional().nullable(),
  notes:         validators.longTextOptional,
  // jul 2026 v4-b — Foto de la factura OBLIGATORIA al registrar peaje.
  photoUrl:      z.string().min(1, 'La foto de la factura es obligatoria').max(2_000_000),
  // jul 2026 v3 — N.° de factura AUTO-generado por backend
  // (next_invoice_number(companyId, 'toll')). El cliente ya NO lo manda.
});

const updateTollSchema = createTollSchema.partial();

// ─── GET /company/:id/toll ────────────────────────────────────────────────────
// Query: ?assetId=asset-1 &driverId=driver-1 &from=YYYY-MM-DD &to=YYYY-MM-DD
//        &page=1 &pageSize=20 &nopage=true
//
// Modos:
//   - default (paginado): devuelve { data, total, page, pageSize, totalPages }.
//   - nopage=true:        devuelve todos los entries SIN paginar (mismo shape
//                         sin page/pageSize). Se usa para los KPIs
//                         `totalAmount` y `monthAmount` del componente.

router.get('/', requireModule('peajes', 'peajes'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { assetId, driverId, from, to, nopage } = req.query;

    // WHERE compartido.
    const conds = [eq(companyTollEntries.companyId, companyId)];
    if (assetId && typeof assetId === 'string') {
      try {
        const parsedAssetId = parseIdFlexible('asset', assetId);
        conds.push(eq(companyTollEntries.assetId, parsedAssetId));
      } catch {
        conds.push(eq(companyTollEntries.id, -1));
      }
    }
    if (driverId && typeof driverId === 'string') {
      try {
        const parsedDriverId = parseIdFlexible('driver', driverId);
        conds.push(eq(companyTollEntries.driverId, parsedDriverId));
      } catch {
        conds.push(eq(companyTollEntries.id, -1));
      }
    }
    if (from && typeof from === 'string') {
      conds.push(gte(companyTollEntries.date, from));
    }
    if (to && typeof to === 'string') {
      conds.push(lte(companyTollEntries.date, to));
    }
    const where = and(...conds);

    // Catálogo auxiliar (no se pagina).
    const assetsRows = await db
      .select({ id: companyAssets.id, plate: companyAssets.plate, brand: companyAssets.brand, model: companyAssets.model })
      .from(companyAssets)
      .where(eq(companyAssets.companyId, companyId));

    const assetMap = new Map(assetsRows.map(a => [a.id, { plate: a.plate, brand: a.brand, model: a.model }]));

    if (nopage === 'true') {
      const rows = await db
        .select()
        .from(companyTollEntries)
        .where(where)
        .orderBy(desc(companyTollEntries.date));
      res.json({
        data: rows.map(t => serializeToll(t, assetMap.get(t.assetId))),
        total: rows.length,
        assets: assetsRows.map(a => ({
          id: toId('asset', a.id),
          plate: a.plate,
          brand: a.brand,
          model: a.model,
        })),
      });
      return;
    }

    const { page, pageSize, offset } = parsePageParams(req.query as Record<string, unknown>);
    const [rows, countRow] = await Promise.all([
      db.select().from(companyTollEntries).where(where)
        .orderBy(desc(companyTollEntries.date)).limit(pageSize).offset(offset),
      db.select({ value: sql<number>`cast(count(*) as int)` }).from(companyTollEntries).where(where),
    ]);
    const total = countRow?.[0]?.value ?? 0;
    res.json({
      ...buildPageResponse(
        rows.map(t => serializeToll(t, assetMap.get(t.assetId))),
        total,
        page,
        pageSize,
      ),
      assets: assetsRows.map(a => ({
        id: toId('asset', a.id),
        plate: a.plate,
        brand: a.brand,
        model: a.model,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/toll/:tollId ────────────────────────────────────────────

router.get('/:tollId', requireModule('peajes', 'peajes'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const tollId = parseId('toll', req.params.tollId);

    const rows = await db
      .select()
      .from(companyTollEntries)
      .where(and(eq(companyTollEntries.id, tollId), eq(companyTollEntries.companyId, companyId)))
      .limit(1);

    if (!rows.length) throw new NotFoundError('Registro de peaje', req.params.tollId);

    const [assetInfo] = await db
      .select({ plate: companyAssets.plate, brand: companyAssets.brand, model: companyAssets.model })
      .from(companyAssets)
      .where(eq(companyAssets.id, rows[0].assetId))
      .limit(1);

    res.json(serializeToll(rows[0], assetInfo ?? null));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/toll ───────────────────────────────────────────────────

router.post(
  '/',
  requireModule('peajes', 'peajes'),
  validate(createTollSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createTollSchema>;

      const assetId = parseIdFlexible('asset', body.assetId);
      const driverId = body.driverId ? parseIdFlexible('driver', body.driverId) : null;

      const [asset] = await db
        .select()
        .from(companyAssets)
        .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
        .limit(1);
      if (!asset) throw new NotFoundError('Activo', body.assetId);

      if (driverId) {
        const [driver] = await db
          .select()
          .from(companyDrivers)
          .where(and(eq(companyDrivers.id, driverId), eq(companyDrivers.companyId, companyId)))
          .limit(1);
        if (!driver) throw new NotFoundError('Conductor', body.driverId!);
      }

      // jul 2026 v3 — Generamos invoice_number per-origen (PEAJ-NNN) por
      // empresa usando la PL/pgSQL `next_invoice_number`. El cliente ya
      // NO manda este campo.
      const genRows = await db.execute(sql`
        SELECT next_invoice_number(${companyId}, 'toll') AS invoice_number
      `) as unknown as { rows: Array<{ invoice_number: string }> };
      const tollInvoiceNumber: string =
        genRows.rows?.[0]?.invoice_number ?? `PEAJ-${String(Date.now()).slice(-6)}`;

      const [created] = await db
        .insert(companyTollEntries)
        .values({
          companyId,
          assetId,
          driverId: driverId ?? null,
          date:          body.date,
          tollName:      body.tollName,
          category:      body.category ?? null,
          amount:        String(body.amount),
          paymentMethod: body.paymentMethod ?? null,
          route:         body.route ?? null,
          odometer:      body.odometer !== undefined && body.odometer !== null ? String(body.odometer) : null,
          axes:          body.axes ?? null,
          notes:         body.notes ?? null,
          photoUrl:      body.photoUrl ?? null,
          invoiceNumber: tollInvoiceNumber,
        })
        .returning();

      // ── Sincronizar ledger Finanzas ──────────────────────────────────────────
      // Si el operador digitó un invoiceNumber, lo espejamos en
      // company_invoices. Si está vacío/null, syncSingleInvoice lo borra
      // del ledger (no-op si nunca hubo fila).
      try {
        await syncSingleInvoice({
          tx: db,
          companyId,
          sourceModule: 'peajes',
          sourceEntityId: created.id,
          data: {
            invoiceNumber: created.invoiceNumber ?? '',
            invoiceDate: created.date,
            amount: created.amount,
            supplierName: created.tollName ?? null,
            fileUrl: created.photoUrl ?? null,
            fileMimeType: created.photoUrl ? 'image/jpeg' : null,
            kind: 'peaje',
          },
        });
      } catch (invErr) {
        console.warn('[toll] syncSingleInvoice falló (no crítico):', (invErr as Error).message);
      }

      await logAudit(db, companyId, {
        entity: 'toll',
        entityId: toId('toll', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Peaje "${body.tollName}" registrado por ${body.amount} para "${asset.plate}".`,
      });

      try {
        await notifyEntityCrud({
          companyId, actorSub: req.user!.sub, actorName: req.user!.name,
          crudKind: 'entity_created', entityKey: 'Peaje',
          entityId: created.id, entityLabel: `${body.tollName} (${asset.plate})`,
        });
      } catch (err) {
        console.warn('[toll] notify falló (no crítico):', (err as Error).message);
      }

      res.status(201).json(serializeToll(created, { plate: asset.plate, brand: asset.brand, model: asset.model }));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/toll/:tollId ────────────────────────────────────────────

router.put(
  '/:tollId',
  requireModule('peajes', 'peajes'),
  requireAdmin,
  validate(updateTollSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const tollId = parseId('toll', req.params.tollId);
      const body = req.body as z.infer<typeof updateTollSchema>;

      const [existing] = await db
        .select()
        .from(companyTollEntries)
        .where(and(eq(companyTollEntries.id, tollId), eq(companyTollEntries.companyId, companyId)))
        .limit(1);

      if (!existing) throw new NotFoundError('Registro de peaje', req.params.tollId);

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.assetId !== undefined) updateData.assetId = parseIdFlexible('asset', body.assetId!);
      if (body.driverId !== undefined) updateData.driverId = body.driverId ? parseIdFlexible('driver', body.driverId) : null;
      if (body.date          !== undefined) updateData.date = body.date;
      if (body.tollName      !== undefined) updateData.tollName = body.tollName;
      if (body.category      !== undefined) updateData.category = body.category;
      if (body.amount        !== undefined) updateData.amount = String(body.amount);
      if (body.paymentMethod !== undefined) updateData.paymentMethod = body.paymentMethod;
      if (body.route         !== undefined) updateData.route = body.route;
      if (body.odometer      !== undefined) updateData.odometer = body.odometer !== null ? String(body.odometer) : null;
      if (body.axes          !== undefined) updateData.axes = body.axes;
      if (body.notes         !== undefined) updateData.notes = body.notes;
      if (body.photoUrl      !== undefined) updateData.photoUrl = body.photoUrl;
      // invoiceNumber: aceptamos null explícito (quiere decir "limpia") o
      // string con valor nuevo. Si no viene en el body, NO tocamos la
      // columna (preservamos el valor anterior en la fila fuente).
      if (body.invoiceNumber !== undefined) updateData.invoiceNumber = body.invoiceNumber ?? null;

      const [updated] = await db
        .update(companyTollEntries)
        .set(updateData)
        .where(and(eq(companyTollEntries.id, tollId), eq(companyTollEntries.companyId, companyId)))
        .returning();

      // ── Sincronizar ledger Finanzas tras la edición ──────────────────────────
      // Pasamos SIEMPRE (incluso si no vino invoiceNumber en el body) porque
      // syncSingleInvoice hace UPSERT idempotente: si la fila ya está al
      // día, no toca nada. Si el operador limpió el invoiceNumber (mandó
      // null explícito), syncSingleInvoice lo borra del ledger.
      try {
        await syncSingleInvoice({
          tx: db,
          companyId,
          sourceModule: 'peajes',
          sourceEntityId: updated.id,
          data: {
            invoiceNumber: updated.invoiceNumber ?? '',
            invoiceDate: updated.date,
            amount: updated.amount,
            supplierName: updated.tollName ?? null,
            fileUrl: updated.photoUrl ?? null,
            fileMimeType: updated.photoUrl ? 'image/jpeg' : null,
            kind: 'peaje',
          },
        });
      } catch (invErr) {
        console.warn('[toll] syncSingleInvoice falló en PUT (no crítico):', (invErr as Error).message);
      }

      await logAudit(db, companyId, {
        entity: 'toll',
        entityId: toId('toll', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Registro de peaje "${toId('toll', updated.id)}" actualizado.`,
      });

      try {
        await notifyEntityCrud({
          companyId, actorSub: req.user!.sub, actorName: req.user!.name,
          crudKind: 'entity_updated', entityKey: 'Peaje',
          entityId: updated.id, entityLabel: `Peaje #${updated.id}`,
        });
      } catch (err) {
        console.warn('[toll] notify falló (no crítico):', (err as Error).message);
      }

      const [assetInfo] = await db
        .select({ plate: companyAssets.plate, brand: companyAssets.brand, model: companyAssets.model })
        .from(companyAssets)
        .where(eq(companyAssets.id, updated.assetId))
        .limit(1);

      res.json(serializeToll(updated, assetInfo ?? null));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/toll/:tollId ─────────────────────────────────────────

router.delete(
  '/:tollId',
  requireModule('peajes', 'peajes'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const tollId = parseId('toll', req.params.tollId);

      const [existing] = await db
        .select()
        .from(companyTollEntries)
        .where(and(eq(companyTollEntries.id, tollId), eq(companyTollEntries.companyId, companyId)))
        .limit(1);

      if (!existing) throw new NotFoundError('Registro de peaje', req.params.tollId);

      await db
        .delete(companyTollEntries)
        .where(and(eq(companyTollEntries.id, tollId), eq(companyTollEntries.companyId, companyId)));

      // ── Limpiar ledger Finanzas ──────────────────────────────────────────────
      // Si este toll entry tenía factura sincronizada, la borramos del
      // ledger para evitar huérfanas. No-op si nunca tuvo.
      try {
        await deleteInvoicesForSource({
          tx: db,
          companyId,
          sourceModule: 'peajes',
          sourceEntityId: tollId,
        });
      } catch (invErr) {
        console.warn('[toll] deleteInvoicesForSource falló (no crítico):', (invErr as Error).message);
      }

      await logAudit(db, companyId, {
        entity: 'toll',
        entityId: toId('toll', tollId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Registro de peaje eliminado.`,
      });

      try {
        await notifyEntityCrud({
          companyId, actorSub: req.user!.sub, actorName: req.user!.name,
          crudKind: 'entity_deleted', entityKey: 'Peaje',
          entityId: existing.id, entityLabel: `Peaje #${existing.id}`,
        });
      } catch (err) {
        console.warn('[toll] notify falló (no crítico):', (err as Error).message);
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeToll(
  t: typeof companyTollEntries.$inferSelect,
  assetInfo?: { plate: string | null; brand: string | null; model: string | null } | null
) {
  return {
    id:            toId('toll', t.id),
    companyId:     toId('company', t.companyId),
    assetId:       toId('asset', t.assetId),
    driverId:      t.driverId ? toId('driver', t.driverId) : null,
    date:          t.date,
    tollName:      t.tollName,
    category:      t.category,
    amount:        Number(t.amount),
    paymentMethod: t.paymentMethod,
    route:         t.route,
    odometer:      t.odometer !== null ? Number(t.odometer) : null,
    axes:          t.axes,
    notes:         t.notes,
    photoUrl:      t.photoUrl,
    invoiceNumber: t.invoiceNumber ?? null, // NUEVO — espejo del ledger Finanzas
    // Enrichment: datos del activo para display sin hooks externos
    assetPlate: assetInfo?.plate ?? null,
    assetBrand: assetInfo?.brand ?? null,
    assetModel: assetInfo?.model ?? null,
    createdAt:   t.createdAt,
    updatedAt:   t.updatedAt,
  };
}

export default router;
