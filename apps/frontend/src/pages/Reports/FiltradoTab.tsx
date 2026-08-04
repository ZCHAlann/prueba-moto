// pages/Reports/FiltradoTab.tsx
//
// jul 2026 v5 — Tab "Filtrado" del Centro de Reportes, layout HORIZONTAL
// con WRAP a 2 filas si el viewport no entra.
//


import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Truck, Tag, Calendar, CalendarDays, Hash, Sun,
  FileText, Loader2, AlertCircle, Wrench,
  ClipboardList, Fuel, Receipt, Inbox, ListChecks,
  CheckCircle2, XCircle, MessageSquare, Image as ImageIcon,
} from "lucide-react";
import {
  useFiltradoReport,
  type CascadeItem,
  type ModuleKey,
} from "../../hooks/useFiltradoReport";
// jul 2026 v9.1 — Recalculamos subtotal/iva/total en el FRONTEND
// desde los datos crudos del item (unitCost, quantity, discountType,
// discountValue, ivaPercent). NO usamos los campos `subtotal/iva/total`
// que vienen de la API porque pueden estar mal guardados en la BD
// (ítems viejos con discountType='percent' calculado con fórmula de
// monto). La lib es la misma que usa el form modal, así el
// filtrado refleja los MISMOS números que el mantenimiento directo.
//
// jul 2026 v9.2 — Usamos `aggregateTotals` para el resumen (igual
// que el drawer) y `computeItemTotals` solo para la tabla por item.
// Regla de negocio: el IVA va SOLO a repuestos, la mano de obra
// NO lleva IVA. Esto matchea exactamente con `liveTotalCost =
// labor + partsAgg.grandTotal` del MaintenanceDetailDrawer.
import { computeItemTotals, aggregateTotals } from "../../lib/maintenance-totals";

// ─── Constantes ─────────────────────────────────────────────────────

type Col = {
  level: "vehicles" | "modules" | "categories" | "subcategories" | "years" | "months" | "weeks" | "days";
  title: string;
  Icon: typeof Truck;
};

const COL_DEFS: Col[] = [
  { level: "vehicles",      title: "Vehículo",      Icon: Truck        },
  { level: "modules",       title: "Módulo",        Icon: Tag          },
  { level: "categories",    title: "Categoría",     Icon: Tag          },
  // jul 2026 v9 — Sub-categoría. Solo se renderiza si el módulo
  // es mantenimiento Y la cat padre tiene subs definidas (el
  // backend devuelve `years` directo si no tiene). Visibilidad
  // estricta — ver useMemo de cols.
  { level: "subcategories", title: "Subcategoría",  Icon: Tag          },
  { level: "years",         title: "Año",           Icon: Calendar     },
  { level: "months",        title: "Mes",           Icon: CalendarDays },
  { level: "weeks",         title: "Semana",        Icon: Hash         },
  { level: "days",          title: "Día",           Icon: Sun          },
];

const MODULE_ICONS: Record<ModuleKey, typeof Truck> = {
  combustible:   Fuel,
  peajes:        Receipt,
  mantenimiento: Wrench,
  checklist:     ClipboardList,
};

const MODULE_LABELS: Record<ModuleKey, string> = {
  combustible:   "Combustible",
  peajes:        "Peajes",
  mantenimiento: "Mantenimientos",
  checklist:     "Checklist",
};

