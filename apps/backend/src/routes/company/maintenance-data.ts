// src/routes/company/maintenance-data.ts
//
// Submódulo "Data" de Mantenimientos (jul 2026 v3).
//
// Endpoint agregado de SOLO LECTURA que alimenta el wizard de 4 pasos del
// submódulo Data (`/mantenimiento/data` en el front). Se montó en una sola
// ruta a propósito: para que el gate `mantenimiento.data.ver` se evalúe UNA
// vez y el front no dependa de hooks cruzados que podrían romper la pantalla
// si al usuario le falta el permiso del módulo del hook (ej: combustible).
//
// Endpoints (todos protegidos por `requirePermission('mantenimiento',
// 'data', 'ver')`):
//
//   GET /maintenance-data/modules
//     Devuelve los módulos relacionados al vehículo que la EMPRESA tiene
//     activos. Cruza `user.companyModules` con la lista de MODULE_KEYS.
//     El front usa este response para renderizar el paso 2 del wizard.
//
//   GET /maintenance-data/assets?q=...
//     Paso 1: lista de vehículos (placa, modelo, sede, status). Paginado
//     con `parsePageParams` (default 20, max 100).
//
//   GET /maintenance-data/categories?assetId=...
//     Paso 3 (solo para módulo=mantenimiento): categorías built-in + custom
//     con conteo de mantenimientos por asset.
//
//   GET /maintenance-data/:moduleKey?assetId=...&category=...&page=N
//     Paso 4: tabla de detalle. moduleKey ∈ mantenimiento | combustible |
//     peajes | checklist | alertas.
//
//   El módulo "mantenimiento" acepta `category` (key de la categoría) y
//   filtra. El resto no acepta `category`. Cada handler trae SOLO las
//   columnas que la UI va a renderizar.

import { Router } from 'express';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client';
import { requirePermission } from '../../middlewares/requirePermission';
import { AppError, NotFoundError } from '../../lib/errors';
import { parsePageParams, buildPageResponse } from '../../lib/pagination';
import { toId, parseIdFlexible } from '../../lib/ids';
import {
  companyAssets,
  companySites,
  companyMaintenanceCategories,
  companyMaintenanceSubcategories,
  companyMaintenanceItems,
  companyMaintenanceRecords,
  companyFuelEntries,
  companyTollEntries,
  companyAlerts,
  companyChecklists,
  companyChecklistCategories,
  companySuppliers,
  companyWorkshops,
} from '../../db/schema/operational';

const router = Router();

const MODULE_KEYS = ['mantenimiento', 'combustible', 'peajes', 'checklist', 'alertas'] as const;
type ModuleKey = typeof MODULE_KEYS[number];

function isModuleKey(s: string): s is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(s);
}

/** Verifica que el asset pertenezca a la empresa. Lanza 404 si no. */
async function assertAssetBelongsToCompany(assetId: number, companyId: number, label: string) {
  const [row] = await db
    .select({ id: companyAssets.id })
    .from(companyAssets)
    .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
    .limit(1);
  if (!row) throw new NotFoundError('Vehículo', label);
}

// ── Gate común a TODO el router ──────────────────────────────────────────────
// Una sola validación. superadmin / owner_empresa / admin_empresa bypasean.
router.use(requirePermission('mantenimiento', 'data', 'ver'));

// ─── GET /maintenance-data/modules ──────────────────────────────────────────

router.get('/modules', async (req, res, next) => {
  try {
    const user = req.user!;
    const enabled = new Set(user.companyModules ?? []);
    const items = MODULE_KEYS
      .filter((key) => user.role === 'superadmin' || enabled.has(key))
      .map((key) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        available: true,
      }));
    res.json({ data: items, available: items.length > 0 });
  } catch (err) {
    next(err);
  }
});

// ─── GET /maintenance-data/assets?q=&page= ──────────────────────────────────

const assetsQuerySchema = z.object({
  q:        z.string().max(80).optional(),
  page:     z.string().optional(),
  pageSize: z.string().optional(),
});

