// hooks/useFiltradoReport.ts
//
// jul 2026 v1 — Hook para la pestaña "Filtrado" del Centro de Reportes.
//
// Maneja el estado de los 6 niveles del cascada (vehículo, módulo,
// categoría, año, mes, semana) + el día seleccionado, y provee
// fetchers para el siguiente nivel y para los detalles.
//
// Auto-reset: si el padre cambia de vehículo, los niveles siguientes
// (módulo, categoría, año, mes, semana, día) se resetean. Mismo si
// cambia el módulo (categoría/año/mes/semana/día se resetean), etc.
//
// jul 2026 v8 — FIX (reportado por el user): al elegir un vehículo,
// la columna "Vehículo" desaparecía ("Sin opciones"). Causa:
// `setVehicleId` hacía `setLevelItems({})`, que borraba TODO el
// caché de niveles — incluido `vehicles`, que ya estaba cargado y
// no se vuelve a fetchear (el useEffect de cascade solo pide el
// próximo nivel faltante). Ahora `setVehicleId` limpia solo los
// descendientes (módulo, categoría, año, mes, semana, día) y
// conserva `levelItems.vehicles`, igual que ya hacían los demás
// setters (setModule, setCategoryId, etc.) con destructuring
// selectivo.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export type ModuleKey = "combustible" | "peajes" | "mantenimiento" | "checklist";

export type CascadeItem =
  | { id: number; label: string; secondary?: string | null }
  | { key: ModuleKey; label: string; count: number }
  | { id?: number; key?: string; label: string; secondary?: string; hasSubcategories?: boolean }
  | { value: number | string; label: string };

export type CascadeLevel =
  | "vehicles"
  | "modules"
  | "categories"
  | "subcategories"
  | "years"
  | "months"
  | "weeks"
  | "days";

export type CascadeResponse = {
  level: CascadeLevel;
  items: CascadeItem[];
};

export type DetailsRow = Record<string, unknown>;

export type DetailsResponse = {
  module: ModuleKey;
  date: string;
  rows: DetailsRow[];
  // jul 2026 v8 — Paginación. El backend devuelve `page`,
  // `pageSize` y `total`. Si `total > pageSize`, el render
  // muestra controles de paginación.
  page?: number;
  pageSize?: number;
  total?: number;
};

export type CascadeState = {
  vehicleId: number | null;
  module:    ModuleKey | null;
  categoryId: number | null;
  // jul 2026 v5 — String legacy para categorías huérfanas
  // (que no matchean con el catálogo por FK). Se setea cuando
  // el user elige una categoría con id < 0.
  categoryKey: string | null;
  // jul 2026 v9 — Sub-categoría (FK real de la tabla
  // `company_maintenance_subcategories`). Si la categoría padre
  // tiene sub-categorías definidas, el user elige una. Si no
  // (o si el user no quiere), se manda null.
  subcategoryId: number | null;
  subcategoryKey: string | null; // legacy (huérfanas)
  year:       number | null;
  month:      number | null;
  week:       number | null;
  day:        string | null; // YYYY-MM-DD
};

const EMPTY: CascadeState = {
  vehicleId: null, module: null, categoryId: null, categoryKey: null,
  subcategoryId: null, subcategoryKey: null,
  year: null, month: null, week: null, day: null,
};

