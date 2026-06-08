import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyInventory } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { requireSupervisor } from '../../middlewares/requireSupervisor';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createInventorySchema = z.object({
  code: z.string().min(1, 'El código es requerido'),
  name: z.string().min(1, 'El nombre es requerido'),
  category: z.string().optional().nullable(),
  stock: z.number().nonnegative().optional().nullable(),
  minStock: z.number().nonnegative().optional().nullable(),
  location: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateInventorySchema = createInventorySchema.partial();

// ─── GET /company/:id/inventory ───────────────────────────────────────────────
// Query: ?category=Filtros &lowStock=true &search=filtro

router.get('/', requireModule('mantenimiento', 'inventario'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { category, lowStock, search } = req.query;

    let rows = await db
      .select()
      .from(companyInventory)
      .where(eq(companyInventory.companyId, companyId))
      .orderBy(companyInventory.name);

    if (category && typeof category === 'string') {
      rows = rows.filter((i) => i.category === category);
    }

    // lowStock=true → items donde stock <= minStock
    if (lowStock === 'true') {
      rows = rows.filter((i) => {
        const stock = i.stock !== null ? Number(i.stock) : null;
        const min = i.minStock !== null ? Number(i.minStock) : null;
        if (stock === null || min === null) return false;
        return stock <= min;
      });
    }

    if (search && typeof search === 'string') {
      const q = search.toLowerCase();
      rows = rows.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q) ||
          i.category?.toLowerCase().includes(q)
      );
    }

    res.json({ data: rows.map(serializeItem), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/inventory ──────────────────────────────────────────────

router.post(
  '/',
  requireModule('mantenimiento', 'inventario'),
  requireSupervisor,
  validate(createInventorySchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createInventorySchema>;

      const [created] = await db
        .insert(companyInventory)
        .values({
          ...body,
          companyId,
          stock: body.stock !== undefined && body.stock !== null ? String(body.stock) : undefined,
          minStock: body.minStock !== undefined && body.minStock !== null ? String(body.minStock) : undefined,
        })
        .returning();

      await logAudit(db, companyId, {
        entity: 'inventory',
        entityId: toId('inventory', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Ítem de inventario "${created.name}" creado.`,
      });

      res.status(201).json(serializeItem(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/inventory/:itemId ───────────────────────────────────────

router.put(
  '/:itemId',
  requireModule('mantenimiento', 'inventario'),
  requireSupervisor,
  validate(updateInventorySchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const itemId = parseId('inventory', req.params.itemId);
      const body = req.body as z.infer<typeof updateInventorySchema>;

      const existing = await db
        .select()
        .from(companyInventory)
        .where(and(eq(companyInventory.id, itemId), eq(companyInventory.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Ítem de inventario', req.params.itemId);

      const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() };
      if (body.stock !== undefined) updateData.stock = body.stock !== null ? String(body.stock) : null;
      if (body.minStock !== undefined) updateData.minStock = body.minStock !== null ? String(body.minStock) : null;

      const [updated] = await db
        .update(companyInventory)
        .set(updateData)
        .where(and(eq(companyInventory.id, itemId), eq(companyInventory.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity: 'inventory',
        entityId: toId('inventory', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Ítem de inventario "${updated.name}" actualizado.`,
      });

      res.json(serializeItem(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/inventory/:itemId ────────────────────────────────────

router.delete(
  '/:itemId',
  requireModule('mantenimiento', 'inventario'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const itemId = parseId('inventory', req.params.itemId);

      const existing = await db
        .select()
        .from(companyInventory)
        .where(and(eq(companyInventory.id, itemId), eq(companyInventory.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Ítem de inventario', req.params.itemId);

      await db
        .delete(companyInventory)
        .where(and(eq(companyInventory.id, itemId), eq(companyInventory.companyId, companyId)));

      await logAudit(db, companyId, {
        entity: 'inventory',
        entityId: toId('inventory', itemId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Ítem de inventario "${existing[0].name}" eliminado.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeItem(i: typeof companyInventory.$inferSelect) {
  const stock = i.stock !== null ? Number(i.stock) : null;
  const minStock = i.minStock !== null ? Number(i.minStock) : null;

  return {
    id: toId('inventory', i.id),
    companyId: toId('company', i.companyId),
    code: i.code,
    name: i.name,
    category: i.category,
    stock,
    minStock,
    isLowStock: stock !== null && minStock !== null ? stock <= minStock : false,
    location: i.location,
    unit: i.unit,
    notes: i.notes,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  };
}

export default router;