import { Router } from 'express';
import { z } from 'zod';
import { eq, and, gte, lte, sql, desc, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyChecklists, companyChecklistCategories, companyAssets, companyDrivers, companyAssignments, companySites } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requirePermission } from '../../middlewares/requirePermission';
import { NotFoundError, ForbiddenError, AppError, ValidationError } from '../../lib/errors';
import { toId, parseId, parseIdFlexible } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';
import { wsBroadcast } from '../../services/websocket';
import { currentCycle, isWithinWindow, isCycleClosed, previousCycle, type CadenceKind, type ScopeKind } from '../../lib/periodicity';

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CHECKLIST_STATUSES = ['Aprobado', 'Observado', 'Pendiente', 'Rechazado', 'Vencido'] as const;
const CHECKLIST_TARGET_KINDS = ['Vehiculo', 'Generador', 'AireAcondicionado', 'Otro'] as const;
const CHECKLIST_HAS_ITEM = ['SI', 'NO'] as const;
const CHECKLIST_CONDITION = ['Bueno', 'Regular', 'Malo'] as const;

const CADENCE_KINDS = ['none', 'weekly', 'days'] as const;
const SCOPE_KINDS = ['pick', 'site_assets', 'asset_type'] as const;

// Categorías
//
// Zod v4 NO permite `.partial()` sobre schemas con `.superRefine()`, así que
// definimos la "shape" base sin refinements cross-field. El `create` agrega el
// refinement al final; el `update` aplica `.partial()` y luego corre la misma
// validación cross-field manualmente.
const categoryShape = {
  name: safeString({ min: 2, max: 120, fieldLabel: 'Nombre', allowEmpty: false }),
  description: safeString({ max: 500, fieldLabel: 'Descripción', allowEmpty: true }).nullable().optional(),
  items: z.array(safeString({ min: 1, max: 120, fieldLabel: 'Item', allowEmpty: false })).max(100).default([]),
  // Asignación opcional
  targetRoles: z.array(safeString({ min: 1, max: 40, fieldLabel: 'Rol', allowEmpty: false })).max(20).default([]),
  targetUserIds: z.array(safeString({ min: 1, max: 40, fieldLabel: 'UserId', allowEmpty: false })).max(500).default([]),
  // Periodicidad
  cadenceKind: z.enum(CADENCE_KINDS).default('none'),
  cadenceDays: z.number().int().min(1).max(365).nullable().optional(),
  windowDays: z.number().int().min(1).max(60).default(7),
  // Alcance
  scopeKind: z.enum(SCOPE_KINDS).default('pick'),
  scopeAssetType: z.enum(CHECKLIST_TARGET_KINDS).nullable().optional(),
  scopeSiteId: z.number().int().positive().nullable().optional(),
} as const;

const createCategorySchema = z.object(categoryShape).superRefine((data, ctx) => {
  if (data.cadenceKind === 'days' && data.cadenceDays == null) {
    ctx.addIssue({ code: 'custom', path: ['cadenceDays'], message: 'cadenceDays es obligatorio si cadenceKind="days"' });
  }
  if (data.scopeKind === 'asset_type' && !data.scopeAssetType) {
    ctx.addIssue({ code: 'custom', path: ['scopeAssetType'], message: 'scopeAssetType es obligatorio si scopeKind="asset_type"' });
  }
});

// Para update: object parcial + validamos la combinación (kind/days, kind/type)
// manualmente, fuera del schema, para evitar el crash de Zod v4 con refinements.
const updateCategorySchema = z.object(categoryShape).partial();

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
// Visibilidad: admin/owner ven TODAS las categorías de la empresa.
// El resto ve solo las que no tienen asignación (todos) o donde aparece
// su rol o su userId en la unión OR.