export function useFiltradoReport() {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [state, setState] = useState<CascadeState>(EMPTY);
  const [currentLevel, setCurrentLevel] = useState<CascadeLevel | null>(null);
  const [items, setItems]     = useState<CascadeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // jul 2026 v2 — Cache de items POR NIVEL. Cada nivel ya elegido
  // guarda su lista de opciones en `levelItems`, así no desaparecen
  // cuando el user avanza al siguiente nivel. El nivel "actual" (el
  // que se está fetcheando) está en `items` y se promueve a
  // `levelItems` cuando el fetch termina exitosamente.
  const [levelItems, setLevelItems] = useState<Partial<Record<CascadeLevel, CascadeItem[]>>>({});

  // jul 2026 — Detalles del día seleccionado. Vive aparte porque solo
  // se fetchea cuando el user llega al final del cascada (day != null)
  // y se resetea apenas cambia cualquier nivel padre.
  const [details, setDetails]     = useState<DetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  // jul 2026 v8 — Paginación de los detalles. El componente
  // <DetailsPanel> lo controla y lo pasa al refetch vía `setDetailsPage`.
  // Lo reseteamos a 1 cuando cambia `day` (cambio de día = nuevo
  // set de registros, arrancamos de la primera página).
  const [detailsPage, setDetailsPage] = useState(1);

  // ── Setters que auto-resetean los niveles hijos ────────────────────
  //
  // jul 2026 v6 — Cada setter limpia explícitamente el cache de los
  // niveles hijos (no dependemos de un useEffect de limpieza que
  // corría en paralelo y podía borrar items válidos durante un
  // fetch en curso). El patrón ahora es: si cambia X, todos los
  // descendientes de X se resetean en state Y en el cache.
  //
  // jul 2026 v8 — `setVehicleId` es el único nivel "raíz": no tiene
  // padre cuyo caché conservar, pero SÍ tiene que conservar su
  // PROPIO nivel (`vehicles`) en el cache, porque ese nivel ya fue
  // fetcheado antes de que el user eligiera y no se vuelve a pedir.

  const setVehicleId = useCallback((id: number | null) => {
    setState({
      vehicleId: id, module: null, categoryId: null, categoryKey: null,
      subcategoryId: null, subcategoryKey: null,
      year: null, month: null, week: null, day: null,
    });
    // Limpiamos módulo, categoría, años, meses, semanas, días —
    // pero conservamos `vehicles` (el propio nivel), igual que los
    // demás setters conservan los niveles ancestros.
    setLevelItems((prev) => {
      const { vehicles } = prev;
      return vehicles ? { vehicles } : {};
    });
    setDetails(null);
  }, []);

  const setModule = useCallback((m: ModuleKey | null) => {
    setState((s) => ({
      ...s, module: m, categoryId: null, categoryKey: null,
      subcategoryId: null, subcategoryKey: null,
      year: null, month: null, week: null, day: null,
    }));
    // Limpiamos categorías, sub-categorías, años, meses, semanas, días.
    setLevelItems((prev) => {
      const { categories, subcategories, years, months, weeks, days, ...rest } = prev;
      return rest;
    });
    setDetails(null);
    setDetailsPage(1);
  }, []);

  const setCategoryId = useCallback((id: number | null, key?: string | null) => {
    setState((s) => ({
      ...s,
      categoryId: id,
      // jul 2026 v5 — Si la categoría es huérfana (id < 0), el
      // backend usa `categoryKey` para filtrar por string legacy.
      // Guardamos el key acá así los niveles siguientes (años,
      // meses, semanas, días, details) pueden pasarlo.
      categoryKey: id == null ? null : (id < 0 ? (key ?? null) : null),
      // jul 2026 v9 — Resetear sub-categoría al cambiar de
      // categoría padre.
      subcategoryId: null,
      subcategoryKey: null,
      year: null, month: null, week: null, day: null,
    }));
    setLevelItems((prev) => {
      const { subcategories, years, months, weeks, days, ...rest } = prev;
      return rest;
    });
    setDetails(null);
    setDetailsPage(1);
  }, []);

  // jul 2026 v9 — Setter explícito para sub-categoría. Si la
  // elegida tiene id positivo, es FK real; si es negativo, es
  // huérfana y `key` trae el string legacy. Limpia años hacia
  // abajo.
  const setSubcategoryId = useCallback((id: number | null, key?: string | null) => {
    setState((s) => ({
      ...s,
      subcategoryId: id,
      subcategoryKey: id == null ? null : (id < 0 ? (key ?? null) : null),
      year: null, month: null, week: null, day: null,
    }));
    setLevelItems((prev) => {
      const { years, months, weeks, days, ...rest } = prev;
      return rest;
    });
    setDetails(null);
    setDetailsPage(1);
  }, []);

  const setYear = useCallback((y: number | null) => {
    setState((s) => ({ ...s, year: y, month: null, week: null, day: null }));
    setLevelItems((prev) => {
      const { months, weeks, days, ...rest } = prev;
      return rest;
    });
    setDetails(null);
  }, []);

  const setMonth = useCallback((m: number | null) => {
    setState((s) => ({ ...s, month: m, week: null, day: null }));
    setLevelItems((prev) => {
      const { weeks, days, ...rest } = prev;
      return rest;
    });
    setDetails(null);
  }, []);

  const setWeek = useCallback((w: number | null) => {
    setState((s) => ({ ...s, week: w, day: null }));
    setLevelItems((prev) => {
      const { days, ...rest } = prev;
      return rest;
    });
    setDetails(null);
  }, []);

  const setDay = useCallback((d: string | null) => {
    setState((s) => ({ ...s, day: d }));
    setDetails(null);
    setDetailsPage(1);
  }, []);

  // ── Fetch del siguiente nivel del cascada ─────────────────────────
  //
  // Determina qué nivel pedirle al backend según los filtros seteados.
  // Si el último nivel seteado es el día, NO pide cascade (el día es
  // el "final" del cascada; el siguiente paso sería ver detalles).

  useEffect(() => {
    if (!companyId) return;

    // Si no hay nada seteado, pedir vehículos.
    // Si está todo seteado hasta el día, no pedir cascade.
    let level: CascadeLevel | null = null;
    if (state.vehicleId == null) level = "vehicles";
    else if (state.module == null) level = "modules";
    else if (state.categoryId == null && needsCategory(state.module)) level = "categories";
    // jul 2026 v9 — Sub-categoría: solo para mantenimiento
    // (checklist no tiene subs).
    //
    // Si la categoría elegida NO tiene sub-categorías definidas
    // en la tabla `company_maintenance_subcategories`, saltamos
    // el nivel directo a años. La fuente de verdad es el backend:
    // cuando devuelve los items de categoría, incluye
    // `hasSubcategories: boolean` por cada uno (calculado con un
    // EXISTS en la DB). Si esa flag es `false`, NO pedimos subs
    // y vamos a años directo. Sin adivinar por id.
    else if (state.subcategoryId == null && needsSubcategory(state.module)) {
      const cat = levelItems.categories?.find(
        (c) => (c as { id?: number }).id === state.categoryId,
      );
      const hasSubcategories = (cat as { hasSubcategories?: boolean } | undefined)?.hasSubcategories === true;
      if (hasSubcategories) {
        level = "subcategories";
      } else {
        // Sin subs definidas → saltamos a años.
        level = "years";
      }
    }
    else if (state.year == null) level = "years";
    else if (state.month == null) level = "months";
    else if (state.week == null) level = "weeks";
    else if (state.day == null) level = "days";

    if (level === null) {
      // jul 2026 v7 — Si ya estamos en el día, el cascada está
      // completo. NO tocamos `items` ni `currentLevel` ni el
      // cache. Antes reseteábamos `items` y `currentLevel` cuando
      // cualquier nivel cambiaba, lo que hacía que las columnas
      // padre (vehículo, módulo) mostraran "Sin opciones" porque
      // el cache se limpiaba en cada re-render del efecto. Ahora,
      // si `level === null` significa que ya estamos al final del
      // cascada — no hay nada que fetchar. Salimos sin tocar nada.
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setCurrentLevel(level);
    setItems([]); // limpiamos los items del nivel actual mientras carga

    const qs = buildQueryString(state);
    fetch(`/api/company/${companyId}/reports/filtrado/cascade?${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: CascadeResponse) => {
        if (cancelled) return;
        const fetched = data.items ?? [];
        // jul 2026 v9 — Si pedimos `subcategories` y el backend
        // devolvió `years` (porque la cat padre no tiene subs
        // definidas), el cascade avanza de largo: guardamos el
        // nivel real en cache pero dejamos `currentLevel` =
        // `years` para que la UI salte la columna de
        // sub-categorías y muestre años. Si pidió años y
        // devolvió subcategories (caso inverso, defensivo), lo
        // aceptamos igual — la UI mostrará la col extra.
        setItems(fetched);
        setCurrentLevel(data.level);
        setLevelItems((prev) => ({ ...prev, [data.level]: fetched }));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Error al cargar");
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, state.vehicleId, state.module, state.categoryId, state.categoryKey, state.subcategoryId, state.subcategoryKey, state.year, state.month, state.week, state.day]);

  // jul 2026 v6 — La limpieza del cache de niveles hijos ya NO
  // corre en un useEffect aparte (causaba race conditions: el
  // effect de limpieza borraba items válidos durante un fetch en
  // curso). Ahora cada setter limpia explícitamente sus descendientes.

  // ── Fetch de los detalles del día seleccionado ───────────────────

  useEffect(() => {
    if (!companyId) return;
    if (state.vehicleId == null || state.module == null || !state.day) {
      setDetails(null);
      return;
    }

    let cancelled = false;
    setDetailsLoading(true);
    const qs = new URLSearchParams();
    qs.set("vehicleId", String(state.vehicleId));
    qs.set("module",    state.module);
    qs.set("date",      state.day);
    if (state.categoryId) qs.set("categoryId", String(state.categoryId));
    if (state.categoryKey) qs.set("categoryKey", state.categoryKey);
    // jul 2026 v9 — Sub-categoría en el endpoint /details. Si
    // está seteada, el backend filtra por FK (o por string si es
    // huérfana).
    if (state.subcategoryId) qs.set("subcategoryId", String(state.subcategoryId));
    if (state.subcategoryKey) qs.set("subcategoryKey", state.subcategoryKey);
    // jul 2026 v8 — Paginación de los detalles
    qs.set("page",     String(detailsPage));
    qs.set("pageSize", "20");

    fetch(`/api/company/${companyId}/reports/filtrado/details?${qs.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: DetailsResponse) => {
        if (cancelled) return;
        setDetails(data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Error al cargar detalles");
        setDetails(null);
      })
      .finally(() => {
        if (!cancelled) setDetailsLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, state.vehicleId, state.module, state.categoryId, state.categoryKey, state.subcategoryId, state.subcategoryKey, state.day, detailsPage]);

  return {
    state,
    currentLevel,
    items,
    levelItems,
    loading,
    error,
    details,
    detailsLoading,
    // jul 2026 v8 — Paginación de los detalles
    detailsPage,
    setDetailsPage,
    setVehicleId, setModule, setCategoryId,
    // jul 2026 v9 — sub-categoría.
    setSubcategoryId,
    setYear, setMonth, setWeek, setDay,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────

function needsCategory(m: ModuleKey | null): boolean {
  if (m == null) return false;
  return m === "mantenimiento" || m === "checklist";
}

// jul 2026 v9 — Solo mantenimiento tiene sub-categorías.
// Si la cat padre no tiene subs, el backend salta el nivel
// devolviendo `years` directamente — eso lo manejamos en el
// useEffect.
function needsSubcategory(m: ModuleKey | null): boolean {
  return m === "mantenimiento";
}

function isFilled(level: CascadeLevel, s: CascadeState): boolean {
  switch (level) {
    case "vehicles":      return s.vehicleId     != null;
    case "modules":       return s.module        != null;
    case "categories":    return s.categoryId    != null;
    case "subcategories": return s.subcategoryId != null;
    case "years":         return s.year          != null;
    case "months":        return s.month         != null;
    case "weeks":         return s.week          != null;
    case "days":          return s.day           != null;
  }
}

function buildQueryString(s: CascadeState): string {
  const qs = new URLSearchParams();
  if (s.vehicleId  != null) qs.set("vehicleId",  String(s.vehicleId));
  if (s.module     != null) qs.set("module",     s.module);
  if (s.categoryId != null) qs.set("categoryId", String(s.categoryId));
  if (s.categoryKey!= null) qs.set("categoryKey", s.categoryKey);
  // jul 2026 v9 — Sub-categoría. Si el user ya eligió una, la
  // mandamos para que el backend filtre por FK (o por string si
  // es huérfana). Si NO eligió (es null), el backend decide
  // si mostrar o saltar el nivel según si la cat padre tiene
  // subs definidas.
  if (s.subcategoryId != null) qs.set("subcategoryId",  String(s.subcategoryId));
  if (s.subcategoryKey!= null) qs.set("subcategoryKey", s.subcategoryKey);
  if (s.year       != null) qs.set("year",       String(s.year));
  if (s.month      != null) qs.set("month",      String(s.month));
  if (s.week       != null) qs.set("week",       String(s.week));
  return qs.toString();
}