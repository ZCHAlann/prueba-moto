import { Router } from 'express';
import { z } from 'zod';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyChecklists, companyChecklistCategories, companyAssets, companyDrivers } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';
import { wsBroadcast } from '../../services/websocket';

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CHECKLIST_STATUSES = ['Aprobado', 'Observado', 'Pendiente', 'Rechazado'] as const;
const CHECKLIST_TARGET_KINDS = ['Vehiculo', 'Generador', 'Motor', 'AireAcondicionado', 'Otro'] as const;
const CHECKLIST_HAS_ITEM = ['SI', 'NO'] as const;
const CHECKLIST_CONDITION = ['Bueno', 'Regular', 'Malo'] as const;

// Categorías
const createCategorySchema = z.object({
  name: safeString({ min: 2, max: 120, fieldLabel: 'Nombre', allowEmpty: false }),
  description: safeString({ max: 500, fieldLabel: 'Descripción', allowEmpty: true }).nullable().optional(),
  items: z.array(safeString({ min: 1, max: 120, fieldLabel: 'Item', allowEmpty: false })).max(100).default([]),
});

const updateCategorySchema = createCategorySchema.partial();

// Checklists — forma de cada item inspeccionado
const checklistItemSchema = z.object({
  itemName:    safeString({ min: 1, max: 200, fieldLabel: 'Punto', allowEmpty: false }),
  hasItem:     z.enum(CHECKLIST_HAS_ITEM),
  condition:   z.enum(CHECKLIST_CONDITION).optional().nullable(),
  comment:     validators.longTextOptional,
  photoUrl:    z.string().max(2_000_000).optional().nullable(),
});

