// routes/company/reports-filtrado.ts
//
// jul 2026 v1 — Tab "Filtrado" dentro de Reportes.
//
// Flujo del cascada (el user lo dibujó a mano en un whiteboard):
//
//   Vehículo (placa)         → elige 1 vehículo
//   → Módulo (Combustible / Peajes / Mantenimientos / Checklist)
//   → Categoría               (solo si el módulo la tiene — ej. Mantenimientos
//                              tiene "Cambio de aceite", "M-10000", "Otra";
//                              Checklist tiene sus categorías administrativas;
//                              Combustible / Peajes no tienen y se saltan)
//   → Año                     (solo los años donde hay data para ese
//                              vehículo+módulo+(categoría opcional))
//   → Mes                     (enero–diciembre, solo los que tienen data)
//   → Semana del mes          (Sem 1-7 / Sem 8-15 / Sem 16-23 / Sem 24-31)
//   → Día                     (solo los días que tienen data)
//
// Una vez elegido el día, abajo se muestra una tabla con los detalles
// del día. La forma de la tabla se desglosa según el módulo:
//
//   - Mantenimiento → gastos, repuestos (items), taller, costo total
//   - Checklist     → items inspeccionados (pasaron / fallaron / N/A)
//   - Combustible   → galones, costo, estación, odómetro
//   - Peajes        → caseta, costo, hora
//
// El endpoint usa 2 rutas:
//
//   GET /reports/filtrado/cascade?vehicleId=&module=&categoryId=&year=&month=&week=
//        Devuelve el SIGUIENTE nivel del cascada según los filtros previos.
//
//   GET /reports/filtrado/details?vehicleId=&module=&date=&categoryId=
//        Devuelve la tabla de detalles del día.
//
// Permisos: `reportes.filtrado.ver` (granular). El sub-módulo no depende
// de ningún otro permiso — la empresa puede activar SOLO este sub-tab
// del Centro de Reportes aunque no tenga mantenimiento/checklist/etc
// activos. PERO el filtrado en sí solo trae data de los módulos que la
// empresa tiene activos, vía `router.use(requireModule(<módulo>))` por
// handler.
//
// jul 2026 v8 — FIX (reportado por el user): un módulo o categoría
// podía aparecer como opción seleccionable aunque NINGUNO de sus
// registros tuviera fecha válida (ej. un mantenimiento con
// `scheduledFor = null`). Eso rompía la garantía de "si aparece la
// opción, el siguiente nivel tiene data": el user elegía la
// categoría y llegaba a Año con la lista vacía. Fix: todo conteo que
// decide si una opción (módulo o categoría) se muestra ahora exige
// `isNotNull(<columna de fecha>)`, igual que exigen companyId+assetId.

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
} from '../../db/schema/operational';
import { requirePermission } from '../../middlewares/requirePermission';
import { parseIdFlexible, toId } from '../../lib/ids';

const router = Router({ mergeParams: true });

// ─── Tipos ─────────────────────────────────────────────────────────────────

type ModuloKey = 'combustible' | 'peajes' | 'mantenimiento' | 'checklist';

/** Módulos que tienen "categoría" como nivel siguiente en el cascada.
 *  El user lo dijo explícito: "Categorías de ese módulo (Si es que tiene)". */
const MODULOS_CON_CATEGORIA: ModuloKey[] = ['mantenimiento', 'checklist'];

/** Mapa módulo → permiso del sub-módulo (para requirePermission en handlers). */
const MODULO_PERM: Record<ModuloKey, [modulo: string, submódulo: string, accion: string]> = {
  combustible:  ['combustible',   'registros', 'ver'],
  peajes:       ['combustible',   'peajes',    'ver'],
  mantenimiento:['mantenimiento', 'records',   'ver'],
  checklist:    ['checklist',     'lista',     'ver'],
};

/** Nombre legible de cada módulo (para mostrar en el cascada). */
const MODULO_LABEL: Record<ModuloKey, string> = {
  combustible:   'Combustible',
  peajes:        'Peajes',
  mantenimiento: 'Mantenimientos',
  checklist:     'Checklist',
};