router.get('/assets', async (req, res, next) => {
  try {
    const parsed = assetsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'Parámetros inválidos: ' + parsed.error.message);
    }
    const { q } = parsed.data;
    const companyId = req.companyId!;
    const { page, pageSize, offset } = parsePageParams(req.query, { pageSize: 20 });

    const conds = [
      eq(companyAssets.companyId, companyId),
      // jul 2026 v9 — antes filtraba `status='Operativo'`
      // solamente, lo que dejaba FUERA a los vehículos "En
      // mantenimiento" o "Fuera de servicio" — el caso típico
      // cuando el user está editando justamente un mantenimiento.
      // El submódulo Data muestra los mantenimientos HISTÓRICOS
      // del vehículo, así que el vehículo puede estar en
      // cualquier status hoy. Traemos TODOS los status.
    ];
    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      conds.push(
        or(
          ilike(companyAssets.plate, term),
          ilike(companyAssets.name,  term),
          ilike(companyAssets.code,  term),
          ilike(companyAssets.brand, term),
          ilike(companyAssets.model, term),
        )!,
      );
    }
    const where = and(...conds);

    // jul 2026 v9 — FIX: el LEFT JOIN con `companySites` puede
    // causar problemas con el conteo de filas en la query con
    // LIMIT (cartesiano, sites de otras empresas, etc.) y
    // resultaba en `data: []` con `total > 0` para el cliente.
    // Solución: hacemos el count y la data SIN LEFT JOIN, y
    // resolvemos `siteName` con un map aparte en memoria al
    // final. Para 20-100 vehículos por página es trivial.
    const assetsOnlyQuery = db
      .select({
        id:        companyAssets.id,
        plate:     companyAssets.plate,
        name:      companyAssets.name,
        brand:     companyAssets.brand,
        model:     companyAssets.model,
        year:      companyAssets.year,
        status:    companyAssets.status,
        siteId:    companyAssets.siteId,
      })
      .from(companyAssets)
      .where(where)
      .orderBy(asc(companyAssets.plate), asc(companyAssets.name))
      .limit(pageSize)
      .offset(offset);

    const [rows, countRow] = await Promise.all([
      assetsOnlyQuery,
      db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(companyAssets)
        .where(where),
    ]);

    // Resolvemos `siteName` en una sola query aparte (los
    // siteIds distintos de la página). Si la página está vacía
    // o no hay sites, queda map vacío.
    const siteIds = Array.from(new Set(rows.map((r) => r.siteId).filter((v): v is number => v != null)));
    const siteNameById = new Map<number, string>();
    if (siteIds.length > 0) {
      const sitesRows = await db
        .select({ id: companySites.id, name: companySites.name })
        .from(companySites)
        .where(inArray(companySites.id, siteIds));
      for (const s of sitesRows) siteNameById.set(s.id, s.name);
    }
    const data = rows.map((r) => ({
      ...r,
      id: toId('asset', r.id),
      siteName: r.siteId != null ? siteNameById.get(r.siteId) ?? null : null,
    }));
    const total = countRow[0]?.value ?? 0;
    res.json(buildPageResponse(data, total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

// ─── GET /maintenance-data/categories?assetId= ──────────────────────────────

const categoriesQuerySchema = z.object({
  assetId: z.string().regex(/^asset-\d+$/, 'assetId debe tener formato asset-<n>'),
});

const BUILTIN_LABELS: Record<string, string> = {
  'Primordial:Bombas':  'Primordial: Bombas',
  'Primordial:Motores': 'Primordial: Motores',
  'Aceite:Cambio':      'Aceite: Cambio',
  'Aceite:Inventario':  'Aceite: Inventario',
  'Otro':               'Otro',
};

router.get('/categories', async (req, res, next) => {
  try {
    const parsed = categoriesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'assetId requerido (formato asset-<n>)');
    }
    const companyId = req.companyId!;
    const assetId = parseIdFlexible('asset', parsed.data.assetId);
    await assertAssetBelongsToCompany(assetId, companyId, parsed.data.assetId);

    // Conteo agrupado por categoría para este asset.
    const grouped = await db
      .select({
        category: companyMaintenanceRecords.category,
        count:    sql<number>`cast(count(*) as int)`,
      })
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.companyId, companyId),
        eq(companyMaintenanceRecords.assetId,   assetId),
      ))
      .groupBy(companyMaintenanceRecords.category);

    const byCategory = new Map<string, number>();
    for (const r of grouped) byCategory.set(r.category, r.count);

    // jul 2026 v9 — Conteo agrupado por sub-categoría. Lo usamos
    // para popular `count` en la lista de sub-categorías que
    // exponemos dentro de cada categoría custom.
    const groupedBySubcat = await db
      .select({
        subcategoryId: companyMaintenanceRecords.subcategoryId,
        count:         sql<number>`cast(count(*) as int)`,
      })
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.companyId, companyId),
        eq(companyMaintenanceRecords.assetId,   assetId),
      ))
      .groupBy(companyMaintenanceRecords.subcategoryId);
    const countBySubcat = new Map<number, number>();
    for (const r of groupedBySubcat) {
      if (r.subcategoryId != null) countBySubcat.set(r.subcategoryId, r.count);
    }

    // Custom: full catálogo de la empresa, con count del query agrupado.
    const customs = await db
      .select({
        id:         companyMaintenanceCategories.id,
        key:        companyMaintenanceCategories.key,
        label:      companyMaintenanceCategories.label,
        shortLabel: companyMaintenanceCategories.shortLabel,
        color:      companyMaintenanceCategories.color,
        icon:       companyMaintenanceCategories.icon,
        isSystem:   companyMaintenanceCategories.isSystem,
      })
      .from(companyMaintenanceCategories)
      .where(eq(companyMaintenanceCategories.companyId, companyId))
      .orderBy(asc(companyMaintenanceCategories.label));

    // jul 2026 v9 — Sub-categorías por categoría. Las cargamos
    // en una sola query y las agrupamos por `categoryId` para no
    // hacer N+1.
    const allSubs = await db
      .select({
        id:         companyMaintenanceSubcategories.id,
        categoryId: companyMaintenanceSubcategories.categoryId,
        key:        companyMaintenanceSubcategories.key,
        label:      companyMaintenanceSubcategories.label,
        shortLabel: companyMaintenanceSubcategories.shortLabel,
        color:      companyMaintenanceSubcategories.color,
        icon:       companyMaintenanceSubcategories.icon,
        order:      companyMaintenanceSubcategories.order,
      })
      .from(companyMaintenanceSubcategories)
      .where(eq(companyMaintenanceSubcategories.companyId, companyId))
      .orderBy(asc(companyMaintenanceSubcategories.order));
    const subsByCat = new Map<number, typeof allSubs>();
    for (const s of allSubs) {
      if (!subsByCat.has(s.categoryId)) subsByCat.set(s.categoryId, []);
      subsByCat.get(s.categoryId)!.push(s);
    }

    const customList = customs.map((c) => {
      const subs = subsByCat.get(c.id) ?? [];
      return {
        key:        c.key,
        label:      c.label,
        shortLabel: c.shortLabel,
        color:      c.color,
        icon:       c.icon,
        isSystem:   c.isSystem,
        isCustom:   true,
        count:      byCategory.get(c.key) ?? 0,
        // jul 2026 v9 — Sub-categorías anidadas. Si no tiene,
        // devolvemos array vacío. Si tiene, cada una con su
        // count propio.
        subcategories: subs.map((s) => ({
          id:         toId('maint-subcat', s.id),
          key:        s.key,
          label:      s.label,
          shortLabel: s.shortLabel,
          color:      s.color,
          icon:       s.icon,
          order:      s.order,
          count:      countBySubcat.get(s.id) ?? 0,
        })),
      };
    });

    // Built-in: solo las que tienen count>0.
    const builtins = grouped
      .filter((r) => !customs.some((c) => c.key === r.category))
      .map((r) => ({
        key:        r.category,
        label:      BUILTIN_LABELS[r.category] ?? r.category,
        shortLabel: null,
        color:      'slate',
        icon:       'wrench',
        isSystem:   true,
        isCustom:   false,
        count:      r.count,
        // jul 2026 v9 — Las categorías built-in no tienen
        // sub-categorías (son strings legacy del schema, no
        // filas en `company_maintenance_subcategories`).
        // Devolvemos array vacío explícito para que el front
        // pueda hacer `c.subcategories.length` sin romper.
        subcategories: [],
      }));

    // Orden: count desc (lo más usado arriba).
    const data = [...customList, ...builtins].sort((a, b) => b.count - a.count);
    res.json({ data, assetId: toId('asset', assetId) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /maintenance-data/last-maintenance?assetId=&category=&subcategoryId= ──
//
// jul 2026 v9 — Devuelve el ÚLTIMO mantenimiento de la placa
// (assetId) que matchea la categoría (y subcategoría opcional).
// Se usa en el flujo "Data" de Mantenimientos para mostrar SOLO
// el último registro de la (placa + cat) elegida, no una lista
// completa. El "último" se define por `completedAt` si está
// seteado (caso real de trabajo), sino por `scheduledFor`
// (caso del mantenimiento que aún no se cerró pero ya se
// programó). Si el user ya está en este punto significa que
// navegó desde una categoría con data, así que el WHERE siempre
// matchea al menos 1 fila.
const lastMaintenanceQuerySchema = z.object({
  assetId:  z.string().regex(/^asset-\d+$/, 'assetId debe tener formato asset-<n>'),
  category: z.string().min(1).max(60),
  // jul 2026 v9 — Sub-categoría opcional (maint-subcat-<n>). Si
  // viene, filtramos por FK. Si NO viene pero la categoría
  // padre tiene subs, devolvemos 0 resultados (el user debe
  // elegir una sub primero).
  subcategoryId: z.string().regex(/^maint-subcat-\d+$/).optional(),
});

router.get('/last-maintenance', async (req, res, next) => {
  try {
    const parsed = lastMaintenanceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'Parámetros inválidos: ' + parsed.error.message);
    }
    const { assetId: rawAssetId, category, subcategoryId: rawSubId } = parsed.data;
    const companyId = req.companyId!;
    const assetId = parseIdFlexible('asset', rawAssetId);
    await assertAssetBelongsToCompany(assetId, companyId, rawAssetId);

    // jul 2026 v9 — Fecha efectiva: COALESCE(completedAt, scheduledFor).
    // Si el mantenimiento está cerrado, usamos la fecha de cierre
    // (que es la fecha "real" de trabajo). Si todavía no se cerró,
    // usamos la fecha programada. Esto matchea lo que hicimos en el
    // Filtrado cascade.
    const effDate = sql`COALESCE(${companyMaintenanceRecords.completedAt}, ${companyMaintenanceRecords.scheduledFor})`;

    const conds = [
      eq(companyMaintenanceRecords.companyId, companyId),
      eq(companyMaintenanceRecords.assetId,   assetId),
      eq(companyMaintenanceRecords.category,  category),
    ];
    if (rawSubId) {
      conds.push(
        eq(companyMaintenanceRecords.subcategoryId, parseIdFlexible('maint-subcat', rawSubId)),
      );
    }
    const where = and(...conds);

    const [row] = await db
      .select({
        id:          companyMaintenanceRecords.id,
        scheduledFor: companyMaintenanceRecords.scheduledFor,
        completedAt: companyMaintenanceRecords.completedAt,
        type:        companyMaintenanceRecords.type,
        status:      companyMaintenanceRecords.status,
        title:       companyMaintenanceRecords.title,
        description: companyMaintenanceRecords.description,
        category:    companyMaintenanceRecords.category,
        categoryId:  companyMaintenanceRecords.categoryId,
        subcategoryId: companyMaintenanceRecords.subcategoryId,
        workshopId:  companyMaintenanceRecords.workshopId,
        workshopName: companyWorkshops.name,
        odometerKm:  companyMaintenanceRecords.odometerKm,
        totalCost:   companyMaintenanceRecords.totalCost,
        laborCost:   companyMaintenanceRecords.laborCost,
        ivaPercent:  companyMaintenanceRecords.ivaPercent,
        notes:       companyMaintenanceRecords.notes,
        attachments: companyMaintenanceRecords.attachments,
      })
      .from(companyMaintenanceRecords)
      .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
      .where(where)
      // jul 2026 v9 — "Último" = el más reciente por fecha efectiva.
      // Tiebreak por id desc por si hay dos con la misma fecha.
      .orderBy(desc(effDate), desc(companyMaintenanceRecords.id))
      .limit(1);

    if (!row) {
      res.json({ data: null });
      return;
    }

    // Resolvemos nombres legibles de FKs: categoría, sub-categoría,
    // taller, proveedor de cada item.
    const [cat] = row.categoryId != null
      ? await db
          .select({ label: companyMaintenanceCategories.label, key: companyMaintenanceCategories.key })
          .from(companyMaintenanceCategories)
          .where(eq(companyMaintenanceCategories.id, row.categoryId))
          .limit(1)
      : [];
    const [sub] = row.subcategoryId != null
      ? await db
          .select({
            label:       companyMaintenanceSubcategories.label,
            key:         companyMaintenanceSubcategories.key,
            color:       companyMaintenanceSubcategories.color,
          })
          .from(companyMaintenanceSubcategories)
          .where(eq(companyMaintenanceSubcategories.id, row.subcategoryId))
          .limit(1)
      : [];
    const workshopName = row.workshopName ?? null;

    // Items (repuestos) del mantenimiento. JOIN con supplier para
    // exponer el nombre legible.
    const items = await db
      .select({
        id:           companyMaintenanceItems.id,
        name:         companyMaintenanceItems.name,
        photoUrl:     companyMaintenanceItems.photoUrl,
        quantity:     companyMaintenanceItems.quantity,
        unitCost:     companyMaintenanceItems.unitCost,
        subtotal:     companyMaintenanceItems.subtotal,
        discountType: companyMaintenanceItems.discountType,
        discountValue: companyMaintenanceItems.discountValue,
        ivaPercent:   companyMaintenanceItems.ivaPercent,
        ivaAmount:    companyMaintenanceItems.ivaAmount,
        total:        companyMaintenanceItems.total,
        supplierId:   companyMaintenanceItems.supplierId,
        supplierName: companySuppliers.name,
      })
      .from(companyMaintenanceItems)
      .leftJoin(companySuppliers, eq(companySuppliers.id, companyMaintenanceItems.supplierId))
      .where(eq(companyMaintenanceItems.maintenanceId, row.id));

    res.json({
      data: {
        id:         toId('maintenance', row.id),
        title:      row.title,
        description: row.description,
        type:       row.type,
        status:     row.status,
        scheduledFor: row.scheduledFor,
        completedAt:  row.completedAt,
        odometerKm:   row.odometerKm,
        totalCost:    Number(row.totalCost  ?? 0),
        laborCost:    Number(row.laborCost  ?? 0),
        ivaPercent:   Number(row.ivaPercent ?? 0),
        notes:        row.notes,
        attachments:  Array.isArray(row.attachments) ? row.attachments : [],
        categoryKey:   row.category,
        categoryLabel: cat?.label ?? row.category,
        subcategoryKey:   sub?.key ?? null,
        subcategoryLabel: sub?.label ?? null,
        subcategoryColor: sub?.color ?? null,
        workshopName,
        items: items.map((it) => ({
          id:           toId('maintenance-item', it.id),
          name:         it.name,
          photoUrl:     it.photoUrl,
          quantity:     Number(it.quantity),
          unitCost:     Number(it.unitCost),
          subtotal:     Number(it.subtotal),
          discountType: it.discountType,
          discountValue: Number(it.discountValue ?? 0),
          ivaPercent:   Number(it.ivaPercent ?? 0),
          ivaAmount:    Number(it.ivaAmount ?? 0),
          total:        Number(it.total ?? 0),
          supplierId:   it.supplierId ? toId('supplier', it.supplierId) : null,
          supplierName: it.supplierName,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /maintenance-data/:moduleKey ───────────────────────────────────────

const detailQuerySchema = z.object({
  assetId:  z.string().regex(/^asset-\d+$/, 'assetId debe tener formato asset-<n>'),
  category: z.string().max(60).optional(),
  page:     z.string().optional(),
  pageSize: z.string().optional(),
});

// ── Mantenimientos ──────────────────────────────────────────────────────────

router.get('/mantenimiento', async (req, res, next) => {
  try {
    const parsed = detailQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'Parámetros inválidos: ' + parsed.error.message);
    }
    const { assetId: rawAssetId, category } = parsed.data;
    const companyId = req.companyId!;
    const assetId = parseIdFlexible('asset', rawAssetId);
    await assertAssetBelongsToCompany(assetId, companyId, rawAssetId);
    const { page, pageSize, offset } = parsePageParams(req.query, { pageSize: 20 });

    const conds = [
      eq(companyMaintenanceRecords.companyId, companyId),
      eq(companyMaintenanceRecords.assetId,   assetId),
    ];
    if (category && category.trim()) {
      conds.push(eq(companyMaintenanceRecords.category, category));
    }
    const where = and(...conds);

    const [rows, countRow, totalsRow] = await Promise.all([
      db
        .select({
          id:          companyMaintenanceRecords.id,
          date:        companyMaintenanceRecords.scheduledFor,
          completedAt: companyMaintenanceRecords.completedAt,
          type:        companyMaintenanceRecords.type,
          status:      companyMaintenanceRecords.status,
          title:       companyMaintenanceRecords.title,
          category:    companyMaintenanceRecords.category,
          totalCost:   companyMaintenanceRecords.totalCost,
          laborCost:   companyMaintenanceRecords.laborCost,
          ivaPercent:  companyMaintenanceRecords.ivaPercent,
          odometerKm:  companyMaintenanceRecords.odometerKm,
        })
        .from(companyMaintenanceRecords)
        .where(where)
        .orderBy(desc(companyMaintenanceRecords.scheduledFor))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(companyMaintenanceRecords)
        .where(where),
      db
        .select({
          total: sql<string>`coalesce(sum(${companyMaintenanceRecords.totalCost}), 0)::text`,
          labor: sql<string>`coalesce(sum(${companyMaintenanceRecords.laborCost}), 0)::text`,
        })
        .from(companyMaintenanceRecords)
        .where(where),
    ]);

    const total = countRow[0]?.value ?? 0;
    const data = rows.map((r) => ({
      ...r,
      id:         toId('maintenance', r.id),
      totalCost:  Number(r.totalCost ?? 0),
      laborCost:  Number(r.laborCost ?? 0),
      ivaPercent: Number(r.ivaPercent ?? 0),
      odometerKm: r.odometerKm ?? null,
    }));
    const totalCost  = Number(totalsRow[0]?.total ?? 0);
    const totalLabor = Number(totalsRow[0]?.labor ?? 0);
    const paged = buildPageResponse(data, total, page, pageSize);
    res.json({
      ...paged,
      summary: {
        totalCost,
        totalLabor,
        // totalParts ≈ totalCost - totalLabor. El front lo muestra como
        // desglose: mano de obra + repuestos. NO descuenta IVA — el IVA
        // se ve por fila.
        totalParts: Math.max(0, totalCost - totalLabor),
        count:      total,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Combustible ─────────────────────────────────────────────────────────────

router.get('/combustible', async (req, res, next) => {
  try {
    const parsed = detailQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'Parámetros inválidos: ' + parsed.error.message);
    }
    const companyId = req.companyId!;
    const assetId = parseIdFlexible('asset', parsed.data.assetId);
    await assertAssetBelongsToCompany(assetId, companyId, parsed.data.assetId);
    const { page, pageSize, offset } = parsePageParams(req.query, { pageSize: 20 });

    const where = and(
      eq(companyFuelEntries.companyId, companyId),
      eq(companyFuelEntries.assetId,   assetId),
    );

    const [rows, countRow, totalsRow] = await Promise.all([
      db
        .select({
          id:            companyFuelEntries.id,
          date:          companyFuelEntries.date,
          gallons:       companyFuelEntries.gallons,
          liters:        companyFuelEntries.liters,
          cost:          companyFuelEntries.cost,
          odometer:      companyFuelEntries.odometer,
          station:       companyFuelEntries.station,
          fuelType:      companyFuelEntries.fuelType,
          invoiceNumber: companyFuelEntries.invoiceNumber,
        })
        .from(companyFuelEntries)
        .where(where)
        .orderBy(desc(companyFuelEntries.date))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(companyFuelEntries)
        .where(where),
      db
        .select({
          total:   sql<string>`coalesce(sum(${companyFuelEntries.cost}), 0)::text`,
          gallons: sql<string>`coalesce(sum(${companyFuelEntries.gallons}), 0)::text`,
          liters:  sql<string>`coalesce(sum(${companyFuelEntries.liters}), 0)::text`,
        })
        .from(companyFuelEntries)
        .where(where),
    ]);

    const total = countRow[0]?.value ?? 0;
    const data = rows.map((r) => ({
      ...r,
      id:       toId('fuel', r.id),
      cost:     r.cost !== null ? Number(r.cost) : null,
      gallons:  Number(r.gallons ?? 0),
      liters:   Number(r.liters ?? 0),
      odometer: r.odometer !== null ? Number(r.odometer) : null,
    }));
    const paged = buildPageResponse(data, total, page, pageSize);
    res.json({
      ...paged,
      summary: {
        totalCost:    Number(totalsRow[0]?.total ?? 0),
        totalGallons: Number(totalsRow[0]?.gallons ?? 0),
        totalLiters:  Number(totalsRow[0]?.liters ?? 0),
        count:        total,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Peajes ──────────────────────────────────────────────────────────────────

router.get('/peajes', async (req, res, next) => {
  try {
    const parsed = detailQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'Parámetros inválidos: ' + parsed.error.message);
    }
    const companyId = req.companyId!;
    const assetId = parseIdFlexible('asset', parsed.data.assetId);
    await assertAssetBelongsToCompany(assetId, companyId, parsed.data.assetId);
    const { page, pageSize, offset } = parsePageParams(req.query, { pageSize: 20 });

    const where = and(
      eq(companyTollEntries.companyId, companyId),
      eq(companyTollEntries.assetId,   assetId),
    );

    const [rows, countRow, totalsRow] = await Promise.all([
      db
        .select({
          id:            companyTollEntries.id,
          date:          companyTollEntries.date,
          tollName:      companyTollEntries.tollName,
          category:      companyTollEntries.category,
          amount:        companyTollEntries.amount,
          paymentMethod: companyTollEntries.paymentMethod,
          route:         companyTollEntries.route,
          odometer:      companyTollEntries.odometer,
          invoiceNumber: companyTollEntries.invoiceNumber,
        })
        .from(companyTollEntries)
        .where(where)
        .orderBy(desc(companyTollEntries.date))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(companyTollEntries)
        .where(where),
      db
        .select({ total: sql<string>`coalesce(sum(${companyTollEntries.amount}), 0)::text` })
        .from(companyTollEntries)
        .where(where),
    ]);

    const total = countRow[0]?.value ?? 0;
    const data = rows.map((r) => ({
      ...r,
      id:       toId('toll', r.id),
      amount:   Number(r.amount ?? 0),
      odometer: r.odometer !== null ? Number(r.odometer) : null,
    }));
    const paged = buildPageResponse(data, total, page, pageSize);
    res.json({
      ...paged,
      summary: {
        totalAmount: Number(totalsRow[0]?.total ?? 0),
        count:       total,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Checklists ──────────────────────────────────────────────────────────────

router.get('/checklist', async (req, res, next) => {
  try {
    const parsed = detailQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'Parámetros inválidos: ' + parsed.error.message);
    }
    const companyId = req.companyId!;
    const assetId = parseIdFlexible('asset', parsed.data.assetId);
    await assertAssetBelongsToCompany(assetId, companyId, parsed.data.assetId);
    const { page, pageSize, offset } = parsePageParams(req.query, { pageSize: 20 });

    const where = and(
      eq(companyChecklists.companyId, companyId),
      eq(companyChecklists.assetId,   assetId),
    );

    const [rows, countRow, totalsRow] = await Promise.all([
      db
        .select({
          id:           companyChecklists.id,
          date:         companyChecklists.date,
          status:       companyChecklists.status,
          summary:      companyChecklists.summary,
          targetLabel:  companyChecklists.targetLabel,
          categoryName: companyChecklistCategories.name,
        })
        .from(companyChecklists)
        .leftJoin(
          companyChecklistCategories,
          eq(companyChecklistCategories.id, companyChecklists.categoryId),
        )
        .where(where)
        .orderBy(desc(companyChecklists.date))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(companyChecklists)
        .where(where),
      db
        .select({
          total:     sql<number>`cast(count(*) as int)`,
          anomalies: sql<number>`cast(sum(case when ${companyChecklists.status} ilike 'anomalia%' or ${companyChecklists.status} ilike 'rechaz%' then 1 else 0 end) as int)`,
        })
        .from(companyChecklists)
        .where(where),
    ]);

    const total = countRow[0]?.value ?? 0;
    const data = rows.map((r) => ({
      ...r,
      id:           toId('checklist', r.id),
      categoryName: r.categoryName ?? r.targetLabel ?? null,
    }));
    const paged = buildPageResponse(data, total, page, pageSize);
    res.json({
      ...paged,
      summary: {
        count:     total,
        anomalies: totalsRow[0]?.anomalies ?? 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Alertas ─────────────────────────────────────────────────────────────────

router.get('/alertas', async (req, res, next) => {
  try {
    const parsed = detailQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'Parámetros inválidos: ' + parsed.error.message);
    }
    const companyId = req.companyId!;
    const assetId = parseIdFlexible('asset', parsed.data.assetId);
    await assertAssetBelongsToCompany(assetId, companyId, parsed.data.assetId);
    const { page, pageSize, offset } = parsePageParams(req.query, { pageSize: 20 });

    const where = and(
      eq(companyAlerts.companyId, companyId),
      eq(companyAlerts.assetId,   assetId),
    );

    const [rows, countRow, totalsRow] = await Promise.all([
      db
        .select({
          id:       companyAlerts.id,
          date:     companyAlerts.createdAt,
          title:    companyAlerts.title,
          type:     companyAlerts.type,
          severity: companyAlerts.severity,
          status:   companyAlerts.status,
          dueDate:  companyAlerts.dueDate,
        })
        .from(companyAlerts)
        .where(where)
        .orderBy(desc(companyAlerts.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(companyAlerts)
        .where(where),
      db
        .select({
          total:  sql<number>`cast(count(*) as int)`,
          open:   sql<number>`cast(sum(case when ${companyAlerts.status} = 'Abierta' then 1 else 0 end) as int)`,
          closed: sql<number>`cast(sum(case when ${companyAlerts.status} = 'Cerrada' then 1 else 0 end) as int)`,
          high:   sql<number>`cast(sum(case when ${companyAlerts.severity} in ('Alta', 'Critica') then 1 else 0 end) as int)`,
        })
        .from(companyAlerts)
        .where(where),
    ]);

    const total = countRow[0]?.value ?? 0;
    const data = rows.map((r) => ({ ...r, id: toId('alert', r.id) }));
    const paged = buildPageResponse(data, total, page, pageSize);
    res.json({
      ...paged,
      summary: {
        count:  total,
        open:   totalsRow[0]?.open ?? 0,
        closed: totalsRow[0]?.closed ?? 0,
        high:   totalsRow[0]?.high ?? 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
