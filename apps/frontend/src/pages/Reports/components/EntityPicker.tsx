"use client";

// ─────────────────────────────────────────────────────────────────────────────
// pages/Reports/components/EntityPicker.tsx
//
// Combobox de selección de activos o conductores para los widgets del canvas.
// Soporta modo "single" (1 elemento) y "varios" (N elementos con checkboxes).
//
// Reusa el patrón visual del multiselect de PlantillasManager.tsx: panel
// con búsqueda + lista clickeable. Diferencia: aquí la fuente de datos es
// `useAssets` o `useDrivers`.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Check, Car, User } from "lucide-react";
import { useAssets } from "../../../hooks/useAssets";
import { useDrivers } from "../../../hooks/useDrivers";

export type EntityKind = "asset" | "driver";

export type EntityPickerValue = {
  kind: EntityKind;
  ids: number[];
};

type AssetLite = { id: number; name: string; plate: string | null };
type DriverLite = { id: number; firstName: string; lastName: string };

/**
 * Los IDs que llegan del backend vienen prefijados como string ("asset-123",
 * "company-user-456"). El lienzo necesita el id numérico entero para
 * filtrar por `assets.id` / `drivers.id` en el backend. Extraemos solo los
 * dígitos y devolvemos NaN si el id es inválido (lo filtramos después).
 */
function numericIdFromPrefixed(rawId: unknown): number {
  if (typeof rawId === "number" && Number.isFinite(rawId)) return rawId;
  if (typeof rawId !== "string") return NaN;
  const digits = rawId.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : NaN;
}

export function EntityPicker({
  kind,
  selectedIds,
  multi,
  onChange,
  className,
}: {
  kind: EntityKind;
  selectedIds: number[];
  multi: boolean;
  onChange: (ids: number[]) => void;
  className?: string;
}) {
  const { assets, loading: loadingAssets } = useAssets();
  const { drivers, loading: loadingDrivers } = useDrivers();
  const loading = kind === "asset" ? loadingAssets : loadingDrivers;

  // Normalizamos a un shape común.
  const items = useMemo<Array<{ id: number; label: string; sub: string | null }>>(() => {
    if (kind === "asset") {
      return assets.map((a: AssetLite) => ({
        id: numericIdFromPrefixed(a.id),
        label: a.plate ? `${a.name} · ${a.plate}` : a.name,
        sub: a.plate ?? null,
      }));
    }
    return drivers.map((d: DriverLite) => ({
      id: numericIdFromPrefixed(d.id),
      label: `${d.firstName} ${d.lastName}`.trim(),
      sub: null,
    }));
  }, [kind, assets, drivers]);

  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.label.toLowerCase().includes(q));
  }, [items, search]);

  function toggle(id: number) {
    // Defensa en profundidad: nunca pasar NaN/null al state (el backend
    // rechaza "expected number, received null" porque JSON.stringify(NaN)
    // serializa a null).
    if (!Number.isFinite(id)) return;
    if (multi) {
      onChange(
        selectedIds.includes(id)
          ? selectedIds.filter((x) => x !== id)
          : [...selectedIds, id]
      );
    } else {
      onChange([id]);
      setOpen(false);
    }
  }

  // Helper visual: chips de los seleccionados.
  const selectedItems = selectedIds
    .map((id) => items.find((it) => it.id === id))
    .filter((x): x is { id: number; label: string; sub: string | null } => !!x);

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700 hover:border-gray-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200"
      >
        <span className="flex min-h-[20px] flex-1 flex-wrap items-center gap-1">
          {selectedItems.length === 0 ? (
            <span className="text-xs text-gray-400">
              {kind === "asset" ? "Elegí activos…" : "Elegí conductores…"}
            </span>
          ) : (
            selectedItems.map((it) => (
              <span
                key={it.id}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              >
                {it.label}
                {!multi && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onChange([]); }}
                    className="hover:text-emerald-900 dark:hover:text-emerald-100"
                  >
                    <X size={10} />
                  </button>
                )}
              </span>
            ))
          )}
        </span>
        <span className="text-[10px] text-gray-400">{multi ? `${selectedItems.length} seleccionados` : "single"}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]"
          >
            {/* Search */}
            <div className="border-b border-gray-100 px-3 py-2 dark:border-white/[0.06]">
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Buscar ${kind === "asset" ? "vehículo" : "conductor"}…`}
                  className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-1.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200"
                />
              </div>
            </div>

            {/* Lista */}
            <ul className="max-h-72 overflow-y-auto py-1">
              {loading ? (
                <li className="px-3 py-6 text-center text-xs text-gray-400">Cargando…</li>
              ) : filtered.length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-gray-400">Sin coincidencias.</li>
              ) : (
                filtered.map((it) => {
                  const active = selectedIds.includes(it.id);
                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => toggle(it.id)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition ${
                          active
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                            : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 dark:bg-white/[0.06]">
                          {kind === "asset"
                            ? <Car size={12} className="text-gray-500" />
                            : <User size={12} className="text-gray-500" />}
                        </span>
                        <span className="flex-1 truncate">{it.label}</span>
                        {active && <Check size={14} className="text-emerald-500" />}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}