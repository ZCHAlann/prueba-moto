import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyChecklists, companyChecklistCategories } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CHECKLIST_STATUSES = ['Aprobado', 'Observado', 'Pendiente', 'Rechazado'] as const;

// Categorías
const createCategorySchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().optional().nullable(),
  items: z.array(z.string()).default([]),
});

const updateCategorySchema = createCategorySchema.partial();

// Checklists
const checklistItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  checked: z.boolean().default(false),
  observation: z.string().optional().nullable(),
});

const createChecklistSchema = z.object({
  categoryId: z.string().optional().nullable(),
  assetId: z.string().optional().nullable(),
  driverId: z.string().optional().nullable(),
  targetKind: z.string().optional().nullable(),
  targetLabel: z.string().optional().nullable(),
  date: z.string().min(1, 'La fecha es requerida'),
  status: z.enum(CHECKLIST_STATUSES).default('Pendiente'),
  summary: z.string().optional().nullable(),
  findings: z.string().optional().nullable(),
  items: z.array(checklistItemSchema).default([]),
  photoUrls: z.array(z.string()).default([]),
});

const updateChecklistSchema = createChecklistSchema.partial();

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORÍAS
// ══════════════════════════════════════════════════════════════════════════════

// ─── GET /company/:id/checklist-categories ────────────────────────────────────

