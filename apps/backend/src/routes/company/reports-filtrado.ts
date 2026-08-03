import { Router } from 'express';
import { eq, and, gte, lte, sql, inArray, asc, isNotNull } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyAssets,
  companyMaintenanceRecords,
  companyMaintenanceItems,
  companyMaintenanceCategories,
  companyMaintenanceSubcategories,
  companyChecklists,
  companyChecklistCategories,
  companyFuelEntries,
  companyTollEntries,
  companySuppliers,
  companyWorkshops,
  companyInvoices,
} from '../../db/schema/operational';
import { requirePermission } from '../../middlewares/requirePermission';
import { parseIdFlexible, toId } from '../../lib/ids';

const router = Router({ mergeParams: true });

type ModuloKey = 'combustible' | 'peajes' | 'mantenimiento' | 'checklist';

const MODULOS_CON_CATEGORIA: ModuloKey[] = ['mantenimiento', 'checklist'];

const MODULO_PERM: Record<ModuloKey, [modulo: string, submódulo: string, accion: string]> = {
  combustible:  ['combustible',   'registros', 'ver'],
  peajes:       ['combustible',   'peajes',    'ver'],
  mantenimiento:['mantenimiento', 'records',   'ver'],
  checklist:    ['checklist',     'lista',     'ver'],
};

const MODULO_LABEL: Record<ModuloKey, string> = {
  combustible:   'Combustible',
  peajes:        'Peajes',
  mantenimiento: 'Mantenimientos',
  checklist:     'Checklist',
};

const MODULO_DATE_COL: Record<ModuloKey, any> = {
  combustible:   companyFuelEntries.date,
  peajes:        companyTollEntries.date,
  mantenimiento: companyMaintenanceRecords.scheduledFor,
  checklist:     companyChecklists.date,
};

