// pages/Mantenimientos/Data/index.tsx
//
// jul 2026 v9 — Submódulo "Data" de Mantenimientos. Flujo:
//
//   Paso 1: Vehículo (con buscador + paginación infinita).
//   Paso 2: Categorías de mantenimiento (las que tienen data
//           para esa placa), con buscador. Cada una muestra su
//           count.
//   Paso 3 (opcional): si la categoría tiene sub-categorías,
//           las listamos para que el user elija. Si NO tiene
//           subs, saltamos directo al detalle.
//   Paso 4: Detalle del ÚLTIMO mantenimiento de la (placa +
//           cat [+ sub]) elegida, con items/repuestos, mano de
//           obra, IVA y totales.
//
// El detalle es SOLO el último registro (no una lista), porque
// el user quiere ver "lo último que se hizo" en esa (placa, cat).
// Si el user quiere ver todos los registros de esa (placa, cat),
// usa el tab "Historial" o el módulo Filtrado en Reportes.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight, Search, X, Car, Wrench, ArrowLeft, Loader2,
  Database, FileSpreadsheet, Hash, Calendar, Gauge,
  ListChecks, Truck, Tag, ArrowRight, Package,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../context/AuthContext";

// ── Tipos del response del backend ──

type Asset = {
  id: string;
  plate: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  year: string | null;
  status: string;
  siteName: string | null;
};

type Subcategory = {
  id: string;
  key: string;
  label: string;
  shortLabel: string | null;
  color: string;
  icon: string;
  order: number;
  count: number;
};

type Category = {
  key: string;
  label: string;
  shortLabel: string | null;
  color: string;
  icon: string;
  isSystem: boolean;
  isCustom: boolean;
  count: number;
  subcategories: Subcategory[];
};

type LastMaintenanceItem = {
  id: string;
  name: string;
  photoUrl: string | null;
  quantity: number;
  unitCost: number;
  subtotal: number;
  discountType: string;
  discountValue: number;
  ivaPercent: number;
  ivaAmount: number;
  total: number;
  supplierId: string | null;
  supplierName: string | null;
};

type LastMaintenance = {
  id: string;
  title: string | null;
  description: string | null;
  type: string;
  status: string;
  scheduledFor: string | null;
  completedAt: string | null;
  odometerKm: number | null;
  totalCost: number;
  laborCost: number;
  ivaPercent: number;
  notes: string | null;
  attachments: unknown[];
  categoryKey: string;
  categoryLabel: string;
  subcategoryKey: string | null;
  subcategoryLabel: string | null;
  subcategoryColor: string | null;
  workshopName: string | null;
  items: LastMaintenanceItem[];
};

// ── Helpers de formato ──
const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? `${s}T12:00:00Z` : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
};

// Paleta por key de color de la categoría. Mapeo de strings
// de Drizzle a clases de Tailwind (igual que en otras partes del
// proyecto). Si la key no matchea, caemos a slate.
const COLOR_BG: Record<string, string> = {
  sky:     "bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-sky-200/60 dark:ring-sky-500/30",
  violet:  "bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-violet-200/60 dark:ring-violet-500/30",
  amber:   "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-200/60 dark:ring-amber-500/30",
  emerald: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-200/60 dark:ring-emerald-500/30",
  rose:    "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-200/60 dark:ring-rose-500/30",
  cyan:    "bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 ring-cyan-200/60 dark:ring-cyan-500/30",
  orange:  "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 ring-orange-200/60 dark:ring-orange-500/30",
  lime:    "bg-lime-100 dark:bg-lime-500/15 text-lime-700 dark:text-lime-300 ring-lime-200/60 dark:ring-lime-500/30",
  fuchsia: "bg-fuchsia-100 dark:bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 ring-fuchsia-200/60 dark:ring-fuchsia-500/30",
  teal:    "bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 ring-teal-200/60 dark:ring-teal-500/30",
  slate:   "bg-slate-100 dark:bg-slate-500/15 text-slate-700 dark:text-slate-300 ring-slate-200/60 dark:ring-slate-500/30",
};
const colorClass = (k: string) => COLOR_BG[k] ?? COLOR_BG.slate;
const DOT_BG: Record<string, string> = {
  sky:"bg-sky-500",violet:"bg-violet-500",amber:"bg-amber-500",emerald:"bg-emerald-500",
  rose:"bg-rose-500",cyan:"bg-cyan-500",orange:"bg-orange-500",lime:"bg-lime-500",
  fuchsia:"bg-fuchsia-500",teal:"bg-teal-500",slate:"bg-slate-500",
};
const dotClass = (k: string) => DOT_BG[k] ?? DOT_BG.slate;

