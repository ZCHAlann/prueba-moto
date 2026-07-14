import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3, Table2, RefreshCw, AlertOctagon,
  AlertTriangle, TrendingUp, Layers, Activity,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Legend,
  LineChart, Line, Brush, ReferenceLine,
  Treemap,
} from "recharts";
import { useFleetHealth, type FleetHealthItem, type FleetHealthTier } from "../../../hooks/useFleetHealth";
import { fmtTimeEc } from "@/lib/datetime";

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_ORDER: FleetHealthTier[] = ["free", "starter", "pro", "enterprise"];
const TIER_LABELS: Record<FleetHealthTier, string> = {
  free: "Free", starter: "Starter", pro: "Pro", enterprise: "Enterprise",
};
const TIER_COLORS: Record<FleetHealthTier, string> = {
  free: "#888780", starter: "#0891b2", pro: "#3b82f6", enterprise: "#7c3aed",
};

function satColor(pct: number | null) {
  if (pct === null) return "#888780";
  if (pct >= 90) return "#e24b4a";
  if (pct >= 80) return "#ef9f27";
  if (pct >= 60) return "#facc15";
  return "#1d9e75";
}

function satTextClass(pct: number | null) {
  if (pct === null) return "text-gray-400";
  if (pct >= 90) return "text-rose-600 dark:text-rose-400";
  if (pct >= 80) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

const AVATAR_PALETTE = [
  ["bg-brand-100 dark:bg-brand-500/20", "text-brand-700 dark:text-brand-300"],
  ["bg-violet-100 dark:bg-violet-500/20", "text-violet-700 dark:text-violet-300"],
  ["bg-emerald-100 dark:bg-emerald-500/20", "text-emerald-700 dark:text-emerald-300"],
  ["bg-amber-100 dark:bg-amber-500/20", "text-amber-700 dark:text-amber-300"],
  ["bg-rose-100 dark:bg-rose-500/20", "text-rose-700 dark:text-rose-300"],
  ["bg-cyan-100 dark:bg-cyan-500/20", "text-cyan-700 dark:text-cyan-300"],
];
function avatarColor(name: string) {
  return AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length];
}

// ─── Real historical data ────────────────────────────────────────────────────
// Usa `totalByMonth` (12 meses, acumulado) que viene del backend
// (GET /platform/fleet-health). El último elemento coincide con
// `totalAssets` para que la línea cierre con el valor real. Los meses
// anteriores a la creación de la empresa quedan en 0.
//
// Las labels de los 12 meses vienen DEL BACKEND (ventana móvil: hace
// 11 meses → mes actual). Si el backend no las manda, caemos a
// Ene..Dic del año corriente — pero el backend SIEMPRE las manda.

function buildHistoricalData(data: FleetHealthItem[], monthLabels: string[]) {
  return monthLabels.map((month, i) => {
    const point: Record<string, any> = { month };
    data.forEach(c => {
      const series = c.totalByMonth;
      point[c.name] = Array.isArray(series) && series.length === 12
        ? series[i]
        : (i === monthLabels.length - 1 ? c.totalAssets : 0);
    });
    return point;
  });
}

// ─── Custom Tooltips ──────────────────────────────────────────────────────────

function BaseTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-lg dark:border-white/[0.08] dark:bg-gray-900">
      <p className="mb-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[11px]">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-500 dark:text-gray-400">{p.name}:</span>
          <span className="font-semibold" style={{ color: p.color }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function SatTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-lg dark:border-white/[0.08] dark:bg-gray-900">
      <p className="mb-1 text-[11px] font-semibold text-gray-700 dark:text-gray-200">{label}</p>
      <p className="text-[11px]" style={{ color: satColor(v) }}>
        <span className="font-bold">{v}%</span> saturación
      </p>
    </div>
  );
}