const MODULO_TABLE: Record<ModuloKey, any> = {
  combustible:   companyFuelEntries,
  peajes:        companyTollEntries,
  mantenimiento: companyMaintenanceRecords,
  checklist:     companyChecklists,
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nextDayYmd(dateYmd: string): string {
  const d = new Date(`${dateYmd}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return toYmd(d);
}

const HAS_DUAL_DATE: ReadonlyArray<ModuloKey> = ['mantenimiento'];

function dateRangeExpr(
  moduleKey: ModuloKey,
  startYmd: string,
  endExclusiveYmd: string,
) {
  const dateCol = MODULO_DATE_COL[moduleKey];
  if (HAS_DUAL_DATE.includes(moduleKey)) {
    
    
    return sql`(
      (${dateCol} >= ${startYmd}::date AND ${dateCol} < ${endExclusiveYmd}::date)
      OR
      (${companyMaintenanceRecords.completedAt} IS NOT NULL
       AND ${companyMaintenanceRecords.completedAt} >= ${startYmd}::date
       AND ${companyMaintenanceRecords.completedAt} < ${endExclusiveYmd}::date)
    )`;
  }
  return sql`(${dateCol} >= ${startYmd}::date AND ${dateCol} < ${endExclusiveYmd}::date)`;
}

function isNotNullEffectiveDate(moduleKey: ModuloKey) {
  const dateCol = MODULO_DATE_COL[moduleKey];
  if (HAS_DUAL_DATE.includes(moduleKey)) {
    return sql`(${dateCol} IS NOT NULL OR ${companyMaintenanceRecords.completedAt} IS NOT NULL)`;
  }
  return isNotNull(dateCol);
}

function effectiveDateExpr(moduleKey: ModuloKey) {
  const dateCol = MODULO_DATE_COL[moduleKey];
  if (HAS_DUAL_DATE.includes(moduleKey)) {
    return sql`COALESCE(${dateCol}::date, ${companyMaintenanceRecords.completedAt}::date)`;
  }
  return sql`${dateCol}::date`;
}

function weeksOfMonth(year: number, month1to12: number): Array<{ from: string; to: string; label: string }> {
  const lastDay = new Date(year, month1to12, 0).getDate();
  const out: Array<{ from: string; to: string; label: string }> = [];
  const ranges: Array<[number, number, string]> = [
    [1,   7,   "Sem 1-7"],
    [8,   15,  "Sem 8-15"],
    [16,  23,  "Sem 16-23"],
    [24,  lastDay, `Sem 24-${lastDay}`],
  ];
  for (const [d1, d2, label] of ranges) {
    out.push({
      from: toYmd(new Date(year, month1to12 - 1, d1)),
      to:   toYmd(new Date(year, month1to12 - 1, d2 + 1)), 
      label,
    });
  }
  return out;
}

function weekRange(year: number, month1to12: number, weekIdx: number): { from: string; to: string } | null {
  const all = weeksOfMonth(year, month1to12);
  return all[weekIdx] ? { from: all[weekIdx].from, to: all[weekIdx].to } : null;
}

router.get(
  '/cascade',
  requirePermission('reportes', 'filtrado', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const vehicleId = req.query.vehicleId ? Number(req.query.vehicleId) : null;
      const moduleKey = (req.query.module as ModuloKey | undefined) ?? null;
      
      
      
      const rawCategoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
      const categoryId = rawCategoryId != null && rawCategoryId > 0 ? rawCategoryId : null;
      const categoryKey = (req.query.categoryKey as string | undefined) ?? null;
      
      
      
      
      const rawSubcategoryId = req.query.subcategoryId ? Number(req.query.subcategoryId) : null;
      const subcategoryId = rawSubcategoryId != null && rawSubcategoryId > 0 ? rawSubcategoryId : null;
      const subcategoryKey = (req.query.subcategoryKey as string | undefined) ?? null;
      const year = req.query.year ? Number(req.query.year) : null;
      const month = req.query.month ? Number(req.query.month) : null;
      const week = req.query.week != null && req.query.week !== ""
        ? Number(req.query.week) : null;

      if (!vehicleId) {
        const rows = await db
          .select({ id: companyAssets.id, plate: companyAssets.plate, name: companyAssets.name })
          .from(companyAssets)
          .where(eq(companyAssets.companyId, companyId))
          .orderBy(asc(companyAssets.plate));
        return res.json({
          level: "vehicles",
          items: rows.map((r) => ({ id: r.id, label: r.plate, secondary: r.name })),
        });
      }

      
      
      
      
      
      
      
      
      
      if (!moduleKey) {
        const checks: Array<{ key: ModuloKey; count: number }> = [];

        const f = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(companyFuelEntries)
          .where(and(
            eq(companyFuelEntries.companyId, companyId),
            eq(companyFuelEntries.assetId, vehicleId),
            isNotNull(companyFuelEntries.date),
          ));
        checks.push({ key: 'combustible', count: f[0]?.c ?? 0 });

        const t = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(companyTollEntries)
          .where(and(
            eq(companyTollEntries.companyId, companyId),
            eq(companyTollEntries.assetId, vehicleId),
            isNotNull(companyTollEntries.date),
          ));
        checks.push({ key: 'peajes', count: t[0]?.c ?? 0 });

        const m = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(companyMaintenanceRecords)
          .where(and(
            eq(companyMaintenanceRecords.companyId, companyId),
            eq(companyMaintenanceRecords.assetId, vehicleId),
            
            
            
            
            isNotNullEffectiveDate('mantenimiento'),
          ));
        checks.push({ key: 'mantenimiento', count: m[0]?.c ?? 0 });

        const c = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(companyChecklists)
          .where(and(
            eq(companyChecklists.companyId, companyId),
            eq(companyChecklists.assetId, vehicleId),
            isNotNull(companyChecklists.date),
          ));
        checks.push({ key: 'checklist', count: c[0]?.c ?? 0 });

        return res.json({
          level: "modules",
          items: checks
            .filter((x) => x.count > 0)
            .map((x) => ({ key: x.key, label: MODULO_LABEL[x.key], count: x.count })),
        });
      }

      
      if (!categoryId && MODULOS_CON_CATEGORIA.includes(moduleKey)) {
        if (moduleKey === 'mantenimiento') {
          
          
          
          
          
          
          
          
          
          
          
          
          
          
          
          
          
          
          const cats = await db
            .select({
              id: companyMaintenanceCategories.id,
              label: companyMaintenanceCategories.label,
              key: companyMaintenanceCategories.key,
            })
            .from(companyMaintenanceCategories)
            .where(eq(companyMaintenanceCategories.companyId, companyId))
            .orderBy(asc(companyMaintenanceCategories.label));

          const allMaints = await db
            .select({
              id: companyMaintenanceRecords.categoryId,
              str: companyMaintenanceRecords.category,
            })
            .from(companyMaintenanceRecords)
            .where(and(
              eq(companyMaintenanceRecords.companyId, companyId),
              eq(companyMaintenanceRecords.assetId, vehicleId),
              
              
              
              isNotNullEffectiveDate('mantenimiento'),
            ));

          const usedIds = new Set(
            allMaints.map((u) => u.id).filter((v): v is number => v != null)
          );
          const usedStrings = new Set(
            allMaints.map((u) => u.str).filter((v): v is string => v != null && v.length > 0)
          );

          
          
          
          
          
          
          
          
          
          
          
          
          
          
          const catsWithSubs = await db
            .selectDistinct({ categoryId: companyMaintenanceSubcategories.categoryId })
            .from(companyMaintenanceSubcategories)
            .where(eq(companyMaintenanceSubcategories.companyId, companyId));
          const catHasSubs = new Set<number>(
            catsWithSubs.map((r) => r.categoryId).filter((v): v is number => v != null)
          );

          
          const matchedFromCatalog: Array<{ id: number; label: string; key: string }> = [];
          const matchedKeys = new Set<string>();
          for (const c of cats) {
            if (
              usedIds.has(c.id) ||
              usedStrings.has(c.key) ||
              usedStrings.has(c.label)
            ) {
              matchedFromCatalog.push(c);
              matchedKeys.add(c.key);
              matchedKeys.add(c.label);
            }
          }

          
          
          
          
          
          
          
          
          
          
          
          
          
          
          
          
          
          
          
          
          
          
          

          
          const orphanStrings = Array.from(usedStrings).filter(
            (s) => !matchedKeys.has(s),
          );

          const items: Array<{ id: number; label: string; key: string; hasSubcategories: boolean; orphan?: boolean }> = [
            ...matchedFromCatalog.map((c) => ({
              id: c.id,
              label: c.label,
              key: c.key,
              
              
              
              
              hasSubcategories: catHasSubs.has(c.id),
            })),
            ...orphanStrings.map((s, i) => ({
              
              
              
              
              
              id: -(i + 1),
              label: s,
              key: s,
              hasSubcategories: false,
              orphan: true,
            })),
          ];

          return res.json({ level: "categories", items });
        }
        if (moduleKey === 'checklist') {
          const cats = await db
            .select({
              id: companyChecklistCategories.id,
              label: companyChecklistCategories.name,
            })
            .from(companyChecklistCategories)
            .where(eq(companyChecklistCategories.companyId, companyId))
            .orderBy(asc(companyChecklistCategories.name));

          
          
          
          
          
          
          
          const usedByFk = await db
            .select({ id: companyChecklists.categoryId })
            .from(companyChecklists)
            .where(and(
              eq(companyChecklists.companyId, companyId),
              eq(companyChecklists.assetId, vehicleId),
              isNotNull(companyChecklists.date),
            ));
          const usedIds = new Set(
            usedByFk.map((u) => u.id).filter((v): v is number => v != null)
          );
          const items = cats.filter((c) => usedIds.has(c.id));
          return res.json({ level: "categories", items: items.map((c) => ({ id: c.id, label: c.label })) });
        }
      }

      
      
      
      
      
      
      
      
      
      
      
      
      
      let categoryStringFilter: string | null = null;
      if (categoryId) {
        
        
        
        if (moduleKey === 'mantenimiento') {
          const [cat] = await db
            .select({ key: companyMaintenanceCategories.key, label: companyMaintenanceCategories.label })
            .from(companyMaintenanceCategories)
            .where(and(
              eq(companyMaintenanceCategories.id, categoryId),
              eq(companyMaintenanceCategories.companyId, companyId),
            ))
            .limit(1);
          if (cat) {
            
            
            categoryStringFilter = cat.key;
          }
        } else if (moduleKey === 'checklist') {
          const [cat] = await db
            .select({ name: companyChecklistCategories.name })
            .from(companyChecklistCategories)
            .where(and(
              eq(companyChecklistCategories.id, categoryId),
              eq(companyChecklistCategories.companyId, companyId),
            ))
            .limit(1);
          if (cat) categoryStringFilter = cat.name;
        }
      } else if (categoryKey) {
        categoryStringFilter = categoryKey;
      }

      
      
      
      
      
      
      
      const MODULOS_CON_CATEGORIA_STRING: ModuloKey[] = ['mantenimiento'];

      const pushCategoryFilter = (conds: any[]) => {
        if (!categoryId && !categoryStringFilter && !subcategoryId) return;
        
        
        
        
        
        
        
        
        const isRealCategoryId = categoryId != null && categoryId > 0;
        const ors: any[] = [];
        if (isRealCategoryId) {
          ors.push(eq(MODULO_TABLE[moduleKey].categoryId, categoryId));
        }
        
        
        
        
        
        
        
        if (
          categoryStringFilter &&
          MODULOS_CON_CATEGORIA_STRING.includes(moduleKey)
        ) {
          ors.push(eq(MODULO_TABLE[moduleKey].category, categoryStringFilter));
        }
        if (ors.length === 1) conds.push(ors[0]);
        else if (ors.length > 1) {
          
          
          
          
          conds.push(sql`(${sql.join(ors, sql` OR `)})`);
        }
        
        
        
        
        if (subcategoryId) {
          conds.push(eq(MODULO_TABLE[moduleKey].subcategoryId, subcategoryId));
        }
      };

      
      
      
      
      
      
      
      
      
      
      
      
      
      if (moduleKey === 'mantenimiento' && !subcategoryId) {
        
        
        
        
        
        
        
        
        
        let hasAnySub = false;
        if (categoryId != null && categoryId > 0) {
          const subParent = categoryId;
          const probe = await db
            .select({ c: sql<number>`count(*)::int` })
            .from(companyMaintenanceSubcategories)
            .where(and(
              eq(companyMaintenanceSubcategories.companyId, companyId),
              eq(companyMaintenanceSubcategories.categoryId, subParent),
            ));
          hasAnySub = (probe[0]?.c ?? 0) > 0;
        }
        if (hasAnySub) {
          
          
          
          
          
          const subParent = categoryId!;
          const subs = await db
            .select({
              id:         companyMaintenanceSubcategories.id,
              key:        companyMaintenanceSubcategories.key,
              label:      companyMaintenanceSubcategories.label,
              shortLabel: companyMaintenanceSubcategories.shortLabel,
              count:      sql<number>`cast(count(${companyMaintenanceRecords.id}) as int)`,
            })
            .from(companyMaintenanceSubcategories)
            .leftJoin(
              companyMaintenanceRecords,
              and(
                eq(companyMaintenanceRecords.subcategoryId, companyMaintenanceSubcategories.id),
                eq(companyMaintenanceRecords.companyId, companyId),
                eq(companyMaintenanceRecords.assetId, vehicleId),
                eq(companyMaintenanceRecords.categoryId, companyMaintenanceSubcategories.categoryId),
              ),
            )
            .where(and(
              eq(companyMaintenanceSubcategories.companyId, companyId),
              eq(companyMaintenanceSubcategories.categoryId, subParent),
            ))
            .groupBy(companyMaintenanceSubcategories.id)
            .orderBy(asc(companyMaintenanceSubcategories.order));

          return res.json({
            level: "subcategories",
            items: subs.map((s) => ({
              id: s.id,
              label: s.label,
              key: s.key,
              shortLabel: s.shortLabel,
              count: Number(s.count) ?? 0,
            })),
          });
        }
        
        
      }

      
      
      
      
      
      
      
      if (!year) {
        const dateCol = MODULO_DATE_COL[moduleKey];
        const tbl = MODULO_TABLE[moduleKey];
        const conds: any[] = [
          eq(tbl.companyId, companyId),
          eq(tbl.assetId, vehicleId),
          
          
          
          isNotNullEffectiveDate(moduleKey),
        ];
        if (moduleKey === 'mantenimiento' || moduleKey === 'checklist') {
          pushCategoryFilter(conds);
        }

        
        
        
        
        
        const effDate = effectiveDateExpr(moduleKey);
        const rows = await db
          .select({ y: sql<number>`extract(year from ${effDate})::int` })
          .from(tbl)
          .where(and(...conds))
          .groupBy(sql`extract(year from ${effDate})`)
          .orderBy(asc(sql`extract(year from ${effDate})`));

        return res.json({
          level: "years",
          items: rows.map((r) => ({ value: r.y, label: String(r.y) })),
        });
      }

      
      
      
      
      
      
      if (!month) {
        const dateCol = MODULO_DATE_COL[moduleKey];
        const tbl = MODULO_TABLE[moduleKey];
        const start = `${year}-01-01`;
        const end   = `${year + 1}-01-01`;
        const conds: any[] = [
          eq(tbl.companyId, companyId),
          eq(tbl.assetId, vehicleId),
          
          
          dateRangeExpr(moduleKey, start, end),
        ];
        if (moduleKey === 'mantenimiento' || moduleKey === 'checklist') {
          pushCategoryFilter(conds);
        }
        const effDate = effectiveDateExpr(moduleKey);
        const rows = await db
          .select({ m: sql<number>`extract(month from ${effDate})::int` })
          .from(tbl)
          .where(and(...conds))
          .groupBy(sql`extract(month from ${effDate})`)
          .orderBy(asc(sql`extract(month from ${effDate})`));
        return res.json({
          level: "months",
          items: rows.map((r) => ({
            value: r.m,
            label: new Date(year, r.m - 1, 1).toLocaleString("es", { month: "long" }),
          })),
        });
      }

      if (week === null) {
        const dateCol = MODULO_DATE_COL[moduleKey];
        const tbl = MODULO_TABLE[moduleKey];
        const start = `${year}-${String(month).padStart(2, "0")}-01`;
        const end   = (() => {
          const next = month === 12 ? 1 : month + 1;
          const yNext = month === 12 ? year + 1 : year;
          return `${yNext}-${String(next).padStart(2, "0")}-01`;
        })();
        const conds: any[] = [
          eq(tbl.companyId, companyId),
          eq(tbl.assetId, vehicleId),
          
          dateRangeExpr(moduleKey, start, end),
        ];
        if (moduleKey === 'mantenimiento' || moduleKey === 'checklist') {
          pushCategoryFilter(conds);
        }
        const effDate = effectiveDateExpr(moduleKey);
        const rows = await db
          .select({ d: sql<string>`${effDate}::text` })
          .from(tbl)
          .where(and(...conds));
        const daySet = new Set<number>();
        for (const r of rows) {
          const s = String(r.d);
          
          const dd = Number(s.slice(8, 10));
          daySet.add(dd);
        }
        const all = weeksOfMonth(year, month);
        const items = all
          .map((w, i) => {
            const [d1, d2] = w.label.match(/\d+/g)!.map(Number);
            const has = Array.from(daySet).some((d) => d >= d1 && d <= d2);
            return has ? { value: i, label: w.label } : null;
          })
          .filter(Boolean) as Array<{ value: number; label: string }>;
        return res.json({ level: "weeks", items });
      }

      
      {
        const range = weekRange(year, month, week);
        if (!range) return res.json({ level: "days", items: [] });

        const dateCol = MODULO_DATE_COL[moduleKey];
        const tbl = MODULO_TABLE[moduleKey];
        const conds: any[] = [
          eq(tbl.companyId, companyId),
          eq(tbl.assetId, vehicleId),
          
          dateRangeExpr(moduleKey, range.from, range.to),
        ];
        if (moduleKey === 'mantenimiento' || moduleKey === 'checklist') {
          pushCategoryFilter(conds);
        }
        
        
        
        
        
        const effDate = effectiveDateExpr(moduleKey);
        const rows = await db
          .select({ d: sql<string>`${effDate}::text` })
          .from(tbl)
          .where(and(...conds))
          .orderBy(asc(effDate));
        const seen = new Set<string>();
        const items: Array<{ value: string; label: string }> = [];
        for (const r of rows) {
          const v = String(r.d).slice(0, 10);
          if (seen.has(v)) continue;
          seen.add(v);
          const d = new Date(v + "T00:00:00");
          items.push({
            value: v,
            label: d.toLocaleDateString("es", { day: "2-digit", month: "short" }),
          });
        }
        return res.json({ level: "days", items });
      }
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/details',
  requirePermission('reportes', 'filtrado', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const vehicleId = Number(req.query.vehicleId);
      const moduleKey = req.query.module as ModuloKey;
      const date = String(req.query.date ?? "");
      const page     = req.query.page     ? Math.max(1, Number(req.query.page))     : 1;
      const pageSize = req.query.pageSize ? Math.min(100, Math.max(1, Number(req.query.pageSize))) : 20;
      const rawCategoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
      const categoryId = rawCategoryId != null && rawCategoryId > 0 ? rawCategoryId : null;
      const categoryKey = (req.query.categoryKey as string | undefined) ?? null;
      const rawSubcategoryId = req.query.subcategoryId ? Number(req.query.subcategoryId) : null;
      const subcategoryId = rawSubcategoryId != null && rawSubcategoryId > 0 ? rawSubcategoryId : null;
      const subcategoryKey = (req.query.subcategoryKey as string | undefined) ?? null;

      if (!vehicleId || !moduleKey || !date) {
        return res.status(400).json({ error: "vehicleId, module y date son requeridos" });
      }

      
      
      
      
      
      
      
      
      
      
      if (moduleKey === 'mantenimiento') {
        
        
        
        
        
        
        
        
        
        
        
        
        const conds: any[] = [
          eq(companyMaintenanceRecords.companyId, companyId),
          eq(companyMaintenanceRecords.assetId, vehicleId),
          eq(companyMaintenanceRecords.status, 'Completado'),
          dateRangeExpr('mantenimiento', date, nextDayYmd(date)),
        ];
        if (categoryId) conds.push(eq(companyMaintenanceRecords.categoryId, categoryId));
        if (categoryKey) conds.push(eq(companyMaintenanceRecords.category, categoryKey));
        
        
        if (subcategoryId) conds.push(eq(companyMaintenanceRecords.subcategoryId, subcategoryId));
        
        
        
        
        const offset = (page - 1) * pageSize;
        const [totalRow] = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(companyMaintenanceRecords)
          .where(and(...conds));
        const total = totalRow?.c ?? 0;
        const records = await db
          .select({
            m: companyMaintenanceRecords,
            workshopName: companyWorkshops.name,
            categoryLabel: companyMaintenanceCategories.label,
            categoryKey:   companyMaintenanceCategories.key,
          })
          .from(companyMaintenanceRecords)
          .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
          .leftJoin(companyMaintenanceCategories, eq(companyMaintenanceCategories.id, companyMaintenanceRecords.categoryId))
          .where(and(...conds))
          .orderBy(asc(companyMaintenanceRecords.scheduledFor))
          .limit(pageSize)
          .offset(offset);

        const ids = records.map((r) => r.m.id);
        const itemsMap = new Map<number, any[]>();
        if (ids.length) {
          
          
          
          
          
          
          
          
          
          const items = await db
            .select({
              id: companyMaintenanceItems.id,
              maintenanceId: companyMaintenanceItems.maintenanceId,
              name: companyMaintenanceItems.name,
              photoUrl: companyMaintenanceItems.photoUrl,
              quantity: companyMaintenanceItems.quantity,
              unitCost: companyMaintenanceItems.unitCost,
              
              
              
              
              
              discountType:  companyMaintenanceItems.discountType,
              discountValue: companyMaintenanceItems.discountValue,
              subtotal:      companyMaintenanceItems.subtotal,
              ivaPercent:    companyMaintenanceItems.ivaPercent,
              ivaAmount:     companyMaintenanceItems.ivaAmount,
              supplierName:  companySuppliers.name,
            })
            .from(companyMaintenanceItems)
            .leftJoin(companySuppliers, eq(companySuppliers.id, companyMaintenanceItems.supplierId))
            .where(inArray(companyMaintenanceItems.maintenanceId, ids));
          for (const it of items) {
            if (!itemsMap.has(it.maintenanceId)) itemsMap.set(it.maintenanceId, []);
            const sub = Number(it.subtotal);
            const iva = Number(it.ivaAmount);
            const total = sub + iva;
            itemsMap.get(it.maintenanceId)!.push({
              id: toId('maintenance-item', it.id),
              name: it.name,
              supplierName: it.supplierName,
              quantity: Number(it.quantity),
              unitCost: Number(it.unitCost),
              discountType:  it.discountType,
              discountValue: Number(it.discountValue),
              subtotal: sub,
              ivaPercent:    Number(it.ivaPercent),
              ivaAmount:     iva,
              total,
              photoUrl: it.photoUrl,
            });
          }
        }

        
        
        
        
        
        const invoicesMap = new Map<number, any[]>();
        if (ids.length) {
          const invoiceRows = await db
            .select({
              id: companyInvoices.id,
              sourceEntityId: companyInvoices.sourceEntityId,
              kind: companyInvoices.kind,
              invoiceNumber: companyInvoices.invoiceNumber,
              invoiceDate: companyInvoices.invoiceDate,
              total: companyInvoices.total,
              supplierName: companyInvoices.supplierName,
              workshopName: companyInvoices.workshopName,
              fileUrl: companyInvoices.fileUrl,
              fileMimeType: companyInvoices.fileMimeType,
            })
            .from(companyInvoices)
            .where(and(
              eq(companyInvoices.companyId, companyId),
              eq(companyInvoices.sourceModule, 'mantenimiento'),
              inArray(companyInvoices.sourceEntityId, ids),
            ));
          for (const inv of invoiceRows) {
            if (!invoicesMap.has(inv.sourceEntityId)) invoicesMap.set(inv.sourceEntityId, []);
            invoicesMap.get(inv.sourceEntityId)!.push({
              id: toId('invoice', inv.id),
              kind: inv.kind,
              invoiceNumber: inv.invoiceNumber,
              invoiceDate: inv.invoiceDate,
              total: Number(inv.total),
              supplierName: inv.supplierName ?? inv.workshopName ?? null,
              fileUrl: inv.fileUrl,
              fileMimeType: inv.fileMimeType,
            });
          }
        }
        return res.json({
          module: moduleKey,
          date,
          page,
          pageSize,
          total,
          rows: records.map((r) => ({
            id: toId('maintenance', r.m.id),
            title: r.m.title,
            description: r.m.description,
            type: r.m.type,
            status: r.m.status,
            category: r.categoryLabel ?? r.categoryKey ?? r.m.category,
            
            
            
            
            subcategoryId: r.m.subcategoryId != null ? toId('maint-subcat', r.m.subcategoryId) : null,
            workshopName: r.workshopName,
            odometerKm: r.m.odometerKm ? Number(r.m.odometerKm) : null,
            
            
            
            
            
            
            
            
            laborCost:    Number(r.m.laborCost    ?? 0),
            ivaPercent:   Number(r.m.ivaPercent    ?? 0),
            totalCost:    Number(r.m.totalCost     ?? 0),
            items: itemsMap.get(r.m.id) ?? [],
            invoices: invoicesMap.get(r.m.id) ?? [],
          })),
        });
      }

      
      if (moduleKey === 'checklist') {
        const conds: any[] = [
          eq(companyChecklists.companyId, companyId),
          eq(companyChecklists.assetId, vehicleId),
          eq(companyChecklists.date, date),
        ];
        if (categoryId) conds.push(eq(companyChecklists.categoryId, categoryId));
        
        
        
        
        
        
        
        
        
        
        const offset = (page - 1) * pageSize;
        const [totalRow] = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(companyChecklists)
          .where(and(...conds));
        const total = totalRow?.c ?? 0;
        const rows = await db
          .select({
            c: companyChecklists,
            categoryName: companyChecklistCategories.name,
          })
          .from(companyChecklists)
          .leftJoin(companyChecklistCategories, eq(companyChecklistCategories.id, companyChecklists.categoryId))
          .where(and(...conds))
          .orderBy(asc(companyChecklists.date))
          .limit(pageSize)
          .offset(offset);
        return res.json({
          module: moduleKey,
          date,
          page,
          pageSize,
          total,
          rows: rows.map((r) => ({
            id: toId('checklist', r.c.id),
            category: r.categoryName ?? null,
            status: r.c.status,
            summary: r.c.summary,
            findings: r.c.findings,
            photoUrls: r.c.photoUrls ?? [],
            items: Array.isArray(r.c.items) ? r.c.items : [],
          })),
        });
      }

      
      if (moduleKey === 'combustible') {
        
        const conds = [
          eq(companyFuelEntries.companyId, companyId),
          eq(companyFuelEntries.assetId, vehicleId),
          eq(companyFuelEntries.date, date),
        ];
        const offset = (page - 1) * pageSize;
        const [totalRow] = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(companyFuelEntries)
          .where(and(...conds));
        const total = totalRow?.c ?? 0;
        const rows = await db
          .select()
          .from(companyFuelEntries)
          .where(and(...conds))
          .orderBy(asc(companyFuelEntries.date))
          .limit(pageSize)
          .offset(offset);
        return res.json({
          module: moduleKey,
          date,
          page,
          pageSize,
          total,
          rows: rows.map((r) => ({
            id: toId('fuel', r.id),
            gallons: Number(r.gallons),
            liters: Number(r.liters),
            cost: r.cost ? Number(r.cost) : null,
            odometer: r.odometer ? Number(r.odometer) : null,
            station: r.station,
            fuelType: r.fuelType,
            notes: r.notes,
            photoUrl: r.photoUrl,
            invoiceNumber: r.invoiceNumber,
          })),
        });
      }

      
      if (moduleKey === 'peajes') {
        const conds = [
          eq(companyTollEntries.companyId, companyId),
          eq(companyTollEntries.assetId, vehicleId),
          eq(companyTollEntries.date, date),
        ];
        
        const offset = (page - 1) * pageSize;
        const [totalRow] = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(companyTollEntries)
          .where(and(...conds));
        const total = totalRow?.c ?? 0;
        const rows = await db
          .select()
          .from(companyTollEntries)
          .where(and(...conds))
          .orderBy(asc(companyTollEntries.date))
          .limit(pageSize)
          .offset(offset);
        return res.json({
          module: moduleKey,
          date,
          page,
          pageSize,
          total,
          rows: rows.map((r) => ({
            id: toId('toll', r.id),
            tollName: r.tollName,
            category: r.category,
            cost: r.amount ? Number(r.amount) : null,
            time: (r as any).time ?? null,
            notes: r.notes,
            photoUrl: r.photoUrl,
          })),
        });
      }

      return res.status(400).json({ error: `Módulo no soportado: ${moduleKey}` });
    } catch (err) {
      next(err);
    }
  },
);

export default router;