/** Tabla SQL / fecha del módulo. */
const MODULO_DATE_COL: Record<ModuloKey, any> = {
  combustible:   companyFuelEntries.date,
  peajes:        companyTollEntries.date,
  mantenimiento: companyMaintenanceRecords.scheduledFor,
  checklist:     companyChecklists.date,
};

/** Tabla del módulo (la principal, sin items). */
const MODULO_TABLE: Record<ModuloKey, any> = {
  combustible:   companyFuelEntries,
  peajes:        companyTollEntries,
  mantenimiento: companyMaintenanceRecords,
  checklist:     companyChecklists,
};

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Convierte una fecha JS a "YYYY-MM-DD" usando la zona local del server
 *  (no UTC, porque los filtros del user son por día calendario local). */
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Devuelve el "YYYY-MM-DD" del día SIGUIENTE al pasado. Usado para
 *  armar rangos exclusivos (>= date AND < nextDay) en el endpoint
 *  /details. */
function nextDayYmd(dateYmd: string): string {
  const d = new Date(`${dateYmd}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return toYmd(d);
}

// jul 2026 v9 — Fecha efectiva para mantenimiento. Un mantenimiento
// puede estar PROGRAMADO para un día futuro PERO COMPLETADO en otro
// (por ej. se programa para mañana pero se terminó hoy). El user
// espera que aparezca tanto en el día programado como en el día
// real de trabajo. Esta helper agrega la condición OR con
// `completedAt` para todos los niveles de la cascada y para el
// endpoint /details.
//
// Importante: solo aplica a mantenimiento. Combustible/peajes/
// checklist no tienen este desfase (la fecha del registro ES la
// fecha de ocurrencia).
const HAS_DUAL_DATE: ReadonlyArray<ModuloKey> = ['mantenimiento'];

/** Devuelve el fragmento SQL que matchea un rango de fechas
 *  sobre la columna de fecha efectiva del módulo. Para módulos
 *  con doble fecha (mantenimiento), matchea si la fecha cae en
 *  scheduledFor O en completedAt. Para el resto, matchea solo en
 *  la columna del módulo. */
function dateRangeExpr(
  moduleKey: ModuloKey,
  startYmd: string,
  endExclusiveYmd: string,
) {
  const dateCol = MODULO_DATE_COL[moduleKey];
  if (HAS_DUAL_DATE.includes(moduleKey)) {
    // (scheduledFor >= start AND scheduledFor < end)
    //   OR (completedAt IS NOT NULL AND completedAt >= start AND completedAt < end)
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

/** Versión "isNotNull" para la fecha efectiva. Para mantenimiento,
 *  acepta la fila si scheduledFor OR completedAt es no nulo. */
function isNotNullEffectiveDate(moduleKey: ModuloKey) {
  const dateCol = MODULO_DATE_COL[moduleKey];
  if (HAS_DUAL_DATE.includes(moduleKey)) {
    return sql`(${dateCol} IS NOT NULL OR ${companyMaintenanceRecords.completedAt} IS NOT NULL)`;
  }
  return isNotNull(dateCol);
}

/** Fragmento SQL de la "fecha efectiva" del módulo. Se usa en las
 *  funciones de extract(year/month/day) para que un mantenimiento
 *  completado HOY cuente para el año/mes/día de HOY aunque su
 *  scheduledFor sea otro día. */
function effectiveDateExpr(moduleKey: ModuloKey) {
  const dateCol = MODULO_DATE_COL[moduleKey];
  if (HAS_DUAL_DATE.includes(moduleKey)) {
    // COALESCE entre las dos fechas. Si scheduledFor es null pero
    // completedAt no, usamos completedAt. Si las dos son null, la
    // fila no entra (filtramos isNotNull antes). Si las dos son
    // non-null, preferimos scheduledFor (la fecha de "trabajo
    // planeado" — coincide con la forma en que se mostraba antes).
    return sql`COALESCE(${dateCol}::date, ${companyMaintenanceRecords.completedAt}::date)`;
  }
  return sql`${dateCol}::date`;
}

/** Devuelve los rangos [from, to) de las 4 semanas "estándar" del mes
 *  (1-7, 8-15, 16-23, 24-31). */
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
      to:   toYmd(new Date(year, month1to12 - 1, d2 + 1)), // exclusive
      label,
    });
  }
  return out;
}

/** Dado un mes y un índice de semana (0..3), devuelve [from, to) inclusivo. */
function weekRange(year: number, month1to12: number, weekIdx: number): { from: string; to: string } | null {
  const all = weeksOfMonth(year, month1to12);
  return all[weekIdx] ? { from: all[weekIdx].from, to: all[weekIdx].to } : null;
}

// ─── GET /reports/filtrado/cascade ────────────────────────────────────────

router.get(
  '/cascade',
  requirePermission('reportes', 'filtrado', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const vehicleId = req.query.vehicleId ? Number(req.query.vehicleId) : null;
      const moduleKey = (req.query.module as ModuloKey | undefined) ?? null;
      // jul 2026 v5 — Si `categoryId` es positivo, es FK real.
      // Si es negativo, es una categoría "huérfana" (string legacy
      // sin match en el catálogo) y `categoryKey` trae el string.
      const rawCategoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
      const categoryId = rawCategoryId != null && rawCategoryId > 0 ? rawCategoryId : null;
      const categoryKey = (req.query.categoryKey as string | undefined) ?? null;
      // jul 2026 v9 — Sub-categoría. Si `subcategoryId > 0`, es FK
      // real de la tabla `company_maintenance_subcategories`. Si es
      // negativo, es una sub-categoría huérfana y `subcategoryKey`
      // trae el string.
      const rawSubcategoryId = req.query.subcategoryId ? Number(req.query.subcategoryId) : null;
      const subcategoryId = rawSubcategoryId != null && rawSubcategoryId > 0 ? rawSubcategoryId : null;
      const subcategoryKey = (req.query.subcategoryKey as string | undefined) ?? null;
      const year = req.query.year ? Number(req.query.year) : null;
      const month = req.query.month ? Number(req.query.month) : null;
      const week = req.query.week != null && req.query.week !== ""
        ? Number(req.query.week) : null;

      // Nivel 1: vehículos
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

      // Nivel 2: módulos disponibles para este vehículo
      //
      // jul 2026 v8 — FIX: antes contábamos CUALQUIER registro del
      // módulo para ese vehículo, sin exigir fecha. Un mantenimiento
      // con `scheduledFor = null` (dato incompleto) hacía que el
      // módulo apareciera como opción, pero luego el nivel de Años
      // salía vacío porque `extract(year from null)` no cuenta.
      // Ahora exigimos `isNotNull(<columna de fecha>)` en cada
      // conteo, igual que exigimos companyId + assetId.
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
            // jul 2026 v9 — antes solo `isNotNull(scheduledFor)`.
            // Un mantenimiento completado sin scheduledFor seteado
            // (drift de data o caso legacy) hacía que el módulo no
            // apareciera. Ahora aceptamos cualquiera de las dos.
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

      // Nivel 3: categorías (si el módulo las tiene) o años
      if (!categoryId && MODULOS_CON_CATEGORIA.includes(moduleKey)) {
        if (moduleKey === 'mantenimiento') {
          // jul 2026 v5 — REGLA ESTRICTA: devolvemos categorías que
          // tienen AL MENOS 1 mantenimiento del vehículo. Cubrimos
          // 3 paths:
          //   1. `categoryId` (FK) matchea con una categoría del
          //      catálogo → la categoría del catálogo aparece.
          //   2. `category` (string) matchea con el `key` o `label`
          //      de una categoría del catálogo → esa categoría
          //      aparece.
          //   3. `category` (string) NO matchea con ninguna
          //      categoría del catálogo PERO SÍ hay mantenimientos
          //      con ese string → agregamos una entrada "huérfana"
          //      con el string como label. Si el user la elige, los
          //      niveles siguientes filtran por ESE string.
          //
          // jul 2026 v8 — FIX: agregamos `isNotNull(scheduledFor)`
          // a la query de mantenimientos usados. Sin esto, una
          // categoría con mantenimientos SIN fecha aparecía como
          // opción válida y el nivel de Años salía vacío.
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
              // jul 2026 v9 — antes `isNotNull(scheduledFor)`. Ahora
              // aceptamos también los completados sin fecha
              // programada (caso real: se finalizó sin reagendar).
              isNotNullEffectiveDate('mantenimiento'),
            ));

          const usedIds = new Set(
            allMaints.map((u) => u.id).filter((v): v is number => v != null)
          );
          const usedStrings = new Set(
            allMaints.map((u) => u.str).filter((v): v is string => v != null && v.length > 0)
          );

          // jul 2026 v9 — Sub-categorías por categoría: para que el
          // frontend sepa si debe mostrar la columna "Subcategoría",
          // necesitamos, en el MISMO round-trip, qué categorías del
          // catálogo tienen al menos 1 fila en
          // `company_maintenance_subcategories` para esta empresa.
          //
          // Antes lo adivinábamos en frontend por `id > 0` (custom)
          // o `id < 0` (huérfana/built-in) — pero eso es MENTIRA:
          // una cat custom puede tener 0 subs creadas todavía, y
          // mostrábamos una columna vacía con "Sin opciones". El
          // backend debe decir la verdad.
          //
          // Una sola query: traeme los categoryId distintos que
          // tienen al menos una sub.
          const catsWithSubs = await db
            .selectDistinct({ categoryId: companyMaintenanceSubcategories.categoryId })
            .from(companyMaintenanceSubcategories)
            .where(eq(companyMaintenanceSubcategories.companyId, companyId));
          const catHasSubs = new Set<number>(
            catsWithSubs.map((r) => r.categoryId).filter((v): v is number => v != null)
          );

          // Path 1+2: categorías del catálogo que matchean
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

          // jul 2026 v9 — Las categorías built-in de mantenimiento
          // NO están en el catálogo (`company_maintenance_categories`)
          // — viven hardcoded en `MAINT_CATEGORIES` en
          // `maintenances.ts` y se persisten como string legacy en
          // `company_maintenance_records.category` (ej.
          // `"Primordial:Motores"`). Por lo tanto caen como
          // **huérfanas** en la lógica de arriba (path 3): el
          // string existe en `usedStrings` pero no matchea con
          // ningún FK ni con ninguna key/label del catálogo.
          //
          // Antes intenté hardcodear `BUILTIN_CATS` con IDs
          // predecibles (-100, -101, ...) para diferenciar
          // built-in de huérfanos genéricos. Era mala idea: el
          // user tiene razón, las categorías deben salir SOLO
          // si la placa tiene data — y el path 1+2+3 ya hace
          // eso naturalmente con `usedIds/usedStrings`. Lo
          // quito.
          //
          // El `label` que devolvemos para huérfanos es el
          // string crudo de la DB (`"Primordial:Motores"`).
          // No es tan bonito como `"Primordial · Motores"`
          // pero es fiel a lo que está guardado. El frontend
          // puede aplicar un mapeo de presentación si quiere.

          // Path 3: strings huérfanos (no matchean con el catálogo).
          const orphanStrings = Array.from(usedStrings).filter(
            (s) => !matchedKeys.has(s),
          );

          const items: Array<{ id: number; label: string; key: string; hasSubcategories: boolean; orphan?: boolean }> = [
            ...matchedFromCatalog.map((c) => ({
              id: c.id,
              label: c.label,
              key: c.key,
              // jul 2026 v9 — Bandera REAL basada en la tabla
              // `company_maintenance_subcategories`. El frontend
              // usa esto para decidir si renderiza la columna de
              // sub-categoría.
              hasSubcategories: catHasSubs.has(c.id),
            })),
            ...orphanStrings.map((s, i) => ({
              // IDs negativos para huérfanos (built-in o strings
              // libres), todos a partir de -1. No chocan con
              // FKs reales (positivas). Nunca tienen subs porque
              // las subs solo viven en la tabla de subs con FK
              // positiva.
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

          // jul 2026 v4 — Solo devolvemos las categorías con al
          // menos 1 inspección de este vehículo. Sin esto, el user
          // podía elegir una categoría vacía y la cascada se
          // rompía en el siguiente nivel.
          //
          // jul 2026 v8 — FIX: agregamos `isNotNull(date)` acá
          // también, mismo motivo que en mantenimiento.
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

      // jul 2026 v7 — Helper de filtrado por categoría. Hay 2 paths
      // posibles:
      //   A. `categoryId > 0` (FK de catálogo): el backend busca
      //      el `key` y `label` de la categoría y filtra por FK O
      //      por string. Esto cubre los mantenimientos que tienen
      //      `categoryId` seteado a la categoría Y los legacy que
      //      tienen `category` = "Xxx" pero FK vacía.
      //   B. `categoryId < 0` (huérfano): se filtra por el string
      //      legacy en `categoryKey`.
      //   C. Ambos null: no hay filtro.
      //
      // Hacemos un OR de (FK match) OR (string match) — si el
      // mantenimiento tiene cualquiera de los dos seteados, cuenta.
      let categoryStringFilter: string | null = null;
      if (categoryId) {
        // Para mantenimiento y checklist, el catálogo tiene
        // `key` y `label`. Buscamos el key/label de la categoría
        // elegida para incluirlo en el filtro.
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
            // Usamos key (no label) porque label puede repetirse.
            // Filtramos por FK = X OR category = key.
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

      // jul 2026 v9 — FIX: `checklist` NO tiene columna `category`
      // (string legacy) — solo tiene `categoryId` (FK). Antes
      // armábamos el OR por string para cualquier módulo con
      // categoría, y para checklist eso generaba
      // `eq(undefined, categoryStringFilter)` → SQL roto
      // ("... OR = $4", sin columna a la izquierda). El string
      // legacy solo existe en mantenimiento.
      const MODULOS_CON_CATEGORIA_STRING: ModuloKey[] = ['mantenimiento'];

      const pushCategoryFilter = (conds: any[]) => {
        if (!categoryId && !categoryStringFilter && !subcategoryId) return;
        // jul 2026 v9 — Si la categoría es built-in (-100..-103)
        // o huérfana (-200+), el `categoryId` NO es una FK real,
        // es solo un id lógico. El match real es por
        // `categoryStringFilter` (el string `category` legacy).
        // Si metemos `category_id = -100` al OR, la query
        // devuelve 0 resultados (nadie tiene FK negativa). Por
        // eso skipeamos el OR con `category_id` cuando el id es
        // negativo.
        const isRealCategoryId = categoryId != null && categoryId > 0;
        const ors: any[] = [];
        if (isRealCategoryId) {
          ors.push(eq(MODULO_TABLE[moduleKey].categoryId, categoryId));
        }
        // jul 2026 v9 — Solo aplicar el filtro por string legacy
        // si el módulo TIENE la columna `category`. Para
        // checklist, esa columna no existe en el schema →
        // `MODULO_TABLE.checklist.category` es `undefined` y la
        // query rompe con SQL `... OR = $4` (sin columna a la
        // izquierda). Mantenimiento sí la tiene y matchea tanto
        // por FK como por string legacy.
        if (
          categoryStringFilter &&
          MODULOS_CON_CATEGORIA_STRING.includes(moduleKey)
        ) {
          ors.push(eq(MODULO_TABLE[moduleKey].category, categoryStringFilter));
        }
        if (ors.length === 1) conds.push(ors[0]);
        else if (ors.length > 1) {
          // jul 2026 v7 — OR interno. Drizzle no tiene helper
          // directo de OR genérico, así que lo armamos con `or()`.
          // jul 2026 v7b — `or(...)` toma SQL expressions, no
          // comparadores sueltos. Usamos `sql` raw para componer.
          conds.push(sql`(${sql.join(ors, sql` OR `)})`);
        }
        // jul 2026 v9 — Si el user eligió sub-categoría, el
        // filtro de sub-categoría se aplica ADEMÁS del de
        // categoría. Sin AND porque la sub-categoría FK ya
        // restringe por la categoría padre.
        if (subcategoryId) {
          conds.push(eq(MODULO_TABLE[moduleKey].subcategoryId, subcategoryId));
        }
      };

      // jul 2026 v9 — Nivel "subcategorías". Solo aplica para
      // mantenimiento (checklist no tiene sub-categorías). Si la
      // categoría padre NO tiene sub-categorías, el nivel se
      // SALTA y la cascada sigue directo a años (igual que
      // combustible/peajes que no tienen categoría). Para
      // detectarlo, hacemos una query barata: ¿existen filas en
      // `company_maintenance_subcategories` con categoryId = X
      // para esta empresa? Si count = 0, no devolvemos este
      // nivel.
      //
      // Si la categoría es huérfana (categoryKey string, sin FK)
      // tampoco tiene subs — son strings legacy. Las subs solo
      // viven en la tabla para categorías con FK.
      if (moduleKey === 'mantenimiento' && !subcategoryId) {
        // jul 2026 v9 — Detección barata: ¿esta categoría tiene
        // al menos una sub-categoría definida? Si NO, salteamos
        // el nivel y dejamos que la cascada caiga al bloque de
        // años. Esto evita que el frontend quede pegado en una
        // columna sub-categoría vacía.
        //
        // Solo las categorías con FK positivo (id > 0) pueden
        // tener sub-categorías — las huérfanas (id < 0) son
        // strings legacy, sin tabla de subs asociada.
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
          // Una sola query que cuenta los mantenimientos del
          // vehículo agrupados por sub-categoría. Los count en
          // 0 = sub-categoría sin data, igual válida para
          // elegir. `categoryId > 0` ya está garantizado por la
          // guarda de `hasAnySub`.
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
        // Si no hay subs definidas, NO retornamos — dejamos que
        // el flujo caiga al bloque de años de abajo.
      }

      // Nivel 4: años con data (filtrado por módulo + categoría opcional)
      //
      // jul 2026 v8 — FIX: agregamos `isNotNull(dateCol)` acá
      // también. Antes, si por alguna razón un registro sin fecha
      // se colaba hasta acá (ej. llegó directo con categoryId de un
      // link viejo), `extract(year from null)` generaba una fila
      // con `y = null` que ensuciaba la lista de años.
      if (!year) {
        const dateCol = MODULO_DATE_COL[moduleKey];
        const tbl = MODULO_TABLE[moduleKey];
        const conds: any[] = [
          eq(tbl.companyId, companyId),
          eq(tbl.assetId, vehicleId),
          // jul 2026 v9 — fecha efectiva (scheduledFor O
          // completedAt para mantenimiento; dateCol nomás para
          // el resto).
          isNotNullEffectiveDate(moduleKey),
        ];
        if (moduleKey === 'mantenimiento' || moduleKey === 'checklist') {
          pushCategoryFilter(conds);
        }

        // jul 2026 v9 — extraemos el año/mes/día de la FECHA
        // EFECTIVA, no de dateCol a secas. Para mantenimiento,
        // esto significa que un mantenimiento completado HOY
        // cuenta para el año/mes/día de HOY aunque su
        // scheduledFor sea otro día.
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

      // Nivel 5: meses del año con data
      //
      // jul 2026 v2 — `gte`/`lte` con `new Date(...)` rompe en columnas
      // tipo `date` puro (company_checklists.date, company_fuel_entries.date,
      // company_toll_entries.date) porque postgres.js espera un string
      // o Buffer, no una instancia de Date. Casteamos a `YYYY-MM-DD`
      // explícito vía `sql` raw. company_maintenance_records usa
      // timestamp así que Date funcionaría ahí, pero casteamos igual
      // para no branchear por módulo.
      if (!month) {
        const dateCol = MODULO_DATE_COL[moduleKey];
        const tbl = MODULO_TABLE[moduleKey];
        const start = `${year}-01-01`;
        const end   = `${year + 1}-01-01`;
        const conds: any[] = [
          eq(tbl.companyId, companyId),
          eq(tbl.assetId, vehicleId),
          // jul 2026 v9 — rango sobre la fecha efectiva (OR
          // scheduledFor / completedAt para mantenimiento).
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

      // Nivel 6: semanas del mes con data
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
          // jul 2026 v9 — rango sobre fecha efectiva.
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
          // r.d viene como "YYYY-MM-DD" (casteamos a text arriba).
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

      // Nivel 7: días con data en la semana elegida
      {
        const range = weekRange(year, month, week);
        if (!range) return res.json({ level: "days", items: [] });

        const dateCol = MODULO_DATE_COL[moduleKey];
        const tbl = MODULO_TABLE[moduleKey];
        const conds: any[] = [
          eq(tbl.companyId, companyId),
          eq(tbl.assetId, vehicleId),
          // jul 2026 v9 — rango sobre fecha efectiva.
          dateRangeExpr(moduleKey, range.from, range.to),
        ];
        if (moduleKey === 'mantenimiento' || moduleKey === 'checklist') {
          pushCategoryFilter(conds);
        }
        // Para deduplicar días, usamos la fecha efectiva casteada a
        // text. Para mantenimiento, eso es COALESCE(scheduledFor,
        // completedAt)::date — si una fila tiene ambas, cae en
        // scheduledFor (que es lo que el user eligió originalmente);
        // si solo tiene completedAt, cae en completedAt.
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

// ─── GET /reports/filtrado/details ────────────────────────────────────────

router.get(
  '/details',
  requirePermission('reportes', 'filtrado', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const vehicleId = Number(req.query.vehicleId);
      const moduleKey = req.query.module as ModuloKey;
      const date = String(req.query.date ?? "");
      // jul 2026 v8 — Paginación. Default 20 rows por página, igual
      // que en otros endpoints de la app. Si el cliente manda
      // `page` y `pageSize`, se respeta. Devolvemos `total` y `page`
      // en la respuesta para que el frontend renderice los
      // controles de paginación.
      const page     = req.query.page     ? Math.max(1, Number(req.query.page))     : 1;
      const pageSize = req.query.pageSize ? Math.min(100, Math.max(1, Number(req.query.pageSize))) : 20;
      // jul 2026 v5 — `categoryId < 0` indica categoría huérfana
      // (string legacy). Filtramos por `categoryKey` en su lugar.
      const rawCategoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
      const categoryId = rawCategoryId != null && rawCategoryId > 0 ? rawCategoryId : null;
      const categoryKey = (req.query.categoryKey as string | undefined) ?? null;
      // jul 2026 v9 — sub-categoría (FK o string legacy).
      const rawSubcategoryId = req.query.subcategoryId ? Number(req.query.subcategoryId) : null;
      const subcategoryId = rawSubcategoryId != null && rawSubcategoryId > 0 ? rawSubcategoryId : null;
      const subcategoryKey = (req.query.subcategoryKey as string | undefined) ?? null;

      if (!vehicleId || !moduleKey || !date) {
        return res.status(400).json({ error: "vehicleId, module y date son requeridos" });
      }

      // ── Mantenimiento: mantenimientos del día + items (repuestos)
      //
      // jul 2026 v2 — Mantenimiento usa `scheduledFor` (timestamp con
      // hora). Si el user eligió "24 jul" en la cascada, la query debe
      // traer TODOS los mantenimientos programados para ese día
      // calendario local, sin importar la hora. Por eso filtramos
      // por RANGO [start, end) en vez de equality.
      //
      // jul 2026 v5 — Filtramos por FK (categoryId) o por string
      // legacy (categoryKey) si la categoría es huérfana.
      if (moduleKey === 'mantenimiento') {
        // jul 2026 v9 — Rango de día calendario. La query trae TODOS
        // los mantenimientos cuyo `scheduledFor` cae en ese día
        // (caso normal) O cuyo `completedAt` cae en ese día (caso
        // real: se programó para otra fecha pero se terminó hoy).
        // Usamos string YYYY-MM-DD con `sql` raw para que Postgres
        // haga el cast a `date` correctamente.
        const conds: any[] = [
          eq(companyMaintenanceRecords.companyId, companyId),
          eq(companyMaintenanceRecords.assetId, vehicleId),
          dateRangeExpr('mantenimiento', date, nextDayYmd(date)),
        ];
        if (categoryId) conds.push(eq(companyMaintenanceRecords.categoryId, categoryId));
        if (categoryKey) conds.push(eq(companyMaintenanceRecords.category, categoryKey));
        // jul 2026 v9 — Si el user eligió sub-categoría, filtramos
        // por `subcategoryId` ADEMÁS del filtro de categoría.
        if (subcategoryId) conds.push(eq(companyMaintenanceRecords.subcategoryId, subcategoryId));
        // jul 2026 v8 — Paginamos los MANTENIMIENTOS del día. Los
        // items (repuestos) de cada mantenimiento se traen
        // completos porque típicamente son pocos y viven adentro
        // de la card de su mantenimiento padre.
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
          // jul 2026 v9 — FIX: antes seleccionábamos
          // `i: companyMaintenanceItems` (el objeto completo de la
          // tabla tal como lo define el schema de Drizzle). El
          // schema incluye `created_at`, pero esa columna no existe
          // en la tabla real de la base (drift schema↔DB) → Postgres
          // tiraba `column company_maintenance_items.created_at does
          // not exist`. Ahora seleccionamos explícitamente solo las
          // columnas que sí existen y que además son las únicas que
          // se usan más abajo.
          const items = await db
            .select({
              id: companyMaintenanceItems.id,
              maintenanceId: companyMaintenanceItems.maintenanceId,
              name: companyMaintenanceItems.name,
              photoUrl: companyMaintenanceItems.photoUrl,
              quantity: companyMaintenanceItems.quantity,
              unitCost: companyMaintenanceItems.unitCost,
              // jul 2026 v9 — descuento + iva por ítem para que
              // el detalle muestre las mismas columnas que la
              // tabla de repuestos del form modal (Repuesto /
              // Proveedor / Cant / Precio / Desc / Subtotal /
              // IVA / Total).
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
            // jul 2026 v9 — sub-categoría. Si la consulta no la
            // pidió con JOIN, queda null. Para simplificar, no
            // hacemos JOIN acá (las cards de mantenimientos
            // muestran el title/desc y eso es lo principal).
            subcategoryId: r.m.subcategoryId != null ? toId('maint-subcat', r.m.subcategoryId) : null,
            workshopName: r.workshopName,
            odometerKm: r.m.odometerKm ? Number(r.m.odometerKm) : null,
            // jul 2026 v9 — desagregado de costos para mostrar
            // el mismo footer que la tabla de repuestos (Mano de
            // obra / Subtotal repuestos / Subtotal / IVA / Total).
            // El schema de `company_maintenance_records` solo tiene
            // `laborCost`, `ivaPercent` y `totalCost` (los demás
            // campos como `subtotal`/`ivaAmount`/`discount*` son de
            // los ítems). El frontend los computa a partir de
            // `items[].subtotal` + `ivaAmount` + `laborCost`.
            laborCost:    Number(r.m.laborCost    ?? 0),
            ivaPercent:   Number(r.m.ivaPercent    ?? 0),
            totalCost:    Number(r.m.totalCost     ?? 0),
            items: itemsMap.get(r.m.id) ?? [],
          })),
        });
      }

      // ── Checklist: inspecciones del día + items (pasaron/fallaron)
      if (moduleKey === 'checklist') {
        const conds: any[] = [
          eq(companyChecklists.companyId, companyId),
          eq(companyChecklists.assetId, vehicleId),
          eq(companyChecklists.date, date),
        ];
        if (categoryId) conds.push(eq(companyChecklists.categoryId, categoryId));
        // jul 2026 v9 — `companyChecklists` NO tiene columna
        // `category` (string legacy) — solo `categoryId` (FK). El
        // filtro por string legacy solo aplica a mantenimiento.
        // Sin esta guarda, drizzle genera `eq(undefined, ...)` y
        // la query rompe con `... OR = $N` (sin columna a la
        // izquierda del =).
        // (Checklist no tiene sub-categoría acá.)
        // jul 2026 v8 — Paginamos los CHECKLISTS del día. Los items
        // de cada checklist (pasaron/fallaron) viven adentro de la
        // card del checklist padre, no se paginan por separado.
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

      // ── Combustible: cargas del día
      if (moduleKey === 'combustible') {
        // jul 2026 v8 — Paginamos las CARGAS del día.
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

      // ── Peajes: peajes del día
      if (moduleKey === 'peajes') {
        const conds = [
          eq(companyTollEntries.companyId, companyId),
          eq(companyTollEntries.assetId, vehicleId),
          eq(companyTollEntries.date, date),
        ];
        // jul 2026 v8 — Paginamos los PEAJES del día.
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