// ── Fetch helpers ──
async function apiGet<T>(companyId: string, path: string): Promise<T> {
  const res = await fetch(`/api/company/${companyId}${path}`, { credentials: "include" });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

type PageResponse<T> = { data: T[]; total: number; page: number; pageSize: number; totalPages: number };

// ── Componente principal ──

export default function DataPage() {
  const { companyId } = useAuth();

  // Steps: 0=vehículo, 1=cat, 2=sub (opcional), 3=detalle
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedCat, setSelectedCat]     = useState<Category | null>(null);
  const [selectedSub, setSelectedSub]     = useState<Subcategory | null>(null);

  // ── Step 1: vehículos con paginación infinita (6 por página) ──
  // jul 2026 v9 — Paginamos de 6 en 6 (mismo tamaño que la
  // lista de mantenimientos del tab principal, mantiene la
  // consistencia visual del módulo). El sentinel solo dispara
  // cuando la lista YA TIENE items Y el sentinel entra en
  // viewport — eso evita el bug del observer anterior que
  // disparaba al mount con la lista vacía.
  const PAGE_SIZE = 6;
  const [assets, setAssets]               = useState<Asset[]>([]);
  const [assetsTotal, setAssetsTotal]     = useState(0);
  const [assetsPage, setAssetsPage]       = useState(1);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsHasMore, setAssetsHasMore] = useState(true);
  const [vehicleQuery, setVehicleQuery]   = useState("");
  const assetsReqRef = useRef(0);

  const loadAssetsPage = useCallback(async (page: number, q: string, reset = false) => {
    if (!companyId) return;
    const reqId = ++assetsReqRef.current;
    setAssetsLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      params.set("page",     String(page));
      params.set("pageSize", String(PAGE_SIZE));
      const r = await apiGet<PageResponse<Asset>>(
        companyId, `/maintenance-data/assets?${params.toString()}`,
      );
      // Solo aplicamos si esta sigue siendo la última request.
      // Si el user escribió en el buscador mientras esta
      // request estaba en vuelo, descartamos la respuesta
      // vieja y dejamos que la nueva la sobreescriba.
      if (reqId !== assetsReqRef.current) return;
      setAssets((prev) => reset ? r.data : [...prev, ...r.data]);
      setAssetsTotal(r.total);
      setAssetsPage(page);
      setAssetsHasMore(page < r.totalPages);
    } catch {
      if (reqId !== assetsReqRef.current) return;
      if (reset) { setAssets([]); setAssetsTotal(0); }
      setAssetsHasMore(false);
    } finally {
      if (reqId === assetsReqRef.current) setAssetsLoading(false);
    }
  }, [companyId]);

  // Reset y carga inicial cada vez que cambia el query.
  useEffect(() => {
    setAssets([]);
    setAssetsHasMore(true);
    setAssetsPage(1);
    void loadAssetsPage(1, vehicleQuery, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, vehicleQuery]);

  // Sentinel para infinite scroll. Solo dispara cuando:
  //   1) La lista YA tiene items (evita el bug de "lista vacía
  //      al mount → observer ve sentinel visible → dispara").
  //   2) Hay más páginas por cargar (assetsHasMore).
  //   3) No hay una request en curso (assetsLoading).
  const vehicleSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (step !== 0) return;
    const el = vehicleSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (
          e.isIntersecting &&
          !assetsLoading &&
          assetsHasMore &&
          assets.length > 0 // ← clave: solo dispara si ya hay items
        ) {
          void loadAssetsPage(assetsPage + 1, vehicleQuery, false);
        }
      }
    }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [step, assetsLoading, assetsHasMore, assetsPage, assets.length, vehicleQuery, loadAssetsPage]);

  // ── Step 2: categorías de mantenimiento para la placa ──
  const [cats, setCats]           = useState<Category[]>([]);
  const [catsLoading, setCatsLoading] = useState(false);
  const [catQuery, setCatQuery]   = useState("");

  const loadCats = useCallback(async () => {
    if (!companyId || !selectedAsset) return;
    setCatsLoading(true);
    try {
      const r = await apiGet<{ data: Category[]; assetId: string }>(
        companyId,
        `/maintenance-data/categories?assetId=${encodeURIComponent(selectedAsset.id)}`,
      );
      setCats(r.data.filter((c) => c.count > 0)); // solo las que tienen data
    } catch {
      setCats([]);
    } finally {
      setCatsLoading(false);
    }
  }, [companyId, selectedAsset]);

  useEffect(() => {
    if (step === 1 && selectedAsset) void loadCats();
  }, [step, selectedAsset, loadCats]);

  // ── Step 4: último mantenimiento ──
  const [last, setLast]           = useState<LastMaintenance | null>(null);
  const [lastLoading, setLastLoading] = useState(false);
  const loadLast = useCallback(async () => {
    if (!companyId || !selectedCat) return;
    setLastLoading(true);
    try {
      const params = new URLSearchParams({
        assetId:  selectedAsset!.id,
        category: selectedCat.key,
      });
      if (selectedSub) params.set("subcategoryId", selectedSub.id);
      const r = await apiGet<{ data: LastMaintenance | null }>(
        companyId,
        `/maintenance-data/last-maintenance?${params.toString()}`,
      );
      setLast(r.data);
    } catch {
      setLast(null);
    } finally {
      setLastLoading(false);
    }
  }, [companyId, selectedAsset, selectedCat, selectedSub]);

  useEffect(() => {
    if (step === 3) void loadLast();
  }, [step, loadLast]);

  // ── Handlers de navegación ──
  function pickAsset(a: Asset) {
    setSelectedAsset(a);
    setSelectedCat(null);
    setSelectedSub(null);
    setStep(1);
  }
  function pickCat(c: Category) {
    setSelectedCat(c);
    setSelectedSub(null);
    if (c.subcategories && c.subcategories.length > 0) {
      setStep(2);
    } else {
      setStep(3);
    }
  }
  function pickSub(s: Subcategory | null) {
    setSelectedSub(s);
    setStep(3);
  }
  function goBack() {
    if (step === 3) {
      // Volver a subs si la cat tiene subs, si no a cats
      if (selectedCat?.subcategories?.length) setStep(2);
      else setStep(1);
    } else if (step === 2) {
      setStep(1);
      setSelectedSub(null);
    } else if (step === 1) {
      setStep(0);
      setSelectedCat(null);
      setSelectedSub(null);
    }
  }
  function restart() {
    setStep(0);
    setSelectedAsset(null);
    setSelectedCat(null);
    setSelectedSub(null);
    setLast(null);
  }

  // ── Filtrado local de categorías (buscador) ──
  const filteredCats = useMemo(() => {
    const q = catQuery.trim().toLowerCase();
    if (!q) return cats;
    return cats.filter(
      (c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q),
    );
  }, [cats, catQuery]);

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-center gap-3"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-600 dark:text-fuchsia-300">
          <Database size={17} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-gray-800 dark:text-white">Data</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Elige un vehículo, luego su categoría (y sub-categoría si tiene) y te mostramos el último mantenimiento.
          </p>
        </div>
      </motion.div>

      {/* Stepper compacto */}
      <Stepper step={step} selectedAsset={selectedAsset} selectedCat={selectedCat} selectedSub={selectedSub} onStepClick={(s) => { if (s < step) setStep(s); }} />

      {/* Card de contenido */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0b0f1a] overflow-hidden">
        <AnimatePresence mode="wait">

          {/* ────────────── Step 0: vehículos ────────────── */}
          {step === 0 && (
            <motion.div
              key="s0"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
              className="p-5 space-y-4"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300">
                  <Truck size={14} />
                </div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-white">Paso 1 · Vehículo</h3>
                <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500">
                  {assetsLoading ? "Cargando…" : `${assetsTotal} vehículo${assetsTotal !== 1 ? "s" : ""}`}
                </span>
              </div>

              {/* Buscador */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="h-9 w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.04] pl-9 pr-3 text-xs text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:border-fuchsia-500/60 focus:outline-none transition"
                  placeholder="Buscar por placa o nombre…"
                  value={vehicleQuery}
                  onChange={(e) => setVehicleQuery(e.target.value)}
                />
              </div>

              {/* Lista */}
              <div className="max-h-[480px] overflow-y-auto space-y-1.5 pr-1">
                {assets.length === 0 && !assetsLoading ? (
                  <Empty msg="Sin vehículos" />
                ) : (
                  assets.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => pickAsset(a)}
                      className="w-full flex items-center gap-3 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-gray-50/40 dark:bg-white/[0.02] hover:border-fuchsia-300 dark:hover:border-fuchsia-500/40 hover:bg-fuchsia-50/40 dark:hover:bg-fuchsia-500/[0.06] px-3 py-2.5 text-left transition"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300 shrink-0">
                        <Car size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-gray-800 dark:text-white">{a.plate ?? "—"}</p>
                        <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                          {a.name}{a.year ? ` · ${a.year}` : ""}{a.siteName ? ` · ${a.siteName}` : ""}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-gray-300 dark:text-gray-600" />
                    </button>
                  ))
                )}
                {/* Sentinel del infinite scroll — solo visible
                    cuando hay MÁS páginas por cargar. El observer
                    lo detecta y dispara la siguiente request. */}
                {assetsHasMore && (
                  <div ref={vehicleSentinelRef} className="flex items-center justify-center py-3 text-[10px] text-gray-400 dark:text-gray-500">
                    {assetsLoading ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 size={11} className="animate-spin" /> Cargando más…
                      </span>
                    ) : (
                      <span>Desplazá para ver más</span>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ────────────── Step 1: categorías ────────────── */}
          {step === 1 && (
            <motion.div
              key="s1"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
              className="p-5 space-y-4"
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={goBack}
                  className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                  title="Volver"
                >
                  <ArrowLeft size={14} />
                </button>
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300">
                  <Tag size={14} />
                </div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-white">
                  Paso 2 · Categoría ({selectedAsset?.plate})
                </h3>
                <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500">
                  {catsLoading ? "Cargando…" : `${cats.length} cat. con data`}
                </span>
              </div>

              {/* Buscador */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="h-9 w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.04] pl-9 pr-3 text-xs text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:border-fuchsia-500/60 focus:outline-none transition"
                  placeholder="Buscar categoría…"
                  value={catQuery}
                  onChange={(e) => setCatQuery(e.target.value)}
                />
              </div>

              <div className="max-h-[480px] overflow-y-auto space-y-1.5 pr-1">
                {catsLoading ? (
                  <div className="flex items-center justify-center py-6 text-gray-400">
                    <Loader2 size={14} className="animate-spin mr-2" /> Cargando…
                  </div>
                ) : filteredCats.length === 0 ? (
                  <Empty msg={cats.length === 0 ? "Este vehículo no tiene mantenimientos aún" : "Sin coincidencias"} />
                ) : (
                  filteredCats.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => pickCat(c)}
                      className="w-full flex items-center gap-3 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-gray-50/40 dark:bg-white/[0.02] hover:border-fuchsia-300 dark:hover:border-fuchsia-500/40 hover:bg-fuchsia-50/40 dark:hover:bg-fuchsia-500/[0.06] px-3 py-2.5 text-left transition"
                    >
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotClass(c.color)}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-gray-800 dark:text-white">{c.label}</p>
                        <p className="truncate text-[11px] font-mono text-gray-400 dark:text-gray-500">{c.key}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 ${colorClass(c.color)}`}>
                        <Hash size={10} />
                        {c.count} {c.count === 1 ? "mantenimiento" : "mantenimientos"}
                      </span>
                      {(c.subcategories?.length ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-fuchsia-500 dark:text-fuchsia-300/80" title="Tiene sub-categorías">
                          <ListChecks size={10} /> {c.subcategories.length}
                        </span>
                      )}
                      <ChevronRight size={14} className="text-gray-300 dark:text-gray-600" />
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {/* ────────────── Step 2: sub-categorías ────────────── */}
          {step === 2 && selectedCat && (
            <motion.div
              key="s2"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
              className="p-5 space-y-4"
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={goBack}
                  className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                  title="Volver"
                >
                  <ArrowLeft size={14} />
                </button>
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300">
                  <ListChecks size={14} />
                </div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-white">
                  Paso 3 · Sub-categoría ({selectedCat.label})
                </h3>
                <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500">
                  {selectedCat.subcategories?.length ?? 0} disponibles
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Esta categoría tiene sub-categorías. Elegí una para ver el último mantenimiento, o salteá para ver el de la categoría padre.
              </p>
              <div className="max-h-[480px] overflow-y-auto space-y-1.5 pr-1">
                {(selectedCat.subcategories ?? []).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => pickSub(s)}
                    className="w-full flex items-center gap-3 rounded-lg border border-gray-200 dark:border-white/[0.06] bg-gray-50/40 dark:bg-white/[0.02] hover:border-fuchsia-300 dark:hover:border-fuchsia-500/40 hover:bg-fuchsia-50/40 dark:hover:bg-fuchsia-500/[0.06] px-3 py-2.5 text-left transition"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-gray-800 dark:text-white">{s.label}</p>
                      <p className="truncate text-[11px] font-mono text-gray-400 dark:text-gray-500">{s.key}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-gray-300">
                      <Hash size={10} />{s.count}
                    </span>
                    <ChevronRight size={14} className="text-gray-300 dark:text-gray-600" />
                  </button>
                ))}
                {/* Opción "Sin sub-categoría" — para los mantenimientos
                    que NO tienen sub asignada. */}
                <button
                  onClick={() => pickSub(null)}
                  className="w-full flex items-center gap-3 rounded-lg border border-dashed border-gray-300 dark:border-white/[0.08] px-3 py-2.5 text-left text-gray-500 dark:text-gray-400 hover:text-fuchsia-600 dark:hover:text-fuchsia-300 hover:border-fuchsia-300 transition"
                >
                  <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-gray-300 dark:bg-gray-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold">Mantenimientos sin sub-categoría</p>
                    <p className="truncate text-[10.5px] text-gray-400">Los de esta categoría que no tienen sub asignada</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ────────────── Step 3: detalle del último mantenimiento ────────────── */}
          {step === 3 && (
            <motion.div
              key="s3"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
              className="p-5 space-y-4"
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={goBack}
                  className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                  title="Volver"
                >
                  <ArrowLeft size={14} />
                </button>
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300">
                  <FileSpreadsheet size={14} />
                </div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-white">
                  Último mantenimiento
                </h3>
                <button
                  onClick={restart}
                  className="ml-auto inline-flex items-center gap-1 text-[11px] text-fuchsia-500 dark:text-fuchsia-300/80 hover:text-fuchsia-700 dark:hover:text-fuchsia-200 transition"
                >
                  <X size={11} /> Reiniciar
                </button>
              </div>

              {/* Breadcrumb */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-gray-200">
                  <Car size={10} /> {selectedAsset?.plate ?? "—"}
                </span>
                <ChevronRight size={10} className="text-gray-300" />
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${colorClass(selectedCat?.color ?? "slate")}`}>
                  <Tag size={10} /> {selectedCat?.label ?? "—"}
                </span>
                {selectedSub && (
                  <>
                    <ChevronRight size={10} className="text-gray-300" />
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-fuchsia-50 dark:bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300">
                      <ListChecks size={10} style={{ color: selectedSub.color }} /> {selectedSub.label}
                    </span>
                  </>
                )}
              </div>

              {lastLoading ? (
                <div className="flex items-center justify-center py-10 text-gray-400">
                  <Loader2 size={16} className="animate-spin mr-2" /> Cargando…
                </div>
              ) : !last ? (
                <Empty msg="No hay mantenimientos para esta combinación" />
              ) : (
                <div className="space-y-3">
                  {/* Card header del mantenimiento */}
                  <div className="rounded-lg border border-gray-200 dark:border-white/[0.08] bg-gray-50/40 dark:bg-white/[0.02] p-3.5">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[13px] font-bold text-gray-800 dark:text-white">
                        {last.title || "Mantenimiento"}
                      </span>
                      <span className="rounded-md bg-gray-100 dark:bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                        {last.type}
                      </span>
                      <span className="rounded-md bg-fuchsia-100 dark:bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-700 dark:text-fuchsia-200">
                        {last.status}
                      </span>
                      {last.workshopName && (
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          · {last.workshopName}
                        </span>
                      )}
                      <span className="ml-auto text-[12px] font-black tabular-nums text-gray-900 dark:text-white">
                        {fmtMoney(last.totalCost)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={11} /> Programado: {fmtDate(last.scheduledFor)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={11} /> Completado: {fmtDate(last.completedAt)}
                      </span>
                      {last.odometerKm != null && (
                        <span className="inline-flex items-center gap-1">
                          <Gauge size={11} /> {last.odometerKm.toLocaleString("es-EC")} km
                        </span>
                      )}
                    </div>
                    {last.description && (
                      <p className="mt-2 text-[11.5px] text-gray-600 dark:text-gray-300">{last.description}</p>
                    )}
                  </div>

                  {/* Repuestos / items */}
                  {last.items.length > 0 ? (
                    <div className="rounded-lg border border-gray-200 dark:border-white/[0.08] overflow-hidden">
                      <div className="px-3 py-1.5 bg-gray-50 dark:bg-white/[0.04] text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Repuestos
                      </div>
                      <table className="w-full text-[11.5px]">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-400">
                            <th className="px-3 py-1.5 text-left font-semibold">Repuesto</th>
                            <th className="px-3 py-1.5 text-left font-semibold">Proveedor</th>
                            <th className="px-3 py-1.5 text-right font-semibold">Cant.</th>
                            <th className="px-3 py-1.5 text-right font-semibold">Precio</th>
                            <th className="px-3 py-1.5 text-right font-semibold">Subtotal</th>
                            <th className="px-3 py-1.5 text-right font-semibold">IVA</th>
                            <th className="px-3 py-1.5 text-right font-semibold">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {last.items.map((it) => (
                            <tr key={it.id} className="border-b border-gray-100 dark:border-white/[0.04] last:border-b-0">
                              <td className="px-3 py-1.5 text-gray-800 dark:text-white">{it.name}</td>
                              <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300">{it.supplierName ?? "—"}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-200">{it.quantity}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-200">{fmtMoney(it.unitCost)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-200">{fmtMoney(it.subtotal)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-200">{fmtMoney(it.ivaAmount)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-900 dark:text-white">{fmtMoney(it.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 italic px-1">Sin repuestos registrados.</p>
                  )}

                  {/* Footer de totales — siempre visible */}
                  <div className="ml-auto max-w-[280px] space-y-1 rounded-md border border-gray-200/60 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.02] px-3 py-2">
                    <div className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-300">
                      <span>Subtotal repuestos</span>
                      <span className="tabular-nums">
                        {fmtMoney(last.items.reduce((acc, it) => acc + (it.subtotal ?? 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-300">
                      <span>Mano de obra</span>
                      <span className="tabular-nums">{fmtMoney(last.laborCost)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-gray-700 dark:text-gray-200 border-t border-gray-200/60 dark:border-white/[0.06] pt-1">
                      <span>Subtotal</span>
                      <span className="tabular-nums">
                        {fmtMoney(
                          last.items.reduce((acc, it) => acc + (it.subtotal ?? 0), 0) + last.laborCost,
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-300">
                      <span>IVA ({last.ivaPercent}%)</span>
                      <span className="tabular-nums">
                        {fmtMoney(
                          (last.items.reduce((acc, it) => acc + (it.subtotal ?? 0), 0) + last.laborCost) *
                            (last.ivaPercent / 100),
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[12px] font-black text-gray-900 dark:text-white border-t border-gray-200 dark:border-white/[0.08] pt-1">
                      <span>Total</span>
                      <span className="tabular-nums">{fmtMoney(last.totalCost)}</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Stepper compacto ──
function Stepper({
  step, selectedAsset, selectedCat, selectedSub, onStepClick,
}: {
  step: 0 | 1 | 2 | 3;
  selectedAsset: Asset | null;
  selectedCat: Category | null;
  selectedSub: Subcategory | null;
  onStepClick: (s: 0 | 1 | 2 | 3) => void;
}) {
  const steps: Array<{ id: 0 | 1 | 2 | 3; label: string; sublabel: string | null }> = [
    { id: 0, label: "Vehículo",     sublabel: selectedAsset?.plate ?? null },
    { id: 1, label: "Categoría",    sublabel: selectedCat?.label ?? null },
    { id: 2, label: "Sub-categoría", sublabel: selectedSub?.label ?? "(sin sub)" },
    { id: 3, label: "Detalle",      sublabel: null },
  ];
  return (
    <ol className="flex items-center gap-2 overflow-x-auto pb-1">
      {steps.map((s, i) => {
        const isActive = step === s.id;
        const isDone   = step > s.id;
        const isClickable = isDone;
        return (
          <li key={s.id} className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => isClickable && onStepClick(s.id)}
              disabled={!isClickable}
              className={[
                "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold transition border",
                isActive
                  ? "bg-fuchsia-600 text-white border-fuchsia-600 shadow-sm"
                  : isDone
                  ? "bg-fuchsia-50 dark:bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-500/30 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-500/25 cursor-pointer"
                  : "bg-gray-100 dark:bg-white/[0.04] text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/[0.06] cursor-default",
              ].join(" ")}
            >
              <span className={[
                "inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black",
                isActive ? "bg-white/20 text-white" : isDone ? "bg-fuchsia-500/30" : "bg-gray-300 dark:bg-white/[0.1]",
              ].join(" ")}>
                {isDone ? "✓" : i + 1}
              </span>
              <span>{s.label}</span>
              {s.sublabel && (
                <span className={[
                  "text-[10px] font-normal",
                  isActive ? "text-white/80" : "text-gray-500 dark:text-gray-400",
                ].join(" ")}>
                  · {s.sublabel}
                </span>
              )}
            </button>
            {i < steps.length - 1 && <ArrowRight size={11} className="text-gray-300 dark:text-gray-600" />}
          </li>
        );
      })}
    </ol>
  );
}

// ── Empty state ──
function Empty({ msg }: { msg: string }) {
  return (
    <div className="py-10 text-center text-[12px] text-gray-400 dark:text-gray-500">
      {msg}
    </div>
  );
}