router.get('/checklist-categories', requireModule('checklist'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const rows = await db
      .select()
      .from(companyChecklistCategories)
      .where(eq(companyChecklistCategories.companyId, companyId))
      .orderBy(companyChecklistCategories.name);

    res.json({ data: rows.map(serializeCategory), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/checklist-categories ───────────────────────────────────

router.post(
  '/checklist-categories',
  requireModule('checklist'),
  requireAdmin,
  validate(createCategorySchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createCategorySchema>;

      const [created] = await db
        .insert(companyChecklistCategories)
        .values({ ...body, companyId })
        .returning();

      await logAudit(db, companyId, {
        entity: 'checklist_categories',
        entityId: toId('checklist-category', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Categoría de checklist "${created.name}" creada.`,
      });

      res.status(201).json(serializeCategory(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/checklist-categories/:catId ─────────────────────────────

router.put(
  '/checklist-categories/:catId',
  requireModule('checklist'),
  requireAdmin,
  validate(updateCategorySchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const catId = parseId('checklist-category', req.params.catId);
      const body = req.body as z.infer<typeof updateCategorySchema>;

      const existing = await db
        .select()
        .from(companyChecklistCategories)
        .where(
          and(
            eq(companyChecklistCategories.id, catId),
            eq(companyChecklistCategories.companyId, companyId)
          )
        )
        .limit(1);

      if (!existing.length) throw new NotFoundError('Categoría', req.params.catId);

      const [updated] = await db
        .update(companyChecklistCategories)
        .set({ ...body, updatedAt: new Date() })
        .where(
          and(
            eq(companyChecklistCategories.id, catId),
            eq(companyChecklistCategories.companyId, companyId)
          )
        )
        .returning();

      await logAudit(db, companyId, {
        entity: 'checklist_categories',
        entityId: toId('checklist-category', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Categoría de checklist "${updated.name}" actualizada.`,
      });

      res.json(serializeCategory(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/checklist-categories/:catId ─────────────────────────

router.delete(
  '/checklist-categories/:catId',
  requireModule('checklist'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const catId = parseId('checklist-category', req.params.catId);

      const existing = await db
        .select()
        .from(companyChecklistCategories)
        .where(
          and(
            eq(companyChecklistCategories.id, catId),
            eq(companyChecklistCategories.companyId, companyId)
          )
        )
        .limit(1);

      if (!existing.length) throw new NotFoundError('Categoría', req.params.catId);

      await db
        .delete(companyChecklistCategories)
        .where(
          and(
            eq(companyChecklistCategories.id, catId),
            eq(companyChecklistCategories.companyId, companyId)
          )
        );

      await logAudit(db, companyId, {
        entity: 'checklist_categories',
        entityId: toId('checklist-category', catId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Categoría de checklist "${existing[0].name}" eliminada.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// CHECKLISTS
// ══════════════════════════════════════════════════════════════════════════════

// ─── GET /company/:id/checklists ──────────────────────────────────────────────
// Query: ?status=Aprobado &assetId=asset-1 &driverId=driver-1 &categoryId=checklist-category-1

router.get('/checklists', requireModule('checklist'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { status, assetId, driverId, categoryId } = req.query;

    let rows = await db
      .select()
      .from(companyChecklists)
      .where(eq(companyChecklists.companyId, companyId))
      .orderBy(companyChecklists.date);

    if (status && typeof status === 'string') {
      rows = rows.filter((c) => c.status === status);
    }
    if (assetId && typeof assetId === 'string') {
      const id = parseId('asset', assetId);
      rows = rows.filter((c) => c.assetId === id);
    }
    if (driverId && typeof driverId === 'string') {
      const id = parseId('driver', driverId);
      rows = rows.filter((c) => c.driverId === id);
    }
    if (categoryId && typeof categoryId === 'string') {
      const id = parseId('checklist-category', categoryId);
      rows = rows.filter((c) => c.categoryId === id);
    }

    res.json({ data: rows.map(serializeChecklist), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/checklists/:checkId ─────────────────────────────────────

router.get('/checklists/:checkId', requireModule('checklist'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const checkId = parseId('checklist', req.params.checkId);

    const rows = await db
      .select()
      .from(companyChecklists)
      .where(
        and(eq(companyChecklists.id, checkId), eq(companyChecklists.companyId, companyId))
      )
      .limit(1);

    if (!rows.length) throw new NotFoundError('Checklist', req.params.checkId);

    res.json(serializeChecklist(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/checklists ─────────────────────────────────────────────
// Sin requireAdmin ni requireSupervisor — cualquier usuario autenticado con módulo puede crear

router.post(
  '/checklists',
  requireModule('checklist'),
  validate(createChecklistSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createChecklistSchema>;

      const categoryId = body.categoryId ? parseId('checklist-category', body.categoryId) : null;
      const assetId = body.assetId ? parseId('asset', body.assetId) : null;
      const driverId = body.driverId ? parseId('driver', body.driverId) : null;
      const inspectorId = Number(req.user!.sub.replace(/\D/g, '')) || null;

      const [created] = await db
        .insert(companyChecklists)
        .values({
          ...body,
          companyId,
          categoryId: categoryId ?? undefined,
          assetId: assetId ?? undefined,
          driverId: driverId ?? undefined,
          inspectorId: inspectorId ?? undefined,
        })
        .returning();

      await logAudit(db, companyId, {
        entity: 'checklists',
        entityId: toId('checklist', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Checklist creado (${created.status})${body.targetLabel ? ` para "${body.targetLabel}"` : ''}.`,
      });

      res.status(201).json(serializeChecklist(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/checklists/:checkId ─────────────────────────────────────

router.put(
  '/checklists/:checkId',
  requireModule('checklist'),
  validate(updateChecklistSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const checkId = parseId('checklist', req.params.checkId);
      const body = req.body as z.infer<typeof updateChecklistSchema>;

      const existing = await db
        .select()
        .from(companyChecklists)
        .where(
          and(eq(companyChecklists.id, checkId), eq(companyChecklists.companyId, companyId))
        )
        .limit(1);

      if (!existing.length) throw new NotFoundError('Checklist', req.params.checkId);

      const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() };
      if (body.categoryId !== undefined) updateData.categoryId = body.categoryId ? parseId('checklist-category', body.categoryId) : null;
      if (body.assetId !== undefined) updateData.assetId = body.assetId ? parseId('asset', body.assetId) : null;
      if (body.driverId !== undefined) updateData.driverId = body.driverId ? parseId('driver', body.driverId) : null;

      const [updated] = await db
        .update(companyChecklists)
        .set(updateData)
        .where(
          and(eq(companyChecklists.id, checkId), eq(companyChecklists.companyId, companyId))
        )
        .returning();

      await logAudit(db, companyId, {
        entity: 'checklists',
        entityId: toId('checklist', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Checklist "${toId('checklist', updated.id)}" actualizado a "${updated.status}".`,
      });

      res.json(serializeChecklist(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializers ──────────────────────────────────────────────────────────────

function serializeCategory(c: typeof companyChecklistCategories.$inferSelect) {
  return {
    id: toId('checklist-category', c.id),
    companyId: toId('company', c.companyId),
    name: c.name,
    description: c.description,
    items: c.items ?? [],
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function serializeChecklist(c: typeof companyChecklists.$inferSelect) {
  return {
    id: toId('checklist', c.id),
    companyId: toId('company', c.companyId),
    categoryId: c.categoryId ? toId('checklist-category', c.categoryId) : null,
    assetId: c.assetId ? toId('asset', c.assetId) : null,
    driverId: c.driverId ? toId('driver', c.driverId) : null,
    inspectorId: c.inspectorId ? toId('company-user', c.inspectorId) : null,
    targetKind: c.targetKind,
    targetLabel: c.targetLabel,
    date: c.date,
    status: c.status,
    summary: c.summary,
    findings: c.findings,
    items: c.items ?? [],
    photoUrls: c.photoUrls ?? [],
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export default router;