router.get('/checklist-categories', requireModule('checklist'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const user = req.user!;

    const rows = await db
      .select()
      .from(companyChecklistCategories)
      .where(eq(companyChecklistCategories.companyId, companyId))
      .orderBy(companyChecklistCategories.name);

    const filtered = filterCategoriesForUser(rows, user.role, user.sub);
    res.json({ data: filtered.map(serializeCategory), total: filtered.length });
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/checklist-categories ───────────────────────────────────

router.post(
  '/checklist-categories',
  requireModule('checklist'),
  requirePermission('checklist', 'checklist', 'crear'),
  validate(createCategorySchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createCategorySchema>;

      const values = {
        companyId,
        name: body.name,
        description: body.description ?? null,
        items: body.items ?? [],
        targetRoles: body.targetRoles ?? [],
        targetUserIds: body.targetUserIds ?? [],
        cadenceKind: body.cadenceKind ?? 'none',
        cadenceDays: body.cadenceKind === 'days' ? body.cadenceDays ?? null : null,
        windowDays: body.windowDays ?? 7,
        scopeKind: body.scopeKind ?? 'pick',
        scopeAssetType: body.scopeKind === 'asset_type' ? body.scopeAssetType ?? null : null,
        scopeSiteId: body.scopeKind === 'site_assets' || body.scopeKind === 'asset_type'
          ? body.scopeSiteId ?? null
          : null,
      };

      const [created] = await db
        .insert(companyChecklistCategories)
        .values(values)
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
  requirePermission('checklist', 'checklist', 'editar'),
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

      // ── Validación cross-field: combina lo que viene en el body con lo que
      //    ya está en BD para validar la combinación final. Zod v4 no permite
      //    .partial() con refinements, así que lo hacemos a mano. ──
      const effCadenceKind   = body.cadenceKind    ?? existing[0].cadenceKind;
      const effScopeKind     = body.scopeKind      ?? existing[0].scopeKind;
      const effCadenceDays   = body.cadenceDays    ?? existing[0].cadenceDays;
      const effScopeAsset    = body.scopeAssetType ?? existing[0].scopeAssetType;
      const issues: Record<string, string[]> = {};
      if (effCadenceKind === 'days' && effCadenceDays == null) {
        (issues.cadenceDays ??= []).push('cadenceDays es obligatorio si cadenceKind="days"');
      }
      if (effScopeKind === 'asset_type' && !effScopeAsset) {
        (issues.scopeAssetType ??= []).push('scopeAssetType es obligatorio si scopeKind="asset_type"');
      }
      if (Object.keys(issues).length) throw new ValidationError(issues);

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.name           !== undefined) updateData.name           = body.name;
      if (body.description    !== undefined) updateData.description    = body.description;
      if (body.items          !== undefined) updateData.items          = body.items;
      if (body.targetRoles    !== undefined) updateData.targetRoles    = body.targetRoles;
      if (body.targetUserIds  !== undefined) updateData.targetUserIds  = body.targetUserIds;
      if (body.cadenceKind    !== undefined) {
        updateData.cadenceKind = body.cadenceKind;
        if (body.cadenceKind !== 'days') updateData.cadenceDays = null;
      }
      if (body.cadenceDays    !== undefined) updateData.cadenceDays    = body.cadenceDays;
      if (body.windowDays     !== undefined) updateData.windowDays     = body.windowDays;
      if (body.scopeKind      !== undefined) {
        updateData.scopeKind = body.scopeKind;
        if (body.scopeKind !== 'asset_type') updateData.scopeAssetType = null;
        if (body.scopeKind === 'pick') updateData.scopeSiteId = null;
      }
      if (body.scopeAssetType !== undefined) updateData.scopeAssetType = body.scopeAssetType;
      if (body.scopeSiteId    !== undefined) updateData.scopeSiteId    = body.scopeSiteId;

      const [updated] = await db
        .update(companyChecklistCategories)
        .set(updateData)
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
  requirePermission('checklist', 'checklist', 'eliminar'),
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

router.get('/', requireModule('checklist'), requirePermission('checklist', 'historial', 'ver'), async (req, res, next) => {
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

    res.json({
      data,
      total: data.length,
      assets: assetsRows.map((a) => ({ id: a.id, name: a.name })),
      drivers: driversRows.map((d) => ({
        id: d.id,
        firstName: d.firstName,
        lastName: d.lastName,
        name: `${d.firstName} ${d.lastName}`.trim(),
      })),
      categories: categoriesRows.map((c) => ({ id: c.id, name: c.name })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/anomalies', requireModule('checklist'), requirePermission('checklist', 'historial', 'ver'), async (req, res, next) => {
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

router.get('/checklists/:checkId', requireModule('checklist'), requirePermission('checklist', 'historial', 'ver'), async (req, res, next) => {
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

    // eslint-disable-next-line no-console
    console.log('[pendientes] result', { role: user.role, count: result.length, items: result.map((r) => ({ cat: r.categoryName, scope: r.scopeKind, pendingCount: r.pendingItems.length })) });
    res.json({ data: result, total: result.length });
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/checklists ─────────────────────────────────────────────

router.post(
  '/',
  requireModule('checklist'),
  requirePermission('checklist', 'inspecciones', 'crear'),
  validate(createChecklistSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createChecklistSchema>;

      const categoryId = body.categoryId ? parseIdFlexible('checklist-category', body.categoryId) : null;
      const assetId    = body.assetId    ? parseIdFlexible('asset',               body.assetId)    : null;
      const driverId   = body.driverId   ? parseIdFlexible('driver',              body.driverId)   : null;
      const inspectorId = Number(req.user!.sub.replace(/\D/g, '')) || null;

      // ── Regla: un Conductor solo puede inspeccionar el vehículo de su asignación
      //           activa. Si manda otro assetId, 403.
      if (req.user!.role === 'conductor' && assetId) {
        const userIdNum = Number(req.user!.sub.replace(/\D/g, '')) || null;
        if (!userIdNum) {
          throw new ForbiddenError('No se pudo identificar al usuario para validar la asignación.');
        }
        // Resolver driverId del usuario.
        const [driverRow] = await db
          .select({ id: companyDrivers.id })
          .from(companyDrivers)
          .where(and(eq(companyDrivers.userId, userIdNum), eq(companyDrivers.companyId, companyId)))
          .limit(1);
        if (!driverRow) {
          throw new ForbiddenError('Tu usuario no está registrado como conductor. Pide a un supervisor que te dé de alta.');
        }
        // Buscar asignación activa.
        const [activeAssign] = await db
          .select({ id: companyAssignments.id, assetId: companyAssignments.assetId })
          .from(companyAssignments)
          .where(and(
            eq(companyAssignments.companyId, companyId),
            eq(companyAssignments.driverId, driverRow.id),
            eq(companyAssignments.status, 'Activa'),
          ))
          .limit(1);
        if (!activeAssign) {
          throw new ForbiddenError('No tienes una asignación activa. Pide a un supervisor que te asigne un vehículo.');
        }
        if (activeAssign.assetId !== assetId) {
          throw new ForbiddenError('Solo puedes inspeccionar el vehículo de tu asignación activa.');
        }
      }

      // ── Regla: si la categoría tiene periodicidad y el ciclo actual ya cerró
      //           su ventana, no se puede crear el checklist (está vencido). ──
      if (categoryId) {
        const [cat] = await db
          .select()
          .from(companyChecklistCategories)
          .where(and(eq(companyChecklistCategories.id, categoryId), eq(companyChecklistCategories.companyId, companyId)))
          .limit(1);
        if (cat) {
          const closed = isCycleClosed(
            { cadenceKind: cat.cadenceKind as CadenceKind, cadenceDays: cat.cadenceDays, windowDays: cat.windowDays, createdAt: cat.createdAt },
          );
          if (closed) {
            throw new AppError(410, 'El ciclo de esta plantilla ya cerró su ventana. El pendiente pasó al historial como vencido.');
          }
        }
      }

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
  requirePermission('checklist', 'inspecciones', 'editar'),
  validate(updateChecklistSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const checkId = parseId('checklist', req.params.checkId);
      const body = req.body as z.infer<typeof updateChecklistSchema>;

      // ── Regla: supervisor NO puede editar checklists ya hechos. ──
      if (req.user!.role === 'supervisor') {
        throw new ForbiddenError('El supervisor no puede editar checklists ya hechos. Solo admin/owner pueden.');
      }

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
  requirePermission('checklist', 'inspecciones', 'eliminar'),
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



// ══════════════════════════════════════════════════════════════════════════════
// VISIBILIDAD + PENDIENTES + VENCIDOS
// ══════════════════════════════════════════════════════════════════════════════

// Roles que ven TODO sin filtro (no se les aplica targetRoles/targetUserIds).
const ADMIN_ROLES = new Set(['owner_empresa', 'admin_empresa', 'superadmin']);

/** Filtra categorías por visibilidad del usuario. */
function filterCategoriesForUser<
  T extends {
    targetRoles: string[] | null;
    targetUserIds: string[] | null;
  }
>(rows: T[], userRole: string, userSub: string): T[] {
  if (ADMIN_ROLES.has(userRole)) return rows;
  return rows.filter((c) => {
    const roles = c.targetRoles ?? [];
    const users = c.targetUserIds ?? [];
    // Si no hay asignación, es pública para todos los de la empresa.
    if (roles.length === 0 && users.length === 0) return true;
    return roles.includes(userRole) || users.includes(userSub);
  });
}

/**
 * Devuelve los assets aplicables a la categoría según su scopeKind.
 * - 'pick'         -> [] (el usuario elige, no pre-derivamos)
 * - 'site_assets'  -> todos los Vehiculo de la sede del usuario
 * - 'asset_type'   -> todos los del tipo (filtrado por sede si scopeSiteId)
 */
async function deriveAssetsForCategory(
  companyId: number,
  cat: typeof companyChecklistCategories.$inferSelect,
  userSiteId: number | null,
): Promise<Array<{ id: number; name: string; plate: string | null; siteId: number | null }>> {
  if (cat.scopeKind === 'pick') return [];

  if (cat.scopeKind === 'site_assets') {
    const siteId = cat.scopeSiteId ?? userSiteId;
    if (!siteId) {
      // Sin sede ni en el usuario ni en la categoría: fallback a todos los
      // vehículos de la empresa (no falla).
      return db
        .select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate, siteId: companyAssets.siteId })
        .from(companyAssets)
        .where(and(eq(companyAssets.companyId, companyId), eq(companyAssets.assetType, 'Vehiculo')))
        .orderBy(companyAssets.name);
    }
    return db
      .select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate, siteId: companyAssets.siteId })
      .from(companyAssets)
      .where(and(eq(companyAssets.companyId, companyId), eq(companyAssets.siteId, siteId), eq(companyAssets.assetType, 'Vehiculo')))
      .orderBy(companyAssets.name);
  }

  // 'asset_type'
  // El schema de assets tiene assetType: 'Vehiculo' | 'Motor' | 'Maquinaria' | 'Planta electrica'.
  // El scope de la plantilla usa CHECKLIST_TARGET_KINDS. Mapeamos a los valores válidos.
  // (Nota: 'Motor' fue removido del enum público en 2026-06 porque se duplicaba con 'Vehiculo'.)
  const ASSET_TYPE_MAP: Record<string, 'Vehiculo' | 'Maquinaria' | 'Planta electrica'> = {
    Vehiculo: 'Vehiculo',
    Generador: 'Planta electrica',
    AireAcondicionado: 'Maquinaria',
    Otro: 'Maquinaria',
  };
  const rawType = cat.scopeAssetType ?? 'Vehiculo';
  const assetType = ASSET_TYPE_MAP[rawType] ?? 'Vehiculo';
  const conds = [eq(companyAssets.companyId, companyId), eq(companyAssets.assetType, assetType)];
  if (cat.scopeSiteId) conds.push(eq(companyAssets.siteId, cat.scopeSiteId));
  return db
    .select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate, siteId: companyAssets.siteId })
    .from(companyAssets)
    .where(and(...conds))
    .orderBy(companyAssets.name);
}

/** Busca la sede del usuario. companyUsers aún no tiene siteId en el schema,
 *  así que por ahora devolvemos null y el caller hace fallback. */
async function getUserSiteId(_companyId: number, _userSub: string): Promise<number | null> {
  return null;
}

// ─── GET /company/:id/checklists/pendientes ────────────────────────────────────
// Devuelve para el usuario autenticado, los checklists que aún debe hacer
// en el ciclo actual de cada categoría a la que tiene acceso.
//
// Respuesta: { data: [{ categoryId, categoryName, scopeKind, scopeLabel,
//                       cycleStart, cycleEnd, windowEnd, isOverdue,
//                       pendingItems: [{ assetId, assetLabel, assetPlate, siteId }] }] }

router.get('/pendientes', requireModule('checklist'), requirePermission('checklist', 'inspecciones', 'ver'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const user = req.user!;
    const userSiteId = await getUserSiteId(companyId, user.sub);

    // ── Si el usuario es Conductor, resolver su driverId + assetId de asignación
    //    activa UNA sola vez. Luego filtramos `assets` por ese asset en cada
    //    categoría, de modo que el chofer solo vea su propio vehículo.
    let conductorAssetId: number | null = null;
    if (user.role === 'conductor') {
      const userIdNum = Number(user.sub.replace(/\D/g, '')) || null;
      if (userIdNum) {
        const [driverRow] = await db
          .select({ id: companyDrivers.id })
          .from(companyDrivers)
          .where(and(eq(companyDrivers.userId, userIdNum), eq(companyDrivers.companyId, companyId)))
          .limit(1);
        if (driverRow) {
          const [activeAssign] = await db
            .select({ assetId: companyAssignments.assetId })
            .from(companyAssignments)
            .where(and(
              eq(companyAssignments.companyId, companyId),
              eq(companyAssignments.driverId, driverRow.id),
              eq(companyAssignments.status, 'Activa'),
            ))
            .limit(1);
          conductorAssetId = activeAssign?.assetId ?? null;
        }
      }
    }

    const allCats = await db
      .select()
      .from(companyChecklistCategories)
      .where(eq(companyChecklistCategories.companyId, companyId))
      .orderBy(companyChecklistCategories.name);

    const visible = filterCategoriesForUser(allCats, user.role, user.sub);

    const now = new Date();

    const result: Array<{
      categoryId: string;
      categoryName: string;
      scopeKind: ScopeKind;
      scopeLabel: string;
      cycleStart: string;
      cycleEnd: string;
      windowEnd: string;
      cycleLabel: string;
      isOverdue: boolean;
      pendingItems: Array<{ assetId: string; assetLabel: string; assetPlate: string | null; siteId: number | null }>;
    }> = [];

    for (const cat of visible) {
      const cycle = currentCycle(
        { cadenceKind: cat.cadenceKind as CadenceKind, cadenceDays: cat.cadenceDays, windowDays: cat.windowDays, createdAt: cat.createdAt },
        now,
      );
      // Si hay ciclo y ya cerró su ventana, el pendiente pasa al historial.
      if (cycle !== null && now.getTime() > cycle.windowEnd.getTime()) continue;

      // Activos a considerar. Si es Conductor, idealmente SOLO su vehículo
      // de asignación. Pero si su asignación no tiene `assetId` (data rota o
      // asignación sin vehículo), dejamos que vea los pendientes del scope y
      // confiamos en la validación server-side del POST /checklists para que
      // no pueda inspeccionar vehículos que no son suyos.
      let assets = await deriveAssetsForCategory(companyId, cat, userSiteId);
      if (user.role === 'conductor') {
        // Para scope 'pick' el `assets` viene vacío (lo decide el usuario al hacer).
        // En ese caso NO filtramos por asset; el pendiente aparece con
        // `pendingItems=[]` y el frontend (con restrictToAssetId) le muestra
        // solo su vehículo al hacer la inspección.
        if (cat.scopeKind !== 'pick' && conductorAssetId != null) {
          assets = assets.filter((a) => a.id === conductorAssetId);
          if (assets.length === 0) continue; // su vehículo no aplica a esta plantilla
        }
      }

      // Filtros de fecha opcionales. Si no hay ciclo (cadenceKind='none'), no acotamos por fecha.
      const dateGte = cycle ? gte(companyChecklists.createdAt, cycle.start) : undefined;
      const dateLte = cycle ? lte(companyChecklists.createdAt, cycle.end) : undefined;

      // Checklists ya hechos para esta categoría y este inspector.
      const madeRows = assets.length > 0
        ? await db
            .select({ asset_id: companyChecklists.assetId })
            .from(companyChecklists)
            .where(and(
              eq(companyChecklists.companyId, companyId),
              eq(companyChecklists.categoryId, cat.id),
              eq(companyChecklists.inspectorId, parseIdFlexible('company-user', user.sub)),
              inArray(companyChecklists.assetId, assets.map((a) => a.id)),
              ...(dateGte ? [dateGte] : []),
              ...(dateLte ? [dateLte] : []),
            ))
        : [];

      const madeAssetIds = new Set(madeRows.map((r) => r.asset_id).filter((x): x is number => x != null));

      // Para `pick`, no consultamos `madeNoAsset` (assetId IS NULL) porque el
      // wizard siempre envía assetId. En su lugar, dentro del bloque `pick`
      // consultamos TODOS los checklists del inspector en este ciclo.

      let pendingItems: Array<{ assetId: string; assetLabel: string; assetPlate: string | null; siteId: number | null }>;

      if (cat.scopeKind === 'pick') {
        // Para 'pick': el pendiente existe si el inspector NO ha hecho
        // ningún checklist de esta categoría en este ciclo (con o sin assetId).
        // Antes solo contábamos los de `assetId IS NULL`, pero el wizard SIEMPRE
        // envía assetId, así que ese query siempre era 0. Ahora miramos el
        // universo completo: cualquier checklist del inspector/categoría/ciclo.
        const totalMade = await db
          .select({ id: companyChecklists.id })
          .from(companyChecklists)
          .where(and(
            eq(companyChecklists.companyId, companyId),
            eq(companyChecklists.categoryId, cat.id),
            eq(companyChecklists.inspectorId, parseIdFlexible('company-user', user.sub)),
            ...(dateGte ? [dateGte] : []),
            ...(dateLte ? [dateLte] : []),
          ));
        if (totalMade.length > 0) continue;
        // El frontend abre el picker de activos.
        pendingItems = [];
      } else {
        pendingItems = assets
          .filter((a) => !madeAssetIds.has(a.id))
          .map((a) => ({
            assetId: toId('asset', a.id),
            assetLabel: a.plate ? `${a.name} · ${a.plate}` : a.name,
            assetPlate: a.plate,
            siteId: a.siteId,
          }));
        if (pendingItems.length === 0) continue;
      }

      result.push({
        categoryId: toId('checklist-category', cat.id),
        categoryName: cat.name,
        scopeKind: cat.scopeKind as ScopeKind,
        scopeLabel:
          cat.scopeKind === 'pick' ? 'Elegir al hacer' :
          cat.scopeKind === 'site_assets' ? 'Todos los vehículos de la sede' :
          `Todos los ${cat.scopeAssetType ?? 'activos'}`,
        cycleStart: (cycle?.start ?? new Date(0)).toISOString(),
        cycleEnd:   (cycle?.end   ?? new Date(0)).toISOString(),
        windowEnd:  (cycle?.windowEnd ?? new Date(0)).toISOString(),
        cycleLabel: cycle?.label ?? 'Sin periodicidad',
        isOverdue: false,
        pendingItems,
      });
    }

    res.json({ data: result, total: result.length });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/checklists/vencidos ──────────────────────────────────────
// Devuelve los pendientes del último ciclo cerrado que NO se hicieron.
// Se computa on-demand (no hay cron). El "vencido" se persiste como un
// checklist virtual con status='Vencido' solo si se quiere ver en historial;
// por simplicidad, este endpoint DERIVA los vencidos sin tocar la tabla.

router.get('/vencidos', requireModule('checklist'), requirePermission('checklist', 'inspecciones', 'ver'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const user = req.user!;
    const userSiteId = await getUserSiteId(companyId, user.sub);

    // Conductor: resolver su asignación activa (mismo bloque que /pendientes).
    let conductorAssetId: number | null = null;
    if (user.role === 'conductor') {
      // Usamos parseIdFlexible (mismo método que /auth/me/driver-assignment)
      // para extraer el id del prefijo 'company-user-'. Si el sub no matchea,
      // el chofer simplemente no tiene fila mapeada.
      let userIdNum: number | null = null;
      try {
        const sub = user.sub as string;
        if (/^\d+$/.test(sub)) {
          userIdNum = Number(sub);
        } else {
          userIdNum = parseIdFlexible('company-user', sub);
        }
      } catch {
        userIdNum = null;
      }
      if (userIdNum) {
        const [driverRow] = await db
          .select({ id: companyDrivers.id })
          .from(companyDrivers)
          .where(and(eq(companyDrivers.userId, userIdNum), eq(companyDrivers.companyId, companyId)))
          .limit(1);
        if (driverRow) {
          const [activeAssign] = await db
            .select({ assetId: companyAssignments.assetId })
            .from(companyAssignments)
            .where(and(
              eq(companyAssignments.companyId, companyId),
              eq(companyAssignments.driverId, driverRow.id),
              eq(companyAssignments.status, 'Activa'),
            ))
            .limit(1);
          conductorAssetId = activeAssign?.assetId ?? null;
        }
      }
    }

    const allCats = await db
      .select()
      .from(companyChecklistCategories)
      .where(eq(companyChecklistCategories.companyId, companyId))
      .orderBy(companyChecklistCategories.name);

    const visible = filterCategoriesForUser(allCats, user.role, user.sub);
    const now = new Date();

    const result: Array<{
      categoryId: string;
      categoryName: string;
      cycleStart: string;
      cycleEnd: string;
      cycleLabel: string;
      missedItems: Array<{ assetId: string; assetLabel: string; assetPlate: string | null }>;
    }> = [];

    for (const cat of visible) {
      if (cat.cadenceKind === 'none') continue;
      const prev = previousCycle(
        { cadenceKind: cat.cadenceKind as CadenceKind, cadenceDays: cat.cadenceDays, windowDays: cat.windowDays, createdAt: cat.createdAt },
        now,
      );
      if (!prev) continue;

      let assets = await deriveAssetsForCategory(companyId, cat, userSiteId);
      // Conductor: idealmente solo su vehículo, pero si su asignación no tiene
      // `assetId` (data rota), dejamos que vea los pendientes del scope y
      // confiamos en la validación server-side del POST /checklists.
      if (user.role === 'conductor') {
        if (cat.scopeKind !== 'pick' && conductorAssetId != null) {
          assets = assets.filter((a) => a.id === conductorAssetId);
          if (assets.length === 0) continue;
        }
      }

      const madeRows = assets.length > 0
        ? await db
            .select({ asset_id: companyChecklists.assetId })
            .from(companyChecklists)
            .where(
              and(
                eq(companyChecklists.companyId, companyId),
                eq(companyChecklists.categoryId, cat.id),
                eq(companyChecklists.inspectorId, parseIdFlexible('company-user', user.sub)),
                inArray(companyChecklists.assetId, assets.map((a) => a.id)),
                gte(companyChecklists.createdAt, prev.start),
                lte(companyChecklists.createdAt, prev.end),
              ),
            )
        : [];

      const madeAssetIds = new Set(madeRows.map((r) => r.asset_id).filter((x): x is number => x != null));

      let missed: Array<{ assetId: string; assetLabel: string; assetPlate: string | null }>;

      if (cat.scopeKind === 'pick') {
        const madeNoAsset = await db
          .select({ id: companyChecklists.id })
          .from(companyChecklists)
          .where(
            and(
              eq(companyChecklists.companyId, companyId),
              eq(companyChecklists.categoryId, cat.id),
              eq(companyChecklists.inspectorId, parseIdFlexible('company-user', user.sub)),
              sql`${companyChecklists.assetId} IS NULL`,
              gte(companyChecklists.createdAt, prev.start),
              lte(companyChecklists.createdAt, prev.end),
            ),
          );
        if (madeNoAsset.length === 0) {
          // No hizo el pick del ciclo anterior → vencido virtual
          missed = [{ assetId: '', assetLabel: '(activo no seleccionado)', assetPlate: null }];
        } else {
          continue;
        }
      } else {
        missed = assets
          .filter((a) => !madeAssetIds.has(a.id))
          .map((a) => ({
            assetId: toId('asset', a.id),
            assetLabel: a.plate ? `${a.name} · ${a.plate}` : a.name,
            assetPlate: a.plate,
          }));
        if (missed.length === 0) continue;
      }

      result.push({
        categoryId: toId('checklist-category', cat.id),
        categoryName: cat.name,
        cycleStart: prev.start.toISOString(),
        cycleEnd: prev.end.toISOString(),
        cycleLabel: prev.label,
        missedItems: missed,
      });
    }

    res.json({ data: result, total: result.length });
  } catch (err) {
    next(err);
  }
});

// ─── Serializers ──────────────────────────────────────────────────────────────

function serializeCategory(c: typeof companyChecklistCategories.$inferSelect) {
  return {
    id: toId('checklist-category', c.id),
    companyId: toId('company', c.companyId),
    name: c.name,
    description: c.description,
    items: c.items ?? [],
    // Asignación
    targetRoles: c.targetRoles ?? [],
    targetUserIds: c.targetUserIds ?? [],
    // Periodicidad
    cadenceKind: c.cadenceKind,
    cadenceDays: c.cadenceDays,
    windowDays: c.windowDays,
    // Alcance
    scopeKind: c.scopeKind,
    scopeAssetType: c.scopeAssetType,
    scopeSiteId: c.scopeSiteId,
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