const MODULE_COLOR: Record<ModuleKey, { icon: string; tag: string }> = {
  combustible:   { icon: "text-orange-500",  tag: "bg-orange-500/10 text-orange-600 dark:text-orange-300" },
  peajes:        { icon: "text-amber-500",   tag: "bg-amber-500/10  text-amber-600  dark:text-amber-300" },
  mantenimiento: { icon: "text-fuchsia-500", tag: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300" },
  checklist:     { icon: "text-cyan-500",    tag: "bg-cyan-500/10   text-cyan-600  dark:text-cyan-300" },
};

// ─── Componente principal ───────────────────────────────────────────

export function FiltradoTab() {
  const {
    state, items, levelItems, loading, error, currentLevel,
    details, detailsLoading, detailsPage, setDetailsPage,
    setVehicleId, setModule, setCategoryId,
    // jul 2026 v9 — sub-categoría.
    setSubcategoryId,
    setYear, setMonth, setWeek, setDay,
  } = useFiltradoReport();

  const [flashed, setFlashed] = useState<string | null>(null);
  function flash(id: string) {
    setFlashed(id);
    setTimeout(() => setFlashed((cur) => (cur === id ? null : cur)), 600);
  }

  function onPick(level: Col["level"], v: any, label: string, raw?: any) {
    flash(`${level}-${v ?? "x"}`);
    // jul 2026 v9 — `raw` es el item completo del cascade. Lo
    // usamos para sacar el `key` real (que matchea con la DB)
    // cuando hay que mandar `categoryKey`/`subcategoryKey` al
    // backend. El `label` es legible ("Primordial · Motores"),
    // pero la DB tiene "Primordial:Motores" — son DISTINTOS.
    // Antes mandábamos `label` como `key` y el filtro SQL no
    // matcheaba, por eso Año / Mes / Día salían vacíos.
    const itemKey = (raw as { key?: string } | undefined)?.key ?? null;
    switch (level) {
      case "vehicles": {
        const id = v == null ? null : Number(v);
        // jul 2026 — toggle: si ya estaba seleccionado ese mismo
        // vehículo, lo deseleccionamos (vuelve a null). Al volver
        // a null, gridMode se reactiva solo (depende de
        // state.vehicleId == null) y reaparecen las columnas de 10.
        setVehicleId(state.vehicleId === id ? null : id);
        break;
      }
      case "modules":       setModule(v as ModuleKey); break;
      case "categories": {
        const id = v == null ? null : Number(v);
        // jul 2026 v9 — Para ids negativos (built-in -100..-103 o
        // huérfanos -200+), mandamos `key` si está, sino `label`
        // como fallback. Para custom (id > 0) NO mandamos key (la
        // FK es la fuente de verdad).
        const key = id != null && id < 0 ? (itemKey ?? label) : null;
        setCategoryId(id, key);
        break;
      }
      case "subcategories": {
        const id = v == null ? null : Number(v);
        const key = id != null && id < 0 ? (itemKey ?? label) : null;
        setSubcategoryId(id, key);
        break;
      }
      case "years":         setYear(v == null ? null : Number(v)); break;
      case "months":        setMonth(v == null ? null : Number(v)); break;
      case "weeks":         setWeek(v == null ? null : Number(v)); break;
      case "days":          setDay(v == null ? null : String(v)); break;
    }
  }

  const showCategoryCol = state.module != null &&
    (state.module === "mantenimiento" || state.module === "checklist");

  // jul 2026 v4 — Lista de columnas a renderizar en HORIZONTAL
  // (de izquierda a derecha). Cada columna es una "estación" del
  // camino. Las que ya están elegidas siguen visibles, las nuevas
  // aparecen deslizándose desde la derecha.
  //
  // jul 2026 v5 — Visibilidad más estricta: una columna solo se
  // renderiza si su nivel padre ya fue elegido. NO mostramos
  // columnas "vacías en espera" (ej: "Año" no se ve hasta que el
  // user elija Categoría si el módulo la tiene). Así el cascada
  // se ve estrictamente de izquierda a derecha sin paralelos.
  const cols: Array<{
    col: Col;
    items: CascadeItem[];
    loading: boolean;
    selected: number | string | null;
  }> = useMemo(() => {
    const list: typeof cols = [];
    for (const col of COL_DEFS) {
      // jul 2026 v5 — Visibilidad estricta: cada nivel (excepto el
      // primero) requiere que su nivel padre esté lleno.
      let visible = true;
      if (col.level === "modules")       visible = state.vehicleId != null;
      if (col.level === "categories")    visible = showCategoryCol && state.module != null;
      // jul 2026 v9 — Sub-categoría: solo si módulo = mantenimiento
      // Y el cache de subs tiene items.
      //
      // ¿Por qué no preguntar al backend cada vez? Porque el
      // backend YA respondió cuando eligió la cat: el item de
      // categoría trae `hasSubcategories: boolean` calculado con
      // un `EXISTS` en `company_maintenance_subcategories`. Si
      // la cat no tiene subs, el hook salta ese nivel directo a
      // años y `levelItems.subcategories` queda `undefined` o
      // vacío. La regla es SIMPLE: si la columna tiene items en
      // cache, mostrarla. Si no, ocultarla. Sin adivinar por id.
      if (col.level === "subcategories") {
        const subItems = levelItems.subcategories;
        visible = state.module === "mantenimiento"
               && state.categoryId != null
               && subItems != null
               && subItems.length > 0;
      }
      if (col.level === "years") {
        visible = state.module != null;
        if (showCategoryCol) visible = visible && state.categoryId != null;
        // jul 2026 v9 — Si la cat tiene subs y todavía no se
        // eligió una, años no se muestra. Si la cat NO tiene
        // subs, año SÍ se muestra directo.
        const subItems = levelItems.subcategories;
        const hasSubsAvailable = subItems != null && subItems.length > 0;
        if (
          state.module === "mantenimiento" &&
          state.categoryId != null &&
          hasSubsAvailable &&
          state.subcategoryId == null
        ) {
          visible = false;
        }
      }
      if (col.level === "months")    visible = state.year != null;
      if (col.level === "weeks")     visible = state.month != null;
      if (col.level === "days")      visible = state.week != null;
      if (!visible) continue;

      const isCurrent = currentLevel === col.level;
      const cached = levelItems[col.level];
      const colItems = isCurrent ? items : (cached ?? []);
      list.push({
        col,
        items: colItems,
        loading: isCurrent && loading,
        selected: selectedValueFor(col.level, state),
      });
    }
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.vehicleId, state.module, state.categoryId, state.subcategoryId, state.year, state.month, state.week, state.day, currentLevel, items, levelItems, loading, showCategoryCol]);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500/20 to-brand-500/5 text-brand-600 dark:text-brand-300">
            <ListChecks size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-800 dark:text-white">Filtrado</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Avanzá nivel por nivel de izquierda a derecha. Cada nivel muestra solo las opciones con data.
            </p>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cascada horizontal con wrap a 2 filas ── */}
      {/* jul 2026 v5 — flex-wrap permite que las columnas bajen a una
          segunda fila si el viewport no entra. Sin overflow-x-auto.
          jul 2026 v5.b — `gridMode` se pasa a la primera columna
          (Vehículos) solo cuando NO hay vehículo seleccionado. En ese
          caso, los items se reparten en N columnas de 10 para no
          estirar el contenedor verticalmente. Cuando se selecciona
          un vehículo, `gridMode` pasa a false y la columna se
          re-renderiza en su layout vertical normal con animación
          de Framer Motion (`layout` en cada item). */}
      <div className="relative rounded-lg border border-gray-200 bg-white/50 p-4 dark:border-white/[0.08] dark:bg-white/[0.02]">
        {cols.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            <Inbox className="mx-auto mb-2 opacity-50" size={20} />
            No hay vehículos registrados. Cargá uno desde Gestión → Flotas.
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-x-0 gap-y-3">
            <AnimatePresence mode="popLayout">
              {cols.map((c, idx) => (
                <CascadeCol
                  key={c.col.level}
                  col={c.col}
                  items={c.items}
                  loading={c.loading}
                  selected={c.selected}
                  flashed={flashed}
                  colIndex={idx}
                  isFirst={idx === 0}
                  isLast={idx === cols.length - 1}
                  onPick={onPick}
                  module={state.module}
                  // jul 2026 v5.b — Grid solo en la primera columna
                  // (vehículos). Para los demás niveles, layout
                  // vertical normal. Aun con un vehículo seleccionado
                  // el grid mode sigue activo: `visibleItems` se filtra
                  // a solo el seleccionado y queda 1 chunk de 1 item,
                  // manteniendo el contenedor con tamaño fijo.
                  gridMode={c.col.level === "vehicles"}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {state.day != null && (
          <motion.div
            key={state.day}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            <DetailsPanel
              details={details}
              loading={detailsLoading}
              module={state.module}
              day={state.day}
              page={detailsPage}
              onPageChange={setDetailsPage}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── CascadeCol ─────────────────────────────────────────────────────
//
// Una columna del cascada. Layout:
//
//   ┌─ Icono ────────┐
//   │  VEHÍCULO     │   ← label
//   ├───────────────┤
//   │ ┌─ Placa 1   │   ← item
//   │ ├─ Placa 2   │
//   │ └─ Placa 3   │
//   └───────────────┘

// jul 2026 v5.b — Items por columna cuando los vehículos se
// distribuyen en grid. Si tenés 30 carros → 3 columnas de 10. Si
// tenés 50 → 5 columnas. Se respeta este número hasta que el user
// elige un vehículo, momento en el que el layout vuelve a la
// columna vertical original (todos los carros en una sola columna
// de filas, como el layout viejo).
const ITEMS_PER_COLUMN = 10;

function CascadeCol({ col, items, loading, selected, flashed, colIndex, isFirst, isLast, onPick, module: currentModule, gridMode = false }: {
  col: Col;
  items: CascadeItem[];
  loading: boolean;
  selected: number | string | null;
  flashed: string | null;
  colIndex: number;
  isFirst: boolean;
  isLast: boolean;
  onPick: (level: Col["level"], v: any, label: string, raw?: any) => void;
  module: ModuleKey | null;
  /**
   * jul 2026 v5.b — `gridMode` true: el nivel Vehículo SIN selección
   * muestra los items repartidos en N columnas de 10 (ITEMS_PER_COLUMN).
   * Esto evita que el contenedor se estire verticalmente cuando hay
   * muchos vehículos. Cuando se selecciona uno, vuelve al layout de
   * columna vertical normal.
   */
  gridMode?: boolean;
}) {
  const Icon = col.Icon;
  const isModuleCol = col.level === "modules";

  // ── gridMode: partir items en chunks de ITEMS_PER_COLUMN ──
  //
  // jul 2026 v5.b — Sin vehículo seleccionado: muestra los items
  // repartidos en N columnas de 10. Con un vehículo seleccionado:
  // filtra visibleItems a solo el seleccionado y queda 1 chunk de
  // 1 item. El contenedor mantiene el mismo layout (grid) en
  // ambos casos para que la altura no "salte".
  const useGrid = gridMode && col.level === "vehicles";
  const hasSelection = selected != null;
  const visibleItems: CascadeItem[] = useGrid
    ? (!hasSelection
        ? items
        : items.filter((it) => {
            const v = valueOfItem(it, col.level);
            return v != null && selected === v;
          })
      )
    : items;
  const chunks: CascadeItem[][] = useGrid
    ? Array.from(
        { length: Math.max(1, Math.ceil(visibleItems.length / ITEMS_PER_COLUMN)) },
        (_, i) => visibleItems.slice(i * ITEMS_PER_COLUMN, (i + 1) * ITEMS_PER_COLUMN),
      )
    : null;

  return (
    <>
      {/* ── Conector horizontal entre columnas (línea que se dibuja) ── */}
      {!isFirst && (
        <div className="flex w-5 shrink-0 flex-col items-center pt-7">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{
              duration: 0.4,
              delay: colIndex * 0.06 - 0.1,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{ transformOrigin: "left center" }}
            className="h-px w-full bg-gradient-to-r from-gray-400/40 to-gray-300 dark:from-white/[0.20] dark:to-white/[0.10]"
          />
        </div>
      )}

      {/* ── Columna ── */}
      {/* jul 2026 v5 — `flex-1` para repartir el espacio disponible
          entre todas las columnas. Mínimo 120px (w-30) y máximo 200px
          (w-52) para que ni queden muy apretadas ni muy anchas.
          jul 2026 v5.b — En grid mode SIN selección, removemos el
          `max-w-[200px]` para que múltiples chunks de 10 items quepan
          por fila. El `min-w-[280px]` asegura que al menos 2 chunks
          (de 120px + gap) se vean lado a lado. CON selección, la
          columna vuelve al tamaño compacto original (1 solo item)
          para que el módulo siguiente quede cerca, sin un hueco
          gigante en el medio. */}
      <motion.div
        layout
        initial={{ opacity: 0, x: 32 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -16 }}
        transition={{ duration: 0.32, delay: colIndex * 0.06, ease: [0.16, 1, 0.3, 1] }}
        className={useGrid && !hasSelection
          ? "flex-1 min-w-[280px] max-w-none"
          : "flex-1 min-w-[120px] max-w-[200px]"
        }
      >
        {/* Label del nivel */}
        <div className="mb-2 flex items-center gap-1.5">
          <Icon size={11} className="text-gray-400 dark:text-gray-500" />
          <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
            {col.title}
          </span>
          {useGrid && items.length > 0 && (
            <span className="text-[9px] tabular-nums text-gray-400 dark:text-gray-500">
              ({items.length})
            </span>
          )}
        </div>

        {/* Contenido de la columna (ramas) */}
        <div className="min-h-[80px]">
          {loading ? (
            <div className="flex items-center gap-1.5 py-1.5 text-[10.5px] text-gray-500">
              <Loader2 size={10} className="animate-spin" />
              Cargando…
            </div>
          ) : items.length === 0 ? (
            <div className="py-1.5 text-[10.5px] italic text-gray-400 dark:text-gray-500">
              Sin opciones
            </div>
          ) : useGrid && chunks ? (
            // ── Modo grid: items repartidos en N columnas de 10 ──
            // Cada "columna" del grid es un <ul> con sus items. El
            // contenedor es un `flex flex-wrap` que pone las columnas
            // lado a lado. Cuando hay un vehículo seleccionado,
            // visibleItems se filtra a solo el seleccionado → quedan
            // 1 chunk de 1 item → los demás ejecutan `exit` con la
            // animación de framer-motion.
            //
            // jul 2026 v5.b.3 — key estable para que AnimatePresence
            // (en chunks y en items) anime la salida de los items en
            // lugar de que el wrapper se re-monte de golpe. Antes el
            // key cambiaba con la selección y eso destruía todo el
            // contenedor, perdiendo la animación de exit.
            <motion.div
              key="vehicles-grid"
              layout
              transition={{ layout: { duration: 0.32, ease: [0.16, 1, 0.3, 1] } }}
              className="flex flex-wrap gap-x-3 gap-y-1"
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {chunks.map((chunk, chunkIdx) => (
                  <motion.ul
                    // Key estable por chunkIdx — el `items.length` NO entra
                    // en la key, así cuando la lista se filtra (ej: solo
                    // queda 1 item seleccionado) Framer Motion puede
                    // animar la salida de los items viejos en lugar de
                    // desmontar y remontar el chunk entero de golpe.
                    key={`chunk-${chunkIdx}`}
                    layout
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{
                      duration: 0.32,
                      delay: chunkIdx * 0.05,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="m-0 flex min-w-[120px] flex-col space-y-0.5 p-0"
                  >
                    <AnimatePresence mode="popLayout" initial={false}>
                      {chunk.map((it, i) => {
                        const v = valueOfItem(it, col.level);
                        const label = labelOfItem(it, col.level);
                        // En grid mode ocultamos el connector ASCII
                        // (├─ └─) porque ya no aporta: ahora es
                        // una grilla plana, no un árbol vertical.
                        const isSelected = v != null && selected === v;
                        const isFlashed = flashed === `${col.level}-${v}`;
                        return (
                          <motion.li
                            key={String(v ?? i)}
                            layout
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -8 }}
                            transition={{ duration: 0.22, delay: i * 0.025 }}
                            className="list-none"
                          >
                            <RamalItem
                              connector=""
                              label={label}
                              secondary={null}
                              isSelected={isSelected}
                              isFlashed={isFlashed}
                              isModule={false}
                              moduleKey={null}
                              onClick={() => onPick(col.level, v, label, it)}
                            />
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </motion.ul>
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <ul className="space-y-0.5">
              <AnimatePresence mode="popLayout">
                {items.map((it, i) => {
                  const v = valueOfItem(it, col.level);
                  const label = labelOfItem(it, col.level);
                  // jul 2026 v5 — En el nivel Vehículo, el `secondary`
                  // (que era el nombre del vehículo) es redundante
                  // con la placa. Lo ocultamos solo ahí. Para los
                  // otros niveles (módulo, categoría, etc.) el
                  // secondary es info útil (count, etc.) y se
                  // mantiene.
                  const secondary = col.level === "vehicles"
                    ? null
                    : secondaryOfItem(it, col.level);
                  const isSelected = v != null && selected === v;
                  const isFlashed = flashed === `${col.level}-${v}`;
                  const isLast = i === items.length - 1;
                  const connector = isLast ? "└─" : (i === 0 && items.length > 1 ? "┌─" : "├─");
                  const isModule = isModuleCol && "count" in it;
                  return (
                    <motion.li
                      key={String(v ?? i)}
                      layout
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.22, delay: i * 0.025 }}
                    >
                      <RamalItem
                        connector={connector}
                        label={label}
                        secondary={secondary}
                        isSelected={isSelected}
                        isFlashed={isFlashed}
                        isModule={isModule}
                        moduleKey={isModule ? (it as any).key as ModuleKey : null}
                        onClick={() => onPick(col.level, v, label, it)}
                      />
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </motion.div>
    </>
  );
}

function RamalItem({ connector, label, secondary, isSelected, isFlashed, isModule, moduleKey, onClick }: {
  connector: string;
  label: string;
  secondary: string | null | undefined;
  isSelected: boolean;
  isFlashed: boolean;
  isModule: boolean;
  moduleKey: ModuleKey | null;
  onClick: () => void;
}) {
  const moduleColor = isModule && moduleKey ? MODULE_COLOR[moduleKey] : null;

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`group relative flex w-full items-baseline gap-1.5 rounded px-1 py-0.5 text-left transition ${
        isSelected
          ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200"
          : "hover:bg-gray-100/60 dark:hover:bg-white/[0.04]"
      }`}
    >
      <span
        className={`select-none font-mono text-[10.5px] leading-[1.5] ${
          isSelected
            ? "text-brand-500 dark:text-brand-300"
            : "text-gray-400 dark:text-gray-500"
        }`}
      >
        {connector}
      </span>

      {/* jul 2026 v5 — `min-w-0` permite que el truncate funcione
          cuando el label es largo y la columna se angosta. */}
      <span className={`min-w-0 flex-1 truncate font-mono text-[11.5px] ${
        isSelected
          ? "font-bold"
          : "font-medium text-gray-800 dark:text-gray-100"
      }`}>
        {isModule && moduleKey ? MODULE_LABELS[moduleKey] : label}
      </span>

      {isModule && moduleKey && (
        <span className="ml-0.5 inline-flex shrink-0 items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
          {(() => {
            const I = MODULE_ICONS[moduleKey];
            return <I size={9} className={moduleColor?.icon ?? ""} />;
          })()}
        </span>
      )}

      {secondary && (
        <span className="ml-1 shrink-0 text-[10px] italic text-gray-500 dark:text-gray-400">
          {secondary}
        </span>
      )}

      {isFlashed && (
        <motion.span
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="pointer-events-none absolute inset-0 rounded bg-brand-400/20"
        />
      )}
    </motion.button>
  );
}

// ─── DetailsPanel ───────────────────────────────────────────────────

function DetailsPanel({ details, loading, module, day, page, onPageChange }: {
  details: any;
  loading: boolean;
  module: ModuleKey | null;
  day: string;
  page: number;
  onPageChange: (p: number) => void;
}) {

  const d = new Date(day + "T00:00:00");
  const dateLabel = d.toLocaleDateString("es", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-12 text-sm text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.02]">
        <Loader2 size={16} className="animate-spin" />
        Cargando detalles…
      </div>
    );
  }

  if (!details || !details.rows || details.rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white/40 px-4 py-8 text-center text-sm text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-400">
        <FileText className="mx-auto mb-2 opacity-50" size={20} />
        No hay datos para {dateLabel}.
      </div>
    );
  }

  // jul 2026 v8 — Paginación
  const total    = details.total ?? details.rows.length;
  const pageSize = details.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.02]">
      <div className="mb-3 flex items-center gap-2">
        <FileText size={14} className="text-gray-500 dark:text-gray-400" />
        <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-gray-700 dark:text-gray-200">
          Detalles del día
        </h3>
        <span className="ml-auto text-[10.5px] text-gray-500 dark:text-gray-400">
          {capitalize(dateLabel)} · {total} {total === 1 ? "registro" : "registros"}
          {totalPages > 1 && <span className="ml-1.5 text-gray-400">(pág. {page}/{totalPages})</span>}
        </span>
      </div>
      {module === "mantenimiento" && <MantenimientoDetails rows={details.rows} />}
      {module === "checklist"     && <ChecklistDetails rows={details.rows} />}
      {module === "combustible"   && <CombustibleDetails rows={details.rows} />}
      {module === "peajes"        && <TollDetails rows={details.rows} />}

      {/* jul 2026 v8 — Controles de paginación. Solo se muestran si
          hay más de 1 página (es decir, total > pageSize). */}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3 dark:border-white/[0.08]">
          <span className="text-[10.5px] text-gray-500 dark:text-gray-400">
            Mostrando {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, total)} de {total}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPageChange(1)}
              disabled={!canPrev}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 transition hover:border-gray-400 disabled:opacity-40 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
              aria-label="Primera página"
            >
              «
            </button>
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={!canPrev}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 transition hover:border-gray-400 disabled:opacity-40 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
              aria-label="Página anterior"
            >
              ‹
            </button>
            <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-bold tabular-nums text-gray-700 dark:bg-white/[0.06] dark:text-gray-200">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={!canNext}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 transition hover:border-gray-400 disabled:opacity-40 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
              aria-label="Página siguiente"
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => onPageChange(totalPages)}
              disabled={!canNext}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 transition hover:border-gray-400 disabled:opacity-40 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200"
              aria-label="Última página"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MantenimientoDetails({ rows }: { rows: any[] }) {
  const [openInvoices, setOpenInvoices] = useState<any[] | null>(null);

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const items    = Array.isArray(r.items) ? r.items : [];
        const invoices = Array.isArray(r.invoices) ? r.invoices : [];
        const laborCost = Number(r.laborCost  ?? 0);
        // jul 2026 v9.2 — Usar `aggregateTotals` (misma lib que el
        // form modal y el drawer) en vez de recalcular a mano. Esto
        // garantiza que el filtrado refleje EXACTAMENTE los mismos
        // números que el mantenimiento directo.
        //
        // Regla de negocio confirmada (jul 2026):
        //   - El IVA se aplica SOLO a los repuestos.
        //   - La mano de obra NO lleva IVA.
        //   - Subtotal = suma de subtotales de items (post-descuento).
        //   - Total    = suma(items.total) + labor   (con IVA en items).
        //
        // Antes (v9.1) hacía la heurística rara del ivaPercent del
        // mantenimiento; eso metía IVA sobre la mano de obra y daba
        // totales diferentes a la pantalla del mantenimiento.
        const partsAgg = aggregateTotals(items.map((it: any) => ({
          quantity:      Number(it.quantity ?? 0),
          unitCost:      Number(it.unitCost ?? 0),
          discountValue: Number(it.discountValue ?? 0),
          discountType:  it.discountType ?? 'amount',
          ivaPercent:    Number(it.ivaPercent ?? 15),
        })));
        const itemsSubtotal = partsAgg.grandSubtotal; // repuestos sin IVA
        const ivaAmount     = partsAgg.grandIva;      // IVA de repuestos
        const itemsTotal    = partsAgg.grandTotal;    // repuestos con IVA
        const subtotal      = itemsSubtotal + laborCost;
        const totalCost     = itemsTotal + laborCost;
        // Necesario para la tabla por item (mismo cálculo):
        const itemTotals = items.map((it: any) => computeItemTotals({
          quantity:      Number(it.quantity ?? 0),
          unitCost:      Number(it.unitCost ?? 0),
          discountValue: Number(it.discountValue ?? 0),
          discountType:  it.discountType ?? 'amount',
          ivaPercent:    Number(it.ivaPercent ?? 15),
        }));
        return (
          <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-white/[0.08] dark:bg-white/[0.02]">
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <span className="text-[13px] font-bold text-gray-800 dark:text-white">
                {r.title || "Mantenimiento"}
              </span>
              <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                {r.category}
              </span>
              <span className="rounded-md bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-200">
                {r.status}
              </span>
              {r.workshopName && (
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  · {r.workshopName}
                </span>
              )}
            </div>
            {r.description && (
              <p className="mb-2 text-[11.5px] text-gray-600 dark:text-gray-300">{r.description}</p>
            )}
            {r.odometerKm != null && (
              <p className="mb-2 text-[10.5px] text-gray-500 dark:text-gray-400">Odómetro: {r.odometerKm} km</p>
            )}

            {/* ── Mano de obra — siempre visible. Si es 0 muestra
                $0.00 para mantener consistencia con la tabla del
                form modal. El borde violeta + icono Wrench le da
                identidad visual propia. */}
            <div className="mt-3 mb-1 flex items-center justify-between rounded-md border border-violet-200/60 bg-violet-50/40 dark:border-violet-500/20 dark:bg-violet-500/[0.05] px-3 py-2">
              <div className="flex items-center gap-2">
                <Wrench size={12} className="text-violet-500" />
                <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                  Mano de obra
                </span>
              </div>
              <span className="text-[12px] font-bold tabular-nums text-violet-700 dark:text-violet-200">
                ${laborCost.toFixed(2)}
              </span>
            </div>

            {/* ── Repuestos / gastos — tabla completa como el form modal ── */}
            {items.length > 0 && (
              <div className="mt-3">
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Repuestos / gastos
                </div>
                {/* jul 2026 v9.3 — Wrapper con scroll vertical acotado
                    (max-h) para que el <thead> pueda ser `sticky` y
                    quede visible al scrollear items largos. El
                    overflow-x-auto se mantiene por si el nombre de
                    algún repuesto es tan largo que necesita scroll
                    horizontal, pero la columna más larga
                    (Repuesto) ya está truncada a 180px, así que
                    en la práctica no debería pasar. */}
                <div className="max-h-[420px] overflow-x-auto overflow-y-auto rounded-md border border-gray-200/60 dark:border-white/[0.06]">
                  <table className="w-full text-[11.5px]">
                    <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm dark:bg-[#0f172a]/95">
                      <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wide text-gray-500 dark:border-white/[0.08] dark:text-gray-400">
                        <th className="whitespace-nowrap px-3 py-2 font-semibold">Repuesto</th>
                        <th className="whitespace-nowrap px-3 py-2 font-semibold">Proveedor</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Cant.</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Precio Unit.</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Desc.</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Subtotal</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">IVA</th>
                        <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it: any, i: number) => {
                        // jul 2026 v9.1 — Usar el cálculo recalculado
                        // en el frontend (itemTotals[i]), NO los
                        // campos subtotal/iva/total del JSON.
                        const t = itemTotals[i] ?? { subtotal: 0, ivaAmount: 0, total: 0 };
                        const sub = t.subtotal;
                        const iva = t.ivaAmount;
                        const tot = t.total;
                        // jul 2026 v9 — descuento formateado como
                        // "$X" o "X%" según discountType. Si es 0,
                        // mostramos "—" para no ensuciar la tabla.
                        const dVal = Number(it.discountValue ?? 0);
                        const dType = it.discountType;
                        const dLabel = dVal > 0
                          ? (dType === "percent" ? `${dVal}%` : `$${dVal.toFixed(2)}`)
                          : "—";
                        return (
                          <tr key={it.id} className="border-b border-gray-100 transition-colors hover:bg-gray-50/50 dark:border-white/[0.04] dark:hover:bg-white/[0.02]">
                            {/* Repuesto: line-clamp-1 + max-w para que
                                nombres largos no rompan la tabla. El
                                `title` muestra el nombre completo al
                                hacer hover. */}
                            <td
                              className="max-w-[180px] truncate px-3 py-2 text-gray-800 dark:text-white"
                              title={it.name}
                            >
                              {it.name}
                            </td>
                            {/* Proveedor: mismo tratamiento. Como
                                casi siempre es el mismo supplier,
                                el line-clamp-1 + truncate lo deja
                                prolijo sin estirar la columna. */}
                            <td
                              className="max-w-[180px] truncate px-3 py-2 text-gray-600 dark:text-gray-300"
                              title={it.supplierName ?? ""}
                            >
                              {it.supplierName ?? "—"}
                            </td>
                            {/* Numéricas: tabular-nums ya estaba, le
                                agrego `min-w` para que las celdas
                                tengan el mismo ancho y los valores
                                no se peguen entre sí. */}
                            <td className="min-w-[44px] whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                              {it.quantity}
                            </td>
                            <td className="min-w-[78px] whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                              ${Number(it.unitCost ?? 0).toFixed(2)}
                            </td>
                            <td className="min-w-[60px] whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                              {dLabel}
                            </td>
                            <td className="min-w-[78px] whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                              ${sub.toFixed(2)}
                            </td>
                            <td className="min-w-[68px] whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                              ${iva.toFixed(2)}
                            </td>
                            <td className="min-w-[80px] whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                              ${tot.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Factura(s) — jul 2026 v10 ── */}
            {invoices.length > 0 && (
              <div className="mt-3 flex items-center justify-between rounded-md border border-blue-200/60 bg-blue-50/40 px-3 py-2 dark:border-blue-500/20 dark:bg-blue-500/[0.05]">
                <div className="flex items-center gap-2">
                  <Receipt size={12} className="text-blue-500" />
                  <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                    {invoices.length === 1 ? "Factura" : `Facturas (${invoices.length})`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenInvoices(invoices)}
                  className="rounded-md border border-blue-300/60 bg-white px-2 py-1 text-[10.5px] font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-500/30 dark:bg-transparent dark:text-blue-300 dark:hover:bg-blue-500/10"
                >
                  Ver factura
                </button>
              </div>
            )}

            {/* ── Footer de totales — Subtotal / Mano de obra / IVA / Total ──
                Sale SIEMPRE, aunque no haya items ni mano de obra —
                el header con la desagregación es parte de la
                "ficha" del mantenimiento. Si todo es $0, se
                muestra igual. */}
            <div className="mt-3 ml-auto max-w-[280px] space-y-1 rounded-md border border-gray-200/60 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.02] px-3 py-2">
              <div className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-300">
                <span>Subtotal repuestos</span>
                <span className="tabular-nums">${itemsSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-300">
                <span>Mano de obra</span>
                <span className="tabular-nums">${laborCost.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-gray-700 dark:text-gray-200 border-t border-gray-200/60 dark:border-white/[0.06] pt-1">
                <span>Subtotal</span>
                <span className="tabular-nums">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-300">
                {/* jul 2026 v9.2 — el IVA del footer es la SUMA del
                    IVA de los repuestos. Cada item puede tener su
                    propio ivaPercent, así que mostramos el total
                    sin porcentaje en el label. Si el cliente quiere
                    ver el desglose, está en la tabla por item. */}
                <span>IVA</span>
                <span className="tabular-nums">${ivaAmount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-[12px] font-black text-gray-900 dark:text-white border-t border-gray-200 dark:border-white/[0.08] pt-1">
                <span>Total</span>
                <span className="tabular-nums">${totalCost.toFixed(2)}</span>
              </div>
            </div>
          </div>
        );
      })}

      <InvoiceModal invoices={openInvoices} onClose={() => setOpenInvoices(null)} />
    </div>
  );
}

function InvoiceModal({ invoices, onClose }: { invoices: any[] | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {invoices && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-[#0f172a]"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-gray-800 dark:text-white">
                {invoices.length === 1 ? "Factura" : `Facturas (${invoices.length})`}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-white"
                aria-label="Cerrar"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {invoices.map((inv) => (
                <div key={inv.id} className="rounded-lg border border-gray-200 p-3 dark:border-white/[0.08]">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[11.5px]">
                    <span className="font-semibold text-gray-800 dark:text-white">
                      {inv.invoiceNumber || "Sin número"}
                    </span>
                    {inv.kind && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                        {String(inv.kind).replace("_", " ")}
                      </span>
                    )}
                    {inv.invoiceDate && (
                      <span className="text-gray-500 dark:text-gray-400">
                        {new Date(`${inv.invoiceDate}T00:00:00`).toLocaleDateString("es")}
                      </span>
                    )}
                    <span className="ml-auto font-bold tabular-nums text-gray-900 dark:text-white">
                      ${Number(inv.total ?? 0).toFixed(2)}
                    </span>
                  </div>
                  {inv.supplierName && (
                    <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">{inv.supplierName}</p>
                  )}
                  {inv.fileUrl ? (
                    inv.fileMimeType?.startsWith("image/") ? (
                      <a href={inv.fileUrl} target="_blank" rel="noreferrer">
                        <img
                          src={inv.fileUrl}
                          alt=""
                          className="max-h-[400px] w-full rounded-md border border-gray-200 object-contain dark:border-white/[0.08]"
                        />
                      </a>
                    ) : (
                      <a
                        href={inv.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-blue-300/60 bg-blue-50/40 px-3 py-2 text-[11.5px] font-semibold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/[0.05] dark:text-blue-300"
                      >
                        <FileText size={13} />
                        Abrir documento
                      </a>
                    )
                  ) : (
                    <p className="text-[11px] italic text-gray-400">Sin archivo adjunto.</p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ChecklistDetails({ rows }: { rows: any[] }) {
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const items = Array.isArray(r.items) ? r.items : [];
        const present = items.filter((i: any) => i.hasItem === "SI").length;
        const absent  = items.filter((i: any) => i.hasItem === "NO").length;
        const bueno   = items.filter((i: any) => i.condition === "Bueno").length;
        const regular = items.filter((i: any) => i.condition === "Regular").length;
        const malo    = items.filter((i: any) => i.condition === "Malo").length;
        const withPhoto    = items.filter((i: any) => i.photoUrl).length;
        const withComment  = items.filter((i: any) => i.comment && String(i.comment).trim().length > 0).length;

        return (
          <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-white/[0.08] dark:bg-white/[0.02]">
            <div className="mb-2 flex flex-wrap items-baseline gap-2">
              <span className="text-[13px] font-bold text-gray-800 dark:text-white">
                {r.category ?? "Checklist"}
              </span>
              <span className="rounded-md bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-200">
                {r.status}
              </span>
              {r.targetLabel && (
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  · {r.targetLabel}
                </span>
              )}
            </div>

            <div className="mb-3 flex flex-wrap items-baseline gap-3 rounded-md bg-cyan-50/40 px-3 py-2 text-[11px] dark:bg-cyan-500/[0.06]">
              <span className="text-gray-600 dark:text-gray-300">Total items:</span>
              <span className="font-bold text-gray-900 dark:text-white">{items.length}</span>
              <span className="ml-2 text-emerald-700 dark:text-emerald-300">Presentes: {present}</span>
              <span className="text-rose-700 dark:text-rose-300">Ausentes: {absent}</span>
              {items.length > 0 && (
                <span className="ml-auto text-gray-500 dark:text-gray-400">
                  Bueno {bueno} · Regular {regular} · Malo {malo}
                  {withPhoto > 0 && (
                    <span className="ml-1.5">· {withPhoto} con foto</span>
                  )}
                  {withComment > 0 && (
                    <span className="ml-1.5">· {withComment} con nota</span>
                  )}
                </span>
              )}
            </div>

            {r.summary && (
              <p className="mb-2 text-[11.5px] text-gray-600 dark:text-gray-300">{r.summary}</p>
            )}
            {r.findings && (
              <p className="mb-2 text-[11.5px] italic text-amber-700 dark:text-amber-300">
                Hallazgos: {r.findings}
              </p>
            )}

            {items.length > 0 ? (
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wide text-gray-500 dark:border-white/[0.08] dark:text-gray-400">
                    <th className="py-1 font-semibold">Item</th>
                    <th className="py-1 text-center font-semibold">Presencia</th>
                    <th className="py-1 text-center font-semibold">Condición</th>
                    <th className="py-1 font-semibold">Comentario</th>
                    <th className="py-1 text-center font-semibold">Foto</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any, i: number) => (
                    <ChecklistItemRow key={i} item={it} />
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-2 text-center text-[11px] italic text-gray-400">
                Sin items registrados en este checklist.
              </div>
            )}

            {r.photoUrls && r.photoUrls.length > 0 && (
              <div className="mt-2">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Fotos generales del checklist
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {r.photoUrls.slice(0, 8).map((p: string, i: number) => (
                    <a key={i} href={p} target="_blank" rel="noreferrer">
                      <img src={p} alt="" className="h-12 w-12 rounded border border-gray-200 object-cover dark:border-white/[0.08]" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChecklistItemRow({ item }: { item: any }) {
  const present = item.hasItem === "SI";
  const condition = item.condition ?? null;
  const conditionColor = condition === "Bueno"
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
    : condition === "Regular"
    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200"
    : condition === "Malo"
    ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
    : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400";
  return (
    <tr className="border-b border-gray-100 dark:border-white/[0.04]">
      <td className="py-1.5 text-gray-800 dark:text-white">
        {item.itemName ?? "—"}
      </td>
      <td className="py-1.5 text-center">
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
          present
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200"
            : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200"
        }`}>
          {present ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
          {item.hasItem ?? "—"}
        </span>
      </td>
      <td className="py-1.5 text-center">
        {condition ? (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${conditionColor}`}>
            {condition}
          </span>
        ) : (
          <span className="text-[10px] text-gray-400">—</span>
        )}
      </td>
      <td className="py-1.5 text-gray-600 dark:text-gray-300">
        {item.comment ? (
          <span className="inline-flex items-start gap-1">
            <MessageSquare size={10} className="mt-0.5 shrink-0 text-gray-400" />
            <span className="italic">"{item.comment}"</span>
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="py-1.5 text-center">
        {item.photoUrl ? (
          <a href={item.photoUrl} target="_blank" rel="noreferrer">
            <img src={item.photoUrl} alt="" className="inline-block h-9 w-9 rounded border border-gray-200 object-cover dark:border-white/[0.08]" />
          </a>
        ) : (
          <ImageIcon size={12} className="inline text-gray-300" />
        )}
      </td>
    </tr>
  );
}

function CombustibleDetails({ rows }: { rows: any[] }) {
  const total = rows.reduce((acc, r) => acc + (r.cost ?? 0), 0);
  const totalGal = rows.reduce((acc, r) => acc + (r.gallons ?? 0), 0);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-3 rounded-md bg-orange-50/50 px-3 py-2 text-[11.5px] dark:bg-orange-500/[0.06]">
        <span className="text-gray-600 dark:text-gray-300">Total día:</span>
        <span className="font-bold tabular-nums text-gray-900 dark:text-white">${total.toFixed(2)}</span>
        <span className="ml-auto text-gray-500 dark:text-gray-400">Galones: <span className="font-semibold text-gray-800 dark:text-white">{totalGal.toFixed(2)}</span></span>
      </div>
      <table className="w-full text-[11.5px]">
        <thead>
          <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wide text-gray-500 dark:border-white/[0.08] dark:text-gray-400">
            <th className="py-1 font-semibold">Estación</th>
            <th className="py-1 font-semibold">Tipo</th>
            <th className="py-1 text-right font-semibold">Galones</th>
            <th className="py-1 text-right font-semibold">Odómetro</th>
            <th className="py-1 text-right font-semibold">Costo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-100 dark:border-white/[0.04]">
              <td className="py-1.5 text-gray-800 dark:text-white">{r.station ?? "—"}</td>
              <td className="py-1.5 text-gray-600 dark:text-gray-300">{r.fuelType ?? "—"}</td>
              <td className="py-1.5 text-right tabular-nums">{r.gallons?.toFixed(2) ?? "—"}</td>
              <td className="py-1.5 text-right tabular-nums">{r.odometer?.toFixed(0) ?? "—"}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                {r.cost != null ? `$${r.cost.toFixed(2)}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TollDetails({ rows }: { rows: any[] }) {
  const total = rows.reduce((acc, r) => acc + (r.cost ?? 0), 0);
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-3 rounded-md bg-amber-50/50 px-3 py-2 text-[11.5px] dark:bg-amber-500/[0.06]">
        <span className="text-gray-600 dark:text-gray-300">Total peajes del día:</span>
        <span className="font-bold tabular-nums text-gray-900 dark:text-white">${total.toFixed(2)}</span>
        <span className="ml-auto text-gray-500 dark:text-gray-400">{rows.length} {rows.length === 1 ? "peaje" : "peajes"}</span>
      </div>
      <table className="w-full text-[11.5px]">
        <thead>
          <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wide text-gray-500 dark:border-white/[0.08] dark:text-gray-400">
            <th className="py-1 font-semibold">Caseta / peaje</th>
            <th className="py-1 font-semibold">Categoría</th>
            <th className="py-1 text-right font-semibold">Costo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-100 dark:border-white/[0.04]">
              <td className="py-1.5 text-gray-800 dark:text-white">{r.tollName}</td>
              <td className="py-1.5 text-gray-600 dark:text-gray-300">{r.category ?? "—"}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums text-gray-900 dark:text-white">
                {r.cost != null ? `$${r.cost.toFixed(2)}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function valueOfItem(it: CascadeItem, level: Col["level"]): number | string | null {
  switch (level) {
    // jul 2026 — fix: este case solo debe LEER el valor del item,
    // igual que los demás. El toggle de selección/deselección vive
    // en onPick (dentro de FiltradoTab), no acá. Antes tenía código
    // pegado de onPick (usaba `v`, `setVehicleId`, `state`, que no
    // existen en este scope) y rompía la compilación.
    case "vehicles":      return (it as any).id ?? null;
    case "modules":       return (it as any).key ?? null;
    case "categories":    return (it as any).id ?? null;
    // jul 2026 v9 — sub-categoría: el backend devuelve `id` (FK
    // positivo o negativo para huérfanas) o `key` (string).
    case "subcategories": return (it as any).id ?? null;
    case "years":         return (it as any).value ?? null;
    case "months":        return (it as any).value ?? null;
    case "weeks":         return (it as any).value ?? null;
    case "days":          return (it as any).value ?? null;
  }
}
function labelOfItem(it: CascadeItem, _level: Col["level"]): string {
  return (it as any).label ?? "";
}
function secondaryOfItem(it: CascadeItem, level: Col["level"]): string | null {
  // jul 2026 v5 — En el nivel MÓDULO no mostramos el count porque
  // es engañoso: el count es el total de registros de la placa en
  // ese módulo, pero no garantiza que haya data cuando bajás a
  // los siguientes niveles (categoría, año, etc). Mejor que el
  // user descubra la data confirmada recién en los niveles hijos.
  if (level === "modules") return null;
  if ("count" in it) return `${it.count} registros`;
  if ((it as any).secondary) return String((it as any).secondary);
  return null;
}
function selectedValueFor(level: Col["level"], s: any): number | string | null {
  switch (level) {
    case "vehicles":      return s.vehicleId;
    case "modules":       return s.module;
    case "categories":    return s.categoryId;
    // jul 2026 v9 — sub-categoría.
    case "subcategories": return s.subcategoryId;
    case "years":         return s.year;
    case "months":        return s.month;
    case "weeks":         return s.week;
    case "days":          return s.day;
  }
}
function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}