const createChecklistSchema = z.object({
  categoryId: z.string().optional().nullable(),
  assetId:    z.string().optional().nullable(),
  driverId:   z.string().optional().nullable(),
  targetKind: z.enum(CHECKLIST_TARGET_KINDS).optional().nullable(),
  targetLabel: z.string().optional().nullable(),
  date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  status:     z.enum(CHECKLIST_STATUSES).default('Pendiente'),
  summary:    validators.longTextOptional,
  findings:   validators.longTextOptional,
  items:      z.array(checklistItemSchema).max(200).default([]),
  photoUrls:  z.array(z.string().max(2_000_000)).max(20).default([]),
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
// Reemplaza SOLO el handler del GET '/' en checklists.ts
// El problema: `const rows` no se puede reasignar con los filtros de status/assetId/etc.
// La solución: usar `let rows` y SQL crudo puro, sin el whereParts muerto.

router.get('/', requireModule('checklist'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { status, assetId, driverId, categoryId, date, from, to } = req.query;

    // ── SQL crudo para evitar el bug de drizzle-orm con jsonb/array nullable ──
    const whereSql: ReturnType<typeof sql>[] = [sql`company_id = ${companyId}`];

    if (typeof date === 'string') {
      whereSql.push(sql`date = ${date}`);
    } else {
      if (typeof from === 'string') whereSql.push(sql`date >= ${from}`);
      if (typeof to   === 'string') whereSql.push(sql`date <= ${to}`);
    }

    const rawRows = await db.execute<{
      id: number; company_id: number; category_id: number | null;
      asset_id: number | null; driver_id: number | null; inspector_id: number | null;
      target_kind: string; target_label: string; date: string; status: string;
      summary: string | null; findings: string | null;
      items: unknown[] | null; photo_urls: string[] | null;
      created_at: string; updated_at: string;
    }>(sql`
      SELECT id, company_id, category_id, asset_id, driver_id, inspector_id,
             target_kind, target_label, date, status, summary, findings,
             COALESCE(items, '[]'::jsonb)        AS items,
             COALESCE(photo_urls, ARRAY[]::text[]) AS photo_urls,
             created_at, updated_at
        FROM company_checklists
       WHERE ${sql.join(whereSql, sql` AND `)}
       ORDER BY date DESC
    `);

    // Drizzle puede devolver el resultado directo o en .rows según el driver
    let rows = (Array.isArray(rawRows) ? rawRows : (rawRows as any).rows ?? []) as Array<{
      id: number; company_id: number; category_id: number | null;
      asset_id: number | null; driver_id: number | null; inspector_id: number | null;
      target_kind: string; target_label: string; date: string; status: string;
      summary: string | null; findings: string | null;
      items: unknown[] | null; photo_urls: string[] | null;
      created_at: string; updated_at: string;
    }>;

    // ── Filtros en memoria (después de la query) ───────────────────────────────
    if (typeof status     === 'string') rows = rows.filter((c) => c.status      === status);
    if (typeof assetId    === 'string') rows = rows.filter((c) => c.asset_id    === parseInt(assetId, 10));
    if (typeof driverId   === 'string') rows = rows.filter((c) => c.driver_id   === parseInt(driverId, 10));
    if (typeof categoryId === 'string') rows = rows.filter((c) => c.category_id === parseInt(categoryId, 10));

    // ── Enrichment: batch-load nombres ────────────────────────────────────────
    const [assetsRows, driversRows, categoriesRows] = await Promise.all([
      db.select({ id: companyAssets.id, name: companyAssets.name })
        .from(companyAssets)
        .where(eq(companyAssets.companyId, companyId)),
      db.select({ id: companyDrivers.id, firstName: companyDrivers.firstName, lastName: companyDrivers.lastName })
        .from(companyDrivers)
        .where(eq(companyDrivers.companyId, companyId)),
      db.select({ id: companyChecklistCategories.id, name: companyChecklistCategories.name })
        .from(companyChecklistCategories)
        .where(eq(companyChecklistCategories.companyId, companyId)),
    ]);

    const assetMap    = new Map(assetsRows.map((a) => [a.id, a.name]));
    const driverMap   = new Map(driversRows.map((d) => [d.id, `${d.firstName} ${d.lastName}`.trim()]));
    const categoryMap = new Map(categoriesRows.map((c) => [c.id, c.name]));

    const data = rows.map((c) =>
      serializeChecklist(
        {
          id:          c.id,
          companyId:   c.company_id,
          categoryId:  c.category_id,
          assetId:     c.asset_id,
          driverId:    c.driver_id,
          inspectorId: c.inspector_id,
          targetKind:  c.target_kind,
          targetLabel: c.target_label,
          date:        c.date,
          status:      c.status,
          summary:     c.summary,
          findings:    c.findings,
          items:       c.items ?? [],
          photoUrls:   c.photo_urls ?? [],
          createdAt:   c.created_at as unknown as Date,
          updatedAt:   c.updated_at as unknown as Date,
        },
        {
          assetName:    c.asset_id    ? (assetMap.get(c.asset_id)    ?? null) : null,
          driverName:   c.driver_id   ? (driverMap.get(c.driver_id)  ?? null) : null,
          categoryName: c.category_id ? (categoryMap.get(c.category_id) ?? null) : null,
        }
      )
    );

    res.json({ data, total: data.length });
  } catch (err) {
    next(err);
  }
});

router.get('/anomalies', requireModule('checklist'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const dateParam  = typeof req.query.date === 'string' ? req.query.date : null;
    const fromParam  = typeof req.query.from === 'string' ? req.query.from : null;
    const toParam    = typeof req.query.to   === 'string' ? req.query.to   : null;

    // Resolver rango efectivo
    let from: string, to: string;
    if (dateParam) {
      from = dateParam;
      to   = dateParam;
    } else if (fromParam && toParam) {
      from = fromParam;
      to   = toParam;
    } else {
      const today = new Date().toISOString().slice(0, 10);
      from = today; to = today;
    }

    // Traer todos los checklists Observado en el rango, joined con su asset.
    // SQL crudo por el mismo motivo que en GET /: la combinación
    // select({...}).leftJoin(...).orderBy(...) con columnas jsonb nullable
    // del schema actual hacía reventar orderSelectedFields de drizzle-orm
    // 0.45.2 cuando la fila tenía items/photoUrls en null. El SQL crudo
    // evita ese path.
    const rawAnomRows = await db.execute<{
      id: number; asset_id: number | null; target_label: string | null;
      date: string; items: unknown[] | null;
      asset_name: string | null; asset_plate: string | null;
    }>(sql`
      SELECT c.id, c.asset_id, c.target_label, c.date,
            COALESCE(c.items, '[]'::jsonb) AS items,
            a.name  AS asset_name,
            a.plate AS asset_plate
        FROM company_checklists c
        LEFT JOIN company_assets a ON a.id = c.asset_id
      WHERE c.company_id = ${companyId}
        AND c.status = 'Observado'
        AND c.date >= ${from}
        AND c.date <= ${to}
      ORDER BY c.date DESC
    `);
    
    const rows = (Array.isArray(rawAnomRows) ? rawAnomRows : (rawAnomRows as any).rows ?? []) as Array<{
      id: number; asset_id: number | null; target_label: string | null;
      date: string; items: unknown[] | null;
      asset_name: string | null; asset_plate: string | null;
    }>;

    // Agrupar por vehículo
    const grouped = new Map<number | string, {
      assetId: string | null;
      assetLabel: string;
      assetName: string | null;
      assetPlate: string | null;
      count: number;
      lastAnomalyAt: string;
      checklistIds: string[];
    }>();

    for (const r of rows) {
      // Key: por assetId numérico si existe; sino, fallback a targetLabel
      const key: number | string = r.asset_id ?? `label:${r.target_label ?? r.id}`;
      const existing = grouped.get(key);
      const id = toId('checklist', r.id);
      if (!existing) {
        grouped.set(key, {
          assetId: r.asset_id ? toId('asset', r.asset_id) : null,
          assetLabel: r.asset_name ?? r.target_label ?? 'Sin vehículo',
          assetName: r.asset_name,
          assetPlate: r.asset_plate,
          count: 1,
          lastAnomalyAt: r.date,
          checklistIds: [id],
        });
      } else {
        existing.count += 1;
        existing.checklistIds.push(id);
        if (r.date > existing.lastAnomalyAt) existing.lastAnomalyAt = r.date;
      }
    }

    const data = Array.from(grouped.values())
      .sort((a, b) => b.lastAnomalyAt.localeCompare(a.lastAnomalyAt));

    res.json({ data, total: data.length, from, to });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/checklists/:checkId ─────────────────────────────────────
// Importante: la ruta `/checklists/anomalies` está declarada más abajo para
// evitar que Express la capture aquí como `checkId = "anomalies"` y termine
// en 404 por un parseId que falla.
// (Express 4 no soporta regex inline en paths; validamos el formato dentro
// del handler con un guard sobre el parámetro.)

router.get('/checklists/:checkId', requireModule('checklist'), async (req, res, next) => {
  // Guard: si el path-segment no es un id numérico, no matcheamos — dejamos
  // que la siguiente ruta (`/checklists/anomalies`) lo capture. Express 4 no
  // soporta regex inline en paths, así que hacemos el match manualmente.
  if (!/^\d+$/.test(req.params.checkId)) {
    return next();
  }
  try {
    const companyId = req.companyId!;
    const checkId = parseId('checklist', req.params.checkId);

    const rows = await db
      .select({
        id: companyChecklists.id,
        companyId: companyChecklists.companyId,
        categoryId: companyChecklists.categoryId,
        assetId: companyChecklists.assetId,
        driverId: companyChecklists.driverId,
        inspectorId: companyChecklists.inspectorId,
        targetKind: companyChecklists.targetKind,
        targetLabel: companyChecklists.targetLabel,
        date: companyChecklists.date,
        status: companyChecklists.status,
        summary: companyChecklists.summary,
        findings: companyChecklists.findings,
        items: companyChecklists.items,
        photoUrls: companyChecklists.photoUrls,
        createdAt: companyChecklists.createdAt,
        updatedAt: companyChecklists.updatedAt,
      })
      .from(companyChecklists)
      .where(
        and(eq(companyChecklists.id, checkId), eq(companyChecklists.companyId, companyId))
      )
      .limit(1);

    if (!rows.length) throw new NotFoundError('Checklist', req.params.checkId);

    // ── Enrichment ────────────────────────────────────────────────────────────
    const c = rows[0];
    let assetName: string | null = null;
    let driverName: string | null = null;
    let categoryName: string | null = null;

    if (c.assetId) {
      const [a] = await db.select({ name: companyAssets.name }).from(companyAssets).where(and(eq(companyAssets.id, c.assetId), eq(companyAssets.companyId, companyId))).limit(1);
      assetName = a?.name ?? null;
    }
    if (c.driverId) {
      const [d] = await db
        .select({ firstName: companyDrivers.firstName, lastName: companyDrivers.lastName })
        .from(companyDrivers)
        .where(and(eq(companyDrivers.id, c.driverId), eq(companyDrivers.companyId, companyId)))
        .limit(1);
      driverName = d ? `${d.firstName} ${d.lastName}`.trim() : null;
    }
    if (c.categoryId) {
      const [cat] = await db.select({ name: companyChecklistCategories.name }).from(companyChecklistCategories).where(and(eq(companyChecklistCategories.id, c.categoryId), eq(companyChecklistCategories.companyId, companyId))).limit(1);
      categoryName = cat?.name ?? null;
    }

    res.json(serializeChecklist(c, { assetName, driverName, categoryName }));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/checklists ─────────────────────────────────────────────

router.post(
  '/',
  requireModule('checklist'),
  validate(createChecklistSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createChecklistSchema>;

      const categoryId = body.categoryId ? parseId('checklist-category', body.categoryId) : null;
      const assetId    = body.assetId    ? parseId('asset', body.assetId)              : null;
      const driverId   = body.driverId   ? parseId('driver', body.driverId)            : null;
      const inspectorId = Number(req.user!.sub.replace(/\D/g, '')) || null;

      const [created] = await db
        .insert(companyChecklists)
        .values({
          companyId,
          categoryId,
          assetId,
          driverId,
          inspectorId,
          targetKind:  body.targetKind  ?? 'Vehiculo',
          targetLabel: body.targetLabel ?? '',
          date:        body.date,
          status:      body.status      ?? 'Pendiente',
          summary:     body.summary     ?? null,
          findings:    body.findings    ?? null,
          items:       Array.isArray(body.items) ? body.items : [],
          photoUrls:   Array.isArray(body.photoUrls) ? body.photoUrls : [],
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

      // ── Enrichment ────────────────────────────────────────────────────────────
      const c = created;
      let assetName: string | null = null;
      let driverName: string | null = null;
      let categoryName: string | null = null;
      if (c.assetId) { const [a] = await db.select({ name: companyAssets.name }).from(companyAssets).where(and(eq(companyAssets.id, c.assetId), eq(companyAssets.companyId, companyId))).limit(1); assetName = a?.name ?? null; }
      if (c.driverId) { const [d] = await db.select({ firstName: companyDrivers.firstName, lastName: companyDrivers.lastName }).from(companyDrivers).where(and(eq(companyDrivers.id, c.driverId), eq(companyDrivers.companyId, companyId))).limit(1); driverName = d ? `${d.firstName} ${d.lastName}`.trim() : null; }
      if (c.categoryId) { const [cat] = await db.select({ name: companyChecklistCategories.name }).from(companyChecklistCategories).where(and(eq(companyChecklistCategories.id, c.categoryId), eq(companyChecklistCategories.companyId, companyId))).limit(1); categoryName = cat?.name ?? null; }

      res.status(201).json(serializeChecklist(c, { assetName, driverName, categoryName }));

      // ── WS broadcast ─ realtime update for historial / anomalías ───────────────
      wsBroadcast(companyId, {
        type: 'checklist:created',
        data: serializeChecklist(c, { assetName, driverName, categoryName }),
      });
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
        .select({
          id: companyChecklists.id,
          companyId: companyChecklists.companyId,
          categoryId: companyChecklists.categoryId,
          assetId: companyChecklists.assetId,
          driverId: companyChecklists.driverId,
          inspectorId: companyChecklists.inspectorId,
        })
        .from(companyChecklists)
        .where(
          and(eq(companyChecklists.id, checkId), eq(companyChecklists.companyId, companyId))
        )
        .limit(1);

      if (!existing.length) throw new NotFoundError('Checklist', req.params.checkId);

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.targetKind  !== undefined) updateData.targetKind  = body.targetKind;
      if (body.targetLabel !== undefined) updateData.targetLabel = body.targetLabel;
      if (body.date        !== undefined) updateData.date        = body.date;
      if (body.status      !== undefined) updateData.status      = body.status;
      if (body.summary     !== undefined) updateData.summary     = body.summary;
      if (body.findings    !== undefined) updateData.findings    = body.findings;
      if (body.items       !== undefined) updateData.items       = body.items;
      if (body.photoUrls   !== undefined) updateData.photoUrls   = body.photoUrls;
      if (body.categoryId  !== undefined) updateData.categoryId  = body.categoryId ? parseId('checklist-category', body.categoryId) : null;
      if (body.assetId     !== undefined) updateData.assetId     = body.assetId    ? parseId('asset',              body.assetId)     : null;
      if (body.driverId    !== undefined) updateData.driverId    = body.driverId   ? parseId('driver',             body.driverId)    : null;

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

      // ── Enrichment ────────────────────────────────────────────────────────────
      const c = updated;
      let assetName: string | null = null;
      let driverName: string | null = null;
      let categoryName: string | null = null;
      if (c.assetId) { const [a] = await db.select({ name: companyAssets.name }).from(companyAssets).where(and(eq(companyAssets.id, c.assetId), eq(companyAssets.companyId, companyId))).limit(1); assetName = a?.name ?? null; }
      if (c.driverId) { const [d] = await db.select({ firstName: companyDrivers.firstName, lastName: companyDrivers.lastName }).from(companyDrivers).where(and(eq(companyDrivers.id, c.driverId), eq(companyDrivers.companyId, companyId))).limit(1); driverName = d ? `${d.firstName} ${d.lastName}`.trim() : null; }
      if (c.categoryId) { const [cat] = await db.select({ name: companyChecklistCategories.name }).from(companyChecklistCategories).where(and(eq(companyChecklistCategories.id, c.categoryId), eq(companyChecklistCategories.companyId, companyId))).limit(1); categoryName = cat?.name ?? null; }

      res.json(serializeChecklist(c, { assetName, driverName, categoryName }));

      // ── WS broadcast ─ realtime update ─────────────────────────────────────────
      wsBroadcast(companyId, {
        type: 'checklist:updated',
        data: serializeChecklist(c, { assetName, driverName, categoryName }),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/checklists/:checkId ────────────────────────────────────

router.delete(
  '/checklists/:checkId',
  requireModule('checklist'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const checkId = parseId('checklist', req.params.checkId);

      const existing = await db
        .select()
        .from(companyChecklists)
        .where(and(eq(companyChecklists.id, checkId), eq(companyChecklists.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Checklist', req.params.checkId);

      await db
        .delete(companyChecklists)
        .where(and(eq(companyChecklists.id, checkId), eq(companyChecklists.companyId, companyId)));

      await logAudit(db, companyId, {
        entity: 'checklists',
        entityId: toId('checklist', checkId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Checklist "${toId('checklist', checkId)}" eliminado.`,
      });

      // ── WS broadcast ─ realtime update ─────────────────────────────────────────
      wsBroadcast(companyId, {
        type: 'checklist:deleted',
        data: { id: toId('checklist', checkId) },
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /company/:id/checklists/anomalies ─────────────────────────────────────
// Devuelve, por DÍA (o rango), los vehículos con al menos 1 checklist Observado.
// Query: ?date=YYYY-MM-DD  ó  ?from=YYYY-MM-DD&to=YYYY-MM-DD
// Retorna: { data: [{ assetId, assetLabel, assetName, assetPlate,
//                   count: <cantidad de checklists Observados>,
//                   lastAnomalyAt: <fecha del más reciente> }], total }



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

function serializeChecklist(
  c: typeof companyChecklists.$inferSelect,
  info?: { assetName: string | null; driverName: string | null; categoryName: string | null } | null
) {
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
    // `items` y `photoUrls` son jsonb/array nullable en el schema. Si la
    // fila quedó con `null` (INSERT que no envió el campo y drizzle no
    // aplicó el default), el query builder revienta con
    // `Cannot convert undefined or null to object`. Forzamos fallback acá.
    items: Array.isArray(c.items) ? c.items : [],
    photoUrls: Array.isArray(c.photoUrls) ? c.photoUrls : [],
    // ── Enrichment ─────────────────────────────────────────────────────────────
    assetName: info?.assetName ?? null,
    driverName: info?.driverName ?? null,
    categoryName: info?.categoryName ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export default router;