// ─── ChartCard wrapper ────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children, className = "" }: {
  title: string; subtitle?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.06] dark:bg-white/[0.03] ${className}`}>
      <div className="mb-1">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</p>
        {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

// ─── 1. Line Chart — crecimiento de assets con zoom (Brush) ──────────────────

function AssetGrowthChart({ data, selected, onSelect, monthLabels }: {
  data: FleetHealthItem[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  monthLabels: string[];
}) {
  const historical = useMemo(() => buildHistoricalData(data, monthLabels), [data, monthLabels]);

  const LINE_PALETTE = [
    "#3b82f6", "#7c3aed", "#1d9e75", "#ef9f27",
    "#e24b4a", "#0891b2", "#d4537e", "#639922",
  ];

  const op = (id: number) => selected === null ? 1 : selected === id ? 1 : 0.12;

  return (
    <ChartCard
      title="Crecimiento de assets"
      subtitle="Acumulado de los últimos 12 meses por empresa. Antes de su creación, el valor es 0."
    >
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={historical} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.08)" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "#888780" }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#888780" }}
              axisLine={false} tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<BaseTooltip />} />
            <Brush
              dataKey="month"
              height={20}
              stroke="rgba(128,128,128,0.15)"
              fill="transparent"
              travellerWidth={6}
              startIndex={0}
              endIndex={historical.length - 1}
              style={{ fontSize: 10 }}
            />
            {data.map((c, i) => (
              <Line
                key={c.companyId}
                type="monotone"
                dataKey={c.name}
                stroke={LINE_PALETTE[i % LINE_PALETTE.length]}
                strokeWidth={selected === c.companyId ? 2.5 : 1.5}
                dot={false}
                activeDot={{
                  r: 4,
                  onClick: () => onSelect(selected === c.companyId ? null : c.companyId),
                  style: { cursor: "pointer" },
                }}
                strokeOpacity={op(c.companyId)}
                style={{ cursor: "pointer" }}
                onClick={() => onSelect(selected === c.companyId ? null : c.companyId)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Mini legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {data.map((c, i) => (
          <button
            key={c.companyId}
            type="button"
            onClick={() => onSelect(selected === c.companyId ? null : c.companyId)}
            className="flex items-center gap-1.5 transition-opacity"
            style={{ opacity: op(c.companyId) }}
          >
            <span className="h-2 w-4 rounded-full" style={{ background: LINE_PALETTE[i % LINE_PALETTE.length] }} />
            <span className="text-[10px] text-gray-500 dark:text-gray-400">{c.name}</span>
          </button>
        ))}
      </div>
    </ChartCard>
  );
}

// ─── 2. Barras verticales dobles — assets usados vs límite ───────────────────

function AssetsVsLimitChart({ data, selected, onSelect }: {
  data: FleetHealthItem[]; selected: number | null; onSelect: (id: number | null) => void;
}) {
  const chartData = useMemo(() =>
    data.map(c => ({
      name: c.name.length > 10 ? c.name.slice(0, 9) + "…" : c.name,
      fullName: c.name,
      usados: c.totalAssets,
      limite: c.maxAssets ?? c.totalAssets,
      companyId: c.companyId,
    })),
  [data]);

  const op = (id: number) => selected === null ? 1 : selected === id ? 1 : 0.2;

  return (
    <ChartCard
      title="Assets usados vs límite del plan"
      subtitle="Cada empresa muestra dos barras — uso real y capacidad contratada"
    >
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
            barCategoryGap="30%"
            barGap={3}
            onClick={(e) => {
              const id = e?.activePayload?.[0]?.payload?.companyId;
              if (id !== undefined) onSelect(selected === id ? null : id);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.08)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: "#888780" }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#888780" }}
              axisLine={false} tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<BaseTooltip />} cursor={{ fill: "rgba(128,128,128,0.04)" }} />
            <Bar dataKey="usados" name="Usados" radius={[4, 4, 0, 0]} maxBarSize={22} style={{ cursor: "pointer" }}>
              {chartData.map(entry => (
                <Cell
                  key={entry.companyId}
                  fill="#3b82f6"
                  fillOpacity={op(entry.companyId)}
                />
              ))}
            </Bar>
            <Bar dataKey="limite" name="Límite" radius={[4, 4, 0, 0]} maxBarSize={22} style={{ cursor: "pointer" }}>
              {chartData.map(entry => (
                <Cell
                  key={entry.companyId}
                  fill="#d3d1c7"
                  fillOpacity={op(entry.companyId)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex gap-4">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
          <span className="text-[10px] text-gray-400">Assets usados</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-gray-300 dark:bg-gray-600" />
          <span className="text-[10px] text-gray-400">Límite del plan</span>
        </div>
      </div>
    </ChartCard>
  );
}

// ─── 3. Barras horizontales — saturación ─────────────────────────────────────

function SaturationChart({ data, selected, onSelect }: {
  data: FleetHealthItem[]; selected: number | null; onSelect: (id: number | null) => void;
}) {
  const chartData = useMemo(() =>
    [...data]
      .sort((a, b) => (b.saturation ?? 0) - (a.saturation ?? 0))
      .map(c => ({
        name: c.name.length > 16 ? c.name.slice(0, 15) + "…" : c.name,
        fullName: c.name,
        saturation: c.saturation ?? 0,
        companyId: c.companyId,
      })),
  [data]);

  const op = (id: number) => selected === null ? 1 : selected === id ? 1 : 0.2;

  return (
    <ChartCard title="Saturación por empresa" subtitle="Ordenado de mayor a menor uso del plan">
      <div style={{ height: Math.max(chartData.length * 34 + 24, 200) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 48, left: 4, bottom: 0 }}
            onClick={(e) => {
              const id = e?.activePayload?.[0]?.payload?.companyId;
              if (id !== undefined) onSelect(selected === id ? null : id);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.08)" horizontal={false} />
            <XAxis
              type="number" domain={[0, 100]}
              tick={{ fontSize: 10, fill: "#888780" }}
              tickFormatter={v => `${v}%`}
              axisLine={false} tickLine={false}
            />
            <YAxis
              type="category" dataKey="name" width={96}
              tick={{ fontSize: 10, fill: "#888780" }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<SatTooltip />} cursor={{ fill: "rgba(128,128,128,0.04)" }} />
            <ReferenceLine x={80} stroke="#ef9f27" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: "80%", fontSize: 9, fill: "#ef9f27", position: "insideTopRight" }} />
            <ReferenceLine x={90} stroke="#e24b4a" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: "90%", fontSize: 9, fill: "#e24b4a", position: "insideTopRight" }} />
            <Bar dataKey="saturation" name="Saturación" radius={[0, 4, 4, 0]} maxBarSize={20} style={{ cursor: "pointer" }}>
              {chartData.map(entry => (
                <Cell
                  key={entry.companyId}
                  fill={satColor(entry.saturation)}
                  fillOpacity={op(entry.companyId)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        {[
          { c: "#1d9e75", l: "Saludable < 60%" },
          { c: "#facc15", l: "Moderado 60–79%" },
          { c: "#ef9f27", l: "Cerca del límite 80–89%" },
          { c: "#e24b4a", l: "Saturado 90%+" },
        ].map(l => (
          <div key={l.l} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: l.c }} />
            <span className="text-[10px] text-gray-400">{l.l}</span>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

// ─── 4. Treemap — distribución por plan ──────────────────────────────────────

function PlanTreemap({ data, selected, onSelect }: {
  data: FleetHealthItem[]; selected: number | null; onSelect: (id: number | null) => void;
}) {
  const treemapData = useMemo(() =>
    TIER_ORDER
      .filter(tier => data.some(c => c.tier === tier))
      .flatMap(tier =>
        data
          .filter(c => c.tier === tier)
          .map(c => ({
            name: c.name,
            size: Math.max(c.totalAssets, 1),
            saturation: c.saturation ?? 0,
            companyId: c.companyId,
            tier,
          }))
      ),
  [data]);

  const CustomContent = ({ x, y, width, height, name, saturation, companyId }: any) => {
    if (!width || !height || width < 20 || height < 16) return null;
    const isSelected = selected === companyId;
    const isFaded    = selected !== null && !isSelected;
    const fill       = satColor(saturation);
    return (
      <g
        onClick={() => onSelect(selected === companyId ? null : companyId)}
        style={{ cursor: "pointer", opacity: isFaded ? 0.2 : 1, transition: "opacity 0.2s" }}
      >
        <rect
          x={x + 1} y={y + 1} width={width - 2} height={height - 2}
          rx={6}
          fill={fill} fillOpacity={isSelected ? 0.3 : 0.12}
          stroke={fill}
          strokeWidth={isSelected ? 2 : 0.5}
          strokeOpacity={isSelected ? 1 : 0.4}
        />
        {width > 36 && height > 22 && (
          <>
            <text
              x={x + 8} y={y + height / 2 - 5}
              fontSize={Math.min(11, width / 8)}
              fontWeight={500}
              fill={fill}
            >
              {name.length > Math.floor(width / 7) ? name.slice(0, Math.floor(width / 7)) + "…" : name}
            </text>
            <text
              x={x + 8} y={y + height / 2 + 8}
              fontSize={10}
              fill={fill}
              fillOpacity={0.7}
            >
              {saturation}%
            </text>
          </>
        )}
      </g>
    );
  };

  return (
    <ChartCard
      title="Distribución por plan"
      subtitle="El área de cada bloque refleja el volumen de assets — color indica saturación"
    >
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={treemapData}
            dataKey="size"
            nameKey="name"
            content={<CustomContent />}
            isAnimationActive
          />
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        {TIER_ORDER.filter(t => data.some(c => c.tier === t)).map(tier => (
          <div key={tier} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: TIER_COLORS[tier] }} />
            <span className="text-[10px] text-gray-400">{TIER_LABELS[tier]}</span>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

// ─── Charts Tab ───────────────────────────────────────────────────────────────

function ChartsTab({ data, selected, onSelect, monthLabels }: {
  data: FleetHealthItem[];
  selected: number | null;
  onSelect: (id: number | null) => void;
  monthLabels: string[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <AssetGrowthChart    data={data} selected={selected} onSelect={onSelect} monthLabels={monthLabels} />
      <AssetsVsLimitChart  data={data} selected={selected} onSelect={onSelect} />
      <SaturationChart     data={data} selected={selected} onSelect={onSelect} />
      <PlanTreemap         data={data} selected={selected} onSelect={onSelect} />
    </div>
  );
}

// ─── Table Tab ────────────────────────────────────────────────────────────────

type SortKey = "name" | "planName" | "totalAssets" | "saturation" | "criticalAlerts" | "warningAlerts" | "status";
type SortDir = "asc" | "desc";

function TableTab({ data, selected, onSelect }: {
  data: FleetHealthItem[]; selected: number | null; onSelect: (id: number | null) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("saturation");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    if (selected) {
      const el = rowRefs.current.get(selected);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selected]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string")
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [data, sortKey, sortDir]);

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown size={10} className="text-gray-300" />;
    return sortDir === "asc"
      ? <ChevronUp size={10} className="text-brand-500" />
      : <ChevronDown size={10} className="text-brand-500" />;
  }

  function Th({ label, k }: { label: string; k: SortKey }) {
    return (
      <th
        onClick={() => handleSort(k)}
        className="cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <div className="flex items-center gap-1">{label}<SortIcon k={k} /></div>
      </th>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/50 dark:bg-white/[0.02]">
              <Th label="Empresa"   k="name"           />
              <Th label="Plan"      k="planName"        />
              <Th label="Assets"    k="totalAssets"     />
              <Th label="Saturación"k="saturation"      />
              <Th label="Críticas"  k="criticalAlerts"  />
              <Th label="Atención"  k="warningAlerts"   />
              <Th label="Estado"    k="status"          />
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, i) => {
              const isSelected = selected === item.companyId;
              const [bg, text] = avatarColor(item.name);
              const pct = item.saturation ?? 0;
              return (
                <motion.tr
                  key={item.companyId}
                  ref={el => { if (el) rowRefs.current.set(item.companyId, el); }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => onSelect(isSelected ? null : item.companyId)}
                  className={`cursor-pointer border-b border-gray-50 dark:border-white/[0.03] transition-colors
                    ${isSelected
                      ? "bg-brand-50 dark:bg-brand-500/[0.07]"
                      : "hover:bg-gray-50/80 dark:hover:bg-white/[0.02]"
                    }`}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold ${bg} ${text}`}>
                        {getInitials(item.name)}
                      </div>
                      <div>
                        <p className={`text-xs font-semibold ${isSelected ? "text-brand-700 dark:text-brand-300" : "text-gray-800 dark:text-white"}`}>
                          {item.name}
                        </p>
                        <p className="text-[10px] text-gray-400">{item.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: TIER_COLORS[(item.tier ?? "free") as FleetHealthTier] + "18",
                        color: TIER_COLORS[(item.tier ?? "free") as FleetHealthTier],
                      }}
                    >
                      {item.planName}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{item.totalAssets}</span>
                    <span className="text-[10px] text-gray-400">/{item.maxAssets ?? "?"}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(pct, 100)}%` }}
                          transition={{ duration: 0.6, delay: i * 0.02 }}
                          className="h-full rounded-full"
                          style={{ background: satColor(item.saturation) }}
                        />
                      </div>
                      <span className={`text-xs font-bold ${satTextClass(item.saturation)}`}>
                        {item.saturation !== null ? `${item.saturation}%` : "--"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {item.criticalAlerts > 0 ? (
                      <span className="flex w-fit items-center gap-1 rounded-lg bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                        <AlertOctagon size={9} />{item.criticalAlerts}
                      </span>
                    ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {item.warningAlerts > 0 ? (
                      <span className="flex w-fit items-center gap-1 rounded-lg bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                        <AlertTriangle size={9} />{item.warningAlerts}
                      </span>
                    ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize
                      ${item.status === "active"    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : ""}
                      ${item.status === "trial"     ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400" : ""}
                      ${item.status === "suspended" ? "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400" : ""}
                      ${item.status === "inactive"  ? "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400" : ""}
                    `}>
                      {item.status}
                    </span>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && (
        <div className="flex h-48 flex-col items-center justify-center gap-2">
          <Layers size={24} className="text-gray-300" />
          <p className="text-sm text-gray-400">Sin empresas registradas</p>
        </div>
      )}
      <div className="border-t border-gray-100 px-4 py-2.5 dark:border-white/[0.05]">
        <p className="text-[11px] text-gray-400">{sorted.length} empresa{sorted.length !== 1 ? "s" : ""}</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function FleetHealthPage() {
  const { data, loading, error, refetch, generatedAt, monthLabels } = useFleetHealth();
  const [activeTab, setActiveTab] = useState<"charts" | "table">("charts");
  const [selected,  setSelected]  = useState<number | null>(null);

  const totalCritical = useMemo(() => data.reduce((s, c) => s + c.criticalAlerts, 0), [data]);
  const nearLimit     = useMemo(() => data.filter(c => c.nearLimit).length, [data]);
  const healthy       = useMemo(() => data.filter(c => !c.nearLimit && c.criticalAlerts === 0).length, [data]);
  const selectedCompany = useMemo(() => selected ? data.find(c => c.companyId === selected) : null, [data, selected]);

  return (
    <div className="space-y-6">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-cyan-200 dark:border-cyan-500/20 bg-cyan-50 dark:bg-cyan-500/10 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
            <span className="text-xs font-medium text-cyan-700 dark:text-cyan-400">Superadmin</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Flotas</h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Salud operativa de todos los tenants en tiempo real.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {generatedAt && (
            <span className="text-[11px] text-gray-400">
              {fmtTimeEc(generatedAt)}
            </span>
          )}
          <button
            type="button" onClick={refetch} disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </motion.div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: <Layers size={15} />,       label: "Empresas",        value: data.length,   accent: "text-brand-600 dark:text-brand-400",     bg: "bg-brand-50 dark:bg-brand-500/10"    },
          { icon: <AlertOctagon size={15} />, label: "Alertas críticas", value: totalCritical, accent: "text-rose-600 dark:text-rose-400",       bg: "bg-rose-50 dark:bg-rose-500/10"      },
          { icon: <TrendingUp size={15} />,   label: "Cerca del límite", value: nearLimit,     accent: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-50 dark:bg-amber-500/10"    },
          { icon: <Activity size={15} />,     label: "Saludables",       value: healthy,       accent: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
        ].map((s, i) => (
          <motion.div key={s.label}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.07 }}
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]"
          >
            <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-lg ${s.bg} ${s.accent}`}>{s.icon}</div>
            <p className="text-[11px] text-gray-400">{s.label}</p>
            <p className={`text-2xl font-bold ${s.accent}`}>{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Selected banner */}
      <AnimatePresence>
        {selectedCompany && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 dark:border-brand-500/20 dark:bg-brand-500/[0.07]">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
                <span className="text-xs font-semibold text-brand-700 dark:text-brand-300">{selectedCompany.name}</span>
                <span className="text-xs text-brand-500">
                  — {selectedCompany.saturation ?? "--"}% saturación · {selectedCompany.criticalAlerts} críticas · {selectedCompany.totalAssets}/{selectedCompany.maxAssets ?? "?"} assets
                </span>
              </div>
              <button type="button" onClick={() => setSelected(null)}
                className="text-[11px] text-brand-500 hover:text-brand-700 transition-colors"
              >
                Limpiar selección
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 w-fit dark:border-white/[0.06] dark:bg-white/[0.03]">
        {([
          { key: "charts", label: "Gráficas", icon: <BarChart3 size={13} /> },
          { key: "table",  label: "Tabla",    icon: <Table2 size={13} /> },
        ] as const).map(tab => (
          <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all
              ${activeTab === tab.key
                ? "bg-white shadow-sm text-gray-800 dark:bg-white/[0.08] dark:text-white"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/[0.07] dark:text-rose-400">
          {error}
        </div>
      )}

      {/* Content */}
      <AnimatePresence mode="wait">
        {activeTab === "charts" && (
          <motion.div key="charts"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
          >
            <ChartsTab data={data} selected={selected} onSelect={setSelected} monthLabels={monthLabels} />
          </motion.div>
        )}
        {activeTab === "table" && (
          <motion.div key="table"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
          >
            <TableTab data={data} selected={selected} onSelect={setSelected} />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}