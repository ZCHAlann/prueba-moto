/**
 * Buscador global del header.
 *
 * - Dropdown de tipo (vehículo, conductor, mantenimiento, etc.) para
 *   acotar la búsqueda. Si está en "Todos" busca en todos los módulos.
 * - Input con debounce 200ms. Llama a GET /api/company/:id/search?q=...
 * - Dropdown de resultados agrupados por tipo. Click navega al href
 *   del resultado (que ya viene del backend y apunta al detalle del
 *   módulo correspondiente).
 * - Atajos: Cmd/Ctrl+K enfoca, Esc cierra, ↑↓ navega, Enter abre.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { Search, Loader2, X, ChevronDown, Truck, User, Wrench, AlertCircle, ClipboardList, LogOut, MapPin, Store, Building2, ShieldCheck, Snowflake, Fuel, Receipt, Building } from "lucide-react";

type SearchKind =
  | "vehiculo" | "conductor" | "mantenimiento" | "alerta"
  | "checklist" | "autorizacion"
  | "taller" | "proveedor" | "sede" | "seguro" | "aire";

interface SearchHit {
  kind: SearchKind;
  id: number;
  label: string;
  sublabel?: string;
  href: string;
  score: number;
  meta?: Record<string, unknown>;
}

interface SearchResponse {
  ok: boolean;
  data: {
    query: string;
    tipos: SearchKind[];
    total: number;
    resultados: SearchHit[];
  };
  meta: { requestId: string; timestamp: string };
  resumenTexto?: string;
}

const KIND_LABELS: Record<SearchKind | "todos", string> = {
  todos: "Todos",
  vehiculo: "Vehículos",
  conductor: "Conductores",
  mantenimiento: "Mantenimientos",
  alerta: "Alertas",
  checklist: "Checklists",
  autorizacion: "Autorizaciones",
  taller: "Talleres",
  proveedor: "Proveedores",
  sede: "Sedes",
  seguro: "Seguros",
  aire: "Aires acond.",
};

const KIND_ICONS: Record<SearchKind, React.ComponentType<{ size?: number; className?: string }>> = {
  vehiculo: Truck,
  conductor: User,
  mantenimiento: Wrench,
  alerta: AlertCircle,
  checklist: ClipboardList,
  autorizacion: LogOut,
  taller: Store,
  proveedor: Store,
  sede: Building2,
  seguro: ShieldCheck,
  aire: Snowflake,
};

const KIND_COLORS: Record<SearchKind, string> = {
  vehiculo: "text-blue-500",
  conductor: "text-violet-500",
  mantenimiento: "text-amber-500",
  alerta: "text-red-500",
  checklist: "text-emerald-500",
  autorizacion: "text-pink-500",
  taller: "text-orange-500",
  proveedor: "text-cyan-500",
  sede: "text-indigo-500",
  seguro: "text-teal-500",
  aire: "text-sky-500",
};

const KIND_HREF: Record<SearchKind, string> = {
  vehiculo: "/flotas",
  conductor: "/operaciones/conductores",
  mantenimiento: "/mantenimiento",
  alerta: "/alertas",
  checklist: "/checklist",
  autorizacion: "/autorizaciones",
  taller: "/gestion/talleres",
  proveedor: "/gestion/proveedores",
  sede: "/gestion/sedes",
  seguro: "/gestion/seguros",
  aire: "/aires-acondicionados",
};

export function GlobalSearch() {
  const { companyId } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tipo, setTipo] = useState<SearchKind | "todos">("todos");
  const [showFilters, setShowFilters] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce 200ms
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Atajo Cmd/Ctrl+K para enfocar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Cierra al hacer click afuera
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const tipoParam = tipo === "todos" ? undefined : tipo;

  const { data, isFetching } = useQuery<SearchResponse>({
    queryKey: ["global-search", companyId, debounced, tipo],
    enabled: !!companyId && debounced.length >= 2,
    queryFn: async () => {
      const params = new URLSearchParams({ q: debounced });
      if (tipoParam) params.set("tipo", tipoParam);
      const res = await fetch(`/api/company/${companyId}/search?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const results = data?.data?.resultados ?? [];

  // Agrupa por kind (preserva el orden de score dentro de cada grupo)
  const grouped = useMemo(() => {
    const map = new Map<SearchKind, SearchHit[]>();
    for (const r of results) {
      if (!map.has(r.kind)) map.set(r.kind, []);
      map.get(r.kind)!.push(r);
    }
    return Array.from(map.entries());
  }, [results]);

  const flatIndex = useMemo(() => {
    const out: SearchHit[] = [];
    for (const [, list] of grouped) out.push(...list);
    return out;
  }, [grouped]);

  // Reset highlight cuando cambian los resultados
  useEffect(() => { setHighlight(0); }, [debounced, tipo]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, flatIndex.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = flatIndex[highlight];
      if (target) {
        navigate(target.href);
        setOpen(false);
        setQuery("");
      }
    }
  };

  const handleClickResult = (hit: SearchHit) => {
    navigate(hit.href);
    setOpen(false);
    setQuery("");
  };

  const handleClickAllOfKind = (k: SearchKind) => {
    navigate(`${KIND_HREF[k]}?q=${encodeURIComponent(debounced)}`);
    setOpen(false);
    setQuery("");
  };

  const showDropdown = open && debounced.length >= 2;
  const hasResults = flatIndex.length > 0;

  return (
    <div className="relative">
      {/* Input + filtro */}
      <div className="flex items-center gap-2">
        {/* Dropdown de tipo */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className="hidden md:inline-flex h-11 items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]"
            title="Filtrar por tipo"
          >
            {KIND_LABELS[tipo]}
            <ChevronDown size={12} />
          </button>
          {showFilters && (
            <div className="absolute z-50 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-800 dark:bg-gray-900">
              {(["todos", ...Object.keys(KIND_LABELS).filter((k) => k !== "todos")] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setTipo(k as any); setShowFilters(false); }}
                  className={`w-full rounded px-2 py-1.5 text-left text-xs ${tipo === k ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200" : "hover:bg-gray-100 dark:hover:bg-white/[0.06]"}`}
                >
                  {KIND_LABELS[k as keyof typeof KIND_LABELS]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="relative">
          <span className="absolute -translate-y-1/2 pointer-events-none left-4 top-1/2">
            {isFetching ? (
              <Loader2 className="size-5 animate-spin text-violet-500" />
            ) : (
              // jul 2026 v6 — Search es un icon stroke-based de lucide. El
              // fill CSS no aplica; usamos text-* que setea currentColor y
              // lucide lo respeta. Equivale al SVG del header viejo.
              <Search className="size-5 text-gray-500 dark:text-gray-400" strokeWidth={2} />
            )}
          </span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar en todo el sistema..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            className="dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 xl:w-[430px]"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); setOpen(false); inputRef.current?.focus(); }}
              className="absolute right-12 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white"
              title="Limpiar"
            >
              <X size={14} />
            </button>
          )}
          <span className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
            <span>⌘</span><span>K</span>
          </span>
        </div>
      </div>

      {/* Dropdown de resultados */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[520px] overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-2xl dark:border-gray-800 dark:bg-gray-900 xl:w-[600px]"
        >
          {isFetching && !data ? (
            <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-gray-500">
              <Loader2 className="size-4 animate-spin" />
              Buscando...
            </div>
          ) : !hasResults ? (
            <div className="px-3 py-6 text-center text-sm text-gray-500">
              Sin resultados para <span className="font-semibold text-gray-800 dark:text-white">"{debounced}"</span>
              {tipo !== "todos" && <> en <span className="font-semibold">{KIND_LABELS[tipo]}</span></>}.
              <div className="mt-1 text-xs">Probá con otro término o cambiá el filtro.</div>
            </div>
          ) : (
            <>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {results.length} resultado{results.length !== 1 ? "s" : ""} en {grouped.length} módulo{grouped.length !== 1 ? "s" : ""}
              </div>
              {grouped.map(([kind, hits]) => {
                const Icon = KIND_ICONS[kind];
                const color = KIND_COLORS[kind];
                return (
                  <div key={kind} className="mb-2">
                    <div className="flex items-center justify-between px-2 py-1">
                      <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${color}`}>
                        <Icon size={12} />
                        {KIND_LABELS[kind]} <span className="text-gray-500">({hits.length})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleClickAllOfKind(kind)}
                        className="text-[10px] text-violet-600 hover:underline dark:text-violet-400"
                      >
                        Ver todos →
                      </button>
                    </div>
                    {hits.map((h) => {
                      const idx = flatIndex.indexOf(h);
                      const isActive = idx === highlight;
                      return (
                        <button
                          key={`${kind}-${h.id}`}
                          type="button"
                          onMouseEnter={() => setHighlight(idx)}
                          onClick={() => handleClickResult(h)}
                          className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${isActive ? "bg-violet-50 dark:bg-violet-500/10" : "hover:bg-gray-50 dark:hover:bg-white/[0.04]"}`}
                        >
                          <Icon size={14} className={`mt-0.5 shrink-0 ${color}`} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-gray-900 dark:text-white">
                              {h.label}
                            </div>
                            {h.sublabel && (
                              <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                                {h.sublabel}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 self-center text-[10px] text-gray-400">
                            {h.score}%
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              <div className="border-t border-gray-200 px-2 py-1.5 text-[10px] text-gray-400 dark:border-gray-800">
                ↑↓ navegar · Enter abrir · Esc cerrar
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
